/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import type { McodeConfig } from '../config/config.js';
import type { Mode } from '../config/constants.js';
import type { ModelUsage } from '../util/token-usage.js';
import type { TFunction } from '../ui/locales.js';

export interface CommandContext {
  config: McodeConfig;
  cwd: string;
  t: TFunction;
  persist: () => void;
  print: (text: string) => void;
  clearConversation: () => void;
  compactNow: () => Promise<void>;
  setModel: (model: string) => void;
  getModel: () => string;
  getMode: () => Mode;
  setMode: (mode: Mode) => void;
  getUsage: () => ModelUsage[];
  startProviderGuide: () => void;
  exportSnapshot: () => string | null;
  /** Run a composed prompt (e.g. a skill body) as an agent turn. */
  runPrompt: (text: string) => void;
  /** Open the interactive model picker. */
  openModelPicker: () => void;
  /** Set/clear the session goal (null clears). */
  setGoal: (text: string | null) => void;
  openResumePicker: () => void;
}

export interface Command {
  name: string;
  description: string;
  argHint?: string;
  stub?: boolean;
  handler: (args: string, ctx: CommandContext) => void | Promise<void>;
}

export function parseCommand(input: string): { name: string; args: string } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;
  const space = trimmed.indexOf(' ');
  const name = space === -1 ? trimmed.slice(1) : trimmed.slice(1, space);
  const args = space === -1 ? '' : trimmed.trim().slice(space + 1).trim();
  if (name.length === 0) return null;
  return { name, args };
}

export function matchCommands(commands: Command[], query: string): Command[] {
  const q = query.trim().toLowerCase();
  return commands.filter((c) => c.name.toLowerCase().startsWith(q));
}
