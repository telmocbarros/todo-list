import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AccountEmails } from '../email/account-emails.js';
import { ValidationError } from '../errors.js';
import { createTestDependencies } from '../test/dependencies.js';
import type { TestMailbox } from '../test/mailbox.js';
import type { IUserRepository } from '../users/user.repository.js';
import { EmailTokenService } from './email-token.service.js';
import { PasswordHasher } from './password-hasher.js';
import { PasswordResetService } from './password-reset.service.js';
import type { ISessionRepository } from './session.repository.js';

const OLD_PASSWORD = 'correct horse battery staple';
const NEW_PASSWORD = 'a brand new passphrase';

describe('PasswordResetService', () => {
  const hasher = new PasswordHasher();
  let users: IUserRepository;
  let sessions: ISessionRepository;
  let tokens: EmailTokenService;
  let mailbox: TestMailbox;
  let resets: PasswordResetService;
  let closeDatabase: () => void;

  const session = (id: string, userId: string) => ({
    id,
    userId,
    createdAt: '2030-01-01T00:00:00.000Z',
    expiresAt: '2030-01-08T00:00:00.000Z',
  });

  beforeEach(async () => {
    const deps = await createTestDependencies();
    closeDatabase = deps.close;
    users = deps.userRepository;
    sessions = deps.sessionRepository;
    mailbox = deps.emailSender;
    tokens = new EmailTokenService(deps.emailTokenRepository);
    resets = new PasswordResetService(users, sessions, hasher, tokens, new AccountEmails(mailbox, 'https://app.test'));

    for (const [id, verified] of [
      ['ada', '2030-01-01T00:00:00.000Z'],
      ['bob', null],
    ] as const) {
      await users.save({
        id,
        email: `${id}@example.com`,
        username: id,
        firstName: 'Test',
        lastName: 'User',
        passwordHash: await hasher.hash(OLD_PASSWORD),
        emailVerifiedAt: verified,
        createdAt: '2030-01-01T00:00:00.000Z',
        updatedAt: '2030-01-01T00:00:00.000Z',
      });
    }
  });

  afterEach(() => closeDatabase());

  describe('requestReset', () => {
    it('emails a reset link to a known address, ignoring case and spaces', async () => {
      await resets.requestReset('  ADA@example.com ');
      const [message] = mailbox.to('ada@example.com');
      expect(message.text).toMatch(/https:\/\/app\.test\/reset-password\?token=[\w-]{43}/);
    });

    it('sends nothing for an unknown address, and does not say so', async () => {
      await expect(resets.requestReset('nobody@example.com')).resolves.toBeUndefined();
      expect(mailbox.sent).toHaveLength(0);
    });
  });

  describe('reset', () => {
    const resetLink = async (email = 'ada@example.com') => {
      await resets.requestReset(email);
      return mailbox.lastToken(email);
    };

    it('sets the new password, so the old one stops working', async () => {
      await resets.reset(await resetLink(), NEW_PASSWORD);
      const { passwordHash } = (await users.findById('ada'))!;
      expect(await hasher.verify(passwordHash, NEW_PASSWORD)).toBe(true);
      expect(await hasher.verify(passwordHash, OLD_PASSWORD)).toBe(false);
    });

    it('ends every session of that user, and only theirs', async () => {
      await sessions.save(session('ada-laptop', 'ada'));
      await sessions.save(session('ada-phone', 'ada'));
      await sessions.save(session('bob-laptop', 'bob'));

      await resets.reset(await resetLink(), NEW_PASSWORD);

      expect(await sessions.findById('ada-laptop')).toBeUndefined();
      expect(await sessions.findById('ada-phone')).toBeUndefined();
      expect(await sessions.findById('bob-laptop')).toBeDefined();
    });

    it('marks an unverified email verified, since following the link proves the address', async () => {
      await resets.reset(await resetLink('bob@example.com'), NEW_PASSWORD);
      expect((await users.findById('bob'))?.emailVerifiedAt).toEqual(expect.any(String));
    });

    it('rejects a link used twice, a verification link, or one never sent', async () => {
      const token = await resetLink();
      await resets.reset(token, NEW_PASSWORD);
      await expect(resets.reset(token, 'yet another passphrase')).rejects.toBeInstanceOf(ValidationError);

      const verifyToken = await tokens.issue('ada', 'verify');
      await expect(resets.reset(verifyToken, NEW_PASSWORD)).rejects.toBeInstanceOf(ValidationError);
      await expect(resets.reset('made-up', NEW_PASSWORD)).rejects.toBeInstanceOf(ValidationError);
    });
  });
});
