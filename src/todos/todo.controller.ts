import type { FastifyInstance } from 'fastify';
import type { NewTodo, TodoPatch } from './todo.model.js';
import type { TodoService } from './todo.service.js';

interface IdParams {
  id: string;
}

const idParams = {
  type: 'object',
  properties: { id: { type: 'string' } },
  required: ['id'],
} as const;

const todoProperties = {
  // At least one non-whitespace character
  title: { type: 'string', pattern: '\\S' },
  completed: { type: 'boolean' },
} as const;

export const registerTodoRoutes = (app: FastifyInstance, service: TodoService): void => {
  app.get('/todos', async () => service.list());

  app.get<{ Params: IdParams }>('/todos/:id', { schema: { params: idParams } }, async (req) =>
    service.get(req.params.id),
  );

  app.post<{ Body: NewTodo }>(
    '/todos',
    {
      schema: {
        body: {
          type: 'object',
          properties: { title: todoProperties.title },
          required: ['title'],
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => reply.code(201).send(await service.create(req.body)),
  );

  app.patch<{ Params: IdParams; Body: TodoPatch }>(
    '/todos/:id',
    {
      schema: {
        params: idParams,
        body: {
          type: 'object',
          properties: todoProperties,
          minProperties: 1,
          additionalProperties: false,
        },
      },
    },
    async (req) => service.update(req.params.id, req.body),
  );

  app.delete<{ Params: IdParams }>('/todos/:id', { schema: { params: idParams } }, async (req, reply) => {
    await service.remove(req.params.id);
    return reply.code(204).send();
  });
};
