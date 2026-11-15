import type { AccountEmails } from '../email/account-emails.js';
import { ValidationError } from '../errors.js';
import { cleanText } from '../input.js';
import type { IUserRepository } from '../users/user.repository.js';
import type { EmailTokenService } from './email-token.service.js';
import type { IPasswordHasher } from './password-hasher.js';
import type { ISessionRepository } from './session.repository.js';

/** "Forgot password": a reset link by email, then a new password that signs the user out everywhere. */
export class PasswordResetService {
  constructor(
    private readonly users: IUserRepository,
    private readonly sessions: ISessionRepository,
    private readonly hasher: IPasswordHasher,
    private readonly tokens: EmailTokenService,
    private readonly emails: AccountEmails,
  ) {}

  /** Emails a reset link if the address has an account; otherwise does nothing, silently. */
  async requestReset(email: string): Promise<void> {
    const user = await this.users.findByEmail(cleanText(email).toLowerCase());
    if (!user) return;
    await this.emails.passwordReset(user.email, await this.tokens.issue(user.id, 'reset'));
  }

  async reset(token: string, newPassword: string): Promise<void> {
    // The token is checked before hashing, so a made-up token cannot make the server run argon2
    const userId = await this.tokens.consume('reset', token);
    const user = userId && (await this.users.findById(userId));
    if (!user) throw new ValidationError('This link is invalid or has expired');

    const now = new Date().toISOString();
    await this.users.save({
      ...user,
      passwordHash: await this.hasher.hash(newPassword),
      // The link arrived at this address, which proves the user owns it
      emailVerifiedAt: user.emailVerifiedAt ?? now,
      updatedAt: now,
    });
    // Whoever knew the old password, or holds a session made with it, is shut out
    await this.sessions.deleteAllForUser(user.id);
  }
}
