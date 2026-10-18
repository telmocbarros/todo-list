import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError } from '../errors.js';
import { createTestRepositories } from '../test/repositories.js';
import { TodoService } from '../todos/todo.service.js';
import { LabelService } from './label.service.js';

describe('LabelService', () => {
  const color = '#000000';
  let service: LabelService;
  let todos: TodoService;
  let closeDatabase: () => void;

  beforeEach(async () => {
    const { todoRepository, labelRepository, close } = await createTestRepositories();
    closeDatabase = close;
    service = new LabelService(labelRepository, todoRepository);
    todos = new TodoService(todoRepository, labelRepository);
  });

  afterEach(() => closeDatabase());

  it('creates a label with a trimmed name and the given color', async () => {
    const label = await service.create({ name: '  Work ', color: '#00ff00' });
    expect(label).toMatchObject({ name: 'Work', color: '#00ff00' });
    expect(label.id).toBeTruthy();
  });

  it('rejects duplicate names, ignoring case', async () => {
    await service.create({ name: 'Work', color });
    await expect(service.create({ name: 'work', color })).rejects.toBeInstanceOf(ConflictError);
  });

  it('lists and gets labels', async () => {
    const a = await service.create({ name: 'a', color });
    await service.create({ name: 'b', color });
    expect((await service.list()).map((l) => l.name)).toEqual(['a', 'b']);
    expect(await service.get(a.id)).toEqual(a);
  });

  it('updates a label, allowing it to keep its own name', async () => {
    const a = await service.create({ name: 'a', color });
    expect(await service.update(a.id, { name: 'A', color: '#ff0000' })).toMatchObject({ name: 'A', color: '#ff0000' });
  });

  it('rejects renaming to another label name', async () => {
    await service.create({ name: 'a', color });
    const b = await service.create({ name: 'b', color });
    await expect(service.update(b.id, { name: 'A' })).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws NotFoundError for unknown ids', async () => {
    await expect(service.get('nope')).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.update('nope', { name: 'x' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.remove('nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('removes a label and detaches it from todos', async () => {
    const a = await service.create({ name: 'a', color });
    const b = await service.create({ name: 'b', color });
    const todo = await todos.create({ title: 't', labelIds: [a.id, b.id] });
    await service.remove(a.id);
    await expect(service.get(a.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await todos.get(todo.id)).labelIds).toEqual([b.id]);
  });
});
