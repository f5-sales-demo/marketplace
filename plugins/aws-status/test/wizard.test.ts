import { describe, expect, it } from 'bun:test';
import type { PlatformInfo } from '../src/platform';
import { buildAuthStep, buildInstallStep, buildVerifyCommand, runSetupWizard } from '../src/wizard';

// ---------------------------------------------------------------------------
// Helper builders — exact command assertions
// ---------------------------------------------------------------------------

describe('buildInstallStep', () => {
  it('macOS brew command is exactly brew install awscli', () => {
    const platform: PlatformInfo = {
      os: 'darwin',
      arch: 'arm64',
      packageManagers: ['brew', 'npm'],
      isCorporateManaged: false,
    };
    const options = buildInstallStep(platform);
    const brew = options.find((o) => o.manager === 'brew');
    expect(brew).toBeDefined();
    expect(brew?.command).toEqual(['brew', 'install', 'awscli']);
  });

  it('winget command is winget install Amazon.AWSCLI', () => {
    const platform: PlatformInfo = {
      os: 'win32',
      arch: 'x64',
      packageManagers: ['winget', 'npm'],
      isCorporateManaged: false,
    };
    const winget = buildInstallStep(platform).find((o) => o.manager === 'winget');
    expect(winget?.command).toEqual(['winget', 'install', 'Amazon.AWSCLI']);
  });

  it('apt command is sudo apt install -y awscli', () => {
    const platform: PlatformInfo = {
      os: 'linux',
      arch: 'x64',
      packageManagers: ['apt', 'npm'],
      isCorporateManaged: false,
    };
    const apt = buildInstallStep(platform).find((o) => o.manager === 'apt');
    expect(apt?.command).toEqual(['sudo', 'apt', 'install', '-y', 'awscli']);
  });

  it('returns empty when no package managers available', () => {
    const platform: PlatformInfo = { os: 'linux', arch: 'x64', packageManagers: [], isCorporateManaged: false };
    expect(buildInstallStep(platform)).toHaveLength(0);
  });
});

describe('buildAuthStep', () => {
  it('always includes SSO option first', () => {
    const options = buildAuthStep();
    expect(options[0].key).toBe('sso');
    expect(options[0].available).toBe(true);
  });

  it('includes all 3 auth methods', () => {
    expect(buildAuthStep().map((o) => o.key)).toEqual(['sso', 'access_keys', 'env']);
  });
});

describe('buildVerifyCommand', () => {
  it('returns exact aws sts get-caller-identity command', () => {
    expect(buildVerifyCommand()).toEqual(['aws', 'sts', 'get-caller-identity', '--output', 'json']);
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
// runSetupWizard — aws already installed, SSO auth (deterministic flow)
// ---------------------------------------------------------------------------

describe('runSetupWizard — aws installed, SSO auth', () => {
  const awsInstalled = { checkCliInstalled: () => true };

  it('reports version then proceeds to auth', async () => {
    const { pi } = buildMockPi({
      '--version': { stdout: 'aws-cli/2.15.0 Python/3.11.0', stderr: '', code: 0 },
      'get-caller-identity': {
        stdout: JSON.stringify({ Account: '123456789012', Arn: 'arn:aws:iam::123456789012:user/test' }),
        stderr: '',
        code: 0,
      },
    });
    const { ctx, notifications } = buildMockCtx();

    await runSetupWizard(pi, ctx, awsInstalled);

    expect(notifications.find((n) => n.message.includes('2.15.0'))).toBeDefined();
    expect(notifications.find((n) => n.message.includes('AWS ready'))).toBeDefined();
  });

  it('handles auth failure', async () => {
    const { pi } = buildMockPi({
      '--version': { stdout: 'aws-cli/2.15.0', stderr: '', code: 0 },
      'configure sso': { stdout: '', stderr: 'TIMEOUT', code: 1 },
    });
    const { ctx, notifications } = buildMockCtx();

    await runSetupWizard(pi, ctx, awsInstalled);

    expect(notifications.find((n) => n.message.includes('Authentication failed'))?.type).toBe('error');
  });

  it('handles verify failure with warning', async () => {
    const { pi } = buildMockPi({
      '--version': { stdout: 'aws-cli/2.15.0', stderr: '', code: 0 },
      'get-caller-identity': { stdout: '', stderr: 'error', code: 1 },
    });
    const { ctx, notifications } = buildMockCtx();

    await runSetupWizard(pi, ctx, awsInstalled);

    expect(notifications.find((n) => n.message.includes('may have succeeded'))?.type).toBe('warning');
  });
});

// ---------------------------------------------------------------------------
// runSetupWizard — aws NOT installed (auto-install flow)
// ---------------------------------------------------------------------------

describe('runSetupWizard — aws not installed', () => {
  let installCount = 0;
  const awsNotInstalledThenInstalled = {
    checkCliInstalled: () => {
      installCount++;
      return installCount > 1;
    },
  };

  it('auto-installs via preferred package manager and notifies restart', async () => {
    installCount = 0;
    const { pi, calls } = buildMockPi({
      'brew install awscli': { stdout: 'installed', stderr: '', code: 0 },
      '--version': { stdout: 'aws-cli/2.15.0 Python/3.11.0', stderr: '', code: 0 },
      'get-caller-identity': {
        stdout: JSON.stringify({ Account: '123456789012', Arn: 'arn:aws:iam::123456789012:user/test' }),
        stderr: '',
        code: 0,
      },
    });
    const { ctx, notifications } = buildMockCtx();

    await runSetupWizard(pi, ctx, awsNotInstalledThenInstalled);

    const installCall = calls.find((c) => c.cmd === 'brew' && c.args.includes('awscli'));
    expect(installCall).toBeDefined();
    expect(installCall?.args).toEqual(['install', 'awscli']);
    expect(notifications.find((n) => n.message.includes('installed'))?.message).toContain('2.15.0');
    expect(notifications.find((n) => n.message.includes('Restart xcsh'))).toBeDefined();
  });

  it('install failure shows error', async () => {
    const { pi } = buildMockPi({
      'brew install awscli': { stdout: '', stderr: 'permission denied', code: 1 },
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
    const { pi } = buildMockPi({ '--version': { stdout: 'aws-cli/2.15.0', stderr: '', code: 0 } });
    const { ctx, notifications } = buildMockCtx();

    await runSetupWizard(pi, ctx, { checkCliInstalled: () => true });

    expect(notifications[0].message).toContain('Detected:');
  });
});
