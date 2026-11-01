import { hash, verify } from '@node-rs/argon2';

export interface IPasswordHasher {
  hash(password: string): Promise<string>;
  /** Resolves false, never throws, for a wrong password or a malformed stored hash. */
  verify(passwordHash: string, password: string): Promise<boolean>;
}

// OWASP's minimum argon2id profile: 19 MiB of memory, 2 iterations, 1 lane
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export class PasswordHasher implements IPasswordHasher {
  hash(password: string): Promise<string> {
    return hash(password, OPTIONS);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }
}
