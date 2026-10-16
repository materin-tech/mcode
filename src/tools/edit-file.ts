/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { readFile, writeFile } from 'node:fs/promises';
import { guardPath } from './guard.js';
import type { ToolDefinition, ToolResult } from './types.js';

export const editFileTool: ToolDefinition = {
  name: 'edit_file',
  description: 'Replace an exact string in a file. The old_string must appear exactly once.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to the workspace.' },
      old_string: { type: 'string', description: 'Exact text to replace.' },
      new_string: { type: 'string', description: 'Replacement text.' },
    },
    required: ['path', 'old_string', 'new_string'],
  },
  async execute(input, ctx): Promise<ToolResult> {
    const abs = guardPath(String(input['path']), ctx.cwd);
    if (!abs) return { success: false, output: 'error: path escapes the workspace' };
    const oldString = String(input['old_string']);
    const newString = String(input['new_string']);
    if (oldString === newString) {
      return { success: false, output: 'error: old_string and new_string are identical' };
    }
    try {
      const content = await readFile(abs, 'utf8');
      const occurrences = content.split(oldString).length - 1;
      if (occurrences === 0) return { success: false, output: 'error: old_string not found in file' };
      if (occurrences > 1) {
        return { success: false, output: `error: old_string appears ${occurrences} times; provide a longer unique string` };
      }
      const updated = content.replace(oldString, () => newString);
      await writeFile(abs, updated, 'utf8');
      return { success: true, output: `ok: edited ${abs}` };
    } catch (err) {
      return { success: false, output: `error: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
};
