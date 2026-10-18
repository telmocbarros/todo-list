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

  describe('description', () => {
    it('round-trips UTF-8 text and emojis over HTTP', async () => {
      const description = 'Café ☕ — 日本語 👨‍👩‍👧‍👦🎉';
      const { id } = (await create({ title: 'a', description })).json();
      const res = await app.inject({ method: 'GET', url: `/todos/${id}` });
      expect(res.json().description).toBe(description);
    });

    it('can be updated and rejects non-strings', async () => {
      const { id } = (await create({ title: 'a' })).json();
      const ok = await app.inject({ method: 'PATCH', url: `/todos/${id}`, payload: { description: '🚀' } });
      expect(ok.json().description).toBe('🚀');
      const bad = await app.inject({ method: 'PATCH', url: `/todos/${id}`, payload: { description: { x: 1 } } });
      expect(bad.statusCode).toBe(400);
    });
  });

  describe('priority', () => {
    it('GET /priorities lists the three colour-coded levels', async () => {
      const res = await app.inject({ method: 'GET', url: '/priorities' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([
        { level: 'low', color: 'green' },
        { level: 'medium', color: 'yellow' },
        { level: 'high', color: 'red' },
      ]);
    });

    it('defaults to low, and can be set on create and update', async () => {
      expect((await create({ title: 'a' })).json().priority).toBe('low');
      const { id, priority } = (await create({ title: 'b', priority: 'high' })).json();
      expect(priority).toBe('high');
      const res = await app.inject({ method: 'PATCH', url: `/todos/${id}`, payload: { priority: 'medium' } });
      expect(res.json().priority).toBe('medium');
    });

    it('rejects unknown levels (400)', async () => {
      expect((await create({ title: 'a', priority: 'urgent' })).statusCode).toBe(400);
    });
  });

  describe('labels', () => {
    const color = '#ff0000';
    const createLabel = (payload: object) => app.inject({ method: 'POST', url: '/labels', payload });

    it('POST /labels creates a label (201)', async () => {
      const res = await createLabel({ name: 'Work', color: '#ff0000' });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ name: 'Work', color: '#ff0000' });
    });

    it('validates name and color (400)', async () => {
      expect((await createLabel({})).statusCode).toBe(400);
      expect((await createLabel({ name: 'x' })).statusCode).toBe(400);
      expect((await createLabel({ color })).statusCode).toBe(400);
      expect((await createLabel({ name: 'x', color: null })).statusCode).toBe(400);
      expect((await createLabel({ name: '   ', color })).statusCode).toBe(400);
      expect((await createLabel({ name: 'x', color: 'red' })).statusCode).toBe(400);
    });

    it('returns 409 for a duplicate name', async () => {
      await createLabel({ name: 'Work', color });
      expect((await createLabel({ name: 'work', color })).statusCode).toBe(409);
    });

    it('lists, gets, updates and deletes labels', async () => {
      const { id } = (await createLabel({ name: 'Work', color })).json();
      expect((await app.inject({ method: 'GET', url: '/labels' })).json()).toHaveLength(1);
      expect((await app.inject({ method: 'GET', url: `/labels/${id}` })).statusCode).toBe(200);
      const patched = await app.inject({ method: 'PATCH', url: `/labels/${id}`, payload: { name: 'Job' } });
      expect(patched.json().name).toBe('Job');
      expect((await app.inject({ method: 'DELETE', url: `/labels/${id}` })).statusCode).toBe(204);
      expect((await app.inject({ method: 'GET', url: `/labels/${id}` })).statusCode).toBe(404);
    });

    it('attaches labels to todos, rejecting unknown ones (400)', async () => {
      const label = (await createLabel({ name: 'Work', color })).json();
      const todo = (await create({ title: 'a', labelIds: [label.id] })).json();
      expect(todo.labelIds).toEqual([label.id]);
      expect((await create({ title: 'b', labelIds: ['nope'] })).statusCode).toBe(400);
    });

    it('deleting a label removes it from todos', async () => {
      const label = (await createLabel({ name: 'Work', color })).json();
      const todo = (await create({ title: 'a', labelIds: [label.id] })).json();
      await app.inject({ method: 'DELETE', url: `/labels/${label.id}` });
      const res = await app.inject({ method: 'GET', url: `/todos/${todo.id}` });
      expect(res.json().labelIds).toEqual([]);
    });
  });
});
