import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError } from '../errors.js';
import { createTestRepositories } from '../test/repositories.js';
import { createTestUser } from '../test/users.js';
import { TodoService } from '../todos/todo.service.js';
import { LabelService } from './label.service.js';

describe('LabelService', () => {
  const color = '#000000';
  let service: LabelService;
  let todos: TodoService;
  let closeDatabase: () => void;

  let ada: string;
  let bob: string;

  beforeEach(async () => {
    const { todoRepository, labelRepository, userRepository, close } = await createTestRepositories();
    closeDatabase = close;
    service = new LabelService(labelRepository, todoRepository);
    todos = new TodoService(todoRepository, labelRepository);
    ada = await createTestUser(userRepository, 'ada');
    bob = await createTestUser(userRepository, 'bob');
  });

  afterEach(() => closeDatabase());

  it('creates a label with a trimmed name and the given color', async () => {
    const label = await service.create(ada, { name: '  Work ', color: '#00ff00' });
    expect(label).toMatchObject({ name: 'Work', color: '#00ff00' });
    expect(label.id).toBeTruthy();
  });

  it('rejects duplicate names, ignoring case', async () => {
    await service.create(ada, { name: 'Work', color });
    await expect(service.create(ada, { name: 'work', color })).rejects.toBeInstanceOf(ConflictError);
  });

  it('lists and gets labels', async () => {
    const a = await service.create(ada, { name: 'a', color });
    await service.create(ada, { name: 'b', color });
    expect((await service.list(ada)).map((l) => l.name)).toEqual(['a', 'b']);
    expect(await service.get(ada, a.id)).toEqual(a);
  });

  it('updates a label, allowing it to keep its own name', async () => {
    const a = await service.create(ada, { name: 'a', color });
    expect(await service.update(ada, a.id, { name: 'A', color: '#ff0000' })).toMatchObject({ name: 'A', color: '#ff0000' });
  });

  it('rejects renaming to another label name', async () => {
    await service.create(ada, { name: 'a', color });
    const b = await service.create(ada, { name: 'b', color });
    await expect(service.update(ada, b.id, { name: 'A' })).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws NotFoundError for unknown ids', async () => {
    await expect(service.get(ada, 'nope')).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.update(ada, 'nope', { name: 'x' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.remove(ada, 'nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('removes a label and detaches it from todos', async () => {
    const a = await service.create(ada, { name: 'a', color });
    const b = await service.create(ada, { name: 'b', color });
    const todo = await todos.create(ada, { title: 't', labelIds: [a.id, b.id] });
    await service.remove(ada, a.id);
    await expect(service.get(ada, a.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await todos.get(ada, todo.id)).labelIds).toEqual([b.id]);
  });

  it('stores names in NFC form, so look-alike spellings are the same label', async () => {
    const label = await service.create(ada, { name: 'Café', color });
    expect(label.name).toBe('Café');
    await expect(service.create(ada, { name: 'Café', color })).rejects.toBeInstanceOf(ConflictError);
  });

  describe('ownership', () => {
    it("treats another user's label as not found, so its existence is not revealed", async () => {
      const mine = await service.create(ada, { name: 'Work', color });
      await expect(service.get(bob, mine.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.update(bob, mine.id, { name: 'Hijacked' })).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.remove(bob, mine.id)).rejects.toBeInstanceOf(NotFoundError);
      expect((await service.get(ada, mine.id)).name).toBe('Work');
    });

    it('lists only your own labels', async () => {
      await service.create(ada, { name: 'Work', color });
      await service.create(bob, { name: 'Home', color });
      expect((await service.list(bob)).map((l) => l.name)).toEqual(['Home']);
    });

    it('lets different users have a label with the same name', async () => {
      await service.create(ada, { name: 'Work', color });
      await expect(service.create(bob, { name: 'work', color })).resolves.toMatchObject({ name: 'work' });
    });
  });
});
