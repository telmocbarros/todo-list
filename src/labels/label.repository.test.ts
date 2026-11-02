import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestRepositories } from '../test/repositories.js';
import { createTestUser } from '../test/users.js';
import type { LabelModel } from './label.model.js';
import type { ILabelRepository } from './label.repository.js';

const label = (id: string, name = id): LabelModel => ({ id, name, color: '#ff8800' });

describe('ILabelRepository', () => {
  let labels: ILabelRepository;
  let ada: string;
  let bob: string;
  let closeDatabase: () => void;

  beforeEach(async () => {
    const { labelRepository, userRepository, close } = await createTestRepositories();
    labels = labelRepository;
    closeDatabase = close;
    ada = await createTestUser(userRepository, 'ada');
    bob = await createTestUser(userRepository, 'bob');
  });

  afterEach(() => closeDatabase());

  it('saves and finds a label by id', async () => {
    await labels.save(ada, label('1', 'Work'));
    expect(await labels.findById(ada, '1')).toEqual(label('1', 'Work'));
    expect(await labels.findById(ada, 'nope')).toBeUndefined();
  });

  it('lists labels in insertion order', async () => {
    await labels.save(ada, label('1', 'b'));
    await labels.save(ada, label('2', 'a'));
    await labels.save(ada, { ...label('1', 'b'), color: '#000000' });
    expect((await labels.findAll(ada)).map((l) => l.id)).toEqual(['1', '2']);
  });

  it('updates an existing label when saved again', async () => {
    await labels.save(ada, label('1', 'Work'));
    await labels.save(ada, { ...label('1', 'Job'), color: '#000000' });
    expect(await labels.findById(ada, '1')).toEqual({ id: '1', name: 'Job', color: '#000000' });
    expect(await labels.findAll(ada)).toHaveLength(1);
  });

  it('finds a label by name, ignoring case', async () => {
    await labels.save(ada, label('1', 'Work'));
    expect((await labels.findByName(ada, 'wORK'))?.id).toBe('1');
    expect(await labels.findByName(ada, 'Home')).toBeUndefined();
  });

  it('deletes a label and reports whether it existed', async () => {
    await labels.save(ada, label('1'));
    expect(await labels.delete(ada, '1')).toBe(true);
    expect(await labels.delete(ada, '1')).toBe(false);
  });

  describe('ownership', () => {
    it("lists and finds only the owner's labels", async () => {
      await labels.save(ada, label('a1', 'Work'));
      await labels.save(bob, label('b1', 'Home'));
      expect((await labels.findAll(ada)).map((l) => l.id)).toEqual(['a1']);
      expect(await labels.findById(bob, 'a1')).toBeUndefined();
      expect(await labels.findByName(bob, 'Work')).toBeUndefined();
    });

    it("cannot delete another user's label", async () => {
      await labels.save(ada, label('a1'));
      expect(await labels.delete(bob, 'a1')).toBe(false);
      expect(await labels.findById(ada, 'a1')).toBeDefined();
    });

    it("cannot overwrite another user's label by saving the same id", async () => {
      await labels.save(ada, label('a1', 'Work'));
      await labels.save(bob, label('a1', 'Hijacked')).catch(() => {});
      expect(await labels.findById(ada, 'a1')).toEqual(label('a1', 'Work'));
      expect(await labels.findById(bob, 'a1')).toBeUndefined();
    });

    it('allows the same label name for different users, since names are unique per user', async () => {
      await labels.save(ada, label('a1', 'Work'));
      await expect(labels.save(bob, label('b1', 'work'))).resolves.toBeDefined();
      await expect(labels.save(ada, label('a2', 'WORK'))).rejects.toThrow();
    });
  });
});
