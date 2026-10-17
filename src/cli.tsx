/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import React from 'react';
import { render } from 'ink';
import { App, type TurnHandle } from './ui/App.js';
import type { ChatItem } from './ui/types.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createT } from './ui/locales.js';
import { loadConfig, saveConfig, getActiveProvider, resolveApiKey, ensureMcodeDir, providerIssue } from './config/config.js';
import { detectLanguage, sessionDataDir, type Mode } from './config/constants.js';
import { buildGoalPrompt, checkGoalComplete } from './agent/goal.js';
import { createRegistry, toToolSpecs } from './tools/registry.js';
import { createPermissionManager } from './permission/manager.js';
import { runAgentTurn } from './agent/loop.js';
import { BUILTIN_AGENTS, createTaskTool, type AgentDefinition } from './agent/subagent.js';
import { loadEccAgents, loadUserAgents, materializeEccCore, eccSkillsDir } from './plugins/ecc-core.js';
import { HistoryStore, createSession, persistSession, listSessions, loadSession, listAllSessions, loadSessionGlobal } from './agent/history.js';
import { loadSkills, buildSkillIndex } from './skills/loader.js';
import { findMcodeDocs, buildProjectDocSection } from './memory/mdoc.js';
import { createSkillTool } from './skills/tool.js';
import { createSkillCommands } from './commands/builtin.js';
import { createUsageTracker, type ModelUsage } from './util/token-usage.js';
import { listWorkspaceFiles } from './util/files.js';
import { createCommandList } from './commands/builtin.js';
import type { Language } from './config/constants.js';

import packageJson from '../package.json';
const VERSION: string = packageJson.version;

function summarizeHistoryCli(messages: { role: string; content: string }[]): string {
  if (messages.length === 0) return '(empty)';
  const first = messages[0]!.content.slice(0, 160);
  return `earlier ${messages.length} messages, starting: "${first}…"`;
}

interface CliArgs {
  resume?: string | boolean;
  continueLast?: boolean;
  addProvider?: string;
  switchTo?: string;
  reset?: boolean;
  token?: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--resume') {
      const next = argv[i + 1];
      args.resume = next && !next.startsWith('-') ? next : true;
      if (next && !next.startsWith('-')) i++;
    } else if (arg === '--continue') {
      args.continueLast = true;
    } else if (arg === 'add_provider') {
      args.addProvider = argv[i + 1];
      i++;
    } else if (arg === 'switch') {
      args.switchTo = argv[i + 1];
      i++;
    } else if (arg === 'reset') {
      args.reset = true;
    } else if (arg === 'token') {
      args.token = true;
    } else if (arg === '--version' || arg === '-v') {
      console.log(`mcode v${VERSION}`);
      process.exit(0);
    }
  }
  return args;
}

