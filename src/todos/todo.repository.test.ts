import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ILabelRepository } from '../labels/label.repository.js';
import { createTestRepositories } from '../test/repositories.js';
import { createTestUser } from '../test/users.js';
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
  let ada: string;
  let bob: string;
  let closeDatabase: () => void;

  const addLabel = async (id: string, owner = ada) => labels.save(owner, { id, name: id, color: '#000000' });

  beforeEach(async () => {
    const { todoRepository, labelRepository, userRepository, close } = await createTestRepositories();
    todos = todoRepository;
    labels = labelRepository;
    closeDatabase = close;
    ada = await createTestUser(userRepository, 'ada');
    bob = await createTestUser(userRepository, 'bob');
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
    await todos.save(ada, todo);
    expect(await todos.findById(ada, todo.id)).toEqual(todo);
  });

  it('returns undefined for an unknown id', async () => {
    expect(await todos.findById(ada, 'nope')).toBeUndefined();
  });

  it('lists todos in insertion order', async () => {
    const a = await todos.save(ada, buildTodo({ title: 'a' }));
    const b = await todos.save(ada, buildTodo({ title: 'b' }));
    const c = await todos.save(ada, buildTodo({ title: 'c' }));
    await todos.save(ada, { ...a, title: 'a2' });
    expect((await todos.findAll(ada)).map((t) => t.id)).toEqual([a.id, b.id, c.id]);
  });

  it('updates an existing todo when saved again, replacing its labels', async () => {
    await addLabel('l1');
    await addLabel('l2');
    const todo = await todos.save(ada, buildTodo({ labelIds: ['l1'] }));
    await todos.save(ada, { ...todo, title: 'changed', labelIds: ['l2'] });
    expect(await todos.findById(ada, todo.id)).toMatchObject({ title: 'changed', labelIds: ['l2'] });
    expect(await todos.findAll(ada)).toHaveLength(1);
  });

  it('keeps the order of label ids', async () => {
    await addLabel('l1');
    await addLabel('l2');
    await addLabel('l3');
    const todo = await todos.save(ada, buildTodo({ labelIds: ['l3', 'l1', 'l2'] }));
    expect((await todos.findById(ada, todo.id))?.labelIds).toEqual(['l3', 'l1', 'l2']);
  });

  it('deletes a todo and reports whether it existed', async () => {
    const todo = await todos.save(ada, buildTodo());
    expect(await todos.delete(ada, todo.id)).toBe(true);
    expect(await todos.findById(ada, todo.id)).toBeUndefined();
    expect(await todos.delete(ada, todo.id)).toBe(false);
  });

  it('removes a label from every todo of the owner that has it', async () => {
    await addLabel('l1');
    await addLabel('l2');
    const a = await todos.save(ada, buildTodo({ labelIds: ['l1', 'l2'] }));
    const b = await todos.save(ada, buildTodo({ labelIds: ['l2'] }));
    const c = await todos.save(ada, buildTodo());
    await todos.removeLabel(ada, 'l2');
    expect((await todos.findById(ada, a.id))?.labelIds).toEqual(['l1']);
    expect((await todos.findById(ada, b.id))?.labelIds).toEqual([]);
    expect((await todos.findById(ada, c.id))?.labelIds).toEqual([]);
  });

  it('does not expose the owner in the returned todo', async () => {
    const todo = await todos.save(ada, buildTodo());
    expect(await todos.findById(ada, todo.id)).not.toHaveProperty('userId');
    expect((await todos.findAll(ada))[0]).not.toHaveProperty('userId');
  });

  describe('ownership', () => {
    it("lists and finds only the owner's todos", async () => {
      const mine = await todos.save(ada, buildTodo({ title: 'mine' }));
      await todos.save(bob, buildTodo({ title: 'theirs' }));
      expect((await todos.findAll(ada)).map((t) => t.title)).toEqual(['mine']);
      expect(await todos.findById(bob, mine.id)).toBeUndefined();
    });

    it("cannot delete another user's todo", async () => {
      const mine = await todos.save(ada, buildTodo());
      expect(await todos.delete(bob, mine.id)).toBe(false);
      expect(await todos.findById(ada, mine.id)).toBeDefined();
    });

    it("cannot overwrite another user's todo by saving the same id", async () => {
      const mine = await todos.save(ada, buildTodo({ title: 'mine' }));
      await todos.save(bob, { ...mine, title: 'hijacked' }).catch(() => {});
      expect((await todos.findById(ada, mine.id))?.title).toBe('mine');
      expect(await todos.findById(bob, mine.id)).toBeUndefined();
    });

    it("leaves other users' todos alone when removing a label", async () => {
      await addLabel('shared-id', ada);
      const mine = await todos.save(ada, buildTodo({ labelIds: ['shared-id'] }));
      await todos.removeLabel(bob, 'shared-id');
      expect((await todos.findById(ada, mine.id))?.labelIds).toEqual(['shared-id']);
    });
  });
});
