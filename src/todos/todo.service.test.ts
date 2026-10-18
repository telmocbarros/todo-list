import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError } from '../errors.js';
import { InMemoryTodoRepository } from './todo.repository.js';
import { TodoService } from './todo.service.js';

describe('TodoService', () => {
  let service: TodoService;

  beforeEach(() => {
    service = new TodoService(new InMemoryTodoRepository());
  });

  it('creates a todo with defaults', async () => {
    const todo = await service.create({ title: 'Buy milk' });
    expect(todo).toMatchObject({ title: 'Buy milk', completed: false });
    expect(todo.id).toBeTruthy();
    expect(todo.createdAt).toBe(todo.updatedAt);
  });

  it('lists created todos', async () => {
    await service.create({ title: 'a' });
    await service.create({ title: 'b' });
    expect((await service.list()).map((t) => t.title)).toEqual(['a', 'b']);
  });

  it('gets a todo by id', async () => {
    const created = await service.create({ title: 'a' });
    expect(await service.get(created.id)).toEqual(created);
  });

  it('throws NotFoundError for an unknown id', async () => {
    await expect(service.get('nope')).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.update('nope', { completed: true })).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.remove('nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('updates only the given fields and bumps updatedAt', async () => {
    const created = await service.create({ title: 'a' });
    await new Promise((r) => setTimeout(r, 5));
    const updated = await service.update(created.id, { completed: true });
    expect(updated).toMatchObject({ id: created.id, title: 'a', completed: true });
    expect(updated.updatedAt > created.updatedAt).toBe(true);
  });

  it('removes a todo', async () => {
    const created = await service.create({ title: 'a' });
    await service.remove(created.id);
    await expect(service.get(created.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  // New behaviour: titles are trimmed
  it('trims the title on create', async () => {
    const todo = await service.create({ title: '  Buy milk  ' });
    expect(todo.title).toBe('Buy milk');
  });

  it('trims the title on update', async () => {
    const created = await service.create({ title: 'a' });
    const updated = await service.update(created.id, { title: '  b ' });
    expect(updated.title).toBe('b');
  });
});
