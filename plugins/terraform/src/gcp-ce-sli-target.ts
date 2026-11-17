import { isIP } from 'node:net';
import { dirname, join } from 'node:path';
import { fingerprint } from '../../gcloud/src/ce/discovery';
import { assertGcpTerraformObserverScope, gcpTerraformObserverIdentity } from '../../gcloud/src/ce/observer-scope';
import type { GcpCeIntent } from '../../gcloud/src/ce/types';
import { decodeEvidenceObject } from './evidence-json';
import { assertOriginalGcpObserverClientAbiContext, type QualifiedGcpObserverClients } from './gcp-observer-client-abi';
import { assertOriginalVerifiedGcpObserverPeerContext } from './gcp-observer-ssh-peer';
import {
  assertOriginalGcpVmCaptureCallback,
  readOriginalEarlyGcpSerialSource,
  readOriginalEarlyGcpVmEvidence,
  readOriginalFinalGcpSerialSource,
  readOriginalFinalGcpVmEvidence,
} from './gcp-vm-evidence';
import type { OriginalApplyCallbackContext } from './installed-apply-controller';
import { readOwnedInstalledInput } from './installed-runtime';
import { assertSameOriginalInput } from './original-input-monitor';

export interface OriginalGcpCeSliTarget {
  readonly schemaVersion: 1;
  readonly kind: 'original-gcp-ce-sli-target-reference';
}
interface TargetView {
  readonly callback: OriginalApplyCallbackContext;
  readonly project: string;
  readonly zone: string;
  readonly nodeName: string;
  readonly instanceId: string;
  readonly interfaceIndex: 1;
  readonly role: 'sli';
  readonly address: string;
  readonly network: string;
  readonly subnet: string;
  readonly sshTrustQualified: false;
}
const origins = new WeakMap<
  OriginalGcpCeSliTarget,
  {
    readonly callback: OriginalApplyCallbackContext;
    readonly vm: unknown;
    read(): Promise<Readonly<TargetView>>;
  }
>();
export async function readOriginalGcpCeSliTarget(value: unknown) {
  const origin = value && typeof value === 'object' ? origins.get(value as OriginalGcpCeSliTarget) : undefined;
  if (!origin) throw new Error('Original CE SLI target required');
  return origin.read();
}
export async function assertOriginalGcpCeSliTargetContext(value: unknown, callback: OriginalApplyCallbackContext) {
  const origin = value && typeof value === 'object' ? origins.get(value as OriginalGcpCeSliTarget) : undefined;
  if (!origin || origin.callback !== callback) throw new Error('Original CE SLI target and actual callback required');
  return origin.read();
}
/** Read serial only through this target's exact original VM and callback. */
export async function readOriginalGcpCeSliSerialSource(
  value: unknown,
  serial: unknown,
  callback: OriginalApplyCallbackContext,
) {
  const origin = value && typeof value === 'object' ? origins.get(value as OriginalGcpCeSliTarget) : undefined;
  if (!origin || origin.callback !== callback) throw new Error('Original CE SLI target serial context required');
  await origin.read();
  const source =
    callback.phase === 'after'
      ? await readOriginalFinalGcpSerialSource(origin.vm, serial)
      : await readOriginalEarlyGcpSerialSource(origin.vm, serial);
  await origin.read();
  return source;
}
/** Resolve the supported reviewed SLI mapping against the original VM/NIC
 * issuer. An address or receipt supplied by a caller cannot mint this target.
 * This binding grants neither SSH trust nor execution authorization. */
