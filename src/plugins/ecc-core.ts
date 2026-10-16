import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { AgentDefinition } from '../agent/subagent.js';

/** Locate assets/ecc-core in src (dev/test) and installed package layouts. */
export function eccCoreDir(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, '..', 'assets', 'ecc-core'),
    join(here, '..', '..', 'assets', 'ecc-core'),
    join(here, '..', '..', '..', 'assets', 'ecc-core'),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return null;
}

export function mapEccTools(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (lower.includes('all tools') || raw.trim() === '*') return undefined;
  const mapping: Record<string, string> = {
    read: 'read_file',
    write: 'write_file',
    edit: 'edit_file',
    multiedit: 'edit_file',
    bash: 'bash',
    glob: 'glob',
    grep: 'grep',
    webfetch: 'webfetch',
    websearch: 'websearch',
  };
  const mapped = raw
    .split(',')
    .map((t) => mapping[t.trim().toLowerCase()])
    .filter((t): t is string => Boolean(t));
  return mapped.length > 0 ? mapped : undefined;
}

const MAX_AGENT_BODY_CHARS = 20_000;

/** Parse one ECC agent markdown file into an AgentDefinition. */
export function parseEccAgent(raw: string, fallbackName: string): AgentDefinition | null {
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
  if (!fm) return null;
  const fields = new Map<string, string>();
  for (const line of fm[1]!.split('\n')) {
    const kv = /^(\w[\w-]*):\s*(.*)$/.exec(line.trim());
    if (kv) fields.set(kv[1]!.toLowerCase(), kv[2]!.trim());
  }
  const name = fields.get('name') ?? fallbackName;
  const description = fields.get('description') ?? '';
  if (description.length === 0) return null;
  const body = raw.slice(fm[0].length).trim();
  return {
    name,
    description,
    systemPrompt: body.slice(0, MAX_AGENT_BODY_CHARS),
    tools: mapEccTools(fields.get('tools')),
  };
}

/** Load all bundled ECC agents (empty when assets are missing). */
export function loadEccAgents(): AgentDefinition[] {
  const dir = eccCoreDir();
  if (!dir || !existsSync(join(dir, 'agents'))) return [];
  const agents: AgentDefinition[] = [];
  for (const file of readdirSync(join(dir, 'agents'))) {
    if (!file.endsWith('.md')) continue;
    try {
      const parsed = parseEccAgent(
        readFileSync(join(dir, 'agents', file), 'utf8'),
        file.replace(/\.md$/, ''),
      );
      if (parsed) agents.push(parsed);
    } catch {
      // skip unreadable
    }
  }
  return agents;
}

/** Bundled ECC skills directory (same SKILL.md format as user dirs). */
export function eccSkillsDir(): string | null {
  const dir = eccCoreDir();
  if (dir && existsSync(join(dir, 'skills'))) return join(dir, 'skills');
  return null;
}
