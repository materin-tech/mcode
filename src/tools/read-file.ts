/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { readFile } from 'node:fs/promises';
import { guardPath, clampOutput } from './guard.js';
import type { ToolDefinition, ToolContext, ToolResult } from './types.js';

export const readFileTool: ToolDefinition = {
  name: 'read_file',
  description: 'Read a text file inside the workspace and return its content.',
  isReadOnly: true,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to the workspace (absolute paths must stay inside it).' },
      offset: { type: 'number', description: 'Optional 1-based start line.' },
      limit: { type: 'number', description: 'Optional max number of lines to read.' },
    },
    required: ['path'],
  },
  async execute(input, ctx: ToolContext): Promise<ToolResult> {
    const abs = guardPath(String(input['path']), ctx.cwd);
    if (!abs) {
      return { success: false, output: 'error: path escapes the workspace' };
    }
    try {
      const content = await readFile(abs, 'utf8');
      let text = content;
      const offset = typeof input['offset'] === 'number' ? Math.max(0, input['offset'] - 1) : 0;
      const limit = typeof input['limit'] === 'number' ? input['limit'] : undefined;
      if (offset > 0 || limit !== undefined) {
        text = content.split('\n').slice(offset, limit !== undefined ? offset + limit : undefined).join('\n');
      }
      return { success: true, output: clampOutput(text) || '(empty file)' };
    } catch (err) {
      return { success: false, output: `error: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
};
