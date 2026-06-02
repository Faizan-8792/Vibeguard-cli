/**
 * Embeddings — optional local-first vector layer for semantic search.
 *
 * The default provider is a dependency-free, deterministic "hashing embedding":
 * it projects tokenized node text into a fixed-dimension vector via feature
 * hashing. This is NOT a neural embedding — it captures lexical/token overlap,
 * not deep semantics — but it runs with zero network calls, zero native builds,
 * and zero extra dependencies, which is exactly VibeGuard's contract. It lets
 * `search` rank by cosine similarity and gives a clean seam to plug a real
 * provider (OpenAI-compatible / local sentence-transformers) behind an explicit
 * opt-in later, without changing callers.
 */
import type { GraphData } from './graph-builder.js';
import { tokenize } from './search-index.js';
import { FileStoreImpl } from '../storage/file-store.js';

export const EMBEDDINGS_SCHEMA_VERSION = '1.0.0';
const EMBEDDINGS_FILE = 'embeddings.json';
const DIMENSION = 128;

export interface EmbeddingEntry {
  file: string;
  vector: number[];
}

export interface EmbeddingsData {
  schemaVersion: string;
  provider: string;
  dimension: number;
  entries: EmbeddingEntry[];
}

/** Deterministic 32-bit string hash (FNV-1a). */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Feature-hash a list of tokens into a unit-normalized DIMENSION-vector.
 * Each token increments one bucket (sign from a second hash) — the standard
 * hashing-trick. Unit-normalized so cosine similarity is a plain dot product.
 */
export function embedText(text: string, dimension = DIMENSION): number[] {
  const vec = new Array<number>(dimension).fill(0);
  const tokens = tokenize(text);
  for (const tok of tokens) {
    const h = hash32(tok);
    const bucket = h % dimension;
    const sign = (hash32(tok + '#sign') & 1) === 0 ? 1 : -1;
    vec[bucket] += sign;
  }
  // Unit-normalize
  let mag = 0;
  for (const v of vec) mag += v * v;
  mag = Math.sqrt(mag);
  if (mag > 0) {
    for (let i = 0; i < dimension; i++) vec[i] /= mag;
  }
  return vec;
}

/** Cosine similarity of two equal-length unit vectors (== dot product). */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/** Build embeddings for every graph node from its file path + exported symbols. */
export function buildEmbeddings(graph: GraphData, dimension = DIMENSION): EmbeddingsData {
  const entries: EmbeddingEntry[] = [];
  for (const node of Object.values(graph.nodes)) {
    const text = `${node.file} ${node.exports.join(' ')}`;
    entries.push({ file: node.file, vector: embedText(text, dimension) });
  }
  return { schemaVersion: EMBEDDINGS_SCHEMA_VERSION, provider: 'local-hash', dimension, entries };
}

export interface SemanticHit {
  file: string;
  similarity: number;
}

/** Rank nodes by cosine similarity of the query embedding against each node. */
export function semanticSearch(data: EmbeddingsData, query: string, limit = 20): SemanticHit[] {
  const queryVec = embedText(query, data.dimension);
  return data.entries
    .map((e) => ({ file: e.file, similarity: cosineSimilarity(queryVec, e.vector) }))
    .filter((h) => h.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

export async function saveEmbeddings(projectRoot: string, data: EmbeddingsData): Promise<void> {
  const store = new FileStoreImpl(projectRoot);
  await store.write(EMBEDDINGS_FILE, data);
}

export async function loadEmbeddings(projectRoot: string): Promise<EmbeddingsData | null> {
  const store = new FileStoreImpl(projectRoot);
  const data = await store.read<EmbeddingsData>(EMBEDDINGS_FILE);
  if (!data || data.schemaVersion !== EMBEDDINGS_SCHEMA_VERSION) return null;
  return data;
}
