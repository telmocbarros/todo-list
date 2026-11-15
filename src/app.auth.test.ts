import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { signUpAndLogIn as signUpAndLogInAs } from './test/auth.js';
import type { TestMailbox } from './test/mailbox.js';
import { createTestDependencies } from './test/dependencies.js';

const signup = {
  email: 'ada@example.com',
  username: 'ada',
  firstName: 'Ada',
  lastName: 'Lovelace',
  password: 'correct horse battery staple',
};

const CHECK_EMAIL = { message: 'Check your email to continue' };

describe('auth API', () => {
  let app: FastifyInstance;
  let mailbox: TestMailbox;
  let closeDatabase: () => void;

  beforeEach(async () => {
    const { close, ...repositories } = await createTestDependencies();
    closeDatabase = close;
    mailbox = repositories.emailSender;
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
  const signUpAndLogIn = async () => (await signUpAndLogInAs(app, mailbox)).sid;
  const login = () => post('/auth/login', { email: signup.email, password: signup.password });
  const verify = (token = mailbox.lastToken(signup.email)) => post('/auth/verify-email', { token });

  describe('POST /auth/signup', () => {
    it('accepts the signup (202), emails a verification link, and does not sign in', async () => {
      const res = await post('/auth/signup', signup);
      expect(res.statusCode).toBe(202);
      expect(res.json()).toEqual(CHECK_EMAIL);
      expect(sessionCookie(res)).toBeUndefined();
      expect(mailbox.lastToken(signup.email)).toMatch(/^[\w-]{43}$/);
    });

    it('answers a taken email or username exactly like a new signup, telling the inbox instead', async () => {
      await post('/auth/signup', signup);
      const byEmail = await post('/auth/signup', { ...signup, username: 'other' });
      const byUsername = await post('/auth/signup', { ...signup, email: 'other@example.com' });
      for (const res of [byEmail, byUsername]) {
        expect(res.statusCode).toBe(202);
        expect(res.json()).toEqual(CHECK_EMAIL);
      }
      expect(mailbox.to(signup.email)).toHaveLength(2); // the link, then the "someone tried" notice
      expect(mailbox.to('other@example.com')).toHaveLength(1); // "choose another username"
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
      expect((await post('/auth/signup', { ...signup, isAdmin: true })).statusCode).toBe(202);
      await verify();
      const sid = sessionCookie(await login())!.value;
      expect((await me({ sid })).json()).not.toHaveProperty('isAdmin');
    });

    it('accepts the boundary values: 12 and 128 character passwords, 3 and 32 character usernames', async () => {
      const cases = [
        { password: 'p'.repeat(12), username: 'abc' },
        { password: 'p'.repeat(128), username: 'b'.repeat(32) },
      ];
      for (const [i, overrides] of cases.entries()) {
        const res = await post('/auth/signup', { ...signup, email: `u${i}@example.com`, ...overrides });
        expect(res.statusCode).toBe(202);
        expect(mailbox.lastToken(`u${i}@example.com`)).toBeTruthy();
      }
    });

    it('accepts usernames with accented letters, digits, dots, dashes and underscores', async () => {
      const res = await post('/auth/signup', { ...signup, username: 'José_99.dev-x' });
      expect(res.statusCode).toBe(202);
      expect(mailbox.lastToken(signup.email)).toBeTruthy();
    });
  });

  describe('POST /auth/verify-email', () => {
    beforeEach(async () => {
      await post('/auth/signup', signup);
    });

    it('verifies the email (204), after which login works', async () => {
      expect((await login()).statusCode).toBe(403);
      expect((await verify()).statusCode).toBe(204);
      expect((await login()).statusCode).toBe(200);
    });

    it('rejects a link used twice, or one never sent (400)', async () => {
      const token = mailbox.lastToken(signup.email);
      await verify(token);
      const reused = await verify(token);
      expect(reused.statusCode).toBe(400);
      expect(reused.json()).toEqual({ error: 'This link is invalid or has expired' });
      expect((await verify('A'.repeat(43))).statusCode).toBe(400);
    });

    it.each([
      ['a missing token', {}],
      ['a token with characters outside base64url', { token: '<script>' }],
      ['a token over 64 characters', { token: 'a'.repeat(65) }],
    ])('rejects %s (400)', async (_label, payload) => {
      expect((await post('/auth/verify-email', payload)).statusCode).toBe(400);
    });
  });

  describe('POST /auth/resend-verification', () => {
    it('sends a fresh link to an unverified account (202)', async () => {
      await post('/auth/signup', signup);
      const old = mailbox.lastToken(signup.email);
      const res = await post('/auth/resend-verification', { email: signup.email });
      expect(res.statusCode).toBe(202);
      expect(res.json()).toEqual(CHECK_EMAIL);
      expect(mailbox.lastToken(signup.email)).not.toBe(old);
    });

    it('answers an unknown or verified email the same way, sending nothing', async () => {
      await signUpAndLogIn();
      const sentBefore = mailbox.sent.length;
      for (const email of [signup.email, 'nobody@example.com']) {
        const res = await post('/auth/resend-verification', { email });
        expect(res.statusCode).toBe(202);
        expect(res.json()).toEqual(CHECK_EMAIL);
      }
      expect(mailbox.sent).toHaveLength(sentBefore);
    });

    it('rejects a missing or oversized email (400)', async () => {
      expect((await post('/auth/resend-verification', {})).statusCode).toBe(400);
      expect((await post('/auth/resend-verification', { email: `${'a'.repeat(245)}@example.com` })).statusCode).toBe(
        400,
      );
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await post('/auth/signup', signup);
      await verify();
    });

    it('signs in (200), returns the user, and sets a secure session cookie', async () => {
      const res = await login();
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ email: 'ada@example.com', emailVerifiedAt: expect.any(String) });
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

    it('returns 403 for an unverified email with the right password, and the generic 401 otherwise', async () => {
      await post('/auth/signup', { ...signup, email: 'new@example.com', username: 'newbie' });

      const right = await post('/auth/login', { email: 'new@example.com', password: signup.password });
      expect(right.statusCode).toBe(403);
      expect(right.json()).toEqual({
        error: 'Email not verified: follow the link we sent you, or ask for a new one',
      });
      expect(sessionCookie(right)).toBeUndefined();

      const wrong = await post('/auth/login', { email: 'new@example.com', password: 'wrong password!' });
      expect(wrong.statusCode).toBe(401);
      expect(wrong.json()).toEqual({ error: 'Invalid email or password' });
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
