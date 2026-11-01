import { eq, sql } from 'drizzle-orm';
import type { TDatabase } from '../db/client.js';
import { users } from '../db/schema.js';
import type { UserModel } from './user.model.js';

export interface IUserRepository {
  findById(id: string): Promise<UserModel | undefined>;
  findByEmail(email: string): Promise<UserModel | undefined>;
  findByUsername(username: string): Promise<UserModel | undefined>;
  save(user: UserModel): Promise<UserModel>;
}

export class UserRepository implements IUserRepository {
  constructor(private readonly db: TDatabase) {}

  async findById(id: string): Promise<UserModel | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async findByEmail(email: string): Promise<UserModel | undefined> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = lower(${email})`);
    return user;
  }

  async findByUsername(username: string): Promise<UserModel | undefined> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(sql`lower(${users.username}) = lower(${username})`);
    return user;
  }

  async save(user: UserModel): Promise<UserModel> {
    const [saved] = await this.db
      .insert(users)
      .values(user)
      .onConflictDoUpdate({ target: users.id, set: user })
      .returning();
    return saved;
  }
}
