/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import type { ToolDefinition, ToolResult, PermissionManager } from '../tools/types.js';
import type { ToolContext } from '../tools/types.js';
import { runAgentTurn } from './loop.js';
import { HistoryStore } from './history.js';
import type { createUsageTracker } from '../util/token-usage.js';
import type { Language, Mode } from '../config/constants.js';

export interface AgentDefinition {
  name: string;
  /** Main model reads this to decide when to dispatch. */
  description: string;
  systemPrompt: string;
  /** Tool whitelist; inherits all when omitted. */
  tools?: string[];
  maxTurns?: number;
}

const READ_ONLY_TOOLS = ['read_file', 'glob', 'grep'];

/**
 * Built-in agent registry (design 4.2). ECC agents plug in through the same
 * shape via the plugin loader later.
 */
export const BUILTIN_AGENTS: AgentDefinition[] = [
  {
    name: 'general-purpose',
    description: 'Multi-step research, search, and task execution with full tool access.',
    systemPrompt:
      'You are a general-purpose subagent. Complete the given task autonomously using tools, then reply with a concise final report. Always answer in the language of the task.',
    maxTurns: 15,
  },
  {
    name: 'code-explorer',
    description: 'Read-only codebase exploration and code search. Use for broad lookups.',
    systemPrompt:
      'You are a read-only code exploration subagent. Use read_file/glob/grep to investigate, then reply with a structured findings report.',
    tools: READ_ONLY_TOOLS,
    maxTurns: 12,
  },
  {
    name: 'planner',
    description: 'Implementation planning: break a task into ordered steps with risks.',
    systemPrompt:
      'You are a planning subagent. Investigate the codebase read-only, then produce an ordered implementation plan with steps, risks, and acceptance criteria.',
    tools: READ_ONLY_TOOLS,
    maxTurns: 10,
  },
  {
    name: 'code-reviewer',
    description: 'Code quality review of recently changed or specified files.',
    systemPrompt:
      'You are a code review subagent. Read the specified files and reply with findings ranked by severity (critical/high/medium/low), each with file:line references.',
    tools: READ_ONLY_TOOLS,
    maxTurns: 10,
  },
];

export interface TaskToolDeps {
  agents: AgentDefinition[];
  /** Evaluated at dispatch time so guide/switch changes apply live. */
  model: () => string;
  baseURL: () => string;
  apiKey: () => string;
  language: Language;
  tools: Map<string, ToolDefinition>;
  permission: PermissionManager;
  usageTracker: ReturnType<typeof createUsageTracker>;
  cwd: string;
  getMode: () => Mode;
  signal?: AbortSignal;
  onEvent?: (event: { type: string; name?: string; detail?: string; text?: string; scope?: string; usage?: { inputTokens: number; outputTokens: number; cachedTokens: number } }) => void;
}

/** Factory for the `task` tool: dispatches a subagent with isolated context. */
export function createTaskTool(deps: TaskToolDeps): ToolDefinition {
  return {
    name: 'task',
    description:
      'Dispatch a subagent (independent context) to handle a subtask. Returns its final report.',
    isReadOnly: false,
    parameters: {
      type: 'object',
      properties: {
        subagent_type: { type: 'string', description: 'Agent name (e.g. code-explorer, planner).' },
        prompt: { type: 'string', description: 'Task description for the subagent.' },
      },
      required: ['subagent_type', 'prompt'],
    },
    async execute(input, ctx: ToolContext): Promise<ToolResult> {
      const agentName = String(input['subagent_type']);
      const prompt = String(input['prompt']);
      const agent = deps.agents.find((a) => a.name === agentName);
      if (!agent) {
        const known = deps.agents.map((a) => a.name).join(', ');
        return { success: false, output: `error: unknown agent '${agentName}' (known: ${known})` };
      }
      const allowed = agent.tools;
      const tools = new Map(
        [...deps.tools].filter(
          ([name]) => name !== 'task' && (allowed ? allowed.includes(name) : true),
        ),
      );
      const subHistory = new HistoryStore();
      const report = await runAgentTurn(prompt, {
        instructions: agent.systemPrompt,
        model: deps.model(),
        baseURL: deps.baseURL(),
        apiKey: deps.apiKey(),
        language: deps.language,
        tools,
        permission: deps.permission,
        history: subHistory,
        usageTracker: deps.usageTracker,
        cwd: deps.cwd,
        mode: deps.getMode(),
        signal: deps.signal ?? ctx.signal,
        maxTurns: agent.maxTurns,
        onEvent: (event) => {
          if (event.type === 'tool_start') {
            deps.onEvent?.({ type: 'tool_start', name: `${agent.name}:${event.name}` });
          } else if (event.type === 'tool_result') {
            deps.onEvent?.({ type: 'tool_result', name: `${agent.name}:${event.name}`, detail: event.result.output });
          } else if (event.type === 'reasoning_delta') {
            deps.onEvent?.({ type: 'reasoning_delta', text: event.text, scope: agent.name });
          } else if (event.type === 'usage') {
            deps.onEvent?.({ type: 'usage', usage: event.usage });
          }
        },
      });
      const finalReport = report.trim().length > 0 ? report : '(no report produced)';
      return {
        success: true,
        output: `[${agent.name} report]\n${finalReport}`,
        display: finalReport,
      };
    },
  };
}
