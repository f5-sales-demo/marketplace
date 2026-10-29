import { createHash } from 'node:crypto';
import { canonicalSha256 } from './canonical';
import { azureNetworkParentTerminalProjection } from './terraform-network-parent-inventory';

const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const same = (left: unknown, right: unknown) => canonicalSha256({ value: left }) === canonicalSha256({ value: right });
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure terminal staging projection: ${message}`);
}
function object(value: unknown): Record<string, unknown> {
  require(value && typeof value === 'object' && !Array.isArray(value), 'complete record required');
  return value as Record<string, unknown>;
}
/** Prepare one exact read-only checkpoint transformation. The caller must authenticate
 * the supplied barrier through its owning reader and retain native/file custody before
 * writing. This neither deletes source packets nor establishes parent cleanup or live
 * acceptance. Every field other than the identified plaintext/digest pair is preserved.
 */
export function prepareAzureTerraformNetworkTerminalStagingProjection(checkpoint: unknown, observed: unknown) {
  const terminal = structuredClone(object(checkpoint)),
    barrier = object(observed),
    evidence = object(terminal.retirementEvidence),
    inventory = object(terminal.retainedNetworkParentInventory),
    receipt = object(barrier.receipt),
    final = object(terminal.final);
  require(terminal.phase === 'retired' &&
    inventory.schemaVersion === 1 &&
    inventory.scope === 'native-bound-network-parent-inventory' &&
    inventory.parentRetirementQualified === false &&
    sha(terminal.sourcePlanSha256) &&
    terminal.sourcePlanSha256 === inventory.originalPlanSha256 &&
    sha(terminal.teardownPlanSha256) &&
    terminal.teardownPlanSha256 === inventory.teardownPlanSha256 &&
    same(evidence.networkParentInventory, inventory) &&
    sha(terminal.retirementEvidenceSha256) &&
    canonicalSha256(evidence) === terminal.retirementEvidenceSha256 &&
    azureNetworkParentTerminalProjection(terminal) ===
      inventory.terminalProjectionSha256, 'native-bound protected checkpoint differs');
  require(barrier.status === 'runner-artifacts-retired' &&
    sha(barrier.markerSha256) &&
    same(receipt, terminal.artifacts) &&
    receipt.evidenceSha256 === terminal.retirementEvidenceSha256 &&
    sha(receipt.manifestSha256) &&
    sha(receipt.independentCleanupSha256) &&
    sha(final.planSha256) &&
    receipt.finalPlanSha256 === final.planSha256 &&
    final.noChanges === true &&
    final.engine === 'terraform' &&
    final.schemaVersion === 1 &&
    Array.isArray(final.changes) &&
    final.changes.length === 0 &&
    !final.operation &&
    !final.actionInvocations &&
    !final.imports &&
    !final.relinquishments, 'complete matching native barrier and ordinary final receipt required');
  const digest = inventory.retainedDestroyConfigurationSha256;
  require(sha(digest) && digest === terminal.configurationSha256, 'retained destroy digest differs');
  const present = Object.hasOwn(terminal, 'retainedDestroyConfiguration');
  if (present) {
    require(typeof terminal.retainedDestroyConfiguration === 'string' &&
      hash(terminal.retainedDestroyConfiguration) === digest, 'retained destroy plaintext differs');
    require(!Object.hasOwn(terminal, 'retainedDestroyConfigurationSha256') ||
      terminal.retainedDestroyConfigurationSha256 === digest, 'conflicting retained destroy digest');
    delete terminal.retainedDestroyConfiguration;
    terminal.retainedDestroyConfigurationSha256 = digest;
  } else require(terminal.retainedDestroyConfigurationSha256 === digest, 'missing authenticated destroy digest');
  require(azureNetworkParentTerminalProjection(terminal) ===
    inventory.terminalProjectionSha256, 'protected checkpoint changed during projection');
  return {
    schemaVersion: 1 as const,
    scope: 'retained-destroy-configuration-projection-only' as const,
    checkpoint: terminal,
    checkpointSha256: canonicalSha256(terminal),
    retainedDestroyConfigurationSha256: digest,
    transformationRequired: present,
    nativeBarrierReadQualified: false as const,
    parentRetirementQualified: false as const,
    currentOperationalAcceptanceQualified: false as const,
  };
}
