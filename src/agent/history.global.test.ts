/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSession, persistSession, listAllSessions, loadSessionGlobal } from './history.js';

const TMP = mkdtempSync(join(tmpdir(), 'mcode-global-'));
let origHome: string | undefined;
const projectA = join(TMP, 'projectA');
const projectB = join(TMP, 'projectB');

beforeEach(() => {
  origHome = process.env['HOME'];
  process.env['HOME'] = TMP;
  rmSync(join(TMP, '.mcode'), { recursive: true, force: true });
});

afterEach(() => {
  process.env['HOME'] = origHome;
  rmSync(join(TMP, '.mcode'), { recursive: true, force: true });
});

function seedSession(projectCwd: string, id: string): void {
  const session = createSession(projectCwd, 'm1', 'passon');
  session.meta.sessionId = id;
  session.meta.title = `title-${id}`;
  persistSession({ ...session, messages: [{ role: 'user', content: 'q' }] });
}

describe('global session listing / resume fallback', () => {
  it('listAllSessions finds sessions across projects with projectCwd', () => {
    seedSession(projectA, 's-a1');
    seedSession(projectB, 's-b1');
    const all = listAllSessions();
    expect(all).toHaveLength(2);
    const ids = all.map((s) => s.sessionId);
    expect(ids).toContain('s-a1');
    expect(ids).toContain('s-b1');
    const a = all.find((s) => s.sessionId === 's-a1')!;
    expect(a.projectCwd).toBe(projectA);
  });

  it('loadSessionGlobal restores by id across projects', () => {
    seedSession(projectA, 's-g1');
    const record = loadSessionGlobal('s-g1');
    expect(record).not.toBeNull();
    expect(record!.messages).toEqual([{ role: 'user', content: 'q' }]);
  });

  it('returns empty when no projects have sessions', () => {
    const all = listAllSessions();
    expect(all).toHaveLength(0);
  });
});
