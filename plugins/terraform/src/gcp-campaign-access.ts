import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import type { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import { assertSameOriginalInput, monitorOriginalInputs, type OriginalInputBinding } from './original-input-monitor';

type Store = Pick<CeDeploymentStore, 'directory' | 'owner' | 'verify'>;
export interface GcpCampaignAccessRequest {
  platformContext: string;
  sshSourceCidr: string;
}
export interface GcpCampaignPublicAccess {
  schemaVersion: 1;
  cePublicKey: string;
  observerPublicKey: string;
}
export interface GcpCampaignAccessBinding extends GcpCampaignAccessRequest, GcpCampaignPublicAccess {
  intentSha256: string;
}
const fileKeys = ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'] as const;
const parentKeys = ['dev', 'ino', 'uid', 'mode'] as const;
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const magic = Buffer.from('openssh-key-v1\0');
const scalar = (value: number) => {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
};
const wire = (value: Uint8Array | string) => {
  const bytes = Buffer.from(value);
  return Buffer.concat([scalar(bytes.length), bytes]);
};
const publicWire = (bytes: Uint8Array) => Buffer.concat([wire('ssh-ed25519'), wire(bytes)]);
const publicText = (bytes: Uint8Array) => `ssh-ed25519 ${publicWire(bytes).toString('base64')}`;
const same = (a: unknown, b: unknown) => {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) || Array.isArray(b)) return false;
  const left = a as Record<string, unknown>,
    right = b as Record<string, unknown>;
  return (
    Object.keys(left).sort().join(',') === Object.keys(right).sort().join(',') &&
    Object.keys(left).every((key) => left[key] === right[key])
  );
};

function requestScope(store: Store, request: GcpCampaignAccessRequest) {
  const owner = store.owner;
  if (
    owner?.provider !== 'gcp' ||
    owner.engine !== 'terraform' ||
    !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(owner.account) ||
    !/^[a-z]+(?:-[a-z]+)+\d$/.test(owner.region) ||
    !/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(owner.deploymentId) ||
    !request ||
    Object.keys(request).sort().join(',') !== 'platformContext,sshSourceCidr' ||
    typeof request.platformContext !== 'string' ||
    typeof request.sshSourceCidr !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/.test(request.platformContext)
  )
    throw new Error('Exact original GCP campaign access scope required');
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/32$/.exec(request.sshSourceCidr);
  if (
    !match ||
    match[0] !== request.sshSourceCidr ||
    match.slice(1).some((part) => Number(part) > 255 || String(Number(part)) !== part) ||
    [0, 127].includes(Number(match[1])) ||
    Number(match[1]) >= 224 ||
    (Number(match[1]) === 169 && Number(match[2]) === 254)
  )
    throw new Error('One canonical original SSH source IPv4 /32 required');
  return {
    owner: structuredClone(owner),
    request: { platformContext: request.platformContext, sshSourceCidr: request.sshSourceCidr },
  };
}
async function privateDirectory(path: string) {
  if (!isAbsolute(path) || resolve(path) !== path || (await realpath(path)) !== path)
    throw new Error('Canonical original private campaign directory required');
  const parent = await lstat(path, { bigint: true });
  if (
    !parent.isDirectory() ||
    parent.isSymbolicLink() ||
    parent.uid !== BigInt(process.getuid?.() ?? -1) ||
    (parent.mode & 0o777n) !== 0o700n
  )
    throw new Error('Owned private campaign directory required');
}
async function readOriginal(path: string): Promise<{ bytes: Buffer; binding: OriginalInputBinding }> {
  await privateDirectory(dirname(path));
  const before = await lstat(path, { bigint: true });
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1n ||
    before.uid !== BigInt(process.getuid?.() ?? -1) ||
    (before.mode & 0o777n) !== 0o400n ||
    before.size < 1n ||
    before.size > 65536n
  )
    throw new Error('Original private single-link campaign input required');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat({ bigint: true });
    const bytes = await handle.readFile();
    const after = await lstat(path, { bigint: true });
    if (fileKeys.some((key) => before[key] !== opened[key] || before[key] !== after[key]))
      throw new Error('Original campaign input changed during read');
    const parent = await lstat(dirname(path), { bigint: true });
    await privateDirectory(dirname(path));
    return {
      bytes,
      binding: Object.freeze({
        path,
        sha256: hash(bytes),
        expectedIdentity: Object.freeze(
          Object.fromEntries(fileKeys.map((key) => [key, before[key].toString()])),
        ) as OriginalInputBinding['expectedIdentity'],
        expectedParentIdentity: Object.freeze(
          Object.fromEntries(parentKeys.map((key) => [key, parent[key].toString()])),
        ) as OriginalInputBinding['expectedParentIdentity'],
      }),
    };
  } finally {
    await handle.close();
  }
}
async function persist(path: string, bytes: Uint8Array) {
  await privateDirectory(dirname(path));
  const handle = await open(path, 'wx', 0o400);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  const parent = await open(dirname(path), constants.O_RDONLY);
  try {
    await parent.sync();
  } finally {
    await parent.close();
  }
  return (await readOriginal(path)).binding;
}

