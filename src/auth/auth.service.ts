import { createHash, randomBytes } from 'node:crypto';
import { UnauthorizedError } from '../errors.js';
import { cleanText } from '../input.js';
import { type TPublicUser, toPublicUser } from '../users/user.model.js';
import type { IUserRepository } from '../users/user.repository.js';
import type { LoginDTO } from './auth.dto.js';
import type { IPasswordHasher } from './password-hasher.js';
import type { ISessionRepository } from './session.repository.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** A session dies after this long without being used. Each use pushes the deadline forward. */
const IDLE_TIMEOUT_MS = 7 * DAY_MS;
/** No session outlives this, however active, so even a stolen cookie in use dies eventually. */
const ABSOLUTE_TIMEOUT_MS = 30 * DAY_MS;
/** The idle deadline is only rewritten when it would move by more than this, to avoid a write per request. */
const REFRESH_INTERVAL_MS = HOUR_MS;

const INVALID_CREDENTIALS = 'Invalid email or password';

/** Sessions are stored by a hash of their token, so a leaked database cannot be used to sign in. */
const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export interface IAuthOptions {
  now?: () => Date;
}

export interface ILoginResult {
  token: string;
  /** The absolute cap: the latest the session can last, used as the cookie's expiry. */
  expiresAt: string;
  user: TPublicUser;
}

export class AuthService {
  private readonly now: () => Date;
  /** Verified against when the email is unknown, so that failure costs the same as a wrong password. */
  private readonly dummyHash: Promise<string>;

  constructor(
    private readonly users: IUserRepository,
    private readonly sessions: ISessionRepository,
    private readonly hasher: IPasswordHasher,
    { now = () => new Date() }: IAuthOptions = {},
  ) {
    this.now = now;
    this.dummyHash = hasher.hash(randomBytes(16).toString('hex'));
  }

  async login({ email, password }: LoginDTO): Promise<ILoginResult> {
    const user = await this.users.findByEmail(cleanText(email).toLowerCase());
    const passwordHash = user?.passwordHash ?? (await this.dummyHash);
    const valid = await this.hasher.verify(passwordHash, password);
    if (!user || !valid) throw new UnauthorizedError(INVALID_CREDENTIALS);

    const token = randomBytes(32).toString('base64url');
    const createdAt = this.now().getTime();
    const absoluteExpiry = createdAt + ABSOLUTE_TIMEOUT_MS;
    await this.sessions.save({
      id: hashToken(token),
      userId: user.id,
      createdAt: new Date(createdAt).toISOString(),
      expiresAt: new Date(Math.min(createdAt + IDLE_TIMEOUT_MS, absoluteExpiry)).toISOString(),
    });
    return { token, expiresAt: new Date(absoluteExpiry).toISOString(), user: toPublicUser(user) };
  }

  /** The signed-in user for a session token, or undefined if it is unknown, idle too long or past its cap. */
  async authenticate(token: string): Promise<TPublicUser | undefined> {
    const session = await this.sessions.findById(hashToken(token));
    if (!session) return undefined;

    const now = this.now().getTime();
    const idleExpiry = new Date(session.expiresAt).getTime();
    const absoluteExpiry = new Date(session.createdAt).getTime() + ABSOLUTE_TIMEOUT_MS;
    if (now >= idleExpiry || now >= absoluteExpiry) {
      await this.sessions.delete(session.id);
      return undefined;
    }

    // Slide the idle deadline forward, capped, but only when it moves enough to be worth a write
    const nextIdleExpiry = Math.min(now + IDLE_TIMEOUT_MS, absoluteExpiry);
    if (nextIdleExpiry - idleExpiry > REFRESH_INTERVAL_MS) {
      await this.sessions.updateExpiry(session.id, new Date(nextIdleExpiry).toISOString());
    }

    const user = await this.users.findById(session.userId);
    return user && toPublicUser(user);
  }

  async logout(token: string): Promise<void> {
    await this.sessions.delete(hashToken(token));
  }
}
