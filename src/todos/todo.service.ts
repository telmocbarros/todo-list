import { randomUUID } from 'node:crypto';
import { NotFoundError, ValidationError } from '../errors.js';
import type { ILabelRepository } from '../labels/label.repository.js';
import { DEFAULT_PRIORITY } from './priority.js';
import type { CreateTodoDTO, UpdateTodoDTO } from './todo.dto.js';
import type { TodoModel } from './todo.model.js';
import type { ITodoRepository } from './todo.repository.js';

const normalizeDate = (date: string | null | undefined): string | null =>
  date ? new Date(date).toISOString() : null;

export class TodoService {
  constructor(
    private readonly repository: ITodoRepository,
    private readonly labels: ILabelRepository,
  ) {}

  private async resolveLabelIds(labelIds: string[]): Promise<string[]> {
    const unique = [...new Set(labelIds)];
    for (const id of unique) {
      if (!(await this.labels.findById(id))) throw new ValidationError(`Label ${id} does not exist`);
    }
    return unique;
  }

  list(): Promise<TodoModel[]> {
    return this.repository.findAll();
  }

  async get(id: string): Promise<TodoModel> {
    const todo = await this.repository.findById(id);
    if (!todo) throw new NotFoundError('Todo');
    return todo;
  }

  async create({ title, description = '', priority = DEFAULT_PRIORITY, labelIds = [], dueDate }: CreateTodoDTO): Promise<TodoModel> {
    const resolvedLabelIds = await this.resolveLabelIds(labelIds);
    const now = new Date().toISOString();
    return this.repository.save({
      id: randomUUID(),
      title: title.trim(),
      description,
      completed: false,
      priority,
      labelIds: resolvedLabelIds,
      dueDate: normalizeDate(dueDate),
      createdAt: now,
      updatedAt: now,
    });
  }

  async update(id: string, patch: UpdateTodoDTO): Promise<TodoModel> {
    const existing = await this.get(id);
    const title = patch.title?.trim();
    const labelIds = patch.labelIds && (await this.resolveLabelIds(patch.labelIds));
    return this.repository.save({
      ...existing,
      ...patch,
      ...(title !== undefined && { title }),
      ...(labelIds !== undefined && { labelIds }),
      ...(patch.dueDate !== undefined && { dueDate: normalizeDate(patch.dueDate) }),
      updatedAt: new Date().toISOString(),
    });
  }

  async remove(id: string): Promise<void> {
    if (!(await this.repository.delete(id))) throw new NotFoundError('Todo');
  }
}
