import { describe, it, expect } from 'vitest';
import { parseEccAgent, mapEccTools, loadEccAgents } from './ecc-core.js';

describe('mapEccTools', () => {
  it('maps ECC tool names to mcode tools', () => {
    expect(mapEccTools('Read, Grep, Glob, Bash')).toEqual(['read_file', 'grep', 'glob', 'bash']);
  });

  it('returns undefined for all-tools and empty mapping', () => {
    expect(mapEccTools('All tools except Task')).toBeUndefined();
    expect(mapEccTools('*')).toBeUndefined();
    expect(mapEccTools('WebFetch, LlmPlugin')?.length).toBe(1);
    expect(mapEccTools('LlmPlugin, SidebarToolkit')).toBeUndefined();
  });
});

describe('parseEccAgent', () => {
  it('parses frontmatter name/description/tools and body as systemPrompt', () => {
    const raw = [
      '---',
      'name: code-reviewer',
      'description: Expert code review specialist.',
      'tools: Read, Grep, Glob, Bash',
      '---',
      '',
      'You are a senior code reviewer.',
      '## Review Process',
      '...body...',
    ].join('\n');
    const agent = parseEccAgent(raw, 'fallback');
    expect(agent).not.toBeNull();
    expect(agent!.name).toBe('code-reviewer');
    expect(agent!.tools).toEqual(['read_file', 'grep', 'glob', 'bash']);
    expect(agent!.systemPrompt).toContain('senior code reviewer');
  });

  it('returns null without description', () => {
    const raw = '---\nname: x\n---\nbody';
    expect(parseEccAgent(raw, 'x')).toBeNull();
  });

  it('caps huge agent bodies at 20k chars', () => {
    const raw = `---\nname: big\ndescription: d\n---\n${'x'.repeat(30_000)}`;
    expect(parseEccAgent(raw, 'big')!.systemPrompt.length).toBeLessThanOrEqual(20_000);
  });
});

describe('loadEccAgents (real bundled assets)', () => {
  it('loads the bundled ECC agent set', () => {
    const agents = loadEccAgents();
    expect(agents.length).toBeGreaterThanOrEqual(60);
    const names = agents.map((a) => a.name);
    expect(names).toContain('code-reviewer');
    expect(names).toContain('architect');
    expect(names).toContain('tdd-guide');
    for (const agent of agents) {
      expect(agent.description.length).toBeGreaterThan(0);
      expect(agent.systemPrompt.length).toBeGreaterThan(0);
    }
  });
});
