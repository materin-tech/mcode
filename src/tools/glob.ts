/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { guardPath, clampOutput } from './guard.js';
import type { ToolDefinition, ToolResult } from './types.js';

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', '.DS_Store']);

/** Convert a simple glob (`*`, `**`, `?`) into a RegExp. */
export function globToRegExp(pattern: string): RegExp {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        re += '.*';
        i++;
        if (pattern[i + 1] === '/') i++; // `**/` also matches zero dirs
      } else {
        re += `[^${sep === '\\' ? '\\\\' : '/'}]*`;
      }
    } else if (c === '?') {
      re += '.';
    } else if ('\\^$.|+()[]{}'.includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}

export const globTool: ToolDefinition = {
  name: 'glob',
  description: 'Find files in the workspace by glob pattern (e.g. src/**/*.ts).',
  isReadOnly: true,
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern relative to the workspace.' },
    },
    required: ['pattern'],
  },
  async execute(input, ctx): Promise<ToolResult> {
    const pattern = String(input['pattern']);
    const baseDir = guardPath(pattern.includes('/') ? pattern.slice(0, pattern.lastIndexOf('/')) : '.', ctx.cwd);
    if (!baseDir) return { success: false, output: 'error: path escapes the workspace' };
    const basePattern = pattern.includes('/') ? pattern.slice(pattern.lastIndexOf('/') + 1) : pattern;
    const regex = globToRegExp(basePattern);
    const results: string[] = [];
    await walk(baseDir, baseDir, regex, results);
    if (results.length === 0) return { success: true, output: '(no matches)' };
    const rel = results.map((r) => relative(ctx.cwd, r));
    return { success: true, output: clampOutput(rel.join('\n')) };
  },
};

async function walk(root: string, dir: string, regex: RegExp, out: string[]): Promise<void> {
  if (out.length >= 500) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(root, full, regex, out);
    } else if (regex.test(entry.name)) {
      out.push(full);
      if (out.length >= 500) return;
    }
  }
}
