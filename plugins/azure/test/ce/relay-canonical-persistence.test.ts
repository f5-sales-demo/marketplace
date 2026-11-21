import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPlanArtifact, type SessionManagerLike, savePlanArtifact } from '../../src/ce/artifacts';
import { canonicalSha256, canonicalStringify } from '../../src/ce/canonical';
import { compileAzureCePlan } from '../../src/ce/planner';
import { renderAzureRelayCloudInit } from '../../src/ce/relay-cloud-init';
import { azureRelayPlanForDeployment, compileAzureRelayDeploymentPlan } from '../../src/ce/relay-deployment-plan';
import { compileAzureRelayNativeRequests } from '../../src/ce/relay-native';
import { compileAzureRelayPlan } from '../../src/ce/relay-plan';
import { intent, observation } from './fixtures';

function fixture(engine: 'native' | 'terraform', ha: boolean) {
  const observed = structuredClone(observation);
  observed.regions[0].quotaAvailable = 64;
  const foundation = compileAzureCePlan(
    {
      ...intent,
      engine,
      topology: { ha },
      routing: { mode: 'route-server', destinationCidrs: ['10.250.0.10/32'], localAsn: 65010 },
    },
    observed,
  );
  const hostImage = { publisher: 'canonical', offer: 'ubuntu-24_04-lts', sku: 'server', version: '24.04.202610010' };
  const selection = {
    vmSize: 'Standard_D8s_v5',
    hostImage,
    frr: { version: '10.4.1', image: `quay.io/frrouting/frr@sha256:${'a'.repeat(64)}` },
    relays: [
      { asn: 65001, privateAddress: '10.20.0.20' },
      { asn: 65002, privateAddress: '10.20.0.21' },
    ],
    vipPrefixes: ['10.250.0.10/32'],
    returnPrefixes: ['10.30.0.0/24'],
    docker: { version: '29.9.2', sha256: 'd'.repeat(64) },
  };
  const image = {
    id: `/subscriptions/${foundation.subscription.id}/providers/Microsoft.Compute/locations/${foundation.region}/publishers/${hostImage.publisher}/artifacttypes/vmimage/offers/${hostImage.offer}/skus/${hostImage.sku}/versions/${hostImage.version}`,
    urn: Object.values(hostImage).join(':'),
    osType: 'Linux' as const,
    architecture: 'amd64' as const,
  };
  const first = compileAzureRelayPlan(foundation, selection, {
    region: foundation.region,
    image,
    vmSizes: observed.regions[0].vmSizes,
  });
  const stamp = new Date().toISOString();
  const query = (args: string[]) => ({
    command: 'az' as const,
    args: [...args, '--subscription', foundation.subscription.id, '--output', 'json'],
    responseSha256: 'a'.repeat(64),
    observedAt: stamp,
  });
  const catalog = {
    region: foundation.region,
    image,
    vmSizes: observed.regions[0].vmSizes.filter((size) => size.name === selection.vmSize),
    provenance: {
      method: 'azure-cli-live' as const,
      sourcePlanSha256: foundation.planSha256,
      observedAt: stamp,
      reads: [
        query(['account', 'show']),
        query(['vm', 'image', 'show', '--urn', first.hostImage.urn, '--location', foundation.region]),
        query(['vm', 'list-skus', '--size', selection.vmSize, '--location', foundation.region, '--all']),
      ],
    },
  };
  const source = compileAzureRelayDeploymentPlan(foundation, selection, catalog);
  return { source, plan: azureRelayPlanForDeployment(source), observed };
}

for (const engine of ['native', 'terraform'] as const)
  for (const ha of [false, true])
    test(`real persisted relay plan retains exact cloud-init bytes engine=${engine} HA=${ha}`, async () => {
      const f = fixture(engine, ha);
      const root = await mkdtemp(join(tmpdir(), 'ce-relay-canonical-'));
      try {
        let sequence = 0;
        const paths = new Map<string, string>();
        const session: SessionManagerLike = {
          getSessionId: () => root,
          getArtifactsDir: () => root,
          getArtifactPath: async (id) => paths.get(id) ?? null,
          saveArtifact: async (content, type) => {
            const id = String(++sequence),
              path = join(root, `${id.padStart(6, '0')}.${type}.log`);
            await writeFile(path, content);
            paths.set(id, path);
            return id;
          },
        };
        await savePlanArtifact(session, f.source, f.observed);
        const restored = (await loadPlanArtifact(session, f.source.planId, f.source.planSha256)).plan;
        const relay = azureRelayPlanForDeployment(restored);
        expect(canonicalSha256(restored)).toBe(canonicalSha256(f.source));
        expect(canonicalSha256(relay)).toBe(canonicalSha256(f.plan));
        for (const node of f.plan.relays)
          expect(renderAzureRelayCloudInit(restored, relay, node.name)).toBe(
            renderAzureRelayCloudInit(f.source, f.plan, node.name),
          );
      } finally {
        await rm(root, { recursive: true });
      }
    });

const field = (value: Buffer) => {
  const size = Buffer.alloc(4);
  size.writeUInt32BE(value.length);
  return Buffer.concat([size, value]);
};
const key = `ssh-ed25519 ${Buffer.concat([field(Buffer.from('ssh-ed25519')), field(Buffer.alloc(32, 1))]).toString('base64')}`;
for (const ha of [false, true])
  test(`canonical-equivalent relay source retains native saved request digest HA=${ha}`, () => {
    const f = fixture('native', ha);
    const source = JSON.parse(canonicalStringify(f.source));
    const plan = azureRelayPlanForDeployment(source);
    expect(canonicalSha256(source)).toBe(canonicalSha256(f.source));
    expect(canonicalSha256(plan)).toBe(canonicalSha256(f.plan));
    expect(canonicalSha256(compileAzureRelayNativeRequests(source, plan, key))).toBe(
      canonicalSha256(compileAzureRelayNativeRequests(f.source, f.plan, key)),
    );
  });
