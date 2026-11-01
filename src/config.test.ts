import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('uses defaults: port 3000, local database, plain HTTP, no proxy, no extra origins, the plugin limiter', () => {
    expect(loadConfig({})).toEqual({
      port: 3000,
      databasePath: './data/todo-list.db',
      tls: undefined,
      trustProxy: false,
      allowedOrigins: [],
      rateLimiter: 'plugin',
    });
  });

  it('reads ALLOWED_ORIGINS as a comma-separated list of origins, normalized', () => {
    const config = loadConfig({ ALLOWED_ORIGINS: 'https://app.example.com, http://localhost:5173/' });
    expect(config.allowedOrigins).toEqual(['https://app.example.com', 'http://localhost:5173']);
  });

  it('rejects an allowed origin that is not a plain origin', () => {
    expect(() => loadConfig({ ALLOWED_ORIGINS: 'not a url' })).toThrow(/ALLOWED_ORIGINS/);
    expect(() => loadConfig({ ALLOWED_ORIGINS: 'https://app.example.com/path' })).toThrow(/ALLOWED_ORIGINS/);
  });

  it('chooses the rate limiter with RATE_LIMITER, and rejects unknown values', () => {
    expect(loadConfig({ RATE_LIMITER: 'custom' }).rateLimiter).toBe('custom');
    expect(loadConfig({ RATE_LIMITER: 'plugin' }).rateLimiter).toBe('plugin');
    expect(() => loadConfig({ RATE_LIMITER: 'redis' })).toThrow(/RATE_LIMITER/);
  });

  it('reads PORT and DATABASE_PATH', () => {
    const config = loadConfig({ PORT: '8080', DATABASE_PATH: '/data/todo.db' });
    expect(config).toMatchObject({ port: 8080, databasePath: '/data/todo.db' });
  });

  it('enables TLS when both the key and certificate paths are set', () => {
    const config = loadConfig({ TLS_KEY_PATH: '/certs/key.pem', TLS_CERT_PATH: '/certs/cert.pem' });
    expect(config.tls).toEqual({ keyPath: '/certs/key.pem', certPath: '/certs/cert.pem' });
  });

  it('rejects a key without a certificate, and the other way round', () => {
    expect(() => loadConfig({ TLS_KEY_PATH: '/certs/key.pem' })).toThrow(/TLS_KEY_PATH and TLS_CERT_PATH/);
    expect(() => loadConfig({ TLS_CERT_PATH: '/certs/cert.pem' })).toThrow(/TLS_KEY_PATH and TLS_CERT_PATH/);
  });

  it('trusts the proxy only when TRUST_PROXY is "true"', () => {
    expect(loadConfig({ TRUST_PROXY: 'true' }).trustProxy).toBe(true);
    expect(loadConfig({ TRUST_PROXY: 'false' }).trustProxy).toBe(false);
    expect(loadConfig({ TRUST_PROXY: '1' }).trustProxy).toBe(false);
  });

  it('rejects an invalid PORT', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
  });
});
