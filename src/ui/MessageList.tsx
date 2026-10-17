/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import React from 'react';
import { Box, Static, Text } from 'ink';
import type { ChatItem } from './types.js';

const REASONING_COLLAPSED_LINES = 5;

function ReasoningBlock({ text, expanded, label }: { text: string; expanded: boolean; label?: string }): React.ReactElement {
  const lines = text.split('\n').filter((l, i, arr) => l.trim().length > 0 || i < arr.length - 1);
  const total = lines.length;
  if (expanded) {
    const shown = lines.slice(-2000); // render safety cap
    return (
      <Box paddingX={1} flexDirection="column">
        <Text dimColor>✻ Thinking{label ? ` (${label})` : ''} ({total} lines · ctrl+o collapse)</Text>
        {shown.map((line, i) => (
          <Text dimColor key={i}>  {line}</Text>
        ))}
      </Box>
    );
  }
  const tailStart = Math.max(0, total - REASONING_COLLAPSED_LINES);
  const tail = lines.slice(tailStart);
  const hidden = tailStart;
  return (
    <Box paddingX={1} flexDirection="column">
      <Text dimColor>
        ✻ Thinking{label ? ` (${label})` : ''}…{hidden > 0 ? ` (+${hidden} lines` : ''}{hidden > 0 ? ' · ' : ' ('}ctrl+o expand)
      </Text>
      {tail.map((line, i) => (
        <Text dimColor key={i}>  {line}</Text>
      ))}
    </Box>
  );
}

function MessageBlock({ item, reasoningExpanded }: { item: ChatItem; reasoningExpanded: boolean }): React.ReactElement {
  switch (item.kind) {
    case 'user':
      return (
        <Box paddingX={1}>
          <Text color="green">&gt; </Text>
          <Text>{item.text}</Text>
        </Box>
      );
    case 'reasoning':
      return <ReasoningBlock text={item.text} expanded={reasoningExpanded} label={item.label} />;
    case 'thought':
      return (
        <Box paddingX={1}>
          <Text dimColor>Thought for {item.seconds}s</Text>
        </Box>
      );
    case 'activity':
      return (
        <Box paddingX={1}>
          <Text dimColor>{item.text.charAt(0).toUpperCase() + item.text.slice(1)}</Text>
        </Box>
      );
    case 'assistant':
      return (
        <Box paddingX={1}>
          <Text color="cyan">● </Text>
          <Text>{item.text}</Text>
        </Box>
      );
    case 'system':
      return (
        <Box paddingX={1}>
          <Text dimColor>{item.text}</Text>
        </Box>
      );
    case 'tool':
      return (
        <Box paddingX={1}>
          <Text color={item.ok ? 'yellow' : 'red'}>
            ⚙ {item.name} {item.ok ? '✓' : '✗'}
          </Text>
          {item.detail.length > 0 ? <Text dimColor> {item.detail.slice(0, 200)}</Text> : null}
        </Box>
      );
    case 'footer':
      return (
        <Box paddingX={1} paddingBottom={1}>
          <Text dimColor>* {item.text}</Text>
        </Box>
      );
  }
}

/**
 * Flicker fix (CC architecture): sealed transcript renders through <Static>
 * — ink paints those lines once and never rewrites them. Only the current
 * turn's items (reasoning/assistant/tool streams) re-render per frame, so
 * frame diffs stay small and the screen stops flashing.
 */
export function MessageList({ items, reasoningExpanded }: { items: ChatItem[]; reasoningExpanded: boolean }): React.ReactElement {
  let lastUserIdx = -1;
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i]!.kind === 'user') {
      lastUserIdx = i;
      break;
    }
  }
  const sealed = items.slice(0, lastUserIdx + 1);
  const live = items.slice(lastUserIdx + 1);
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Static items={sealed}>
        {(item, index) => <MessageBlock key={`s-${index}`} item={item} reasoningExpanded={false} />}
      </Static>
      {live.map((item, index) => (
        <MessageBlock key={`l-${index}`} item={item} reasoningExpanded={reasoningExpanded} />
      ))}
    </Box>
  );
}
