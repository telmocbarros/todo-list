import { createDatabase } from '../db/client.js';
import { PersistentLabelRepository } from '../labels/persistent-label.repository.js';
import { PersistentTodoRepository } from '../todos/persistent-todo.repository.js';

/** Fresh, isolated repositories backed by an in-memory SQLite database (same code path as production). */
export const createTestRepositories = async () => {
  const { db, close } = await createDatabase(':memory:');
  return {
    todoRepository: new PersistentTodoRepository(db),
    labelRepository: new PersistentLabelRepository(db),
    close,
  };
};
