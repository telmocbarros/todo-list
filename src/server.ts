import { buildApp } from './app.js';
import { createDatabase } from './db/client.js';
import { PersistentLabelRepository } from './labels/persistent-label.repository.js';
import { PersistentTodoRepository } from './todos/persistent-todo.repository.js';

const port = Number(process.env.PORT ?? 3000);
const databasePath = process.env.DATABASE_PATH ?? './data/todo-list.db';

const { db, close } = await createDatabase(databasePath);
const app = buildApp({
  todoRepository: new PersistentTodoRepository(db),
  labelRepository: new PersistentLabelRepository(db),
});
app.addHook('onClose', async () => close());

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => void app.close());
}

try {
  await app.listen({ port, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
