import { describe, expect, it } from 'bun:test';
import type { PlatformInfo } from '../src/platform';
import { buildAuthStep, buildInstallStep, buildVerifyCommand, runSetupWizard } from '../src/wizard';

// ---------------------------------------------------------------------------
// Helper builders — exact command assertions
// ---------------------------------------------------------------------------

describe('buildInstallStep', () => {
  it('macOS brew command is exactly brew install --cask google-cloud-sdk', () => {
    const platform: PlatformInfo = {
      os: 'darwin',
      arch: 'arm64',
      packageManagers: ['brew', 'npm'],
      isCorporateManaged: false,
    };
    const options = buildInstallStep(platform);
    const brew = options.find((o) => o.manager === 'brew');
    expect(brew).toBeDefined();
    expect(brew?.command).toEqual(['brew', 'install', '--cask', 'google-cloud-sdk']);
  });

  it('winget command is winget install Google.CloudSDK', () => {
    const platform: PlatformInfo = {
      os: 'win32',
      arch: 'x64',
      packageManagers: ['winget', 'npm'],
      isCorporateManaged: false,
    };
    const winget = buildInstallStep(platform).find((o) => o.manager === 'winget');
    expect(winget?.command).toEqual(['winget', 'install', 'Google.CloudSDK']);
  });

  it('apt command is sudo apt install -y google-cloud-sdk', () => {
    const platform: PlatformInfo = {
      os: 'linux',
      arch: 'x64',
      packageManagers: ['apt', 'npm'],
      isCorporateManaged: false,
    };
    const apt = buildInstallStep(platform).find((o) => o.manager === 'apt');
    expect(apt?.command).toEqual(['sudo', 'apt', 'install', '-y', 'google-cloud-sdk']);
  });

  it('returns empty when no package managers available', () => {
    const platform: PlatformInfo = { os: 'linux', arch: 'x64', packageManagers: [], isCorporateManaged: false };
    expect(buildInstallStep(platform)).toHaveLength(0);
  });
});

describe('buildAuthStep', () => {
  it('always includes web browser option first', () => {
    const options = buildAuthStep();
    expect(options[0].key).toBe('web');
    expect(options[0].available).toBe(true);
  });

  it('includes all 2 auth methods', () => {
    expect(buildAuthStep().map((o) => o.key)).toEqual(['web', 'service_account']);
  });
});

describe('buildVerifyCommand', () => {
  it('returns exact gcloud auth print-access-token command', () => {
    expect(buildVerifyCommand()).toEqual(['gcloud', 'auth', 'print-access-token', '--quiet']);
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
// runSetupWizard — gcloud already installed, web auth (deterministic flow)
// ---------------------------------------------------------------------------

describe('runSetupWizard — gcloud installed, web auth', () => {
  const gcloudInstalled = { checkCliInstalled: () => true };

  it('reports version then proceeds to auth', async () => {
    const { pi } = buildMockPi({
      '--version': { stdout: 'Google Cloud SDK 450.0.0\n', stderr: '', code: 0 },
      'print-access-token': { stdout: 'ya29.access_token', stderr: '', code: 0 },
    });
    const { ctx, notifications } = buildMockCtx();

    await runSetupWizard(pi, ctx, gcloudInstalled);

    expect(notifications.find((n) => n.message.includes('450.0.0'))).toBeDefined();
    expect(notifications.find((n) => n.message.includes('Google Cloud ready'))).toBeDefined();
  });

  it('handles auth failure', async () => {
    const { pi } = buildMockPi({
      '--version': { stdout: 'Google Cloud SDK 450.0.0', stderr: '', code: 0 },
      'auth login': { stdout: '', stderr: 'TIMEOUT', code: 1 },
    });
    const { ctx, notifications } = buildMockCtx();

    await runSetupWizard(pi, ctx, gcloudInstalled);

    expect(notifications.find((n) => n.message.includes('Authentication failed'))?.type).toBe('error');
  });

  it('handles verify failure with warning', async () => {
    const { pi } = buildMockPi({
      '--version': { stdout: 'Google Cloud SDK 450.0.0', stderr: '', code: 0 },
      'print-access-token': { stdout: '', stderr: 'error', code: 1 },
    });
    const { ctx, notifications } = buildMockCtx();

    await runSetupWizard(pi, ctx, gcloudInstalled);

    expect(notifications.find((n) => n.message.includes('may have succeeded'))?.type).toBe('warning');
  });
});

// ---------------------------------------------------------------------------
// runSetupWizard — gcloud NOT installed (auto-install flow)
// ---------------------------------------------------------------------------

describe('runSetupWizard — gcloud not installed', () => {
  let installCount = 0;
  const gcloudNotInstalledThenInstalled = {
    checkCliInstalled: () => {
      installCount++;
      return installCount > 1;
    },
  };

  it('auto-installs via preferred package manager and notifies restart', async () => {
    installCount = 0;
    const { pi, calls } = buildMockPi({
      'brew install --cask google-cloud-sdk': { stdout: 'installed', stderr: '', code: 0 },
      '--version': { stdout: 'Google Cloud SDK 450.0.0\n', stderr: '', code: 0 },
      'print-access-token': { stdout: 'ya29.access_token', stderr: '', code: 0 },
    });
    const { ctx, notifications } = buildMockCtx();

    await runSetupWizard(pi, ctx, gcloudNotInstalledThenInstalled);

    const installCall = calls.find((c) => c.cmd === 'brew' && c.args.includes('google-cloud-sdk'));
    expect(installCall).toBeDefined();
    expect(installCall?.args).toEqual(['install', '--cask', 'google-cloud-sdk']);
    expect(notifications.find((n) => n.message.includes('installed'))?.message).toContain('450.0.0');
    expect(notifications.find((n) => n.message.includes('Restart xcsh'))).toBeDefined();
  });

  it('install failure shows error', async () => {
    const { pi } = buildMockPi({
      'brew install --cask google-cloud-sdk': { stdout: '', stderr: 'permission denied', code: 1 },
    });
    const { ctx, notifications } = buildMockCtx({ selectResponses: ['Skip'] });

    await runSetupWizard(pi, ctx, { checkCliInstalled: () => false });

    expect(notifications.find((n) => n.message.includes('Installation failed'))?.type).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// Notification ordering
// ---------------------------------------------------------------------------

describe('runSetupWizard — notifications', () => {
  it('first notification is platform detection', async () => {
    const { pi } = buildMockPi({ '--version': { stdout: 'Google Cloud SDK 450.0.0', stderr: '', code: 0 } });
    const { ctx, notifications } = buildMockCtx();

    await runSetupWizard(pi, ctx, { checkCliInstalled: () => true });

    expect(notifications[0].message).toContain('Detected:');
  });
});
