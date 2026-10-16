/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import React from 'react';
import { Box, Text } from 'ink';

export function PermissionPrompt(props: {
  toolName: string;
  onDecide: (allow: boolean) => void;
}): React.ReactElement {
  return (
    <Box paddingX={1} borderStyle="round" borderColor="yellow">
      <Text color="yellow">
        ⚠ permission: run tool `{props.toolName}`? (y = allow / n = deny)
      </Text>
    </Box>
  );
}
