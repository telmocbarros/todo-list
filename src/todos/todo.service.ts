import { randomUUID } from 'node:crypto';
import { NotFoundError } from '../errors.js';
import type { NewTodo, Todo, TodoPatch } from './todo.model.js';
import type { TodoRepository } from './todo.repository.js';

export class TodoService {
  constructor(private readonly repository: TodoRepository) {}

  list(): Promise<Todo[]> {
    return this.repository.findAll();
  }

  async get(id: string): Promise<Todo> {
    const todo = await this.repository.findById(id);
    if (!todo) throw new NotFoundError('Todo');
    return todo;
  }

  create({ title }: NewTodo): Promise<Todo> {
    const now = new Date().toISOString();
    return this.repository.save({
      id: randomUUID(),
      title: title.trim(),
      completed: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  async update(id: string, patch: TodoPatch): Promise<Todo> {
    const existing = await this.get(id);
    const title = patch.title?.trim();
    return this.repository.save({
      ...existing,
      ...patch,
      ...(title !== undefined && { title }),
      updatedAt: new Date().toISOString(),
    });
  }

  async remove(id: string): Promise<void> {
    if (!(await this.repository.delete(id))) throw new NotFoundError('Todo');
  }
}
