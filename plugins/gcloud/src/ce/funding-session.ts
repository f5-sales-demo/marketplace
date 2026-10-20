import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import type { GcloudExecApi } from '../gcloud/exec';
import { assertGcpByolAuthorization, fetchGcpByolDocument } from './byol-terms';
import { assertGcpCorporateFundingCurrent, collectCurrentGcpCorporateFunding } from './corporate-funding';
import { fingerprint } from './discovery';
import type { GcpOperationStore } from './native-operation';
import { createGcpPreflightPort } from './preflight-port';
import type { GcpCeIntent } from './types';

function billable(receipt: PlanReceipt) {
  return receipt.changes.some(
    (change) =>
      change.type.startsWith('google_') && change.actions.some((action) => action === 'create' || action === 'update'),
  );
}
/** Original saved-plan receipts stay untouched; the reviewed funding binding lives in restricted storage. */
export function withGcpCorporateFunding(
  session: TerraformSession,
  store: GcpOperationStore,
  api: GcloudExecApi,
  project: string,
  collect = collectCurrentGcpCorporateFunding,
  intent?: GcpCeIntent,
): TerraformSession {
  return {
    ...session,
    async plan(environment, signal) {
      const receipt = await session.plan(environment, signal);
      if (billable(receipt)) {
        const funding = await collect(api, project, signal);
        await store.write(`gcp-funding-${receipt.planSha256}.json`, {
          schemaVersion: 1,
          receiptFingerprint: fingerprint(receipt),
          funding,
        });
      }
      return receipt;
    },
    async apply(receipt, environment, signal) {
      if (billable(receipt)) {
        const saved = (await store.read(`gcp-funding-${receipt.planSha256}.json`)) as {
          schemaVersion: number;
          receiptFingerprint: string;
          funding: Awaited<ReturnType<typeof collectCurrentGcpCorporateFunding>>;
        };
        if (saved.schemaVersion !== 1 || saved.receiptFingerprint !== fingerprint(receipt))
          throw new Error('Reviewed Terraform corporate funding binding differs');
        const current = await collect(api, project, signal);
        assertGcpCorporateFundingCurrent(current, project, saved.funding.billingAccountName);
        if (current.policySha256 !== saved.funding.policySha256)
          throw new Error('Corporate funding policy changed after Terraform review');
        if (intent?.image.name.endsWith('-byol'))
          await assertGcpByolAuthorization(
            intent,
            { query: createGcpPreflightPort(api, project).query, document: fetchGcpByolDocument },
            current,
            store,
            signal,
          );
      }
      return session.apply(receipt, environment, signal);
    },
  };
}
