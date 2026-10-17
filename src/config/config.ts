/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  configPath,
  mcodeDir,
  DEFAULT_MODE,
  detectLanguage,
  type Language,
  type Mode,
} from './constants.js';

export interface ProviderConfig {
  name: string;
  baseURL: string;
  /** Environment variable name holding the key — never the key itself. */
  apiKeyEnv: string;
  models: string[];
  /** Models that accept image input (multimodal). Unmarked models never receive images. */
  multimodalModels?: string[];
}

export interface McodeConfig {
  /** PUA closure discipline active in every session (/pua:on). */
  puaAlwaysOn?: boolean;
  language: Language;
  activeProvider: string | null;
  /** Currently selected model within the active provider. */
  activeModel: string | null;
  providers: ProviderConfig[];
  defaultMode: Mode;
}

export function emptyConfig(langEnv?: string): McodeConfig {
  return {
    language: detectLanguage(langEnv),
    activeProvider: null,
    activeModel: null,
    providers: [],
    defaultMode: DEFAULT_MODE,
    puaAlwaysOn: false,
  };
}

export function loadConfig(langEnv?: string): McodeConfig {
  if (!existsSync(configPath())) return emptyConfig(langEnv);
  try {
    const raw = JSON.parse(readFileSync(configPath(), 'utf8')) as Partial<McodeConfig>;
    const base = emptyConfig(langEnv);
    return {
      language: raw.language ?? base.language,
      activeProvider: raw.activeProvider ?? null,
      activeModel: raw.activeModel ?? null,
      providers: Array.isArray(raw.providers)
        ? raw.providers.map((pr) => ({ ...pr, multimodalModels: pr.multimodalModels ?? [] }))
        : [],
      defaultMode: raw.defaultMode ?? base.defaultMode,
      puaAlwaysOn: raw.puaAlwaysOn ?? false,
    };
  } catch {
    // Corrupted config: fall back to empty rather than crashing the CLI.
    return emptyConfig(langEnv);
  }
}

export function saveConfig(config: McodeConfig): void {
  mkdirSync(dirname(configPath()), { recursive: true });
  writeFileSync(configPath(), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

export function ensureMcodeDir(): void {
  if (!existsSync(mcodeDir())) mkdirSync(mcodeDir(), { recursive: true });
}

export function getActiveProvider(config: McodeConfig): ProviderConfig | null {
  if (!config.activeProvider) return null;
  return config.providers.find((p) => p.name === config.activeProvider) ?? null;
}

const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Resolve the API key for a provider. Two modes:
 * 1. preferred — `apiKeyEnv` holds an environment variable NAME
 * 2. fallback — the stored value is itself a literal key (not a valid env
 *    name), used as-is so pasting a key during setup still works.
 */
export function resolveApiKey(provider: ProviderConfig): string | null {
  const value = provider.apiKeyEnv;
  if (!value || value.length === 0) return null;
  const fromEnv = process.env[value];
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  if (!ENV_NAME_PATTERN.test(value)) return value;
  return null;
}

export function resolveActiveModel(config: McodeConfig): string {
  if (config.activeModel) return config.activeModel;
  const provider = getActiveProvider(config);
  return provider?.models[0] ?? '';
}

export type ProviderIssue =
  | { kind: 'none' }
  | { kind: 'no-provider' }
  | { kind: 'no-api-key'; provider: ProviderConfig };

/**
 * Single source of truth for "can we call the model right now?" —
 * evaluated per turn, never cached at startup.
 */
export function providerIssue(config: McodeConfig): ProviderIssue {
  const provider = getActiveProvider(config);
  if (!provider) return { kind: 'no-provider' };
  if (resolveApiKey(provider) === null) return { kind: 'no-api-key', provider };
  return { kind: 'none' };
}

/** Whether the given model is explicitly marked as multimodal (image-capable). */
export function isMultimodalModel(config: McodeConfig, model: string): boolean {
  const provider = getActiveProvider(config);
  if (!provider) return false;
  return (provider.multimodalModels ?? []).some((m) => m === model);
}

/** Always-on PUA directive: condensed closure discipline for the system prompt. */
export function buildPuaDirective(puaSkillBody: string | null): string {
  const head = [
    'PUA MODE: ALWAYS ON — apply this productivity discipline to EVERY task in this session:',
    '- 闭环红线: never self-report completion. Evidence (test/build/curl output) or it did not happen.',
    '- 事实驱动: verify with tools before attributing failures to the environment.',
    '- 穷尽一切: try 5 materially different approaches before declaring anything impossible.',
    '- Owner 意识: one problem in, check for the whole class of problems out; verify upstream and downstream.',
  ];
  if (puaSkillBody && puaSkillBody.trim().length > 0) {
    // full methodology available inline (bounded)
    return [...head, '', puaSkillBody.slice(0, 8000)].join('\n');
  }
  return head.join('\n');
}
