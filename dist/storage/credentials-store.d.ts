export type LLMProvider = 'openrouter' | 'openai' | 'anthropic' | 'google' | 'deepseek' | 'groq' | 'mistral' | 'xai' | 'together' | 'perplexity' | 'fireworks' | 'deepinfra' | 'moonshot' | 'ollama' | 'custom';
/**
 * All supported providers in canonical display order. Single source of truth
 * for provider validation and selection menus. Keep in sync with the
 * {@link LLMProvider} union and {@link PROVIDER_DEFAULTS}.
 */
export declare const LLM_PROVIDERS: LLMProvider[];
export interface LLMCredentials {
    provider: LLMProvider;
    apiKey: string;
    model: string;
    baseUrl?: string;
    maxBudgetTokens?: number;
}
interface ProviderDefault {
    model: string;
    baseUrl: string;
    label: string;
}
/**
 * Default model + base URL per provider. All use OpenAI-compatible chat
 * completions endpoints except Anthropic (handled natively in the client).
 */
export declare const PROVIDER_DEFAULTS: Record<LLMProvider, ProviderDefault>;
/**
 * Infer the provider from an API key prefix when possible.
 */
export declare function inferProvider(apiKey: string): LLMProvider;
export declare class CredentialsStore {
    private readonly filePath;
    constructor(projectRoot: string);
    load(): Promise<LLMCredentials | null>;
    save(credentials: LLMCredentials): Promise<void>;
    clear(): Promise<void>;
    /**
     * Resolve credentials. Precedence: stored file > VIBEGUARD_API_KEY env.
     */
    resolve(): Promise<LLMCredentials | null>;
    private writeFileContents;
}
export {};
