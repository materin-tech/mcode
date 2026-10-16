/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expect } from 'vitest';
import { guardPath, clampOutput } from './guard.js';

describe('guardPath', () => {
  const cwd = '/tmp/ws';

  it('resolves relative path inside workspace', () => {
    expect(guardPath('src/a.ts', cwd)).toBe('/tmp/ws/src/a.ts');
  });

  it('allows paths inside the workspace', () => {
    expect(guardPath('/tmp/ws/sub/b.txt', cwd)).toBe('/tmp/ws/sub/b.txt');
  });

  it('blocks path traversal outside workspace', () => {
    expect(guardPath('../outside.txt', cwd)).toBeNull();
    expect(guardPath('/etc/passwd', cwd)).toBeNull();
    expect(guardPath('~/x', cwd)).toBeNull();
  });

  it('allows the workspace root itself', () => {
    expect(guardPath('.', cwd)).toBe('/tmp/ws');
  });

  it('expands ~ relative to HOME only when HOME inside cwd (never)', () => {
    // HOME is outside any workspace by default in tests
    expect(guardPath('~', cwd)).toBeNull();
  });
});

describe('clampOutput', () => {
  it('keeps short output', () => {
    expect(clampOutput('abc')).toBe('abc');
  });
  it('truncates long output with marker', () => {
    const out = clampOutput('x'.repeat(100), 10);
    expect(out).toContain('[truncated');
  });
});
