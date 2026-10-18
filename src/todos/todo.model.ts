export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export type NewTodo = Pick<Todo, 'title'>;
export type TodoPatch = Partial<Pick<Todo, 'title' | 'completed'>>;
