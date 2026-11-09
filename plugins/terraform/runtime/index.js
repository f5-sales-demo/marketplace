// @bun
// plugins/terraform/src/installed-runtime.ts
// plugins/gcloud/src/ce/discovery.ts
import { createHash, createHash as createHash6, randomUUID as randomUUID3 } from 'node:crypto';
import { constants as constants3 } from 'node:fs';
import {
  lstat as lstat5,
  mkdir as mkdir3,
  open as open3,
  readdir as readdir3,
  readFile as readFile4,
  realpath as realpath4,
  writeFile as writeFile3,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname as dirname4, isAbsolute as isAbsolute6, join as join5, resolve as resolve6 } from 'node:path';

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
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex')}`;
}

// plugins/platform/src/ce/process-lock.ts
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

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

// plugins/terraform/src/google-adc-authentication.ts
import { createHash as createHash2 } from 'node:crypto';

var tokenEndpoint = 'https://oauth2.googleapis.com/token';
var inspectionEndpoint = 'https://www.googleapis.com/oauth2/v2/tokeninfo';
var hash = (value) => createHash2('sha256').update(value).digest('hex');
var validHash = (value) => /^[a-f0-9]{64}$/.test(value);
var maximum = 65536;

class GoogleAdcAuthenticationHttpError extends Error {
  status;
  constructor(status) {
    super('Google ADC authentication HTTP request failed');
    this.status = status;
  }
}
function decode(raw) {
  const value = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(raw));
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Google ADC authentication response is malformed');
  return value;
}
async function authenticateGoogleAdcSession(input, signal, fetcher = fetch) {
  const credentialBytes = Buffer.from(input.credentialBytes);
  const { project, accountSha256, audienceSha256, assertOriginal } = input;
  if (
    !credentialBytes.length ||
    credentialBytes.length > maximum ||
    !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project) ||
    !validHash(accountSha256) ||
    !validHash(audienceSha256) ||
    typeof assertOriginal !== 'function'
  )
    throw new Error('Qualified Google ADC credential mapping required');
  let credential;
  try {
    credential = decode(credentialBytes);
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
    hash(credential.client_id) !== audienceSha256 ||
    (credential.quota_project_id !== undefined && credential.quota_project_id !== project) ||
    (credential.token_uri !== undefined && credential.token_uri !== tokenEndpoint) ||
    (credential.universe_domain !== undefined && credential.universe_domain !== 'googleapis.com') ||
    (credential.account !== undefined &&
      credential.account !== '' &&
      (typeof credential.account !== 'string' || hash(credential.account) !== accountSha256))
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
          if (size > maximum) throw new Error('Google ADC authentication response exceeds bound');
          chunks.push(chunk);
        }
      } finally {
        await reader.cancel().catch(() => {
          return;
        });
        reader.releaseLock();
      }
      value = decode(Buffer.concat(chunks));
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
    hash(info.email) !== accountSha256 ||
    info.verified_email !== true ||
    typeof info.audience !== 'string' ||
    hash(info.audience) !== audienceSha256 ||
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
    snapshotSha256: hash(credentialBytes),
    accountSha256,
    audienceSha256,
    verifiedAt,
    expiresNoEarlierThan,
    executionAuthorized: false,
  };
  return {
    receipt: Object.freeze({ ...receipt, authenticationReceiptSha256: hash(JSON.stringify(receipt)) }),
    accessToken: refresh.access_token,
  };
}
async function authenticateGoogleAdc(input, signal, fetcher = fetch) {
  return (await authenticateGoogleAdcSession(input, signal, fetcher)).receipt;
}
var _computeMaximum = 4 * 1024 * 1024;

// plugins/terraform/src/installed-capture-context.ts
import { isAbsolute, resolve } from 'node:path';

var fileKeys = ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'];
var parentKeys = ['dev', 'ino', 'uid', 'mode'];
var controls = (value) =>
  Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
