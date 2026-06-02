import { describe, it, expect } from 'vitest';
import { tokenize, extractQueryIdentifiers, buildSearchIndex, searchIndex } from '../../src/engines/search-index.js';
import type { GraphData } from '../../src/engines/graph-builder.js';

function makeGraph(): GraphData {
  return {
    schemaVersion: '2.2.0',
    nodes: {
      'src/auth/login.ts': { file: 'src/auth/login.ts', imports: [], exports: ['authenticateUser', 'LoginForm'], dependents: [], edges: [] },
      'src/utils/logger.ts': { file: 'src/utils/logger.ts', imports: [], exports: ['createLogger'], dependents: [], edges: [] },
      'src/payments/stripe.ts': { file: 'src/payments/stripe.ts', imports: [], exports: ['chargeCard', 'refund'], dependents: [], edges: [] },
    },
  } as unknown as GraphData;
}

describe('tokenize', () => {
  it('splits camelCase, snake_case, and paths into lowercase terms', () => {
    expect(tokenize('authenticateUser')).toEqual(['authenticate', 'user']);
    expect(tokenize('create_logger')).toEqual(['create', 'logger']);
    expect(tokenize('src/auth/login.ts')).toEqual(['src', 'auth', 'login', 'ts']);
  });

  it('drops single-character tokens', () => {
    expect(tokenize('a bb ccc')).toEqual(['bb', 'ccc']);
  });
});

describe('extractQueryIdentifiers', () => {
  it('pulls dotted and camelCase identifiers from a natural-language query', () => {
    const ids = extractQueryIdentifiers('how does AuthService.login authenticateUser work');
    expect(ids).toContain('auth');
    expect(ids).toContain('service');
    expect(ids).toContain('login');
    expect(ids).toContain('user');
  });
});

describe('buildSearchIndex / searchIndex', () => {
  it('indexes every node', () => {
    const index = buildSearchIndex(makeGraph());
    expect(index.documents.length).toBe(3);
  });

  it('finds nodes by file-path term', () => {
    const index = buildSearchIndex(makeGraph());
    const hits = searchIndex(index, 'payments');
    expect(hits[0].file).toBe('src/payments/stripe.ts');
  });

  it('ranks exact exported-symbol matches highest', () => {
    const index = buildSearchIndex(makeGraph());
    const hits = searchIndex(index, 'chargeCard');
    expect(hits[0].file).toBe('src/payments/stripe.ts');
  });

  it('returns empty for an all-stopword/empty query', () => {
    const index = buildSearchIndex(makeGraph());
    expect(searchIndex(index, '')).toEqual([]);
  });

  it('respects the limit', () => {
    const index = buildSearchIndex(makeGraph());
    const hits = searchIndex(index, 'src', 2);
    expect(hits.length).toBeLessThanOrEqual(2);
  });
});
