import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
export class GitUtilsImpl {
    async isGitRepo(cwd) {
        try {
            await access(join(cwd, '.git'));
            return true;
        }
        catch {
            try {
                await execFileAsync('git', ['rev-parse', '--git-dir'], { cwd });
                return true;
            }
            catch {
                return false;
            }
        }
    }
    async getCommitFrequency(file, sinceDays, cwd) {
        try {
            const { stdout } = await execFileAsync('git', ['log', `--since=${sinceDays} days ago`, '--pretty=format:', '--name-only', '--', file], { cwd });
            const lines = stdout.trim().split('\n').filter((l) => l.trim().length > 0);
            return lines.length;
        }
        catch {
            return 0;
        }
    }
    async getLastCommitDate(file, cwd) {
        try {
            const { stdout } = await execFileAsync('git', ['log', '-1', '--format=%cI', '--', file], { cwd });
            const date = stdout.trim();
            return date.length > 0 ? date : null;
        }
        catch {
            return null;
        }
    }
    async isWorkingTreeClean(cwd) {
        try {
            const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd });
            return stdout.trim().length === 0;
        }
        catch {
            return false;
        }
    }
    async createBranch(name, cwd) {
        await execFileAsync('git', ['checkout', '-b', name], { cwd });
    }
    async commitAll(message, cwd) {
        await execFileAsync('git', ['add', '-A'], { cwd });
        await execFileAsync('git', ['commit', '-m', message], { cwd });
    }
}
export function createGitUtils() {
    return new GitUtilsImpl();
}
//# sourceMappingURL=git-utils.js.map