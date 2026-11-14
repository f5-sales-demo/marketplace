import { expect } from 'bun:test';
import { createHash } from 'node:crypto';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import { canonicalSha256 } from '../../src/ce/canonical';
import { azureTerraformCurrentDeployment } from '../../src/ce/terraform-foundation';
import type { AzureTerraformNetworkAcceptanceVerifier } from '../../src/ce/terraform-network-checkpoint';
import type { AzureTerraformNetworkReplacementCompletedVerifier } from '../../src/ce/terraform-network-replacement-completion';
import type { AzureTerraformNetworkReplacementExecutionDependencies } from '../../src/ce/terraform-network-replacement-execution';
import { bindAzureTerraformNetworkReplacementExecutionJournal } from '../../src/ce/terraform-network-replacement-execution-journal';
import { bindAzureTerraformNetworkReplacementSource } from '../../src/ce/terraform-network-replacement-source-binding';
import { runAzureTerraformReplacement } from '../../src/ce/terraform-replacement';
import type { AzureCeIntent } from '../../src/ce/types';
import { terraformNetworkBoundReplacementFixture } from './terraform-network-bound-replacement-fixture';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export async function networkReplacementExecutorFixture(
  ha = false,
  restore = false,
  seed?: {
    fixture: Omit<
      Awaited<ReturnType<typeof terraformNetworkBoundReplacementFixture>>,
      'dependencies' | 'run' | 'state' | 'session'
    > & { dependencies: { qualifyAcceptance: AzureTerraformNetworkAcceptanceVerifier } };
    newVmId: string;
    replacementVerifier: AzureTerraformNetworkReplacementCompletedVerifier;
  },
  nativePower = false,
  ingress?: AzureCeIntent['ingress'],
) {
  const f =
      seed?.fixture ?? (await terraformNetworkBoundReplacementFixture(ha, restore, nativePower, undefined, ingress)),
    plan = f.input.plan;
  const { binding } = await bindAzureTerraformNetworkReplacementSource(
    plan,
    f.terraform,
    f.store,
    f.api,
    {},
    f.loaders,
    f.input.site,
    f.dependencies.qualifyAcceptance,
    undefined,
    seed?.replacementVerifier,
  );
  const journal = await bindAzureTerraformNetworkReplacementExecutionJournal(
    plan,
    f.store,
    f.loaders,
    f.input.site,
    canonicalSha256(binding),
    f.dependencies.qualifyAcceptance,
    undefined,
    seed?.replacementVerifier,
  );
  const resources = JSON.parse(binding.source).resource,
    selected = plan.intent.replacementNode as number;
  const newVmId = seed?.newVmId ?? '00000000-0000-4000-8000-000000000099';
  const state = {
    tokenMode: '',
    configuration: binding.source,
    phase: 'intact',
    applies: 0,
    reconciles: 0,
    bootstraps: 0,
    loss: '',
    unknown: '',
    unknownAfterRevision: false,
    wrongState: false,
    wrongScope: false,
    tamper: '',
    counter: 0,
    cloudSeen: false,
    collected: [] as string[],
    completedModes: [] as string[],
  };
  const journals = new Map<string, string>();
  const historicalReceipts = new Map<string, PlanReceipt>();
  const deployment = await azureTerraformCurrentDeployment(plan);
  const { configuration: _source, providerLock, ...identity } = deployment;
  const manifestOf = (configurationSha256: string) =>
    canonicalSha256({
      ...identity,
      configurationSha256,
      providerLockSha256: hash(providerLock),
    });
  const api = {
    async exec(...args: Parameters<typeof f.api.exec>) {
      const result = await f.api.exec(...args),
        query = args[1];
      let row = JSON.parse(result.stdout);
      if (query[0] === 'vm' && query[1] === 'list') {
        row = row.map((vm: Record<string, unknown>) => {
          const node = Number(String(vm.name).split('-').at(-1));
          return { ...vm, tags: structuredClone(resources.azurerm_linux_virtual_machine[`node_${node}`].tags) };
        });
        if (state.phase === 'quiesced')
          row = row.filter(
            (vm: Record<string, unknown>) => vm.id !== binding.before.nodes[String(selected)].resourceId,
          );
        if (state.phase === 'launched') {
          const vm = row.find(
            (vm: Record<string, unknown>) => vm.id === binding.before.nodes[String(selected)].resourceId,
          );
          vm.vmId = newVmId;
          vm.tags['xcsh-plan-sha256'] = plan.planSha256;
        }
      } else if (query.slice(0, 3).join(' ') === 'network nic show') {
        const node = Number(String(row.id).match(/-(\d+)-nic/)?.[1]),
          index = Number(String(row.id).match(/nic(\d+)$/)?.[1]);
        row.tags = structuredClone(resources.azurerm_network_interface[`node_${node}_nic_${index}`].tags);
        if (state.phase === 'quiesced' && node === selected) delete row.virtualMachine;
        if (state.tamper === 'late-config') state.cloudSeen = true;
        if (state.tamper === 'primary') row.ipConfigurations[0].primary = false;
      }
      return { ...result, stdout: JSON.stringify(row) };
    },
  };
  const session = {
    async readConfigurationSha256() {
      return hash(state.configuration);
    },
    async readConfiguration(expected: string) {
      expect(hash(state.configuration)).toBe(expected);
      return state.configuration;
    },
    async reviseConfiguration(expected: string, next: string) {
      expect(hash(state.configuration)).toBe(expected);
      state.configuration = next;
      if (state.loss === 'revision') {
        state.loss = '';
        throw Error('lost revision');
      }
      return hash(next);
    },
    async plan(_env: Record<string, string | undefined>, _signal?: AbortSignal, refreshOriginSha256?: string) {
      const desired = JSON.parse(state.configuration).resource.azurerm_linux_virtual_machine[`node_${selected}`];
      const actions = Boolean(desired) === (state.phase !== 'quiesced') ? [] : [desired ? 'create' : 'delete'];
      const receipt: PlanReceipt = {
        schemaVersion: 1,
        engine: 'terraform',
        deploymentId: plan.deploymentName,
        backendIdentity: `local:${plan.deploymentName}`,
        configurationSha256: hash(state.configuration),
        providerLockSha256: binding.providerLockSha256,
        planSha256: hash(String(++state.counter)),
        noChanges: actions.length === 0,
        ...(refreshOriginSha256 === undefined ? {} : { refreshOriginSha256 }),
        changes: actions.length
          ? [
              {
                address: `azurerm_linux_virtual_machine.node_${selected}`,
                type: 'azurerm_linux_virtual_machine',
                actions,
              },
            ]
          : [],
      };
      journals.set(receipt.planSha256, 'planned');
      historicalReceipts.set(receipt.planSha256, structuredClone(receipt));
      return receipt;
    },
    async readPlannedResourceIds(_receipt: PlanReceipt, addresses: string[]) {
      return Object.fromEntries(
        addresses.map((a) => [
          a,
          state.phase === 'quiesced' ? null : binding.before.nodes[String(selected)].resourceId,
        ]),
      );
    },
    // Synthetic session substrate only; native-journal cases replace this with TerraformRunner.
    async readPlanApplicationHistory(receipt: PlanReceipt) {
      expect(historicalReceipts.get(receipt.planSha256)).toEqual(receipt);
      return {
        schemaVersion: 1,
        scope: 'exact-saved-plan-journal-history',
        receiptSha256: canonicalSha256(receipt),
        manifestSha256: manifestOf(hash(state.configuration)),
        matches: [
          {
            location: 'plan-history',
            archiveSha256: hash(`archive:${receipt.planSha256}`),
            state: state.wrongState ? 'unknown' : journals.get(receipt.planSha256),
            journalSha256: hash(`journal:${receipt.planSha256}`),
            savedPlanSha256: receipt.planSha256,
            configurationSha256: receipt.configurationSha256,
            manifestSha256: manifestOf(receipt.configurationSha256),
          },
        ],
        incompleteArchives: 0,
        applicationOutcomeQualified: false,
        retirementQualified: false,
      };
    },
    async readCurrentPlanJournal(expectedConfigurationSha256: string) {
      expect(expectedConfigurationSha256).toBe(hash(state.configuration));
      const receipt = [...historicalReceipts.values()].at(-1);
      return {
        schemaVersion: 1,
        scope: 'current-saved-plan-byte-and-journal-binding',
        state: receipt ? journals.get(receipt.planSha256) : 'absent',
        receipt: structuredClone(receipt),
        manifestSha256: manifestOf(hash(state.configuration)),
        journalSha256: receipt ? hash(`journal:${receipt.planSha256}`) : null,
        savedPlanSha256: receipt?.planSha256 ?? null,
        planSemanticsQualified: false,
        ...(receipt ? { executionSha256: hash('synthetic-refresh-executor'), ordinaryRefreshEnabled: true } : {}),
      };
    },
    async readPlanApplicationState(receipt: PlanReceipt) {
      return state.wrongState ? 'unknown' : journals.get(receipt.planSha256);
    },
    async apply(receipt: PlanReceipt) {
      expect(journals.get(receipt.planSha256)).toBe('planned');
      journals.set(receipt.planSha256, 'applying');
      state.applies++;
      state.phase = receipt.changes[0].actions[0] === 'delete' ? 'quiesced' : 'launched';
      if (state.loss === state.phase) {
        state.loss = '';
        throw Error('lost apply response');
      }
      if (state.tamper === 'after-apply-journal')
        await f.store.write(`${plan.planId}-terraform-network-replacement-execution.json`, {
          ...journal.journal,
          sourceBindingSha256: 'a'.repeat(64),
        });
      journals.set(receipt.planSha256, 'applied');
    },
    async reconcileApplyFromEvidence(receipt: PlanReceipt, evidence: string) {
      expect(evidence).toMatch(/^[a-f0-9]{64}$/);
      expect(journals.get(receipt.planSha256)).toBe('applying');
      journals.set(receipt.planSha256, 'applied');
      state.reconciles++;
    },
    async readOutputs() {
      return {
        ce_instances: Object.fromEntries(
          Object.entries(binding.before.nodes).map(([node, vm]) => [
            node,
            {
              id: vm.resourceId,
              vm_id: Number(node) === selected ? newVmId : vm.vmId,
              site_name: plan.siteName,
              hostname: `${plan.deploymentName}-${node}`,
            },
          ]),
        ),
        ce_interfaces: Object.fromEntries(
          Object.entries(binding.before.nodes).flatMap(([node, vm]) =>
            Object.entries(vm.nics).map(([index, nic]) => [
              `${node}:${index}`,
              {
                id: nic.resourceId,
                subnet_id: nic.subnetId,
                site_name: plan.siteName,
                node: Number(node),
                index: Number(index),
                role: plan.nics[Number(index)].role,
              },
            ]),
          ),
        ),
      };
    },
  } as unknown as TerraformSession;
  const site = { system_metadata: { uid: binding.site.siteUid } };
  const runtime = {
    engine: 'terraform',
    requireBootstrapContract() {},
    requireRoutingContract() {},
    async bootstrap(_binding: unknown, _node: string, token: string, save: (v: unknown) => Promise<void>) {
      state.bootstraps++;
      const jwt = `e30.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.c2lnbmF0dXJl`;
      await save({ tokenName: token, node: `${plan.deploymentName}-${selected}`, siteName: plan.siteName, jwt });
      return `#cloud-config\nwrite_files:\n- path: /etc/vpm/user_data\n  content: |\n    token: ${jwt}\n`;
    },
    async observeIssuedBootstrapToken(owning: { owner: unknown }, node: string, tokenName: string, expected: string) {
      const saved = (await f.store.read(`${tokenName}.json`)) as {
        jwt: string;
        node: string;
        tokenName: string;
        siteName: string;
      };
      expect(saved.node).toBe(node);
      expect(saved.tokenName).toBe(tokenName);
      expect(saved.siteName).toBe(plan.siteName);
      expect(hash(saved.jwt)).toBe(expected);
      if (state.tokenMode === 'unavailable-on-launch' && state.phase === 'quiesced')
        throw Error('synthetic token service unavailable');
      if (state.tokenMode === 'changed-api-token') throw Error('synthetic current token digest mismatch');
      if (state.tokenMode === 'late-private-race')
        await f.store.write(`${tokenName}.json`, { ...saved, jwt: 'e30.e30.Zm9yZWlnbg' });
      return {
        schemaVersion: 1,
        kind: 'ce-issued-bootstrap-current',
        owner: owning.owner,
        node,
        tokenName,
        siteName: plan.siteName,
        tokenSha256: expected,
        expiresAt:
          state.tokenMode === 'expired'
            ? 0
            : JSON.parse(Buffer.from(saved.jwt.split('.')[1], 'base64url').toString()).exp * 1000,
      };
    },
    async observeOwnedSite() {
      return site;
    },
    ownedSiteConfiguration() {
      return f.birth.siteConfiguration;
    },
    async approveRegistrations() {
      return { status: 'healthy' };
    },
    async observeHealth() {
      return { status: 'healthy' };
    },
    async observeRegistrations() {
      return { status: 'healthy' };
    },
    async observeRegisteredConfiguration() {
      return { status: 'configured' };
    },
  } as unknown as CeRuntime;
  const dependencies: AzureTerraformNetworkReplacementExecutionDependencies = {
    loaders: f.loaders,
    site: binding.site,
    journalSha256: journal.journalSha256,
    sourceBindingSha256: canonicalSha256(binding),
    qualifyHistorical: async (...args) => {
      const result = await f.dependencies.qualifyAcceptance(...args);
      if (state.tamper === 'late-config' && state.cloudSeen) {
        state.configuration += '\n';
        state.tamper = 'fired';
      }
      return result;
    },
    async collectOperational(identity, purpose) {
      state.collected.push(purpose);
      if (
        state.unknown === purpose ||
        (purpose === 'preflight' &&
          state.unknownAfterRevision &&
          hash(state.configuration) !== binding.sourceConfigurationSha256)
      )
        throw Error('synthetic operational evidence unavailable');
      if (state.tamper === 'callback-journal')
        await f.store.write(`${plan.planId}-terraform-network-replacement-execution.json`, {
          ...journal.journal,
          sourceBindingSha256: 'a'.repeat(64),
        });
      if (state.tamper === 'final-source' && purpose === 'final') {
        const name = `${plan.planId}-terraform-replacement-source.json`,
          packet = (await f.store.read(name)) as Record<string, unknown>;
        packet.bootstrap = '#cloud-config\nforeign';
        await f.store.write(name, packet);
      }
      return { identity, purpose };
    },
    async qualifyCompletedOperational(receipt, identity, mode) {
      state.completedModes.push(mode);
      expect((receipt as { identity: unknown; purpose: string }).identity).toEqual(identity);
      expect((receipt as { purpose: string }).purpose).toBe('final');
      return { status: 'verified', scope: 'node-interfaces-routing-traffic', evidenceSha256: canonicalSha256(receipt) };
    },
    async qualifyOperational(receipt, identity) {
      expect((receipt as { identity: unknown }).identity).toEqual(identity);
      return {
        status: 'verified',
        scope: state.wrongScope ? 'registration-only' : 'node-interfaces-routing-traffic',
        evidenceSha256: canonicalSha256(receipt),
      } as Awaited<ReturnType<AzureTerraformNetworkReplacementExecutionDependencies['qualifyOperational']>>;
    },
  };
  const terraform = {
    async open() {
      return session;
    },
  };
  const run = (signal?: AbortSignal) =>
    runAzureTerraformReplacement(
      plan,
      terraform,
      runtime,
      f.store,
      api,
      {},
      signal,
      undefined,
      undefined,
      dependencies,
    );
  return { ...f, binding, journal, state, run, dependencies, newVmId, selected, session, executionApi: api };
}
