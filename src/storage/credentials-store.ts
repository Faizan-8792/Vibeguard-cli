import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { join, dirname } from 'node:path';

export type LLMProvider =
  | 'openrouter'
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'groq'
  | 'mistral'
  | 'xai'
  | 'together'
  | 'perplexity'
  | 'fireworks'
  | 'deepinfra'
  | 'moonshot'
  | 'ollama'
  | 'custom';

/**
 * All supported providers in canonical display order. Single source of truth
 * for provider validation and selection menus. Keep in sync with the
 * {@link LLMProvider} union and {@link PROVIDER_DEFAULTS}.
 */
export const LLM_PROVIDERS: LLMProvider[] = [
  'openrouter', 'openai', 'anthropic', 'google', 'deepseek', 'groq',
  'mistral', 'xai', 'together', 'perplexity', 'fireworks', 'deepinfra',
  'moonshot', 'ollama', 'custom',
];

export interface LLMCredentials {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxBudgetTokens?: number;
}

interface CredentialsFile {
  schemaVersion: string;
  llm?: LLMCredentials;
}

interface ProviderDefault {
  model: string;
  baseUrl: string;
  label: string;
}

const CREDENTIALS_SCHEMA_VERSION = '1.0.0';

/**
 * Default model + base URL per provider. All use OpenAI-compatible chat
 * completions endpoints except Anthropic (handled natively in the client).
 */
export const PROVIDER_DEFAULTS: Record<LLMProvider, ProviderDefault> = {
  openrouter: { model: 'anthropic/claude-3.5-haiku', baseUrl: 'https://openrouter.ai/api/v1', label: 'OpenRouter (400+ models)' },
  openai: { model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1', label: 'OpenAI / ChatGPT' },
  anthropic: { model: 'claude-3-5-haiku-20241022', baseUrl: 'https://api.anthropic.com/v1', label: 'Anthropic Claude' },
  google: { model: 'gemini-1.5-flash', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', label: 'Google Gemini' },
  deepseek: { model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1', label: 'DeepSeek' },
  groq: { model: 'llama-3.3-70b-versatile', baseUrl: 'https://api.groq.com/openai/v1', label: 'Groq (fast inference)' },
  mistral: { model: 'mistral-small-latest', baseUrl: 'https://api.mistral.ai/v1', label: 'Mistral AI' },
  xai: { model: 'grok-2-latest', baseUrl: 'https://api.x.ai/v1', label: 'xAI Grok' },
  together: { model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', baseUrl: 'https://api.together.xyz/v1', label: 'Together AI' },
  perplexity: { model: 'llama-3.1-sonar-small-128k-online', baseUrl: 'https://api.perplexity.ai', label: 'Perplexity' },
  fireworks: { model: 'accounts/fireworks/models/llama-v3p3-70b-instruct', baseUrl: 'https://api.fireworks.ai/inference/v1', label: 'Fireworks AI' },
  deepinfra: { model: 'meta-llama/Llama-3.3-70B-Instruct', baseUrl: 'https://api.deepinfra.com/v1/openai', label: 'DeepInfra' },
  moonshot: { model: 'moonshot-v1-8k', baseUrl: 'https://api.moonshot.cn/v1', label: 'Moonshot / Kimi' },
  ollama: { model: 'llama3.2', baseUrl: 'http://localhost:11434/v1', label: 'Ollama (local, no key)' },
  custom: { model: '', baseUrl: '', label: 'Custom (any OpenAI-compatible endpoint)' },
};

/**
 * Infer the provider from an API key prefix when possible.
 */
export function inferProvider(apiKey: string): LLMProvider {
  if (apiKey.startsWith('sk-or-')) return 'openrouter';
  if (apiKey.startsWith('sk-ant-')) return 'anthropic';
  if (apiKey.startsWith('gsk_')) return 'groq';
  if (apiKey.startsWith('AIza')) return 'google';
  if (apiKey.startsWith('xai-')) return 'xai';
  if (apiKey.startsWith('pplx-')) return 'perplexity';
  if (apiKey.startsWith('fw_')) return 'fireworks';
  if (apiKey.startsWith('sk-')) return 'openai'; // generic OpenAI-style key (also DeepSeek/Moonshot use sk-)
  return 'openrouter';
}

export class CredentialsStore {
  private readonly filePath: string;

  constructor(projectRoot: string) {
    this.filePath = join(projectRoot, '.vibeguard', 'credentials.json');
  }

  async load(): Promise<LLMCredentials | null> {
    try {
      const content = await readFile(this.filePath, 'utf-8');
      const data = JSON.parse(content) as CredentialsFile;
      return data.llm ?? null;
    } catch {
      return null;
    }
  }

  async save(credentials: LLMCredentials): Promise<void> {
    await this.writeFileContents({
      schemaVersion: CREDENTIALS_SCHEMA_VERSION,
      llm: credentials,
    });
  }

  async clear(): Promise<void> {
    await this.writeFileContents({ schemaVersion: CREDENTIALS_SCHEMA_VERSION });
  }

  /**
   * Resolve credentials. Precedence: stored file > VIBEGUARD_API_KEY env.
   */
  async resolve(): Promise<LLMCredentials | null> {
    const stored = await this.load();
    if (stored?.apiKey) return stored;
    return resolveCredentialsFromEnv();
  }

  private async writeFileContents(data: CredentialsFile): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    // Restrict permissions where supported (no-op on Windows)
    try {
      await chmod(this.filePath, 0o600);
    } catch {
      // Windows or permission denied — ignore
    }
  }
}

/**
 * Build credentials from VIBEGUARD_* environment variables, or null when unset.
 */
function resolveCredentialsFromEnv(): LLMCredentials | null {
  const apiKey = process.env['VIBEGUARD_API_KEY'];
  if (!apiKey) return null;

  const provider = (process.env['VIBEGUARD_PROVIDER'] as LLMProvider | undefined) ?? inferProvider(apiKey);
  const defaults = PROVIDER_DEFAULTS[provider];
  return {
    provider,
    apiKey,
    model: process.env['VIBEGUARD_MODEL'] ?? defaults.model,
    baseUrl: process.env['VIBEGUARD_BASE_URL'] ?? defaults.baseUrl,
  };
}
