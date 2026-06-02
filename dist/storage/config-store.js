import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { VibeguardError, ErrorCodes } from '../utils/errors.js';
export const DEFAULT_CONFIG = {
    ignore: [
        'node_modules/**',
        'dist/**',
        'build/**',
        'coverage/**',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.test.js',
        '**/*.spec.ts',
        '**/*.spec.tsx',
        '**/*.spec.js',
        '.vibeguard/**',
        '.vibeguard-trash/**',
    ],
    tags: { customRules: [] },
    importance: {
        weights: { dependents: 5, imports: 2, git: 3, route: 4 },
    },
    security: { customSecretPatterns: [] },
    context: {
        defaultRadius: 2,
        defaultTokenBudget: 12000,
        models: {
            'claude-3': { tokensPerKiloChar: 280, pricePer1K: 0.003 },
            'gpt-4': { tokensPerKiloChar: 260, pricePer1K: 0.01 },
        },
    },
    clean: { maxChangesPerRun: 50 },
    limits: { maxFilesPerRun: 200 },
};
const DEFAULT_EXTENSIONS = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'];
function validateConfig(data) {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        throw new VibeguardError(ErrorCodes.CONFIG_INVALID, 'Config must be a JSON object');
    }
    const obj = data;
    // Validate ignore
    if (obj.ignore !== undefined && !Array.isArray(obj.ignore)) {
        throw new VibeguardError(ErrorCodes.CONFIG_INVALID, 'Config key "ignore" must be an array', { key: 'ignore' });
    }
    // Validate importance.weights
    if (obj.importance !== undefined) {
        if (typeof obj.importance !== 'object' || obj.importance === null) {
            throw new VibeguardError(ErrorCodes.CONFIG_INVALID, 'Config key "importance" must be an object', { key: 'importance' });
        }
        const imp = obj.importance;
        if (imp.weights !== undefined && typeof imp.weights !== 'object') {
            throw new VibeguardError(ErrorCodes.CONFIG_INVALID, 'Config key "importance.weights" must be an object', { key: 'importance.weights' });
        }
    }
    // Validate context
    if (obj.context !== undefined) {
        if (typeof obj.context !== 'object' || obj.context === null) {
            throw new VibeguardError(ErrorCodes.CONFIG_INVALID, 'Config key "context" must be an object', { key: 'context' });
        }
        const ctx = obj.context;
        if (ctx.defaultRadius !== undefined && typeof ctx.defaultRadius !== 'number') {
            throw new VibeguardError(ErrorCodes.CONFIG_INVALID, 'Config key "context.defaultRadius" must be a number', { key: 'context.defaultRadius' });
        }
        if (ctx.defaultTokenBudget !== undefined && typeof ctx.defaultTokenBudget !== 'number') {
            throw new VibeguardError(ErrorCodes.CONFIG_INVALID, 'Config key "context.defaultTokenBudget" must be a number', { key: 'context.defaultTokenBudget' });
        }
    }
    // Merge with defaults
    const config = {
        ignore: obj.ignore ?? DEFAULT_CONFIG.ignore,
        tags: {
            customRules: obj.tags?.customRules ?? DEFAULT_CONFIG.tags.customRules,
        },
        importance: {
            weights: {
                ...DEFAULT_CONFIG.importance.weights,
                ...obj.importance?.weights,
            },
        },
        security: {
            customSecretPatterns: obj.security?.customSecretPatterns ?? DEFAULT_CONFIG.security.customSecretPatterns,
        },
        context: {
            defaultRadius: obj.context?.defaultRadius ?? DEFAULT_CONFIG.context.defaultRadius,
            defaultTokenBudget: obj.context?.defaultTokenBudget ?? DEFAULT_CONFIG.context.defaultTokenBudget,
            models: obj.context?.models ?? DEFAULT_CONFIG.context.models,
        },
        clean: {
            maxChangesPerRun: obj.clean?.maxChangesPerRun ?? DEFAULT_CONFIG.clean.maxChangesPerRun,
        },
        limits: {
            maxFilesPerRun: obj.limits?.maxFilesPerRun ?? DEFAULT_CONFIG.limits.maxFilesPerRun,
        },
    };
    return config;
}
export async function loadConfig(projectRoot, configPath, cliInclude, cliExclude) {
    const filePath = configPath ?? join(projectRoot, '.vibeguard', 'config.json');
    let config;
    try {
        const content = await readFile(filePath, 'utf-8');
        let parsed;
        try {
            parsed = JSON.parse(content);
        }
        catch {
            throw new VibeguardError(ErrorCodes.CONFIG_INVALID, 'Config file contains malformed JSON', { path: filePath });
        }
        config = validateConfig(parsed);
    }
    catch (err) {
        if (err instanceof VibeguardError)
            throw err;
        // File doesn't exist — use defaults
        config = { ...DEFAULT_CONFIG };
    }
    const effectiveSkipSet = [...config.ignore, ...(cliExclude ?? [])];
    const effectiveInclude = cliInclude && cliInclude.length > 0 ? cliInclude : DEFAULT_EXTENSIONS;
    return {
        ...config,
        effectiveSkipSet,
        effectiveInclude,
    };
}
//# sourceMappingURL=config-store.js.map