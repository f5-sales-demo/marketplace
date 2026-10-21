import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { acquireProcessLock } from '../../platform/src/ce/process-lock';
import type { CeOwner } from '../../platform/src/ce/runtime';
import type { CePlatformService } from '../../platform/src/ce/service';
import { cancelUnsubmittedF5Resource } from './f5-cancellation';
import { f5StageDeployment, requireF5StageActive } from './f5-retirement';
import { renderProviderResource } from './resource-renderer';
import type { PlanReceipt } from './runner';
import type { CeTerraformService } from './service';

type Json = Record<string, unknown>;
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Malformed F5 Terraform resource evidence');
  return value as Json;
};
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const kinds: Record<string, string> = {
  securemesh_site_v2s: 'xcsh_securemesh_site_v2',
  bgps: 'xcsh_bgp',
  bgp_routing_policys: 'xcsh_bgp_routing_policy',
  external_connectors: 'xcsh_external_connector',
  http_loadbalancers: 'xcsh_http_loadbalancer',
  origin_pools: 'xcsh_origin_pool',
};
interface Book {
  schemaVersion: 1;
  owner: CeOwner;
  configurationSha256: string;
  resources: Record<string, { type: string; values: Json; path: string; uid?: string }>;
  pending?: {
    requestSha256: string;
    configuration: string;
    address: string;
    method: string;
    submitted: boolean;
    path: string;
    request?: Json;
    planSha256: string;
    receipt?: PlanReceipt;
  };
}

