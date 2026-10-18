import { randomUUID } from 'node:crypto';
import { ConflictError, NotFoundError } from '../errors.js';
import type { ITodoRepository } from '../todos/todo.repository.js';
import type { CreateLabelDTO, UpdateLabelDTO } from './label.dto.js';
import type { LabelModel } from './label.model.js';
import type { ILabelRepository } from './label.repository.js';

export class LabelService {
  constructor(
    private readonly repository: ILabelRepository,
    private readonly todos: ITodoRepository,
  ) {}

  private async assertNameAvailable(name: string, ownId?: string): Promise<void> {
    const existing = await this.repository.findByName(name);
    if (existing && existing.id !== ownId) throw new ConflictError(`Label "${name}" already exists`);
  }

  list(): Promise<LabelModel[]> {
    return this.repository.findAll();
  }

  async get(id: string): Promise<LabelModel> {
    const label = await this.repository.findById(id);
    if (!label) throw new NotFoundError('Label');
    return label;
  }

  async create({ name, color }: CreateLabelDTO): Promise<LabelModel> {
    const trimmed = name.trim();
    await this.assertNameAvailable(trimmed);
    return this.repository.save({ id: randomUUID(), name: trimmed, color });
  }

  async update(id: string, patch: UpdateLabelDTO): Promise<LabelModel> {
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
