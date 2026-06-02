import { describe, it, expect } from 'vitest';
import { embedText, cosineSimilarity, buildEmbeddings, semanticSearch } from '../../src/engines/embeddings.js';
import type { GraphData } from '../../src/engines/graph-builder.js';

function makeGraph(): GraphData {
  return {
    schemaVersion: '2.2.0',
    nodes: {
      'src/auth/login.ts': { file: 'src/auth/login.ts', imports: [], exports: ['authenticateUser', 'login'], dependents: [], edges: [] },
      'src/payments/stripe.ts': { file: 'src/payments/stripe.ts', imports: [], exports: ['chargeCard', 'refundPayment'], dependents: [], edges: [] },
      'src/utils/logger.ts': { file: 'src/utils/logger.ts', imports: [], exports: ['createLogger'], dependents: [], edges: [] },
    },
  } as unknown as GraphData;
}

describe('embedText', () => {
  it('produces a unit-normalized fixed-dimension vector', () => {
    const v = embedText('authenticate user login', 128);
    expect(v.length).toBe(128);
    const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(mag).toBeCloseTo(1, 5);
  });

  it('is deterministic for the same input', () => {
    expect(embedText('hello world')).toEqual(embedText('hello world'));
  });

  it('returns an all-zero vector for empty/symbol-only text', () => {
    const v = embedText('');
    expect(v.every((x) => x === 0)).toBe(true);
  });
});

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors and higher for related text', () => {
    const a = embedText('authenticate user login session');
    expect(cosineSimilarity(a, a)).toBeCloseTo(1, 5);

    const related = embedText('user authentication login');
    const unrelated = embedText('stripe payment charge card refund');
    expect(cosineSimilarity(a, related)).toBeGreaterThan(cosineSimilarity(a, unrelated));
  });

  it('returns 0 for mismatched lengths', () => {
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
  });
});

describe('buildEmbeddings / semanticSearch', () => {
  it('embeds every node', () => {
    const data = buildEmbeddings(makeGraph());
    expect(data.entries.length).toBe(3);
    expect(data.provider).toBe('local-hash');
  });

  it('ranks the most lexically-related node first', () => {
    const data = buildEmbeddings(makeGraph());
    const hits = semanticSearch(data, 'authenticate user login');
    expect(hits[0].file).toBe('src/auth/login.ts');
  });

  it('respects the limit', () => {
    const data = buildEmbeddings(makeGraph());
    expect(semanticSearch(data, 'src', 1).length).toBeLessThanOrEqual(1);
  });
});
