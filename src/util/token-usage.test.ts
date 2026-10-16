/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expect } from 'vitest';
import { createUsageTracker, formatUsageTable } from './token-usage.js';

describe('usageTracker', () => {
  it('accumulates per model without mutation of prior snapshots', () => {
    const tracker = createUsageTracker();
    tracker.add('m1', { inputTokens: 10, outputTokens: 5, cachedTokens: 2 });
    const snap1 = tracker.snapshot();
    tracker.add('m1', { inputTokens: 20, outputTokens: 5, cachedTokens: 0 });
    const snap2 = tracker.snapshot();
    expect(snap1[0]!.inputTokens).toBe(10);
    expect(snap2[0]!.inputTokens).toBe(30);
  });

  it('formats a table with all models', () => {
    const tracker = createUsageTracker();
    tracker.add('m1', { inputTokens: 10, outputTokens: 5, cachedTokens: 2 });
    tracker.add('m2', { inputTokens: 1, outputTokens: 1, cachedTokens: 0 });
    const table = formatUsageTable(tracker.snapshot());
    expect(table).toContain('m1 | 10 | 5 | 2 | 1');
    expect(table).toContain('m2');
  });

  it('empty tracker formats placeholder', () => {
    expect(formatUsageTable([])).toBe('no usage recorded');
  });
});
