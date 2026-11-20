import type { CeDeploymentStore } from './deployment-store';
import { decodeEvidenceObject } from './evidence-json';
import { createGcpLifecycleHttpPort, type GcpLifecycleFetcher } from './gcp-http';
import {
  assertOriginalGcpPlatformHttpBody,
  type OriginalGcpPlatformHttpBody,
  openGcpLifecycleHttpCapture,
} from './gcp-http-capture';
import type { CeOwner } from './runtime';
import { containsControlCharacters } from './security';

export interface OriginalGcpBootstrapObservationTarget {
  readonly type_name: 'xcsh_securemesh_site_v2' | 'xcsh_token';
  readonly namespace: 'system';
  readonly name: string;
}
export interface OriginalGcpBootstrapObservationInput {
  readonly store: CeDeploymentStore;
  readonly origin: string;
  readonly credential: string;
  readonly targets: readonly OriginalGcpBootstrapObservationTarget[];
  assertOriginal(): Promise<void>;
}
export interface OriginalGcpBootstrapObservationOptions {
  /** Explicit offline transport fixture only. Installed service uses ordinary fetch. */
  readonly fetcher?: GcpLifecycleFetcher;
}
export interface OriginalGcpPlatformPresence {
  readonly schemaVersion: 1;
  readonly kind: 'original-gcp-platform-presence';
  readonly target: OriginalGcpBootstrapObservationTarget;
  readonly present: boolean;
  readonly body: OriginalGcpPlatformHttpBody;
  readonly creationOwnershipQualified: false;
}
const targetKey = (target: OriginalGcpBootstrapObservationTarget) =>
  JSON.stringify([target.type_name, target.namespace, target.name]);
const validTarget = (target: OriginalGcpBootstrapObservationTarget) =>
  target &&
  Object.keys(target).sort().join(',') === 'name,namespace,type_name' &&
  ['xcsh_securemesh_site_v2', 'xcsh_token'].includes(target.type_name) &&
  target.namespace === 'system' &&
  typeof target.name === 'string' &&
  /^[a-z][a-z0-9-]{0,62}$/.test(target.name);

/** GET-only original observation in the issuing Platform module. This keeps body
 * provenance across installed plugin boundaries without transferring credentials
 * or treating a captured body as bootstrap authorization.
 */
