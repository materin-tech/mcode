/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { App } from './App.js';
import { createCommandList } from '../commands/builtin.js';
import { createT } from './locales.js';
import { appendInputHistory } from '../util/input-history.js';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { McodeConfig } from '../config/config.js';
import type { AppProps, TurnHandle } from './App.js';

const TMP_HOME = join(process.cwd(), '.tmp-home');
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

function makeConfig(): McodeConfig {
  return {
    language: 'en_US',
    activeProvider: 'test',
    activeModel: 'test-model',
    providers: [{
      name: 'test',
      baseURL: 'https://api.test/v1',
      apiKeyEnv: 'TEST_KEY',
      models: ['test-model'],
    }],
    defaultMode: 'passon',
  };
}

function fakeRunTurn(): (input: string, handle: TurnHandle) => Promise<void> {
  return async (input, handle) => {
    handle.emit({ type: 'text_delta', text: `echo:${input}` });
    handle.emit({ type: 'done', reply: `echo:${input}` });
  };
}

function baseProps(overrides: Partial<AppProps> = {}): AppProps {
  return {
    config: makeConfig(),
    cwd: process.cwd(),
    version: 'test',
    t: createT('en_US'),
    commands: createCommandList(),
    listFiles: () => [
      { insertValue: 'src/a.ts', label: 'src/a.ts' },
      { insertValue: 'src/b.ts', label: 'src/b.ts' },
    ],
    runTurn: fakeRunTurn(),
    saveConfig: () => {},
    getUsage: () => [],
    listAgents: () => [],
    listSkills: () => [],
    ...overrides,
  };
}

async function typeText(instance: { stdin: { write: (s: string) => void } }, text: string): Promise<void> {
  for (const ch of text) {
    instance.stdin.write(ch);
    await new Promise((r) => setTimeout(r, 5));
  }
}

async function pressKey(instance: { stdin: { write: (s: string) => void } }, key: string): Promise<void> {
  instance.stdin.write(key);
  await new Promise((r) => setTimeout(r, 20));
}

function lastFrame(instance: { lastFrame: () => string | undefined }): string {
  return instance.lastFrame() ?? '';
}


async function renderApp(props: AppProps) {
  const instance = render(<App {...props} />);
  // wait for useInput's effect to register its stdin listener
  await new Promise((r) => setTimeout(r, 80));
  return instance;
}

