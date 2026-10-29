import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { storeBootstrapToken } from '../../../platform/src/ce/token-store';
import { independentRetirementFixture } from '../../../terraform/test/fixtures/independent-retirement';
import { canonicalSha256 } from '../../src/ce/canonical';
import { compileAzureCePlan } from '../../src/ce/planner';
import { azureTerraformCurrentDeployment, azureTerraformFoundationDeployment } from '../../src/ce/terraform-foundation';
import {
  publishAzureTerraformOriginalReceipt,
  readAzureTerraformOriginalReceiptInventory,
} from '../../src/ce/terraform-original-receipt-inventory';
import { retireAzureTerraformParentArtifacts } from '../../src/ce/terraform-parent-retirement';
import { beginAzureTerraformRetirement } from '../../src/ce/terraform-retirement';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { intent, observation } from './fixtures';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
for (const fault of [
  'missing-terminal-payload',
  'changed-terminal-payload',
  'rehashed-terminal-payload',
  'interrupted-terminal-payload',
  'terminal-changed-after-read',
  'none',
  'original-metadata',
  'original-metadata-interrupted',
  'original-metadata-partial',
  'original-metadata-foreign',
  'original-metadata-inode',
  'original-metadata-late',
  'original-metadata-digest',
  'original-metadata-bootstrap',
  'original-metadata-owner',
  'original-metadata-fragments',
  'original-metadata-fragment-foreign',
  'original-metadata-fragment-unknown',
  'missing-independent',
  'unknown',
  'public-update',
  'public-update-prepared',
  'foreign-public-update',
  'malformed-public-update',
  'foreign-public-update-plan',
  'foreign-runner',
  'changed-artifact',
  'identical-byte-artifact',
  'interrupted',
  'reconciliation',
  'foreign-reconciliation',
  'malformed-reconciliation',
  'owned-reconciliation',
  'foreign-owned-reconciliation',
] as const) {
  test(`Azure parent retirement ${fault}`, async () => {
    const base = compileAzureCePlan({ ...intent, engine: 'terraform' }, observation),
      binding = azureUpgradeBinding(base);
    const root = await mkdtemp(join(tmpdir(), 'azure-parent-retirement-'));
    roots.push(root);
    const store = await CeDeploymentStore.open(root, binding.owner);
    const teardown = {
      kind: 'azure-ce-terraform-teardown',
      sourcePlanSha256: base.planSha256,
      planSha256: 'a'.repeat(64),
      planId: 'azure-ce-teardown-fixture',
      drain: { siteContractFingerprint: 'fingerprint' },
      retirement: [
        { siteName: base.siteName, siteUid: 'site-uid', tokens: [{ node: binding.nodes[0], name: 'token-one' }] },
      ],
    };
    await store.write(`${teardown.planId}.json`, teardown);
    await store.write(`${teardown.planId}-authorization.json`, {
      schemaVersion: 1,
      engine: 'terraform',
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: teardown.planSha256,
      mutations: true,
    });
    await beginAzureTerraformRetirement(base, teardown, store);
    const retirementEvidence = { platform: { status: 'absent', owner: binding.owner }, cloud: { status: 'absent' } };
    const evidence = canonicalSha256(retirementEvidence),
      finalPlan = 'c'.repeat(64),
      deployment = await azureTerraformCurrentDeployment(base);
    const { configuration, providerLock, ...rest } = deployment,
      hash = (value: string) => createHash('sha256').update(value).digest('hex');
    const manifest = { ...rest, configurationSha256: hash(configuration), providerLockSha256: hash(providerLock) };
    const marker = {
      schemaVersion: 1,
      status: 'runner-artifacts-retired',
      manifestSha256: fault === 'foreign-runner' ? 'd'.repeat(64) : canonicalSha256(manifest),
      evidenceSha256: evidence,
      finalPlanSha256: finalPlan,
      planReceiptSha256: canonicalSha256({ planSha256: finalPlan }),
      artifacts: [],
      inventorySha256: hash('[]'),
    };
    if (fault !== 'missing-independent')
      Object.assign(
        marker,
        independentRetirementFixture({
          manifestSha256: marker.manifestSha256,
          evidenceSha256: evidence,
          finalPlanSha256: finalPlan,
          planReceiptSha256: marker.planReceiptSha256,
        }),
      );
    const runner = join(store.directory, base.deploymentName);
    await mkdir(runner, { mode: 0o700 });
    await writeFile(join(runner, 'deployment.json'), JSON.stringify(manifest), { mode: 0o600 });
    await writeFile(join(runner, 'artifact-retirement.json'), JSON.stringify(marker), { mode: 0o600 });
    await store.write('azure-terraform-terminal-cleanup.json', {
      phase: 'retired',
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: teardown.planSha256,
      retirementEvidence,
      retirementEvidenceSha256: evidence,
      final: { planSha256: finalPlan },
      artifacts: { ...marker, retiredArtifacts: 0 },
    });
    await store.write('terraform-workflow.json', {
      bootstrapByNode: {
        [binding.nodes[0]]: [{}, { sub: 'fixture' }, 'signature']
          .map((value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url'))
          .join('.'),
      },
    });
    await store.write('token-one.json', {
      tokenName: 'token-one',
      siteName: base.siteName,
      node: binding.nodes[0],
      jwt: [{}, { sub: 'fixture' }, 'signature']
        .map((value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url'))
        .join('.'),
    });
    await storeBootstrapToken({
      sessionId: 'session-one',
      token: [{}, { sub: 'fixture' }, 'signature']
        .map((value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url'))
        .join('.'),
      expiresInSeconds: 60,
      root: join(root, 'checkout'),
      onPrepared: async (checkout) => {
        await store.write(`bootstrap-checkout-${checkout.reference.split('/').at(-1)}.json`, {
          schemaVersion: 1,
          owner: binding.owner,
          binding,
          siteUid: 'site-uid',
          contractFingerprint: 'fingerprint',
          tokenName: 'token-one',
          node: binding.nodes[0],
          checkout,
        });
      },
    });
    if (fault.includes('reconciliation')) {
      await store.write('azure-terraform-cloud-destroy-reconciliation.json', {
        status: fault.includes('owned-reconciliation') ? 'owned' : 'absent',
        ownerPlanSha256: fault === 'foreign-owned-reconciliation' ? 'd'.repeat(64) : base.planSha256,
        resourceGroupId: `/subscriptions/${base.subscription.id}/resourceGroups/${fault === 'foreign-reconciliation' ? 'foreign-group' : base.intent.resourceGroup}`,
        observedAt: fault === 'malformed-reconciliation' ? 'invalid' : new Date().toISOString(),
      });
    }
    if (fault.includes('public-update')) {
      await store.write(`public-site-${base.siteName}.json`, {
        planId: fault === 'foreign-public-update-plan' ? 'foreign-plan' : `f5xc-ce-v2-${'d'.repeat(24)}`,
        record: {
          phase:
            fault === 'malformed-public-update'
              ? 'unrecognized'
              : fault === 'public-update-prepared'
                ? 'replace-prepared'
                : 'replace-observed',
          uid: fault === 'foreign-public-update' ? 'foreign-site-uid' : 'site-uid',
          resourceVersion: 'fixture-resource-version',
        },
      });
    }
    if (fault === 'unknown') await store.write('foreign.json', { jwt: 'unowned' });
    if (['missing-terminal-payload', 'changed-terminal-payload', 'rehashed-terminal-payload'].includes(fault)) {
      const terminal = (await store.read('azure-terraform-terminal-cleanup.json')) as Record<string, unknown>;
      if (fault === 'missing-terminal-payload') delete terminal.retirementEvidence;
      else terminal.retirementEvidence = { cloud: { status: 'present' } };
      if (fault === 'rehashed-terminal-payload')
        terminal.retirementEvidenceSha256 = canonicalSha256(terminal.retirementEvidence);
      await store.write('azure-terraform-terminal-cleanup.json', terminal);
    }
    if (fault === 'terminal-changed-after-read') {
      const read = store.read.bind(store);
      let changed = false;
      store.read = async (name) => {
        const value = await read(name);
        if (name === 'azure-terraform-terminal-cleanup.json' && !changed) {
          changed = true;
          await store.write(name, { ...(value as object), retirementEvidence: { cloud: { status: 'present' } } });
        }
        return value;
      };
    }
    const originalDirectory = join(store.directory, 'terraform-original-deployment-receipts');
    const fragmentsDirectory = join(store.directory, 'terraform-original-deployment-publication-fragments');
    let fragmentName: string | undefined, fragmentBytes: Buffer<ArrayBuffer> | undefined;
    let originalFiles: string[] = [],
      originalBytes: Buffer<ArrayBuffer>[] = [];
    if (fault.startsWith('original-metadata')) {
      const bootstrapByNode = {
        '1': '#cloud-config\nwrite_files:\n- path: /etc/vpm/user_data\n  content: unit-enrollment-body\n',
      };
      for (const [stage, prefix] of [
        [{ kind: 'foundation' as const }, {}],
        [{ kind: 'node-admission' as const, node: 1 }, bootstrapByNode],
      ] as const) {
        const deployment = await azureTerraformFoundationDeployment(base, prefix);
        await publishAzureTerraformOriginalReceipt(
          {
            plan: base,
            bootstrapByNode: prefix,
            stage,
            receipt: {
              schemaVersion: 1,
              engine: 'terraform',
              deploymentId: deployment.deploymentId,
              backendIdentity: deployment.backendIdentity,
              configurationSha256: hash(deployment.configuration),
              providerLockSha256: hash(deployment.providerLock),
              planSha256: stage.kind === 'foundation' ? 'd'.repeat(64) : 'e'.repeat(64),
              changes: [],
              noChanges: true,
            },
          },
          store,
        );
      }
      const inventory = await readAzureTerraformOriginalReceiptInventory(base, bootstrapByNode, store);
      await store.write('terraform-workflow.json', {
        schemaVersion: 1,
        engine: 'terraform',
        planSha256: base.planSha256,
        stage: 'registered',
        bootstrapByNode,
        originalReceiptInventorySha256: canonicalSha256(inventory),
      });
      if (['original-metadata-digest', 'original-metadata-bootstrap', 'original-metadata-owner'].includes(fault)) {
        const workflow = (await store.read('terraform-workflow.json')) as Record<string, unknown>;
        if (fault === 'original-metadata-digest') workflow.originalReceiptInventorySha256 = 'f'.repeat(64);
        if (fault === 'original-metadata-bootstrap')
          workflow.bootstrapByNode = {
            '1': bootstrapByNode['1'].replace('unit-enrollment-body', 'foreign-enrollment-body'),
          };
        if (fault === 'original-metadata-owner') workflow.planSha256 = 'f'.repeat(64);
        await store.write('terraform-workflow.json', workflow);
      }
      originalFiles = (await readdir(originalDirectory)).sort();
      originalBytes = await Promise.all(originalFiles.map((name) => readFile(join(originalDirectory, name))));
      if (fault.includes('fragment')) {
        await mkdir(fragmentsDirectory, { mode: 0o700 });
        fragmentBytes =
          fault === 'original-metadata-fragment-foreign'
            ? Buffer.from('foreign-fragment')
            : originalBytes[0].subarray(0, 80);
        fragmentName = `${originalFiles[0].slice(0, 64)}-00000000-0000-4000-8000-000000000001.pending.${hash(fragmentBytes.toString())}.fragment`;
        if (fault === 'original-metadata-fragment-unknown') fragmentName = 'unclassified.fragment';
        await writeFile(join(fragmentsDirectory, fragmentName), fragmentBytes, { mode: 0o600 });
      }
      if (fault === 'original-metadata-partial')
        await writeFile(join(originalDirectory, 'unfinished.pending'), '{', { mode: 0o600 });
      if (fault === 'original-metadata-foreign')
        await writeFile(join(originalDirectory, originalFiles[0]), '{}', { mode: 0o600 });
    }
    const run = (signal?: AbortSignal) => retireAzureTerraformParentArtifacts(base, teardown, evidence, store, signal);
    if (
      [
        'original-metadata-digest',
        'original-metadata-bootstrap',
        'original-metadata-owner',
        'original-metadata-fragment-foreign',
        'original-metadata-fragment-unknown',
        'original-metadata-partial',
        'original-metadata-foreign',
        'missing-terminal-payload',
        'changed-terminal-payload',
        'rehashed-terminal-payload',
        'terminal-changed-after-read',
        'unknown',
        'missing-independent',
        'foreign-public-update',
        'malformed-public-update',
        'foreign-public-update-plan',
        'foreign-runner',
        'foreign-reconciliation',
        'malformed-reconciliation',
        'foreign-owned-reconciliation',
      ].includes(fault)
    ) {
      await expect(run()).rejects.toThrow(
        fault.startsWith('original-metadata') ? /original receipt|metadata/ : undefined,
      );
      expect(await store.read('terraform-workflow.json')).toBeDefined();
      return;
    }
    if (
      fault === 'original-metadata-interrupted' ||
      fault === 'original-metadata-inode' ||
      fault === 'original-metadata-late' ||
      fault === 'interrupted' ||
      fault === 'changed-artifact' ||
      fault === 'identical-byte-artifact' ||
      fault === 'interrupted-terminal-payload'
    ) {
      const controller = new AbortController();
      const write = store.write.bind(store);
      store.write = async (name, value) => {
        await write(name, value);
        if (name === 'azure-terraform-parent-artifact-retirement.json') controller.abort();
      };
      await expect(run(controller.signal)).rejects.toThrow();
      store.write = write;
      if (fault === 'interrupted-terminal-payload') {
        const terminal = (await store.read('azure-terraform-terminal-cleanup.json')) as Record<string, unknown>;
        delete terminal.retirementEvidence;
        await store.write('azure-terraform-terminal-cleanup.json', terminal);
        await expect(run()).rejects.toThrow('terminal evidence');
        expect(await store.read('terraform-workflow.json')).toBeDefined();
        expect(await store.read('token-one.json')).toBeDefined();
        return;
      }
      if (fault === 'original-metadata-inode') {
        const path = join(originalDirectory, originalFiles[0]);
        await rename(path, join(root, 'original-receipt-backup.json'));
        await writeFile(path, originalBytes[0], { mode: 0o600 });
        await expect(run()).rejects.toThrow('changed');
        expect(await store.read('token-one.json')).toBeDefined();
        return;
      }
      if (fault === 'original-metadata-late') {
        await writeFile(join(originalDirectory, 'late.pending'), '{', { mode: 0o600 });
        await expect(run()).rejects.toThrow(/metadata|changed/);
        expect(await store.read('token-one.json')).toBeDefined();
        return;
      }
      if (fault === 'identical-byte-artifact') {
        const path = join(store.directory, 'terraform-workflow.json'),
          bytes = await readFile(path);
        const backupRoot = await mkdtemp(join(tmpdir(), 'azure-parent-original-inode-'));
        roots.push(backupRoot);
        await rename(path, join(backupRoot, 'original.json'));
        await writeFile(path, bytes, { mode: 0o600 });
        await expect(run()).rejects.toThrow('changed');
        expect(await store.read('token-one.json')).toBeDefined();
        return;
      }
      if (fault === 'changed-artifact') {
        await store.write('terraform-workflow.json', { changed: true });
        await expect(run()).rejects.toThrow('changed');
        return;
      }
    }
    const receipt = await run();
    expect(receipt.status).toBe('deployment-artifacts-retired');
    expect(await readdir(store.directory)).not.toContain(`public-site-${base.siteName}.json`);
    expect(await readdir(store.directory)).not.toContain('terraform-workflow.json');
    expect(await readdir(store.directory)).not.toContain('token-one.json');
    expect(await readdir(store.directory)).not.toContain('azure-terraform-cloud-destroy-reconciliation.json');
    expect(await run()).toEqual(receipt);
    if (fragmentName && fragmentBytes) {
      expect(await readdir(fragmentsDirectory)).toEqual([fragmentName]);
      expect((await readFile(join(fragmentsDirectory, fragmentName))).equals(fragmentBytes)).toBe(true);
    }
    if (originalFiles.length) {
      expect((await readdir(originalDirectory)).sort()).toEqual(originalFiles);
      expect(await Promise.all(originalFiles.map((name) => readFile(join(originalDirectory, name))))).toEqual(
        originalBytes,
      );
      expect(Buffer.concat(originalBytes).toString()).not.toContain('unit-enrollment-body');
    }
  });
}
