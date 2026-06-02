import { readFile, writeFile, access, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

export interface FileStore {
  read<T>(artifactPath: string): Promise<T | null>;
  write<T>(artifactPath: string, data: T): Promise<void>;
  exists(artifactPath: string): Promise<boolean>;
  ensureDir(dirPath: string): Promise<void>;
  getBasePath(): string;
}

export class FileStoreImpl implements FileStore {
  private readonly basePath: string;

  constructor(projectRoot: string, baseDir = '.vibeguard') {
    this.basePath = join(projectRoot, baseDir);
  }

  getBasePath(): string {
    return this.basePath;
  }

  async read<T>(artifactPath: string): Promise<T | null> {
    const fullPath = join(this.basePath, artifactPath);
    try {
      const content = await readFile(fullPath, 'utf-8');
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  async write<T>(artifactPath: string, data: T): Promise<void> {
    const fullPath = join(this.basePath, artifactPath);
    await mkdir(dirname(fullPath), { recursive: true });
    const content = JSON.stringify(data, null, 2) + '\n';
    await writeFile(fullPath, content, 'utf-8');
  }

  async exists(artifactPath: string): Promise<boolean> {
    const fullPath = join(this.basePath, artifactPath);
    try {
      await access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async ensureDir(dirPath: string): Promise<void> {
    const fullPath = join(this.basePath, dirPath);
    await mkdir(fullPath, { recursive: true });
  }
}
