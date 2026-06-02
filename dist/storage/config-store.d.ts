export interface TagRule {
    match: string;
    add: string[];
}
export interface ImportanceWeights {
    dependents: number;
    imports: number;
    git: number;
    route: number;
}
export interface ModelConfig {
    tokensPerKiloChar: number;
    pricePer1K: number;
}
export interface VibeguardConfig {
    ignore: string[];
    tags: {
        customRules: TagRule[];
    };
    importance: {
        weights: ImportanceWeights;
    };
    security: {
        customSecretPatterns: string[];
    };
    context: {
        defaultRadius: number;
        defaultTokenBudget: number;
        models: Record<string, ModelConfig>;
    };
    clean: {
        maxChangesPerRun: number;
    };
    limits: {
        maxFilesPerRun: number;
    };
}
export interface ResolvedConfig extends VibeguardConfig {
    effectiveSkipSet: string[];
    effectiveInclude: string[];
}
export declare const DEFAULT_CONFIG: VibeguardConfig;
export declare function loadConfig(projectRoot: string, configPath?: string, cliInclude?: string[], cliExclude?: string[]): Promise<ResolvedConfig>;
