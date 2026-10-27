import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { request } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { createTestRepositories } from './test/repositories.js';

describe('transport: HTTPS and reverse proxy', () => {
  let dir: string;
  let key: Buffer;
  let cert: Buffer;
  let app: FastifyInstance | undefined;
  let closeDatabase: () => void;
  let repositories: Awaited<ReturnType<typeof createTestRepositories>>;

  // A throwaway self-signed certificate for localhost
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'todo-tls-'));
    execFileSync(
      'openssl',
      [
        ...['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost'],
        ...['-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'],
        ...['-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')],
      ],
      { stdio: 'ignore' },
    );
    key = readFileSync(join(dir, 'key.pem'));
    cert = readFileSync(join(dir, 'cert.pem'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    repositories = await createTestRepositories();
    closeDatabase = repositories.close;
  });

  afterEach(async () => {
    await app?.close();
    closeDatabase();
  });

  const get = (port: number, path: string) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = request({ host: 'localhost', port, path, ca: cert }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      });
      req.on('error', reject);
      req.end();
    });

  it('serves the API over HTTPS when a key and certificate are given', async () => {
    const { close: _close, ...deps } = repositories;
    app = buildApp(deps, { https: { key, cert } });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as AddressInfo;

    const res = await get(port, '/todos');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual([]);
  });

  describe('behind a reverse proxy', () => {
    const clientIp = async (trustProxy: boolean | undefined) => {
      const { close: _close, ...deps } = repositories;
      app = buildApp(deps, { trustProxy });
      let seen = '';
      app.addHook('onRequest', async (req) => {
        seen = req.ip;
      });
      await app.inject({ method: 'GET', url: '/todos', headers: { 'x-forwarded-for': '203.0.113.7' } });
      return seen;
    };

    it('uses the forwarded client address when trustProxy is on', async () => {
      expect(await clientIp(true)).toBe('203.0.113.7');
    });

    it('ignores forwarded headers by default, so they cannot be spoofed', async () => {
      expect(await clientIp(undefined)).toBe('127.0.0.1');
    });
  });
});
