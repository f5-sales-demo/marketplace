import { detectPlatform, type PlatformInfo } from './platform';

export function buildInstallStep(platform: PlatformInfo): Array<{ label: string; command: string[]; manager: string }> {
  const options: Array<{ label: string; command: string[]; manager: string }> = [];

  if (platform.os === 'darwin' && platform.packageManagers.includes('brew')) {
    options.push({
      label: 'Homebrew cask (recommended)',
      command: ['brew', 'install', '--cask', 'google-cloud-sdk'],
      manager: 'brew',
    });
  }
  if (platform.os === 'win32' && platform.packageManagers.includes('winget')) {
    options.push({
      label: 'winget (recommended)',
      command: ['winget', 'install', 'Google.CloudSDK'],
      manager: 'winget',
    });
  }
  if (platform.os === 'linux' && platform.packageManagers.includes('apt')) {
    options.push({
      label: 'apt',
      command: ['sudo', 'apt', 'install', '-y', 'google-cloud-sdk'],
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

  const hasServiceAccount = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
  options.push({
    label: `Service account key${hasServiceAccount ? ' (detected)' : ''}`,
    key: 'service_account',
    available: hasServiceAccount,
  });

  return options;
}

export function buildVerifyCommand(): string[] {
  return ['gcloud', 'auth', 'print-access-token', '--quiet'];
}

export function gcloudIsInstalled(): boolean {
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    return Bun.spawnSync([checker, 'gcloud']).exitCode === 0;
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
  const checkCli = options?.checkCliInstalled ?? gcloudIsInstalled;

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
      ctx.ui.notify('No package manager found. Install manually: https://cloud.google.com/sdk/docs/install', 'error');
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
              ctx.ui.notify('Alternative install also failed. Run /gcloud:setup to try again.', 'error');
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
      ctx.ui.notify('gcloud CLI not found after install. You may need to restart your terminal.', 'error');
      return;
    }

    const ver = await pi.exec('gcloud', ['--version']);
    ctx.ui.notify(`Google Cloud SDK installed: ${ver.stdout.split('\n')[0].trim()}`, 'info');
    ctx.ui.notify('Restart xcsh to activate Google Cloud tools.', 'info');
  } else {
    const ver = await pi.exec('gcloud', ['--version']);
    ctx.ui.notify(`Google Cloud SDK: ${ver.stdout.split('\n')[0].trim()}`, 'info');
  }

  // --- Auth (auto-detect best method, only prompt on ambiguity) ---
  const authOptions = buildAuthStep();
  const envDetected = authOptions.filter((o) => o.available && o.key !== 'web');

  if (envDetected.length > 0) {
    // Service account key detected — activate it
    const best = envDetected[0];
    ctx.ui.notify(`Using ${best.label} (credentials detected in environment)`, 'info');
    const authCmd = buildAuthCommand(best.key);
    const authResult = await pi.exec(authCmd[0], authCmd.slice(1));
    if (authResult.code !== 0) {
      ctx.ui.notify(`Authentication failed: ${authResult.stderr || authResult.stdout}`, 'error');
      return;
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
    ctx.ui.notify('Google Cloud ready! Authentication verified.', 'info');
  } else {
    ctx.ui.notify('Authentication may have succeeded. Run /gcloud:setup to verify.', 'warning');
  }
}

function buildAuthCommand(key: string): string[] {
  switch (key) {
    case 'web':
      return ['gcloud', 'auth', 'login'];
    case 'service_account':
      return [
        'gcloud',
        'auth',
        'activate-service-account',
        '--key-file',
        process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
      ];
    default:
      return ['gcloud', 'auth', 'login'];
  }
}
