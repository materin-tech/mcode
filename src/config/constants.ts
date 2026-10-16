/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

/** Paths are computed at call time so tests can stub HOME via vi.stubEnv. */
export function mcodeDir(): string {
  return join(homedir(), '.mcode');
}
export function configPath(): string {
  return join(mcodeDir(), 'config.json');
}
export function historyPath(): string {
  return join(mcodeDir(), 'history.jsonl');
}
export function sessionDataDir(): string {
  return join(mcodeDir(), 'session-data');
}
export function projectsDir(): string {
  return join(mcodeDir(), 'projects');
}

export const DEFAULT_MODE = 'passon' as const;

export const MODES = ['passon', 'manual', 'auto', 'plan'] as const;
export type Mode = (typeof MODES)[number];

export const LANGUAGES = ['zh_CN', 'zh_TW', 'en_US', 'ja_JP', 'ko_KR'] as const;
export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<Language, string> = {
  zh_CN: '简体中文',
  zh_TW: '繁體中文',
  en_US: 'English',
  ja_JP: '日本語',
  ko_KR: '한국어',
};

/** Context window guard: start compaction beyond this many estimated tokens. */
export const COMPACT_THRESHOLD_TOKENS = 100_000;
/** Rough estimate: 1 token ~= 4 chars for mixed CJK/EN. */
export const CHARS_PER_TOKEN = 4;

export const BASH_TIMEOUT_MS = 120_000;
export const MAX_TOOL_OUTPUT_CHARS = 30_000;
/** Max chars of a file injected via @path reference. */
export const MAX_AT_FILE_CHARS = 50_000;

export function detectLanguage(langEnv: string | undefined): Language {
  if (langEnv && langEnv.toLowerCase().startsWith('zh_tw')) return 'zh_TW';
  if (langEnv && langEnv.toLowerCase().startsWith('zh')) return 'zh_CN';
  if (langEnv && langEnv.toLowerCase().startsWith('ja')) return 'ja_JP';
  if (langEnv && langEnv.toLowerCase().startsWith('ko')) return 'ko_KR';
  return 'en_US';
}
