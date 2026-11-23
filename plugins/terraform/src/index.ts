export {
  collectOriginalGcpTerraformBootstrap,
  collectOriginalGcpTerraformBootstrapV2,
  collectOriginalGcpTerraformBootstrapV3,
  type OriginalGcpTerraformBootstrapEvidenceV3,
  readOriginalGcpTerraformBootstrapJwt,
} from './gcp-bootstrap-evidence';
export { joinOriginalGcpBootstrapVm } from './gcp-bootstrap-vm-binding';
export { assertOriginalInstalledGcpCloudReader, openGcpCloudSerialReader } from './gcp-cloud-serial-reader';
export {
  assertOriginalGcpPreapplyBootstrapContext,
  collectOriginalGcpPreapplyBootstrap,
  type OriginalGcpPreapplyBootstrapEvidence,
  readOriginalGcpPreapplyBootstrapJwt,
} from './gcp-preapply-bootstrap';
export { checkoutOriginalGcpPreapplyBootstrap } from './gcp-preapply-checkout';
export { openInstalledBootstrapCapture } from './installed-bootstrap-capture';
export { openInstalledGcpGuestBinding } from './installed-guest-binding';
export {
  collectInstalledOriginalGuestReaderClosures,
  collectInstalledOriginalGuestRound,
  openInstalledFinalGuestWorker,
  openInstalledGuestWorker,
} from './installed-guest-worker';
export { openInstalledXcshCreationReader, readOriginalInstalledXcshCreation } from './installed-xcsh-creation-reader';
export {
  assertOriginalGcpInventoryInputs,
  assertOriginalGcpInventoryScope,
  closeOriginalGcpInventoryScope,
  inspectOriginalGcpInventoryScope,
  prepareOriginalGcpInventoryScope,
} from './original-gcp-inventory-scope';
export { publishOriginalGcpBootstrapGrant } from './prepared-creation-scope';
export {
  joinOriginalXcshCreationBody,
  readOriginalXcshCreationBody,
  readOriginalXcshCreationBodyProviderProfile,
} from './xcsh-creation-body';

import type { CeEventBus } from '../../platform/src/ce/service';
import { bindOriginalGcpCampaignAccess, prepareOriginalGcpCampaignAccess } from './gcp-campaign-access';
import { assertInstalledRuntime, createInstalledRuntimeResolver } from './installed-runtime';
import { assertInstalledGcpSshClientSetup } from './installed-ssh-clients';
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
      await assertInstalledGcpSshClientSetup();
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
      if (provider === 'gcp') {
        await assertInstalledRuntime();
        await assertInstalledGcpSshClientSetup();
      }
    },
  });
}

