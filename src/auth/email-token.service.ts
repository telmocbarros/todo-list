import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { TEmailTokenType } from './email-token.model.js';
import type { IEmailTokenRepository } from './email-token.repository.js';

const HOUR_MS = 60 * 60 * 1000;

/** How long each kind of link works. A reset link is shorter-lived, since it can take over the account. */
const TOKEN_LIFETIME_MS: Record<TEmailTokenType, number> = {
  verify: 24 * HOUR_MS,
  reset: HOUR_MS,
};

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export interface IEmailTokenOptions {
  now?: () => Date;
}

/** Issues the single-use tokens put in emailed links, and accepts each of them once. */
export class EmailTokenService {
  private readonly now: () => Date;

  constructor(
    private readonly repository: IEmailTokenRepository,
    { now = () => new Date() }: IEmailTokenOptions = {},
  ) {
    this.now = now;
  }

  /** A new token for the user, cancelling any unused one of the same type, so only the latest link works. */
  async issue(userId: string, type: TEmailTokenType): Promise<string> {
    await this.repository.deleteUnused(userId, type);
    const token = randomBytes(32).toString('base64url');
    const createdAt = this.now().getTime();
    await this.repository.save({
      id: randomUUID(),
      userId,
      type,
      tokenHash: hashToken(token),
      expiresAt: new Date(createdAt + TOKEN_LIFETIME_MS[type]).toISOString(),
      usedAt: null,
      createdAt: new Date(createdAt).toISOString(),
    });
    return token;
  }

  /** The id of the token's user, marking the token used; undefined if it is unknown, expired or already used. */
  async consume(type: TEmailTokenType, token: string): Promise<string | undefined> {
    const stored = await this.repository.findByHash(type, hashToken(token));
    if (!stored) return undefined;

    const now = this.now();
    if (now.getTime() >= new Date(stored.expiresAt).getTime()) return undefined;
    if (!(await this.repository.markUsed(stored.id, now.toISOString()))) return undefined;
    return stored.userId;
  }
}