function canonical(path) {
  return typeof path === 'string' && isAbsolute(path) && resolve(path) === path && !controls(path);
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
      !canonical(binding.path) ||
      !/^[a-f0-9]{64}$/.test(binding.sha256) ||
      paths.has(binding.path) ||
      !binding.expectedIdentity ||
      !binding.expectedParentIdentity ||
      fileKeys.some(
        (key) =>
          typeof binding.expectedIdentity?.[key] !== 'string' ||
          !/^(?:0|[1-9][0-9]*)$/.test(binding.expectedIdentity[key]),
      ) ||
      parentKeys.some(
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
    !canonical(admission.executionDirectory) ||
    !Number.isSafeInteger(admission.budget?.start) ||
    admission.budget.start < 0 ||
    !Number.isSafeInteger(admission.budget.deadline) ||
    admission.budget.deadline - admission.budget.start !== 7200000 ||
    typeof admission.assertInputs !== 'function' ||
    typeof admission.assertWithinDeadline !== 'function' ||
    typeof admission.readProviderInputs !== 'function'
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
  let originalProviders;
  return Object.freeze({
    schemaVersion: 2,
    kind: 'original-installed-gcp-capture-context',
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

// plugins/terraform/src/linux-clock.ts
import { dlopen, FFIType, ptr } from 'bun:ffi';
// plugins/terraform/src/installed-final-capture.ts
import { isAbsolute as isAbsolute2, join as join2, resolve as resolve2 } from 'node:path';

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
function withinWindow(snapshot) {
  const current = linuxMonotonicMs();
  if (current < snapshot.finalStartedMs || current >= snapshot.finalDeadlineMs)
    throw new Error('Original final reader reserve is exhausted or has not started');
}
function admitFinalReaderReserve(input) {
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
  withinWindow(snapshot);
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
  admissions.set(snapshot, { snapshot, assertOriginal: input.assertOriginal });
  return snapshot;
}
function inspectFinalReaderReserve(reserve) {
  const admission = admissions.get(reserve);
  if (!admission) throw new Error('An admitted original final reader reserve is required');
  return admission.snapshot;
}
async function assertFinalReaderReserve(reserve) {
  const snapshot = inspectFinalReaderReserve(reserve);
  withinWindow(snapshot);
  const admission = admissions.get(reserve);
  if (!admission) throw new Error('An admitted original final reader reserve is required');
  await admission.assertOriginal();
  withinWindow(snapshot);
}

// plugins/terraform/src/installed-final-capture.ts
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
    if (!isAbsolute2(input.groupDirectory) || resolve2(input.groupDirectory) !== input.groupDirectory)
      throw new Error('Original installed capture directory required');
    const groupInputs = freezeAdmittedCaptureInputs(input.groupInputs);
    if (
      Object.keys(groupInputs).sort().join(',') !== 'claim,lifetime' ||
      groupInputs.claim.path !== join2(input.groupDirectory, 'claim.json') ||
      groupInputs.lifetime.path !== join2(input.groupDirectory, 'lifetime.json')
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

// plugins/terraform/src/original-input-monitor.ts
import { createHash as createHash3 } from 'node:crypto';
import { constants, watch } from 'node:fs';
import { lstat as lstat2, open, realpath } from 'node:fs/promises';
import { basename as basename2, dirname as dirname2, isAbsolute as isAbsolute3, resolve as resolve3 } from 'node:path';

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
var hash2 = (raw) => createHash3('sha256').update(raw).digest('hex');
var maximum2 = 256n * 1024n * 1024n;
var identity = (stat) => Object.fromEntries(keys.map((key) => [key, stat[key].toString()]));
async function metadata(path) {
  const stat = await lstat2(path, { bigint: true });
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.uid !== BigInt(process.getuid?.() ?? -1) ||
    stat.nlink !== 1n ||
    (stat.mode & 0o022n) !== 0n ||
    stat.size < 1n ||
    stat.size > maximum2
  )
    throw new Error('Original input monitor requires owned bounded single-link files');
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
  let closed = false;
  const close = () => {
    closed = true;
    for (const watcher of watchers.splice(0)) watcher.close();
  };
  const observe = (watcher) => {
    watchers.push(watcher);
    watcher.on('error', () => {
      refused = true;
    });
  };
  const assertOriginal = async () => {
    if (refused || closed) throw new Error('Original input monitor remains refused or closed');
    try {
      for (const { binding, file, parent } of originals) {
        const current = await metadata(binding.path);
        if (keys.some((key) => current[key].toString() !== file[key]))
          throw new Error('Original input identity changed');
        const currentParent = await lstat2(dirname2(binding.path), { bigint: true });
        if (
          !currentParent.isDirectory() ||
          currentParent.isSymbolicLink() ||
          parentKeys2.some((key) => currentParent[key].toString() !== parent[key]) ||
          (await realpath(binding.path)) !== binding.path
        )
          throw new Error('Original input parent changed');
        const handle = await open(binding.path, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const opened = await handle.stat({ bigint: true });
          if (keys.some((key) => opened[key].toString() !== file[key]))
            throw new Error('Original input changed during open');
          if (hash2(await handle.readFile()) !== binding.sha256) throw new Error('Original input bytes changed');
        } finally {
          await handle.close();
        }
        const after = await metadata(binding.path);
        if (keys.some((key) => after[key].toString() !== file[key]) || refused || closed)
          throw new Error('Original input changed during read');
      }
    } catch {
      refused = true;
      throw new Error('Original input monitor detected a changed identity or bytes');
    }
  };
  try {
    for (const binding of bindings) {
      if (
        !isAbsolute3(binding.path) ||
        resolve3(binding.path) !== binding.path ||
        (await realpath(binding.path)) !== binding.path ||
        !/^[a-f0-9]{64}$/.test(binding.sha256)
      )
        throw new Error('Original input monitor requires canonical reviewed bindings');
      const stat = await metadata(binding.path);
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
      if (parentKeys2.some((key) => !/^(?:0|[1-9][0-9]*)$/.test(parentIdentity[key])))
        throw new Error('Original input monitor requires exact admitted parent identities');
      if (keys.some((key) => typeof file[key] !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(file[key])))
        throw new Error('Original input monitor requires exact admitted identities');
      observe(
        watch(binding.path, { persistent: false }, () => {
          refused = true;
        }),
      );
      observe(
        watch(dirname2(binding.path), { persistent: false }, (_event, name) => {
          if (!name || name.toString() === basename2(binding.path)) refused = true;
        }),
      );
      originals.push({
        binding,
        file,
        parent: parentIdentity,
      });
    }
    await assertOriginal();
    return Object.freeze({ assertOriginal, close });
  } catch (error) {
    close();
    throw error;
  }
}

// plugins/terraform/src/provider-package.ts
import { createHash as createHash4 } from 'node:crypto';
import { lstat as lstat3, readdir as readdir2, readFile as readFile2, realpath as realpath2 } from 'node:fs/promises';
import { isAbsolute as isAbsolute4, join as join3, resolve as resolve4 } from 'node:path';

var digest = (bytes) => createHash4('sha256').update(bytes).digest('hex');
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
  if (!/^[a-f0-9]{64}$/.test(lockSha256) || digest(lock) !== lockSha256)
    throw new Error('Reviewed provider lock changed');
  const entry = lockEntries(lock).get(source);
  if (!entry) throw new Error('Unique matching provider lock entry required');
  if (entry.version !== version) throw new Error('Provider lock version differs');
  const root = await lstat3(directory);
  if (
    !isAbsolute4(directory) ||
    resolve4(directory) !== directory ||
    (await realpath2(directory)) !== directory ||
    !root.isDirectory() ||
    root.isSymbolicLink() ||
    root.uid !== process.getuid?.()
  )
    throw new Error('Canonical original provider package required');
  const files = [];
  async function inventory(relative) {
    const parent = relative ? join3(directory, relative) : directory;
    for (const child of (await readdir2(parent)).sort()) {
      if (!/^[A-Za-z0-9_.-]+$/.test(child) || child === '.' || child === '..')
        throw new Error('Safe provider package file name required');
      const path = relative ? `${relative}/${child}` : child;
      const info = await lstat3(join3(directory, path));
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
    const path = join3(directory, file),
      before = await lstat3(path);
    total += before.size;
    if (before.size > 512 * 1024 * 1024 || total > 1024 * 1024 * 1024)
      throw new Error('Bounded provider package bytes required');
    const bytes = await readFile2(path),
      after = await lstat3(path);
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
    filesSha256[file] = digest(bytes);
  }
  const summary = files
    .map(
      (file) => `${filesSha256[file]}  ${file}
`,
    )
    .join('');
  const packageHash = `h1:${createHash4('sha256').update(summary).digest('base64')}`;
  if (!entry.hashes.includes(packageHash)) throw new Error('Provider contents differ from locked package');
  const firstInventory = JSON.stringify(files);
  files.splice(0);
  await inventory('');
  if (JSON.stringify(files.sort()) !== firstInventory) throw new Error('Original provider package inventory changed');
  return { source, version, platform, packageHash, executableSha256: filesSha256[executable], filesSha256 };
}

// plugins/terraform/src/signal-free-executor.ts
import { createHash as createHash5, randomUUID as randomUUID2 } from 'node:crypto';
import { constants as constants2, watch as watch2 } from 'node:fs';
import {
  lstat as lstat4,
  mkdir as mkdir2,
  open as open2,
  readFile as readFile3,
  realpath as realpath3,
  stat,
  writeFile as writeFile2,
} from 'node:fs/promises';
import { dirname as dirname3, isAbsolute as isAbsolute5, join as join4, resolve as resolve5 } from 'node:path';

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

// plugins/terraform/src/signal-free-executor.ts
var hash3 = (value) => createHash5('sha256').update(value).digest('hex');
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
    !isAbsolute5(binding.path) ||
    resolve5(binding.path) !== binding.path ||
    !/^[a-f0-9]{64}$/.test(binding.sha256)
  )
    throw new Error('Reviewed original executable binding required');
  const canonical = await realpath3(binding.path);
  const original = await stat(canonical, { bigint: true });
  const link = await lstat4(binding.path, { bigint: true });
  if (
    !original.isFile() ||
    original.uid !== BigInt(process.getuid?.() ?? -1) ||
    original.nlink !== 1n ||
    (original.mode & 0o022n) !== 0n ||
    (original.mode & 0o111n) === 0n ||
    hash3(await readFile3(canonical)) !== binding.sha256
  )
    throw new Error('Owned pinned original executable required');
  let changed = false;
  const watcher = watch2(canonical, { persistent: false }, () => {
    changed = true;
  });
  const parent = watch2(dirname3(binding.path), { persistent: false }, (_event, name) => {
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
      const current = await stat(canonical, { bigint: true });
      const currentLink = await lstat4(binding.path, { bigint: true });
      if (
        changed ||
        (await realpath3(binding.path)) !== canonical ||
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
  const beforeRelease = policy.beforeRelease;
  if (
    process.platform !== 'linux' ||
    !Number.isSafeInteger(policy.originalStartMs) ||
    !Number.isSafeInteger(policy.originalDeadlineMs) ||
    policy.originalStartMs < 0 ||
    policy.originalDeadlineMs !== policy.originalStartMs + 7200000 ||
    typeof policy.assertOriginal !== 'function' ||
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
    if (
      [
        'PYTHONPATH',
        'PYTHONHOME',
        'PYTHONSTARTUP',
        'PYTHONINSPECT',
        'PYTHONUSERBASE',
        'LD_PRELOAD',
        'LD_LIBRARY_PATH',
        'DYLD_INSERT_LIBRARIES',
      ].some((key) => env[key] !== undefined)
    )
      throw new Error('Original execution loader substitution refused');
    const began = now();
    if (began < policy.originalStartMs || began >= executionDeadline)
      throw new Error('Original operation deadline exhausted');
    signal?.throwIfAborted();
    await assertOriginal();
    const directory = await lstat4(cwd);
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
    const root = join4(cwd, 'executor-diagnostics', randomUUID2());
    await mkdir2(root, { recursive: true, mode: 448 });
    const script = join4(root, 'gate.py');
    const bootstrap = join4(root, 'bootstrap.json');
    await writeFile2(script, signalFreeBootstrapSource, { flag: 'wx', mode: 256 });
    const stdoutPath = join4(root, 'stdout.private');
    const stderrPath = join4(root, 'stderr.private');
    const stdout = await open2(
      stdoutPath,
      constants2.O_CREAT | constants2.O_EXCL | constants2.O_WRONLY | constants2.O_NOFOLLOW,
      384,
    );
    const stderr = await open2(
      stderrPath,
      constants2.O_CREAT | constants2.O_EXCL | constants2.O_WRONLY | constants2.O_NOFOLLOW,
      384,
    );
    const outIdentity = await stdout.stat({ bigint: true });
    const errIdentity = await stderr.stat({ bigint: true });
    const lock = join4(cwd, '.terraform-executor-lock');
    let release;
    let child;
    let submitted = false;
    let originalIdentity;
    let reason;
    let finalStarted;
    let actualExitCode = null;
    let groupClosed = false;
    let captureClosed = false;
    let captureStartup;
    const fail = (value) => {
      if (!reason) reason = value;
      finalStarted ??= now();
    };
    const check = async () => {
      if (signal?.aborted) fail('cancelled');
      if (now() >= Math.min(began + timeout, executionDeadline)) fail('deadline');
      try {
        await python.require();
        await executable.require();
        await assertOriginal();
      } catch {
        fail('input-changed');
      }
      for (const [path, original] of [
        [stdoutPath, outIdentity],
        [stderrPath, errIdentity],
      ]) {
        let current;
        try {
          current = await lstat4(path, { bigint: true });
        } catch {
          fail('input-changed');
          continue;
        }
        if (
          current.ino !== original.ino ||
          current.dev !== original.dev ||
          current.uid !== original.uid ||
          current.nlink !== 1n
        )
          fail('input-changed');
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
        const evidence = JSON.parse(await readFile3(bootstrap, 'utf8'));
        const raw = await readFile3(`/proc/${child.pid}/stat`, 'utf8');
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
          evidence.boot !== (await readFile3('/proc/sys/kernel/random/boot_id', 'utf8')).trim() ||
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
            const admission = Object.freeze({
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
            captureStartup = Promise.resolve().then(() => beforeRelease(admission));
            let startupTimer;
            try {
              await Promise.race([
                captureStartup,
                new Promise((_resolve, reject) => {
                  startupTimer = setTimeout(
                    () => reject(new Error('Original capture startup deadline exhausted')),
                    Math.max(0, startupDeadline - now()),
                  );
                }),
              ]);
            } catch {
              fail('startup');
            } finally {
              if (startupTimer) clearTimeout(startupTimer);
            }
            await check();
            if (now() >= startupDeadline || actualExitCode !== null) fail('startup');
          }
        }
      } else if (!reason) fail('startup');
      if (!reason) {
        await writeFile2(
          join4(root, 'submission.private.json'),
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
            fail('input-changed');
        }
      } else if (!release && actualExitCode !== null) groupClosed = true;
      const capture = {
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
      };
      const finalErrors = [];
      try {
        await writeFile2(join4(root, 'final.private.json'), JSON.stringify(capture), { mode: 256, flag: 'wx' });
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
            await policy.finalCapture(Object.freeze(capture));
          })(),
          new Promise((_resolve, reject) => {
            captureTimer = setTimeout(
              () => reject(new Error('Original final capture deadline exhausted')),
              Math.max(0, capture.finalDeadlineMs - now()),
            );
          }),
        ]);
        captureClosed = true;
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
        await writeFile2(
          join4(root, 'completion.private.json'),
          JSON.stringify({
            ...capture,
            finishedMs: now(),
            actualExitCode,
            originalGroupClosed: groupClosed,
            captureClosed,
          }),
          { mode: 256, flag: 'wx' },
        );
      } catch (error) {
        finalErrors.push(error);
      }
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
      const stderrBytes = await readFile3(stderrPath);
      const categories = new Set(terraformFailureCategories(stderrBytes.toString('utf8')));
      const category = categories.size === 1 ? [...categories][0] : 'unknown';
      return {
        code: actualExitCode,
        stdout: await readFile3(stdoutPath, 'utf8'),
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
          await writeFile2(
            join4(lock, 'capture-unresolved.json'),
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
      await stdout.close();
      await stderr.close();
      python.close();
      executable.close();
    }
  };
}

// plugins/terraform/src/installed-runtime.ts
var hash4 = (raw) => createHash6('sha256').update(raw).digest('hex');
var installer = join5(import.meta.dir, '../scripts/install_runtime.py');
var modeName = 'google-runtime-mode.json';
var retainedInspectionMonitors = new Map();

class InstalledTerraformSetupRequired extends Error {
  constructor() {
    super('Install and set up the Terraform plugin observer runtime before selecting GCP Terraform');
  }
}
async function owned(path, maximum = 256 * 1024 * 1024) {
  if (!isAbsolute6(path) || resolve6(path) !== path || (await realpath4(path)) !== path)
    throw new Error('Canonical owned runtime input required');
  const before = await lstat5(path, { bigint: true });
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
  const handle = await open3(path, constants3.O_RDONLY | constants3.O_NOFOLLOW);
  try {
    const opened = await handle.stat({ bigint: true });
    const keys = ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'];
    if (keys.some((key) => opened[key] !== before[key])) throw new Error('Original runtime input changed during open');
    const bytes = await handle.readFile();
    const after = await lstat5(path, { bigint: true });
    if (keys.some((key) => after[key] !== before[key])) throw new Error('Original runtime input changed during read');
    const parent = await lstat5(dirname4(path), { bigint: true });
    return {
      bytes,
      binding: {
        path,
        sha256: hash4(bytes),
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
async function privateDirectory(path) {
  if (!isAbsolute6(path) || resolve6(path) !== path) throw new Error('Canonical private runtime directory required');
  await mkdir3(path, { recursive: true, mode: 448 });
  const stat = await lstat5(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 511) !== 448 ||
    (await realpath4(path)) !== path
  )
    throw new Error('Original private runtime directory required');
}
function runtimeRoot(env) {
  return env.XCSH_TERRAFORM_RUNTIME_DIR ?? join5(homedir(), '.local/share/xcsh/terraform/runtime/python315-psutil722');
}
async function assertInstalledRuntime(env = process.env) {
  const root = runtimeRoot(env);
  try {
    if (process.platform !== 'linux' || process.arch !== 'x64') throw new InstalledTerraformSetupRequired();
    const rootInfo = await lstat5(root);
    if (
      !rootInfo.isDirectory() ||
      rootInfo.isSymbolicLink() ||
      rootInfo.uid !== process.getuid?.() ||
      (rootInfo.mode & 511) !== 448 ||
      (await realpath4(root)) !== root
    )
      throw new InstalledTerraformSetupRequired();
    const python = join5(root, 'environment/bin/python3');
    const site = join5(root, 'environment/lib/python3.15/site-packages');
    const bindings = {};
    for (const [role, path, expected] of [
      ['python', python, installed_runtime_pins_default.pythonSha256],
      ['archive', join5(root, 'archive.whl'), installed_runtime_pins_default.wheelSha256],
      ['installer', installer, installed_runtime_pins_default.installerSha256],
    ]) {
      const actual = await owned(path);
      if (actual.binding.sha256 !== expected) throw new InstalledTerraformSetupRequired();
      bindings[role] = actual.binding;
    }
    const config = await owned(join5(root, 'environment/pyvenv.cfg'), 8192);
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
      cfg.home !== dirname4(cfg.executable)
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
        const path = join5(directory, name),
          stat = await lstat5(path);
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
      const actual = await owned(join5(site, name));
      if (actual.binding.sha256 !== expected) throw new InstalledTerraformSetupRequired();
      bindings[`sdk:${name}`] = actual.binding;
    }
    bindings.review = (await owned(join5(root, 'review.json'), 65536)).binding;
    const monitor = await monitorOriginalInputs(bindings);
    let inspectionDirectory;
    let inspectionClosed = false;
    try {
      const inspection = join5(
        env.XDG_STATE_HOME ?? join5(homedir(), '.local/state'),
        'xcsh/terraform/runtime-inspections',
        randomUUID3(),
      );
      await privateDirectory(inspection);
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
          await writeFile3(join5(inspection, 'inspection-capture.private.json'), JSON.stringify(capture), {
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
  return hash4(account);
}
function createInstalledRuntimeResolver(environment = process.env, options = {}) {
  const env = { ...environment },
    captureFactory = options.capture;
  return async (request) => {
    const { owner, deployment, directory, platform, resume } = request;
    if (owner.provider !== 'gcp') return {};
    if (!/^[a-z][a-z0-9-]{0,62}$/.test(deployment.deploymentId))
      throw new Error('Original Terraform deployment identity required');
    const executionDirectory = join5(directory, deployment.deploymentId);
    const store = await platform.storage(owner);
    let mode;
    try {
      mode = JSON.parse((await owned(join5(directory, modeName), 65536)).bytes.toString());
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const existingDeployment = await Bun.file(join5(executionDirectory, 'deployment.json')).exists();
    if (!resume && existingDeployment) throw new Error('Existing deployment must resume its original runtime');
    if (resume && !mode && existingDeployment) return {};
    const runtime = await assertInstalledRuntime(env);
    if (deployment.terraformVersion !== '1.16.6') throw new Error('Qualified installed Terraform version required');
    const terraform = Bun.which('terraform', { PATH: env.PATH ?? process.env.PATH });
    if (!terraform) throw new InstalledTerraformSetupRequired();
    const terraformPath = await realpath4(terraform),
      terraformFile = await owned(terraformPath);
    if (terraformFile.binding.sha256 !== installed_runtime_pins_default.terraformSha256)
      throw new Error('Qualified installed Terraform executable required');
    const accountSha256 = selectedGoogleAccountSha256(env);
    const sourcePath =
      env.GOOGLE_APPLICATION_CREDENTIALS ??
      join5(env.CLOUDSDK_CONFIG ?? join5(homedir(), '.config/gcloud'), 'application_default_credentials.json');
    const source = await owned(sourcePath, 65536);
    const credential = JSON.parse(source.bytes.toString());
    if (credential.type !== 'authorized_user' || typeof credential.client_id !== 'string')
      throw new Error('Qualified authorized-user ADC mapping required');
    const audienceSha256 = hash4(credential.client_id);
    const expectedMode = {
      schemaVersion: 1,
      kind: 'installed-google-adc-runtime',
      owner,
      providerLockSha256: hash4(deployment.providerLock),
      qualificationSha256: installed_runtime_pins_default.refreshQualificationSha256,
    };
    if (mode && fingerprint(mode) !== fingerprint(expectedMode))
      throw new Error('Original installed runtime mode changed');
    await privateDirectory(directory);
    if (!mode) await writeFile3(join5(directory, modeName), JSON.stringify(expectedMode), { flag: 'wx', mode: 256 });
    let monitor;
    let providers;
    let providerInputs;
    let executor;
    let capture;
    let active = 0;
    const groups = [];
    let originalEnvironment;
    const close = async () => {
      if (active) throw new Error('Original installed executor remains in flight');
      for (const group of groups) await assertExecutorGroupClosed(group);
      if (await Bun.file(join5(executionDirectory, '.terraform-executor-lock/capture-unresolved.json')).exists())
        throw new Error('Original installed capture remains unresolved');
      await capture?.closeAfterExecutorExit();
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
        const snapshotPath = join5(directory, `google-adc-${randomUUID3()}.private.json`);
        await writeFile3(snapshotPath, currentSource.bytes, { flag: 'wx', mode: 256 });
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
        const configPath = join5(
          env.XDG_CONFIG_HOME ?? join5(homedir(), '.config'),
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
        const environmentPath = join5(directory, `platform-environment-${randomUUID3()}.private.json`);
        await writeFile3(environmentPath, JSON.stringify(originalEnvironment), { flag: 'wx', mode: 256 });
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
              ? join5(store.directory, name)
              : name === modeName
                ? join5(directory, name)
                : join5(executionDirectory, name);
          bindings[`workspace:${name}`] = (await owned(path)).binding;
        }
        bindings.adc = (await owned(snapshotPath)).binding;
        bindings.platform = (await owned(environmentPath)).binding;
        monitor = await monitorOriginalInputs(bindings);
        const start = linuxMonotonicMs(),
          deadline = start + 7200000;
        const assertInputs = async () => {
          await store.verify();
          await monitor?.assertOriginal();
          await providers?.assertOriginal();
        };
        const assertWithinDeadline = async () => {
          if (linuxMonotonicMs() >= deadline) throw new Error('Original installed operation deadline exhausted');
          await assertInputs();
        };
        const assertOriginal = async () => {
          await assertWithinDeadline();
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
          await writeFile3(
            join5(directory, `google-authentication-${randomUUID3()}.private.json`),
            JSON.stringify(authenticated),
            { flag: 'wx', mode: 256 },
          );
          capture = captureFactory?.(
            request,
            createInstalledCaptureContext({
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
              assertInputs,
              assertWithinDeadline,
              readProviderInputs: async () => {
                if (!providers || !providerInputs)
                  throw new Error('Original capture provider packages are not admitted');
                await providers.assertOriginal();
                return providerInputs;
              },
            }),
          );
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
                '8.7.0',
                'terraform-provider-google_v8.7.0_x5',
                installed_runtime_pins_default.googleProviderSha256,
              ],
              [
                'registry.terraform.io/f5-sales-demo/xcsh',
                '15.13.0',
                'terraform-provider-xcsh_v15.13.0',
                installed_runtime_pins_default.xcProviderSha256,
              ],
            ]) {
              const path = join5(executionDirectory, '.terraform/providers', sourceName, version, 'linux_amd64');
              const verified = await verifyProviderPackage({
                directory: path,
                source: sourceName,
                version,
                executable: executableName,
                platform: 'linux_amd64',
                lock: deployment.providerLock,
                lockSha256: hash4(deployment.providerLock),
              });
              if (verified.executableSha256 !== expectedSha)
                throw new Error('Original qualified provider executable changed');
              for (const [name, expected] of Object.entries(verified.filesSha256)) {
                const file = await owned(join5(path, name));
                if (file.binding.sha256 !== expected) throw new Error('Original provider package changed');
                providerBindings[`${sourceName}:${name}`] = file.binding;
              }
            }
            providers = await monitorOriginalInputs(providerBindings);
            providerInputs = freezeAdmittedCaptureInputs(providerBindings);
          };
          executor = signalFreeTerraformExecutor({
            python: { path: runtime.python, sha256: installed_runtime_pins_default.pythonSha256 },
            executable: { path: terraformPath, sha256: installed_runtime_pins_default.terraformSha256 },
            originalStartMs: start,
            originalDeadlineMs: deadline,
            assertOriginal,
            beforeRelease: async (admission) => {
              const currentGroup = join5(directory, 'google-runtime-groups', randomUUID3());
              await privateDirectory(currentGroup);
              for (const name of ['claim.json', 'lifetime.json'])
                await writeFile3(
                  join5(currentGroup, name),
                  await readFile4(join5(executionDirectory, '.terraform-executor-lock', name)),
                  { flag: 'wx', mode: 256 },
                );
              groups.push(currentGroup);
              const groupInputs = {};
              for (const name of ['claim', 'lifetime'])
                groupInputs[name] = (await owned(join5(currentGroup, `${name}.json`))).binding;
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
                  const resultPath = join5(directory, `google-runtime-final-${randomUUID3()}.private.json`);
                  await writeFile3(resultPath, JSON.stringify(value), { flag: 'wx', mode: 256 });
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
            snapshotSha256: hash4(currentSource.bytes),
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
      if (!executor || !originalEnvironment) throw new Error('Original installed ADC lease has not been acquired');
      if (
        invocation.env.XCSH_API_URL !== originalEnvironment.XCSH_API_URL ||
        invocation.env.XCSH_API_TOKEN !== originalEnvironment.XCSH_API_TOKEN
      )
        throw new Error('Original selected Platform environment changed');
      if (!['version', 'init', 'validate', 'plan', 'show', 'output', 'apply'].includes(invocation.args[0]))
        throw new Error('Installed Terraform invocation is outside the owning runner');
      active++;
      try {
        return await executor(invocation);
      } finally {
        active--;
      }
    };
    return {
      googleAdc,
      execute,
      assertApplyReady: async () => {
        if (!captureFactory) throw new Error('Original GCP guest capture controller is not qualified');
        await store.verify();
      },
    };
  };
}

// plugins/terraform/src/google-adc-session.ts
import { createHash as createHash7 } from 'node:crypto';
import { constants as constants4, watch as watch3 } from 'node:fs';
import { lstat as lstat6, open as open4, realpath as realpath5 } from 'node:fs/promises';
// plugins/terraform/src/service.ts
import { dirname as dirname5, isAbsolute as isAbsolute7, join as join7, resolve as resolve7 } from 'node:path';

var googleCredentialAlternatives = Object.freeze([
  'GOOGLE_OAUTH_ACCESS_TOKEN',
  'GOOGLE_ACCESS_TOKEN',
  'GOOGLE_CREDENTIALS',
  'GOOGLE_IMPERSONATE_SERVICE_ACCOUNT',
  'GOOGLE_IMPERSONATE_SERVICE_ACCOUNT_DELEGATES',
  'GCLOUD_KEYFILE_JSON',
  'GOOGLE_CLOUD_KEYFILE_JSON',
]);
var hash5 = (value) => createHash7('sha256').update(value).digest('hex');
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
  const stat = await lstat6(path, { bigint: true });
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
    !isAbsolute7(expected.directory) ||
    resolve7(expected.directory) !== expected.directory ||
    !isAbsolute7(lease.snapshotPath) ||
    resolve7(lease.snapshotPath) !== lease.snapshotPath ||
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
  const originalDirectory = await lstat6(expected.directory, { bigint: true });
  const directory = async () => {
    const current = await lstat6(expected.directory, { bigint: true });
    if (
      !current.isDirectory() ||
      current.isSymbolicLink() ||
      current.uid !== BigInt(process.getuid?.() ?? -1) ||
      (current.mode & 0o777n) !== 0o700n ||
      current.dev !== originalDirectory.dev ||
      current.ino !== originalDirectory.ino ||
      (await realpath5(expected.directory)) !== expected.directory
    )
      throw new Error('Original private Google ADC workspace changed');
  };
  await directory();
  const original = await fileMetadata(lease.snapshotPath);
  let refused = false;
  let retiring = false;
  let closed = false;
  let closure;
  const watcher = watch3(lease.snapshotPath, { persistent: false }, () => {
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
      const handle = await open4(lease.snapshotPath, constants4.O_RDONLY | constants4.O_NOFOLLOW);
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

// plugins/terraform/src/runner.ts
import { createHash as createHash8, randomUUID as randomUUID4 } from 'node:crypto';
import {
  chmod,
  lstat as lstat7,
  mkdir as mkdir4,
  readFile as readFile5,
  realpath as realpath6,
  rename as rename2,
  rm as rm2,
  writeFile as writeFile4,
} from 'node:fs/promises';
import { isAbsolute as isAbsolute8, join as join6, resolve as resolve8 } from 'node:path';

var cliConfig = `provider_installation {
  direct {}
}
disable_checkpoint = true
`;
var digest2 = (value) => createHash8('sha256').update(value).digest('hex');
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Terraform JSON object is malformed');
  return value;
}
function decode2(value) {
  try {
    return object(
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
function canonical2(value) {
  if (Array.isArray(value)) return `[${value.map(canonical2).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical2(item)}`)
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
  const action = object(invocations[0]);
  if (
    action.address !== expected.address ||
    action.type !== expected.type ||
    action.provider_name !== expected.providerName ||
    action.lifecycle_action_trigger !== undefined ||
    Object.keys(object(action.invoke_action_trigger)).length ||
    !allFalse(action.config_unknown) ||
    !allFalse(action.config_sensitive) ||
    digest2(canonical2(object(action.config_values))) !== expected.configValuesSha256
  )
    throw new Error('Terraform action identity, trigger or configuration differs');
  return [{ ...expected }];
}
async function privateDirectory2(path) {
  await mkdir4(path, { recursive: true, mode: 448 });
  const stat = await lstat7(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    (await realpath6(path)) !== path
  )
    throw new Error('Terraform storage ownership is invalid');
  await chmod(path, 448);
}
async function privateRead(path) {
  const stat = await lstat7(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 63) !== 0
  )
    throw new Error('Terraform artifact ownership is invalid');
  return readFile5(path);
}
async function persist(path, value) {
  const temporary = `${path}.new`;
  await writeFile4(temporary, JSON.stringify(value), { mode: 384, flag: 'wx' });
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
    const invocationId = randomUUID4();
    const transition = async (phase) => {
      if (!retainFailure) return;
      const directory = join6(cwd, 'executor-diagnostics');
      await privateDirectory2(directory);
      const claim = await privateRead(join6(cwd, '.terraform-executor-lock', 'claim.json')).then(
        (bytes) => JSON.parse(bytes.toString('utf8')),
        () => {
          return;
        },
      );
      const executable = Bun.which('terraform', { cwd, PATH: env.PATH });
      await persist(join6(directory, `${invocationId}-${phase}.json`), {
        schemaVersion: 1,
        invocationId,
        phase,
        observedAt: new Date().toISOString(),
        pid: child.pid,
        operation: args[0],
        launcher: '/bin/sh',
        executable,
        executableSha256: executable ? digest2(await readFile5(executable)) : undefined,
        executorIdentity: claim?.pid === child.pid ? claim : undefined,
      });
    };
    const releaseExecutor = await startTerraformGate(
      child,
      () => acquireProcessLock(join6(cwd, '.terraform-executor-lock'), child.pid),
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
        await privateDirectory2(cwd);
        const directory = join6(cwd, 'failure-diagnostics');
        await privateDirectory2(directory);
        await persist(join6(directory, `${randomUUID4()}.json`), {
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
        !/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(address) ||
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
  #cleanup;
  #cleanupEmpty = false;
  #cleanupMonitor;
  constructor(root, execute = executeTerraform, cleanup) {
    this.root = root;
    this.execute = execute;
    if (!isAbsolute8(root) || resolve8(root) !== root) throw new Error('Terraform storage must be an absolute path');
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
      this.#cleanup = Object.freeze({
        ...cleanup,
        state: Object.freeze({ ...cleanup.state }),
        resources: Object.freeze(cleanup.resources.map((r) => Object.freeze({ ...r }))),
        retainedLockInputs: freezeAdmittedCaptureInputs(cleanup.retainedLockInputs),
        retainedLockSha256: Object.freeze({ ...cleanup.retainedLockSha256 }),
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
    const configuration = decode2(deployment.configuration);
    if (
      object(configuration.terraform ?? {}).backend ||
      object(configuration.terraform ?? {}).cloud ||
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
    await privateDirectory2(this.root);
    const directory = join6(this.root, deployment.deploymentId);
    await mkdir4(directory, { mode: 448 });
    const { configuration: source, providerLock, ...identity } = deployment;
    const manifest = { ...identity, configurationSha256: digest2(source), providerLockSha256: digest2(providerLock) };
    await writeFile4(join6(directory, 'main.tf.json'), source, { mode: 384, flag: 'wx' });
    await writeFile4(join6(directory, '.terraform.lock.hcl'), providerLock, { mode: 384, flag: 'wx' });
    await writeFile4(join6(directory, 'deployment.tfrc'), cliConfig, { mode: 384, flag: 'wx' });
    await persist(join6(directory, 'deployment.json'), manifest);
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
      const configuration = await privateRead(join6(directory, 'main.tf.json'));
      if (digest2(configuration) !== expectedSha256) throw new Error('Terraform configuration snapshot changed');
      return configuration.toString();
    });
  }
  async reconcileApplyFromEvidence(receipt, evidenceSha256) {
    if (this.#cleanup) throw new Error('Capture-independent cleanup cannot reconcile creation');
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const { directory, manifest } = this.#state();
      const journal = decode2((await privateRead(join6(directory, 'plan-receipt.json'))).toString());
      if (
        !['applying', 'applied'].includes(String(journal.state)) ||
        canonical2(receipt) !== canonical2(journal.receipt) ||
        receipt.engine !== 'terraform' ||
        receipt.deploymentId !== manifest.deploymentId ||
        receipt.backendIdentity !== manifest.backendIdentity ||
        receipt.configurationSha256 !== manifest.configurationSha256 ||
        receipt.providerLockSha256 !== manifest.providerLockSha256 ||
        receipt.planSha256 !== digest2(await privateRead(join6(directory, 'saved.tfplan'))) ||
        !/^[a-f0-9]{64}$/.test(evidenceSha256)
      )
        throw new Error('Terraform interrupted apply evidence differs from the exact saved plan');
      await this.#replacePrivate(
        join6(directory, 'plan-receipt.json'),
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
      this.#validateRevision(configuration, (await privateRead(join6(directory, 'main.tf.json'))).toString());
      const nextSha256 = digest2(configuration);
      if (nextSha256 === expectedSha256) return nextSha256;
      let receipt;
      try {
        receipt = decode2((await privateRead(join6(directory, 'plan-receipt.json'))).toString());
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (receipt?.state === 'applying')
        throw new Error('Reconcile interrupted Terraform apply before revising configuration');
      const transition = {
        previous: manifest,
        next: { ...manifest, configurationSha256: nextSha256 },
        configuration,
        archiveId: randomUUID4(),
      };
      await this.#replacePrivate(join6(directory, 'configuration-transition.json'), JSON.stringify(transition));
      await this.#recoverRevision();
      return nextSha256;
    });
  }
  #validateRevision(configuration, previousConfiguration) {
    const next = decode2(configuration);
    const terraform = object(next.terraform ?? {});
    if (terraform.backend || terraform.cloud) throw new Error('Terraform configuration revision cannot change backend');
    if (previousConfiguration !== undefined) {
      const previous = decode2(previousConfiguration);
      for (const key of ['terraform', 'provider'])
        if (canonical2(previous[key] ?? {}) !== canonical2(next[key] ?? {}))
          throw new Error('Terraform configuration revision cannot change provider or execution identity');
    }
  }
  async #replacePrivate(path, content) {
    const temporary = `${path}.${randomUUID4()}.new`;
    await writeFile4(temporary, content, { mode: 384, flag: 'wx' });
    await rename2(temporary, path);
  }
  async #recoverRevision() {
    const { directory } = this.#state();
    let transition;
    try {
      transition = decode2((await privateRead(join6(directory, 'configuration-transition.json'))).toString());
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    const previous = object(transition.previous);
    const next = object(transition.next);
    if (
      typeof transition.configuration !== 'string' ||
      typeof transition.archiveId !== 'string' ||
      !/^[0-9a-f-]{36}$/.test(transition.archiveId) ||
      !/^[0-9a-f]{64}$/.test(previous.configurationSha256) ||
      canonical2({ ...previous, configurationSha256: next.configurationSha256 }) !== canonical2(next) ||
      next.configurationSha256 !== digest2(transition.configuration)
    )
      throw new Error('Terraform configuration transition is malformed');
    this.#validateRevision(transition.configuration);
    const owner = decode2((await privateRead(join6(directory, 'deployment.json'))).toString());
    const current = await privateRead(join6(directory, 'main.tf.json'));
    if (
      ![canonical2(previous), canonical2(next)].includes(canonical2(owner)) ||
      ![previous.configurationSha256, next.configurationSha256].includes(digest2(current)) ||
      digest2(await privateRead(join6(directory, '.terraform.lock.hcl'))) !== previous.providerLockSha256 ||
      digest2(await privateRead(join6(directory, 'deployment.tfrc'))) !== digest2(cliConfig)
    )
      throw new Error('Terraform configuration transition ownership or inputs changed');
    const archive = join6(directory, 'revisions', transition.archiveId);
    await privateDirectory2(archive);
    const archiveFile = async (name, content) => {
      try {
        await writeFile4(join6(archive, name), content, { mode: 384, flag: 'wx' });
      } catch (error) {
        if (error.code !== 'EEXIST' || digest2(await privateRead(join6(archive, name))) !== digest2(content))
          throw error;
      }
    };
    if (digest2(current) === previous.configurationSha256) await archiveFile('main.tf.json', current);
    if (digest2(await privateRead(join6(archive, 'main.tf.json'))) !== previous.configurationSha256)
      throw new Error('Previous Terraform configuration archive is missing');
    this.#validateRevision(transition.configuration, (await privateRead(join6(archive, 'main.tf.json'))).toString());
    await archiveFile('deployment.json', Buffer.from(JSON.stringify(previous)));
    for (const name of ['saved.tfplan', 'plan-receipt.json']) {
      try {
        await archiveFile(name, await privateRead(join6(directory, name)));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    await this.#replacePrivate(join6(directory, 'main.tf.json'), transition.configuration);
    await this.#replacePrivate(join6(directory, 'deployment.json'), JSON.stringify(next));
    this.#manifest = next;
    await rm2(join6(directory, 'configuration-transition.json'));
  }
  async resume(deploymentId, expected, configurationMode = 'exact') {
    if (configurationMode === 'current' && !expected) throw new Error('Current configuration resume requires identity');
    if (!safeId.test(deploymentId)) throw new Error('Invalid Terraform deployment identity');
    const directory = join6(this.root, deploymentId);
    await privateDirectory2(directory);
    const manifest = decode2((await privateRead(join6(directory, 'deployment.json'))).toString());
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
      if (canonical2(recoveredManifest) !== canonical2(expectedManifest))
        throw new Error('Terraform deployment differs from the requested identity or configuration');
      if (configurationMode === 'current')
        this.#validateRevision((await privateRead(join6(directory, 'main.tf.json'))).toString(), configuration);
    }
    this.#directory = directory;
    this.#manifest = recoveredManifest;
    await this.#verifyInputs();
  }
  #state() {
    if (!this.#directory || !this.#manifest) throw new Error('Prepare or resume the deployment first');
    return { directory: this.#directory, manifest: this.#manifest };
  }
  async #verifyInputs() {
    if (!this.#manifest || !this.#directory) throw new Error('Prepare or resume the deployment first');
    try {
      await lstat7(join6(this.#directory, 'configuration-transition.json'));
      throw new Error('Resume the interrupted Terraform configuration transition before execution');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const owner = decode2((await privateRead(join6(this.#directory, 'deployment.json'))).toString());
    if (canonical2(owner) !== canonical2(this.#manifest) || owner.engine !== 'terraform')
      throw new Error('Terraform deployment ownership changed');
    for (const [file, expected] of [
      ['main.tf.json', this.#manifest.configurationSha256],
      ['.terraform.lock.hcl', this.#manifest.providerLockSha256],
      ['deployment.tfrc', digest2(cliConfig)],
    ]) {
      if (digest2(await privateRead(join6(this.#directory, file))) !== expected)
        throw new Error('Terraform configuration or provider lock changed');
    }
  }
  #environment(ambient) {
    const env = Object.fromEntries(Object.entries(ambient).filter(([key]) => !key.startsWith('TF_')));
    return {
      ...env,
      TF_CLI_CONFIG_FILE: join6(this.#state().directory, 'deployment.tfrc'),
      TF_DATA_DIR: join6(this.#state().directory, '.terraform'),
      TF_IN_AUTOMATION: '1',
      TF_INPUT: '0',
      TF_WORKSPACE: 'default',
    };
  }
  async #run(args, env, signal) {
    signal?.throwIfAborted();
    const result = await this.execute({ cwd: this.#state().directory, args, env: this.#environment(env), signal });
    if (result.code !== 0) throw new TerraformCommandError(args[0], result.code, result.failureCategory);
    return result.stdout;
  }
  async #exclusive(operation) {
    if (this.#busy) throw new Error('Terraform deployment operation is already running');
    if (!this.#directory) throw new Error('Prepare or resume the deployment first');
    this.#busy = true;
    const lock = join6(this.#directory, '.runner-lock');
    let release;
    try {
      release = await acquireProcessLock(lock);
      if (this.#cleanup) await this.#verifyCaptureCleanup();
      else {
        const executorStopped = await acquireProcessLock(join6(this.#directory, '.terraform-executor-lock'));
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
    if (digest2(await privateRead(join6(directory, 'deployment.json'))) !== scope.deploymentManifestSha256)
      throw new Error('Original cleanup manifest changed');
    const lock = join6(directory, '.terraform-executor-lock');
    for (const name of ['claim.json', 'lifetime.json', 'capture-unresolved.json'])
      if (
        scope.retainedLockInputs[name]?.path !== join6(lock, name) ||
        scope.retainedLockInputs[name]?.sha256 !== scope.retainedLockSha256[name]
      )
        throw new Error('Original retained cleanup lock admission differs');
    this.#cleanupMonitor ??= await monitorOriginalInputs(scope.retainedLockInputs);
    await this.#cleanupMonitor.assertOriginal();
    for (const [name, expected] of Object.entries(scope.retainedLockSha256))
      if (digest2(await privateRead(join6(lock, name))) !== expected)
        throw new Error('Original failed cleanup lock changed');
    await assertExecutorProcessGroupAbsent(lock);
    await scope.assertIndependentClosure();
    const raw = await privateRead(join6(directory, 'terraform.tfstate'));
    const state = decode2(raw.toString());
    if (
      state.lineage !== scope.state.lineage ||
      !Number.isSafeInteger(state.serial) ||
      state.serial < scope.state.serial
    )
      throw new Error('Original reviewed cleanup state identity changed');
    if (!Array.isArray(state.resources)) throw new Error('Original cleanup state resources are malformed');
    const resources = state.resources.map(object);
    const actual = resources
      .filter((r) => r.mode === 'managed')
      .flatMap((r) => {
        if (typeof r.type !== 'string' || typeof r.name !== 'string' || !Array.isArray(r.instances))
          throw new Error('Original cleanup state resource malformed');
        return r.instances.map((instance) => {
          const row = object(instance),
            attributes = object(row.attributes);
          const prefix = typeof r.module === 'string' ? `${r.module}.` : '';
          const suffix = row.index_key === undefined ? '' : `[${JSON.stringify(row.index_key)}]`;
          return { address: `${prefix}${r.type}.${r.name}${suffix}`, id: attributes.id };
        });
      });
    if (this.#cleanupEmpty) {
      if (actual.length) throw new Error('Owned cleanup resources remain');
    } else if (
      digest2(raw) !== scope.state.sha256 ||
      canonical2(actual.sort((a, b) => a.address.localeCompare(b.address))) !==
        canonical2([...scope.resources].sort((a, b) => a.address.localeCompare(b.address)))
    )
      throw new Error('Original reviewed cleanup state or owned resources changed');
    await assertExecutorProcessGroupAbsent(lock);
    await scope.assertIndependentClosure();
  }
  async readStateIdentity() {
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const state = await privateRead(join6(this.#state().directory, 'terraform.tfstate'));
      const value = decode2(state.toString());
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
        files.set(name, await privateRead(join6(directory, name)));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    if (!files.size) return;
    for (const name of ['main.tf.json', 'deployment.json', '.terraform.lock.hcl', 'deployment.tfrc'])
      files.set(name, await privateRead(join6(directory, name)));
    const inventory = JSON.stringify(Object.fromEntries([...files].map(([name, bytes]) => [name, digest2(bytes)])));
    const archive = join6(directory, 'plan-history', digest2(inventory));
    await privateDirectory2(archive);
    files.set('inventory.json', Buffer.from(inventory));
    for (const [name, bytes] of files) {
      try {
        await writeFile4(join6(archive, name), bytes, { mode: 384, flag: 'wx' });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if (digest2(await privateRead(join6(archive, name))) !== digest2(bytes))
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
      const resource = object(value);
      const actions = changeActions(object(resource.change).actions);
      if (
        typeof resource.address !== 'string' ||
        typeof resource.type !== 'string' ||
        changes.some((change) => change.address === resource.address)
      )
        throw new Error('Terraform resource change is malformed');
      changes.push({ address: resource.address, type: resource.type, actions });
    }
    const outputs = Object.values(object(plan.output_changes ?? {})).map((output) =>
      changeActions(object(output).actions, true),
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
      const version = decode2(await this.#run(['version', '-json'], env, signal));
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
      const { changes, noChanges, actionInvocations } = this.#inspectPlan(decode2(raw), action, destroy);
      const manifest = this.#state().manifest;
      const receipt = {
        schemaVersion: 1,
        deploymentId: manifest.deploymentId,
        engine: 'terraform',
        backendIdentity: manifest.backendIdentity,
        configurationSha256: manifest.configurationSha256,
        providerLockSha256: manifest.providerLockSha256,
        planSha256: digest2(await privateRead(join6(this.#state().directory, 'saved.tfplan'))),
        changes,
        noChanges,
        ...(actionInvocations.length ? { actionInvocations } : {}),
        ...(destroy ? { operation: 'destroy' } : {}),
      };
      await persist(join6(this.#state().directory, 'plan-receipt.json'), { state: 'planned', receipt });
      return receipt;
    });
  }
  async #assertActionUnsubmitted() {
    try {
      await privateRead(join6(this.#state().directory, 'action-attempt.json'));
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
      journal = decode2((await privateRead(join6(directory, 'plan-receipt.json'))).toString());
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    if (!['applying', 'applied'].includes(String(journal.state))) return;
    const actions = object(journal.receipt).actionInvocations;
    if (!Array.isArray(actions) || actions.length === 0) return;
    try {
      await privateRead(join6(directory, 'action-attempt.json'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await persist(join6(directory, 'action-attempt.json'), {
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
      const journal = decode2((await privateRead(join6(directory, 'plan-receipt.json'))).toString());
      const receipt = object(journal.receipt);
      if (
        !(journal.state === 'applied' || (journal.state === 'planned' && receipt.noChanges === true)) ||
        receipt.configurationSha256 !== manifest.configurationSha256 ||
        receipt.providerLockSha256 !== manifest.providerLockSha256
      )
        throw new Error('Terraform outputs require an applied or converged current configuration');
      const version = decode2(await this.#run(['version', '-json'], env, signal));
      if (version.terraform_version !== manifest.terraformVersion) throw new Error('Terraform version changed');
      const outputs = decode2(await this.#run(['output', '-json'], env, signal));
      const selected = {};
      for (const name of names) {
        const output = object(outputs[name]);
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
      const journal = decode2((await privateRead(join6(directory, 'plan-receipt.json'))).toString());
      if (
        journal.state !== 'applied' ||
        canonical2(journal.receipt) !== canonical2(receipt) ||
        receipt.deploymentId !== manifest.deploymentId ||
        receipt.engine !== 'terraform' ||
        receipt.backendIdentity !== manifest.backendIdentity ||
        receipt.configurationSha256 !== manifest.configurationSha256 ||
        receipt.providerLockSha256 !== manifest.providerLockSha256 ||
        receipt.planSha256 !== digest2(await privateRead(join6(directory, 'saved.tfplan')))
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
      const journal = decode2((await privateRead(join6(directory, 'plan-receipt.json'))).toString());
      if (
        journal.state !== 'planned' ||
        canonical2(journal.receipt) !== canonical2(receipt) ||
        receipt.configurationSha256 !== manifest.configurationSha256 ||
        receipt.planSha256 !== digest2(await privateRead(join6(directory, 'saved.tfplan')))
      )
        throw new Error('Terraform identity inspection saved plan differs');
      const version = decode2(await this.#run(['version', '-json'], env, signal));
      if (version.terraform_version !== manifest.terraformVersion) throw new Error('Terraform version changed');
      const plan = decode2(await this.#run(['show', '-json', 'saved.tfplan'], env, signal));
      const changes = plan.resource_changes === undefined ? [] : plan.resource_changes;
      if (!Array.isArray(changes)) throw new Error('Terraform plan resource identities unavailable');
      const result = {};
      for (const [address, fields] of Object.entries(selections)) {
        const matches = changes.map(object).filter((resource) => resource.address === address);
        if (matches.length > 1) throw new Error('Terraform resource identity is ambiguous');
        if (!matches.length) {
          result[address] = null;
          continue;
        }
        const change = object(matches[0].change);
        if (change.before === null || change.before === undefined) {
          result[address] = null;
          continue;
        }
        const before = object(change.before);
        const sensitivity =
          change.before_sensitive === undefined || change.before_sensitive === false
            ? {}
            : change.before_sensitive === true
              ? true
              : object(change.before_sensitive);
        const selected = projectResourceFields(before, sensitivity, fields);
        result[address] = selected;
      }
      if (receipt.planSha256 !== digest2(await privateRead(join6(directory, 'saved.tfplan'))))
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
      const journalPath = join6(directory, 'plan-receipt.json'),
        planPath = join6(directory, 'saved.tfplan');
      const journalBytes = await privateRead(journalPath),
        planBytes = await privateRead(planPath);
      const journal = decode2(journalBytes.toString()),
        stored = object(journal.receipt);
      if (journal.state !== 'planned' || (stored.operation && stored.operation !== 'destroy'))
        throw new Error('Current resource plan is consumed or requires reconciliation');
      const version = decode2(await this.#run(['version', '-json'], env, signal));
      if (version.terraform_version !== manifest.terraformVersion) throw new Error('Terraform version changed');
      const { changes, noChanges } = this.#inspectPlan(
        decode2(await this.#run(['show', '-json', 'saved.tfplan'], env, signal)),
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
      if (canonical2(stored) !== canonical2(receipt))
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
    const journal = decode2((await privateRead(join6(directory, 'plan-receipt.json'))).toString());
    const state = journal.state;
    if (
      !states.includes(state) ||
      canonical2(journal.receipt) !== canonical2(receipt) ||
      receipt.engine !== 'terraform' ||
      receipt.deploymentId !== manifest.deploymentId ||
      receipt.backendIdentity !== manifest.backendIdentity ||
      receipt.configurationSha256 !== manifest.configurationSha256 ||
      receipt.providerLockSha256 !== manifest.providerLockSha256 ||
      receipt.planSha256 !== digest2(await privateRead(join6(directory, 'saved.tfplan')))
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
      const statePath = join6(directory, 'terraform.tfstate');
      const snapshot = await privateRead(statePath);
      const identity = decode2(snapshot.toString());
      if (
        typeof identity.lineage !== 'string' ||
        !identity.lineage.trim() ||
        !Number.isSafeInteger(identity.serial) ||
        identity.serial < 0
      )
        throw new Error('Terraform state identity is malformed');
      const version = decode2(await this.#run(['version', '-json'], env, signal));
      if (version.terraform_version !== manifest.terraformVersion) throw new Error('Terraform version changed');
      const state = decode2(await this.#run(['show', '-json', 'terraform.tfstate'], env, signal));
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
      const module = object(object(state.values ?? {}).root_module ?? {});
      const resources = module.resources ?? [];
      if (!Array.isArray(resources)) throw new Error('Terraform state resource identities unavailable');
      if (
        (Array.isArray(module.child_modules) && module.child_modules.length) ||
        resources
          .map(object)
          .some((resource) => typeof resource.address !== 'string' || !Object.hasOwn(selections, resource.address))
      )
        throw new Error('Foreign state resource requires reconciliation');
      const result = {};
      for (const [address, fields] of Object.entries(selections)) {
        const reviewed = receipt.changes.filter((change) => change.address === address);
        if (reviewed.length !== 1) throw new Error('Terraform state resource is outside the reviewed plan');
        const matches = resources.map(object).filter((resource) => resource.address === address);
        if (matches.length > 1) throw new Error('Terraform state resource identity is ambiguous');
        if (!matches.length) {
          result[address] = null;
          continue;
        }
        const resource = matches[0];
        if (
          resource.mode !== 'managed' ||
          resource.type !== reviewed[0].type ||
          resource.type !== address.split('.')[0]
        )
          throw new Error('Terraform state resource differs from reviewed identity');
        if (!Object.hasOwn(resource, 'sensitive_values')) throw new Error('Terraform state sensitivity unavailable');
        result[address] = projectResourceFields(object(resource.values), resource.sensitive_values, fields);
      }
      if (digest2(snapshot) !== digest2(await privateRead(statePath)))
        throw new Error('Terraform state changed during identity inspection');
      await this.#verifyInputs();
      if ((await this.#verifyApplyReceipt(receipt, states)) !== applyState)
        throw new Error('Terraform apply checkpoint changed during inspection');
      if (receipt.planSha256 !== digest2(await privateRead(join6(directory, 'saved.tfplan'))))
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
  async apply(receipt, env, signal) {
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
      const journal = decode2((await privateRead(join6(this.#state().directory, 'plan-receipt.json'))).toString());
      if (journal.state !== 'planned') throw new Error('Saved plan is consumed or requires reconciliation');
      if (
        canonical2(receipt) !== canonical2(journal.receipt) ||
        receipt.engine !== 'terraform' ||
        receipt.deploymentId !== this.#state().manifest.deploymentId ||
        receipt.configurationSha256 !== this.#state().manifest.configurationSha256 ||
        receipt.providerLockSha256 !== this.#state().manifest.providerLockSha256 ||
        receipt.planSha256 !== digest2(await privateRead(join6(this.#state().directory, 'saved.tfplan')))
      )
        throw new Error('Terraform saved-plan receipt does not match');
      const version = decode2(await this.#run(['version', '-json'], env, signal));
      if (version.terraform_version !== this.#state().manifest.terraformVersion)
        throw new Error('Terraform version changed');
      const expectedActions = receipt.actionInvocations ?? [];
      if (!Array.isArray(expectedActions) || expectedActions.length > 1)
        throw new Error('Saved action receipt is malformed');
      if (expectedActions.length) validateActionIntent(expectedActions[0]);
      const plan = decode2(await this.#run(['show', '-json', 'saved.tfplan'], env, signal));
      inspectActionInvocations(plan, expectedActions[0]);
      if (receipt.planSha256 !== digest2(await privateRead(join6(this.#state().directory, 'saved.tfplan'))))
        throw new Error('Terraform saved plan changed during action inspection');
      if (expectedActions.length) {
        await this.#assertActionUnsubmitted();
        await persist(join6(this.#state().directory, 'action-attempt.json'), {
          schemaVersion: 1,
          submittedAt: new Date().toISOString(),
          receipt,
        });
      }
      await persist(join6(this.#state().directory, 'plan-receipt.json'), { state: 'applying', receipt });
      await this.#run(['apply', '-input=false', '-lock=true', '-lock-timeout=60s', 'saved.tfplan'], env, signal);
      await persist(join6(this.#state().directory, 'plan-receipt.json'), { state: 'applied', receipt });
      if (this.#cleanup) {
        this.#cleanupEmpty = true;
        await this.#verifyCaptureCleanup();
      }
    });
  }
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

// plugins/terraform/src/service.ts
var TERRAFORM_SERVICE_CHANNEL = 'xcsh:ce-terraform:v1:service';
function freezeRuntime(options) {
  const execute = options.execute;
  const assertApplyReady = options.assertApplyReady;
  const googleAdc = options.googleAdc
    ? Object.freeze({ ...options.googleAdc, acquire: options.googleAdc.acquire })
    : undefined;
  if (googleAdc && !execute) throw new Error('Google ADC policy requires a qualified original-lifetime executor');
  return Object.freeze({ execute, googleAdc, assertApplyReady });
}
function createCeTerraformService(platform, options = {}) {
  const defaults = freezeRuntime(options);
  const resolveRuntime = options.resolveRuntime;
  if (resolveRuntime && (defaults.execute || defaults.googleAdc || defaults.assertApplyReady))
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
        ? join7(store.directory, 'terraform-stages', deployment.stage)
        : store.directory;
      const { execute, googleAdc, assertApplyReady } = resolveRuntime
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
      const runner = new TerraformRunner(directory, guardedExecute);
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
    assertNewRuntime: async (provider) => {
      if (provider === 'gcp') await assertInstalledRuntime();
    },
  });
}

export { factory as default };
