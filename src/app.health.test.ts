import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { createTestRepositories } from './test/repositories.js';

describe('health check', () => {
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

  it('GET /health answers 200 without a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});
