import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as typebox from '@sinclair/typebox';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { fingerprint } from '../../src/ce/discovery';
import { publicTerraformContextHash } from '../../src/ce/terraform-context';
import { inspectPublicTerraformOwnership } from '../../src/ce/terraform-public-ownership';
import {
  applyPublicTerraformTeardown,
  type planPublicTerraformTeardown,
  verifyPublicTerraformLiveOwnership,
} from '../../src/ce/terraform-public-teardown';
import type { PluginInterface } from '../../src/gcloud/types';
import { createGcpCeTools } from '../../src/tools/gcp-ce';
import { observerOwnershipFixture as fixture, observerOwnershipKey as key } from './observer-ownership-fixtures';
import { terraformHaProfileFixture } from './terraform-ha-profile.test';

test('all21 original identities include verified observer VM/disk/firewall without becoming a CE node', async () => {
  const f = fixture(),
    owned = await inspectPublicTerraformOwnership(f.runtime, f.i, f.receipt);
  expect(owned.schemaVersion).toBe(3);
  expect(owned.complete).toBe(true);
  expect(owned.addresses).toHaveLength(21);
  expect(owned.resources).toHaveLength(17);
  expect(await verifyPublicTerraformLiveOwnership(f.runtime, f.i, owned, undefined, false)).toEqual([]);
});
test('observer disk survives as a typed original partial subset when registration and VM are absent', async () => {
  const f = fixture(),
    disk = 'google_compute_disk.ce_test_observer';
  for (const address of f.addresses) if (address !== disk) f.fields[address] = null;
  for (const link of f.live.keys()) if (!link.endsWith('/disks/ce-test-observer')) f.live.delete(link);
  const owned = await inspectPublicTerraformOwnership(f.runtime, f.i, f.receipt);
  expect(owned.schemaVersion).toBe(3);
  expect(owned.complete).toBe(false);
  expect(owned.addresses).toEqual([disk]);
  expect((await verifyPublicTerraformLiveOwnership(f.runtime, f.i, owned)).length).toBe(20);
});
test('observer role, image, network, key, account and firewall substitutions refuse ownership', async () => {
  for (const mutation of [
    'service-account',
    'forwarding',
    'nic',
    'key',
    'image',
    'image-id',
    'wide-firewall',
    'live-account',
    'live-forwarding',
    'live-nic',
  ]) {
    const f = fixture(),
      vm = f.fields['google_compute_instance.ce_test_observer'],
      disk = f.fields['google_compute_disk.ce_test_observer'],
      fw = f.fields['google_compute_firewall.ce_test_observer_ssh'];
    if (!vm || !disk || !fw) throw new Error('Observer fixture missing');
    if (mutation === 'service-account') vm['service_account.length'] = 1;
    if (mutation === 'forwarding') vm.can_ip_forward = true;
    if (mutation === 'nic') vm['network_interface.length'] = 2;
    if (mutation === 'key') vm.metadata = { 'ssh-keys': `ubuntu:${key(3)}` };
    if (mutation === 'image') disk.image = 'replacement-image';
    if (mutation === 'image-id')
      for (const [link, body] of f.live) if (link.endsWith('/disks/ce-test-observer')) body.sourceImageId = '999';
    if (mutation === 'wide-firewall') fw.source_ranges = ['0.0.0.0/0'];
    for (const [link, body] of f.live)
      if (link.endsWith('/instances/ce-test-observer')) {
        if (mutation === 'live-account') body.serviceAccounts = [{ email: 'example@example.com' }];
        if (mutation === 'live-forwarding') body.canIpForward = true;
        if (mutation === 'live-nic') body.networkInterfaces = [];
      }
    await expect(inspectPublicTerraformOwnership(f.runtime, f.i, f.receipt)).rejects.toThrow();
  }
});

