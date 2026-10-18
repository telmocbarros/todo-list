import type { LabelModel } from './label.model.js';

export interface ILabelRepository {
  findAll(): Promise<LabelModel[]>;
  findById(id: string): Promise<LabelModel | undefined>;
  findByName(name: string): Promise<LabelModel | undefined>;
  save(label: LabelModel): Promise<LabelModel>;
  delete(id: string): Promise<boolean>;
}

export class InMemoryLabelRepository implements ILabelRepository {
  private readonly labels = new Map<string, LabelModel>();

  async findAll(): Promise<LabelModel[]> {
    return [...this.labels.values()];
  }

  async findById(id: string): Promise<LabelModel | undefined> {
    return this.labels.get(id);
  }

  async findByName(name: string): Promise<LabelModel | undefined> {
    const lower = name.toLowerCase();
    return [...this.labels.values()].find((label) => label.name.toLowerCase() === lower);
  }

  async save(label: LabelModel): Promise<LabelModel> {
    this.labels.set(label.id, label);
    return label;
  }

  async delete(id: string): Promise<boolean> {
    return this.labels.delete(id);
  }
}
