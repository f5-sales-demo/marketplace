// @bun

// plugins/terraform/src/gcp-bootstrap-vm-binding.ts
// plugins/terraform/src/gcp-insert-audit-evidence.ts
import { createHash, createHash as createHash2 } from 'node:crypto';
import {
  acknowledgeOriginalApplyGroupClosure2,
  assertFinalReaderReserve,
  assertGcpTerraformRequestReason,
  assertOriginalApplyCallback,
  assertOriginalApplyGcpInventoryCallback2,
  assertOriginalApplyGroupClosed2,
  assertOriginalApplyLifetime,
  assertOriginalGcpCeHostTrustContext2,
  assertOriginalGcpCeSliTargetContext,
  assertOriginalGcpObserverCampaignKeyContext,
  assertOriginalGcpObserverClientInstallationContext2,
  assertOriginalGcpObserverHostTrustContext,
  assertOriginalGcpObserverInsertContext2,
  assertOriginalGcpObserverVmCaptureCallback,
  assertOriginalGcpPreapplyBootstrapCallback,
  assertOriginalGcpPreapplyBootstrapContext2,
  assertOriginalGcpVmCaptureCallback,
  assertOriginalInstalledGcpCloudReader2,
  assertOriginalInstalledGcpFinalCloudReader,
  assertOriginalQualifiedGcpObserverClientsContext2,
  assertOriginalReaderGroupInputs2,
  assertOriginalTerraformPlanProjection,
  assertPreparedCreationScopeClosureInputs,
  assertPreparedCreationScopeContext,
  assertPreparedCreationScopeInputs,
  assertSameOriginalInput,
  bindOriginalAccessReaderCollection,
  bindOriginalGcpObserverFinalImage2,
  bindOriginalQualifiedGcpCeObserverScanContext2,
  bindOriginalTerraformPlanInputs,
  captureOriginalGcpObserverImage2,
  closeOriginalGcpCeKeyScanCommand2,
  closeOriginalGcpInventoryScope2,
  closeOriginalGcpObserverCampaignKey,
  closeOriginalGcpObserverClientAbiCommand2,
  closeOriginalGcpObserverClientAbiRenewalCommand2,
  closeOriginalGcpObserverClientDeliveryCommand,
  closeOriginalGcpObserverClientInstallation2,
  closeOriginalGcpObserverClientPayload,
  closeOriginalGcpObserverSshCommand,
  closeOriginalGcpSshClientProfile,
  collectInstalledOriginalAccessReaderSources2,
  collectInstalledOriginalXcshReaderClosures2,
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
  compileOriginalGcpCeTrustMaterial2,
  compileOriginalGcpObserverTrustMaterial2,
  corroborateOriginalGoogleRpcProvider,
  decodeEvidenceObject,
  fingerprint,
  freezeAdmittedCaptureInputs,
  GoogleHttpRpcTraceParser2,
  GoogleProviderLifecycleParser,
  gcp_capture_source_pins_default,
  gcp_ssh_client_pins_default,
  handoffOriginalEarlyGcpVmEvidence2,
  hasAuditControlCharacters,
  inspectFinalReaderReserve,
  inspectOriginalGcpInsertBodies2,
  inspectOriginalGcpInventoryScope2,
  inspectPreparedCreationScope,
  installed_runtime_pins_default,
  isEvidenceRfc3339,
  isOriginalApplyLifetimeEnd,
  isOriginalApplyLifetimeExpiry,
  joinOriginalFinalXcshCreationBody,
  joinOriginalGcpVmEvidence2,
  joinOriginalXcshCreationBody2,
  linuxMonotonicMs,
  monitorOriginalInputs2,
  openGcpCeHostTrustReader2,
  openGcpCeWireKeyReader2,
  openGcpObserverClientAbi2,
  openGcpObserverClientAbiRenewal2,
  openGcpObserverClientDelivery,
  openGcpObserverHostTrustReader2,
  openGcpObserverSshPeer,
  openGcpObserverWireKeyReader2,
  openGcpSshClientProfile,
  openInstalledGcpCloudSerialReader,
  openInstalledGcpObserverImageReader2,
  openInstalledInitialInventory2,
  openInstalledProviderReader2,
  openInstalledXcshCreationReader2,
  openOriginalGcpCeKeyScanCommand2,
  openOriginalGcpCeSliTarget2,
  openOriginalGcpObserverCampaignKey,
  openOriginalGcpObserverClientAbiCommand2,
  openOriginalGcpObserverClientAbiRenewalCommand2,
  openOriginalGcpObserverClientDeliveryCommand,
  openOriginalGcpObserverClientInstallation2,
  openOriginalGcpObserverClientPayload,
  openOriginalGcpObserverSshCommand,
  openOriginalGcpObserverSshInputLease,
  owned,
  persistOriginalReaderGroupSet2,
  prepareOriginalCreationScope,
  prepareOriginalGcpInventoryScope2,
  publicTerraformCloudScope,
  publicTerraformPlatformScope,
  publishOriginalGcpBootstrapGrant2,
  readOriginalApplyGcpInventory2,
  readOriginalCompletedOutputInputs,
  readOriginalEarlyGcpInsertBodies2,
  readOriginalEarlyGcpInsertIdentity2,
  readOriginalEarlyGcpSerialSource2,
  readOriginalEarlyGcpVmEvidence2,
  readOriginalExecutionChunk,
  readOriginalExecutionPrefix2,
  readOriginalFinalGcpSerialSource2,
  readOriginalFinalGcpVmEvidence2,
  readOriginalGcpCampaignAccess,
  readOriginalGcpCeHostTrust2,
  readOriginalGcpCeSliSerialSource2,
  readOriginalGcpCeSliTarget2,
  readOriginalGcpCeWireKeys2,
  readOriginalGcpInsertSourceBodies,
  readOriginalGcpInsertWitnesses2,
  readOriginalGcpObserverAuditSource,
  readOriginalGcpObserverClientInstallation2,
  readOriginalGcpObserverSerialSource2,
  readOriginalGcpObserverSshCommand,
  readOriginalGcpObserverVmEvidence2,
  readOriginalGcpPreapplyBootstrapJwt2,
  readOriginalGcpPreapplySiteAccess,
  readOriginalGcpSshClientProfile,
  readOriginalGoogleHttpResponseSource2,
  readOriginalGoogleHttpRpcSource2,
  readOriginalGoogleProviderRpcSource,
  readOriginalInstalledXcshCreation2,
  readOriginalTerraformApplyHookSource2,
  resolveInstalledGcpVersionProfile,
  signalFreeBootstrapSource,
  signalFreeFinalGuestWorkerExecutor,
  signalFreeTerraformExecutor,
  TerraformApplyHookParser2,
  validateIntent,
} from './chunk-81ghzv3w.js';

var hash = (value) => createHash('sha256').update(value).digest('hex');
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Original insert audit object required');
  return value;
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function computeLink(value) {
  if (typeof value !== 'string' || value !== value.trim() || hasAuditControlCharacters(value))
    throw new Error('Original scoped audit response link required');
  if (value.startsWith('projects/')) return value;
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    !['www.googleapis.com', 'compute.googleapis.com'].includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.startsWith('/compute/v1/projects/')
  )
    throw new Error('Original scoped audit response link differs');
  return url.pathname.slice('/compute/v1/'.length);
}
function requestAttributes(payload) {
  if (payload.requestMetadata === undefined) return {};
  const attributes = object(payload.requestMetadata).requestAttributes;
  return attributes === undefined ? {} : object(attributes);
}
function matchOriginalAuditPair(entries, source, vm, audit, account, canIpForward) {
  const [first, last] = entries;
  for (const [index, entry] of entries.entries()) {
    const payload = object(entry.protoPayload),
      operation = object(entry.operation);
    const labels = object(object(entry.resource).labels);
    const status = object(payload.status);
    const auth = object(payload.authenticationInfo);
    if (
      labels.instance_id !== vm.instanceId ||
      operation.id !== source.operationName ||
      operation.producer !== 'compute.googleapis.com' ||
      (index === 0
        ? operation.first !== true || operation.last === true
        : operation.last !== true || operation.first === true) ||
      typeof auth.principalEmail !== 'string' ||
      hash(auth.principalEmail) !== account ||
      (auth.serviceAccountDelegationInfo !== undefined &&
        (!Array.isArray(auth.serviceAccountDelegationInfo) || auth.serviceAccountDelegationInfo.length > 0)) ||
      (status.code !== undefined && status.code !== 0) ||
      Object.keys(status).some((key) => key !== 'code') ||
      !isEvidenceRfc3339(entry.timestamp) ||
      Date.parse(entry.timestamp) < vm.absenceStartedAt ||
      Date.parse(entry.timestamp) > Math.max(...audit.pages.map((page) => page.finishedAt))
    )
      throw new Error('Original successful audit operation name, principal or numeric VM differs');
  }
  if (Date.parse(first.timestamp) > Date.parse(last.timestamp))
    throw new Error('Original audit first/last chronology differs');
  const payload = object(first.protoPayload);
  const attributes = requestAttributes(payload);
  if (
    typeof attributes.reason !== 'string' ||
    !attributes.reason ||
    hash(attributes.reason) !== source.requestReasonSha256
  )
    throw new Error('Original audit request reason is unavailable or differs');
  const lastMetadata = object(last.protoPayload).requestMetadata;
  if (lastMetadata !== undefined) {
    const attributes = requestAttributes(object(last.protoPayload));
    if (
      attributes.reason !== undefined &&
      (typeof attributes.reason !== 'string' || hash(attributes.reason) !== source.requestReasonSha256)
    )
      throw new Error('Original final audit request reason differs');
  }
  const response = object(payload.response),
    request = object(payload.request);
  if (
    response.id !== source.operationId ||
    response.name !== source.operationName ||
    response.targetId !== vm.instanceId ||
    response.operationType !== 'insert' ||
    computeLink(response.zone) !== `projects/${source.project}/zones/${source.zone}` ||
    computeLink(response.selfLink) !==
      `projects/${source.project}/zones/${source.zone}/operations/${source.operationName}` ||
    computeLink(response.targetLink) !==
      `projects/${source.project}/zones/${source.zone}/instances/${source.nodeName}` ||
    response.error !== undefined ||
    !['PENDING', 'RUNNING', 'DONE'].includes(response.status) ||
    request.name !== source.nodeName ||
    request.canIpForward !== canIpForward ||
    hash(canonical(object(request.labels))) !== source.labelsSha256
  )
    throw new Error('Original audit response or requested ownership differs');
  return { firstSha256: hash(canonical(first)), lastSha256: hash(canonical(last)) };
}
async function joinOriginalGcpInsertAuditEvidence2(input) {
  const { reader, source, audit } = input;
  readOriginalGcpInsertSourceBodies(source);
  const retained = await reader.readAuditEvidence(audit);
  if (
    audit.project !== source.project ||
    audit.zone !== source.zone ||
    audit.node !== source.nodeName ||
    !retained.pages.length ||
    retained.pages.length !== audit.pages.length ||
    retained.pages.some(
      (page, index) =>
        page.scope.project !== source.project ||
        page.scope.zone !== source.zone ||
        page.scope.node !== source.nodeName ||
        Date.now() < audit.pages[index].finishedAt ||
        Date.now() - audit.pages[index].finishedAt > 300000,
    )
  )
    throw new Error('Fresh original scoped audit evidence required');
  const entries = retained.pages
    .flatMap((page) => {
      const decoded = decodeEvidenceObject(page.raw);
      return decoded.entries ?? [];
    })
    .map(object);
  if (entries.length !== 2) throw new Error('One unambiguous original insert audit first/last pair required');
  const vm = await joinOriginalGcpVmEvidence2(input);
  const account = retained.pages[0].authentication.accountSha256;
  if (account !== vm.accountSha256) throw new Error('Original source/cloud/audit principal differs');
  const pair = matchOriginalAuditPair(entries, source, vm, audit, account, true);
  await reader.readAuditEvidence(audit);
  const finalVm = await reader.instance(input.instance.zone, input.instance.name);
  if (!finalVm.present || finalVm.value.id !== vm.instanceId)
    throw new Error('Original VM changed during audit correlation');
  readOriginalGcpInsertSourceBodies(source);
  return Object.freeze({
    ...vm,
    kind: 'original-gcp-instance-audit-candidate',
    auditCorroborated: true,
    auditQuerySha256: audit.querySha256,
    auditPageSha256s: Object.freeze(audit.pages.map((page) => page.sha256)),
    auditFirstSha256: pair.firstSha256,
    auditLastSha256: pair.lastSha256,
    requestReasonSha256: source.requestReasonSha256,
    applyRpcQualified: false,
    originalInsertQualified: false,
  });
}
async function collectInstalledOriginalCeAudit2(input) {
  const { callback, reader, source, baseline } = input;
  await assertOriginalApplyCallback(callback);
  if (callback.phase !== 'after' || !callback.reserve) throw new Error('Original final CE audit callback required');
  await assertOriginalApplyGcpInventoryCallback2(baseline, callback);
  await assertOriginalInstalledGcpFinalCloudReader(reader, callback);
  readOriginalGcpInsertSourceBodies(source);
  const inventory = await readOriginalApplyGcpInventory2(baseline, callback);
  const rows = inventory.cloud.filter(
    (row) =>
      row.address === source.resourceAddress &&
      row.role === 'ce' &&
      row.target.kind === 'instance' &&
      row.target.name === source.nodeName &&
      row.target.zone === source.zone,
  );
  if (rows.length !== 1) throw new Error('Original CE audit baseline target required');
  const operation = await reader.insertOperation(source.zone, source.operationName, source.nodeName);
  const instance = await reader.instance(source.zone, source.nodeName);
  if (!instance.present) throw new Error('Original CE audit instance unavailable');
  const audit = await reader.insertAudit(source.zone, source.nodeName, {
    after: new Date(rows[0].evidence.startedAt).toISOString(),
    before: new Date(Date.now()).toISOString(),
  });
  await assertOriginalApplyCallback(callback);
  return joinOriginalGcpInsertAuditEvidence2({
    source,
    reader,
    baseline,
    callback,
    operation,
    instance,
    audit,
  });
}
async function collectInstalledOriginalObserverAudit2(input) {
  const { identity, callback, baseline, reader } = input;
  await assertOriginalApplyCallback(callback);
  if (callback.phase !== 'after' || !callback.reserve)
    throw new Error('Original final observer audit callback required');
  await assertOriginalInstalledGcpFinalCloudReader(reader, callback);
  const original = await readOriginalGcpObserverAuditSource(identity, callback, baseline);
  const vm = await assertOriginalGcpObserverVmCaptureCallback(input.vm, callback);
  const source = {
    project: original.value.project,
    zone: original.value.zone,
    nodeName: original.value.name,
    operationId: original.value.operationId,
    operationName: original.value.operationName,
    requestReasonSha256: original.requestReasonSha256,
    labelsSha256: hash(canonical(object(decodeEvidenceObject(Buffer.from(original.requestBody)).labels))),
  };
  const inventory = await readOriginalApplyGcpInventory2(baseline, callback);
  const rows = inventory.cloud.filter(
    (row) =>
      row.address === original.value.address &&
      row.role === 'observer' &&
      row.target.kind === 'instance' &&
      row.target.name === source.nodeName &&
      row.target.zone === source.zone,
  );
  if (
    rows.length !== 1 ||
    (original.value.targetId !== null && vm.instanceId !== original.value.targetId) ||
    vm.operationId !== source.operationId
  )
    throw new Error('Original observer audit VM and baseline differ');
  const audit = await reader.insertAudit(source.zone, source.nodeName, {
    after: new Date(rows[0].evidence.startedAt).toISOString(),
    before: new Date(Date.now()).toISOString(),
  });
  const retained = await reader.readAuditEvidence(audit);
  if (
    !retained.pages.length ||
    retained.pages.length !== audit.pages.length ||
    audit.project !== source.project ||
    audit.zone !== source.zone ||
    audit.node !== source.nodeName ||
    retained.pages.some(
      (page, index) =>
        page.scope.project !== source.project ||
        page.scope.zone !== source.zone ||
        page.scope.node !== source.nodeName ||
        page.authentication.accountSha256 !== callback.original.authentication.accountSha256 ||
        Date.now() < audit.pages[index].finishedAt ||
        Date.now() - audit.pages[index].finishedAt > 300000,
    )
  )
    throw new Error('Fresh original observer audit pages required');
  const entries = retained.pages
    .flatMap((page) => {
      const value = decodeEvidenceObject(page.raw);
      return value.entries ?? [];
    })
    .map(object);
  if (entries.length !== 2) throw new Error('One original observer audit first/last pair required');
  const pair = matchOriginalAuditPair(
    entries,
    source,
    {
      instanceId: vm.instanceId,
      absenceStartedAt: rows[0].evidence.startedAt,
    },
    audit,
    callback.original.authentication.accountSha256,
    false,
  );
  await reader.readAuditEvidence(audit);
  const current = await assertOriginalGcpObserverVmCaptureCallback(input.vm, callback);
  if (current.instanceId !== vm.instanceId || current.diskId !== vm.diskId)
    throw new Error('Original observer changed during audit correlation');
  await readOriginalGcpObserverAuditSource(identity, callback, baseline);
  await assertOriginalApplyCallback(callback);
  return Object.freeze({
    schemaVersion: 1,
    kind: 'original-installed-observer-audit',
    role: 'observer',
    instanceId: vm.instanceId,
    diskId: vm.diskId,
    imageId: vm.imageId,
    operationId: source.operationId,
    operationName: source.operationName,
    auditCorroborated: true,
    requestReasonSha256: source.requestReasonSha256,
    auditQuerySha256: audit.querySha256,
    auditPageSha256s: Object.freeze(audit.pages.map((page) => page.sha256)),
    auditFirstSha256: pair.firstSha256,
    auditLastSha256: pair.lastSha256,
    originalInsertQualified: false,
    executionAuthorized: false,
  });
}

// plugins/terraform/src/gcp-bootstrap-vm-binding.ts
var hash2 = (value) => createHash2('sha256').update(value).digest('hex');
var object2 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Original bootstrap VM object required');
  return value;
};
var finalBootstrapOrigins = new WeakMap();
var earlyBootstrapOrigins = new WeakMap();
async function handoffOriginalEarlyGcpBootstrapVm(value, input) {
  const origin = value && typeof value === 'object' ? earlyBootstrapOrigins.get(value) : undefined;
  if (!origin) throw new Error('Original early bootstrap VM handoff source required');
  return origin.handoff(input);
}
async function readOriginalBootstrapVmJoin(input) {
  const { context, selectedCallback, selectedBootstrap, identity, selectedVm, beforeReadExpired } = input;
  const verifyCallback = () =>
    selectedCallback.phase === 'before'
      ? assertOriginalApplyLifetime(selectedCallback)
      : assertOriginalApplyCallback(selectedCallback);
  await verifyCallback();
  await context.assertInputs();
  await assertOriginalGcpPreapplyBootstrapContext2(selectedBootstrap, context);
  if (selectedCallback.phase === 'after')
    await assertOriginalGcpPreapplyBootstrapCallback(selectedBootstrap, selectedCallback);
  await assertOriginalGcpVmCaptureCallback(selectedVm, selectedCallback);
  const inserted = await readOriginalEarlyGcpInsertIdentity2(identity);
  const observed =
    selectedCallback.phase === 'after'
      ? await readOriginalFinalGcpVmEvidence2(selectedVm)
      : await readOriginalEarlyGcpVmEvidence2(selectedVm);
  const base = selectedBootstrap.bootstrap;
  if (
    fingerprint(base.owner) !== fingerprint(context.owner) ||
    base.deploymentName !== context.owner.deploymentId ||
    inserted.planSha256 !== selectedBootstrap.planSha256 ||
    inserted.project !== context.owner.account ||
    observed.project !== inserted.project ||
    observed.nodeName !== inserted.nodeName ||
    observed.nodeName !== base.nodeName ||
    observed.zone !== inserted.zone ||
    observed.resourceAddress !== inserted.address ||
    observed.sourceRequestSha256 !== inserted.requestBodySha256 ||
    observed.operationId !== inserted.operationId ||
    ['pid', 'group', 'start', 'boot'].some(
      (key) =>
        selectedBootstrap.executor[key] !== selectedCallback.execution.identity[key] ||
        inserted.executor[key] !== selectedCallback.execution.identity[key],
    )
  )
    throw new Error('Original early bootstrap VM scope or executor differs');
  const binding = context.inputs['workspace:gcp-terraform-input-identity.json'];
  if (!binding) throw new Error('Original reviewed guest intent required');
  const original = await owned(binding.path);
  assertSameOriginalInput(binding, original.binding);
  const saved = decodeEvidenceObject(original.bytes);
  if (
    saved.intentFingerprint !== fingerprint(saved.intent) ||
    saved.intent.project !== context.owner.account ||
    saved.intent.region !== context.owner.region ||
    saved.intent.deploymentName !== context.owner.deploymentId ||
    saved.intent.engine !== 'terraform' ||
    saved.intent.operation !== 'deploy'
  )
    throw new Error('Original reviewed guest intent differs');
  const sites = saved.intent.sites.filter(
    (site) => site.name === base.siteName && site.nodes.some((node) => node.name === base.nodeName),
  );
  if (sites.length !== 1) throw new Error('Original bootstrap site and node differ from review');
  const nodes = sites[0].nodes.filter((node) => node.name === base.nodeName && node.zone === observed.zone);
  if (
    nodes.length !== 1 ||
    nodes[0].interfaces.length !== 2 ||
    observed.interfaces.length !== 2 ||
    observed.interfaces.some(
      (nic, index) =>
        nic.index !== index ||
        nic.name !== `nic${index}` ||
        nic.network !== `projects/${context.owner.account}/global/networks/${nodes[0].interfaces[index].network}` ||
        nic.subnetwork !==
          `projects/${context.owner.account}/regions/${context.owner.region}/subnetworks/${nodes[0].interfaces[index].subnet}`,
    )
  )
    throw new Error('Original reviewed CE NIC mapping differs');
  const bodies = await readOriginalEarlyGcpInsertBodies2(identity);
  const request = decodeEvidenceObject(Buffer.from(bodies.requestBody));
  const metadata = object2(request.metadata),
    labels = object2(request.labels);
  if (
    labels['xcsh-site'] !== base.siteName ||
    labels['xcsh-node'] !== base.nodeName ||
    labels['xcsh-deployment'] !== base.deploymentName ||
    labels['xcsh-engine'] !== 'terraform'
  )
    throw new Error('Original VM bootstrap site labels differ');
  if (!Array.isArray(metadata.items)) throw new Error('Original token-only metadata required');
  const data = metadata.items.map(object2).filter((entry) => entry.key === 'user-data');
  const jwt = await readOriginalGcpPreapplyBootstrapJwt2(selectedBootstrap);
  if (data.length !== 1 || typeof data[0].value !== 'string' || hash2(data[0].value) !== inserted.bootstrapSha256)
    throw new Error('Original bootstrap token metadata differs');
  let config;
  try {
    config = object2(Bun.YAML.parse(data[0].value));
  } catch {
    throw new Error('Original token-only cloud-init required');
  }
  if (
    !data[0].value.startsWith('#cloud-config') ||
    Object.keys(config).join(',') !== 'write_files' ||
    !Array.isArray(config.write_files) ||
    config.write_files.length !== 1
  )
    throw new Error('Original token-only cloud-init required');
  const file = object2(config.write_files[0]);
  if (
    Object.keys(file).sort().join(',') !== 'content,owner,path,permissions' ||
    file.path !== '/etc/vpm/user_data' ||
    file.owner !== 'root' ||
    file.permissions !== '0600' ||
    typeof file.content !== 'string' ||
    file.content.trim() !== `token: ${jwt}` ||
    hash2(jwt) !== base.jwtSha256 ||
    !Number.isFinite(Date.parse(base.expiresAt)) ||
    Date.now() >= Date.parse(base.expiresAt)
  )
    throw new Error('Original unexpired bootstrap token differs');
  await assertOriginalGcpPreapplyBootstrapContext2(selectedBootstrap, context);
  await assertOriginalGcpVmCaptureCallback(selectedVm, selectedCallback);
  await readOriginalEarlyGcpInsertIdentity2(identity);
  await context.assertInputs();
  await verifyCallback();
  return Object.freeze({
    ...observed,
    siteName: base.siteName,
    expiresAt: base.expiresAt,
    jwtSha256: base.jwtSha256,
    ownershipSha256: fingerprint({
      owner: context.owner,
      siteUid: base.siteUid,
      tokenUid: base.tokenUid,
      vm: observed.instanceId,
      operation: observed.operationId,
      interfaces: observed.interfaces,
      jwt: base.jwtSha256,
      userdata: inserted.bootstrapSha256,
      request: inserted.requestBodySha256,
    }).slice(7),
    bootstrapCorroborated: true,
    originalBeforeReadExpired: beforeReadExpired,
    guestAcceptanceComplete: false,
  });
}
var initialFinalBootstrapVms = new WeakSet();
var initialFinalBootstrapNodes = new WeakMap();
async function joinOriginalFinalGcpBootstrapVm(input) {
  const { context, callback, bootstrap, identity, vm } = input;
  if (callback.original !== context || callback.phase !== 'after' || !callback.reserve)
    throw new Error('Original first final bootstrap callback and reserve required');
  await assertOriginalApplyCallback(callback);
  await assertOriginalGcpPreapplyBootstrapCallback(bootstrap, callback);
  await readOriginalEarlyGcpInsertIdentity2(identity);
  if (initialFinalBootstrapVms.has(vm)) throw new Error('Original first final bootstrap VM already claimed');
  initialFinalBootstrapVms.add(vm);
  await assertOriginalGcpVmCaptureCallback(vm, callback);
  const observed = await readOriginalFinalGcpVmEvidence2(vm);
  const claimed = initialFinalBootstrapNodes.get(callback) ?? new Set();
  if (claimed.has(observed.nodeName)) throw new Error('Original first final bootstrap node already claimed');
  claimed.add(observed.nodeName);
  initialFinalBootstrapNodes.set(callback, claimed);
  let refused = false;
  let anchor;
  const read = async () => {
    if (refused) throw new Error('Original first final bootstrap VM join was refused');
    try {
      const value = await readOriginalBootstrapVmJoin({
        context,
        selectedCallback: callback,
        selectedBootstrap: bootstrap,
        identity,
        selectedVm: vm,
        beforeReadExpired: false,
      });
      if (
        value.kind !== 'original-final-gcp-vm-cloud-candidate' ||
        (anchor !== undefined && value.ownershipSha256 !== anchor)
      )
        throw new Error('Original first final bootstrap VM ownership differs');
      return Object.freeze({ ...value, initialPhase: 'after', originalEarlyBootstrapJoined: false });
    } catch (error) {
      refused = true;
      throw error;
    }
  };
  const initial = await read();
  anchor = initial.ownershipSha256;
  const ref = Object.freeze({
    schemaVersion: 2,
    kind: 'original-final-gcp-bootstrap-vm-reference',
  });
  finalBootstrapOrigins.set(ref, { callback, bootstrap, vm, read });
  return ref;
}
async function joinOriginalEarlyGcpBootstrapVm(input) {
  const { context, callback, bootstrap, identity, vm } = input;
  if (callback.original !== context || callback.phase !== 'before')
    throw new Error('Original early bootstrap before callback required');
  await assertOriginalApplyLifetime(callback);
  let refused = false;
  let beforeReadExpired = false;
  let transferred = false,
    handoffClaimed = false;
  let currentCallback = callback;
  let currentVm = vm;
  let currentBootstrap = bootstrap;
  const read = async () => {
    if (refused || (currentCallback.phase === 'before' && beforeReadExpired))
      throw new Error('Original early bootstrap VM join was refused');
    const selectedCallback = currentCallback,
      selectedVm = currentVm,
      selectedBootstrap = currentBootstrap;
    try {
      const view = await readOriginalBootstrapVmJoin({
        context,
        selectedCallback,
        selectedBootstrap,
        identity,
        selectedVm,
        beforeReadExpired,
      });
      if (selectedCallback !== currentCallback || selectedVm !== currentVm || selectedBootstrap !== currentBootstrap)
        throw new Error('Original bootstrap VM lifetime changed during source read');
      return view;
    } catch (error) {
      if (isOriginalApplyLifetimeExpiry(error, selectedCallback)) beforeReadExpired = true;
      else refused = true;
      throw error;
    }
  };
  const initial = await read();
  const ref = Object.freeze({
    schemaVersion: 1,
    kind: 'original-early-gcp-bootstrap-vm-reference',
  });
  earlyBootstrapOrigins.set(ref, {
    callback,
    bootstrap,
    vm,
    async read() {
      if (transferred || handoffClaimed) throw new Error('Original early bootstrap VM join retired');
      const view = await read();
      if (transferred || handoffClaimed) throw new Error('Original early bootstrap VM join retired during read');
      if (view.kind !== 'original-early-gcp-vm-cloud-candidate')
        throw new Error('Original early bootstrap phase differs');
      return view;
    },
    async handoff(input) {
      if (transferred || handoffClaimed || refused)
        throw new Error('Original bootstrap VM handoff already claimed or refused');
      const after = input.callback;
      if (
        after.phase !== 'after' ||
        !after.reserve ||
        after.original !== context ||
        after.nonce !== callback.nonce ||
        after.execution.output !== callback.execution.output ||
        ['pid', 'group', 'start', 'boot'].some(
          (key) => after.execution.identity[key] !== callback.execution.identity[key],
        )
      )
        throw new Error('Original final bootstrap callback and unchanged actor required');
      await assertOriginalApplyCallback(after);
      if (transferred || handoffClaimed || refused)
        throw new Error('Original bootstrap VM handoff already claimed or refused');
      handoffClaimed = true;
      try {
        await assertOriginalGcpVmCaptureCallback(input.vm, after);
        await assertOriginalGcpPreapplyBootstrapCallback(input.bootstrap, after);
        if (
          [
            'owner',
            'deploymentName',
            'siteName',
            'siteUid',
            'nodeName',
            'tokenName',
            'tokenUid',
            'jwtSha256',
            'expiresAt',
          ].some((key) => fingerprint(input.bootstrap.bootstrap[key]) !== fingerprint(bootstrap.bootstrap[key])) ||
          input.bootstrap.xcshProviderVersion !== bootstrap.xcshProviderVersion ||
          input.bootstrap.planSha256 !== bootstrap.planSha256 ||
          input.bootstrap.readerRequestSha256 !== bootstrap.readerRequestSha256 ||
          input.bootstrap.siteCreationSha256 !== bootstrap.siteCreationSha256 ||
          input.bootstrap.tokenCreationSha256 !== bootstrap.tokenCreationSha256 ||
          ['pid', 'group', 'start', 'boot'].some((key) => input.bootstrap.executor[key] !== bootstrap.executor[key])
        )
          throw new Error('Original final bootstrap identity or token changed');
        currentBootstrap = input.bootstrap;
        currentCallback = after;
        currentVm = input.vm;
        const final = await read();
        if (final.kind !== 'original-final-gcp-vm-cloud-candidate' || final.ownershipSha256 !== initial.ownershipSha256)
          throw new Error('Original final bootstrap VM ownership changed');
        await assertOriginalApplyCallback(after);
        transferred = true;
        const result = Object.freeze({
          schemaVersion: 1,
          kind: 'original-final-gcp-bootstrap-vm-reference',
        });
        finalBootstrapOrigins.set(result, {
          callback: after,
          bootstrap: currentBootstrap,
          vm: input.vm,
          async read() {
            const view = await read();
            if (
              view.kind !== 'original-final-gcp-vm-cloud-candidate' ||
              view.ownershipSha256 !== initial.ownershipSha256
            )
              throw new Error('Original final bootstrap VM ownership changed');
            return view;
          },
        });
        return result;
      } catch (error) {
        refused = true;
        throw error;
      }
    },
  });
  return ref;
}
async function joinOriginalGcpBootstrapVm2(input) {
  const { context, bootstrap, cloud } = input;
  await assertOriginalGcpPreapplyBootstrapContext2(bootstrap, context);
  await context.assertWithinDeadline();
  await context.assertInputs();
  const base = bootstrap.bootstrap,
    source = cloud.source;
  if (
    source.planSha256 !== bootstrap.planSha256 ||
    source.project !== base.owner.account ||
    source.nodeName !== base.nodeName ||
    source.zone.slice(0, -2) !== base.owner.region ||
    source.parentPid !== bootstrap.executor.pid ||
    source.parentStart !== bootstrap.executor.start ||
    source.parentBoot !== bootstrap.executor.boot
  )
    throw new Error('Original bootstrap creation and insert scope or parent differs');
  const bodies = readOriginalGcpInsertSourceBodies(source);
  const request = decodeEvidenceObject(Buffer.from(bodies.requestBody)),
    metadata = object2(request.metadata),
    labels = object2(request.labels);
  if (!Array.isArray(metadata.items)) throw new Error('Original VM metadata required');
  const userdata = metadata.items.map(object2).filter((row) => row.key === 'user-data');
  if (
    userdata.length !== 1 ||
    typeof userdata[0].value !== 'string' ||
    hash2(userdata[0].value) !== source.bootstrapSha256
  )
    throw new Error('Original VM user-data identity differs');
  const jwt = await readOriginalGcpPreapplyBootstrapJwt2(bootstrap);
  let config;
  try {
    config = object2(Bun.YAML.parse(userdata[0].value));
  } catch {
    throw new Error('Original token-only cloud-init required');
  }
  if (
    !userdata[0].value.startsWith('#cloud-config') ||
    Object.keys(config).join(',') !== 'write_files' ||
    !Array.isArray(config.write_files) ||
    config.write_files.length !== 1
  )
    throw new Error('Original token-only cloud-init required');
  const file = object2(config.write_files[0]);
  if (
    Object.keys(file).sort().join(',') !== 'content,owner,path,permissions' ||
    file.path !== '/etc/vpm/user_data' ||
    file.owner !== 'root' ||
    file.permissions !== '0600' ||
    typeof file.content !== 'string' ||
    file.content.trim() !== `token: ${jwt}`
  )
    throw new Error('Original Site-bound JWT or certified cloud-init differs');
  if (
    labels['xcsh-deployment'] !== base.deploymentName ||
    labels['xcsh-site'] !== base.siteName ||
    labels['xcsh-node'] !== base.nodeName ||
    labels['xcsh-engine'] !== 'terraform'
  )
    throw new Error('Original VM bootstrap ownership labels differ');
  const vm = await joinOriginalGcpInsertAuditEvidence2(cloud);
  if (
    vm.accountSha256 !== context.authentication.accountSha256 ||
    vm.audienceSha256 !== context.authentication.audienceSha256 ||
    vm.adcSha256 !== context.authentication.snapshotSha256 ||
    vm.interfaces.length !== 2
  )
    throw new Error('Original admitted principal, snapshot or CE interfaces differ');
  await assertOriginalGcpPreapplyBootstrapContext2(bootstrap, context);
  await readOriginalGcpPreapplyBootstrapJwt2(bootstrap);
  readOriginalGcpInsertSourceBodies(source);
  await context.assertInputs();
  await context.assertWithinDeadline();
  return Object.freeze({
    ...vm,
    schemaVersion: 2,
    kind: 'original-gcp-bootstrap-vm-audit-candidate',
    siteCreationSha256: bootstrap.siteCreationSha256,
    tokenCreationSha256: bootstrap.tokenCreationSha256,
    jwtSha256: base.jwtSha256,
    bootstrapCorroborated: true,
    bootstrapOwnershipQualified: false,
    originalInsertQualified: false,
  });
}
async function readOriginalGcpBootstrapVmSource(value, bootstrap, callback, vm) {
  const origin =
    value && typeof value === 'object'
      ? callback.phase === 'after'
        ? finalBootstrapOrigins.get(value)
        : earlyBootstrapOrigins.get(value)
      : undefined;
  if (
    !origin ||
    origin.callback !== callback ||
    origin.bootstrap !== bootstrap ||
    (vm !== undefined && origin.vm !== vm)
  )
    throw new Error('Original VM/bootstrap source and actual callback required');
  return origin.read();
}

