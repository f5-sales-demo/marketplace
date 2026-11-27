// @bun

// plugins/terraform/src/gcp-bootstrap-evidence.ts
import { createHash } from 'node:crypto';
import {
  acknowledgeOriginalApplyGroupClosure2,
  assertInstalledRuntime2,
  assertOriginalApplyGcpInventoryCallback2,
  assertOriginalApplyGroupClosed2,
  assertOriginalGcpCeHostTrustContext2,
  assertOriginalGcpCeWireKeysContext2,
  assertOriginalGcpInventoryInputs2,
  assertOriginalGcpInventoryScope2,
  assertOriginalGcpObserverClientAbiContext2,
  assertOriginalGcpObserverClientAbiRenewalContext2,
  assertOriginalGcpObserverClientInstallationContext2,
  assertOriginalGcpObserverInsertContext2,
  assertOriginalGcpPreapplyBootstrapContext2,
  assertOriginalInstalledGcpCloudReader2,
  assertOriginalInstalledGcpFinalImageReader2,
  assertOriginalQualifiedGcpObserverClientsContext2,
  assertOriginalReaderGroupClosure2,
  assertOriginalReaderGroupInputs2,
  bindOriginalGcpCampaignAccess,
  bindOriginalGcpObserverFinalImage2,
  bindOriginalQualifiedGcpCeObserverScanContext2,
  captureOriginalGcpObserverImage2,
  checkoutOriginalGcpPreapplyBootstrap2,
  closeOriginalGcpCeKeyScanCommand2,
  closeOriginalGcpInventoryScope2,
  closeOriginalGcpObserverClientAbiCommand2,
  closeOriginalGcpObserverClientAbiRenewalCommand2,
  closeOriginalGcpObserverClientInstallation2,
  collectInstalledOriginalAccessReaderSource2,
  collectInstalledOriginalAccessReaderSources2,
  collectInstalledOriginalXcshReaderClosures2,
  collectOriginalBootstrapPublisherSource2,
  collectOriginalEarlyGcpInsertIdentity2,
  collectOriginalEarlyGcpSerialEvidence2,
  collectOriginalEarlyGcpVmEvidence2,
  collectOriginalFinalGcpSerialEvidence2,
  collectOriginalGcpInsertWitnesses2,
  collectOriginalGcpObserverInsertIdentity2,
  collectOriginalGcpObserverSerialEvidence2,
  collectOriginalGcpObserverVmEvidence2,
  collectOriginalGcpPreapplyBootstrap2,
  collectOriginalPreparedBootstrapPublisherSource2,
  collectOriginalReaderGroupClosure2,
  collectOriginalSignalFreeUnspawnedExecutions2,
  compileOriginalGcpCeTrustMaterial2,
  compileOriginalGcpObserverTrustMaterial2,
  createInstalledRuntimeResolver,
  decodeEvidenceObject,
  GoogleHttpRpcTraceParser2,
  handoffOriginalEarlyGcpVmEvidence2,
  inspectOriginalGcpInsertBodies2,
  inspectOriginalGcpInventoryScope2,
  joinOriginalGcpVmEvidence2,
  joinOriginalXcshCreationBody2,
  linuxMonotonicMs,
  monitorOriginalInputs2,
  openGcpCeHostTrustReader2,
  openGcpCeWireKeyReader2,
  openGcpCloudSerialReader2,
  openGcpObserverClientAbi2,
  openGcpObserverClientAbiRenewal2,
  openGcpObserverHostTrustReader2,
  openGcpObserverImageReader2,
  openGcpObserverWireKeyReader2,
  openGoogleAdcSession,
  openInstalledGcpObserverImageReader2,
  openInstalledInitialInventory2,
  openInstalledProviderReader2,
  openInstalledXcshCreationReader2,
  openOriginalGcpCeKeyScanCommand2,
  openOriginalGcpCeSliTarget2,
  openOriginalGcpObserverClientAbiCommand2,
  openOriginalGcpObserverClientAbiRenewalCommand2,
  openOriginalGcpObserverClientInstallation2,
  owned,
  persistOriginalReaderGroupSet2,
  prepareOriginalGcpCampaignAccess,
  prepareOriginalGcpInventoryScope2,
  publishOriginalGcpBootstrapGrant2,
  readCaptureCleanupAttemptResourceFields2,
  readOriginalApplyGcpInventory2,
  readOriginalEarlyGcpInsertBodies2,
  readOriginalEarlyGcpInsertIdentity2,
  readOriginalEarlyGcpSerialSource2,
  readOriginalEarlyGcpVmEvidence2,
  readOriginalExecutionPrefix2,
  readOriginalFinalGcpSerialSource2,
  readOriginalFinalGcpVmEvidence2,
  readOriginalGcpCeHostTrust2,
  readOriginalGcpCeKeyScanCommand2,
  readOriginalGcpCeSliSerialSource2,
  readOriginalGcpCeSliTarget2,
  readOriginalGcpCeTrustMaterial2,
  readOriginalGcpCeWireKeys2,
  readOriginalGcpInsertWitnesses2,
  readOriginalGcpObserverClientAbi2,
  readOriginalGcpObserverClientAbiRenewal2,
  readOriginalGcpObserverClientAbiRenewalCommand2,
  readOriginalGcpObserverClientInstallation2,
  readOriginalGcpObserverHostTrust2,
  readOriginalGcpObserverImageEvidence2,
  readOriginalGcpObserverInsertIdentity2,
  readOriginalGcpObserverSerialSource2,
  readOriginalGcpObserverTrustMaterial2,
  readOriginalGcpObserverVmEvidence2,
  readOriginalGcpObserverWireKeys2,
  readOriginalGcpPreapplyBootstrapJwt2,
  readOriginalGoogleHttpResponseSource2,
  readOriginalGoogleHttpRpcSource2,
  readOriginalInstalledProviderWindow2,
  readOriginalInstalledProviderWindowClock2,
  readOriginalInstalledXcshCreation2,
  readOriginalQualifiedGcpCeObserverScanContext2,
  readOriginalTerraformApplyHookSource2,
  readOriginalXcshCreationBody2,
  readOriginalXcshCreationBodyProviderProfile2,
  resolveInstalledGcpVersionProfile,
  signalFreeTerraformExecutor,
  TerraformApplyHookParser2,
  TerraformRunner,
  withFinalCheck,
} from './chunk-bw2mctgy.js';
import {
  assertInstalledGcpSshClientSetup,
  collectInstalledCeInsertWitnesses2,
  collectInstalledObserverInsertWitnesses2,
  collectInstalledOriginalBootstrapReaderSources2,
  collectInstalledOriginalCeAudit2,
  collectInstalledOriginalGuestReaderClosures2,
  collectInstalledOriginalGuestRound2,
  collectInstalledOriginalObserverAudit2,
  createInstalledGcpCaptureFactory2,
  joinOriginalGcpBootstrapVm2,
  joinOriginalGcpInsertAuditEvidence2,
  openInstalledApplyTraceStage2,
  openInstalledBootstrapCapture2,
  openInstalledDeleteCapture2,
  openInstalledFinalGuestWorker2,
  openInstalledGcpGuestBinding2,
  openInstalledGuestWorker2,
  openInstalledVmCapture2,
  scheduleInstalledBeforeGuestRound2,
} from './chunk-ghq3w9rn.js';

