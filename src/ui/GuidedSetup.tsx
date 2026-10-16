/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { LANGUAGES, LANGUAGE_LABELS, MODES, type Language, type Mode } from '../config/constants.js';
import type { TFunction } from './locales.js';

type Step =
  | { kind: 'language' }
  | { kind: 'text'; field: 'name' | 'baseURL' | 'apiKeyEnv' | 'models' }
  | { kind: 'mode' }
  | { kind: 'done' };

export interface GuideResult {
  language: Language;
  provider: { name: string; baseURL: string; apiKeyEnv: string; models: string[] };
  defaultMode: Mode;
}

/**
 * First-launch interactive guide: language → provider (name/baseURL/apiKeyEnv/
 * models) → default permission mode → done. Language applies to the guide
 * itself immediately after selection.
 */
export function GuidedSetup(props: {
  t: TFunction;
  defaultLanguage: Language;
  onComplete: (result: GuideResult) => void;
}): React.ReactElement {
  const [step, setStep] = useState<Step>({ kind: 'language' });
  const [language, setLanguage] = useState<Language>(props.defaultLanguage);
  const [selectIndex, setSelectIndex] = useState(() => {
    const list = LANGUAGES as readonly Language[];
    return Math.max(0, list.indexOf(props.defaultLanguage));
  });
  const [text, setText] = useState('');
  const [provider, setProvider] = useState({ name: '', baseURL: '', apiKeyEnv: '', models: '' });

  const languageList = LANGUAGES as readonly Language[];
  const modeList = MODES as readonly Mode[];

  useInput((input, key) => {
    if (step.kind === 'language' || step.kind === 'mode') {
      const count = step.kind === 'language' ? languageList.length : modeList.length;
      if (key.upArrow) setSelectIndex((i) => (i - 1 + count) % count);
      if (key.downArrow) setSelectIndex((i) => (i + 1) % count);
      if (key.return) {
        if (step.kind === 'language') {
          const lang = languageList[selectIndex]!;
          setLanguage(lang);
          setStep({ kind: 'text', field: 'name' });
        } else {
          props.onComplete({
            language,
            provider: {
              name: provider.name,
              baseURL: provider.baseURL,
              apiKeyEnv: provider.apiKeyEnv,
              models: provider.models.split(',').map((m) => m.trim()).filter((m) => m.length > 0),
            },
            defaultMode: modeList[selectIndex]!,
          });
          setStep({ kind: 'done' });
        }
      }
      return;
    }
    if (step.kind === 'text') {
      if (key.return) {
        const value = text.trim();
        if (value.length === 0) return;
        const next = { ...provider, [step.field]: value };
        setProvider(next);
        setText('');
        setSelectIndex(0);
        if (step.field === 'name') setStep({ kind: 'text', field: 'baseURL' });
        else if (step.field === 'baseURL') setStep({ kind: 'text', field: 'apiKeyEnv' });
        else if (step.field === 'apiKeyEnv') setStep({ kind: 'text', field: 'models' });
        else setStep({ kind: 'mode' });
        return;
      }
      if (key.backspace || key.delete) {
        setText((t) => t.slice(0, -1));
        return;
      }
      if (input.length > 0) setText((t) => t + input);
    }
  });

  const t = props.t;
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text bold color="cyan">{t('guideWelcome')}</Text>
      {step.kind === 'language' ? (
        <Box flexDirection="column">
          <Text>{t('guideLanguage')}</Text>
          {languageList.map((lang, i) => (
            <Text key={lang} color={i === selectIndex ? 'cyan' : undefined}>
              {i === selectIndex ? '› ' : '  '}
              {lang} ({LANGUAGE_LABELS[lang]})
            </Text>
          ))}
        </Box>
      ) : null}
      {step.kind === 'text' ? (
        <Box flexDirection="column">
          <Text>
            {step.field === 'name' ? t('guideProviderName') : null}
            {step.field === 'baseURL' ? t('guideBaseURL') : null}
            {step.field === 'apiKeyEnv' ? t('guideApiKeyEnv') : null}
            {step.field === 'models' ? t('guideModels') : null}
          </Text>
          <Text color="green">› {text}▌</Text>
        </Box>
      ) : null}
      {step.kind === 'mode' ? (
        <Box flexDirection="column">
          <Text>{t('guideMode')}</Text>
          {modeList.map((mode, i) => (
            <Text key={mode} color={i === selectIndex ? (mode === 'passon' ? 'red' : 'cyan') : mode === 'passon' ? 'red' : undefined}>
              {i === selectIndex ? '› ' : '  '}
              {mode}
            </Text>
          ))}
        </Box>
      ) : null}
      {step.kind === 'done' ? <Text color="green">{t('guideDone')}</Text> : null}
    </Box>
  );
}
