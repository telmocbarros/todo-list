import type { FastifyInstance, onRequestAsyncHookHandler } from 'fastify';
import { currentUser } from '../auth/auth.controller.js';
import { idParams, type IIdParams } from '../http.js';
import { LIMITS, MULTI_LINE_TEXT, SINGLE_LINE_TEXT } from '../input.js';
import { PRIORITIES } from './priority.js';
import type { CreateTodoDTO, UpdateTodoDTO } from './todo.dto.js';
import type { TodoService } from './todo.service.js';

const dueDate = { type: ['string', 'null'], format: 'date-time' } as const;

const createProperties = {
  title: { type: 'string', maxLength: LIMITS.titleLength, pattern: SINGLE_LINE_TEXT },
  description: { type: 'string', maxLength: LIMITS.descriptionLength, pattern: MULTI_LINE_TEXT },
  priority: { type: 'string', enum: PRIORITIES.map((p) => p.level) },
  labelIds: {
    type: 'array',
    maxItems: LIMITS.labelsPerTodo,
    items: { type: 'string', maxLength: LIMITS.idLength },
  },
  dueDate,
} as const;

// New todos always start incomplete, so `completed` can only be changed afterwards
const patchProperties = { ...createProperties, completed: { type: 'boolean' } } as const;

export const registerTodoRoutes = (
  app: FastifyInstance,
  service: TodoService,
  requireUser: onRequestAsyncHookHandler,
): void => {
  // Public: the fixed list holds no user data
  app.get('/priorities', async () => PRIORITIES);

  // Every todo route needs a signed-in user, checked before the body is validated
  const signedIn = { onRequest: requireUser };

  app.get('/todos', signedIn, async (req) => service.list(currentUser(req).id));

  app.get<{ Params: IIdParams }>('/todos/:id', { ...signedIn, schema: { params: idParams } }, async (req) =>
    service.get(currentUser(req).id, req.params.id),
  );

  app.post<{ Body: CreateTodoDTO }>(
    '/todos',
    {
      ...signedIn,
      schema: {
        body: {
          type: 'object',
          properties: createProperties,
          required: ['title'],
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => reply.code(201).send(await service.create(currentUser(req).id, req.body)),
  );

  app.patch<{ Params: IIdParams; Body: UpdateTodoDTO }>(
    '/todos/:id',
    {
      ...signedIn,
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
    async (req) => service.update(currentUser(req).id, req.params.id, req.body),
  );

  app.delete<{ Params: IIdParams }>(
    '/todos/:id',
    { ...signedIn, schema: { params: idParams } },
    async (req, reply) => {
      await service.remove(currentUser(req).id, req.params.id);
      return reply.code(204).send();
    },
  );
};
