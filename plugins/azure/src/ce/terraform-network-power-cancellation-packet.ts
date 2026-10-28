import type { PlanReceipt } from '../../../terraform/src/runner';
import { canonicalSha256 } from './canonical';
import type { AzureNetworkUpdateInventory } from './network-update';
import {
  validateAzureTerraformNetworkPowerPlan,
  validateAzureTerraformNetworkPowerProjection,
} from './terraform-network-power';
import type { AzureCePlan } from './types';

const same = (a: unknown, b: unknown) => canonicalSha256(a) === canonicalSha256(b);
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network power cancellation: ${message}`);
}
const object = (input: unknown): Record<string, unknown> => {
  require(input && typeof input === 'object' && !Array.isArray(input), 'malformed cancellation packet');
  return input as Record<string, unknown>;
};
/** Validate original packet schema and selected plan/projection without mutation or lock acquisition.
 * Runner cancellation custody and completed provenance require the owning lifecycle observer.
 */
export async function validateAzureTerraformPowerCancellationPacket(
  plan: AzureCePlan,
  before: AzureNetworkUpdateInventory,
  selectedNode: number,
  selectedOperation: 'deallocate' | 'start',
  bound: Record<string, unknown>,
  input: unknown,
  publishedMutation?: PlanReceipt,
) {
  const packet = object(input);
  const keys = [
    ...Object.keys(bound),
    'status',
    'receipt',
    'originalJournalSha256',
    'prior',
    'proposed',
    'evidenceSha256',
    ...(packet.status === 'cancelled' ? ['provenance'] : []),
  ];
  require(same(Object.keys(packet).sort(), keys.sort()) &&
    (packet.status === 'preparing' || packet.status === 'cancelled') &&
    Object.entries(bound).every(([key, value]) => same(packet[key], value)) &&
    typeof packet.originalJournalSha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(packet.originalJournalSha256), 'stage cancellation source or schema differs');
  const receipt = await validateAzureTerraformNetworkPowerPlan(
    plan,
    before,
    selectedNode,
    selectedOperation,
    packet.receipt,
    'mutation',
  );
  require(!publishedMutation || same(publishedMutation, receipt), 'published original receipt differs');
  await validateAzureTerraformNetworkPowerProjection(
    plan,
    before,
    selectedNode,
    selectedOperation,
    receipt,
    'mutation',
    packet.prior,
    packet.proposed,
  );
  require(packet.evidenceSha256 ===
    canonicalSha256({
      ...bound,
      receipt,
      originalJournalSha256: packet.originalJournalSha256,
      prior: packet.prior,
      proposed: packet.proposed,
    }), 'original cancellation evidence differs');
  return { packet, receipt, evidenceSha256: packet.evidenceSha256 as string };
}
