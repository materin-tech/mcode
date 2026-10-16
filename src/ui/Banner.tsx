/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import React from 'react';
import { Box, Text } from 'ink';

export function Banner(props: {
  version: string;
  cwd: string;
  model: string;
  mode: string;
  warning?: string | null;
  hint: string;
}): React.ReactElement {
  return (
    <Box flexDirection="column" paddingX={1} paddingBottom={1}>
      <Text bold color="cyan">
        ▛▀▘ MCode {props.version}
      </Text>
      <Text dimColor>
        {props.cwd} · {props.model || 'no model'} · {props.mode}
      </Text>
      {props.warning ? <Text color="yellow">⚠ {props.warning}</Text> : null}
      <Text dimColor>{props.hint}</Text>
    </Box>
  );
}
