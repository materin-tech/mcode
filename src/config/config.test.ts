/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { providerIssue, resolveApiKey, isMultimodalModel, buildPuaDirective } from './config.js';
import type { McodeConfig } from './config.js';

function cfg(apiKeyEnv: string | null): McodeConfig {
  return {
    language: 'en_US',
    activeProvider: apiKeyEnv === null ? null : 'glm',
    activeModel: 'glm-5.3-flash',
    providers: apiKeyEnv === null
      ? []
      : [{ name: 'glm', baseURL: 'https://api.glm/v1', apiKeyEnv, models: ['glm-5.3-flash'] }],
    defaultMode: 'passon',
  };
}

describe('providerIssue', () => {
  const savedEnv = process.env['GLM_TEST_KEY'];
  afterEach(() => {
    if (savedEnv === undefined) delete process.env['GLM_TEST_KEY'];
    else process.env['GLM_TEST_KEY'] = savedEnv;
  });

  it('no issue when provider + key env present', () => {
    process.env['GLM_TEST_KEY'] = 'sk-x';
    expect(providerIssue(cfg('GLM_TEST_KEY')).kind).toBe('none');
  });

  it('no-provider when activeProvider missing', () => {
    expect(providerIssue(cfg(null)).kind).toBe('no-provider');
  });

  it('no-api-key (with env name) when key env is missing — the switch-glm bug', () => {
    delete process.env['GLM_TEST_KEY'];
    const issue = providerIssue(cfg('GLM_TEST_KEY'));
    expect(issue.kind).toBe('no-api-key');
    expect(issue.kind === 'no-api-key' && issue.provider.apiKeyEnv).toBe('GLM_TEST_KEY');
  });

  it('treats empty-string env value as missing', () => {
    process.env['GLM_TEST_KEY'] = '';
    expect(providerIssue(cfg('GLM_TEST_KEY')).kind).toBe('no-api-key');
  });

  it('uses a pasted literal key when the value is not a valid env name', () => {
    // regression: user pasted their GLM key into the apiKeyEnv field
    const config = cfg('b6beeacd-demo-key.5x6Rj');
    expect(providerIssue(config).kind).toBe('none');
    expect(resolveApiKey(config.providers[0]!)).toBe('b6beeacd-demo-key.5x6Rj');
  });

  it('a valid env name that is unset still reports no-api-key (no silent fallback)', () => {
    delete process.env['UNSET_NAME_X'];
    expect(providerIssue(cfg('UNSET_NAME_X')).kind).toBe('no-api-key');
  });
});

describe('isMultimodalModel', () => {
  it('returns true only for models explicitly marked', () => {
    const config = cfg('K');
    config.providers[0]!.multimodalModels = ['glm-5.3-flash'];
    expect(isMultimodalModel(config, 'glm-5.3-flash')).toBe(true);
    expect(isMultimodalModel(config, 'text-only-model')).toBe(false);
  });

  it('unmarked provider means no model is multimodal', () => {
    expect(isMultimodalModel(cfg('K'), 'glm-5.3-flash')).toBe(false);
  });
});

describe('buildPuaDirective', () => {
  it('includes closure red lines and the skill body when available', () => {
    const d = buildPuaDirective('skill body content');
    expect(d).toContain('PUA MODE: ALWAYS ON');
    expect(d).toContain('闭环红线');
    expect(d).toContain('skill body content');
  });

  it('works without a skill body', () => {
    expect(buildPuaDirective(null)).toContain('PUA MODE: ALWAYS ON');
  });
});
