import { randomUUID } from 'node:crypto';
import { NotFoundError, ValidationError } from '../errors.js';
import { cleanText, normalizeText } from '../input.js';
import type { ILabelRepository } from '../labels/label.repository.js';
import { DEFAULT_PRIORITY } from './priority.js';
import type { CreateTodoDTO, UpdateTodoDTO } from './todo.dto.js';
import type { TodoModel } from './todo.model.js';
import type { ITodoCursor, ITodoRepository } from './todo.repository.js';

const normalizeDate = (date: string | null | undefined): string | null =>
  date ? new Date(date).toISOString() : null;

export interface ITodoServiceOptions {
  now?: () => Date;
}

export interface IHistoryQuery {
  limit: number;
  /** The `nextCursor` of the previous page; omitted for the first page. */
  cursor?: string;
}

export interface ITodoPage {
  items: TodoModel[];
  /** Pass back as `cursor` for the next page; null on the last page. */
  nextCursor: string | null;
}

// Cursors are opaque to clients: base64url JSON of the last item's [completedAt, id]
const encodeCursor = (todo: TodoModel): string =>
  Buffer.from(JSON.stringify([todo.completedAt, todo.id])).toString('base64url');

const decodeCursor = (cursor: string): ITodoCursor => {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    if (Array.isArray(parsed) && parsed.length === 2 && parsed.every((part) => typeof part === 'string')) {
      return { completedAt: parsed[0], id: parsed[1] };
    }
  } catch {
    // Not base64url JSON: rejected below like any other malformed cursor
  }
  throw new ValidationError('Invalid cursor');
};

/**
 * Every method acts on behalf of one user, `userId`. Another user's todo is reported as not found,
 * so the API never reveals which ids exist.
 */
export class TodoService {
  private readonly now: () => Date;

  constructor(
    private readonly repository: ITodoRepository,
    private readonly labels: ILabelRepository,
    { now = () => new Date() }: ITodoServiceOptions = {},
  ) {
    this.now = now;
  }

  /**
   * Completing stamps `completedAt`; completing an already completed todo keeps the first stamp.
   * Reopening leaves it, so the todo stays in the history. Clearing it is a separate, explicit request,
   * and only for a todo that is not completed: a completed todo is always in the history.
   */
  private completedAt(existing: TodoModel, patch: UpdateTodoDTO, now: string): string | null {
    const completed = patch.completed ?? existing.completed;
    if (patch.completedAt === null) {
      if (completed) throw new ValidationError('Reopen the todo before removing it from the history');
      return null;
    }
    return completed && !existing.completed ? now : existing.completedAt;
  }

  /** Only the user's own labels count: another user's label id is as unknown as a made-up one. */
  private async resolveLabelIds(userId: string, labelIds: string[]): Promise<string[]> {
    const unique = [...new Set(labelIds)];
    for (const id of unique) {
      if (!(await this.labels.findById(userId, id))) throw new ValidationError(`Label ${id} does not exist`);
    }
    return unique;
  }

  /** The active list: todos not completed, in creation order. */
  list(userId: string): Promise<TodoModel[]> {
    return this.repository.findMany(userId, { status: 'active' });
  }

  /** One page of the history (todos ever completed and not cleared), newest first. */
  async history(userId: string, { limit, cursor }: IHistoryQuery): Promise<ITodoPage> {
    // One extra row tells whether another page follows, without a separate count
    const rows = await this.repository.findMany(userId, {
      status: 'history',
      limit: limit + 1,
      after: cursor === undefined ? undefined : decodeCursor(cursor),
    });
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return { items, nextCursor: rows.length > limit && last ? encodeCursor(last) : null };
  }

  async get(userId: string, id: string): Promise<TodoModel> {
    const todo = await this.repository.findById(userId, id);
    if (!todo) throw new NotFoundError('Todo');
    return todo;
  }

  async create(
    userId: string,
    { title, description = '', priority = DEFAULT_PRIORITY, labelIds = [], dueDate }: CreateTodoDTO,
  ): Promise<TodoModel> {
    const resolvedLabelIds = await this.resolveLabelIds(userId, labelIds);
    const now = this.now().toISOString();
    return this.repository.save(userId, {
      id: randomUUID(),
      title: cleanText(title),
      description: normalizeText(description),
      completed: false,
      completedAt: null,
      priority,
      labelIds: resolvedLabelIds,
      dueDate: normalizeDate(dueDate),
      createdAt: now,
      updatedAt: now,
    });
  }

  async update(userId: string, id: string, patch: UpdateTodoDTO): Promise<TodoModel> {
    const existing = await this.get(userId, id);
    const title = patch.title && cleanText(patch.title);
    const description = patch.description && normalizeText(patch.description);
    const labelIds = patch.labelIds && (await this.resolveLabelIds(userId, patch.labelIds));
    const now = this.now().toISOString();
    return this.repository.save(userId, {
      ...existing,
      ...patch,
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(labelIds !== undefined && { labelIds }),
      ...(patch.dueDate !== undefined && { dueDate: normalizeDate(patch.dueDate) }),
      completedAt: this.completedAt(existing, patch, now),
      updatedAt: now,
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    if (!(await this.repository.delete(userId, id))) throw new NotFoundError('Todo');
  }
}
