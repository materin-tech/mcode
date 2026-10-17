/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readInputHistory, appendInputHistory } from './input-history.js';

const TMP = mkdtempSync(join(tmpdir(), 'mcode-hist-'));
let origHome: string | undefined;
const cwd = join(TMP, 'ws');

beforeEach(() => {
  origHome = process.env['HOME'];
  process.env['HOME'] = TMP;
  rmSync(join(TMP, '.mcode'), { recursive: true, force: true });
  mkdirSync(join(TMP, '.mcode'), { recursive: true });
  mkdirSync(cwd, { recursive: true });
});

afterEach(() => {
  process.env['HOME'] = origHome;
  rmSync(TMP, { recursive: true, force: true });
});

describe('readInputHistory ordering (regression: reverse bug)', () => {
  it('returns NEWEST FIRST so recallUp starts from the most recent', () => {
    const p = join(TMP, '.mcode', 'history.jsonl');
    const line = (t: string) => JSON.stringify({ text: t, cwd, ts: 1 }) + '\n';
    writeFileSync(p, line('older racing task') + line('newest racing task') + line('middle one'));
    const result = readInputHistory(cwd);
    expect(result[0]).toBe('middle one');
    expect(result[1]).toBe('newest racing task');
    expect(result[2]).toBe('older racing task');
  });

  it('cwd entries come before global entries (both newest-first)', () => {
    const p = join(TMP, '.mcode', 'history.jsonl');
    writeFileSync(p,
      JSON.stringify({ text: 'other-dir input', cwd: '/elsewhere', ts: 1 }) + '\n' +
      JSON.stringify({ text: 'this-dir input', cwd, ts: 2 }) + '\n');
    const result = readInputHistory(cwd);
    expect(result).toEqual(['this-dir input', 'other-dir input']);
  });

  it('re-entered older inputs surface to the newest position', () => {
    const p = join(TMP, '.mcode', 'history.jsonl');
    writeFileSync(p,
      JSON.stringify({ text: 'first', cwd, ts: 1 }) + '\n' +
      JSON.stringify({ text: 'second', cwd, ts: 2 }) + '\n' +
      JSON.stringify({ text: 'first', cwd, ts: 3 }) + '\n');
    expect(readInputHistory(cwd)[0]).toBe('first');
  });

  it('append dedupe compares the newest line, not the oldest', () => {
    appendInputHistory('first', cwd);
    appendInputHistory('second', cwd);
    // appending the newest again is skipped…
    appendInputHistory('second', cwd);
    const result = readInputHistory(cwd);
    expect(result.filter((t) => t === 'second')).toHaveLength(1);
    // …but appending an OLDER entry (like the first) still records a new copy
    appendInputHistory('first', cwd);
    expect(readInputHistory(cwd)[0]).toBe('first');
  });
});
