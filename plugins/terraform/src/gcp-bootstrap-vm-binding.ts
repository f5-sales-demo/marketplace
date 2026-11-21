import { createHash } from 'node:crypto';
import { fingerprint } from '../../gcloud/src/ce/discovery';
import type { GcpCeIntent } from '../../gcloud/src/ce/types';
import { decodeEvidenceObject } from './evidence-json';
import { joinOriginalGcpInsertAuditEvidence, type OriginalGcpInsertAuditJoinInput } from './gcp-insert-audit-evidence';
import {
  type OriginalEarlyGcpInsertIdentity,
  readOriginalEarlyGcpInsertBodies,
  readOriginalEarlyGcpInsertIdentity,
  readOriginalGcpInsertSourceBodies,
} from './gcp-insert-evidence';
import {
  assertOriginalGcpPreapplyBootstrapCallback,
  assertOriginalGcpPreapplyBootstrapContext,
  type OriginalGcpPreapplyBootstrapEvidence,
  readOriginalGcpPreapplyBootstrapJwt,
} from './gcp-preapply-bootstrap';
import {
  assertOriginalGcpVmCaptureCallback,
  type OriginalEarlyGcpVmEvidence,
  type OriginalFinalGcpVmEvidence,
  readOriginalEarlyGcpVmEvidence,
  readOriginalFinalGcpVmEvidence,
} from './gcp-vm-evidence';
import {
  assertOriginalApplyCallback,
  assertOriginalApplyLifetime,
  type OriginalApplyCallbackContext,
} from './installed-apply-controller';
import type { InstalledCaptureContext } from './installed-capture-context';
import { readOwnedInstalledInput } from './installed-runtime';
import { assertSameOriginalInput } from './original-input-monitor';

type Json = Record<string, unknown>;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Original bootstrap VM object required');
  return value as Json;
};

export interface OriginalEarlyGcpBootstrapVm {
  readonly schemaVersion: 1;
  readonly kind: 'original-early-gcp-bootstrap-vm-reference';
}
type EarlyBootstrapView = Awaited<ReturnType<typeof readOriginalEarlyGcpVmEvidence>> &
  Readonly<{
    siteName: string;
    expiresAt: string;
    jwtSha256: string;
    ownershipSha256: string;
    bootstrapCorroborated: true;
    guestAcceptanceComplete: false;
  }>;
export interface OriginalFinalGcpBootstrapVm {
  readonly schemaVersion: 1;
  readonly kind: 'original-final-gcp-bootstrap-vm-reference';
}
type FinalBootstrapView = Awaited<ReturnType<typeof readOriginalFinalGcpVmEvidence>> &
  Pick<
    EarlyBootstrapView,
    'siteName' | 'expiresAt' | 'jwtSha256' | 'ownershipSha256' | 'bootstrapCorroborated' | 'guestAcceptanceComplete'
  >;
type BootstrapView = EarlyBootstrapView | FinalBootstrapView;
interface FinalBootstrapHandoff {
  readonly callback: OriginalApplyCallbackContext;
  readonly vm: OriginalFinalGcpVmEvidence;
  readonly bootstrap: OriginalGcpPreapplyBootstrapEvidence;
}
const finalBootstrapOrigins = new WeakMap<
  OriginalFinalGcpBootstrapVm,
  {
    callback: OriginalApplyCallbackContext;
    bootstrap: OriginalGcpPreapplyBootstrapEvidence;
    vm: OriginalFinalGcpVmEvidence;
    read(): Promise<FinalBootstrapView>;
  }
>();
const earlyBootstrapOrigins = new WeakMap<
  OriginalEarlyGcpBootstrapVm,
  {
    callback: OriginalApplyCallbackContext;
    bootstrap: OriginalGcpPreapplyBootstrapEvidence;
    vm: OriginalEarlyGcpVmEvidence;
    read(): Promise<EarlyBootstrapView>;
    handoff(input: FinalBootstrapHandoff): Promise<OriginalFinalGcpBootstrapVm>;
  }
