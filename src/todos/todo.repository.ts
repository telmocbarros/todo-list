import type { TodoModel } from './todo.model.js';

export interface ITodoRepository {
  findAll(): Promise<TodoModel[]>;
  findById(id: string): Promise<TodoModel | undefined>;
  save(todo: TodoModel): Promise<TodoModel>;
  delete(id: string): Promise<boolean>;
  removeLabel(labelId: string): Promise<void>;
}

export class InMemoryTodoRepository implements ITodoRepository {
  private readonly todos = new Map<string, TodoModel>();

  async findAll(): Promise<TodoModel[]> {
    return [...this.todos.values()];
  }

  async findById(id: string): Promise<TodoModel | undefined> {
    return this.todos.get(id);
  }

  async save(todo: TodoModel): Promise<TodoModel> {
    this.todos.set(todo.id, todo);
    return todo;
  }

  async delete(id: string): Promise<boolean> {
    return this.todos.delete(id);
  }

  async removeLabel(labelId: string): Promise<void> {
    for (const todo of this.todos.values()) {
      if (todo.labelIds.includes(labelId)) {
        this.todos.set(todo.id, { ...todo, labelIds: todo.labelIds.filter((id) => id !== labelId) });
      }
    }
  }
}
