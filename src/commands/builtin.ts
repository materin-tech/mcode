/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { existsSync } from 'node:fs';
import packageJson from '../../package.json';
import { configPath, LANGUAGES, LANGUAGE_LABELS } from '../config/constants.js';
import type { Language } from '../config/constants.js';
import { formatUsageTable } from '../util/token-usage.js';
import { getActiveProvider, resolveApiKey } from '../config/config.js';
import { initMcodeDoc, findMcodeDocs } from '../memory/mdoc.js';
import { formatDuration } from '../util/activity.js';
import type { Command, CommandContext } from './index.js';

export const BUILTIN_COMMANDS: Command[] = [
  {
    name: 'help',
    description: '帮助 / help',
    handler: (_args, ctx) => {
      const commands = ALL_COMMANDS;
      const width = Math.max(...commands.map((c) => c.name.length));
      ctx.print(
        [
          'Commands:',
          ...commands.map((c) => `  /${c.name.padEnd(width)}  ${c.description}${c.stub ? ' (stub)' : ''}`),
        ].join('\n'),
      );
    },
  },
  {
    name: 'clear',
    description: '清空上下文 / clear context',
    handler: (_args, ctx) => {
      ctx.clearConversation();
    },
  },
  {
    name: 'compact',
    description: '手动压缩历史 / compact history',
    handler: async (_args, ctx) => {
      await ctx.compactNow();
      ctx.print('✓ history compacted');
    },
  },
  {
    name: 'model',
    description: '切换或列出模型 / switch or list models',
    argHint: '[model]',
    handler: (args, ctx) => {
      const provider = getActiveProvider(ctx.config);
      if (args.trim().length > 0) {
        ctx.setModel(args.trim());
        ctx.print(`✓ model → ${args.trim()}`);
        return;
      }
      if (!provider) {
        ctx.print('✗ no active provider — run /model after setup, or mcode add_provider <name>');
        ctx.startProviderGuide();
        return;
      }
      if (provider.models.length === 0) {
        ctx.print('✗ active provider has no models configured');
        return;
      }
      ctx.openModelPicker();
    },
  },
  {
    name: 'token',
    description: '按模型打印 token 明细 / token usage by model',
    handler: (_args, ctx) => {
      ctx.print(formatUsageTable(ctx.getUsage()));
    },
  },
  {
    name: 'language',
    description: '切换语言环境 / switch language',
    argHint: '[zh_CN|zh_TW|en_US|ja_JP|ko_KR]',
    handler: (args, ctx) => {
      const lang = args.trim() as Language;
      if ((LANGUAGES as readonly string[]).includes(lang)) {
        ctx.config.language = lang;
        ctx.persist();
        ctx.print(`✓ language → ${LANGUAGE_LABELS[lang]}`);
        return;
      }
      const list = LANGUAGES.map((l) => `${l}(${LANGUAGE_LABELS[l]})`).join(', ');
      ctx.print(`Available languages: ${list}`);
    },
  },
  {
    name: 'status',
    description: '状态信息 / status',
    handler: (_args, ctx) => {
      ctx.print(
        [
          `mcode v${packageJson.version}`,
          `model: ${ctx.getModel() || '(none)'}`,
          `mode: ${ctx.getMode()}`,
          `language: ${ctx.config.language}`,
          `cwd: ${ctx.cwd}`,
        ].join('\n'),
      );
    },
  },
  {
    name: 'doctor',
    description: '诊断配置 / diagnose setup',
    handler: (_args, ctx) => {
      const provider = getActiveProvider(ctx.config);
      const apiKeyOk = provider ? resolveApiKey(provider) !== null : false;
      ctx.print(
        [
          `config: ${configPath()} ${existsSync(configPath()) ? '✓' : '✗'}`,
          `provider: ${provider ? provider.name : '✗ none'}`,
          `apiKey env (${provider?.apiKeyEnv ?? '-'}): ${apiKeyOk ? '✓ set' : '✗ missing'}`,
        ].join('\n'),
      );
    },
  },
  {
    name: 'save',
    description: '导出会话快照 / export snapshot',
    handler: (_args, ctx) => {
      const path = ctx.exportSnapshot();
      if (path) ctx.print(`✓ snapshot → ${path}`);
    },
  },
  {
    name: 'resume',
    description: '恢复历史会话 / resume session',
    handler: (_args, ctx) => {
      ctx.openResumePicker();
    },
  },
  {
    name: 'init',
    description: '生成 MCODE.md / generate MCODE.md',
    handler: (_args, ctx) => {
      const { path, created } = initMcodeDoc(ctx.cwd);
      ctx.print(created ? `✓ created ${path}` : `ℹ already exists: ${path}`);
    },
  },
  {
    name: 'memory',
    description: '查看 MCODE.md 文档 / memory docs',
    handler: (_args, ctx) => {
      const docs = findMcodeDocs(ctx.cwd);
      if (docs.length === 0) {
        ctx.print('no MCODE.md found — run /init to create one');
        return;
      }
      const lines = docs.map((d) => `${d.scope === 'global' ? '🌐' : '📁'} ${d.path} (${d.content.length} chars)`);
      ctx.print(['MCODE.md docs:', ...lines].join('\n'));
    },
  },
  {
    name: 'goal',
    description: '设置目标并持续工作直到达成 / set a goal',
    argHint: '<目标描述 | clear>',
    handler: (args, ctx) => {
      const text = args.trim();
      if (text.length === 0) {
        ctx.print('usage: /goal <目标描述> 或 /goal clear');
        return;
      }
      if (text === 'clear') {
        ctx.setGoal(null);
        ctx.print('✓ goal cleared');
        return;
      }
      ctx.setGoal(text);
      ctx.print(`✓ goal active: ${text}`);
      ctx.runPrompt(`[goal] ${text}\n请围绕这个目标开展工作，直到目标完全达成。`);
    },
  },
  {
    name: 'exit',
    description: '退出 / exit',
    handler: () => {
      process.exit(0);
    },
  },
];