>();
export async function readOriginalEarlyGcpBootstrapVm(value: unknown, callback: OriginalApplyCallbackContext) {
  const origin =
    value && typeof value === 'object' ? earlyBootstrapOrigins.get(value as OriginalEarlyGcpBootstrapVm) : undefined;
  if (!origin || origin.callback !== callback)
    throw new Error('Original early bootstrap VM and actual callback required');
  return origin.read();
}
export async function handoffOriginalEarlyGcpBootstrapVm(value: unknown, input: FinalBootstrapHandoff) {
  const origin =
    value && typeof value === 'object' ? earlyBootstrapOrigins.get(value as OriginalEarlyGcpBootstrapVm) : undefined;
  if (!origin) throw new Error('Original early bootstrap VM handoff source required');
  return origin.handoff(input);
}
export async function readOriginalFinalGcpBootstrapVm(value: unknown, callback: OriginalApplyCallbackContext) {
  const origin =
    value && typeof value === 'object' ? finalBootstrapOrigins.get(value as OriginalFinalGcpBootstrapVm) : undefined;
  if (!origin || origin.callback !== callback)
    throw new Error('Original final bootstrap VM and actual callback required');
  return origin.read();
}
/** Read-only early bootstrap/NIC join. Final RPC/provider/audit, guest evidence
 * and reviewed execution authorization remain separate mandatory boundaries. */
