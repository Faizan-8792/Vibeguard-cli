import { estimateCost } from './cost-estimator.js';
// English stopwords to remove from task text
const STOPWORDS = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
    'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
    'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
    'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
    'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
    'just', 'because', 'but', 'and', 'or', 'if', 'while', 'about', 'up',
    'this', 'that', 'these', 'those', 'it', 'its', 'i', 'me', 'my', 'we',
]);
export async function selectContext(projectRoot, task, graphNodes, tags, importanceScores, config, opts) {
    const radius = opts.radius ?? config.context.defaultRadius;
    const budget = opts.budget ?? config.context.defaultTokenBudget;
    // Normalize task text
    const taskTokens = normalizeTask(task);
    // Match tokens against tags to produce seed set
    const seedScores = new Map();
    for (const [filePath, fileTags] of Object.entries(tags)) {
        let matchScore = 0;
        for (const token of taskTokens) {
            for (const tag of fileTags) {
                if (tag.includes(token) || token.includes(tag)) {
                    matchScore += 1;
                }
            }
        }
        if (matchScore > 0) {
            const importance = importanceScores[filePath]?.score ?? 1;
            seedScores.set(filePath, matchScore * importance);
        }
    }
    // Apply mode multipliers
    if (opts.mode) {
        applyModeMultipliers(seedScores, opts.mode, importanceScores, graphNodes);
    }
    // Expand by radius
    const expanded = new Map();
    for (const [filePath, score] of seedScores) {
        if (!expanded.has(filePath) || expanded.get(filePath).score < score) {
            expanded.set(filePath, { score, hopDistance: 0 });
        }
    }
    // Expand N-1 additional hops
    for (let hop = 1; hop < radius; hop++) {
        const currentFiles = [...expanded.entries()].filter(([, v]) => v.hopDistance === hop - 1);
        for (const [filePath] of currentFiles) {
            const node = graphNodes.get(filePath);
            if (!node)
                continue;
            const neighbors = [...node.imports, ...node.dependents];
            for (const neighbor of neighbors) {
                if (!graphNodes.has(neighbor))
                    continue;
                const decayedScore = (seedScores.get(filePath) ?? 1) * Math.pow(0.5, hop);
                const existing = expanded.get(neighbor);
                if (!existing || existing.score < decayedScore) {
                    expanded.set(neighbor, { score: decayedScore, hopDistance: hop });
                }
            }
        }
    }
    // Sort by score descending
    const ranked = [...expanded.entries()].sort((a, b) => b[1].score - a[1].score);
    // Apply budget constraint
    const selected = [];
    let currentFiles = [];
    for (const [filePath, { score, hopDistance }] of ranked) {
        currentFiles.push(filePath);
        const estimate = await estimateCost(currentFiles, projectRoot, config);
        if (estimate.tokens > budget) {
            currentFiles.pop();
            break;
        }
        const fileTags = tags[filePath] ?? [];
        const importance = importanceScores[filePath]?.score ?? 0;
        const role = hopDistance === 0 ? 'seed' : `hop-${hopDistance}`;
        selected.push({ path: filePath, tags: fileTags, importance, role, hopDistance, matchScore: score });
    }
    const tokenEstimates = await estimateCost(currentFiles, projectRoot, config);
    return {
        selectedFiles: selected,
        tokenEstimates,
        costEstimates: tokenEstimates.perModel,
    };
}
function normalizeTask(task) {
    return task
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter((word) => word.length > 1 && !STOPWORDS.has(word))
        .map(stemWord);
}
function stemWord(word) {
    // Simple Porter-like stemming
    let result = word;
    if (result.endsWith('ing'))
        result = result.slice(0, -3);
    else if (result.endsWith('tion'))
        result = result.slice(0, -4);
    else if (result.endsWith('ness'))
        result = result.slice(0, -4);
    else if (result.endsWith('ment'))
        result = result.slice(0, -4);
    else if (result.endsWith('able'))
        result = result.slice(0, -4);
    else if (result.endsWith('ible'))
        result = result.slice(0, -4);
    else if (result.endsWith('ful'))
        result = result.slice(0, -3);
    else if (result.endsWith('less'))
        result = result.slice(0, -4);
    else if (result.endsWith('ly'))
        result = result.slice(0, -2);
    else if (result.endsWith('ed'))
        result = result.slice(0, -2);
    else if (result.endsWith('er'))
        result = result.slice(0, -2);
    else if (result.endsWith('es'))
        result = result.slice(0, -2);
    else if (result.endsWith('s') && !result.endsWith('ss'))
        result = result.slice(0, -1);
    return result.length > 1 ? result : word;
}
function applyModeMultipliers(scores, mode, importanceScores, graphNodes) {
    for (const [filePath, score] of scores) {
        let multiplier = 1;
        const entry = importanceScores[filePath];
        switch (mode) {
            case 'feature':
                if (entry?.routeUsage)
                    multiplier = 1.5;
                break;
            case 'bugfix':
                if (entry && entry.gitCommits > 5)
                    multiplier = 1.5;
                break;
            case 'refactor': {
                const node = graphNodes.get(filePath);
                if (node && node.dependents.length > 10)
                    multiplier = 1.5;
                break;
            }
        }
        scores.set(filePath, score * multiplier);
    }
}
//# sourceMappingURL=context-radius-engine.js.map