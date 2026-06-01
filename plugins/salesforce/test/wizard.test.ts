import { describe, expect, it } from 'bun:test';
import type { PlatformInfo } from '../src/platform';
import { buildAuthStep, buildInstallStep, buildVerifyCommand, runSetupWizard } from '../src/wizard';

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

describe('buildInstallStep', () => {
  it('returns install options for macOS with brew', () => {
    const platform: PlatformInfo = {
      os: 'darwin',
      arch: 'arm64',
      packageManagers: ['brew', 'npm'],
      isCorporateManaged: false,
    };
    const options = buildInstallStep(platform);
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options[0].label).toContain('Homebrew');
    expect(options[0].command[0]).toBe('brew');
  });

  it('returns npm fallback for linux without apt', () => {
    const platform: PlatformInfo = {
      os: 'linux',
      arch: 'x64',
      packageManagers: ['npm'],
      isCorporateManaged: false,
    };
    const options = buildInstallStep(platform);
    expect(options).toHaveLength(1);
    expect(options[0].manager).toBe('npm');
  });

  it('returns winget for windows', () => {
    const platform: PlatformInfo = {
      os: 'win32',
      arch: 'x64',
      packageManagers: ['winget', 'npm'],
      isCorporateManaged: false,
    };
    const options = buildInstallStep(platform);
    expect(options[0].label).toContain('winget');
  });
});

describe('buildAuthStep', () => {
  it('always includes web browser option first', () => {
    const options = buildAuthStep();
    expect(options[0].key).toBe('web');
    expect(options[0].available).toBe(true);
  });
});

describe('buildVerifyCommand', () => {
  it('returns the sf org display command with alias', () => {
    const cmd = buildVerifyCommand('SFDC');
    expect(cmd).toEqual(['sf', 'org', 'display', '--target-org', 'SFDC', '--json']);
  });

  it('uses provided alias', () => {
    const cmd = buildVerifyCommand('my-org');
    expect(cmd).toContain('my-org');
  });
});

// ---------------------------------------------------------------------------
// runSetupWizard — full flow tests with mocked UI and exec
// ---------------------------------------------------------------------------

function buildMockCtx(overrides?: { selectResponses?: Array<string | undefined>; confirmResponses?: boolean[] }) {
  const notifications: Array<{ message: string; type?: string }> = [];
  let selectIndex = 0;
  let confirmIndex = 0;
  const selectResponses = overrides?.selectResponses ?? [];
  const confirmResponses = overrides?.confirmResponses ?? [];

  return {
    ctx: {
      ui: {
        select(_title: string, _options: string[]) {
          return Promise.resolve(selectResponses[selectIndex++]);
        },
        confirm(_title: string, _message: string) {
          return Promise.resolve(confirmResponses[confirmIndex++] ?? false);
        },
        notify(message: string, type?: string) {
          notifications.push({ message, type });
        },
      },
      cwd: '/tmp',
      reload: undefined as (() => Promise<void>) | undefined,
    },
    notifications,
  };
}

function buildMockPi(execResponses?: Record<string, { stdout: string; stderr: string; code: number }>) {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  return {
    pi: {
      async exec(cmd: string, args: string[]) {
        calls.push({ cmd, args });
        const key = [cmd, ...args].join(' ');
        for (const [pattern, response] of Object.entries(execResponses ?? {})) {
          if (key.includes(pattern)) return response;
        }
        return { stdout: '', stderr: '', code: 0 };
      },
    },
    calls,
  };
}