var hash = (value) => createHash('sha256').update(value).digest('hex');
var sha256 = /^[a-f0-9]{64}$/;
var name = /^[a-z][a-z0-9-]{0,62}$/;
var object = (value, context = 'Terraform bootstrap creation') => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`Original ${context} object required`);
  return value;
};
var issued = new WeakMap();
function labels(state, api, expected, site) {
  const declared = object(state.labels),
    actual = object(object(api.metadata).labels);
  if (
    Object.keys(declared).length !== Object.keys(expected).length ||
    Object.entries(expected).some(([key, value]) => declared[key] !== value || actual[key] !== value) ||
    Object.keys(actual).some((key) => !Object.hasOwn(expected, key) && !(site && key === 'ves.io/provider')) ||
    (site && actual['ves.io/provider'] !== 'ves-io-GOOGLE')
  )
    throw new Error('Original Terraform bootstrap owned labels or Google provider marker differ');
}
function creation(state, api, expectedName) {
  const metadata = object(api.metadata),
    uid = object(api.system_metadata).uid;
  if (
    typeof uid !== 'string' ||
    !uid ||
    state.creation_identity_sha256 !== `sha256:${hash(uid)}` ||
    state.name !== expectedName ||
    metadata.name !== expectedName ||
    state.namespace !== 'system' ||
    metadata.namespace !== 'system'
  )
    throw new Error('Original Terraform bootstrap creation identity differs');
  return uid;
}
async function collectOriginalGcpTerraformBootstrap(input) {
  const evidence = await collectBootstrap(input, '15.15.7');
  if (evidence.schemaVersion !== 1) throw new Error('Legacy bootstrap evidence schema required');
  return evidence;
}
async function collectOriginalGcpTerraformBootstrapV2(input) {
  const evidence = await collectBootstrap(input, '15.17.3');
  if (evidence.schemaVersion !== 2) throw new Error('Version 2 bootstrap evidence schema required');
  return evidence;
}
async function collectOriginalGcpTerraformBootstrapV3(input) {
  const evidence = await collectBootstrap(input, '15.17.6');
  if (evidence.schemaVersion !== 3) throw new Error('Version 3 bootstrap evidence schema required');
  return evidence;
}
async function collectBootstrap(input, providerVersion) {
  input = { ...input, environment: { ...input.environment } };
  const platform = Object.freeze({ ...input.platform });
  if (
    typeof platform.assertBody !== 'function' ||
    typeof platform.inspect !== 'function' ||
    typeof platform.readJwt !== 'function'
  )
    throw new Error('Verified Platform bootstrap source unavailable; update Platform');
  const binding = structuredClone(input.binding),
    receipt = structuredClone(input.receipt);
  if (
    binding.owner.provider !== 'gcp' ||
    binding.owner.engine !== 'terraform' ||
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== binding.owner.deploymentId ||
    receipt.operation ||
    receipt.actionInvocations?.length ||
    [binding.deploymentName, binding.siteName, binding.nodeName, binding.tokenName].some(
      (value) => !name.test(value),
    ) ||
    !sha256.test(receipt.planSha256) ||
    !sha256.test(receipt.configurationSha256)
  )
    throw new Error('Original Terraform bootstrap owning receipt and scope required');
  const profile = resolveInstalledGcpVersionProfile({
    terraformVersion: input.terraformVersion,
    providerLockSha256: receipt.providerLockSha256,
  });
  if (
    profile.googleVersion !== (['15.17.6', '15.17.8', '15.17.9'].includes(providerVersion) ? '8.12.0' : '8.11.0') ||
    profile.xcshVersion !== providerVersion
  )
    throw new Error('Original qualified Terraform bootstrap provider mapping required');
  await platform.assertBody(input.site);
  await platform.assertBody(input.token);
  input.signal?.throwIfAborted();
  const siteAddress = `xcsh_securemesh_site_v2.${binding.siteName.replaceAll('-', '_')}`,
    tokenAddress = `xcsh_token.${binding.nodeName.replaceAll('-', '_')}`;
  const selections = {
    [siteAddress]: ['name', 'namespace', 'labels', 'creation_identity_sha256'],
    [tokenAddress]: ['name', 'namespace', 'labels', 'creation_identity_sha256', 'site_name', 'type'],
  };
  const readState = async () =>
    structuredClone(
      await input.reader.readAppliedResourceFields(receipt, selections, { ...input.environment }, input.signal),
    );
  const state = await readState();
  if (
    state.schemaVersion !== 1 ||
    state.planSha256 !== receipt.planSha256 ||
    !sha256.test(state.stateSha256) ||
    typeof state.lineage !== 'string' ||
    !state.lineage ||
    !Number.isSafeInteger(state.serial) ||
    state.serial < 1 ||
    Object.keys(state.resources).sort().join(',') !== [siteAddress, tokenAddress].sort().join(',')
  )
    throw new Error('Original Terraform bootstrap applied state snapshot differs');
  const site = decodeEvidenceObject(input.site.bytes),
    token = decodeEvidenceObject(input.token.bytes);
  const siteState = object(state.resources[siteAddress]),
    tokenState = object(state.resources[tokenAddress]);
  const siteUid = creation(siteState, site, binding.siteName),
    tokenUid = creation(tokenState, token, binding.tokenName);
  const declared = { 'xcsh-deployment': binding.deploymentName, 'xcsh-engine': 'terraform' };
  labels(siteState, site, declared, true);
  labels(tokenState, token, { ...declared, 'xcsh-node': binding.nodeName }, false);
  const gcp = object(object(site.spec, 'GCP Site').gcp, 'GCP'),
    notManaged = object(gcp.not_managed, 'GCP not-managed');
  if (
    Object.keys(gcp).join(',') !== 'not_managed' ||
    Object.keys(notManaged).join(',') !== 'node_list' ||
    !Array.isArray(notManaged.node_list)
  )
    throw new Error('Original GCP not-managed Site wire mapping required');
  if (tokenState.site_name !== binding.siteName || tokenState.type !== 1)
    throw new Error('Original Terraform bootstrap token Site binding differs');
  await platform.inspect(input.site, input.token, { ...binding, siteUid, tokenUid });
  input.signal?.throwIfAborted();
  await platform.assertBody(input.site);
  await platform.assertBody(input.token);
  const currentState = await readState();
  input.signal?.throwIfAborted();
  if (JSON.stringify(currentState) !== JSON.stringify(state))
    throw new Error('Original Terraform bootstrap state changed during collection');
  await platform.assertBody(input.site);
  await platform.assertBody(input.token);
  const bootstrap = await platform.inspect(input.site, input.token, { ...binding, siteUid, tokenUid });
  input.signal?.throwIfAborted();
  const common = {
    kind: 'original-gcp-terraform-bootstrap-candidate',
    planSha256: receipt.planSha256,
    stateSha256: state.stateSha256,
    stateLineage: state.lineage,
    stateSerial: state.serial,
    siteAddress,
    tokenAddress,
    bootstrap,
    creationOwnershipCorroborated: true,
    gcpWireCorroborated: true,
    bootstrapOwnershipQualified: false,
  };
  const value =
    providerVersion === '15.17.9'
      ? Object.freeze({ ...common, schemaVersion: 5, xcshProviderVersion: '15.17.9' })
      : providerVersion === '15.15.7'
        ? Object.freeze({ ...common, schemaVersion: 1, xcshProviderVersion: '15.15.7' })
        : providerVersion === '15.17.8'
          ? Object.freeze({ ...common, schemaVersion: 4, xcshProviderVersion: '15.17.8' })
          : providerVersion === '15.17.6'
            ? Object.freeze({ ...common, schemaVersion: 3, xcshProviderVersion: '15.17.6' })
            : Object.freeze({ ...common, schemaVersion: 2, xcshProviderVersion: '15.17.3' });
  issued.set(value, { bootstrap, platform });
  return value;
}
async function readOriginalGcpTerraformBootstrapJwt(value) {
  const source = issued.get(value);
  if (!source) throw new Error('Original Terraform bootstrap candidate required');
  return source.platform.readJwt(source.bootstrap);
}

