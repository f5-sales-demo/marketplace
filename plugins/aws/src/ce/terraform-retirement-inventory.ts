/** Nonsensitive identities captured only after the live pre-destroy ownership guard succeeds. */
export interface AwsTerraformRetirementInventory {
  schemaVersion: 1;
  engine: 'terraform';
  accountId: string;
  region: string;
  deploymentId: string;
  sourcePlanSha256: string;
  terraformPlanSha256: string;
  resources: Array<{ type: string; id: string }>;
  tgwEdges: Array<{ kind: 'association' | 'propagation'; tableId: string; attachmentId: string }>;
  sha256: string;
}
