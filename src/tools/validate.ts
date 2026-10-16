/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import type { ToolDefinition } from './types.js';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/** Lightweight JSON-schema check for the subset used by tool definitions. */
export function validateInput(
  tool: ToolDefinition,
  input: Record<string, unknown>,
): ValidationResult {
  const schema = tool.parameters;
  const required = schema.required ?? [];
  for (const key of required) {
    if (input[key] === undefined) {
      return { valid: false, error: `${tool.name}: missing required parameter '${key}'` };
    }
  }
  for (const [key, value] of Object.entries(input)) {
    const prop = schema.properties[key];
    if (!prop) {
      return { valid: false, error: `${tool.name}: unknown parameter '${key}'` };
    }
    const actual = Array.isArray(value) ? 'array' : typeof value;
    if (actual !== prop.type) {
      return {
        valid: false,
        error: `${tool.name}: parameter '${key}' should be ${prop.type}, got ${actual}`,
      };
    }
  }
  return { valid: true };
}
