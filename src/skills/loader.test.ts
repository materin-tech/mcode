/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseSkillMd, loadSkills, buildSkillIndex, getSkillBody } from './loader.js';

const TMP = mkdtempSync(join(tmpdir(), 'mcode-skills-'));
let ws = '';
let origHome: string | undefined;

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), 'mcode-ws-'));
  origHome = process.env['HOME'];
  process.env['HOME'] = TMP;
  mkdirSync(join(TMP, '.mcode', 'skills', 'user-skill'), { recursive: true });
  writeFileSync(
    join(TMP, '.mcode', 'skills', 'user-skill', 'SKILL.md'),
    '---\nname: user-skill\ndescription: from user dir\n---\nUser body here.\n',
  );
});

afterEach(() => {
  process.env['HOME'] = origHome;
  rmSync(TMP, { recursive: true, force: true });
  rmSync(ws, { recursive: true, force: true });
});

describe('parseSkillMd', () => {
  it('parses frontmatter name/description and body', () => {
    const parsed = parseSkillMd('---\nname: my-skill\ndescription: does things\n---\nBody line.\n', 'fallback');
    expect(parsed.name).toBe('my-skill');
    expect(parsed.description).toBe('does things');
    expect(parsed.body).toBe('Body line.');
  });

  it('falls back to dir name when no frontmatter', () => {
    const parsed = parseSkillMd('Just body.', 'dir-name');
    expect(parsed.name).toBe('dir-name');
    expect(parsed.body).toBe('Just body.');
  });
});

describe('loadSkills', () => {
  it('loads from user dir', () => {
    const skills = loadSkills(ws);
    expect(skills).toHaveLength(1);
    expect(skills[0]!.name).toBe('user-skill');
    expect(skills[0]!.source).toBe('user');
  });

  it('project overrides user on name collision', () => {
    mkdirSync(join(ws, '.mcode', 'skills', 'user-skill'), { recursive: true });
    writeFileSync(
      join(ws, '.mcode', 'skills', 'user-skill', 'SKILL.md'),
      '---\nname: user-skill\ndescription: project wins\n---\nProject body.\n',
    );
    const skills = loadSkills(ws);
    expect(skills).toHaveLength(1);
    expect(skills[0]!.description).toBe('project wins');
    expect(skills[0]!.source).toBe('project');
  });
});

describe('skill index / body', () => {
  it('buildSkillIndex lists name+description only', () => {
    const skills = loadSkills(ws);
    const index = buildSkillIndex(skills);
    expect(index).toContain('- user-skill: from user dir');
    expect(index).not.toContain('User body here');
  });

  it('getSkillBody returns full body', () => {
    expect(getSkillBody(loadSkills(ws), 'user-skill')).toContain('User body here');
  });

  it('getSkillBody returns null for unknown', () => {
    expect(getSkillBody(loadSkills(ws), 'nope')).toBeNull();
  });
});
