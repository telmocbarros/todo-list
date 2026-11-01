import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestRepositories } from '../test/repositories.js';
import type { IUserRepository } from '../users/user.repository.js';
import type { SessionModel } from './session.model.js';
import type { ISessionRepository } from './session.repository.js';

describe('SessionRepository', () => {
  let sessions: ISessionRepository;
  let users: IUserRepository;
  let closeDatabase: () => void;

  const session = (overrides: Partial<SessionModel> = {}): SessionModel => ({
    id: 'hash-1',
    userId: 'u1',
    createdAt: '2030-01-01T00:00:00.000Z',
    expiresAt: '2030-01-31T00:00:00.000Z',
    ...overrides,
  });

  beforeEach(async () => {
    const { sessionRepository, userRepository, close } = await createTestRepositories();
    sessions = sessionRepository;
    users = userRepository;
    closeDatabase = close;
    for (const id of ['u1', 'u2']) {
      await users.save({
        id,
        email: `${id}@example.com`,
        username: id,
        firstName: 'A',
        lastName: 'B',
        passwordHash: 'h',
        createdAt: '2030-01-01T00:00:00.000Z',
        updatedAt: '2030-01-01T00:00:00.000Z',
      });
    }
  });

  afterEach(() => closeDatabase());

  it('saves and finds a session by id', async () => {
    await sessions.save(session());
    expect(await sessions.findById('hash-1')).toEqual(session());
    expect(await sessions.findById('nope')).toBeUndefined();
  });

  it('moves the expiry of one session, leaving the others alone', async () => {
    await sessions.save(session({ id: 'a' }));
    await sessions.save(session({ id: 'b' }));
    await sessions.updateExpiry('a', '2030-02-15T00:00:00.000Z');
    expect((await sessions.findById('a'))?.expiresAt).toBe('2030-02-15T00:00:00.000Z');
    expect((await sessions.findById('b'))?.expiresAt).toBe(session().expiresAt);
  });

  it('deletes a session', async () => {
    await sessions.save(session());
    await sessions.delete('hash-1');
    expect(await sessions.findById('hash-1')).toBeUndefined();
  });

  it('deletes every session of one user, leaving other users signed in', async () => {
    await sessions.save(session({ id: 'a', userId: 'u1' }));
    await sessions.save(session({ id: 'b', userId: 'u1' }));
    await sessions.save(session({ id: 'c', userId: 'u2' }));
    await sessions.deleteAllForUser('u1');
    expect(await sessions.findById('a')).toBeUndefined();
    expect(await sessions.findById('b')).toBeUndefined();
    expect(await sessions.findById('c')).toBeDefined();
  });

  it('rejects a session for a user that does not exist', async () => {
    await expect(sessions.save(session({ userId: 'ghost' }))).rejects.toThrow();
  });
});
