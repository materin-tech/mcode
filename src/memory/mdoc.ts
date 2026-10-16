import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { mcodeDir } from '../config/constants.js';

export interface McodeDoc {
  path: string;
  content: string;
  scope: 'project' | 'global';
}

export const MAX_PROJECT_DOC_CHARS = 20_000;

const TEMPLATE = `# MCODE.md

Project-level instructions for MCode. Loaded into the system prompt on every session.

## Build & test

<!-- e.g. npm run build / npm test -->

## Conventions

<!-- code style, naming, directory layout -->

## Notes

<!-- anything the agent should always know -->
`;

/**
 * Collect MCODE.md docs like Claude Code collects CLAUDE.md:
 * nearest-first from cwd up the directory tree, then the global one
 * (~/.mcode/MCODE.md). Duplicate paths are not repeated.
 */
export function findMcodeDocs(cwd: string): McodeDoc[] {
  const docs: McodeDoc[] = [];
  const seen = new Set<string>();
  let dir = cwd;
  while (true) {
    const file = join(dir, 'MCODE.md');
    if (existsSync(file) && !seen.has(file)) {
      try {
        docs.push({ path: file, content: readFileSync(file, 'utf8'), scope: 'project' });
        seen.add(file);
      } catch {
        // unreadable — skip
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const globalFile = join(mcodeDir(), 'MCODE.md');
  if (existsSync(globalFile) && !seen.has(globalFile)) {
    try {
      docs.push({ path: globalFile, content: readFileSync(globalFile, 'utf8'), scope: 'global' });
    } catch {
      // skip
    }
  }
  return docs;
}

/**
 * Combined doc text for the system prompt, total-capped. Nearest file wins
 * on truncation (included first).
 */
export function buildProjectDocSection(docs: McodeDoc[]): string {
  if (docs.length === 0) return '';
  const parts: string[] = [];
  let budget = MAX_PROJECT_DOC_CHARS;
  for (const doc of docs) {
    if (budget <= 0) break;
    const body = doc.content.length > budget
      ? doc.content.slice(0, budget) + '\n…[truncated]'
      : doc.content;
    budget -= body.length;
    parts.push(`--- MCODE.md (${doc.scope}): ${doc.path} ---\n${body}\n--- end ---`);
  }
  return ['Project documentation (MCODE.md) — follow these instructions:', ...parts].join('\n');
}

/** Create MCODE.md in cwd if missing. Returns {path, created}. */
export function initMcodeDoc(cwd: string): { path: string; created: boolean } {
  const path = join(cwd, 'MCODE.md');
  if (existsSync(path)) return { path, created: false };
  writeFileSync(path, TEMPLATE, 'utf8');
  return { path, created: true };
}
