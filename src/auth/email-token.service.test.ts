import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestRepositories } from '../test/repositories.js';
import { createTestUser } from '../test/users.js';
import type { IEmailTokenRepository } from './email-token.repository.js';
import { EmailTokenService } from './email-token.service.js';

const HOUR = 60 * 60 * 1000;
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('EmailTokenService', () => {
  let now: Date;
  let repository: IEmailTokenRepository;
  let tokens: EmailTokenService;
  let closeDatabase: () => void;

  const later = (ms: number) => (now = new Date(now.getTime() + ms));

  beforeEach(async () => {
    const { emailTokenRepository, userRepository, close } = await createTestRepositories();
    closeDatabase = close;
    repository = emailTokenRepository;
    now = new Date('2030-01-01T00:00:00.000Z');
    tokens = new EmailTokenService(repository, { now: () => now });
    await createTestUser(userRepository, 'u1');
  });

  afterEach(() => closeDatabase());

  it('issues 32 random URL-safe bytes, storing only their SHA-256 hash', async () => {
    const token = await tokens.issue('u1', 'verify');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await repository.findByHash('verify', token)).toBeUndefined();
    expect(await repository.findByHash('verify', sha256(token))).toMatchObject({ userId: 'u1', usedAt: null });
  });

  it("consumes a token once, returning its user's id", async () => {
    const token = await tokens.issue('u1', 'verify');
    expect(await tokens.consume('verify', token)).toBe('u1');
    expect(await tokens.consume('verify', token)).toBeUndefined();
  });

  it('refuses a token of the other type, or one never issued', async () => {
    const token = await tokens.issue('u1', 'verify');
    expect(await tokens.consume('reset', token)).toBeUndefined();
    expect(await tokens.consume('verify', 'made-up')).toBeUndefined();
  });

  it('expires verification links after 24 hours', async () => {
    const token = await tokens.issue('u1', 'verify');
    later(24 * HOUR);
    expect(await tokens.consume('verify', token)).toBeUndefined();
  });

  it('expires reset links after 1 hour, and accepts them just before', async () => {
    const first = await tokens.issue('u1', 'reset');
    later(HOUR - 1);
    expect(await tokens.consume('reset', first)).toBe('u1');

    const second = await tokens.issue('u1', 'reset');
    later(HOUR);
    expect(await tokens.consume('reset', second)).toBeUndefined();
  });

  it('cancels older unused links when a new one is issued', async () => {
    const old = await tokens.issue('u1', 'verify');
    const fresh = await tokens.issue('u1', 'verify');
    expect(await tokens.consume('verify', old)).toBeUndefined();
    expect(await tokens.consume('verify', fresh)).toBe('u1');
  });
});
