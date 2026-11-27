import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { join, posix } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { AzExecApi } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256 } from './canonical';
import { AzureNativeCommandFailure } from './native-command-failure';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCeAction, AzureCePlan } from './types';

type Json = Record<string, unknown>;
export interface AzureNativeVmAuthentication {
  adminUsername: 'azureuser';
  publicKey: string;
  profileId: string;
  recordName: string;
}
const require = (condition: unknown, reason: string): void => {
  if (!condition) throw Error(`Azure native VM authentication: ${reason}`);
};
const object = (value: unknown): Json => {
  require(value && typeof value === 'object' && !Array.isArray(value), 'record is malformed');
  return value as Json;
};
const optional = async (store: CeDeploymentStore, name: string) => {
  try {
    return await store.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
};
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
function sshField(value: Buffer) {
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(value.length);
  return Buffer.concat([prefix, value]);
}
function positiveInteger(value: Buffer) {
  let start = 0;
  while (start < value.length - 1 && value[start] === 0) start++;
  const normalized = value.subarray(start);
  return normalized[0] & 0x80 ? Buffer.concat([Buffer.from([0]), normalized]) : normalized;
}
function publicKey(privateKey: string): string {
  try {
    const key = createPrivateKey(privateKey);
    require(key.asymmetricKeyType === 'rsa' &&
      key.asymmetricKeyDetails?.modulusLength === 4096, 'key algorithm differs');
    const jwk = createPublicKey(key).export({ format: 'jwk' });
    require(typeof jwk.e === 'string' && typeof jwk.n === 'string', 'key is unavailable');
    const bytes = Buffer.concat([
      sshField(Buffer.from('ssh-rsa')),
      sshField(positiveInteger(Buffer.from(jwk.e as string, 'base64url'))),
      sshField(positiveInteger(Buffer.from(jwk.n as string, 'base64url'))),
    ]);
    return `ssh-rsa ${bytes.toString('base64')}`;
  } catch {
    throw Error('Azure native VM authentication: key is invalid');
  }
}
async function binding(plan: AzureCePlan, action: AzureCeAction, store: CeDeploymentStore) {
  verifyAzureCePlan(plan);
  await store.verify();
  require(plan.engine === 'native' &&
    store.owner.provider === 'azure' &&
    canonicalEqual(store.owner, azureUpgradeBinding(plan).owner), 'owner or engine differs');
  const selected = plan.actions.filter((row) => row.id === action.id);
  require(selected.length === 1 &&
    canonicalEqual(selected[0], action) &&
    action.kind === 'vm-create' &&
    action.mutates === true, 'action binding differs');
  require(Number.isInteger(action.node) &&
    (action.node as number) >= 1 &&
    (action.node as number) <= plan.topology.nodeCount, 'node binding differs');
  const resourceId = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${plan.deploymentName}-${action.node}`;
  require(action.resourceId === resourceId, 'resource binding differs');
  require(canonicalEqual(await store.read(`native-source-${plan.planSha256}.json`), plan), 'source registry differs');
  require((await optional(store, 'azure-native-lifecycle-retirement.json')) === undefined, 'retirement has begun');
  const site = object(await store.read('native-site.json'));
  require(site.siteName === plan.siteName && canonicalEqual(site.owner, store.owner), 'site owner binding differs');
  require(typeof site.uid === 'string' &&
    /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(site.uid), 'site binding differs');
  require(typeof site.contractFingerprint === 'string' &&
    /^sha256:[a-f0-9]{64}$/.test(site.contractFingerprint), 'site contract binding differs');
  return sourceBinding(plan, action, store.owner, site.uid as string, site.contractFingerprint as string);
}

function sourceBinding(
  plan: AzureCePlan,
  action: AzureCeAction,
  owner: CeDeploymentStore['owner'],
  siteUid: string,
  contractFingerprint: string,
) {
  verifyAzureCePlan(plan);
  require(plan.engine === 'native' &&
    canonicalEqual(azureUpgradeBinding(plan).owner, owner), 'historical owner differs');
  const selected = plan.actions.filter((row) => row.id === action.id);
  require(selected.length === 1 &&
    canonicalEqual(selected[0], action) &&
    action.kind === 'vm-create' &&
    action.mutates === true, 'historical action differs');
  require(Number.isInteger(action.node) &&
    (action.node as number) >= 1 &&
    (action.node as number) <= plan.topology.nodeCount, 'historical node differs');
  const resourceId = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${plan.deploymentName}-${action.node}`;
  require(action.resourceId === resourceId, 'historical resource differs');
  require(typeof siteUid === 'string' &&
    /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(siteUid), 'historical site identity differs');
  require(/^sha256:[a-f0-9]{64}$/.test(contractFingerprint), 'historical contract differs');
  return {
    owner: structuredClone(owner),
    sourcePlanSha256: plan.planSha256,
    actionSha256: canonicalSha256(action),
    node: action.node,
    vmResourceId: resourceId,
    siteName: plan.siteName,
    siteUid: siteUid,
    contractFingerprint: contractFingerprint,
    imageUrn: plan.image.urn,
    adminUsername: 'azureuser' as const,
  };
}

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
type Binding = Awaited<ReturnType<typeof binding>>;
function issuanceRecord(profileId: string, recordName: string, credential: Json) {
  return {
    schemaVersion: 1,
    kind: 'azure-native-vm-auth-issuance',
    profileId,
    recordName,
    publicKeySha256: credential.publicKeySha256,
    privateKeySha256: credential.privateKeySha256,
  };
}

function validateCredential(
  record: unknown,
  issued: unknown,
  original: Binding,
  recordName: string,
): AzureNativeVmAuthentication {
  const profileId = canonicalSha256(original);
  const value = object(record);
  require(Object.keys(value).sort().join(',') ===
    [
      'schemaVersion',
      'kind',
      'phase',
      'profileId',
      'binding',
      'privateKey',
      'publicKey',
      'publicKeySha256',
      'privateKeySha256',
      ...(value.phase === 'installed' ? ['vmId'] : []),
    ]
      .sort()
      .join(','), 'credential record fields differ');
  require(value.schemaVersion === 1 &&
    value.kind === 'azure-native-vm-auth' &&
    (value.phase === 'prepared' || value.phase === 'installed'), 'credential phase differs');
  require(value.profileId === profileId && canonicalEqual(value.binding, original), 'credential binding differs');
  require(typeof value.privateKey === 'string' && typeof value.publicKey === 'string', 'key is unavailable');
  const marker = object(issued);
  require(canonicalEqual(marker, issuanceRecord(profileId, recordName, value)), 'key issuance binding differs');
  require(value.privateKeySha256 === digest(value.privateKey as string), 'private key identity differs');
  const derived = publicKey(value.privateKey as string);
  require(derived === value.publicKey && value.publicKeySha256 === digest(derived), 'key identity differs');
  if (value.phase === 'installed')
    require(typeof value.vmId === 'string' && uuid.test(value.vmId), 'installed VM identity is malformed');
  return Object.freeze({ adminUsername: 'azureuser' as const, publicKey: derived, profileId, recordName });
}

function validateUnissuedCredential(record: unknown, original: Binding, recordName: string) {
  const value = object(record);
  require(value.phase === 'prepared', 'unissued credential phase differs');
  const issued = issuanceRecord(canonicalSha256(original), recordName, value);
  validateCredential(record, issued, original, recordName);
  return issued;
}

/** Generate or reuse only the credential belonging to this exact private source and planned VM. */
export async function prepareAzureNativeVmAuthentication(
  plan: AzureCePlan,
  action: AzureCeAction,
  store: CeDeploymentStore,
): Promise<AzureNativeVmAuthentication> {
  const original = await binding(plan, action, store);
  const profileId = canonicalSha256(original);
  const recordName = `native-vm-auth-${plan.planSha256}-${action.node}.json`;
  const issuedName = `native-vm-auth-${plan.planSha256}-${action.node}-issued.json`;
  const release = await acquireProcessLock(join(store.directory, '.azure-relay-native-mutation-lock'));
  try {
    require(canonicalEqual(await binding(plan, action, store), original), 'binding changed during preparation');
    let record = await optional(store, recordName);
    let issued = await optional(store, issuedName);
    require(record !== undefined || issued === undefined, 'issued key is unavailable');
    if (record === undefined) {
      const generated = generateKeyPairSync('rsa', { modulusLength: 4096 });
      const privateKey = generated.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
      const key = publicKey(privateKey);
      record = {
        schemaVersion: 1,
        kind: 'azure-native-vm-auth',
        phase: 'prepared',
        profileId,
        binding: original,
        privateKey,
        publicKey: key,
        publicKeySha256: digest(key),
        privateKeySha256: digest(privateKey),
      };
      // Publish the complete private record atomically before making its issuance immutable.
      // A failed write has never issued a public key; a persisted unissued record resumes unchanged.
      await store.write(recordName, record);
    }
    if (issued === undefined) {
      issued = validateUnissuedCredential(record, original, recordName);
      require(canonicalEqual(await binding(plan, action, store), original), 'binding changed before issuance');
      require(await store.reserve(issuedName, issued), 'key issuance already exists');
    }
    const persisted = await optional(store, recordName);
    const persistedIssued = await optional(store, issuedName);
    require(persisted !== undefined && persistedIssued !== undefined, 'issued key is unavailable');
    require(canonicalEqual(persisted, record) &&
      canonicalEqual(persistedIssued, issued), 'credential changed before publication');
    require(canonicalEqual(await binding(plan, action, store), original), 'binding changed during preparation');
    return validateCredential(persisted, persistedIssued, original, recordName);
  } finally {
    await release();
  }
}

async function existingCredential(plan: AzureCePlan, action: AzureCeAction, store: CeDeploymentStore) {
  const original = await binding(plan, action, store);
  const recordName = `native-vm-auth-${plan.planSha256}-${action.node}.json`;
  const issuedName = `native-vm-auth-${plan.planSha256}-${action.node}-issued.json`;
  const record = await optional(store, recordName),
    issued = await optional(store, issuedName);
  require(record !== undefined && issued !== undefined, 'issued key is unavailable');
  const auth = validateCredential(record, issued, original, recordName);
  return { original, record: object(record), auth };
}

/** Observe only the issued profile; an unavailable credential never causes generation here. */
export async function observeAzureNativeVmAuthentication(
  plan: AzureCePlan,
  action: AzureCeAction,
  store: CeDeploymentStore,
  api: AzExecApi,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const initial = await existingCredential(plan, action, store);
  const release = await acquireProcessLock(join(store.directory, '.azure-relay-native-mutation-lock'));
  try {
    signal?.throwIfAborted();
    const locked = await existingCredential(plan, action, store);
    require(canonicalEqual(locked.original, initial.original) &&
      canonicalEqual(locked.auth, initial.auth), 'credential changed before provider observation');
    const result = await api.exec(
      'az',
      [
        'vm',
        'show',
        '--ids',
        initial.original.vmResourceId,
        '--subscription',
        initial.original.owner.account,
        '--output',
        'json',
      ],
      signal ? { signal } : undefined,
    );
    signal?.throwIfAborted();
    if (result.exitCode !== 0) throw new AzureNativeCommandFailure(action.id, result);
    let vm: Json;
    try {
      vm = object(JSON.parse(result.stdout));
    } catch {
      throw Error('Azure native VM authentication: provider VM evidence is malformed');
    }
    require(typeof vm.id === 'string' &&
      vm.id.toLowerCase() === initial.original.vmResourceId.toLowerCase() &&
      vm.name === initial.original.vmResourceId.split('/').at(-1) &&
      vm.location === initial.original.owner.region, 'provider resource identity differs');
    require(typeof vm.vmId === 'string' && uuid.test(vm.vmId), 'provider VM identity is unavailable');
    const tags = object(vm.tags);
    for (const [name, value] of Object.entries({
      'xcsh-managed-by': 'azure-ce',
      'xcsh-execution-engine': 'native',
      'xcsh-deployment-id': initial.original.owner.deploymentId,
      'xcsh-plan-sha256': initial.original.sourcePlanSha256,
    }))
      require(tags[name] === value, 'provider owner identity differs');
    const os = object(vm.osProfile),
      linux = object(os.linuxConfiguration),
      ssh = object(linux.ssh);
    require(os.adminUsername === 'azureuser' &&
      linux.disablePasswordAuthentication === true, 'provider administrator identity differs');
    require(Array.isArray(ssh.publicKeys) && ssh.publicKeys.length === 1, 'provider key identity differs');
    const key = object((ssh.publicKeys as unknown[])[0]);
    require(key.path === posix.join('/home', initial.auth.adminUsername, '.ssh', 'authorized_keys') &&
      typeof key.keyData === 'string' &&
      key.keyData.trim() === initial.auth.publicKey, 'provider key identity differs');
    const current = await existingCredential(plan, action, store);
    require(canonicalEqual(current.auth, initial.auth) &&
      canonicalEqual(current.original, initial.original), 'credential binding changed during observation');
    require(current.record.phase !== 'installed' || current.record.vmId === vm.vmId, 'installed VM identity changed');
    signal?.throwIfAborted();
    if (current.record.phase !== 'installed')
      await store.write(initial.auth.recordName, { ...current.record, phase: 'installed', vmId: vm.vmId }, signal);
    return {
      status: 'installed' as const,
      profileId: initial.auth.profileId,
      vmId: vm.vmId as string,
      vmResourceId: initial.original.vmResourceId,
      publicKeySha256: digest(initial.auth.publicKey),
    };
  } finally {
    await release();
  }
}

export function isAzureNativeVmAuthenticationArtifact(name: string): boolean {
  return /^native-vm-auth-[a-f0-9]{64}-[1-3](?:-issued)?\.json$/.test(name);
}

/** Verify exact historical custody before the parent retirement's fresh-absence guarded deletion. */
export function verifyAzureNativeVmAuthenticationArtifacts(
  base: AzureCePlan,
  sources: ReadonlyMap<string, AzureCePlan>,
  siteUid: string,
  contractFingerprint: string,
  records: ReadonlyMap<string, Record<string, unknown>>,
): void {
  const owner = azureUpgradeBinding(base).owner;
  for (const [name] of records) {
    if (!isAzureNativeVmAuthenticationArtifact(name)) continue;
    const match = /^native-vm-auth-([a-f0-9]{64})-([1-3])(?:-issued)?\.json$/.exec(name);
    require(match, 'historical filename differs');
    const source = sources.get(match![1]);
    require(source &&
      source.siteName === base.siteName &&
      canonicalEqual(records.get(`native-source-${match![1]}.json`), source), 'historical source registry differs');
    const actions = source!.actions.filter(
      (action) => action.kind === 'vm-create' && action.node === Number(match![2]),
    );
    require(actions.length === 1, 'historical VM action differs');
    const original = sourceBinding(source!, actions[0], owner, siteUid, contractFingerprint);
    const recordName = `native-vm-auth-${match![1]}-${match![2]}.json`;
    const issuedName = recordName.replace('.json', '-issued.json');
    const rawIssued = records.get(issuedName);
    const record = records.get(recordName);
    if (rawIssued === undefined) {
      require(record !== undefined, 'historical private credential is unavailable');
      validateUnissuedCredential(record, original, recordName);
      continue;
    }
    const issued = object(rawIssued);
    require(Object.keys(issued).sort().join(',') ===
      ['schemaVersion', 'kind', 'profileId', 'recordName', 'publicKeySha256', 'privateKeySha256'].sort().join(',') &&
      issued.schemaVersion === 1 &&
      issued.kind === 'azure-native-vm-auth-issuance' &&
      issued.profileId === canonicalSha256(original) &&
      issued.recordName === recordName &&
      typeof issued.publicKeySha256 === 'string' &&
      /^[a-f0-9]{64}$/.test(issued.publicKeySha256) &&
      typeof issued.privateKeySha256 === 'string' &&
      /^[a-f0-9]{64}$/.test(issued.privateKeySha256), 'historical issuance differs');
    // A lost issued private record never grants regeneration; after verified absence there are no private bytes to dispose.
    if (record !== undefined) validateCredential(record, issued, original, recordName);
    else require(name === issuedName, 'historical private credential is unavailable');
  }
}
