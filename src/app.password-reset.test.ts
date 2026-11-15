import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { signUpAndLogIn } from './test/auth.js';
import { createTestDependencies } from './test/dependencies.js';
import type { TestMailbox } from './test/mailbox.js';

const EMAIL = 'ada@example.com';
const OLD_PASSWORD = 'correct horse battery staple'; // the one signUpAndLogIn uses
const NEW_PASSWORD = 'a brand new passphrase';

describe('password reset API', () => {
  let app: FastifyInstance;
  let mailbox: TestMailbox;
  let sid: string;
  let closeDatabase: () => void;

  beforeEach(async () => {
    const { close, ...deps } = await createTestDependencies();
    closeDatabase = close;
    mailbox = deps.emailSender;
    app = buildApp(deps);
    ({ sid } = await signUpAndLogIn(app, mailbox, 'ada'));
  });

  afterEach(async () => {
    await app.close();
    closeDatabase();
  });

  const post = (url: string, payload: object) => app.inject({ method: 'POST', url, payload });
  const login = (password: string) => post('/auth/login', { email: EMAIL, password });
  const forgot = (email = EMAIL) => post('/auth/forgot-password', { email });
  const reset = (token: string, password = NEW_PASSWORD) => post('/auth/reset-password', { token, password });

  describe('POST /auth/forgot-password', () => {
    it('answers 202 the same way for a known and an unknown email, emailing only the known one', async () => {
      const sentBefore = mailbox.sent.length;
      const known = await forgot();
      const unknown = await forgot('nobody@example.com');

      for (const res of [known, unknown]) {
        expect(res.statusCode).toBe(202);
        expect(res.json()).toEqual({ message: 'Check your email to continue' });
      }
      expect(mailbox.sent).toHaveLength(sentBefore + 1);
      expect(mailbox.lastToken(EMAIL)).toMatch(/^[\w-]{43}$/);
    });

    it('rejects a missing or oversized email (400)', async () => {
      expect((await post('/auth/forgot-password', {})).statusCode).toBe(400);
      expect((await forgot(`${'a'.repeat(245)}@example.com`)).statusCode).toBe(400);
    });
  });

  describe('POST /auth/reset-password', () => {
    it('sets the new password (204): the new one logs in, the old one does not', async () => {
      await forgot();
      expect((await reset(mailbox.lastToken(EMAIL))).statusCode).toBe(204);
      expect((await login(NEW_PASSWORD)).statusCode).toBe(200);
      expect((await login(OLD_PASSWORD)).statusCode).toBe(401);
    });

    it('signs the user out everywhere', async () => {
      await forgot();
      await reset(mailbox.lastToken(EMAIL));
      const res = await app.inject({ method: 'GET', url: '/me', cookies: { sid } });
      expect(res.statusCode).toBe(401);
    });

    it('rejects a link used twice, or one never sent (400)', async () => {
      await forgot();
      const token = mailbox.lastToken(EMAIL);
      await reset(token);
      const reused = await reset(token, 'yet another passphrase');
      expect(reused.statusCode).toBe(400);
      expect(reused.json()).toEqual({ error: 'This link is invalid or has expired' });
      expect((await reset('A'.repeat(43))).statusCode).toBe(400);
    });

    it.each([
      ['a password under 12 characters', { password: 'a'.repeat(11) }],
      ['a password over 128 characters', { password: 'a'.repeat(129) }],
      ['a missing password', { password: undefined }],
      ['a token with characters outside base64url', { token: '<script>' }],
      ['a missing token', { token: undefined }],
    ])('rejects %s (400), leaving the link usable', async (_label, overrides) => {
      await forgot();
      const token = mailbox.lastToken(EMAIL);
      const res = await post('/auth/reset-password', { token, password: NEW_PASSWORD, ...overrides });
      expect(res.statusCode).toBe(400);
      expect((await reset(token)).statusCode).toBe(204);
    });
  });
});
