import { randomUUID } from 'node:crypto';
import { ConflictError, NotFoundError } from '../errors.js';
import { cleanText } from '../input.js';
import type { ITodoRepository } from '../todos/todo.repository.js';
import type { CreateLabelDTO, UpdateLabelDTO } from './label.dto.js';
import type { LabelModel } from './label.model.js';
import type { ILabelRepository } from './label.repository.js';

/**
 * Every method acts on behalf of one user, `userId`. Names are unique per user, and another user's
 * label is reported as not found, so the API never reveals which ids exist.
 */
export class LabelService {
  constructor(
    private readonly repository: ILabelRepository,
    private readonly todos: ITodoRepository,
  ) {}

  private async assertNameAvailable(userId: string, name: string, ownId?: string): Promise<void> {
    const existing = await this.repository.findByName(userId, name);
    if (existing && existing.id !== ownId) throw new ConflictError(`Label "${name}" already exists`);
  }

  list(userId: string): Promise<LabelModel[]> {
    return this.repository.findAll(userId);
  }

  async get(userId: string, id: string): Promise<LabelModel> {
    const label = await this.repository.findById(userId, id);
    if (!label) throw new NotFoundError('Label');
    return label;
  }

  async create(userId: string, { name, color }: CreateLabelDTO): Promise<LabelModel> {
    const cleaned = cleanText(name);
    await this.assertNameAvailable(userId, cleaned);
    return this.repository.save(userId, { id: randomUUID(), name: cleaned, color });
  }

  async update(userId: string, id: string, patch: UpdateLabelDTO): Promise<LabelModel> {
    const existing = await this.get(userId, id);
    const name = patch.name && cleanText(patch.name);
    if (name !== undefined) await this.assertNameAvailable(userId, name, id);
    return this.repository.save(userId, { ...existing, ...patch, ...(name !== undefined && { name }) });
  }

  async remove(userId: string, id: string): Promise<void> {
    if (!(await this.repository.delete(userId, id))) throw new NotFoundError('Label');
    await this.todos.removeLabel(userId, id);
  }
}
