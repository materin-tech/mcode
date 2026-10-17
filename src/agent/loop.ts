/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import type { ToolCall, UsageInfo, ChatMessage } from '../api/client.js';
import { streamResponse, type ToolSpec } from '../api/client.js';
import type { ToolDefinition, ToolResult, PermissionManager, ToolContext } from '../tools/types.js';
import { validateInput } from '../tools/validate.js';
import { buildSystemPrompt } from './context.js';
import { HistoryStore } from './history.js';
import { createUsageTracker } from '../util/token-usage.js';
import { planCompaction } from './compaction.js';
import type { AgentDefinition } from './subagent.js';
import type { SkillSummary } from '../skills/loader.js';
import type { Language, Mode } from '../config/constants.js';
import type { UserAttachment } from '../api/client.js';
import {toToolSpecs} from "../tools/registry";

export type AgentEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'retrying'; attempt: number; max: number; reason: string }
  | { type: 'reasoning_delta'; text: string; scope?: string }
  | { type: 'tool_start'; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; name: string; result: ToolResult }
  | { type: 'usage'; usage: UsageInfo }
  | { type: 'compacted'; note: string }
  | { type: 'done'; reply: string }
  | { type: 'error'; message: string };

export interface AgentOptions {
  /** Overrides the default system prompt (used by subagents). */
  instructions?: string;
  skills?: SkillSummary[];
  /** Combined MCODE.md content for the system prompt. */
  projectDoc?: string;
  /** Active session goal, injected into the system prompt. */
  goal?: string;
  /** Images attached to the initial user input. */
  attachments?: UserAttachment[];
  /** PUA always-on directive (/pua:on). */
  puaDirective?: string;
  /** Available subagents (drives the dispatch protocol). */
  agents?: AgentDefinition[];
  model: string;
  baseURL: string;
  apiKey: string;
  language: Language;
  tools: Map<string, ToolDefinition>;
  permission: PermissionManager;
  history: HistoryStore;
  usageTracker: ReturnType<typeof createUsageTracker>;
  cwd: string;
  mode: Mode;
  signal?: AbortSignal;
  maxTurns?: number;
  onEvent: (event: AgentEvent) => void;
}

const MAX_TOOL_TURNS = 25;
const MAX_STREAM_RETRIES = 10; // Claude Code parity
const TRANSIENT_STREAM_ERRORS = /terminated|ECONNRESET|EPIPE|ECONNABORTED|network|fetch failed|socket|premature|other side closed/i;

/**
 * compact-harness main loop. The while-loop over tool calls is an
 * implementation detail of the scheduler; context/history/compaction/permission
 * participate in every round.
 */
