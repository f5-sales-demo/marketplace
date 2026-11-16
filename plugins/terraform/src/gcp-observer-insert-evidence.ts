import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { fingerprint } from '../../gcloud/src/ce/discovery';
import { translateGcpTerraformObserverSiteCompute } from '../../gcloud/src/ce/observer-plan';
import { gcpTerraformObserverIdentity } from '../../gcloud/src/ce/observer-scope';
import type { GcpCeIntent } from '../../gcloud/src/ce/types';
import { validateIntent } from '../../gcloud/src/ce/validation';
import { decodeEvidenceObject } from './evidence-json';
import { isEvidenceRfc3339 } from './evidence-rfc3339';
import {
  assertOriginalInstalledGcpCloudReader,
  assertOriginalInstalledGcpFinalCloudReader,
  type openGcpCloudSerialReader,
} from './gcp-cloud-serial-reader';
import { type OriginalGoogleHttpResponseObservation, readOriginalGoogleHttpResponseSource } from './gcp-http-rpc-trace';
import type { OriginalGcpObserverImageEvidence, openGcpObserverImageReader } from './gcp-observer-image';
import { captureOriginalGcpObserverImage, readOriginalGcpObserverImageEvidence } from './gcp-observer-image';
import { GCP_OBSERVER_IMAGE_PIN } from './gcp-observer-image-pin';
import type { OriginalApplyCallbackContext } from './installed-apply-controller';
import {
  assertOriginalApplyGcpInventoryCallback,
  type OriginalApplyGcpInventory,
  readOriginalApplyGcpInventory,
} from './installed-initial-inventory';
import { readOwnedInstalledInput } from './installed-runtime';
import {
  type InstalledGcpVersionBinding,
  isOriginalCreationScopeProfile,
  resolveInstalledGcpVersionProfile,
} from './installed-version-profile';
import { assertSameOriginalInput } from './original-input-monitor';
import { assertOriginalTerraformPlanProjection } from './runner';

type Json = Record<string, unknown>;
type CloudReader = Awaited<ReturnType<typeof openGcpCloudSerialReader>>;
type ImageReader = Awaited<ReturnType<typeof openGcpObserverImageReader>>;
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Original observer object required');
  return value as Json;
};
const uint64 = (value: unknown): value is string =>
  typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value) && BigInt(value) <= 18446744073709551615n;
const link = (value: unknown, path: string) =>
  typeof value === 'string' &&
  [path, `https://www.googleapis.com/compute/v1/${path}`, `https://compute.googleapis.com/compute/v1/${path}`].includes(
    value,
  );
function metadata(value: unknown, allowFingerprint = false) {
  const raw = object(value),
    entries: Record<string, string> = Object.create(null);
  if (
    !Array.isArray(raw.items) ||
    Object.keys(raw).some((key) => !['items', 'fingerprint'].includes(key)) ||
    (raw.fingerprint !== undefined &&
      (typeof raw.fingerprint !== 'string' || (!allowFingerprint && raw.fingerprint !== '')))
  )
    throw new Error('Original observer insertion metadata required');
  for (const item of raw.items) {
    const row = object(item);
    if (
      Object.keys(row).sort().join(',') !== 'key,value' ||
      typeof row.key !== 'string' ||
      typeof row.value !== 'string' ||
      Object.hasOwn(entries, row.key) ||
      Buffer.byteLength(row.value) > 262144
    )
      throw new Error('Original unique observer metadata required');
    entries[row.key] = row.value;
  }
  return entries;
}
export interface OriginalGcpObserverInsertIdentity {
  readonly schemaVersion: 1;
  readonly kind: 'original-gcp-observer-insert-reference';
}
export interface OriginalGcpObserverInsertInput {
  readonly callback: OriginalApplyCallbackContext;
  readonly baseline: OriginalApplyGcpInventory;
  readonly response: OriginalGoogleHttpResponseObservation;
  readonly binding: InstalledGcpVersionBinding;
  readonly imageReader: ImageReader;
  readonly image: OriginalGcpObserverImageEvidence;
}
interface ObserverView {
  readonly schemaVersion: 1;
  readonly kind: 'original-gcp-observer-insert-identity';
  readonly role: 'observer';
  readonly project: string;
  readonly zone: string;
  readonly name: string;
  readonly address: string;
  readonly diskAddress: string;
  readonly firewallAddress: string;
  readonly operationId: string;
  readonly operationName: string;
  readonly targetId: string | null;
  readonly status: string;
  readonly planSha256: string;
  readonly imageId: string;
  readonly imageName: string;
  readonly requestBodySha256: string;
  readonly responseBodySha256: string;
  readonly metadataSha256: string;
  readonly publicKeySha256: string;
  readonly observerExecutionAuthorized: false;
  readonly originalInsertQualified: false;
}
const origins = new WeakMap<
  OriginalGcpObserverInsertIdentity,
  {
    read(final?: OriginalApplyCallbackContext): Promise<Readonly<ObserverView>>;
    context: OriginalApplyCallbackContext['original'];
    baseline: OriginalApplyGcpInventory;
    requestBody: string;
  }
