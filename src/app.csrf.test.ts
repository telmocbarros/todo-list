import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type IAppOptions } from './app.js';
import { createTestRepositories } from './test/repositories.js';

// The browser adds Sec-Fetch-Site and Origin itself, and a page cannot forge them.
describe('CSRF: cross-site writes are blocked', () => {
  let app: FastifyInstance;
  let closeDatabase: () => void;

  const start = async (options: IAppOptions = {}) => {
    const { close, ...repositories } = await createTestRepositories();
    closeDatabase = close;
    app = buildApp(repositories, options);
  };

  afterEach(async () => {
    await app.close();
    closeDatabase();
  });

  const write = (headers: Record<string, string>, method: 'POST' | 'PATCH' | 'DELETE' = 'POST', url = '/auth/logout') =>
    app.inject({ method, url, headers, ...(method !== 'DELETE' && { payload: {} }) });

  const blocked = { error: 'Cross-site request blocked' };

  it('rejects a write the browser marks as cross-site (403), before the route runs', async () => {
    await start();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' },
      payload: { email: 'ada@example.com', password: 'whatever password' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual(blocked);
    expect(res.cookies).toHaveLength(0);
  });

  it('rejects a same-site but cross-origin write, such as from a sibling subdomain', async () => {
    await start();
    const res = await write({ 'sec-fetch-site': 'same-site', origin: 'http://evil.localhost' });
    expect(res.statusCode).toBe(403);
  });

  it('allows a same-origin write', async () => {
    await start();
    const res = await write({ 'sec-fetch-site': 'same-origin', origin: 'http://localhost' });
    expect(res.statusCode).toBe(204);
  });

  it('allows a write the user started directly, such as from the address bar', async () => {
    await start();
    expect((await write({ 'sec-fetch-site': 'none' })).statusCode).toBe(204);
  });

  it('allows clients that send neither header, such as curl, since only browsers carry a victim’s cookies', async () => {
    await start();
    expect((await write({})).statusCode).toBe(204);
  });

  describe('older browsers without Sec-Fetch-Site', () => {
    it('allows a write whose Origin matches the server', async () => {
      await start();
      expect((await write({ origin: 'http://localhost' })).statusCode).toBe(204);
    });

    it('rejects a write from any other Origin', async () => {
      await start();
      expect((await write({ origin: 'https://evil.example' })).statusCode).toBe(403);
    });

    it('rejects the opaque "null" Origin sent by sandboxed frames and local files', async () => {
      await start();
      expect((await write({ origin: 'null' })).statusCode).toBe(403);
    });
  });

  it('allows cross-site writes from an explicitly allowed origin, such as a separate UI', async () => {
    await start({ allowedOrigins: ['https://app.example.com'] });
    const res = await write({ 'sec-fetch-site': 'cross-site', origin: 'https://app.example.com' });
    expect(res.statusCode).toBe(204);
  });

  it('applies to every write method', async () => {
    await start();
    const crossSite = { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' };
    expect((await write(crossSite, 'PATCH', '/todos/x')).statusCode).toBe(403);
    expect((await write(crossSite, 'DELETE', '/todos/x')).statusCode).toBe(403);
  });

  it('leaves reads alone; reading responses cross-site is CORS’s job', async () => {
    await start();
    const res = await app.inject({
      method: 'GET',
      url: '/priorities',
      headers: { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' },
    });
    expect(res.statusCode).toBe(200);
  });
});
