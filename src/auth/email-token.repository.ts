import { and, eq, isNull } from 'drizzle-orm';
import type { TDatabase } from '../db/client.js';
import { emailTokens } from '../db/schema.js';
import type { EmailTokenModel, TEmailTokenType } from './email-token.model.js';

export interface IEmailTokenRepository {
  findByHash(type: TEmailTokenType, tokenHash: string): Promise<EmailTokenModel | undefined>;
  save(token: EmailTokenModel): Promise<EmailTokenModel>;
  /** Marks a token used, returning false if it already was: of two concurrent uses, only one wins. */
  markUsed(id: string, usedAt: string): Promise<boolean>;
  /** Deletes a user's unused tokens of one type, so only the newest link works. */
  deleteUnused(userId: string, type: TEmailTokenType): Promise<void>;
}

export class EmailTokenRepository implements IEmailTokenRepository {
  constructor(private readonly db: TDatabase) {}

  async findByHash(type: TEmailTokenType, tokenHash: string): Promise<EmailTokenModel | undefined> {
    const [token] = await this.db
      .select()
      .from(emailTokens)
      .where(and(eq(emailTokens.type, type), eq(emailTokens.tokenHash, tokenHash)));
    return token;
  }

  async save(token: EmailTokenModel): Promise<EmailTokenModel> {
    await this.db.insert(emailTokens).values(token);
    return token;
  }

  async markUsed(id: string, usedAt: string): Promise<boolean> {
    const marked = await this.db
      .update(emailTokens)
      .set({ usedAt })
      .where(and(eq(emailTokens.id, id), isNull(emailTokens.usedAt)))
      .returning({ id: emailTokens.id });
    return marked.length > 0;
  }

  async deleteUnused(userId: string, type: TEmailTokenType): Promise<void> {
    await this.db
      .delete(emailTokens)
      .where(and(eq(emailTokens.userId, userId), eq(emailTokens.type, type), isNull(emailTokens.usedAt)));
  }
}
