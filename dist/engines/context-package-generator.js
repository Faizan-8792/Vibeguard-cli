import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { FileStoreImpl } from '../storage/file-store.js';
export async function generateContextPackage(task, selectedFiles, tokenEstimates, totalProjectTokens, projectRoot, graphData, securityIssues) {
    const store = new FileStoreImpl(projectRoot);
    // Detect stack
    const detectedStack = await detectStack(projectRoot);
    // Generate warnings
    const warnings = [];
    if (selectedFiles.length === 0) {
        warnings.push('no-match');
    }
    // Check for high fan-in files
    if (graphData) {
        for (const file of selectedFiles) {
            const node = graphData.nodes[file.path];
            if (node && node.dependents.length > 10) {
                warnings.push(`${file.path} has fan-in > 10 (${node.dependents.length} dependents)`);
            }
        }
    }
    // Check for security-critical files
    if (securityIssues) {
        const criticalFiles = new Set(securityIssues
            .filter((i) => i.severity === 'critical')
            .map((i) => i.file));
        for (const file of selectedFiles) {
            if (criticalFiles.has(file.path)) {
                warnings.push(`${file.path} has critical security issues`);
            }
        }
    }
    // Compute reduction percentage
    const reductionPercent = totalProjectTokens > 0
        ? Math.round((1 - tokenEstimates.tokens / totalProjectTokens) * 100)
        : 0;
    const pkg = {
        schemaVersion: '1.0.0',
        task,
        detectedStack,
        selectedFiles,
        warnings,
        tokenBudget: {
            pointEstimate: tokenEstimates.tokens,
            range: tokenEstimates.range,
            reductionPercent: Math.max(0, reductionPercent),
        },
    };
    // Write JSON package
    await store.write('context-package.json', pkg);
    // Write markdown package
    const markdown = renderMarkdown(pkg);
    const mdPath = join(store.getBasePath(), 'context-package.md');
    await writeFile(mdPath, markdown, 'utf-8');
    return pkg;
}
async function detectStack(projectRoot) {
    const stack = [];
    try {
        const pkgContent = await readFile(join(projectRoot, 'package.json'), 'utf-8');
        const pkg = JSON.parse(pkgContent);
        const allDeps = {
            ...(pkg.dependencies || {}),
            ...(pkg.devDependencies || {}),
        };
        if (allDeps['typescript'])
            stack.push('typescript');
        if (allDeps['next'])
            stack.push('next.js');
        if (allDeps['react'])
            stack.push('react');
        if (allDeps['vue'])
            stack.push('vue');
        if (allDeps['angular'] || allDeps['@angular/core'])
            stack.push('angular');
        if (allDeps['express'])
            stack.push('express');
        if (allDeps['fastify'])
            stack.push('fastify');
        if (allDeps['prisma'] || allDeps['@prisma/client'])
            stack.push('prisma');
        if (allDeps['drizzle-orm'])
            stack.push('drizzle');
        if (allDeps['tailwindcss'])
            stack.push('tailwind');
        if (allDeps['vitest'])
            stack.push('vitest');
        if (allDeps['jest'])
            stack.push('jest');
    }
    catch {
        // No package.json
    }
    return stack;
}
function renderMarkdown(pkg) {
    let md = '';
    md += `# Context Package\n\n`;
    md += `## Task\n\n${pkg.task}\n\n`;
    md += `## Detected Stack\n\n`;
    if (pkg.detectedStack.length > 0) {
        md += pkg.detectedStack.map((s) => `- ${s}`).join('\n') + '\n\n';
    }
    else {
        md += `No specific stack detected.\n\n`;
    }
    md += `## Relevant Files\n\n`;
    if (pkg.selectedFiles.length > 0) {
        for (const file of pkg.selectedFiles) {
            md += `- **${file.path}** — tags: [${file.tags.join(', ')}], importance: ${file.importance}, role: ${file.role}, hop: ${file.hopDistance}\n`;
        }
        md += '\n';
    }
    else {
        md += `No files matched the task.\n\n`;
    }
    md += `## Warnings\n\n`;
    if (pkg.warnings.length > 0) {
        md += pkg.warnings.map((w) => `- ${w}`).join('\n') + '\n\n';
    }
    else {
        md += `No warnings.\n\n`;
    }
    md += `## Token Budget\n\n`;
    md += `- Point estimate: ${pkg.tokenBudget.pointEstimate} tokens\n`;
    md += `- Range: ${pkg.tokenBudget.range.low} – ${pkg.tokenBudget.range.high} tokens\n`;
    md += `- Reduction: ${pkg.tokenBudget.reductionPercent}% vs full project\n`;
    return md;
}
//# sourceMappingURL=context-package-generator.js.map