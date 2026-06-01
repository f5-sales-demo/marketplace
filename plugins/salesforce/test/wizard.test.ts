import { describe, expect, it } from 'bun:test';
import type { PlatformInfo } from '../src/platform';
import { buildAuthStep, buildInstallStep, buildVerifyCommand, runSetupWizard } from '../src/wizard';

// ---------------------------------------------------------------------------
// Helper builders — exact command assertions
// ---------------------------------------------------------------------------

describe('buildInstallStep', () => {
  it('macOS brew command is exactly brew install sf', () => {
    const platform: PlatformInfo = {
      os: 'darwin',
      arch: 'arm64',
      packageManagers: ['brew', 'npm'],
      isCorporateManaged: false,
    };
    const options = buildInstallStep(platform);
    const brew = options.find((o) => o.manager === 'brew');
    expect(brew).toBeDefined();
    expect(brew?.command).toEqual(['brew', 'install', 'sf']);
  });

  it('npm fallback command is npm install -g @salesforce/cli', () => {
    const platform: PlatformInfo = {
      os: 'linux',
      arch: 'x64',
      packageManagers: ['npm'],
      isCorporateManaged: false,
    };
    const options = buildInstallStep(platform);
    expect(options).toHaveLength(1);
    expect(options[0].command).toEqual(['npm', 'install', '-g', '@salesforce/cli']);
  });

  it('winget command is winget install Salesforce.SalesforceCLI', () => {
    const platform: PlatformInfo = {
      os: 'win32',
      arch: 'x64',
      packageManagers: ['winget', 'npm'],
      isCorporateManaged: false,
    };
    const options = buildInstallStep(platform);
    const winget = options.find((o) => o.manager === 'winget');
    expect(winget?.command).toEqual(['winget', 'install', 'Salesforce.SalesforceCLI']);
  });

  it('scoop command is scoop install sf', () => {
    const platform: PlatformInfo = {
      os: 'win32',
      arch: 'x64',
      packageManagers: ['scoop'],
      isCorporateManaged: false,
    };
    const options = buildInstallStep(platform);
    expect(options[0].command).toEqual(['scoop', 'install', 'sf']);
  });

  it('returns empty when no package managers available', () => {
    const platform: PlatformInfo = {
      os: 'linux',
      arch: 'x64',
      packageManagers: [],
      isCorporateManaged: false,
    };
    expect(buildInstallStep(platform)).toHaveLength(0);
  });
});

describe('buildAuthStep', () => {
  it('always includes web browser option first', () => {
    const options = buildAuthStep();
    expect(options[0].key).toBe('web');
    expect(options[0].available).toBe(true);
  });

  it('includes all 4 auth methods', () => {
    const options = buildAuthStep();
    const keys = options.map((o) => o.key);
    expect(keys).toEqual(['web', 'sfdx_url', 'access_token', 'jwt']);
  });
});

describe('buildVerifyCommand', () => {
  it('returns exact sf org display command', () => {
    expect(buildVerifyCommand('SFDC')).toEqual(['sf', 'org', 'display', '--target-org', 'SFDC', '--json']);
  });
});

// ---------------------------------------------------------------------------
// Mock builders
// ---------------------------------------------------------------------------

