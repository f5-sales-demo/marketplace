import { detectPlatform, type PlatformInfo } from './platform';

export function buildInstallStep(platform: PlatformInfo): Array<{ label: string; command: string[]; manager: string }> {
  const options: Array<{ label: string; command: string[]; manager: string }> = [];

  if (platform.os === 'darwin' && platform.packageManagers.includes('brew')) {
    options.push({
      label: 'Homebrew (recommended)',
      command: ['brew', 'install', 'azure-cli'],
      manager: 'brew',
    });
  }
  if (platform.os === 'win32' && platform.packageManagers.includes('winget')) {
    options.push({
      label: 'winget (recommended)',
      command: ['winget', 'install', 'Microsoft.AzureCLI'],
      manager: 'winget',
    });
  }
  if (platform.os === 'linux' && platform.packageManagers.includes('apt')) {
    options.push({
      label: 'apt',
      command: ['sudo', 'apt', 'install', '-y', 'azure-cli'],
      manager: 'apt',
    });
  }

  return options;
}

export function buildAuthStep(): Array<{
  label: string;
  key: string;
  available: boolean;
}> {
  const options: Array<{ label: string; key: string; available: boolean }> = [];

  options.push({
    label: 'Web browser (recommended)',
    key: 'web',
    available: true,
  });

  options.push({
    label: 'Device code (headless / remote)',
    key: 'device_code',
    available: true,
  });

  const hasServicePrincipal =
    !!process.env.AZURE_CLIENT_ID && !!process.env.AZURE_CLIENT_SECRET && !!process.env.AZURE_TENANT_ID;
  options.push({
    label: `Service Principal${hasServicePrincipal ? ' (detected)' : ''}`,
    key: 'service_principal',
    available: hasServicePrincipal,
  });

  return options;
}

export function buildVerifyCommand(): string[] {
  return ['az', 'account', 'show', '--output', 'json'];
}

