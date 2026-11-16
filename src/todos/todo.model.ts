import type { TPriority } from './priority.js';

export interface TodoModel {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  /** When the todo was last completed. Reopening keeps it; only an explicit clear removes it. */
  completedAt: string | null;
  priority: TPriority;
  labelIds: string[];
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}
