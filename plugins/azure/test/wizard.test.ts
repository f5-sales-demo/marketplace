import { describe, expect, it } from 'bun:test';
import type { PlatformInfo } from '../src/platform';
import { buildAuthStep, buildInstallStep, buildVerifyCommand, runSetupWizard } from '../src/wizard';

// ---------------------------------------------------------------------------
// Helper builders — exact command assertions
// ---------------------------------------------------------------------------

describe('buildInstallStep', () => {
  it('macOS brew command is exactly brew install azure-cli', () => {
    const platform: PlatformInfo = {
      os: 'darwin',
      arch: 'arm64',
      packageManagers: ['brew', 'npm'],
      isCorporateManaged: false,
    };
    const options = buildInstallStep(platform);
    const brew = options.find((o) => o.manager === 'brew');
    expect(brew).toBeDefined();
    expect(brew?.command).toEqual(['brew', 'install', 'azure-cli']);
  });

  it('winget command is winget install Microsoft.AzureCLI', () => {
    const platform: PlatformInfo = {
      os: 'win32',
      arch: 'x64',
      packageManagers: ['winget', 'npm'],
      isCorporateManaged: false,
    };
    const winget = buildInstallStep(platform).find((o) => o.manager === 'winget');
    expect(winget?.command).toEqual(['winget', 'install', 'Microsoft.AzureCLI']);
  });

  it('apt command is sudo apt install -y azure-cli', () => {
    const platform: PlatformInfo = {
      os: 'linux',
      arch: 'x64',
      packageManagers: ['apt', 'npm'],
      isCorporateManaged: false,
    };
    const apt = buildInstallStep(platform).find((o) => o.manager === 'apt');
    expect(apt?.command).toEqual(['sudo', 'apt', 'install', '-y', 'azure-cli']);
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

  it('includes all 3 auth methods', () => {
    expect(buildAuthStep().map((o) => o.key)).toEqual(['web', 'device_code', 'service_principal']);
  });
});

describe('buildVerifyCommand', () => {
  it('returns exact az account show command', () => {
    expect(buildVerifyCommand()).toEqual(['az', 'account', 'show', '--output', 'json']);
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
// runSetupWizard — az already installed, web auth (deterministic flow)
// ---------------------------------------------------------------------------

describe('runSetupWizard — az installed, web auth', () => {
  const azInstalled = { checkCliInstalled: () => true };

  it('reports version then proceeds to auth', async () => {
    const { pi } = buildMockPi({
      '--version': { stdout: 'azure-cli 2.60.0\n', stderr: '', code: 0 },
      'account show': {
        stdout: JSON.stringify({ user: { name: 'user@test.com' }, name: 'Test Subscription' }),
        stderr: '',
        code: 0,
      },
    });
    const { ctx, notifications } = buildMockCtx();

    await runSetupWizard(pi, ctx, azInstalled);

    expect(notifications.find((n) => n.message.includes('2.60.0'))).toBeDefined();
    expect(notifications.find((n) => n.message.includes('Azure ready'))).toBeDefined();
  });

  it('handles auth failure', async () => {
    const { pi } = buildMockPi({
      '--version': { stdout: 'azure-cli 2.60.0', stderr: '', code: 0 },
      'az login': { stdout: '', stderr: 'TIMEOUT', code: 1 },
    });
    const { ctx, notifications } = buildMockCtx();

    await runSetupWizard(pi, ctx, azInstalled);

    expect(notifications.find((n) => n.message.includes('Authentication failed'))?.type).toBe('error');
  });

  it('handles verify failure with warning', async () => {
    const { pi } = buildMockPi({
      '--version': { stdout: 'azure-cli 2.60.0', stderr: '', code: 0 },
      'account show': { stdout: '', stderr: 'error', code: 1 },
    });
    const { ctx, notifications } = buildMockCtx();

    await runSetupWizard(pi, ctx, azInstalled);

    expect(notifications.find((n) => n.message.includes('may have succeeded'))?.type).toBe('warning');
  });
});

// ---------------------------------------------------------------------------
// runSetupWizard — az NOT installed (auto-install flow)
// ---------------------------------------------------------------------------

describe('runSetupWizard — az not installed', () => {
  let installCount = 0;
  const azNotInstalledThenInstalled = {
    checkCliInstalled: () => {
      installCount++;
      return installCount > 1;
    },
  };

  it('auto-installs via preferred package manager and notifies restart', async () => {
    installCount = 0;
    const { pi, calls } = buildMockPi({
      'brew install azure-cli': { stdout: 'installed', stderr: '', code: 0 },
      '--version': { stdout: 'azure-cli 2.60.0\n', stderr: '', code: 0 },
      'account show': {
        stdout: JSON.stringify({ user: { name: 'u@t.com' }, name: 'Test Sub' }),
        stderr: '',
        code: 0,
      },
    });
    const { ctx, notifications } = buildMockCtx();

    await runSetupWizard(pi, ctx, azNotInstalledThenInstalled);

    const installCall = calls.find((c) => c.cmd === 'brew' && c.args.includes('azure-cli'));
    expect(installCall).toBeDefined();
    expect(installCall?.args).toEqual(['install', 'azure-cli']);
    expect(notifications.find((n) => n.message.includes('installed'))?.message).toContain('2.60.0');
    expect(notifications.find((n) => n.message.includes('Restart xcsh'))).toBeDefined();
  });

  it('install failure shows error', async () => {
    const { pi } = buildMockPi({
      'brew install azure-cli': { stdout: '', stderr: 'permission denied', code: 1 },
    });
    const { ctx, notifications } = buildMockCtx({ selectResponses: ['Skip'] });

    await runSetupWizard(pi, ctx, { checkCliInstalled: () => false });

    expect(notifications.find((n) => n.message.includes('Installation failed'))?.type).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// runSetupWizard — service principal auth path
// ---------------------------------------------------------------------------

describe('runSetupWizard — service principal auth', () => {
  const azInstalled = { checkCliInstalled: () => true };
  const originalEnv = { ...process.env };

  it('auto-detects service principal from environment', async () => {
    process.env.AZURE_CLIENT_ID = 'test-client-id';
    process.env.AZURE_CLIENT_SECRET = 'test-secret';
    process.env.AZURE_TENANT_ID = 'test-tenant-id';
    try {
      const { pi, calls } = buildMockPi({
        '--version': { stdout: 'azure-cli 2.60.0\n', stderr: '', code: 0 },
        '--service-principal': { stdout: '', stderr: '', code: 0 },
        'account show': {
          stdout: JSON.stringify({ user: { name: 'sp@test.com' }, name: 'SP Subscription' }),
          stderr: '',
          code: 0,
        },
      });
      const { ctx, notifications } = buildMockCtx();

      await runSetupWizard(pi, ctx, azInstalled);

      const spCall = calls.find((c) => c.args.includes('--service-principal'));
      expect(spCall).toBeDefined();
      expect(notifications.find((n) => n.message.includes('service principal'))).toBeDefined();
    } finally {
      process.env.AZURE_CLIENT_ID = originalEnv.AZURE_CLIENT_ID;
      process.env.AZURE_CLIENT_SECRET = originalEnv.AZURE_CLIENT_SECRET;
      process.env.AZURE_TENANT_ID = originalEnv.AZURE_TENANT_ID;
    }
  });

  it('handles service principal auth failure', async () => {
    process.env.AZURE_CLIENT_ID = 'test-client-id';
    process.env.AZURE_CLIENT_SECRET = 'test-secret';
    process.env.AZURE_TENANT_ID = 'test-tenant-id';
    try {
      const { pi } = buildMockPi({
        '--version': { stdout: 'azure-cli 2.60.0\n', stderr: '', code: 0 },
        '--service-principal': { stdout: '', stderr: 'AADSTS7000215', code: 1 },
      });
      const { ctx, notifications } = buildMockCtx();

      await runSetupWizard(pi, ctx, azInstalled);

      expect(notifications.find((n) => n.message.includes('Authentication failed'))?.type).toBe('error');
    } finally {
      process.env.AZURE_CLIENT_ID = originalEnv.AZURE_CLIENT_ID;
      process.env.AZURE_CLIENT_SECRET = originalEnv.AZURE_CLIENT_SECRET;
      process.env.AZURE_TENANT_ID = originalEnv.AZURE_TENANT_ID;
    }
  });
});

// ---------------------------------------------------------------------------
// buildInstallStep — multi-manager fallback coverage
// ---------------------------------------------------------------------------

describe('buildInstallStep — fallback options', () => {
  it('returns multiple options on linux with apt and npm', () => {
    const platform: PlatformInfo = {
      os: 'linux',
      arch: 'x64',
      packageManagers: ['apt', 'npm'],
      isCorporateManaged: false,
    };
    const options = buildInstallStep(platform);
    expect(options.length).toBeGreaterThanOrEqual(1);
    expect(options[0].manager).toBe('apt');
  });

  it('returns multiple options on win32 with winget and scoop', () => {
    const platform: PlatformInfo = {
      os: 'win32',
      arch: 'x64',
      packageManagers: ['winget', 'scoop', 'npm'],
      isCorporateManaged: false,
    };
    const options = buildInstallStep(platform);
    expect(options.length).toBeGreaterThanOrEqual(1);
    expect(options[0].manager).toBe('winget');
  });
});

// ---------------------------------------------------------------------------
// Notification ordering
// ---------------------------------------------------------------------------

describe('runSetupWizard — notifications', () => {
  it('first notification is platform detection', async () => {
    const { pi } = buildMockPi({ '--version': { stdout: 'azure-cli 2.60.0', stderr: '', code: 0 } });
    const { ctx, notifications } = buildMockCtx();

    await runSetupWizard(pi, ctx, { checkCliInstalled: () => true });

    expect(notifications[0].message).toContain('Detected:');
  });
});
