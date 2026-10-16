/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import React from 'react';
import { Box, Text } from 'ink';

export function ModelPicker(props: {
  models: string[];
  selectedIndex: number;
}): React.ReactElement | null {
  if (props.models.length === 0) return null;
  return (
    <Box flexDirection="column" paddingX={1} borderStyle="round" borderColor="magenta">
      <Text dimColor>select model (↑↓ select, enter confirm, esc cancel)</Text>
      {props.models.map((model, i) => (
        <Text key={model} color={i === props.selectedIndex ? 'magenta' : undefined}>
          {i === props.selectedIndex ? '› ' : '  '}
          {model}
        </Text>
      ))}
    </Box>
  );
}
