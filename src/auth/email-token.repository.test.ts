import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDependencies } from '../test/dependencies.js';
import { createTestUser } from '../test/users.js';
import type { EmailTokenModel } from './email-token.model.js';
import type { IEmailTokenRepository } from './email-token.repository.js';

describe('EmailTokenRepository', () => {
  let tokens: IEmailTokenRepository;
  let closeDatabase: () => void;

  const token = (overrides: Partial<EmailTokenModel> = {}): EmailTokenModel => ({
    id: 't1',
    userId: 'u1',
    type: 'verify',
    tokenHash: 'hash-1',
    expiresAt: '2030-01-02T00:00:00.000Z',
    usedAt: null,
    createdAt: '2030-01-01T00:00:00.000Z',
    ...overrides,
  });

  beforeEach(async () => {
    const { emailTokenRepository, userRepository, close } = await createTestDependencies();
    tokens = emailTokenRepository;
    closeDatabase = close;
    await createTestUser(userRepository, 'u1');
    await createTestUser(userRepository, 'u2');
  });

  afterEach(() => closeDatabase());

  it('saves and finds a token by its hash and type', async () => {
    await tokens.save(token());
    expect(await tokens.findByHash('verify', 'hash-1')).toEqual(token());
    expect(await tokens.findByHash('reset', 'hash-1')).toBeUndefined();
    expect(await tokens.findByHash('verify', 'nope')).toBeUndefined();
  });

  it('marks a token used only once, so a link cannot be used twice', async () => {
    await tokens.save(token());
    expect(await tokens.markUsed('t1', '2030-01-01T01:00:00.000Z')).toBe(true);
    expect(await tokens.markUsed('t1', '2030-01-01T02:00:00.000Z')).toBe(false);
    expect((await tokens.findByHash('verify', 'hash-1'))?.usedAt).toBe('2030-01-01T01:00:00.000Z');
  });

  it("deletes a user's unused tokens of one type, leaving everything else", async () => {
    await tokens.save(token({ id: 'old', tokenHash: 'h-old' }));
    await tokens.save(token({ id: 'used', tokenHash: 'h-used', usedAt: '2030-01-01T01:00:00.000Z' }));
    await tokens.save(token({ id: 'reset', tokenHash: 'h-reset', type: 'reset' }));
    await tokens.save(token({ id: 'other', tokenHash: 'h-other', userId: 'u2' }));

    await tokens.deleteUnused('u1', 'verify');

    expect(await tokens.findByHash('verify', 'h-old')).toBeUndefined();
    expect(await tokens.findByHash('verify', 'h-used')).toBeDefined();
    expect(await tokens.findByHash('reset', 'h-reset')).toBeDefined();
    expect(await tokens.findByHash('verify', 'h-other')).toBeDefined();
  });

  it('deletes used and expired tokens, keeping those that still work', async () => {
    await tokens.save(token({ id: 'used', tokenHash: 'h-used', usedAt: '2030-01-01T01:00:00.000Z' }));
    await tokens.save(token({ id: 'expired', tokenHash: 'h-expired', expiresAt: '2030-01-01T12:00:00.000Z' }));
    await tokens.save(token({ id: 'expiring', tokenHash: 'h-expiring', expiresAt: '2030-01-01T13:00:00.000Z' }));
    await tokens.save(token({ id: 'live', tokenHash: 'h-live' }));

    expect(await tokens.deleteSpent('2030-01-01T13:00:00.000Z')).toBe(3);

    expect(await tokens.findByHash('verify', 'h-used')).toBeUndefined();
    expect(await tokens.findByHash('verify', 'h-expired')).toBeUndefined();
    expect(await tokens.findByHash('verify', 'h-expiring')).toBeUndefined();
    expect(await tokens.findByHash('verify', 'h-live')).toBeDefined();
  });

  it('rejects a token for a user that does not exist', async () => {
    await expect(tokens.save(token({ userId: 'ghost' }))).rejects.toThrow();
  });
});
