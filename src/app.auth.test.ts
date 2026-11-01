import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { createTestRepositories } from './test/repositories.js';

const signup = {
  email: 'ada@example.com',
  username: 'ada',
  firstName: 'Ada',
  lastName: 'Lovelace',
  password: 'correct horse battery staple',
};

describe('auth API', () => {
  let app: FastifyInstance;
  let closeDatabase: () => void;

  beforeEach(async () => {
    const { close, ...repositories } = await createTestRepositories();
    closeDatabase = close;
    app = buildApp(repositories);
  });

  afterEach(async () => {
    await app.close();
    closeDatabase();
  });

  const post = (url: string, payload: object, cookies?: Record<string, string>) =>
    app.inject({ method: 'POST', url, payload, cookies });
  const me = (cookies?: Record<string, string>) => app.inject({ method: 'GET', url: '/me', cookies });
  const sessionCookie = (res: LightMyRequestResponse) => res.cookies.find((c) => c.name === 'sid');
  const signUpAndLogIn = async () => {
    await post('/auth/signup', signup);
    const res = await post('/auth/login', { email: signup.email, password: signup.password });
    return sessionCookie(res)!.value;
  };

  describe('POST /auth/signup', () => {
    it('creates an account (201) without the password hash, and does not sign in', async () => {
      const res = await post('/auth/signup', signup);
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ email: 'ada@example.com', username: 'ada' });
      expect(res.json()).not.toHaveProperty('passwordHash');
      expect(res.json()).not.toHaveProperty('password');
      expect(sessionCookie(res)).toBeUndefined();
    });

    it('returns one generic 409 for a taken email or username', async () => {
      await post('/auth/signup', signup);
      const byEmail = await post('/auth/signup', { ...signup, username: 'other' });
      const byUsername = await post('/auth/signup', { ...signup, email: 'other@example.com' });
      expect(byEmail.statusCode).toBe(409);
      expect(byUsername.statusCode).toBe(409);
      expect(byEmail.json()).toEqual(byUsername.json());
    });

    it.each([
      ['a missing field', { ...signup, lastName: undefined }],
      ['an invalid email', { ...signup, email: 'not-an-email' }],
      ['an email over 254 characters', { ...signup, email: `${'a'.repeat(245)}@example.com` }],
      ['a password under 12 characters', { ...signup, password: 'a'.repeat(11) }],
      ['a password over 128 characters', { ...signup, password: 'a'.repeat(129) }],
      ['a username under 3 characters', { ...signup, username: 'ab' }],
      ['a username over 32 characters', { ...signup, username: 'a'.repeat(33) }],
      ['a username with spaces or symbols', { ...signup, username: 'ada lovelace!' }],
      ['a first name over 100 characters', { ...signup, firstName: 'a'.repeat(101) }],
      ['a name with a line break', { ...signup, lastName: 'Love\nlace' }],
    ])('rejects %s (400)', async (_label, payload) => {
      const res = await post('/auth/signup', payload);
      expect(res.statusCode).toBe(400);
    });

    // Like every route here, unknown fields are stripped rather than rejected, so they can never be stored
    it('drops unknown fields such as isAdmin instead of storing them', async () => {
      const res = await post('/auth/signup', { ...signup, isAdmin: true });
      expect(res.statusCode).toBe(201);
      expect(res.json()).not.toHaveProperty('isAdmin');
    });

    it('accepts the boundary values: 12 and 128 character passwords, 3 and 32 character usernames', async () => {
      const cases = [
        { password: 'p'.repeat(12), username: 'abc' },
        { password: 'p'.repeat(128), username: 'b'.repeat(32) },
      ];
      for (const [i, overrides] of cases.entries()) {
        const res = await post('/auth/signup', { ...signup, email: `u${i}@example.com`, ...overrides });
        expect(res.statusCode).toBe(201);
      }
    });

    it('accepts usernames with accented letters, digits, dots, dashes and underscores', async () => {
      const res = await post('/auth/signup', { ...signup, username: 'José_99.dev-x' });
      expect(res.statusCode).toBe(201);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await post('/auth/signup', signup);
    });

    it('signs in (200), returns the user, and sets a secure session cookie', async () => {
      const res = await post('/auth/login', { email: signup.email, password: signup.password });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ email: 'ada@example.com' });
      expect(res.json()).not.toHaveProperty('passwordHash');

      const cookie = sessionCookie(res);
      expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
      expect(cookie?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(cookie?.expires).toBeInstanceOf(Date);
    });

    it('returns the same 401 for a wrong password and an unknown email, with no cookie', async () => {
      const wrong = await post('/auth/login', { email: signup.email, password: 'wrong password!' });
      const unknown = await post('/auth/login', { email: 'nobody@example.com', password: signup.password });
      expect(wrong.statusCode).toBe(401);
      expect(unknown.statusCode).toBe(401);
      expect(wrong.json()).toEqual({ error: 'Invalid email or password' });
      expect(unknown.json()).toEqual(wrong.json());
      expect(sessionCookie(wrong)).toBeUndefined();
    });

    it('rejects a password over 128 characters before hashing it (400)', async () => {
      const res = await post('/auth/login', { email: signup.email, password: 'a'.repeat(129) });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /me', () => {
    it('returns the signed-in user', async () => {
      const sid = await signUpAndLogIn();
      const res = await me({ sid });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ email: 'ada@example.com', username: 'ada' });
      expect(res.json()).not.toHaveProperty('passwordHash');
    });

    it('returns 401 without a session cookie', async () => {
      const res = await me();
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: 'Authentication required' });
    });

    it('returns 401 for a made-up session token', async () => {
      expect((await me({ sid: 'made-up-token' })).statusCode).toBe(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('ends the session (204), clears the cookie, and the old token stops working', async () => {
      const sid = await signUpAndLogIn();
      const res = await post('/auth/logout', {}, { sid });
      expect(res.statusCode).toBe(204);

      const cleared = sessionCookie(res);
      expect(cleared?.value).toBe('');
      expect(cleared?.expires?.getTime()).toBeLessThan(Date.now());

      expect((await me({ sid })).statusCode).toBe(401);
    });

    it('succeeds (204) even without a session', async () => {
      expect((await post('/auth/logout', {})).statusCode).toBe(204);
    });
  });
});
