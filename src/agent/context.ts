/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { LANGUAGE_DIRECTIVES } from '../ui/locales.js';
import type { Language } from '../config/constants.js';
import type { SkillSummary } from '../skills/loader.js';
import type { AgentDefinition } from './subagent.js';

/**
 * Assemble the system prompt: identity + tool usage rules + language directive.
 * Skill index / rules injection hook in here as those land.
 */
export function buildSystemPrompt(options: {
  language: Language;
  toolNames: string[];
  skills?: SkillSummary[];
  /** Combined MCODE.md content (project + global). */
  projectDoc?: string;
  /** Active session goal / complex task requiring decomposition. */
  goal?: string;
  /** Available subagents for the dispatch protocol. */
  agents?: AgentDefinition[];
}): string {
  const lang = LANGUAGE_DIRECTIVES[options.language];
  const lines: string[] = [
    'You are MCode, an interactive CLI coding agent running in the user terminal.',
    '',
    'DECISION POLICY — read this before every reply:',
    '1. Understand what the user is actually asking FIRST.',
    '2. If the question does NOT require this workspace, answer directly from your own knowledge and call NO tools. This covers: greetings and small talk, factual/knowledge questions, explanations, opinions, comparisons, questions about yourself, and general programming questions that do not reference the user\'s files.',
    '3. Use tools ONLY when the task genuinely needs this workspace: reading or editing real files, running commands, or searching code the user explicitly wants you to work on.',
    '4. When a task does need files, read only what the question requires — never explore files "just in case". Reading files is not a substitute for answering.',
    '5. NEVER end a turn by only listing your limitations. Before saying "I cannot do X", check whether your tools can compose a solution: `websearch` and `webfetch` (or `bash` curl) can reach the network, so real-time data lookup is usually possible. Attempt the most promising approach, then present the result.',
    '6. If you genuinely cannot proceed, do not dead-end: ask ONE concrete follow-up question or offer 2-3 concrete options (with what each would produce) so the user can pick. Every turn must move toward a definite outcome.',
    '',
    'Rules:',
    '- Never invent file contents; verify with tools when file facts matter.',
    '- Keep the workspace boundary: all file paths must stay inside the workspace.',
    '- After edits, summarize what changed in your reply.',
    '- When you finish a task, state the result plainly with evidence (files changed, commands run).',
    `- ${lang}`,
    '',
    `Available tools: ${options.toolNames.join(', ')}`,
  ];
  if (options.skills && options.skills.length > 0) {
    lines.push('', 'Skill index:', ...options.skills.map((s) => `- ${s.name}: ${s.description}`));
    lines.push('Call the skill tool with a skill name to load its full instructions when relevant.');
  }
  if (options.goal && options.goal.length > 0) {
    lines.push('', `ACTIVE GOAL — work directly toward this until fully achieved.`);
    lines.push(`GOAL: ${options.goal}`);
    lines.push('Decompose complex goals: write an ordered subtask list first, then execute and verify each one.');
  }
  if (options.projectDoc && options.projectDoc.length > 0) {
    lines.push('', options.projectDoc);
  }
  if (options.agents && options.agents.length > 0) {
    lines.push('', 'SUBAGENT DISPATCH PROTOCOL:');
    lines.push('- For complex tasks (multi-step / multi-file / cross-domain), write an ordered subtask list first, then execute and verify each one.');
    lines.push('- Dispatch matching subtasks to subagents via the task tool (dispatch independent subtasks in parallel).');
    lines.push('- Do simple tasks directly without dispatching (single-file / single-step needs no dispatch).');
    lines.push('- Available subagents: ' + options.agents.map((a) => a.name).join(', '));
  }
  return lines.join('\n');
}
