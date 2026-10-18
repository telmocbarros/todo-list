export type Priority = 'low' | 'medium' | 'high';
export type PriorityColor = 'green' | 'yellow' | 'red';

export interface PriorityDefinition {
  level: Priority;
  color: PriorityColor;
}

export const PRIORITIES: readonly PriorityDefinition[] = [
  { level: 'low', color: 'green' },
  { level: 'medium', color: 'yellow' },
  { level: 'high', color: 'red' },
];

export const DEFAULT_PRIORITY: Priority = 'low';
