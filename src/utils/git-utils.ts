import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GitUtils {
  isGitRepo(cwd: string): Promise<boolean>;
  getCommitFrequency(file: string, sinceDays: number, cwd: string): Promise<number>;
  getLastCommitDate(file: string, cwd: string): Promise<string | null>;
  isWorkingTreeClean(cwd: string): Promise<boolean>;
  createBranch(name: string, cwd: string): Promise<void>;
  commitAll(message: string, cwd: string): Promise<void>;
}

export class GitUtilsImpl implements GitUtils {
  async isGitRepo(cwd: string): Promise<boolean> {
    try {
      await access(join(cwd, '.git'));
      return true;
    } catch {
      try {
        await execFileAsync('git', ['rev-parse', '--git-dir'], { cwd });
        return true;
      } catch {
        return false;
      }
    }
  }

  async getCommitFrequency(file: string, sinceDays: number, cwd: string): Promise<number> {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['log', `--since=${sinceDays} days ago`, '--pretty=format:', '--name-only', '--', file],
        { cwd }
      );
      const lines = stdout.trim().split('\n').filter((l) => l.trim().length > 0);
      return lines.length;
    } catch {
      return 0;
    }
  }

  async getLastCommitDate(file: string, cwd: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['log', '-1', '--format=%cI', '--', file],
        { cwd }
      );
      const date = stdout.trim();
      return date.length > 0 ? date : null;
    } catch {
      return null;
    }
  }

  async isWorkingTreeClean(cwd: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd });
      return stdout.trim().length === 0;
    } catch {
      return false;
    }
  }

  async createBranch(name: string, cwd: string): Promise<void> {
    await execFileAsync('git', ['checkout', '-b', name], { cwd });
  }

  async commitAll(message: string, cwd: string): Promise<void> {
    await execFileAsync('git', ['add', '-A'], { cwd });
    await execFileAsync('git', ['commit', '-m', message], { cwd });
  }
}

export function createGitUtils(): GitUtils {
  return new GitUtilsImpl();
}
