import { randomUUID } from 'node:crypto';

export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export type NewTodo = Pick<Todo, 'title'> & Partial<Pick<Todo, 'completed'>>;
export type TodoPatch = Partial<Pick<Todo, 'title' | 'completed'>>;

const todos = new Map<string, Todo>();

export const listTodos = (): Todo[] => [...todos.values()];

export const getTodo = (id: string): Todo | undefined => todos.get(id);

export const createTodo = ({ title, completed = false }: NewTodo): Todo => {
  const now = new Date().toISOString();
  const todo: Todo = { id: randomUUID(), title, completed, createdAt: now, updatedAt: now };
  todos.set(todo.id, todo);
  return todo;
};

export const updateTodo = (id: string, patch: TodoPatch): Todo | undefined => {
  const existing = todos.get(id);
  if (!existing) return undefined;
  const updated: Todo = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  todos.set(id, updated);
  return updated;
};

export const deleteTodo = (id: string): boolean => todos.delete(id);
