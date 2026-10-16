/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { guardPath, clampOutput } from './guard.js';
import type { ToolDefinition, ToolResult } from './types.js';

export const writeFileTool: ToolDefinition = {
  name: 'write_file',
  description: 'Create or overwrite a file inside the workspace with the given content.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to the workspace.' },
      content: { type: 'string', description: 'Full file content to write.' },
    },
    required: ['path', 'content'],
  },
  async execute(input, ctx): Promise<ToolResult> {
    const abs = guardPath(String(input['path']), ctx.cwd);
    if (!abs) return { success: false, output: 'error: path escapes the workspace' };
    const content = String(input['content']);
    try {
      let before: string | null = null;
      try {
        before = await readFile(abs, 'utf8');
      } catch {
        before = null;
      }
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, content, 'utf8');
      const changed = before === null ? 'created' : 'updated';
      return {
        success: true,
        output: clampOutput(`ok: ${changed} ${abs} (${content.length} chars)`),
        display: changed === 'updated' && before !== null ? diffPreview(before, content) : undefined,
      };
    } catch (err) {
      return { success: false, output: `error: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
};

function diffPreview(before: string, after: string): string {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  const lines: string[] = [];
  for (const line of beforeLines) {
    if (!afterLines.includes(line)) lines.push(`- ${line}`);
  }
  for (const line of afterLines) {
    if (!beforeLines.includes(line)) lines.push(`+ ${line}`);
  }
  return clampOutput(lines.slice(0, 80).join('\n'), 4000);
}
