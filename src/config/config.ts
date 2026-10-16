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
}

export interface McodeConfig {
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
      providers: Array.isArray(raw.providers) ? raw.providers : [],
      defaultMode: raw.defaultMode ?? base.defaultMode,
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