export async function openOriginalGcpBootstrapObservation(
  input: OriginalGcpBootstrapObservationInput,
  options: OriginalGcpBootstrapObservationOptions = {},
) {
  const store = input.store,
    owner = Object.freeze(structuredClone(store.owner)),
    directory = store.directory,
    origin = input.origin,
    credential = input.credential,
    assertInputs = input.assertOriginal;
  const targets = Object.freeze(input.targets.map((target) => Object.freeze({ ...target })));
  if (
    owner.provider !== 'gcp' ||
    !['native', 'terraform'].includes(owner.engine) ||
    !targets.length ||
    targets.length > 128 ||
    targets.some((target) => !validTarget(target)) ||
    new Set(targets.map(targetKey)).size !== targets.length ||
    typeof assertInputs !== 'function' ||
    typeof credential !== 'string' ||
    !credential ||
    containsControlCharacters(credential)
  )
    throw new Error('Original bootstrap observation scope required');
  const parsed = new URL(origin);
  if (parsed.protocol !== 'https:' || parsed.origin !== origin)
    throw new Error('Original bootstrap observation origin required');
  const declared = new Set(targets.map(targetKey));
  let retired = false;
  let closing: Promise<void> | undefined;
  const retirement = new AbortController();
  const pendingReads = new Set<Promise<unknown>>();
  const presences = new WeakSet<OriginalGcpPlatformPresence>();
  const guard = async () => {
    if (retired) throw new Error('Original bootstrap observation retired');
    await assertInputs();
    await store.verify();
    if (
      directory !== store.directory ||
      (['provider', 'engine', 'account', 'region', 'deploymentId'] as const).some(
        (key) => owner[key] !== store.owner[key],
      )
    )
      throw new Error('Original bootstrap observation storage scope changed');
    if (retired) throw new Error('Original bootstrap observation retired');
    await assertInputs();
  };
  await guard();
  const capture = await openGcpLifecycleHttpCapture(store, guard, {
    siteNames: targets.filter((target) => target.type_name === 'xcsh_securemesh_site_v2').map((target) => target.name),
    tokenNames: targets.filter((target) => target.type_name === 'xcsh_token').map((target) => target.name),
  });
  const port = createGcpLifecycleHttpPort(origin, credential, options.fetcher ?? fetch, capture);
  const run = async <T>(operation: () => Promise<T>): Promise<T> => {
    if (retired) throw new Error('Original bootstrap observation retired');
    const pending = Promise.resolve().then(operation);
    pendingReads.add(pending);
    try {
      const value = await pending;
      if (retired) throw new Error('Original bootstrap observation retired');
      return value;
    } catch (error) {
      retired = true;
      throw error;
    } finally {
      pendingReads.delete(pending);
    }
  };
  const readBody = async (inputTarget: OriginalGcpBootstrapObservationTarget, signal?: AbortSignal) => {
    const target = Object.freeze({ ...inputTarget });
    await guard();
    if (!validTarget(target) || !declared.has(targetKey(target)))
      throw new Error('Original bootstrap target escaped scope');
    const family =
      target.type_name === 'xcsh_token'
        ? 'register/namespaces/system/tokens'
        : 'config/namespaces/system/securemesh_site_v2s';
    const combined = signal ? AbortSignal.any([signal, retirement.signal]) : retirement.signal;
    const body = await port.readCaptured(`/api/${family}/${target.name}`, combined);
    await guard();
    if (
      !body.evidence.accepted ||
      !body.evidence.responseComplete ||
      body.evidence.truncated ||
      ![200, 404].includes(body.evidence.status ?? 0)
    )
      throw new Error('Original complete Platform presence response required');
    return { target, body };
  };
  return Object.freeze({
    async assertOriginal() {
      try {
        await guard();
      } catch (error) {
        retired = true;
        throw error;
      }
    },
    async read(target: OriginalGcpBootstrapObservationTarget, signal?: AbortSignal) {
      return run(async () => {
        const result = await readBody(target, signal);
        return result.body.evidence.status === 404 ? undefined : result.body;
      });
    },
    async readPresence(
      target: OriginalGcpBootstrapObservationTarget,
      signal?: AbortSignal,
    ): Promise<OriginalGcpPlatformPresence> {
      return run(async () => {
        const result = await readBody(target, signal);
        const present = result.body.evidence.status === 200;
        if (present) {
          const value = decodeEvidenceObject(result.body.bytes),
            metadata = value.metadata;
          if (
            !metadata ||
            typeof metadata !== 'object' ||
            Array.isArray(metadata) ||
            (metadata as Record<string, unknown>).name !== result.target.name ||
            (metadata as Record<string, unknown>).namespace !== result.target.namespace
          )
            throw new Error('Original Platform presence metadata differs');
        }
        const value: OriginalGcpPlatformPresence = Object.freeze({
          schemaVersion: 1,
          kind: 'original-gcp-platform-presence',
          target: result.target,
          present,
          body: result.body,
          creationOwnershipQualified: false,
        });
        presences.add(value);
        return value;
      });
    },
    async assertPresence(value: OriginalGcpPlatformPresence) {
      if (!presences.has(value)) throw new Error('Original Platform presence reference required');
      return run(async () => {
        await guard();
        await assertOriginalGcpPlatformHttpBody(value.body);
        await guard();
      });
    },
    close() {
      if (closing) return closing;
      retired = true;
      retirement.abort(new Error('Original bootstrap observation retired'));
      closing = (async () => {
        while (pendingReads.size) await Promise.allSettled([...pendingReads]);
      })();
      return closing;
    },
  });
}
export type OriginalGcpBootstrapObservation = Awaited<ReturnType<typeof openOriginalGcpBootstrapObservation>>;
export interface GcpBootstrapObservationSourceBinding {
  readonly origin: string;
  readonly credentialSha256: string;
  readonly targets: readonly OriginalGcpBootstrapObservationTarget[];
  assertOriginal(): Promise<void>;
}
export type GcpBootstrapObservationOpener = (
  owner: CeOwner,
  contextName: string,
  binding: GcpBootstrapObservationSourceBinding,
) => Promise<OriginalGcpBootstrapObservation>;
