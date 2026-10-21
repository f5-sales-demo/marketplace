import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { acquireProcessLock } from '../../platform/src/ce/process-lock';
import type { CeOwner } from '../../platform/src/ce/runtime';
import type { CePlatformService } from '../../platform/src/ce/service';
import { loadXcshProviderLock, XCSH_PROVIDER_VERSION } from './provider-lock';
import { renderProviderResource } from './resource-renderer';
import type { PlanReceipt } from './runner';
import type { CeTerraformService } from './service';

type Json = Record<string, unknown>;
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed F5 cancellation evidence');
  return value as Json;
};
const hash = (v: unknown) =>
  createHash('sha256')
    .update(typeof v === 'string' ? v : JSON.stringify(v))
    .digest('hex');
const canonical = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(canonical).join(',')}]`
    : v && typeof v === 'object'
      ? `{${Object.entries(v)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`)
          .join(',')}}`
      : JSON.stringify(v);
const types: Record<string, string> = {
  securemesh_site_v2s: 'xcsh_securemesh_site_v2',
  bgps: 'xcsh_bgp',
  bgp_routing_policys: 'xcsh_bgp_routing_policy',
  external_connectors: 'xcsh_external_connector',
  http_loadbalancers: 'xcsh_http_loadbalancer',
  origin_pools: 'xcsh_origin_pool',
};
/** Restore only a proven prior desired state. All remote API requests are reads; only the owner runner revises private configuration. */
export async function cancelUnsubmittedF5Resource(
  platform: CePlatformService,
  terraform: CeTerraformService,
  owner: CeOwner,
  contextName?: string,
  signal?: AbortSignal,
  tenantOrigin?: string,
): Promise<Record<string, unknown>> {
  if (owner.engine !== 'terraform' || !platform.providerEnvironment)
    throw Error('F5 cancellation requires Terraform ownership and scoped credentials');
  const storage = await platform.storage(owner);
  const release = await acquireProcessLock(join(storage.directory, '.f5-resource-lock'));
  try {
    signal?.throwIfAborted();
    await storage.verify();
    let raw: unknown;
    try {
      raw = await storage.read('terraform-f5-resources.json');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
    const book = object(raw),
      resources = object(book.resources);
    if (book.schemaVersion !== 1 || canonical(book.owner) !== canonical(owner))
      throw Error('F5 cancellation state owner differs');
    const optional = async (name: string) => {
      try {
        return await storage.read(name);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    };
    const markerName = 'terraform-f5-cancellation-pending.json',
      existingMarker = await optional(markerName);
    if (book.pending === undefined) {
      if (existingMarker !== undefined) {
        const marker = object(existingMarker);
        if (
          marker.schemaVersion !== 1 ||
          canonical(marker.owner) !== canonical(owner) ||
          typeof marker.sourceBookSha256 !== 'string' ||
          !/^[a-f0-9]{64}$/.test(marker.sourceBookSha256) ||
          marker.priorConfigurationSha256 !== book.configurationSha256 ||
          marker.priorResourcesSha256 !== hash(canonical(resources))
        )
          throw Error('F5 cancellation completion bookkeeping differs');
        const completed = object(await storage.read(`terraform-f5-cancellation-${marker.sourceBookSha256}.json`));
        if (
          canonical(completed.owner) !== canonical(owner) ||
          completed.sourceBookSha256 !== marker.sourceBookSha256 ||
          completed.requestSha256 !== marker.requestSha256 ||
          completed.evidenceSha256 !== marker.evidenceSha256 ||
          completed.priorConfigurationSha256 !== marker.priorConfigurationSha256
        )
          throw Error('F5 cancellation completion receipt differs');
        await storage.remove(markerName);
      }
      return {};
    }
    const pending = object(book.pending),
      auth = object(await storage.read('terraform-authorization.json'));
    if (
      auth.engine !== 'terraform' ||
      auth.mutations !== true ||
      typeof auth.planSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(auth.planSha256) ||
      pending.planSha256 !== auth.planSha256 ||
      pending.submitted !== false ||
      !['POST', 'PUT'].includes(String(pending.method))
    )
      throw Error('F5 cancellation requires the original unsubmitted create/update authorization');
    if (pending.receipt !== undefined) object(pending.receipt);
    const path = String(pending.path),
      parts = /^\/api\/config\/namespaces\/([a-z][a-z0-9-]{0,62})\/([a-z_0-9]+)(?:\/([a-z][a-z0-9-]{0,62}))?$/.exec(
        path,
      ),
      request = object(pending.request),
      metadata = object(request.metadata);
    if (
      !parts ||
      !types[parts[2]] ||
      typeof metadata.name !== 'string' ||
      !/^[a-z][a-z0-9-]{0,62}$/.test(metadata.name) ||
      metadata.namespace !== parts[1] ||
      (pending.method === 'POST' ? parts[3] !== undefined : parts[3] !== metadata.name) ||
      pending.requestSha256 !== hash({ owner, path, method: pending.method, request })
    )
      throw Error('F5 cancellation request binding differs');
    const labels = {
      'xcsh-ce-deployment': owner.deploymentId,
      'xcsh-ce-engine': 'terraform',
      'xcsh-ce-provider': owner.provider,
      'xcsh-ce-account': owner.account,
      'xcsh-ce-region': owner.region,
    };
    if (Object.entries(labels).some(([k, v]) => object(metadata.labels)[k] !== v))
      throw Error('F5 cancellation request owner labels differ');
    const key = `view_${hash([parts[2], parts[1], metadata.name]).slice(0, 24)}`,
      type = types[parts[2]],
      address = `${type}.${key}`;
    if (
      pending.address !== address ||
      (pending.method === 'PUT' && !resources[key]) ||
      (pending.method === 'POST' && resources[key])
    )
      throw Error('F5 cancellation target ownership differs');
    const empty = {
      terraform: {
        required_version: '= 1.16.5',
        required_providers: { xcsh: { source: 'f5-sales-demo/xcsh', version: `= ${XCSH_PROVIDER_VERSION}` } },
      },
      provider: { xcsh: {} },
    };
    const desired: Record<string, Record<string, Json>> = {};
    for (const [name, value] of Object.entries(resources)) {
      const row = object(value);
      if (
        !/^view_[a-f0-9]{24}$/.test(name) ||
        typeof row.type !== 'string' ||
        typeof row.path !== 'string' ||
        typeof row.uid !== 'string' ||
        !row.uid.trim()
      )
        throw Error('F5 prior resource bookkeeping is incomplete');
      desired[row.type] ??= {};
      desired[row.type][name] = object(row.values);
    }
    const prior = JSON.stringify({ ...empty, ...(Object.keys(desired).length ? { resource: desired } : {}) });
    if (hash(prior) !== book.configurationSha256 || typeof pending.configuration !== 'string')
      throw Error('F5 prior desired configuration integrity differs');
    const session = await terraform.open(
      owner,
      {
        schemaVersion: 1,
        deploymentId: owner.deploymentId,
        stage: 'f5-resources',
        engine: 'terraform',
        scope: { cloud: owner.provider, account: owner.account, region: owner.region },
        terraformVersion: '1.16.5',
        configuration: JSON.stringify(empty),
        providerLock: await loadXcshProviderLock(),
        backendIdentity: `local:${owner.deploymentId}:stage:f5-resources`,
      },
      'current',
    );
    if (
      !session.readProviderSchemas ||
      !session.readResourceIdentities ||
      !session.readConfigurationSha256 ||
      !session.cancelUnsubmittedPlan
    )
      throw Error('F5 owner runner lacks cancellation proof');
    const readResourceIdentities = session.readResourceIdentities.bind(session);
    const env = { ...process.env, ...(await platform.providerEnvironment(contextName)) };
    if (!env.XCSH_API_URL || !env.XCSH_API_TOKEN) throw Error('Scoped F5 cancellation credentials unavailable');
    const origin = new URL(env.XCSH_API_URL);
    if (origin.protocol !== 'https:' || (tenantOrigin !== undefined && origin.origin !== tenantOrigin))
      throw Error('F5 cancellation tenant differs');
    const provider = object(
        (await session.readProviderSchemas(env, signal))['registry.terraform.io/f5-sales-demo/xcsh'],
      ),
      schemas = object(provider.resource_schemas);
    const next = structuredClone(desired);
    next[type] ??= {};
    next[type][key] = renderProviderResource(request, schemas[type], type);
    if (canonical(JSON.parse(pending.configuration)) !== canonical({ ...empty, resource: next }))
      throw Error('F5 pending desired configuration differs from its request');
    const read = async (itemPath: string) => {
      const response = await fetch(new URL(itemPath, origin), {
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000),
        redirect: 'error',
        headers: { Authorization: `APIToken ${env.XCSH_API_TOKEN}`, Accept: 'application/json' },
      });
      if (response.status === 404) return undefined;
      if (!response.ok) throw Error('F5 cancellation API observation unavailable');
      return object(await response.json());
    };
    const prove = async () => {
      const identities = await readResourceIdentities(env, signal);
      if (identities.length !== Object.keys(resources).length) throw Error('F5 prior state coverage differs');
      const evidence = [];
      const seen = new Set<string>(),
        seenUids = new Set<string>();
      for (const [name, value] of Object.entries(resources).sort(([a], [b]) => a.localeCompare(b))) {
        const row = object(value),
          values = object(row.values),
          coordinates =
            /^\/api\/config\/namespaces\/([a-z][a-z0-9-]{0,62})\/([a-z_0-9]+)\/([a-z][a-z0-9-]{0,62})$/.exec(
              String(row.path),
            );
        if (
          !coordinates ||
          types[coordinates[2]] !== row.type ||
          values.name !== coordinates[3] ||
          values.namespace !== coordinates[1] ||
          name !== `view_${hash([coordinates[2], coordinates[1], coordinates[3]]).slice(0, 24)}`
        )
          throw Error('F5 prior state coordinates differ');
        if (seenUids.has(String(row.uid))) throw Error('Duplicate F5 prior API UID');
        seenUids.add(String(row.uid));
        const matches = identities.filter((i) => i.address === `${row.type}.${name}`);
        if (
          matches.length !== 1 ||
          matches[0].type !== row.type ||
          !matches[0].id ||
          seen.has(`${String(row.type)}:${matches[0].id}`) ||
          matches[0].name !== values.name ||
          matches[0].namespace !== values.namespace ||
          Object.entries(labels).some(([k, v]) => object(matches[0].labels)[k] !== v)
        )
          throw Error('F5 prior state identity differs');
        seen.add(`${String(row.type)}:${matches[0].id}`);
        const api = await read(String(row.path));
        if (!api) throw Error('F5 prior API resource is missing');
        const meta = object(api.metadata);
        if (
          meta.name !== values.name ||
          meta.namespace !== values.namespace ||
          object(api.system_metadata).uid !== row.uid ||
          Object.entries(labels).some(([k, v]) => object(meta.labels)[k] !== v) ||
          canonical(
            renderProviderResource(
              { metadata: meta, spec: object(api.spec) },
              schemas[String(row.type)],
              String(row.type),
            ),
          ) !== canonical(values)
        )
          throw Error('F5 prior API identity or desired state differs');
        evidence.push({ address: matches[0].address, id: matches[0].id, uid: row.uid, values });
      }
      if (pending.method === 'POST' && (await read(`/api/config/namespaces/${parts[1]}/${parts[2]}/${metadata.name}`)))
        throw Error('Unsubmitted F5 create already has an API object');
      return hash(
        canonical({
          owner,
          requestSha256: pending.requestSha256,
          priorConfigurationSha256: book.configurationSha256,
          evidence,
        }),
      );
    };
    const sourceBookSha256 = hash(canonical(book)),
      proof = await prove();
    const marker = {
      schemaVersion: 1,
      owner,
      sourceBookSha256,
      requestSha256: pending.requestSha256,
      evidenceSha256: proof,
      priorConfigurationSha256: book.configurationSha256,
      priorResourcesSha256: hash(canonical(resources)),
    };
    if (existingMarker !== undefined && canonical(existingMarker) !== canonical(marker))
      throw Error('F5 cancellation pending source changed');
    if (existingMarker === undefined) await storage.write(markerName, marker);
    await session.cancelUnsubmittedPlan(
      pending.receipt as PlanReceipt | undefined,
      hash(pending.configuration),
      prior,
      proof,
    );
    if ((await session.readConfigurationSha256()) !== book.configurationSha256)
      throw Error('F5 cancelled configuration did not return to prior state');
    const final = await session.plan(env, signal);
    if (
      final.engine !== 'terraform' ||
      final.deploymentId !== owner.deploymentId ||
      final.configurationSha256 !== book.configurationSha256 ||
      final.noChanges !== true ||
      final.changes.some((c) => c.actions.some((a) => !['no-op', 'read'].includes(a)))
    )
      throw Error('F5 cancelled state lacks a bound no-change refresh');
    if (
      proof !== (await prove()) ||
      sourceBookSha256 !== hash(canonical(await storage.read('terraform-f5-resources.json')))
    )
      throw Error('F5 prior ownership changed during cancellation');
    await storage.write(`terraform-f5-cancellation-${sourceBookSha256}.json`, {
      schemaVersion: 1,
      owner,
      sourceBookSha256,
      requestSha256: pending.requestSha256,
      evidenceSha256: proof,
      priorConfigurationSha256: book.configurationSha256,
      finalPlanSha256: final.planSha256,
    });
    delete book.pending;
    await storage.write('terraform-f5-resources.json', book);
    await storage.remove(markerName);
    return {};
  } finally {
    await release();
  }
}
