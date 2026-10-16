/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { useCallback, useRef, useState } from 'react';
import { appendInputHistory, readInputHistory } from '../util/input-history.js';

/**
 * ↑/↓ history recall, aligned with Linux shell behaviour:
 * - ↑ fills the input with the previous entry (cursor at end)
 * - ↓ walks forward; reaching the bottom restores the unsent draft
 * - typing/deleting exits recall mode
 * - history persists across sessions via ~/.mcode/history.jsonl
 */
export function useInputHistory(cwd: string, onSubmit: (text: string) => void): {
  text: string;
  setText: (t: string) => void;
  recallUp: () => void;
  recallDown: () => void;
  exitRecall: () => void;
  submit: () => void;
} {
  const [text, setText] = useState('');
  const entriesRef = useRef<string[]>([]);
  const indexRef = useRef<number>(-1);
  const draftRef = useRef<string>('');
  const recallingRef = useRef<boolean>(false);

  const recallUp = useCallback(() => {
    if (!recallingRef.current) {
      entriesRef.current = readInputHistory(cwd);
      draftRef.current = text;
      if (entriesRef.current.length === 0) return;
      recallingRef.current = true;
      indexRef.current = entriesRef.current.length - 1;
    } else if (indexRef.current > 0) {
      indexRef.current -= 1;
    } else {
      return;
    }
    setText(entriesRef.current[indexRef.current] ?? '');
  }, [cwd, text]);

  const recallDown = useCallback(() => {
    if (!recallingRef.current) return;
    if (indexRef.current < entriesRef.current.length - 1) {
      indexRef.current += 1;
      setText(entriesRef.current[indexRef.current] ?? '');
    } else {
      // bottom: restore the unsent draft
      recallingRef.current = false;
      indexRef.current = -1;
      setText(draftRef.current);
    }
  }, []);

  /** Any edit while recalling drops back to edit mode. */
  const exitRecall = useCallback(() => {
    recallingRef.current = false;
    indexRef.current = -1;
  }, []);

  const submit = useCallback(() => {
    const value = text.trim();
    if (value.length === 0) return;
    appendInputHistory(value, cwd);
    recallingRef.current = false;
    indexRef.current = -1;
    setText('');
    onSubmit(value);
  }, [cwd, onSubmit, text]);

  return { text, setText, recallUp, recallDown, exitRecall, submit };
}
