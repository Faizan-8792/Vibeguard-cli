import type { ResolvedConfig } from '../storage/config-store.js';
export interface CostEstimate {
    tokens: number;
    range: {
        low: number;
        high: number;
    };
    perModel: Record<string, {
        tokens: number;
        usd: number;
    }>;
}
export declare function estimateCost(files: string[], projectRoot: string, config: ResolvedConfig): Promise<CostEstimate>;
