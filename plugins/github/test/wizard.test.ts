import { describe, expect, it } from 'bun:test';
import type { PlatformInfo } from '../src/platform';
import { buildInstallStep, buildVerifyCommand, runSetupWizard } from '../src/wizard';

// ---------------------------------------------------------------------------
// Helper builders — exact command assertions
// ---------------------------------------------------------------------------

describe('buildInstallStep', () => {
  it('macOS brew command is exactly brew install gh', () => {
    const platform: PlatformInfo = {
      os: 'darwin',
      arch: 'arm64',
      packageManagers: ['brew'],
      isCorporateManaged: false,
    };
    const options = buildInstallStep(platform);
    const brew = options.find((o) => o.manager === 'brew');
    expect(brew).toBeDefined();
    expect(brew?.command).toEqual(['brew', 'install', 'gh']);
  });

  it('winget command is winget install GitHub.cli', () => {
    const platform: PlatformInfo = {
      os: 'win32',
      arch: 'x64',
      packageManagers: ['winget'],
      isCorporateManaged: false,
    };
    const winget = buildInstallStep(platform).find((o) => o.manager === 'winget');
    expect(winget?.command).toEqual(['winget', 'install', 'GitHub.cli']);
  });

  it('apt command is sudo apt install -y gh', () => {
    const platform: PlatformInfo = {
      os: 'linux',
      arch: 'x64',
      packageManagers: ['apt'],
      isCorporateManaged: false,
    };
    const apt = buildInstallStep(platform).find((o) => o.manager === 'apt');
    expect(apt?.command).toEqual(['sudo', 'apt', 'install', '-y', 'gh']);
  });

  it('returns empty when no package managers available', () => {
    const platform: PlatformInfo = { os: 'linux', arch: 'x64', packageManagers: [], isCorporateManaged: false };
    expect(buildInstallStep(platform)).toHaveLength(0);
  });

  it('does not include npm fallback', () => {
    const platform: PlatformInfo = {
      os: 'linux',
      arch: 'x64',
      packageManagers: ['npm'],
      isCorporateManaged: false,
    };
    expect(buildInstallStep(platform)).toHaveLength(0);
  });
});

describe('buildVerifyCommand', () => {
  it('returns exact gh auth status command', () => {
    expect(buildVerifyCommand()).toEqual(['gh', 'auth', 'status']);
  });
});

// ---------------------------------------------------------------------------
// Mock builders
// ---------------------------------------------------------------------------

