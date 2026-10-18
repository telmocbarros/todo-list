import type { Priority } from './priority.js';

export interface Todo {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  priority: Priority;
  labelIds: string[];
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NewTodo = Pick<Todo, 'title'> &
  Partial<Pick<Todo, 'description' | 'priority' | 'labelIds' | 'dueDate'>>;
export type TodoPatch = Partial<
  Pick<Todo, 'title' | 'description' | 'completed' | 'priority' | 'labelIds' | 'dueDate'>
>;
