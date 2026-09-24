import { afterAll, describe, expect, it, spyOn } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  call,
  canonicalMeetingId,
  createZoomCommandHandler,
  deriveAwareness,
  deriveMeetingId,
  discoverActiveMeetingSession,
  discoverZoomSession,
  invitationToZoomMtg,
  parseZoomCommand,
  parseZoomToolInput,
} from '../plugins/zoom/extensions/integration';

const originalZoomStateDirectory = process.env.XCSH_ZOOM_STATE_DIR;
const zoomStateDirectory = mkdtempSync(join(tmpdir(), 'xcsh-zoom-test-state-'));
process.env.XCSH_ZOOM_STATE_DIR = zoomStateDirectory;
afterAll(() => {
  if (originalZoomStateDirectory === undefined) delete process.env.XCSH_ZOOM_STATE_DIR;
  else process.env.XCSH_ZOOM_STATE_DIR = originalZoomStateDirectory;
  rmSync(zoomStateDirectory, { recursive: true, force: true });
});

type Definition = {
  id: string;
  dependencies?: string[];
  setup?: {
    pluginDependencies: string[];
    requiredEnvironment: string[];
    profileFields: string[];
    steps: Array<{ kind: string; argv: string[]; timeoutMs: number }>;
    verification: Array<{ argv: string[]; timeoutMs: number }>;
    guidedAction?: { kind: 'context_wizard' };
  };
  probe(): Promise<{ state: string; reason?: string; retryAfterMs?: number; value?: unknown }>;
  profile?(value: unknown): { facts: Record<string, unknown>; observations: unknown[] };
};
type ToolDefinition = {
  name: string;
  label: string;
  parameters: unknown;
  execute: (...args: unknown[]) => Promise<unknown>;
};
type CommandDefinition = {
  name: string;
  description?: string;
  handler: (args: string, ctx: { ui: { notify(message: string, level?: string): void } }) => Promise<void>;
};
type AdvisoryDefinition = {
  id: string;
  capabilities: readonly string[];
  match: (event: unknown) => unknown;
};
type Definitions = Definition[] & {
  tools: ToolDefinition[];
  commands: CommandDefinition[];
  advisories: AdvisoryDefinition[];
};

async function definitionsFor(plugin: string, commandAvailable = false): Promise<Definitions> {
  const spawn = spyOn(Bun, 'spawnSync').mockReturnValue({
    exitCode: commandAvailable ? 0 : 1,
  } as ReturnType<typeof Bun.spawnSync>);
  const definitions: Definition[] = [];
  const tools: ToolDefinition[] = [];
  const commands: CommandDefinition[] = [];
  const advisories: AdvisoryDefinition[] = [];
  const handlers: Record<string, unknown[]> = {};
  const typeFactory = new Proxy(
    {
      Object(shape: Record<string, unknown>) {
        return { type: 'object', properties: shape };
      },
      String() {
        return { type: 'string' };
      },
      Unknown() {
        return {};
      },
      Record(_key: unknown, value: unknown) {
        return { type: 'object', additionalProperties: value };
      },
    },
    { get: (target, property) => Reflect.get(target, property) ?? (() => ({})) },
  );
  const pi = {
    setLabel() {},
    logger: { debug() {} },
    typebox: { Type: typeFactory },
    pi: {},
    personProfile: { get: async () => ({ facts: {} }) },
    integrations: {
      register(definition: Definition) {
        definitions.push(definition);
        return { get: async () => ({ state: 'setup_required' }) };
      },
    },
    advisories: {
      register(definition: AdvisoryDefinition) {
        advisories.push(definition);
        return () => {};
      },
      unregister() {
        return false;
      },
    },
    registerFlag() {},
    getFlag() {
      return false;
    },
    registerTool(definition: ToolDefinition) {
      tools.push(definition);
    },
    registerCommand(name: string, options: Omit<CommandDefinition, 'name'>) {
      commands.push({ name, ...options });
    },
    on(event: string, handler: unknown) {
      const eventHandlers = handlers[event] ?? [];
      eventHandlers.push(handler);
      handlers[event] = eventHandlers;
    },
  };
  const entrypoint =
    {
      cloudstatus: 'extensions/regional-edge-advisories.ts',
      devcontainer: 'extensions/integration.ts',
      firecrawl: 'extensions/integration.ts',
      herdr: 'extensions/integration.ts',
      terraform: 'extensions/integration.ts',
      xorg: 'extensions/integration.ts',
      zoom: 'extensions/integration.ts',
    }[plugin] ?? 'src/index.ts';
  const module = await import(`../plugins/${plugin}/${entrypoint}`);
  await module.default(pi);
  spawn.mockRestore();
  return Object.assign(definitions, { tools, commands, advisories });
}

