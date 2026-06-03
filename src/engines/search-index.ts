/**
 * Search index — a pure-TypeScript full-text index over graph nodes.
 *
 * Why not SQLite FTS5? CodeScout's requirements mandate "no native compilation"
 * and Node >= 18. `better-sqlite3` is a native addon and `node:sqlite` is
 * experimental and Node 22+ only, so neither upholds those guarantees. Instead
 * we build a tokenized inverted index in memory and persist it to
 * `.codescout/search-index.json` — same local-first, zero-native, JSON-storage
 * model as the rest of the project, with sub-millisecond lookups in practice.
 *
 * The index stores, per node: the file path, exported symbol names, and the
 * directory/basename segments — split into normalized terms (camelCase /
 * snake_case / kebab aware). Queries score documents by term overlap with an
 * identifier-aware boost for exact qualified-name hits.
 */
import type { GraphData } from './graph-builder.js';
import { FileStoreImpl } from '../storage/file-store.js';

export const SEARCH_INDEX_SCHEMA_VERSION = '1.0.0';
const INDEX_FILE = 'search-index.json';

export interface SearchDocument {
  /** Node key (file path). */
  file: string;
  /** Exported symbol names for this node. */
  exports: string[];
  /** Pre-tokenized, normalized terms for matching. */
  terms: string[];
}

export interface SearchIndexData {
  schemaVersion: string;
  documents: SearchDocument[];
}

export interface SearchHit {
  file: string;
  score: number;
  matchedTerms: string[];
  exports: string[];
}

/**
 * Split an identifier or path segment into lowercase word tokens.
 * Handles camelCase, PascalCase, snake_case, kebab-case, dotted, and slashes.
 */
export function tokenize(input: string): string[] {
  return input
    // split camelCase / PascalCase boundaries
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    // separators → space
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/**
 * Pull identifier-like tokens out of a natural-language query so we can boost
 * exact matches. e.g. "how does AuthService.login work" → [auth, service, login].
 */
export function extractQueryIdentifiers(query: string): string[] {
  const dotted = query.match(/[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+/g) ?? [];
  const camelOrSnake = query.match(/[A-Za-z]+(?:[A-Z][a-z]+|_[a-z]+)+/g) ?? [];
  const out = new Set<string>();
  for (const m of [...dotted, ...camelOrSnake]) {
    for (const t of tokenize(m)) out.add(t);
  }
  return [...out];
}

/** Build the search index from a graph. */
export function buildSearchIndex(graph: GraphData): SearchIndexData {
  const documents: SearchDocument[] = [];

  for (const node of Object.values(graph.nodes)) {
    const terms = new Set<string>();
    for (const t of tokenize(node.file)) terms.add(t);
    for (const exp of node.exports) {
      for (const t of tokenize(exp)) terms.add(t);
    }
    documents.push({
      file: node.file,
      exports: node.exports,
      terms: [...terms],
    });
  }

  return { schemaVersion: SEARCH_INDEX_SCHEMA_VERSION, documents };
}

/**
 * Score documents against a query using term overlap. Identifier tokens parsed
 * from the query get a 2x boost when they match an exact exported symbol, and a
 * smaller boost on file-term matches — mirroring code-review-graph's
 * identifier-aware ranking.
 */
export function searchIndex(index: SearchIndexData, query: string, limit = 20): SearchHit[] {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];

  const identifiers = new Set(extractQueryIdentifiers(query));
  const querySet = new Set(queryTerms);

  const hits: SearchHit[] = [];
  for (const doc of index.documents) {
    const termSet = new Set(doc.terms);
    const matched: string[] = [];
    let score = 0;

    for (const qt of querySet) {
      if (termSet.has(qt)) {
        matched.push(qt);
        score += 1;
        // identifier-aware boost
        if (identifiers.has(qt)) score += 1;
        // exact exported-symbol match is a strong signal
        if (doc.exports.some((e) => e.toLowerCase() === qt)) score += 2;
      }
    }

    if (score > 0) {
      // Normalize by query length so short queries don't dominate; keep a small
      // bonus for documents that match a higher fraction of the query.
      const coverage = matched.length / querySet.size;
      hits.push({ file: doc.file, score: score + coverage, matchedTerms: matched, exports: doc.exports });
    }
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Persist the index to `.codescout/search-index.json`. */
export async function saveSearchIndex(projectRoot: string, index: SearchIndexData): Promise<void> {
  const store = new FileStoreImpl(projectRoot);
  await store.write(INDEX_FILE, index);
}

/** Load the persisted index, or null if absent / schema mismatch. */
export async function loadSearchIndex(projectRoot: string): Promise<SearchIndexData | null> {
  const store = new FileStoreImpl(projectRoot);
  const data = await store.read<SearchIndexData>(INDEX_FILE);
  if (!data || data.schemaVersion !== SEARCH_INDEX_SCHEMA_VERSION) return null;
  return data;
}
