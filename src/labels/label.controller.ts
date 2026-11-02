import type { FastifyInstance, onRequestAsyncHookHandler } from 'fastify';
import { currentUser } from '../auth/auth.controller.js';
import { idParams, type IIdParams } from '../http.js';
import { LIMITS, SINGLE_LINE_TEXT } from '../input.js';
import type { CreateLabelDTO, UpdateLabelDTO } from './label.dto.js';
import type { LabelService } from './label.service.js';

const labelProperties = {
  name: { type: 'string', maxLength: LIMITS.labelNameLength, pattern: SINGLE_LINE_TEXT },
  // Hex colour, e.g. #ff8800
  color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
} as const;

export const registerLabelRoutes = (
  app: FastifyInstance,
  service: LabelService,
  requireUser: onRequestAsyncHookHandler,
): void => {
  // Every label route needs a signed-in user, checked before the body is validated
  const signedIn = { onRequest: requireUser };

  app.get('/labels', signedIn, async (req) => service.list(currentUser(req).id));

  app.get<{ Params: IIdParams }>('/labels/:id', { ...signedIn, schema: { params: idParams } }, async (req) =>
    service.get(currentUser(req).id, req.params.id),
  );

  app.post<{ Body: CreateLabelDTO }>(
    '/labels',
    {
      ...signedIn,
      schema: {
        body: {
          type: 'object',
          properties: labelProperties,
          required: ['name', 'color'],
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => reply.code(201).send(await service.create(currentUser(req).id, req.body)),
  );

  app.patch<{ Params: IIdParams; Body: UpdateLabelDTO }>(
    '/labels/:id',
    {
      ...signedIn,
      schema: {
        params: idParams,
        body: {
          type: 'object',
          properties: labelProperties,
          minProperties: 1,
          additionalProperties: false,
        },
      },
    },
    async (req) => service.update(currentUser(req).id, req.params.id, req.body),
  );

  app.delete<{ Params: IIdParams }>(
    '/labels/:id',
    { ...signedIn, schema: { params: idParams } },
    async (req, reply) => {
      await service.remove(currentUser(req).id, req.params.id);
      return reply.code(204).send();
    },
  );
};
