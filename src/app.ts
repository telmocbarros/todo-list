import Fastify, { type FastifyInstance } from 'fastify';
import { ConflictError, NotFoundError, ValidationError } from './errors.js';
import { registerLabelRoutes } from './labels/label.controller.js';
import { InMemoryLabelRepository } from './labels/label.repository.js';
import { LabelService } from './labels/label.service.js';
import { registerTodoRoutes } from './todos/todo.controller.js';
import { InMemoryTodoRepository } from './todos/todo.repository.js';
import { TodoService } from './todos/todo.service.js';

const statusByError = [
  [NotFoundError, 404],
  [ValidationError, 400],
  [ConflictError, 409],
] as const;

export const buildApp = (): FastifyInstance => {
  const app = Fastify({ logger: true });

  app.setErrorHandler((error, _req, reply) => {
    const match = statusByError.find(([type]) => error instanceof type);
    if (match) return reply.code(match[1]).send({ error: (error as Error).message });
    return reply.send(error);
  });

  // Composition root: repository -> service -> controller
  const todoRepository = new InMemoryTodoRepository();
  const labelRepository = new InMemoryLabelRepository();
  registerTodoRoutes(app, new TodoService(todoRepository, labelRepository));
  registerLabelRoutes(app, new LabelService(labelRepository, todoRepository));

  return app;
};
