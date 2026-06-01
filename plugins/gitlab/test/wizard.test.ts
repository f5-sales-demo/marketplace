import { describe, expect, it } from 'bun:test';
import type { PlatformInfo } from '../src/platform';
import { buildInstallStep, buildVerifyCommand, runSetupWizard } from '../src/wizard';

// ---------------------------------------------------------------------------
// Helper builders — exact command assertions
// ---------------------------------------------------------------------------

describe('buildInstallStep', () => {
  it('macOS brew command is exactly brew install glab', () => {
    const platform: PlatformInfo = {
      os: 'darwin',
      arch: 'arm64',
      packageManagers: ['brew'],
      isCorporateManaged: false,
    };
    const options = buildInstallStep(platform);
    const brew = options.find((o) => o.manager === 'brew');
    expect(brew).toBeDefined();
    expect(brew?.command).toEqual(['brew', 'install', 'glab']);
  });

  it('winget command is winget install GLab.GLab', () => {
    const platform: PlatformInfo = {
      os: 'win32',
      arch: 'x64',
      packageManagers: ['winget'],
      isCorporateManaged: false,
    };
    const winget = buildInstallStep(platform).find((o) => o.manager === 'winget');
    expect(winget?.command).toEqual(['winget', 'install', 'GLab.GLab']);
  });

  it('returns empty when no package managers available', () => {
    const platform: PlatformInfo = { os: 'linux', arch: 'x64', packageManagers: [], isCorporateManaged: false };
    expect(buildInstallStep(platform)).toHaveLength(0);
  });

  it('returns empty on linux with only npm (no apt for glab)', () => {
    const platform: PlatformInfo = {
      os: 'linux',
      arch: 'x64',
      packageManagers: ['npm'],
      isCorporateManaged: false,
    };
    expect(buildInstallStep(platform)).toHaveLength(0);
  });

  it('returns empty on linux with only apt (glab not in apt)', () => {
    const platform: PlatformInfo = {
      os: 'linux',
      arch: 'x64',
      packageManagers: ['apt'],
      isCorporateManaged: false,
    };
    expect(buildInstallStep(platform)).toHaveLength(0);
  });
});

describe('buildVerifyCommand', () => {
  it('returns exact glab auth status command', () => {
    expect(buildVerifyCommand()).toEqual(['glab', 'auth', 'status']);
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
// runSetupWizard — glab already installed, auth flow
// ---------------------------------------------------------------------------

describe('runSetupWizard — glab installed, auth', () => {
  const glabInstalled = { checkGlabInstalled: () => true };

  it('reports version then proceeds to auth', async () => {
    const { pi } = buildMockPi({
      '--version': { stdout: 'glab version 1.40.0', stderr: '', code: 0 },
      'auth status': {
        stdout: '',
        stderr: 'Logged in to gitlab.com as johndoe',
        code: 0,
      },
    });
    const { ctx, notifications } = buildMockCtx();

    await runSetupWizard(pi, ctx, glabInstalled);

    expect(notifications.find((n) => n.message.includes('1.40.0'))).toBeDefined();
    expect(notifications.find((n) => n.message.includes('GitLab ready'))).toBeDefined();
  });

  it('handles auth failure', async () => {
    const { pi } = buildMockPi({
      '--version': { stdout: 'glab version 1.40.0', stderr: '', code: 0 },
      'auth login': { stdout: '', stderr: 'TIMEOUT', code: 1 },
    });
    const { ctx, notifications } = buildMockCtx();

    await runSetupWizard(pi, ctx, glabInstalled);

    expect(notifications.find((n) => n.message.includes('Authentication failed'))?.type).toBe('error');
  });

  it('handles verify failure with warning', async () => {
    const { pi } = buildMockPi({
      '--version': { stdout: 'glab version 1.40.0', stderr: '', code: 0 },
      'auth login': { stdout: '', stderr: '', code: 0 },
      'auth status': { stdout: '', stderr: 'error', code: 1 },
    });
    const { ctx, notifications } = buildMockCtx();

    await runSetupWizard(pi, ctx, glabInstalled);

    expect(notifications.find((n) => n.message.includes('may have succeeded'))?.type).toBe('warning');
  });
});

// ---------------------------------------------------------------------------
// runSetupWizard — glab NOT installed (auto-install flow)
// ---------------------------------------------------------------------------

describe('runSetupWizard — glab not installed', () => {
  let installCount = 0;
  const glabNotInstalledThenInstalled = {
    checkGlabInstalled: () => {
      installCount++;
      return installCount > 1;
    },
  };

  it('auto-installs via preferred package manager and notifies restart', async () => {
    installCount = 0;
    const { pi, calls } = buildMockPi({
      'brew install glab': { stdout: 'installed', stderr: '', code: 0 },
      '--version': { stdout: 'glab version 1.40.0', stderr: '', code: 0 },
      'auth status': {
        stdout: '',
        stderr: 'Logged in to gitlab.com as johndoe',
        code: 0,
      },
    });
    const { ctx, notifications } = buildMockCtx();

    await runSetupWizard(pi, ctx, glabNotInstalledThenInstalled);

    const installCall = calls.find((c) => c.cmd === 'brew' && c.args.includes('glab'));
    expect(installCall).toBeDefined();
    expect(installCall?.args).toEqual(['install', 'glab']);
    expect(notifications.find((n) => n.message.includes('installed'))?.message).toContain('1.40.0');
    expect(notifications.find((n) => n.message.includes('Restart xcsh'))).toBeDefined();
  });

  it('install failure shows error', async () => {
    const { pi } = buildMockPi({
      'brew install glab': { stdout: '', stderr: 'permission denied', code: 1 },
    });
    const { ctx, notifications } = buildMockCtx({ selectResponses: ['Skip'] });

    await runSetupWizard(pi, ctx, { checkGlabInstalled: () => false });

    expect(notifications.find((n) => n.message.includes('Installation failed'))?.type).toBe('error');
  });

  it('no package manager shows manual install link', async () => {
    const { pi } = buildMockPi();
    const { ctx, notifications } = buildMockCtx();

    await runSetupWizard(pi, ctx, { checkGlabInstalled: () => false });

    const hasError = notifications.some((n) => n.type === 'error');
    expect(hasError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Notification ordering
// ---------------------------------------------------------------------------

describe('runSetupWizard — notifications', () => {
  it('first notification is platform detection', async () => {
    const { pi } = buildMockPi({ '--version': { stdout: 'v1', stderr: '', code: 0 } });
    const { ctx, notifications } = buildMockCtx();

    await runSetupWizard(pi, ctx, { checkGlabInstalled: () => true });

    expect(notifications[0].message).toContain('Detected:');
  });
});
