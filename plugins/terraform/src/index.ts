export {
  collectOriginalGcpTerraformBootstrap,
  collectOriginalGcpTerraformBootstrapV2,
  readOriginalGcpTerraformBootstrapJwt,
} from './gcp-bootstrap-evidence';
export { joinOriginalGcpBootstrapVm } from './gcp-bootstrap-vm-binding';
export { assertOriginalInstalledGcpCloudReader, openGcpCloudSerialReader } from './gcp-cloud-serial-reader';
export {
  assertOriginalGcpPreapplyBootstrapContext,
  collectOriginalGcpPreapplyBootstrap,
  readOriginalGcpPreapplyBootstrapJwt,
} from './gcp-preapply-bootstrap';
export { checkoutOriginalGcpPreapplyBootstrap } from './gcp-preapply-checkout';
export { openInstalledBootstrapCapture } from './installed-bootstrap-capture';
export { openInstalledXcshCreationReader, readOriginalInstalledXcshCreation } from './installed-xcsh-creation-reader';
export {
  assertOriginalGcpInventoryInputs,
  assertOriginalGcpInventoryScope,
  closeOriginalGcpInventoryScope,
  inspectOriginalGcpInventoryScope,
  prepareOriginalGcpInventoryScope,
} from './original-gcp-inventory-scope';
export { publishOriginalGcpBootstrapGrant } from './prepared-creation-scope';
export { joinOriginalXcshCreationBody, readOriginalXcshCreationBody } from './xcsh-creation-body';

import type { CeEventBus } from '../../platform/src/ce/service';
import { bindOriginalGcpCampaignAccess, prepareOriginalGcpCampaignAccess } from './gcp-campaign-access';
import { assertInstalledRuntime, createInstalledRuntimeResolver } from './installed-runtime';
import { createCeTerraformService, registerCeTerraformService, requestPlatform } from './service';

export default function factory(pi: { events: CeEventBus; setLabel(label: string): void }): void {
  pi.setLabel('Terraform CE lifecycle execution');
  const service = createCeTerraformService(() => requestPlatform(pi.events), {
    resolveRuntime: createInstalledRuntimeResolver(),
  });
  registerCeTerraformService(pi.events, {
    ...service,
    prepareGcpCaptureAccess: async (owner, request) => {
      owner = structuredClone(owner);
      request = structuredClone(request);
      if (owner.provider !== 'gcp' || owner.engine !== 'terraform')
        throw new Error('GCP Terraform access scope required');
      await assertInstalledRuntime();
      const platform = await requestPlatform(pi.events);
      return prepareOriginalGcpCampaignAccess(await platform.storage(owner), request);
    },
    bindGcpCaptureAccess: async (owner, binding) => {
      owner = structuredClone(owner);
      binding = structuredClone(binding);
      if (owner.provider !== 'gcp' || owner.engine !== 'terraform')
        throw new Error('GCP Terraform access scope required');
      const platform = await requestPlatform(pi.events);
      await bindOriginalGcpCampaignAccess(await platform.storage(owner), binding);
    },
    assertNewRuntime: async (provider: string) => {
      if (provider === 'gcp') await assertInstalledRuntime();
    },
  });
}

export {
  GoogleHttpRpcTraceParser,
  readOriginalGoogleHttpResponseSource,
  readOriginalGoogleHttpRpcSource,
} from './gcp-http-rpc-trace';
export { joinOriginalGcpInsertAuditEvidence, type OriginalGcpInsertAuditJoinInput } from './gcp-insert-audit-evidence';
export {
  collectOriginalEarlyGcpInsertIdentity,
  collectOriginalGcpInsertWitnesses,
  readOriginalEarlyGcpInsertBodies,
  readOriginalEarlyGcpInsertIdentity,
  readOriginalGcpInsertWitnesses,
} from './gcp-insert-evidence';
export {
  collectOriginalEarlyGcpSerialEvidence,
  collectOriginalEarlyGcpVmEvidence,
  joinOriginalGcpVmEvidence,
  type OriginalGcpVmJoinInput,
  readOriginalEarlyGcpVmEvidence,
} from './gcp-vm-evidence';
export { acknowledgeOriginalApplyGroupClosure } from './installed-apply-controller';
export {
  assertOriginalApplyGcpInventoryCallback,
  openInstalledInitialInventory,
  readOriginalApplyGcpInventory,
} from './installed-initial-inventory';
export {
  openInstalledProviderReader,
  readOriginalInstalledProviderWindow,
  readOriginalInstalledProviderWindowClock,
} from './installed-provider-reader';
export { readOriginalExecutionPrefix } from './original-output-stream';
export { readOriginalTerraformApplyHookSource, TerraformApplyHookParser } from './terraform-apply-hooks';
