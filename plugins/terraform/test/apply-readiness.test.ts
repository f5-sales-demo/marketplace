import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import type { CeOwner } from '../../platform/src/ce/runtime';
import type { CePlatformService } from '../../platform/src/ce/service';
import type { CeTerraformServiceOptions } from '../src/service';
import { createCeTerraformService } from '../src/service';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true });
});
test('trusted mutation refusal preserves the exact saved plan without executing or consuming it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'apply-readiness-'));
  roots.push(root);
  const owner: CeOwner = {
    provider: 'gcp',
    engine: 'terraform',
    account: 'example-project',
    region: 'us-central1',
    deploymentId: 'ce-fixture',
  };
  const platform = { storage: (who: CeOwner) => CeDeploymentStore.open(root, who) } as CePlatformService;
  const calls: string[] = [];
  let ready = false;
  const options = {
    assertApplyReady: async () => {
      if (!ready) throw new Error('Original GCP guest capture controller is not qualified');
    },
    execute: async (request: import('../src/runner').Invocation) => {
      calls.push(request.args[0]);
      if (request.args[0] === 'plan')
        await writeFile(join(request.cwd, 'saved.tfplan'), 'fixture-binary', { mode: 0o600 });
      return {
        code: 0,
        stdout:
          request.args[0] === 'version'
            ? JSON.stringify({ terraform_version: '1.16.6' })
            : request.args[0] === 'show'
              ? JSON.stringify({
                  format_version: '1.2',
                  terraform_version: '1.16.6',
                  errored: false,
                  complete: true,
                  applyable: true, // codespell:ignore applyable
                  resource_changes: [
                    {
                      address: 'terraform_data.ce',
                      mode: 'managed',
                      type: 'terraform_data',
                      change: { actions: ['create'] },
                    },
                  ],
                })
              : '',
      };
    },
  };
  const service = createCeTerraformService(async () => platform, options as CeTerraformServiceOptions);
  // A mutable caller cannot replace the trusted callback captured at construction.
  options.assertApplyReady = async () => {};
  const session = await service.open(
    owner,
    {
      schemaVersion: 1,
      deploymentId: owner.deploymentId,
      engine: 'terraform',
      scope: { cloud: 'gcp', account: owner.account, region: owner.region },
      terraformVersion: '1.16.6',
      configuration: '{}',
      providerLock: '# fixture',
      backendIdentity: 'local:ce-fixture',
    },
    false,
  );
  const receipt = await session.plan({});
  const plannedCalls = calls.length;
  await expect(session.apply(receipt, {})).rejects.toThrow('capture controller');
  expect(calls).toHaveLength(plannedCalls);
  expect((await session.readApplyCheckpoint?.(receipt))?.state).toBe('planned');
  ready = true;
  await session.apply(receipt, {});
  expect((await session.readApplyCheckpoint?.(receipt))?.state).toBe('applied');
  expect(calls.filter((command) => command === 'apply')).toHaveLength(1);
});
