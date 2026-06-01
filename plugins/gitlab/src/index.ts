import type { ExtensionFactory } from '@f5xc-salesdemos/xcsh';

const factory: ExtensionFactory = async (pi) => {
  pi.setLabel('GitLab');

  // Check if glab CLI is available
  try {
    const result = Bun.spawnSync(['which', 'glab']);
    if (result.exitCode !== 0) {
      pi.logger.debug('GitLab CLI (glab) not found — skipping tool registration');
      return;
    }
  } catch {
    pi.logger.debug('GitLab CLI (glab) not found — skipping tool registration');
    return;
  }

  // Register tools
  const { createGlabSetupTool } = await import('./tools/glab-setup');
  const { createGlabIssueListTool } = await import('./tools/glab-issue-list');
  const { createGlabIssueViewTool } = await import('./tools/glab-issue-view');
  const { createGlabSearchTool } = await import('./tools/glab-search');

  pi.registerTool(createGlabSetupTool(pi));
  pi.registerTool(createGlabIssueListTool(pi));
  pi.registerTool(createGlabIssueViewTool(pi));
  pi.registerTool(createGlabSearchTool(pi));

  // Register welcome screen service status
  // Replicates the multi-step GitLab check from xcsh welcome-checks:
  //   1. glab auth status (authentication)
  //   2. glab repo view (project access)
  if (typeof pi.registerServiceStatus === 'function') {
    pi.registerServiceStatus({
      name: 'GitLab',
      async check() {
        try {
          // Step 1: Check authentication
          const authResult = Bun.spawnSync(['glab', 'auth', 'status']);
          if (authResult.exitCode !== 0) {
            return { state: 'unauthenticated', hint: 'run: glab auth login' };
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
};

export default factory;
