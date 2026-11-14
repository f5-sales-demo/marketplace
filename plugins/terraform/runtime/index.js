// @bun
// plugins/terraform/src/gcp-bootstrap-evidence.ts
import { createHash } from 'node:crypto';

// plugins/platform/src/ce/evidence-json.ts
var object = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed original JSON object');
  return value;
};
function decodeEvidenceObject(raw) {
  const source = new TextDecoder('utf8', { fatal: true }).decode(raw);
  const value = object(JSON.parse(source));
  const scopes = [];
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '{' || char === '[') {
      if (scopes.length >= 64) throw new Error('Original JSON nesting exceeded');
      scopes.push(char === '{' ? new Set() : null);
    } else if (char === '}' || char === ']') scopes.pop();
    else if (char === '"') {
      const start = i++;
      while (i < source.length && source[i] !== '"') {
        if (source[i] === '\\') i++;
        i++;
      }
      let next = i + 1;
      while (/\s/.test(source[next] ?? '') && next < source.length) next++;
      if (source[next] === ':') {
        const key = JSON.parse(source.slice(start, i + 1));
        const keys = scopes.at(-1);
        if (!keys || keys.has(key)) throw new Error('Duplicate original JSON identity');
        keys.add(key);
      }
    }
  }
  return value;
}

// plugins/terraform/src/installed-version-profile.ts
var profiles = [
  {
    terraformVersion: '1.17.2',
    googleVersion: '8.11.0',
    xcshVersion: '15.15.7',
    providerLockSha256: 'c3c6fb09abfd85ce60f31e91fb3ef14b5d30d2ae67680c499c7f4003fcbcaf14',
    terraformSha256: 'dbfef0be43ba2117481be510d3b83a2d8cdfa6ae7ec69c5aeb04b3947956ff7e',
    googleProviderSha256: 'f6c7080ca82f5ecc2f279f9b6edf152ec366890f76ab0a97a1667bdf17331ef5',
    xcProviderSha256: 'd30f9a3921dc16262da4d278cd97bc62e9af73f21ded6d12480798da6d726dc7',
  },
  {
    terraformVersion: '1.17.1',
    googleVersion: '8.11.0',
    xcshVersion: '15.15.7',
    providerLockSha256: 'c3c6fb09abfd85ce60f31e91fb3ef14b5d30d2ae67680c499c7f4003fcbcaf14',
    terraformSha256: '1eaecd79a92a0114d70017b5d5e274c12e5b4561d971ff0b5e24073cddd287dc',
    googleProviderSha256: 'f6c7080ca82f5ecc2f279f9b6edf152ec366890f76ab0a97a1667bdf17331ef5',
    xcProviderSha256: 'd30f9a3921dc16262da4d278cd97bc62e9af73f21ded6d12480798da6d726dc7',
  },
  {
    terraformVersion: '1.17.1',
    googleVersion: '8.10.0',
    xcshVersion: '15.15.7',
    providerLockSha256: 'fafc5491583b367f9f3a915093e1b311171960cf909143fadc49acb0a862aeb0',
    terraformSha256: '1eaecd79a92a0114d70017b5d5e274c12e5b4561d971ff0b5e24073cddd287dc',
    googleProviderSha256: 'f792c2ebae7abfc9123e9506b641fa789335b8905caa34effd899595e93e40a9',
    xcProviderSha256: 'd30f9a3921dc16262da4d278cd97bc62e9af73f21ded6d12480798da6d726dc7',
  },
  {
    terraformVersion: '1.17.1',
    googleVersion: '8.10.0',
    xcshVersion: '15.15.6',
    providerLockSha256: '2ff7b8d6b6c29f989ffbbb0ac39131b1ac33da0b6dcef9e4310204e605a5a034',
    terraformSha256: '1eaecd79a92a0114d70017b5d5e274c12e5b4561d971ff0b5e24073cddd287dc',
    googleProviderSha256: 'f792c2ebae7abfc9123e9506b641fa789335b8905caa34effd899595e93e40a9',
    xcProviderSha256: '99173b9eb36d1deeeb3297374f5b86f4a37631b9ba88a9e9da82ced549ad35b3',
  },
  {
    terraformVersion: '1.16.6',
    googleVersion: '8.7.0',
    xcshVersion: '15.13.0',
    providerLockSha256: '6d7c7b6c9f2d2c0ca301e7c845b893b07722149b0bc6853f6058d5f27a28050a',
    terraformSha256: '00a240950f88f51a03ad90975f1647737e40ddcd5df30a703fd840aa07dccced',
    googleProviderSha256: '1c620693bca3fe61c3b8ce8d313f3c6dc35648f2246784e5d92fe3d22e0dfd9f',
    xcProviderSha256: 'c25cc2562047d72ef3b10d2cd8319f13f8c5b6785aa62cc9006b6370ae68fd67',
  },
  {
    terraformVersion: '1.17.2',
    googleVersion: '8.11.0',
    xcshVersion: '15.16.2',
    providerLockSha256: '05b1685de902eec100da53ec973895b04f5faa5b81b3f5257de09caeace531bc',
    terraformSha256: 'dbfef0be43ba2117481be510d3b83a2d8cdfa6ae7ec69c5aeb04b3947956ff7e',
    googleProviderSha256: 'f6c7080ca82f5ecc2f279f9b6edf152ec366890f76ab0a97a1667bdf17331ef5',
    xcProviderSha256: '542d99d1905fe03fadce8a889390751b3ad1531f367ef678cf03d97204ef7cc1',
  },
];
for (const profile of profiles) Object.freeze(profile);
Object.freeze(profiles);
function resolveInstalledGcpVersionProfile(input) {
  const profile = profiles.find(
    (value) =>
      value.terraformVersion === input.terraformVersion && value.providerLockSha256 === input.providerLockSha256,
  );
  if (!profile) throw new Error('Original installed GCP runtime version and provider lock profile required');
  return profile;
}

// plugins/terraform/src/gcp-bootstrap-evidence.ts
var hash = (value) => createHash('sha256').update(value).digest('hex');
var sha256 = /^[a-f0-9]{64}$/;
var name = /^[a-z][a-z0-9-]{0,62}$/;
var object2 = (value, context = 'Terraform bootstrap creation') => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`Original ${context} object required`);
  return value;
};
var issued = new WeakMap();
function labels(state, api, expected, site) {
  const declared = object2(state.labels),
    actual = object2(object2(api.metadata).labels);
  if (
    Object.keys(declared).length !== Object.keys(expected).length ||
    Object.entries(expected).some(([key, value]) => declared[key] !== value || actual[key] !== value) ||
    Object.keys(actual).some((key) => !Object.hasOwn(expected, key) && !(site && key === 'ves.io/provider')) ||
    (site && actual['ves.io/provider'] !== 'ves-io-GOOGLE')
  )
    throw new Error('Original Terraform bootstrap owned labels or Google provider marker differ');
}
function creation(state, api, expectedName) {
  const metadata = object2(api.metadata),
    uid = object2(api.system_metadata).uid;
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
  const evidence = await collectBootstrap(input, '15.16.2');
  if (evidence.schemaVersion !== 2) throw new Error('Version 2 bootstrap evidence schema required');
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
  if (profile.googleVersion !== '8.11.0' || profile.xcshVersion !== providerVersion)
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
  const siteState = object2(state.resources[siteAddress]),
    tokenState = object2(state.resources[tokenAddress]);
  const siteUid = creation(siteState, site, binding.siteName),
    tokenUid = creation(tokenState, token, binding.tokenName);
  const declared = { 'xcsh-deployment': binding.deploymentName, 'xcsh-engine': 'terraform' };
  labels(siteState, site, declared, true);
  labels(tokenState, token, { ...declared, 'xcsh-node': binding.nodeName }, false);
  const gcp = object2(object2(site.spec, 'GCP Site').gcp, 'GCP'),
    notManaged = object2(gcp.not_managed, 'GCP not-managed');
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
    providerVersion === '15.15.7'
      ? Object.freeze({ ...common, schemaVersion: 1, xcshProviderVersion: '15.15.7' })
      : Object.freeze({ ...common, schemaVersion: 2, xcshProviderVersion: '15.16.2' });
  issued.set(value, { bootstrap, platform });
  return value;
}
async function readOriginalGcpTerraformBootstrapJwt(value) {
  const source = issued.get(value);
  if (!source) throw new Error('Original Terraform bootstrap candidate required');
  return source.platform.readJwt(source.bootstrap);
}

// plugins/terraform/src/gcp-bootstrap-vm-binding.ts
// plugins/terraform/src/gcp-insert-audit-evidence.ts
import { createHash as createHash3, createHash as createHash16 } from 'node:crypto';

// plugins/terraform/src/evidence-rfc3339.ts
function isEvidenceRfc3339(value) {
  if (typeof value !== 'string' || value.length > 64) return false;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!parts) return false;
  const year = Number(parts[1]),
    month = Number(parts[2]),
    day = Number(parts[3]);
  if (
    Number(parts[4]) > 23 ||
    Number(parts[5]) > 59 ||
    Number(parts[6]) > 59 ||
    (parts[7] !== undefined && (Number(parts[7]) > 23 || Number(parts[8]) > 59))
  )
    return false;
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  return (
    calendar.getUTCFullYear() === year &&
    calendar.getUTCMonth() === month - 1 &&
    calendar.getUTCDate() === day &&
    Number.isFinite(Date.parse(value))
  );
}

// plugins/terraform/src/gcp-insert-audit-query.ts
function hasAuditControlCharacters(value) {
  return Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

// plugins/terraform/src/gcp-http-rpc-trace.ts
var issuedBodies = new WeakSet();
function assertOriginalGoogleHttpRpcBodies(value) {
  if (!value || !issuedBodies.has(value)) throw new Error('An original parser-issued HTTP body capability is required');
}
var _maximumLine = 1024 * 1024;
var _maximumStream = 64 * 1024 * 1024;
var _maximumDump = 4 * 1024 * 1024;

// plugins/terraform/src/gcp-insert-evidence.ts
var sourceBodies = new WeakMap();
function readOriginalGcpInsertSourceBodies(source) {
  const bodies = sourceBodies.get(source);
  if (!bodies) throw new Error('An original insert source candidate is required');
  assertOriginalGoogleHttpRpcBodies(bodies);
  return bodies;
}
var _insertOrigins = new WeakMap();

// plugins/terraform/src/gcp-vm-evidence.ts
import { createHash as createHash2 } from 'node:crypto';
import { isIP } from 'node:net';

var hash2 = (value) => createHash2('sha256').update(value).digest('hex');
var object3 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Original VM evidence object required');
  return value;
};
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function metadata(value) {
  const entries = Object.create(null);
  const raw = object3(value);
  if (!Array.isArray(raw.items)) throw new Error('Original VM metadata items required');
  for (const item of raw.items) {
    const pair = object3(item);
    if (
      typeof pair.key !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,127}$/.test(pair.key) ||
      typeof pair.value !== 'string' ||
      Object.hasOwn(entries, pair.key)
    )
      throw new Error('Original unique VM metadata required');
    entries[pair.key] = pair.value;
  }
  return entries;
}
function resourceLink(value) {
  if (typeof value !== 'string') throw new Error('Original interface resource link required');
  if (/^projects\/[a-z0-9-]+\/(?:global\/networks|regions\/[a-z0-9-]+\/subnetworks)\/[a-z0-9-]+$/.test(value))
    return value;
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    !['compute.googleapis.com', 'www.googleapis.com'].includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.startsWith('/compute/v1/projects/')
  )
    throw new Error('Original interface link scope differs');
  return url.pathname.slice('/compute/v1/'.length);
}
async function joinOriginalGcpVmEvidence(input) {
  const { source, reader, absent, operation, instance } = input;
  const bodies = readOriginalGcpInsertSourceBodies(source);
  const records = [absent, operation, instance];
  const retained = [];
  for (const record of records) {
    const read = await reader.readEvidence(record);
    if (
      read.scope.project !== source.project ||
      read.scope.zone !== source.zone ||
      read.scope.node !== source.nodeName ||
      !Number.isSafeInteger(record.startedAt) ||
      !Number.isSafeInteger(record.finishedAt) ||
      record.finishedAt < record.startedAt ||
      Date.now() < record.finishedAt ||
      Date.now() - record.finishedAt > 300000
    )
      throw new Error('Fresh original scoped cloud evidence required');
    retained.push(read);
  }
  const initial = decodeEvidenceObject(retained[0].raw),
    op = decodeEvidenceObject(retained[1].raw),
    vm = decodeEvidenceObject(retained[2].raw);
  const absentError = object3(initial.error);
  if (
    absent.present !== false ||
    absentError.code !== 404 ||
    !Array.isArray(absentError.errors) ||
    !absentError.errors.some((value) => object3(value).reason === 'notFound') ||
    absent.finishedAt > operation.startedAt ||
    operation.operationId !== source.operationId ||
    operation.operationName !== source.operationName ||
    operation.targetName !== source.nodeName ||
    operation.zone !== source.zone ||
    !operation.targetId ||
    operation.targetId !== instance.value.id ||
    (source.targetId !== null && source.targetId !== operation.targetId) ||
    op.id !== operation.operationId ||
    op.name !== operation.operationName ||
    op.error !== undefined ||
    op.operationType !== 'insert' ||
    !isEvidenceRfc3339(op.insertTime) ||
    vm.id !== instance.value.id ||
    vm.name !== source.nodeName ||
    !isEvidenceRfc3339(vm.creationTimestamp) ||
    Date.parse(op.insertTime) < absent.startedAt ||
    Date.parse(vm.creationTimestamp) < Date.parse(op.insertTime) ||
    Date.parse(vm.creationTimestamp) > instance.finishedAt ||
    (vm.serviceAccounts !== undefined && (!Array.isArray(vm.serviceAccounts) || vm.serviceAccounts.length))
  )
    throw new Error('Original absence, insert operation and numeric VM incarnation differ');
  const request = decodeEvidenceObject(Buffer.from(bodies.requestBody));
  const items = metadata(vm.metadata);
  if (
    hash2(canonical(items)) !== source.metadataSha256 ||
    !items['user-data'] ||
    hash2(items['user-data']) !== source.bootstrapSha256 ||
    hash2(canonical(object3(vm.labels))) !== source.labelsSha256 ||
    !Array.isArray(vm.networkInterfaces) ||
    !Array.isArray(request.networkInterfaces) ||
    vm.networkInterfaces.length !== request.networkInterfaces.length
  )
    throw new Error('Original VM bootstrap metadata, ownership labels or interfaces differ');
  const interfaces = vm.networkInterfaces.map((raw, index) => {
    const actual = object3(raw),
      wanted = object3(request.networkInterfaces[index]);
    if (
      actual.name !== `nic${index}` ||
      resourceLink(actual.network) !== resourceLink(wanted.network) ||
      resourceLink(actual.subnetwork) !== resourceLink(wanted.subnetwork) ||
      typeof actual.networkIP !== 'string' ||
      isIP(actual.networkIP) !== 4 ||
      (wanted.networkIP !== undefined && wanted.networkIP !== '' && wanted.networkIP !== actual.networkIP)
    )
      throw new Error('Original ordered CE interface mapping differs');
    const requestedAccess = wanted.accessConfigs ?? [],
      actualAccess = actual.accessConfigs ?? [];
    if (
      !Array.isArray(requestedAccess) ||
      !Array.isArray(actualAccess) ||
      requestedAccess.length !== actualAccess.length
    )
      throw new Error('Original interface egress configuration differs');
    for (const [i, rawRequested] of requestedAccess.entries()) {
      const expected = object3(rawRequested),
        observed = object3(actualAccess[i]);
      for (const key of ['type', 'networkTier', 'natIP'])
        if (expected[key] !== undefined && expected[key] !== '' && expected[key] !== observed[key])
          throw new Error('Original requested interface access configuration differs');
    }
    return Object.freeze({
      index,
      name: actual.name,
      address: actual.networkIP,
      network: resourceLink(actual.network),
      subnetwork: resourceLink(actual.subnetwork),
    });
  });
  for (const record of records) await reader.readEvidence(record);
  const current = await reader.instance(instance.zone, instance.name);
  if (!current.present || current.value.id !== instance.value.id)
    throw new Error('Original VM changed during final correlation');
  readOriginalGcpInsertSourceBodies(source);
  return Object.freeze({
    schemaVersion: 1,
    kind: 'original-gcp-vm-cloud-candidate',
    project: source.project,
    zone: source.zone,
    nodeName: source.nodeName,
    instanceId: instance.value.id,
    operationId: operation.operationId,
    operationName: operation.operationName,
    resourceAddress: source.resourceAddress,
    creationTimestamp: vm.creationTimestamp,
    bootstrapSha256: source.bootstrapSha256,
    metadataSha256: source.metadataSha256,
    labelsSha256: source.labelsSha256,
    interfaces: Object.freeze(interfaces),
    sourceRequestSha256: source.requestBodySha256,
    absenceSha256: absent.sha256,
    operationSha256: operation.sha256,
    instanceSha256: instance.sha256,
    accountSha256: retained[2].authentication.accountSha256,
    audienceSha256: retained[2].authentication.audienceSha256,
    adcSha256: retained[2].authentication.adcSha256,
    cloudEvidenceCorroborated: true,
    applyRpcQualified: false,
    originalInsertQualified: false,
  });
}

// plugins/terraform/src/gcp-insert-audit-evidence.ts
var hash3 = (value) => createHash3('sha256').update(value).digest('hex');
function object4(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Original insert audit object required');
  return value;
}
function canonical2(value) {
  if (Array.isArray(value)) return `[${value.map(canonical2).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical2(value[key])}`)
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
  const attributes = object4(payload.requestMetadata).requestAttributes;
  return attributes === undefined ? {} : object4(attributes);
}
async function joinOriginalGcpInsertAuditEvidence(input) {
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
    .map(object4);
  if (entries.length !== 2) throw new Error('One unambiguous original insert audit first/last pair required');
  const [first, last] = entries;
  const vm = await joinOriginalGcpVmEvidence(input);
  const account = retained.pages[0].authentication.accountSha256;
  if (account !== vm.accountSha256) throw new Error('Original source/cloud/audit principal differs');
  for (const [index, entry] of entries.entries()) {
    const payload = object4(entry.protoPayload),
      operation = object4(entry.operation);
    const labels = object4(object4(entry.resource).labels);
    const status = object4(payload.status);
    const auth = object4(payload.authenticationInfo);
    if (
      labels.instance_id !== vm.instanceId ||
      operation.id !== source.operationName ||
      operation.producer !== 'compute.googleapis.com' ||
      (index === 0
        ? operation.first !== true || operation.last === true
        : operation.last !== true || operation.first === true) ||
      typeof auth.principalEmail !== 'string' ||
      hash3(auth.principalEmail) !== account ||
      (auth.serviceAccountDelegationInfo !== undefined &&
        (!Array.isArray(auth.serviceAccountDelegationInfo) || auth.serviceAccountDelegationInfo.length > 0)) ||
      (status.code !== undefined && status.code !== 0) ||
      Object.keys(status).some((key) => key !== 'code') ||
      !isEvidenceRfc3339(entry.timestamp) ||
      Date.parse(entry.timestamp) < input.absent.startedAt ||
      Date.parse(entry.timestamp) > Math.max(...audit.pages.map((page) => page.finishedAt))
    )
      throw new Error('Original successful audit operation name, principal or numeric VM differs');
  }
  if (Date.parse(first.timestamp) > Date.parse(last.timestamp))
    throw new Error('Original audit first/last chronology differs');
  const payload = object4(first.protoPayload);
  const attributes = requestAttributes(payload);
  if (
    typeof attributes.reason !== 'string' ||
    !attributes.reason ||
    hash3(attributes.reason) !== source.requestReasonSha256
  )
    throw new Error('Original audit request reason is unavailable or differs');
  const lastMetadata = object4(last.protoPayload).requestMetadata;
  if (lastMetadata !== undefined) {
    const attributes = requestAttributes(object4(last.protoPayload));
    if (
      attributes.reason !== undefined &&
      (typeof attributes.reason !== 'string' || hash3(attributes.reason) !== source.requestReasonSha256)
    )
      throw new Error('Original final audit request reason differs');
  }
  const response = object4(payload.response),
    request = object4(payload.request);
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
    request.canIpForward !== true ||
    hash3(canonical2(object4(request.labels))) !== source.labelsSha256
  )
    throw new Error('Original audit response or requested ownership differs');
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
    auditFirstSha256: hash3(canonical2(first)),
    auditLastSha256: hash3(canonical2(last)),
    requestReasonSha256: source.requestReasonSha256,
    applyRpcQualified: false,
    originalInsertQualified: false,
  });
}

// plugins/terraform/src/xcsh-creation-body.ts
import { createHash as createHash15 } from 'node:crypto';

