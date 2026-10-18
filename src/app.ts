import Fastify, { type FastifyInstance } from 'fastify';
import { NotFoundError } from './errors.js';
import { registerTodoRoutes } from './todos/todo.controller.js';
import { InMemoryTodoRepository } from './todos/todo.repository.js';
import { TodoService } from './todos/todo.service.js';

export const buildApp = (): FastifyInstance => {
  const app = Fastify({ logger: true });

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof NotFoundError) {
      return reply.code(404).send({ error: error.message });
    }
    return reply.send(error);
  });

  // Composition root: repository -> service -> controller
  const service = new TodoService(new InMemoryTodoRepository());
  registerTodoRoutes(app, service);

  return app;
};
