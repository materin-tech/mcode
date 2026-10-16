/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { useCallback, useMemo, useReducer } from 'react';

export type Trigger = '/' | '@' | null;

export interface CompletionState {
  trigger: Trigger;
  query: string;
  selectedIndex: number;
}

export type CompletionAction =
  | { type: 'open'; trigger: '/' | '@'; query: string }
  | { type: 'query'; query: string }
  | { type: 'close' }
  | { type: 'move'; delta: number; count: number }
  | { type: 'select'; index: number };

export function initCompletion(): CompletionState {
  return { trigger: null, query: '', selectedIndex: 0 };
}

export function completionReducer(state: CompletionState, action: CompletionAction): CompletionState {
  switch (action.type) {
    case 'open':
      return { trigger: action.trigger, query: action.query, selectedIndex: 0 };
    case 'query':
      return { ...state, query: action.query, selectedIndex: 0 };
    case 'close':
      return initCompletion();
    case 'move':
      if (state.trigger === null || action.count === 0) return state;
      return {
        ...state,
        selectedIndex: (state.selectedIndex + action.delta + action.count) % action.count,
      };
    case 'select':
      return { ...state, selectedIndex: action.index };
    default:
      return state;
  }
}

export interface CompletionItem {
  /** Value inserted on tab. */
  insertValue: string;
  label: string;
  description?: string;
}

export function detectTrigger(text: string): { trigger: '/' | '@'; query: string } | null {
  // The rightmost *valid* trigger wins: a '/' inside an '@src/' path query
  // must not shadow the '@' that started it.
  const candidates: Array<{ trigger: '/' | '@'; idx: number }> = [];
  const slash = text.lastIndexOf('/');
  const at = text.lastIndexOf('@');
  for (const [char, idx] of [['/', slash], ['@', at]] as const) {
    if (idx === -1) continue;
    const before = idx === 0 ? ' ' : text[idx - 1]!;
    if (!(idx === 0 || /\s/.test(before))) continue;
    const query = text.slice(idx + 1);
    if (query.includes(' ')) continue;
    candidates.push({ trigger: char as '/' | '@', idx });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.idx - a.idx);
  const winner = candidates[0]!;
  return { trigger: winner.trigger, query: text.slice(winner.idx + 1) };
}

/**
 * Drives the '/' and '@' completion state machine. Every key event only
 * updates state; the panel renders purely from state. Root-cause fix for
 * the earlier @/tab regressions: one state machine, no one-shot UI.
 */
export function useCompletion(commandItems: CompletionItem[], fileItems: CompletionItem[]): {
  state: CompletionState;
  visible: CompletionItem[];
  handleTextChange: (text: string) => void;
  handleTab: (currentText: string) => string | null;
  handleArrow: (direction: 'up' | 'down') => boolean;
  close: () => void;
} {
  const [state, dispatch] = useReducer(completionReducer, undefined, initCompletion);

  const visible = useMemo(() => {
    if (state.trigger === null) return [];
    const q = state.query.toLowerCase();
    if (state.trigger === '@') {
      return fileItems.filter((it) => it.insertValue.toLowerCase().includes(q));
    }
    return commandItems.filter((it) => it.insertValue.toLowerCase().startsWith(q));
  }, [commandItems, fileItems, state.trigger, state.query]);

  const handleTextChange = useCallback(
    (text: string) => {
      const detected = detectTrigger(text);
      if (detected === null) {
        if (state.trigger !== null) dispatch({ type: 'close' });
        return;
      }
      if (detected.trigger !== state.trigger || state.trigger === null) {
        dispatch({ type: 'open', trigger: detected.trigger, query: detected.query });
      } else {
        dispatch({ type: 'query', query: detected.query });
      }
    },
    [state.trigger],
  );

  const handleTab = useCallback(
    (currentText: string): string | null => {
      if (state.trigger === null) return null;
      const selected = visible[state.selectedIndex];
      if (!selected) return null;
      const detected = detectTrigger(currentText);
      if (detected === null) return null;
      const slash = currentText.lastIndexOf('/');
      const at = currentText.lastIndexOf('@');
      const idx = Math.max(slash, at);
      const insert = selected.insertValue;
      if (state.trigger === '@') {
        return `${currentText.slice(0, idx + 1)}${insert} `;
      }
      return `${currentText.slice(0, idx + 1)}${insert}`;
    },
    [state.trigger, state.selectedIndex, visible],
  );

  const handleArrow = useCallback(
    (direction: 'up' | 'down'): boolean => {
      if (state.trigger === null || visible.length === 0) return false;
      dispatch({ type: 'move', delta: direction === 'up' ? -1 : 1, count: visible.length });
      return true;
    },
    [state.trigger, visible.length],
  );

  const close = useCallback(() => {
    if (state.trigger !== null) dispatch({ type: 'close' });
  }, [state.trigger]);

  return { state, visible, handleTextChange, handleTab, handleArrow, close };
}
