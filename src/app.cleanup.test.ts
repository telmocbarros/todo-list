import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';
import { createTestDependencies } from './test/dependencies.js';
import { createTestUser } from './test/users.js';

describe('Token cleanup', () => {
  const cleanups: (() => Promise<unknown>)[] = [];
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup();
  });

  const startWithSpentToken = async (cleanupIntervalMs?: number) => {
    const dependencies = await createTestDependencies();
    await createTestUser(dependencies.userRepository, 'u1');
    await dependencies.emailTokenRepository.save({
      id: 't1',
      userId: 'u1',
      type: 'verify',
      tokenHash: 'spent',
      expiresAt: '2000-01-02T00:00:00.000Z',
      usedAt: null,
      createdAt: '2000-01-01T00:00:00.000Z',
    });
    const app = buildApp(dependencies, { cleanupIntervalMs });
    cleanups.push(async () => {
      await app.close();
      dependencies.close();
    });
    await app.ready();
    return dependencies.emailTokenRepository;
  };

  it('deletes spent tokens once the app is ready, when an interval is set', async () => {
    const tokens = await startWithSpentToken(60_000);
    await vi.waitFor(async () => expect(await tokens.findByHash('verify', 'spent')).toBeUndefined());
  });

  it('does not run without an interval', async () => {
    const tokens = await startWithSpentToken();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await tokens.findByHash('verify', 'spent')).toBeDefined();
  });
});
