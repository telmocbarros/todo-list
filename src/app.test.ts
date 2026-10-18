import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

describe('todo API', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  const create = (payload: object) => app.inject({ method: 'POST', url: '/todos', payload });

  it('POST /todos creates a todo (201)', async () => {
    const res = await create({ title: 'Buy milk' });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ title: 'Buy milk', completed: false });
  });

  it('GET /todos lists todos', async () => {
    await create({ title: 'a' });
    const res = await app.inject({ method: 'GET', url: '/todos' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
  });

  it('GET /todos/:id returns 404 for unknown id', async () => {
    const res = await app.inject({ method: 'GET', url: '/todos/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Todo not found' });
  });

  it('PATCH /todos/:id updates a todo', async () => {
    const { id } = (await create({ title: 'a' })).json();
    const res = await app.inject({ method: 'PATCH', url: `/todos/${id}`, payload: { completed: true } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id, completed: true });
  });

  it('DELETE /todos/:id returns 204, then 404', async () => {
    const { id } = (await create({ title: 'a' })).json();
    expect((await app.inject({ method: 'DELETE', url: `/todos/${id}` })).statusCode).toBe(204);
    expect((await app.inject({ method: 'DELETE', url: `/todos/${id}` })).statusCode).toBe(404);
  });

  it('rejects a missing title (400)', async () => {
    expect((await create({})).statusCode).toBe(400);
  });

  it('ignores a completed field on create, as todos always start incomplete', async () => {
    const res = await create({ title: 'a', completed: true });
    expect(res.statusCode).toBe(201);
    expect(res.json().completed).toBe(false);
  });

  // New behaviour: whitespace-only titles are invalid
  it('rejects a whitespace-only title on create (400)', async () => {
    expect((await create({ title: '   ' })).statusCode).toBe(400);
  });

  it('rejects a whitespace-only title on update (400)', async () => {
    const { id } = (await create({ title: 'a' })).json();
    const res = await app.inject({ method: 'PATCH', url: `/todos/${id}`, payload: { title: '  ' } });
    expect(res.statusCode).toBe(400);
  });

  describe('due date', () => {
    const due = '2030-01-01T00:00:00.000Z';

    it('POST /todos accepts a dueDate', async () => {
      const res = await create({ title: 'a', dueDate: due });
      expect(res.statusCode).toBe(201);
      expect(res.json().dueDate).toBe(due);
    });

    it('defaults dueDate to null', async () => {
      expect((await create({ title: 'a' })).json().dueDate).toBeNull();
    });

    it('rejects an invalid dueDate (400)', async () => {
      expect((await create({ title: 'a', dueDate: 'tomorrow' })).statusCode).toBe(400);
    });

    it('PATCH sets and clears dueDate', async () => {
      const { id } = (await create({ title: 'a' })).json();
      const set = await app.inject({ method: 'PATCH', url: `/todos/${id}`, payload: { dueDate: due } });
      expect(set.json().dueDate).toBe(due);
      const cleared = await app.inject({ method: 'PATCH', url: `/todos/${id}`, payload: { dueDate: null } });
      expect(cleared.statusCode).toBe(200);
      expect(cleared.json().dueDate).toBeNull();
    });

    it('PATCH rejects an invalid dueDate (400)', async () => {
      const { id } = (await create({ title: 'a' })).json();
      const res = await app.inject({ method: 'PATCH', url: `/todos/${id}`, payload: { dueDate: 'nope' } });
      expect(res.statusCode).toBe(400);
    });
  });
});
