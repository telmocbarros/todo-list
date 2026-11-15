import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailTokenService } from '../auth/email-token.service.js';
import { PasswordHasher } from '../auth/password-hasher.js';
import { AccountEmails } from '../email/account-emails.js';
import { NotFoundError, ValidationError } from '../errors.js';
import { TestMailbox } from '../test/mailbox.js';
import { createTestRepositories } from '../test/repositories.js';
import type { SignupDTO } from './user.dto.js';
import type { IUserRepository } from './user.repository.js';
import { UserService } from './user.service.js';

const signupDto = (overrides: Partial<SignupDTO> = {}): SignupDTO => ({
  email: 'ada@example.com',
  username: 'ada',
  firstName: 'Ada',
  lastName: 'Lovelace',
  password: 'correct horse battery staple',
  ...overrides,
});

describe('UserService', () => {
  const hasher = new PasswordHasher();
  let service: UserService;
  let repository: IUserRepository;
  let mailbox: TestMailbox;
  let closeDatabase: () => void;

  beforeEach(async () => {
    const { userRepository, emailTokenRepository, close } = await createTestRepositories();
    repository = userRepository;
    closeDatabase = close;
    mailbox = new TestMailbox();
    service = new UserService(
      userRepository,
      hasher,
      new EmailTokenService(emailTokenRepository),
      new AccountEmails(mailbox, 'https://app.test'),
    );
  });

  afterEach(() => closeDatabase());

  /** Signs up and follows the verification link, returning the user's id. */
  const signUpVerified = async (dto = signupDto()) => {
    await service.signup(dto);
    await service.verifyEmail(mailbox.lastToken(dto.email.trim().toLowerCase()));
    return (await repository.findByEmail(dto.email))!.id;
  };

  describe('signup', () => {
    it('creates an unverified user and emails them a verification link', async () => {
      await service.signup(signupDto());
      const stored = await repository.findByEmail('ada@example.com');
      expect(stored).toMatchObject({ username: 'ada', firstName: 'Ada', lastName: 'Lovelace', emailVerifiedAt: null });
      expect(stored!.createdAt).toBe(stored!.updatedAt);

      const [message] = mailbox.to('ada@example.com');
      expect(message.text).toMatch(/https:\/\/app\.test\/verify-email\?token=[\w-]{43}/);
    });

    it('stores an argon2id hash of the password, never the password itself', async () => {
      await service.signup(signupDto());
      const stored = await repository.findByEmail('ada@example.com');
      expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
      expect(stored?.passwordHash).not.toContain('correct horse');
      expect(await hasher.verify(stored!.passwordHash, 'correct horse battery staple')).toBe(true);
    });

    it('trims names, trims and lowercases the email, and keeps the username case', async () => {
      await service.signup(
        signupDto({ email: '  Ada@Example.COM ', username: ' AdaL ', firstName: ' Ada ', lastName: ' Lovelace ' }),
      );
      expect(await repository.findByEmail('ada@example.com')).toMatchObject({
        email: 'ada@example.com',
        username: 'AdaL',
        firstName: 'Ada',
        lastName: 'Lovelace',
      });
    });

    it('for a taken email (any case), creates nothing and tells the owner instead, with no link to verify', async () => {
      const id = await signUpVerified();
      mailbox.sent.length = 0;

      await service.signup(signupDto({ email: 'ADA@example.com', username: 'other' }));

      expect(await repository.findByUsername('other')).toBeUndefined();
      expect((await repository.findById(id))?.username).toBe('ada');
      const [notice] = mailbox.to('ada@example.com');
      expect(notice.text).toContain('tried to sign up');
      expect(notice.text).not.toContain('token=');
    });

    it('for a taken username (any case), creates nothing and tells the new address to pick another', async () => {
      await signUpVerified();
      await service.signup(signupDto({ email: 'other@example.com', username: 'ADA' }));

      expect(await repository.findByEmail('other@example.com')).toBeUndefined();
      const [notice] = mailbox.to('other@example.com');
      expect(notice.text).toContain('ADA');
      expect(notice.text).not.toContain('token=');
    });

    it('hashes the password even when it creates nothing, so every outcome takes as long', async () => {
      await signUpVerified();
      const hash = vi.spyOn(hasher, 'hash');
      await service.signup(signupDto({ username: 'other' }));
      await service.signup(signupDto({ email: 'other@example.com' }));
      expect(hash).toHaveBeenCalledTimes(2);
      hash.mockRestore();
    });
  });

  describe('verifyEmail', () => {
    it('marks the email verified', async () => {
      const id = await signUpVerified();
      expect((await repository.findById(id))?.emailVerifiedAt).toEqual(expect.any(String));
    });

    it('rejects a link used twice, or one never sent', async () => {
      await service.signup(signupDto());
      const token = mailbox.lastToken('ada@example.com');
      await service.verifyEmail(token);
      await expect(service.verifyEmail(token)).rejects.toBeInstanceOf(ValidationError);
      await expect(service.verifyEmail('made-up')).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('resendVerification', () => {
    it('sends a new link to an unverified user and cancels the old one', async () => {
      await service.signup(signupDto());
      const old = mailbox.lastToken('ada@example.com');
      await service.resendVerification(' ADA@example.com ');
      const fresh = mailbox.lastToken('ada@example.com');

      expect(fresh).not.toBe(old);
      await expect(service.verifyEmail(old)).rejects.toBeInstanceOf(ValidationError);
      await service.verifyEmail(fresh);
    });

    it('sends nothing for an unknown or already verified email, and does not say so', async () => {
      await signUpVerified();
      mailbox.sent.length = 0;
      await expect(service.resendVerification('ada@example.com')).resolves.toBeUndefined();
      await expect(service.resendVerification('nobody@example.com')).resolves.toBeUndefined();
      expect(mailbox.sent).toHaveLength(0);
    });
  });

  describe('get', () => {
    it('returns a user without the password hash', async () => {
      const id = await signUpVerified();
      const user = await service.get(id);
      expect(user.email).toBe('ada@example.com');
      expect(user).not.toHaveProperty('passwordHash');
    });

    it('throws NotFoundError for an unknown id', async () => {
      await expect(service.get('nope')).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  // Escapes keep the two forms apart: editors and copy-paste silently turn one into the other
  describe('unicode normalization', () => {
    const decomposed = { jose: 'José', garcia: 'García' }; // e or i, then a combining accent
    const composed = { jose: 'José', garcia: 'García' }; // one accented character

    it('stores username and names in NFC form', async () => {
      await service.signup(
        signupDto({ username: decomposed.jose, firstName: decomposed.jose, lastName: decomposed.garcia }),
      );
      expect(await repository.findByEmail('ada@example.com')).toMatchObject({
        username: composed.jose,
        firstName: composed.jose,
        lastName: composed.garcia,
      });
    });

    it('treats look-alike usernames as the same account', async () => {
      await service.signup(signupDto({ username: composed.jose }));
      await service.signup(signupDto({ email: 'other@example.com', username: decomposed.jose }));
      expect(await repository.findByEmail('other@example.com')).toBeUndefined();
    });
  });
});
