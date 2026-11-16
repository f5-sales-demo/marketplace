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
  {
    terraformVersion: '1.17.2',
    googleVersion: '8.11.0',
    xcshVersion: '15.17.3',
    providerLockSha256: 'ddd3bbbad292cc08b82014de3060fcf800c02fb2113311c06f50720c1075d615',
    terraformSha256: 'dbfef0be43ba2117481be510d3b83a2d8cdfa6ae7ec69c5aeb04b3947956ff7e',
    googleProviderSha256: 'f6c7080ca82f5ecc2f279f9b6edf152ec366890f76ab0a97a1667bdf17331ef5',
    xcProviderSha256: '89a8011443732db8b64bb7fd44df21da15e4cf6183384e21e531d4533653edb0',
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
function resolveInstalledGcpExecutableProfile(terraformSha256, googleProviderSha256) {
  const matching = profiles.filter(
    (profile) =>
      profile.terraformSha256 === terraformSha256 &&
      (googleProviderSha256 === undefined || profile.googleProviderSha256 === googleProviderSha256),
  );
  const families = new Set(
    matching.map((profile) => JSON.stringify([profile.googleVersion, profile.googleProviderSha256])),
  );
  if (!matching.length || families.size !== 1)
    throw new Error('Original admitted Terraform and Google executable profile required; ambiguous provider family');
  return matching[0];
}
function isOriginalCreationScopeProfile(profile) {
  return (
    profile ===
    resolveInstalledGcpVersionProfile({
      terraformVersion: '1.17.2',
      providerLockSha256: 'ddd3bbbad292cc08b82014de3060fcf800c02fb2113311c06f50720c1075d615',
    })
  );
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
  const evidence = await collectBootstrap(input, '15.17.3');
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
      : Object.freeze({ ...common, schemaVersion: 2, xcshProviderVersion: '15.17.3' });
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
import { createHash as createHash23, createHash as createHash24 } from 'node:crypto';

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
var resourceName = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
function compileGcpInsertAuditQuery(project, zone, node, input) {
  const window = { ...input };
  if (
    !resourceName.test(project) ||
    !resourceName.test(zone) ||
    !resourceName.test(node) ||
    Object.keys(window).sort().join(',') !== 'after,before' ||
    ![window.after, window.before].every(
      (value) =>
        typeof value === 'string' &&
        /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$/.test(value) &&
        Number.isFinite(Date.parse(value)) &&
        new Date(value).toISOString() === value,
    ) ||
    Date.parse(window.after) < 0 ||
    Date.parse(window.before) <= Date.parse(window.after) ||
    Date.parse(window.before) - Date.parse(window.after) > 7200000
  )
    throw new Error('Fixed original Compute insert audit window required');
  const logName = `projects/${project}/logs/cloudaudit.googleapis.com%2Factivity`;
  const resource = `projects/${project}/zones/${zone}/instances/${node}`;
  const filter = [
    `logName=${JSON.stringify(logName)}`,
    'protoPayload.serviceName="compute.googleapis.com"',
    'protoPayload.methodName="v1.compute.instances.insert"',
    `protoPayload.resourceName=${JSON.stringify(resource)}`,
    `timestamp>=${JSON.stringify(window.after)}`,
    `timestamp<=${JSON.stringify(window.before)}`,
  ].join(' AND ');
  return Object.freeze({
    resourceNames: Object.freeze([`projects/${project}`]),
    filter,
    pageSize: 100,
    orderBy: 'timestamp asc',
  });
}
function hasAuditControlCharacters(value) {
  return Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

// plugins/terraform/src/linux-clock.ts
import { dlopen, FFIType, ptr } from 'bun:ffi';
// plugins/terraform/src/gcp-insert-evidence.ts
// plugins/terraform/src/gcp-http-rpc-trace.ts
// plugins/terraform/src/original-output-stream.ts
import { createHash as createHash2, createHash as createHash3, createHash as createHash19 } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readFile, realpath, stat } from 'node:fs/promises';
import {
  basename as basename3,
  dirname,
  isAbsolute,
  isAbsolute as isAbsolute13,
  join,
  resolve,
  resolve as resolve13,
} from 'node:path';

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

// plugins/terraform/src/original-output-stream.ts
var stableKeys = ['dev', 'ino', 'uid', 'nlink', 'mode'];
var parentKeys = ['dev', 'ino', 'uid', 'mode'];
var maximumChunk = 65536;
var maximumRetention = 64 * 1024 * 1024;
var digest = (value) => createHash2('sha256').update(value).digest('hex');
var prefixOrigins = new WeakMap();
var prefixReaders = new WeakMap();
async function readOriginalExecutionPrefix(output, expected) {
  const read = prefixReaders.get(output);
  if (!read || (expected && prefixOrigins.get(expected) !== output))
    throw new Error('Original executor-issued output prefix required');
  return read(expected);
}
var chunkOrigins = new WeakMap();
var completionOrigins = new WeakMap();
function readOriginalExecutionChunk(output, chunk, channel) {
  const origin = chunkOrigins.get(chunk);
  if (!origin || origin.output !== output || origin.channel !== channel)
    throw new Error('An original executor-issued channel record is required');
  origin.assertValid();
  return Object.freeze({
    identity: origin.identity,
    directory: origin.directory,
    offset: chunk.offset,
    endOffset: chunk.endOffset,
    sha256: chunk.sha256,
    bytes: Buffer.from(origin.bytes),
  });
}
function readOriginalExecutionCompletion(output, completion) {
  const origin = completionOrigins.get(completion);
  if (!origin || origin.output !== output) throw new Error('An original executor-issued completion is required');
  origin.assertValid();
  return Object.freeze({ identity: origin.identity, directory: origin.directory, completion });
}

class OutputNotReady extends Error {}

class OutputRefusal extends Error {}
async function bindOriginalExecutionOutput(input) {
  const directory = input.directory;
  if (!isAbsolute(directory) || resolve(directory) !== directory || (await realpath(directory)) !== directory)
    throw new Error('Original executor workspace directory required');
  const workspace = await lstat(directory, { bigint: true });
  if (!workspace.isDirectory() || workspace.isSymbolicLink() || workspace.uid !== BigInt(process.getuid?.() ?? -1))
    throw new Error('Original owned executor workspace required');
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
        const parent = await lstat(dirname(stream.path), { bigint: true });
        if (
          !parent.isDirectory() ||
          parent.isSymbolicLink() ||
          parentKeys.some((key) => parent[key] !== stream.parent[key])
        )
          throw new Error('Original private failure directory changed');
        const message = error instanceof Error ? error.message : 'Unknown original capture failure';
        const cause = error instanceof Error ? error.cause : undefined;
        const payload = JSON.stringify({
          schemaVersion: 2,
          kind: 'original-output-capture-failure',
          identity,
          phase,
          errorName: error instanceof Error ? error.name.slice(0, 64) : 'unknown',
          code: error instanceof Error && typeof error.code === 'string' ? error.code?.slice(0, 64) : null,
          message: message.slice(0, 4096),
          messageTruncated: message.length > 4096,
          messageSha256: digest(Buffer.from(message)),
          cause:
            cause instanceof Error
              ? {
                  errorName: cause.name.slice(0, 64),
                  code: typeof cause.code === 'string' ? cause.code?.slice(0, 64) : null,
                  message: cause.message.slice(0, 4096),
                  messageTruncated: cause.message.length > 4096,
                  messageSha256: digest(Buffer.from(cause.message)),
                }
              : null,
          offsets: { stdout: streams.stdout?.offset ?? 0, stderr: streams.stderr?.offset ?? 0 },
          applyRpcQualified: false,
          originalInsertQualified: false,
        });
        const file = await open(
          join(dirname(stream.path), 'output-capture-failure.private.json'),
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
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
    } catch (error) {
      refused = true;
      throw new OutputRefusal('Original output group closure unavailable', { cause: error });
    }
  };
  const waitForOriginalClosingGroup = async () => {
    if (await groupClosed()) return true;
    phase = 'original-closing';
    if ((await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim() !== identity.boot)
      throw new OutputRefusal('Original output producer boot changed');
    try {
      const raw = await readFile(`/proc/${identity.pid}/stat`, 'utf8');
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
    const currentWorkspace = await lstat(directory, { bigint: true });
    if (
      !currentWorkspace.isDirectory() ||
      currentWorkspace.isSymbolicLink() ||
      parentKeys.some((key) => currentWorkspace[key] !== workspace[key]) ||
      (await realpath(directory)) !== directory
    )
      throw new OutputRefusal('Original executor workspace directory changed');
    phase = 'file-metadata';
    const [current, writer, opened, parent] = await Promise.all([
      lstat(stream.path, { bigint: true }),
      stream.writer.stat({ bigint: true }),
      stream.reader.stat({ bigint: true }),
      lstat(dirname(stream.path), { bigint: true }),
    ]);
    if (
      !current.isFile() ||
      !parent.isDirectory() ||
      parent.isSymbolicLink() ||
      stableKeys.some((key) => [current, writer, opened].some((value) => value[key] !== stream.original[key])) ||
      parentKeys.some((key) => parent[key] !== stream.parent[key]) ||
      (await realpath(stream.path)) !== stream.path
    )
      throw new OutputRefusal('Original output file or parent identity changed');
    if (current.size < BigInt(stream.offset)) throw new OutputRefusal('Original output retained prefix truncated');
    if (current.size > BigInt(maximum)) throw new OutputRefusal('Original output capture limit exceeded');
    phase = 'original-group';
    if (!(await groupClosed())) {
      if (afterOriginalExit) throw new OutputRefusal('Original output producer closure changed');
      try {
        phase = 'producer-metadata';
        const raw = await readFile(`/proc/${identity.pid}/stat`, 'utf8');
        const fields = raw
          .slice(raw.lastIndexOf(') ') + 2)
          .trim()
          .split(/\s+/);
        const [boot, producer] = await Promise.all([
          readFile('/proc/sys/kernel/random/boot_id', 'utf8'),
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
    const prefix = createHash2('sha256');
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
      const parent = await lstat(dirname(selected.path), { bigint: true });
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
      const reader = await open(selected.path, constants.O_RDONLY | constants.O_NOFOLLOW);
      const stream = {
        path: selected.path,
        writer: selected.writer,
        reader,
        original,
        parent,
        descriptor: channel === 'stdout' ? 1 : 2,
        offset: 0,
        hash: createHash2('sha256'),
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
          const chunk = Object.freeze({ offset, endOffset: stream.offset, bytes, sha256: digest(bytes) });
          chunkOrigins.set(chunk, {
            output,
            identity,
            directory,
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
            directory,
            assertValid: () => {
              if (refused) throw new Error('Original completion source is refused');
            },
          });
          return completion;
        });
      },
    });
    prefixReaders.set(output, (expected) =>
      exclusive(async () => {
        const result = {};
        for (const channel of ['stdout', 'stderr']) {
          const stream = streams[channel];
          await guard(stream);
          await verifyPrefix(stream);
          const bound = expected?.[channel];
          if (bound) {
            if (bound.bytes > stream.offset) throw new OutputRefusal('Original prefix is ahead of its consumed output');
            const hash = createHash2('sha256');
            for (let offset = 0; offset < bound.bytes; offset += maximumChunk)
              hash.update(await readAt(stream, offset, Math.min(maximumChunk, bound.bytes - offset)));
            if (hash.digest('hex') !== bound.sha256) throw new OutputRefusal('Original issued output prefix changed');
          }
          await guard(stream);
          await verifyPrefix(stream);
          result[channel] = Object.freeze({ bytes: stream.offset, sha256: stream.hash.copy().digest('hex') });
        }
        if (expected) return expected;
        const prefix = Object.freeze({
          schemaVersion: 1,
          kind: 'original-execution-output-prefix',
          identity,
          directory,
          stdout: result.stdout,
          stderr: result.stderr,
          applyRpcQualified: false,
          originalInsertQualified: false,
        });
        prefixOrigins.set(prefix, output);
        return prefix;
      }),
    );
    return { output, close };
  } catch (error) {
    await close();
    if (error instanceof OutputRefusal) throw error;
    throw new OutputRefusal('Original output descriptor admission unavailable');
  }
}

// plugins/terraform/src/gcp-http-rpc-trace.ts
var responseOrigins = new WeakMap();
async function readOriginalGoogleHttpResponseSource(value) {
  const read = value && typeof value === 'object' ? responseOrigins.get(value) : undefined;
  if (!read) throw new Error('Original executor-issued HTTP response required');
  return read();
}
var bodyOrigins = new WeakMap();
async function readOriginalGoogleHttpRpcSource(value) {
  const read = bodyOrigins.get(value);
  if (!read) throw new Error('Original executor-issued HTTP bodies required');
  return read();
}
var issuedBodies = new WeakSet();
function assertOriginalGoogleHttpRpcBodies(value) {
  if (!value || !issuedBodies.has(value)) throw new Error('An original parser-issued HTTP body capability is required');
}
var providerAddress = 'registry.terraform.io/hashicorp/google';
var maximumLine = 1024 * 1024;
var maximumStream = 64 * 1024 * 1024;
var maximumDump = 4 * 1024 * 1024;
var hash2 = (value) => createHash3('sha256').update(value).digest('hex');
var ending = '-----------------------------------------------------';
var markers = {
  request: '---[ REQUEST ]---------------------------------------',
  response: '---[ RESPONSE ]--------------------------------------',
};
var heading = /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2} \[DEBUG\] Google API (Request|Response) Details:$/;
var text = (value) => {
  if (typeof value !== 'string') throw new Error('Malformed original trace field');
  for (const char of value) if (char.charCodeAt(0) < 32) throw new Error('Multiline or control trace field');
  return value;
};
function headers(lines) {
  const separator = lines.indexOf('');
  if (separator < 1) throw new Error('Incomplete original HTTP headers');
  const values = new Map();
  for (const line of lines.slice(1, separator)) {
    const found = /^([a-zA-Z][a-zA-Z0-9-]*):[ \t]*(.*)$/.exec(line);
    if (!found) throw new Error('Malformed original HTTP header');
    const key = found[1].toLowerCase();
    values.set(key, [...(values.get(key) ?? []), found[2].trim()]);
  }
  for (const key of ['host', 'authorization', 'content-type', 'content-length', 'x-goog-request-reason'])
    if ((values.get(key)?.length ?? 0) > 1) throw new Error('Ambiguous original HTTP header');
  return {
    values,
    body: lines
      .slice(separator + 1)
      .join(`
`)
      .trim(),
  };
}
function jsonBody(body, contentType, required) {
  if (!body) {
    if (required) throw new Error('Missing original HTTP response body');
    return hash2('');
  }
  if (!contentType || !/^application\/json(?:\s*;.*)?$/i.test(contentType))
    throw new Error('Original HTTP JSON content type required');
  decodeEvidenceObject(Buffer.from(body));
  return hash2(body);
}

class GoogleHttpRpcTraceParser {
  #scope;
  #base;
  #googleVersion;
  #releasedBody;
  #providerModule;
  #buffer = Buffer.allocUnsafe(maximumLine);
  #seen = new Set();
  #bodies = new WeakMap();
  #lineBytes = 0;
  #streamBytes = 0;
  #failed = false;
  #closed = false;
  #active;
  #dump;
  #pending;
  #matched;
  #matches = 0;
  #responses = [];
  #originOutput;
  #originCompletion;
  #sourceEnd = 0;
  #sourceHash = createHash3('sha256');
  constructor(scope, binding) {
    const googleVersion = binding ? resolveInstalledGcpVersionProfile(binding).googleVersion : '8.7.0';
    this.#googleVersion = googleVersion;
    this.#providerModule = `provider.terraform-provider-google_v${googleVersion}_x5`;
    const url = new URL(scope.url);
    const project = /^\/compute\/v1\/projects\/([a-z][a-z0-9-]{4,62})(?:\/|$)/.exec(url.pathname);
    if (
      !['ReadDataSource', 'ReadResource', 'ApplyResourceChange'].includes(scope.rpc) ||
      !/^google_[a-z0-9_]+$/.test(scope.resourceType) ||
      !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(scope.method) ||
      !/^[a-f0-9]{64}$/.test(scope.planSha256) ||
      !scope.requestReason ||
      scope.requestReason.length > 256 ||
      url.protocol !== 'https:' ||
      !['compute.googleapis.com', 'www.googleapis.com'].includes(url.hostname) ||
      url.port ||
      url.username ||
      url.password ||
      url.hash ||
      !project
    )
      throw new Error('Fixed reviewed Google trace scope required');
    if (
      scope.instanceName !== undefined &&
      (typeof scope.instanceName !== 'string' ||
        !/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(scope.instanceName) ||
        scope.rpc !== 'ApplyResourceChange' ||
        scope.resourceType !== 'google_compute_instance' ||
        scope.method !== 'POST' ||
        !/^\/compute\/v1\/projects\/[a-z][a-z0-9-]{4,62}\/zones\/[a-z][a-z0-9-]{0,62}\/instances$/.test(url.pathname))
    )
      throw new Error('Original named Compute insert scope required');
    text(scope.requestReason);
    this.#scope = Object.freeze({ ...scope });
    this.#base = `${url.origin}/compute/v1/projects/${project[1]}/`;
  }
  #open() {
    if (this.#failed) throw new Error('Original HTTP/RPC trace failed');
    if (this.#closed) throw new Error('Original HTTP/RPC trace closed');
  }
  push(chunk) {
    this.#open();
    if (this.#originOutput) {
      this.#failed = true;
      if (this.#releasedBody) issuedBodies.delete(this.#releasedBody);
      throw new Error('Original HTTP descriptor cannot accept unowned bytes');
    }
    return this.#consume(chunk);
  }
  pushOriginal(output, chunk) {
    this.#open();
    try {
      const source = readOriginalExecutionChunk(output, chunk, 'stderr');
      if (
        (this.#originOutput && this.#originOutput !== output) ||
        (!this.#originOutput && this.#streamBytes !== 0) ||
        source.offset !== this.#sourceEnd
      )
        throw new Error('Original HTTP descriptor stream changed or has a gap');
      this.#originOutput = output;
      this.#sourceEnd = source.offset + source.bytes.length;
      this.#sourceHash.update(source.bytes);
      return this.#consume(source.bytes);
    } catch (error) {
      this.#failed = true;
      if (this.#releasedBody) issuedBodies.delete(this.#releasedBody);
      throw error;
    }
  }
  #consume(chunk) {
    this.#open();
    try {
      this.#streamBytes += chunk.byteLength;
      if (this.#streamBytes > maximumStream) throw new Error('Original trace stream limit exceeded');
      const output = [];
      let offset = 0;
      while (offset < chunk.length) {
        const newline = chunk.indexOf(10, offset),
          end = newline === -1 ? chunk.length : newline;
        if (this.#lineBytes + end - offset > maximumLine) throw new Error('Original trace line limit exceeded');
        this.#buffer.set(chunk.subarray(offset, end), this.#lineBytes);
        this.#lineBytes += end - offset;
        if (newline < 0) break;
        const candidate = this.#record(this.#buffer.subarray(0, this.#lineBytes));
        if (candidate) output.push(candidate);
        this.#lineBytes = 0;
        offset = newline + 1;
      }
      return output;
    } catch (error) {
      this.#failed = true;
      if (this.#releasedBody) issuedBodies.delete(this.#releasedBody);
      throw error;
    }
  }
  #record(raw) {
    const record = decodeEvidenceObject(raw);
    if (typeof record['@message'] !== 'string') throw new Error('Malformed original trace message');
    const message = record['@message'];
    const rpcRecord = record['@module'] === 'sdk.proto' && record.tf_provider_addr === providerAddress;
    const httpRecord = record['@module'] === this.#providerModule;
    if (
      this.#active &&
      !httpRecord &&
      typeof record['@module'] === 'string' &&
      record['@module'].startsWith('provider.terraform-provider-google_')
    )
      throw new Error('Original forwarding module differs from authenticated profile');
    if (!rpcRecord && !httpRecord) {
      if (this.#dump && heading.test(message)) throw new Error('Original forwarding module changed');
      if (this.#dump?.marker && message === markers[this.#dump.kind])
        throw new Error('Original forwarding module changed');
      return;
    }
    const timestamp = text(record['@timestamp']);
    if (!isEvidenceRfc3339(timestamp) || !['trace', 'debug', 'info', 'warn', 'error'].includes(text(record['@level'])))
      throw new Error('Original trace envelope required');
    if (rpcRecord) return this.#rpc(record, message, raw);
    if (!this.#active) return;
    if (record['@level'] === 'error' || /\[ERROR\] Google API (?:Request|Response) error:/.test(message))
      throw new Error('Original provider HTTP dump failed');
    const found = heading.exec(message);
    if (found) {
      if (this.#dump) throw new Error('Overlapping original HTTP dumps');
      const kind = found[1] === 'Request' ? 'request' : 'response';
      if ((kind === 'request' && this.#pending) || (kind === 'response' && !this.#pending))
        throw new Error('Unpaired original HTTP transaction');
      this.#dump = {
        kind,
        marker: true,
        lines: [],
        bytes: 0,
        hash: createHash3('sha256')
          .update(raw)
          .update(`
`),
      };
      return;
    }
    const dump = this.#dump;
    if (!dump) {
      if (message === ending || message === markers.request || message === markers.response)
        throw new Error('Unpaired original HTTP dump marker');
      return;
    }
    text(message);
    dump.hash.update(raw).update(`
`);
    if (dump.marker) {
      if (message !== markers[dump.kind]) throw new Error('Missing original HTTP dump marker');
      dump.marker = false;
      return;
    }
    if (message === ending) {
      this.#completeDump(dump);
      this.#dump = undefined;
      return;
    }
    dump.bytes += Buffer.byteLength(message) + 1;
    if (dump.bytes > maximumDump) throw new Error('Original HTTP dump limit exceeded');
    dump.lines.push(message);
  }
  #rpc(record, message, raw) {
    if (record.tf_proto_version !== '5.11') throw new Error('Pinned original Google protocol required');
    if (this.#active && record['@level'] === 'error') throw new Error('Original provider RPC failed');
    if (!['Received request', 'Served request'].includes(message)) return;
    const id = text(record.tf_req_id),
      rpc = text(record.tf_rpc);
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))
      throw new Error('Original RPC request identity required');
    const fingerprint = JSON.stringify([rpc, record.tf_resource_type ?? null, record.tf_data_source_type ?? null]);
    if (message === 'Received request') {
      if (this.#active || this.#seen.has(id)) throw new Error('Concurrent or replayed original Google RPC');
      this.#seen.add(id);
      this.#active = {
        id,
        fingerprint,
        eligible:
          rpc === this.#scope.rpc &&
          (record.tf_resource_type ?? record.tf_data_source_type) === this.#scope.resourceType,
        receivedHash: createHash3('sha256')
          .update(raw)
          .update(`
`)
          .digest('hex'),
      };
      return;
    }
    const active = this.#active;
    if (!active || active.id !== id || active.fingerprint !== fingerprint || this.#dump || this.#pending)
      throw new Error('Unpaired or changed original Google RPC');
    this.#active = undefined;
    const transaction = this.#matched;
    this.#matched = undefined;
    if (!transaction) return;
    this.#matches++;
    if (this.#matches !== 1) throw new Error('Replayed matching original HTTP transaction');
    const candidate = Object.freeze({
      rpcRequestId: id,
      rpc: this.#scope.rpc,
      resourceType: this.#scope.resourceType,
      method: transaction.request.method,
      url: transaction.request.url,
      status: transaction.status,
      requestReasonSha256: hash2(this.#scope.requestReason),
      requestBodySha256: transaction.request.bodyHash,
      responseBodySha256: transaction.bodyHash,
      requestRecordsSha256: transaction.request.recordsHash,
      responseRecordsSha256: transaction.recordsHash,
      receivedRecordSha256: active.receivedHash,
      servedRecordSha256: createHash3('sha256')
        .update(raw)
        .update(`
`)
        .digest('hex'),
      planSha256: this.#scope.planSha256,
      applyRpcQualified: false,
      originalInsertQualified: false,
    });
    this.#bodies.set(
      candidate,
      Object.freeze({
        ...candidate,
        schemaVersion: 1,
        kind: 'original-google-http-rpc-bodies',
        googleProviderVersion: this.#googleVersion,
        requestBody: transaction.request.body,
        responseBody: transaction.body,
      }),
    );
    return candidate;
  }
  consumeBodies(candidate) {
    if (this.#failed) throw new Error('Original HTTP/RPC trace failed');
    const bodies = this.#bodies.get(candidate);
    if (!bodies) throw new Error('An unconsumed original HTTP candidate is required');
    this.#bodies.delete(candidate);
    this.#releasedBody = bodies;
    issuedBodies.add(bodies);
    const output = this.#originOutput;
    if (output)
      bodyOrigins.set(bodies, async () => {
        if (this.#failed || !issuedBodies.has(bodies)) throw new Error('Original HTTP descriptor source failed');
        const original = this.#originCompletion;
        if (!original) throw new Error('Original HTTP descriptor completion required');
        try {
          readOriginalExecutionCompletion(output, original.completion);
          const current = await output.finish();
          const checked = readOriginalExecutionCompletion(output, current);
          for (const channel of ['stdout', 'stderr'])
            if (
              current[channel].bytes !== original.completion[channel].bytes ||
              current[channel].sha256 !== original.completion[channel].sha256
            )
              throw new Error('Original HTTP descriptor bytes changed');
          if (['pid', 'group', 'start', 'boot'].some((key) => checked.identity[key] !== original.identity[key]))
            throw new Error('Original HTTP executor identity changed');
          return Object.freeze({
            schemaVersion: 1,
            kind: 'original-google-http-rpc-source',
            executor: original.identity,
            directory: original.directory,
            planSha256: bodies.planSha256,
            rpcRequestId: bodies.rpcRequestId,
            stdoutBytes: current.stdout.bytes,
            stdoutSha256: current.stdout.sha256,
            stderrBytes: current.stderr.bytes,
            stderrSha256: current.stderr.sha256,
            applyRpcQualified: false,
            originalInsertQualified: false,
          });
        } catch (error) {
          this.#failed = true;
          issuedBodies.delete(bodies);
          throw error;
        }
      });
    return bodies;
  }
  takeOriginalResponses() {
    this.#open();
    if (!this.#originOutput) throw new Error('Original executor descriptor response source required');
    return Object.freeze(this.#responses.splice(0));
  }
  #observeResponse(transaction) {
    const output = this.#originOutput,
      active = this.#active;
    if (!output || !active) throw new Error('Original active response descriptor required');
    const response = Object.freeze({
      schemaVersion: 1,
      kind: 'original-google-http-response-observation',
      rpcRequestId: active.id,
      rpc: this.#scope.rpc,
      resourceType: this.#scope.resourceType,
      method: transaction.request.method,
      url: transaction.request.url,
      status: transaction.status,
      googleProviderVersion: this.#googleVersion,
      requestReasonSha256: hash2(this.#scope.requestReason),
      requestBodySha256: transaction.request.bodyHash,
      responseBodySha256: transaction.bodyHash,
      requestRecordsSha256: transaction.request.recordsHash,
      responseRecordsSha256: transaction.recordsHash,
      receivedRecordSha256: active.receivedHash,
      planSha256: this.#scope.planSha256,
      requestBody: transaction.request.body,
      responseBody: transaction.body,
      rpcCompletionQualified: false,
      applyRpcQualified: false,
      originalInsertQualified: false,
    });
    let prefix;
    responseOrigins.set(response, async () => {
      if (this.#failed) throw new Error('Original HTTP response descriptor source failed');
      try {
        if (!prefix) {
          const current = await readOriginalExecutionPrefix(output);
          if (
            current.stderr.bytes !== this.#sourceEnd ||
            current.stderr.sha256 !== this.#sourceHash.copy().digest('hex')
          )
            throw new Error('Original HTTP response descriptor prefix differs');
          prefix = current;
        } else await readOriginalExecutionPrefix(output, prefix);
        if (this.#failed) throw new Error('Original HTTP response descriptor source failed during verification');
        return Object.freeze({
          schemaVersion: 1,
          kind: 'original-google-http-response-source',
          executor: prefix.identity,
          directory: prefix.directory,
          planSha256: response.planSha256,
          rpcRequestId: response.rpcRequestId,
          stdoutBytes: prefix.stdout.bytes,
          stdoutSha256: prefix.stdout.sha256,
          stderrBytes: prefix.stderr.bytes,
          stderrSha256: prefix.stderr.sha256,
          rpcCompletionQualified: false,
          applyRpcQualified: false,
          originalInsertQualified: false,
        });
      } catch (error) {
        this.#failed = true;
        if (this.#releasedBody) issuedBodies.delete(this.#releasedBody);
        throw error;
      }
    });
    this.#responses.push(response);
  }
  #completeDump(dump) {
    const parsed = headers(dump.lines),
      recordsHash = dump.hash.digest('hex');
    if (dump.kind === 'request') {
      const line = /^(GET|POST|PUT|PATCH|DELETE) (\/[^ ]*) HTTP\/1\.1$/.exec(dump.lines[0]);
      const host = parsed.values.get('host')?.[0];
      if (!line || line[2].startsWith('//') || !host) throw new Error('Fixed original HTTP request line required');
      const url = new URL(`https://${host}${line[2]}`);
      if (!url.href.startsWith(this.#base) || url.username || url.password || url.hash || url.port)
        throw new Error('Original Google HTTP target differs');
      if (parsed.values.get('x-goog-request-reason')?.[0] !== this.#scope.requestReason)
        throw new Error('Original reviewed HTTP request reason differs');
      let matching = this.#active?.eligible === true && line[1] === this.#scope.method && url.href === this.#scope.url;
      const bodyHash = jsonBody(parsed.body, parsed.values.get('content-type')?.[0], false);
      if (matching && this.#scope.instanceName !== undefined) {
        const named = decodeEvidenceObject(Buffer.from(parsed.body)).name;
        if (typeof named !== 'string' || !/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(named))
          throw new Error('Original insert body instance name required');
        matching = named === this.#scope.instanceName;
      }
      if (matching && (this.#matched || this.#matches)) throw new Error('Replayed matching original HTTP request');
      this.#pending = {
        method: line[1],
        url: url.href,
        matching,
        recordsHash,
        bodyHash,
        body: parsed.body,
      };
      return;
    }
    const status = /^HTTP\/(?:1\.0|1\.1|2\.0) ([1-5][0-9]{2})(?: .*)?$/.exec(dump.lines[0]);
    if (!status || !this.#pending) throw new Error('Original HTTP response identity required');
    const bodyHash = jsonBody(parsed.body, parsed.values.get('content-type')?.[0], true);
    if (this.#pending.matching) {
      const transaction = {
        request: this.#pending,
        status: Number(status[1]),
        bodyHash,
        recordsHash,
        body: parsed.body,
      };
      this.#matched = transaction;
      if (this.#originOutput) this.#observeResponse(transaction);
    }
    this.#pending = undefined;
  }
  finish() {
    this.#open();
    if (this.#originOutput) {
      this.#failed = true;
      if (this.#releasedBody) issuedBodies.delete(this.#releasedBody);
      throw new Error('Original HTTP descriptor completion required');
    }
    return this.#finish();
  }
  finishOriginal(output, completion) {
    this.#open();
    try {
      const original = readOriginalExecutionCompletion(output, completion);
      if (
        output !== this.#originOutput ||
        this.#sourceEnd !== completion.stderr.bytes ||
        this.#streamBytes !== completion.stderr.bytes ||
        this.#sourceHash.copy().digest('hex') !== completion.stderr.sha256
      )
        throw new Error('Original HTTP descriptor completion differs');
      const result = this.#finish();
      this.#originCompletion = original;
      return result;
    } catch (error) {
      this.#failed = true;
      if (this.#releasedBody) issuedBodies.delete(this.#releasedBody);
      throw error;
    }
  }
  #finish() {
    this.#open();
    if (this.#lineBytes || this.#active || this.#dump || this.#pending || this.#matches !== 1) {
      this.#failed = true;
      if (this.#releasedBody) issuedBodies.delete(this.#releasedBody);
      throw new Error('Original HTTP/RPC trace truncated or missing matching evidence');
    }
    this.#closed = true;
    return Object.freeze({
      complete: true,
      matchingTransactions: this.#matches,
      applyRpcQualified: false,
      originalInsertQualified: false,
    });
  }
}

// plugins/terraform/src/google-provider-lifecycle.ts
var rpcOrigins = new WeakMap();
function readOriginalGoogleProviderRpcSource(candidate) {
  const read = rpcOrigins.get(candidate);
  if (!read) throw new Error('An original descriptor-sourced Google RPC candidate is required');
  return read();
}
var _maximumLine2 = 1024 * 1024;
var _maximumStream2 = 64 * 1024 * 1024;

// plugins/terraform/src/original-google-provider-source.ts
// plugins/terraform/src/installed-provider-reader.ts
import { createHash as createHash16, createHash as createHash17, randomUUID as randomUUID8 } from 'node:crypto';
import { lstat as lstat12, mkdir as mkdir7, open as open9, realpath as realpath11 } from 'node:fs/promises';
import { dirname as dirname12, join as join15 } from 'node:path';

// plugins/terraform/src/gcp-capture-source-pins.json
var gcp_capture_source_pins_default = {
  schemaVersion: 1,
  kind: 'gcp-original-capture-sources',
  files: {
    '__init__.py': 'e15c038a408c0c4c10311bdec72a98327f2fb24b1d132132691fa2e69fd26fcb',
    'guest_pty.py': '274de216c148e2a6e267b4082cce552ca04a17adf78a8c8a6dda5ed9579829e3',
    'gcp_guest_session.py': 'f07f68da3da07ffbe2b57152d958e0215356c024ed2da66e30a0c5c3da9d4723',
    'gcp_host_trust.py': 'cd5baf163c9f77c4bae4e15ed459bb2be18dd918ff93720c652217c7bc6487ad',
    'guest_control.py': '1c04972ed1a4576f450cc71d6e01539e20a9ab3c72d82242f55fcb4e115ed032',
    'guest_worker.py': '8cccbddd35d02ffb64d9c91adbf15c016f6f9ecaf817f9b71c0088257d43a392',
    'guest_entrypoint.py': 'f55af410f939a1d01efa30d2cb14775b060b78a8d2ec7bbdeee1da2335f3e151',
    'gcp_provider_process.py': '2e8828b8907d344cd7f302d9a6c46957293ec8845719e1d39b1f06e98ed7ac00',
    'gcp_provider_reader.py': '19532859fd9390ded4a3321fade653f1ca5ccb0d22afd04f2c37dcc816391ceb',
    'xcsh_creation_observer.py': '6ebd1f53ef6e1ae69c41533a6930351fca4e3a0d928d46fb6d3f0ea0fb918b5b',
    'xcsh_creation_reader.py': '39e491fafa0885e735652c63743a86167253ef9a5c8a8fe522c014df28e557b2',
    'publish_bootstrap_grant.py': '6309afaebcd31730e750d14fb03d12afff5b83e3b9f06f765f1c1178d156ab9a',
  },
};

// plugins/terraform/src/runner.ts
// plugins/platform/src/ce/process-lock.ts
import { createHash as createHash5, randomUUID, randomUUID as randomUUID2 } from 'node:crypto';
import {
  chmod,
  lstat as lstat2,
  lstat as lstat4,
  mkdir,
  mkdir as mkdir2,
  readdir,
  readFile as readFile2,
  readFile as readFile3,
  realpath as realpath3,
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
  dirname as dirname2,
  dirname as dirname4,
  isAbsolute as isAbsolute3,
  isAbsolute as isAbsolute4,
  join as join2,
  join as join3,
  resolve as resolve3,
  resolve as resolve4,
} from 'node:path';

async function processGroup(pid) {
  if (process.platform !== 'linux') throw new Error('Original executor group tracking requires Linux');
  const text = await readFile2(`/proc/${pid}/stat`, 'utf8');
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
  const file = join2(path, 'lifetime.json');
  let metadata;
  try {
    metadata = await lstat2(file);
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
  const raw = await readFile2(file, 'utf8');
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
    await lstat2(join2(path, 'capture-unresolved.json'));
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
    value = (await readFile2('/proc/sys/kernel/random/boot_id', 'utf8')).trim();
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
    const value = await readFile2(`/proc/${pid}/stat`, 'utf8');
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
  const stat = await lstat2(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.())
    throw new Error('Operation lock evidence cannot be reconciled');
  try {
    const claimPath = join2(path, 'claim.json');
    const claimStat = await lstat2(claimPath);
    if (
      !claimStat.isFile() ||
      claimStat.isSymbolicLink() ||
      claimStat.nlink !== 1 ||
      claimStat.uid !== process.getuid?.() ||
      (claimStat.mode & 63) !== 0
    )
      throw new Error('Operation lock evidence cannot be reconciled');
    return claim(JSON.parse(await readFile2(claimPath, 'utf8')));
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
  const parent = dirname2(path);
  for (let attempt = 0; attempt < 4; attempt++) {
    const candidate = join2(parent, `${basename(path)}.claim-${mine.token}`);
    await mkdir(candidate, { mode: 448 });
    await writeFile(join2(candidate, 'claim.json'), JSON.stringify(mine), { mode: 384, flag: 'wx' });
    if (lifetime)
      await writeFile(join2(candidate, 'lifetime.json'), JSON.stringify(lifetime), { mode: 256, flag: 'wx' });
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
    const stale = join2(parent, `${basename(path)}.stale-${randomUUID()}`);
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
import { constants as constants2, watch } from 'node:fs';
import { lstat as lstat3, open as open2, realpath as realpath2 } from 'node:fs/promises';
import { basename as basename2, dirname as dirname3, isAbsolute as isAbsolute2, resolve as resolve2 } from 'node:path';

class OriginalInputMonitorError extends Error {
  reason;
  constructor(reason) {
    super('Original input monitor detected a changed identity or bytes');
    this.name = 'OriginalInputMonitorError';
    this.reason = reason;
  }
}
var keys = ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'];
var parentKeys2 = ['dev', 'ino', 'uid', 'mode'];
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
    parentKeys2.some(
      (key) =>
        typeof original.expectedParentIdentity?.[key] !== 'string' ||
        original.expectedParentIdentity[key] !== current.expectedParentIdentity?.[key],
    )
  )
    throw new Error('Original selected input identity or bytes changed');
}
var hash3 = (raw) => createHash4('sha256').update(raw).digest('hex');
var maximum = 256n * 1024n * 1024n;
var identity = (stat) => Object.fromEntries(keys.map((key) => [key, stat[key].toString()]));
async function metadata(path) {
  const stat = await lstat3(path, { bigint: true });
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
        const current = await metadata(binding.path);
        if (keys.some((key) => current[key].toString() !== file[key]))
          throw new OriginalInputMonitorError('file-identity-changed');
        const currentParent = await lstat3(dirname3(binding.path), { bigint: true });
        if (
          !currentParent.isDirectory() ||
          currentParent.isSymbolicLink() ||
          parentKeys2.some((key) => currentParent[key].toString() !== parent[key]) ||
          (await realpath2(binding.path)) !== binding.path
        )
          throw new OriginalInputMonitorError('parent-identity-changed');
        const handle = await open2(binding.path, constants2.O_RDONLY | constants2.O_NOFOLLOW);
        try {
          const opened = await handle.stat({ bigint: true });
          if (keys.some((key) => opened[key].toString() !== file[key]))
            throw new OriginalInputMonitorError('open-identity-changed');
          if (verifyBytes && hash3(await handle.readFile()) !== binding.sha256)
            throw new OriginalInputMonitorError('bytes-changed');
        } finally {
          await handle.close();
        }
        const after = await metadata(binding.path);
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
        !isAbsolute2(binding.path) ||
        resolve2(binding.path) !== binding.path ||
        (await realpath2(binding.path)) !== binding.path ||
        !/^[a-f0-9]{64}$/.test(binding.sha256)
      )
        throw new Error('Original input monitor requires canonical reviewed bindings');
      const stat = await metadata(binding.path);
      const parent = await lstat3(dirname3(binding.path), { bigint: true });
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
      if (parentKeys2.some((key) => !/^(?:0|[1-9][0-9]*)$/.test(parentIdentity[key])))
        throw new Error('Original input monitor requires exact admitted parent identities');
      if (keys.some((key) => typeof file[key] !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(file[key])))
        throw new Error('Original input monitor requires exact admitted identities');
      observe(
        watch(binding.path, { persistent: false }, () => {
          latch('watcher-event');
        }),
      );
      observe(
        watch(dirname3(binding.path), { persistent: false }, (_event, name) => {
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
    canonical(value.scope) !== canonical(expected.scope) ||
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
var digest2 = (value) => createHash5('sha256').update(value).digest('hex');
function object3(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Terraform JSON object is malformed');
  return value;
}
function decode(value) {
  try {
    return object3(
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
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
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
  const action = object3(invocations[0]);
  if (
    action.address !== expected.address ||
    action.type !== expected.type ||
    action.provider_name !== expected.providerName ||
    action.lifecycle_action_trigger !== undefined ||
    Object.keys(object3(action.invoke_action_trigger)).length ||
    !allFalse(action.config_unknown) ||
    !allFalse(action.config_sensitive) ||
    digest2(canonical(object3(action.config_values))) !== expected.configValuesSha256
  )
    throw new Error('Terraform action identity, trigger or configuration differs');
  return [{ ...expected }];
}
async function privateDirectory(path) {
  await mkdir2(path, { recursive: true, mode: 448 });
  const stat = await lstat4(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    (await realpath3(path)) !== path
  )
    throw new Error('Terraform storage ownership is invalid');
  await chmod(path, 448);
}
async function privateRead(path) {
  const stat = await lstat4(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 63) !== 0
  )
    throw new Error('Terraform artifact ownership is invalid');
  return readFile3(path);
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
      const directory = join3(cwd, 'executor-diagnostics');
      await privateDirectory(directory);
      const claim = await privateRead(join3(cwd, '.terraform-executor-lock', 'claim.json')).then(
        (bytes) => JSON.parse(bytes.toString('utf8')),
        () => {
          return;
        },
      );
      const executable = Bun.which('terraform', { cwd, PATH: env.PATH });
      await persist(join3(directory, `${invocationId}-${phase}.json`), {
        schemaVersion: 1,
        invocationId,
        phase,
        observedAt: new Date().toISOString(),
        pid: child.pid,
        operation: args[0],
        launcher: '/bin/sh',
        executable,
        executableSha256: executable ? digest2(await readFile3(executable)) : undefined,
        executorIdentity: claim?.pid === child.pid ? claim : undefined,
      });
    };
    const releaseExecutor = await startTerraformGate(
      child,
      () => acquireProcessLock(join3(cwd, '.terraform-executor-lock'), child.pid),
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
        const directory = join3(cwd, 'failure-diagnostics');
        await privateDirectory(directory);
        await persist(join3(directory, `${randomUUID2()}.json`), {
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
    if (!isAbsolute3(root) || resolve3(root) !== root) throw new Error('Terraform storage must be an absolute path');
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
      object3(configuration.terraform ?? {}).backend ||
      object3(configuration.terraform ?? {}).cloud ||
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
    const directory = join3(this.root, deployment.deploymentId);
    await mkdir2(directory, { mode: 448 });
    const { configuration: source, providerLock, ...identity } = deployment;
    const manifest = { ...identity, configurationSha256: digest2(source), providerLockSha256: digest2(providerLock) };
    await writeFile2(join3(directory, 'main.tf.json'), source, { mode: 384, flag: 'wx' });
    await writeFile2(join3(directory, '.terraform.lock.hcl'), providerLock, { mode: 384, flag: 'wx' });
    await writeFile2(join3(directory, 'deployment.tfrc'), cliConfig, { mode: 384, flag: 'wx' });
    await persist(join3(directory, 'deployment.json'), manifest);
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
      const configuration = await privateRead(join3(directory, 'main.tf.json'));
      if (digest2(configuration) !== expectedSha256) throw new Error('Terraform configuration snapshot changed');
      return configuration.toString();
    });
  }
  async reconcileApplyFromEvidence(receipt, evidenceSha256) {
    if (this.#cleanup) throw new Error('Capture-independent cleanup cannot reconcile creation');
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const { directory, manifest } = this.#state();
      const journal = decode((await privateRead(join3(directory, 'plan-receipt.json'))).toString());
      if (
        !['applying', 'applied'].includes(String(journal.state)) ||
        canonical(receipt) !== canonical(journal.receipt) ||
        receipt.engine !== 'terraform' ||
        receipt.deploymentId !== manifest.deploymentId ||
        receipt.backendIdentity !== manifest.backendIdentity ||
        receipt.configurationSha256 !== manifest.configurationSha256 ||
        receipt.providerLockSha256 !== manifest.providerLockSha256 ||
        receipt.planSha256 !== digest2(await privateRead(join3(directory, 'saved.tfplan'))) ||
        !/^[a-f0-9]{64}$/.test(evidenceSha256)
      )
        throw new Error('Terraform interrupted apply evidence differs from the exact saved plan');
      await this.#replacePrivate(
        join3(directory, 'plan-receipt.json'),
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
      this.#validateRevision(configuration, (await privateRead(join3(directory, 'main.tf.json'))).toString());
      const nextSha256 = digest2(configuration);
      if (nextSha256 === expectedSha256) return nextSha256;
      let receipt;
      try {
        receipt = decode((await privateRead(join3(directory, 'plan-receipt.json'))).toString());
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
      await this.#replacePrivate(join3(directory, 'configuration-transition.json'), JSON.stringify(transition));
      await this.#recoverRevision();
      return nextSha256;
    });
  }
  #validateRevision(configuration, previousConfiguration) {
    const next = decode(configuration);
    const terraform = object3(next.terraform ?? {});
    if (terraform.backend || terraform.cloud) throw new Error('Terraform configuration revision cannot change backend');
    if (previousConfiguration !== undefined) {
      const previous = decode(previousConfiguration);
      for (const key of ['terraform', 'provider'])
        if (canonical(previous[key] ?? {}) !== canonical(next[key] ?? {}))
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
      transition = decode((await privateRead(join3(directory, 'configuration-transition.json'))).toString());
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    const previous = object3(transition.previous);
    const next = object3(transition.next);
    if (
      typeof transition.configuration !== 'string' ||
      typeof transition.archiveId !== 'string' ||
      !/^[0-9a-f-]{36}$/.test(transition.archiveId) ||
      !/^[0-9a-f]{64}$/.test(previous.configurationSha256) ||
      canonical({ ...previous, configurationSha256: next.configurationSha256 }) !== canonical(next) ||
      next.configurationSha256 !== digest2(transition.configuration)
    )
      throw new Error('Terraform configuration transition is malformed');
    this.#validateRevision(transition.configuration);
    const owner = decode((await privateRead(join3(directory, 'deployment.json'))).toString());
    const current = await privateRead(join3(directory, 'main.tf.json'));
    if (
      ![canonical(previous), canonical(next)].includes(canonical(owner)) ||
      ![previous.configurationSha256, next.configurationSha256].includes(digest2(current)) ||
      digest2(await privateRead(join3(directory, '.terraform.lock.hcl'))) !== previous.providerLockSha256 ||
      digest2(await privateRead(join3(directory, 'deployment.tfrc'))) !== digest2(cliConfig)
    )
      throw new Error('Terraform configuration transition ownership or inputs changed');
    const archive = join3(directory, 'revisions', transition.archiveId);
    await privateDirectory(archive);
    const archiveFile = async (name, content) => {
      try {
        await writeFile2(join3(archive, name), content, { mode: 384, flag: 'wx' });
      } catch (error) {
        if (error.code !== 'EEXIST' || digest2(await privateRead(join3(archive, name))) !== digest2(content))
          throw error;
      }
    };
    if (digest2(current) === previous.configurationSha256) await archiveFile('main.tf.json', current);
    if (digest2(await privateRead(join3(archive, 'main.tf.json'))) !== previous.configurationSha256)
      throw new Error('Previous Terraform configuration archive is missing');
    this.#validateRevision(transition.configuration, (await privateRead(join3(archive, 'main.tf.json'))).toString());
    await archiveFile('deployment.json', Buffer.from(JSON.stringify(previous)));
    for (const name of ['saved.tfplan', 'plan-receipt.json']) {
      try {
        await archiveFile(name, await privateRead(join3(directory, name)));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    await this.#replacePrivate(join3(directory, 'main.tf.json'), transition.configuration);
    await this.#replacePrivate(join3(directory, 'deployment.json'), JSON.stringify(next));
    this.#manifest = next;
    await rm2(join3(directory, 'configuration-transition.json'));
  }
  async resume(deploymentId, expected, configurationMode = 'exact') {
    if (configurationMode === 'current' && !expected) throw new Error('Current configuration resume requires identity');
    if (!safeId.test(deploymentId)) throw new Error('Invalid Terraform deployment identity');
    const directory = join3(this.root, deploymentId);
    await privateDirectory(directory);
    const manifest = decode((await privateRead(join3(directory, 'deployment.json'))).toString());
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
          configurationMode === 'current' ? recoveredManifest.configurationSha256 : digest2(configuration),
        providerLockSha256: digest2(providerLock),
      };
      if (canonical(recoveredManifest) !== canonical(expectedManifest))
        throw new Error('Terraform deployment differs from the requested identity or configuration');
      if (configurationMode === 'current')
        this.#validateRevision((await privateRead(join3(directory, 'main.tf.json'))).toString(), configuration);
    }
    this.#directory = directory;
    this.#manifest = recoveredManifest;
    await this.#verifyInputs();
  }
  async resumeCompletedCleanupReadOnly(deploymentId) {
    const scope = this.#cleanup;
    if (!scope || scope.deploymentId !== deploymentId || !safeId.test(deploymentId))
      throw new Error('Original completed cleanup inspection scope required');
    const directory = join3(this.root, deploymentId);
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
      const path = join3(directory, name),
        parent = await lstat4(directory, { bigint: true });
      const first = await lstat4(path, { bigint: true });
      const raw = await privateRead(path);
      const second = await lstat4(path, { bigint: true });
      const identity = (value) =>
        Object.fromEntries(
          ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'].map((key) => [key, String(value[key])]),
        );
      if (canonical(identity(first)) !== canonical(identity(second)))
        throw new Error('Original cleanup inspection inputs changed');
      snapshots.set(name, raw);
      inputs[`inspection:${name}`] = {
        path,
        sha256: digest2(raw),
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
      await assertExecutorProcessGroupAbsent(join3(directory, '.terraform-executor-lock'));
      await scope.assertIndependentClosure();
      const raw = (name) => {
        const value = snapshots.get(name);
        if (!value) throw new Error('Original inspection snapshot missing');
        return value;
      };
      const owner = decode(raw('deployment.json').toString()),
        state = decode(raw('terraform.tfstate').toString());
      const checkpoint = decode(raw('plan-receipt.json').toString()),
        receipt = object3(checkpoint.receipt);
      if (
        digest2(raw('deployment.json')) !== scope.deploymentManifestSha256 ||
        owner.engine !== 'terraform' ||
        owner.deploymentId !== deploymentId ||
        digest2(raw('main.tf.json')) !== owner.configurationSha256 ||
        digest2(raw('.terraform.lock.hcl')) !== owner.providerLockSha256 ||
        digest2(raw('deployment.tfrc')) !== digest2(cliConfig) ||
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
        receipt.planSha256 !== digest2(raw('saved.tfplan'))
      )
        throw new Error('Original stable empty state and recorded empty destroy plan required');
      await scope.assertIndependentClosure();
      await assertExecutorProcessGroupAbsent(join3(directory, '.terraform-executor-lock'));
      await monitor.assertOriginal();
      return Object.freeze({
        schemaVersion: 1,
        kind: 'completed-cleanup-read-only-resume',
        readOnly: true,
        deploymentId,
        engine: 'terraform',
        stateSha256: digest2(raw('terraform.tfstate')),
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
      await lstat4(join3(this.#directory, 'configuration-transition.json'));
      throw new Error('Resume the interrupted Terraform configuration transition before execution');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const owner = decode((await privateRead(join3(this.#directory, 'deployment.json'))).toString());
    if (canonical(owner) !== canonical(this.#manifest) || owner.engine !== 'terraform')
      throw new Error('Terraform deployment ownership changed');
    for (const [file, expected] of [
      ['main.tf.json', this.#manifest.configurationSha256],
      ['.terraform.lock.hcl', this.#manifest.providerLockSha256],
      ['deployment.tfrc', digest2(cliConfig)],
    ]) {
      if (digest2(await privateRead(join3(this.#directory, file))) !== expected)
        throw new Error('Terraform configuration or provider lock changed');
    }
  }
  #environment(ambient) {
    const env = Object.fromEntries(Object.entries(ambient).filter(([key]) => !key.startsWith('TF_')));
    return {
      ...env,
      TF_CLI_CONFIG_FILE: join3(this.#state().directory, 'deployment.tfrc'),
      TF_DATA_DIR: join3(this.#state().directory, '.terraform'),
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
    const lock = join3(this.#directory, '.runner-lock');
    let release;
    try {
      release = await acquireProcessLock(lock);
      if (this.#cleanup) await this.#verifyCaptureCleanup();
      else {
        const executorStopped = await acquireProcessLock(join3(this.#directory, '.terraform-executor-lock'));
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
    if (digest2(await privateRead(join3(directory, 'deployment.json'))) !== scope.deploymentManifestSha256)
      throw new Error('Original cleanup manifest changed');
    const lock = join3(directory, '.terraform-executor-lock');
    for (const name of ['claim.json', 'lifetime.json', 'capture-unresolved.json'])
      if (
        scope.retainedLockInputs[name]?.path !== join3(lock, name) ||
        scope.retainedLockInputs[name]?.sha256 !== scope.retainedLockSha256[name]
      )
        throw new Error('Original retained cleanup lock admission differs');
    this.#cleanupMonitor ??= await monitorOriginalInputs(scope.retainedLockInputs);
    await this.#cleanupMonitor.assertOriginal();
    for (const [name, expected] of Object.entries(scope.retainedLockSha256))
      if (digest2(await privateRead(join3(lock, name))) !== expected)
        throw new Error('Original failed cleanup lock changed');
    await assertExecutorProcessGroupAbsent(lock);
    await scope.assertIndependentClosure();
    const raw = await privateRead(join3(directory, 'terraform.tfstate'));
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
        !verification.checkpoint.path.startsWith(`${join3(directory, 'capture-cleanup-verification')}/`) ||
        digest2(raw) !== verification.state.sha256 ||
        state.lineage !== verification.state.lineage ||
        state.serial !== verification.state.serial
      )
        throw new Error('Original empty cleanup verification state differs');
      this.#verificationMonitor ??= await monitorOriginalInputs({ checkpoint: verification.checkpoint });
      await this.#verificationMonitor.assertOriginal();
      const checkpoint = decode((await privateRead(verification.checkpoint.path)).toString());
      const receipt = object3(checkpoint.receipt);
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
            object3(change).actions === undefined || canonical(object3(change).actions) !== canonical(['delete']),
        ) ||
        canonical(changes.map((change) => object3(change).address).sort()) !==
          canonical(scope.resources.map((resource) => resource.address).sort())
      )
        throw new Error('Original applied destroy checkpoint required for cleanup verification');
      await this.#verificationMonitor.assertOriginal();
      this.#cleanupEmpty = true;
    }
    const resources = state.resources.map(object3);
    const actual = resources
      .filter((r) => r.mode === 'managed')
      .flatMap((r) => {
        if (typeof r.type !== 'string' || typeof r.name !== 'string' || !Array.isArray(r.instances))
          throw new Error('Original cleanup state resource malformed');
        return r.instances.map((instance) => {
          const row = object3(instance),
            attributes = object3(row.attributes);
          const prefix = typeof r.module === 'string' ? `${r.module}.` : '';
          const suffix = row.index_key === undefined ? '' : `[${JSON.stringify(row.index_key)}]`;
          return { address: `${prefix}${r.type}.${r.name}${suffix}`, id: attributes.id };
        });
      });
    if (this.#cleanupEmpty) {
      if (actual.length) throw new Error('Owned cleanup resources remain');
    } else if (
      digest2(raw) !== scope.state.sha256 ||
      canonical(actual.sort((a, b) => a.address.localeCompare(b.address))) !==
        canonical([...scope.resources].sort((a, b) => a.address.localeCompare(b.address)))
    )
      throw new Error('Original reviewed cleanup state or owned resources changed');
    await assertExecutorProcessGroupAbsent(lock);
    await scope.assertIndependentClosure();
  }
  async readStateIdentity() {
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const state = await privateRead(join3(this.#state().directory, 'terraform.tfstate'));
      const value = decode(state.toString());
      if (
        typeof value.lineage !== 'string' ||
        !value.lineage.trim() ||
        !Number.isSafeInteger(value.serial) ||
        value.serial < 0
      )
        throw new Error('Stable Terraform state identity unavailable');
      return { sha256: digest2(state), lineage: value.lineage, serial: value.serial };
    });
  }
  async #archivePlanAttempt() {
    const { directory } = this.#state();
    const files = new Map();
    for (const name of ['saved.tfplan', 'plan-receipt.json']) {
      try {
        files.set(name, await privateRead(join3(directory, name)));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    if (!files.size) return;
    for (const name of ['main.tf.json', 'deployment.json', '.terraform.lock.hcl', 'deployment.tfrc'])
      files.set(name, await privateRead(join3(directory, name)));
    const inventory = JSON.stringify(Object.fromEntries([...files].map(([name, bytes]) => [name, digest2(bytes)])));
    const archive = join3(directory, 'plan-history', digest2(inventory));
    await privateDirectory(archive);
    files.set('inventory.json', Buffer.from(inventory));
    for (const [name, bytes] of files) {
      try {
        await writeFile2(join3(archive, name), bytes, { mode: 384, flag: 'wx' });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if (digest2(await privateRead(join3(archive, name))) !== digest2(bytes))
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
      const resource = object3(value);
      const actions = changeActions(object3(resource.change).actions);
      if (
        typeof resource.address !== 'string' ||
        typeof resource.type !== 'string' ||
        changes.some((change) => change.address === resource.address)
      )
        throw new Error('Terraform resource change is malformed');
      changes.push({ address: resource.address, type: resource.type, actions });
    }
    const outputs = Object.values(object3(plan.output_changes ?? {})).map((output) =>
      changeActions(object3(output).actions, true),
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
        planSha256: digest2(await privateRead(join3(this.#state().directory, 'saved.tfplan'))),
        changes,
        noChanges,
        ...(actionInvocations.length ? { actionInvocations } : {}),
        ...(destroy ? { operation: 'destroy' } : {}),
      };
      await persist(join3(this.#state().directory, 'plan-receipt.json'), { state: 'planned', receipt });
      return receipt;
    });
  }
  async #assertActionUnsubmitted() {
    try {
      await privateRead(join3(this.#state().directory, 'action-attempt.json'));
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
      journal = decode((await privateRead(join3(directory, 'plan-receipt.json'))).toString());
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    if (!['applying', 'applied'].includes(String(journal.state))) return;
    const actions = object3(journal.receipt).actionInvocations;
    if (!Array.isArray(actions) || actions.length === 0) return;
    try {
      await privateRead(join3(directory, 'action-attempt.json'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await persist(join3(directory, 'action-attempt.json'), {
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
      const journal = decode((await privateRead(join3(directory, 'plan-receipt.json'))).toString());
      const receipt = object3(journal.receipt);
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
        const output = object3(outputs[name]);
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
      const journal = decode((await privateRead(join3(directory, 'plan-receipt.json'))).toString());
      if (
        journal.state !== 'applied' ||
        canonical(journal.receipt) !== canonical(receipt) ||
        receipt.deploymentId !== manifest.deploymentId ||
        receipt.engine !== 'terraform' ||
        receipt.backendIdentity !== manifest.backendIdentity ||
        receipt.configurationSha256 !== manifest.configurationSha256 ||
        receipt.providerLockSha256 !== manifest.providerLockSha256 ||
        receipt.planSha256 !== digest2(await privateRead(join3(directory, 'saved.tfplan')))
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
      const journal = decode((await privateRead(join3(directory, 'plan-receipt.json'))).toString());
      if (
        journal.state !== 'planned' ||
        canonical(journal.receipt) !== canonical(receipt) ||
        receipt.configurationSha256 !== manifest.configurationSha256 ||
        receipt.planSha256 !== digest2(await privateRead(join3(directory, 'saved.tfplan')))
      )
        throw new Error('Terraform identity inspection saved plan differs');
      const version = decode(await this.#run(['version', '-json'], env, signal));
      if (version.terraform_version !== manifest.terraformVersion) throw new Error('Terraform version changed');
      const plan = decode(await this.#run(['show', '-json', 'saved.tfplan'], env, signal));
      const changes = plan.resource_changes === undefined ? [] : plan.resource_changes;
      if (!Array.isArray(changes)) throw new Error('Terraform plan resource identities unavailable');
      const result = {};
      for (const [address, fields] of Object.entries(selections)) {
        const matches = changes.map(object3).filter((resource) => resource.address === address);
        if (matches.length > 1) throw new Error('Terraform resource identity is ambiguous');
        if (!matches.length) {
          result[address] = null;
          continue;
        }
        const change = object3(matches[0].change);
        if (change.before === null || change.before === undefined) {
          result[address] = null;
          continue;
        }
        const before = object3(change.before);
        const sensitivity =
          change.before_sensitive === undefined || change.before_sensitive === false
            ? {}
            : change.before_sensitive === true
              ? true
              : object3(change.before_sensitive);
        const selected = projectResourceFields(before, sensitivity, fields);
        result[address] = selected;
      }
      if (receipt.planSha256 !== digest2(await privateRead(join3(directory, 'saved.tfplan'))))
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
      const journalPath = join3(directory, 'plan-receipt.json'),
        planPath = join3(directory, 'saved.tfplan');
      const journalBytes = await privateRead(journalPath),
        planBytes = await privateRead(planPath);
      const journal = decode(journalBytes.toString()),
        stored = object3(journal.receipt);
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
        planSha256: digest2(planBytes),
        changes,
        noChanges,
        ...(stored.operation === 'destroy' ? { operation: 'destroy' } : {}),
      };
      if (canonical(stored) !== canonical(receipt))
        throw new Error('Current resource receipt differs from saved binary plan');
      const state = await this.#verifyApplyReceipt(receipt, ['planned']);
      if (
        digest2(journalBytes) !== digest2(await privateRead(journalPath)) ||
        digest2(planBytes) !== digest2(await privateRead(planPath))
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
    const journal = decode((await privateRead(join3(directory, 'plan-receipt.json'))).toString());
    const state = journal.state;
    if (
      !states.includes(state) ||
      canonical(journal.receipt) !== canonical(receipt) ||
      receipt.engine !== 'terraform' ||
      receipt.deploymentId !== manifest.deploymentId ||
      receipt.backendIdentity !== manifest.backendIdentity ||
      receipt.configurationSha256 !== manifest.configurationSha256 ||
      receipt.providerLockSha256 !== manifest.providerLockSha256 ||
      receipt.planSha256 !== digest2(await privateRead(join3(directory, 'saved.tfplan')))
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
      const statePath = join3(directory, 'terraform.tfstate');
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
      const module = object3(object3(state.values ?? {}).root_module ?? {});
      const resources = module.resources ?? [];
      if (!Array.isArray(resources)) throw new Error('Terraform state resource identities unavailable');
      if (
        (Array.isArray(module.child_modules) && module.child_modules.length) ||
        resources
          .map(object3)
          .some((resource) => typeof resource.address !== 'string' || !Object.hasOwn(selections, resource.address))
      )
        throw new Error('Foreign state resource requires reconciliation');
      const result = {};
      for (const [address, fields] of Object.entries(selections)) {
        const reviewed = receipt.changes.filter((change) => change.address === address);
        if (reviewed.length !== 1) throw new Error('Terraform state resource is outside the reviewed plan');
        const matches = resources.map(object3).filter((resource) => resource.address === address);
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
        result[address] = projectResourceFields(object3(resource.values), resource.sensitive_values, fields);
      }
      if (digest2(snapshot) !== digest2(await privateRead(statePath)))
        throw new Error('Terraform state changed during identity inspection');
      await this.#verifyInputs();
      if ((await this.#verifyApplyReceipt(receipt, states)) !== applyState)
        throw new Error('Terraform apply checkpoint changed during inspection');
      if (receipt.planSha256 !== digest2(await privateRead(join3(directory, 'saved.tfplan'))))
        throw new Error('Terraform saved plan changed during state identity inspection');
      return {
        schemaVersion: 1,
        applyState,
        planSha256: receipt.planSha256,
        stateSha256: digest2(snapshot),
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
    if (canonical(inspected.changes) !== canonical(receipt.changes) || inspected.noChanges !== receipt.noChanges)
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
      const row = object3(input),
        change = object3(row.change);
      if (
        typeof row.address !== 'string' ||
        typeof row.type !== 'string' ||
        (row.mode !== 'managed' && row.mode !== 'data') ||
        !Array.isArray(change.actions)
      )
        throw new Error('Exact original resource plan identity required');
      const phase = receipt.operation === 'destroy' ? 'before' : 'after';
      const values = change[phase] === null || change[phase] === undefined ? {} : object3(change[phase]);
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
      'deployment.json': digest2(await privateRead(join3(directory, 'deployment.json'))),
    };
    const fileKeys = ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'];
    const parentKeys = ['dev', 'ino', 'uid', 'mode'];
    for (const [name, hash] of Object.entries(hashes)) {
      const path = join3(directory, name),
        before = await lstat4(path, { bigint: true }),
        parent = await lstat4(dirname4(path), { bigint: true });
      const raw = await privateRead(path),
        after = await lstat4(path, { bigint: true }),
        finalParent = await lstat4(dirname4(path), { bigint: true });
      if (
        digest2(raw) !== hash ||
        fileKeys.some((key) => before[key] !== after[key]) ||
        parentKeys.some((key) => parent[key] !== finalParent[key])
      )
        throw new Error('Original owning plan input changed during admission');
      if (name === 'deployment.json' && canonical(decode(raw.toString())) !== canonical(manifest))
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
      const journal = decode((await privateRead(join3(this.#state().directory, 'plan-receipt.json'))).toString());
      if (journal.state !== 'planned') throw new Error('Saved plan is consumed or requires reconciliation');
      if (
        canonical(receipt) !== canonical(journal.receipt) ||
        receipt.engine !== 'terraform' ||
        receipt.deploymentId !== this.#state().manifest.deploymentId ||
        receipt.configurationSha256 !== this.#state().manifest.configurationSha256 ||
        receipt.providerLockSha256 !== this.#state().manifest.providerLockSha256 ||
        receipt.planSha256 !== digest2(await privateRead(join3(this.#state().directory, 'saved.tfplan')))
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
      if (receipt.planSha256 !== digest2(await privateRead(join3(this.#state().directory, 'saved.tfplan'))))
        throw new Error('Terraform saved plan changed during action inspection');
      if (expectedActions.length) {
        await this.#assertActionUnsubmitted();
        await persist(join3(this.#state().directory, 'action-attempt.json'), {
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
        await persist(join3(this.#state().directory, 'plan-receipt.json'), { state: 'applying', receipt });
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
      await persist(join3(this.#state().directory, 'plan-receipt.json'), { state: 'applied', receipt });
      if (this.#cleanup) {
        this.#cleanupEmpty = true;
        await this.#verifyCaptureCleanup();
      }
    });
  }
}

// plugins/terraform/src/installed-capture-context.ts
var fileKeys = ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'];
var parentKeys3 = ['dev', 'ino', 'uid', 'mode'];
var controls = (value) =>
  Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
function canonical2(path) {
  return typeof path === 'string' && isAbsolute4(path) && resolve4(path) === path && !controls(path);
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
      !canonical2(binding.path) ||
      !/^[a-f0-9]{64}$/.test(binding.sha256) ||
      paths.has(binding.path) ||
      !binding.expectedIdentity ||
      !binding.expectedParentIdentity ||
      fileKeys.some(
        (key) =>
          typeof binding.expectedIdentity?.[key] !== 'string' ||
          !/^(?:0|[1-9][0-9]*)$/.test(binding.expectedIdentity[key]),
      ) ||
      parentKeys3.some(
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
    !canonical2(admission.executionDirectory) ||
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
import { createHash as createHash6, createHash as createHash15, randomUUID as randomUUID7 } from 'node:crypto';
import { constants as constants7 } from 'node:fs';
import {
  lstat as lstat11,
  mkdir as mkdir6,
  open as open8,
  readdir as readdir3,
  readFile as readFile7,
  realpath as realpath10,
  writeFile as writeFile5,
} from 'node:fs/promises';
import { homedir as homedir2 } from 'node:os';
import { dirname as dirname11, isAbsolute as isAbsolute12, join as join14, resolve as resolve12 } from 'node:path';

// plugins/gcloud/src/ce/types.ts
var GCP_CE_IMAGE_PROJECT = 'f5-7626-networks-public';
var GCP_CE_OPERATIONS = [
  'deploy',
  'reconcile',
  'start',
  'stop',
  'resize',
  'update-network',
  'replace-node',
  'repair',
  'upgrade',
  'failover',
  'teardown',
];

// plugins/gcloud/src/gcloud/types.ts
var PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

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
var GCP_CURRENT_SITE_ACCESS_MAPPING = Object.freeze({
  ...GCP_SITE_ACCESS_MAPPING,
  version: '15.15.7',
  sourceSchemaSha256: 'f5f3daf876eb3489054cab23d68af266265ec7b1b6ec84d52117283ae70ed6e6',
});
var GCP_XCSH15162_SITE_ACCESS_MAPPING = Object.freeze({
  ...GCP_SITE_ACCESS_MAPPING,
  version: '15.16.2',
  sourceSchemaSha256: 'b09164cac44b715bf40fb5d26afc65b02c6d181cfb516ae54cf5b3e6c647af25',
});
var GCP_PUBLISHED_SITE_ACCESS_MAPPING = Object.freeze({
  ...GCP_SITE_ACCESS_MAPPING,
  version: '15.17.3',
  sourceSchemaSha256: 'b09164cac44b715bf40fb5d26afc65b02c6d181cfb516ae54cf5b3e6c647af25',
});
function resolveGcpSiteAccessMapping(providerVersion) {
  if (providerVersion === GCP_SITE_ACCESS_MAPPING.version) return GCP_SITE_ACCESS_MAPPING;
  if (providerVersion === GCP_CURRENT_SITE_ACCESS_MAPPING.version) return GCP_CURRENT_SITE_ACCESS_MAPPING;
  if (providerVersion === GCP_XCSH15162_SITE_ACCESS_MAPPING.version) return GCP_XCSH15162_SITE_ACCESS_MAPPING;
  if (providerVersion === GCP_PUBLISHED_SITE_ACCESS_MAPPING.version) return GCP_PUBLISHED_SITE_ACCESS_MAPPING;
  throw new GcpSiteAccessMappingUnavailable();
}

class GcpSiteAccessMappingUnavailable extends Error {
  constructor() {
    super(
      'Site SSH requires the two-interface external-IP Terraform HA profile and published XC 15.13.0, 15.15.7, 15.16.2 or 15.17.3 mapping',
    );
  }
}
function validateGcpSiteAccess(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Site SSH access object required');
  const access = value;
  if (
    Object.keys(value).sort().join(',') !== 'profile,publicKey,schemaVersion' ||
    access.schemaVersion !== 1 ||
    access.profile !== 'site-ssh-sli' ||
    typeof access.publicKey !== 'string' ||
    access.publicKey.length > 8192
  )
    throw new Error('Site SSH access requires the versioned SLI-only public-key profile');
  const match = /^ssh-ed25519 ([A-Za-z0-9+/]+={0,2})$/.exec(access.publicKey);
  if (!match) throw new Error('Site SSH requires one Ed25519 public key without options or comments');
  const bytes = Buffer.from(match[1], 'base64');
  if (
    bytes.length !== 51 ||
    bytes.toString('base64') !== match[1] ||
    bytes.readUInt32BE(0) !== 11 ||
    !bytes.subarray(4, 15).equals(Buffer.from('ssh-ed25519')) ||
    bytes.readUInt32BE(15) !== 32
  )
    throw new Error('Site SSH public key wire format differs');
}
function assertGcpSiteAccessProfile(intent) {
  if (intent.initialAccess === undefined) return;
  validateGcpSiteAccess(intent.initialAccess);
  if (
    intent.engine !== 'terraform' ||
    intent.sites.length !== 1 ||
    intent.sites[0].nodes.length !== 3 ||
    intent.sites[0].nodes.some(
      (node) => node.interfaces.length !== 2 || node.interfaces[0].role !== 'slo' || node.interfaces[1].role !== 'sli',
    ) ||
    intent.egress.mode !== 'external-ip' ||
    intent.ingress.profile !== 'none' ||
    intent.routing.profile !== 'static-insertion' ||
    intent.routing.destinationCidrs.length !== 0
  )
    throw new GcpSiteAccessMappingUnavailable();
}
function gcpSiteAccessSpec(intent, providerVersion) {
  if (intent.initialAccess === undefined) return;
  assertGcpSiteAccessProfile(intent);
  resolveGcpSiteAccessMapping(providerVersion);
  return {
    admin_user_credentials: { ssh_key: intent.initialAccess.publicKey },
    blocked_services: {
      blocked_service: [
        { network_type: 'VIRTUAL_NETWORK_SITE_LOCAL', ssh: {} },
        ...['VIRTUAL_NETWORK_SITE_LOCAL', 'VIRTUAL_NETWORK_SITE_LOCAL_INSIDE'].flatMap((network_type) => [
          { network_type, dns: {} },
          { network_type, web_user_interface: {} },
        ]),
      ],
    },
  };
}

// plugins/gcloud/src/ce/observer-scope.ts
var GCP_TERRAFORM_OBSERVER_IMAGE = Object.freeze({
  project: 'ubuntu-os-cloud',
  name: 'ubuntu-2404-noble-amd64-v20261021',
  id: '4996011480491275419',
});
function assertGcpTerraformObserverScope(scope, intent) {
  if (
    !scope ||
    typeof scope !== 'object' ||
    Array.isArray(scope) ||
    Object.keys(scope).sort().join(',') !== 'profile,publicKey,schemaVersion,sshSourceCidr' ||
    scope.schemaVersion !== 1 ||
    scope.profile !== 'original-ha-observer'
  )
    throw new Error('Exact versioned original observer scope required');
  validateGcpSiteAccess({ schemaVersion: 1, profile: 'site-ssh-sli', publicKey: scope.publicKey });
  assertGcpSiteAccessProfile(intent);
  if (!intent.initialAccess || intent.initialAccess.publicKey === scope.publicKey)
    throw new Error('Distinct observer and CE campaign public keys required');
  if (typeof scope.sshSourceCidr !== 'string') throw new Error('One exact observer SSH source required');
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/32$/.exec(scope.sshSourceCidr);
  if (
    !match ||
    match[0] !== scope.sshSourceCidr ||
    match.slice(1).some((part) => Number(part) > 255 || String(Number(part)) !== part) ||
    [0, 127].includes(Number(match[1])) ||
    Number(match[1]) >= 224 ||
    (Number(match[1]) === 169 && Number(match[2]) === 254)
  )
    throw new Error('Observer SSH requires one canonical unicast IPv4 /32 source');
}
function gcpTerraformObserverIdentity(intent) {
  if (intent.schemaVersion !== 2 || !intent.observer) throw new Error('Versioned observer intent required');
  assertGcpTerraformObserverScope(intent.observer, intent);
  const name = `${intent.deploymentName}-observer`,
    firewallName = `${name}-ssh`;
  if (firewallName.length > 63 || intent.sites[0].nodes.some((node) => node.name === name))
    throw new Error('Derived observer identities collide or exceed GCP name limits');
  const sli = intent.sites[0].nodes[0].interfaces[1];
  return {
    name,
    key: name.replaceAll('-', '_'),
    firewallName,
    firewallKey: firewallName.replaceAll('-', '_'),
    zone: intent.sites[0].nodes[0].zone,
    network: sli.network,
    subnet: sli.subnet,
  };
}

// plugins/gcloud/src/ce/validation.ts
var NAME = /^[a-z][a-z0-9-]{0,61}[a-z0-9]$|^[a-z]$/;
function validateScope(project, region) {
  if (!PROJECT_ID_PATTERN.test(project)) throw new Error('Invalid explicit GCP project');
  if (region !== undefined && !/^[a-z]+(?:-[a-z]+)+\d$/.test(region)) throw new Error('Invalid GCP region');
}
function name2(value) {
  if (typeof value !== 'string' || !NAME.test(value)) throw new Error('Invalid GCP resource name');
}
function ipv4Range(cidr) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(cidr);
  if (!match) throw new Error('Invalid IPv4 CIDR');
  const octets = match.slice(1, 5).map(Number);
  const prefix = Number(match[5]);
  if (octets.some((value) => value > 255) || prefix > 32) throw new Error('Invalid IPv4 CIDR');
  const ip = octets.reduce((value, octet) => value * 256 + octet, 0);
  const size = 2 ** (32 - prefix);
  if (ip % size !== 0) throw new Error('CIDR must use a network boundary');
  return [ip, ip + size - 1];
}
function validateImage(image) {
  name2(image.name);
  if (!/^f5xc-ce(?:-crt|crt)-[a-z0-9-]+$/.test(image.name)) throw new Error('Image is not an F5 CE image');
  const expected = `https://www.googleapis.com/compute/v1/projects/${GCP_CE_IMAGE_PROJECT}/global/images/${image.name}`;
  if (
    !/^\d+$/.test(image.id) ||
    image.selfLink !== expected ||
    image.status !== 'READY' ||
    image.architecture !== 'X86_64'
  )
    throw new Error('Image must pin an exact ready x86 F5-owned image identity');
  if (
    !Array.isArray(image.licenses) ||
    image.licenses.length === 0 ||
    image.licenses.some(
      (license) =>
        !/^https:\/\/www\.googleapis\.com\/compute\/v1\/projects\/[a-z][a-z0-9-]+\/global\/licenses\/[a-z0-9-]+$/.test(
          license,
        ),
    )
  )
    throw new Error('Image must pin its exact license identities');
}
function keys2(value, allowed) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error('Unsupported intent field');
}
function validateIntent(intent) {
  if (intent?.schemaVersion !== 1 && intent?.schemaVersion !== 2) throw new Error('Unsupported GCP CE intent version');
  if (
    (intent.schemaVersion === 1 && Object.hasOwn(intent, 'observer')) ||
    (intent.schemaVersion === 2 && !intent.observer)
  )
    throw new Error('Observer scope requires its complete version2 intent');
  keys2(intent, [
    'schemaVersion',
    'project',
    'region',
    'deploymentName',
    'platformContext',
    'engine',
    'operation',
    'sites',
    'machineType',
    'diskGiB',
    'image',
    'ipForwarding',
    'initialVersions',
    'initialAccess',
    ...(intent.schemaVersion === 2 ? ['observer'] : []),
    'egress',
    'ingress',
    'routing',
  ]);
  keys2(intent.image, ['id', 'name', 'selfLink', 'licenses', 'architecture', 'status']);
  keys2(intent.egress, ['mode', 'resource']);
  keys2(intent.ingress, ['profile']);
  keys2(intent.routing, ['profile', 'destinationCidrs']);
  validateScope(intent.project, intent.region);
  name2(intent.deploymentName);
  name2(intent.machineType);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/.test(intent.platformContext)) throw new Error('Explicit F5 context required');
  if (!['native', 'terraform'].includes(intent.engine)) throw new Error('Explicit owning engine required');
  if (!GCP_CE_OPERATIONS.includes(intent.operation)) throw new Error('Unsupported CE operation');
  if (intent.ipForwarding !== true) throw new Error('CE requires IP forwarding');
  if (!Number.isInteger(intent.diskGiB) || intent.diskGiB < 80) throw new Error('CE disk requires at least 80 GiB');
  validateImage(intent.image);
  if (intent.initialAccess !== undefined) validateGcpSiteAccess(intent.initialAccess);
  if (intent.initialVersions) {
    keys2(intent.initialVersions, ['software', 'os']);
    if (
      !/^crt-\d{8}-\d{4}$/.test(intent.initialVersions.software) ||
      !/^\d+\.\d{4}\.\d+$/.test(intent.initialVersions.os)
    )
      throw new Error('Explicit initial software/OS version pair required');
  }
  if (!['external-ip', 'cloud-nat', 'firewall', 'proxy'].includes(intent.egress.mode))
    throw new Error('Unsupported egress');
  if (['firewall', 'proxy'].includes(intent.egress.mode) && !intent.egress.resource)
    throw new Error('Explicit egress resource required');
  if (!['none', 'internal-passthrough-lb'].includes(intent.ingress.profile)) throw new Error('Unsupported ingress');
  if (!['static-insertion', 'ilb-next-hop', 'ncc-router-appliance'].includes(intent.routing.profile))
    throw new Error('Unsupported routing');
  for (const cidr of intent.routing.destinationCidrs) ipv4Range(cidr);
  if (!Array.isArray(intent.sites) || !intent.sites.length) throw new Error('Explicitly named sites required');
  const sites = new Set();
  const nodes = new Set();
  for (const site of intent.sites) {
    keys2(site, ['name', 'nodes']);
    name2(site.name);
    if (sites.has(site.name)) throw new Error('Independent sites require unique names');
    sites.add(site.name);
    if (![1, 3].includes(site.nodes.length)) throw new Error('Sites require one node or three HA nodes');
    let shape;
    for (const node of site.nodes) {
      keys2(node, ['name', 'zone', 'interfaces']);
      name2(node.name);
      if (nodes.has(node.name)) throw new Error('Node names must be unique');
      nodes.add(node.name);
      if (!new RegExp(`^${intent.region}-[a-z]$`).test(node.zone))
        throw new Error('Node zone must belong to the explicit region');
      if (!node.interfaces.length || node.interfaces.length > 8)
        throw new Error('CE requires 1-8 interfaces; machine limit remains a separate gate');
      const networks = new Set();
      const ranges = [];
      for (const [index, nic] of node.interfaces.entries()) {
        keys2(nic, ['index', 'role', 'vrf', 'network', 'subnet', 'cidr']);
        if (nic.index !== index || (index === 0 && nic.role !== 'slo'))
          throw new Error('Contiguous NIC order must start with SLO');
        if (!['slo', 'sli', 'management'].includes(nic.role) || (index > 0 && nic.role === 'slo'))
          throw new Error('Invalid NIC role');
        name2(nic.vrf);
        name2(nic.network);
        name2(nic.subnet);
        if (networks.has(nic.network)) throw new Error('Each NIC requires a distinct VPC');
        networks.add(nic.network);
        const range = ipv4Range(nic.cidr);
        if (ranges.some(([start, end]) => range[0] <= end && start <= range[1]))
          throw new Error('NIC subnets must not overlap');
        ranges.push(range);
      }
      const current = JSON.stringify(
        node.interfaces.map(({ index, role, vrf, network, subnet, cidr }) => [index, role, vrf, network, subnet, cidr]),
      );
      if (shape !== undefined && shape !== current)
        throw new Error('HA NIC order, networks, subnets and VRFs must be homogeneous');
      shape = current;
    }
  }
  if (intent.schemaVersion === 2) {
    const observer = intent.observer;
    if (!observer) throw new Error('Versioned observer scope required');
    assertGcpTerraformObserverScope(observer, intent);
    gcpTerraformObserverIdentity(intent);
  }
}

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

// plugins/terraform/src/gcp-inventory-target.ts
var validName = (value) => typeof value === 'string' && /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
function compileGcpInventoryResourceTarget(project, input) {
  if (!validName(project) || !input) throw new Error('Original Compute inventory scope required');
  const target = Object.freeze({ ...input });
  if (!validName(target.name)) throw new Error('Original Compute inventory name required');
  const keys = Object.keys(target).sort().join(',');
  let path;
  if (target.kind === 'disk' && keys === 'kind,name,zone' && validName(target.zone))
    path = `projects/${project}/zones/${target.zone}/disks/${target.name}`;
  else if (target.kind === 'subnetwork' && keys === 'kind,name,region' && validName(target.region))
    path = `projects/${project}/regions/${target.region}/subnetworks/${target.name}`;
  else if (['network', 'firewall'].includes(target.kind) && keys === 'kind,name')
    path = `projects/${project}/global/${target.kind}s/${target.name}`;
  else throw new Error('Original Compute inventory target differs');
  return Object.freeze({ target, path, selfLink: `https://www.googleapis.com/compute/v1/${path}` });
}

// plugins/terraform/src/gcp-observer-image-pin.ts
var GCP_OBSERVER_IMAGE_PIN = Object.freeze({
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
var hash4 = (value) => createHash7('sha256').update(value).digest('hex');
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
    hash4(credential.client_id) !== audienceSha256 ||
    (credential.quota_project_id !== undefined && credential.quota_project_id !== project) ||
    (credential.token_uri !== undefined && credential.token_uri !== tokenEndpoint) ||
    (credential.universe_domain !== undefined && credential.universe_domain !== 'googleapis.com') ||
    (credential.account !== undefined &&
      credential.account !== '' &&
      (typeof credential.account !== 'string' || hash4(credential.account) !== accountSha256))
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
    hash4(info.email) !== accountSha256 ||
    info.verified_email !== true ||
    typeof info.audience !== 'string' ||
    hash4(info.audience) !== audienceSha256 ||
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
    snapshotSha256: hash4(credentialBytes),
    accountSha256,
    audienceSha256,
    verifiedAt,
    expiresNoEarlierThan,
    executionAuthorized: false,
  };
  return {
    receipt: Object.freeze({ ...receipt, authenticationReceiptSha256: hash4(JSON.stringify(receipt)) }),
    accessToken: refresh.access_token,
  };
}
async function authenticateGoogleAdc(input, signal, fetcher = fetch) {
  return (await authenticateGoogleAdcSession(input, signal, fetcher)).receipt;
}

class GoogleComputeReadError extends AggregateError {
  capture;
  constructor(capture, failures) {
    super(failures, 'Original Google Compute read incomplete');
    this.capture = capture;
  }
}
var computeMaximum = 4 * 1024 * 1024;
var resourceName2 = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
var operationName = /^(?:[a-z](?:[-a-z0-9]{0,61}[a-z0-9])?|[1-9][0-9]{0,19})$/;
var offset = /^(?:0|[1-9][0-9]{0,19})$/;
var serialOffset = (value) => typeof value === 'string' && offset.test(value) && BigInt(value) <= 9223372036854775807n;
async function openGoogleAdcComputeReader(input, signal, fetcher = fetch) {
  const original = Object.freeze({ ...input, credentialBytes: Buffer.from(input.credentialBytes) });
  let session = await authenticateGoogleAdcSession(original, signal, fetcher);
  let refreshing;
  const guard = async () => {
    signal?.throwIfAborted();
    try {
      await original.assertOriginal();
    } catch {
      throw new Error('Original Google Compute reader inputs changed');
    }
  };
  const readRaw = async (url, body, requestSignal, maximumBytes = computeMaximum) => {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0 || maximumBytes > computeMaximum)
      throw new Error('Original Google response byte bound required');
    const combined = requestSignal ? (signal ? AbortSignal.any([signal, requestSignal]) : requestSignal) : signal;
    combined?.throwIfAborted();
    await guard();
    if (Date.now() >= session.receipt.expiresNoEarlierThan - 60000) {
      refreshing ??= authenticateGoogleAdcSession(original, combined, fetcher);
      try {
        session = await refreshing;
      } finally {
        refreshing = undefined;
      }
    }
    await guard();
    combined?.throwIfAborted();
    const began = Date.now();
    const chunks = [];
    const failures = [];
    let size = 0;
    let status = 0;
    let complete = false;
    let truncated = false;
    try {
      const bounded = combined ? AbortSignal.any([combined, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000);
      const response = await fetcher(url, {
        method: body === undefined ? 'GET' : 'POST',
        redirect: 'error',
        signal: bounded,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body }),
      });
      status = response.status;
      if (!response.body) throw new Error('Missing cloud body');
      const stream = response.body.getReader();
      let abortCancellation;
      const cancelOnAbort = () => {
        abortCancellation = stream.cancel();
        abortCancellation.catch(() => {});
      };
      bounded.addEventListener('abort', cancelOnAbort, { once: true });
      try {
        for (;;) {
          bounded.throwIfAborted();
          const { value, done } = await stream.read();
          bounded.throwIfAborted();
          if (done) break;
          const available = Math.max(0, maximumBytes - size);
          chunks.push(Buffer.from(value.subarray(0, available)));
          size += value.length;
          if (size > maximumBytes) {
            truncated = true;
            throw new Error('Cloud read exceeds bound');
          }
        }
        complete = true;
      } finally {
        bounded.removeEventListener('abort', cancelOnAbort);
        if (abortCancellation) {
          try {
            await abortCancellation;
          } catch (error) {
            complete = false;
            failures.push(new Error('Google Compute abort closure failed', { cause: error }));
          }
        }
        try {
          await stream.cancel();
        } catch (error) {
          complete = false;
          failures.push(new Error('Google Compute stream closure failed', { cause: error }));
        }
        stream.releaseLock();
      }
    } catch (error) {
      failures.push(new Error('Google Compute read transport failed', { cause: error }));
    }
    try {
      await guard();
    } catch (error) {
      complete = false;
      failures.push(error);
    }
    const finishedAt = Date.now();
    if (finishedAt < began || finishedAt - began > 60000) {
      complete = false;
      failures.push(new Error('Bounded original Compute response required'));
    }
    const result = {
      raw: Buffer.concat(chunks),
      status,
      startedAt: began,
      finishedAt,
      complete,
      truncated,
    };
    if (failures.length) throw new GoogleComputeReadError(result, failures);
    return result;
  };
  const read = async (zone, name, start, operation = false) => {
    if (
      !resourceName2.test(zone) ||
      !(operation ? operationName : resourceName2).test(name) ||
      (operation && /^[0-9]+$/.test(name) && BigInt(name) > 18446744073709551615n) ||
      (start !== undefined && (!serialOffset(start) || operation))
    )
      throw new Error('Fixed named Google Compute read required');
    const base = `https://compute.googleapis.com/compute/v1/projects/${original.project}/zones/${zone}/${operation ? 'operations' : 'instances'}/${name}`;
    const url = start === undefined ? base : `${base}/serialPort?port=1&start=${start}`;
    return readRaw(url);
  };
  return Object.freeze({
    authentication: session.receipt,
    observerImage: (...args) => {
      if (args.length) throw new Error('Original fixed observer image read takes no arguments');
      return readRaw(
        `https://compute.googleapis.com/compute/v1/projects/${GCP_OBSERVER_IMAGE_PIN.project}/global/images/${GCP_OBSERVER_IMAGE_PIN.name}`,
      );
    },
    resource: (target, requestSignal) => {
      const compiled = compileGcpInventoryResourceTarget(original.project, target);
      return readRaw(`https://compute.googleapis.com/compute/v1/${compiled.path}`, undefined, requestSignal);
    },
    instance: (zone, name) => read(zone, name),
    serial: (zone, name, start) => read(zone, name, start),
    operation: (zone, name) => read(zone, name, undefined, true),
    auditInstanceInsert: (zone, node, window, pageToken, requestSignal, maximumBytes = computeMaximum) => {
      const query = compileGcpInsertAuditQuery(original.project, zone, node, window);
      if (
        pageToken !== undefined &&
        (typeof pageToken !== 'string' || !pageToken || pageToken.length > 8192 || hasAuditControlCharacters(pageToken))
      )
        throw new Error('Original audit continuation required');
      return readRaw(
        'https://logging.googleapis.com/v2/entries:list',
        JSON.stringify({ ...query, ...(pageToken === undefined ? {} : { pageToken }) }),
        requestSignal,
        maximumBytes,
      );
    },
  });
}

// plugins/terraform/src/installed-apply-controller.ts
import { randomUUID as randomUUID3 } from 'node:crypto';

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
var lifetimes = new WeakMap();
var groupClosures = new WeakMap();
async function acknowledgeOriginalApplyGroupClosure(callback, completion) {
  const acknowledge = callback && typeof callback === 'object' ? groupClosures.get(callback) : undefined;
  if (!acknowledge) throw new Error('Original final apply callback required for group closure');
  await acknowledge(completion);
}
async function assertOriginalApplyLifetime(value) {
  const verify = lifetimes.get(value);
  if (!verify) throw new Error('Original operation lifetime callback required');
  await verify();
}
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
    if (phase === 'after') {
      let claimed;
      let acknowledgement;
      const verifyClosure = async (candidate) => {
        await assertOriginalApplyCallback(value);
        const completion = candidate;
        const source = readOriginalExecutionCompletion(execution.output, completion);
        const prefix = await readOriginalExecutionPrefix(execution.output);
        if (
          source.directory !== original.executionDirectory ||
          prefix.directory !== original.executionDirectory ||
          !sameIdentity(source.identity, execution.identity) ||
          !sameIdentity(prefix.identity, execution.identity) ||
          source.completion.originalGroupClosed !== true ||
          prefix.stdout.bytes !== source.completion.stdout.bytes ||
          prefix.stdout.sha256 !== source.completion.stdout.sha256 ||
          prefix.stderr.bytes !== source.completion.stderr.bytes ||
          prefix.stderr.sha256 !== source.completion.stderr.sha256
        )
          throw new Error('Original final group closure source or complete prefix differs');
        await assertOriginalApplyCallback(value);
        readOriginalExecutionCompletion(execution.output, completion);
        return source;
      };
      let verificationQueue = Promise.resolve();
      const acknowledge = async (candidate) => {
        await verifyClosure(candidate);
        if (acknowledgement) {
          if (claimed !== candidate) throw new Error('Original group closure already claimed by another completion');
          await acknowledgement;
          await verifyClosure(candidate);
          return;
        }
        claimed = candidate;
        acknowledgement = (async () => {
          try {
            const source = await verifyClosure(candidate);
            await record('group-closure-source', {
              originalGroupClosed: true,
              sourceStdoutBytes: source.completion.stdout.bytes,
              sourceStdoutSha256: source.completion.stdout.sha256,
              sourceStderrBytes: source.completion.stderr.bytes,
              sourceStderrSha256: source.completion.stderr.sha256,
            });
            await verifyClosure(candidate);
            groupClosed = true;
          } catch (error) {
            await refuse('group-closure-failed', error);
          }
        })();
        await acknowledgement;
      };
      groupClosures.set(value, (candidate) => {
        const pending = verificationQueue.then(() => acknowledge(candidate));
        verificationQueue = pending.then(
          () => {
            return;
          },
          () => {
            return;
          },
        );
        return pending;
      });
    }
    if (phase === 'before') {
      const identity = () => {
        if (closed || finalStarted || !started || !sameIdentity(execution.identity, started.identity))
          throw new Error('Original operation lifetime retired or identity changed');
      };
      lifetimes.set(value, async () => {
        identity();
        await within();
        identity();
      });
    }
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
import { isAbsolute as isAbsolute5, join as join4, resolve as resolve5 } from 'node:path';

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
    if (!isAbsolute5(input.groupDirectory) || resolve5(input.groupDirectory) !== input.groupDirectory)
      throw new Error('Original installed capture directory required');
    const groupInputs = freezeAdmittedCaptureInputs(input.groupInputs);
    if (
      Object.keys(groupInputs).sort().join(',') !== 'claim,lifetime' ||
      groupInputs.claim.path !== join4(input.groupDirectory, 'claim.json') ||
      groupInputs.lifetime.path !== join4(input.groupDirectory, 'lifetime.json')
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
import { constants as constants3, watch as watch2 } from 'node:fs';
import { lstat as lstat5, open as open3, realpath as realpath4 } from 'node:fs/promises';
// plugins/terraform/src/installed-gcp-invocation.ts
import {
  dirname as dirname5,
  isAbsolute as isAbsolute6,
  isAbsolute as isAbsolute9,
  join as join10,
  resolve as resolve6,
  resolve as resolve9,
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
var hash5 = (value) => createHash8('sha256').update(value).digest('hex');
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
  const stat = await lstat5(path, { bigint: true });
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
    !isAbsolute6(expected.directory) ||
    resolve6(expected.directory) !== expected.directory ||
    !isAbsolute6(lease.snapshotPath) ||
    resolve6(lease.snapshotPath) !== lease.snapshotPath ||
    dirname5(lease.snapshotPath) !== expected.directory ||
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
  const originalDirectory = await lstat5(expected.directory, { bigint: true });
  const directory = async () => {
    const current = await lstat5(expected.directory, { bigint: true });
    if (
      !current.isDirectory() ||
      current.isSymbolicLink() ||
      current.uid !== BigInt(process.getuid?.() ?? -1) ||
      (current.mode & 0o777n) !== 0o700n ||
      current.dev !== originalDirectory.dev ||
      current.ino !== originalDirectory.ino ||
      (await realpath4(expected.directory)) !== expected.directory
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
      const handle = await open3(lease.snapshotPath, constants3.O_RDONLY | constants3.O_NOFOLLOW);
      try {
        const opened = await handle.stat({ bigint: true });
        if (opened.dev !== original.dev || opened.ino !== original.ino || !opened.isFile())
          throw new Error('Original Google ADC snapshot replaced during open');
        const bytes = await handle.readFile();
        if (hash5(bytes) !== lease.snapshotSha256 || !sameMetadata(original, await fileMetadata(lease.snapshotPath)))
          throw new Error('Original Google ADC snapshot bytes changed');
        const credential = JSON.parse(bytes.toString('utf8'));
        if (
          credential?.type !== 'authorized_user' ||
          typeof credential.client_id !== 'string' ||
          hash5(credential.client_id) !== lease.audienceSha256 ||
          typeof credential.client_secret !== 'string' ||
          !credential.client_secret ||
          typeof credential.refresh_token !== 'string' ||
          !credential.refresh_token ||
          (credential.quota_project_id !== undefined && credential.quota_project_id !== lease.owner.account) ||
          (credential.token_uri !== undefined && credential.token_uri !== 'https://oauth2.googleapis.com/token') ||
          (credential.universe_domain !== undefined && credential.universe_domain !== 'googleapis.com') ||
          (credential.account !== undefined &&
            credential.account !== '' &&
            (typeof credential.account !== 'string' || hash5(credential.account) !== lease.accountSha256)) ||
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
// plugins/terraform/src/bootstrap-grant-publication.ts
import {
  createHash as createHash10,
  createHash as createHash13,
  generateKeyPairSync,
  randomBytes,
  sign,
} from 'node:crypto';
import { constants as constants5, constants as constants6 } from 'node:fs';
import {
  chmod as chmod2,
  lstat as lstat8,
  mkdir as mkdir5,
  open as open5,
  open as open7,
  readFile as readFile5,
  realpath as realpath7,
} from 'node:fs/promises';
import {
  dirname as dirname8,
  isAbsolute as isAbsolute8,
  join as join6,
  join as join9,
  resolve as resolve8,
} from 'node:path';

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

// plugins/terraform/src/signal-free-executor.ts
import { createHash as createHash9, randomUUID as randomUUID4 } from 'node:crypto';
import { constants as constants4, watch as watch3 } from 'node:fs';
import {
  lstat as lstat6,
  mkdir as mkdir3,
  open as open4,
  readFile as readFile4,
  realpath as realpath5,
  stat as stat2,
  writeFile as writeFile3,
} from 'node:fs/promises';
import { dirname as dirname6, isAbsolute as isAbsolute7, join as join5, resolve as resolve7 } from 'node:path';

var hash6 = (value) => createHash9('sha256').update(value).digest('hex');
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
    !isAbsolute7(binding.path) ||
    resolve7(binding.path) !== binding.path ||
    !/^[a-f0-9]{64}$/.test(binding.sha256)
  )
    throw new Error('Reviewed original executable binding required');
  const canonical = await realpath5(binding.path);
  const original = await stat2(canonical, { bigint: true });
  const link = await lstat6(binding.path, { bigint: true });
  if (
    !original.isFile() ||
    original.uid !== BigInt(process.getuid?.() ?? -1) ||
    original.nlink !== 1n ||
    (original.mode & 0o022n) !== 0n ||
    (original.mode & 0o111n) === 0n ||
    hash6(await readFile4(canonical)) !== binding.sha256
  )
    throw new Error('Owned pinned original executable required');
  let changed = false;
  const watcher = watch3(canonical, { persistent: false }, () => {
    changed = true;
  });
  const parent = watch3(dirname6(binding.path), { persistent: false }, (_event, name) => {
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
      const currentLink = await lstat6(binding.path, { bigint: true });
      if (
        changed ||
        (await realpath5(binding.path)) !== canonical ||
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
function signalFreeFinalReaderExecutor(input, reserve) {
  const original = inspectFinalReaderReserve(reserve);
  if (input.python.path !== input.executable.path || input.python.sha256 !== input.executable.sha256)
    throw new Error('Original final readers require the same pinned interpreter');
  if (input.originalStartMs !== original.originalStartMs || input.originalDeadlineMs !== original.originalDeadlineMs)
    throw new Error('Original parent reader operation budget differs');
  if (input.timeoutMs !== undefined && input.timeoutMs > 60000)
    throw new Error('Final reader commands have a sixty-second limit');
  const execute = originalExecutor({ ...input, timeoutMs: input.timeoutMs ?? 60000 }, reserve);
  return async (invocation) => {
    if (
      invocation.args.length < 3 ||
      invocation.args[0] !== '-I' ||
      invocation.args[1] !== '-B' ||
      !isAbsolute7(invocation.args[2])
    )
      throw new Error('Exact isolated final reader script arguments required');
    return execute(invocation);
  };
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
    const directory = await lstat6(cwd);
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
    const root = join5(cwd, 'executor-diagnostics', randomUUID4());
    await mkdir3(root, { recursive: true, mode: 448 });
    const script = join5(root, 'gate.py');
    const bootstrap = join5(root, 'bootstrap.json');
    await writeFile3(script, signalFreeBootstrapSource, { flag: 'wx', mode: 256 });
    const stdoutPath = join5(root, 'stdout.private');
    const stderrPath = join5(root, 'stderr.private');
    const stdout = await open4(
      stdoutPath,
      constants4.O_CREAT | constants4.O_EXCL | constants4.O_WRONLY | constants4.O_NOFOLLOW,
      384,
    );
    const stderr = await open4(
      stderrPath,
      constants4.O_CREAT | constants4.O_EXCL | constants4.O_WRONLY | constants4.O_NOFOLLOW,
      384,
    );
    const outIdentity = await stdout.stat({ bigint: true });
    const errIdentity = await stderr.stat({ bigint: true });
    const lock = join5(cwd, '.terraform-executor-lock');
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
    let finalCaptureActive = false;
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
      const path = join5(root, `startup-${phase}-failure.private.json`);
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
        startupEvidence.push(Object.freeze({ schemaVersion: 1, phase, path, sha256: hash6(Buffer.from(raw)) }));
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
      const path = join5(root, 'input-failure.private.json');
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
        inputFailureEvidence = Object.freeze({ schemaVersion: 1, path, sha256: hash6(Buffer.from(raw)) });
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
          current = await lstat6(path, { bigint: true });
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
        const evidence = JSON.parse(await readFile4(bootstrap, 'utf8'));
        const raw = await readFile4(`/proc/${child.pid}/stat`, 'utf8');
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
          evidence.boot !== (await readFile4('/proc/sys/kernel/random/boot_id', 'utf8')).trim() ||
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
                  directory: cwd,
                  identity: originalIdentity,
                  stdout: { path: stdoutPath, writer: stdout },
                  stderr: { path: stderrPath, writer: stderr },
                  maximum,
                  assertInputs: async () => {
                    await python.require();
                    await executable.require();
                    if (finalCaptureActive && policy.assertFinalInputs) {
                      if (reserve) await assertFinalReaderReserve(reserve);
                      await policy.assertFinalInputs();
                      if (reserve) await assertFinalReaderReserve(reserve);
                    } else await assertOriginal();
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
          join5(root, 'submission.private.json'),
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
        await writeFile3(join5(root, 'final.private.json'), JSON.stringify(capture), { mode: 256, flag: 'wx' });
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
              finalCaptureActive = true;
              await policy.finalCapture(Object.freeze({ ...capture, ...startupFields() }));
            } finally {
              finalCaptureActive = false;
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
          join5(root, 'completion.private.json'),
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
      const stderrBytes = await readFile4(stderrPath);
      const categories = new Set(terraformFailureCategories(stderrBytes.toString('utf8')));
      const category = categories.size === 1 ? [...categories][0] : 'unknown';
      return {
        code: actualExitCode,
        stdout: await readFile4(stdoutPath, 'utf8'),
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
            join5(lock, 'capture-unresolved.json'),
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

// plugins/terraform/src/bootstrap-grant-publication.ts
var hash7 = (raw) => createHash10('sha256').update(raw).digest('hex');
async function retainBootstrapGrantFile(directory, name, raw) {
  const file = await open5(
    join6(directory, name),
    constants5.O_WRONLY | constants5.O_CREAT | constants5.O_EXCL | constants5.O_NOFOLLOW,
    256,
  );
  try {
    await file.writeFile(raw);
    await file.sync();
  } finally {
    await file.close();
  }
  const parent = await open5(directory, constants5.O_RDONLY | constants5.O_DIRECTORY | constants5.O_NOFOLLOW);
  try {
    await parent.sync();
  } finally {
    await parent.close();
  }
}
async function publishSignedBootstrapGrant(context, original, nonce, raw, guard, options) {
  if (process.platform !== 'linux' || !/^[a-f0-9]{32}$/.test(nonce) || raw.length < 1 || raw.length > 16384)
    throw new Error('Bounded original bootstrap grant required');
  const python = context.inputs.python,
    script = context.inputs['script:publish_bootstrap_grant.py'];
  if (
    !python ||
    python.sha256 !== installed_runtime_pins_default.pythonSha256 ||
    !script ||
    script.sha256 !== gcp_capture_source_pins_default.files['publish_bootstrap_grant.py']
  )
    throw new Error('Qualified original grant publisher inputs required');
  await guard();
  const name = `.grant-${nonce}-${randomBytes(16).toString('hex')}.partial`,
    sha256 = hash7(raw);
  await retainBootstrapGrantFile(original.directory, name, raw);
  await guard();
  let closed = false;
  const policy = {
    python: { path: python.path, sha256: python.sha256 },
    executable: { path: python.path, sha256: python.sha256 },
    originalStartMs: context.budget.start,
    originalDeadlineMs: context.budget.deadline,
    timeoutMs: 60000,
    startupTimeoutMs: 15000,
    maxOutputBytes: 16384,
    assertOriginal: guard,
    finalCapture: async (capture) => {
      await retainBootstrapGrantFile(
        original.directory,
        `publication-${nonce}.json`,
        Buffer.from(JSON.stringify(capture)),
      );
      if (
        capture.actualExitCode !== 0 ||
        !capture.originalGroupClosed ||
        capture.signalsSent !== false ||
        capture.reason
      )
        throw new Error('Original bootstrap publisher closure incomplete; reconcile without replay');
      await guard();
      closed = true;
    },
  };
  const execute = options.executorFactory ? options.executorFactory(policy) : signalFreeTerraformExecutor(policy);
  const result = await execute({
    cwd: original.directory,
    args: [
      '-I',
      '-B',
      script.path,
      original.directory,
      name,
      nonce,
      sha256,
      ...['dev', 'ino', 'uid', 'mode'].map((key) => original.identity[key].toString()),
    ],
    env: { PATH: '/usr/bin:/bin' },
  });
  await guard();
  if (result.code !== 0 || !closed)
    throw new Error('Original bootstrap publication uncertain; reconcile without replay');
  const expected = JSON.stringify({
    schemaVersion: 1,
    kind: 'original-bootstrap-grant-published',
    name: `grant-${nonce}.json`,
    sha256,
    executionAuthorized: false,
  });
  if (result.stdout.trim() !== expected) throw new Error('Original bootstrap publication receipt differs');
  return Object.freeze({ name: `grant-${nonce}.json`, sha256 });
}

// plugins/terraform/src/xcsh-creation-body.ts
import { createHash as createHash12 } from 'node:crypto';

// plugins/platform/src/ce/security.ts
function containsControlCharacters(value) {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

// plugins/terraform/src/installed-xcsh-creation-reader.ts
import { createHash as createHash11, randomUUID as randomUUID5 } from 'node:crypto';
import { lstat as lstat7, mkdir as mkdir4, open as open6, realpath as realpath6 } from 'node:fs/promises';
import { dirname as dirname7, join as join7 } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

var hash8 = (raw) => createHash11('sha256').update(raw).digest('hex');
var terraformHash = 'dbfef0be43ba2117481be510d3b83a2d8cdfa6ae7ec69c5aeb04b3947956ff7e';
var providerHash = '89a8011443732db8b64bb7fd44df21da15e4cf6183384e21e531d4533653edb0';
var origins = new WeakMap();
var openings = new WeakSet();
var targetOrigins = new WeakMap();
var object4 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed original xcsh evidence');
  return value;
};
var sameKeys = (value, keys) => Object.keys(value).sort().join(',') === [...keys].sort().join(',');
var sameActor = (value, actor) => {
  if (!value || typeof value !== 'object' || !actor) return false;
  const row = object4(value);
  return (
    sameKeys(row, ['pid', 'group', 'start', 'boot']) &&
    ['pid', 'group', 'start', 'boot'].every((key) => row[key] === actor[key])
  );
};
async function readOriginalInstalledXcshTarget(target) {
  const read = targetOrigins.get(target);
  if (!read) throw new Error('An original installed xcsh target is required');
  return read();
}
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
        inputs[`script:${name}`]?.path !== join7(dirname7(entry.path), name) ||
        inputs[`script:${name}`]?.sha256 !== expected,
    )
  )
    throw new Error('All shipped original xcsh reader sources required');
  const root = join7(context.executionDirectory, `xcsh-creation-readers-${randomUUID5()}`);
  await mkdir4(root, { mode: 448 });
  const rootIdentity = await lstat7(root, { bigint: true });
  const monitors = [];
  let retired = false;
  let readerActor;
  let closure;
  const assertDirectory = async () => {
    const actual = await lstat7(root, { bigint: true });
    if (
      !actual.isDirectory() ||
      actual.dev !== rootIdentity.dev ||
      actual.ino !== rootIdentity.ino ||
      actual.uid !== rootIdentity.uid ||
      actual.mode !== rootIdentity.mode ||
      (await realpath6(root)) !== root
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
    const handle = await open6(path, 'wx', 256);
    try {
      await handle.writeFile(raw);
      await handle.sync();
    } finally {
      await handle.close();
    }
    const directory = await open6(dirname7(path), 'r');
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
    requestHash = hash8(bytes),
    requestPath = join7(root, 'request.private.json');
  const requestBinding = await persist(requestPath, bytes);
  monitors.push(await monitorOriginalInputs({ request: requestBinding }));
  const retainedTargets = new Map();
  let finalTargetReceipts;
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
  const inspectReceipts = (values) => {
    const targets = new Set(
      scope.resources.map((target) => JSON.stringify([target.type_name, target.namespace, target.name])),
    );
    const joined = new Map();
    const identities = new Set(),
      nonces = new Set();
    for (const raw of values) {
      const receipt = object4(raw),
        target = object4(receipt.target),
        actor = object4(receipt.process);
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
          hash8(
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
      joined.set(key, receipt);
    }
    return { joined, remainingTargets: targets.size };
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
      await persist(join7(root, 'reader-capture.private.json'), Buffer.from(JSON.stringify(capture)));
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
      const path = join7(root, 'xcsh-ready.private.json');
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
        evidenceSha256: hash8(readyFile.bytes),
      });
      readyState.resolve(ready);
      const outcome = await pending;
      if (outcome.code !== 0 || !closure) throw new Error('Original xcsh reader did not close successfully');
      await guard();
      const resultPath = join7(root, 'xcsh-result.private.json'),
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
      const checkedReceipts = inspectReceipts(value.receipts);
      if (value.complete) {
        for (const [key, retained] of retainedTargets) {
          if (!isDeepStrictEqual(retained.receipt, checkedReceipts.joined.get(key)))
            throw new Error('Original xcsh final receipt differs from its published target');
        }
        finalTargetReceipts = checkedReceipts.joined;
      }
      if (value.complete && checkedReceipts.remainingTargets)
        throw new Error('Original xcsh scope target coverage differs');
      monitors.push(await monitorOriginalInputs({ result: resultFile.binding }));
      await assertOriginal();
      const result = Object.freeze({
        kind: 'original-xcsh-creation-result',
        requestSha256: requestHash,
        executor: admission.identity,
        reader: readerActor,
        complete: value.complete,
        targetCount: scope.resources.length,
        evidencePath: resultPath,
        evidenceSha256: hash8(resultFile.bytes),
      });
      origins.set(result, async () => {
        await assertOriginal();
        const current = await owned(resultPath, 65536);
        assertSameOriginalInput(resultFile.binding, current.binding);
        if (hash8(current.bytes) !== result.evidenceSha256) throw new Error('Original xcsh evidence bytes changed');
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
          join7(root, 'bridge-failure.private.json'),
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
  let targetRead;
  const availableTargets = () => {
    if (targetRead) return targetRead;
    const pendingRead = Promise.resolve()
      .then(async () => {
        const ready = await readyState.promise;
        await guard();
        const currentFiles = [];
        for (const target of scope.resources) {
          const encodedString = (value) =>
            JSON.stringify(value).replace(
              /[\u007f-\uffff]/g,
              (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
            );
          const encoded = `{${Object.keys(target)
            .sort()
            .map((key) => `${encodedString(key)}: ${encodedString(target[key])}`)
            .join(', ')}}`;
          const key = JSON.stringify([target.type_name, target.namespace, target.name]);
          const path = join7(root, `xcsh-target-${hash8(Buffer.from(encoded))}.private.json`);
          let file;
          try {
            file = await owned(path, 65536);
          } catch (error) {
            if (error.code === 'ENOENT' && !retainedTargets.has(key)) continue;
            throw error;
          }
          const value = decodeEvidenceObject(file.bytes);
          if (
            !readerActor ||
            !sameKeys(value, [...baseKeys, 'kind', 'receipt', 'complete']) ||
            value.kind !== 'original-xcsh-target-creation-evidence' ||
            value.complete !== false ||
            Number(file.binding.expectedIdentity?.mode) % 512 !== 256
          )
            throw new Error('Original private xcsh target evidence required');
          inspectBase(value, readerActor, ready);
          const receipt = object4(value.receipt),
            actual = object4(receipt.target);
          if (JSON.stringify([actual.type_name, actual.namespace, actual.name]) !== key)
            throw new Error('Original xcsh target file scope differs');
          const retained = retainedTargets.get(key);
          if (retained) {
            assertSameOriginalInput(retained.binding, file.binding);
            if (hash8(file.bytes) !== retained.evidence.evidenceSha256)
              throw new Error('Original xcsh target bytes changed');
          }
          currentFiles.push({ key, file, value });
        }
        inspectReceipts(currentFiles.map((row) => row.value.receipt));
        await guard();
        for (const row of currentFiles) {
          if (retainedTargets.has(row.key)) continue;
          const receipt = object4(row.value.receipt);
          const evidence = Object.freeze({
            kind: 'original-xcsh-target-creation-evidence',
            requestSha256: requestHash,
            executor: admission.identity,
            reader: ready.reader,
            target: Object.freeze({ ...object4(receipt.target) }),
            creationIdentitySha256: receipt.creation_identity_sha256,
            complete: false,
            executionAuthorized: false,
            signalsSent: false,
            cloudSubmissions: 0,
            evidencePath: row.file.binding.path,
            evidenceSha256: hash8(row.file.bytes),
          });
          monitors.push(await monitorOriginalInputs({ target: row.file.binding }));
          if (finalTargetReceipts && !isDeepStrictEqual(receipt, finalTargetReceipts.get(row.key)))
            throw new Error('Original xcsh target differs from its final receipt');
          retainedTargets.set(row.key, { evidence, receipt, binding: row.file.binding });
          targetOrigins.set(evidence, async () => {
            await guard();
            const current = await owned(evidence.evidencePath, 65536);
            assertSameOriginalInput(row.file.binding, current.binding);
            if (hash8(current.bytes) !== evidence.evidenceSha256) throw new Error('Original xcsh target bytes changed');
            await guard();
            return Buffer.from(current.bytes);
          });
        }
        await guard();
        return Object.freeze([...retainedTargets.values()].map((row) => row.evidence));
      })
      .catch((error) => {
        retired = true;
        throw error;
      });
    targetRead = pendingRead;
    pendingRead.then(
      () => {
        if (targetRead === pendingRead) targetRead = undefined;
      },
      () => {
        if (targetRead === pendingRead) targetRead = undefined;
      },
    );
    return pendingRead;
  };
  return Object.freeze({
    ready: readyState.promise,
    completed,
    availableTargets,
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
var hash9 = (bytes) => createHash12('sha256').update(bytes).digest('hex');
var object5 = (value) => {
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
  const early = result.kind === 'original-xcsh-target-creation-evidence';
  const readCreation = () =>
    early ? readOriginalInstalledXcshTarget(result) : readOriginalInstalledXcshCreation(result);
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
      const raw = await readCreation();
      const creation = decodeEvidenceObject(raw);
      if (
        creation.requestSha256 !== result.requestSha256 ||
        creation.scopeSha256 !== scope.planSha256 ||
        creation.scopeFileSha256 !== scope.scope?.sha256 ||
        (early
          ? creation.complete !== false || creation.kind !== 'original-xcsh-target-creation-evidence'
          : !result.complete || creation.complete !== true || !Array.isArray(creation.receipts))
      )
        throw new Error('Original complete creation receipt required');
      const receipts = (early ? [creation.receipt] : creation.receipts).map(object5).filter((row) => {
        const actual = object5(row.target);
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
        response.credentialSha256 !== hash9(context.environment.XCSH_API_TOKEN) ||
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
        metadata = object5(value.metadata),
        system = object5(value.system_metadata);
      if (
        metadata.name !== target.name ||
        metadata.namespace !== target.namespace ||
        typeof system.uid !== 'string' ||
        !system.uid ||
        system.uid.length > 128 ||
        containsControlCharacters(system.uid) ||
        receipts[0].creation_identity_sha256 !== hash9(system.uid)
      )
        throw new Error('Original creation response identity differs');
      await assertBody(body);
      await readCreation();
      await context.assertInputs();
      await context.assertWithinDeadline();
      return { planSha256: scope.planSha256, identity: hash9(system.uid) };
    } catch (error) {
      refused = true;
      throw error;
    }
  };
  const original = await verify();
  const evidence = Object.freeze({
    schemaVersion: 2,
    kind: 'original-xcsh-creation-body-candidate',
    target,
    executor: Object.freeze({ ...result.executor }),
    planSha256: original.planSha256,
    readerResultSha256: result.evidenceSha256,
    readerRequestSha256: result.requestSha256,
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
var object6 = (value) => {
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
    site.readerRequestSha256 !== token.readerRequestSha256
  )
    throw new Error('Original joint Site and Token creation scope required');
  const labels = (value, node) => {
    const declared = object6(object6(value.metadata).labels);
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
    const gcp = object6(object6(siteValue.spec).gcp),
      notManaged = object6(gcp.not_managed);
    if (
      Object.keys(gcp).join(',') !== 'not_managed' ||
      Object.keys(notManaged).join(',') !== 'node_list' ||
      !Array.isArray(notManaged.node_list)
    )
      throw new Error('Original preapply GCP not-managed mapping required');
    const siteUid = object6(siteValue.system_metadata).uid,
      tokenUid = object6(tokenValue.system_metadata).uid;
    if (typeof siteUid !== 'string' || typeof tokenUid !== 'string') throw new Error('Original creation UIDs required');
    const bootstrap = await platform.inspect(siteBody, tokenBody, { ...binding, siteUid, tokenUid });
    await readOriginalXcshCreationBody(site);
    await readOriginalXcshCreationBody(token);
    return bootstrap;
  };
  const bootstrap = await verify();
  const value = Object.freeze({
    schemaVersion: 4,
    executor: site.executor,
    kind: 'original-gcp-preapply-bootstrap-candidate',
    xcshProviderVersion: '15.17.3',
    planSha256: site.planSha256,
    readerRequestSha256: site.readerRequestSha256,
    siteReaderEvidenceSha256: site.readerResultSha256,
    tokenReaderEvidenceSha256: token.readerResultSha256,
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

// plugins/terraform/src/gcp-preapply-checkout.ts
import { join as join8 } from 'node:path';

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
  const release = await acquireProcessLock(join8(directory, '.gcp-original-bootstrap-lock'));
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
      schemaVersion: 3,
      kind: 'original-gcp-preapply-bootstrap-checkout',
      owner: expected,
      siteName: bootstrap.siteName,
      nodeName: bootstrap.nodeName,
      tokenName: bootstrap.tokenName,
      expiresAt: bootstrap.expiresAt,
      planSha256: evidence.planSha256,
      readerRequestSha256: evidence.readerRequestSha256,
      siteReaderEvidenceSha256: evidence.siteReaderEvidenceSha256,
      tokenReaderEvidenceSha256: evidence.tokenReaderEvidenceSha256,
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

// plugins/terraform/src/prepared-creation-scope.ts
var preparations = new WeakMap();
var leases = new WeakMap();
var hash10 = (raw) => createHash13('sha256').update(raw).digest('hex');
var failure = () => new Error('Trusted original prepared creation scope required');
function lease(value) {
  const current = value && typeof value === 'object' ? leases.get(value) : undefined;
  if (!current || current.refused || current.closed) throw failure();
  return current;
}
async function privateDirectory2(path) {
  if (!isAbsolute8(path) || resolve8(path) !== path) throw failure();
  let current = '/';
  for (const part of path.split('/').filter(Boolean)) {
    current = join9(current, part);
    if ((await lstat8(current)).isSymbolicLink()) throw failure();
  }
  const st = await lstat8(path, { bigint: true });
  if (
    !st.isDirectory() ||
    st.uid !== BigInt(process.getuid?.() ?? -1) ||
    (st.mode & 0o777n) !== 0o700n ||
    (await realpath7(path)) !== path
  )
    throw failure();
  return st;
}
async function fileBinding(path) {
  const st = await lstat8(path, { bigint: true }),
    parent = await privateDirectory2(dirname8(path));
  if (
    !st.isFile() ||
    st.isSymbolicLink() ||
    st.uid !== BigInt(process.getuid?.() ?? -1) ||
    st.nlink !== 1n ||
    (st.mode & 0o777n) !== 0o400n ||
    st.size < 1n ||
    st.size > 65536n ||
    (await realpath7(path)) !== path
  )
    throw failure();
  const keys = ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'];
  return Object.freeze({
    path,
    sha256: hash10(await readFile5(path)),
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
          join9(
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
      const base = join9(context.executionDirectory, '.xcsh-original-creation');
      try {
        await mkdir5(base, { mode: 448 });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
      await privateDirectory2(base);
      const directory = join9(base, projection.receipt.planSha256);
      await mkdir5(directory, { mode: 448 });
      await privateDirectory2(directory);
      const bootstrapBase = join9(context.executionDirectory, '.xcsh-original-bootstrap');
      try {
        await mkdir5(bootstrapBase, { mode: 448 });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
      await privateDirectory2(bootstrapBase);
      const bootstrapDirectory = join9(bootstrapBase, projection.receipt.planSha256);
      await mkdir5(bootstrapDirectory, { mode: 448 });
      await chmod2(bootstrapDirectory, 448);
      const bootstrapIdentity = await privateDirectory2(bootstrapDirectory);
      const keyPair = generateKeyPairSync('ed25519');
      const publicBytes = keyPair.publicKey.export({ format: 'der', type: 'spki' });
      if (publicBytes.length !== 44 || publicBytes.subarray(0, 12).toString('hex') !== '302a300506032b6570032100')
        throw failure();
      record.bootstrap = {
        specification: Object.freeze({
          schema_version: 1,
          directory: bootstrapDirectory,
          public_key: publicBytes.subarray(12).toString('base64').replace(/=+$/, ''),
          original_start_ms: context.budget.start,
          original_deadline_ms: context.budget.deadline,
        }),
        directoryIdentity: Object.freeze({
          dev: bootstrapIdentity.dev,
          ino: bootstrapIdentity.ino,
          uid: bootstrapIdentity.uid,
          mode: bootstrapIdentity.mode,
        }),
        privateKey: keyPair.privateKey,
      };
      const scopeFile = join9(directory, 'scope.json');
      const raw = Buffer.from(
        JSON.stringify({
          schema_version: 2,
          scope_sha256: projection.receipt.planSha256,
          directory,
          provider_executable_sha256: provider.sha256,
          resources,
          bootstrap_authorization: record.bootstrap.specification,
        }),
      );
      if (raw.length > 65536) throw failure();
      const file = await open7(
        scopeFile,
        constants6.O_WRONLY | constants6.O_CREAT | constants6.O_EXCL | constants6.O_NOFOLLOW,
        256,
      );
      try {
        await file.writeFile(raw);
        await file.sync();
      } finally {
        await file.close();
      }
      for (const path of [directory, base, bootstrapDirectory, bootstrapBase]) {
        const handle = await open7(path, constants6.O_RDONLY | constants6.O_DIRECTORY | constants6.O_NOFOLLOW);
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
    const packet = Object.freeze({ schemaVersion: 2, kind: 'prepared-original-creation-scope' });
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
    const bootstrap = current.bootstrap;
    if (bootstrap) {
      const actual = await privateDirectory2(bootstrap.specification.directory);
      if (['dev', 'ino', 'uid', 'mode'].some((key) => actual[key] !== current.bootstrap?.directoryIdentity[key]))
        throw failure();
      if (
        bootstrap.specification.original_start_ms !== current.context.budget.start ||
        bootstrap.specification.original_deadline_ms !== current.context.budget.deadline
      )
        throw failure();
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
    bootstrapAuthorization: current.bootstrap?.specification,
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
async function publishOriginalGcpBootstrapGrant(input, options = {}) {
  const current = lease(input.packet),
    { evidence, token, store } = input,
    bootstrap = current.bootstrap;
  if (!current.consumed || !bootstrap || !current.binding) throw failure();
  await assertOriginalGcpPreapplyBootstrapContext(evidence, current.context);
  const raw = await readOriginalInstalledXcshTarget(token);
  const creation = decodeEvidenceObject(raw),
    receipt = creation.receipt;
  if (
    receipt?.schema_version !== 1 ||
    creation.scopeSha256 !== current.projection.receipt.planSha256 ||
    creation.scopeFileSha256 !== current.binding.sha256 ||
    receipt.scope_sha256 !== current.projection.receipt.planSha256 ||
    receipt.scope_file_sha256 !== current.binding.sha256 ||
    token.requestSha256 !== evidence.readerRequestSha256 ||
    token.evidenceSha256 !== evidence.tokenReaderEvidenceSha256 ||
    token.creationIdentitySha256 !== evidence.tokenCreationSha256 ||
    token.target.type_name !== 'xcsh_token' ||
    token.target.name !== evidence.bootstrap.tokenName ||
    token.target.namespace !== 'system' ||
    evidence.planSha256 !== current.projection.receipt.planSha256 ||
    JSON.stringify(token.executor) !== JSON.stringify(evidence.executor) ||
    receipt.creation_identity_sha256 !== evidence.tokenCreationSha256 ||
    typeof receipt.nonce !== 'string' ||
    !/^[a-f0-9]{32}$/.test(receipt.nonce)
  )
    throw new Error('Original bootstrap token and reader scope differ');
  const nonce = receipt.nonce,
    directory = store.directory,
    expiresAt = Date.parse(evidence.bootstrap.expiresAt);
  const jwt = await readOriginalGcpPreapplyBootstrapJwt(evidence);
  const jwtSha256 = hash10(Buffer.from(jwt));
  if (jwtSha256 !== evidence.bootstrap.jwtSha256 || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now())
    throw new Error('Fresh original bootstrap token required');
  const guard = async () => {
    const observedMs = linuxMonotonicMs();
    if (
      observedMs < current.context.budget.start ||
      observedMs >= current.context.budget.deadline ||
      current.context.budget.deadline - current.context.budget.start !== 7200000
    )
      throw new Error('Original bootstrap grant budget exhausted');
    await assertPreparedCreationScope(input.packet);
    await assertOriginalGcpPreapplyBootstrapContext(evidence, current.context);
    if (
      !(await readOriginalInstalledXcshTarget(token)).equals(raw) ||
      (await readOriginalGcpPreapplyBootstrapJwt(evidence)) !== jwt ||
      expiresAt <= Date.now()
    )
      throw new Error('Original bootstrap token changed or expired');
    await store.verify();
    if (
      store.directory !== directory ||
      ['provider', 'engine', 'account', 'region', 'deploymentId'].some(
        (key) =>
          store.owner[key] !== current.context.owner[key] ||
          evidence.bootstrap.owner[key] !== current.context.owner[key],
      )
    )
      throw new Error('Original bootstrap grant storage scope differs');
  };
  await guard();
  current.grantClaims ??= new Set();
  if (current.grantClaims.has(nonce))
    throw new Error('Original bootstrap grant already claimed; reconcile without replay');
  current.grantClaims.add(nonce);
  const release = await acquireProcessLock(join9(directory, '.gcp-original-bootstrap-grant-lock'));
  try {
    await guard();
    const name = `gcp-original-bootstrap-grant-${evidence.bootstrap.nodeName}.json`;
    try {
      await store.read(name);
      throw new Error('Original bootstrap grant already claimed; reconcile without replay');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const claim = {
      schemaVersion: 1,
      kind: 'original-gcp-bootstrap-grant-claim',
      owner: current.context.owner,
      planSha256: evidence.planSha256,
      scopeFileSha256: current.binding.sha256,
      readerRequestSha256: evidence.readerRequestSha256,
      tokenEvidenceSha256: token.evidenceSha256,
      tokenCreationSha256: evidence.tokenCreationSha256,
      nonce,
      jwtSha256,
      originalStartMs: current.context.budget.start,
      originalDeadlineMs: current.context.budget.deadline,
    };
    await retainBootstrapGrantFile(
      bootstrap.specification.directory,
      `claim-${nonce}.json`,
      Buffer.from(JSON.stringify(claim)),
    );
    await guard();
    await store.write(name, { ...claim, state: 'claiming' });
    await guard();
    await checkoutOriginalGcpPreapplyBootstrap(evidence, store);
    await guard();
    const issuedMs = linuxMonotonicMs();
    const payload = {
      schema_version: 1,
      kind: 'original-bootstrap-release',
      scope_sha256: receipt.scope_sha256,
      scope_file_sha256: receipt.scope_file_sha256,
      target: receipt.target,
      creation_identity_sha256: receipt.creation_identity_sha256,
      process: receipt.process,
      nonce,
      content_sha256: jwtSha256,
      issued_monotonic_ms: issuedMs,
      expires_at_epoch_ms: expiresAt,
    };
    const message = Buffer.from(`XCSH_BOOTSTRAP_RELEASE_V1
${JSON.stringify(payload)}`);
    const signature = sign(null, message, bootstrap.privateKey).toString('base64').replace(/=+$/, '');
    const envelope = Buffer.from(JSON.stringify({ payload, signature }));
    const freshGuard = async () => {
      await guard();
      const now = linuxMonotonicMs();
      if (now < issuedMs || now - issuedMs >= 300000) throw new Error('Original bootstrap grant freshness exhausted');
    };
    const published = await publishSignedBootstrapGrant(
      current.context,
      {
        directory: bootstrap.specification.directory,
        identity: bootstrap.directoryIdentity,
      },
      nonce,
      envelope,
      freshGuard,
      options,
    );
    await freshGuard();
    await store.write(name, { ...claim, state: 'published', grantSha256: published.sha256 });
    await freshGuard();
    return Object.freeze({
      schemaVersion: 1,
      kind: 'original-gcp-bootstrap-grant-published',
      ...published,
      planSha256: evidence.planSha256,
      nonce,
      executionQualified: false,
    });
  } finally {
    await release();
  }
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
  typeof value === 'string' && isAbsolute9(value) && resolve9(value) === value && !/[\0\r\n]/.test(value);
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
    TF_CLI_CONFIG_FILE: join10(directory, 'deployment.tfrc'),
    TF_DATA_DIR: join10(directory, '.terraform'),
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

// plugins/terraform/src/installed-terraform-executable.ts
import { lstat as lstat9, realpath as realpath8 } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname as dirname9, isAbsolute as isAbsolute10, join as join11, resolve as resolve10 } from 'node:path';

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
  return environment.XCSH_TERRAFORM_EXECUTABLES_DIR ?? join11(homedir(), '.local/share/xcsh/terraform/versions');
}
async function privateOwnedDirectory(path) {
  const value = await lstat9(path);
  if (
    !value.isDirectory() ||
    value.isSymbolicLink() ||
    value.uid !== process.getuid?.() ||
    (value.mode & 18) !== 0 ||
    (await realpath8(path)) !== path
  )
    throw new Error('Original owned Terraform version cache directory required');
}
async function resolveInstalledTerraformExecutable(profile, environment = process.env) {
  if (!/^\d+\.\d+\.\d+$/.test(profile.terraformVersion) || !/^[a-f0-9]{64}$/.test(profile.terraformSha256))
    throw new Error('Original Terraform executable profile required');
  const root = installedTerraformVersionsDirectory(environment);
  if (!isAbsolute10(root) || resolve10(root) !== root)
    throw new Error('Original canonical Terraform version cache required');
  const exists = async (path) => {
    try {
      await lstat9(path);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  };
  if (await exists(root)) await privateOwnedDirectory(root);
  let cached;
  const path = join11(root, profile.terraformVersion, 'terraform');
  if (await exists(dirname9(path))) await privateOwnedDirectory(dirname9(path));
  if (await exists(path)) {
    await privateOwnedDirectory(root);
    await privateOwnedDirectory(dirname9(path));
    const value = await owned(path);
    if ((Number(value.binding.expectedIdentity?.mode) & 64) === 0)
      throw new Error('Original cached Terraform is not executable');
    cached = value.binding;
  }
  if (cached) return selectPinnedTerraformInput(profile.terraformSha256, cached, undefined);
  const command = Bun.which('terraform', { PATH: environment.PATH ?? process.env.PATH });
  const ambient = command ? (await owned(await realpath8(command))).binding : undefined;
  if (ambient && (Number(ambient.expectedIdentity?.mode) & 64) === 0)
    throw new Error('Original Terraform is not executable');
  return selectPinnedTerraformInput(profile.terraformSha256, undefined, ambient);
}

// plugins/terraform/src/legacy-installed-executor.ts
import { randomUUID as randomUUID6 } from 'node:crypto';
import { writeFile as writeFile4 } from 'node:fs/promises';
import { dirname as dirname10, join as join12 } from 'node:path';

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
    const key = randomUUID6();
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
          await writeFile4(
            join12(dirname10(capture.stdoutPath), 'legacy-final.private.json'),
            JSON.stringify(capture),
            {
              flag: 'wx',
              mode: 256,
            },
          );
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
import { createHash as createHash14 } from 'node:crypto';
import { lstat as lstat10, readdir as readdir2, readFile as readFile6, realpath as realpath9 } from 'node:fs/promises';
import { isAbsolute as isAbsolute11, join as join13, resolve as resolve11 } from 'node:path';

var digest3 = (bytes) => createHash14('sha256').update(bytes).digest('hex');
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
  const root = await lstat10(directory);
  if (
    !isAbsolute11(directory) ||
    resolve11(directory) !== directory ||
    (await realpath9(directory)) !== directory ||
    !root.isDirectory() ||
    root.isSymbolicLink() ||
    root.uid !== process.getuid?.()
  )
    throw new Error('Canonical original provider package required');
  const files = [];
  async function inventory(relative) {
    const parent = relative ? join13(directory, relative) : directory;
    for (const child of (await readdir2(parent)).sort()) {
      if (!/^[A-Za-z0-9_.-]+$/.test(child) || child === '.' || child === '..')
        throw new Error('Safe provider package file name required');
      const path = relative ? `${relative}/${child}` : child;
      const info = await lstat10(join13(directory, path));
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
    const path = join13(directory, file),
      before = await lstat10(path);
    total += before.size;
    if (before.size > 512 * 1024 * 1024 || total > 1024 * 1024 * 1024)
      throw new Error('Bounded provider package bytes required');
    const bytes = await readFile6(path),
      after = await lstat10(path);
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
  const packageHash = `h1:${createHash14('sha256').update(summary).digest('base64')}`;
  if (!entry.hashes.includes(packageHash)) throw new Error('Provider contents differ from locked package');
  const firstInventory = JSON.stringify(files);
  files.splice(0);
  await inventory('');
  if (JSON.stringify(files.sort()) !== firstInventory) throw new Error('Original provider package inventory changed');
  return { source, version, platform, packageHash, executableSha256: filesSha256[executable], filesSha256 };
}

// plugins/terraform/src/installed-runtime.ts
var hash11 = (raw) => createHash15('sha256').update(raw).digest('hex');
var installer = join14(import.meta.dir, '../scripts/install_runtime.py');
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
async function inspectInstalledCaptureScripts(directory = join14(import.meta.dir, '../scripts')) {
  try {
    const parent = await lstat11(directory);
    if (
      !isAbsolute12(directory) ||
      resolve12(directory) !== directory ||
      (await realpath10(directory)) !== directory ||
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
      const actual = await owned(join14(directory, name));
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
  if (!isAbsolute12(path) || resolve12(path) !== path || (await realpath10(path)) !== path)
    throw new Error('Canonical owned runtime input required');
  const before = await lstat11(path, { bigint: true });
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
  const handle = await open8(path, constants7.O_RDONLY | constants7.O_NOFOLLOW);
  try {
    const opened = await handle.stat({ bigint: true });
    const keys = ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'];
    if (keys.some((key) => opened[key] !== before[key])) throw new Error('Original runtime input changed during open');
    const bytes = await handle.readFile();
    const after = await lstat11(path, { bigint: true });
    if (keys.some((key) => after[key] !== before[key])) throw new Error('Original runtime input changed during read');
    const parent = await lstat11(dirname11(path), { bigint: true });
    return {
      bytes,
      binding: {
        path,
        sha256: hash11(bytes),
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
  if (!isAbsolute12(path) || resolve12(path) !== path) throw new Error('Canonical private runtime directory required');
  await mkdir6(path, { recursive: true, mode: 448 });
  const stat = await lstat11(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 511) !== 448 ||
    (await realpath10(path)) !== path
  )
    throw new Error('Original private runtime directory required');
}
function runtimeRoot(env) {
  return (
    env.XCSH_TERRAFORM_RUNTIME_DIR ?? join14(homedir2(), '.local/share/xcsh/terraform/runtime/python315-psutil722')
  );
}
async function assertInstalledRuntime(env = process.env) {
  const root = runtimeRoot(env);
  try {
    if (process.platform !== 'linux' || process.arch !== 'x64') throw new InstalledTerraformSetupRequired();
    const rootInfo = await lstat11(root);
    if (
      !rootInfo.isDirectory() ||
      rootInfo.isSymbolicLink() ||
      rootInfo.uid !== process.getuid?.() ||
      (rootInfo.mode & 511) !== 448 ||
      (await realpath10(root)) !== root
    )
      throw new InstalledTerraformSetupRequired();
    const python = join14(root, 'environment/bin/python3');
    const site = join14(root, 'environment/lib/python3.15/site-packages');
    const bindings = {};
    for (const [role, path, expected] of [
      ['python', python, installed_runtime_pins_default.pythonSha256],
      ['archive', join14(root, 'archive.whl'), installed_runtime_pins_default.wheelSha256],
      ['installer', installer, installed_runtime_pins_default.installerSha256],
    ]) {
      const actual = await owned(path);
      if (actual.binding.sha256 !== expected) throw new InstalledTerraformSetupRequired();
      bindings[role] = actual.binding;
    }
    const config = await owned(join14(root, 'environment/pyvenv.cfg'), 8192);
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
      cfg.home !== dirname11(cfg.executable)
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
        const path = join14(directory, name),
          stat = await lstat11(path);
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
      const actual = await owned(join14(site, name));
      if (actual.binding.sha256 !== expected) throw new InstalledTerraformSetupRequired();
      bindings[`sdk:${name}`] = actual.binding;
    }
    bindings.review = (await owned(join14(root, 'review.json'), 65536)).binding;
    Object.assign(bindings, await inspectInstalledCaptureScripts());
    const monitor = await monitorOriginalInputs(bindings);
    let inspectionDirectory;
    let inspectionClosed = false;
    try {
      const inspection = join14(
        env.XDG_STATE_HOME ?? join14(homedir2(), '.local/state'),
        'xcsh/terraform/runtime-inspections',
        randomUUID7(),
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
          await writeFile5(join14(inspection, 'inspection-capture.private.json'), JSON.stringify(capture), {
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
  return hash11(account);
}
function createInstalledRuntimeResolver(environment = process.env, options = {}) {
  const env = { ...environment },
    captureFactory = options.capture;
  return async (request) => {
    const { owner, deployment, directory, platform, resume } = request;
    if (owner.provider !== 'gcp') return {};
    if (!/^[a-z][a-z0-9-]{0,62}$/.test(deployment.deploymentId))
      throw new Error('Original Terraform deployment identity required');
    const executionDirectory = join14(directory, deployment.deploymentId);
    const store = await platform.storage(owner);
    let mode;
    try {
      mode = JSON.parse((await owned(join14(directory, modeName), 65536)).bytes.toString());
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const existingDeployment = await Bun.file(join14(executionDirectory, 'deployment.json')).exists();
    if (!resume && existingDeployment) throw new Error('Existing deployment must resume its original runtime');
    const legacy = resume && !mode && existingDeployment;
    const runtime = await assertInstalledRuntime(env);
    const versionProfile = resolveInstalledGcpVersionProfile({
      terraformVersion: deployment.terraformVersion,
      providerLockSha256: hash11(deployment.providerLock),
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
      join14(env.CLOUDSDK_CONFIG ?? join14(homedir2(), '.config/gcloud'), 'application_default_credentials.json');
    const source = await owned(sourcePath, 65536);
    const credential = JSON.parse(source.bytes.toString());
    if (credential.type !== 'authorized_user' || typeof credential.client_id !== 'string')
      throw new Error('Qualified authorized-user ADC mapping required');
    const audienceSha256 = hash11(credential.client_id);
    const expectedMode = {
      schemaVersion: 1,
      kind: 'installed-google-adc-runtime',
      owner,
      providerLockSha256: hash11(deployment.providerLock),
      qualificationSha256: installed_runtime_pins_default.refreshQualificationSha256,
    };
    if (mode && fingerprint(mode) !== fingerprint(expectedMode))
      throw new Error('Original installed runtime mode changed');
    await privateDirectory3(directory);
    if (!mode) await writeFile5(join14(directory, modeName), JSON.stringify(expectedMode), { flag: 'wx', mode: 256 });
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
    const originalCreationQualified = isOriginalCreationScopeProfile(versionProfile);
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
      if (await Bun.file(join14(executionDirectory, '.terraform-executor-lock/capture-unresolved.json')).exists())
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
        const snapshotPath = join14(directory, `google-adc-${randomUUID7()}.private.json`);
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
        const configPath = join14(
          env.XDG_CONFIG_HOME ?? join14(homedir2(), '.config'),
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
        const environmentPath = join14(directory, `platform-environment-${randomUUID7()}.private.json`);
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
              ? join14(store.directory, name)
              : name === modeName
                ? join14(directory, name)
                : join14(executionDirectory, name);
          bindings[`workspace:${name}`] = (await owned(path)).binding;
        }
        const invocationEnvironment = selectInstalledGcpEnvironment({
          ...env,
          HOME: env.HOME ?? homedir2(),
          PATH: env.PATH ?? process.env.PATH,
          GOOGLE_APPLICATION_CREDENTIALS: snapshotPath,
          ...originalEnvironment,
        });
        const invocationEnvironmentPath = join14(directory, `runtime-environment-${randomUUID7()}.private.json`);
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
            join14(directory, `google-authentication-${randomUUID7()}.private.json`),
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
                  const handle = await open8(
                    join14(directory, `google-original-apply-${randomUUID7()}.private.json`),
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
              const path = join14(executionDirectory, '.terraform/providers', sourceName, version, 'linux_amd64');
              const verified = await verifyProviderPackage({
                directory: path,
                source: sourceName,
                version,
                executable: executableName,
                platform: 'linux_amd64',
                lock: deployment.providerLock,
                lockSha256: hash11(deployment.providerLock),
              });
              if (verified.executableSha256 !== expectedSha)
                throw new Error('Original qualified provider executable changed');
              for (const [name, expected] of Object.entries(verified.filesSha256)) {
                const file = await owned(join14(path, name));
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
              const currentGroup = join14(directory, 'google-runtime-groups', randomUUID7());
              await privateDirectory3(currentGroup);
              for (const name of ['claim.json', 'lifetime.json'])
                await writeFile5(
                  join14(currentGroup, name),
                  await readFile7(join14(executionDirectory, '.terraform-executor-lock', name)),
                  { flag: 'wx', mode: 256 },
                );
              groups.push(currentGroup);
              const groupInputs = {};
              for (const name of ['claim', 'lifetime'])
                groupInputs[name] = (await owned(join14(currentGroup, `${name}.json`))).binding;
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
                  const resultPath = join14(directory, `google-runtime-final-${randomUUID7()}.private.json`);
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
            snapshotSha256: hash11(currentSource.bytes),
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

// plugins/terraform/src/installed-provider-reader.ts
var windowOrigins = new WeakMap();
async function readOriginalInstalledProviderWindow(window) {
  const read = windowOrigins.get(window);
  if (!read) throw new Error('An original reader-issued provider window is required');
  return read();
}
var windowClockOrigins = new WeakMap();
async function readOriginalInstalledProviderWindowClock(window) {
  const read = windowClockOrigins.get(window);
  if (!read) throw new Error('An original reader-issued window clock is required');
  return read();
}
var hash12 = (raw) => createHash16('sha256').update(raw).digest('hex');
var equalIdentity = (value, original) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !original) return false;
  const row = value;
  return (
    Object.keys(row).sort().join(',') === 'boot,group,pid,start' &&
    ['pid', 'group', 'start', 'boot'].every((key) => row[key] === original[key])
  );
};
var object7 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Malformed original provider reader result');
  return value;
};
async function openInstalledProviderReader(context, input, options = {}) {
  if (options.clock && !options.executorFactory) throw new Error('Offline clock requires explicit fixture executor');
  if (options.epochClock && !options.executorFactory)
    throw new Error('Offline epoch clock requires explicit fixture executor');
  const clock = options.clock ?? linuxMonotonicMs;
  const epochClock = options.epochClock ?? Date.now;
  const captureClock = () => {
    const monotonicBeforeMs = clock();
    const epochMs = epochClock();
    const monotonicAfterMs = clock();
    return Object.freeze({ monotonicBeforeMs, epochMs, monotonicAfterMs });
  };
  if (
    context.schemaVersion !== 2 ||
    context.kind !== 'original-installed-gcp-capture-context' ||
    input.directory !== context.executionDirectory ||
    input.args[0] !== 'apply' ||
    input.originalStartMs !== context.budget.start ||
    input.originalDeadlineMs !== context.budget.deadline ||
    !Number.isSafeInteger(input.identity.pid) ||
    input.identity.pid <= 0 ||
    input.identity.group !== input.identity.pid ||
    !/^[0-9]+$/.test(input.identity.start) ||
    !/^[a-f0-9-]{36}$/.test(input.identity.boot)
  )
    throw new Error('Trusted original installed apply reader scope required');
  const admission = Object.freeze({
    ...input,
    identity: Object.freeze({ ...input.identity }),
    args: Object.freeze([...input.args]),
  });
  const inputs = freezeAdmittedCaptureInputs(context.inputs);
  const providers = await context.readProviderInputs();
  const googleBindings = Object.entries(providers).filter(([name]) =>
    /^registry\.terraform\.io\/hashicorp\/google:terraform-provider-google_v\d+\.\d+\.\d+_x5$/.test(name),
  );
  if (googleBindings.length !== 1) throw new Error('One original Google provider executable binding required');
  const versionProfile = resolveInstalledGcpExecutableProfile(
    inputs.terraform?.sha256 ?? '',
    googleBindings[0][1].sha256,
  );
  const windowVersion = ['8.10.0', '8.11.0'].includes(versionProfile.googleVersion) ? 4 : 3;
  const windowKind =
    windowVersion === 4 ? 'original-provider-stderr-verified-window' : 'original-provider-stderr-coherent-window';
  const script = inputs['script:gcp_provider_reader.py'];
  if (
    !script ||
    Object.entries(gcp_capture_source_pins_default.files).some(
      ([name, expected]) =>
        inputs[`script:${name}`]?.path !== join15(dirname12(script.path), name) ||
        inputs[`script:${name}`]?.sha256 !== expected,
    ) ||
    inputs.python?.sha256 !== installed_runtime_pins_default.pythonSha256 ||
    inputs.terraform?.sha256 !== versionProfile.terraformSha256
  )
    throw new Error('All original installed provider reader sources and executable pins required');
  const google =
    providers[`registry.terraform.io/hashicorp/google:terraform-provider-google_v${versionProfile.googleVersion}_x5`];
  if (!google || google.sha256 !== versionProfile.googleProviderSha256 || Object.keys(providers).length !== 6)
    throw new Error('All original qualified installed provider inputs required');
  const allInputs = freezeAdmittedCaptureInputs({ ...inputs, ...providers });
  await context.assertInputs();
  const root = join15(context.executionDirectory, `gcp-provider-readers-${randomUUID8()}`);
  await mkdir7(root, { mode: 448 });
  const originalRoot = await lstat12(root, { bigint: true });
  let retired = false;
  let windowReadyOnce = false;
  let parentClosed = false;
  const captures = [];
  const attempts = [];
  const pendingReads = new Set();
  let closure;
  const freeze = (value) => {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  };
  const run = async (operation) => {
    if (retired) throw new Error('Original installed provider reader is retired');
    const pending = Promise.resolve().then(operation);
    pendingReads.add(pending);
    try {
      const result = await pending;
      if (retired) throw new Error('Original installed provider reader is retired');
      return result;
    } catch (error) {
      retired = true;
      throw error;
    } finally {
      pendingReads.delete(pending);
    }
  };
  const assertProviderSnapshot = async () => {
    const current = freezeAdmittedCaptureInputs({ ...inputs, ...(await context.readProviderInputs()) });
    if (JSON.stringify(current) !== JSON.stringify(allInputs))
      throw new Error('Original provider reader input admission changed');
  };
  const assertOriginal = async () => {
    await context.assertInputs();
    const actual = await lstat12(root, { bigint: true });
    if (
      !actual.isDirectory() ||
      actual.dev !== originalRoot.dev ||
      actual.ino !== originalRoot.ino ||
      actual.uid !== originalRoot.uid ||
      actual.mode !== originalRoot.mode ||
      (await realpath11(root)) !== root
    )
      throw new Error('Original provider reader directory changed');
    await context.assertInputs();
  };
  const persist = async (path, raw) => {
    const parent = await lstat12(dirname12(path), { bigint: true });
    let expectedIdentity;
    const handle = await open9(path, 'wx', 256);
    try {
      await handle.writeFile(raw);
      await handle.sync();
      const file = await handle.stat({ bigint: true });
      const fields = ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'];
      expectedIdentity = Object.fromEntries(fields.map((field) => [field, String(file[field])]));
    } finally {
      await handle.close();
    }
    const directory = await open9(dirname12(path), 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
    return {
      path,
      sha256: hash12(raw),
      expectedIdentity,
      expectedParentIdentity: {
        dev: String(parent.dev),
        ino: String(parent.ino),
        uid: String(parent.uid),
        mode: String(parent.mode),
      },
    };
  };
  const readInternal = async (reserve, startup) => {
    if (retired) throw new Error('Original installed provider reader is retired');
    let requestMonitor;
    let readyMonitor;
    const initialWindow = !windowReadyOnce;
    const beforeClock = captureClock();
    let childDirectory;
    const sourceGuard = async () => {
      await assertOriginal();
      if (childDirectory) {
        const actual = await lstat12(childDirectory.path);
        const original = childDirectory.identity;
        if (
          !actual.isDirectory() ||
          actual.dev !== original.dev ||
          actual.ino !== original.ino ||
          actual.uid !== original.uid ||
          actual.mode !== original.mode ||
          (await realpath11(childDirectory.path)) !== childDirectory.path
        )
          throw new Error('Original provider execution directory changed');
      }
      await requestMonitor?.assertOriginal();
      await readyMonitor?.assertOriginal();
    };
    const guard = async () => {
      await sourceGuard();
      if (reserve) {
        const final = inspectFinalReaderReserve(reserve);
        if (
          !equalIdentity(final.identity, admission.identity) ||
          final.originalStartMs !== context.budget.start ||
          final.originalDeadlineMs !== context.budget.deadline
        )
          throw new Error('Original final reader parent differs');
        await assertFinalReaderReserve(reserve);
      } else if (clock() >= context.budget.deadline) throw new Error('Original provider operation deadline exhausted');
    };
    try {
      return await withFinalCheck(
        async () => {
          await guard();
          const directory = join15(root, randomUUID8());
          await mkdir7(directory, { mode: 448 });
          childDirectory = { path: directory, identity: await lstat12(directory) };
          const final = reserve ? inspectFinalReaderReserve(reserve) : undefined;
          const request = {
            schemaVersion: startup ? windowVersion : 1,
            ...(startup ? { kind: windowKind, windowMs: 45000 } : {}),
            inputs: allInputs,
            executables: { bootstrap: inputs.python, terraform: inputs.terraform, provider: google },
            originalStartMs: context.budget.start,
            deadlineMs: context.budget.deadline,
            executor: admission.identity,
            ...(final
              ? { finalCapture: { finalStartedMs: final.finalStartedMs, finalDeadlineMs: final.finalDeadlineMs } }
              : {}),
          };
          const bytes = Buffer.from(JSON.stringify(request)),
            requestPath = join15(directory, 'request.private.json');
          const requestBinding = await persist(requestPath, bytes);
          requestMonitor = await monitorOriginalInputs({ request: requestBinding });
          await guard();
          let readerIdentity;
          let readerStartupDeadline;
          let complete = false;
          const attempt = {};
          const policy = {
            python: { path: inputs.python.path, sha256: installed_runtime_pins_default.pythonSha256 },
            executable: { path: inputs.python.path, sha256: installed_runtime_pins_default.pythonSha256 },
            originalStartMs: context.budget.start,
            originalDeadlineMs: context.budget.deadline,
            timeoutMs: 60000,
            assertOriginal: reserve ? sourceGuard : guard,
            beforeRelease: async (admitted) => {
              readerIdentity = Object.freeze({ ...admitted.identity });
              attempt.identity = readerIdentity;
              if (retired) throw new Error('Original installed provider reader is retired');
              readerStartupDeadline = admitted.startupDeadlineMs;
            },
            finalCapture: async (capture) => {
              if (attempt.capture) throw new Error('Original provider reader capture already retained');
              const retained = freeze(structuredClone(capture));
              attempt.capture = retained;
              captures.push(retained);
              attempt.binding = await persist(
                join15(directory, 'capture.private.json'),
                Buffer.from(JSON.stringify(retained)),
              );
              if (
                !equalIdentity(capture.identity, readerIdentity) ||
                capture.pid !== readerIdentity?.pid ||
                capture.reason ||
                capture.actualExitCode !== 0 ||
                !capture.originalGroupClosed ||
                capture.originalDeadlineMs !== context.budget.deadline ||
                (final &&
                  (capture.finalStartedMs !== final.finalStartedMs ||
                    capture.finalDeadlineMs !== final.finalDeadlineMs))
              )
                throw new Error('Original provider SDK reader closure incomplete');
              await guard();
              complete = true;
            },
          };
          const execute = options.executorFactory
            ? options.executorFactory(policy, reserve)
            : reserve
              ? signalFreeFinalReaderExecutor(policy, reserve)
              : signalFreeTerraformExecutor(policy);
          if (retired) throw new Error('Original installed provider reader is retired');
          attempts.push(attempt);
          let terminal = false;
          const pending = execute({
            cwd: directory,
            args: ['-I', '-B', script.path, '--request', requestPath, '--sha256', hash12(bytes)],
            env: { PATH: '/usr/bin:/bin' },
          });
          pending.then(
            () => {
              terminal = true;
            },
            () => {
              terminal = true;
            },
          );
          let windowReady;
          let startupFailure;
          if (startup) {
            try {
              const path = join15(directory, 'provider-ready.private.json');
              while (!(await Bun.file(path).exists())) {
                await guard();
                if (terminal) throw new Error('Original provider window ended before readiness');
                if (
                  clock() >=
                  Math.min(
                    initialWindow ? admission.startupDeadlineMs : context.budget.deadline,
                    readerStartupDeadline ?? context.budget.deadline,
                  )
                )
                  throw new Error('Original provider window startup exhausted');
                await Bun.sleep(25);
              }
              await guard();
              const input = await owned(path, 65536);
              if (!input.binding.expectedIdentity || (BigInt(input.binding.expectedIdentity.mode) & 0o077n) !== 0n)
                throw new Error('Original private provider readiness required');
              const value = decodeEvidenceObject(input.bytes);
              const keys = [
                'schemaVersion',
                'kind',
                'requestSha256',
                'executor',
                'reader',
                'windowStartedMs',
                'windowDeadlineMs',
                'applyPhaseQualified',
                'signalsSent',
                'cloudSubmissions',
              ]
                .sort()
                .join(',');
              const originalReader = readerIdentity;
              const { windowStartedMs: began, windowDeadlineMs: ended } = value;
              if (
                !originalReader ||
                Object.keys(value).sort().join(',') !== keys ||
                value.schemaVersion !== windowVersion ||
                value.kind !== 'original-provider-stderr-ready' ||
                value.requestSha256 !== hash12(bytes) ||
                !equalIdentity(value.executor, admission.identity) ||
                !equalIdentity(value.reader, readerIdentity) ||
                !Number.isSafeInteger(began) ||
                !Number.isSafeInteger(ended) ||
                began < context.budget.start ||
                began > clock() ||
                clock() - began >= 15000 ||
                ended !== Math.min(began + 45000, context.budget.deadline) ||
                (initialWindow && clock() >= admission.startupDeadlineMs) ||
                value.applyPhaseQualified !== false ||
                value.signalsSent !== false ||
                value.cloudSubmissions !== 0
              )
                throw new Error('Original provider window readiness attribution differs');
              readyMonitor = await monitorOriginalInputs({ ready: input.binding });
              windowReady = Object.freeze({
                ...value,
                executor: admission.identity,
                reader: originalReader,
                evidencePath: path,
                evidenceSha256: hash12(input.bytes),
              });
              await guard();
              if (retired) throw new Error('Original installed provider reader is retired');
              windowReadyOnce = true;
              startup.resolve(windowReady);
            } catch (error) {
              startupFailure = error;
              startup.reject(error);
            }
          }
          const outcome = await pending;
          if (startupFailure) throw startupFailure;
          if (outcome.code !== 0 || !complete) throw new Error('Original provider SDK reader failed');
          const path = join15(directory, 'provider-result.private.json');
          const resultInput = await owned(path, 65536);
          const resultIdentity = resultInput.binding.expectedIdentity;
          if (!resultIdentity || (BigInt(resultIdentity.mode) & 0o077n) !== 0n)
            throw new Error('Original private provider result required');
          const raw = resultInput.bytes;
          const value = decodeEvidenceObject(raw);
          const originalReader = readerIdentity;
          if (!originalReader) throw new Error('Original provider reader identity absent');
          if (
            value.schemaVersion !== (startup ? windowVersion : 1) ||
            value.kind !== (startup ? windowKind : 'original-provider-cohort') ||
            value.requestSha256 !== hash12(bytes) ||
            !equalIdentity(value.executor, admission.identity) ||
            !equalIdentity(value.reader, readerIdentity) ||
            (!startup && !Array.isArray(value.candidates)) ||
            typeof value.executorAvailable !== 'boolean' ||
            typeof value.executorGroupClosed !== 'boolean' ||
            (value.executorAvailable && value.executorGroupClosed) ||
            value.applyPhaseQualified !== false ||
            value.signalsSent !== false ||
            value.cloudSubmissions !== 0
          )
            throw new Error('Original provider result attribution differs');
          const seen = new Set();
          const candidateFrom = (rawCandidate) => {
            const candidate = object7(rawCandidate);
            if (
              Object.keys(candidate).sort().join(',') !== 'boot,executable_sha256,group,parent,pid,start' ||
              !Number.isSafeInteger(candidate.pid) ||
              candidate.pid <= 0 ||
              seen.has(candidate.pid) ||
              candidate.parent !== admission.identity.pid ||
              candidate.group !== admission.identity.group ||
              candidate.boot !== admission.identity.boot ||
              typeof candidate.start !== 'string' ||
              !/^[0-9]+$/.test(candidate.start) ||
              candidate.executable_sha256 !== versionProfile.googleProviderSha256
            )
              throw new Error('Original provider candidate ownership differs');
            seen.add(candidate.pid);
            return Object.freeze(candidate);
          };
          if (startup) {
            const keys = [
              'schemaVersion',
              'kind',
              'requestSha256',
              'executor',
              'reader',
              'executorAvailable',
              'executorGroupClosed',
              'applyPhaseQualified',
              'signalsSent',
              'cloudSubmissions',
              'windowStartedMs',
              'windowDeadlineMs',
              'finishedMs',
              'samplingWindowComplete',
              'observations',
              ...(windowVersion === 4 ? ['verificationPolicy', 'boundaryAttempts'] : []),
            ]
              .sort()
              .join(',');
            if (
              !windowReady ||
              Object.keys(value).sort().join(',') !== keys ||
              value.windowStartedMs !== windowReady.windowStartedMs ||
              value.windowDeadlineMs !== windowReady.windowDeadlineMs ||
              value.samplingWindowComplete !== true ||
              (windowVersion === 4 &&
                (value.verificationPolicy !== 'completed-before-window-end' ||
                  !Number.isSafeInteger(value.boundaryAttempts) ||
                  value.boundaryAttempts < 0 ||
                  value.boundaryAttempts > 1 ||
                  value.finishedMs - windowReady.windowStartedMs >= 60000 ||
                  !Array.isArray(value.observations) ||
                  value.observations.length === 0)) ||
              !Number.isSafeInteger(value.finishedMs) ||
              value.finishedMs < windowReady.windowStartedMs ||
              value.finishedMs > clock() ||
              (!value.executorGroupClosed && value.finishedMs < windowReady.windowDeadlineMs) ||
              !Array.isArray(value.observations) ||
              value.observations.length > 64
            )
              throw new Error('Original provider window incomplete or premature');
            const ready = windowReady;
            const observations = value.observations.map((rawObservation) => {
              const observation = object7(rawObservation);
              if (
                Object.keys(observation).sort().join(',') !==
                  'candidate,firstObservedMs,lastObservedMs,presentAtLastSample,stderr' ||
                !Number.isSafeInteger(observation.firstObservedMs) ||
                !Number.isSafeInteger(observation.lastObservedMs) ||
                observation.firstObservedMs < ready.windowStartedMs ||
                observation.lastObservedMs < observation.firstObservedMs ||
                observation.lastObservedMs > ready.windowDeadlineMs ||
                (windowVersion === 4 && observation.lastObservedMs >= ready.windowDeadlineMs) ||
                typeof observation.presentAtLastSample !== 'boolean'
              )
                throw new Error('Original provider window observation differs');
              const candidate = candidateFrom(observation.candidate),
                pipe = object7(observation.stderr);
              if (
                Object.keys(pipe).sort().join(',') !== 'device,inode,parentFd,parentFlags,providerFd,providerFlags' ||
                pipe.providerFd !== 2 ||
                !Number.isSafeInteger(pipe.parentFd) ||
                pipe.parentFd < 0 ||
                typeof pipe.device !== 'string' ||
                !/^(?:0|[1-9][0-9]*)$/.test(pipe.device) ||
                typeof pipe.inode !== 'string' ||
                !/^[1-9][0-9]*$/.test(pipe.inode) ||
                !Number.isSafeInteger(pipe.providerFlags) ||
                !Number.isSafeInteger(pipe.parentFlags) ||
                pipe.providerFlags < 0 ||
                pipe.parentFlags < 0 ||
                (pipe.providerFlags & 3) !== 1 ||
                (pipe.parentFlags & 3) !== 0
              )
                throw new Error('Original provider stderr FIFO attribution differs');
              return Object.freeze({
                ...observation,
                candidate,
                stderr: Object.freeze({ ...pipe }),
              });
            });
            await guard();
            parentClosed = value.executorGroupClosed;
            const window = Object.freeze({
              ...value,
              executor: admission.identity,
              reader: originalReader,
              observations: Object.freeze(observations),
              evidencePath: path,
              evidenceSha256: hash12(raw),
            });
            const afterClock = captureClock();
            let clockRefused = false;
            windowClockOrigins.set(window, async () => {
              if (clockRefused) throw new Error('Original window clock correspondence was refused');
              return run(async () => {
                try {
                  await readOriginalInstalledProviderWindow(window);
                  const samples = [beforeClock, afterClock];
                  for (const sample of samples)
                    if (
                      !Object.values(sample).every((value) => Number.isSafeInteger(value) && value >= 0) ||
                      sample.monotonicAfterMs < sample.monotonicBeforeMs ||
                      sample.monotonicAfterMs - sample.monotonicBeforeMs > 100
                    )
                      throw new Error('Original paired window clock sample differs');
                  const lower = samples.map((sample) => sample.epochMs - sample.monotonicAfterMs);
                  const upper = samples.map((sample) => sample.epochMs - sample.monotonicBeforeMs);
                  if (
                    afterClock.monotonicBeforeMs < beforeClock.monotonicAfterMs ||
                    afterClock.epochMs < beforeClock.epochMs ||
                    Math.max(...lower) - Math.min(...upper) > 100 ||
                    window.windowStartedMs < beforeClock.monotonicBeforeMs ||
                    window.finishedMs > afterClock.monotonicAfterMs
                  )
                    throw new Error('Original window clocks changed offset or do not bracket sampling');
                  await readOriginalInstalledProviderWindow(window);
                  return Object.freeze({
                    before: beforeClock,
                    after: afterClock,
                    offsetLowerMs: Math.min(...lower),
                    offsetUpperMs: Math.max(...upper),
                  });
                } catch (error) {
                  clockRefused = true;
                  throw error;
                }
              });
            });
            windowOrigins.set(window, () =>
              run(async () => {
                if (retired) throw new Error('Original provider window source retired');
                await assertOriginal();
                await assertProviderSnapshot();
                const current = await owned(path, 65536);
                assertSameOriginalInput(resultInput.binding, current.binding);
                if (hash12(current.bytes) !== window.evidenceSha256)
                  throw new Error('Original provider window bytes changed');
                await assertOriginal();
                const final = await owned(path, 65536);
                assertSameOriginalInput(resultInput.binding, final.binding);
                return Buffer.from(current.bytes);
              }),
            );
            return window;
          }
          const candidates = value.candidates.map(candidateFrom);
          await guard();
          return Object.freeze({
            schemaVersion: 1,
            kind: 'original-provider-cohort',
            requestSha256: hash12(bytes),
            executor: admission.identity,
            reader: readerIdentity,
            candidates: Object.freeze(candidates),
            executorAvailable: value.executorAvailable,
            executorGroupClosed: value.executorGroupClosed,
            applyPhaseQualified: false,
            signalsSent: false,
            cloudSubmissions: 0,
            evidencePath: path,
            evidenceSha256: hash12(raw),
          });
        },
        async () => {
          await guard();
          await assertProviderSnapshot();
        },
        'Original provider reader and final input verification failed',
      );
    } catch (error) {
      startup?.reject(error);
      retired = true;
      throw error;
    } finally {
      readyMonitor?.close();
      requestMonitor?.close();
    }
  };
  return Object.freeze({
    root,
    assertOriginal: () => run(assertOriginal),
    captures: () => Object.freeze([...captures]),
    async read(reserve) {
      const result = await run(() => readInternal(reserve));
      if (result.kind !== 'original-provider-cohort') throw new Error('Original legacy provider cohort required');
      return result;
    },
    startStderrWindow() {
      if (retired) throw new Error('Original installed provider reader is retired');
      if (parentClosed) throw new Error('Original provider window parent already closed');
      let resolveReady;
      let rejectReady;
      const ready = new Promise((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
      });
      const complete = run(() => readInternal(undefined, { resolve: resolveReady, reject: rejectReady })).then(
        (result) => {
          if (result.kind === 'original-provider-cohort') throw new Error('Original provider window required');
          return result;
        },
      );
      complete.catch(rejectReady);
      return Object.freeze({ ready, complete });
    },
    close() {
      if (closure) return closure;
      retired = true;
      closure = (async () => {
        while (pendingReads.size) await Promise.allSettled([...pendingReads]);
        await assertOriginal();
        await assertProviderSnapshot();
        if (captures.length !== attempts.length)
          throw new Error('Original provider reader closure receipt coverage incomplete');
        for (const attempt of attempts) {
          const { identity, capture, binding } = attempt;
          if (
            !identity ||
            !capture ||
            !binding ||
            identity.pid === admission.identity.pid ||
            identity.group !== identity.pid ||
            identity.boot !== admission.identity.boot ||
            !equalIdentity(capture.identity, identity) ||
            capture.pid !== identity.pid ||
            capture.originalGroupClosed !== true ||
            capture.actualExitCode === null ||
            !Number.isSafeInteger(capture.actualExitCode) ||
            capture.signalsSent !== false ||
            capture.originalDeadlineMs !== admission.originalDeadlineMs
          )
            throw new Error('Original provider reader child closure incomplete');
          assertSameOriginalInput(binding, (await owned(binding.path, 65536)).binding);
        }
        await assertOriginal();
        await assertProviderSnapshot();
      })();
      return closure;
    },
  });
}

// plugins/terraform/src/original-google-provider-source.ts
async function corroborateOriginalGoogleRpcProvider(input) {
  const rpc = input.rpc;
  const windows = Object.freeze([...input.windows]);
  const source = readOriginalGoogleProviderRpcSource(rpc);
  const profile = resolveInstalledGcpVersionProfile(input.binding);
  if (!windows.length || new Set(windows).size !== windows.length)
    throw new Error('Original distinct provider windows required');
  const witnesses = [];
  const temporalWindows = [];
  for (const window of windows) {
    const raw = await readOriginalInstalledProviderWindow(window);
    if (
      createHash17('sha256').update(raw).digest('hex') !== window.evidenceSha256 ||
      ['pid', 'group', 'start', 'boot'].some((key) => source.executor[key] !== window.executor[key]) ||
      ![3, 4].includes(window.schemaVersion) ||
      !window.samplingWindowComplete ||
      window.signalsSent !== false ||
      window.cloudSubmissions !== 0 ||
      window.applyPhaseQualified !== false
    )
      throw new Error('Original executor and provider window differ');
    const matched = window.observations.filter((observation) => observation.candidate.pid === rpc.providerPid);
    if (matched.length !== 1) throw new Error('Original RPC provider window absent or ambiguous');
    const witness = matched[0];
    if (
      witness.candidate.parent !== source.executor.pid ||
      witness.candidate.group !== source.executor.group ||
      witness.candidate.boot !== source.executor.boot ||
      witness.candidate.executable_sha256 !== profile.googleProviderSha256
    )
      throw new Error('Original RPC provider incarnation differs');
    const clock = await readOriginalInstalledProviderWindowClock(window);
    const firstLower = witness.firstObservedMs + clock.offsetLowerMs;
    const firstUpper = witness.firstObservedMs + clock.offsetUpperMs;
    const lastLower = witness.lastObservedMs + clock.offsetLowerMs;
    const lastUpper = witness.lastObservedMs + clock.offsetUpperMs;
    if (
      ![firstLower, firstUpper, lastLower, lastUpper].every(Number.isSafeInteger) ||
      source.providerStartedEpochMs > firstLower ||
      source.providerExitedEpochMs < lastUpper
    )
      throw new Error('Original provider temporal lifetime does not contain independent observations');
    temporalWindows.push({ lowerEpochMs: firstUpper, upperEpochMs: lastLower });
    witnesses.push(witness);
  }
  if (
    !temporalWindows.some(
      (window) => source.receivedEpochMs >= window.lowerEpochMs && source.servedEpochMs <= window.upperEpochMs,
    )
  )
    throw new Error('Original RPC temporal interval is outside independent provider observations');
  const original = witnesses[0];
  for (const witness of witnesses)
    if (
      JSON.stringify(witness.candidate) !== JSON.stringify(original.candidate) ||
      JSON.stringify(witness.stderr) !== JSON.stringify(original.stderr)
    )
      throw new Error('Original RPC provider or FIFO changed between windows');
  for (const window of windows) {
    await readOriginalInstalledProviderWindow(window);
    await readOriginalInstalledProviderWindowClock(window);
  }
  readOriginalGoogleProviderRpcSource(rpc);
  return Object.freeze({
    schemaVersion: 2,
    kind: 'original-descriptor-provider-correspondence',
    executor: source.executor,
    providerPid: original.candidate.pid,
    providerStart: original.candidate.start,
    providerBoot: original.candidate.boot,
    providerSha256: original.candidate.executable_sha256,
    rpcRequestId: rpc.rpcRequestId,
    planSha256: rpc.planSha256,
    sourceStderrSha256: source.stderrSha256,
    sourceStderrBytes: source.stderrBytes,
    windows: Object.freeze(windows.map((window) => window.evidenceSha256)),
    descriptorSourceCorroborated: true,
    providerWindowCorroborated: true,
    rpcWindowTimeCorroborated: true,
    providerProcessQualified: false,
    applyRpcQualified: false,
    originalInsertQualified: false,
  });
}

// plugins/terraform/src/terraform-apply-hooks.ts
import { createHash as createHash18 } from 'node:crypto';

var hookOrigins = new WeakMap();
async function readOriginalTerraformApplyHookSource(value) {
  const read = hookOrigins.get(value);
  if (!read) throw new Error('Original executor-issued apply hook required');
  return read();
}
var maxLineBytes = 1024 * 1024;
var maxStreamBytes = 64 * 1024 * 1024;
var identifier = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
var ordinaryMessages = new Set([
  'log',
  'diagnostic',
  'planned_change',
  'change_summary',
  'outputs',
  'refresh_start',
  'refresh_complete',
]);
var object8 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed Terraform UI object');
  return value;
};
var text2 = (value) => {
  if (typeof value !== 'string' || value.length > maxLineBytes) throw new Error('Malformed Terraform UI identity');
  for (const char of value) if (char.charCodeAt(0) < 32) throw new Error('Malformed Terraform UI identity');
  return value;
};
function reviewedProvisioners(plan, configuration) {
  if (
    Buffer.byteLength(configuration) > maxStreamBytes ||
    createHash18('sha256').update(configuration).digest('hex') !== plan.configurationSha256
  )
    throw new Error('Original reviewed Terraform configuration bytes required');
  const config = decodeEvidenceObject(Buffer.from(configuration));
  const result = new Map();
  if (config.module !== undefined) throw new Error('Module provisioner configuration mapping is unavailable');
  for (const [type, resources] of Object.entries(object8(config.resource ?? {}))) {
    if (!identifier.test(type)) throw new Error('Reviewed resource declaration required');
    for (const [name, value] of Object.entries(object8(resources))) {
      if (!identifier.test(name)) throw new Error('Reviewed resource name required');
      const entries = object8(value).provisioner ?? [];
      if (!Array.isArray(entries)) throw new Error('Ordered reviewed provisioner declarations required');
      const provisioners = entries.map((entry) => {
        const declaration = object8(entry),
          keys = Object.keys(declaration);
        if (keys.length !== 1 || !['local-exec', 'remote-exec', 'file'].includes(keys[0]))
          throw new Error('Supported unambiguous reviewed provisioner required');
        const block = object8(declaration[keys[0]]),
          when = block.when ?? 'create';
        if (!['create', 'destroy'].includes(String(when)) || typeof when !== 'string')
          throw new Error('Reviewed provisioner phase required');
        return Object.freeze({ type: keys[0], when });
      });
      result.set(`${type}.${name}`, Object.freeze(provisioners));
    }
  }
  return result;
}

class TerraformApplyHookParser {
  #planSha256;
  #terraformVersion;
  #provisioners;
  #reviewed = new Map();
  #line = Buffer.allocUnsafe(maxLineBytes);
  #lineBytes = 0;
  #streamBytes = 0;
  #version = false;
  #closed = false;
  #failed = false;
  #successful = true;
  #active;
  #completed = 0;
  #expected = 0;
  #originOutput;
  #originCompletion;
  #sourceEnd = 0;
  #sourceHash = createHash18('sha256');
  #eventTimes = new WeakMap();
  #eventEpochMs = 0;
  constructor(plan, binding, configuration) {
    const profile = binding ? resolveInstalledGcpVersionProfile(binding) : undefined;
    if (profile && profile.providerLockSha256 !== plan.providerLockSha256)
      throw new Error('Reviewed Terraform plan differs from authenticated provider lock');
    this.#terraformVersion = profile?.terraformVersion ?? '1.16.6';
    this.#provisioners = configuration === undefined ? undefined : reviewedProvisioners(plan, configuration);
    if (plan.schemaVersion !== 1 || plan.engine !== 'terraform' || !/^[a-f0-9]{64}$/.test(plan.planSha256))
      throw new Error('Reviewed Terraform plan binding required');
    this.#planSha256 = plan.planSha256;
    const addresses = new Set();
    for (const change of plan.changes) {
      const address = text2(change.address);
      if (!address || address.length > 4096 || !identifier.test(change.type) || addresses.has(address))
        throw new Error('Unique reviewed Terraform resource required');
      addresses.add(address);
      const actions = change.actions.join(',');
      if (!['no-op', 'read', 'create', 'update', 'delete', 'delete,create', 'create,delete'].includes(actions))
        throw new Error('Unsupported reviewed Terraform actions');
      if (actions === 'no-op') continue;
      if (plan.noChanges) throw new Error('Reviewed Terraform plan has inconsistent changes');
      this.#reviewed.set(address, { address, type: change.type, actions: [...change.actions], next: 0 });
      this.#expected += change.actions.length;
    }
    if (plan.actionInvocations?.length) throw new Error('Terraform action RPC hooks are not qualified');
  }
  #assertOpen() {
    if (this.#failed) throw new Error('Original Terraform UI stream failed');
    if (this.#closed) throw new Error('Original Terraform UI stream closed');
  }
  push(chunk) {
    this.#assertOpen();
    if (this.#originOutput) {
      this.#failed = true;
      throw new Error('Original descriptor UI cannot accept unowned bytes');
    }
    return this.#consume(chunk);
  }
  #consume(chunk) {
    this.#assertOpen();
    try {
      this.#streamBytes += chunk.byteLength;
      if (this.#streamBytes > maxStreamBytes) throw new Error('Terraform UI stream size exceeded');
      const candidates = [];
      let offset = 0;
      while (offset < chunk.byteLength) {
        const newline = chunk.indexOf(10, offset);
        const end = newline === -1 ? chunk.byteLength : newline;
        const length = end - offset;
        if (this.#lineBytes + length > maxLineBytes) throw new Error('Terraform UI line size exceeded');
        this.#line.set(chunk.subarray(offset, end), this.#lineBytes);
        this.#lineBytes += length;
        if (newline === -1) break;
        const raw = this.#line.subarray(0, this.#lineBytes);
        const candidate = this.#parse(raw);
        if (candidate) candidates.push(candidate);
        this.#lineBytes = 0;
        offset = newline + 1;
      }
      return candidates;
    } catch (error) {
      this.#failed = true;
      throw error;
    }
  }
  pushOriginal(output, chunk) {
    this.#assertOpen();
    try {
      const source = readOriginalExecutionChunk(output, chunk, 'stdout');
      if (
        (this.#originOutput && this.#originOutput !== output) ||
        (!this.#originOutput && this.#streamBytes !== 0) ||
        source.offset !== this.#sourceEnd
      )
        throw new Error('Original UI descriptor stream changed or has a gap');
      this.#originOutput = output;
      this.#sourceEnd = source.offset + source.bytes.length;
      this.#sourceHash.update(source.bytes);
      const candidates = this.#consume(source.bytes);
      for (const candidate of candidates) {
        const epoch = this.#eventTimes.get(candidate);
        hookOrigins.set(candidate, async () => {
          if (this.#failed) throw new Error('Original UI hook source failed');
          const original = this.#originCompletion;
          if (!original || epoch === undefined) throw new Error('Original UI descriptor completion required');
          try {
            readOriginalExecutionCompletion(output, original.completion);
            const current = await output.finish();
            const checked = readOriginalExecutionCompletion(output, current);
            for (const channel of ['stdout', 'stderr'])
              if (
                current[channel].bytes !== original.completion[channel].bytes ||
                current[channel].sha256 !== original.completion[channel].sha256
              )
                throw new Error('Original UI descriptor bytes changed');
            if (['pid', 'group', 'start', 'boot'].some((key) => checked.identity[key] !== original.identity[key]))
              throw new Error('Original UI executor identity changed');
            return Object.freeze({
              schemaVersion: 1,
              kind: 'original-terraform-apply-hook-source',
              executor: original.identity,
              directory: original.directory,
              planSha256: this.#planSha256,
              rawLineSha256: candidate.rawLineSha256,
              eventEpochMs: epoch,
              stdoutBytes: current.stdout.bytes,
              stdoutSha256: current.stdout.sha256,
              stderrBytes: current.stderr.bytes,
              stderrSha256: current.stderr.sha256,
              applyRpcQualified: false,
              originalInsertQualified: false,
            });
          } catch (error) {
            this.#failed = true;
            throw error;
          }
        });
      }
      return candidates;
    } catch (error) {
      this.#failed = true;
      throw error;
    }
  }
  #parse(raw) {
    let event;
    try {
      event = decodeEvidenceObject(raw);
    } catch {
      throw new Error('Malformed original Terraform JSON UI line');
    }
    const timestamp = text2(event['@timestamp']);
    if (
      event['@module'] !== 'terraform.ui' ||
      !['info', 'warn', 'error'].includes(String(event['@level'])) ||
      typeof event['@message'] !== 'string' ||
      !isEvidenceRfc3339(timestamp)
    )
      throw new Error('Original Terraform UI producer envelope required');
    this.#eventEpochMs = Date.parse(timestamp);
    if (event['@level'] === 'error') this.#successful = false;
    const type = text2(event.type);
    if (!this.#version) {
      if (type !== 'version' || event.terraform !== this.#terraformVersion || event.ui !== '1.3')
        throw new Error('Pinned Terraform and JSON UI versions required');
      this.#version = true;
      return;
    }
    if (ordinaryMessages.has(type)) {
      if (type === 'diagnostic' && object8(event.diagnostic).severity === 'error') this.#successful = false;
      return;
    }
    if (
      ![
        'apply_start',
        'apply_progress',
        'apply_complete',
        'apply_errored',
        'provision_start',
        'provision_progress',
        'provision_complete',
        'provision_errored',
      ].includes(type)
    )
      throw new Error('Unsupported original Terraform UI event');
    const hook = object8(event.hook),
      resource = object8(hook.resource);
    const address = text2(resource.addr),
      reviewed = this.#reviewed.get(address);
    if (!reviewed || resource.resource_type !== reviewed.type || !identifier.test(text2(resource.resource_name)))
      throw new Error('Original hook differs from reviewed Terraform resource');
    const key = resource.resource_key;
    if (key !== null && typeof key !== 'string' && !(typeof key === 'number' && Number.isSafeInteger(key) && key >= 0))
      throw new Error('Malformed original Terraform instance key');
    if (typeof key === 'string') text2(key);
    const suffix = key === null ? '' : `[${JSON.stringify(key)}]`;
    const baseResource = `${reviewed.type}.${resource.resource_name}${suffix}`;
    const module = text2(resource.module);
    const modulePrefix = module ? `${module}.` : '';
    const mode = address === `${modulePrefix}data.${baseResource}` ? 'data.' : '';
    const expectedResource = `${mode}${baseResource}`;
    if (
      resource.resource !== expectedResource ||
      address !== `${module ? `${module}.` : ''}${expectedResource}` ||
      resource.implied_provider !== reviewed.type.split('_')[0]
    )
      throw new Error('Original Terraform resource identity changed');
    const identity = JSON.stringify([
      address,
      module,
      expectedResource,
      resource.implied_provider,
      reviewed.type,
      resource.resource_name,
      key,
    ]);
    if (type.startsWith('provision_')) return this.#provision(type, hook, reviewed, identity, raw);
    const action = text2(hook.action);
    if (type === 'apply_start') {
      if (this.#active || reviewed.actions[reviewed.next] !== action)
        throw new Error('Concurrent, replayed or unreviewed Terraform apply start');
      const provisioners = (this.#provisioners?.get(`${reviewed.type}.${resource.resource_name}`) ?? []).filter(
        (p) => (action === 'create' && p.when === 'create') || (action === 'delete' && p.when === 'destroy'),
      );
      if (module && provisioners.length) throw new Error('Module provisioner configuration mapping is unavailable');
      this.#active = { reviewed, identity, action, elapsed: 0, provisioners, provisionerNext: 0, provisioning: false };
    } else if (
      !this.#active ||
      this.#active.reviewed !== reviewed ||
      this.#active.identity !== identity ||
      this.#active.action !== action
    )
      throw new Error('Unpaired or changed original Terraform apply hook');
    const active = this.#active;
    if (!active) throw new Error('Original Terraform action is unavailable');
    const elapsed = type === 'apply_start' ? null : hook.elapsed_seconds;
    if (type !== 'apply_start') {
      if (typeof elapsed !== 'number' || !Number.isFinite(elapsed) || elapsed < active.elapsed)
        throw new Error('Original Terraform elapsed time changed');
      active.elapsed = elapsed;
    }
    const idKey = hook.id_key === undefined ? null : text2(hook.id_key);
    const idValue = hook.id_value === undefined ? null : text2(hook.id_value);
    if ((idKey === null) !== (idValue === null)) throw new Error('Incomplete original Terraform hook identity');
    const candidate = Object.freeze({
      address,
      resourceType: reviewed.type,
      action,
      phase: type,
      actionIndex: reviewed.next,
      elapsedSeconds: elapsed,
      idKey,
      idValue,
      rawLineSha256: createHash18('sha256')
        .update(raw)
        .update(`
`)
        .digest('hex'),
      planSha256: this.#planSha256,
      applyRpcQualified: false,
      originalInsertQualified: false,
    });
    this.#eventTimes.set(candidate, this.#eventEpochMs);
    if (type === 'apply_complete' || type === 'apply_errored') {
      if (active.provisioning || (type === 'apply_complete' && active.provisionerNext !== active.provisioners.length))
        throw new Error('Original Terraform provisioner steps truncated or missing');
      if (type === 'apply_errored') this.#successful = false;
      reviewed.next++;
      this.#completed++;
      this.#active = undefined;
    }
    return candidate;
  }
  #provision(phase, hook, reviewed, identity, raw) {
    const active = this.#active;
    if (!this.#provisioners || !active || active.reviewed !== reviewed || active.identity !== identity)
      throw new Error('Original provisioner requires reviewed configuration and active resource');
    const keys = Object.keys(hook).sort().join(',');
    if (keys !== (phase === 'provision_progress' ? 'output,provisioner,resource' : 'provisioner,resource'))
      throw new Error('Original provisioner hook fields differ');
    const provisioner = text2(hook.provisioner),
      declared = active.provisioners[active.provisionerNext];
    if (!declared || declared.type !== provisioner) throw new Error('Unreviewed, replayed or out-of-order provisioner');
    if (phase === 'provision_start') {
      if (active.provisioning) throw new Error('Concurrent original provisioner');
      active.provisioning = true;
    } else if (!active.provisioning) throw new Error('Unpaired original provisioner hook');
    let outputSha256 = null;
    if (phase === 'provision_progress') {
      if (typeof hook.output !== 'string' || Buffer.byteLength(hook.output) > maxLineBytes)
        throw new Error('Original provisioner output must be bounded text');
      outputSha256 = createHash18('sha256').update(hook.output).digest('hex');
    }
    const candidate = Object.freeze({
      address: reviewed.address,
      resourceType: reviewed.type,
      action: active.action,
      phase,
      actionIndex: reviewed.next,
      elapsedSeconds: null,
      idKey: null,
      idValue: null,
      provisioner,
      provisionerIndex: active.provisionerNext,
      outputSha256,
      rawLineSha256: createHash18('sha256')
        .update(raw)
        .update(`
`)
        .digest('hex'),
      planSha256: this.#planSha256,
      applyRpcQualified: false,
      originalInsertQualified: false,
    });
    this.#eventTimes.set(candidate, this.#eventEpochMs);
    if (phase === 'provision_complete' || phase === 'provision_errored') {
      if (phase === 'provision_errored') this.#successful = false;
      active.provisioning = false;
      active.provisionerNext++;
    }
    return candidate;
  }
  finish() {
    this.#assertOpen();
    if (this.#originOutput) {
      this.#failed = true;
      throw new Error('Original UI descriptor completion required');
    }
    return this.#finish();
  }
  finishOriginal(output, completion) {
    this.#assertOpen();
    try {
      const original = readOriginalExecutionCompletion(output, completion);
      if (
        output !== this.#originOutput ||
        this.#sourceEnd !== completion.stdout.bytes ||
        this.#streamBytes !== completion.stdout.bytes ||
        this.#sourceHash.copy().digest('hex') !== completion.stdout.sha256
      )
        throw new Error('Original UI descriptor completion differs');
      const result = this.#finish();
      this.#originCompletion = original;
      return result;
    } catch (error) {
      this.#failed = true;
      throw error;
    }
  }
  #finish() {
    this.#assertOpen();
    if (!this.#version || this.#lineBytes || this.#active || this.#completed !== this.#expected) {
      this.#failed = true;
      throw new Error('Original Terraform UI stream is truncated or incomplete');
    }
    this.#closed = true;
    return Object.freeze({
      streamComplete: true,
      applySuccessful: this.#successful,
      expectedActions: this.#expected,
      completedActions: this.#completed,
      applyRpcQualified: false,
      originalInsertQualified: false,
    });
  }
}

// plugins/terraform/src/gcp-insert-evidence.ts
var sourceBodies = new WeakMap();
function readOriginalGcpInsertSourceBodies(source) {
  const bodies = sourceBodies.get(source);
  if (!bodies) throw new Error('An original insert source candidate is required');
  assertOriginalGoogleHttpRpcBodies(bodies);
  return bodies;
}
var insertOrigins = new WeakMap();
var hash13 = (value) => createHash19('sha256').update(value).digest('hex');
var name3 = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
var uint64 = (value) =>
  typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value) && BigInt(value) <= 18446744073709551615n;
var object9 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Original Compute insert object required');
  return value;
};
function canonical3(value) {
  if (Array.isArray(value)) return `[${value.map(canonical3).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical3(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function link(value) {
  if (typeof value !== 'string') throw new Error('Original scoped Compute link required');
  if (value.startsWith('projects/')) {
    if (!/^[a-zA-Z0-9_/-]+$/.test(value)) throw new Error('Original scoped Compute link malformed');
    return value;
  }
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
    throw new Error('Original scoped Compute link differs');
  return url.pathname.slice('/compute/v1/'.length);
}
function scopedResource(value, prefix) {
  const path = link(value);
  return path.startsWith(prefix) && name3.test(path.slice(prefix.length));
}
function metadata2(request) {
  const value = object9(request.metadata);
  if (
    Object.keys(value).some((key) => !['items', 'fingerprint'].includes(key)) ||
    (value.fingerprint !== undefined && value.fingerprint !== '') ||
    !Array.isArray(value.items)
  )
    throw new Error('Original creation metadata mapping required');
  const entries = Object.create(null);
  let bytes = 0;
  for (const raw of value.items) {
    const item = object9(raw);
    if (
      Object.keys(item).sort().join(',') !== 'key,value' ||
      typeof item.key !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,127}$/.test(item.key) ||
      Object.hasOwn(entries, item.key) ||
      typeof item.value !== 'string' ||
      Buffer.byteLength(item.value) > 262144
    )
      throw new Error('Original unique bounded metadata entries required');
    bytes += Buffer.byteLength(item.key) + Buffer.byteLength(item.value);
    entries[item.key] = item.value;
  }
  if (bytes >= 512 * 1024 || !entries['user-data'] || entries.VmDnsSetting !== 'ZonePreferred')
    throw new Error('Original node bootstrap and DNS metadata required');
  return { bootstrapSha256: hash13(entries['user-data']), metadataSha256: hash13(canonical3(entries)) };
}
function projectOriginalComputeInsert(input, binding) {
  const profile = resolveInstalledGcpVersionProfile(binding);
  if (
    !['8.10.0', '8.11.0'].includes(profile.googleVersion) ||
    input.googleProviderVersion !== profile.googleVersion ||
    input.rpc !== 'ApplyResourceChange' ||
    input.resourceType !== 'google_compute_instance' ||
    input.method !== 'POST' ||
    input.status !== 200 ||
    hash13(input.requestBody) !== input.requestBodySha256 ||
    hash13(input.responseBody) !== input.responseBodySha256
  )
    throw new Error('Original latest Compute insert body profile required');
  const url = new URL(input.url);
  const path = /^\/compute\/v1\/projects\/([a-z][a-z0-9-]{4,62})\/zones\/([a-z][a-z0-9-]{0,62})\/instances$/.exec(
    url.pathname,
  );
  if (url.origin !== 'https://compute.googleapis.com' || url.search !== '?alt=json' || url.hash || !path)
    throw new Error('Original latest zonal insert target required');
  const [, project, zone] = path;
  const request = decodeEvidenceObject(Buffer.from(input.requestBody)),
    operation = decodeEvidenceObject(Buffer.from(input.responseBody));
  if (
    typeof request.name !== 'string' ||
    !name3.test(request.name) ||
    request.canIpForward !== true ||
    request.deletionProtection !== false
  )
    throw new Error('Original CE instance creation fields required');
  const nodeName = request.name;
  if (!scopedResource(request.machineType, `projects/${project}/zones/${zone}/machineTypes/`))
    throw new Error('Original machine type zone and project required');
  const labels = object9(request.labels);
  if (
    labels['xcsh-engine'] !== 'terraform' ||
    labels['xcsh-node'] !== nodeName ||
    typeof labels['xcsh-deployment'] !== 'string' ||
    !name3.test(labels['xcsh-deployment']) ||
    typeof labels['xcsh-site'] !== 'string' ||
    !name3.test(labels['xcsh-site']) ||
    Object.values(labels).some((value) => typeof value !== 'string')
  )
    throw new Error('Original Terraform node ownership labels required');
  if (
    request.serviceAccounts !== undefined &&
    (!Array.isArray(request.serviceAccounts) || request.serviceAccounts.length)
  )
    throw new Error('Original request must not attach service accounts');
  if (
    !Array.isArray(request.networkInterfaces) ||
    !request.networkInterfaces.length ||
    !Array.isArray(request.disks) ||
    !request.disks.length
  )
    throw new Error('Original ordered interfaces and disks required');
  for (const raw of request.networkInterfaces) {
    const nic = object9(raw);
    if (
      !scopedResource(nic.network, `projects/${project}/global/networks/`) ||
      !scopedResource(nic.subnetwork, `projects/${project}/regions/${zone.slice(0, -2)}/subnetworks/`)
    )
      throw new Error('Original interface project and region required');
  }
  const identity = `projects/${project}/zones/${zone}`;
  if (
    !uint64(operation.id) ||
    typeof operation.name !== 'string' ||
    !/^[a-z][a-z0-9-]{0,254}$/.test(operation.name) ||
    operation.operationType !== 'insert' ||
    !['PENDING', 'RUNNING', 'DONE'].includes(operation.status) ||
    operation.error !== undefined ||
    link(operation.zone) !== identity ||
    link(operation.selfLink) !== `${identity}/operations/${operation.name}` ||
    link(operation.targetLink) !== `${identity}/instances/${nodeName}` ||
    (operation.targetId !== undefined && !uint64(operation.targetId))
  )
    throw new Error('Original exact scoped insert operation required');
  const candidate = Object.freeze({
    project,
    zone,
    nodeName,
    operationId: operation.id,
    operationName: operation.name,
    targetId: operation.targetId === undefined ? null : operation.targetId,
    status: operation.status,
    requestBodySha256: input.requestBodySha256,
    responseBodySha256: input.responseBodySha256,
    requestRecordsSha256: input.requestRecordsSha256,
    responseRecordsSha256: input.responseRecordsSha256,
    rpcRequestId: input.rpcRequestId,
    planSha256: input.planSha256,
    receivedRecordSha256: input.receivedRecordSha256,
    requestReasonSha256: input.requestReasonSha256,
    ...metadata2(request),
    labelsSha256: hash13(canonical3(labels)),
    interfacesSha256: hash13(canonical3(request.networkInterfaces)),
    disksSha256: hash13(canonical3(request.disks)),
    requestProjectionSha256: hash13(canonical3(request)),
    serviceAccountsRequested: false,
    applyRpcQualified: false,
    originalInsertQualified: false,
  });
  return candidate;
}
var earlyBodyOrigins = new WeakMap();
var earlyIdentityOrigins = new WeakMap();
async function readOriginalEarlyGcpInsertBodies(value) {
  const read = value && typeof value === 'object' ? earlyBodyOrigins.get(value) : undefined;
  if (!read) throw new Error('Original early insertion identity required');
  return read();
}
async function readOriginalEarlyGcpInsertIdentity(value) {
  const verify = value && typeof value === 'object' ? earlyIdentityOrigins.get(value) : undefined;
  if (!verify) throw new Error('Original early insertion identity required');
  await verify();
  return value;
}
async function collectOriginalEarlyGcpInsertIdentity(input) {
  const { originalPlan, response } = input;
  const binding = Object.freeze({ ...input.binding });
  let refused = false;
  const verify = async () => {
    if (refused) throw new Error('Original early insertion identity refused');
    try {
      await assertOriginalTerraformPlanProjection(originalPlan);
      const source = await readOriginalGoogleHttpResponseSource(response);
      const profile = resolveInstalledGcpVersionProfile(binding);
      if (source.directory !== originalPlan.directory)
        throw new Error('Original early insertion plan directory differs');
      if (
        !isOriginalCreationScopeProfile(profile) ||
        originalPlan.terraformVersion !== binding.terraformVersion ||
        originalPlan.receipt.providerLockSha256 !== binding.providerLockSha256 ||
        originalPlan.scope.cloud !== 'gcp' ||
        originalPlan.receipt.engine !== 'terraform' ||
        originalPlan.receipt.noChanges ||
        originalPlan.receipt.operation !== undefined ||
        source.planSha256 !== originalPlan.receipt.planSha256 ||
        response.planSha256 !== originalPlan.receipt.planSha256
      )
        throw new Error('Original current early insertion plan scope differs');
      const projection = projectOriginalComputeInsert(response, binding);
      if (
        projection.project !== originalPlan.scope.account ||
        !projection.zone.startsWith(`${originalPlan.scope.region}-`)
      )
        throw new Error('Original early insertion project or region differs');
      const matches = originalPlan.resources.filter((row) => {
        const known = (key, expected) => {
          const field = row.fields[key];
          return field?.status === 'known' && field.value === expected;
        };
        return (
          row.mode === 'managed' &&
          row.type === 'google_compute_instance' &&
          row.actions.includes('create') &&
          known('name', projection.nodeName) &&
          known('project', projection.project) &&
          known('zone', projection.zone)
        );
      });
      if (matches.length !== 1 || !/^google_compute_instance\.[a-z][a-z0-9_]*$/.test(matches[0].address))
        throw new Error('Original unique declared early VM creation required');
      await assertOriginalTerraformPlanProjection(originalPlan);
      await readOriginalGoogleHttpResponseSource(response);
      return { projection, source, address: matches[0].address };
    } catch (error) {
      refused = true;
      throw error;
    }
  };
  const joined = await verify();
  const candidate = Object.freeze({
    schemaVersion: 1,
    kind: 'original-early-gcp-insert-identity',
    ...joined.projection,
    address: joined.address,
    directory: joined.source.directory,
    executor: joined.source.executor,
    rpcCompletionQualified: false,
    executionAuthorized: false,
  });
  earlyIdentityOrigins.set(candidate, async () => {
    await verify();
  });
  earlyBodyOrigins.set(candidate, async () => {
    await verify();
    const bodies = Object.freeze({
      requestBody: response.requestBody,
      responseBody: response.responseBody,
      requestBodySha256: response.requestBodySha256,
      responseBodySha256: response.responseBodySha256,
      executionAuthorized: false,
    });
    await verify();
    return bodies;
  });
  return candidate;
}
function joinOriginalGcpInsertSource(input) {
  const { insert, plan, rpc, window, parent, started, completed } = input;
  if (Buffer.byteLength(input.configuration) > 64 * 1024 * 1024)
    throw new Error('Bounded original reviewed configuration required');
  const bodies = insertOrigins.get(insert);
  if (!bodies) throw new Error('An original insert projection is required');
  assertOriginalGoogleHttpRpcBodies(bodies);
  const profile = resolveInstalledGcpVersionProfile(input.binding);
  if (
    plan.schemaVersion !== 1 ||
    plan.engine !== 'terraform' ||
    plan.noChanges ||
    plan.operation !== undefined ||
    plan.providerLockSha256 !== input.binding.providerLockSha256 ||
    plan.planSha256 !== insert.planSha256 ||
    hash13(input.configuration) !== plan.configurationSha256 ||
    (plan.actionInvocations?.length ?? 0)
  )
    throw new Error('Original reviewed Terraform create plan and bytes required');
  const configuration = decodeEvidenceObject(Buffer.from(input.configuration));
  if (configuration.module !== undefined) throw new Error('Module instance source mapping is unavailable');
  const address = /^google_compute_instance\.([a-z][a-z0-9_]*)$/.exec(started.address);
  const changes = plan.changes.filter((value) => value.address === started.address);
  if (
    !address ||
    new Set(plan.changes.map((value) => value.address)).size !== plan.changes.length ||
    changes.length !== 1 ||
    changes[0].type !== 'google_compute_instance' ||
    !Number.isSafeInteger(started.actionIndex) ||
    started.actionIndex < 0 ||
    changes[0].actions[started.actionIndex] !== 'create' ||
    started.phase !== 'apply_start' ||
    completed.phase !== 'apply_complete' ||
    started.action !== 'create' ||
    completed.action !== 'create' ||
    started.resourceType !== 'google_compute_instance' ||
    completed.resourceType !== started.resourceType ||
    completed.address !== started.address ||
    completed.actionIndex !== started.actionIndex ||
    started.planSha256 !== plan.planSha256 ||
    completed.planSha256 !== plan.planSha256 ||
    completed.idKey !== 'id' ||
    completed.idValue !== `projects/${insert.project}/zones/${insert.zone}/instances/${insert.nodeName}`
  )
    throw new Error('Original declared create action and completed resource identity required');
  const resource = object9(object9(object9(configuration.resource).google_compute_instance)[address[1]]);
  const expectedLabels = object9(resource.labels),
    labels = object9(decodeEvidenceObject(Buffer.from(bodies.requestBody)).labels);
  if (
    resource.name !== insert.nodeName ||
    resource.project !== insert.project ||
    resource.zone !== insert.zone ||
    resource.can_ip_forward !== true ||
    typeof resource.machine_type !== 'string' ||
    !name3.test(resource.machine_type) ||
    expectedLabels['xcsh-engine'] !== 'terraform' ||
    expectedLabels['xcsh-node'] !== insert.nodeName ||
    typeof expectedLabels['xcsh-site'] !== 'string' ||
    typeof expectedLabels['xcsh-deployment'] !== 'string' ||
    !scopedResource(
      `projects/${insert.project}/zones/${insert.zone}/machineTypes/${String(resource.machine_type)}`,
      `projects/${insert.project}/zones/${insert.zone}/machineTypes/`,
    ) ||
    link(decodeEvidenceObject(Buffer.from(bodies.requestBody)).machineType) !==
      `projects/${insert.project}/zones/${insert.zone}/machineTypes/${resource.machine_type}` ||
    Object.entries(expectedLabels).some(([key, value]) => typeof value !== 'string' || labels[key] !== value)
  )
    throw new Error('Original declared request resource fields differ');
  const providers = object9(configuration.provider).google;
  const provider = object9(Array.isArray(providers) && providers.length === 1 ? providers[0] : providers);
  if (
    provider.project !== insert.project ||
    provider.alias !== undefined ||
    resource.provider !== undefined ||
    typeof provider.request_reason !== 'string' ||
    hash13(provider.request_reason) !== insert.requestReasonSha256
  )
    throw new Error('Original reviewed provider request reason required');
  if (
    rpc.rpc !== 'ApplyResourceChange' ||
    rpc.resourceType !== 'google_compute_instance' ||
    rpc.rpcRequestId !== insert.rpcRequestId ||
    rpc.planSha256 !== plan.planSha256 ||
    rpc.receivedRecordSha256 !== insert.receivedRecordSha256 ||
    rpc.servedRecordSha256 !== insert.servedRecordSha256 ||
    !isAbsolute13(input.providerPath) ||
    resolve13(input.providerPath) !== input.providerPath ||
    basename3(input.providerPath) !== `terraform-provider-google_v${profile.googleVersion}_x5` ||
    rpc.providerPathSha256 !== hash13(input.providerPath)
  )
    throw new Error('Original lifecycle RPC and insert source records differ');
  if (
    profile.googleVersion === '8.11.0' &&
    (window.schemaVersion !== 4 || window.kind !== 'original-provider-stderr-verified-window')
  )
    throw new Error('Original Google8.11 verified window required');
  if (
    ![3, 4].includes(window.schemaVersion) ||
    !['original-provider-stderr-coherent-window', 'original-provider-stderr-verified-window'].includes(window.kind) ||
    window.samplingWindowComplete !== true ||
    ![window.windowStartedMs, window.windowDeadlineMs, window.finishedMs].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    ) ||
    window.windowDeadlineMs <= window.windowStartedMs ||
    window.windowDeadlineMs - window.windowStartedMs > 45000 ||
    window.finishedMs < window.windowStartedMs ||
    (window.executorAvailable && window.executorGroupClosed) ||
    (!window.executorGroupClosed && window.finishedMs < window.windowDeadlineMs) ||
    ['pid', 'group', 'start', 'boot'].some((key) => window.executor[key] !== parent[key]) ||
    !Number.isSafeInteger(parent.pid) ||
    parent.pid <= 0 ||
    parent.group !== parent.pid ||
    typeof parent.start !== 'string' ||
    !/^[0-9]+$/.test(parent.start) ||
    typeof parent.boot !== 'string' ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(parent.boot) ||
    window.signalsSent !== false ||
    window.cloudSubmissions !== 0 ||
    window.applyPhaseQualified !== false
  )
    throw new Error('Original coherent provider window and executor required');
  const observations = window.observations.filter((value) => value.candidate.pid === rpc.providerPid);
  if (observations.length !== 1) throw new Error('Original RPC provider observation missing or ambiguous');
  const { candidate, stderr, firstObservedMs, lastObservedMs } = observations[0];
  if (
    !Number.isSafeInteger(candidate.pid) ||
    candidate.pid <= 0 ||
    candidate.pid === parent.pid ||
    candidate.parent !== parent.pid ||
    candidate.group !== parent.group ||
    candidate.boot !== parent.boot ||
    candidate.executable_sha256 !== profile.googleProviderSha256 ||
    !/^[0-9]+$/.test(candidate.start) ||
    stderr.providerFd !== 2 ||
    !Number.isSafeInteger(stderr.parentFd) ||
    stderr.parentFd < 3 ||
    typeof stderr.device !== 'string' ||
    typeof stderr.inode !== 'string' ||
    ![stderr.providerFlags, stderr.parentFlags].every((value) => Number.isSafeInteger(value) && value >= 0) ||
    ![firstObservedMs, lastObservedMs].every((value) => Number.isSafeInteger(value) && value >= 0) ||
    !/^[0-9]+$/.test(stderr.device) ||
    !/^[1-9][0-9]*$/.test(stderr.inode) ||
    (stderr.providerFlags & 3) !== 1 ||
    (stderr.parentFlags & 3) !== 0 ||
    firstObservedMs < window.windowStartedMs ||
    lastObservedMs < firstObservedMs ||
    lastObservedMs > window.finishedMs ||
    window.finishedMs > window.windowDeadlineMs
  )
    throw new Error('Original provider incarnation and FIFO evidence differ');
  for (const digest of [
    started.rawLineSha256,
    completed.rawLineSha256,
    rpc.startingRecordSha256,
    rpc.startedRecordSha256,
    window.evidenceSha256,
  ])
    if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest))
      throw new Error('Original source record digests required');
  const joined = Object.freeze({
    ...insert,
    schemaVersion: 1,
    kind: 'original-gcp-instance-insert-source-candidate',
    resourceAddress: started.address,
    providerPid: candidate.pid,
    providerStart: candidate.start,
    providerBoot: candidate.boot,
    providerSha256: candidate.executable_sha256,
    parentPid: parent.pid,
    parentStart: parent.start,
    parentBoot: parent.boot,
    actionStartedSha256: started.rawLineSha256,
    actionCompletedSha256: completed.rawLineSha256,
    windowSha256: window.evidenceSha256,
    sourceCorroborated: true,
    providerProcessQualified: false,
    applyRpcQualified: false,
    originalInsertQualified: false,
  });
  sourceBodies.set(joined, bodies);
  return joined;
}
var originalWitnesses = new WeakMap();
async function readOriginalGcpInsertWitnesses(value) {
  const read = originalWitnesses.get(value);
  if (!read) throw new Error('Original witnessed GCP insert reference required');
  return read();
}
async function collectOriginalGcpInsertWitnesses(input) {
  const originalPlan = input.originalPlan;
  const binding = Object.freeze({ ...input.binding });
  const { configuration, providerPath } = input;
  const { insert, started, completed, rpc, window } = input;
  await assertOriginalTerraformPlanProjection(originalPlan);
  const bodies = insertOrigins.get(insert);
  if (!bodies) throw new Error('Original insert projection required');
  let refused = false;
  const verify = async () => {
    if (refused) throw new Error('Original insertion witnesses were refused');
    try {
      await assertOriginalTerraformPlanProjection(originalPlan);
      if (
        originalPlan.terraformVersion !== binding.terraformVersion ||
        originalPlan.receipt.providerLockSha256 !== binding.providerLockSha256 ||
        originalPlan.receipt.planSha256 !== insert.planSha256 ||
        originalPlan.scope.cloud !== 'gcp' ||
        originalPlan.scope.account !== insert.project ||
        !insert.zone.startsWith(`${originalPlan.scope.region}-`)
      )
        throw new Error('Original insert owning plan scope differs');
      const startSource = await readOriginalTerraformApplyHookSource(started);
      const completeSource = await readOriginalTerraformApplyHookSource(completed);
      const http = await readOriginalGoogleHttpRpcSource(bodies);
      const lifecycle = readOriginalGoogleProviderRpcSource(rpc);
      const executor = startSource.executor;
      if (startSource.directory !== originalPlan.directory)
        throw new Error('Original insert owning plan directory differs');
      for (const source of [completeSource, http, lifecycle]) {
        if (
          ['pid', 'group', 'start', 'boot'].some((key) => source.executor[key] !== executor[key]) ||
          source.directory !== originalPlan.directory ||
          source.planSha256 !== originalPlan.receipt.planSha256 ||
          source.stderrSha256 !== startSource.stderrSha256 ||
          source.stderrBytes !== startSource.stderrBytes
        )
          throw new Error('Original insert executor, plan or stderr producer differs');
      }
      if (
        completeSource.stdoutSha256 !== startSource.stdoutSha256 ||
        completeSource.stdoutBytes !== startSource.stdoutBytes ||
        http.stdoutSha256 !== startSource.stdoutSha256 ||
        http.stdoutBytes !== startSource.stdoutBytes ||
        http.rpcRequestId !== rpc.rpcRequestId ||
        http.rpcRequestId !== insert.rpcRequestId
      )
        throw new Error('Original insert UI and HTTP records differ');
      if (
        startSource.eventEpochMs > completeSource.eventEpochMs ||
        startSource.eventEpochMs > lifecycle.receivedEpochMs ||
        completeSource.eventEpochMs < lifecycle.servedEpochMs
      )
        throw new Error('Original insert UI temporal interval does not contain its RPC');
      const correspondence = await corroborateOriginalGoogleRpcProvider({ rpc, windows: [window], binding });
      if (
        correspondence.planSha256 !== originalPlan.receipt.planSha256 ||
        correspondence.sourceStderrSha256 !== startSource.stderrSha256
      )
        throw new Error('Original insert provider window source differs');
      joinOriginalGcpInsertSource({
        insert,
        binding,
        plan: originalPlan.receipt,
        configuration,
        started,
        completed,
        rpc,
        window,
        parent: executor,
        providerPath,
      });
      await readOriginalTerraformApplyHookSource(started);
      await readOriginalTerraformApplyHookSource(completed);
      await readOriginalGoogleHttpRpcSource(bodies);
      readOriginalGoogleProviderRpcSource(rpc);
      await assertOriginalTerraformPlanProjection(originalPlan);
      return Object.freeze({
        schemaVersion: 1,
        kind: 'original-gcp-insert-source-witnesses',
        directory: originalPlan.directory,
        executor,
        planSha256: originalPlan.receipt.planSha256,
        stdoutSha256: startSource.stdoutSha256,
        stderrSha256: startSource.stderrSha256,
        uiStartEpochMs: startSource.eventEpochMs,
        uiCompleteEpochMs: completeSource.eventEpochMs,
        rpcReceivedEpochMs: lifecycle.receivedEpochMs,
        rpcServedEpochMs: lifecycle.servedEpochMs,
        uiSourceCorroborated: true,
        httpSourceCorroborated: true,
        rpcWindowTimeCorroborated: true,
        applyRpcQualified: false,
        originalInsertQualified: false,
      });
    } catch (error) {
      refused = true;
      throw error;
    }
  };
  const witnesses = await verify();
  const candidate = joinOriginalGcpInsertSource({
    insert,
    binding,
    plan: originalPlan.receipt,
    configuration,
    started,
    completed,
    rpc,
    window,
    parent: witnesses.executor,
    providerPath,
  });
  originalWitnesses.set(candidate, verify);
  return candidate;
}

// plugins/terraform/src/gcp-vm-evidence.ts
// plugins/terraform/src/gcp-cloud-serial-reader.ts
import { createHash as createHash20, createHash as createHash22, randomUUID as randomUUID9 } from 'node:crypto';
import { lstat as lstat13, mkdir as mkdir8, open as open10, realpath as realpath12 } from 'node:fs/promises';
import { isIP } from 'node:net';
import { isAbsolute as isAbsolute14, join as join16, resolve as resolve14 } from 'node:path';

var cloudReaderOrigins = new WeakMap();
var installedReaderContexts = new WeakMap();
function isInstalledGcpCloudSerialReader(reader) {
  return !!reader && typeof reader === 'object' && installedReaderContexts.has(reader);
}
async function assertOriginalInstalledGcpCloudReader(reader, context) {
  if (!reader || typeof reader !== 'object' || !installedReaderContexts.has(reader))
    throw new Error('Original installed cloud reader required');
  if (installedReaderContexts.get(reader) !== context)
    throw new Error('Original installed cloud reader context differs');
  const verify = cloudReaderOrigins.get(reader);
  if (!verify) throw new Error('Original cloud reader source required');
  await verify();
}
var installedReaderFinals = new WeakMap();
async function assertOriginalInstalledGcpFinalCloudReader(reader, callback) {
  await assertOriginalApplyCallback(callback);
  const issued = reader && typeof reader === 'object' ? installedReaderFinals.get(reader) : undefined;
  if (
    callback.phase !== 'after' ||
    !callback.reserve ||
    !issued ||
    issued.admission !== callback.execution ||
    issued.reserve !== callback.reserve
  )
    throw new Error('Original installed final cloud reader and callback reserve required');
  await assertOriginalInstalledGcpCloudReader(reader, callback.original);
  await assertOriginalApplyCallback(callback);
}
var hash14 = (raw) => createHash20('sha256').update(raw).digest('hex');
var name4 = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
var numericId = /^[1-9][0-9]{0,19}$/;
var uint642 = (value) => typeof value === 'string' && numericId.test(value) && BigInt(value) <= 18446744073709551615n;
var operationName2 = /^(?:[a-z](?:[-a-z0-9]{0,61}[a-z0-9])?|[1-9][0-9]{0,19})$/;
var returnedOperationName = /^[a-z][a-z0-9-]{0,254}$/;
var offset2 = /^(?:0|[1-9][0-9]{0,19})$/;
var serialOffset2 = (value) =>
  typeof value === 'string' && offset2.test(value) && BigInt(value) <= 9223372036854775807n;
var object10 = (v) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Malformed original cloud response');
  return v;
};
var decode3 = (raw) => decodeEvidenceObject(raw);
async function openGcpCloudSerialReader(input, signal, fetcher = fetch) {
  const { root, region } = input;
  const authentication = Object.freeze({
    ...input.authentication,
    credentialBytes: Buffer.from(input.authentication.credentialBytes),
  });
  if (!isAbsolute14(root) || resolve14(root) !== root || !name4.test(region))
    throw new Error('Private original cloud reader scope required');
  await mkdir8(root, { recursive: true, mode: 448 });
  const initial = await lstat13(root, { bigint: true });
  if (
    !initial.isDirectory() ||
    initial.isSymbolicLink() ||
    initial.uid !== BigInt(process.getuid?.() ?? -1) ||
    (initial.mode & 0o777n) !== 0o700n ||
    (await realpath12(root)) !== root
  )
    throw new Error('Private original cloud reader directory required');
  const requireRoot = async () => {
    const current = await lstat13(root, { bigint: true });
    if (
      current.dev !== initial.dev ||
      current.ino !== initial.ino ||
      current.uid !== initial.uid ||
      current.mode !== initial.mode ||
      (await realpath12(root)) !== root
    )
      throw new Error('Original cloud evidence directory changed');
  };
  const retirement = new AbortController();
  const sourceSignal = signal ? AbortSignal.any([signal, retirement.signal]) : retirement.signal;
  const client = await openGoogleAdcComputeReader(authentication, sourceSignal, fetcher);
  const admitted = new WeakSet();
  const issuedEvidence = new WeakSet();
  const auditQueries = new WeakMap();
  const evidenceInputs = new Map();
  const issue = (value) => {
    if (!evidenceInputs.has(value.path)) throw new Error('Original retained cloud evidence required');
    issuedEvidence.add(value);
    return value;
  };
  const originals = new Map();
  const resourceOrigins = new WeakSet();
  const resourceIdentities = new Map();
  let retired = false;
  let closure;
  const pendingReads = new Set();
  const run = async (operation) => {
    if (retired) throw new Error('Original cloud reader is retired');
    const pending = Promise.resolve().then(operation);
    pendingReads.add(pending);
    try {
      const result = await pending;
      if (retired) throw new Error('Original cloud reader retired during capture');
      return result;
    } catch (error) {
      retired = true;
      throw error;
    } finally {
      pendingReads.delete(pending);
    }
  };
  const validate = (zone, node) => {
    if (!name4.test(zone) || !zone.startsWith(`${region}-`) || !name4.test(node))
      throw new Error('Original named regional cloud scope required');
  };
  const retainScoped = async (response, kind, scope, querySha256) => {
    await requireRoot();
    const stem = join16(root, `${kind}-${randomUUID9()}`);
    const path = `${stem}.body.private.bin`;
    const receiptPath = `${stem}.receipt.private.json`;
    const handle = await open10(path, 'wx', 256);
    try {
      await handle.writeFile(response.raw);
      await handle.sync();
    } finally {
      await handle.close();
    }
    const evidence = Object.freeze({
      path,
      sha256: hash14(response.raw),
      startedAt: response.startedAt,
      finishedAt: response.finishedAt,
    });
    const receipt = await open10(receiptPath, 'wx', 256);
    try {
      await receipt.writeFile(
        JSON.stringify({
          schemaVersion: 1,
          kind,
          project: authentication.project,
          ...('target' in scope
            ? { target: scope.target, selfLink: scope.selfLink }
            : { zone: scope.zone, nodeName: scope.node }),
          ...evidence,
          status: response.status,
          complete: response.complete,
          truncated: response.truncated,
          adcSha256: hash14(authentication.credentialBytes),
          accountSha256: authentication.accountSha256,
          audienceSha256: authentication.audienceSha256,
          ...(querySha256 ? { querySha256 } : {}),
          cloudExecutionAuthorized: false,
        }),
      );
      await receipt.sync();
    } finally {
      await receipt.close();
    }
    const directory = await open10(root, 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
    await requireRoot();
    const retained = await owned(path, 4 * 1024 * 1024);
    if (retained.binding.sha256 !== evidence.sha256) throw new Error('Original retained cloud bytes changed');
    evidenceInputs.set(path, {
      binding: retained.binding,
      scope: Object.freeze(scope),
    });
    return issue(evidence);
  };
  const retain = (response, kind, zone, node, querySha256) =>
    retainScoped(response, kind, Object.freeze({ project: authentication.project, zone, node }), querySha256);
  const read = async (operation, kind, zone, node) => {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof GoogleComputeReadError) {
        try {
          await retain(error.capture, kind, zone, node);
        } catch (persistenceError) {
          throw new AggregateError([error, persistenceError], 'Original cloud capture and persistence failed');
        }
      }
      throw error;
    }
  };
  const instance = async (zone, node) => {
    validate(zone, node);
    return run(async () => {
      const began = linuxMonotonicMs();
      const response = await read(() => client.instance(zone, node), 'cloud', zone, node);
      const evidence = await retain(response, 'cloud', zone, node);
      const value = decode3(response.raw);
      if (response.status === 404) {
        const error =
          value.error && typeof value.error === 'object' && !Array.isArray(value.error) ? object10(value.error) : {};
        if (
          error.code !== 404 ||
          !Array.isArray(error.errors) ||
          !error.errors.some((v) => object10(v).reason === 'notFound')
        )
          throw new Error('Attributed original cloud absence required');
        return issue(Object.freeze({ ...evidence, present: false }));
      }
      if (response.status !== 200) throw new Error('Original cloud read HTTP failure');
      const zoneUrl = `https://www.googleapis.com/compute/v1/projects/${authentication.project}/zones/${zone}`;
      if (
        !uint642(value.id) ||
        value.name !== node ||
        value.zone !== zoneUrl ||
        typeof value.creationTimestamp !== 'string' ||
        !isEvidenceRfc3339(value.creationTimestamp) ||
        !Array.isArray(value.networkInterfaces) ||
        linuxMonotonicMs() - began > 60000
      )
        throw new Error('Original numeric cloud VM identity required');
      const freeze = (v) => {
        if (v && typeof v === 'object') {
          for (const child of Object.values(v)) freeze(child);
          Object.freeze(v);
        }
        return v;
      };
      freeze(value);
      const original = Object.freeze({
        ...evidence,
        present: true,
        zone,
        name: node,
        value,
      });
      const key = `${zone}/${node}`;
      const prior = originals.get(key);
      if (
        prior &&
        (prior.value.id !== original.value.id ||
          prior.value.creationTimestamp !== original.value.creationTimestamp ||
          prior.value.canIpForward !== original.value.canIpForward ||
          prior.value.machineType !== original.value.machineType ||
          JSON.stringify(prior.value.metadata) !== JSON.stringify(original.value.metadata) ||
          JSON.stringify(prior.value.networkInterfaces) !== JSON.stringify(original.value.networkInterfaces) ||
          JSON.stringify(prior.value.labels) !== JSON.stringify(original.value.labels) ||
          JSON.stringify(prior.value.serviceAccounts) !== JSON.stringify(original.value.serviceAccounts))
      )
        throw new Error('Original VM identity changed during cloud capture');
      originals.set(key, prior ?? original);
      admitted.add(original);
      return issue(original);
    });
  };
  const serial = async (original, start) => {
    if (!admitted.has(original) || !serialOffset2(start))
      throw new Error('An admitted original VM and exact serial offset are required');
    return run(async () => {
      const began = linuxMonotonicMs();
      const assertVm = async () => {
        const current = await instance(original.zone, original.name);
        if (
          !current.present ||
          current.value.id !== original.value.id ||
          current.value.creationTimestamp !== original.value.creationTimestamp ||
          current.value.canIpForward !== original.value.canIpForward ||
          current.value.machineType !== original.value.machineType ||
          JSON.stringify(current.value.metadata) !== JSON.stringify(original.value.metadata) ||
          JSON.stringify(current.value.networkInterfaces) !== JSON.stringify(original.value.networkInterfaces) ||
          JSON.stringify(current.value.labels) !== JSON.stringify(original.value.labels) ||
          JSON.stringify(current.value.serviceAccounts) !== JSON.stringify(original.value.serviceAccounts)
        )
          throw new Error('Original VM identity changed during serial capture');
      };
      await assertVm();
      const response = await read(
        () => client.serial(original.zone, original.name, start),
        'serial',
        original.zone,
        original.name,
      );
      const evidence = await retain(response, 'serial', original.zone, original.name);
      const value = decode3(response.raw);
      await assertVm();
      if (
        response.status !== 200 ||
        typeof value.start !== 'string' ||
        typeof value.next !== 'string' ||
        !serialOffset2(value.start) ||
        !serialOffset2(value.next) ||
        typeof value.contents !== 'string' ||
        value.start !== start ||
        BigInt(value.next) - BigInt(value.start) !== BigInt(Buffer.byteLength(value.contents)) ||
        linuxMonotonicMs() - began > 60000
      )
        throw new Error('Complete original serial offsets and contents required');
      return issue(Object.freeze({ ...evidence, instanceId: original.value.id, value: Object.freeze(value) }));
    });
  };
  const operations = new Map();
  const insertOperation = async (zone, operation, node) => {
    validate(zone, node);
    if (!operationName2.test(operation) || (/^[0-9]+$/.test(operation) && !uint642(operation)))
      throw new Error('Exact named Compute operation scope required');
    return run(async () => {
      const response = await read(() => client.operation(zone, operation), 'insert-operation', zone, node);
      const evidence = await retain(response, 'insert-operation', zone, node);
      const value = decode3(response.raw);
      const scope = `https://www.googleapis.com/compute/v1/projects/${authentication.project}/zones/${zone}`;
      if (
        response.status !== 200 ||
        !uint642(value.id) ||
        typeof value.name !== 'string' ||
        !returnedOperationName.test(value.name) ||
        (/^[0-9]+$/.test(operation) ? value.id !== operation : value.name !== operation) ||
        value.operationType !== 'insert' ||
        value.error !== undefined ||
        value.zone !== scope ||
        value.selfLink !== `${scope}/operations/${value.name}` ||
        value.targetLink !== `${scope}/instances/${node}` ||
        !['PENDING', 'RUNNING', 'DONE'].includes(value.status) ||
        typeof value.insertTime !== 'string' ||
        !isEvidenceRfc3339(value.insertTime) ||
        (value.targetId !== undefined && !uint642(value.targetId))
      )
        throw new Error('Exact scoped Compute insert operation identity required');
      const targetId = value.targetId === undefined ? null : value.targetId;
      const candidate = Object.freeze({
        ...evidence,
        kind: 'compute-insert-operation-candidate',
        operationId: value.id,
        operationName: value.name,
        targetId,
        targetName: node,
        zone,
        status: value.status,
        applyPhaseQualified: false,
        originalInsertQualified: false,
      });
      const key = `${zone}/${value.name}`;
      const original = operations.get(key);
      if (
        original &&
        (original.operationId !== candidate.operationId ||
          original.targetName !== node ||
          (original.targetId !== null && original.targetId !== candidate.targetId))
      )
        throw new Error('Original Compute insert operation changed');
      operations.set(key, candidate);
      return issue(candidate);
    });
  };
  const insertAudit = async (zone, node, input) => {
    validate(zone, node);
    const window = Object.freeze({ ...input });
    const query = compileGcpInsertAuditQuery(authentication.project, zone, node, window);
    const queryBytes = Buffer.from(JSON.stringify(query));
    const querySha256 = hash14(queryBytes);
    return run(async () => {
      const began = linuxMonotonicMs(),
        signalForCommand = AbortSignal.timeout(60000);
      await requireRoot();
      const queryPath = join16(root, `insert-audit-${randomUUID9()}.query.private.json`);
      const queryHandle = await open10(queryPath, 'wx', 256);
      try {
        await queryHandle.writeFile(queryBytes);
        await queryHandle.sync();
      } finally {
        await queryHandle.close();
      }
      const queryDirectory = await open10(root, 'r');
      try {
        await queryDirectory.sync();
      } finally {
        await queryDirectory.close();
      }
      await requireRoot();
      const originalQuery = await owned(queryPath, 65536);
      if (originalQuery.binding.sha256 !== querySha256) throw new Error('Original audit query bytes changed');
      const pages = [],
        entries = [];
      const tokens = new Set(),
        ids = new Set();
      let pageToken,
        bytes = 0;
      while (true) {
        signalForCommand.throwIfAborted();
        if (linuxMonotonicMs() - began >= 60000 || pages.length >= 32)
          throw new Error('Original audit command deadline or page bound exhausted');
        let response;
        try {
          response = await client.auditInstanceInsert(
            zone,
            node,
            window,
            pageToken,
            signalForCommand,
            4 * 1024 * 1024 - bytes,
          );
        } catch (error) {
          if (error instanceof GoogleComputeReadError) {
            try {
              await retain(error.capture, 'insert-audit', zone, node, querySha256);
            } catch (persistenceFailure) {
              throw new AggregateError([error, persistenceFailure], 'Original audit capture and persistence failed');
            }
          }
          throw error;
        }
        pages.push(issue(await retain(response, 'insert-audit', zone, node, querySha256)));
        bytes += response.raw.byteLength;
        if (!response.complete || response.truncated || response.status !== 200 || bytes > 4 * 1024 * 1024)
          throw new Error('Complete bounded original audit response required');
        const value = decode3(response.raw);
        if (Object.keys(value).some((key) => !['entries', 'nextPageToken'].includes(key)))
          throw new Error('Original audit envelope contains unsupported fields');
        if (value.entries !== undefined && !Array.isArray(value.entries))
          throw new Error('Original audit entries malformed');
        for (const raw of value.entries ?? []) {
          const entry = object10(raw),
            payload = object10(entry.protoPayload),
            resource = object10(entry.resource),
            labels = object10(resource.labels);
          if (
            entry.split !== undefined ||
            typeof entry.insertId !== 'string' ||
            !entry.insertId ||
            entry.insertId.length > 256 ||
            hasAuditControlCharacters(entry.insertId) ||
            ids.has(entry.insertId) ||
            typeof entry.timestamp !== 'string' ||
            !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:[.][0-9]{1,9})?Z$/.test(entry.timestamp) ||
            !isEvidenceRfc3339(entry.timestamp) ||
            Date.parse(entry.timestamp) < Date.parse(window.after) ||
            Date.parse(entry.timestamp) > Date.parse(window.before) ||
            entry.logName !== `projects/${authentication.project}/logs/cloudaudit.googleapis.com%2Factivity` ||
            payload['@type'] !== 'type.googleapis.com/google.cloud.audit.AuditLog' ||
            payload.serviceName !== 'compute.googleapis.com' ||
            payload.methodName !== 'v1.compute.instances.insert' ||
            payload.resourceName !== `projects/${authentication.project}/zones/${zone}/instances/${node}` ||
            resource.type !== 'gce_instance' ||
            labels.project_id !== authentication.project ||
            labels.zone !== zone
          )
            throw new Error('Foreign, replayed or stale original insert audit entry');
          ids.add(entry.insertId);
          const freeze = (v) => {
            if (v && typeof v === 'object') {
              for (const child of Object.values(v)) freeze(child);
              Object.freeze(v);
            }
            return v;
          };
          freeze(entry);
          entries.push(entry);
        }
        const next = value.nextPageToken;
        if (next === undefined || next === '') break;
        if (typeof next !== 'string' || next.length > 8192 || hasAuditControlCharacters(next) || tokens.has(next))
          throw new Error('Original audit continuation malformed or replayed');
        tokens.add(next);
        pageToken = next;
      }
      signalForCommand.throwIfAborted();
      if (linuxMonotonicMs() - began >= 60000) throw new Error('Original audit command deadline exhausted');
      const finalQuery = await owned(queryPath, 65536);
      assertSameOriginalInput(originalQuery.binding, finalQuery.binding);
      await authentication.assertOriginal();
      await requireRoot();
      const batch = Object.freeze({
        schemaVersion: 1,
        kind: 'compute-instance-insert-audit-batch',
        complete: true,
        queryPath,
        window,
        project: authentication.project,
        zone,
        node,
        querySha256,
        pages: Object.freeze(pages),
        entries: Object.freeze(entries),
        originalInsertQualified: false,
      });
      const issuedQuery = await owned(queryPath, 65536);
      assertSameOriginalInput(originalQuery.binding, issuedQuery.binding);
      auditQueries.set(batch, originalQuery.binding);
      return batch;
    });
  };
  const resource = async (input, signal) => {
    const compiled = compileGcpInventoryResourceTarget(authentication.project, input);
    const target = compiled.target;
    if (
      (target.kind === 'disk' && !target.zone.startsWith(`${region}-`)) ||
      (target.kind === 'subnetwork' && target.region !== region)
    )
      throw new Error('Original regional Compute inventory scope required');
    const scope = Object.freeze({
      project: authentication.project,
      target,
      selfLink: compiled.selfLink,
    });
    return run(async () => {
      let response;
      try {
        response = await client.resource(target, signal);
      } catch (error) {
        if (error instanceof GoogleComputeReadError) {
          try {
            await retainScoped(error.capture, 'inventory', scope);
          } catch (retention) {
            throw new AggregateError([error, retention], 'Original inventory transport and retention failed');
          }
        }
        throw error;
      }
      const evidence = await retainScoped(response, 'inventory', scope);
      const value = decode3(response.raw);
      const base = {
        ...evidence,
        kind: 'original-compute-inventory-resource',
        target,
        selfLink: compiled.selfLink,
        creationOwnershipQualified: false,
      };
      let result;
      if (response.status === 404) {
        const error =
          value.error && typeof value.error === 'object' && !Array.isArray(value.error) ? object10(value.error) : {};
        if (
          error.code !== 404 ||
          !Array.isArray(error.errors) ||
          !error.errors.some((entry) => object10(entry).reason === 'notFound')
        )
          throw new Error('Attributed original inventory absence required');
        result = Object.freeze({ ...base, present: false });
      } else {
        const prefix = `https://www.googleapis.com/compute/v1/projects/${authentication.project}`;
        if (
          response.status !== 200 ||
          value.kind !== `compute#${target.kind}` ||
          !uint642(value.id) ||
          value.name !== target.name ||
          value.selfLink !== compiled.selfLink ||
          typeof value.creationTimestamp !== 'string' ||
          !isEvidenceRfc3339(value.creationTimestamp) ||
          (target.kind === 'disk' && value.zone !== `${prefix}/zones/${target.zone}`) ||
          (target.kind === 'subnetwork' && value.region !== `${prefix}/regions/${target.region}`)
        )
          throw new Error('Original numeric inventory resource identity required');
        const anchor = fingerprint(
          Object.fromEntries(
            [
              'id',
              'kind',
              'name',
              'selfLink',
              'creationTimestamp',
              'labels',
              'zone',
              'region',
              'network',
              'ipCidrRange',
              'sourceRanges',
              'destinationRanges',
              'targetTags',
              'allowed',
              'denied',
              'direction',
              'disabled',
              'sourceImage',
              'sourceImageId',
              'type',
              'sizeGb',
            ]
              .filter((key) => Object.hasOwn(value, key))
              .map((key) => [key, value[key]]),
          ),
        );
        const prior = resourceIdentities.get(compiled.selfLink);
        if (prior && prior !== anchor) throw new Error('Original inventory resource identity changed');
        resourceIdentities.set(compiled.selfLink, anchor);
        const freeze = (entry) => {
          if (entry && typeof entry === 'object') {
            for (const child of Object.values(entry)) freeze(child);
            Object.freeze(entry);
          }
        };
        freeze(value);
        result = Object.freeze({ ...base, present: true, value });
      }
      resourceOrigins.add(result);
      issuedEvidence.add(result);
      return result;
    });
  };
  const readResourceEvidence = async (evidence) => {
    if (!resourceOrigins.has(evidence)) throw new Error('An original reader-issued inventory resource is required');
    const binding = evidenceInputs.get(evidence.path);
    if (!binding || !('target' in binding.scope)) throw new Error('Original inventory resource binding required');
    const scope = binding.scope;
    return run(async () => {
      await authentication.assertOriginal();
      await requireRoot();
      const original = await owned(evidence.path, 4 * 1024 * 1024);
      assertSameOriginalInput(binding.binding, original.binding);
      if (original.binding.sha256 !== evidence.sha256) throw new Error('Original inventory resource bytes changed');
      await authentication.assertOriginal();
      await requireRoot();
      const final = await owned(evidence.path, 4 * 1024 * 1024);
      assertSameOriginalInput(binding.binding, final.binding);
      return Object.freeze({ raw: Buffer.from(original.bytes), scope });
    });
  };
  const readEvidence = async (evidence) => {
    if (!issuedEvidence.has(evidence)) throw new Error('An original reader-issued cloud evidence record is required');
    const admittedInput = evidenceInputs.get(evidence.path);
    if (!admittedInput) throw new Error('Original cloud evidence binding unavailable');
    if ('target' in admittedInput.scope)
      throw new Error('Original inventory resource requires its dedicated evidence reader');
    const scope = admittedInput.scope;
    return run(async () => {
      await authentication.assertOriginal();
      await requireRoot();
      const retained = await owned(evidence.path, 4 * 1024 * 1024);
      assertSameOriginalInput(admittedInput.binding, retained.binding);
      if (retained.binding.sha256 !== evidence.sha256) throw new Error('Original cloud evidence bytes changed');
      await authentication.assertOriginal();
      await requireRoot();
      const final = await owned(evidence.path, 4 * 1024 * 1024);
      assertSameOriginalInput(admittedInput.binding, final.binding);
      if (final.binding.sha256 !== evidence.sha256)
        throw new Error('Original cloud evidence changed after input checks');
      return Object.freeze({
        raw: Buffer.from(retained.bytes),
        scope,
        authentication: Object.freeze({
          accountSha256: authentication.accountSha256,
          audienceSha256: authentication.audienceSha256,
          adcSha256: hash14(authentication.credentialBytes),
        }),
      });
    });
  };
  const readAuditEvidence = async (batch) => {
    const binding = auditQueries.get(batch);
    if (!binding) throw new Error('An original reader-issued audit batch is required');
    return run(async () => {
      await authentication.assertOriginal();
      await requireRoot();
      const query = await owned(batch.queryPath, 65536);
      assertSameOriginalInput(binding, query.binding);
      if (query.binding.sha256 !== batch.querySha256) throw new Error('Original audit query bytes changed');
      const pages = [];
      for (const page of batch.pages) {
        const read = await readEvidence(page);
        if (read.scope.project !== batch.project || read.scope.zone !== batch.zone || read.scope.node !== batch.node)
          throw new Error('Original audit page scope changed');
        pages.push(read);
      }
      for (const page of batch.pages) await readEvidence(page);
      await authentication.assertOriginal();
      await requireRoot();
      const final = await owned(batch.queryPath, 65536);
      assertSameOriginalInput(binding, final.binding);
      return Object.freeze({ query: Buffer.from(query.bytes), pages: Object.freeze(pages) });
    });
  };
  const reader = Object.freeze({
    instance,
    serial,
    resource,
    readResourceEvidence,
    insertOperation,
    insertAudit,
    readEvidence,
    readAuditEvidence,
    close() {
      if (closure) return closure;
      retired = true;
      retirement.abort(new Error('Original cloud reader retired'));
      closure = (async () => {
        while (pendingReads.size) await Promise.allSettled([...pendingReads]);
        await requireRoot();
      })();
      return closure;
    },
  });
  cloudReaderOrigins.set(reader, () =>
    run(async () => {
      await authentication.assertOriginal();
      await requireRoot();
      await authentication.assertOriginal();
      await requireRoot();
    }),
  );
  return reader;
}
async function openInstalledGcpCloudSerialReader(context, signal, fetcher = fetch, finalCapture) {
  if (
    context.schemaVersion !== 2 ||
    context.kind !== 'original-installed-gcp-capture-context' ||
    context.owner.provider !== 'gcp' ||
    context.owner.engine !== 'terraform' ||
    context.environment.GOOGLE_APPLICATION_CREDENTIALS !== context.inputs.adc?.path
  )
    throw new Error('Trusted original installed cloud reader context required');
  const expected = context.authentication;
  const reserve = finalCapture?.reserve;
  if (finalCapture) {
    const snapshot = inspectFinalReaderReserve(finalCapture.reserve);
    const admission = finalCapture.admission;
    if (
      !admission ||
      admission.directory !== context.executionDirectory ||
      admission.args[0] !== 'apply' ||
      admission.originalStartMs !== context.budget.start ||
      admission.originalDeadlineMs !== context.budget.deadline ||
      snapshot.originalStartMs !== context.budget.start ||
      snapshot.originalDeadlineMs !== context.budget.deadline ||
      !admission.identity ||
      ['pid', 'group', 'start', 'boot'].some((key) => admission.identity[key] !== snapshot.identity[key])
    )
      throw new Error('Original installed cloud final reader parent differs');
  }
  const assertClock = async () => {
    if (reserve) await assertFinalReaderReserve(reserve);
    else {
      if (linuxMonotonicMs() >= context.budget.deadline)
        throw new Error('Original installed cloud operation deadline exhausted');
      await context.assertWithinDeadline();
      if (linuxMonotonicMs() >= context.budget.deadline)
        throw new Error('Original installed cloud operation deadline exhausted');
    }
  };
  const assertOriginal = async () => {
    await assertClock();
    await context.assertInputs();
    const providers = await context.readProviderInputs();
    if (Object.keys(providers).length !== 6)
      throw new Error('All six original admitted provider-package inputs required');
    await context.assertInputs();
    await assertClock();
  };
  await assertOriginal();
  const originalAdc = await owned(context.inputs.adc.path, 65536);
  assertSameOriginalInput(context.inputs.adc, originalAdc.binding);
  const bytes = originalAdc.bytes;
  await assertOriginal();
  const reader = await openGcpCloudSerialReader(
    {
      root: join16(context.executionDirectory, `gcp-cloud-capture-${randomUUID9()}`),
      region: context.owner.region,
      authentication: {
        credentialBytes: bytes,
        project: context.owner.account,
        accountSha256: expected.accountSha256,
        audienceSha256: expected.audienceSha256,
        assertOriginal,
      },
    },
    signal,
    fetcher,
  );
  installedReaderContexts.set(reader, context);
  if (finalCapture)
    installedReaderFinals.set(
      reader,
      Object.freeze({ admission: finalCapture.admission, reserve: finalCapture.reserve }),
    );
  try {
    await assertOriginalInstalledGcpCloudReader(reader, context);
    return reader;
  } catch (error) {
    try {
      await reader.close();
    } catch (closureError) {
      throw new AggregateError([error, closureError], 'Original installed reader verification and closure failed');
    }
    throw error;
  }
}

// plugins/terraform/src/installed-initial-inventory.ts
import { createHash as createHash21, randomUUID as randomUUID10 } from 'node:crypto';
// plugins/terraform/src/original-gcp-inventory-scope.ts
import { join as join17, join as join18 } from 'node:path';

// plugins/gcloud/src/ce/request-reason.ts
var reasonPattern = /^xcsh-gcp-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function assertGcpTerraformRequestReason(value, intent, googleVersion) {
  validateIntent(intent);
  const reason = value;
  if (
    !reason ||
    typeof reason !== 'object' ||
    Array.isArray(reason) ||
    Object.keys(reason).sort().join(',') !== 'intentFingerprint,reason,schemaVersion,scope' ||
    reason.schemaVersion !== 1 ||
    reason.scope !== 'gcp-terraform-deployment' ||
    intent.engine !== 'terraform' ||
    intent.operation !== 'deploy' ||
    !['8.7.0', '8.10.0', '8.11.0'].includes(googleVersion) ||
    reason.intentFingerprint !== fingerprint(intent) ||
    typeof reason.reason !== 'string' ||
    !reasonPattern.test(reason.reason)
  )
    throw new Error('Reviewed original GCP Terraform request reason and provider mapping required');
}

// plugins/gcloud/src/ce/compute-plan.ts
function assertComputeOnly(intent) {
  if (
    intent.ingress.profile !== 'none' ||
    intent.routing.profile !== 'static-insertion' ||
    intent.routing.destinationCidrs.length !== 0
  )
    throw new Error('Compute translation cannot configure ingress or destination routes');
}
function translateGcpTerraformCompute(intent, googleProviderVersion, requestReason) {
  validateIntent(intent);
  if (intent.schemaVersion === 2) throw new Error('Observer intent requires the version3 original configuration');
  if (intent.engine !== 'terraform') throw new Error('Terraform translation requires Terraform ownership');
  if (!/^\d+\.\d+\.\d+$/.test(googleProviderVersion)) throw new Error('Exact Google provider version required');
  if (requestReason !== undefined) assertGcpTerraformRequestReason(requestReason, intent, googleProviderVersion);
  if (intent.operation !== 'deploy' || intent.egress.mode !== 'external-ip')
    throw new Error('Compute candidate supports external-IP deployment only');
  assertComputeOnly(intent);
  const networks = {},
    subnets = {},
    instances = {};
  const variable = {};
  for (const site of intent.sites)
    for (const node of site.nodes) {
      for (const nic of node.interfaces) {
        networks[nic.network.replaceAll('-', '_')] = {
          name: nic.network,
          project: intent.project,
          auto_create_subnetworks: false,
          routing_mode: 'REGIONAL',
        };
        const key = nic.subnet.replaceAll('-', '_');
        const subnet = {
          name: nic.subnet,
          project: intent.project,
          region: intent.region,
          ip_cidr_range: nic.cidr,
          network: `\${google_compute_network.${nic.network.replaceAll('-', '_')}.id}`,
        };
        if (subnets[key] && fingerprint(subnets[key]) !== fingerprint(subnet))
          throw new Error('Subnet identity has conflicting intent');
        subnets[key] = subnet;
      }
      const key = node.name.replaceAll('-', '_');
      variable[`${key}_user_data`] = {
        type: 'string',
        sensitive: true,
        description: 'Restricted node-bound one-use bootstrap; never export as an output',
      };
      instances[key] = {
        name: node.name,
        project: intent.project,
        zone: node.zone,
        machine_type: intent.machineType,
        can_ip_forward: true,
        boot_disk: [
          {
            auto_delete: true,
            initialize_params: [{ image: intent.image.selfLink, size: intent.diskGiB, type: 'pd-balanced' }],
          },
        ],
        network_interface: node.interfaces.map((nic) => ({
          network: `\${google_compute_network.${nic.network.replaceAll('-', '_')}.id}`,
          subnetwork: `\${google_compute_subnetwork.${nic.subnet.replaceAll('-', '_')}.id}`,
          ...(nic.index === 0 ? { access_config: [{}] } : {}),
        })),
        labels: {
          'xcsh-deployment': intent.deploymentName,
          'xcsh-engine': 'terraform',
          'xcsh-site': site.name,
          'xcsh-node': node.name,
        },
        metadata: { VmDnsSetting: 'ZonePreferred', 'user-data': `\${var.${key}_user_data}` },
      };
    }
  return {
    schemaVersion: 1,
    engine: 'terraform',
    executable: false,
    configuration: {
      terraform: {
        required_providers: { google: { source: 'hashicorp/google', version: `= ${googleProviderVersion}` } },
      },
      provider: {
        google: [
          {
            project: intent.project,
            region: intent.region,
            ...(requestReason !== undefined ? { request_reason: requestReason.reason } : {}),
          },
        ],
      },
      variable,
      resource: {
        google_compute_network: networks,
        google_compute_subnetwork: subnets,
        google_compute_instance: instances,
      },
    },
  };
}
function translateGcpTerraformSiteCompute(intent, versions, requestReason) {
  for (const version of Object.values(versions))
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Exact Terraform/provider versions required');
  const cloud = translateGcpTerraformCompute(intent, versions.google, requestReason);
  const access = gcpSiteAccessSpec(intent, versions.xcsh);
  const sites = {};
  const tokens = {};
  const instances = cloud.configuration.resource.google_compute_instance;
  for (const site of intent.sites) {
    const siteKey = site.name.replaceAll('-', '_');
    sites[siteKey] = {
      name: site.name,
      namespace: 'system',
      labels: { 'xcsh-deployment': intent.deploymentName, 'xcsh-engine': 'terraform' },
      gcp: { not_managed: {} },
      ...(intent.initialVersions
        ? {
            software_settings: {
              sw: { volterra_software_version: intent.initialVersions.software },
              os: { operating_system_version: intent.initialVersions.os },
            },
          }
        : {}),
      ...(site.nodes.length === 3 ? { enable_ha: {} } : { disable_ha: {} }),
      disable_management_network: {},
      ...(access ?? { block_all_services: {} }),
      no_network_policy: {},
      no_forward_proxy: {},
      f5_proxy: {},
      no_proxy_bypass: {},
      logs_streaming_disabled: {},
      no_s2s_connectivity_sli: {},
      no_s2s_connectivity_slo: {},
      disable_url_categorization: {},
      local_vrf: { default_config: {}, default_sli_config: {} },
    };
    for (const node of site.nodes) {
      const key = node.name.replaceAll('-', '_');
      if (`${node.name}-token`.length > 63) throw new Error('Node name leaves no space for bound token name');
      tokens[key] = {
        name: `${node.name}-token`,
        namespace: 'system',
        type: 1,
        site_name: `\${xcsh_securemesh_site_v2.${siteKey}.name}`,
        labels: { 'xcsh-deployment': intent.deploymentName, 'xcsh-node': node.name, 'xcsh-engine': 'terraform' },
      };
      const userData = `#cloud-config
write_files:
  - path: /etc/vpm/user_data
    permissions: "0600"
    owner: root
    content: |
      token: \${xcsh_token.${key}.content}
`;
      instances[key].metadata = {
        VmDnsSetting: 'ZonePreferred',
        'user-data': `\${sensitive(${JSON.stringify(userData)})}`,
      };
    }
  }
  return {
    schemaVersion: 1,
    engine: 'terraform',
    executable: false,
    configuration: {
      terraform: {
        required_version: `= ${versions.terraform}`,
        required_providers: {
          google: { source: 'hashicorp/google', version: `= ${versions.google}` },
          xcsh: { source: 'f5-sales-demo/xcsh', version: `= ${versions.xcsh}` },
        },
      },
      provider: { ...cloud.configuration.provider, xcsh: [{}] },
      resource: { ...cloud.configuration.resource, xcsh_securemesh_site_v2: sites, xcsh_token: tokens },
    },
  };
}
function translateGcpPublicTerraformSiteCompute(intent, versions, requestReason) {
  const translated = translateGcpTerraformSiteCompute(intent, versions, requestReason);
  const disks = {};
  for (const site of intent.sites)
    for (const node of site.nodes) {
      const key = node.name.replaceAll('-', '_');
      disks[key] = {
        name: node.name,
        project: intent.project,
        zone: node.zone,
        image: intent.image.selfLink,
        size: intent.diskGiB,
        type: 'pd-balanced',
      };
      const instance = translated.configuration.resource.google_compute_instance[key];
      instance.boot_disk = [{ auto_delete: false, source: `\${google_compute_disk.${key}.self_link}` }];
    }
  const firewalls = {};
  for (const site of intent.sites.filter((site) => site.nodes.length === 3)) {
    const tag = `${site.name}-ha-peer`;
    const dependencies = [];
    for (const nic of site.nodes[0].interfaces)
      for (const direction of ['INGRESS', 'EGRESS']) {
        const name = `${site.name}-ha-${nic.role}-${direction.toLowerCase()}`;
        if (name.length > 63 || tag.length > 63) throw new Error('HA site name leaves no space for firewall identity');
        const key = name.replaceAll('-', '_');
        firewalls[key] = {
          name,
          project: intent.project,
          network: `\${google_compute_network.${nic.network.replaceAll('-', '_')}.self_link}`,
          direction,
          ...(direction === 'INGRESS' ? { source_ranges: ['0.0.0.0/0'] } : { destination_ranges: ['0.0.0.0/0'] }),
          target_tags: [tag],
          allow: [{ protocol: 'all' }],
        };
        dependencies.push(`google_compute_firewall.${key}`);
      }
    for (const node of site.nodes) {
      const instance = translated.configuration.resource.google_compute_instance[node.name.replaceAll('-', '_')];
      instance.tags = [...new Set([...(instance.tags ?? []), tag])];
      instance.depends_on = dependencies;
    }
  }
  return {
    ...translated,
    schemaVersion: 2,
    configuration: {
      ...translated.configuration,
      resource: {
        ...translated.configuration.resource,
        google_compute_disk: disks,
        ...(Object.keys(firewalls).length ? { google_compute_firewall: firewalls } : {}),
      },
    },
  };
}
// plugins/gcloud/src/ce/terraform-public-ownership.ts
function publicTerraformPlatformScope(intent) {
  return intent.sites.flatMap((site) => [
    { address: `xcsh_securemesh_site_v2.${site.name.replaceAll('-', '_')}`, siteName: site.name },
    ...site.nodes.map((node) => ({
      address: `xcsh_token.${node.name.replaceAll('-', '_')}`,
      siteName: site.name,
      tokenName: `${node.name}-token`,
    })),
  ]);
}
function publicTerraformCloudScope(intent) {
  validateIntent(intent);
  const prefix = `https://www.googleapis.com/compute/v1/projects/${intent.project}`;
  const resources = intent.sites.flatMap((site) =>
    site.nodes.flatMap((node) => [
      {
        kind: 'instance',
        selfLink: `${prefix}/zones/${node.zone}/instances/${node.name}`,
        siteName: site.name,
        nodeName: node.name,
      },
      {
        kind: 'disk',
        selfLink: `${prefix}/zones/${node.zone}/disks/${node.name}`,
        siteName: site.name,
        nodeName: node.name,
      },
      ...node.interfaces.flatMap((nic) => [
        { kind: 'network', selfLink: `${prefix}/global/networks/${nic.network}` },
        { kind: 'subnetwork', selfLink: `${prefix}/regions/${intent.region}/subnetworks/${nic.subnet}` },
      ]),
    ]),
  );
  for (const site of intent.sites.filter((site) => site.nodes.length === 3))
    for (const nic of site.nodes[0].interfaces)
      for (const direction of ['ingress', 'egress'])
        resources.push({
          kind: 'firewall',
          selfLink: `${prefix}/global/firewalls/${site.name}-ha-${nic.role}-${direction}`,
        });
  if (intent.schemaVersion === 2) {
    const observer = gcpTerraformObserverIdentity(intent);
    resources.push(
      { kind: 'instance', selfLink: `${prefix}/zones/${observer.zone}/instances/${observer.name}` },
      { kind: 'disk', selfLink: `${prefix}/zones/${observer.zone}/disks/${observer.name}` },
      { kind: 'firewall', selfLink: `${prefix}/global/firewalls/${observer.firewallName}` },
    );
  }
  return [...new Map(resources.map((resource) => [resource.selfLink, resource])).values()].map((resource) => ({
    ...resource,
    id: '0',
    project: intent.project,
    deploymentName: intent.deploymentName,
    engine: 'terraform',
  }));
}

// plugins/terraform/src/original-gcp-inventory-scope.ts
var issued4 = new WeakMap();
var pending = new WeakMap();
var refuse = () => new Error('Original owning GCP inventory scope required');
function record(packet) {
  const value = packet && typeof packet === 'object' ? issued4.get(packet) : undefined;
  if (!value) throw refuse();
  return value;
}
function field(row, name) {
  const value = row.fields[name];
  if (value?.status !== 'known' || typeof value.value !== 'string' || !value.value)
    throw new Error('Known original inventory identity required');
  return value.value;
}
function cloudBindings(intent) {
  const observer = intent.schemaVersion === 2 ? gcpTerraformObserverIdentity(intent) : undefined;
  const prefix = `https://www.googleapis.com/compute/v1/projects/${intent.project}/`;
  return Object.freeze(
    publicTerraformCloudScope(intent).map((resource) => {
      if (!resource.selfLink.startsWith(prefix)) throw refuse();
      const components = resource.selfLink.slice(prefix.length).split('/');
      const name = components.at(-1);
      if (!name) throw refuse();
      let target;
      if (
        (resource.kind === 'instance' || resource.kind === 'disk') &&
        components.length === 4 &&
        components[0] === 'zones' &&
        components[2] === `${resource.kind}s`
      )
        target = Object.freeze({ kind: resource.kind, name, zone: components[1] });
      else if (
        resource.kind === 'subnetwork' &&
        components.length === 4 &&
        components[0] === 'regions' &&
        components[2] === 'subnetworks'
      )
        target = Object.freeze({ kind: 'subnetwork', name, region: components[1] });
      else if (
        (resource.kind === 'network' || resource.kind === 'firewall') &&
        components.length === 3 &&
        components[0] === 'global' &&
        components[1] === `${resource.kind}s`
      )
        target = Object.freeze({ kind: resource.kind, name });
      else throw new Error('Original inventory resource mapping unavailable');
      if (
        target.kind !== 'instance' &&
        compileGcpInventoryResourceTarget(intent.project, target).selfLink !== resource.selfLink
      )
        throw refuse();
      const role =
        observer && [observer.name, observer.firewallName].includes(name)
          ? 'observer'
          : resource.nodeName
            ? 'ce'
            : 'networking';
      return Object.freeze({
        address: `google_compute_${resource.kind}.${name.replaceAll('-', '_')}`,
        type: `google_compute_${resource.kind}`,
        selfLink: resource.selfLink,
        target,
        role,
        ...(resource.siteName ? { siteName: resource.siteName } : {}),
        ...(resource.nodeName ? { nodeName: resource.nodeName } : {}),
      });
    }),
  );
}
function prepareOriginalGcpInventoryScope(context, store) {
  const existing = pending.get(context);
  if (existing)
    return existing.then(async (packet) => {
      await store.verify();
      if (
        context.inputs['workspace:gcp-terraform-input-identity.json']?.path !==
          join17(store.directory, 'gcp-terraform-input-identity.json') ||
        ['provider', 'engine', 'account', 'region', 'deploymentId'].some(
          (key) => store.owner[key] !== context.owner[key],
        )
      )
        throw new Error('Original inventory storage scope differs');
      await assertOriginalGcpInventoryScope(packet);
      return packet;
    });
  const preparation = (async () => {
    if (context.owner.provider !== 'gcp' || context.owner.engine !== 'terraform' || !context.readOriginalPlanSource)
      throw refuse();
    await context.assertWithinDeadline();
    await context.assertInputs();
    await store.verify();
    const originalDirectory = store.directory;
    const expectedInput = context.inputs['workspace:gcp-terraform-input-identity.json'];
    const path = join17(originalDirectory, 'gcp-terraform-input-identity.json');
    if (!expectedInput || expectedInput.path !== path) throw refuse();
    const input = await owned(path, 65536);
    assertSameOriginalInput(expectedInput, input.binding);
    const saved = decodeEvidenceObject(input.bytes);
    const intent = structuredClone(saved.intent);
    validateIntent(intent);
    if (
      saved.intentFingerprint !== fingerprint(intent) ||
      saved.platformContext !== intent.platformContext ||
      intent.engine !== 'terraform' ||
      intent.operation !== 'deploy' ||
      intent.project !== context.owner.account ||
      intent.region !== context.owner.region ||
      intent.deploymentName !== context.owner.deploymentId
    )
      throw new Error('Original inventory deployment intent differs');
    const readPlan = context.readOriginalPlanSource;
    const source = await readPlan();
    await assertOriginalTerraformPlanProjection(source);
    if (
      source.directory !== context.executionDirectory ||
      source.scope.cloud !== 'gcp' ||
      source.scope.account !== intent.project ||
      source.scope.region !== intent.region ||
      source.receipt.engine !== 'terraform' ||
      source.receipt.deploymentId !== intent.deploymentName ||
      source.receipt.operation ||
      source.executionAuthorized !== false
    )
      throw refuse();
    if (
      source.receipt.configurationSha256 !== context.inputs['workspace:main.tf.json']?.sha256 ||
      source.receipt.providerLockSha256 !== context.inputs['workspace:.terraform.lock.hcl']?.sha256
    )
      throw refuse();
    const cloud = cloudBindings(intent);
    const platform = Object.freeze(
      publicTerraformPlatformScope(intent).map((entry) => {
        const tokenName = 'tokenName' in entry ? entry.tokenName : undefined;
        const type = tokenName ? 'xcsh_token' : 'xcsh_securemesh_site_v2';
        return Object.freeze({
          address: entry.address,
          type,
          target: Object.freeze({ type_name: type, namespace: 'system', name: tokenName ?? entry.siteName }),
          siteName: entry.siteName,
        });
      }),
    );
    const expected = new Map([...cloud, ...platform].map((entry) => [entry.address, entry]));
    if (expected.size !== cloud.length + platform.length) throw refuse();
    for (const row of source.resources.filter((entry) => entry.mode === 'managed')) {
      const binding = expected.get(row.address);
      if (!binding || binding.type !== row.type || row.actions.length !== 1 || row.actions[0] !== 'create')
        throw new Error('Original inventory plan coverage or creation action differs');
      if (field(row, 'name') !== binding.target.name) throw new Error('Original inventory planned name differs');
      if ('selfLink' in binding) {
        if (
          field(row, 'project') !== intent.project ||
          ('zone' in binding.target && field(row, 'zone') !== binding.target.zone) ||
          ('region' in binding.target && field(row, 'region') !== binding.target.region)
        )
          throw new Error('Original inventory planned cloud scope differs');
      } else if (field(row, 'namespace') !== 'system') throw new Error('Original inventory Platform namespace differs');
      expected.delete(row.address);
    }
    if (expected.size) throw new Error('Original inventory plan resource coverage incomplete');
    const resources = Object.freeze(
      [...cloud, ...platform].map((entry) => Object.freeze({ address: entry.address, type: entry.type })),
    );
    const monitor = await monitorOriginalInputs({ intent: input.binding });
    let retired = false;
    const assertInputs = async () => {
      if (retired) throw refuse();
      try {
        await context.assertInputs();
        await store.verify();
        if (
          store.directory !== originalDirectory ||
          ['provider', 'engine', 'account', 'region', 'deploymentId'].some(
            (key) => store.owner[key] !== context.owner[key],
          )
        )
          throw refuse();
        await monitor.assertOriginal();
        assertSameOriginalInput(input.binding, (await owned(path, 65536)).binding);
        await assertOriginalTerraformPlanProjection(source);
        await monitor.assertOriginal();
      } catch (error) {
        retired = true;
        throw error;
      }
    };
    const assert = async () => {
      await context.assertWithinDeadline();
      await assertInputs();
      if ((await readPlan()) !== source) throw refuse();
      await context.assertWithinDeadline();
    };
    const packet = Object.freeze({ schemaVersion: 1, kind: 'original-gcp-inventory-scope' });
    issued4.set(packet, {
      context,
      view: Object.freeze({
        planSha256: source.receipt.planSha256,
        intentFingerprint: saved.intentFingerprint,
        cloud,
        platform,
        resources,
        executionAuthorized: false,
      }),
      assert,
      assertInputs,
      close: () => {
        retired = true;
        monitor.close();
      },
    });
    await assert();
    return packet;
  })();
  pending.set(context, preparation);
  return preparation;
}
async function assertOriginalGcpInventoryScope(packet) {
  await record(packet).assert();
}
async function inspectOriginalGcpInventoryScope(packet) {
  await assertOriginalGcpInventoryInputs(packet);
  return record(packet).view;
}
function assertOriginalGcpInventoryContext(packet, context) {
  if (record(packet).context !== context) throw refuse();
}
function closeOriginalGcpInventoryScope(packet) {
  record(packet).close();
}
async function assertOriginalGcpInventoryInputs(packet) {
  await record(packet).assertInputs();
}

// plugins/terraform/src/installed-initial-inventory.ts
var applyInventories = new WeakMap();
var applyInventoryCallbacks = new WeakMap();
async function assertOriginalApplyGcpInventoryCallback(packet, callback) {
  const verify = packet && typeof packet === 'object' ? applyInventoryCallbacks.get(packet) : undefined;
  if (!verify) throw new Error('Original apply-bound inventory required');
  await verify(callback);
}
async function readOriginalApplyGcpInventory(packet, final) {
  const read = packet && typeof packet === 'object' ? applyInventories.get(packet) : undefined;
  if (!read) throw new Error('Original apply-bound inventory required');
  return read(final);
}
var preparations2 = new WeakMap();
async function openInstalledInitialInventory(input, options = {}) {
  const { context, scope, store, platform } = input;
  assertOriginalGcpInventoryContext(scope, context);
  const current = preparations2.get(context);
  if (current) {
    if (
      current.scope !== scope ||
      current.directory !== store.directory ||
      current.platform !== platform ||
      current.fetcher !== options.fetcher
    )
      throw new Error('Original initial inventory source differs');
    await store.verify();
    await assertOriginalGcpInventoryScope(scope);
    return current.value;
  }
  const value = openInitialInventory(input, options);
  preparations2.set(context, { scope, directory: store.directory, platform, fetcher: options.fetcher, value });
  return value;
}
async function openInitialInventory(input, options = {}) {
  const { context, scope, store, platform } = input;
  assertOriginalGcpInventoryContext(scope, context);
  const view = await inspectOriginalGcpInventoryScope(scope);
  const directory = store.directory;
  const owner = Object.freeze({ ...context.owner });
  const source = platform.gcpBootstrapSource?.();
  const openObservation = platform.gcpBootstrapObservation?.bind(platform);
  const origin = context.environment.XCSH_API_URL;
  const credential = context.environment.XCSH_API_TOKEN;
  if (!source || !openObservation || !origin || !credential)
    throw new Error('Original installed Platform inventory source required');
  let retired = false,
    claimed = false,
    closingRequested = false;
  let failureRetention;
  let closure;
  let pending;
  let snapshot;
  let receiptBinding;
  let started = 0;
  let applyCallback;
  let applyPacket;
  let bindingAttempt;
  const guard = async () => {
    if (retired) throw new Error('Original initial inventory retired');
    assertOriginalGcpInventoryContext(scope, context);
    await assertOriginalGcpInventoryScope(scope);
    await context.assertInputs();
    await store.verify();
    if (
      store.directory !== directory ||
      ['provider', 'engine', 'account', 'region', 'deploymentId'].some((key) => store.owner[key] !== owner[key])
    )
      throw new Error('Original inventory storage scope changed');
    await context.assertWithinDeadline();
    if (retired) throw new Error('Original initial inventory retired');
  };
  await guard();
  const saved = await store.read('gcp-terraform-input-identity.json');
  const cloud = await openInstalledGcpCloudSerialReader(context, undefined, options.fetcher);
  let observation;
  try {
    observation = await openObservation(owner, saved.platformContext, {
      origin,
      credentialSha256: createHash21('sha256').update(credential).digest('hex'),
      targets: view.platform.map((row) => row.target),
      assertOriginal: guard,
    });
    await guard();
  } catch (error) {
    retired = true;
    try {
      await cloud.close();
    } catch (closureError) {
      throw new AggregateError([error, closureError], 'Original inventory opening and closure failed');
    }
    throw error;
  }
  const cloudEvidence = [];
  const platformEvidence = [];
  const rows = [];
  const id = randomUUID10();
  const retain = async (state, error) => {
    if (store.directory !== directory) throw new Error('Original inventory storage scope changed');
    const name = `gcp-initial-inventory-${id}-${state}.private.json`;
    await store.write(name, {
      schemaVersion: 1,
      kind: 'original-initial-gcp-inventory-capture',
      state,
      owner,
      planSha256: view.planSha256,
      intentFingerprint: view.intentFingerprint,
      resources: rows,
      expectedResources: view.resources,
      startedMonotonicMs: started,
      creationOwnershipQualified: false,
      executionAuthorized: false,
      ...(error === undefined ? {} : { errorType: error instanceof Error ? error.name : typeof error }),
    });
    return join18(directory, name);
  };
  const retainFailure = (error) => {
    if (!failureRetention) failureRetention = retain('failed', error);
    return failureRetention;
  };
  const fresh = () => {
    const elapsed = linuxMonotonicMs() - started;
    if (elapsed < 0 || elapsed >= 300000) throw new Error('Original initial inventory freshness exhausted');
  };
  const assertSnapshot = async (value) => {
    if (!snapshot || value !== snapshot) throw new Error('Original initial inventory reference required');
    try {
      await guard();
      fresh();
      if (!receiptBinding) throw new Error('Original initial inventory receipt required');
      assertSameOriginalInput(receiptBinding, (await owned(receiptBinding.path)).binding);
      for (const entry of cloudEvidence) {
        if (entry.resource) await cloud.readResourceEvidence(entry.value);
        else await cloud.readEvidence(entry.value);
      }
      for (const presence of platformEvidence) {
        await observation.assertPresence(presence);
        await source.assertBody(presence.body);
      }
      await guard();
      fresh();
      assertSameOriginalInput(receiptBinding, (await owned(receiptBinding.path)).binding);
      if (retired) throw new Error('Original initial inventory retired');
    } catch (error) {
      retired = true;
      if (!closingRequested) {
        try {
          await retainFailure(error);
        } catch (persistenceError) {
          throw new AggregateError(
            [error, persistenceError],
            'Original inventory verification and failure persistence failed',
          );
        }
      }
      throw error;
    }
  };
  return Object.freeze({
    capture() {
      if (claimed) return Promise.reject(new Error('Original initial inventory already claimed'));
      claimed = true;
      started = linuxMonotonicMs();
      pending = (async () => {
        try {
          await guard();
          await retain('capturing');
          for (const binding of view.cloud) {
            await guard();
            fresh();
            const target = binding.target;
            const value =
              target.kind === 'instance'
                ? await cloud.instance(target.zone, target.name)
                : await cloud.resource(target);
            cloudEvidence.push({ value, resource: target.kind !== 'instance' });
            rows.push({
              address: binding.address,
              type: binding.type,
              present: value.present,
              bodyPath: value.path,
              bodySha256: value.sha256,
            });
            await retain('capturing');
            if (value.present) throw new Error('Initial GCP resource already exists');
          }
          for (const binding of view.platform) {
            await guard();
            fresh();
            const value = await observation.readPresence(binding.target);
            await source.assertBody(value.body);
            platformEvidence.push(value);
            rows.push({
              address: binding.address,
              type: binding.type,
              present: value.present,
              bodyPath: value.body.evidence.bodyPath,
              bodySha256: value.body.evidence.bodySha256,
            });
            await retain('capturing');
            if (value.present) throw new Error('Initial Platform resource already exists');
          }
          await guard();
          fresh();
          if (rows.length !== view.resources.length) throw new Error('Original initial inventory coverage incomplete');
          const path = await retain('complete');
          receiptBinding = (await owned(path)).binding;
          snapshot = Object.freeze({ schemaVersion: 1, kind: 'original-initial-gcp-inventory' });
          await assertSnapshot(snapshot);
          return snapshot;
        } catch (error) {
          retired = true;
          try {
            await retainFailure(error);
          } catch (persistenceError) {
            throw new AggregateError([error, persistenceError], 'Original inventory failure and persistence failed');
          }
          throw error;
        }
      })();
      return pending;
    },
    async bindForApply(value, callback) {
      if (applyPacket) {
        await assertOriginalApplyLifetime(callback);
        if (callback !== applyCallback || value !== snapshot)
          throw new Error('Original inventory already bound to another apply');
        await readOriginalApplyGcpInventory(applyPacket);
        return applyPacket;
      }
      await assertOriginalApplyCallback(callback);
      if (
        callback.phase !== 'before' ||
        callback.original !== context ||
        callback.execution.directory !== context.executionDirectory ||
        value !== snapshot
      )
        throw new Error('Original inventory before-apply context differs');
      if (bindingAttempt) {
        if (callback !== applyCallback) throw new Error('Original inventory bind already claimed');
        return bindingAttempt;
      }
      applyCallback = callback;
      bindingAttempt = (async () => {
        try {
          await assertSnapshot(value);
          const prefix = await readOriginalExecutionPrefix(callback.execution.output);
          const identity = callback.execution.identity;
          const expectedArgs = [
            'apply',
            '-json',
            '-parallelism=1',
            '-input=false',
            '-lock=true',
            '-lock-timeout=60s',
            'saved.tfplan',
          ];
          if (
            prefix.directory !== context.executionDirectory ||
            ['pid', 'group', 'start', 'boot'].some((key) => prefix.identity[key] !== identity[key]) ||
            callback.execution.args.length !== expectedArgs.length ||
            callback.execution.args.some((arg, index) => arg !== expectedArgs[index])
          )
            throw new Error('Original inventory owning executor differs');
          const records = [];
          for (const [index, entry] of cloudEvidence.entries()) {
            const read = entry.resource
              ? await cloud.readResourceEvidence(entry.value)
              : await cloud.readEvidence(entry.value);
            const retained = await owned(entry.value.path, 4 * 1024 * 1024);
            if (
              retained.binding.sha256 !== entry.value.sha256 ||
              createHash21('sha256').update(read.raw).digest('hex') !== entry.value.sha256
            )
              throw new Error('Original inventory absence bytes differ');
            records.push({ binding: retained.binding, evidence: entry.value, cloud: view.cloud[index] });
          }
          const platformBindings = [];
          for (const presence of platformEvidence) {
            await observation.assertPresence(presence);
            await source.assertBody(presence.body);
            const retained = await owned(presence.body.evidence.bodyPath, 4 * 1024 * 1024);
            if (retained.binding.sha256 !== presence.body.evidence.bodySha256)
              throw new Error('Original Platform baseline bytes differ');
            platformBindings.push(retained.binding);
          }
          await assertSnapshot(value);
          await assertOriginalApplyCallback(callback);
          const boundMonotonicMs = linuxMonotonicMs();
          const boundName = `gcp-initial-inventory-${id}-apply-bound.private.json`;
          await store.write(boundName, {
            schemaVersion: 2,
            kind: 'original-apply-bound-inventory-record',
            owner,
            planSha256: view.planSha256,
            intentFingerprint: view.intentFingerprint,
            executor: identity,
            callbackNonce: callback.nonce,
            startedMonotonicMs: started,
            boundMonotonicMs,
            resources: rows,
            executionAuthorized: false,
            creationOwnershipQualified: false,
          });
          const boundReceipt = (await owned(join18(directory, boundName))).binding;
          await assertSnapshot(value);
          await assertOriginalApplyCallback(callback);
          const packet = Object.freeze({
            schemaVersion: 1,
            kind: 'original-apply-gcp-inventory',
          });
          applyInventories.set(packet, async (final) => {
            if (retired) throw new Error('Original apply-bound inventory retired');
            try {
              if (final) {
                await assertOriginalApplyCallback(final);
                if (
                  final.phase !== 'after' ||
                  final.original !== context ||
                  final.nonce !== callback.nonce ||
                  ['pid', 'group', 'start', 'boot'].some((key) => final.execution.identity[key] !== identity[key])
                )
                  throw new Error('Original inventory final callback differs');
              } else await assertOriginalApplyLifetime(callback);
              assertOriginalGcpInventoryContext(scope, context);
              await assertOriginalGcpInventoryInputs(scope);
              await context.assertInputs();
              await store.verify();
              if (
                store.directory !== directory ||
                ['provider', 'engine', 'account', 'region', 'deploymentId'].some(
                  (key) => store.owner[key] !== owner[key],
                )
              )
                throw new Error('Original bound inventory owner changed');
              for (const input of [receiptBinding, boundReceipt]) {
                if (!input) throw new Error('Original bound inventory receipt unavailable');
                assertSameOriginalInput(input, (await owned(input.path)).binding);
              }
              const results = [];
              for (const entry of records) {
                const current = await owned(entry.binding.path, 4 * 1024 * 1024);
                assertSameOriginalInput(entry.binding, current.binding);
                const decoded = decodeEvidenceObject(current.bytes);
                const error =
                  decoded.error && typeof decoded.error === 'object' && !Array.isArray(decoded.error)
                    ? decoded.error
                    : {};
                if (error.code !== 404) throw new Error('Original baseline absence differs');
                results.push(
                  Object.freeze({
                    ...entry.cloud,
                    evidence: entry.evidence,
                    raw: Buffer.from(current.bytes),
                    authentication: Object.freeze({
                      accountSha256: context.authentication.accountSha256,
                      audienceSha256: context.authentication.audienceSha256,
                      adcSha256: context.authentication.snapshotSha256,
                    }),
                  }),
                );
              }
              for (const binding of platformBindings)
                assertSameOriginalInput(binding, (await owned(binding.path, 4 * 1024 * 1024)).binding);
              for (const entry of records)
                assertSameOriginalInput(entry.binding, (await owned(entry.binding.path, 4 * 1024 * 1024)).binding);
              await assertOriginalGcpInventoryInputs(scope);
              await context.assertInputs();
              if (final) await assertOriginalApplyCallback(final);
              else await assertOriginalApplyLifetime(callback);
              for (const input of [
                receiptBinding,
                boundReceipt,
                ...platformBindings,
                ...records.map((entry) => entry.binding),
              ]) {
                if (!input) throw new Error('Original bound inventory receipt unavailable');
                assertSameOriginalInput(input, (await owned(input.path, 4 * 1024 * 1024)).binding);
              }
              if (retired) throw new Error('Original apply-bound inventory retired');
              return Object.freeze({
                owner,
                executor: identity,
                planSha256: view.planSha256,
                intentFingerprint: view.intentFingerprint,
                startedMonotonicMs: started,
                boundMonotonicMs,
                resources: view.resources,
                cloud: Object.freeze(results),
                creationOwnershipQualified: false,
                executionAuthorized: false,
              });
            } catch (error) {
              retired = true;
              try {
                await retainFailure(error);
              } catch (retention) {
                throw new AggregateError([error, retention], 'Original bound inventory refusal and retention failed');
              }
              throw error;
            }
          });
          applyInventoryCallbacks.set(packet, async (current) => {
            const assertCallback = () =>
              current.phase === 'before' ? assertOriginalApplyLifetime(current) : assertOriginalApplyCallback(current);
            await assertCallback();
            if (
              !['before', 'after'].includes(current.phase) ||
              current.original !== context ||
              current.nonce !== callback.nonce ||
              current.execution.directory !== context.executionDirectory ||
              ['pid', 'group', 'start', 'boot'].some((key) => current.execution.identity[key] !== identity[key])
            )
              throw new Error('Original baseline apply callback differs');
            await readOriginalApplyGcpInventory(packet, current.phase === 'after' ? current : undefined);
            await assertCallback();
          });
          applyPacket = packet;
          return packet;
        } catch (error) {
          retired = true;
          try {
            await retainFailure(error);
          } catch (retention) {
            throw new AggregateError([error, retention], 'Original inventory bind failure and retention failed');
          }
          throw error;
        }
      })();
      return bindingAttempt;
    },
    assertSnapshot,
    async inspect(value) {
      await assertSnapshot(value);
      return Object.freeze({
        planSha256: view.planSha256,
        resources: view.resources,
        cloudCount: view.cloud.length,
        platformCount: view.platform.length,
        creationOwnershipQualified: false,
        executionAuthorized: false,
      });
    },
    close() {
      if (closure) return closure;
      closingRequested = true;
      retired = true;
      closure = (async () => {
        const results = await Promise.allSettled([cloud.close(), observation.close()]);
        if (pending) await Promise.allSettled([pending]);
        const failures = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
        if (failures.length) throw new AggregateError(failures, 'Original initial inventory reader closure failed');
      })();
      return closure;
    },
  });
}

// plugins/terraform/src/gcp-vm-evidence.ts
var hash15 = (value) => createHash22('sha256').update(value).digest('hex');
var object11 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Original VM evidence object required');
  return value;
};
function canonical4(value) {
  if (Array.isArray(value)) return `[${value.map(canonical4).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical4(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function metadata3(value) {
  const entries = Object.create(null);
  const raw = object11(value);
  if (!Array.isArray(raw.items)) throw new Error('Original VM metadata items required');
  for (const item of raw.items) {
    const pair = object11(item);
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
function machineResourceLink(value) {
  if (
    typeof value !== 'string' ||
    Array.from(value).some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)
  )
    throw new Error('Original reviewed VM machine type link required');
  const pattern = /^projects\/[a-z0-9-]+\/zones\/[a-z0-9-]+\/machineTypes\/[a-z0-9-]+$/;
  if (pattern.test(value)) return value;
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'www.googleapis.com' ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    !url.pathname.startsWith('/compute/v1/') ||
    !pattern.test(url.pathname.slice('/compute/v1/'.length))
  )
    throw new Error('Original reviewed VM machine type link scope differs');
  return url.pathname.slice('/compute/v1/'.length);
}
function corroborateVmBodies(source, requestBody, absent, absentRaw, operation, opRaw, instance, vmRaw) {
  const initial = decodeEvidenceObject(absentRaw),
    op = decodeEvidenceObject(opRaw),
    vm = decodeEvidenceObject(vmRaw);
  const absentError = object11(initial.error);
  if (
    absent.present !== false ||
    absentError.code !== 404 ||
    !Array.isArray(absentError.errors) ||
    !absentError.errors.some((value) => object11(value).reason === 'notFound') ||
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
  const request = decodeEvidenceObject(Buffer.from(requestBody));
  if (
    request.canIpForward !== true ||
    vm.canIpForward !== true ||
    typeof vm.machineType !== 'string' ||
    machineResourceLink(vm.machineType) !== machineResourceLink(request.machineType)
  )
    throw new Error('Original reviewed VM machine type or forwarding capability differs');
  const items = metadata3(vm.metadata);
  if (
    hash15(canonical4(items)) !== source.metadataSha256 ||
    !items['user-data'] ||
    hash15(items['user-data']) !== source.bootstrapSha256 ||
    hash15(canonical4(object11(vm.labels))) !== source.labelsSha256 ||
    !Array.isArray(vm.networkInterfaces) ||
    !Array.isArray(request.networkInterfaces) ||
    vm.networkInterfaces.length !== request.networkInterfaces.length
  )
    throw new Error('Original VM bootstrap metadata, ownership labels or interfaces differ');
  const interfaces = vm.networkInterfaces.map((raw, index) => {
    const actual = object11(raw),
      wanted = object11(request.networkInterfaces[index]);
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
      const expected = object11(rawRequested),
        observed = object11(actualAccess[i]);
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
  return { vm, interfaces };
}
async function joinOriginalGcpVmEvidence(input) {
  const { source, reader, operation, instance, baseline, callback } = input;
  const bodies = readOriginalGcpInsertSourceBodies(source);
  const readAbsence = async () => {
    if (baseline !== undefined) {
      if (!callback || input.absent !== undefined)
        throw new Error('Original sealed baseline and callback required without a raw absence shortcut');
      await assertOriginalApplyGcpInventoryCallback(baseline, callback);
      await assertOriginalInstalledGcpCloudReader(reader, callback.original);
      const view = await readOriginalApplyGcpInventory(baseline, callback.phase === 'after' ? callback : undefined);
      if (
        view.planSha256 !== source.planSha256 ||
        view.owner.account !== source.project ||
        !source.zone.startsWith(`${view.owner.region}-`) ||
        view.executor.pid !== source.parentPid ||
        view.executor.start !== source.parentStart ||
        view.executor.boot !== source.parentBoot ||
        view.executor.group !== source.parentPid
      )
        throw new Error('Original VM source, sealed baseline or owning executor differs');
      const rows = view.cloud.filter(
        (row) =>
          row.address === source.resourceAddress &&
          row.target.kind === 'instance' &&
          row.target.zone === source.zone &&
          row.target.name === source.nodeName,
      );
      if (rows.length !== 1) throw new Error('Original declared VM absence required');
      const row = rows[0];
      if (
        object11(decodeEvidenceObject(Buffer.from(bodies.requestBody)).labels)['xcsh-deployment'] !==
        view.owner.deploymentId
      )
        throw new Error('Original VM deployment ownership differs');
      await assertOriginalApplyGcpInventoryCallback(baseline, callback);
      await assertOriginalInstalledGcpCloudReader(reader, callback.original);
      readOriginalGcpInsertSourceBodies(source);
      return {
        absent: { ...row.evidence, present: false },
        read: {
          raw: row.raw,
          scope: { project: source.project, zone: source.zone, node: source.nodeName },
          authentication: row.authentication,
        },
      };
    }
    if (isInstalledGcpCloudSerialReader(reader))
      throw new Error('Original installed VM correlation requires its sealed apply baseline');
    if (!input.absent || callback !== undefined)
      throw new Error('Original independent absence or sealed apply baseline required');
    const read = await reader.readEvidence(input.absent);
    freshCloudEvidence(input.absent);
    if (read.scope.project !== source.project || read.scope.zone !== source.zone || read.scope.node !== source.nodeName)
      throw new Error('Fresh original scoped cloud evidence required');
    return { absent: input.absent, read };
  };
  const initial = await readAbsence();
  const retained = [initial.read];
  const records = [operation, instance];
  for (const record of records) {
    const read = await reader.readEvidence(record);
    freshCloudEvidence(record);
    if (
      read.scope.project !== source.project ||
      read.scope.zone !== source.zone ||
      read.scope.node !== source.nodeName ||
      ['accountSha256', 'audienceSha256', 'adcSha256'].some(
        (key) => read.authentication[key] !== initial.read.authentication[key],
      )
    )
      throw new Error('Fresh original scoped cloud evidence required');
    retained.push(read);
  }
  const { vm, interfaces } = corroborateVmBodies(
    source,
    bodies.requestBody,
    initial.absent,
    initial.read.raw,
    operation,
    retained[1].raw,
    instance,
    retained[2].raw,
  );
  await readAbsence();
  for (const record of records) {
    await reader.readEvidence(record);
    freshCloudEvidence(record);
  }
  const current = await reader.instance(instance.zone, instance.name);
  if (!current.present || current.value.id !== instance.value.id)
    throw new Error('Original VM changed during final correlation');
  await readAbsence();
  for (const record of records) {
    await reader.readEvidence(record);
    freshCloudEvidence(record);
  }
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
    absenceSha256: initial.absent.sha256,
    absenceStartedAt: initial.absent.startedAt,
    absenceFinishedAt: initial.absent.finishedAt,
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
var earlyVmOrigins = new WeakMap();
var finalVmOrigins = new WeakMap();
async function handoffOriginalEarlyGcpVmEvidence(original, input) {
  const source = original && typeof original === 'object' ? earlyVmOrigins.get(original) : undefined;
  if (!source) throw new Error('Original early VM handoff source required');
  return source.handoff(input);
}
async function readOriginalFinalGcpVmEvidence(value) {
  const source = value && typeof value === 'object' ? finalVmOrigins.get(value) : undefined;
  if (!source) throw new Error('Original final VM evidence required');
  return source.read();
}
async function collectOriginalFinalGcpSerialEvidence(value, start) {
  const source = value && typeof value === 'object' ? finalVmOrigins.get(value) : undefined;
  if (!source) throw new Error('Original final VM evidence required');
  return source.serial(start);
}
async function readOriginalEarlyGcpVmEvidence(value) {
  const source = value && typeof value === 'object' ? earlyVmOrigins.get(value) : undefined;
  if (!source) throw new Error('Original early VM evidence required');
  return source.read();
}
async function collectOriginalEarlyGcpSerialEvidence(value, start) {
  const source = value && typeof value === 'object' ? earlyVmOrigins.get(value) : undefined;
  if (!source) throw new Error('Original early VM evidence required');
  return source.serial(start);
}
function freshCloudEvidence(record) {
  if (
    !Number.isSafeInteger(record.startedAt) ||
    !Number.isSafeInteger(record.finishedAt) ||
    record.finishedAt < record.startedAt ||
    Date.now() < record.finishedAt ||
    Date.now() - record.finishedAt > 300000
  )
    throw new Error('Fresh original scoped cloud evidence required');
}
async function collectOriginalEarlyGcpVmEvidence(input) {
  const { identity, baseline, callback, reader } = input;
  const guard = async () => {
    await assertOriginalApplyGcpInventoryCallback(baseline, callback);
    await assertOriginalInstalledGcpCloudReader(reader, callback.original);
    await readOriginalEarlyGcpInsertIdentity(identity);
    const view = await readOriginalApplyGcpInventory(baseline, callback.phase === 'after' ? callback : undefined);
    if (
      identity.directory !== callback.execution.directory ||
      identity.directory !== callback.original.executionDirectory ||
      identity.planSha256 !== view.planSha256 ||
      identity.project !== view.owner.account ||
      !identity.zone.startsWith(`${view.owner.region}-`) ||
      ['pid', 'group', 'start', 'boot'].some(
        (key) =>
          identity.executor[key] !== view.executor[key] || identity.executor[key] !== callback.execution.identity[key],
      )
    )
      throw new Error('Original early VM baseline, executor or plan differs');
    const matches = view.cloud.filter(
      (row) =>
        row.address === identity.address &&
        row.target.kind === 'instance' &&
        row.target.zone === identity.zone &&
        row.target.name === identity.nodeName,
    );
    if (matches.length !== 1) throw new Error('Original declared VM absence required');
    const bodies = await readOriginalEarlyGcpInsertBodies(identity);
    const request = decodeEvidenceObject(Buffer.from(bodies.requestBody));
    if (object11(request.labels)['xcsh-deployment'] !== view.owner.deploymentId)
      throw new Error('Original VM deployment ownership differs');
    await assertOriginalApplyGcpInventoryCallback(baseline, callback);
    await assertOriginalInstalledGcpCloudReader(reader, callback.original);
    await readOriginalEarlyGcpInsertIdentity(identity);
    return { absent: matches[0], bodies };
  };
  await guard();
  const operation = await reader.insertOperation(identity.zone, identity.operationName, identity.nodeName);
  await reader.readEvidence(operation);
  freshCloudEvidence(operation);
  if (
    operation.operationId !== identity.operationId ||
    operation.operationName !== identity.operationName ||
    (identity.targetId !== null && operation.targetId !== identity.targetId)
  )
    throw new Error('Original early insert operation differs');
  if (operation.targetId === null) {
    await guard();
    return null;
  }
  const instance = await reader.instance(identity.zone, identity.nodeName);
  if (!instance.present) {
    await guard();
    return null;
  }
  const sealedInputs = [];
  for (const record of [operation, instance]) {
    const captured = await owned(record.path, 4 * 1024 * 1024);
    if (captured.binding.sha256 !== record.sha256) throw new Error('Original VM source bytes differ');
    sealedInputs.push(captured.binding);
  }
  let refused = false,
    transferred = false;
  let handoffPromise;
  let handoffCallback;
  let handoffReader;
  const read = async () => {
    if (transferred) throw new Error('Original before VM evidence retired after final handoff');
    if (refused) throw new Error('Original early VM evidence retired');
    try {
      const current = await guard();
      const op = await reader.readEvidence(operation);
      const vm = await reader.readEvidence(instance);
      for (const [record, evidence] of [
        [operation, op],
        [instance, vm],
      ]) {
        freshCloudEvidence(record);
        if (
          evidence.scope.project !== identity.project ||
          evidence.scope.zone !== identity.zone ||
          evidence.scope.node !== identity.nodeName ||
          ['accountSha256', 'audienceSha256', 'adcSha256'].some(
            (key) => evidence.authentication[key] !== current.absent.authentication[key],
          )
        )
          throw new Error('Original independent VM evidence scope or authentication differs');
      }
      const absent = { ...current.absent.evidence, present: false };
      const projection = corroborateVmBodies(
        identity,
        current.bodies.requestBody,
        absent,
        current.absent.raw,
        operation,
        op.raw,
        instance,
        vm.raw,
      );
      const latest = await reader.instance(identity.zone, identity.nodeName);
      if (!latest.present || latest.value.id !== instance.value.id)
        throw new Error('Original VM changed during early correlation');
      await reader.readEvidence(operation);
      await reader.readEvidence(instance);
      await guard();
      return Object.freeze({
        schemaVersion: 1,
        kind: 'original-early-gcp-vm-cloud-candidate',
        project: identity.project,
        zone: identity.zone,
        nodeName: identity.nodeName,
        instanceId: instance.value.id,
        operationId: operation.operationId,
        operationName: operation.operationName,
        resourceAddress: identity.address,
        interfaces: Object.freeze(projection.interfaces),
        absenceSha256: absent.sha256,
        operationSha256: operation.sha256,
        instanceSha256: instance.sha256,
        sourceRequestSha256: identity.requestBodySha256,
        cloudEvidenceCorroborated: true,
        originalInsertQualified: false,
        applyRpcQualified: false,
        executionAuthorized: false,
      });
    } catch (error) {
      refused = true;
      throw error;
    }
  };
  await read();
  const packet = Object.freeze({
    schemaVersion: 1,
    kind: 'original-early-gcp-vm-evidence',
  });
  earlyVmOrigins.set(packet, {
    read,
    async handoff(input) {
      const { callback: final, reader: finalReader } = input;
      await assertOriginalApplyGcpInventoryCallback(baseline, final);
      await assertOriginalInstalledGcpFinalCloudReader(finalReader, final);
      if (
        callback.phase !== 'before' ||
        final.phase !== 'after' ||
        final.original !== callback.original ||
        final.nonce !== callback.nonce
      )
        throw new Error('Original before-to-final VM callback differs');
      if (refused) throw new Error('Original early VM handoff source retired');
      if (handoffPromise) {
        if (handoffCallback !== final || handoffReader !== finalReader)
          throw new Error('Original final VM handoff already claimed');
        const issued = await handoffPromise;
        await readOriginalFinalGcpVmEvidence(issued);
        return issued;
      }
      handoffCallback = final;
      handoffReader = finalReader;
      handoffPromise = (async () => {
        let failed = false;
        const guardFinal = async () => {
          if (failed || refused) throw new Error('Original final VM handoff retired');
          await assertOriginalApplyGcpInventoryCallback(baseline, final);
          await assertOriginalInstalledGcpFinalCloudReader(finalReader, final);
          await readOriginalEarlyGcpInsertIdentity(identity);
          for (const binding of sealedInputs)
            assertSameOriginalInput(binding, (await owned(binding.path, 4 * 1024 * 1024)).binding);
          await assertOriginalApplyGcpInventoryCallback(baseline, final);
          await assertOriginalInstalledGcpFinalCloudReader(finalReader, final);
        };
        try {
          await guardFinal();
          const candidate = await collectOriginalEarlyGcpVmEvidence({
            identity,
            baseline,
            callback: final,
            reader: finalReader,
          });
          if (!candidate) throw new Error('Original VM unavailable during final handoff');
          const readFinal = async () => {
            try {
              await guardFinal();
              const view = await readOriginalEarlyGcpVmEvidence(candidate);
              const current = await finalReader.instance(identity.zone, identity.nodeName);
              if (
                !current.present ||
                [
                  'id',
                  'creationTimestamp',
                  'metadata',
                  'networkInterfaces',
                  'labels',
                  'serviceAccounts',
                  'canIpForward',
                  'machineType',
                ].some((key) => JSON.stringify(current.value[key]) !== JSON.stringify(instance.value[key]))
              )
                throw new Error('Original VM identity or ownership changed during final handoff');
              await guardFinal();
              if (!final.reserve) throw new Error('Original final VM reserve required');
              const timing = inspectFinalReaderReserve(final.reserve);
              return Object.freeze({
                ...view,
                kind: 'original-final-gcp-vm-cloud-candidate',
                finalStartedMs: timing.finalStartedMs,
                finalDeadlineMs: timing.finalDeadlineMs,
              });
            } catch (error) {
              failed = true;
              refused = true;
              throw error;
            }
          };
          await readFinal();
          const result = Object.freeze({
            schemaVersion: 1,
            kind: 'original-final-gcp-vm-evidence',
          });
          finalVmOrigins.set(result, {
            read: readFinal,
            async serial(start) {
              try {
                await readFinal();
                const capture = await collectOriginalEarlyGcpSerialEvidence(candidate, start);
                await readFinal();
                return capture;
              } catch (error) {
                failed = true;
                refused = true;
                throw error;
              }
            },
          });
          transferred = true;
          return result;
        } catch (error) {
          failed = true;
          refused = true;
          throw error;
        }
      })();
      return handoffPromise;
    },
    async serial(start) {
      if (transferred) throw new Error('Original before VM evidence retired after final handoff');
      if (refused) throw new Error('Original early VM evidence retired');
      try {
        await read();
        const captured = await reader.serial(instance, start);
        await read();
        return captured;
      } catch (error) {
        refused = true;
        throw error;
      }
    },
  });
  return packet;
}

// plugins/terraform/src/gcp-insert-audit-evidence.ts
var hash16 = (value) => createHash23('sha256').update(value).digest('hex');
function object12(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Original insert audit object required');
  return value;
}
function canonical5(value) {
  if (Array.isArray(value)) return `[${value.map(canonical5).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical5(value[key])}`)
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
  const attributes = object12(payload.requestMetadata).requestAttributes;
  return attributes === undefined ? {} : object12(attributes);
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
    .map(object12);
  if (entries.length !== 2) throw new Error('One unambiguous original insert audit first/last pair required');
  const [first, last] = entries;
  const vm = await joinOriginalGcpVmEvidence(input);
  const account = retained.pages[0].authentication.accountSha256;
  if (account !== vm.accountSha256) throw new Error('Original source/cloud/audit principal differs');
  for (const [index, entry] of entries.entries()) {
    const payload = object12(entry.protoPayload),
      operation = object12(entry.operation);
    const labels = object12(object12(entry.resource).labels);
    const status = object12(payload.status);
    const auth = object12(payload.authenticationInfo);
    if (
      labels.instance_id !== vm.instanceId ||
      operation.id !== source.operationName ||
      operation.producer !== 'compute.googleapis.com' ||
      (index === 0
        ? operation.first !== true || operation.last === true
        : operation.last !== true || operation.first === true) ||
      typeof auth.principalEmail !== 'string' ||
      hash16(auth.principalEmail) !== account ||
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
  const payload = object12(first.protoPayload);
  const attributes = requestAttributes(payload);
  if (
    typeof attributes.reason !== 'string' ||
    !attributes.reason ||
    hash16(attributes.reason) !== source.requestReasonSha256
  )
    throw new Error('Original audit request reason is unavailable or differs');
  const lastMetadata = object12(last.protoPayload).requestMetadata;
  if (lastMetadata !== undefined) {
    const attributes = requestAttributes(object12(last.protoPayload));
    if (
      attributes.reason !== undefined &&
      (typeof attributes.reason !== 'string' || hash16(attributes.reason) !== source.requestReasonSha256)
    )
      throw new Error('Original final audit request reason differs');
  }
  const response = object12(payload.response),
    request = object12(payload.request);
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
    hash16(canonical5(object12(request.labels))) !== source.labelsSha256
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
    auditFirstSha256: hash16(canonical5(first)),
    auditLastSha256: hash16(canonical5(last)),
    requestReasonSha256: source.requestReasonSha256,
    applyRpcQualified: false,
    originalInsertQualified: false,
  });
}

// plugins/terraform/src/gcp-bootstrap-vm-binding.ts
var hash17 = (value) => createHash24('sha256').update(value).digest('hex');
var object13 = (value) => {
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
    metadata = object13(request.metadata),
    labels = object13(request.labels);
  if (!Array.isArray(metadata.items)) throw new Error('Original VM metadata required');
  const userdata = metadata.items.map(object13).filter((row) => row.key === 'user-data');
  if (
    userdata.length !== 1 ||
    typeof userdata[0].value !== 'string' ||
    hash17(userdata[0].value) !== source.bootstrapSha256
  )
    throw new Error('Original VM user-data identity differs');
  const jwt = await readOriginalGcpPreapplyBootstrapJwt(bootstrap);
  let config;
  try {
    config = object13(Bun.YAML.parse(userdata[0].value));
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
  const file = object13(config.write_files[0]);
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

// plugins/terraform/src/installed-bootstrap-capture.ts
import { createHash as createHash25, randomUUID as randomUUID11 } from 'node:crypto';

var sameActor2 = (a, b) => ['pid', 'group', 'start', 'boot'].every((key) => a[key] === b[key]);
var name5 = (value) => typeof value === 'string' && /^[a-z][a-z0-9-]{0,62}$/.test(value);
async function openInstalledBootstrapCapture(input, options = {}) {
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
        ![node.siteName, node.tokenName, node.nodeName].every(name5),
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
  const inputs = async () => {
    assertPreparedCreationScopeContext(packet, context);
    await assertPreparedCreationScopeInputs(packet);
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
    await store.write(`gcp-bootstrap-stage-${randomUUID11()}.json`, {
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
    credentialSha256: createHash25('sha256').update(context.environment.XCSH_API_TOKEN).digest('hex'),
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
    const siteBody = await joinOriginalXcshCreationBody({
      context,
      packet,
      result: siteTarget,
      platform: source,
      body: site,
      target: siteTarget.target,
    });
    const tokenBody = await joinOriginalXcshCreationBody({
      context,
      packet,
      result: tokenTarget,
      platform: source,
      body: token,
      target: tokenTarget.target,
    });
    const evidence = await collectOriginalGcpPreapplyBootstrap({
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
        !sameActor2(admission.identity, originalCallback.execution.identity)
      )
        throw new Error('Original bootstrap stage executor differs');
      started = true;
      callback = originalCallback;
      actor = Object.freeze({ ...admission, identity: Object.freeze({ ...admission.identity }) });
      try {
        await guard();
        reader = await openInstalledXcshCreationReader(context, actor, packet, options.reader);
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
                const grant = await publishOriginalGcpBootstrapGrant(
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
      if (!sameActor2(finished.identity, actor.identity) || finished.originalDeadlineMs !== context.budget.deadline)
        throw new Error('Original bootstrap final executor or budget differs');
      await assertFinalReaderReserve(reserve);
      finalStarted = true;
      originalGroupClosed = finished.originalGroupClosed;
      const outcomes = await Promise.allSettled([
        pending ?? Promise.reject(new Error('Original bootstrap startup incomplete')),
        reader?.completed ?? Promise.reject(new Error('Original bootstrap reader not opened')),
      ]);
      await inputs();
      await assertFinalReaderReserve(reserve);
      const result = outcomes[1];
      const raw = result.status === 'fulfilled' ? await readOriginalInstalledXcshCreation(result.value) : undefined;
      await retain('final-capture', {
        publishedCount: grants.size,
        expectedCount: nodes.length,
        creationComplete: result.status === 'fulfilled' && result.value.complete,
        creationEvidenceSha256: raw ? createHash25('sha256').update(raw).digest('hex') : undefined,
        originalGroupClosed,
        finalReserve: reserve,
        failures: outcomes.filter((value) => value.status === 'rejected').length,
        providerConsumptionQualified: false,
      });
      await assertFinalReaderReserve(reserve);
      if (
        failure ||
        outcomes.some((value) => value.status === 'rejected') ||
        result.status !== 'fulfilled' ||
        !result.value.complete ||
        grants.size !== nodes.length
      )
        throw new Error('Original bootstrap stage capture incomplete; retain evidence and reconcile without replay');
    },
    async closeAfterExecutorExit() {
      if (closed) return;
      if (!finalStarted || !originalGroupClosed) throw new Error('Original bootstrap stage executor closure required');
      await inputs();
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
  return Object.freeze({
    ...worker,
    waitForGrants() {
      if (!pending) throw new Error('Original bootstrap stage has not started');
      return pending;
    },
    async refreshBootstrap(nodeName) {
      if (!reader || !grants.has(nodeName)) throw new Error('Original published bootstrap node required');
      const node = nodes.find((value) => value.nodeName === nodeName);
      if (!node) throw new Error('Original published bootstrap binding required');
      try {
        const candidate = await collect(node, await reader.availableTargets());
        if (!candidate) throw new Error('Original bootstrap source refresh unavailable');
        return candidate.evidence;
      } catch (error) {
        failure ??= error;
        return recordFailure('source-refresh-failed', error, { nodeName });
      }
    },
  });
}

// plugins/terraform/src/gcp-campaign-access.ts
import {
  createHash as createHash26,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync as generateKeyPairSync2,
  randomBytes as randomBytes2,
} from 'node:crypto';
import { constants as constants8 } from 'node:fs';
import { lstat as lstat14, mkdir as mkdir9, open as open11, realpath as realpath13 } from 'node:fs/promises';
import { dirname as dirname13, isAbsolute as isAbsolute15, join as join19, resolve as resolve15 } from 'node:path';

var fileKeys2 = ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'];
var parentKeys4 = ['dev', 'ino', 'uid', 'mode'];
var hash18 = (bytes) => createHash26('sha256').update(bytes).digest('hex');
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
  if (!isAbsolute15(path) || resolve15(path) !== path || (await realpath13(path)) !== path)
    throw new Error('Canonical original private campaign directory required');
  const parent = await lstat14(path, { bigint: true });
  if (
    !parent.isDirectory() ||
    parent.isSymbolicLink() ||
    parent.uid !== BigInt(process.getuid?.() ?? -1) ||
    (parent.mode & 0o777n) !== 0o700n
  )
    throw new Error('Owned private campaign directory required');
}
async function readOriginal(path) {
  await privateDirectory4(dirname13(path));
  const before = await lstat14(path, { bigint: true });
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
  const handle = await open11(path, constants8.O_RDONLY | constants8.O_NOFOLLOW);
  try {
    const opened = await handle.stat({ bigint: true });
    const bytes = await handle.readFile();
    const after = await lstat14(path, { bigint: true });
    if (fileKeys2.some((key) => before[key] !== opened[key] || before[key] !== after[key]))
      throw new Error('Original campaign input changed during read');
    const parent = await lstat14(dirname13(path), { bigint: true });
    await privateDirectory4(dirname13(path));
    return {
      bytes,
      binding: Object.freeze({
        path,
        sha256: hash18(bytes),
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
  await privateDirectory4(dirname13(path));
  const handle = await open11(path, 'wx', 256);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  const parent = await open11(dirname13(path), constants8.O_RDONLY);
  try {
    await parent.sync();
  } finally {
    await parent.close();
  }
  return (await readOriginal(path)).binding;
}
function generateKey() {
  const pair = generateKeyPairSync2('ed25519');
  const jwk = pair.privateKey.export({ format: 'jwk' });
  if (!jwk.d || !jwk.x) throw new Error('Ed25519 private seed unavailable');
  const seed = Buffer.from(jwk.d, 'base64url'),
    pub = Buffer.from(jwk.x, 'base64url');
  const check = randomBytes2(4);
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
  const root = join19(store.directory, 'gcp-campaign-access');
  try {
    await lstat14(root);
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
      await lstat14(join19(store.directory, name));
      throw new Error('Existing deployment cannot mint new campaign keys');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  try {
    await mkdir9(root, { mode: 448 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    return (await readOriginalGcpCampaignAccess(store, request)).publicAccess;
  }
  const ce = generateKey(),
    observer = generateKey();
  const inputs = {
    ce_key: await persist2(join19(root, 'ce_key'), ce.privateBytes),
    observer_key: await persist2(join19(root, 'observer_key'), observer.privateBytes),
  };
  const publicAccess = { schemaVersion: 1, cePublicKey: ce.publicKey, observerPublicKey: observer.publicKey };
  await persist2(
    join19(root, 'manifest.private.json'),
    Buffer.from(JSON.stringify({ schemaVersion: 1, ...scope, publicAccess, inputs })),
  );
  return (await readOriginalGcpCampaignAccess(store, request)).publicAccess;
}
async function readOriginalGcpCampaignAccess(store, request, intentSha256) {
  const scope = requestScope(store, request);
  await store.verify();
  await privateDirectory4(store.directory);
  const root = join19(store.directory, 'gcp-campaign-access');
  const manifest = await readOriginal(join19(root, 'manifest.private.json'));
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
    const path = join19(root, name),
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
    await privateDirectory4(join19(root, 'intent-binding-claim'));
    claim = await lstat14(join19(root, 'intent-binding-claim'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  let binding;
  try {
    binding = await readOriginal(join19(root, 'intent-binding.private.json'));
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
  const path = join19(store.directory, 'gcp-campaign-access', 'intent-binding.private.json');
  const claimPath = join19(store.directory, 'gcp-campaign-access', 'intent-binding-claim');
  let claimed = false;
  try {
    await mkdir9(claimPath, { mode: 448 });
    claimed = true;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  if (claimed) {
    const claim = await lstat14(claimPath);
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
import { join as join20 } from 'node:path';

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
        ? join20(store.directory, 'terraform-stages', deployment.stage)
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

// plugins/terraform/src/gcp-observer-image.ts
import { createHash as createHash27, randomUUID as randomUUID12 } from 'node:crypto';
import { lstat as lstat15, mkdir as mkdir10, open as open12, realpath as realpath14 } from 'node:fs/promises';
import { isAbsolute as isAbsolute16, join as join21, resolve as resolve16 } from 'node:path';

var hash19 = (raw) => createHash27('sha256').update(raw).digest('hex');
var fileKeys3 = ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'];
var originalReaders = new WeakMap();
async function captureOriginalGcpObserverImage(reader) {
  const source = reader && typeof reader === 'object' ? originalReaders.get(reader) : undefined;
  if (!source) throw new Error('Original factory-issued observer image reader required');
  return source.read();
}
async function readOriginalGcpObserverImageEvidence(reader, evidence) {
  const source = reader && typeof reader === 'object' ? originalReaders.get(reader) : undefined;
  if (!source) throw new Error('Original factory-issued observer image reader required');
  return source.readEvidence(evidence);
}
async function openGcpObserverImageReader(input, signal, fetcher = fetch) {
  const root = input.root;
  const authentication = Object.freeze({
    ...input.authentication,
    credentialBytes: Buffer.from(input.authentication.credentialBytes),
  });
  if (!isAbsolute16(root) || resolve16(root) !== root)
    throw new Error('Canonical private observer image directory required');
  await mkdir10(root, { recursive: true, mode: 448 });
  const originalRoot = await lstat15(root, { bigint: true });
  if (
    !originalRoot.isDirectory() ||
    originalRoot.isSymbolicLink() ||
    originalRoot.uid !== BigInt(process.getuid?.() ?? -1) ||
    (originalRoot.mode & 0o777n) !== 0o700n ||
    (await realpath14(root)) !== root
  )
    throw new Error('Owned private observer image directory required');
  const assertRoot = async () => {
    const current = await lstat15(root, { bigint: true });
    if (
      ['dev', 'ino', 'uid', 'mode'].some((key) => current[key] !== originalRoot[key]) ||
      !current.isDirectory() ||
      current.isSymbolicLink() ||
      (await realpath14(root)) !== root
    )
      throw new Error('original observer image directory changed');
  };
  const assertOriginal = async () => {
    await assertRoot();
    try {
      await authentication.assertOriginal();
    } catch (error) {
      throw new Error('original observer image inputs changed', { cause: error });
    }
    await assertRoot();
  };
  const client = await openGoogleAdcComputeReader({ ...authentication, assertOriginal }, signal, fetcher);
  const issued = new WeakMap();
  const retained = [];
  let retired = false;
  let originalCreationTimestamp;
  const persist = async (path, raw) => {
    await assertRoot();
    const handle = await open12(path, 'wx', 256);
    try {
      await handle.writeFile(raw);
      await handle.sync();
      const file = await handle.stat({ bigint: true });
      return Object.freeze({
        path,
        sha256: hash19(raw),
        expectedIdentity: Object.freeze(Object.fromEntries(fileKeys3.map((key) => [key, String(file[key])]))),
        expectedParentIdentity: Object.freeze({
          dev: String(originalRoot.dev),
          ino: String(originalRoot.ino),
          uid: String(originalRoot.uid),
          mode: String(originalRoot.mode),
        }),
      });
    } finally {
      await handle.close();
    }
  };
  const retain = async (capture) => {
    const path = join21(root, `observer-image-${randomUUID12()}`);
    const body = await persist(`${path}.body.private.bin`, capture.raw);
    const value = Object.freeze({
      schemaVersion: 1,
      kind: 'original-gcp-observer-image-read',
      owningProject: authentication.project,
      imageProject: GCP_OBSERVER_IMAGE_PIN.project,
      imageName: GCP_OBSERVER_IMAGE_PIN.name,
      path: body.path,
      sha256: body.sha256,
      startedAt: capture.startedAt,
      finishedAt: capture.finishedAt,
      status: capture.status,
      complete: capture.complete,
      truncated: capture.truncated,
      accountSha256: authentication.accountSha256,
      audienceSha256: authentication.audienceSha256,
      snapshotSha256: hash19(authentication.credentialBytes),
      observerExecutionAuthorized: false,
    });
    const receipt = await persist(`${path}.receipt.private.json`, Buffer.from(JSON.stringify(value)));
    const directory = await open12(root, 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
    await assertRoot();
    retained.push(value);
    return { body, receipt, value };
  };
  const withinFreshness = (record) => {
    const now = Date.now();
    if (
      !Number.isSafeInteger(record.startedAt) ||
      !Number.isSafeInteger(record.finishedAt) ||
      record.startedAt < 0 ||
      record.finishedAt < record.startedAt ||
      record.finishedAt - record.startedAt > 60000 ||
      now < record.finishedAt ||
      now - record.finishedAt > 300000
    )
      throw new Error('original observer image freshness required');
  };
  const verifyFiles = async (bindings) => {
    await assertOriginal();
    const body = await owned(bindings.body.path, 4 * 1024 * 1024);
    const receipt = await owned(bindings.receipt.path, 65536);
    assertSameOriginalInput(bindings.body, body.binding);
    assertSameOriginalInput(bindings.receipt, receipt.binding);
    await assertOriginal();
    const finalBody = await owned(bindings.body.path, 4 * 1024 * 1024);
    const finalReceipt = await owned(bindings.receipt.path, 65536);
    assertSameOriginalInput(bindings.body, finalBody.binding);
    assertSameOriginalInput(bindings.receipt, finalReceipt.binding);
    await assertRoot();
    return Buffer.from(body.bytes);
  };
  const reader = Object.freeze({
    async read() {
      if (retired) throw new Error('original observer image reader retired');
      try {
        await assertOriginal();
        let capture;
        try {
          capture = await client.observerImage();
        } catch (error) {
          if (error instanceof GoogleComputeReadError) {
            try {
              await retain(error.capture);
            } catch (retention) {
              throw new AggregateError([error, retention], 'original observer image capture and retention failed');
            }
          }
          throw error;
        }
        const saved = await retain(capture);
        if (capture.status !== 200 || !capture.complete || capture.truncated)
          throw new Error('complete original observer image response required');
        withinFreshness(capture);
        const value = decodeEvidenceObject(capture.raw);
        if (
          value.kind !== 'compute#image' ||
          value.id !== GCP_OBSERVER_IMAGE_PIN.id ||
          value.name !== GCP_OBSERVER_IMAGE_PIN.name ||
          value.selfLink !== GCP_OBSERVER_IMAGE_PIN.selfLink ||
          value.architecture !== GCP_OBSERVER_IMAGE_PIN.architecture ||
          value.status !== GCP_OBSERVER_IMAGE_PIN.status ||
          !isEvidenceRfc3339(value.creationTimestamp) ||
          Date.parse(value.creationTimestamp) > capture.finishedAt ||
          (originalCreationTimestamp !== undefined && originalCreationTimestamp !== value.creationTimestamp)
        )
          throw new Error('original observer image numeric identity, namespace or creation differs');
        await verifyFiles(saved);
        withinFreshness(capture);
        originalCreationTimestamp ??= value.creationTimestamp;
        const record = Object.freeze({
          schemaVersion: 1,
          kind: 'original-gcp-observer-image-candidate',
          path: saved.body.path,
          sha256: saved.body.sha256,
          startedAt: capture.startedAt,
          finishedAt: capture.finishedAt,
          owningProject: authentication.project,
          imageProject: GCP_OBSERVER_IMAGE_PIN.project,
          imageId: GCP_OBSERVER_IMAGE_PIN.id,
          imageName: GCP_OBSERVER_IMAGE_PIN.name,
          selfLink: GCP_OBSERVER_IMAGE_PIN.selfLink,
          creationTimestamp: value.creationTimestamp,
          accountSha256: authentication.accountSha256,
          audienceSha256: authentication.audienceSha256,
          snapshotSha256: hash19(authentication.credentialBytes),
          observerExecutionAuthorized: false,
        });
        issued.set(record, saved);
        return record;
      } catch (error) {
        retired = true;
        throw error;
      }
    },
    async readEvidence(record) {
      const bindings = issued.get(record);
      if (!bindings) throw new Error('original reader-issued observer image evidence required');
      if (retired) throw new Error('original observer image reader retired');
      try {
        withinFreshness(record);
        const raw = await verifyFiles(bindings);
        withinFreshness(record);
        if (hash19(raw) !== record.sha256) throw new Error('original observer image input bytes differ');
        return raw;
      } catch (error) {
        retired = true;
        throw error;
      }
    },
    captures: () => Object.freeze([...retained]),
  });
  originalReaders.set(reader, reader);
  return reader;
}

// plugins/terraform/src/gcp-observer-insert-evidence.ts
import { createHash as createHash28 } from 'node:crypto';
import { isIP as isIP2 } from 'node:net';

// plugins/gcloud/src/ce/observer-plan.ts
function translateGcpTerraformObserverSiteCompute(intent, versions, observer, requestReason) {
  assertGcpSiteAccessProfile(intent);
  assertGcpTerraformObserverScope(observer, intent);
  validateIntent(intent);
  if (intent.schemaVersion === 2 && fingerprint(observer) !== fingerprint(intent.observer))
    throw new Error('Original observer scope differs from its versioned intent');
  if (
    !['15.15.7', '15.16.2', '15.17.3'].some(
      (xcsh) => fingerprint(versions) === fingerprint({ terraform: '1.17.2', google: '8.11.0', xcsh }),
    )
  )
    throw new Error('Qualified exact observer Terraform/provider tuple required');
  const ceIntent = structuredClone(intent);
  ceIntent.schemaVersion = 1;
  delete ceIntent.observer;
  if (requestReason) assertGcpTerraformRequestReason(requestReason, intent, versions.google);
  const ceReason = requestReason
    ? Object.freeze({ ...requestReason, intentFingerprint: fingerprint(ceIntent) })
    : undefined;
  const base = translateGcpPublicTerraformSiteCompute(ceIntent, versions, ceReason);
  const site = intent.sites[0];
  const sli = site.nodes[0].interfaces[1];
  if (site.nodes.some((node) => fingerprint(node.interfaces[1]) !== fingerprint(sli)))
    throw new Error('Original HA observer requires one shared SLI network and subnet');
  const name = `${intent.deploymentName}-observer`;
  const firewallName = `${name}-ssh`;
  if (firewallName.length > 63 || site.nodes.some((node) => node.name === name))
    throw new Error('Derived observer identities collide or exceed GCP name limits');
  const key = name.replaceAll('-', '_');
  const firewallKey = firewallName.replaceAll('-', '_');
  const resources = {};
  for (const [type, entries] of Object.entries(base.configuration.resource)) {
    resources[type] = {};
    for (const [id, value] of Object.entries(entries)) {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Original CE resource object required');
      resources[type][id] = Object.fromEntries(Object.entries(value));
    }
  }
  const ce = Object.entries(resources)
    .flatMap(([type, entries]) => Object.keys(entries).map((id) => `${type}.${id}`))
    .sort();
  const addresses = [
    `google_compute_disk.${key}`,
    `google_compute_firewall.${firewallKey}`,
    `google_compute_instance.${key}`,
  ];
  if (ce.length !== 18 || addresses.some((address) => ce.includes(address)))
    throw new Error('Exact original 18-resource CE inventory required before adding observer');
  const labels = { 'xcsh-deployment': intent.deploymentName, 'xcsh-engine': 'terraform', 'xcsh-role': 'observer' };
  const resource = {
    ...resources,
    google_compute_disk: {
      ...resources.google_compute_disk,
      [key]: {
        name,
        project: intent.project,
        zone: site.nodes[0].zone,
        size: 20,
        type: 'pd-balanced',
        labels,
        image: `\${data.google_compute_image.${key}.self_link}`,
        lifecycle: {
          precondition: [
            {
              condition: `\${data.google_compute_image.${key}.image_id == "${GCP_TERRAFORM_OBSERVER_IMAGE.id}" && data.google_compute_image.${key}.status == "READY"}`,
              error_message: 'Original pinned Ubuntu observer image identity required',
            },
          ],
        },
      },
    },
    google_compute_firewall: {
      ...resources.google_compute_firewall,
      [firewallKey]: {
        name: firewallName,
        project: intent.project,
        network: `\${google_compute_network.${sli.network.replaceAll('-', '_')}.self_link}`,
        direction: 'INGRESS',
        source_ranges: [observer.sshSourceCidr],
        target_tags: [name],
        allow: [{ protocol: 'tcp', ports: ['22'] }],
      },
    },
    google_compute_instance: {
      ...resources.google_compute_instance,
      [key]: {
        name,
        project: intent.project,
        zone: site.nodes[0].zone,
        machine_type: 'e2-micro',
        can_ip_forward: false,
        deletion_protection: false,
        boot_disk: [{ auto_delete: false, source: `\${google_compute_disk.${key}.self_link}` }],
        network_interface: [
          {
            network: `\${google_compute_network.${sli.network.replaceAll('-', '_')}.self_link}`,
            subnetwork: `\${google_compute_subnetwork.${sli.subnet.replaceAll('-', '_')}.self_link}`,
            access_config: [{}],
          },
        ],
        metadata: {
          'ssh-keys': `ubuntu:${observer.publicKey}`,
          'block-project-ssh-keys': 'TRUE',
          'enable-oslogin': 'FALSE',
        },
        labels,
        tags: [name],
        depends_on: [`google_compute_firewall.${firewallKey}`],
      },
    },
  };
  return {
    ...base,
    schemaVersion: 3,
    inventory: { ce, observer: addresses, all: [...ce, ...addresses].sort() },
    observerScopeFingerprint: fingerprint({ observer, image: GCP_TERRAFORM_OBSERVER_IMAGE }),
    configuration: {
      ...base.configuration,
      data: {
        google_compute_image: {
          [key]: {
            project: GCP_TERRAFORM_OBSERVER_IMAGE.project,
            name: GCP_TERRAFORM_OBSERVER_IMAGE.name,
          },
        },
      },
      resource,
    },
  };
}

// plugins/terraform/src/gcp-observer-insert-evidence.ts
var hash20 = (value) => createHash28('sha256').update(value).digest('hex');
var object14 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Original observer object required');
  return value;
};
var uint643 = (value) =>
  typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value) && BigInt(value) <= 18446744073709551615n;
var link2 = (value, path) =>
  typeof value === 'string' &&
  [path, `https://www.googleapis.com/compute/v1/${path}`, `https://compute.googleapis.com/compute/v1/${path}`].includes(
    value,
  );
function metadata4(value, allowFingerprint = false) {
  const raw = object14(value),
    entries = Object.create(null);
  if (
    !Array.isArray(raw.items) ||
    Object.keys(raw).some((key) => !['items', 'fingerprint'].includes(key)) ||
    (raw.fingerprint !== undefined &&
      (typeof raw.fingerprint !== 'string' || (!allowFingerprint && raw.fingerprint !== '')))
  )
    throw new Error('Original observer insertion metadata required');
  for (const item of raw.items) {
    const row = object14(item);
    if (
      Object.keys(row).sort().join(',') !== 'key,value' ||
      typeof row.key !== 'string' ||
      typeof row.value !== 'string' ||
      Object.hasOwn(entries, row.key) ||
      Buffer.byteLength(row.value) > 262144
    )
      throw new Error('Original unique observer metadata required');
    entries[row.key] = row.value;
  }
  return entries;
}
var origins2 = new WeakMap();
async function readOriginalGcpObserverInsertIdentity(value, final) {
  const source = value && typeof value === 'object' ? origins2.get(value) : undefined;
  if (!source) throw new Error('Original observer insertion reference required');
  return source.read(final);
}
async function collectOriginalGcpObserverInsertIdentity(input) {
  const { callback, baseline, response, imageReader, image } = input;
  if (callback.phase !== 'before') throw new Error('Original observer before callback required');
  await assertOriginalApplyGcpInventoryCallback(baseline, callback);
  const context = callback.original;
  const profile = resolveInstalledGcpVersionProfile(input.binding);
  if (
    !isOriginalCreationScopeProfile(profile) ||
    profile.googleVersion !== '8.11.0' ||
    context.owner.provider !== 'gcp' ||
    context.owner.engine !== 'terraform'
  )
    throw new Error('Original qualified observer Terraform provider profile required');
  const intentBinding = context.inputs['workspace:gcp-terraform-input-identity.json'];
  const configBinding = context.inputs['workspace:main.tf.json'];
  if (!intentBinding || !configBinding) throw new Error('Original observer intent/configuration inputs required');
  const intentInput = await owned(intentBinding.path, 65536);
  const configInput = await owned(configBinding.path, 64 * 1024 * 1024);
  assertSameOriginalInput(intentBinding, intentInput.binding);
  assertSameOriginalInput(configBinding, configInput.binding);
  const saved = decodeEvidenceObject(intentInput.bytes);
  const intent = structuredClone(saved.intent);
  validateIntent(intent);
  if (
    intent.schemaVersion !== 2 ||
    !intent.observer ||
    intent.engine !== 'terraform' ||
    intent.operation !== 'deploy' ||
    intent.project !== context.owner.account ||
    intent.region !== context.owner.region ||
    intent.deploymentName !== context.owner.deploymentId ||
    saved.intentFingerprint !== fingerprint(intent) ||
    saved.platformContext !== intent.platformContext
  )
    throw new Error('Original versioned observer intent differs');
  const plan = await context.readOriginalPlanSource?.();
  if (
    !plan ||
    plan.receipt.configurationSha256 !== configBinding.sha256 ||
    plan.receipt.providerLockSha256 !== input.binding.providerLockSha256 ||
    plan.terraformVersion !== input.binding.terraformVersion ||
    plan.directory !== context.executionDirectory
  )
    throw new Error('Original observer owning plan and configuration differ');
  await assertOriginalTerraformPlanProjection(plan);
  const configuration = decodeEvidenceObject(configInput.bytes);
  const providers = object14(configuration.provider).google;
  const provider = object14(Array.isArray(providers) && providers.length === 1 ? providers[0] : providers);
  if (
    provider.project !== intent.project ||
    provider.region !== intent.region ||
    typeof provider.request_reason !== 'string' ||
    provider.alias !== undefined ||
    provider.default_labels !== undefined
  )
    throw new Error('Original observer provider scope and request reason required');
  const expected = translateGcpTerraformObserverSiteCompute(
    intent,
    { terraform: profile.terraformVersion, google: profile.googleVersion, xcsh: '15.17.3' },
    intent.observer,
    {
      schemaVersion: 1,
      scope: 'gcp-terraform-deployment',
      intentFingerprint: fingerprint(intent),
      reason: provider.request_reason,
    },
  );
  const observer = gcpTerraformObserverIdentity(intent),
    key = observer.key,
    firewallKey = observer.firewallName.replaceAll('-', '_');
  const resource = object14(configuration.resource),
    wantedResource = object14(expected.configuration.resource);
  for (const [type, id] of [
    ['google_compute_instance', key],
    ['google_compute_disk', key],
    ['google_compute_firewall', firewallKey],
  ])
    if (
      fingerprint(object14(object14(resource[type])[id])) !== fingerprint(object14(object14(wantedResource[type])[id]))
    )
      throw new Error('Original declared observer resource configuration differs');
  if (
    fingerprint(object14(object14(configuration.data).google_compute_image)[key]) !==
    fingerprint(object14(object14(expected.configuration.data).google_compute_image)[key])
  )
    throw new Error('Original observer image declaration differs');
  const originalImage = await readOriginalGcpObserverImageEvidence(imageReader, image);
  if (
    image.owningProject !== intent.project ||
    image.imageId !== GCP_OBSERVER_IMAGE_PIN.id ||
    image.accountSha256 !== context.authentication.accountSha256 ||
    image.audienceSha256 !== context.authentication.audienceSha256 ||
    image.snapshotSha256 !== context.authentication.snapshotSha256 ||
    hash20(originalImage) !== image.sha256
  )
    throw new Error('Original observer image authentication or scope differs');
  const imageBinding = (await owned(image.path, 4 * 1024 * 1024)).binding;
  const address = `google_compute_instance.${key}`,
    diskAddress = `google_compute_disk.${key}`,
    firewallAddress = `google_compute_firewall.${firewallKey}`;
  const originalImageTimestamp = image.creationTimestamp;
  let refused = false;
  const verify = async (final) => {
    if (refused) throw new Error('Original observer insertion reference retired');
    try {
      const current = final ?? callback;
      if (final && (final.phase !== 'after' || final.original !== context || final.nonce !== callback.nonce))
        throw new Error('Original observer final callback differs');
      await assertOriginalApplyGcpInventoryCallback(baseline, current);
      const inventory = await readOriginalApplyGcpInventory(baseline, final);
      if (
        inventory.planSha256 !== plan.receipt.planSha256 ||
        inventory.resources.length !== 21 ||
        [address, diskAddress, firewallAddress].some(
          (id) => inventory.cloud.filter((row) => row.address === id && row.role === 'observer').length !== 1,
        )
      )
        throw new Error('Original complete 21-resource observer baseline required');
      await assertOriginalTerraformPlanProjection(plan);
      const source = await readOriginalGoogleHttpResponseSource(response);
      if (
        source.directory !== plan.directory ||
        source.planSha256 !== plan.receipt.planSha256 ||
        ['pid', 'group', 'start', 'boot'].some((name) => source.executor[name] !== current.execution.identity[name]) ||
        response.googleProviderVersion !== profile.googleVersion ||
        response.rpc !== 'ApplyResourceChange' ||
        response.resourceType !== 'google_compute_instance' ||
        response.method !== 'POST' ||
        response.status !== 200 ||
        response.url !==
          `https://compute.googleapis.com/compute/v1/projects/${intent.project}/zones/${observer.zone}/instances?alt=json` ||
        response.requestReasonSha256 !== hash20(provider.request_reason) ||
        response.planSha256 !== plan.receipt.planSha256 ||
        hash20(response.requestBody) !== response.requestBodySha256 ||
        hash20(response.responseBody) !== response.responseBodySha256
      )
        throw new Error('Original observer insertion producer, plan or HTTP scope differs');
      const request = decodeEvidenceObject(Buffer.from(response.requestBody)),
        op = decodeEvidenceObject(Buffer.from(response.responseBody));
      const expectedMetadata = object14(object14(object14(wantedResource.google_compute_instance)[key]).metadata);
      const labels = object14(request.labels),
        wantedLabels = object14(object14(object14(wantedResource.google_compute_instance)[key]).labels);
      if (
        request.name !== observer.name ||
        request.canIpForward !== false ||
        request.deletionProtection !== false ||
        !link2(request.machineType, `projects/${intent.project}/zones/${observer.zone}/machineTypes/e2-micro`) ||
        Object.entries(wantedLabels).some(([name, value]) => labels[name] !== value) ||
        Object.keys(labels).some(
          (name) =>
            !Object.hasOwn(wantedLabels, name) && !(name === 'goog-terraform-provisioned' && labels[name] === 'true'),
        ) ||
        fingerprint(metadata4(request.metadata)) !== fingerprint(expectedMetadata) ||
        fingerprint(object14(request.tags).items) !== fingerprint([observer.name]) ||
        (request.serviceAccounts !== undefined &&
          (!Array.isArray(request.serviceAccounts) || request.serviceAccounts.length))
      )
        throw new Error('Original observer request machine, metadata, labels, tags or account differs');
      const { disks, networkInterfaces: nics } = request;
      if (!Array.isArray(disks) || disks.length !== 1 || !Array.isArray(nics) || nics.length !== 1)
        throw new Error('Original observer single disk and interface required');
      const disk = object14(disks[0]),
        nic = object14(nics[0]);
      if (
        disk.boot !== true ||
        (disk.autoDelete !== undefined && disk.autoDelete !== false) ||
        disk.initializeParams !== undefined ||
        !link2(disk.source, `projects/${intent.project}/zones/${observer.zone}/disks/${observer.name}`) ||
        !link2(nic.network, `projects/${intent.project}/global/networks/${observer.network}`) ||
        !link2(nic.subnetwork, `projects/${intent.project}/regions/${intent.region}/subnetworks/${observer.subnet}`) ||
        !Array.isArray(nic.accessConfigs) ||
        nic.accessConfigs.length !== 1 ||
        object14(nic.accessConfigs[0]).type !== 'ONE_TO_ONE_NAT' ||
        (object14(nic.accessConfigs[0]).networkTier !== undefined &&
          object14(nic.accessConfigs[0]).networkTier !== 'PREMIUM') ||
        object14(nic.accessConfigs[0]).natIP !== undefined ||
        (nic.networkIP !== undefined && nic.networkIP !== '') ||
        nic.aliasIpRanges !== undefined
      )
        throw new Error('Original observer disk source or network/egress mapping differs');
      const zonePath = `projects/${intent.project}/zones/${observer.zone}`;
      if (
        !uint643(op.id) ||
        typeof op.name !== 'string' ||
        !/^[a-z][a-z0-9-]{0,254}$/.test(op.name) ||
        op.operationType !== 'insert' ||
        !['PENDING', 'RUNNING', 'DONE'].includes(op.status) ||
        op.error !== undefined ||
        !link2(op.zone, zonePath) ||
        !link2(op.selfLink, `${zonePath}/operations/${op.name}`) ||
        !link2(op.targetLink, `${zonePath}/instances/${observer.name}`) ||
        !isEvidenceRfc3339(op.insertTime) ||
        (op.targetId !== undefined && !uint643(op.targetId))
      )
        throw new Error('Original exact observer insertion operation required');
      const currentImage = await captureOriginalGcpObserverImage(imageReader);
      await readOriginalGcpObserverImageEvidence(imageReader, currentImage);
      if (
        currentImage.creationTimestamp !== originalImageTimestamp ||
        currentImage.owningProject !== intent.project ||
        currentImage.snapshotSha256 !== image.snapshotSha256 ||
        currentImage.accountSha256 !== image.accountSha256 ||
        currentImage.audienceSha256 !== image.audienceSha256
      )
        throw new Error('Original observer image changed during insertion correlation');
      for (const binding of [intentBinding, configBinding, imageBinding])
        assertSameOriginalInput(binding, (await owned(binding.path, 64 * 1024 * 1024)).binding);
      await context.assertInputs();
      await assertOriginalTerraformPlanProjection(plan);
      await readOriginalGoogleHttpResponseSource(response);
      await assertOriginalApplyGcpInventoryCallback(baseline, current);
      for (const binding of [intentBinding, configBinding, imageBinding])
        assertSameOriginalInput(binding, (await owned(binding.path, 64 * 1024 * 1024)).binding);
      return Object.freeze({
        schemaVersion: 1,
        kind: 'original-gcp-observer-insert-identity',
        role: 'observer',
        project: intent.project,
        zone: observer.zone,
        name: observer.name,
        address,
        diskAddress,
        firewallAddress,
        operationId: op.id,
        operationName: op.name,
        targetId: op.targetId === undefined ? null : op.targetId,
        status: op.status,
        planSha256: plan.receipt.planSha256,
        imageId: image.imageId,
        imageName: image.imageName,
        requestBodySha256: response.requestBodySha256,
        responseBodySha256: response.responseBodySha256,
        metadataSha256: hash20(JSON.stringify(metadata4(request.metadata))),
        publicKeySha256: hash20(intent.observer?.publicKey ?? ''),
        observerExecutionAuthorized: false,
        originalInsertQualified: false,
      });
    } catch (error) {
      refused = true;
      throw error;
    }
  };
  await verify();
  const result = Object.freeze({
    schemaVersion: 1,
    kind: 'original-gcp-observer-insert-reference',
  });
  origins2.set(result, { read: verify, context, baseline, requestBody: response.requestBody });
  return result;
}
var vmOrigins = new WeakMap();
async function readOriginalGcpObserverVmEvidence(value) {
  const read = value && typeof value === 'object' ? vmOrigins.get(value) : undefined;
  if (!read) throw new Error('Original observer VM evidence required');
  return read.read();
}
async function collectOriginalGcpObserverSerialEvidence(value, start) {
  const read = value && typeof value === 'object' ? vmOrigins.get(value) : undefined;
  if (!read) throw new Error('Original observer VM evidence required');
  return read.serial(start);
}
function fresh(value) {
  if (
    !Number.isSafeInteger(value.startedAt) ||
    !Number.isSafeInteger(value.finishedAt) ||
    value.finishedAt < value.startedAt ||
    value.finishedAt - value.startedAt > 60000 ||
    Date.now() < value.finishedAt ||
    Date.now() - value.finishedAt > 300000
  )
    throw new Error('Fresh original observer cloud observation required');
}
async function collectOriginalGcpObserverVmEvidence(input) {
  const original = origins2.get(input.identity);
  if (!original) throw new Error('Original observer insertion source required');
  const { callback, reader } = input;
  const source = await original.read(callback.phase === 'after' ? callback : undefined);
  if (callback.original !== original.context) throw new Error('Original observer VM callback context differs');
  const guard = async () => {
    await assertOriginalApplyGcpInventoryCallback(original.baseline, callback);
    if (callback.phase === 'after') await assertOriginalInstalledGcpFinalCloudReader(reader, callback);
    else await assertOriginalInstalledGcpCloudReader(reader, callback.original);
    return original.read(callback.phase === 'after' ? callback : undefined);
  };
  await guard();
  const inventory = await readOriginalApplyGcpInventory(
    original.baseline,
    callback.phase === 'after' ? callback : undefined,
  );
  const diskRow = inventory.cloud.find((row) => row.address === source.diskAddress && row.role === 'observer');
  const vmRow = inventory.cloud.find((row) => row.address === source.address && row.role === 'observer');
  if (diskRow?.target.kind !== 'disk' || !vmRow) throw new Error('Original observer VM and disk absences required');
  const target = diskRow.target;
  const operation = await reader.insertOperation(source.zone, source.operationName, source.name);
  const instance = await reader.instance(source.zone, source.name);
  const disk = await reader.resource(target);
  if (!instance.present || !disk.present) throw new Error('Original observer VM and disk unavailable');
  let refused = false;
  const read = async () => {
    if (refused) throw new Error('Original observer VM evidence retired');
    try {
      const identity = await guard();
      const opRaw = await reader.readEvidence(operation),
        vmRaw = await reader.readEvidence(instance),
        diskRaw = await reader.readResourceEvidence(disk);
      for (const row of [operation, instance, disk]) fresh(row);
      for (const row of [opRaw, vmRaw])
        if (
          row.scope.project !== identity.project ||
          row.scope.zone !== identity.zone ||
          row.scope.node !== identity.name ||
          row.authentication.accountSha256 !== callback.original.authentication.accountSha256 ||
          row.authentication.audienceSha256 !== callback.original.authentication.audienceSha256 ||
          row.authentication.adcSha256 !== callback.original.authentication.snapshotSha256
        )
          throw new Error('Original observer cloud scope or authentication differs');
      const vm = decodeEvidenceObject(vmRaw.raw),
        d = decodeEvidenceObject(diskRaw.raw),
        op = decodeEvidenceObject(opRaw.raw),
        request = decodeEvidenceObject(Buffer.from(original.requestBody));
      const zonePath = `projects/${identity.project}/zones/${identity.zone}`,
        diskPath = `${zonePath}/disks/${identity.name}`,
        vmPath = `${zonePath}/instances/${identity.name}`;
      const labels = object14(request.labels);
      if (
        operation.operationId !== identity.operationId ||
        operation.operationName !== identity.operationName ||
        operation.targetId !== vm.id ||
        (identity.targetId !== null && identity.targetId !== vm.id) ||
        op.id !== identity.operationId ||
        op.name !== identity.operationName ||
        op.error !== undefined ||
        !isEvidenceRfc3339(op.insertTime) ||
        !isEvidenceRfc3339(vm.creationTimestamp) ||
        !isEvidenceRfc3339(d.creationTimestamp) ||
        Date.parse(op.insertTime) < vmRow.evidence.startedAt ||
        Date.parse(d.creationTimestamp) < diskRow.evidence.startedAt ||
        Date.parse(d.creationTimestamp) > Date.parse(vm.creationTimestamp) ||
        Date.parse(vm.creationTimestamp) < Date.parse(op.insertTime) ||
        Date.parse(vm.creationTimestamp) > instance.finishedAt ||
        vm.canIpForward !== false ||
        vm.deletionProtection !== false ||
        !link2(vm.machineType, `${zonePath}/machineTypes/e2-micro`) ||
        (vm.serviceAccounts !== undefined && (!Array.isArray(vm.serviceAccounts) || vm.serviceAccounts.length)) ||
        fingerprint(object14(vm.labels)) !== fingerprint(labels) ||
        fingerprint(metadata4(vm.metadata, true)) !== fingerprint(metadata4(request.metadata)) ||
        fingerprint(object14(vm.tags).items) !== fingerprint([identity.name]) ||
        !uint643(d.id) ||
        d.sourceImageId !== GCP_OBSERVER_IMAGE_PIN.id ||
        !link2(d.sourceImage, GCP_OBSERVER_IMAGE_PIN.selfLink.replace('https://www.googleapis.com/compute/v1/', '')) ||
        d.sizeGb !== '20' ||
        !link2(d.type, `${zonePath}/diskTypes/pd-balanced`) ||
        fingerprint(object14(d.labels)) !== fingerprint(labels) ||
        !link2(d.zone, zonePath) ||
        !link2(d.selfLink, diskPath) ||
        d.sourceSnapshotId !== undefined ||
        !Array.isArray(d.users) ||
        d.users.length !== 1 ||
        !link2(d.users[0], vmPath)
      )
        throw new Error('Original observer VM/disk/image/creation ownership differs');
      const { networkInterfaces: nics, disks } = vm;
      if (!Array.isArray(nics) || nics.length !== 1 || !Array.isArray(disks) || disks.length !== 1)
        throw new Error('Original observer single disk and NIC required');
      const nic = object14(nics[0]),
        boot = object14(disks[0]),
        wanted = object14(request.networkInterfaces[0]);
      if (
        nic.name !== 'nic0' ||
        !Array.isArray(nic.accessConfigs) ||
        nic.accessConfigs.length !== 1 ||
        !link2(nic.network, String(wanted.network).replace('https://www.googleapis.com/compute/v1/', '')) ||
        !link2(nic.subnetwork, String(wanted.subnetwork).replace('https://www.googleapis.com/compute/v1/', '')) ||
        typeof nic.networkIP !== 'string' ||
        isIP2(nic.networkIP) !== 4 ||
        boot.boot !== true ||
        boot.autoDelete !== false ||
        !link2(boot.source, diskPath)
      )
        throw new Error('Original observer VM disk/NIC mapping differs');
      const external = object14(nic.accessConfigs[0]);
      if (
        external.type !== 'ONE_TO_ONE_NAT' ||
        external.networkTier !== 'PREMIUM' ||
        typeof external.natIP !== 'string' ||
        isIP2(external.natIP) !== 4
      )
        throw new Error('Original observer external access mapping differs');
      const currentVm = await reader.instance(identity.zone, identity.name),
        currentDisk = await reader.resource(target);
      if (
        !currentVm.present ||
        !currentDisk.present ||
        currentVm.value.id !== instance.value.id ||
        currentDisk.value.id !== disk.value.id ||
        fingerprint(currentVm.value.disks) !== fingerprint(instance.value.disks) ||
        fingerprint(currentDisk.value.users) !== fingerprint(disk.value.users)
      )
        throw new Error('Original observer VM or disk changed during capture');
      await guard();
      await reader.readEvidence(instance);
      await reader.readResourceEvidence(disk);
      return Object.freeze({
        kind: 'original-gcp-observer-vm-evidence',
        project: identity.project,
        zone: identity.zone,
        name: identity.name,
        instanceId: instance.value.id,
        diskId: disk.value.id,
        imageId: GCP_OBSERVER_IMAGE_PIN.id,
        interfaceAddress: nic.networkIP,
        externalAddress: external.natIP,
        operationId: identity.operationId,
        instanceSha256: instance.sha256,
        diskSha256: disk.sha256,
        observerExecutionAuthorized: false,
        originalInsertQualified: false,
      });
    } catch (error) {
      refused = true;
      throw error;
    }
  };
  await read();
  const result = Object.freeze({
    schemaVersion: 1,
    kind: 'original-gcp-observer-vm-reference',
  });
  vmOrigins.set(result, {
    read,
    async serial(start) {
      if (refused) throw new Error('Original observer VM evidence retired');
      try {
        await read();
        const capture = await reader.serial(instance, start);
        await read();
        return capture;
      } catch (error) {
        refused = true;
        throw error;
      }
    },
  });
  return result;
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
  acknowledgeOriginalApplyGroupClosure,
  assertOriginalApplyGcpInventoryCallback,
  assertOriginalGcpInventoryInputs,
  assertOriginalGcpInventoryScope,
  assertOriginalGcpPreapplyBootstrapContext,
  assertOriginalInstalledGcpCloudReader,
  captureOriginalGcpObserverImage,
  checkoutOriginalGcpPreapplyBootstrap,
  closeOriginalGcpInventoryScope,
  collectOriginalEarlyGcpInsertIdentity,
  collectOriginalEarlyGcpSerialEvidence,
  collectOriginalEarlyGcpVmEvidence,
  collectOriginalFinalGcpSerialEvidence,
  collectOriginalGcpInsertWitnesses,
  collectOriginalGcpObserverInsertIdentity,
  collectOriginalGcpObserverSerialEvidence,
  collectOriginalGcpObserverVmEvidence,
  collectOriginalGcpPreapplyBootstrap,
  collectOriginalGcpTerraformBootstrap,
  collectOriginalGcpTerraformBootstrapV2,
  factory as default,
  GoogleHttpRpcTraceParser,
  handoffOriginalEarlyGcpVmEvidence,
  inspectOriginalGcpInventoryScope,
  joinOriginalGcpBootstrapVm,
  joinOriginalGcpInsertAuditEvidence,
  joinOriginalGcpVmEvidence,
  joinOriginalXcshCreationBody,
  openGcpCloudSerialReader,
  openGcpObserverImageReader,
  openInstalledBootstrapCapture,
  openInstalledInitialInventory,
  openInstalledProviderReader,
  openInstalledXcshCreationReader,
  prepareOriginalGcpInventoryScope,
  publishOriginalGcpBootstrapGrant,
  readOriginalApplyGcpInventory,
  readOriginalEarlyGcpInsertBodies,
  readOriginalEarlyGcpInsertIdentity,
  readOriginalEarlyGcpVmEvidence,
  readOriginalExecutionPrefix,
  readOriginalFinalGcpVmEvidence,
  readOriginalGcpInsertWitnesses,
  readOriginalGcpObserverImageEvidence,
  readOriginalGcpObserverInsertIdentity,
  readOriginalGcpObserverVmEvidence,
  readOriginalGcpPreapplyBootstrapJwt,
  readOriginalGcpTerraformBootstrapJwt,
  readOriginalGoogleHttpResponseSource,
  readOriginalGoogleHttpRpcSource,
  readOriginalInstalledProviderWindow,
  readOriginalInstalledProviderWindowClock,
  readOriginalInstalledXcshCreation,
  readOriginalTerraformApplyHookSource,
  readOriginalXcshCreationBody,
  TerraformApplyHookParser,
};
