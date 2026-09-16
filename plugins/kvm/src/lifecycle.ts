import { timingSafeEqual } from 'node:crypto';
import { isAbsolute } from 'node:path';
import {
  KVM_CONTRACT_COMMIT,
  KVM_CONTRACT_REPOSITORY,
  KVM_CONTRACT_TAG,
  KVM_OPENAPI_SHA256,
  KVM_PREREQUISITE_REASON,
} from './contract-identity';

const KVM_PREREQUISITE_ID = 'maurice_config_cardinality_exactly_one' as const;
const KVM_PREREQUISITE_OPERATION = 'ves.io.schema.registration.CustomAPI.GetImageDownloadUrl' as const;
const KVM_PREREQUISITE_FAILURE = 'number of maurice_config object is not one';

export interface KvmReleasePrerequisite {
  id: typeof KVM_PREREQUISITE_ID;
  resource: 'maurice_config';
  cardinality: { exactly: 1 };
  enforcement: 'server';
  availability: 'external_tenant_prerequisite';
  reason: string;
  source: {
    kind: 'runtime_api_error';
    operation: typeof KVM_PREREQUISITE_OPERATION;
    immutable: true;
  };
  publication: {
    repository: 'f5-sales-demo/api-specs-enriched';
    tag: string;
    commit: string;
    asset: 'openapi.json';
    sha256: string;
  };
}

export interface KvmImagePrerequisiteObservation {
  available: boolean;
  diagnostic?: string;
}

export interface KvmHostObservation {
  hostname: string;
  libvirtUri: 'qemu:///system';
  projectResources: Array<{ kind: string; name: string; owned: boolean }>;
}

export interface KvmSavedPlan {
  path: string;
  sha256: string;
  mode: 'apply' | 'destroy';
  add: number;
  change: number;
  destroy: number;
  azureActions: number;
}

export interface KvmLifecycleDependencies {
  readReleasePrerequisite(): Promise<KvmReleasePrerequisite>;
  probeImagePrerequisite(): Promise<KvmImagePrerequisiteObservation>;
  inspectHost(workspace: string): Promise<KvmHostObservation>;
  createSavedPlan(workspace: string, mode: KvmSavedPlan['mode']): Promise<KvmSavedPlan>;
}

export interface KvmLifecyclePlan {
  releasePrerequisite: KvmReleasePrerequisite;
  imagePrerequisite: { available: true };
  host: KvmHostObservation;
  savedPlan: KvmSavedPlan;
}

export interface KvmLifecyclePreflight {
  releasePrerequisite: KvmReleasePrerequisite;
  imagePrerequisite: { available: true };
  host: KvmHostObservation;
}

export interface KvmLifecycleApplyDependencies {
  readReleasePrerequisite(): Promise<KvmReleasePrerequisite>;
  probeImagePrerequisite(): Promise<KvmImagePrerequisiteObservation>;
  inspectHost(): Promise<KvmHostObservation>;
  hashSavedPlan(path: string): Promise<string>;
  applySavedPlan(path: string): Promise<void>;
}

export class KvmPrerequisiteUnavailableError extends Error {
  readonly code = KVM_PREREQUISITE_ID;

  constructor(reason: string) {
    super(`KVM prerequisite ${KVM_PREREQUISITE_ID} is unavailable: ${reason}`);
    this.name = 'KvmPrerequisiteUnavailableError';
  }
}

function assertReleasePrerequisite(value: KvmReleasePrerequisite): void {
  if (
    value.id !== KVM_PREREQUISITE_ID ||
    value.resource !== 'maurice_config' ||
    value.cardinality.exactly !== 1 ||
    value.enforcement !== 'server' ||
    value.availability !== 'external_tenant_prerequisite' ||
    value.source.kind !== 'runtime_api_error' ||
    value.source.operation !== KVM_PREREQUISITE_OPERATION ||
    value.source.immutable !== true ||
    value.publication.repository !== KVM_CONTRACT_REPOSITORY ||
    value.publication.asset !== 'openapi.json' ||
    value.publication.tag !== KVM_CONTRACT_TAG ||
    value.publication.commit !== KVM_CONTRACT_COMMIT ||
    value.publication.sha256 !== KVM_OPENAPI_SHA256 ||
    value.reason !== KVM_PREREQUISITE_REASON
  )
    throw new Error('The published KVM prerequisite contract is unsupported');
}

function assertHost(value: KvmHostObservation): void {
  if (!value.hostname || value.hostname.trim() !== value.hostname || value.libvirtUri !== 'qemu:///system')
    throw new Error('KVM host identity is invalid');
  if (value.projectResources.some((resource) => !resource.kind || !resource.name))
    throw new Error('KVM host inventory contains an invalid resource identity');
}

