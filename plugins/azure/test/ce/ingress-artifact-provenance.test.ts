import { expect, test } from 'bun:test';
import { hashCeIngressPlan } from '../../../platform/src/ce/ingress-lifecycle';
import { verifyAzureIngressHistoricalArtifacts } from '../../src/ce/ingress-artifact-provenance';
import { createIngressHistoryFixture } from './ingress-history-fixture';

type Json = Record<string, unknown>;
for (const engine of ['native', 'terraform'] as const)
  for (const mode of ['planned', 'origin', 'complete', 'corrected'] as const) {
    test(`${engine} exact ${mode} ingress history revalidates source, requests and drain joins`, async () => {
      const f = await createIngressHistoryFixture(engine);
      try {
        const { records } = await f.run(mode);
        expect(() => verifyAzureIngressHistoricalArtifacts(f.plan, f.drain, f.contract, records)).not.toThrow();
        expect(JSON.stringify([...records.values()])).not.toContain('never-retain');
        expect(f.state.listener).toBeUndefined();
        expect(f.state.origin).toBeUndefined();
        if (mode === 'complete') expect(f.state.deletes).toBe(2);
      } finally {
        await f.cleanup();
      }
    });
  }
for (const mode of [
  'missing-source',
  'foreign-owner',
  'wrong-engine',
  'foreign-mac',
  'changed-request',
  'changed-origin',
  'wrong-site-uid',
  'wrong-origin-uid',
  'missing-plan',
  'foreign-marker',
  'malformed-time',
  'partial-drain',
  'missing-traffic-source',
  'foreign-traffic',
  'orphan-checkpoint',
] as const) {
  test(`ingress history rejects ${mode}`, async () => {
    const f = await createIngressHistoryFixture('native');
    try {
      const { records, marker } = await f.run();
      const sourceName = `azure-ingress-source-${f.plan.planSha256}.json`,
        planName = `ingress-plan-${marker.ingressPlanId}.json`;
      const source = records.get(sourceName) as Json,
        plan = records.get(planName) as { material: Json; sha256: string; id: string; request: Json };
      if (mode === 'missing-source') records.delete(sourceName);
      if (mode === 'foreign-owner') source.owner = { ...f.binding.owner, account: 'example-foreign' };
      if (mode === 'wrong-engine') source.engine = 'terraform';
      if (mode === 'foreign-mac') (source.selectedIdentity as { nic: Json }).nic.macAddress = '02:00:00:00:00:99';
      if (mode === 'changed-request') (plan.request.spec as Json).advertise_on_public_default_vip = {};
      if (mode === 'changed-origin') ((plan.material.originRequest as Json).spec as Json).no_tls = { foreign: true };
      if (mode === 'wrong-site-uid') f.drain.sites[0].siteUid = 'foreign';
      if (mode === 'wrong-origin-uid') f.drain.origins[0].origin.uid = 'foreign';
      if (mode === 'missing-plan') records.delete(planName);
      if (mode === 'foreign-marker')
        (records.get('azure-platform-ingress.json') as Json).sourceArtifactSha256 = 'f'.repeat(64);
      if (mode === 'malformed-time') source.observedAt = '2999-01-01T00:00:00Z';
      if (mode === 'partial-drain') f.drain.listeners.pop();
      if (mode === 'missing-traffic-source') records.delete(sourceName);
      if (mode === 'foreign-traffic') {
        const row = [...records].find(([name]) => name.endsWith('-traffic-probe.json'));
        if (!row) throw Error('Traffic checkpoint missing');
        (row[1] as Json).sourceNicResourceId = 'foreign';
      }
      if (mode === 'orphan-checkpoint')
        records.set(`ingress-checkpoint-${'f'.repeat(24)}.json`, { phase: 'creating', planSha256: 'f'.repeat(64) });
      expect(() => verifyAzureIngressHistoricalArtifacts(f.plan, f.drain, f.contract, records)).toThrow();
    } finally {
      await f.cleanup();
    }
  });
}

test('rehashed ingress request cannot substitute for exact contract compilation', async () => {
  const f = await createIngressHistoryFixture('terraform');
  try {
    const { records, marker } = await f.run();
    const name = `ingress-plan-${marker.ingressPlanId}.json`,
      raw = records.get(name) as Json;
    const material = raw.material as Json;
    const request = structuredClone(raw.request) as Json;
    (request.spec as Json).advertise_on_public_default_vip = {};
    material.request = request;
    const { id: _id, sha256: _sha, request: _request, ...draft } = raw;
    const sha256 = hashCeIngressPlan(draft),
      id = sha256.slice(0, 24);
    records.delete(name);
    records.set(`ingress-plan-${id}.json`, { ...raw, request, id, sha256 });
    expect(() => verifyAzureIngressHistoricalArtifacts(f.plan, f.drain, f.contract, records)).toThrow(
      /exact contract compilation/,
    );
  } finally {
    await f.cleanup();
  }
});
