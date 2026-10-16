/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { readFile } from 'node:fs/promises';
import { guardPath } from '../tools/guard.js';
import { MAX_AT_FILE_CHARS } from '../config/constants.js';

/**
 * Matches '@path' refs. The path must end on a word char so trailing
 * sentence punctuation ('@src/a.ts.') is not swallowed into the path.
 */
export const FILE_REF_PATTERN = /@([\w\-./]*[\w\-])/g;

export interface FileRefResult {
  /** Input with @path references expanded to annotated content blocks. */
  text: string;
  /** Paths that were successfully injected. */
  injected: string[];
  /** @refs that looked like paths but could not be resolved. */
  missing: string[];
}

/**
 * Expand '@path' references in user input into annotated file-content
 * blocks for the model. The original @mention is kept as a header so the
 * transcript stays readable. Missing files are reported, not silently dropped.
 */
export async function expandFileRefs(input: string, cwd: string): Promise<FileRefResult> {
  const refs = new Set<string>();
  for (const match of input.matchAll(FILE_REF_PATTERN)) {
    refs.add(match[1]!);
  }
  if (refs.size === 0) return { text: input, injected: [], missing: [] };

  const injected: string[] = [];
  const missing: string[] = [];
  const blocks: string[] = [];
  for (const ref of refs) {
    const abs = guardPath(ref, cwd);
    if (!abs) {
      missing.push(ref);
      continue;
    }
    try {
      const content = await readFile(abs, 'utf8');
      injected.push(ref);
      blocks.push(
        `--- file: ${ref} ---\n${content.slice(0, MAX_AT_FILE_CHARS)}${content.length > MAX_AT_FILE_CHARS ? '\n…[truncated]' : ''}\n--- end of ${ref} ---`,
      );
    } catch {
      missing.push(ref);
    }
  }

  if (blocks.length === 0) return { text: input, injected, missing };
  const text = `${input}\n\n${blocks.join('\n\n')}`;
  return { text, injected, missing };
}
