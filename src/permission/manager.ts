/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import type { Mode } from '../config/constants.js';
import type { PermissionDecision, PermissionManager, ToolContext, ToolDefinition } from '../tools/types.js';

export type ConfirmHandler = (tool: ToolDefinition, ctx: ToolContext) => Promise<PermissionDecision>;

/**
 * Mode-driven gate. passon auto-allows; plan allows read-only only;
 * manual/auto ask the user via the injected confirm handler.
 */
export function createPermissionManager(
  getMode: () => Mode,
  onConfirm: ConfirmHandler,
): PermissionManager {
  return {
    async check(tool, ctx): Promise<PermissionDecision> {
      const mode = getMode();
      if (mode === 'passon') return 'allow';
      if (mode === 'plan') {
        return tool.isReadOnly === true ? 'allow' : 'deny';
      }
      if (mode === 'auto' && tool.isReadOnly === true) return 'allow';
      return onConfirm(tool, ctx);
    },
  };
}
