import { expect } from 'bun:test';
import { readAzureTerraformNetworkReplacementSourceBinding } from '../../src/ce/terraform-network-replacement-binding-reader';
import { readAzureTerraformNetworkReplacementExecutionBinding } from '../../src/ce/terraform-network-replacement-execution-journal';
import { test } from './owned-fixture-test';

import { networkReplacementExecutorFixture as fixture } from './terraform-network-replacement-executor-fixture';

for (const mode of ['source', 'outcome'] as const)
  test(`joint journal final callback cannot change authenticated ${mode}`, async () => {
    const f = await fixture(),
      read = f.store.read.bind(f.store);
    const journalName = `${f.input.plan.planId}-terraform-network-replacement-execution.json`;
    let reads = 0,
      changed = false;
    f.store.read = async (name) => {
      const value = await read(name);
      if (name === journalName && ++reads === 2) {
        changed = true;
        if (mode === 'source') {
          const name = `${f.input.plan.planId}-terraform-network-replacement-source.json`;
          const binding = (await read(name)) as { source: string };
          binding.source += '\n# altered during final journal read\n';
          await f.store.write(name, binding);
        } else {
          f.dependencies.loaders.loadOutcome = async () => {
            throw Error('owning outcome changed during journal read');
          };
        }
      }
      return value;
    };
    await expect(
      readAzureTerraformNetworkReplacementExecutionBinding(
        f.input.plan,
        f.store,
        f.dependencies.loaders,
        f.dependencies.site,
        f.dependencies.journalSha256,
        f.dependencies.qualifyHistorical,
        undefined,
        undefined,
        f.dependencies.qualifyCompletedOperational,
      ),
    ).rejects.toThrow(/changed|historical packet/);
    expect(changed).toBe(true);
    expect(f.state.applies).toBe(0);
    expect(f.state.bootstraps).toBe(0);
  }, 30000);

test('joint owning read that ignores cancellation remains bounded without mutation', async () => {
  const f = await fixture(),
    controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await expect(
      readAzureTerraformNetworkReplacementSourceBinding(
        f.input.plan,
        f.store,
        f.dependencies.loaders,
        f.dependencies.site,
        f.dependencies.sourceBindingSha256,
        f.dependencies.qualifyHistorical,
        controller.signal,
        undefined,
        f.dependencies.qualifyCompletedOperational,
        async () => {
          timer = setTimeout(() => controller.abort(Error('joint journal cancelled')), 10);
          await new Promise(() => {});
        },
      ),
    ).rejects.toThrow(/joint journal cancelled/);
  } finally {
    clearTimeout(timer);
  }
  expect(f.state.applies).toBe(0);
  expect(f.state.bootstraps).toBe(0);
}, 30000);
