import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ILabelRepository } from '../labels/label.repository.js';
import { createTestRepositories } from '../test/repositories.js';
import type { TodoModel } from './todo.model.js';
import type { ITodoRepository } from './todo.repository.js';

const buildTodo = (overrides: Partial<TodoModel> = {}): TodoModel => ({
  id: randomUUID(),
  title: 'Buy milk',
  description: '',
  completed: false,
  priority: 'low',
  labelIds: [],
  dueDate: null,
  createdAt: '2030-01-01T00:00:00.000Z',
  updatedAt: '2030-01-01T00:00:00.000Z',
  ...overrides,
});

describe('ITodoRepository', () => {
  let todos: ITodoRepository;
  let labels: ILabelRepository;
  let closeDatabase: () => void;

  const addLabel = async (id: string) => labels.save({ id, name: id, color: '#000000' });

  beforeEach(async () => {
    const { todoRepository, labelRepository, close } = await createTestRepositories();
    todos = todoRepository;
    labels = labelRepository;
    closeDatabase = close;
  });

  afterEach(() => closeDatabase());

  it('saves and finds a todo by id, keeping every field', async () => {
    await addLabel('l1');
    const todo = buildTodo({
      description: 'Café ☕ 👨‍👩‍👧‍👦',
      completed: true,
      priority: 'high',
      labelIds: ['l1'],
      dueDate: '2030-06-01T12:00:00.000Z',
    });
    await todos.save(todo);
    expect(await todos.findById(todo.id)).toEqual(todo);
  });

  it('returns undefined for an unknown id', async () => {
    expect(await todos.findById('nope')).toBeUndefined();
  });

  it('lists todos in insertion order', async () => {
    const a = await todos.save(buildTodo({ title: 'a' }));
    const b = await todos.save(buildTodo({ title: 'b' }));
    const c = await todos.save(buildTodo({ title: 'c' }));
    await todos.save({ ...a, title: 'a2' });
    expect((await todos.findAll()).map((t) => t.id)).toEqual([a.id, b.id, c.id]);
  });

  it('updates an existing todo when saved again, replacing its labels', async () => {
    await addLabel('l1');
    await addLabel('l2');
    const todo = await todos.save(buildTodo({ labelIds: ['l1'] }));
    await todos.save({ ...todo, title: 'changed', labelIds: ['l2'] });
    expect(await todos.findById(todo.id)).toMatchObject({ title: 'changed', labelIds: ['l2'] });
    expect(await todos.findAll()).toHaveLength(1);
  });

  it('keeps the order of label ids', async () => {
    await addLabel('l1');
    await addLabel('l2');
    await addLabel('l3');
    const todo = await todos.save(buildTodo({ labelIds: ['l3', 'l1', 'l2'] }));
    expect((await todos.findById(todo.id))?.labelIds).toEqual(['l3', 'l1', 'l2']);
  });

  it('deletes a todo and reports whether it existed', async () => {
    const todo = await todos.save(buildTodo());
    expect(await todos.delete(todo.id)).toBe(true);
    expect(await todos.findById(todo.id)).toBeUndefined();
    expect(await todos.delete(todo.id)).toBe(false);
  });

  it('removes a label from every todo that has it', async () => {
    await addLabel('l1');
    await addLabel('l2');
    const a = await todos.save(buildTodo({ labelIds: ['l1', 'l2'] }));
    const b = await todos.save(buildTodo({ labelIds: ['l2'] }));
    const c = await todos.save(buildTodo());
    await todos.removeLabel('l2');
    expect((await todos.findById(a.id))?.labelIds).toEqual(['l1']);
    expect((await todos.findById(b.id))?.labelIds).toEqual([]);
    expect((await todos.findById(c.id))?.labelIds).toEqual([]);
  });
});
