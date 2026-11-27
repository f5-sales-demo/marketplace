import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { canonicalSha256 } from '../../src/ce/canonical';
import { azureNetworkParentTerminalProjection } from '../../src/ce/terraform-network-parent-inventory';
import { prepareAzureTerraformNetworkTerminalStagingProjection } from '../../src/ce/terraform-network-terminal-staging-projection';

function fixture() {
  const digest = createHash('sha256').update('sanitized-rendered-source').digest('hex');
  const terminal: Record<string, unknown> = {
    phase: 'retired',
    sourcePlanSha256: 'a'.repeat(64),
    teardownPlanSha256: 'b'.repeat(64),
    configurationSha256: digest,
    retainedDestroyConfiguration: 'sanitized-rendered-source',
    final: { schemaVersion: 1, engine: 'terraform', planSha256: 'c'.repeat(64), noChanges: true, changes: [] },
    protectedMetadata: { schemaVersion: 1, ownership: 'sanitized-owner' },
    retainedTerminalNetworkCustody: { proof: 'sanitized-proof' },
  };
  const inventory = {
    schemaVersion: 1,
    scope: 'native-bound-network-parent-inventory',
    parentRetirementQualified: false,
    originalPlanSha256: terminal.sourcePlanSha256,
    teardownPlanSha256: terminal.teardownPlanSha256,
    terminalProjectionSha256: azureNetworkParentTerminalProjection(terminal),
    retainedDestroyConfigurationSha256: digest,
  };
  terminal.retainedNetworkParentInventory = inventory;
  terminal.retirementEvidence = { networkParentInventory: inventory, independent: 'sanitized-absence' };
  terminal.retirementEvidenceSha256 = canonicalSha256(terminal.retirementEvidence);
  const receipt = {
    evidenceSha256: terminal.retirementEvidenceSha256,
    manifestSha256: 'd'.repeat(64),
    independentCleanupSha256: 'e'.repeat(64),
    finalPlanSha256: 'c'.repeat(64),
  };
  terminal.artifacts = receipt;
  return { terminal, barrier: { status: 'runner-artifacts-retired', markerSha256: 'f'.repeat(64), receipt } };
}
test('terminal staging proposal removes only authenticated plaintext and resumes by digest', () => {
  const { terminal, barrier } = fixture(),
    original = structuredClone(terminal);
  const proposal = prepareAzureTerraformNetworkTerminalStagingProjection(terminal, barrier);
  expect(terminal).toEqual(original);
  expect(Object.hasOwn(proposal.checkpoint, 'retainedDestroyConfiguration')).toBe(false);
  expect(proposal.checkpoint.retainedDestroyConfigurationSha256).toBe(terminal.configurationSha256);
  expect(proposal.checkpoint.protectedMetadata).toEqual(terminal.protectedMetadata);
  expect(proposal.checkpoint.retainedTerminalNetworkCustody).toEqual(terminal.retainedTerminalNetworkCustody);
  expect(proposal.checkpoint.retirementEvidence).toEqual(terminal.retirementEvidence);
  expect(proposal.nativeBarrierReadQualified).toBe(false);
  expect(proposal.parentRetirementQualified).toBe(false);
  const resumed = prepareAzureTerraformNetworkTerminalStagingProjection(proposal.checkpoint, barrier);
  expect(resumed.transformationRequired).toBe(false);
  expect(resumed.checkpoint).toEqual(proposal.checkpoint);
});
for (const fault of [
  'plaintext',
  'protected',
  'partial-barrier',
  'foreign-receipt',
  'wrong-digest',
  'missing-digest',
  'action-final',
  'forged-inventory',
] as const)
  test(`terminal staging proposal rejects ${fault}`, () => {
    const { terminal, barrier } = fixture();
    if (fault === 'plaintext') terminal.retainedDestroyConfiguration = 'foreign-source';
    if (fault === 'protected') terminal.protectedMetadata = { ownership: 'foreign-owner' };
    if (fault === 'partial-barrier') barrier.status = 'retiring';
    if (fault === 'foreign-receipt') barrier.receipt = { ...barrier.receipt, evidenceSha256: '0'.repeat(64) };
    if (fault === 'wrong-digest') terminal.retainedDestroyConfigurationSha256 = '0'.repeat(64);
    if (fault === 'missing-digest') delete terminal.retainedDestroyConfiguration;
    if (fault === 'action-final') (terminal.final as Record<string, unknown>).operation = 'destroy';
    if (fault === 'forged-inventory')
      terminal.retainedNetworkParentInventory = {
        ...(terminal.retainedNetworkParentInventory as object),
        originalPlanSha256: '0'.repeat(64),
      };
    expect(() => prepareAzureTerraformNetworkTerminalStagingProjection(terminal, barrier)).toThrow();
  });
