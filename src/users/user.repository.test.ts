import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestRepositories } from '../test/repositories.js';
import type { UserModel } from './user.model.js';
import type { IUserRepository } from './user.repository.js';

const buildUser = (overrides: Partial<UserModel> = {}): UserModel => ({
  id: randomUUID(),
  email: 'ada@example.com',
  username: 'ada',
  firstName: 'Ada',
  lastName: 'Lovelace',
  passwordHash: '$argon2id$stored',
  createdAt: '2030-01-01T00:00:00.000Z',
  updatedAt: '2030-01-01T00:00:00.000Z',
  ...overrides,
});

describe('UserRepository', () => {
  let users: IUserRepository;
  let closeDatabase: () => void;

  beforeEach(async () => {
    const { userRepository, close } = await createTestRepositories();
    users = userRepository;
    closeDatabase = close;
  });

  afterEach(() => closeDatabase());

  it('saves and finds a user by id, keeping every field', async () => {
    const user = buildUser();
    await users.save(user);
    expect(await users.findById(user.id)).toEqual(user);
    expect(await users.findById('nope')).toBeUndefined();
  });

  it('finds a user by email, ignoring case', async () => {
    const user = await users.save(buildUser({ email: 'Ada@Example.com' }));
    expect((await users.findByEmail('ada@EXAMPLE.com'))?.id).toBe(user.id);
    expect(await users.findByEmail('nobody@example.com')).toBeUndefined();
  });

  it('finds a user by username, ignoring case', async () => {
    const user = await users.save(buildUser({ username: 'AdaL' }));
    expect((await users.findByUsername('adal'))?.id).toBe(user.id);
    expect(await users.findByUsername('nobody')).toBeUndefined();
  });

  it('updates an existing user when saved again', async () => {
    const user = await users.save(buildUser());
    await users.save({ ...user, firstName: 'Augusta' });
    expect((await users.findById(user.id))?.firstName).toBe('Augusta');
  });

  it('enforces unique emails and usernames case-insensitively at the database level', async () => {
    await users.save(buildUser({ email: 'ada@example.com', username: 'ada' }));
    await expect(users.save(buildUser({ email: 'ADA@example.com', username: 'other' }))).rejects.toThrow();
    await expect(users.save(buildUser({ email: 'other@example.com', username: 'ADA' }))).rejects.toThrow();
  });
});
