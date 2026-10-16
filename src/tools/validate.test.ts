/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expect } from 'vitest';
import { validateInput } from './validate.js';
import type { ToolDefinition } from './types.js';

const tool: ToolDefinition = {
  name: 'fake',
  description: 'fake tool',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'p' },
      limit: { type: 'number', description: 'n' },
    },
    required: ['path'],
  },
  execute: async () => ({ success: true, output: '' }),
};

describe('validateInput', () => {
  it('accepts valid input', () => {
    expect(validateInput(tool, { path: 'a.txt' }).valid).toBe(true);
  });

  it('rejects missing required param', () => {
    const result = validateInput(tool, {});
    expect(result.valid).toBe(false);
    expect(result.error).toContain('path');
  });

  it('rejects wrong type', () => {
    const result = validateInput(tool, { path: 'a', limit: 'many' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('should be number');
  });

  it('rejects unknown param', () => {
    expect(validateInput(tool, { path: 'a', nope: 1 }).valid).toBe(false);
  });
});
