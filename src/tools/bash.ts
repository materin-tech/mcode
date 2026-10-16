/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { exec } from 'node:child_process';
import { BASH_TIMEOUT_MS } from '../config/constants.js';
import { clampOutput } from './guard.js';
import type { ToolDefinition, ToolResult } from './types.js';

export const bashTool: ToolDefinition = {
  name: 'bash',
  description: 'Run a shell command inside the workspace and return stdout+stderr.',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to run.' },
      timeout_ms: { type: 'number', description: 'Optional timeout in milliseconds.' },
    },
    required: ['command'],
  },
  async execute(input, ctx): Promise<ToolResult> {
    const command = String(input['command']);
    const timeout =
      typeof input['timeout_ms'] === 'number' && input['timeout_ms'] > 0
        ? Math.min(input['timeout_ms'], BASH_TIMEOUT_MS)
        : BASH_TIMEOUT_MS;
    return new Promise<ToolResult>((resolve) => {
      exec(
        command,
        { cwd: ctx.cwd, timeout, maxBuffer: 10 * 1024 * 1024, signal: ctx.signal },
        (error, stdout, stderr) => {
          const parts: string[] = [];
          if (stdout) parts.push(String(stdout));
          if (stderr) parts.push(`[stderr] ${String(stderr)}`);
          if (error) {
            if (error.killed) {
              parts.push(`[timeout after ${timeout}ms]`);
            } else if (typeof error.code === 'number') {
              parts.push(`[exit ${error.code}]`);
            } else if (!stdout && !stderr) {
              parts.push(`error: ${error.message}`);
            }
          }
          resolve({ success: !error, output: clampOutput(parts.join('\n')) || '(no output)' });
        },
      );
    });
  },
};
