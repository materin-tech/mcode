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
  const prev = readInputHistory(cwd, 1);
  if (prev.length > 0 && prev[0] === text) return;
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
  const result: string[] = [];
  const seen = new Set<string>();
  const push = (texts: string[]): void => {
    for (const text of texts.reverse()) {
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
