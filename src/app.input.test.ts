import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { createTestRepositories } from './test/repositories.js';

describe('input validation limits', () => {
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

  const createTodo = (payload: object) => app.inject({ method: 'POST', url: '/todos', payload });
  const createLabel = (payload: object) => app.inject({ method: 'POST', url: '/labels', payload });
  const status = async (res: ReturnType<typeof createTodo>) => (await res).statusCode;

  describe('todo title', () => {
    it('accepts 200 characters and rejects 201', async () => {
      expect(await status(createTodo({ title: 'a'.repeat(200) }))).toBe(201);
      expect(await status(createTodo({ title: 'a'.repeat(201) }))).toBe(400);
    });

    it('counts characters, not bytes: 200 emojis are accepted', async () => {
      expect(await status(createTodo({ title: '🚀'.repeat(200) }))).toBe(201);
    });

    it('rejects control characters, including line breaks, in a single-line field', async () => {
      expect(await status(createTodo({ title: 'line one\nline two' }))).toBe(400);
      expect(await status(createTodo({ title: 'tab\there' }))).toBe(400);
      expect(await status(createTodo({ title: 'nul\u0000byte' }))).toBe(400);
    });

    it('applies the same limits on update', async () => {
      const { id } = (await createTodo({ title: 'a' })).json();
      const patch = (payload: object) => app.inject({ method: 'PATCH', url: `/todos/${id}`, payload });
      expect((await patch({ title: 'a'.repeat(201) })).statusCode).toBe(400);
      expect((await patch({ title: 'bad\nline' })).statusCode).toBe(400);
    });
  });

  describe('todo description', () => {
    it('accepts 5000 characters and rejects 5001', async () => {
      expect(await status(createTodo({ title: 'a', description: 'd'.repeat(5000) }))).toBe(201);
      expect(await status(createTodo({ title: 'a', description: 'd'.repeat(5001) }))).toBe(400);
    });

    it('allows line breaks and tabs, but rejects other control characters', async () => {
      expect(await status(createTodo({ title: 'a', description: 'one\ntwo\r\n\tthree' }))).toBe(201);
      expect(await status(createTodo({ title: 'a', description: 'nul\u0000byte' }))).toBe(400);
      expect(await status(createTodo({ title: 'a', description: 'bell\u0007' }))).toBe(400);
    });
  });

  describe('todo labels list', () => {
    // Unknown ids also give a 400, from the service. Checking the message proves the schema rejected it first.
    it('rejects more than 50 label ids at the schema, before any label lookup', async () => {
      const res = await createTodo({ title: 'a', labelIds: Array.from({ length: 51 }, (_, i) => `id-${i}`) });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toMatch(/50 items/);
    });

    it('rejects absurdly long label ids at the schema', async () => {
      const res = await createTodo({ title: 'a', labelIds: ['x'.repeat(65)] });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toMatch(/64 characters/);
    });
  });

  describe('label name', () => {
    it('accepts 50 characters and rejects 51', async () => {
      expect(await status(createLabel({ name: 'n'.repeat(50), color: '#000000' }))).toBe(201);
      expect(await status(createLabel({ name: 'n'.repeat(51), color: '#000001' }))).toBe(400);
    });

    it('rejects control characters', async () => {
      expect(await status(createLabel({ name: 'bad\nname', color: '#000000' }))).toBe(400);
    });
  });

  describe('request body size', () => {
    it('rejects a body over 64 KiB with 413 before parsing it', async () => {
      const res = await createTodo({ title: 'a', description: 'x'.repeat(70 * 1024) });
      expect(res.statusCode).toBe(413);
    });
  });
});
