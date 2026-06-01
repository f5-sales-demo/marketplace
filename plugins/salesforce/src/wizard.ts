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

export function isSalesforceUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
    return parsed.protocol === 'https:' && (hostname === 'salesforce.com' || hostname.endsWith('.salesforce.com'));
  } catch {
    return false;
  }
}

async function discoverInstanceUrls(): Promise<string[]> {
  const urls = new Set<string>();

  // Strategy 1: Cached sfdx auth files
  try {
    const os = await import('node:os');
    const path = await import('node:path');
    const fs = await import('node:fs');
    const sfdxDir = path.join(os.homedir(), '.sfdx');
    if (fs.existsSync(sfdxDir)) {
      for (const file of fs.readdirSync(sfdxDir)) {
        if (!file.endsWith('.json') || file === 'alias.json' || file === 'sfdx-config.json') continue;
        try {
          const data = JSON.parse(fs.readFileSync(path.join(sfdxDir, file), 'utf8'));
          if (data.instanceUrl && isSalesforceUrl(data.instanceUrl)) {
            urls.add(data.instanceUrl);
          }
        } catch {
          // skip
        }
      }
    }
  } catch {
    // not accessible
  }

  // Strategy 2: Derive from email
  if (urls.size === 0) {
    const email = await discoverUserEmail();
    if (email) {
      const domain = email.split('@')[1];
      if (domain) {
        const company = domain.split('.')[0].toLowerCase();
        const candidate = `https://${company}.my.salesforce.com`;
        if (isSalesforceUrl(candidate) && (await probeUrl(candidate))) {
          urls.add(candidate);
        }
      }
    }
  }

  return Array.from(urls);
}

async function discoverUserEmail(): Promise<string | undefined> {
  try {
    const os = await import('node:os');
    const path = await import('node:path');
    const profilePath = path.join(os.homedir(), '.xcsh', 'user-profile.json');
    const data = JSON.parse(await Bun.file(profilePath).text());
    if (data.email?.includes('@')) return data.email;
  } catch {
    // no profile
  }
  try {
    const result = Bun.spawnSync(['git', 'config', 'user.email']);
    if (result.exitCode === 0) {
      const email = new TextDecoder().decode(result.stdout).trim();
      if (email.includes('@')) return email;
    }
  } catch {
    // no git
  }
  return undefined;
}

async function probeUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(5000) });
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  }
}

