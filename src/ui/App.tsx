/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import React, { useCallback, useRef, useState } from 'react';
import { Box, Text } from 'ink';
import { Banner } from './Banner.js';
import { MessageList } from './MessageList.js';
import { InputBox } from './InputBox.js';
import { CompletionPanel } from './CompletionPanel.js';
import { StatusBar, ModeHint } from './StatusBar.js';
import { PermissionPrompt } from './PermissionPrompt.js';
import { GuidedSetup, type GuideResult } from './GuidedSetup.js';
import { useCompletion, type CompletionItem } from './useCompletion.js';
import { ModelPicker } from './ModelPicker.js';
import { useInput } from 'ink';
import type { ChatItem } from './types.js';
import type { TFunction } from './locales.js';
import type { McodeConfig } from '../config/config.js';
import { MODES, type Mode } from '../config/constants.js';
import type { Command, CommandContext } from '../commands/index.js';
import { parseCommand } from '../commands/index.js';
import { summarizeActivity, formatDuration, clockNow, type ActivityCounts } from '../util/activity.js';
import { resolveActiveModel } from '../config/config.js';
import { expandFileRefs } from '../util/file-refs.js';
import type { ModelUsage } from '../util/token-usage.js';

export interface TurnHandle {
  emit: (event: TurnEvent) => void;
  confirm: (toolName: string) => Promise<boolean>;
  signal: AbortSignal;
  getMode: () => Mode;
}

export type TurnEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_start'; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; name: string; ok: boolean; detail: string }
  | { type: 'usage'; usage: { inputTokens: number; outputTokens: number; cachedTokens: number } }
  | { type: 'compacted'; note: string }
  | { type: 'done'; reply: string }
  | { type: 'error'; message: string };

export interface AppProps {
  config: McodeConfig;
  cwd: string;
  version: string;
  t: TFunction;
  commands: Command[];
  listFiles: () => CompletionItem[];
  runTurn: (input: string, handle: TurnHandle) => Promise<void>;
  onModeChange?: (mode: Mode) => void;
  onLanguageChange?: (lang: string) => void;
  saveConfig: () => void;
  getUsage: () => ModelUsage[];
  onClear?: () => void;
  onCompact?: () => Promise<void>;
  onSnapshot?: () => string | null;
  onResumeList?: () => string[];
  /** Sync the session goal to the agent layer. */
  onGoalChange?: (text: string | null) => void;
}

