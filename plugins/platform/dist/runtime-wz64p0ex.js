// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun
import { createCePlatformService } from './runtime-vzfrz4g3.js';

// plugins/platform/src/ce/interface-admission.ts
var name = (v) => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(v);
var mac = (v) =>
  typeof v === 'string' &&
  /^(?:[a-fA-F0-9]{2}:){5}[a-fA-F0-9]{2}$/.test(v) &&
  v !== '00:00:00:00:00:00' &&
  (Number.parseInt(v.slice(0, 2), 16) & 1) === 0
    ? v.toLowerCase()
    : undefined;
function requireCompleteInterfaceEvidence(observation, expected) {
  const fail = () => {
    throw Error('Complete identity-verified interface evidence is required');
  };
  if (
    !observation ||
    !['observed', 'down'].includes(observation.status) ||
    !Array.isArray(observation.interfaces) ||
    !Array.isArray(expected) ||
    expected.length === 0 ||
    observation.interfaces.length !== expected.length
  )
    fail();
  const expectedIds = new Set(),
    physicalMacs = new Set(),
    devices = new Set(),
    objects = new Set();
  for (const wanted of expected) {
    const address = mac(wanted.mac),
      key = `${wanted.node}/${wanted.role}`;
    if (
      !name(wanted.node) ||
      !['slo', 'data', 'sli'].includes(wanted.role) ||
      !address ||
      physicalMacs.has(address) ||
      expectedIds.has(key)
    )
      fail();
    expectedIds.add(key);
    physicalMacs.add(address);
    const matches = observation.interfaces.filter(
      (row) => row && row.node === wanted.node && row.role === wanted.role && mac(row.mac) === address,
    );
    if (matches.length !== 1) fail();
    const row = matches[0],
      deviceKey = `${row.node}/${row.device}`;
    if (
      typeof row.linkUp !== 'boolean' ||
      !name(row.device) ||
      !name(row.interfaceName) ||
      (wanted.device !== undefined && row.device !== wanted.device) ||
      !Number.isInteger(row.mtu) ||
      (row.mtu !== 0 && (row.mtu < 576 || row.mtu > 8000)) ||
      devices.has(deviceKey) ||
      objects.has(row.interfaceName)
    )
      fail();
    devices.add(deviceKey);
    objects.add(row.interfaceName);
  }
  if (observation.status !== (observation.interfaces.every((row) => row.linkUp) ? 'observed' : 'down')) fail();
}
function requireQualifiedUpInterfaceEvidence(observation, expected) {
  const fail = () => {
    throw Error('Qualified current up interface evidence is required before routing mutation');
  };
  if (
    observation?.status !== 'observed' ||
    observation.freshness !== 'verified' ||
    observation.canSatisfyInterfaceMutationGate !== true
  )
    fail();
  try {
    requireCompleteInterfaceEvidence(observation, expected);
  } catch {
    fail();
  }
}

// plugins/platform/src/tools/f5xc-ce-v2-status.ts
function createF5xcCeV2StatusTool(pi, makeService = () => createCePlatformService()) {
  const { Type } = pi.typebox;
  return {
    name: 'f5xc_ce_v2_status',
    label: 'F5 CE v2 Status',
    description:
      'Observe interfaces using the active tenant and trusted deployment/MAC bindings. Published link state and evidence freshness are separate. Fetch time is not a CE heartbeat timestamp.',
    parameters: Type.Object({
      namespace: Type.String(),
      siteName: Type.String(),
      platformContext: Type.Optional(Type.String()),
    }),
    async execute(_id, params, signal, _update, ctx) {
      const reason = 'binding-or-evidence-unavailable';
      try {
        if (params.namespace !== 'system') throw new Error('namespace');
        const service = makeService(ctx);
        const known = await service.siteBinding?.(params.siteName, params.platformContext);
        if (!known?.expectedInterfaces.length) throw new Error('missing binding');
        const runtime = await service.runtime(known.binding.owner.engine, params.platformContext);
        if (runtime.contract.fingerprint !== known.contractFingerprint) throw new Error('stale binding');
        const site = await runtime.observeOwnedSite(known.binding, signal);
        if (site.system_metadata.uid !== known.siteUid) throw new Error('rebuilt site');
        const spec = site.spec;
        const nodes = spec[known.binding.owner.provider].not_managed.node_list;
        if (
          !Array.isArray(nodes) ||
          nodes.length !== known.binding.nodes.length ||
          nodes.some((node) => !known.binding.nodes.includes(node.hostname) || !Array.isArray(node.interface_list)) ||
          nodes.reduce((count, node) => count + node.interface_list.length, 0) !== known.expectedInterfaces.length
        )
          throw new Error('incomplete interface bindings');
        const evidence =
          known.binding.owner.provider === 'aws'
            ? await runtime.observeAwsInterfaces(known.binding, known.expectedInterfaces, signal)
            : await runtime.observeAzureInterfaces(known.binding, known.expectedInterfaces, signal);
        if (!Array.isArray(evidence.interfaces)) throw new Error('malformed interface collection');
        if (evidence.status !== 'unknown') requireCompleteInterfaceEvidence(evidence, known.expectedInterfaces);
        const freshnessVerified = evidence.status !== 'unknown' && evidence.freshness === 'verified';
        const status = evidence.status === 'down' && !freshnessVerified ? 'unknown' : evidence.status;
        let canSatisfyMutationGate = false;
        try {
          requireQualifiedUpInterfaceEvidence(evidence, known.expectedInterfaces);
          canSatisfyMutationGate = true;
        } catch {}
        const reportedLinkState = evidence.status === 'observed' ? 'up' : evidence.status;
        return {
          content: [
            {
              type: 'text',
              text: `CE ${params.siteName} interfaces: ${status}.${evidence.status === 'down' ? ' Published link state reports down.' : ''} ${freshnessVerified ? 'Interface sample freshness is verified.' : 'CE sample age remains unqualified.'}`,
            },
          ],
          details: {
            tool: 'f5xc_ce_v2_status',
            status,
            reportedLinkState,
            reason:
              evidence.status === 'down' && !freshnessVerified ? 'interface-sample-freshness-unqualified' : undefined,
            siteUid: known.siteUid,
            interfaces: evidence.status === 'unknown' ? [] : evidence.interfaces,
            fetchedAt: evidence.observedAt,
            ceSampleAge: 'unknown',
            freshnessQualification: freshnessVerified ? 'verified' : 'pending-1930',
            canSatisfyMutationGate,
          },
        };
      } catch {
        signal?.throwIfAborted();
      }
      return {
        content: [
          {
            type: 'text',
            text: `CE ${params.siteName} interface observations are unknown; verify context and deployment bindings.`,
          },
        ],
        details: {
          tool: 'f5xc_ce_v2_status',
          status: 'unknown',
          reason,
          interfaces: [],
          canSatisfyMutationGate: false,
        },
      };
    },
  };
}

export { createF5xcCeV2StatusTool };
