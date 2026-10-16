/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import type { Mode } from '../config/constants.js';

export interface ToolContext {
  cwd: string;
  mode: Mode;
  signal?: AbortSignal;
}

export interface ToolResult {
  success: boolean;
  /** Text returned to the model. */
  output: string;
  /** Optional richer block for the TUI (e.g. diff preview). */
  display?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
  isReadOnly?: boolean;
  execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

export type PermissionDecision = 'allow' | 'deny';

export interface PermissionManager {
  /** Resolve whether a tool call may run in the current mode. */
  check(tool: ToolDefinition, ctx: ToolContext): Promise<PermissionDecision>;
}
