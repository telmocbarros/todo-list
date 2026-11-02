import { randomUUID } from 'node:crypto';
import { NotFoundError, ValidationError } from '../errors.js';
import { cleanText, normalizeText } from '../input.js';
import type { ILabelRepository } from '../labels/label.repository.js';
import { DEFAULT_PRIORITY } from './priority.js';
import type { CreateTodoDTO, UpdateTodoDTO } from './todo.dto.js';
import type { TodoModel } from './todo.model.js';
import type { ITodoRepository } from './todo.repository.js';

const normalizeDate = (date: string | null | undefined): string | null =>
  date ? new Date(date).toISOString() : null;

/**
 * Every method acts on behalf of one user, `userId`. Another user's todo is reported as not found,
 * so the API never reveals which ids exist.
 */
export class TodoService {
  constructor(
    private readonly repository: ITodoRepository,
    private readonly labels: ILabelRepository,
  ) {}

  /** Only the user's own labels count: another user's label id is as unknown as a made-up one. */
  private async resolveLabelIds(userId: string, labelIds: string[]): Promise<string[]> {
    const unique = [...new Set(labelIds)];
    for (const id of unique) {
      if (!(await this.labels.findById(userId, id))) throw new ValidationError(`Label ${id} does not exist`);
    }
    return unique;
  }

  list(userId: string): Promise<TodoModel[]> {
    return this.repository.findAll(userId);
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
    const now = new Date().toISOString();
    return this.repository.save(userId, {
      id: randomUUID(),
      title: cleanText(title),
      description: normalizeText(description),
      completed: false,
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
    return this.repository.save(userId, {
      ...existing,
      ...patch,
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(labelIds !== undefined && { labelIds }),
      ...(patch.dueDate !== undefined && { dueDate: normalizeDate(patch.dueDate) }),
      updatedAt: new Date().toISOString(),
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    if (!(await this.repository.delete(userId, id))) throw new NotFoundError('Todo');
  }
}