// plugins/terraform/src/installed-bootstrap-capture.ts
import { createHash as createHash3, randomUUID } from 'node:crypto';

var sameActor = (a, b) => ['pid', 'group', 'start', 'boot'].every((key) => a[key] === b[key]);
var name = (value) => typeof value === 'string' && /^[a-z][a-z0-9-]{0,62}$/.test(value);
var sourceReaders = new WeakMap();
async function collectInstalledOriginalBootstrapReaderSources2(value) {
  const collect = value && typeof value === 'object' ? sourceReaders.get(value) : undefined;
  if (!collect) throw new Error('Original source-issued bootstrap capture required');
  return collect();
}
async function openInstalledBootstrapCapture2(input, options = {}) {
  const { context, packet, platform, store, platformContext } = input;
  const nodes = Object.freeze(input.nodes.map((node) => Object.freeze({ ...node })));
  assertPreparedCreationScopeContext(packet, context);
  const scope = await inspectPreparedCreationScope(packet);
  const source = platform.gcpBootstrapSource?.();
  const openObservation = platform.gcpBootstrapObservation?.bind(platform);
  if (
    !source ||
    !openObservation ||
    !scope.scope ||
    !scope.bootstrapAuthorization ||
    !nodes.length ||
    nodes.some(
      (node) =>
        Object.keys(node).sort().join(',') !== 'nodeName,siteName,tokenName' ||
        ![node.siteName, node.tokenName, node.nodeName].every(name),
    ) ||
    new Set(nodes.map((node) => node.nodeName)).size !== nodes.length ||
    new Set(nodes.map((node) => node.tokenName)).size !== nodes.length
  )
    throw new Error('Original installed bootstrap stage source and bindings required');
  const directory = store.directory;
  const saved = await store.read('gcp-terraform-input-identity.json');
  if (
    !saved.intent ||
    saved.intentFingerprint !== fingerprint(saved.intent) ||
    saved.platformContext !== platformContext ||
    saved.intent.platformContext !== platformContext ||
    saved.intent.project !== context.owner.account ||
    saved.intent.region !== context.owner.region ||
    saved.intent.deploymentName !== context.owner.deploymentId ||
    saved.intent.engine !== 'terraform' ||
    saved.intent.operation !== 'deploy' ||
    !Array.isArray(saved.intent.sites) ||
    nodes.some(
      (node) =>
        !saved.intent.sites.some(
          (site) =>
            site.name === node.siteName &&
            Array.isArray(site.nodes) &&
            site.nodes.some((entry) => entry.name === node.nodeName),
        ),
    )
  )
    throw new Error('Original bootstrap stage intent differs');
  const declared = new Set(
    nodes.flatMap((node) => [
      JSON.stringify(['xcsh_securemesh_site_v2', 'system', node.siteName]),
      JSON.stringify(['xcsh_token', 'system', node.tokenName]),
    ]),
  );
  if (
    scope.resources.length !== declared.size ||
    scope.resources.some(
      (target) => !declared.delete(JSON.stringify([target.type_name, target.namespace, target.name])),
    )
  )
    throw new Error('Original bootstrap stage creation target coverage differs');
  const savedHash = fingerprint(saved);
  let callback;
  let finalClosureCallback;
  let actor;
  let reader;
  let observation;
  let pending;
  let failure;
  let started = false,
    finalStarted = false,
    originalGroupClosed = false,
    closed = false;
  const grants = new Map();
  const candidates = new Map();
  const inputs = async (closing = false) => {
    assertPreparedCreationScopeContext(packet, context);
    if (closing) await assertPreparedCreationScopeClosureInputs(packet);
    else await assertPreparedCreationScopeInputs(packet);
    await context.assertInputs();
    await store.verify();
    if (
      store.directory !== directory ||
      fingerprint(await store.read('gcp-terraform-input-identity.json')) !== savedHash ||
      ['provider', 'engine', 'account', 'region', 'deploymentId'].some((key) => store.owner[key] !== context.owner[key])
    )
      throw new Error('Original bootstrap stage input or storage scope changed');
  };
  const guard = async () => {
    if (closed || finalStarted || failure) throw new Error('Original bootstrap stage retired or failed');
    await inputs();
    await context.assertWithinDeadline();
    const now = linuxMonotonicMs();
    if (now < context.budget.start || now >= context.budget.deadline)
      throw new Error('Original bootstrap stage deadline exhausted');
    if (callback) await assertOriginalApplyLifetime(callback);
  };
  const retain = async (phase, value) => {
    await store.verify();
    if (store.directory !== directory) throw new Error('Original bootstrap stage retention directory changed');
    await store.write(`gcp-bootstrap-stage-${randomUUID()}.json`, {
      schemaVersion: 1,
      kind: 'original-installed-bootstrap-stage-event',
      phase,
      owner: context.owner,
      planSha256: scope.planSha256,
      scopeFileSha256: scope.scope?.sha256,
      originalBudget: context.budget,
      executor: actor?.identity,
      ...value,
      executionQualified: false,
      guestAcceptanceComplete: false,
    });
  };
  const recordFailure = async (phase, error, details = {}) => {
    failure ??= error;
    try {
      await retain(phase, {
        ...details,
        errorType: error instanceof Error ? error.name : typeof error,
        ...(error instanceof Error ? { errorMessage: error.message, errorStack: error.stack } : {}),
      });
    } catch (retention) {
      throw new AggregateError([error, retention], 'Original bootstrap failure and retention failed');
    }
    throw error;
  };
  await guard();
  observation = await openObservation(context.owner, platformContext, {
    origin: context.environment.XCSH_API_URL,
    credentialSha256: createHash3('sha256').update(context.environment.XCSH_API_TOKEN).digest('hex'),
    targets: scope.resources,
    assertOriginal: inputs,
  });
  const collect = async (node, targets, signal) => {
    await guard();
    const siteTarget = targets.find(
      (target) => target.target.type_name === 'xcsh_securemesh_site_v2' && target.target.name === node.siteName,
    );
    const tokenTarget = targets.find(
      (target) => target.target.type_name === 'xcsh_token' && target.target.name === node.tokenName,
    );
    if (!siteTarget || !tokenTarget) return;
    const site = await observation?.read(siteTarget.target, signal);
    const token = await observation?.read(tokenTarget.target, signal);
    if (!site || !token) return;
    const siteBody = await joinOriginalXcshCreationBody2({
      context,
      packet,
      result: siteTarget,
      platform: source,
      body: site,
      target: siteTarget.target,
    });
    const tokenBody = await joinOriginalXcshCreationBody2({
      context,
      packet,
      result: tokenTarget,
      platform: source,
      body: token,
      target: tokenTarget.target,
    });
    const evidence = await collectOriginalGcpPreapplyBootstrap2({
      site: siteBody,
      token: tokenBody,
      platform: source,
      binding: { owner: context.owner, deploymentName: context.owner.deploymentId, ...node },
    });
    const prior = candidates.get(node.nodeName);
    if (
      prior &&
      (prior.bootstrap.jwtSha256 !== evidence.bootstrap.jwtSha256 ||
        prior.siteCreationSha256 !== evidence.siteCreationSha256 ||
        prior.tokenCreationSha256 !== evidence.tokenCreationSha256)
    )
      throw new Error('Original bootstrap stage token or Site identity changed');
    await guard();
    candidates.set(node.nodeName, evidence);
    return { evidence, token: tokenTarget };
  };
  const guardFinal = async (after) => {
    if (
      closed ||
      !finalStarted ||
      after !== finalClosureCallback ||
      after.original !== context ||
      after.phase !== 'after' ||
      !after.reserve
    )
      throw new Error('Original bootstrap final callback required');
    await assertOriginalApplyCallback(after);
    await inputs();
    await assertOriginalApplyCallback(after);
  };
  const collectFinal = async (node, result, after) => {
    await guardFinal(after);
    if (!observation) throw new Error('Original bootstrap observation source required');
    const join = (type_name, name) =>
      joinOriginalFinalXcshCreationBody({
        context,
        packet,
        result,
        callback: after,
        platform: source,
        observation,
        target: { type_name, namespace: 'system', name },
      });
    const evidence = await collectOriginalGcpPreapplyBootstrap2({
      site: await join('xcsh_securemesh_site_v2', node.siteName),
      token: await join('xcsh_token', node.tokenName),
      platform: source,
      binding: { owner: context.owner, deploymentName: context.owner.deploymentId, ...node },
    });
    const prior = candidates.get(node.nodeName);
    if (
      !prior ||
      prior.bootstrap.jwtSha256 !== evidence.bootstrap.jwtSha256 ||
      prior.siteCreationSha256 !== evidence.siteCreationSha256 ||
      prior.tokenCreationSha256 !== evidence.tokenCreationSha256
    )
      throw new Error('Original final bootstrap token or Site identity changed');
    await guardFinal(after);
    await retain('final-source-refreshed', { nodeName: node.nodeName, evidence, finalReserve: after.reserve });
    return evidence;
  };
  const worker = {
    async start(admission, originalCallback) {
      if (started || closed) throw new Error('Original bootstrap stage already started or retired');
      if (originalCallback?.phase !== 'before' || originalCallback.original !== context)
        throw new Error('Original bootstrap before callback required');
      await assertOriginalApplyCallback(originalCallback);
      if (
        admission.directory !== context.executionDirectory ||
        admission.args[0] !== 'apply' ||
        admission.originalStartMs !== context.budget.start ||
        admission.originalDeadlineMs !== context.budget.deadline ||
        !sameActor(admission.identity, originalCallback.execution.identity)
      )
        throw new Error('Original bootstrap stage executor differs');
      started = true;
      callback = originalCallback;
      actor = Object.freeze({ ...admission, identity: Object.freeze({ ...admission.identity }) });
      try {
        await guard();
        reader = await openInstalledXcshCreationReader2(context, actor, packet, options.reader);
        const ready = await reader.ready;
        await retain('reader-ready', { reader: ready.reader, readerEvidenceSha256: ready.evidenceSha256 });
        let terminal = false;
        reader.completed.then(
          () => {
            terminal = true;
          },
          () => {
            terminal = true;
          },
        );
        pending = (async () => {
          try {
            while (grants.size !== nodes.length) {
              await guard();
              if (linuxMonotonicMs() >= ready.windowDeadlineMs)
                throw new Error('Original bootstrap target window incomplete');
              const targets = await reader?.availableTargets();
              for (const node of nodes) {
                if (grants.has(node.nodeName)) continue;
                const signal = AbortSignal.timeout(
                  Math.max(1, Math.min(60000, ready.windowDeadlineMs - linuxMonotonicMs())),
                );
                const candidate = await collect(node, targets, signal);
                if (!candidate) continue;
                await guard();
                const grant = await publishOriginalGcpBootstrapGrant2(
                  { packet, token: candidate.token, evidence: candidate.evidence, store },
                  options.publication,
                );
                grants.set(node.nodeName, grant);
                await retain('grant-published', { nodeName: node.nodeName, grant });
              }
              if (grants.size !== nodes.length) {
                if (terminal) {
                  await reader?.completed;
                  throw new Error('Original bootstrap reader completed without all grants');
                }
                await Bun.sleep(25);
              }
            }
            return Object.freeze(
              nodes.map((node) => {
                const grant = grants.get(node.nodeName);
                if (!grant) throw new Error('Original bootstrap grant coverage incomplete');
                return grant;
              }),
            );
          } catch (error) {
            return recordFailure('bootstrap-failed', error, {
              publishedCount: grants.size,
              expectedCount: nodes.length,
            });
          }
        })();
        pending.catch(() => {});
        await guard();
        await assertOriginalApplyCallback(originalCallback);
      } catch (error) {
        failure ??= error;
        pending ??= Promise.reject(error);
        pending.catch(() => {});
        return recordFailure('bootstrap-start-failed', error, {
          sourceReaderOpened: !!reader,
          publishedCount: grants.size,
        });
      }
    },
    async assertOriginal() {
      await guard();
    },
    async finalCapture(finished, reserve, finalCallback) {
      if (
        !reserve ||
        !finalCallback ||
        finalCallback.phase !== 'after' ||
        finalCallback.original !== context ||
        finalCallback.reserve !== reserve ||
        !finished.identity ||
        finalStarted
      )
        throw new Error('Original bootstrap final capture admission required');
      await assertOriginalApplyCallback(finalCallback);
      actor ??= finalCallback.execution;
      if (!sameActor(finished.identity, actor.identity) || finished.originalDeadlineMs !== context.budget.deadline)
        throw new Error('Original bootstrap final executor or budget differs');
      await assertFinalReaderReserve(reserve);
      finalStarted = true;
      finalClosureCallback = finalCallback;
      originalGroupClosed = finished.originalGroupClosed;
      const outcomes = await Promise.allSettled([
        pending ?? Promise.reject(new Error('Original bootstrap startup incomplete')),
        reader?.completed ?? Promise.reject(new Error('Original bootstrap reader not opened')),
      ]);
      await inputs();
      await assertFinalReaderReserve(reserve);
      const result = outcomes[1];
      const raw = result.status === 'fulfilled' ? await readOriginalInstalledXcshCreation2(result.value) : undefined;
      const finalSources = [];
      if (result.status === 'fulfilled' && result.value.complete)
        for (const node of nodes) {
          const [outcome] = await Promise.allSettled([collectFinal(node, result.value, finalCallback)]);
          finalSources.push(outcome);
        }
      for (const outcome of finalSources) if (outcome.status === 'rejected') failure ??= outcome.reason;
      await retain('final-capture', {
        publishedCount: grants.size,
        expectedCount: nodes.length,
        creationComplete: result.status === 'fulfilled' && result.value.complete,
        creationEvidenceSha256: raw ? createHash3('sha256').update(raw).digest('hex') : undefined,
        originalGroupClosed,
        finalReserve: reserve,
        failures: outcomes.filter((value) => value.status === 'rejected').length,
        finalSourcesComplete:
          finalSources.length === nodes.length && finalSources.every((value) => value.status === 'fulfilled'),
        finalSourceFailures: finalSources.filter((value) => value.status === 'rejected').length,
        providerConsumptionQualified: false,
      });
      await assertFinalReaderReserve(reserve);
      if (
        failure ||
        outcomes.some((value) => value.status === 'rejected') ||
        result.status !== 'fulfilled' ||
        !result.value.complete ||
        grants.size !== nodes.length ||
        finalSources.length !== nodes.length ||
        finalSources.some((value) => value.status === 'rejected')
      )
        throw new Error('Original bootstrap stage capture incomplete; retain evidence and reconcile without replay');
    },
    async closeAfterExecutorExit() {
      if (closed) return;
      if (started && !finalStarted) throw new Error('Original bootstrap stage executor closure required');
      if (started && !originalGroupClosed) await assertOriginalApplyGroupClosed2(finalClosureCallback);
      await inputs(true);
      try {
        await reader?.closeAfterExecutorExit();
      } catch (error) {
        return recordFailure('closure-incomplete', error);
      } finally {
        await observation?.close();
      }
      await retain('closed', { publishedCount: grants.size });
      closed = true;
    },
  };
  const port = Object.freeze({
    ...worker,
    waitForGrants() {
      if (!pending) throw new Error('Original bootstrap stage has not started');
      return pending;
    },
    async refreshBootstrap(nodeName, after) {
      if (!reader || !grants.has(nodeName)) throw new Error('Original published bootstrap node required');
      const node = nodes.find((value) => value.nodeName === nodeName);
      if (!node) throw new Error('Original published bootstrap binding required');
      try {
        if (after) {
          if (failure) throw new Error('Original bootstrap source retired or failed');
          await guardFinal(after);
          return await collectFinal(node, await reader.completed, after);
        }
        const candidate = await collect(node, await reader.availableTargets());
        if (!candidate) throw new Error('Original bootstrap source refresh unavailable');
        return candidate.evidence;
      } catch (error) {
        failure ??= error;
        return recordFailure('source-refresh-failed', error, { nodeName });
      }
    },
  });
  sourceReaders.set(port, async () => {
    const outcomes = await Promise.allSettled([
      collectOriginalPreparedBootstrapPublisherSource2(packet),
      (async () => {
        if (!reader) return Object.freeze({ name: 'xcsh', attemptCount: 0, witnesses: Object.freeze([]) });
        return Object.freeze({
          name: 'xcsh',
          attemptCount: 1,
          witnesses: await collectInstalledOriginalXcshReaderClosures2(reader),
        });
      })(),
    ]);
    const failures = outcomes.flatMap((outcome) => (outcome.status === 'rejected' ? [outcome.reason] : []));
    if (failures.length) throw new AggregateError(failures, 'Original bootstrap reader source coverage incomplete');
    return Object.freeze(outcomes.flatMap((outcome) => (outcome.status === 'fulfilled' ? [outcome.value] : [])));
  });
  return port;
}

// plugins/terraform/src/gcp-ce-campaign-key.ts
import { createHash as createHash4 } from 'node:crypto';
import { join } from 'node:path';

var origins = new WeakMap();
async function readOriginalGcpCeCampaignKey(value, callback) {
  const origin = value && typeof value === 'object' ? origins.get(value) : undefined;
  if (!origin || origin.callback !== callback) throw new Error('Original CE campaign key and actual callback required');
  return origin.read();
}
function closeOriginalGcpCeCampaignKey(value) {
  const origin = value && typeof value === 'object' ? origins.get(value) : undefined;
  if (!origin) throw new Error('Original CE campaign key required');
  origin.close();
}
async function openOriginalGcpCeCampaignKey(input) {
  const { vm, bootstrap, callback, store } = input;
  const context = callback.original;
  const lifetime = () =>
    callback.phase === 'after' ? assertOriginalApplyCallback(callback) : assertOriginalApplyLifetime(callback);
  const readVm = () => readOriginalGcpBootstrapVmSource(vm, bootstrap, callback);
  await lifetime();
  const observed = await readVm();
  const site = await readOriginalGcpPreapplySiteAccess(bootstrap, context);
  const binding = context.inputs['workspace:gcp-terraform-input-identity.json'];
  if (
    !binding ||
    binding.path !== join(store.directory, 'gcp-terraform-input-identity.json') ||
    ['provider', 'engine', 'account', 'region', 'deploymentId'].some(
      (name) => store.owner[name] !== context.owner[name],
    ) ||
    site.siteName !== observed.siteName ||
    observed.project !== store.owner.account
  )
    throw new Error('Original CE Site/key/VM scope differs');
  const readIntent = async () => {
    await store.verify();
    const original = await owned(binding.path);
    assertSameOriginalInput(binding, original.binding);
    const saved = decodeEvidenceObject(original.bytes);
    const intent = saved.intent;
    if (
      saved.intentFingerprint !== fingerprint(intent) ||
      saved.platformContext !== intent.platformContext ||
      intent.project !== store.owner.account ||
      intent.region !== store.owner.region ||
      intent.deploymentName !== store.owner.deploymentId ||
      intent.engine !== 'terraform' ||
      intent.operation !== 'deploy' ||
      !intent.observer ||
      !intent.initialAccess ||
      intent.initialAccess.publicKey !== site.publicKey ||
      !intent.sites.some(
        (site) =>
          site.name === observed.siteName &&
          site.nodes.some((node) => node.name === observed.nodeName && node.zone === observed.zone),
      )
    )
      throw new Error('Original CE Site SSH campaign intent differs');
    return Object.freeze({
      intentSha256: fingerprint(intent).slice(7),
      request: Object.freeze({ platformContext: intent.platformContext, sshSourceCidr: intent.observer.sshSourceCidr }),
      ceKey: intent.initialAccess.publicKey,
      observerKey: intent.observer.publicKey,
    });
  };
  const scope = await readIntent();
  const access = await readOriginalGcpCampaignAccess(store, scope.request, scope.intentSha256);
  if (
    access.publicAccess.cePublicKey !== site.publicKey ||
    access.publicAccess.cePublicKey !== scope.ceKey ||
    access.publicAccess.observerPublicKey !== scope.observerKey
  )
    throw new Error('Original Site SSH public/private campaign key differs');
  const publicHash = createHash4('sha256').update(site.publicKey).digest('hex');
  const monitor = await monitorOriginalInputs2({ ...access.inputs, intent: binding });
  let retired = false;
  const read = async () => {
    if (retired) throw new Error('Original CE campaign key retired');
    try {
      await lifetime();
      await monitor.assertOriginal();
      const currentVm = await readVm(),
        currentSite = await readOriginalGcpPreapplySiteAccess(bootstrap, context);
      const currentScope = await readIntent();
      const current = await readOriginalGcpCampaignAccess(store, scope.request, scope.intentSha256);
      if (
        currentVm.instanceId !== observed.instanceId ||
        currentVm.ownershipSha256 !== observed.ownershipSha256 ||
        JSON.stringify(currentSite) !== JSON.stringify(site) ||
        JSON.stringify(currentScope) !== JSON.stringify(scope) ||
        JSON.stringify(current.inputs) !== JSON.stringify(access.inputs) ||
        current.publicAccess.cePublicKey !== scope.ceKey ||
        current.publicAccess.observerPublicKey !== scope.observerKey
      )
        throw new Error('Original CE Site/key/VM source changed');
      await monitor.assertOriginal();
      await lifetime();
      return Object.freeze({
        instanceId: observed.instanceId,
        nodeName: observed.nodeName,
        siteName: site.siteName,
        siteUid: site.siteUid,
        publicKeySha256: publicHash,
        settingsSha256: site.settingsSha256,
        key: access.inputs.ce_key,
        siteAccessConfigured: true,
        guestAcceptanceComplete: false,
        executionAuthorized: false,
      });
    } catch (error) {
      retired = true;
      monitor.close();
      throw error;
    }
  };
  try {
    await read();
  } catch (error) {
    monitor.close();
    throw error;
  }
  const reference = Object.freeze({
    schemaVersion: 1,
    kind: 'original-gcp-ce-campaign-key-reference',
  });
  origins.set(reference, {
    callback,
    read,
    close() {
      retired = true;
      monitor.close();
    },
  });
  return reference;
}

// plugins/terraform/src/gcp-guest-binding-projection.ts
import { isIP } from 'node:net';
import { isAbsolute, resolve } from 'node:path';

var uint64 = (value) =>
  typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value) && BigInt(value) <= 18446744073709551615n;
var name2 = (value) => typeof value === 'string' && /^[a-z][a-z0-9-]{0,62}$/.test(value);
function projectGcpGuestBinding(input, nowMs) {
  const { owner, vm, observer, target, paths } = input;
  if (
    owner.provider !== 'gcp' ||
    owner.engine !== 'terraform' ||
    ![
      owner.account,
      owner.region,
      owner.deploymentId,
      vm.project,
      vm.zone,
      vm.nodeName,
      vm.siteName,
      observer.name,
      observer.zone,
    ].every(name2) ||
    vm.project !== owner.account ||
    observer.project !== owner.account ||
    target.project !== owner.account ||
    !vm.zone.startsWith(`${owner.region}-`) ||
    !observer.zone.startsWith(`${owner.region}-`) ||
    !uint64(vm.instanceId) ||
    !uint64(observer.instanceId) ||
    vm.instanceId === observer.instanceId ||
    vm.nodeName === observer.name ||
    target.instanceId !== vm.instanceId ||
    target.nodeName !== vm.nodeName ||
    target.zone !== vm.zone ||
    target.interfaceIndex !== 1 ||
    target.role !== 'sli' ||
    vm.interfaces.length !== 2 ||
    vm.interfaces[0] === vm.interfaces[1] ||
    target.address !== vm.interfaces[1] ||
    ![...vm.interfaces, observer.externalAddress, target.address].every((address) => isIP(address) === 4) ||
    vm.interfaces.includes(observer.externalAddress) ||
    !/^[a-f0-9]{64}$/.test(vm.jwtSha256) ||
    !/^[a-f0-9]{64}$/.test(vm.ownershipSha256)
  )
    throw new Error('Original guest identity, token or NIC consistency differs');
  const expires = Date.parse(vm.expiresAt);
  if (!Number.isFinite(nowMs) || nowMs <= 0 || !Number.isFinite(expires) || expires <= nowMs)
    throw new Error('Original guest token expiry is invalid or expired');
  const values = Object.values(paths);
  if (
    Object.keys(paths).sort().join(',') !== 'ce_hosts,ce_key,observer_hosts,observer_key' ||
    values.some(
      (path) =>
        typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path || !/^\/[A-Za-z0-9_./-]+$/.test(path),
    ) ||
    new Set(values).size !== 4
  )
    throw new Error('Original guest key/host paths are unsafe or aliased');
  const binding = Object.freeze({
    project: owner.account,
    region: owner.region,
    site_name: vm.siteName,
    node_name: vm.nodeName,
    zone: vm.zone,
    instance_id: vm.instanceId,
    observer_name: observer.name,
    observer_id: observer.instanceId,
    observer_address: observer.externalAddress,
    address: target.address,
    original_interfaces: Object.freeze([...vm.interfaces]),
    token_node: vm.nodeName,
    token_site: vm.siteName,
    token_expires: expires / 1000,
    token_sha256: vm.jwtSha256,
    ownership_sha256: vm.ownershipSha256,
    observer_key: paths.observer_key,
    ce_key: paths.ce_key,
    observer_hosts: paths.observer_hosts,
    ce_hosts: paths.ce_hosts,
    observer_algorithm: 'ssh-ed25519',
    ce_algorithm: 'rsa-sha2-512',
  });
  return Object.freeze({ binding, commandsAuthorized: false, guestAcceptanceComplete: false });
}

