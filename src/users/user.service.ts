import { randomUUID } from 'node:crypto';
import type { IPasswordHasher } from '../auth/password-hasher.js';
import { ConflictError, NotFoundError } from '../errors.js';
import { cleanText } from '../input.js';
import type { SignupDTO } from './user.dto.js';
import type { TPublicUser, UserModel } from './user.model.js';
import type { IUserRepository } from './user.repository.js';

const toPublicUser = ({ passwordHash: _passwordHash, ...user }: UserModel): TPublicUser => user;

export class UserService {
  constructor(
    private readonly repository: IUserRepository,
    private readonly hasher: IPasswordHasher,
  ) {}

  async signup({ email, username, firstName, lastName, password }: SignupDTO): Promise<TPublicUser> {
    const normalizedEmail = cleanText(email).toLowerCase();
    const cleanedUsername = cleanText(username);

    // One generic message for both, so the response does not reveal which of them has an account
    const taken =
      (await this.repository.findByEmail(normalizedEmail)) ?? (await this.repository.findByUsername(cleanedUsername));
    if (taken) throw new ConflictError('Email or username is already in use');

    const now = new Date().toISOString();
    const user = await this.repository.save({
      id: randomUUID(),
      email: normalizedEmail,
      username: cleanedUsername,
      firstName: cleanText(firstName),
      lastName: cleanText(lastName),
      passwordHash: await this.hasher.hash(password),
      createdAt: now,
      updatedAt: now,
    });
    return toPublicUser(user);
  }

  async get(id: string): Promise<TPublicUser> {
    const user = await this.repository.findById(id);
    if (!user) throw new NotFoundError('User');
    return toPublicUser(user);
  }
}
