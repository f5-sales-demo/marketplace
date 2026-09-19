import type { ExtensionFactory } from '@f5-sales-demo/xcsh';
import { detectErrorType, errorResult, renderError } from './tools/shared';

interface GitLabUser {
  id: number;
  username: string;
  bot?: boolean;
}

interface IntegrationApi {
  integrations: {
    register<T>(definition: unknown): { get(signal?: AbortSignal): Promise<{ state: string; value?: T }> };
  };
}

function sanitizeHintField(value: unknown, maxLen = 200): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[^\x20-\x7E]/g, '').slice(0, maxLen);
}

export function retryAfterMsFromHeaders(text: string, now = Date.now()): number | undefined {
  const retryAfter = text.match(/(?:^|\r?\n)retry-after:\s*([^\r\n]+)/i)?.[1]?.trim();
  if (retryAfter && /^\d+$/.test(retryAfter)) return Number(retryAfter) * 1000;
  if (retryAfter) {
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) return Math.max(0, retryAt - now);
  }
  const reset = text.match(/(?:^|\r?\n)x-ratelimit-reset:\s*(\d+)/i)?.[1];
  return reset ? Math.max(0, Number(reset) * 1000 - now) : undefined;
}

export function gitlabInstallArgv(platform = process.platform): string[] {
  if (platform === 'darwin') return ['brew', 'install', 'glab'];
  if (platform === 'win32') return ['winget', 'install', '--exact', '--id', 'GitLab.glab'];
  return ['sudo', 'apt-get', 'install', '--yes', 'glab'];
}

export function gitLabProjectFromRemote(remote: string): string | undefined {
  return remote.trim().match(/gitlab\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/i)?.[1];
}

export function withErrorType<T extends { execute: (...args: never[]) => Promise<unknown> }>(tool: T): T {
  const originalExecute = tool.execute.bind(tool) as (...args: unknown[]) => Promise<unknown>;
  return {
    ...tool,
    execute: (async (...args: unknown[]) => {
      try {
        return await originalExecute(...args);
      } catch (err) {
        if (err instanceof Error && err.message === 'Command was cancelled') throw err;
        return errorResult(renderError(err), { errorType: detectErrorType(err) });
      }
    }) as T['execute'],
  };
}

const factory: ExtensionFactory = async (pi) => {
  pi.setLabel('GitLab');
  (pi as typeof pi & IntegrationApi).integrations.register<GitLabUser>({
    id: 'gitlab',
    name: 'GitLab',
    plugin: 'gitlab',
    kind: 'network',
    setup: {
      pluginDependencies: [],
      requiredEnvironment: [],
      profileFields: ['accounts'],
      steps: [
        {
          kind: 'install',
          argv: gitlabInstallArgv(),
          timeoutMs: 300_000,
        },
        {
          kind: 'login',
          argv: ['glab', 'auth', 'login', '--hostname', 'gitlab.com', '--git-protocol', 'https', '--web'],
          timeoutMs: 300_000,
          stdin: 'inherit',
        },
      ],
      verification: [{ argv: ['glab', 'api', 'user'], timeoutMs: 30_000 }],
    },
    async probe() {
      const checker = process.platform === 'win32' ? 'where' : 'which';
      if (Bun.spawnSync([checker, 'glab']).exitCode !== 0) return { state: 'setup_required', reason: 'cli_missing' };
      const result = Bun.spawnSync(['glab', 'api', 'user']);
      if (result.exitCode !== 0) {
        const rawError = new TextDecoder().decode(result.stderr);
        const error = rawError.toLowerCase();
        if (error.includes('rate limit') || error.includes('429'))
          return { state: 'rate_limited', reason: 'rate_limited', retryAfterMs: retryAfterMsFromHeaders(rawError) };
        if (error.includes('expired')) return { state: 'setup_required', reason: 'expired' };
        if (error.includes('403') || error.includes('forbidden'))
          return { state: 'unavailable', reason: 'permission_denied' };
        if (error.includes('connect') || error.includes('network')) return { state: 'unavailable', reason: 'network' };
        return { state: 'setup_required', reason: 'not_authenticated' };
      }
      try {
        const value = JSON.parse(new TextDecoder().decode(result.stdout)) as GitLabUser;
        if (!Number.isInteger(value.id) || !value.username) return { state: 'error', reason: 'invalid_response' };
        return { state: 'ready', value };
      } catch {
        return { state: 'error', reason: 'invalid_response' };
      }
    },
    profile(value: GitLabUser) {
      return {
        facts: {
          accounts: [
            {
              provider: 'gitlab',
              identifier: String(value.id),
              principalType: value.bot ? 'service' : 'user',
              username: value.username,
            },
          ],
        },
        observations: [],
      };
    },
  });

  let glabAvailable = false;
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    glabAvailable = Bun.spawnSync([checker, 'glab']).exitCode === 0;
  } catch {}

  if (glabAvailable) {
    const { createGlabIssueListTool } = await import('./tools/glab-issue-list');
    const { createGlabIssueViewTool } = await import('./tools/glab-issue-view');
    const { createGlabSearchTool } = await import('./tools/glab-search');
    const { createGlabHelpTool } = await import('./tools/glab-help');
    const { createGlabExecTool } = await import('./tools/glab-exec');
    pi.registerTool(withErrorType(createGlabIssueListTool(pi)));
    pi.registerTool(withErrorType(createGlabIssueViewTool(pi)));
    pi.registerTool(withErrorType(createGlabSearchTool(pi)));
    pi.registerTool(withErrorType(createGlabHelpTool(pi)));
    pi.registerTool(withErrorType(createGlabExecTool(pi)));
  }

  if (glabAvailable && typeof pi.on === 'function') {
    pi.on('before_agent_start', async (_event: unknown, ctx: { cwd: string }) => {
      try {
        const cwd = ctx?.cwd || process.cwd();
        const remoteResult = Bun.spawnSync(['git', 'config', '--get', 'remote.origin.url'], { cwd });
        if (remoteResult.exitCode !== 0) return;
        const project = gitLabProjectFromRemote(new TextDecoder().decode(remoteResult.stdout));
        if (!project) return;
        const branchResult = Bun.spawnSync(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
        const branch = branchResult.exitCode === 0 ? new TextDecoder().decode(branchResult.stdout).trim() : '';
        const lines = [
          `Project: ${sanitizeHintField(project)}`,
          branch ? `Branch: ${sanitizeHintField(branch)}` : '',
          `URL: https://gitlab.com/${sanitizeHintField(project)}`,
        ]
          .filter(Boolean)
          .join('\n');
        return { message: { customType: 'gitlab_hint', content: lines, display: false } };
      } catch {
        return;
      }
    });
  }

  pi.on('session_start', () => {
    if (!glabAvailable) pi.logger.debug('GitLab: glab CLI not found');
  });
};

export default factory;
