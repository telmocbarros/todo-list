import type { FastifyInstance } from 'fastify';
import { idParams, type IIdParams } from '../http.js';
import { PRIORITIES } from './priority.js';
import type { CreateTodoDTO, UpdateTodoDTO } from './todo.dto.js';
import type { TodoService } from './todo.service.js';

const dueDate = { type: ['string', 'null'], format: 'date-time' } as const;

const createProperties = {
  // At least one non-whitespace character
  title: { type: 'string', pattern: '\\S' },
  description: { type: 'string' },
  priority: { type: 'string', enum: PRIORITIES.map((p) => p.level) },
  labelIds: { type: 'array', items: { type: 'string' } },
  dueDate,
} as const;

// New todos always start incomplete, so `completed` can only be changed afterwards
const patchProperties = { ...createProperties, completed: { type: 'boolean' } } as const;

export const registerTodoRoutes = (app: FastifyInstance, service: TodoService): void => {
  app.get('/priorities', async () => PRIORITIES);

  app.get('/todos', async () => service.list());

  app.get<{ Params: IIdParams }>('/todos/:id', { schema: { params: idParams } }, async (req) =>
    service.get(req.params.id),
  );

  app.post<{ Body: CreateTodoDTO }>(
    '/todos',
    {
      schema: {
        body: {
          type: 'object',
          properties: createProperties,
          required: ['title'],
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => reply.code(201).send(await service.create(req.body)),
  );

  app.patch<{ Params: IIdParams; Body: UpdateTodoDTO }>(
    '/todos/:id',
    {
      schema: {
        params: idParams,
        body: {
          type: 'object',
          properties: patchProperties,
          minProperties: 1,
          additionalProperties: false,
        },
      },
    },
    async (req) => service.update(req.params.id, req.body),
  );

  app.delete<{ Params: IIdParams }>('/todos/:id', { schema: { params: idParams } }, async (req, reply) => {
    await service.remove(req.params.id);
    return reply.code(204).send();
  });
};
