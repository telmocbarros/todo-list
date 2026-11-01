import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import { currentUser } from '../auth/auth.controller.js';
import { LIMITS, SINGLE_LINE_TEXT, USERNAME } from '../input.js';
import type { SignupDTO } from './user.dto.js';
import type { UserService } from './user.service.js';

const personName = { type: 'string', maxLength: LIMITS.personNameLength, pattern: SINGLE_LINE_TEXT } as const;

export const registerUserRoutes = (
  app: FastifyInstance,
  service: UserService,
  requireUser: preHandlerAsyncHookHandler,
): void => {
  app.post<{ Body: SignupDTO }>(
    '/auth/signup',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            email: { type: 'string', format: 'email', maxLength: LIMITS.emailLength },
            username: {
              type: 'string',
              minLength: LIMITS.usernameMinLength,
              maxLength: LIMITS.usernameMaxLength,
              pattern: USERNAME,
            },
            firstName: personName,
            lastName: personName,
            password: {
              type: 'string',
              minLength: LIMITS.passwordMinLength,
              maxLength: LIMITS.passwordMaxLength,
            },
          },
          required: ['email', 'username', 'firstName', 'lastName', 'password'],
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => reply.code(201).send(await service.signup(req.body)),
  );

  app.get('/me', { preHandler: requireUser }, async (req) => service.get(currentUser(req).id));
};