// plugins/platform/src/ce/security.ts
function containsControlCharacters(value) {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

// plugins/terraform/src/installed-xcsh-creation-reader.ts
import { createHash as createHash14, randomUUID as randomUUID7 } from 'node:crypto';
import { lstat as lstat11, mkdir as mkdir6, open as open7, realpath as realpath10 } from 'node:fs/promises';
import { dirname as dirname11, join as join12 } from 'node:path';

// plugins/terraform/src/gcp-capture-source-pins.json
var gcp_capture_source_pins_default = {
  schemaVersion: 1,
  kind: 'gcp-original-capture-sources',
  files: {
    '__init__.py': 'e15c038a408c0c4c10311bdec72a98327f2fb24b1d132132691fa2e69fd26fcb',
    'guest_pty.py': '274de216c148e2a6e267b4082cce552ca04a17adf78a8c8a6dda5ed9579829e3',
    'gcp_guest_session.py': 'babe7881afd16133cad8ce25c2872c6067fe154ba7c03f72c47de58e20f6e786',
    'guest_control.py': '1c04972ed1a4576f450cc71d6e01539e20a9ab3c72d82242f55fcb4e115ed032',
    'guest_worker.py': '8cccbddd35d02ffb64d9c91adbf15c016f6f9ecaf817f9b71c0088257d43a392',
    'guest_entrypoint.py': 'f55af410f939a1d01efa30d2cb14775b060b78a8d2ec7bbdeee1da2335f3e151',
    'gcp_provider_process.py': '2e8828b8907d344cd7f302d9a6c46957293ec8845719e1d39b1f06e98ed7ac00',
    'gcp_provider_reader.py': '19532859fd9390ded4a3321fade653f1ca5ccb0d22afd04f2c37dcc816391ceb',
    'xcsh_creation_observer.py': '988bdf1d393aef539ef62bbe19aea7622c9b796f39c54d8673e6c2c761a5c86d',
    'xcsh_creation_reader.py': '1ee9327729b38dacb8ac9b4d8afb44ec34922ce7c2935c2759cb2ffd395d568a',
  },
};

// plugins/terraform/src/runner.ts
// plugins/platform/src/ce/process-lock.ts
import { createHash as createHash5, randomUUID, randomUUID as randomUUID2 } from 'node:crypto';
import {
  chmod,
  lstat,
  lstat as lstat3,
  mkdir,
  mkdir as mkdir2,
  readdir,
  readFile,
  readFile as readFile2,
  realpath as realpath2,
  rename,
  rename as rename2,
  rm,
  rm as rm2,
  writeFile,
  writeFile as writeFile2,
} from 'node:fs/promises';
// plugins/terraform/src/installed-capture-context.ts
import {
  basename,
  dirname,
  dirname as dirname3,
  isAbsolute as isAbsolute2,
  isAbsolute as isAbsolute3,
  join,
  join as join2,
  resolve as resolve2,
  resolve as resolve3,
} from 'node:path';

async function processGroup(pid) {
  if (process.platform !== 'linux') throw new Error('Original executor group tracking requires Linux');
  const text = await readFile(`/proc/${pid}/stat`, 'utf8');
  const fields = text
    .slice(text.lastIndexOf(') ') + 2)
    .trim()
    .split(/\s+/);
  const group = Number(fields[2]);
  if (!/^\d+$/.test(fields[2] ?? '') || !Number.isSafeInteger(group) || group < 0)
    throw new Error('Original executor group is unavailable');
  return group;
}
async function readGroupLifetime(path, owner) {
  const file = join(path, 'lifetime.json');
  let metadata;
  try {
    metadata = await lstat(file);
  } catch (error) {
    if (error.code === 'ENOENT' && owner.schemaVersion === 1) return;
    throw error;
  }
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.nlink !== 1 ||
    metadata.uid !== process.getuid?.() ||
    (metadata.mode & 511) !== 256
  )
    throw new Error('Original executor lifetime evidence is invalid');
  const raw = await readFile(file, 'utf8');
  const row = JSON.parse(raw);
  if (
    !row ||
    Object.keys(row).sort().join(',') !== 'bootId,group,pid,processStartTicks,schemaVersion,token' ||
    row.schemaVersion !== owner.schemaVersion ||
    row.token !== owner.token ||
    row.pid !== owner.pid ||
    row.bootId !== owner.bootId ||
    row.processStartTicks !== owner.processStartTicks ||
    row.group !== owner.pid
  )
    throw new Error('Original executor lifetime does not join its owner');
  return { row, raw, metadata };
}
async function requireGroupClosed(path, owner) {
  try {
    await lstat(join(path, 'capture-unresolved.json'));
    throw new Error('Original executor capture closure remains unresolved');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await requirePhysicalGroupClosed(path, owner);
}
async function requirePhysicalGroupClosed(path, owner) {
  const original = await readGroupLifetime(path, owner);
  if (!original) return;
  if (process.platform !== 'linux') throw new Error('Original executor group evidence requires Linux');
  if ((await bootId()) === original.row.bootId) {
    for (const name of await readdir('/proc')) {
      if (!/^\d+$/.test(name)) continue;
      try {
        if ((await processGroup(Number(name))) === original.row.group)
          throw new Error('Original executor process group remains live');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
  const current = await readGroupLifetime(path, owner);
  if (
    !current ||
    current.raw !== original.raw ||
    current.metadata.dev !== original.metadata.dev ||
    current.metadata.ino !== original.metadata.ino ||
    current.metadata.ctimeMs !== original.metadata.ctimeMs ||
    current.metadata.mtimeMs !== original.metadata.mtimeMs
  )
    throw new Error('Original executor lifetime changed during closure inspection');
}
async function assertExecutorProcessGroupAbsent(path) {
  const owner = await readClaim(path);
  if (owner.schemaVersion !== 2 || owner.group !== owner.pid)
    throw new Error('Original tracked executor lifetime required for independent cleanup');
  await requirePhysicalGroupClosed(path, owner);
}
async function assertExecutorGroupClosed(path) {
  await requireGroupClosed(path, await readClaim(path));
}
var tokenPattern = /^[a-f0-9-]{36}$/;
var bootPattern = /^[a-f0-9-]{36}$/;
async function bootId() {
  let value;
  if (process.platform === 'darwin') {
    const child = Bun.spawn(['/usr/sbin/sysctl', '-n', 'kern.bootsessionuuid'], { stdout: 'pipe', stderr: 'ignore' });
    value = (await new Response(child.stdout).text()).trim().toLowerCase();
    if ((await child.exited) !== 0) throw new Error('Process boot identity is unavailable');
  } else {
    value = (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim();
  }
  if (!bootPattern.test(value)) throw new Error('Process boot identity is unavailable');
  return value;
}
async function processStartTicks(pid) {
  if (process.platform === 'darwin') {
    const script = `import ctypes, sys
class Info(ctypes.Structure):
 _fields_=[('prefix',ctypes.c_uint32*12),('comm',ctypes.c_char*16),('name',ctypes.c_char*32),('tail',ctypes.c_uint32*6),('seconds',ctypes.c_uint64),('microseconds',ctypes.c_uint64)]
lib=ctypes.CDLL('/usr/lib/libproc.dylib',use_errno=True)
lib.proc_pidinfo.argtypes=[ctypes.c_int,ctypes.c_int,ctypes.c_uint64,ctypes.c_void_p,ctypes.c_int]
info=Info()
result=lib.proc_pidinfo(int(sys.argv[1]),3,0,ctypes.byref(info),ctypes.sizeof(info))
if result==ctypes.sizeof(info): print(info.seconds*1000000+info.microseconds)
elif result==0 and ctypes.get_errno()==3: sys.exit(3)
else: sys.exit(2)
`;
    const child = Bun.spawn(['/usr/bin/python3', '-c', script, String(pid)], { stdout: 'pipe', stderr: 'ignore' });
    const start = (await new Response(child.stdout).text()).trim();
    const code = await child.exited;
    if (code === 3) return;
    if (code !== 0 || !/^\d+$/.test(start)) throw new Error('Process identity is unavailable');
    return start;
  }
  try {
    const value = await readFile(`/proc/${pid}/stat`, 'utf8');
    const end = value.lastIndexOf(') ');
    const fields =
      end < 0
        ? []
        : value
            .slice(end + 2)
            .trim()
            .split(/\s+/);
    const start = fields[19];
    if (!/^\d+$/.test(start ?? '')) throw new Error('Malformed process identity');
    return start;
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
}
function claim(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !==
      (value.schemaVersion === 2
        ? 'bootId,group,pid,processStartTicks,schemaVersion,token'
        : 'bootId,pid,processStartTicks,schemaVersion,token')
  )
    throw new Error('Operation lock evidence cannot be reconciled');
  const row = value;
  if (
    (row.schemaVersion !== 1 && row.schemaVersion !== 2) ||
    (row.schemaVersion === 2 && row.group !== row.pid) ||
    typeof row.token !== 'string' ||
    !tokenPattern.test(row.token) ||
    !Number.isSafeInteger(row.pid) ||
    Number(row.pid) < 1 ||
    typeof row.bootId !== 'string' ||
    !bootPattern.test(row.bootId) ||
    typeof row.processStartTicks !== 'string' ||
    !/^\d+$/.test(row.processStartTicks)
  )
    throw new Error('Operation lock evidence cannot be reconciled');
  return row;
}
async function readClaim(path) {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.())
    throw new Error('Operation lock evidence cannot be reconciled');
  try {
    const claimPath = join(path, 'claim.json');
    const claimStat = await lstat(claimPath);
    if (
      !claimStat.isFile() ||
      claimStat.isSymbolicLink() ||
      claimStat.nlink !== 1 ||
      claimStat.uid !== process.getuid?.() ||
      (claimStat.mode & 63) !== 0
    )
      throw new Error('Operation lock evidence cannot be reconciled');
    return claim(JSON.parse(await readFile(claimPath, 'utf8')));
  } catch (error) {
    if (error instanceof SyntaxError || error.code === 'ENOENT')
      throw new Error('Operation lock evidence cannot be reconciled');
    throw error;
  }
}
async function acquireProcessLock(path, ownerPid = process.pid, options = {}) {
  if (!path.startsWith('/') || !/^\.[a-z][a-z0-9-]*-lock$/.test(basename(path)))
    throw new Error('Invalid operation lock path');
  const currentBootId = await bootId();
  if (!Number.isSafeInteger(ownerPid) || ownerPid < 1) throw new Error('Invalid executor process identity');
  const currentStart = await processStartTicks(ownerPid);
  if (!currentStart) throw new Error('Current process identity is unavailable');
  const trackGroup = options.trackProcessGroup ?? false;
  if (typeof trackGroup !== 'boolean') throw new Error('Explicit process group tracking option required');
  const group = trackGroup ? await processGroup(ownerPid) : undefined;
  const mine = {
    schemaVersion: trackGroup ? 2 : 1,
    token: randomUUID(),
    pid: ownerPid,
    bootId: currentBootId,
    processStartTicks: currentStart,
    ...(group === undefined ? {} : { group }),
  };
  const lifetime = group === undefined ? undefined : { ...mine, group };
  if (lifetime && lifetime.group !== ownerPid) throw new Error('Executor must own a dedicated original process group');
  const parent = dirname(path);
  for (let attempt = 0; attempt < 4; attempt++) {
    const candidate = join(parent, `${basename(path)}.claim-${mine.token}`);
    await mkdir(candidate, { mode: 448 });
    await writeFile(join(candidate, 'claim.json'), JSON.stringify(mine), { mode: 384, flag: 'wx' });
    if (lifetime)
      await writeFile(join(candidate, 'lifetime.json'), JSON.stringify(lifetime), { mode: 256, flag: 'wx' });
    try {
      await rename(candidate, path);
      return async () => {
        const owned = await readClaim(path);
        if (
          owned.token !== mine.token ||
          owned.pid !== mine.pid ||
          owned.schemaVersion !== mine.schemaVersion ||
          owned.bootId !== mine.bootId ||
          owned.processStartTicks !== mine.processStartTicks ||
          owned.group !== mine.group
        )
          throw new Error('Operation lock ownership changed');
        await requireGroupClosed(path, owned);
        await rm(path, { recursive: true });
      };
    } catch (error) {
      await rm(candidate, { recursive: true });
      if (error.code !== 'EEXIST' && error.code !== 'ENOTEMPTY') throw error;
    }
    let existing;
    try {
      existing = await readClaim(path);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    const liveStart = existing.bootId === currentBootId ? await processStartTicks(existing.pid) : undefined;
    if (existing.bootId === currentBootId && liveStart === existing.processStartTicks)
      throw new Error('Operation lock is held by a live process');
    await requireGroupClosed(path, existing);
    const stale = join(parent, `${basename(path)}.stale-${randomUUID()}`);
    try {
      await rename(path, stale);
      await rm(stale, { recursive: true });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  throw new Error('Operation lock could not be acquired');
}

// plugins/terraform/src/failure.ts
var patterns = [
  ['capacity', /\bInsufficientInstanceCapacity\b/],
  ['quota', /\bVpcLimitExceeded\b/],
  ['authorization', /\b(?:AccessDenied|AccessDeniedException|UnauthorizedOperation|AuthorizationFailed)\b/],
  ['expired', /\b(?:ExpiredToken|ExpiredTokenException|AuthenticationTokenExpired)\b/],
  ['throttled', /\b(?:Throttling|ThrottlingException|RequestLimitExceeded|TooManyRequests)\b/],
  [
    'configuration',
    /(?:Error: (?:Missing block label|Unsupported argument|Invalid expression|Invalid reference)|"summary"\s*:\s*"(?:Missing block label|Unsupported argument|Invalid expression|Invalid reference)")/,
  ],
  ['state-lock', /Error (?:acquiring|releasing) the state lock/],
];
function terraformFailureCategories(text) {
  const plain = Bun.stripANSI(text);
  return patterns.filter(([, pattern]) => pattern.test(plain)).map(([category]) => category);
}

class TerraformCommandError extends Error {
  operation;
  exitCode;
  category;
  constructor(operation, exitCode, category = 'unknown') {
    const safe = category === 'unknown' || patterns.some(([value]) => value === category) ? category : 'unknown';
    super(`Terraform ${operation} failed (${safe}); exit code ${exitCode}`);
    this.operation = operation;
    this.exitCode = exitCode;
    this.name = 'TerraformCommandError';
    this.category = safe;
  }
}

// plugins/terraform/src/original-input-monitor.ts
import { createHash as createHash4 } from 'node:crypto';
import { constants, watch } from 'node:fs';
import { lstat as lstat2, open, realpath } from 'node:fs/promises';
import { basename as basename2, dirname as dirname2, isAbsolute, resolve } from 'node:path';

class OriginalInputMonitorError extends Error {
  reason;
  constructor(reason) {
    super('Original input monitor detected a changed identity or bytes');
    this.name = 'OriginalInputMonitorError';
    this.reason = reason;
  }
}
var keys = ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'];
var parentKeys = ['dev', 'ino', 'uid', 'mode'];
function assertSameOriginalInput(original, current) {
  if (
    original.path !== current.path ||
    original.sha256 !== current.sha256 ||
    !original.expectedIdentity ||
    !current.expectedIdentity ||
    !original.expectedParentIdentity ||
    !current.expectedParentIdentity ||
    keys.some(
      (key) =>
        typeof original.expectedIdentity?.[key] !== 'string' ||
        original.expectedIdentity[key] !== current.expectedIdentity?.[key],
    ) ||
    parentKeys.some(
      (key) =>
        typeof original.expectedParentIdentity?.[key] !== 'string' ||
        original.expectedParentIdentity[key] !== current.expectedParentIdentity?.[key],
    )
  )
    throw new Error('Original selected input identity or bytes changed');
}
var hash4 = (raw) => createHash4('sha256').update(raw).digest('hex');
var maximum = 256n * 1024n * 1024n;
var identity = (stat) => Object.fromEntries(keys.map((key) => [key, stat[key].toString()]));
async function metadata2(path) {
  const stat = await lstat2(path, { bigint: true });
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.uid !== BigInt(process.getuid?.() ?? -1) ||
    stat.nlink !== 1n ||
    (stat.mode & 0o022n) !== 0n ||
    stat.size < 1n ||
    stat.size > maximum
  )
    throw new OriginalInputMonitorError('file-metadata-invalid');
  return stat;
}
async function monitorOriginalInputs(input) {
  const bindings = Object.values(input).map((binding) => ({
    ...binding,
    expectedIdentity: binding.expectedIdentity ? { ...binding.expectedIdentity } : undefined,
    expectedParentIdentity: binding.expectedParentIdentity ? { ...binding.expectedParentIdentity } : undefined,
  }));
  if (!bindings.length || new Set(bindings.map((b) => b.path)).size !== bindings.length)
    throw new Error('Original input monitor requires a unique nonempty input set');
  const watchers = [];
  const originals = [];
  let refused = false;
  let firstRefusal;
  const latch = (reason) => {
    refused = true;
    firstRefusal ??= new OriginalInputMonitorError(reason);
    return firstRefusal;
  };
  let closed = false;
  const close = () => {
    closed = true;
    for (const watcher of watchers.splice(0)) watcher.close();
  };
  const observe = (watcher) => {
    watchers.push(watcher);
    watcher.on('error', () => {
      latch('watcher-error');
    });
  };
  const inspectOriginal = async (verifyBytes) => {
    if (refused || closed) throw latch(closed ? 'monitor-closed' : 'watcher-event');
    try {
      for (const { binding, file, parent } of originals) {
        const current = await metadata2(binding.path);
        if (keys.some((key) => current[key].toString() !== file[key]))
          throw new OriginalInputMonitorError('file-identity-changed');
        const currentParent = await lstat2(dirname2(binding.path), { bigint: true });
        if (
          !currentParent.isDirectory() ||
          currentParent.isSymbolicLink() ||
          parentKeys.some((key) => currentParent[key].toString() !== parent[key]) ||
          (await realpath(binding.path)) !== binding.path
        )
          throw new OriginalInputMonitorError('parent-identity-changed');
        const handle = await open(binding.path, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const opened = await handle.stat({ bigint: true });
          if (keys.some((key) => opened[key].toString() !== file[key]))
            throw new OriginalInputMonitorError('open-identity-changed');
          if (verifyBytes && hash4(await handle.readFile()) !== binding.sha256)
            throw new OriginalInputMonitorError('bytes-changed');
        } finally {
          await handle.close();
        }
        const after = await metadata2(binding.path);
        if (keys.some((key) => after[key].toString() !== file[key]))
          throw new OriginalInputMonitorError('read-identity-changed');
        if (refused || closed) throw latch(closed ? 'monitor-closed' : 'watcher-event');
      }
    } catch (error) {
      throw latch(error instanceof OriginalInputMonitorError ? error.reason : 'filesystem-read-unavailable');
    }
  };
  try {
    for (const binding of bindings) {
      if (
        !isAbsolute(binding.path) ||
        resolve(binding.path) !== binding.path ||
        (await realpath(binding.path)) !== binding.path ||
        !/^[a-f0-9]{64}$/.test(binding.sha256)
      )
        throw new Error('Original input monitor requires canonical reviewed bindings');
      const stat = await metadata2(binding.path);
      const parent = await lstat2(dirname2(binding.path), { bigint: true });
      if (
        !parent.isDirectory() ||
        parent.isSymbolicLink() ||
        parent.uid !== BigInt(process.getuid?.() ?? -1) ||
        (parent.mode & 0o022n) !== 0n
      )
        throw new Error('Original input monitor requires an owned parent');
      const file = binding.expectedIdentity ?? identity(stat);
      if (binding.expectedIdentity && !binding.expectedParentIdentity)
        throw new Error('Original input monitor requires the admitted parent identity');
      const parentIdentity = binding.expectedParentIdentity ?? {
        dev: parent.dev.toString(),
        ino: parent.ino.toString(),
        uid: parent.uid.toString(),
        mode: parent.mode.toString(),
      };
      if (parentKeys.some((key) => !/^(?:0|[1-9][0-9]*)$/.test(parentIdentity[key])))
        throw new Error('Original input monitor requires exact admitted parent identities');
      if (keys.some((key) => typeof file[key] !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(file[key])))
        throw new Error('Original input monitor requires exact admitted identities');
      observe(
        watch(binding.path, { persistent: false }, () => {
          latch('watcher-event');
        }),
      );
      observe(
        watch(dirname2(binding.path), { persistent: false }, (_event, name) => {
          if (!name || name.toString() === basename2(binding.path)) latch('watcher-event');
        }),
      );
      originals.push({
        binding,
        file,
        parent: parentIdentity,
      });
    }
    await inspectOriginal(true);
    return Object.freeze({
      assertOriginal: () => inspectOriginal(true),
      assertOriginalIdentity: () => inspectOriginal(false),
      close,
    });
  } catch (error) {
    close();
    throw error;
  }
}

// plugins/terraform/src/runner.ts
var originalPlanSources = new WeakMap();
var originalPlanProjections = new WeakMap();
function assertOriginalTerraformPlanSourceProjection(source, projection) {
  const left = source && typeof source === 'object' ? originalPlanSources.get(source) : undefined;
  const right = projection && typeof projection === 'object' ? originalPlanProjections.get(projection) : undefined;
  if (!left?.active || left !== right)
    throw new Error('Original owning Terraform source and projection differ or retired');
}
async function assertOriginalTerraformPlanProjection(projection) {
  const lease = projection && typeof projection === 'object' ? originalPlanProjections.get(projection) : undefined;
  if (!lease?.active) throw new Error('Original owning Terraform projection is unavailable or retired');
  await lease.assertOriginal();
  if (!lease.active) throw new Error('Original owning Terraform projection retired during inspection');
  await lease.assertOriginal();
  if (!lease.active) throw new Error('Original owning Terraform projection retired during inspection');
}
function freezeOriginalPlan(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeOriginalPlan(child);
    Object.freeze(value);
  }
  return value;
}
async function readOriginalTerraformPlanSource(source, expected) {
  const lease = source && typeof source === 'object' ? originalPlanSources.get(source) : undefined;
  if (!lease?.active) throw new Error('Original owning Terraform plan source is unavailable or retired');
  expected = structuredClone(expected);
  const value = lease.projection;
  if (
    expected.engine !== 'terraform' ||
    expected.scope?.cloud !== 'gcp' ||
    value.directory !== expected.directory ||
    value.receipt.deploymentId !== expected.deploymentId ||
    canonical3(value.scope) !== canonical3(expected.scope) ||
    value.terraformVersion !== expected.terraformVersion ||
    value.receipt.backendIdentity !== expected.backendIdentity
  )
    throw new Error('Original owning Terraform plan scope differs');
  await lease.assertOriginal();
  if (!lease.active) throw new Error('Original owning Terraform plan source retired during inspection');
  await lease.assertOriginal();
  if (!lease.active) throw new Error('Original owning Terraform plan source retired during inspection');
  return value;
}
var cliConfig = `provider_installation {
  direct {}
}
disable_checkpoint = true
`;
var digest = (value) => createHash5('sha256').update(value).digest('hex');
function object5(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Terraform JSON object is malformed');
  return value;
}
function decode(value) {
  try {
    return object5(
      JSON.parse(value, (_key, parsed, context) => {
        if (typeof parsed === 'number' && Number.isInteger(parsed) && !Number.isSafeInteger(parsed)) {
          if (!context?.source || !/^-?\d+$/.test(context.source))
            throw new Error('Exact Terraform integer representation unavailable');
          return context.source;
        }
        return parsed;
      }),
    );
  } catch {
    throw new Error('Terraform returned malformed JSON');
  }
}
var safeId = /^[a-z][a-z0-9-]{0,62}$/;
function canonical3(value) {
  if (Array.isArray(value)) return `[${value.map(canonical3).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical3(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function changeActions(value, output = false) {
  const allowed = output
    ? ['no-op', 'create', 'update', 'delete']
    : ['no-op', 'read', 'create', 'update', 'delete', 'delete,create', 'create,delete'];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || item.includes(',')) ||
    !allowed.includes(value.join(','))
  )
    throw new Error('Terraform change actions are malformed or unsupported');
  return value;
}
function validateActionIntent(intent) {
  if (
    !intent ||
    Object.keys(intent).sort().join(',') !== 'address,configValuesSha256,providerName,type' ||
    Object.values(intent).some((value) => typeof value !== 'string') ||
    !/^[a-z][a-z0-9_]*$/.test(intent.type) ||
    !new RegExp(`^action\\.${intent.type}\\.[a-z][a-z0-9_]*(?:\\["[a-z][a-z0-9_-]*"\\])?$`).test(intent.address) ||
    !/^[a-z0-9.-]+\/[a-z0-9-]+\/[a-z0-9-]+$/.test(intent.providerName) ||
    !/^[a-f0-9]{64}$/.test(intent.configValuesSha256)
  )
    throw new Error('Explicit action address, provider and configuration digest required');
}
function allFalse(value) {
  return value === false || (value !== null && typeof value === 'object' && Object.values(value).every(allFalse));
}
function inspectActionInvocations(plan, expected) {
  const invocations = plan.action_invocations === undefined ? [] : plan.action_invocations;
  const deferred = plan.deferred_action_invocations === undefined ? [] : plan.deferred_action_invocations;
  if (
    !Array.isArray(invocations) ||
    !Array.isArray(deferred) ||
    deferred.length ||
    invocations.length !== (expected ? 1 : 0)
  )
    throw new Error('Terraform actions are unrequested, missing, duplicated or deferred');
  if (!expected) return [];
  const action = object5(invocations[0]);
  if (
    action.address !== expected.address ||
    action.type !== expected.type ||
    action.provider_name !== expected.providerName ||
    action.lifecycle_action_trigger !== undefined ||
    Object.keys(object5(action.invoke_action_trigger)).length ||
    !allFalse(action.config_unknown) ||
    !allFalse(action.config_sensitive) ||
    digest(canonical3(object5(action.config_values))) !== expected.configValuesSha256
  )
    throw new Error('Terraform action identity, trigger or configuration differs');
  return [{ ...expected }];
}
async function privateDirectory(path) {
  await mkdir2(path, { recursive: true, mode: 448 });
  const stat = await lstat3(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    (await realpath2(path)) !== path
  )
    throw new Error('Terraform storage ownership is invalid');
  await chmod(path, 448);
}
async function privateRead(path) {
  const stat = await lstat3(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 63) !== 0
  )
    throw new Error('Terraform artifact ownership is invalid');
  return readFile2(path);
}
async function persist(path, value) {
  const temporary = `${path}.new`;
  await writeFile2(temporary, JSON.stringify(value), { mode: 384, flag: 'wx' });
  await rename2(temporary, path);
}
async function startTerraformGate(child, acquire, timeoutMs = 15000, killAfterMs = 5000, transition = async () => {}) {
  let stopped = false;
  let failed = false;
  let release;
  let releasing;
  const releaseOnce = () => (releasing ??= release?.());
  let timer;
  const startup = (async () => {
    await transition('identity-pending');
    release = await acquire();
    if (failed) {
      if (stopped) await releaseOnce();
      throw new Error('Terraform executor gate startup deadline exceeded');
    }
    await transition('identity-persisted');
    if (failed) throw new Error('Terraform executor gate startup deadline exceeded');
    child.stdin.write(`go
`);
    await child.stdin.flush();
    await child.stdin.end();
    await transition('gate-released');
    return release;
  })();
  try {
    return await Promise.race([
      startup,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Terraform executor gate startup deadline exceeded')), timeoutMs);
      }),
    ]);
  } catch (error) {
    failed = true;
    try {
      child.kill('SIGKILL');
    } catch {}
    let exitTimer;
    try {
      await Promise.race([
        child.exited,
        new Promise((_, reject) => {
          exitTimer = setTimeout(
            () => reject(new Error('Terraform executor stop unresolved; recovery remains blocked')),
            killAfterMs,
          );
        }),
      ]);
      stopped = true;
      if (release) await releaseOnce();
      await transition('startup-failed-child-exited');
    } finally {
      if (exitTimer) clearTimeout(exitTimer);
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
function terraformExecutor(
  limits = {
    timeoutMs: 900000,
    applyTimeoutMs: 3600000,
    maxOutputBytes: 64 * 1024 * 1024,
    killAfterMs: 5000,
    startupTimeoutMs: 15000,
  },
  retainFailure = false,
) {
  return async ({ cwd, args, env, signal }) => {
    signal?.throwIfAborted();
    const child = Bun.spawn(
      [
        '/bin/sh',
        '-c',
        'umask 077; IFS= read -r gate && test "$gate" = go && exec "$@"',
        'ce-terraform',
        'terraform',
        ...args,
      ],
      {
        cwd,
        env,
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    const invocationId = randomUUID2();
    const transition = async (phase) => {
      if (!retainFailure) return;
      const directory = join2(cwd, 'executor-diagnostics');
      await privateDirectory(directory);
      const claim = await privateRead(join2(cwd, '.terraform-executor-lock', 'claim.json')).then(
        (bytes) => JSON.parse(bytes.toString('utf8')),
        () => {
          return;
        },
      );
      const executable = Bun.which('terraform', { cwd, PATH: env.PATH });
      await persist(join2(directory, `${invocationId}-${phase}.json`), {
        schemaVersion: 1,
        invocationId,
        phase,
        observedAt: new Date().toISOString(),
        pid: child.pid,
        operation: args[0],
        launcher: '/bin/sh',
        executable,
        executableSha256: executable ? digest(await readFile2(executable)) : undefined,
        executorIdentity: claim?.pid === child.pid ? claim : undefined,
      });
    };
    const releaseExecutor = await startTerraformGate(
      child,
      () => acquireProcessLock(join2(cwd, '.terraform-executor-lock'), child.pid),
      limits.startupTimeoutMs ?? 15000,
      limits.killAfterMs,
      transition,
    );
    let failure;
    let escalation;
    const stop = (reason) => {
      if (failure) return;
      failure = reason;
      child.kill('SIGTERM');
      escalation = setTimeout(() => child.kill('SIGKILL'), limits.killAfterMs);
    };
    const abort = () => stop('Terraform operation cancelled');
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timeoutMs = args[0] === 'apply' ? limits.applyTimeoutMs : limits.timeoutMs;
    const timer = setTimeout(() => stop('Terraform operation deadline exceeded'), timeoutMs);
    const categories = new Set();
    const collect = async (stream, retain, classify = false) => {
      const reader = stream.getReader();
      const chunks = [];
      let size = 0;
      let tail = '';
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > limits.maxOutputBytes) stop('Terraform response exceeded size limit');
          if (retain && !failure) chunks.push(value);
          if (classify && !failure) {
            const text = tail + Buffer.from(value).toString('utf8');
            for (const category of terraformFailureCategories(text)) categories.add(category);
            tail = text.slice(-512);
          }
        }
      } finally {
        reader.releaseLock();
      }
      return retain && !failure ? Buffer.concat(chunks).toString('utf8') : '';
    };
    try {
      const [stdout, stderr, code] = await Promise.all([
        collect(child.stdout, true),
        collect(child.stderr, retainFailure, true),
        child.exited,
      ]);
      if (failure) throw new Error(failure);
      if (code !== 0 && args[0] === 'validate') {
        try {
          const diagnostics = JSON.parse(stdout).diagnostics;
          if (Array.isArray(diagnostics)) {
            for (const item of diagnostics)
              if (item?.severity === 'error' && typeof item.summary === 'string')
                for (const category of terraformFailureCategories(`Error: ${item.summary}`)) categories.add(category);
          }
        } catch {}
      }
      const failureCategory = categories.size === 1 ? [...categories][0] : 'unknown';
      if (code !== 0 && retainFailure) {
        await privateDirectory(cwd);
        const directory = join2(cwd, 'failure-diagnostics');
        await privateDirectory(directory);
        await persist(join2(directory, `${randomUUID2()}.json`), {
          schemaVersion: 1,
          observedAt: new Date().toISOString(),
          operation: args[0],
          exitCode: code,
          category: failureCategory,
          stdout,
          stderr,
        });
      }
      return code === 0 ? { code, stdout } : { code, stdout: '', failureCategory };
    } catch {
      stop('Terraform process failed');
      await child.exited;
      throw new Error(failure ?? 'Terraform process failed');
    } finally {
      clearTimeout(timer);
      if (escalation) clearTimeout(escalation);
      signal?.removeEventListener('abort', abort);
      await releaseExecutor?.();
    }
  };
}
function validateResourceSelections(selections) {
  if (
    !selections ||
    typeof selections !== 'object' ||
    Array.isArray(selections) ||
    !Object.keys(selections).length ||
    Object.entries(selections).some(
      ([address, fields]) =>
        !/^(?:data\.)?[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(address) ||
        !Array.isArray(fields) ||
        !fields.length ||
        new Set(fields).size !== fields.length ||
        fields.some(
          (field) =>
            typeof field !== 'string' ||
            !/^[a-z][a-z0-9_]*(?:\.(?:[a-z][a-z0-9_]*|0|[1-9][0-9]*))*$/.test(field) ||
            field.split('.').some((part) => ['__proto__', 'constructor', 'prototype'].includes(part)),
        ),
    )
  )
    throw new Error('Explicit root resource addresses and unique fields with explicit paths are required');
}
function projectResourceFields(values, sensitivity, fields) {
  const nonsensitive = (value) =>
    value === undefined ||
    value === false ||
    (value !== null && typeof value === 'object' && Object.values(value).every(nonsensitive));
  const selected = {};
  for (const field of fields) {
    let value = values;
    let marker = sensitivity;
    const parts = field.split('.');
    for (const [index, part] of parts.entries()) {
      if (
        marker === true ||
        !value ||
        typeof value !== 'object' ||
        !Object.hasOwn(value, part) ||
        (Array.isArray(value) && !(part === 'length' && index === parts.length - 1) && !/^(0|[1-9][0-9]*)$/.test(part))
      )
        throw new Error('Terraform resource field is unavailable or sensitive');
      marker =
        Array.isArray(value) && part === 'length'
          ? false
          : marker !== null && typeof marker === 'object'
            ? marker[part]
            : marker;
      value = value[part];
    }
    if (!nonsensitive(marker)) throw new Error('Terraform resource field is unavailable or sensitive');
    selected[field] = value;
  }
  return selected;
}
var executeTerraform = terraformExecutor(undefined, true);

class TerraformRunner {
  root;
  execute;
  #directory;
  #manifest;
  #busy = false;
  #planSource;
  #cleanup;
  #cleanupEmpty = false;
  #cleanupMonitor;
  #verificationMonitor;
  constructor(root, execute = executeTerraform, cleanup, planSource) {
    this.root = root;
    this.execute = execute;
    if (planSource !== undefined && (planSource !== 'gcp-resource-plan-v1' || execute === executeTerraform))
      throw new Error('Trusted versioned owning plan source requires its original executor');
    this.#planSource = planSource === 'gcp-resource-plan-v1';
    if (!isAbsolute2(root) || resolve2(root) !== root) throw new Error('Terraform storage must be an absolute path');
    if (cleanup) {
      if (
        execute === executeTerraform ||
        !safeId.test(cleanup.deploymentId) ||
        !/^[a-f0-9]{64}$/.test(cleanup.deploymentManifestSha256) ||
        !/^[a-f0-9]{64}$/.test(cleanup.state.sha256) ||
        !cleanup.state.lineage ||
        !Number.isSafeInteger(cleanup.state.serial) ||
        cleanup.state.serial < 0 ||
        !cleanup.resources.length ||
        new Set(cleanup.resources.map((r) => r.address)).size !== cleanup.resources.length ||
        cleanup.resources.some((r) => !r.address || !r.id) ||
        typeof cleanup.assertIndependentClosure !== 'function' ||
        ['claim.json', 'lifetime.json', 'capture-unresolved.json'].some(
          (name) => !/^[a-f0-9]{64}$/.test(cleanup.retainedLockSha256[name]),
        )
      )
        throw new Error('Reviewed capture-independent cleanup scope and executor required');
      const verification = cleanup.verification;
      if (
        verification &&
        (verification.schemaVersion !== 1 ||
          verification.kind !== 'applied-destroy-state-verification' ||
          !/^[a-f0-9]{64}$/.test(verification.state?.sha256 ?? '') ||
          verification.state.lineage !== cleanup.state.lineage ||
          !Number.isSafeInteger(verification.state.serial) ||
          verification.state.serial <= cleanup.state.serial)
      )
        throw new Error('Original applied cleanup verification scope required');
      const verificationInput = verification
        ? freezeAdmittedCaptureInputs({ checkpoint: verification.checkpoint }).checkpoint
        : undefined;
      this.#cleanup = Object.freeze({
        ...cleanup,
        state: Object.freeze({ ...cleanup.state }),
        resources: Object.freeze(cleanup.resources.map((r) => Object.freeze({ ...r }))),
        retainedLockInputs: freezeAdmittedCaptureInputs(cleanup.retainedLockInputs),
        retainedLockSha256: Object.freeze({ ...cleanup.retainedLockSha256 }),
        ...(verification && verificationInput
          ? {
              verification: Object.freeze({
                ...verification,
                checkpoint: verificationInput,
                state: Object.freeze({ ...verification.state }),
              }),
            }
          : {}),
        assertIndependentClosure: cleanup.assertIndependentClosure,
      });
    }
  }
  async prepare(deployment) {
    if (this.#cleanup) throw new Error('Capture-independent cleanup cannot prepare a new deployment');
    if (deployment.schemaVersion !== 1 || deployment.engine !== 'terraform' || !safeId.test(deployment.deploymentId))
      throw new Error('Terraform deployment identity or owning engine is unsupported');
    if (deployment.stage !== undefined && !safeId.test(deployment.stage))
      throw new Error('Invalid Terraform stage identity');
    if (!/^\d+\.\d+\.\d+$/.test(deployment.terraformVersion) || !deployment.providerLock.trim())
      throw new Error('Exact Terraform version and provider lock are required');
    const configuration = decode(deployment.configuration);
    if (
      object5(configuration.terraform ?? {}).backend ||
      object5(configuration.terraform ?? {}).cloud ||
      deployment.backendIdentity !==
        `local:${deployment.deploymentId}${deployment.stage ? `:stage:${deployment.stage}` : ''}`
    )
      throw new Error('This runner currently admits isolated local backends only');
    if (
      !deployment.scope.account ||
      !deployment.scope.region ||
      !['aws', 'azure', 'gcp'].includes(deployment.scope.cloud)
    )
      throw new Error('Explicit deployment scope is required');
    await privateDirectory(this.root);
    const directory = join2(this.root, deployment.deploymentId);
    await mkdir2(directory, { mode: 448 });
    const { configuration: source, providerLock, ...identity } = deployment;
    const manifest = { ...identity, configurationSha256: digest(source), providerLockSha256: digest(providerLock) };
    await writeFile2(join2(directory, 'main.tf.json'), source, { mode: 384, flag: 'wx' });
    await writeFile2(join2(directory, '.terraform.lock.hcl'), providerLock, { mode: 384, flag: 'wx' });
    await writeFile2(join2(directory, 'deployment.tfrc'), cliConfig, { mode: 384, flag: 'wx' });
    await persist(join2(directory, 'deployment.json'), manifest);
    this.#directory = directory;
    this.#manifest = manifest;
  }
  async readConfigurationSha256() {
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      return this.#state().manifest.configurationSha256;
    });
  }
  async readConfiguration(expectedSha256) {
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const { directory, manifest } = this.#state();
      if (manifest.configurationSha256 !== expectedSha256) throw new Error('Terraform configuration snapshot is stale');
      const configuration = await privateRead(join2(directory, 'main.tf.json'));
      if (digest(configuration) !== expectedSha256) throw new Error('Terraform configuration snapshot changed');
      return configuration.toString();
    });
  }
  async reconcileApplyFromEvidence(receipt, evidenceSha256) {
    if (this.#cleanup) throw new Error('Capture-independent cleanup cannot reconcile creation');
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const { directory, manifest } = this.#state();
      const journal = decode((await privateRead(join2(directory, 'plan-receipt.json'))).toString());
      if (
        !['applying', 'applied'].includes(String(journal.state)) ||
        canonical3(receipt) !== canonical3(journal.receipt) ||
        receipt.engine !== 'terraform' ||
        receipt.deploymentId !== manifest.deploymentId ||
        receipt.backendIdentity !== manifest.backendIdentity ||
        receipt.configurationSha256 !== manifest.configurationSha256 ||
        receipt.providerLockSha256 !== manifest.providerLockSha256 ||
        receipt.planSha256 !== digest(await privateRead(join2(directory, 'saved.tfplan'))) ||
        !/^[a-f0-9]{64}$/.test(evidenceSha256)
      )
        throw new Error('Terraform interrupted apply evidence differs from the exact saved plan');
      await this.#replacePrivate(
        join2(directory, 'plan-receipt.json'),
        JSON.stringify({ state: 'applied', receipt, reconciledEvidenceSha256: evidenceSha256 }),
      );
    });
  }
  async reviseConfiguration(expectedSha256, configuration) {
    if (this.#cleanup) throw new Error('Capture-independent cleanup cannot revise configuration');
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const { directory, manifest } = this.#state();
      if (manifest.configurationSha256 !== expectedSha256) throw new Error('Terraform configuration revision is stale');
      this.#validateRevision(configuration, (await privateRead(join2(directory, 'main.tf.json'))).toString());
      const nextSha256 = digest(configuration);
      if (nextSha256 === expectedSha256) return nextSha256;
      let receipt;
      try {
        receipt = decode((await privateRead(join2(directory, 'plan-receipt.json'))).toString());
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (receipt?.state === 'applying')
        throw new Error('Reconcile interrupted Terraform apply before revising configuration');
      const transition = {
        previous: manifest,
        next: { ...manifest, configurationSha256: nextSha256 },
        configuration,
        archiveId: randomUUID2(),
      };
      await this.#replacePrivate(join2(directory, 'configuration-transition.json'), JSON.stringify(transition));
      await this.#recoverRevision();
      return nextSha256;
    });
  }
  #validateRevision(configuration, previousConfiguration) {
    const next = decode(configuration);
    const terraform = object5(next.terraform ?? {});
    if (terraform.backend || terraform.cloud) throw new Error('Terraform configuration revision cannot change backend');
    if (previousConfiguration !== undefined) {
      const previous = decode(previousConfiguration);
      for (const key of ['terraform', 'provider'])
        if (canonical3(previous[key] ?? {}) !== canonical3(next[key] ?? {}))
          throw new Error('Terraform configuration revision cannot change provider or execution identity');
    }
  }
  async #replacePrivate(path, content) {
    const temporary = `${path}.${randomUUID2()}.new`;
    await writeFile2(temporary, content, { mode: 384, flag: 'wx' });
    await rename2(temporary, path);
  }
  async #recoverRevision() {
    const { directory } = this.#state();
    let transition;
    try {
      transition = decode((await privateRead(join2(directory, 'configuration-transition.json'))).toString());
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    const previous = object5(transition.previous);
    const next = object5(transition.next);
    if (
      typeof transition.configuration !== 'string' ||
      typeof transition.archiveId !== 'string' ||
      !/^[0-9a-f-]{36}$/.test(transition.archiveId) ||
      !/^[0-9a-f]{64}$/.test(previous.configurationSha256) ||
      canonical3({ ...previous, configurationSha256: next.configurationSha256 }) !== canonical3(next) ||
      next.configurationSha256 !== digest(transition.configuration)
    )
      throw new Error('Terraform configuration transition is malformed');
    this.#validateRevision(transition.configuration);
    const owner = decode((await privateRead(join2(directory, 'deployment.json'))).toString());
    const current = await privateRead(join2(directory, 'main.tf.json'));
    if (
      ![canonical3(previous), canonical3(next)].includes(canonical3(owner)) ||
      ![previous.configurationSha256, next.configurationSha256].includes(digest(current)) ||
      digest(await privateRead(join2(directory, '.terraform.lock.hcl'))) !== previous.providerLockSha256 ||
      digest(await privateRead(join2(directory, 'deployment.tfrc'))) !== digest(cliConfig)
    )
      throw new Error('Terraform configuration transition ownership or inputs changed');
    const archive = join2(directory, 'revisions', transition.archiveId);
    await privateDirectory(archive);
    const archiveFile = async (name, content) => {
      try {
        await writeFile2(join2(archive, name), content, { mode: 384, flag: 'wx' });
      } catch (error) {
        if (error.code !== 'EEXIST' || digest(await privateRead(join2(archive, name))) !== digest(content)) throw error;
      }
    };
    if (digest(current) === previous.configurationSha256) await archiveFile('main.tf.json', current);
    if (digest(await privateRead(join2(archive, 'main.tf.json'))) !== previous.configurationSha256)
      throw new Error('Previous Terraform configuration archive is missing');
    this.#validateRevision(transition.configuration, (await privateRead(join2(archive, 'main.tf.json'))).toString());
    await archiveFile('deployment.json', Buffer.from(JSON.stringify(previous)));
    for (const name of ['saved.tfplan', 'plan-receipt.json']) {
      try {
        await archiveFile(name, await privateRead(join2(directory, name)));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    await this.#replacePrivate(join2(directory, 'main.tf.json'), transition.configuration);
    await this.#replacePrivate(join2(directory, 'deployment.json'), JSON.stringify(next));
    this.#manifest = next;
    await rm2(join2(directory, 'configuration-transition.json'));
  }
  async resume(deploymentId, expected, configurationMode = 'exact') {
    if (configurationMode === 'current' && !expected) throw new Error('Current configuration resume requires identity');
    if (!safeId.test(deploymentId)) throw new Error('Invalid Terraform deployment identity');
    const directory = join2(this.root, deploymentId);
    await privateDirectory(directory);
    const manifest = decode((await privateRead(join2(directory, 'deployment.json'))).toString());
    if (manifest.schemaVersion !== 1 || manifest.engine !== 'terraform' || manifest.deploymentId !== deploymentId)
      throw new Error('Terraform deployment ownership is invalid');
    this.#directory = directory;
    this.#manifest = manifest;
    await this.#exclusive(() => this.#recoverRevision());
    const recoveredManifest = this.#state().manifest;
    if (expected) {
      const { configuration, providerLock, ...identity } = expected;
      const expectedManifest = {
        ...identity,
        configurationSha256:
          configurationMode === 'current' ? recoveredManifest.configurationSha256 : digest(configuration),
        providerLockSha256: digest(providerLock),
      };
      if (canonical3(recoveredManifest) !== canonical3(expectedManifest))
        throw new Error('Terraform deployment differs from the requested identity or configuration');
      if (configurationMode === 'current')
        this.#validateRevision((await privateRead(join2(directory, 'main.tf.json'))).toString(), configuration);
    }
    this.#directory = directory;
    this.#manifest = recoveredManifest;
    await this.#verifyInputs();
  }
  async resumeCompletedCleanupReadOnly(deploymentId) {
    const scope = this.#cleanup;
    if (!scope || scope.deploymentId !== deploymentId || !safeId.test(deploymentId))
      throw new Error('Original completed cleanup inspection scope required');
    const directory = join2(this.root, deploymentId);
    const files = [
      'deployment.json',
      'main.tf.json',
      '.terraform.lock.hcl',
      'deployment.tfrc',
      'terraform.tfstate',
      'plan-receipt.json',
      'saved.tfplan',
    ];
    const snapshots = new Map();
    const inputs = { ...scope.retainedLockInputs };
    for (const name of files) {
      const path = join2(directory, name),
        parent = await lstat3(directory, { bigint: true });
      const first = await lstat3(path, { bigint: true });
      const raw = await privateRead(path);
      const second = await lstat3(path, { bigint: true });
      const identity = (value) =>
        Object.fromEntries(
          ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'].map((key) => [key, String(value[key])]),
        );
      if (canonical3(identity(first)) !== canonical3(identity(second)))
        throw new Error('Original cleanup inspection inputs changed');
      snapshots.set(name, raw);
      inputs[`inspection:${name}`] = {
        path,
        sha256: digest(raw),
        expectedIdentity: identity(second),
        expectedParentIdentity: {
          dev: String(parent.dev),
          ino: String(parent.ino),
          uid: String(parent.uid),
          mode: String(parent.mode),
        },
      };
    }
    const monitor = await monitorOriginalInputs(inputs);
    try {
      await monitor.assertOriginal();
      await assertExecutorProcessGroupAbsent(join2(directory, '.terraform-executor-lock'));
      await scope.assertIndependentClosure();
      const raw = (name) => {
        const value = snapshots.get(name);
        if (!value) throw new Error('Original inspection snapshot missing');
        return value;
      };
      const owner = decode(raw('deployment.json').toString()),
        state = decode(raw('terraform.tfstate').toString());
      const checkpoint = decode(raw('plan-receipt.json').toString()),
        receipt = object5(checkpoint.receipt);
      if (
        digest(raw('deployment.json')) !== scope.deploymentManifestSha256 ||
        owner.engine !== 'terraform' ||
        owner.deploymentId !== deploymentId ||
        digest(raw('main.tf.json')) !== owner.configurationSha256 ||
        digest(raw('.terraform.lock.hcl')) !== owner.providerLockSha256 ||
        digest(raw('deployment.tfrc')) !== digest(cliConfig) ||
        state.lineage !== scope.state.lineage ||
        !Number.isSafeInteger(state.serial) ||
        state.serial <= scope.state.serial ||
        !Array.isArray(state.resources) ||
        state.resources.length ||
        checkpoint.state !== 'planned' ||
        receipt.schemaVersion !== 1 ||
        receipt.engine !== 'terraform' ||
        receipt.deploymentId !== deploymentId ||
        receipt.backendIdentity !== owner.backendIdentity ||
        receipt.configurationSha256 !== owner.configurationSha256 ||
        receipt.providerLockSha256 !== owner.providerLockSha256 ||
        receipt.operation !== 'destroy' ||
        receipt.noChanges !== true ||
        !Array.isArray(receipt.changes) ||
        receipt.changes.length ||
        (receipt.actionInvocations !== undefined &&
          (!Array.isArray(receipt.actionInvocations) || receipt.actionInvocations.length)) ||
        receipt.planSha256 !== digest(raw('saved.tfplan'))
      )
        throw new Error('Original stable empty state and recorded empty destroy plan required');
      await scope.assertIndependentClosure();
      await assertExecutorProcessGroupAbsent(join2(directory, '.terraform-executor-lock'));
      await monitor.assertOriginal();
      return Object.freeze({
        schemaVersion: 1,
        kind: 'completed-cleanup-read-only-resume',
        readOnly: true,
        deploymentId,
        engine: 'terraform',
        stateSha256: digest(raw('terraform.tfstate')),
        stateSerial: state.serial,
        lineage: state.lineage,
        emptyPlanSha256: receipt.planSha256,
        executorSubmissions: 0,
        originalFailedLocksRetained: true,
      });
    } finally {
      monitor.close();
    }
  }
  #state() {
    if (!this.#directory || !this.#manifest) throw new Error('Prepare or resume the deployment first');
    return { directory: this.#directory, manifest: this.#manifest };
  }
  async #verifyInputs() {
    if (!this.#manifest || !this.#directory) throw new Error('Prepare or resume the deployment first');
    try {
      await lstat3(join2(this.#directory, 'configuration-transition.json'));
      throw new Error('Resume the interrupted Terraform configuration transition before execution');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const owner = decode((await privateRead(join2(this.#directory, 'deployment.json'))).toString());
    if (canonical3(owner) !== canonical3(this.#manifest) || owner.engine !== 'terraform')
      throw new Error('Terraform deployment ownership changed');
    for (const [file, expected] of [
      ['main.tf.json', this.#manifest.configurationSha256],
      ['.terraform.lock.hcl', this.#manifest.providerLockSha256],
      ['deployment.tfrc', digest(cliConfig)],
    ]) {
      if (digest(await privateRead(join2(this.#directory, file))) !== expected)
        throw new Error('Terraform configuration or provider lock changed');
    }
  }
  #environment(ambient) {
    const env = Object.fromEntries(Object.entries(ambient).filter(([key]) => !key.startsWith('TF_')));
    return {
      ...env,
      TF_CLI_CONFIG_FILE: join2(this.#state().directory, 'deployment.tfrc'),
      TF_DATA_DIR: join2(this.#state().directory, '.terraform'),
      TF_IN_AUTOMATION: '1',
      TF_INPUT: '0',
      TF_WORKSPACE: 'default',
    };
  }
  async #run(args, env, signal, originalPlanSource) {
    signal?.throwIfAborted();
    const result = await this.execute({
      cwd: this.#state().directory,
      args,
      env: this.#environment(env),
      signal,
      ...(originalPlanSource ? { originalPlanSource } : {}),
    });
    if (result.code !== 0) throw new TerraformCommandError(args[0], result.code, result.failureCategory);
    return result.stdout;
  }
  async #exclusive(operation) {
    if (this.#busy) throw new Error('Terraform deployment operation is already running');
    if (!this.#directory) throw new Error('Prepare or resume the deployment first');
    this.#busy = true;
    const lock = join2(this.#directory, '.runner-lock');
    let release;
    try {
      release = await acquireProcessLock(lock);
      if (this.#cleanup) await this.#verifyCaptureCleanup();
      else {
        const executorStopped = await acquireProcessLock(join2(this.#directory, '.terraform-executor-lock'));
        await executorStopped();
      }
      return await operation();
    } finally {
      if (release) await release();
      this.#busy = false;
    }
  }
  async #verifyCaptureCleanup() {
    const scope = this.#cleanup;
    if (!scope || !this.#directory || this.#manifest?.deploymentId !== scope.deploymentId)
      throw new Error('Original cleanup owner differs');
    const directory = this.#directory;
    if (digest(await privateRead(join2(directory, 'deployment.json'))) !== scope.deploymentManifestSha256)
      throw new Error('Original cleanup manifest changed');
    const lock = join2(directory, '.terraform-executor-lock');
    for (const name of ['claim.json', 'lifetime.json', 'capture-unresolved.json'])
      if (
        scope.retainedLockInputs[name]?.path !== join2(lock, name) ||
        scope.retainedLockInputs[name]?.sha256 !== scope.retainedLockSha256[name]
      )
        throw new Error('Original retained cleanup lock admission differs');
    this.#cleanupMonitor ??= await monitorOriginalInputs(scope.retainedLockInputs);
    await this.#cleanupMonitor.assertOriginal();
    for (const [name, expected] of Object.entries(scope.retainedLockSha256))
      if (digest(await privateRead(join2(lock, name))) !== expected)
        throw new Error('Original failed cleanup lock changed');
    await assertExecutorProcessGroupAbsent(lock);
    await scope.assertIndependentClosure();
    const raw = await privateRead(join2(directory, 'terraform.tfstate'));
    const state = decode(raw.toString());
    if (
      state.lineage !== scope.state.lineage ||
      !Number.isSafeInteger(state.serial) ||
      state.serial < scope.state.serial
    )
      throw new Error('Original reviewed cleanup state identity changed');
    if (!Array.isArray(state.resources)) throw new Error('Original cleanup state resources are malformed');
    const verification = scope.verification;
    if (verification) {
      if (
        !verification.checkpoint.path.startsWith(`${join2(directory, 'capture-cleanup-verification')}/`) ||
        digest(raw) !== verification.state.sha256 ||
        state.lineage !== verification.state.lineage ||
        state.serial !== verification.state.serial
      )
        throw new Error('Original empty cleanup verification state differs');
      this.#verificationMonitor ??= await monitorOriginalInputs({ checkpoint: verification.checkpoint });
      await this.#verificationMonitor.assertOriginal();
      const checkpoint = decode((await privateRead(verification.checkpoint.path)).toString());
      const receipt = object5(checkpoint.receipt);
      const changes = receipt.changes;
      if (
        checkpoint.state !== 'applied' ||
        receipt.schemaVersion !== 1 ||
        receipt.engine !== 'terraform' ||
        receipt.operation !== 'destroy' ||
        receipt.noChanges !== false ||
        !/^[a-f0-9]{64}$/.test(String(receipt.planSha256)) ||
        receipt.deploymentId !== scope.deploymentId ||
        receipt.backendIdentity !== this.#manifest.backendIdentity ||
        receipt.configurationSha256 !== this.#manifest.configurationSha256 ||
        receipt.providerLockSha256 !== this.#manifest.providerLockSha256 ||
        !Array.isArray(changes) ||
        !changes.length ||
        changes.some(
          (change) =>
            object5(change).actions === undefined || canonical3(object5(change).actions) !== canonical3(['delete']),
        ) ||
        canonical3(changes.map((change) => object5(change).address).sort()) !==
          canonical3(scope.resources.map((resource) => resource.address).sort())
      )
        throw new Error('Original applied destroy checkpoint required for cleanup verification');
      await this.#verificationMonitor.assertOriginal();
      this.#cleanupEmpty = true;
    }
    const resources = state.resources.map(object5);
    const actual = resources
      .filter((r) => r.mode === 'managed')
      .flatMap((r) => {
        if (typeof r.type !== 'string' || typeof r.name !== 'string' || !Array.isArray(r.instances))
          throw new Error('Original cleanup state resource malformed');
        return r.instances.map((instance) => {
          const row = object5(instance),
            attributes = object5(row.attributes);
          const prefix = typeof r.module === 'string' ? `${r.module}.` : '';
          const suffix = row.index_key === undefined ? '' : `[${JSON.stringify(row.index_key)}]`;
          return { address: `${prefix}${r.type}.${r.name}${suffix}`, id: attributes.id };
        });
      });
    if (this.#cleanupEmpty) {
      if (actual.length) throw new Error('Owned cleanup resources remain');
    } else if (
      digest(raw) !== scope.state.sha256 ||
      canonical3(actual.sort((a, b) => a.address.localeCompare(b.address))) !==
        canonical3([...scope.resources].sort((a, b) => a.address.localeCompare(b.address)))
    )
      throw new Error('Original reviewed cleanup state or owned resources changed');
    await assertExecutorProcessGroupAbsent(lock);
    await scope.assertIndependentClosure();
  }
  async readStateIdentity() {
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const state = await privateRead(join2(this.#state().directory, 'terraform.tfstate'));
      const value = decode(state.toString());
      if (
        typeof value.lineage !== 'string' ||
        !value.lineage.trim() ||
        !Number.isSafeInteger(value.serial) ||
        value.serial < 0
      )
        throw new Error('Stable Terraform state identity unavailable');
      return { sha256: digest(state), lineage: value.lineage, serial: value.serial };
    });
  }
  async #archivePlanAttempt() {
    const { directory } = this.#state();
    const files = new Map();
    for (const name of ['saved.tfplan', 'plan-receipt.json']) {
      try {
        files.set(name, await privateRead(join2(directory, name)));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    if (!files.size) return;
    for (const name of ['main.tf.json', 'deployment.json', '.terraform.lock.hcl', 'deployment.tfrc'])
      files.set(name, await privateRead(join2(directory, name)));
    const inventory = JSON.stringify(Object.fromEntries([...files].map(([name, bytes]) => [name, digest(bytes)])));
    const archive = join2(directory, 'plan-history', digest(inventory));
    await privateDirectory(archive);
    files.set('inventory.json', Buffer.from(inventory));
    for (const [name, bytes] of files) {
      try {
        await writeFile2(join2(archive, name), bytes, { mode: 384, flag: 'wx' });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if (digest(await privateRead(join2(archive, name))) !== digest(bytes))
          throw new Error('Terraform plan history differs');
      }
    }
  }
  async plan(env, signal) {
    return this.#plan(env, signal);
  }
  async planDestroy(env, signal) {
    return this.#plan(env, signal, undefined, true);
  }
  async planAction(intent, env, signal) {
    intent = structuredClone(intent);
    validateActionIntent(intent);
    return this.#plan(env, signal, intent);
  }
  #inspectPlan(plan, action, destroy = false) {
    if (
      !plan ||
      typeof plan.format_version !== 'string' ||
      !/^1\.\d+$/.test(plan.format_version) ||
      plan.terraform_version !== this.#state().manifest.terraformVersion ||
      plan.errored !== false ||
      plan.complete !== true ||
      typeof plan[['apply', 'able'].join('')] !== 'boolean' ||
      !Array.isArray(plan.resource_changes ?? [])
    )
      throw new Error('Terraform plan JSON is malformed or unsupported');
    const actionInvocations = inspectActionInvocations(plan, action);
    const changes = [];
    for (const value of plan.resource_changes ?? []) {
      const resource = object5(value);
      const actions = changeActions(object5(resource.change).actions);
      if (
        typeof resource.address !== 'string' ||
        typeof resource.type !== 'string' ||
        changes.some((change) => change.address === resource.address)
      )
        throw new Error('Terraform resource change is malformed');
      changes.push({ address: resource.address, type: resource.type, actions });
    }
    const outputs = Object.values(object5(plan.output_changes ?? {})).map((output) =>
      changeActions(object5(output).actions, true),
    );
    const resourcesUnchanged =
      changes.every((change) => change.actions[0] === 'no-op') && outputs.every((actions) => actions[0] === 'no-op');
    if (action && !resourcesUnchanged)
      throw new Error('Terraform action plan contains unrelated resource or output changes');
    if (
      destroy &&
      (changes.some((change) => !['delete', 'no-op'].includes(change.actions.join(','))) ||
        outputs.some((actions) => !['delete', 'no-op'].includes(actions.join(','))))
    )
      throw new Error('Terraform destroy plan contains non-delete changes');
    const noChanges = resourcesUnchanged && actionInvocations.length === 0;
    if (!noChanges && !plan[['apply', 'able'].join('')])
      throw new Error('Terraform plan has changes but cannot be applied');
    return { changes, noChanges, actionInvocations };
  }
  async #plan(env, signal, action, destroy = false) {
    if (this.#cleanup && !destroy) throw new Error('Capture-independent cleanup permits destroy plans only');
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      await this.#preserveActionSubmission();
      if (action) await this.#assertActionUnsubmitted();
      await this.#archivePlanAttempt();
      const version = decode(await this.#run(['version', '-json'], env, signal));
      if (version.terraform_version !== this.#state().manifest.terraformVersion)
        throw new Error('Terraform version changed');
      await this.#run(['init', '-input=false', '-lockfile=readonly'], env, signal);
      await this.#verifyInputs();
      await this.#run(['validate', '-json'], env, signal);
      await this.#run(
        [
          'plan',
          '-input=false',
          '-lock=true',
          '-lock-timeout=60s',
          '-refresh=true',
          '-out=saved.tfplan',
          ...(action ? [`-invoke=${action.address}`] : []),
          ...(destroy ? ['-destroy'] : []),
        ],
        env,
        signal,
      );
      const raw = await this.#run(['show', '-json', 'saved.tfplan'], env, signal);
      const { changes, noChanges, actionInvocations } = this.#inspectPlan(decode(raw), action, destroy);
      const manifest = this.#state().manifest;
      const receipt = {
        schemaVersion: 1,
        deploymentId: manifest.deploymentId,
        engine: 'terraform',
        backendIdentity: manifest.backendIdentity,
        configurationSha256: manifest.configurationSha256,
        providerLockSha256: manifest.providerLockSha256,
        planSha256: digest(await privateRead(join2(this.#state().directory, 'saved.tfplan'))),
        changes,
        noChanges,
        ...(actionInvocations.length ? { actionInvocations } : {}),
        ...(destroy ? { operation: 'destroy' } : {}),
      };
      await persist(join2(this.#state().directory, 'plan-receipt.json'), { state: 'planned', receipt });
      return receipt;
    });
  }
  async #assertActionUnsubmitted() {
    try {
      await privateRead(join2(this.#state().directory, 'action-attempt.json'));
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    throw new Error('This stage already recorded an action submission; observe its outcome instead of replaying it');
  }
  async #preserveActionSubmission() {
    const directory = this.#state().directory;
    let journal;
    try {
      journal = decode((await privateRead(join2(directory, 'plan-receipt.json'))).toString());
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    if (!['applying', 'applied'].includes(String(journal.state))) return;
    const actions = object5(journal.receipt).actionInvocations;
    if (!Array.isArray(actions) || actions.length === 0) return;
    try {
      await privateRead(join2(directory, 'action-attempt.json'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await persist(join2(directory, 'action-attempt.json'), {
        schemaVersion: 1,
        legacyJournalState: journal.state,
        receipt: journal.receipt,
      });
    }
  }
  async readOutputs(names, env, signal) {
    names = [...names];
    if (
      !names.length ||
      new Set(names).size !== names.length ||
      names.some((name) => !/^[a-z][a-z0-9_]{0,63}$/.test(name))
    )
      throw new Error('Explicit unique Terraform output names are required');
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const { directory, manifest } = this.#state();
      const journal = decode((await privateRead(join2(directory, 'plan-receipt.json'))).toString());
      const receipt = object5(journal.receipt);
      if (
        !(journal.state === 'applied' || (journal.state === 'planned' && receipt.noChanges === true)) ||
        receipt.configurationSha256 !== manifest.configurationSha256 ||
        receipt.providerLockSha256 !== manifest.providerLockSha256
      )
        throw new Error('Terraform outputs require an applied or converged current configuration');
      const version = decode(await this.#run(['version', '-json'], env, signal));
      if (version.terraform_version !== manifest.terraformVersion) throw new Error('Terraform version changed');
      const outputs = decode(await this.#run(['output', '-json'], env, signal));
      const selected = {};
      for (const name of names) {
        const output = object5(outputs[name]);
        if (output.sensitive !== false || !Object.hasOwn(output, 'value') || !Object.hasOwn(output, 'type'))
          throw new Error('Requested Terraform output is unavailable, malformed or sensitive');
        selected[name] = output.value;
      }
      return selected;
    });
  }
  async assertApplied(receipt) {
    receipt = structuredClone(receipt);
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const { directory, manifest } = this.#state();
      const journal = decode((await privateRead(join2(directory, 'plan-receipt.json'))).toString());
      if (
        journal.state !== 'applied' ||
        canonical3(journal.receipt) !== canonical3(receipt) ||
        receipt.deploymentId !== manifest.deploymentId ||
        receipt.engine !== 'terraform' ||
        receipt.backendIdentity !== manifest.backendIdentity ||
        receipt.configurationSha256 !== manifest.configurationSha256 ||
        receipt.providerLockSha256 !== manifest.providerLockSha256 ||
        receipt.planSha256 !== digest(await privateRead(join2(directory, 'saved.tfplan')))
      )
        throw new Error('Exact applied Terraform receipt required for ownership capture');
    });
  }
  async readPlannedResourceIds(receipt, addresses, env, signal) {
    if (
      !addresses.length ||
      new Set(addresses).size !== addresses.length ||
      addresses.some((address) => !/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(address))
    )
      throw new Error('Explicit unique root resource addresses are required');
    const projected = await this.readPlannedResourceFields(
      receipt,
      Object.fromEntries(addresses.map((address) => [address, ['id']])),
      env,
      signal,
    );
    return Object.fromEntries(
      Object.entries(projected).map(([address, values]) => {
        if (values === null) return [address, null];
        if (typeof values.id !== 'string' || !values.id)
          throw new Error('Terraform resource ID is unavailable or sensitive');
        return [address, values.id];
      }),
    );
  }
  async readPlannedResourceFields(receipt, selections, env, signal) {
    validateResourceSelections(selections);
    selections = structuredClone(selections);
    receipt = structuredClone(receipt);
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const { directory, manifest } = this.#state();
      const journal = decode((await privateRead(join2(directory, 'plan-receipt.json'))).toString());
      if (
        journal.state !== 'planned' ||
        canonical3(journal.receipt) !== canonical3(receipt) ||
        receipt.configurationSha256 !== manifest.configurationSha256 ||
        receipt.planSha256 !== digest(await privateRead(join2(directory, 'saved.tfplan')))
      )
        throw new Error('Terraform identity inspection saved plan differs');
      const version = decode(await this.#run(['version', '-json'], env, signal));
      if (version.terraform_version !== manifest.terraformVersion) throw new Error('Terraform version changed');
      const plan = decode(await this.#run(['show', '-json', 'saved.tfplan'], env, signal));
      const changes = plan.resource_changes === undefined ? [] : plan.resource_changes;
      if (!Array.isArray(changes)) throw new Error('Terraform plan resource identities unavailable');
      const result = {};
      for (const [address, fields] of Object.entries(selections)) {
        const matches = changes.map(object5).filter((resource) => resource.address === address);
        if (matches.length > 1) throw new Error('Terraform resource identity is ambiguous');
        if (!matches.length) {
          result[address] = null;
          continue;
        }
        const change = object5(matches[0].change);
        if (change.before === null || change.before === undefined) {
          result[address] = null;
          continue;
        }
        const before = object5(change.before);
        const sensitivity =
          change.before_sensitive === undefined || change.before_sensitive === false
            ? {}
            : change.before_sensitive === true
              ? true
              : object5(change.before_sensitive);
        const selected = projectResourceFields(before, sensitivity, fields);
        result[address] = selected;
      }
      if (receipt.planSha256 !== digest(await privateRead(join2(directory, 'saved.tfplan'))))
        throw new Error('Terraform identity inspection saved plan changed');
      return result;
    });
  }
  async readAppliedResourceFields(receipt, selections, env, signal) {
    const { applyState: _applyState, ...projection } = await this.#readApplyStateFields(
      receipt,
      selections,
      env,
      signal,
      ['applied'],
    );
    return projection;
  }
  async readApplyAttemptResourceFields(receipt, selections, env, signal) {
    return this.#readApplyStateFields(receipt, selections, env, signal, ['applying', 'applied']);
  }
  async readNoChangeResourceFields(receipt, selections, env, signal) {
    if (
      receipt.noChanges !== true ||
      receipt.operation ||
      receipt.actionInvocations?.length ||
      receipt.changes.some((change) => change.actions.length !== 1 || change.actions[0] !== 'no-op')
    )
      throw new Error('Exact no-change Terraform receipt required for planned state inspection');
    const projection = await this.#readApplyStateFields(receipt, selections, env, signal, ['planned']);
    return { ...projection, observation: 'no-change' };
  }
  async readPlannedStateResourceFields(receipt, selections, env, signal) {
    receipt = structuredClone(receipt);
    if (
      receipt.schemaVersion !== 1 ||
      typeof receipt.noChanges !== 'boolean' ||
      !Array.isArray(receipt.changes) ||
      receipt.actionInvocations?.length ||
      (receipt.operation && receipt.operation !== 'destroy')
    )
      throw new Error('Exact resource-only planned receipt required for state inspection');
    const projection = await this.#readApplyStateFields(receipt, selections, env, signal, ['planned']);
    return { ...projection, observation: 'planned-state' };
  }
  async readCurrentResourcePlanReceipt(env, signal) {
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const { directory, manifest } = this.#state();
      const journalPath = join2(directory, 'plan-receipt.json'),
        planPath = join2(directory, 'saved.tfplan');
      const journalBytes = await privateRead(journalPath),
        planBytes = await privateRead(planPath);
      const journal = decode(journalBytes.toString()),
        stored = object5(journal.receipt);
      if (journal.state !== 'planned' || (stored.operation && stored.operation !== 'destroy'))
        throw new Error('Current resource plan is consumed or requires reconciliation');
      const version = decode(await this.#run(['version', '-json'], env, signal));
      if (version.terraform_version !== manifest.terraformVersion) throw new Error('Terraform version changed');
      const { changes, noChanges } = this.#inspectPlan(
        decode(await this.#run(['show', '-json', 'saved.tfplan'], env, signal)),
        undefined,
        stored.operation === 'destroy',
      );
      const receipt = {
        schemaVersion: 1,
        deploymentId: manifest.deploymentId,
        engine: 'terraform',
        backendIdentity: manifest.backendIdentity,
        configurationSha256: manifest.configurationSha256,
        providerLockSha256: manifest.providerLockSha256,
        planSha256: digest(planBytes),
        changes,
        noChanges,
        ...(stored.operation === 'destroy' ? { operation: 'destroy' } : {}),
      };
      if (canonical3(stored) !== canonical3(receipt))
        throw new Error('Current resource receipt differs from saved binary plan');
      const state = await this.#verifyApplyReceipt(receipt, ['planned']);
      if (
        digest(journalBytes) !== digest(await privateRead(journalPath)) ||
        digest(planBytes) !== digest(await privateRead(planPath))
      )
        throw new Error('Current receipt or binary changed during recovery');
      return { schemaVersion: 1, receipt, checkpoint: { schemaVersion: 1, planSha256: receipt.planSha256, state } };
    });
  }
  async readApplyCheckpoint(receipt) {
    receipt = structuredClone(receipt);
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const state = await this.#verifyApplyReceipt(receipt, ['planned', 'applying', 'applied']);
      return { schemaVersion: 1, planSha256: receipt.planSha256, state };
    });
  }
  async #verifyApplyReceipt(receipt, states) {
    const { directory, manifest } = this.#state();
    const journal = decode((await privateRead(join2(directory, 'plan-receipt.json'))).toString());
    const state = journal.state;
    if (
      !states.includes(state) ||
      canonical3(journal.receipt) !== canonical3(receipt) ||
      receipt.engine !== 'terraform' ||
      receipt.deploymentId !== manifest.deploymentId ||
      receipt.backendIdentity !== manifest.backendIdentity ||
      receipt.configurationSha256 !== manifest.configurationSha256 ||
      receipt.providerLockSha256 !== manifest.providerLockSha256 ||
      receipt.planSha256 !== digest(await privateRead(join2(directory, 'saved.tfplan')))
    )
      throw new Error(`Exact ${states.join('/')} Terraform receipt required for state identity inspection`);
    return state;
  }
  async #readApplyStateFields(receipt, selections, env, signal, states) {
    validateResourceSelections(selections);
    selections = structuredClone(selections);
    receipt = structuredClone(receipt);
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const { directory, manifest } = this.#state();
      const applyState = await this.#verifyApplyReceipt(receipt, states);
      const statePath = join2(directory, 'terraform.tfstate');
      const snapshot = await privateRead(statePath);
      const identity = decode(snapshot.toString());
      if (
        typeof identity.lineage !== 'string' ||
        !identity.lineage.trim() ||
        !Number.isSafeInteger(identity.serial) ||
        identity.serial < 0
      )
        throw new Error('Terraform state identity is malformed');
      const version = decode(await this.#run(['version', '-json'], env, signal));
      if (version.terraform_version !== manifest.terraformVersion) throw new Error('Terraform version changed');
      const state = decode(await this.#run(['show', '-json', 'terraform.tfstate'], env, signal));
      const minimalEmptyState =
        Object.keys(state).length === 1 &&
        state.format_version === '1.0' &&
        identity.version === 4 &&
        identity.terraform_version === manifest.terraformVersion &&
        Array.isArray(identity.resources) &&
        identity.resources.length === 0 &&
        identity.outputs !== null &&
        typeof identity.outputs === 'object' &&
        !Array.isArray(identity.outputs) &&
        Object.keys(identity.outputs).length === 0;
      if (
        state.format_version !== '1.0' ||
        (state.terraform_version !== manifest.terraformVersion && !minimalEmptyState)
      )
        throw new Error('Terraform state format or version changed');
      const module = object5(object5(state.values ?? {}).root_module ?? {});
      const resources = module.resources ?? [];
      if (!Array.isArray(resources)) throw new Error('Terraform state resource identities unavailable');
      if (
        (Array.isArray(module.child_modules) && module.child_modules.length) ||
        resources
          .map(object5)
          .some((resource) => typeof resource.address !== 'string' || !Object.hasOwn(selections, resource.address))
      )
        throw new Error('Foreign state resource requires reconciliation');
      const result = {};
      for (const [address, fields] of Object.entries(selections)) {
        const reviewed = receipt.changes.filter((change) => change.address === address);
        if (reviewed.length !== 1) throw new Error('Terraform state resource is outside the reviewed plan');
        const matches = resources.map(object5).filter((resource) => resource.address === address);
        if (matches.length > 1) throw new Error('Terraform state resource identity is ambiguous');
        if (!matches.length) {
          result[address] = null;
          continue;
        }
        const resource = matches[0];
        if (
          resource.mode !== (address.startsWith('data.') ? 'data' : 'managed') ||
          resource.type !== reviewed[0].type ||
          resource.type !== address.split('.')[address.startsWith('data.') ? 1 : 0]
        )
          throw new Error('Terraform state resource differs from reviewed identity');
        if (!Object.hasOwn(resource, 'sensitive_values')) throw new Error('Terraform state sensitivity unavailable');
        result[address] = projectResourceFields(object5(resource.values), resource.sensitive_values, fields);
      }
      if (digest(snapshot) !== digest(await privateRead(statePath)))
        throw new Error('Terraform state changed during identity inspection');
      await this.#verifyInputs();
      if ((await this.#verifyApplyReceipt(receipt, states)) !== applyState)
        throw new Error('Terraform apply checkpoint changed during inspection');
      if (receipt.planSha256 !== digest(await privateRead(join2(directory, 'saved.tfplan'))))
        throw new Error('Terraform saved plan changed during state identity inspection');
      return {
        schemaVersion: 1,
        applyState,
        planSha256: receipt.planSha256,
        stateSha256: digest(snapshot),
        lineage: identity.lineage,
        serial: identity.serial,
        resources: result,
      };
    });
  }
  async #openOriginalPlanSource(plan, receipt) {
    const { directory, manifest } = this.#state();
    if (!this.#busy || manifest.scope.cloud !== 'gcp' || receipt.actionInvocations?.length)
      throw new Error('Original GCP resource-only plan producer required');
    const inspected = this.#inspectPlan(plan, undefined, receipt.operation === 'destroy');
    if (canonical3(inspected.changes) !== canonical3(receipt.changes) || inspected.noChanges !== receipt.noChanges)
      throw new Error('Original owning resource plan inspection differs');
    const identityFields = [
      'id',
      'name',
      'project',
      'region',
      'zone',
      'namespace',
      'site_name',
      'image_id',
      'self_link',
    ];
    const resources = (plan.resource_changes === undefined ? [] : plan.resource_changes).map((input) => {
      const row = object5(input),
        change = object5(row.change);
      if (
        typeof row.address !== 'string' ||
        typeof row.type !== 'string' ||
        (row.mode !== 'managed' && row.mode !== 'data') ||
        !Array.isArray(change.actions)
      )
        throw new Error('Exact original resource plan identity required');
      const phase = receipt.operation === 'destroy' ? 'before' : 'after';
      const values = change[phase] === null || change[phase] === undefined ? {} : object5(change[phase]);
      const sensitivity = change[`${phase}_sensitive`],
        unknown = change[`${phase}_unknown`];
      if (
        unknown !== undefined &&
        typeof unknown !== 'boolean' &&
        (unknown === null || typeof unknown !== 'object' || Array.isArray(unknown))
      )
        throw new Error('Original Terraform identity unknown marker is malformed');
      const fields = {};
      for (const field of identityFields) {
        const unknownMarker =
          unknown === true ? true : unknown && typeof unknown === 'object' ? unknown[field] : undefined;
        if (unknownMarker !== undefined && typeof unknownMarker !== 'boolean')
          throw new Error('Original Terraform identity unknown marker is malformed');
        if (unknownMarker === true) {
          fields[field] = { status: 'unknown' };
        } else if (!Object.hasOwn(values, field)) {
          fields[field] = { status: 'unavailable' };
        } else {
          const value = projectResourceFields(values, sensitivity, [field])[field];
          if (
            value !== null &&
            typeof value !== 'string' &&
            typeof value !== 'boolean' &&
            !(typeof value === 'number' && Number.isSafeInteger(value))
          )
            throw new Error('Original Terraform plan identity scalar required');
          fields[field] = { status: 'known', value };
        }
      }
      return { address: row.address, type: row.type, mode: row.mode, actions: change.actions, fields };
    });
    const files = {};
    const hashes = {
      'saved.tfplan': receipt.planSha256,
      'main.tf.json': receipt.configurationSha256,
      '.terraform.lock.hcl': receipt.providerLockSha256,
      'deployment.json': digest(await privateRead(join2(directory, 'deployment.json'))),
    };
    const fileKeys = ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'];
    const parentKeys = ['dev', 'ino', 'uid', 'mode'];
    for (const [name, hash] of Object.entries(hashes)) {
      const path = join2(directory, name),
        before = await lstat3(path, { bigint: true }),
        parent = await lstat3(dirname3(path), { bigint: true });
      const raw = await privateRead(path),
        after = await lstat3(path, { bigint: true }),
        finalParent = await lstat3(dirname3(path), { bigint: true });
      if (
        digest(raw) !== hash ||
        fileKeys.some((key) => before[key] !== after[key]) ||
        parentKeys.some((key) => parent[key] !== finalParent[key])
      )
        throw new Error('Original owning plan input changed during admission');
      if (name === 'deployment.json' && canonical3(decode(raw.toString())) !== canonical3(manifest))
        throw new Error('Original owning deployment manifest changed');
      files[name] = {
        path,
        sha256: hash,
        expectedIdentity: Object.fromEntries(fileKeys.map((key) => [key, before[key].toString()])),
        expectedParentIdentity: Object.fromEntries(parentKeys.map((key) => [key, parent[key].toString()])),
      };
    }
    const monitor = await monitorOriginalInputs(files);
    const projection = freezeOriginalPlan(
      structuredClone({
        schemaVersion: 1,
        kind: 'original-terraform-resource-plan',
        directory,
        scope: manifest.scope,
        terraformVersion: manifest.terraformVersion,
        receipt,
        resources,
        executionAuthorized: false,
      }),
    );
    const source = Object.freeze({
      schemaVersion: 1,
      kind: 'original-terraform-plan-source',
      directory,
      planSha256: receipt.planSha256,
    });
    const lease = { projection, assertOriginal: monitor.assertOriginal, active: true };
    originalPlanSources.set(source, lease);
    originalPlanProjections.set(projection, lease);
    return {
      source,
      assertOriginal: monitor.assertOriginal,
      close: () => {
        lease.active = false;
        monitor.close();
      },
    };
  }
  async apply(receipt, env, signal) {
    receipt = structuredClone(receipt);
    if (this.#cleanup?.verification) throw new Error('Capture cleanup verification cannot submit an apply');
    if (
      this.#cleanup &&
      (receipt.operation !== 'destroy' ||
        receipt.actionInvocations?.length ||
        receipt.changes.some(
          (change) =>
            !this.#cleanup?.resources.some((resource) => resource.address === change.address) ||
            JSON.stringify(change.actions) !== '["delete"]',
        ))
    )
      throw new Error('Capture-independent cleanup cannot apply creates, unrelated objects or provider actions');
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const journal = decode((await privateRead(join2(this.#state().directory, 'plan-receipt.json'))).toString());
      if (journal.state !== 'planned') throw new Error('Saved plan is consumed or requires reconciliation');
      if (
        canonical3(receipt) !== canonical3(journal.receipt) ||
        receipt.engine !== 'terraform' ||
        receipt.deploymentId !== this.#state().manifest.deploymentId ||
        receipt.configurationSha256 !== this.#state().manifest.configurationSha256 ||
        receipt.providerLockSha256 !== this.#state().manifest.providerLockSha256 ||
        receipt.planSha256 !== digest(await privateRead(join2(this.#state().directory, 'saved.tfplan')))
      )
        throw new Error('Terraform saved-plan receipt does not match');
      const version = decode(await this.#run(['version', '-json'], env, signal));
      if (version.terraform_version !== this.#state().manifest.terraformVersion)
        throw new Error('Terraform version changed');
      const expectedActions = receipt.actionInvocations ?? [];
      if (!Array.isArray(expectedActions) || expectedActions.length > 1)
        throw new Error('Saved action receipt is malformed');
      if (expectedActions.length) validateActionIntent(expectedActions[0]);
      const plan = decode(await this.#run(['show', '-json', 'saved.tfplan'], env, signal));
      inspectActionInvocations(plan, expectedActions[0]);
      if (receipt.planSha256 !== digest(await privateRead(join2(this.#state().directory, 'saved.tfplan'))))
        throw new Error('Terraform saved plan changed during action inspection');
      if (expectedActions.length) {
        await this.#assertActionUnsubmitted();
        await persist(join2(this.#state().directory, 'action-attempt.json'), {
          schemaVersion: 1,
          submittedAt: new Date().toISOString(),
          receipt,
        });
      }
      const originalSource =
        this.#planSource && this.#state().manifest.scope.cloud === 'gcp' && !expectedActions.length
          ? await this.#openOriginalPlanSource(plan, receipt)
          : undefined;
      try {
        await originalSource?.assertOriginal();
        await persist(join2(this.#state().directory, 'plan-receipt.json'), { state: 'applying', receipt });
        await this.#run(
          ['apply', '-input=false', '-lock=true', '-lock-timeout=60s', 'saved.tfplan'],
          env,
          signal,
          originalSource?.source,
        );
        await originalSource?.assertOriginal();
      } finally {
        originalSource?.close();
      }
      await persist(join2(this.#state().directory, 'plan-receipt.json'), { state: 'applied', receipt });
      if (this.#cleanup) {
        this.#cleanupEmpty = true;
        await this.#verifyCaptureCleanup();
      }
    });
  }
}

// plugins/terraform/src/installed-capture-context.ts
var fileKeys = ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'];
var parentKeys2 = ['dev', 'ino', 'uid', 'mode'];
var controls = (value) =>
  Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
function canonical4(path) {
  return typeof path === 'string' && isAbsolute3(path) && resolve3(path) === path && !controls(path);
}
function freezeAdmittedCaptureInputs(input) {
  if (!input || typeof input !== 'object' || !Object.keys(input).length)
    throw new Error('Original admitted capture inputs required');
  const paths = new Set();
  const output = {};
  for (const name of Object.keys(input).sort()) {
    const binding = input[name];
    if (
      !binding ||
      !canonical4(binding.path) ||
      !/^[a-f0-9]{64}$/.test(binding.sha256) ||
      paths.has(binding.path) ||
      !binding.expectedIdentity ||
      !binding.expectedParentIdentity ||
      fileKeys.some(
        (key) =>
          typeof binding.expectedIdentity?.[key] !== 'string' ||
          !/^(?:0|[1-9][0-9]*)$/.test(binding.expectedIdentity[key]),
      ) ||
      parentKeys2.some(
        (key) =>
          typeof binding.expectedParentIdentity?.[key] !== 'string' ||
          !/^(?:0|[1-9][0-9]*)$/.test(binding.expectedParentIdentity[key]),
      )
    )
      throw new Error('Exact admitted capture file and parent identities required');
    paths.add(binding.path);
    output[name] = Object.freeze({
      path: binding.path,
      sha256: binding.sha256,
      expectedIdentity: Object.freeze({ ...binding.expectedIdentity }),
      expectedParentIdentity: Object.freeze({ ...binding.expectedParentIdentity }),
    });
  }
  return Object.freeze(output);
}
function createInstalledCaptureContext(admission) {
  if (
    admission?.owner?.provider !== 'gcp' ||
    admission.owner.engine !== 'terraform' ||
    !canonical4(admission.executionDirectory) ||
    !Number.isSafeInteger(admission.budget?.start) ||
    admission.budget.start < 0 ||
    !Number.isSafeInteger(admission.budget.deadline) ||
    admission.budget.deadline - admission.budget.start !== 7200000 ||
    typeof admission.assertInputs !== 'function' ||
    typeof admission.assertWithinDeadline !== 'function' ||
    typeof admission.readProviderInputs !== 'function' ||
    (admission.readOriginalPlanSource !== undefined && typeof admission.readOriginalPlanSource !== 'function')
  )
    throw new Error('Trusted original GCP capture admission required');
  const inputs = freezeAdmittedCaptureInputs(admission.inputs);
  const environment = Object.freeze({ ...admission.environment });
  const authentication = Object.freeze({ ...admission.authentication });
  if (
    ['accountSha256', 'audienceSha256', 'snapshotSha256'].some(
      (key) => !/^[a-f0-9]{64}$/.test(authentication[key] ?? ''),
    ) ||
    authentication.snapshotSha256 !== inputs.adc?.sha256
  )
    throw new Error('Original authenticated principal and admitted ADC snapshot required');
  if (
    !inputs.adc ||
    !inputs.platform ||
    environment.GOOGLE_APPLICATION_CREDENTIALS !== inputs.adc.path ||
    typeof environment.XCSH_API_TOKEN !== 'string' ||
    !environment.XCSH_API_TOKEN ||
    controls(environment.XCSH_API_TOKEN)
  )
    throw new Error('Original capture credential bindings required');
  const url = new URL(environment.XCSH_API_URL);
  if (url.protocol !== 'https:' || url.origin !== environment.XCSH_API_URL)
    throw new Error('Original capture Platform origin required');
  const { assertInputs, assertWithinDeadline, readProviderInputs: readProviders } = admission;
  const readPlanSource = admission.readOriginalPlanSource;
  let planSourceRefused = false;
  let originalPlanProjection;
  const originalPlanOwner = Object.freeze(structuredClone(admission.owner));
  const originalPlanDirectory = admission.executionDirectory;
  let originalProviders;
  return Object.freeze({
    schemaVersion: 2,
    kind: 'original-installed-gcp-capture-context',
    ...(readPlanSource
      ? {
          async readOriginalPlanSource() {
            if (planSourceRefused) throw new Error('Original owning plan capture handoff remains refused');
            try {
              await assertWithinDeadline();
              await assertInputs();
              const source = await readPlanSource();
              await assertOriginalTerraformPlanProjection(source);
              if (originalPlanProjection && originalPlanProjection !== source)
                throw new Error('Original owning plan capture view changed');
              if (
                source.executionAuthorized !== false ||
                source.directory !== originalPlanDirectory ||
                source.scope.cloud !== 'gcp' ||
                source.scope.account !== originalPlanOwner.account ||
                source.scope.region !== originalPlanOwner.region ||
                source.receipt.engine !== 'terraform' ||
                source.receipt.deploymentId !== originalPlanOwner.deploymentId
              )
                throw new Error('Original installed capture owning plan scope differs');
              await assertWithinDeadline();
              await assertInputs();
              await assertOriginalTerraformPlanProjection(source);
              originalPlanProjection ??= source;
              return source;
            } catch (error) {
              planSourceRefused = true;
              throw error;
            }
          },
        }
      : {}),
    owner: Object.freeze(structuredClone(admission.owner)),
    executionDirectory: admission.executionDirectory,
    budget: Object.freeze({ ...admission.budget }),
    environment,
    authentication,
    inputs,
    assertInputs,
    assertWithinDeadline,
    async readProviderInputs() {
      await assertInputs();
      const current = freezeAdmittedCaptureInputs(await readProviders());
      await assertInputs();
      if (originalProviders && JSON.stringify(current) !== JSON.stringify(originalProviders))
        throw new Error('Original capture provider admission changed');
      originalProviders ??= current;
      return originalProviders;
    },
  });
}

// plugins/terraform/src/installed-runtime.ts
// plugins/gcloud/src/ce/discovery.ts
import { createHash as createHash6, createHash as createHash13, randomUUID as randomUUID6 } from 'node:crypto';
import { constants as constants6 } from 'node:fs';
import {
  lstat as lstat10,
  mkdir as mkdir5,
  open as open6,
  readdir as readdir3,
  readFile as readFile7,
  realpath as realpath9,
  writeFile as writeFile5,
} from 'node:fs/promises';
import { homedir as homedir2 } from 'node:os';
import { dirname as dirname10, isAbsolute as isAbsolute11, join as join11, resolve as resolve11 } from 'node:path';

// plugins/gcloud/src/ce/site-access.ts
var GCP_SITE_ACCESS_MAPPING = Object.freeze({
  schemaVersion: 1,
  provider: 'f5-sales-demo/xcsh',
  version: '15.13.0',
  credentials: 'admin_user_credentials.ssh_key',
  blockedServices: 'blocked_services.blocked_service',
  sshNetwork: 'VIRTUAL_NETWORK_SITE_LOCAL_INSIDE',
  user: 'admin',
});
var _GCP_CURRENT_SITE_ACCESS_MAPPING = Object.freeze({
  ...GCP_SITE_ACCESS_MAPPING,
  version: '15.15.7',
  sourceSchemaSha256: 'f5f3daf876eb3489054cab23d68af266265ec7b1b6ec84d52117283ae70ed6e6',
});
var _GCP_XCSH15162_SITE_ACCESS_MAPPING = Object.freeze({
  ...GCP_SITE_ACCESS_MAPPING,
  version: '15.16.2',
  sourceSchemaSha256: 'b09164cac44b715bf40fb5d26afc65b02c6d181cfb516ae54cf5b3e6c647af25',
});

// plugins/gcloud/src/ce/observer-scope.ts
var _GCP_TERRAFORM_OBSERVER_IMAGE = Object.freeze({
  project: 'ubuntu-os-cloud',
  name: 'ubuntu-2404-noble-amd64-v20261021',
  id: '4996011480491275419',
});

// plugins/gcloud/src/ce/discovery.ts
function fingerprint(value) {
  const stable = (item) =>
    Array.isArray(item)
      ? item.map(stable)
      : item && typeof item === 'object'
        ? Object.fromEntries(
            Object.entries(item)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, stable(v)]),
          )
        : item;
  return `sha256:${createHash6('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex')}`;
}

// plugins/terraform/src/google-adc-authentication.ts
import { createHash as createHash7 } from 'node:crypto';

// plugins/terraform/src/gcp-observer-image-pin.ts
var _GCP_OBSERVER_IMAGE_PIN = Object.freeze({
  project: 'ubuntu-os-cloud',
  name: 'ubuntu-2404-noble-amd64-v20261021',
  id: '4996011480491275419',
  architecture: 'X86_64',
  status: 'READY',
  selfLink:
    'https://www.googleapis.com/compute/v1/projects/ubuntu-os-cloud/global/images/ubuntu-2404-noble-amd64-v20261021',
});

// plugins/terraform/src/google-adc-authentication.ts
var tokenEndpoint = 'https://oauth2.googleapis.com/token';
var inspectionEndpoint = 'https://www.googleapis.com/oauth2/v2/tokeninfo';
var hash5 = (value) => createHash7('sha256').update(value).digest('hex');
var validHash = (value) => /^[a-f0-9]{64}$/.test(value);
var maximum2 = 65536;

class GoogleAdcAuthenticationHttpError extends Error {
  status;
  constructor(status) {
    super('Google ADC authentication HTTP request failed');
    this.status = status;
  }
}
function decode2(raw) {
  return decodeEvidenceObject(raw);
}
async function authenticateGoogleAdcSession(input, signal, fetcher = fetch) {
  const credentialBytes = Buffer.from(input.credentialBytes);
  const { project, accountSha256, audienceSha256, assertOriginal } = input;
  if (
    !credentialBytes.length ||
    credentialBytes.length > maximum2 ||
    !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project) ||
    !validHash(accountSha256) ||
    !validHash(audienceSha256) ||
    typeof assertOriginal !== 'function'
  )
    throw new Error('Qualified Google ADC credential mapping required');
  let credential;
  try {
    credential = decode2(credentialBytes);
  } catch {
    throw new Error('Qualified Google ADC credential mapping required');
  }
  if (
    credential.type !== 'authorized_user' ||
    ['client_id', 'client_secret', 'refresh_token'].some(
      (key) =>
        typeof credential[key] !== 'string' ||
        !credential[key] ||
        [...credential[key]].some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127),
    ) ||
    hash5(credential.client_id) !== audienceSha256 ||
    (credential.quota_project_id !== undefined && credential.quota_project_id !== project) ||
    (credential.token_uri !== undefined && credential.token_uri !== tokenEndpoint) ||
    (credential.universe_domain !== undefined && credential.universe_domain !== 'googleapis.com') ||
    (credential.account !== undefined &&
      credential.account !== '' &&
      (typeof credential.account !== 'string' || hash5(credential.account) !== accountSha256))
  )
    throw new Error('Qualified Google ADC credential mapping required');
  const guard = async () => {
    signal?.throwIfAborted();
    try {
      await assertOriginal();
    } catch {
      throw new Error('Original Google ADC authentication inputs changed');
    }
  };
  const read = async (url, options) => {
    await guard();
    let value;
    let failure;
    try {
      const bounded = signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000);
      const response = await fetcher(url, { ...options, redirect: 'error', signal: bounded });
      if (!response.ok) throw new GoogleAdcAuthenticationHttpError(response.status);
      if (!response.body) throw new Error('Google ADC authentication response is malformed');
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        for (;;) {
          bounded.throwIfAborted();
          const { value: chunk, done } = await reader.read();
          if (done) break;
          size += chunk.length;
          if (size > maximum2) throw new Error('Google ADC authentication response exceeds bound');
          chunks.push(chunk);
        }
      } finally {
        await reader.cancel().catch(() => {
          return;
        });
        reader.releaseLock();
      }
      value = decode2(Buffer.concat(chunks));
    } catch (error) {
      failure =
        error instanceof GoogleAdcAuthenticationHttpError
          ? error
          : new Error('Google ADC authentication transport failed');
    }
    try {
      await guard();
    } catch (originalFailure) {
      if (failure)
        throw new AggregateError(
          [failure, originalFailure],
          'Original Google ADC request and input verification failed',
        );
      throw originalFailure;
    }
    if (failure) throw failure;
    if (!value) throw new Error('Google ADC authentication response is malformed');
    return value;
  };
  const began = Date.now();
  const refresh = await read(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: credential.client_id,
      client_secret: credential.client_secret,
      refresh_token: credential.refresh_token,
    }).toString(),
  });
  if (
    typeof refresh.access_token !== 'string' ||
    !refresh.access_token ||
    /\s/.test(refresh.access_token) ||
    refresh.token_type !== 'Bearer' ||
    !Number.isSafeInteger(refresh.expires_in) ||
    refresh.expires_in <= 360 ||
    refresh.expires_in > 3600
  )
    throw new Error('Qualified Google ADC refresh response required');
  const inspectionBegan = Date.now();
  const info = await read(
    `${inspectionEndpoint}?${new URLSearchParams({ access_token: refresh.access_token }).toString()}`,
    {
      method: 'POST',
      headers: { Accept: 'application/json' },
    },
  );
  if (
    typeof info.email !== 'string' ||
    hash5(info.email) !== accountSha256 ||
    info.verified_email !== true ||
    typeof info.audience !== 'string' ||
    hash5(info.audience) !== audienceSha256 ||
    info.issued_to !== info.audience ||
    typeof info.scope !== 'string' ||
    !info.scope.split(' ').includes('https://www.googleapis.com/auth/cloud-platform') ||
    !Number.isSafeInteger(info.expires_in) ||
    info.expires_in <= 360 ||
    info.expires_in > 3600
  )
    throw new Error('Google ADC principal, scope, audience or lifetime differs');
  const projectData = await read(
    `https://cloudresourcemanager.googleapis.com/v1/projects/${encodeURIComponent(project)}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${refresh.access_token}` },
    },
  );
  if (projectData.projectId !== project || projectData.lifecycleState !== 'ACTIVE')
    throw new Error('Google ADC selected project identity or access differs');
  const verifiedAt = Date.now();
  const expiresNoEarlierThan = Math.min(began + refresh.expires_in * 1000, inspectionBegan + info.expires_in * 1000);
  if (expiresNoEarlierThan - verifiedAt <= 360000 || verifiedAt - began >= 300000)
    throw new Error('Google ADC principal, scope, audience or lifetime differs');
  const receipt = {
    schemaVersion: 1,
    kind: 'authenticated-google-adc-snapshot',
    project,
    snapshotSha256: hash5(credentialBytes),
    accountSha256,
    audienceSha256,
    verifiedAt,
    expiresNoEarlierThan,
    executionAuthorized: false,
  };
  return {
    receipt: Object.freeze({ ...receipt, authenticationReceiptSha256: hash5(JSON.stringify(receipt)) }),
    accessToken: refresh.access_token,
  };
}
async function authenticateGoogleAdc(input, signal, fetcher = fetch) {
  return (await authenticateGoogleAdcSession(input, signal, fetcher)).receipt;
}
var _computeMaximum = 4 * 1024 * 1024;

// plugins/terraform/src/linux-clock.ts
import { dlopen, FFIType, ptr } from 'bun:ffi';
// plugins/terraform/src/installed-apply-controller.ts
import { randomUUID as randomUUID3 } from 'node:crypto';

var sample;
function linuxMonotonicMs() {
  if (process.platform !== 'linux') throw new Error('Original Linux monotonic clock is unavailable');
  if (!sample) {
    const libc = dlopen('libc.so.6', {
      clock_gettime: { args: [FFIType.i32, FFIType.ptr], returns: FFIType.i32 },
    });
    const value = new BigInt64Array(2);
    sample = () => {
      if (libc.symbols.clock_gettime(1, ptr(value)) !== 0 || value[0] < 0n || value[1] < 0n || value[1] >= 1000000000n)
        throw new Error('Original Linux monotonic clock capture failed');
      const result = value[0] * 1000n + value[1] / 1000000n;
      if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Original monotonic clock exceeds safe bound');
      return Number(result);
    };
  }
  return sample();
}

// plugins/terraform/src/reader-final-reserve.ts
var admissions = new WeakMap();
var windowKeys = ['originalStartMs', 'originalDeadlineMs', 'finalStartedMs', 'finalDeadlineMs'];
var originalWindows = new Map();
function withinWindow(snapshot, clock) {
  const current = clock();
  if (current < snapshot.finalStartedMs || current >= snapshot.finalDeadlineMs)
    throw new Error('Original final reader reserve is exhausted or has not started');
}
function admitFinalReaderReserve(input, options = {}) {
  const clock = options.clock ?? linuxMonotonicMs;
  if (
    !input ||
    typeof input.assertOriginal !== 'function' ||
    !input.identity ||
    !Number.isSafeInteger(input.identity.pid) ||
    input.identity.pid <= 0 ||
    input.identity.group !== input.identity.pid ||
    typeof input.identity.start !== 'string' ||
    !/^[0-9]+$/.test(input.identity.start) ||
    typeof input.identity.boot !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input.identity.boot) ||
    ![input.originalStartMs, input.originalDeadlineMs, input.finalStartedMs, input.finalDeadlineMs].every(
      Number.isSafeInteger,
    ) ||
    input.originalStartMs < 0 ||
    input.originalDeadlineMs - input.originalStartMs !== 7200000 ||
    input.finalStartedMs < input.originalStartMs ||
    input.finalDeadlineMs - input.finalStartedMs !== 300000
  )
    throw new Error('Trusted original fixed operation and final reader budgets required');
  const snapshot = Object.freeze({
    schemaVersion: 1,
    kind: 'original-final-reader-reserve',
    identity: Object.freeze({ ...input.identity }),
    originalStartMs: input.originalStartMs,
    originalDeadlineMs: input.originalDeadlineMs,
    finalStartedMs: input.finalStartedMs,
    finalDeadlineMs: input.finalDeadlineMs,
  });
  withinWindow(snapshot, clock);
  const key = `${snapshot.identity.boot}:${snapshot.identity.pid}:${snapshot.identity.start}`;
  const original = originalWindows.get(key);
  if (original && windowKeys.some((field) => original[field] !== snapshot[field]))
    throw new Error('Original final reader window cannot be renewed');
  if (!original)
    originalWindows.set(
      key,
      Object.freeze({
        originalStartMs: snapshot.originalStartMs,
        originalDeadlineMs: snapshot.originalDeadlineMs,
        finalStartedMs: snapshot.finalStartedMs,
        finalDeadlineMs: snapshot.finalDeadlineMs,
      }),
    );
  admissions.set(snapshot, { snapshot, clock, assertOriginal: input.assertOriginal });
  return snapshot;
}
function inspectFinalReaderReserve(reserve) {
  const admission = admissions.get(reserve);
  if (!admission) throw new Error('An admitted original final reader reserve is required');
  return admission.snapshot;
}
async function assertFinalReaderReserve(reserve) {
  const snapshot = inspectFinalReaderReserve(reserve);
  const admission = admissions.get(reserve);
  if (!admission) throw new Error('An admitted original final reader reserve is required');
  withinWindow(snapshot, admission.clock);
  await admission.assertOriginal();
  withinWindow(snapshot, admission.clock);
}

// plugins/terraform/src/installed-apply-controller.ts
var callbacks = new WeakMap();
async function assertOriginalApplyCallback(value) {
  const verify = callbacks.get(value);
  if (!verify) throw new Error('Original apply callback context required');
  await verify();
}
var sameIdentity = (left, right) => ['pid', 'group', 'start', 'boot'].every((key) => left[key] === right[key]);
function createInstalledApplyController(original, worker, hooks) {
  const now = hooks.clock ?? linuxMonotonicMs,
    persist = hooks.persist;
  const methods = {
    prepare: worker.prepare?.bind(worker),
    start: worker.start.bind(worker),
    assertOriginal: worker.assertOriginal.bind(worker),
    finalCapture: worker.finalCapture.bind(worker),
    close: worker.closeAfterExecutorExit.bind(worker),
  };
  const nonce = randomUUID3();
  let sequence = 0,
    prepared = false,
    started,
    finalStarted = false,
    groupClosed = false,
    closed = false;
  let preparation;
  const within = async () => {
    await original.assertInputs();
    if (now() < original.budget.start || now() >= original.budget.deadline)
      throw new Error('Original apply operation budget exhausted');
    await original.assertWithinDeadline();
  };
  const record = async (phase, extra = {}) =>
    persist({
      schemaVersion: 1,
      kind: 'original-installed-apply-controller-event',
      nonce,
      sequence: ++sequence,
      phase,
      observedMs: now(),
      owner: original.owner,
      authentication: original.authentication,
      budget: original.budget,
      executionIdentity: started?.identity,
      ...extra,
      executionQualified: false,
    });
  const refuse = async (phase, error) => {
    try {
      await record(phase, { errorType: error instanceof Error ? error.name : typeof error });
    } catch (retention) {
      throw new AggregateError([error, retention], 'Original apply failure and retention failed');
    }
    throw error;
  };
  const callback = (phase, execution, reserve) => {
    const verify = async () => {
      if (closed || !started || !sameIdentity(execution.identity, started.identity))
        throw new Error('Original apply callback identity or lifecycle changed');
      if (phase === 'before') {
        if (finalStarted) throw new Error('Original before callback retired');
        await within();
        if (now() >= execution.startupDeadlineMs) throw new Error('Original apply startup deadline elapsed');
      } else {
        if (!finalStarted || !reserve) throw new Error('Original final callback reserve required');
        await original.assertInputs();
        await assertFinalReaderReserve(reserve);
        await original.assertInputs();
      }
    };
    const value = {
      schemaVersion: 1,
      kind: 'original-installed-apply-callback',
      phase,
      nonce,
      execution,
      reserve,
      async assertOriginal() {
        await assertOriginalApplyCallback(this);
      },
    };
    Object.defineProperty(value, 'original', { value: original, enumerable: false });
    Object.freeze(value);
    callbacks.set(value, verify);
    return value;
  };
  return {
    async prepare() {
      if (closed || started || finalStarted) throw new Error('Original apply preparation retired');
      preparation ??= (async () => {
        try {
          await within();
          await record('prepare-start');
          await methods.prepare?.(original);
          await within();
          await record('prepared');
          prepared = true;
        } catch (error) {
          await refuse('prepare-failed', error);
        }
      })();
      await preparation;
    },
    async start(admission) {
      if (!prepared) throw new Error('Original apply controller must be prepared before release');
      if (started || closed || finalStarted) throw new Error('Original apply execution already claimed');
      if (admission.directory !== original.executionDirectory) throw new Error('Original apply workspace differs');
      if (
        admission.args[0] !== 'apply' ||
        admission.originalStartMs !== original.budget.start ||
        admission.originalDeadlineMs !== original.budget.deadline
      )
        throw new Error('Original apply invocation or budget differs');
      if (
        !Number.isSafeInteger(admission.identity.pid) ||
        admission.identity.pid <= 0 ||
        admission.identity.group !== admission.identity.pid ||
        !/^[0-9]+$/.test(admission.identity.start) ||
        !/^[a-f0-9-]{36}$/.test(admission.identity.boot)
      )
        throw new Error('Original apply execution identity required');
      await within();
      if (now() >= admission.startupDeadlineMs) throw new Error('Original apply startup deadline elapsed');
      started = Object.freeze({
        ...admission,
        identity: Object.freeze({ ...admission.identity }),
        args: Object.freeze([...admission.args]),
      });
      await record('before-start');
      const bound = callback('before', started);
      await assertOriginalApplyCallback(bound);
      await methods.start(started, bound);
      await assertOriginalApplyCallback(bound);
      await record('before-complete');
    },
    async assertOriginal() {
      if (closed) throw new Error('Original apply controller closed');
      await within();
      if (prepared) await methods.assertOriginal();
    },
    async finalCapture(finished, reserve) {
      if (
        !started ||
        !finished.identity ||
        !sameIdentity(started.identity, finished.identity) ||
        finished.pid !== started.identity.pid
      )
        throw new Error('Original apply final identity differs');
      if (finalStarted) throw new Error('Original apply final capture already claimed');
      if (finished.originalDeadlineMs !== original.budget.deadline)
        throw new Error('Original apply final budget differs');
      if (!reserve) throw new Error('Original apply final reserve required');
      {
        const snapshot = inspectFinalReaderReserve(reserve);
        if (
          !sameIdentity(snapshot.identity, started.identity) ||
          snapshot.originalStartMs !== original.budget.start ||
          snapshot.originalDeadlineMs !== original.budget.deadline ||
          snapshot.finalStartedMs !== finished.finalStartedMs ||
          snapshot.finalDeadlineMs !== finished.finalDeadlineMs
        )
          throw new Error('Original apply final reserve differs');
      }
      finalStarted = true;
      groupClosed = finished.originalGroupClosed;
      const failures = [];
      const attempt = async (fn) => {
        try {
          await fn();
          return true;
        } catch (error) {
          failures.push(error);
          return false;
        }
      };
      await attempt(() =>
        record('final-start', {
          finalStartedMs: finished.finalStartedMs,
          finalDeadlineMs: finished.finalDeadlineMs,
          originalGroupClosed: groupClosed,
        }),
      );
      const bound = callback('after', started, reserve);
      const authorized = await attempt(() => assertOriginalApplyCallback(bound));
      if (authorized) {
        await attempt(() => methods.finalCapture(finished, reserve, bound));
        await attempt(() => assertOriginalApplyCallback(bound));
      }
      if (!failures.length) await attempt(() => record('final-complete'));
      else
        await attempt(() =>
          record('final-failed', {
            failureTypes: failures.map((error) => (error instanceof Error ? error.name : typeof error)),
          }),
        );
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1)
        throw new AggregateError(failures, 'Original apply final capture and retention incomplete');
    },
    async closeAfterExecutorExit() {
      if (closed) return;
      if (started && (!finalStarted || !groupClosed)) throw new Error('Original apply executor closure required');
      await original.assertInputs();
      await methods.close();
      await record('closed');
      closed = true;
    },
  };
}

// plugins/terraform/src/installed-capture-input-checks.ts
function createInstalledCaptureInputChecks(admission) {
  if (
    typeof admission?.verifyStore !== 'function' ||
    typeof admission.monitors !== 'function' ||
    typeof admission.clock !== 'function' ||
    !Number.isSafeInteger(admission.budget?.start) ||
    admission.budget.start < 0 ||
    !Number.isSafeInteger(admission.budget.deadline) ||
    admission.budget.deadline - admission.budget.start !== 7200000
  )
    throw new Error('Original admitted capture input checks and budget required');
  const { verifyStore, monitors: readMonitors, clock } = admission;
  const budget = Object.freeze({ ...admission.budget });
  const within = () => {
    const now = clock();
    if (!Number.isSafeInteger(now) || now < budget.start || now >= budget.deadline)
      throw new Error('Original installed operation budget exhausted');
  };
  const inspect = async (full) => {
    await verifyStore();
    const monitors = [...readMonitors()];
    if (
      !monitors.length ||
      new Set(monitors).size !== monitors.length ||
      monitors.some(
        (monitor) =>
          typeof monitor?.assertOriginal !== 'function' || typeof monitor.assertOriginalIdentity !== 'function',
      )
    )
      throw new Error('Original admitted input monitors required');
    for (const monitor of monitors) {
      if (full) await monitor.assertOriginal();
      else await monitor.assertOriginalIdentity();
    }
  };
  return Object.freeze({
    assertInputs: () => inspect(true),
    assertCaptureInputs: () => inspect(false),
    async assertWithinDeadline() {
      within();
      await inspect(true);
      within();
    },
    async assertCaptureWithinDeadline() {
      within();
      await inspect(false);
      within();
    },
  });
}

// plugins/terraform/src/installed-final-capture.ts
import { isAbsolute as isAbsolute4, join as join3, resolve as resolve4 } from 'node:path';

function key(identity) {
  if (
    !identity ||
    !Number.isSafeInteger(identity.pid) ||
    identity.pid <= 0 ||
    identity.group !== identity.pid ||
    !/^[0-9]+$/.test(identity.start) ||
    !/^[a-f0-9-]{36}$/.test(identity.boot)
  )
    throw new Error('Original installed capture execution identity required');
  return `${identity.boot}:${identity.pid}:${identity.start}`;
}

class InstalledCaptureInvocations {
  records = new Map();
  admit(input) {
    const identityKey = key(input.identity);
    if (this.records.has(identityKey)) throw new Error('Original installed capture already admitted');
    if (
      input.budget &&
      (!Number.isSafeInteger(input.budget.start) ||
        input.budget.start < 0 ||
        !Number.isSafeInteger(input.budget.deadline) ||
        input.budget.deadline - input.budget.start !== 7200000)
    )
      throw new Error('Original installed capture operation budget required');
    if (!isAbsolute4(input.groupDirectory) || resolve4(input.groupDirectory) !== input.groupDirectory)
      throw new Error('Original installed capture directory required');
    const groupInputs = freezeAdmittedCaptureInputs(input.groupInputs);
    if (
      Object.keys(groupInputs).sort().join(',') !== 'claim,lifetime' ||
      groupInputs.claim.path !== join3(input.groupDirectory, 'claim.json') ||
      groupInputs.lifetime.path !== join3(input.groupDirectory, 'lifetime.json')
    )
      throw new Error('Original installed capture group inputs required');
    const record = Object.freeze({
      identity: Object.freeze({ ...input.identity }),
      ...(input.budget ? { budget: Object.freeze({ ...input.budget }) } : {}),
      groupDirectory: input.groupDirectory,
      groupInputs,
      capture: input.capture,
    });
    this.records.set(identityKey, record);
    return record;
  }
  find(finished) {
    if (!finished.identity || finished.pid !== finished.identity.pid)
      throw new Error('Original final capture identity unavailable');
    const record = this.records.get(key(finished.identity));
    if (!record) throw new Error('Original final capture invocation unavailable');
    return record;
  }
}
async function finalizeInstalledCapture(invocations, finished, hooks) {
  const failures = [];
  const attempt = async (operation) => {
    try {
      await operation();
    } catch (error) {
      failures.push(error);
    }
  };
  await attempt(() => hooks.persist(finished));
  let record;
  try {
    record = invocations.find(finished);
  } catch (error) {
    failures.push(error);
  }
  if (record) {
    const original = record;
    await attempt(() => hooks.verify(original));
    const capture = original.capture;
    if (capture) {
      let reserve;
      if (original.budget)
        await attempt(async () => {
          if (finished.originalDeadlineMs !== original.budget?.deadline)
            throw new Error('Original final capture operation budget changed');
          const { verify, assertInputs } = hooks;
          reserve = admitFinalReaderReserve({
            identity: original.identity,
            originalStartMs: original.budget.start,
            originalDeadlineMs: original.budget.deadline,
            finalStartedMs: finished.finalStartedMs,
            finalDeadlineMs: finished.finalDeadlineMs,
            assertOriginal: async () => {
              await verify(original);
              await assertInputs();
              await verify(original);
            },
          });
        });
      await attempt(() => capture.finalCapture(finished, reserve));
    }
  }
  await attempt(hooks.assertInputs);
  if (record) {
    const original = record;
    await attempt(() => hooks.verify(original));
  }
  if (failures.length) throw new AggregateError(failures, 'Original installed final capture is incomplete');
}

// plugins/terraform/src/google-adc-session.ts
import { createHash as createHash8 } from 'node:crypto';
import { constants as constants2, watch as watch2 } from 'node:fs';
import { lstat as lstat4, open as open2, realpath as realpath3 } from 'node:fs/promises';
// plugins/terraform/src/installed-gcp-invocation.ts
import {
  dirname as dirname4,
  isAbsolute as isAbsolute5,
  isAbsolute as isAbsolute7,
  join as join5,
  resolve as resolve5,
  resolve as resolve7,
} from 'node:path';

var googleCredentialAlternatives = Object.freeze([
  'GOOGLE_OAUTH_ACCESS_TOKEN',
  'GOOGLE_ACCESS_TOKEN',
  'GOOGLE_CREDENTIALS',
  'GOOGLE_IMPERSONATE_SERVICE_ACCOUNT',
  'GOOGLE_IMPERSONATE_SERVICE_ACCOUNT_DELEGATES',
  'GCLOUD_KEYFILE_JSON',
  'GOOGLE_CLOUD_KEYFILE_JSON',
]);
var hash6 = (value) => createHash8('sha256').update(value).digest('hex');
var validHash2 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
var sameOwner = (a, b) =>
  a?.engine === 'terraform' &&
  a.provider === 'gcp' &&
  b?.engine === a.engine &&
  b.provider === a.provider &&
  a.deploymentId === b.deploymentId &&
  a.account === b.account &&
  a.region === b.region;
async function fileMetadata(path) {
  const stat = await lstat4(path, { bigint: true });
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.uid !== BigInt(process.getuid?.() ?? -1) ||
    stat.nlink !== 1n ||
    (stat.mode & 0o777n) !== 0o400n ||
    stat.size < 1n ||
    stat.size > 65536n
  )
    throw new Error('Immutable private Google ADC snapshot required');
  return {
    dev: stat.dev,
    ino: stat.ino,
    uid: stat.uid,
    mode: stat.mode,
    size: stat.size,
    ctimeNs: stat.ctimeNs,
    mtimeNs: stat.mtimeNs,
  };
}
var sameMetadata = (a, b) => Object.keys(a).every((key) => a[key] === b[key]);
async function openGoogleAdcSession(input, expectedInput) {
  const expected = { ...expectedInput, owner: structuredClone(expectedInput.owner) };
  const lease = { ...input, owner: structuredClone(input.owner) };
  const now = Date.now();
  if (
    lease.schemaVersion !== 1 ||
    lease.kind !== 'google-adc-snapshot' ||
    !sameOwner(lease.owner, expected.owner) ||
    typeof lease.assertOriginal !== 'function' ||
    typeof lease.closeAfterExecutorExit !== 'function' ||
    !isAbsolute5(expected.directory) ||
    resolve5(expected.directory) !== expected.directory ||
    !isAbsolute5(lease.snapshotPath) ||
    resolve5(lease.snapshotPath) !== lease.snapshotPath ||
    dirname4(lease.snapshotPath) !== expected.directory ||
    !Number.isSafeInteger(lease.verifiedAt) ||
    !Number.isSafeInteger(lease.expiresNoEarlierThan) ||
    lease.verifiedAt > now ||
    now - lease.verifiedAt >= 300000 ||
    lease.expiresNoEarlierThan - now <= 360000 ||
    lease.expiresNoEarlierThan - lease.verifiedAt > 3600000
  )
    throw new Error('Fresh reviewed Google ADC lease and owning workspace required');
  for (const key of [
    'snapshotSha256',
    'accountSha256',
    'audienceSha256',
    'authenticationReceiptSha256',
    'qualificationSha256',
  ])
    if (!validHash2(lease[key])) throw new Error('Exact Google ADC review hashes required');
  for (const key of ['accountSha256', 'audienceSha256', 'qualificationSha256'])
    if (!validHash2(expected[key]) || expected[key] !== lease[key])
      throw new Error('Google ADC principal, audience or qualification changed');
  const originalDirectory = await lstat4(expected.directory, { bigint: true });
  const directory = async () => {
    const current = await lstat4(expected.directory, { bigint: true });
    if (
      !current.isDirectory() ||
      current.isSymbolicLink() ||
      current.uid !== BigInt(process.getuid?.() ?? -1) ||
      (current.mode & 0o777n) !== 0o700n ||
      current.dev !== originalDirectory.dev ||
      current.ino !== originalDirectory.ino ||
      (await realpath3(expected.directory)) !== expected.directory
    )
      throw new Error('Original private Google ADC workspace changed');
  };
  await directory();
  const original = await fileMetadata(lease.snapshotPath);
  let refused = false;
  let retiring = false;
  let closed = false;
  let closure;
  const watcher = watch2(lease.snapshotPath, { persistent: false }, () => {
    refused = true;
    watcher.close();
  });
  watcher.on('error', () => {
    refused = true;
    watcher.close();
  });
  const watcherClosed = new Promise((resolve) => watcher.once('close', resolve));
  const close = () => {
    retiring = true;
    if (closed) return Promise.resolve();
    if (!closure)
      closure = (async () => {
        await lease.closeAfterExecutorExit();
        watcher.close();
        let timer;
        try {
          await Promise.race([
            watcherClosed,
            new Promise((_resolve, reject) => {
              timer = setTimeout(() => reject(new Error('Original ADC observer closure unresolved')), 1000);
            }),
          ]);
          closed = true;
        } finally {
          if (timer) clearTimeout(timer);
        }
      })().catch((error) => {
        closure = undefined;
        throw error;
      });
    return closure;
  };
  const verify = async (env) => {
    if (refused || retiring) throw new Error('Original Google ADC session remains refused');
    try {
      if (
        env.GOOGLE_APPLICATION_CREDENTIALS !== lease.snapshotPath ||
        googleCredentialAlternatives.some((key) => env[key] !== undefined)
      )
        throw new Error('Google ADC source substitution refused');
      await lease.assertOriginal();
      await directory();
      if (!sameMetadata(original, await fileMetadata(lease.snapshotPath)))
        throw new Error('Original Google ADC snapshot identity changed');
      const handle = await open2(lease.snapshotPath, constants2.O_RDONLY | constants2.O_NOFOLLOW);
      try {
        const opened = await handle.stat({ bigint: true });
        if (opened.dev !== original.dev || opened.ino !== original.ino || !opened.isFile())
          throw new Error('Original Google ADC snapshot replaced during open');
        const bytes = await handle.readFile();
        if (hash6(bytes) !== lease.snapshotSha256 || !sameMetadata(original, await fileMetadata(lease.snapshotPath)))
          throw new Error('Original Google ADC snapshot bytes changed');
        const credential = JSON.parse(bytes.toString('utf8'));
        if (
          credential?.type !== 'authorized_user' ||
          typeof credential.client_id !== 'string' ||
          hash6(credential.client_id) !== lease.audienceSha256 ||
          typeof credential.client_secret !== 'string' ||
          !credential.client_secret ||
          typeof credential.refresh_token !== 'string' ||
          !credential.refresh_token ||
          (credential.quota_project_id !== undefined && credential.quota_project_id !== lease.owner.account) ||
          (credential.token_uri !== undefined && credential.token_uri !== 'https://oauth2.googleapis.com/token') ||
          (credential.universe_domain !== undefined && credential.universe_domain !== 'googleapis.com') ||
          (credential.account !== undefined &&
            credential.account !== '' &&
            (typeof credential.account !== 'string' || hash6(credential.account) !== lease.accountSha256)) ||
          ['client_id', 'client_secret', 'refresh_token'].some(
            (key) => typeof credential[key] !== 'string' || !credential[key] || /[\0\r\n]/.test(credential[key]),
          )
        )
          throw new Error('Qualified authorized-user Google ADC mapping required');
      } finally {
        await handle.close();
      }
      await directory();
      await lease.assertOriginal();
      if (refused || retiring) throw new Error('Original Google ADC input event observed');
    } catch {
      refused = true;
      watcher.close();
      throw new Error('Original reviewed Google ADC session verification failed');
    }
  };
  const environment = () => Object.freeze({ GOOGLE_APPLICATION_CREDENTIALS: lease.snapshotPath });
  await verify(environment());
  return Object.freeze({ environment, verify, close });
}

