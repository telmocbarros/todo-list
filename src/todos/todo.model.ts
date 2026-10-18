import type { TPriority } from './priority.js';

export interface TodoModel {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  priority: TPriority;
  labelIds: string[];
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}