export async function joinOriginalEarlyGcpBootstrapVm(input: {
  context: InstalledCaptureContext;
  callback: OriginalApplyCallbackContext;
  bootstrap: OriginalGcpPreapplyBootstrapEvidence;
  identity: OriginalEarlyGcpInsertIdentity;
  vm: OriginalEarlyGcpVmEvidence;
}) {
  const { context, callback, bootstrap, identity, vm } = input;
  if (callback.original !== context || callback.phase !== 'before')
    throw new Error('Original early bootstrap before callback required');
  await assertOriginalApplyLifetime(callback);
  let refused = false;
  let transferred = false,
    handoffClaimed = false;
  let currentCallback = callback;
  let currentVm: OriginalEarlyGcpVmEvidence | OriginalFinalGcpVmEvidence = vm;
  let currentBootstrap = bootstrap;
  const read = async (): Promise<BootstrapView> => {
    if (refused) throw new Error('Original early bootstrap VM join was refused');
    const selectedCallback = currentCallback,
      selectedVm = currentVm,
      selectedBootstrap = currentBootstrap;
    const verifyCallback = () =>
      selectedCallback.phase === 'before'
        ? assertOriginalApplyLifetime(selectedCallback)
        : assertOriginalApplyCallback(selectedCallback);
    try {
      await verifyCallback();
      await context.assertInputs();
      await assertOriginalGcpPreapplyBootstrapContext(selectedBootstrap, context);
      if (selectedCallback.phase === 'after')
        await assertOriginalGcpPreapplyBootstrapCallback(selectedBootstrap, selectedCallback);
      await assertOriginalGcpVmCaptureCallback(selectedVm, selectedCallback);
      const inserted = await readOriginalEarlyGcpInsertIdentity(identity);
      const observed =
        selectedCallback.phase === 'after'
          ? await readOriginalFinalGcpVmEvidence(selectedVm)
          : await readOriginalEarlyGcpVmEvidence(selectedVm);
      const base = selectedBootstrap.bootstrap;
      if (
        fingerprint(base.owner) !== fingerprint(context.owner) ||
        base.deploymentName !== context.owner.deploymentId ||
        inserted.planSha256 !== selectedBootstrap.planSha256 ||
        inserted.project !== context.owner.account ||
        observed.project !== inserted.project ||
        observed.nodeName !== inserted.nodeName ||
        observed.nodeName !== base.nodeName ||
        observed.zone !== inserted.zone ||
        observed.resourceAddress !== inserted.address ||
        observed.sourceRequestSha256 !== inserted.requestBodySha256 ||
        observed.operationId !== inserted.operationId ||
        (['pid', 'group', 'start', 'boot'] as const).some(
          (key) =>
            selectedBootstrap.executor[key] !== selectedCallback.execution.identity[key] ||
            inserted.executor[key] !== selectedCallback.execution.identity[key],
        )
      )
        throw new Error('Original early bootstrap VM scope or executor differs');
      const binding = context.inputs['workspace:gcp-terraform-input-identity.json'];
      if (!binding) throw new Error('Original reviewed guest intent required');
      const original = await readOwnedInstalledInput(binding.path);
      assertSameOriginalInput(binding, original.binding);
      const saved = decodeEvidenceObject(original.bytes) as unknown as {
        intent: GcpCeIntent;
        intentFingerprint: string;
      };
      if (
        saved.intentFingerprint !== fingerprint(saved.intent) ||
        saved.intent.project !== context.owner.account ||
        saved.intent.region !== context.owner.region ||
        saved.intent.deploymentName !== context.owner.deploymentId ||
        saved.intent.engine !== 'terraform' ||
        saved.intent.operation !== 'deploy'
      )
        throw new Error('Original reviewed guest intent differs');
      const sites = saved.intent.sites.filter(
        (site) => site.name === base.siteName && site.nodes.some((node) => node.name === base.nodeName),
      );
      if (sites.length !== 1) throw new Error('Original bootstrap site and node differ from review');
      const nodes = sites[0].nodes.filter((node) => node.name === base.nodeName && node.zone === observed.zone);
      if (
        nodes.length !== 1 ||
        nodes[0].interfaces.length !== 2 ||
        observed.interfaces.length !== 2 ||
        observed.interfaces.some(
          (nic, index) =>
            nic.index !== index ||
            nic.name !== `nic${index}` ||
            nic.network !== `projects/${context.owner.account}/global/networks/${nodes[0].interfaces[index].network}` ||
            nic.subnetwork !==
              `projects/${context.owner.account}/regions/${context.owner.region}/subnetworks/${nodes[0].interfaces[index].subnet}`,
        )
      )
        throw new Error('Original reviewed CE NIC mapping differs');
      const bodies = await readOriginalEarlyGcpInsertBodies(identity);
      const request = decodeEvidenceObject(Buffer.from(bodies.requestBody));
      const metadata = object(request.metadata),
        labels = object(request.labels);
      if (
        labels['xcsh-site'] !== base.siteName ||
        labels['xcsh-node'] !== base.nodeName ||
        labels['xcsh-deployment'] !== base.deploymentName ||
        labels['xcsh-engine'] !== 'terraform'
      )
        throw new Error('Original VM bootstrap site labels differ');
      if (!Array.isArray(metadata.items)) throw new Error('Original token-only metadata required');
      const data = metadata.items.map(object).filter((entry) => entry.key === 'user-data');
      const jwt = await readOriginalGcpPreapplyBootstrapJwt(selectedBootstrap);
      if (data.length !== 1 || typeof data[0].value !== 'string' || hash(data[0].value) !== inserted.bootstrapSha256)
        throw new Error('Original bootstrap token metadata differs');
      let config: Json;
      try {
        config = object(Bun.YAML.parse(data[0].value));
      } catch {
        throw new Error('Original token-only cloud-init required');
      }
      if (
        !data[0].value.startsWith('#cloud-config') ||
        Object.keys(config).join(',') !== 'write_files' ||
        !Array.isArray(config.write_files) ||
        config.write_files.length !== 1
      )
        throw new Error('Original token-only cloud-init required');
      const file = object(config.write_files[0]);
      if (
        Object.keys(file).sort().join(',') !== 'content,owner,path,permissions' ||
        file.path !== '/etc/vpm/user_data' ||
        file.owner !== 'root' ||
        file.permissions !== '0600' ||
        typeof file.content !== 'string' ||
        file.content.trim() !== `token: ${jwt}` ||
        hash(jwt) !== base.jwtSha256 ||
        !Number.isFinite(Date.parse(base.expiresAt)) ||
        Date.now() >= Date.parse(base.expiresAt)
      )
        throw new Error('Original unexpired bootstrap token differs');
      await assertOriginalGcpPreapplyBootstrapContext(selectedBootstrap, context);
      await assertOriginalGcpVmCaptureCallback(selectedVm, selectedCallback);
      await readOriginalEarlyGcpInsertIdentity(identity);
      await context.assertInputs();
      await verifyCallback();
      if (selectedCallback !== currentCallback || selectedVm !== currentVm || selectedBootstrap !== currentBootstrap)
        throw new Error('Original bootstrap VM lifetime changed during source read');
      return Object.freeze({
        ...observed,
        siteName: base.siteName,
        expiresAt: base.expiresAt,
        jwtSha256: base.jwtSha256,
        ownershipSha256: fingerprint({
          owner: context.owner,
          siteUid: base.siteUid,
          tokenUid: base.tokenUid,
          vm: observed.instanceId,
          operation: observed.operationId,
          interfaces: observed.interfaces,
          jwt: base.jwtSha256,
          userdata: inserted.bootstrapSha256,
          request: inserted.requestBodySha256,
        }).slice(7),
        bootstrapCorroborated: true as const,
        guestAcceptanceComplete: false as const,
      });
    } catch (error) {
      refused = true;
      throw error;
    }
  };
  const initial = await read();
  const ref: OriginalEarlyGcpBootstrapVm = Object.freeze({
    schemaVersion: 1,
    kind: 'original-early-gcp-bootstrap-vm-reference',
  });
  earlyBootstrapOrigins.set(ref, {
    callback,
    bootstrap,
    vm,
    async read() {
      if (transferred || handoffClaimed) throw new Error('Original early bootstrap VM join retired');
      const view = await read();
      if (transferred || handoffClaimed) throw new Error('Original early bootstrap VM join retired during read');
      if (view.kind !== 'original-early-gcp-vm-cloud-candidate')
        throw new Error('Original early bootstrap phase differs');
      return view;
    },
    async handoff(input) {
      if (transferred || handoffClaimed || refused)
        throw new Error('Original bootstrap VM handoff already claimed or refused');
      const after = input.callback;
      if (
        after.phase !== 'after' ||
        !after.reserve ||
        after.original !== context ||
        after.nonce !== callback.nonce ||
        after.execution.output !== callback.execution.output ||
        (['pid', 'group', 'start', 'boot'] as const).some(
          (key) => after.execution.identity[key] !== callback.execution.identity[key],
        )
      )
        throw new Error('Original final bootstrap callback and unchanged actor required');
      await assertOriginalApplyCallback(after);
      if (transferred || handoffClaimed || refused)
        throw new Error('Original bootstrap VM handoff already claimed or refused');
      handoffClaimed = true;
      try {
        // Claim before the awaited VM check; two callers must never enter
        // the same original descriptor verification concurrently.
        await assertOriginalGcpVmCaptureCallback(input.vm, after);
        await assertOriginalGcpPreapplyBootstrapCallback(input.bootstrap, after);
        if (
          (
            [
              'owner',
              'deploymentName',
              'siteName',
              'siteUid',
              'nodeName',
              'tokenName',
              'tokenUid',
              'jwtSha256',
              'expiresAt',
            ] as const
          ).some((key) => fingerprint(input.bootstrap.bootstrap[key]) !== fingerprint(bootstrap.bootstrap[key])) ||
          input.bootstrap.xcshProviderVersion !== bootstrap.xcshProviderVersion ||
          input.bootstrap.planSha256 !== bootstrap.planSha256 ||
          input.bootstrap.readerRequestSha256 !== bootstrap.readerRequestSha256 ||
          input.bootstrap.siteCreationSha256 !== bootstrap.siteCreationSha256 ||
          input.bootstrap.tokenCreationSha256 !== bootstrap.tokenCreationSha256 ||
          (['pid', 'group', 'start', 'boot'] as const).some(
            (key) => input.bootstrap.executor[key] !== bootstrap.executor[key],
          )
        )
          throw new Error('Original final bootstrap identity or token changed');
        currentBootstrap = input.bootstrap;
        currentCallback = after;
        currentVm = input.vm;
        const final = await read();
        if (final.kind !== 'original-final-gcp-vm-cloud-candidate' || final.ownershipSha256 !== initial.ownershipSha256)
          throw new Error('Original final bootstrap VM ownership changed');
        await assertOriginalApplyCallback(after);
        transferred = true;
        const result: OriginalFinalGcpBootstrapVm = Object.freeze({
          schemaVersion: 1,
          kind: 'original-final-gcp-bootstrap-vm-reference',
        });
        finalBootstrapOrigins.set(result, {
          callback: after,
          bootstrap: currentBootstrap,
          vm: input.vm,
          async read() {
            const view = await read();
            if (
              view.kind !== 'original-final-gcp-vm-cloud-candidate' ||
              view.ownershipSha256 !== initial.ownershipSha256
            )
              throw new Error('Original final bootstrap VM ownership changed');
            return view;
          },
        });
        return result;
      } catch (error) {
        refused = true;
        throw error;
      }
    },
  });
  return ref;
}
/** Join original Platform bootstrap and independent cloud/audit observations.
 * This corroborates ownership and userdata only; source lifetime, single-use
 * authorization, guest and operational acceptance remain mandatory.
 */
