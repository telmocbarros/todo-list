import { eq, sql } from 'drizzle-orm';
import type { TDatabase } from '../db/client.js';
import { todoLabels, todos } from '../db/schema.js';
import type { TodoModel } from './todo.model.js';
import type { ITodoRepository } from './todo.repository.js';

type TTodoRow = typeof todos.$inferSelect;

const toTodo = (row: TTodoRow, labelIds: string[]): TodoModel => ({ ...row, labelIds });

export class PersistentTodoRepository implements ITodoRepository {
  constructor(private readonly db: TDatabase) {}

  async findAll(): Promise<TodoModel[]> {
    const rows = await this.db.select().from(todos).orderBy(sql`rowid`);
    const links = await this.db.select().from(todoLabels).orderBy(sql`rowid`);

    const labelIdsByTodo = new Map<string, string[]>();
    for (const { todoId, labelId } of links) {
      labelIdsByTodo.set(todoId, [...(labelIdsByTodo.get(todoId) ?? []), labelId]);
    }
    return rows.map((row) => toTodo(row, labelIdsByTodo.get(row.id) ?? []));
  }

  async findById(id: string): Promise<TodoModel | undefined> {
    const [row] = await this.db.select().from(todos).where(eq(todos.id, id));
    if (!row) return undefined;
    const links = await this.db
      .select({ labelId: todoLabels.labelId })
      .from(todoLabels)
      .where(eq(todoLabels.todoId, id))
      .orderBy(sql`rowid`);
    return toTodo(row, links.map((link) => link.labelId));
  }

  async save(todo: TodoModel): Promise<TodoModel> {
    const { labelIds, ...row } = todo;
    await this.db.transaction(async (tx) => {
      await tx.insert(todos).values(row).onConflictDoUpdate({ target: todos.id, set: row });
      await tx.delete(todoLabels).where(eq(todoLabels.todoId, todo.id));
      if (labelIds.length > 0) {
        await tx.insert(todoLabels).values(labelIds.map((labelId) => ({ todoId: todo.id, labelId })));
      }
    });
    return todo;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(todos).where(eq(todos.id, id));
    return result.rowsAffected > 0;
  }

  async removeLabel(labelId: string): Promise<void> {
    await this.db.delete(todoLabels).where(eq(todoLabels.labelId, labelId));
  }
}
