import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionRepository } from '../auth/session.repository.js';
import { LabelRepository } from '../labels/label.repository.js';
import { createTestUser } from '../test/users.js';
import type { TodoModel } from '../todos/todo.model.js';
import { TodoRepository } from '../todos/todo.repository.js';
import { UserRepository } from '../users/user.repository.js';
import { createDatabase } from './client.js';
import { users } from './schema.js';

const todo = (overrides: Partial<TodoModel> = {}): TodoModel => ({
  id: 't1',
  title: 'Persisted',
  description: '',
  completed: false,
  priority: 'medium',
  labelIds: [],
  dueDate: null,
  createdAt: '2030-01-01T00:00:00.000Z',
  updatedAt: '2030-01-01T00:00:00.000Z',
  ...overrides,
});

describe('createDatabase', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'todo-db-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('persists data across restarts and re-running migrations is harmless', async () => {
    const path = join(dir, 'nested', 'todo.db');

    const first = await createDatabase(path);
    const ada = await createTestUser(new UserRepository(first.db), 'ada');
    await new LabelRepository(first.db).save(ada, { id: 'l1', name: 'Work', color: '#000000' });
    await new TodoRepository(first.db).save(ada, todo({ labelIds: ['l1'] }));
    first.close();

    const second = await createDatabase(path);
    expect(await new TodoRepository(second.db).findById(ada, 't1')).toMatchObject({
      title: 'Persisted',
      labelIds: ['l1'],
    });
    second.close();
  });

  it('enforces foreign keys: a todo cannot reference a missing label', async () => {
    const { db, close } = await createDatabase(':memory:');
    const ada = await createTestUser(new UserRepository(db), 'ada');
    await expect(new TodoRepository(db).save(ada, todo({ labelIds: ['missing'] }))).rejects.toThrow();
    close();
  });

  it('enforces foreign keys: a todo cannot belong to a user who does not exist', async () => {
    const { db, close } = await createDatabase(':memory:');
    await expect(new TodoRepository(db).save('ghost', todo())).rejects.toThrow();
    close();
  });

  it("deleting a user deletes their todos, labels and sessions, and nobody else's", async () => {
    const { db, close } = await createDatabase(':memory:');
    const userRepository = new UserRepository(db);
    const ada = await createTestUser(userRepository, 'ada');
    const bob = await createTestUser(userRepository, 'bob');
    const todos = new TodoRepository(db);
    const labels = new LabelRepository(db);
    const sessions = new SessionRepository(db);

    for (const owner of [ada, bob]) {
      await labels.save(owner, { id: `${owner}-label`, name: 'Work', color: '#000000' });
      await todos.save(owner, todo({ id: `${owner}-todo`, labelIds: [`${owner}-label`] }));
      await sessions.save({
        id: `${owner}-session`,
        userId: owner,
        createdAt: '2030-01-01T00:00:00.000Z',
        expiresAt: '2030-01-08T00:00:00.000Z',
      });
    }

    await db.delete(users).where(eq(users.id, ada));

    expect(await todos.findAll(ada)).toEqual([]);
    expect(await labels.findAll(ada)).toEqual([]);
    expect(await sessions.findById('ada-session')).toBeUndefined();
    expect(await todos.findById(bob, 'bob-todo')).toMatchObject({ labelIds: ['bob-label'] });
    expect(await labels.findAll(bob)).toHaveLength(1);
    expect(await sessions.findById('bob-session')).toBeDefined();
    close();
  });
});
