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
import { resolveActiveModel, isMultimodalModel } from '../config/config.js';
import { expandFileRefs } from '../util/file-refs.js';
import type { ModelUsage } from '../util/token-usage.js';

export interface TurnHandle {
  emit: (event: TurnEvent) => void;
  /** Image attachments for this turn. */
  attachments?: Array<{ path: string; dataUrl: string }>;
  confirm: (toolName: string) => Promise<boolean>;
  signal: AbortSignal;
  getMode: () => Mode;
}

export type TurnEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'reasoning_delta'; text: string; scope?: string }
  | { type: 'tool_start'; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; name: string; ok: boolean; detail: string }
  | { type: 'usage'; usage: { inputTokens: number; outputTokens: number; cachedTokens: number } }
  | { type: 'compacted'; note: string }
  | { type: 'retrying'; attempt: number; max: number; reason: string }
  | { type: 'done'; reply: string }
  | { type: 'error'; message: string };

export interface AppProps {
  config: McodeConfig;
  cwd: string;
  version: string;
  t: TFunction;
  commands: Command[];
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
  /** Transcript restored from a resumed session. */
  initialItems?: ChatItem[];
  listAgents: () => Array<{ name: string; description: string; source: string }>;
  listSkills: () => Array<{ name: string; source: string }>;
  historyStats: () => { cwdEntries: number; globalEntries: number; file: string };
  setPuaAlwaysOn: (on: boolean) => void;
  /** Fresh workspace scan — called every time the @ trigger opens. */
  listFilesAsync: () => Promise<CompletionItem[]>;
  /** Preloaded file list for the first '@' open. */
  initialFiles?: CompletionItem[];
}

