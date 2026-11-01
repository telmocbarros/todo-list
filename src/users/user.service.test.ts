import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PasswordHasher } from '../auth/password-hasher.js';
import { ConflictError, NotFoundError } from '../errors.js';
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
  let closeDatabase: () => void;

  beforeEach(async () => {
    const { userRepository, close } = await createTestRepositories();
    repository = userRepository;
    closeDatabase = close;
    service = new UserService(userRepository, hasher);
  });

  afterEach(() => closeDatabase());

  describe('signup', () => {
    it('creates a user and returns it without the password hash', async () => {
      const user = await service.signup(signupDto());
      expect(user).toMatchObject({
        email: 'ada@example.com',
        username: 'ada',
        firstName: 'Ada',
        lastName: 'Lovelace',
      });
      expect(user.id).toBeTruthy();
      expect(user.createdAt).toBe(user.updatedAt);
      expect(user).not.toHaveProperty('passwordHash');
      expect(user).not.toHaveProperty('password');
    });

    it('stores an argon2id hash of the password, never the password itself', async () => {
      const { id } = await service.signup(signupDto());
      const stored = await repository.findById(id);
      expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
      expect(stored?.passwordHash).not.toContain('correct horse');
      expect(await hasher.verify(stored!.passwordHash, 'correct horse battery staple')).toBe(true);
    });

    it('trims names, trims and lowercases the email, and keeps the username case', async () => {
      const user = await service.signup(
        signupDto({ email: '  Ada@Example.COM ', username: ' AdaL ', firstName: ' Ada ', lastName: ' Lovelace ' }),
      );
      expect(user).toMatchObject({ email: 'ada@example.com', username: 'AdaL', firstName: 'Ada', lastName: 'Lovelace' });
    });

    it('rejects a duplicate email, ignoring case', async () => {
      await service.signup(signupDto());
      await expect(service.signup(signupDto({ email: 'ADA@example.com', username: 'other' }))).rejects.toBeInstanceOf(
        ConflictError,
      );
    });

    it('rejects a duplicate username, ignoring case', async () => {
      await service.signup(signupDto());
      await expect(service.signup(signupDto({ email: 'other@example.com', username: 'ADA' }))).rejects.toBeInstanceOf(
        ConflictError,
      );
    });

    it('gives the same message for a duplicate email and a duplicate username, so it does not reveal which exists', async () => {
      await service.signup(signupDto());
      const byEmail = await service.signup(signupDto({ username: 'other' })).catch((error: Error) => error);
      const byUsername = await service.signup(signupDto({ email: 'other@example.com' })).catch((error: Error) => error);
      expect(byEmail).toBeInstanceOf(ConflictError);
      expect(byUsername).toBeInstanceOf(ConflictError);
      expect((byEmail as Error).message).toBe((byUsername as Error).message);
    });
  });

  describe('get', () => {
    it('returns a user without the password hash', async () => {
      const { id } = await service.signup(signupDto());
      const user = await service.get(id);
      expect(user.email).toBe('ada@example.com');
      expect(user).not.toHaveProperty('passwordHash');
    });

    it('throws NotFoundError for an unknown id', async () => {
      await expect(service.get('nope')).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('unicode normalization', () => {
    it('stores username and names in NFC form', async () => {
      const user = await service.signup(
        signupDto({ username: 'José', firstName: 'José', lastName: 'García' }),
      );
      expect(user).toMatchObject({ username: 'José', firstName: 'José', lastName: 'García' });
    });

    it('treats look-alike usernames as the same account', async () => {
      await service.signup(signupDto({ username: 'José' }));
      await expect(
        service.signup(signupDto({ email: 'other@example.com', username: 'José' })),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });
});
