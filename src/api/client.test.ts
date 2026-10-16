import { describe, it, expect, vi } from 'vitest';
import { streamResponse } from './client.js';

function sseBody(chunks: string[], delayPerChunkMs = 0): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      for (const chunk of chunks) {
        if (delayPerChunkMs > 0) await new Promise((r) => setTimeout(r, delayPerChunkMs));
        controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
      }
      controller.close();
    },
  });
}

const BASE = { baseURL: 'https://api.test/v1', apiKey: 'k', model: 'm', instructions: 'i', history: [], userInput: 'u', tools: [] };

describe('reasoning events', () => {
  it('parses reasoning_summary_text deltas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      sseBody([
        '{"type":"response.reasoning_summary_text.delta","delta":"thinking step"}',
        '{"type":"response.output_text.delta","delta":"answer"}',
        '{"type":"response.completed","response":{"usage":{}}}',
      ]),
      { status: 200 },
    )));
    const types = [];
    for await (const e of streamResponse({ ...BASE })) types.push(e.type);
    expect(types).toEqual(['reasoning_delta', 'text_delta', 'done']);
  });

  it('parses GLM-style reasoning_text deltas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      sseBody(['{"type":"response.reasoning_text.delta","delta":"raw reasoning"}']),
      { status: 200 },
    )));
    const events = [];
    for await (const e of streamResponse({ ...BASE })) events.push(e);
    expect(events[0]).toEqual({ type: 'reasoning_delta', text: 'raw reasoning' });
  });
});

describe('streamResponse timeout guards', () => {
  it('completes a normal stream well under the idle timeout', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      sseBody(['{"type":"response.output_text.delta","delta":"hi"}', '{"type":"response.completed","response":{"usage":{}}}'], 30),
      { status: 200 },
    )));
    const events = [];
    for await (const e of streamResponse({ ...BASE, idleTimeoutMs: 2000 })) events.push(e.type);
    expect(events).toContain('text_delta');
    expect(events).toContain('done');
  });

  it('aborts with clear error when the stream stalls (no bytes)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      new ReadableStream({ start() { /* never emits, never closes */ } }),
      { status: 200 },
    )));
    const seen: string[] = [];
    await expect(async () => {
      for await (const e of streamResponse({ ...BASE, idleTimeoutMs: 150 })) {
        seen.push(e.type);
      }
    }).rejects.toThrow(/idle for 0s|server stalled/);
  });
});