// plugins/terraform/src/guest-failure-retention.ts
function createOriginalGuestFailureRetention() {
  let failed = false,
    permanentFailure = false,
    lifetimeFailures = 0;
  const refusals = new WeakSet();
  const refuse = () => {
    const error = new Error('Original guest binding source refused; failure retained');
    refusals.add(error);
    throw error;
  };
  return Object.freeze({
    record(error, callback) {
      if (error && typeof error === 'object' && refusals.has(error)) return;
      failed = true;
      if (isOriginalApplyLifetimeEnd(error, callback)) lifetimeFailures++;
      else permanentFailure = true;
    },
    assertUsable() {
      if (failed) refuse();
    },
    assertUsableForTransfer() {
      if (permanentFailure) refuse();
    },
    evidence: () => Object.freeze({ failed, permanentFailure, lifetimeFailures }),
  });
}

// plugins/terraform/src/installed-ce-access.ts
import { randomUUID as randomUUID2 } from 'node:crypto';

var accessViews = new WeakMap();
async function readOriginalInstalledGcpCeAccess(value, callback) {
  const origin = value && typeof value === 'object' ? accessViews.get(value) : undefined;
  if (!origin || origin.callback !== callback) throw new Error('Original ce access view and actual callback required');
  await origin.check();
  return value;
}
async function openInstalledGcpCeAccess(input) {
  const { vm, bootstrapVm, bootstrap, serial, callback, store } = input;
  const context = callback.original;
  const lifetime = () =>
    callback.phase === 'after' ? assertOriginalApplyCallback(callback) : assertOriginalApplyLifetime(callback);
  await lifetime();
  const originalVm = await readOriginalGcpBootstrapVmSource(bootstrapVm, bootstrap, callback, vm);
  const target = await openOriginalGcpCeSliTarget2(vm, callback);
  const originalTarget = await readOriginalGcpCeSliTarget2(target);
  const originalSerial = await readOriginalGcpCeSliSerialSource2(target, serial, callback);
  const key = await openOriginalGcpCeCampaignKey({ vm: bootstrapVm, bootstrap, callback, store });
  const sources = [{ name: 'key', close: () => closeOriginalGcpCeCampaignKey(key) }];
  let claimed = false,
    initialized = false,
    closing = false,
    closed = false,
    closureUnresolved = false;
  let failure;
  let pending, closure;
  let clients;
  let trust;
  let wire;
  const retain = async (phase, extra = {}) => {
    await store.verify();
    await store.write(`gcp-ce-access-${randomUUID2()}.json`, {
      schemaVersion: 1,
      kind: 'original-installed-gcp-ce-access-event',
      phase,
      owner: context.owner,
      executor: callback.execution.identity,
      originalBudget: context.budget,
      instanceId: originalVm.instanceId,
      ...extra,
      guestAcceptanceComplete: false,
      executionAuthorized: false,
    });
  };
  const active = () => {
    if (closing || closed) throw new Error('Original CE access retired');
    if (failure) throw new Error('Original CE access refused; failure retained');
  };
  const guard = async () => {
    await lifetime();
    await context.assertInputs();
    const currentVm = await readOriginalGcpBootstrapVmSource(bootstrapVm, bootstrap, callback, vm);
    const currentTarget = await readOriginalGcpCeSliTarget2(target);
    const currentSerial = await readOriginalGcpCeSliSerialSource2(target, serial, callback);
    const currentKey = await readOriginalGcpCeCampaignKey(key, callback);
    if (
      currentVm.instanceId !== originalVm.instanceId ||
      currentVm.ownershipSha256 !== originalVm.ownershipSha256 ||
      currentTarget !== originalTarget ||
      JSON.stringify(currentSerial) !== JSON.stringify(originalSerial) ||
      currentKey.instanceId !== originalVm.instanceId
    )
      throw new Error('Original CE key/VM/SLI/serial source changed');
    if (clients !== undefined) await assertOriginalQualifiedGcpObserverClientsContext2(clients, callback);
    if (trust) {
      const host = await readOriginalGcpCeHostTrust2(trust);
      if (host.instanceId !== originalVm.instanceId || host.address !== originalTarget.address)
        throw new Error('Original CE host-trust target differs');
    }
    await lifetime();
  };
  const check = async () => {
    active();
    await guard();
    active();
  };
  const nativeSources = {};
  const own = (name, source) => {
    if (['wire', 'trust', 'peer', 'delivery', 'abi', 'renewal'].includes(name)) nativeSources[name] = source;
    sources.push({ name, close: source.close.bind(source) });
    return source;
  };
  const initialize = async (supplied) => {
    await assertOriginalQualifiedGcpObserverClientsContext2(supplied, callback);
    await check();
    clients = supplied;
    const scanContext = await bindOriginalQualifiedGcpCeObserverScanContext2(target, clients, callback);
    const command = await openOriginalGcpCeKeyScanCommand2(scanContext, callback);
    sources.push({ name: 'command', close: () => closeOriginalGcpCeKeyScanCommand2(command) });
    const wireReader = own('wire', await openGcpCeWireKeyReader2(command));
    wire = await wireReader.scan();
    await check();
    const material = await compileOriginalGcpCeTrustMaterial2(scanContext, serial, wire, callback);
    const hostReader = own('trust', await openGcpCeHostTrustReader2(material, callback));
    trust = await hostReader.verify();
    await check();
    await retain('initialized');
    initialized = true;
  };
  try {
    await guard();
  } catch (error) {
    closeOriginalGcpCeCampaignKey(key);
    throw error;
  }
  const port = Object.freeze({
    initialize(supplied) {
      try {
        if (claimed) throw new Error('Original CE access initialization already claimed');
        active();
      } catch (error) {
        return Promise.reject(error);
      }
      claimed = true;
      pending = initialize(supplied).catch(async (error) => {
        failure ??= error;
        await retain('initialization-refused', { errorType: error instanceof Error ? error.name : typeof error });
        throw error;
      });
      return pending;
    },
    async read() {
      active();
      if (!initialized || !trust || !wire || clients === undefined)
        throw new Error('Original CE access not initialized');
      try {
        await check();
        const checkedKey = await readOriginalGcpCeCampaignKey(key, callback);
        const checkedTrust = await readOriginalGcpCeHostTrust2(trust);
        const checkedWire = await readOriginalGcpCeWireKeys2(wire);
        await check();
        const view = Object.freeze({
          callback,
          vm,
          bootstrapVm,
          bootstrap,
          key,
          trust,
          wire,
          target,
          clients,
          keyInput: checkedKey.key,
          hostInput: checkedTrust.knownHosts,
          algorithm: checkedWire.algorithm,
          ownershipSha256: originalVm.ownershipSha256,
          guestAcceptanceComplete: false,
          executionAuthorized: false,
        });
        accessViews.set(view, {
          callback,
          check: async () => {
            active();
            await guard();
            await readOriginalGcpCeCampaignKey(key, callback);
            await readOriginalGcpCeHostTrust2(view.trust);
            await readOriginalGcpCeWireKeys2(view.wire);
            active();
          },
        });
        return view;
      } catch (error) {
        failure ??= error;
        await retain('read-refused');
        throw error;
      }
    },
    close(finalCallback) {
      if (closure) return closure;
      closing = true;
      closure = (async () => {
        let deadline = Math.min(context.budget.deadline + 300000, linuxMonotonicMs() + 300000);
        const after = finalCallback ?? (callback.phase === 'after' ? callback : undefined);
        if (after) {
          await assertOriginalApplyCallback(after);
          if (
            after.phase !== 'after' ||
            !after.reserve ||
            after.original !== context ||
            after.nonce !== callback.nonce ||
            after.execution.output !== callback.execution.output
          )
            throw new Error('Original CE final closure callback differs');
          deadline = inspectFinalReaderReserve(after.reserve).finalDeadlineMs;
        }
        let watching = true;
        const watch = (async () => {
          while (watching) {
            if (linuxMonotonicMs() >= deadline)
              throw new Error('Original CE source closure unresolved in final reserve');
            await Bun.sleep(100);
          }
        })();
        const failures = [];
        try {
          await Promise.race([
            pending?.catch(() => {
              return;
            }) ?? Promise.resolve(),
            watch,
          ]);
          for (const source of [...sources].reverse()) {
            try {
              await Promise.race([Promise.resolve().then(() => source.close()), watch]);
            } catch (error) {
              failures.push(error);
              await retain('source-closure-refused', { source: source.name });
              if (linuxMonotonicMs() >= deadline) throw error;
            }
          }
          if (failures.length) throw new AggregateError(failures, 'Original CE source closure incomplete');
          await retain('closed', { failureRetained: !!failure });
          closed = true;
        } finally {
          watching = false;
        }
      })().catch(async (error) => {
        closureUnresolved = true;
        await retain('closure-unresolved');
        throw error;
      });
      return closure;
    },
    coverage: () =>
      Object.freeze({
        initialized,
        closed,
        claimed,
        failed: !!failure,
        closureUnresolved,
        guestAcceptanceComplete: false,
        executionAuthorized: false,
      }),
  });
  await bindOriginalAccessReaderCollection(port, {
    callback,
    family: 'ce',
    instanceId: originalVm.instanceId,
    sources: () => ({ ...nativeSources }),
  });
  return port;
}

// plugins/terraform/src/installed-observer-access.ts
import { randomUUID as randomUUID3 } from 'node:crypto';
import { join as join2 } from 'node:path';

var accessViews2 = new WeakMap();
async function readOriginalInstalledGcpObserverAccess(value, callback) {
  const origin = value && typeof value === 'object' ? accessViews2.get(value) : undefined;
  if (!origin || origin.callback !== callback)
    throw new Error('Original observer access view and actual callback required');
  await origin.check();
  return value;
}
async function openInstalledGcpObserverAccess(input) {
  const { vm, serial, callback, store, profile } = input;
  const context = callback.original;
  const renewal = input.installation !== undefined;
  let installation = input.installation;
  const lifetime = () =>
    callback.phase === 'after' ? assertOriginalApplyCallback(callback) : assertOriginalApplyLifetime(callback);
  await lifetime();
  const original = await assertOriginalGcpObserverVmCaptureCallback(vm, callback);
  const originalSerial = await readOriginalGcpObserverSerialSource2(vm, serial);
  await readOriginalGcpSshClientProfile(profile);
  await store.verify();
  if (
    context.inputs['workspace:gcp-terraform-input-identity.json']?.path !==
      join2(store.directory, 'gcp-terraform-input-identity.json') ||
    ['provider', 'engine', 'account', 'region', 'deploymentId'].some(
      (name) => store.owner[name] !== context.owner[name],
    )
  )
    throw new Error('Original observer access store and context differ');
  if (renewal) await assertOriginalGcpObserverClientInstallationContext2(installation, callback);
  let claimed = false,
    initialized = false,
    closing = false,
    closed = false,
    closureUnresolved = false;
  let failure;
  let clientDeliveryAttempted = false;
  let pending, closure;
  const sources = [];
  let value;
  const retain = async (phase, extra = {}) => {
    await store.verify();
    await store.write(`gcp-observer-access-${randomUUID3()}.json`, {
      schemaVersion: 1,
      kind: 'original-installed-gcp-observer-access-event',
      phase,
      owner: context.owner,
      executor: callback.execution.identity,
      instanceId: original.instanceId,
      mode: renewal ? 'renewal' : 'initial',
      originalBudget: context.budget,
      ...extra,
      guestAcceptanceComplete: false,
      executionAuthorized: false,
    });
  };
  const guard = async () => {
    await lifetime();
    await context.assertInputs();
    const current = await assertOriginalGcpObserverVmCaptureCallback(vm, callback);
    const currentSerial = await readOriginalGcpObserverSerialSource2(vm, serial);
    if (current.instanceId !== original.instanceId || JSON.stringify(currentSerial) !== JSON.stringify(originalSerial))
      throw new Error('Original observer access VM or serial source changed');
    await readOriginalGcpSshClientProfile(profile);
    await store.verify();
    if (renewal || installation) await assertOriginalGcpObserverClientInstallationContext2(installation, callback);
    await lifetime();
  };
  const assertActive = () => {
    if (closing || closed) throw new Error('Original observer access retired');
    if (failure) throw new Error('Original observer access refused; failure retained');
  };
  const nativeSources = {};
  const own = (name, source) => {
    if (['wire', 'trust', 'peer', 'delivery', 'abi', 'renewal'].includes(name)) nativeSources[name] = source;
    sources.push({ name, close: source.close.bind(source) });
    return source;
  };
  const ownReference = (name, reference, close) => {
    sources.push({ name, close: () => close(reference) });
    return reference;
  };
  const check = async () => {
    assertActive();
    await guard();
    assertActive();
  };
  const initialize = async () => {
    await check();
    const key = ownReference(
      'campaign-key',
      await openOriginalGcpObserverCampaignKey(vm, callback, store),
      closeOriginalGcpObserverCampaignKey,
    );
    const wireReader = own('wire', await openGcpObserverWireKeyReader2(vm, callback, profile));
    const wire = await wireReader.scan();
    await check();
    const material = await compileOriginalGcpObserverTrustMaterial2(vm, serial, wire, callback);
    const trustReader = own('trust', await openGcpObserverHostTrustReader2(material, callback));
    const trust = await trustReader.verify();
    await check();
    const command = ownReference(
      'ssh-command',
      await openOriginalGcpObserverSshCommand(trust, key, profile, callback),
      closeOriginalGcpObserverSshCommand,
    );
    const localInputs = own('ssh-inputs', await openOriginalGcpObserverSshInputLease(command, callback));
    const peerReader = own('peer', await openGcpObserverSshPeer(command));
    const peer = await peerReader.probe();
    await check();
    let clients;
    if (renewal) {
      const abiCommand = ownReference(
        'renewal-command',
        await openOriginalGcpObserverClientAbiRenewalCommand2(installation, peer, callback),
        closeOriginalGcpObserverClientAbiRenewalCommand2,
      );
      const abiReader = own('renewal', await openGcpObserverClientAbiRenewal2(abiCommand));
      clients = await abiReader.verify();
    } else {
      const payload = ownReference(
        'payload',
        await openOriginalGcpObserverClientPayload(profile, callback),
        closeOriginalGcpObserverClientPayload,
      );
      const deliveryCommand = ownReference(
        'delivery-command',
        await openOriginalGcpObserverClientDeliveryCommand(peer, payload, callback),
        closeOriginalGcpObserverClientDeliveryCommand,
      );
      const deliveryReader = own('delivery', await openGcpObserverClientDelivery(deliveryCommand));
      clientDeliveryAttempted = true;
      const delivery = await deliveryReader.deliver();
      installation = await openOriginalGcpObserverClientInstallation2(delivery);
      await retain('installed');
      await check();
      const abiCommand = ownReference(
        'abi-command',
        await openOriginalGcpObserverClientAbiCommand2(delivery, callback),
        closeOriginalGcpObserverClientAbiCommand2,
      );
      const abiReader = own('abi', await openGcpObserverClientAbi2(abiCommand));
      clients = await abiReader.verify();
    }
    await check();
    await assertOriginalQualifiedGcpObserverClientsContext2(clients, callback);
    await localInputs.assertOriginal();
    value = Object.freeze({
      callback,
      vm,
      key,
      trust,
      peer,
      clients,
      command,
      localInputs,
      guestAcceptanceComplete: false,
      executionAuthorized: false,
    });
    accessViews2.set(value, {
      callback,
      check: async () => {
        await check();
        if (!initialized || !value) throw new Error('Original observer access view is not initialized');
        await assertOriginalQualifiedGcpObserverClientsContext2(value.clients, callback);
        await value.localInputs.assertOriginal();
        await check();
      },
    });
    await retain('initialized');
    await check();
    initialized = true;
  };
  await guard();
  const port = Object.freeze({
    initialize() {
      try {
        if (claimed) throw new Error('Original observer access initialization already claimed');
        assertActive();
      } catch (error) {
        return Promise.reject(error);
      }
      claimed = true;
      pending = initialize().catch(async (error) => {
        failure ??= error;
        await retain('initialization-refused', { errorType: error instanceof Error ? error.name : typeof error });
        throw error;
      });
      return pending;
    },
    async read() {
      assertActive();
      if (!initialized || !value) throw new Error('Original observer access not initialized');
      try {
        await check();
        await assertOriginalQualifiedGcpObserverClientsContext2(value.clients, callback);
        await value.localInputs.assertOriginal();
        await check();
        return value;
      } catch (error) {
        failure ??= error;
        await retain('read-refused');
        throw error;
      }
    },
    async readInstallation() {
      if (!installation) throw new Error('Original observer installation unavailable');
      await readOriginalGcpObserverClientInstallation2(installation);
      return installation;
    },
    close(finalCallback) {
      if (closure) return closure;
      closing = true;
      closure = (async () => {
        let deadline = Math.min(context.budget.deadline + 300000, linuxMonotonicMs() + 300000);
        if (finalCallback) {
          await assertOriginalApplyCallback(finalCallback);
          if (
            finalCallback.phase !== 'after' ||
            !finalCallback.reserve ||
            finalCallback.original !== context ||
            finalCallback.nonce !== callback.nonce ||
            finalCallback.execution.output !== callback.execution.output
          )
            throw new Error('Original observer final closure callback differs');
          deadline = inspectFinalReaderReserve(finalCallback.reserve).finalDeadlineMs;
        }
        let watching = true;
        const watch = (async () => {
          while (watching) {
            if (linuxMonotonicMs() >= deadline)
              throw new Error('Original observer source closure unresolved in final reserve');
            await Bun.sleep(100);
          }
        })();
        const failures = [];
        try {
          await Promise.race([
            pending?.catch(() => {
              return;
            }) ?? Promise.resolve(),
            watch,
          ]);
          for (const source of [...sources].reverse()) {
            try {
              await Promise.race([Promise.resolve().then(() => source.close()), watch]);
            } catch (error) {
              failures.push(error);
              await retain('source-closure-refused', { source: source.name });
              if (linuxMonotonicMs() >= deadline) throw error;
            }
          }
          if (failures.length) throw new AggregateError(failures, 'Original observer source closure incomplete');
          await retain('closed', { failureRetained: !!failure });
          closed = true;
        } finally {
          watching = false;
        }
      })().catch(async (error) => {
        closureUnresolved = true;
        await retain('closure-unresolved');
        throw error;
      });
      return closure;
    },
    coverage: () =>
      Object.freeze({
        initialized,
        closed,
        claimed,
        failed: !!failure,
        closureUnresolved,
        clientDeliveryAttempted,
        mode: renewal ? 'renewal' : 'initial',
        guestAcceptanceComplete: false,
        executionAuthorized: false,
      }),
  });
  await bindOriginalAccessReaderCollection(port, {
    callback,
    family: 'observer',
    instanceId: original.instanceId,
    sources: () => ({ ...nativeSources }),
  });
  return port;
}

// plugins/terraform/src/installed-guest-binding.ts
var inputNames = ['observer_key', 'ce_key', 'observer_hosts', 'ce_hosts'];
var core = (binding) =>
  fingerprint(Object.fromEntries(Object.entries(binding).filter(([name]) => !inputNames.includes(name))));
var canonical2 = (value) => fingerprint(value);
function assertOriginalGuestBindingTransfer(before, after, original, current) {
  if (core(before) !== core(after))
    throw new Error('Original guest source transfer changed identity/token/NIC ownership');
  for (const name of inputNames)
    if (!original[name] || !current[name] || before[name] !== original[name].path || after[name] !== current[name].path)
      throw new Error('Original guest binding and input paths differ');
  for (const name of ['observer_key', 'ce_key', 'ssh']) {
    if (!original[name] || !current[name]) throw new Error('Original guest key/executable input missing');
    assertSameOriginalInput(original[name], current[name]);
  }
  for (const name of ['observer_hosts', 'ce_hosts'])
    if (original[name].sha256 !== current[name].sha256)
      throw new Error('Original guest serial/wire host trust changed');
}
async function readSources(sources) {
  const { callback } = sources;
  if (callback.phase === 'after') await assertOriginalApplyCallback(callback);
  else await assertOriginalApplyLifetime(callback);
  const context = callback.original;
  const ce = await readOriginalInstalledGcpCeAccess(sources.ce, callback);
  const observer = await readOriginalInstalledGcpObserverAccess(sources.observer, callback);
  const vm = await readOriginalGcpBootstrapVmSource(ce.bootstrapVm, ce.bootstrap, callback, ce.vm);
  const target = await assertOriginalGcpCeSliTargetContext(ce.target, callback);
  const observed = await assertOriginalGcpObserverVmCaptureCallback(observer.vm, callback);
  const ceKey = await readOriginalGcpCeCampaignKey(ce.key, callback);
  const observerKey = await assertOriginalGcpObserverCampaignKeyContext(observer.key, callback);
  const ceHost = await assertOriginalGcpCeHostTrustContext2(ce.trust, callback);
  const observerHost = await assertOriginalGcpObserverHostTrustContext(observer.trust, callback);
  const wire = await readOriginalGcpCeWireKeys2(ce.wire);
  const clients = await assertOriginalQualifiedGcpObserverClientsContext2(observer.clients, callback);
  const command = await readOriginalGcpObserverSshCommand(observer.command);
  await observer.localInputs.assertOriginal();
  if (
    ce.clients !== observer.clients ||
    clients.peer !== observer.peer ||
    ce.callback !== callback ||
    observer.callback !== callback ||
    command.callback !== callback ||
    command.instanceId !== observed.instanceId ||
    ceKey.instanceId !== vm.instanceId ||
    observerKey.instanceId !== observed.instanceId ||
    ceHost.instanceId !== vm.instanceId ||
    ceHost.address !== target.address ||
    observerHost.instanceId !== observed.instanceId ||
    observerHost.address !== observed.externalAddress ||
    wire.instanceId !== vm.instanceId ||
    wire.observerInstanceId !== observed.instanceId ||
    wire.algorithm !== 'ssh-rsa'
  )
    throw new Error('Original guest CE/observer/key/trust/client identities differ');
  const inputs = freezeAdmittedCaptureInputs({
    ...context.inputs,
    ssh: observer.localInputs.bindings.ssh,
    observer_key: observerKey.key,
    ce_key: ceKey.key,
    observer_hosts: observerHost.knownHosts,
    ce_hosts: ceHost.knownHosts,
  });
  assertSameOriginalInput(observerKey.key, observer.localInputs.bindings.key);
  assertSameOriginalInput(observerHost.knownHosts, observer.localInputs.bindings.hosts);
  if (inputs.ssh.path !== command.executable.path || inputs.ssh.sha256 !== command.executable.sha256)
    throw new Error('Original guest SSH executable and observer command differ');
  const projected = projectGcpGuestBinding(
    {
      owner: context.owner,
      vm: { ...vm, interfaces: vm.interfaces.map((nic) => nic.address) },
      observer: observed,
      target,
      paths: Object.fromEntries(inputNames.map((name) => [name, inputs[name].path])),
    },
    Date.now(),
  );
  await context.assertInputs();
  if (callback.phase === 'after') await assertOriginalApplyCallback(callback);
  else await assertOriginalApplyLifetime(callback);
  return Object.freeze({ ...projected, inputs, context });
}
async function openInstalledGcpGuestBinding2(initial) {
  let sources = Object.freeze({ ...initial });
  const original = await readSources(sources);
  const binding = Object.freeze({ ...original.binding });
  const anchor = canonical2(binding),
    identity = core(binding);
  const context = original.context;
  const monitor = await monitorOriginalInputs2(original.inputs);
  const failures = createOriginalGuestFailureRetention();
  let closed = false,
    busy = false,
    transferred = false,
    transferClaimed = false;
  const lease = async (full = true, finalTransfer = false) => {
    if (closed) throw new Error('Original guest binding lease closed');
    if (transferred || finalTransfer) failures.assertUsableForTransfer();
    else failures.assertUsable();
    try {
      await context.assertInputs();
      if (full) await monitor.assertOriginal();
      else await monitor.assertOriginalIdentity();
    } catch (error) {
      failures.record(error, sources.callback);
      throw error;
    }
  };
  const sameInputs = (current) => {
    if (current.context !== context || core(current.binding) !== identity)
      throw new Error('Original guest source transfer changed identity/token/NIC ownership');
    assertOriginalGuestBindingTransfer(binding, current.binding, original.inputs, current.inputs);
  };
  const verify = async (value, full = true) => {
    if (busy) throw new Error('Original guest binding operation already active');
    busy = true;
    try {
      await lease(full);
      if (value && canonical2(value) !== anchor) throw new Error('Original immutable guest binding differs');
      const current = await readSources(sources);
      sameInputs(current);
      await lease(full);
    } catch (error) {
      failures.record(error, sources.callback);
      throw error;
    } finally {
      busy = false;
    }
  };
  return Object.freeze({
    context,
    binding,
    inputs: original.inputs,
    guards: Object.freeze({
      inputs: () => lease(false),
      original: (value) => verify(value, false),
      async trust(value, role) {
        if (busy) throw new Error('Original guest binding operation already active');
        busy = true;
        try {
          if (role !== 'observer' && role !== 'ce') throw new Error('Original guest trust role required');
          if (canonical2(value) !== anchor) throw new Error('Original immutable guest trust binding differs');
          await lease(false);
          const callback = sources.callback;
          const view =
            role === 'observer'
              ? await readOriginalInstalledGcpObserverAccess(sources.observer, callback)
              : await readOriginalInstalledGcpCeAccess(sources.ce, callback);
          const host =
            role === 'observer'
              ? await assertOriginalGcpObserverHostTrustContext(view.trust, callback)
              : await assertOriginalGcpCeHostTrustContext2(view.trust, callback);
          const name = role === 'observer' ? 'observer_hosts' : 'ce_hosts';
          if (host.knownHosts.sha256 !== original.inputs[name].sha256)
            throw new Error('Original guest host trust changed');
          await lease(false);
        } catch (error) {
          failures.record(error, sources.callback);
          throw error;
        } finally {
          busy = false;
        }
      },
    }),
    assertOriginal: () => verify(),
    async handoff(next) {
      if (transferred || transferClaimed || busy || closed || failures.evidence().permanentFailure)
        throw new Error('Original guest binding transfer already claimed, busy or refused');
      const after = next.callback,
        before = initial.callback;
      if (
        after.phase !== 'after' ||
        !after.reserve ||
        after.original !== context ||
        after.nonce !== before.nonce ||
        after.execution.output !== before.execution.output ||
        ['pid', 'group', 'start', 'boot'].some(
          (name) => after.execution.identity[name] !== before.execution.identity[name],
        )
      )
        throw new Error('Original guest binding actual final callback and same actor required');
      await assertOriginalApplyCallback(after);
      if (transferred || transferClaimed || busy || closed || failures.evidence().permanentFailure)
        throw new Error('Original guest binding transfer already claimed, busy or refused');
      transferClaimed = true;
      busy = true;
      try {
        await lease(true, true);
        const replacement = Object.freeze({ ...next });
        sameInputs(await readSources(replacement));
        await assertOriginalApplyCallback(after);
        sources = replacement;
        transferred = true;
        await lease();
      } catch (error) {
        failures.record(error, after);
        throw error;
      } finally {
        busy = false;
      }
    },
    close() {
      closed = true;
      monitor.close();
    },
    evidence: () =>
      Object.freeze({
        transferred,
        transferClaimed,
        closed,
        ...failures.evidence(),
        originalBindingSha256: anchor.slice(7),
        guestAcceptanceComplete: false,
        executionAuthorized: false,
      }),
  });
}

// plugins/terraform/src/installed-guest-worker.ts
import { createHash as createHash5, randomBytes, randomUUID as randomUUID4 } from 'node:crypto';
import { lstat as lstat2, open as open2, readFile, readlink, realpath as realpath2, stat } from 'node:fs/promises';
import { dirname as dirname2, join as join4 } from 'node:path';

