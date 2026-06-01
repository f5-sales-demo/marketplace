import { detectPlatform, getAuthOptions, getInstallOptions, type PlatformInfo } from './platform';

export function buildInstallStep(platform: PlatformInfo) {
  return getInstallOptions(platform);
}

export function buildAuthStep() {
  return getAuthOptions();
}

export function buildVerifyCommand(alias: string): string[] {
  return ['sf', 'org', 'display', '--target-org', alias, '--json'];
}

function sfIsInstalled(): boolean {
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    return Bun.spawnSync([checker, 'sf']).exitCode === 0;
  } catch {
    return false;
  }
}

export async function runSetupWizard(
  pi: {
    exec: (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string; code: number }>;
  },
  ctx: {
    ui: {
      select: (title: string, options: string[]) => Promise<string | undefined>;
      confirm: (title: string, message: string) => Promise<boolean>;
      notify: (message: string, type?: 'info' | 'warning' | 'error') => void;
    };
    cwd: string;
    reload?: () => Promise<void>;
  },
): Promise<void> {
  ctx.ui.notify('Salesforce Setup Wizard starting...', 'info');

  // Step 1: Platform detection
  const platform = await detectPlatform();
  const osLabel = platform.os === 'darwin' ? 'macOS' : platform.os === 'win32' ? 'Windows' : 'Linux';
  ctx.ui.notify(`Detected: ${osLabel} (${platform.arch})`, 'info');

  if (platform.isCorporateManaged) {
    ctx.ui.notify(
      `Corporate-managed device detected${platform.mdmVendor ? ` (${platform.mdmVendor})` : ''}. Automatic installation may be restricted.`,
      'warning',
    );
  }

  // Step 2: CLI install (if needed)
  if (!sfIsInstalled()) {
    const installOptions = buildInstallStep(platform);
    if (installOptions.length === 0) {
      ctx.ui.notify(
        'No package manager found. Install Salesforce CLI manually: https://developer.salesforce.com/tools/salesforcecli',
        'error',
      );
      return;
    }

    const labels = installOptions.map((o) => o.label);
    labels.push('Skip installation');

    const choice = await ctx.ui.select('Install Salesforce CLI', labels);
    if (!choice || choice === 'Skip installation') {
      ctx.ui.notify('Setup cancelled. Run /salesforce:setup when ready.', 'info');
      return;
    }

    const selected = installOptions.find((o) => o.label === choice);
    if (!selected) return;

    const proceed = await ctx.ui.confirm('Install Salesforce CLI', `Run: ${selected.command.join(' ')}`);
    if (!proceed) return;

    ctx.ui.notify(`Installing via ${selected.manager}...`, 'info');
    const result = await pi.exec(selected.command[0], selected.command.slice(1));
    if (result.code !== 0) {
      ctx.ui.notify(`Installation failed (exit ${result.code}). ${result.stderr || 'Check output above.'}`, 'error');
      if (platform.isCorporateManaged) {
        ctx.ui.notify('This may be due to corporate restrictions. Try npm install or contact IT.', 'warning');
      }
      return;
    }

    // Verify install
    if (!sfIsInstalled()) {
      ctx.ui.notify('sf CLI not found after install. You may need to restart your terminal.', 'error');
      return;
    }
    const versionResult = await pi.exec('sf', ['--version']);
    ctx.ui.notify(`Salesforce CLI installed: ${versionResult.stdout.trim()}`, 'info');
    // Reload extensions so tools get registered
    if (ctx.reload) {
      await ctx.reload();
    }
  } else {
    const versionResult = await pi.exec('sf', ['--version']);
    ctx.ui.notify(`Salesforce CLI already installed: ${versionResult.stdout.trim()}`, 'info');
  }

  // Step 3: Authentication
  const authOptions = buildAuthStep();
  const availableLabels = authOptions.filter((o) => o.available || o.key === 'web').map((o) => o.label);
  availableLabels.push('Skip authentication');

  const authChoice = await ctx.ui.select('Authenticate to Salesforce', availableLabels);
  if (!authChoice || authChoice === 'Skip authentication') {
    ctx.ui.notify('CLI installed. Run /salesforce:setup again to authenticate.', 'info');
    return;
  }

  const selectedAuth = authOptions.find((o) => o.label === authChoice);
  if (!selectedAuth) return;

  // Step 4: Execute authentication
  const alias = 'SFDC';

  if (selectedAuth.key === 'sfdx_url') {
    const { mkdtempSync, openSync, writeSync, closeSync, unlinkSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const sfdxUrl = process.env.SFDX_AUTH_URL || '';
    const tmpDir = mkdtempSync(join(tmpdir(), 'xcsh-sf-'));
    const tmpFile = join(tmpDir, 'sfdx-auth.txt');
    const fd = openSync(tmpFile, 'w', 0o600);
    writeSync(fd, sfdxUrl);
    closeSync(fd);
    try {
      ctx.ui.notify('Authenticating...', 'info');
      const sfdxResult = await pi.exec('sf', [
        'org',
        'login',
        'sfdx-url',
        '--sfdx-url-file',
        tmpFile,
        '--set-default',
        '--alias',
        alias,
      ]);
      if (sfdxResult.code !== 0) {
        ctx.ui.notify(`Authentication failed: ${sfdxResult.stderr || sfdxResult.stdout}`, 'error');
        return;
      }
    } finally {
      unlinkSync(tmpFile);
      rmSync(tmpDir, { recursive: true });
    }
  } else {
    let authCmd: string[];
    switch (selectedAuth.key) {
      case 'web':
        authCmd = ['sf', 'org', 'login', 'web', '--set-default', '--alias', alias];
        break;
      case 'access_token':
        authCmd = [
          'sf',
          'org',
          'login',
          'access-token',
          '--instance-url',
          process.env.SF_ORG_INSTANCE_URL || '',
          '--set-default',
          '--alias',
          alias,
        ];
        break;
      case 'jwt':
        authCmd = [
          'sf',
          'org',
          'login',
          'jwt',
          '--client-id',
          process.env.SF_CLIENT_ID || '',
          '--jwt-key-file',
          process.env.SF_JWT_KEY_FILE || '',
          '--username',
          process.env.SF_USERNAME || '',
          '--set-default',
          '--alias',
          alias,
        ];
        break;
      default:
        return;
    }
    ctx.ui.notify('Authenticating...', 'info');
    const authResult = await pi.exec(authCmd[0], authCmd.slice(1));
    if (authResult.code !== 0) {
      ctx.ui.notify(`Authentication failed: ${authResult.stderr || authResult.stdout}`, 'error');
      return;
    }
  }

  // Step 5: Verify
  const verifyCmd = buildVerifyCommand(alias);
  const verifyResult = await pi.exec(verifyCmd[0], verifyCmd.slice(1));
  if (verifyResult.code === 0) {
    try {
      const data = JSON.parse(verifyResult.stdout);
      const org = data.result || {};
      ctx.ui.notify(
        `Salesforce ready! Connected as ${org.username || 'unknown'} to ${org.instanceUrl || 'unknown'}`,
        'info',
      );
    } catch {
      ctx.ui.notify('Salesforce authenticated. Run /salesforce:setup to confirm.', 'info');
    }
  } else {
    ctx.ui.notify('Authentication may have succeeded. Run /salesforce:setup to verify.', 'warning');
  }
}
