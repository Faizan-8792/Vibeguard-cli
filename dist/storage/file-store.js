import { readFile, writeFile, access, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
export class FileStoreImpl {
    basePath;
    constructor(projectRoot, baseDir = '.vibeguard') {
        this.basePath = join(projectRoot, baseDir);
    }
    getBasePath() {
        return this.basePath;
    }
    async read(artifactPath) {
        const fullPath = join(this.basePath, artifactPath);
        try {
            const content = await readFile(fullPath, 'utf-8');
            return JSON.parse(content);
        }
        catch {
            return null;
        }
    }
    async write(artifactPath, data) {
        const fullPath = join(this.basePath, artifactPath);
        await mkdir(dirname(fullPath), { recursive: true });
        const content = JSON.stringify(data, null, 2) + '\n';
        await writeFile(fullPath, content, 'utf-8');
    }
    async exists(artifactPath) {
        const fullPath = join(this.basePath, artifactPath);
        try {
            await access(fullPath);
            return true;
        }
        catch {
            return false;
        }
    }
    async ensureDir(dirPath) {
        const fullPath = join(this.basePath, dirPath);
        await mkdir(fullPath, { recursive: true });
    }
}
//# sourceMappingURL=file-store.js.map