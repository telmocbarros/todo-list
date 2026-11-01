export interface ITlsPaths {
  keyPath: string;
  certPath: string;
}

export const RATE_LIMITERS = ['plugin', 'custom'] as const;
export type TRateLimiterKind = (typeof RATE_LIMITERS)[number];

export interface IAppConfig {
  port: number;
  databasePath: string;
  /** Set when the app terminates TLS itself; leave unset behind a proxy or host that does it. */
  tls: ITlsPaths | undefined;
  /** Trust X-Forwarded-* headers; only enable behind a reverse proxy you control. */
  trustProxy: boolean;
  /** Other origins allowed to send writes, such as a UI served from a different domain. */
  allowedOrigins: string[];
  /** `plugin` uses @fastify/rate-limit; `custom` uses our own sliding-window limiter. */
  rateLimiter: TRateLimiterKind;
}

/** A bare origin (scheme, host, optional port), normalized; anything with a path is rejected. */
const parseOrigin = (value: string): string => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`ALLOWED_ORIGINS must contain origins such as https://app.example.com, got "${value}"`);
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`ALLOWED_ORIGINS must contain origins without a path, got "${value}"`);
  }
  return url.origin;
};

export const loadConfig = (env: NodeJS.ProcessEnv): IAppConfig => {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT must be an integer between 0 and 65535, got "${env.PORT}"`);
  }

  const { TLS_KEY_PATH: keyPath, TLS_CERT_PATH: certPath } = env;
  if (Boolean(keyPath) !== Boolean(certPath)) {
    throw new Error('TLS_KEY_PATH and TLS_CERT_PATH must be set together');
  }

  const rateLimiter = env.RATE_LIMITER ?? 'plugin';
  if (!RATE_LIMITERS.includes(rateLimiter as TRateLimiterKind)) {
    throw new Error(`RATE_LIMITER must be one of ${RATE_LIMITERS.join(', ')}, got "${rateLimiter}"`);
  }

  return {
    port,
    databasePath: env.DATABASE_PATH ?? './data/todo-list.db',
    tls: keyPath && certPath ? { keyPath, certPath } : undefined,
    trustProxy: env.TRUST_PROXY === 'true',
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
      .map(parseOrigin),
    rateLimiter: rateLimiter as TRateLimiterKind,
  };
};
