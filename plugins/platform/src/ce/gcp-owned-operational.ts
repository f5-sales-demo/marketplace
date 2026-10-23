import { createHash, randomUUID } from 'node:crypto';
import { fingerprint } from '../../../gcloud/src/ce/discovery';
import {
  correlateGcpPhysicalInterfaces,
  type GcpExpectedNodeIdentity,
} from '../../../gcloud/src/ce/interface-identity';
import {
  type OperationalBinding,
  type OperationalProfile,
  qualifiedOperationalProfile,
} from '../../../gcloud/src/ce/operational-health';
import { readGcpResourceInventory } from '../../../gcloud/src/ce/ownership';
import {
  type PublicTerraformOwnership,
  publicTerraformAddresses,
} from '../../../gcloud/src/ce/terraform-public-ownership';
import type { GcpCeIntent } from '../../../gcloud/src/ce/types';
import type { CeDeploymentStore } from './deployment-store';
import { verifyGcpOperationalBinding } from './gcp-operational-binding';
import { createGcpOperationalCommandPort, type OperationalCommandCapture } from './gcp-operational-command';
import { resolveGcpOperationalPlacement } from './gcp-operational-placement';
import { createGcpOperationalSource, type GcpOperationalSourceIdentity } from './gcp-operational-source';
import { parseGcpRuntimeListing } from './gcp-runtime-diagnostics';
import { acquireProcessLock } from './process-lock';

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Operational ownership malformed');
  return value as Record<string, unknown>;
};
const uid = (value: unknown) => {
  const identity = object(object(value).system_metadata).uid;
  if (typeof identity !== 'string' || !identity) throw new Error('Original operational identity unavailable');
  return identity;
};
const identityHash = (value: unknown) => `sha256:${createHash('sha256').update(uid(value)).digest('hex')}`;
export type GcpOperationalCloudReader = (nodeName: string, signal?: AbortSignal) => Promise<unknown>;
interface SavedOperationalBinding {
  contractFingerprint: string;
  binding: OperationalBinding;
  identities: GcpOperationalSourceIdentity[];
}

