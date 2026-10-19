/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import React, { useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { useState } from 'react';
import { useCompletion, type CompletionItem } from './useCompletion.js';
import { CompletionPanel } from './CompletionPanel.js';
import { useInputHistory } from './useInputHistory.js';
import type { TFunction } from './locales.js';

const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';
// Ink 的按键解析会吃掉 chunk 开头的 ESC（按 ESC 键处理），START/END 标记
// 到达 handler 时可能只剩 "[200~" / "[201~"——两种形态都要识别
const PASTE_START_BARE = '[200~';
const PASTE_END_BARE = '[201~';

/** 缓冲中的粘贴超过此时长仍未见 END 标记 → 视为终端异常，冲刷为普通文本。 */
const PASTE_STALE_MS = 5000;

/** Normalize a pasted chunk: strip markers, keep newlines as real newlines. */
function normalizePaste(raw: string): string {
  return raw
    .split(PASTE_START).join('')
    .split(PASTE_END).join('')
    .split('[200~').join('')
    .split('[201~').join('')
    .replace(/\r\n?/g, '\n');
}

function detectTriggerChar(text: string): '/' | '@' | null {
  const slash = text.lastIndexOf('/');
  const at = text.lastIndexOf('@');
  const idx = Math.max(slash, at);
  if (idx === -1) return null;
  const before = idx === 0 ? ' ' : text[idx - 1]!;
  if (!(idx === 0 || /\s/.test(before))) return null;
  if (text.slice(idx + 1).includes(' ')) return null;
  return text[idx] as '/' | '@';
}

/**
 * 光标垂直跨行移动（文本编辑器语义）：保留列、目标列 clamp 到目标行行尾；
 * 已在首行/末行则原地不动。delta 为 -1（上）/ 1（下）。与 Rust 版 cursor_vertical_move 对齐。
 */
function cursorVerticalMove(text: string, cursor: number, delta: -1 | 1): number {
  const lines = text.split('\n');
  let prefix = 0;
  let row = 0;
  let col = cursor;
  for (let i = 0; i < lines.length; i += 1) {
    const len = lines[i]!.length;
    if (cursor <= prefix + len) {
      row = i;
      col = cursor - prefix;
      break;
    }
    // cursor 恰在换行符上：归到当前行行尾
    if (cursor === prefix + len + 1 && i < lines.length - 1) {
      row = i;
      col = len;
      break;
    }
    prefix += len + 1;
  }
  const target = Math.min(Math.max(row + delta, 0), lines.length - 1);
  if (target === row) return cursor;
  const targetCol = Math.min(col, lines[target]!.length);
  let targetPrefix = 0;
  for (let i = 0; i < target; i += 1) {
    targetPrefix += lines[i]!.length + 1;
  }
  return targetPrefix + targetCol;
}

export interface InputBoxProps {
  busy: boolean;
  /** Disable key handling (e.g. while the model picker is open). */
  inputActive?: boolean;
  cwd: string;
  t: TFunction;
  commandItems: CompletionItem[];
  /** Current workspace file list (refreshed on each @ open). */
  fileItems: CompletionItem[];
  /** Called when the @ trigger opens — kicks a fresh directory scan. */
  onAtTrigger: () => void;
  onSubmit: (text: string) => void;
  /** Enter while busy → queue the message for the next turn boundary. */
  onQueue: (text: string) => void;
  onCycleMode: () => void;
  onAbort: () => void;
}

/**
 * Controlled input with the '/' and '@' completion state machine plus ↑/↓
 * history recall. Key precedence: completion panel (open) > history recall >
 * plain editing — the two states are mutually exclusive by design.
 */
export function InputBox(props: InputBoxProps): React.ReactElement {
  const completion = useCompletion(props.commandItems, props.fileItems);
  const prevTriggerRef = useRef<'/' | '@' | null>(null);
  const history = useInputHistory(props.cwd, (value) => props.onSubmit(value));

  const pasteBufRef = useRef<{ text: string; start: number } | null>(null);

  useEffect(() => {
    // 括号粘贴模式：终端把整段粘贴从 ESC[200~ 到 ESC[201~ 整段包好送来，
    // 粘贴内的换行不会被终端当作回车键逐个发送——多行打包的前提。
    // 绕过 Ink 的帧流直接写 process.stdout（模式切换不产生可渲染输出，
    // 走 useStdout 会污染 Ink 的帧记账），仅 TTY 下启用
    if (!process.stdout.isTTY) return;
    process.stdout.write('\x1b[?2004h');
    return () => {
      process.stdout.write('\x1b[?2004l');
    };
  }, []);

  const text = history.text;
  const cursor = history.cursor;
  const panelOpen = completion.state.trigger !== null;

  // 多行输入折叠展示（对齐主流终端 agent 的输入做法）：内容变多行即收起为
  // 单行预览（首行 + 行数徽标），↑ 展开编辑；已展开时继续编辑不再自动收起。
  const [collapsed, setCollapsed] = useState(false);
  const prevMultiRef = useRef(false);
  useEffect(() => {
    const isMulti = text.includes('\n');
    if (isMulti && !prevMultiRef.current) setCollapsed(true);
    prevMultiRef.current = isMulti;
  }, [text]);

  const handleChange = (next: string, cur?: number): void => {
    history.setText(next, cur);
    history.exitRecall();
    completion.handleTextChange(next);
    // every fresh '@' open rescans the workspace — new files (e.g. screenshots)
    // dropped into the directory must appear immediately
    const trigger = detectTriggerChar(next);
    if (trigger === '@' && prevTriggerRef.current !== '@') props.onAtTrigger();
    prevTriggerRef.current = trigger;
  };

  useInput((input, key) => {
    // 超时冲刷：缓冲超过 PASTE_STALE_MS 仍未见 END 标记 → 视为终端异常，
    // 把攒到的内容当普通文本落盘，避免输入框永久吞键
    const stale = pasteBufRef.current;
    if (stale !== null && Date.now() - stale.start > PASTE_STALE_MS) {
      pasteBufRef.current = null;
      const flushed = normalizePaste(stale.text);
      if (flushed.length > 0) handleChange(text + flushed);
    }
    // 括号粘贴跨 chunk 缓冲：大段粘贴会被内核拆成多次 stdin read，
    // START/END 标记之间的所有块（含裸 \r）都是粘贴载荷，绝不触发提交/打断
    if (pasteBufRef.current !== null || input.includes(PASTE_START) || input.includes(PASTE_START_BARE)) {
      let base = text;
      let acc = (pasteBufRef.current?.text ?? '') + input;
      const startIdx = Math.max(acc.indexOf(PASTE_START), acc.indexOf(PASTE_START_BARE));
      if (pasteBufRef.current === null && startIdx > 0) {
        // START 之前的零散字符与粘贴合并进同一 chunk：按普通文本插入
        handleChange(base + acc.slice(0, startIdx));
        base += acc.slice(0, startIdx);
        acc = acc.slice(startIdx);
      }
      // 剥掉 START（可能已被 Ink 吃掉 ESC，也可能没有）
      const s = acc.indexOf(PASTE_START);
      if (s >= 0) acc = acc.slice(0, s) + acc.slice(s + PASTE_START.length);
      else {
        const sb = acc.indexOf(PASTE_START_BARE);
        if (sb >= 0) acc = acc.slice(0, sb) + acc.slice(sb + PASTE_START_BARE.length);
      }
      // END 同样可能是完整或裸形态，取最先出现的
      const fullEnd = acc.indexOf(PASTE_END);
      const bareEnd = acc.indexOf(PASTE_END_BARE);
      let endIdx = -1;
      let endLen = 0;
      if (fullEnd !== -1 && (bareEnd === -1 || fullEnd < bareEnd)) {
        endIdx = fullEnd;
        endLen = PASTE_END.length;
      } else if (bareEnd !== -1) {
        endIdx = bareEnd;
        endLen = PASTE_END_BARE.length;
      }
      if (endIdx === -1) {
        pasteBufRef.current = { text: acc, start: Date.now() };
        return;
      }
      pasteBufRef.current = null;
      const cleaned = normalizePaste(acc.slice(0, endIdx));
      if (cleaned.length > 0) handleChange(base + cleaned);
      const residue = acc.slice(endIdx + endLen);
      if (residue.length === 0) return;
      if (/^[\r\n]+$/.test(residue)) {
        // 粘贴后紧跟的回车（与 END 合并进同一 data 事件）：按回车键提交
        history.submit(base + cleaned);
        return;
      }
      const extra = normalizePaste(residue);
      if (extra.length > 0) handleChange(base + cleaned + extra);
      return;
    }
    if (key.tab && key.shift) {
      props.onCycleMode();
      return;
    }
    if (key.upArrow) {
      if (completion.handleArrow('up')) return;
      if (text.length === 0) {
        history.recallUp();
        return;
      }
      // 有内容：跨行移动光标（文本编辑器语义）；折叠态先展开
      if (collapsed && text.includes('\n')) {
        setCollapsed(false);
        return;
      }
      history.setCursor(cursorVerticalMove(text, cursor, -1));
      return;
    }
    if (key.downArrow) {
      if (completion.handleArrow('down')) return;
      if (text.length === 0) {
        history.recallDown();
        return;
      }
      // 光标已在末行：折叠多行内容（与 ↑ 展开对偶，形成闭环）
      const lastRow = cursorVerticalMove(text, cursor, 1);
      if (lastRow === cursor && text.includes('\n')) {
        setCollapsed(true);
        return;
      }
      history.setCursor(lastRow);
      return;
    }
    if (key.leftArrow || key.rightArrow) {
      // 折叠态内容视为整体：横移键不动（先 ↑ 展开），避免在不可见位置插入
      if (collapsed && text.includes('\n')) return;
      const d = key.leftArrow ? -1 : 1;
      history.setCursor(Math.min(Math.max(cursor + d, 0), text.length));
      return;
    }
    if (key.tab) {
      const next = completion.handleTab(text);
      if (next !== null) {
        history.setText(next);
        completion.handleTextChange(next);
      }
      return;
    }
    if (key.escape) {
      completion.close();
      if (props.busy) props.onAbort();
      return;
    }
    if (key.return) {
      if (text === '/' || text === '@') return;
      completion.close();
      if (props.busy) {
        const value = text.trim();
        if (value.length > 0) {
          history.setText('');
          props.onQueue(value);
        }
        return;
      }
      history.submit();
      return;
    }
    if (key.backspace || key.delete) {
      // 删除光标前一字符；光标在 0 时不动
      if (cursor === 0) return;
      handleChange(text.slice(0, cursor - 1) + text.slice(cursor), cursor - 1);
      return;
    }
    if (key.ctrl && input === 'c') {
      props.onAbort();
      return;
    }
    if (input.length > 0 && !key.ctrl && !key.meta) {
      // bracketed paste or any multi-line chunk: insert as literal text,
      // never interpreted as Enter / commands
      if (input.includes(PASTE_START) || input.includes(PASTE_END) || (input.length > 1 && /[\n\r]/.test(input))) {
        const cleaned = normalizePaste(input);
        if (cleaned.length > 0) handleChange(text + cleaned);
        return;
      }
      handleChange(text.slice(0, cursor) + input + text.slice(cursor));
    }
  }, { isActive: props.inputActive !== false });

  return (
    <Box flexDirection="column">
      {panelOpen ? (
        <CompletionPanel
          title={completion.state.trigger === '/' ? '/' : '@'}
          items={completion.visible}
          selectedIndex={completion.state.selectedIndex}
        />
      ) : null}
      <Box borderStyle="round" borderColor={props.busy ? 'gray' : 'cyan'} paddingX={1}>
        <Text color="cyan">❯ </Text>
        {collapsed && text.includes('\n') ? (() => {
          const firstLine = text.split('\n')[0] ?? '';
          const extra = text.split('\n').length - 1;
          return (
            <>
              <Text>{firstLine}</Text>
              <Text dimColor>{props.t('inputCollapsedSuffix').replace('{n}', String(extra))}</Text>
              <Text color="gray">▌</Text>
            </>
          );
        })() : (
          <>
            <Text>{text.slice(0, cursor)}</Text>
            <Text color="gray">▌</Text>
            <Text>{text.slice(cursor)}</Text>
          </>
        )}
      </Box>
      {panelOpen ? (
        <Text dimColor>
          {completion.state.trigger === '/' ? props.t('slashHint') : props.t('atHint')}
        </Text>
      ) : null}
    </Box>
  );
}
