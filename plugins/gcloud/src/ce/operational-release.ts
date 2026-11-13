import { createHash } from 'node:crypto';
import type { GcpOperationalContract } from './contract';
import { fingerprint } from './discovery';
import { qualifiedOperationalProfile, qualifiedOperationalRelease } from './operational-health';
import sourceHashes from './operational-source-hashes.json';
import { fetchGcpRelease } from './release-fetch';
import { type GcpTerraformHaProfile, qualifiedGcpTerraformHaProfile } from './terraform-ha-profile';

export interface GcpOperationalReleasePin {
  tag: string;
  sourceCommit: string;
  profileAssetDigest: string;
  contractFingerprint: string;
  qualificationAssetDigest: string;
  qualificationFingerprint: string;
  terraformHaLifecycle?: GcpTerraformHaProfile;
  terraformHaLifecycleFingerprint?: string;
}
/** Populated only after fresh private qualification and immutable upstream publication. */
export const GCP_OPERATIONAL_RELEASE_PIN: GcpOperationalReleasePin | undefined = {
  tag: 'v12.3.1',
  sourceCommit: '0f42f302f85e82675b2b8a4b8637cb89bb3636c3',
  profileAssetDigest: 'sha256:3fe0708d3a602a2b8fc5c73aaa636e6843fd3ab755e500c44b80f2fd9d414f0e',
  contractFingerprint: 'sha256:3fe0708d3a602a2b8fc5c73aaa636e6843fd3ab755e500c44b80f2fd9d414f0e',
  qualificationAssetDigest: 'sha256:a908e8644fbc246382518f5632089cf44acffc1cbc147d0feb0c845345897b8b',
  qualificationFingerprint: 'sha256:a908e8644fbc246382518f5632089cf44acffc1cbc147d0feb0c845345897b8b',
  terraformHaLifecycle: {
    diskGiB: 80,
    imageIdentitySha256: 'sha256:c6e845dfd9bf978c2e86b4a07a8bcedc14b5a67a4d8199a4276209acb049a6cc',
    lifecycleEvidenceSha256: 'sha256:7376537c6201d9bc9c04a8bdbb7692e0f5ed0e5ddc6f161e67dcc8f57ecf98a7',
    machineType: 'n2-standard-8',
    operationalContractFingerprint: 'sha256:3fe0708d3a602a2b8fc5c73aaa636e6843fd3ab755e500c44b80f2fd9d414f0e',
    providerLockSha256: 'sha256:6d7c7b6c9f2d2c0ca301e7c845b893b07722149b0bc6853f6058d5f27a28050a',
    region: 'northamerica-northeast1',
    schemaVersion: 2,
    scope: 'original-three-node-terraform-ha',
    versions: {
      google: '8.7.0',
      terraform: '1.16.6',
      xcsh: '15.13.0',
    },
    zones: ['northamerica-northeast1-a', 'northamerica-northeast1-b', 'northamerica-northeast1-c'],
  },
  terraformHaLifecycleFingerprint: 'sha256:72253930d08afb1ff5d5205675ba8250a6fa43e1f2402732025e40de22e14e20',
};
const repository = 'f5-sales-demo/api-specs-enriched';