test('typed21-resource teardown and disk-only recovery finish with empty destroy and two non-submitting resumes', async () => {
  for (const diskOnly of [false, true]) {
    const f = fixture(),
      root = await mkdtemp(join(tmpdir(), 'observer-owned-cleanup-'));
    try {
      if (diskOnly) {
        for (const address of f.addresses)
          if (address !== 'google_compute_disk.ce_test_observer') f.fields[address] = null;
        for (const link of f.live.keys()) if (!link.endsWith('/disks/ce-test-observer')) f.live.delete(link);
      }
      const owned = await inspectPublicTerraformOwnership(f.runtime, f.i, f.receipt),
        files = new Map<string, unknown>();
      const planHash = fingerprint('original-reviewed-deploy'),
        receiptFingerprint = fingerprint(f.receipt),
        intentFingerprint = fingerprint(f.i);
      files.set('gcp-tf-deploy-original-authorization.json', { planHash, receiptFingerprint, intentFingerprint });
      files.set('gcp-tf-public-ownership.json', owned);
      files.set('gcp-tf-public-deployment.json', { planHash, receiptFingerprint, phase: 'partial' });
      f.runtime.environment = { XCSH_API_URL: 'https://original.example.test', XCSH_API_TOKEN: 'synthetic' };
      files.set('gcp-tf-public-platform-context.json', {
        schemaVersion: 1,
        contextHash: publicTerraformContextHash(f.i, 'https://original.example.test'),
      });
      files.set('gcp-terraform-input-identity.json', { intent: f.i });
      files.set('gcp-terraform-session-inputs.json', { inputs: { configurationVersion: 3 } });
      f.runtime.store = {
        directory: root,
        read: async (name) => {
          if (!files.has(name)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
          return structuredClone(files.get(name));
        },
        write: async (name, value) => {
          files.set(name, structuredClone(value));
        },
      };
      let serial = 1,
        submissions = 0,
        checkpoint: 'planned' | 'applying' | 'applied' = 'planned';
      let current: PlanReceipt | undefined;
      f.runtime.session.readStateIdentity = async () => ({
        sha256: fingerprint(f.fields).slice(7),
        lineage: 'original',
        serial,
      });
      f.runtime.session.planDestroy = async () => {
        const remaining = f.addresses.filter((address) => f.fields[address] !== null);
        current = {
          ...f.receipt,
          operation: 'destroy',
          planSha256: fingerprint({ remaining, serial }).slice(7),
          noChanges: remaining.length === 0,
          changes: remaining.map((address) => ({ address, type: address.split('.')[0], actions: ['delete'] })),
        };
        checkpoint = 'planned';
        return structuredClone(current);
      };
      f.runtime.session.readPlannedResourceFields = async () => structuredClone(f.fields);
      f.runtime.session.readApplyCheckpoint = async (receipt) => {
        if (fingerprint(receipt) !== fingerprint(current)) throw new Error('saved plan differs');
        return { schemaVersion: 1, planSha256: receipt.planSha256, state: checkpoint };
      };
      f.runtime.session.apply = async () => {
        submissions++;
        checkpoint = 'applying';
        for (const address of f.addresses) f.fields[address] = null;
        f.live.clear();
        serial++;
        checkpoint = 'applied';
      };
      const boundary = terraformHaProfileFixture().boundary,
        policy = {
          identity: 'f5xc-ce-automation-policy/v2' as const,
          url: 'https://example.test/policy',
          observedAt: new Date().toISOString(),
          normalizedSha256: fingerprint('policy'),
        };
      // Exercise the public installed-tool dispatcher, including disk-only cleanup without guest keys.
      f.runtime.session.googleAdcEnvironment = async () => ({
        GOOGLE_APPLICATION_CREDENTIALS: '/tmp/original-example-adc.json',
      });
      const platform = {
        storage: async () => f.runtime.store,
        gcpObservations: async () => ({
          teardown: f.runtime.observePlatform,
          terraformEnvironment: async () => f.runtime.environment,
        }),
      } as unknown as CePlatformService;
      const tools = createGcpCeTools(
        { typebox } as unknown as PluginInterface,
        () => f.runtime.api,
        async () => boundary,
        async () => platform,
        undefined,
        async () => policy,
        async () => f.runtime.session,
      );
      const tool = tools.find((candidate) => candidate.name === 'gcp_ce_plan');
      if (!tool) throw new Error('Public cleanup planning tool missing');
      const prepared = await tool.execute(
        'id',
        {
          project: f.i.project,
          region: f.i.region,
          deploymentName: f.i.deploymentName,
          platformContext: f.i.platformContext,
          engine: 'terraform',
          operation: 'teardown',
        },
        undefined,
        undefined,
        { cwd: root },
      );
      expect(prepared.isError).toBeUndefined();
      const review = prepared.details.plan as Awaited<ReturnType<typeof planPublicTerraformTeardown>>;
      expect(review.schemaVersion).toBe(3);
      expect(review.remaining).toHaveLength(diskOnly ? 1 : 21);
      expect(review.savedPlan.changes.every((change) => change.actions.join(',') === 'delete')).toBe(true);
      const result = await applyPublicTerraformTeardown(f.runtime, f.i, boundary, policy, review.planHash);
      expect(result.state).toBe('done');
      expect(result.absentObjects).toBe(21);
      expect(submissions).toBe(1);
      const stable = await f.runtime.session.readStateIdentity();
      for (let n = 0; n < 2; n++) {
        expect((await applyPublicTerraformTeardown(f.runtime, f.i, boundary, policy, review.planHash)).state).toBe(
          'done',
        );
        expect(await f.runtime.session.readStateIdentity()).toEqual(stable);
      }
      expect(submissions).toBe(1);
    } finally {
      await rm(root, { recursive: true });
    }
  }
});
