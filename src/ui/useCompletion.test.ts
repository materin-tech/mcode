/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expect } from 'vitest';
import { completionReducer, initCompletion, detectTrigger } from './useCompletion.js';
import type { CompletionItem } from './useCompletion.js';

function items(): CompletionItem[] {
  return [
    { insertValue: 'help', label: '/help' },
    { insertValue: 'hello', label: '/hello' },
    { insertValue: 'clear', label: '/clear' },
  ];
}

describe('completionReducer', () => {
  it('opens with query and resets selection', () => {
    let state = initCompletion();
    state = completionReducer(state, { type: 'open', trigger: '/', query: 'he' });
    expect(state).toEqual({ trigger: '/', query: 'he', selectedIndex: 0 });
  });

  it('move wraps around both directions', () => {
    let state = completionReducer(initCompletion(), { type: 'open', trigger: '/', query: '' });
    state = completionReducer(state, { type: 'move', delta: 1, count: 3 });
    expect(state.selectedIndex).toBe(1);
    state = completionReducer(state, { type: 'move', delta: -1, count: 3 });
    expect(state.selectedIndex).toBe(0);
    state = completionReducer(state, { type: 'move', delta: -1, count: 3 });
    expect(state.selectedIndex).toBe(2);
    state = completionReducer(state, { type: 'move', delta: 1, count: 3 });
    expect(state.selectedIndex).toBe(0);
  });

  it('close returns to initial state', () => {
    let state = completionReducer(initCompletion(), { type: 'open', trigger: '@', query: 'a' });
    state = completionReducer(state, { type: 'close' });
    expect(state).toEqual(initCompletion());
  });
});

describe('detectTrigger', () => {
  it('detects slash at position 0', () => {
    expect(detectTrigger('/')).toEqual({ trigger: '/', query: '' });
    expect(detectTrigger('/he')).toEqual({ trigger: '/', query: 'he' });
  });

  it('does not treat mid-word slash as trigger', () => {
    expect(detectTrigger('src/cli')).toBeNull();
  });

  it('detects @ after whitespace', () => {
    expect(detectTrigger('look @src/')).toEqual({ trigger: '@', query: 'src/' });
  });

  it('closes when query contains a space', () => {
    expect(detectTrigger('/help me')).toBeNull();
  });

  it('returns null when no trigger', () => {
    expect(detectTrigger('plain text')).toBeNull();
  });
});
