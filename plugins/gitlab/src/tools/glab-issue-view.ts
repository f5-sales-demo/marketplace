import { resolveProject } from '../glab/config';
import { execGlabJson, GlabAuthError } from '../glab/exec';
import { formatIssueDetail } from '../glab/formatters';
import type { GlabIssue } from '../glab/types';
import glabIssueViewDescription from '../prompts/glab-issue-view.md' with { type: 'text' };
import { makeExecApi, textResult } from './shared';

export function createGlabIssueViewTool(pi: any) {
  const { Type } = pi.typebox;

  const parameters = Type.Object({
    issue: Type.Union([Type.Number(), Type.String()], { description: 'Issue IID number or full URL' }),
    project: Type.Optional(Type.String()),
    comments: Type.Optional(Type.Boolean({ default: true })),
  });

  return {
    name: 'glab_issue_view',
    label: 'GitLab Issue',
    description: glabIssueViewDescription,
    parameters,
    async execute(
      _toolCallId: string,
      params: { issue: number | string; project?: string; comments?: boolean },
      signal: any,
      _onUpdate: any,
      ctx: { cwd: string },
    ) {
      const api = makeExecApi(ctx.cwd);
      const project = await resolveProject(params.project, ctx.cwd, (cmd, args) => api.exec(cmd, args));
      if (!project) {
        return textResult('No GitLab project configured. Run glab_setup to set one up.');
      }

      const issueId = String(params.issue);
      const args = ['issue', 'view', issueId, '--output', 'json', '--repo', project];
      if (params.comments !== false) args.push('--comments');

      try {
        const issue = await execGlabJson<GlabIssue>(api, args, signal);
        return textResult(formatIssueDetail(issue), { tool: 'glab_issue_view', issue, project });
      } catch (err) {
        if (err instanceof GlabAuthError) return textResult((err as Error).message);
        throw err;
      }
    },
  };
}
