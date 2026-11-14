import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import type { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import { buildSiteUpgradeRequest, type SiteUpgradeIntent } from '../../../platform/src/ce/wire-upgrade';
import { canonicalSha256 } from '../../src/ce/canonical';
import { compileAzureCePlan } from '../../src/ce/planner';
import { azureUpgradeBinding, prepareAzureTerraformUpgrade } from '../../src/ce/terraform-upgrade';
import { intent, observation } from './fixtures';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const contract = {
  fingerprint: `sha256:${'a'.repeat(64)}`,
  build: (input: Parameters<typeof buildSiteUpgradeRequest>[0]) => buildSiteUpgradeRequest(input, () => {}),
} as unknown as VerifiedUpgradeContract;
async function fixture(
  target: Pick<SiteUpgradeIntent, 'kind' | 'version'> = { kind: 'software', version: 'crt-20260201-0179' },
) {
  const base = compileAzureCePlan({ ...intent, engine: 'terraform' }, observation);
  const binding = azureUpgradeBinding(base);
  const upgrade = await prepareAzureTerraformUpgrade(
    base,
    target,
    {
      observeUpgrade: async () => ({
        owner: binding.owner,
        nodes: binding.nodes,
        siteName: binding.siteName,
        source: `/api/config/namespaces/system/sites/${binding.siteName}`,
        siteUid: 'logical-one',
        physicalSiteUid: 'physical-one',
        contractFingerprint: contract.fingerprint,
        siteContractFingerprint: `sha256:${'b'.repeat(64)}`,
        status: 'observed' as const,
        startedAt: new Date().toISOString(),
        observedAt: new Date().toISOString(),
        targetSoftware: target.kind === 'software' ? target.version : 'crt-20260201-0178',
        online: true,
        siteState: 'ONLINE',
        software: {
          installed: 'crt-20260201-0178',
          available: 'crt-20260201-0179',
          phase: 'UPGRADE_COMPLETED',
          result: 'Completed',
        },
        os: { installed: '9.2026.14', available: '9.2026.17', phase: 'UPGRADE_COMPLETED', result: 'success' },
        targets: ['crt-20260201-0179'],
        targetSoftwareListed: true,
        prechecks: { checks: [{ name: 'nodes', status: 'CHECKLIST_PASSED' }], passing: true },
        progress: { status: 'COMPLETED', version: 'crt-20260201-0178' },
        sources: { site: '', targets: '', precheck: '', progress: '' },
        nodeHealth: 'unknown' as const,
        routing: 'unknown' as const,
        traffic: 'unknown' as const,
      }),
    },
    contract,
  );
  const action = {
    schemaVersion: 1,
    engine: 'terraform',
    deploymentId: base.deploymentName,
    backendIdentity: upgrade.deployment.backendIdentity,
    configurationSha256: hash(upgrade.deployment.configuration),
    providerLockSha256: hash(upgrade.deployment.providerLock),
    planSha256: 'c'.repeat(64),
    changes: [],
    noChanges: false,
    actionInvocations: [upgrade.action],
  };
  const records = new Map<string, unknown>([
    [`${upgrade.planId}.json`, upgrade],
    [
      `${upgrade.planId}-authorization.json`,
      {
        schemaVersion: 2,
        engine: 'terraform',
        sourcePlanSha256: base.planSha256,
        upgradePlanSha256: upgrade.planSha256,
        mutations: true,
      },
    ],
    [
      `${upgrade.planId}-checkpoint.json`,
      {
        schemaVersion: 2,
        engine: 'terraform',
        sourcePlanSha256: base.planSha256,
        upgradePlanSha256: upgrade.planSha256,
        phase: 'complete',
        actionPlanSha256: action.planSha256,
      },
    ],
    [`${upgrade.planId}-action-plan.json`, action],
    [
      `${upgrade.planId}-receipt.json`,
      {
        status: 'upgrade-complete',
        engine: 'terraform',
        planId: upgrade.planId,
        planSha256: upgrade.planSha256,
        siteName: binding.siteName,
        target: upgrade.expectation.target,
        actionPlanSha256: action.planSha256,
        observedAt: new Date().toISOString(),
        nodeHealth: 'unknown',
        routing: 'unknown',
        traffic: 'unknown',
      },
    ],
    [
      'terraform-ce-upgrade-serial.json',
      {
        schemaVersion: 2,
        engine: 'terraform',
        status: 'idle',
        lastPlanId: upgrade.planId,
        lastPlanSha256: upgrade.planSha256,
      },
    ],
  ]);
  return {
    base,
    upgrade,
    records,
    context: {
      siteUid: upgrade.expectation.siteUid,
      physicalSiteUid: upgrade.expectation.physicalSiteUid,
      siteContractFingerprint: upgrade.expectation.siteContractFingerprint,
    },
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function change(f: Fixture, suffix: string, edit: (row: Record<string, unknown>) => void) {
  const name = suffix === 'serial' ? 'terraform-ce-upgrade-serial.json' : `${f.upgrade.planId}${suffix}.json`;
  const row = structuredClone(f.records.get(name)) as Record<string, unknown>;
  edit(row);
  f.records.set(name, row);
}
test('read-only Terraform upgrade root history authenticates all lifecycle records and rejects malformed joins', async () => {
  const module = await import('../../src/ce/terraform-upgrade-artifact-provenance').catch(() => null);
  expect(typeof module?.verifyAzureTerraformUpgradeHistoricalArtifacts).toBe('function');
  if (!module) throw Error('Read-only Terraform upgrade root history implementation required');
  const verify = module.verifyAzureTerraformUpgradeHistoricalArtifacts;
  for (const target of [
    { kind: 'software', version: 'crt-20260201-0179' },
    { kind: 'os', version: '9.2026.17' },
  ] as Array<Pick<SiteUpgradeIntent, 'kind' | 'version'>>) {
    const f = await fixture(target),
      before = canonicalSha256([...f.records]);
    const proof = await verify(f.base, f.context, contract, f.records);
    expect(proof.rootArtifacts).toHaveLength(6);
    expect(proof.sources.get(f.upgrade.planId)).toEqual(f.upgrade);
    expect(proof.stageRetirementPaths).toEqual([]);
    expect(canonicalSha256([...f.records])).toBe(before);
    for (const row of proof.rootArtifacts) expect(row.packetSha256).toBe(canonicalSha256(f.records.get(row.path)));
  }
  const planned = await fixture();
  for (const name of [...planned.records.keys()])
    if (name !== `${planned.upgrade.planId}.json`) planned.records.delete(name);
  expect((await verify(planned.base, planned.context, contract, planned.records)).rootArtifacts).toHaveLength(1);
  const ready = await fixture();
  change(ready, '-checkpoint', (row) => {
    row.phase = 'ready';
    delete row.actionPlanSha256;
  });
  for (const suffix of ['-action-plan', '-receipt']) ready.records.delete(`${ready.upgrade.planId}${suffix}.json`);
  ready.records.delete('terraform-ce-upgrade-serial.json');
  expect((await verify(ready.base, ready.context, contract, ready.records)).rootArtifacts).toHaveLength(3);
  const submitted = await fixture();
  change(submitted, '-checkpoint', (row) => {
    row.phase = 'submitted';
  });
  submitted.records.delete(`${submitted.upgrade.planId}-receipt.json`);
  submitted.records.set('terraform-ce-upgrade-serial.json', {
    schemaVersion: 2,
    engine: 'terraform',
    status: 'active',
    activePlanId: submitted.upgrade.planId,
    activePlanSha256: submitted.upgrade.planSha256,
  });
  expect((await verify(submitted.base, submitted.context, contract, submitted.records)).rootArtifacts).toHaveLength(5);
  const faults: Array<(f: Fixture) => void> = [
    (f) =>
      change(f, '-authorization', (r) => {
        r.engine = 'native';
      }),
    (f) =>
      change(f, '-authorization', (r) => {
        r.mutations = false;
      }),
    (f) =>
      change(f, '-authorization', (r) => {
        r.foreign = true;
      }),
    (f) =>
      change(f, '-checkpoint', (r) => {
        r.phase = 'missing';
      }),
    (f) =>
      change(f, '-checkpoint', (r) => {
        r.actionPlanSha256 = 'd'.repeat(64);
      }),
    (f) =>
      change(f, '-checkpoint', (r) => {
        r.phase = 'ready';
      }),
    (f) =>
      change(f, '-action-plan', (r) => {
        r.backendIdentity = 'local:foreign';
      }),
    (f) =>
      change(f, '-action-plan', (r) => {
        r.configurationSha256 = 'd'.repeat(64);
      }),
    (f) =>
      change(f, '-action-plan', (r) => {
        r.providerLockSha256 = 'd'.repeat(64);
      }),
    (f) =>
      change(f, '-action-plan', (r) => {
        r.noChanges = true;
      }),
    (f) =>
      change(f, '-action-plan', (r) => {
        r.operation = 'destroy';
      }),
    (f) =>
      change(f, '-action-plan', (r) => {
        r.imports = [];
      }),
    (f) =>
      change(f, '-action-plan', (r) => {
        r.relinquishments = [];
      }),
    (f) =>
      change(f, '-action-plan', (r) => {
        r.actionInvocations = [];
      }),
    (f) =>
      change(f, '-action-plan', (r) => {
        r.changes = [{ address: 'foreign', type: 'foreign', actions: ['delete'] }];
      }),
    (f) =>
      change(f, '-action-plan', (r) => {
        r.foreign = true;
      }),
    (f) =>
      change(f, '-receipt', (r) => {
        r.actionPlanSha256 = 'd'.repeat(64);
      }),
    (f) =>
      change(f, '-receipt', (r) => {
        r.siteName = 'foreign';
      }),
    (f) =>
      change(f, '-receipt', (r) => {
        r.target = { kind: 'software', version: 'foreign' };
      }),
    (f) =>
      change(f, '-receipt', (r) => {
        r.observedAt = 'malformed';
      }),
    (f) =>
      change(f, '-receipt', (r) => {
        r.observedAt = new Date(Date.now() + 60000).toISOString();
      }),
    (f) =>
      change(f, '-receipt', (r) => {
        r.nodeHealth = 'observed';
      }),
    (f) =>
      change(f, 'serial', (r) => {
        r.lastPlanSha256 = 'd'.repeat(64);
      }),
    (f) =>
      change(f, 'serial', (r) => {
        r.lastPlanId = `azure-ce-upgrade-${'d'.repeat(24)}`;
      }),
    (f) =>
      change(f, 'serial', (r) => {
        r.activePlanId = f.upgrade.planId;
      }),
    (f) =>
      change(f, '', (r) => {
        r.engine = 'native';
      }),
    (f) => {
      f.context.siteUid = 'foreign';
    },
    (f) => {
      f.context.physicalSiteUid = 'foreign';
    },
    (f) => {
      f.context.siteContractFingerprint = `sha256:${'d'.repeat(64)}`;
    },
    (f) => {
      f.records.set(`${f.upgrade.planId}-foreign.json`, { schemaVersion: 1 });
    },
    (f) => {
      f.records.set(`azure-ce-upgrade-${'d'.repeat(24)}.json`, f.upgrade);
    },
    ...['-authorization', '-checkpoint', '-action-plan', '-receipt', 'serial'].map((suffix) => (f: Fixture) => {
      f.records.delete(suffix === 'serial' ? 'terraform-ce-upgrade-serial.json' : `${f.upgrade.planId}${suffix}.json`);
    }),
  ];
  for (const fault of faults) {
    const f = await fixture();
    fault(f);
    await expect(verify(f.base, f.context, contract, f.records)).rejects.toThrow();
  }
  const f = await fixture();
  await expect(verify(f.base, f.context, undefined, f.records)).rejects.toThrow();
});
