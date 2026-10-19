/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { CompletionItem } from '../ui/useCompletion.js';

const IGNORED = new Set(['node_modules', '.git', 'dist', 'target', '.DS_Store', '__pycache__']);
const MAX_DEPTH = 8;
const MAX_ENTRIES = 200;

/**
 * List workspace files/dirs for the '@' completion panel. Bounded recursion
 * (depth 8, 200 entries), directories carry a trailing '/' — the panel shows
 * one level at a time (Claude Code style) and descends on directory select.
 */
export async function listWorkspaceFiles(cwd: string): Promise<CompletionItem[]> {
  const out: CompletionItem[] = [];
  await walk(cwd, '', 0, out);
  return out;
}

async function walk(
  root: string,
  prefix: string,
  depth: number,
  out: CompletionItem[],
): Promise<void> {
  if (depth >= MAX_DEPTH || out.length >= MAX_ENTRIES) return;
  let entries;
  try {
    entries = await readdir(join(root, prefix), { withFileTypes: true });
  } catch {
    return;
  }
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of sorted) {
    if (IGNORED.has(entry.name) || out.length >= MAX_ENTRIES) continue;
    const rel = `${prefix}${entry.name}${entry.isDirectory() ? '/' : ''}`;
    out.push({ insertValue: rel, label: rel });
    if (entry.isDirectory()) {
      await walk(root, `${prefix}${entry.name}/`, depth + 1, out);
    }
  }
}
