import type { AwsExecApi } from '../aws/exec';
import type { PluginInterface } from '../aws/types';
import type { AwsCeToolContext } from '../ce/artifacts';
import { sha256Hex } from '../ce/canonical';
import { analyzeAwsCloudInit } from '../ce/cloud-init';
import { makeExecApi } from './shared';

export function createAwsCloudInitAnalyzeTool(pi: PluginInterface, makeApi: (cwd: string) => AwsExecApi = makeExecApi) {
  const { Type } = pi.typebox;
  return {
    name: 'aws_cloud_init_analyze',
    label: 'Analyze AWS cloud-init',
    description:
      'Validate CE or general Linux cloud-init and summarize redacted EC2 console evidence without returning user data, bootstrap tokens, or raw boot logs.',
    parameters: Type.Object({
      source: Type.Optional(Type.String()),
      sourceArtifactId: Type.Optional(Type.String()),
      instanceId: Type.Optional(Type.String()),
      region: Type.Optional(Type.String()),
    }),
    async execute(
      _id: string,
      params: { source?: string; sourceArtifactId?: string; instanceId?: string; region?: string },
      _signal: AbortSignal | undefined,
      _update: unknown,
      ctx: AwsCeToolContext,
    ) {
      try {
        let source = params.source;
        if (params.sourceArtifactId) {
          if (!/^\d+$/.test(params.sourceArtifactId)) throw new Error('Invalid source artifact ID');
          const path = await ctx.sessionManager.getArtifactPath(params.sourceArtifactId);
          if (!path) throw new Error('Source artifact was not found in this session');
          source = await Bun.file(path).text();
        }
        const analysis = source ? analyzeAwsCloudInit(source) : undefined;
        let bootEvidence: Record<string, unknown> | undefined;
        if (params.instanceId || params.region) {
          const instanceId = params.instanceId ?? '';
          const region = params.region ?? '';
          if (!/^i-[0-9a-f]{8,17}$/.test(instanceId) || !/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(region))
            throw new Error('instanceId and region are required together');
          const result = await makeApi(ctx.cwd).exec('aws', [
            'ec2',
            'get-console-output',
            '--instance-id',
            instanceId,
            '--latest',
            '--region',
            region,
            '--output',
            'json',
          ]);
          const raw = `${result.stdout}\n${result.stderr}`;
          bootEvidence = {
            ok: result.exitCode === 0,
            bytes: Buffer.byteLength(raw),
            digest: sha256Hex(raw),
            cloudInitFinished: /cloud-init.*finish|finished at/i.test(raw),
            errorsDetected: /cloud-init.*(?:error|fail)/i.test(raw),
          };
        }
        if (!analysis && !bootEvidence)
          throw new Error('Provide cloud-init source, a session artifact ID, or complete EC2 coordinates');
        return {
          content: [
            {
              type: 'text' as const,
              text: `cloud-init analysis: ${analysis ? (analysis.valid ? 'valid' : 'invalid') : 'source not inspected'}; stages: init-local → init-network → config → final; boot evidence: ${bootEvidence ? (bootEvidence.ok ? 'collected' : 'unavailable') : 'not requested'}. Raw user data and logs were withheld.`,
            },
          ],
          details: { tool: 'aws_cloud_init_analyze', analysis, bootEvidence },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `cloud-init analysis failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'aws_cloud_init_analyze' },
        };
      }
    },
  };
}
