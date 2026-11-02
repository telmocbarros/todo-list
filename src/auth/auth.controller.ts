import type { FastifyInstance, FastifyRequest, onRequestAsyncHookHandler } from 'fastify';
import { UnauthorizedError } from '../errors.js';
import { LIMITS } from '../input.js';
import type { TRateLimitRouteOptions } from '../rate-limit/rate-limit.js';
import type { TPublicUser } from '../users/user.model.js';
import type { LoginDTO } from './auth.dto.js';
import type { AuthService } from './auth.service.js';

export const SESSION_COOKIE = 'sid';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the `requireUser` hook on routes that need a signed-in user. */
    user: TPublicUser | null;
  }
}

/**
 * Route hook: resolves the session cookie to a user, or rejects the request with 401.
 * Used as `onRequest`, so it runs before the body is validated: anonymous callers learn nothing else.
 */
export const createRequireUser = (auth: AuthService): onRequestAsyncHookHandler => async (req) => {
  const token = req.cookies[SESSION_COOKIE];
  const user = token ? await auth.authenticate(token) : undefined;
  if (!user) throw new UnauthorizedError('Authentication required');
  req.user = user;
};

/** The user set by `requireUser`. Controllers pass `currentUser(req).id` to services, never the request. */
export const currentUser = (req: FastifyRequest): TPublicUser => {
  if (!req.user) throw new UnauthorizedError('Authentication required');
  return req.user;
};

export const registerAuthRoutes = (
  app: FastifyInstance,
  auth: AuthService,
  loginRateLimit: TRateLimitRouteOptions,
): void => {
  app.decorateRequest('user', null);

  app.post<{ Body: LoginDTO }>(
    '/auth/login',
    {
      ...loginRateLimit,
      schema: {
        body: {
          type: 'object',
          properties: {
            email: { type: 'string', maxLength: LIMITS.emailLength },
            password: { type: 'string', maxLength: LIMITS.passwordMaxLength },
          },
          required: ['email', 'password'],
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      const { token, expiresAt, user } = await auth.login(req.body);
      reply.setCookie(SESSION_COOKIE, token, {
        httpOnly: true, // not readable from JavaScript, so an XSS bug cannot steal it
        secure: true, // HTTPS only; browsers still allow it on http://localhost
        sameSite: 'lax', // not sent on cross-site form posts, which blunts CSRF
        path: '/',
        expires: new Date(expiresAt),
      });
      return user;
    },
  );

  app.post('/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await auth.logout(token);
    return reply.clearCookie(SESSION_COOKIE, { path: '/' }).code(204).send();
  });
};