// plugins/terraform/src/guest-capture-round.ts
var sha256 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
var object3 = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
var scopeCommands = {
  root: ['health', 'diagnosis', 'status', 'execcli'],
  status: ['vpm'],
  execcli: ['date', 'ip-address', 'ip-route', 'journalctl'],
};
var linuxCaptures = {
  'vpm-unit': 'systemctl-status-vpm',
  'cloud-init': 'cloud-init-status',
  'failed-units': 'systemctl-failed',
};
async function runOriginalGuestCaptureRound(supplied, original, deadline, monotonic = linuxMonotonicMs) {
  const identity = Object.freeze({ ...original });
  if (
    !/^[1-9][0-9]{0,19}$/.test(identity.instanceId) ||
    !/^[1-9][0-9]{0,19}$/.test(identity.observerId) ||
    identity.instanceId === identity.observerId ||
    !sha256(identity.tokenSha256) ||
    !sha256(identity.ownershipSha256) ||
    !Number.isSafeInteger(deadline)
  )
    throw new Error('Original guest round identity and deadline required');
  const port = Object.freeze({
    assertOriginal: supplied.assertOriginal.bind(supplied),
    command: supplied.command.bind(supplied),
    persist: supplied.persist.bind(supplied),
  });
  const started = monotonic();
  const captures = [],
    unavailable = [];
  let anchor,
    sequence = 0,
    refreshed = started;
  const commands = new Map();
  const report = (status) =>
    Object.freeze({
      schemaVersion: 1,
      kind: 'original-gcp-guest-round',
      status,
      original: identity,
      startedMonotonicMs: started,
      finishedMonotonicMs: monotonic(),
      deadlineMs: deadline,
      captures: Object.freeze([...captures]),
      unavailableCommands: Object.freeze([...unavailable]),
      bootstrapCoverageVerified: false,
      guestAcceptanceComplete: false,
    });
  const persist = (phase, details = {}) =>
    port.persist(
      Object.freeze({
        schemaVersion: 1,
        kind: 'original-gcp-guest-round-event',
        phase,
        original: identity,
        startedMonotonicMs: started,
        observedMonotonicMs: monotonic(),
        deadlineMs: deadline,
        guestAcceptanceComplete: false,
        ...details,
      }),
    );
  const within = () => {
    const now = monotonic();
    if (!Number.isSafeInteger(now) || now < started || now >= deadline)
      throw new Error('Original guest round deadline exhausted or clock changed');
  };
  const execute = async (request) => {
    within();
    await port.assertOriginal();
    within();
    const command = Object.freeze({ ...request });
    const step = ++sequence;
    await persist('command-started', { step, request: command });
    within();
    const result = await port.command(command);
    within();
    await port.assertOriginal();
    within();
    const kind = command.operation === 'discover' ? `completion-${command.scope}` : command.kind;
    const evidence = Array.isArray(result.evidence) && result.evidence.length === 1 ? result.evidence[0] : undefined;
    if (
      result.type !== 'command-result' ||
      result.operation !== command.operation ||
      result.guestAcceptanceComplete !== false ||
      !sha256(result.anchor) ||
      (anchor !== undefined && result.anchor !== anchor) ||
      !Number.isSafeInteger(result.id) ||
      Number(result.id) <= 0 ||
      !object3(evidence) ||
      evidence.schemaVersion !== 1 ||
      evidence.kind !== kind ||
      evidence.truncated !== false ||
      evidence.guestAcceptanceComplete !== false ||
      !sha256(evidence.sha256) ||
      !sha256(evidence.commandSha256) ||
      typeof evidence.path !== 'string' ||
      !evidence.path.startsWith('/') ||
      Object.entries(identity).some(([name, value]) => evidence[name] !== value) ||
      !Number.isSafeInteger(evidence.startedMonotonicMs) ||
      !Number.isSafeInteger(evidence.finishedMonotonicMs) ||
      Number(evidence.startedMonotonicMs) < started ||
      Number(evidence.finishedMonotonicMs) > monotonic() ||
      Number(evidence.finishedMonotonicMs) < Number(evidence.startedMonotonicMs) ||
      Number(evidence.finishedMonotonicMs) - Number(evidence.startedMonotonicMs) > 60000
    )
      throw new Error('Original guest round evidence identity, framing or timing differs');
    anchor = result.anchor;
    const retained = Object.freeze(structuredClone(evidence));
    captures.push(retained);
    await persist('command-captured', { step, request: command, evidence: retained });
    within();
    return retained;
  };
  const requireSupported = (scope, required) => {
    if (required.some((name) => !commands.get(scope)?.has(name)))
      throw new Error(`Required supported guest commands unavailable in ${scope}`);
  };
  const discover = async (scope) => {
    const evidence = await execute({ operation: 'discover', scope });
    const available = evidence.availableCommands;
    if (
      !Array.isArray(available) ||
      available.some((value) => typeof value !== 'string') ||
      new Set(available).size !== available.length
    )
      throw new Error('Original scoped command selections unavailable');
    commands.set(scope, new Set(available));
    return evidence;
  };
  const coreDiscovery = async () => {
    for (const [scope, required] of Object.entries(scopeCommands)) {
      await discover(scope);
      requireSupported(scope, required);
    }
    refreshed = monotonic();
  };
  const capture = (kind, containerId) =>
    execute({
      operation: 'capture',
      kind,
      ...(containerId ? { containerId } : {}),
    });
  const fullLog = async (kind, help, containerId) => {
    const evidence = await capture(kind, containerId);
    if (evidence.logSelection !== 'all-retained' || evidence.helpSha256 !== help.sha256)
      throw new Error('Original complete log selection or help attribution differs');
  };
  const listing = async (runtime) => {
    const evidence = await capture(`${runtime}-list`),
      ids = evidence.containerIds;
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.some((id) => typeof id !== 'string' || !/^[a-f0-9]{12,64}$/.test(id)) ||
      new Set(ids).size !== ids.length ||
      ids.some((id, i) => ids.some((other, j) => i !== j && (id.startsWith(other) || other.startsWith(id))))
    )
      throw new Error('Original nonempty unambiguous container listing required');
    return Object.freeze([...ids]);
  };
  try {
    await persist('round-started');
    await coreDiscovery();
    for (const kind of ['health', 'diagnosis', 'vpm', 'clock', 'interfaces', 'routes']) await capture(kind);
    for (const [kind, executable] of Object.entries(linuxCaptures)) {
      if (commands.get('execcli')?.has(executable)) await capture(kind);
      else unavailable.push(kind);
    }
    await discover('journal');
    requireSupported('journal', ['--help', '-u', '-o', '--no-pager', '--utc']);
    const journalHelp = await capture('journal-help');
    await fullLog('vpm-journal-full', journalHelp);
    if (['-b', '-p'].every((flag) => commands.get('journal')?.has(flag)))
      await fullLog('boot-warnings-full', journalHelp);
    else unavailable.push('boot-warnings-full');
    const runtimes = ['cri', 'docker'].filter((runtime) => {
      const prefix = runtime === 'cri' ? 'crictl' : 'docker';
      return ['ps-a', 'inspect', 'logs'].some((name) => commands.get('execcli')?.has(`${prefix}-${name}`));
    });
    if (!runtimes.length) throw new Error('Required supported guest runtime listing unavailable');
    for (const runtime of runtimes) {
      const prefix = runtime === 'cri' ? 'crictl' : 'docker';
      const runtimeDiscovery = async () => {
        requireSupported(
          'execcli',
          ['ps-a', 'inspect', 'logs'].map((name) => `${prefix}-${name}`),
        );
        await discover(`${runtime}-logs`);
        requireSupported(`${runtime}-logs`, ['--help', '--tail']);
        return capture(`${runtime}-logs-help`);
      };
      if (monotonic() - refreshed >= 240000) await coreDiscovery();
      let help = await runtimeDiscovery();
      const ids = await listing(runtime);
      for (const id of ids) {
        if (monotonic() - refreshed >= 240000) {
          await coreDiscovery();
          help = await runtimeDiscovery();
          const current = await listing(runtime);
          if (current.length !== ids.length || current.some((value) => !ids.includes(value)))
            throw new Error('Original runtime listing changed during round');
        }
        await capture(`${runtime}-inspect`, id);
        await fullLog(`${runtime}-logs-full`, help, id);
      }
    }
    within();
    await port.assertOriginal();
    within();
    await persist('round-captured', { report: report('captured') });
    return report('captured');
  } catch (error) {
    try {
      await persist('round-refused', {
        errorType: error instanceof Error ? error.name : typeof error,
        report: report('incomplete'),
      });
    } catch (retention) {
      throw new AggregateError([error, retention], 'Original guest round failure retention incomplete');
    }
    throw error;
  }
}

// plugins/terraform/src/original-guest-fifo.ts
import { dlopen, FFIType, ptr } from 'bun:ffi';
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute as isAbsolute2, join as join3, resolve as resolve2 } from 'node:path';

// plugins/terraform/src/original-guest-control.ts
var maximumFrame = 65536;
var maximumSequence = 2 ** 31 - 1;
var object4 = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
var integer = (value) => typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= maximumSequence;
function jsonValue(value, depth = 0, ancestors = new Set()) {
  if (depth >= 64) throw new Error('Original guest control JSON nesting exceeds bound');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (!value || typeof value !== 'object') throw new Error('Original guest control JSON cannot discard evidence');
  if (ancestors.has(value)) throw new Error('Original guest control JSON cycle refused');
  if (!Array.isArray(value) && ![null, Object.prototype].includes(Object.getPrototypeOf(value)))
    throw new Error('Original guest control plain JSON required');
  ancestors.add(value);
  for (const item of Array.isArray(value) ? value : Object.values(value)) jsonValue(item, depth + 1, ancestors);
  ancestors.delete(value);
}
function assertOriginalGuestJson(value) {
  jsonValue(value);
}
function wireIntegers(source) {
  let depth = 0;
  for (let i = 0; i < source.length; i++) {
    const character = source[i];
    if (character === '{' || character === '[') depth++;
    else if (character === '}' || character === ']') depth--;
    else if (character === '"') {
      const start = i++;
      while (i < source.length && source[i] !== '"') {
        if (source[i] === '\\') i++;
        i++;
      }
      let next = i + 1;
      while (next < source.length && /\s/.test(source[next])) next++;
      if (source[next] !== ':') continue;
      const key = JSON.parse(source.slice(start, i + 1));
      if ((depth === 1 && ['schemaVersion', 'sequence'].includes(key)) || (depth === 2 && key === 'id')) {
        const token = source.slice(next + 1).trimStart();
        if (!/^(?:0|[1-9][0-9]*)(?=\s*[,}])/.test(token))
          throw new Error('Original guest control integer wire identity required');
      }
    }
  }
}

class OriginalGuestControlFrames {
  session;
  pending = Buffer.alloc(0);
  received = 0;
  sent = 0;
  retired = false;
  constructor(session) {
    this.session = session;
    if (typeof session !== 'string' || !/^[a-f0-9]{64}$/.test(session))
      throw new Error('Original guest control nonce required');
  }
  active() {
    if (this.retired) throw new Error('Original guest control port retired');
  }
  encode(message) {
    this.active();
    try {
      if (!object4(message) || !integer(this.sent + 1)) throw new Error('Original guest control message required');
      jsonValue(message);
      const raw = Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          kind: 'original-guest-control',
          session: this.session,
          sequence: this.sent + 1,
          message,
        }),
      );
      wireIntegers(raw.toString('utf8'));
      if (!raw.length || raw.length > maximumFrame) throw new Error('Original guest control frame exceeds bound');
      const header = Buffer.alloc(4);
      header.writeUInt32BE(raw.length);
      this.sent++;
      return Buffer.concat([header, raw]);
    } catch (error) {
      this.retired = true;
      throw error;
    }
  }
  push(chunk) {
    this.active();
    try {
      if (!(chunk instanceof Uint8Array) || chunk.length > maximumFrame + 4)
        throw new Error('Original guest control receive chunk exceeds bound');
      this.pending = Buffer.concat([this.pending, chunk]);
      const messages = [];
      while (this.pending.length >= 4) {
        const size = this.pending.readUInt32BE(0);
        if (!size || size > maximumFrame) throw new Error('Original guest control frame exceeds bound');
        if (this.pending.length < size + 4) break;
        if (messages.length >= 32) throw new Error('Original guest control batch exceeds bound');
        const raw = this.pending.subarray(4, size + 4);
        const value = decodeEvidenceObject(raw);
        jsonValue(value);
        wireIntegers(new TextDecoder('utf8', { fatal: true }).decode(raw));
        if (
          Object.keys(value).sort().join(',') !== 'kind,message,schemaVersion,sequence,session' ||
          value.schemaVersion !== 1 ||
          value.kind !== 'original-guest-control' ||
          value.session !== this.session ||
          !integer(value.sequence) ||
          value.sequence !== this.received + 1 ||
          !object4(value.message)
        )
          throw new Error('Original guest control attribution differs');
        this.received++;
        messages.push(value.message);
        this.pending = this.pending.subarray(size + 4);
      }
      return messages;
    } catch (error) {
      this.retired = true;
      throw error;
    }
  }
  end() {
    this.active();
    this.retired = true;
    if (this.pending.length) throw new Error('Original guest control frame interrupted');
  }
}

// plugins/terraform/src/original-guest-fifo.ts
var identity = (info) => ({
  dev: String(info.dev),
  ino: String(info.ino),
  uid: String(info.uid),
  mode: String(info.mode),
  nlink: String(info.nlink),
});
var same = (a, b) => Object.keys(a).every((key) => a[key] === b[key]);
function privateDirectory(info) {
  return (
    info.isDirectory() &&
    !info.isSymbolicLink() &&
    info.uid === BigInt(process.getuid?.() ?? -1) &&
    (info.mode & 0o777n) === 0o700n
  );
}
async function openOriginalGuestFifoPeer(options) {
  if (
    process.platform !== 'linux' ||
    !isAbsolute2(options.root) ||
    resolve2(options.root) !== options.root ||
    Array.from(options.root).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
    typeof options.assertOriginal !== 'function'
  )
    throw new Error('Original private Linux guest IPC admission required');
  const frames = new OriginalGuestControlFrames(options.session);
  const parent = dirname(options.root);
  if ((await realpath(parent)) !== parent || !privateDirectory(await lstat(parent, { bigint: true })))
    throw new Error('Original private guest IPC parent required');
  await mkdir(options.root, { mode: 448 });
  const originalRoot = await lstat(options.root, { bigint: true });
  const rootIdentity = { dev: originalRoot.dev, ino: originalRoot.ino, uid: originalRoot.uid, mode: originalRoot.mode };
  const assertCaller = options.assertOriginal.bind(options);
  const paths = { request: join3(options.root, 'request.fifo'), response: join3(options.root, 'response.fifo') };
  const libc = dlopen('libc.so.6', { mkfifo: { args: [FFIType.ptr, FFIType.u32], returns: FFIType.i32 } });
  try {
    for (const path of Object.values(paths)) {
      const raw = Buffer.concat([Buffer.from(path), Buffer.from([0])]);
      if (libc.symbols.mkfifo(ptr(raw), 384) !== 0) throw new Error('Original guest FIFO creation failed');
    }
  } finally {
    libc.close();
  }
  const handles = [];
  const bind = async (path, fifo) => {
    const before = await lstat(path, { bigint: true });
    if (
      (fifo ? !before.isFIFO() : !before.isFile()) ||
      before.uid !== BigInt(process.getuid?.() ?? -1) ||
      before.nlink !== 1n ||
      (before.mode & 0o777n) !== 0o600n
    )
      throw new Error('Original private guest IPC file required');
    const handle = await open(path, constants.O_RDWR | constants.O_NOFOLLOW | (fifo ? constants.O_NONBLOCK : 0));
    const original = identity(before);
    if (!same(identity(await handle.stat({ bigint: true })), original))
      throw new Error('Original guest IPC descriptor changed during open');
    handles.push({ path, handle, original });
    return { handle, binding: Object.freeze({ path, identity: Object.freeze(original) }) };
  };
  const request = await bind(paths.request, true),
    response = await bind(paths.response, true);
  const logs = {};
  for (const name of ['intent', 'delivered', 'observed']) {
    const path = join3(options.root, `${name}.private.bin`);
    const file = await open(path, 'wx', 384);
    await file.close();
    logs[name] = (await bind(path, false)).handle;
  }
  let retired = false,
    reading = false,
    writing = false;
  const queue = [];
  const assertFiles = async () => {
    if (retired) throw new Error('Original guest FIFO peer retired');
    const actual = await lstat(options.root, { bigint: true });
    if (
      !privateDirectory(actual) ||
      (await realpath(options.root)) !== options.root ||
      actual.dev !== rootIdentity.dev ||
      actual.ino !== rootIdentity.ino ||
      actual.uid !== rootIdentity.uid ||
      actual.mode !== rootIdentity.mode
    )
      throw new Error('Original guest IPC directory changed');
    for (const bound of [request, response]) {
      if (
        !same(identity(await lstat(bound.binding.path, { bigint: true })), bound.binding.identity) ||
        !same(identity(await bound.handle.stat({ bigint: true })), bound.binding.identity)
      )
        throw new Error('Original guest FIFO path or descriptor changed');
    }
    for (const bound of handles)
      if (
        !same(identity(await lstat(bound.path, { bigint: true })), bound.original) ||
        !same(identity(await bound.handle.stat({ bigint: true })), bound.original)
      )
        throw new Error('Original guest IPC journal path or descriptor changed');
  };
  const check = async (deadline) => {
    const now = linuxMonotonicMs();
    if (!Number.isSafeInteger(deadline) || deadline <= now || deadline - now > 60000)
      throw new Error('Original guest FIFO deadline exhausted or exceeds bound');
    await assertFiles();
    await assertCaller();
    await assertFiles();
    if (linuxMonotonicMs() >= deadline) throw new Error('Original guest FIFO deadline exhausted');
  };
  const record = async (name, raw) => {
    await logs[name].writeFile(raw);
    await logs[name].sync();
  };
  const retire = async () => {
    if (retired) return;
    retired = true;
    const failures = [];
    for (const bound of handles) {
      try {
        if (!same(identity(await bound.handle.stat({ bigint: true })), bound.original))
          throw new Error('Original guest IPC descriptor ownership changed before retirement');
        await bound.handle.close();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length) throw new AggregateError(failures, 'Original guest IPC retirement unresolved');
  };
  return Object.freeze({
    bindings: Object.freeze({ root: options.root, read: request.binding, write: response.binding }),
    async assertOriginal() {
      await assertFiles();
      await assertCaller();
      await assertFiles();
    },
    retire,
    async send(message, deadline) {
      if (writing) throw new Error('Original guest FIFO concurrent write refused');
      writing = true;
      try {
        await check(deadline);
        const raw = frames.encode(message);
        await record('intent', raw);
        for (let offset = 0; offset < raw.length; ) {
          await check(deadline);
          try {
            const { bytesWritten } = await request.handle.write(raw, offset, Math.min(4096, raw.length - offset), null);
            if (!bytesWritten) throw new Error('Original guest FIFO write interrupted');
            await record('delivered', raw.subarray(offset, offset + bytesWritten));
            offset += bytesWritten;
          } catch (error) {
            if (error.code !== 'EAGAIN') throw error;
            await Bun.sleep(Math.min(10, Math.max(0, deadline - linuxMonotonicMs())));
          }
        }
        await check(deadline);
      } finally {
        writing = false;
      }
    },
    async receive(deadline) {
      if (reading) throw new Error('Original guest FIFO concurrent read refused');
      reading = true;
      try {
        while (!queue.length) {
          await check(deadline);
          const raw = Buffer.alloc(4096);
          try {
            const { bytesRead } = await response.handle.read(raw, 0, raw.length, null);
            if (!bytesRead) throw new Error('Original guest FIFO frame interrupted');
            await record('observed', raw.subarray(0, bytesRead));
            queue.push(...frames.push(raw.subarray(0, bytesRead)));
          } catch (error) {
            if (error.code !== 'EAGAIN') throw error;
            await Bun.sleep(Math.min(10, Math.max(0, deadline - linuxMonotonicMs())));
          }
        }
        await check(deadline);
        const value = queue.shift();
        if (!value) throw new Error('Original guest FIFO message unavailable');
        return value;
      } finally {
        reading = false;
      }
    },
  });
}

// plugins/terraform/src/original-guest-parent.ts
var bindingKeys = [
  'project',
  'region',
  'site_name',
  'node_name',
  'zone',
  'instance_id',
  'observer_name',
  'observer_id',
  'observer_address',
  'address',
  'original_interfaces',
  'token_node',
  'token_site',
  'token_expires',
  'token_sha256',
  'ownership_sha256',
  'observer_key',
  'ce_key',
  'observer_hosts',
  'ce_hosts',
  'observer_algorithm',
  'ce_algorithm',
];
var captures = new Set([
  'health',
  'diagnosis',
  'vpm',
  'clock',
  'interfaces',
  'routes',
  'vpm-unit',
  'vpm-journal',
  'cloud-init',
  'failed-units',
  'boot-warnings',
  'cri-list',
  'docker-list',
  'journal-help',
  'cri-logs-help',
  'docker-logs-help',
  'vpm-journal-full',
  'boot-warnings-full',
]);
var inspections = new Set([
  'cri-inspect',
  'cri-logs',
  'docker-inspect',
  'docker-logs',
  'cri-logs-full',
  'docker-logs-full',
]);
var discoveries = new Set([
  'root',
  'status',
  'execcli',
  'journal',
  'cri-inspect',
  'cri-logs',
  'docker-inspect',
  'docker-logs',
]);
var requiredGuards = ['inputs', 'original', 'trust:observer', 'trust:ce'];
var object5 = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
var integer2 = (value) => typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 2 ** 31 - 1;
var keys = (value, expected) => Object.keys(value).sort().join(',') === [...expected].sort().join(',');
function frozen(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(frozen));
  if (object5(value))
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, frozen(item)])));
  return value;
}
function canonical3(value) {
  const sorted = (item) =>
    Array.isArray(item)
      ? item.map(sorted)
      : object5(item)
        ? Object.fromEntries(
            Object.keys(item)
              .sort()
              .map((key) => [key, sorted(item[key])]),
          )
        : item;
  return JSON.stringify(sorted(value));
}
function validateCommand(value) {
  assertOriginalGuestJson(value);
  const operation = value.operation;
  if (operation === 'close' && keys(value, ['operation'])) return { operation };
  if (
    operation === 'discover' &&
    keys(value, ['operation', 'scope']) &&
    typeof value.scope === 'string' &&
    discoveries.has(value.scope)
  )
    return { operation, scope: value.scope };
  if (operation === 'capture' && typeof value.kind === 'string') {
    if (captures.has(value.kind) && keys(value, ['operation', 'kind'])) return { operation, kind: value.kind };
    if (
      inspections.has(value.kind) &&
      keys(value, ['operation', 'kind', 'containerId']) &&
      typeof value.containerId === 'string' &&
      /^[a-f0-9]{12,64}$/.test(value.containerId)
    )
      return { operation, kind: value.kind, containerId: value.containerId };
  }
  throw new Error('Supported original guest command required');
}

class OriginalGuestCaptureFailure extends Error {
  result;
  constructor(result, causes) {
    super('Original guest capture remains incomplete', {
      cause: new AggregateError(causes, 'Original guest guard causes'),
    });
    this.result = frozen(structuredClone(result));
  }
}

