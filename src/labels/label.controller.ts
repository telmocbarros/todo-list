import type { FastifyInstance } from 'fastify';
import { idParams, type IIdParams } from '../http.js';
import type { CreateLabelDTO, UpdateLabelDTO } from './label.dto.js';
import type { LabelService } from './label.service.js';

const labelProperties = {
  // At least one non-whitespace character
  name: { type: 'string', pattern: '\\S' },
  // Hex colour, e.g. #ff8800
  color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
} as const;

export const registerLabelRoutes = (app: FastifyInstance, service: LabelService): void => {
  app.get('/labels', async () => service.list());

  app.get<{ Params: IIdParams }>('/labels/:id', { schema: { params: idParams } }, async (req) =>
    service.get(req.params.id),
  );

  app.post<{ Body: CreateLabelDTO }>(
    '/labels',
    {
      schema: {
        body: {
          type: 'object',
          properties: labelProperties,
          required: ['name', 'color'],
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => reply.code(201).send(await service.create(req.body)),
  );

  app.patch<{ Params: IIdParams; Body: UpdateLabelDTO }>(
    '/labels/:id',
    {
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
    async (req) => service.update(req.params.id, req.body),
  );

  app.delete<{ Params: IIdParams }>('/labels/:id', { schema: { params: idParams } }, async (req, reply) => {
    await service.remove(req.params.id);
    return reply.code(204).send();
  });
};
