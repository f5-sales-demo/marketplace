import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
  sign,
  verify,
} from 'node:crypto';
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { parseNodeHealthJson } from '../../../platform/src/ce/node-health';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import { guardAzureCeApplyObject } from './apply-request';
import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256, canonicalSnapshot, canonicalStringify } from './canonical';
import { publishImmutableCeReceipt, readImmutableCeReceipt } from './immutable-receipt-publication';
import { readAzureTerraformParentPrivateFile } from './terraform-parent-file-custody';
import type { AzureCePlan } from './types';

type Json = Record<string, unknown>;
export type AzureAcquisitionFamily = 'network' | 'replacement' | 'replacement-readings';
export interface AzureAcquisitionContract<Identity, Purpose extends string, Readings> {
  family: AzureAcquisitionFamily;
  verifyContext(): void;
  validateSource(source: AzureCePlan, owner: CeDeploymentStore['owner']): void;
  validateIdentity(identity: unknown, source: AzureCePlan, owner: CeDeploymentStore['owner']): void;
  validateReadings(readings: unknown, identity: unknown, source: AzureCePlan, owner: CeDeploymentStore['owner']): void;
  validatePurpose(purpose: unknown): void;
  collectReadings(
    identity: Identity,
    purpose: Purpose,
    signal: AbortSignal,
    collectTraffic: boolean,
  ): Promise<Readings>;
}
export interface AzureAcquisitionReference<Family extends AzureAcquisitionFamily, Purpose extends string> {
  schemaVersion: 1;
  kind: `azure-${Family}-operational-acquisition-reference`;
  owner: CeDeploymentStore['owner'];
  planSha256: string;
  identitySha256: string;
  invocationId: string;
  purpose: Purpose;
  issuerSha256: string;
  publicationSha256: string;
}
const same = canonicalEqual;
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
/** Local owning-collector execution provenance, not a vendor-signed heartbeat or acceptance.
 * Only collect() signs: it invokes the real collector and never accepts caller-supplied readings.
 * Current authentication also requires this process's acquisition; historical authentication
 * verifies signed originally collected facts, including unknown states. No mutation gate is granted.
 * Reopening requires an original issuer pin retained by the owning workflow independently of
 * the mutable storage pointer and the candidate reference. No pin means unknown provenance.
 * The private key is confined to owned storage; retire() removes it while retaining public proof.
 */
export function createAzureOperationalAcquisitionCustody<
  Family extends AzureAcquisitionFamily,
  Identity extends { owner: CeDeploymentStore['owner']; planSha256: string },
  Purpose extends string,
  Readings,
