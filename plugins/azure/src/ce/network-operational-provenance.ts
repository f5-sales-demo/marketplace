import { createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID, sign, verify } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { ExpectedCeForwardingRoutes } from '../../../platform/src/ce/forwarding-route';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import { guardAzureCeApplyObject } from './apply-request';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256, canonicalStringify } from './canonical';
import { publishImmutableCeReceipt, readImmutableCeReceipt } from './immutable-receipt-publication';
import { collectAzureNetworkOperationalReadings } from './network-operational-readings';
import type { AzureTerraformNetworkAcceptanceIdentity } from './terraform-network-checkpoint';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

type Runtime = Parameters<typeof collectAzureNetworkOperationalReadings>[2];
type Cloud = Parameters<typeof collectAzureNetworkOperationalReadings>[3];
type Identity = AzureTerraformNetworkAcceptanceIdentity;
type Readings = Awaited<ReturnType<typeof collectAzureNetworkOperationalReadings>>;
type Json = Record<string, unknown>;
const keyName = 'azure-network-observer-key.json';
const anchorName = 'azure-network-observer-issuer.json';
const retiredName = 'azure-network-observer-retired.json';
const publicationPrefix = 'azure-network-observation';
const same = (a: unknown, b: unknown) => canonicalSha256(a) === canonicalSha256(b);
const digest = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require(value: unknown, reason: string): asserts value {
  if (!value) throw Error(`Azure operational acquisition provenance: ${reason}`);
}
function object(value: unknown): Json {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed private record');
  return value as Json;
}
function keys(value: unknown, names: string[]) {
  require(same(Object.keys(object(value)).sort(), names.toSorted()), 'private schema differs');
}
function bytes(value: unknown, size?: number) {
  require(typeof value === 'string' &&
    value.length <= 4096 &&
    /^[A-Za-z0-9_-]+$/.test(value), 'key or signature encoding differs');
  const raw = Buffer.from(value, 'base64url');
  require(raw.toString('base64url') === value &&
    (size === undefined || raw.length === size), 'key or signature bytes differ');
  return raw;
}
async function optional(store: CeDeploymentStore, name: string) {
  try {
    return await store.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
export type AzureOperationalAcquisitionPurpose = 'preflight' | 'restored' | 'final';
export interface AzureOperationalAcquisitionReference {
  schemaVersion: 1;
  kind: 'azure-network-operational-acquisition-reference';
  owner: CeDeploymentStore['owner'];
  planSha256: string;
  identitySha256: string;
  invocationId: string;
  purpose: AzureOperationalAcquisitionPurpose;
  issuerSha256: string;
  publicationSha256: string;
}

/** Local owning-collector execution provenance, not a vendor-signed heartbeat or acceptance.
 * Only collect() signs: it invokes the real collector and never accepts caller-supplied readings.
 * Current authentication also requires this process's acquisition; historical authentication
 * verifies signed originally collected facts, including unknown states. No mutation gate is granted.
 * Reopening requires an original issuer pin retained by the owning workflow independently of
 * the mutable storage pointer and the candidate reference. No pin means unknown provenance.
 * The private key is confined to owned storage; retire() removes it while retaining public proof.
 */
export function createAzureOperationalAcquisitionCollector(
  request: AzureCePlan,
  transport: Runtime,
  cloud: Cloud,
  storage: CeDeploymentStore,
  forwarding?: ExpectedCeForwardingRoutes,
  trustedIssuerSha256?: string,
  originalIssuerPublication?: (issuerSha256: string, signal: AbortSignal) => Promise<void>,
) {
  const plan = structuredClone(request),
    owner = structuredClone(storage.owner),
    directory = storage.directory,
    reviewed = forwarding === undefined ? undefined : structuredClone(forwarding),
    requestSha = canonicalSha256(request),
    reviewedSha = forwarding === undefined ? undefined : canonicalSha256(forwarding);
  require(trustedIssuerSha256 === undefined || digest(trustedIssuerSha256), 'retained issuer pin malformed');
  require(originalIssuerPublication === undefined ||
    typeof originalIssuerPublication === 'function', 'owning issuer publisher malformed');
  verifyAzureCePlan(plan);
  require(plan.engine === 'terraform' &&
    plan.intent.operation === 'update-network' &&
    same(owner, azureUpgradeBinding(plan).owner), 'owning Terraform network plan required');
  const seal = () => {
    require(canonicalSha256(request) === requestSha &&
      canonicalSha256(plan) === requestSha &&
      storage.directory === directory &&
      same(storage.owner, owner) &&
      transport.engine === 'terraform' &&
      (forwarding === undefined
        ? reviewed === undefined
        : canonicalSha256(forwarding) === reviewedSha &&
          canonicalSha256(reviewed) === reviewedSha), 'owning collector context changed');
  };
  const runtime = guardAzureCeApplyObject(transport, seal, {}, ['engine']),
    api = guardAzureCeApplyObject(cloud, seal),
    store = guardAzureCeApplyObject(storage, seal, {}, ['owner', 'directory']);
  const acquired = new Map<string, { publicationSha256: string; identitySha256: string; started: number }>();
  let anchored: string | undefined = trustedIssuerSha256;
  const operation = async <T>(signal: AbortSignal | undefined, work: (signal: AbortSignal) => Promise<T>) => {
    const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
    const step = async <V>(task: () => Promise<V>) => {
      seal();
      deadline.throwIfAborted();
      const abort = Promise.withResolvers<never>(),
        onAbort = () => abort.reject(deadline.reason);
      deadline.addEventListener('abort', onAbort, { once: true });
      try {
        const result = await Promise.race([Promise.resolve().then(task), abort.promise]);
        seal();
        deadline.throwIfAborted();
        return result;
      } finally {
        deadline.removeEventListener('abort', onAbort);
      }
    };
    await step(() => store.verify());
    // If cancellation wins while the atomic claim is being created, release that exact
    // eventual claim before returning. Never leave a late-acquired lock behind.
    const claiming = acquireProcessLock(`${directory}/.azure-operational-acquisition-lock`);
    let unlock: () => Promise<void>;
    try {
      unlock = await step(() => claiming);
    } catch (error) {
      await claiming.then(
        (release) => release(),
        () => {},
      );
      throw error;
    }
    try {
      return await step(() => work(deadline));
    } finally {
      await unlock();
    }
  };
  const issuer = async (signal: AbortSignal, create: boolean) => {
    let pointer = await optional(store, anchorName);
    signal.throwIfAborted();
    const initializing = pointer === undefined && create && anchored === undefined;
    if (pointer === undefined && !create && anchored !== undefined)
      pointer = { schemaVersion: 1, owner, issuerSha256: anchored };
    if (pointer === undefined && create) {
      let secret = await optional(store, keyName);
      if (secret === undefined) {
        require(anchored === undefined, 'original retained signing material missing');
        signal.throwIfAborted();
        const pair = generateKeyPairSync('ed25519', {
          publicKeyEncoding: { type: 'spki', format: 'der' },
          privateKeyEncoding: { type: 'pkcs8', format: 'der' },
        });
        secret = {
          schemaVersion: 1,
          owner,
          publicKey: pair.publicKey.toString('base64url'),
          signingMaterial: pair.privateKey.toString('base64url'),
        };
        await store.write(keyName, secret, signal);
      }
      keys(secret, ['schemaVersion', 'owner', 'publicKey', 'signingMaterial']);
      const value = object(secret);
      require(value.schemaVersion === 1 && same(value.owner, owner), 'private signing owner differs');
      const privateKey = createPrivateKey({ key: bytes(value.signingMaterial), type: 'pkcs8', format: 'der' });
      require(privateKey.asymmetricKeyType === 'ed25519' &&
        createPublicKey(privateKey)
          .export({ type: 'spki', format: 'der' })
          .equals(bytes(value.publicKey)), 'private signing key differs');
      const record = { schemaVersion: 1, kind: 'azure-network-operational-issuer', owner, publicKey: value.publicKey };
      require(anchored === undefined || canonicalSha256(record) === anchored, 'retained issuer private key differs');
      if (anchored !== undefined) await readImmutableCeReceipt(store, 'azure-network-issuer', anchored, signal);
      const publication = await publishImmutableCeReceipt(store, 'azure-network-issuer', record, signal);
      if (originalIssuerPublication) {
        await originalIssuerPublication(publication.publicationSha256, signal);
        signal.throwIfAborted();
      }
      pointer = { schemaVersion: 1, owner, issuerSha256: publication.publicationSha256 };
      await store.write(anchorName, pointer, signal);
    }
    keys(pointer, ['schemaVersion', 'owner', 'issuerSha256']);
    const anchor = object(pointer);
    require(anchor.schemaVersion === 1 &&
      same(anchor.owner, owner) &&
      digest(anchor.issuerSha256) &&
      (initializing || (anchored !== undefined && anchored === anchor.issuerSha256)), 'pinned issuer differs');
    const publication = await readImmutableCeReceipt(store, 'azure-network-issuer', anchor.issuerSha256, signal);
    const record = object(publication.record);
    keys(record, ['schemaVersion', 'kind', 'owner', 'publicKey']);
    require(record.schemaVersion === 1 &&
      record.kind === 'azure-network-operational-issuer' &&
      same(record.owner, owner), 'issuer ownership differs');
    const publicKey = createPublicKey({ key: bytes(record.publicKey), type: 'spki', format: 'der' });
    require(publicKey.asymmetricKeyType === 'ed25519', 'issuer algorithm differs');
    anchored = anchor.issuerSha256;
    return { digest: anchored, publicKey, record };
  };
  const signingKey = async (record: Json) => {
    const raw = object(await store.read(keyName));
    keys(raw, ['schemaVersion', 'owner', 'publicKey', 'signingMaterial']);
    require(raw.schemaVersion === 1 &&
      same(raw.owner, owner) &&
      raw.publicKey === record.publicKey, 'signing owner or issuer differs');
    const key = createPrivateKey({ key: bytes(raw.signingMaterial), type: 'pkcs8', format: 'der' });
    require(key.asymmetricKeyType === 'ed25519' &&
      createPublicKey(key)
        .export({ type: 'spki', format: 'der' })
        .equals(bytes(record.publicKey)), 'signing material differs');
    return key;
  };
  return {
    async collect(
      identity: Identity,
      purpose: AzureOperationalAcquisitionPurpose,
      signal?: AbortSignal,
      collectTraffic = false,
    ): Promise<AzureOperationalAcquisitionReference> {
      const expected = structuredClone(identity),
        expectedSha = canonicalSha256(identity),
        started = performance.now();
      return operation(signal, async (deadline) => {
        require(['preflight', 'restored', 'final'].includes(purpose) &&
          same(expected.owner, owner) &&
          expected.planSha256 === plan.planSha256 &&
          canonicalSha256(identity) === expectedSha, 'requested acquisition identity differs');
        require((await optional(store, retiredName)) === undefined, 'signing key retired');
        const readings = await collectAzureNetworkOperationalReadings(
          plan,
          expected,
          runtime,
          api,
          store,
          deadline,
          collectTraffic,
          reviewed,
        );
        require(canonicalSha256(identity) === expectedSha &&
          same(readings.owner, owner) &&
          readings.planSha256 === plan.planSha256 &&
          readings.node === expected.node &&
          readings.siteUid === expected.siteUid, 'acquired identity changed');
        const original = await issuer(deadline, true),
          key = await signingKey(original.record),
          invocationId = randomUUID();
        const payload = {
          schemaVersion: 1,
          kind: 'azure-network-operational-acquisition',
          issuerSha256: original.digest,
          invocationId,
          purpose,
          identity: expected,
          readings,
        };
        const signature = sign(null, Buffer.from(canonicalStringify(payload)), key).toString('base64url');
        const publication = await publishImmutableCeReceipt(store, publicationPrefix, { payload, signature }, deadline);
        require(canonicalSha256(identity) === expectedSha &&
          (await issuer(deadline, false)).digest === original.digest &&
          verify(
            null,
            Buffer.from(canonicalStringify(payload)),
            original.publicKey,
            bytes(signature, 64),
          ), 'execution publication changed');
        acquired.set(invocationId, {
          publicationSha256: publication.publicationSha256,
          identitySha256: expectedSha,
          started,
        });
        return {
          schemaVersion: 1,
          kind: 'azure-network-operational-acquisition-reference',
          owner: structuredClone(owner),
          planSha256: plan.planSha256,
          identitySha256: expectedSha,
          invocationId,
          purpose,
          issuerSha256: original.digest,
          publicationSha256: publication.publicationSha256,
        };
      });
    },
    async authenticate(
      reference: AzureOperationalAcquisitionReference,
      identity: Identity,
      purpose: AzureOperationalAcquisitionPurpose,
      mode: 'current' | 'historical',
      signal?: AbortSignal,
    ) {
      const receipt = structuredClone(reference),
        expected = structuredClone(identity),
        referenceSha = canonicalSha256(reference),
        identitySha = canonicalSha256(identity);
      return operation(signal, async (deadline) => {
        keys(receipt, [
          'schemaVersion',
          'kind',
          'owner',
          'planSha256',
          'identitySha256',
          'invocationId',
          'purpose',
          'issuerSha256',
          'publicationSha256',
        ]);
        require(['current', 'historical'].includes(mode) &&
          ['preflight', 'restored', 'final'].includes(purpose) &&
          receipt.purpose === purpose &&
          receipt.schemaVersion === 1 &&
          receipt.kind === 'azure-network-operational-acquisition-reference' &&
          same(receipt.owner, owner) &&
          same(expected.owner, owner) &&
          receipt.planSha256 === plan.planSha256 &&
          expected.planSha256 === plan.planSha256 &&
          receipt.identitySha256 === identitySha &&
          digest(receipt.issuerSha256) &&
          digest(receipt.publicationSha256) &&
          /^[a-f0-9-]{36}$/.test(receipt.invocationId), 'receipt reference identity differs');
        const original = await issuer(deadline, false);
        require(receipt.issuerSha256 === original.digest, 'receipt issuer differs');
        const published = await readImmutableCeReceipt(store, publicationPrefix, receipt.publicationSha256, deadline),
          record = object(published.record);
        keys(record, ['payload', 'signature']);
        const payload = object(record.payload);
        keys(payload, ['schemaVersion', 'kind', 'issuerSha256', 'invocationId', 'purpose', 'identity', 'readings']);
        require(payload.schemaVersion === 1 &&
          payload.kind === 'azure-network-operational-acquisition' &&
          payload.issuerSha256 === original.digest &&
          payload.invocationId === receipt.invocationId &&
          payload.purpose === purpose &&
          same(payload.identity, expected) &&
          verify(
            null,
            Buffer.from(canonicalStringify(payload)),
            original.publicKey,
            bytes(record.signature, 64),
          ), 'original execution signature differs');
        const readings = object(payload.readings);
        require(readings.schemaVersion === 1 &&
          readings.scope === 'current-network-operational-readings' &&
          same(readings.owner, owner) &&
          readings.planSha256 === plan.planSha256 &&
          readings.node === expected.node &&
          readings.siteUid === expected.siteUid, 'signed acquisition scope differs');
        if (mode === 'current') {
          const invocation = acquired.get(receipt.invocationId);
          // This bounds local acquisition reuse. It is never original CE heartbeat freshness.
          require(invocation &&
            invocation.publicationSha256 === receipt.publicationSha256 &&
            invocation.identitySha256 === identitySha &&
            performance.now() - invocation.started <= 180000 &&
            (await optional(store, retiredName)) === undefined, 'current acquisition unavailable');
        }
        require(canonicalSha256(reference) === referenceSha &&
          canonicalSha256(identity) === identitySha &&
          (await issuer(deadline, false)).digest === original.digest, 'authentication context changed');
        return {
          status: 'authenticated' as const,
          scope: 'owning-network-operational-acquisition' as const,
          mode,
          purpose,
          readings: structuredClone(readings) as unknown as Readings,
          evidenceSha256: receipt.publicationSha256,
          originalSampleFreshness: 'unqualified' as const,
          operationalAcceptance: 'unknown' as const,
          canSatisfyInterfaceMutationGate: false as const,
        };
      });
    },
    async retireSigningMaterial(signal?: AbortSignal) {
      return operation(signal, async (deadline) => {
        const original = await issuer(deadline, false);
        let marker = await optional(store, retiredName);
        if (marker === undefined) {
          const key = await signingKey(original.record),
            payload = {
              schemaVersion: 1,
              kind: 'azure-network-observer-key-retired',
              owner,
              issuerSha256: original.digest,
            };
          marker = {
            payload,
            signature: sign(null, Buffer.from(canonicalStringify(payload)), key).toString('base64url'),
          };
          await store.write(retiredName, marker, deadline);
        }
        keys(marker, ['payload', 'signature']);
        const value = object(marker),
          expected = {
            schemaVersion: 1,
            kind: 'azure-network-observer-key-retired',
            owner,
            issuerSha256: original.digest,
          };
        require(same(value.payload, expected) &&
          verify(
            null,
            Buffer.from(canonicalStringify(expected)),
            original.publicKey,
            bytes(value.signature, 64),
          ), 'key retirement provenance differs');
        const key = await optional(store, keyName);
        if (key !== undefined) {
          await signingKey(original.record);
          deadline.throwIfAborted();
          await store.remove(keyName);
        }
        require((await optional(store, keyName)) === undefined &&
          same(await store.read(retiredName), marker) &&
          (await issuer(deadline, false)).digest === original.digest, 'signing material retirement incomplete');
        acquired.clear();
        return {
          status: 'retired' as const,
          scope: 'operational-observer-signing-material' as const,
          issuerSha256: original.digest,
          historicalPublicProofRetained: true as const,
        };
      });
    },
  };
}