/** Standard unencrypted OpenSSH Ed25519 envelope, with random checkints and empty comment. */
function generateKey() {
  const pair = generateKeyPairSync('ed25519');
  const jwk = pair.privateKey.export({ format: 'jwk' });
  if (!jwk.d || !jwk.x) throw new Error('Ed25519 private seed unavailable');
  const seed = Buffer.from(jwk.d, 'base64url'),
    pub = Buffer.from(jwk.x, 'base64url');
  const check = randomBytes(4);
  const body = Buffer.concat([
    check,
    check,
    wire('ssh-ed25519'),
    wire(pub),
    wire(Buffer.concat([seed, pub])),
    wire(''),
  ]);
  const padding = Buffer.from(Array.from({ length: 8 - (body.length % 8) }, (_, i) => i + 1));
  const envelope = Buffer.concat([
    magic,
    wire('none'),
    wire('none'),
    wire(''),
    scalar(1),
    wire(publicWire(pub)),
    wire(Buffer.concat([body, padding])),
  ]);
  const keyLabel = 'OPENSSH PRIVATE KEY';
  const privateBytes = Buffer.from(
    `-----BEGIN ${keyLabel}-----\n${envelope
      .toString('base64')
      .match(/.{1,70}/g)
      ?.join('\n')}\n-----END ${keyLabel}-----\n`,
  );
  return { privateBytes, publicKey: publicText(pub) };
}
/** Derive the public key from the actual private seed, then check every OpenSSH envelope field. */
function derivePublic(bytes: Buffer): string {
  const match = /^-----BEGIN OPENSSH PRIVATE KEY-----\n([A-Za-z0-9+/=\n]+)\n-----END OPENSSH PRIVATE KEY-----\n$/.exec(
    bytes.toString(),
  );
  if (!match) throw new Error('Original Ed25519 key envelope required');
  const text = match[1].replaceAll('\n', ''),
    raw = Buffer.from(text, 'base64');
  if (raw.toString('base64') !== text || !raw.subarray(0, magic.length).equals(magic))
    throw new Error('Original key encoding differs');
  let offset = magic.length;
  const number = () => {
    const value = raw.readUInt32BE(offset);
    offset += 4;
    return value;
  };
  const field = () => {
    const size = number();
    if (size > raw.length - offset) throw new Error('Truncated key field');
    const value = raw.subarray(offset, offset + size);
    offset += size;
    return value;
  };
  if (field().toString() !== 'none' || field().toString() !== 'none' || field().length !== 0 || number() !== 1)
    throw new Error('Original unencrypted single Ed25519 key required');
  const outer = field(),
    inner = field();
  if (offset !== raw.length || inner.length % 8 !== 0) throw new Error('Original key framing differs');
  let position = 8;
  const innerField = () => {
    const size = inner.readUInt32BE(position);
    position += 4;
    if (size > inner.length - position) throw new Error('Truncated private key field');
    const value = inner.subarray(position, position + size);
    position += size;
    return value;
  };
  if (!inner.subarray(0, 4).equals(inner.subarray(4, 8)) || innerField().toString() !== 'ssh-ed25519')
    throw new Error('Original key checkints or algorithm differ');
  const pub = innerField(),
    secret = innerField(),
    comment = innerField();
  const padding = inner.subarray(position);
  if (
    pub.length !== 32 ||
    secret.length !== 64 ||
    !secret.subarray(32).equals(pub) ||
    comment.length ||
    padding.length < 1 ||
    padding.length > 8 ||
    padding.some((value, index) => value !== index + 1) ||
    !outer.equals(publicWire(pub))
  )
    throw new Error('Original private key fields differ');
  const privateKey = createPrivateKey({
    key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), secret.subarray(0, 32)]),
    format: 'der',
    type: 'pkcs8',
  });
  const derived = createPublicKey(privateKey).export({ format: 'jwk' });
  if (!derived.x || !Buffer.from(derived.x, 'base64url').equals(pub))
    throw new Error('Original private/public correspondence differs');
  return publicText(pub);
}

