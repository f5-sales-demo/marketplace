import { fingerprint } from '../../../gcloud/src/ce/discovery';
import type { OperationalBinding, OperationalProfile } from '../../../gcloud/src/ce/operational-health';
import { createGcpOperationalCommandPort, type OperationalCommandCapture } from './gcp-operational-command';
import { projectGcpOperationalDiagnosis } from './gcp-operational-diagnosis';
import { collectGcpOperationalHealth, type GcpOperationalObservationPort } from './gcp-operational-observation';
import { collectGcpOperationalRuntime } from './gcp-operational-runtime';
import { projectGcpOperationalSiteStatus } from './gcp-operational-site-status';

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Operational source malformed');
  return value as Record<string, unknown>;
};
export interface GcpOperationalSourceIdentity {
  nodeName: string;
  instanceId: string;
  zone: string;
  sloAddress: string;
  devices: [string, string];
  addresses: [string, string];
}
export interface GcpOperationalSourcePort {
  /** Verify persisted context, original ownership, live numeric VMs, tokens, registrations and both NIC joins. */
  binding(signal?: AbortSignal): Promise<OperationalBinding>;
  capture(entry: OperationalCommandCapture): Promise<void>;
  captureProjection: GcpOperationalObservationPort['capture'];
}
/** Scoped candidate source. Paths and commands are internal; caller input cannot select arbitrary requests. */
export function createGcpOperationalSource(
  expected: OperationalBinding,
  identities: GcpOperationalSourceIdentity[],
  profile: OperationalProfile,
  pinnedFingerprint: string,
  apiUrl: string,
  credential: string,
  port: GcpOperationalSourcePort,
  fetcher: typeof fetch = fetch,
) {
  expected = structuredClone(expected);
  identities = structuredClone(identities);
  profile = structuredClone(profile);
  if (
    identities.length !== 3 ||
    expected.nodes.some(
      (node) =>
        identities.filter((identity) => identity.nodeName === node.nodeName && identity.instanceId === node.instanceId)
          .length !== 1,
    )
  )
    throw new Error('Original operational source identities required');
  const commands = createGcpOperationalCommandPort(expected, apiUrl, credential, port.binding, port.capture, fetcher);
  const base = new URL(apiUrl);
  const verify = async (signal: AbortSignal) => {
    if (fingerprint(await port.binding(signal)) !== fingerprint(expected))
      throw new Error('Operational source ownership changed');
  };
  const request = async (
    kind: 'registration' | 'siteStatus' | 'components' | 'inventory',
    nodeName: string,
    signal: AbortSignal,
  ) => {
    const site = expected.siteName;
    const path = {
      registration: `/api/register/namespaces/system/registrations_by_site/${site}`,
      siteStatus: `/api/config/namespaces/system/sites/${site}`,
      components: `/api/operate/namespaces/system/sites/${site}/vpm/debug/global/ves-system/status?cached=false`,
      inventory: `/api/operate/namespaces/system/sites/${site}/vpm/debug/global/list-service`,
    }[kind];
    const capture: OperationalCommandCapture = {
      nodeName,
      command: ['GET', path],
      startedAt: new Date().toISOString(),
      finishedAt: '',
      body: '',
      truncated: false,
    };
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      await verify(signal);
      const response = await fetcher(new URL(path, base), {
        method: 'GET',
        redirect: 'error',
        signal,
        headers: { Accept: 'application/json', Authorization: `APIToken ${credential}` },
      });
      capture.httpStatus = response.status;
      if (!response.body) throw new Error('Operational source body unavailable');
      const reader = response.body.getReader();
      try {
        for (;;) {
          signal.throwIfAborted();
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value.subarray(0, 4 * 1024 * 1024 - size));
          size += value.byteLength;
          if (size > 4 * 1024 * 1024) {
            capture.truncated = true;
            capture.errorCode = 'malformed';
            throw new Error('Operational source body exceeds bound');
          }
        }
      } finally {
        await reader.cancel();
        reader.releaseLock();
      }
      if (!response.ok) {
        capture.errorCode = 'http';
        throw new Error('Operational source unavailable');
      }
      capture.errorCode = 'malformed';
      const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
      object(value);
      await verify(signal);
      signal.throwIfAborted();
      delete capture.errorCode;
      return value;
    } catch (error) {
      capture.errorCode ??= 'transport';
      throw error;
    } finally {
      capture.body = Buffer.concat(chunks).toString('utf8');
      capture.finishedAt = new Date().toISOString();
      await port.capture(capture);
    }
  };
  const observation: GcpOperationalObservationPort = {
    binding: port.binding,
    capture: port.captureProjection,
    async observe(node, check, signal) {
      const identity = identities.find((row) => row.nodeName === node.nodeName)!;
      if (check === 'interfaces') {
        await verify(signal);
        return node.nics;
      }
      if (check === 'runtime')
        return collectGcpOperationalRuntime(
          commands,
          node,
          expected.ownershipFingerprint,
          profile,
          pinnedFingerprint,
          signal,
        );
      if (check === 'diagnostics') {
        const output = await commands.execute(node, { kind: 'diagnosis' }, signal);
        return projectGcpOperationalDiagnosis(JSON.parse(output), identity, identities);
      }
      if (check === 'siteStatus')
        return projectGcpOperationalSiteStatus(await request('siteStatus', node.nodeName, signal), {
          siteName: expected.siteName,
          runtimeIdentitySha256: expected.runtimeIdentitySha256,
          nodeName: node.nodeName,
          role: node.role,
          devices: identity.devices,
          addresses: identity.addresses,
        });
      if (check === 'registration') {
        const response = object(await request('registration', node.nodeName, signal));
        if (
          !Array.isArray(response.items) ||
          response.next_page_token ||
          response.continue ||
          (response.errors !== undefined && (!Array.isArray(response.errors) || response.errors.length))
        )
          throw new Error('Operational registrations incomplete');
        const rows = response.items
          .map(object)
          .filter((row) => object(object(row.get_spec).infra).hostname === node.nodeName);
        if (rows.length !== 1) throw new Error('Operational registration ambiguous');
        const row = rows[0];
        const spec = object(row.get_spec),
          infra = object(spec.infra);
        if (
          infra.provider !== 'GOOGLE' ||
          String(infra.instance_id) !== node.instanceId ||
          infra.availability_zone !== identity.zone ||
          object(spec.passport).cluster_name !== expected.siteName ||
          typeof row.uid !== 'string'
        )
          throw new Error('Operational registration join differs');
        return {
          identitySha256: fingerprint({ uid: row.uid }),
          state: object(object(row.object).status).current_state,
        };
      }
      const kind = check === 'components' ? 'components' : 'inventory';
      const response = object(await request(kind, node.nodeName, signal));
      const rows = response[kind === 'components' ? 'status' : 'service'];
      if (!Array.isArray(rows)) throw new Error('Operational service coverage unavailable');
      const originals = new Set(expected.nodes.map((n) => n.nodeName));
      const parsed = rows.map(object);
      if (parsed.some((row) => !originals.has(String(row.node)))) throw new Error('Operational service node foreign');
      return parsed
        .filter((row) => row.node === node.nodeName)
        .map((row) =>
          kind === 'components' ? { name: row.name, state: row.status } : { service: row.value, reference: row.name },
        );
    },
  };
  return {
    collect: (signal?: AbortSignal) =>
      collectGcpOperationalHealth(observation, expected, profile, pinnedFingerprint, signal),
  };
}
