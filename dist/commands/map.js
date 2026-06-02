import { buildGraph } from '../engines/graph-builder.js';
import { resolveFiles } from '../utils/glob-resolver.js';
import { emitJson } from '../utils/json-output.js';
import { header, keyValue, statusIcon, brand, divider } from '../utils/ui.js';
export async function runMap(ctx) {
    const { config, logger, projectRoot, options } = ctx;
    logger.startSpinner('Building dependency graph...');
    const files = await resolveFiles(projectRoot, config.effectiveInclude, config.effectiveSkipSet);
    logger.debug(`Found ${files.length} candidate files`);
    const result = await buildGraph(projectRoot, files, config, logger);
    logger.stopSpinner(true);
    if (options.json) {
        emitJson({
            summary: {
                nodes: result.summary.nodes,
                edges: result.summary.edges,
                rebuilt: result.summary.rebuilt,
                skipped: result.summary.skipped,
            },
            graphPath: '.vibeguard/graph.json',
        });
    }
    else {
        const output = [];
        output.push(header('Dependency Graph', '🗺️'));
        output.push('');
        output.push(keyValue('Nodes', brand.info.bold(String(result.summary.nodes))));
        output.push(keyValue('Edges', brand.info.bold(String(result.summary.edges))));
        output.push(keyValue('Rebuilt', brand.secondary(String(result.summary.rebuilt))));
        output.push(keyValue('Skipped', brand.muted(String(result.summary.skipped))));
        output.push('');
        output.push(divider());
        output.push('');
        output.push(`  ${statusIcon('success')} ${brand.success('Saved to')} ${brand.muted('.vibeguard/graph.json')}`);
        output.push('');
        process.stdout.write(output.join('\n') + '\n');
    }
}
//# sourceMappingURL=map.js.map