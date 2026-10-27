import Fastify, { type FastifyInstance } from 'fastify';
import { ConflictError, NotFoundError, ValidationError } from './errors.js';
import { registerLabelRoutes } from './labels/label.controller.js';
import type { ILabelRepository } from './labels/label.repository.js';
import { LabelService } from './labels/label.service.js';
import { registerTodoRoutes } from './todos/todo.controller.js';
import type { ITodoRepository } from './todos/todo.repository.js';
import { TodoService } from './todos/todo.service.js';

const statusByError = [
  [NotFoundError, 404],
  [ValidationError, 400],
  [ConflictError, 409],
] as const;

export interface IAppDependencies {
  todoRepository: ITodoRepository;
  labelRepository: ILabelRepository;
}

export interface IAppOptions {
  /** Serve HTTPS directly. Omit when TLS is terminated by a proxy or the hosting platform. */
  https?: { key: Buffer; cert: Buffer };
  /** Trust X-Forwarded-* headers from a reverse proxy, so `req.ip` is the real client. */
  trustProxy?: boolean;
}

export const buildApp = (
  { todoRepository, labelRepository }: IAppDependencies,
  { https, trustProxy = false }: IAppOptions = {},
): FastifyInstance => {
  const app = Fastify({ logger: true, trustProxy, ...(https && { https }) });

  app.setErrorHandler((error, _req, reply) => {
    const match = statusByError.find(([type]) => error instanceof type);
    if (match) return reply.code(match[1]).send({ error: (error as Error).message });
    return reply.send(error);
  });

  // Composition root: services and controllers are wired onto the injected repositories
  registerTodoRoutes(app, new TodoService(todoRepository, labelRepository));
  registerLabelRoutes(app, new LabelService(labelRepository, todoRepository));

  return app;
};