>(
  request: AzureCePlan,
  storage: CeDeploymentStore,
  definition: AzureAcquisitionContract<Identity, Purpose, Readings> & { family: Family },
  trustedIssuerSha256?: string,
  originalIssuerPublication?: (issuerSha256: string, signal: AbortSignal) => Promise<void>,
  loadOriginalSource?: (planSha256: string, signal: AbortSignal) => Promise<AzureCePlan>,
) {
  const plan = structuredClone(request),
    owner = structuredClone(storage.owner),
    directory = storage.directory,
    family = definition.family,
    requestMatches = canonicalSnapshot(request);
  require(family === 'network' ||
    family === 'replacement' ||
    family === 'replacement-readings', 'distinct supported acquisition family required');
  const keyName = `azure-${family}-observer-key.json`,
    anchorName = `azure-${family}-observer-issuer.json`,
    retiredName = `azure-${family}-observer-retired.json`,
    publicationPrefix = `azure-${family}-observation`,
    issuerPrefix = `azure-${family}-issuer`,
    lockName =
      family === 'network' ? '.azure-operational-acquisition-lock' : `.azure-${family}-operational-acquisition-lock`;
  require(trustedIssuerSha256 === undefined || digest(trustedIssuerSha256), 'retained issuer pin malformed');
  require(originalIssuerPublication === undefined ||
    typeof originalIssuerPublication === 'function', 'owning issuer publisher malformed');
  verifyAzureCePlan(plan);
  definition.validateSource(plan, owner);
  const methodNames = [
    'verifyContext',
    'validateSource',
    'validateIdentity',
    'validateReadings',
    'validatePurpose',
    'collectReadings',
  ] as const;
  const callbacks = methodNames.map((name) => definition[name]);
  const seal = () => {
    require(requestMatches(request) &&
      requestMatches(plan) &&
      storage.directory === directory &&
      same(storage.owner, owner) &&
      definition.family === family &&
      methodNames.every((name, i) => definition[name] === callbacks[i]), 'owning collector context changed');
    definition.verifyContext();
  };
  const contract = guardAzureCeApplyObject(definition, seal, {}, ['family']),
    store = guardAzureCeApplyObject(storage, seal, {}, ['owner', 'directory']);
  const acquired = new Map<string, { publicationSha256: string; identitySha256: string; started: number }>();
  let anchored: string | undefined = trustedIssuerSha256;
  const operation = async <T>(
    signal: AbortSignal | undefined,
    work: (signal: AbortSignal) => Promise<T>,
    exclusive = true,
  ) => {
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
    if (!exclusive) return step(() => work(deadline));
    // If cancellation wins while the atomic claim is being created, release that exact
    // eventual claim before returning. Never leave a late-acquired lock behind.
    const claiming = acquireProcessLock(`${directory}/${lockName}`);
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
      const record = {
        schemaVersion: 1,
        kind: `azure-${family}-operational-issuer`,
        owner,
        publicKey: value.publicKey,
      };
      require(anchored === undefined || canonicalSha256(record) === anchored, 'retained issuer private key differs');
      if (anchored !== undefined) await readImmutableCeReceipt(store, issuerPrefix, anchored, signal);
      const publication = await publishImmutableCeReceipt(store, issuerPrefix, record, signal);
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
    const publication = await readImmutableCeReceipt(store, issuerPrefix, anchor.issuerSha256, signal);
    const record = object(publication.record);
    keys(record, ['schemaVersion', 'kind', 'owner', 'publicKey']);
    require(record.schemaVersion === 1 &&
      record.kind === `azure-${family}-operational-issuer` &&
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
  const authenticateObservation = (
    original: Awaited<ReturnType<typeof issuer>>,
    published: Awaited<ReturnType<typeof readImmutableCeReceipt>>,
    source: AzureCePlan,
  ) => {
    verifyAzureCePlan(source);
    contract.validateSource(source, owner);
    const record = object(published.record);
    keys(record, ['payload', 'signature']);
    const payload = object(record.payload);
    keys(payload, ['schemaVersion', 'kind', 'issuerSha256', 'invocationId', 'purpose', 'identity', 'readings']);
    const identity = object(payload.identity),
      readings = object(payload.readings);
    contract.validateIdentity(identity, source, owner);
    contract.validatePurpose(payload.purpose);
    require(payload.schemaVersion === 1 &&
      payload.kind === `azure-${family}-operational-acquisition` &&
      payload.issuerSha256 === original.digest &&
      typeof payload.invocationId === 'string' &&
      /^[a-f0-9-]{36}$/.test(payload.invocationId) &&
      verify(
        null,
        Buffer.from(canonicalStringify(payload)),
        original.publicKey,
        bytes(record.signature, 64),
      ), 'original execution signature differs from source');
    contract.validateReadings(readings, identity, source, owner);
    return { payload, identity, readings };
  };
  const retirementMarker = (marker: unknown, original: Awaited<ReturnType<typeof issuer>>) => {
    keys(marker, ['payload', 'signature']);
    const value = object(marker),
      expected = {
        schemaVersion: 1,
        kind: `azure-${family}-observer-key-retired`,
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
  };
  // Exhaustive owning observer namespace, not a filename allowlist or operational gate.
  // Every observation needs the independently loaded original public source and issuer signature.
  const inspectRetirementInventory = async (deadline: AbortSignal) => {
    const names = async () =>
      (await readdir(directory))
        .filter((name) =>
          [`azure-${family}-observer-`, `azure-${family}-issuer-`, `azure-${family}-observation-`].some((prefix) =>
            name.startsWith(prefix),
          ),
        )
        .sort();
    const root = await lstat(directory);
    const rootIdentity = `${root.dev}:${root.ino}:${root.birthtimeMs}`;
    const before = await names(),
      original = await issuer(deadline, false);
    const artifacts: Array<{
      path: string;
      identity: string;
      sha256: string;
      action: 'preserve' | 'delete';
      schema: string;
      packetSha256: string;
      semanticProvenanceSha256: string;
    }> = [];
    const invocations = new Set<string>();
    for (const path of before) {
      deadline.throwIfAborted();
      seal();
      const native = await readAzureTerraformParentPrivateFile(join(directory, path), deadline);
      let record: unknown,
        schema: string,
        provenance: unknown,
        action: 'preserve' | 'delete' = 'preserve';
      if (path === keyName) {
        await signingKey(original.record);
        record = await store.read(path);
        schema = `azure-${family}-observer-signing-key-v1`;
        action = 'delete';
        provenance = { owner, issuerSha256: original.digest };
      } else if (path === anchorName) {
        record = await store.read(path);
        require(same(record, { schemaVersion: 1, owner, issuerSha256: original.digest }), 'issuer pointer differs');
        schema = `azure-${family}-observer-issuer-pointer-v1`;
        provenance = { owner, issuerSha256: original.digest };
      } else if (path === retiredName) {
        record = await store.read(path);
        retirementMarker(record, original);
        schema = `azure-${family}-observer-retirement-v1`;
        provenance = record;
      } else if (path === `${issuerPrefix}-${original.digest}.json`) {
        record = (await readImmutableCeReceipt(store, issuerPrefix, original.digest, deadline)).record;
        require(same(record, original.record), 'original issuer record changed');
        schema = `azure-${family}-operational-issuer-v1`;
        provenance = { owner, issuerSha256: original.digest };
      } else {
        const match = new RegExp(`^${publicationPrefix}-([a-f0-9]{64})\\.json$`).exec(path);
        require(match, 'unclassified or incomplete observer artifact');
        const published = await readImmutableCeReceipt(store, publicationPrefix, match[1], deadline);
        const sourceSha = object(object(object(published.record).payload).identity).planSha256;
        require(digest(sourceSha), 'observation source digest malformed');
        const source = loadOriginalSource ? await loadOriginalSource(sourceSha, deadline) : plan;
        deadline.throwIfAborted();
        seal();
        require(source.planSha256 === sourceSha, 'original observation source unavailable');
        const authenticated = authenticateObservation(original, published, source);
        require(!invocations.has(authenticated.payload.invocationId as string), 'duplicate acquisition invocation');
        invocations.add(authenticated.payload.invocationId as string);
        record = published.record;
        schema = `azure-${family}-operational-acquisition-v1`;
        provenance = {
          owner,
          sourcePlanSha256: sourceSha,
          issuerSha256: original.digest,
          identitySha256: canonicalSha256(authenticated.identity),
          invocationId: authenticated.payload.invocationId,
          purpose: authenticated.payload.purpose,
        };
      }
      require(same(
        parseNodeHealthJson(native.bytes.toString('utf8')),
        record,
      ), 'native observer packet differs from semantic record');
      artifacts.push({
        path,
        identity: native.identity,
        sha256: createHash('sha256').update(native.bytes).digest('hex'),
        action,
        schema,
        packetSha256: canonicalSha256(record),
        semanticProvenanceSha256: canonicalSha256(provenance),
      });
    }
    require(same(before, await names()), 'observer namespace changed during authentication');
    for (const file of artifacts) {
      deadline.throwIfAborted();
      const native = await readAzureTerraformParentPrivateFile(join(directory, file.path), deadline);
      require(native.identity === file.identity &&
        createHash('sha256').update(native.bytes).digest('hex') === file.sha256 &&
        canonicalSha256(await store.read(file.path)) === file.packetSha256, 'authenticated observer record changed');
    }
    require((await issuer(deadline, false)).digest === original.digest &&
      same(before, await names()), 'observer inventory changed');
    const finalRoot = await lstat(directory);
    require(`${finalRoot.dev}:${finalRoot.ino}:${finalRoot.birthtimeMs}` ===
      rootIdentity, 'observer directory changed');
    return {
      status: 'authenticated' as const,
      scope: 'owning-observer-artifact-disposition' as const,
      owner: structuredClone(owner),
      issuerSha256: original.digest,
      artifacts,
      signingMaterialPresent: before.includes(keyName),
      operationalAcceptance: 'unknown' as const,
      canSatisfyInterfaceMutationGate: false as const,
    };
  };
  const unchangedProof = (
    before: Awaited<ReturnType<typeof inspectRetirementInventory>>,
    after: Awaited<ReturnType<typeof inspectRetirementInventory>>,
  ) => {
    const proof = (inventory: typeof before) =>
      inventory.artifacts.filter((file) => file.path !== keyName && file.path !== retiredName);
    require(same(proof(before), proof(after)), 'historical observer proof changed during retirement');
  };
  return {
    authenticateRetirementInventory(signal?: AbortSignal) {
      return operation(signal, inspectRetirementInventory);
    },
    async collect(
      identity: Identity,
      purpose: Purpose,
      signal?: AbortSignal,
      collectTraffic = false,
    ): Promise<AzureAcquisitionReference<Family, Purpose>> {
      const expected = structuredClone(identity),
        expectedSha = canonicalSha256(identity),
        started = performance.now();
      const active = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
      // Historical source authentication may use the same issuer. Read without holding its key lock.
      const readings = await operation(
        active,
        async (deadline) => {
          contract.validatePurpose(purpose);
          contract.validateIdentity(expected, plan, owner);
          require(canonicalSha256(identity) === expectedSha, 'requested acquisition identity changed');
          require((await optional(store, retiredName)) === undefined, 'signing key retired');
          return contract.collectReadings(expected, purpose, deadline, collectTraffic);
        },
        false,
      );
      return operation(active, async (deadline) => {
        contract.validatePurpose(purpose);
        contract.validateIdentity(expected, plan, owner);
        require(same(expected.owner, owner) &&
          expected.planSha256 === plan.planSha256 &&
          canonicalSha256(identity) === expectedSha, 'requested acquisition identity differs');
        require((await optional(store, retiredName)) === undefined, 'signing key retired');

        contract.validateReadings(readings, expected, plan, owner);
        require(canonicalSha256(identity) === expectedSha, 'acquired identity changed');
        const original = await issuer(deadline, true),
          key = await signingKey(original.record),
          invocationId = randomUUID();
        const payload = {
          schemaVersion: 1 as const,
          kind: `azure-${family}-operational-acquisition`,
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
          schemaVersion: 1 as const,
          kind: `azure-${family}-operational-acquisition-reference` as const,
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
      reference: AzureAcquisitionReference<Family, Purpose>,
      identity: Identity,
      purpose: Purpose,
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
        contract.validatePurpose(purpose);
        contract.validateIdentity(expected, plan, owner);
        require(['current', 'historical'].includes(mode) &&
          receipt.purpose === purpose &&
          receipt.schemaVersion === 1 &&
          receipt.kind === `azure-${family}-operational-acquisition-reference` &&
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
        const published = await readImmutableCeReceipt(store, publicationPrefix, receipt.publicationSha256, deadline);
        const { payload, readings } = authenticateObservation(original, published, plan);
        require(payload.invocationId === receipt.invocationId &&
          payload.purpose === purpose &&
          same(payload.identity, expected), 'original execution signature differs');
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
          scope: `owning-${family}-operational-acquisition` as const,
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
        const before = await inspectRetirementInventory(deadline),
          original = await issuer(deadline, false);
        let marker = await optional(store, retiredName);
        if (marker === undefined) {
          const key = await signingKey(original.record),
            payload = {
              schemaVersion: 1,
              kind: `azure-${family}-observer-key-retired`,
              owner,
              issuerSha256: original.digest,
            };
          marker = {
            payload,
            signature: sign(null, Buffer.from(canonicalStringify(payload)), key).toString('base64url'),
          };
          await store.write(retiredName, marker, deadline);
        }
        retirementMarker(marker, original);
        unchangedProof(before, await inspectRetirementInventory(deadline));
        const key = await optional(store, keyName);
        if (key !== undefined) {
          await signingKey(original.record);
          deadline.throwIfAborted();
          await store.remove(keyName);
        }
        require((await optional(store, keyName)) === undefined &&
          same(await store.read(retiredName), marker) &&
          (await issuer(deadline, false)).digest === original.digest, 'signing material retirement incomplete');
        const artifactInventory = await inspectRetirementInventory(deadline);
        unchangedProof(before, artifactInventory);
        acquired.clear();
        return {
          status: 'retired' as const,
          scope: 'operational-observer-signing-material' as const,
          issuerSha256: original.digest,
          historicalPublicProofRetained: true as const,
          artifactInventory,
        };
      });
    },
  };
}
