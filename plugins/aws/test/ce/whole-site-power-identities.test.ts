import { expect, test } from 'bun:test';
import { canonicalSha256 } from '../../src/ce/canonical';
import { collectAwsPowerIdentities } from '../../src/ce/whole-site-power-identities';

import { powerIdentityFixture as fixture } from './whole-site-power-fixtures';

for (const engine of ['native', 'terraform'] as const) {
  test(`${engine}: exact cloud ownership joins registration MAC/device without claiming health`, async () => {
    const f = fixture(engine);
    const result = await f.read();
    expect(result.nodes[0].instanceId).toBe(f.resolved.__INSTANCE_1__);
    expect(result.nodes[0].interfaces.map((i) => i.device)).toEqual(['ens5', 'ens6']);
    expect(result.cloud).toBe('running');
    expect(result.originalCeHeartbeat).toBe('unknown');
    expect(result.canSatisfyInterfaceMutationGate).toBe(false);
    expect(f.calls.every((args) => args.includes('ce-profile'))).toBe(true);
    expect(f.calls.every((args) => args[0] === 'sts' || args[1].startsWith('describe-'))).toBe(true);
  });
  test(`${engine}: stopped cloud retains the same registration-bound identities`, async () => {
    const f = fixture(engine);
    f.instance.State.Name = 'stopped';
    expect((await f.read()).cloud).toBe('stopped');
  });
}

test('unresolved execution identities reject before cloud reads', async () => {
  const f = fixture();
  f.resolved.__INSTANCE_1__ = '__INSTANCE_1__';
  await expect(f.read()).rejects.toThrow('unresolved');
  expect(f.calls).toEqual([]);
});
test('authenticated foreign account rejects before resource observation', async () => {
  const f = fixture();
  f.identity();
  await expect(f.read()).rejects.toThrow('account');
  expect(f.calls).toHaveLength(1);
});
for (const kind of [
  'foreign-engine',
  'duplicate-tags',
  'foreign-owner',
  'extra-instance',
  'missing-interface',
  'duplicate-interface',
  'foreign-attachment',
  'mac-drift',
  'interface-owner',
  'wrong-device',
  'missing-hardware',
  'partial',
  'malformed',
] as const) {
  test(`rejects ${kind} without power mutation`, async () => {
    const f = fixture();
    if (kind === 'foreign-engine') {
      const tag = f.instance.Tags.find((t) => t.Key === 'xcsh-execution-engine');
      if (!tag) throw new Error('Fixture engine tag missing');
      tag.Value = 'terraform';
    } else if (kind === 'duplicate-tags') f.instance.Tags.push(f.instance.Tags[0]);
    else if (kind === 'foreign-owner')
      f.instances({ Reservations: [{ OwnerId: '999999999999', Instances: [f.instance] }] });
    else if (kind === 'extra-instance')
      f.instances({ Reservations: [{ OwnerId: f.base.accountId, Instances: [f.instance, f.instance] }] });
    else if (kind === 'missing-interface') f.interfaces({ NetworkInterfaces: f.enis.slice(0, 1) });
    else if (kind === 'duplicate-interface') f.interfaces({ NetworkInterfaces: [f.enis[0], f.enis[0]] });
    else if (kind === 'foreign-attachment') f.enis[0].Attachment.InstanceId = 'i-fffffffffffffffff';
    else if (kind === 'mac-drift') f.enis[0].MacAddress = '02:11:22:33:44:55';
    else if (kind === 'interface-owner') f.enis[0].OwnerId = '999999999999';
    else if (kind === 'wrong-device')
      f.hardware({
        status: 'observed',
        interfaces: f.enis.map((eni, index) => ({
          node: 'ce-1',
          role: index ? 'sli' : 'slo',
          mac: eni.MacAddress,
          device: index ? 'ens6' : 'wrong',
        })),
      });
    else if (kind === 'missing-hardware') f.hardware({ status: 'unknown', interfaces: [] });
    else if (kind === 'partial') f.interfaces({ NetworkInterfaces: f.enis, NextToken: 'more' });
    else f.instances([]);
    await expect(f.read()).rejects.toThrow();
    expect(f.calls.every((args) => args[0] === 'sts' || args[1].startsWith('describe-'))).toBe(true);
  });
}

