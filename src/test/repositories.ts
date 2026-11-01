import { createDatabase } from '../db/client.js';
import { LabelRepository } from '../labels/label.repository.js';
import { TodoRepository } from '../todos/todo.repository.js';
import { UserRepository } from '../users/user.repository.js';

/** Fresh, isolated repositories backed by an in-memory SQLite database (same code path as production). */
export const createTestRepositories = async () => {
  const { db, close } = await createDatabase(':memory:');
  return {
    todoRepository: new TodoRepository(db),
    labelRepository: new LabelRepository(db),
    userRepository: new UserRepository(db),
    close,
  };
};