// plugins/terraform/src/service.ts
import { join } from 'node:path';

var TERRAFORM_SERVICE_CHANNEL = 'xcsh:ce-terraform:v1:service';
function snapshotCaptureCleanup(input, execute) {
  if (!input) return;
  if (!execute || typeof input.assertIndependentClosure !== 'function')
    throw new Error('Captured cleanup requires a compiled original executor and closure capability');
  const { assertIndependentClosure, ...fields } = input;
  const snapshot = structuredClone(fields);
  const freeze = (value) => {
    if (value && typeof value === 'object') {
      for (const row of Object.values(value)) freeze(row);
      Object.freeze(value);
    }
    return value;
  };
  return Object.freeze({ ...freeze(snapshot), assertIndependentClosure: assertIndependentClosure.bind(input) });
}
function assertCaptureCleanupSession(cleanup, owner, deployment, resume) {
  if (
    cleanup &&
    (!resume ||
      owner.provider !== 'gcp' ||
      deployment.stage !== undefined ||
      cleanup.deploymentId !== owner.deploymentId)
  )
    throw new Error('Captured cleanup requires its original GCP owning workspace and resume');
}
function freezeRuntime(options) {
  const execute = options.execute;
  const captureCleanup = snapshotCaptureCleanup(options.captureCleanup, execute);
  const planSource = options.planSource;
  if (planSource !== undefined && (planSource !== 'gcp-resource-plan-v1' || !execute))
    throw new Error('Qualified versioned plan source requires its original executor');
  const assertApplyReady = options.assertApplyReady;
  const googleAdc = options.googleAdc
    ? Object.freeze({ ...options.googleAdc, acquire: options.googleAdc.acquire })
    : undefined;
  if (googleAdc && !execute) throw new Error('Google ADC policy requires a qualified original-lifetime executor');
  return Object.freeze({ execute, googleAdc, assertApplyReady, planSource, captureCleanup });
}
function createCeTerraformService(platform, options = {}) {
  const defaults = freezeRuntime(options);
  const resolveRuntime = options.resolveRuntime;
  if (
    resolveRuntime &&
    (defaults.execute ||
      defaults.googleAdc ||
      defaults.assertApplyReady ||
      defaults.planSource ||
      defaults.captureCleanup)
  )
    throw new Error('Select one trusted runtime policy source');
  return {
    async open(owner, deployment, resume) {
      owner = structuredClone(owner);
      deployment = structuredClone(deployment);
      if (
        owner.engine !== 'terraform' ||
        deployment.engine !== 'terraform' ||
        owner.deploymentId !== deployment.deploymentId ||
        owner.provider !== deployment.scope.cloud ||
        owner.account !== deployment.scope.account ||
        owner.region !== deployment.scope.region
      )
        throw new Error('Terraform deployment and cloud ownership differ');
      assertCaptureCleanupSession(defaults.captureCleanup, owner, deployment, resume);
      const shared = await platform();
      const store = await shared.storage(owner);
      if (deployment.stage !== undefined && !/^[a-z][a-z0-9-]{0,62}$/.test(deployment.stage))
        throw new Error('Invalid Terraform stage identity');
      const directory = deployment.stage
        ? join(store.directory, 'terraform-stages', deployment.stage)
        : store.directory;
      const { execute, googleAdc, assertApplyReady, planSource, captureCleanup } = resolveRuntime
        ? freezeRuntime(
            await resolveRuntime({
              owner: structuredClone(owner),
              deployment: structuredClone(deployment),
              directory,
              resume,
              platform: shared,
            }),
          )
        : defaults;
      assertCaptureCleanupSession(captureCleanup, owner, deployment, resume);
      let adcSession;
      let originalLease;
      let retiring = false;
      let inFlight = 0;
      let disposal;
      const policy = owner.provider === 'gcp' ? googleAdc : undefined;
      const acquireAdc = () =>
        (adcSession ??= (async () => {
          if (!policy) throw new Error('Trusted Google ADC policy unavailable');
          await shared.storage(owner);
          const lease = await policy.acquire({
            owner: structuredClone(owner),
            deployment: structuredClone(deployment),
            directory,
            resume,
          });
          originalLease = Object.freeze({ ...lease, owner: structuredClone(lease.owner) });
          return openGoogleAdcSession(originalLease, {
            owner,
            directory,
            accountSha256: policy.accountSha256,
            audienceSha256: policy.audienceSha256,
            qualificationSha256: policy.qualificationSha256,
          });
        })());
      const withAdc = async (operation) => {
        if (retiring) throw new Error('Original Google ADC session is retired');
        inFlight++;
        try {
          return await operation(await acquireAdc());
        } finally {
          inFlight--;
        }
      };
      const guardedExecute =
        policy && execute
          ? (request) =>
              withAdc(async (adc) => {
                const environment = { ...request.env, ...adc.environment() };
                if (
                  request.env.GOOGLE_APPLICATION_CREDENTIALS !== undefined &&
                  request.env.GOOGLE_APPLICATION_CREDENTIALS !== environment.GOOGLE_APPLICATION_CREDENTIALS
                )
                  throw new Error('Original Google ADC source changed');
                await adc.verify(environment);
                return withFinalCheck(
                  () => execute({ ...request, env: environment }),
                  () => adc.verify(environment),
                  'Original Terraform invocation and ADC verification failed',
                );
              })
          : execute;
      const runner = new TerraformRunner(directory, guardedExecute, captureCleanup, planSource);
      if (resume) await runner.resume(deployment.deploymentId, deployment, resume === 'current' ? 'current' : 'exact');
      else await runner.prepare(deployment);
      const checkOwner = async () => {
        await shared.storage(owner);
        await captureCleanup?.assertIndependentClosure();
      };
      const checkApplyReady = async () => {
        await checkOwner();
        if (retiring) throw new Error('Original Google ADC session is retired');
        await assertApplyReady?.();
      };
      return {
        ...(assertApplyReady || captureCleanup ? { assertApplyReady: checkApplyReady } : {}),
        ...(policy
          ? {
              googleAdcEnvironment: () =>
                withAdc(async (adc) => {
                  await checkOwner();
                  const environment = adc.environment();
                  await adc.verify(environment);
                  return environment;
                }),
              closeGoogleAdc: () => {
                retiring = true;
                if (inFlight) return Promise.reject(new Error('Original Google ADC invocation is in flight'));
                if (!disposal)
                  disposal = (async () => {
                    await checkOwner();
                    if (!adcSession) return;
                    let adc;
                    try {
                      adc = await adcSession;
                    } catch {
                      if (!originalLease && policy.closeFailedAcquisition) {
                        await policy.closeFailedAcquisition();
                        return;
                      }
                      if (
                        !originalLease ||
                        originalLease.owner.deploymentId !== owner.deploymentId ||
                        originalLease.owner.engine !== owner.engine ||
                        originalLease.owner.provider !== owner.provider ||
                        originalLease.owner.account !== owner.account ||
                        originalLease.owner.region !== owner.region ||
                        typeof originalLease.closeAfterExecutorExit !== 'function'
                      )
                        throw new Error('Original Google ADC lease closure ownership unavailable');
                      await originalLease.closeAfterExecutorExit();
                      return;
                    }
                    await adc.close();
                  })().catch((error) => {
                    disposal = undefined;
                    throw error;
                  });
                return disposal;
              },
            }
          : {}),
        async readStateIdentity() {
          await checkOwner();
          return runner.readStateIdentity();
        },
        async assertApplied(receipt) {
          await checkOwner();
          return runner.assertApplied(receipt);
        },
        async readConfigurationSha256() {
          await checkOwner();
          return runner.readConfigurationSha256();
        },
        async readPlannedResourceFields(receipt, selections, env, signal) {
          await checkOwner();
          return runner.readPlannedResourceFields(receipt, selections, env, signal);
        },
        async readAppliedResourceFields(receipt, selections, env, signal) {
          await checkOwner();
          return runner.readAppliedResourceFields(receipt, selections, env, signal);
        },
        async readNoChangeResourceFields(receipt, selections, env, signal) {
          await checkOwner();
          return runner.readNoChangeResourceFields(receipt, selections, env, signal);
        },
        async readPlannedStateResourceFields(receipt, selections, env, signal) {
          await checkOwner();
          return runner.readPlannedStateResourceFields(receipt, selections, env, signal);
        },
        async readCurrentResourcePlanReceipt(env, signal) {
          await checkOwner();
          return runner.readCurrentResourcePlanReceipt(env, signal);
        },
        async readApplyCheckpoint(receipt) {
          await checkOwner();
          return runner.readApplyCheckpoint(receipt);
        },
        async readApplyAttemptResourceFields(receipt, selections, env, signal) {
          await checkOwner();
          return runner.readApplyAttemptResourceFields(receipt, selections, env, signal);
        },
        async readPlannedResourceIds(receipt, addresses, env, signal) {
          await checkOwner();
          return runner.readPlannedResourceIds(receipt, addresses, env, signal);
        },
        async readConfiguration(expectedSha256) {
          await checkOwner();
          return runner.readConfiguration(expectedSha256);
        },
        async readOutputs(names, env, signal) {
          await checkOwner();
          return runner.readOutputs(names, env, signal);
        },
        async reviseConfiguration(expectedSha256, configuration) {
          await checkOwner();
          return runner.reviseConfiguration(expectedSha256, configuration);
        },
        async reconcileApplyFromEvidence(receipt, evidenceSha256) {
          await checkOwner();
          return runner.reconcileApplyFromEvidence(receipt, evidenceSha256);
        },
        async planDestroy(env, signal) {
          await checkOwner();
          return runner.planDestroy(env, signal);
        },
        async planAction(intent, env, signal) {
          await checkOwner();
          return runner.planAction(intent, env, signal);
        },
        async plan(env, signal) {
          await checkOwner();
          return runner.plan(env, signal);
        },
        async apply(receipt, env, signal) {
          signal?.throwIfAborted();
          await checkApplyReady();
          signal?.throwIfAborted();
          await runner.apply(receipt, env, signal);
        },
      };
    },
  };
}
function registerCeTerraformService(bus, service) {
  return bus.on(TERRAFORM_SERVICE_CHANNEL, (data) => {
    if (!data || typeof data !== 'object') return;
    const request = data;
    if (request.version === 1 && typeof request.resolve === 'function') request.resolve(service);
  });
}
function requestPlatform(bus) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Platform CE service is required for Terraform ownership')), 5000);
    try {
      bus.emit('xcsh:ce-platform:v2:service', {
        version: 2,
        resolve: (service) => {
          clearTimeout(timer);
          resolve(service);
        },
      });
    } catch {
      clearTimeout(timer);
      reject(new Error('Platform CE service is unavailable'));
    }
  });
}

