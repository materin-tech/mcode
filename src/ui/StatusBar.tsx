/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import React from 'react';
import { Box, Text } from 'ink';

export function StatusBar(props: {
  thinking: boolean;
  runningCommand: string | null;
  thinkingLabel: string;
}): React.ReactElement | null {
  if (!props.thinking && !props.runningCommand) return null;
  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Text color="gray">{props.thinking ? props.thinkingLabel : ''}</Text>
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
