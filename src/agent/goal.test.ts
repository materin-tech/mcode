import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildGoalPrompt, checkGoalComplete } from './goal.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildGoalPrompt', () => {
  it('embeds the goal and asks for GOAL_COMPLETE when done', () => {
    const p = buildGoalPrompt('build a trello board');
    expect(p).toContain('[goal] build a trello board');
    expect(p).toContain('GOAL_COMPLETE');
  });
});

describe('checkGoalComplete', () => {
  const base = {
    goal: 'g',
    baseURL: 'https://api.test/v1',
    apiKey: 'k',
    model: 'm',
    language: 'en_US',
  };

  it('returns true on explicit GOAL_COMPLETE', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode('data: {"type":"response.output_text.delta","delta":"GOAL_COMPLETE"}\n\n'));
          c.close();
        },
      });
      return new Response(stream, { status: 200 });
    }));
    expect(await checkGoalComplete(base)).toBe(true);
  });

  it('returns false on GOAL_CONTINUE', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode('data: {"type":"response.output_text.delta","delta":"GOAL_CONTINUE"}\n\n'));
          c.close();
        },
      });
      return new Response(stream, { status: 200 });
    }));
    expect(await checkGoalComplete(base)).toBe(false);
  });

  it('fails open (false) when the judge call errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('oops', { status: 500 })));
    expect(await checkGoalComplete(base)).toBe(false);
  });
});
