import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { App, type AppProps, type TurnHandle } from './App.js';
import { createCommandList } from '../commands/builtin.js';
import { createT } from './locales.js';
import type { McodeConfig } from '../config/config.js';

const TMP_HOME = join(process.cwd(), '.tmp-home-c');
let origHome: string | undefined;
beforeEach(() => {
  rmSync(TMP_HOME, { recursive: true, force: true });
  origHome = process.env['HOME'];
  process.env['HOME'] = TMP_HOME;
});
afterEach(() => {
  process.env['HOME'] = origHome;
  rmSync(TMP_HOME, { recursive: true, force: true });
});
function cfg(): McodeConfig {
  return {
    language: 'en_US', activeProvider: 't', activeModel: 'm',
    providers: [{ name: 't', baseURL: 'u', apiKeyEnv: 'K', models: ['m'] }],
    defaultMode: 'passon',
  };
}
function baseProps(overrides: Partial<AppProps> = {}): AppProps {
  return {
    config: cfg(), cwd: process.cwd(), version: 't', t: createT('en_US'),
    commands: createCommandList(), listFilesAsync: async () => [], runTurn: async () => {},
    saveConfig: () => {}, getUsage: () => [],
    listAgents: () => [], listSkills: () => [], historyStats: () => ({ cwdEntries: 0, globalEntries: 0, file: '' }),
    setPuaAlwaysOn: () => {},
    ...overrides,
  };
}
async function renderApp(props: AppProps) {
  const instance = render(<App {...props} />);
  await new Promise((r) => setTimeout(r, 80));
  return instance;
}
async function typeText(instance: { stdin: { write: (s: string) => void } }, text: string): Promise<void> {
  for (const ch of text) { instance.stdin.write(ch); await new Promise((r) => setTimeout(r, 5)); }
}
async function pressKey(instance: { stdin: { write: (s: string) => void } }, key: string): Promise<void> {
  instance.stdin.write(key);
  await new Promise((r) => setTimeout(r, 20));
}
function lastFrame(instance: { lastFrame: () => string | undefined }): string {
  return instance.lastFrame() ?? '';
}
describe('reasoning collapse/expand (terminal simulation)', () => {
  it('default collapses to tail lines; ctrl+o expands to full content', async () => {
    const lines = Array.from({ length: 20 }, (_, i) => `step-${i + 1}`);
    const runTurn = vi.fn(async (input: string, handle: TurnHandle) => {
      for (const line of lines) {
        handle.emit({ type: 'reasoning_delta', text: line + '\n' });
      }
      handle.emit({ type: 'text_delta', text: 'answer' });
      handle.emit({ 'type': 'done', reply: '' } as never);
    });
    const instance = await renderApp(baseProps({ runTurn }));
    instance.stdin.write('go');
    await new Promise((r) => setTimeout(r, 50));
    instance.stdin.write('\r');
    await new Promise((r) => setTimeout(r, 400));
    let frame = lastFrame(instance);
    // collapsed: tail visible, head hidden
    expect(frame).toContain('step-20');
    expect(frame).toContain('step-16');
    expect(frame).not.toContain('step-1\\n');
    expect(frame).toContain('ctrl+o expand');
    // ctrl+o expands
    await pressKey(instance, '\x0f');
    await new Promise((r) => setTimeout(r, 80));
    frame = lastFrame(instance);
    expect(frame).toContain('step-1');
    expect(frame).toContain('ctrl+o collapse');
    // ctrl+o collapses again
    await pressKey(instance, '\x0f');
    await new Promise((r) => setTimeout(r, 80));
    expect(lastFrame(instance)).toContain('ctrl+o expand');
    instance.unmount();
  });
});

describe('memory bounds (OOM regression)', () => {
  it('reasoning text is capped at 30k chars (tail preserved)', async () => {
    const big = 'x'.repeat(120_000);
    const runTurn = async (input: string, handle: TurnHandle) => {
      handle.emit({ type: 'reasoning_delta', text: big });
      handle.emit({ type: 'text_delta', text: 'ok' });
      handle.emit({ type: 'done', reply: '' });
    };
    const instance = await renderApp(baseProps({ runTurn }));
    instance.stdin.write('go');
    await new Promise((r) => setTimeout(r, 50));
    instance.stdin.write('\r');
    await new Promise((r) => setTimeout(r, 300));
    const frame = lastFrame(instance);
    expect(frame).toContain('ok');
    instance.unmount();
  });
});