describe('App terminal simulation (ink-testing-library)', () => {
  it('renders banner and input placeholder', async () => {
    const instance = await renderApp(baseProps());
    const frame = lastFrame(instance);
    expect(frame).toContain('MCode');
    expect(frame).toContain('passon');
    instance.unmount();
  });

  it('typing shows text in input box, enter submits to agent', async () => {
    const runTurn = vi.fn(async (input: string, handle: TurnHandle) => {
      handle.emit({ type: 'text_delta', text: `echo:${input}` });
      handle.emit({ type: 'done', reply: `echo:${input}` });
      return;
    });
    const instance = await renderApp(baseProps({ runTurn }));
    await typeText(instance, 'hello');
    await pressKey(instance, '\r');
    await new Promise((r) => setTimeout(r, 50));
    expect(runTurn).toHaveBeenCalledWith('hello', expect.anything());
    expect(lastFrame(instance)).toContain('echo:hello');
    instance.unmount();
  });

  it("'/' opens command completion panel", async () => {
    const instance = await renderApp(baseProps());
    await pressKey(instance, '/');
    expect(lastFrame(instance)).toContain('/help');
    expect(lastFrame(instance)).toContain('› /');
    instance.unmount();
  });

  it("'/' filter narrows candidates as you type", async () => {
    const instance = await renderApp(baseProps());
    await typeText(instance, '/cl');
    const frame = lastFrame(instance);
    expect(frame).toContain('/clear');
    expect(frame).not.toContain('/help —');
    instance.unmount();
  });

  it('tab completes the selected command', async () => {
    const instance = await renderApp(baseProps());
    await typeText(instance, '/cl');
    await pressKey(instance, '\t');
    expect(lastFrame(instance)).toContain('❯ /clear');
    instance.unmount();
  });

  it('backspace edits and deletes trigger reopens panel', async () => {
    const instance = await renderApp(baseProps());
    await typeText(instance, '/cl');
    await pressKey(instance, '\x7f');
    expect(lastFrame(instance)).toContain('/c');
    // delete back to just '/': panel shows full list again
    await pressKey(instance, '\x7f');
    expect(lastFrame(instance)).toContain('/help');
    instance.unmount();
  });

  it('shift+tab cycles permission mode', async () => {
    const instance = await renderApp(baseProps());
    expect(lastFrame(instance)).toContain('passon');
    await pressKey(instance, '\x1b[Z');
    expect(lastFrame(instance)).toContain('manual');
    await pressKey(instance, '\x1b[Z');
    expect(lastFrame(instance)).toContain('auto');
    await pressKey(instance, '\x1b[Z');
    expect(lastFrame(instance)).toContain('plan');
    await pressKey(instance, '\x1b[Z');
    expect(lastFrame(instance)).toContain('passon');
    instance.unmount();
  });

  it('recall history with up arrow after submit', async () => {
    appendInputHistory('previous input', process.cwd());
    const instance = await renderApp(baseProps());
    await pressKey(instance, '\x1b[A');
    expect(lastFrame(instance)).toContain('previous input');
    // down arrow restores empty draft (no draft was typed)
    await pressKey(instance, '\x1b[B');
    instance.unmount();
  });

  it('down arrow restores unsent draft after recall', async () => {
    appendInputHistory('old one', process.cwd());
    const instance = await renderApp(baseProps());
    await typeText(instance, 'my draft');
    await pressKey(instance, '\x1b[A');
    expect(lastFrame(instance)).toContain('old one');
    await pressKey(instance, '\x1b[B');
    expect(lastFrame(instance)).toContain('my draft');
    instance.unmount();
  });

  it('@ opens file completion and tab inserts path', async () => {
    const instance = await renderApp(baseProps());
    await pressKey(instance, '@');
    expect(lastFrame(instance)).toContain('src/a.ts');
    await typeText(instance, 'a.ts');
    expect(lastFrame(instance)).toContain('src/a.ts');
    expect(lastFrame(instance)).not.toContain('src/b.ts');
    await pressKey(instance, '\t');
    expect(lastFrame(instance)).toContain('@src/a.ts ');
    instance.unmount();
  });

  it('executes /status command on enter', async () => {
    const instance = await renderApp(baseProps());
    await typeText(instance, '/status');
    await pressKey(instance, '\r');
    await new Promise((r) => setTimeout(r, 30));
    const frame = lastFrame(instance);
    expect(frame).toContain('model: test-model');
    instance.unmount();
  });

  it('prints notice for unknown command', async () => {
    const instance = await renderApp(baseProps());
    await typeText(instance, '/nope');
    await pressKey(instance, '\r');
    const frame = lastFrame(instance);
    expect(frame).toContain('unknown command');
    instance.unmount();
  });

  it('first launch without provider shows setup guide', async () => {
    const config = makeConfig();
    config.providers = [];
    config.activeProvider = null;
    const saveConfig = vi.fn();
    const instance = await renderApp(baseProps({ config, saveConfig }));
    expect(lastFrame(instance)).toContain('first launch setup');
    instance.unmount();
  });

  it('guide completes and persists config', async () => {
    const config = makeConfig();
    config.providers = [];
    config.activeProvider = null;
    const saveConfig = () => {};
    const instance = await renderApp(baseProps({ config, saveConfig }));
    // language select (en_US preselected) → enter
    await pressKey(instance, '\r');
    // provider name
    await typeText(instance, 'prov');
    await pressKey(instance, '\r');
    // baseURL
    await typeText(instance, 'https://api.test/v1');
    await pressKey(instance, '\r');
    // apiKeyEnv
    await typeText(instance, 'MY_KEY');
    await pressKey(instance, '\r');
    // models
    await typeText(instance, 'm1,m2');
    await pressKey(instance, '\r');
    // mode select → enter (passon)
    await pressKey(instance, '\r');
    await new Promise((r) => setTimeout(r, 30));
    expect(config.providers).toHaveLength(1);
    expect(config.providers[0]!.name).toBe('prov');
    expect(config.language).toBe('en_US');
    instance.unmount();
  });
});

const testWs = join(process.cwd(), '.tmp-ws');