/** One restricted provider-owned state holds F5 views for the deployment throughout their lifecycle. */
export async function executeF5TerraformResource(
  platform: CePlatformService,
  terraform: CeTerraformService,
  owner: CeOwner,
  path: string,
  init: RequestInit,
  contextName?: string,
  signal?: AbortSignal,
  tenantOrigin?: string,
  execution: 'mutate' | 'observe-only' = 'mutate',
) {
  await requireF5StageActive(await platform.storage(owner));
  if (init.method === 'CANCEL_UNSUBMITTED')
    return cancelUnsubmittedF5Resource(platform, terraform, owner, contextName, signal, tenantOrigin);
  if (['RECONCILE', 'RECONCILE_OBSERVED'].includes(init.method ?? '')) {
    const storage = await platform.storage(owner);
    let book: Book;
    try {
      book = (await storage.read('terraform-f5-resources.json')) as Book;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
    if (
      book.schemaVersion !== 1 ||
      owner.engine !== 'terraform' ||
      ['deploymentId', 'engine', 'provider', 'account', 'region'].some(
        (key) => (book.owner as unknown as Json)?.[key] !== (owner as unknown as Json)[key],
      )
    )
      throw new Error('F5 reconciliation state owner differs');
    if (!book.pending) return {};
    const observationOnly = init.method === 'RECONCILE_OBSERVED';
    if (observationOnly && (book.pending.submitted !== true || !book.pending.receipt))
      throw new Error('Observed reconciliation requires a durably submitted saved apply');
    return executeF5TerraformResource(
      platform,
      terraform,
      owner,
      book.pending.path,
      { method: book.pending.method, ...(book.pending.request ? { body: JSON.stringify(book.pending.request) } : {}) },
      contextName,
      signal,
      tenantOrigin,
      observationOnly ? 'observe-only' : execution,
    );
  }
  if (owner.engine !== 'terraform' || !platform.providerEnvironment)
    throw new Error('F5 provider ownership or scoped credentials unavailable');
  const parts = /^\/api\/config\/namespaces\/([a-z][a-z0-9-]{0,62})\/([a-z_0-9]+)(?:\/([a-z][a-z0-9-]{0,62}))?$/.exec(
    path,
  );
  if (!parts || !kinds[parts[2]] || !['POST', 'PUT', 'DELETE'].includes(init.method ?? ''))
    throw new Error('Unsupported F5 Terraform resource operation');
  const method = init.method as string;
  const request = method === 'DELETE' ? undefined : object(JSON.parse(String(init.body)));
  const metadata = request ? object(request.metadata) : undefined;
  const name = parts[3] ?? metadata?.name;
  if (
    typeof name !== 'string' ||
    !/^[a-z][a-z0-9-]{0,62}$/.test(name) ||
    (metadata && (metadata.name !== name || metadata.namespace !== parts[1]))
  )
    throw new Error('F5 resource coordinates differ');
  const labels = {
    'xcsh-ce-deployment': owner.deploymentId,
    'xcsh-ce-engine': 'terraform',
    'xcsh-ce-provider': owner.provider,
    'xcsh-ce-account': owner.account,
    'xcsh-ce-region': owner.region,
  };
  if (metadata && Object.entries(labels).some(([key, value]) => object(metadata.labels)[key] !== value))
    throw new Error('F5 resource labels differ from the owning Terraform deployment');
  const storage = await platform.storage(owner);
  const release = await acquireProcessLock(join(storage.directory, '.f5-resource-lock'));
  try {
    await requireF5StageActive(storage);
    let cancellation: unknown;
    try {
      cancellation = await storage.read('terraform-f5-cancellation-pending.json');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (cancellation !== undefined)
      throw new Error('F5 cancellation is pending; resume cancellation before resource execution');
    const auth = object(await storage.read('terraform-authorization.json'));
    if (
      auth.engine !== 'terraform' ||
      auth.mutations !== true ||
      typeof auth.planSha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(auth.planSha256)
    )
      throw new Error('Original Terraform deployment authorization is unavailable');
    const deployment = await f5StageDeployment(owner);
    const empty = object(JSON.parse(deployment.configuration));
    let book: Book;
    let existed = true;
    try {
      book = (await storage.read('terraform-f5-resources.json')) as Book;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      existed = false;
      book = { schemaVersion: 1, owner: structuredClone(owner), resources: {}, configurationSha256: hash(empty) };
    }
    if (
      book.schemaVersion !== 1 ||
      ['deploymentId', 'engine', 'provider', 'account', 'region'].some(
        (key) => (book.owner as unknown as Json)[key] !== (owner as unknown as Json)[key],
      )
    )
      throw new Error('F5 Terraform state owner differs');
    // Recheck under the owning lock. Observation-only execution must never revise an
    // unsubmitted request or reach provider apply, even if the pre-lock book changed.
    if (execution === 'observe-only' && (book.pending?.submitted !== true || !book.pending.receipt))
      throw new Error('Observed reconciliation lost its submitted saved apply binding');
    const addressName = `view_${hash([parts[2], parts[1], name]).slice(0, 24)}`;
    const type = kinds[parts[2]],
      address = `${type}.${addressName}`,
      itemPath = `/api/config/namespaces/${parts[1]}/${parts[2]}/${name}`;
    if (method !== 'POST' && !book.resources[addressName])
      throw new Error('F5 view is not owned by Terraform state; adoption is prohibited');
    const env = { ...process.env, ...(await platform.providerEnvironment(contextName)) };
    if (!env.XCSH_API_URL || !env.XCSH_API_TOKEN) throw Error('F5 provider credentials unavailable');
    const base = new URL(env.XCSH_API_URL);
    if (base.protocol !== 'https:' || (tenantOrigin !== undefined && base.origin !== tenantOrigin))
      throw new Error('F5 provider tenant must use HTTPS');
    const read = async (): Promise<Json | undefined> => {
      const response = await fetch(new URL(itemPath, base), {
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000),
        redirect: 'error',
        headers: { Authorization: `APIToken ${env.XCSH_API_TOKEN}`, Accept: 'application/json' },
      });
      if (response.status === 404) return undefined;
      if (!response.ok) throw new Error('F5 state ownership observation unavailable');
      const value = object(await response.json()),
        meta = object(value.metadata);
      if (
        meta.name !== name ||
        meta.namespace !== parts[1] ||
        Object.entries(labels).some(([key, v]) => object(meta.labels)[key] !== v)
      )
        throw new Error('F5 resource ownership changed');
      if (typeof object(value.system_metadata).uid !== 'string') throw new Error('F5 resource UID unavailable');
      return value;
    };
    const before = await read();
    if (method === 'POST' && before && !book.resources[addressName] && !book.pending)
      throw new Error('Existing F5 view cannot be adopted');
    if (
      before &&
      book.resources[addressName]?.uid &&
      object(before.system_metadata).uid !== book.resources[addressName].uid
    )
      throw new Error('F5 view was replaced outside its owning state');
    const session = await terraform.open(owner, deployment, existed ? 'current' : false);
    if (!session.readProviderSchemas || !session.readConfigurationSha256 || !session.readResourceIdentities)
      throw new Error('Provider schema verification is unavailable');
    if (!existed) await storage.write('terraform-f5-resources.json', book);
    if (book.pending && !book.pending.submitted && !book.pending.receipt) {
      const priorResources: Record<string, Record<string, Json>> = {};
      for (const [key, view] of Object.entries(book.resources)) {
        priorResources[view.type] ??= {};
        priorResources[view.type][key] = view.values;
      }
      const prior = JSON.stringify({
        ...empty,
        ...(Object.keys(priorResources).length ? { resource: priorResources } : {}),
      });
      const current = await session.readConfigurationSha256();
      if (current !== book.configurationSha256) {
        if (createHash('sha256').update(prior).digest('hex') !== book.configurationSha256)
          throw new Error('Previous F5 configuration integrity failed');
        await session.reviseConfiguration(current, prior);
      }
    }
    const schemas = await session.readProviderSchemas(env, signal);
    const provider = object(schemas['registry.terraform.io/f5-sales-demo/xcsh']);
    const resourceSchema = object(provider.resource_schemas)[type];
    if (!resourceSchema) throw new Error('Published provider does not implement the requested F5 view');
    const next = structuredClone(book.resources);
    if (method === 'DELETE') delete next[addressName];
    else
      next[addressName] = {
        type,
        values: renderProviderResource(object(request), resourceSchema, type),
        path: itemPath,
        uid: book.resources[addressName]?.uid,
      };
    const resource: Record<string, Record<string, Json>> = {};
    for (const [key, view] of Object.entries(next)) {
      resource[view.type] ??= {};
      resource[view.type][key] = view.values;
    }
    const configuration = JSON.stringify({ ...empty, ...(Object.keys(resource).length ? { resource } : {}) });
    // Compare the full writable provider projection; subset matching can retain an unwanted BGP policy.
    const specMatches = (value: Json): boolean =>
      canonical(
        renderProviderResource({ metadata: object(request).metadata, spec: object(value.spec) }, resourceSchema, type),
      ) === canonical(next[addressName].values);
    const requestSha256 = hash({ owner, path, method, request });
    if (book.pending && book.pending.planSha256 !== auth.planSha256)
      throw new Error('Pending F5 operation belongs to another authorization');
    if (book.pending && book.pending.requestSha256 !== requestSha256)
      throw new Error('Another F5 Terraform request needs reconciliation');
    if (book.pending && book.pending.configuration !== configuration) {
      if (book.pending.submitted || book.pending.receipt) throw new Error('Reviewed pending F5 configuration changed');
      await storage.write('terraform-f5-failed-configuration.json', book.pending);
      delete book.pending;
    }
    let reconciled = false;
    if (book.pending?.submitted) {
      const identities = await session.readResourceIdentities(env, signal);
      const identity = identities.filter((row) => row.address === address);
      const stateMatches =
        method === 'DELETE'
          ? identity.length === 0
          : identity.length === 1 &&
            identity[0].type === type &&
            identity[0].name === name &&
            identity[0].namespace === parts[1] &&
            Object.entries(labels).every(([key, v]) => object(identity[0].labels)[key] === v);
      const apiMatches = method === 'DELETE' ? !before : before && specMatches(before);
      if (!stateMatches || !apiMatches || !book.pending.receipt)
        throw new Error('F5 saved apply outcome remains unknown; no mutation was replayed');
      const evidence = { requestSha256, identities, uid: before ? object(before.system_metadata).uid : null };
      await storage.write('terraform-f5-reconciliation.json', evidence);
      await session.reconcileApplyFromEvidence(book.pending.receipt, hash(evidence));
      reconciled = true;
    }
    if (!book.pending) {
      await session.reviseConfiguration(await session.readConfigurationSha256(), configuration);
      book.pending = {
        requestSha256,
        configuration,
        address,
        method,
        submitted: false,
        path,
        request,
        planSha256: String(auth.planSha256),
      };
      await storage.write('terraform-f5-resources.json', book);
    }
    const receipt = book.pending.receipt ?? (await session.plan(env, signal));
    if (
      receipt.changes.some(
        (change) =>
          change.actions.some((action) => action !== 'no-op' && action !== 'read') &&
          (change.address !== address ||
            change.actions.some(
              (action) =>
                ![method === 'DELETE' ? 'delete' : method === 'POST' ? 'create' : 'update', 'no-op', 'read'].includes(
                  action,
                ),
            )),
      )
    )
      throw new Error('F5 Terraform plan changes an unexpected resource or requires replacement');
    await storage.write('terraform-f5-saved-plan.json', receipt);
    book.pending.receipt = receipt;
    await storage.write('terraform-f5-resources.json', book);
    const latest = await read();
    if (
      (before && (!latest || object(latest.system_metadata).uid !== object(before.system_metadata).uid)) ||
      (!before && latest)
    )
      throw new Error('F5 resource changed after saved-plan review');
    if (!reconciled) {
      if (execution === 'observe-only') throw new Error('Observed reconciliation cannot replay provider apply');
      book.pending.submitted = true;
      await storage.write('terraform-f5-resources.json', book);
      await session.apply(receipt, env, signal);
    }
    const after = await read();
    if ((method === 'DELETE' && after) || (method !== 'DELETE' && !after))
      throw new Error('F5 provider readback did not converge');
    if (after && before && object(after.system_metadata).uid !== object(before.system_metadata).uid)
      throw new Error('F5 provider readback identity changed during apply');
    if (after && !specMatches(after)) throw new Error('F5 provider requested spec readback did not converge');
    if (after) next[addressName].uid = String(object(after.system_metadata).uid);
    book.resources = next;
    book.configurationSha256 = await session.readConfigurationSha256();
    delete book.pending;
    await storage.write('terraform-f5-resources.json', book);
    const followup = await session.plan(env, signal);
    if (!followup.noChanges) throw new Error('F5 Terraform state did not converge to a zero-action plan');
    return after ?? {};
  } finally {
    await release();
  }
}
