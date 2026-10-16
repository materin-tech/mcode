import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileTool } from './write-file.js';
import { editFileTool } from './edit-file.js';

describe('write_file / edit_file honor ctx.cwd (regression: process.cwd pollution)', () => {
  it('writes into ctx.cwd, not process.cwd', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'mcode-ctxcwd-'));
    try {
      const result = await writeFileTool.execute(
        { path: 'note.txt', content: 'hello' },
        { cwd: ws, mode: 'passon' },
      );
      expect(result.success).toBe(true);
      expect(existsSync(join(ws, 'note.txt'))).toBe(true);
      expect(existsSync(join(process.cwd(), 'note.txt'))).toBe(false);
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it('edit_file also resolves against ctx.cwd', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'mcode-ctxcwd-'));
    try {
      await writeFileTool.execute({ path: 'f.txt', content: 'alpha beta' }, { cwd: ws, mode: 'passon' });
      const result = await editFileTool.execute(
        { path: 'f.txt', old_string: 'alpha', new_string: 'gamma' },
        { cwd: ws, mode: 'passon' },
      );
      expect(result.success).toBe(true);
      expect(readFileSync(join(ws, 'f.txt'), 'utf8')).toBe('gamma beta');
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it('rejects paths escaping ctx.cwd', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'mcode-ctxcwd-'));
    try {
      const result = await writeFileTool.execute(
        { path: '../../escape.txt', content: 'x' },
        { cwd: ws, mode: 'passon' },
      );
      expect(result.success).toBe(false);
      expect(result.output).toContain('escapes the workspace');
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });
});
