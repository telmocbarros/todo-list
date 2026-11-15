import type { FastifyInstance } from 'fastify';
import { CHECK_EMAIL, emailTokenSchema, newPasswordSchema } from '../http.js';
import { LIMITS } from '../input.js';
import type { TRateLimitRouteOptions } from '../rate-limit/rate-limit.js';
import type { ForgotPasswordDTO, ResetPasswordDTO } from './auth.dto.js';
import type { PasswordResetService } from './password-reset.service.js';

export const registerPasswordResetRoutes = (
  app: FastifyInstance,
  service: PasswordResetService,
  forgotPasswordRateLimit: TRateLimitRouteOptions,
): void => {
  app.post<{ Body: ForgotPasswordDTO }>(
    '/auth/forgot-password',
    {
      ...forgotPasswordRateLimit,
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
      await service.requestReset(req.body.email);
      return reply.code(202).send(CHECK_EMAIL);
    },
  );

  app.post<{ Body: ResetPasswordDTO }>(
    '/auth/reset-password',
    {
      schema: {
        body: {
          type: 'object',
          properties: { token: emailTokenSchema, password: newPasswordSchema },
          required: ['token', 'password'],
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      await service.reset(req.body.token, req.body.password);
      return reply.code(204).send();
    },
  );
};
