import { detectPlatform, type PlatformInfo } from './platform';

export function buildInstallStep(platform: PlatformInfo): Array<{ label: string; command: string[]; manager: string }> {
  const options: Array<{ label: string; command: string[]; manager: string }> = [];

  if (platform.os === 'darwin' && platform.packageManagers.includes('brew')) {
    options.push({
      label: 'Homebrew (recommended)',
      command: ['brew', 'install', 'awscli'],
      manager: 'brew',
    });
  }
  if (platform.os === 'win32' && platform.packageManagers.includes('winget')) {
    options.push({
      label: 'winget (recommended)',
      command: ['winget', 'install', 'Amazon.AWSCLI'],
      manager: 'winget',
    });
  }
  if (platform.os === 'linux' && platform.packageManagers.includes('apt')) {
    options.push({
      label: 'apt',
      command: ['sudo', 'apt', 'install', '-y', 'awscli'],
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
    label: 'SSO login (recommended)',
    key: 'sso',
    available: true,
  });

  options.push({
    label: 'Access keys (aws configure)',
    key: 'access_keys',
    available: true,
  });

  const hasEnvKeys = !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY;
  options.push({
    label: `Environment credentials${hasEnvKeys ? ' (detected)' : ''}`,
    key: 'env',
    available: hasEnvKeys,
  });

  return options;
}

export function buildVerifyCommand(): string[] {
  return ['aws', 'sts', 'get-caller-identity', '--output', 'json'];
}

export function awsIsInstalled(): boolean {
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    return Bun.spawnSync([checker, 'aws']).exitCode === 0;
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
  const checkCli = options?.checkCliInstalled ?? awsIsInstalled;

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
        'No package manager found. Install manually: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html',
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
              ctx.ui.notify('Alternative install also failed. Run /aws:setup to try again.', 'error');
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
      ctx.ui.notify('aws CLI not found after install. You may need to restart your terminal.', 'error');
      return;
    }

    const ver = await pi.exec('aws', ['--version']);
    ctx.ui.notify(`AWS CLI installed: ${ver.stdout.trim()}`, 'info');
    ctx.ui.notify('Restart xcsh to activate AWS tools.', 'info');
  } else {
    const ver = await pi.exec('aws', ['--version']);
    ctx.ui.notify(`AWS CLI: ${ver.stdout.trim()}`, 'info');
  }

  // --- Auth (auto-detect best method, only prompt on ambiguity) ---
  const authOptions = buildAuthStep();
  const envDetected = authOptions.filter((o) => o.available && o.key !== 'sso' && o.key !== 'access_keys');

  if (envDetected.length > 0) {
    // Environment credentials detected — verify directly, no login command needed
    ctx.ui.notify(`Using ${envDetected[0].label} (credentials detected in environment)`, 'info');
  } else {
    // No env credentials — default to SSO login
    ctx.ui.notify('Starting SSO authentication...', 'info');
    const authCmd = buildAuthCommand('sso');
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
      ctx.ui.notify(`AWS ready! Connected as ${data.Arn || 'unknown'} (account ${data.Account || 'unknown'})`, 'info');
    } catch {
      ctx.ui.notify('AWS authenticated. Run /aws:setup to confirm.', 'info');
    }
  } else {
    ctx.ui.notify('Authentication may have succeeded. Run /aws:setup to verify.', 'warning');
  }
}

function buildAuthCommand(key: string): string[] {
  switch (key) {
    case 'sso':
      return ['aws', 'configure', 'sso'];
    case 'access_keys':
      return ['aws', 'configure'];
    default:
      return ['aws', 'configure', 'sso'];
  }
}