describe('provider integration lifecycle', () => {
  it('keeps the Zoom controller on documented generic xorgctl calls', async () => {
    expect(canonicalMeetingId('123 456-789')).toBe('123456789');
    expect(() => canonicalMeetingId('1234')).toThrow('9 to 16');
    expect(parseZoomCommand('123 456 789').action).toBe('join');
    expect(parseZoomCommand('share browser')).toEqual({ action: 'share', args: ['browser'] });
    expect(invitationToZoomMtg('https://f5.zoom.us/j/123456789?pwd=secret')).toBe(
      'zoommtg://f5.zoom.us/join?action=join&confno=123456789&pwd=secret',
    );
    const source = await readFile(
      join(import.meta.dir, '..', 'plugins', 'zoom', 'extensions', 'integration.ts'),
      'utf8',
    );
    expect(source).not.toContain('app", "act');
    expect(source).not.toContain("key: 'ALT+");
    expect(source).toContain("{ action: 'chord', keys: ['Alt_L', key] }");
    expect(source).toContain("publicXorgCall(session, 'window', 'focus'");
    expect(source).toContain("item.name ?? '').trim().toLowerCase() === 'react'");
    let launched = false;
    const calls: string[][] = [];
    const spawn = spyOn(Bun, 'spawnSync').mockImplementation((argv) => {
      const command = [...argv] as string[];
      calls.push(command);
      const operation = command[command.indexOf('--json') + 1];
      if (operation === 'app') launched = true;
      const result =
        operation === 'window'
          ? { windows: launched ? [{ title: 'Meeting', pid: 42 }] : [] }
          : operation === 'inspect'
            ? { items: [{ name: 'Meeting ID 123 456 789', pid: 42 }] }
            : {};
      return {
        exitCode: 0,
        stdout: new TextEncoder().encode(JSON.stringify({ result })),
        stderr: new Uint8Array(),
      } as ReturnType<typeof Bun.spawnSync>;
    });
    try {
      expect(call('join', ['https://zoom.us/j/123456789?pwd=secret'])).toMatchObject({
        state: 'in_meeting',
        changed: true,
        verified: true,
        meeting_identity: '123456789',
      });
      expect(calls).toContainEqual([
        'xorgctl',
        '--session',
        'desktop',
        '--json',
        'app',
        'launch',
        '--params',
        JSON.stringify({
          argv: ['zoom', 'zoommtg://zoom.us/join?action=join&confno=123456789&pwd=secret'],
        }),
      ]);
    } finally {
      spawn.mockRestore();
    }
  });
  it('normalizes empty optional Zoom tool fields without inventing a join', () => {
    expect(parseZoomToolInput({ action: 'awareness', invitation_url: '', meeting_id: '' })).toEqual({
      action: 'awareness',
      args: [],
    });
    expect(() => parseZoomToolInput({ action: 'join', invitation_url: '', meeting_id: '' })).toThrow(
      'join requires invitation_url or meeting_id',
    );
    expect(() => parseZoomToolInput({ action: 'inspect' })).toThrow('unsupported Zoom action');
    expect(() =>
      parseZoomToolInput({ action: 'join', invitation_url: 'https://zoom.us/j/123456789', meeting_id: '123456789' }),
    ).toThrow('either invitation_url or meeting_id');
    expect(parseZoomToolInput({ action: 'audio', state: ' muted ' })).toEqual({ action: 'audio', args: ['muted'] });
  });
  it('executes a direct Zoom command exactly once without a model turn', async () => {
    const calls: Array<{ action: string; args: string[] }> = [];
    const notices: Array<{ message: string; level?: string }> = [];
    const handler = createZoomCommandHandler((action, args) => {
      calls.push({ action, args });
      return {
        exitCode: 0,
        control: action,
        changed: false,
        verified: true,
        evidence: { accessibility: { items: [{ name: 'large internal tree' }] } },
      };
    });

    await handler('stop-share', {
      ui: { notify: (message, level) => notices.push({ message, level }) },
    });

    expect(calls).toEqual([{ action: 'stop-share', args: [] }]);
    expect(notices).toHaveLength(1);
    expect(JSON.parse(notices[0].message)).toMatchObject({ control: 'stop-share', verified: true });
    expect(notices[0].message).not.toContain('large internal tree');
    expect(notices[0].level).toBe('info');
  });
  it('shares the named browser window with sound through verified generic Xorg primitives', () => {
    let pickerOpen = false;
    let targetSelected = false;
    let soundChecked = false;
    let sharing = false;
    const movedWindows: Array<{ window: number; workspace: number }> = [];
    const inputSteps: Array<Record<string, unknown>> = [];
    const spawn = spyOn(Bun, 'spawnSync').mockImplementation((argv) => {
      const command = [...argv] as string[];
      const session = command[command.indexOf('--session') + 1];
      const operation = command[command.indexOf('--json') + 1];
      const action = command[command.indexOf('--json') + 2];
      const paramsIndex = command.indexOf('--params');
      const params = paramsIndex >= 0 ? (JSON.parse(command[paramsIndex + 1]) as Record<string, unknown>) : {};
      let result: Record<string, unknown> = {};
      if (operation === 'window' && action === 'list') {
        result = {
          windows:
            session === 'console'
              ? [
                  ...(!sharing ? [{ id: 42, pid: 7, title: 'Meeting' }] : []),
                  { id: 84, pid: 8, title: 'xcsh Zoom AV UAT - Google Chrome' },
                  ...(sharing
                    ? [
                        { id: 127, pid: 7, title: 'annotate_toolbar' },
                        { id: 128, pid: 7, title: 'zoom_linux_float_video_window' },
                      ]
                    : []),
                  ...(pickerOpen
                    ? [{ id: 126, pid: 7, title: 'Select a window or an application that you want to share' }]
                    : []),
                ]
              : [],
        };
      } else if (operation === 'inspect' && action === 'accessibility') {
        result = {
          items:
            session !== 'console'
              ? []
              : sharing
                ? [{ name: 'Stop Share', role: 'push button', pid: 7, box: [900, 20, 100, 40] }]
                : pickerOpen
                  ? [
                      {
                        name: 'Select a window or an application that you want to share',
                        role: 'frame',
                        pid: 7,
                        box: [400, 200, 1000, 700],
                      },
                      {
                        name: 'xcsh Zoom AV UAT - Google Chrome',
                        role: 'filler',
                        pid: 7,
                        box: [460, 520, 720, 160],
                        selected: targetSelected,
                      },
                      {
                        name: 'Share sound',
                        role: 'check box',
                        pid: 7,
                        box: [1200, 580, 110, 28],
                        checked: soundChecked,
                      },
                      { name: 'Share', role: 'push button', pid: 7, box: [870, 830, 164, 32] },
                    ]
                  : [{ name: 'Share', role: 'push button', pid: 7, box: [1050, 900, 80, 50] }],
        };
      } else if (operation === 'input' && action === 'batch') {
        const steps = params.steps as Array<Record<string, unknown>>;
        inputSteps.push(...steps);
        for (const step of steps) {
          if (step.action === 'chord' && JSON.stringify(step.keys) === JSON.stringify(['Alt_L', 's']))
            pickerOpen = true;
          if (step.action !== 'click') continue;
          const x = Number(step.x);
          const y = Number(step.y);
          if (x === 580 && y === 600) targetSelected = true;
          if (x === 1255 && y === 594) soundChecked = true;
          if (x === 952 && y === 846 && targetSelected && soundChecked) {
            pickerOpen = false;
            sharing = true;
          }
          if (x === 950 && y === 40 && sharing) sharing = false;
        }
      } else if (operation === 'window' && action === 'workspace') {
        movedWindows.push({ window: Number(params.window), workspace: Number(params.workspace) });
      }
      return {
        exitCode: 0,
        stdout: new TextEncoder().encode(JSON.stringify({ result })),
        stderr: new Uint8Array(),
      } as ReturnType<typeof Bun.spawnSync>;
    });
    try {
      expect(call('share', ['browser'])).toMatchObject({
        exitCode: 0,
        control: 'share',
        target: 'browser_window',
        shared_sound: 'on',
        changed: true,
        verified: true,
      });
      expect(inputSteps).toContainEqual({ action: 'chord', keys: ['Alt_L', 's'] });
      expect(movedWindows).toEqual([
        { window: 127, workspace: 1 },
        { window: 128, workspace: 1 },
      ]);
      expect(inputSteps.some((step) => step.action === 'key' && String(step.key).includes('+'))).toBe(false);
      expect(call('stop-share', [])).toMatchObject({
        exitCode: 0,
        control: 'stop-share',
        previous: 'on',
        current: 'off',
        changed: true,
        verified: true,
      });
    } finally {
      spawn.mockRestore();
    }
  });
  it('retries a transient AT-SPI failure within the controller boundary', () => {
    let accessibilityCalls = 0;
    const spawn = spyOn(Bun, 'spawnSync').mockImplementation((argv) => {
      const command = [...argv] as string[];
      const session = command[command.indexOf('--session') + 1];
      const operation = command[command.indexOf('--json') + 1];
      const action = command[command.indexOf('--json') + 2];
      if (operation === 'window' && action === 'list') {
        return {
          exitCode: 0,
          stdout: new TextEncoder().encode(
            JSON.stringify({
              result: { windows: session === 'console' ? [{ id: 42, pid: 7, title: 'Meeting' }] : [] },
            }),
          ),
          stderr: new Uint8Array(),
        } as ReturnType<typeof Bun.spawnSync>;
      }
      if (operation === 'inspect' && action === 'accessibility') {
        accessibilityCalls += 1;
        if (accessibilityCalls === 1) {
          return { exitCode: 1, stdout: new Uint8Array(), stderr: new TextEncoder().encode('timed out') } as ReturnType<
            typeof Bun.spawnSync
          >;
        }
        return {
          exitCode: 0,
          stdout: new TextEncoder().encode(
            JSON.stringify({ result: { items: [{ name: 'Unmute', role: 'push button', pid: 7 }] } }),
          ),
          stderr: new Uint8Array(),
        } as ReturnType<typeof Bun.spawnSync>;
      }
      return { exitCode: 0, stdout: new TextEncoder().encode('{"result":{}}'), stderr: new Uint8Array() } as ReturnType<
        typeof Bun.spawnSync
      >;
    });
    try {
      expect(call('status', [])).toMatchObject({ exitCode: 0, awareness: { meeting: 'in_meeting' } });
      expect(accessibilityCalls).toBeGreaterThanOrEqual(2);
    } finally {
      spawn.mockRestore();
    }
  });
  it('stops sharing through the retained active Zoom PID when the Meeting window is unmapped', () => {
    const stateDirectory = mkdtempSync(join(tmpdir(), 'xcsh-zoom-stop-share-'));
    const previousStateDirectory = process.env.XCSH_ZOOM_STATE_DIR;
    process.env.XCSH_ZOOM_STATE_DIR = stateDirectory;
    let sharing = false;
    let informationOpen = false;
    let returnedToMeeting = false;
    const focused: number[] = [];
    let stopShortcuts = 0;
    const spawn = spyOn(Bun, 'spawnSync').mockImplementation((argv) => {
      const command = [...argv] as string[];
      const session = command[command.indexOf('--session') + 1];
      const operation = command[command.indexOf('--json') + 1];
      const action = command[command.indexOf('--json') + 2];
      const paramsIndex = command.indexOf('--params');
      const params = paramsIndex >= 0 ? (JSON.parse(command[paramsIndex + 1]) as Record<string, unknown>) : {};
      let result: Record<string, unknown> = {};
      if (operation === 'window' && action === 'list') {
        result = {
          windows:
            session !== 'console'
              ? []
              : [
                  { id: 10, pid: 100, title: 'Zoom Workplace' },
                  ...(sharing
                    ? [
                        { id: 20, pid: 200, title: 'Zoom Workplace - Free account' },
                        ...(returnedToMeeting ? [{ id: 23, pid: 200, title: 'Meeting' }] : []),
                        { id: 21, pid: 200, title: 'annotate_toolbar' },
                        { id: 22, pid: 200, title: 'zoom_linux_float_video_window' },
                      ]
                    : [{ id: 23, pid: 200, title: 'Meeting' }]),
                ],
        };
      } else if (operation === 'inspect' && action === 'accessibility') {
        result = {
          items:
            session !== 'console'
              ? []
              : [
                  { name: 'Join a meeting, link', role: 'push button', pid: 100 },
                  ...(sharing
                    ? returnedToMeeting
                      ? [
                          { name: 'Unmute', role: 'push button', pid: 200 },
                          { name: 'Participants', role: 'push button', pid: 200 },
                          { name: 'Stop Share', role: 'push button', pid: 200, box: [900, 20, 100, 40] },
                        ]
                      : [{ name: 'Return to meeting', role: 'push button', pid: 200, box: [800, 300, 100, 60] }]
                    : informationOpen
                      ? [{ name: 'Meeting ID: 123 456 789', role: 'label', pid: 200 }]
                      : [
                          { name: 'Unmute', role: 'push button', pid: 200 },
                          { name: 'Share', role: 'push button', pid: 200 },
                          { name: 'Meeting information', role: 'push button', pid: 200, box: [1, 1, 20, 20] },
                        ]),
                ],
        };
      } else if (operation === 'window' && action === 'focus') {
        focused.push(Number(params.window));
      } else if (operation === 'input' && action === 'batch') {
        for (const step of params.steps as Array<Record<string, unknown>>) {
          if (step.action === 'click' && Number(step.x) === 850 && Number(step.y) === 330) returnedToMeeting = true;
          else if (step.action === 'click' && Number(step.x) === 950 && Number(step.y) === 40) sharing = false;
          else if (step.action === 'click') informationOpen = true;
          if (step.action === 'key' && step.key === 'Escape') informationOpen = false;
          if (step.action === 'chord' && JSON.stringify(step.keys) === JSON.stringify(['Alt_L', 's'])) {
            stopShortcuts += 1;
          }
        }
      }
      return {
        exitCode: 0,
        stdout: new TextEncoder().encode(JSON.stringify({ result })),
        stderr: new Uint8Array(),
      } as ReturnType<typeof Bun.spawnSync>;
    });
    try {
      expect(call('status', [])).toMatchObject({ awareness: { meeting: 'in_meeting', meeting_id: '123456789' } });
      sharing = true;
      expect(call('stop-share', [])).toMatchObject({
        exitCode: 0,
        control: 'stop-share',
        previous: 'on',
        current: 'off',
        changed: true,
        verified: true,
      });
      expect(returnedToMeeting).toBe(true);
      expect(stopShortcuts).toBe(0);
    } finally {
      spawn.mockRestore();
      if (previousStateDirectory === undefined) delete process.env.XCSH_ZOOM_STATE_DIR;
      else process.env.XCSH_ZOOM_STATE_DIR = previousStateDirectory;
      rmSync(stateDirectory, { recursive: true, force: true });
    }
  });
  it('sends a named reaction through the semantic Zoom reaction menu', () => {
    let menuOpen = false;
    let reacted = false;
    const spawn = spyOn(Bun, 'spawnSync').mockImplementation((argv) => {
      const command = [...argv] as string[];
      const session = command[command.indexOf('--session') + 1];
      const operation = command[command.indexOf('--json') + 1];
      const action = command[command.indexOf('--json') + 2];
      const paramsIndex = command.indexOf('--params');
      const params = paramsIndex >= 0 ? (JSON.parse(command[paramsIndex + 1]) as Record<string, unknown>) : {};
      let result: Record<string, unknown> = {};
      if (operation === 'window' && action === 'list') {
        result = { windows: session === 'console' ? [{ id: 42, pid: 7, title: 'Meeting' }] : [] };
      } else if (operation === 'inspect' && action === 'accessibility') {
        result = {
          items:
            session === 'console'
              ? [
                  { name: 'Unmute', role: 'push button', pid: 7, box: [20, 900, 80, 50] },
                  { name: 'Participants', role: 'push button', pid: 7, box: [200, 900, 100, 50] },
                  { name: 'React', role: 'push button', pid: 7, box: [980, 900, 80, 50] },
                  ...(menuOpen ? [{ name: 'Thumbs up', role: 'push button', pid: 7, box: [917, 728, 36, 36] }] : []),
                ]
              : [],
        };
      } else if (operation === 'input' && action === 'batch') {
        for (const step of params.steps as Array<Record<string, unknown>>) {
          if (step.action !== 'click') continue;
          if (Number(step.x) === 1020 && Number(step.y) === 925) menuOpen = true;
          if (Number(step.x) === 935 && Number(step.y) === 746) {
            menuOpen = false;
            reacted = true;
          }
        }
      }
      return {
        exitCode: 0,
        stdout: new TextEncoder().encode(JSON.stringify({ result })),
        stderr: new Uint8Array(),
      } as ReturnType<typeof Bun.spawnSync>;
    });
    try {
      expect(call('reaction', ['thumbs-up'])).toMatchObject({
        exitCode: 0,
        control: 'reaction',
        reaction: 'thumbs_up',
        changed: true,
        verified: true,
      });
      expect(reacted).toBe(true);
    } finally {
      spawn.mockRestore();
    }
  });
  it('routes bounded stimuli only through the verified virtual microphone sink', () => {
    const spawn = spyOn(Bun, 'spawnSync').mockImplementation((argv) => {
      const command = [...argv] as string[];
      const session = command[command.indexOf('--session') + 1];
      const operation = command[command.indexOf('--json') + 1];
      const action = command[command.indexOf('--json') + 2];
      let result: Record<string, unknown> = {};
      if (operation === 'window' && action === 'list') {
        result = { windows: session === 'console' ? [{ id: 42, pid: 7, title: 'Meeting' }] : [] };
      } else if (operation === 'inspect' && action === 'accessibility') {
        result = {
          items:
            session === 'console'
              ? [
                  { name: 'Mute', role: 'push button', pid: 7 },
                  { name: 'Participants', role: 'push button', pid: 7 },
                  { name: 'Share', role: 'push button', pid: 7 },
                  { name: 'Original Sound for Musicians: On', role: 'push button', pid: 7 },
                  { name: 'Select a microphone', role: 'menu item', pid: 7 },
                  { name: 'xcsh Microphone', role: 'check box', checked: true, pid: 7 },
                  { name: 'Select a speaker', role: 'menu item', pid: 7 },
                  { name: 'xorgctl_desktop', role: 'check box', checked: true, pid: 7 },
                  { name: 'Original sound for musicians', role: 'check box', checked: true, pid: 7 },
                ]
              : [],
        };
      } else if (operation === 'audio' && action === 'stimulus') {
        result = { stimulus: 'tones', sink: 'xcsh_microphone', retention: 'none', token_sha256: null };
      }
      return {
        exitCode: 0,
        stdout: new TextEncoder().encode(JSON.stringify({ result })),
        stderr: new Uint8Array(),
      } as ReturnType<typeof Bun.spawnSync>;
    });
    try {
      expect(call('stimulus', ['tones'])).toMatchObject({
        exitCode: 0,
        control: 'stimulus',
        kind: 'tones',
        session: 'console',
        media_session: 'desktop',
        sink: 'xcsh_microphone',
        retention: 'none',
        original_sound: 'on',
        changed: true,
        verified: true,
      });
    } finally {
      spawn.mockRestore();
    }
  });
  it('requires a complete bounded speech result from Xorg', () => {
    let requestedSeconds = 0;
    let complete = true;
    const spawn = spyOn(Bun, 'spawnSync').mockImplementation((argv) => {
      const command = [...argv] as string[];
      const session = command[command.indexOf('--session') + 1];
      const operation = command[command.indexOf('--json') + 1];
      const action = command[command.indexOf('--json') + 2];
      const paramsIndex = command.indexOf('--params');
      const params = paramsIndex >= 0 ? (JSON.parse(command[paramsIndex + 1]) as Record<string, unknown>) : {};
      let result: Record<string, unknown> = {};
      if (operation === 'window' && action === 'list') {
        result = { windows: session === 'console' ? [{ id: 42, pid: 7, title: 'Meeting' }] : [] };
      } else if (operation === 'inspect' && action === 'accessibility') {
        result = {
          items:
            session === 'console'
              ? [
                  { name: 'Mute', role: 'push button', pid: 7 },
                  { name: 'Participants', role: 'push button', pid: 7 },
                  { name: 'Share', role: 'push button', pid: 7 },
                  { name: 'Select a microphone', role: 'menu item', pid: 7 },
                  { name: 'xcsh Microphone', role: 'check box', checked: true, pid: 7 },
                  { name: 'Select a speaker', role: 'menu item', pid: 7 },
                  { name: 'xorgctl_desktop', role: 'check box', checked: true, pid: 7 },
                  { name: 'Original sound for musicians', role: 'check box', checked: true, pid: 7 },
                ]
              : [],
        };
      } else if (operation === 'audio' && action === 'stimulus') {
        requestedSeconds = Number(params.seconds);
        result = {
          stimulus: 'speech',
          sink: 'xcsh_microphone',
          retention: 'none',
          token_sha256: 'digest',
          complete,
        };
      }
      return {
        exitCode: 0,
        stdout: new TextEncoder().encode(JSON.stringify({ result })),
        stderr: new Uint8Array(),
      } as ReturnType<typeof Bun.spawnSync>;
    });
    try {
      expect(call('stimulus', ['speech'])).toMatchObject({
        exitCode: 0,
        kind: 'speech',
        complete: true,
        verified: true,
      });
      expect(requestedSeconds).toBe(8);
      complete = false;
      expect(call('stimulus', ['speech'])).toMatchObject({
        exitCode: 1,
        code: 'stimulus_verification_failed',
        verified: false,
      });
    } finally {
      spawn.mockRestore();
    }
  });
  it('enables and verifies Original Sound for Musicians before sending a stimulus', () => {
    let originalSound = false;
    let stimulusCalls = 0;
    const spawn = spyOn(Bun, 'spawnSync').mockImplementation((argv) => {
      const command = [...argv] as string[];
      const session = command[command.indexOf('--session') + 1];
      const operation = command[command.indexOf('--json') + 1];
      const action = command[command.indexOf('--json') + 2];
      const paramsIndex = command.indexOf('--params');
      const params = paramsIndex >= 0 ? (JSON.parse(command[paramsIndex + 1]) as Record<string, unknown>) : {};
      let result: Record<string, unknown> = {};
      if (operation === 'window' && action === 'list') {
        result = { windows: session === 'console' ? [{ id: 42, pid: 7, title: 'Meeting' }] : [] };
      } else if (operation === 'inspect' && action === 'accessibility') {
        result = {
          items:
            session === 'console'
              ? [
                  { name: 'Mute', role: 'push button', pid: 7 },
                  { name: 'Participants', role: 'push button', pid: 7 },
                  { name: 'Share', role: 'push button', pid: 7 },
                  {
                    name: `Original Sound for Musicians: ${originalSound ? 'On' : 'Off'}`,
                    role: 'push button',
                    pid: 7,
                    box: [20, 20, 240, 30],
                  },
                  { name: 'Select a microphone', role: 'menu item', pid: 7 },
                  { name: 'xcsh Microphone', role: 'check box', checked: true, pid: 7 },
                  { name: 'Select a speaker', role: 'menu item', pid: 7 },
                  { name: 'xorgctl_desktop', role: 'check box', checked: true, pid: 7 },
                  {
                    name: 'Original sound for musicians',
                    role: 'check box',
                    checked: originalSound,
                    pid: 7,
                    box: [300, 240, 300, 30],
                  },
                ]
              : [],
        };
      } else if (operation === 'input' && action === 'batch') {
        for (const step of params.steps as Array<Record<string, unknown>>) {
          if (step.action === 'click' && Number(step.x) === 450 && Number(step.y) === 255) originalSound = true;
        }
      } else if (operation === 'audio' && action === 'stimulus') {
        stimulusCalls += 1;
        result = { stimulus: 'tones', sink: 'xcsh_microphone', retention: 'none', token_sha256: null };
      }
      return {
        exitCode: 0,
        stdout: new TextEncoder().encode(JSON.stringify({ result })),
        stderr: new Uint8Array(),
      } as ReturnType<typeof Bun.spawnSync>;
    });
    try {
      expect(call('stimulus', ['tones'])).toMatchObject({
        exitCode: 0,
        original_sound: 'on',
        verified: true,
      });
      expect(originalSound).toBe(true);
      expect(stimulusCalls).toBe(1);
    } finally {
      spawn.mockRestore();
    }
  });
  it('selects and verifies the virtual microphone, virtual speaker, and musician mode before a stimulus', () => {
    let menuOpen = false;
    let microphone = false;
    let speaker = false;
    let originalSound = false;
    let stimulusCalls = 0;
    const spawn = spyOn(Bun, 'spawnSync').mockImplementation((argv) => {
      const command = [...argv] as string[];
      const session = command[command.indexOf('--session') + 1];
      const operation = command[command.indexOf('--json') + 1];
      const action = command[command.indexOf('--json') + 2];
      const paramsIndex = command.indexOf('--params');
      const params = paramsIndex >= 0 ? (JSON.parse(command[paramsIndex + 1]) as Record<string, unknown>) : {};
      let result: Record<string, unknown> = {};
      if (operation === 'window' && action === 'list') {
        result = { windows: session === 'console' ? [{ id: 42, pid: 7, title: 'Meeting' }] : [] };
      } else if (operation === 'inspect' && action === 'accessibility') {
        result = {
          items:
            session === 'console'
              ? [
                  { name: 'Mute', role: 'push button', pid: 7 },
                  { name: 'Participants', role: 'push button', pid: 7 },
                  { name: 'Share', role: 'push button', pid: 7 },
                  {
                    name: `Original Sound for Musicians: ${originalSound ? 'On' : 'Off'}`,
                    role: 'push button',
                    pid: 7,
                    box: [20, 20, 240, 30],
                  },
                  { name: 'Audio Settings', role: 'push button', pid: 7, box: [300, 20, 20, 30] },
                  ...(menuOpen
                    ? [
                        { name: 'Select a microphone', role: 'menu item', pid: 7, box: [300, 60, 300, 30] },
                        {
                          name: 'Built-in Audio Analog Stereo',
                          role: 'check box',
                          checked: !microphone,
                          pid: 7,
                          box: [300, 90, 300, 30],
                        },
                        {
                          name: 'xcsh Microphone',
                          role: 'check box',
                          checked: microphone,
                          pid: 7,
                          box: [300, 120, 300, 30],
                        },
                        { name: 'Select a speaker', role: 'menu item', pid: 7, box: [300, 150, 300, 30] },
                        {
                          name: 'Built-in Audio Digital Stereo (IEC958)',
                          role: 'check box',
                          checked: !speaker,
                          pid: 7,
                          box: [300, 180, 300, 30],
                        },
                        {
                          name: 'xorgctl_desktop',
                          role: 'check box',
                          checked: speaker,
                          pid: 7,
                          box: [300, 210, 300, 30],
                        },
                        {
                          name: 'Original sound for musicians',
                          role: 'check box',
                          checked: originalSound,
                          pid: 7,
                          box: [300, 240, 300, 30],
                        },
                      ]
                    : []),
                ]
              : [],
        };
      } else if (operation === 'input' && action === 'batch') {
        for (const step of params.steps as Array<Record<string, unknown>>) {
          if (step.action !== 'click') continue;
          const y = Number(step.y);
          if (y === 35 && Number(step.x) === 310) menuOpen = true;
          if (y === 135) microphone = true;
          if (y === 225) speaker = true;
          if (y === 255) originalSound = true;
        }
      } else if (operation === 'audio' && action === 'stimulus') {
        stimulusCalls += 1;
        result = { stimulus: 'tones', sink: 'xcsh_microphone', retention: 'none', token_sha256: null };
      }
      return {
        exitCode: 0,
        stdout: new TextEncoder().encode(JSON.stringify({ result })),
        stderr: new Uint8Array(),
      } as ReturnType<typeof Bun.spawnSync>;
    });
    try {
      expect(call('stimulus', ['tones'])).toMatchObject({
        exitCode: 0,
        microphone: 'xcsh Microphone',
        speaker: 'xorgctl_desktop',
        original_sound: 'on',
        verified: true,
      });
      expect({ menuOpen, microphone, speaker, originalSound, stimulusCalls }).toEqual({
        menuOpen: true,
        microphone: true,
        speaker: true,
        originalSound: true,
        stimulusCalls: 1,
      });
    } finally {
      spawn.mockRestore();
    }
  });
  it('rejects physical audio fallback when either required virtual device is unavailable', () => {
    for (const missing of ['microphone', 'speaker'] as const) {
      let menuOpen = false;
      let stimulusCalls = 0;
      const spawn = spyOn(Bun, 'spawnSync').mockImplementation((argv) => {
        const command = [...argv] as string[];
        const session = command[command.indexOf('--session') + 1];
        const operation = command[command.indexOf('--json') + 1];
        const action = command[command.indexOf('--json') + 2];
        const paramsIndex = command.indexOf('--params');
        const params = paramsIndex >= 0 ? (JSON.parse(command[paramsIndex + 1]) as Record<string, unknown>) : {};
        let result: Record<string, unknown> = {};
        if (operation === 'window' && action === 'list') {
          result = { windows: session === 'console' ? [{ id: 42, pid: 7, title: 'Meeting' }] : [] };
        } else if (operation === 'inspect' && action === 'accessibility') {
          result = {
            items:
              session === 'console'
                ? [
                    { name: 'Mute', role: 'push button', pid: 7 },
                    { name: 'Participants', role: 'push button', pid: 7 },
                    { name: 'Share', role: 'push button', pid: 7 },
                    { name: 'Original Sound for Musicians: On', role: 'push button', pid: 7 },
                    { name: 'Audio Settings', role: 'push button', pid: 7, box: [300, 20, 20, 30] },
                    ...(menuOpen
                      ? [
                          { name: 'Select a microphone', role: 'menu item', pid: 7 },
                          ...(missing === 'microphone'
                            ? []
                            : [{ name: 'xcsh Microphone', role: 'check box', checked: true, pid: 7 }]),
                          { name: 'Built-in Audio Analog Stereo', role: 'check box', checked: true, pid: 7 },
                          { name: 'Select a speaker', role: 'menu item', pid: 7 },
                          ...(missing === 'speaker'
                            ? []
                            : [{ name: 'xorgctl_desktop', role: 'check box', checked: true, pid: 7 }]),
                          {
                            name: 'Built-in Audio Digital Stereo (IEC958)',
                            role: 'check box',
                            checked: true,
                            pid: 7,
                          },
                          { name: 'Original sound for musicians', role: 'check box', checked: true, pid: 7 },
                        ]
                      : []),
                  ]
                : [],
          };
        } else if (operation === 'input' && action === 'batch') {
          for (const step of params.steps as Array<Record<string, unknown>>) {
            if (step.action === 'click' && Number(step.y) === 35 && Number(step.x) === 310) menuOpen = true;
          }
        } else if (operation === 'audio' && action === 'stimulus') {
          stimulusCalls += 1;
          result = { stimulus: 'tones', sink: 'xcsh_microphone', retention: 'none', token_sha256: null };
        }
        return {
          exitCode: 0,
          stdout: new TextEncoder().encode(JSON.stringify({ result })),
          stderr: new Uint8Array(),
        } as ReturnType<typeof Bun.spawnSync>;
      });
      try {
        expect(call('stimulus', ['tones'])).toMatchObject({
          exitCode: 1,
          code: `virtual_${missing}_unavailable`,
          verified: false,
        });
        expect(stimulusCalls).toBe(0);
      } finally {
        spawn.mockRestore();
      }
    }
  });
  it('leaves through the semantic confirmation and verifies meeting exit', () => {
    let confirmation = false;
    let left = false;
    const spawn = spyOn(Bun, 'spawnSync').mockImplementation((argv) => {
      const command = [...argv] as string[];
      const session = command[command.indexOf('--session') + 1];
      const operation = command[command.indexOf('--json') + 1];
      const action = command[command.indexOf('--json') + 2];
      const paramsIndex = command.indexOf('--params');
      const params = paramsIndex >= 0 ? (JSON.parse(command[paramsIndex + 1]) as Record<string, unknown>) : {};
      let result: Record<string, unknown> = {};
      if (operation === 'window' && action === 'list') {
        result = {
          windows:
            session === 'console'
              ? left
                ? [{ id: 41, pid: 7, title: 'Zoom Workplace - Free account' }]
                : [{ id: 42, pid: 7, title: 'Meeting' }]
              : [],
        };
      } else if (operation === 'inspect' && action === 'accessibility') {
        result = {
          items:
            session !== 'console'
              ? []
              : left
                ? [{ name: 'New meeting', role: 'push button', pid: 7 }]
                : confirmation
                  ? [{ name: 'Leave meeting', role: 'push button', pid: 7, box: [1314, 837, 220, 32] }]
                  : [
                      { name: 'Participants', role: 'push button', pid: 7 },
                      { name: 'Unmute', role: 'push button', pid: 7 },
                      { name: 'Leave', role: 'push button', pid: 7, box: [1464, 901, 78, 53] },
                    ],
        };
      } else if (operation === 'input' && action === 'batch') {
        for (const step of params.steps as Array<Record<string, unknown>>) {
          if (step.action !== 'click') continue;
          if (Number(step.x) === 1503 && Number(step.y) === 928) confirmation = true;
          if (Number(step.x) === 1424 && Number(step.y) === 853) left = true;
        }
      }
      return {
        exitCode: 0,
        stdout: new TextEncoder().encode(JSON.stringify({ result })),
        stderr: new Uint8Array(),
      } as ReturnType<typeof Bun.spawnSync>;
    });
    try {
      expect(call('leave', [])).toMatchObject({
        exitCode: 0,
        control: 'leave',
        previous: 'in_meeting',
        current: 'left',
        changed: true,
        verified: true,
      });
      expect(left).toBe(true);
    } finally {
      spawn.mockRestore();
    }
  });
  it('keeps Zoom-specific implementation out of the Xorg substrate', async () => {
    const root = join(import.meta.dir, '..', 'plugins', 'xorg');
    const visit = async (directory: string): Promise<string[]> => {
      const entries = await readdir(directory, { withFileTypes: true });
      return (
        await Promise.all(
          entries.map(async (entry) =>
            entry.isDirectory() ? visit(join(directory, entry.name)) : [join(directory, entry.name)],
          ),
        )
      ).flat();
    };
    for (const file of await visit(root)) {
      if (!file.endsWith('.py') && !file.endsWith('.ts')) continue;
      expect((await readFile(file, 'utf8')).toLowerCase()).not.toContain('zoom');
    }
  });

  it('scopes AT-SPI observations to PIDs visible in the selected Xorg session', async () => {
    const root = join(import.meta.dir, '..', 'plugins', 'xorg', 'scripts', 'xorgctl_lib');
    const dump = await readFile(join(root, 'atspi_dump.py'), 'utf8');
    const worker = await readFile(join(root, 'worker.py'), 'utf8');
    expect(dump).toContain('node.get_process_id()');
    expect(dump).toContain('Atspi.StateType.CHECKED');
    expect(dump).toContain('Atspi.StateType.SELECTED');
    expect(worker).toMatch(/item\.get\((["'])pid\1\) in visible_pids/);
    expect(worker).toMatch(/item\.get\((["'])showing\1\) is True/);
    expect(worker).toMatch(/item\.get\((["'])visible\1\) is True/);
    expect(worker).toMatch(/["']session_pid_filter["']:\s*sorted\(visible_pids\)/);
  });
  it('declares native installer argv for macOS, Linux, and Windows', async () => {
    for (const [plugin, exportName, expectedWindowsId] of [
      ['aws', 'awsInstallArgv', 'Amazon.AWSCLI'],
      ['azure', 'azureInstallArgv', 'Microsoft.AzureCLI'],
      ['gcloud', 'gcloudInstallArgv', 'Google.CloudSDK'],
      ['github', 'githubInstallArgv', 'GitHub.cli'],
      ['gitlab', 'gitlabInstallArgv', 'GitLab.glab'],
      ['terraform', 'terraformInstallArgv', 'Hashicorp.Terraform'],
    ] as const) {
      const entrypoint = plugin === 'terraform' ? 'extensions/integration.ts' : 'src/index.ts';
      const module = await import(`../plugins/${plugin}/${entrypoint}`);
      const installArgv = module[exportName] as (platform: string) => string[];
      expect(installArgv('darwin')[0]).toBe('brew');
      expect(installArgv('linux')).toEqual(expect.arrayContaining(['apt-get']));
      expect(installArgv('win32')).toEqual(['winget', 'install', '--exact', '--id', expectedWindowsId]);
    }
  });

  it('registers exactly the manifest-declared provider integrations', async () => {
    for (const [plugin, ids] of [
      ['aws', ['aws']],
      ['azure', ['azure']],
      ['gcloud', ['gcloud']],
      ['github', ['github', 'github_email']],
      ['gitlab', ['gitlab']],
      ['salesforce', ['salesforce']],
    ] as const) {
      expect((await definitionsFor(plugin)).map((definition) => definition.id)).toEqual(ids);
    }
  });

  it('discloses every GitHub person-profile category in its setup plan', async () => {
    const [github] = await definitionsFor('github');
    expect(github.setup?.profileFields).toEqual(['accounts', 'email', 'identifiers', 'sameAs']);
  });

  it('routes Platform setup to the native xcsh context wizard', async () => {
    const [platform] = await definitionsFor('platform');
    expect(platform.setup).toMatchObject({
      requiredEnvironment: ['XCSH_API_URL', 'XCSH_API_TOKEN', 'XCSH_TENANT'],
      steps: [],
      verification: [],
      guidedAction: { kind: 'context_wizard' },
    });
  });

  it('does not request package-manager privileges when GitHub CLI is already installed', async () => {
    const [github] = await definitionsFor('github', true);
    expect(github.setup?.steps).toEqual([
      {
        kind: 'login',
        argv: ['gh', 'auth', 'login'],
        timeoutMs: 300000,
        stdin: 'inherit',
      },
    ]);

    const [missingCli] = await definitionsFor('github');
    expect(missingCli.setup?.steps.map((step) => step.kind)).toEqual(['install', 'login']);
    expect(missingCli.setup?.steps[0]?.argv).toContain('gh');
  });

  it('registers every runtime integration declared by the marketplace manifests', async () => {
    for (const [plugin, ids] of [
      ['asm-migration', ['asm_migration']],
      ['aws', ['aws']],
      ['azure', ['azure']],
      ['cloudstatus', ['cloudstatus']],
      ['devcontainer', ['devcontainer']],
      ['firecrawl', ['firecrawl']],
      ['gcloud', ['gcloud']],
      ['github', ['github', 'github_email']],
      ['gitlab', ['gitlab']],
      ['herdr', ['herdr']],
      ['kvm', ['kvm']],
      ['platform', ['platform']],
      ['salesforce', ['salesforce']],
      ['terraform', ['terraform']],
      ['xorg', ['xorg']],
      ['zoom', ['zoom']],
    ] as const) {
      expect((await definitionsFor(plugin)).map((definition) => definition.id)).toEqual(ids);
    }
  });

  it('registers cloudstatus Regional Edge policy through scoped advisories', async () => {
    const cloudstatus = await definitionsFor('cloudstatus');
    expect(cloudstatus.advisories).toHaveLength(1);
    expect(cloudstatus.advisories[0]).toMatchObject({
      id: 'cloudstatus.regional-edge',
      capabilities: ['read', 'task', 'web_search', 'bash', 'render_map'],
    });
  });

  it('registers the complete typed GitHub lifecycle surface', async () => {
    const github = await definitionsFor('github', true);
    expect(github.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        'github_workflow',
        'github_issue_create',
        'github_pr_create',
        'github_pr_auto_merge',
        'github_pr_update_branch',
        'github_worktree_prepare',
        'github_worktree_cleanup',
      ]),
    );
  });

  it('registers callable Xorg and Zoom tools through the xcsh extension API', async () => {
    expect((await definitionsFor('xorg')).tools.map((tool) => tool.name)).toEqual(['xorg_desktop']);
    const zoom = await definitionsFor('zoom');
    expect(zoom.tools.map((tool) => tool.name)).toEqual(['zoom_meeting']);
    expect(zoom.commands.map((command) => command.name)).toEqual(['zoom']);
  });

  it('preserves arbitrary documented xorgctl parameters for tool calls', async () => {
    const [tool] = (await definitionsFor('xorg')).tools;
    expect(tool.parameters).toMatchObject({
      properties: { params: { type: 'object', additionalProperties: {} } },
    });
  });

  it('keeps the Xorg setup plan within the xcsh integration timeout contract', async () => {
    const [definition] = await definitionsFor('xorg');
    for (const step of definition.setup?.steps ?? []) {
      expect(step.timeoutMs).toBeGreaterThanOrEqual(1000);
      expect(step.timeoutMs).toBeLessThanOrEqual(900000);
    }
    for (const step of definition.setup?.verification ?? []) {
      expect(step.timeoutMs).toBeGreaterThanOrEqual(1000);
      expect(step.timeoutMs).toBeLessThanOrEqual(120000);
    }
  });

  it('exposes an Ubuntu-only Xorg setup contract without IPv6 readiness gates', async () => {
    const [definition] = await definitionsFor('xorg');
    const script = join(import.meta.dir, '..', 'plugins', 'xorg', 'scripts', 'xorgctl');
    const installedLauncher = join(homedir(), '.local', 'bin', 'xorgctl');
    expect(definition.setup?.steps).toEqual([
      {
        kind: 'install',
        argv: [script, 'setup', 'apply', '--params', JSON.stringify({ expected_version: '1.1.2' })],
        timeoutMs: 900000,
      },
    ]);
    expect(definition.setup?.verification).toEqual([
      {
        argv: [
          installedLauncher,
          '--json',
          'setup',
          'status',
          '--params',
          JSON.stringify({ expected_version: '1.1.2' }),
        ],
        timeoutMs: 30000,
      },
    ]);
    const calls: string[][] = [];
    const spawn = spyOn(Bun, 'spawnSync').mockImplementation((argv) => {
      const command = [...argv] as string[];
      calls.push(command);
      const result = command.includes('capabilities') ? { version: '1.1.2' } : { state: 'ready', version: '1.1.2' };
      return {
        exitCode: 0,
        stdout: new TextEncoder().encode(JSON.stringify({ ok: true, result })),
        stderr: new Uint8Array(),
      } as ReturnType<typeof Bun.spawnSync>;
    });
    try {
      expect(await definition.probe()).toMatchObject({ state: 'ready' });
      expect(calls).toEqual([
        [installedLauncher, '--json', 'capabilities'],
        [installedLauncher, '--json', 'setup', 'status', '--params', JSON.stringify({ expected_version: '1.1.2' })],
      ]);
    } finally {
      spawn.mockRestore();
    }

    const probe = Bun.spawnSync([
      'python3',
      script,
      '--json',
      'setup',
      'status',
      '--params',
      JSON.stringify({ expected_version: '1.1.2' }),
    ]);
    expect(probe.exitCode).toBe(0);
    const payload = JSON.parse(new TextDecoder().decode(probe.stdout)) as {
      ok: boolean;
      result: {
        state: string;
        platform: { id: string; version_id: string };
        checks: { worker: { ready: boolean; version: string | null } } & Record<string, unknown>;
      };
    };
    expect(payload.ok).toBe(true);
    expect(payload.result.platform).toEqual({ id: 'ubuntu', version_id: '24.04' });
    expect(payload.result.version).toBe('1.1.2');
    expect(['ready', 'degraded']).toContain(payload.result.state);
    expect(typeof payload.result.checks.worker.ready).toBe('boolean');
    expect(JSON.stringify(payload).toLowerCase()).not.toContain('ipv6');
  });

  it('pins Zoom controls to the owned desktop UAT session', async () => {
    const source = await readFile(
      join(import.meta.dir, '..', 'plugins', 'zoom', 'extensions', 'integration.ts'),
      'utf8',
    );
    expect(source).toContain("const DEFAULT_SESSION = 'desktop'");
    expect(source).toContain("'--session',");
  });

  it('derives normalized meeting awareness without guessing missing states', () => {
    expect(deriveMeetingId([{ name: 'Meeting ID123 4567 8901' }])).toBe('12345678901');
    expect(deriveMeetingId([{ name: 'Meeting information' }])).toBeUndefined();
    expect(
      deriveAwareness(
        [
          { name: 'Participants' },
          { name: 'Unmute' },
          { name: 'Start Video' },
          { name: 'Share Screen' },
          { name: 'Lower Hand' },
        ],
        [{ id: 7, pid: 42, title: 'Zoom Meeting' }],
      ),
    ).toMatchObject({
      meeting: 'in_meeting',
      meeting_id: 'unknown',
      audio: 'muted',
      video: 'off',
      share: 'off',
      hand: 'raised',
    });
    expect(deriveAwareness([], []).meeting).toBe('unknown');
    expect(
      discoverActiveMeetingSession({
        console: [{ title: 'Meeting', pid: 42 }],
        desktop: [{ title: 'Zoom Workplace', pid: 84 }],
      }),
    ).toBe('console');
    expect(
      discoverZoomSession({
        console: [{ title: 'Zoom Workplace - Free account', pid: 42 }],
        desktop: [{ title: 'Zoom Workplace', pid: 84 }],
      }),
    ).toBe('console');
  });
  it('resolves the active meeting identity for status from Zoom meeting information', () => {
    let informationOpen = false;
    const spawn = spyOn(Bun, 'spawnSync').mockImplementation((argv) => {
      const command = [...argv] as string[];
      const session = command[command.indexOf('--session') + 1];
      const operation = command[command.indexOf('--json') + 1];
      const action = command[command.indexOf('--json') + 2];
      let result: Record<string, unknown> = {};
      if (operation === 'window' && action === 'list') {
        result = { windows: session === 'console' ? [{ id: 42, pid: 7, title: 'Meeting' }] : [] };
      } else if (operation === 'inspect' && action === 'accessibility') {
        result = {
          items: informationOpen
            ? [{ name: 'Meeting ID: 123 4567 8901', role: 'label', pid: 7 }]
            : [
                { name: 'Mute', role: 'push button', pid: 7 },
                { name: 'Stop Video', role: 'push button', pid: 7 },
                { name: 'Share', role: 'push button', pid: 7 },
                { name: 'Meeting information', role: 'push button', pid: 7, box: [1, 1, 20, 20] },
              ],
        };
      } else if (operation === 'input' && action === 'batch') {
        informationOpen = true;
      }
      return {
        exitCode: 0,
        stdout: new TextEncoder().encode(JSON.stringify({ result })),
        stderr: new Uint8Array(),
      } as ReturnType<typeof Bun.spawnSync>;
    });
    try {
      expect(call('status', [])).toMatchObject({
        exitCode: 0,
        session: 'console',
        awareness: { meeting: 'in_meeting', meeting_id: '12345678901' },
      });
    } finally {
      spawn.mockRestore();
    }
  });
  it('retains verified meeting identity while Zoom replaces the meeting window during sharing', () => {
    const stateDirectory = mkdtempSync(join(tmpdir(), 'xcsh-zoom-state-'));
    const previousStateDirectory = process.env.XCSH_ZOOM_STATE_DIR;
    process.env.XCSH_ZOOM_STATE_DIR = stateDirectory;
    let sharing = false;
    let informationOpen = false;
    const spawn = spyOn(Bun, 'spawnSync').mockImplementation((argv) => {
      const command = [...argv] as string[];
      const session = command[command.indexOf('--session') + 1];
      const operation = command[command.indexOf('--json') + 1];
      const action = command[command.indexOf('--json') + 2];
      const paramsIndex = command.indexOf('--params');
      const params = paramsIndex >= 0 ? (JSON.parse(command[paramsIndex + 1]) as Record<string, unknown>) : {};
      let result: Record<string, unknown> = {};
      if (operation === 'window' && action === 'list') {
        result = {
          windows:
            session !== 'console'
              ? []
              : sharing
                ? [{ id: 43, pid: 7, title: 'zoom_linux_float_video_window' }]
                : [{ id: 42, pid: 7, title: 'Meeting' }],
        };
      } else if (operation === 'inspect' && action === 'accessibility') {
        result = {
          items:
            session !== 'console'
              ? []
              : sharing
                ? [{ name: 'Stop Share', role: 'push button', pid: 7, box: [900, 20, 100, 40] }]
                : informationOpen
                  ? [{ name: 'Meeting ID: 123 4567 8901', role: 'label', pid: 7 }]
                  : [
                      { name: 'Mute', role: 'push button', pid: 7 },
                      { name: 'Meeting information', role: 'push button', pid: 7, box: [1, 1, 20, 20] },
                    ],
        };
      } else if (operation === 'input' && action === 'batch') {
        for (const step of params.steps as Array<Record<string, unknown>>) {
          if (step.action === 'click') informationOpen = true;
          if (step.action === 'key' && step.key === 'Escape') informationOpen = false;
        }
      }
      return {
        exitCode: 0,
        stdout: new TextEncoder().encode(JSON.stringify({ result })),
        stderr: new Uint8Array(),
      } as ReturnType<typeof Bun.spawnSync>;
    });
    try {
      expect(call('status', [])).toMatchObject({
        awareness: { meeting: 'in_meeting', meeting_id: '12345678901' },
      });
      sharing = true;
      expect(call('status', [])).toMatchObject({
        awareness: { meeting: 'sharing', meeting_id: '12345678901' },
      });
    } finally {
      spawn.mockRestore();
      if (previousStateDirectory === undefined) delete process.env.XCSH_ZOOM_STATE_DIR;
      else process.env.XCSH_ZOOM_STATE_DIR = previousStateDirectory;
      rmSync(stateDirectory, { recursive: true, force: true });
    }
  });

  it('returns unchanged only when the active meeting identity matches', () => {
    const spawn = spyOn(Bun, 'spawnSync').mockImplementation((argv) => {
      const command = [...argv] as string[];
      const session = command[command.indexOf('--session') + 1];
      const operation = command[command.indexOf('--json') + 1];
      if (operation === 'window') {
        const windows = session === 'console' ? [{ title: 'Meeting', pid: 42 }] : [];
        return {
          exitCode: 0,
          stdout: new TextEncoder().encode(JSON.stringify({ result: { windows } })),
          stderr: new Uint8Array(),
        } as ReturnType<typeof Bun.spawnSync>;
      }
      return {
        exitCode: 0,
        stdout: new TextEncoder().encode(
          JSON.stringify({ result: { items: [{ name: 'Meeting ID123 4567 8901', pid: 42 }] } }),
        ),
        stderr: new Uint8Array(),
      } as ReturnType<typeof Bun.spawnSync>;
    });
    try {
      expect(call('join', ['https://zoom.example.com/j/12345678901?pwd=secret'])).toMatchObject({
        exitCode: 0,
        session: 'console',
        changed: false,
        verified: true,
        meeting_identity: '12345678901',
      });
      expect(call('join', ['123456789'])).toMatchObject({
        exitCode: 1,
        code: 'active_meeting_conflict',
        changed: false,
        verified: true,
      });
    } finally {
      spawn.mockRestore();
    }
  });

  it('reuses an existing Zoom client without treating its home window as an active meeting', () => {
    let launched = false;
    const calls: string[][] = [];
    const spawn = spyOn(Bun, 'spawnSync').mockImplementation((argv) => {
      const command = [...argv] as string[];
      calls.push(command);
      const session = command[command.indexOf('--session') + 1];
      const operation = command[command.indexOf('--json') + 1];
      if (operation === 'window') {
        const windows =
          session === 'console'
            ? launched
              ? [{ title: 'Meeting', pid: 42 }]
              : [{ title: 'Zoom Workplace - Free account', pid: 42 }]
            : [];
        return {
          exitCode: 0,
          stdout: new TextEncoder().encode(JSON.stringify({ result: { windows } })),
          stderr: new Uint8Array(),
        } as ReturnType<typeof Bun.spawnSync>;
      }
      if (operation === 'app') launched = true;
      return {
        exitCode: 0,
        stdout: new TextEncoder().encode(
          JSON.stringify({ result: { items: [{ name: 'Meeting ID123 4567 8901', pid: 42 }] } }),
        ),
        stderr: new Uint8Array(),
      } as ReturnType<typeof Bun.spawnSync>;
    });
    try {
      expect(call('join', ['https://zoom.example.com/j/12345678901?pwd=secret'])).toMatchObject({
        exitCode: 0,
        state: 'in_meeting',
        changed: true,
        verified: true,
      });
      expect(calls).toContainEqual([
        'xorgctl',
        '--session',
        'console',
        '--json',
        'app',
        'launch',
        '--params',
        JSON.stringify({
          argv: ['zoom', 'zoommtg://zoom.example.com/join?action=join&confno=12345678901&pwd=secret'],
        }),
      ]);
    } finally {
      spawn.mockRestore();
    }
  });

  it('declares Xorg and Zoom extension entrypoints where xcsh loads them', async () => {
    for (const plugin of ['xorg', 'zoom']) {
      const manifest = JSON.parse(
        await readFile(join(import.meta.dir, '..', 'plugins', plugin, '.xcsh-plugin', 'plugin.json'), 'utf8'),
      ) as { extensions?: string[] };
      expect(manifest.extensions).toEqual(['extensions/integration.ts']);
    }
  });

  it('declares immutable argv arrays and environment names without values', async () => {
    for (const plugin of ['aws', 'azure', 'gcloud', 'github', 'gitlab', 'salesforce']) {
      const definitions = await definitionsFor(plugin);
      const plan = definitions.find((definition) => definition.setup)?.setup;
      expect(plan).toBeDefined();
      if (!plan) throw new Error(`${plugin} did not declare a setup plan`);
      expect(plan.steps.every((step) => Array.isArray(step.argv) && step.argv.length > 0)).toBe(true);
      expect(plan.requiredEnvironment.every((name) => /^[A-Z_][A-Z0-9_]*$/.test(name))).toBe(true);
      expect(JSON.stringify(plan)).not.toMatch(/token=[^"\s]+|password=[^"\s]+|secret=[^"\s]+/i);
    }
  });

  it('runs KVM setup through its idempotent v2 controller', async () => {
    const [kvm] = await definitionsFor('kvm');
    const controller = join(import.meta.dir, '..', 'plugins', 'kvm', 'scripts', 'kvm-smsv2ctl');
    expect(kvm.dependencies).toEqual(['platform']);
    expect(kvm.setup?.pluginDependencies).toEqual(['platform']);
    expect(kvm.setup?.steps).toHaveLength(1);
    expect(kvm.setup?.steps[0]).toMatchObject({
      kind: 'install',
      argv: [controller, '--json', 'setup', 'apply'],
      timeoutMs: 7_200_000,
      environment: ['XCSH_API_URL', 'XCSH_API_TOKEN'],
      stdin: 'inherit',
    });
    expect(kvm.setup?.verification).toEqual([{ argv: [controller, '--json', 'setup', 'status'], timeoutMs: 60_000 }]);
  });

  it('keeps non-human principals as account associations only', async () => {
    const [aws] = await definitionsFor('aws');
    if (!aws.profile) throw new Error('AWS did not declare a profile projection');
    const projection = aws.profile({
      Account: '123456789012',
      Arn: 'arn:aws:sts::123456789012:assumed-role/ci/job',
    });
    expect(projection.facts.accounts).toEqual([
      {
        provider: 'aws',
        identifier: 'arn:aws:sts::123456789012:assumed-role/ci/job',
        principalType: 'role',
        accountId: '123456789012',
      },
    ]);
    expect(projection.facts.email).toBeUndefined();
    expect(projection.facts.givenName).toBeUndefined();

    const [salesforce] = await definitionsFor('salesforce');
    if (!salesforce.profile) throw new Error('Salesforce did not declare a profile projection');
    const automated = salesforce.profile({
      userId: '005000000000001',
      username: 'automation@example.com',
      userType: 'AutomatedProcess',
      instanceUrl: '<instance-url>',
      collectedAt: '2026-01-01T00:00:00.000Z',
      managerName: 'Must Not Escape',
      discoveredRole: 'bot',
    });
    expect(automated.facts.accounts).toEqual([
      {
        provider: 'salesforce',
        identifier: '005000000000001',
        principalType: 'service',
        accountId: '<instance-url>',
        username: 'automation@example.com',
      },
    ]);
    expect(automated.facts.identifiers).toBeUndefined();
    expect(automated.facts.manager).toBeUndefined();
    expect(automated.facts.role).toBeUndefined();
  });

  it('uses exact provider argv and propagates retry headers without extra probes', async () => {
    for (const [plugin, integrationId, executable, probeArgv] of [
      ['aws', 'aws', 'aws', ['aws', 'sts', 'get-caller-identity', '--output', 'json']],
      ['azure', 'azure', 'az', ['az', 'account', 'show', '--output', 'json']],
      ['gcloud', 'gcloud', 'gcloud', ['gcloud', 'auth', 'list', '--filter=status:ACTIVE', '--format=json']],
      ['github', 'github', 'gh', ['gh', 'api', 'user']],
      ['gitlab', 'gitlab', 'glab', ['glab', 'api', 'user']],
      ['salesforce', 'salesforce', 'sf', ['sf', 'org', 'display', '--json']],
    ] as const) {
      const definition = (await definitionsFor(plugin)).find((candidate) => candidate.id === integrationId);
      if (!definition) throw new Error(`${plugin} did not register ${integrationId}`);
      const calls: string[][] = [];
      const spawn = spyOn(Bun, 'spawnSync').mockImplementation((argv) => {
        calls.push([...argv] as string[]);
        if (calls.length === 1) return { exitCode: 0 } as ReturnType<typeof Bun.spawnSync>;
        return {
          exitCode: 1,
          stdout: new Uint8Array(),
          stderr: new TextEncoder().encode('HTTP 429\nRetry-After: 120'),
        } as ReturnType<typeof Bun.spawnSync>;
      });
      try {
        expect(await definition.probe()).toEqual({
          state: 'rate_limited',
          reason: 'rate_limited',
          retryAfterMs: 120_000,
        });
        expect(calls).toEqual([[process.platform === 'win32' ? 'where' : 'which', executable], [...probeArgv]]);
      } finally {
        spawn.mockRestore();
      }
    }
  });
});