/** All inputs come from persisted ownership and the verified release; no user-selected diagnostic input. */
export async function collectGcpOwnedOperationalHealth(
  store: CeDeploymentStore,
  intent: GcpCeIntent,
  siteName: string,
  profile: OperationalProfile,
  contractFingerprint: string,
  apiUrl: string,
  credential: string,
  cloud: GcpOperationalCloudReader,
  currentContext: () => Promise<{ url: string; credential: string }>,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
) {
  intent = structuredClone(intent);
  profile = structuredClone(profile);
  if (
    !qualifiedOperationalProfile(profile, contractFingerprint) ||
    intent.engine !== 'terraform' ||
    intent.sites.length !== 1 ||
    intent.sites[0].name !== siteName ||
    intent.sites[0].nodes.length !== 3
  )
    throw new Error('Qualified original three-node operational scope required');
  const release = await acquireProcessLock(`${store.directory}/.gcp-operational-lock`);
  try {
    const owned = (await store.read('gcp-tf-public-ownership.json')) as PublicTerraformOwnership;
    if (
      owned.schemaVersion !== 2 ||
      !owned.complete ||
      owned.intentFingerprint !== fingerprint(intent) ||
      fingerprint([...owned.addresses].sort()) !== fingerprint(publicTerraformAddresses(intent).sort())
    )
      throw new Error('Complete original operational ownership required');
    const contextFingerprint = fingerprint({
      intentFingerprint: fingerprint(intent),
      context: intent.platformContext,
      apiUrl,
    });
    const ownershipFingerprint = fingerprint(owned);
    const persisted = async (readSignal?: AbortSignal) => {
      readSignal?.throwIfAborted();
      await store.verify();
      const saved = object(await store.read('gcp-terraform-input-identity.json'));
      const context = await currentContext();
      if (
        fingerprint(saved.intent) !== fingerprint(intent) ||
        saved.intentFingerprint !== fingerprint(intent) ||
        saved.platformContext !== intent.platformContext ||
        context.url !== apiUrl ||
        context.credential !== credential ||
        fingerprint(await store.read('gcp-tf-public-ownership.json')) !== ownershipFingerprint
      )
        throw new Error('Persisted operational context or ownership changed');
      const inventory = await readGcpResourceInventory(store, intent);
      const sorted = (rows: typeof inventory) => [...rows].sort((a, b) => a.selfLink.localeCompare(b.selfLink));
      if (fingerprint(sorted(inventory)) !== fingerprint(sorted(owned.resources)))
        throw new Error('Original operational resource inventory differs');
      readSignal?.throwIfAborted();
      return { contextFingerprint, ownershipFingerprint };
    };
    await persisted(signal);
    const identities: GcpExpectedNodeIdentity[] = intent.sites[0].nodes.map((node) => {
      const matches = owned.resources.filter(
        (r) => r.kind === 'instance' && r.nodeName === node.name && r.siteName === siteName,
      );
      if (matches.length !== 1) throw new Error('Original numeric VM identity ambiguous');
      return {
        project: intent.project,
        zone: node.zone,
        instanceId: matches[0].id,
        nodeName: node.name,
        siteName,
        nics: node.interfaces.map((nic) => {
          if (nic.role === 'management') throw new Error('Operational management NIC unavailable');
          return {
            index: nic.index,
            role: nic.role,
            vrf: nic.vrf,
            network: `https://www.googleapis.com/compute/v1/projects/${intent.project}/global/networks/${nic.network}`,
            subnet: `https://www.googleapis.com/compute/v1/projects/${intent.project}/regions/${intent.region}/subnetworks/${nic.subnet}`,
          };
        }),
      };
    });
    const capture = (entry: OperationalCommandCapture) => store.write(`operational-http-${randomUUID()}.json`, entry);
    // Initial binding uses the same fixed, bounded private capture rules as routine observations.
    const read = async (
      kind: 'configuration' | 'runtime' | 'registrations' | 'components' | 'token',
      nodeName?: string,
      readSignal?: AbortSignal,
    ) => {
      if (kind === 'token' && !identities.some((node) => node.nodeName === nodeName))
        throw new Error('Original operational token node required');
      const path = {
        configuration: `/api/config/namespaces/system/securemesh_site_v2s/${siteName}`,
        runtime: `/api/config/namespaces/system/sites/${siteName}`,
        registrations: `/api/register/namespaces/system/registrations_by_site/${siteName}`,
        components: `/api/operate/namespaces/system/sites/${siteName}/vpm/debug/global/ves-system/status?cached=false`,
        token: `/api/register/namespaces/system/tokens/${nodeName}-token`,
      }[kind];
      const bounded = readSignal
        ? AbortSignal.any([readSignal, AbortSignal.timeout(60_000)])
        : AbortSignal.timeout(60_000);
      const entry: OperationalCommandCapture = {
        nodeName: nodeName ?? siteName,
        command: ['GET', path],
        startedAt: new Date().toISOString(),
        finishedAt: '',
        body: '',
        truncated: false,
      };
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        await persisted(bounded);
        const response = await fetcher(new URL(path, apiUrl), {
          method: 'GET',
          redirect: 'error',
          signal: bounded,
          headers: { Accept: 'application/json', Authorization: `APIToken ${credential}` },
        });
        entry.httpStatus = response.status;
        if (!response.body) throw new Error('Operational initial response unavailable');
        const reader = response.body.getReader();
        try {
          for (;;) {
            bounded.throwIfAborted();
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value.subarray(0, 4 * 1024 * 1024 - size));
            size += value.byteLength;
            if (size > 4 * 1024 * 1024) {
              entry.truncated = true;
              entry.errorCode = 'malformed';
              throw new Error('Operational initial capture exceeds bound');
            }
          }
        } finally {
          await reader.cancel();
          reader.releaseLock();
        }
        if (!response.ok) {
          entry.errorCode = 'http';
          throw new Error('Operational initial read unavailable');
        }
        entry.errorCode = 'malformed';
        const value = object(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))));
        await persisted(bounded);
        bounded.throwIfAborted();
        delete entry.errorCode;
        return value;
      } catch (error) {
        entry.errorCode ??= 'transport';
        throw error;
      } finally {
        entry.body = Buffer.concat(chunks).toString('utf8');
        entry.finishedAt = new Date().toISOString();
        await capture(entry);
      }
    };
    const port = {
      persisted,
      configuration: (readSignal?: AbortSignal) => read('configuration', undefined, readSignal),
      runtimeSite: (readSignal?: AbortSignal) => read('runtime', undefined, readSignal),
      registrations: (readSignal?: AbortSignal) => read('registrations', undefined, readSignal),
      cloud: async (nodeName: string, readSignal?: AbortSignal) => {
        if (!identities.some((node) => node.nodeName === nodeName))
          throw new Error('Original operational cloud node required');
        await persisted(readSignal);
        const value = await cloud(nodeName, readSignal);
        await persisted(readSignal);
        return value;
      },
      token: (nodeName: string, readSignal?: AbortSignal) => read('token', nodeName, readSignal),
    };
    let saved: SavedOperationalBinding | undefined;
    try {
      saved = (await store.read('gcp-operational-original-binding.json')) as SavedOperationalBinding;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (saved && saved.contractFingerprint !== contractFingerprint)
      throw new Error('Operational contract drift requires explicit requalification');
    if (!saved) {
      const startedAt = Date.now();
      const configuration = await port.configuration(signal),
        runtime = await port.runtimeSite(signal),
        registrations = await port.registrations(signal);
      if (!Array.isArray(registrations.items) || registrations.items.length !== 3)
        throw new Error('Three original operational registrations required');
      const nodes: OperationalBinding['nodes'] = [],
        sourceIdentities: GcpOperationalSourceIdentity[] = [];
      for (const expected of identities) {
        const rows = registrations.items
          .map(object)
          .filter((row) => object(object(row.get_spec).infra).hostname === expected.nodeName);
        if (rows.length !== 1 || typeof rows[0].uid !== 'string')
          throw new Error('Original operational registration ambiguous');
        const vm = object(await port.cloud(expected.nodeName, signal));
        const joins = correlateGcpPhysicalInterfaces(expected, vm, rows[0], configuration);
        const tokenHash = identityHash(await port.token(expected.nodeName, signal));
        if (tokenHash !== owned.platform[`xcsh_token.${expected.nodeName.replaceAll('-', '_')}`])
          throw new Error('Original operational token changed');
        if (!Array.isArray(vm.networkInterfaces) || vm.networkInterfaces.length !== 2)
          throw new Error('Original NICs unavailable');
        const nics = vm.networkInterfaces.map(object),
          addresses = nics.map((nic) => nic.networkIP);
        if (!addresses.every((address) => typeof address === 'string'))
          throw new Error('Original NIC addresses unavailable');
        sourceIdentities.push({
          nodeName: expected.nodeName,
          instanceId: expected.instanceId,
          zone: expected.zone,
          sloAddress: addresses[0] as string,
          addresses: addresses as [string, string],
          devices: joins.map((join) => join.device) as [string, string],
        });
        nodes.push({
          nodeName: expected.nodeName,
          instanceId: expected.instanceId,
          registrationIdentitySha256: fingerprint({ uid: rows[0].uid }),
          tokenIdentitySha256: tokenHash,
          role: Object.keys(profile.roles)[0],
          nics: joins.map((join, index) =>
            fingerprint({
              join,
              address: addresses[index],
              network: nics[index].network,
              subnet: nics[index].subnetwork,
            }),
          ) as [string, string],
        });
      }
      const siteHash = identityHash(configuration);
      if (siteHash !== owned.platform[`xcsh_securemesh_site_v2.${siteName.replaceAll('-', '_')}`])
        throw new Error('Original operational configuration changed');
      saved = {
        contractFingerprint,
        identities: sourceIdentities,
        binding: {
          contextFingerprint,
          ownershipFingerprint,
          configurationIdentitySha256: siteHash,
          runtimeIdentitySha256: fingerprint({ uid: uid(runtime) }),
          siteName,
          nodes,
        },
      };
      await verifyGcpOperationalBinding(port, saved.binding, identities, sourceIdentities, signal);
      const provisional = structuredClone(saved.binding);
      const commands = createGcpOperationalCommandPort(
        provisional,
        apiUrl,
        credential,
        async (readSignal) => {
          await persisted(readSignal);
          return provisional;
        },
        capture,
        fetcher,
      );
      const components = await read('components', undefined, signal),
        siteStatus = await port.runtimeSite(signal);
      if (
        !Array.isArray(components.status) ||
        !Array.isArray(siteStatus.status) ||
        fingerprint({ uid: uid(siteStatus) }) !== saved.binding.runtimeIdentitySha256
      )
        throw new Error('Complete original workload placement required');
      const componentRows = components.status.map(object),
        runtimeRows = siteStatus.status
          .map(object)
          .filter((row) => row.node_info != null)
          .map((row) => object(row.node_info));
      if (componentRows.some((row) => !nodes.some((node) => node.nodeName === row.node)))
        throw new Error('Foreign workload placement row');
      if (runtimeRows.some((row) => !nodes.some((node) => node.nodeName === row.hostname)))
        throw new Error('Foreign runtime placement row');
      const observations = [];
      for (const node of provisional.nodes) {
        const rows = runtimeRows.filter((row) => row.hostname === node.nodeName);
        const role = rows.length === 1 ? rows[0].role : undefined;
        if (!Array.isArray(role) || role.length !== 1 || typeof role[0] !== 'string')
          throw new Error('Original runtime role ambiguous');
        observations.push({
          nodeName: node.nodeName,
          runtimeRole: role[0],
          components: componentRows
            .filter((row) => row.node === node.nodeName)
            .map((row) => {
              if (typeof row.name !== 'string' || typeof row.status !== 'string')
                throw new Error('Original component placement malformed');
              return { name: row.name, state: row.status };
            }),
          containers: parseGcpRuntimeListing(await commands.execute(node, { kind: 'list' }, signal)),
        });
      }
      const roles = resolveGcpOperationalPlacement(
        profile,
        contractFingerprint,
        nodes.map((node) => node.nodeName),
        observations,
      );
      for (const node of saved.binding.nodes) node.role = roles[node.nodeName];
      await verifyGcpOperationalBinding(port, saved.binding, identities, sourceIdentities, signal);
      if (Date.now() - startedAt > profile.maximumAgeMs) throw new Error('Initial operational placement stale');
      await store.write(`operational-placement-${randomUUID()}.json`, {
        startedAt,
        finishedAt: Date.now(),
        roles,
        contractFingerprint,
        bindingFingerprint: fingerprint(saved.binding),
      });
      await store.write('gcp-operational-original-binding.json', saved);
    }
    const original = saved;
    const source = createGcpOperationalSource(
      original.binding,
      original.identities,
      profile,
      contractFingerprint,
      apiUrl,
      credential,
      {
        binding: (readSignal) =>
          verifyGcpOperationalBinding(port, original.binding, identities, original.identities, readSignal),
        persistedBinding: async (readSignal) => {
          await persisted(readSignal);
          if (fingerprint(await store.read('gcp-operational-original-binding.json')) !== fingerprint(original))
            throw new Error('Original operational placement binding changed');
          return original.binding;
        },
        capture,
        captureProjection: (entry) => store.write(`operational-projection-${randomUUID()}.json`, entry),
      },
      fetcher,
    );
    return { binding: original.binding, collection: await source.collect(signal) };
  } finally {
    await release();
  }
}
