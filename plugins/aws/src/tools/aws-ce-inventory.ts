import type { AwsExecApi } from '../aws/exec';
import type { PluginInterface } from '../aws/types';
import { type AwsCeInventoryInput, collectAwsCeInventory } from '../ce/inventory';
import { makeExecApi } from './shared';

export function createAwsCeInventoryTool(pi: PluginInterface, makeApi: (cwd: string) => AwsExecApi = makeExecApi) {
  const { Type } = pi.typebox;
  return {
    name: 'aws_ce_inventory',
    label: 'Inventory AWS Customer Edge',
    description:
      'Read-only paginated inventory of CE-tagged instances and authoritative ENI attachment/MAC identities in explicit AWS regions. Reports engine ownership separately from unknown F5 registration and health. No plan or deployment required.',
    parameters: Type.Object({
      accountId: Type.String(),
      awsProfile: Type.Optional(Type.String()),
      regions: Type.Array(Type.String(), { minItems: 1, maxItems: 40 }),
    }),
    async execute(
      _id: string,
      params: AwsCeInventoryInput,
      signal: AbortSignal | undefined,
      _update: unknown,
      ctx: {
        cwd: string;
        sessionManager: { saveArtifact(content: string, type: string): Promise<string | undefined> };
      },
    ) {
      try {
        const inventory = await collectAwsCeInventory(params, makeApi(ctx.cwd), signal);
        const artifactId = await ctx.sessionManager.saveArtifact(JSON.stringify(inventory), 'aws-ce-inventory');
        if (!artifactId) throw new Error('Inventory artifact persistence failed');
        return {
          content: [
            {
              type: 'text' as const,
              text: `AWS CE inventory: ${inventory.counts.instances} instances and ${inventory.counts.interfaces} interfaces in ${inventory.scope.regions.length} requested region(s). F5 registration and health are unknown.`,
            },
          ],
          details: { tool: 'aws_ce_inventory', artifactId, inventory },
        };
      } catch {
        signal?.throwIfAborted();
        return {
          content: [
            { type: 'text' as const, text: 'AWS CE inventory is unavailable. No partial resource data was returned.' },
          ],
          isError: true,
          details: { tool: 'aws_ce_inventory', outcome: 'unavailable' },
        };
      }
    },
  };
}
