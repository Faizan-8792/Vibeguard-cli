import { describe, it, expect } from 'vitest';
import { TrashStoreImpl } from '../../src/storage/trash-store.js';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Property 23: Trash/Restore Round-Trip', () => {
  it('moving a file to trash and restoring produces identical content', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vg-trash-'));
    await mkdir(join(dir, 'src'), { recursive: true });

    const originalContent = 'export const hello = "world";\n';
    await writeFile(join(dir, 'src/file.ts'), originalContent, 'utf-8');

    const trashStore = new TrashStoreImpl(dir);

    // Move to trash
    const id = await trashStore.move('src/file.ts', {
      originalPath: 'src/file.ts',
      importance: 5,
      lastCommitDate: null,
      kind: 'file',
    });

    // Original should be gone
    let exists = true;
    try {
      await access(join(dir, 'src/file.ts'));
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);

    // Restore
    await trashStore.restore(id, false);

    // Content should be identical
    const restoredContent = await readFile(join(dir, 'src/file.ts'), 'utf-8');
    expect(restoredContent).toBe(originalContent);

    await rm(dir, { recursive: true, force: true });
  });

  it('restore by path works the same as by id', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vg-trash-'));
    await mkdir(join(dir, 'src'), { recursive: true });

    const content = 'export const x = 42;\n';
    await writeFile(join(dir, 'src/target.ts'), content, 'utf-8');

    const trashStore = new TrashStoreImpl(dir);

    await trashStore.move('src/target.ts', {
      originalPath: 'src/target.ts',
      importance: 3,
      lastCommitDate: null,
      kind: 'file',
    });

    // Restore by path
    await trashStore.restore('src/target.ts', false);

    const restored = await readFile(join(dir, 'src/target.ts'), 'utf-8');
    expect(restored).toBe(content);

    await rm(dir, { recursive: true, force: true });
  });
});

describe('Property 24: Trash Meta Shape', () => {
  it('trash entries have all required fields', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vg-trash-'));
    await mkdir(join(dir, 'src'), { recursive: true });
    await writeFile(join(dir, 'src/a.ts'), 'export const a = 1;', 'utf-8');

    const trashStore = new TrashStoreImpl(dir);

    await trashStore.move('src/a.ts', {
      originalPath: 'src/a.ts',
      importance: 7,
      lastCommitDate: '2025-01-01T00:00:00Z',
      kind: 'file',
    });

    const entries = await trashStore.list();
    expect(entries.length).toBe(1);

    const entry = entries[0];
    expect(entry).toHaveProperty('id');
    expect(entry).toHaveProperty('originalPath');
    expect(entry).toHaveProperty('movedAt');
    expect(entry).toHaveProperty('importance');
    expect(entry).toHaveProperty('lastCommitDate');
    expect(entry).toHaveProperty('kind');

    expect(typeof entry.id).toBe('string');
    expect(entry.id.length).toBeGreaterThan(0);
    expect(entry.originalPath).toBe('src/a.ts');
    expect(entry.importance).toBe(7);
    expect(entry.lastCommitDate).toBe('2025-01-01T00:00:00Z');
    expect(entry.kind).toBe('file');
    // movedAt should be a valid ISO date
    expect(new Date(entry.movedAt).toISOString()).toBe(entry.movedAt);

    await rm(dir, { recursive: true, force: true });
  });
});

describe('Property 37: No Hard Deletes', () => {
  it('clean command moves files to trash instead of deleting', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vg-trash-'));
    await mkdir(join(dir, 'src'), { recursive: true });
    await writeFile(join(dir, 'src/dead.ts'), 'export const dead = true;', 'utf-8');

    const trashStore = new TrashStoreImpl(dir);

    // Simulate what clean --apply does: move to trash
    await trashStore.move('src/dead.ts', {
      originalPath: 'src/dead.ts',
      importance: 0,
      lastCommitDate: null,
      kind: 'file',
    });

    // File should be in trash, not permanently deleted
    const entries = await trashStore.list();
    expect(entries.length).toBe(1);
    expect(entries[0].originalPath).toBe('src/dead.ts');

    // File content should be recoverable
    await trashStore.restore(entries[0].id, false);
    const content = await readFile(join(dir, 'src/dead.ts'), 'utf-8');
    expect(content).toBe('export const dead = true;');

    await rm(dir, { recursive: true, force: true });
  });
});
