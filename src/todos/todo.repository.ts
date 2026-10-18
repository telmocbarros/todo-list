import type { TodoModel } from './todo.model.js';

export interface ITodoRepository {
  findAll(): Promise<TodoModel[]>;
  findById(id: string): Promise<TodoModel | undefined>;
  save(todo: TodoModel): Promise<TodoModel>;
  delete(id: string): Promise<boolean>;
  removeLabel(labelId: string): Promise<void>;
}