describe('App @-ref injection and command wiring (integration)', () => {
  beforeEach(() => {
    rmSync(testWs, { recursive: true, force: true });
    mkdirSync(join(testWs, 'src'), { recursive: true });
    writeFileSync(join(testWs, 'src', 'a.ts'), 'export const A = 1;\n');
  });
  afterEach(() => {
    rmSync(testWs, { recursive: true, force: true });
  });


  it('@ref in submitted message injects file content into runTurn input', async () => {
    const runTurn = vi.fn(async (input: string, handle: TurnHandle) => {
      handle.emit({ type: 'text_delta', text: 'ok' });
      handle.emit({ type: 'done', reply: 'ok' });
    });
    const instance = await renderApp(baseProps({ runTurn, cwd: testWs }));
    await typeText(instance, 'explain @src/a.ts');
    await pressKey(instance, '\r');
    await new Promise((r) => setTimeout(r, 50));
    const arg = runTurn.mock.calls[0]?.[0] as string;
    expect(arg).toContain('explain @src/a.ts');
    expect(arg).toContain('--- file: src/a.ts ---');
    expect(arg).toContain('export const A = 1;');
    instance.unmount();
  });

  it('/save exports a snapshot file via onSnapshot', async () => {
    const onSnapshot = vi.fn(() => '/tmp/snap.md');
    const instance = await renderApp(baseProps({ onSnapshot }));
    await typeText(instance, '/save');
    await pressKey(instance, '\r');
    await new Promise((r) => setTimeout(r, 30));
    expect(onSnapshot).toHaveBeenCalledTimes(1);
    expect(lastFrame(instance)).toContain('snapshot → /tmp/snap.md');
    instance.unmount();
  });
});

describe('model picker (terminal simulation)', () => {
  it('/model opens interactive picker, enter switches and persists', async () => {
    const config = makeConfig();
    config.providers[0]!.models = ['m-one', 'm-two', 'm-three'];
    config.activeModel = 'm-one';
    const saveConfig = vi.fn();
    const instance = await renderApp(baseProps({ config, saveConfig }));
    await typeText(instance, '/model');
    await pressKey(instance, '\r');
    await new Promise((r) => setTimeout(r, 30));
    expect(lastFrame(instance)).toContain('select model');
    expect(lastFrame(instance)).toContain('m-one');
    // select m-two (down, enter)
    await pressKey(instance, '\x1b[B');
    await pressKey(instance, '\r');
    await new Promise((r) => setTimeout(r, 30));
    expect(config.activeModel).toBe('m-two');
    expect(saveConfig).toHaveBeenCalled();
    expect(lastFrame(instance)).toContain('model → m-two');
    instance.unmount();
  });

  it('esc cancels the picker without changing model', async () => {
    const config = makeConfig();
    config.providers[0]!.models = ['m-one', 'm-two'];
    config.activeModel = 'm-one';
    const instance = await renderApp(baseProps({ config }));
    await typeText(instance, '/model');
    await pressKey(instance, '\r');
    await pressKey(instance, '\x1b');
    await new Promise((r) => setTimeout(r, 30));
    expect(config.activeModel).toBe('m-one');
    instance.unmount();
  });
});

describe('staged output rendering (terminal simulation)', () => {
  it('tool round then new text yields activity line + fresh assistant block + footer', async () => {
    const runTurn = vi.fn(async (input: string, handle: TurnHandle) => {
      handle.emit({ type: 'text_delta', text: 'first stage' });
      handle.emit({ type: 'tool_start', name: 'read_file', args: {} });
      handle.emit({ type: 'tool_result', name: 'read_file', ok: true, detail: 'ok' });
      handle.emit({ type: 'text_delta', text: 'second stage' });
      handle.emit({ type: 'done', reply: '' });
    });
    const instance = await renderApp(baseProps({ runTurn }));
    await typeText(instance, 'go');
    await pressKey(instance, '\r');
    await new Promise((r) => setTimeout(r, 200));
    const frame = lastFrame(instance);
    expect(frame).toContain('first stage');
    expect(frame).toContain('second stage');
    expect(frame).toContain('Read 1 file');
    expect(frame).toContain('* Cooked for');
    instance.unmount();
  });

  it('live status line ticks while waiting for first token (CC style)', async () => {
    const runTurn = vi.fn(async (input: string, handle: TurnHandle) => {
      await new Promise((r) => setTimeout(r, 1300));
      handle.emit({ type: 'text_delta', text: 'late reply' });
      handle.emit({ type: 'done', reply: '' });
    });
    const instance = await renderApp(baseProps({ runTurn }));
    await typeText(instance, 'hi');
    await pressKey(instance, '\r');
    await new Promise((r) => setTimeout(r, 600));
    // live CC-style line: · <Verb>… (Ns · thinking)
    expect(lastFrame(instance)).toMatch(/· \w+… \(\d+s · thinking\)/);
    await new Promise((r) => setTimeout(r, 1200));
    expect(lastFrame(instance)).toContain('late reply');
    instance.unmount();
  }, 6000);
});