>();
export async function readOriginalGcpObserverInsertIdentity(value: unknown, final?: OriginalApplyCallbackContext) {
  const source =
    value && typeof value === 'object' ? origins.get(value as OriginalGcpObserverInsertIdentity) : undefined;
  if (!source) throw new Error('Original observer insertion reference required');
  return source.read(final);
}
/** Original source correspondence only; actual VM/disk/NIC/SSH and authorization remain separate gates. */
export async function collectOriginalGcpObserverInsertIdentity(input: OriginalGcpObserverInsertInput) {
  const { callback, baseline, response, imageReader, image } = input;
  if (callback.phase !== 'before') throw new Error('Original observer before callback required');
  await assertOriginalApplyGcpInventoryCallback(baseline, callback);
  const context = callback.original;
  const profile = resolveInstalledGcpVersionProfile(input.binding);
  if (
    !isOriginalCreationScopeProfile(profile) ||
    profile.googleVersion !== '8.11.0' ||
    context.owner.provider !== 'gcp' ||
    context.owner.engine !== 'terraform'
  )
    throw new Error('Original qualified observer Terraform provider profile required');
  const intentBinding = context.inputs['workspace:gcp-terraform-input-identity.json'];
  const configBinding = context.inputs['workspace:main.tf.json'];
  if (!intentBinding || !configBinding) throw new Error('Original observer intent/configuration inputs required');
  const intentInput = await readOwnedInstalledInput(intentBinding.path, 65536);
  const configInput = await readOwnedInstalledInput(configBinding.path, 64 * 1024 * 1024);
  assertSameOriginalInput(intentBinding, intentInput.binding);
  assertSameOriginalInput(configBinding, configInput.binding);
  const saved = decodeEvidenceObject(intentInput.bytes) as unknown as {
    intent: GcpCeIntent;
    intentFingerprint: string;
    platformContext: string;
  };
  const intent = structuredClone(saved.intent);
  validateIntent(intent);
  if (
    intent.schemaVersion !== 2 ||
    !intent.observer ||
    intent.engine !== 'terraform' ||
    intent.operation !== 'deploy' ||
    intent.project !== context.owner.account ||
    intent.region !== context.owner.region ||
    intent.deploymentName !== context.owner.deploymentId ||
    saved.intentFingerprint !== fingerprint(intent) ||
    saved.platformContext !== intent.platformContext
  )
    throw new Error('Original versioned observer intent differs');
  const plan = await context.readOriginalPlanSource?.();
  if (
    !plan ||
    plan.receipt.configurationSha256 !== configBinding.sha256 ||
    plan.receipt.providerLockSha256 !== input.binding.providerLockSha256 ||
    plan.terraformVersion !== input.binding.terraformVersion ||
    plan.directory !== context.executionDirectory
  )
    throw new Error('Original observer owning plan and configuration differ');
  await assertOriginalTerraformPlanProjection(plan);
  const configuration = decodeEvidenceObject(configInput.bytes);
  const providers = object(configuration.provider).google;
  const provider = object(Array.isArray(providers) && providers.length === 1 ? providers[0] : providers);
  if (
    provider.project !== intent.project ||
    provider.region !== intent.region ||
    typeof provider.request_reason !== 'string' ||
    provider.alias !== undefined ||
    provider.default_labels !== undefined
  )
    throw new Error('Original observer provider scope and request reason required');
  const expected = translateGcpTerraformObserverSiteCompute(
    intent,
    { terraform: profile.terraformVersion, google: profile.googleVersion, xcsh: '15.17.3' },
    intent.observer,
    {
      schemaVersion: 1,
      scope: 'gcp-terraform-deployment',
      intentFingerprint: fingerprint(intent),
      reason: provider.request_reason,
    },
  );
  const observer = gcpTerraformObserverIdentity(intent),
    key = observer.key,
    firewallKey = observer.firewallName.replaceAll('-', '_');
  const resource = object(configuration.resource),
    wantedResource = object(expected.configuration.resource);
  for (const [type, id] of [
    ['google_compute_instance', key],
    ['google_compute_disk', key],
    ['google_compute_firewall', firewallKey],
  ] as const)
    if (fingerprint(object(object(resource[type])[id])) !== fingerprint(object(object(wantedResource[type])[id])))
      throw new Error('Original declared observer resource configuration differs');
  if (
    fingerprint(object(object(configuration.data).google_compute_image)[key]) !==
    fingerprint(object(object(expected.configuration.data).google_compute_image)[key])
  )
    throw new Error('Original observer image declaration differs');
  const originalImage = await readOriginalGcpObserverImageEvidence(imageReader, image);
  if (
    image.owningProject !== intent.project ||
    image.imageId !== GCP_OBSERVER_IMAGE_PIN.id ||
    image.accountSha256 !== context.authentication.accountSha256 ||
    image.audienceSha256 !== context.authentication.audienceSha256 ||
    image.snapshotSha256 !== context.authentication.snapshotSha256 ||
    hash(originalImage) !== image.sha256
  )
    throw new Error('Original observer image authentication or scope differs');
  const imageBinding = (await readOwnedInstalledInput(image.path, 4 * 1024 * 1024)).binding;
  const address = `google_compute_instance.${key}`,
    diskAddress = `google_compute_disk.${key}`,
    firewallAddress = `google_compute_firewall.${firewallKey}`;
  const originalImageTimestamp = image.creationTimestamp;
  let refused = false;
  const verify = async (final?: OriginalApplyCallbackContext): Promise<Readonly<ObserverView>> => {
    if (refused) throw new Error('Original observer insertion reference retired');
    try {
      const current = final ?? callback;
      if (final && (final.phase !== 'after' || final.original !== context || final.nonce !== callback.nonce))
        throw new Error('Original observer final callback differs');
      await assertOriginalApplyGcpInventoryCallback(baseline, current);
      const inventory = await readOriginalApplyGcpInventory(baseline, final);
      if (
        inventory.planSha256 !== plan.receipt.planSha256 ||
        inventory.resources.length !== 21 ||
        [address, diskAddress, firewallAddress].some(
          (id) => inventory.cloud.filter((row) => row.address === id && row.role === 'observer').length !== 1,
        )
      )
        throw new Error('Original complete 21-resource observer baseline required');
      await assertOriginalTerraformPlanProjection(plan);
      const source = await readOriginalGoogleHttpResponseSource(response);
      if (
        source.directory !== plan.directory ||
        source.planSha256 !== plan.receipt.planSha256 ||
        (['pid', 'group', 'start', 'boot'] as const).some(
          (name) => source.executor[name] !== current.execution.identity[name],
        ) ||
        response.googleProviderVersion !== profile.googleVersion ||
        response.rpc !== 'ApplyResourceChange' ||
        response.resourceType !== 'google_compute_instance' ||
        response.method !== 'POST' ||
        response.status !== 200 ||
        response.url !==
          `https://compute.googleapis.com/compute/v1/projects/${intent.project}/zones/${observer.zone}/instances?alt=json` ||
        response.requestReasonSha256 !== hash(provider.request_reason as string) ||
        response.planSha256 !== plan.receipt.planSha256 ||
        hash(response.requestBody) !== response.requestBodySha256 ||
        hash(response.responseBody) !== response.responseBodySha256
      )
        throw new Error('Original observer insertion producer, plan or HTTP scope differs');
      const request = decodeEvidenceObject(Buffer.from(response.requestBody)),
        op = decodeEvidenceObject(Buffer.from(response.responseBody));
      const expectedMetadata = object(object(object(wantedResource.google_compute_instance)[key]).metadata);
      const labels = object(request.labels),
        wantedLabels = object(object(object(wantedResource.google_compute_instance)[key]).labels);
      if (
        request.name !== observer.name ||
        request.canIpForward !== false ||
        request.deletionProtection !== false ||
        !link(request.machineType, `projects/${intent.project}/zones/${observer.zone}/machineTypes/e2-micro`) ||
        Object.entries(wantedLabels).some(([name, value]) => labels[name] !== value) ||
        Object.keys(labels).some(
          (name) =>
            !Object.hasOwn(wantedLabels, name) && !(name === 'goog-terraform-provisioned' && labels[name] === 'true'),
        ) ||
        fingerprint(metadata(request.metadata)) !== fingerprint(expectedMetadata) ||
        fingerprint(object(request.tags).items) !== fingerprint([observer.name]) ||
        (request.serviceAccounts !== undefined &&
          (!Array.isArray(request.serviceAccounts) || request.serviceAccounts.length))
      )
        throw new Error('Original observer request machine, metadata, labels, tags or account differs');
      const disks = request.disks,
        nics = request.networkInterfaces;
      if (!Array.isArray(disks) || disks.length !== 1 || !Array.isArray(nics) || nics.length !== 1)
        throw new Error('Original observer single disk and interface required');
      const disk = object(disks[0]),
        nic = object(nics[0]);
      if (
        disk.boot !== true ||
        (disk.autoDelete !== undefined && disk.autoDelete !== false) ||
        disk.initializeParams !== undefined ||
        !link(disk.source, `projects/${intent.project}/zones/${observer.zone}/disks/${observer.name}`) ||
        !link(nic.network, `projects/${intent.project}/global/networks/${observer.network}`) ||
        !link(nic.subnetwork, `projects/${intent.project}/regions/${intent.region}/subnetworks/${observer.subnet}`) ||
        !Array.isArray(nic.accessConfigs) ||
        nic.accessConfigs.length !== 1 ||
        object(nic.accessConfigs[0]).type !== 'ONE_TO_ONE_NAT' ||
        (object(nic.accessConfigs[0]).networkTier !== undefined &&
          object(nic.accessConfigs[0]).networkTier !== 'PREMIUM') ||
        object(nic.accessConfigs[0]).natIP !== undefined ||
        (nic.networkIP !== undefined && nic.networkIP !== '') ||
        nic.aliasIpRanges !== undefined
      )
        throw new Error('Original observer disk source or network/egress mapping differs');
      const zonePath = `projects/${intent.project}/zones/${observer.zone}`;
      if (
        !uint64(op.id) ||
        typeof op.name !== 'string' ||
        !/^[a-z][a-z0-9-]{0,254}$/.test(op.name) ||
        op.operationType !== 'insert' ||
        !['PENDING', 'RUNNING', 'DONE'].includes(op.status as string) ||
        op.error !== undefined ||
        !link(op.zone, zonePath) ||
        !link(op.selfLink, `${zonePath}/operations/${op.name}`) ||
        !link(op.targetLink, `${zonePath}/instances/${observer.name}`) ||
        !isEvidenceRfc3339(op.insertTime) ||
        (op.targetId !== undefined && !uint64(op.targetId))
      )
        throw new Error('Original exact observer insertion operation required');
      const currentImage = await captureOriginalGcpObserverImage(imageReader);
      await readOriginalGcpObserverImageEvidence(imageReader, currentImage);
      if (
        currentImage.creationTimestamp !== originalImageTimestamp ||
        currentImage.owningProject !== intent.project ||
        currentImage.snapshotSha256 !== image.snapshotSha256 ||
        currentImage.accountSha256 !== image.accountSha256 ||
        currentImage.audienceSha256 !== image.audienceSha256
      )
        throw new Error('Original observer image changed during insertion correlation');
      for (const binding of [intentBinding, configBinding, imageBinding])
        assertSameOriginalInput(binding, (await readOwnedInstalledInput(binding.path, 64 * 1024 * 1024)).binding);
      await context.assertInputs();
      await assertOriginalTerraformPlanProjection(plan);
      await readOriginalGoogleHttpResponseSource(response);
      await assertOriginalApplyGcpInventoryCallback(baseline, current);
      for (const binding of [intentBinding, configBinding, imageBinding])
        assertSameOriginalInput(binding, (await readOwnedInstalledInput(binding.path, 64 * 1024 * 1024)).binding);
      return Object.freeze({
        schemaVersion: 1,
        kind: 'original-gcp-observer-insert-identity',
        role: 'observer',
        project: intent.project,
        zone: observer.zone,
        name: observer.name,
        address,
        diskAddress,
        firewallAddress,
        operationId: op.id,
        operationName: op.name,
        targetId: op.targetId === undefined ? null : (op.targetId as string),
        status: op.status as string,
        planSha256: plan.receipt.planSha256,
        imageId: image.imageId,
        imageName: image.imageName,
        requestBodySha256: response.requestBodySha256,
        responseBodySha256: response.responseBodySha256,
        metadataSha256: hash(JSON.stringify(metadata(request.metadata))),
        publicKeySha256: hash(intent.observer?.publicKey ?? ''),
        observerExecutionAuthorized: false,
        originalInsertQualified: false,
      });
    } catch (error) {
      refused = true;
      throw error;
    }
  };
  await verify();
  const result: OriginalGcpObserverInsertIdentity = Object.freeze({
    schemaVersion: 1,
    kind: 'original-gcp-observer-insert-reference',
  });
  origins.set(result, { read: verify, context, baseline, requestBody: response.requestBody });
  return result;
}