// plugins/terraform/src/installed-cleanup-executor.ts
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, join as join2, resolve } from 'node:path';

// plugins/terraform/src/pending-original-verification.ts
function sharePendingOriginalVerification(verify, assertAvailable) {
  if (typeof verify !== 'function' || typeof assertAvailable !== 'function')
    throw new Error('Original verification and availability guards required');
  const slots = {};
  let refused = false;
  let refusal;
  const latch = (error) => {
    if (!refused) {
      refused = true;
      refusal = error;
    }
    return refusal;
  };
  const check = () => {
    if (refused) throw refusal;
    try {
      assertAvailable();
    } catch (error) {
      throw latch(error);
    }
  };
  return async (verifyBytes = true) => {
    if (typeof verifyBytes !== 'boolean') throw new Error('Original verification mode required');
    check();
    const mode = verifyBytes ? 'full' : 'identity';
    let pending = slots[mode];
    if (!pending) {
      pending = Promise.resolve()
        .then(async () => {
          check();
          await verify(verifyBytes);
          check();
        })
        .catch((error) => {
          throw latch(error);
        });
      slots[mode] = pending;
      const current = pending;
      const clear = () => {
        if (slots[mode] === current) delete slots[mode];
      };
      pending.then(clear, clear);
    }
    await pending;
    check();
  };
}