export function App(props: AppProps): React.ReactElement {
  const [items, setItems] = useState<ChatItem[]>(props.initialItems ?? []);
  const [busy, setBusy] = useState(false);
  const [modeIndex, setModeIndex] = useState(MODES.indexOf(props.config.defaultMode));
  const modeRef = useRef<Mode>(props.config.defaultMode);
  const abortRef = useRef<AbortController | null>(null);
  const runTurnRef = useRef<((input: string) => void) | null>(null);
  const lastReasoningIdxRef = useRef<Record<string, number>>({});
  const reasoningBufRef = useRef<Record<string, string>>({});
  const reasoningFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_REASONING_CHARS = 30_000;
  const MAX_ITEMS = 300;
  // Transcript memory bound: drop oldest items past the cap.
  const pushCapped = (prev: ChatItem[], item: ChatItem): ChatItem[] => {
    const next = [...prev, item];
    if (next.length <= MAX_ITEMS) return next;
    const trimmed = next.slice(next.length - MAX_ITEMS);
    const first = trimmed[0]!;
    if (first.kind === 'system' && first.text.startsWith('… older')) return trimmed;
    return [{ kind: 'system', text: `… older transcript trimmed (${next.length - MAX_ITEMS} items) · /resume for full history` }, ...trimmed];
  };
  const [tokensUsed, setTokensUsed] = useState(0);
  const pendingConfirmRef = useRef<((allow: boolean) => void) | null>(null);
  const [permissionTool, setPermissionTool] = useState<string | null>(null);
  const [modelPicker, setModelPicker] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });
  const [goal, setGoalState] = useState<string | null>(null);
  const [phase, setPhase] = useState<'thinking' | 'writing'>('thinking');
  const [queued, setQueued] = useState<string | null>(null);
  const [reasoningExpanded, setReasoningExpanded] = useState(false);
  const [fileItems, setFileItems] = useState<CompletionItem[]>(props.initialFiles ?? []);
  const refreshFiles = useCallback((): void => {
    void props.listFilesAsync().then((items) => setFileItems(items));
  }, [props]);
  const assistantBufRef = useRef('');
  const activityRef = useRef<ActivityCounts>({});
  const reasoningSeenRef = useRef(false);
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
  useInput((input, key) => {
    if (key.ctrl && input === 'o') {
      setReasoningExpanded((v) => !v);
    }
  }, { isActive: true });

  const print = useCallback((text: string) => {
    setItems((prev) => pushCapped(prev, { kind: 'system', text }));
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
    (input: string, images?: Array<{ path: string; dataUrl: string }>) => {
      setItems((prev) => pushCapped(prev, { kind: 'user', text: input }));
      setBusy(true);
      assistantBufRef.current = '';
      activityRef.current = {};
      reasoningSeenRef.current = false;
      lastReasoningIdxRef.current = {};
      setPhase('thinking');
      stageStartRef.current = Date.now();
      turnStartRef.current = Date.now();
      const controller = new AbortController();
      abortRef.current = controller;
      const emit = (event: TurnEvent): void => {
        switch (event.type) {
          case 'reasoning_delta': {
            reasoningSeenRef.current = true;
            setItems((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.kind === 'reasoning') {
                return [...prev.slice(0, -1), { kind: 'reasoning', text: last.text + event.text }];
              }
              return [...prev, { kind: 'reasoning', text: event.text }];
            });
            break;
          }
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

              }
              const last = next[next.length - 1];
              const text = assistantBufRef.current;
              if (last && last.kind === 'assistant') {
                return [...next.slice(0, -1), { kind: 'assistant', text }];
              }
              return pushCapped(next, { kind: 'assistant', text });
            });
            break;
          }
          case 'tool_start':
            assistantBufRef.current = '';
            activityRef.current[event.name] = (activityRef.current[event.name] ?? 0) + 1;
            setItems((prev) => pushCapped(prev, { kind: 'tool', name: event.name, detail: '(running)', ok: true }));
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
          case 'usage':
            setTokensUsed((t) => t + event.usage.inputTokens + event.usage.outputTokens);
            break;
          case 'retrying':
            print(`⟳ stream interrupted (${event.reason}) — retrying ${event.attempt}/${event.max}`);
            break;
          case 'compacted':
            print(`✓ ${event.note}`);
            break;
          case 'done':
            if (event.reply.length > 0 && assistantBufRef.current.length === 0) {
              setItems((prev) => pushCapped(prev, { kind: 'assistant', text: event.reply }));
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
        .runTurn(input, { emit, confirm, signal: controller.signal, getMode: () => modeRef.current, attachments: images })
        .then(() => {
          setBusy(false);
          setQueued((pending) => {
            if (pending === null) return null;
            // run the interjection after state settles
            setTimeout(() => runTurnRef.current?.(pending), 30);
            return null;
          });
        })
        .catch((err: unknown) => {
          print(`✗ ${err instanceof Error ? err.message : String(err)}`);
          setBusy(false);
        });
    },
    [props, print],
  );
  runTurnRef.current = runTurn;

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
        const images = expanded.attachments;
        const model = resolveActiveModel(props.config);
        if (images.length > 0 && !isMultimodalModel(props.config, model)) {
          print(
            [
              `⚠ model '${model}' is not marked multimodal — image(s) not sent: ${images.map((a) => a.path).join(', ')}`,
              `  enable in ~/.mcode/config.json:`,
              `  "multimodalModels": ["${model}"]  (inside the active provider)`,
            ].join('\n'),
          );
          runTurn(expanded.text);
          return;
        }
        if (images.length > 0) {
          print(`✓ attached image(s): ${images.map((a) => a.path).join(', ')}`);
        }
        runTurn(expanded.text, images);
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
      <MessageList items={items} reasoningExpanded={reasoningExpanded} />
      <StatusBar
        active={busy}
        startedAt={stageStartRef.current}
        phase={phase}
        tokensUsed={tokensUsed}
        runningCommand={goal ? '/goal active' : null}
      />
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
      <ModeHint mode={mode} label={props.t('modeHint')} danger={mode === 'passon'} />
      {queued ? (
        <Box paddingX={1}>
          <Text dimColor>⏎ queued: {queued}</Text>
        </Box>
      ) : null}
      <InputBox
        inputActive={!modelPicker.open}
        busy={busy}
        cwd={props.cwd}
        t={props.t}
        commandItems={commandItems}
        fileItems={fileItems}
        onAtTrigger={refreshFiles}
        onSubmit={handleSubmit}
        onQueue={(text) => setQueued(text)}
        onCycleMode={cycleMode}
        onAbort={() => abortRef.current?.abort()}
      />
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
    listAgents: props.listAgents,
    listSkills: props.listSkills,
    historyStats: props.historyStats,
    setPuaAlwaysOn: (on: boolean) => {
      config.puaAlwaysOn = on;
      props.saveConfig();
    },
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
