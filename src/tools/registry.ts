/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import type { ToolDefinition } from './types.js';
import { readFileTool } from './read-file.js';
import { writeFileTool } from './write-file.js';
import { editFileTool } from './edit-file.js';
import { bashTool } from './bash.js';
import { globTool } from './glob.js';
import { grepTool } from './grep.js';
import { webFetchTool } from './web-fetch.js';
import { webSearchTool } from './web-search.js';

function registerAll(tools: ToolDefinition[]): Map<string, ToolDefinition> {
  const registry = new Map<string, ToolDefinition>();
  for (const tool of tools) {
    if (registry.has(tool.name)) {
      throw new Error(`duplicate tool name: ${tool.name}`);
    }
    registry.set(tool.name, tool);
  }
  return registry;
}

/** Built-in tools, in registration order. Plugin tools merge in later. */
export function createRegistry(extra: ToolDefinition[] = []): Map<string, ToolDefinition> {
  return registerAll([
    readFileTool,
    writeFileTool,
    editFileTool,
    bashTool,
    globTool,
    grepTool,
    webFetchTool,
    webSearchTool,
    ...extra,
  ]);
}

export function toToolSpecs(registry: Map<string, ToolDefinition>) {
  return [...registry.values()].map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}
