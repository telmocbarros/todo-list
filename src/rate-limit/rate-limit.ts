import rateLimitPlugin from '@fastify/rate-limit';
import type { FastifyInstance, onRequestAsyncHookHandler, RouteShorthandOptions } from 'fastify';
import type { TRateLimiterKind } from '../config.js';
import { TooManyRequestsError } from '../errors.js';
import { SlidingWindowRateLimiter } from './rate-limiter.js';

const MINUTE_MS = 60 * 1000;

/** Every attempt counts, per client IP. */
export const RATE_LIMITS = {
  login: { max: 10, windowMs: 15 * MINUTE_MS },
  signup: { max: 5, windowMs: 60 * MINUTE_MS },
} as const;

export type TRateLimitedRoute = keyof typeof RATE_LIMITS;
/** Options to spread into a route definition, so the route is limited by the chosen implementation. */
export type TRateLimitRouteOptions = Pick<RouteShorthandOptions, 'config' | 'onRequest'>;
type TRateLimitRoutes = Record<TRateLimitedRoute, TRateLimitRouteOptions>;

const TOO_MANY_REQUESTS = 'Too many requests, try again later';

const forEachRoute = (build: (route: TRateLimitedRoute) => TRateLimitRouteOptions): TRateLimitRoutes => {
  const options = {} as TRateLimitRoutes;
  for (const route of Object.keys(RATE_LIMITS) as TRateLimitedRoute[]) options[route] = build(route);
  return options;
};

/**
 * Sets up rate limiting with either implementation, returning the route options for each limited route.
 * Both answer a blocked request with 429, a `Retry-After` header in seconds and the same body.
 * Must run before the limited routes are registered: the plugin attaches to routes as they are added.
 */
export const setUpRateLimits = (app: FastifyInstance, kind: TRateLimiterKind): TRateLimitRoutes => {
  if (kind === 'plugin') {
    app.register(rateLimitPlugin, {
      global: false,
      // The plugin sets Retry-After, then throws this, so our error handler formats it like every other error
      errorResponseBuilder: () => new TooManyRequestsError(TOO_MANY_REQUESTS),
    });
    return forEachRoute((route) => {
      const { max, windowMs } = RATE_LIMITS[route];
      return { config: { rateLimit: { max, timeWindow: windowMs } } };
    });
  }

  const limiters = {
    login: new SlidingWindowRateLimiter(RATE_LIMITS.login),
    signup: new SlidingWindowRateLimiter(RATE_LIMITS.signup),
  } satisfies Record<TRateLimitedRoute, SlidingWindowRateLimiter>;

  // Forget clients that have gone quiet, so memory does not grow with every IP ever seen
  const sweeper = setInterval(() => Object.values(limiters).forEach((limiter) => limiter.sweep()), MINUTE_MS);
  sweeper.unref();
  app.addHook('onClose', async () => clearInterval(sweeper));

  return forEachRoute((route) => {
    const limiter = limiters[route];
    const onRequest: onRequestAsyncHookHandler = async (req, reply) => {
      const { allowed, retryAfterMs } = limiter.hit(req.ip);
      if (!allowed) {
        reply.header('retry-after', Math.ceil(retryAfterMs / 1000));
        throw new TooManyRequestsError(TOO_MANY_REQUESTS);
      }
    };
    return { onRequest };
  });
};
