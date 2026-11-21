import { expect } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TerraformSession } from '../../../terraform/src/service';
import { reconcileAzurePendingVm } from '../../src/ce/terraform-pending-import';
import { readAzureTerraformPendingImportProvenance } from '../../src/ce/terraform-pending-import-provenance';
import type { originalNativeWorkflowFixture } from './terraform-original-native-workflow-fixture';

/** Synthetic failed allocation; journal/configuration/archive custody uses the owning native runner. */
export async function executeOwningPendingImport(original: Awaited<ReturnType<typeof originalNativeWorkflowFixture>>) {
  original.simulatePendingAllocation();
  const api: typeof original.api = {
    async exec(command, args, options) {
      if (args[0] === 'group')
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify(
            args[1] === 'exists'
              ? true
              : {
                  id: `/subscriptions/${original.plan.subscription.id}/resourceGroups/${original.plan.intent.resourceGroup}`,
                  location: original.plan.region,
                  tags: {
                    'xcsh-managed-by': 'azure-ce',
                    'xcsh-execution-engine': 'terraform',
                    'xcsh-deployment-id': original.plan.deploymentName,
                    'xcsh-plan-sha256': original.plan.planSha256,
                  },
                },
          ),
        };
      return original.api.exec(command, args, options);
    },
  };
  const session = original.runner as unknown as TerraformSession;
  expect(await reconcileAzurePendingVm(original.plan, session, original.storage, api, {})).toBe(true);
  const proof = await readAzureTerraformPendingImportProvenance(original.plan, original.storage, session);
  expect(proof.nativeImportJournalCustodyQualified).toBe(true);
  const path = join(original.storage.directory, 'azure-terraform-pending-vm-import.json');
  const checkpoint = await readFile(path);
  const commands = [...original.commands];
  const counts = original.counts();
  expect(await reconcileAzurePendingVm(original.plan, session, original.storage, api, {})).toBe(true);
  expect(await readFile(path)).toEqual(checkpoint);
  // State observations are allowed on replay, but no new plan/apply/configuration mutation.
  expect(original.commands.slice(commands.length).every((command) => ['version', 'show'].includes(command))).toBe(true);
  expect(original.counts()).toEqual(counts);
  original.restorePendingAllocationHealth();
  return proof;
}
