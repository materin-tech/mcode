/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

/**
 * OpenAI Responses API streaming client — the single protocol MCode speaks.
 */

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface UserAttachment {
  path: string;
  dataUrl: string;
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  callId: string;
  name: string;
  arguments: string;
}

export interface UsageInfo {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}

export type StreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'reasoning_delta'; text: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'done'; usage: UsageInfo | null };

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ResponsesUsage {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
}

/**
 * Stream one Responses API completion. Yields text deltas and complete tool
 * calls, then a final `done` event carrying token usage.
 */
export async function* streamResponse(options: {
  baseURL: string;
  apiKey: string;
  model: string;
  instructions: string;
  history: ChatMessage[];
  userInput: string;
  /** Images attached to this user input (multimodal input_image parts). */
  attachments?: UserAttachment[];
  tools: ToolSpec[];
  signal?: AbortSignal;
  /** Abort when no stream data arrives for this long (stall guard). */
  idleTimeoutMs?: number;
}): AsyncGenerator<StreamEvent> {
  const body = {
    model: options.model,
    instructions: options.instructions,
    input: [
      ...options.history.map((m) => ({
        role: m.role,
        content: [{ type: m.role === 'user' ? 'input_text' : 'output_text', text: m.content }],
      })),
      {
        role: 'user' as const,
        content: [
          { type: 'input_text', text: options.userInput },
          ...(options.attachments ?? []).map((a) => ({
            type: 'input_image' as const,
            image_url: a.dataUrl,
          })),
        ],
      },
    ],
    tools: options.tools.map((t) => ({
      type: 'function' as const,
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
    stream: true,
  };

  const url = `${options.baseURL.replace(/\/+$/, '')}/responses`;
  // No timeouts, Claude Code style: only the user's ESC signal aborts a
  // running request. Long thinking / long generation must never be killed
  // by our own timers.
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });
  } catch (err) {
    throw new ApiError(`network error: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new ApiError(`API ${res.status}: ${text.slice(0, 500)}`, res.status);
  }

  for await (const event of parseSSE(res.body, options.idleTimeoutMs)) {
    const parsed = safeJson(event.data);
    if (!parsed) continue;
    const type = parsed['type'] as string | undefined;

    if (type === 'response.output_text.delta') {
      const delta = parsed['delta'];
      if (typeof delta === 'string' && delta.length > 0) {
        yield { type: 'text_delta', text: delta };
      }
    } else if (type === 'response.reasoning_summary_text.delta' || type === 'response.reasoning_text.delta') {
      const delta = parsed['delta'];
      if (typeof delta === 'string' && delta.length > 0) {
        yield { type: 'reasoning_delta', text: delta };
      }
    } else if (type === 'response.output_item.done') {
      const item = parsed['item'] as Record<string, unknown> | undefined;
      if (item && item['type'] === 'function_call') {
        yield {
          type: 'tool_call',
          call: {
            callId: String(item['call_id'] ?? ''),
            name: String(item['name'] ?? ''),
            arguments: String(item['arguments'] ?? '{}'),
          },
        };
      }
    } else if (type === 'response.completed') {
      const response = parsed['response'] as Record<string, unknown> | undefined;
      const usage = response?.['usage'] as ResponsesUsage | undefined;
      yield {
        type: 'done',
        usage: usage
          ? {
              inputTokens: usage.input_tokens ?? 0,
              outputTokens: usage.output_tokens ?? 0,
              cachedTokens: usage.input_tokens_details?.cached_tokens ?? 0,
            }
          : null,
      };
    }
  }
}

async function* parseSSE(body: ReadableStream<Uint8Array>, idleTimeoutMs?: number): AsyncGenerator<{ data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    let result: ReadableStreamReadResult<Uint8Array>;
    if (idleTimeoutMs === undefined) {
      result = await reader.read();
    } else {
      // Optional stall guard (off by default): abort when no bytes arrive.
      let idleTimer: ReturnType<typeof setTimeout> | undefined;
      const idle = new Promise<never>((_, reject) => {
        idleTimer = setTimeout(
          () => reject(new ApiError(`stream idle for ${Math.round(idleTimeoutMs / 1000)}s — server stalled`, undefined)),
          idleTimeoutMs,
        );
      });
      try {
        result = await Promise.race([reader.read(), idle]);
      } catch (err) {
        clearTimeout(idleTimer);
        await reader.cancel().catch(() => {});
        throw err;
      }
      clearTimeout(idleTimer);
    }
    const { done, value } = result;
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, sep).replace(/\r$/, '');
      buffer = buffer.slice(sep + 1);
      if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        if (data.length > 0 && data !== '[DONE]') yield { data };
      }
    }
  }
}

function safeJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}
