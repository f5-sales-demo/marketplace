import { expect } from 'bun:test';
import { readdir } from 'node:fs/promises';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import { canonicalSha256 } from '../../src/ce/canonical';
import { captureAzureNetworkUpdateInventory } from '../../src/ce/network-update';
import type {
  AzureTerraformNetworkAcceptanceIdentity,
  AzureTerraformNetworkAcceptanceVerification,
} from '../../src/ce/terraform-network-checkpoint';
import { runAzureTerraformNetworkUpdate } from '../../src/ce/terraform-network-driver';
import { verifyAzureTerraformNetworkDriverLease } from '../../src/ce/terraform-network-driver-lease';
import type { retireAzureTerraformNetworkCompletedPowerStageInDriver } from '../../src/ce/terraform-network-power-completed-retirement';
import type { AzureTerraformNetworkReplacementCompletedVerifier } from '../../src/ce/terraform-network-replacement-completion';
import type { AzureCeIntent, AzureCePlan } from '../../src/ce/types';
import type { TerraformNetworkFixtureSeed } from './terraform-network-nic-execution-fixture';
import { terraformNetworkSourceFixture } from './terraform-network-source-fixture';
import { networkStageHistoryFixture } from './terraform-network-stage-history-fixture';

export async function terraformNetworkDriverFixture(
  ha = false,
  move = true,
  seed?: TerraformNetworkFixtureSeed & {
    sources?: Map<string, AzureCePlan>;
    originalRecords?: Map<string, unknown>;
    outcomes?: Map<string, Record<string, unknown>>;
    replacementVerifier?: AzureTerraformNetworkReplacementCompletedVerifier;
  },
  routing?: AzureCeIntent['routing'],
  moveSlo = false,
) {
  const first = await networkStageHistoryFixture(1, move, ha, false, seed?.source, seed, routing, moveSlo);
  const original = await terraformNetworkSourceFixture(ha, false, routing);
  const originalRecords = seed?.originalRecords ?? original.records;
  if (seed?.originalRecords) {
    expect([...originalRecords.keys()].sort()).toEqual([...original.records.keys()].sort());
    if (!seed.store) throw Error('native original records require their owning store');
  }
  for (const [name, value] of originalRecords) {
    if (seed?.store) {
      expect(await first.store.read(name)).toEqual(value);
    } else await first.store.write(name, value);
  }
  let active = first;
  const fixtures = new Map([[1, first]]),
    calls: string[] = [],
    observations: string[] = [];
  const state = {
    rejectPurpose: '',
    lostStage: '',
    wrongConfig: false,
    wrongOutput: false,
    unknown: false,
    wrongScope: false,
    cloudUnavailable: false,
    afterStage: undefined as undefined | ((stage: string) => void),
    onOutputs: undefined as undefined | (() => void),
  };
  const api = {
    async exec(...args: Parameters<typeof first.api.exec>) {
      if (state.cloudUnavailable) return { exitCode: 1, stdout: '', stderr: '' };
      const query = args[1];
      if (query[0] === 'vm' && query[1] === 'show') {
        const id = query[query.indexOf('--ids') + 1];
        const node = Number(id?.match(/-(\d+)$/)?.[1]);
        const selected = fixtures.get(node);
        if (selected) return selected.api.exec(...args);
      }
      return active.api.exec(...args);
    },
  };
  const outputs = async () => {
    const inventory = await captureAzureNetworkUpdateInventory(first.plan, api);
    const values = {
      ce_instances: Object.fromEntries(
        Object.entries(inventory.nodes).map(([node, vm]) => [
          node,
          {
            id: vm.resourceId,
            vm_id: vm.vmId,
            site_name: first.plan.siteName,
            hostname: `${first.plan.deploymentName}-${node}`,
          },
        ]),
      ),
      ce_interfaces: Object.fromEntries(
        Object.entries(inventory.nodes).flatMap(([node, vm]) =>
          Object.entries(vm.nics).map(([index, nic]) => [
            `${node}:${index}`,
            {
              id: nic.resourceId,
              node: Number(node),
              index: Number(index),
              role: first.plan.nics[Number(index)].role,
              site_name: first.plan.siteName,
              subnet_id: nic.subnetId,
            },
          ]),
        ),
      ),
    };
    if (state.wrongOutput) values.ce_instances['1'].vm_id = '00000000-0000-4000-8000-000000000099';
    state.onOutputs?.();
    return values;
  };
  const bound = new WeakMap<TerraformSession, Map<PropertyKey, unknown>>();
  const wrongRevision = async () => 'a'.repeat(64);
  const session = new Proxy({} as TerraformSession, {
    get(_target, key) {
      if (key === 'readOutputs') return outputs;
      if (key === 'readConfigurationSha256' && state.wrongConfig) return wrongRevision;
      const value = active.session[key as keyof TerraformSession];
      if (typeof value !== 'function') return value;
      let cache = bound.get(active.session);
      if (!cache) {
        cache = new Map();
        bound.set(active.session, cache);
      }
      if (!cache.has(key)) cache.set(key, value.bind(active.session));
      return cache.get(key);
    },
  });
  const terraform: CeTerraformService = {
    async open(owner) {
      expect(owner).toEqual(first.store.owner);
      return session;
    },
  };
  const loaders = {
    loadSource: async (digest: string) => {
      const source = (seed?.sources ?? original.sources).get(digest);
      if (!source) throw Error('missing source');
      return source;
    },
    loadOutcome: async (plan: typeof first.plan) => {
      const outcome = (seed?.outcomes ?? original.outcomes).get(plan.planSha256);
      if (!outcome) throw Error('missing outcome');
      return outcome;
    },
  };
  const copy = async () => {
    if (active.store === first.store) return;
    for (const name of await readdir(active.store.directory))
      if (name.startsWith(`${first.plan.planId}-terraform-network-node-${active.node}-`))
        await first.store.write(name, await active.store.read(name));
  };
  const preparePowerFixture = async (plan: typeof first.plan, before: typeof first.before, node: number) => {
    expect(plan.planSha256).toBe(first.plan.planSha256);
    if (!fixtures.has(node))
      fixtures.set(
        node,
        await networkStageHistoryFixture(
          node,
          move,
          ha,
          false,
          active.state.configuration,
          { ...seed, plan, inventory: before, source: active.state.configuration, store: first.store },
          routing,
          moveSlo,
        ),
      );
    active = fixtures.get(node) as typeof first;
    Object.assign(active.before, structuredClone(before));
  };
  const dependencies = {
    // Explicit orchestration-test substrate: these older component fixtures have synthetic power
    // sessions, not filesystem runners. They qualify ordering only. The separate multi-stage actual
    // TerraformRunner fixture removes this injection and qualifies the default retirement contract.
    retirePower: (async (lease, plan, node, operation, _terraform, store) => {
      await verifyAzureTerraformNetworkDriverLease(lease, store.directory);
      const digest = canonicalSha256({
        substrate: 'synthetic-orchestration-only',
        planSha256: plan.planSha256,
        node,
        operation,
      });
      return {
        schemaVersion: 1,
        scope: 'selected-completed-network-power-runner-retirement',
        sourcePlanSha256: plan.planSha256,
        node,
        operation,
        stage: `network-${plan.planSha256.slice(0, 24)}-node-${node}-${operation}`,
        graphSha256: digest,
        preparingSha256: digest,
        finalReceiptSha256: digest,
        markerSha256: digest,
        artifactRetirementReceiptSha256: digest,
        wholeAppliedStateEmptyQualified: true,
        independentCleanupQualified: true,
        runnerRetirementQualified: true,
        currentOperationalAcceptanceQualified: false,
        parentRetirementQualified: false,
        retirementQualified: false,
      };
    }) as typeof retireAzureTerraformNetworkCompletedPowerStageInDriver,

    qualifyReplacementCompleted: seed?.replacementVerifier,
    async collectAcceptance(
      expected: AzureTerraformNetworkAcceptanceIdentity,
      purpose: 'preflight' | 'restored' | 'final',
    ) {
      observations.push(`${expected.node}:${purpose}`);
      if (state.rejectPurpose === purpose || state.rejectPurpose === `${purpose}:${expected.node}`)
        throw Error('synthetic operational service unavailable');
      return {
        purpose,
        node: expected.node,
        owner: expected.owner,
        planSha256: expected.planSha256,
        siteUid: expected.siteUid,
        siteConfigurationSha256: expected.siteConfigurationSha256,
        configurationSha256: expected.configurationSha256,
        nodes: expected.inventory.nodes,
      };
    },
    async qualifyAcceptance(
      receipt: unknown,
      expected: AzureTerraformNetworkAcceptanceIdentity,
      mode: 'current' | 'historical',
    ) {
      const row = receipt as Record<string, unknown>;
      expect(row.node).toBe(expected.node);
      expect(row.owner).toEqual(expected.owner);
      expect(row.planSha256).toBe(expected.planSha256);
      expect(row.siteUid).toBe(expected.siteUid);
      expect(row.siteConfigurationSha256).toBe(expected.siteConfigurationSha256);
      expect(row.configurationSha256).toBe(expected.configurationSha256);
      expect(row.nodes).toEqual(expected.inventory.nodes);
      if (mode === 'current' && state.unknown)
        return {
          status: 'unknown',
          scope: 'node-interfaces-routing-traffic',
          evidenceSha256: canonicalSha256(receipt),
        } as unknown as AzureTerraformNetworkAcceptanceVerification;
      return {
        status: 'verified',
        scope: state.wrongScope ? 'site-global-and-registration-only' : 'node-interfaces-routing-traffic',
        evidenceSha256: canonicalSha256(receipt),
      } as AzureTerraformNetworkAcceptanceVerification;
    },
    async runPower(...args: Parameters<NonNullable<Parameters<typeof runAzureTerraformNetworkUpdate>[7]['runPower']>>) {
      const [plan, before, node, operation] = args;
      await preparePowerFixture(plan, before, node);
      calls.push(`${node}:${operation}`);
      const result = await active.power(operation);
      await copy();
      state.afterStage?.(operation);
      if (state.lostStage === operation) {
        state.lostStage = '';
        throw Error('synthetic lost completed stage response');
      }
      return result;
    },
    async runNic(...args: Parameters<NonNullable<Parameters<typeof runAzureTerraformNetworkUpdate>[7]['runNic']>>) {
      const [plan, source, before, node] = args;
      expect(plan.planSha256).toBe(first.plan.planSha256);
      expect(source).toBe(active.source);
      expect(active.node).toBe(node);
      Object.assign(active.before, structuredClone(before));
      calls.push(`${node}:nic`);
      const result = await active.runNic(args[9]);
      await copy();
      state.afterStage?.('nic');
      if (state.lostStage === 'nic') {
        state.lostStage = '';
        throw Error('synthetic lost completed stage response');
      }
      return result;
    },
    async runRouting(
      ...args: Parameters<NonNullable<Parameters<typeof runAzureTerraformNetworkUpdate>[7]['runRouting']>>
    ) {
      const [plan, source, before, current, node] = args;
      expect(plan.planSha256).toBe(first.plan.planSha256);
      expect(source).toBe(active.source);
      expect(active.node).toBe(node);
      expect(current.nodes).toEqual((await captureAzureNetworkUpdateInventory(plan, api)).nodes);
      Object.assign(active.before, structuredClone(before));
      calls.push(`${node}:routing`);
      const result = await active.runRouting(args[9], args[3]);
      await copy();
      state.afterStage?.('routing');
      if (state.lostStage === 'routing') {
        state.lostStage = '';
        throw Error('synthetic lost completed stage response');
      }
      return result;
    },
  };
  const run = (signal?: AbortSignal) =>
    runAzureTerraformNetworkUpdate(
      first.plan,
      terraform,
      first.store,
      api,
      {},
      loaders,
      original.site,
      dependencies,
      signal,
    );
  return {
    ...first,
    fixtures,
    preparePowerFixture,
    state,
    calls,
    observations,
    run,
    terraform,
    dependencies,
    loaders,
    site: original.site,
    api,
    session,
  };
}