export async function openOriginalGcpCeSliTarget(vm: unknown, callback: OriginalApplyCallbackContext) {
  await assertOriginalGcpVmCaptureCallback(vm, callback);
  const binding = callback.original.inputs['workspace:gcp-terraform-input-identity.json'];
  if (
    !binding ||
    binding.path !== join(dirname(callback.original.executionDirectory), 'gcp-terraform-input-identity.json')
  )
    throw new Error('Original reviewed CE intent binding required');
  const project = async (): Promise<Readonly<TargetView>> => {
    await assertOriginalGcpVmCaptureCallback(vm, callback);
    const original =
      callback.phase === 'after' ? await readOriginalFinalGcpVmEvidence(vm) : await readOriginalEarlyGcpVmEvidence(vm);
    const input = await readOwnedInstalledInput(binding.path);
    assertSameOriginalInput(binding, input.binding);
    const saved = decodeEvidenceObject(input.bytes),
      intent = saved.intent as GcpCeIntent;
    const owner = callback.original.owner;
    if (
      intent?.schemaVersion !== 2 ||
      !intent.observer ||
      !intent.initialAccess ||
      saved.intentFingerprint !== fingerprint(intent) ||
      saved.platformContext !== intent.platformContext ||
      intent.engine !== 'terraform' ||
      intent.operation !== 'deploy' ||
      intent.project !== owner.account ||
      intent.region !== owner.region ||
      intent.deploymentName !== owner.deploymentId ||
      original.project !== owner.account
    )
      throw new Error('Original reviewed observer/CE deployment scope differs');
    assertGcpTerraformObserverScope(intent.observer, intent);
    const declared = intent.sites
      .flatMap((site) => site.nodes)
      .filter((node) => node.name === original.nodeName && node.zone === original.zone);
    const observer = gcpTerraformObserverIdentity(intent);
    if (declared.length !== 1 || original.interfaces.length !== 2)
      throw new Error('Original CE node and two-interface mapping required');
    const inside = declared[0].interfaces[1],
      nic = original.interfaces[1];
    const network = `projects/${intent.project}/global/networks/${inside.network}`;
    const subnet = `projects/${intent.project}/regions/${intent.region}/subnetworks/${inside.subnet}`;
    if (
      inside.index !== 1 ||
      inside.role !== 'sli' ||
      nic.index !== 1 ||
      nic.name !== 'nic1' ||
      nic.network !== network ||
      nic.subnetwork !== subnet ||
      isIP(nic.address) !== 4 ||
      observer.network !== inside.network ||
      observer.subnet !== inside.subnet
    )
      throw new Error('Original reviewed CE SLI/observer network join differs');
    await assertOriginalGcpVmCaptureCallback(vm, callback);
    assertSameOriginalInput(binding, (await readOwnedInstalledInput(binding.path)).binding);
    return Object.freeze({
      callback,
      project: original.project,
      zone: original.zone,
      nodeName: original.nodeName,
      instanceId: original.instanceId,
      interfaceIndex: 1,
      role: 'sli',
      address: nic.address,
      network,
      subnet,
      sshTrustQualified: false,
    });
  };
  const original = await project();
  let retired = false;
  const read = async () => {
    if (retired) throw new Error('Original CE SLI target retired');
    try {
      const current = await project();
      for (const name of ['project', 'zone', 'nodeName', 'instanceId', 'address', 'network', 'subnet'] as const)
        if (current[name] !== original[name]) throw new Error('Original CE SLI target identity changed');
      return original;
    } catch (error) {
      retired = true;
      throw error;
    }
  };
  const ref: OriginalGcpCeSliTarget = Object.freeze({ schemaVersion: 1, kind: 'original-gcp-ce-sli-target-reference' });
  origins.set(ref, { callback, vm, read });
  await read();
  return ref;
}

export interface OriginalQualifiedGcpCeObserverScanContext {
  readonly schemaVersion: 1;
  readonly kind: 'original-qualified-gcp-ce-observer-scan-context-reference';
}
interface QualifiedScanView {
  readonly callback: OriginalApplyCallbackContext;
  readonly target: Readonly<TargetView>;
  readonly targetReference: unknown;
  readonly observerCommand: unknown;
  readonly observerPeer: unknown;
  readonly observerInstanceId: string;
  readonly clients: Readonly<QualifiedGcpObserverClients>;
  readonly guestClientQualified: true;
  readonly sshTrustQualified: false;
}
const qualifiedScans = new WeakMap<
  OriginalQualifiedGcpCeObserverScanContext,
  {
    readonly callback: OriginalApplyCallbackContext;
    read(): Promise<Readonly<QualifiedScanView>>;
  }
>();
export async function readOriginalQualifiedGcpCeObserverScanContext(value: unknown) {
  const origin =
    value && typeof value === 'object'
      ? qualifiedScans.get(value as OriginalQualifiedGcpCeObserverScanContext)
      : undefined;
  if (!origin) throw new Error('Original qualified CE observer scan context required');
  return origin.read();
}
export async function assertOriginalQualifiedGcpCeObserverScanContext(
  value: unknown,
  callback: OriginalApplyCallbackContext,
) {
  const origin =
    value && typeof value === 'object'
      ? qualifiedScans.get(value as OriginalQualifiedGcpCeObserverScanContext)
      : undefined;
  if (!origin || origin.callback !== callback)
    throw new Error('Original qualified CE observer context and actual callback required');
  return origin.read();
}
/** Only the same original CE target, authenticated peer and native-qualified
 * client reference may prepare the observer-assisted wire scan. CE host trust
 * remains unqualified until its independent original serial/wire join passes. */
