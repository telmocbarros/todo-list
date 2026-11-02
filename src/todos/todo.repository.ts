import { and, eq, inArray, sql } from 'drizzle-orm';
import type { TDatabase } from '../db/client.js';
import { todoLabels, todos } from '../db/schema.js';
import type { TodoModel } from './todo.model.js';

/** Every method is scoped to one owner: a user can never see or change another user's todos. */
export interface ITodoRepository {
  findAll(userId: string): Promise<TodoModel[]>;
  findById(userId: string, id: string): Promise<TodoModel | undefined>;
  save(userId: string, todo: TodoModel): Promise<TodoModel>;
  delete(userId: string, id: string): Promise<boolean>;
  removeLabel(userId: string, labelId: string): Promise<void>;
}

type TTodoRow = typeof todos.$inferSelect;

// The owner stays inside the repository; it is not part of the model the API returns
const toTodo = ({ userId: _userId, ...row }: TTodoRow, labelIds: string[]): TodoModel => ({ ...row, labelIds });

export class TodoRepository implements ITodoRepository {
  constructor(private readonly db: TDatabase) {}

  async findAll(userId: string): Promise<TodoModel[]> {
    const rows = await this.db.select().from(todos).where(eq(todos.userId, userId)).orderBy(sql`rowid`);
    const links = await this.db
      .select({ todoId: todoLabels.todoId, labelId: todoLabels.labelId })
      .from(todoLabels)
      .innerJoin(todos, eq(todoLabels.todoId, todos.id))
      .where(eq(todos.userId, userId))
      .orderBy(sql`${todoLabels}.rowid`);

    const labelIdsByTodo = new Map<string, string[]>();
    for (const { todoId, labelId } of links) {
      labelIdsByTodo.set(todoId, [...(labelIdsByTodo.get(todoId) ?? []), labelId]);
    }
    return rows.map((row) => toTodo(row, labelIdsByTodo.get(row.id) ?? []));
  }

  async findById(userId: string, id: string): Promise<TodoModel | undefined> {
    const [row] = await this.db
      .select()
      .from(todos)
      .where(and(eq(todos.id, id), eq(todos.userId, userId)));
    if (!row) return undefined;
    const links = await this.db
      .select({ labelId: todoLabels.labelId })
      .from(todoLabels)
      .where(eq(todoLabels.todoId, id))
      .orderBy(sql`rowid`);
    return toTodo(row, links.map((link) => link.labelId));
  }

  async save(userId: string, todo: TodoModel): Promise<TodoModel> {
    const { labelIds, ...row } = todo;
    await this.db.transaction(async (tx) => {
      const result = await tx
        .insert(todos)
        .values({ ...row, userId })
        // An id that exists under another owner is left untouched
        .onConflictDoUpdate({ target: todos.id, set: row, setWhere: eq(todos.userId, userId) });
      // Stop before touching its labels too; throwing rolls the transaction back
      if (result.rowsAffected === 0) throw new Error(`Todo ${todo.id} belongs to another user`);

      await tx.delete(todoLabels).where(eq(todoLabels.todoId, todo.id));
      if (labelIds.length > 0) {
        await tx.insert(todoLabels).values(labelIds.map((labelId) => ({ todoId: todo.id, labelId })));
      }
    });
    return todo;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const result = await this.db.delete(todos).where(and(eq(todos.id, id), eq(todos.userId, userId)));
    return result.rowsAffected > 0;
  }

  async removeLabel(userId: string, labelId: string): Promise<void> {
    const ownTodos = this.db.select({ id: todos.id }).from(todos).where(eq(todos.userId, userId));
    await this.db
      .delete(todoLabels)
      .where(and(eq(todoLabels.labelId, labelId), inArray(todoLabels.todoId, ownTodos)));
  }
}