/** Non-TUI CLI subcommands: add_provider / switch / reset / token. */
function runSubcommand(args: CliArgs): boolean {
  const config = loadConfig(process.env['LANG']);
  ensureMcodeDir();

  if (args.addProvider) {
    const name = args.addProvider;
    if (config.providers.some((p) => p.name === name)) {
      console.error(`provider '${name}' already exists`);
      return true;
    }
    const provider = {
      name,
      baseURL: process.env['MCODE_BASE_URL'] ?? 'https://api.openai.com/v1',
      apiKeyEnv: process.env['MCODE_API_KEY_ENV'] ?? process.env['MCODE_API_KEY'] ?? 'OPENAI_API_KEY',
      models: (process.env['MCODE_MODELS'] ?? 'gpt-5').split(',').map((m) => m.trim()),
    };
    saveConfig({
      ...config,
      providers: [...config.providers, provider],
      activeProvider: config.activeProvider ?? provider.name,
      activeModel: config.activeModel ?? provider.models[0] ?? null,
    });
    console.log(`✓ provider '${name}' added (baseURL=${provider.baseURL}, apiKeyEnv=${provider.apiKeyEnv})`);
    return true;
  }

  if (args.switchTo) {
    const provider = config.providers.find((p) => p.name === args.switchTo);
    if (!provider) {
      console.error(`provider '${args.switchTo}' not found; known: ${config.providers.map((p) => p.name).join(', ') || '(none)'}`);
      return true;
    }
    saveConfig({ ...config, activeProvider: provider.name, activeModel: provider.models[0] ?? null });
    console.log(`✓ switched to '${provider.name}'`);
    return true;
  }

  if (args.reset) {
    saveConfig({ ...config, activeProvider: null, activeModel: null, providers: [] });
    console.log('✓ providers reset; restart mcode to run the setup guide');
    return true;
  }

  if (args.token) {
    const sessions = listSessions(process.cwd());
    let totalIn = 0;
    let totalOut = 0;
    let totalCache = 0;
    for (const meta of sessions.slice(0, 20)) {
      totalIn += Math.round(meta.totalTokens * 0.7);
      totalOut += Math.round(meta.totalTokens * 0.3);
    }
    console.log(`sessions found: ${sessions.length}`);
    console.log(`approx input: ${totalIn} | output: ${totalOut} | cached: ${totalCache}`);
    console.log('(per-model breakdown: run /token inside a session)');
    return true;
  }

  return false;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (runSubcommand(args)) return;

  if (!process.stdin.isTTY) {
    console.error('mcode needs an interactive terminal (TTY) for its UI.');
    console.error('Non-interactive subcommands: add_provider / switch / reset / token / --resume');
    process.exit(1);
  }
  const cwd = process.cwd();
  ensureMcodeDir();
  const config = loadConfig(process.env['LANG']);
  const t = createT(config.language);
  const registry = createRegistry();
  const history = new HistoryStore();
  const usageTracker = createUsageTracker();
  const modeRef: { current: Mode } = { current: config.defaultMode };
  const goalRef: { current: string | null } = { current: null };
  const session = createSession(cwd, config.activeModel ?? '', config.defaultMode);
  let resumedItems: ChatItem[] | undefined;
  const provider = getActiveProvider(config);
  const skills = loadSkills(cwd, eccSkillsDir() ? [{ dir: eccSkillsDir()!, source: 'bundled' as const }] : []);
  registry.set('skill', createSkillTool(skills));
  const projectDoc = buildProjectDocSection(findMcodeDocs(cwd));
  // ECC agents merge after built-ins; built-in definitions win on name clash.
  const materialized = materializeEccCore();
  if (materialized) {
    console.log(`✓ ECC core materialized: ${materialized.agents} agents, ${materialized.skills} skills → ~/.mcode`);
  }
  const userAgents = loadUserAgents();
  const eccAgents = loadEccAgents();
  const known = new Set([...BUILTIN_AGENTS.map((a) => a.name), ...userAgents.map((a) => a.name)]);
  const mergedAgents = [...BUILTIN_AGENTS, ...userAgents, ...eccAgents.filter((a) => !known.has(a.name))];

  // --resume [id] | --continue
  if (args.resume !== undefined || args.continueLast) {
    let sessions = listSessions(cwd);
    let globalFallback = false;
    if (sessions.length === 0) {
      // Claude-code parity: no local sessions → global resume across projects
      const all = listAllSessions();
      if (all.length === 0) {
        console.log('no sessions found (local or global)');
        return;
      }
      globalFallback = true;
      sessions = all.map(({ projectCwd: _p, ...meta }) => meta);
      console.log(`no local sessions — showing ${all.length} global session(s)`);
    }
    if (typeof args.resume === 'string') {
      const record = globalFallback ? loadSessionGlobal(args.resume) : loadSession(cwd, args.resume);
      if (record) {
        history.restore(record.messages);
        resumedItems = record.messages.map((m) => ({
          kind: m.role === 'user' ? ('user' as const) : ('assistant' as const),
          text: m.content,
        }));
        session.meta.sessionId = record.meta.sessionId;
        session.meta.title = record.meta.title;
        console.log(`✓ resumed session ${args.resume} (${record.messages.length} messages)`);
      } else {
        console.log(`session '${args.resume}' not found`);
      }
    } else if (args.continueLast) {
      const first = sessions[0]!;
      const record = globalFallback ? loadSessionGlobal(first.sessionId) : loadSession(cwd, first.sessionId);
      if (record) {
        history.restore(record.messages);
        resumedItems = record.messages.map((m) => ({
          kind: m.role === 'user' ? ('user' as const) : ('assistant' as const),
          text: m.content,
        }));
        session.meta.sessionId = record.meta.sessionId;
        session.meta.title = record.meta.title;
      }
      console.log(`✓ continued ${first.sessionId}`);
    } else {
      console.log('sessions:');
      for (const meta of sessions.slice(0, 10)) {
        console.log(`  ${meta.sessionId}  ${meta.updated}  ${meta.title}`);
      }
      console.log('pick one: mcode --resume <id>');
      return;
    }
  }

  const permission = createPermissionManager(() => modeRef.current, async (tool) => {
    // resolved by the UI via TurnHandle.confirm; fallback deny if no UI hook
    const allowed = confirmRef.current ? await confirmRef.current(tool.name) : false;
    return allowed ? 'allow' : 'deny';
  });
  const confirmRef: { current: ((toolName: string) => Promise<boolean>) | null } = { current: null };

  registry.set(
    'task',
    createTaskTool({
      agents: mergedAgents,
      model: () => {
        return config.activeModel ?? getActiveProvider(config)?.models[0] ?? '';
      },
      baseURL: () => getActiveProvider(config)?.baseURL ?? '',
      apiKey: () => {
        const p = getActiveProvider(config);
        return p ? resolveApiKey(p) ?? '' : '';
      },
      language: config.language as Language,
      tools: registry,
      permission,
      usageTracker,
      cwd,
      getMode: () => modeRef.current,
    }),
  );

  const runTurn = async (input: string, handle: TurnHandle): Promise<void> => {
    confirmRef.current = handle.confirm;
    modeRef.current = handle.getMode();
    const issue = providerIssue(config);
    if (issue.kind !== 'none') {
      handle.emit({
        type: 'error',
        message:
          issue.kind === 'no-provider'
            ? t('noProviderWarning')
            : `${t('noApiKeyWarning')}（${issue.provider.apiKeyEnv}）`,
      });
      return;
    }
    const currentProvider = getActiveProvider(config)!;
    const apiKey = resolveApiKey(currentProvider)!;

    // goal loop: keep driving the agent until the goal is achieved (max 12 rounds)
    const maxRounds = goalRef.current ? 12 : 1;
    let currentInput = input;
    for (let round = 0; round < maxRounds; round++) {
      await runAgentTurn(currentInput, {
      model: config.activeModel ?? currentProvider.models[0] ?? '',
      baseURL: currentProvider.baseURL,
      apiKey,
      language: config.language as Language,
      tools: registry,
      permission,
      history,
      usageTracker,
      skills,
      projectDoc,
      agents: mergedAgents,
      cwd,
      mode: modeRef.current,
      signal: handle.signal,
      goal: goalRef.current ?? undefined,
      onEvent: (event) => {
        switch (event.type) {
          case 'text_delta':
            handle.emit({ type: 'text_delta', text: event.text });
            break;
          case 'reasoning_delta':
            handle.emit({ type: 'reasoning_delta', text: event.text });
            break;
          case 'tool_start':
            handle.emit({ type: 'tool_start', name: event.name, args: event.args });
            break;
          case 'tool_result':
            handle.emit({
              type: 'tool_result',
              name: event.name,
              ok: event.result.success,
              detail: event.result.output,
            });
            break;
          case 'usage':
            handle.emit({ type: 'usage', usage: event.usage });
            break;
          case 'compacted':
            handle.emit({ type: 'compacted', note: event.note });
            break;
          case 'done':
            session.meta.totalTokens = usageTracker.snapshot().reduce((sum, m) => sum + m.inputTokens + m.outputTokens, 0);
            persistSession({ ...session, messages: history.all() });
            handle.emit({ type: 'done', reply: event.reply });
            break;
          case 'error':
            handle.emit({ type: 'error', message: event.message });
            break;
        }
      },
      });
      if (goalRef.current === null || handle.signal.aborted) break;
      currentInput = buildGoalPrompt(goalRef.current);
      const done = await checkGoalComplete({
        goal: goalRef.current ?? undefined,
        baseURL: currentProvider.baseURL,
        apiKey,
        model: config.activeModel ?? currentProvider.models[0] ?? '',
        language: config.language,
        signal: handle.signal,
      });
      if (done) {
        handle.emit({ type: 'done', reply: '' });
        return;
      }
    }
  };

  const fileItems = await listWorkspaceFiles(cwd);
  const instance = render(
    <App
      config={config}
      cwd={cwd}
      version={VERSION}
      t={t}
      commands={[...createCommandList(), ...createSkillCommands(skills)]}
      listFiles={() => fileItems}
      runTurn={runTurn}
      saveConfig={() => saveConfig(config)}
      getUsage={(): ModelUsage[] => usageTracker.snapshot()}
      listAgents={(): Array<{ name: string; description: string; source: string }> =>
        mergedAgents.map((a) => ({
          name: a.name,
          description: a.description,
          source: userAgents.some((u) => u.name === a.name)
            ? 'user'
            : BUILTIN_AGENTS.some((b) => b.name === a.name)
              ? 'builtin'
              : 'ecc',
        }))
      }
      listSkills={(): Array<{ name: string; source: string }> =>
        skills.map((sk) => ({ name: sk.name, source: sk.source }))
      }
      onModeChange={(mode) => {
        modeRef.current = mode;
      }}
      onClear={() => history.clear()}
      initialItems={resumedItems}
      onCompact={async () => {
        const messages = history.all();
        if (messages.length === 0) return;
        const summary = summarizeHistoryCli(messages);
        const keepTurns = Math.max(2, Math.floor(messages.length / 4));
        history.compact(summary, keepTurns);
      }}
      onSnapshot={() => {
        const dir = sessionDataDir();
        mkdirSync(dir, { recursive: true });
        const stamp = new Date().toISOString().slice(0, 10);
        const slug = session.meta.sessionId;
        const path = join(dir, `${stamp}-${slug}.md`);
        const usage = usageTracker.snapshot();
        const body = [
          `# MCode session snapshot`,
          ``,
          `- **Date:** ${new Date().toISOString()}`,
          `- **Project:** ${cwd}`,
          `- **Session:** ${session.meta.sessionId}`,
          ``,
          `## Transcript`,
          ``,
          ...history.all().map((m) => `- **${m.role}:** ${m.content}`),
          ``,
          `## Token usage`,
          ``,
          ...usage.map((m) => `- ${m.model}: in=${m.inputTokens} out=${m.outputTokens} cached=${m.cachedTokens} req=${m.requests}`),
        ];
        writeFileSync(path, body.join('\n'), 'utf8');
        return path;
      }}
      onResumeList={(): string[] =>
        listSessions(cwd).map(
          (meta) => `  ${meta.sessionId}  ${meta.updated}  ${meta.title}`,
        )
      }
    />,
    { exitOnCtrlC: false },
  );
  // bracketed paste: multi-line pastes arrive wrapped in markers instead of
  // being interpreted as Enter presses
  process.stdout.write('\x1b[?2004h');
  const cleanupPaste = (): void => {
    process.stdout.write('\x1b[?2004l');
  };
  process.on('exit', cleanupPaste);
  process.on('SIGINT', () => {
    cleanupPaste();
    process.exit(0);
  });
  void instance;
}

void main();