export function sfIsInstalled(): boolean {
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
      input: (title: string, placeholder?: string) => Promise<string | undefined>;
      notify: (message: string, type?: 'info' | 'warning' | 'error') => void;
    };
    cwd: string;
    reload?: () => Promise<void>;
  },
  options?: { checkSfInstalled?: () => boolean },
): Promise<void> {
  const checkSf = options?.checkSfInstalled ?? sfIsInstalled;

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
  if (!checkSf()) {
    const installOptions = buildInstallStep(platform);
    if (installOptions.length === 0) {
      ctx.ui.notify(
        'No package manager found. Install manually: https://developer.salesforce.com/tools/salesforcecli',
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
        ctx.ui.notify('Corporate restrictions may apply. Try npm install or contact IT.', 'warning');
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
              ctx.ui.notify('Alternative install also failed. Run /salesforce:setup to try again.', 'error');
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

    if (!checkSf()) {
      ctx.ui.notify('sf CLI not found after install. You may need to restart your terminal.', 'error');
      return;
    }

    const ver = await pi.exec('sf', ['--version']);
    ctx.ui.notify(`Salesforce CLI installed: ${ver.stdout.trim()}`, 'info');
    if (ctx.reload) await ctx.reload();
  } else {
    const ver = await pi.exec('sf', ['--version']);
    ctx.ui.notify(`Salesforce CLI: ${ver.stdout.trim()}`, 'info');
  }

  // --- Auth (auto-detect best method, only prompt on ambiguity) ---
  const authOptions = buildAuthStep();
  const envDetected = authOptions.filter((o) => o.available && o.key !== 'web');
  const alias = 'SFDC';

  if (envDetected.length > 0) {
    // Environment credentials detected — use the first one automatically
    const best = envDetected[0];
    ctx.ui.notify(`Using ${best.label} (credentials detected in environment)`, 'info');
    const authCmd = buildAuthCommand(best.key, alias);
    if (best.key === 'sfdx_url') {
      await executeSfdxUrlAuth(pi, ctx, alias);
    } else {
      const authResult = await pi.exec(authCmd[0], authCmd.slice(1));
      if (authResult.code !== 0) {
        ctx.ui.notify(`Authentication failed: ${authResult.stderr || authResult.stdout}`, 'error');
        return;
      }
    }
  } else {
    // No env credentials — use web login with auto-discovered URL
    const discoveredUrls = await discoverInstanceUrls();
    let instanceUrl: string | undefined;

    if (discoveredUrls.length === 1) {
      // One URL discovered — use it automatically
      instanceUrl = discoveredUrls[0];
      ctx.ui.notify(`Using discovered Salesforce instance: ${instanceUrl}`, 'info');
    } else if (discoveredUrls.length > 1) {
      // Multiple discovered — let user pick
      const urlOptions = [...discoveredUrls, 'https://login.salesforce.com (standard)', 'Enter URL manually'];
      const picked = await ctx.ui.select('Salesforce login URL', urlOptions);
      if (!picked) return;
      if (picked === 'Enter URL manually') {
        const manual = await ctx.ui.input('Instance URL', 'https://mycompany.my.salesforce.com');
        if (!manual || !isSalesforceUrl(manual)) {
          ctx.ui.notify('Invalid Salesforce URL. Run /salesforce:setup to try again.', 'error');
          return;
        }
        instanceUrl = manual;
      } else if (picked.includes('login.salesforce.com')) {
        instanceUrl = undefined; // default login
      } else {
        instanceUrl = picked;
      }
    } else {
      // Nothing discovered — prompt for login type
      const loginType = await ctx.ui.select('Salesforce login URL', [
        'https://login.salesforce.com (standard)',
        'https://test.salesforce.com (sandbox)',
        'Custom domain (SSO / federated)',
      ]);
      if (!loginType) return;
      if (loginType.includes('test.salesforce.com')) {
        instanceUrl = 'https://test.salesforce.com';
      } else if (loginType.includes('Custom domain')) {
        const manual = await ctx.ui.input('Instance URL', 'https://mycompany.my.salesforce.com');
        if (!manual || !isSalesforceUrl(manual)) {
          ctx.ui.notify('Invalid Salesforce URL. Run /salesforce:setup to try again.', 'error');
          return;
        }
        instanceUrl = manual;
      }
      // else standard login — instanceUrl stays undefined
    }

    const webCmd = ['sf', 'org', 'login', 'web', '--set-default', '--alias', alias];
    if (instanceUrl && isSalesforceUrl(instanceUrl)) {
      webCmd.push('--instance-url', instanceUrl);
    }

    ctx.ui.notify('Opening browser for authentication...', 'info');
    const authResult = await pi.exec(webCmd[0], webCmd.slice(1));
    if (authResult.code !== 0) {
      ctx.ui.notify(`Authentication failed: ${authResult.stderr || authResult.stdout}`, 'error');
      return;
    }
  }

  // --- Verify (deterministic) ---
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

function buildAuthCommand(key: string, alias: string): string[] {
  switch (key) {
    case 'web':
      return ['sf', 'org', 'login', 'web', '--set-default', '--alias', alias];
    case 'access_token':
      return [
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
    case 'jwt':
      return [
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
    default:
      return ['sf', 'org', 'login', 'web', '--set-default', '--alias', alias];
  }
}

async function executeSfdxUrlAuth(
  pi: { exec: (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string; code: number }> },
  ctx: { ui: { notify: (msg: string, type?: 'info' | 'warning' | 'error') => void } },
  alias: string,
): Promise<void> {
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
    const result = await pi.exec('sf', [
      'org',
      'login',
      'sfdx-url',
      '--sfdx-url-file',
      tmpFile,
      '--set-default',
      '--alias',
      alias,
    ]);
    if (result.code !== 0) {
      ctx.ui.notify(`Authentication failed: ${result.stderr || result.stdout}`, 'error');
    }
  } finally {
    unlinkSync(tmpFile);
    rmSync(tmpDir, { recursive: true });
  }
}
