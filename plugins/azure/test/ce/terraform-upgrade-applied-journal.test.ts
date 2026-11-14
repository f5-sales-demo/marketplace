import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import { buildSiteUpgradeRequest, type SiteUpgradeIntent } from '../../../platform/src/ce/wire-upgrade';
import type { TerraformSession } from '../../../terraform/src/service';
import { canonicalSha256 } from '../../src/ce/canonical';
import { compileAzureCePlan } from '../../src/ce/planner';
import { azureUpgradeBinding, prepareAzureTerraformUpgrade } from '../../src/ce/terraform-upgrade';
import {
  qualifyAzureTerraformUpgradeAppliedJournal,
  recheckAzureTerraformUpgradeAppliedJournal,
} from '../../src/ce/terraform-upgrade-applied-journal';
import { intent, observation } from './fixtures';

const hash = (s: string | Uint8Array) => createHash('sha256').update(s).digest('hex');
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
async function nativeRootFixture() {
  const f = await fixture();
  const root = await mkdtemp(join(tmpdir(), 'upgrade-applied-journal-'));
  const store = await CeDeploymentStore.open(root, azureUpgradeBinding(f.base).owner);
  for (const [name, value] of f.records) await store.write(name, value);
  const action = f.records.get(`${f.upgrade.planId}-action-plan.json`) as Record<string, unknown>;
  const { configuration, providerLock, ...identity } = f.upgrade.deployment;
  const manifestSha256 = canonicalSha256({
    ...identity,
    configurationSha256: hash(configuration),
    providerLockSha256: hash(providerLock),
  });
  const history = {
    schemaVersion: 1,
    scope: 'exact-saved-plan-journal-history',
    receiptSha256: canonicalSha256(action),
    manifestSha256,
    matches: [
      {
        location: 'plan-history',
        archiveSha256: 'd'.repeat(64),
        state: 'applied',
        journalSha256: 'e'.repeat(64),
        savedPlanSha256: action.planSha256,
        configurationSha256: action.configurationSha256,
        manifestSha256,
      },
    ],
    incompleteArchives: 0,
    applicationOutcomeQualified: false,
    retirementQualified: false,
  };
  const session = { readPlanApplicationHistory: async () => structuredClone(history) } as unknown as TerraformSession;
  const run = () => qualifyAzureTerraformUpgradeAppliedJournal(f.base, f.upgrade, f.context, contract, store, session);
  return {
    ...f,
    root,
    store,
    session,
    history: history as Record<string, unknown>,
    run,
    close: () => rm(root, { recursive: true }),
  };
}
test('upgrade applied journal preserves exact native roots and rejects malformed or foreign custody', async () => {
  const f = await nativeRootFixture();
  try {
    const before = await Promise.all(
      [...f.records.keys()].map(async (name) => [name, hash(await readFile(join(f.store.directory, name)))]),
    );
    const proof = await f.run();
    expect(proof.journalCustodyQualified).toBe(true);
    expect(proof.applicationOutcomeQualified).toBe(false);
    expect(proof.retirementQualified).toBe(false);
    expect(proof.currentOperationalAcceptanceQualified).toBe(false);
    expect(proof.files).toHaveLength(6);
    expect(proof.historySha256).toBe(canonicalSha256(f.history));
    expect(proof.actionReceiptSha256).toBe(canonicalSha256(f.records.get(`${f.upgrade.planId}-action-plan.json`)));
    await recheckAzureTerraformUpgradeAppliedJournal(proof, f.base, f.upgrade, f.context, contract, f.store, f.session);
    expect(
      await Promise.all(
        [...f.records.keys()].map(async (name) => [name, hash(await readFile(join(f.store.directory, name)))]),
      ),
    ).toEqual(before);
    await expect(
      recheckAzureTerraformUpgradeAppliedJournal(
        structuredClone(proof),
        f.base,
        f.upgrade,
        f.context,
        contract,
        f.store,
        f.session,
      ),
    ).rejects.toThrow('owning applied journal witness required');
    const source = join(f.store.directory, `${f.upgrade.planId}.json`),
      replacement = `${source}.replacement`;
    await writeFile(replacement, await readFile(source), { mode: 0o600 });
    await rename(replacement, source);
    await expect(
      recheckAzureTerraformUpgradeAppliedJournal(proof, f.base, f.upgrade, f.context, contract, f.store, f.session),
    ).rejects.toThrow('owning witness or root custody changed');
  } finally {
    await f.close();
  }
  const historyFaults: Array<(h: Record<string, unknown>) => void> = [
    (h) => {
      h.scope = 'foreign';
    },
    (h) => {
      h.schemaVersion = 2;
    },
    (h) => {
      h.receiptSha256 = 'f'.repeat(64);
    },
    (h) => {
      h.manifestSha256 = 'f'.repeat(64);
    },
    (h) => {
      h.incompleteArchives = 1;
    },
    (h) => {
      h.applicationOutcomeQualified = true;
    },
    (h) => {
      h.retirementQualified = true;
    },
    (h) => {
      h.matches = [];
    },
    (h) => {
      h.foreign = true;
    },
    (h) => {
      delete h.incompleteArchives;
    },
    ...[
      'state',
      'location',
      'archiveSha256',
      'journalSha256',
      'savedPlanSha256',
      'configurationSha256',
      'manifestSha256',
    ].map((key) => (h: Record<string, unknown>) => {
      const m = (h.matches as Array<Record<string, unknown>>)[0];
      m[key] = 'foreign';
    }),
    (h) => {
      const m = (h.matches as Array<Record<string, unknown>>)[0];
      m.state = 'planned';
    },
    (h) => {
      const m = (h.matches as Array<Record<string, unknown>>)[0];
      m.state = 'applying';
    },
    (h) => {
      const m = h.matches as Array<Record<string, unknown>>;
      m.push(structuredClone(m[0]));
    },
    (h) => {
      const m = (h.matches as Array<Record<string, unknown>>)[0];
      m.foreign = true;
    },
  ];
  for (const fault of historyFaults) {
    const f = await nativeRootFixture();
    try {
      fault(f.history);
      await expect(f.run()).rejects.toThrow('Azure upgrade applied journal:');
    } finally {
      await f.close();
    }
  }
  for (const fault of ['ready', 'active', 'site', 'observer', 'malformed'] as const) {
    const f = await nativeRootFixture();
    try {
      if (fault === 'ready') {
        change(f, '-checkpoint', (row) => {
          row.phase = 'ready';
          delete row.actionPlanSha256;
        });
        await f.store.write(
          `${f.upgrade.planId}-checkpoint.json`,
          f.records.get(`${f.upgrade.planId}-checkpoint.json`),
        );
      }
      if (fault === 'active') {
        change(f, 'serial', (row) => {
          row.status = 'active';
          row.activePlanId = f.upgrade.planId;
          row.activePlanSha256 = f.upgrade.planSha256;
        });
        await f.store.write('terraform-ce-upgrade-serial.json', f.records.get('terraform-ce-upgrade-serial.json'));
      }
      if (fault === 'site') f.context.physicalSiteUid = 'foreign';
      if (fault === 'observer') Reflect.deleteProperty(f.session, 'readPlanApplicationHistory');
      if (fault === 'malformed')
        await writeFile(join(f.store.directory, `${f.upgrade.planId}.json`), '{malformed', { mode: 0o600 });
      await expect(f.run()).rejects.toThrow();
    } finally {
      await f.close();
    }
  }
  for (const fault of ['contract', 'site', 'history'] as const) {
    const f = await nativeRootFixture();
    const originalBuild = contract.build;
    try {
      if (fault === 'history') {
        const proof = await f.run();
        (f.history.matches as Array<Record<string, unknown>>)[0].state = 'planned';
        await expect(
          recheckAzureTerraformUpgradeAppliedJournal(proof, f.base, f.upgrade, f.context, contract, f.store, f.session),
        ).rejects.toThrow('native applied journal occurrence required');
      } else {
        f.session.readPlanApplicationHistory = async () => {
          if (fault === 'contract')
            Reflect.set(contract, 'build', () => {
              throw Error('changed method');
            });
          else f.context.siteUid = 'changed';
          return structuredClone(f.history) as Awaited<
            ReturnType<NonNullable<TerraformSession['readPlanApplicationHistory']>>
          >;
        };
        await expect(f.run()).rejects.toThrow('owning input or dependency changed');
      }
    } finally {
      Reflect.set(contract, 'build', originalBuild);
      await f.close();
    }
  }
  const aborted = await nativeRootFixture();
  try {
    const controller = new AbortController();
    controller.abort(Error('fixture cancelled'));
    await expect(
      qualifyAzureTerraformUpgradeAppliedJournal(
        aborted.base,
        aborted.upgrade,
        aborted.context,
        contract,
        aborted.store,
        aborted.session,
        controller.signal,
      ),
    ).rejects.toThrow('fixture cancelled');
  } finally {
    await aborted.close();
  }
});
