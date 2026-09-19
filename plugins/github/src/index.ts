import type { ExtensionFactory } from '@f5-sales-demo/xcsh';
import { detectGhErrorType } from './gh/exec';
import { renderError, ToolAbortError } from './utils/tool-errors';

interface GitHubUser {
  id: number;
  login: string;
  html_url?: string;
  type?: string;
}

interface IntegrationApi {
  integrations: {
    register<T>(definition: unknown): { get(signal?: AbortSignal): Promise<{ state: string; value?: T }> };
  };
}

function githubRepoFromRemote(remote: string): string | undefined {
  const match = remote.trim().match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/i);
  return match?.[1];
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

export function githubInstallArgv(platform = process.platform): string[] {
  if (platform === 'darwin') return ['brew', 'install', 'gh'];
  if (platform === 'win32') return ['winget', 'install', '--exact', '--id', 'GitHub.cli'];
  return ['sudo', 'apt-get', 'install', '--yes', 'gh'];
}

const factory: ExtensionFactory = async (pi) => {
  pi.setLabel('GitHub');
  const integrations = (pi as typeof pi & IntegrationApi).integrations;
  integrations.register<GitHubUser>({
    id: 'github',
    name: 'GitHub',
    plugin: 'github',
    kind: 'network',
    setup: {
      pluginDependencies: [],
      requiredEnvironment: [],
      profileFields: ['accounts', 'identifiers', 'sameAs'],
      steps: [
        {
          kind: 'install',
          argv: githubInstallArgv(),
          timeoutMs: 300_000,
        },
        {
          kind: 'login',
          argv: ['gh', 'auth', 'login'],
          timeoutMs: 300_000,
          stdin: 'inherit',
        },
      ],
      verification: [{ argv: ['gh', 'api', 'user'], timeoutMs: 30_000 }],
    },
    async probe() {
      const checker = process.platform === 'win32' ? 'where' : 'which';
      if (Bun.spawnSync([checker, 'gh']).exitCode !== 0) return { state: 'setup_required', reason: 'cli_missing' };
      const result = Bun.spawnSync(['gh', 'api', 'user']);
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
        const value = JSON.parse(new TextDecoder().decode(result.stdout)) as GitHubUser;
        if (!Number.isInteger(value.id) || !value.login) return { state: 'error', reason: 'invalid_response' };
        return { state: 'ready', value };
      } catch {
        return { state: 'error', reason: 'invalid_response' };
      }
    },
    profile(value: GitHubUser) {
      const principalType = value.type === 'Bot' ? 'service' : 'user';
      return {
        facts: {
          accounts: [{ provider: 'github', identifier: String(value.id), principalType, username: value.login }],
          ...(principalType === 'user'
            ? { identifiers: { github: value.login }, sameAs: value.html_url ? [value.html_url] : undefined }
            : {}),
        },
        observations: [],
      };
    },
  });
  integrations.register<string[]>({
    id: 'github_email',
    name: 'GitHub associated email',
    plugin: 'github',
    kind: 'network',
    dependencies: ['github'],
    successTtlMs: 24 * 60 * 60_000,
    async probe() {
      const result = Bun.spawnSync(['gh', 'api', '--paginate', '--slurp', 'user/emails']);
      if (result.exitCode !== 0) {
        const rawError = new TextDecoder().decode(result.stderr);
        const error = rawError.toLowerCase();
        if (error.includes('rate limit') || error.includes('429'))
          return { state: 'rate_limited', reason: 'rate_limited', retryAfterMs: retryAfterMsFromHeaders(rawError) };
        if (error.includes('403') || error.includes('forbidden'))
          return { state: 'unavailable', reason: 'permission_denied' };
        return { state: 'degraded', reason: 'invalid_response' };
      }
      try {
        const pages = JSON.parse(new TextDecoder().decode(result.stdout)) as Array<
          Array<{ email?: string; verified?: boolean }>
        >;
        const rows = pages.flat();
        const value = rows
          .filter((row): row is { email: string; verified?: boolean } => Boolean(row.verified && row.email))
          .map((row) => row.email);
        return { state: 'ready', value };
      } catch {
        return { state: 'error', reason: 'invalid_response' };
      }
    },
    profile(value: string[]) {
      return { facts: value.length ? { email: value } : {}, observations: [] };
    },
  });

  // Headless opt-in for mutating tools (checkout/push). Mirrors the GITHUB_ALLOW_MUTATIONS env var.
  if (typeof pi.registerFlag === 'function') {
    pi.registerFlag('github-allow-mutations', {
      type: 'boolean',
      description: 'Allow gh_pr_checkout/gh_pr_push to run without an interactive confirmation prompt.',
    });
    if (pi.getFlag?.('github-allow-mutations')) process.env.GITHUB_ALLOW_MUTATIONS = '1';
  }

  // Check if gh CLI is available
  let ghAvailable = false;
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    ghAvailable = Bun.spawnSync([checker, 'gh']).exitCode === 0;
  } catch {
    // gh not available
  }

  // Only register tools when gh CLI is present
  if (ghAvailable) {
    // Inject typebox before importing tool classes (avoids @sinclair/typebox resolution failure in compiled binary)
    const ghModule = await import('./tools/gh');
    ghModule.setTypebox(pi.typebox);

    const {
      GhRepoViewTool,
      GhIssueViewTool,
      GhPrViewTool,
      GhPrDiffTool,
      GhPrCheckoutTool,
      GhPrPushTool,
      GhRunWatchTool,
      GhSearchIssuesTool,
      GhSearchPrsTool,
      GhHelpTool,
      GhExecTool,
    } = ghModule;

    // Each tool class has a createIf() that checks gh availability and returns
    // an instance with name/label/description/parameters/execute.
    // In the plugin we use a minimal session that gets cwd from the tool context.
    const sessionProxy = { cwd: process.cwd() };

    const toolClasses = [
      GhRepoViewTool,
      GhIssueViewTool,
      GhPrViewTool,
      GhPrDiffTool,
      GhPrCheckoutTool,
      GhPrPushTool,
      GhRunWatchTool,
      GhSearchIssuesTool,
      GhSearchPrsTool,
      GhHelpTool,
      GhExecTool,
    ] as const;

    for (const ToolClass of toolClasses) {
      const instance = ToolClass.createIf(sessionProxy);
      if (!instance) continue;
      type ToolInstance = NonNullable<typeof instance>;

      // Wrap the execute to inject cwd from the context argument
      // The heterogeneous tool-class tuple produces an intersection of every
      // input type at this dynamic registration boundary. Erase only that
      // boundary after each class has already type-checked its own execute
      // implementation and schema.
      const originalExecute = instance.execute.bind(instance) as (
        toolCallId: string,
        params: Record<string, unknown>,
        signal: AbortSignal | undefined,
        onUpdate: unknown,
        ctx: { cwd: string },
      ) => ReturnType<ToolInstance['execute']>;

      pi.registerTool({
        name: instance.name,
        label: instance.label,
        description: instance.description,
        parameters: instance.parameters,
        async execute(
          toolCallId: string,
          params: Record<string, unknown>,
          signal: AbortSignal | undefined,
          onUpdate: unknown,
          ctx: { cwd: string },
        ) {
          // Update session cwd from context
          sessionProxy.cwd = ctx?.cwd ?? process.cwd();
          try {
            // biome-ignore lint/suspicious/noExplicitAny: bridging xcsh internal types
            return await originalExecute(toolCallId, params, signal, onUpdate as any, ctx as any);
          } catch (err) {
            if (err instanceof ToolAbortError) throw err;
            return {
              content: [{ type: 'text' as const, text: renderError(err) }],
              isError: true,
              details: { errorType: detectGhErrorType(err) },
            };
          }
        },
      });
    }
  }

  // Context injection: provide repo info to agents
  if (ghAvailable && typeof pi.on === 'function') {
    pi.on('before_agent_start', async (_event: unknown, ctx: { cwd: string }) => {
      try {
        const cwd = ctx?.cwd || process.cwd();
        const remoteResult = Bun.spawnSync(['git', 'config', '--get', 'remote.origin.url'], { cwd });
        if (remoteResult.exitCode !== 0) return;
        const remote = new TextDecoder().decode(remoteResult.stdout).trim();
        const repo = githubRepoFromRemote(remote);
        if (!repo) return;
        const branchResult = Bun.spawnSync(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
        const branch = branchResult.exitCode === 0 ? new TextDecoder().decode(branchResult.stdout).trim() : '';
        const lines = [
          `Repo: ${sanitizeHintField(repo)}`,
          branch ? `Branch: ${sanitizeHintField(branch)}` : '',
          `URL: https://github.com/${sanitizeHintField(repo)}`,
        ]
          .filter(Boolean)
          .join('\n');
        if (!lines) return;
        return {
          message: { customType: 'github_hint', content: lines, display: false },
        };
      } catch {
        return;
      }
    });
  }

  // Session start never performs an authentication probe; status/profile consumers share the integration cache.
  pi.on('session_start', (_event: unknown, _ctx: { cwd: string }) => {
    if (!ghAvailable) {
      pi.logger.debug('GitHub: gh CLI not found');
    }
  });
};

export default factory;