function stubHandler(description: string) {
  return (_args: string, ctx: CommandContext): void => {
    ctx.print(`ℹ ${description} — stub: not yet supported in this build`);
  };
}

const STUBS: Array<[string, string]> = [
  ['context', '上下文占用 / context usage'],
  ['export', '导出会话 / export conversation'],
  ['rewind', '回退检查点 / rewind checkpoint'],
  ['todos', '任务列表 / todos'],
  ['copy', '复制最后回复 / copy last reply'],
  ['config', '配置面板 / config panel'],
  ['permissions', '权限规则 / permission rules'],
  ['agents', 'subagent 管理 / subagents'],
  ['hooks', 'hook 管理 / hooks'],
  ['mcp', 'MCP 管理 / MCP servers'],

  ['add-dir', '追加工作目录 / add dir'],
  ['vim', 'vim 模式 / vim mode'],
  ['terminal-setup', '终端按键适配 / terminal setup'],
  ['statusline', '状态栏配置 / statusline'],
  ['output-style', '输出风格 / output style'],
  ['login', '配置供应商 / provider config'],
  ['logout', '清除供应商 / clear provider'],
  ['bug', '问题反馈 / report bug'],
  ['release-notes', '版本说明 / release notes'],
];

const STUB_COMMANDS: Command[] = STUBS.map(([name, description]) => ({
  name,
  description,
  stub: true,
  handler: stubHandler(description),
}));

export const ALL_COMMANDS: Command[] = [...BUILTIN_COMMANDS, ...STUB_COMMANDS];

/** /skill-name → inject skill body into the next turn. */
export function createSkillCommands(
  skills: Array<{ name: string; description: string; body: string }>,
): Command[] {
  return skills.map((skill) => ({
    name: skill.name,
    description: `skill: ${skill.description || 'no description'}`,
    argHint: '[args]',
    handler: (args, ctx) => {
      const task = args.trim();
      const prompt = [`[skill: ${skill.name}]`, skill.body, '', task.length > 0 ? `Task: ${task}` : 'Follow the skill instructions.'].join('\n');
      ctx.runPrompt(prompt);
    },
  }));
}

export function createCommandList(): Command[] {
  return ALL_COMMANDS;
}
