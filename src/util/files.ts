/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { CompletionItem } from '../ui/useCompletion.js';

const IGNORED = new Set(['node_modules', '.git', 'dist', '.DS_Store']);
const MAX_ENTRIES = 200;

/** List workspace files/dirs (top 2 levels) for the '@' completion panel. */
export async function listWorkspaceFiles(cwd: string): Promise<CompletionItem[]> {
  const out: CompletionItem[] = [];
  await walk(cwd, cwd, 0, out);
  return out;
}

async function walk(root: string, dir: string, depth: number, out: CompletionItem[]): Promise<void> {
  if (depth > 2 || out.length >= MAX_ENTRIES) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (IGNORED.has(entry.name) || out.length >= MAX_ENTRIES) continue;
    const rel = relative(root, join(dir, entry.name));
    out.push({ insertValue: rel, label: rel });
    if (entry.isDirectory()) {
      await walk(root, join(dir, entry.name), depth + 1, out);
    }
  }
}