// plugins/terraform/src/prepared-creation-scope.ts
import { createHash as createHash9 } from 'node:crypto';
import { constants as constants3 } from 'node:fs';
import {
  lstat as lstat5,
  mkdir as mkdir3,
  open as open3,
  readFile as readFile3,
  realpath as realpath4,
} from 'node:fs/promises';
import { dirname as dirname5, isAbsolute as isAbsolute6, join as join4, resolve as resolve6 } from 'node:path';

var preparations = new WeakMap();
var leases = new WeakMap();
var hash7 = (raw) => createHash9('sha256').update(raw).digest('hex');
var failure = () => new Error('Trusted original prepared creation scope required');
function lease(value) {
  const current = value && typeof value === 'object' ? leases.get(value) : undefined;
  if (!current || current.refused || current.closed) throw failure();
  return current;
}
async function privateDirectory2(path) {
  if (!isAbsolute6(path) || resolve6(path) !== path) throw failure();
  let current = '/';
  for (const part of path.split('/').filter(Boolean)) {
    current = join4(current, part);
    if ((await lstat5(current)).isSymbolicLink()) throw failure();
  }
  const st = await lstat5(path, { bigint: true });
  if (
    !st.isDirectory() ||
    st.uid !== BigInt(process.getuid?.() ?? -1) ||
    (st.mode & 0o777n) !== 0o700n ||
    (await realpath4(path)) !== path
  )
    throw failure();
  return st;
}
async function fileBinding(path) {
  const st = await lstat5(path, { bigint: true }),
    parent = await privateDirectory2(dirname5(path));
  if (
    !st.isFile() ||
    st.isSymbolicLink() ||
    st.uid !== BigInt(process.getuid?.() ?? -1) ||
    st.nlink !== 1n ||
    (st.mode & 0o777n) !== 0o400n ||
    st.size < 1n ||
    st.size > 65536n ||
    (await realpath4(path)) !== path
  )
    throw failure();
  const keys = ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'];
  return Object.freeze({
    path,
    sha256: hash7(await readFile3(path)),
    expectedIdentity: Object.freeze(Object.fromEntries(keys.map((k) => [k, st[k].toString()]))),
    expectedParentIdentity: Object.freeze({
      dev: parent.dev.toString(),
      ino: parent.ino.toString(),
      uid: parent.uid.toString(),
      mode: parent.mode.toString(),
    }),
  });
}
function targets(projection) {
  const values = [];
  const seen = new Set();
  for (const row of projection.resources) {
    if (
      row.mode !== 'managed' ||
      !['xcsh_token', 'xcsh_securemesh_site_v2'].includes(row.type) ||
      !row.actions.includes('create')
    )
      continue;
    const name = row.fields.name,
      namespace = row.fields.namespace;
    if (
      name?.status !== 'known' ||
      namespace?.status !== 'known' ||
      typeof name.value !== 'string' ||
      typeof namespace.value !== 'string' ||
      !/^[a-z0-9.-]{1,253}$/.test(name.value) ||
      !/^[a-z0-9.-]{1,253}$/.test(namespace.value)
    )
      throw failure();
    const target = Object.freeze({ type_name: row.type, name: name.value, namespace: namespace.value });
    const key = JSON.stringify(target);
    if (seen.has(key)) throw failure();
    seen.add(key);
    values.push(target);
  }
  if (values.length > 128) throw failure();
  return Object.freeze(values.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
}
function prepareOriginalCreationScope(context) {
  if (!context || typeof context !== 'object') return Promise.reject(failure());
  const pending = preparations.get(context);
  if (pending)
    return pending.then(async (packet) => {
      if (lease(packet).consumed) throw failure();
      await assertPreparedCreationScope(packet);
      if (lease(packet).consumed) throw failure();
      return packet;
    });
  const preparation = (async () => {
    await context.assertWithinDeadline();
    await context.assertInputs();
    if (!context.readOriginalPlanSource) throw failure();
    const projection = await context.readOriginalPlanSource();
    await assertOriginalTerraformPlanProjection(projection);
    if (
      projection.directory !== context.executionDirectory ||
      projection.scope.cloud !== 'gcp' ||
      projection.scope.account !== context.owner.account ||
      projection.scope.region !== context.owner.region ||
      projection.receipt.engine !== 'terraform' ||
      projection.receipt.deploymentId !== context.owner.deploymentId ||
      context.owner.provider !== 'gcp' ||
      context.owner.engine !== 'terraform' ||
      projection.executionAuthorized !== false ||
      !/^[a-f0-9]{64}$/.test(projection.receipt.planSha256) ||
      context.inputs['workspace:main.tf.json']?.sha256 !== projection.receipt.configurationSha256 ||
      context.inputs['workspace:.terraform.lock.hcl']?.sha256 !== projection.receipt.providerLockSha256
    )
      throw failure();
    const resources = targets(projection);
    const record = {
      context,
      projection,
      resources,
      refused: false,
      closed: false,
      consumed: false,
      authorized: false,
    };
    if (resources.length) {
      if (process.platform !== 'linux') throw failure();
      const providers = await context.readProviderInputs();
      const choices = Object.entries(providers).filter(([key]) =>
        /^registry\.terraform\.io\/f5-sales-demo\/xcsh:terraform-provider-xcsh_v[0-9]+\.[0-9]+\.[0-9]+$/.test(key),
      );
      if (choices.length !== 1) throw failure();
      const [key, provider] = choices[0];
      const name = key.split(':')[1],
        version = name.slice('terraform-provider-xcsh_v'.length);
      if (
        provider.path !==
          join4(
            context.executionDirectory,
            '.terraform/providers/registry.terraform.io/f5-sales-demo/xcsh',
            version,
            'linux_amd64',
            name,
          ) ||
        !provider.expectedIdentity ||
        !provider.expectedParentIdentity ||
        !/^[a-f0-9]{64}$/.test(provider.sha256) ||
        (BigInt(provider.expectedIdentity.mode) & 0o111n) === 0n
      )
        throw failure();
      record.provider = provider;
      await privateDirectory2(context.executionDirectory);
      const base = join4(context.executionDirectory, '.xcsh-original-creation');
      try {
        await mkdir3(base, { mode: 448 });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
      await privateDirectory2(base);
      const directory = join4(base, projection.receipt.planSha256);
      await mkdir3(directory, { mode: 448 });
      await privateDirectory2(directory);
      const scopeFile = join4(directory, 'scope.json');
      const raw = Buffer.from(
        JSON.stringify({
          schema_version: 1,
          scope_sha256: projection.receipt.planSha256,
          directory,
          provider_executable_sha256: provider.sha256,
          resources,
        }),
      );
      if (raw.length > 65536) throw failure();
      const file = await open3(
        scopeFile,
        constants3.O_WRONLY | constants3.O_CREAT | constants3.O_EXCL | constants3.O_NOFOLLOW,
        256,
      );
      try {
        await file.writeFile(raw);
        await file.sync();
      } finally {
        await file.close();
      }
      for (const path of [directory, base]) {
        const handle = await open3(path, constants3.O_RDONLY | constants3.O_DIRECTORY | constants3.O_NOFOLLOW);
        try {
          await handle.sync();
        } finally {
          await handle.close();
        }
      }
      record.directory = directory;
      record.scopeFile = scopeFile;
      record.binding = await fileBinding(scopeFile);
      record.monitor = await monitorOriginalInputs({ scope: record.binding });
    }
    const packet = Object.freeze({ schemaVersion: 1, kind: 'prepared-original-creation-scope' });
    leases.set(packet, record);
    try {
      await assertPreparedCreationScope(packet);
    } catch (error) {
      record.refused = true;
      record.monitor?.close();
      throw error;
    }
    return packet;
  })();
  preparations.set(context, preparation);
  return preparation;
}
async function assertPreparedCreationScopeInputs(packet) {
  const current = lease(packet);
  try {
    await current.context.assertInputs();
    await assertOriginalTerraformPlanProjection(current.projection);
    if (current.provider) {
      const providers = await current.context.readProviderInputs();
      const matches = Object.values(providers).filter((p) => p.path === current.provider?.path);
      if (matches.length !== 1) throw failure();
      assertSameOriginalInput(current.provider, matches[0]);
    }
    await current.monitor?.assertOriginal();
    if (current.scopeFile) {
      if (!current.binding) throw failure();
      assertSameOriginalInput(current.binding, await fileBinding(current.scopeFile));
      await current.monitor?.assertOriginal();
    }
    await current.context.assertInputs();
  } catch {
    current.refused = true;
    current.authorized = false;
    throw failure();
  }
}
async function assertPreparedCreationScope(packet) {
  const current = lease(packet);
  current.authorized = false;
  await current.context.assertWithinDeadline();
  await assertPreparedCreationScopeInputs(packet);
  current.authorized = true;
}
function assertPreparedCreationScopeContext(packet, context) {
  if (lease(packet).context !== context) throw failure();
}
async function inspectPreparedCreationScope(packet) {
  await assertPreparedCreationScopeInputs(packet);
  const current = lease(packet);
  return Object.freeze({
    resources: current.resources,
    scopeFile: current.scopeFile,
    directory: current.directory,
    scope: current.binding,
    provider: current.provider,
    planSha256: current.projection.receipt.planSha256,
  });
}
function consumePreparedCreationScope(packet, request, environment) {
  const current = lease(packet),
    now = linuxMonotonicMs();
  if (
    !current.authorized ||
    current.consumed ||
    now < current.context.budget.start ||
    now >= current.context.budget.deadline ||
    request.cwd !== current.context.executionDirectory
  )
    throw failure();
  assertOriginalTerraformPlanSourceProjection(request.originalPlanSource, current.projection);
  for (const key of ['GOOGLE_APPLICATION_CREDENTIALS', 'XCSH_API_URL', 'XCSH_API_TOKEN'])
    if (environment[key] !== current.context.environment[key]) throw failure();
  current.consumed = true;
  current.authorized = false;
  return current.scopeFile;
}
function closePreparedCreationScope(packet) {
  const current = packet && typeof packet === 'object' ? leases.get(packet) : undefined;
  if (!current || current.closed) return;
  current.closed = true;
  current.authorized = false;
  current.monitor?.close();
}

// plugins/terraform/src/installed-gcp-invocation.ts
var originalLoaderAlternatives = Object.freeze([
  'PYTHONPATH',
  'PYTHONHOME',
  'PYTHONSTARTUP',
  'PYTHONINSPECT',
  'PYTHONUSERBASE',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'DYLD_INSERT_LIBRARIES',
]);
var hostKeys = Object.freeze([
  'PATH',
  'HOME',
  'LANG',
  'LC_ALL',
  'TMPDIR',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
]);
var identityKeys = ['GOOGLE_APPLICATION_CREDENTIALS', 'XCSH_API_URL', 'XCSH_API_TOKEN'];
var canonicalPath = (value) =>
  typeof value === 'string' && isAbsolute7(value) && resolve7(value) === value && !/[\0\r\n]/.test(value);
function selectInstalledGcpEnvironment(environment) {
  if (
    originalLoaderAlternatives.some((key) => environment[key] !== undefined) ||
    googleCredentialAlternatives.some((key) => environment[key] !== undefined)
  )
    throw new Error('Original installed GCP loader or credential substitution refused');
  const selected = Object.fromEntries(
    [...hostKeys, ...identityKeys]
      .filter((key) => environment[key] !== undefined)
      .map((key) => [key, environment[key]]),
  );
  if (
    identityKeys.some((key) => typeof selected[key] !== 'string' || !selected[key]) ||
    !canonicalPath(selected.GOOGLE_APPLICATION_CREDENTIALS) ||
    !canonicalPath(selected.HOME) ||
    typeof selected.PATH !== 'string' ||
    !selected.PATH ||
    Object.values(selected).some((value) => typeof value !== 'string' || value.includes('\x00'))
  )
    throw new Error('Original installed GCP host and identity environment required');
  let platform;
  try {
    platform = new URL(selected.XCSH_API_URL);
  } catch {
    throw new Error('Original installed Platform environment required');
  }
  if (
    platform.protocol !== 'https:' ||
    platform.origin !== selected.XCSH_API_URL ||
    /[\r\n]/.test(selected.XCSH_API_TOKEN)
  )
    throw new Error('Original installed Platform environment required');
  return Object.freeze(selected);
}
var applyArgs = ['apply', '-input=false', '-lock=true', '-lock-timeout=60s', 'saved.tfplan'];
var planArgs = ['plan', '-input=false', '-lock=true', '-lock-timeout=60s', '-refresh=true', '-out=saved.tfplan'];
var ordinaryArgs = [
  ['version', '-json'],
  ['init', '-input=false', '-lockfile=readonly'],
  ['validate', '-json'],
  ['show', '-json', 'saved.tfplan'],
  ['show', '-json', 'terraform.tfstate'],
  ['output', '-json'],
];
var equal = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
var actionAddress = /^-invoke=action\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*(?:\["[a-z][a-z0-9_-]*"\])?$/;
function owningArgs(args) {
  if (equal(args, applyArgs) || ordinaryArgs.some((expected) => equal(args, expected)) || equal(args, planArgs)) return;
  if (
    args.length === planArgs.length + 1 &&
    equal(args.slice(0, -1), planArgs) &&
    (args.at(-1) === '-destroy' || actionAddress.test(args.at(-1) ?? ''))
  )
    return;
  throw new Error('Exact owning Terraform runner command required');
}
function createInstalledGcpInvocationCompiler(input) {
  const directory = input.directory;
  const readPreparedScope = input.readPreparedCreationScope;
  if (readPreparedScope !== undefined && typeof readPreparedScope !== 'function')
    throw new Error('Trusted original prepared creation scope getter required');
  if (!canonicalPath(directory)) throw new Error('Original installed execution directory required');
  const selected = selectInstalledGcpEnvironment({ ...input.environment });
  const internal = Object.freeze({
    TF_CLI_CONFIG_FILE: join5(directory, 'deployment.tfrc'),
    TF_DATA_DIR: join5(directory, '.terraform'),
    TF_IN_AUTOMATION: '1',
    TF_INPUT: '0',
    TF_WORKSPACE: 'default',
  });
  return (request) => {
    const args = [...request.args];
    const incoming = { ...request.env };
    if (request.cwd !== directory) throw new Error('Original installed execution directory changed');
    owningArgs(args);
    if (
      originalLoaderAlternatives.some((key) => incoming[key] !== undefined) ||
      googleCredentialAlternatives.some((key) => incoming[key] !== undefined)
    )
      throw new Error('Original installed GCP loader or credential substitution refused');
    if (
      identityKeys.some((key) => incoming[key] !== selected[key]) ||
      hostKeys.some((key) => incoming[key] !== undefined && incoming[key] !== selected[key])
    )
      throw new Error('Original selected installed execution environment changed');
    if (
      Object.entries(internal).some(([key, value]) => incoming[key] !== value) ||
      Object.keys(incoming).some((key) => key.startsWith('TF_') && !Object.hasOwn(internal, key))
    )
      throw new Error('Original owning runner internal environment required');
    if (incoming.XCSH_ORIGINAL_CREATION_SCOPE_FILE !== undefined)
      throw new Error('Requested original creation scope substitution refused');
    const tracing = args[0] === 'apply';
    if (request.originalPlanSource && !tracing)
      throw new Error('Original plan source belongs only to its saved-plan apply');
    const scopeFile =
      tracing && readPreparedScope ? consumePreparedCreationScope(readPreparedScope(), request, selected) : undefined;
    return {
      cwd: directory,
      ...(request.originalPlanSource ? { originalPlanSource: request.originalPlanSource } : {}),
      args: tracing ? ['apply', '-json', '-parallelism=1', ...args.slice(1)] : args,
      env: {
        ...selected,
        ...internal,
        ...(tracing ? { TF_LOG: 'JSON' } : {}),
        ...(scopeFile ? { XCSH_ORIGINAL_CREATION_SCOPE_FILE: scopeFile } : {}),
      },
      ...(request.signal ? { signal: request.signal } : {}),
    };
  };
}
// plugins/terraform/src/installed-runtime-pins.json
var installed_runtime_pins_default = {
  schemaVersion: 1,
  pythonSha256: 'aac3ade3f7d90fbf63e3ea0c46120a0cfbd159e1e503dde04721979507a1548b',
  wheelSha256: '076a2d2f923fd4821644f5ba89f059523da90dc9014e85f8e45a5774ca5bc6f9',
  sdkFilesSha256: {
    'psutil-7.2.2.dist-info/LICENSE': 'b89c063b3786e28e0c0a38f1931db61fed35e69dd2a2966fbecffee0f46c8d10',
    'psutil-7.2.2.dist-info/METADATA': '525f8ba78523cf7bc3759d62a105e7c57fd679ea702402b9449fb0746aa0217f',
    'psutil-7.2.2.dist-info/RECORD': 'f7b381c717acbef3e492800accf25193bc41fad041338741d95f25a768fbc4d0',
    'psutil-7.2.2.dist-info/WHEEL': 'aca9cca3026cd7b9774535accd80fde13f5a55cf32141be943e4575a4e8835cd',
    'psutil-7.2.2.dist-info/top_level.txt': '8023619f9ef0ce4b038d20084a680c2746a25f342e964d062616f6f81032620c',
    'psutil/__init__.py': 'd138a5786b163b56ba86ea0b2d5589dfca37e1bcdf8de1057fe1e933d6ab808a',
    'psutil/_common.py': '1bbce9fd97e6f5439a0d385f28401f527c5a9d978d9d062593d7ef6fe215fc75',
    'psutil/_ntuples.py': '9b8e8b938abae2786a515f686f4d8132218be897eb6b459b9324ed17d88a31c7',
    'psutil/_psaix.py': 'afe4038d5e1454559f17dac9e6c2c56ad8cf873d43880f6503e8549cc06a18ec',
    'psutil/_psbsd.py': 'c1a8314a9640649c99197ff261dbeec1f0080175e4a3f6b5cb370a39332deb94',
    'psutil/_pslinux.py': 'a8a09bab87848075b691c46112b00692745785a8c9d5a2c87037ae124b469749',
    'psutil/_psosx.py': '89f0ea0e9c1fe38f224b612792bf31d07c8880d79281806e5379c00514f6b3f2',
    'psutil/_psposix.py': '288887b58f5939e3b00e021f6e7b490c2f7f4852804a359918ab7d9c6fb39839',
    'psutil/_pssunos.py': 'cc348442008a54cb6054299b2ecae0d9a123c07bb4ba1f8e14b319487f83cee5',
    'psutil/_psutil_linux.abi3.so': '8085c743a77f6059be6d18d54317ccce2e715425bb5f15aa8835770463d6b9fd',
    'psutil/_pswindows.py': '580ad391de734c113682200ee9f4245e34737f5e26af0a73a4e8c9b4458de220',
  },
  installerSha256: 'e651609bac597b8dbcdf0192a4fb3f0cad08b58b8eb9560ae66c22b1088bdf45',
  terraformSha256: '00a240950f88f51a03ad90975f1647737e40ddcd5df30a703fd840aa07dccced',
  googleProviderSha256: '1c620693bca3fe61c3b8ce8d313f3c6dc35648f2246784e5d92fe3d22e0dfd9f',
  xcProviderSha256: 'c25cc2562047d72ef3b10d2cd8319f13f8c5b6785aa62cc9006b6370ae68fd67',
  refreshQualificationSha256: '613a5979c06e99b57a9ae34855f8d0f4724ebe641e22d7b6ed973cca378fbc0c',
};

// plugins/terraform/src/installed-terraform-executable.ts
import { lstat as lstat6, realpath as realpath5 } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname as dirname6, isAbsolute as isAbsolute8, join as join6, resolve as resolve8 } from 'node:path';

function selectPinnedTerraformInput(expectedSha256, cached, ambient) {
  if (cached) {
    if (cached.sha256 !== expectedSha256) throw new Error('Original cached Terraform executable differs');
    return cached;
  }
  if (!ambient || ambient.sha256 !== expectedSha256)
    throw new Error('Install the exact original Terraform executable version');
  return ambient;
}
function installedTerraformVersionsDirectory(environment = process.env) {
  return environment.XCSH_TERRAFORM_EXECUTABLES_DIR ?? join6(homedir(), '.local/share/xcsh/terraform/versions');
}
async function privateOwnedDirectory(path) {
  const value = await lstat6(path);
  if (
    !value.isDirectory() ||
    value.isSymbolicLink() ||
    value.uid !== process.getuid?.() ||
    (value.mode & 18) !== 0 ||
    (await realpath5(path)) !== path
  )
    throw new Error('Original owned Terraform version cache directory required');
}
async function resolveInstalledTerraformExecutable(profile, environment = process.env) {
  if (!/^\d+\.\d+\.\d+$/.test(profile.terraformVersion) || !/^[a-f0-9]{64}$/.test(profile.terraformSha256))
    throw new Error('Original Terraform executable profile required');
  const root = installedTerraformVersionsDirectory(environment);
  if (!isAbsolute8(root) || resolve8(root) !== root)
    throw new Error('Original canonical Terraform version cache required');
  const exists = async (path) => {
    try {
      await lstat6(path);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  };
  if (await exists(root)) await privateOwnedDirectory(root);
  let cached;
  const path = join6(root, profile.terraformVersion, 'terraform');
  if (await exists(dirname6(path))) await privateOwnedDirectory(dirname6(path));
  if (await exists(path)) {
    await privateOwnedDirectory(root);
    await privateOwnedDirectory(dirname6(path));
    const value = await owned(path);
    if ((Number(value.binding.expectedIdentity?.mode) & 64) === 0)
      throw new Error('Original cached Terraform is not executable');
    cached = value.binding;
  }
  if (cached) return selectPinnedTerraformInput(profile.terraformSha256, cached, undefined);
  const command = Bun.which('terraform', { PATH: environment.PATH ?? process.env.PATH });
  const ambient = command ? (await owned(await realpath5(command))).binding : undefined;
  if (ambient && (Number(ambient.expectedIdentity?.mode) & 64) === 0)
    throw new Error('Original Terraform is not executable');
  return selectPinnedTerraformInput(profile.terraformSha256, undefined, ambient);
}

// plugins/terraform/src/legacy-installed-executor.ts
// plugins/terraform/src/signal-free-executor.ts
// plugins/terraform/src/original-output-stream.ts
import {
  createHash as createHash10,
  createHash as createHash11,
  randomUUID as randomUUID4,
  randomUUID as randomUUID5,
} from 'node:crypto';
import { constants as constants4, constants as constants5, watch as watch3 } from 'node:fs';
import {
  lstat as lstat7,
  lstat as lstat8,
  mkdir as mkdir4,
  open as open4,
  open as open5,
  readFile as readFile4,
  readFile as readFile5,
  realpath as realpath6,
  realpath as realpath7,
  stat,
  stat as stat2,
  writeFile as writeFile3,
  writeFile as writeFile4,
} from 'node:fs/promises';
import {
  dirname as dirname7,
  dirname as dirname8,
  dirname as dirname9,
  isAbsolute as isAbsolute9,
  join as join7,
  join as join8,
  join as join9,
  resolve as resolve9,
} from 'node:path';

var stableKeys = ['dev', 'ino', 'uid', 'nlink', 'mode'];
var parentKeys3 = ['dev', 'ino', 'uid', 'mode'];
var maximumChunk = 65536;
var maximumRetention = 64 * 1024 * 1024;
var digest2 = (value) => createHash10('sha256').update(value).digest('hex');
var chunkOrigins = new WeakMap();
var completionOrigins = new WeakMap();
class OutputNotReady extends Error {}

class OutputRefusal extends Error {}
async function bindOriginalExecutionOutput(input) {
  const identity = Object.freeze({ ...input.identity });
  const maximum = Math.min(input.maximum, maximumRetention);
  const streams = {};
  let refused = false;
  let closed = false;
  let busy = false;
  let phase = 'admission';
  let failureRecord;
  const close = async () => {
    closed = true;
    await Promise.all(Object.values(streams).map((s) => s.reader.close()));
  };
  const retainFailure = (error) => {
    if (!failureRecord)
      failureRecord = (async () => {
        const stream = streams.stdout;
        if (!stream) throw new Error('Original private failure directory unavailable');
        const parent = await lstat7(dirname7(stream.path), { bigint: true });
        if (
          !parent.isDirectory() ||
          parent.isSymbolicLink() ||
          parentKeys3.some((key) => parent[key] !== stream.parent[key])
        )
          throw new Error('Original private failure directory changed');
        const message = error instanceof Error ? error.message : 'Unknown original capture failure';
        const payload = JSON.stringify({
          schemaVersion: 1,
          kind: 'original-output-capture-failure',
          identity,
          phase,
          errorName: error instanceof Error ? error.name.slice(0, 64) : 'unknown',
          code: error instanceof Error && typeof error.code === 'string' ? error.code?.slice(0, 64) : null,
          message: message.slice(0, 4096),
          messageTruncated: message.length > 4096,
          messageSha256: digest2(Buffer.from(message)),
          offsets: { stdout: streams.stdout?.offset ?? 0, stderr: streams.stderr?.offset ?? 0 },
          applyRpcQualified: false,
          originalInsertQualified: false,
        });
        const file = await open4(
          join7(dirname7(stream.path), 'output-capture-failure.private.json'),
          constants4.O_WRONLY | constants4.O_CREAT | constants4.O_EXCL | constants4.O_NOFOLLOW,
          256,
        );
        try {
          await file.writeFile(payload);
          await file.sync();
        } finally {
          await file.close();
        }
      })();
    return failureRecord;
  };
  const assertOpen = () => {
    if (closed) throw new OutputRefusal('Original output capture closed');
    if (refused) throw new OutputRefusal('Original output capture refused');
  };
  const groupClosed = async () => {
    try {
      return await input.originalGroupClosed();
    } catch {
      refused = true;
      throw new OutputRefusal('Original output group closure unavailable');
    }
  };
  const waitForOriginalClosingGroup = async () => {
    if (await groupClosed()) return true;
    phase = 'original-closing';
    if ((await readFile4('/proc/sys/kernel/random/boot_id', 'utf8')).trim() !== identity.boot)
      throw new OutputRefusal('Original output producer boot changed');
    try {
      const raw = await readFile4(`/proc/${identity.pid}/stat`, 'utf8');
      const fields = raw
        .slice(raw.lastIndexOf(') ') + 2)
        .trim()
        .split(/\s+/);
      if (
        fields[19] !== identity.start ||
        Number(fields[1]) !== process.pid ||
        Number(fields[2]) !== identity.group ||
        Number(fields[3]) !== identity.group
      )
        throw new OutputRefusal('Original output closing producer identity changed');
      if (!['Z', 'X', 'x'].includes(fields[0])) return false;
    } catch (error) {
      if (!(error instanceof Error) || !['ENOENT', 'ESRCH'].includes(error.code ?? '')) throw error;
    }
    const deadline = linuxMonotonicMs() + 1000;
    while (linuxMonotonicMs() < deadline) {
      await input.assertInputs();
      if (await groupClosed()) return true;
      await Bun.sleep(25);
    }
    return false;
  };
  const guard = async (stream, afterOriginalExit = false) => {
    assertOpen();
    phase = 'input-lifetime';
    await input.assertInputs();
    phase = 'file-metadata';
    const [current, writer, opened, parent] = await Promise.all([
      lstat7(stream.path, { bigint: true }),
      stream.writer.stat({ bigint: true }),
      stream.reader.stat({ bigint: true }),
      lstat7(dirname7(stream.path), { bigint: true }),
    ]);
    if (
      !current.isFile() ||
      !parent.isDirectory() ||
      parent.isSymbolicLink() ||
      stableKeys.some((key) => [current, writer, opened].some((value) => value[key] !== stream.original[key])) ||
      parentKeys3.some((key) => parent[key] !== stream.parent[key]) ||
      (await realpath6(stream.path)) !== stream.path
    )
      throw new OutputRefusal('Original output file or parent identity changed');
    if (current.size < BigInt(stream.offset)) throw new OutputRefusal('Original output retained prefix truncated');
    if (current.size > BigInt(maximum)) throw new OutputRefusal('Original output capture limit exceeded');
    phase = 'original-group';
    if (!(await groupClosed())) {
      if (afterOriginalExit) throw new OutputRefusal('Original output producer closure changed');
      try {
        phase = 'producer-metadata';
        const raw = await readFile4(`/proc/${identity.pid}/stat`, 'utf8');
        const fields = raw
          .slice(raw.lastIndexOf(') ') + 2)
          .trim()
          .split(/\s+/);
        const [boot, producer] = await Promise.all([
          readFile4('/proc/sys/kernel/random/boot_id', 'utf8'),
          stat(`/proc/${identity.pid}/fd/${stream.descriptor}`, { bigint: true }),
        ]);
        if (
          boot.trim() !== identity.boot ||
          fields[19] !== identity.start ||
          Number(fields[1]) !== process.pid ||
          Number(fields[2]) !== identity.group ||
          Number(fields[3]) !== identity.group ||
          stableKeys.some((key) => producer[key] !== stream.original[key])
        )
          throw new OutputRefusal('Original output producer or descriptor identity changed');
      } catch (error) {
        const missing = error instanceof Error && ['ENOENT', 'ESRCH', 'EACCES'].includes(error.code ?? '');
        if (!missing || !(await waitForOriginalClosingGroup())) throw error;
        return guard(stream, true);
      }
    }
    return current;
  };
  const readAt = async (stream, offset, length) => {
    phase = 'retained-read';
    const bytes = Buffer.allocUnsafe(length);
    let read = 0;
    while (read < length) {
      const result = await stream.reader.read(bytes, read, length - read, offset + read);
      if (!result.bytesRead) throw new OutputRefusal('Original output retained bytes truncated');
      read += result.bytesRead;
    }
    return bytes;
  };
  const verifyPrefix = async (stream) => {
    phase = 'retained-prefix';
    const prefix = createHash10('sha256');
    for (let offset = 0; offset < stream.offset; offset += maximumChunk)
      prefix.update(await readAt(stream, offset, Math.min(maximumChunk, stream.offset - offset)));
    if (prefix.digest('hex') !== stream.hash.copy().digest('hex')) {
      phase = 'retained-prefix';
      throw new OutputRefusal('Original output retained prefix changed');
    }
  };
  const exclusive = async (action) => {
    assertOpen();
    if (busy) {
      refused = true;
      throw new OutputRefusal('Concurrent original output capture refused');
    }
    busy = true;
    try {
      return await action();
    } catch (error) {
      if (error instanceof OutputNotReady) throw error;
      refused = true;
      try {
        await retainFailure(error);
      } catch (persistence) {
        throw new AggregateError([error, persistence], 'Original private capture failure unresolved');
      }
      if (error instanceof OutputRefusal) throw error;
      throw new OutputRefusal('Original output capture identity or lifetime unavailable');
    } finally {
      busy = false;
    }
  };
  try {
    if (!Number.isSafeInteger(maximum) || maximum < 1) throw new OutputRefusal('Original output bound required');
    for (const channel of ['stdout', 'stderr']) {
      const selected = input[channel];
      const original = await selected.writer.stat({ bigint: true });
      const parent = await lstat7(dirname7(selected.path), { bigint: true });
      if (
        !original.isFile() ||
        original.uid !== BigInt(process.getuid?.() ?? -1) ||
        original.nlink !== 1n ||
        (original.mode & 0o077n) !== 0n ||
        original.size !== 0n ||
        !parent.isDirectory() ||
        parent.uid !== BigInt(process.getuid?.() ?? -1) ||
        (parent.mode & 0o077n) !== 0n
      )
        throw new OutputRefusal('Original private empty output descriptor required');
      const reader = await open4(selected.path, constants4.O_RDONLY | constants4.O_NOFOLLOW);
      const stream = {
        path: selected.path,
        writer: selected.writer,
        reader,
        original,
        parent,
        descriptor: channel === 'stdout' ? 1 : 2,
        offset: 0,
        hash: createHash10('sha256'),
      };
      streams[channel] = stream;
      await guard(stream);
    }
    const output = Object.freeze({
      read: (channel) =>
        exclusive(async () => {
          if (channel !== 'stdout' && channel !== 'stderr') throw new OutputRefusal('Original output channel required');
          const stream = streams[channel];
          const before = await guard(stream);
          await verifyPrefix(stream);
          const length = Math.min(maximumChunk, Number(before.size) - stream.offset);
          const bytes = await readAt(stream, stream.offset, length);
          await guard(stream);
          const check = await readAt(stream, stream.offset, length);
          if (!bytes.equals(check)) throw new OutputRefusal('Original output bytes changed during read');
          await verifyPrefix(stream);
          assertOpen();
          if (!length) return null;
          const offset = stream.offset;
          stream.offset += length;
          stream.hash.update(bytes);
          const chunk = Object.freeze({ offset, endOffset: stream.offset, bytes, sha256: digest2(bytes) });
          chunkOrigins.set(chunk, {
            output,
            identity,
            channel,
            bytes: Buffer.from(bytes),
            assertValid: () => {
              if (refused) throw new Error('Original output record source is refused');
            },
          });
          return chunk;
        }),
      finish: async () => {
        assertOpen();
        if (!(await groupClosed())) throw new OutputRefusal('Original output producer group remains live');
        return exclusive(async () => {
          const result = {};
          for (const channel of ['stdout', 'stderr']) {
            const stream = streams[channel];
            const before = await guard(stream);
            if (before.size !== BigInt(stream.offset)) throw new OutputNotReady('Original output unconsumed');
            await verifyPrefix(stream);
            const after = await guard(stream);
            if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs)
              throw new OutputRefusal('Original output changed after producer closure');
            result[channel] = Object.freeze({ bytes: stream.offset, sha256: stream.hash.copy().digest('hex') });
          }
          const completion = Object.freeze({
            ...result,
            originalGroupClosed: true,
            applyRpcQualified: false,
            originalInsertQualified: false,
          });
          completionOrigins.set(completion, {
            output,
            identity,
            assertValid: () => {
              if (refused) throw new Error('Original completion source is refused');
            },
          });
          return completion;
        });
      },
    });
    return { output, close };
  } catch (error) {
    await close();
    if (error instanceof OutputRefusal) throw error;
    throw new OutputRefusal('Original output descriptor admission unavailable');
  }
}

// plugins/terraform/src/signal-free-executor.ts
var hash8 = (value) => createHash11('sha256').update(value).digest('hex');
var now = linuxMonotonicMs;
var pause = () => Bun.sleep(25);
var signalFreeBootstrapSource = `import hashlib,json,os,sys,time
import psutil
os.umask(0o077)
os.setsid()
pid=os.getpid()
raw=open('/proc/self/stat').read()
fields=raw[raw.rfind(')')+2:].split()
boot=open('/proc/sys/kernel/random/boot_id').read().strip()
process=psutil.Process(pid)
exe=os.readlink('/proc/self/exe')
ticks=os.sysconf('SC_CLK_TCK')
btime=int(next(line.split()[1] for line in open('/proc/stat') if line.startswith('btime ')))
birth=btime+int(fields[19])/ticks
if process.pid!=pid or process.ppid()!=int(fields[1]) or process.uids().real!=os.getuid() or abs(process.create_time()-birth)>1/ticks:
 raise RuntimeError('Independent original process identity differs')
value={'pid':pid,'group':int(fields[2]),'start':fields[19],'boot':boot,'ppid':int(fields[1]),'pythonSha256':hashlib.sha256(open(exe,'rb').read()).hexdigest(),'sdkCreateTime':process.create_time(),'monotonicMs':time.monotonic_ns()//1000000}
partial=sys.argv[1]+'.partial'
with open(partial,'x') as out:
 json.dump(value,out);out.flush();os.fsync(out.fileno())
os.chmod(partial,0o400)
os.link(partial,sys.argv[1])
os.unlink(partial)
if sys.stdin.buffer.readline(4)!=b'go\\n' or sys.stdin.buffer.read(1)!=b'': sys.exit(73)
os.execve(sys.argv[2],[sys.argv[2],*sys.argv[3:]],dict(os.environ))
`;
async function pinned(binding) {
  if (
    !binding ||
    !isAbsolute9(binding.path) ||
    resolve9(binding.path) !== binding.path ||
    !/^[a-f0-9]{64}$/.test(binding.sha256)
  )
    throw new Error('Reviewed original executable binding required');
  const canonical = await realpath7(binding.path);
  const original = await stat2(canonical, { bigint: true });
  const link = await lstat8(binding.path, { bigint: true });
  if (
    !original.isFile() ||
    original.uid !== BigInt(process.getuid?.() ?? -1) ||
    original.nlink !== 1n ||
    (original.mode & 0o022n) !== 0n ||
    (original.mode & 0o111n) === 0n ||
    hash8(await readFile5(canonical)) !== binding.sha256
  )
    throw new Error('Owned pinned original executable required');
  let changed = false;
  const watcher = watch3(canonical, { persistent: false }, () => {
    changed = true;
  });
  const parent = watch3(dirname8(binding.path), { persistent: false }, (_event, name) => {
    if (!name || name.toString() === binding.path.split('/').at(-1)) changed = true;
  });
  watcher.on('error', () => {
    changed = true;
  });
  parent.on('error', () => {
    changed = true;
  });
  return {
    canonical,
    async require() {
      const current = await stat2(canonical, { bigint: true });
      const currentLink = await lstat8(binding.path, { bigint: true });
      if (
        changed ||
        (await realpath7(binding.path)) !== canonical ||
        ['dev', 'ino', 'uid', 'mode', 'size', 'mtimeNs', 'ctimeNs'].some((key) => current[key] !== original[key]) ||
        currentLink.ino !== link.ino ||
        currentLink.ctimeNs !== link.ctimeNs
      )
        throw new Error('Original executable lifetime changed');
    },
    close() {
      watcher.close();
      parent.close();
    },
  };
}
function signalFreeTerraformExecutor(input) {
  return originalExecutor(input);
}
function originalExecutor(input, reserve) {
  const policy = { ...input, python: { ...input.python }, executable: { ...input.executable } };
  const inherited = reserve ? inspectFinalReaderReserve(reserve) : undefined;
  const executionDeadline = inherited?.finalDeadlineMs ?? policy.originalDeadlineMs;
  const assertOriginal = async () => {
    await policy.assertOriginal();
    if (reserve) await assertFinalReaderReserve(reserve);
  };
  const assertOriginalIdentity = async () => {
    await (policy.assertOriginalIdentity ?? policy.assertOriginal)();
    if (reserve) await assertFinalReaderReserve(reserve);
  };
  const beforeRelease = policy.beforeRelease;
  if (
    process.platform !== 'linux' ||
    !Number.isSafeInteger(policy.originalStartMs) ||
    !Number.isSafeInteger(policy.originalDeadlineMs) ||
    policy.originalStartMs < 0 ||
    policy.originalDeadlineMs !== policy.originalStartMs + 7200000 ||
    typeof policy.assertOriginal !== 'function' ||
    (policy.assertOriginalIdentity !== undefined && typeof policy.assertOriginalIdentity !== 'function') ||
    (policy.assertFinalInputs !== undefined && typeof policy.assertFinalInputs !== 'function') ||
    (policy.assertOriginalIdentity !== undefined) !== (policy.assertFinalInputs !== undefined) ||
    (beforeRelease !== undefined && typeof beforeRelease !== 'function') ||
    typeof policy.finalCapture !== 'function'
  )
    throw new Error('Original Linux operation budget and trusted lifetime policy required');
  const timeout = policy.timeoutMs ?? 7200000;
  const startup = policy.startupTimeoutMs ?? 15000;
  const maximum = policy.maxOutputBytes ?? 64 * 1024 * 1024;
  if (![timeout, startup, maximum].every((value) => Number.isSafeInteger(value) && value > 0) || startup > 15000)
    throw new Error('Bounded original execution limits required');
  return async ({ cwd, args: inputArgs, env: inputEnvironment, signal }) => {
    const args = [...inputArgs];
    const env = { ...inputEnvironment };
    if (originalLoaderAlternatives.some((key) => env[key] !== undefined))
      throw new Error('Original execution loader substitution refused');
    const began = now();
    if (began < policy.originalStartMs || began >= executionDeadline)
      throw new Error('Original operation deadline exhausted');
    signal?.throwIfAborted();
    await assertOriginal();
    const directory = await lstat8(cwd);
    if (
      !directory.isDirectory() ||
      directory.isSymbolicLink() ||
      directory.uid !== process.getuid?.() ||
      (directory.mode & 63) !== 0 ||
      !args.length ||
      args.some((arg) => typeof arg !== 'string' || arg.includes('\x00'))
    )
      throw new Error('Original private command workspace and exact arguments required');
    const python = await pinned(policy.python);
    let executable;
    try {
      executable = await pinned(policy.executable);
    } catch (error) {
      python.close();
      throw error;
    }
    const root = join8(cwd, 'executor-diagnostics', randomUUID4());
    await mkdir4(root, { recursive: true, mode: 448 });
    const script = join8(root, 'gate.py');
    const bootstrap = join8(root, 'bootstrap.json');
    await writeFile3(script, signalFreeBootstrapSource, { flag: 'wx', mode: 256 });
    const stdoutPath = join8(root, 'stdout.private');
    const stderrPath = join8(root, 'stderr.private');
    const stdout = await open5(
      stdoutPath,
      constants5.O_CREAT | constants5.O_EXCL | constants5.O_WRONLY | constants5.O_NOFOLLOW,
      384,
    );
    const stderr = await open5(
      stderrPath,
      constants5.O_CREAT | constants5.O_EXCL | constants5.O_WRONLY | constants5.O_NOFOLLOW,
      384,
    );
    const outIdentity = await stdout.stat({ bigint: true });
    const errIdentity = await stderr.stat({ bigint: true });
    const lock = join8(cwd, '.terraform-executor-lock');
    let release;
    let child;
    let submitted = false;
    let originalIdentity;
    let reason;
    let inputFailureEvidence;
    let inputFailureObserved = false;
    const inputPersistenceErrors = [];
    let finalStarted;
    let actualExitCode = null;
    let groupClosed = false;
    let captureClosed = false;
    let captureStartup;
    let originalOutput;
    const fail = (value) => {
      if (!reason) reason = value;
      finalStarted ??= now();
    };
    const startupEvidence = [];
    const startupPersistenceErrors = [];
    const startupFields = () =>
      startupEvidence.length ? { startupFailureEvidence: Object.freeze([...startupEvidence]) } : {};
    const retainStartupFailure = async (phase, error) => {
      fail('startup');
      const path = join8(root, `startup-${phase}-failure.private.json`);
      const raw = JSON.stringify({
        schemaVersion: 1,
        kind: 'original-executor-startup-failure',
        phase,
        identity: originalIdentity,
        pid: child?.pid,
        originalStartMs: policy.originalStartMs,
        originalDeadlineMs: policy.originalDeadlineMs,
        invocationStartedMs: began,
        finalStartedMs: finalStarted,
        observedMs: now(),
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : { type: typeof error, value: typeof error === 'string' ? error : undefined },
        signalsSent: false,
      });
      try {
        await writeFile3(path, raw, { mode: 256, flag: 'wx' });
        startupEvidence.push(Object.freeze({ schemaVersion: 1, phase, path, sha256: hash8(Buffer.from(raw)) }));
      } catch (persistenceError) {
        startupPersistenceErrors.push(
          new AggregateError([error, persistenceError], 'Original startup failure and persistence unresolved'),
        );
      }
    };
    const retainInputFailure = async (phase, error) => {
      fail('input-changed');
      if (inputFailureObserved) return;
      inputFailureObserved = true;
      const path = join8(root, 'input-failure.private.json');
      const raw = JSON.stringify({
        schemaVersion: 1,
        kind: 'original-executor-input-failure',
        phase,
        identity: originalIdentity,
        pid: child?.pid,
        originalStartMs: policy.originalStartMs,
        originalDeadlineMs: policy.originalDeadlineMs,
        invocationStartedMs: began,
        finalStartedMs: finalStarted,
        observedMs: now(),
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : { type: typeof error, value: typeof error === 'string' ? error : undefined },
        signalsSent: false,
      });
      try {
        await writeFile3(path, raw, { mode: 256, flag: 'wx' });
        inputFailureEvidence = Object.freeze({ schemaVersion: 1, path, sha256: hash8(Buffer.from(raw)) });
      } catch (persistenceError) {
        inputPersistenceErrors.push(
          new AggregateError([error, persistenceError], 'Original input failure and persistence unresolved'),
        );
      }
    };
    const check = async () => {
      if (signal?.aborted) fail('cancelled');
      if (now() >= Math.min(began + timeout, executionDeadline)) fail('deadline');
      let inputPhase = 'python-executable-check';
      try {
        await python.require();
        inputPhase = 'command-executable-check';
        await executable.require();
        inputPhase = 'original-input-check';
        await assertOriginalIdentity();
      } catch (error) {
        await retainInputFailure(inputPhase, error);
      }
      for (const [path, original] of [
        [stdoutPath, outIdentity],
        [stderrPath, errIdentity],
      ]) {
        let current;
        try {
          current = await lstat8(path, { bigint: true });
        } catch (error) {
          await retainInputFailure(path === stdoutPath ? 'stdout-path-inspection' : 'stderr-path-inspection', error);
          continue;
        }
        if (
          current.ino !== original.ino ||
          current.dev !== original.dev ||
          current.uid !== original.uid ||
          current.nlink !== 1n
        )
          await retainInputFailure(
            path === stdoutPath ? 'stdout-identity-check' : 'stderr-identity-check',
            new Error('Original output file identity changed'),
          );
        if (current.size > maximum) fail('output-limit');
      }
    };
    try {
      child = Bun.spawn([policy.python.path, '-I', '-B', script, bootstrap, policy.executable.path, ...args], {
        cwd,
        env: { ...env },
        stdin: 'pipe',
        stdout: stdout.fd,
        stderr: stderr.fd,
      });
      const childDone = child.exited.then((code) => {
        actualExitCode = code;
      });
      const startupDeadline = Math.min(began + startup, executionDeadline);
      while (!(await Bun.file(bootstrap).exists()) && actualExitCode === null && !reason) {
        await check();
        if (now() >= startupDeadline) fail('startup');
        await pause();
      }
      if (!reason && actualExitCode === null) {
        const evidence = JSON.parse(await readFile5(bootstrap, 'utf8'));
        const raw = await readFile5(`/proc/${child.pid}/stat`, 'utf8');
        const fields = raw
          .slice(raw.lastIndexOf(') ') + 2)
          .trim()
          .split(/\s+/);
        if (
          evidence.pid !== child.pid ||
          evidence.group !== child.pid ||
          evidence.ppid !== process.pid ||
          evidence.pythonSha256 !== policy.python.sha256 ||
          evidence.start !== fields[19] ||
          evidence.boot !== (await readFile5('/proc/sys/kernel/random/boot_id', 'utf8')).trim() ||
          !Number.isSafeInteger(evidence.monotonicMs) ||
          evidence.monotonicMs > now() ||
          now() - evidence.monotonicMs >= 15000
        )
          fail('startup');
        else {
          originalIdentity = Object.freeze({
            pid: evidence.pid,
            group: evidence.group,
            start: evidence.start,
            boot: evidence.boot,
          });
          release = await acquireProcessLock(lock, child.pid, { trackProcessGroup: true });
          await check();
          if (now() >= startupDeadline) fail('startup');
          if (!reason && beforeRelease) {
            captureStartup = Promise.resolve()
              .then(async () => {
                if (!originalIdentity) throw new Error('Original execution identity unavailable');
                originalOutput = await bindOriginalExecutionOutput({
                  identity: originalIdentity,
                  stdout: { path: stdoutPath, writer: stdout },
                  stderr: { path: stderrPath, writer: stderr },
                  maximum,
                  assertInputs: async () => {
                    await python.require();
                    await executable.require();
                    await assertOriginal();
                    const readerDeadline =
                      inherited?.finalDeadlineMs ??
                      (finalStarted === undefined ? executionDeadline : finalStarted + 300000);
                    if (now() >= readerDeadline) throw new Error('Original output capture deadline exhausted');
                  },
                  originalGroupClosed: async () => {
                    if (actualExitCode === null) return false;
                    try {
                      await assertExecutorGroupClosed(lock);
                      return true;
                    } catch (error) {
                      if (error instanceof Error && error.message === 'Original executor process group remains live')
                        return false;
                      throw error;
                    }
                  },
                });
                const admission = Object.freeze({
                  output: originalOutput.output,
                  directory: cwd,
                  args: Object.freeze([...args]),
                  identity: Object.freeze({
                    pid: evidence.pid,
                    group: evidence.group,
                    start: evidence.start,
                    boot: evidence.boot,
                  }),
                  stdoutPath,
                  stderrPath,
                  originalStartMs: policy.originalStartMs,
                  originalDeadlineMs: policy.originalDeadlineMs,
                  startupDeadlineMs: startupDeadline,
                });
                await beforeRelease(admission);
              })
              .catch(async (error) => {
                await retainStartupFailure('callback', error);
                throw error;
              });
            const startupDeadlineError = new Error('Original capture startup deadline exhausted');
            let startupTimer;
            try {
              await Promise.race([
                captureStartup,
                new Promise((_resolve, reject) => {
                  startupTimer = setTimeout(() => reject(startupDeadlineError), Math.max(0, startupDeadline - now()));
                }),
              ]);
            } catch (error) {
              fail('startup');
              if (error === startupDeadlineError) await retainStartupFailure('deadline', error);
            } finally {
              if (startupTimer) clearTimeout(startupTimer);
            }
            await check();
            if (now() >= startupDeadline || actualExitCode !== null) fail('startup');
          }
        }
      } else if (!reason) fail('startup');
      if (!reason && policy.assertOriginalIdentity) {
        try {
          await assertOriginal();
        } catch (error) {
          await retainInputFailure('release-original-input-check', error);
        }
        await check();
        if (now() >= startupDeadline || actualExitCode !== null) fail('startup');
      }
      if (!reason) {
        await writeFile3(
          join8(root, 'submission.private.json'),
          JSON.stringify({
            schemaVersion: 1,
            pid: child.pid,
            originalStartMs: policy.originalStartMs,
            originalDeadlineMs: policy.originalDeadlineMs,
            args,
            executable: policy.executable,
          }),
          { mode: 256, flag: 'wx' },
        );
        submitted = true;
        child.stdin?.write(`go
`);
        await child.stdin?.flush();
      }
      await child.stdin?.end();
      while (actualExitCode === null && !reason) {
        await check();
        if (finalStarted !== undefined && now() >= finalStarted + 300000) break;
        await pause();
      }
      if (actualExitCode !== null) await childDone;
      finalStarted ??= now();
      await check();
      if (release && actualExitCode !== null) {
        try {
          await assertExecutorGroupClosed(lock);
          groupClosed = true;
        } catch (error) {
          if (!(error instanceof Error) || error.message !== 'Original executor process group remains live')
            await retainInputFailure('original-group-closure', error);
        }
      } else if (!release && actualExitCode !== null) groupClosed = true;
      const capture = {
        ...startupFields(),
        invocationStartedMs: began,
        finalStartedMs: inherited?.finalStartedMs ?? finalStarted,
        finalDeadlineMs: inherited?.finalDeadlineMs ?? finalStarted + 300000,
        ...(inherited ? { inheritedReaderReserve: inherited } : {}),
        originalDeadlineMs: policy.originalDeadlineMs,
        finishedMs: now(),
        stdoutPath,
        stderrPath,
        pid: child.pid,
        identity: originalIdentity,
        submitted,
        actualExitCode,
        originalGroupClosed: groupClosed,
        signalsSent: false,
        reason,
        ...(inputFailureEvidence ? { inputFailureEvidence } : {}),
      };
      const finalErrors = [];
      try {
        await writeFile3(join8(root, 'final.private.json'), JSON.stringify(capture), { mode: 256, flag: 'wx' });
      } catch (error) {
        finalErrors.push(error);
      }
      let captureTimer;
      try {
        await Promise.race([
          (async () => {
            await captureStartup?.catch(() => {
              return;
            });
            if (now() >= capture.finalDeadlineMs) throw new Error('Original final capture deadline exhausted');
            const retainFinalCheck = async () => {
              try {
                await policy.assertFinalInputs?.();
              } catch (error) {
                finalErrors.push(error);
              }
            };
            await retainFinalCheck();
            try {
              await policy.finalCapture(Object.freeze({ ...capture, ...startupFields() }));
            } finally {
              await retainFinalCheck();
            }
          })(),
          new Promise((_resolve, reject) => {
            captureTimer = setTimeout(
              () => reject(new Error('Original final capture deadline exhausted')),
              Math.max(0, capture.finalDeadlineMs - now()),
            );
          }),
        ]);
        captureClosed = policy.assertFinalInputs ? finalErrors.length === 0 : true;
      } catch (error) {
        finalErrors.push(error);
      } finally {
        if (captureTimer) clearTimeout(captureTimer);
      }
      while (!groupClosed && now() < capture.finalDeadlineMs) {
        await check();
        if (actualExitCode !== null) {
          await childDone;
          if (release) {
            try {
              await assertExecutorGroupClosed(lock);
              groupClosed = true;
            } catch (error) {
              if (!(error instanceof Error) || error.message !== 'Original executor process group remains live') {
                finalErrors.push(error);
                break;
              }
            }
          } else groupClosed = true;
        }
        if (!groupClosed) await pause();
      }
      try {
        await writeFile3(
          join8(root, 'completion.private.json'),
          JSON.stringify({
            ...capture,
            ...startupFields(),
            finishedMs: now(),
            actualExitCode,
            originalGroupClosed: groupClosed,
            captureClosed,
            reason,
            ...(inputFailureEvidence ? { inputFailureEvidence } : {}),
          }),
          { mode: 256, flag: 'wx' },
        );
      } catch (error) {
        finalErrors.push(error);
      }
      finalErrors.push(...inputPersistenceErrors, ...startupPersistenceErrors);
      if (!groupClosed || actualExitCode === null) {
        const closureError = new Error('Original executor closure unresolved; lock remains held');
        if (finalErrors.length)
          throw new AggregateError([...finalErrors, closureError], 'Original final capture evidence unresolved');
        throw closureError;
      }
      if (finalErrors.length === 1) throw finalErrors[0];
      if (finalErrors.length) throw new AggregateError(finalErrors, 'Original final capture evidence unresolved');
      if (release) {
        await release();
        release = undefined;
      }
      if (reason) return { code: 1, stdout: '', failureCategory: 'unknown' };
      const stderrBytes = await readFile5(stderrPath);
      const categories = new Set(terraformFailureCategories(stderrBytes.toString('utf8')));
      const category = categories.size === 1 ? [...categories][0] : 'unknown';
      return {
        code: actualExitCode,
        stdout: await readFile5(stdoutPath, 'utf8'),
        ...(actualExitCode ? { failureCategory: category } : {}),
      };
    } catch (error) {
      const failures = [error];
      if (child && !submitted && actualExitCode === null) {
        try {
          await child.stdin.end();
        } catch (closureError) {
          failures.push(closureError);
        }
      }
      if (release) {
        try {
          await writeFile3(
            join8(lock, 'capture-unresolved.json'),
            JSON.stringify({
              schemaVersion: 1,
              pid: child?.pid,
              originalStartMs: policy.originalStartMs,
              originalDeadlineMs: policy.originalDeadlineMs,
              finalStartedMs: finalStarted,
              errorType: error instanceof Error ? error.name : 'unknown',
            }),
            { mode: 256, flag: 'wx' },
          );
        } catch (persistenceError) {
          failures.push(persistenceError);
        }
      }
      if (failures.length > 1) throw new AggregateError(failures, 'Original executor evidence unresolved');
      throw error;
    } finally {
      await originalOutput?.close();
      await stdout.close();
      await stderr.close();
      python.close();
      executable.close();
    }
  };
}

// plugins/terraform/src/legacy-installed-executor.ts
var retained = new Map();
function createLegacyInstalledTerraformExecutor(options) {
  const directory = options.directory;
  const inputs = freezeAdmittedCaptureInputs(options.inputs);
  const python = Object.freeze({ ...options.python });
  const executable = Object.freeze({ ...options.executable });
  let start;
  let active = false;
  return async (invocation) => {
    if (invocation.cwd !== directory) throw new Error('Original legacy Terraform workspace differs');
    if (
      !['version', 'init', 'validate', 'plan', 'show', 'output', 'apply'].includes(invocation.args[0]) ||
      invocation.args.includes('-auto-approve') ||
      (invocation.args[0] === 'apply' && invocation.args.at(-1) !== 'saved.tfplan')
    )
      throw new Error('Original legacy Terraform invocation is outside the owning runner');
    if (active) throw new Error('Original legacy Terraform invocation remains active');
    start ??= linuxMonotonicMs();
    if (linuxMonotonicMs() >= start + 7200000) throw new Error('Original legacy Terraform budget exhausted');
    active = true;
    const key = randomUUID5();
    let monitor;
    let completed = false;
    try {
      monitor = await monitorOriginalInputs(inputs);
      const guard = monitor.assertOriginal;
      const execute = signalFreeTerraformExecutor({
        python,
        executable,
        originalStartMs: start,
        originalDeadlineMs: start + 7200000,
        assertOriginal: guard,
        finalCapture: async (capture) => {
          await writeFile4(join9(dirname9(capture.stdoutPath), 'legacy-final.private.json'), JSON.stringify(capture), {
            flag: 'wx',
            mode: 256,
          });
        },
      });
      const result = await execute(invocation);
      completed = true;
      return result;
    } finally {
      if (completed) monitor?.close();
      else if (monitor) retained.set(key, monitor);
      active = !!monitor && !completed;
    }
  };
}

// plugins/terraform/src/provider-package.ts
import { createHash as createHash12 } from 'node:crypto';
import { lstat as lstat9, readdir as readdir2, readFile as readFile6, realpath as realpath8 } from 'node:fs/promises';
import { isAbsolute as isAbsolute10, join as join10, resolve as resolve10 } from 'node:path';

var digest3 = (bytes) => createHash12('sha256').update(bytes).digest('hex');
function lockEntries(raw) {
  if (Buffer.byteLength(raw) > 1024 * 1024) throw new Error('Bounded provider lock required');
  const tokens = [];
  for (let offset = 0; offset < raw.length; ) {
    const tail = raw.slice(offset);
    const skipped = /^(?:\s+|#[^\r\n]*|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/)/.exec(tail);
    if (skipped) {
      offset += skipped[0].length;
      continue;
    }
    const quoted = /^"(?:[^"\\\r\n]|\\.)*"/.exec(tail);
    if (quoted) {
      tokens.push({ kind: 'string', value: JSON.parse(quoted[0]) });
      offset += quoted[0].length;
      continue;
    }
    const word = /^[a-z][a-z_]*/.exec(tail);
    if (word) {
      tokens.push({ kind: 'word', value: word[0] });
      offset += word[0].length;
      continue;
    }
    if ('{}[]=,'.includes(tail[0])) {
      tokens.push({ kind: 'symbol', value: tail[0] });
      offset++;
      continue;
    }
    throw new Error('Unsupported provider lock grammar');
  }
  let position = 0;
  function take(kind, value) {
    const token = tokens[position++];
    if (!token || token.kind !== kind || (value !== undefined && token.value !== value))
      throw new Error('Malformed provider lock');
    return token.value;
  }
  const result = new Map();
  while (position < tokens.length) {
    take('word', 'provider');
    const source = take('string');
    if (result.has(source)) throw new Error('Unique provider lock entry required');
    take('symbol', '{');
    const fields = new Map();
    while (tokens[position]?.value !== '}') {
      const name = take('word');
      if (!['version', 'constraints', 'hashes'].includes(name) || fields.has(name))
        throw new Error('Unique supported provider lock fields required');
      take('symbol', '=');
      if (name === 'hashes') {
        take('symbol', '[');
        const hashes = [];
        while (tokens[position]?.value !== ']') {
          hashes.push(take('string'));
          if (tokens[position]?.value === ',') take('symbol', ',');
          else if (tokens[position]?.value !== ']') throw new Error('Malformed provider lock hashes');
        }
        take('symbol', ']');
        fields.set(name, hashes);
      } else fields.set(name, take('string'));
    }
    take('symbol', '}');
    const version = fields.get('version'),
      hashes = fields.get('hashes');
    if (typeof version !== 'string' || !Array.isArray(hashes) || !hashes.length)
      throw new Error('Provider lock version and hashes required');
    result.set(source, { version, hashes });
  }
  return result;
}
async function verifyProviderPackage(request) {
  const { directory, source, version, platform, executable, lock, lockSha256 } = request;
  if (platform !== 'darwin_arm64' && platform !== 'linux_amd64')
    throw new Error('Provider package platform is not qualified');
  if (!/^registry\.terraform\.io\/[a-z0-9-]+\/[a-z0-9-]+$/.test(source) || !/^\d+\.\d+\.\d+$/.test(version))
    throw new Error('Exact provider source and version required');
  const name = source.split('/')[2];
  if (
    ![
      `terraform-provider-${name}_v${version}`,
      ...Array.from({ length: 10 }, (_, n) => `terraform-provider-${name}_v${version}_x${n}`),
    ].includes(executable)
  )
    throw new Error('Exact provider executable identity required');
  if (!/^[a-f0-9]{64}$/.test(lockSha256) || digest3(lock) !== lockSha256)
    throw new Error('Reviewed provider lock changed');
  const entry = lockEntries(lock).get(source);
  if (!entry) throw new Error('Unique matching provider lock entry required');
  if (entry.version !== version) throw new Error('Provider lock version differs');
  const root = await lstat9(directory);
  if (
    !isAbsolute10(directory) ||
    resolve10(directory) !== directory ||
    (await realpath8(directory)) !== directory ||
    !root.isDirectory() ||
    root.isSymbolicLink() ||
    root.uid !== process.getuid?.()
  )
    throw new Error('Canonical original provider package required');
  const files = [];
  async function inventory(relative) {
    const parent = relative ? join10(directory, relative) : directory;
    for (const child of (await readdir2(parent)).sort()) {
      if (!/^[A-Za-z0-9_.-]+$/.test(child) || child === '.' || child === '..')
        throw new Error('Safe provider package file name required');
      const path = relative ? `${relative}/${child}` : child;
      const info = await lstat9(join10(directory, path));
      if (
        info.isSymbolicLink() ||
        info.uid !== process.getuid?.() ||
        (!info.isDirectory() && (!info.isFile() || info.nlink !== 1))
      )
        throw new Error('Original single-link provider package files required');
      if (info.isDirectory()) {
        if (path.split('/').length > 8) throw new Error('Bounded provider package depth required');
        await inventory(path);
      } else {
        files.push(path);
        if (files.length > 1024) throw new Error('Bounded provider package inventory required');
      }
    }
  }
  await inventory('');
  files.sort();
  if (!files.includes(executable)) throw new Error('Original provider executable unavailable');
  const filesSha256 = {};
  let total = 0;
  for (const file of files) {
    const path = join10(directory, file),
      before = await lstat9(path);
    total += before.size;
    if (before.size > 512 * 1024 * 1024 || total > 1024 * 1024 * 1024)
      throw new Error('Bounded provider package bytes required');
    const bytes = await readFile6(path),
      after = await lstat9(path);
    if (
      !after.isFile() ||
      after.isSymbolicLink() ||
      after.nlink !== 1 ||
      before.ino !== after.ino ||
      before.dev !== after.dev ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs ||
      bytes.length !== before.size ||
      after.size !== before.size ||
      after.uid !== process.getuid?.()
    )
      throw new Error('Original provider package changed during inspection');
    if (file === executable) {
      const architectureMatches =
        platform === 'darwin_arm64'
          ? bytes.length >= 32 &&
            bytes.readUInt32LE(0) === 4277009103 &&
            bytes.readUInt32LE(4) === 16777228 &&
            bytes.readUInt32LE(12) === 2
          : bytes.length >= 64 &&
            bytes.readUInt32LE(0) === 1179403647 &&
            bytes[4] === 2 &&
            bytes[5] === 1 &&
            bytes[6] === 1 &&
            [2, 3].includes(bytes.readUInt16LE(16)) &&
            bytes.readUInt16LE(18) === 62 &&
            bytes.readUInt32LE(20) === 1 &&
            bytes.readUInt16LE(52) === 64;
      if (!architectureMatches || !(after.mode & 73))
        throw new Error(`Provider executable architecture differs from ${platform}`);
    }
    filesSha256[file] = digest3(bytes);
  }
  const summary = files
    .map(
      (file) => `${filesSha256[file]}  ${file}
`,
    )
    .join('');
  const packageHash = `h1:${createHash12('sha256').update(summary).digest('base64')}`;
  if (!entry.hashes.includes(packageHash)) throw new Error('Provider contents differ from locked package');
  const firstInventory = JSON.stringify(files);
  files.splice(0);
  await inventory('');
  if (JSON.stringify(files.sort()) !== firstInventory) throw new Error('Original provider package inventory changed');
  return { source, version, platform, packageHash, executableSha256: filesSha256[executable], filesSha256 };
}

