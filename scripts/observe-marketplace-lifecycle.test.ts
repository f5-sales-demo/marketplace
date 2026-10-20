import { expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import observe from './observe-marketplace-lifecycle';

const expected = 'asm-migration: ready (setup is not required)';
const delay = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms));

async function harness(check: (state: any) => Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), 'lifecycle-observer-'));
  const previousRoot = process.env.MARKETPLACE_LIFECYCLE_ROOT;
  const previousExpected = process.env.MARKETPLACE_LIFECYCLE_EXPECTED;
  process.env.MARKETPLACE_LIFECYCLE_ROOT = root;
  process.env.MARKETPLACE_LIFECYCLE_EXPECTED = expected;
  const handlers = new Map<string, any>();
  const commands = new Map<string, any>();
  let closed = 0;
  let active: string[] | undefined;
  let component: any;
  let appearanceGate: Promise<void> = Promise.resolve();
  const dispatched = { render: () => [expected], invalidate() {} };
  const tui = { children: [dispatched], render: () => [expected], requestRender() {} };
  const api = {
    pi: { VERSION: 'synthetic', setSymbolPreset: () => appearanceGate },
    on: (name: string, handler: any) => handlers.set(name, handler),
    setActiveTools: (names: string[]) => {
      active = names;
    },
    registerCommand: (name: string, command: any) => commands.set(name, command),
  };
  const ctx = {
    ui: {
      setTheme: async () => ({ success: true }),
      custom: async (factory: any) => {
        component = factory(tui, {}, {}, () => closed++);
      },
    },
  };
  try {
    observe(api);
    await handlers.get('session_start')();
    await commands.get('marketplace-lifecycle-capture').handler('', ctx);
    await check({
      root,
      handlers,
      component,
      active: () => active,
      closed: () => closed,
      gate: (promise: Promise<void>) => {
        appearanceGate = promise;
      },
      control: (value: any) => writeFileSync(join(root, 'control.json'), JSON.stringify(value)),
    });
  } finally {
    handlers.get('session_shutdown')?.();
    await delay();
    if (previousRoot === undefined) delete process.env.MARKETPLACE_LIFECYCLE_ROOT;
    else process.env.MARKETPLACE_LIFECYCLE_ROOT = previousRoot;
    if (previousExpected === undefined) delete process.env.MARKETPLACE_LIFECYCLE_EXPECTED;
    else process.env.MARKETPLACE_LIFECYCLE_EXPECTED = previousExpected;
    rmSync(root, { recursive: true });
  }
}
const control = {
  id: 'frame',
  case: 'dispatched-lifecycle',
  width: 40,
  expanded: false,
  theme: 'xcsh-dark',
  preset: 'ascii',
};

test('guards all model tools and rejects a missing frame identity', async () => {
  await harness(async (state) => {
    expect(state.active()).toEqual([]);
    expect(state.handlers.get('tool_call')({ toolName: 'bash' }).block).toBe(true);
    const { id: _id, ...missing } = control;
    state.control(missing);
    await delay();
    expect(existsSync(join(state.root, 'frames/undefined.json'))).toBe(false);
    expect(existsSync(join(state.root, 'error.json'))).toBe(true);
  });
});

test('cancellation closes once and discards an appearance update that finishes late', async () => {
  await harness(async (state) => {
    let release!: () => void;
    state.gate(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    state.control(control);
    await delay();
    state.component.handleInput('\u001b');
    state.component.handleInput('\u001b');
    release();
    await delay();
    expect(state.closed()).toBe(1);
    expect(existsSync(join(state.root, 'frames/frame.json'))).toBe(false);
    expect(existsSync(join(state.root, 'ack.json'))).toBe(false);
  });
});

test('normal finish stops capture and records the closure', async () => {
  await harness(async (state) => {
    state.control({ action: 'finish' });
    await delay();
    expect(state.closed()).toBe(1);
    expect(readFileSync(join(state.root, 'events.jsonl'), 'utf8')).toContain('capture_closed');
    state.control(control);
    await delay();
    expect(existsSync(join(state.root, 'frames/frame.json'))).toBe(false);
  });
});

test('session shutdown discards a pending appearance update and closes capture once', async () => {
  await harness(async (state) => {
    let release!: () => void;
    state.gate(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    state.control(control);
    await delay();
    state.handlers.get('session_shutdown')();
    release();
    await delay();
    expect(state.closed()).toBe(1);
    expect(existsSync(join(state.root, 'frames/frame.json'))).toBe(false);
    expect(existsSync(join(state.root, 'ack.json'))).toBe(false);
  });
});
