/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';

const VERBS = ['Brewing', 'Simmering', 'Caramelizing', 'Marinating', 'Cooking', 'Perfuming'];

/**
 * Claude Code style live status line: `· Caramelizing… (19s · thinking)`.
 * Ticks every second while active; verb cycles every 4s.
 */
export function StatusBar(props: {
  active: boolean;
  startedAt: number;
  phase: 'thinking' | 'writing';
  tokensUsed?: number;
  runningCommand: string | null;
}): React.ReactElement | null {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!props.active) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [props.active]);
  if (!props.active && !props.runningCommand) return null;
  const secs = props.active ? Math.max(0, Math.floor((Date.now() - props.startedAt) / 1000)) : 0;
  const verb = VERBS[Math.floor(secs / 4) % VERBS.length]!;
  const tokens = props.tokensUsed ?? 0;
  const tokenPart = tokens > 0 ? ` · ${tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : tokens} tokens` : '';
  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Text dimColor>{props.active ? `· ${verb}… (${secs}s · ${props.phase}${tokenPart})` : ''}</Text>
      {props.runningCommand ? <Text color="magenta">{props.runningCommand}</Text> : null}
    </Box>
  );
}

export function ModeHint(props: { mode: string; label: string; danger?: boolean }): React.ReactElement {
  return (
    <Box paddingX={1}>
      <Text color={props.danger ? 'red' : 'gray'}>
        {props.label}: {props.mode} (shift+tab)
      </Text>
    </Box>
  );
}
