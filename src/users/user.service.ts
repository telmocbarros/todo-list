import { randomUUID } from 'node:crypto';
import type { EmailTokenService } from '../auth/email-token.service.js';
import type { IPasswordHasher } from '../auth/password-hasher.js';
import type { AccountEmails } from '../email/account-emails.js';
import { NotFoundError, ValidationError } from '../errors.js';
import { cleanText } from '../input.js';
import type { SignupDTO } from './user.dto.js';
import { type TPublicUser, toPublicUser } from './user.model.js';
import type { IUserRepository } from './user.repository.js';

const normalizeEmail = (email: string): string => cleanText(email).toLowerCase();

export class UserService {
  constructor(
    private readonly repository: IUserRepository,
    private readonly hasher: IPasswordHasher,
    private readonly tokens: EmailTokenService,
    private readonly emails: AccountEmails,
  ) {}

  /**
   * Creates an unverified account and emails a verification link. Every outcome looks the same to the
   * caller, and costs the same, so signup cannot be used to find out which emails have accounts:
   * a taken email or username is reported to the inbox instead.
   */
  async signup({ email, username, firstName, lastName, password }: SignupDTO): Promise<void> {
    const normalizedEmail = normalizeEmail(email);
    const cleanedUsername = cleanText(username);
    const passwordHash = await this.hasher.hash(password);

    if (await this.repository.findByEmail(normalizedEmail)) {
      return this.emails.signupAttempt(normalizedEmail);
    }
    if (await this.repository.findByUsername(cleanedUsername)) {
      return this.emails.usernameTaken(normalizedEmail, cleanedUsername);
    }

    const now = new Date().toISOString();
    const user = await this.repository.save({
      id: randomUUID(),
      email: normalizedEmail,
      username: cleanedUsername,
      firstName: cleanText(firstName),
      lastName: cleanText(lastName),
      passwordHash,
      emailVerifiedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await this.emails.verifyEmail(user.email, await this.tokens.issue(user.id, 'verify'));
  }

  async verifyEmail(token: string): Promise<void> {
    const userId = await this.tokens.consume('verify', token);
    const user = userId && (await this.repository.findById(userId));
    if (!user) throw new ValidationError('This link is invalid or has expired');
    if (user.emailVerifiedAt) return;

    const now = new Date().toISOString();
    await this.repository.save({ ...user, emailVerifiedAt: now, updatedAt: now });
  }

  /** Sends a fresh link if the email belongs to an unverified account; otherwise does nothing, silently. */
  async resendVerification(email: string): Promise<void> {
    const user = await this.repository.findByEmail(normalizeEmail(email));
    if (!user || user.emailVerifiedAt) return;
    await this.emails.verifyEmail(user.email, await this.tokens.issue(user.id, 'verify'));
  }

  async get(id: string): Promise<TPublicUser> {
    const user = await this.repository.findById(id);
    if (!user) throw new NotFoundError('User');
    return toPublicUser(user);
  }
}
