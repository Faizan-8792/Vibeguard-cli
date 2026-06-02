import { loadGraph } from './graph-builder.js';
import { scanSecurity } from './security-scanner.js';
import { scanDeadCode } from './dead-code-scanner.js';
import { loadImportance } from './importance-analyzer.js';
import { resolveFiles } from '../utils/glob-resolver.js';
export async function analyzeHealth(config, projectRoot) {
    const warnings = [];
    let securityScore = null;
    let deadCodeScore = null;
    let architectureScore = null;
    let contextEfficiencyScore = null;
    let allIssues = [];
    // Load graph
    const graphData = await loadGraph(projectRoot);
    // 1. Security sub-score
    try {
        const files = await resolveFiles(projectRoot, config.effectiveInclude, config.effectiveSkipSet);
        const secResult = await scanSecurity(projectRoot, files, config);
        allIssues = secResult.issues;
        let penalty = 0;
        penalty += secResult.counts.critical * 20;
        penalty += secResult.counts.high * 10;
        penalty += secResult.counts.medium * 5;
        penalty += secResult.counts.low * 2;
        securityScore = Math.max(0, Math.min(100, 100 - penalty));
    }
    catch (err) {
        warnings.push(`Security scan failed: ${err instanceof Error ? err.message : 'unknown'}`);
    }
    // 2. Dead code sub-score
    try {
        if (graphData) {
            const importanceScores = await loadImportance(projectRoot) ?? {};
            const graphNodes = new Map(Object.entries(graphData.nodes));
            const deadResult = await scanDeadCode(projectRoot, graphNodes, importanceScores);
            const totalNodes = Object.keys(graphData.nodes).length;
            if (totalNodes > 0) {
                // Only count unused FILES for the health score.
                // Unused exports use simplified detection with many false positives
                // (dynamic imports, re-exports), so they're informational only.
                const deadFileRatio = deadResult.summary.unusedFiles / totalNodes;
                deadCodeScore = Math.max(0, Math.min(100, Math.round(100 - deadFileRatio * 100)));
            }
            else {
                deadCodeScore = 100;
            }
        }
        else {
            warnings.push('No graph available for dead code analysis. Run `vibeguard map` first.');
        }
    }
    catch (err) {
        warnings.push(`Dead code scan failed: ${err instanceof Error ? err.message : 'unknown'}`);
    }
    // 3. Architecture sub-score
    try {
        if (graphData) {
            architectureScore = computeArchitectureScore(graphData);
        }
        else {
            warnings.push('No graph available for architecture analysis.');
        }
    }
    catch (err) {
        warnings.push(`Architecture analysis failed: ${err instanceof Error ? err.message : 'unknown'}`);
    }
    // 4. Context efficiency sub-score
    try {
        if (graphData) {
            const totalNodes = Object.keys(graphData.nodes).length;
            let totalImports = 0;
            for (const node of Object.values(graphData.nodes)) {
                totalImports += node.imports.length;
            }
            const avgImports = totalNodes > 0 ? totalImports / totalNodes : 0;
            contextEfficiencyScore = Math.max(0, Math.min(100, Math.round(100 - avgImports * 5)));
        }
        else {
            warnings.push('No graph available for context efficiency analysis.');
        }
    }
    catch (err) {
        warnings.push(`Context efficiency analysis failed: ${err instanceof Error ? err.message : 'unknown'}`);
    }
    // Compute overall health score
    const scores = [securityScore, deadCodeScore, architectureScore, contextEfficiencyScore];
    const validScores = scores.filter((s) => s !== null);
    const projectHealth = validScores.length > 0
        ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
        : 0;
    return {
        summary: {
            projectHealth: Math.max(0, Math.min(100, projectHealth)),
            security: securityScore,
            deadCode: deadCodeScore,
            architecture: architectureScore,
            contextEfficiency: contextEfficiencyScore,
        },
        issues: allIssues,
        warnings,
    };
}
function computeArchitectureScore(graphData) {
    const nodes = Object.values(graphData.nodes);
    let penalty = 0;
    // Penalty for files with fan-in > 25
    const highFanIn = nodes.filter((n) => n.dependents.length > 25).length;
    penalty += highFanIn * 5;
    // Penalty for cyclic dependencies
    let cyclicCount = 0;
    for (const node of nodes) {
        for (const imp of node.imports) {
            const importedNode = graphData.nodes[imp];
            if (importedNode && importedNode.imports.includes(node.file)) {
                cyclicCount++;
            }
        }
    }
    penalty += Math.floor(cyclicCount / 2) * 3;
    return Math.max(0, Math.min(100, 100 - penalty));
}
//# sourceMappingURL=health-analyzer.js.map