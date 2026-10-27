import { readFileSync } from 'node:fs';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { LabelRepository } from './labels/label.repository.js';
import { TodoRepository } from './todos/todo.repository.js';

const { port, databasePath, tls, trustProxy } = loadConfig(process.env);

const { db, close } = await createDatabase(databasePath);
const app = buildApp(
  {
    todoRepository: new TodoRepository(db),
    labelRepository: new LabelRepository(db),
  },
  {
    trustProxy,
    https: tls && { key: readFileSync(tls.keyPath), cert: readFileSync(tls.certPath) },
  },
);
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
