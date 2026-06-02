/**
 * Universal LLM client using the OpenAI-compatible chat completions API.
 * Works with OpenRouter, OpenAI, Groq, Mistral, Google (OpenAI-compat endpoint),
 * and any custom OpenAI-compatible provider. Anthropic uses its native API.
 */
export class LLMClient {
    credentials;
    constructor(credentials) {
        this.credentials = credentials;
    }
    async complete(opts) {
        if (this.credentials.provider === 'anthropic') {
            return this.completeAnthropic(opts);
        }
        return this.completeOpenAICompatible(opts);
    }
    getBaseUrl() {
        if (this.credentials.baseUrl)
            return this.credentials.baseUrl.replace(/\/$/, '');
        throw new Error('No base URL configured for LLM provider');
    }
    async completeOpenAICompatible(opts) {
        const url = `${this.getBaseUrl()}/chat/completions`;
        const headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.credentials.apiKey}`,
        };
        // OpenRouter recommends these headers for attribution
        if (this.credentials.provider === 'openrouter') {
            headers['HTTP-Referer'] = 'https://github.com/vibeguard/vibeguard';
            headers['X-Title'] = 'VibeGuard';
        }
        const body = {
            model: this.credentials.model,
            messages: opts.messages,
            max_tokens: opts.maxTokens ?? 2000,
            temperature: opts.temperature ?? 0.2,
        };
        const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`LLM request failed (${res.status}): ${text.slice(0, 300)}`);
        }
        const data = (await res.json());
        const content = data.choices?.[0]?.message?.content ?? '';
        return {
            content,
            usage: {
                promptTokens: data.usage?.prompt_tokens ?? 0,
                completionTokens: data.usage?.completion_tokens ?? 0,
                totalTokens: data.usage?.total_tokens ?? 0,
            },
            model: data.model ?? this.credentials.model,
        };
    }
    async completeAnthropic(opts) {
        const url = `${this.getBaseUrl()}/messages`;
        // Anthropic separates system prompt from messages
        const systemMsg = opts.messages.find((m) => m.role === 'system');
        const chatMessages = opts.messages
            .filter((m) => m.role !== 'system')
            .map((m) => ({ role: m.role, content: m.content }));
        const body = {
            model: this.credentials.model,
            max_tokens: opts.maxTokens ?? 2000,
            temperature: opts.temperature ?? 0.2,
            ...(systemMsg ? { system: systemMsg.content } : {}),
            messages: chatMessages,
        };
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.credentials.apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Anthropic request failed (${res.status}): ${text.slice(0, 300)}`);
        }
        const data = (await res.json());
        const content = data.content?.map((c) => c.text).join('') ?? '';
        const promptTokens = data.usage?.input_tokens ?? 0;
        const completionTokens = data.usage?.output_tokens ?? 0;
        return {
            content,
            usage: {
                promptTokens,
                completionTokens,
                totalTokens: promptTokens + completionTokens,
            },
            model: data.model ?? this.credentials.model,
        };
    }
    /**
     * Quick connectivity test — sends a minimal request to verify the key works.
     */
    async testConnection() {
        try {
            const res = await this.complete({
                messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
                maxTokens: 5,
            });
            return { ok: true, model: res.model };
        }
        catch (err) {
            return { ok: false, model: this.credentials.model, error: err instanceof Error ? err.message : 'unknown' };
        }
    }
}
//# sourceMappingURL=llm-provider.js.map