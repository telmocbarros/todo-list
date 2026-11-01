import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UnauthorizedError } from '../errors.js';
import { createTestRepositories } from '../test/repositories.js';
import { UserService } from '../users/user.service.js';
import { AuthService } from './auth.service.js';
import { type IPasswordHasher, PasswordHasher } from './password-hasher.js';
import type { ISessionRepository } from './session.repository.js';

const DAY = 24 * 60 * 60 * 1000;
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** The real hasher, counting verify calls, to prove login does the same work for unknown emails. */
class CountingHasher implements IPasswordHasher {
  verifyCalls = 0;
  private readonly inner = new PasswordHasher();
  hash(password: string) {
    return this.inner.hash(password);
  }
  verify(passwordHash: string, password: string) {
    this.verifyCalls++;
    return this.inner.verify(passwordHash, password);
  }
}

describe('AuthService', () => {
  const password = 'correct horse battery staple';
  let now: Date;
  let hasher: CountingHasher;
  let sessions: ISessionRepository;
  let auth: AuthService;
  let closeDatabase: () => void;

  beforeEach(async () => {
    const { userRepository, sessionRepository, close } = await createTestRepositories();
    closeDatabase = close;
    sessions = sessionRepository;
    hasher = new CountingHasher();
    now = new Date('2030-01-01T00:00:00.000Z');
    auth = new AuthService(userRepository, sessionRepository, hasher, { now: () => now });
    await new UserService(userRepository, hasher).signup({
      email: 'ada@example.com',
      username: 'ada',
      firstName: 'Ada',
      lastName: 'Lovelace',
      password,
    });
    hasher.verifyCalls = 0;
  });

  afterEach(() => closeDatabase());

  describe('login', () => {
    it('returns a session token, its expiry 30 days out, and the user without the password hash', async () => {
      const { token, expiresAt, user } = await auth.login({ email: 'ada@example.com', password });
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 random bytes, base64url
      expect(expiresAt).toBe(new Date(now.getTime() + 30 * DAY).toISOString());
      expect(user.email).toBe('ada@example.com');
      expect(user).not.toHaveProperty('passwordHash');
    });

    it('stores only a SHA-256 hash of the token, never the token itself', async () => {
      const { token } = await auth.login({ email: 'ada@example.com', password });
      expect(await sessions.findById(token)).toBeUndefined();
      expect(await sessions.findById(sha256(token))).toBeDefined();
    });

    it('gives each login its own token', async () => {
      const a = await auth.login({ email: 'ada@example.com', password });
      const b = await auth.login({ email: 'ada@example.com', password });
      expect(a.token).not.toBe(b.token);
    });

    it('matches the email ignoring case and surrounding spaces', async () => {
      const { user } = await auth.login({ email: '  ADA@Example.com ', password });
      expect(user.username).toBe('ada');
    });

    it('rejects a wrong password and an unknown email with the same error', async () => {
      const wrong = await auth.login({ email: 'ada@example.com', password: 'nope' }).catch((e: Error) => e);
      const unknown = await auth.login({ email: 'nobody@example.com', password }).catch((e: Error) => e);
      expect(wrong).toBeInstanceOf(UnauthorizedError);
      expect(unknown).toBeInstanceOf(UnauthorizedError);
      expect((wrong as Error).message).toBe('Invalid email or password');
      expect((unknown as Error).message).toBe((wrong as Error).message);
    });

    it('still checks a password when the email is unknown, so both failures take the same time', async () => {
      await auth.login({ email: 'nobody@example.com', password }).catch(() => {});
      expect(hasher.verifyCalls).toBe(1);
      await auth.login({ email: 'ada@example.com', password: 'nope' }).catch(() => {});
      expect(hasher.verifyCalls).toBe(2);
    });
  });

  describe('authenticate', () => {
    it('returns the user for a valid token', async () => {
      const { token } = await auth.login({ email: 'ada@example.com', password });
      const user = await auth.authenticate(token);
      expect(user?.email).toBe('ada@example.com');
      expect(user).not.toHaveProperty('passwordHash');
    });

    it('returns undefined for an unknown token', async () => {
      expect(await auth.authenticate('not-a-real-token')).toBeUndefined();
    });

  });

  describe('timeouts: 7 days idle, 30 days absolute', () => {
    const HOUR = 60 * 60 * 1000;
    let token: string;
    let loggedInAt: number;

    const advanceTo = (msAfterLogin: number) => {
      now = new Date(loggedInAt + msAfterLogin);
    };
    const storedExpiry = async () => (await sessions.findById(sha256(token)))?.expiresAt;

    beforeEach(async () => {
      loggedInAt = now.getTime();
      ({ token } = await auth.login({ email: 'ada@example.com', password }));
    });

    it('accepts an unused session just before the idle timeout', async () => {
      advanceTo(7 * DAY - 1);
      expect(await auth.authenticate(token)).toBeDefined();
    });

    it('expires a session left unused for 7 days, and deletes it', async () => {
      advanceTo(7 * DAY);
      expect(await auth.authenticate(token)).toBeUndefined();
      expect(await storedExpiry()).toBeUndefined();
    });

    it('keeps a session alive while it is being used', async () => {
      advanceTo(6 * DAY);
      expect(await auth.authenticate(token)).toBeDefined();
      advanceTo(12 * DAY); // 12 days after login, but only 6 since last use
      expect(await auth.authenticate(token)).toBeDefined();
    });

    it('ends even an active session 30 days after login', async () => {
      for (const day of [6, 12, 18, 24, 29]) {
        advanceTo(day * DAY);
        expect(await auth.authenticate(token)).toBeDefined();
      }
      advanceTo(30 * DAY); // used one day ago, but the absolute cap is reached
      expect(await auth.authenticate(token)).toBeUndefined();
      expect(await storedExpiry()).toBeUndefined();
    });

    it('never slides the idle deadline past the absolute cap', async () => {
      // Used every 6 days so it never idles out; on day 29, now + 7 days would overshoot the cap
      for (const day of [6, 12, 18, 24, 29]) {
        advanceTo(day * DAY);
        expect(await auth.authenticate(token)).toBeDefined();
      }
      expect(await storedExpiry()).toBe(new Date(loggedInAt + 30 * DAY).toISOString());
    });

    it('refreshes the idle deadline at most once an hour, to avoid a database write per request', async () => {
      const atLogin = await storedExpiry();
      advanceTo(30 * 60 * 1000); // half an hour later: not refreshed yet
      await auth.authenticate(token);
      expect(await storedExpiry()).toBe(atLogin);

      advanceTo(HOUR + 1); // over an hour since the deadline was set: refreshed
      await auth.authenticate(token);
      expect(await storedExpiry()).toBe(new Date(loggedInAt + HOUR + 1 + 7 * DAY).toISOString());
    });
  });

  describe('logout', () => {
    it('ends the session, so the token stops working', async () => {
      const { token } = await auth.login({ email: 'ada@example.com', password });
      await auth.logout(token);
      expect(await auth.authenticate(token)).toBeUndefined();
    });

    it('does nothing for an unknown token', async () => {
      await expect(auth.logout('not-a-real-token')).resolves.toBeUndefined();
    });
  });
});
