import { eq, sql } from 'drizzle-orm';
import type { TDatabase } from '../db/client.js';
import { labels } from '../db/schema.js';
import type { LabelModel } from './label.model.js';

export interface ILabelRepository {
  findAll(): Promise<LabelModel[]>;
  findById(id: string): Promise<LabelModel | undefined>;
  findByName(name: string): Promise<LabelModel | undefined>;
  save(label: LabelModel): Promise<LabelModel>;
  delete(id: string): Promise<boolean>;
}

export class LabelRepository implements ILabelRepository {
  constructor(private readonly db: TDatabase) {}

  async findAll(): Promise<LabelModel[]> {
    return this.db.select().from(labels).orderBy(sql`rowid`);
  }

  async findById(id: string): Promise<LabelModel | undefined> {
    const [label] = await this.db.select().from(labels).where(eq(labels.id, id));
    return label;
  }

  async findByName(name: string): Promise<LabelModel | undefined> {
    const [label] = await this.db
      .select()
      .from(labels)
      .where(sql`lower(${labels.name}) = lower(${name})`);
    return label;
  }

  async save(label: LabelModel): Promise<LabelModel> {
    const [newLabel] = await this.db
      .insert(labels)
      .values(label)
      .onConflictDoUpdate({ target: labels.id, set: label })
      .returning();
    return newLabel;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(labels).where(eq(labels.id, id));
    return result.rowsAffected > 0;
  }
}
