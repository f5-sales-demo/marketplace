import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import { canonicalSha256 } from '../../src/ce/canonical';
import { buildAwsWholeSitePowerPlan, runAwsWholeSitePower } from '../../src/ce/whole-site-power';
import { createAwsWholeSitePowerDriver } from '../../src/ce/whole-site-power-driver';
import { collectAwsWholeSitePowerEvidence } from '../../src/ce/whole-site-power-evidence';
import { collectAwsPowerOperational } from '../../src/ce/whole-site-power-operational';
import { collectAwsPowerServiceInventory } from '../../src/ce/whole-site-power-service-inventory';
import { powerIdentityFixture } from './whole-site-power-fixtures';
import { nlbPowerFixture } from './whole-site-power-nlb-fixtures';

for (const mode of [
  'up',
  'down',
  'missing',
  'wrong-mac',
  'wrong-device',
  'foreign-site',
  'unavailable',
  'identity-changed',
  'configuration-changed',
  'cloud-changed',
] as const)
  test(`power operational ${mode} observations preserve separate gates`, async () => {
    const f = powerIdentityFixture(),
      identity = await f.read();
    const bindings = {
      sourcePlanSha256: f.base.planSha256,
      owner: identity.owner,
      nodes: identity.nodes,
      servicesSha256: canonicalSha256({ service: 'test' }),
    };
    const plan = buildAwsWholeSitePowerPlan(f.base, 'stop', bindings, '11111111-1111-4111-8111-111111111111');
    const interfaces = bindings.nodes.flatMap((node) =>
      node.interfaces.map((item) => ({
        node: node.nodeName,
        role: item.role,
        mac: item.mac,
        device: item.device,
        interfaceName: `interface-${item.index}`,
        mtu: 1500,
        linkUp: mode !== 'down' || item.role !== 'sli',
        ipv4: null,
      })),
    );
    if (mode === 'missing') interfaces.pop();
    if (mode === 'wrong-mac') interfaces[0].mac = '02:ff:ff:ff:ff:ff';
    if (mode === 'wrong-device') interfaces[0].device = 'ens99';
    let reads = 0;
    const runtime = {
      ...f.runtime,
      contract: { fingerprint: 'contract-test' },
      observeOwnedSite: async () => {
        reads++;
        if (mode === 'cloud-changed' && reads > 1) f.enis[0].MacAddress = '02:11:22:33:44:55';
        return {
          system_metadata: { uid: mode === 'identity-changed' && reads > 1 ? 'replacement' : 'logical-one' },
          spec: { unchanged: mode !== 'configuration-changed' || reads === 1 },
        };
      },
      observeHealth: async () => ({ status: 'healthy', siteUid: 'logical-one' }),
      observeRegistrations: async () => ({ status: 'healthy' }),
      observeAwsRegisteredConfiguration: async () => ({ status: 'configured', siteUid: 'logical-one', interfaces }),
      observePowerVersions: async () => ({
        status: 'observed',
        siteUid: mode === 'foreign-site' ? 'foreign' : 'logical-one',
        stable: true,
        software: { installed: 'crt-20260201-0178' },
        os: { installed: '9.2026.14' },
      }),
      observeAwsInterfaces: async () => {
        if (mode === 'unavailable') throw Error('unavailable');
        return { status: mode === 'down' ? 'down' : 'observed', interfaces, observedAt: new Date().toISOString() };
      },
    } as unknown as CeRuntime;
    const result = await collectAwsPowerOperational(f.base, plan, f.resolved, f.api, runtime);
    expect(result.canSatisfyInterfaceMutationGate).toBe(false);
    expect(result.freshness).toBe('unqualified');
    expect(result.interfaceState).toBe(mode === 'up' ? 'up' : mode === 'down' ? 'down' : 'unknown');
    expect(result.traffic).toBe('unknown');
    if (mode === 'up' || mode === 'down') {
      expect(result.registration).toBe('healthy');
      expect(result.configuration).toBe('verified');
      expect(result.versions).toBe('stable');
    }
  });

for (const mode of ['up', 'down', 'service-drift', 'service-unavailable'] as const)
  test(`whole-site evidence ${mode} cannot promote missing mutation or blocked traffic proof`, async () => {
    const f = await nlbPowerFixture(),
      hardware = powerIdentityFixture();
    const runtime = {
      ...hardware.runtime,
      contract: { fingerprint: 'contract-test' },
      observeOwnedSite: async () => ({ system_metadata: { uid: 'logical-one' }, spec: { unchanged: true } }),
      observeHealth: async () => ({ status: 'healthy', siteUid: 'logical-one' }),
      observeRegistrations: async () => ({ status: 'healthy' }),
      observeAwsRegisteredConfiguration: async () => ({ status: 'unknown' }),
      observePowerVersions: async () => ({ status: 'observed', siteUid: 'logical-one', stable: true }),
      observeAwsInterfaces: async () => ({
        status: mode === 'down' ? 'down' : 'observed',
        interfaces: hardware.enis.map((eni, index) => ({
          node: 'ce-1',
          role: index ? 'sli' : 'slo',
          mac: eni.MacAddress,
          device: index ? 'ens6' : 'ens5',
          linkUp: mode !== 'down' || index === 0,
        })),
      }),
    } as unknown as CeRuntime;
    const api = {
      exec: async (command: string, args: string[]) => {
        const response = await (args[0] === 'elbv2' ? f.api : hardware.api).exec(command, args);
        return { ...response, stdout: response.stdout.replaceAll(hardware.base.planSha256, f.base.planSha256) };
      },
    };
    const identity = await hardware.read();
    const inventory = await collectAwsPowerServiceInventory(f.base, f.values, api, runtime);
    const bindings = {
      sourcePlanSha256: f.base.planSha256,
      owner: identity.owner,
      nodes: identity.nodes,
      servicesSha256: inventory.servicesSha256,
      servicesInventory: inventory.services,
    };
    const plan = buildAwsWholeSitePowerPlan(f.base, 'stop', bindings, '11111111-1111-4111-8111-111111111111');
    if (mode === 'service-drift') f.listener();
    if (mode === 'service-unavailable') f.partial();
    const result = await collectAwsWholeSitePowerEvidence(
      f.base,
      plan,
      'ready-to-stop',
      { ...f.values, ...hardware.resolved },
      api,
      runtime,
    );
    expect(result.canSatisfyInterfaceMutationGate).toBe(false);
    expect(result.traffic).toBe('unknown');
    expect(result.interfaces).toBe(mode === 'down' ? 'down' : 'up');
    expect(result.services).toBe(mode.startsWith('service-') ? 'unknown' : 'active');
    expect(result.gate).toBe('ready-to-stop');
    if (mode.startsWith('service-')) return;
    const directory = await mkdtemp(join(tmpdir(), 'owning-power-driver-'));
    try {
      const storage = await CeDeploymentStore.open(directory, bindings.owner);
      const driver = createAwsWholeSitePowerDriver(
        f.base,
        plan,
        { ...f.values, ...hardware.resolved },
        storage,
        api,
        runtime,
      );
      const result = await runAwsWholeSitePower(f.base, plan, plan.planSha256, storage, driver);
      expect(result.status).toBe('power-pending');
      expect('reason' in result ? result.reason : '').toBe('ready-to-stop-unknown');
      expect(f.calls.some((args) => args[1] === 'deregister-targets')).toBe(false);
      await expect(driver.execute(plan, 'withdraw')).rejects.toThrow('prerequisite unavailable');
      expect(f.calls.some((args) => args[1] === 'deregister-targets')).toBe(false);
    } finally {
      await rm(directory, { recursive: true });
    }
  });