describe('reasoning display (terminal simulation)', () => {
  it('streams thinking content and suppresses the plain Thought-for-Ns line', async () => {
    const runTurn = vi.fn(async (input: string, handle: TurnHandle) => {
      handle.emit({ type: 'reasoning_delta', text: '用户要赛车游戏，先写 index.html' });
      handle.emit({ type: 'text_delta', text: '开始实现' });
      handle.emit({ type: 'done', reply: '' });
    });
    const instance = await renderApp(baseProps({ runTurn }));
    await typeText(instance, 'go');
    await pressKey(instance, '\r');
    await new Promise((r) => setTimeout(r, 200));
    const frame = lastFrame(instance);
    expect(frame).toContain('✻');
    expect(frame).toContain('用户要赛车游戏');
    expect(frame).toContain('开始实现');
    expect(frame).not.toContain('Thought for');
    instance.unmount();
  });
});

describe('queued interjection (terminal simulation)', () => {
  it('Enter during a running turn queues the message and runs it after completion', async () => {
    const calls: string[] = [];
    const secondGate: { resolve: () => void } = { resolve: () => {} };
    const runTurn = vi.fn(async (input: string, handle: TurnHandle) => {
      calls.push(input);
      if (calls.length === 1) {
        // hold the first turn open until we've queued the second message
        await new Promise<void>((r) => { secondGate.resolve = r; });
        handle.emit({ type: 'text_delta', text: 'first done' });
        handle.emit({ type: 'done', reply: '' });
      } else {
        handle.emit({ type: 'text_delta', text: `second:${input}` });
        handle.emit({ type: 'done', reply: '' });
      }
    });
    const instance = await renderApp(baseProps({ runTurn }));
    await typeText(instance, 'first task');
    await pressKey(instance, '\r');
    await new Promise((r) => setTimeout(r, 100));
    // busy now — type and Enter should queue, not run
    await typeText(instance, 'interjection');
    await pressKey(instance, '\r');
    await new Promise((r) => setTimeout(r, 50));
    expect(lastFrame(instance)).toContain('queued: interjection');
    expect(calls).toHaveLength(1);
    secondGate.resolve();
    await new Promise((r) => setTimeout(r, 200));
    expect(calls).toEqual(['first task', 'interjection']);
    expect(lastFrame(instance)).toContain('second:interjection');
    instance.unmount();
  });
});


describe('multi-line paste (terminal simulation)', () => {
  it('bracketed paste inserts full text with newlines, no early submit', async () => {
    const runTurn = vi.fn(async (input: string, handle: TurnHandle) => {
      handle.emit({ type: 'text_delta', text: 'ok' });
      handle.emit({ type: 'done', reply: '' });
    });
    const instance = await renderApp(baseProps({ runTurn }));
    const pasted = 'CLAUDE code就没有超时\n\n· Caramelizing… (19s · thinking)';
    // bracketed paste arrives as ONE stdin write
    instance.stdin.write(`\x1b[200~${pasted}\x1b[201~`);
    await new Promise((r) => setTimeout(r, 50));
    expect(lastFrame(instance)).toContain('Caramelizing… (19s · thinking)');
    expect(lastFrame(instance)).toContain('CLAUDE code就没有超时');
    await pressKey(instance, '\r');
    await new Promise((r) => setTimeout(r, 50));
    expect(runTurn).toHaveBeenCalledWith(pasted, expect.anything());
    instance.unmount();
  });
});
