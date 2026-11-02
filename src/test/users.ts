import type { IUserRepository } from '../users/user.repository.js';

/** Saves a user straight to the repository, skipping signup and password hashing, and returns its id. */
export const createTestUser = async (users: IUserRepository, id: string): Promise<string> => {
  await users.save({
    id,
    email: `${id}@example.com`,
    username: id,
    firstName: 'Test',
    lastName: 'User',
    passwordHash: 'not-a-real-hash',
    createdAt: '2030-01-01T00:00:00.000Z',
    updatedAt: '2030-01-01T00:00:00.000Z',
  });
  return id;
};
