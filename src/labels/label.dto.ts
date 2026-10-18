import type { LabelModel } from './label.model.js';

export type CreateLabelDTO = Pick<LabelModel, 'name' | 'color'>;

export type UpdateLabelDTO = Partial<Pick<LabelModel, 'name' | 'color'>>;
