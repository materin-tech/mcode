/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTaskTool, BUILTIN_AGENTS } from './subagent.js';
import type { ToolDefinition, ToolResult } from '../tools/types.js';
import { HistoryStore } from './history.js';

function sseResponse(chunks: string[]): Response {
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(`data: ${chunk}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

const FINAL_REPORT = [
  '{"type":"response.output_text.delta","delta":"findings: 2 issues"}',
  '{"type":"response.completed","response":{"usage":{"input_tokens":5,"output_tokens":5}}}',
];

function makeReaderTool(): ToolDefinition {
  return {
    name: 'read_file',
    description: 'read',
    isReadOnly: true,
    parameters: { type: 'object', properties: { path: { type: 'string', description: 'p' } }, required: ['path'] },
    execute: async (): Promise<ToolResult> => ({ success: true, output: 'content' }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('task tool (subagent integration)', () => {
  const deps = {
    agents: BUILTIN_AGENTS,
    model: () => 'test-model',
    baseURL: () => 'https://api.test/v1',
    apiKey: () => 'sk-test',
    language: 'en_US' as const,
    tools: new Map<string, ToolDefinition>([['read_file', makeReaderTool()]]),
    permission: { check: async (): Promise<'allow'> => 'allow' },
    usageTracker: { add: (): never[] => [], snapshot: (): never[] => [] },
    cwd: '/tmp/ws',
    getMode: (): 'passon' => 'passon',
  };

  it('dispatches code-explorer and returns its final report', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(FINAL_REPORT)));
    const tool = createTaskTool(deps);
    const result = await tool.execute({ subagent_type: 'code-explorer', prompt: 'find bugs' }, { cwd: '/tmp/ws', mode: 'passon' });
    expect(result.success).toBe(true);
    expect(result.output).toContain('[code-explorer report]');
    expect(result.output).toContain('findings: 2 issues');
  });

  it('rejects unknown agent name with known list', async () => {
    const tool = createTaskTool(deps);
    const result = await tool.execute({ subagent_type: 'nope', prompt: 'x' }, { cwd: '/tmp/ws', mode: 'passon' });
    expect(result.success).toBe(false);
    expect(result.output).toContain('unknown agent');
    expect(result.output).toContain('code-explorer');
  });

  it('code-explorer subagent only gets read-only tools (no task recursion)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(FINAL_REPORT)));
    const toolsWithTask = new Map<string, ToolDefinition>([
      ['read_file', makeReaderTool()],
      ['task', createTaskTool(deps)],
    ]);
    let seenTools: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: { body: string }) => {
      seenTools = (JSON.parse(init!.body) as { tools: Array<{ name: string }> }).tools.map((t) => t.name);
      return sseResponse(FINAL_REPORT);
    }));
    const tool = createTaskTool({ ...deps, tools: toolsWithTask });
    await tool.execute({ subagent_type: 'code-explorer', prompt: 'x' }, { cwd: '/tmp/ws', mode: 'passon' });
    expect(seenTools).toEqual(['read_file']);
  });

  it('general-purpose inherits all tools except task', async () => {
    let seenTools: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: { body: string }) => {
      seenTools = (JSON.parse(init!.body) as { tools: Array<{ name: string }> }).tools.map((t) => t.name);
      return sseResponse(FINAL_REPORT);
    }));
    const toolsWithTask = new Map<string, ToolDefinition>([
      ['read_file', makeReaderTool()],
      ['task', createTaskTool(deps)],
    ]);
    const tool = createTaskTool({ ...deps, tools: toolsWithTask });
    await tool.execute({ subagent_type: 'general-purpose', prompt: 'x' }, { cwd: '/tmp/ws', mode: 'passon' });
    expect(seenTools).toContain('read_file');
    expect(seenTools).not.toContain('task');
  });

  it('forwards reasoning with agent scope and usage to deps.onEvent', async () => {
    const forwarded: Array<{ type: string; scope?: string; text?: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async () => {
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode('data: {"type":"response.reasoning_text.delta","delta":"thinking..."}\n\n'));
          c.enqueue(new TextEncoder().encode('data: {"type":"response.output_text.delta","delta":"report"}\n\n'));
          c.enqueue(new TextEncoder().encode('data: {"type":"response.completed","response":{"usage":{"input_tokens":7,"output_tokens":3}}}\n\n'));
          c.close();
        },
      });
      return new Response(stream, { status: 200 });
    }));
    const tool = createTaskTool({
      ...deps,
      onEvent: (event) => forwarded.push(event as { type: string; scope?: string }),
    });
    await tool.execute({ subagent_type: 'code-explorer', prompt: 'x' }, { cwd: '/tmp/ws', mode: 'passon' });
    const reasoning = forwarded.find((e) => e.type === 'reasoning_delta');
    const usage = forwarded.find((e) => e.type === 'usage');
    expect(reasoning?.scope).toBe('code-explorer');
    expect(reasoning?.text).toBe('thinking...');
    expect((usage as { usage?: { inputTokens: number } }).usage?.inputTokens).toBe(7);
  });
});
