import { join } from 'node:path';
import type { InstalledCaptureContext } from './installed-capture-context';
import { readOwnedInstalledInput } from './installed-runtime';
import { assertSameOriginalInput, type OriginalInputBinding } from './original-input-monitor';
import { assertOriginalTerraformPlanProjection, type OriginalTerraformPlanProjection } from './runner';

/** Bind original files while the source is active. This closure-only read
 * proof survives runner retirement and cannot revive execution authority. */
export async function bindOriginalTerraformPlanInputs(
  context: InstalledCaptureContext,
  plan: OriginalTerraformPlanProjection,
): Promise<() => Promise<void>> {
  await assertOriginalTerraformPlanProjection(plan);
  if (plan.directory !== context.executionDirectory || (await context.readOriginalPlanSource?.()) !== plan)
    throw new Error('Original durable plan context required');
  const bindings: OriginalInputBinding[] = [];
  for (const [name, sha256] of [
    ['saved.tfplan', plan.receipt.planSha256],
    ['main.tf.json', plan.receipt.configurationSha256],
    ['.terraform.lock.hcl', plan.receipt.providerLockSha256],
  ] as const) {
    const file = await readOwnedInstalledInput(join(context.executionDirectory, name));
    if (file.binding.sha256 !== sha256) throw new Error('Original durable plan input differs');
    bindings.push(file.binding);
  }
  return async () => {
    for (const binding of bindings) {
      const file = await readOwnedInstalledInput(binding.path);
      assertSameOriginalInput(binding, file.binding);
    }
  };
}