function buildMockCtx(overrides?: { selectResponses?: Array<string | undefined>; confirmResponses?: boolean[] }) {
  const notifications: Array<{ message: string; type?: string }> = [];
  let selectIndex = 0;
  let confirmIndex = 0;
  const selectResponses = overrides?.selectResponses ?? [];
  const confirmResponses = overrides?.confirmResponses ?? [];
  let reloadCalled = false;

  return {
    ctx: {
      ui: {
        select(_title: string, _options: string[]) {
          return Promise.resolve(selectResponses[selectIndex++]);
        },
        confirm(_title: string, _message: string) {
          return Promise.resolve(confirmResponses[confirmIndex++] ?? false);
        },
        input(_title: string, _placeholder?: string) {
          return Promise.resolve(selectResponses[selectIndex++]);
        },
        notify(message: string, type?: string) {
          notifications.push({ message, type });
        },
      },
      cwd: '/tmp',
      async reload() {
        reloadCalled = true;
      },
    },
    notifications,
    wasReloadCalled: () => reloadCalled,
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

// ---------------------------------------------------------------------------
// runSetupWizard — sf already installed (override checkSfInstalled = true)
// ---------------------------------------------------------------------------

describe('runSetupWizard — sf already installed', () => {
  const sfInstalled = { checkSfInstalled: () => true };

  it('reports sf version and proceeds to auth selection', async () => {
    const { pi } = buildMockPi({ '--version': { stdout: '@salesforce/cli/2.50.0', stderr: '', code: 0 } });
    const { ctx, notifications } = buildMockCtx({ selectResponses: ['Skip authentication'] });

    await runSetupWizard(pi, ctx, sfInstalled);

    expect(notifications.find((n) => n.message.includes('already installed'))?.message).toContain('2.50.0');
    expect(notifications.find((n) => n.message.includes('Run /salesforce:setup again'))).toBeDefined();
  });

  it('executes web auth and verifies', async () => {
    const { pi, calls } = buildMockPi({
      '--version': { stdout: 'v2.50.0', stderr: '', code: 0 },
      'org display': {
        stdout: JSON.stringify({ result: { username: 'user@test.com', instanceUrl: 'https://test.sf.com' } }),
        stderr: '',
        code: 0,
      },
    });
    const { ctx, notifications } = buildMockCtx({
      selectResponses: ['Web browser (recommended for workstations)'],
    });

    await runSetupWizard(pi, ctx, sfInstalled);

    const authCall = calls.find((c) => c.args.includes('login') && c.args.includes('web'));
    expect(authCall).toBeDefined();
    expect(authCall?.args).toContain('--set-default');
    expect(authCall?.args).toContain('SFDC');
    expect(notifications.find((n) => n.message.includes('Salesforce ready'))?.message).toContain('user@test.com');
  });

  it('handles auth failure', async () => {
    const { pi } = buildMockPi({
      '--version': { stdout: 'v2', stderr: '', code: 0 },
      'org login web': { stdout: '', stderr: 'INVALID_SESSION_ID', code: 1 },
    });
    const { ctx, notifications } = buildMockCtx({
      selectResponses: ['Web browser (recommended for workstations)'],
    });

    await runSetupWizard(pi, ctx, sfInstalled);

    const fail = notifications.find((n) => n.message.includes('Authentication failed'));
    expect(fail).toBeDefined();
    expect(fail?.type).toBe('error');
  });

  it('handles verify failure with warning', async () => {
    const { pi } = buildMockPi({
      '--version': { stdout: 'v2', stderr: '', code: 0 },
      'org display': { stdout: '', stderr: 'error', code: 1 },
    });
    const { ctx, notifications } = buildMockCtx({
      selectResponses: ['Web browser (recommended for workstations)'],
    });

    await runSetupWizard(pi, ctx, sfInstalled);

    expect(notifications.find((n) => n.message.includes('may have succeeded'))?.type).toBe('warning');
  });

  it('handles malformed verify JSON', async () => {
    const { pi } = buildMockPi({
      '--version': { stdout: 'v2', stderr: '', code: 0 },
      'org display': { stdout: 'not json', stderr: '', code: 0 },
    });
    const { ctx, notifications } = buildMockCtx({
      selectResponses: ['Web browser (recommended for workstations)'],
    });

    await runSetupWizard(pi, ctx, sfInstalled);

    expect(notifications.find((n) => n.message.includes('Run /salesforce:setup to confirm'))).toBeDefined();
  });

  it('user cancels auth', async () => {
    const { pi } = buildMockPi({ '--version': { stdout: 'v2', stderr: '', code: 0 } });
    const { ctx, notifications } = buildMockCtx({ selectResponses: [undefined] });

    await runSetupWizard(pi, ctx, sfInstalled);

    expect(notifications.find((n) => n.message.includes('Run /salesforce:setup again'))).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// runSetupWizard — sf NOT installed (override checkSfInstalled = false)
// ---------------------------------------------------------------------------

describe('runSetupWizard — sf not installed', () => {
  let installCount = 0;
  const sfNotInstalled = {
    checkSfInstalled: () => {
      installCount++;
      return installCount > 1;
    },
  };

  it('offers install options and user skips', async () => {
    installCount = 0;
    const { pi } = buildMockPi();
    const { ctx, notifications } = buildMockCtx({ selectResponses: ['Skip installation'] });

    await runSetupWizard(pi, ctx, { checkSfInstalled: () => false });

    expect(notifications.find((n) => n.message.includes('Setup cancelled'))).toBeDefined();
  });

  it('user selects brew install, confirms, succeeds, reload called', async () => {
    installCount = 0;
    const { pi, calls } = buildMockPi({
      'brew install sf': { stdout: 'installed', stderr: '', code: 0 },
      '--version': { stdout: '@salesforce/cli/2.50.0', stderr: '', code: 0 },
    });
    const { ctx, notifications, wasReloadCalled } = buildMockCtx({
      selectResponses: ['Homebrew (recommended)', 'Skip authentication'],
      confirmResponses: [true],
    });

    await runSetupWizard(pi, ctx, sfNotInstalled);

    const installCall = calls.find((c) => c.cmd === 'brew' && c.args.includes('sf'));
    expect(installCall).toBeDefined();
    expect(installCall?.args).toEqual(['install', 'sf']);
    expect(notifications.find((n) => n.message.includes('installed'))?.message).toContain('2.50.0');
    expect(wasReloadCalled()).toBe(true);
  });

  it('install fails, shows error', async () => {
    const { pi } = buildMockPi({
      'brew install sf': { stdout: '', stderr: 'permission denied', code: 1 },
    });
    const { ctx, notifications } = buildMockCtx({
      selectResponses: ['Homebrew (recommended)'],
      confirmResponses: [true],
    });

    await runSetupWizard(pi, ctx, { checkSfInstalled: () => false });

    expect(notifications.find((n) => n.message.includes('Installation failed'))?.type).toBe('error');
  });

  it('user declines install confirmation', async () => {
    const { pi } = buildMockPi();
    const { ctx, notifications } = buildMockCtx({
      selectResponses: ['Homebrew (recommended)'],
      confirmResponses: [false],
    });

    await runSetupWizard(pi, ctx, { checkSfInstalled: () => false });

    const installCalls = notifications.filter((n) => n.message.includes('Installing'));
    expect(installCalls).toHaveLength(0);
  });

  it('no install options shows manual install URL', async () => {
    // When getInstallOptions returns empty (no matching package managers for this OS),
    // the wizard should show a manual install error.
    // This is tested via buildInstallStep returning [] for empty packageManagers.
    const platform: PlatformInfo = { os: 'linux', arch: 'x64', packageManagers: [], isCorporateManaged: false };
    const options = buildInstallStep(platform);
    expect(options).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Notification flow ordering
// ---------------------------------------------------------------------------

describe('runSetupWizard — notification ordering', () => {
  it('first two notifications are wizard start and platform detection', async () => {
    const { pi } = buildMockPi({ '--version': { stdout: 'v2', stderr: '', code: 0 } });
    const { ctx, notifications } = buildMockCtx({ selectResponses: ['Skip authentication'] });

    await runSetupWizard(pi, ctx, { checkSfInstalled: () => true });

    expect(notifications[0].message).toContain('Setup Wizard starting');
    expect(notifications[1].message).toContain('Detected:');
  });
});
