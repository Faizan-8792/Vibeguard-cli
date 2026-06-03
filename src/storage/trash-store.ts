import { readFile, writeFile, readdir, mkdir, cp, rm, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { v4 as uuidv4 } from 'uuid';

export interface TrashEntry {
  id: string;
  originalPath: string;
  movedAt: string;
  importance: number;
  lastCommitDate: string | null;
  kind: 'file' | 'export' | 'import' | 'duplicate-component';
}

export interface TrashStore {
  move(filePath: string, meta: Omit<TrashEntry, 'id' | 'movedAt'>): Promise<string>;
  list(): Promise<TrashEntry[]>;
  restore(idOrPath: string, force: boolean): Promise<void>;
  purge(): Promise<void>;
}

export class TrashStoreImpl implements TrashStore {
  private readonly trashDir: string;
  private readonly projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.trashDir = join(projectRoot, '.codescout-trash');
  }

  async move(filePath: string, meta: Omit<TrashEntry, 'id' | 'movedAt'>): Promise<string> {
    const id = uuidv4();
    const entryDir = join(this.trashDir, id);
    const sourcePath = join(this.projectRoot, filePath);

    // Create trash entry directory
    await mkdir(entryDir, { recursive: true });

    // Copy file to trash preserving relative path
    const destPath = join(entryDir, filePath);
    await mkdir(dirname(destPath), { recursive: true });
    await cp(sourcePath, destPath);

    // Write meta.json
    const entry: TrashEntry = {
      id,
      originalPath: meta.originalPath,
      movedAt: new Date().toISOString(),
      importance: meta.importance,
      lastCommitDate: meta.lastCommitDate,
      kind: meta.kind,
    };
    await writeFile(join(entryDir, 'meta.json'), JSON.stringify(entry, null, 2) + '\n', 'utf-8');

    // Remove original
    await rm(sourcePath);

    return id;
  }

  async list(): Promise<TrashEntry[]> {
    const entries: TrashEntry[] = [];

    try {
      await access(this.trashDir);
    } catch {
      return entries; // Trash dir doesn't exist
    }

    let dirs;
    try {
      dirs = await readdir(this.trashDir, { withFileTypes: true });
    } catch {
      return entries;
    }

    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      try {
        const metaPath = join(this.trashDir, dir.name, 'meta.json');
        const content = await readFile(metaPath, 'utf-8');
        const entry = JSON.parse(content) as TrashEntry;
        entries.push(entry);
      } catch {
        // Corrupted entry, skip
      }
    }

    return entries;
  }

  async restore(idOrPath: string, force: boolean): Promise<void> {
    const entries = await this.list();
    const entry = entries.find((e) => e.id === idOrPath || e.originalPath === idOrPath);

    if (!entry) {
      throw new Error(`Trash entry not found: ${idOrPath}`);
    }

    const destPath = join(this.projectRoot, entry.originalPath);

    // Check if target exists
    if (!force) {
      try {
        await access(destPath);
        throw new Error(`File already exists at ${entry.originalPath}. Use --force to overwrite.`);
      } catch (err) {
        if (err instanceof Error && err.message.includes('already exists')) throw err;
        // File doesn't exist, good
      }
    }

    // Restore file
    const sourcePath = join(this.trashDir, entry.id, entry.originalPath);
    await mkdir(dirname(destPath), { recursive: true });
    await cp(sourcePath, destPath);

    // Remove trash entry
    await rm(join(this.trashDir, entry.id), { recursive: true });
  }

  async purge(): Promise<void> {
    try {
      await rm(this.trashDir, { recursive: true });
    } catch {
      // Already empty or doesn't exist
    }
  }
}
