/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { ChatItem } from './types.js';

function MessageBlock({ item }: { item: ChatItem }): React.ReactElement {
  switch (item.kind) {
    case 'user':
      return (
        <Box paddingX={1}>
          <Text color="green">&gt; </Text>
          <Text>{item.text}</Text>
        </Box>
      );
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

export function MessageList({ items }: { items: ChatItem[] }): React.ReactElement {
  return (
    <Box flexDirection="column" flexGrow={1}>
      {items.map((item, index) => (
        <MessageBlock key={index} item={item} />
      ))}
    </Box>
  );
}
