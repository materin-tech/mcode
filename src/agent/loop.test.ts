/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { runAgentTurn, type AgentEvent } from './loop.js';
import type { ToolDefinition, ToolResult, PermissionManager } from '../tools/types.js';
import { HistoryStore } from './history.js';
import type { ModelUsage } from '../util/token-usage.js';

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

const TEXT_ONLY = [
  '{"type":"response.output_text.delta","delta":"Hello"}',
  '{"type":"response.output_text.delta","delta":" world"}',
  '{"type":"response.completed","response":{"usage":{"input_tokens":10,"output_tokens":5,"input_tokens_details":{"cached_tokens":3}}}}',
];

const TOOL_CALL = [
  '{"type":"response.output_item.done","item":{"type":"function_call","call_id":"c1","name":"counter","arguments":"{\\"n\\":1}"}}',
  '{"type":"response.completed","response":{"usage":{"input_tokens":10,"output_tokens":2}}}',
];

const BAD_ARGS = [
  '{"type":"response.output_item.done","item":{"type":"function_call","call_id":"c1","name":"counter","arguments":"{}"}}',
  '{"type":"response.completed","response":{"usage":{"input_tokens":1,"output_tokens":1}}}',
];

function fakeRegistry(tool: ToolDefinition): Map<string, ToolDefinition> {
  return new Map([[tool.name, tool]]);
}

function makeTool(): { tool: ToolDefinition; getCalls: () => number } {
  let calls = 0;
  const tool: ToolDefinition = {
    name: 'counter',
    description: 'counting tool',
    isReadOnly: true,
    parameters: { type: 'object', properties: { n: { type: 'number', description: 'n' } } },
    execute: async (input): Promise<ToolResult> => {
      calls += 1;
      return { success: true, output: `ran ${String(input['n'])}` };
    },
  };
  return { tool, getCalls: () => calls };
}

function makeOptions(overrides: Partial<Parameters<typeof runAgentTurn>[1]> = {}) {
  const { tool } = makeTool();
  const events: AgentEvent[] = [];
  const options = {
    model: 'test-model',
    baseURL: 'https://api.test/v1',
    apiKey: 'sk-test',
    language: 'en_US' as const,
    tools: fakeRegistry(tool),
    permission: {
      check: async (): Promise<'allow'> => 'allow',
    } as PermissionManager,
    history: new HistoryStore(),
    usageTracker: {
      add: (): ModelUsage[] => [],
      snapshot: (): ModelUsage[] => [],
    },
    cwd: '/tmp/ws',
    mode: 'passon' as const,
    onEvent: (event: AgentEvent): void => {
      events.push(event);
    },
    ...overrides,
  };
  return { options, events };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runAgentTurn (integration, mocked SSE)', () => {
  it('streams text-only reply and records usage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(TEXT_ONLY)));
    const { options, events } = makeOptions();
    await runAgentTurn('hi', options);
    const types = events.map((e) => e.type);
    expect(types).toContain('text_delta');
    expect(types).toContain('done');
    const usage = events.find((e) => e.type === 'usage');
    expect(usage).toMatchObject({ usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 3 } });
  });

  it('history records the turn after final reply', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(TEXT_ONLY)));
    const { options } = makeOptions();
    await runAgentTurn('hi', options);
    expect(options.history.all()).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'Hello world' },
    ]);
  });

  it('executes tool call and feeds output back for final answer', async () => {
    let call = 0;
    const responses = [TOOL_CALL, TEXT_ONLY];
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(responses[call++] ?? TEXT_ONLY)));
    const { options, events } = makeOptions();
    await runAgentTurn('use tool', options);
    expect(events.some((e) => e.type === 'tool_start')).toBe(true);
    expect(events.some((e) => e.type === 'tool_result')).toBe(true);
    const done = events.find((e) => e.type === 'done');
    expect(done && 'reply' in done ? done.reply : '').toBe('Hello world');
    expect(options.history.all().at(-1)?.content).toBe('Hello world');
  });

  it('denies tool when permission rejects', async () => {
    let call = 0;
    const responses = [TOOL_CALL, TEXT_ONLY];
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(responses[call++] ?? TEXT_ONLY)));
    const { options, events } = makeOptions({
      permission: { check: async () => 'deny' } as PermissionManager,
    });
    await runAgentTurn('use tool', options);
    const toolEvents = events.filter((e) => e.type === 'tool_result');
    expect(toolEvents).toHaveLength(1);
    const first = toolEvents[0] as { result?: { output?: string } };
    expect(first.result?.output).toContain('denied');
  });

  it('rejects invalid tool arguments via schema validation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(BAD_ARGS)));
    const { options, events } = makeOptions();
    const tool = makeTool().tool;
    tool.parameters.required = ['n'];
    options.tools = new Map([['counter', tool]]);
    await runAgentTurn('use tool', options);
    const toolResult = events.find((e) => e.type === 'tool_result') as { result?: { output?: string } };
    expect(toolResult?.result?.output).toContain('missing required parameter');
  });

  it('handles unknown tool name gracefully', async () => {
    const UNKNOWN = [
      '{"type":"response.output_item.done","item":{"type":"function_call","call_id":"c1","name":"nope","arguments":"{}"}}',
      '{"type":"response.completed","response":{"usage":{"input_tokens":1,"output_tokens":1}}}',
    ];
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(UNKNOWN)));
    const { options, events } = makeOptions();
    await runAgentTurn('use tool', options);
    const toolResult = events.find((e) => e.type === 'tool_result') as { result?: { output?: string } };
    expect(toolResult?.result?.output).toContain('unknown tool');
  });
});
