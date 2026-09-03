import type { AzExecApi } from '../az/exec';
import type { PluginInterface } from '../az/types';
import { canonicalStringify } from '../ce/canonical';
import { type AzureCeInventoryInput, collectAzureCeInventory, formatAzureCeInventory } from '../ce/inventory';
import description from '../prompts/azure-ce-inventory.md' with { type: 'text' };
import { makeExecApi } from './shared';

interface InventorySession {
  saveArtifact(content: string, toolType: string): Promise<string | undefined>;
}

export function createAzureCeInventoryTool(
  pi: PluginInterface,
  makeApi: (cwd: string) => AzExecApi = makeExecApi,
  now: () => Date = () => new Date(),
) {
  const { Type } = pi.typebox;
  const platformNode = Type.Object({
    hostname: Type.Optional(Type.String()),
    macAddresses: Type.Optional(Type.Array(Type.String())),
  });
  const platformSite = Type.Object({
    namespace: Type.Optional(Type.String()),
    name: Type.String(),
    siteState: Type.Optional(Type.String()),
    creator: Type.Optional(Type.String()),
    nodes: Type.Optional(Type.Array(platformNode)),
  });
  return {
    name: 'azure_ce_inventory',
    label: 'Inventory Azure Customer Edge',
    description,
    parameters: Type.Object({
      subscriptionId: Type.String({ description: 'Azure subscription UUID' }),
      caller: Type.Optional(
        Type.Object({
          objectId: Type.Optional(Type.String()),
          userPrincipalName: Type.Optional(Type.String()),
        }),
      ),
      platformSites: Type.Optional(Type.Array(platformSite)),
    }),
    async execute(
      _id: string,
      params: AzureCeInventoryInput,
      signal: AbortSignal | undefined,
      _update: unknown,
      ctx: { cwd: string; sessionManager: InventorySession },
    ) {
      try {
        const envelope = await collectAzureCeInventory(params, makeApi(ctx.cwd), now, signal);
        const artifactId = await ctx.sessionManager.saveArtifact(canonicalStringify(envelope), 'azure-ce-inventory');
        return {
          content: [{ type: 'text' as const, text: formatAzureCeInventory(envelope, artifactId) }],
          details: {
            tool: 'azure_ce_inventory',
            outcome: 'success',
            artifactId,
            digestSha256: envelope.digestSha256,
            inventory: envelope.inventory,
          },
        };
      } catch (error) {
        const invalid = error instanceof Error && /must be|non-empty|exactly 12/.test(error.message);
        return {
          content: [
            {
              type: 'text' as const,
              text: invalid
                ? `Azure CE inventory input is invalid: ${error instanceof Error ? error.message : ''}`
                : 'Azure CE inventory failed without returning partial resource data.',
            },
          ],
          isError: true,
          details: { tool: 'azure_ce_inventory', outcome: invalid ? 'invalid_input' : 'execution_failure' },
        };
      }
    },
  };
}
