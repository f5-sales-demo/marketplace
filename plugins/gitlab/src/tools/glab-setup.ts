import { loadConfig, saveConfig } from '../glab/config';
import { checkAuth, checkInstalled, execGlabJson } from '../glab/exec';
import type { GlabProject } from '../glab/types';
import glabSetupDescription from '../prompts/glab-setup.md' with { type: 'text' };
import { makeExecApi, textResult } from './shared';

export function createGlabSetupTool(pi: any) {
  const { Type } = pi.typebox;

  const parameters = Type.Object({
    action: Type.Union(
      [
        Type.Literal('check'),
        Type.Literal('login'),
        Type.Literal('select_project'),
        Type.Literal('save_project'),
        Type.Literal('status'),
      ],
      { description: 'Onboarding action to perform' },
    ),
    project: Type.Optional(Type.String({ description: 'Project path to persist (used with save_project)' })),
  });

  return {
    name: 'glab_setup',
    label: 'GitLab Setup',
    description: glabSetupDescription,
    parameters,
    async execute(
      _toolCallId: string,
      params: { action: string; project?: string },
      signal: any,
      _onUpdate: any,
      ctx: { cwd: string },
    ) {
      const api = makeExecApi(ctx.cwd);

      switch (params.action) {
        case 'check': {
          const installed = await checkInstalled(api);
          if (!installed) {
            return textResult(
              'glab is not installed.\n\nInstall it with:\n- **macOS**: `brew install glab`\n- **Linux**: Download from https://gitlab.com/gitlab-org/cli/-/releases\n- **Windows**: `winget install gitlab.glab`\n\nAfter installing, call glab_setup with action "login" to authenticate.',
            );
          }
          const ver = await api.exec('glab', ['--version'], { signal });
          return textResult(`glab is installed: ${ver.stdout.trim()}`);
        }

        case 'status': {
          const authResult = await api.exec('glab', ['auth', 'status'], { signal });
          const config = await loadConfig(ctx.cwd);
          const projectInfo = config?.project
            ? `\nConfigured project: ${config.project}`
            : '\nNo project configured. Run select_project to choose one.';
          const authStatus = authResult.code === 0 ? authResult.stdout : `Not authenticated: ${authResult.stderr}`;
          return textResult(authStatus + projectInfo);
        }

        case 'login':
          return textResult(
            'Starting GitLab authentication...\n\nRunning: `glab auth login --hostname gitlab.com --git-protocol https --web`\n\nYour browser will open for you to authorize access. Return here after authorizing.',
          );

        case 'select_project': {
          const authenticated = await checkAuth(api);
          if (!authenticated) {
            return textResult('Not authenticated. Run glab_setup with action "login" first.');
          }
          const projects = await execGlabJson<GlabProject[]>(
            api,
            ['repo', 'list', '--member', '--output', 'json', '--per-page', '50'],
            signal,
          );
          if (!projects.length) {
            return textResult('No projects found for your account.');
          }
          const list = projects
            .map((p, i) => `${i + 1}. **${p.name_with_namespace}** — \`${p.path_with_namespace}\``)
            .join('\n');
          return textResult(
            `Found ${projects.length} projects:\n\n${list}\n\nWhich project do you want to use for GitLab issue tracking? Reply with the number or full path.`,
            { tool: 'glab_setup', projects },
          );
        }

        case 'save_project': {
          if (!params.project) {
            return textResult('Error: project parameter is required for save_project action.');
          }
          const existing = (await loadConfig(ctx.cwd)) ?? {
            project: '',
            hostname: 'gitlab.com',
            defaultState: 'opened' as const,
            perPage: 30,
          };
          await saveConfig(ctx.cwd, { ...existing, project: params.project });
          return textResult(`Configuration saved. Default project set to: **${params.project}**`);
        }

        default:
          return textResult(`Unknown action: ${params.action}`);
      }
    },
  };
}
