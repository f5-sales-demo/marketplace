import type { ExtensionFactory } from '@f5-sales-demo/xcsh';

function sanitizeHintField(value: unknown, maxLen = 200): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[^\x20-\x7E]/g, '').slice(0, maxLen);
}

const factory: ExtensionFactory = async (pi) => {
  pi.setLabel('GitLab');

  // Always register setup command (even without glab CLI)
  if (typeof pi.registerCommand === 'function') {
    pi.registerCommand('gitlab:setup', {
      description: 'Install and configure GitLab CLI',
      async handler(_args, ctx) {
        const { runSetupWizard } = await import('./wizard');
        await runSetupWizard(pi, ctx);
      },
    });
  }

  // Check if glab CLI is available
  let glabAvailable = false;
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    glabAvailable = Bun.spawnSync([checker, 'glab']).exitCode === 0;
  } catch {
    // glab not available
  }

  // Only register tools when glab CLI is present
  if (glabAvailable) {
    const { createGlabSetupTool } = await import('./tools/glab-setup');
    const { createGlabIssueListTool } = await import('./tools/glab-issue-list');
    const { createGlabIssueViewTool } = await import('./tools/glab-issue-view');
    const { createGlabSearchTool } = await import('./tools/glab-search');

    pi.registerTool(createGlabSetupTool(pi));
    pi.registerTool(createGlabIssueListTool(pi));
    pi.registerTool(createGlabIssueViewTool(pi));
    pi.registerTool(createGlabSearchTool(pi));
  }

  // Always register service status (shows unavailable when CLI missing)
  if (typeof pi.registerServiceStatus === 'function') {
    pi.registerServiceStatus({
      name: 'GitLab',
      async check() {
        try {
          const whichChecker = process.platform === 'win32' ? 'where' : 'which';
          const whichResult = Bun.spawnSync([whichChecker, 'glab']);
          if (whichResult.exitCode !== 0) {
            return { state: 'unavailable', hint: 'run: /gitlab:setup' };
          }

          // Step 1: Check authentication
          const authResult = Bun.spawnSync(['glab', 'auth', 'status']);
          if (authResult.exitCode !== 0) {
            return { state: 'unauthenticated', hint: 'run: /gitlab:setup' };
          }

          // Step 2: Parse auth output for user info
          const authOutput = authResult.stderr.toString();
          const match = authOutput.match(/Logged in to ([\w.-]+) as (\S+)/);
          const user = match?.[2];

          // Step 3: Suppress glab update nag (idempotent)
          Bun.spawnSync(['glab', 'config', 'set', 'check_update', 'false']);

          // Step 4: Try to detect project from git remote
          const repoResult = Bun.spawnSync(['glab', 'repo', 'view', '--output', 'json']);
          if (repoResult.exitCode === 0) {
            try {
              const repo = JSON.parse(repoResult.stdout.toString());
              if (repo.path_with_namespace) {
                // Step 5: Verify project access
                const encoded = encodeURIComponent(repo.path_with_namespace);
                const accessResult = Bun.spawnSync(['glab', 'api', `projects/${encoded}`]);
                if (accessResult.exitCode === 0) {
                  return { state: 'connected' };
                }
                return {
                  state: 'unauthenticated',
                  hint: `project ${repo.path_with_namespace} inaccessible${user ? ` for @${user}` : ''}`,
                };
              }
            } catch {
              // JSON parse failed — fall through
            }
          }

          // Authenticated but no project detected — still connected
          return { state: 'connected' };
        } catch {
          return { state: 'unavailable', hint: 'glab CLI check failed' };
        }
      },
      fix: {
        prompt: 'GitLab not authenticated',
        command: ['glab', 'auth', 'login', '--hostname', 'gitlab.com', '--git-protocol', 'https', '--web'],
      },
    });
  }

  // Before agent start: inject GitLab project context
  if (glabAvailable && typeof pi.on === 'function') {
    pi.on('before_agent_start', async (_event: unknown, ctx: { cwd: string }) => {
      try {
        const cwd = ctx?.cwd || process.cwd();
        const result = Bun.spawnSync(['glab', 'repo', 'view', '--output', 'json'], { cwd });
        if (result.exitCode !== 0) return;
        const repo = JSON.parse(new TextDecoder().decode(result.stdout));
        const branchResult = Bun.spawnSync(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
        const branch = branchResult.exitCode === 0 ? new TextDecoder().decode(branchResult.stdout).trim() : '';
        const lines = [
          repo.path_with_namespace ? `Project: ${sanitizeHintField(repo.path_with_namespace)}` : '',
          branch ? `Branch: ${sanitizeHintField(branch)}` : '',
          repo.web_url ? `URL: ${sanitizeHintField(repo.web_url)}` : '',
        ]
          .filter(Boolean)
          .join('\n');
        if (!lines) return;
        return {
          message: { customType: 'gitlab_hint', content: lines, display: false },
        };
      } catch {
        return;
      }
    });
  }

  // Session start: notify if CLI missing, check auth if available
  pi.on('session_start', async (_event: unknown, _ctx: { cwd: string }) => {
    if (!glabAvailable) {
      pi.logger.debug('GitLab: glab CLI not found');
      return;
    }
    try {
      const authResult = Bun.spawnSync(['glab', 'auth', 'status']);
      if (authResult.exitCode !== 0) {
        pi.logger.debug('GitLab: not authenticated (non-fatal)');
      }
    } catch {
      pi.logger.debug('GitLab: welcome check failed (non-fatal)');
    }
  });
};

export default factory;
