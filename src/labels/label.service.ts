import { randomUUID } from 'node:crypto';
import { ConflictError, NotFoundError } from '../errors.js';
import type { TodoRepository } from '../todos/todo.repository.js';
import type { Label, LabelPatch, NewLabel } from './label.model.js';
import type { LabelRepository } from './label.repository.js';

export class LabelService {
  constructor(
    private readonly repository: LabelRepository,
    private readonly todos: TodoRepository,
  ) {}

  private async assertNameAvailable(name: string, ownId?: string): Promise<void> {
    const existing = await this.repository.findByName(name);
    if (existing && existing.id !== ownId) throw new ConflictError(`Label "${name}" already exists`);
  }

  list(): Promise<Label[]> {
    return this.repository.findAll();
  }

  async get(id: string): Promise<Label> {
    const label = await this.repository.findById(id);
    if (!label) throw new NotFoundError('Label');
    return label;
  }

  async create({ name, color }: NewLabel): Promise<Label> {
    const trimmed = name.trim();
    await this.assertNameAvailable(trimmed);
    return this.repository.save({ id: randomUUID(), name: trimmed, color });
  }

  async update(id: string, patch: LabelPatch): Promise<Label> {
    const existing = await this.get(id);
    const name = patch.name?.trim();
    if (name !== undefined) await this.assertNameAvailable(name, id);
    return this.repository.save({ ...existing, ...patch, ...(name !== undefined && { name }) });
  }

  async remove(id: string): Promise<void> {
    if (!(await this.repository.delete(id))) throw new NotFoundError('Label');
    await this.todos.removeLabel(id);
  }
}
