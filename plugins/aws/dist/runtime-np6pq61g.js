// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun

// plugins/aws/src/ce/artifacts.ts
import { readdir as readdir2 } from 'node:fs/promises';
import { join as join3 } from 'node:path';
import { awsCeObservationRegion, canonicalSha256, safeHexEqual, sha256Hex } from './runtime-x2h4t614.js';

// plugins/aws/src/ce/initial-admin.ts
function normalizeAwsAdminSshPublicKey(value) {
  const fail = () => {
    throw new Error('Administrator SSH key must be a valid OpenSSH public key');
  };
  if (typeof value !== 'string' || value.length > 16384 || /[\r\n\0]/.test(value)) return fail();
  const parts = value.trim().split(/[ \t]+/);
  const algorithm = parts[0],
    encoded = parts[1];
  if (!algorithm || !encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return fail();
  const blob = Buffer.from(encoded, 'base64');
  if (blob.toString('base64') !== encoded) return fail();
  let offset = 0;
  const field = () => {
    if (offset + 4 > blob.length) return fail();
    const length = blob.readUInt32BE(offset);
    offset += 4;
    if (!length || offset + length > blob.length) return fail();
    const result = blob.subarray(offset, offset + length);
    offset += length;
    return result;
  };
  if (field().toString('ascii') !== algorithm) return fail();
  if (algorithm === 'ssh-ed25519') {
    if (field().length !== 32) return fail();
  } else if (algorithm === 'ssh-rsa') {
    for (const integer of [field(), field()])
      if (integer[0] & 128 || !integer.some((byte) => byte !== 0)) return fail();
  } else if (/^ecdsa-sha2-nistp(?:256|384|521)$/.test(algorithm)) {
    const curve = field().toString('ascii');
    const point = field();
    const lengths = { nistp256: 65, nistp384: 97, nistp521: 133 };
    if (algorithm !== `ecdsa-sha2-${curve}` || point.length !== lengths[curve] || point[0] !== 4) return fail();
  } else return fail();
  if (offset !== blob.length) return fail();
  return `${algorithm} ${encoded}`;
}
function awsInitialAdminSettings(intent) {
  return intent.adminSshPublicKey === undefined
    ? {}
    : {
        admin_user_credentials: { ssh_key: normalizeAwsAdminSshPublicKey(intent.adminSshPublicKey) },
      };
}
function assertAwsAdminPrebootDevices(intent) {
  if (intent.adminSshPublicKey === undefined) return;
  normalizeAwsAdminSshPublicKey(intent.adminSshPublicKey);
  const devices = intent.interfaces.map((iface) => iface.guestDevice);
  if (
    devices.some((device) => typeof device !== 'string' || !device.length) ||
    new Set(devices).size !== devices.length
  )
    throw new Error('Complete distinct guest device identities are required for preboot administrator configuration');
}

// plugins/aws/src/ce/bootstrap-key-pair.ts
function normalizeAwsBootstrapKeyPairName(value) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 255 ||
    Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  ) {
    throw new Error('An exact EC2 bootstrap key-pair name is required');
  }
  return value;
}
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed EC2 key-pair evidence');
  return Object.fromEntries(Object.entries(value));
}
function parseAwsBootstrapKeyPairs(value, region, requested) {
  const data = object(value);
  if (
    !Array.isArray(data.KeyPairs) ||
    data.KeyPairs.length !== requested.length ||
    ['NextToken', 'NextMarker', 'nextToken', 'errors'].some((name) => data[name] !== undefined)
  ) {
    throw new Error('Complete EC2 bootstrap key-pair evidence is required');
  }
  const names = new Set();
  const ids = new Set();
  const result = [];
  for (const input of data.KeyPairs) {
    const row = object(input);
    const name = normalizeAwsBootstrapKeyPairName(row.KeyName);
    if (
      !requested.includes(name) ||
      names.has(name) ||
      typeof row.KeyPairId !== 'string' ||
      !/^key-[a-f0-9]{8,21}$/.test(row.KeyPairId) ||
      ids.has(row.KeyPairId)
    ) {
      throw new Error('Foreign, duplicate or unresolved EC2 bootstrap key-pair identity');
    }
    const publicKey = normalizeAwsAdminSshPublicKey(
      typeof row.PublicKey === 'string' ? row.PublicKey.trim() : row.PublicKey,
    );
    if (
      !['rsa', 'ed25519'].includes(String(row.KeyType)) ||
      (row.KeyType === 'rsa' ? !publicKey.startsWith('ssh-rsa ') : !publicKey.startsWith('ssh-ed25519 '))
    ) {
      throw new Error('EC2 bootstrap key-pair algorithm evidence differs');
    }
    names.add(name);
    ids.add(row.KeyPairId);
    result.push({ name, id: row.KeyPairId, region, publicKeySha256: sha256Hex(publicKey) });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}
async function observeAwsBootstrapKeyPairs(api, region, requested) {
  if (
    !/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(region) ||
    requested.length !== 1 ||
    new Set(requested).size !== requested.length
  )
    throw new Error('One region-bound EC2 bootstrap key-pair reference is required');
  requested.forEach(normalizeAwsBootstrapKeyPairName);
  const reply = await api.exec('aws', [
    'ec2',
    'describe-key-pairs',
    '--include-public-key',
    '--cli-input-json',
    JSON.stringify({ KeyNames: requested }),
    '--region',
    region,
    '--output',
    'json',
  ]);
  if (reply.exitCode !== 0) throw new Error('EC2 bootstrap key-pair reference is unavailable or unauthorized');
  return parseAwsBootstrapKeyPairs(JSON.parse(reply.stdout), region, requested);
}
function selectAwsBootstrapKeyPair(intent, observation) {
  const name = intent.instance.bootstrapKeyPairName;
  if (name === undefined || !['deploy', 'replace-node', 'repair'].includes(intent.operation)) return;
  normalizeAwsBootstrapKeyPairName(name);
  if (observation.identity.accountId !== intent.accountId || observation.identity.partition !== intent.partition) {
    throw new Error('EC2 bootstrap key-pair account binding differs');
  }
  if (!Array.isArray(observation.bootstrapKeyPairs) || observation.bootstrapKeyPairs.length !== 1)
    throw new Error('Complete unambiguous EC2 bootstrap key-pair evidence is required');
  const selected = observation.bootstrapKeyPairs.filter((row) => row.name === name && row.region === intent.region);
  if (
    selected?.length !== 1 ||
    !/^key-[a-f0-9]{8,21}$/.test(selected[0].id) ||
    !/^[a-f0-9]{64}$/.test(selected[0].publicKeySha256)
  ) {
    throw new Error('EC2 bootstrap key-pair identity is missing, malformed or ambiguous');
  }
  return structuredClone(selected[0]);
}
function assertAwsBootstrapKeyPair(plan, current) {
  const name = plan.intent.instance.bootstrapKeyPairName;
  const reference = plan.bootstrapKeyPair;
  if (name === undefined) {
    if (reference !== undefined) throw new Error('Unrequested EC2 bootstrap key-pair binding');
    return;
  }
  normalizeAwsBootstrapKeyPairName(name);
  if (!['deploy', 'replace-node', 'repair'].includes(plan.intent.operation) && reference === undefined) return;
  if (
    !reference ||
    reference.name !== name ||
    reference.region !== plan.region ||
    !/^key-[a-f0-9]{8,21}$/.test(reference.id) ||
    !/^[a-f0-9]{64}$/.test(reference.publicKeySha256)
  ) {
    throw new Error('EC2 bootstrap key-pair plan binding differs');
  }
  if (current && canonicalSha256(reference) !== canonicalSha256(selectAwsBootstrapKeyPair(plan.intent, current))) {
    throw new Error('EC2 bootstrap key-pair identity or public key changed before execution');
  }
}
async function revalidateAwsBootstrapKeyPair(plan, api) {
  assertAwsBootstrapKeyPair(plan);
  if (!plan.bootstrapKeyPair) return;
  const response = await api.exec('aws', ['sts', 'get-caller-identity', '--output', 'json']);
  if (response.exitCode !== 0) throw new Error('EC2 bootstrap key-pair caller identity is unavailable');
  const identity = object(JSON.parse(response.stdout));
  if (
    identity.Account !== plan.accountId ||
    typeof identity.Arn !== 'string' ||
    !identity.Arn.startsWith(`arn:${plan.partition}:`)
  )
    throw new Error('EC2 bootstrap key-pair caller account changed');
  const keys = await observeAwsBootstrapKeyPairs(api, plan.region, [plan.bootstrapKeyPair.name]);
  if (keys.length !== 1 || canonicalSha256(keys[0]) !== canonicalSha256(plan.bootstrapKeyPair)) {
    throw new Error('EC2 bootstrap key-pair identity or public key changed before VM creation');
  }
}

// plugins/platform/src/ce/process-lock.ts
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
// plugins/aws/src/ce/checkpoint-journal.ts
import {
  lstat,
  lstat as lstat2,
  mkdir,
  mkdir as mkdir2,
  readdir,
  readFile,
  readFile as readFile2,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, join as join2, resolve } from 'node:path';
import { promisify } from 'node:util';

var execute = promisify(execFile);
var tokenPattern = /^[a-f0-9-]{36}$/;
var bootPattern = /^[a-f0-9-]{36}$/;
async function bootId() {
  const value =
    process.platform === 'linux'
      ? (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim()
      : process.platform === 'darwin'
        ? (await execute('/usr/sbin/sysctl', ['-n', 'kern.bootsessionuuid'])).stdout.trim().toLowerCase()
        : '';
  if (!bootPattern.test(value)) throw new Error('Process boot identity is unavailable');
  return value;
}
async function processStartTicks(pid) {
  if (process.platform === 'darwin') {
    let value;
    try {
      value = (
        await execute('/bin/ps', ['-p', String(pid), '-o', 'lstart='], {
          env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' },
        })
      ).stdout.trim();
    } catch (error) {
      if (error.code !== 1) throw error;
      try {
        process.kill(pid, 0);
      } catch (probe) {
        if (probe.code === 'ESRCH') return;
        throw probe;
      }
      throw new Error('Process identity is unavailable');
    }
    const match = /^[A-Z][a-z]{2} ([A-Z][a-z]{2}) +([0-9]{1,2}) ([0-9]{2}):([0-9]{2}):([0-9]{2}) ([0-9]{4})$/.exec(
      value,
    );
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (!match || !months.includes(match[1])) throw new Error('Malformed process identity');
    const timestamp = Date.UTC(
      Number(match[6]),
      months.indexOf(match[1]),
      Number(match[2]),
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
    );
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new Error('Malformed process identity');
    return String(timestamp / 1000);
  }
  if (process.platform !== 'linux') throw new Error('Process identity platform is unsupported');
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
    Object.keys(value).sort().join(',') !== 'bootId,pid,processStartTicks,schemaVersion,token'
  )
    throw new Error('Operation lock evidence cannot be reconciled');
  const row = value;
  if (
    row.schemaVersion !== 1 ||
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
async function acquireProcessLock(path) {
  if (!path.startsWith('/') || !/^\.[a-z][a-z0-9-]*-lock$/.test(basename(path)))
    throw new Error('Invalid operation lock path');
  const currentBootId = await bootId();
  const currentStart = await processStartTicks(process.pid);
  if (!currentStart) throw new Error('Current process identity is unavailable');
  const mine = {
    schemaVersion: 1,
    token: randomUUID(),
    pid: process.pid,
    bootId: currentBootId,
    processStartTicks: currentStart,
  };
  const parent = dirname(path);
  for (let attempt = 0; attempt < 4; attempt++) {
    const candidate = join(parent, `${basename(path)}.claim-${mine.token}`);
    await mkdir(candidate, { mode: 448 });
    await writeFile(join(candidate, 'claim.json'), JSON.stringify(mine), { mode: 384, flag: 'wx' });
    try {
      await rename(candidate, path);
      return async () => {
        const owned = await readClaim(path);
        if (owned.token !== mine.token) throw new Error('Operation lock ownership changed');
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

// plugins/aws/src/ce/types.ts
var AWS_CE_SCHEMA_VERSION = 2;
var AWS_CE_SHARED_CONTRACT_URL =
  'https://f5-sales-demo.github.io/multi-cloud-networking/_llms-txt/en/customer-edge/automation-contract.txt';
var AWS_CE_F5_GUIDE_URL =
  'https://docs.cloud.f5.com/docs-v2/multi-cloud-network-connect/how-to/site-management/deploy-sms-aws-clickops';
var AWS_CE_TGW_GUIDE_URL =
  'https://f5-sales-demo.github.io/multi-cloud-networking/_llms-txt/en/customer-edge/smsv2/aws-tgw-connect.txt';
var AWS_CE_MARKETPLACE_PRODUCT_ID = 'prod-wrwzhcymymama';
var AWS_CE_SSM_PARAMETER = `/aws/service/marketplace/${AWS_CE_MARKETPLACE_PRODUCT_ID}/latest`;
var AWS_CE_MIN_UPGRADE_SAFE_ROOT_VOLUME_GIB = 100;
var AWS_CE_DEFAULT_INTERFACE_MTU = 1500;

// plugins/aws/src/ce/checkpoint-journal.ts
var hex = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
var object2 = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
function checkpoint(value) {
  if (
    !object2(value) ||
    value.schemaVersion !== AWS_CE_SCHEMA_VERSION ||
    !['native', 'terraform'].includes(String(value.engine)) ||
    typeof value.planId !== 'string' ||
    !value.planId ||
    !hex(value.planSha256) ||
    !['running', 'partial', 'complete'].includes(String(value.state)) ||
    !Array.isArray(value.completedActionIds) ||
    value.completedActionIds.some((id) => typeof id !== 'string' || !id) ||
    new Set(value.completedActionIds).size !== value.completedActionIds.length ||
    !object2(value.resolvedValues) ||
    Object.values(value.resolvedValues).some((v) => typeof v !== 'string')
  )
    throw Error('AWS CE checkpoint snapshot is malformed');
}
function record(value) {
  if (
    !object2(value) ||
    value.kind !== 'aws-ce-checkpoint' ||
    !object2(value.journal) ||
    value.journal.schemaVersion !== 1 ||
    !Number.isSafeInteger(value.journal.sequence) ||
    Number(value.journal.sequence) < 1 ||
    !(value.journal.previousSha256 === null || hex(value.journal.previousSha256)) ||
    !hex(value.sha256)
  )
    throw Error('AWS CE checkpoint journal is malformed or unsupported');
  checkpoint(value.checkpoint);
  const { sha256, ...body } = value;
  if (canonicalSha256(body) !== sha256) throw Error('AWS CE checkpoint journal integrity differs');
  return value;
}
async function head(directory, planId, planSha256) {
  const rows = new Map();
  for (const name of await readdir(directory)) {
    if (!name.endsWith('.aws-ce-checkpoint.log')) continue;
    const path = join2(directory, name),
      stat = await lstat2(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.uid !== process.getuid?.() ||
      stat.nlink !== 1 ||
      (stat.mode & 18) !== 0
    )
      throw Error('AWS CE checkpoint artifact ownership differs');
    let value;
    try {
      value = JSON.parse(await readFile2(path, 'utf8'));
    } catch {
      throw Error('AWS CE checkpoint artifact is unreadable or malformed');
    }
    if (!object2(value) || value.kind !== 'aws-ce-checkpoint' || !object2(value.checkpoint))
      throw Error('AWS CE checkpoint artifact identity is malformed');
    if (typeof value.checkpoint.planId !== 'string' || !value.checkpoint.planId || !hex(value.checkpoint.planSha256))
      throw Error('AWS CE checkpoint artifact plan identity is malformed');
    if (value.checkpoint.planId !== planId || value.checkpoint.planSha256 !== planSha256) continue;
    const item = record(value);
    rows.set(item.sha256, item);
  }
  if (!rows.size) return;
  const children = new Map(),
    roots = [];
  for (const item of rows.values()) {
    const previous = item.journal.previousSha256;
    if (previous === null) {
      if (item.journal.sequence !== 1) throw Error('AWS CE checkpoint journal ancestry is incomplete');
      roots.push(item);
      continue;
    }
    const parent = rows.get(previous);
    if (
      !parent ||
      parent.journal.sequence + 1 !== item.journal.sequence ||
      parent.checkpoint.engine !== item.checkpoint.engine
    )
      throw Error('AWS CE checkpoint journal ancestry or engine differs');
    if (children.has(previous)) throw Error('AWS CE checkpoint journal is forked');
    children.set(previous, item);
  }
  if (roots.length !== 1) throw Error('AWS CE checkpoint journal has ambiguous roots');
  let latest = roots[0],
    count = 1;
  while (true) {
    const child = children.get(latest.sha256);
    if (!child) break;
    latest = child;
    count++;
  }
  if (count !== rows.size) throw Error('AWS CE checkpoint journal is incomplete');
  return latest;
}
async function locked(session, hash, create, run) {
  const directory = session.getArtifactsDir();
  if (!directory) {
    if (create) throw Error('Durable AWS CE checkpoint artifact directory is unavailable');
    return;
  }
  if (!hex(hash) || !isAbsolute(directory) || resolve(directory) !== directory)
    throw Error('AWS CE checkpoint journal scope differs');
  if (create) await mkdir2(directory, { recursive: true, mode: 448 });
  let stat;
  try {
    stat = await lstat2(directory);
  } catch (error) {
    if (!create && error.code === 'ENOENT') return;
    throw error;
  }
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.())
    throw Error('AWS CE checkpoint directory ownership differs');
  const release = await acquireProcessLock(join2(directory, `.aws-ce-checkpoint-${hash}-lock`));
  try {
    return await run(directory);
  } finally {
    await release();
  }
}
async function readAwsCheckpointJournal(session, planId, hash) {
  return locked(session, hash, false, async (directory) => (await head(directory, planId, hash))?.checkpoint);
}
async function publishAwsCheckpointJournal(session, value) {
  const snapshot = JSON.parse(JSON.stringify(value));
  checkpoint(snapshot);
  const result = await locked(session, snapshot.planSha256, true, async (directory) => {
    const previous = await head(directory, snapshot.planId, snapshot.planSha256);
    if (previous && previous.checkpoint.engine !== snapshot.engine) throw Error('AWS CE checkpoint engine changed');
    const body = {
      kind: 'aws-ce-checkpoint',
      checkpoint: snapshot,
      journal: {
        schemaVersion: 1,
        sequence: (previous?.journal.sequence ?? 0) + 1,
        previousSha256: previous?.sha256 ?? null,
      },
    };
    const item = { ...body, sha256: canonicalSha256(body) };
    record(item);
    const id = await session.saveArtifact(JSON.stringify(item), 'aws-ce-checkpoint');
    if (typeof id !== 'string' || !id) throw Error('AWS CE checkpoint could not be persisted');
    if ((await head(directory, snapshot.planId, snapshot.planSha256))?.sha256 !== item.sha256)
      throw Error('AWS CE checkpoint publication is unavailable or ambiguous');
    return id;
  });
  if (!result) throw Error('Durable AWS CE checkpoint publication is unavailable');
  return result;
}

// plugins/aws/src/ce/artifacts.ts
var memoryPlans = new Map();
function verifyAwsCePlan(plan) {
  awsCeObservationRegion(plan);
  assertAwsBootstrapKeyPair(plan);
  if (plan.schemaVersion !== AWS_CE_SCHEMA_VERSION || plan.intent.schemaVersion !== AWS_CE_SCHEMA_VERSION)
    throw new Error('Persisted AWS CE plan uses an unsupported schema version');
  if (!['native', 'terraform'].includes(plan.engine) || plan.intent.engine !== plan.engine)
    throw new Error('Persisted AWS CE engine ownership is invalid');
  if (
    plan.intent.ingress?.mode === 'nlb' &&
    (!plan.intent.ingress.listener ||
      typeof plan.intent.ingress.listener.name !== 'string' ||
      typeof plan.intent.ingress.listener.domain !== 'string' ||
      typeof plan.intent.ingress.listener.originPool?.name !== 'string' ||
      !plan.intent.ingress.probe ||
      typeof plan.intent.ingress.probe.sourceInstanceId !== 'string' ||
      typeof plan.intent.ingress.probe.expectedBodySha256 !== 'string')
  )
    throw new Error('Persisted AWS CE plan uses the obsolete cloud-only NLB ingress schema');
  const { planId, planSha256, ...draft } = plan;
  if (!safeHexEqual(canonicalSha256(draft), planSha256) || planId !== `aws-ce-${planSha256.slice(0, 24)}`)
    throw new Error('Persisted AWS CE plan failed integrity validation');
}
function verifyAwsCePlanForInspection(plan) {
  if (![1, AWS_CE_SCHEMA_VERSION].includes(plan.schemaVersion) || plan.intent?.schemaVersion !== plan.schemaVersion)
    throw new Error('Unsupported AWS CE inspection artifact');
  const { planId, planSha256, ...draft } = plan;
  if (!safeHexEqual(canonicalSha256(draft), planSha256) || planId !== `aws-ce-${planSha256.slice(0, 24)}`)
    throw new Error('AWS CE inspection artifact failed integrity validation');
}
async function saveAwsDiscovery(session, observation) {
  if (observation.schemaVersion !== AWS_CE_SCHEMA_VERSION)
    throw new Error('AWS CE discovery uses an unsupported schema version');
  return session.saveArtifact(JSON.stringify({ kind: 'aws-ce-discovery', observation }), 'aws-ce-discovery');
}
async function loadAwsDiscovery(session, id) {
  if (!/^\d+$/.test(id)) throw new Error('Invalid AWS CE discovery artifact ID');
  const path = await session.getArtifactPath(id);
  if (!path) throw new Error(`AWS CE discovery artifact ${id} was not found in this session`);
  const envelope = JSON.parse(await Bun.file(path).text());
  if (envelope.kind !== 'aws-ce-discovery' || envelope.observation?.schemaVersion !== AWS_CE_SCHEMA_VERSION)
    throw new Error('Artifact is not an AWS CE schema-v2 discovery observation');
  return envelope.observation;
}
async function saveAwsPlan(session, plan, observation) {
  verifyAwsCePlan(plan);
  const envelope = { kind: 'aws-ce-plan', plan, observation };
  const plans = memoryPlans.get(session.getSessionId()) ?? [];
  plans.push(envelope);
  memoryPlans.set(session.getSessionId(), plans);
  return session.saveArtifact(JSON.stringify(envelope), 'aws-ce-plan');
}
async function loadAwsPlan(session, planId, planSha256, mode = 'execute') {
  const verify = mode === 'inspect' ? verifyAwsCePlanForInspection : verifyAwsCePlan;
  const memory = memoryPlans
    .get(session.getSessionId())
    ?.find((item) => item.plan.planId === planId && item.plan.planSha256 === planSha256);
  if (memory) {
    verify(memory.plan);
    return memory;
  }
  const directory = session.getArtifactsDir();
  if (!directory) throw new Error('The exact AWS CE plan is unavailable in this session');
  let files = [];
  try {
    files = (await readdir2(directory)).filter((file) => file.endsWith('.aws-ce-plan.log')).sort();
  } catch {}
  for (const file of files) {
    try {
      const envelope = JSON.parse(await Bun.file(join3(directory, file)).text());
      if (envelope.kind !== 'aws-ce-plan' || envelope.plan.planId !== planId || envelope.plan.planSha256 !== planSha256)
        continue;
      verify(envelope.plan);
      return envelope;
    } catch {}
  }
  throw new Error('No exact, integrity-valid AWS CE plan was found in this session');
}
var saveAwsCheckpoint = publishAwsCheckpointJournal;
var loadAwsCheckpoint = readAwsCheckpointJournal;

// plugins/aws/src/ce/terminated-instance.ts
function isAwsTerminatedOwnedInstance(resource, accountId) {
  if (!resource.exists || !resource.owned || !resource.id.startsWith('i-')) return false;
  const reservations = resource.state.Reservations;
  if (!Array.isArray(reservations) || reservations.length !== 1) return false;
  const reservation = reservations[0];
  if (
    !reservation ||
    typeof reservation !== 'object' ||
    reservation.OwnerId !== accountId ||
    !Array.isArray(reservation.Instances) ||
    reservation.Instances.length !== 1
  )
    return false;
  const instance = reservation.Instances[0];
  return Boolean(
    instance &&
      typeof instance === 'object' &&
      instance.InstanceId === resource.id &&
      instance.State?.Name === 'terminated',
  );
}

// plugins/aws/src/ce/ebs-retirement.ts
var INSTANCE = /^i-[0-9a-f]{8}(?:[0-9a-f]{9})?$/;
var DEVICE = /^\/dev\/[a-zA-Z0-9._-]{1,32}$/;
function object3(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed AWS EBS volume evidence');
  return value;
}
function awsEbsVolume(state, id) {
  if (['NextToken', 'NextMarker', 'nextToken'].some((key) => Object.hasOwn(state, key)))
    throw Error('Incomplete AWS EBS volume collection');
  if (!Array.isArray(state.Volumes) || state.Volumes.length > 1) throw Error('Ambiguous AWS EBS volume collection');
  if (!state.Volumes.length) return;
  const row = object3(state.Volumes[0]);
  if (
    row.VolumeId !== id ||
    typeof row.State !== 'string' ||
    !['creating', 'available', 'in-use', 'deleting', 'deleted', 'error'].includes(row.State) ||
    !Array.isArray(row.Attachments) ||
    row.Attachments.length > 1
  )
    throw Error('Malformed or foreign AWS EBS volume identity/state');
  const attachments = row.Attachments.map((value) => {
    const attachment = object3(value);
    if (
      attachment.VolumeId !== id ||
      typeof attachment.InstanceId !== 'string' ||
      !INSTANCE.test(attachment.InstanceId) ||
      typeof attachment.Device !== 'string' ||
      !DEVICE.test(attachment.Device) ||
      !['attaching', 'attached', 'detaching', 'detached', 'busy'].includes(String(attachment.State))
    )
      throw Error('Malformed AWS EBS volume attachment');
    return { instanceId: attachment.InstanceId, device: attachment.Device, state: String(attachment.State) };
  });
  if (
    (row.State === 'in-use' && attachments.length !== 1) ||
    (['available', 'deleted'].includes(row.State) && attachments.length !== 0)
  )
    throw Error('Inconsistent AWS EBS volume state/attachments');
  return { state: row.State, attachments };
}
function assertAwsEbsVolumeAvailable(resource) {
  const volume = awsEbsVolume(resource.state, resource.id);
  if (volume?.state !== 'available' || volume.attachments.length)
    throw Error('AWS EBS volume must be available and unattached before deletion; resume with the same plan');
}
function assertAwsEbsTeardown(intent, observation) {
  const ownedInstances = observation.resources.filter(
    (r) => r.owned && r.exists && r.id.startsWith('i-') && !isAwsTerminatedOwnedInstance(r, intent.accountId),
  );
  const instances = ownedInstances.flatMap((resource) => {
    const reservations = resource.state.Reservations;
    if (!Array.isArray(reservations)) return [];
    return reservations.flatMap((value) => {
      const reservation = object3(value);
      if (!Array.isArray(reservation.Instances)) throw Error('Malformed AWS EBS instance evidence');
      return reservation.Instances.map((value) => ({ resource, reservation, row: object3(value) }));
    });
  });
  for (const resource of observation.resources.filter((r) => r.owned && r.id.startsWith('vol-'))) {
    if (!resource.exists) throw Error('AWS EBS volume ownership contradicts absence');
    const volume = awsEbsVolume(resource.state, resource.id);
    if (!volume || !['available', 'in-use'].includes(volume.state))
      throw Error('AWS EBS volume is not ready for retirement');
    if (volume.state === 'available') continue;
    const attachment = volume.attachments[0];
    const matches = instances.filter(
      (i) => i.resource.id === attachment.instanceId && i.row.InstanceId === attachment.instanceId,
    );
    if (matches.length !== 1 || matches[0].reservation.OwnerId !== intent.accountId || attachment.state !== 'attached')
      throw Error('AWS EBS volume attachment is outside the exact owned instance');
    const instance = matches[0];
    if (
      resource.region !== instance.resource.region ||
      ['xcsh-managed-by', 'xcsh-execution-engine', 'xcsh-deployment-id', 'xcsh-plan-sha256'].some(
        (key) => resource.tags[key] !== instance.resource.tags[key],
      ) ||
      resource.tags['xcsh-node-index'] !== instance.resource.tags['xcsh-node-index'] ||
      !/^[1-3]$/.test(resource.tags['xcsh-node-index'] ?? '')
    )
      throw Error('AWS EBS volume/node ownership joins differ');
    const mappings = instance.row.BlockDeviceMappings;
    if (!Array.isArray(mappings)) throw Error('Missing AWS EBS instance block-device mappings');
    const joined = mappings.map(object3).filter((m) => object3(m.Ebs).VolumeId === resource.id);
    if (
      joined.length !== 1 ||
      joined[0].DeviceName !== attachment.device ||
      object3(joined[0].Ebs).Status !== 'attached' ||
      typeof object3(joined[0].Ebs).DeleteOnTermination !== 'boolean'
    )
      throw Error('AWS EBS volume/device/DeleteOnTermination mapping differs');
  }
  for (const { resource, row } of instances) {
    if (!Array.isArray(row.BlockDeviceMappings)) continue;
    for (const mapping of row.BlockDeviceMappings.map(object3)) {
      const ebs = object3(mapping.Ebs);
      if (!observation.resources.some((d) => d.id === ebs.VolumeId && d.exists && d.owned && d.id.startsWith('vol-')))
        throw Error(`AWS EBS volume evidence is missing or foreign for owned instance ${resource.id}`);
    }
  }
}
function awsEbsInstanceVolumeIds(resource) {
  const reservations = resource.state.Reservations;
  if (!Array.isArray(reservations)) throw Error('Missing AWS EBS instance collection');
  const rows = reservations.flatMap((value) => {
    const reservation = object3(value);
    if (!Array.isArray(reservation.Instances)) throw Error('Malformed AWS EBS instance collection');
    return reservation.Instances.map(object3);
  });
  if (rows.length !== 1 || rows[0].InstanceId !== resource.id) throw Error('Ambiguous AWS EBS instance identity');
  if (rows[0].BlockDeviceMappings === undefined) return [];
  if (!Array.isArray(rows[0].BlockDeviceMappings)) throw Error('Malformed AWS EBS block-device mappings');
  const ids = rows[0].BlockDeviceMappings.map((value) => object3(object3(value).Ebs).VolumeId);
  if (
    ids.some((id) => typeof id !== 'string' || !/^vol-[0-9a-f]{8}(?:[0-9a-f]{9})?$/.test(id)) ||
    new Set(ids).size !== ids.length
  )
    throw Error('Malformed or duplicate AWS EBS volume mapping IDs');
  return ids.map(String);
}

// plugins/platform/src/ce/initial-versions.ts
function initialSoftwareSettings(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !['software', 'os'].includes(key)) ||
    typeof value.software !== 'string' ||
    !/^crt-\d{8}-\d{4}$/.test(value.software) ||
    typeof value.os !== 'string' ||
    !/^\d+\.\d{4}\.\d+$/.test(value.os)
  )
    throw new Error('Initial software and OS versions must be an explicit version pair');
  return { os: { operating_system_version: value.os }, sw: { volterra_software_version: value.software } };
}

export {
  AWS_CE_DEFAULT_INTERFACE_MTU,
  AWS_CE_F5_GUIDE_URL,
  AWS_CE_MARKETPLACE_PRODUCT_ID,
  AWS_CE_MIN_UPGRADE_SAFE_ROOT_VOLUME_GIB,
  AWS_CE_SCHEMA_VERSION,
  AWS_CE_SHARED_CONTRACT_URL,
  AWS_CE_SSM_PARAMETER,
  AWS_CE_TGW_GUIDE_URL,
  acquireProcessLock,
  assertAwsAdminPrebootDevices,
  assertAwsBootstrapKeyPair,
  assertAwsEbsTeardown,
  assertAwsEbsVolumeAvailable,
  awsEbsInstanceVolumeIds,
  awsEbsVolume,
  awsInitialAdminSettings,
  initialSoftwareSettings,
  isAwsTerminatedOwnedInstance,
  loadAwsCheckpoint,
  loadAwsDiscovery,
  loadAwsPlan,
  normalizeAwsAdminSshPublicKey,
  normalizeAwsBootstrapKeyPairName,
  observeAwsBootstrapKeyPairs,
  revalidateAwsBootstrapKeyPair,
  saveAwsCheckpoint,
  saveAwsDiscovery,
  saveAwsPlan,
  selectAwsBootstrapKeyPair,
  verifyAwsCePlan,
};
