/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expect } from 'vitest';
import { HistoryStore } from './history.js';
import { estimateTokens, planCompaction } from './compaction.js';
import type { ChatMessage } from '../api/client.js';

describe('HistoryStore', () => {
  it('pushTurn stores user+assistant pairs', () => {
    const store = new HistoryStore();
    store.pushTurn('q1', 'a1');
    store.pushTurn('q2', 'a2');
    expect(store.all()).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' },
      { role: 'assistant', content: 'a2' },
    ]);
  });

  it('skips empty assistant replies', () => {
    const store = new HistoryStore();
    store.pushTurn('q1', '   ');
    expect(store.all()).toHaveLength(0);
  });

  it('compact keeps recent tail and summary head', () => {
    const store = new HistoryStore();
    for (let i = 0; i < 10; i++) store.pushTurn(`q${i}`, `a${i}`);
    store.compact('summary', 2);
    const msgs = store.all();
    expect(msgs[0]!.content).toContain('[compacted history] summary');
    expect(msgs).toHaveLength(5); // 1 summary + 4 tail messages
  });

  it('restore replaces history', () => {
    const store = new HistoryStore();
    store.restore([{ role: 'user', content: 'old' }]);
    expect(store.all()).toHaveLength(1);
  });
});

describe('estimateTokens / planCompaction', () => {
  it('estimates by chars/4', () => {
    expect(estimateTokens([{ role: 'user', content: 'x'.repeat(400) }])).toBe(100);
  });

  it('no compaction below threshold', () => {
    const plan = planCompaction([{ role: 'user', content: 'hi' }], 1000);
    expect(plan.shouldCompact).toBe(false);
  });

  it('compacts above threshold keeping recent turns', () => {
    const msgs: ChatMessage[] = Array.from({ length: 20 }, (_, i) => ({
      role: 'user' as const,
      content: 'y'.repeat(600),
    })) as ChatMessage[];
    const plan = planCompaction(msgs, 1000);
    expect(plan.shouldCompact).toBe(true);
    expect(plan.keepTurns).toBeGreaterThanOrEqual(2);
  });
});
