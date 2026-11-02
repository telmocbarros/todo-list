import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { as, signUpAndLogIn } from './test/auth.js';
import { createTestRepositories } from './test/repositories.js';

describe('ownership: users only ever see and change their own data', () => {
  let app: FastifyInstance;
  let ada: ReturnType<typeof as>;
  let bob: ReturnType<typeof as>;
  let closeDatabase: () => void;

  beforeEach(async () => {
    const { close, ...repositories } = await createTestRepositories();
    closeDatabase = close;
    app = buildApp(repositories);
    ada = as(app, await signUpAndLogIn(app, 'ada'));
    bob = as(app, await signUpAndLogIn(app, 'bob'));
  });

  afterEach(async () => {
    await app.close();
    closeDatabase();
  });

  describe('without a session', () => {
    it.each([
      ['GET', '/todos'],
      ['GET', '/todos/any-id'],
      ['POST', '/todos'],
      ['PATCH', '/todos/any-id'],
      ['DELETE', '/todos/any-id'],
      ['GET', '/labels'],
      ['GET', '/labels/any-id'],
      ['POST', '/labels'],
      ['PATCH', '/labels/any-id'],
      ['DELETE', '/labels/any-id'],
    ] as const)('%s %s returns 401', async (method, url) => {
      const res = await app.inject({ method, url, ...(method === 'POST' || method === 'PATCH' ? { payload: {} } : {}) });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: 'Authentication required' });
    });

    it('checks the session before validating the body, so anonymous callers learn nothing about the API', async () => {
      const res = await app.inject({ method: 'POST', url: '/todos', payload: { title: 42 } });
      expect(res.statusCode).toBe(401);
    });

    it('keeps the fixed priority list public, since it holds no user data', async () => {
      expect((await app.inject({ method: 'GET', url: '/priorities' })).statusCode).toBe(200);
    });
  });

  describe('todos', () => {
    let todoId: string;

    beforeEach(async () => {
      todoId = (await ada({ method: 'POST', url: '/todos', payload: { title: "Ada's todo" } })).json().id;
    });

    it('lists only your own', async () => {
      await bob({ method: 'POST', url: '/todos', payload: { title: "Bob's todo" } });
      expect((await ada({ method: 'GET', url: '/todos' })).json().map((t: { title: string }) => t.title)).toEqual([
        "Ada's todo",
      ]);
      expect((await bob({ method: 'GET', url: '/todos' })).json().map((t: { title: string }) => t.title)).toEqual([
        "Bob's todo",
      ]);
    });

    it("answers 404 for another user's todo on every route, exactly as for one that does not exist", async () => {
      const missing = await bob({ method: 'GET', url: '/todos/does-not-exist' });
      for (const [method, payload] of [
        ['GET', undefined],
        ['PATCH', { title: 'hijacked' }],
        ['DELETE', undefined],
      ] as const) {
        const res = await bob({ method, url: `/todos/${todoId}`, ...(payload && { payload }) });
        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual(missing.json());
      }
      const stillThere = await ada({ method: 'GET', url: `/todos/${todoId}` });
      expect(stillThere.json()).toMatchObject({ title: "Ada's todo" });
    });

    it("does not let you attach another user's label (400, as for an unknown label)", async () => {
      const label = await ada({ method: 'POST', url: '/labels', payload: { name: 'Work', color: '#000000' } });
      const res = await bob({ method: 'POST', url: '/todos', payload: { title: 't', labelIds: [label.json().id] } });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('labels', () => {
    let labelId: string;

    beforeEach(async () => {
      labelId = (await ada({ method: 'POST', url: '/labels', payload: { name: 'Work', color: '#000000' } })).json().id;
    });

    it('lists only your own', async () => {
      expect((await bob({ method: 'GET', url: '/labels' })).json()).toEqual([]);
      expect((await ada({ method: 'GET', url: '/labels' })).json()).toHaveLength(1);
    });

    it("answers 404 for another user's label on every route", async () => {
      expect((await bob({ method: 'GET', url: `/labels/${labelId}` })).statusCode).toBe(404);
      expect((await bob({ method: 'PATCH', url: `/labels/${labelId}`, payload: { name: 'x' } })).statusCode).toBe(404);
      expect((await bob({ method: 'DELETE', url: `/labels/${labelId}` })).statusCode).toBe(404);
      expect((await ada({ method: 'GET', url: `/labels/${labelId}` })).statusCode).toBe(200);
    });

    it('lets two users each have a label with the same name', async () => {
      const res = await bob({ method: 'POST', url: '/labels', payload: { name: 'work', color: '#ffffff' } });
      expect(res.statusCode).toBe(201);
    });
  });
});
