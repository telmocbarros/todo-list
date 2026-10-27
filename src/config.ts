export interface ITlsPaths {
  keyPath: string;
  certPath: string;
}

export interface IAppConfig {
  port: number;
  databasePath: string;
  /** Set when the app terminates TLS itself; leave unset behind a proxy or host that does it. */
  tls: ITlsPaths | undefined;
  /** Trust X-Forwarded-* headers; only enable behind a reverse proxy you control. */
  trustProxy: boolean;
}

export const loadConfig = (env: NodeJS.ProcessEnv): IAppConfig => {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT must be an integer between 0 and 65535, got "${env.PORT}"`);
  }

  const { TLS_KEY_PATH: keyPath, TLS_CERT_PATH: certPath } = env;
  if (Boolean(keyPath) !== Boolean(certPath)) {
    throw new Error('TLS_KEY_PATH and TLS_CERT_PATH must be set together');
  }

  return {
    port,
    databasePath: env.DATABASE_PATH ?? './data/todo-list.db',
    tls: keyPath && certPath ? { keyPath, certPath } : undefined,
    trustProxy: env.TRUST_PROXY === 'true',
  };
};
