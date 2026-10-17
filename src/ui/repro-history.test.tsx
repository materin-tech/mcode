import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { App } from './App.js';
import { createCommandList } from '../commands/builtin.js';
import { createT } from './locales.js';
import type { McodeConfig } from '../config/config.js';
import type { AppProps, TurnHandle } from './App.js';

const TMP_HOME = join(process.cwd(), '.tmp-home-h');
let origHome: string | undefined;
beforeEach(() => {
  rmSync(TMP_HOME, { recursive: true, force: true });
  origHome = process.env['HOME'];
  process.env['HOME'] = TMP_HOME;
  // 模拟已有历史（当前 cwd）
  const mdir = join(TMP_HOME, '.mcode');
  mkdirSync(mdir, { recursive: true });
  const cwd = process.cwd();
  const line = (t: string) => JSON.stringify({ text: t, cwd, ts: Date.now() }) + '\n';
  writeFileSync(join(mdir, 'history.jsonl'), line('previous input one') + line('previous input two'));
});
afterEach(() => {
  process.env['HOME'] = origHome;
  rmSync(TMP_HOME, { recursive: true, force: true });
});
function lastFrameRepro(instance: { lastFrame: () => string | undefined }): string {
  return instance.lastFrame() ?? '';
}

function cfg(): McodeConfig {
  return {
    language: 'en_US', activeProvider: 't', activeModel: 'm',
    providers: [{ name: 't', baseURL: 'u', apiKeyEnv: 'K', models: ['m'] }],
    defaultMode: 'passon',
  };
}
describe('repro: up arrow recall', () => {
  it('recalls after submit', async () => {
    const runTurn = async (input: string, handle: TurnHandle) => {
      handle.emit({ type: 'text_delta', text: 'ok' });
      handle.emit({ type: 'done', reply: '' });
    };
    const props: AppProps = {
      config: cfg(), cwd: process.cwd(), version: 't', t: createT('en_US'),
      commands: createCommandList(), listFilesAsync: async () => [],
      runTurn, saveConfig: () => {}, getUsage: () => [],
      listAgents: () => [], listSkills: () => [], historyStats: () => ({ cwdEntries: 0, globalEntries: 0, file: '' }),
      setPuaAlwaysOn: () => {},
    };
    const instance = render(<App {...props} />);
    await new Promise((r) => setTimeout(r, 80));
    instance.stdin.write('typed message');
    await new Promise((r) => setTimeout(r, 40));
    instance.stdin.write('\r');
    await new Promise((r) => setTimeout(r, 60));
    instance.stdin.write('\x1b[A');
    await new Promise((r) => setTimeout(r, 80));
    const inputLine = lastFrameRepro(instance).split('\n').find((l) => l.includes('❯'));
    const frame = lastFrameRepro(instance);
    // ↑ recalls the most recent submitted input into the box (shell semantics):
    // input line shows it with cursor (recalled), transcript shows it without
    expect(frame).toContain('❯ typed message▌');
    instance.unmount();
  });
});
