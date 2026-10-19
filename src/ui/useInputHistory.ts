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
  cursor: number;
  setText: (t: string, c?: number) => void;
  setCursor: (c: number) => void;
  recallUp: () => void;
  recallDown: () => void;
  exitRecall: () => void;
  submit: (override?: string) => void;
} {
  const [text, setTextState] = useState('');
  const [cursor, setCursorState] = useState(0);
  const entriesRef = useRef<string[]>([]);
  const indexRef = useRef<number>(-1);
  const draftRef = useRef<string>('');
  const recallingRef = useRef<boolean>(false);

  /** 设文本并把光标对齐到指定位置（默认行尾）——所有写入统一走这里 */
  const setText = useCallback((t: string, c?: number) => {
    setTextState(t);
    setCursorState(c ?? t.length);
  }, []);

  /** 纯光标移动（调用方负责 clamp 到合法范围） */
  const setCursor = useCallback((c: number) => setCursorState(c), []);

  const recallUp = useCallback(() => {
    if (!recallingRef.current) {
      entriesRef.current = readInputHistory(cwd);
      draftRef.current = text;
      if (entriesRef.current.length === 0) return;
      recallingRef.current = true;
      indexRef.current = 0; // newest entry first
    } else if (indexRef.current < entriesRef.current.length - 1) {
      indexRef.current += 1;
    } else {
      return;
    }
    setText(entriesRef.current[indexRef.current] ?? '');
  }, [cwd, text, setText]);

  const recallDown = useCallback(() => {
    if (!recallingRef.current) return;
    if (indexRef.current > 0) {
      indexRef.current -= 1;
      setText(entriesRef.current[indexRef.current] ?? '');
    } else {
      // top reached: restore the unsent draft
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

  const submit = useCallback((override?: string) => {
    const value = (override ?? text).trim();
    if (value.length === 0) return;
    appendInputHistory(value, cwd);
    recallingRef.current = false;
    indexRef.current = -1;
    setText('');
    onSubmit(value);
  }, [cwd, onSubmit, text]);

  return { text, cursor, setText, setCursor, recallUp, recallDown, exitRecall, submit };
}
