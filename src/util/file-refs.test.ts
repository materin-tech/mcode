/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expandFileRefs, FILE_REF_PATTERN } from './file-refs.js';

const TMP = mkdtempSync(join(tmpdir(), 'mcode-filerefs-'));
const cwd = join(TMP, 'ws');

beforeEach(() => {
  mkdirSync(join(cwd, 'src'), { recursive: true });
  writeFileSync(join(cwd, 'src', 'a.ts'), 'export const A = 1;\n');
  writeFileSync(join(cwd, 'src', 'big.txt'), 'x'.repeat(100));
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('expandFileRefs', () => {
  it('returns input unchanged without @refs', async () => {
    const r = await expandFileRefs('plain question', cwd);
    expect(r.text).toBe('plain question');
    expect(r.injected).toEqual([]);
    expect(r.missing).toEqual([]);
  });

  it('injects file content for a valid @ref', async () => {
    const r = await expandFileRefs('explain @src/a.ts please', cwd);
    expect(r.injected).toEqual(['src/a.ts']);
    expect(r.text).toContain('--- file: src/a.ts ---');
    expect(r.text).toContain('export const A = 1;');
  });

  it('reports missing files without dropping the question', async () => {
    const r = await expandFileRefs('explain @src/nope.ts please', cwd);
    expect(r.missing).toEqual(['src/nope.ts']);
    expect(r.injected).toEqual([]);
    expect(r.text).toContain('explain @src/nope.ts please');
  });

  it('blocks path escape via guardPath', async () => {
    const r = await expandFileRefs('read @../outside.ts', cwd);
    expect(r.missing).toEqual(['../outside.ts']);
  });

  it('expands duplicate refs once', async () => {
    const r = await expandFileRefs('@src/a.ts and @src/a.ts', cwd);
    expect(r.injected).toEqual(['src/a.ts']);
    expect(r.text.match(/--- file:/g)).toHaveLength(1);
  });

  it('attaches image files as data-url attachments (multimodal)', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    writeFileSync(join(cwd, 'shot.png'), png);
    const r = await expandFileRefs('look at @shot.png', cwd);
    expect(r.attachments).toHaveLength(1);
    expect(r.attachments[0]!.dataUrl).toContain('data:image/png;base64,');
    expect(r.injected).toEqual(['shot.png']);
    expect(r.text).toContain('look at @shot.png');
  });

  it('skips non-image binary files by extension without polluting context', async () => {
    writeFileSync(join(cwd, 'archive.zip'), 'binary-ish');
    const r = await expandFileRefs('look at @archive.zip', cwd);
    expect(r.injected).toEqual([]);
    expect(r.missing[0]).toContain('binary file');
    expect(r.text).not.toContain('binary-ish');
  });

  it('skips files with binary content even without a known extension', async () => {
    writeFileSync(join(cwd, 'mystery.dat'), 'ok\u0000\u0001\u0002 tons of nulls');
    const r = await expandFileRefs('read @mystery.dat', cwd);
    expect(r.injected).toEqual([]);
    expect(r.missing[0]).toContain('binary content detected');
  });

  it('FILE_REF_PATTERN does not match trailing punctuation', () => {
    const m = 'look at @src/a.ts.'.match(FILE_REF_PATTERN);
    expect(m).not.toBeNull();
    expect(m?.[0]).toBe('@src/a.ts');
  });
});
