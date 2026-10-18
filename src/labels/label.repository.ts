import type { Label } from './label.model.js';

export interface LabelRepository {
  findAll(): Promise<Label[]>;
  findById(id: string): Promise<Label | undefined>;
  findByName(name: string): Promise<Label | undefined>;
  save(label: Label): Promise<Label>;
  delete(id: string): Promise<boolean>;
}

export class InMemoryLabelRepository implements LabelRepository {
  private readonly labels = new Map<string, Label>();

  async findAll(): Promise<Label[]> {
    return [...this.labels.values()];
  }

  async findById(id: string): Promise<Label | undefined> {
    return this.labels.get(id);
  }

  async findByName(name: string): Promise<Label | undefined> {
    const lower = name.toLowerCase();
    return [...this.labels.values()].find((label) => label.name.toLowerCase() === lower);
  }

  async save(label: Label): Promise<Label> {
    this.labels.set(label.id, label);
    return label;
  }

  async delete(id: string): Promise<boolean> {
    return this.labels.delete(id);
  }
}
