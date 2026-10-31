import { expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { fingerprint } from '../../src/ce/discovery';
import { type GcpOperationalReleasePin, resolveGcpOperationalRelease } from '../../src/ce/operational-release';
import { operationalFixture } from './operational-health.test';
import { terraformHaProfileFixture } from './terraform-ha-profile.test';

function fixture() {
  const f = operationalFixture();
  const contractFingerprint = fingerprint(f.profile);
  const qualification = {
    schemaVersion: 2,
    contractFingerprint,
    bindingFingerprint: fingerprint(f.binding),
    healthyRoundFingerprints: [fingerprint({ round: 1 }), fingerprint({ round: 2 })],
    evidenceSha256: fingerprint({ evidence: true }),
    campaignCleanupSha256: fingerprint({ cleanup: true }),
    objectsAbsent: 18,
    emptyDestroy: true,
    stableState: true,
    repeatedResumeNoSubmission: true,
  };
  const bodies: Record<string, string> = {
    'gcp-operational-health-v2.json': JSON.stringify(f.profile),
    'gcp-operational-qualification-v2.json': JSON.stringify(qualification),
  };
  const digest = (body: string) => `sha256:${createHash('sha256').update(body).digest('hex')}`;
  const pin: GcpOperationalReleasePin = {
    tag: 'v12.1.99',
    sourceCommit: 'a'.repeat(40),
    contractFingerprint,
    profileAssetDigest: digest(bodies['gcp-operational-health-v2.json']),
    qualificationAssetDigest: digest(bodies['gcp-operational-qualification-v2.json']),
    qualificationFingerprint: fingerprint(qualification),
  };
  const release = {
    tag_name: pin.tag,
    immutable: true,
    draft: false,
    prerelease: false,
    assets: Object.entries(bodies).map(([name, body]) => ({
      name,
      digest: digest(body),
      browser_download_url: `https://github.com/f5-sales-demo/api-specs-enriched/releases/download/${pin.tag}/${name}`,
    })),
  };
  const reference = { object: { type: 'commit', sha: pin.sourceCommit } };
  const fetcher = (async (url: Parameters<typeof fetch>[0]) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith(`/releases/tags/${pin.tag}`)) return Response.json(release);
    if (path.endsWith(`/git/ref/tags/${pin.tag}`)) return Response.json(reference);
    const body = bodies[path.split('/').at(-1)!];
    return body === undefined ? new Response('not found', { status: 404 }) : new Response(body);
  }) as typeof fetch;
  const resolve = () => resolveGcpOperationalRelease(fetcher, undefined, pin, f.profile.sourceHashes);
  return { ...f, pin, release, reference, bodies, resolve, qualification };
}
it('binds immutable source, both raw asset digests and sanitized contract/qualification fingerprints', async () => {
  const f = fixture();
  const result = await f.resolve();
  expect(result?.contractFingerprint).toBe(f.pin.contractFingerprint);
  expect(result?.qualificationFingerprint).toBe(f.pin.qualificationFingerprint);
});
it('refuses nonimmutable releases, foreign source, duplicate assets and modified asset bytes', async () => {
  for (const modify of [
    (f: ReturnType<typeof fixture>) => {
      f.release.immutable = false;
    },
    (f: ReturnType<typeof fixture>) => {
      f.reference.object.sha = 'b'.repeat(40);
    },
    (f: ReturnType<typeof fixture>) => {
      f.release.assets.push(f.release.assets[0]);
    },
    (f: ReturnType<typeof fixture>) => {
      f.bodies['gcp-operational-health-v2.json'] += ' ';
    },
    (f: ReturnType<typeof fixture>) => {
      f.pin.contractFingerprint = fingerprint({ changed: true });
    },
    (f: ReturnType<typeof fixture>) => {
      f.pin.qualificationFingerprint = fingerprint({ changed: true });
    },
  ]) {
    const f = fixture();
    modify(f);
    await expect(f.resolve()).rejects.toThrow();
  }
});
it('requires explicit requalification when compiled parser identities drift', async () => {
  const f = fixture();
  f.profile.sourceHashes.schema = fingerprint({ changedParser: true });
  await expect(f.resolve()).rejects.toThrow('explicit requalification');
});
it('failed release reads never supply a prior qualification', async () => {
  const f = fixture();
  await f.resolve();
  await expect(
    resolveGcpOperationalRelease(
      (async () => new Response('', { status: 503 })) as typeof fetch,
      undefined,
      f.pin,
      f.profile.sourceHashes,
    ),
  ).rejects.toThrow('unavailable');
});

it('verifies the lifecycle asset against its compiled pin before enabling HA admission', async () => {
  const f = fixture(),
    lifecycle = terraformHaProfileFixture().profile;
  lifecycle.operationalContractFingerprint = f.pin.contractFingerprint;
  f.pin.terraformHaLifecycle = lifecycle;
  f.pin.terraformHaLifecycleFingerprint = fingerprint(lifecycle);
  Object.assign(f.qualification, { terraformHaLifecycle: lifecycle });
  f.bodies['gcp-operational-qualification-v2.json'] = JSON.stringify(f.qualification);
  f.pin.qualificationFingerprint = fingerprint(f.qualification);
  f.pin.qualificationAssetDigest = `sha256:${createHash('sha256').update(f.bodies['gcp-operational-qualification-v2.json']).digest('hex')}`;
  f.release.assets.find((a) => a.name === 'gcp-operational-qualification-v2.json')!.digest =
    f.pin.qualificationAssetDigest;
  expect((await f.resolve())?.terraformHaLifecycle).toEqual(lifecycle);
  f.pin.terraformHaLifecycle = { ...lifecycle, lifecycleEvidenceSha256: fingerprint({ changed: true }) };
  await expect(f.resolve()).rejects.toThrow('lifecycle qualification');
});
