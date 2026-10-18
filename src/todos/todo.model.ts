export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NewTodo = Pick<Todo, 'title'> & Partial<Pick<Todo, 'dueDate'>>;
export type TodoPatch = Partial<Pick<Todo, 'title' | 'completed' | 'dueDate'>>;
