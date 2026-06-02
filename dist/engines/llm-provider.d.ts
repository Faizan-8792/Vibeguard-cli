import type { LLMCredentials } from '../storage/credentials-store.js';
export interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}
export interface LLMResponse {
    content: string;
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    model: string;
}
export interface LLMRequestOptions {
    messages: LLMMessage[];
    maxTokens?: number;
    temperature?: number;
}
/**
 * Universal LLM client using the OpenAI-compatible chat completions API.
 * Works with OpenRouter, OpenAI, Groq, Mistral, Google (OpenAI-compat endpoint),
 * and any custom OpenAI-compatible provider. Anthropic uses its native API.
 */
export declare class LLMClient {
    private readonly credentials;
    constructor(credentials: LLMCredentials);
    complete(opts: LLMRequestOptions): Promise<LLMResponse>;
    private getBaseUrl;
    private completeOpenAICompatible;
    private completeAnthropic;
    /**
     * Quick connectivity test — sends a minimal request to verify the key works.
     */
    testConnection(): Promise<{
        ok: boolean;
        model: string;
        error?: string;
    }>;
}