export interface OriginalGcpObserverVmEvidence {
  readonly schemaVersion: 1;
  readonly kind: 'original-gcp-observer-vm-reference';
}
export interface OriginalGcpObserverVmInput {
  readonly identity: OriginalGcpObserverInsertIdentity;
  readonly callback: OriginalApplyCallbackContext;
  readonly reader: CloudReader;
}
interface ObserverVmView {
  readonly kind: 'original-gcp-observer-vm-evidence';
  readonly project: string;
  readonly zone: string;
  readonly name: string;
  readonly instanceId: string;
  readonly diskId: string;
  readonly imageId: string;
  readonly interfaceAddress: string;
  readonly externalAddress: string;
  readonly operationId: string;
  readonly instanceSha256: string;
  readonly diskSha256: string;
  readonly observerExecutionAuthorized: false;
  readonly originalInsertQualified: false;
}
const vmOrigins = new WeakMap<
  OriginalGcpObserverVmEvidence,
  {
    read(): Promise<Readonly<ObserverVmView>>;
    serial(start: string): Promise<Awaited<ReturnType<CloudReader['serial']>>>;
  }
>();
export async function readOriginalGcpObserverVmEvidence(value: unknown) {
  const read = value && typeof value === 'object' ? vmOrigins.get(value as OriginalGcpObserverVmEvidence) : undefined;
  if (!read) throw new Error('Original observer VM evidence required');
  return read.read();
}
export async function collectOriginalGcpObserverSerialEvidence(value: unknown, start: string) {
  const read = value && typeof value === 'object' ? vmOrigins.get(value as OriginalGcpObserverVmEvidence) : undefined;
  if (!read) throw new Error('Original observer VM evidence required');
  return read.serial(start);
}
function fresh(value: { startedAt: number; finishedAt: number }) {
  if (
    !Number.isSafeInteger(value.startedAt) ||
    !Number.isSafeInteger(value.finishedAt) ||
    value.finishedAt < value.startedAt ||
    value.finishedAt - value.startedAt > 60000 ||
    Date.now() < value.finishedAt ||
    Date.now() - value.finishedAt > 300000
  )
    throw new Error('Fresh original observer cloud observation required');
}
export async function collectOriginalGcpObserverVmEvidence(input: OriginalGcpObserverVmInput) {
  const original = origins.get(input.identity);
  if (!original) throw new Error('Original observer insertion source required');
  const { callback, reader } = input;
  const source = await original.read(callback.phase === 'after' ? callback : undefined);
  if (callback.original !== original.context) throw new Error('Original observer VM callback context differs');
  const guard = async () => {
    await assertOriginalApplyGcpInventoryCallback(original.baseline, callback);
    if (callback.phase === 'after') await assertOriginalInstalledGcpFinalCloudReader(reader, callback);
    else await assertOriginalInstalledGcpCloudReader(reader, callback.original);
    return original.read(callback.phase === 'after' ? callback : undefined);
  };
  await guard();
  const inventory = await readOriginalApplyGcpInventory(
    original.baseline,
    callback.phase === 'after' ? callback : undefined,
  );
  const diskRow = inventory.cloud.find((row) => row.address === source.diskAddress && row.role === 'observer');
  const vmRow = inventory.cloud.find((row) => row.address === source.address && row.role === 'observer');
  if (diskRow?.target.kind !== 'disk' || !vmRow) throw new Error('Original observer VM and disk absences required');
  const target = diskRow.target;
  const operation = await reader.insertOperation(source.zone, source.operationName, source.name);
  const instance = await reader.instance(source.zone, source.name);
  const disk = await reader.resource(target);
  if (!instance.present || !disk.present) throw new Error('Original observer VM and disk unavailable');
  let refused = false;
  const read = async (): Promise<Readonly<ObserverVmView>> => {
    if (refused) throw new Error('Original observer VM evidence retired');
    try {
      const identity = await guard();
      const opRaw = await reader.readEvidence(operation),
        vmRaw = await reader.readEvidence(instance),
        diskRaw = await reader.readResourceEvidence(disk);
      for (const row of [operation, instance, disk]) fresh(row);
      for (const row of [opRaw, vmRaw])
        if (
          row.scope.project !== identity.project ||
          row.scope.zone !== identity.zone ||
          row.scope.node !== identity.name ||
          row.authentication.accountSha256 !== callback.original.authentication.accountSha256 ||
          row.authentication.audienceSha256 !== callback.original.authentication.audienceSha256 ||
          row.authentication.adcSha256 !== callback.original.authentication.snapshotSha256
        )
          throw new Error('Original observer cloud scope or authentication differs');
      const vm = decodeEvidenceObject(vmRaw.raw),
        d = decodeEvidenceObject(diskRaw.raw),
        op = decodeEvidenceObject(opRaw.raw),
        request = decodeEvidenceObject(Buffer.from(original.requestBody));
      const zonePath = `projects/${identity.project}/zones/${identity.zone}`,
        diskPath = `${zonePath}/disks/${identity.name}`,
        vmPath = `${zonePath}/instances/${identity.name}`;
      const labels = object(request.labels);
      if (
        operation.operationId !== identity.operationId ||
        operation.operationName !== identity.operationName ||
        operation.targetId !== vm.id ||
        (identity.targetId !== null && identity.targetId !== vm.id) ||
        op.id !== identity.operationId ||
        op.name !== identity.operationName ||
        op.error !== undefined ||
        !isEvidenceRfc3339(op.insertTime) ||
        !isEvidenceRfc3339(vm.creationTimestamp) ||
        !isEvidenceRfc3339(d.creationTimestamp) ||
        Date.parse(op.insertTime) < vmRow.evidence.startedAt ||
        Date.parse(d.creationTimestamp) < diskRow.evidence.startedAt ||
        Date.parse(d.creationTimestamp) > Date.parse(vm.creationTimestamp) ||
        Date.parse(vm.creationTimestamp) < Date.parse(op.insertTime) ||
        Date.parse(vm.creationTimestamp) > instance.finishedAt ||
        vm.canIpForward !== false ||
        vm.deletionProtection !== false ||
        !link(vm.machineType, `${zonePath}/machineTypes/e2-micro`) ||
        (vm.serviceAccounts !== undefined && (!Array.isArray(vm.serviceAccounts) || vm.serviceAccounts.length)) ||
        fingerprint(object(vm.labels)) !== fingerprint(labels) ||
        fingerprint(metadata(vm.metadata, true)) !== fingerprint(metadata(request.metadata)) ||
        fingerprint(object(vm.tags).items) !== fingerprint([identity.name]) ||
        !uint64(d.id) ||
        d.sourceImageId !== GCP_OBSERVER_IMAGE_PIN.id ||
        !link(d.sourceImage, GCP_OBSERVER_IMAGE_PIN.selfLink.replace('https://www.googleapis.com/compute/v1/', '')) ||
        d.sizeGb !== '20' ||
        !link(d.type, `${zonePath}/diskTypes/pd-balanced`) ||
        fingerprint(object(d.labels)) !== fingerprint(labels) ||
        !link(d.zone, zonePath) ||
        !link(d.selfLink, diskPath) ||
        d.sourceSnapshotId !== undefined ||
        !Array.isArray(d.users) ||
        d.users.length !== 1 ||
        !link(d.users[0], vmPath)
      )
        throw new Error('Original observer VM/disk/image/creation ownership differs');
      const nics = vm.networkInterfaces,
        disks = vm.disks;
      if (!Array.isArray(nics) || nics.length !== 1 || !Array.isArray(disks) || disks.length !== 1)
        throw new Error('Original observer single disk and NIC required');
      const nic = object(nics[0]),
        boot = object(disks[0]),
        wanted = object((request.networkInterfaces as unknown[])[0]);
      if (
        nic.name !== 'nic0' ||
        !Array.isArray(nic.accessConfigs) ||
        nic.accessConfigs.length !== 1 ||
        !link(nic.network, String(wanted.network).replace('https://www.googleapis.com/compute/v1/', '')) ||
        !link(nic.subnetwork, String(wanted.subnetwork).replace('https://www.googleapis.com/compute/v1/', '')) ||
        typeof nic.networkIP !== 'string' ||
        isIP(nic.networkIP) !== 4 ||
        boot.boot !== true ||
        boot.autoDelete !== false ||
        !link(boot.source, diskPath)
      )
        throw new Error('Original observer VM disk/NIC mapping differs');
      const external = object(nic.accessConfigs[0]);
      if (
        external.type !== 'ONE_TO_ONE_NAT' ||
        external.networkTier !== 'PREMIUM' ||
        typeof external.natIP !== 'string' ||
        isIP(external.natIP) !== 4
      )
        throw new Error('Original observer external access mapping differs');
      const currentVm = await reader.instance(identity.zone, identity.name),
        currentDisk = await reader.resource(target);
      if (
        !currentVm.present ||
        !currentDisk.present ||
        currentVm.value.id !== instance.value.id ||
        currentDisk.value.id !== disk.value.id ||
        fingerprint(currentVm.value.disks) !== fingerprint(instance.value.disks) ||
        fingerprint(currentDisk.value.users) !== fingerprint(disk.value.users)
      )
        throw new Error('Original observer VM or disk changed during capture');
      await guard();
      await reader.readEvidence(instance);
      await reader.readResourceEvidence(disk);
      return Object.freeze({
        kind: 'original-gcp-observer-vm-evidence',
        project: identity.project,
        zone: identity.zone,
        name: identity.name,
        instanceId: instance.value.id,
        diskId: disk.value.id,
        imageId: GCP_OBSERVER_IMAGE_PIN.id,
        interfaceAddress: nic.networkIP,
        externalAddress: external.natIP,
        operationId: identity.operationId,
        instanceSha256: instance.sha256,
        diskSha256: disk.sha256,
        observerExecutionAuthorized: false,
        originalInsertQualified: false,
      });
    } catch (error) {
      refused = true;
      throw error;
    }
  };
  await read();
  const result: OriginalGcpObserverVmEvidence = Object.freeze({
    schemaVersion: 1,
    kind: 'original-gcp-observer-vm-reference',
  });
  vmOrigins.set(result, {
    read,
    async serial(start) {
      if (refused) throw new Error('Original observer VM evidence retired');
      try {
        await read();
        const capture = await reader.serial(instance, start);
        await read();
        return capture;
      } catch (error) {
        refused = true;
        throw error;
      }
    },
  });
  return result;
}
