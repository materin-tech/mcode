/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import type { ToolResult } from '../tools/types.js';

export type ChatItem =
  | { kind: 'user'; text: string }
  | { kind: 'thought'; seconds: number }
  | { kind: 'activity'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'system'; text: string }
  | { kind: 'tool'; name: string; detail: string; ok: boolean }
  | { kind: 'footer'; text: string };
