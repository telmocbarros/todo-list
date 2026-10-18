import type { Todo } from './todo.model.js';

export interface TodoRepository {
  findAll(): Promise<Todo[]>;
  findById(id: string): Promise<Todo | undefined>;
  save(todo: Todo): Promise<Todo>;
  delete(id: string): Promise<boolean>;
}

export class InMemoryTodoRepository implements TodoRepository {
  private readonly todos = new Map<string, Todo>();

  async findAll(): Promise<Todo[]> {
    return [...this.todos.values()];
  }

  async findById(id: string): Promise<Todo | undefined> {
    return this.todos.get(id);
  }

  async save(todo: Todo): Promise<Todo> {
    this.todos.set(todo.id, todo);
    return todo;
  }

  async delete(id: string): Promise<boolean> {
    return this.todos.delete(id);
  }
}
