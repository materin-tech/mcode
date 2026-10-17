import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from './context.js';

describe('buildSystemPrompt decision policy', () => {
  const prompt = buildSystemPrompt({ language: 'zh_CN', toolNames: ['read_file'] });

  it('puts the answer-first policy before the tool list', () => {
    const policyIdx = prompt.indexOf('DECISION POLICY');
    const directIdx = prompt.indexOf('answer directly');
    const toolsIdx = prompt.indexOf('Available tools:');
    expect(policyIdx).toBeGreaterThan(-1);
    expect(directIdx).toBeGreaterThan(policyIdx);
    expect(toolsIdx).toBeGreaterThan(directIdx);
  });

  it('restores rule 4 and keeps 5/6 intact (patch-damage regression)', () => {
    expect(prompt).toContain('never explore files "just in case"');
    expect(prompt).toContain('NEVER end a turn by only listing your limitations');
    expect(prompt).not.toContain('replaceable-anchor');
  });

  it('includes PUA closure discipline (no self-report completion)', () => {
    expect(prompt).toContain('CLOSURE DISCIPLINE (non-negotiable)');
    expect(prompt).toContain('run an actual verification against the real artifact');
    expect(prompt).toContain('A completion claim without verification evidence is a failed task');
  });

  it('includes the long-task incremental protocol', () => {
    expect(prompt).toContain('LONG TASKS: work incrementally');
    expect(prompt).toContain('NEVER emit an entire large deliverable');
  });

  it('explicitly forbids tools for conversational questions', () => {
    expect(prompt).toContain('call NO tools');
    expect(prompt).toContain('never explore files');
  });

  it('forbids limitation-only dead ends and pushes toward outcomes', () => {
    expect(prompt).toContain('NEVER end a turn by only listing your limitations');
    expect(prompt).toContain('`websearch` and `webfetch`');
    expect(prompt).toContain('ONE concrete follow-up question');
  });

  it('keeps language directive and skill index', () => {
    expect(prompt).toContain('Simplified Chinese');
    const withSkills = buildSystemPrompt({
      language: 'zh_CN',
      toolNames: [],
      skills: [{ name: 'demo', description: 'd' }],
    });
    expect(withSkills).toContain('Skill index:');
  });
});
