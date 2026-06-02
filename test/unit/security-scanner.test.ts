import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanSecurity } from '../../src/engines/security-scanner.js';
import { DEFAULT_CONFIG } from '../../src/storage/config-store.js';
import { loadConfig } from '../../src/storage/config-store.js';

describe('Security Scanner', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `vibeguard-sec-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(join(testDir, 'src'), { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('detects OpenAI API keys', async () => {
    await writeFile(
      join(testDir, 'src', 'config.ts'),
      `const apiKey = "sk-abcdefghijklmnopqrstuvwxyz1234567890";`,
      'utf-8'
    );

    const config = await loadConfig(testDir);
    const result = await scanSecurity(testDir, ['src/config.ts'], config);

    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0].category).toBe('hard-coded-secret');
    expect(result.issues[0].severity).toBe('critical');
    expect(result.issues[0].id).toMatch(/^SEC-001-/);
  });

  it('detects AWS Access Key IDs', async () => {
    await writeFile(
      join(testDir, 'src', 'aws.ts'),
      `const key = "AKIAIOSFODNN7EXAMPLE";`,
      'utf-8'
    );

    const config = await loadConfig(testDir);
    const result = await scanSecurity(testDir, ['src/aws.ts'], config);

    expect(result.issues.some((i) => i.id.startsWith('SEC-003-'))).toBe(true);
  });

  it('detects CORS wildcard origin', async () => {
    await writeFile(
      join(testDir, 'src', 'server.ts'),
      `app.use(cors({ origin: '*' }));`,
      'utf-8'
    );

    const config = await loadConfig(testDir);
    const result = await scanSecurity(testDir, ['src/server.ts'], config);

    expect(result.issues.some((i) => i.category === 'framework-misuse')).toBe(true);
  });

  it('detects CORS without config', async () => {
    await writeFile(
      join(testDir, 'src', 'app.ts'),
      `app.use(cors());`,
      'utf-8'
    );

    const config = await loadConfig(testDir);
    const result = await scanSecurity(testDir, ['src/app.ts'], config);

    expect(result.issues.some((i) => i.category === 'framework-misuse')).toBe(true);
  });

  it('detects database connection URLs', async () => {
    await writeFile(
      join(testDir, 'src', 'db.ts'),
      `const url = "postgresql://user:pass@localhost:5432/mydb";`,
      'utf-8'
    );

    const config = await loadConfig(testDir);
    const result = await scanSecurity(testDir, ['src/db.ts'], config);

    expect(result.issues.some((i) => i.id.startsWith('SEC-006-'))).toBe(true);
  });

  it('produces stable IDs across runs', async () => {
    await writeFile(
      join(testDir, 'src', 'secret.ts'),
      `const key = "sk-abcdefghijklmnopqrstuvwxyz1234567890";`,
      'utf-8'
    );

    const config = await loadConfig(testDir);
    const result1 = await scanSecurity(testDir, ['src/secret.ts'], config);
    const result2 = await scanSecurity(testDir, ['src/secret.ts'], config);

    expect(result1.issues[0].id).toBe(result2.issues[0].id);
  });

  it('skips test files', async () => {
    await writeFile(
      join(testDir, 'src', 'config.test.ts'),
      `const apiKey = "sk-abcdefghijklmnopqrstuvwxyz1234567890";`,
      'utf-8'
    );

    const config = await loadConfig(testDir);
    const result = await scanSecurity(testDir, ['src/config.test.ts'], config);

    expect(result.issues.length).toBe(0);
  });

  it('detects .env not in .gitignore', async () => {
    await writeFile(join(testDir, '.env'), 'SECRET=value', 'utf-8');
    await writeFile(join(testDir, '.gitignore'), 'node_modules\n', 'utf-8');

    const config = await loadConfig(testDir);
    const result = await scanSecurity(testDir, [], config);

    expect(result.issues.some((i) => i.category === 'secrets-gitignore')).toBe(true);
  });

  it('applies custom secret patterns', async () => {
    await writeFile(
      join(testDir, 'src', 'custom.ts'),
      `const token = "CUSTOM_SECRET_12345";`,
      'utf-8'
    );

    await mkdir(join(testDir, '.vibeguard'), { recursive: true });
    await writeFile(
      join(testDir, '.vibeguard', 'config.json'),
      JSON.stringify({
        ...DEFAULT_CONFIG,
        security: { customSecretPatterns: ['CUSTOM_SECRET_\\d+'] },
      }),
      'utf-8'
    );

    const config = await loadConfig(testDir);
    const result = await scanSecurity(testDir, ['src/custom.ts'], config);

    expect(result.issues.some((i) => i.category === 'custom-secret')).toBe(true);
  });

  it('counts issues by severity', async () => {
    await writeFile(
      join(testDir, 'src', 'multi.ts'),
      `const key = "sk-abcdefghijklmnopqrstuvwxyz1234567890";\nconst db = "postgresql://user:pass@host/db";`,
      'utf-8'
    );

    const config = await loadConfig(testDir);
    const result = await scanSecurity(testDir, ['src/multi.ts'], config);

    expect(result.counts.critical).toBeGreaterThan(0);
    expect(result.counts.high).toBeGreaterThan(0);
  });
});
