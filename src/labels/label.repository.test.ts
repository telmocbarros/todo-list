import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestRepositories } from '../test/repositories.js';
import type { LabelModel } from './label.model.js';
import type { ILabelRepository } from './label.repository.js';

const label = (id: string, name = id): LabelModel => ({ id, name, color: '#ff8800' });

describe('ILabelRepository', () => {
  let labels: ILabelRepository;
  let closeDatabase: () => void;

  beforeEach(async () => {
    const { labelRepository, close } = await createTestRepositories();
    labels = labelRepository;
    closeDatabase = close;
  });

  afterEach(() => closeDatabase());

  it('saves and finds a label by id', async () => {
    await labels.save(label('1', 'Work'));
    expect(await labels.findById('1')).toEqual(label('1', 'Work'));
    expect(await labels.findById('nope')).toBeUndefined();
  });

  it('lists labels in insertion order', async () => {
    await labels.save(label('1', 'b'));
    await labels.save(label('2', 'a'));
    await labels.save({ ...label('1', 'b'), color: '#000000' });
    expect((await labels.findAll()).map((l) => l.id)).toEqual(['1', '2']);
  });

  it('updates an existing label when saved again', async () => {
    await labels.save(label('1', 'Work'));
    await labels.save({ ...label('1', 'Job'), color: '#000000' });
    expect(await labels.findById('1')).toEqual({ id: '1', name: 'Job', color: '#000000' });
    expect(await labels.findAll()).toHaveLength(1);
  });

  it('finds a label by name, ignoring case', async () => {
    await labels.save(label('1', 'Work'));
    expect((await labels.findByName('wORK'))?.id).toBe('1');
    expect(await labels.findByName('Home')).toBeUndefined();
  });

  it('deletes a label and reports whether it existed', async () => {
    await labels.save(label('1'));
    expect(await labels.delete('1')).toBe(true);
    expect(await labels.delete('1')).toBe(false);
  });
});