function assertSavedPlan(value: KvmSavedPlan, requestedMode: KvmSavedPlan['mode']): void {
  if (!isAbsolute(value.path) || !/^[0-9a-f]{64}$/.test(value.sha256) || value.mode !== requestedMode)
    throw new Error('KVM saved plan identity is invalid');
  if (![value.add, value.change, value.destroy, value.azureActions].every(Number.isSafeInteger))
    throw new Error('KVM saved plan summary is invalid');
  if ([value.add, value.change, value.destroy, value.azureActions].some((count) => count < 0))
    throw new Error('KVM saved plan summary contains a negative action count');
  if (value.azureActions !== 0) throw new Error('KVM saved plan contains Azure actions');
}

function prerequisiteUnavailable(
  releasePrerequisite: KvmReleasePrerequisite,
  imagePrerequisite: KvmImagePrerequisiteObservation,
): KvmPrerequisiteUnavailableError | undefined {
  if (imagePrerequisite.available) return undefined;
  const reason = imagePrerequisite.diagnostic?.includes(KVM_PREREQUISITE_FAILURE)
    ? releasePrerequisite.reason
    : 'The live image prerequisite probe did not prove availability.';
  return new KvmPrerequisiteUnavailableError(`${reason} The plugin cannot create or repair this tenant object.`);
}

function samePublication(left: KvmReleasePrerequisite, right: KvmReleasePrerequisite): boolean {
  return (
    left.id === right.id &&
    left.publication.repository === right.publication.repository &&
    left.publication.tag === right.publication.tag &&
    left.publication.commit === right.publication.commit &&
    left.publication.asset === right.publication.asset &&
    left.publication.sha256 === right.publication.sha256
  );
}

function safeHashEqual(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(left) || !/^[0-9a-f]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export async function prepareKvmLifecyclePlan(
  request: { workspace: string; mode: KvmSavedPlan['mode'] },
  dependencies: KvmLifecycleDependencies,
): Promise<KvmLifecyclePlan> {
  if (!isAbsolute(request.workspace)) throw new Error('KVM Terraform workspace must be an absolute path');

  const preflight = await preflightKvmLifecycle(request.workspace, dependencies);
  const savedPlan = await dependencies.createSavedPlan(request.workspace, request.mode);
  assertSavedPlan(savedPlan, request.mode);

  return { ...preflight, savedPlan };
}

export async function preflightKvmLifecycle(
  workspace: string,
  dependencies: Pick<KvmLifecycleDependencies, 'readReleasePrerequisite' | 'probeImagePrerequisite' | 'inspectHost'>,
): Promise<KvmLifecyclePreflight> {
  if (!isAbsolute(workspace)) throw new Error('KVM Terraform workspace must be an absolute path');

  const releasePrerequisite = await dependencies.readReleasePrerequisite();
  assertReleasePrerequisite(releasePrerequisite);

  const imagePrerequisite = await dependencies.probeImagePrerequisite();
  const unavailable = prerequisiteUnavailable(releasePrerequisite, imagePrerequisite);
  if (unavailable) throw unavailable;

  const host = await dependencies.inspectHost(workspace);
  assertHost(host);
  return { releasePrerequisite, imagePrerequisite: { available: true }, host };
}

export async function applyKvmLifecyclePlan(
  plan: KvmLifecyclePlan,
  dependencies: KvmLifecycleApplyDependencies,
): Promise<void> {
  assertReleasePrerequisite(plan.releasePrerequisite);
  assertSavedPlan(plan.savedPlan, plan.savedPlan.mode);

  const releasePrerequisite = await dependencies.readReleasePrerequisite();
  assertReleasePrerequisite(releasePrerequisite);
  if (!samePublication(plan.releasePrerequisite, releasePrerequisite))
    throw new Error('The KVM prerequisite release changed after planning');

  const imagePrerequisite = await dependencies.probeImagePrerequisite();
  const unavailable = prerequisiteUnavailable(releasePrerequisite, imagePrerequisite);
  if (unavailable) throw unavailable;

  const host = await dependencies.inspectHost();
  assertHost(host);
  if (host.hostname !== plan.host.hostname || host.libvirtUri !== plan.host.libvirtUri)
    throw new Error('KVM host identity changed after planning');
  if (
    plan.savedPlan.mode === 'destroy' &&
    [...plan.host.projectResources, ...host.projectResources].some((resource) => !resource.owned)
  )
    throw new Error('KVM destroy plan contains an unowned project resource');

  const currentSha256 = await dependencies.hashSavedPlan(plan.savedPlan.path);
  if (!safeHashEqual(currentSha256, plan.savedPlan.sha256)) throw new Error('KVM saved plan changed after inspection');

  await dependencies.applySavedPlan(plan.savedPlan.path);
}
