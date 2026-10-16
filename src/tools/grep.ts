/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { guardPath, clampOutput } from './guard.js';
import type { ToolDefinition, ToolResult } from './types.js';

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist']);
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_MATCHES = 200;

export const grepTool: ToolDefinition = {
  name: 'grep',
  description: 'Search file contents in the workspace with a regular expression.',
  isReadOnly: true,
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'JavaScript regular expression.' },
      include: { type: 'string', description: 'Optional file-name glob filter, e.g. *.ts' },
    },
    required: ['pattern'],
  },
  async execute(input, ctx): Promise<ToolResult> {
    let regex: RegExp;
    try {
      regex = new RegExp(String(input['pattern']));
    } catch (err) {
      return { success: false, output: `error: invalid regex: ${err instanceof Error ? err.message : String(err)}` };
    }
    const includeGlob = typeof input['include'] === 'string' ? globToFilter(String(input['include'])) : null;
    const root = guardPath('.', ctx.cwd);
    if (!root) return { success: false, output: 'error: bad workspace' };
    const matches: string[] = [];
    await walk(ctx.cwd, root, regex, includeGlob, matches);
    if (matches.length === 0) return { success: true, output: '(no matches)' };
    return { success: true, output: clampOutput(matches.join('\n')) };
  },
};

function globToFilter(glob: string): (name: string) => boolean {
  const re = new RegExp(
    `^${glob.replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === '*' ? '[^/]*' : `\\${c}`))}$`,
  );
  return (name) => re.test(name);
}

async function walk(
  cwd: string,
  dir: string,
  regex: RegExp,
  include: ((name: string) => boolean) | null,
  out: string[],
): Promise<void> {
  if (out.length >= MAX_MATCHES) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= MAX_MATCHES) return;
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(cwd, full, regex, include, out);
      continue;
    }
    if (include && !include(entry.name)) continue;
    try {
      const info = await stat(full);
      if (info.size > MAX_FILE_BYTES) continue;
      const content = await readFile(full, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i]!)) {
          out.push(`${relative(cwd, full)}:${i + 1}: ${lines[i]!.trim().slice(0, 200)}`);
          if (out.length >= MAX_MATCHES) return;
        }
      }
    } catch {
      // unreadable file (binary, permissions) — skip silently
    }
  }
}
