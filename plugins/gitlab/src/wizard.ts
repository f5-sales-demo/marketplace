import { detectPlatform, getInstallOptions, type PlatformInfo } from './platform';

export function buildInstallStep(platform: PlatformInfo) {
  return getInstallOptions(platform);
}

export function buildVerifyCommand(): string[] {
  return ['glab', 'auth', 'status'];
}

export function glabIsInstalled(): boolean {
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    return Bun.spawnSync([checker, 'glab']).exitCode === 0;
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
  options?: { checkGlabInstalled?: () => boolean },
): Promise<void> {
  const checkGlab = options?.checkGlabInstalled ?? glabIsInstalled;

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
  if (!checkGlab()) {
    const installOptions = buildInstallStep(platform);
    if (installOptions.length === 0) {
      ctx.ui.notify(
        'No package manager found. Install manually: https://gitlab.com/gitlab-org/cli#installation',
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
              ctx.ui.notify('Alternative install also failed. Run /gitlab:setup to try again.', 'error');
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

    if (!checkGlab()) {
      ctx.ui.notify('glab CLI not found after install. You may need to restart your terminal.', 'error');
      return;
    }

    const ver = await pi.exec('glab', ['--version']);
    ctx.ui.notify(`GitLab CLI installed: ${ver.stdout.trim()}`, 'info');
    ctx.ui.notify(
      'Restart xcsh to activate GitLab tools (glab_setup, glab_issue_list, glab_issue_view, glab_search).',
      'info',
    );
  } else {
    const ver = await pi.exec('glab', ['--version']);
    ctx.ui.notify(`GitLab CLI: ${ver.stdout.trim()}`, 'info');
  }

  // --- Auth (delegate to glab auth login — it has its own interactive wizard) ---
  ctx.ui.notify('Running glab auth login...', 'info');
  const authResult = await pi.exec('glab', ['auth', 'login']);
  if (authResult.code !== 0) {
    ctx.ui.notify(`Authentication failed: ${authResult.stderr || authResult.stdout}`, 'error');
    return;
  }

  // --- Verify (deterministic) ---
  const verifyCmd = buildVerifyCommand();
  const verifyResult = await pi.exec(verifyCmd[0], verifyCmd.slice(1));
  if (verifyResult.code === 0) {
    const output = verifyResult.stdout || verifyResult.stderr || '';
    const userMatch = output.match(/Logged in to ([\w.-]+) as (\S+)/);
    if (userMatch) {
      ctx.ui.notify(`GitLab ready! Logged in to ${userMatch[1]} as ${userMatch[2]}`, 'info');
    } else {
      ctx.ui.notify('GitLab authenticated successfully.', 'info');
    }
  } else {
    ctx.ui.notify('Authentication may have succeeded. Run /gitlab:setup to verify.', 'warning');
  }
}