describe('runSetupWizard — sf already installed', () => {
  it('reports sf version and proceeds to auth selection', async () => {
    const { pi } = buildMockPi({
      '--version': { stdout: '@salesforce/cli/2.50.0', stderr: '', code: 0 },
    });
    const { ctx, notifications } = buildMockCtx({
      selectResponses: ['Skip authentication'],
    });

    await runSetupWizard(pi, ctx);

    const versionNotif = notifications.find((n) => n.message.includes('already installed'));
    expect(versionNotif).toBeDefined();
    expect(versionNotif?.message).toContain('2.50.0');

    const skipNotif = notifications.find((n) => n.message.includes('Run /salesforce:setup again'));
    expect(skipNotif).toBeDefined();
  });

  it('executes web auth when selected', async () => {
    const { pi, calls } = buildMockPi({
      '--version': { stdout: '@salesforce/cli/2.50.0', stderr: '', code: 0 },
      'org display': {
        stdout: JSON.stringify({
          status: 0,
          result: { username: 'user@test.com', instanceUrl: 'https://test.sf.com' },
        }),
        stderr: '',
        code: 0,
      },
    });
    const { ctx, notifications } = buildMockCtx({
      selectResponses: ['Web browser (recommended for workstations)'],
    });

    await runSetupWizard(pi, ctx);

    const authCall = calls.find((c) => c.args.includes('login') && c.args.includes('web'));
    expect(authCall).toBeDefined();
    expect(authCall?.args).toContain('--set-default');
    expect(authCall?.args).toContain('SFDC');

    const readyNotif = notifications.find((n) => n.message.includes('Salesforce ready'));
    expect(readyNotif).toBeDefined();
    expect(readyNotif?.message).toContain('user@test.com');
  });

  it('handles auth failure gracefully', async () => {
    const { pi } = buildMockPi({
      '--version': { stdout: '@salesforce/cli/2.50.0', stderr: '', code: 0 },
      'org login web': { stdout: '', stderr: 'INVALID_SESSION_ID', code: 1 },
    });
    const { ctx, notifications } = buildMockCtx({
      selectResponses: ['Web browser (recommended for workstations)'],
    });

    await runSetupWizard(pi, ctx);

    const failNotif = notifications.find((n) => n.message.includes('Authentication failed'));
    expect(failNotif).toBeDefined();
    expect(failNotif?.type).toBe('error');
  });

  it('handles verify failure with warning', async () => {
    const { pi } = buildMockPi({
      '--version': { stdout: '@salesforce/cli/2.50.0', stderr: '', code: 0 },
      'org login web': { stdout: '', stderr: '', code: 0 },
      'org display': { stdout: '', stderr: 'error', code: 1 },
    });
    const { ctx, notifications } = buildMockCtx({
      selectResponses: ['Web browser (recommended for workstations)'],
    });

    await runSetupWizard(pi, ctx);

    const warnNotif = notifications.find((n) => n.message.includes('may have succeeded'));
    expect(warnNotif).toBeDefined();
    expect(warnNotif?.type).toBe('warning');
  });

  it('user cancels auth by selecting undefined', async () => {
    const { pi } = buildMockPi({
      '--version': { stdout: '@salesforce/cli/2.50.0', stderr: '', code: 0 },
    });
    const { ctx, notifications } = buildMockCtx({
      selectResponses: [undefined],
    });

    await runSetupWizard(pi, ctx);

    const skipNotif = notifications.find((n) => n.message.includes('Run /salesforce:setup again'));
    expect(skipNotif).toBeDefined();
  });
});

describe('runSetupWizard — verify step', () => {
  it('parses org display JSON on success', async () => {
    const orgData = { username: 'admin@prod.com', instanceUrl: 'https://prod.my.salesforce.com' };
    const { pi } = buildMockPi({
      '--version': { stdout: '@salesforce/cli/2.50.0', stderr: '', code: 0 },
      'org login web': { stdout: '', stderr: '', code: 0 },
      'org display': { stdout: JSON.stringify({ status: 0, result: orgData }), stderr: '', code: 0 },
    });
    const { ctx, notifications } = buildMockCtx({
      selectResponses: ['Web browser (recommended for workstations)'],
    });

    await runSetupWizard(pi, ctx);

    const ready = notifications.find((n) => n.message.includes('Salesforce ready'));
    expect(ready).toBeDefined();
    expect(ready?.message).toContain('admin@prod.com');
    expect(ready?.message).toContain('prod.my.salesforce.com');
  });

  it('handles malformed JSON in verify gracefully', async () => {
    const { pi } = buildMockPi({
      '--version': { stdout: '@salesforce/cli/2.50.0', stderr: '', code: 0 },
      'org login web': { stdout: '', stderr: '', code: 0 },
      'org display': { stdout: 'not json', stderr: '', code: 0 },
    });
    const { ctx, notifications } = buildMockCtx({
      selectResponses: ['Web browser (recommended for workstations)'],
    });

    await runSetupWizard(pi, ctx);

    const fallback = notifications.find((n) => n.message.includes('Run /salesforce:setup to confirm'));
    expect(fallback).toBeDefined();
  });
});

describe('runSetupWizard — notification flow', () => {
  it('first notification is wizard starting', async () => {
    const { pi } = buildMockPi({
      '--version': { stdout: 'v2', stderr: '', code: 0 },
    });
    const { ctx, notifications } = buildMockCtx({ selectResponses: ['Skip authentication'] });

    await runSetupWizard(pi, ctx);

    expect(notifications[0].message).toContain('Setup Wizard starting');
    expect(notifications[0].type).toBe('info');
  });

  it('second notification is platform detection', async () => {
    const { pi } = buildMockPi({
      '--version': { stdout: 'v2', stderr: '', code: 0 },
    });
    const { ctx, notifications } = buildMockCtx({ selectResponses: ['Skip authentication'] });

    await runSetupWizard(pi, ctx);

    expect(notifications[1].message).toContain('Detected:');
  });
});
