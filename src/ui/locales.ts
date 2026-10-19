/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import type { Language } from '../config/constants.js';

/**
 * UI string table. Components consume keys only; adding a language means
 * adding a record here, no component changes.
 */
export type StringKey =
  | 'bannerHint'
  | 'inputPlaceholder'
  | 'thinking'
  | 'modeHint'
  | 'modePasson'
  | 'modeManual'
  | 'modeAuto'
  | 'modePlan'
  | 'noProviderWarning'
  | 'noApiKeyWarning'
  | 'slashHint'
  | 'atHint'
  | 'toolRunning'
  | 'permissionAsk'
  | 'permissionAllow'
  | 'permissionDeny'
  | 'errorPrefix'
  | 'guideWelcome'
  | 'guideLanguage'
  | 'guideProviderName'
  | 'guideBaseURL'
  | 'guideApiKeyEnv'
  | 'guideModels'
  | 'guideMode'
  | 'guideDone'
  | 'commandNotFound';

const zh_CN: Record<StringKey, string> = {
  bannerHint: '输入 / 查看指令，@ 引用文件，shift+tab 切换模式',
  inputPlaceholder: '输入消息…',
  thinking: 'thinking …',
  modeHint: 'mode',
  modePasson: 'passon（全自动）',
  modeManual: 'manual（逐次确认）',
  modeAuto: 'auto（白名单自动）',
  modePlan: 'plan（只读计划）',
  noProviderWarning: '未配置模型供应商，请先完成引导或运行 mcode add_provider <name>',
  noApiKeyWarning: 'API Key 未设置：请先 export 环境变量后再发送消息',
  slashHint: '指令补全：↑↓ 选择，tab 补全，回车执行',
  atHint: '文件/目录补全：↑↓ 选择，tab 补全',
  toolRunning: '运行中',
  permissionAsk: '是否允许执行？',
  permissionAllow: '允许',
  permissionDeny: '拒绝',
  errorPrefix: '错误',
  guideWelcome: '欢迎使用 MCode —— 首次启动引导',
  guideLanguage: '选择语言环境（↑↓ 选择，回车确认）',
  guideProviderName: '供应商名称（如 openai）',
  guideBaseURL: 'API baseURL（如 https://api.openai.com/v1）',
  guideApiKeyEnv: 'API Key：环境变量名（推荐，如 GLM_API_KEY），或直接粘贴 Key',
  guideModels: '可用模型，逗号分隔（如 gpt-5,gpt-5-mini）',
  guideMode: '选择默认权限模式（↑↓ 选择，回车确认）',
  guideDone: '初始化完成，开始对话吧。',
  commandNotFound: '未知指令',
};

const en_US: Record<StringKey, string> = {
  bannerHint: 'Type / for commands, @ for files, shift+tab to switch mode',
  inputPlaceholder: 'Type a message…',
  thinking: 'thinking …',
  modeHint: 'mode',
  modePasson: 'passon (full auto)',
  modeManual: 'manual (confirm each)',
  modeAuto: 'auto (allowlist)',
  modePlan: 'plan (read-only)',
  noProviderWarning: 'No model provider configured — finish the setup guide or run mcode add_provider <name>',
  noApiKeyWarning: 'API key not set: export the environment variable first, then send a message',
  slashHint: 'Command completion: ↑↓ select, tab complete, enter run',
  atHint: 'File/dir completion: ↑↓ select, tab complete',
  toolRunning: 'running',
  permissionAsk: 'Allow execution?',
  permissionAllow: 'allow',
  permissionDeny: 'deny',
  errorPrefix: 'error',
  guideWelcome: 'Welcome to MCode — first launch setup',
  guideLanguage: 'Choose language (↑↓ select, enter confirm)',
  guideProviderName: 'Provider name (e.g. openai)',
  guideBaseURL: 'API baseURL (e.g. https://api.openai.com/v1)',
  guideApiKeyEnv: 'API key: env var name (recommended, e.g. GLM_API_KEY), or paste the key',
  guideModels: 'Available models, comma separated (e.g. gpt-5,gpt-5-mini)',
  guideMode: 'Choose default permission mode (↑↓ select, enter confirm)',
  guideDone: 'Setup complete. Start chatting.',
  commandNotFound: 'unknown command',
};

const zh_TW: Record<StringKey, string> = {
  ...zh_CN,
  bannerHint: '輸入 / 查看指令，@ 引用檔案，shift+tab 切換模式',
  inputPlaceholder: '輸入訊息…',
  noProviderWarning: '未設定模型供應商，請先完成引導或執行 mcode add_provider <name>',
  guideWelcome: '歡迎使用 MCode —— 首次啟動引導',
  guideLanguage: '選擇語言環境（↑↓ 選擇，Enter 確認）',
  guideDone: '初始化完成，開始對話吧。',
  commandNotFound: '未知指令',
};

const ja_JP: Record<StringKey, string> = {
  ...en_US,
  bannerHint: '「/」でコマンド、「@」でファイル参照、shift+tab でモード切替',
  inputPlaceholder: 'メッセージを入力…',
  thinking: '思考中 …',
  noProviderWarning: 'モデルプロバイダが未設定です。セットアップガイドを完了するか mcode add_provider <name> を実行してください',
  guideWelcome: 'MCode へようこそ —— 初回セットアップ',
  guideLanguage: '言語を選択（↑↓ で選択、Enter で確定）',
  guideDone: 'セットアップ完了。会話を始めましょう。',
  commandNotFound: '不明なコマンド',
};

const ko_KR: Record<StringKey, string> = {
  ...en_US,
  bannerHint: '/ 로 명령어, @ 로 파일 참조, shift+tab 으로 모드 전환',
  inputPlaceholder: '메시지 입력…',
  thinking: '생각 중 …',
  noProviderWarning: '모델 공급자가 설정되지 않았습니다. 설정 가이드를 완료하거나 mcode add_provider <name> 을 실행하세요',
  guideWelcome: 'MCode에 오신 것을 환영합니다 —— 첫 실행 설정',
  guideLanguage: '언어 선택（↑↓ 선택, Enter 확인）',
  guideDone: '설정 완료. 대화를 시작하세요.',
  commandNotFound: '알 수 없는 명령어',
};

const LOCALES: Record<Language, Record<StringKey, string>> = {
  zh_CN,
  zh_TW,
  en_US,
  ja_JP,
  ko_KR,
};

export type TFunction = (key: StringKey) => string;

export function createT(language: Language): TFunction {
  const table = LOCALES[language] ?? LOCALES.en_US;
  return (key) => table[key];
}

/** Language directive injected into the system prompt by context.ts. */
export const LANGUAGE_DIRECTIVES: Record<Language, string> = {
  zh_CN: 'Always respond in Simplified Chinese (简体中文). Comments and commit messages too.',
  zh_TW: 'Always respond in Traditional Chinese (繁體中文). Comments and commit messages too.',
  en_US: 'Always respond in English. Comments and commit messages too.',
  ja_JP: 'Always respond in Japanese (日本語). Comments and commit messages too.',
  ko_KR: 'Always respond in Korean (한국어). Comments and commit messages too.',
};
