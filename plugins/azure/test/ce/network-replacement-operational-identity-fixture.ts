import { expect } from 'bun:test';
import type { ExpectedCeInterface } from '../../../platform/src/ce/interface-evidence';
import { canonicalSha256 } from '../../src/ce/canonical';
import { collectAzureReplacementOperationalIdentity } from '../../src/ce/network-replacement-operational-identity';
import { observeAzureTerraformNetworkReplacementCurrent } from '../../src/ce/terraform-network-replacement-current';
import type { AzureTerraformNetworkReplacementOperationalIdentity } from '../../src/ce/terraform-network-replacement-execution';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { networkReplacementExecutorFixture } from './terraform-network-replacement-executor-fixture';

type Runtime = Parameters<typeof collectAzureReplacementOperationalIdentity>[2];
export async function replacementOperationalIdentityFixture(ha = false, phase: 'intact' | 'launched' = 'intact') {
  const f = await networkReplacementExecutorFixture(ha),
    plan = f.input.plan;
  f.state.phase = phase;
  const current = await observeAzureTerraformNetworkReplacementCurrent(
    {
      plan,
      retainedPlan: f.network,
      binding: f.binding,
      sourceBindingSha256: canonicalSha256(f.binding),
      phase,
      ...(phase === 'launched' ? { newVmId: f.newVmId } : {}),
    },
    f.executionApi,
  );
  const identity: AzureTerraformNetworkReplacementOperationalIdentity = {
    owner: f.store.owner,
    planSha256: plan.planSha256,
    journalSha256: f.journal.journalSha256,
    sourceBindingSha256: canonicalSha256(f.binding),
    configurationSha256: f.binding.sourceConfigurationSha256,
    site: f.binding.site,
    phase,
    nodes: current.nodes,
  };
  const state = { calls: [] as string[], fault: '', links: 0, registrations: 0, sites: 0, stale: false };
  const binding = azureUpgradeBinding(plan),
    projected = {
      metadata: { name: plan.siteName, namespace: 'system' },
      system_metadata: { uid: identity.site.siteUid },
      spec: f.birth.siteConfiguration,
    },
    runtime = {
      engine: 'terraform',
      ownedSiteConfiguration(_binding: unknown, value: { spec: unknown }) {
        return value.spec;
      },
      async observeOwnedSite() {
        state.calls.push('site');
        state.sites++;
        const value = structuredClone(projected) as { system_metadata: { uid: string } };
        if (state.fault === 'site') value.system_metadata.uid = 'foreign';
        if (state.fault === 'late-cloud' && state.sites === 2)
          f.state.phase = phase === 'intact' ? 'launched' : 'intact';
        if (state.fault === 'late-config' && state.sites === 2) f.state.configuration += '\n';
        return value;
      },
      async observeRegistrations(_binding: unknown, expected: Record<string, string>) {
        state.calls.push('registrations');
        state.registrations++;
        expect(expected).toEqual(
          Object.fromEntries(
            Object.entries(identity.nodes).map(([n, vm]) => {
              if (typeof vm.vmId !== 'string') throw Error('Synthetic present UUID missing');
              return [`${plan.deploymentName}-${n}`, vm.vmId];
            }),
          ),
        );
        const rows = Object.entries(expected).map(([node, instanceId]) => ({
          node,
          instanceId,
          state: 'ONLINE',
          status: 'healthy',
          registration: `registration-${node}`,
        }));
        if (state.fault === 'registration-uuid') rows[0].instanceId = 'foreign';
        if (state.fault === 'old-uuid')
          rows[f.selected - 1].instanceId = f.binding.before.nodes[String(f.selected)].vmId;
        if (state.fault === 'registration-partial') rows.pop();
        if (state.fault === 'registration-duplicate') rows[1] = rows[0];
        if (state.fault === 'registration-race' && state.registrations === 2) rows[0].registration += '-changed';
        return {
          owner: state.fault === 'owner' ? { ...binding.owner, account: 'example-foreign' } : binding.owner,
          siteName: binding.siteName,
          status: state.fault === 'registration-unavailable' ? 'unknown' : 'healthy',
          nodes: rows,
        };
      },
      async observeAzureInterfaces(_binding: unknown, expected: ExpectedCeInterface[]) {
        state.calls.push('interfaces');
        state.links++;
        if (state.fault === 'service') throw Error('SECRET_SENTINEL');
        if (state.fault === 'cancel') return new Promise(() => {});
        const rows = expected.map((row) => ({
          ...row,
          device: row.role === 'slo' ? 'eth0' : 'eth1',
          interfaceName: `${row.node}-${row.role}`,
          mtu: 1500,
          linkUp: true,
          ipv4: null,
        }));
        if (state.fault === 'partial') rows.pop();
        if (state.fault === 'duplicate') rows[1] = rows[0];
        if (state.fault === 'mac') rows[0].mac = '02:00:00:00:00:99';
        if (state.fault === 'node') rows[0].node = 'foreign';
        if (state.fault === 'role') rows[0].role = 'data';
        if (state.fault === 'device') rows[1].device = rows[0].device;
        if (state.fault === 'object') rows[1].interfaceName = rows[0].interfaceName;
        if (state.fault === 'link') Object.assign(rows[0], { linkUp: undefined });
        if (state.fault === 'down') {
          const sli = rows.find((row) => row.role === 'sli');
          if (!sli) throw Error('Synthetic SLI missing');
          sli.linkUp = false;
        }
        if (state.fault === 'links-race' && state.links === 2) rows[0].interfaceName += '-changed';
        return {
          status: state.fault === 'unavailable' ? 'unknown' : state.fault === 'down' ? 'down' : 'observed',
          interfaces: state.fault === 'unavailable' ? [] : rows,
          observedAt: '2020-01-01T00:00:00Z',
          privateRaw: 'SECRET_SENTINEL',
          freshness: 'unqualified',
          canSatisfyInterfaceMutationGate: true,
        };
      },
    } as unknown as Runtime;
  const dependencies = { loaders: f.loaders, qualifyHistorical: f.dependencies.qualifyHistorical };
  const run = (signal?: AbortSignal, purpose: 'preflight' | 'final' = phase === 'intact' ? 'preflight' : 'final') =>
    collectAzureReplacementOperationalIdentity(
      plan,
      identity,
      runtime,
      f.executionApi,
      f.store,
      f.session,
      dependencies,
      purpose,
      signal,
    );
  return {
    ...f,
    plan,
    identity,
    runtime,
    observationState: state,
    observationDependencies: dependencies,
    collect: run,
  };
}
