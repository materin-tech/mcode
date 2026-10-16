/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { MAX_TOOL_OUTPUT_CHARS } from '../config/constants.js';

/**
 * Constrain a user/model-supplied path to the workspace. Returns an absolute
 * path inside `cwd`, or null when the path escapes it.
 */
export function guardPath(rawPath: string, cwd: string): string | null {
  if (typeof rawPath !== 'string' || rawPath.length === 0) return null;
  const expanded = rawPath.startsWith('~')
    ? join(process.env['HOME'] ?? cwd, rawPath.slice(1))
    : rawPath;
  const abs = isAbsolute(expanded) ? resolve(expanded) : resolve(cwd, expanded);
  const normalizedCwd = resolve(cwd);
  if (abs !== normalizedCwd && !abs.startsWith(normalizedCwd + sep)) return null;
  return abs;
}

export function clampOutput(text: string, limit = MAX_TOOL_OUTPUT_CHARS): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n…[truncated ${text.length - limit} chars]`;
}
