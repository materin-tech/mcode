#!/usr/bin/env node
/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */
import('./dist/cli.js').catch((err) => {
  console.error('mcode failed to start:', err?.message ?? err);
  process.exit(1);
});
