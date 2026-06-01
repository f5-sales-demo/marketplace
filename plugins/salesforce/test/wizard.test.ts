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
    const winget = buildInstallStep(platform).find((o) => o.manager === 'winget');
    expect(winget?.command).toEqual(['winget', 'install', 'Salesforce.SalesforceCLI']);
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

  it('includes all 4 auth methods', () => {
    expect(buildAuthStep().map((o) => o.key)).toEqual(['web', 'sfdx_url', 'access_token', 'jwt']);
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
// runSetupWizard — sf already installed, web auth (deterministic flow)
// ---------------------------------------------------------------------------

describe('runSetupWizard — sf installed, web auth', () => {
  const sfInstalled = { checkSfInstalled: () => true };

  it('reports version then proceeds to auth', async () => {
    const { pi } = buildMockPi({
      '--version': { stdout: '@salesforce/cli/2.50.0', stderr: '', code: 0 },
      'org display': {
        stdout: JSON.stringify({ result: { username: 'user@test.com', instanceUrl: 'https://test.sf.com' } }),
        stderr: '',
        code: 0,
      },
    });
    // No discovered URLs, so wizard prompts for login type — pick standard
    const { ctx, notifications } = buildMockCtx({
      selectResponses: ['https://login.salesforce.com (standard)'],
    });

    await runSetupWizard(pi, ctx, sfInstalled);

    expect(notifications.find((n) => n.message.includes('2.50.0'))).toBeDefined();
    expect(notifications.find((n) => n.message.includes('Salesforce ready'))).toBeDefined();
  });

  it('handles auth failure', async () => {
    const { pi } = buildMockPi({
      '--version': { stdout: 'v2', stderr: '', code: 0 },
      'org login web': { stdout: '', stderr: 'TIMEOUT', code: 1 },
    });
    const { ctx, notifications } = buildMockCtx({
      selectResponses: ['https://login.salesforce.com (standard)'],
    });

    await runSetupWizard(pi, ctx, sfInstalled);

    expect(notifications.find((n) => n.message.includes('Authentication failed'))?.type).toBe('error');
  });

  it('handles verify failure with warning', async () => {
    const { pi } = buildMockPi({
      '--version': { stdout: 'v2', stderr: '', code: 0 },
      'org display': { stdout: '', stderr: 'error', code: 1 },
    });
    const { ctx, notifications } = buildMockCtx({
      selectResponses: ['https://login.salesforce.com (standard)'],
    });

    await runSetupWizard(pi, ctx, sfInstalled);

    expect(notifications.find((n) => n.message.includes('may have succeeded'))?.type).toBe('warning');
  });

  it('user cancels login URL selection', async () => {
    const { pi } = buildMockPi({ '--version': { stdout: 'v2', stderr: '', code: 0 } });
    const { ctx } = buildMockCtx({ selectResponses: [undefined] });

    await runSetupWizard(pi, ctx, sfInstalled);
    // Should return without error — just exits silently
  });

  it('custom domain with manual input validates URL', async () => {
    const { pi } = buildMockPi({
      '--version': { stdout: 'v2', stderr: '', code: 0 },
      'org display': {
        stdout: JSON.stringify({
          result: { username: 'admin@acme.com', instanceUrl: 'https://acme.my.salesforce.com' },
        }),
        stderr: '',
        code: 0,
      },
    });
    const { ctx, notifications } = buildMockCtx({
      selectResponses: ['Custom domain (SSO / federated)'],
      inputResponses: ['https://acme.my.salesforce.com'],
    });

    await runSetupWizard(pi, ctx, sfInstalled);

    expect(notifications.find((n) => n.message.includes('Salesforce ready'))).toBeDefined();
  });

  it('isSalesforceUrl rejects non-salesforce domains', async () => {
    // Import the validator directly — wizard uses it to block bad URLs
    const { isSalesforceUrl } = await import('../src/wizard');
    expect(isSalesforceUrl('https://evil.com')).toBe(false);
    expect(isSalesforceUrl('https://evil.com/.salesforce.com')).toBe(false);
    expect(isSalesforceUrl('https://salesforce.com.evil.com')).toBe(false);
    expect(isSalesforceUrl('http://f5.my.salesforce.com')).toBe(false);
    expect(isSalesforceUrl('https://f5.my.salesforce.com')).toBe(true);
    expect(isSalesforceUrl('https://login.salesforce.com')).toBe(true);
    expect(isSalesforceUrl('https://test.salesforce.com')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runSetupWizard — sf NOT installed (auto-install flow)
// ---------------------------------------------------------------------------

describe('runSetupWizard — sf not installed', () => {
  let installCount = 0;
  const sfNotInstalledThenInstalled = {
    checkSfInstalled: () => {
      installCount++;
      return installCount > 1;
    },
  };

  it('auto-installs via preferred package manager and reloads', async () => {
    installCount = 0;
    const { pi, calls } = buildMockPi({
      'brew install sf': { stdout: 'installed', stderr: '', code: 0 },
      '--version': { stdout: '@salesforce/cli/2.50.0', stderr: '', code: 0 },
      'org display': {
        stdout: JSON.stringify({ result: { username: 'u@t.com', instanceUrl: 'https://t.sf.com' } }),
        stderr: '',
        code: 0,
      },
    });
    const { ctx, notifications, wasReloadCalled } = buildMockCtx({
      selectResponses: ['https://login.salesforce.com (standard)'],
    });

    await runSetupWizard(pi, ctx, sfNotInstalledThenInstalled);

    const installCall = calls.find((c) => c.cmd === 'brew' && c.args.includes('sf'));
    expect(installCall).toBeDefined();
    expect(installCall?.args).toEqual(['install', 'sf']);
    expect(notifications.find((n) => n.message.includes('installed'))?.message).toContain('2.50.0');
    expect(wasReloadCalled()).toBe(true);
  });

  it('install failure shows error', async () => {
    const { pi, notifications: n } = buildMockPi({
      'brew install sf': { stdout: '', stderr: 'permission denied', code: 1 },
    });
    const { ctx, notifications } = buildMockCtx({ selectResponses: ['Skip'] });

    await runSetupWizard(pi, ctx, { checkSfInstalled: () => false });

    expect(notifications.find((n) => n.message.includes('Installation failed'))?.type).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// Notification ordering
// ---------------------------------------------------------------------------

describe('runSetupWizard — notifications', () => {
  it('first notification is platform detection', async () => {
    const { pi } = buildMockPi({ '--version': { stdout: 'v2', stderr: '', code: 0 } });
    const { ctx, notifications } = buildMockCtx({ selectResponses: [undefined] });

    await runSetupWizard(pi, ctx, { checkSfInstalled: () => true });

    expect(notifications[0].message).toContain('Detected:');
  });
});