/** Verify source, immutable assets, qualification and compiled parser identities independently. */
export async function resolveGcpOperationalRelease(
  fetcher: typeof fetch = fetchGcpRelease,
  signal?: AbortSignal,
  pin: GcpOperationalReleasePin | undefined = GCP_OPERATIONAL_RELEASE_PIN,
  compiledSourceHashes: Record<string, string> = sourceHashes,
): Promise<GcpOperationalContract | undefined> {
  if (!pin) return undefined;
  if (
    !/^v[0-9]+\.[0-9]+\.[0-9]+$/.test(pin.tag) ||
    !/^[a-f0-9]{40}$/.test(pin.sourceCommit) ||
    ![
      pin.profileAssetDigest,
      pin.contractFingerprint,
      pin.qualificationAssetDigest,
      pin.qualificationFingerprint,
    ].every((value) => /^sha256:[a-f0-9]{64}$/.test(value))
  )
    throw new Error('Operational release pin malformed');
  const bounded = signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000);
  const read = async (url: string, maximum = 4 * 1024 * 1024) => {
    bounded.throwIfAborted();
    const response = await fetcher(url, { signal: bounded, headers: { Accept: 'application/vnd.github+json' } });
    if (!response.ok || !response.body) throw new Error('Operational immutable asset unavailable');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        bounded.throwIfAborted();
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maximum) throw new Error('Operational immutable asset exceeds bound');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    bounded.throwIfAborted();
    return Buffer.concat(chunks);
  };
  const decode = (bytes: Uint8Array): Record<string, unknown> => {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Operational release JSON malformed');
    return value;
  };
  const base = `https://api.github.com/repos/${repository}`;
  const release = decode(await read(`${base}/releases/tags/${pin.tag}`));
  if (
    release.tag_name !== pin.tag ||
    release.immutable !== true ||
    release.draft !== false ||
    release.prerelease !== false
  )
    throw new Error('Operational release is not final and immutable');
  const reference = decode(await read(`${base}/git/ref/tags/${pin.tag}`));
  let target = reference.object as { type?: string; sha?: string } | undefined;
  if (target?.type === 'tag' && typeof target.sha === 'string' && /^[a-f0-9]{40}$/.test(target.sha)) {
    const tag = decode(await read(`${base}/git/tags/${target.sha}`));
    target = tag.object as typeof target;
  }
  if (target?.type !== 'commit' || target.sha !== pin.sourceCommit)
    throw new Error('Operational release immutable source differs');
  const asset = async (name: string, digest: string) => {
    if (!Array.isArray(release.assets)) throw new Error('Operational release assets malformed');
    const assets = release.assets.filter(
      (value) => value && typeof value === 'object' && (value as Record<string, unknown>).name === name,
    ) as Array<Record<string, unknown>>;
    const url = `https://github.com/${repository}/releases/download/${pin.tag}/${name}`;
    if (assets.length !== 1 || assets[0].digest !== digest || assets[0].browser_download_url !== url)
      throw new Error('Operational release asset identity differs');
    const bytes = await read(url);
    if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` !== digest)
      throw new Error('Operational release asset bytes differ');
    return decode(bytes);
  };
  const profile = await asset('gcp-operational-health-v2.json', pin.profileAssetDigest);
  const qualification = await asset('gcp-operational-qualification-v2.json', pin.qualificationAssetDigest);
  if (
    !qualifiedOperationalProfile(profile, pin.contractFingerprint) ||
    !qualifiedOperationalRelease(qualification, pin.qualificationFingerprint, pin.contractFingerprint)
  )
    throw new Error('Operational profile or qualification differs');
  if (fingerprint(profile.sourceHashes) !== fingerprint(compiledSourceHashes))
    throw new Error('Operational parser source drift requires explicit requalification');
  if (
    (pin.terraformHaLifecycle !== undefined || pin.terraformHaLifecycleFingerprint !== undefined) &&
    (!qualifiedGcpTerraformHaProfile(pin.terraformHaLifecycle) ||
      pin.terraformHaLifecycle.operationalContractFingerprint !== pin.contractFingerprint ||
      fingerprint(pin.terraformHaLifecycle) !== pin.terraformHaLifecycleFingerprint ||
      fingerprint(qualification.terraformHaLifecycle) !== pin.terraformHaLifecycleFingerprint)
  )
    throw new Error('Operational lifecycle qualification differs');
  return {
    profile,
    contractFingerprint: pin.contractFingerprint,
    qualification,
    qualificationFingerprint: pin.qualificationFingerprint,
    ...(pin.terraformHaLifecycle ? { terraformHaLifecycle: structuredClone(pin.terraformHaLifecycle) } : {}),
  };
}
