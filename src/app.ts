import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { createRequireUser, registerAuthRoutes } from './auth/auth.controller.js';
import { AuthService } from './auth/auth.service.js';
import { PasswordHasher } from './auth/password-hasher.js';
import type { ISessionRepository } from './auth/session.repository.js';
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from './errors.js';
import { LIMITS } from './input.js';
import { registerLabelRoutes } from './labels/label.controller.js';
import type { ILabelRepository } from './labels/label.repository.js';
import { LabelService } from './labels/label.service.js';
import { registerTodoRoutes } from './todos/todo.controller.js';
import type { ITodoRepository } from './todos/todo.repository.js';
import { TodoService } from './todos/todo.service.js';
import { registerUserRoutes } from './users/user.controller.js';
import type { IUserRepository } from './users/user.repository.js';
import { UserService } from './users/user.service.js';

const statusByError = [
  [NotFoundError, 404],
  [ValidationError, 400],
  [UnauthorizedError, 401],
  [ConflictError, 409],
] as const;

export interface IAppDependencies {
  todoRepository: ITodoRepository;
  labelRepository: ILabelRepository;
  userRepository: IUserRepository;
  sessionRepository: ISessionRepository;
}

export interface IAppOptions {
  /** Serve HTTPS directly. Omit when TLS is terminated by a proxy or the hosting platform. */
  https?: { key: Buffer; cert: Buffer };
  /** Trust X-Forwarded-* headers from a reverse proxy, so `req.ip` is the real client. */
  trustProxy?: boolean;
}

export const buildApp = (
  { todoRepository, labelRepository, userRepository, sessionRepository }: IAppDependencies,
  { https, trustProxy = false }: IAppOptions = {},
): FastifyInstance => {
  const app = Fastify({ logger: true, trustProxy, bodyLimit: LIMITS.bodyBytes, ...(https && { https }) });

  app.setErrorHandler((error, _req, reply) => {
    const match = statusByError.find(([type]) => error instanceof type);
    if (match) return reply.code(match[1]).send({ error: (error as Error).message });
    return reply.send(error);
  });

  app.register(cookie);

  // Composition root: services and controllers are wired onto the injected repositories
  const hasher = new PasswordHasher();
  const auth = new AuthService(userRepository, sessionRepository, hasher);
  const requireUser = createRequireUser(auth);

  registerAuthRoutes(app, auth);
  registerUserRoutes(app, new UserService(userRepository, hasher), requireUser);
  registerTodoRoutes(app, new TodoService(todoRepository, labelRepository));
  registerLabelRoutes(app, new LabelService(labelRepository, todoRepository));

  return app;
};