export async function joinOriginalGcpBootstrapVm(input: {
  context: InstalledCaptureContext;
  bootstrap: OriginalGcpPreapplyBootstrapEvidence;
  cloud: OriginalGcpInsertAuditJoinInput;
}) {
  const { context, bootstrap, cloud } = input;
  await assertOriginalGcpPreapplyBootstrapContext(bootstrap, context);
  await context.assertWithinDeadline();
  await context.assertInputs();
  const base = bootstrap.bootstrap,
    source = cloud.source;
  if (
    source.planSha256 !== bootstrap.planSha256 ||
    source.project !== base.owner.account ||
    source.nodeName !== base.nodeName ||
    source.zone.slice(0, -2) !== base.owner.region ||
    source.parentPid !== bootstrap.executor.pid ||
    source.parentStart !== bootstrap.executor.start ||
    source.parentBoot !== bootstrap.executor.boot
  )
    throw new Error('Original bootstrap creation and insert scope or parent differs');
  const bodies = readOriginalGcpInsertSourceBodies(source);
  const request = decodeEvidenceObject(Buffer.from(bodies.requestBody)),
    metadata = object(request.metadata),
    labels = object(request.labels);
  if (!Array.isArray(metadata.items)) throw new Error('Original VM metadata required');
  const userdata = metadata.items.map(object).filter((row) => row.key === 'user-data');
  if (
    userdata.length !== 1 ||
    typeof userdata[0].value !== 'string' ||
    hash(userdata[0].value) !== source.bootstrapSha256
  )
    throw new Error('Original VM user-data identity differs');
  const jwt = await readOriginalGcpPreapplyBootstrapJwt(bootstrap);
  let config: Json;
  try {
    config = object(Bun.YAML.parse(userdata[0].value));
  } catch {
    throw new Error('Original token-only cloud-init required');
  }
  if (
    !userdata[0].value.startsWith('#cloud-config') ||
    Object.keys(config).join(',') !== 'write_files' ||
    !Array.isArray(config.write_files) ||
    config.write_files.length !== 1
  )
    throw new Error('Original token-only cloud-init required');
  const file = object(config.write_files[0]);
  if (
    Object.keys(file).sort().join(',') !== 'content,owner,path,permissions' ||
    file.path !== '/etc/vpm/user_data' ||
    file.owner !== 'root' ||
    file.permissions !== '0600' ||
    typeof file.content !== 'string' ||
    file.content.trim() !== `token: ${jwt}`
  )
    throw new Error('Original Site-bound JWT or certified cloud-init differs');
  if (
    labels['xcsh-deployment'] !== base.deploymentName ||
    labels['xcsh-site'] !== base.siteName ||
    labels['xcsh-node'] !== base.nodeName ||
    labels['xcsh-engine'] !== 'terraform'
  )
    throw new Error('Original VM bootstrap ownership labels differ');
  const vm = await joinOriginalGcpInsertAuditEvidence(cloud);
  if (
    vm.accountSha256 !== context.authentication.accountSha256 ||
    vm.audienceSha256 !== context.authentication.audienceSha256 ||
    vm.adcSha256 !== context.authentication.snapshotSha256 ||
    vm.interfaces.length !== 2
  )
    throw new Error('Original admitted principal, snapshot or CE interfaces differ');
  await assertOriginalGcpPreapplyBootstrapContext(bootstrap, context);
  await readOriginalGcpPreapplyBootstrapJwt(bootstrap);
  readOriginalGcpInsertSourceBodies(source);
  await context.assertInputs();
  await context.assertWithinDeadline();
  return Object.freeze({
    ...vm,
    schemaVersion: 2 as const,
    kind: 'original-gcp-bootstrap-vm-audit-candidate' as const,
    siteCreationSha256: bootstrap.siteCreationSha256,
    tokenCreationSha256: bootstrap.tokenCreationSha256,
    jwtSha256: base.jwtSha256,
    bootstrapCorroborated: true as const,
    bootstrapOwnershipQualified: false as const,
    originalInsertQualified: false as const,
  });
}

/** The key/trust consumer must bind the same original bootstrap reference used
 * by this VM join, not another same-name Site/token receipt or copied fields. */
export async function readOriginalGcpBootstrapVmSource(
  value: unknown,
  bootstrap: unknown,
  callback: OriginalApplyCallbackContext,
  vm?: unknown,
) {
  const origin =
    value && typeof value === 'object'
      ? callback.phase === 'after'
        ? finalBootstrapOrigins.get(value as OriginalFinalGcpBootstrapVm)
        : earlyBootstrapOrigins.get(value as OriginalEarlyGcpBootstrapVm)
      : undefined;
  if (
    !origin ||
    origin.callback !== callback ||
    origin.bootstrap !== bootstrap ||
    (vm !== undefined && origin.vm !== vm)
  )
    throw new Error('Original VM/bootstrap source and actual callback required');
  return origin.read();
}
