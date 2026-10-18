import type { LabelModel } from './label.model.js';

export interface ILabelRepository {
  findAll(): Promise<LabelModel[]>;
  findById(id: string): Promise<LabelModel | undefined>;
  findByName(name: string): Promise<LabelModel | undefined>;
  save(label: LabelModel): Promise<LabelModel>;
  delete(id: string): Promise<boolean>;
}
