/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import type { ChatMessage } from '../api/client.js';
import { CHARS_PER_TOKEN, COMPACT_THRESHOLD_TOKENS } from '../config/constants.js';

/** Rough token estimate; good enough for a compaction trigger. */
export function estimateTokens(messages: ChatMessage[], extraChars = 0): number {
  const chars = messages.reduce((sum, m) => sum + m.content.length, 0) + extraChars;
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

export interface CompactionPlan {
  shouldCompact: boolean;
  keepTurns: number;
}

export function planCompaction(
  messages: ChatMessage[],
  threshold = COMPACT_THRESHOLD_TOKENS,
): CompactionPlan {
  const tokens = estimateTokens(messages);
  if (tokens < threshold) return { shouldCompact: false, keepTurns: 0 };
  // Keep the recent half of turns (rounded to whole user/assistant pairs).
  const keepTurns = Math.max(2, Math.floor(messages.length / 4));
  return { shouldCompact: true, keepTurns };
}
