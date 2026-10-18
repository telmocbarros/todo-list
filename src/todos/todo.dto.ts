import type { TodoModel } from './todo.model.js';

export type CreateTodoDTO = Pick<TodoModel, 'title'> &
  Partial<Pick<TodoModel, 'description' | 'priority' | 'labelIds' | 'dueDate'>>;

export type UpdateTodoDTO = Partial<
  Pick<TodoModel, 'title' | 'description' | 'completed' | 'priority' | 'labelIds' | 'dueDate'>
>;
