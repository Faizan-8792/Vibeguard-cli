import { readFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import picomatch from 'picomatch';
import { FileStoreImpl } from '../storage/file-store.js';
const TAG_REGEX = /^[a-z0-9-]+$/;
export async function computeTags(projectRoot, graphNodes, config) {
    const tags = {};
    for (const [filePath] of graphNodes) {
        const fileTags = new Set();
        // Derive from path segments
        const pathTags = derivePathTags(filePath);
        for (const t of pathTags)
            fileTags.add(t);
        // Derive from identifiers in file content
        try {
            const content = await readFile(resolve(projectRoot, filePath), 'utf-8');
            const identTags = deriveIdentifierTags(content);
            for (const t of identTags)
                fileTags.add(t);
            // Parse @vibeguard: comments
            const commentTags = parseVibeguardComments(content);
            for (const t of commentTags)
                fileTags.add(t);
        }
        catch {
            // File unreadable, skip identifier tags
        }
        // Apply framework patterns
        const frameworkTags = deriveFrameworkTags(filePath);
        for (const t of frameworkTags)
            fileTags.add(t);
        // Apply custom rules
        for (const rule of config.tags.customRules) {
            const matcher = picomatch(rule.match);
            if (matcher(filePath)) {
                for (const t of rule.add) {
                    const normalized = normalizeTag(t);
                    if (normalized)
                        fileTags.add(normalized);
                }
            }
        }
        // Filter and sort
        const validTags = [...fileTags].filter((t) => TAG_REGEX.test(t)).sort();
        tags[filePath] = validTags;
    }
    // Persist
    const store = new FileStoreImpl(projectRoot);
    const tagsData = { schemaVersion: '1.0.0', tags };
    await store.write('tags.json', tagsData);
    return tags;
}
function derivePathTags(filePath) {
    const tags = [];
    const parts = filePath.split('/');
    for (const part of parts) {
        const segments = part.split(/[.\-_]/);
        for (const seg of segments) {
            const normalized = normalizeTag(seg);
            if (normalized && normalized.length > 1) {
                tags.push(normalized);
            }
        }
    }
    // Also add the base name without extension
    const base = basename(filePath).replace(/\.[^.]+$/, '');
    const baseTags = splitCamelCase(base);
    for (const t of baseTags) {
        const normalized = normalizeTag(t);
        if (normalized && normalized.length > 1)
            tags.push(normalized);
    }
    return tags;
}
function deriveIdentifierTags(content) {
    const tags = [];
    // Extract exported function/class/const names
    const exportMatches = content.matchAll(/export\s+(?:function|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g);
    for (const match of exportMatches) {
        const name = match[1];
        const parts = splitCamelCase(name);
        for (const p of parts) {
            const normalized = normalizeTag(p);
            if (normalized && normalized.length > 1)
                tags.push(normalized);
        }
    }
    return tags.slice(0, 20); // Limit to avoid noise
}
function deriveFrameworkTags(filePath) {
    const tags = [];
    if (filePath.match(/^pages\/api\//)) {
        tags.push('api', 'route');
    }
    else if (filePath.match(/^app\//)) {
        tags.push('app-router', 'route');
    }
    else if (filePath.match(/^routes\//)) {
        tags.push('route');
    }
    else if (filePath.match(/^(src\/)?components\//)) {
        tags.push('component');
    }
    return tags;
}
function parseVibeguardComments(content) {
    const tags = [];
    const regex = /\/\/\s*@vibeguard:\s*(.+)/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
        const parts = match[1].split(',');
        for (const part of parts) {
            const normalized = normalizeTag(part.trim());
            if (normalized)
                tags.push(normalized);
        }
    }
    return tags;
}
function splitCamelCase(str) {
    return str
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
        .replace(/_/g, '-')
        .toLowerCase()
        .split('-')
        .filter((s) => s.length > 0);
}
function normalizeTag(input) {
    const tag = input
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .replace(/^-+|-+$/g, '');
    return tag.length > 0 && TAG_REGEX.test(tag) ? tag : null;
}
export async function loadTags(projectRoot) {
    const store = new FileStoreImpl(projectRoot);
    const data = await store.read('tags.json');
    if (data && data.schemaVersion === '1.0.0') {
        return data.tags;
    }
    return null;
}
//# sourceMappingURL=tagging-engine.js.map