class OriginalGuestControlParent {
  binding;
  peer;
  guards;
  clock;
  requestSha256;
  operation;
  closure;
  startup;
  state = 'new';
  anchor;
  commandId = 0;
  guardId = 0;
  pending = new Set();
  guardDenials = [];
  constructor(admission) {
    assertOriginalGuestJson(admission.binding);
    const binding = admission.binding;
    if (
      !object5(binding) ||
      !keys(binding, bindingKeys) ||
      bindingKeys
        .filter((key) => !['original_interfaces', 'token_expires'].includes(key))
        .some(
          (key) =>
            typeof binding[key] !== 'string' ||
            !binding[key] ||
            Array.from(binding[key]).some(
              (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
            ),
        ) ||
      typeof binding.token_expires !== 'number' ||
      !Number.isFinite(binding.token_expires) ||
      binding.token_expires <= 0 ||
      !Array.isArray(binding.original_interfaces) ||
      binding.original_interfaces.length !== 2 ||
      binding.original_interfaces.some((value) => typeof value !== 'string') ||
      !/^[1-9][0-9]{0,19}$/.test(String(binding.instance_id)) ||
      !/^[1-9][0-9]{0,19}$/.test(String(binding.observer_id)) ||
      binding.instance_id === binding.observer_id ||
      !/^[a-f0-9]{64}$/.test(admission.requestSha256) ||
      ![admission.operationDeadlineMs, admission.closureDeadlineMs, admission.startupDeadlineMs].every(
        Number.isSafeInteger,
      ) ||
      admission.operationDeadlineMs <= 0 ||
      admission.startupDeadlineMs > admission.operationDeadlineMs ||
      admission.closureDeadlineMs < admission.operationDeadlineMs ||
      admission.closureDeadlineMs > admission.operationDeadlineMs + 300000
    )
      throw new Error('Original complete guest binding and fixed deadlines required');
    this.binding = frozen(structuredClone(binding));
    this.peer = Object.freeze({
      send: admission.peer.send.bind(admission.peer),
      receive: admission.peer.receive.bind(admission.peer),
      assertOriginal: admission.peer.assertOriginal.bind(admission.peer),
      retire: admission.peer.retire.bind(admission.peer),
    });
    this.guards = Object.freeze({
      inputs: admission.guards.inputs.bind(admission.guards),
      original: admission.guards.original.bind(admission.guards),
      trust: admission.guards.trust.bind(admission.guards),
    });
    this.clock = admission.monotonic ?? linuxMonotonicMs;
    this.requestSha256 = admission.requestSha256;
    this.operation = admission.operationDeadlineMs;
    this.closure = admission.closureDeadlineMs;
    this.startup = admission.startupDeadlineMs;
  }
  within(deadline) {
    if (this.state === 'failed') throw new Error('Original guest parent retired');
    if (this.clock() >= deadline) throw new Error('Original guest parent deadline exhausted');
  }
  async check(deadline) {
    this.within(deadline);
    await this.peer.assertOriginal();
    this.within(deadline);
    await this.guards.inputs();
    this.within(deadline);
    await this.peer.assertOriginal();
    this.within(deadline);
  }
  async send(message, deadline) {
    await this.check(deadline);
    await this.peer.send(message, deadline);
    await this.check(deadline);
  }
  async receive(deadline) {
    await this.check(deadline);
    const value = await this.peer.receive(deadline);
    await this.check(deadline);
    assertOriginalGuestJson(value);
    if (!object5(value)) throw new Error('Original guest control message required');
    return value;
  }
  async run(operation, deadline) {
    this.within(deadline);
    const work = Promise.resolve().then(operation);
    this.pending.add(work);
    work.then(
      () => this.pending.delete(work),
      () => this.pending.delete(work),
    );
    let timer;
    const timeout = new Promise((_resolve, reject) => {
      timer = setTimeout(
        () => {
          this.state = 'failed';
          reject(new Error('Original guest parent deadline exhausted'));
        },
        Math.max(0, deadline - this.clock()),
      );
    });
    try {
      const value = await Promise.race([work, timeout]);
      this.within(deadline);
      return value;
    } catch (error) {
      if (error instanceof OriginalGuestCaptureFailure && (this.state === 'busy' || this.state === 'closing')) {
        this.state = this.state === 'closing' ? 'unresolved' : 'capture-failed';
        throw error;
      }
      this.state = 'failed';
      try {
        await this.peer.retire();
      } catch (closure) {
        throw new AggregateError([error, closure], 'Original guest control failure and IPC retirement unresolved');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  async guard(value, deadline, covered) {
    const role = value.role;
    const expected = [
      'type',
      'id',
      'guard',
      'anchor',
      'instanceId',
      'observerId',
      ...(value.guard === 'trust' ? ['role'] : []),
    ];
    if (
      !keys(value, expected) ||
      !integer2(value.id) ||
      value.id !== this.guardId + 1 ||
      value.anchor !== this.anchor ||
      value.instanceId !== this.binding.instance_id ||
      value.observerId !== this.binding.observer_id ||
      !['inputs', 'original', 'trust'].includes(String(value.guard)) ||
      (value.guard === 'trust' && role !== 'observer' && role !== 'ce')
    )
      throw new Error('Original guest parent guard attribution differs');
    if (this.state === 'closing' && value.guard !== 'inputs')
      throw new Error('Original guest parent is closing; cloud guards remain retired');
    await this.check(deadline);
    if (this.guardDenials.length && value.guard !== 'inputs')
      throw new Error('Original guest capture guards retired after denial', {
        cause: new AggregateError([...this.guardDenials], 'Original ownership or trust failures'),
      });
    let approved = true;
    try {
      if (value.guard === 'original') await this.guards.original(this.binding);
      else if (value.guard === 'trust') await this.guards.trust(this.binding, role);
    } catch (error) {
      approved = false;
      this.guardDenials.push(error);
    }
    await this.check(deadline);
    this.guardId++;
    if (approved) covered.add(value.guard === 'trust' ? `trust:${role}` : String(value.guard));
    await this.send(
      { type: 'guard-result', id: this.guardId, guard: value.guard, anchor: this.anchor, approved },
      deadline,
    );
  }
  async next(deadline, covered) {
    for (;;) {
      const value = await this.receive(deadline);
      if (value.type !== 'guard') return value;
      await this.guard(value, deadline, covered);
    }
  }
  async initialize() {
    if (this.state !== 'new') throw new Error('Original guest parent lifecycle already started');
    this.state = 'preparing';
    const began = this.clock();
    if (this.startup - began > 15000) throw new Error('Original guest parent startup exceeds fixed bound');
    const readyDeadline = Math.min(this.operation, this.startup);
    await this.run(async () => {
      const bound = await this.receive(this.startup);
      if (
        !keys(bound, ['type', 'requestSha256', 'anchor', 'binding']) ||
        bound.type !== 'worker-bound' ||
        bound.requestSha256 !== this.requestSha256 ||
        typeof bound.anchor !== 'string' ||
        !/^[a-f0-9]{64}$/.test(bound.anchor) ||
        canonical3(bound.binding) !== canonical3(this.binding)
      )
        throw new Error('Original guest worker binding differs');
      this.anchor = bound.anchor;
      await this.send(
        { type: 'binding-approved', requestSha256: this.requestSha256, anchor: this.anchor, approved: true },
        this.startup,
      );
    }, this.startup);
    await this.run(async () => {
      const covered = new Set();
      const ready = await this.next(readyDeadline, covered);
      if (
        !keys(ready, ['type', 'anchor', 'requestSha256']) ||
        ready.type !== 'worker-ready' ||
        ready.anchor !== this.anchor ||
        ready.requestSha256 !== this.requestSha256
      )
        throw new Error('Original guest worker readiness differs');
      if (requiredGuards.some((value) => !covered.has(value)))
        throw new Error('All independent original guest guards required before readiness');
    }, readyDeadline);
    this.state = 'ready';
  }
  async command(input) {
    if (this.state !== 'ready' && !(this.state === 'capture-failed' && input.operation === 'close'))
      throw new Error('Original guest parent command lifecycle differs');
    const command = validateCommand(input);
    const closing = command.operation === 'close';
    const deadline = Math.min(closing ? this.closure : this.operation, this.clock() + 60000);
    this.within(deadline);
    this.state = closing ? 'closing' : 'busy';
    const id = ++this.commandId;
    const value = await this.run(async () => {
      await this.send({ type: 'command', id, ...command }, deadline);
      const covered = new Set();
      const result = await this.next(deadline, covered);
      if (result.type === 'command-failure') {
        if (
          !keys(result, ['type', 'id', 'operation', 'anchor', 'guestAcceptanceComplete', 'evidence', 'errorType']) ||
          !integer2(result.id) ||
          result.id !== id ||
          result.operation !== command.operation ||
          result.anchor !== this.anchor ||
          result.guestAcceptanceComplete !== false ||
          typeof result.errorType !== 'string' ||
          !/^[A-Za-z_][A-Za-z_0-9]{0,79}$/.test(result.errorType) ||
          !Array.isArray(result.evidence) ||
          result.evidence.some((value) => !object5(value))
        )
          throw new Error('Original guest command failure attribution differs');
        throw new OriginalGuestCaptureFailure(result, [...this.guardDenials]);
      }
      if (
        !keys(result, [
          'type',
          'id',
          'operation',
          'anchor',
          'guestAcceptanceComplete',
          'evidence',
          ...(closing ? ['closed'] : []),
        ]) ||
        result.type !== 'command-result' ||
        !integer2(result.id) ||
        result.id !== id ||
        result.operation !== command.operation ||
        result.anchor !== this.anchor ||
        result.guestAcceptanceComplete !== false ||
        !Array.isArray(result.evidence) ||
        result.evidence.some((value) => !object5(value)) ||
        (closing && typeof result.closed !== 'boolean')
      )
        throw new Error('Original guest command result attribution differs');
      if (!closing && requiredGuards.some((value) => !covered.has(value)))
        throw new Error('All independent original guest guards required for capture');
      return frozen(structuredClone(result));
    }, deadline);
    this.state = closing ? (value.closed ? 'closed' : 'unresolved') : 'ready';
    return value;
  }
  pendingOperations() {
    return this.pending.size;
  }
  async settlePending() {
    await Promise.allSettled([...this.pending]);
  }
}

// plugins/terraform/src/installed-guest-worker.ts
var originalReaderClosures = new WeakMap();
var originalRoundSources = new WeakMap();
var originalRoundWorkers = new WeakMap();
async function assertOriginalInstalledGuestRoundWorker(value, context, nodeName) {
  const source = value && typeof value === 'object' ? originalRoundWorkers.get(value) : undefined;
  if (!source || source.context !== context || source.nodeName !== nodeName)
    throw new Error('Original installed guest round worker context differs');
  await source.assertOriginal();
}
async function collectInstalledOriginalGuestRound2(value) {
  if (!value || typeof value !== 'object') throw new Error('Original installed guest worker required');
  const collect = originalRoundSources.get(value);
  if (!collect) throw new Error('Original source-issued installed guest worker required');
  return collect();
}
async function collectInstalledOriginalGuestReaderClosures2(value) {
  const collect = value && typeof value === 'object' ? originalReaderClosures.get(value) : undefined;
  if (!collect) throw new Error('Original source-issued installed guest reader required');
  return collect();
}
var hash3 = (bytes) => createHash5('sha256').update(bytes).digest('hex');
var equalIdentity = (a, b) => !!a && !!b && ['pid', 'group', 'start', 'boot'].every((key) => a[key] === b[key]);
function inspectOriginalGuestCompletion(value, initial, actor) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Original guest completion required');
  const result = value;
  if (
    !equalIdentity(result.identity, actor) ||
    result.pid !== actor.pid ||
    result.signalsSent !== false ||
    result.originalGroupClosed !== true ||
    result.captureClosed !== true ||
    typeof result.actualExitCode !== 'number' ||
    !Number.isInteger(result.actualExitCode) ||
    result.actualExitCode < 0 ||
    [
      'originalDeadlineMs',
      'invocationStartedMs',
      'finalStartedMs',
      'finalDeadlineMs',
      'stdoutPath',
      'stderrPath',
      'submitted',
    ].some((key) => initial[key] !== undefined && result[key] !== initial[key])
  )
    throw new Error('Original guest completion identity, budget or closure differs');
  return Object.freeze(structuredClone(result));
}
async function openInstalledGuestWorker2(options) {
  return openOriginalGuestWorkerSource(options);
}
async function openInstalledFinalGuestWorker2(options, callback) {
  await assertOriginalApplyCallback(callback);
  if (callback.phase !== 'after' || !callback.reserve || callback.original !== options.context)
    throw new Error('Original final guest callback/context/reserve required');
  return openOriginalGuestWorkerSource(options, callback);
}
async function openOriginalGuestWorkerSource(options, after) {
  const context = options.context;
  const binding = Object.freeze(structuredClone(options.binding));
  const supplied = freezeAdmittedCaptureInputs(options.inputs);
  const guards = Object.freeze({
    inputs: options.guards.inputs.bind(options.guards),
    original: options.guards.original.bind(options.guards),
    trust: options.guards.trust.bind(options.guards),
  });
  if (
    context?.kind !== 'original-installed-gcp-capture-context' ||
    context.schemaVersion !== 2 ||
    context.owner?.provider !== 'gcp' ||
    context.owner.engine !== 'terraform' ||
    binding?.project !== context.owner.account ||
    binding.region !== context.owner.region ||
    context.budget.deadline - context.budget.start !== 7200000
  )
    throw new Error('Original installed GCP worker context and binding required');
  const budget = Object.freeze({ ...context.budget });
  const finalTiming = after?.reserve ? inspectFinalReaderReserve(after.reserve) : undefined;
  const assertContext = context.assertInputs,
    withinContext = after ? () => assertOriginalApplyCallback(after) : context.assertWithinDeadline;
  await assertContext();
  await withinContext();
  for (const [name, original] of Object.entries(context.inputs)) {
    if (!supplied[name]) throw new Error('Original installed worker context input missing');
    assertSameOriginalInput(original, supplied[name]);
  }
  const inputs = freezeAdmittedCaptureInputs({ ...context.inputs, ...supplied });
  const entry = inputs['script:guest_entrypoint.py'];
  if (
    !entry ||
    inputs.python?.sha256 !== installed_runtime_pins_default.pythonSha256 ||
    !inputs.ssh ||
    Object.entries(gcp_capture_source_pins_default.files).some(
      ([name, digest]) =>
        inputs[`script:${name}`]?.path !== join4(dirname2(entry.path), name) ||
        inputs[`script:${name}`]?.sha256 !== digest,
    ) ||
    ['observer_key', 'ce_key', 'observer_hosts', 'ce_hosts'].some(
      (name) => !inputs[name] || binding[name] !== inputs[name].path,
    )
  )
    throw new Error('Complete original installed guest source and input pins required');
  const inputMonitor = await monitorOriginalInputs2(inputs);
  const root = join4(context.executionDirectory, `gcp-guest-worker-${randomUUID4()}`);
  let actor, final;
  let executionDirectory;
  let requestBinding, admissionBinding, captureBinding;
  let completion;
  let terminal = false,
    initialized = false,
    started = false,
    disposed = false,
    submissions = 0;
  let outcome;
  let outcomeError;
  let requestMonitor;
  let collecting = false,
    roundFailure;
  let roundPromise;
  const rounds = [];
  const assertInputs = async (full = true) => {
    await assertContext();
    if (full) {
      await inputMonitor.assertOriginal();
      await requestMonitor?.assertOriginal();
    } else {
      await inputMonitor.assertOriginalIdentity();
      await requestMonitor?.assertOriginalIdentity();
    }
    await assertContext();
  };
  const assertActor = async () => {
    await assertInputs(false);
    if (!actor) throw new Error('Original installed guest actor not admitted');
    if (terminal) {
      if (
        !final ||
        !equalIdentity(final.identity, actor) ||
        final.pid !== actor.pid ||
        !final.originalGroupClosed ||
        final.actualExitCode !== 0 ||
        final.signalsSent !== false
      )
        throw new Error('Original installed guest terminal actor not qualified');
      await assertInputs(false);
      return;
    }
    const before = await readFile(`/proc/${actor.pid}/stat`, 'utf8');
    const fields = before
      .slice(before.lastIndexOf(') ') + 2)
      .trim()
      .split(/\s+/);
    if (
      ['T', 't', 'Z', 'X'].includes(fields[0]) ||
      fields[19] !== actor.start ||
      Number(fields[2]) !== actor.group ||
      Number(fields[1]) !== process.pid ||
      (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim() !== actor.boot ||
      (await readlink(`/proc/${actor.pid}/exe`)) !== (await realpath2(inputs.python.path))
    )
      throw new Error('Original installed guest process identity changed');
    const executable = await stat(`/proc/${actor.pid}/exe`, { bigint: true });
    if (
      ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'].some(
        (key) => String(executable[key]) !== inputs.python.expectedIdentity?.[key],
      )
    )
      throw new Error('Original installed guest executable identity changed');
    const after = await readFile(`/proc/${actor.pid}/stat`, 'utf8');
    const current = after
      .slice(after.lastIndexOf(') ') + 2)
      .trim()
      .split(/\s+/);
    if (current[19] !== actor.start || current[2] !== fields[2] || ['T', 't', 'Z', 'X'].includes(current[0]))
      throw new Error('Original installed guest actor changed during inspection');
    await assertInputs(false);
  };
  const nonce = randomBytes(32).toString('hex');
  const peer = await openOriginalGuestFifoPeer({ root, session: nonce, assertOriginal: assertActor });
  const persist = async (path, bytes) => {
    const handle = await open2(path, 'wx', 256);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
      const file = await handle.stat({ bigint: true }),
        parent = await lstat2(dirname2(path), { bigint: true });
      return Object.freeze({
        path,
        sha256: hash3(bytes),
        expectedIdentity: Object.freeze(
          Object.fromEntries(
            ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'].map((key) => [key, String(file[key])]),
          ),
        ),
        expectedParentIdentity: Object.freeze(
          Object.fromEntries(['dev', 'ino', 'uid', 'mode'].map((key) => [key, String(parent[key])])),
        ),
      });
    } finally {
      await handle.close();
    }
  };
  let parent;
  const run = async () => {
    const effectiveDeadline = finalTiming?.finalDeadlineMs ?? budget.deadline;
    const startup = Math.min(effectiveDeadline, linuxMonotonicMs() + 15000);
    const request = {
      schemaVersion: finalTiming ? 2 : 1,
      kind: finalTiming ? 'original-gcp-final-guest-worker' : 'original-gcp-guest-worker',
      nonce,
      inputs,
      binding,
      originalStartMs: budget.start,
      ...(finalTiming && after
        ? {
            originalDeadlineMs: budget.deadline,
            finalCapture: {
              callbackNonce: after.nonce,
              parentIdentity: after.execution.identity,
              finalStartedMs: finalTiming.finalStartedMs,
              finalDeadlineMs: finalTiming.finalDeadlineMs,
            },
          }
        : {}),
      deadlines: finalTiming ? [effectiveDeadline, effectiveDeadline] : [budget.deadline, budget.deadline + 300000],
      startupDeadlineMs: startup,
      ports: peer.bindings,
    };
    const raw = Buffer.from(JSON.stringify(request));
    const requestInput = await persist(join4(root, 'request.private.json'), raw);
    requestBinding = requestInput;
    requestMonitor = await monitorOriginalInputs2({ request: requestInput });
    parent = new OriginalGuestControlParent({
      peer,
      binding,
      requestSha256: requestInput.sha256,
      operationDeadlineMs: effectiveDeadline,
      closureDeadlineMs: finalTiming ? effectiveDeadline : budget.deadline + 300000,
      startupDeadlineMs: startup,
      guards,
    });
    const args = ['-I', '-B', entry.path, '--request', requestInput.path, '--sha256', requestInput.sha256];
    const executionPolicy = {
      python: { path: inputs.python.path, sha256: inputs.python.sha256 },
      executable: { path: inputs.python.path, sha256: inputs.python.sha256 },
      originalStartMs: budget.start,
      originalDeadlineMs: budget.deadline,
      assertOriginal: () => assertInputs(false),
      beforeRelease: async (admitted) => {
        await assertInputs();
        if (
          actor ||
          admitted.originalStartMs !== budget.start ||
          admitted.originalDeadlineMs !== budget.deadline ||
          admitted.directory !== root ||
          JSON.stringify(admitted.args) !== JSON.stringify(args) ||
          admitted.startupDeadlineMs < startup
        )
          throw new Error('Original installed guest execution admission differs');
        const bootstrap = decodeEvidenceObject(await readFile(join4(dirname2(admitted.stdoutPath), 'bootstrap.json')));
        if (
          !equalIdentity(admitted.identity, bootstrap) ||
          bootstrap.pythonSha256 !== inputs.python.sha256 ||
          bootstrap.ppid !== process.pid ||
          typeof bootstrap.sdkCreateTime !== 'number' ||
          !Number.isFinite(bootstrap.sdkCreateTime)
        )
          throw new Error('Original installed guest kernel and SDK admission differs');
        actor = Object.freeze({ ...admitted.identity });
        executionDirectory = dirname2(admitted.stdoutPath);
        admissionBinding = await persist(
          join4(root, 'original-execution.private.json'),
          Buffer.from(
            JSON.stringify({
              schemaVersion: 1,
              kind: 'original-installed-guest-worker-admission',
              owner: context.owner,
              phase: after ? 'after' : 'before',
              requestSha256: requestInput.sha256,
              identity: actor,
              bootstrap,
              args,
              budget,
            }),
          ),
        );
        await assertActor();
      },
      finalCapture: async (capture) => {
        captureBinding = await persist(
          join4(root, 'final-execution.private.json'),
          Buffer.from(JSON.stringify(capture)),
        );
        if (
          !equalIdentity(capture.identity, actor) ||
          capture.pid !== actor?.pid ||
          capture.originalDeadlineMs !== budget.deadline ||
          capture.signalsSent !== false
        )
          throw new Error('Original installed guest final execution differs');
        final = Object.freeze(structuredClone(capture));
        await assertInputs();
        if (initialized && capture.actualExitCode === null && parent) {
          await parent.settlePending();
          try {
            await parent.command({ operation: 'close' });
          } catch (error) {
            outcomeError ??= error;
          }
        }
      },
    };
    const execute = after?.reserve
      ? signalFreeFinalGuestWorkerExecutor(executionPolicy, after.reserve)
      : signalFreeTerraformExecutor(executionPolicy);
    submissions++;
    outcome = execute({ cwd: root, args, env: { PATH: '/usr/bin:/bin' } });
    outcome.then(
      () => {
        terminal = true;
      },
      (error) => {
        terminal = true;
        outcomeError = error;
      },
    );
    while (!actor && !terminal && linuxMonotonicMs() < startup) {
      await assertInputs();
      await Bun.sleep(10);
    }
    if (!actor || terminal || linuxMonotonicMs() >= startup)
      throw new Error('Original installed guest startup deadline or admission unavailable');
    await parent.initialize();
    initialized = true;
  };
  const commandOriginal = async (value) => {
    if (!initialized || disposed || !parent) throw new Error('Original installed guest command lifecycle unavailable');
    await assertInputs();
    if (after) await assertOriginalApplyCallback(after);
    const result = await parent.command(value);
    await assertInputs();
    return result;
  };
  const worker = Object.freeze({
    root,
    async initialize() {
      if (started || disposed) throw new Error('Original installed guest lifecycle already started or retired');
      started = true;
      await assertInputs();
      await withinContext();
      try {
        await run();
      } catch (error) {
        outcomeError ??= error;
        const details =
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : { name: 'unknown' };
        await persist(
          join4(root, 'startup-failure.private.json'),
          Buffer.from(JSON.stringify({ details, budget, guestAcceptanceComplete: false })),
        );
        throw error;
      }
    },
    async command(value) {
      if (collecting || (roundFailure && value.operation !== 'close'))
        throw new Error('Original guest collection active or refused');
      return commandOriginal(value);
    },
    async dispose() {
      if (disposed) return;
      if (roundPromise) await Promise.allSettled([roundPromise]);
      if (initialized && !terminal && parent) {
        try {
          await parent.command({ operation: 'close' });
        } catch (error) {
          outcomeError ??= error;
        }
      }
      await peer.retire();
      if (outcome) await Promise.allSettled([outcome]);
      await assertInputs();
      if (started && terminal && final && actor && executionDirectory) {
        const path = join4(executionDirectory, 'completion.private.json');
        const before = await lstat2(path, { bigint: true });
        if (
          !before.isFile() ||
          before.isSymbolicLink() ||
          before.uid !== BigInt(process.getuid?.() ?? -1) ||
          before.nlink !== 1n ||
          (before.mode & 0o077n) !== 0n
        )
          throw new Error('Original owned guest completion required');
        const raw = await readFile(path);
        const after = await lstat2(path, { bigint: true });
        if (
          ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'].some((key) => before[key] !== after[key])
        )
          throw new Error('Original guest completion changed during review');
        completion = inspectOriginalGuestCompletion(decodeEvidenceObject(raw), final, actor);
        await persist(
          join4(root, 'completion-review.private.json'),
          Buffer.from(
            JSON.stringify({
              original: actor,
              initialCapture: final,
              completion,
              completionSha256: hash3(raw),
              guestAcceptanceComplete: false,
            }),
          ),
        );
      }
      if (
        started &&
        (!terminal ||
          !final ||
          !equalIdentity(final.identity, actor) ||
          !completion ||
          completion.originalGroupClosed !== true ||
          completion.actualExitCode === null)
      )
        throw new Error('Original installed guest closure unresolved; original evidence remains held');
      requestMonitor?.close();
      inputMonitor.close();
      disposed = true;
    },
    evidence() {
      return Object.freeze({
        root,
        identity: actor,
        final,
        completion,
        submissions,
        terminal,
        disposed,
        collectionRounds: rounds.length,
        ...(roundFailure ? { collectionFailureRetained: true } : {}),
        ...(outcomeError ? { executionFailureRetained: true } : {}),
        ...(finalTiming ? { originalFinalCapture: finalTiming, originalParent: after?.execution.identity } : {}),
        guestAcceptanceComplete: false,
      });
    },
  });
  originalReaderClosures.set(worker, async () => {
    if (submissions === 0) return Object.freeze([]);
    if (!terminal || !final || !actor || !executionDirectory || !requestBinding || !admissionBinding || !captureBinding)
      throw new Error('Original guest reader terminal execution and immutable source bindings required');
    const monitor = await monitorOriginalInputs2({
      request: requestBinding,
      admission: admissionBinding,
      capture: captureBinding,
    });
    try {
      const closure = await collectOriginalReaderGroupClosure2({
        directory: root,
        capture: final,
        originalBudget: budget,
        pythonSha256: inputs.python.sha256,
        executableSha256: inputs.python.sha256,
        gateSha256: hash3(Buffer.from(signalFreeBootstrapSource)),
        captureBinding,
        origin: {
          schemaVersion: 1,
          kind: 'original-installed-guest-reader-origin',
          owner: context.owner,
          phase: after ? 'after' : 'before',
          nodeName: String(binding.node_name),
          instanceId: String(binding.instance_id),
          observerId: String(binding.observer_id),
          tokenSha256: String(binding.token_sha256),
          ownershipSha256: String(binding.ownership_sha256),
          request: requestBinding,
          admission: admissionBinding,
        },
      });
      await monitor.assertOriginal();
      return Object.freeze([closure]);
    } finally {
      monitor.close();
    }
  });
  originalRoundWorkers.set(worker, {
    context,
    nodeName: binding.node_name,
    async assertOriginal() {
      if (!initialized || disposed || terminal || roundFailure || outcomeError)
        throw new Error('Original installed guest round worker is retired or refused');
      await withinContext();
      await assertActor();
    },
  });
  originalRoundSources.set(worker, async () => {
    if (!initialized || disposed || terminal || collecting || roundFailure)
      throw new Error('Original installed guest round lifecycle unavailable, active or refused');
    const previous = rounds.at(-1);
    if (previous && linuxMonotonicMs() - previous.finishedMonotonicMs < 45000)
      throw new Error('Original guest rounds require forty-five-second spacing');
    collecting = true;
    roundPromise = (async () => {
      await withinContext();
      await assertActor();
      const report = await runOriginalGuestCaptureRound(
        {
          async assertOriginal() {
            await withinContext();
            await assertActor();
          },
          command: commandOriginal,
          async persist(event) {
            await persist(
              join4(root, `guest-round-event-${randomUUID4()}.private.json`),
              Buffer.from(JSON.stringify(event)),
            );
          },
        },
        {
          instanceId: String(binding.instance_id),
          observerId: String(binding.observer_id),
          tokenSha256: String(binding.token_sha256),
          ownershipSha256: String(binding.ownership_sha256),
        },
        finalTiming?.finalDeadlineMs ?? budget.deadline,
      );
      rounds.push(report);
      return report;
    })();
    try {
      return await roundPromise;
    } catch (error) {
      roundFailure ??= error;
      throw error;
    } finally {
      collecting = false;
    }
  });
  return worker;
}

// plugins/terraform/src/installed-capture-factory.ts
// plugins/terraform/src/installed-apply-trace-stage.ts
import { randomUUID as randomUUID5, randomUUID as randomUUID9 } from 'node:crypto';
import { join as join8 } from 'node:path';

async function openInstalledApplyTraceStage2(input) {
  const { context, store, providerPath, onResponse, onObservation } = input;
  const directory = store.directory;
  const plan = await context.readOriginalPlanSource?.();
  if (!plan) throw new Error('Original apply trace owning plan required');
  await assertOriginalTerraformPlanProjection(plan);
  const binding = Object.freeze({
    terraformVersion: plan.terraformVersion,
    providerLockSha256: plan.receipt.providerLockSha256,
  });
  const profile = resolveInstalledGcpVersionProfile(binding);
  const configInput = context.inputs['workspace:main.tf.json'];
  if (
    !configInput ||
    plan.directory !== context.executionDirectory ||
    plan.scope.cloud !== 'gcp' ||
    plan.scope.account !== context.owner.account ||
    plan.scope.region !== context.owner.region ||
    configInput.sha256 !== plan.receipt.configurationSha256
  )
    throw new Error('Original apply trace owning configuration differs');
  const originalConfig = await owned(configInput.path);
  assertSameOriginalInput(configInput, originalConfig.binding);
  const configuration = originalConfig.bytes.toString();
  const config = decodeEvidenceObject(originalConfig.bytes);
  await store.verify();
  const saved = await store.read('gcp-terraform-input-identity.json');
  const provider = config.provider?.google;
  const reason = Object.freeze({
    schemaVersion: 1,
    scope: 'gcp-terraform-deployment',
    intentFingerprint: fingerprint(saved.intent),
    reason: provider?.[0]?.request_reason,
  });
  if (
    !Array.isArray(provider) ||
    provider.length !== 1 ||
    saved.intentFingerprint !== fingerprint(saved.intent) ||
    saved.intent.project !== context.owner.account ||
    saved.intent.region !== context.owner.region ||
    saved.intent.deploymentName !== context.owner.deploymentId
  )
    throw new Error('One original Google request reason required');
  assertGcpTerraformRequestReason(reason, saved.intent, profile.googleVersion);
  if (fingerprint(reason) !== saved.requestReasonFingerprint)
    throw new Error('Original saved request reason fingerprint differs');
  const savedHash = fingerprint(saved);
  const budget = Object.freeze({ ...context.budget });
  const targets = Object.freeze(
    plan.resources
      .filter((resource) => resource.type === 'google_compute_instance')
      .map((resource) => {
        if (resource.mode !== 'managed' || resource.actions.join(',') !== 'create')
          throw new Error('Original trace supports reviewed initial instance creates only');
        const known = (key) => {
          const field = resource.fields[key];
          if (field?.status !== 'known' || typeof field.value !== 'string')
            throw new Error('Original known trace target required');
          return field.value;
        };
        const target = Object.freeze({
          address: resource.address,
          name: known('name'),
          project: known('project'),
          zone: known('zone'),
        });
        if (
          !/^[a-z][a-z0-9-]{0,62}$/.test(target.name) ||
          target.project !== context.owner.account ||
          !target.zone.startsWith(`${context.owner.region}-`)
        )
          throw new Error('Original trace target scope differs');
        return target;
      }),
  );
  if (!targets.length || new Set(targets.map((target) => `${target.zone}/${target.name}`)).size !== targets.length)
    throw new Error('Unique original trace targets required');
  const parsers = targets.map((target) => ({
    target,
    parser: new GoogleHttpRpcTraceParser2(
      {
        rpc: 'ApplyResourceChange',
        resourceType: 'google_compute_instance',
        method: 'POST',
        url: `https://compute.googleapis.com/compute/v1/projects/${target.project}/zones/${target.zone}/instances?alt=json`,
        requestReason: reason.reason,
        instanceName: target.name,
        planSha256: plan.receipt.planSha256,
      },
      binding,
    ),
  }));
  const ui = new TerraformApplyHookParser2(plan.receipt, binding, configuration);
  const lifecycle = new GoogleProviderLifecycleParser({ providerPath, planSha256: plan.receipt.planSha256 }, binding);
  const hooks = [],
    rpcs = [];
  const responses = [],
    bodies = [];
  const responded = new Set();
  let prepared = false,
    started = false,
    finalStarted = false,
    retired = false,
    parentClosed = false;
  let finalUnresolved = false;
  let observing = false;
  let before, after;
  let actor;
  let pending, closure;
  let failure;
  let transcript;
  const assertDurablePlanInputs = await bindOriginalTerraformPlanInputs(context, plan);
  let completedOutputInputs;
  const inputs = async (requireLivePlan = true) => {
    await context.assertInputs();
    if (requireLivePlan) await assertOriginalTerraformPlanProjection(plan);
    await assertDurablePlanInputs();
    await store.verify();
    if (
      store.directory !== directory ||
      fingerprint(store.owner) !== fingerprint(context.owner) ||
      fingerprint(await store.read('gcp-terraform-input-identity.json')) !== savedHash ||
      context.budget.start !== budget.start ||
      context.budget.deadline !== budget.deadline
    )
      throw new Error('Original apply trace inputs changed');
    assertSameOriginalInput(configInput, (await owned(configInput.path)).binding);
  };
  const retain = async (phase, value = {}) => {
    await store.verify();
    await store.write(`gcp-apply-trace-${randomUUID5()}.json`, {
      schemaVersion: 1,
      kind: 'original-installed-apply-trace-event',
      phase,
      owner: context.owner,
      originalBudget: budget,
      planSha256: plan.receipt.planSha256,
      executor: actor?.identity,
      ...value,
      executionQualified: false,
    });
  };
  const captureFailure = async (phase, error) => {
    failure ??= error;
    await retain(phase, {
      errorType: error instanceof Error ? error.name : typeof error,
      ...(error instanceof Error ? { errorMessage: error.message } : {}),
      responses: responses.length,
      hooks: hooks.length,
      rpcs: rpcs.length,
    });
  };
  const assertSettlement = async () => {
    if (retired || finalUnresolved) throw new Error('Original trace settlement retired or unresolved');
    await inputs();
    if (finalStarted) {
      if (!after?.reserve) throw new Error('Original trace final settlement callback required');
      await assertOriginalApplyCallback(after);
      await assertFinalReaderReserve(after.reserve);
    } else await context.assertWithinDeadline();
    if (retired || finalUnresolved) throw new Error('Original trace settlement retired or unresolved');
  };
  const dispatch = async (selected, callback) => {
    for (const response of selected.parser.takeOriginalResponses()) {
      if (responded.has(selected.target.address)) throw new Error('Original insert response delivery was replayed');
      responded.add(selected.target.address);
      responses.push(response);
      await readOriginalGoogleHttpResponseSource2(response);
      await retain('response', { target: selected.target, response });
      if (!finalStarted && !failure) {
        try {
          await onResponse(Object.freeze({ target: selected.target, response, originalPlan: plan, binding, callback }));
          await assertSettlement();
        } catch (error) {
          await captureFailure('delivery-refused', error);
        }
        if (retired || finalUnresolved) throw new Error('Original trace capture retired with unresolved delivery');
      }
    }
  };
  const readRound = async (callback) => {
    if (!actor) throw new Error('Original output actor required');
    let read = false;
    for (const channel of ['stdout', 'stderr']) {
      const chunk = await actor.output.read(channel);
      if (!chunk) continue;
      read = true;
      if (channel === 'stdout') hooks.push(...ui.pushOriginal(actor.output, chunk));
      else {
        rpcs.push(...lifecycle.pushOriginal(actor.output, chunk));
        for (const selected of parsers) {
          for (const candidate of selected.parser.pushOriginal(actor.output, chunk))
            bodies.push(selected.parser.consumeBodies(candidate));
        }
        for (const selected of parsers) await dispatch(selected, callback);
      }
    }
    return read;
  };
  const observe = async (callback) => {
    if (!onObservation || failure || finalStarted || retired) return;
    if (!actor) throw new Error('Original observation actor unavailable');
    observing = true;
    try {
      const prefix = await readOriginalExecutionPrefix2(actor.output);
      await onObservation(
        Object.freeze({ callback, originalPlan: plan, binding, responses: Object.freeze([...responses]) }),
      );
      if (retired || finalUnresolved) throw new Error('Original observation retired before settlement');
      const current = await readOriginalExecutionPrefix2(actor.output);
      for (const channel of ['stdout', 'stderr'])
        if (current[channel].bytes !== prefix[channel].bytes || current[channel].sha256 !== prefix[channel].sha256)
          throw new Error('Original observation consumed the sole reader output');
      await assertSettlement();
    } catch (error) {
      await captureFailure('observation-refused', error);
      throw error;
    } finally {
      observing = false;
    }
  };
  const worker = {
    async prepare(original) {
      if (original !== context || started || finalStarted || retired)
        throw new Error('Original trace preparation context differs');
      await inputs();
      await context.assertWithinDeadline();
      prepared = true;
    },
    async start(admission, callback) {
      if (callback?.phase !== 'before' || callback.original !== context || admission !== callback.execution)
        throw new Error('Original trace before callback and exact admission required');
      await assertOriginalApplyCallback(callback);
      if (!prepared || started || finalStarted || retired)
        throw new Error('Original trace startup already claimed or unprepared');
      started = true;
      actor = admission;
      before = callback;
      try {
        await inputs();
        const prefix = await readOriginalExecutionPrefix2(admission.output);
        if (
          prefix.directory !== context.executionDirectory ||
          prefix.stdout.bytes !== 0 ||
          prefix.stderr.bytes !== 0 ||
          ['pid', 'group', 'start', 'boot'].some((key) => prefix.identity[key] !== admission.identity[key])
        )
          throw new Error('Original trace needs the same unconsumed output issuer');
        await assertOriginalApplyCallback(callback);
        if (finalStarted || retired) throw new Error('Original trace startup retired during verification');
        await retain('started');
        pending = (async () => {
          try {
            while (!finalStarted && !retired) {
              await inputs();
              if (finalStarted || retired) break;
              await context.assertWithinDeadline();
              if (finalStarted || retired) break;
              const read = await readRound(callback);
              await observe(callback);
              if (!read) await Bun.sleep(100);
            }
          } catch (error) {
            await captureFailure('capture-refused', error);
          }
        })();
        pending.catch((error) => {
          failure ??= error;
        });
      } catch (error) {
        await captureFailure('startup-refused', error);
        throw error;
      }
    },
    async assertOriginal() {
      if (retired || finalStarted || failure) throw new Error('Original trace retired or incomplete');
      await inputs();
      await context.assertWithinDeadline();
    },
    async finalCapture(capture, reserve, callback) {
      if (
        !callback ||
        !reserve ||
        callback.reserve !== reserve ||
        callback.phase !== 'after' ||
        callback.original !== context
      )
        throw new Error('Original trace final callback and reserve required');
      await assertOriginalApplyCallback(callback);
      if (finalStarted || retired) throw new Error('Original trace final capture already claimed');
      const timing = inspectFinalReaderReserve(reserve);
      if (
        !actor ||
        !before ||
        before.nonce !== callback.nonce ||
        callback.execution.output !== actor.output ||
        !capture.identity ||
        capture.pid !== capture.identity.pid ||
        capture.signalsSent !== false ||
        capture.originalDeadlineMs !== budget.deadline ||
        capture.finalStartedMs !== timing.finalStartedMs ||
        capture.finalDeadlineMs !== timing.finalDeadlineMs ||
        timing.originalStartMs !== budget.start ||
        timing.originalDeadlineMs !== budget.deadline ||
        ['pid', 'group', 'start', 'boot'].some((key) => capture.identity?.[key] !== actor?.identity[key])
      )
        throw new Error('Original trace final actor or budget differs');
      after = callback;
      finalStarted = true;
      const failures = [];
      let watching = true;
      const watch = (async () => {
        while (watching) {
          await assertFinalReaderReserve(reserve);
          if (watching) await Bun.sleep(100);
        }
      })();
      try {
        await Promise.race([pending ?? Promise.resolve(), watch]);
      } catch (error) {
        finalUnresolved = true;
        await captureFailure('final-unresolved', error);
        throw new AggregateError([error], 'Original apply trace reader unresolved in final reserve');
      } finally {
        watching = false;
      }
      try {
        await inputs();
        await assertFinalReaderReserve(reserve);
        while (await readRound(callback)) {
          await assertFinalReaderReserve(reserve);
          await inputs();
        }
        const completion = await actor.output.finish();
        await acknowledgeOriginalApplyGroupClosure2(callback, completion);
        completedOutputInputs = await readOriginalCompletedOutputInputs(actor.output, completion);
        parentClosed = true;
        ui.finishOriginal(actor.output, completion);
        lifecycle.finishOriginal(actor.output, completion);
        for (const selected of parsers) selected.parser.finishOriginal(actor.output, completion);
        transcript = Object.freeze({
          originalPlan: plan,
          binding,
          configuration,
          providerPath,
          targets,
          hooks: Object.freeze([...hooks]),
          rpcs: Object.freeze([...rpcs]),
          responses: Object.freeze([...responses]),
          bodies: Object.freeze([...bodies]),
          completion,
          executionQualified: false,
        });
        await retain('final', { hooks, rpcs, responses, bodies, completion });
        await assertFinalReaderReserve(reserve);
        await inputs();
        if (responses.length !== targets.length || bodies.length !== targets.length)
          throw new Error('Original trace insertion coverage incomplete');
      } catch (error) {
        failures.push(error);
        await captureFailure('final-refused', error);
      }
      if (failure) failures.push(failure);
      if (failures.length) throw new AggregateError(failures, 'Original apply trace capture incomplete');
    },
    closeAfterExecutorExit() {
      closure ??= (async () => {
        retired = true;
        if (!started) {
          await inputs(false);
          await retain('preflight-closed', { submitted: false });
          return;
        }
        if (!finalStarted) {
          const error = new Error('Original trace final proof required before closure');
          await captureFailure('closure-refused', error);
          throw error;
        }
        if (finalUnresolved) throw new Error('Original trace closure unresolved; original reader evidence retained');
        if (!finalStarted || !parentClosed || !transcript) throw new Error('Original trace closure incomplete');
        await pending;
        await inputs(false);
        if (!completedOutputInputs) throw new Error('Original complete trace output bindings required');
        for (const binding of Object.values(completedOutputInputs)) {
          const file = await owned(binding.path);
          assertSameOriginalInput(binding, file.binding);
        }
        await retain('closed', { deliveryComplete: !failure });
        if (failure) throw new Error('Original trace closure incomplete; original failure retained');
      })();
      return closure;
    },
  };
  return Object.freeze({
    ...worker,
    whenSettled: () => pending ?? Promise.resolve(),
    coverage: () =>
      Object.freeze({
        expected: targets.length,
        responses: responses.length,
        completed: !!transcript,
        failed: !!failure,
        observationActive: observing,
        executionQualified: false,
      }),
    async readTranscript(callback) {
      if (
        retired ||
        !transcript ||
        callback.phase !== 'after' ||
        callback.original !== context ||
        !before ||
        callback.nonce !== before.nonce
      )
        throw new Error('Original trace transcript unavailable or retired');
      await assertOriginalApplyCallback(callback);
      await inputs();
      if (!actor) throw new Error('Original trace transcript actor unavailable');
      const current = await actor.output.finish();
      if (
        current.stdout.sha256 !== transcript.completion.stdout.sha256 ||
        current.stderr.sha256 !== transcript.completion.stderr.sha256 ||
        current.stdout.bytes !== transcript.completion.stdout.bytes ||
        current.stderr.bytes !== transcript.completion.stderr.bytes
      )
        throw new Error('Original trace transcript descriptor bytes changed');
      return transcript;
    },
  });
}

// plugins/terraform/src/installed-before-guest-round.ts
async function scheduleInstalledBeforeGuestRound2(slot, callback, persist) {
  await assertOriginalApplyLifetime(callback);
  if (
    slot.failure ||
    slot.roundActive ||
    !slot.worker ||
    (slot.nextRoundAtMs !== undefined && linuxMonotonicMs() < slot.nextRoundAtMs)
  )
    return false;
  const { worker, nodeName } = slot;
  await assertOriginalInstalledGuestRoundWorker(worker, callback.original, nodeName);
  if (slot.worker !== worker || slot.nodeName !== nodeName)
    throw new Error('Original before guest dispatch worker changed');
  if (slot.failure || slot.roundActive || (slot.nextRoundAtMs !== undefined && linuxMonotonicMs() < slot.nextRoundAtMs))
    return false;
  slot.roundActive = true;
  slot.round = collectInstalledOriginalGuestRound2(worker)
    .then(async (report) => {
      if (slot.worker !== worker || slot.nodeName !== nodeName)
        throw new Error('Original before guest dispatch worker changed during capture');
      slot.nextRoundAtMs = report.finishedMonotonicMs + 45000;
      await persist({ phase: 'before-guest-round', nodeName, report });
      return report;
    })
    .catch(async (error) => {
      slot.failure ??= error;
      await persist({
        phase: 'before-guest-round-refused',
        nodeName,
        errorType: error instanceof Error ? error.name : typeof error,
      });
    })
    .finally(() => {
      slot.roundActive = false;
    });
  slot.round.catch((error) => {
    slot.failure ??= error;
  });
  return true;
}

// plugins/terraform/src/installed-capture-coordinator.ts
var sameActor2 = (a, b) => ['pid', 'group', 'start', 'boot'].every((key) => a[key] === b[key]);
function createInstalledCaptureCoordinator(context, options) {
  const { stages: initialize, persist } = options;
  const budget = Object.freeze({ ...context.budget });
  let preparation;
  let stages;
  let graphsQualified = false;
  let actor;
  let before;
  let startupClaimed = false,
    finalClaimed = false,
    closing = false,
    closed = false;
  let operationFailure;
  let finalPromise;
  let finalCapture;
  let after;
  let closePromise;
  const record = (phase, name, error) =>
    persist(
      Object.freeze({
        schemaVersion: 1,
        kind: 'original-installed-capture-coordinator-event',
        phase,
        ...(name ? { stage: name } : {}),
        ...(error ? { errorType: error instanceof Error ? error.name : typeof error } : {}),
        owner: context.owner,
        budget,
        executionQualified: false,
      }),
    );
  const inputs = async () => {
    if (context.budget.start !== budget.start || context.budget.deadline !== budget.deadline)
      throw new Error('Original collector operation budget changed');
    await context.assertInputs();
  };
  const within = async () => {
    await inputs();
    await context.assertWithinDeadline();
  };
  const checkCallback = async (value, phase) => {
    await assertOriginalApplyCallback(value);
    if (value.phase !== phase || value.original !== context || value.execution.directory !== context.executionDirectory)
      throw new Error('Original collector callback context differs');
    if (actor && !sameActor2(actor.identity, value.execution.identity))
      throw new Error('Original collector execution actor differs');
    if (before && before.nonce !== value.nonce) throw new Error('Original collector callback lifetime differs');
  };
  const stageSet = () => {
    if (!stages) throw new Error('Original collector stages are not prepared');
    return stages;
  };
  const captureGuard = async () => {
    if (!after?.reserve) throw new Error('Original collector final callback required');
    await inputs();
    await checkCallback(after, 'after');
    await assertFinalReaderReserve(after.reserve);
  };
  const aggregate = (failures, message) => {
    if (failures.length) throw new AggregateError(failures, message);
  };
  return {
    prepare(original) {
      if (original !== context || startupClaimed || finalClaimed || closing || closed)
        return Promise.reject(new Error('Original collector preparation context or lifecycle differs'));
      preparation ??= (async () => {
        try {
          await within();
          const supplied = await initialize(context);
          if (
            !supplied.length ||
            supplied.some((stage) => !/^[a-z][a-z0-9-]{0,63}$/.test(stage.name)) ||
            new Set(supplied.map((stage) => stage.name)).size !== supplied.length
          )
            throw new Error('Unique original collector stages required');
          stages = Object.freeze(
            supplied.map((stage) =>
              Object.freeze({
                name: stage.name,
                finalAfter: Object.freeze([...(stage.finalAfter ?? [])]),
                closeAfter: Object.freeze([...(stage.closeAfter ?? [])]),
                worker: Object.freeze({
                  prepare: stage.worker.prepare?.bind(stage.worker),
                  start: stage.worker.start.bind(stage.worker),
                  assertOriginal: stage.worker.assertOriginal.bind(stage.worker),
                  finalCapture: stage.worker.finalCapture.bind(stage.worker),
                  closeAfterExecutorExit: stage.worker.closeAfterExecutorExit.bind(stage.worker),
                }),
              }),
            ),
          );
          for (const [key, phase] of [
            ['finalAfter', 'final'],
            ['closeAfter', 'closure'],
          ]) {
            const visiting = new Set(),
              visited = new Set();
            const visit = (name) => {
              if (visiting.has(name)) throw new Error(`Original collector ${phase} dependencies are cyclic`);
              if (visited.has(name)) return;
              const stage = stageSet().find((stage) => stage.name === name);
              if (!stage) throw new Error(`Original collector ${phase} dependency is unavailable`);
              visiting.add(name);
              for (const dependency of stage[key] ?? []) visit(dependency);
              visiting.delete(name);
              visited.add(name);
            };
            for (const stage of stages) visit(stage.name);
          }
          graphsQualified = true;
          for (const stage of stages) {
            await within();
            await stage.worker.prepare?.(context);
            await within();
            await record('prepared', stage.name);
          }
        } catch (error) {
          operationFailure ??= error;
          try {
            await record('preparation-refused', undefined, error);
          } catch (retention) {
            throw new AggregateError([error, retention], 'Original collector preparation retention failed');
          }
          throw error;
        }
      })();
      return preparation;
    },
    async start(admission, callback) {
      if (!callback) throw new Error('Original collector before callback required');
      await checkCallback(callback, 'before');
      if (startupClaimed || finalClaimed || closing || closed || operationFailure)
        throw new Error('Original collector startup already claimed or refused');
      if (!preparation) throw new Error('Original collector preparation required before startup');
      await preparation;
      await checkCallback(callback, 'before');
      if (startupClaimed || finalClaimed || closing || closed || operationFailure)
        throw new Error('Original collector startup already claimed or refused');
      if (
        admission !== callback.execution ||
        !sameActor2(admission.identity, callback.execution.identity) ||
        admission.directory !== context.executionDirectory ||
        admission.originalStartMs !== budget.start ||
        admission.originalDeadlineMs !== budget.deadline ||
        admission.args[0] !== 'apply'
      )
        throw new Error('Original collector apply admission differs');
      startupClaimed = true;
      actor = admission;
      before = callback;
      try {
        for (const stage of stageSet()) {
          await checkCallback(callback, 'before');
          await stage.worker.start(admission, callback);
          await checkCallback(callback, 'before');
          await record('started', stage.name);
        }
      } catch (error) {
        operationFailure ??= error;
        try {
          await record('startup-refused', undefined, error);
        } catch (retention) {
          throw new AggregateError([error, retention], 'Original collector startup retention failed');
        }
        throw error;
      }
    },
    async assertOriginal() {
      if (closed || closing || finalClaimed || operationFailure)
        throw new Error('Original collector lifetime retired or refused');
      await within();
      if (stages) for (const stage of stages) await stage.worker.assertOriginal();
      await within();
    },
    async finalCapture(capture, reserve, callback) {
      if (!callback || !reserve || callback.reserve !== reserve)
        throw new Error('Original collector after callback and actual reserve required');
      await checkCallback(callback, 'after');
      if (finalClaimed || closed || closing) throw new Error('Original collector final capture already claimed');
      const timing = inspectFinalReaderReserve(reserve);
      if (
        !capture.identity ||
        !sameActor2(capture.identity, callback.execution.identity) ||
        capture.pid !== capture.identity.pid ||
        capture.originalDeadlineMs !== budget.deadline ||
        timing.originalStartMs !== budget.start ||
        timing.originalDeadlineMs !== budget.deadline ||
        capture.finalStartedMs !== timing.finalStartedMs ||
        capture.finalDeadlineMs !== timing.finalDeadlineMs ||
        capture.signalsSent !== false
      )
        throw new Error('Original collector final actor or unchanged budget differs');
      finalClaimed = true;
      finalCapture = capture;
      after = callback;
      finalPromise = (async () => {
        const failures = [];
        try {
          await record('final-started');
        } catch (error) {
          failures.push(error);
        }
        const pending = new Map();
        const captureStage = (name) => {
          const existing = pending.get(name);
          if (existing) return existing;
          const stage = stageSet().find((stage) => stage.name === name);
          if (!stage) return Promise.reject(new Error('Original collector final stage unavailable'));
          const promise = (async () => {
            await Promise.allSettled((stage.finalAfter ?? []).map(captureStage));
            try {
              await captureGuard();
              await stage.worker.finalCapture(capture, reserve, callback);
              await captureGuard();
              await record('final-captured', name);
            } catch (error) {
              failures.push(error);
              try {
                await record('final-refused', name, error);
              } catch (retention) {
                failures.push(retention);
              }
            }
          })();
          pending.set(name, promise);
          return promise;
        };
        await Promise.allSettled(stageSet().map((stage) => captureStage(stage.name)));
        aggregate(failures, 'Original collector final capture incomplete');
      })();
      await finalPromise;
    },
    closeAfterExecutorExit() {
      closePromise ??= (async () => {
        if (!stages || !graphsQualified) throw new Error('Original collector closure dependencies are unavailable');
        if (startupClaimed && (!finalClaimed || !finalPromise || !finalCapture))
          throw new Error('Original collector final capture and parent closure required');
        if (startupClaimed && !finalCapture?.originalGroupClosed) await assertOriginalApplyGroupClosed2(after);
        closing = true;
        const failures = [];
        try {
          await finalPromise;
        } catch (error) {
          failures.push(error);
        }
        try {
          await inputs();
        } catch (error) {
          failures.push(error);
        }
        const pending = new Map();
        const closeStage = (name) => {
          const existing = pending.get(name);
          if (existing) return existing;
          const stage = stageSet().find((stage) => stage.name === name);
          if (!stage) return Promise.reject(new Error('Original collector closure stage unavailable'));
          const promise = (async () => {
            await Promise.allSettled((stage.closeAfter ?? []).map(closeStage));
            try {
              await stage.worker.closeAfterExecutorExit();
              await record('stage-closed', stage.name);
            } catch (error) {
              try {
                await record('closure-refused', stage.name, error);
              } catch (retention) {
                throw new AggregateError([error, retention], 'Original collector closure retention failed');
              }
              throw error;
            }
          })();
          pending.set(name, promise);
          return promise;
        };
        const outcomes = await Promise.allSettled(stageSet().map((stage) => closeStage(stage.name)));
        for (const outcome of outcomes) if (outcome.status === 'rejected') failures.push(outcome.reason);
        aggregate(failures, 'Original collector closure incomplete; failed captures retained');
        await record(startupClaimed ? 'closed' : 'preflight-closed');
        closed = true;
      })();
      return closePromise;
    },
  };
}

// plugins/terraform/src/installed-ce-insert-witnesses.ts
async function collectInstalledCeInsertWitnesses2(input) {
  const targets = Object.freeze(input.targets.map((target) => Object.freeze({ ...target })));
  const bodies = Object.freeze([...input.bodies]);
  const hooks = Object.freeze([...input.hooks]);
  const rpcs = Object.freeze([...input.rpcs]);
  const windows = Object.freeze([...input.windows]);
  if (
    !targets.length ||
    new Set(targets.map((target) => target.address)).size !== targets.length ||
    new Set(targets.map((target) => `${target.project}/${target.zone}/${target.name}`)).size !== targets.length
  )
    throw new Error('Unique original CE witness targets required');
  const originalBodies = [];
  for (const body of bodies) {
    await readOriginalGoogleHttpRpcSource2(body);
    originalBodies.push({ body, request: decodeEvidenceObject(Buffer.from(body.requestBody)) });
  }
  const results = [];
  for (const target of targets) {
    const matching = originalBodies.filter(
      ({ body, request }) =>
        request.name === target.name &&
        body.rpc === 'ApplyResourceChange' &&
        body.resourceType === 'google_compute_instance' &&
        body.method === 'POST' &&
        body.url ===
          `https://compute.googleapis.com/compute/v1/projects/${target.project}/zones/${target.zone}/instances?alt=json`,
    );
    if (matching.length !== 1) throw new Error('Unique original CE insert body required');
    const body = matching[0].body;
    const insert = inspectOriginalGcpInsertBodies2(body, input.binding);
    const starts = hooks.filter((hook) => hook.address === target.address && hook.phase === 'apply_start');
    const completions = hooks.filter((hook) => hook.address === target.address && hook.phase === 'apply_complete');
    const matchingRpcs = rpcs.filter(
      (rpc) =>
        rpc.rpcRequestId === insert.rpcRequestId &&
        rpc.rpc === 'ApplyResourceChange' &&
        rpc.resourceType === 'google_compute_instance',
    );
    if (starts.length !== 1 || completions.length !== 1 || matchingRpcs.length !== 1)
      throw new Error('Unique original CE UI and RPC sources required');
    const rpc = matchingRpcs[0];
    const candidate = await collectOriginalGcpInsertWitnesses2({
      originalPlan: input.originalPlan,
      configuration: input.configuration,
      providerPath: input.providerPath,
      binding: input.binding,
      insert,
      started: starts[0],
      completed: completions[0],
      rpc,
      windows: windows.filter((window) => window.observations.some((row) => row.candidate.pid === rpc.providerPid)),
    });
    const witnesses = await readOriginalGcpInsertWitnesses2(candidate);
    if (
      candidate.resourceAddress !== target.address ||
      candidate.project !== target.project ||
      candidate.zone !== target.zone ||
      candidate.nodeName !== target.name
    )
      throw new Error('Original CE target and witnessed insertion differ');
    results.push(Object.freeze({ target, candidate, witnesses }));
  }
  return Object.freeze(results);
}

// plugins/terraform/src/installed-delete-capture.ts
import { randomUUID as randomUUID6 } from 'node:crypto';
import { join as join5 } from 'node:path';

var sourceReaders2 = new WeakMap();
async function collectInstalledOriginalDeleteReaderSources(value) {
  const collect = value && typeof value === 'object' ? sourceReaders2.get(value) : undefined;
  if (!collect) throw new Error('Original source-issued delete capture required');
  return collect();
}
async function openInstalledDeleteCapture2(input) {
  const { context, store, plan, intent } = input;
  await assertOriginalTerraformPlanProjection(plan);
  await context.assertInputs();
  await store.verify();
  if (
    (await context.readOriginalPlanSource?.()) !== plan ||
    plan.directory !== context.executionDirectory ||
    plan.scope.cloud !== 'gcp' ||
    context.owner.provider !== 'gcp' ||
    context.owner.engine !== 'terraform' ||
    plan.scope.account !== context.owner.account ||
    plan.scope.region !== context.owner.region ||
    plan.receipt.deploymentId !== context.owner.deploymentId ||
    ['provider', 'engine', 'account', 'region', 'deploymentId'].some(
      (key) => store.owner[key] !== context.owner[key],
    ) ||
    plan.receipt.configurationSha256 !== context.inputs['workspace:main.tf.json']?.sha256 ||
    plan.receipt.providerLockSha256 !== context.inputs['workspace:.terraform.lock.hcl']?.sha256
  )
    throw new Error('Original delete capture owning context differs');
  const admitted = context.inputs['workspace:gcp-terraform-input-identity.json'];
  if (!admitted || admitted.path !== join5(store.directory, 'gcp-terraform-input-identity.json'))
    throw new Error('Original delete capture intent input required');
  const original = await owned(admitted.path);
  assertSameOriginalInput(admitted, original.binding);
  const saved = JSON.parse(original.bytes.toString());
  if (
    fingerprint(intent) !== saved.intentFingerprint ||
    fingerprint(saved.intent) !== saved.intentFingerprint ||
    saved.platformContext !== intent.platformContext
  )
    throw new Error('Original delete capture admitted intent differs');
  if (plan.receipt.operation !== 'destroy' || plan.receipt.actionInvocations?.length)
    throw new Error('Original delete-only resource plan required');
  const expected = new Map();
  for (const resource of publicTerraformCloudScope(intent)) {
    const parts = resource.selfLink.split('/');
    const name = parts.at(-1);
    if (!name) throw new Error('Declared original cleanup name required');
    const type = `google_compute_${resource.kind}`;
    const fields = { name, project: intent.project };
    if (parts.includes('zones')) fields.zone = parts[parts.indexOf('zones') + 1];
    if (parts.includes('regions')) fields.region = parts[parts.indexOf('regions') + 1];
    expected.set(`${type}.${name.replaceAll('-', '_')}`, { type, fields });
  }
  for (const resource of publicTerraformPlatformScope(intent)) {
    const token = 'tokenName' in resource ? resource.tokenName : undefined;
    const fields = { name: token ?? resource.siteName, namespace: 'system' };
    if (token) fields.site_name = resource.siteName;
    expected.set(resource.address, { type: token ? 'xcsh_token' : 'xcsh_securemesh_site_v2', fields });
  }
  for (const row of plan.resources) {
    if (row.mode === 'data') {
      if (!['read', 'no-op'].includes(row.actions.join(','))) throw new Error('Delete-only data mutation refused');
      continue;
    }
    const declared = expected.get(row.address);
    if (!declared || declared.type !== row.type || row.actions.join(',') !== 'delete')
      throw new Error('Original delete-only declared resource required');
    for (const [name, expectedValue] of Object.entries(declared.fields)) {
      const field = row.fields[name];
      if (field?.status !== 'known' || field.value !== expectedValue)
        throw new Error('Original cleanup resource identity differs');
    }
    const id = row.fields.id;
    if (id?.status !== 'known' || typeof id.value !== 'string' || !id.value)
      throw new Error('Original cleanup resource ID required');
  }
  const assertDurablePlanInputs = await bindOriginalTerraformPlanInputs(context, plan);
  const budget = Object.freeze({ ...context.budget });
  let prepared = false,
    started = false,
    finalStarted = false,
    closed = false;
  let actor;
  let finalComplete = false;
  let completedOutputs;
  let failure;
  let closure;
  const inputs = async (requireLivePlan = true) => {
    await context.assertInputs();
    if (requireLivePlan) await assertOriginalTerraformPlanProjection(plan);
    await assertDurablePlanInputs();
    await store.verify();
    if (context.budget.start !== budget.start || context.budget.deadline !== budget.deadline)
      throw new Error('Original cleanup capture budget differs');
  };
  const assertCompletedOutputs = async () => {
    if (!actor) return;
    if (!completedOutputs) throw new Error('Original complete delete output bindings required');
    const monitor = await monitorOriginalInputs2(completedOutputs, {
      allowEmpty: Object.keys(completedOutputs).filter(
        (name) => completedOutputs?.[name].expectedIdentity?.size === '0',
      ),
    });
    try {
      await inputs(false);
      await monitor.assertOriginal();
    } finally {
      monitor.close();
    }
  };
  const persist = async (phase, extra = {}) => {
    await store.verify();
    await store.write(`gcp-delete-capture-${randomUUID6()}.json`, {
      schemaVersion: 1,
      kind: 'original-installed-delete-capture-event',
      phase,
      owner: context.owner,
      planSha256: plan.receipt.planSha256,
      originalBudget: budget,
      executor: actor?.identity,
      ...extra,
      executionAuthorized: false,
      independentAbsenceQualified: false,
      guestAcceptanceComplete: false,
    });
  };
  const port = {
    async prepare(original) {
      if (original !== context || started || finalStarted || closed || failure)
        throw new Error('Original delete capture preparation context or lifecycle differs');
      await inputs();
      await context.assertWithinDeadline();
      await persist('prepared', { resources: plan.resources });
      prepared = true;
    },
    async start(admission, callback) {
      if (!callback || callback.original !== context || callback.phase !== 'before' || callback.execution !== admission)
        throw new Error('Original delete capture before callback required');
      await assertOriginalApplyCallback(callback);
      if (!prepared || started || finalStarted || closed || failure)
        throw new Error('Original delete capture startup already claimed or unprepared');
      started = true;
      actor = admission;
      try {
        await inputs();
        const prefix = await readOriginalExecutionPrefix2(admission.output);
        if (
          prefix.directory !== context.executionDirectory ||
          ['pid', 'group', 'start', 'boot'].some((key) => prefix.identity[key] !== admission.identity[key]) ||
          prefix.stdout.bytes !== 0 ||
          prefix.stderr.bytes !== 0
        )
          throw new Error('Original unconsumed delete output issuer required');
        await assertOriginalApplyCallback(callback);
        await persist('started');
      } catch (error) {
        failure = error;
        await persist('startup-refused', { errorType: error instanceof Error ? error.name : typeof error });
        throw error;
      }
    },
    async assertOriginal() {
      if (closed || finalStarted || failure) throw new Error('Original delete capture lifetime retired or refused');
      await inputs();
      await context.assertWithinDeadline();
    },
    async finalCapture(capture, reserve, callback) {
      if (
        !callback ||
        !reserve ||
        callback.reserve !== reserve ||
        callback.original !== context ||
        callback.phase !== 'after' ||
        finalStarted ||
        closed ||
        !actor
      )
        throw new Error('Original reserved delete final callback required');
      await assertOriginalApplyCallback(callback);
      const timing = inspectFinalReaderReserve(reserve);
      if (
        !capture.identity ||
        capture.signalsSent !== false ||
        capture.originalDeadlineMs !== budget.deadline ||
        capture.finalStartedMs !== timing.finalStartedMs ||
        capture.finalDeadlineMs !== timing.finalDeadlineMs ||
        ['pid', 'group', 'start', 'boot'].some((key) => capture.identity?.[key] !== actor?.identity[key])
      )
        throw new Error('Original delete final actor or reserve differs');
      finalStarted = true;
      try {
        await inputs();
        await assertFinalReaderReserve(reserve);
        for (const channel of ['stdout', 'stderr']) {
          for (;;) {
            const chunk = await actor.output.read(channel);
            if (!chunk) break;
            await assertFinalReaderReserve(reserve);
            const original = readOriginalExecutionChunk(actor.output, chunk, channel);
            if (
              original.directory !== context.executionDirectory ||
              ['pid', 'group', 'start', 'boot'].some((key) => original.identity[key] !== actor?.identity[key])
            )
              throw new Error('Original delete output record identity differs');
            await persist('output', {
              channel,
              offset: original.offset,
              endOffset: original.endOffset,
              sha256: original.sha256,
              bytesBase64: original.bytes.toString('base64'),
            });
          }
        }
        const completion = await actor.output.finish();
        await acknowledgeOriginalApplyGroupClosure2(callback, completion);
        completedOutputs = await readOriginalCompletedOutputInputs(actor.output, completion);
        await persist('final', {
          completion,
          submitted: capture.submitted,
          actualExitCode: capture.actualExitCode,
          finalReserve: timing,
          earlierFailureRetained: !!failure,
        });
        await inputs();
        await assertFinalReaderReserve(reserve);
        finalComplete = true;
      } catch (error) {
        failure ??= error;
        await persist('final-refused', { errorType: error instanceof Error ? error.name : typeof error });
        throw error;
      }
      if (failure) throw new Error('Original delete capture incomplete; earlier failure retained');
    },
    closeAfterExecutorExit() {
      closure ??= (async () => {
        if (started && !finalComplete) throw new Error('Original delete capture final closure unresolved');
        await inputs(false);
        await assertCompletedOutputs();
        await persist(started ? 'closed' : 'preflight-closed', { earlierFailureRetained: !!failure });
        closed = true;
        if (failure) throw new Error('Original delete capture failure remains retained');
      })();
      return closure;
    },
  };
  sourceReaders2.set(port, async () => {
    await closure;
    if (!closed) throw new Error('Original delete source closure required');
    await inputs(false);
    await assertCompletedOutputs();
    return Object.freeze([Object.freeze({ name: 'delete-output', attemptCount: 0, witnesses: Object.freeze([]) })]);
  });
  return Object.freeze(port);
}

// plugins/terraform/src/installed-inventory-capture-stage.ts
import { randomUUID as randomUUID7 } from 'node:crypto';

async function openInstalledInventoryCaptureStage(input, options = {}) {
  const { context, store, platform } = input;
  const scope = await prepareOriginalGcpInventoryScope2(context, store);
  const declared = await inspectOriginalGcpInventoryScope2(scope);
  const inventory = await openInstalledInitialInventory2({ context, store, platform, scope }, options);
  let snapshot;
  let baseline;
  let preparation;
  let before;
  let after;
  let actor;
  let started = false,
    finalStarted = false,
    parentClosed = false,
    closed = false;
  let closure;
  const budget = Object.freeze({ ...context.budget });
  const retain = async (phase, extra = {}) => {
    await store.verify();
    await store.write(`gcp-inventory-stage-${randomUUID7()}.json`, {
      schemaVersion: 1,
      kind: 'original-installed-inventory-capture-stage-event',
      phase,
      owner: context.owner,
      planSha256: declared.planSha256,
      originalBudget: budget,
      resources: declared.resources,
      executor: actor?.identity,
      ...extra,
      executionAuthorized: false,
      guestAcceptanceComplete: false,
    });
  };
  const within = async () => {
    if (closed || finalStarted) throw new Error('Original inventory capture lifetime retired');
    await context.assertInputs();
    await context.assertWithinDeadline();
    if (context.budget.start !== budget.start || context.budget.deadline !== budget.deadline)
      throw new Error('Original inventory operation budget changed');
  };
  const worker = {
    prepare(original) {
      if (original !== context || started || closed || finalStarted)
        return Promise.reject(new Error('Original inventory preparation context differs'));
      preparation ??= (async () => {
        try {
          await within();
          snapshot = await inventory.capture();
          const observed = await inventory.inspect(snapshot);
          if (observed.planSha256 !== declared.planSha256 || observed.resources.length !== declared.resources.length)
            throw new Error('Original inventory prepared coverage differs');
          await retain('captured', { cloudCount: observed.cloudCount, platformCount: observed.platformCount });
        } catch (error) {
          await retain('preparation-refused', { errorType: error instanceof Error ? error.name : typeof error });
          throw error;
        }
      })();
      return preparation;
    },
    async start(admission, callback) {
      if (!callback) throw new Error('Original inventory before callback required');
      await assertOriginalApplyCallback(callback);
      if (callback.original !== context || callback.phase !== 'before' || callback.execution !== admission)
        throw new Error('Original inventory actual apply admission required');
      if (!preparation) throw new Error('Original inventory preflight must precede startup');
      await preparation;
      await assertOriginalApplyCallback(callback);
      if (started || finalStarted || closed || !snapshot)
        throw new Error('Original inventory startup already claimed or unavailable');
      started = true;
      actor = admission;
      before = callback;
      try {
        baseline = await inventory.bindForApply(snapshot, callback);
        await retain('bound');
      } catch (error) {
        await retain('binding-refused', { errorType: error instanceof Error ? error.name : typeof error });
        throw error;
      }
    },
    async assertOriginal() {
      await within();
      if (snapshot && !started) await inventory.assertSnapshot(snapshot);
      if (baseline && before) await assertOriginalApplyGcpInventoryCallback2(baseline, before);
    },
    async finalCapture(capture, reserve, callback) {
      if (
        !callback ||
        !reserve ||
        callback.phase !== 'after' ||
        callback.original !== context ||
        callback.reserve !== reserve
      )
        throw new Error('Original inventory reserved final callback required');
      await assertOriginalApplyCallback(callback);
      if (finalStarted || closed) throw new Error('Original inventory final capture already claimed');
      const timing = inspectFinalReaderReserve(reserve);
      if (
        capture.originalDeadlineMs !== budget.deadline ||
        capture.finalStartedMs !== timing.finalStartedMs ||
        capture.finalDeadlineMs !== timing.finalDeadlineMs ||
        !capture.identity ||
        ['pid', 'group', 'start', 'boot'].some((key) => capture.identity?.[key] !== callback.execution.identity[key])
      )
        throw new Error('Original inventory final actor or budget differs');
      finalStarted = true;
      after = callback;
      parentClosed = capture.originalGroupClosed;
      await assertFinalReaderReserve(reserve);
      if (!baseline) {
        await retain('final-unbound', { finalReserve: timing, beforeBaselineUnavailable: true });
        throw new Error('Original inventory final capture incomplete; baseline was not bound');
      }
      try {
        await assertOriginalApplyGcpInventoryCallback2(baseline, callback);
        const source = await readOriginalApplyGcpInventory2(baseline, callback);
        await retain('final-bound', { finalReserve: timing, cloudCount: source.cloud.length });
        await assertFinalReaderReserve(reserve);
      } catch (error) {
        await retain('final-refused', {
          errorType: error instanceof Error ? error.name : typeof error,
          finalReserve: timing,
        });
        throw error;
      }
    },
    closeAfterExecutorExit() {
      closure ??= (async () => {
        if (started && !finalStarted) throw new Error('Original inventory parent closure required');
        if (started && !parentClosed) await assertOriginalApplyGroupClosed2(after);
        await inventory.close();
        closeOriginalGcpInventoryScope2(scope);
        closed = true;
      })();
      return closure;
    },
  };
  return Object.freeze({
    ...worker,
    coverage: () =>
      Object.freeze({
        resources: snapshot ? declared.resources.length : 0,
        baselineBound: !!baseline,
        executionAuthorized: false,
        guestAcceptanceComplete: false,
      }),
    async readSnapshot() {
      if (!snapshot || closed || finalStarted) throw new Error('Original inventory snapshot unavailable');
      await inventory.assertSnapshot(snapshot);
      return snapshot;
    },
    async readBaseline(callback) {
      if (!baseline || closed) throw new Error('Original bound inventory source unavailable');
      await assertOriginalApplyGcpInventoryCallback2(baseline, callback);
      return baseline;
    },
  });
}

// plugins/terraform/src/installed-observer-insert-witnesses.ts
import { createHash as createHash6 } from 'node:crypto';

async function collectInstalledObserverInsertWitnesses2(input) {
  const { callback, originalPlan: plan, body, started, completed, rpc } = input;
  await assertOriginalApplyCallback(callback);
  if (callback.phase !== 'after' || !callback.reserve)
    throw new Error('Original final observer witness callback required');
  await assertOriginalTerraformPlanProjection(plan);
  const original = await readOriginalGcpObserverAuditSource(input.identity, callback, input.baseline);
  const hash = (text) => createHash6('sha256').update(text).digest('hex');
  const expected = original.value;
  if (
    plan.directory !== callback.original.executionDirectory ||
    plan.scope.cloud !== 'gcp' ||
    plan.scope.account !== expected.project ||
    plan.terraformVersion !== input.binding.terraformVersion ||
    plan.receipt.providerLockSha256 !== input.binding.providerLockSha256 ||
    plan.receipt.planSha256 !== expected.planSha256 ||
    hash(input.configuration) !== plan.receipt.configurationSha256
  )
    throw new Error('Original observer witness plan and configuration differ');
  const uiStart = await readOriginalTerraformApplyHookSource2(started);
  const uiEnd = await readOriginalTerraformApplyHookSource2(completed);
  const http = await readOriginalGoogleHttpRpcSource2(body);
  const lifecycle = readOriginalGoogleProviderRpcSource(rpc);
  const executor = callback.execution.identity;
  for (const value of [uiStart, uiEnd, http, lifecycle]) {
    if (
      value.directory !== plan.directory ||
      value.planSha256 !== plan.receipt.planSha256 ||
      ['pid', 'group', 'start', 'boot'].some((key) => value.executor[key] !== executor[key]) ||
      value.stderrSha256 !== uiStart.stderrSha256 ||
      value.stderrBytes !== uiStart.stderrBytes
    )
      throw new Error('Original observer witness descriptor or executor differs');
  }
  if (
    uiEnd.stdoutSha256 !== uiStart.stdoutSha256 ||
    uiEnd.stdoutBytes !== uiStart.stdoutBytes ||
    http.stdoutSha256 !== uiStart.stdoutSha256 ||
    http.stdoutBytes !== uiStart.stdoutBytes ||
    started.address !== expected.address ||
    completed.address !== expected.address ||
    started.phase !== 'apply_start' ||
    completed.phase !== 'apply_complete' ||
    started.action !== 'create' ||
    completed.action !== 'create' ||
    started.resourceType !== 'google_compute_instance' ||
    completed.resourceType !== started.resourceType ||
    started.actionIndex !== completed.actionIndex ||
    completed.idKey !== 'id' ||
    completed.idValue !== `projects/${expected.project}/zones/${expected.zone}/instances/${expected.name}` ||
    body.requestBodySha256 !== expected.requestBodySha256 ||
    body.responseBodySha256 !== expected.responseBodySha256 ||
    body.requestReasonSha256 !== original.requestReasonSha256 ||
    body.planSha256 !== expected.planSha256 ||
    body.rpcRequestId !== rpc.rpcRequestId ||
    rpc.rpc !== 'ApplyResourceChange' ||
    rpc.resourceType !== 'google_compute_instance' ||
    rpc.providerPathSha256 !== hash(input.providerPath) ||
    body.receivedRecordSha256 !== rpc.receivedRecordSha256 ||
    body.servedRecordSha256 !== rpc.servedRecordSha256 ||
    uiStart.eventEpochMs > lifecycle.receivedEpochMs ||
    uiEnd.eventEpochMs < lifecycle.servedEpochMs
  )
    throw new Error('Original observer UI HTTP and RPC witness mapping differs');
  const correspondence = await corroborateOriginalGoogleRpcProvider({
    rpc,
    windows: input.windows,
    binding: input.binding,
  });
  await readOriginalGcpObserverAuditSource(input.identity, callback, input.baseline);
  await readOriginalTerraformApplyHookSource2(started);
  await readOriginalTerraformApplyHookSource2(completed);
  await readOriginalGoogleHttpRpcSource2(body);
  readOriginalGoogleProviderRpcSource(rpc);
  await assertOriginalApplyCallback(callback);
  return Object.freeze({
    schemaVersion: 1,
    kind: 'original-installed-observer-insert-witnesses',
    role: 'observer',
    resourceAddress: expected.address,
    planSha256: expected.planSha256,
    executor,
    uiSourceCorroborated: true,
    httpSourceCorroborated: true,
    rpcWindowTimeCorroborated: true,
    requestBodySha256: body.requestBodySha256,
    responseBodySha256: body.responseBodySha256,
    rpcRequestId: rpc.rpcRequestId,
    correspondence,
    originalInsertQualified: false,
    executionAuthorized: false,
  });
}

// plugins/terraform/src/installed-ssh-clients.ts
import { homedir } from 'node:os';
import { join as join6 } from 'node:path';

class InstalledGcpSshClientSetupRequired extends Error {
  constructor() {
    super('Install and set up the Terraform plugin SSH clients before GCP guest capture');
  }
}
async function openInstalledGcpSshClientProfile(environment = process.env) {
  const env = { ...environment };
  const root =
    env.XCSH_TERRAFORM_SSH_CLIENTS_DIR ??
    join6(homedir(), '.local/share/xcsh/terraform/ssh-clients', gcp_ssh_client_pins_default.version);
  const inputs = {};
  let profile;
  try {
    const installer = await owned(join6(import.meta.dir, '../scripts/install_ssh_clients.py'));
    if (installer.binding.sha256 !== gcp_ssh_client_pins_default.installerSha256)
      throw new InstalledGcpSshClientSetupRequired();
    inputs['installation:installer'] = installer.binding;
    for (const [name, expected] of [
      ['archive.zip', gcp_ssh_client_pins_default.archiveSha256],
      ['LICENCE', gcp_ssh_client_pins_default.licenseSha256],
      ['BUILD.json', gcp_ssh_client_pins_default.buildSha256],
    ]) {
      const input = await owned(join6(root, name), 16 * 1024 * 1024);
      if (input.binding.sha256 !== expected) throw new InstalledGcpSshClientSetupRequired();
      inputs[`installation:${name}`] = input.binding;
    }
    const declaration = await owned(join6(root, 'installation.json'));
    const original = decodeEvidenceObject(declaration.bytes);
    if (
      original.schemaVersion !== 1 ||
      original.scope !== 'user' ||
      original.version !== gcp_ssh_client_pins_default.version ||
      original.platform !== gcp_ssh_client_pins_default.platform ||
      original.privilegedOperations !== false ||
      original.archiveSha256 !== gcp_ssh_client_pins_default.archiveSha256 ||
      original.licenseSha256 !== gcp_ssh_client_pins_default.licenseSha256 ||
      original.buildSha256 !== gcp_ssh_client_pins_default.buildSha256 ||
      fingerprint(original.files) !==
        fingerprint(
          Object.fromEntries(
            Object.entries(gcp_ssh_client_pins_default.files).map(([name, declaration]) => [name, declaration.sha256]),
          ),
        )
    )
      throw new InstalledGcpSshClientSetupRequired();
    inputs['installation:declaration'] = declaration.binding;
    profile = await openGcpSshClientProfile(root, { originalInputs: Object.freeze(inputs) });
    await readOriginalGcpSshClientProfile(profile);
    return profile;
  } catch (error) {
    if (profile) closeOriginalGcpSshClientProfile(profile);
    if (error instanceof InstalledGcpSshClientSetupRequired) throw error;
    throw new InstalledGcpSshClientSetupRequired();
  }
}
async function assertInstalledGcpSshClientSetup(environment = process.env) {
  const profile = await openInstalledGcpSshClientProfile(environment);
  try {
    await readOriginalGcpSshClientProfile(profile);
  } finally {
    closeOriginalGcpSshClientProfile(profile);
  }
}

// plugins/terraform/src/installed-vm-capture.ts
import { randomUUID as randomUUID8 } from 'node:crypto';
import { constants as constants2 } from 'node:fs';
import { lstat as lstat3, mkdir as mkdir2, open as open3 } from 'node:fs/promises';
import { join as join7 } from 'node:path';

async function openInstalledVmCapture2(input) {
  if (process.platform !== 'linux') throw new Error('Original GCP VM capture requires the qualified Linux runtime');
  const { callback: before, baseline, reader } = input;
  if (before?.phase !== 'before') throw new Error('Original before-apply VM capture required');
  await assertOriginalApplyGcpInventoryCallback2(baseline, before);
  await assertOriginalInstalledGcpCloudReader2(reader, before.original);
  const inventory = await readOriginalApplyGcpInventory2(baseline);
  const context = before.original;
  const budget = Object.freeze({ ...context.budget });
  const expectedParent = context.inputs['workspace:main.tf.json']?.expectedParentIdentity;
  const assertDirectory = async () => {
    const current = await lstat3(context.executionDirectory, { bigint: true });
    if (
      !current.isDirectory() ||
      current.isSymbolicLink() ||
      !expectedParent ||
      ['dev', 'ino', 'uid', 'mode'].some((key) => String(current[key]) !== expectedParent[key])
    )
      throw new Error('Original VM capture execution directory changed');
  };
  await assertDirectory();
  const slots = new Map();
  for (const row of inventory.cloud) {
    if (row.target.kind !== 'instance') continue;
    if (!['ce', 'observer'].includes(row.role) || slots.has(row.target.name))
      throw new Error('Unique original CE/observer VM inventory required');
    slots.set(
      row.target.name,
      Object.freeze({
        name: row.target.name,
        zone: row.target.zone,
        address: row.address,
        role: row.role,
      }),
    );
  }
  for (const [name, slot] of slots) slots.set(name, { ...slot });
  if (!slots.size) throw new Error('Original VM inventory is empty');
  const directory = join7(context.executionDirectory, `gcp-vm-capture-${randomUUID8()}`);
  await mkdir2(directory, { mode: 448 });
  const directoryIdentity = await lstat3(directory, { bigint: true });
  let phase = 'before';
  let refused = false,
    busy = false;
  let activeFinish;
  let finalNames;
  let packetReader = reader;
  const retain = async (event, value) => {
    await assertDirectory();
    const parent = await lstat3(directory, { bigint: true });
    if (
      !parent.isDirectory() ||
      parent.isSymbolicLink() ||
      parent.uid !== BigInt(process.getuid?.() ?? -1) ||
      (parent.mode & 0o777n) !== 0o700n ||
      ['dev', 'ino', 'uid', 'mode'].some((key) => parent[key] !== directoryIdentity[key])
    )
      throw new Error('Original VM capture retention directory changed');
    const name = `${event}-${randomUUID8()}.private.json`;
    const path = join7(directory, name);
    const folder = await open3(directory, constants2.O_RDONLY | constants2.O_DIRECTORY | constants2.O_NOFOLLOW);
    try {
      const original = await folder.stat({ bigint: true });
      if (['dev', 'ino', 'uid', 'mode'].some((key) => original[key] !== directoryIdentity[key]))
        throw new Error('Original VM capture retention directory changed during open');
      const file = await open3(join7('/proc/self/fd', String(folder.fd), name), 'wx', 256);
      try {
        await file.writeFile(
          JSON.stringify({
            schemaVersion: 1,
            kind: 'original-installed-vm-capture-event',
            owner: context.owner,
            executor: before.execution.identity,
            planSha256: inventory.planSha256,
            originalBudget: budget,
            event,
            ...value,
            guestAcceptanceComplete: false,
            executionAuthorized: false,
          }),
        );
        await file.sync();
      } finally {
        await file.close();
      }
      const after = await lstat3(directory, { bigint: true });
      if (['dev', 'ino', 'uid', 'mode'].some((key) => after[key] !== directoryIdentity[key]))
        throw new Error('Original VM capture retention directory changed during write');
    } finally {
      await folder.close();
    }
    return path;
  };
  const guard = async (callback, selected) => {
    if (
      callback.original !== context ||
      callback.nonce !== before.nonce ||
      ['pid', 'group', 'start', 'boot'].some(
        (key) => callback.execution.identity[key] !== before.execution.identity[key],
      ) ||
      context.budget.start !== budget.start ||
      context.budget.deadline !== budget.deadline
    )
      throw new Error('Original VM capture callback or budget changed');
    await assertOriginalApplyGcpInventoryCallback2(baseline, callback);
    if (callback.phase === 'after') await assertOriginalInstalledGcpFinalCloudReader(selected, callback);
    else await assertOriginalInstalledGcpCloudReader2(selected, context);
    await assertDirectory();
  };
  const perform = async (operation) => {
    if (phase !== 'before' || refused || busy) {
      refused = true;
      throw new Error('Original VM capture refused or another operation is active');
    }
    busy = true;
    const settled = Promise.withResolvers();
    activeFinish = settled.promise;
    try {
      await guard(before, reader);
      const result = await operation();
      if (refused || phase !== 'before') throw new Error('Original VM capture refused during operation');
      await guard(before, reader);
      return result;
    } catch (error) {
      refused = true;
      await retain('failure', {
        errorName: error instanceof Error ? error.name : typeof error,
        ...(error instanceof Error ? { errorMessage: error.message } : {}),
      });
      throw error;
    } finally {
      busy = false;
      settled.resolve();
      activeFinish = undefined;
    }
  };
  const slotFor = (name) => {
    const slot = slots.get(name);
    if (!slot) throw new Error('Original declared VM target required');
    return slot;
  };
  const checkAnchor = (slot, view) => {
    const anchor = fingerprint(
      'interfaces' in view
        ? { instanceId: view.instanceId, operationId: view.operationId, interfaces: view.interfaces }
        : {
            instanceId: view.instanceId,
            diskId: view.diskId,
            imageId: view.imageId,
            operationId: view.operationId,
            interfaceAddress: view.interfaceAddress,
            externalAddress: view.externalAddress,
            publicKeySha256: view.publicKeySha256,
          },
    );
    if (slot.anchor && slot.anchor !== anchor) throw new Error('Original VM identity or interface ownership changed');
    slot.anchor ??= anchor;
    slot.view = view;
  };
  const serial = async (slot, final, start = '0') => {
    if (!slot.vm) throw new Error('Original observed VM required before serial capture');
    const evidence =
      slot.role === 'observer'
        ? await collectOriginalGcpObserverSerialEvidence2(slot.vm, start)
        : final
          ? await collectOriginalFinalGcpSerialEvidence2(slot.vm, start)
          : await collectOriginalEarlyGcpSerialEvidence2(slot.vm, start);
    const source =
      slot.role === 'observer'
        ? await readOriginalGcpObserverSerialSource2(slot.vm, evidence)
        : final
          ? await readOriginalFinalGcpSerialSource2(slot.vm, evidence)
          : await readOriginalEarlyGcpSerialSource2(slot.vm, evidence);
    await retain('serial', { name: slot.name, role: slot.role, source });
    const packet = Object.freeze({ vm: slot.vm, evidence, source });
    slot.serialPacket = packet;
    return packet;
  };
  await retain('opened', { resources: inventory.resources, targets: [...slots.values()] });
  return Object.freeze({
    directory,
    coverage() {
      const ready =
        phase === 'before' ? [...slots.values()].filter((slot) => slot.vm).length : (finalNames?.length ?? 0);
      return Object.freeze({
        expected: slots.size,
        ready,
        refused,
        phase,
        vmCoverageComplete: ready === slots.size,
        guestAcceptanceComplete: false,
        executionAuthorized: false,
      });
    },
    admitCe(identity) {
      return perform(async () => {
        const value = await readOriginalEarlyGcpInsertIdentity2(identity);
        const slot = slotFor(value.nodeName);
        if (
          slot.role !== 'ce' ||
          slot.identity ||
          value.zone !== slot.zone ||
          value.address !== slot.address ||
          value.project !== inventory.owner.account ||
          value.planSha256 !== inventory.planSha256 ||
          value.directory !== context.executionDirectory ||
          ['pid', 'group', 'start', 'boot'].some((key) => value.executor[key] !== before.execution.identity[key])
        )
          throw new Error('Original CE insert target, actor or single-use identity differs');
        slot.identity = identity;
        await retain('insert', { name: slot.name, role: slot.role, identity: value });
      });
    },
    admitObserver(identity) {
      return perform(async () => {
        const value = await assertOriginalGcpObserverInsertContext2(identity, before, baseline);
        const slot = slotFor(value.name);
        if (
          slot.role !== 'observer' ||
          slot.identity ||
          value.zone !== slot.zone ||
          value.address !== slot.address ||
          value.project !== inventory.owner.account ||
          value.planSha256 !== inventory.planSha256
        )
          throw new Error('Original observer insert target or single-use identity differs');
        slot.identity = identity;
        await retain('insert', { name: slot.name, role: slot.role, identity: value });
      });
    },
    reconcile(name) {
      return perform(async () => {
        const slot = slotFor(name);
        if (!slot.identity) throw new Error('Original insert identity required before VM reconciliation');
        let vm;
        if (slot.role === 'ce') {
          vm = await collectOriginalEarlyGcpVmEvidence2({
            identity: slot.identity,
            baseline,
            callback: before,
            reader,
          });
        } else {
          const identity = await assertOriginalGcpObserverInsertContext2(slot.identity, before, baseline);
          const observed = await reader.instance(slot.zone, slot.name);
          const disk = await reader.resource({ kind: 'disk', zone: slot.zone, name: slot.name });
          vm =
            identity.targetId === null || !observed.present || !disk.present
              ? null
              : await collectOriginalGcpObserverVmEvidence2({
                  identity: slot.identity,
                  callback: before,
                  reader,
                });
        }
        if (!vm) {
          await retain('pending', { name });
          return null;
        }
        const view =
          slot.role === 'ce' ? await readOriginalEarlyGcpVmEvidence2(vm) : await readOriginalGcpObserverVmEvidence2(vm);
        checkAnchor(slot, view);
        slot.vm = vm;
        await retain('vm', { name, role: slot.role, view });
        return view;
      });
    },
    captureSerial(name, start) {
      return perform(async () => {
        const slot = slotFor(name);
        return serial(slot, false, start);
      });
    },
    async readSerialPacket(name, callback) {
      if (
        busy ||
        (phase === 'before'
          ? refused || callback.phase !== 'before'
          : phase !== 'closed' || callback.phase !== 'after' || !finalNames?.includes(name))
      )
        throw new Error('Original VM serial packet lifetime unavailable');
      await guard(callback, packetReader);
      const slot = slotFor(name);
      const packet = slot.serialPacket;
      if (!packet) throw new Error('Original VM serial packet unavailable');
      const source =
        slot.role === 'observer'
          ? await readOriginalGcpObserverSerialSource2(packet.vm, packet.evidence)
          : callback.phase === 'after'
            ? await readOriginalFinalGcpSerialSource2(packet.vm, packet.evidence)
            : await readOriginalEarlyGcpSerialSource2(packet.vm, packet.evidence);
      if (fingerprint(source) !== fingerprint(packet.source) || slot.serialPacket !== packet)
        throw new Error('Original VM serial packet source changed');
      await guard(callback, packetReader);
      return packet;
    },
    async assertFinalAdmission(callback, selected) {
      if (phase !== 'before') throw new Error('Original VM final capture already started or operation unresolved');
      if (callback.phase !== 'after' || !callback.reserve) throw new Error('Original reserved after callback required');
      await guard(callback, selected);
      inspectFinalReaderReserve(callback.reserve);
    },
    async finalCapture(callback, selected) {
      if (phase !== 'before') throw new Error('Original VM final capture already started or operation unresolved');
      if (callback.phase !== 'after' || !callback.reserve) throw new Error('Original reserved after callback required');
      await guard(callback, selected);
      const timing = inspectFinalReaderReserve(callback.reserve);
      phase = 'final';
      packetReader = selected;
      const pending = activeFinish;
      if (pending) {
        let timer;
        let expired = false;
        try {
          await Promise.race([
            pending,
            new Promise((resolve) => {
              timer = setTimeout(
                () => {
                  expired = true;
                  resolve();
                },
                Math.max(0, timing.finalDeadlineMs - linuxMonotonicMs()),
              );
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
        if (expired) {
          await retain('final-unresolved', { originalBeforeCaptureUnresolved: true, finalReserve: timing });
          throw new Error('Original before VM capture remains unresolved in its final reserve');
        }
      }
      await guard(callback, selected);
      const capturedNames = [],
        failures = [];
      for (const slot of slots.values()) {
        try {
          await guard(callback, selected);
          if (!slot.identity || !slot.vm) {
            const observed = await selected.instance(slot.zone, slot.name);
            await retain('final-unattributed', {
              name: slot.name,
              present: observed.present,
              evidencePath: observed.path,
              evidenceSha256: observed.sha256,
            });
            continue;
          }
          const vm =
            slot.role === 'ce'
              ? await handoffOriginalEarlyGcpVmEvidence2(slot.vm, { callback, reader: selected })
              : await collectOriginalGcpObserverVmEvidence2({
                  identity: slot.identity,
                  callback,
                  reader: selected,
                });
          const view =
            slot.role === 'ce'
              ? await readOriginalFinalGcpVmEvidence2(vm)
              : await readOriginalGcpObserverVmEvidence2(vm);
          checkAnchor(slot, view);
          slot.vm = vm;
          await serial(slot, true);
          await guard(callback, selected);
          capturedNames.push(slot.name);
        } catch (error) {
          failures.push(slot.name);
          await retain('final-failure', {
            name: slot.name,
            errorName: error instanceof Error ? error.name : typeof error,
            ...(error instanceof Error ? { errorMessage: error.message } : {}),
          });
        }
      }
      await guard(callback, selected);
      const result = Object.freeze({
        capturedNames: Object.freeze(capturedNames),
        failures: Object.freeze(failures),
        vmCoverageComplete: capturedNames.length === slots.size,
        guestAcceptanceComplete: false,
        executionAuthorized: false,
        finalStartedMs: timing.finalStartedMs,
        finalDeadlineMs: timing.finalDeadlineMs,
      });
      await retain('final', { ...result });
      finalNames = result.capturedNames;
      phase = 'closed';
      return result;
    },
  });
}

// plugins/terraform/src/installed-vm-operation-queue.ts
async function drainInstalledVmCaptureQueue(pending, deadline) {
  if (!Number.isSafeInteger(deadline) || deadline <= linuxMonotonicMs())
    throw new Error('Original VM queue final deadline exhausted or invalid');
  let timer;
  try {
    await Promise.race([
      pending,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Original VM queue remains unresolved in final reserve')),
          Math.max(0, deadline - linuxMonotonicMs()),
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
function serializeInstalledVmCapture(stage) {
  let tail = Promise.resolve();
  let sealed = false;
  let final;
  const enqueue = (operation, after = false) => {
    if (sealed && !after) return Promise.reject(new Error('Original VM queue before lifetime retired'));
    const pending = tail.then(operation);
    tail = pending.then(
      () => {
        return;
      },
      () => {
        return;
      },
    );
    return pending;
  };
  return Object.freeze({
    ...stage,
    admitCe: (...args) => enqueue(() => stage.admitCe(...args)),
    admitObserver: (...args) => enqueue(() => stage.admitObserver(...args)),
    reconcile: (...args) => enqueue(() => stage.reconcile(...args)),
    captureSerial: (...args) => enqueue(() => stage.captureSerial(...args)),
    readSerialPacket: (...args) => enqueue(() => stage.readSerialPacket(...args), args[1].phase === 'after'),
    async finalCapture(callback, reader) {
      await stage.assertFinalAdmission(callback, reader);
      if (sealed) return Promise.reject(new Error('Original VM queue final capture already claimed'));
      const reserve = callback.reserve;
      if (!reserve) throw new Error('Original VM queue final reserve required');
      sealed = true;
      const pending = tail;
      final = (async () => {
        await assertOriginalApplyCallback(callback);
        if (callback.phase !== 'after' || !callback.reserve)
          throw new Error('Original VM queue final reserve required');
        await drainInstalledVmCaptureQueue(pending, inspectFinalReaderReserve(reserve).finalDeadlineMs);
        await assertOriginalApplyCallback(callback);
        return stage.finalCapture(callback, reader);
      })();
      tail = final.then(
        () => {
          return;
        },
        () => {
          return;
        },
      );
      return final;
    },
  });
}

// plugins/terraform/src/original-capture-source-closure.ts
async function closeOriginalCaptureSources(sources) {
  const failures = [];
  const names = [];
  for (const source of sources) {
    try {
      await source.close();
    } catch (error) {
      failures.push(error);
      names.push(source.name);
    }
  }
  if (failures.length)
    throw new AggregateError(failures, `Original capture source closure incomplete: ${names.join(', ')}`);
}
async function closeOriginalGuestSources(nodes) {
  await closeOriginalCaptureSources(
    nodes.map((node) => ({
      name: node.nodeName,
      close: () =>
        closeOriginalCaptureSources([
          {
            name: `${node.nodeName}:round`,
            close: async () => {
              await node.round;
            },
          },
          {
            name: `${node.nodeName}:workers-and-binding`,
            close: async () => {
              await closeOriginalCaptureSources([
                {
                  name: `${node.nodeName}:final-worker`,
                  close: async () => {
                    await node.finalWorker?.dispose();
                  },
                },
                {
                  name: `${node.nodeName}:before-worker`,
                  close: async () => {
                    await node.worker?.dispose();
                  },
                },
              ]);
              node.binding?.close();
            },
          },
        ]),
    })),
  );
}

// plugins/terraform/src/installed-capture-factory.ts
function createInstalledGcpCaptureFactory2() {
  return (request, context) => {
    if (
      context?.kind !== 'original-installed-gcp-capture-context' ||
      context.schemaVersion !== 2 ||
      request.owner?.provider !== 'gcp' ||
      request.owner.engine !== 'terraform' ||
      request.deployment?.engine !== 'terraform' ||
      request.deployment.deploymentId !== context.owner.deploymentId ||
      join8(request.directory, request.deployment.deploymentId) !== context.executionDirectory ||
      context.budget.deadline - context.budget.start !== 7200000 ||
      ['provider', 'engine', 'account', 'region', 'deploymentId'].some(
        (key) => request.owner[key] !== context.owner[key],
      )
    )
      throw new Error('Original complete capture factory request/context required');
    let store;
    let groupInputs;
    let requiredReaderSources = [];
    let collectReaderSources;
    const persist = async (event) => {
      if (!store) throw new Error('Original factory storage is not prepared');
      await store.verify();
      await store.write(`gcp-complete-factory-${randomUUID9()}.json`, {
        schemaVersion: 1,
        kind: 'original-installed-complete-capture-factory-event',
        owner: context.owner,
        originalBudget: context.budget,
        ...event,
        guestAcceptanceComplete: false,
        executionAuthorized: false,
      });
    };
    const preparationSources = [];
    let preparationFailed = false;
    let preparing;
    let closure;
    let closing = false;
    let preparationClosure;
    const ownPreparation = (name, close) => {
      preparationSources.push({ name, close });
    };
    const closePreparation = () => {
      preparationClosure ??= closeOriginalCaptureSources([...preparationSources].reverse());
      return preparationClosure;
    };
    const coordinated = createInstalledCaptureCoordinator(context, {
      persist,
      async stages(original) {
        if (original !== context) throw new Error('Original factory preparation context required');
        await context.assertInputs();
        await context.assertWithinDeadline();
        const plan = await context.readOriginalPlanSource?.();
        if (!plan) throw new Error('Original owning plan required for complete capture factory');
        await assertOriginalTerraformPlanProjection(plan);
        if (
          plan.directory !== context.executionDirectory ||
          plan.scope.cloud !== 'gcp' ||
          plan.scope.account !== context.owner.account ||
          plan.scope.region !== context.owner.region ||
          plan.receipt.deploymentId !== context.owner.deploymentId
        )
          throw new Error('Original factory owning plan scope differs');
        const originalStore = await request.platform.storage(context.owner);
        store = originalStore;
        await store.verify();
        if (store.directory !== request.directory)
          throw new Error('Original initial factory storage directory differs');
        const admitted = context.inputs['workspace:gcp-terraform-input-identity.json'];
        if (!admitted) throw new Error('Original factory intent input required');
        const raw = await owned(admitted.path);
        assertSameOriginalInput(admitted, raw.binding);
        const saved = JSON.parse(raw.bytes.toString());
        validateIntent(saved.intent);
        const intent = saved.intent;
        if (
          saved.intentFingerprint !== fingerprint(intent) ||
          saved.platformContext !== intent.platformContext ||
          intent.engine !== 'terraform' ||
          intent.operation !== 'deploy' ||
          intent.project !== context.owner.account ||
          intent.region !== context.owner.region ||
          intent.deploymentName !== context.owner.deploymentId ||
          intent.schemaVersion !== 2 ||
          !intent.observer ||
          intent.sites.length !== 1 ||
          intent.sites[0].nodes.length !== 3
        )
          throw new Error('Original complete factory requires the qualified initial three-node observer scope');
        const nodes = intent.sites.flatMap((site) =>
          site.nodes.map((node) => ({
            siteName: site.name,
            nodeName: node.name,
            tokenName: `${node.name}-token`,
            zone: node.zone,
          })),
        );
        const binding = {
          terraformVersion: plan.terraformVersion,
          providerLockSha256: plan.receipt.providerLockSha256,
        };
        const version = resolveInstalledGcpVersionProfile(binding);
        const providers = await context.readProviderInputs();
        const provider =
          providers[`registry.terraform.io/hashicorp/google:terraform-provider-google_v${version.googleVersion}_x5`];
        if (!provider || provider.sha256 !== version.googleProviderSha256)
          throw new Error('Original factory Google provider package required');
        if (plan.receipt.operation === 'destroy') {
          const deletion = await openInstalledDeleteCapture2({ context, store, plan, intent });
          ownPreparation('delete', () => deletion.closeAfterExecutorExit());
          requiredReaderSources = Object.freeze(['delete-output']);
          collectReaderSources = () => collectInstalledOriginalDeleteReaderSources(deletion);
          await persist({
            phase: 'assembled',
            operation: 'destroy',
            stages: [{ name: 'delete' }],
            resourceCount: plan.resources.filter((row) => row.mode === 'managed').length,
          });
          return [{ name: 'delete', worker: deletion }];
        }
        const observerPlans = plan.resources.filter((row) => {
          const name = row.fields.name;
          return (
            row.type === 'google_compute_instance' &&
            row.mode === 'managed' &&
            row.actions.includes('create') &&
            name?.status === 'known' &&
            !nodes.some((node) => node.nodeName === name.value)
          );
        });
        const observerName = observerPlans[0]?.fields.name;
        if (observerPlans.length !== 1 || observerName?.status !== 'known' || typeof observerName.value !== 'string')
          throw new Error('Original factory unique observer instance required');
        const observerNode = observerName.value;
        const packet = await prepareOriginalCreationScope(context);
        const inventory = await openInstalledInventoryCaptureStage({ context, store, platform: request.platform });
        ownPreparation('inventory', () => inventory.closeAfterExecutorExit());
        const bootstrap = await openInstalledBootstrapCapture2({
          context,
          store,
          packet,
          platform: request.platform,
          platformContext: saved.platformContext,
          nodes: nodes.map(({ siteName, nodeName, tokenName }) => ({ siteName, nodeName, tokenName })),
        });
        ownPreparation('bootstrap', () => bootstrap.closeAfterExecutorExit());
        const adc = await owned(context.inputs.adc.path);
        assertSameOriginalInput(context.inputs.adc, adc.binding);
        const imageReader = await openInstalledGcpObserverImageReader2(context);
        const image = await captureOriginalGcpObserverImage2(imageReader);
        let observerIdentity;
        const profile = await openInstalledGcpSshClientProfile();
        ownPreparation('ssh-profile', () => closeOriginalGcpSshClientProfile(profile));
        const cloud = await openInstalledGcpCloudSerialReader(context);
        ownPreparation('cloud-reader', () => cloud.close());
        let finalCloud;
        let before, after;
        let vm;
        let observer, finalObserver;
        let providerReader;
        const windows = [];
        const windowPromises = [];
        let observing = false,
          finishing = false,
          observerInserted = false;
        let observation;
        let providerSchedule;
        let providerFailure, observationFailure;
        const useBefore = async () => {
          if (!before || finishing) throw new Error('Original factory before lifetime retired');
          await assertOriginalApplyLifetime(before);
          return before;
        };
        const admit = async (source) => {
          if (!vm || !before || source.callback !== before || source.callback.phase !== 'before')
            throw new Error('Original factory insert before sources required');
          if (source.target.name === observerNode) {
            const beforeImageReader = await openInstalledGcpObserverImageReader2(context, before);
            const beforeImage = await captureOriginalGcpObserverImage2(beforeImageReader);
            if (beforeImage.creationTimestamp !== image.creationTimestamp)
              throw new Error('Original factory observer image changed before insertion');
            const identity = await collectOriginalGcpObserverInsertIdentity2({
              callback: before,
              baseline: await inventory.readBaseline(before),
              response: source.response,
              binding,
              imageReader: beforeImageReader,
              image: beforeImage,
            });
            observerIdentity = identity;
            await vm.admitObserver(identity);
            observerInserted = true;
          } else {
            const node = nodes.find((node) => node.nodeName === source.target.name);
            if (!node || node.identity) throw new Error('Original factory unique CE insert required');
            node.identity = await collectOriginalEarlyGcpInsertIdentity2({
              originalPlan: plan,
              response: source.response,
              binding,
            });
            await vm.admitCe(node.identity);
          }
        };
        const observe = async () => {
          const callback = await useBefore();
          if (!vm) throw new Error('Original factory VM stage required');
          const originalVm = vm;
          const baseline = await readOriginalApplyGcpInventory2(await inventory.readBaseline(callback));
          const prepared = await Promise.allSettled([
            (async () => {
              if (
                !observer &&
                observerInserted &&
                baseline.cloud.some((row) => row.role === 'observer' && row.target.kind === 'instance')
              ) {
                const view = await originalVm.reconcile(observerNode);
                if (view) {
                  const serial = await originalVm.captureSerial(observerNode, '0');
                  if (String(serial.source.contents ?? '').includes('SHA256:')) {
                    observer = await openInstalledGcpObserverAccess({
                      vm: serial.vm,
                      serial: serial.evidence,
                      callback,
                      store: originalStore,
                      profile,
                    });
                    await observer.initialize();
                  }
                }
              }
            })(),
            ...nodes.map(async (node) => {
              if (!node.identity || node.access || node.failure) return;
              const view = await originalVm.reconcile(node.nodeName);
              if (!view) return;
              const serial = await originalVm.captureSerial(node.nodeName, '0');
              if (!String(serial.source.contents ?? '').includes('SHA256:')) return;
              await bootstrap.waitForGrants();
              const token = await bootstrap.refreshBootstrap(node.nodeName);
              node.bootstrapVm = await joinOriginalEarlyGcpBootstrapVm({
                context,
                callback,
                identity: node.identity,
                bootstrap: token,
                vm: serial.vm,
              });
              node.access = await openInstalledGcpCeAccess({
                vm: serial.vm,
                bootstrapVm: node.bootstrapVm,
                bootstrap: token,
                serial: serial.evidence,
                callback,
                store: originalStore,
              });
            }),
          ]);
          if (prepared.some((result) => result.status === 'rejected'))
            throw new AggregateError(
              prepared.flatMap((result) => (result.status === 'rejected' ? [result.reason] : [])),
              'Original independent observer or CE access preparation refused',
            );
          if (observer) {
            const clients = (await observer.read()).clients;
            for (const node of nodes) {
              if (!node.access || node.binding || node.failure) continue;
              await node.access.initialize(clients);
              node.binding = await openInstalledGcpGuestBinding2({
                ce: await node.access.read(),
                observer: await observer.read(),
                callback,
              });
              node.worker = await openInstalledGuestWorker2(node.binding);
              await node.worker.initialize();
              await persist({ phase: 'before-guest-ready', nodeName: node.nodeName, worker: node.worker.evidence() });
            }
          }
          for (const node of nodes) {
            if (node.worker && !node.failure) await scheduleInstalledBeforeGuestRound2(node, callback, persist);
          }
        };
        const scheduleObservation = () => {
          if (finishing || observing || observationFailure) return;
          observing = true;
          observation = observe()
            .catch(async (error) => {
              observationFailure ??= error;
              await persist({
                phase: 'observation-refused',
                errorType: error instanceof Error ? error.name : typeof error,
              });
            })
            .finally(() => {
              observing = false;
            });
        };
        const observerRoles = ['wire', 'trust', 'peer', 'delivery', 'abi', 'renewal'];
        const sourceName = (phase, node, role) => `${phase}-ce-${fingerprint(node.nodeName).slice(7, 23)}-${role}`;
        requiredReaderSources = Object.freeze([
          'provider',
          'xcsh',
          'bootstrap-publisher',
          'guest-before',
          'guest-final',
          ...['before', 'final'].flatMap((phase) => observerRoles.map((role) => `${phase}-observer-${role}`)),
          ...nodes.flatMap((node) =>
            ['before', 'final'].flatMap((phase) => ['wire', 'trust'].map((role) => sourceName(phase, node, role))),
          ),
        ]);
        collectReaderSources = async () => {
          const tasks = [
            (async () => {
              if (!providerReader) return [{ name: 'provider', attemptCount: 0, witnesses: [] }];
              const witnesses = await providerReader.readerClosureWitnesses();
              return [{ name: 'provider', attemptCount: providerReader.captures().length, witnesses }];
            })(),
            collectInstalledOriginalBootstrapReaderSources2(bootstrap),
          ];
          for (const phase of ['before', 'final']) {
            tasks.push(
              (async () => {
                const workers = nodes
                  .map((node) => (phase === 'before' ? node.worker : node.finalWorker))
                  .filter((worker) => !!worker);
                const results = await Promise.allSettled(workers.map(collectInstalledOriginalGuestReaderClosures2));
                const failures = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
                if (failures.length)
                  throw new AggregateError(failures, `Original ${phase} guest source collection incomplete`);
                return [
                  {
                    name: `guest-${phase}`,
                    attemptCount: workers.reduce((sum, worker) => sum + worker.evidence().submissions, 0),
                    witnesses: results.flatMap((result) => (result.status === 'fulfilled' ? [...result.value] : [])),
                  },
                ];
              })(),
            );
            tasks.push(
              (async () => {
                const original = phase === 'before' ? observer : finalObserver;
                const sources = original
                  ? await collectInstalledOriginalAccessReaderSources2(original)
                  : observerRoles.map((role) => ({ name: `observer-${role}`, attemptCount: 0, witnesses: [] }));
                return sources.map((source) => ({ ...source, name: `${phase}-${source.name}` }));
              })(),
            );
            for (const node of nodes)
              tasks.push(
                (async () => {
                  const original = phase === 'before' ? node.access : node.finalAccess;
                  const sources = original
                    ? await collectInstalledOriginalAccessReaderSources2(original)
                    : ['wire', 'trust'].map((role) => ({ name: `ce-${role}`, attemptCount: 0, witnesses: [] }));
                  return sources.map((source) => ({ ...source, name: sourceName(phase, node, source.name.slice(3)) }));
                })(),
              );
          }
          const outcomes = await Promise.allSettled(tasks);
          const failures = outcomes.flatMap((outcome) => (outcome.status === 'rejected' ? [outcome.reason] : []));
          if (failures.length)
            throw new AggregateError(failures, 'Original complete factory reader source coverage incomplete');
          return Object.freeze(
            outcomes.flatMap((outcome) => (outcome.status === 'fulfilled' ? [...outcome.value] : [])),
          );
        };
        const trace = await openInstalledApplyTraceStage2({
          context,
          store,
          providerPath: provider.path,
          onResponse: admit,
          onObservation: async () => {
            scheduleObservation();
          },
        });
        const providerWorker = {
          async start(admission, callback) {
            if (!callback || callback.original !== context || callback.phase !== 'before')
              throw new Error('Original factory provider callback required');
            before = callback;
            providerReader = await openInstalledProviderReader2(context, admission);
            const startWindow = () => {
              if (!providerReader) throw new Error('Original provider source unavailable');
              const pending = providerReader.startStderrWindow();
              const result = pending.complete.then((window) => {
                windows.push(window);
                return window;
              });
              result.catch((error) => {
                providerFailure ??= error;
              });
              windowPromises.push(result);
              return pending.ready;
            };
            await startWindow();
            providerSchedule = (async () => {
              let next = linuxMonotonicMs() + 30000;
              while (!finishing) {
                await Bun.sleep(100);
                if (!finishing && linuxMonotonicMs() >= next) {
                  await useBefore();
                  await startWindow();
                  next = linuxMonotonicMs() + 30000;
                }
              }
            })().catch((error) => {
              providerFailure ??= error;
            });
          },
          async assertOriginal() {
            await context.assertInputs();
            if (providerFailure) throw providerFailure;
          },
          async finalCapture(_capture, _reserve, callback) {
            if (!callback) throw new Error('Original factory final provider callback required');
            after = callback;
            finishing = true;
            await providerSchedule;
            const results = await Promise.allSettled(windowPromises);
            if (providerFailure || !windows.length || results.some((result) => result.status === 'rejected'))
              throw new Error('Original factory provider observation incomplete');
            await assertOriginalApplyCallback(callback);
            await persist({ phase: 'provider-windows', hashes: windows.map((window) => window.evidenceSha256) });
          },
          async closeAfterExecutorExit() {
            await providerReader?.close();
          },
        };
        const vmWorker = {
          async start(_admission, callback) {
            if (!callback) throw new Error('Original factory VM callback required');
            before = callback;
            vm = serializeInstalledVmCapture(
              await openInstalledVmCapture2({
                callback,
                baseline: await inventory.readBaseline(callback),
                reader: cloud,
              }),
            );
          },
          async assertOriginal() {
            await context.assertInputs();
          },
          async finalCapture(_capture, _reserve, callback) {
            if (!callback?.reserve || !vm) throw new Error('Original factory final VM sources required');
            after = callback;
            finishing = true;
            await observation;
            finalCloud = await openInstalledGcpCloudSerialReader(context, undefined, undefined, {
              admission: callback.execution,
              reserve: callback.reserve,
            });
            if (observerIdentity) {
              const finalImageReader = await openInstalledGcpObserverImageReader2(context, callback);
              await bindOriginalGcpObserverFinalImage2(observerIdentity, callback, finalImageReader);
            }
            const report = await vm.finalCapture(callback, finalCloud);
            await persist({ phase: 'final-vm', report });
            if (!report.vmCoverageComplete || report.failures.length)
              throw new Error('Original factory final VM coverage incomplete');
          },
          async closeAfterExecutorExit() {
            await closeOriginalCaptureSources([
              {
                name: 'final-cloud-reader',
                close: async () => {
                  await finalCloud?.close();
                },
              },
              { name: 'before-cloud-reader', close: () => cloud.close() },
            ]);
          },
        };
        const guestWorker = {
          async start() {},
          async assertOriginal() {
            await context.assertInputs();
          },
          async finalCapture(_capture, _reserve, callback) {
            if (!callback || !vm) throw new Error('Original factory final guest source unavailable');
            after = callback;
            finishing = true;
            const serial = await vm.readSerialPacket(observerNode, callback);
            const installation = observer?.coverage().clientDeliveryAttempted
              ? await observer.readInstallation()
              : undefined;
            finalObserver = await openInstalledGcpObserverAccess({
              vm: serial.vm,
              serial: serial.evidence,
              callback,
              store: originalStore,
              profile,
              ...(installation ? { installation } : {}),
            });
            await finalObserver.initialize();
            const clients = (await finalObserver.read()).clients;
            const originalVmStage = vm;
            const originalFinalObserver = finalObserver;
            const results = await Promise.allSettled(
              nodes.map(async (node) => {
                if (!node.identity) throw new Error('Original inserted guest identity unavailable');
                await node.round?.catch(() => {
                  return;
                });
                const packet = await originalVmStage.readSerialPacket(node.nodeName, callback);
                const token = await bootstrap.refreshBootstrap(node.nodeName, callback);
                const coupled = node.bootstrapVm
                  ? await handoffOriginalEarlyGcpBootstrapVm(node.bootstrapVm, {
                      callback,
                      bootstrap: token,
                      vm: packet.vm,
                    })
                  : await joinOriginalFinalGcpBootstrapVm({
                      context,
                      callback,
                      bootstrap: token,
                      identity: node.identity,
                      vm: packet.vm,
                    });
                node.finalAccess = await openInstalledGcpCeAccess({
                  vm: packet.vm,
                  bootstrapVm: coupled,
                  bootstrap: token,
                  serial: packet.evidence,
                  callback,
                  store: originalStore,
                });
                await node.finalAccess.initialize(clients);
                const finalSources = {
                  ce: await node.finalAccess.read(),
                  observer: await originalFinalObserver.read(),
                  callback,
                };
                if (node.binding) await node.binding.handoff(finalSources);
                else node.binding = await openInstalledGcpGuestBinding2(finalSources);
                await node.worker?.dispose();
                node.finalWorker = await openInstalledFinalGuestWorker2(node.binding, callback);
                await node.finalWorker.initialize();
                node.finalRound = await collectInstalledOriginalGuestRound2(node.finalWorker);
                await persist({
                  phase: 'final-round',
                  nodeName: node.nodeName,
                  report: node.finalRound,
                  priorFailureRetained: !!node.failure,
                  firstBootstrapJoinPhase: node.bootstrapVm ? 'before' : 'after',
                  worker: node.finalWorker.evidence(),
                });
              }),
            );
            await persist({
              phase: 'final-guest',
              expected: nodes.length,
              captured: results.filter((result) => result.status === 'fulfilled').length,
              beforeObservationFailed: !!observationFailure,
              beforeGuestFailures: nodes.filter((node) => node.failure).length,
            });
            if (
              results.some((result) => result.status === 'rejected') ||
              observationFailure ||
              nodes.some((node) => node.failure)
            )
              throw new Error('Original factory guest capture incomplete; before failure retained');
          },
          async closeAfterExecutorExit() {
            const failures = [];
            try {
              await closeOriginalGuestSources(nodes);
            } catch (error) {
              failures.push(error);
            }
            for (const phase of ['before', 'final']) {
              const workers = nodes
                .map((node) => (phase === 'before' ? node.worker : node.finalWorker))
                .filter((worker) => !!worker);
              const attemptCount = workers.reduce((sum, worker) => sum + worker.evidence().submissions, 0);
              const results = await Promise.allSettled(workers.map(collectInstalledOriginalGuestReaderClosures2));
              const witnesses = results.flatMap((result) => (result.status === 'fulfilled' ? [...result.value] : []));
              for (const result of results) if (result.status === 'rejected') failures.push(result.reason);
              if (results.some((result) => result.status === 'rejected') || attemptCount !== witnesses.length) {
                failures.push(new Error(`Original factory guest ${phase} attempt coverage incomplete`));
                continue;
              }
              try {
                await persist({
                  phase: 'guest-reader-groups',
                  source: `guest-${phase}`,
                  attemptCount,
                  witnesses,
                  closureFailureRetained: failures.length > 0,
                });
              } catch (error) {
                failures.push(error);
              }
            }
            if (failures.length)
              throw new AggregateError(failures, 'Original factory guest closure or source retention incomplete');
          },
        };
        const accessWorker = {
          async start() {},
          async assertOriginal() {
            await context.assertInputs();
          },
          async finalCapture() {},
          async closeAfterExecutorExit() {
            await closeOriginalCaptureSources([
              ...nodes.flatMap((node) => [
                {
                  name: `${node.nodeName}:final-access`,
                  close: async () => {
                    await node.finalAccess?.close(after);
                  },
                },
                {
                  name: `${node.nodeName}:before-access`,
                  close: async () => {
                    await node.access?.close(after);
                  },
                },
              ]),
              {
                name: 'final-observer-access',
                close: async () => {
                  await finalObserver?.close(after);
                },
              },
              {
                name: 'before-observer-access',
                close: async () => {
                  await observer?.close(after);
                },
              },
            ]);
            if (observer) closeOriginalGcpObserverClientInstallation2(await observer.readInstallation());
            closeOriginalGcpSshClientProfile(profile);
          },
        };
        const correspondenceWorker = {
          async start() {},
          async assertOriginal() {
            await context.assertInputs();
          },
          async finalCapture(_capture, _reserve, callback) {
            if (!callback) throw new Error('Original factory final correspondence callback required');
            const transcript = await trace.readTranscript(callback);
            const correspondences = [];
            for (const rpc of transcript.rpcs) {
              if (rpc.rpc !== 'ApplyResourceChange' || rpc.resourceType !== 'google_compute_instance') continue;
              const matching = windows.filter((window) =>
                window.observations.some((row) => row.candidate.pid === rpc.providerPid),
              );
              correspondences.push(await corroborateOriginalGoogleRpcProvider({ rpc, windows: matching, binding }));
            }
            await persist({ phase: 'provider-correspondence', correspondences });
            const ceWitnesses = await collectInstalledCeInsertWitnesses2({
              ...transcript,
              targets: transcript.targets.filter((target) => nodes.some((node) => node.nodeName === target.name)),
              windows,
            });
            await persist({
              phase: 'ce-insert-witnesses',
              sources: ceWitnesses.map(({ target, witnesses }) => ({ target, witnesses })),
            });
            if (!finalCloud) throw new Error('Original factory final audit reader unavailable');
            const baseline = await inventory.readBaseline(callback);
            for (const { candidate } of ceWitnesses) {
              const audit = await collectInstalledOriginalCeAudit2({
                source: candidate,
                reader: finalCloud,
                baseline,
                callback,
              });
              await persist({ phase: 'ce-insert-audit', source: audit });
            }
            if (!observerIdentity || !vm) throw new Error('Original observer audit sources unavailable');
            const observerSource = await readOriginalGcpObserverAuditSource(observerIdentity, callback, baseline);
            const observerBodies = transcript.bodies.filter(
              (body) =>
                body.requestBodySha256 === observerSource.value.requestBodySha256 &&
                body.responseBodySha256 === observerSource.value.responseBodySha256,
            );
            const observerStarts = transcript.hooks.filter(
              (hook) => hook.address === observerSource.value.address && hook.phase === 'apply_start',
            );
            const observerEnds = transcript.hooks.filter(
              (hook) => hook.address === observerSource.value.address && hook.phase === 'apply_complete',
            );
            const observerRpcs = transcript.rpcs.filter(
              (rpc) => rpc.rpcRequestId === observerBodies[0]?.rpcRequestId && rpc.rpc === 'ApplyResourceChange',
            );
            if (
              observerBodies.length !== 1 ||
              observerStarts.length !== 1 ||
              observerEnds.length !== 1 ||
              observerRpcs.length !== 1
            )
              throw new Error('Original factory observer witness sources absent or ambiguous');
            const observerWitness = await collectInstalledObserverInsertWitnesses2({
              identity: observerIdentity,
              callback,
              baseline,
              originalPlan: transcript.originalPlan,
              configuration: transcript.configuration,
              binding,
              providerPath: transcript.providerPath,
              body: observerBodies[0],
              started: observerStarts[0],
              completed: observerEnds[0],
              rpc: observerRpcs[0],
              windows: windows.filter((window) =>
                window.observations.some((row) => row.candidate.pid === observerRpcs[0].providerPid),
              ),
            });
            await persist({ phase: 'observer-insert-witnesses', source: observerWitness });
            const observerPacket = await vm.readSerialPacket(observerNode, callback);
            const observerAudit = await collectInstalledOriginalObserverAudit2({
              identity: observerIdentity,
              vm: observerPacket.vm,
              reader: finalCloud,
              baseline,
              callback,
            });
            await persist({ phase: 'observer-insert-audit', source: observerAudit });
            if (ceWitnesses.length !== nodes.length)
              throw new Error('Original factory CE insertion witnesses incomplete');
            if (correspondences.length !== nodes.length + 1)
              throw new Error('Original factory insert RPC correspondence incomplete');
          },
          async closeAfterExecutorExit() {},
        };
        const stages = [
          { name: 'inventory', worker: inventory, closeAfter: ['vm', 'guest', 'trace', 'bootstrap'] },
          { name: 'bootstrap', worker: bootstrap, closeAfter: ['guest', 'access'] },
          { name: 'provider', worker: providerWorker, closeAfter: ['correspondence'] },
          { name: 'vm', worker: vmWorker, finalAfter: ['trace'], closeAfter: ['guest', 'access'] },
          { name: 'trace', worker: trace, closeAfter: ['correspondence', 'vm', 'guest'] },
          { name: 'correspondence', worker: correspondenceWorker, finalAfter: ['trace', 'provider', 'vm'] },
          { name: 'access', worker: accessWorker, closeAfter: ['guest'] },
          { name: 'guest', worker: guestWorker, finalAfter: ['vm', 'bootstrap', 'correspondence'] },
        ];
        await persist({
          phase: 'assembled',
          stages: stages.map(({ name, finalAfter, closeAfter }) => ({ name, finalAfter, closeAfter })),
          resourceCount: plan.resources.filter((row) => row.mode === 'managed' && row.actions.includes('create'))
            .length,
        });
        return stages;
      },
    });
    return {
      ...coordinated,
      prepare(original) {
        if (original !== context) return Promise.reject(new Error('Original factory preparation context required'));
        if (closing) return Promise.reject(new Error('Original factory is closed for preparation'));
        preparing ??= (async () => {
          try {
            await coordinated.prepare?.(original);
          } catch (error) {
            preparationFailed = true;
            try {
              await closePreparation();
            } catch (closure) {
              throw new AggregateError([error, closure], 'Original factory preparation and source closure failed');
            }
            throw error;
          }
        })();
        return preparing;
      },
      start(admission, callback) {
        if (closing) return Promise.reject(new Error('Original factory is closed for startup'));
        return coordinated.start(admission, callback);
      },
      assertOriginal() {
        if (closing) return Promise.reject(new Error('Original factory is closed for source verification'));
        return coordinated.assertOriginal();
      },
      closeAfterExecutorExit() {
        closing = true;
        closure ??= (async () => {
          await preparing?.catch(() => {
            return;
          });
          const failures = [];
          try {
            if (!preparing) {
              if (preparationSources.length) throw new Error('Original unprepared source state differs');
              const originalStore = await request.platform.storage(context.owner);
              await originalStore.verify();
              if (originalStore.directory !== request.directory)
                throw new Error('Original unprepared factory storage directory differs');
              store = originalStore;
              const admittedInputs = structuredClone(context.inputs);
              const assertUnpreparedInputs = async () => {
                const monitor = await monitorOriginalInputs2(admittedInputs);
                try {
                  await originalStore.verify();
                  await monitor.assertOriginal();
                } finally {
                  monitor.close();
                }
              };
              await assertUnpreparedInputs();
              requiredReaderSources = Object.freeze(['factory-preparation']);
              collectReaderSources = async () => {
                if (preparing || preparationSources.length) throw new Error('Original never-prepared source required');
                await assertUnpreparedInputs();
                return Object.freeze([
                  Object.freeze({ name: 'factory-preparation', attemptCount: 0, witnesses: Object.freeze([]) }),
                ]);
              };
              await persist({ phase: 'unprepared-source-closed', preparationInvoked: false, nativeReaderAttempts: 0 });
            }
            if (!preparing || preparationFailed) await closePreparation();
            else await coordinated.closeAfterExecutorExit();
          } catch (error) {
            failures.push(error);
          }
          if (collectReaderSources) {
            try {
              if (!store) throw new Error('Original factory source store unavailable');
              const sources = await collectReaderSources();
              groupInputs = await persistOriginalReaderGroupSet2({
                store,
                owner: context.owner,
                requiredSources: requiredReaderSources,
                sources,
              });
              await persist({
                phase: 'reader-group-set',
                inputs: groupInputs,
                requiredSources: requiredReaderSources,
                captureFailureRetained: failures.length > 0,
              });
            } catch (error) {
              failures.push(error);
            }
          }
          if (failures.length)
            throw new AggregateError(failures, 'Original factory closure or durable source coverage incomplete');
        })();
        return closure;
      },
      async readClosedReaderGroupInputs() {
        await closure?.catch(() => {
          return;
        });
        if (!closing || !groupInputs) throw new Error('Original factory reader group coverage unavailable');
        await collectReaderSources?.();
        await assertOriginalReaderGroupInputs2({
          inputs: groupInputs,
          owner: context.owner,
          requiredSources: requiredReaderSources,
        });
        return groupInputs;
      },
    };
  };
}

export {
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
};
