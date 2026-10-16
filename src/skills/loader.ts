/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mcodeDir } from '../config/constants.js';

export interface SkillDefinition {
  name: string;
  description: string;
  body: string;
  /** Where it came from — project overrides user level. */
  source: 'user' | 'project' | 'bundled';
}

export interface SkillSummary {
  name: string;
  description: string;
}

/** Parse a SKILL.md: `---` frontmatter (name/description) + body. */
export function parseSkillMd(raw: string, fallbackName: string): Omit<SkillDefinition, 'source'> {
  const normalized = raw.replace(/\r\n/g, '\n');
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(normalized);
  let name = fallbackName;
  let description = '';
  let body = normalized;
  if (match) {
    for (const line of match[1]!.split('\n')) {
      const kv = /^(\w[\w-]*):\s*(.*)$/.exec(line.trim());
      if (!kv) continue;
      if (kv[1] === 'name') name = kv[2]!.trim();
      if (kv[1] === 'description') description = kv[2]!.trim();
    }
    body = normalized.slice(match[0].length);
  }
  return { name, description, body: body.trim() };
}

function loadSkillDir(dir: string, source: 'user' | 'project' | 'bundled'): SkillDefinition[] {
  if (!existsSync(dir)) return [];
  const skills: SkillDefinition[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(dir, entry.name, 'SKILL.md');
    if (!existsSync(file)) continue;
    try {
      const parsed = parseSkillMd(readFileSync(file, 'utf8'), entry.name);
      skills.push({ ...parsed, source });
    } catch {
      // unreadable skill — skip
    }
  }
  return skills;
}

/**
 * Load skills from user (~/.mcode/skills) and project (.mcode/skills) dirs.
 * Project-level overrides user-level on name collision.
 */
export function loadSkills(cwd: string, extraDirs?: Array<{ dir: string; source: 'user' | 'project' | 'bundled' }>): SkillDefinition[] {
  const userDir = join(mcodeDir(), 'skills');
  const projectDir = join(cwd, '.mcode', 'skills');
  const merged = new Map<string, SkillDefinition>();
  for (const skill of loadSkillDir(userDir, 'user')) merged.set(skill.name, skill);
  for (const skill of loadSkillDir(projectDir, 'project')) merged.set(skill.name, skill);
  for (const extra of extraDirs ?? []) {
    for (const skill of loadSkillDir(extra.dir, extra.source)) {
      if (!merged.has(skill.name)) merged.set(skill.name, skill);
      // bundled skills never override user/project skills
    }
  }
  return [...merged.values()];
}

/** Index text injected into the system prompt (progressive disclosure layer 1). */
export function buildSkillIndex(skills: SkillDefinition[]): string {
  if (skills.length === 0) return '';
  const lines = skills.map((s) => `- ${s.name}: ${s.description || '(no description)'}`);
  return [
    'Available skills. When a task matches one, call the `skill` tool with its name to load full instructions, then follow them:',
    ...lines,
  ].join('\n');
}

export function getSkillBody(skills: SkillDefinition[], name: string): string | null {
  return skills.find((s) => s.name === name)?.body ?? null;
}