export function azIsInstalled(): boolean {
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    return Bun.spawnSync([checker, 'az']).exitCode === 0;
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
      input: (title: string, placeholder?: string) => Promise<string | undefined>;
      notify: (message: string, type?: 'info' | 'warning' | 'error') => void;
    };
    cwd: string;
    reload?: () => Promise<void>;
  },
  options?: { checkCliInstalled?: () => boolean },
): Promise<void> {
  const checkCli = options?.checkCliInstalled ?? azIsInstalled;

  // --- Platform detection (deterministic, no prompts) ---
  const platform = await detectPlatform();
  const osLabel = platform.os === 'darwin' ? 'macOS' : platform.os === 'win32' ? 'Windows' : 'Linux';
  ctx.ui.notify(`Detected: ${osLabel} (${platform.arch})`, 'info');

  if (platform.isCorporateManaged) {
    ctx.ui.notify(
      `Corporate-managed device detected${platform.mdmVendor ? ` (${platform.mdmVendor})` : ''}. Automatic installation may be restricted.`,
      'warning',
    );
  }

  // --- CLI install (auto-select best option, only prompt on ambiguity) ---
  if (!checkCli()) {
    const installOptions = buildInstallStep(platform);
    if (installOptions.length === 0) {
      ctx.ui.notify(
        'No package manager found. Install manually: https://learn.microsoft.com/cli/azure/install-azure-cli',
        'error',
      );
      return;
    }

    // Auto-select the first (preferred) option — only prompt if user needs to override
    const preferred = installOptions[0];
    ctx.ui.notify(`Installing via ${preferred.manager}: ${preferred.command.join(' ')}`, 'info');
    const result = await pi.exec(preferred.command[0], preferred.command.slice(1));

    if (result.code !== 0) {
      ctx.ui.notify(`Installation failed (exit ${result.code}).`, 'error');
      if (platform.isCorporateManaged) {
        ctx.ui.notify('Corporate restrictions may apply. Contact IT for assistance.', 'warning');
      }
      // Offer fallback options if the preferred one failed
      if (installOptions.length > 1) {
        const fallbackLabels = installOptions.slice(1).map((o) => o.label);
        fallbackLabels.push('Skip');
        const fallback = await ctx.ui.select('Try an alternative installer?', fallbackLabels);
        if (fallback && fallback !== 'Skip') {
          const alt = installOptions.find((o) => o.label === fallback);
          if (alt) {
            ctx.ui.notify(`Installing via ${alt.manager}...`, 'info');
            const altResult = await pi.exec(alt.command[0], alt.command.slice(1));
            if (altResult.code !== 0) {
              ctx.ui.notify('Alternative install also failed. Run /azure-status:setup to try again.', 'error');
              return;
            }
          }
        } else {
          return;
        }
      } else {
        return;
      }
    }

    if (!checkCli()) {
      ctx.ui.notify('az CLI not found after install. You may need to restart your terminal.', 'error');
      return;
    }

    const ver = await pi.exec('az', ['--version']);
    ctx.ui.notify(`Azure CLI installed: ${ver.stdout.split('\n')[0].trim()}`, 'info');
    ctx.ui.notify('Restart xcsh to activate Azure tools.', 'info');
  } else {
    const ver = await pi.exec('az', ['--version']);
    ctx.ui.notify(`Azure CLI: ${ver.stdout.split('\n')[0].trim()}`, 'info');
  }

  // --- Auth (auto-detect best method, only prompt on ambiguity) ---
  const authOptions = buildAuthStep();
  const envDetected = authOptions.filter((o) => o.available && o.key !== 'web' && o.key !== 'device_code');

  if (envDetected.length > 0 && envDetected[0].key === 'service_principal') {
    ctx.ui.notify('Using service principal (credentials detected in environment)', 'info');
    const { mkdtempSync, openSync, writeSync, closeSync, unlinkSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const secret = process.env.AZURE_CLIENT_SECRET || '';
    const tmpDir = mkdtempSync(join(tmpdir(), 'xcsh-az-'));
    const tmpFile = join(tmpDir, 'sp-secret.txt');
    const fd = openSync(tmpFile, 'w', 0o600);
    writeSync(fd, secret);
    closeSync(fd);
    try {
      const authResult = await pi.exec('az', [
        'login',
        '--service-principal',
        '--username',
        process.env.AZURE_CLIENT_ID || '',
        '--password',
        `@${tmpFile}`,
        '--tenant',
        process.env.AZURE_TENANT_ID || '',
      ]);
      if (authResult.code !== 0) {
        ctx.ui.notify(`Authentication failed: ${authResult.stderr || authResult.stdout}`, 'error');
        return;
      }
    } finally {
      unlinkSync(tmpFile);
      rmSync(tmpDir, { recursive: true });
    }
  } else {
    // No env credentials — default to browser login
    ctx.ui.notify('Opening browser for authentication...', 'info');
    const authCmd = buildAuthCommand('web');
    const authResult = await pi.exec(authCmd[0], authCmd.slice(1));
    if (authResult.code !== 0) {
      ctx.ui.notify(`Authentication failed: ${authResult.stderr || authResult.stdout}`, 'error');
      return;
    }
  }

  // --- Verify (deterministic) ---
  const verifyCmd = buildVerifyCommand();
  const verifyResult = await pi.exec(verifyCmd[0], verifyCmd.slice(1));
  if (verifyResult.code === 0) {
    try {
      const data = JSON.parse(verifyResult.stdout);
      ctx.ui.notify(
        `Azure ready! Connected as ${data.user?.name || 'unknown'} to subscription ${data.name || 'unknown'}`,
        'info',
      );
    } catch {
      ctx.ui.notify('Azure authenticated. Run /azure-status:setup to confirm.', 'info');
    }
  } else {
    ctx.ui.notify('Authentication may have succeeded. Run /azure-status:setup to verify.', 'warning');
  }
}

function buildAuthCommand(key: string): string[] {
  switch (key) {
    case 'web':
      return ['az', 'login'];
    case 'device_code':
      return ['az', 'login', '--use-device-code'];
    case 'service_principal':
      return ['az', 'login', '--service-principal'];
    default:
      return ['az', 'login'];
  }
}
