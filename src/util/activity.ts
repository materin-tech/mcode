export type ActivityCounts = Record<string, number>;

const PHRASES: Record<string, (n: number) => string> = {
  read_file: (n) => `read ${n} ${n === 1 ? 'file' : 'files'}`,
  write_file: (n) => `wrote ${n} ${n === 1 ? 'file' : 'files'}`,
  edit_file: (n) => `edited ${n} ${n === 1 ? 'file' : 'files'}`,
  bash: (n) => `ran ${n} shell ${n === 1 ? 'command' : 'commands'}`,
  glob: (n) => `searched ${n} ${n === 1 ? 'time' : 'times'}`,
  grep: (n) => `searched ${n} ${n === 1 ? 'time' : 'times'}`,
  task: (n) => `dispatched ${n} ${n === 1 ? 'subagent' : 'subagents'}`,
  skill: (n) => `loaded ${n} ${n === 1 ? 'skill' : 'skills'}`,
};

/**
 * Aggregate tool-call counts into a Claude Code style activity line,
 * e.g. "read 2 files, ran 8 shell commands".
 */
export function summarizeActivity(counts: ActivityCounts): string {
  const parts: string[] = [];
  for (const [name, n] of Object.entries(counts)) {
    if (n <= 0) continue;
    const phrase = PHRASES[name]?.(n) ?? `${name} ×${n}`;
    parts.push(phrase);
  }
  return parts.join(', ');
}

/** Seconds → "2m 56s" / "45s" style duration. */
export function formatDuration(totalSeconds: number): string {
  const secs = Math.max(0, Math.round(totalSeconds));
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

/** Current wall-clock as HH:MM (for the done footer). */
export function clockNow(date = new Date()): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
