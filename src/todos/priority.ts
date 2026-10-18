export type TPriority = 'low' | 'medium' | 'high';
export type TPriorityColor = 'green' | 'yellow' | 'red';

export interface IPriorityDefinition {
  level: TPriority;
  color: TPriorityColor;
}

export const PRIORITIES: readonly IPriorityDefinition[] = [
  { level: 'low', color: 'green' },
  { level: 'medium', color: 'yellow' },
  { level: 'high', color: 'red' },
];

export const DEFAULT_PRIORITY: TPriority = 'low';