// plugins/terraform/src/installed-runtime.ts
var hash9 = (raw) => createHash13('sha256').update(raw).digest('hex');
var installer = join11(import.meta.dir, '../scripts/install_runtime.py');
var modeName = 'google-runtime-mode.json';
var retainedInspectionMonitors = new Map();

class InstalledTerraformSetupRequired extends Error {
  constructor() {
    super('Install and set up the Terraform plugin observer runtime before selecting GCP Terraform');
  }
}

class InstalledCaptureSourcesUnavailable extends Error {
  constructor() {
    super('Verified Terraform plugin capture sources are missing or changed; reinstall the plugin');
  }
}
async function inspectInstalledCaptureScripts(directory = join11(import.meta.dir, '../scripts')) {
  try {
    const parent = await lstat10(directory);
    if (
      !isAbsolute11(directory) ||
      resolve11(directory) !== directory ||
      (await realpath9(directory)) !== directory ||
      !parent.isDirectory() ||
      parent.isSymbolicLink() ||
      parent.uid !== process.getuid?.() ||
      (parent.mode & 18) !== 0 ||
      gcp_capture_source_pins_default.schemaVersion !== 1 ||
      gcp_capture_source_pins_default.kind !== 'gcp-original-capture-sources'
    )
      throw new InstalledCaptureSourcesUnavailable();
    const inputs = {};
    for (const [name, expected] of Object.entries(gcp_capture_source_pins_default.files)) {
      const actual = await owned(join11(directory, name));
      if (actual.binding.sha256 !== expected) throw new InstalledCaptureSourcesUnavailable();
      inputs[`script:${name}`] = actual.binding;
    }
    return freezeAdmittedCaptureInputs(inputs);
  } catch (error) {
    if (error instanceof InstalledCaptureSourcesUnavailable) throw error;
    throw new InstalledCaptureSourcesUnavailable();
  }
}
async function owned(path, maximum = 256 * 1024 * 1024) {
  if (!isAbsolute11(path) || resolve11(path) !== path || (await realpath9(path)) !== path)
    throw new Error('Canonical owned runtime input required');
  const before = await lstat10(path, { bigint: true });
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.uid !== BigInt(process.getuid?.() ?? -1) ||
    before.nlink !== 1n ||
    (before.mode & 0o022n) !== 0n ||
    before.size < 1n ||
    before.size > BigInt(maximum)
  )
    throw new Error('Owned original runtime input required');
  const handle = await open6(path, constants6.O_RDONLY | constants6.O_NOFOLLOW);
  try {
    const opened = await handle.stat({ bigint: true });
    const keys = ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'];
    if (keys.some((key) => opened[key] !== before[key])) throw new Error('Original runtime input changed during open');
    const bytes = await handle.readFile();
    const after = await lstat10(path, { bigint: true });
    if (keys.some((key) => after[key] !== before[key])) throw new Error('Original runtime input changed during read');
    const parent = await lstat10(dirname10(path), { bigint: true });
    return {
      bytes,
      binding: {
        path,
        sha256: hash9(bytes),
        expectedIdentity: Object.fromEntries(keys.map((key) => [key, before[key].toString()])),
        expectedParentIdentity: {
          dev: parent.dev.toString(),
          ino: parent.ino.toString(),
          uid: parent.uid.toString(),
          mode: parent.mode.toString(),
        },
      },
    };
  } finally {
    await handle.close();
  }
}
async function privateDirectory3(path) {
  if (!isAbsolute11(path) || resolve11(path) !== path) throw new Error('Canonical private runtime directory required');
  await mkdir5(path, { recursive: true, mode: 448 });
  const stat = await lstat10(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 511) !== 448 ||
    (await realpath9(path)) !== path
  )
    throw new Error('Original private runtime directory required');
}
function runtimeRoot(env) {
  return (
    env.XCSH_TERRAFORM_RUNTIME_DIR ?? join11(homedir2(), '.local/share/xcsh/terraform/runtime/python315-psutil722')
  );
}
async function assertInstalledRuntime(env = process.env) {
  const root = runtimeRoot(env);
  try {
    if (process.platform !== 'linux' || process.arch !== 'x64') throw new InstalledTerraformSetupRequired();
    const rootInfo = await lstat10(root);
    if (
      !rootInfo.isDirectory() ||
      rootInfo.isSymbolicLink() ||
      rootInfo.uid !== process.getuid?.() ||
      (rootInfo.mode & 511) !== 448 ||
      (await realpath9(root)) !== root
    )
      throw new InstalledTerraformSetupRequired();
    const python = join11(root, 'environment/bin/python3');
    const site = join11(root, 'environment/lib/python3.15/site-packages');
    const bindings = {};
    for (const [role, path, expected] of [
      ['python', python, installed_runtime_pins_default.pythonSha256],
      ['archive', join11(root, 'archive.whl'), installed_runtime_pins_default.wheelSha256],
      ['installer', installer, installed_runtime_pins_default.installerSha256],
    ]) {
      const actual = await owned(path);
      if (actual.binding.sha256 !== expected) throw new InstalledTerraformSetupRequired();
      bindings[role] = actual.binding;
    }
    const config = await owned(join11(root, 'environment/pyvenv.cfg'), 8192);
    const pairs = config.bytes
      .toString()
      .trim()
      .split(`
`)
      .map((line) => line.split(' = ', 2));
    if (pairs.some((pair) => pair.length !== 2)) throw new InstalledTerraformSetupRequired();
    const cfg = Object.fromEntries(pairs);
    if (
      cfg['include-system-site-packages'] !== 'false' ||
      cfg.version !== '3.15.0' ||
      cfg.home !== dirname10(cfg.executable)
    )
      throw new InstalledTerraformSetupRequired();
    const base = await owned(cfg.executable);
    if (base.binding.sha256 !== installed_runtime_pins_default.pythonSha256)
      throw new InstalledTerraformSetupRequired();
    bindings.config = config.binding;
    bindings.base = base.binding;
    const names = [];
    const walk = async (directory) => {
      for (const name of await readdir3(directory)) {
        const path = join11(directory, name),
          stat = await lstat10(path);
        if (stat.isSymbolicLink() || stat.uid !== process.getuid?.()) throw new InstalledTerraformSetupRequired();
        if (stat.isDirectory()) await walk(path);
        else names.push(path.slice(site.length + 1));
      }
    };
    await walk(site);
    if (
      JSON.stringify(names.sort()) !== JSON.stringify(Object.keys(installed_runtime_pins_default.sdkFilesSha256).sort())
    )
      throw new InstalledTerraformSetupRequired();
    for (const [name, expected] of Object.entries(installed_runtime_pins_default.sdkFilesSha256)) {
      const actual = await owned(join11(site, name));
      if (actual.binding.sha256 !== expected) throw new InstalledTerraformSetupRequired();
      bindings[`sdk:${name}`] = actual.binding;
    }
    bindings.review = (await owned(join11(root, 'review.json'), 65536)).binding;
    Object.assign(bindings, await inspectInstalledCaptureScripts());
    const monitor = await monitorOriginalInputs(bindings);
    let inspectionDirectory;
    let inspectionClosed = false;
    try {
      const inspection = join11(
        env.XDG_STATE_HOME ?? join11(homedir2(), '.local/state'),
        'xcsh/terraform/runtime-inspections',
        randomUUID6(),
      );
      await privateDirectory3(inspection);
      inspectionDirectory = inspection;
      const start = linuxMonotonicMs();
      const execute = signalFreeTerraformExecutor({
        python: { path: python, sha256: installed_runtime_pins_default.pythonSha256 },
        executable: { path: python, sha256: installed_runtime_pins_default.pythonSha256 },
        originalStartMs: start,
        originalDeadlineMs: start + 7200000,
        timeoutMs: 60000,
        assertOriginal: monitor.assertOriginal,
        finalCapture: async (capture) => {
          await writeFile5(join11(inspection, 'inspection-capture.private.json'), JSON.stringify(capture), {
            flag: 'wx',
            mode: 256,
          });
          if (!capture.originalGroupClosed || capture.actualExitCode === null)
            throw new Error('Runtime inspection closure unresolved');
          await monitor.assertOriginal();
          inspectionClosed = true;
        },
      });
      const result = await execute({
        cwd: inspection,
        args: ['-I', '-B', installer, '--runtime-dir', root, '--check', '--binding'],
        env: { PATH: '/usr/bin:/bin' },
      });
      if (result.code !== 0) throw new InstalledTerraformSetupRequired();
      const reported = JSON.parse(result.stdout);
      if (
        reported.pythonPath !== python ||
        reported.pythonSha256 !== installed_runtime_pins_default.pythonSha256 ||
        reported.sdkRoot !== site ||
        reported.sdkVersion !== '7.2.2' ||
        reported.wheelSha256 !== installed_runtime_pins_default.wheelSha256
      )
        throw new InstalledTerraformSetupRequired();
      await monitor.assertOriginal();
      return Object.freeze({ root, python, bindings: Object.freeze(bindings) });
    } finally {
      if (!inspectionDirectory || inspectionClosed) monitor.close();
      else retainedInspectionMonitors.set(inspectionDirectory, monitor);
    }
  } catch (error) {
    if (error instanceof InstalledTerraformSetupRequired) throw error;
    throw new InstalledTerraformSetupRequired();
  }
}
function selectedGoogleAccountSha256(environment = process.env) {
  const command = Bun.spawnSync(['gcloud', 'config', 'get-value', 'account', '--quiet'], {
    env: { ...environment },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const account = command.stdout.toString().trim();
  if (command.exitCode !== 0 || !account || account === '(unset)')
    throw new Error('Selected Google account unavailable');
  return hash9(account);
}
function createInstalledRuntimeResolver(environment = process.env, options = {}) {
  const env = { ...environment },
    captureFactory = options.capture;
  return async (request) => {
    const { owner, deployment, directory, platform, resume } = request;
    if (owner.provider !== 'gcp') return {};
    if (!/^[a-z][a-z0-9-]{0,62}$/.test(deployment.deploymentId))
      throw new Error('Original Terraform deployment identity required');
    const executionDirectory = join11(directory, deployment.deploymentId);
    const store = await platform.storage(owner);
    let mode;
    try {
      mode = JSON.parse((await owned(join11(directory, modeName), 65536)).bytes.toString());
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const existingDeployment = await Bun.file(join11(executionDirectory, 'deployment.json')).exists();
    if (!resume && existingDeployment) throw new Error('Existing deployment must resume its original runtime');
    const legacy = resume && !mode && existingDeployment;
    const runtime = await assertInstalledRuntime(env);
    const versionProfile = resolveInstalledGcpVersionProfile({
      terraformVersion: deployment.terraformVersion,
      providerLockSha256: hash9(deployment.providerLock),
    });
    const terraformBinding = await resolveInstalledTerraformExecutable(versionProfile, env);
    const terraformPath = terraformBinding.path;
    const terraformFile = { binding: terraformBinding };
    if (legacy) {
      return {
        execute: createLegacyInstalledTerraformExecutor({
          directory: executionDirectory,
          inputs: { ...runtime.bindings, terraform: terraformBinding },
          python: { path: runtime.python, sha256: runtime.bindings.python.sha256 },
          executable: { path: terraformBinding.path, sha256: terraformBinding.sha256 },
        }),
      };
    }
    const accountSha256 = selectedGoogleAccountSha256(env);
    const sourcePath =
      env.GOOGLE_APPLICATION_CREDENTIALS ??
      join11(env.CLOUDSDK_CONFIG ?? join11(homedir2(), '.config/gcloud'), 'application_default_credentials.json');
    const source = await owned(sourcePath, 65536);
    const credential = JSON.parse(source.bytes.toString());
    if (credential.type !== 'authorized_user' || typeof credential.client_id !== 'string')
      throw new Error('Qualified authorized-user ADC mapping required');
    const audienceSha256 = hash9(credential.client_id);
    const expectedMode = {
      schemaVersion: 1,
      kind: 'installed-google-adc-runtime',
      owner,
      providerLockSha256: hash9(deployment.providerLock),
      qualificationSha256: installed_runtime_pins_default.refreshQualificationSha256,
    };
    if (mode && fingerprint(mode) !== fingerprint(expectedMode))
      throw new Error('Original installed runtime mode changed');
    await privateDirectory3(directory);
    if (!mode) await writeFile5(join11(directory, modeName), JSON.stringify(expectedMode), { flag: 'wx', mode: 256 });
    let monitor;
    let providers;
    let providerInputs;
    let executor;
    const planSource = versionProfile.terraformVersion === '1.17.2' ? 'gcp-resource-plan-v1' : undefined;
    const sourceExpectation = Object.freeze({
      directory: executionDirectory,
      engine: 'terraform',
      deploymentId: owner.deploymentId,
      scope: Object.freeze({ cloud: 'gcp', account: owner.account, region: owner.region }),
      terraformVersion: versionProfile.terraformVersion,
      backendIdentity: deployment.backendIdentity,
    });
    const originalCreationQualified =
      versionProfile.terraformVersion === '1.17.2' &&
      versionProfile.googleVersion === '8.11.0' &&
      versionProfile.xcshVersion === '15.16.1' &&
      versionProfile.xcProviderSha256 === 'd9bdc18d928ac960c72275e0435477f8c98db1ad6e5ce64b8c4e9262ae6ef5d8';
    let preparedCreationScope;
    let originalPlanSource;
    let compileInvocation;
    let capture;
    let prepareCapture;
    let active = 0;
    const groups = [];
    let originalEnvironment;
    const close = async () => {
      if (active) throw new Error('Original installed executor remains in flight');
      for (const group of groups) await assertExecutorGroupClosed(group);
      if (await Bun.file(join11(executionDirectory, '.terraform-executor-lock/capture-unresolved.json')).exists())
        throw new Error('Original installed capture remains unresolved');
      await capture?.closeAfterExecutorExit();
      closePreparedCreationScope(preparedCreationScope);
      providers?.close();
      monitor?.close();
    };
    const googleAdc = {
      closeFailedAcquisition: close,
      accountSha256,
      audienceSha256,
      qualificationSha256: installed_runtime_pins_default.refreshQualificationSha256,
      acquire: async () => {
        await store.verify();
        const currentSource = await owned(sourcePath, 65536);
        assertSameOriginalInput(source.binding, currentSource.binding);
        const snapshotPath = join11(directory, `google-adc-${randomUUID6()}.private.json`);
        await writeFile5(snapshotPath, currentSource.bytes, { flag: 'wx', mode: 256 });
        const saved = await store.read('gcp-terraform-input-identity.json');
        if (
          !saved.intent ||
          saved.intent.project !== owner.account ||
          saved.intent.region !== owner.region ||
          saved.intent.deploymentName !== owner.deploymentId ||
          saved.intent.engine !== owner.engine ||
          saved.intentFingerprint !== fingerprint(saved.intent) ||
          saved.intent.platformContext !== saved.platformContext ||
          !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/.test(saved.platformContext)
        )
          throw new Error('Original GCP platform context and ownership differ');
        const configPath = join11(
          env.XDG_CONFIG_HOME ?? join11(homedir2(), '.config'),
          'xcsh/contexts',
          `${saved.platformContext}.json`,
        );
        const context = JSON.parse((await owned(configPath, 65536)).bytes.toString());
        const url = new URL(context.apiUrl);
        if (
          url.protocol !== 'https:' ||
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          typeof context.apiToken !== 'string' ||
          !context.apiToken
        )
          throw new Error('Original selected Platform credential unavailable');
        originalEnvironment = { XCSH_API_URL: url.origin, XCSH_API_TOKEN: context.apiToken };
        const environmentPath = join11(directory, `platform-environment-${randomUUID6()}.private.json`);
        await writeFile5(environmentPath, JSON.stringify(originalEnvironment), { flag: 'wx', mode: 256 });
        const bindings = {
          ...runtime.bindings,
          terraform: terraformFile.binding,
        };
        for (const name of [
          'main.tf.json',
          '.terraform.lock.hcl',
          'deployment.json',
          'deployment.tfrc',
          modeName,
          'gcp-terraform-input-identity.json',
        ]) {
          const path =
            name === 'gcp-terraform-input-identity.json'
              ? join11(store.directory, name)
              : name === modeName
                ? join11(directory, name)
                : join11(executionDirectory, name);
          bindings[`workspace:${name}`] = (await owned(path)).binding;
        }
        const invocationEnvironment = selectInstalledGcpEnvironment({
          ...env,
          HOME: env.HOME ?? homedir2(),
          PATH: env.PATH ?? process.env.PATH,
          GOOGLE_APPLICATION_CREDENTIALS: snapshotPath,
          ...originalEnvironment,
        });
        const invocationEnvironmentPath = join11(directory, `runtime-environment-${randomUUID6()}.private.json`);
        await writeFile5(invocationEnvironmentPath, JSON.stringify(invocationEnvironment), { flag: 'wx', mode: 256 });
        bindings.runtimeEnvironment = (await owned(invocationEnvironmentPath)).binding;
        compileInvocation = createInstalledGcpInvocationCompiler({
          directory: executionDirectory,
          environment: invocationEnvironment,
          ...(originalCreationQualified ? { readPreparedCreationScope: () => preparedCreationScope } : {}),
        });
        bindings.adc = (await owned(snapshotPath)).binding;
        bindings.platform = (await owned(environmentPath)).binding;
        monitor = await monitorOriginalInputs(bindings);
        const start = linuxMonotonicMs(),
          deadline = start + 7200000;
        const inputChecks = createInstalledCaptureInputChecks({
          verifyStore: () => store.verify(),
          monitors: () => {
            if (!monitor) throw new Error('Original installed input monitor unavailable');
            return providers ? [monitor, providers] : [monitor];
          },
          budget: { start, deadline },
          clock: linuxMonotonicMs,
        });
        const assertInputs = inputChecks.assertInputs;
        const assertWithinDeadline = inputChecks.assertWithinDeadline;
        const assertOriginal = async () => {
          await assertWithinDeadline();
          if (preparedCreationScope) await assertPreparedCreationScope(preparedCreationScope);
          await capture?.assertOriginal();
        };
        try {
          const authenticated = await authenticateGoogleAdc({
            credentialBytes: currentSource.bytes,
            project: owner.account,
            accountSha256,
            audienceSha256,
            assertOriginal,
          });
          await writeFile5(
            join11(directory, `google-authentication-${randomUUID6()}.private.json`),
            JSON.stringify(authenticated),
            { flag: 'wx', mode: 256 },
          );
          const captureContext = createInstalledCaptureContext({
            ...(planSource
              ? { readOriginalPlanSource: () => readOriginalTerraformPlanSource(originalPlanSource, sourceExpectation) }
              : {}),
            authentication: {
              accountSha256: authenticated.accountSha256,
              audienceSha256: authenticated.audienceSha256,
              snapshotSha256: authenticated.snapshotSha256,
            },
            owner,
            executionDirectory,
            budget: { start, deadline },
            environment: { GOOGLE_APPLICATION_CREDENTIALS: snapshotPath, ...originalEnvironment },
            inputs: bindings,
            assertInputs: inputChecks.assertCaptureInputs,
            assertWithinDeadline: inputChecks.assertCaptureWithinDeadline,
            readProviderInputs: async () => {
              if (!providers || !providerInputs) throw new Error('Original capture provider packages are not admitted');
              await providers.assertOriginal();
              return providerInputs;
            },
          });
          const worker = captureFactory?.(request, captureContext);
          capture = worker
            ? createInstalledApplyController(captureContext, worker, {
                persist: async (event) => {
                  const handle = await open6(
                    join11(directory, `google-original-apply-${randomUUID6()}.private.json`),
                    'wx',
                    256,
                  );
                  try {
                    await handle.writeFile(JSON.stringify(event));
                    await handle.sync();
                  } finally {
                    await handle.close();
                  }
                },
              })
            : undefined;
          const captureInvocations = new InstalledCaptureInvocations();
          const verifyCaptureGroup = async (record) => {
            const rows = {};
            for (const [name, input] of Object.entries(record.groupInputs)) {
              const current = await owned(input.path);
              assertSameOriginalInput(input, current.binding);
              rows[name] = JSON.parse(current.bytes.toString());
            }
            for (const row of Object.values(rows)) {
              if (
                row.schemaVersion !== 2 ||
                row.pid !== record.identity.pid ||
                row.group !== record.identity.group ||
                row.bootId !== record.identity.boot ||
                row.processStartTicks !== record.identity.start
              )
                throw new Error('Original installed executor group identity differs');
            }
            if (rows.claim.token !== rows.lifetime.token)
              throw new Error('Original installed executor group token differs');
          };
          const bindProviders = async () => {
            if (providers) return;
            const providerBindings = {};
            for (const [sourceName, version, executableName, expectedSha] of [
              [
                'registry.terraform.io/hashicorp/google',
                versionProfile.googleVersion,
                `terraform-provider-google_v${versionProfile.googleVersion}_x5`,
                versionProfile.googleProviderSha256,
              ],
              [
                'registry.terraform.io/f5-sales-demo/xcsh',
                versionProfile.xcshVersion,
                `terraform-provider-xcsh_v${versionProfile.xcshVersion}`,
                versionProfile.xcProviderSha256,
              ],
            ]) {
              const path = join11(executionDirectory, '.terraform/providers', sourceName, version, 'linux_amd64');
              const verified = await verifyProviderPackage({
                directory: path,
                source: sourceName,
                version,
                executable: executableName,
                platform: 'linux_amd64',
                lock: deployment.providerLock,
                lockSha256: hash9(deployment.providerLock),
              });
              if (verified.executableSha256 !== expectedSha)
                throw new Error('Original qualified provider executable changed');
              for (const [name, expected] of Object.entries(verified.filesSha256)) {
                const file = await owned(join11(path, name));
                if (file.binding.sha256 !== expected) throw new Error('Original provider package changed');
                providerBindings[`${sourceName}:${name}`] = file.binding;
              }
            }
            providers = await monitorOriginalInputs(providerBindings);
            providerInputs = freezeAdmittedCaptureInputs(providerBindings);
          };
          prepareCapture = async () => {
            if (!capture) throw new Error('Original GCP guest capture controller is not qualified');
            await bindProviders();
            await capture.prepare?.(captureContext);
            if (originalCreationQualified) {
              preparedCreationScope = await prepareOriginalCreationScope(captureContext);
              await assertPreparedCreationScope(preparedCreationScope);
            }
          };
          executor = signalFreeTerraformExecutor({
            python: { path: runtime.python, sha256: installed_runtime_pins_default.pythonSha256 },
            executable: { path: terraformPath, sha256: versionProfile.terraformSha256 },
            originalStartMs: start,
            originalDeadlineMs: deadline,
            assertOriginal,
            assertOriginalIdentity: async () => {
              await inputChecks.assertCaptureWithinDeadline();
              if (preparedCreationScope) await assertPreparedCreationScope(preparedCreationScope);
              await capture?.assertOriginal();
            },
            assertFinalInputs: assertInputs,
            beforeRelease: async (admission) => {
              const currentGroup = join11(directory, 'google-runtime-groups', randomUUID6());
              await privateDirectory3(currentGroup);
              for (const name of ['claim.json', 'lifetime.json'])
                await writeFile5(
                  join11(currentGroup, name),
                  await readFile7(join11(executionDirectory, '.terraform-executor-lock', name)),
                  { flag: 'wx', mode: 256 },
                );
              groups.push(currentGroup);
              const groupInputs = {};
              for (const name of ['claim', 'lifetime'])
                groupInputs[name] = (await owned(join11(currentGroup, `${name}.json`))).binding;
              const originalCapture = captureInvocations.admit({
                identity: admission.identity,
                budget: { start: admission.originalStartMs, deadline: admission.originalDeadlineMs },
                groupDirectory: currentGroup,
                groupInputs,
                capture: admission.args[0] === 'apply' ? capture : undefined,
              });
              await verifyCaptureGroup(originalCapture);
              if (!['version', 'init'].includes(admission.args[0])) await bindProviders();
              if (admission.args[0] === 'apply') {
                if (!capture) throw new Error('Original GCP guest capture controller is not qualified');
                await capture.start(admission);
              }
            },
            finalCapture: async (finished) =>
              finalizeInstalledCapture(captureInvocations, finished, {
                persist: async (value) => {
                  const resultPath = join11(directory, `google-runtime-final-${randomUUID6()}.private.json`);
                  await writeFile5(resultPath, JSON.stringify(value), { flag: 'wx', mode: 256 });
                },
                verify: verifyCaptureGroup,
                assertInputs,
              }),
          });
          return {
            schemaVersion: 1,
            kind: 'google-adc-snapshot',
            owner,
            snapshotPath,
            snapshotSha256: hash9(currentSource.bytes),
            accountSha256,
            audienceSha256,
            authenticationReceiptSha256: authenticated.authenticationReceiptSha256,
            qualificationSha256: installed_runtime_pins_default.refreshQualificationSha256,
            verifiedAt: authenticated.verifiedAt,
            expiresNoEarlierThan: authenticated.expiresNoEarlierThan,
            assertOriginal,
            closeAfterExecutorExit: close,
          };
        } catch (error) {
          await close();
          throw error;
        }
      },
    };
    const execute = async (invocation) => {
      if (invocation.cwd !== executionDirectory) throw new Error('Original Terraform execution directory changed');
      if (!executor || !originalEnvironment || !compileInvocation)
        throw new Error('Original installed ADC lease has not been acquired');
      if (
        invocation.env.XCSH_API_URL !== originalEnvironment.XCSH_API_URL ||
        invocation.env.XCSH_API_TOKEN !== originalEnvironment.XCSH_API_TOKEN
      )
        throw new Error('Original selected Platform environment changed');
      if (!['version', 'init', 'validate', 'plan', 'show', 'output', 'apply'].includes(invocation.args[0]))
        throw new Error('Installed Terraform invocation is outside the owning runner');
      active++;
      try {
        if (invocation.args[0] === 'apply') {
          if (planSource) {
            if (originalPlanSource) throw new Error('Original owning plan source cannot admit another apply actor');
            await readOriginalTerraformPlanSource(invocation.originalPlanSource, sourceExpectation);
            originalPlanSource = invocation.originalPlanSource;
          }
          if (!prepareCapture) throw new Error('Original installed capture preparation unavailable');
          await prepareCapture();
          if (preparedCreationScope) await assertPreparedCreationScope(preparedCreationScope);
        }
        return await executor(compileInvocation(invocation));
      } finally {
        active--;
      }
    };
    return {
      googleAdc,
      execute,
      ...(planSource ? { planSource } : {}),
      assertApplyReady: async () => {
        if (!captureFactory) throw new Error('Original GCP guest capture controller is not qualified');
        await store.verify();
      },
    };
  };
}

// plugins/terraform/src/installed-xcsh-creation-reader.ts
var hash10 = (raw) => createHash14('sha256').update(raw).digest('hex');
var terraformHash = 'dbfef0be43ba2117481be510d3b83a2d8cdfa6ae7ec69c5aeb04b3947956ff7e';
var providerHash = '542d99d1905fe03fadce8a889390751b3ad1531f367ef678cf03d97204ef7cc1';
var origins = new WeakMap();
var openings = new WeakSet();
var object6 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed original xcsh evidence');
  return value;
};
var sameKeys = (value, keys) => Object.keys(value).sort().join(',') === [...keys].sort().join(',');
var sameActor = (value, actor) => {
  if (!value || typeof value !== 'object' || !actor) return false;
  const row = object6(value);
  return (
    sameKeys(row, ['pid', 'group', 'start', 'boot']) &&
    ['pid', 'group', 'start', 'boot'].every((key) => row[key] === actor[key])
  );
};
async function readOriginalInstalledXcshCreation(result) {
  const read = origins.get(result);
  if (!read) throw new Error('An original installed xcsh result is required');
  return read();
}
async function openInstalledXcshCreationReader(context, input, packet, options = {}) {
  if (options.clock && !options.executorFactory) throw new Error('Offline clock requires explicit fixture executor');
  assertPreparedCreationScopeContext(packet, context);
  const clock = options.clock ?? linuxMonotonicMs;
  const admission = Object.freeze({
    ...input,
    identity: Object.freeze({ ...input.identity }),
    args: Object.freeze([...input.args]),
  });
  if (
    context.schemaVersion !== 2 ||
    context.kind !== 'original-installed-gcp-capture-context' ||
    context.owner.provider !== 'gcp' ||
    context.owner.engine !== 'terraform' ||
    input.directory !== context.executionDirectory ||
    input.args[0] !== 'apply' ||
    input.originalStartMs !== context.budget.start ||
    input.originalDeadlineMs !== context.budget.deadline ||
    context.budget.deadline - context.budget.start !== 7200000 ||
    !Number.isSafeInteger(input.identity.pid) ||
    input.identity.pid <= 0 ||
    input.identity.group !== input.identity.pid ||
    !/^[1-9][0-9]*$/.test(input.identity.start) ||
    !/^[a-f0-9-]{36}$/.test(input.identity.boot)
  )
    throw new Error('Trusted original xcsh capture admission required');
  if (openings.has(packet)) throw new Error('Original xcsh reader scope already opened');
  openings.add(packet);
  await context.assertWithinDeadline();
  await context.assertInputs();
  const scope = await inspectPreparedCreationScope(packet);
  if (
    !scope.scope ||
    !scope.provider ||
    !scope.scopeFile ||
    !scope.directory ||
    !scope.resources.length ||
    scope.provider.sha256 !== providerHash ||
    context.inputs.python?.sha256 !== installed_runtime_pins_default.pythonSha256 ||
    context.inputs.terraform?.sha256 !== terraformHash
  )
    throw new Error('Qualified original xcsh creation scope and binaries required');
  const scopeBinding = scope.scope;
  const inputs = freezeAdmittedCaptureInputs({
    ...context.inputs,
    ...(await context.readProviderInputs()),
    'prepared:scope': scope.scope,
  });
  const entry = inputs['script:xcsh_creation_reader.py'];
  if (
    !entry ||
    Object.entries(gcp_capture_source_pins_default.files).some(
      ([name, expected]) =>
        inputs[`script:${name}`]?.path !== join12(dirname11(entry.path), name) ||
        inputs[`script:${name}`]?.sha256 !== expected,
    )
  )
    throw new Error('All shipped original xcsh reader sources required');
  const root = join12(context.executionDirectory, `xcsh-creation-readers-${randomUUID7()}`);
  await mkdir6(root, { mode: 448 });
  const rootIdentity = await lstat11(root, { bigint: true });
  const monitors = [];
  let retired = false;
  let readerActor;
  let closure;
  const assertDirectory = async () => {
    const actual = await lstat11(root, { bigint: true });
    if (
      !actual.isDirectory() ||
      actual.dev !== rootIdentity.dev ||
      actual.ino !== rootIdentity.ino ||
      actual.uid !== rootIdentity.uid ||
      actual.mode !== rootIdentity.mode ||
      (await realpath10(root)) !== root
    )
      throw new Error('Original xcsh reader directory changed');
  };
  const assertOriginal = async () => {
    if (retired) throw new Error('Original xcsh reader retired');
    assertPreparedCreationScopeContext(packet, context);
    await assertPreparedCreationScopeInputs(packet);
    await context.assertInputs();
    await assertDirectory();
    for (const monitor of monitors) await monitor.assertOriginal();
    const nowProviders = freezeAdmittedCaptureInputs({
      ...context.inputs,
      ...(await context.readProviderInputs()),
      'prepared:scope': scopeBinding,
    });
    if (JSON.stringify(nowProviders) !== JSON.stringify(inputs))
      throw new Error('Original xcsh reader input set changed');
    await context.assertInputs();
  };
  const guard = async () => {
    await assertOriginal();
    await context.assertWithinDeadline();
    if (clock() < context.budget.start || clock() >= context.budget.deadline)
      throw new Error('Original xcsh reader budget exhausted');
  };
  const persist = async (path, raw) => {
    const handle = await open7(path, 'wx', 256);
    try {
      await handle.writeFile(raw);
      await handle.sync();
    } finally {
      await handle.close();
    }
    const directory = await open7(dirname11(path), 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
    return (await owned(path, 65536)).binding;
  };
  const startupDeadline = Math.min(admission.startupDeadlineMs, clock() + 15000, context.budget.deadline);
  const request = {
    schemaVersion: 1,
    kind: 'original-xcsh-creation-window',
    originalStartMs: context.budget.start,
    deadlineMs: context.budget.deadline,
    windowMs: 45000,
    startupDeadlineMs: startupDeadline,
    executor: admission.identity,
    executables: {
      bootstrap: { path: inputs.python.path, sha256: installed_runtime_pins_default.pythonSha256 },
      terraform: { path: inputs.terraform.path, sha256: terraformHash },
      xcsh: { path: scope.provider.path, sha256: providerHash },
    },
    inputs,
    scope: {
      path: scope.scopeFile,
      sha256: scope.scope.sha256,
      planSha256: scope.planSha256,
      targets: scope.resources,
    },
  };
  const bytes = Buffer.from(JSON.stringify(request)),
    requestHash = hash10(bytes),
    requestPath = join12(root, 'request.private.json');
  const requestBinding = await persist(requestPath, bytes);
  monitors.push(await monitorOriginalInputs({ request: requestBinding }));
  const readyState = Promise.withResolvers();
  readyState.promise.catch(() => {});
  const baseKeys = [
    'schemaVersion',
    'requestSha256',
    'executor',
    'reader',
    'scopeSha256',
    'scopeFileSha256',
    'windowStartedMs',
    'windowDeadlineMs',
    'executionAuthorized',
    'signalsSent',
    'cloudSubmissions',
  ];
  const inspectBase = (value, reader, ready) => {
    const { windowStartedMs: began, windowDeadlineMs: ended } = value;
    if (
      value.schemaVersion !== 1 ||
      value.requestSha256 !== requestHash ||
      !sameActor(value.executor, admission.identity) ||
      !sameActor(value.reader, reader) ||
      value.scopeSha256 !== scope.planSha256 ||
      value.scopeFileSha256 !== scopeBinding.sha256 ||
      !Number.isSafeInteger(began) ||
      began < context.budget.start ||
      began > clock() ||
      ended !== Math.min(began + 45000, context.budget.deadline) ||
      (ready && (began !== ready.windowStartedMs || ended !== ready.windowDeadlineMs)) ||
      value.executionAuthorized !== false ||
      value.signalsSent !== false ||
      value.cloudSubmissions !== 0
    )
      throw new Error('Original xcsh reader attribution differs');
  };
  const policy = {
    python: { path: inputs.python.path, sha256: installed_runtime_pins_default.pythonSha256 },
    executable: { path: inputs.python.path, sha256: installed_runtime_pins_default.pythonSha256 },
    originalStartMs: context.budget.start,
    originalDeadlineMs: context.budget.deadline,
    timeoutMs: 60000,
    assertOriginal: guard,
    beforeRelease: async (admitted) => {
      readerActor = Object.freeze({ ...admitted.identity });
    },
    finalCapture: async (capture) => {
      await persist(join12(root, 'reader-capture.private.json'), Buffer.from(JSON.stringify(capture)));
      if (
        !sameActor(capture.identity, readerActor) ||
        capture.pid !== readerActor?.pid ||
        capture.actualExitCode !== 0 ||
        !capture.originalGroupClosed ||
        capture.reason ||
        capture.signalsSent !== false ||
        capture.originalDeadlineMs !== context.budget.deadline
      )
        throw new Error('Original xcsh reader closure incomplete');
      closure = capture;
      await guard();
    },
  };
  let terminal = false;
  const pending = Promise.resolve().then(() => {
    const execute = options.executorFactory ? options.executorFactory(policy) : signalFreeTerraformExecutor(policy);
    return execute({
      cwd: root,
      args: ['-I', '-B', entry.path, '--request', requestPath, '--sha256', requestHash],
      env: { PATH: '/usr/bin:/bin' },
    });
  });
  pending.then(
    () => {
      terminal = true;
    },
    () => {
      terminal = true;
    },
  );
  const completed = (async () => {
    try {
      const path = join12(root, 'xcsh-ready.private.json');
      while (
        !(await owned(path, 65536).then(
          () => true,
          (error) => {
            if (error.code === 'ENOENT') return false;
            throw error;
          },
        ))
      ) {
        await guard();
        if (terminal) {
          await pending;
          throw new Error('Original xcsh reader startup incomplete');
        }
        if (clock() >= startupDeadline) throw new Error('Original xcsh reader startup incomplete');
        await Bun.sleep(25);
      }
      await guard();
      const readyFile = await owned(path, 65536),
        readyValue = decodeEvidenceObject(readyFile.bytes);
      if (
        !readerActor ||
        !sameKeys(readyValue, [...baseKeys, 'kind']) ||
        readyValue.kind !== 'original-xcsh-creation-ready' ||
        Number(readyFile.binding.expectedIdentity?.mode) % 512 !== 256 ||
        clock() >= startupDeadline
      )
        throw new Error('Original private xcsh readiness required');
      inspectBase(readyValue, readerActor);
      monitors.push(await monitorOriginalInputs({ ready: readyFile.binding }));
      const ready = Object.freeze({
        kind: 'original-xcsh-creation-ready',
        executor: admission.identity,
        reader: readerActor,
        windowStartedMs: readyValue.windowStartedMs,
        windowDeadlineMs: readyValue.windowDeadlineMs,
        evidencePath: path,
        evidenceSha256: hash10(readyFile.bytes),
      });
      readyState.resolve(ready);
      const outcome = await pending;
      if (outcome.code !== 0 || !closure) throw new Error('Original xcsh reader did not close successfully');
      await guard();
      const resultPath = join12(root, 'xcsh-result.private.json'),
        resultFile = await owned(resultPath, 65536);
      const value = decodeEvidenceObject(resultFile.bytes);
      if (
        !sameKeys(value, [
          ...baseKeys,
          'kind',
          'finishedMs',
          'complete',
          'targetCount',
          'witnessCount',
          'incompletePids',
          'receipts',
        ]) ||
        value.kind !== 'original-xcsh-creation-result' ||
        Number(resultFile.binding.expectedIdentity?.mode) % 512 !== 256 ||
        typeof value.complete !== 'boolean' ||
        value.targetCount !== scope.resources.length ||
        !Number.isSafeInteger(value.witnessCount) ||
        value.witnessCount < 0 ||
        value.witnessCount > 128 ||
        !Number.isSafeInteger(value.finishedMs) ||
        value.finishedMs < ready.windowStartedMs ||
        value.finishedMs > clock() ||
        value.finishedMs > ready.windowDeadlineMs + 15000 ||
        !Array.isArray(value.incompletePids) ||
        value.incompletePids.length > 128 ||
        value.incompletePids.some((pid) => !Number.isSafeInteger(pid) || pid <= 0) ||
        new Set(value.incompletePids).size !== value.incompletePids.length ||
        !Array.isArray(value.receipts) ||
        (value.complete ? value.receipts.length !== scope.resources.length : value.receipts.length !== 0)
      )
        throw new Error('Original xcsh creation result incomplete or malformed');
      inspectBase(value, readerActor, ready);
      const targets = new Set(
        scope.resources.map((target) => JSON.stringify([target.type_name, target.namespace, target.name])),
      );
      const identities = new Set(),
        nonces = new Set();
      for (const raw of value.receipts) {
        const receipt = object6(raw),
          target = object6(receipt.target),
          actor = object6(receipt.process);
        const key = JSON.stringify([target.type_name, target.namespace, target.name]);
        if (
          !sameKeys(receipt, [
            'schema_version',
            'scope_sha256',
            'scope_file_sha256',
            'target',
            'process',
            'nonce',
            'creation_identity_sha256',
          ]) ||
          receipt.schema_version !== 1 ||
          receipt.scope_sha256 !== scope.planSha256 ||
          receipt.scope_file_sha256 !== scopeBinding.sha256 ||
          !sameKeys(target, ['type_name', 'namespace', 'name']) ||
          !targets.delete(key) ||
          typeof receipt.nonce !== 'string' ||
          !/^[a-f0-9]{32}$/.test(receipt.nonce) ||
          nonces.has(receipt.nonce) ||
          typeof receipt.creation_identity_sha256 !== 'string' ||
          !/^[a-f0-9]{64}$/.test(receipt.creation_identity_sha256) ||
          identities.has(receipt.creation_identity_sha256) ||
          !sameKeys(actor, [
            'pid',
            'parent_pid',
            'start_ticks',
            'boot_id_sha256',
            'executable_sha256',
            'executable_device',
            'executable_inode',
          ]) ||
          !Number.isSafeInteger(actor.pid) ||
          actor.pid <= 0 ||
          actor.parent_pid !== admission.identity.pid ||
          typeof actor.start_ticks !== 'string' ||
          !/^[1-9][0-9]*$/.test(actor.start_ticks) ||
          actor.executable_sha256 !== providerHash ||
          actor.boot_id_sha256 !==
            hash10(
              Buffer.from(`${admission.identity.boot}
`),
            ) ||
          !Number.isSafeInteger(actor.executable_device) ||
          actor.executable_device <= 0 ||
          !Number.isSafeInteger(actor.executable_inode) ||
          actor.executable_inode <= 0
        )
          throw new Error('Original xcsh creation receipt join differs');
        identities.add(receipt.creation_identity_sha256);
        nonces.add(receipt.nonce);
      }
      if (value.complete && targets.size) throw new Error('Original xcsh scope target coverage differs');
      monitors.push(await monitorOriginalInputs({ result: resultFile.binding }));
      await assertOriginal();
      const result = Object.freeze({
        kind: 'original-xcsh-creation-result',
        executor: admission.identity,
        reader: readerActor,
        complete: value.complete,
        targetCount: scope.resources.length,
        evidencePath: resultPath,
        evidenceSha256: hash10(resultFile.bytes),
      });
      origins.set(result, async () => {
        await assertOriginal();
        const current = await owned(resultPath, 65536);
        assertSameOriginalInput(resultFile.binding, current.binding);
        if (hash10(current.bytes) !== result.evidenceSha256) throw new Error('Original xcsh evidence bytes changed');
        await assertOriginal();
        return Buffer.from(current.bytes);
      });
      return result;
    } catch (error) {
      readyState.reject(error);
      await pending.catch(() => {});
      retired = true;
      try {
        await assertDirectory();
        await persist(
          join12(root, 'bridge-failure.private.json'),
          Buffer.from(
            JSON.stringify({
              schemaVersion: 1,
              kind: 'original-xcsh-bridge-failure',
              requestSha256: requestHash,
              executor: admission.identity,
              reader: readerActor,
              originalStartMs: context.budget.start,
              originalDeadlineMs: context.budget.deadline,
              finishedMs: clock(),
              complete: false,
              executionAuthorized: false,
              signalsSent: false,
              cloudSubmissions: 0,
              error:
                error instanceof Error
                  ? { name: error.name, message: error.message, stack: error.stack }
                  : { type: typeof error },
            }),
          ),
        );
        await assertDirectory();
      } catch (retention) {
        throw new AggregateError([error, retention], 'Original xcsh bridge failure and retention unresolved');
      }
      throw error;
    }
  })();
  completed.catch(() => {});
  return Object.freeze({
    ready: readyState.promise,
    completed,
    assertOriginal,
    closeAfterExecutorExit: async () => {
      await completed;
      if (!closure?.originalGroupClosed) throw new Error('Original xcsh reader closure unresolved');
      retired = true;
      for (const monitor of monitors.splice(0)) monitor.close();
    },
  });
}

// plugins/terraform/src/xcsh-creation-body.ts
var hash11 = (bytes) => createHash15('sha256').update(bytes).digest('hex');
var object7 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Original creation object required');
  return value;
};
var issued2 = new WeakMap();
var contexts = new WeakMap();
async function joinOriginalXcshCreationBody(input) {
  const { context, packet, result, body } = input;
  const target = Object.freeze({ ...input.target });
  if (typeof input.platform?.assertBody !== 'function') throw new Error('Verified Platform body source required');
  const assertBody = input.platform.assertBody.bind(input.platform);
  const expectedPath =
    target.type_name === 'xcsh_token'
      ? `/api/register/namespaces/system/tokens/${target.name}`
      : `/api/config/namespaces/system/securemesh_site_v2s/${target.name}`;
  let refused = false;
  const verify = async () => {
    if (refused) throw new Error('Original creation body evidence retired');
    try {
      assertPreparedCreationScopeContext(packet, context);
      await context.assertWithinDeadline();
      await context.assertInputs();
      const scope = await inspectPreparedCreationScope(packet);
      if (
        target.namespace !== 'system' ||
        !scope.resources.some(
          (row) => row.type_name === target.type_name && row.name === target.name && row.namespace === target.namespace,
        )
      )
        throw new Error('Original creation scope target required');
      const raw = await readOriginalInstalledXcshCreation(result);
      const creation = decodeEvidenceObject(raw);
      if (
        !result.complete ||
        creation.complete !== true ||
        creation.scopeSha256 !== scope.planSha256 ||
        creation.scopeFileSha256 !== scope.scope?.sha256 ||
        !Array.isArray(creation.receipts)
      )
        throw new Error('Original complete creation receipt required');
      const receipts = creation.receipts.map(object7).filter((row) => {
        const actual = object7(row.target);
        return (
          actual.type_name === target.type_name && actual.name === target.name && actual.namespace === target.namespace
        );
      });
      if (receipts.length !== 1) throw new Error('Original distinct creation receipt required');
      await assertBody(body);
      const response = body.evidence;
      if (
        response.path !== expectedPath ||
        response.method !== 'GET' ||
        response.requestBodySha256 !== null ||
        response.status !== 200 ||
        !response.responseComplete ||
        !response.accepted ||
        response.truncated ||
        response.origin !== context.environment.XCSH_API_URL ||
        response.credentialSha256 !== hash11(context.environment.XCSH_API_TOKEN) ||
        ['provider', 'engine', 'account', 'region', 'deploymentId'].some(
          (key) => response.owner[key] !== context.owner[key],
        )
      )
        throw new Error('Original authenticated creation response scope differs');
      const began = Date.parse(response.startedAt),
        finished = Date.parse(response.finishedAt),
        now = Date.now();
      if (
        !Number.isFinite(began) ||
        !Number.isFinite(finished) ||
        finished < began ||
        finished > now ||
        now - began >= 300000
      )
        throw new Error('Original creation body freshness required');
      const value = decodeEvidenceObject(body.bytes),
        metadata = object7(value.metadata),
        system = object7(value.system_metadata);
      if (
        metadata.name !== target.name ||
        metadata.namespace !== target.namespace ||
        typeof system.uid !== 'string' ||
        !system.uid ||
        system.uid.length > 128 ||
        containsControlCharacters(system.uid) ||
        receipts[0].creation_identity_sha256 !== hash11(system.uid)
      )
        throw new Error('Original creation response identity differs');
      await assertBody(body);
      await readOriginalInstalledXcshCreation(result);
      await context.assertInputs();
      await context.assertWithinDeadline();
      return { planSha256: scope.planSha256, identity: hash11(system.uid) };
    } catch (error) {
      refused = true;
      throw error;
    }
  };
  const original = await verify();
  const evidence = Object.freeze({
    schemaVersion: 1,
    kind: 'original-xcsh-creation-body-candidate',
    target,
    executor: Object.freeze({ ...result.executor }),
    planSha256: original.planSha256,
    readerResultSha256: result.evidenceSha256,
    bodySha256: body.evidence.bodySha256,
    creationIdentitySha256: original.identity,
    originalCreationCorroborated: true,
    bootstrapOwnershipQualified: false,
  });
  contexts.set(evidence, context);
  issued2.set(evidence, async () => {
    await verify();
    return body;
  });
  return evidence;
}
async function readOriginalXcshCreationBody(evidence) {
  const read = issued2.get(evidence);
  if (!read) throw new Error('Original creation body evidence required');
  return read();
}
async function assertOriginalXcshCreationBodyContext(evidence, context) {
  if (contexts.get(evidence) !== context) throw new Error('Original creation body context required');
  await readOriginalXcshCreationBody(evidence);
}

// plugins/terraform/src/gcp-preapply-bootstrap.ts
var object8 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Original preapply bootstrap object required');
  return value;
};
var issued3 = new WeakMap();
var contextChecks = new WeakMap();
async function collectOriginalGcpPreapplyBootstrap(input) {
  const { site, token } = input,
    binding = structuredClone(input.binding);
  const platform = Object.freeze({ ...input.platform });
  if (
    binding.owner.provider !== 'gcp' ||
    binding.owner.engine !== 'terraform' ||
    typeof platform.assertBody !== 'function' ||
    typeof platform.inspect !== 'function' ||
    typeof platform.readJwt !== 'function'
  )
    throw new Error('Original Terraform Platform bootstrap source required');
  if (
    site.target.type_name !== 'xcsh_securemesh_site_v2' ||
    token.target.type_name !== 'xcsh_token' ||
    site.target.name !== binding.siteName ||
    token.target.name !== binding.tokenName ||
    site.planSha256 !== token.planSha256 ||
    site.readerResultSha256 !== token.readerResultSha256
  )
    throw new Error('Original joint Site and Token creation scope required');
  const labels = (value, node) => {
    const declared = object8(object8(value.metadata).labels);
    const expected = {
      'xcsh-deployment': binding.deploymentName,
      'xcsh-engine': 'terraform',
      ...(node === undefined ? { 'ves.io/provider': 'ves-io-GOOGLE' } : { 'xcsh-node': node }),
    };
    if (
      Object.keys(declared).sort().join(',') !== Object.keys(expected).sort().join(',') ||
      Object.entries(expected).some(([key, value]) => declared[key] !== value)
    )
      throw new Error('Original preapply bootstrap owned labels differ');
  };
  const verify = async () => {
    const siteBody = await readOriginalXcshCreationBody(site),
      tokenBody = await readOriginalXcshCreationBody(token);
    await platform.assertBody(siteBody);
    await platform.assertBody(tokenBody);
    const siteValue = decodeEvidenceObject(siteBody.bytes),
      tokenValue = decodeEvidenceObject(tokenBody.bytes);
    labels(siteValue);
    labels(tokenValue, binding.nodeName);
    const gcp = object8(object8(siteValue.spec).gcp),
      notManaged = object8(gcp.not_managed);
    if (
      Object.keys(gcp).join(',') !== 'not_managed' ||
      Object.keys(notManaged).join(',') !== 'node_list' ||
      !Array.isArray(notManaged.node_list)
    )
      throw new Error('Original preapply GCP not-managed mapping required');
    const siteUid = object8(siteValue.system_metadata).uid,
      tokenUid = object8(tokenValue.system_metadata).uid;
    if (typeof siteUid !== 'string' || typeof tokenUid !== 'string') throw new Error('Original creation UIDs required');
    const bootstrap = await platform.inspect(siteBody, tokenBody, { ...binding, siteUid, tokenUid });
    await readOriginalXcshCreationBody(site);
    await readOriginalXcshCreationBody(token);
    return bootstrap;
  };
  const bootstrap = await verify();
  const value = Object.freeze({
    schemaVersion: 3,
    executor: site.executor,
    kind: 'original-gcp-preapply-bootstrap-candidate',
    xcshProviderVersion: '15.16.2',
    planSha256: site.planSha256,
    readerResultSha256: site.readerResultSha256,
    siteCreationSha256: site.creationIdentitySha256,
    tokenCreationSha256: token.creationIdentitySha256,
    bootstrap,
    creationOwnershipCorroborated: true,
    gcpWireCorroborated: true,
    bootstrapOwnershipQualified: false,
  });
  contextChecks.set(value, async (context) => {
    await assertOriginalXcshCreationBodyContext(site, context);
    await assertOriginalXcshCreationBodyContext(token, context);
  });
  let refused = false;
  issued3.set(value, async () => {
    if (refused) throw new Error('Original preapply bootstrap evidence retired');
    try {
      const current = await verify();
      if (JSON.stringify(current) !== JSON.stringify(bootstrap))
        throw new Error('Original preapply bootstrap source changed');
      return await platform.readJwt(bootstrap);
    } catch (error) {
      refused = true;
      throw error;
    }
  });
  return value;
}
async function readOriginalGcpPreapplyBootstrapJwt(value) {
  const read = issued3.get(value);
  if (!read) throw new Error('Original preapply bootstrap candidate required');
  return read();
}
async function assertOriginalGcpPreapplyBootstrapContext(value, context) {
  const check = contextChecks.get(value);
  if (!check) throw new Error('Original preapply bootstrap context required');
  await check(context);
}

// plugins/terraform/src/gcp-bootstrap-vm-binding.ts
var hash12 = (value) => createHash16('sha256').update(value).digest('hex');
var object9 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Original bootstrap VM object required');
  return value;
};
async function joinOriginalGcpBootstrapVm(input) {
  const { context, bootstrap, cloud } = input;
  await assertOriginalGcpPreapplyBootstrapContext(bootstrap, context);
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
    metadata = object9(request.metadata),
    labels = object9(request.labels);
  if (!Array.isArray(metadata.items)) throw new Error('Original VM metadata required');
  const userdata = metadata.items.map(object9).filter((row) => row.key === 'user-data');
  if (
    userdata.length !== 1 ||
    typeof userdata[0].value !== 'string' ||
    hash12(userdata[0].value) !== source.bootstrapSha256
  )
    throw new Error('Original VM user-data identity differs');
  const jwt = await readOriginalGcpPreapplyBootstrapJwt(bootstrap);
  let config;
  try {
    config = object9(Bun.YAML.parse(userdata[0].value));
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
  const file = object9(config.write_files[0]);
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
  const vm = await joinOriginalGcpInsertAuditEvidence(cloud);
  if (
    vm.accountSha256 !== context.authentication.accountSha256 ||
    vm.audienceSha256 !== context.authentication.audienceSha256 ||
    vm.adcSha256 !== context.authentication.snapshotSha256 ||
    vm.interfaces.length !== 2
  )
    throw new Error('Original admitted principal, snapshot or CE interfaces differ');
  await assertOriginalGcpPreapplyBootstrapContext(bootstrap, context);
  await readOriginalGcpPreapplyBootstrapJwt(bootstrap);
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

// plugins/terraform/src/gcp-preapply-checkout.ts
import { join as join13 } from 'node:path';

// plugins/gcloud/src/ce/bootstrap.ts
function formatGcpUserData(binding, now = Date.now()) {
  for (const name of [binding.deploymentName, binding.siteName, binding.nodeName]) {
    if (!/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(name)) throw new Error('Invalid GCP bootstrap binding');
  }
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(binding.jwt))
    throw new Error('Invalid site-bound JWT syntax');
  const expiry = Date.parse(binding.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now || expiry - now > 24 * 60 * 60 * 1000)
    throw new Error('Bootstrap expiry must be within 24 hours');
  return [
    '#cloud-config',
    'write_files:',
    '  - path: /etc/vpm/user_data',
    '    permissions: "0600"',
    '    owner: root',
    '    content: |',
    `      token: ${binding.jwt}`,
    '',
  ].join(`
`);
}

// plugins/gcloud/src/ce/bootstrap-checkout.ts
function ownerEqual(a, b) {
  return ['project', 'deploymentName', 'siteName', 'nodeName', 'engine'].every((field) => a[field] === b[field]);
}
function valid(owner) {
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(owner.project) || !['native', 'terraform'].includes(owner.engine))
    throw new Error('Invalid bootstrap ownership');
  for (const name of [owner.deploymentName, owner.siteName, owner.nodeName])
    if (!/^[a-z][a-z0-9-]{0,62}$/.test(name)) throw new Error('Invalid bootstrap ownership');
}
function path(owner) {
  return `gcp-bootstrap-${owner.nodeName}.json`;
}
async function storeGcpBootstrap(store, owner, binding) {
  valid(owner);
  if (
    binding.deploymentName !== owner.deploymentName ||
    binding.siteName !== owner.siteName ||
    binding.nodeName !== owner.nodeName
  )
    throw new Error('Bootstrap deployment/site/node binding differs');
  formatGcpUserData(binding);
  await store.exclusive(async () => {
    let prior;
    try {
      prior = await store.read(path(owner));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (prior !== undefined)
      throw new Error('Bootstrap already issued; explicit revocation and new node identity required');
    const record = {
      schemaVersion: 1,
      owner: structuredClone(owner),
      expiresAt: binding.expiresAt,
      jwt: binding.jwt,
      state: 'issued',
    };
    await store.write(path(owner), record);
  });
}
async function checkoutGcpBootstrap(store, owner, now = Date.now()) {
  valid(owner);
  return store.exclusive(async () => {
    const record = await store.read(path(owner));
    if (record?.schemaVersion !== 1 || !ownerEqual(record.owner, owner) || record.state !== 'issued')
      throw new Error('Bootstrap unavailable for this deployment/site/node/engine');
    const material = formatGcpUserData({ ...owner, jwt: record.jwt, expiresAt: record.expiresAt }, now);
    await store.write(path(owner), { ...record, jwt: '', state: 'consumed' });
    return material;
  });
}

// plugins/terraform/src/gcp-preapply-checkout.ts
async function checkoutOriginalGcpPreapplyBootstrap(evidence, store) {
  const jwt = await readOriginalGcpPreapplyBootstrapJwt(evidence);
  const bootstrap = evidence.bootstrap;
  const expected = Object.freeze({ ...bootstrap.owner });
  const directory = store.directory;
  const verify = async () => {
    await store.verify();
    if (
      store.directory !== directory ||
      ['provider', 'engine', 'account', 'region', 'deploymentId'].some((key) => store.owner[key] !== expected[key])
    )
      throw new Error('Original bootstrap storage scope differs');
  };
  await verify();
  const release = await acquireProcessLock(join13(directory, '.gcp-original-bootstrap-lock'));
  try {
    await verify();
    const name = `gcp-preapply-bootstrap-${bootstrap.nodeName}.json`;
    let prior;
    try {
      prior = await store.read(name);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (prior !== undefined) throw new Error('Original preapply bootstrap already claimed; reconcile without replay');
    const record = {
      schemaVersion: 2,
      kind: 'original-gcp-preapply-bootstrap-checkout',
      owner: expected,
      siteName: bootstrap.siteName,
      nodeName: bootstrap.nodeName,
      tokenName: bootstrap.tokenName,
      expiresAt: bootstrap.expiresAt,
      planSha256: evidence.planSha256,
      readerResultSha256: evidence.readerResultSha256,
      siteCreationSha256: evidence.siteCreationSha256,
      tokenCreationSha256: evidence.tokenCreationSha256,
      jwtSha256: bootstrap.jwtSha256,
    };
    await store.write(name, { ...record, state: 'claiming' });
    const scoped = {
      read: (name) => store.read(name),
      write: async (name, value) => {
        await verify();
        await store.write(name, value);
        await verify();
      },
      exclusive: async (fn) => {
        await verify();
        return fn();
      },
    };
    const owner = {
      project: expected.account,
      deploymentName: bootstrap.deploymentName,
      siteName: bootstrap.siteName,
      nodeName: bootstrap.nodeName,
      engine: expected.engine,
    };
    await storeGcpBootstrap(scoped, owner, { ...owner, jwt, expiresAt: bootstrap.expiresAt });
    if ((await readOriginalGcpPreapplyBootstrapJwt(evidence)) !== jwt)
      throw new Error('Original bootstrap material changed');
    const material = await checkoutGcpBootstrap(scoped, owner);
    await store.write(name, { ...record, state: 'consumed' });
    await verify();
    return material;
  } finally {
    await release();
  }
}

// plugins/terraform/src/gcp-campaign-access.ts
import {
  createHash as createHash17,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
} from 'node:crypto';
import { constants as constants7 } from 'node:fs';
import { lstat as lstat12, mkdir as mkdir7, open as open8, realpath as realpath11 } from 'node:fs/promises';
import { dirname as dirname12, isAbsolute as isAbsolute12, join as join14, resolve as resolve12 } from 'node:path';

var fileKeys2 = ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'];
var parentKeys4 = ['dev', 'ino', 'uid', 'mode'];
var hash13 = (bytes) => createHash17('sha256').update(bytes).digest('hex');
var magic = Buffer.from('openssh-key-v1\x00');
var scalar = (value) => {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
};
var wire = (value) => {
  const bytes = Buffer.from(value);
  return Buffer.concat([scalar(bytes.length), bytes]);
};
var publicWire = (bytes) => Buffer.concat([wire('ssh-ed25519'), wire(bytes)]);
var publicText = (bytes) => `ssh-ed25519 ${publicWire(bytes).toString('base64')}`;
var same = (a, b) => {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) || Array.isArray(b)) return false;
  const left = a,
    right = b;
  return (
    Object.keys(left).sort().join(',') === Object.keys(right).sort().join(',') &&
    Object.keys(left).every((key) => left[key] === right[key])
  );
};
function requestScope(store, request) {
  const owner = store.owner;
  if (
    owner?.provider !== 'gcp' ||
    owner.engine !== 'terraform' ||
    !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(owner.account) ||
    !/^[a-z]+(?:-[a-z]+)+\d$/.test(owner.region) ||
    !/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(owner.deploymentId) ||
    !request ||
    Object.keys(request).sort().join(',') !== 'platformContext,sshSourceCidr' ||
    typeof request.platformContext !== 'string' ||
    typeof request.sshSourceCidr !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/.test(request.platformContext)
  )
    throw new Error('Exact original GCP campaign access scope required');
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/32$/.exec(request.sshSourceCidr);
  if (
    !match ||
    match[0] !== request.sshSourceCidr ||
    match.slice(1).some((part) => Number(part) > 255 || String(Number(part)) !== part) ||
    [0, 127].includes(Number(match[1])) ||
    Number(match[1]) >= 224 ||
    (Number(match[1]) === 169 && Number(match[2]) === 254)
  )
    throw new Error('One canonical original SSH source IPv4 /32 required');
  return {
    owner: structuredClone(owner),
    request: { platformContext: request.platformContext, sshSourceCidr: request.sshSourceCidr },
  };
}
async function privateDirectory4(path) {
  if (!isAbsolute12(path) || resolve12(path) !== path || (await realpath11(path)) !== path)
    throw new Error('Canonical original private campaign directory required');
  const parent = await lstat12(path, { bigint: true });
  if (
    !parent.isDirectory() ||
    parent.isSymbolicLink() ||
    parent.uid !== BigInt(process.getuid?.() ?? -1) ||
    (parent.mode & 0o777n) !== 0o700n
  )
    throw new Error('Owned private campaign directory required');
}
async function readOriginal(path) {
  await privateDirectory4(dirname12(path));
  const before = await lstat12(path, { bigint: true });
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1n ||
    before.uid !== BigInt(process.getuid?.() ?? -1) ||
    (before.mode & 0o777n) !== 0o400n ||
    before.size < 1n ||
    before.size > 65536n
  )
    throw new Error('Original private single-link campaign input required');
  const handle = await open8(path, constants7.O_RDONLY | constants7.O_NOFOLLOW);
  try {
    const opened = await handle.stat({ bigint: true });
    const bytes = await handle.readFile();
    const after = await lstat12(path, { bigint: true });
    if (fileKeys2.some((key) => before[key] !== opened[key] || before[key] !== after[key]))
      throw new Error('Original campaign input changed during read');
    const parent = await lstat12(dirname12(path), { bigint: true });
    await privateDirectory4(dirname12(path));
    return {
      bytes,
      binding: Object.freeze({
        path,
        sha256: hash13(bytes),
        expectedIdentity: Object.freeze(Object.fromEntries(fileKeys2.map((key) => [key, before[key].toString()]))),
        expectedParentIdentity: Object.freeze(
          Object.fromEntries(parentKeys4.map((key) => [key, parent[key].toString()])),
        ),
      }),
    };
  } finally {
    await handle.close();
  }
}
async function persist2(path, bytes) {
  await privateDirectory4(dirname12(path));
  const handle = await open8(path, 'wx', 256);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  const parent = await open8(dirname12(path), constants7.O_RDONLY);
  try {
    await parent.sync();
  } finally {
    await parent.close();
  }
  return (await readOriginal(path)).binding;
}
function generateKey() {
  const pair = generateKeyPairSync('ed25519');
  const jwk = pair.privateKey.export({ format: 'jwk' });
  if (!jwk.d || !jwk.x) throw new Error('Ed25519 private seed unavailable');
  const seed = Buffer.from(jwk.d, 'base64url'),
    pub = Buffer.from(jwk.x, 'base64url');
  const check = randomBytes(4);
  const body = Buffer.concat([
    check,
    check,
    wire('ssh-ed25519'),
    wire(pub),
    wire(Buffer.concat([seed, pub])),
    wire(''),
  ]);
  const padding = Buffer.from(Array.from({ length: 8 - (body.length % 8) }, (_, i) => i + 1));
  const envelope = Buffer.concat([
    magic,
    wire('none'),
    wire('none'),
    wire(''),
    scalar(1),
    wire(publicWire(pub)),
    wire(Buffer.concat([body, padding])),
  ]);
  const keyLabel = 'OPENSSH PRIVATE KEY';
  const privateBytes = Buffer.from(`-----BEGIN ${keyLabel}-----
${envelope
  .toString('base64')
  .match(/.{1,70}/g)
  ?.join(`
`)}
-----END ${keyLabel}-----
`);
  return { privateBytes, publicKey: publicText(pub) };
}
function derivePublic(bytes) {
  const match = /^-----BEGIN OPENSSH PRIVATE KEY-----\n([A-Za-z0-9+/=\n]+)\n-----END OPENSSH PRIVATE KEY-----\n$/.exec(
    bytes.toString(),
  );
  if (!match) throw new Error('Original Ed25519 key envelope required');
  const text = match[1].replaceAll(
      `
`,
      '',
    ),
    raw = Buffer.from(text, 'base64');
  if (raw.toString('base64') !== text || !raw.subarray(0, magic.length).equals(magic))
    throw new Error('Original key encoding differs');
  let offset = magic.length;
  const number = () => {
    const value = raw.readUInt32BE(offset);
    offset += 4;
    return value;
  };
  const field = () => {
    const size = number();
    if (size > raw.length - offset) throw new Error('Truncated key field');
    const value = raw.subarray(offset, offset + size);
    offset += size;
    return value;
  };
  if (field().toString() !== 'none' || field().toString() !== 'none' || field().length !== 0 || number() !== 1)
    throw new Error('Original unencrypted single Ed25519 key required');
  const outer = field(),
    inner = field();
  if (offset !== raw.length || inner.length % 8 !== 0) throw new Error('Original key framing differs');
  let position = 8;
  const innerField = () => {
    const size = inner.readUInt32BE(position);
    position += 4;
    if (size > inner.length - position) throw new Error('Truncated private key field');
    const value = inner.subarray(position, position + size);
    position += size;
    return value;
  };
  if (!inner.subarray(0, 4).equals(inner.subarray(4, 8)) || innerField().toString() !== 'ssh-ed25519')
    throw new Error('Original key checkints or algorithm differ');
  const pub = innerField(),
    secret = innerField(),
    comment = innerField();
  const padding = inner.subarray(position);
  if (
    pub.length !== 32 ||
    secret.length !== 64 ||
    !secret.subarray(32).equals(pub) ||
    comment.length ||
    padding.length < 1 ||
    padding.length > 8 ||
    padding.some((value, index) => value !== index + 1) ||
    !outer.equals(publicWire(pub))
  )
    throw new Error('Original private key fields differ');
  const privateKey = createPrivateKey({
    key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), secret.subarray(0, 32)]),
    format: 'der',
    type: 'pkcs8',
  });
  const derived = createPublicKey(privateKey).export({ format: 'jwk' });
  if (!derived.x || !Buffer.from(derived.x, 'base64url').equals(pub))
    throw new Error('Original private/public correspondence differs');
  return publicText(pub);
}
async function prepareOriginalGcpCampaignAccess(store, request) {
  request = { ...request };
  const scope = requestScope(store, request);
  await store.verify();
  await privateDirectory4(store.directory);
  const root = join14(store.directory, 'gcp-campaign-access');
  try {
    await lstat12(root);
    return (await readOriginalGcpCampaignAccess(store, request)).publicAccess;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  for (const name of [
    'deployment.json',
    'gcp-terraform-input-identity.json',
    'gcp-tf-deploy-original-authorization.json',
  ]) {
    try {
      await lstat12(join14(store.directory, name));
      throw new Error('Existing deployment cannot mint new campaign keys');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  try {
    await mkdir7(root, { mode: 448 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    return (await readOriginalGcpCampaignAccess(store, request)).publicAccess;
  }
  const ce = generateKey(),
    observer = generateKey();
  const inputs = {
    ce_key: await persist2(join14(root, 'ce_key'), ce.privateBytes),
    observer_key: await persist2(join14(root, 'observer_key'), observer.privateBytes),
  };
  const publicAccess = { schemaVersion: 1, cePublicKey: ce.publicKey, observerPublicKey: observer.publicKey };
  await persist2(
    join14(root, 'manifest.private.json'),
    Buffer.from(JSON.stringify({ schemaVersion: 1, ...scope, publicAccess, inputs })),
  );
  return (await readOriginalGcpCampaignAccess(store, request)).publicAccess;
}
async function readOriginalGcpCampaignAccess(store, request, intentSha256) {
  const scope = requestScope(store, request);
  await store.verify();
  await privateDirectory4(store.directory);
  const root = join14(store.directory, 'gcp-campaign-access');
  const manifest = await readOriginal(join14(root, 'manifest.private.json'));
  const saved = JSON.parse(manifest.bytes.toString());
  if (
    saved.schemaVersion !== 1 ||
    !same(saved.owner, scope.owner) ||
    !same(saved.request, scope.request) ||
    saved.publicAccess?.schemaVersion !== 1 ||
    Object.keys(saved.inputs ?? {})
      .sort()
      .join(',') !== 'ce_key,observer_key'
  )
    throw new Error('Original campaign key scope differs');
  const inputs = { campaign_manifest: manifest.binding };
  for (const name of ['ce_key', 'observer_key']) {
    const path = join14(root, name),
      key = await readOriginal(path);
    assertSameOriginalInput(saved.inputs[name], key.binding);
    const publicKey = derivePublic(key.bytes);
    if (publicKey !== saved.publicAccess[name === 'ce_key' ? 'cePublicKey' : 'observerPublicKey'])
      throw new Error('Original campaign public/private key mismatch');
    inputs[name] = key.binding;
  }
  if (saved.publicAccess.cePublicKey === saved.publicAccess.observerPublicKey)
    throw new Error('Distinct original campaign keys required');
  if (intentSha256 !== undefined && !/^[a-f0-9]{64}$/.test(intentSha256))
    throw new Error('Exact original intent hash required');
  let claim;
  try {
    await privateDirectory4(join14(root, 'intent-binding-claim'));
    claim = await lstat12(join14(root, 'intent-binding-claim'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  let binding;
  try {
    binding = await readOriginal(join14(root, 'intent-binding.private.json'));
  } catch (error) {
    if (error.code !== 'ENOENT' || claim || intentSha256 !== undefined) throw error;
  }
  if (binding) {
    const original = JSON.parse(binding.bytes.toString());
    if (
      !claim ||
      original.schemaVersion !== 1 ||
      !/^[a-f0-9]{64}$/.test(original.intentSha256) ||
      (intentSha256 !== undefined && original.intentSha256 !== intentSha256) ||
      parentKeys4.some((key) => String(claim[key]) !== original.claim?.[key])
    )
      throw new Error('Original key intent binding differs');
    assertSameOriginalInput(original.manifest, manifest.binding);
    inputs.campaign_intent = binding.binding;
  }
  const monitor = await monitorOriginalInputs(inputs);
  try {
    await store.verify();
    await monitor.assertOriginal();
  } finally {
    monitor.close();
  }
  return Object.freeze({
    publicAccess: Object.freeze({
      schemaVersion: 1,
      cePublicKey: saved.publicAccess.cePublicKey,
      observerPublicKey: saved.publicAccess.observerPublicKey,
    }),
    inputs: Object.freeze(inputs),
  });
}
async function bindOriginalGcpCampaignAccess(store, binding) {
  binding = { ...binding };
  if (
    Object.keys(binding).sort().join(',') !==
      'cePublicKey,intentSha256,observerPublicKey,platformContext,schemaVersion,sshSourceCidr' ||
    binding.schemaVersion !== 1 ||
    !/^[a-f0-9]{64}$/.test(binding.intentSha256)
  )
    throw new Error('Exact original campaign intent binding required');
  const request = { platformContext: binding.platformContext, sshSourceCidr: binding.sshSourceCidr };
  const original = await readOriginalGcpCampaignAccess(store, request);
  if (
    original.publicAccess.cePublicKey !== binding.cePublicKey ||
    original.publicAccess.observerPublicKey !== binding.observerPublicKey
  )
    throw new Error('Original campaign intent public keys differ');
  const path = join14(store.directory, 'gcp-campaign-access', 'intent-binding.private.json');
  const claimPath = join14(store.directory, 'gcp-campaign-access', 'intent-binding-claim');
  let claimed = false;
  try {
    await mkdir7(claimPath, { mode: 448 });
    claimed = true;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  if (claimed) {
    const claim = await lstat12(claimPath);
    await persist2(
      path,
      Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          intentSha256: binding.intentSha256,
          manifest: original.inputs.campaign_manifest,
          claim: Object.fromEntries(parentKeys4.map((key) => [key, String(claim[key])])),
        }),
      ),
    );
  }
  await readOriginalGcpCampaignAccess(store, request, binding.intentSha256);
}

// plugins/terraform/src/service.ts
import { join as join15 } from 'node:path';

// plugins/terraform/src/session-lifetime.ts
async function withFinalCheck(operation, finalCheck, combinedFailureMessage) {
  const outcome = await (async () => {
    try {
      return { succeeded: true, value: await operation() };
    } catch (error) {
      return { succeeded: false, error };
    }
  })();
  try {
    await finalCheck();
  } catch (failure) {
    if (!outcome.succeeded) throw new AggregateError([outcome.error, failure], combinedFailureMessage);
    throw failure;
  }
  if (!outcome.succeeded) throw outcome.error;
  return outcome.value;
}

// plugins/terraform/src/service.ts
var TERRAFORM_SERVICE_CHANNEL = 'xcsh:ce-terraform:v1:service';
function freezeRuntime(options) {
  const execute = options.execute;
  const planSource = options.planSource;
  if (planSource !== undefined && (planSource !== 'gcp-resource-plan-v1' || !execute))
    throw new Error('Qualified versioned plan source requires its original executor');
  const assertApplyReady = options.assertApplyReady;
  const googleAdc = options.googleAdc
    ? Object.freeze({ ...options.googleAdc, acquire: options.googleAdc.acquire })
    : undefined;
  if (googleAdc && !execute) throw new Error('Google ADC policy requires a qualified original-lifetime executor');
  return Object.freeze({ execute, googleAdc, assertApplyReady, planSource });
}
function createCeTerraformService(platform, options = {}) {
  const defaults = freezeRuntime(options);
  const resolveRuntime = options.resolveRuntime;
  if (resolveRuntime && (defaults.execute || defaults.googleAdc || defaults.assertApplyReady || defaults.planSource))
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
      const shared = await platform();
      const store = await shared.storage(owner);
      if (deployment.stage !== undefined && !/^[a-z][a-z0-9-]{0,62}$/.test(deployment.stage))
        throw new Error('Invalid Terraform stage identity');
      const directory = deployment.stage
        ? join15(store.directory, 'terraform-stages', deployment.stage)
        : store.directory;
      const { execute, googleAdc, assertApplyReady, planSource } = resolveRuntime
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
      const runner = new TerraformRunner(directory, guardedExecute, undefined, planSource);
      if (resume) await runner.resume(deployment.deploymentId, deployment, resume === 'current' ? 'current' : 'exact');
      else await runner.prepare(deployment);
      const checkOwner = async () => {
        await shared.storage(owner);
      };
      const checkApplyReady = async () => {
        await checkOwner();
        if (retiring) throw new Error('Original Google ADC session is retired');
        await assertApplyReady?.();
      };
      return {
        ...(assertApplyReady ? { assertApplyReady: checkApplyReady } : {}),
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

// plugins/terraform/src/index.ts
function factory(pi) {
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
    assertNewRuntime: async (provider) => {
      if (provider === 'gcp') await assertInstalledRuntime();
    },
  });
}

export {
  assertOriginalGcpPreapplyBootstrapContext,
  checkoutOriginalGcpPreapplyBootstrap,
  collectOriginalGcpPreapplyBootstrap,
  collectOriginalGcpTerraformBootstrap,
  collectOriginalGcpTerraformBootstrapV2,
  factory as default,
  joinOriginalGcpBootstrapVm,
  joinOriginalXcshCreationBody,
  openInstalledXcshCreationReader,
  readOriginalGcpPreapplyBootstrapJwt,
  readOriginalGcpTerraformBootstrapJwt,
  readOriginalInstalledXcshCreation,
  readOriginalXcshCreationBody,
};
