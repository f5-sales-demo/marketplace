import type { ExtensionFactory } from '@f5xc-salesdemos/xcsh';

const factory: ExtensionFactory = async (pi) => {
  pi.setLabel('GitHub');

  // Gate on gh CLI availability
  try {
    const result = Bun.spawnSync(['which', 'gh']);
    if (result.exitCode !== 0) {
      pi.logger.debug('GitHub CLI (gh) not found — skipping tool registration');
      return;
    }
  } catch {
    pi.logger.debug('GitHub CLI (gh) not found — skipping tool registration');
    return;
  }

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

  // Register welcome screen service status
  if (typeof pi.registerServiceStatus === 'function') {
    pi.registerServiceStatus({
      name: 'GitHub',
      async check() {
        try {
          const whichResult = Bun.spawnSync(['which', 'gh']);
          if (whichResult.exitCode !== 0) {
            return { state: 'unavailable', hint: 'gh CLI not installed — https://cli.github.com/' };
          }
          const authResult = Bun.spawnSync(['gh', 'auth', 'status']);
          if (authResult.exitCode !== 0) {
            return { state: 'unauthenticated', hint: 'run: gh auth login' };
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

  // Session start — verify gh auth at session start (non-fatal)
  pi.on('session_start', async (_event: unknown, _ctx: { cwd: string }) => {
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
