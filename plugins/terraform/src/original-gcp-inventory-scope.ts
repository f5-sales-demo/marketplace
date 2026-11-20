import { join } from 'node:path';
import { fingerprint } from '../../gcloud/src/ce/discovery';
import { gcpTerraformObserverIdentity } from '../../gcloud/src/ce/observer-scope';
import {
  publicTerraformCloudScope,
  publicTerraformPlatformScope,
} from '../../gcloud/src/ce/terraform-public-ownership';
import type { GcpCeIntent } from '../../gcloud/src/ce/types';
import { validateIntent } from '../../gcloud/src/ce/validation';
import type { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import { decodeEvidenceObject } from './evidence-json';
import { compileGcpInventoryResourceTarget, type GcpInventoryResourceTarget } from './gcp-inventory-target';
import type { InstalledCaptureContext } from './installed-capture-context';
import { readOwnedInstalledInput } from './installed-runtime';
import { assertSameOriginalInput, monitorOriginalInputs } from './original-input-monitor';
import { assertOriginalTerraformPlanProjection, type OriginalTerraformPlanProjection } from './runner';

export interface OriginalGcpInventoryScope {
  readonly schemaVersion: 1;
  readonly kind: 'original-gcp-inventory-scope';
}
export type GcpCloudInventoryTarget =
  | GcpInventoryResourceTarget
  | Readonly<{ kind: 'instance'; name: string; zone: string }>;
export interface OriginalCloudInventoryBinding {
  readonly address: string;
  readonly type: string;
  readonly selfLink: string;
  readonly target: GcpCloudInventoryTarget;
  readonly role: 'ce' | 'observer' | 'networking';
  readonly siteName?: string;
  readonly nodeName?: string;
}
export interface OriginalPlatformInventoryBinding {
  readonly address: string;
  readonly type: 'xcsh_securemesh_site_v2' | 'xcsh_token';
  readonly target: Readonly<{ type_name: 'xcsh_securemesh_site_v2' | 'xcsh_token'; namespace: 'system'; name: string }>;
  readonly siteName: string;
}
interface ScopeView {
  readonly planSha256: string;
  readonly intentFingerprint: string;
  readonly cloud: readonly OriginalCloudInventoryBinding[];
  readonly platform: readonly OriginalPlatformInventoryBinding[];
  readonly resources: readonly Readonly<{ address: string; type: string }>[];
  readonly executionAuthorized: false;
}
const issued = new WeakMap<
  object,
  {
    context: InstalledCaptureContext;
    view: ScopeView;
    assert(): Promise<void>;
    assertInputs(): Promise<void>;
    close(): void;
  }
>();
const pending = new WeakMap<object, Promise<OriginalGcpInventoryScope>>();
const refuse = () => new Error('Original owning GCP inventory scope required');
function record(packet: unknown) {
  const value = packet && typeof packet === 'object' ? issued.get(packet) : undefined;
  if (!value) throw refuse();
  return value;
}
function field(row: OriginalTerraformPlanProjection['resources'][number], name: string): string {
  const value = row.fields[name];
  if (value?.status !== 'known' || typeof value.value !== 'string' || !value.value)
    throw new Error('Known original inventory identity required');
  return value.value;
}
function cloudBindings(intent: GcpCeIntent): readonly OriginalCloudInventoryBinding[] {
  const observer = intent.schemaVersion === 2 ? gcpTerraformObserverIdentity(intent) : undefined;
  const prefix = `https://www.googleapis.com/compute/v1/projects/${intent.project}/`;
  return Object.freeze(
    publicTerraformCloudScope(intent).map((resource) => {
      if (!resource.selfLink.startsWith(prefix)) throw refuse();
      const components = resource.selfLink.slice(prefix.length).split('/');
      const name = components.at(-1);
      if (!name) throw refuse();
      let target: GcpCloudInventoryTarget;
      if (
        (resource.kind === 'instance' || resource.kind === 'disk') &&
        components.length === 4 &&
        components[0] === 'zones' &&
        components[2] === `${resource.kind}s`
      )
        target = Object.freeze({ kind: resource.kind, name, zone: components[1] });
      else if (
        resource.kind === 'subnetwork' &&
        components.length === 4 &&
        components[0] === 'regions' &&
        components[2] === 'subnetworks'
      )
        target = Object.freeze({ kind: 'subnetwork', name, region: components[1] });
      else if (
        (resource.kind === 'network' || resource.kind === 'firewall') &&
        components.length === 3 &&
        components[0] === 'global' &&
        components[1] === `${resource.kind}s`
      )
        target = Object.freeze({ kind: resource.kind, name });
      else throw new Error('Original inventory resource mapping unavailable');
      if (
        target.kind !== 'instance' &&
        compileGcpInventoryResourceTarget(intent.project, target).selfLink !== resource.selfLink
      )
        throw refuse();
      const role =
        observer && [observer.name, observer.firewallName].includes(name)
          ? 'observer'
          : resource.nodeName
            ? 'ce'
            : 'networking';
      return Object.freeze({
        address: `google_compute_${resource.kind}.${name.replaceAll('-', '_')}`,
        type: `google_compute_${resource.kind}`,
        selfLink: resource.selfLink,
        target,
        role,
        ...(resource.siteName ? { siteName: resource.siteName } : {}),
        ...(resource.nodeName ? { nodeName: resource.nodeName } : {}),
      });
    }),
  );
}

/** Read-only source scope. Exact original plan and persisted validated intent must
 * agree before any reader can enumerate its resources. No receipt flag, source
 * copy, guessed identity or this projection alone authorizes execution.
 */
export function prepareOriginalGcpInventoryScope(
  context: InstalledCaptureContext,
  store: CeDeploymentStore,
): Promise<OriginalGcpInventoryScope> {
  const existing = pending.get(context);
  if (existing)
    return existing.then(async (packet) => {
      await store.verify();
      if (
        context.inputs['workspace:gcp-terraform-input-identity.json']?.path !==
          join(store.directory, 'gcp-terraform-input-identity.json') ||
        (['provider', 'engine', 'account', 'region', 'deploymentId'] as const).some(
          (key) => store.owner[key] !== context.owner[key],
        )
      )
        throw new Error('Original inventory storage scope differs');
      await assertOriginalGcpInventoryScope(packet);
      return packet;
    });
  const preparation = (async () => {
    if (context.owner.provider !== 'gcp' || context.owner.engine !== 'terraform' || !context.readOriginalPlanSource)
      throw refuse();
    await context.assertWithinDeadline();
    await context.assertInputs();
    await store.verify();
    const originalDirectory = store.directory;
    const expectedInput = context.inputs['workspace:gcp-terraform-input-identity.json'];
    const path = join(originalDirectory, 'gcp-terraform-input-identity.json');
    if (!expectedInput || expectedInput.path !== path) throw refuse();
    const input = await readOwnedInstalledInput(path, 65536);
    assertSameOriginalInput(expectedInput, input.binding);
    const saved = decodeEvidenceObject(input.bytes) as unknown as {
      intent: GcpCeIntent;
      intentFingerprint: string;
      platformContext: string;
    };
    const intent = structuredClone(saved.intent);
    validateIntent(intent);
    if (
      saved.intentFingerprint !== fingerprint(intent) ||
      saved.platformContext !== intent.platformContext ||
      intent.engine !== 'terraform' ||
      intent.operation !== 'deploy' ||
      intent.project !== context.owner.account ||
      intent.region !== context.owner.region ||
      intent.deploymentName !== context.owner.deploymentId
    )
      throw new Error('Original inventory deployment intent differs');
    const readPlan = context.readOriginalPlanSource;
    const source = await readPlan();
    await assertOriginalTerraformPlanProjection(source);
    if (
      source.directory !== context.executionDirectory ||
      source.scope.cloud !== 'gcp' ||
      source.scope.account !== intent.project ||
      source.scope.region !== intent.region ||
      source.receipt.engine !== 'terraform' ||
      source.receipt.deploymentId !== intent.deploymentName ||
      source.receipt.operation ||
      source.executionAuthorized !== false
    )
      throw refuse();
    if (
      source.receipt.configurationSha256 !== context.inputs['workspace:main.tf.json']?.sha256 ||
      source.receipt.providerLockSha256 !== context.inputs['workspace:.terraform.lock.hcl']?.sha256
    )
      throw refuse();
    const cloud = cloudBindings(intent);
    const platform = Object.freeze(
      publicTerraformPlatformScope(intent).map((entry): OriginalPlatformInventoryBinding => {
        const tokenName = 'tokenName' in entry ? entry.tokenName : undefined;
        const type = tokenName ? 'xcsh_token' : 'xcsh_securemesh_site_v2';
        return Object.freeze({
          address: entry.address,
          type,
          target: Object.freeze({ type_name: type, namespace: 'system', name: tokenName ?? entry.siteName }),
          siteName: entry.siteName,
        });
      }),
    );
    const expected = new Map([...cloud, ...platform].map((entry) => [entry.address, entry]));
    if (expected.size !== cloud.length + platform.length) throw refuse();
    for (const row of source.resources.filter((entry) => entry.mode === 'managed')) {
      const binding = expected.get(row.address);
      if (!binding || binding.type !== row.type || row.actions.length !== 1 || row.actions[0] !== 'create')
        throw new Error('Original inventory plan coverage or creation action differs');
      if (field(row, 'name') !== binding.target.name) throw new Error('Original inventory planned name differs');
      if ('selfLink' in binding) {
        if (
          field(row, 'project') !== intent.project ||
          ('zone' in binding.target && field(row, 'zone') !== binding.target.zone) ||
          ('region' in binding.target && field(row, 'region') !== binding.target.region)
        )
          throw new Error('Original inventory planned cloud scope differs');
      } else if (field(row, 'namespace') !== 'system') throw new Error('Original inventory Platform namespace differs');
      expected.delete(row.address);
    }
    if (expected.size) throw new Error('Original inventory plan resource coverage incomplete');
    const resources = Object.freeze(
      [...cloud, ...platform].map((entry) => Object.freeze({ address: entry.address, type: entry.type })),
    );
    const monitor = await monitorOriginalInputs({ intent: input.binding });
    let retired = false;
    const assertInputs = async () => {
      if (retired) throw refuse();
      try {
        await context.assertInputs();
        await store.verify();
        if (
          store.directory !== originalDirectory ||
          (['provider', 'engine', 'account', 'region', 'deploymentId'] as const).some(
            (key) => store.owner[key] !== context.owner[key],
          )
        )
          throw refuse();
        await monitor.assertOriginal();
        assertSameOriginalInput(input.binding, (await readOwnedInstalledInput(path, 65536)).binding);
        await assertOriginalTerraformPlanProjection(source);
        await monitor.assertOriginal();
      } catch (error) {
        retired = true;
        throw error;
      }
    };
    const assert = async () => {
      await context.assertWithinDeadline();
      await assertInputs();
      if ((await readPlan()) !== source) throw refuse();
      await context.assertWithinDeadline();
    };
    const packet = Object.freeze({ schemaVersion: 1 as const, kind: 'original-gcp-inventory-scope' as const });
    issued.set(packet, {
      context,
      view: Object.freeze({
        planSha256: source.receipt.planSha256,
        intentFingerprint: saved.intentFingerprint,
        cloud,
        platform,
        resources,
        executionAuthorized: false as const,
      }),
      assert,
      assertInputs,
      close: () => {
        retired = true;
        monitor.close();
      },
    });
    await assert();
    return packet;
  })();
  pending.set(context, preparation);
  return preparation;
}
export async function assertOriginalGcpInventoryScope(packet: unknown): Promise<void> {
  await record(packet).assert();
}
export async function inspectOriginalGcpInventoryScope(packet: unknown): Promise<ScopeView> {
  await assertOriginalGcpInventoryInputs(packet);
  return record(packet).view;
}
export function assertOriginalGcpInventoryContext(packet: unknown, context: InstalledCaptureContext): void {
  if (record(packet).context !== context) throw refuse();
}
export function closeOriginalGcpInventoryScope(packet: unknown): void {
  record(packet).close();
}

/** Read-only final-capture verification; no operation deadline or authority is renewed. */
export async function assertOriginalGcpInventoryInputs(packet: unknown): Promise<void> {
  await record(packet).assertInputs();
}