for (const engine of ['native', 'terraform'] as const) {
  for (const ha of [false, true]) {
    test(`${engine}: read-only ${ha ? 'HA' : 'independent-site'} identity discovery joins all six interfaces`, async () => {
      const f = fixture(engine);
      f.base.intent.topology = {
        nodeCount: 3,
        sites: ha
          ? [{ name: 'site', nodeIndexes: [1, 2, 3] }]
          : [1, 2, 3].map((node) => ({ name: `site-${node}`, nodeIndexes: [node] })),
      };
      f.base.topology = f.base.intent.topology;
      const { planId: _id, planSha256: _sha, ...body } = f.base;
      f.base.planSha256 = canonicalSha256(body);
      f.base.planId = `aws-ce-${f.base.planSha256.slice(0, 24)}`;
      const enis = [1, 2, 3].flatMap((node) =>
        f.enis.map((source, index) => {
          const eni = structuredClone(source);
          eni.NetworkInterfaceId = `eni-${String(node * 10 + index).padStart(17, '0')}`;
          eni.MacAddress = `02:00:00:00:0${node}:0${index}`;
          eni.Attachment.InstanceId = `i-${String(node).padStart(17, '0')}`;
          for (const tag of eni.TagSet) {
            if (tag.Key === 'xcsh-node-index') tag.Value = String(node);
            if (tag.Key === 'xcsh-plan-sha256') tag.Value = f.base.planSha256;
            if (tag.Key === 'ves-io-site-name') tag.Value = ha ? 'site' : `site-${node}`;
          }
          f.resolved[`__INSTANCE_${node}__`] = eni.Attachment.InstanceId;
          f.resolved[`__ENI_${node}_${index}__`] = eni.NetworkInterfaceId;
          f.resolved[`__ENI_${node}_${index}_MAC__`] = eni.MacAddress;
          return eni;
        }),
      );
      const instances = [1, 2, 3].map((node) => {
        const instance = structuredClone(f.instance);
        instance.InstanceId = f.resolved[`__INSTANCE_${node}__`];
        instance.Tags = enis[(node - 1) * 2].TagSet.filter((tag) => tag.Key !== 'xcsh-interface-index');
        instance.NetworkInterfaces = enis
          .filter((eni) => eni.Attachment.InstanceId === instance.InstanceId)
          .map((eni) => ({
            NetworkInterfaceId: eni.NetworkInterfaceId,
            MacAddress: eni.MacAddress,
            Attachment: eni.Attachment,
          }));
        return instance;
      });
      f.interfaces({ NetworkInterfaces: enis });
      f.instances({ Reservations: [{ OwnerId: f.base.accountId, Instances: instances }] });
      const hardware = enis.map((eni) => ({
        node: `ce-${Number(eni.TagSet.find((tag) => tag.Key === 'xcsh-node-index')?.Value)}`,
        role: eni.Attachment.DeviceIndex ? ('sli' as const) : ('slo' as const),
        mac: eni.MacAddress,
        device: eni.Attachment.DeviceIndex ? 'ens6' : 'ens5',
      }));
      f.runtime.observeRegisteredDevices = async (binding) => ({
        owner: binding.owner,
        siteName: binding.siteName,
        source: 'synthetic-registration-inventory',
        observedAt: new Date().toISOString(),
        evidenceKind: 'registration-hardware-inventory',
        status: 'observed',
        interfaces: hardware.filter((row) => binding.nodes.includes(row.node)),
      });
      const result = await f.read();
      expect(result.nodes).toHaveLength(3);
      expect(new Set(result.nodes.flatMap((node) => node.interfaces.map((item) => item.id))).size).toBe(6);
      expect(new Set(result.nodes.flatMap((node) => node.interfaces.map((item) => item.mac))).size).toBe(6);
      expect(result.canSatisfyInterfaceMutationGate).toBe(false);
      f.resolved.__ENI_3_1_MAC__ = f.resolved.__ENI_1_1_MAC__;
      await expect(f.read()).rejects.toThrow('duplicated');
    });
  }
}

test('service and authorization failures cannot manufacture power identities', async () => {
  const f = fixture();
  await expect(
    collectAwsPowerIdentities(
      f.base,
      f.resolved,
      { exec: async () => ({ exitCode: 1, stdout: '', stderr: 'AccessDenied' }) },
      f.runtime,
    ),
  ).rejects.toThrow('unavailable');
  f.runtime.observeRegisteredDevices = async () => {
    throw new Error('Service unavailable');
  };
  await expect(f.read()).rejects.toThrow('Service unavailable');
});
test('cancellation stops identity discovery before the first cloud query', async () => {
  const f = fixture();
  await expect(collectAwsPowerIdentities(f.base, f.resolved, f.api, f.runtime, AbortSignal.abort())).rejects.toThrow();
  expect(f.calls).toEqual([]);
});
