import type { AzExecApi } from '../az/exec';
import type { PluginInterface } from '../az/types';
import { SUBSCRIPTION_ID_PATTERN } from '../az/types';
import { canonicalStringify } from '../ce/canonical';
import {
  type AzureCeInventoryEnvelope,
  type AzureCeInventoryErrorType,
  AzureCeInventoryFailure,
  type AzureCeInventoryFailureStage,
  type AzureCeInventoryInput,
  collectAzureCeInventory,
  formatAzureCeInventory,
} from '../ce/inventory';
import description from '../prompts/azure-ce-inventory.md' with { type: 'text' };
import { makeExecApi } from './shared';

interface InventorySession {
  saveArtifact(content: string, toolType: string): Promise<string | undefined>;
}

function failureResult(failureStage: AzureCeInventoryFailureStage, errorType: AzureCeInventoryErrorType) {
  const authenticationFailure = errorType === 'auth_required' || errorType === 'session_expired';
  return {
    content: [
      {
        type: 'text' as const,
        text:
          errorType === 'invalid_input'
            ? 'Azure CE inventory input is invalid.'
            : 'Azure CE inventory failed without returning partial resource data.',
      },
    ],
    isError: true,
    details: {
      tool: 'azure_ce_inventory',
      outcome: authenticationFailure
        ? ('authentication_failure' as const)
        : errorType === 'invalid_input'
          ? ('invalid_input' as const)
          : ('execution_failure' as const),
      failureStage,
      errorType,
    },
  };
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
        Type.Object(
          {
            objectId: Type.Optional(Type.String({ pattern: SUBSCRIPTION_ID_PATTERN.source })),
            userPrincipalName: Type.Optional(
              Type.String({ minLength: 1, maxLength: 320, pattern: '^[^\\u0000-\\u001F\\u007F]+$' }),
            ),
          },
          { minProperties: 1 },
        ),
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
      let envelope: AzureCeInventoryEnvelope;
      try {
        envelope = await collectAzureCeInventory(params, makeApi(ctx.cwd), now, signal);
      } catch (error) {
        if (error instanceof AzureCeInventoryFailure) return failureResult(error.failureStage, error.errorType);
        return failureResult('collector', 'unexpected_error');
      }

      let serialized: string;
      try {
        serialized = canonicalStringify(envelope);
      } catch {
        return failureResult('envelope_serialization', 'serialization_error');
      }

      let artifactId: string | undefined;
      try {
        artifactId = await ctx.sessionManager.saveArtifact(serialized, 'azure-ce-inventory');
      } catch {
        return failureResult('artifact_persistence', 'persistence_error');
      }
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
    },
  };
}
