import { fingerprint } from '../../../gcloud/src/ce/discovery';
import {
  type OperationalBinding,
  type OperationalCollection,
  type OperationalProfile,
  type OperationalRead,
  qualifiedOperationalProfile,
} from '../../../gcloud/src/ce/operational-health';

const CHECKS = [
  'registration',
  'interfaces',
  'siteStatus',
  'components',
  'inventory',
  'runtime',
  'diagnostics',
] as const;
export interface GcpOperationalObservationPort {
  /** Re-read persisted context, original ownership, cloud IDs, registrations and both NIC joins. */
  binding(signal?: AbortSignal): Promise<OperationalBinding>;
  /** Implementations select frozen, qualified commands and parsers; no arbitrary path or command input. */
  observe(
    node: OperationalBinding['nodes'][number],
    check: (typeof CHECKS)[number],
    signal: AbortSignal,
  ): Promise<unknown>;
  /** Private capture must finish before the next observation, including failed reads. */
  capture(entry: { nodeName: string; check: (typeof CHECKS)[number]; read: OperationalRead }): Promise<void>;
}
/** Candidate collection orchestration. No public runtime is wired until live parser mappings are qualified. */
export async function collectGcpOperationalHealth(
  port: GcpOperationalObservationPort,
  expected: OperationalBinding,
  profile: OperationalProfile,
  pinnedFingerprint: string,
  signal?: AbortSignal,
): Promise<OperationalCollection> {
  if (!qualifiedOperationalProfile(profile, pinnedFingerprint)) throw new Error('Frozen operational profile required');
  expected = structuredClone(expected);
  profile = structuredClone(profile);
  const startedAt = new Date().toISOString();
  const bindingBefore = await port.binding(signal);
  if (fingerprint(bindingBefore) !== fingerprint(expected)) throw new Error('Original operational ownership differs');
  const nodes: OperationalCollection['nodes'] = [];
  for (const node of expected.nodes) {
    const reads = {} as Record<(typeof CHECKS)[number], OperationalRead>;
    for (const check of CHECKS) {
      signal?.throwIfAborted();
      const timeout = AbortSignal.timeout(60_000);
      const bounded = signal ? AbortSignal.any([signal, timeout]) : timeout;
      let read: OperationalRead;
      let onAbort: (() => void) | undefined;
      try {
        const interrupted = new Promise<never>((_resolve, reject) => {
          onAbort = () => reject(bounded.reason);
          bounded.addEventListener('abort', onAbort, { once: true });
          if (bounded.aborted) onAbort();
        });
        const projection = await Promise.race([port.observe(structuredClone(node), check, bounded), interrupted]);
        bounded.throwIfAborted();
        read = {
          available: true,
          observedAt: new Date().toISOString(),
          projection,
          projectionFingerprint: fingerprint(projection),
        };
      } catch {
        read = { available: false, observedAt: new Date().toISOString() };
      } finally {
        if (onAbort) bounded.removeEventListener('abort', onAbort);
      }
      await port.capture({ nodeName: node.nodeName, check, read: structuredClone(read) });
      reads[check] = read;
      signal?.throwIfAborted();
    }
    nodes.push({ nodeName: node.nodeName, ...reads });
  }
  // A failed final binding remains unavailable and cannot reuse the pre-read identity.
  let bindingAfter: OperationalBinding | undefined;
  try {
    bindingAfter = await port.binding(signal);
  } catch {
    signal?.throwIfAborted();
  }
  return {
    schemaVersion: 2,
    bindingBefore,
    bindingAfter,
    contractFingerprint: pinnedFingerprint,
    qualificationFingerprint: fingerprint(profile.qualification),
    startedAt,
    finishedAt: new Date().toISOString(),
    nodes,
  };
}
