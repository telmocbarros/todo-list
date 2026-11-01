import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { RATE_LIMITERS } from './config.js';
import { createTestRepositories } from './test/repositories.js';

const account = {
  email: 'ada@example.com',
  username: 'ada',
  firstName: 'Ada',
  lastName: 'Lovelace',
  password: 'correct horse battery staple',
};

// The same behaviour is required of both implementations
describe.each(RATE_LIMITERS)('rate limiting (%s limiter)', (rateLimiter) => {
  let app: FastifyInstance;
  let closeDatabase: () => void;

  beforeEach(async () => {
    const { close, ...repositories } = await createTestRepositories();
    closeDatabase = close;
    app = buildApp(repositories, { rateLimiter });
  });

  afterEach(async () => {
    await app.close();
    closeDatabase();
  });

  const login = (password: string, remoteAddress = '203.0.113.1') =>
    app.inject({ method: 'POST', url: '/auth/login', payload: { email: account.email, password }, remoteAddress });

  const expectTooMany = (res: Awaited<ReturnType<typeof login>>, maxWaitSeconds: number) => {
    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({ error: 'Too many requests, try again later' });
    const retryAfter = Number(res.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(maxWaitSeconds);
  };

  describe('login: 10 attempts per 15 minutes per IP', () => {
    beforeEach(async () => {
      await app.inject({ method: 'POST', url: '/auth/signup', payload: account });
    });

    it('allows 10 attempts and rejects the 11th with 429 and Retry-After', async () => {
      for (let i = 0; i < 10; i++) expect((await login('wrong password')).statusCode).toBe(401);
      expectTooMany(await login('wrong password'), 15 * 60);
    });

    it('blocks before the route runs: the right password gets no session once the limit is reached', async () => {
      for (let i = 0; i < 10; i++) await login('wrong password');
      const res = await login(account.password);
      expect(res.statusCode).toBe(429);
      expect(res.cookies).toHaveLength(0);
    });

    it('limits each IP separately', async () => {
      for (let i = 0; i < 10; i++) await login('wrong password', '203.0.113.1');
      expect((await login(account.password, '198.51.100.7')).statusCode).toBe(200);
    });
  });

  describe('signup: 5 attempts per hour per IP', () => {
    it('allows 5 signups and rejects the 6th', async () => {
      for (let i = 0; i < 5; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/auth/signup',
          payload: { ...account, email: `u${i}@example.com`, username: `user${i}` },
        });
        expect(res.statusCode).toBe(201);
      }
      const sixth = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: { ...account, email: 'u5@example.com', username: 'user5' },
      });
      expectTooMany(sixth, 60 * 60);
    });
  });

  it('leaves other routes unlimited', async () => {
    for (let i = 0; i < 30; i++) {
      expect((await app.inject({ method: 'GET', url: '/priorities' })).statusCode).toBe(200);
    }
  });
});