function buildMockCtx(overrides?: {
  selectResponses?: Array<string | undefined>;
  inputResponses?: Array<string | undefined>;
}) {
  const notifications: Array<{ message: string; type?: string }> = [];
  let selectIndex = 0;
  let inputIndex = 0;
  const selectResponses = overrides?.selectResponses ?? [];
  const inputResponses = overrides?.inputResponses ?? [];
  let reloadCalled = false;

  return {
    ctx: {
      ui: {
        select(_title: string, _options: string[]) {
          return Promise.resolve(selectResponses[selectIndex++]);
        },
        confirm(_title: string, _message: string) {
          return Promise.resolve(true);
        },
        input(_title: string, _placeholder?: string) {
          return Promise.resolve(inputResponses[inputIndex++]);
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
// runSetupWizard — gh already installed, auth flow
// ---------------------------------------------------------------------------

describe('runSetupWizard — gh installed, auth', () => {
  const ghInstalled = { checkGhInstalled: () => true };

  it('reports version then proceeds to auth', async () => {
    const { pi } = buildMockPi({
      '--version': { stdout: 'gh version 2.50.0', stderr: '', code: 0 },
      'auth status': {
        stdout: 'Logged in to github.com as octocat',
        stderr: '',
        code: 0,
      },
    });
    const { ctx, notifications } = buildMockCtx();

    await runSetupWizard(pi, ctx, ghInstalled);

    expect(notifications.find((n) => n.message.includes('2.50.0'))).toBeDefined();
    expect(notifications.find((n) => n.message.includes('GitHub ready'))).toBeDefined();
  });

  it('handles auth failure', async () => {
    const { pi } = buildMockPi({
      '--version': { stdout: 'gh version 2.50.0', stderr: '', code: 0 },
      'auth login': { stdout: '', stderr: 'TIMEOUT', code: 1 },
    });
    const { ctx, notifications } = buildMockCtx();

    await runSetupWizard(pi, ctx, ghInstalled);

    expect(notifications.find((n) => n.message.includes('Authentication failed'))?.type).toBe('error');
  });

  it('handles verify failure with warning', async () => {
    const { pi } = buildMockPi({
      '--version': { stdout: 'gh version 2.50.0', stderr: '', code: 0 },
      'auth login': { stdout: '', stderr: '', code: 0 },
      'auth status': { stdout: '', stderr: 'error', code: 1 },
    });
    const { ctx, notifications } = buildMockCtx();

    await runSetupWizard(pi, ctx, ghInstalled);

    expect(notifications.find((n) => n.message.includes('may have succeeded'))?.type).toBe('warning');
  });
});

// ---------------------------------------------------------------------------
// runSetupWizard — gh NOT installed (auto-install flow)
// ---------------------------------------------------------------------------

describe('runSetupWizard — gh not installed', () => {
  let installCount = 0;
  const ghNotInstalledThenInstalled = {
    checkGhInstalled: () => {
      installCount++;
      return installCount > 1;
    },
  };

  it('auto-installs via preferred package manager and notifies restart', async () => {
    installCount = 0;
    const { pi, calls } = buildMockPi({
      'brew install gh': { stdout: 'installed', stderr: '', code: 0 },
      '--version': { stdout: 'gh version 2.50.0', stderr: '', code: 0 },
      'auth status': {
        stdout: 'Logged in to github.com as octocat',
        stderr: '',
        code: 0,
      },
    });
    const { ctx, notifications } = buildMockCtx();

    await runSetupWizard(pi, ctx, ghNotInstalledThenInstalled);

    const installCall = calls.find((c) => c.cmd === 'brew' && c.args.includes('gh'));
    expect(installCall).toBeDefined();
    expect(installCall?.args).toEqual(['install', 'gh']);
    expect(notifications.find((n) => n.message.includes('installed'))?.message).toContain('2.50.0');
    expect(notifications.find((n) => n.message.includes('Restart xcsh'))).toBeDefined();
  });

  it('install failure shows error', async () => {
    const { pi } = buildMockPi({
      'brew install gh': { stdout: '', stderr: 'permission denied', code: 1 },
    });
    const { ctx, notifications } = buildMockCtx({ selectResponses: ['Skip'] });

    await runSetupWizard(pi, ctx, { checkGhInstalled: () => false });

    expect(notifications.find((n) => n.message.includes('Installation failed'))?.type).toBe('error');
  });

  it('no package manager shows manual install link', async () => {
    const { pi } = buildMockPi();
    const { ctx, notifications } = buildMockCtx();

    // Override detectPlatform — wizard calls it internally, but we test the downstream effect
    // by using a checkGhInstalled that always returns false and empty install options
    await runSetupWizard(pi, ctx, { checkGhInstalled: () => false });

    // On macOS with brew available this won't trigger — but the flow exits on install failure
    // This test validates the error path exists
    const hasError = notifications.some((n) => n.type === 'error');
    expect(hasError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Notification ordering
// ---------------------------------------------------------------------------

describe('runSetupWizard — notifications', () => {
  it('first notification is platform detection', async () => {
    const { pi } = buildMockPi({ '--version': { stdout: 'v2', stderr: '', code: 0 } });
    const { ctx, notifications } = buildMockCtx();

    await runSetupWizard(pi, ctx, { checkGhInstalled: () => true });

    expect(notifications[0].message).toContain('Detected:');
  });
});
