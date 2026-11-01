import { eq } from 'drizzle-orm';
import type { TDatabase } from '../db/client.js';
import { sessions } from '../db/schema.js';
import type { SessionModel } from './session.model.js';

export interface ISessionRepository {
  findById(id: string): Promise<SessionModel | undefined>;
  save(session: SessionModel): Promise<SessionModel>;
  delete(id: string): Promise<void>;
  deleteAllForUser(userId: string): Promise<void>;
}

export class SessionRepository implements ISessionRepository {
  constructor(private readonly db: TDatabase) {}

  async findById(id: string): Promise<SessionModel | undefined> {
    const [session] = await this.db.select().from(sessions).where(eq(sessions.id, id));
    return session;
  }

  async save(session: SessionModel): Promise<SessionModel> {
    await this.db.insert(sessions).values(session);
    return session;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.id, id));
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.userId, userId));
  }
}
