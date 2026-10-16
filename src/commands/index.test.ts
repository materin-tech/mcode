/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expect } from 'vitest';
import { parseCommand, matchCommands } from './index.js';
import { createCommandList } from './builtin.js';

describe('parseCommand', () => {
  it('parses bare slash command', () => {
    expect(parseCommand('/help')).toEqual({ name: 'help', args: '' });
  });

  it('parses command with args', () => {
    expect(parseCommand('/model gpt-5')).toEqual({ name: 'model', args: 'gpt-5' });
  });

  it('returns null for non-commands', () => {
    expect(parseCommand('hello')).toBeNull();
    expect(parseCommand('path/to/file')).toBeNull();
    expect(parseCommand('/')).toBeNull();
  });
});

describe('matchCommands', () => {
  const commands = createCommandList();
  it('filters by prefix', () => {
    const names = matchCommands(commands, 'c').map((c) => c.name);
    expect(names).toContain('clear');
    expect(names).toContain('compact');
    expect(names).not.toContain('help');
  });

  it('is case-insensitive', () => {
    expect(matchCommands(commands, 'HELP')).toHaveLength(1);
  });

  it('full command set aligns with claude code (v1)', () => {
    const names = commands.map((c) => c.name);
    for (const required of [
      'help', 'clear', 'compact', 'model', 'token', 'language', 'status',
      'doctor', 'save', 'resume', 'exit',
      'context', 'export', 'rewind', 'todos', 'copy', 'config', 'permissions',
      'agents', 'hooks', 'mcp', 'init', 'add-dir', 'memory', 'vim',
      'terminal-setup', 'statusline', 'output-style', 'login', 'logout',
      'bug', 'release-notes',
    ]) {
      expect(names).toContain(required);
    }
  });
});
