import { EmailTokenRepository } from '../auth/email-token.repository.js';
import { SessionRepository } from '../auth/session.repository.js';
import { createDatabase } from '../db/client.js';
import { LabelRepository } from '../labels/label.repository.js';
import { TodoRepository } from '../todos/todo.repository.js';
import { UserRepository } from '../users/user.repository.js';
import { TestMailbox } from './mailbox.js';

/**
 * Fresh, isolated repositories backed by an in-memory SQLite database (same code path as production),
 * plus a mailbox that records email instead of sending it: everything `buildApp` needs.
 */
export const createTestRepositories = async () => {
  const { db, close } = await createDatabase(':memory:');
  return {
    todoRepository: new TodoRepository(db),
    labelRepository: new LabelRepository(db),
    userRepository: new UserRepository(db),
    sessionRepository: new SessionRepository(db),
    emailTokenRepository: new EmailTokenRepository(db),
    emailSender: new TestMailbox(),
    close,
  };
};
