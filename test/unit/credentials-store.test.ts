import { describe, it, expect } from 'vitest';
import { CredentialsStore, inferProvider, PROVIDER_DEFAULTS } from '../../src/storage/credentials-store.js';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Credentials Store', () => {
  it('saves and loads credentials', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vg-cred-'));
    await mkdir(join(dir, '.vibeguard'), { recursive: true });
    const store = new CredentialsStore(dir);

    await store.save({ provider: 'openrouter', apiKey: 'sk-or-test123', model: 'test-model', baseUrl: 'https://x/v1' });
    const loaded = await store.load();

    expect(loaded).not.toBeNull();
    expect(loaded?.provider).toBe('openrouter');
    expect(loaded?.apiKey).toBe('sk-or-test123');
    expect(loaded?.model).toBe('test-model');

    await rm(dir, { recursive: true, force: true });
  });

  it('returns null when no credentials exist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vg-cred-'));
    const store = new CredentialsStore(dir);
    expect(await store.load()).toBeNull();
    await rm(dir, { recursive: true, force: true });
  });

  it('clears credentials', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vg-cred-'));
    await mkdir(join(dir, '.vibeguard'), { recursive: true });
    const store = new CredentialsStore(dir);
    await store.save({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o-mini' });
    await store.clear();
    expect(await store.load()).toBeNull();
    await rm(dir, { recursive: true, force: true });
  });

  it('infers provider from key prefix', () => {
    expect(inferProvider('sk-or-v1-abc')).toBe('openrouter');
    expect(inferProvider('sk-ant-abc')).toBe('anthropic');
    expect(inferProvider('gsk_abc')).toBe('groq');
    expect(inferProvider('AIzaABC')).toBe('google');
    expect(inferProvider('xai-abc')).toBe('xai');
    expect(inferProvider('pplx-abc')).toBe('perplexity');
    expect(inferProvider('sk-abc')).toBe('openai');
  });

  it('has defaults for every provider', () => {
    for (const provider of ['openrouter', 'openai', 'anthropic', 'google', 'deepseek', 'groq', 'mistral', 'xai', 'together', 'perplexity', 'fireworks', 'deepinfra', 'moonshot', 'ollama'] as const) {
      expect(PROVIDER_DEFAULTS[provider].model).toBeTruthy();
      expect(PROVIDER_DEFAULTS[provider].baseUrl).toBeTruthy();
      expect(PROVIDER_DEFAULTS[provider].label).toBeTruthy();
    }
  });

  it('resolves from env var when no file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vg-cred-'));
    process.env['VIBEGUARD_API_KEY'] = 'sk-or-env-test';
    const store = new CredentialsStore(dir);
    const resolved = await store.resolve();
    expect(resolved?.apiKey).toBe('sk-or-env-test');
    expect(resolved?.provider).toBe('openrouter');
    delete process.env['VIBEGUARD_API_KEY'];
    await rm(dir, { recursive: true, force: true });
  });
});
