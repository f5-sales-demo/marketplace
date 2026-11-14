import { expect } from 'bun:test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CePlatformService } from '../../../platform/src/ce/service';
import { type PlanReceipt, TerraformRunner } from '../../../terraform/src/runner';
import { createCeTerraformService } from '../../../terraform/src/service';
import { canonicalSha256 } from '../../src/ce/canonical';
import { azureTerraformCurrentDeployment } from '../../src/ce/terraform-foundation';
import { readAzureTerraformNetworkReplacementReceiptProvenance } from '../../src/ce/terraform-network-replacement-receipt-provenance';
import {
  validateAzureTerraformReplacementCheckpoint,
  validateAzureTerraformReplacementSource,
} from '../../src/ce/terraform-replacement';
import { completedReplacement } from './terraform-network-mixed-generation-fixture';

/** Production replacement/provenance orchestration with a synthetic cloud/executor substrate;
 * the journal reader uses actual private TerraformRunner files. No installed/live claim. */
export async function replacementNativeReceiptsFixture() {
  const f = await completedReplacement(false, true);
  const proof = await readAzureTerraformNetworkReplacementReceiptProvenance(
    f.first,
    f.f.store,
    f.loaders,
    f.f.birth.site,
    f.f.dependencies.qualifyHistorical,
    f.f.dependencies.qualifyCompletedOperational,
  );
  const checkpoint = validateAzureTerraformReplacementCheckpoint(
    f.first,
    await f.f.store.read(`${f.first.planId}-terraform-replacement.json`),
  );
  const material = validateAzureTerraformReplacementSource(
    f.first,
    checkpoint,
    await f.f.store.read(`${f.first.planId}-terraform-replacement-source.json`),
  );
  const sources = new Map([
    [f.f.binding.sourceConfigurationSha256, f.f.binding.source],
    [material.stages.quiesce.configurationSha256, material.stages.quiesce.configuration],
    [material.stages.launch.configurationSha256, material.stages.launch.configuration],
  ]);
  const deployment = await azureTerraformCurrentDeployment(f.first),
    commands: string[] = [];
  let selected: PlanReceipt | undefined;
  const runner = new TerraformRunner(f.f.store.directory, async (request) => {
    commands.push(request.args[0]);
    let stdout = '{}';
    if (request.args[0] === 'version') stdout = JSON.stringify({ terraform_version: deployment.terraformVersion });
    if (request.args[0] === 'plan') {
      if (!selected) throw Error('exact original replacement receipt required');
      const bytes = Array.from({ length: 500 }, (_, i) => String(i + 1)).find(
        (value) => f.f.hash(value) === selected?.planSha256,
      );
      if (!bytes) throw Error('exact original replacement saved bytes missing');
      expect(f.f.hash(await readFile(join(request.cwd, 'main.tf.json'), 'utf8'))).toBe(selected.configurationSha256);
      await writeFile(join(request.cwd, 'saved.tfplan'), bytes, { mode: 0o600 });
    }
    if (request.args[0] === 'show') {
      if (!selected) throw Error('selected actual replacement receipt required');
      stdout = JSON.stringify({
        format_version: '1.2',
        terraform_version: deployment.terraformVersion,
        errored: false,
        complete: true,
        applyable: true, // codespell:ignore applyable (exact Terraform JSON field)
        output_changes: {},
        resource_changes: selected.changes.map((change) => ({
          ...change,
          mode: 'managed',
          provider_name: `registry.terraform.io/hashicorp/${change.type.startsWith('tls_') ? 'tls' : 'azurerm'}`,
          change: { actions: change.actions, before: null, after: null, after_unknown: {} },
        })),
      });
    }
    return { code: 0, stdout, executable: { path: '/synthetic/terraform', sha256: 'a'.repeat(64) } };
  });
  await runner.prepare({ ...deployment, configuration: f.f.binding.source });
  const archive = async (receipt: PlanReceipt) => {
    const source = sources.get(receipt.configurationSha256);
    if (!source) throw Error('authenticated replacement source unavailable');
    const current = await runner.readConfigurationSha256();
    if (current !== receipt.configurationSha256) await runner.reviseConfiguration(current, source);
    selected = receipt;
    const actual = await runner.plan({}, undefined, receipt.refreshOriginSha256);
    expect(actual).toEqual(receipt);
    if (!receipt.noChanges) await runner.apply(actual, {});
  };
  for (const row of proof.receipts) await archive(row.receipt);
  const platform = {
    storage: async (owner: typeof f.f.store.owner) => {
      expect(owner).toEqual(f.f.store.owner);
      await f.f.store.verify();
      return f.f.store;
    },
  } as unknown as CePlatformService;
  const service = createCeTerraformService(async () => platform);
  return {
    ...f,
    proof,
    runner,
    service,
    commands,
    deployment,
    archive,
    sources,
    appendUnknown: async () => {
      const receipt = { ...proof.receipts[2].receipt, planSha256: f.f.hash('499') };
      await archive(receipt);
      return canonicalSha256(receipt);
    },
  };
}
