import { readFileSync } from 'node:fs';
import { buildApp } from './app.js';
import { EmailTokenRepository } from './auth/email-token.repository.js';
import { SessionRepository } from './auth/session.repository.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { ConsoleEmailSender } from './email/email-sender.js';
import { LabelRepository } from './labels/label.repository.js';
import { TodoRepository } from './todos/todo.repository.js';
import { UserRepository } from './users/user.repository.js';

const { port, databasePath, tls, trustProxy, allowedOrigins, rateLimiter, appUrl } = loadConfig(process.env);

const { db, close } = await createDatabase(databasePath);
const app = buildApp(
  {
    todoRepository: new TodoRepository(db),
    labelRepository: new LabelRepository(db),
    userRepository: new UserRepository(db),
    sessionRepository: new SessionRepository(db),
    emailTokenRepository: new EmailTokenRepository(db),
    // Until SMTP is configured, emails (and their links) are printed to the console
    emailSender: new ConsoleEmailSender(),
  },
  {
    trustProxy,
    allowedOrigins,
    rateLimiter,
    appUrl,
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
