import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { AzExecApi } from '../../src/az/exec';
import { loadCheckpoint, type SessionManagerLike, savePlanArtifact } from '../../src/ce/artifacts';
import { canonicalSha256 } from '../../src/ce/canonical';
import { compileAzureCePlan } from '../../src/ce/planner';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { executeAzureCeNativeApply } from '../../src/tools/azure-ce-apply';
import { intent, observation } from './fixtures';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture(foreignKey = false, unresolved = false, loseResponse = false) {
  const root = await mkdtemp(join(tmpdir(), 'native-key-execution-'));
  roots.push(root);
  const compiled = compileAzureCePlan(
    { ...intent, engine: 'native', topology: { ha: false }, routing: { mode: 'auto', destinationCidrs: [] } },
    structuredClone(observation),
  );
  const { planId: _id, planSha256: _sha, ...draft } = compiled;
  draft.actions = draft.actions.filter((action) => action.kind === 'vm-create');
  if (unresolved) draft.actions[0].args?.push('probe=__UNRESOLVED_EXECUTION_REFERENCE__');
  const planSha256 = canonicalSha256(draft);
  const plan = { ...draft, planId: `azure-ce-${planSha256.slice(0, 24)}`, planSha256 };
  const action = plan.actions[0];
  const store = await CeDeploymentStore.open(join(root, 'state'), azureUpgradeBinding(plan).owner);
  let sequence = 0;
  const paths = new Map<string, string>();
  const session: SessionManagerLike = {
    getSessionId: () => root,
    getArtifactsDir: () => root,
    getArtifactPath: async (id) => paths.get(id) ?? null,
    saveArtifact: async (content, type) => {
      const id = String(++sequence);
      const p = join(root, `${id.padStart(4, '0')}.${type}.log`);
      await writeFile(p, content, { mode: 0o600 });
      paths.set(id, p);
      return id;
    },
  };
  await savePlanArtifact(session, plan, structuredClone(observation));
  let vm: Record<string, unknown> | undefined;
  let created = false;
  let dispatched = false;
  let createCount = 0;
  let dispatchedKey = '';
  const api: AzExecApi = {
    exec: async (_command, args) => {
      if (args[0] === 'vm' && args[1] === 'create') {
        dispatched = true;
        createCount++;
        const key = args[args.indexOf('--ssh-key-values') + 1];
        expect(args[args.indexOf('--admin-username') + 1]).toBe('azureuser');
        expect(key).toMatch(/^ssh-rsa [A-Za-z0-9+/]+=*$/);
        expect(args.some((arg) => /__\w+__/.test(arg))).toBe(false);
        dispatchedKey = key;
        created = true;
        const group = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}`;
        vm = {
          id: action.resourceId,
          name: `${plan.deploymentName}-1`,
          location: plan.region,
          vmId: '00000000-0000-0000-0000-000000000081',
          tags: {
            'xcsh-managed-by': 'azure-ce',
            'xcsh-execution-engine': 'native',
            'xcsh-deployment-id': plan.deploymentName,
            'xcsh-plan-sha256': plan.planSha256,
          },
          hardwareProfile: { vmSize: plan.vm.size },
          networkProfile: {
            networkInterfaces: plan.nics.map((nic) => ({
              id: `${group}/providers/Microsoft.Network/networkInterfaces/${plan.deploymentName}-1-nic${nic.index}`,
            })),
          },
          storageProfile: {
            imageReference: {
              publisher: plan.image.publisher,
              offer: plan.image.offer,
              sku: plan.image.plan,
              version: plan.image.version,
            },
          },
          plan: { publisher: plan.image.publisher, product: plan.image.offer, name: plan.image.plan },
          osProfile: {
            adminUsername: 'azureuser',
            linuxConfiguration: {
              disablePasswordAuthentication: true,
              ssh: {
                publicKeys: [
                  {
                    path: posix.join('/home', 'azureuser', '.ssh', 'authorized_keys'),
                    keyData: foreignKey ? 'synthetic-foreign-key' : key,
                  },
                ],
              },
            },
          },
        };
        if (loseResponse && createCount === 1) throw Error('Synthetic VM response lost');
        return { exitCode: 0, stdout: '{}', stderr: '' };
      }
      if ((args[0] === 'resource' || args[0] === 'vm') && args[1] === 'show')
        return vm
          ? { exitCode: 0, stdout: JSON.stringify(vm), stderr: '' }
          : { exitCode: 1, stdout: '', stderr: '(ResourceNotFound) not found\nCode: ResourceNotFound' };
      throw Error('Unexpected fixture command');
    },
  };
  const platform = async () =>
    ({
      storage: async () => store,
      runtime: async () => ({
        engine: 'native',
        requireBootstrapContract() {},
        requireRoutingContract() {},
        requireAzureRelayRoutingContract() {},
        reserveSite: async (_binding: unknown, checkpoint: (value: unknown) => Promise<void>) =>
          checkpoint({
            siteName: plan.siteName,
            uid: '00000000-0000-0000-0000-000000000099',
            owner: store.owner,
            contractFingerprint: `sha256:${'a'.repeat(64)}`,
          }),
        bootstrap: async () => '#cloud-config\nwrite_files:\n - path: /etc/vpm/user_data\n',
      }),
    }) as unknown as CePlatformService;
  const run = () =>
    executeAzureCeNativeApply(
      { planId: plan.planId, planSha256: plan.planSha256 },
      { cwd: root, hasUI: true, ui: { confirm: async () => true }, sessionManager: session },
      api,
      platform,
      undefined,
      { observe: async () => structuredClone(observation) },
    );
  return {
    plan,
    store,
    session,
    root,
    platform,
    run,
    created: () => created,
    dispatched: () => dispatched,
    createCount: () => createCount,
    key: () => dispatchedKey,
  };
}

test('actual native executor resolves and sends the owned public key before checkpointing VM creation', async () => {
  const f = await fixture();
  const result = await f.run();
  expect(f.created()).toBe(true);
  expect(result.checkpoint.state).toBe('complete');
  const record = (await f.store.read(`native-vm-auth-${f.plan.planSha256}-1.json`)) as Record<string, unknown>;
  expect(record.phase).toBe('installed');
  expect(record.publicKey).toBe(f.key());
});

test('actual native executor leaves VM creation incomplete when provider key identity differs', async () => {
  const f = await fixture(true);
  await expect(f.run()).rejects.toThrow(/authentication.*key identity/i);
  expect(f.created()).toBe(true);
  const checkpoint = await loadCheckpoint(f.session, f.plan);
  expect(checkpoint?.state).toBe('partial');
  expect(checkpoint?.completedActionIds).toEqual([]);
});

test('rejects an unresolved execution reference before dispatching a VM creation command', async () => {
  const f = await fixture(false, true);
  await expect(f.run()).rejects.toThrow(/unresolved execution reference/i);
  expect(f.dispatched()).toBe(false);
});

test('lost VM-create response verifies installed credential identity before completing recovery without replay', async () => {
  const f = await fixture(false, false, true);
  await expect(f.run()).rejects.toThrow(/response lost/i);
  const result = await f.run();
  expect(result.checkpoint.state).toBe('complete');
  expect(f.createCount()).toBe(1);
  const record = (await f.store.read(`native-vm-auth-${f.plan.planSha256}-1.json`)) as Record<string, unknown>;
  expect(record.phase).toBe('installed');
});

import { Type } from '@sinclair/typebox';
import type { PluginInterface } from '../../src/az/types';
import { AzureNativeCommandFailure } from '../../src/ce/native-command-failure';
import { createAzureCeApplyTool } from '../../src/tools/azure-ce-apply';

test('public native resume preserves a direct safe MFA category and its unfinished checkpoint', async () => {
  const f = await fixture(false, false, true);
  await expect(f.run()).rejects.toThrow(/response lost/i);
  const before = canonicalSha256(await loadCheckpoint(f.session, f.plan));
  const api: AzExecApi = {
    exec: async () => {
      throw new AzureNativeCommandFailure('resume-observation', {
        exitCode: 1,
        stderr: 'AADSTS50076 synthetic-private-marker',
      });
    },
  };
  const tool = createAzureCeApplyTool({ typebox: { Type } } as unknown as PluginInterface, () => api, {
    platform: async () => f.platform(),
    terraform: async () => {
      throw Error('Unexpected Terraform engine acquisition');
    },
  });
  const result = await tool.execute(
    'native-direct-mfa',
    { planId: f.plan.planId, planSha256: f.plan.planSha256 },
    AbortSignal.timeout(15_000),
    undefined,
    { cwd: f.root, hasUI: true, ui: { confirm: async () => true }, sessionManager: f.session },
  );
  expect(result.isError).toBe(true);
  expect(result.details.errorType).toBe('auth_required');
  expect(result.details.vendorCode).toBe('AADSTS50076');
  expect(JSON.stringify(result)).not.toContain('synthetic-private-marker');
  expect(canonicalSha256(await loadCheckpoint(f.session, f.plan))).toBe(before);
  expect(f.createCount()).toBe(1);
});
