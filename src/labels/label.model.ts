export interface Label {
  id: string;
  name: string;
  color: string;
}

export type NewLabel = Pick<Label, 'name' | 'color'>;
export type LabelPatch = Partial<Pick<Label, 'name' | 'color'>>;