export async function runAgentTurn(
  userInput: string,
  options: AgentOptions,
): Promise<string> {
  const { onEvent } = options;
  try {
    // -- compaction gate -------------------------------------------------
    const plan = planCompaction(options.history.all());
    if (plan.shouldCompact) {
      const summary = summarizeHistory(options.history.all());
      options.history.compact(summary, plan.keepTurns);
      onEvent({ type: 'compacted', note: `compacted to ~${plan.keepTurns} recent turns` });
    }

    const toolSpecs: ToolSpec[] = toToolSpecs(options.tools);
    const systemPrompt =
      options.instructions ??
      buildSystemPrompt({
        language: options.language,
        toolNames: [...options.tools.keys()],
        skills: options.skills,
        projectDoc: options.projectDoc,
        goal: options.goal,
        agents: options.agents,
        puaDirective: options.puaDirective,
      });

    let currentInput = userInput;
    let turnCount = 0;

    while (turnCount < MAX_TOOL_TURNS) {
      // Transient stream failures (server drop, network blip) retry with
      // backoff instead of killing the turn — Claude Code parity.
      let reply = '';
      const calls: ToolCall[] = [];
      let usage: UsageInfo | null = null;
      for (let attempt = 0; ; attempt++) {
        reply = '';
        calls.length = 0;
        usage = null;
        try {
          const stream = streamResponse({
            baseURL: options.baseURL,
            apiKey: options.apiKey,
            model: options.model,
            instructions: systemPrompt,
            history: options.history.all(),
            userInput: currentInput,
            attachments: turnCount === 0 ? options.attachments : undefined,
            tools: toolSpecs,
            signal: options.signal,
          });
          for await (const event of stream) {
            switch (event.type) {
              case 'text_delta':
                reply += event.text;
                onEvent({ type: 'text_delta', text: event.text });
                break;
              case 'reasoning_delta':
                onEvent({ type: 'reasoning_delta', text: event.text });
                break;
              case 'tool_call':
                calls.push(event.call);
                break;
              case 'done':
                usage = event.usage;
                break;
            }
          }
          break; // stream completed cleanly
        } catch (err) {
          if (options.signal?.aborted) throw err;
          const msg = err instanceof Error ? err.message : String(err);
          if (!TRANSIENT_STREAM_ERRORS.test(msg) || attempt >= MAX_STREAM_RETRIES - 1) {
            throw err;
          }
          const waitMs = Math.min(1000 * 2 ** attempt, 10_000); // cap backoff at 10s
          onEvent({
            type: 'retrying',
            attempt: attempt + 1,
            max: MAX_STREAM_RETRIES,
            reason: msg.slice(0, 80),
          });
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
      }

      if (usage) {
        options.usageTracker.add(options.model, usage);
        onEvent({ type: 'usage', usage });
      }

      if (calls.length === 0) {
        options.history.pushTurn(userInput, reply);
        onEvent({ type: 'done', reply });
        return reply;
      }

      // -- permission gate + execute tool calls --------------------------
      const outputs: string[] = [];
      for (const call of calls) {
        if (options.signal?.aborted) break;
        const tool = options.tools.get(call.name);
        if (!tool) {
          outputs.push(`[${call.name}] error: unknown tool`);
          onEvent({ type: 'tool_result', name: call.name, result: { success: false, output: 'error: unknown tool' } });
          continue;
        }
        const ctx: ToolContext = { cwd: options.cwd, mode: options.mode, signal: options.signal };
        const decision = await options.permission.check(tool, ctx);
        if (decision === 'deny') {
          outputs.push(`[${call.name}] error: denied by permission mode`);
          onEvent({ type: 'tool_result', name: call.name, result: { success: false, output: 'error: denied by permission mode' } });
          continue;
        }
        const parsedArgs = safeParse(call.arguments);
        const check = validateInput(tool, parsedArgs);
        if (!check.valid) {
          outputs.push(`[${call.name}] ${check.error}`);
          onEvent({ type: 'tool_result', name: call.name, result: { success: false, output: check.error ?? 'invalid input' } });
          continue;
        }
        onEvent({ type: 'tool_start', name: call.name, args: parsedArgs });
        const result = await tool.execute(parsedArgs, ctx);
        outputs.push(`[${call.name}] ${result.output}`);
        onEvent({ type: 'tool_result', name: call.name, result });
      }

      // -- feed tool outputs back as the next input -----------------------
      currentInput = [
        'Tool call results:',
        ...outputs,
        '',
        'Continue based on these results. When the task is complete, reply with the final answer and no tool calls.',
      ].join('\n');

      turnCount++;
    }

    const stopped = '(stopped: max tool turns reached)';
    options.history.pushTurn(userInput, stopped);
    onEvent({ type: 'done', reply: stopped });
    return stopped;
  } catch (err) {
    if (options.signal?.aborted) {
      onEvent({ type: 'done', reply: '' });
      return '';
    }
    onEvent({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    return '';
  }
}

function safeParse(args: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(args);
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function summarizeHistory(messages: ChatMessage[]): string {
  if (messages.length === 0) return '(empty history)';
  const first = messages[0]!.content.slice(0, 200);
  return `Earlier conversation had ${messages.length} messages, starting with: "${first}…"`;
}
