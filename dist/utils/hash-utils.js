import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
const STREAM_THRESHOLD = 1024 * 1024; // 1MB
export async function hashFile(filePath) {
    const fileStat = await stat(filePath);
    if (fileStat.size > STREAM_THRESHOLD) {
        return hashFileStream(filePath);
    }
    const content = await readFile(filePath, 'utf-8');
    return hashString(content);
}
function hashFileStream(filePath) {
    return new Promise((resolve, reject) => {
        const hash = createHash('sha256');
        const stream = createReadStream(filePath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}
export function hashString(content) {
    return createHash('sha256').update(content, 'utf-8').digest('hex');
}
//# sourceMappingURL=hash-utils.js.map