import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('uses defaults: port 3000, local database, plain HTTP, no proxy', () => {
    expect(loadConfig({})).toEqual({
      port: 3000,
      databasePath: './data/todo-list.db',
      tls: undefined,
      trustProxy: false,
    });
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