// plugins/terraform/src/installed-cleanup-executor.ts
function createInstalledCleanupExecutor(options) {
  const directory = options.directory;
  const diagnosticsDirectory = options.diagnosticsDirectory;
  if (
    !isAbsolute(directory) ||
    resolve(directory) !== directory ||
    !isAbsolute(diagnosticsDirectory) ||
    resolve(diagnosticsDirectory) !== diagnosticsDirectory ||
    directory === diagnosticsDirectory ||
    diagnosticsDirectory === join2(directory, '.terraform-executor-lock') ||
    diagnosticsDirectory.startsWith(`${join2(directory, '.terraform-executor-lock')}/`) ||
    typeof options.assertInputs !== 'function' ||
    (options.assertInputIdentity !== undefined && typeof options.assertInputIdentity !== 'function') ||
    typeof options.assertIndependentClosure !== 'function'
  )
    throw new Error('Original cleanup workspace, separate diagnostics and source guards required');
  const python = Object.freeze({ ...options.python });
  const terraform = Object.freeze({ ...options.terraform });
  const assertInputs = options.assertInputs.bind(options);
  const assertIndependentClosure = options.assertIndependentClosure.bind(options);
  const assertInputIdentity = options.assertInputIdentity?.bind(options);
  const start = linuxMonotonicMs(),
    deadline = start + 7200000;
  let active = false,
    retired = false;
  const inspect = async (path) => {
    const value = await lstat(path, { bigint: true });
    if (
      !value.isDirectory() ||
      value.isSymbolicLink() ||
      value.uid !== BigInt(process.getuid?.() ?? -1) ||
      (value.mode & 0o777n) !== 0o700n ||
      (await realpath(path)) !== path
    )
      throw new Error('Original private cleanup directory required');
    return value;
  };
  const roots = Promise.all([inspect(directory), inspect(diagnosticsDirectory)]);
  roots.catch(() => {});
  const verify = async (verifyBytes = true) => {
    if (retired) throw new Error('Original cleanup executor is retired');
    const originals = await roots;
    for (const [index, path] of [directory, diagnosticsDirectory].entries()) {
      const current = await inspect(path),
        original = originals[index];
      if (
        !original ||
        current.dev !== original.dev ||
        current.ino !== original.ino ||
        current.uid !== original.uid ||
        current.mode !== original.mode
      )
        throw new Error('Original cleanup directory identity changed');
    }
    await (verifyBytes ? assertInputs : (assertInputIdentity ?? assertInputs))();
    await assertIndependentClosure();
    await (assertInputIdentity ?? assertInputs)();
  };
  const guard = sharePendingOriginalVerification(verify, () => {
    if (retired) throw new Error('Original cleanup executor is retired');
  });
  return async (invocation) => {
    if (active || retired) throw new Error('Original cleanup executor remains active or retired');
    if (
      invocation.cwd !== directory ||
      !['version', 'init', 'validate', 'plan', 'show', 'output', 'apply'].includes(invocation.args[0]) ||
      invocation.args.some((arg) => arg.startsWith('-chdir') || arg.startsWith('-state=') || arg === '-auto-approve') ||
      (invocation.args[0] === 'apply' && invocation.args.at(-1) !== 'saved.tfplan')
    )
      throw new Error('Cleanup invocation escaped its original runner workspace');
    invocation.signal?.throwIfAborted();
    if (linuxMonotonicMs() >= deadline) throw new Error('Original cleanup operation budget exhausted');
    active = true;
    try {
      await guard(false);
      const commandDirectory = join2(diagnosticsDirectory, randomUUID());
      await mkdir(commandDirectory, { mode: 448 });
      const execute = signalFreeTerraformExecutor({
        python,
        executable: terraform,
        originalStartMs: start,
        originalDeadlineMs: deadline,
        ...(invocation.args[0] === 'apply' ? {} : { timeoutMs: 60000 }),
        assertOriginal: guard,
        ...(assertInputIdentity
          ? { assertOriginalIdentity: () => guard(false), assertFinalInputs: () => guard() }
          : {}),
        finalCapture: async (capture) => {
          await writeFile(join2(commandDirectory, 'cleanup-final.private.json'), JSON.stringify(capture), {
            flag: 'wx',
            mode: 256,
          });
        },
      });
      const result = await execute({
        ...invocation,
        cwd: commandDirectory,
        args: [`-chdir=${directory}`, ...invocation.args],
      });
      await guard(false);
      return result;
    } catch (error) {
      retired = true;
      throw error;
    } finally {
      active = false;
    }
  };
}

