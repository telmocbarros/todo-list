import Fastify, { type FastifyInstance } from 'fastify';
import {
  createTodo,
  deleteTodo,
  getTodo,
  listTodos,
  updateTodo,
  type NewTodo,
  type TodoPatch,
} from './todos.js';

interface IdParams {
  id: string;
}

const idParams = {
  type: 'object',
  properties: { id: { type: 'string' } },
  required: ['id'],
} as const;

export const buildApp = (): FastifyInstance => {
  const app = Fastify({ logger: true });

  app.get('/todos', async () => listTodos());

  app.get<{ Params: IdParams }>('/todos/:id', { schema: { params: idParams } }, async (req, reply) => {
    const todo = getTodo(req.params.id);
    return todo ?? reply.code(404).send({ error: 'Todo not found' });
  });

  app.post<{ Body: NewTodo }>(
    '/todos',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            title: { type: 'string', minLength: 1 },
            completed: { type: 'boolean' },
          },
          required: ['title'],
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => reply.code(201).send(createTodo(req.body)),
  );

  app.patch<{ Params: IdParams; Body: TodoPatch }>(
    '/todos/:id',
    {
      schema: {
        params: idParams,
        body: {
          type: 'object',
          properties: {
            title: { type: 'string', minLength: 1 },
            completed: { type: 'boolean' },
          },
          minProperties: 1,
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      const todo = updateTodo(req.params.id, req.body);
      return todo ?? reply.code(404).send({ error: 'Todo not found' });
    },
  );

  app.delete<{ Params: IdParams }>('/todos/:id', { schema: { params: idParams } }, async (req, reply) => {
    return deleteTodo(req.params.id)
      ? reply.code(204).send()
      : reply.code(404).send({ error: 'Todo not found' });
  });

  return app;
};
