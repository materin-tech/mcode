/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { CompletionItem } from './useCompletion.js';

/**
 * Pure render of the completion state: caller passes already-filtered items
 * and the selected index. No internal state — deterministic and testable.
 */
export function CompletionPanel(props: {
  title: string;
  items: CompletionItem[];
  selectedIndex: number;
  maxVisible?: number;
}): React.ReactElement | null {
  if (props.items.length === 0) return null;
  const max = props.maxVisible ?? 8;
  const selected = Math.min(props.selectedIndex, props.items.length - 1);
  // keep the selection inside a sliding window
  const start = Math.max(0, Math.min(selected - max + 1, props.items.length - max));
  const windowed = props.items.slice(start, start + max);
  return (
    <Box flexDirection="column" paddingX={1} borderStyle="round" borderColor="gray">
      <Text dimColor>{props.title}</Text>
      {windowed.map((item, i) => {
        const index = start + i;
        const isSelected = index === selected;
        return (
          <Text key={item.insertValue} color={isSelected ? 'cyan' : undefined}>
            {isSelected ? '› ' : '  '}
            {item.label}
            {item.description ? <Text dimColor> — {item.description}</Text> : null}
          </Text>
        );
      })}
    </Box>
  );
}