// plugins/terraform/src/index.ts
function factory(pi) {
  pi.setLabel('Terraform CE lifecycle execution');
  const service = createCeTerraformService(() => requestPlatform(pi.events), {
    resolveRuntime: createInstalledRuntimeResolver(process.env, { capture: createInstalledGcpCaptureFactory2() }),
  });
  registerCeTerraformService(pi.events, {
    ...service,
    prepareGcpCaptureAccess: async (owner, request) => {
      owner = structuredClone(owner);
      request = structuredClone(request);
      if (owner.provider !== 'gcp' || owner.engine !== 'terraform')
        throw new Error('GCP Terraform access scope required');
      await assertInstalledRuntime2();
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
    assertNewRuntime: async (provider) => {
      if (provider === 'gcp') {
        await assertInstalledRuntime2();
        await assertInstalledGcpSshClientSetup();
      }
    },
  });
}

export {
  acknowledgeOriginalApplyGroupClosure2 as acknowledgeOriginalApplyGroupClosure,
  assertInstalledRuntime2 as assertInstalledRuntime,
  assertOriginalApplyGcpInventoryCallback2 as assertOriginalApplyGcpInventoryCallback,
  assertOriginalApplyGroupClosed2 as assertOriginalApplyGroupClosed,
  assertOriginalGcpCeHostTrustContext2 as assertOriginalGcpCeHostTrustContext,
  assertOriginalGcpCeWireKeysContext2 as assertOriginalGcpCeWireKeysContext,
  assertOriginalGcpInventoryInputs2 as assertOriginalGcpInventoryInputs,
  assertOriginalGcpInventoryScope2 as assertOriginalGcpInventoryScope,
  assertOriginalGcpObserverClientAbiContext2 as assertOriginalGcpObserverClientAbiContext,
  assertOriginalGcpObserverClientAbiRenewalContext2 as assertOriginalGcpObserverClientAbiRenewalContext,
  assertOriginalGcpObserverClientInstallationContext2 as assertOriginalGcpObserverClientInstallationContext,
  assertOriginalGcpObserverInsertContext2 as assertOriginalGcpObserverInsertContext,
  assertOriginalGcpPreapplyBootstrapContext2 as assertOriginalGcpPreapplyBootstrapContext,
  assertOriginalInstalledGcpCloudReader2 as assertOriginalInstalledGcpCloudReader,
  assertOriginalInstalledGcpFinalImageReader2 as assertOriginalInstalledGcpFinalImageReader,
  assertOriginalQualifiedGcpObserverClientsContext2 as assertOriginalQualifiedGcpObserverClientsContext,
  assertOriginalReaderGroupClosure2 as assertOriginalReaderGroupClosure,
  assertOriginalReaderGroupInputs2 as assertOriginalReaderGroupInputs,
  bindOriginalGcpObserverFinalImage2 as bindOriginalGcpObserverFinalImage,
  bindOriginalQualifiedGcpCeObserverScanContext2 as bindOriginalQualifiedGcpCeObserverScanContext,
  captureOriginalGcpObserverImage2 as captureOriginalGcpObserverImage,
  checkoutOriginalGcpPreapplyBootstrap2 as checkoutOriginalGcpPreapplyBootstrap,
  closeOriginalGcpCeKeyScanCommand2 as closeOriginalGcpCeKeyScanCommand,
  closeOriginalGcpInventoryScope2 as closeOriginalGcpInventoryScope,
  closeOriginalGcpObserverClientAbiCommand2 as closeOriginalGcpObserverClientAbiCommand,
  closeOriginalGcpObserverClientAbiRenewalCommand2 as closeOriginalGcpObserverClientAbiRenewalCommand,
  closeOriginalGcpObserverClientInstallation2 as closeOriginalGcpObserverClientInstallation,
  collectInstalledCeInsertWitnesses2 as collectInstalledCeInsertWitnesses,
  collectInstalledObserverInsertWitnesses2 as collectInstalledObserverInsertWitnesses,
  collectInstalledOriginalAccessReaderSource2 as collectInstalledOriginalAccessReaderSource,
  collectInstalledOriginalAccessReaderSources2 as collectInstalledOriginalAccessReaderSources,
  collectInstalledOriginalBootstrapReaderSources2 as collectInstalledOriginalBootstrapReaderSources,
  collectInstalledOriginalCeAudit2 as collectInstalledOriginalCeAudit,
  collectInstalledOriginalGuestReaderClosures2 as collectInstalledOriginalGuestReaderClosures,
  collectInstalledOriginalGuestRound2 as collectInstalledOriginalGuestRound,
  collectInstalledOriginalObserverAudit2 as collectInstalledOriginalObserverAudit,
  collectInstalledOriginalXcshReaderClosures2 as collectInstalledOriginalXcshReaderClosures,
  collectOriginalBootstrapPublisherSource2 as collectOriginalBootstrapPublisherSource,
  collectOriginalEarlyGcpInsertIdentity2 as collectOriginalEarlyGcpInsertIdentity,
  collectOriginalEarlyGcpSerialEvidence2 as collectOriginalEarlyGcpSerialEvidence,
  collectOriginalEarlyGcpVmEvidence2 as collectOriginalEarlyGcpVmEvidence,
  collectOriginalFinalGcpSerialEvidence2 as collectOriginalFinalGcpSerialEvidence,
  collectOriginalGcpInsertWitnesses2 as collectOriginalGcpInsertWitnesses,
  collectOriginalGcpObserverInsertIdentity2 as collectOriginalGcpObserverInsertIdentity,
  collectOriginalGcpObserverSerialEvidence2 as collectOriginalGcpObserverSerialEvidence,
  collectOriginalGcpObserverVmEvidence2 as collectOriginalGcpObserverVmEvidence,
  collectOriginalGcpPreapplyBootstrap2 as collectOriginalGcpPreapplyBootstrap,
  collectOriginalGcpTerraformBootstrap,
  collectOriginalGcpTerraformBootstrapV2,
  collectOriginalGcpTerraformBootstrapV3,
  collectOriginalPreparedBootstrapPublisherSource2 as collectOriginalPreparedBootstrapPublisherSource,
  collectOriginalReaderGroupClosure2 as collectOriginalReaderGroupClosure,
  collectOriginalSignalFreeUnspawnedExecutions2 as collectOriginalSignalFreeUnspawnedExecutions,
  compileOriginalGcpCeTrustMaterial2 as compileOriginalGcpCeTrustMaterial,
  compileOriginalGcpObserverTrustMaterial2 as compileOriginalGcpObserverTrustMaterial,
  createInstalledCleanupExecutor,
  factory as default,
  GoogleHttpRpcTraceParser2 as GoogleHttpRpcTraceParser,
  handoffOriginalEarlyGcpVmEvidence2 as handoffOriginalEarlyGcpVmEvidence,
  inspectOriginalGcpInsertBodies2 as inspectOriginalGcpInsertBodies,
  inspectOriginalGcpInventoryScope2 as inspectOriginalGcpInventoryScope,
  joinOriginalGcpBootstrapVm2 as joinOriginalGcpBootstrapVm,
  joinOriginalGcpInsertAuditEvidence2 as joinOriginalGcpInsertAuditEvidence,
  joinOriginalGcpVmEvidence2 as joinOriginalGcpVmEvidence,
  joinOriginalXcshCreationBody2 as joinOriginalXcshCreationBody,
  monitorOriginalInputs2 as monitorOriginalInputs,
  openGcpCeHostTrustReader2 as openGcpCeHostTrustReader,
  openGcpCeWireKeyReader2 as openGcpCeWireKeyReader,
  openGcpCloudSerialReader2 as openGcpCloudSerialReader,
  openGcpObserverClientAbi2 as openGcpObserverClientAbi,
  openGcpObserverClientAbiRenewal2 as openGcpObserverClientAbiRenewal,
  openGcpObserverHostTrustReader2 as openGcpObserverHostTrustReader,
  openGcpObserverImageReader2 as openGcpObserverImageReader,
  openGcpObserverWireKeyReader2 as openGcpObserverWireKeyReader,
  openInstalledApplyTraceStage2 as openInstalledApplyTraceStage,
  openInstalledBootstrapCapture2 as openInstalledBootstrapCapture,
  openInstalledDeleteCapture2 as openInstalledDeleteCapture,
  openInstalledFinalGuestWorker2 as openInstalledFinalGuestWorker,
  openInstalledGcpGuestBinding2 as openInstalledGcpGuestBinding,
  openInstalledGcpObserverImageReader2 as openInstalledGcpObserverImageReader,
  openInstalledGuestWorker2 as openInstalledGuestWorker,
  openInstalledInitialInventory2 as openInstalledInitialInventory,
  openInstalledProviderReader2 as openInstalledProviderReader,
  openInstalledVmCapture2 as openInstalledVmCapture,
  openInstalledXcshCreationReader2 as openInstalledXcshCreationReader,
  openOriginalGcpCeKeyScanCommand2 as openOriginalGcpCeKeyScanCommand,
  openOriginalGcpCeSliTarget2 as openOriginalGcpCeSliTarget,
  openOriginalGcpObserverClientAbiCommand2 as openOriginalGcpObserverClientAbiCommand,
  openOriginalGcpObserverClientAbiRenewalCommand2 as openOriginalGcpObserverClientAbiRenewalCommand,
  openOriginalGcpObserverClientInstallation2 as openOriginalGcpObserverClientInstallation,
  owned as readOwnedInstalledInput,
  persistOriginalReaderGroupSet2 as persistOriginalReaderGroupSet,
  prepareOriginalGcpInventoryScope2 as prepareOriginalGcpInventoryScope,
  publishOriginalGcpBootstrapGrant2 as publishOriginalGcpBootstrapGrant,
  readCaptureCleanupAttemptResourceFields2 as readCaptureCleanupAttemptResourceFields,
  readOriginalApplyGcpInventory2 as readOriginalApplyGcpInventory,
  readOriginalEarlyGcpInsertBodies2 as readOriginalEarlyGcpInsertBodies,
  readOriginalEarlyGcpInsertIdentity2 as readOriginalEarlyGcpInsertIdentity,
  readOriginalEarlyGcpSerialSource2 as readOriginalEarlyGcpSerialSource,
  readOriginalEarlyGcpVmEvidence2 as readOriginalEarlyGcpVmEvidence,
  readOriginalExecutionPrefix2 as readOriginalExecutionPrefix,
  readOriginalFinalGcpSerialSource2 as readOriginalFinalGcpSerialSource,
  readOriginalFinalGcpVmEvidence2 as readOriginalFinalGcpVmEvidence,
  readOriginalGcpCeHostTrust2 as readOriginalGcpCeHostTrust,
  readOriginalGcpCeKeyScanCommand2 as readOriginalGcpCeKeyScanCommand,
  readOriginalGcpCeSliSerialSource2 as readOriginalGcpCeSliSerialSource,
  readOriginalGcpCeSliTarget2 as readOriginalGcpCeSliTarget,
  readOriginalGcpCeTrustMaterial2 as readOriginalGcpCeTrustMaterial,
  readOriginalGcpCeWireKeys2 as readOriginalGcpCeWireKeys,
  readOriginalGcpInsertWitnesses2 as readOriginalGcpInsertWitnesses,
  readOriginalGcpObserverClientAbi2 as readOriginalGcpObserverClientAbi,
  readOriginalGcpObserverClientAbiRenewal2 as readOriginalGcpObserverClientAbiRenewal,
  readOriginalGcpObserverClientAbiRenewalCommand2 as readOriginalGcpObserverClientAbiRenewalCommand,
  readOriginalGcpObserverClientInstallation2 as readOriginalGcpObserverClientInstallation,
  readOriginalGcpObserverHostTrust2 as readOriginalGcpObserverHostTrust,
  readOriginalGcpObserverImageEvidence2 as readOriginalGcpObserverImageEvidence,
  readOriginalGcpObserverInsertIdentity2 as readOriginalGcpObserverInsertIdentity,
  readOriginalGcpObserverSerialSource2 as readOriginalGcpObserverSerialSource,
  readOriginalGcpObserverTrustMaterial2 as readOriginalGcpObserverTrustMaterial,
  readOriginalGcpObserverVmEvidence2 as readOriginalGcpObserverVmEvidence,
  readOriginalGcpObserverWireKeys2 as readOriginalGcpObserverWireKeys,
  readOriginalGcpPreapplyBootstrapJwt2 as readOriginalGcpPreapplyBootstrapJwt,
  readOriginalGcpTerraformBootstrapJwt,
  readOriginalGoogleHttpResponseSource2 as readOriginalGoogleHttpResponseSource,
  readOriginalGoogleHttpRpcSource2 as readOriginalGoogleHttpRpcSource,
  readOriginalInstalledProviderWindow2 as readOriginalInstalledProviderWindow,
  readOriginalInstalledProviderWindowClock2 as readOriginalInstalledProviderWindowClock,
  readOriginalInstalledXcshCreation2 as readOriginalInstalledXcshCreation,
  readOriginalQualifiedGcpCeObserverScanContext2 as readOriginalQualifiedGcpCeObserverScanContext,
  readOriginalTerraformApplyHookSource2 as readOriginalTerraformApplyHookSource,
  readOriginalXcshCreationBody2 as readOriginalXcshCreationBody,
  readOriginalXcshCreationBodyProviderProfile2 as readOriginalXcshCreationBodyProviderProfile,
  scheduleInstalledBeforeGuestRound2 as scheduleInstalledBeforeGuestRound,
  TerraformApplyHookParser2 as TerraformApplyHookParser,
};
