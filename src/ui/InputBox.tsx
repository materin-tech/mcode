/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';
import { useState } from 'react';
import { useCompletion, type CompletionItem } from './useCompletion.js';
import { CompletionPanel } from './CompletionPanel.js';
import { useInputHistory } from './useInputHistory.js';
import type { TFunction } from './locales.js';

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

export interface InputBoxProps {
  busy: boolean;
  /** Disable key handling (e.g. while the model picker is open). */
  inputActive?: boolean;
  cwd: string;
  t: TFunction;
  commandItems: CompletionItem[];
  listFiles: () => CompletionItem[];
  onSubmit: (text: string) => void;
  onCycleMode: () => void;
  onAbort: () => void;
}

/**
 * Controlled input with the '/' and '@' completion state machine plus ↑/↓
 * history recall. Key precedence: completion panel (open) > history recall >
 * plain editing — the two states are mutually exclusive by design.
 */
export function InputBox(props: InputBoxProps): React.ReactElement {
  const [fileItems, setFileItems] = useState<CompletionItem[]>([]);
  const completion = useCompletion(props.commandItems, fileItems);
  const history = useInputHistory(props.cwd, (value) => props.onSubmit(value));

  const text = history.text;
  const panelOpen = completion.state.trigger !== null;

  const handleChange = (next: string): void => {
    history.setText(next);
    history.exitRecall();
    completion.handleTextChange(next);
    if (detectTriggerChar(next) === '@' && fileItems.length === 0) {
      setFileItems(props.listFiles());
    }
  };

  useInput((input, key) => {
    if (key.tab && key.shift) {
      props.onCycleMode();
      return;
    }
    if (key.upArrow) {
      if (completion.handleArrow('up')) return;
      if (!props.busy) history.recallUp();
      return;
    }
    if (key.downArrow) {
      if (completion.handleArrow('down')) return;
      if (!props.busy) history.recallDown();
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
      return;
    }
    if (key.return) {
      if (text === '/' || text === '@') return;
      completion.close();
      if (!props.busy) history.submit();
      return;
    }
    if (key.backspace || key.delete) {
      handleChange(text.slice(0, -1));
      return;
    }
    if (key.ctrl && input === 'c') {
      props.onAbort();
      return;
    }
    if (input.length > 0 && !key.ctrl && !key.meta) {
      handleChange(text + input);
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
        <Text>{text}</Text>
        <Text color="gray">▌</Text>
      </Box>
      {panelOpen ? (
        <Text dimColor>
          {completion.state.trigger === '/' ? props.t('slashHint') : props.t('atHint')}
        </Text>
      ) : null}
    </Box>
  );
}