export {
  closeOriginalGcpCeKeyScanCommand,
  openOriginalGcpCeKeyScanCommand,
  readOriginalGcpCeKeyScanCommand,
} from './gcp-ce-keyscan-command';
export {
  bindOriginalQualifiedGcpCeObserverScanContext,
  openOriginalGcpCeSliTarget,
  readOriginalGcpCeSliSerialSource,
  readOriginalGcpCeSliTarget,
  readOriginalQualifiedGcpCeObserverScanContext,
} from './gcp-ce-sli-target';
export {
  assertOriginalGcpCeWireKeysContext,
  type OriginalGcpCeWireKeys,
  openGcpCeWireKeyReader,
  readOriginalGcpCeWireKeys,
} from './gcp-ce-wire-key-reader';
export {
  GoogleHttpRpcTraceParser,
  readOriginalGoogleHttpResponseSource,
  readOriginalGoogleHttpRpcSource,
} from './gcp-http-rpc-trace';
export {
  collectInstalledOriginalCeAudit,
  collectInstalledOriginalObserverAudit,
  joinOriginalGcpInsertAuditEvidence,
  type OriginalGcpInsertAuditJoinInput,
} from './gcp-insert-audit-evidence';
export {
  collectOriginalEarlyGcpInsertIdentity,
  collectOriginalGcpInsertWitnesses,
  inspectOriginalGcpInsertBodies,
  readOriginalEarlyGcpInsertBodies,
  readOriginalEarlyGcpInsertIdentity,
  readOriginalGcpInsertWitnesses,
} from './gcp-insert-evidence';
export {
  assertOriginalGcpObserverClientAbiContext,
  openGcpObserverClientAbi,
  readOriginalGcpObserverClientAbi,
} from './gcp-observer-client-abi';
export {
  closeOriginalGcpObserverClientAbiCommand,
  openOriginalGcpObserverClientAbiCommand,
} from './gcp-observer-client-abi-command';
export {
  assertOriginalGcpObserverClientAbiRenewalContext,
  type OriginalGcpObserverClientAbiRenewal,
  openGcpObserverClientAbiRenewal,
  readOriginalGcpObserverClientAbiRenewal,
} from './gcp-observer-client-abi-renewal';
export {
  closeOriginalGcpObserverClientAbiRenewalCommand,
  openOriginalGcpObserverClientAbiRenewalCommand,
  readOriginalGcpObserverClientAbiRenewalCommand,
} from './gcp-observer-client-abi-renewal-command';
export {
  assertOriginalGcpObserverClientInstallationContext,
  closeOriginalGcpObserverClientInstallation,
  type OriginalGcpObserverClientInstallation,
  openOriginalGcpObserverClientInstallation,
  readOriginalGcpObserverClientInstallation,
} from './gcp-observer-client-delivery';
export {
  assertOriginalGcpCeHostTrustContext,
  openGcpCeHostTrustReader,
  openGcpObserverHostTrustReader,
  readOriginalGcpCeHostTrust,
  readOriginalGcpObserverHostTrust,
} from './gcp-observer-host-trust-reader';
export {
  assertOriginalInstalledGcpFinalImageReader,
  captureOriginalGcpObserverImage,
  openGcpObserverImageReader,
  openInstalledGcpObserverImageReader,
  readOriginalGcpObserverImageEvidence,
} from './gcp-observer-image';
export {
  assertOriginalGcpObserverInsertContext,
  bindOriginalGcpObserverFinalImage,
  collectOriginalGcpObserverInsertIdentity,
  collectOriginalGcpObserverSerialEvidence,
  collectOriginalGcpObserverVmEvidence,
  type OriginalGcpObserverInsertIdentity,
  type OriginalGcpObserverInsertInput,
  type OriginalGcpObserverVmEvidence,
  type OriginalGcpObserverVmInput,
  readOriginalGcpObserverInsertIdentity,
  readOriginalGcpObserverSerialSource,
  readOriginalGcpObserverVmEvidence,
} from './gcp-observer-insert-evidence';
export { assertOriginalQualifiedGcpObserverClientsContext } from './gcp-observer-qualified-clients';
export {
  compileOriginalGcpCeTrustMaterial,
  compileOriginalGcpObserverTrustMaterial,
  readOriginalGcpCeTrustMaterial,
  readOriginalGcpObserverTrustMaterial,
} from './gcp-observer-trust-material';
export {
  type OriginalGcpObserverWireKeys,
  openGcpObserverWireKeyReader,
  readOriginalGcpObserverWireKeys,
} from './gcp-observer-wire-key-reader';
export {
  collectOriginalEarlyGcpSerialEvidence,
  collectOriginalEarlyGcpVmEvidence,
  collectOriginalFinalGcpSerialEvidence,
  handoffOriginalEarlyGcpVmEvidence,
  joinOriginalGcpVmEvidence,
  type OriginalFinalGcpVmEvidence,
  type OriginalFinalGcpVmHandoffInput,
  type OriginalGcpSerialSource,
  type OriginalGcpVmJoinInput,
  readOriginalEarlyGcpSerialSource,
  readOriginalEarlyGcpVmEvidence,
  readOriginalFinalGcpSerialSource,
  readOriginalFinalGcpVmEvidence,
} from './gcp-vm-evidence';
export { acknowledgeOriginalApplyGroupClosure, assertOriginalApplyGroupClosed } from './installed-apply-controller';
export { openInstalledApplyTraceStage } from './installed-apply-trace-stage';
export { scheduleInstalledBeforeGuestRound } from './installed-before-guest-round';
export { collectInstalledCeInsertWitnesses } from './installed-ce-insert-witnesses';
export { openInstalledDeleteCapture } from './installed-delete-capture';
export {
  assertOriginalApplyGcpInventoryCallback,
  openInstalledInitialInventory,
  readOriginalApplyGcpInventory,
} from './installed-initial-inventory';
export { collectInstalledObserverInsertWitnesses } from './installed-observer-insert-witnesses';
export {
  openInstalledProviderReader,
  readOriginalInstalledProviderWindow,
  readOriginalInstalledProviderWindowClock,
} from './installed-provider-reader';
export { type InstalledVmCaptureInput, openInstalledVmCapture } from './installed-vm-capture';
export { readOriginalExecutionPrefix } from './original-output-stream';
export {
  assertOriginalReaderGroupClosure,
  assertOriginalReaderGroupInputs,
  collectOriginalReaderGroupClosure,
  persistOriginalReaderGroupSet,
} from './original-reader-group-closure';
export { readCaptureCleanupAttemptResourceFields } from './runner';
export { readOriginalTerraformApplyHookSource, TerraformApplyHookParser } from './terraform-apply-hooks';
