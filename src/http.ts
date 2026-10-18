export interface IdParams {
  id: string;
}

export const idParams = {
  type: 'object',
  properties: { id: { type: 'string' } },
  required: ['id'],
} as const;