/** Generate once before planning. Existing partial directories are preserved and refuse recreation. */
export async function prepareOriginalGcpCampaignAccess(
  store: Store,
  request: GcpCampaignAccessRequest,
): Promise<Readonly<GcpCampaignPublicAccess>> {
  request = { ...request };
  const scope = requestScope(store, request);
  await store.verify();
  await privateDirectory(store.directory);
  const root = join(store.directory, 'gcp-campaign-access');
  try {
    await lstat(root);
    return (await readOriginalGcpCampaignAccess(store, request)).publicAccess;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  for (const name of [
    'deployment.json',
    'gcp-terraform-input-identity.json',
    'gcp-tf-deploy-original-authorization.json',
  ]) {
    try {
      await lstat(join(store.directory, name));
      throw new Error('Existing deployment cannot mint new campaign keys');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  try {
    await mkdir(root, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    return (await readOriginalGcpCampaignAccess(store, request)).publicAccess;
  }
  const ce = generateKey(),
    observer = generateKey();
  const inputs = {
    ce_key: await persist(join(root, 'ce_key'), ce.privateBytes),
    observer_key: await persist(join(root, 'observer_key'), observer.privateBytes),
  };
  const publicAccess = { schemaVersion: 1 as const, cePublicKey: ce.publicKey, observerPublicKey: observer.publicKey };
  await persist(
    join(root, 'manifest.private.json'),
    Buffer.from(JSON.stringify({ schemaVersion: 1, ...scope, publicAccess, inputs })),
  );
  return (await readOriginalGcpCampaignAccess(store, request)).publicAccess;
}

/** Trusted server-only input handoff. No tool returns this private manifest or file identities. */
export async function readOriginalGcpCampaignAccess(
  store: Store,
  request: GcpCampaignAccessRequest,
  intentSha256?: string,
) {
  const scope = requestScope(store, request);
  await store.verify();
  await privateDirectory(store.directory);
  const root = join(store.directory, 'gcp-campaign-access');
  const manifest = await readOriginal(join(root, 'manifest.private.json'));
  const saved = JSON.parse(manifest.bytes.toString());
  if (
    saved.schemaVersion !== 1 ||
    !same(saved.owner, scope.owner) ||
    !same(saved.request, scope.request) ||
    saved.publicAccess?.schemaVersion !== 1 ||
    Object.keys(saved.inputs ?? {})
      .sort()
      .join(',') !== 'ce_key,observer_key'
  )
    throw new Error('Original campaign key scope differs');
  const inputs: Record<string, OriginalInputBinding> = { campaign_manifest: manifest.binding };
  for (const name of ['ce_key', 'observer_key']) {
    const path = join(root, name),
      key = await readOriginal(path);
    assertSameOriginalInput(saved.inputs[name], key.binding);
    const publicKey = derivePublic(key.bytes);
    if (publicKey !== saved.publicAccess[name === 'ce_key' ? 'cePublicKey' : 'observerPublicKey'])
      throw new Error('Original campaign public/private key mismatch');
    inputs[name] = key.binding;
  }
  if (saved.publicAccess.cePublicKey === saved.publicAccess.observerPublicKey)
    throw new Error('Distinct original campaign keys required');
  if (intentSha256 !== undefined && !/^[a-f0-9]{64}$/.test(intentSha256))
    throw new Error('Exact original intent hash required');
  let claim: Awaited<ReturnType<typeof lstat>> | undefined;
  try {
    await privateDirectory(join(root, 'intent-binding-claim'));
    claim = await lstat(join(root, 'intent-binding-claim'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  let binding: Awaited<ReturnType<typeof readOriginal>> | undefined;
  try {
    binding = await readOriginal(join(root, 'intent-binding.private.json'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || claim || intentSha256 !== undefined) throw error;
  }
  if (binding) {
    const original = JSON.parse(binding.bytes.toString());
    if (
      !claim ||
      original.schemaVersion !== 1 ||
      !/^[a-f0-9]{64}$/.test(original.intentSha256) ||
      (intentSha256 !== undefined && original.intentSha256 !== intentSha256) ||
      parentKeys.some((key) => String(claim[key]) !== original.claim?.[key])
    )
      throw new Error('Original key intent binding differs');
    assertSameOriginalInput(original.manifest, manifest.binding);
    inputs.campaign_intent = binding.binding;
  }
  const monitor = await monitorOriginalInputs(inputs);
  try {
    await store.verify();
    await monitor.assertOriginal();
  } finally {
    monitor.close();
  }
  return Object.freeze({
    publicAccess: Object.freeze({
      schemaVersion: 1 as const,
      cePublicKey: saved.publicAccess.cePublicKey as string,
      observerPublicKey: saved.publicAccess.observerPublicKey as string,
    }),
    inputs: Object.freeze(inputs),
  });
}

/** Single-use immutable intent binding before configuration preparation, with idempotent original resumes. */
export async function bindOriginalGcpCampaignAccess(store: Store, binding: GcpCampaignAccessBinding): Promise<void> {
  binding = { ...binding };
  if (
    Object.keys(binding).sort().join(',') !==
      'cePublicKey,intentSha256,observerPublicKey,platformContext,schemaVersion,sshSourceCidr' ||
    binding.schemaVersion !== 1 ||
    !/^[a-f0-9]{64}$/.test(binding.intentSha256)
  )
    throw new Error('Exact original campaign intent binding required');
  const request = { platformContext: binding.platformContext, sshSourceCidr: binding.sshSourceCidr };
  const original = await readOriginalGcpCampaignAccess(store, request);
  if (
    original.publicAccess.cePublicKey !== binding.cePublicKey ||
    original.publicAccess.observerPublicKey !== binding.observerPublicKey
  )
    throw new Error('Original campaign intent public keys differ');
  const path = join(store.directory, 'gcp-campaign-access', 'intent-binding.private.json');
  const claimPath = join(store.directory, 'gcp-campaign-access', 'intent-binding-claim');
  let claimed = false;
  try {
    await mkdir(claimPath, { mode: 0o700 });
    claimed = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  if (claimed) {
    const claim = await lstat(claimPath);
    await persist(
      path,
      Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          intentSha256: binding.intentSha256,
          manifest: original.inputs.campaign_manifest,
          claim: Object.fromEntries(parentKeys.map((key) => [key, String(claim[key])])),
        }),
      ),
    );
  }
  await readOriginalGcpCampaignAccess(store, request, binding.intentSha256);
}
