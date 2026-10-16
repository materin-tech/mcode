/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import type { UsageInfo } from '../api/client.js';

export interface ModelUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  requests: number;
}

/**
 * Accumulates token usage per model. Snapshot-based: add() returns a new
 * aggregate rather than mutating, callers hold the latest snapshot.
 */
export function createUsageTracker() {
  let byModel = new Map<string, ModelUsage>();

  return {
    add(model: string, usage: UsageInfo | null): ModelUsage[] {
      if (usage) {
        const prev = byModel.get(model) ?? {
          model,
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          requests: 0,
        };
        byModel.set(model, {
          model,
          inputTokens: prev.inputTokens + usage.inputTokens,
          outputTokens: prev.outputTokens + usage.outputTokens,
          cachedTokens: prev.cachedTokens + usage.cachedTokens,
          requests: prev.requests + 1,
        });
      }
      return this.snapshot();
    },

    snapshot(): ModelUsage[] {
      return [...byModel.values()].map((m) => ({ ...m }));
    },
  };
}

export function formatUsageTable(rows: ModelUsage[]): string {
  if (rows.length === 0) return 'no usage recorded';
  const header = 'model | input | output | cached | requests';
  const lines = rows.map(
    (m) => `${m.model} | ${m.inputTokens} | ${m.outputTokens} | ${m.cachedTokens} | ${m.requests}`,
  );
  return [header, ...lines].join('\n');
}
