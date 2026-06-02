import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { ResolvedConfig } from '../storage/config-store.js';

export interface CostEstimate {
  tokens: number;
  range: { low: number; high: number };
  perModel: Record<string, { tokens: number; usd: number }>;
}

const TOKENS_PER_LINE: Record<string, number> = {
  '.ts': 8,
  '.tsx': 9,
  '.js': 7,
  '.jsx': 8,
  '.mjs': 7,
  '.cjs': 7,
  '.json': 5,
  '.md': 6,
  '.css': 5,
  '.html': 6,
};

const STREAM_THRESHOLD = 1024 * 1024; // 1MB

export async function estimateCost(
  files: string[],
  projectRoot: string,
  config: ResolvedConfig
): Promise<CostEstimate> {
  let totalTokens = 0;

  for (const file of files) {
    const fullPath = resolve(projectRoot, file);
    const ext = '.' + file.split('.').pop();
    const tokensPerLine = TOKENS_PER_LINE[ext];

    try {
      const fileStat = await stat(fullPath);

      if (tokensPerLine) {
        const lineCount = fileStat.size > STREAM_THRESHOLD
          ? await countLinesStream(fullPath)
          : await countLinesBuffer(fullPath);
        totalTokens += lineCount * tokensPerLine;
      } else {
        // Fallback: chars / 4
        totalTokens += Math.ceil(fileStat.size / 4);
      }
    } catch {
      // File unreadable, skip
    }
  }

  const perModel: Record<string, { tokens: number; usd: number }> = {};

  for (const [modelName, modelConfig] of Object.entries(config.context.models)) {
    const modelTokens = Math.ceil(totalTokens * (modelConfig.tokensPerKiloChar / 250));
    const usd = (modelTokens / 1000) * modelConfig.pricePer1K;
    perModel[modelName] = { tokens: modelTokens, usd: Math.round(usd * 1000000) / 1000000 };
  }

  return {
    tokens: totalTokens,
    range: { low: Math.round(totalTokens * 0.8), high: Math.round(totalTokens * 1.2) },
    perModel,
  };
}

async function countLinesBuffer(filePath: string): Promise<number> {
  const content = await readFile(filePath, 'utf-8');
  return content.split('\n').length;
}

function countLinesStream(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let count = 0;
    const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
    rl.on('line', () => count++);
    rl.on('close', () => resolve(count));
    rl.on('error', reject);
  });
}
