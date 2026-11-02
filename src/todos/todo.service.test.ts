import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError, ValidationError } from '../errors.js';
import type { ILabelRepository } from '../labels/label.repository.js';
import { createTestRepositories } from '../test/repositories.js';
import { createTestUser } from '../test/users.js';
import { TodoService } from './todo.service.js';

describe('TodoService', () => {
  let service: TodoService;
  let labels: ILabelRepository;
  let ada: string;
  let bob: string;
  let closeDatabase: () => void;

  beforeEach(async () => {
    const { todoRepository, labelRepository, userRepository, close } = await createTestRepositories();
    labels = labelRepository;
    closeDatabase = close;
    service = new TodoService(todoRepository, labels);
    ada = await createTestUser(userRepository, 'ada');
    bob = await createTestUser(userRepository, 'bob');
  });

  afterEach(() => closeDatabase());

  const addLabel = (id: string) => labels.save(ada, { id, name: id, color: '#000000' });

  it('creates a todo with defaults', async () => {
    const todo = await service.create(ada, { title: 'Buy milk' });
    expect(todo).toMatchObject({ title: 'Buy milk', completed: false });
    expect(todo.id).toBeTruthy();
    expect(todo.createdAt).toBe(todo.updatedAt);
  });

  it('lists created todos', async () => {
    await service.create(ada, { title: 'a' });
    await service.create(ada, { title: 'b' });
    expect((await service.list(ada)).map((t) => t.title)).toEqual(['a', 'b']);
  });

  it('gets a todo by id', async () => {
    const created = await service.create(ada, { title: 'a' });
    expect(await service.get(ada, created.id)).toEqual(created);
  });

  it('throws NotFoundError for an unknown id', async () => {
    await expect(service.get(ada, 'nope')).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.update(ada, 'nope', { completed: true })).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.remove(ada, 'nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('updates only the given fields and bumps updatedAt', async () => {
    const created = await service.create(ada, { title: 'a' });
    await new Promise((r) => setTimeout(r, 5));
    const updated = await service.update(ada, created.id, { completed: true });
    expect(updated).toMatchObject({ id: created.id, title: 'a', completed: true });
    expect(updated.updatedAt > created.updatedAt).toBe(true);
  });

  it('removes a todo', async () => {
    const created = await service.create(ada, { title: 'a' });
    await service.remove(ada, created.id);
    await expect(service.get(ada, created.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  // New behaviour: titles are trimmed
  it('trims the title on create', async () => {
    const todo = await service.create(ada, { title: '  Buy milk  ' });
    expect(todo.title).toBe('Buy milk');
  });

  it('trims the title on update', async () => {
    const created = await service.create(ada, { title: 'a' });
    const updated = await service.update(ada, created.id, { title: '  b ' });
    expect(updated.title).toBe('b');
  });

  describe('ownership', () => {
    it("treats another user's todo as not found, so its existence is not revealed", async () => {
      const mine = await service.create(ada, { title: 'mine' });
      await expect(service.get(bob, mine.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.update(bob, mine.id, { completed: true })).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.remove(bob, mine.id)).rejects.toBeInstanceOf(NotFoundError);
      expect(await service.get(ada, mine.id)).toMatchObject({ title: 'mine', completed: false });
    });

    it('lists only your own todos', async () => {
      await service.create(ada, { title: 'mine' });
      await service.create(bob, { title: 'theirs' });
      expect((await service.list(ada)).map((t) => t.title)).toEqual(['mine']);
    });
  });

  describe('due date', () => {
    it('defaults to null', async () => {
      expect((await service.create(ada, { title: 'a' })).dueDate).toBeNull();
    });

    it('can be set on create, normalized to UTC', async () => {
      const todo = await service.create(ada, { title: 'a', dueDate: '2030-01-01T10:00:00+01:00' });
      expect(todo.dueDate).toBe('2030-01-01T09:00:00.000Z');
    });

    it('can be set on update', async () => {
      const created = await service.create(ada, { title: 'a' });
      const updated = await service.update(ada, created.id, { dueDate: '2030-01-01T00:00:00Z' });
      expect(updated.dueDate).toBe('2030-01-01T00:00:00.000Z');
    });

    it('can be cleared with null', async () => {
      const created = await service.create(ada, { title: 'a', dueDate: '2030-01-01T00:00:00Z' });
      expect((await service.update(ada, created.id, { dueDate: null })).dueDate).toBeNull();
    });

    it('is kept when not part of the update', async () => {
      const created = await service.create(ada, { title: 'a', dueDate: '2030-01-01T00:00:00Z' });
      expect((await service.update(ada, created.id, { completed: true })).dueDate).toBe(created.dueDate);
    });
  });

  describe('description', () => {
    it('defaults to an empty string', async () => {
      expect((await service.create(ada, { title: 'a' })).description).toBe('');
    });

    it('keeps UTF-8 text and emojis untouched', async () => {
      const description = 'Café ☕ — 日本語 👨‍👩‍👧‍👦🎉';
      const created = await service.create(ada, { title: 'a', description });
      expect(created.description).toBe(description);
      expect((await service.update(ada, created.id, { description: '🚀' })).description).toBe('🚀');
    });
  });

  describe('priority', () => {
    it('defaults to low', async () => {
      expect((await service.create(ada, { title: 'a' })).priority).toBe('low');
    });

    it('can be set on create and update', async () => {
      const created = await service.create(ada, { title: 'a', priority: 'medium' });
      expect(created.priority).toBe('medium');
      expect((await service.update(ada, created.id, { priority: 'high' })).priority).toBe('high');
    });
  });

  describe('labels', () => {
    it('defaults to none', async () => {
      expect((await service.create(ada, { title: 'a' })).labelIds).toEqual([]);
    });

    it('can be set on create and replaced on update, without duplicates', async () => {
      await addLabel('l1');
      await addLabel('l2');
      const created = await service.create(ada, { title: 'a', labelIds: ['l1', 'l1'] });
      expect(created.labelIds).toEqual(['l1']);
      expect((await service.update(ada, created.id, { labelIds: ['l2'] })).labelIds).toEqual(['l2']);
      expect((await service.update(ada, created.id, { labelIds: [] })).labelIds).toEqual([]);
    });

    it("rejects another user's label as unknown, so todos cannot point at it", async () => {
      await labels.save(bob, { id: 'bobs-label', name: 'Home', color: '#000000' });
      await expect(service.create(ada, { title: 'a', labelIds: ['bobs-label'] })).rejects.toBeInstanceOf(
        ValidationError,
      );
      const created = await service.create(ada, { title: 'a' });
      await expect(service.update(ada, created.id, { labelIds: ['bobs-label'] })).rejects.toBeInstanceOf(
        ValidationError,
      );
    });

    it('rejects unknown labels', async () => {
      await expect(service.create(ada, { title: 'a', labelIds: ['nope'] })).rejects.toBeInstanceOf(ValidationError);
      const created = await service.create(ada, { title: 'a' });
      await expect(service.update(ada, created.id, { labelIds: ['nope'] })).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('unicode normalization', () => {
    // "é" typed as e + combining accent, versus the single precomposed character
    const decomposed = 'Café';
    const composed = 'Café';

    it('stores titles and descriptions in NFC form', async () => {
      const created = await service.create(ada, { title: decomposed, description: decomposed });
      expect(created.title).toBe(composed);
      expect(created.description).toBe(composed);
      const updated = await service.update(ada, created.id, { title: `x${decomposed}`, description: decomposed });
      expect(updated.title).toBe(`x${composed}`);
      expect(updated.description).toBe(composed);
    });

    it('leaves emoji sequences intact', async () => {
      const family = '👨‍👩‍👧‍👦';
      expect((await service.create(ada, { title: 'a', description: family })).description).toBe(family);
    });
  });
});