export function App(props: AppProps): React.ReactElement {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [modeIndex, setModeIndex] = useState(MODES.indexOf(props.config.defaultMode));
  const modeRef = useRef<Mode>(props.config.defaultMode);
  const abortRef = useRef<AbortController | null>(null);
  const pendingConfirmRef = useRef<((allow: boolean) => void) | null>(null);
  const [permissionTool, setPermissionTool] = useState<string | null>(null);
  const [modelPicker, setModelPicker] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });
  const [goal, setGoalState] = useState<string | null>(null);
  const assistantBufRef = useRef('');
  const activityRef = useRef<ActivityCounts>({});
  const stageStartRef = useRef<number>(Date.now());
  const turnStartRef = useRef<number>(Date.now());

  const mode = MODES[modeIndex]!;

  const providerModels = props.config.providers.find((p) => p.name === props.config.activeProvider)?.models ?? [];
  useInput((input, key) => {
    if (!modelPicker.open) return;
    if (key.upArrow) setModelPicker((s) => ({ ...s, index: (s.index - 1 + providerModels.length) % providerModels.length }));
    else if (key.downArrow) setModelPicker((s) => ({ ...s, index: (s.index + 1) % providerModels.length }));
    else if (key.return) {
      const model = providerModels[modelPicker.index];
      if (model) {
        props.config.activeModel = model;
        props.saveConfig();
        print(`✓ model → ${model}`);
      }
      setModelPicker({ open: false, index: 0 });
    } else if (key.escape) {
      setModelPicker({ open: false, index: 0 });
    }
  }, { isActive: modelPicker.open });

  const print = useCallback((text: string) => {
    setItems((prev) => [...prev, { kind: 'system', text }]);
  }, []);

  const cycleMode = useCallback(() => {
    setModeIndex((i) => {
      const next = (i + 1) % MODES.length;
      modeRef.current = MODES[next]!;
      props.onModeChange?.(MODES[next]!);
      return next;
    });
  }, [props]);

  const runTurn = useCallback(
    (input: string) => {
      setItems((prev) => [...prev, { kind: 'user', text: input }]);
      setBusy(true);
      assistantBufRef.current = '';
      activityRef.current = {};
      stageStartRef.current = Date.now();
      turnStartRef.current = Date.now();
      const controller = new AbortController();
      abortRef.current = controller;
      const emit = (event: TurnEvent): void => {
        switch (event.type) {
          case 'text_delta': {
            const isFirstOfStage = assistantBufRef.current.length === 0;
            assistantBufRef.current += event.text;
            setItems((prev) => {
              let next = prev;
              if (isFirstOfStage) {
                // activity summary for the tool round that just finished
                const summary = summarizeActivity(activityRef.current);
                if (summary.length > 0) {
                  next = [...next, { kind: 'activity', text: summary }];
                  activityRef.current = {};
                }
                // thinking time before the first token of the stage
                const thoughtSecs = Math.floor((Date.now() - stageStartRef.current) / 1000);
                if (thoughtSecs >= 1) {
                  next = [...next, { kind: 'thought', seconds: thoughtSecs }];
                }
              }
              const last = next[next.length - 1];
              const text = assistantBufRef.current;
              if (last && last.kind === 'assistant') {
                return [...next.slice(0, -1), { kind: 'assistant', text }];
              }
              return [...next, { kind: 'assistant', text }];
            });
            break;
          }
          case 'tool_start':
            assistantBufRef.current = '';
            activityRef.current[event.name] = (activityRef.current[event.name] ?? 0) + 1;
            setItems((prev) => [...prev, { kind: 'tool', name: event.name, detail: '(running)', ok: true }]);
            break;
          case 'tool_result':
            stageStartRef.current = Date.now();
            setItems((prev) => {
              const next = [...prev];
              for (let i = next.length - 1; i >= 0; i--) {
                const item = next[i]!;
                if (item.kind === 'tool' && item.name === event.name && item.detail === '(running)') {
                  next[i] = { kind: 'tool', name: event.name, detail: event.detail, ok: event.ok };
                  break;
                }
              }
              return next;
            });
            break;
          case 'compacted':
            print(`✓ ${event.note}`);
            break;
          case 'done':
            if (event.reply.length > 0 && assistantBufRef.current.length === 0) {
              setItems((prev) => [...prev, { kind: 'assistant', text: event.reply }]);
            }
            setItems((prev) => {
              const last = prev[prev.length - 1];
              if (last && (last.kind === 'footer')) return prev;
              const total = formatDuration((Date.now() - turnStartRef.current) / 1000);
              return [...prev, { kind: 'footer', text: `Cooked for ${total} · done ${clockNow()}` }];
            });
            break;
          case 'error':
            print(`✗ ${event.message}`);
            break;
        }
      };
      const confirm = (toolName: string): Promise<boolean> =>
        new Promise<boolean>((resolve) => {
          pendingConfirmRef.current = resolve;
          setPermissionTool(toolName);
        });
      props
        .runTurn(input, { emit, confirm, signal: controller.signal, getMode: () => modeRef.current })
        .then(() => setBusy(false))
        .catch((err: unknown) => {
          print(`✗ ${err instanceof Error ? err.message : String(err)}`);
          setBusy(false);
        });
    },
    [props, print],
  );

  const handleSubmit = useCallback(
    (input: string) => {
      const parsed = parseCommand(input);
      if (parsed !== null) {
        const command = props.commands.find((c) => c.name === parsed.name);
        if (!command) {
          print(`${props.t('commandNotFound')}: /${parsed.name}`);
          return;
        }
        const ctx: CommandContext = buildCommandContext(
          props, print, runTurn, mode, cycleMode, props.config,
          () => setItems([]),
          () => setModelPicker({ open: true, index: Math.max(0, providerModels.indexOf(resolveActiveModel(props.config))) }),
          (text) => {
            setGoalState(text);
            props.onGoalChange?.(text);
          },
        );
        void Promise.resolve(command.handler(parsed.args, ctx));
        return;
      }
      void expandFileRefs(input, props.cwd).then((expanded) => {
        if (expanded.injected.length > 0) {
          print(`✓ injected file refs: ${expanded.injected.join(', ')}`);
        }
        if (expanded.missing.length > 0) {
          print(`⚠ missing file refs: ${expanded.missing.join(', ')}`);
        }
        runTurn(expanded.text);
      });
    },
    [props, print, runTurn, mode, cycleMode],
  );

  if (props.config.providers.length === 0) {
    return (
      <GuidedSetup
        t={props.t}
        defaultLanguage={props.config.language}
        onComplete={(result: GuideResult) => {
          props.config.language = result.language;
          props.config.providers = [result.provider];
          props.config.activeProvider = result.provider.name;
          props.config.activeModel = result.provider.models[0] ?? null;
          props.config.defaultMode = result.defaultMode;
          props.saveConfig();
          props.onLanguageChange?.(result.language);
          setItems((prev) => [...prev, { kind: 'system', text: props.t('guideDone') }]);
        }}
      />
    );
  }

  const commandItems: CompletionItem[] = props.commands.map((c) => ({
    insertValue: c.name,
    label: `/${c.name}`,
    description: c.description,
  }));

  return (
    <Box flexDirection="column" minHeight={12}>
      <Banner
        version={props.version}
        cwd={props.cwd}
        model={resolveActiveModel(props.config) || 'no model'}
        mode={mode}
        warning={props.config.activeProvider === null ? props.t('noProviderWarning') : null}
        hint={props.t('bannerHint')}
      />
      <MessageList items={items} />
      <StatusBar thinking={busy} runningCommand={goal ? '/goal active' : null} thinkingLabel={props.t('thinking')} />
      {permissionTool !== null ? (
        <PermissionPrompt
          toolName={permissionTool}
          onDecide={(allow) => {
            pendingConfirmRef.current?.(allow);
            pendingConfirmRef.current = null;
            setPermissionTool(null);
          }}
        />
      ) : null}
      {modelPicker.open ? (
        <ModelPicker models={providerModels} selectedIndex={modelPicker.index} />
      ) : null}
      <InputBox
        inputActive={!modelPicker.open}
        busy={busy}
        cwd={props.cwd}
        t={props.t}
        commandItems={commandItems}
        listFiles={props.listFiles}
        onSubmit={handleSubmit}
        onCycleMode={cycleMode}
        onAbort={() => abortRef.current?.abort()}
      />
      <ModeHint mode={mode} label={props.t('modeHint')} danger={mode === 'passon'} />
    </Box>
  );
}

