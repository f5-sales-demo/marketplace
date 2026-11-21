import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { AzExecApi } from '../../src/az/exec';
import { persistAzureNativeSource } from '../../src/ce/native-action-evidence';
import {
  type AzureNativeTeardownPlan,
  compileAzureNativeTeardown,
  runAzureNativeTeardown,
} from '../../src/ce/native-teardown';
import {
  azureNativeBootstrapForAction,
  prepareAzureNativeAdmission,
  recordAzureNativeLaunch,
} from '../../src/ce/native-workflow';
import { compileAzureCePlan } from '../../src/ce/planner';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import type { AzureCePlan } from '../../src/ce/types';
import { intent, observation } from './fixtures';

/** Simulated provider/platform prerequisites; exercises real private enrollment persistence. */
export async function nativeRetirementFixture(
  ha = false,
  overrides?: { source: AzureCePlan; contract: VerifiedIngressContract; drain: AzureNativeTeardownPlan['drain'] },
) {
  const discovered = structuredClone(observation);
  discovered.regions[0].quotaAvailable = 24;
  const source =
    overrides?.source ??
    compileAzureCePlan(
      {
        ...intent,
        engine: 'native',
        topology: { ha },
        nics: [
          ...intent.nics,
          { name: 'sli', role: 'sli', subnet: { mode: 'greenfield', cidr: '10.21.0.0/24', name: 'sli' } },
        ],
      },
      discovered,
    );
  const binding = azureUpgradeBinding(source);
  const root = await mkdtemp(join(tmpdir(), 'native-enrollment-retirement-'));
  const storage = await CeDeploymentStore.open(root, binding.owner);
  const contract = overrides?.contract ?? ({ fingerprint: `sha256:${'b'.repeat(64)}` } as VerifiedIngressContract);
  const siteFingerprint = `sha256:${'a'.repeat(64)}`;
  const order: string[] = [];
  const state = {
    platform: 'absent',
    stale: false,
    foreign: false,
    inventory: [] as unknown[],
    malformed: false,
    failed: false,
  };
  const runtime = {
    engine: 'native',
    contract: { fingerprint: siteFingerprint },
    requireBootstrapContract() {},
    requireRoutingContract() {},
    requireAzureRelayRoutingContract() {},
    async reserveSite(_binding: unknown, save: (record: unknown) => Promise<void>) {
      await save({
        siteName: source.siteName,
        uid: 'site-uid',
        owner: binding.owner,
        contractFingerprint: siteFingerprint,
      });
    },
    async bootstrap(_binding: unknown, node: string, tokenName: string, save: (record: unknown) => Promise<void>) {
      const jwt = 'synthetic.payload.signature';
      await save({ tokenName, siteName: source.siteName, node, jwt });
      return `#cloud-config\nwrite_files:\n  - path: /etc/vpm/user_data\n    content: |\n      token: ${jwt}\n`;
    },
    async drainPlatform() {
      order.push('platform');
      return { status: 'platform-drained' };
    },
    async observeSiteDeletion() {
      return { status: 'deleted' };
    },
    async deleteBootstrapToken() {
      order.push('token');
    },
    async deleteSiteExact() {
      order.push('site');
    },
    async unregisteredAbsence() {
      return {
        status: state.platform,
        owner: state.foreign ? { ...binding.owner, deploymentId: 'foreign' } : binding.owner,
        siteContractFingerprint: siteFingerprint,
        ingressContractFingerprint: contract.fingerprint,
        startedAt: new Date().toISOString(),
        observedAt: new Date(Date.now() - (state.stale ? 120000 : 0)).toISOString(),
        sources: ['/api/test/absence'],
      };
    },
  } as unknown as CeRuntime;
  await persistAzureNativeSource(source, storage);
  const admission = await prepareAzureNativeAdmission(source, runtime, storage);
  for (let node = 1; node <= source.topology.nodeCount; node++) {
    const action = source.actions.find((row) => row.requiresBootstrap && row.node === node);
    if (!action) throw Error('Native fixture has no bootstrap action for the selected node');
    await azureNativeBootstrapForAction(source, action, admission, runtime, storage, undefined, 0);
    await recordAzureNativeLaunch(source, node, admission, storage);
  }
  const groupId = `/subscriptions/${source.subscription.id}/resourceGroups/${source.intent.resourceGroup}`;
  const tags = {
    'xcsh-managed-by': 'azure-ce',
    'xcsh-execution-engine': 'native',
    'xcsh-deployment-id': source.deploymentName,
    'xcsh-plan-sha256': source.planSha256,
  };
  discovered.resources = [
    {
      id: `${groupId}/providers/Microsoft.Compute/virtualMachines/${source.deploymentName}-1`,
      location: source.region,
      exists: true,
      owned: true,
      state: {},
      tags,
    },
    { id: groupId, location: source.region, exists: true, owned: true, state: {}, tags },
  ];
  for (const id of source.intent.brownfield.resourceIds)
    if (!discovered.resources.some((row) => row.id.toLowerCase() === id.toLowerCase()))
      discovered.resources.push({ id, exists: true, owned: false, tags: {}, state: {} });
  const cloud = compileAzureCePlan({ ...source.intent, operation: 'teardown' }, discovered);
  await persistAzureNativeSource(cloud, storage);
  const drain = overrides?.drain ?? {
    schemaVersion: 1 as const,
    owner: binding.owner,
    sourcePlanSha256: source.planSha256,
    siteContractFingerprint: siteFingerprint,
    ingressContractFingerprint: contract.fingerprint,
    listeners: [],
    origins: [],
    sites: [{ binding, siteUid: 'site-uid', routing: [] }],
  };
  const tokens = binding.nodes.map((node, index) => ({
    node,
    name: `${source.deploymentName.slice(0, 40)}-${index + 1}-${source.planSha256.slice(0, 12)}`,
  }));
  const teardown = compileAzureNativeTeardown(source, cloud, drain, [
    { siteName: source.siteName, siteUid: 'site-uid', physicalSiteUid: 'physical-uid', tokens },
  ]);
  await storage.write(`${teardown.planId}.json`, teardown);
  const reads: string[][] = [];
  const api: AzExecApi = {
    async exec(_command, args) {
      reads.push([...args]);
      return {
        exitCode: state.failed ? 1 : 0,
        stderr: '',
        stdout: state.malformed
          ? '{'
          : JSON.stringify(
              args[0] === 'account'
                ? {
                    id: source.subscription.id,
                    tenantId: source.subscription.tenantId,
                    environmentName: source.subscription.cloud,
                    state: 'Enabled',
                  }
                : args[0] === 'group'
                  ? false
                  : state.inventory,
            ),
      };
    },
  };
  const run = (signal?: AbortSignal) =>
    runAzureNativeTeardown(
      source,
      cloud,
      teardown,
      teardown.planSha256,
      runtime,
      contract,
      storage,
      async () => {
        order.push('cloud');
        return { status: 'retired', absence: 'absent' };
      },
      signal,
      api,
    );
  return { source, cloud, root, storage, binding, teardown, runtime, contract, state, api, reads, order, run, tokens };
}
