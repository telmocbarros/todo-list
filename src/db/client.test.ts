import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LabelRepository } from '../labels/label.repository.js';
import { TodoRepository } from '../todos/todo.repository.js';
import { createDatabase } from './client.js';

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
    await new LabelRepository(first.db).save({ id: 'l1', name: 'Work', color: '#000000' });
    await new TodoRepository(first.db).save({
      id: 't1',
      title: 'Persisted',
      description: '',
      completed: false,
      priority: 'medium',
      labelIds: ['l1'],
      dueDate: null,
      createdAt: '2030-01-01T00:00:00.000Z',
      updatedAt: '2030-01-01T00:00:00.000Z',
    });
    first.close();

    const second = await createDatabase(path);
    expect(await new TodoRepository(second.db).findById('t1')).toMatchObject({
      title: 'Persisted',
      labelIds: ['l1'],
    });
    second.close();
  });

  it('enforces foreign keys: a todo cannot reference a missing label', async () => {
    const { db, close } = await createDatabase(':memory:');
    const todo = {
      id: 't1',
      title: 'x',
      description: '',
      completed: false,
      priority: 'low' as const,
      labelIds: ['missing'],
      dueDate: null,
      createdAt: '2030-01-01T00:00:00.000Z',
      updatedAt: '2030-01-01T00:00:00.000Z',
    };
    await expect(new TodoRepository(db).save(todo)).rejects.toThrow();
    close();
  });
});
