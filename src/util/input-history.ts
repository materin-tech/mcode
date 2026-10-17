/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { historyPath, mcodeDir } from '../config/constants.js';

export interface HistoryEntry {
  text: string;
  cwd: string;
  ts: number;
}

/** Append one input; consecutive duplicates in same cwd are skipped. */
export function appendInputHistory(text: string, cwd: string): void {
  if (text.trim().length === 0) return;
  mkdirSync(mcodeDir(), { recursive: true });
  // dedupe against the LAST appended line (newest), not the first
  if (existsSync(historyPath())) {
    const lines = readFileSync(historyPath(), 'utf8').split('\n').filter((l) => l.trim().length > 0);
    const last = lines[lines.length - 1];
    if (last) {
      try {
        const lastEntry = JSON.parse(last) as HistoryEntry;
        if (lastEntry.cwd === cwd && lastEntry.text === text) return;
      } catch {
        // skip malformed
      }
    }
  }
  const entry: HistoryEntry = { text, cwd, ts: Date.now() };
  appendFileSync(historyPath(), `${JSON.stringify(entry)}\n`, 'utf8');
}

/**
 * Read history for recall: current-cwd entries first (newest → oldest),
 * then entries from other directories; consecutive duplicates collapse.
 */
export function readInputHistory(cwd: string, limit = 100): string[] {
  if (!existsSync(historyPath())) return [];
  const lines = readFileSync(historyPath(), 'utf8').split('\n').filter((l) => l.trim().length > 0);
  const current: string[] = [];
  const global: string[] = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as HistoryEntry;
      if (entry.cwd === cwd) current.push(entry.text);
      else global.push(entry.text);
    } catch {
      // skip malformed lines
    }
  }
  // Order: NEWEST first (shell semantics). Re-entered older inputs surface
  // to the top. recallUp starts at index 0. (Regression fixes: an earlier
  // .reverse() made ↑ recall the OLDEST global entry, and seen-set dedupe
  // kept the FIRST position of re-entered inputs.)
  const result: string[] = [];
  const seen = new Set<string>();
  const push = (texts: string[]): void => {
    for (let i = texts.length - 1; i >= 0; i--) {
      const text = texts[i]!;
      if (!seen.has(text)) {
        seen.add(text);
        result.push(text);
      }
    }
  };
  push(current);
  push(global);
  return result.slice(0, limit);
}
