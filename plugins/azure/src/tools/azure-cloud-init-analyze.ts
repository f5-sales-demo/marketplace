import type { AzExecApi } from '../az/exec';
import type { PluginInterface } from '../az/types';
import type { AzureCeToolContext } from '../ce/artifacts';
import { sha256Hex } from '../ce/canonical';
import { analyzeCloudInit } from '../ce/cloud-init';
import { makeExecApi } from './shared';

export function createAzureCloudInitAnalyzeTool(
  pi: PluginInterface,
  makeApi: (cwd: string) => AzExecApi = makeExecApi,
) {
  const { Type } = pi.typebox;
  return {
    name: 'azure_cloud_init_analyze',
    label: 'Analyze Azure cloud-init',
    description:
      'Validate CE or general Linux cloud-init, explain its execution stages, and summarize Azure boot status/log evidence without returning user data, custom data, or bootstrap tokens.',
    parameters: Type.Object({
      source: Type.Optional(Type.String()),
      sourceArtifactId: Type.Optional(Type.String()),
      subscriptionId: Type.Optional(Type.String()),
      resourceGroup: Type.Optional(Type.String()),
      vmName: Type.Optional(Type.String()),
    }),
    async execute(
      _id: string,
      params: {
        source?: string;
        sourceArtifactId?: string;
        subscriptionId?: string;
        resourceGroup?: string;
        vmName?: string;
      },
      _signal: AbortSignal | undefined,
      _update: unknown,
      ctx: AzureCeToolContext,
    ) {
      try {
        let source = params.source;
        if (params.sourceArtifactId) {
          if (!/^\d+$/.test(params.sourceArtifactId)) throw new Error('Invalid source artifact ID');
          const path = await ctx.sessionManager.getArtifactPath(params.sourceArtifactId);
          if (!path) throw new Error('Source artifact was not found in this session');
          source = await Bun.file(path).text();
        }
        const analysis = source ? analyzeCloudInit(source) : undefined;
        let bootEvidence: Record<string, unknown> | undefined;
        if (params.subscriptionId || params.resourceGroup || params.vmName) {
          if (!params.subscriptionId || !params.resourceGroup || !params.vmName)
            throw new Error('subscriptionId, resourceGroup, and vmName are required together');
          const result = await makeApi(ctx.cwd).exec('az', [
            'vm',
            'boot-diagnostics',
            'get-boot-log',
            '--resource-group',
            params.resourceGroup,
            '--name',
            params.vmName,
            '--subscription',
            params.subscriptionId,
          ]);
          const raw = `${result.stdout}\n${result.stderr}`;
          bootEvidence = {
            ok: result.exitCode === 0,
            bytes: Buffer.byteLength(raw),
            digest: sha256Hex(raw),
            cloudInitFinished: /cloud-init.*finish|status:\s*done/i.test(raw),
            errorsDetected: /cloud-init.*(?:error|fail)/i.test(raw),
          };
        }
        if (!analysis && !bootEvidence)
          throw new Error('Provide cloud-init source, a session artifact ID, or complete VM coordinates');
        return {
          content: [
            {
              type: 'text' as const,
              text: `cloud-init analysis: ${analysis ? (analysis.valid ? 'valid' : 'invalid') : 'source not inspected'}; stages: init-local → init-network → config → final; boot evidence: ${bootEvidence ? (bootEvidence.ok ? 'collected' : 'unavailable') : 'not requested'}. Raw user data and logs were withheld.`,
            },
          ],
          details: { tool: 'azure_cloud_init_analyze', analysis, bootEvidence },
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
          details: { tool: 'azure_cloud_init_analyze' },
        };
      }
    },
  };
}
