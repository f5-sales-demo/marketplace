import type { ExtensionFactory } from '@f5-sales-demo/xcsh';

function sanitizeHintField(value: unknown, maxLen = 200): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[^\x20-\x7E]/g, '').slice(0, maxLen);
}

const factory: ExtensionFactory = async (pi) => {
  pi.setLabel('GitHub');

  // Always register setup command (even without gh CLI)
  if (typeof pi.registerCommand === 'function') {
    pi.registerCommand('github:setup', {
      description: 'Install and configure GitHub CLI',
      async handler(_args, ctx) {
        const { runSetupWizard } = await import('./wizard');
        await runSetupWizard(pi, ctx);
      },
    });
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
    ] as const;

    for (const ToolClass of toolClasses) {
      const instance = ToolClass.createIf(sessionProxy);
      if (!instance) continue;

      // Wrap the execute to inject cwd from the context argument
      const originalExecute = instance.execute.bind(instance);

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
          // biome-ignore lint/suspicious/noExplicitAny: bridging xcsh internal types
          return originalExecute(toolCallId, params, signal, onUpdate as any, ctx as any); // eslint-disable-line
        },
      });
    }
  }

  // Always register service status (shows unavailable when CLI missing)
  if (typeof pi.registerServiceStatus === 'function') {
    pi.registerServiceStatus({
      name: 'GitHub',
      async check() {
        try {
          const whichChecker = process.platform === 'win32' ? 'where' : 'which';
          const whichResult = Bun.spawnSync([whichChecker, 'gh']);
          if (whichResult.exitCode !== 0) {
            return { state: 'unavailable', hint: 'run: /github:setup' };
          }
          const authResult = Bun.spawnSync(['gh', 'auth', 'status']);
          if (authResult.exitCode !== 0) {
            return { state: 'unauthenticated', hint: 'run: /github:setup' };
          }
          return { state: 'connected' };
        } catch {
          return { state: 'unavailable', hint: 'gh CLI check failed' };
        }
      },
      fix: {
        prompt: 'GitHub CLI not authenticated',
        command: ['gh', 'auth', 'login'],
      },
    });
  }

  // Context injection: provide repo info to agents
  if (ghAvailable && typeof pi.on === 'function') {
    pi.on('before_agent_start', async (_event: unknown, ctx: { cwd: string }) => {
      try {
        const cwd = ctx?.cwd || process.cwd();
        const result = Bun.spawnSync(['gh', 'repo', 'view', '--json', 'nameWithOwner,defaultBranchRef,url'], { cwd });
        if (result.exitCode !== 0) return;
        const repo = JSON.parse(new TextDecoder().decode(result.stdout));
        const branchResult = Bun.spawnSync(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
        const branch = branchResult.exitCode === 0 ? new TextDecoder().decode(branchResult.stdout).trim() : '';
        const lines = [
          repo.nameWithOwner ? `Repo: ${sanitizeHintField(repo.nameWithOwner)}` : '',
          branch ? `Branch: ${sanitizeHintField(branch)}` : '',
          repo.url ? `URL: ${sanitizeHintField(repo.url)}` : '',
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

  // Session start: notify if CLI missing, check auth if available
  pi.on('session_start', async (_event: unknown, _ctx: { cwd: string }) => {
    if (!ghAvailable) {
      pi.logger.debug('GitHub: gh CLI not found');
      return;
    }
    try {
      const authResult = Bun.spawnSync(['gh', 'auth', 'status']);
      if (authResult.exitCode !== 0) {
        pi.logger.debug('GitHub: not authenticated (non-fatal)');
      }
    } catch {
      pi.logger.debug('GitHub: welcome check failed (non-fatal)');
    }
  });
};

export default factory;
