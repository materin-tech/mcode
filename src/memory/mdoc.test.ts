import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findMcodeDocs, buildProjectDocSection, initMcodeDoc, MAX_PROJECT_DOC_CHARS } from './mdoc.js';

const TMP = mkdtempSync(join(tmpdir(), 'mcode-mdoc-'));
let origHome: string | undefined;
let deep: string;

beforeEach(() => {
  origHome = process.env['HOME'];
  process.env['HOME'] = TMP;
  deep = join(TMP, 'a', 'b', 'proj');
  mkdirSync(deep, { recursive: true });
});

afterEach(() => {
  process.env['HOME'] = origHome;
  rmSync(TMP, { recursive: true, force: true });
});

describe('findMcodeDocs walk-up discovery', () => {
  it('collects nearest-first then global', () => {
    writeFileSync(join(deep, 'MCODE.md'), 'nearest');
    writeFileSync(join(TMP, 'a', 'MCODE.md'), 'ancestor');
    mkdirSync(join(TMP, '.mcode'), { recursive: true });
    writeFileSync(join(TMP, '.mcode', 'MCODE.md'), 'global doc');
    const docs = findMcodeDocs(deep);
    expect(docs.map((d) => d.content)).toEqual(['nearest', 'ancestor', 'global doc']);
    expect(docs[0]!.scope).toBe('project');
    expect(docs[2]!.scope).toBe('global');
  });

  it('returns empty when nothing exists', () => {
    expect(findMcodeDocs(deep)).toEqual([]);
  });

  it('skips unreadable files without crashing', () => {
    writeFileSync(join(deep, 'MCODE.md'), 'x');
    const docs = findMcodeDocs(deep);
    expect(docs).toHaveLength(1);
  });
});

describe('buildProjectDocSection', () => {
  it('returns empty string without docs', () => {
    expect(buildProjectDocSection([])).toBe('');
  });

  it('caps total content and marks truncation', () => {
    const docs = [
      { path: '/p1', content: 'x'.repeat(MAX_PROJECT_DOC_CHARS + 100), scope: 'project' as const },
      { path: '/p2', content: 'second', scope: 'project' as const },
    ];
    const section = buildProjectDocSection(docs);
    expect(section).toContain('…[truncated]');
    expect(section).not.toContain('second');
  });

  it('annotates each doc with scope and path', () => {
    const section = buildProjectDocSection([
      { path: '/ws/MCODE.md', content: 'hello', scope: 'project' },
    ]);
    expect(section).toContain('MCODE.md (project): /ws/MCODE.md');
    expect(section).toContain('follow these instructions');
  });
});

describe('initMcodeDoc', () => {
  it('creates template when missing', () => {
    const { path, created } = initMcodeDoc(deep);
    expect(created).toBe(true);
    expect(readFileSync(path, 'utf8')).toContain('# MCODE.md');
  });

  it('never overwrites an existing doc', () => {
    writeFileSync(join(deep, 'MCODE.md'), 'KEEP ME');
    const { created } = initMcodeDoc(deep);
    expect(created).toBe(false);
    expect(readFileSync(join(deep, 'MCODE.md'), 'utf8')).toBe('KEEP ME');
  });
});
