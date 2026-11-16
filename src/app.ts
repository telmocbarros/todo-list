import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { createRequireUser, registerAuthRoutes } from './auth/auth.controller.js';
import { AuthService } from './auth/auth.service.js';
import type { IEmailTokenRepository } from './auth/email-token.repository.js';
import { EmailTokenService } from './auth/email-token.service.js';
import { PasswordHasher } from './auth/password-hasher.js';
import { registerPasswordResetRoutes } from './auth/password-reset.controller.js';
import { PasswordResetService } from './auth/password-reset.service.js';
import type { ISessionRepository } from './auth/session.repository.js';
import type { TRateLimiterKind } from './config.js';
import { createCrossSiteWriteGuard } from './csrf.js';
import { AccountEmails } from './email/account-emails.js';
import { type IEmailSender, sendInBackground } from './email/email-sender.js';
import { runPeriodically } from './jobs/run-periodically.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from './errors.js';
import { LIMITS } from './input.js';
import { registerLabelRoutes } from './labels/label.controller.js';
import { setUpRateLimits } from './rate-limit/rate-limit.js';
import type { ILabelRepository } from './labels/label.repository.js';
import { LabelService } from './labels/label.service.js';
import { registerTodoRoutes } from './todos/todo.controller.js';
import type { ITodoRepository } from './todos/todo.repository.js';
import { TodoService } from './todos/todo.service.js';
import { registerUserRoutes } from './users/user.controller.js';
import type { IUserRepository } from './users/user.repository.js';
import { UserService } from './users/user.service.js';

const statusByError = [
  [NotFoundError, 404],
  [ValidationError, 400],
  [UnauthorizedError, 401],
  [ForbiddenError, 403],
  [ConflictError, 409],
  [TooManyRequestsError, 429],
] as const;

export interface IAppDependencies {
  todoRepository: ITodoRepository;
  labelRepository: ILabelRepository;
  userRepository: IUserRepository;
  sessionRepository: ISessionRepository;
  emailTokenRepository: IEmailTokenRepository;
  emailSender: IEmailSender;
}

export interface IAppOptions {
  /** Serve HTTPS directly. Omit when TLS is terminated by a proxy or the hosting platform. */
  https?: { key: Buffer; cert: Buffer };
  /** Trust X-Forwarded-* headers from a reverse proxy, so `req.ip` is the real client. */
  trustProxy?: boolean;
  /** Other origins allowed to send writes, such as a UI on a different domain. */
  allowedOrigins?: string[];
  /** Which rate limiter guards login and signup: the plugin (default) or our own. */
  rateLimiter?: TRateLimiterKind;
  /** Where the web UI lives, for the links in emails. */
  appUrl?: string;
  /** How often to delete used and expired email tokens, starting once the app is ready. Off when omitted. */
  cleanupIntervalMs?: number;
}

export const buildApp = (
  {
    todoRepository,
    labelRepository,
    userRepository,
    sessionRepository,
    emailTokenRepository,
    emailSender,
  }: IAppDependencies,
  {
    https,
    trustProxy = false,
    allowedOrigins = [],
    rateLimiter = 'plugin',
    appUrl = 'http://localhost:3000',
    cleanupIntervalMs,
  }: IAppOptions = {},
): FastifyInstance => {
  const app = Fastify({ logger: true, trustProxy, bodyLimit: LIMITS.bodyBytes, ...(https && { https }) });

  app.setErrorHandler((error, _req, reply) => {
    const match = statusByError.find(([type]) => error instanceof type);
    if (match) return reply.code(match[1]).send({ error: (error as Error).message });
    return reply.send(error);
  });

  app.addHook('onRequest', createCrossSiteWriteGuard(allowedOrigins));
  app.register(cookie);
  const rateLimits = setUpRateLimits(app, rateLimiter);

  // Composition root: services and controllers are wired onto the injected repositories
  const hasher = new PasswordHasher();
  const auth = new AuthService(userRepository, sessionRepository, hasher);
  const requireUser = createRequireUser(auth);
  const emails = new AccountEmails(
    sendInBackground(emailSender, (err, { to, subject }) => app.log.error({ err, to, subject }, 'Email failed')),
    appUrl,
  );
  const tokens = new EmailTokenService(emailTokenRepository);
  const users = new UserService(userRepository, hasher, tokens, emails);
  const resets = new PasswordResetService(userRepository, sessionRepository, hasher, tokens, emails);

  if (cleanupIntervalMs) {
    let stopCleanup = () => {};
    app.addHook('onReady', async () => {
      stopCleanup = runPeriodically(
        async () => {
          const deleted = await tokens.deleteSpent();
          if (deleted > 0) app.log.info({ deleted }, 'Deleted spent email tokens');
        },
        cleanupIntervalMs,
        (err) => app.log.error({ err }, 'Token cleanup failed'),
      );
    });
    app.addHook('onClose', async () => stopCleanup());
  }

  // Routes go in a plugin, so they load after the plugins above; the rate-limit plugin
  // can only attach to routes added once it has loaded
  app.register(async (api) => {
    // Liveness probe for load balancers and orchestrators: public, no database access
    api.get('/health', async () => ({ status: 'ok' }));
    registerAuthRoutes(api, auth, rateLimits.login);
    registerUserRoutes(api, users, requireUser, rateLimits);
    registerPasswordResetRoutes(api, resets, rateLimits.forgotPassword);
    registerTodoRoutes(api, new TodoService(todoRepository, labelRepository), requireUser);
    registerLabelRoutes(api, new LabelService(labelRepository, todoRepository), requireUser);
  });

  return app;
};