function buildCommandContext(
  props: AppProps,
  print: (text: string) => void,
  runTurn: (input: string) => void,
  mode: Mode,
  cycleMode: () => void,
  config: McodeConfig,
  clearTranscript: () => void,
  openModelPicker: () => void,
  setGoal: (text: string | null) => void,
): CommandContext {
  return {
    config,
    cwd: props.cwd,
    t: props.t,
    persist: (): void => props.saveConfig(),
    print,
    clearConversation: () => {
      clearTranscript();
      props.onClear?.();
      print('✓ context cleared');
    },
    compactNow: async () => {
      if (props.onCompact) {
        await props.onCompact();
        print('✓ history compacted');
      } else {
        print('✓ compact requested');
      }
    },
    setModel: (model: string) => {
      config.activeModel = model;
      props.saveConfig();
      print(`✓ model → ${model}`);
    },
    getModel: () => resolveActiveModel(config),
    getMode: () => mode,
    setMode: (next: Mode) => {
      if (next !== mode) cycleMode();
    },
    getUsage: props.getUsage,
    startProviderGuide: () => print('run: mcode add_provider <name>'),
    exportSnapshot: (): string | null => props.onSnapshot?.() ?? null,
    runPrompt: (text: string) => runTurn(text),
    openModelPicker,
    setGoal,
    openResumePicker: () => {
      const lines = props.onResumeList?.() ?? [];
      print(lines.length > 0 ? ['sessions:', ...lines].join('\n') : 'no sessions found');
    },
  };
}
