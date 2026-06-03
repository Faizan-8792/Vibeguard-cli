import type { CommandContext } from '../context.js';
import { CodeScoutError, ErrorCodes } from '../utils/errors.js';
import { emitJson } from '../utils/json-output.js';
import { header, keyValue, divider, statusIcon, filePath, brand } from '../utils/ui.js';

export interface SearchCommandOptions {
  query: string;
  limit?: number;
}

interface HybridHit {
  file: string;
  score: number;
  keywordScore: number;
  semanticScore: number;
  exports: string[];
}

/**
 * Hybrid keyword + semantic search over code entities.
 *
 * Combines the lexical inverted index (search-index) with local hashing-based
 * embeddings (embeddings) into a single ranked list. Both layers are built from
 * the graph on demand and persisted, so repeat searches are fast. Fully local,
 * zero tokens, no network.
 */
export async function runSearch(ctx: CommandContext, opts: SearchCommandOptions): Promise<void> {
  const { logger, projectRoot, options } = ctx;
  const limit = opts.limit && opts.limit > 0 ? opts.limit : 15;
  const query = opts.query?.trim() ?? '';

  if (query.length === 0) {
    throw new CodeScoutError(ErrorCodes.CONFIG_INVALID, 'Search query is required. Usage: codescout search "<query>"');
  }

  const { loadGraph } = await import('../engines/graph-builder.js');
  const { buildSearchIndex, searchIndex, loadSearchIndex, saveSearchIndex } = await import('../engines/search-index.js');
  const { buildEmbeddings, semanticSearch, loadEmbeddings, saveEmbeddings } = await import('../engines/embeddings.js');

  const graph = await loadGraph(projectRoot);
  if (!graph) {
    throw new CodeScoutError(ErrorCodes.CONFIG_NOT_FOUND, 'No graph found. Run `codescout map` first.');
  }

  if (!options.json) logger.startSpinner(`Searching for "${query}"...`);

  // Keyword index (build + persist if missing)
  let index = await loadSearchIndex(projectRoot);
  if (!index) {
    index = buildSearchIndex(graph);
    await saveSearchIndex(projectRoot, index);
  }

  // Semantic embeddings (build + persist if missing)
  let embeddings = await loadEmbeddings(projectRoot);
  if (!embeddings) {
    embeddings = buildEmbeddings(graph);
    await saveEmbeddings(projectRoot, embeddings);
  }

  const keywordHits = searchIndex(index, query, limit * 2);
  const semanticHits = semanticSearch(embeddings, query, limit * 2);

  // Merge: normalize each list to 0..1, then weight keyword 0.6 / semantic 0.4.
  const maxKw = Math.max(1, ...keywordHits.map((h) => h.score));
  const maxSem = Math.max(1e-9, ...semanticHits.map((h) => h.similarity));
  const merged = new Map<string, HybridHit>();

  for (const h of keywordHits) {
    merged.set(h.file, {
      file: h.file,
      keywordScore: h.score / maxKw,
      semanticScore: 0,
      score: 0,
      exports: h.exports,
    });
  }
  for (const h of semanticHits) {
    const existing = merged.get(h.file);
    const sem = h.similarity / maxSem;
    if (existing) {
      existing.semanticScore = sem;
    } else {
      merged.set(h.file, { file: h.file, keywordScore: 0, semanticScore: sem, score: 0, exports: graph.nodes[h.file]?.exports ?? [] });
    }
  }

  const results = [...merged.values()]
    .map((h) => ({ ...h, score: h.keywordScore * 0.6 + h.semanticScore * 0.4 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (!options.json) logger.stopSpinner(true);

  if (options.json) {
    emitJson({
      query,
      results: results.map((r) => ({
        file: r.file,
        score: Math.round(r.score * 1000) / 1000,
        keywordScore: Math.round(r.keywordScore * 1000) / 1000,
        semanticScore: Math.round(r.semanticScore * 1000) / 1000,
        exports: r.exports.slice(0, 8),
      })),
    });
    return;
  }

  const output: string[] = [];
  output.push(header('Code Search', '🔎'));
  output.push('');
  output.push(keyValue('Query', brand.secondary(query)));
  output.push('');

  if (results.length === 0) {
    output.push(`  ${statusIcon('info')} ${brand.muted('No matches found. Try different terms or run `codescout map` to refresh the index.')}`);
    process.stdout.write(output.join('\n') + '\n');
    return;
  }

  output.push(divider());
  output.push('');
  for (const r of results) {
    const pct = Math.round(r.score * 100);
    output.push(`  ${brand.info.bold(`${pct}%`)} ${filePath(r.file)}`);
    if (r.exports.length > 0) {
      output.push(`     ${brand.muted(r.exports.slice(0, 6).join(', '))}`);
    }
  }
  output.push('');
  output.push(`  ${brand.muted('Hybrid keyword + semantic ranking — 0 tokens, fully local.')}`);
  output.push('');
  process.stdout.write(output.join('\n') + '\n');
}