export async function bindOriginalQualifiedGcpCeObserverScanContext(
  target: unknown,
  clients: unknown,
  callback: OriginalApplyCallbackContext,
) {
  const originalTarget = await assertOriginalGcpCeSliTargetContext(target, callback);
  const originalClients = await assertOriginalGcpObserverClientAbiContext(clients, callback);
  const originalPeer = await assertOriginalVerifiedGcpObserverPeerContext(originalClients.peer, callback);
  if (
    originalTarget.instanceId === originalPeer.peer.instanceId ||
    originalClients.clients.instanceId !== originalPeer.peer.instanceId ||
    originalClients.clients.guestClientQualified !== true
  )
    throw new Error('Original qualified observer and distinct CE VM required');
  let retired = false;
  const read = async (): Promise<Readonly<QualifiedScanView>> => {
    if (retired) throw new Error('Original qualified CE observer scan context retired');
    try {
      const currentTarget = await assertOriginalGcpCeSliTargetContext(target, callback);
      const currentClients = await assertOriginalGcpObserverClientAbiContext(clients, callback);
      const currentPeer = await assertOriginalVerifiedGcpObserverPeerContext(originalClients.peer, callback);
      if (
        currentTarget !== originalTarget ||
        currentClients.peer !== originalClients.peer ||
        currentClients.clients.receiptSha256 !== originalClients.clients.receiptSha256 ||
        currentPeer.command !== originalPeer.command ||
        currentPeer.peer.instanceId !== originalPeer.peer.instanceId
      )
        throw new Error('Original qualified CE/observer/client binding changed');
      return Object.freeze({
        callback,
        target: originalTarget,
        targetReference: target,
        observerCommand: originalPeer.command,
        observerPeer: originalClients.peer,
        observerInstanceId: originalPeer.peer.instanceId,
        clients: currentClients.clients,
        guestClientQualified: true,
        sshTrustQualified: false,
      });
    } catch (error) {
      retired = true;
      throw error;
    }
  };
  const ref: OriginalQualifiedGcpCeObserverScanContext = Object.freeze({
    schemaVersion: 1,
    kind: 'original-qualified-gcp-ce-observer-scan-context-reference',
  });
  qualifiedScans.set(ref, { callback, read });
  await read();
  return ref;
}
export interface OriginalGcpCeObserverScanContext {
  readonly schemaVersion: 1;
  readonly kind: 'original-gcp-ce-observer-scan-context-reference';
}
type ScanView = Readonly<{
  callback: OriginalApplyCallbackContext;
  target: Readonly<TargetView>;
  observerCommand: unknown;
  observerInstanceId: string;
  guestClientQualified: false;
  sshTrustQualified: false;
}>;
const scans = new WeakMap<OriginalGcpCeObserverScanContext, () => Promise<ScanView>>();
export async function readOriginalGcpCeObserverScanContext(value: unknown) {
  const read = value && typeof value === 'object' ? scans.get(value as OriginalGcpCeObserverScanContext) : undefined;
  if (!read) throw new Error('Original CE observer scan context required');
  return read();
}
/** Bind a verified peer and target for one actual callback. Remote client
 * delivery and CE serial/wire trust must be qualified before execution. */
export async function bindOriginalGcpCeObserverScanContext(
  target: unknown,
  peer: unknown,
  callback: OriginalApplyCallbackContext,
) {
  const originalTarget = await assertOriginalGcpCeSliTargetContext(target, callback);
  const originalPeer = await assertOriginalVerifiedGcpObserverPeerContext(peer, callback);
  if (originalTarget.instanceId === originalPeer.peer.instanceId)
    throw new Error('Original observer and CE must be distinct VMs');
  let retired = false;
  const read = async (): Promise<ScanView> => {
    if (retired) throw new Error('Original CE observer scan context retired');
    try {
      const currentTarget = await assertOriginalGcpCeSliTargetContext(target, callback);
      const currentPeer = await assertOriginalVerifiedGcpObserverPeerContext(peer, callback);
      if (
        currentTarget !== originalTarget ||
        currentPeer.command !== originalPeer.command ||
        currentPeer.peer.instanceId !== originalPeer.peer.instanceId
      )
        throw new Error('Original CE/observer scan context changed');
      return Object.freeze({
        callback,
        target: originalTarget,
        observerCommand: originalPeer.command,
        observerInstanceId: originalPeer.peer.instanceId,
        guestClientQualified: false,
        sshTrustQualified: false,
      });
    } catch (error) {
      retired = true;
      throw error;
    }
  };
  const ref: OriginalGcpCeObserverScanContext = Object.freeze({
    schemaVersion: 1,
    kind: 'original-gcp-ce-observer-scan-context-reference',
  });
  scans.set(ref, read);
  await read();
  return ref;
}
