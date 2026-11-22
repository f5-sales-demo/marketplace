import { expect, test } from 'bun:test';
import { translateGcpTerraformObserverSiteCompute } from '../../gcloud/src/ce/observer-plan';
import { createGcpTerraformRequestReason } from '../../gcloud/src/ce/request-reason';
import { GCP_XCSH15178_OBSERVER_ARTIFACTS } from '../../gcloud/src/ce/terraform-public-artifacts';
import { openInstalledApplyTraceStage } from '../src/installed-apply-trace-stage';
import { assertOriginalTerraformPlanProjection } from '../src/runner';
import { fixture } from './original-gcp-inventory-fixture';
import { retainOwnedTestCapture } from './retained-test-capture';

test('creation trace preflight closes after its actual owning runner plan lease retires', async () => {
  let stage: Awaited<ReturnType<typeof openInstalledApplyTraceStage>> | undefined;
  let store: Parameters<Parameters<typeof fixture>[0]>[1] | undefined;
  let plan: Parameters<typeof assertOriginalTerraformPlanProjection>[0];
  await fixture(
    async (context, originalStore) => {
      store = originalStore;
      plan = await context.readOriginalPlanSource?.();
      const providers = await context.readProviderInputs();
      const provider = providers['registry.terraform.io/hashicorp/google:terraform-provider-google_v8.12.0_x5'];
      if (!provider) throw new Error('Original source-qualified provider required');
      stage = await openInstalledApplyTraceStage({
        context,
        store: originalStore,
        providerPath: provider.path,
        onResponse: async () => {},
      });
      await stage.prepare?.(context);
    },
    '',
    true,
    () => false,
    (intent) =>
      JSON.stringify(
        translateGcpTerraformObserverSiteCompute(
          intent,
          GCP_XCSH15178_OBSERVER_ARTIFACTS.versions,
          intent.observer as NonNullable<typeof intent.observer>,
          createGcpTerraformRequestReason(intent),
        ).configuration,
      ),
    undefined,
    GCP_XCSH15178_OBSERVER_ARTIFACTS.providerLock,
    true,
    7200000,
    async () => {
      if (!stage || !store || !plan) throw new Error('Original trace preflight sources required');
      let outcome: 'success' | 'failure' = 'failure';
      try {
        await expect(assertOriginalTerraformPlanProjection(plan)).rejects.toThrow('retired');
        await stage.closeAfterExecutorExit();
        outcome = 'success';
      } finally {
        await retainOwnedTestCapture(store.directory, 'creation-trace-retired-original-plan', outcome);
      }
    },
  );
});
