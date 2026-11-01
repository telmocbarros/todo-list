import { createHash, randomBytes } from 'node:crypto';
import { UnauthorizedError } from '../errors.js';
import { cleanText } from '../input.js';
import { type TPublicUser, toPublicUser } from '../users/user.model.js';
import type { IUserRepository } from '../users/user.repository.js';
import type { LoginDTO } from './auth.dto.js';
import type { IPasswordHasher } from './password-hasher.js';
import type { ISessionRepository } from './session.repository.js';

const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const INVALID_CREDENTIALS = 'Invalid email or password';

/** Sessions are stored by a hash of their token, so a leaked database cannot be used to sign in. */
const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export interface IAuthOptions {
  now?: () => Date;
  sessionTtlMs?: number;
}

export interface ILoginResult {
  token: string;
  expiresAt: string;
  user: TPublicUser;
}

export class AuthService {
  private readonly now: () => Date;
  private readonly sessionTtlMs: number;
  /** Verified against when the email is unknown, so that failure costs the same as a wrong password. */
  private readonly dummyHash: Promise<string>;

  constructor(
    private readonly users: IUserRepository,
    private readonly sessions: ISessionRepository,
    private readonly hasher: IPasswordHasher,
    { now = () => new Date(), sessionTtlMs = DEFAULT_SESSION_TTL_MS }: IAuthOptions = {},
  ) {
    this.now = now;
    this.sessionTtlMs = sessionTtlMs;
    this.dummyHash = hasher.hash(randomBytes(16).toString('hex'));
  }

  async login({ email, password }: LoginDTO): Promise<ILoginResult> {
    const user = await this.users.findByEmail(cleanText(email).toLowerCase());
    const passwordHash = user?.passwordHash ?? (await this.dummyHash);
    const valid = await this.hasher.verify(passwordHash, password);
    if (!user || !valid) throw new UnauthorizedError(INVALID_CREDENTIALS);

    const token = randomBytes(32).toString('base64url');
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + this.sessionTtlMs).toISOString();
    await this.sessions.save({
      id: hashToken(token),
      userId: user.id,
      createdAt: createdAt.toISOString(),
      expiresAt,
    });
    return { token, expiresAt, user: toPublicUser(user) };
  }

  /** The signed-in user for a session token, or undefined if it is unknown or expired. */
  async authenticate(token: string): Promise<TPublicUser | undefined> {
    const session = await this.sessions.findById(hashToken(token));
    if (!session) return undefined;
    if (new Date(session.expiresAt) <= this.now()) {
      await this.sessions.delete(session.id);
      return undefined;
    }
    const user = await this.users.findById(session.userId);
    return user && toPublicUser(user);
  }

  async logout(token: string): Promise<void> {
    await this.sessions.delete(hashToken(token));
  }
}
