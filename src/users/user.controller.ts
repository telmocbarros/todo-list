import type { FastifyInstance, onRequestAsyncHookHandler } from 'fastify';
import { currentUser } from '../auth/auth.controller.js';
import { LIMITS, SINGLE_LINE_TEXT, TOKEN, USERNAME } from '../input.js';
import type { TRateLimitRouteOptions } from '../rate-limit/rate-limit.js';
import type { ResendVerificationDTO, SignupDTO, VerifyEmailDTO } from './user.dto.js';
import type { UserService } from './user.service.js';

const personName = { type: 'string', maxLength: LIMITS.personNameLength, pattern: SINGLE_LINE_TEXT } as const;

/** The one answer to signup and resend, whatever happened: the outcome is told to the inbox. */
const CHECK_EMAIL = { message: 'Check your email to continue' };

export interface IUserRateLimits {
  signup: TRateLimitRouteOptions;
  resendVerification: TRateLimitRouteOptions;
}

export const registerUserRoutes = (
  app: FastifyInstance,
  service: UserService,
  requireUser: onRequestAsyncHookHandler,
  rateLimits: IUserRateLimits,
): void => {
  app.post<{ Body: SignupDTO }>(
    '/auth/signup',
    {
      ...rateLimits.signup,
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
    async (req, reply) => {
      await service.signup(req.body);
      return reply.code(202).send(CHECK_EMAIL);
    },
  );

  app.post<{ Body: VerifyEmailDTO }>(
    '/auth/verify-email',
    {
      schema: {
        body: {
          type: 'object',
          properties: { token: { type: 'string', maxLength: LIMITS.tokenLength, pattern: TOKEN } },
          required: ['token'],
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      await service.verifyEmail(req.body.token);
      return reply.code(204).send();
    },
  );

  app.post<{ Body: ResendVerificationDTO }>(
    '/auth/resend-verification',
    {
      ...rateLimits.resendVerification,
      schema: {
        body: {
          type: 'object',
          properties: { email: { type: 'string', maxLength: LIMITS.emailLength } },
          required: ['email'],
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      await service.resendVerification(req.body.email);
      return reply.code(202).send(CHECK_EMAIL);
    },
  );

  app.get('/me', { onRequest: requireUser }, async (req) => service.get(currentUser(req).id));
};
