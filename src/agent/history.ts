/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChatMessage } from '../api/client.js';
import { projectsDir } from '../config/constants.js';

export interface SessionMeta {
  sessionId: string;
  cwd: string;
  started: string;
  updated: string;
  title: string;
  model: string;
  mode: string;
  totalTokens: number;
}

export interface SessionRecord {
  meta: SessionMeta;
  messages: ChatMessage[];
}

export function hashCwd(cwd: string): string {
  return Buffer.from(cwd).toString('base64url');
}

export function projectDir(cwd: string): string {
  return join(projectsDir(), hashCwd(cwd));
}

export function sessionsDir(cwd: string): string {
  return join(projectDir(cwd), 'sessions');
}

export function newSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createSession(cwd: string, model: string, mode: string): SessionRecord {
  const now = new Date().toISOString();
  return {
    meta: {
      sessionId: newSessionId(),
      cwd,
      started: now,
      updated: now,
      title: '(new session)',
      model,
      mode,
      totalTokens: 0,
    },
    messages: [],
  };
}

export function persistSession(session: SessionRecord): void {
  const dir = sessionsDir(session.meta.cwd);
  mkdirSync(dir, { recursive: true });
  const base = join(dir, session.meta.sessionId);
  writeFileSync(`${base}.jsonl`, session.messages.map((m) => JSON.stringify(m)).join('\n') + '\n', 'utf8');
  writeFileSync(`${base}.meta.json`, `${JSON.stringify(session.meta, null, 2)}\n`, 'utf8');
}

export function listSessions(cwd: string): SessionMeta[] {
  const dir = sessionsDir(cwd);
  if (!existsSync(dir)) return [];
  const metas: SessionMeta[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.meta.json')) continue;
    try {
      metas.push(JSON.parse(readFileSync(join(dir, file), 'utf8')) as SessionMeta);
    } catch {
      // skip unreadable meta
    }
  }
  return metas.sort((a, b) => b.updated.localeCompare(a.updated));
}

export function loadSession(cwd: string, sessionId: string): SessionRecord | null {
  const base = join(sessionsDir(cwd), sessionId);
  return loadSessionFromBase(base, sessionId);
}

export function loadSessionFromBase(base: string, sessionId: string): SessionRecord | null {
  if (!existsSync(`${base}.jsonl`) || !existsSync(`${base}.meta.json`)) return null;
  try {
    const messages = readFileSync(`${base}.jsonl`, 'utf8')
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as ChatMessage);
    const meta = JSON.parse(readFileSync(`${base}.meta.json`, 'utf8')) as SessionMeta;
    return { meta, messages };
  } catch {
    return null;
  }
}

/** In-memory history with hard cap + compaction support. */
export class HistoryStore {
  private messages: ChatMessage[] = [];

  all(): ChatMessage[] {
    return this.messages;
  }

  /** User turn + assistant reply. */
  pushTurn(user: string, assistant: string): void {
    if (assistant.trim().length > 0) {
      this.messages = [...this.messages, { role: 'user', content: user }, { role: 'assistant', content: assistant }];
    }
  }

  /** Replace with compacted view (summary of older turns + recent tail). */
  compact(summary: string, keepTurns: number): void {
    const tail = this.messages.slice(-keepTurns * 2);
    const summaryMsg: ChatMessage = { role: 'user', content: `[compacted history] ${summary}` };
    this.messages = [summaryMsg, ...tail];
  }

  clear(): void {
    this.messages = [];
  }

  restore(messages: ChatMessage[]): void {
    this.messages = messages;
  }
}

export interface GlobalSessionRef extends SessionMeta {
  /** Project cwd this session belongs to (decoded from the dir hash). */
  projectCwd: string;
}

/** Sessions across ALL projects — fallback for resume when cwd has none. */
export function listAllSessions(): GlobalSessionRef[] {
  const root = projectsDir();
  if (!existsSync(root)) return [];
  const out: GlobalSessionRef[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const cwd = Buffer.from(entry.name, 'base64url').toString('utf8');
    const dir = join(root, entry.name, 'sessions');
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.meta.json')) continue;
      try {
        const meta = JSON.parse(readFileSync(join(dir, file), 'utf8')) as SessionMeta;
        out.push({ ...meta, projectCwd: cwd });
      } catch {
        // skip unreadable meta
      }
    }
  }
  return out.sort((a, b) => b.updated.localeCompare(a.updated));
}

/** Load a session by id across all projects (for global resume). */
export function loadSessionGlobal(sessionId: string): SessionRecord | null {
  const root = projectsDir();
  if (!existsSync(root)) return null;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const record = loadSessionFromBase(join(root, entry.name, 'sessions', sessionId), sessionId);
    if (record) return record;
  }
  return null;
}
