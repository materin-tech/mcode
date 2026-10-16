import { describe, it, expect } from 'vitest';
import { summarizeActivity, formatDuration, clockNow } from './activity.js';

describe('summarizeActivity', () => {
  it('aggregates like claude code activity lines', () => {
    expect(summarizeActivity({ read_file: 2, bash: 8 })).toBe('read 2 files, ran 8 shell commands');
  });

  it('singularises single counts', () => {
    expect(summarizeActivity({ read_file: 1 })).toBe('read 1 file');
    expect(summarizeActivity({ bash: 1 })).toBe('ran 1 shell command');
  });

  it('handles unknown tools generically', () => {
    expect(summarizeActivity({ custom_tool: 3 })).toBe('custom_tool ×3');
  });

  it('skips zero counts and returns empty for none', () => {
    expect(summarizeActivity({ read_file: 0 })).toBe('');
    expect(summarizeActivity({})).toBe('');
  });

  it('covers subagents and edits', () => {
    expect(summarizeActivity({ task: 2, edit_file: 1, grep: 4 })).toBe(
      'dispatched 2 subagents, edited 1 file, searched 4 times',
    );
  });
});

describe('formatDuration / clockNow', () => {
  it('formats sub-minute and multi-minute durations', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(176)).toBe('2m 56s');
    expect(formatDuration(120)).toBe('2m');
  });

  it('clock is HH:MM zero-padded', () => {
    expect(clockNow(new Date(2026, 0, 1, 23, 8))).toBe('23:08');
  });
});
