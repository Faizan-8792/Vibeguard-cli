import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm, access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TrashStoreImpl } from '../../src/storage/trash-store.js';

describe('Trash Store', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `vibeguard-trash-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(join(testDir, 'src'), { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('moves a file to trash and removes original', async () => {
    const filePath = 'src/old-file.ts';
    await writeFile(join(testDir, filePath), 'export const x = 1;', 'utf-8');

    const store = new TrashStoreImpl(testDir);
    const id = await store.move(filePath, {
      originalPath: filePath,
      importance: 5,
      lastCommitDate: null,
      kind: 'file',
    });

    expect(id).toBeTruthy();

    // Original should be gone
    await expect(access(join(testDir, filePath))).rejects.toThrow();

    // Trash entry should exist
    const entries = await store.list();
    expect(entries.length).toBe(1);
    expect(entries[0].originalPath).toBe(filePath);
    expect(entries[0].kind).toBe('file');
    expect(entries[0].importance).toBe(5);
  });

  it('restores a file from trash', async () => {
    const filePath = 'src/restore-me.ts';
    const content = 'export const y = 2;';
    await writeFile(join(testDir, filePath), content, 'utf-8');

    const store = new TrashStoreImpl(testDir);
    const id = await store.move(filePath, {
      originalPath: filePath,
      importance: 3,
      lastCommitDate: null,
      kind: 'file',
    });

    // Restore
    await store.restore(id, false);

    // File should be back
    const restored = await readFile(join(testDir, filePath), 'utf-8');
    expect(restored).toBe(content);

    // Trash should be empty
    const entries = await store.list();
    expect(entries.length).toBe(0);
  });

  it('refuses to restore if target exists without --force', async () => {
    const filePath = 'src/conflict.ts';
    await writeFile(join(testDir, filePath), 'original', 'utf-8');

    const store = new TrashStoreImpl(testDir);
    const id = await store.move(filePath, {
      originalPath: filePath,
      importance: 1,
      lastCommitDate: null,
      kind: 'file',
    });

    // Create a new file at the same path
    await writeFile(join(testDir, filePath), 'new content', 'utf-8');

    // Should refuse
    await expect(store.restore(id, false)).rejects.toThrow('already exists');
  });

  it('restores with --force even if target exists', async () => {
    const filePath = 'src/force-restore.ts';
    await writeFile(join(testDir, filePath), 'original', 'utf-8');

    const store = new TrashStoreImpl(testDir);
    const id = await store.move(filePath, {
      originalPath: filePath,
      importance: 1,
      lastCommitDate: null,
      kind: 'file',
    });

    await writeFile(join(testDir, filePath), 'new content', 'utf-8');

    // Force restore
    await store.restore(id, true);

    const content = await readFile(join(testDir, filePath), 'utf-8');
    expect(content).toBe('original');
  });

  it('purges all trash entries', async () => {
    const store = new TrashStoreImpl(testDir);

    await writeFile(join(testDir, 'src', 'a.ts'), 'a', 'utf-8');
    await writeFile(join(testDir, 'src', 'b.ts'), 'b', 'utf-8');

    await store.move('src/a.ts', { originalPath: 'src/a.ts', importance: 1, lastCommitDate: null, kind: 'file' });
    await store.move('src/b.ts', { originalPath: 'src/b.ts', importance: 2, lastCommitDate: null, kind: 'file' });

    let entries = await store.list();
    expect(entries.length).toBe(2);

    await store.purge();

    entries = await store.list();
    expect(entries.length).toBe(0);
  });

  it('returns empty list when trash dir does not exist', async () => {
    const store = new TrashStoreImpl(testDir);
    const entries = await store.list();
    expect(entries).toEqual([]);
  });
});
