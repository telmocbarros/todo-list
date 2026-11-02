import { and, eq, sql } from 'drizzle-orm';
import type { TDatabase } from '../db/client.js';
import { labels } from '../db/schema.js';
import type { LabelModel } from './label.model.js';

/** Every method is scoped to one owner: a user can never see or change another user's labels. */
export interface ILabelRepository {
  findAll(userId: string): Promise<LabelModel[]>;
  findById(userId: string, id: string): Promise<LabelModel | undefined>;
  findByName(userId: string, name: string): Promise<LabelModel | undefined>;
  save(userId: string, label: LabelModel): Promise<LabelModel>;
  delete(userId: string, id: string): Promise<boolean>;
}

type TLabelRow = typeof labels.$inferSelect;

// The owner stays inside the repository; it is not part of the model the API returns
const toLabel = ({ userId: _userId, ...label }: TLabelRow): LabelModel => label;

export class LabelRepository implements ILabelRepository {
  constructor(private readonly db: TDatabase) {}

  async findAll(userId: string): Promise<LabelModel[]> {
    const rows = await this.db.select().from(labels).where(eq(labels.userId, userId)).orderBy(sql`rowid`);
    return rows.map(toLabel);
  }

  async findById(userId: string, id: string): Promise<LabelModel | undefined> {
    const [row] = await this.db
      .select()
      .from(labels)
      .where(and(eq(labels.id, id), eq(labels.userId, userId)));
    return row && toLabel(row);
  }

  async findByName(userId: string, name: string): Promise<LabelModel | undefined> {
    const [row] = await this.db
      .select()
      .from(labels)
      .where(and(eq(labels.userId, userId), sql`lower(${labels.name}) = lower(${name})`));
    return row && toLabel(row);
  }

  async save(userId: string, label: LabelModel): Promise<LabelModel> {
    const [saved] = await this.db
      .insert(labels)
      .values({ ...label, userId })
      // An id that exists under another owner is left untouched, so nothing is returned
      .onConflictDoUpdate({ target: labels.id, set: label, setWhere: eq(labels.userId, userId) })
      .returning();
    if (!saved) throw new Error(`Label ${label.id} belongs to another user`);
    return toLabel(saved);
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const result = await this.db.delete(labels).where(and(eq(labels.id, id), eq(labels.userId, userId)));
    return result.rowsAffected > 0;
  }
}
