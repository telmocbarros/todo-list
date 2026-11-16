import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ILabelRepository } from '../labels/label.repository.js';
import { createTestDependencies } from '../test/dependencies.js';
import { createTestUser } from '../test/users.js';
import type { TodoModel } from './todo.model.js';
import type { ITodoRepository } from './todo.repository.js';

const buildTodo = (overrides: Partial<TodoModel> = {}): TodoModel => ({
  id: randomUUID(),
  title: 'Buy milk',
  description: '',
  completed: false,
  completedAt: null,
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
    const { todoRepository, labelRepository, userRepository, close } = await createTestDependencies();
    todos = todoRepository;
    labels = labelRepository;
    closeDatabase = close;
    ada = await createTestUser(userRepository, 'ada');
    bob = await createTestUser(userRepository, 'bob');
  });

  afterEach(() => closeDatabase());

  const active = (userId: string) => todos.findMany(userId, { status: 'active' });

  it('saves and finds a todo by id, keeping every field', async () => {
    await addLabel('l1');
    const todo = buildTodo({
      description: 'Café ☕ 👨‍👩‍👧‍👦',
      completed: true,
      completedAt: '2030-01-01T06:00:00.000Z',
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

  it('lists active todos in insertion order', async () => {
    const a = await todos.save(ada, buildTodo({ title: 'a' }));
    const b = await todos.save(ada, buildTodo({ title: 'b' }));
    const c = await todos.save(ada, buildTodo({ title: 'c' }));
    await todos.save(ada, { ...a, title: 'a2' });
    expect((await active(ada)).map((t) => t.id)).toEqual([a.id, b.id, c.id]);
  });

  it('leaves completed todos out of the active list, but keeps reopened ones', async () => {
    const open = await todos.save(ada, buildTodo());
    await todos.save(ada, buildTodo({ completed: true, completedAt: '2030-01-01T01:00:00.000Z' }));
    const reopened = await todos.save(ada, buildTodo({ completedAt: '2030-01-01T02:00:00.000Z' }));
    expect((await active(ada)).map((t) => t.id)).toEqual([open.id, reopened.id]);
  });

  describe('history', () => {
    const done = (id: string, completedAt: string, overrides: Partial<TodoModel> = {}) =>
      todos.save(ada, buildTodo({ id, completed: true, completedAt, ...overrides }));

    it('lists todos with a completedAt, newest first, including reopened ones', async () => {
      await todos.save(ada, buildTodo({ id: 'open' }));
      await done('old', '2030-01-01T01:00:00.000Z');
      await done('reopened', '2030-01-01T03:00:00.000Z', { completed: false });
      await done('new', '2030-01-01T02:00:00.000Z');
      const ids = (await todos.findMany(ada, { status: 'history', limit: 10 })).map((t) => t.id);
      expect(ids).toEqual(['reopened', 'new', 'old']);
    });

    it('pages with a cursor after the last item, breaking ties on completedAt by id', async () => {
      await done('a', '2030-01-01T01:00:00.000Z');
      await done('b', '2030-01-01T02:00:00.000Z');
      await done('c', '2030-01-01T02:00:00.000Z');
      await done('d', '2030-01-01T03:00:00.000Z');

      const first = await todos.findMany(ada, { status: 'history', limit: 2 });
      expect(first.map((t) => t.id)).toEqual(['d', 'c']);
      const after = { completedAt: '2030-01-01T02:00:00.000Z', id: 'c' };
      const second = await todos.findMany(ada, { status: 'history', limit: 2, after });
      expect(second.map((t) => t.id)).toEqual(['b', 'a']);
    });

    it('returns labels for every listed todo', async () => {
      await addLabel('l1');
      await done('a', '2030-01-01T01:00:00.000Z', { labelIds: ['l1'] });
      expect((await todos.findMany(ada, { status: 'history', limit: 10 }))[0]?.labelIds).toEqual(['l1']);
    });
  });

  it('updates an existing todo when saved again, replacing its labels', async () => {
    await addLabel('l1');
    await addLabel('l2');
    const todo = await todos.save(ada, buildTodo({ labelIds: ['l1'] }));
    await todos.save(ada, { ...todo, title: 'changed', labelIds: ['l2'] });
    expect(await todos.findById(ada, todo.id)).toMatchObject({ title: 'changed', labelIds: ['l2'] });
    expect(await active(ada)).toHaveLength(1);
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
    expect((await active(ada))[0]).not.toHaveProperty('userId');
  });

  describe('ownership', () => {
    it("lists and finds only the owner's todos", async () => {
      const mine = await todos.save(ada, buildTodo({ title: 'mine' }));
      await todos.save(bob, buildTodo({ title: 'theirs' }));
      await todos.save(bob, buildTodo({ completed: true, completedAt: '2030-01-01T01:00:00.000Z' }));
      expect((await active(ada)).map((t) => t.title)).toEqual(['mine']);
      expect(await todos.findMany(ada, { status: 'history', limit: 10 })).toEqual([]);
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
