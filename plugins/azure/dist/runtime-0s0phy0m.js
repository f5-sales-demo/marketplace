// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun

// plugins/azure/src/ce/artifacts.ts
import { lstat as lstat2, readdir, readFile as readFile4, realpath } from 'node:fs/promises';
import { basename as basename2, dirname as dirname2, join as join3, resolve } from 'node:path';
import {
  canonicalEqual,
  canonicalSha256,
  canonicalStringify,
  fingerprintDeploymentObservation,
  fingerprintObservation,
  safeHexEqual,
  sha256Hex,
} from './runtime-6j4b2rhv.js';

// plugins/azure/src/ce/greenfield-udr-ownership.ts
function require2(value) {
  if (!value) throw Error('Greenfield UDR ownership is unavailable or differs from the approved plan');
}
function object(value) {
  require2(value && typeof value === 'object' && !Array.isArray(value));
  return value;
}
async function assertAzureGreenfieldUdrAssociationOwnership(source, selected, api, signal) {
  const plan = structuredClone(source),
    action = structuredClone(selected);
  verifyAzureCePlan(plan);
  const udr = plan.routing.udr;
  require2(
    udr &&
      plan.intent.operation === 'deploy' &&
      plan.routing.mode === 'udr' &&
      action.kind === 'route-association-update' &&
      plan.actions.some((row) => canonicalSha256(row) === canonicalSha256(action)),
  );
  const vnetId = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network/virtualNetworks/${plan.deploymentName}-vnet`,
    tableId = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network/routeTables/${plan.deploymentName}-rt`;
  const nic = plan.nics.find(
    (row) =>
      udr.subnetNames.includes(row.subnet.name ?? '') && action.resourceId === `${vnetId}/subnets/${row.subnet.name}`,
  );
  require2(
    nic &&
      nic.subnet.mode === 'greenfield' &&
      plan.actions.some((row) => row.kind === 'subnet-create' && row.resourceId === action.resourceId),
  );
  const execute = api.exec,
    deadline = AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]);
  const read = async (args, id) => {
    deadline.throwIfAborted();
    require2(api.exec === execute);
    const abort = Promise.withResolvers(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([
        execute.call(
          api,
          'az',
          [...args, 'show', '--ids', id, '--subscription', plan.subscription.id, '--output', 'json'],
          { signal: deadline },
        ),
        abort.promise,
      ]);
      deadline.throwIfAborted();
      require2(api.exec === execute && result.exitCode === 0);
      let raw;
      try {
        raw = JSON.parse(result.stdout);
      } catch {
        throw Error('Greenfield UDR ownership evidence is malformed');
      }
      const row = object(raw);
      require2(row.id === id && row.provisioningState === 'Succeeded' && !row.nextLink && !row.error && !row.errors);
      return row;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  for (const [args, id] of [
    [['network', 'vnet'], vnetId],
    [['network', 'route-table'], tableId],
  ]) {
    const value = await read([...args], id),
      tags = object(value.tags);
    require2(value.location === plan.region);
    for (const [key, expected] of Object.entries({
      'xcsh-managed-by': 'azure-ce',
      'xcsh-execution-engine': plan.engine,
      'xcsh-deployment-id': plan.deploymentName,
      'xcsh-plan-sha256': plan.planSha256,
    }))
      require2(tags[key] === expected);
  }
  const subnet = await read(['network', 'vnet', 'subnet'], action.resourceId);
  const prefixes =
    subnet.addressPrefixes ?? (typeof subnet.addressPrefix === 'string' ? [subnet.addressPrefix] : undefined);
  require2(
    Array.isArray(prefixes) &&
      prefixes.length === 1 &&
      prefixes[0] === nic.subnet.cidr &&
      (subnet.addressPrefix === undefined || subnet.addressPrefix === nic.subnet.cidr) &&
      (subnet.routeTable === undefined || subnet.routeTable === null || object(subnet.routeTable).id === tableId),
  );
}

// plugins/azure/src/ce/relay-plan.ts
// plugins/azure/src/ce/planner.ts
import { isIP as isIP3, isIP as isIP7 } from 'node:net';

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

// plugins/azure/src/ce/image-hardware-compatibility.ts
var object2 = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
var architecture = (value) => {
  if (typeof value !== 'string') return 'unknown';
  const result = value.trim().toLowerCase();
  return result === 'x64' || result === 'arm64' ? result : 'unknown';
};
function readAzureImageHardware(raw, expected) {
  const row = object2(raw),
    [publisher, offer, sku, version, extra] = expected.urn.split(':');
  const id = `/subscriptions/${expected.subscriptionId}/providers/Microsoft.Compute/locations/${expected.region}/publishers/${publisher}/artifacttypes/VMImage/offers/${offer}/skus/${sku}/versions/${version}`;
  if (
    extra !== undefined ||
    !publisher ||
    !offer ||
    !sku ||
    !version ||
    typeof row.id !== 'string' ||
    row.id.toLowerCase() !== id.toLowerCase() ||
    row.name !== version ||
    typeof row.location !== 'string' ||
    row.location.toLowerCase() !== expected.region.toLowerCase()
  )
    return { architecture: 'unknown', hyperVGeneration: 'unknown' };
  return {
    architecture: architecture(row.architecture),
    hyperVGeneration: row.hyperVGeneration === 'V1' || row.hyperVGeneration === 'V2' ? row.hyperVGeneration : 'unknown',
  };
}
function readAzureSkuHardware(raw) {
  const rows = Array.isArray(object2(raw).capabilities) ? object2(raw).capabilities.map(object2) : [];
  const capability = (name) => {
    const matching = rows.filter(
      (row) => typeof row.name === 'string' && row.name.toLowerCase() === name.toLowerCase(),
    );
    return matching.length === 1 ? matching[0].value : undefined;
  };
  const generations = capability('HyperVGenerations');
  const values = typeof generations === 'string' ? generations.split(',').map((value) => value.trim()) : [];
  const valid =
    values.length > 0 &&
    values.length <= 2 &&
    new Set(values).size === values.length &&
    values.every((value) => value === 'V1' || value === 'V2');
  return {
    architecture: architecture(capability('CpuArchitectureType')),
    hyperVGenerations: valid ? values.sort() : undefined,
  };
}
function classifyAzureImageHardwareCompatibility(image, sku) {
  if (
    !['x64', 'arm64'].includes(image.architecture ?? '') ||
    !['x64', 'arm64'].includes(sku.architecture ?? '') ||
    !['V1', 'V2'].includes(image.hyperVGeneration ?? '') ||
    !Array.isArray(sku.hyperVGenerations) ||
    !sku.hyperVGenerations.length ||
    new Set(sku.hyperVGenerations).size !== sku.hyperVGenerations.length ||
    sku.hyperVGenerations.some((value) => value !== 'V1' && value !== 'V2')
  )
    return 'unknown';
  return image.architecture === sku.architecture && sku.hyperVGenerations.includes(image.hyperVGeneration)
    ? 'compatible'
    : 'incompatible';
}

// plugins/azure/src/ce/network-forwarding-expectations.ts
// plugins/platform/src/ce/forwarding-route.ts
import { isIP, isIP as isIP2 } from 'node:net';

function require3(value) {
  if (!value) throw Error('Forwarding route schema, identity or evidence is unqualified');
}
var label = (v) => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(v) && !v.includes('__');
var types = ['REMOTE_SITE_ROUTE', 'LOCAL_ROUTE', 'STATIC_ROUTE', 'BGP_ROUTE'];
function prefix(value) {
  if (typeof value !== 'string') return false;
  const [ip, bits, extra] = value.split('/');
  if (isIP(ip) !== 4 || !/^(?:[0-9]|[12][0-9]|3[0-2])$/.test(bits ?? '') || extra !== undefined) return false;
  const address = ip.split('.').reduce((v, o) => v * 256 + Number(o), 0);
  return address % 2 ** (32 - Number(bits)) === 0;
}
function validateExpectedForwardingRoutes(expected, nodes) {
  require3(
    typeof expected.siteUid === 'string' &&
      expected.siteUid.trim() === expected.siteUid &&
      expected.siteUid.length > 0 &&
      expected.siteUid.length <= 1024 &&
      Array.isArray(expected.interfaces) &&
      expected.interfaces.length === nodes.length * 2 &&
      Array.isArray(expected.routes) &&
      expected.routes.length >= nodes.length * 2 &&
      expected.routes.length <= 1024,
  );
  const macs = new Set(),
    devices = new Set(),
    names = new Set(),
    roles = new Set();
  for (const v of expected.interfaces) {
    require3(
      nodes.includes(v.node) &&
        ['slo', 'sli'].includes(v.role) &&
        label(v.device) &&
        label(v.interfaceName) &&
        /^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(v.mac) &&
        v.mac !== '00:00:00:00:00:00' &&
        (Number.parseInt(v.mac.slice(0, 2), 16) & 1) === 0 &&
        !macs.has(v.mac) &&
        !devices.has(`${v.node}/${v.device}`) &&
        !names.has(v.interfaceName) &&
        !roles.has(`${v.node}/${v.role}`),
    );
    macs.add(v.mac);
    devices.add(`${v.node}/${v.device}`);
    names.add(v.interfaceName);
    roles.add(`${v.node}/${v.role}`);
  }
  const routes = new Set();
  for (const v of expected.routes) {
    const key = JSON.stringify([v.node, v.role, v.prefix]);
    require3(roles.has(`${v.node}/${v.role}`) && prefix(v.prefix) && types.includes(v.routeType) && !routes.has(key));
    routes.add(key);
  }
  require3(expected.interfaces.every((v) => expected.routes.some((r) => r.node === v.node && r.role === v.role)));
}

// plugins/platform/src/ce/upgrade-evidence.ts
function object3(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed upgrade evidence');
  return value;
}
function text(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Missing upgrade evidence');
  return value;
}
function parseUpgradePrechecks(raw) {
  const list = object3(raw).checklist;
  if (!Array.isArray(list) || !list.length) throw new Error('Missing upgrade prechecks');
  const seen = new Set();
  const checks = list.map((value) => {
    const row = object3(value),
      name = text(row.item),
      status = text(row.status);
    if (
      seen.has(name) ||
      !['CHECKLIST_UNKNOWN', 'CHECKLIST_PASSED', 'CHECKLIST_WARNING', 'CHECKLIST_FAILED'].includes(status)
    )
      throw new Error('Duplicate or unknown upgrade precheck');
    seen.add(name);
    return { name, status };
  });
  return { checks, passing: checks.every((check) => ['CHECKLIST_PASSED', 'CHECKLIST_WARNING'].includes(check.status)) };
}
function parseSoftwareTargets(raw) {
  const values = object3(raw).sw_versions;
  if (
    !Array.isArray(values) ||
    values.some((value) => typeof value !== 'string' || !/^crt-\d{8}-\d{4}$/.test(value)) ||
    new Set(values).size !== values.length
  )
    throw new Error('Missing or malformed software upgrade targets');
  return values;
}

// plugins/platform/src/ce/wire-upgrade.ts
function buildSiteUpgradeRequest(input, validate) {
  if (
    !input ||
    Object.keys(input).some((key) => !['siteName', 'kind', 'version'].includes(key)) ||
    typeof input.siteName !== 'string' ||
    !/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(input.siteName) ||
    !['software', 'os'].includes(input.kind) ||
    typeof input.version !== 'string' ||
    !(input.kind === 'software' ? /^crt-\d{8}-\d{4}$/ : /^\d+\.\d{4}\.\d+$/).test(input.version)
  )
    throw new Error('An upgrade requires an exact site, operation and version');
  const body = { namespace: 'system', name: input.siteName, version: input.version, force: false };
  validate(body);
  return {
    method: 'POST',
    path: `/api/config/namespaces/system/sites/${input.siteName}/upgrade_${input.kind === 'software' ? 'sw' : 'os'}`,
    body,
  };
}

// plugins/platform/src/ce/upgrade-transition.ts
var same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
function matchesVersionIdentity(expected, observation) {
  if (observation.status !== 'observed') return false;
  const { binding } = expected;
  if (
    typeof expected.siteUid !== 'string' ||
    !expected.siteUid.trim() ||
    typeof expected.physicalSiteUid !== 'string' ||
    !expected.physicalSiteUid.trim() ||
    observation.siteUid !== expected.siteUid ||
    observation.physicalSiteUid !== expected.physicalSiteUid ||
    observation.siteName !== binding.siteName ||
    observation.source !== `/api/config/namespaces/system/sites/${binding.siteName}` ||
    !Array.isArray(binding.nodes) ||
    !binding.nodes.length ||
    binding.nodes.some((node) => typeof node !== 'string' || !node.trim()) ||
    !['native', 'terraform'].includes(binding.owner.engine) ||
    !['aws', 'azure'].includes(binding.owner.provider) ||
    new Set(binding.nodes).size !== binding.nodes.length ||
    !same(observation.nodes, binding.nodes) ||
    ['deploymentId', 'engine', 'provider', 'account', 'region'].some(
      (key) =>
        typeof binding.owner[key] !== 'string' ||
        !binding.owner[key].trim() ||
        observation.owner[key] !== binding.owner[key],
    ) ||
    !['contractFingerprint', 'siteContractFingerprint'].every(
      (key) => /^sha256:[a-f0-9]{64}$/.test(expected[key]) && observation[key] === expected[key],
    )
  )
    return false;
  const start = Date.parse(observation.startedAt),
    end = Date.parse(observation.observedAt),
    now = Date.now();
  if (![start, end].every(Number.isFinite) || start > end || end > now || now - start > 60000) return false;
  if (new Date(start).toISOString() !== observation.startedAt || new Date(end).toISOString() !== observation.observedAt)
    return false;
  if (observation.online !== (observation.siteState === 'ONLINE')) return false;
  initialSoftwareSettings({ software: observation.software.installed, os: observation.os.installed });
  return true;
}
function assessCeUpgradeTransition(expected, observation) {
  try {
    initialSoftwareSettings(expected.before);
    if (Object.keys(expected.target).sort().join(',') !== 'kind,version') return 'unknown';
    buildSiteUpgradeRequest({ siteName: expected.binding.siteName, ...expected.target }, () => {});
    const kind = expected.target.kind,
      other = kind === 'software' ? 'os' : 'software';
    if (expected.target.version === expected.before[kind]) return 'unknown';
    if (!matchesVersionIdentity(expected, observation)) return 'unknown';
    const targetSoftware = kind === 'software' ? expected.target.version : expected.before.software;
    if (observation.targetSoftware !== targetSoftware) return 'unknown';
    const selected = observation[kind],
      unchanged = observation[other];
    if (unchanged.installed !== expected.before[other] || unchanged.phase !== 'UPGRADE_COMPLETED') return 'unknown';
    if (![expected.before[kind], expected.target.version].includes(selected.installed)) return 'unknown';
    if (observation.siteState === 'FAILED' || selected.phase === 'UPGRADE_FAILED') return 'failed';
    if (
      kind === 'software' &&
      observation.progress.version === expected.target.version &&
      observation.progress.status === 'FAILED'
    )
      return 'failed';
    if (
      selected.installed === expected.target.version &&
      selected.phase === 'UPGRADE_COMPLETED' &&
      observation.online
    ) {
      if (
        kind === 'software' &&
        (observation.progress.version !== expected.target.version || observation.progress.status !== 'COMPLETED')
      )
        return 'unknown';
      return 'versions-complete';
    }
    if (
      ['UPGRADE_TRIGGERED', 'UPGRADE_IN_PROGRESS'].includes(selected.phase) &&
      ['ONLINE', 'UPGRADING'].includes(observation.siteState)
    ) {
      if (
        kind === 'software' &&
        (observation.progress.version !== expected.target.version ||
          !['SCHEDULED', 'IN_PROGRESS'].includes(observation.progress.status))
      )
        return 'unknown';
      return 'converging';
    }
    if (selected.installed !== expected.before[kind] || selected.phase !== 'UPGRADE_COMPLETED' || !observation.online)
      return 'unknown';
    if (observation.progress.version !== expected.before.software || observation.progress.status !== 'COMPLETED')
      return 'unknown';
    const prechecks = parseUpgradePrechecks({
      checklist: observation.prechecks.checks.map((check) => ({ item: check.name, status: check.status })),
    });
    if (!prechecks.passing) return 'unknown';
    const targets = parseSoftwareTargets({ sw_versions: observation.targets });
    if (
      kind === 'software' ? !targets.includes(expected.target.version) : selected.available !== expected.target.version
    )
      return 'unknown';
    return 'ready';
  } catch {
    return 'unknown';
  }
}

// plugins/platform/src/ce/process-lock.ts
import { execFile } from 'node:child_process';
// plugins/terraform/src/ce-upgrade.ts
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
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

// plugins/terraform/src/ce-upgrade.ts
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
var digest = (value) => createHash('sha256').update(value).digest('hex');
var hash = (value) => digest(canonical(value));
var sameHash = (left, right) =>
  /^[a-f0-9]{64}$/.test(left) &&
  /^[a-f0-9]{64}$/.test(right) &&
  timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
async function optional(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return;
  }
}
function validateActionReceipt(upgrade, receipt) {
  if (
    receipt.schemaVersion !== 1 ||
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== upgrade.deployment.deploymentId ||
    receipt.backendIdentity !== upgrade.deployment.backendIdentity ||
    receipt.configurationSha256 !== digest(upgrade.deployment.configuration) ||
    receipt.providerLockSha256 !== digest(upgrade.deployment.providerLock) ||
    receipt.operation ||
    receipt.noChanges ||
    receipt.changes.length ||
    receipt.actionInvocations?.length !== 1 ||
    hash(receipt.actionInvocations[0]) !== hash(upgrade.action) ||
    !/^[a-f0-9]{64}$/.test(receipt.planSha256)
  )
    throw new Error('Terraform upgrade saved action plan differs');
}
async function runTerraformCeUpgrade(
  input,
  authorizedPlanSha256,
  verify,
  runtime,
  contract,
  terraform,
  storage,
  env,
  signal,
) {
  const upgrade = structuredClone(input);
  if (upgrade.schemaVersion !== 2 || upgrade.engine !== 'terraform')
    throw new Error('Terraform upgrade schema is obsolete; prepare a new v2 plan');
  await verify(upgrade);
  if (!sameHash(upgrade.planSha256, authorizedPlanSha256))
    throw new Error('Exact Terraform upgrade authorization is required');
  if (
    runtime.engine !== 'terraform' ||
    storage.owner.engine !== 'terraform' ||
    hash(storage.owner) !== hash(upgrade.expectation.binding.owner)
  )
    throw new Error('Only the owning Terraform engine may upgrade this site');
  const release = await acquireProcessLock(`${storage.directory}/.upgrade-lock`);
  try {
    signal?.throwIfAborted();
    await storage.verify();
    const sourceName = `${upgrade.planId}.json`;
    const saved = await optional(storage, sourceName);
    if (saved === undefined) await storage.write(sourceName, upgrade);
    else if (hash(saved) !== hash(upgrade)) throw new Error('Saved Terraform upgrade source differs');
    const checkpointName = `${upgrade.planId}-checkpoint.json`;
    let checkpoint = await optional(storage, checkpointName);
    if (checkpoint === undefined) {
      checkpoint = {
        schemaVersion: 2,
        engine: 'terraform',
        sourcePlanSha256: upgrade.sourcePlanSha256,
        upgradePlanSha256: upgrade.planSha256,
        phase: 'ready',
      };
      await storage.write(checkpointName, checkpoint);
    }
    if (
      checkpoint.schemaVersion !== 2 ||
      checkpoint.engine !== 'terraform' ||
      checkpoint.sourcePlanSha256 !== upgrade.sourcePlanSha256 ||
      checkpoint.upgradePlanSha256 !== upgrade.planSha256 ||
      !['ready', 'submitted', 'complete'].includes(checkpoint.phase) ||
      (checkpoint.phase === 'ready' && checkpoint.actionPlanSha256 !== undefined) ||
      (checkpoint.phase !== 'ready' && !/^[a-f0-9]{64}$/.test(checkpoint.actionPlanSha256 ?? ''))
    )
      throw new Error('Terraform upgrade checkpoint differs');
    let serial = await optional(storage, 'terraform-ce-upgrade-serial.json');
    if (serial === undefined) serial = { schemaVersion: 2, engine: 'terraform', status: 'idle' };
    if (
      serial.schemaVersion !== 2 ||
      serial.engine !== 'terraform' ||
      !['active', 'idle'].includes(serial.status) ||
      (serial.status === 'idle' && (serial.activePlanId !== undefined || serial.activePlanSha256 !== undefined)) ||
      (serial.lastPlanId === undefined) !== (serial.lastPlanSha256 === undefined) ||
      (serial.lastPlanSha256 !== undefined && !/^[a-f0-9]{64}$/.test(serial.lastPlanSha256)) ||
      (serial.status === 'active' &&
        (serial.activePlanId !== upgrade.planId || serial.activePlanSha256 !== upgrade.planSha256))
    )
      throw new Error('Another site upgrade is active or the serial ledger differs');
    if (serial.status === 'idle' && checkpoint.phase !== 'complete') {
      serial = {
        schemaVersion: 2,
        engine: 'terraform',
        status: 'active',
        activePlanId: upgrade.planId,
        activePlanSha256: upgrade.planSha256,
        lastPlanId: serial.lastPlanId,
        lastPlanSha256: serial.lastPlanSha256,
      };
      await storage.write('terraform-ce-upgrade-serial.json', serial);
    }
    const observe = () =>
      runtime.observeUpgrade(
        upgrade.expectation.binding,
        contract,
        upgrade.expectation.target.kind === 'software' ? upgrade.expectation.target.version : undefined,
        signal,
      );
    let observation = await observe();
    let transition = assessCeUpgradeTransition(upgrade.expectation, observation);
    let session;
    const completeApplication = async (action) => {
      session ??= await terraform.open(storage.owner, upgrade.deployment, 'current', env, signal);
      const state = await session.readPlanApplicationState(action);
      if (assessCeUpgradeTransition(upgrade.expectation, observation) !== 'versions-complete')
        throw new Error('Terraform upgrade completion evidence is no longer current');
      if (state === 'planned') throw new Error('Terraform upgrade action was not submitted');
      if (state === 'applying') {
        await session.reconcileApplyFromEvidence(
          action,
          hash({
            owner: storage.owner,
            sourcePlanSha256: upgrade.sourcePlanSha256,
            upgradePlanSha256: upgrade.planSha256,
            action,
            observation,
          }),
        );
        if ((await session.readPlanApplicationState(action)) !== 'applied')
          throw new Error('Terraform upgrade application reconciliation did not converge');
      } else if (state !== 'applied') throw new Error('Terraform upgrade application state is unknown');
    };
    const releaseSerial = async () => {
      await storage.write('terraform-ce-upgrade-serial.json', {
        schemaVersion: 2,
        engine: 'terraform',
        status: 'idle',
        lastPlanId: upgrade.planId,
        lastPlanSha256: upgrade.planSha256,
      });
    };
    if (checkpoint.phase === 'complete') {
      if (transition !== 'versions-complete') throw new Error('Completed Terraform upgrade version evidence regressed');
      const action = await storage.read(`${upgrade.planId}-action-plan.json`);
      validateActionReceipt(upgrade, action);
      if (action.planSha256 !== checkpoint.actionPlanSha256) throw new Error('Completed upgrade action plan differs');
      const receipt = await storage.read(`${upgrade.planId}-receipt.json`);
      if (
        receipt.status !== 'upgrade-complete' ||
        receipt.engine !== 'terraform' ||
        receipt.planId !== upgrade.planId ||
        receipt.planSha256 !== upgrade.planSha256 ||
        receipt.siteName !== upgrade.expectation.binding.siteName ||
        hash(receipt.target) !== hash(upgrade.expectation.target) ||
        receipt.actionPlanSha256 !== checkpoint.actionPlanSha256 ||
        receipt.nodeHealth !== 'unknown' ||
        receipt.routing !== 'unknown' ||
        receipt.traffic !== 'unknown'
      )
        throw new Error('Completed Terraform upgrade receipt differs');
      await completeApplication(action);
      await releaseSerial();
      return receipt;
    }
    if (transition === 'failed') throw new Error('Terraform upgrade failed');
    if (checkpoint.phase === 'ready' && transition === 'unknown')
      throw new Error('Terraform upgrade evidence is unknown');
    if (checkpoint.phase === 'ready' && transition === 'versions-complete') {
      serial = {
        schemaVersion: 2,
        engine: 'terraform',
        status: 'idle',
        lastPlanId: upgrade.planId,
        lastPlanSha256: upgrade.planSha256,
      };
      await storage.write('terraform-ce-upgrade-serial.json', serial);
      return { status: 'target-already-complete', planId: upgrade.planId, planSha256: upgrade.planSha256 };
    }
    if (checkpoint.phase === 'ready' && transition !== 'ready')
      throw new Error('Upgrade began outside the authorized Terraform action');
    if (checkpoint.phase === 'ready') {
      try {
        session = await terraform.open(storage.owner, upgrade.deployment, false, env, signal);
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        session = await terraform.open(storage.owner, upgrade.deployment, 'current', env, signal);
      }
      const action = await session.planAction(upgrade.action, env, signal);
      validateActionReceipt(upgrade, action);
      await storage.write(`${upgrade.planId}-action-plan.json`, action);
      await storage.verify();
      observation = await observe();
      transition = assessCeUpgradeTransition(upgrade.expectation, observation);
      if (transition !== 'ready') throw new Error('Terraform upgrade readiness changed before submission');
      checkpoint = { ...checkpoint, phase: 'submitted', actionPlanSha256: action.planSha256 };
      await storage.write(checkpointName, checkpoint);
      await session.apply(action, env, signal);
      observation = await observe();
      transition = assessCeUpgradeTransition(upgrade.expectation, observation);
    } else {
      const action = await storage.read(`${upgrade.planId}-action-plan.json`);
      validateActionReceipt(upgrade, action);
      if (action.planSha256 !== checkpoint.actionPlanSha256) throw new Error('Submitted upgrade action plan differs');
    }
    if (transition !== 'versions-complete') {
      if (transition === 'unknown')
        return {
          status: 'upgrade-convergence-unknown',
          planId: upgrade.planId,
          planSha256: upgrade.planSha256,
        };
      if (!['ready', 'converging'].includes(transition)) throw new Error('Terraform upgrade convergence is unknown');
      return { status: 'upgrade-converging', planId: upgrade.planId, planSha256: upgrade.planSha256 };
    }
    const completedAction = await storage.read(`${upgrade.planId}-action-plan.json`);
    validateActionReceipt(upgrade, completedAction);
    if (completedAction.planSha256 !== checkpoint.actionPlanSha256)
      throw new Error('Completed upgrade action plan differs');
    await completeApplication(completedAction);
    const receipt = {
      status: 'upgrade-complete',
      engine: 'terraform',
      planId: upgrade.planId,
      planSha256: upgrade.planSha256,
      siteName: upgrade.expectation.binding.siteName,
      target: upgrade.expectation.target,
      actionPlanSha256: checkpoint.actionPlanSha256,
      observedAt: new Date().toISOString(),
      nodeHealth: 'unknown',
      routing: 'unknown',
      traffic: 'unknown',
    };
    await storage.write(`${upgrade.planId}-receipt.json`, receipt);
    checkpoint = { ...checkpoint, phase: 'complete' };
    await storage.write(checkpointName, checkpoint);
    await releaseSerial();
    return receipt;
  } finally {
    await release();
  }
}

// plugins/terraform/src/provider-lock.ts
import { createHash as createHash2 } from 'node:crypto';
import { readFile as readFile2 } from 'node:fs/promises';

var XCSH_PROVIDER_VERSION = '15.12.1';
var XCSH_PROVIDER_LOCK_SHA256 = '6d9fd709ee430d66bfa6de99dbbbafca2801eb8471201e6c282102fb3bd1a782';
async function loadXcshProviderLock() {
  const value = await readFile2(new URL('./assets/plugins/terraform/locks/xcsh-provider.hcl', import.meta.url), 'utf8');
  if (createHash2('sha256').update(value).digest('hex') !== XCSH_PROVIDER_LOCK_SHA256)
    throw new Error('Published XC provider lock changed');
  return value;
}

// plugins/azure/src/ce/terraform-foundation.ts
import { readFile as readFile3 } from 'node:fs/promises';

// plugins/terraform/src/ce-execution-contract.ts
var CE_TERRAFORM_VERSION = '1.17.2';

// plugins/azure/src/ce/apply.ts
function assertObservationFresh(plan, current, expectedFingerprint = plan.observationFingerprint) {
  const fingerprint = fingerprintCurrentObservation(plan, current);
  if (!safeHexEqual(expectedFingerprint, fingerprint)) {
    throw new Error(
      `Stale Azure CE plan: observations changed (expected ${expectedFingerprint}, current ${fingerprint})`,
    );
  }
}
function assertApplyAllowed(plan, request) {
  const executionEngine = request.executionEngine ?? 'native';
  if (plan.engine !== executionEngine)
    throw new Error(`${plan.engine === 'terraform' ? 'Terraform' : 'Native'} CE plan execution engine differs`);
  if (request.planId !== plan.planId) throw new Error('The requested plan ID does not match the persisted plan');
  if (!safeHexEqual(request.planSha256, plan.planSha256))
    throw new Error('The requested plan hash does not match the persisted plan');
  if (!request.hasUI && request.authorization?.apply !== true && request.env.XCSH_CE_HEADLESS_MUTATIONS !== '1') {
    throw new Error('Headless Azure CE mutations require XCSH_CE_HEADLESS_MUTATIONS=1');
  }
  if (
    plan.intent.operation === 'teardown' &&
    !request.hasUI &&
    request.authorization?.destroy !== true &&
    request.env.XCSH_CE_ALLOW_DESTROY !== '1'
  ) {
    throw new Error('Headless teardown requires XCSH_CE_ALLOW_DESTROY=1');
  }
  if (plan.actions.some((action) => action.kind === 'marketplace-terms-accept'))
    throw new Error('Marketplace terms must be signed only by the exact initial Terraform foundation action');
  assertAzureCeRoutingExecutable(plan);
}
function assertAzureCeRoutingExecutable(plan) {
  if (plan.intent.operation !== 'deploy') return;
  if (plan.routing.mode === 'route-server' && plan.routing.destinationCidrs.length === 0)
    throw new Error('Azure Route Server execution requires at least one expected learned prefix');
  if (
    plan.routing.mode === 'udr' &&
    plan.routing.destinationCidrs.length > 0 &&
    plan.intent.brownfield.routeChanges.length === 0 &&
    !plan.routing.udr
  )
    throw new Error(
      'Azure UDR destinations require explicit routeChanges with the target subnet association; an unattached route table is not executable',
    );
}
function resolveActionArgs(args, planSha256, replacements = {}) {
  return args.map((arg) => {
    if (arg === '__PLAN_SHA256__') return planSha256;
    if (arg.includes('__PLAN_SHA256__')) return arg.replaceAll('__PLAN_SHA256__', planSha256);
    return replacements[arg] ?? arg;
  });
}
var CREATE_KINDS = new Set([
  'resource-group-create',
  'vnet-create',
  'subnet-create',
  'nsg-create',
  'nsg-rule-create',
  'public-ip-create',
  'nic-create',
  'vm-create',
  'route-table-create',
  'route-server-create',
  'route-server-peer-create',
]);
var OWNED_MUTATION_KINDS = new Set(['vm-start', 'vm-stop', 'vm-deallocate', 'vm-resize', 'vm-delete', 'nic-update']);
var PARENT_OWNED_MUTATION_KINDS = new Set(['route-server-peer-update']);
function creationOwnershipParent(resourceId) {
  for (const pattern of [
    /^(.*\/providers\/microsoft\.network\/virtualnetworks\/[^/]+)\/subnets\/[^/]+$/i,
    /^(.*\/providers\/microsoft\.network\/networksecuritygroups\/[^/]+)\/securityrules\/[^/]+$/i,
    /^(.*\/providers\/microsoft\.network\/routetables\/[^/]+)\/routes\/[^/]+$/i,
    /^(.*\/providers\/microsoft\.network\/virtualhubs\/[^/]+)\/bgpconnections\/[^/]+$/i,
  ]) {
    const match = pattern.exec(resourceId);
    if (match) return match[1];
  }
}
async function assertBrownfieldOwnership(plan, action, api) {
  const id = action.resourceId ?? '';
  if (!id.toLowerCase().startsWith(`/subscriptions/${plan.subscription.id}/`.toLowerCase()))
    throw new Error('Brownfield mutation target is outside the selected subscription');
  const result = await api.exec('az', [
    'resource',
    'show',
    '--ids',
    id,
    '--subscription',
    plan.subscription.id,
    '--output',
    'json',
  ]);
  if (result.exitCode !== 0) throw new Error('Brownfield ownership observation unavailable');
  let raw;
  try {
    raw = JSON.parse(result.stdout);
  } catch {
    throw new Error('Malformed brownfield ownership observation');
  }
  if (!raw || typeof raw.id !== 'string' || raw.id.toLowerCase() !== id.toLowerCase() || raw.nextLink)
    throw new Error('Brownfield ownership identity is missing or substituted');
  if (raw.tags !== undefined && (!raw.tags || typeof raw.tags !== 'object' || Array.isArray(raw.tags)))
    throw new Error('Malformed brownfield ownership tags');
  const tags = raw.tags ?? {};
  if (tags['xcsh-execution-engine'] !== undefined && tags['xcsh-execution-engine'] !== plan.engine)
    throw new Error('Brownfield resource belongs to another execution engine');
  if (
    tags['xcsh-managed-by'] === 'azure-ce' &&
    (tags['xcsh-deployment-id'] !== plan.deploymentName || tags['xcsh-execution-engine'] !== plan.engine)
  )
    throw new Error('Brownfield resource belongs to another or unknown CE deployment owner');
}
async function assertActionOwnership(plan, action, api, signal) {
  if (!action.mutates || action.kind === 'marketplace-terms-accept') return;
  if (action.kind === 'f5-ingress-configure') return;
  if (!action.resourceId) throw new Error(`Mutating action ${action.id} has no canonical resource ID`);
  if (!action.resourceId.toLowerCase().startsWith(`/subscriptions/${plan.subscription.id}/`.toLowerCase()))
    throw new Error('Mutation target is outside the selected subscription');
  if (action.kind === 'route-association-update' && plan.routing.udr) {
    await assertAzureGreenfieldUdrAssociationOwnership(plan, action, api, signal);
    return;
  }
  if (['route-association-update', 'brownfield-restore'].includes(action.kind)) {
    const allowed = plan.ownershipInventory.some(
      (item) => item.action === 'modify-approved' && item.resourceId.toLowerCase() === action.resourceId?.toLowerCase(),
    );
    if (!allowed)
      throw new Error(`Brownfield resource is outside the approved allowlist: ${action.resourceId ?? '<missing>'}`);
    await assertBrownfieldOwnership(plan, action, api);
    return;
  }
  if (action.kind === 'route-create' && plan.intent.brownfield.routeChanges.length > 0) {
    const allowed = plan.ownershipInventory.some(
      (item) => item.action === 'modify-approved' && item.resourceId.toLowerCase() === action.resourceId?.toLowerCase(),
    );
    if (!allowed) throw new Error(`Brownfield route target is outside the approved allowlist: ${action.resourceId}`);
    await assertBrownfieldOwnership(plan, action, api);
    return;
  }
  if (
    !CREATE_KINDS.has(action.kind) &&
    action.kind !== 'resource-delete' &&
    !OWNED_MUTATION_KINDS.has(action.kind) &&
    !PARENT_OWNED_MUTATION_KINDS.has(action.kind)
  )
    return;
  const isGroup = !action.resourceId.toLowerCase().includes('/providers/');
  const args = isGroup
    ? ['group', 'show', '--name', plan.intent.resourceGroup, '--subscription', plan.subscription.id, '--output', 'json']
    : ['resource', 'show', '--ids', action.resourceId, '--subscription', plan.subscription.id, '--output', 'json'];
  const result = await api.exec('az', args);
  if (result.exitCode !== 0) {
    if (CREATE_KINDS.has(action.kind) && /not found|could not be found|resourcegroupnotfound/i.test(result.stderr))
      return;
    if (action.kind === 'resource-delete' && /not found|could not be found|resourcegroupnotfound/i.test(result.stderr))
      return;
    throw new Error(`Unable to verify ownership for ${action.resourceId}`);
  }
  let raw;
  try {
    raw = JSON.parse(result.stdout);
  } catch {
    throw new Error(`Ownership response was invalid for ${action.resourceId}`);
  }
  const observedId = String(raw.id ?? '').toLowerCase();
  if (!observedId || observedId !== action.resourceId.toLowerCase())
    throw new Error(`Azure substituted a different resource ID for ${action.resourceId}`);
  let tags = raw.tags ?? {};
  const parentId =
    CREATE_KINDS.has(action.kind) || PARENT_OWNED_MUTATION_KINDS.has(action.kind)
      ? creationOwnershipParent(action.resourceId)
      : undefined;
  if (parentId) {
    const parentResult = await api.exec('az', [
      'resource',
      'show',
      '--ids',
      parentId,
      '--subscription',
      plan.subscription.id,
      '--output',
      'json',
    ]);
    if (parentResult.exitCode !== 0) throw new Error(`Unable to verify ownership for ${parentId}`);
    try {
      const parent = JSON.parse(parentResult.stdout);
      if (String(parent.id ?? '').toLowerCase() !== parentId.toLowerCase())
        throw new Error(`Azure substituted a different resource ID for ${parentId}`);
      tags = parent.tags ?? {};
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error(`Ownership response was invalid for ${parentId}`);
      throw error;
    }
  }
  const owned = tags['xcsh-managed-by'] === 'azure-ce' && tags['xcsh-deployment-id'] === plan.deploymentName;
  if (owned && tags['xcsh-execution-engine'] !== plan.engine)
    throw new Error('Azure resource belongs to another or unknown execution engine');
  if (!owned) throw new Error(`Refusing to mutate unmanaged resource ${action.resourceId}`);
  if (action.expectedOwnerPlanSha256 && tags['xcsh-plan-sha256'] !== action.expectedOwnerPlanSha256)
    throw new Error(`Azure resource belongs to a different immutable owner plan: ${action.resourceId}`);
  if (CREATE_KINDS.has(action.kind) && tags['xcsh-plan-sha256'] !== plan.planSha256)
    throw new Error(`Existing resource belongs to a different Azure CE plan: ${action.resourceId}`);
}

// plugins/azure/src/ce/relay-runtime-layout.ts
var relayCapabilities = [
  'NET_ADMIN',
  'NET_RAW',
  'SYS_ADMIN',
  'NET_BIND_SERVICE',
  'SETUID',
  'SETGID',
  'SETPCAP',
  'KILL',
  'CHOWN',
];
var relayGroups = ['frr', 'frrvty'];
var relayTmpfs = {
  '/var/run/frr': 'rw,nosuid,size=16m,mode=1777',
  '/tmp': 'rw,noexec,nosuid,size=16m',
  '/var/lib/frr': 'rw,nosuid,size=16m,mode=1777',
  '/var/tmp/frr': 'rw,nosuid,size=16m,mode=1777',
};
var relayDaemons = ['mgmtd', 'zebra', 'bgpd', 'watchfrr', 'staticd'];

// plugins/azure/src/ce/relay-cloud-init.ts
var bootstrapSource = String.raw`import hashlib, io, json, os, pathlib, re, subprocess, tarfile, urllib.request
root = pathlib.Path('/etc/xcsh-relay')
plan = json.loads((root / 'plan.json').read_text())
binary_root = pathlib.Path('/opt/xcsh-relay/bin')
binary_root.mkdir(parents=True, exist_ok=True)
url = plan['docker']['url']
expected_url = 'https://download.docker.com/linux/static/stable/x86_64/docker-' + plan['docker']['version'] + '.tgz'
if url != expected_url:
    raise RuntimeError('Docker source differs from saved plan')
with urllib.request.urlopen(url, timeout=30) as response:
    if response.geturl() != url:
        raise RuntimeError('Docker source redirected')
    data = response.read(128 * 1024 * 1024 + 1)
if len(data) > 128 * 1024 * 1024 or hashlib.sha256(data).hexdigest() != plan['docker']['sha256']:
    raise RuntimeError('Docker archive differs from saved plan')
allowed = {'docker', 'dockerd', 'containerd', 'containerd-shim-runc-v2', 'ctr', 'runc', 'docker-init', 'docker-proxy'}
seen = set()
with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
    for member in archive.getmembers():
        if member.isdir() and member.name.rstrip('/') == 'docker':
            continue
        if not member.isfile() or member.name.count('/') != 1 or not member.name.startswith('docker/') or member.name.split('/')[1] not in allowed or member.size > 256 * 1024 * 1024:
            raise RuntimeError('Unexpected Docker archive member')
        name = member.name.split('/')[1]
        if name in seen:
            raise RuntimeError('Duplicated Docker archive member')
        seen.add(name)
        target = binary_root / name
        temporary = target.with_suffix('.pending')
        temporary.write_bytes(archive.extractfile(member).read())
        temporary.chmod(0o755)
        temporary.replace(target)
if not {'docker', 'dockerd', 'containerd', 'containerd-shim-runc-v2', 'runc'}.issubset(seen):
    raise RuntimeError('Docker runtime archive is incomplete')
docker = str(binary_root / 'docker')
version = subprocess.run([docker, '--version'], check=True, capture_output=True, text=True).stdout.strip()
if not re.fullmatch(r'Docker version ' + re.escape(plan['docker']['version']) + r', build [a-f0-9]+', version):
    raise RuntimeError('Docker binary version differs')
subprocess.run(['systemctl', 'daemon-reload'], check=True)
subprocess.run(['systemctl', 'enable', '--now', 'xcsh-relay-docker.service'], check=True)
env = dict(os.environ, DOCKER_HOST='unix:///run/xcsh-relay-docker.sock')
subprocess.run([docker, 'pull', '--platform', 'linux/amd64', plan['frrImage']], check=True, env=env)
images = json.loads(subprocess.run([docker, 'image', 'inspect', plan['frrImage']], check=True, capture_output=True, text=True, env=env).stdout)
if len(images) != 1 or images[0].get('Architecture') != 'amd64' or images[0].get('Os') != 'linux' or plan['frrImage'] not in images[0].get('RepoDigests', []) or not re.fullmatch(r'sha256:[a-f0-9]{64}', images[0].get('Id', '')):
    raise RuntimeError('Installed FRR image differs')
image_id = images[0]['Id']
probe = subprocess.run([docker, 'run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', 'frr', '--entrypoint', '/usr/lib/frr/bgpd', image_id, '--version'], check=True, capture_output=True, text=True, env=env)
versions = re.findall(r'^bgpd version (\d+\.\d+\.\d+)((?:_[a-zA-Z0-9][a-zA-Z0-9._-]*)?)(?:[ \t]|$)', probe.stdout, re.MULTILINE)
if len(versions) != 1 or versions[0][0] != plan['frrVersion']:
    raise RuntimeError('Actual FRR version differs')
receipt = {'sourcePlanSha256': plan['sourcePlanSha256'], 'relayPlanSha256': plan['relayPlanSha256'], 'dockerArchiveSha256': plan['docker']['sha256'], 'dockerBinaryVersion': version, 'frrImage': plan['frrImage'], 'imageId': image_id, 'reportedFrrVersion': ''.join(versions[0]), 'versionStdoutSha256': hashlib.sha256(probe.stdout.encode()).hexdigest(), 'status': 'software-prepared'}
temporary = root / 'software.json.pending'
temporary.write_text(json.dumps(receipt))
temporary.chmod(0o600)
temporary.replace(root / 'software.json')
subprocess.run(['/usr/sbin/sysctl', '-w', 'net.ipv4.ip_forward=1'], check=True)
subprocess.run(['systemctl', 'enable', 'xcsh-relay.service'], check=True)
`;
var startSource = String.raw`import hashlib, json, os, pathlib, re, subprocess
root = pathlib.Path('/etc/xcsh-relay')
plan = json.loads((root / 'plan.json').read_text())
software = json.loads((root / 'software.json').read_text())
config = json.loads((root / 'config.json').read_text())
for record in [software, config]:
    if record.get('sourcePlanSha256') != plan['sourcePlanSha256'] or record.get('relayPlanSha256') != plan['relayPlanSha256']:
        raise RuntimeError('Relay software/configuration owner differs')
if software.get('frrImage') != plan['frrImage'] or software.get('dockerArchiveSha256') != plan['docker']['sha256'] or not re.fullmatch(r'sha256:[a-f0-9]{64}', software.get('imageId', '')):
    raise RuntimeError('Relay software identity differs')
if config.get('relayName') != plan['relayName'] or hashlib.sha256((root / 'frr/frr.conf').read_bytes()).hexdigest() != config.get('configSha256'):
    raise RuntimeError('Relay configuration digest differs')
for name in ['daemons', 'vtysh.conf']:
    if hashlib.sha256((root / 'frr' / name).read_bytes()).hexdigest() != plan['daemonFilesSha256'][name]:
        raise RuntimeError('Relay daemon configuration differs')
docker = '/opt/xcsh-relay/bin/docker'
env = dict(os.environ, DOCKER_HOST='unix:///run/xcsh-relay-docker.sock')
images = json.loads(subprocess.run([docker, 'image', 'inspect', software['imageId']], check=True, capture_output=True, text=True, env=env).stdout)
if len(images) != 1 or images[0].get('Id') != software['imageId'] or plan['frrImage'] not in images[0].get('RepoDigests', []) or images[0].get('Architecture') != 'amd64' or images[0].get('Os') != 'linux':
    raise RuntimeError('Current installed relay image differs')
args = [docker, 'run', '--rm', '--name', 'xcsh-relay-frr', '--network', 'host', '--read-only', '--cap-drop', 'ALL']
for capability in ${JSON.stringify(relayCapabilities)}:
    args.extend(['--cap-add', capability])
for group in ${JSON.stringify(relayGroups)}:
    args.extend(['--group-add', group])
for path, options in ${JSON.stringify(relayTmpfs)}.items():
    args.extend(['--tmpfs', path + ':' + options])
args.extend(['--security-opt', 'no-new-privileges', '--mount', 'type=bind,source=/etc/xcsh-relay/frr,target=/etc/frr,readonly', software['imageId']])
os.execve(docker, args, env)
`;
function renderAzureRelayCloudInit(source, plan, relayName) {
  verifyAzureRelayPlan(source, plan);
  if (plan.relays.filter((relay) => relay.name === relayName).length !== 1)
    throw Error('Azure relay bootstrap: relay is not in the saved plan');
  const daemons = `zebra=yes
bgpd=yes
staticd=yes
bfdd=no
vtysh_enable=yes
zebra_options="-A 127.0.0.1 -s 90000000"
bgpd_options="-A 127.0.0.1"
`;
  const vtysh = `service integrated-vtysh-config
`;
  const owner = {
    schemaVersion: 1,
    sourcePlanSha256: source.planSha256,
    relayPlanSha256: plan.planSha256,
    engine: plan.engine,
    subscriptionId: plan.subscriptionId,
    deploymentName: plan.deploymentName,
    relayName,
    frrImage: plan.frr.image,
    frrVersion: plan.frr.version,
    docker: plan.docker,
    daemonFilesSha256: { daemons: sha256Hex(daemons), 'vtysh.conf': sha256Hex(vtysh) },
  };
  const dockerUnit = [
    '[Unit]',
    'Description=Owned xcsh relay container engine',
    'After=network-online.target',
    'Wants=network-online.target',
    '[Service]',
    'Type=notify',
    'Environment=PATH=/opt/xcsh-relay/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    'ExecStart=/opt/xcsh-relay/bin/dockerd --host=unix:///run/xcsh-relay-docker.sock --data-root=/var/lib/xcsh-relay-docker --exec-root=/run/xcsh-relay-docker --pidfile=/run/xcsh-relay-docker.pid --bridge=none --iptables=false --ip6tables=false',
    'Restart=on-failure',
    'RestartSec=5',
    '[Install]',
    'WantedBy=multi-user.target',
    '',
  ].join(`
`);
  const frrUnit = [
    '[Unit]',
    'Description=Owned xcsh FRR relay',
    'After=xcsh-relay-docker.service network-online.target',
    'Requires=xcsh-relay-docker.service',
    'ConditionPathExists=/etc/xcsh-relay/frr/frr.conf',
    'ConditionPathExists=/etc/xcsh-relay/config.json',
    'ConditionPathExists=/etc/xcsh-relay/software.json',
    '[Service]',
    'Type=simple',
    'ExecStart=/usr/bin/python3 /usr/local/lib/xcsh-relay-start.py',
    'ExecStop=/opt/xcsh-relay/bin/docker --host=unix:///run/xcsh-relay-docker.sock stop --time=20 xcsh-relay-frr',
    'Restart=on-failure',
    'RestartSec=5',
    '[Install]',
    'WantedBy=multi-user.target',
    '',
  ].join(`
`);
  const write = (path, content, permissions) => ({
    path,
    content,
    permissions,
    owner: 'root:root',
  });
  return `#cloud-config
${JSON.stringify(
  {
    write_files: [
      write('/etc/xcsh-relay/plan.json', canonicalStringify(owner), '0600'),
      write('/etc/xcsh-relay/frr/daemons', daemons, '0644'),
      write('/etc/xcsh-relay/frr/vtysh.conf', vtysh, '0644'),
      write('/usr/local/lib/xcsh-relay-bootstrap.py', bootstrapSource, '0700'),
      write('/usr/local/lib/xcsh-relay-start.py', startSource, '0700'),
      write('/etc/systemd/system/xcsh-relay-docker.service', dockerUnit, '0644'),
      write('/etc/systemd/system/xcsh-relay.service', frrUnit, '0644'),
      write(
        '/etc/sysctl.d/80-xcsh-relay.conf',
        `net.ipv4.ip_forward=1
`,
        '0644',
      ),
    ],
    runcmd: [['python3', '/usr/local/lib/xcsh-relay-bootstrap.py']],
  },
  null,
  2,
)}
`;
}

// plugins/azure/src/ce/relay-terraform.ts
var ref = (value) => '${' + value + '}';
var literal = (value) => value.replaceAll('${', '$${').replaceAll('%{', '%%{');
function renderAzureRelayTerraformResources(source, plan, sloSubnetReference) {
  verifyAzureRelayPlan(source, plan);
  if (plan.engine !== 'terraform' || source.subscription.cloud !== 'AzureCloud')
    throw Error('Azure relay Terraform: Terraform AzureCloud owner required');
  if (!/^\$\{azurerm_subnet\.subnet_\d+\.id\}$/.test(sloSubnetReference))
    throw Error('Azure relay Terraform: owning foundation subnet reference required');
  const resource = {};
  const outputs = {};
  const add = (type, key, value) => {
    resource[type] ??= {};
    resource[type][key] = value;
  };
  const tags = azureRelayOwnershipTags(source, plan);
  for (const [index, relay] of plan.relays.entries()) {
    const name = `relay_${index + 1}`;
    add('tls_private_key', name, { algorithm: 'RSA', rsa_bits: 4096 });
    if (relay.publicIpId)
      add('azurerm_public_ip', name, {
        name: literal(`${relay.name}-pip`),
        location: plan.region,
        resource_group_name: ref('azurerm_resource_group.ce.name'),
        allocation_method: 'Static',
        sku: 'Standard',
        tags,
      });
    add('azurerm_network_interface', name, {
      name: literal(`${relay.name}-nic`),
      location: plan.region,
      resource_group_name: ref('azurerm_resource_group.ce.name'),
      ip_forwarding_enabled: true,
      accelerated_networking_enabled: false,
      ip_configuration: [
        {
          name: 'ipconfig1',
          primary: true,
          subnet_id: sloSubnetReference,
          private_ip_address_allocation: 'Static',
          private_ip_address: relay.privateAddress,
          ...(relay.publicIpId ? { public_ip_address_id: ref(`azurerm_public_ip.${name}.id`) } : {}),
        },
      ],
      tags,
    });
    const customData = renderAzureRelayCloudInit(source, plan, relay.name);
    if (Buffer.byteLength(customData) > 65535) throw Error('Azure relay Terraform: custom data exceeds Azure limit');
    add('azurerm_linux_virtual_machine', name, {
      name: literal(relay.name),
      computer_name: literal(relay.name),
      location: plan.region,
      resource_group_name: ref('azurerm_resource_group.ce.name'),
      size: plan.vmSize,
      admin_username: 'xcsh',
      disable_password_authentication: true,
      admin_ssh_key: [{ username: 'xcsh', public_key: ref(`tls_private_key.${name}.public_key_openssh`) }],
      network_interface_ids: [ref(`azurerm_network_interface.${name}.id`)],
      source_image_reference: [
        {
          publisher: plan.hostImage.publisher,
          offer: plan.hostImage.offer,
          sku: plan.hostImage.sku,
          version: plan.hostImage.version,
        },
      ],
      os_disk: [{ name: literal(relay.osDiskName), caching: 'ReadWrite', storage_account_type: 'StandardSSD_LRS' }],
      custom_data: Buffer.from(customData).toString('base64'),
      tags,
    });
    add('azurerm_route_server_bgp_connection', name, {
      name: literal(relay.name),
      route_server_id: ref('azurerm_route_server.ce.id'),
      peer_asn: relay.asn,
      peer_ip: relay.privateAddress,
      depends_on: [`azurerm_linux_virtual_machine.${name}`],
    });
    outputs[name] = {
      id: ref(`azurerm_linux_virtual_machine.${name}.id`),
      nic_id: ref(`azurerm_network_interface.${name}.id`),
      os_disk_id: relay.osDiskId,
      peer_id: ref(`azurerm_route_server_bgp_connection.${name}.id`),
      private_address: relay.privateAddress,
      asn: relay.asn,
    };
  }
  return { resource, output: { ce_relay_instances: { value: outputs } } };
}

// plugins/azure/src/ce/workload-fixture.ts
var AZURE_CE_WORKLOAD_FIXTURE_VM_SIZE = 'Standard_B1s';
var AZURE_CE_WORKLOAD_FIXTURE_VCPUS = 1;
var AZURE_CE_WORKLOAD_FIXTURE_IMAGE = {
  publisher: 'Canonical',
  offer: '0001-com-ubuntu-server-jammy',
  sku: '22_04-lts',
};

// plugins/azure/src/ce/terraform-foundation.ts
var AZURE_CE_TERRAFORM_VERSION = CE_TERRAFORM_VERSION;
var AZURE_CE_TERRAFORM_PROVIDER_VERSION = '5.4.0';
var AZURE_CE_TLS_PROVIDER_VERSION = '4.4.0';
var AZURE_CE_AZAPI_PROVIDER_VERSION = '2.12.0';
var ref2 = (address) => `\${${address}}`;
var literal2 = (value) => value.replaceAll('${', '$${').replaceAll('%{', '%%{');
function renderAzureTerraformFoundation(plan, bootstrapByNode = {}, relayPlan) {
  verifyAzureCePlan(plan);
  if (plan.routing.mode === 'udr') assertAzureCeRoutingExecutable(plan);
  relayPlan ??= plan.relayProfile ? azureRelayPlanForDeployment(plan) : undefined;
  if (relayPlan) verifyAzureRelayPlan(plan, relayPlan);
  if (plan.intent.workloadFixture && !plan.workloadProfile)
    throw new Error('Azure workload execution requires the collected exact image and regional SKU profile');
  if (plan.engine !== 'terraform' || plan.intent.operation !== 'deploy')
    throw new Error('Azure Terraform foundation requires a Terraform deployment plan');
  const allowedTrafficSource =
    plan.intent.ingress?.mode === 'platform-http'
      ? plan.intent.ingress.probe.sourceVmResourceId.toLowerCase()
      : undefined;
  if (
    plan.nics.some((nic) => nic.subnet.mode !== 'greenfield') ||
    plan.intent.brownfield.resourceIds.some((id) => id.toLowerCase() !== allowedTrafficSource) ||
    plan.egress.mode !== 'public-ip'
  )
    throw new Error('Azure Terraform foundation requires greenfield networking and public-ip egress');
  if (plan.subscription.cloud !== 'AzureCloud')
    throw new Error('Azure Terraform foundation cloud environment requires explicit translation');
  if (!plan.actions.some((action) => action.kind === 'resource-group-create'))
    throw new Error('Azure Terraform foundation requires a newly planned resource group');
  const admitted = Object.keys(bootstrapByNode);
  if (admitted.some((node) => !/^[1-3]$/.test(node) || Number(node) > plan.topology.nodeCount))
    throw new Error('Invalid Azure Terraform node admission');
  if (admitted.some((node, index) => Number(node) !== index + 1))
    throw new Error('Azure Terraform nodes must be admitted in order');
  const resource = {};
  const data = {};
  const add = (type, name, value) => {
    resource[type] ??= {};
    resource[type][name] = value;
  };
  const addData = (type, name, value) => {
    data[type] ??= {};
    data[type][name] = value;
  };
  const tags = (node, index) => ({
    'xcsh-managed-by': 'azure-ce',
    'xcsh-execution-engine': 'terraform',
    'xcsh-deployment-id': plan.deploymentName,
    'xcsh-plan-sha256': plan.planSha256,
    'ves-io-site-name': plan.siteName,
    ...(node ? { 'xcsh-node-index': String(node) } : {}),
    ...(index !== undefined ? { 'xcsh-interface-index': String(index) } : {}),
  });
  const marketplaceTermsRequired = !plan.image.termsAccepted;
  if (marketplaceTermsRequired) {
    const resourceId = [
      `/subscriptions/${plan.subscription.id}`,
      'providers/Microsoft.MarketplaceOrdering',
      'offerTypes/virtualmachine',
      `publishers/${plan.image.publisher}`,
      `offers/${plan.image.offer}`,
      `plans/${plan.image.plan}`,
      'agreements/current',
    ].join('/');
    const type = 'Microsoft.MarketplaceOrdering/offerTypes/publishers/offers/plans/agreements@2021-01-01';
    const properties = 'data.azapi_resource.marketplace_terms.output.properties';
    const property = (name) => `try(${properties}.${name}, "")`;
    addData('azapi_resource', 'marketplace_terms', {
      type,
      resource_id: literal2(resourceId),
      response_export_values: ['properties'],
    });
    add('azapi_resource_action', 'marketplace_terms', {
      type,
      resource_id: literal2(resourceId),
      method: 'PUT',
      when: 'apply',
      body: ref2(
        `merge(data.azapi_resource.marketplace_terms.output, { properties = merge(${properties}, { accepted = true }) })`,
      ),
      lifecycle: {
        precondition: [
          {
            condition: ref2(
              [
                `(try(${properties}.accepted, null) == false || try(${properties}.accepted, null) == true)`,
                `lower(${property('publisher')}) == lower(${JSON.stringify(plan.image.publisher)})`,
                `lower(${property('product')}) == lower(${JSON.stringify(plan.image.offer)})`,
                `lower(${property('plan')}) == lower(${JSON.stringify(plan.image.plan)})`,
                `length(${property('licenseTextLink')}) > 0`,
                `length(${property('marketplaceTermsLink')}) > 0`,
                `length(${property('privacyPolicyLink')}) > 0`,
                `length(${property('signature')}) > 0`,
              ].join(' && '),
            ),
            error_message: 'Live Azure Marketplace agreement differs from the immutable unaccepted plan',
          },
        ],
      },
    });
  }
  add('azurerm_resource_group', 'ce', {
    name: literal2(plan.intent.resourceGroup),
    location: plan.region,
    tags: tags(),
    ...(marketplaceTermsRequired ? { depends_on: ['azapi_resource_action.marketplace_terms'] } : {}),
  });
  const group = ref2('azurerm_resource_group.ce.name');
  const fixture = plan.intent.workloadFixture;
  const subnets = plan.actions.filter((action) => action.kind === 'subnet-create');
  const subnetRefs = new Map();
  const prefixes = [];
  for (const [index, action] of subnets.entries()) {
    const arg = (flag) => (action.args?.includes(flag) ? action.args[action.args.indexOf(flag) + 1] : undefined);
    const name = arg('--name');
    const cidr = arg('--address-prefixes');
    if (!name || !cidr || subnetRefs.has(name)) throw new Error('Planned Azure subnet translation is incomplete');
    const key = `subnet_${index}`;
    add('azurerm_subnet', key, {
      name: literal2(name),
      resource_group_name: group,
      virtual_network_name: ref2('azurerm_virtual_network.ce.name'),
      address_prefixes: [cidr],
    });
    subnetRefs.set(name, ref2(`azurerm_subnet.${key}.id`));
    prefixes.push(cidr);
  }
  if (fixture) {
    if (subnetRefs.has(fixture.subnetName) || prefixes.includes(fixture.cidr))
      throw new Error('Azure Terraform workload fixture overlaps a CE subnet');
    const key = 'workload';
    add('azurerm_subnet', key, {
      name: literal2(fixture.subnetName),
      resource_group_name: group,
      virtual_network_name: ref2('azurerm_virtual_network.ce.name'),
      address_prefixes: [fixture.cidr],
    });
    subnetRefs.set(fixture.subnetName, ref2(`azurerm_subnet.${key}.id`));
    prefixes.push(fixture.cidr);
  }
  if (plan.nics.some((nic) => !subnetRefs.has(nic.subnet.name ?? '')))
    throw new Error('Planned Azure NIC subnet is unavailable');
  add('azurerm_virtual_network', 'ce', {
    name: literal2(`${plan.deploymentName}-vnet`),
    resource_group_name: group,
    location: plan.region,
    address_space: [...new Set(prefixes)].sort(),
    tags: tags(),
  });
  if (fixture) {
    add('tls_private_key', 'workload', { algorithm: 'RSA', rsa_bits: 4096 });
    add('azurerm_network_interface', 'workload', {
      name: literal2(`${plan.deploymentName}-workload-nic`),
      resource_group_name: group,
      location: plan.region,
      ip_forwarding_enabled: false,
      ip_configuration: [
        {
          name: 'primary',
          primary: true,
          subnet_id: subnetRefs.get(fixture.subnetName),
          private_ip_address_allocation: 'Static',
          private_ip_address: fixture.privateIp,
        },
      ],
      tags: { ...tags(), 'xcsh-workload-fixture': 'route-server' },
    });
    add('azurerm_linux_virtual_machine', 'workload', {
      name: literal2(`${plan.deploymentName}-workload`),
      computer_name: literal2(`${plan.deploymentName}-workload`),
      resource_group_name: group,
      location: plan.region,
      size: AZURE_CE_WORKLOAD_FIXTURE_VM_SIZE,
      admin_username: 'xcsh',
      disable_password_authentication: true,
      network_interface_ids: [ref2('azurerm_network_interface.workload.id')],
      admin_ssh_key: [{ username: 'xcsh', public_key: ref2('tls_private_key.workload.public_key_openssh') }],
      source_image_reference: {
        ...AZURE_CE_WORKLOAD_FIXTURE_IMAGE,
        version: fixture.imageVersion,
      },
      os_disk: [{ caching: 'ReadWrite', storage_account_type: 'Standard_LRS', disk_size_gb: 30 }],
      custom_data: Buffer.from(`#cloud-config
runcmd:
  - [ sh, -c, "mkdir -p /srv/xcsh && printf route-server-fixture > /srv/xcsh/index.html && nohup python3 -m http.server ${fixture.port} --directory /srv/xcsh >/var/log/xcsh-workload.log 2>&1 &" ]
`).toString('base64'),
      tags: { ...tags(), 'xcsh-workload-fixture': 'route-server' },
    });
  }
  if (plan.routing.udr) {
    const selected = plan.routing.udr;
    add('azurerm_route_table', 'ce', {
      name: literal2(`${plan.deploymentName}-rt`),
      resource_group_name: group,
      location: plan.region,
      tags: tags(),
    });
    for (const [index, destination] of plan.routing.destinationCidrs.entries())
      add('azurerm_route', `route_${index}`, {
        name: `ce-route-${index + 1}`,
        resource_group_name: group,
        route_table_name: ref2('azurerm_route_table.ce.name'),
        address_prefix: destination,
        next_hop_type: 'VirtualAppliance',
        next_hop_in_ip_address: ref2(
          `azurerm_network_interface.node_${selected.nextHop.node}_nic_${selected.nextHop.nicIndex}.private_ip_address`,
        ),
      });
    for (const [index, name] of selected.subnetNames.entries()) {
      const subnet = subnetRefs.get(name);
      if (!subnet) throw Error('Greenfield UDR association subnet is unavailable');
      add('azurerm_subnet_route_table_association', `udr_${index}`, {
        subnet_id: subnet,
        route_table_id: ref2('azurerm_route_table.ce.id'),
        depends_on: plan.routing.destinationCidrs.map((_, route) => `azurerm_route.route_${route}`),
      });
    }
  }
  if (plan.routing.mode === 'route-server') {
    const routeServerSubnet = subnetRefs.get('RouteServerSubnet');
    if (
      !routeServerSubnet ||
      !Number.isInteger(plan.routing.localAsn) ||
      (plan.routing.localAsn ?? 0) < 1 ||
      (plan.routing.localAsn ?? 0) > 65534
    )
      throw new Error('Planned Route Server subnet or CE ASN translation is incomplete');
    add('azurerm_public_ip', 'route_server', {
      name: literal2(`${plan.deploymentName}-rs-pip`),
      resource_group_name: group,
      location: plan.region,
      allocation_method: 'Static',
      sku: 'Standard',
      tags: tags(),
    });
    add('azurerm_route_server', 'ce', {
      name: literal2(`${plan.deploymentName}-rs`),
      resource_group_name: group,
      location: plan.region,
      sku: 'Standard',
      public_ip_address_id: ref2('azurerm_public_ip.route_server.id'),
      subnet_id: routeServerSubnet,
      branch_to_branch_traffic_enabled: false,
      tags: tags(),
    });
  }
  if (plan.securityRules.length) {
    add('azurerm_network_security_group', 'ce', {
      name: literal2(`${plan.deploymentName}-nsg`),
      resource_group_name: group,
      location: plan.region,
      tags: tags(),
    });
    for (const [index, rule] of plan.securityRules.entries())
      add('azurerm_network_security_rule', `rule_${index}`, {
        name: literal2(rule.name),
        resource_group_name: group,
        network_security_group_name: ref2('azurerm_network_security_group.ce.name'),
        priority: 100 + index,
        direction: rule.direction,
        access: 'Allow',
        protocol: rule.protocol,
        source_port_range: '*',
        source_address_prefixes: rule.sourceCidrs,
        destination_address_prefixes: rule.destinationCidrs,
        ...(rule.destinationPorts.length === 1
          ? { destination_port_range: rule.destinationPorts[0] }
          : { destination_port_ranges: rule.destinationPorts }),
      });
  }
  const interfaceOutputs = {};
  const instanceOutputs = {};
  for (let node = 1; node <= plan.topology.nodeCount; node++) {
    const nodeName = `${plan.deploymentName}-${node}`;
    const zone = plan.topology.zones[node - 1] ?? plan.topology.zones[0];
    add('azurerm_public_ip', `node_${node}`, {
      name: literal2(`${nodeName}-pip`),
      resource_group_name: group,
      location: plan.region,
      allocation_method: 'Static',
      sku: 'Standard',
      ...(zone ? { zones: [zone] } : {}),
      tags: tags(node),
    });
    for (const nic of plan.nics) {
      const key = `node_${node}_nic_${nic.index}`;
      const subnet = subnetRefs.get(nic.subnet.name ?? '');
      add('azurerm_network_interface', key, {
        name: literal2(`${nodeName}-nic${nic.index}`),
        resource_group_name: group,
        location: plan.region,
        ip_forwarding_enabled: true,
        accelerated_networking_enabled: false,
        ip_configuration: [
          {
            name: 'primary',
            primary: true,
            subnet_id: subnet,
            private_ip_address_allocation: 'Dynamic',
            ...(nic.index === 0 ? { public_ip_address_id: ref2(`azurerm_public_ip.node_${node}.id`) } : {}),
          },
        ],
        tags: tags(node, nic.index),
      });
      if (plan.securityRules.length)
        add('azurerm_network_interface_security_group_association', key, {
          network_interface_id: ref2(`azurerm_network_interface.${key}.id`),
          network_security_group_id: ref2('azurerm_network_security_group.ce.id'),
        });
      interfaceOutputs[`${node}:${nic.index}`] = {
        id: ref2(`azurerm_network_interface.${key}.id`),
        subnet_id: subnet,
        site_name: plan.siteName,
        node,
        index: nic.index,
        role: nic.role,
      };
    }
    if (!admitted.includes(String(node))) continue;
    if (plan.routing.mode === 'route-server' && !relayPlan) {
      const slo = plan.nics.find((nic) => nic.role === 'slo');
      if (!slo) throw new Error('Route Server peering requires the explicit SLO interface');
      add('azurerm_route_server_bgp_connection', `node_${node}`, {
        name: literal2(nodeName),
        route_server_id: ref2('azurerm_route_server.ce.id'),
        peer_asn: plan.routing.localAsn,
        peer_ip: ref2(`azurerm_network_interface.node_${node}_nic_${slo.index}.private_ip_address`),
      });
    }
    const bootstrap = bootstrapByNode[String(node)];
    if (
      !bootstrap.startsWith('#cloud-config') ||
      !bootstrap.includes('/etc/vpm/user_data') ||
      /__\w+__/.test(bootstrap)
    )
      throw new Error('Azure Terraform admission requires resolved platform cloud-init');
    add('tls_private_key', `node_${node}`, { algorithm: 'RSA', rsa_bits: 4096 });
    add('azurerm_linux_virtual_machine', `node_${node}`, {
      name: literal2(nodeName),
      computer_name: literal2(nodeName),
      location: plan.region,
      resource_group_name: group,
      size: plan.vm.size,
      ...(zone ? { zone } : {}),
      admin_username: 'azureuser',
      disable_password_authentication: true,
      admin_ssh_key: [{ username: 'azureuser', public_key: ref2(`tls_private_key.node_${node}.public_key_openssh`) }],
      network_interface_ids: plan.nics.map((nic) => ref2(`azurerm_network_interface.node_${node}_nic_${nic.index}.id`)),
      source_image_reference: [
        { publisher: plan.image.publisher, offer: plan.image.offer, sku: plan.image.plan, version: plan.image.version },
      ],
      plan: [{ name: plan.image.plan, product: plan.image.offer, publisher: plan.image.publisher }],
      os_disk: [
        {
          name: literal2(`${nodeName}-osdisk`),
          caching: 'ReadWrite',
          storage_account_type: 'StandardSSD_LRS',
          disk_size_gb: 100,
        },
      ],
      boot_diagnostics: [{}],
      custom_data: Buffer.from(bootstrap).toString('base64'),
      tags: tags(node),
      ...(() => {
        const dependsOn = [
          ...(marketplaceTermsRequired ? ['azapi_resource_action.marketplace_terms'] : []),
          ...(plan.securityRules.length
            ? [
                ...plan.nics.map(
                  (nic) => `azurerm_network_interface_security_group_association.node_${node}_nic_${nic.index}`,
                ),
                ...plan.securityRules.map((_, index) => `azurerm_network_security_rule.rule_${index}`),
              ]
            : []),
        ];
        return dependsOn.length ? { depends_on: dependsOn } : {};
      })(),
    });
    instanceOutputs[String(node)] = {
      id: ref2(`azurerm_linux_virtual_machine.node_${node}.id`),
      vm_id: ref2(`azurerm_linux_virtual_machine.node_${node}.virtual_machine_id`),
      site_name: plan.siteName,
      hostname: nodeName,
    };
  }
  const relayResources = relayPlan
    ? renderAzureRelayTerraformResources(
        plan,
        relayPlan,
        subnetRefs.get(plan.nics.find((nic) => nic.role === 'slo')?.subnet.name ?? '') ?? '',
      )
    : undefined;
  if (relayResources)
    for (const [type, entries] of Object.entries(relayResources.resource))
      for (const [name, value] of Object.entries(entries)) {
        if (resource[type]?.[name]) throw Error('Azure Terraform relay resource conflicts with foundation');
        add(type, name, value);
      }
  return JSON.stringify({
    terraform: {
      required_version: `= ${AZURE_CE_TERRAFORM_VERSION}`,
      required_providers: {
        azurerm: { source: 'hashicorp/azurerm', version: `= ${AZURE_CE_TERRAFORM_PROVIDER_VERSION}` },
        tls: { source: 'hashicorp/tls', version: `= ${AZURE_CE_TLS_PROVIDER_VERSION}` },
        azapi: { source: 'Azure/azapi', version: `= ${AZURE_CE_AZAPI_PROVIDER_VERSION}` },
      },
    },
    provider: {
      azurerm: {
        features: [{}],
        subscription_id: plan.subscription.id,
        tenant_id: plan.subscription.tenantId,
        environment: 'public',
        resource_provider_registrations: 'none',
      },
      azapi: { subscription_id: plan.subscription.id, tenant_id: plan.subscription.tenantId },
    },
    ...(Object.keys(data).length ? { data } : {}),
    resource,
    output: {
      ...(relayResources?.output ?? {}),
      ce_interfaces: { value: interfaceOutputs },
      ce_instances: { value: instanceOutputs },
      ce_vnet_id: { value: ref2('azurerm_virtual_network.ce.id') },
      ...(plan.routing.mode === 'route-server'
        ? {
            ce_route_server: {
              value: {
                id: ref2('azurerm_route_server.ce.id'),
                asn: ref2('azurerm_route_server.ce.virtual_router_asn'),
                peer_ips: ref2('sort(tolist(azurerm_route_server.ce.virtual_router_ips))'),
              },
            },
            ce_route_server_peers: {
              value: Object.fromEntries(
                (relayPlan ? [] : admitted).map((node) => [
                  node,
                  {
                    id: ref2(`azurerm_route_server_bgp_connection.node_${node}.id`),
                    peer_ip: ref2(
                      `azurerm_network_interface.node_${node}_nic_${plan.nics.find((nic) => nic.role === 'slo')?.index}.private_ip_address`,
                    ),
                    peer_asn: plan.routing.localAsn,
                  },
                ]),
              ),
            },
          }
        : {}),
    },
  });
}
async function azureTerraformFoundationDeployment(plan, bootstrapByNode = {}, relayPlan) {
  const configuration = renderAzureTerraformFoundation(plan, bootstrapByNode, relayPlan);
  const providerLock = await readFile3(
    new URL('./assets/plugins/azure/terraform/provider-lock.hcl', import.meta.url),
    'utf8',
  );
  return {
    schemaVersion: 1,
    deploymentId: plan.deploymentName,
    engine: 'terraform',
    scope: { cloud: 'azure', account: plan.subscription.id, region: plan.region },
    terraformVersion: AZURE_CE_TERRAFORM_VERSION,
    configuration,
    providerLock,
    backendIdentity: `local:${plan.deploymentName}`,
  };
}
async function azureTerraformCurrentDeployment(plan) {
  verifyAzureCePlan(plan);
  if (plan.engine !== 'terraform') throw new Error('Azure Terraform workspace requires Terraform ownership');
  const providerLock = await readFile3(
    new URL('./assets/plugins/azure/terraform/provider-lock.hcl', import.meta.url),
    'utf8',
  );
  return {
    schemaVersion: 1,
    deploymentId: plan.deploymentName,
    engine: 'terraform',
    scope: { cloud: 'azure', account: plan.subscription.id, region: plan.region },
    terraformVersion: AZURE_CE_TERRAFORM_VERSION,
    configuration: JSON.stringify({
      terraform: {
        required_version: `= ${AZURE_CE_TERRAFORM_VERSION}`,
        required_providers: {
          azurerm: { source: 'hashicorp/azurerm', version: `= ${AZURE_CE_TERRAFORM_PROVIDER_VERSION}` },
          tls: { source: 'hashicorp/tls', version: `= ${AZURE_CE_TLS_PROVIDER_VERSION}` },
          azapi: { source: 'Azure/azapi', version: `= ${AZURE_CE_AZAPI_PROVIDER_VERSION}` },
        },
      },
      provider: {
        azurerm: {
          features: [{}],
          subscription_id: plan.subscription.id,
          tenant_id: plan.subscription.tenantId,
          environment: 'public',
          resource_provider_registrations: 'none',
        },
        azapi: { subscription_id: plan.subscription.id, tenant_id: plan.subscription.tenantId },
      },
    }),
    providerLock,
    backendIdentity: `local:${plan.deploymentName}`,
  };
}

// plugins/azure/src/ce/terraform-upgrade.ts
function azureUpgradeBinding(plan) {
  verifyAzureCePlan(plan);
  if (plan.intent.initialVersions !== undefined) initialSoftwareSettings(plan.intent.initialVersions);
  return {
    owner: {
      deploymentId: plan.deploymentName,
      engine: plan.engine,
      provider: 'azure',
      account: plan.subscription.id,
      region: plan.region,
    },
    ...(plan.intent.initialVersions ? { initialVersions: structuredClone(plan.intent.initialVersions) } : {}),
    siteName: plan.siteName,
    nodes: Array.from({ length: plan.topology.nodeCount }, (_, index) => `${plan.deploymentName}-${index + 1}`),
  };
}
async function build(base, expectation, contract) {
  verifyAzureCePlan(base);
  initialSoftwareSettings(expectation.before);
  const binding = azureUpgradeBinding(base);
  if (
    base.engine !== 'terraform' ||
    canonicalSha256(binding) !== canonicalSha256(expectation.binding) ||
    typeof expectation.siteUid !== 'string' ||
    !expectation.siteUid.trim() ||
    typeof expectation.physicalSiteUid !== 'string' ||
    !expectation.physicalSiteUid.trim() ||
    !/^sha256:[a-f0-9]{64}$/.test(expectation.siteContractFingerprint) ||
    Object.keys(expectation.target).sort().join(',') !== 'kind,version' ||
    expectation.before[expectation.target.kind] === expectation.target.version ||
    expectation.contractFingerprint !== contract.fingerprint
  )
    throw new Error('Azure Terraform upgrade identities, scope or effective versions are incomplete');
  const { kind, version } = expectation.target;
  const request = contract.build({ siteName: base.siteName, kind, version });
  const requestValues = { name: base.siteName, namespace: 'system', version, force: false };
  const actionValues = { site: base.siteName, [kind === 'software' ? 'software_version' : 'os_version']: version };
  const suffix = kind === 'software' ? 'sw' : 'os';
  if (
    request.method !== 'POST' ||
    request.path !== `/api/config/namespaces/system/sites/${base.siteName}/upgrade_${suffix}` ||
    canonicalSha256(request.body) !== canonicalSha256(requestValues)
  )
    throw new Error('Azure Terraform upgrade wire request differs from the verified action');
  const providerLock = await loadXcshProviderLock();
  const identity = { sourcePlanSha256: base.planSha256, expectation };
  const stage = `upgrade-${kind}-${canonicalSha256(identity).slice(0, 24)}`;
  const type = `xcsh_site_upgrade_${suffix}`;
  const deployment = {
    schemaVersion: 1,
    deploymentId: base.deploymentName,
    stage,
    engine: 'terraform',
    scope: { cloud: 'azure', account: base.subscription.id, region: base.region },
    terraformVersion: AZURE_CE_TERRAFORM_VERSION,
    providerLock,
    backendIdentity: `local:${base.deploymentName}:stage:${stage}`,
    configuration: JSON.stringify({
      terraform: {
        required_version: `= ${AZURE_CE_TERRAFORM_VERSION}`,
        required_providers: { xcsh: { source: 'f5-sales-demo/xcsh', version: `= ${XCSH_PROVIDER_VERSION}` } },
      },
      provider: { xcsh: {} },
      action: { [type]: { ce: { config: actionValues } } },
    }),
  };
  const draft = {
    schemaVersion: 2,
    engine: 'terraform',
    kind: 'azure-ce-terraform-upgrade',
    ...identity,
    deployment,
    action: {
      address: `action.${type}.ce`,
      type,
      providerName: 'registry.terraform.io/f5-sales-demo/xcsh',
      configValuesSha256: canonicalSha256(actionValues),
    },
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-upgrade-${planSha256.slice(0, 24)}`, planSha256 };
}
async function prepareAzureTerraformUpgrade(base, target, runtime, contract, signal) {
  verifyAzureCePlan(base);
  if (base.engine !== 'terraform') throw new Error('Azure CE upgrade requires a Terraform-owned plan');
  contract.build({ siteName: base.siteName, ...target });
  const binding = azureUpgradeBinding(base);
  const observation = await runtime.observeUpgrade(
    binding,
    contract,
    target.kind === 'software' ? target.version : undefined,
    signal,
  );
  if (observation.status !== 'observed') throw new Error('Fresh Azure upgrade version evidence is unavailable');
  const expectation = {
    binding,
    siteUid: observation.siteUid,
    physicalSiteUid: observation.physicalSiteUid,
    contractFingerprint: observation.contractFingerprint,
    siteContractFingerprint: observation.siteContractFingerprint,
    before: { software: observation.software.installed, os: observation.os.installed },
    target: structuredClone(target),
  };
  if (assessCeUpgradeTransition(expectation, observation) !== 'ready')
    throw new Error('Azure site version readiness has not converged');
  return build(base, expectation, contract);
}
async function verifyAzureTerraformUpgrade(base, upgrade, contract) {
  if (upgrade.schemaVersion !== 2 || upgrade.engine !== 'terraform')
    throw new Error('Azure Terraform upgrade schema is obsolete; prepare a new v2 plan');
  const expected = await build(base, upgrade.expectation, contract);
  if (canonicalSha256(upgrade) !== canonicalSha256(expected))
    throw new Error('Saved Azure Terraform upgrade plan changed');
}
async function runAzureTerraformUpgrade(
  base,
  upgrade,
  authorizedPlanSha256,
  runtime,
  contract,
  terraform,
  storage,
  env,
  signal,
) {
  return runTerraformCeUpgrade(
    upgrade,
    authorizedPlanSha256,
    (candidate) => verifyAzureTerraformUpgrade(base, candidate, contract),
    runtime,
    contract,
    terraform,
    storage,
    env,
    signal,
  );
}

// plugins/azure/src/ce/network-forwarding-expectations.ts
function require4(value) {
  if (!value) throw Error('Azure CE forwarding expectations are malformed, partial or identity-unverified');
}
function object4(value) {
  require4(value && typeof value === 'object' && !Array.isArray(value));
  return value;
}
function prefix2(value) {
  if (typeof value !== 'string') return false;
  const [address, bits, extra] = value.split('/');
  if (isIP2(address) !== 4 || extra !== undefined || !/^(?:[0-9]|[12][0-9]|3[0-2])$/.test(bits ?? '')) return false;
  const number = address.split('.').reduce((sum, octet) => sum * 256 + Number(octet), 0);
  return number % 2 ** (32 - Number(bits)) === 0;
}
function normalizeAzureForwardingExpectations(value, nodeCount, roles) {
  const profile = object4(value);
  require4(
    canonicalEqual(Object.keys(profile).sort(), ['after', 'before']) &&
      [1, 3].includes(nodeCount) &&
      ['slo', 'sli'].every((role) => roles.filter((v) => v === role).length === 1),
  );
  const normalize = (value) => {
    require4(Array.isArray(value) && value.length >= nodeCount * 2 && value.length <= 1024);
    const seen = new Set();
    const rows = value.map((raw) => {
      const row = object4(raw);
      require4(
        canonicalEqual(Object.keys(row).sort(), ['node', 'prefix', 'role', 'routeType']) &&
          typeof row.node === 'number' &&
          Number.isInteger(row.node) &&
          row.node >= 1 &&
          row.node <= nodeCount &&
          typeof row.role === 'string' &&
          ['slo', 'sli'].includes(row.role) &&
          prefix2(row.prefix) &&
          typeof row.routeType === 'string' &&
          ['REMOTE_SITE_ROUTE', 'LOCAL_ROUTE', 'STATIC_ROUTE', 'BGP_ROUTE'].includes(row.routeType),
      );
      const key = JSON.stringify([row.node, row.role, row.prefix]);
      require4(!seen.has(key));
      seen.add(key);
      return {
        node: row.node,
        role: row.role,
        prefix: row.prefix,
        routeType: row.routeType,
      };
    });
    for (let node = 1; node <= nodeCount; node++)
      for (const role of ['slo', 'sli']) require4(rows.some((row) => row.node === node && row.role === role));
    return rows.toSorted(
      (a, b) =>
        a.node - b.node || (a.role === 'slo' ? 0 : 1) - (b.role === 'slo' ? 0 : 1) || a.prefix.localeCompare(b.prefix),
    );
  };
  const normalized = { before: normalize(profile.before), after: normalize(profile.after) };
  for (let changed = 0; changed <= nodeCount; changed++)
    require4(
      normalized.after.filter((row) => row.node <= changed).length +
        normalized.before.filter((row) => row.node > changed).length <=
        1024,
    );
  return normalized;
}
function resolveAzureForwardingExpectations(plan, identity, physical, purpose) {
  const desired = plan.routing.forwardingRoutes;
  if (desired === undefined) {
    require4(plan.intent.routing.forwardingRoutes === undefined);
    return;
  }
  const binding = azureUpgradeBinding(plan),
    profile = normalizeAzureForwardingExpectations(
      desired,
      plan.topology.nodeCount,
      plan.nics.map((nic) => nic.role),
    );
  require4(
    canonicalEqual(desired, profile) &&
      canonicalEqual(plan.intent.routing.forwardingRoutes, profile) &&
      canonicalEqual(identity.owner, binding.owner) &&
      identity.planSha256 === plan.planSha256 &&
      identity.siteName === plan.siteName &&
      Number.isInteger(identity.node) &&
      identity.node >= 1 &&
      identity.node <= plan.topology.nodeCount &&
      ['preflight', 'restored', 'final'].includes(purpose),
  );
  const interfaces = binding.nodes.flatMap((node, index) =>
    ['slo', 'sli'].map((role) => {
      const nics = plan.nics.filter((nic) => nic.role === role);
      require4(nics.length === 1);
      const expected = identity.inventory.nodes[String(index + 1)]?.nics[String(nics[0].index)];
      const matches = physical.filter((row) => row.node === node && row.role === role);
      require4(expected && matches.length === 1 && matches[0].mac === expected.mac);
      const row = matches[0];
      return { node, role, mac: row.mac, device: row.device, interfaceName: row.interfaceName };
    }),
  );
  require4(physical.filter((row) => row.role === 'slo' || row.role === 'sli').length === interfaces.length);
  const routes = binding.nodes.flatMap((node, index) => {
    const changed = index + 1 < identity.node || (index + 1 === identity.node && purpose !== 'preflight');
    return profile[changed ? 'after' : 'before']
      .filter((row) => row.node === index + 1)
      .map((row) => ({ ...row, node }));
  });
  const result = { siteUid: identity.siteUid, interfaces, routes };
  validateExpectedForwardingRoutes(result, binding.nodes);
  return result;
}
function verifyAzureForwardingPredecessor(base, retained) {
  const desired = base.routing.forwardingRoutes,
    prior = retained.routing.forwardingRoutes;
  if (prior === undefined) return;
  require4(desired !== undefined && canonicalEqual(desired.before, prior.after));
}

// plugins/azure/src/ce/types.ts
var AZURE_CE_SCHEMA_VERSION = 3;
var AZURE_CE_CHECKPOINT_SCHEMA_VERSION = 4;
var AZURE_CE_SHARED_CONTRACT_URL =
  'https://f5-sales-demo.github.io/multi-cloud-networking/_llms-txt/en/customer-edge/automation-contract.txt';

// plugins/azure/src/ce/planner.ts
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/;
var RESOURCE_ID = /^\/subscriptions\/([^/]+)\/resourceGroups\/([^/]+)(?:\/providers\/([^/]+)\/(.+))?$/i;
var PORT = /^(?:\*|\d{1,5}(?:-\d{1,5})?)$/;
var F5_NAME = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
var DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
function fail(message) {
  throw new Error(`Azure CE plan validation failed: ${message}`);
}
function hasControlCharacters(value) {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}
function validateSafeString(label, value) {
  const normalized = value.trim();
  if (!normalized || hasControlCharacters(normalized)) fail(`${label} is empty or contains control characters`);
  return normalized;
}
function validateName(label, value) {
  const normalized = validateSafeString(label, value);
  if (!SAFE_NAME.test(normalized)) fail(`${label} contains unsupported characters`);
  return normalized;
}
function validateCidr(label, value) {
  const normalized = validateSafeString(label, value);
  const [address, prefix, extra] = normalized.split('/');
  const family = isIP3(address);
  if (
    !family ||
    address.includes('%') ||
    extra !== undefined ||
    !/^(?:0|[1-9]\d{0,2})$/.test(prefix ?? '') ||
    Number(prefix) > (family === 4 ? 32 : 128)
  )
    fail(`${label} is not a CIDR`);
  return normalized;
}
function validateResourceId(id, subscriptionId) {
  if (hasControlCharacters(id)) fail('resource ID contains control characters');
  const match = RESOURCE_ID.exec(id);
  if (!match) fail(`invalid Azure resource ID: ${id}`);
  if (match[1].toLowerCase() !== subscriptionId.toLowerCase())
    fail(`resource ID is in a different subscription: ${id}`);
}
function normalizeIntent(input) {
  if (input.initialVersions !== undefined) initialSoftwareSettings(input.initialVersions);
  if (input.schemaVersion !== AZURE_CE_SCHEMA_VERSION)
    fail(`unsupported intent schema version ${String(input.schemaVersion)}`);
  if (input.engine !== undefined && !['native', 'terraform'].includes(input.engine))
    fail('unsupported execution engine');
  if (!UUID.test(input.subscriptionId)) fail('subscriptionId must be a UUID');
  if (input.nics.length < 1 || input.nics.length > 8) fail('NIC count must be between 1 and 8');
  if (input.nics[0]?.role !== 'slo') fail('NIC 0 must have role slo');
  if (input.nics.some((nic) => !['slo', 'sli', 'data'].includes(nic.role)))
    fail('The pinned Azure bootstrap disables management networking; NIC roles must be slo, sli, or data');
  const marketplaceThreeNic =
    input.nics.length === 3 && input.nics[1]?.role === 'data' && input.nics[2]?.role === 'sli';
  if (input.nics.length > 1 && input.nics[1]?.role !== 'sli' && !marketplaceThreeNic)
    fail('SLI must be NIC 1, or NIC 2 in the explicit SLO/data/SLI marketplace layout');
  if (
    input.nics.filter((nic) => nic.role === 'slo').length !== 1 ||
    input.nics.filter((nic) => nic.role === 'sli').length !== (input.nics.length > 1 ? 1 : 0)
  )
    fail('SLO and SLI NIC roles must be unique');
  const subnetKeys = new Set();
  const nics = input.nics.map((nic, index) => {
    const name = validateName(`NIC ${index} name`, nic.name);
    const vrf = nic.vrf ? validateName(`NIC ${index} VRF`, nic.vrf) : undefined;
    const subnet = { ...nic.subnet };
    if (subnet.mode === 'greenfield') {
      if (!subnet.cidr || !subnet.name) fail(`greenfield NIC ${index} requires subnet name and CIDR`);
      subnet.name = validateName(`NIC ${index} subnet name`, subnet.name);
      subnet.cidr = validateCidr(`NIC ${index} subnet CIDR`, subnet.cidr);
    } else {
      if (!subnet.resourceId) fail(`brownfield NIC ${index} requires subnet resourceId`);
      validateResourceId(subnet.resourceId, input.subscriptionId);
    }
    const subnetKey = (subnet.resourceId ?? subnet.cidr ?? '').toLowerCase();
    if (subnetKeys.has(subnetKey)) fail('every ordered NIC must use a unique subnet');
    subnetKeys.add(subnetKey);
    return { ...nic, name, vrf, subnet };
  });
  for (const id of input.brownfield.resourceIds) validateResourceId(id, input.subscriptionId);
  for (const change of input.brownfield.routeChanges) {
    validateResourceId(change.routeTableId, input.subscriptionId);
    validateResourceId(change.subnetId, input.subscriptionId);
    validateName('route name', change.routeName);
    validateCidr('route destination', change.destinationCidr);
    if (!input.brownfield.resourceIds.some((id) => id.toLowerCase() === change.routeTableId.toLowerCase()))
      fail('route table must be listed in brownfield.resourceIds');
    if (!input.brownfield.resourceIds.some((id) => id.toLowerCase() === change.subnetId.toLowerCase()))
      fail('route subnet must be listed in brownfield.resourceIds');
  }
  const udr = input.routing.udr === undefined ? undefined : structuredClone(input.routing.udr);
  if (input.routing.udr !== undefined && (!udr || typeof udr !== 'object' || Array.isArray(udr)))
    fail('greenfield UDR profile must be an object');
  if (udr) {
    if (
      Object.keys(udr).sort().join(',') !== 'nextHop,subnetNames' ||
      !udr.nextHop ||
      Object.keys(udr.nextHop).sort().join(',') !== 'nicIndex,node' ||
      !Number.isInteger(udr.nextHop.node) ||
      udr.nextHop.node < 1 ||
      udr.nextHop.node > (input.topology.ha ? 3 : 1) ||
      !Number.isInteger(udr.nextHop.nicIndex) ||
      !nics[udr.nextHop.nicIndex] ||
      !Array.isArray(udr.subnetNames) ||
      udr.subnetNames.length === 0 ||
      new Set(udr.subnetNames).size !== udr.subnetNames.length ||
      input.routing.destinationCidrs.length === 0 ||
      input.brownfield.routeChanges.length !== 0 ||
      nics.some((nic) => nic.subnet.mode !== 'greenfield')
    )
      fail('greenfield UDR requires exact node/NIC next hop, destinations and distinct owned subnet associations');
    for (const name of udr.subnetNames) {
      validateName('UDR subnet', name);
      if (!nics.some((nic) => nic.subnet.name === name)) fail('UDR target subnet is not created by this deployment');
    }
    udr.subnetNames.sort();
  }
  let ingress = input.ingress === undefined ? undefined : structuredClone(input.ingress);
  const workloadFixture = input.workloadFixture === undefined ? undefined : structuredClone(input.workloadFixture);
  if (workloadFixture) {
    if (typeof workloadFixture.imageVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(workloadFixture.imageVersion))
      fail('workload fixture requires an exact Ubuntu image version; latest or unresolved identifiers are forbidden');
    if (
      input.engine !== 'terraform' ||
      input.operation !== 'deploy' ||
      input.routing.mode !== 'route-server' ||
      !validateName('workload fixture subnet', workloadFixture.subnetName) ||
      !validateCidr('workload fixture CIDR', workloadFixture.cidr) ||
      !usableIpv4Address(workloadFixture.privateIp, workloadFixture.cidr) ||
      !Number.isInteger(workloadFixture.port) ||
      workloadFixture.port < 1 ||
      workloadFixture.port > 65535 ||
      subnetKeys.has(workloadFixture.cidr.toLowerCase()) ||
      nics.some(
        (nic) =>
          nic.subnet.mode === 'greenfield' &&
          nic.subnet.cidr !== undefined &&
          overlappingIpv4Cidrs(workloadFixture.cidr, nic.subnet.cidr),
      ) ||
      !input.routing.destinationCidrs.includes(workloadFixture.cidr)
    )
      fail(
        'workload fixture requires a Terraform Route Server deploy, unique usable subnet/IP, and matching destination CIDR',
      );
    workloadFixture.subnetName = validateName('workload fixture subnet', workloadFixture.subnetName);
    workloadFixture.cidr = validateCidr('workload fixture CIDR', workloadFixture.cidr);
  }
  if (ingress?.mode === 'none') {
    if (Object.keys(ingress).join(',') !== 'mode') fail('disabled ingress contains unsupported fields');
  } else if (ingress?.mode === 'platform-http') {
    const listener = ingress.listener;
    const probe = ingress.probe;
    const sli = nics.find((nic) => nic.role === 'sli');
    if (
      Object.keys(ingress).sort().join(',') !== 'listener,mode,port,probe' ||
      !listener ||
      Object.keys(listener).sort().join(',') !== 'domain,name,namespace,originPool,privateAddress' ||
      !listener.originPool ||
      Object.keys(listener.originPool).sort().join(',') !== 'name,namespace' ||
      !probe ||
      Object.keys(probe).sort().join(',') !== 'expectedBodySha256,expectedStatus,path,sourceVmResourceId' ||
      !F5_NAME.test(listener.name) ||
      !F5_NAME.test(listener.namespace) ||
      !F5_NAME.test(listener.originPool.name) ||
      listener.originPool.namespace !== listener.namespace ||
      listener.namespace !== input.namespace ||
      listener.domain.length > 253 ||
      !DOMAIN.test(listener.domain) ||
      !Number.isInteger(ingress.port) ||
      ingress.port < 1 ||
      ingress.port > 65535 ||
      !sli ||
      sli.subnet.mode !== 'greenfield' ||
      !sli.subnet.cidr ||
      !usableIpv4Address(listener.privateAddress, sli.subnet.cidr) ||
      !/^\/[A-Za-z0-9._~/-]{0,512}$/.test(probe.path) ||
      !Number.isInteger(probe.expectedStatus) ||
      probe.expectedStatus < 100 ||
      probe.expectedStatus > 599 ||
      !/^[a-f0-9]{64}$/.test(probe.expectedBodySha256)
    )
      fail('platform HTTP ingress requires exact listener, SLI service address, and traffic-probe identities');
    validateResourceId(probe.sourceVmResourceId, input.subscriptionId);
    const source = probe.sourceVmResourceId.toLowerCase();
    if (
      !/^\/subscriptions\/[^/]+\/resourcegroups\/[^/]+\/providers\/microsoft\.compute\/virtualmachines\/[a-z0-9][a-z0-9._-]{0,63}$/i.test(
        source,
      )
    )
      fail('traffic probe source must be an exact virtual machine resource ID');
    if (!input.brownfield.resourceIds.some((id) => id.toLowerCase() === source))
      fail('traffic probe source VM must be listed in brownfield.resourceIds');
    ingress = { ...ingress, probe: { ...probe, sourceVmResourceId: source } };
  } else if (ingress !== undefined) {
    fail('unsupported ingress mode');
  }
  for (const rule of input.securityRules) {
    validateName('security rule name', rule.name);
    for (const cidr of [...rule.sourceCidrs, ...rule.destinationCidrs])
      validateCidr(`security rule ${rule.name} CIDR`, cidr);
    for (const port of rule.destinationPorts)
      if (!PORT.test(validateSafeString(`security rule ${rule.name} port`, port)))
        fail(`security rule ${rule.name} has an invalid port range`);
    if (rule.purpose === 'management' && rule.sourceCidrs.some((cidr) => cidr === '0.0.0.0/0' || cidr === '::/0')) {
    }
  }
  for (const [label, value] of [
    ['image publisher', input.image.publisher],
    ['image offer', input.image.offer],
    ['image plan', input.image.plan],
    ['VM size', input.vm.size],
  ])
    validateName(label, value);
  for (const zone of input.vm.zones ?? []) if (!/^\d+$/.test(zone)) fail(`invalid availability zone ${zone}`);
  for (const [label, asn] of [
    ['local ASN', input.routing.localAsn],
    ['peer ASN', input.routing.peerAsn],
  ]) {
    if (asn !== undefined && (!Number.isInteger(asn) || asn < 1 || asn > 4294967295)) fail(`${label} is invalid`);
  }
  return {
    ...input,
    ...(input.initialVersions ? { initialVersions: structuredClone(input.initialVersions) } : {}),
    engine: input.engine ?? 'native',
    subscriptionId: input.subscriptionId.toLowerCase(),
    deploymentName: validateName('deploymentName', input.deploymentName),
    siteName: validateName('siteName', input.siteName),
    namespace: validateName('namespace', input.namespace),
    resourceGroup: validateName('resourceGroup', input.resourceGroup),
    region: input.region?.trim().toLowerCase(),
    nics,
    routing: {
      ...input.routing,
      ...(udr ? { udr } : {}),
      ...(input.routing.forwardingRoutes === undefined
        ? {}
        : {
            forwardingRoutes: normalizeAzureForwardingExpectations(
              input.routing.forwardingRoutes,
              input.topology.ha ? 3 : 1,
              nics.map((nic) => nic.role),
            ),
          }),
      destinationCidrs: input.routing.destinationCidrs.map((cidr) => validateCidr('routing destination', cidr)).sort(),
    },
    ingress,
    workloadFixture,
    securityRules: [...input.securityRules].sort((a, b) => a.name.localeCompare(b.name)),
    brownfield: {
      resourceIds: [...new Set(input.brownfield.resourceIds.map((id) => id.toLowerCase()))].sort(),
      routeChanges: [...input.brownfield.routeChanges].sort((a, b) =>
        `${a.routeTableId}/${a.routeName}/${a.subnetId}`.localeCompare(
          `${b.routeTableId}/${b.routeName}/${b.subnetId}`,
        ),
      ),
    },
  };
}
function resourceById(observation, id) {
  return observation.resources.find((resource) => resource.id.toLowerCase() === id.toLowerCase());
}
function actionFactory() {
  let sequence = 0;
  return (action) => ({
    ...action,
    id: String(++sequence).padStart(3, '0'),
  });
}
function tagsArgs(deploymentName, engine) {
  return [
    `xcsh-execution-engine=${engine}`,
    'xcsh-managed-by=azure-ce',
    `xcsh-deployment-id=${deploymentName}`,
    'xcsh-plan-sha256=__PLAN_SHA256__',
  ];
}
function groupId(subscriptionId, resourceGroup) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}`;
}
function managedId(subscriptionId, resourceGroup, providerPath) {
  return `${groupId(subscriptionId, resourceGroup)}/providers/${providerPath}`;
}
function zoneArgs(zones, node) {
  const zone = zones[node - 1] ?? zones[0];
  return zone ? ['--zone', zone] : [];
}
function ipv4Range(cidr) {
  const [address, prefixText] = cidr.split('/');
  const octets = address.split('.').map(Number);
  const prefix = Number(prefixText);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255) ||
    !Number.isInteger(prefix) ||
    prefix < 0 ||
    prefix > 32
  )
    return;
  const value = (((octets[0] * 256 + octets[1]) * 256 + octets[2]) * 256 + octets[3]) >>> 0;
  const size = 2 ** (32 - prefix);
  const start = Math.floor(value / size) * size;
  return [start, start + size - 1];
}
function usableIpv4Address(address, cidr) {
  if (isIP3(address) !== 4) return false;
  const range = ipv4Range(cidr);
  if (!range) return false;
  const octets = address.split('.').map(Number);
  const value = (((octets[0] * 256 + octets[1]) * 256 + octets[2]) * 256 + octets[3]) >>> 0;
  return value > range[0] + 3 && value < range[1];
}
function overlappingIpv4Cidrs(left, right) {
  const leftRange = ipv4Range(left);
  const rightRange = ipv4Range(right);
  return Boolean(leftRange && rightRange && leftRange[0] <= rightRange[1] && rightRange[0] <= leftRange[1]);
}
function validateRouteServerIntent(intent) {
  const local = intent.routing.localAsn ?? intent.routing.peerAsn ?? 65010;
  const peer = intent.routing.peerAsn ?? local;
  if (local !== peer) fail('Route Server peering ASN must match the CE local ASN');
  const reserved = new Set([8074, 8075, 12076, 23456, 65515, 65517, 65518, 65519, 65520]);
  if (local > 65534 || reserved.has(local) || (local >= 64496 && local <= 64511))
    fail('Route Server requires an unreserved 16-bit CE ASN');
  for (const nic of intent.nics) {
    if (nic.subnet.name?.toLowerCase() === 'routeserversubnet')
      fail('RouteServerSubnet is dedicated to Route Server and cannot host a CE NIC');
    if (!nic.subnet.cidr || !ipv4Range(nic.subnet.cidr)) fail('Route Server requires IPv4 CE VNet subnets');
  }
}
function routeServerSubnetCidr(intent) {
  const occupied = [
    ...intent.nics
      .flatMap((nic) => (nic.subnet.cidr ? [ipv4Range(nic.subnet.cidr)] : []))
      .filter((range) => Boolean(range)),
    ...(intent.workloadFixture ? [ipv4Range(intent.workloadFixture.cidr)] : []),
  ].filter((range) => Boolean(range));
  const base = 10 * 256 * 256 * 256 + 255 * 256 * 256;
  for (let offset = 0; offset < 65536; offset += 64) {
    const candidate = [base + offset, base + offset + 63];
    if (occupied.every(([start, end]) => candidate[1] < start || candidate[0] > end)) {
      const third = Math.floor(offset / 256);
      const fourth = offset % 256;
      return `10.255.${third}.${fourth}/26`;
    }
  }
  fail('no non-overlapping /26 is available for RouteServerSubnet');
}
function routeTableParts(resourceId) {
  const match =
    /^\/subscriptions\/[^/]+\/resourceGroups\/([^/]+)\/providers\/Microsoft\.Network\/routeTables\/([^/]+)$/i.exec(
      resourceId,
    );
  if (!match) fail(`invalid route table resource ID: ${resourceId}`);
  return { resourceGroup: match[1], name: match[2] };
}
function subnetParts(resourceId) {
  const match =
    /^\/subscriptions\/[^/]+\/resourceGroups\/([^/]+)\/providers\/Microsoft\.Network\/virtualNetworks\/([^/]+)\/subnets\/([^/]+)$/i.exec(
      resourceId,
    );
  if (!match) fail(`invalid subnet resource ID: ${resourceId}`);
  return { resourceGroup: match[1], vnet: match[2], name: match[3] };
}
function buildDeployActions(intent, region, zones, routingMode, imageUrn, routeServerCidr, createResourceGroup = true) {
  const next = actionFactory();
  const actions = [];
  const tags = tagsArgs(intent.deploymentName, intent.engine ?? 'native');
  const greenfield = intent.nics.some((nic) => nic.subnet.mode === 'greenfield');
  if (greenfield) {
    const addressPrefixes = [
      ...new Set([
        ...intent.nics.flatMap((nic) => (nic.subnet.mode === 'greenfield' && nic.subnet.cidr ? [nic.subnet.cidr] : [])),
        ...(routeServerCidr ? [routeServerCidr] : []),
      ]),
    ].sort();
    if (createResourceGroup) {
      actions.push(
        next({
          phase: 'prerequisites',
          kind: 'resource-group-create',
          description: `Create resource group ${intent.resourceGroup}`,
          command: 'az',
          args: [
            'group',
            'create',
            '--name',
            intent.resourceGroup,
            '--location',
            region,
            '--subscription',
            intent.subscriptionId,
            '--tags',
            ...tags,
          ],
          resourceId: groupId(intent.subscriptionId, intent.resourceGroup),
          mutates: true,
          destructive: false,
        }),
      );
    }
    actions.push(
      next({
        phase: 'prerequisites',
        kind: 'vnet-create',
        description: `Create virtual network ${intent.deploymentName}-vnet`,
        command: 'az',
        args: [
          'network',
          'vnet',
          'create',
          '--resource-group',
          intent.resourceGroup,
          '--name',
          `${intent.deploymentName}-vnet`,
          '--location',
          region,
          '--address-prefixes',
          ...addressPrefixes,
          '--subscription',
          intent.subscriptionId,
          '--tags',
          ...tags,
        ],
        resourceId: managedId(
          intent.subscriptionId,
          intent.resourceGroup,
          `Microsoft.Network/virtualNetworks/${intent.deploymentName}-vnet`,
        ),
        mutates: true,
        destructive: false,
      }),
    );
    for (const nic of intent.nics) {
      if (nic.subnet.mode !== 'greenfield') continue;
      actions.push(
        next({
          phase: 'prerequisites',
          kind: 'subnet-create',
          description: `Create subnet ${nic.subnet.name}`,
          command: 'az',
          args: [
            'network',
            'vnet',
            'subnet',
            'create',
            '--resource-group',
            intent.resourceGroup,
            '--vnet-name',
            `${intent.deploymentName}-vnet`,
            '--name',
            nic.subnet.name ?? '',
            '--address-prefixes',
            nic.subnet.cidr ?? '',
            '--subscription',
            intent.subscriptionId,
          ],
          resourceId: managedId(
            intent.subscriptionId,
            intent.resourceGroup,
            `Microsoft.Network/virtualNetworks/${intent.deploymentName}-vnet/subnets/${nic.subnet.name ?? ''}`,
          ),
          mutates: true,
          destructive: false,
        }),
      );
    }
  }
  if (intent.securityRules.length > 0) {
    actions.push(
      next({
        phase: 'prerequisites',
        kind: 'nsg-create',
        description: `Create explicit CE network security group ${intent.deploymentName}-nsg`,
        command: 'az',
        args: [
          'network',
          'nsg',
          'create',
          '--resource-group',
          intent.resourceGroup,
          '--name',
          `${intent.deploymentName}-nsg`,
          '--location',
          region,
          '--subscription',
          intent.subscriptionId,
          '--tags',
          ...tags,
        ],
        resourceId: managedId(
          intent.subscriptionId,
          intent.resourceGroup,
          `Microsoft.Network/networkSecurityGroups/${intent.deploymentName}-nsg`,
        ),
        mutates: true,
        destructive: false,
      }),
    );
    for (const [index, rule] of intent.securityRules.entries()) {
      actions.push(
        next({
          phase: 'prerequisites',
          kind: 'nsg-rule-create',
          description: `Create explicit ${rule.purpose} rule ${rule.name}`,
          command: 'az',
          args: [
            'network',
            'nsg',
            'rule',
            'create',
            '--resource-group',
            intent.resourceGroup,
            '--nsg-name',
            `${intent.deploymentName}-nsg`,
            '--name',
            rule.name,
            '--priority',
            String(100 + index),
            '--direction',
            rule.direction,
            '--protocol',
            rule.protocol,
            '--source-address-prefixes',
            ...rule.sourceCidrs,
            '--destination-address-prefixes',
            ...rule.destinationCidrs,
            '--destination-port-ranges',
            ...rule.destinationPorts,
            '--access',
            'Allow',
            '--subscription',
            intent.subscriptionId,
          ],
          resourceId: managedId(
            intent.subscriptionId,
            intent.resourceGroup,
            `Microsoft.Network/networkSecurityGroups/${intent.deploymentName}-nsg/securityRules/${rule.name}`,
          ),
          mutates: true,
          destructive: false,
        }),
      );
    }
  }
  const nodeCount = intent.topology.ha ? 3 : 1;
  for (let node = 1; node <= nodeCount; node++) {
    const nodeName = `${intent.deploymentName}-${node}`;
    if (intent.egress.mode === 'public-ip') {
      actions.push(
        next({
          phase: 'nodes',
          kind: 'public-ip-create',
          description: `Create Standard public IP for ${nodeName}`,
          command: 'az',
          args: [
            'network',
            'public-ip',
            'create',
            '--resource-group',
            intent.resourceGroup,
            '--name',
            `${nodeName}-pip`,
            '--sku',
            'Standard',
            '--allocation-method',
            'Static',
            ...zoneArgs(zones, node),
            '--subscription',
            intent.subscriptionId,
            '--tags',
            ...tags,
          ],
          resourceId: managedId(
            intent.subscriptionId,
            intent.resourceGroup,
            `Microsoft.Network/publicIPAddresses/${nodeName}-pip`,
          ),
          node,
          mutates: true,
          destructive: false,
        }),
      );
    }
    for (const [index, nic] of intent.nics.entries()) {
      const subnetArgs = nic.subnet.resourceId
        ? ['--subnet', nic.subnet.resourceId]
        : ['--vnet-name', `${intent.deploymentName}-vnet`, '--subnet', nic.subnet.name ?? ''];
      const publicIpArgs =
        intent.egress.mode === 'public-ip' && index === 0 ? ['--public-ip-address', `${nodeName}-pip`] : [];
      const nsgArgs =
        intent.securityRules.length > 0 ? ['--network-security-group', `${intent.deploymentName}-nsg`] : [];
      actions.push(
        next({
          phase: 'nodes',
          kind: 'nic-create',
          description: `Create ordered NIC ${index} (${nic.role}) for ${nodeName}`,
          command: 'az',
          args: [
            'network',
            'nic',
            'create',
            '--resource-group',
            intent.resourceGroup,
            '--name',
            `${nodeName}-nic${index}`,
            ...subnetArgs,
            ...publicIpArgs,
            ...nsgArgs,
            '--subscription',
            intent.subscriptionId,
            '--tags',
            ...tags,
          ],
          resourceId: managedId(
            intent.subscriptionId,
            intent.resourceGroup,
            `Microsoft.Network/networkInterfaces/${nodeName}-nic${index}`,
          ),
          node,
          mutates: true,
          destructive: false,
        }),
      );
    }
    const nicNames = ['--nics', ...intent.nics.map((_nic, index) => `${nodeName}-nic${index}`)];
    actions.push(
      next({
        phase: 'nodes',
        kind: 'vm-create',
        description: `Launch ${nodeName} from the pinned CE image`,
        command: 'az',
        args: [
          'vm',
          'create',
          '--resource-group',
          intent.resourceGroup,
          '--name',
          nodeName,
          '--image',
          imageUrn,
          '--size',
          intent.vm.size,
          ...zoneArgs(zones, node),
          ...nicNames,
          '--plan-name',
          intent.image.plan,
          '--plan-product',
          intent.image.offer,
          '--plan-publisher',
          intent.image.publisher,
          '--os-disk-size-gb',
          '80',
          '--os-disk-delete-option',
          'Delete',
          '--custom-data',
          '__BOOTSTRAP_FILE__',
          '--subscription',
          intent.subscriptionId,
          '--tags',
          ...tags,
        ],
        resourceId: managedId(
          intent.subscriptionId,
          intent.resourceGroup,
          `Microsoft.Compute/virtualMachines/${nodeName}`,
        ),
        node,
        mutates: true,
        destructive: false,
        requiresBootstrap: true,
      }),
    );
    actions.push(
      next({
        phase: 'registration',
        kind: 'health-gate',
        description: `Wait for ${nodeName} registration and health`,
        node,
        mutates: false,
        destructive: false,
      }),
    );
  }
  if (routingMode === 'route-server') {
    const hostedSubnetId = managedId(
      intent.subscriptionId,
      intent.resourceGroup,
      `Microsoft.Network/virtualNetworks/${intent.deploymentName}-vnet/subnets/RouteServerSubnet`,
    );
    actions.push(
      next({
        phase: 'routing',
        kind: 'subnet-create',
        description: 'Create dedicated /26 RouteServerSubnet without NSG or UDR',
        command: 'az',
        args: [
          'network',
          'vnet',
          'subnet',
          'create',
          '--resource-group',
          intent.resourceGroup,
          '--vnet-name',
          `${intent.deploymentName}-vnet`,
          '--name',
          'RouteServerSubnet',
          '--address-prefixes',
          routeServerCidr ?? '',
          '--subscription',
          intent.subscriptionId,
        ],
        resourceId: hostedSubnetId,
        mutates: true,
        destructive: false,
      }),
    );
    actions.push(
      next({
        phase: 'routing',
        kind: 'public-ip-create',
        description: `Create Standard public IP for Route Server ${intent.deploymentName}-rs`,
        command: 'az',
        args: [
          'network',
          'public-ip',
          'create',
          '--resource-group',
          intent.resourceGroup,
          '--name',
          `${intent.deploymentName}-rs-pip`,
          '--sku',
          'Standard',
          '--allocation-method',
          'Static',
          '--subscription',
          intent.subscriptionId,
          '--tags',
          ...tags,
        ],
        resourceId: managedId(
          intent.subscriptionId,
          intent.resourceGroup,
          `Microsoft.Network/publicIPAddresses/${intent.deploymentName}-rs-pip`,
        ),
        mutates: true,
        destructive: false,
      }),
    );
    actions.push(
      next({
        phase: 'routing',
        kind: 'route-server-create',
        description: `Create Route Server ${intent.deploymentName}-rs`,
        command: 'az',
        args: [
          'network',
          'routeserver',
          'create',
          '--resource-group',
          intent.resourceGroup,
          '--name',
          `${intent.deploymentName}-rs`,
          '--hosted-subnet',
          hostedSubnetId,
          '--public-ip-address',
          `${intent.deploymentName}-rs-pip`,
          '--subscription',
          intent.subscriptionId,
          '--tags',
          ...tags,
        ],
        resourceId: managedId(
          intent.subscriptionId,
          intent.resourceGroup,
          `Microsoft.Network/virtualHubs/${intent.deploymentName}-rs`,
        ),
        mutates: true,
        destructive: false,
      }),
    );
    for (let node = 1; node <= nodeCount; node++) {
      actions.push(
        next({
          phase: 'routing',
          kind: 'route-server-peer-create',
          description: `Peer CE node ${node} with both Route Server instances`,
          command: 'az',
          args: [
            'network',
            'routeserver',
            'peering',
            'create',
            '--resource-group',
            intent.resourceGroup,
            '--routeserver',
            `${intent.deploymentName}-rs`,
            '--name',
            `${intent.deploymentName}-${node}`,
            '--peer-ip',
            `__NODE_${node}_SLO_PRIVATE_IP__`,
            '--peer-asn',
            String(intent.routing.localAsn ?? intent.routing.peerAsn ?? 65010),
            '--subscription',
            intent.subscriptionId,
          ],
          resourceId: managedId(
            intent.subscriptionId,
            intent.resourceGroup,
            `Microsoft.Network/virtualHubs/${intent.deploymentName}-rs/bgpConnections/${intent.deploymentName}-${node}`,
          ),
          node,
          mutates: true,
          destructive: false,
        }),
      );
    }
    actions.push(
      next({
        phase: 'verify',
        kind: 'bgp-gate',
        description: 'Verify both Route Server BGP instances and learned routes',
        mutates: false,
        destructive: false,
      }),
    );
  } else {
    if (intent.brownfield.routeChanges.length > 0) {
      for (const change of intent.brownfield.routeChanges) {
        const table = routeTableParts(change.routeTableId);
        const subnet = subnetParts(change.subnetId);
        actions.push(
          next({
            phase: 'routing',
            kind: 'route-create',
            description: `Create approved brownfield route ${change.routeName}`,
            command: 'az',
            args: [
              'network',
              'route-table',
              'route',
              'create',
              '--resource-group',
              table.resourceGroup,
              '--route-table-name',
              table.name,
              '--name',
              change.routeName,
              '--address-prefix',
              change.destinationCidr,
              '--next-hop-type',
              'VirtualAppliance',
              '--next-hop-ip-address',
              '__NODE_1_DATA_PRIVATE_IP__',
              '--subscription',
              intent.subscriptionId,
            ],
            resourceId: change.routeTableId,
            mutates: true,
            destructive: false,
          }),
        );
        actions.push(
          next({
            phase: 'routing',
            kind: 'route-association-update',
            description: `Associate only approved subnet ${change.subnetId}`,
            command: 'az',
            args: [
              'network',
              'vnet',
              'subnet',
              'update',
              '--resource-group',
              subnet.resourceGroup,
              '--vnet-name',
              subnet.vnet,
              '--name',
              subnet.name,
              '--route-table',
              change.routeTableId,
              '--subscription',
              intent.subscriptionId,
            ],
            resourceId: change.subnetId,
            mutates: true,
            destructive: false,
          }),
        );
      }
    } else {
      actions.push(
        next({
          phase: 'routing',
          kind: 'route-table-create',
          description: `Create route table ${intent.deploymentName}-rt`,
          command: 'az',
          args: [
            'network',
            'route-table',
            'create',
            '--resource-group',
            intent.resourceGroup,
            '--name',
            `${intent.deploymentName}-rt`,
            '--subscription',
            intent.subscriptionId,
            '--tags',
            ...tags,
          ],
          resourceId: managedId(
            intent.subscriptionId,
            intent.resourceGroup,
            `Microsoft.Network/routeTables/${intent.deploymentName}-rt`,
          ),
          mutates: true,
          destructive: false,
        }),
      );
      for (const [index, destination] of intent.routing.destinationCidrs.entries()) {
        actions.push(
          next({
            phase: 'routing',
            kind: 'route-create',
            description: `Route ${destination} through the CE data-plane private IP`,
            command: 'az',
            args: [
              'network',
              'route-table',
              'route',
              'create',
              '--resource-group',
              intent.resourceGroup,
              '--route-table-name',
              `${intent.deploymentName}-rt`,
              '--name',
              `ce-route-${index + 1}`,
              '--address-prefix',
              destination,
              '--next-hop-type',
              'VirtualAppliance',
              '--next-hop-ip-address',
              intent.routing.udr
                ? `__NODE_${intent.routing.udr.nextHop.node}_NIC_${intent.routing.udr.nextHop.nicIndex}_PRIVATE_IP__`
                : '__NODE_1_DATA_PRIVATE_IP__',
              '--subscription',
              intent.subscriptionId,
            ],
            resourceId: managedId(
              intent.subscriptionId,
              intent.resourceGroup,
              `Microsoft.Network/routeTables/${intent.deploymentName}-rt/routes/ce-route-${index + 1}`,
            ),
            mutates: true,
            destructive: false,
          }),
        );
      }
      for (const name of intent.routing.udr?.subnetNames ?? []) {
        actions.push(
          next({
            phase: 'routing',
            kind: 'route-association-update',
            description: `Associate reviewed newly created subnet ${name} with the owned CE route table`,
            command: 'az',
            args: [
              'network',
              'vnet',
              'subnet',
              'update',
              '--resource-group',
              intent.resourceGroup,
              '--vnet-name',
              `${intent.deploymentName}-vnet`,
              '--name',
              name,
              '--route-table',
              managedId(
                intent.subscriptionId,
                intent.resourceGroup,
                `Microsoft.Network/routeTables/${intent.deploymentName}-rt`,
              ),
              '--subscription',
              intent.subscriptionId,
            ],
            resourceId: managedId(
              intent.subscriptionId,
              intent.resourceGroup,
              `Microsoft.Network/virtualNetworks/${intent.deploymentName}-vnet/subnets/${name}`,
            ),
            mutates: true,
            destructive: false,
          }),
        );
      }
    }
  }
  if (intent.ingress?.mode === 'platform-http') {
    actions.push(
      next({
        phase: 'routing',
        kind: 'f5-ingress-configure',
        description: 'Configure the reviewed platform HTTP listener and site-local origin',
        mutates: true,
        destructive: false,
      }),
      next({
        phase: 'verify',
        kind: 'traffic-gate',
        description: 'Verify content-bound end-to-end traffic through the platform listener',
        mutates: false,
        destructive: false,
      }),
    );
  }
  return actions;
}
function buildLifecycleActions(intent, observation, zones) {
  const next = actionFactory();
  const nodeCount = intent.topology.ha ? 3 : 1;
  const actions = [];
  const nodes =
    intent.operation === 'replace-node' && intent.replacementNode
      ? [intent.replacementNode]
      : Array.from({ length: nodeCount }, (_, index) => index + 1);
  const ownedPlanSha256 = (resourceId, label) => {
    const resource = resourceById(observation, resourceId);
    const digest = resource?.tags['xcsh-plan-sha256'];
    if (
      !resource?.exists ||
      !resource.owned ||
      resource.tags['xcsh-managed-by'] !== 'azure-ce' ||
      resource.tags['xcsh-deployment-id'] !== intent.deploymentName ||
      resource.tags['xcsh-execution-engine'] !== (intent.engine ?? 'native') ||
      !digest ||
      !/^[a-f0-9]{64}$/.test(digest)
    )
      fail(`${label} is missing exact observed ownership`);
    return digest;
  };
  const verbByOperation = {
    start: ['vm-start', ['vm', 'start']],
    stop: ['vm-stop', ['vm', 'deallocate']],
    resize: ['vm-resize', ['vm', 'resize', '--size', intent.vm.size]],
  };
  const lifecycleOperation =
    intent.operation === 'reconcile' || intent.operation === 'repair' ? 'start' : intent.operation;
  if (lifecycleOperation in verbByOperation) {
    const [kind, baseArgs] = verbByOperation[lifecycleOperation];
    for (const node of nodes) {
      const name = `${intent.deploymentName}-${node}`;
      const vmId = managedId(intent.subscriptionId, intent.resourceGroup, `Microsoft.Compute/virtualMachines/${name}`);
      const expectedOwnerPlanSha256 = ownedPlanSha256(vmId, `lifecycle VM ${name}`);
      actions.push(
        next({
          phase: 'nodes',
          kind,
          description: `${intent.operation} ${name}`,
          command: 'az',
          args: [
            ...baseArgs.slice(0, 2),
            '--resource-group',
            intent.resourceGroup,
            '--name',
            name,
            ...baseArgs.slice(2),
            '--subscription',
            intent.subscriptionId,
          ],
          resourceId: vmId,
          node,
          mutates: true,
          destructive: intent.operation === 'replace-node',
          expectedOwnerPlanSha256,
        }),
      );
      actions.push(
        next({
          phase: 'verify',
          kind: 'vm-state-gate',
          description: `Verify ${name} is ${intent.operation === 'stop' ? 'deallocated' : 'running'}`,
          node,
          mutates: false,
          destructive: false,
          expectedPowerState: intent.operation === 'stop' ? 'deallocated' : 'running',
          expectedOwnerPlanSha256,
          expectedVmSize: intent.operation === 'resize' ? intent.vm.size : undefined,
        }),
      );
      if (intent.operation !== 'stop') {
        actions.push(
          next({
            phase: 'registration',
            kind: 'health-gate',
            description: `Gate online node ${node} before continuing`,
            node,
            mutates: false,
            destructive: false,
          }),
        );
        if (intent.ingress?.mode === 'platform-http')
          actions.push(
            next({
              phase: 'verify',
              kind: 'traffic-gate',
              description: `Gate traffic after ${intent.operation} of node ${node}`,
              node,
              mutates: false,
              destructive: false,
            }),
          );
      }
    }
    return actions;
  }
  if (intent.operation === 'replace-node') {
    if (!intent.replacementNode || intent.replacementNode < 1 || intent.replacementNode > nodeCount)
      fail(`replacementNode must be between 1 and ${nodeCount}`);
    const node = intent.replacementNode;
    const name = `${intent.deploymentName}-${node}`;
    const vmId = managedId(intent.subscriptionId, intent.resourceGroup, `Microsoft.Compute/virtualMachines/${name}`);
    const expectedOwnerPlanSha256 = ownedPlanSha256(vmId, `replacement VM ${name}`);
    actions.push(
      next({
        phase: 'nodes',
        kind: 'vm-delete',
        description: `Delete only owned node ${name}`,
        command: 'az',
        args: [
          'vm',
          'delete',
          '--resource-group',
          intent.resourceGroup,
          '--name',
          name,
          '--yes',
          '--subscription',
          intent.subscriptionId,
        ],
        resourceId: vmId,
        node,
        mutates: true,
        destructive: true,
        expectedOwnerPlanSha256,
      }),
    );
    const nicArgs = ['--nics', ...intent.nics.map((_nic, index) => `${name}-nic${index}`)];
    actions.push(
      next({
        phase: 'nodes',
        kind: 'vm-create',
        description: `Replace ${name} from the pinned CE image`,
        command: 'az',
        args: [
          'vm',
          'create',
          '--resource-group',
          intent.resourceGroup,
          '--name',
          name,
          '--image',
          observation.image.urn,
          '--size',
          intent.vm.size,
          ...zoneArgs(zones, node),
          ...nicArgs,
          '--plan-name',
          intent.image.plan,
          '--plan-product',
          intent.image.offer,
          '--plan-publisher',
          intent.image.publisher,
          '--os-disk-size-gb',
          '80',
          '--os-disk-delete-option',
          'Delete',
          '--custom-data',
          '__BOOTSTRAP_FILE__',
          '--subscription',
          intent.subscriptionId,
          '--tags',
          ...tagsArgs(intent.deploymentName, intent.engine ?? 'native'),
        ],
        resourceId: vmId,
        node,
        mutates: true,
        destructive: false,
        requiresBootstrap: true,
      }),
    );
    actions.push(
      next({
        phase: 'registration',
        kind: 'health-gate',
        description: `Verify replacement node ${node} registration, health, and routing`,
        node,
        mutates: false,
        destructive: false,
      }),
    );
    if (intent.routing.mode === 'route-server')
      actions.push(
        next({
          phase: 'routing',
          kind: 'bgp-gate',
          description: `Verify Route Server sessions and routes after replacing node ${node}`,
          node,
          mutates: false,
          destructive: false,
        }),
      );
    if (intent.ingress?.mode === 'platform-http')
      actions.push(
        next({
          phase: 'verify',
          kind: 'traffic-gate',
          description: `Verify traffic after replacing node ${node}`,
          node,
          mutates: false,
          destructive: false,
        }),
      );
    return actions;
  }
  if (intent.operation === 'update-network') {
    const routeServerId = managedId(
      intent.subscriptionId,
      intent.resourceGroup,
      `Microsoft.Network/virtualHubs/${intent.deploymentName}-rs`,
    );
    const expectedRouteServerOwnerPlanSha256 =
      intent.routing.mode === 'route-server' ? ownedPlanSha256(routeServerId, 'retained Route Server') : undefined;
    for (const node of nodes) {
      const name = `${intent.deploymentName}-${node}`;
      const vmId = managedId(intent.subscriptionId, intent.resourceGroup, `Microsoft.Compute/virtualMachines/${name}`);
      const expectedVmOwnerPlanSha256 = ownedPlanSha256(vmId, `network-update VM ${name}`);
      actions.push(
        next({
          phase: 'nodes',
          kind: 'vm-deallocate',
          description: `Deallocate ${name} before the symmetric NIC update`,
          command: 'az',
          args: [
            'vm',
            'deallocate',
            '--resource-group',
            intent.resourceGroup,
            '--name',
            name,
            '--subscription',
            intent.subscriptionId,
          ],
          resourceId: vmId,
          node,
          mutates: true,
          destructive: false,
          expectedOwnerPlanSha256: expectedVmOwnerPlanSha256,
        }),
      );
      for (const [index, nic] of intent.nics.entries()) {
        const subnetId =
          nic.subnet.resourceId ??
          managedId(
            intent.subscriptionId,
            intent.resourceGroup,
            `Microsoft.Network/virtualNetworks/${intent.deploymentName}-vnet/subnets/${nic.subnet.name ?? ''}`,
          );
        const nicId = managedId(
          intent.subscriptionId,
          intent.resourceGroup,
          `Microsoft.Network/networkInterfaces/${name}-nic${index}`,
        );
        const expectedNicOwnerPlanSha256 = ownedPlanSha256(nicId, `network-update NIC ${name}-nic${index}`);
        actions.push(
          next({
            phase: 'nodes',
            kind: 'nic-update',
            description: `Update NIC ${index} (${nic.role}) on ${name}`,
            command: 'az',
            args: [
              'network',
              'nic',
              'ip-config',
              'update',
              '--resource-group',
              intent.resourceGroup,
              '--nic-name',
              `${name}-nic${index}`,
              '--name',
              `__NODE_${node}_NIC_${index}_IPCONFIG_NAME__`,
              '--subnet',
              subnetId,
              '--subscription',
              intent.subscriptionId,
            ],
            resourceId: nicId,
            node,
            mutates: true,
            destructive: false,
            expectedOwnerPlanSha256: expectedNicOwnerPlanSha256,
          }),
        );
      }
      actions.push(
        next({
          phase: 'nodes',
          kind: 'vm-start',
          description: `Start ${name} after NIC update`,
          command: 'az',
          args: [
            'vm',
            'start',
            '--resource-group',
            intent.resourceGroup,
            '--name',
            name,
            '--subscription',
            intent.subscriptionId,
          ],
          resourceId: vmId,
          node,
          mutates: true,
          destructive: false,
          expectedOwnerPlanSha256: expectedVmOwnerPlanSha256,
        }),
      );
      actions.push(
        next({
          phase: 'registration',
          kind: 'health-gate',
          description: `Gate ${name} registration, health, data-plane restart, and routing`,
          node,
          mutates: false,
          destructive: false,
        }),
      );
      if (intent.routing.mode === 'route-server') {
        actions.push(
          next({
            phase: 'routing',
            kind: 'route-server-peer-update',
            description: `Update Route Server peer ${name} to the observed SLO address`,
            command: 'az',
            args: [
              'network',
              'routeserver',
              'peering',
              'update',
              '--resource-group',
              intent.resourceGroup,
              '--routeserver',
              `${intent.deploymentName}-rs`,
              '--name',
              name,
              '--peer-ip',
              `__NODE_${node}_SLO_PRIVATE_IP__`,
              '--peer-asn',
              String(intent.routing.localAsn ?? intent.routing.peerAsn ?? 65010),
              '--subscription',
              intent.subscriptionId,
            ],
            resourceId: `${routeServerId}/bgpConnections/${name}`,
            node,
            mutates: true,
            destructive: false,
            expectedOwnerPlanSha256: expectedRouteServerOwnerPlanSha256,
          }),
        );
      }
      if (intent.ingress?.mode === 'platform-http')
        actions.push(
          next({
            phase: 'verify',
            kind: 'traffic-gate',
            description: `Gate traffic before updating another node`,
            node,
            mutates: false,
            destructive: false,
          }),
        );
    }
    if (intent.routing.mode === 'route-server')
      actions.push(
        next({
          phase: 'routing',
          kind: 'bgp-gate',
          description: 'Verify Route Server convergence after all retained peer updates',
          mutates: false,
          destructive: false,
        }),
      );
    return actions;
  }
  if (intent.operation === 'teardown') {
    for (const change of [...intent.brownfield.routeChanges].reverse()) {
      const table = routeTableParts(change.routeTableId);
      const subnet = subnetParts(change.subnetId);
      const tableState = resourceById(observation, change.routeTableId)?.state ?? {};
      const subnetState = resourceById(observation, change.subnetId)?.state ?? {};
      const routes = Array.isArray(tableState.routes) ? tableState.routes : [];
      const previous = routes.find((route) => String(route.name ?? route.properties?.name) === change.routeName);
      const previousProperties = previous?.properties ?? previous;
      const routeArgs = previous
        ? [
            'network',
            'route-table',
            'route',
            'create',
            '--resource-group',
            table.resourceGroup,
            '--route-table-name',
            table.name,
            '--name',
            change.routeName,
            '--address-prefix',
            String(previousProperties?.addressPrefix ?? change.destinationCidr),
            '--next-hop-type',
            String(previousProperties?.nextHopType ?? 'None'),
          ]
        : [
            'network',
            'route-table',
            'route',
            'delete',
            '--resource-group',
            table.resourceGroup,
            '--route-table-name',
            table.name,
            '--name',
            change.routeName,
          ];
      if (previousProperties?.nextHopIpAddress)
        routeArgs.push('--next-hop-ip-address', String(previousProperties.nextHopIpAddress));
      actions.push(
        next({
          phase: 'teardown',
          kind: 'brownfield-restore',
          description: `Restore approved route ${change.routeName} exactly`,
          command: 'az',
          args: [...routeArgs, '--subscription', intent.subscriptionId],
          resourceId: change.routeTableId,
          mutates: true,
          destructive: false,
        }),
      );
      const previousRouteTable = subnetState.routeTable?.id;
      actions.push(
        next({
          phase: 'teardown',
          kind: 'brownfield-restore',
          description: `Restore approved subnet route-table association exactly`,
          command: 'az',
          args: [
            'network',
            'vnet',
            'subnet',
            'update',
            '--resource-group',
            subnet.resourceGroup,
            '--vnet-name',
            subnet.vnet,
            '--name',
            subnet.name,
            ...(previousRouteTable ? ['--route-table', String(previousRouteTable)] : ['--remove', 'routeTable']),
            '--subscription',
            intent.subscriptionId,
          ],
          resourceId: change.subnetId,
          mutates: true,
          destructive: false,
        }),
      );
    }
    const teardownPriority = (resource) => {
      const id = resource.id.toLowerCase();
      if (id.includes('/bgpconnections/')) return 10;
      if (id.includes('/virtualmachines/')) return 20;
      if (id.includes('/networkinterfaces/')) return 30;
      if (id.includes('/virtualhubs/')) return 40;
      if (id.includes('/publicipaddresses/')) return 50;
      if (id.includes('/routetables/')) return 60;
      if (id.includes('/networksecuritygroups/')) return 70;
      if (id.includes('/virtualnetworks/')) return 80;
      if (!id.includes('/providers/')) return 100;
      return 90;
    };
    const owned = observation.resources
      .filter(
        (resource) =>
          resource.exists &&
          resource.owned &&
          resource.tags['xcsh-managed-by'] === 'azure-ce' &&
          resource.tags['xcsh-deployment-id'] === intent.deploymentName,
      )
      .sort((a, b) => teardownPriority(a) - teardownPriority(b) || a.id.localeCompare(b.id));
    for (const resource of owned)
      actions.push(
        next({
          phase: 'teardown',
          kind: 'resource-delete',
          description: `Delete owned resource ${resource.id}`,
          command: 'az',
          args: resource.id.includes('/providers/')
            ? ['resource', 'delete', '--ids', resource.id, '--subscription', intent.subscriptionId]
            : ['group', 'delete', '--name', intent.resourceGroup, '--yes', '--subscription', intent.subscriptionId],
          resourceId: resource.id,
          mutates: true,
          destructive: true,
        }),
      );
    return actions;
  }
  actions.push(
    next({
      phase: 'verify',
      kind: 'health-gate',
      description: `Reconcile and verify ${intent.deploymentName}`,
      mutates: false,
      destructive: false,
    }),
  );
  return actions;
}
function compileAzureCePlan(input, observation) {
  const intent = normalizeIntent(input);
  if (observation.schemaVersion !== AZURE_CE_SCHEMA_VERSION) fail('unsupported observation schema');
  for (const resource of observation.resources) {
    if (
      resource.owned &&
      resource.tags['xcsh-deployment-id'] === intent.deploymentName &&
      resource.tags['xcsh-execution-engine'] !== intent.engine
    )
      fail('deployment resources belong to another or unknown execution engine');
  }
  const requiredResearchCommands = [
    'az vm image list-publishers',
    'az vm image list-offers',
    'az vm image list-skus',
    'az vm image list',
    'az vm image terms show',
    'az vm list-skus --all',
  ];
  if (observation.research?.method !== 'azure-cli-live') fail('live Azure research receipt is required');
  if (observation.research.officialSourceRetrieval !== 'live')
    fail('live official-source research receipt is required');
  for (const command of requiredResearchCommands) {
    if (!observation.research.commands.includes(command)) fail(`live Azure research receipt is missing ${command}`);
  }
  if (!observation.research.officialSources.some((source) => source.startsWith('https://docs.cloud.f5.com/')))
    fail('official F5 research source is required');
  if (!observation.research.officialSources.some((source) => source.startsWith('https://learn.microsoft.com/')))
    fail('official Microsoft research source is required');
  if (
    observation.research.sharedContract?.url !== AZURE_CE_SHARED_CONTRACT_URL ||
    observation.research.sharedContract.contractId !== 'f5xc-ce-automation-policy' ||
    observation.research.sharedContract.contractVersion !== 'v2' ||
    !/^[a-f0-9]{64}$/.test(observation.research.sharedContract.normalizedSha256)
  )
    fail('valid live shared Customer Edge automation contract receipt is required');
  const receiptUrls = new Set();
  for (const receipt of observation.research.sourceReceipts ?? []) {
    if (!receipt.url.startsWith('https://') || !/^[a-f0-9]{64}$/.test(receipt.normalizedSha256))
      fail('live official-source research receipt contains an invalid digest');
    if (receiptUrls.has(receipt.url)) fail('live official-source research receipt contains duplicate URLs');
    receiptUrls.add(receipt.url);
  }
  for (const source of [...observation.research.officialSources, AZURE_CE_SHARED_CONTRACT_URL])
    if (!receiptUrls.has(source)) fail(`live official-source research receipt is missing ${source}`);
  const sharedReceipt = observation.research.sourceReceipts.find(
    (receipt) => receipt.url === AZURE_CE_SHARED_CONTRACT_URL,
  );
  if (sharedReceipt?.normalizedSha256 !== observation.research.sharedContract.normalizedSha256)
    fail('shared Customer Edge automation contract receipt digest is inconsistent');
  if (observation.subscription.cloud !== 'AzureCloud') fail('only AzureCloud is supported');
  if (observation.subscription.id.toLowerCase() !== intent.subscriptionId)
    fail('observation subscription does not match intent');
  if (
    ['deploy', 'replace-node', 'repair'].includes(intent.operation) &&
    observation.image.termsAccepted !== true &&
    !(intent.engine === 'terraform' && intent.operation === 'deploy')
  )
    fail(
      'Marketplace terms are unaccepted for this exact image plan; only an initial Terraform deployment can accept them during apply',
    );
  if (observation.image.version.toLowerCase() === 'latest') fail('image version latest is forbidden');
  if (!/^\d+\.\d+\.\d+$/.test(observation.image.version)) fail('image version must be an exact Marketplace version');
  const expectedUrn = [
    observation.image.publisher,
    observation.image.offer,
    observation.image.plan,
    observation.image.version,
  ].join(':');
  if (observation.image.urn.toLowerCase() !== expectedUrn.toLowerCase())
    fail('observed image URN does not match its publisher, offer, plan and exact version');
  for (const field of ['publisher', 'offer', 'plan']) {
    if (observation.image[field].toLowerCase() !== intent.image[field].toLowerCase())
      fail(`observed image ${field} does not match intent`);
  }
  const eligibleRegions = [...observation.regions]
    .filter((region) => region.eligible)
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  const region = intent.region
    ? observation.regions.find((candidate) => candidate.name.toLowerCase() === intent.region)
    : eligibleRegions[0];
  if (!region?.eligible) fail(`region ${intent.region ?? '<recommended>'} is not eligible`);
  const size = region.vmSizes.find((candidate) => candidate.name.toLowerCase() === intent.vm.size.toLowerCase());
  if (!size || size.restricted) fail(`VM size ${intent.vm.size} is unavailable or restricted in ${region.name}`);
  const hardware = classifyAzureImageHardwareCompatibility(observation.image, size);
  if (hardware !== 'compatible') fail(`VM/image hardware compatibility is ${hardware} for ${intent.vm.size}`);
  if (!Number.isFinite(size.memoryGb) || !Number.isInteger(size.maxNics) || size.maxNics < 1)
    fail('VM size has incomplete observed memory or NIC capabilities');
  if (size.vCpus < 8 || size.memoryGb < 32)
    fail(`VM size ${intent.vm.size} is below the CE minimum of 8 vCPUs and 32 GB memory`);
  if (size.maxNics < intent.nics.length)
    fail(`VM size ${intent.vm.size} NIC limit ${size.maxNics} is below requested NIC count ${intent.nics.length}`);
  const nodeCount = intent.topology.ha ? 3 : 1;
  const workloadVcpus = intent.workloadFixture ? AZURE_CE_WORKLOAD_FIXTURE_VCPUS : 0;
  const requiredCores = size.vCpus * nodeCount + workloadVcpus;
  if (!Number.isInteger(size.vCpus) || size.vCpus < 1)
    fail(`VM size ${intent.vm.size} has no valid observed vCPU capability`);
  if (region.quotaAvailable < requiredCores)
    fail(`insufficient regional vCPU quota: ${requiredCores} required for ${nodeCount} nodes`);
  for (const id of intent.brownfield.resourceIds) {
    const observed = resourceById(observation, id);
    if (!observed?.exists) fail(`brownfield resource was not observed: ${id}`);
    if (observed.owned) fail(`pre-existing brownfield resource cannot be adopted as owned: ${id}`);
  }
  const targetGroupId = groupId(intent.subscriptionId, intent.resourceGroup).toLowerCase();
  const targetGroup = resourceById(observation, targetGroupId);
  const targetGroupApproved = intent.brownfield.resourceIds.some((id) => id.toLowerCase() === targetGroupId);
  if (targetGroup?.exists && !targetGroup.owned && !targetGroupApproved)
    fail(`pre-existing resource group must be explicitly selected as brownfield: ${targetGroupId}`);
  const warnings = [];
  const requestedZones = intent.vm.zones ?? [];
  let zones;
  if (intent.topology.ha) {
    const available = requestedZones.length ? requestedZones.filter((zone) => size.zones.includes(zone)) : size.zones;
    if (available.length >= 3) zones = available.slice(0, 3);
    else {
      zones = available.length ? Array.from({ length: 3 }, (_, index) => available[index] ?? available[0]) : [];
      warnings.push(
        available.length
          ? `Three distinct zones are unavailable in ${region.name}; the approved plan uses ${zones.join(', ')}`
          : `Availability zones are unavailable in ${region.name}; the approved plan uses a regional deployment`,
      );
    }
  } else {
    const zone = requestedZones.find((candidate) => size.zones.includes(candidate)) ?? size.zones[0];
    zones = zone ? [zone] : [];
    if (requestedZones.length && !requestedZones.includes(zone ?? ''))
      warnings.push(
        `Requested zone placement is unavailable in ${region.name}; the approved plan uses ${zone ?? 'a regional deployment'}`,
      );
  }
  const allGreenfield = intent.nics.every((nic) => nic.subnet.mode === 'greenfield');
  const routingMode =
    intent.routing.mode === 'auto'
      ? intent.topology.ha && allGreenfield
        ? 'route-server'
        : 'udr'
      : intent.routing.mode;
  if (intent.routing.udr && routingMode !== 'udr') fail('greenfield UDR associations require UDR routing mode');
  if (routingMode === 'route-server') validateRouteServerIntent(intent);
  if (routingMode === 'route-server' && !allGreenfield)
    fail('same-VNet brownfield Route Server insertion is unsupported; use explicitly approved UDR associations');
  if (routingMode === 'route-server' && !region.routeServerSupported)
    fail(`Route Server is unsupported in ${region.name}`);
  if (intent.egress.mode !== 'public-ip' && !intent.egress.resourceId)
    fail(`${intent.egress.mode} egress requires an explicit resourceId`);
  if (intent.egress.resourceId) {
    validateResourceId(intent.egress.resourceId, intent.subscriptionId);
    if (!intent.brownfield.resourceIds.some((id) => id.toLowerCase() === intent.egress.resourceId?.toLowerCase()))
      fail('selected egress resource must be explicitly listed in brownfield.resourceIds');
    if (!resourceById(observation, intent.egress.resourceId)?.exists) fail('selected egress resource was not observed');
  }
  if (intent.egress.mode === 'firewall' || intent.egress.mode === 'proxy')
    warnings.push('Strict FQDN egress is delegated to the explicitly selected firewall/proxy profile');
  if (
    intent.securityRules.some((rule) =>
      [...rule.sourceCidrs, ...rule.destinationCidrs].some((cidr) => cidr === '0.0.0.0/0' || cidr === '::/0'),
    )
  )
    warnings.push('Broad CIDR exposure requires explicit approval');
  if (intent.securityRules.some((rule) => rule.purpose === 'management' && rule.direction === 'Inbound'))
    warnings.push('Inbound management exposure requires explicit approval');
  if (!intent.topology.ha && ['resize', 'replace-node', 'update-network'].includes(intent.operation))
    warnings.push('This single-node lifecycle operation is disruptive and requires a maintenance window');
  const rollbackRoutes = intent.brownfield.routeChanges.map((change) => {
    const observed = resourceById(observation, change.routeTableId);
    if (!observed?.exists) fail(`route table was not observed: ${change.routeTableId}`);
    const observedSubnet = resourceById(observation, change.subnetId);
    if (!observedSubnet?.exists) fail(`subnet was not observed: ${change.subnetId}`);
    return {
      routeTableId: change.routeTableId,
      subnetId: change.subnetId,
      routeName: change.routeName,
      before: observed.state,
      beforeSubnet: observedSubnet.state,
    };
  });
  const ownershipInventory = intent.brownfield.resourceIds.map((resourceId) => ({
    resourceId,
    owned: false,
    action:
      (intent.ingress?.mode === 'platform-http' &&
        intent.ingress.probe.sourceVmResourceId.toLowerCase() === resourceId.toLowerCase()) ||
      intent.brownfield.routeChanges.some(
        (change) =>
          change.routeTableId.toLowerCase() === resourceId.toLowerCase() ||
          change.subnetId.toLowerCase() === resourceId.toLowerCase(),
      )
        ? 'modify-approved'
        : 'reference',
  }));
  const routeServerCidr = routingMode === 'route-server' ? routeServerSubnetCidr(intent) : undefined;
  const actions = ['deploy'].includes(intent.operation)
    ? buildDeployActions(
        intent,
        region.name,
        zones,
        routingMode,
        observation.image.urn,
        routeServerCidr,
        !targetGroup?.exists,
      )
    : buildLifecycleActions(intent, observation, zones);
  for (const action of actions) {
    if (
      !action.resourceId ||
      ownershipInventory.some((item) => item.resourceId.toLowerCase() === action.resourceId?.toLowerCase())
    )
      continue;
    if (action.kind === 'resource-delete')
      ownershipInventory.push({ resourceId: action.resourceId, owned: true, action: 'delete' });
    else if (
      [
        'resource-group-create',
        'vnet-create',
        'subnet-create',
        'nsg-create',
        'nsg-rule-create',
        'public-ip-create',
        'nic-create',
        'vm-create',
        'route-table-create',
        'route-server-create',
        'route-server-peer-create',
      ].includes(action.kind)
    ) {
      ownershipInventory.push({ resourceId: action.resourceId, owned: true, action: 'create' });
    }
  }
  for (const resource of observation.resources) {
    if (
      !resource.owned ||
      resource.tags['xcsh-managed-by'] !== 'azure-ce' ||
      resource.tags['xcsh-deployment-id'] !== intent.deploymentName
    )
      continue;
    if (ownershipInventory.some((item) => item.resourceId.toLowerCase() === resource.id.toLowerCase())) continue;
    ownershipInventory.push({ resourceId: resource.id, owned: true, action: 'reference' });
  }
  const workloadFixtureCount = intent.workloadFixture ? 1 : 0;
  const billableResources = [
    { type: 'virtual-machine', count: nodeCount + workloadFixtureCount },
    { type: 'managed-disk', count: nodeCount + workloadFixtureCount },
    ...(intent.egress.mode === 'public-ip' ? [{ type: 'standard-public-ip', count: nodeCount }] : []),
    ...(routingMode === 'route-server'
      ? [
          { type: 'route-server', count: 1 },
          { type: 'standard-public-ip', count: 1 },
        ]
      : []),
  ];
  const draft = {
    engine: intent.engine ?? 'native',
    schemaVersion: AZURE_CE_SCHEMA_VERSION,
    intent,
    subscription: observation.subscription,
    deploymentName: intent.deploymentName,
    siteName: intent.siteName,
    namespace: intent.namespace,
    region: region.name,
    topology: { ha: intent.topology.ha, nodeCount, zones },
    nics: intent.nics.map((nic, index) => ({ ...nic, index })),
    egress: intent.egress,
    routing: {
      mode: routingMode,
      ...(intent.routing.udr ? { udr: intent.routing.udr } : {}),
      ...(intent.routing.forwardingRoutes
        ? { forwardingRoutes: structuredClone(intent.routing.forwardingRoutes) }
        : {}),
      destinationCidrs: intent.routing.destinationCidrs,
      localAsn: intent.routing.localAsn ?? intent.routing.peerAsn ?? 65010,
      peerAsn: intent.routing.peerAsn ?? intent.routing.localAsn ?? 65010,
    },
    securityRules: intent.securityRules,
    image: observation.image,
    vm: intent.vm,
    computeCapacity: { ceVcpus: size.vCpus, workloadVcpus, quotaAvailable: region.quotaAvailable },
    warnings,
    billableResources,
    actions,
    rollback: { brownfieldRoutes: rollbackRoutes },
    observationFingerprint:
      intent.operation === 'deploy'
        ? fingerprintDeploymentObservation(observation, intent.brownfield.resourceIds, region.name, size.name)
        : fingerprintObservation(observation, intent.brownfield.resourceIds),
    ownershipInventory,
    ownershipTagTemplate: {
      'xcsh-managed-by': 'azure-ce',
      'xcsh-execution-engine': intent.engine ?? 'native',
      'xcsh-deployment-id': intent.deploymentName,
      'xcsh-plan-sha256': '__PLAN_SHA256__',
    },
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-${planSha256.slice(0, 24)}`, planSha256 };
}

// plugins/azure/src/ce/relay-route-server.ts
import { isIP as isIP4 } from 'node:net';

// plugins/azure/src/ce/relay-identity.ts
var require5 = (condition, message) => {
  if (!condition) throw Error(`Azure relay identity: ${message}`);
};
var object5 = (value) => {
  require5(value && typeof value === 'object' && !Array.isArray(value), 'malformed observation');
  return value;
};
var id = (value) => (typeof value === 'string' ? value.toLowerCase() : '');
var sameId = (a, b) => id(a) === b.toLowerCase();
async function observeAzureRelayIdentity(source, plan, api, signal) {
  const expectedTags = azureRelayOwnershipTags(source, plan);
  signal?.throwIfAborted();
  const deadline = AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]);
  const read = async (args, expectedId, relay, located) => {
    deadline.throwIfAborted();
    const abort = Promise.withResolvers();
    const onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    let raw;
    try {
      raw = await Promise.race([
        api.exec(
          'az',
          [...args, 'show', '--ids', expectedId, '--subscription', plan.subscriptionId, '--output', 'json'],
          { signal: deadline },
        ),
        abort.promise,
      ]);
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
    deadline.throwIfAborted();
    require5(raw.exitCode === 0, 'cloud read unavailable');
    let response;
    try {
      response = JSON.parse(raw.stdout);
    } catch {
      throw Error('Azure relay identity: malformed JSON');
    }
    const value = object5(response);
    require5(
      sameId(value.id, expectedId) &&
        value.provisioningState === 'Succeeded' &&
        !['nextLink', 'nextPageToken', 'error', 'errors', 'NextToken'].some((key) => value[key]),
      'incomplete resource identity or provisioning',
    );
    if (located) require5(value.location === plan.region, 'resource region differs');
    if (relay || expectedId === plan.vnetId) {
      const tags = object5(value.tags);
      for (const [key, expected] of Object.entries(expectedTags))
        if (relay || key !== 'xcsh-relay-plan-sha256') require5(tags[key] === expected, 'resource owner differs');
    }
    return value;
  };
  await read(['network', 'vnet'], plan.vnetId, false, true);
  const subnet = await read(['network', 'vnet', 'subnet'], plan.sloSubnetId, false, false);
  const prefixes = typeof subnet.addressPrefix === 'string' ? [subnet.addressPrefix] : subnet.addressPrefixes;
  require5(
    Array.isArray(prefixes) && prefixes.length === 1 && prefixes[0] === plan.sloCidr,
    'SLO subnet prefix differs',
  );
  const relays = [];
  const macs = new Set();
  for (const relay of plan.relays) {
    const vm = await read(['vm'], relay.vmId, true, true);
    require5(object5(vm.hardwareProfile).vmSize === plan.vmSize, 'VM size differs');
    const storage = object5(vm.storageProfile);
    const disk = object5(storage.osDisk);
    require5(
      disk.name === relay.osDiskName && sameId(object5(disk.managedDisk).id, relay.osDiskId),
      'OS disk attachment differs',
    );
    const image = object5(storage.imageReference);
    for (const key of ['publisher', 'offer', 'sku'])
      require5(id(image[key]) === plan.hostImage[key].toLowerCase(), 'host image differs');
    require5(
      image.version === plan.hostImage.version &&
        (image.exactVersion === undefined || image.exactVersion === plan.hostImage.version),
      'host image version is unresolved or differs',
    );
    const references = object5(vm.networkProfile).networkInterfaces;
    require5(
      Array.isArray(references) && references.length === 1 && sameId(object5(references[0]).id, relay.nicId),
      'VM attachment is incomplete or duplicated',
    );
    const nic = await read(['network', 'nic'], relay.nicId, true, true);
    require5(
      sameId(object5(nic.virtualMachine).id, relay.vmId) && nic.enableIPForwarding === true,
      'NIC owner or forwarding differs',
    );
    const rawMac = typeof nic.macAddress === 'string' ? nic.macAddress.toLowerCase() : '';
    require5(/^(?:[a-f0-9]{2}[:-]){5}[a-f0-9]{2}$/.test(rawMac), 'NIC MAC unavailable');
    const mac = rawMac.replaceAll('-', ':');
    require5(
      (Number.parseInt(mac.slice(0, 2), 16) & 1) === 0 && mac !== '00:00:00:00:00:00' && !macs.has(mac),
      'NIC MAC is not distinct unicast identity',
    );
    macs.add(mac);
    const configs = nic.ipConfigurations;
    require5(Array.isArray(configs) && configs.length === 1, 'NIC IP configuration missing or duplicated');
    const ip = object5(configs[0]);
    require5(
      sameId(ip.id, relay.ipConfigurationId) &&
        ip.name === 'ipconfig1' &&
        (ip.primary === true || ip.primary === undefined) &&
        ip.privateIPAddressVersion === 'IPv4' &&
        ip.privateIPAllocationMethod === 'Static' &&
        ip.privateIPAddress === relay.privateAddress &&
        sameId(object5(ip.subnet).id, relay.subnetId),
      'NIC IP configuration identity differs',
    );
    relays.push({
      name: relay.name,
      vmId: relay.vmId,
      nicId: relay.nicId,
      osDiskId: relay.osDiskId,
      ipConfigurationId: relay.ipConfigurationId,
      subnetId: relay.subnetId,
      mac,
      address: relay.privateAddress,
      asn: relay.asn,
    });
  }
  deadline.throwIfAborted();
  return {
    status: 'observed',
    source: 'azure-cli-current-identity',
    planId: plan.planId,
    planSha256: plan.planSha256,
    sourcePlanSha256: source.planSha256,
    engine: plan.engine,
    relays,
    observedAt: new Date().toISOString(),
    routing: 'unknown',
    software: 'unknown',
    traffic: 'unknown',
    ceSampleFreshnessQualified: false,
  };
}

// plugins/azure/src/ce/relay-route-server.ts
var require6 = (condition, message) => {
  if (!condition) throw Error(`Azure relay Route Server: ${message}`);
};
var object6 = (value) => {
  require6(value && typeof value === 'object' && !Array.isArray(value), 'malformed observation');
  const result = value;
  require6(
    !['nextLink', 'nextPageToken', 'error', 'errors', 'NextToken'].some((key) => result[key]),
    'partial or failed observation',
  );
  return result;
};
var same2 = (value, expected) => typeof value === 'string' && value.toLowerCase() === expected.toLowerCase();
var ipv4 = (address) => address.split('.').reduce((sum, octet) => sum * 256 + Number(octet), 0);
async function observeAzureRelayRouteServerIdentity(source, plan, api, signal) {
  verifyAzureRelayPlan(source, plan);
  signal?.throwIfAborted();
  const deadline = AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]);
  const relays = await observeAzureRelayIdentity(source, plan, api, deadline);
  const reads = [];
  const read = async (args) => {
    deadline.throwIfAborted();
    const fullArgs = [...args, '--subscription', source.subscription.id, '--output', 'json'];
    const abort = Promise.withResolvers();
    const onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    let raw;
    try {
      raw = await Promise.race([api.exec('az', fullArgs, { signal: deadline }), abort.promise]);
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
    deadline.throwIfAborted();
    require6(raw.exitCode === 0, 'cloud read unavailable');
    let response;
    try {
      response = JSON.parse(raw.stdout);
    } catch {
      throw Error('Azure relay Route Server: malformed JSON');
    }
    const result = object6(response);
    reads.push({ args: fullArgs, responseSha256: canonicalSha256(result), observedAt: new Date().toISOString() });
    return result;
  };
  const ownerSource = azureRelayResourceSource(source);
  const serverAction = ownerSource.actions.find((action) => action.kind === 'route-server-create');
  require6(serverAction?.args, 'saved Route Server creation action required');
  const args = serverAction?.args;
  const hostedSubnetId = args[args.indexOf('--hosted-subnet') + 1];
  require6(
    typeof hostedSubnetId === 'string' && hostedSubnetId === `${plan.vnetId}/subnets/RouteServerSubnet`,
    'saved hosted subnet identity differs',
  );
  const subnetActions = ownerSource.actions.filter(
    (action) => action.resourceId === hostedSubnetId && action.kind === 'subnet-create',
  );
  require6(
    subnetActions.length === 1 && subnetActions[0].args?.includes('--address-prefixes'),
    'saved hosted subnet CIDR required',
  );
  const subnetArgs = subnetActions[0].args;
  const cidr = subnetArgs[subnetArgs.indexOf('--address-prefixes') + 1];
  const [network, prefix] = cidr.split('/');
  require6(isIP4(network) === 4 && prefix === '26' && ipv4(network) % 64 === 0, 'canonical hosted /26 required');
  const usable = (address) =>
    typeof address === 'string' &&
    isIP4(address) === 4 &&
    ipv4(address) > ipv4(network) + 3 &&
    ipv4(address) < ipv4(network) + 63;
  const common = ['--resource-group', source.intent.resourceGroup, '--name', `${source.deploymentName}-rs`];
  const server = await read(['network', 'routeserver', 'show', ...common]);
  const tags = object6(server.tags);
  require6(
    same2(server.id, plan.routeServerId) &&
      same2(server.location, plan.region) &&
      server.provisioningState === 'Succeeded' &&
      server.virtualRouterAsn === 65515,
    'hub identity differs',
  );
  for (const [key, expected] of Object.entries({
    'xcsh-managed-by': 'azure-ce',
    'xcsh-execution-engine': plan.engine,
    'xcsh-deployment-id': plan.deploymentName,
    'xcsh-plan-sha256': ownerSource.planSha256,
  }))
    require6(tags[key] === expected, 'hub ownership differs');
  const addresses = server.virtualRouterIps;
  require6(
    Array.isArray(addresses) && addresses.length === 2 && new Set(addresses).size === 2 && addresses.every(usable),
    'two distinct hosted service addresses required',
  );
  const expectedPeers = plan.relays.map((relay) => `${plan.routeServerId}/bgpConnections/${relay.name}`);
  const references = server.bgpConnections;
  require6(
    Array.isArray(references) &&
      references.length === 2 &&
      expectedPeers.every(
        (expected) => references.filter((reference) => same2(object6(reference).id, expected)).length === 1,
      ),
    'hub peer references incomplete or foreign',
  );
  const configReferences = server.ipConfigurations;
  require6(
    Array.isArray(configReferences) && configReferences.length > 0 && configReferences.length <= 2,
    'hub IP configuration references missing',
  );
  const referenceIds = configReferences.map((reference) => object6(reference).id);
  require6(
    referenceIds.every(
      (id) =>
        typeof id === 'string' && id.toLowerCase().startsWith(`${plan.routeServerId}/ipConfigurations/`.toLowerCase()),
    ) && new Set(referenceIds.map((id) => id.toLowerCase())).size === referenceIds.length,
    'hub IP configuration references duplicated or foreign',
  );
  const configurations = await read([
    'rest',
    '--method',
    'get',
    '--url',
    `https://management.azure.com${plan.routeServerId}/ipConfigurations?api-version=2024-05-01`,
  ]);
  require6(
    Array.isArray(configurations.value) && configurations.value.length === referenceIds.length,
    'hub IP configuration list incomplete',
  );
  const values = configurations.value.map(object6);
  require6(
    referenceIds.every((id) => values.filter((value) => same2(value.id, id)).length === 1),
    'hub IP configuration identities differ',
  );
  for (const value of values) {
    const properties = object6(value.properties);
    require6(
      properties.provisioningState === 'Succeeded' &&
        same2(object6(properties.subnet).id, hostedSubnetId) &&
        usable(properties.privateIPAddress) &&
        addresses.includes(properties.privateIPAddress),
      'hosted IP configuration differs',
    );
  }
  const subnet = await read(['network', 'vnet', 'subnet', 'show', '--ids', hostedSubnetId]);
  require6(
    same2(subnet.id, hostedSubnetId) &&
      subnet.provisioningState === 'Succeeded' &&
      subnet.addressPrefix === cidr &&
      !subnet.networkSecurityGroup &&
      !subnet.routeTable,
    'hosted subnet differs or is constrained',
  );
  const peers = [];
  for (const relay of plan.relays) {
    const peer = await read([
      'network',
      'routeserver',
      'peering',
      'show',
      '--resource-group',
      source.intent.resourceGroup,
      '--routeserver',
      `${source.deploymentName}-rs`,
      '--name',
      relay.name,
    ]);
    const expectedId = `${plan.routeServerId}/bgpConnections/${relay.name}`;
    require6(
      same2(peer.id, expectedId) &&
        peer.name === relay.name &&
        peer.provisioningState === 'Succeeded' &&
        peer.peerAsn === relay.asn &&
        peer.peerIp === relay.privateAddress,
      'relay peer identity differs',
    );
    peers.push({ id: expectedId, name: relay.name, peerAsn: relay.asn, peerIp: relay.privateAddress });
  }
  deadline.throwIfAborted();
  return {
    status: 'observed',
    source: 'azure-cli-current-identity',
    sourcePlanSha256: source.planSha256,
    planSha256: plan.planSha256,
    routeServerId: plan.routeServerId,
    hostedSubnetId,
    serviceAddresses: addresses.toSorted(),
    relays: relays.relays,
    peers,
    reads,
    observedAt: new Date().toISOString(),
    sessions: 'unknown',
    software: 'unknown',
    traffic: 'unknown',
    ceSampleFreshnessQualified: false,
  };
}

// plugins/azure/src/ce/route-server-health.ts
// plugins/azure/src/ce/interface-address.ts
import { isIP as isIP5, isIP as isIP6 } from 'node:net';

async function resolveInterfaceAddress(api, plan, node, role, ownerPlanSha256 = plan.planSha256, signal) {
  const interfaces = plan.nics.filter((nic) => nic.role === role);
  if (interfaces.length !== 1) throw new Error('CE interface role is missing or ambiguous');
  return resolveAzureNicAddress(api, plan, node, interfaces[0].index, ownerPlanSha256, signal);
}
async function resolveAzureNicAddress(api, plan, node, nicIndex, ownerPlanSha256 = plan.planSha256, signal) {
  signal?.throwIfAborted();
  plan = structuredClone(plan);
  const interfaces = plan.nics.filter((nic) => nic.index === nicIndex);
  if (
    !Number.isInteger(node) ||
    node < 1 ||
    node > plan.topology.nodeCount ||
    !Number.isInteger(nicIndex) ||
    interfaces.length !== 1
  )
    throw Error('Exact planned CE node/NIC identity is missing or ambiguous');
  const iface = interfaces[0];
  const nics = plan.actions.filter(
    (action) => (action.kind === 'nic-create' || action.kind === 'nic-update') && action.node === node,
  );
  const nic = nics.find((action) => {
    const nameIndex = action.args?.indexOf(action.kind === 'nic-update' ? '--nic-name' : '--name') ?? -1;
    return nameIndex >= 0 && action.args?.[nameIndex + 1]?.endsWith(`-nic${iface.index}`);
  });
  const vms = plan.actions.filter(
    (action) => (action.kind === 'vm-create' || action.kind === 'vm-start') && action.node === node,
  );
  if (!nic?.resourceId || vms.length !== 1 || !vms[0].resourceId)
    throw new Error('Planned NIC and VM identities are unavailable');
  const vmId = vms[0].resourceId;
  const scope = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/`.toLowerCase();
  for (const id of [nic.resourceId, vmId])
    if (!id.toLowerCase().startsWith(scope)) throw new Error('Planned interface is outside deployment scope');
  const deadline = AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]);
  const execute = api.exec;
  const read = async (kind, id) => {
    deadline.throwIfAborted();
    if (api.exec !== execute) throw Error('CE interface executor changed');
    const abort = Promise.withResolvers(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    let result;
    try {
      result = await Promise.race([
        execute.call(
          api,
          'az',
          [
            ...(kind === 'nic' ? ['network', 'nic'] : ['vm']),
            'show',
            '--ids',
            id,
            '--subscription',
            plan.subscription.id,
            '--output',
            'json',
          ],
          { signal: deadline },
        ),
        abort.promise,
      ]);
      deadline.throwIfAborted();
      if (api.exec !== execute) throw Error('CE interface executor changed');
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
    if (result.exitCode !== 0) throw new Error('CE interface observation unavailable');
    let value;
    try {
      value = JSON.parse(result.stdout);
    } catch {
      throw new Error('Malformed CE interface observation');
    }
    if (
      !value ||
      value.id?.toLowerCase() !== id.toLowerCase() ||
      value.nextLink ||
      value.provisioningState !== 'Succeeded'
    )
      throw new Error('CE resource identity or readiness does not match');
    if (
      value.tags?.['xcsh-execution-engine'] !== plan.engine ||
      value.tags?.['xcsh-managed-by'] !== 'azure-ce' ||
      value.tags?.['xcsh-deployment-id'] !== plan.deploymentName ||
      value.tags?.['xcsh-plan-sha256'] !== ownerPlanSha256
    )
      throw new Error('CE interface ownership does not match');
    return value;
  };
  const observed = await read('nic', nic.resourceId);
  const vm = await read('vm', vmId);
  if (
    observed.virtualMachine?.id?.toLowerCase() !== vmId.toLowerCase() ||
    !/^(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(observed.macAddress ?? '')
  )
    throw new Error('CE NIC attachment or MAC is unavailable');
  const attachments = vm.networkProfile?.networkInterfaces;
  if (
    !Array.isArray(attachments) ||
    attachments.filter((entry) => entry.id?.toLowerCase() === nic.resourceId?.toLowerCase()).length !== 1
  )
    throw new Error('VM does not uniquely reference the planned NIC');
  const configs = observed.ipConfigurations;
  if (!Array.isArray(configs)) throw new Error('CE IP configurations unavailable');
  const primary = configs.filter(
    (config) => config.primary === true || (configs.length === 1 && config.primary === undefined),
  );
  if (
    primary.length !== 1 ||
    primary[0].privateIPAddressVersion !== 'IPv4' ||
    isIP5(primary[0].privateIPAddress ?? '') !== 4
  )
    throw new Error('CE primary IPv4 address is missing or ambiguous');
  const expectedSubnet =
    iface.subnet.resourceId ??
    (iface.subnet.mode === 'greenfield' && iface.subnet.name
      ? `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network/virtualNetworks/${plan.deploymentName}-vnet/subnets/${iface.subnet.name}`
      : undefined);
  if (expectedSubnet && primary[0].subnet?.id?.toLowerCase() !== expectedSubnet.toLowerCase())
    throw new Error('CE subnet identity does not match');
  return primary[0].privateIPAddress ?? '';
}

// plugins/azure/src/ce/route-server-health.ts
var object7 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed Route Server evidence');
  return value;
};
var lower = (value) => (typeof value === 'string' ? value.toLowerCase() : '');
var routeServerIdFor = (plan) =>
  `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network/virtualHubs/${plan.deploymentName}-rs`;
var peerIdFor = (plan, node) => `${routeServerIdFor(plan)}/bgpConnections/${plan.deploymentName}-${node}`;
var isPlanSha256 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
async function captureAzureRouteServerOwnership(plan, api, signal) {
  verifyAzureCePlan(plan);
  if (plan.routing.mode !== 'route-server') throw new Error('Azure Route Server routing is not selected');
  const routeServerId = routeServerIdFor(plan);
  const server = object7(
    await read(
      api,
      plan,
      [
        'network',
        'routeserver',
        'show',
        '--resource-group',
        plan.intent.resourceGroup,
        '--name',
        `${plan.deploymentName}-rs`,
      ],
      signal,
    ),
  );
  const tags = object7(server.tags);
  const ownerPlanSha256 = tags['xcsh-plan-sha256'];
  if (
    lower(server.id) !== lower(routeServerId) ||
    lower(server.location) !== lower(plan.region) ||
    server.provisioningState !== 'Succeeded' ||
    server.virtualRouterAsn !== 65515 ||
    tags['xcsh-managed-by'] !== 'azure-ce' ||
    tags['xcsh-execution-engine'] !== plan.engine ||
    tags['xcsh-deployment-id'] !== plan.deploymentName ||
    typeof ownerPlanSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(ownerPlanSha256)
  )
    throw new Error('Azure retained Route Server ownership is unavailable');
  const peerIds = {};
  for (let node = 1; node <= plan.topology.nodeCount; node++) {
    const name = `${plan.deploymentName}-${node}`;
    const expectedId = `${routeServerId}/bgpConnections/${name}`;
    const peer = object7(
      await read(
        api,
        plan,
        [
          'network',
          'routeserver',
          'peering',
          'show',
          '--resource-group',
          plan.intent.resourceGroup,
          '--routeserver',
          `${plan.deploymentName}-rs`,
          '--name',
          name,
        ],
        signal,
      ),
    );
    if (
      lower(peer.id) !== lower(expectedId) ||
      peer.name !== name ||
      peer.provisioningState !== 'Succeeded' ||
      peer.peerAsn !== plan.routing.localAsn
    )
      throw new Error('Azure retained Route Server peer identity is unavailable');
    peerIds[String(node)] = expectedId;
  }
  return { routeServerId, ownerPlanSha256, peerIds };
}
async function read(api, plan, args, signal) {
  signal?.throwIfAborted();
  const result = await api.exec(
    'az',
    [...args, '--subscription', plan.subscription.id, '--output', 'json'],
    signal ? { signal } : undefined,
  );
  signal?.throwIfAborted();
  if (result.exitCode !== 0) throw new Error('Azure Route Server observation unavailable');
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error('Malformed Azure Route Server observation');
  }
}
function routeRoles(value) {
  const response = object7(value);
  if (response.nextLink || response.nextPageToken || response.error) throw new Error('Incomplete Route Server routes');
  const roles = Object.entries(response)
    .filter(([name]) => /^RouteServiceRole_IN_[01]$/.test(name))
    .map(([role, routes]) => {
      if (!Array.isArray(routes)) throw new Error('Malformed Route Server role routes');
      return { role, routes: routes.map(object7) };
    });
  if (roles.length !== 2 || new Set(roles.map((entry) => entry.role)).size !== 2)
    throw new Error('Both Route Server service-role observations are required');
  return roles.sort((a, b) => a.role.localeCompare(b.role));
}
async function discoverAzureRouteServerIdentity(plan, api, signal, retained) {
  verifyAzureCePlan(plan);
  if (plan.routing.mode !== 'route-server') throw new Error('Azure Route Server routing is not selected');
  const serverAction = plan.actions.filter((action) => action.kind === 'route-server-create');
  const peerUpdates = plan.actions.filter((action) => action.kind === 'route-server-peer-update');
  const isNetworkUpdate = !retained && plan.intent.operation === 'update-network';
  if (
    (isNetworkUpdate && serverAction.length !== 0) ||
    (!isNetworkUpdate && !retained && (serverAction.length !== 1 || !serverAction[0].resourceId)) ||
    (retained && serverAction.length)
  )
    throw new Error('Planned Route Server identity is unavailable');
  const updateOwnerHashes = isNetworkUpdate ? peerUpdates.map((action) => action.expectedOwnerPlanSha256) : [];
  if (
    isNetworkUpdate &&
    (peerUpdates.length !== plan.topology.nodeCount ||
      new Set(peerUpdates.map((action) => action.node)).size !== plan.topology.nodeCount ||
      peerUpdates.some(
        (action) =>
          !action.node ||
          action.node < 1 ||
          action.node > plan.topology.nodeCount ||
          action.resourceId !== peerIdFor(plan, action.node) ||
          !isPlanSha256(action.expectedOwnerPlanSha256),
      ) ||
      new Set(updateOwnerHashes).size !== 1)
  )
    throw new Error('Planned retained Route Server identity is unavailable');
  const routeServerId =
    retained?.routeServerId ?? (isNetworkUpdate ? routeServerIdFor(plan) : serverAction[0]?.resourceId);
  const ownerPlanSha256 = retained?.ownerPlanSha256 ?? (isNetworkUpdate ? updateOwnerHashes[0] : plan.planSha256);
  const server = object7(
    await read(
      api,
      plan,
      [
        'network',
        'routeserver',
        'show',
        '--resource-group',
        plan.intent.resourceGroup,
        '--name',
        `${plan.deploymentName}-rs`,
      ],
      signal,
    ),
  );
  const tags = object7(server.tags);
  const routerIps = server.virtualRouterIps;
  if (
    lower(server.id) !== lower(routeServerId) ||
    lower(server.location) !== lower(plan.region) ||
    server.provisioningState !== 'Succeeded' ||
    server.virtualRouterAsn !== 65515 ||
    !Array.isArray(routerIps) ||
    routerIps.length !== 2 ||
    new Set(routerIps).size !== 2 ||
    routerIps.some((ip) => typeof ip !== 'string' || isIP6(ip) !== 4) ||
    tags['xcsh-managed-by'] !== 'azure-ce' ||
    tags['xcsh-deployment-id'] !== plan.deploymentName ||
    tags['xcsh-execution-engine'] !== plan.engine ||
    tags['xcsh-plan-sha256'] !== ownerPlanSha256
  )
    throw new Error('Azure Route Server identity or service addresses differ');
  return {
    routeServerId,
    asn: 65515,
    serviceAddresses: routerIps.toSorted(),
  };
}
async function collectAzureRouteServerHealth(plan, api, signal, retained) {
  verifyAzureCePlan(plan);
  const base = {
    planId: plan.planId,
    planSha256: plan.planSha256,
    engine: plan.engine,
    subscriptionId: plan.subscription.id,
    region: plan.region,
    siteName: plan.siteName,
    source: 'azure-cli-live',
    observedAt: new Date().toISOString(),
    sessions: 'unknown',
    sessionReason: 'platform-bgp-session-evidence-required',
    effectiveRoutes: 'unknown',
    traffic: 'unknown',
  };
  if (plan.routing.mode !== 'route-server') return { ...base, status: 'not-applicable' };
  try {
    const identity = await discoverAzureRouteServerIdentity(plan, api, signal, retained);
    const peers = [];
    for (let node = 1; node <= plan.topology.nodeCount; node++) {
      const peerKind =
        plan.intent.operation === 'update-network' && !retained
          ? 'route-server-peer-update'
          : 'route-server-peer-create';
      const action = plan.actions.filter((candidate) => candidate.kind === peerKind && candidate.node === node);
      if (
        (!retained && (action.length !== 1 || !action[0].resourceId)) ||
        (retained && action.length) ||
        (peerKind === 'route-server-peer-update' && action[0]?.resourceId !== peerIdFor(plan, node))
      )
        throw new Error('Planned Route Server peer is unavailable');
      const peerId = retained?.peerIds[String(node)] ?? action[0]?.resourceId;
      if (!peerId) throw new Error('Planned Route Server peer is unavailable');
      const peerIp = await resolveInterfaceAddress(
        api,
        plan,
        node,
        'slo',
        retained?.ownerPlanSha256 ?? action[0]?.expectedOwnerPlanSha256 ?? plan.planSha256,
      );
      const name = `${plan.deploymentName}-${node}`;
      const common = [
        '--resource-group',
        plan.intent.resourceGroup,
        '--routeserver',
        `${plan.deploymentName}-rs`,
        '--name',
        name,
      ];
      const peer = object7(await read(api, plan, ['network', 'routeserver', 'peering', 'show', ...common], signal));
      if (
        lower(peer.id) !== lower(peerId) ||
        peer.name !== name ||
        peer.provisioningState !== 'Succeeded' ||
        peer.peerAsn !== plan.routing.localAsn ||
        peer.peerIp !== peerIp
      )
        throw new Error('Azure Route Server peer identity or SLO binding differs');
      const learned = routeRoles(
        await read(api, plan, ['network', 'routeserver', 'peering', 'list-learned-routes', ...common], signal),
      );
      const expected = plan.routing.destinationCidrs;
      const roles = learned.map(({ role, routes }) => {
        const matching = expected.map((prefix) => {
          const matches = routes.filter((route) => route.network === prefix && route.nextHop === peerIp);
          if (matches.length !== 1) throw new Error('Expected Route Server route exchange has not converged');
          return prefix;
        });
        return { role, learnedRouteCount: routes.length, matchedPrefixes: matching };
      });
      peers.push({ node, name, peerIp, peerAsn: peer.peerAsn, provisioningState: peer.provisioningState, roles });
    }
    return {
      ...base,
      status: plan.routing.destinationCidrs.length ? 'healthy' : 'unknown',
      reason: plan.routing.destinationCidrs.length ? undefined : 'expected-learned-prefixes-unavailable',
      routeServerId: identity.routeServerId,
      serviceAddresses: identity.serviceAddresses,
      peers,
      routeExchange: plan.routing.destinationCidrs.length ? 'healthy' : 'unknown',
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { ...base, status: 'unknown', reason: 'route-server-evidence-unavailable' };
  }
}
async function collectAzureRouteServerFailoverHealth(plan, nodeIndex, phase, api, signal) {
  verifyAzureCePlan(plan);
  if (
    plan.routing.mode !== 'route-server' ||
    !plan.topology.ha ||
    plan.topology.nodeCount !== 3 ||
    !Number.isInteger(nodeIndex) ||
    nodeIndex < 1 ||
    nodeIndex > 3 ||
    !['outage', 'recovered'].includes(phase) ||
    plan.routing.destinationCidrs.length < 1
  )
    throw new Error('Azure Route Server failover scope is incomplete');
  const identity = await discoverAzureRouteServerIdentity(plan, api, signal);
  const peers = [];
  for (let node = 1; node <= plan.topology.nodeCount; node++) {
    const action = plan.actions.filter(
      (candidate) => candidate.kind === 'route-server-peer-create' && candidate.node === node,
    );
    if (action.length !== 1 || !action[0].resourceId) throw new Error('Planned Route Server peer is unavailable');
    const peerIp = await resolveInterfaceAddress(api, plan, node, 'slo');
    const name = `${plan.deploymentName}-${node}`;
    const common = [
      '--resource-group',
      plan.intent.resourceGroup,
      '--routeserver',
      `${plan.deploymentName}-rs`,
      '--name',
      name,
    ];
    const peer = object7(await read(api, plan, ['network', 'routeserver', 'peering', 'show', ...common], signal));
    if (
      lower(peer.id) !== lower(action[0].resourceId) ||
      peer.name !== name ||
      peer.provisioningState !== 'Succeeded' ||
      peer.peerAsn !== plan.routing.localAsn ||
      peer.peerIp !== peerIp
    )
      throw new Error('Azure Route Server peer identity or SLO binding differs');
    const learned = routeRoles(
      await read(api, plan, ['network', 'routeserver', 'peering', 'list-learned-routes', ...common], signal),
    );
    const shouldWithdraw = phase === 'outage' && node === nodeIndex;
    const roles = learned.map(({ role, routes }) => {
      const matchedPrefixes = plan.routing.destinationCidrs.filter((prefix) =>
        routes.some((route) => route.network === prefix && route.nextHop === peerIp),
      );
      if (
        (shouldWithdraw && matchedPrefixes.length !== 0) ||
        (!shouldWithdraw &&
          (matchedPrefixes.length !== plan.routing.destinationCidrs.length ||
            plan.routing.destinationCidrs.some(
              (prefix) => routes.filter((route) => route.network === prefix && route.nextHop === peerIp).length !== 1,
            )))
      )
        throw new Error('Azure Route Server failover route exchange has not converged');
      return { role, learnedRouteCount: routes.length, matchedPrefixes };
    });
    peers.push({ node, name, peerIp, peerAsn: peer.peerAsn, provisioningState: peer.provisioningState, roles });
  }
  return {
    status: 'healthy',
    phase,
    selectedNode: nodeIndex,
    expectedEstablishedSessions: phase === 'outage' ? 4 : 6,
    routeServerId: identity.routeServerId,
    serviceAddresses: identity.serviceAddresses,
    peers,
    observedAt: new Date().toISOString(),
  };
}

// plugins/azure/src/ce/relay-replacement-plan.ts
var require7 = (value, message) => {
  if (!value) throw Error(`Azure relay replacement plan: ${message}`);
};
var same3 = canonicalEqual;
var lower2 = (value) => value.toLowerCase();
function azureRelayResourceSource(plan) {
  let current = plan;
  const seen = new Set();
  while (current.relayProfile?.schemaVersion === 2) {
    require7(!seen.has(current), 'recursive retained source is forbidden');
    seen.add(current);
    current = current.relayProfile.retainedDeploymentPlan;
  }
  return current;
}
function compileAzureRelayReplacementPlan(foundation, retained, observation) {
  require7(!foundation.relayProfile && !foundation.workloadProfile, 'unprofiled replacement foundation required');
  verifyAzureCePlan(foundation);
  verifyAzureCePlan(retained);
  const retainedProfile = retained.relayProfile;
  if (
    !retainedProfile ||
    ![1, 2].includes(retainedProfile.schemaVersion) ||
    (retainedProfile.schemaVersion === 1
      ? retained.intent.operation !== 'deploy'
      : retained.intent.operation !== 'replace-node')
  )
    throw Error('Azure relay replacement plan: exact owning relay creation or replacement plan required');
  const resourceSource = azureRelayResourceSource(retained);
  require7(
    foundation.intent.operation === 'replace-node' && foundation.routing.mode === 'route-server',
    'selected Route Server replacement required',
  );
  require7(same3(foundation, compileAzureCePlan(foundation.intent, observation)), 'foundation differs from discovery');
  const { operation: _oldOperation, replacementNode: _oldNode, ...oldIntent } = retained.intent;
  const { operation: _operation, replacementNode: _node, ...newIntent } = foundation.intent;
  require7(
    same3(oldIntent, newIntent) &&
      same3(foundation.subscription, retained.subscription) &&
      same3(foundation.topology, retained.topology) &&
      same3(foundation.nics, retained.nics) &&
      same3(foundation.routing, retained.routing),
    'retained scope, engine, topology or configuration differs',
  );
  const { termsAccepted: _oldTerms, ...oldImage } = retained.image;
  const { termsAccepted: _terms, ...newImage } = foundation.image;
  require7(same3(oldImage, newImage), 'pinned CE image differs');
  const selected = foundation.intent.replacementNode;
  require7(
    Number.isInteger(selected) && Number(selected) >= 1 && Number(selected) <= retained.topology.nodeCount,
    'one exact selected CE node required',
  );
  const mutations = foundation.actions.filter((action) => action.mutates);
  const precedingVm =
    retainedProfile.schemaVersion === 2
      ? retained.actions.find(
          (action) => action.kind === 'vm-create' && action.node === retained.intent.replacementNode,
        )?.resourceId
      : undefined;
  const retainedResourceOwners =
    retainedProfile.schemaVersion === 2
      ? retainedProfile.retainedResourceOwners.map((row) => ({
          ...row,
          ownerPlanSha256: row.resourceId === precedingVm ? retained.planSha256 : row.ownerPlanSha256,
        }))
      : resourceSource.ownershipInventory
          .filter((item) => item.owned)
          .map((item) => ({
            resourceId: item.resourceId,
            ownerPlanSha256: resourceSource.planSha256,
          }));
  const owners = new Map(retainedResourceOwners.map((row) => [lower2(row.resourceId), row.ownerPlanSha256]));
  require7(
    mutations.length === 2 &&
      mutations[0].kind === 'vm-delete' &&
      mutations[1].kind === 'vm-create' &&
      mutations.every((action) => action.node === selected && action.resourceId === mutations[0].resourceId) &&
      typeof mutations[0].resourceId === 'string' &&
      mutations[0].expectedOwnerPlanSha256 === owners.get(lower2(mutations[0].resourceId)),
    'only the selected retained CE VM may be deleted and created',
  );
  require7(
    new Set(retainedResourceOwners.map((row) => lower2(row.resourceId))).size === retainedResourceOwners.length,
    'retained resource inventory is duplicated',
  );
  const ceResources = resourceSource.actions.filter((action) => ['vm-create', 'nic-create'].includes(action.kind));
  require7(
    ceResources.length === retained.topology.nodeCount * (retained.nics.length + 1),
    'complete retained CE VM and NIC graph required',
  );
  for (const action of ceResources) {
    require7(action.resourceId, 'retained CE resource identifier is unresolved');
    const rows = observation.resources.filter((row) => lower2(row.id) === lower2(action.resourceId));
    const row = rows.length === 1 ? rows[0] : undefined;
    require7(
      row?.exists &&
        row.owned &&
        row.tags['xcsh-managed-by'] === 'azure-ce' &&
        row.tags['xcsh-execution-engine'] === retained.engine &&
        row.tags['xcsh-deployment-id'] === retained.deploymentName &&
        row.tags['xcsh-plan-sha256'] === owners.get(lower2(action.resourceId)),
      'retained CE resource is missing, duplicated or foreign',
    );
  }
  const originalIds = new Set(retained.ownershipInventory.map((row) => lower2(row.resourceId)));
  require7(
    foundation.ownershipInventory.every((row) => originalIds.has(lower2(row.resourceId))),
    'replacement discovery contains an orphan or unrelated resource',
  );
  const { planId: _id, planSha256: _sha, ...base } = structuredClone(foundation);
  const relayProfile = {
    schemaVersion: 2,
    foundationPlan: structuredClone(foundation),
    retainedDeploymentPlan: structuredClone(retained),
    observation: structuredClone(observation),
    selection: structuredClone(retainedProfile.selection),
    catalog: structuredClone(retainedProfile.catalog),
    retainedResourceOwners,
  };
  const draft = {
    ...base,
    billableResources: structuredClone(retained.billableResources),
    ownershipInventory: retained.ownershipInventory.map((row) => ({ ...row, action: 'reference' })),
    relayProfile,
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-${planSha256.slice(0, 24)}`, planSha256 };
}
function verifyAzureRelayReplacementProfile(plan) {
  const profile = plan.relayProfile;
  require7(
    profile?.schemaVersion === 2 &&
      Object.keys(profile).sort().join(',') ===
        'catalog,foundationPlan,observation,retainedDeploymentPlan,retainedResourceOwners,schemaVersion,selection',
    'replacement profile shape differs',
  );
  if (profile?.schemaVersion !== 2) throw Error('Azure relay replacement plan: profile missing');
  const expected = compileAzureRelayReplacementPlan(
    profile.foundationPlan,
    profile.retainedDeploymentPlan,
    profile.observation,
  );
  require7(same3(plan, expected), 'replacement graph differs from exact retained source and discovery');
}
async function captureAzureReplacementRouteServerOwnership(plan, api, signal) {
  if (!plan.relayProfile) return captureAzureRouteServerOwnership(plan, api, signal);
  const relay = azureRelayPlanForDeployment(plan);
  const current = await observeAzureRelayRouteServerIdentity(plan, relay, api, signal);
  return {
    routeServerId: current.routeServerId,
    ownerPlanSha256: azureRelayResourceSource(plan).planSha256,
    peerIds: Object.fromEntries(current.peers.map((peer, index) => [String(index + 1), peer.id])),
  };
}
function validAzureReplacementRouteServerOwnership(plan, value) {
  if (
    !value ||
    Object.keys(value).sort().join(',') !== 'ownerPlanSha256,peerIds,routeServerId' ||
    typeof value.routeServerId !== 'string' ||
    typeof value.ownerPlanSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.ownerPlanSha256) ||
    !value.peerIds ||
    typeof value.peerIds !== 'object' ||
    Array.isArray(value.peerIds)
  )
    return false;
  const server = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network/virtualHubs/${plan.deploymentName}-rs`;
  const names = plan.relayProfile
    ? azureRelayPlanForDeployment(plan).relays.map((relay) => relay.name)
    : Array.from({ length: plan.topology.nodeCount }, (_, index) => `${plan.deploymentName}-${index + 1}`);
  return (
    lower2(value.routeServerId) === lower2(server) &&
    (!plan.relayProfile || value.ownerPlanSha256 === azureRelayResourceSource(plan).planSha256) &&
    Object.keys(value.peerIds).sort().join(',') === names.map((_name, index) => String(index + 1)).join(',') &&
    names.every(
      (name, index) =>
        typeof value.peerIds[String(index + 1)] === 'string' &&
        lower2(value.peerIds[String(index + 1)]) === lower2(`${server}/bgpConnections/${name}`),
    )
  );
}
function azureRelayReplacementRetainedOwner(plan, resourceId) {
  const profile = plan.relayProfile;
  require7(profile?.schemaVersion === 2, 'exact replacement owner inventory required');
  if (profile?.schemaVersion !== 2) throw Error('Azure relay replacement plan: owner inventory missing');
  const rows = profile.retainedResourceOwners.filter((row) => lower2(row.resourceId) === lower2(resourceId));
  require7(
    rows.length === 1 && /^[a-f0-9]{64}$/.test(rows[0].ownerPlanSha256),
    'resource owner is missing or ambiguous',
  );
  return rows[0].ownerPlanSha256;
}

// plugins/azure/src/ce/relay-plan.ts
var require8 = (condition, message) => {
  if (!condition) throw Error(`Azure relay plan: ${message}`);
};
var safeName = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
var reservedAsns = new Set([8074, 8075, 12076, 23456, 65515, 65517, 65518, 65519, 65520]);
var validAsn = (asn) =>
  Number.isInteger(asn) && asn > 0 && asn < 65535 && !reservedAsns.has(asn) && !(asn >= 64496 && asn <= 64511);
var ipv4Number = (address) => address.split('.').reduce((sum, octet) => sum * 256 + Number(octet), 0);
var unicastIpv4 = (value) => {
  if (isIP7(value) !== 4) return false;
  const [first, second] = value.split('.').map(Number);
  return first !== 0 && first !== 127 && first < 224 && !(first === 169 && second === 254);
};
function subnetRange(cidr) {
  const [address, prefix, extra] = cidr.split('/');
  require8(
    extra === undefined && isIP7(address) === 4 && /^(?:[0-9]|[12][0-9]|3[0-2])$/.test(prefix),
    'SLO requires a canonical IPv4 subnet',
  );
  const start = ipv4Number(address);
  const size = 2 ** (32 - Number(prefix));
  require8(start % size === 0 && size >= 8, 'SLO subnet is not a usable canonical network');
  return [start, start + size - 1];
}
function compileAzureRelayPlan(source, selected, catalog) {
  verifyAzureCePlan(source);
  require8(
    source.intent.operation === 'deploy' && source.routing.mode === 'route-server',
    'owning Route Server creation plan required',
  );
  require8(
    catalog?.region === source.region && catalog.image?.osType === 'Linux' && catalog.image?.architecture === 'amd64',
    'region-bound Linux host image observation required',
  );
  require8(selected && safeName.test(selected.vmSize), 'resolved relay VM size required');
  const sizes = catalog.vmSizes.filter((size) => size.name === selected.vmSize);
  require8(
    sizes.length === 1 &&
      !sizes[0].restricted &&
      sizes[0].maxNics >= 1 &&
      sizes[0].vCpus >= 2 &&
      sizes[0].memoryGb >= 4,
    'eligible relay VM size observation required',
  );
  const image = selected.hostImage;
  require8(
    image &&
      [image.publisher, image.offer, image.sku].every((value) => typeof value === 'string' && safeName.test(value)) &&
      /^\d+\.\d+\.\d+$/.test(image.version),
    'resolved exact relay host image required',
  );
  const urn = [image.publisher, image.offer, image.sku, image.version].join(':');
  const imageId = `/subscriptions/${source.subscription.id}/providers/Microsoft.Compute/locations/${source.region}/publishers/${image.publisher}/artifacttypes/vmimage/offers/${image.offer}/skus/${image.sku}/versions/${image.version}`;
  require8(
    catalog.image.urn.toLowerCase() === urn.toLowerCase() && catalog.image.id.toLowerCase() === imageId.toLowerCase(),
    'host image identity differs from catalog',
  );
  require8(
    selected.frr &&
      /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(selected.frr.version) &&
      /^[a-z0-9.-]+(?::[0-9]+)?\/(?:[a-z0-9]+(?:[._-][a-z0-9]+)*\/)*[a-z0-9]+(?:[._-][a-z0-9]+)*@sha256:[a-f0-9]{64}$/.test(
        selected.frr.image,
      ),
    'resolved FRR version and immutable OCI digest required',
  );
  require8(
    Array.isArray(selected.vipPrefixes) &&
      selected.vipPrefixes.length > 0 &&
      selected.vipPrefixes.length <= 8 &&
      new Set(selected.vipPrefixes).size === selected.vipPrefixes.length &&
      selected.vipPrefixes.every((prefix) => prefix.endsWith('/32') && unicastIpv4(prefix.slice(0, -3))),
    'explicit distinct IPv4 VIP host-prefix export policy required',
  );
  require8(
    selected.docker && /^\d+\.\d+\.\d+$/.test(selected.docker.version) && /^[a-f0-9]{64}$/.test(selected.docker.sha256),
    'exact static Docker version and archive digest required',
  );
  require8(
    Array.isArray(selected.returnPrefixes) &&
      selected.returnPrefixes.length > 0 &&
      selected.returnPrefixes.length <= 32 &&
      new Set(selected.returnPrefixes).size === selected.returnPrefixes.length &&
      selected.returnPrefixes.every((value) => {
        const [address, prefix, extra] = typeof value === 'string' ? value.split('/') : [];
        return (
          extra === undefined &&
          isIP7(address) === 4 &&
          /^(?:[1-9]|[12][0-9]|3[0-2])$/.test(prefix) &&
          unicastIpv4(address) &&
          ipv4Number(address) % 2 ** (32 - Number(prefix)) === 0
        );
      }),
    'explicit distinct canonical return prefix policy required',
  );
  const slo = source.nics.filter((nic) => nic.role === 'slo');
  require8(slo.length === 1 && typeof slo[0].subnet.cidr === 'string', 'one resolved SLO subnet required');
  const sloCidr = slo[0].subnet.cidr;
  const [start, end] = subnetRange(sloCidr);
  const subnetActions = source.actions.filter(
    (action) =>
      action.kind === 'subnet-create' && action.args?.[action.args.indexOf('--name') + 1] === slo[0].subnet.name,
  );
  require8(
    subnetActions.length === 1 && typeof subnetActions[0].resourceId === 'string',
    'owned SLO subnet creation identity required',
  );
  const sloSubnetId = subnetActions[0].resourceId;
  const vnetId = sloSubnetId.slice(0, sloSubnetId.lastIndexOf('/subnets/'));
  const vnets = source.actions.filter((action) => action.kind === 'vnet-create' && action.resourceId === vnetId);
  require8(vnets.length === 1, 'owned SLO VNet creation identity required');
  const servers = source.actions.filter((action) => action.kind === 'route-server-create');
  require8(
    servers.length === 1 && typeof servers[0].resourceId === 'string',
    'exact Route Server creation identity required',
  );
  require8(
    Array.isArray(selected.relays) &&
      selected.relays.length === 2 &&
      new Set(selected.relays.map((relay) => relay.privateAddress)).size === 2,
    'two distinct relay NIC addresses required',
  );
  for (const relay of selected.relays)
    require8(
      validAsn(relay.asn) &&
        relay.asn !== source.routing.localAsn &&
        unicastIpv4(relay.privateAddress) &&
        ipv4Number(relay.privateAddress) > start + 3 &&
        ipv4Number(relay.privateAddress) < end,
      'usable SLO NIC address and external relay ASN required',
    );
  const scope = `/subscriptions/${source.subscription.id}/resourceGroups/${source.intent.resourceGroup}/providers/`;
  const stem =
    source.deploymentName.length <= 48
      ? source.deploymentName
      : `${source.deploymentName.slice(0, 39)}-${canonicalSha256(source.deploymentName).slice(0, 8)}`;
  const relays = selected.relays.map((relay, index) => {
    const name = `${stem}-relay-${index + 1}`;
    const nicId = `${scope}Microsoft.Network/networkInterfaces/${name}-nic`;
    return {
      name,
      ...relay,
      vmId: `${scope}Microsoft.Compute/virtualMachines/${name}`,
      osDiskName: `${name}-osdisk`,
      osDiskId: `${scope}Microsoft.Compute/disks/${name}-osdisk`,
      nicId,
      ipConfigurationId: `${nicId}/ipConfigurations/ipconfig1`,
      subnetId: sloSubnetId,
      publicIpId: source.egress.mode === 'public-ip' ? `${scope}Microsoft.Network/publicIPAddresses/${name}-pip` : null,
    };
  });
  const draft = {
    schemaVersion: 1,
    engine: source.engine,
    sourcePlanId: source.planId,
    sourcePlanSha256: source.planSha256,
    subscriptionId: source.subscription.id,
    region: source.region,
    deploymentName: source.deploymentName,
    vnetId,
    sloSubnetId,
    sloCidr,
    routeServerId: servers[0].resourceId,
    catalog: structuredClone(catalog),
    vmSize: selected.vmSize,
    hostImage: { ...image, id: catalog.image.id, urn: catalog.image.urn },
    frr: { ...selected.frr },
    relays,
    localAsn: source.routing.localAsn,
    expectedSessions: source.topology.nodeCount * 2,
    payloadNetwork: 'slo',
    vipPrefixes: selected.vipPrefixes.toSorted(),
    returnPrefixes: selected.returnPrefixes.toSorted(),
    docker: {
      ...selected.docker,
      url: `https://download.docker.com/linux/static/stable/x86_64/docker-${selected.docker.version}.tgz`,
    },
    billableResources: [
      { type: 'relay-virtual-machine', count: 2 },
      { type: 'relay-os-disk', count: 2 },
      { type: 'relay-network-interface', count: 2 },
      ...(source.egress.mode === 'public-ip' ? [{ type: 'relay-public-ip', count: 2 }] : []),
    ],
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `azure-relay-${planSha256.slice(0, 24)}`, planSha256 };
}
function verifyAzureRelayPlan(source, plan) {
  verifyAzureCePlan(source);
  source = azureRelayResourceSource(source);
  const { planSha256, planId, ...draft } = plan;
  require8(
    plan.schemaVersion === 1 &&
      plan.engine === source.engine &&
      plan.sourcePlanId === source.planId &&
      plan.sourcePlanSha256 === source.planSha256 &&
      plan.subscriptionId === source.subscription.id &&
      plan.region === source.region &&
      plan.deploymentName === source.deploymentName &&
      planSha256 === canonicalSha256(draft) &&
      planId === `azure-relay-${planSha256.slice(0, 24)}`,
    'saved plan integrity or source ownership differs',
  );
  const reconstructed = compileAzureRelayPlan(
    source,
    {
      vmSize: plan.vmSize,
      hostImage: plan.hostImage,
      frr: plan.frr,
      relays: plan.relays.map(({ asn, privateAddress }) => ({ asn, privateAddress })),
      vipPrefixes: plan.vipPrefixes,
      returnPrefixes: plan.returnPrefixes,
      docker: plan.docker,
    },
    plan.catalog,
  );
  require8(
    canonicalSha256(reconstructed) === canonicalSha256(plan),
    'saved plan no longer matches its source-derived resource graph',
  );
}
function azureRelayOwnershipTags(source, plan) {
  verifyAzureRelayPlan(source, plan);
  return {
    'xcsh-managed-by': 'azure-ce',
    'xcsh-execution-engine': plan.engine,
    'xcsh-deployment-id': plan.deploymentName,
    'xcsh-plan-sha256': azureRelayResourceSource(source).planSha256,
    'xcsh-relay-plan-sha256': plan.planSha256,
  };
}

// plugins/azure/src/ce/relay-deployment-plan.ts
var require9 = (condition, message) => {
  if (!condition) throw Error(`Azure relay deployment: ${message}`);
};
var core = (catalog) => ({
  region: catalog.region,
  image: structuredClone(catalog.image),
  vmSizes: structuredClone(catalog.vmSizes),
});
function verifyCatalog(source, selection, catalog) {
  const provenance = catalog.provenance;
  require9(
    provenance?.method === 'azure-cli-live' &&
      provenance.sourcePlanSha256 === source.planSha256 &&
      Number.isFinite(Date.parse(provenance.observedAt)),
    'catalog source provenance differs',
  );
  const urn = [
    selection.hostImage.publisher,
    selection.hostImage.offer,
    selection.hostImage.sku,
    selection.hostImage.version,
  ].join(':');
  const queries = [
    ['account', 'show'],
    ['vm', 'image', 'show', '--urn', urn, '--location', source.region],
    ['vm', 'list-skus', '--size', selection.vmSize, '--location', source.region, '--all'],
  ].map((args) => [...args, '--subscription', source.subscription.id, '--output', 'json']);
  require9(
    Array.isArray(provenance.reads) &&
      provenance.reads.length === 3 &&
      provenance.reads.every(
        (read, index) =>
          read.command === 'az' &&
          JSON.stringify(read.args) === JSON.stringify(queries[index]) &&
          /^[a-f0-9]{64}$/.test(read.responseSha256) &&
          Number.isFinite(Date.parse(read.observedAt)) &&
          Date.parse(read.observedAt) <= Date.parse(provenance.observedAt),
      ),
    'catalog query receipts differ or are incomplete',
  );
  require9(
    catalog.vmSizes.length === 1 && catalog.vmSizes[0].name === selection.vmSize,
    'catalog VM selection differs',
  );
  return compileAzureRelayPlan(source, selection, core(catalog));
}
function compileAzureRelayDeploymentPlan(source, selection, catalog) {
  require9(!source.relayProfile, 'foundation cannot already contain a relay profile');
  verifyAzureCePlan(source);
  const relay = verifyCatalog(source, selection, catalog);
  const capacity = source.computeCapacity;
  require9(
    capacity &&
      Number.isSafeInteger(capacity.ceVcpus) &&
      capacity.ceVcpus > 0 &&
      Number.isSafeInteger(capacity.workloadVcpus) &&
      capacity.workloadVcpus >= 0 &&
      Number.isSafeInteger(capacity.quotaAvailable) &&
      capacity.quotaAvailable >= 0,
    'source compute capacity is unresolved',
  );
  const requiredVcpus =
    source.topology.nodeCount * capacity.ceVcpus +
    capacity.workloadVcpus +
    relay.relays.length * catalog.vmSizes[0].vCpus;
  require9(
    capacity.quotaAvailable >= requiredVcpus,
    `relay quota is insufficient: ${requiredVcpus} total vCPUs required`,
  );
  const { planId: _id, planSha256: _sha, ...base } = structuredClone(source);
  const actions = [];
  const removedIds = new Set();
  for (const action of base.actions) {
    if (action.kind === 'route-server-peer-create') {
      if (action.resourceId) removedIds.add(action.resourceId.toLowerCase());
      continue;
    }
    actions.push(action);
    if (action.kind === 'route-server-create')
      actions.push({
        id: '',
        phase: 'routing',
        kind: 'relay-provision',
        description: 'Provision both exact owned relay VMs and Route Server peers; guest routing remains gated',
        resourceId: relay.routeServerId,
        mutates: true,
        destructive: false,
      });
  }
  require9(
    actions.filter((action) => action.kind === 'relay-provision').length === 1,
    'exact relay provisioning boundary required',
  );
  actions.forEach((action, index) => {
    action.id = String(index + 1).padStart(3, '0');
  });
  const ownershipInventory = base.ownershipInventory.filter((item) => !removedIds.has(item.resourceId.toLowerCase()));
  for (const item of relay.relays)
    for (const resourceId of [
      item.vmId,
      item.osDiskId,
      item.nicId,
      ...(item.publicIpId ? [item.publicIpId] : []),
      `${relay.routeServerId}/bgpConnections/${item.name}`,
    ]) {
      require9(
        !ownershipInventory.some((current) => current.resourceId.toLowerCase() === resourceId.toLowerCase()),
        'relay resource graph collides with foundation',
      );
      ownershipInventory.push({ resourceId, owned: true, action: 'create' });
    }
  const costs = new Map();
  for (const item of base.billableResources) costs.set(item.type, (costs.get(item.type) ?? 0) + item.count);
  for (const item of [
    { type: 'virtual-machine', count: 2 },
    { type: 'managed-disk', count: 2 },
    ...(source.egress.mode === 'public-ip' ? [{ type: 'standard-public-ip', count: 2 }] : []),
  ])
    costs.set(item.type, (costs.get(item.type) ?? 0) + item.count);
  const relayProfile = {
    schemaVersion: 1,
    foundationPlan: structuredClone(source),
    selection: structuredClone(selection),
    catalog: structuredClone(catalog),
  };
  const draft = {
    ...base,
    actions,
    ownershipInventory,
    billableResources: [...costs].map(([type, count]) => ({ type, count })),
    relayProfile,
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-${planSha256.slice(0, 24)}`, planSha256 };
}
function verifyAzureRelayDeploymentProfile(plan) {
  const profile = plan.relayProfile;
  require9(
    profile?.schemaVersion === 1 &&
      Object.keys(profile).sort().join(',') === 'catalog,foundationPlan,schemaVersion,selection',
    'relay profile is malformed',
  );
  if (profile?.schemaVersion !== 1) throw Error('Azure relay deployment: creation profile missing');
  require9(!profile.foundationPlan.relayProfile, 'recursive foundation profile is forbidden');
  const expected = compileAzureRelayDeploymentPlan(profile.foundationPlan, profile.selection, profile.catalog);
  require9(
    canonicalSha256(plan) === canonicalSha256(expected),
    'final execution graph differs from verified foundation/catalog inputs',
  );
}
function azureRelayPlanForDeployment(plan) {
  verifyAzureCePlan(plan);
  if (!plan.relayProfile) throw Error('Azure relay deployment: relay profile is not selected');
  const owner = azureRelayResourceSource(plan);
  const profile = owner.relayProfile;
  if (profile?.schemaVersion !== 1) throw Error('Azure relay deployment: exact creation source required');
  return compileAzureRelayPlan(owner, profile.selection, core(profile.catalog));
}

// plugins/azure/src/ce/native-action-recovery.ts
var RECOVERABLE_KINDS = new Set([
  'resource-group-create',
  'vnet-create',
  'subnet-create',
  'nsg-create',
  'nsg-rule-create',
  'public-ip-create',
  'nic-create',
  'nic-update',
  'vm-create',
  'vm-start',
  'vm-stop',
  'vm-deallocate',
  'vm-resize',
  'vm-delete',
  'route-table-create',
  'route-create',
  'route-association-update',
  'route-server-create',
  'route-server-peer-create',
  'route-server-peer-update',
  'brownfield-restore',
]);
function object8(value, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value;
}
function nested(value, keys) {
  let current = value;
  for (const key of keys) {
    if (!current || typeof current !== 'object') return;
    current = current[key];
  }
  return current;
}
function lower3(value) {
  return typeof value === 'string' ? value.toLowerCase() : '';
}
function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
function options(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return [];
  const values = [];
  for (let cursor = index + 1; cursor < args.length && !args[cursor].startsWith('--'); cursor++)
    values.push(args[cursor]);
  return values;
}
function errorCode(stdout, stderr) {
  for (const raw of [stderr, stdout]) {
    try {
      const value = JSON.parse(raw);
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const record = value;
        if (typeof record.code === 'string') return record.code;
        if (record.error && typeof record.error === 'object' && !Array.isArray(record.error)) {
          const code = record.error.code;
          if (typeof code === 'string') return code;
        }
      }
    } catch {}
  }
  return (
    /^(?:ERROR:\s*)?\(([A-Za-z][A-Za-z0-9]+)\)/m.exec(stderr)?.[1] ??
    /^Code:\s*([A-Za-z][A-Za-z0-9]+)\s*$/m.exec(stderr)?.[1]
  );
}
function assertRecoverableAction(action) {
  if (
    !action.mutates ||
    action.command !== 'az' ||
    !action.args ||
    !action.resourceId ||
    !RECOVERABLE_KINDS.has(action.kind)
  )
    throw new Error('Azure native mutation has no supported durable recovery contract');
}
function expectedRequest(plan, action) {
  if (action.kind === 'relay-provision') {
    const relay = azureRelayPlanForDeployment(plan);
    const expected = plan.actions.find((item) => item.id === action.id);
    if (
      plan.engine !== 'native' ||
      !expected ||
      canonicalSha256(expected) !== canonicalSha256(action) ||
      !action.mutates ||
      action.resourceId !== relay.routeServerId ||
      action.command ||
      action.args
    )
      throw Error('Azure relay pending action differs from the immutable native boundary');
    const resourceId = relay.routeServerId.toLowerCase();
    return {
      actionId: action.id,
      kind: action.kind,
      resourceId,
      requestSha256: canonicalSha256({
        planSha256: plan.planSha256,
        actionId: action.id,
        kind: action.kind,
        resourceId,
        relayPlanSha256: relay.planSha256,
      }),
    };
  }
  assertRecoverableAction(action);
  const resourceId = action.resourceId.toLowerCase();
  return {
    actionId: action.id,
    kind: action.kind,
    resourceId,
    requestSha256: canonicalSha256({
      planSha256: plan.planSha256,
      actionId: action.id,
      kind: action.kind,
      resourceId,
      args: action.args,
    }),
  };
}
function buildAzureNativePendingAction(plan, action) {
  return expectedRequest(plan, action);
}
function validateAzureNativePendingAction(plan, completedActionIds, value) {
  const action = plan.actions[completedActionIds.length];
  if (!action) throw new Error('Pending Azure native mutation has no next immutable action');
  const expected = expectedRequest(plan, action);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Pending Azure native mutation is malformed');
  const candidate = value;
  if (
    Object.keys(candidate).sort().join(',') !== 'actionId,kind,requestSha256,resourceId' ||
    canonicalSha256(candidate) !== canonicalSha256(expected)
  )
    throw new Error('Pending Azure native mutation differs from the immutable request');
  return expected;
}
function ownershipParent(resourceId) {
  const patterns = [
    /^(.*\/providers\/microsoft\.network\/virtualnetworks\/[^/]+)\/subnets\/[^/]+$/i,
    /^(.*\/providers\/microsoft\.network\/networksecuritygroups\/[^/]+)\/securityrules\/[^/]+$/i,
    /^(.*\/providers\/microsoft\.network\/routetables\/[^/]+)\/routes\/[^/]+$/i,
    /^(.*\/providers\/microsoft\.network\/virtualhubs\/[^/]+)\/bgpconnections\/[^/]+$/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(resourceId);
    if (match) return match[1];
  }
}
async function readResource(plan, resourceId, api, signal, vm = false) {
  const group = !resourceId.toLowerCase().includes('/providers/');
  const result = await api.exec(
    'az',
    group
      ? [
          'group',
          'show',
          '--name',
          plan.intent.resourceGroup,
          '--subscription',
          plan.subscription.id,
          '--output',
          'json',
        ]
      : vm
        ? [
            'vm',
            'show',
            '--ids',
            resourceId,
            '--show-details',
            '--subscription',
            plan.subscription.id,
            '--output',
            'json',
          ]
        : ['resource', 'show', '--ids', resourceId, '--subscription', plan.subscription.id, '--output', 'json'],
    signal ? { signal } : undefined,
  );
  if (result.exitCode !== 0) {
    const code = errorCode(result.stdout, result.stderr);
    if (code === 'ResourceNotFound' || code === 'ResourceGroupNotFound') return;
    throw new Error('Azure pending mutation postcondition evidence is unavailable');
  }
  let value;
  try {
    value = object8(JSON.parse(result.stdout), 'Malformed Azure pending mutation postcondition evidence');
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Malformed Azure pending mutation postcondition evidence');
    throw error;
  }
  if (lower3(value.id) !== resourceId.toLowerCase() || value.nextLink !== undefined)
    throw new Error('Azure pending mutation returned a different resource identity');
  return value;
}
function assertOwner(plan, value, expectedPlanSha256 = plan.planSha256) {
  const tags = object8(value.tags, 'Azure pending mutation ownership tags are unavailable');
  if (
    tags['xcsh-managed-by'] !== 'azure-ce' ||
    tags['xcsh-deployment-id'] !== plan.deploymentName ||
    tags['xcsh-execution-engine'] !== plan.engine ||
    tags['xcsh-plan-sha256'] !== expectedPlanSha256
  )
    throw new Error('Azure pending mutation belongs to another owner or immutable plan');
}
async function assertTargetOwnership(plan, action, value, api, signal) {
  const expectedOwner = action.expectedOwnerPlanSha256 ?? plan.planSha256;
  const parentId = ownershipParent(action.resourceId ?? '');
  if (!parentId) {
    assertOwner(plan, value, expectedOwner);
    return;
  }
  const parent = await readResource(plan, parentId, api, signal);
  if (!parent) throw new Error('Azure pending mutation ownership parent is absent');
  assertOwner(plan, parent, expectedOwner);
}
function sameStrings(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => lower3(value) === expected[index].toLowerCase())
  );
}
function requirePostcondition(condition, kind) {
  if (!condition) throw new Error(`Azure pending ${kind} postcondition differs from the immutable request`);
  return true;
}
function routeMatches(route, action) {
  const args = action.args ?? [];
  const properties =
    route.properties && typeof route.properties === 'object' && !Array.isArray(route.properties)
      ? route.properties
      : route;
  return (
    properties.addressPrefix === option(args, '--address-prefix') &&
    lower3(properties.nextHopType) === lower3(option(args, '--next-hop-type')) &&
    lower3(properties.nextHopIpAddress ?? '') === lower3(option(args, '--next-hop-ip-address') ?? '')
  );
}
function childPostcondition(action, value) {
  const args = action.args ?? [];
  const properties = object8(value.properties ?? {}, 'Azure pending mutation properties are malformed');
  if (action.kind === 'subnet-create') {
    const expected = options(args, '--address-prefixes');
    const actual = Array.isArray(properties.addressPrefixes) ? properties.addressPrefixes : [properties.addressPrefix];
    return requirePostcondition(sameStrings(actual, expected), action.kind);
  }
  if (action.kind === 'nsg-rule-create') {
    return requirePostcondition(
      Number(properties.priority) === Number(option(args, '--priority')) &&
        lower3(properties.direction) === lower3(option(args, '--direction')) &&
        lower3(properties.protocol) === lower3(option(args, '--protocol')) &&
        lower3(properties.access) === lower3(option(args, '--access')) &&
        sameStrings(properties.sourceAddressPrefixes, options(args, '--source-address-prefixes')) &&
        sameStrings(properties.destinationAddressPrefixes, options(args, '--destination-address-prefixes')) &&
        sameStrings(properties.destinationPortRanges, options(args, '--destination-port-ranges')),
      action.kind,
    );
  }
  if (action.kind === 'route-server-peer-create' || action.kind === 'route-server-peer-update') {
    return requirePostcondition(
      lower3(properties.peerIp) === lower3(option(args, '--peer-ip')) &&
        Number(properties.peerAsn) === Number(option(args, '--peer-asn')),
      action.kind,
    );
  }
  if (action.kind === 'route-create') return requirePostcondition(routeMatches(value, action), action.kind);
  return true;
}
function brownfieldPostcondition(action, value) {
  const args = action.args ?? [];
  if (args.slice(0, 4).join(' ') === 'network route-table route create') {
    const routes = nested(value, ['properties', 'routes']);
    const selected = Array.isArray(routes)
      ? routes.filter(
          (candidate) =>
            candidate &&
            typeof candidate === 'object' &&
            !Array.isArray(candidate) &&
            String(candidate.name) === option(args, '--name'),
        )
      : [];
    return selected.length === 1 && routeMatches(selected[0], action);
  }
  if (args.slice(0, 4).join(' ') === 'network route-table route delete') {
    const routes = nested(value, ['properties', 'routes']);
    return (
      Array.isArray(routes) &&
      !routes.some(
        (candidate) =>
          candidate &&
          typeof candidate === 'object' &&
          !Array.isArray(candidate) &&
          String(candidate.name) === option(args, '--name'),
      )
    );
  }
  if (args.slice(0, 4).join(' ') === 'network vnet subnet update') {
    const actual = lower3(nested(value, ['properties', 'routeTable', 'id']));
    const expected = lower3(option(args, '--route-table'));
    return args.includes('--remove') ? !actual : Boolean(expected) && actual === expected;
  }
  throw new Error('Azure brownfield recovery request is unsupported');
}
function resourcePostcondition(plan, action, value) {
  const args = action.args ?? [];
  const provisioning = nested(value, ['properties', 'provisioningState']) ?? value.provisioningState;
  if (typeof provisioning === 'string' && provisioning !== 'Succeeded') return false;
  switch (action.kind) {
    case 'resource-group-create':
      return requirePostcondition(lower3(value.location) === plan.region.toLowerCase(), action.kind);
    case 'vnet-create':
      return requirePostcondition(
        sameStrings(
          nested(value, ['properties', 'addressSpace', 'addressPrefixes']),
          options(args, '--address-prefixes'),
        ),
        action.kind,
      );
    case 'public-ip-create':
      return requirePostcondition(
        lower3(nested(value, ['sku', 'name'])) === lower3(option(args, '--sku')) &&
          lower3(nested(value, ['properties', 'publicIPAllocationMethod'])) ===
            lower3(option(args, '--allocation-method')),
        action.kind,
      );
    case 'nic-create': {
      const ipConfigurations = nested(value, ['properties', 'ipConfigurations']);
      const configurations = Array.isArray(ipConfigurations) ? ipConfigurations : [];
      const expectedSubnet = option(args, '--subnet');
      const groupScope = action.resourceId?.slice(
        0,
        action.resourceId.toLowerCase().indexOf('/providers/microsoft.network/'),
      );
      const subnetId = expectedSubnet?.startsWith('/')
        ? expectedSubnet
        : `${groupScope}/providers/Microsoft.Network/virtualNetworks/${option(args, '--vnet-name')}/subnets/${expectedSubnet}`;
      const publicIp = option(args, '--public-ip-address');
      const publicIpId = publicIp
        ? `${groupScope}/providers/Microsoft.Network/publicIPAddresses/${publicIp}`
        : undefined;
      const nsg = option(args, '--network-security-group');
      const nsgId = nsg ? `${groupScope}/providers/Microsoft.Network/networkSecurityGroups/${nsg}` : undefined;
      return requirePostcondition(
        configurations.length === 1 &&
          lower3(nested(configurations[0], ['properties', 'subnet', 'id'])) === lower3(subnetId) &&
          lower3(nested(configurations[0], ['properties', 'publicIPAddress', 'id'])) === lower3(publicIpId) &&
          lower3(nested(value, ['properties', 'networkSecurityGroup', 'id'])) === lower3(nsgId),
        action.kind,
      );
    }
    case 'vm-create': {
      const expectedNics = options(args, '--nics').map(
        (name) =>
          `${action.resourceId?.slice(0, action.resourceId.toLowerCase().indexOf('/providers/microsoft.compute/'))}` +
          `/providers/Microsoft.Network/networkInterfaces/${name}`,
      );
      const actualNics =
        nested(value, ['networkProfile', 'networkInterfaces']) ??
        nested(value, ['properties', 'networkProfile', 'networkInterfaces']);
      const image =
        nested(value, ['storageProfile', 'imageReference']) ??
        nested(value, ['properties', 'storageProfile', 'imageReference']);
      const marketplacePlan = value.plan ?? nested(value, ['properties', 'plan']);
      return requirePostcondition(
        lower3(
          nested(value, ['hardwareProfile', 'vmSize']) ?? nested(value, ['properties', 'hardwareProfile', 'vmSize']),
        ) === lower3(option(args, '--size')) &&
          Array.isArray(actualNics) &&
          sameStrings(
            actualNics.map((row) => nested(row, ['id'])),
            expectedNics,
          ) &&
          lower3(nested(image, ['publisher'])) === lower3(option(args, '--plan-publisher')) &&
          lower3(nested(image, ['offer'])) === lower3(option(args, '--plan-product')) &&
          lower3(nested(image, ['sku'])) === lower3(option(args, '--plan-name')) &&
          lower3(nested(image, ['version'])) === lower3(plan.image.version) &&
          lower3(nested(marketplacePlan, ['publisher'])) === lower3(option(args, '--plan-publisher')) &&
          lower3(nested(marketplacePlan, ['product'])) === lower3(option(args, '--plan-product')) &&
          lower3(nested(marketplacePlan, ['name'])) === lower3(option(args, '--plan-name')),
        action.kind,
      );
    }
    case 'route-server-create': {
      const configurations = nested(value, ['properties', 'ipConfigurations']);
      const rows = Array.isArray(configurations) ? configurations : [];
      const hostedSubnet = option(args, '--hosted-subnet');
      const groupScope = action.resourceId?.slice(
        0,
        action.resourceId.toLowerCase().indexOf('/providers/microsoft.network/'),
      );
      const publicIp = `${groupScope}/providers/Microsoft.Network/publicIPAddresses/${option(args, '--public-ip-address')}`;
      return requirePostcondition(
        rows.some(
          (row) =>
            lower3(nested(row, ['properties', 'subnet', 'id'])) === lower3(hostedSubnet) &&
            lower3(nested(row, ['properties', 'publicIPAddress', 'id'])) === lower3(publicIp),
        ),
        action.kind,
      );
    }
    case 'nic-update': {
      const configurations = nested(value, ['properties', 'ipConfigurations']);
      const configuration =
        Array.isArray(configurations) && configurations.length === 1 ? configurations[0] : undefined;
      const name = option(args, '--name');
      requirePostcondition(
        typeof name === 'string' &&
          !/^__.*__$/.test(name) &&
          nested(configuration, ['name']) === name &&
          lower3(nested(configuration, ['id'])) === lower3(`${action.resourceId}/ipConfigurations/${name}`) &&
          nested(configuration, ['properties', 'primary']) === true &&
          nested(configuration, ['properties', 'provisioningState']) === 'Succeeded',
        action.kind,
      );
      return lower3(nested(configuration, ['properties', 'subnet', 'id'])) === lower3(option(args, '--subnet'));
    }
    case 'route-association-update':
      return requirePostcondition(
        lower3(nested(value, ['properties', 'routeTable', 'id'])) === lower3(option(args, '--route-table')),
        action.kind,
      );
    case 'brownfield-restore':
      return brownfieldPostcondition(action, value);
    default:
      return childPostcondition(action, value);
  }
}
async function azureNativePendingActionConverged(plan, action, api, signal) {
  assertRecoverableAction(action);
  const value = await readResource(
    plan,
    action.resourceId,
    api,
    signal,
    ['vm-create', 'vm-start', 'vm-stop', 'vm-deallocate', 'vm-resize', 'vm-delete'].includes(action.kind),
  );
  if (action.kind === 'vm-delete') return value === undefined;
  if (!value) return false;
  if (action.kind === 'route-association-update' && plan.routing.udr) {
    await assertAzureGreenfieldUdrAssociationOwnership(plan, action, api, signal);
    return resourcePostcondition(plan, action, value);
  }
  if (
    ['route-association-update', 'brownfield-restore'].includes(action.kind) ||
    (action.kind === 'route-create' && plan.intent.brownfield.routeChanges.length > 0)
  ) {
    return resourcePostcondition(plan, action, value);
  }
  await assertTargetOwnership(plan, action, value, api, signal);
  if (action.kind === 'vm-start' || action.kind === 'vm-stop' || action.kind === 'vm-deallocate') {
    const expected = action.kind === 'vm-start' ? 'running' : 'deallocated';
    return lower3(value.powerState).replace(/^vm\s+/, '') === expected;
  }
  if (action.kind === 'vm-resize') {
    return (
      lower3(
        nested(value, ['hardwareProfile', 'vmSize']) ?? nested(value, ['properties', 'hardwareProfile', 'vmSize']),
      ) === lower3(option(action.args ?? [], '--size'))
    );
  }
  return resourcePostcondition(plan, action, value);
}

// plugins/azure/src/ce/network-update.ts
import { isIP as isIP8 } from 'node:net';

var require10 = (condition, message) => {
  if (!condition) throw Error(`Azure network update identity: ${message}`);
};
var object9 = (value) => {
  require10(value && typeof value === 'object' && !Array.isArray(value), 'malformed cloud record');
  return value;
};
var lower4 = (value) => (typeof value === 'string' ? value.toLowerCase() : '');
var uuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
var sha = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
var same4 = canonicalEqual;
var mac = (value) =>
  typeof value === 'string' &&
  /^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(value) &&
  (Number.parseInt(value.slice(0, 2), 16) & 1) === 0 &&
  value !== '00:00:00:00:00:00';
var exactKeys = (value, names) => {
  const keys = Object.keys(object9(value)).sort(),
    expected = names.toSorted();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
};
var number = (value) => value.split('.').reduce((sum, octet) => sum * 256 + Number(octet), 0);
function usableAzureNetworkAddress(address, cidr) {
  if (typeof address !== 'string' || isIP8(address) !== 4 || typeof cidr !== 'string') return false;
  const [network, prefix, extra] = cidr.split('/');
  if (extra !== undefined || isIP8(network) !== 4 || !/^(?:[0-9]|[12][0-9]|3[0-2])$/.test(prefix)) return false;
  const size = 2 ** (32 - Number(prefix));
  return (
    size >= 8 &&
    number(network) % size === 0 &&
    number(address) > number(network) + 3 &&
    number(address) < number(network) + size - 1
  );
}
function usableSubnet(cidr) {
  if (typeof cidr !== 'string') return false;
  const [network, prefix, extra] = cidr.split('/');
  if (extra !== undefined || isIP8(network) !== 4 || !/^(?:[0-9]|[12][0-9]|3[0-2])$/.test(prefix)) return false;
  const size = 2 ** (32 - Number(prefix));
  return size >= 8 && number(network) % size === 0;
}
var azureNetworkIpConfigurationReference = (node, index) => `__NODE_${node}_NIC_${index}_IPCONFIG_NAME__`;
function subnetVnet(id, plan) {
  require10(
    typeof id === 'string' &&
      /^\/subscriptions\/[^/]+\/resourceGroups\/[^/]+\/providers\/Microsoft\.Network\/virtualNetworks\/[^/]+\/subnets\/[^/]+$/i.test(
        id,
      ) &&
      lower4(id).startsWith(`/subscriptions/${plan.subscription.id}/`.toLowerCase()),
    'concrete same-subscription subnet identity required',
  );
  return id.slice(0, id.toLowerCase().lastIndexOf('/subnets/'));
}
function argument(action, flag) {
  const args = action.args ?? [],
    index = args.indexOf(flag);
  require10(
    index >= 0 &&
      args.lastIndexOf(flag) === index &&
      typeof args[index + 1] === 'string' &&
      !args[index + 1].startsWith('--'),
    `exact ${flag} argument required`,
  );
  return args[index + 1];
}
function actions(plan, node, verifiedSnapshot = false) {
  if (!verifiedSnapshot) verifyAzureCePlan(plan);
  const matchArgs = (actual, expected) =>
    verifiedSnapshot && Array.isArray(actual)
      ? actual.length === expected.length && expected.every((value, index) => actual[index] === value)
      : same4(actual, expected);
  require10(plan.intent.operation === 'update-network', 'network-update plan required');
  const vm = plan.actions.filter((a) => a.kind === 'vm-deallocate' && a.node === node);
  const nics = plan.actions.filter((a) => a.kind === 'nic-update' && a.node === node);
  const expectedVm = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${plan.deploymentName}-${node}`;
  require10(
    vm.length === 1 &&
      lower4(vm[0].resourceId) === lower4(expectedVm) &&
      sha(vm[0].expectedOwnerPlanSha256) &&
      nics.length === plan.nics.length,
    'complete planned VM/NIC owner scope required',
  );
  const starts = plan.actions.filter((action) => action.kind === 'vm-start' && action.node === node);
  require10(
    starts.length === 1 &&
      lower4(starts[0].resourceId) === lower4(expectedVm) &&
      starts[0].expectedOwnerPlanSha256 === vm[0].expectedOwnerPlanSha256,
    'complete retained VM restart scope required',
  );
  for (const action of [vm[0], starts[0]])
    require10(
      action.command === 'az' &&
        action.mutates === true &&
        matchArgs(action.args, [
          'vm',
          action.kind === 'vm-start' ? 'start' : 'deallocate',
          '--resource-group',
          plan.intent.resourceGroup,
          '--name',
          `${plan.deploymentName}-${node}`,
          '--subscription',
          plan.subscription.id,
        ]),
      'VM command differs from its owned identity',
    );
  for (const nic of plan.nics) {
    const id = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network/networkInterfaces/${plan.deploymentName}-${node}-nic${nic.index}`;
    const matches = nics.filter((a) => lower4(a.resourceId) === lower4(id));
    require10(matches.length === 1 && sha(matches[0].expectedOwnerPlanSha256), 'unique planned NIC owner required');
    const target = argument(matches[0], '--subnet');
    subnetVnet(target, plan);
    const expectedTarget =
      nic.subnet.resourceId ??
      `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network/virtualNetworks/${plan.deploymentName}-vnet/subnets/${nic.subnet.name}`;
    require10(lower4(target) === lower4(expectedTarget), 'target subnet differs from saved intent');
    require10(
      matches[0].command === 'az' &&
        matches[0].mutates === true &&
        matchArgs(matches[0].args, [
          'network',
          'nic',
          'ip-config',
          'update',
          '--resource-group',
          plan.intent.resourceGroup,
          '--nic-name',
          `${plan.deploymentName}-${node}-nic${nic.index}`,
          '--name',
          argument(matches[0], '--name'),
          '--subnet',
          target,
          '--subscription',
          plan.subscription.id,
        ]),
      'NIC command differs from its owned identity',
    );
  }
  return { vm: vm[0], nics };
}
function owned(plan, row, owner) {
  const tags = object9(row.tags);
  require10(
    tags['xcsh-managed-by'] === 'azure-ce' &&
      tags['xcsh-execution-engine'] === plan.engine &&
      tags['xcsh-deployment-id'] === plan.deploymentName &&
      tags['xcsh-plan-sha256'] === owner,
    'foreign cloud owner or engine',
  );
}
async function azJson(api, args, signal) {
  signal?.throwIfAborted();
  const response = await api.exec('az', [...args, '--output', 'json'], signal ? { signal } : undefined);
  signal?.throwIfAborted();
  require10(response.exitCode === 0, 'cloud observation unavailable');
  let value;
  try {
    value = JSON.parse(response.stdout);
  } catch {
    throw Error('Azure network update identity: malformed cloud JSON');
  }
  if (value && typeof value === 'object' && !Array.isArray(value))
    require10(
      !['nextLink', 'error', 'errors'].some((key) => object9(value)[key]),
      'partial or failed cloud observation',
    );
  return value;
}
async function captureAzureNetworkUpdateInventory(plan, api, signal) {
  verifyAzureCePlan(plan);
  const binding = azureUpgradeBinding(plan);
  for (let node = 1; node <= plan.topology.nodeCount; node++) actions(plan, node);
  const account = object9(await azJson(api, ['account', 'show', '--subscription', plan.subscription.id], signal));
  require10(
    lower4(account.id) === lower4(plan.subscription.id) &&
      lower4(account.tenantId) === lower4(plan.subscription.tenantId) &&
      account.environmentName === plan.subscription.cloud &&
      account.state === 'Enabled',
    'active account identity differs',
  );
  const rawVms = await azJson(
    api,
    [
      'vm',
      'list',
      '--resource-group',
      plan.intent.resourceGroup,
      '--subscription',
      plan.subscription.id,
      '--show-details',
    ],
    signal,
  );
  require10(Array.isArray(rawVms), 'complete VM inventory required');
  const vms = rawVms.map(object9);
  const subnets = new Map(),
    vnets = new Map();
  const subnet = async (id) => {
    const key = lower4(id);
    if (subnets.has(key)) return subnets.get(key);
    const value = object9(
      await azJson(
        api,
        ['network', 'vnet', 'subnet', 'show', '--ids', id, '--subscription', plan.subscription.id],
        signal,
      ),
    );
    const prefixes = [
      value.addressPrefix,
      ...(Array.isArray(value.addressPrefixes) ? value.addressPrefixes : []),
    ].filter((prefix) => typeof prefix === 'string' && isIP8(prefix.split('/')[0]) === 4);
    require10(
      lower4(value.id) === key && value.provisioningState === 'Succeeded' && new Set(prefixes).size === 1,
      'target or source subnet unavailable/ambiguous',
    );
    const prefix = prefixes[0];
    require10(usableSubnet(prefix), 'usable IPv4 subnet required');
    subnets.set(key, prefix);
    return prefix;
  };
  const nodes = {};
  for (const [index, name] of binding.nodes.entries()) {
    const node = index + 1,
      planned = actions(plan, node),
      matches = vms.filter((vm) => lower4(vm.id) === lower4(planned.vm.resourceId));
    require10(matches.length === 1, 'VM identity missing or duplicate');
    const vm = matches[0];
    owned(plan, vm, planned.vm.expectedOwnerPlanSha256);
    require10(
      vm.name === name &&
        lower4(vm.location) === lower4(plan.region) &&
        vm.provisioningState === 'Succeeded' &&
        uuid(vm.vmId) &&
        lower4(object9(vm.hardwareProfile).vmSize) === lower4(plan.vm.size),
      'VM generation or configuration differs',
    );
    const attached = object9(vm.networkProfile).networkInterfaces;
    require10(
      Array.isArray(attached) &&
        same4(
          attached.map((item) => lower4(object9(item).id)).sort(),
          planned.nics.map((nic) => lower4(nic.resourceId)).sort(),
        ),
      'complete exact VM/NIC attachment required',
    );
    const nics = {};
    for (const nic of plan.nics) {
      const action = planned.nics.find((a) => lower4(a.resourceId).endsWith(`-nic${nic.index}`));
      const id = action.resourceId;
      const value = object9(
        await azJson(api, ['network', 'nic', 'show', '--ids', id, '--subscription', plan.subscription.id], signal),
      );
      owned(plan, value, action.expectedOwnerPlanSha256);
      require10(
        lower4(value.id) === lower4(id) &&
          lower4(value.location) === lower4(plan.region) &&
          value.provisioningState === 'Succeeded' &&
          lower4(object9(value.virtualMachine).id) === lower4(vm.id),
        'NIC identity or VM attachment differs',
      );
      require10(
        Array.isArray(value.ipConfigurations) && value.ipConfigurations.length === 1,
        'one authoritative IP configuration required',
      );
      const config = object9(value.ipConfigurations[0]);
      const configName = config.name;
      require10(
        typeof configName === 'string' &&
          /^[a-z0-9][a-z0-9_.-]{0,79}$/i.test(configName) &&
          lower4(config.id) === lower4(`${id}/ipConfigurations/${configName}`) &&
          config.primary === true &&
          config.provisioningState === 'Succeeded' &&
          config.privateIPAddressVersion === 'IPv4' &&
          ['Dynamic', 'Static'].includes(String(config.privateIPAllocationMethod)),
        'complete IP configuration identity/state required',
      );
      const sourceId = object9(config.subnet).id,
        targetId = argument(action, '--subnet');
      const vnetId = subnetVnet(sourceId, plan);
      require10(
        lower4(vnetId) === lower4(subnetVnet(targetId, plan)),
        'retained NIC subnet update requires the same VNet',
      );
      if (!vnets.has(lower4(vnetId)))
        vnets.set(
          lower4(vnetId),
          object9(
            await azJson(
              api,
              ['network', 'vnet', 'show', '--ids', vnetId, '--subscription', plan.subscription.id],
              signal,
            ),
          ),
        );
      const vnet = vnets.get(lower4(vnetId));
      require10(
        lower4(vnet.id) === lower4(vnetId) &&
          lower4(vnet.location) === lower4(plan.region) &&
          vnet.provisioningState === 'Succeeded',
        'VNet identity or readiness differs',
      );
      const approved = plan.intent.brownfield.resourceIds.some((id) =>
        [vnetId, String(sourceId), targetId].some((candidate) => lower4(candidate) === lower4(id)),
      );
      if (!approved) owned(plan, vnet, action.expectedOwnerPlanSha256);
      const sourceCidr = await subnet(String(sourceId)),
        targetCidr = await subnet(targetId);
      require10(
        usableAzureNetworkAddress(config.privateIPAddress, sourceCidr),
        'source private address is outside usable subnet',
      );
      require10(!nic.subnet.cidr || nic.subnet.cidr === targetCidr, 'target subnet CIDR differs from saved intent');
      require10(
        config.privateIPAllocationMethod !== 'Static' || usableAzureNetworkAddress(config.privateIPAddress, targetCidr),
        'static address cannot be retained in the target subnet',
      );
      nics[String(nic.index)] = {
        resourceId: id,
        ownerPlanSha256: action.expectedOwnerPlanSha256,
        mac: lower4(value.macAddress).replaceAll('-', ':'),
        ipConfigurationId: String(config.id),
        ipConfigurationName: String(configName),
        allocation: config.privateIPAllocationMethod,
        privateIp: String(config.privateIPAddress),
        subnetId: String(sourceId),
        subnetCidr: sourceCidr,
        targetSubnetId: targetId,
        targetSubnetCidr: targetCidr,
      };
    }
    nodes[String(node)] = {
      resourceId: planned.vm.resourceId,
      vmId: String(vm.vmId),
      ownerPlanSha256: planned.vm.expectedOwnerPlanSha256,
      nics,
    };
  }
  const inventory = {
    schemaVersion: 1,
    engine: plan.engine,
    planSha256: plan.planSha256,
    collectedAt: new Date().toISOString(),
    nodes,
  };
  validateAzureNetworkUpdateInventory(plan, inventory);
  return inventory;
}
function validateAzureNetworkUpdateInventory(plan, value) {
  const snapshot = structuredClone(plan);
  verifyAzureCePlan(snapshot);
  const result = validateInventorySnapshot(snapshot, value, new Map());
  require10(same4(plan, snapshot), 'plan changed during inventory validation');
  return result;
}
function validateInventorySnapshot(plan, value, scopes) {
  const row = object9(value);
  require10(
    exactKeys(row, ['schemaVersion', 'engine', 'planSha256', 'collectedAt', 'nodes']) &&
      row.schemaVersion === 1 &&
      row.engine === plan.engine &&
      row.planSha256 === plan.planSha256 &&
      typeof row.collectedAt === 'string' &&
      Number.isFinite(Date.parse(row.collectedAt)) &&
      Date.parse(row.collectedAt) <= Date.now() + 60000,
    'inventory plan or schema differs',
  );
  const nodes = object9(row.nodes),
    expectedNodes = Array.from({ length: plan.topology.nodeCount }, (_, i) => String(i + 1));
  require10(exactKeys(nodes, expectedNodes), 'complete node inventory required');
  const usedIds = new Set(),
    usedMacs = new Set(),
    usedIps = new Set();
  for (const key of expectedNodes) {
    const node = object9(nodes[key]);
    let planned = scopes.get(key);
    if (!planned) {
      planned = actions(plan, Number(key), true);
      scopes.set(key, planned);
    }
    require10(
      exactKeys(node, ['resourceId', 'vmId', 'ownerPlanSha256', 'nics']) &&
        lower4(node.resourceId) === lower4(planned.vm.resourceId) &&
        node.ownerPlanSha256 === planned.vm.expectedOwnerPlanSha256 &&
        uuid(node.vmId) &&
        !usedIds.has(lower4(node.vmId)),
      'VM owner/UUID scope differs or duplicates',
    );
    usedIds.add(lower4(node.vmId));
    const nics = object9(node.nics);
    require10(
      exactKeys(
        nics,
        plan.nics.map((nic) => String(nic.index)),
      ),
      'complete ordered NIC inventory required',
    );
    for (const nic of plan.nics) {
      const state = object9(nics[String(nic.index)]),
        action = planned.nics.find((a) => lower4(a.resourceId).endsWith(`-nic${nic.index}`));
      const ipKey = `${lower4(state.subnetId)}:${state.privateIp}`;
      require10(
        exactKeys(state, [
          'resourceId',
          'ownerPlanSha256',
          'mac',
          'ipConfigurationId',
          'ipConfigurationName',
          'allocation',
          'privateIp',
          'subnetId',
          'subnetCidr',
          'targetSubnetId',
          'targetSubnetCidr',
        ]) &&
          lower4(state.resourceId) === lower4(action.resourceId) &&
          state.ownerPlanSha256 === action.expectedOwnerPlanSha256 &&
          mac(state.mac) &&
          !usedMacs.has(String(state.mac)) &&
          !usedIps.has(ipKey) &&
          typeof state.ipConfigurationName === 'string' &&
          /^[a-z0-9][a-z0-9_.-]{0,79}$/i.test(state.ipConfigurationName) &&
          lower4(state.ipConfigurationId) ===
            lower4(`${action.resourceId}/ipConfigurations/${state.ipConfigurationName}`) &&
          ['Dynamic', 'Static'].includes(String(state.allocation)) &&
          usableAzureNetworkAddress(state.privateIp, state.subnetCidr) &&
          lower4(state.targetSubnetId) === lower4(argument(action, '--subnet')),
        'NIC/IP configuration identity differs or duplicates',
      );
      require10(
        lower4(subnetVnet(state.subnetId, plan)) === lower4(subnetVnet(state.targetSubnetId, plan)) &&
          typeof state.targetSubnetCidr === 'string' &&
          (!nic.subnet.cidr || nic.subnet.cidr === state.targetSubnetCidr),
        'subnet/VNet target differs',
      );
      require10(
        usableSubnet(state.targetSubnetCidr) &&
          (state.allocation !== 'Static' || usableAzureNetworkAddress(state.privateIp, state.targetSubnetCidr)),
        'target address scope differs',
      );
      usedMacs.add(String(state.mac));
      usedIps.add(ipKey);
    }
  }
  return value;
}
function azureNetworkUpdateResolvedArguments(plan, action, value) {
  const inventory = validateAzureNetworkUpdateInventory(plan, value);
  const candidates = plan.actions.filter((row) => row.id === action.id);
  require10(
    candidates.length === 1 &&
      same4(candidates[0], action) &&
      action.kind === 'nic-update' &&
      Number.isInteger(action.node),
    'exact saved NIC update action required',
  );
  const node = inventory.nodes[String(action.node)];
  const state = Object.values(node.nics).find((nic) => lower4(nic.resourceId) === lower4(action.resourceId));
  require10(state, 'saved NIC action is unresolved');
  const args = [...(action.args ?? [])],
    nameIndex = args.indexOf('--name');
  require10(nameIndex >= 0 && args.lastIndexOf('--name') === nameIndex, 'one IP configuration name argument required');
  const index = Object.entries(node.nics).find(([, nic]) => nic === state)?.[0];
  require10(
    index !== undefined &&
      (args[nameIndex + 1] === state.ipConfigurationName ||
        args[nameIndex + 1] === azureNetworkIpConfigurationReference(action.node, Number(index))),
    'saved configuration name is not the observed identity or exact deferred reference',
  );
  args[nameIndex + 1] = state.ipConfigurationName;
  require10(
    args.every((arg) => !/^__.*__$/.test(arg)),
    'execution identifiers remain unresolved',
  );
  return args;
}
function verifyAzureNetworkUpdateProgress(plan, before, current, applied) {
  const request = plan;
  plan = structuredClone(plan);
  verifyAzureCePlan(plan);
  const scopes = new Map();
  validateInventorySnapshot(plan, before, scopes);
  validateInventorySnapshot(plan, current, scopes);
  require10(
    new Set(applied).size === applied.length &&
      applied.every((key) => /^\d+:\d+$/.test(key) && before.nodes[key.split(':')[0]]?.nics[key.split(':')[1]]),
    'applied NIC stage scope differs',
  );
  for (const [key, node] of Object.entries(before.nodes)) {
    const observed = current.nodes[key];
    require10(
      same4(
        { resourceId: node.resourceId, vmId: node.vmId, ownerPlanSha256: node.ownerPlanSha256 },
        { resourceId: observed.resourceId, vmId: observed.vmId, ownerPlanSha256: observed.ownerPlanSha256 },
      ),
      'VM identity changed during subnet update',
    );
    for (const [index, nic] of Object.entries(node.nics)) {
      const now = observed.nics[index];
      require10(
        [
          'resourceId',
          'ownerPlanSha256',
          'mac',
          'ipConfigurationId',
          'ipConfigurationName',
          'allocation',
          'targetSubnetId',
          'targetSubnetCidr',
        ].every((field) => lower4(nic[field]) === lower4(now[field])),
        'retained NIC/configuration identity changed',
      );
      const changed = applied.includes(`${key}:${index}`);
      require10(
        lower4(now.subnetId) === lower4(changed ? nic.targetSubnetId : nic.subnetId) &&
          now.subnetCidr === (changed ? nic.targetSubnetCidr : nic.subnetCidr) &&
          (nic.allocation !== 'Static' || now.privateIp === nic.privateIp),
        'NIC reached an unauthorized subnet/address stage',
      );
    }
  }
  require10(same4(request, plan), 'plan changed during progress validation');
}
function azureNetworkUpdateAppliedNics(plan, completed, current, pendingActionId) {
  validateAzureNetworkUpdateInventory(plan, current);
  require10(
    same4(
      completed,
      plan.actions.slice(0, completed.length).map((action) => action.id),
    ),
    'complete ordered public action prefix required',
  );
  const pending = pendingActionId === undefined ? undefined : plan.actions[completed.length];
  require10(
    pendingActionId === undefined || pending?.id === pendingActionId,
    'pending public action is outside the next boundary',
  );
  const selected = plan.actions.filter(
    (action) => action.kind === 'nic-update' && (completed.includes(action.id) || action.id === pendingActionId),
  );
  const applied = [];
  for (const action of selected) {
    const entries = Object.entries(current.nodes[String(action.node)].nics).filter(
      ([, nic]) => lower4(nic.resourceId) === lower4(action.resourceId),
    );
    require10(entries.length === 1, 'public action NIC is unresolved');
    const [index, nic] = entries[0];
    if (completed.includes(action.id) || lower4(nic.subnetId) === lower4(nic.targetSubnetId))
      applied.push(`${action.node}:${index}`);
  }
  return applied;
}
function validateAzureNativeNetworkUpdateCheckpoint(plan, value, completed, pendingActionId) {
  const row = object9(value);
  require10(
    plan.engine === 'native' && exactKeys(row, ['before', 'current', ...(row.source !== undefined ? ['source'] : [])]),
    'native network checkpoint schema differs',
  );
  if (row.source !== undefined) {
    const source = object9(row.source);
    require10(
      exactKeys(source, [
        'originalPlanSha256',
        'siteUid',
        'siteConfigurationSha256',
        'generationPlanSha256s',
        'networkHistoryPlanSha256s',
      ]) &&
        sha(source.originalPlanSha256) &&
        sha(source.siteConfigurationSha256) &&
        typeof source.siteUid === 'string' &&
        Boolean(source.siteUid.trim()) &&
        Array.isArray(source.generationPlanSha256s) &&
        source.generationPlanSha256s.every(sha) &&
        same4(source.generationPlanSha256s, [...new Set(source.generationPlanSha256s)].sort()) &&
        source.generationPlanSha256s.includes(source.originalPlanSha256) &&
        Array.isArray(source.networkHistoryPlanSha256s) &&
        source.networkHistoryPlanSha256s.every(sha) &&
        new Set(source.networkHistoryPlanSha256s).size === source.networkHistoryPlanSha256s.length &&
        !source.networkHistoryPlanSha256s.includes(plan.planSha256),
      'network source binding differs',
    );
  }
  const before = validateAzureNetworkUpdateInventory(plan, row.before),
    current = validateAzureNetworkUpdateInventory(plan, row.current);
  verifyAzureNetworkUpdateProgress(
    plan,
    before,
    current,
    azureNetworkUpdateAppliedNics(plan, completed, current, pendingActionId),
  );
  for (const action of plan.actions.filter((action) => action.kind === 'nic-update'))
    azureNetworkUpdateResolvedArguments(plan, action, before);
  return {
    before,
    current,
    ...(row.source !== undefined ? { source: row.source } : {}),
  };
}

// plugins/azure/src/ce/recovery.ts
var CHECKPOINT_STATES = new Set(['running', 'partial', 'complete']);
var QUOTA_BLOCKERS = new Set([
  'image-unavailable',
  'image-observation-failed',
  'vm-size-unavailable',
  'sku-restricted',
  'nic-limit',
  'ce-minimum-size',
  'no-compatible-vm-size',
  'quota-observation-failed',
  'quota',
  'policy-deny',
  'route-server-unavailable',
]);
var CHECKPOINT_KEYS = new Set([
  'authorization',
  'engine',
  'schemaVersion',
  'planId',
  'planSha256',
  'completedActionIds',
  'pendingAction',
  'networkUpdate',
  'failedActionId',
  'observationFingerprint',
  'observationSnapshot',
  'state',
]);
function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function hasOnlyKeys(value, keys) {
  return Object.keys(value).every((key) => keys.has(key));
}
function isStringRecord(value) {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}
function assertObservationShape(value) {
  if (!isRecord(value) || value.schemaVersion !== AZURE_CE_SCHEMA_VERSION) {
    throw new Error('Persisted Azure CE checkpoint has an invalid observation snapshot');
  }
  const subscription = value.subscription;
  const image = value.image;
  const research = value.research;
  if (
    !isRecord(subscription) ||
    !['id', 'tenantId', 'cloud'].every((key) => typeof subscription[key] === 'string') ||
    !isRecord(image) ||
    !['publisher', 'offer', 'plan', 'version', 'urn'].every((key) => typeof image[key] === 'string') ||
    typeof image.termsAccepted !== 'boolean' ||
    !Array.isArray(value.regions) ||
    !Array.isArray(value.resources) ||
    !isRecord(research) ||
    research.method !== 'azure-cli-live' ||
    research.officialSourceRetrieval !== 'live' ||
    typeof research.catalogRegion !== 'string' ||
    !Array.isArray(research.commands) ||
    !research.commands.every((entry) => typeof entry === 'string') ||
    !Array.isArray(research.officialSources) ||
    !research.officialSources.every((entry) => typeof entry === 'string') ||
    !Array.isArray(research.sourceReceipts) ||
    !research.sourceReceipts.every(
      (entry) =>
        isRecord(entry) && typeof entry.url === 'string' && /^[a-f0-9]{64}$/.test(String(entry.normalizedSha256)),
    ) ||
    !isRecord(research.sharedContract) ||
    typeof research.sharedContract.url !== 'string' ||
    typeof research.sharedContract.contractId !== 'string' ||
    typeof research.sharedContract.contractVersion !== 'string' ||
    !/^[a-f0-9]{64}$/.test(String(research.sharedContract.normalizedSha256))
  ) {
    throw new Error('Persisted Azure CE checkpoint has an invalid observation snapshot');
  }
  for (const region of value.regions) {
    if (
      !isRecord(region) ||
      typeof region.name !== 'string' ||
      typeof region.rank !== 'number' ||
      typeof region.eligible !== 'boolean' ||
      !Array.isArray(region.reasons) ||
      !region.reasons.every((entry) => typeof entry === 'string') ||
      !Array.isArray(region.zones) ||
      !region.zones.every((entry) => typeof entry === 'string') ||
      typeof region.routeServerSupported !== 'boolean' ||
      typeof region.quotaAvailable !== 'number' ||
      typeof region.policyAllowed !== 'boolean' ||
      (region.proximity !== undefined && typeof region.proximity !== 'number') ||
      !Array.isArray(region.vmSizes) ||
      !region.vmSizes.every(
        (size) =>
          isRecord(size) &&
          typeof size.name === 'string' &&
          typeof size.maxNics === 'number' &&
          typeof size.vCpus === 'number' &&
          typeof size.memoryGb === 'number' &&
          Array.isArray(size.zones) &&
          size.zones.every((entry) => typeof entry === 'string') &&
          typeof size.restricted === 'boolean',
      )
    ) {
      throw new Error('Persisted Azure CE checkpoint has an invalid observation snapshot');
    }
  }
  for (const resource of value.resources) {
    if (
      !isRecord(resource) ||
      typeof resource.id !== 'string' ||
      typeof resource.exists !== 'boolean' ||
      typeof resource.owned !== 'boolean' ||
      !isStringRecord(resource.tags) ||
      !isRecord(resource.state)
    ) {
      throw new Error('Persisted Azure CE checkpoint has an invalid observation snapshot');
    }
  }
}
function normalizeAzureDeploymentCapacity(plan, current) {
  if (plan.intent.operation !== 'deploy') return structuredClone(current);
  const normalized = structuredClone(current);
  const vmScope =
    `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${plan.deploymentName}-`.toLowerCase();
  const ownedVmNodes = new Set(
    normalized.resources.flatMap((resource) => {
      const resourceId = resource.id.toLowerCase();
      const suffix = resourceId.slice(vmScope.length);
      return resource.exists &&
        resource.owned &&
        resourceId.startsWith(vmScope) &&
        /^\d+$/.test(suffix) &&
        Number(suffix) >= 1 &&
        Number(suffix) <= plan.topology.nodeCount &&
        resource.tags['xcsh-managed-by'] === 'azure-ce' &&
        resource.tags['xcsh-deployment-id'] === plan.deploymentName &&
        resource.tags['xcsh-execution-engine'] === plan.engine &&
        resource.tags['xcsh-plan-sha256'] === plan.planSha256
        ? [Number(suffix)]
        : [];
    }),
  );
  const ownedVmCount = ownedVmNodes.size;
  const workloadVmId = `${vmScope}workload`;
  const ownedWorkloadVm = normalized.resources.some(
    (resource) =>
      plan.engine === 'terraform' &&
      Boolean(plan.intent.workloadFixture) &&
      resource.exists &&
      resource.owned &&
      resource.id.toLowerCase() === workloadVmId &&
      resource.tags['xcsh-managed-by'] === 'azure-ce' &&
      resource.tags['xcsh-deployment-id'] === plan.deploymentName &&
      resource.tags['xcsh-execution-engine'] === plan.engine &&
      resource.tags['xcsh-plan-sha256'] === plan.planSha256,
  );
  let ownedRelayVcpus = 0;
  if (plan.relayProfile) {
    const relayPlan = azureRelayPlanForDeployment(plan);
    const ownedRelayCount = relayPlan.relays.filter((relay) => {
      const matches = normalized.resources.filter((resource) => resource.id.toLowerCase() === relay.vmId.toLowerCase());
      return (
        matches.length === 1 &&
        matches[0].exists &&
        matches[0].owned &&
        matches[0].tags['xcsh-managed-by'] === 'azure-ce' &&
        matches[0].tags['xcsh-deployment-id'] === plan.deploymentName &&
        matches[0].tags['xcsh-execution-engine'] === plan.engine &&
        matches[0].tags['xcsh-plan-sha256'] === plan.planSha256 &&
        matches[0].tags['xcsh-relay-plan-sha256'] === relayPlan.planSha256
      );
    }).length;
    ownedRelayVcpus = ownedRelayCount * relayPlan.catalog.vmSizes[0].vCpus;
  }
  if (ownedVmCount > 0 || ownedWorkloadVm || ownedRelayVcpus > 0) {
    const region = normalized.regions.find((candidate) => candidate.name.toLowerCase() === plan.region.toLowerCase());
    const size = region?.vmSizes.find((candidate) => candidate.name.toLowerCase() === plan.vm.size.toLowerCase());
    if (region && size && Number.isFinite(size.vCpus) && size.vCpus > 0) {
      region.quotaAvailable +=
        ownedVmCount * size.vCpus + (ownedWorkloadVm ? AZURE_CE_WORKLOAD_FIXTURE_VCPUS : 0) + ownedRelayVcpus;
      if (region.quotaAvailable >= size.vCpus * plan.topology.nodeCount) {
        region.reasons = region.reasons.filter((reason) => reason !== 'quota');
        region.eligible = !region.reasons.some((reason) => QUOTA_BLOCKERS.has(reason));
      }
      normalized.regions.sort(
        (left, right) =>
          Number(right.eligible) - Number(left.eligible) ||
          (right.proximity ?? 0) - (left.proximity ?? 0) ||
          left.reasons.length - right.reasons.length ||
          left.name.localeCompare(right.name),
      );
      normalized.regions.forEach((candidate, index) => {
        candidate.rank = index + 1;
      });
    }
  }
  return normalized;
}
function fingerprintCurrentObservation(plan, current) {
  if (plan.intent.operation !== 'deploy') return fingerprintObservation(current, plan.intent.brownfield.resourceIds);
  return fingerprintDeploymentObservation(
    normalizeAzureDeploymentCapacity(plan, current),
    plan.intent.brownfield.resourceIds,
    plan.region,
    plan.vm.size,
  );
}
function fingerprintCheckpointObservation(observation) {
  const normalized = structuredClone(observation);
  normalized.subscription.id = normalized.subscription.id.toLowerCase();
  normalized.resources = normalized.resources
    .map((resource) => ({ ...resource, id: resource.id.toLowerCase() }))
    .sort((left, right) => left.id.localeCompare(right.id));
  normalized.regions = normalized.regions
    .map((region) => ({
      ...region,
      zones: [...region.zones].sort(),
      vmSizes: region.vmSizes
        .map((size) => ({ ...size, zones: [...size.zones].sort() }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return canonicalSha256(normalized);
}
function assertAuthorizationShape(value) {
  if (value === undefined) return;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, new Set(['apply', 'terms', 'destroy'])) ||
    typeof value.apply !== 'boolean' ||
    typeof value.terms !== 'boolean' ||
    typeof value.destroy !== 'boolean'
  ) {
    throw new Error('Persisted Azure CE checkpoint has invalid authorization');
  }
}
function assertCheckpointProgress(checkpoint, plan) {
  if (
    checkpoint.engine !== plan.engine ||
    checkpoint.planId !== plan.planId ||
    checkpoint.planSha256 !== plan.planSha256
  ) {
    throw new Error('Persisted Azure CE checkpoint identity or execution engine differs from the immutable plan');
  }
  if (
    !Array.isArray(checkpoint.completedActionIds) ||
    !checkpoint.completedActionIds.every((id) => typeof id === 'string') ||
    !CHECKPOINT_STATES.has(String(checkpoint.state))
  ) {
    throw new Error('Persisted Azure CE checkpoint progress is malformed');
  }
  const completedActionIds = checkpoint.completedActionIds;
  const unique = new Set(completedActionIds);
  const expected = plan.actions.slice(0, completedActionIds.length).map((action) => action.id);
  if (unique.size !== completedActionIds.length || JSON.stringify(completedActionIds) !== JSON.stringify(expected)) {
    throw new Error('Persisted checkpoint is not an ordered unique prefix of the immutable plan');
  }
  const failedActionId = checkpoint.failedActionId;
  const nextActionId = plan.actions[completedActionIds.length]?.id;
  if (
    (failedActionId !== undefined && typeof failedActionId !== 'string') ||
    (checkpoint.state === 'partial' && failedActionId !== nextActionId) ||
    (checkpoint.state !== 'partial' && failedActionId !== undefined) ||
    (checkpoint.state === 'complete' && completedActionIds.length !== plan.actions.length) ||
    (checkpoint.state !== 'complete' && completedActionIds.length === plan.actions.length)
  ) {
    throw new Error('Persisted Azure CE checkpoint state is inconsistent with its action prefix');
  }
  assertAuthorizationShape(checkpoint.authorization);
  if (checkpoint.pendingAction !== undefined) {
    if (checkpoint.state === 'complete')
      throw new Error('Completed Azure CE checkpoint cannot retain a pending mutation');
    if (plan.engine !== 'native') throw new Error('Terraform Azure CE checkpoint cannot retain a native mutation');
    validateAzureNativePendingAction(plan, completedActionIds, checkpoint.pendingAction);
  }
}
function validateAzureCeCheckpoint(value, plan) {
  if (!isRecord(value)) throw new Error('Persisted Azure CE checkpoint is malformed');
  const version = value.schemaVersion;
  if (version !== AZURE_CE_CHECKPOINT_SCHEMA_VERSION) {
    throw new Error('Persisted Azure CE checkpoint uses an unsupported schema version');
  }
  if (!hasOnlyKeys(value, CHECKPOINT_KEYS)) throw new Error('Persisted Azure CE checkpoint has unexpected fields');
  assertCheckpointProgress(value, plan);
  const fingerprint = value.observationFingerprint;
  if (fingerprint !== undefined && (typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint))) {
    throw new Error('Persisted Azure CE checkpoint has an invalid observation fingerprint');
  }
  const authorization = value.authorization;
  const executionStarted =
    value.completedActionIds.length > 0 || fingerprint !== undefined || value.state !== 'running';
  if (
    executionStarted &&
    (authorization?.apply !== true || (plan.intent.operation === 'teardown' && authorization.destroy !== true))
  ) {
    throw new Error('Persisted Azure CE checkpoint execution has invalid authorization');
  }
  const snapshot = value.observationSnapshot;
  const isEmptySeed =
    value.completedActionIds.length === 0 &&
    value.state === 'running' &&
    value.failedActionId === undefined &&
    fingerprint === undefined &&
    snapshot === undefined &&
    authorization?.apply === true &&
    (plan.intent.operation !== 'teardown' || authorization.destroy === true);
  if (!isEmptySeed) {
    if (typeof fingerprint !== 'string' || snapshot === undefined) {
      throw new Error('Persisted Azure CE checkpoint requires a bound observation snapshot and fingerprint');
    }
    assertObservationShape(snapshot);
    if (
      snapshot.subscription.id.toLowerCase() !== plan.subscription.id.toLowerCase() ||
      snapshot.subscription.tenantId.toLowerCase() !== plan.subscription.tenantId.toLowerCase() ||
      snapshot.subscription.cloud !== plan.subscription.cloud ||
      snapshot.image.publisher.toLowerCase() !== plan.image.publisher.toLowerCase() ||
      snapshot.image.offer.toLowerCase() !== plan.image.offer.toLowerCase() ||
      snapshot.image.plan.toLowerCase() !== plan.image.plan.toLowerCase() ||
      snapshot.image.version !== plan.image.version ||
      snapshot.image.urn.toLowerCase() !== plan.image.urn.toLowerCase()
    ) {
      throw new Error('Persisted Azure CE checkpoint observation identity differs from the immutable plan');
    }
    if (!safeHexEqual(fingerprint, fingerprintCheckpointObservation(snapshot))) {
      throw new Error('Persisted Azure CE checkpoint observation differs from its fingerprint');
    }
  }
  if (value.networkUpdate !== undefined)
    validateAzureNativeNetworkUpdateCheckpoint(
      plan,
      value.networkUpdate,
      value.completedActionIds,
      value.pendingAction?.actionId,
    );
  return value;
}
function normalizeDeleteResourceId(plan, resourceId) {
  if (resourceId.trim() !== resourceId || !resourceId.startsWith('/') || resourceId.endsWith('/')) {
    throw new Error('Azure deletion recovery action has a non-canonical resource ID');
  }
  const segments = resourceId.slice(1).split('/');
  if (segments.some((segment) => segment.length === 0)) {
    throw new Error('Azure deletion recovery action has a non-canonical resource ID');
  }
  const expectedGroup = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}`;
  const normalized = resourceId.toLowerCase();
  const normalizedGroup = expectedGroup.toLowerCase();
  if (normalized === normalizedGroup) return { id: normalized, resourceGroup: true };
  if (
    segments.length < 8 ||
    segments.length % 2 !== 0 ||
    segments[0].toLowerCase() !== 'subscriptions' ||
    segments[1].toLowerCase() !== plan.subscription.id.toLowerCase() ||
    segments[2].toLowerCase() !== 'resourcegroups' ||
    segments[3].toLowerCase() !== plan.intent.resourceGroup.toLowerCase() ||
    segments[4].toLowerCase() !== 'providers'
  ) {
    throw new Error('Azure deletion recovery target differs from the immutable subscription and resource-group scope');
  }
  return { id: normalized, resourceGroup: false };
}
function validateAzureDeletionTail(plan, completedActionIds) {
  const expectedPrefix = plan.actions.slice(0, completedActionIds.length).map((action) => action.id);
  if (
    new Set(completedActionIds).size !== completedActionIds.length ||
    JSON.stringify(completedActionIds) !== JSON.stringify(expectedPrefix)
  ) {
    throw new Error('Persisted checkpoint is not an ordered unique prefix of the immutable plan');
  }
  if (plan.intent.operation !== 'teardown') return [];
  const tail = plan.actions.slice(completedActionIds.length);
  if (tail.length === 0) return [];
  if (tail.some((action) => action.kind !== 'resource-delete')) {
    throw new Error('Azure deletion recovery requires an uninterrupted immutable resource-delete tail');
  }
  const ownership = new Map();
  for (const item of plan.ownershipInventory) {
    const normalized = item.resourceId.toLowerCase();
    if (ownership.has(normalized)) {
      throw new Error('Azure deletion recovery ownership inventory contains duplicate resource IDs');
    }
    ownership.set(normalized, item);
  }
  const seen = new Set();
  return tail.map((action) => {
    if (!action.resourceId) throw new Error('Azure deletion recovery action has no canonical resource ID');
    const normalized = normalizeDeleteResourceId(plan, action.resourceId);
    if (seen.has(normalized.id)) throw new Error('Azure deletion recovery tail contains duplicate resource IDs');
    seen.add(normalized.id);
    const owner = ownership.get(normalized.id);
    if (owner?.action !== 'delete' || owner.owned !== true) {
      throw new Error('Azure deletion recovery target differs from the immutable ownership inventory');
    }
    return {
      actionId: action.id,
      resourceId: action.resourceId,
      normalizedResourceId: normalized.id,
      resourceGroup: normalized.resourceGroup,
    };
  });
}
function azureErrorCode(stdout, stderr) {
  for (const raw of [stderr, stdout]) {
    try {
      const parsed = JSON.parse(raw);
      if (isRecord(parsed) && typeof parsed.code === 'string') return parsed.code;
      if (isRecord(parsed) && isRecord(parsed.error) && typeof parsed.error.code === 'string') return parsed.error.code;
    } catch {}
  }
  const text = stderr.trim();
  const leading = /^(?:ERROR:\s*)?\(([A-Za-z][A-Za-z0-9]+)\)/.exec(text)?.[1];
  if (leading) return leading;
  return /^Code:\s*([A-Za-z][A-Za-z0-9]+)\s*$/m.exec(text)?.[1];
}
async function collectAzureAbsentDeletionTail(plan, completedActionIds, api, signal) {
  const absent = [];
  const targets = validateAzureDeletionTail(plan, completedActionIds);
  for (const target of targets) {
    const result = await api.exec(
      'az',
      target.resourceGroup
        ? [
            'group',
            'exists',
            '--name',
            plan.intent.resourceGroup,
            '--subscription',
            plan.subscription.id,
            '--output',
            'json',
          ]
        : ['resource', 'show', '--ids', target.resourceId, '--subscription', plan.subscription.id, '--output', 'json'],
      signal ? { signal } : undefined,
    );
    if (target.resourceGroup) {
      if (result.exitCode !== 0) throw new Error('Azure deletion recovery group evidence is unavailable');
      let exists;
      try {
        exists = JSON.parse(result.stdout);
      } catch {
        throw new Error('Malformed Azure deletion recovery group evidence');
      }
      if (exists === false) absent.push(target.resourceId);
      else if (exists !== true) throw new Error('Malformed Azure deletion recovery group evidence');
      if (exists === true) break;
      continue;
    }
    if (result.exitCode === 0) {
      let resource;
      try {
        resource = JSON.parse(result.stdout);
      } catch {
        throw new Error('Malformed Azure deletion recovery resource evidence');
      }
      if (!isRecord(resource) || typeof resource.id !== 'string') {
        throw new Error('Malformed Azure deletion recovery resource evidence');
      }
      if (resource.id.toLowerCase() !== target.normalizedResourceId) {
        throw new Error('Azure deletion recovery returned a different resource identity');
      }
      break;
    }
    const code = azureErrorCode(result.stdout, result.stderr);
    if (code !== 'ResourceNotFound' && code !== 'ResourceGroupNotFound') {
      throw new Error('Azure deletion recovery resource evidence is unavailable');
    }
    absent.push(target.resourceId);
  }
  return absent;
}
function stableDeletionObservation(plan, observation, recoveredResourceIds) {
  const allResources = observation.resources.map((resource) => ({ ...resource, id: resource.id.toLowerCase() }));
  if (new Set(allResources.map((resource) => resource.id)).size !== allResources.length) {
    throw new Error('Azure deletion recovery observation contains duplicate resource IDs');
  }
  const resources = allResources
    .filter((resource) => {
      const id = resource.id;
      return ![...recoveredResourceIds].some((recovered) => id === recovered || id.startsWith(`${recovered}/`));
    })
    .map((resource) => {
      const ancestor = [...recoveredResourceIds].some((recovered) => recovered.startsWith(`${resource.id}/`));
      if (!ancestor) return resource;
      const { etag: _etag, state, ...stable } = resource;
      const { provisioningState: _provisioningState, ...stableState } = state;
      return { ...stable, state: stableState };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  return canonicalSha256({
    schemaVersion: observation.schemaVersion,
    subscription: observation.subscription,
    image: observation.image,
    research: observation.research,
    regions: observation.regions
      .map(({ eligible: _eligible, quotaAvailable: _quota, rank: _rank, reasons: _reasons, ...stable }) => stable)
      .sort((left, right) => left.name.localeCompare(right.name)),
    resources,
    brownfieldResourceIds: [...plan.intent.brownfield.resourceIds].map((id) => id.toLowerCase()).sort(),
  });
}
function reconcileAzureNativeDeletionPrefix(plan, completedActionIds, previous, current, absentResourceIds) {
  if (plan.intent.operation !== 'teardown') return completedActionIds;
  const targets = validateAzureDeletionTail(plan, completedActionIds);
  const absent = [...absentResourceIds].map((id) => normalizeDeleteResourceId(plan, id).id);
  if (new Set(absent).size !== absent.length) {
    throw new Error('Azure deletion recovery evidence contains duplicate resource IDs');
  }
  const targetIds = new Set(targets.map((target) => target.normalizedResourceId));
  if (absent.some((id) => !targetIds.has(id))) {
    throw new Error('Azure deletion recovery evidence is outside the immutable delete tail');
  }
  let recoveredCount = 0;
  while (recoveredCount < targets.length && absent.includes(targets[recoveredCount].normalizedResourceId)) {
    recoveredCount++;
  }
  if (absent.slice(recoveredCount).length > 0) {
    throw new Error('Azure deletion recovery evidence is out of action order');
  }
  const recoveredTargets = targets.slice(0, recoveredCount);
  const recoveredResourceIds = new Set(recoveredTargets.map((target) => target.normalizedResourceId));
  const previousIds = new Set(previous.resources.map((resource) => resource.id.toLowerCase()));
  if (current.resources.some((resource) => !previousIds.has(resource.id.toLowerCase()))) {
    throw new Error('Azure deletion recovery observation contains an unexpected resource');
  }
  if (
    stableDeletionObservation(plan, previous, recoveredResourceIds) !==
    stableDeletionObservation(plan, current, recoveredResourceIds)
  ) {
    throw new Error('Azure deletion recovery observation changed outside the immutable delete tail');
  }
  if (recoveredCount === 0) return completedActionIds;
  return [...completedActionIds, ...recoveredTargets.map((target) => target.actionId)];
}

// plugins/azure/src/ce/native-network-checkpoint-history.ts
function require11(condition, message) {
  if (!condition) throw Error(`Azure native network checkpoint history: ${message}`);
}
var same5 = canonicalEqual;
var object10 = (value) => {
  require11(value && typeof value === 'object' && !Array.isArray(value), 'malformed checkpoint record');
  return value;
};
var boundaryIds = (checkpoint) =>
  new Set([
    ...checkpoint.completedActionIds,
    ...(checkpoint.failedActionId ? [checkpoint.failedActionId] : []),
    ...(checkpoint.pendingAction ? [checkpoint.pendingAction.actionId] : []),
  ]);
var azureNativeNetworkCheckpointHistoryName = (row) =>
  `native-network-checkpoint-${row.sourcePlanSha256}-${canonicalSha256(row).slice(0, 24)}.json`;
var isAzureNativeNetworkCheckpointHistory = (name) =>
  /^native-network-checkpoint-[a-f0-9]{64}-[a-f0-9]{24}\.json$/.test(name);
function validateAzureNativeNetworkCheckpointHistory(plan, value) {
  verifyAzureCePlan(plan);
  const profile = verifyAzureNativeNetworkProfile(plan),
    row = object10(value);
  require11(
    Object.keys(row).sort().join(',') ===
      'actionReceiptSha256ById,checkpoint,checkpointSha256,engine,kind,owner,schemaVersion,sourcePlanSha256' &&
      row.schemaVersion === 1 &&
      row.kind === 'azure-native-network-public-checkpoint' &&
      row.engine === 'native' &&
      row.sourcePlanSha256 === plan.planSha256 &&
      same5(row.owner, azureUpgradeBinding(plan).owner) &&
      typeof row.checkpointSha256 === 'string' &&
      row.checkpointSha256 === canonicalSha256(row.checkpoint),
    'public checkpoint owner, schema or digest differs',
  );
  const checkpoint = validateAzureCeCheckpoint(row.checkpoint, plan);
  require11(
    checkpoint.networkUpdate?.source?.originalPlanSha256 === profile.originalPlanSha256 &&
      (profile.retainedPlanSha256 === profile.originalPlanSha256
        ? checkpoint.networkUpdate.source.networkHistoryPlanSha256s.length === 0
        : checkpoint.networkUpdate.source.networkHistoryPlanSha256s.at(-1) === profile.retainedPlanSha256),
    'complete original and retained source provenance required',
  );
  const receipts = object10(row.actionReceiptSha256ById),
    ids = boundaryIds(checkpoint);
  require11(
    Object.entries(receipts).every(
      ([id, digest]) => ids.has(id) && typeof digest === 'string' && /^[a-f0-9]{64}$/.test(digest),
    ),
    'action receipt is outside the saved public boundary',
  );
  return value;
}
async function persistAzureNativeNetworkCheckpointHistory(plan, checkpoint, store) {
  await store.verify();
  require11(
    same5(store.owner, azureUpgradeBinding(plan).owner) &&
      same5(await store.read(`native-source-${plan.planSha256}.json`), plan),
    'owning saved source differs',
  );
  const receipts = {};
  for (const id of boundaryIds(checkpoint)) {
    let value;
    try {
      value = await store.read(`native-action-${plan.planSha256}-${id}.json`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (value === undefined) continue;
    const row = object10(value),
      action = plan.actions.find((item) => item.id === id);
    require11(
      action &&
        Object.keys(row).sort().join(',') ===
          'actionId,actionSha256,engine,evidence,owner,schemaVersion,sourcePlanSha256' &&
        row.schemaVersion === 1 &&
        row.engine === 'native' &&
        same5(row.owner, store.owner) &&
        row.sourcePlanSha256 === plan.planSha256 &&
        row.actionId === id &&
        row.actionSha256 === canonicalSha256(action),
      'staged action receipt identity differs',
    );
    receipts[id] = canonicalSha256(value);
  }
  const row = {
    schemaVersion: 1,
    kind: 'azure-native-network-public-checkpoint',
    engine: 'native',
    owner: store.owner,
    sourcePlanSha256: plan.planSha256,
    checkpoint: structuredClone(checkpoint),
    checkpointSha256: canonicalSha256(checkpoint),
    actionReceiptSha256ById: receipts,
  };
  validateAzureNativeNetworkCheckpointHistory(plan, row);
  const name = azureNativeNetworkCheckpointHistoryName(row);
  let saved;
  try {
    saved = await store.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  require11(saved === undefined || same5(saved, row), 'immutable public checkpoint record changed');
  if (saved === undefined) await store.write(name, row);
}

// plugins/azure/src/ce/native-registered-configuration.ts
var require12 = (condition, message) => {
  if (!condition) throw Error(`Azure native registered configuration: ${message}`);
};
var object11 = (value) => {
  require12(value && typeof value === 'object' && !Array.isArray(value), 'malformed provenance record');
  return value;
};
var same6 = canonicalEqual;
var lower5 = (value) => (typeof value === 'string' ? value.toLowerCase() : '');
async function readAzureNativeFinalConfiguration(source, inventory, store) {
  const action = source.actions.filter((row) => row.kind === 'health-gate').at(-1);
  require12(
    action && (source.intent.operation === 'replace-node' || action.node === source.topology.nodeCount),
    'complete final health action is unavailable',
  );
  const row = object11(await store.read(`native-action-${source.planSha256}-${action?.id}.json`));
  const binding = azureUpgradeBinding(source);
  require12(
    row.schemaVersion === 1 &&
      row.engine === 'native' &&
      same6(row.owner, binding.owner) &&
      row.sourcePlanSha256 === source.planSha256 &&
      row.actionId === action?.id &&
      row.actionSha256 === canonicalSha256(action),
    'final public health envelope differs',
  );
  const evidence = object11(row.evidence),
    configuration = object11(evidence.configuration),
    registrations = object11(evidence.registrations);
  require12(
    evidence.planId === source.planId &&
      evidence.planSha256 === source.planSha256 &&
      evidence.engine === 'native' &&
      evidence.subscriptionId === source.subscription.id &&
      evidence.siteName === source.siteName &&
      evidence.status === 'healthy' &&
      object11(evidence.health).status === 'healthy' &&
      evidence.scope === 'site-global-and-registration-only' &&
      configuration.status === 'configured' &&
      registrations.status === 'healthy' &&
      same6(configuration.owner, binding.owner) &&
      same6(registrations.owner, binding.owner) &&
      configuration.siteName === source.siteName &&
      registrations.siteName === source.siteName &&
      typeof evidence.siteUid === 'string' &&
      Boolean(evidence.siteUid.trim()) &&
      configuration.siteUid === evidence.siteUid &&
      typeof configuration.contractFingerprint === 'string' &&
      /^sha256:[a-f0-9]{64}$/.test(configuration.contractFingerprint) &&
      registrations.contractFingerprint === configuration.contractFingerprint &&
      evidence.siteConfigurationSha256 === canonicalSha256(object11(evidence.siteConfiguration)),
    'original registered configuration or logical-site binding differs',
  );
  require12(
    Array.isArray(registrations.nodes) &&
      registrations.nodes.length === binding.nodes.length &&
      Array.isArray(configuration.interfaces) &&
      configuration.interfaces.length === binding.nodes.length * source.nics.length,
    'complete historical node/interface joins required',
  );
  const instances = {},
    used = new Set(),
    devices = new Set();
  for (const [index, node] of binding.nodes.entries()) {
    const rows = registrations.nodes.map(object11).filter((row) => row.node === node);
    require12(
      rows.length === 1 &&
        rows[0].status === 'healthy' &&
        rows[0].state === 'ONLINE' &&
        typeof rows[0].registration === 'string' &&
        /^r-[a-z0-9-]+$/.test(rows[0].registration) &&
        typeof rows[0].instanceId === 'string' &&
        /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(rows[0].instanceId) &&
        !used.has(lower5(rows[0].instanceId)),
      'historical registration UUID is missing or duplicate',
    );
    instances[node] = String(rows[0].instanceId);
    used.add(lower5(rows[0].instanceId));
    for (const nic of source.nics) {
      const expected = inventory.nodes[String(index + 1)].nics[String(nic.index)];
      const matches = configuration.interfaces
        .map(object11)
        .filter((iface) => iface.node === node && iface.role === nic.role && lower5(iface.mac) === expected.mac);
      require12(
        matches.length === 1 &&
          typeof matches[0].device === 'string' &&
          /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/.test(matches[0].device) &&
          !devices.has(`${node}:${matches[0].device}`),
        'original MAC/role/device join differs',
      );
      devices.add(`${node}:${matches[0].device}`);
    }
  }
  return {
    instances,
    receiptSha256: canonicalSha256(row),
    siteUid: evidence.siteUid,
    siteConfigurationSha256: evidence.siteConfigurationSha256,
    contractFingerprint: configuration.contractFingerprint,
  };
}

// plugins/azure/src/ce/native-network-history.ts
function require13(condition, message) {
  if (!condition) throw Error(`Azure native network history: ${message}`);
}
var object12 = (value) => {
  require13(value && typeof value === 'object' && !Array.isArray(value), 'malformed history record');
  return value;
};
var same7 = canonicalEqual;
var azureNativeNetworkHistoryName = (plan) => `native-network-history-${plan.planSha256}.json`;
var isAzureNativeNetworkHistory = (name) => /^native-network-history-[a-f0-9]{64}\.json$/.test(name);
function validateAzureNativeNetworkHistory(plan, value) {
  verifyAzureCePlan(plan);
  const profile = verifyAzureNativeNetworkProfile(plan),
    row = object12(value);
  require13(
    Object.keys(row).sort().join(',') ===
      'engine,finalConfigurationSha256,kind,networkUpdate,owner,schemaVersion,sourcePlanSha256' &&
      row.schemaVersion === 1 &&
      row.kind === 'azure-native-network-history' &&
      row.engine === 'native' &&
      row.sourcePlanSha256 === plan.planSha256 &&
      same7(row.owner, azureUpgradeBinding(plan).owner) &&
      typeof row.finalConfigurationSha256 === 'string' &&
      /^[a-f0-9]{64}$/.test(row.finalConfigurationSha256),
    'owned source or receipt schema differs',
  );
  const network = validateAzureNativeNetworkUpdateCheckpoint(
    plan,
    row.networkUpdate,
    plan.actions.map((a) => a.id),
  );
  require13(
    network.source &&
      network.source.originalPlanSha256 === profile.originalPlanSha256 &&
      (profile.retainedPlanSha256 === profile.originalPlanSha256
        ? network.source.networkHistoryPlanSha256s.length === 0
        : network.source.networkHistoryPlanSha256s.at(-1) === profile.retainedPlanSha256),
    'completed network predecessor differs',
  );
  return value;
}
async function persistAzureNativeNetworkHistory(plan, checkpoint, store) {
  await store.verify();
  verifyAzureNativeNetworkProfile(plan);
  require13(
    checkpoint.engine === 'native' &&
      checkpoint.planId === plan.planId &&
      checkpoint.planSha256 === plan.planSha256 &&
      checkpoint.state === 'complete' &&
      !checkpoint.pendingAction &&
      same7(
        checkpoint.completedActionIds,
        plan.actions.map((a) => a.id),
      ) &&
      checkpoint.networkUpdate?.source,
    'complete owning public execution required',
  );
  const network = validateAzureNativeNetworkUpdateCheckpoint(
    plan,
    checkpoint.networkUpdate,
    checkpoint.completedActionIds,
  );
  const configuration = await readAzureNativeFinalConfiguration(plan, network.current, store);
  require13(
    configuration.siteUid === network.source?.siteUid &&
      configuration.siteConfigurationSha256 === network.source?.siteConfigurationSha256 &&
      Object.entries(configuration.instances).every(
        ([node, id]) =>
          id.toLowerCase() ===
          network.current.nodes[String(azureUpgradeBinding(plan).nodes.indexOf(node) + 1)].vmId.toLowerCase(),
      ),
    'final site or registered UUID binding differs',
  );
  const row = {
    schemaVersion: 1,
    kind: 'azure-native-network-history',
    engine: 'native',
    owner: azureUpgradeBinding(plan).owner,
    sourcePlanSha256: plan.planSha256,
    networkUpdate: structuredClone(network),
    finalConfigurationSha256: configuration.receiptSha256,
  };
  validateAzureNativeNetworkHistory(plan, row);
  let saved;
  try {
    saved = await store.read(azureNativeNetworkHistoryName(plan));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  require13(saved === undefined || same7(saved, row), 'immutable completed history changed');
  if (saved === undefined) await store.write(azureNativeNetworkHistoryName(plan), row);
}
function verifyAzureNativeNetworkHistoryBoundary(previous, next) {
  require13(
    same7(Object.keys(previous.nodes).sort(), Object.keys(next.nodes).sort()),
    'complete predecessor node boundary required',
  );
  for (const [node, state] of Object.entries(previous.nodes)) {
    const current = next.nodes[node];
    require13(
      same7(
        { id: state.resourceId, uuid: state.vmId.toLowerCase(), owner: state.ownerPlanSha256 },
        { id: current.resourceId, uuid: current.vmId.toLowerCase(), owner: current.ownerPlanSha256 },
      ) && same7(Object.keys(state.nics).sort(), Object.keys(current.nics).sort()),
      'predecessor VM generation boundary differs',
    );
    for (const [index, nic] of Object.entries(state.nics)) {
      const observed = current.nics[index];
      require13(
        [
          'resourceId',
          'ownerPlanSha256',
          'mac',
          'ipConfigurationId',
          'ipConfigurationName',
          'allocation',
          'subnetId',
          'subnetCidr',
        ].every((key) => String(nic[key]).toLowerCase() === String(observed[key]).toLowerCase()) &&
          (nic.allocation !== 'Static' || nic.privateIp === observed.privateIp),
        'predecessor NIC/configuration/subnet boundary differs',
      );
    }
  }
}
async function qualifyAzureNativeNetworkHistories(plan, before, original, store, load, originalSite) {
  await store.verify();
  const profile = verifyAzureNativeNetworkProfile(plan);
  require13(profile.originalPlanSha256 === original.planSha256, 'original creation identity differs');
  const chain = [],
    visited = new Set([plan.planSha256]);
  let digest = profile.retainedPlanSha256;
  while (digest !== original.planSha256) {
    require13(!visited.has(digest), 'cyclic network history');
    visited.add(digest);
    const source = await store.read(`native-source-${digest}.json`);
    verifyAzureCePlan(source);
    require13(
      source.planSha256 === digest &&
        same7(azureUpgradeBinding(source), azureUpgradeBinding(original)) &&
        same7(azureNativeNetworkScope(source, true), azureNativeNetworkScope(original, true)),
      'network source scope differs',
    );
    const preceding = verifyAzureNativeNetworkProfile(source);
    require13(preceding.originalPlanSha256 === original.planSha256, 'network source has a foreign original');
    const history = validateAzureNativeNetworkHistory(source, await store.read(azureNativeNetworkHistoryName(source)));
    require13(
      history.networkUpdate.source?.siteUid === originalSite.siteUid &&
        history.networkUpdate.source?.siteConfigurationSha256 === originalSite.siteConfigurationSha256,
      'original logical-site binding differs across network histories',
    );
    const publicCheckpoint = await load(source);
    require13(
      publicCheckpoint?.state === 'complete' &&
        !publicCheckpoint.pendingAction &&
        same7(
          publicCheckpoint.completedActionIds,
          source.actions.map((a) => a.id),
        ) &&
        same7(publicCheckpoint.networkUpdate, history.networkUpdate),
      'prior network public execution is incomplete or differs',
    );
    const final = await readAzureNativeFinalConfiguration(source, history.networkUpdate.current, store);
    require13(
      final.receiptSha256 === history.finalConfigurationSha256 &&
        final.siteUid === history.networkUpdate.source?.siteUid &&
        final.siteConfigurationSha256 === history.networkUpdate.source?.siteConfigurationSha256,
      'prior network final configuration receipt changed',
    );
    chain.unshift({ source, history });
    digest = preceding.retainedPlanSha256;
  }
  const digests = [];
  for (const [index, entry] of chain.entries()) {
    require13(
      same7(entry.history.networkUpdate.source?.networkHistoryPlanSha256s, digests),
      'ordered predecessor lineage differs',
    );
    if (index > 0) {
      const preceding = chain[index - 1],
        binding = verifyAzureNativeNetworkProfile(entry.source);
      const expected =
        binding.schemaVersion === 2
          ? (
              await qualifyAzureNativeNetworkGenerationBoundary(
                preceding.source,
                preceding.history.networkUpdate.current,
                binding.retainedReplacementPlanSha256,
                store,
                load,
              )
            ).inventory
          : preceding.history.networkUpdate.current;
      verifyAzureNativeNetworkHistoryBoundary(expected, entry.history.networkUpdate.before);
    }
    digests.push(entry.source.planSha256);
  }
  const latest = chain.at(-1);
  if (latest) {
    const expected =
      profile.schemaVersion === 2
        ? (
            await qualifyAzureNativeNetworkGenerationBoundary(
              latest.source,
              latest.history.networkUpdate.current,
              profile.retainedReplacementPlanSha256,
              store,
              load,
            )
          ).inventory
        : latest.history.networkUpdate.current;
    verifyAzureNativeNetworkHistoryBoundary(expected, before);
  }
  return { planSha256s: digests, originalBoundary: chain[0]?.history.networkUpdate.before ?? before };
}
async function verifyAzureNativeNetworkHistoricalBefore(base, plan, siteUid, network, sources, store) {
  const profile = verifyAzureNativeNetworkProfile(plan),
    origin = network.source;
  require13(
    profile.originalPlanSha256 === base.planSha256 &&
      same7(azureUpgradeBinding(plan), azureUpgradeBinding(base)) &&
      same7(azureNativeNetworkScope(plan, true), azureNativeNetworkScope(base, true)),
    'network source scope differs',
  );
  require13(origin && origin.siteUid === siteUid, 'historical original source or logical site is missing');
  const birth = await readAzureNativeFinalConfiguration(base, network.before, store),
    reservation = object12(await store.read('native-site.json'));
  require13(
    birth.siteUid === siteUid &&
      birth.siteConfigurationSha256 === origin.siteConfigurationSha256 &&
      reservation.uid === siteUid &&
      reservation.siteName === base.siteName &&
      same7(reservation.owner, azureUpgradeBinding(base).owner) &&
      reservation.contractFingerprint === birth.contractFingerprint,
    'original configuration or reservation differs',
  );
  const generations = new Set();
  const visit = async (digest, node, uuid, path) => {
    require13(!path.has(digest), 'cyclic historical VM generation');
    generations.add(digest);
    if (digest === base.planSha256) {
      require13(birth.instances[node]?.toLowerCase() === uuid.toLowerCase(), 'original VM UUID differs');
      return;
    }
    const generation = sources.get(digest);
    require13(
      generation?.intent.operation === 'replace-node' &&
        generation.intent.replacementNode === azureUpgradeBinding(base).nodes.indexOf(node) + 1,
      'retained VM generation source is unresolved',
    );
    const record = object12(await store.read(`native-replacement-history-${digest}.json`));
    const replacement = object12(record.replacement);
    require13(
      replacement.status === 'registered' &&
        replacement.siteUid === siteUid &&
        replacement.siteConfigurationSha256 === origin.siteConfigurationSha256 &&
        same7(replacement.originalSourcePlan, base) &&
        String(replacement.newVmId).toLowerCase() === uuid.toLowerCase(),
      'retained VM generation was not registered',
    );
    const health = await readAzureNativeFinalConfiguration(generation, network.before, store);
    require13(
      health.siteUid === siteUid &&
        health.siteConfigurationSha256 === origin.siteConfigurationSha256 &&
        health.instances[node]?.toLowerCase() === uuid.toLowerCase(),
      'registered generation configuration differs',
    );
    const owners = object12(replacement.ownerPlanSha256ByNode),
      old = object12(replacement.oldVmIds);
    for (const survivor of azureUpgradeBinding(base).nodes) {
      if (survivor !== node)
        require13(
          health.instances[survivor]?.toLowerCase() === String(old[survivor]).toLowerCase(),
          'historical generation survivor UUID differs',
        );
      await visit(String(owners[survivor]), survivor, String(old[survivor]), new Set([...path, digest]));
    }
  };
  for (const [index, node] of azureUpgradeBinding(base).nodes.entries()) {
    const before = network.before.nodes[String(index + 1)];
    await visit(before.ownerPlanSha256, node, before.vmId, new Set());
  }
  require13(same7([...generations].sort(), origin.generationPlanSha256s), 'complete VM generation lineage differs');
}
async function verifyAzureNativeNetworkHistoryRecords(base, siteUid, records) {
  const sources = new Map([[base.planSha256, base]]);
  for (const [name, value] of records)
    if (name.startsWith('native-source-')) {
      const source = value;
      verifyAzureCePlan(source);
      require13(name === `native-source-${source.planSha256}.json`, 'source filename differs');
      sources.set(source.planSha256, source);
    }
  const store = {
    async read(name) {
      require13(records.has(name), `required historical record is missing: ${name}`);
      return records.get(name);
    },
  };
  const histories = new Map();
  for (const [name, value] of records)
    if (isAzureNativeNetworkHistory(name)) {
      const source = sources.get(String(object12(value).sourcePlanSha256));
      require13(source && name === azureNativeNetworkHistoryName(source), 'history source is unresolved');
      const plan = source,
        profile = verifyAzureNativeNetworkProfile(plan);
      require13(
        profile.originalPlanSha256 === base.planSha256 &&
          same7(azureUpgradeBinding(plan), azureUpgradeBinding(base)) &&
          same7(azureNativeNetworkScope(plan, true), azureNativeNetworkScope(base, true)),
        'network source scope differs',
      );
      const history = validateAzureNativeNetworkHistory(plan, value),
        origin = history.networkUpdate.source;
      require13(origin, 'completed original source is missing');
      require13(origin.siteUid === siteUid, 'network original logical site differs');
      const birth = await readAzureNativeFinalConfiguration(base, history.networkUpdate.before, store);
      const final = await readAzureNativeFinalConfiguration(plan, history.networkUpdate.current, store);
      const reservation = object12(await store.read('native-site.json'));
      require13(
        birth.siteUid === siteUid &&
          birth.siteConfigurationSha256 === origin.siteConfigurationSha256 &&
          reservation.uid === siteUid &&
          reservation.siteName === base.siteName &&
          same7(reservation.owner, azureUpgradeBinding(base).owner) &&
          reservation.contractFingerprint === birth.contractFingerprint &&
          final.receiptSha256 === history.finalConfigurationSha256 &&
          final.siteUid === siteUid &&
          final.siteConfigurationSha256 === origin.siteConfigurationSha256,
        'final or original configuration receipt differs',
      );
      await verifyAzureNativeNetworkHistoricalBefore(base, plan, siteUid, history.networkUpdate, sources, store);
      for (const [index, node] of azureUpgradeBinding(base).nodes.entries())
        require13(
          final.instances[node]?.toLowerCase() ===
            history.networkUpdate.current.nodes[String(index + 1)].vmId.toLowerCase(),
          'final registered VM UUID differs',
        );
      histories.set(plan.planSha256, history);
    }
  const checkpoints = new Map();
  for (const [name, value] of records)
    if (isAzureNativeNetworkCheckpointHistory(name)) {
      const source = sources.get(String(object12(value).sourcePlanSha256));
      require13(source, 'public checkpoint source is unresolved');
      const row = validateAzureNativeNetworkCheckpointHistory(source, value);
      require13(name === azureNativeNetworkCheckpointHistoryName(row), 'public checkpoint filename differs');
      await verifyAzureNativeNetworkHistoricalBefore(
        base,
        source,
        siteUid,
        row.checkpoint.networkUpdate,
        sources,
        store,
      );
      const prior = checkpoints.get(source.planSha256) ?? [];
      require13(
        prior.every((before) => same7(before.checkpoint.networkUpdate?.before, row.checkpoint.networkUpdate?.before)),
        'original public network inventory changed between checkpoints',
      );
      checkpoints.set(source.planSha256, [...prior, row]);
    }
  const visit = async (digest, path) => {
    require13(!path.has(digest), 'cyclic network history');
    const history = histories.get(digest),
      plan = sources.get(digest);
    require13(history && plan, 'completed network predecessor is missing');
    const profile = verifyAzureNativeNetworkProfile(plan);
    let predecessors = [];
    if (profile.retainedPlanSha256 !== base.planSha256) {
      predecessors = await visit(profile.retainedPlanSha256, new Set([...path, digest]));
      const predecessor = histories.get(profile.retainedPlanSha256);
      require13(predecessor, 'completed predecessor history is missing');
      const predecessorPlan = sources.get(profile.retainedPlanSha256);
      const expected =
        profile.schemaVersion === 2
          ? (
              await qualifyAzureNativeNetworkGenerationBoundary(
                predecessorPlan,
                predecessor.networkUpdate.current,
                profile.retainedReplacementPlanSha256,
                store,
              )
            ).inventory
          : predecessor.networkUpdate.current;
      verifyAzureNativeNetworkHistoryBoundary(expected, history.networkUpdate.before);
    } else
      for (const node of Object.values(history.networkUpdate.before.nodes))
        for (const nic of base.nics) {
          const observed = node.nics[String(nic.index)],
            subnet =
              nic.subnet.resourceId ??
              `/subscriptions/${base.subscription.id}/resourceGroups/${base.intent.resourceGroup}/providers/Microsoft.Network/virtualNetworks/${base.deploymentName}-vnet/subnets/${nic.subnet.name}`;
          require13(
            observed.ownerPlanSha256 === base.planSha256 &&
              observed.subnetId.toLowerCase() === subnet.toLowerCase() &&
              (!nic.subnet.cidr || observed.subnetCidr === nic.subnet.cidr),
            'original NIC/subnet boundary differs',
          );
        }
    require13(
      same7(history.networkUpdate.source?.networkHistoryPlanSha256s, predecessors),
      'ordered network predecessor lineage differs',
    );
    return [...predecessors, digest];
  };
  for (const digest of histories.keys()) await visit(digest, new Set());
  for (const [digest, rows] of checkpoints) {
    const source = sources.get(digest),
      profile = verifyAzureNativeNetworkProfile(source);
    for (const row of rows) {
      const network = row.checkpoint.networkUpdate;
      let predecessors = [];
      if (profile.retainedPlanSha256 !== base.planSha256) {
        predecessors = await visit(profile.retainedPlanSha256, new Set([digest]));
        const predecessor = histories.get(profile.retainedPlanSha256);
        require13(predecessor, 'public checkpoint completed predecessor is missing');
        const predecessorPlan = sources.get(profile.retainedPlanSha256);
        const expected =
          profile.schemaVersion === 2
            ? (
                await qualifyAzureNativeNetworkGenerationBoundary(
                  predecessorPlan,
                  predecessor.networkUpdate.current,
                  profile.retainedReplacementPlanSha256,
                  store,
                )
              ).inventory
            : predecessor.networkUpdate.current;
        verifyAzureNativeNetworkHistoryBoundary(expected, network.before);
      } else
        for (const node of Object.values(network.before.nodes))
          for (const nic of base.nics) {
            const before = node.nics[String(nic.index)],
              subnet =
                nic.subnet.resourceId ??
                `/subscriptions/${base.subscription.id}/resourceGroups/${base.intent.resourceGroup}/providers/Microsoft.Network/virtualNetworks/${base.deploymentName}-vnet/subnets/${nic.subnet.name}`;
            require13(
              before.ownerPlanSha256 === base.planSha256 &&
                before.subnetId.toLowerCase() === subnet.toLowerCase() &&
                (!nic.subnet.cidr || before.subnetCidr === nic.subnet.cidr),
              'public checkpoint original NIC/subnet differs',
            );
          }
      require13(
        same7(network.source?.networkHistoryPlanSha256s, predecessors),
        'public checkpoint predecessor lineage differs',
      );
    }
  }
  for (const source of sources.values())
    if (source.intent.operation === 'update-network') {
      require13(
        source.engine === 'native' &&
          !source.relayProfile &&
          same7(azureUpgradeBinding(source), azureUpgradeBinding(base)) &&
          same7(azureNativeNetworkScope(source, true), azureNativeNetworkScope(base, true)),
        'network source owner/scope differs',
      );
      if (!histories.has(source.planSha256)) {
        const rows = checkpoints.get(source.planSha256) ?? [];
        require13(
          !rows.some((row) => row.checkpoint.state === 'complete'),
          'completed public execution lacks complete network history',
        );
        const receipts = {};
        for (const [name, value] of records)
          if (name.startsWith(`native-action-${source.planSha256}-`)) {
            const actionId = String(object12(value).actionId);
            require13(
              name === `native-action-${source.planSha256}-${actionId}.json` &&
                source.actions.some((action) => action.id === actionId),
              'interrupted source has unresolved action evidence',
            );
            receipts[actionId] = canonicalSha256(value);
          }
        require13(
          Object.keys(receipts).length === 0 ||
            rows.some((row) => row.checkpoint.state !== 'complete' && same7(row.actionReceiptSha256ById, receipts)),
          'executed network source lacks complete history or matching interrupted public evidence',
        );
      }
    }
}

// plugins/azure/src/ce/native-workflow.ts
import { chmod, mkdtemp, rm as rm2, writeFile as writeFile2 } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join as join2 } from 'node:path';

// plugins/azure/src/ce/native-replacement-source.ts
var require14 = (condition, message) => {
  if (!condition) throw Error(`Azure native replacement source: ${message}`);
};
var same8 = canonicalEqual;
var scope = (plan) => {
  const { operation: _operation, replacementNode: _node, ...intent } = plan.intent;
  const { termsAccepted: _terms, ...image } = plan.image;
  return {
    intent,
    image,
    subscription: plan.subscription,
    topology: plan.topology,
    nics: plan.nics,
    vm: plan.vm,
    routing: plan.routing,
    egress: plan.egress,
    workloadProfile: plan.workloadProfile ?? null,
  };
};
function verifyAzureNativeReplacementOriginalSource(plan, original) {
  verifyAzureCePlan(plan);
  verifyAzureCePlan(original);
  require14(
    plan.engine === 'native' &&
      !plan.relayProfile &&
      plan.intent.operation === 'replace-node' &&
      original.engine === 'native' &&
      !original.relayProfile &&
      original.intent.operation === 'deploy' &&
      same8(azureUpgradeBinding(plan), azureUpgradeBinding(original)) &&
      same8(scope(plan), scope(original)),
    'original creation scope differs',
  );
}
async function qualifyAzureNativeReplacementOriginalSource(plan, oldVmIds, owners, siteUid, storage) {
  await storage.verify();
  const nodes = azureUpgradeBinding(plan).nodes;
  require14(
    same8(Object.keys(oldVmIds).sort(), nodes.toSorted()) && same8(Object.keys(owners).sort(), nodes.toSorted()),
    'complete VM owner inventory differs',
  );
  let original;
  let retained;
  const boundaries = new Map();
  const visit = async (digest, node, vmId, path) => {
    require14(/^[a-f0-9]{64}$/.test(digest) && !path.has(digest), 'recursive or unresolved generation owner');
    require14(
      typeof vmId === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(vmId),
      'VM generation UUID is unavailable',
    );
    const key = `${digest}:${node}`;
    require14(
      !boundaries.has(key) || boundaries.get(key) === vmId.toLowerCase(),
      'survivor UUID differs across generation boundaries',
    );
    boundaries.set(key, vmId.toLowerCase());
    const source = await storage.read(`native-source-${digest}.json`);
    verifyAzureCePlan(source);
    require14(
      source.planSha256 === digest &&
        source.engine === 'native' &&
        !source.relayProfile &&
        same8(scope(source), scope(plan)),
      'generation source differs',
    );
    const checkpoint = await storage.read(`native-admission-${digest}.json`);
    validateAzureNativeAdmissionCheckpoint(source, checkpoint);
    const candidate = source.intent.operation === 'deploy' ? source : checkpoint.replacement?.originalSourcePlan;
    require14(candidate, 'original creation is unresolved');
    verifyAzureNativeReplacementOriginalSource(plan, candidate);
    const saved = await storage.read(`native-source-${candidate.planSha256}.json`);
    require14(
      same8(saved, candidate) && (!original || same8(original, candidate)),
      'original saved creation differs across VM generations',
    );
    original = candidate;
    if (source.intent.operation === 'deploy') {
      require14(
        checkpoint.siteReserved &&
          nodes.every((name) => {
            const index = String(nodes.indexOf(name) + 1);
            return checkpoint.bootstrapByNode[index] && checkpoint.launchedAtByNode[index];
          }),
        'original native creation admission is incomplete',
      );
      return;
    }
    const prior = checkpoint.replacement;
    require14(
      source.intent.operation === 'replace-node' &&
        prior?.status === 'registered' &&
        prior.siteUid === siteUid &&
        source.intent.replacementNode === nodes.indexOf(node) + 1 &&
        prior.newVmId?.toLowerCase() === vmId.toLowerCase(),
      'prior generation registration or VM identity differs',
    );
    require14(
      retained === undefined || same8(retained, prior?.retainedNics),
      'prior generation retained interface identities differ',
    );
    retained = prior?.retainedNics;
    const next = new Set([...path, digest]);
    for (const name of nodes) await visit(prior?.ownerPlanSha256ByNode[name], name, prior?.oldVmIds[name], next);
  };
  for (const node of nodes) await visit(owners[node], node, oldVmIds[node], new Set());
  require14(original, 'original creation is unavailable');
  return {
    original,
    ...(retained !== undefined ? { retainedNics: retained } : {}),
  };
}
async function requireAzureNativePriorGenerationExecution(checkpoint, storage, load) {
  require14(checkpoint.replacement?.originalSourcePlan, 'original generation binding is missing');
  for (const digest of new Set(Object.values(checkpoint.replacement?.ownerPlanSha256ByNode ?? {}))) {
    const source = await storage.read(`native-source-${digest}.json`);
    verifyAzureCePlan(source);
    require14(
      source.planSha256 === digest && (await load(source))?.state === 'complete',
      'prior generation public execution is incomplete',
    );
  }
}

// plugins/azure/src/ce/platform-health.ts
async function collectAzurePlatformHealth(
  plan,
  vms,
  runtime,
  signal,
  admittedNodeCount = plan.topology.nodeCount,
  expectedOwnerPlanSha256ByNode,
) {
  const base = {
    planId: plan.planId,
    engine: plan.engine,
    subscriptionId: plan.subscription.id,
    siteName: plan.siteName,
    observedAt: new Date().toISOString(),
    scope: 'site-global-and-registration-only',
    nodeHealth: 'unknown',
    bgp: 'unknown',
    routes: 'unknown',
    traffic: 'unknown',
  };
  if (
    !Array.isArray(vms) ||
    !Number.isInteger(admittedNodeCount) ||
    admittedNodeCount < 1 ||
    admittedNodeCount > plan.topology.nodeCount
  )
    return {
      ...base,
      status: 'unknown',
      reason: 'cloud-inventory-unavailable',
    };
  const scope =
    `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/`.toLowerCase();
  const instances = {};
  const used = new Set();
  for (let node = 1; node <= admittedNodeCount; node++) {
    const name = `${plan.deploymentName}-${node}`;
    const ownerGates = [
      ...new Set(
        (plan.actions ?? [])
          .filter(
            (action) =>
              action.node === node &&
              action.kind.startsWith('vm-') &&
              (!action.resourceId || action.resourceId.toLowerCase() === scope + name.toLowerCase()) &&
              action.expectedOwnerPlanSha256,
          )
          .map((action) => action.expectedOwnerPlanSha256),
      ),
    ];
    const expectedOwnerPlanSha256 =
      expectedOwnerPlanSha256ByNode?.[name] ??
      (ownerGates.length === 0
        ? plan.planSha256
        : ownerGates.length === 1 && /^[a-f0-9]{64}$/.test(ownerGates[0])
          ? ownerGates[0]
          : undefined);
    const matches = vms.filter(
      (vm) => vm && typeof vm.id === 'string' && vm.id.toLowerCase() === scope + name.toLowerCase(),
    );
    if (matches.length !== 1)
      return {
        ...base,
        status: 'unknown',
        reason: 'cloud-node-identity-ambiguous',
      };
    const vm = matches[0];
    if (
      vm.name !== name ||
      typeof vm.location !== 'string' ||
      vm.location.toLowerCase() !== plan.region.toLowerCase() ||
      vm.tags?.['xcsh-managed-by'] !== 'azure-ce' ||
      vm.tags?.['xcsh-deployment-id'] !== plan.deploymentName ||
      vm.tags?.['xcsh-execution-engine'] !== plan.engine ||
      !expectedOwnerPlanSha256 ||
      vm.tags?.['xcsh-plan-sha256'] !== expectedOwnerPlanSha256 ||
      typeof vm.vmId !== 'string' ||
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(vm.vmId) ||
      used.has(vm.vmId.toLowerCase())
    )
      return {
        ...base,
        status: 'unknown',
        reason: 'cloud-node-binding-incomplete',
      };
    used.add(vm.vmId.toLowerCase());
    instances[name] = vm.vmId;
  }
  const binding = {
    owner: {
      deploymentId: plan.deploymentName,
      engine: plan.engine,
      provider: 'azure',
      account: plan.subscription.id,
      region: plan.region,
    },
    siteName: plan.siteName,
    nodes: Array.from({ length: plan.topology.nodeCount }, (_, index) => `${plan.deploymentName}-${index + 1}`),
  };
  const admittedNodes = Object.keys(instances);
  try {
    const [health, registrations] = await Promise.all([
      runtime.observeHealth(binding, signal),
      runtime.observeRegistrations(binding, instances, signal, admittedNodes),
    ]);
    const values = [health.status, registrations.status];
    const status = values.every((value) => value === 'healthy')
      ? 'healthy'
      : values.some((value) => !['healthy', 'degraded'].includes(String(value)))
        ? 'unknown'
        : 'degraded';
    return { ...base, status, health, registrations };
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      ...base,
      status: 'unknown',
      reason: 'platform-observation-unavailable',
    };
  }
}

// plugins/azure/src/ce/relay-replacement-identity.ts
import { isIP as isIP9 } from 'node:net';

var require15 = (value, message) => {
  if (!value) throw Error(`Azure relay replacement identity: ${message}`);
};
var lower6 = (value) => (typeof value === 'string' ? value.toLowerCase() : '');
var object13 = (value) => {
  require15(value && typeof value === 'object' && !Array.isArray(value), 'malformed cloud record');
  return value;
};
var unicastMac = (value) =>
  typeof value === 'string' &&
  /^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(value) &&
  (Number.parseInt(value.slice(0, 2), 16) & 1) === 0 &&
  value !== '00:00:00:00:00:00';
var usableSubnetAddress = (address, cidr) => {
  if (isIP9(address) !== 4 || typeof cidr !== 'string') return false;
  const [network, prefix, extra] = cidr.split('/');
  if (extra !== undefined || isIP9(network) !== 4 || !/^(?:[0-9]|[12][0-9]|3[0-2])$/.test(prefix)) return false;
  const number = (value) => value.split('.').reduce((sum, octet) => sum * 256 + Number(octet), 0);
  const size = 2 ** (32 - Number(prefix));
  return (
    size >= 8 &&
    number(network) % size === 0 &&
    number(address) > number(network) + 3 &&
    number(address) < number(network) + size - 1
  );
};
function validAzureRelayRetainedNics(plan, value) {
  return (
    plan.relayProfile?.schemaVersion === 2 && validAzureRetainedNicsForSource(azureRelayResourceSource(plan), value)
  );
}
function validAzureRetainedNicsForSource(original, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actions = original.actions.filter((action) => action.kind === 'nic-create');
  const keys = actions.map((action) => `${action.node}:${action.resourceId?.match(/-nic([0-9]+)$/)?.[1]}`);
  if (
    actions.length !== original.topology.nodeCount * original.nics.length ||
    Object.keys(value).sort().join(',') !== keys.sort().join(',') ||
    new Set(Object.values(value).map((row) => row.mac)).size !== actions.length
  )
    return false;
  return actions.every((action) => {
    const index = Number(action.resourceId?.match(/-nic([0-9]+)$/)?.[1]);
    const row = value[`${action.node}:${index}`];
    const nic = original.nics.find((item) => item.index === index);
    const subnet = original.actions.find(
      (item) => item.kind === 'subnet-create' && item.args?.[item.args.indexOf('--name') + 1] === nic?.subnet.name,
    );
    return (
      row &&
      Object.keys(row).sort().join(',') === 'mac,ownerPlanSha256,privateIp,resourceId,subnetId' &&
      typeof row.resourceId === 'string' &&
      lower6(row.resourceId) === lower6(action.resourceId) &&
      typeof row.subnetId === 'string' &&
      lower6(row.subnetId) === lower6(subnet?.resourceId) &&
      row.ownerPlanSha256 === original.planSha256 &&
      unicastMac(row.mac) &&
      usableSubnetAddress(row.privateIp, nic?.subnet.cidr)
    );
  });
}
async function captureAzureRelayRetainedNics(plan, api, signal) {
  verifyAzureCePlan(plan);
  require15(plan.relayProfile?.schemaVersion === 2, 'exact relay replacement required');
  return captureAzureRetainedNicsForSource(azureRelayResourceSource(plan), api, signal);
}
async function captureAzureRetainedNicsForSource(original, api, signal) {
  verifyAzureCePlan(original);
  require15(original.intent.operation === 'deploy', 'original creation required');
  const plan = original;
  const result = {};
  for (const action of original.actions.filter((item) => item.kind === 'nic-create')) {
    signal?.throwIfAborted();
    const raw = await api.exec(
      'az',
      [
        'network',
        'nic',
        'show',
        '--ids',
        action.resourceId,
        '--subscription',
        plan.subscription.id,
        '--output',
        'json',
      ],
      signal ? { signal } : undefined,
    );
    signal?.throwIfAborted();
    require15(raw.exitCode === 0, 'cloud NIC read unavailable');
    const value = object13(JSON.parse(raw.stdout));
    const tags = object13(value.tags);
    const vm = original.actions.find((item) => item.kind === 'vm-create' && item.node === action.node);
    require15(
      value.provisioningState === 'Succeeded' &&
        lower6(value.location) === lower6(plan.region) &&
        lower6(value.id) === lower6(action.resourceId) &&
        lower6(object13(value.virtualMachine).id) === lower6(vm?.resourceId) &&
        tags['xcsh-managed-by'] === 'azure-ce' &&
        tags['xcsh-execution-engine'] === plan.engine &&
        tags['xcsh-deployment-id'] === plan.deploymentName &&
        tags['xcsh-plan-sha256'] === original.planSha256 &&
        !['nextLink', 'error', 'errors'].some((key) => value[key]),
      'retained NIC identity or owner differs',
    );
    require15(
      Array.isArray(value.ipConfigurations) && value.ipConfigurations.length === 1,
      'one exact retained IP configuration required',
    );
    const config = object13(value.ipConfigurations[0]);
    require15(config.privateIPAddressVersion === 'IPv4', 'retained IPv4 configuration required');
    const index = action.resourceId?.match(/-nic([0-9]+)$/)?.[1];
    result[`${action.node}:${index}`] = {
      resourceId: String(value.id),
      subnetId: String(object13(config.subnet).id),
      mac: lower6(value.macAddress).replaceAll('-', ':'),
      privateIp: String(config.privateIPAddress),
      ownerPlanSha256: original.planSha256,
    };
  }
  require15(validAzureRetainedNicsForSource(original, result), 'complete distinct retained NIC joins required');
  return result;
}

// plugins/azure/src/ce/relay-observation.ts
import { randomBytes } from 'node:crypto';

// plugins/platform/src/ce/interface-evidence.ts
function parseGeneratedInterfaceUid(value) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value) ||
    value === '00000000-0000-0000-0000-000000000000'
  )
    throw Error('Missing or malformed generated interface UID');
  return value;
}

// plugins/platform/src/ce/interface-admission.ts
var name = (v) => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(v);
var mac2 = (v) =>
  typeof v === 'string' &&
  /^(?:[a-fA-F0-9]{2}:){5}[a-fA-F0-9]{2}$/.test(v) &&
  v !== '00:00:00:00:00:00' &&
  (Number.parseInt(v.slice(0, 2), 16) & 1) === 0
    ? v.toLowerCase()
    : undefined;
function requireCompleteInterfaceEvidence(observation, expected) {
  const fail = () => {
    throw Error('Complete identity-verified interface evidence is required');
  };
  if (
    !observation ||
    !['observed', 'down'].includes(observation.status) ||
    !Array.isArray(observation.interfaces) ||
    !Array.isArray(expected) ||
    expected.length === 0 ||
    observation.interfaces.length !== expected.length
  )
    fail();
  const expectedIds = new Set(),
    physicalMacs = new Set(),
    devices = new Set(),
    objects = new Set(),
    generatedUids = new Set();
  for (const wanted of expected) {
    const address = mac2(wanted.mac),
      key = `${wanted.node}/${wanted.role}`;
    if (
      !name(wanted.node) ||
      !['slo', 'data', 'sli'].includes(wanted.role) ||
      !address ||
      physicalMacs.has(address) ||
      expectedIds.has(key)
    )
      fail();
    expectedIds.add(key);
    physicalMacs.add(address);
    const matches = observation.interfaces.filter(
      (row) => row && row.node === wanted.node && row.role === wanted.role && mac2(row.mac) === address,
    );
    if (matches.length !== 1) fail();
    const row = matches[0],
      deviceKey = `${row.node}/${row.device}`;
    if (
      typeof row.linkUp !== 'boolean' ||
      !name(row.device) ||
      !name(row.interfaceName) ||
      (wanted.device !== undefined && row.device !== wanted.device) ||
      !Number.isInteger(row.mtu) ||
      (row.mtu !== 0 && (row.mtu < 576 || row.mtu > 8000)) ||
      devices.has(deviceKey) ||
      objects.has(row.interfaceName)
    )
      fail();
    try {
      parseGeneratedInterfaceUid(row.interfaceUid);
      if (
        (wanted.interfaceUid !== undefined && parseGeneratedInterfaceUid(wanted.interfaceUid) !== row.interfaceUid) ||
        (wanted.interfaceName !== undefined && wanted.interfaceName !== row.interfaceName) ||
        generatedUids.has(row.interfaceUid.toLowerCase())
      )
        fail();
      generatedUids.add(row.interfaceUid.toLowerCase());
    } catch {
      fail();
    }
    devices.add(deviceKey);
    objects.add(row.interfaceName);
  }
  if (observation.status !== (observation.interfaces.every((row) => row.linkUp) ? 'observed' : 'down')) fail();
}
function requireQualifiedUpInterfaceEvidence(observation, expected) {
  const fail = () => {
    throw Error('Qualified current up interface evidence is required before routing mutation');
  };
  if (
    observation?.status !== 'observed' ||
    observation.freshness !== 'verified' ||
    observation.canSatisfyInterfaceMutationGate !== true
  )
    fail();
  try {
    requireCompleteInterfaceEvidence(observation, expected);
  } catch {
    fail();
  }
}

// plugins/platform/src/ce/bgp-evidence.ts
import { isIP as isIP10 } from 'node:net';

var object14 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed BGP session evidence');
  return value;
};
var array = (value) => {
  if (!Array.isArray(value)) throw new Error('Incomplete BGP session evidence');
  return value;
};
var matchesNode = (expected, actual) =>
  actual === expected || (typeof actual === 'string' && actual.startsWith(`${expected}.`));
function parseBgpSessions(response, expected) {
  if (
    !Array.isArray(expected) ||
    expected.length < 2 ||
    expected.length > 24 ||
    expected.length % 2 !== 0 ||
    new Set(expected.map((item) => item.node)).size > 3 ||
    new Set(expected.map((item) => `${item.node}/${item.interfaceName}/${item.peerAddress}`)).size !==
      expected.length ||
    expected.some(
      (item) =>
        !/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(item.node) ||
        !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(item.interfaceName) ||
        item.interfaceName.includes('__') ||
        isIP10(item.peerAddress) !== 4,
    )
  )
    throw new Error('Invalid expected BGP session identity');
  const value = object14(response);
  if (
    value.next_page_token ||
    value.next_token ||
    value.continuation_token ||
    value.NextToken ||
    (value.errors !== undefined && array(value.errors).length)
  )
    throw new Error('Partial BGP session evidence');
  const expectedNodes = [...new Set(expected.map((item) => item.node))];
  const nodes = array(value.ver).map(object14);
  if (
    nodes.length !== expectedNodes.length ||
    expectedNodes.some((node) => nodes.filter((candidate) => matchesNode(node, candidate.name)).length !== 1)
  )
    throw new Error('BGP session node identity differs');
  const actual = nodes.flatMap((node) =>
    array(node.peer).map((item) => {
      const peer = object14(item);
      const address = object14(object14(peer.peer_address).ipv4).addr;
      if (
        typeof node.name !== 'string' ||
        typeof peer.interface_name !== 'string' ||
        typeof address !== 'string' ||
        isIP10(address) !== 4 ||
        typeof peer.protocol_status !== 'string' ||
        ![
          'Unknown',
          'Idle',
          'Connect',
          'Active',
          'OpenSent',
          'OpenConfirm',
          'Established',
          'Clearing',
          'Deleted',
        ].includes(peer.protocol_status) ||
        !Number.isInteger(peer.received_prefix_count) ||
        Number(peer.received_prefix_count) < 0 ||
        !Number.isInteger(peer.advertised_prefix_count) ||
        Number(peer.advertised_prefix_count) < 0 ||
        typeof peer.up_down_timestamp !== 'string' ||
        Number.isNaN(Date.parse(peer.up_down_timestamp))
      )
        throw new Error('Malformed BGP peer evidence');
      return {
        node: node.name,
        interfaceName: peer.interface_name,
        peerAddress: address,
        state: peer.protocol_status,
        receivedPrefixCount: Number(peer.received_prefix_count),
        advertisedPrefixCount: Number(peer.advertised_prefix_count),
        stateChangedAt: peer.up_down_timestamp,
      };
    }),
  );
  if (actual.length !== expected.length) throw new Error('BGP session count differs');
  const sessions = expected.map((item) => {
    const matches = actual.filter(
      (candidate) =>
        matchesNode(item.node, candidate.node) &&
        candidate.interfaceName === item.interfaceName &&
        candidate.peerAddress === item.peerAddress,
    );
    if (matches.length !== 1) throw new Error('BGP session identity differs');
    return { ...item, ...matches[0], node: item.node };
  });
  const establishedSessions = sessions.filter((session) => session.state === 'Established').length;
  return {
    status: establishedSessions === expected.length ? 'healthy' : 'degraded',
    establishedSessions,
    expectedSessions: expected.length,
    sessions,
  };
}

// plugins/platform/src/ce/bgp-route-evidence.ts
import { isIP as isIP11 } from 'node:net';

var object15 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed BGP route evidence');
  return value;
};
var array2 = (value) => {
  if (!Array.isArray(value)) throw new Error('Incomplete BGP route evidence');
  return value;
};
var matchesNode2 = (expected, actual) =>
  actual === expected || (typeof actual === 'string' && actual.startsWith(`${expected}.`));
var cidr = (value) => {
  if (typeof value !== 'string') return false;
  const parts = value.split('/');
  if (parts.length !== 2) return false;
  const family = isIP11(parts[0]);
  const prefix = Number(parts[1]);
  return Number.isInteger(prefix) && prefix >= 0 && ((family === 4 && prefix <= 32) || (family === 6 && prefix <= 128));
};
function parseBgpRoutes(response, expectedNodes) {
  if (
    ![1, 2, 3].includes(expectedNodes.length) ||
    new Set(expectedNodes).size !== expectedNodes.length ||
    expectedNodes.some((node) => !/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(node))
  )
    throw new Error('Invalid expected BGP route node identity');
  const value = object15(response);
  if (
    value.next_page_token ||
    value.next_token ||
    value.continuation_token ||
    value.NextToken ||
    (value.errors !== undefined && array2(value.errors).length)
  )
    throw new Error('Partial BGP route evidence');
  const rows = array2(value.ver).map(object15);
  if (
    rows.length !== expectedNodes.length ||
    expectedNodes.some((node) => rows.filter((candidate) => matchesNode2(node, candidate.name)).length !== 1)
  )
    throw new Error('BGP route node identity differs');
  const nodes = expectedNodes.map((node) => {
    const row = rows.find((candidate) => matchesNode2(node, candidate.name));
    if (!row) throw new Error('BGP route node identity differs');
    const routingInstances = array2(row.ri_table).map((entry) => {
      const instance = object15(entry);
      if (typeof instance.routing_instance !== 'string' || !instance.routing_instance)
        throw new Error('Malformed BGP routing instance evidence');
      const tables = array2(instance.rt_table).map((entry) => {
        const table = object15(entry);
        if (typeof table.name !== 'string' || !table.name) throw new Error('Malformed BGP route table evidence');
        const routes = (kind) => {
          const seen = new Set();
          return array2(table[kind]).map((entry) => {
            const route = object15(entry);
            if (!cidr(route.subnet) || seen.has(route.subnet)) throw new Error('Malformed BGP route prefix evidence');
            seen.add(route.subnet);
            return route.subnet;
          });
        };
        return { name: table.name, imported: routes('imported'), exported: routes('exported') };
      });
      if (!tables.length) throw new Error('Incomplete BGP route table evidence');
      if (new Set(tables.map((table) => table.name)).size !== tables.length)
        throw new Error('Duplicate BGP route table evidence');
      return { name: instance.routing_instance, tables };
    });
    if (!routingInstances.length) throw new Error('Incomplete BGP routing instance evidence');
    if (new Set(routingInstances.map((instance) => instance.name)).size !== routingInstances.length)
      throw new Error('Duplicate BGP routing instance evidence');
    return { node, routingInstances };
  });
  return { status: 'observed', nodes };
}
var qualifiers = { scope: 'unqualified', freshness: 'unqualified', traffic: 'unknown' };
function parseBgpRoutePaths(response, expectedNodes) {
  try {
    const inventory = parseBgpRoutes(response, expectedNodes);
    const rows = array2(object15(response).ver).map(object15);
    const text = (value, empty = false) => {
      if (
        typeof value !== 'string' ||
        (!empty && !value.length) ||
        value.length > 1024 ||
        [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
        value.includes('__')
      )
        throw Error('Malformed BGP route path text');
      return value;
    };
    const nodes = inventory.nodes.map(({ node }) => {
      const row = rows.find((candidate) => matchesNode2(node, candidate.name));
      if (!row) throw Error('BGP route path node identity differs');
      const routingInstances = array2(row.ri_table).map((value) => {
        const instance = object15(value);
        return {
          name: instance.routing_instance,
          tables: array2(instance.rt_table).map((value) => {
            const table = object15(value);
            const routes = (kind) =>
              array2(table[kind]).map((value) => {
                const route = object15(value);
                const rawPaths = array2(route.path);
                if (!rawPaths.length) throw Error('Incomplete BGP route path evidence');
                const seen = new Set();
                const path = rawPaths.map((value) => {
                  const raw = object15(value);
                  if (Object.keys(raw).some((key) => !['peer', 'nh', 'as_path', 'local_pref', 'med'].includes(key)))
                    throw Error('Unqualified BGP route path fields');
                  const peer = text(raw.peer);
                  const nh = array2(raw.nh).map((value) => text(value));
                  if (!nh.length || new Set(nh).size !== nh.length) throw Error('Incomplete or duplicate BGP nexthops');
                  const identity = JSON.stringify([peer, nh.toSorted()]);
                  if (seen.has(identity)) throw Error('Duplicate BGP route path identity');
                  seen.add(identity);
                  const parsed = { peer, nh };
                  if (raw.as_path !== undefined) parsed.as_path = text(raw.as_path, true);
                  for (const key of ['local_pref', 'med']) {
                    if (raw[key] === undefined) continue;
                    if (!Number.isSafeInteger(raw[key]) || raw[key] < 0)
                      throw Error('Malformed or imprecise BGP path attribute');
                    parsed[key] = raw[key];
                  }
                  return parsed;
                });
                return { subnet: route.subnet, path };
              });
            return { name: table.name, imported: routes('imported'), exported: routes('exported') };
          }),
        };
      });
      return { node, routingInstances };
    });
    return { ...qualifiers, status: 'observed', nodes };
  } catch (error) {
    return {
      ...qualifiers,
      status: 'unknown',
      reason: error instanceof Error ? error.message : 'BGP route paths unavailable',
    };
  }
}

// plugins/platform/src/ce/wire-routing.ts
import { createHash as createHash3 } from 'node:crypto';
// plugins/platform/src/ce/wire-schema.ts
import { isIP as isIP12, isIP as isIP13 } from 'node:net';

var keywords = new Set([
  'type',
  'enum',
  'const',
  'required',
  'minLength',
  'maxLength',
  'pattern',
  'minimum',
  'maximum',
  'multipleOf',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minProperties',
  'maxProperties',
  'format',
  'nullable',
]);
function object16(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('SMSv2 schema is malformed');
  return value;
}
function vendorIntegerRanges(source) {
  const key = 'ves.io.schema.rules.uint32.ranges';
  const annotations = ['x-ves-validation-rules', 'x-validation-rules']
    .map((name) => (source[name] === undefined ? undefined : object16(source[name])[key]))
    .filter((value) => value !== undefined);
  if (!annotations.length) return;
  if (source.type !== 'integer' || annotations.some((value) => typeof value !== 'string'))
    throw new Error('Malformed SMSv2 integer range');
  const parse = (value) => {
    const ranges = String(value)
      .split(',')
      .map((part) => {
        const match = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
        if (!match) throw new Error('Malformed SMSv2 integer range');
        const minimum = Number(match[1]),
          maximum = Number(match[2] ?? match[1]);
        if (
          ![minimum, maximum].every((bound) => Number.isSafeInteger(bound) && bound >= 0 && bound <= 4294967295) ||
          minimum > maximum
        )
          throw new Error('Malformed SMSv2 integer range');
        return { minimum, maximum };
      });
    return ranges;
  };
  const ranges = annotations.map(parse);
  if (ranges.some((value) => JSON.stringify(value) !== JSON.stringify(ranges[0])))
    throw new Error('Conflicting SMSv2 integer ranges');
  return { anyOf: ranges[0] };
}
function requestSchema(schemas, root) {
  const definitions = {};
  const referenced = new Set();
  function convert(value) {
    if (typeof value === 'boolean') return value;
    const source = object16(value);
    if (source.readOnly === true) return false;
    const result = {};
    for (const [key, item] of Object.entries(source)) {
      if (keywords.has(key)) result[key] = item;
      if (key === 'required' && Array.isArray(item))
        result.required = item.map((name) => {
          const property = object16(source.properties ?? {})[String(name)];
          return typeof property?.['x-f5xc-wire-name'] === 'string' ? property['x-f5xc-wire-name'] : name;
        });
      if (key === '$ref') {
        if (typeof item !== 'string' || !item.startsWith('#/components/schemas/'))
          throw new Error('Unsupported SMSv2 schema reference');
        const name = item.slice('#/components/schemas/'.length);
        if (!Object.hasOwn(schemas, name)) throw new Error('Missing SMSv2 schema reference');
        referenced.add(name);
        result.$ref = `#/definitions/${name}`;
      }
      if (key === 'properties') {
        result.properties = Object.fromEntries(
          Object.entries(object16(item)).map(([name, schema]) => {
            const wireName = object16(schema)['x-f5xc-wire-name'];
            return [typeof wireName === 'string' ? wireName : name, convert(schema)];
          }),
        );
        result.additionalProperties =
          source.additionalProperties === undefined ? false : convert(source.additionalProperties);
      }
      if (key === 'additionalProperties') result.additionalProperties = convert(item);
      if (key === 'items' || key === 'not') result[key] = convert(item);
      if (['allOf', 'anyOf', 'oneOf'].includes(key)) {
        if (!Array.isArray(item)) throw new Error('Malformed SMSv2 schema composition');
        result[key] = item.map(convert);
      }
      if (key === 'exclusiveMinimum' || key === 'exclusiveMaximum') {
        if (typeof item === 'number') result[key] = item;
        else if (item === true) result[key] = source[key === 'exclusiveMinimum' ? 'minimum' : 'maximum'];
      }
    }
    const integerRanges = vendorIntegerRanges(source);
    if (integerRanges) result.allOf = [...(result.allOf ?? []), integerRanges];
    const exclusions = [];
    for (const [key, item] of Object.entries(source)) {
      if (!key.startsWith('x-ves-oneof-field-')) continue;
      let names;
      try {
        names = typeof item === 'string' ? JSON.parse(item) : item;
      } catch {
        throw new Error('Malformed SMSv2 oneof group');
      }
      if (!Array.isArray(names) || names.some((name) => typeof name !== 'string'))
        throw new Error('Malformed SMSv2 oneof group');
      const wireNames = names.map((name) => {
        const property = object16(source.properties ?? {})[String(name)];
        return typeof property?.['x-f5xc-wire-name'] === 'string' ? property['x-f5xc-wire-name'] : name;
      });
      for (let i = 0; i < wireNames.length; i++)
        for (let j = i + 1; j < wireNames.length; j++)
          exclusions.push({ not: { required: [wireNames[i], wireNames[j]] } });
    }
    if (exclusions.length) result.allOf = [...(result.allOf ?? []), ...exclusions];
    return result;
  }
  if (!Object.hasOwn(schemas, root)) throw new Error('Missing SMSv2 create schema');
  referenced.add(root);
  for (const name of referenced) definitions[name] = convert(schemas[name]);
  return { $ref: `#/definitions/${root}`, definitions };
}
function createWireValidator(
  schemas,
  root = 'viewssecuremesh_site_v2CreateSpecType',
  observedInterfaceIdentityEcho = false,
) {
  const schema = requestSchema(schemas, root);
  if (observedInterfaceIdentityEcho) {
    if (root !== 'securemesh_site_v2ReplaceRequest') throw new Error('Identity echo requires a replacement snapshot');
    const properties = object16(object16(schemas.securemesh_site_v2Interface).properties);
    const projected = object16(object16(object16(schema.definitions).securemesh_site_v2Interface).properties);
    for (const field of ['is_primary', 'is_management']) {
      const source = object16(properties[field]);
      if (source.readOnly !== true || source.type !== 'boolean') throw new Error('Interface identity schema changed');
      projected[field] = { type: 'boolean' };
    }
  }
  return (spec) => {
    const keyword = firstFailure(schema, spec, schema);
    if (keyword) {
      throw new Error(`SMSv2 request violates the verified schema (${keyword})`);
    }
  };
}
function equal(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right))
    return left.length === right.length && left.every((item, index) => equal(item, right[index]));
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const leftEntries = Object.entries(left);
    const rightObject = right;
    return (
      leftEntries.length === Object.keys(rightObject).length &&
      leftEntries.every(([key, value]) => Object.hasOwn(rightObject, key) && equal(value, rightObject[key]))
    );
  }
  return false;
}
function validFormat(format, value) {
  if (format === 'cidr') {
    const [address, length, extra] = value.split('/');
    const family = isIP12(address);
    if (!family || extra !== undefined || !/^\d+$/.test(length ?? '')) return false;
    const bits = Number(length);
    return bits >= 0 && bits <= (family === 4 ? 32 : 128);
  }
  if (format === 'ipv4') return isIP12(value) === 4;
  if (format === 'ipv6') return isIP12(value) === 6;
  if (format === 'uuid')
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  if (format === 'dns-label') return /^(?!-)[a-z0-9-]{1,63}(?<!-)$/i.test(value);
  if (format === 'hostname' || format === 'fqdn')
    return value.length <= 253 && value.split('.').every((label) => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/i.test(label));
  if (format === 'uri') {
    try {
      return Boolean(new URL(value).protocol);
    } catch {
      return false;
    }
  }
  if (format === 'date-time')
    return (
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && !Number.isNaN(Date.parse(value))
    );
  return true;
}
function typeMatches(type, value) {
  if (Array.isArray(type)) return type.some((item) => typeMatches(item, value));
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return type === undefined || typeof value === type;
}
function firstFailure(schemaValue, value, document) {
  if (schemaValue === false) return 'false schema';
  if (schemaValue === true) return null;
  if (typeof schemaValue.$ref === 'string') {
    const prefix = '#/definitions/';
    if (!schemaValue.$ref.startsWith(prefix)) return '$ref';
    const definition = object16(document.definitions)[schemaValue.$ref.slice(prefix.length)];
    if (definition === undefined) return '$ref';
    const failure = firstFailure(definition, value, document);
    if (failure) return failure;
  }
  if (schemaValue.nullable === true && value === null) return null;
  if (!typeMatches(schemaValue.type, value)) return 'type';
  if (Array.isArray(schemaValue.enum) && !schemaValue.enum.some((item) => equal(item, value))) return 'enum';
  if (Object.hasOwn(schemaValue, 'const') && !equal(schemaValue.const, value)) return 'const';
  for (const keyword of ['allOf', 'anyOf', 'oneOf']) {
    const members = schemaValue[keyword];
    if (!Array.isArray(members)) continue;
    const matches = members.filter((member) => firstFailure(member, value, document) === null).length;
    if (
      (keyword === 'allOf' && matches !== members.length) ||
      (keyword === 'anyOf' && matches === 0) ||
      (keyword === 'oneOf' && matches !== 1)
    )
      return keyword;
  }
  if (schemaValue.not !== undefined && firstFailure(schemaValue.not, value, document) === null) return 'not';
  if (typeof value === 'string') {
    const length = [...value].length;
    if (typeof schemaValue.minLength === 'number' && length < schemaValue.minLength) return 'minLength';
    if (typeof schemaValue.maxLength === 'number' && length > schemaValue.maxLength) return 'maxLength';
    if (typeof schemaValue.pattern === 'string' && !new RegExp(schemaValue.pattern, 'u').test(value)) return 'pattern';
    if (typeof schemaValue.format === 'string' && !validFormat(schemaValue.format, value)) return 'format';
  }
  if (typeof value === 'number') {
    if (typeof schemaValue.minimum === 'number' && value < schemaValue.minimum) return 'minimum';
    if (typeof schemaValue.maximum === 'number' && value > schemaValue.maximum) return 'maximum';
    if (typeof schemaValue.exclusiveMinimum === 'number' && value <= schemaValue.exclusiveMinimum)
      return 'exclusiveMinimum';
    if (typeof schemaValue.exclusiveMaximum === 'number' && value >= schemaValue.exclusiveMaximum)
      return 'exclusiveMaximum';
    if (typeof schemaValue.multipleOf === 'number') {
      const quotient = value / schemaValue.multipleOf;
      if (!Number.isFinite(quotient) || Math.abs(quotient - Math.round(quotient)) > 0.000000000001) return 'multipleOf';
    }
  }
  if (Array.isArray(value)) {
    if (typeof schemaValue.minItems === 'number' && value.length < schemaValue.minItems) return 'minItems';
    if (typeof schemaValue.maxItems === 'number' && value.length > schemaValue.maxItems) return 'maxItems';
    if (
      schemaValue.uniqueItems === true &&
      value.some((item, index) => value.slice(0, index).some((seen) => equal(seen, item)))
    )
      return 'uniqueItems';
    if (schemaValue.items !== undefined)
      for (const item of value) {
        const failure = firstFailure(schemaValue.items, item, document);
        if (failure) return failure;
      }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value;
    if (
      Array.isArray(schemaValue.required) &&
      schemaValue.required.some((key) => typeof key === 'string' && !Object.hasOwn(record, key))
    )
      return 'required';
    const entries = Object.entries(record);
    if (typeof schemaValue.minProperties === 'number' && entries.length < schemaValue.minProperties)
      return 'minProperties';
    if (typeof schemaValue.maxProperties === 'number' && entries.length > schemaValue.maxProperties)
      return 'maxProperties';
    const properties = schemaValue.properties ? object16(schemaValue.properties) : undefined;
    for (const [key, item] of entries) {
      const propertySchema = properties?.[key];
      if (propertySchema !== undefined) {
        const failure = firstFailure(propertySchema, item, document);
        if (failure) return failure;
      } else if (schemaValue.additionalProperties === false) return 'additionalProperties';
      else if (schemaValue.additionalProperties && typeof schemaValue.additionalProperties === 'object') {
        const failure = firstFailure(schemaValue.additionalProperties, item, document);
        if (failure) return failure;
      }
    }
  }
  return null;
}

// plugins/platform/src/ce/wire-routing.ts
function buildAzureRelayRouting(siteName, localAsn, bindings, relays, validate) {
  const name = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  const interfaceName = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/;
  const reserved = new Set([8074, 8075, 12076, 23456, 65515, 65517, 65518, 65519, 65520]);
  const validAsn = (asn) =>
    Number.isInteger(asn) && asn > 0 && asn < 65535 && !reserved.has(asn) && !(asn >= 64496 && asn <= 64511);
  if (
    typeof siteName !== 'string' ||
    !name.test(siteName) ||
    !validAsn(localAsn) ||
    !Array.isArray(bindings) ||
    ![1, 3].includes(bindings.length) ||
    !Array.isArray(relays) ||
    relays.length !== 2
  )
    throw new Error('Unsupported Azure CE-to-relay site or peer topology');
  const nodes = new Set();
  const interfaces = new Set();
  for (const binding of bindings) {
    if (
      !binding ||
      typeof binding.node !== 'string' ||
      !name.test(binding.node) ||
      nodes.has(binding.node) ||
      binding.role !== 'slo' ||
      typeof binding.interfaceName !== 'string' ||
      !interfaceName.test(binding.interfaceName) ||
      binding.interfaceName.includes('__') ||
      interfaces.has(binding.interfaceName)
    )
      throw new Error('Explicit unique Azure SLO interface bindings are required');
    nodes.add(binding.node);
    interfaces.add(binding.interfaceName);
  }
  const relayNames = new Set();
  const addresses = new Set();
  for (const relay of relays) {
    if (
      !relay ||
      typeof relay.name !== 'string' ||
      !name.test(relay.name) ||
      relayNames.has(relay.name) ||
      typeof relay.address !== 'string' ||
      isIP13(relay.address) !== 4 ||
      addresses.has(relay.address) ||
      !validAsn(relay.asn) ||
      relay.asn === localAsn
    )
      throw new Error('Two explicit distinct Azure relay peers and external ASNs are required');
    const octets = relay.address.split('.').map(Number);
    if (octets[0] === 0 || octets[0] === 127 || octets[0] >= 224 || (octets[0] === 169 && octets[1] === 254))
      throw new Error('Azure relay peers require unicast NIC IPv4 addresses');
    relayNames.add(relay.name);
    addresses.add(relay.address);
  }
  const orderedBindings = bindings.toSorted((a, b) => (a.node < b.node ? -1 : a.node > b.node ? 1 : 0));
  const orderedRelays = relays.toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const expectedPeers = orderedBindings.flatMap((binding) =>
    orderedRelays.map((relay) => ({
      node: binding.node,
      interfaceName: binding.interfaceName,
      peerAddress: relay.address,
      peerAsn: relay.asn,
      relayName: relay.name,
    })),
  );
  const spec = {
    where: {
      site: {
        network_type: 'VIRTUAL_NETWORK_SITE_LOCAL',
        ref: [{ name: siteName, namespace: 'system' }],
        disable_internet_vip: {},
      },
    },
    bgp_parameters: { asn: localAsn, local_address: {} },
    peers: orderedBindings.flatMap((binding, nodeIndex) =>
      orderedRelays.map((relay, relayIndex) => ({
        metadata: { name: `peer-${nodeIndex + 1}-${relayIndex + 1}` },
        external: {
          asn: relay.asn,
          address: relay.address,
          port: 179,
          interface: { name: binding.interfaceName, namespace: 'system' },
          disable_v6: {},
        },
        passive_mode_disabled: {},
        bfd_disabled: {},
      })),
    ),
  };
  validate('bgp', spec);
  const suffix = '-relay-bgp';
  const resourceName =
    siteName.length + suffix.length <= 63
      ? siteName + suffix
      : `${siteName.slice(0, 44)}-${createHash3('sha256').update(siteName).digest('hex').slice(0, 8)}${suffix}`;
  return {
    bgp: { name: resourceName, spec },
    expectedPeers,
    expectedSessions: expectedPeers.length,
    payloadNetwork: 'slo',
  };
}

// plugins/azure/src/ce/relay-config.ts
import { isIP as isIP14 } from 'node:net';

var require16 = (condition, message) => {
  if (!condition) throw Error(`Azure relay FRR config: ${message}`);
};
var ipv42 = (address) => address.split('.').reduce((sum, octet) => sum * 256 + Number(octet), 0);
var canonicalPrefix = (value) => {
  if (typeof value !== 'string') return false;
  const [address, prefix, extra] = value.split('/');
  if (extra !== undefined || isIP14(address) !== 4 || !/^(?:[1-9]|[12][0-9]|3[0-2])$/.test(prefix)) return false;
  const first = Number(address.split('.')[0]);
  return first !== 0 && first !== 127 && first < 224 && ipv42(address) % 2 ** (32 - Number(prefix)) === 0;
};
function compileAzureRelayFrrConfig(source, plan, relayName, server, ceEndpoints, returnPrefixes) {
  verifyAzureRelayPlan(source, plan);
  const selected = plan.relays.filter((relay) => relay.name === relayName);
  require16(selected.length === 1, 'selected relay is not in saved plan');
  const relay = selected[0];
  require16(
    server.status === 'observed' &&
      server.planSha256 === plan.planSha256 &&
      server.sourcePlanSha256 === source.planSha256 &&
      server.routeServerId === plan.routeServerId,
    'current joined Route Server identity required',
  );
  require16(
    server.relays.length === 2 &&
      plan.relays.every(
        (expected) =>
          server.relays.filter(
            (current) =>
              current.name === expected.name &&
              current.vmId === expected.vmId &&
              current.nicId === expected.nicId &&
              current.address === expected.privateAddress &&
              current.asn === expected.asn,
          ).length === 1,
      ),
    'current relay identities differ',
  );
  const [network, prefix] = plan.sloCidr.split('/');
  const start = ipv42(network),
    end = start + 2 ** (32 - Number(prefix)) - 1;
  require16(
    Array.isArray(ceEndpoints) &&
      ceEndpoints.length === source.topology.nodeCount &&
      new Set(ceEndpoints.map((endpoint) => endpoint.node)).size === source.topology.nodeCount &&
      new Set(ceEndpoints.map((endpoint) => endpoint.address)).size === source.topology.nodeCount &&
      ceEndpoints.every(
        (endpoint) =>
          Number.isInteger(endpoint.node) &&
          endpoint.node >= 1 &&
          endpoint.node <= source.topology.nodeCount &&
          isIP14(endpoint.address) === 4 &&
          ipv42(endpoint.address) > start + 3 &&
          ipv42(endpoint.address) < end &&
          !plan.relays.some((current) => current.privateAddress === endpoint.address),
      ),
    'one distinct usable CE SLO address per planned node required',
  );
  require16(
    Array.isArray(returnPrefixes) &&
      returnPrefixes.length > 0 &&
      returnPrefixes.length <= 32 &&
      new Set(returnPrefixes).size === returnPrefixes.length &&
      returnPrefixes.every(canonicalPrefix),
    'explicit distinct canonical return prefix policy required',
  );
  require16(
    server.serviceAddresses.length === 2 &&
      new Set(server.serviceAddresses).size === 2 &&
      server.serviceAddresses.every(
        (address) =>
          isIP14(address) === 4 &&
          !ceEndpoints.some((endpoint) => endpoint.address === address) &&
          !plan.relays.some((current) => current.privateAddress === address),
      ),
    'two resolved Route Server service addresses required',
  );
  require16(
    JSON.stringify(returnPrefixes.toSorted()) === JSON.stringify(plan.returnPrefixes),
    'return policy differs from saved plan',
  );
  const gatewayNumber = start + 1;
  const azureGateway = [24, 16, 8, 0].map((shift) => Math.floor(gatewayNumber / 2 ** shift) % 256).join('.');
  const controlSubnets = azureRelayResourceSource(source).actions.filter(
    (action) => action.kind === 'subnet-create' && action.resourceId === `${plan.vnetId}/subnets/RouteServerSubnet`,
  );
  require16(controlSubnets.length === 1, 'one saved Route Server control subnet required');
  const controlArgs = controlSubnets[0].args;
  require16(
    controlArgs?.filter((arg) => arg === '--address-prefixes').length === 1,
    'resolved control subnet prefix required',
  );
  const controlCidr = controlArgs?.[(controlArgs?.indexOf('--address-prefixes') ?? -1) + 1] ?? '';
  const [controlNetwork, controlPrefix] = controlCidr.split('/');
  require16(
    canonicalPrefix(controlCidr) &&
      controlPrefix === '26' &&
      server.serviceAddresses.every(
        (address) => ipv42(address) > ipv42(controlNetwork) + 3 && ipv42(address) < ipv42(controlNetwork) + 63,
      ),
    'joined service addresses must belong to the saved control subnet',
  );
  const lines = [
    `frr version ${plan.frr.version}`,
    'frr defaults traditional',
    `hostname ${relay.name}`,
    'log stdout',
    'service integrated-vtysh-config',
    '!',
    `ip route ${controlCidr} ${azureGateway}`,
    '!',
    ...plan.vipPrefixes.map((value, index) => `ip prefix-list XCSH-VIP seq ${(index + 1) * 10} permit ${value}`),
    ...returnPrefixes
      .toSorted()
      .map((value, index) => `ip prefix-list XCSH-RETURN seq ${(index + 1) * 10} permit ${value}`),
    '!',
    'route-map XCSH-VIP permit 10',
    ' match ip address prefix-list XCSH-VIP',
    '!',
    'route-map XCSH-RETURN permit 10',
    ' match ip address prefix-list XCSH-RETURN',
    '!',
    'route-map XCSH-FIB permit 10',
    ' match ip address prefix-list XCSH-VIP',
    '!',
    'route-map XCSH-FIB permit 20',
    ' match ip address prefix-list XCSH-RETURN',
    ` set ip next-hop ${azureGateway}`,
    '!',
    `router bgp ${relay.asn}`,
    ` bgp router-id ${relay.privateAddress}`,
    ' bgp ebgp-requires-policy',
    ' neighbor XCSH-CE peer-group',
    ` neighbor XCSH-CE remote-as ${plan.localAsn}`,
    ...ceEndpoints
      .toSorted((a, b) => a.node - b.node)
      .map((endpoint) => ` neighbor ${endpoint.address} peer-group XCSH-CE`),
    ' neighbor XCSH-RS peer-group',
    ' neighbor XCSH-RS remote-as 65515',
    ' neighbor XCSH-RS ebgp-multihop 2',
    ` neighbor XCSH-RS update-source ${relay.privateAddress}`,
    ...server.serviceAddresses.toSorted().map((address) => ` neighbor ${address} peer-group XCSH-RS`),
    ' !',
    ' address-family ipv4 unicast',
    '  table-map XCSH-FIB',
    '  neighbor XCSH-CE activate',
    '  neighbor XCSH-CE route-map XCSH-VIP in',
    '  neighbor XCSH-CE route-map XCSH-RETURN out',
    '  neighbor XCSH-RS activate',
    '  neighbor XCSH-RS route-map XCSH-RETURN in',
    '  neighbor XCSH-RS route-map XCSH-VIP out',
    ' exit-address-family',
    '!',
  ];
  const config = `${lines.join(`
`)}
`;
  return {
    relayName,
    sourcePlanSha256: source.planSha256,
    relayPlanSha256: plan.planSha256,
    config,
    configSha256: sha256Hex(config),
    ceEndpoints: structuredClone(ceEndpoints),
    forwarding: { azureGateway, controlCidr, policy: 'bgp-to-zebra-table-map', qualified: false },
    returnPrefixes: returnPrefixes.toSorted(),
    sessions: 'unknown',
    traffic: 'unknown',
  };
}

// plugins/azure/src/ce/relay-guest.ts
var require17 = (condition, message) => {
  if (!condition) throw Error(`Azure relay guest: ${message}`);
};
var object17 = (value) => {
  require17(value && typeof value === 'object' && !Array.isArray(value), 'malformed response');
  return value;
};
var activationSource = String.raw`import base64, fcntl, hashlib, json, os, pathlib, re, subprocess, time
mode = payload['mode']
if mode not in ['activate','observe']:
    raise RuntimeError('Guest operation differs')
root = pathlib.Path('/etc/xcsh-relay')
if root.is_symlink() or not root.is_dir() or root.stat().st_uid != 0 or (root / 'frr').is_symlink():
    raise RuntimeError('Guest configuration directory owner differs')
if os.geteuid() != 0:
    raise RuntimeError('Owned guest activation requires root')
lock = open('/run/xcsh-relay-activation.lock', 'a')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
def read(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_uid != 0:
        raise RuntimeError('Guest file owner differs')
    return json.loads(path.read_text())
plan = read(root / 'plan.json')
software = read(root / 'software.json')
for record in [plan, software]:
    if any(record.get(key) != expected[key] for key in ['sourcePlanSha256', 'relayPlanSha256']):
        raise RuntimeError('Guest plan/software owner differs')
if plan.get('relayName') != expected['relayName'] or plan.get('frrImage') != expected['frrImage'] or plan.get('frrVersion') != expected['frrVersion'] or plan.get('docker', {}).get('sha256') != expected['dockerArchiveSha256']:
    raise RuntimeError('Guest saved software differs')
if software.get('status') != 'software-prepared' or software.get('frrImage') != expected['frrImage'] or software.get('dockerArchiveSha256') != expected['dockerArchiveSha256'] or not re.fullmatch(re.escape(expected['frrVersion']) + r'(?:_[a-zA-Z0-9][a-zA-Z0-9._-]*)?', software.get('reportedFrrVersion','')):
    raise RuntimeError('Prepared software identity differs')
docker = '/opt/xcsh-relay/bin/docker'
env = dict(os.environ, DOCKER_HOST='unix:///run/xcsh-relay-docker.sock')
def run(args):
    result = subprocess.run(args, check=True, capture_output=True, text=True, env=env, timeout=60)
    if result.stderr.strip():
        raise RuntimeError('Guest command returned diagnostics')
    return result.stdout
version = run([docker, '--version']).strip()
if not re.fullmatch(r'Docker version ' + re.escape(expected['dockerVersion']) + r', build [a-f0-9]+', version) or version != software.get('dockerBinaryVersion'):
    raise RuntimeError('Current Docker binary differs')
images = json.loads(run([docker, 'image', 'inspect', expected['frrImage']]))
if len(images) != 1 or images[0].get('Id') != software.get('imageId') or expected['frrImage'] not in images[0].get('RepoDigests',[]) or images[0].get('Architecture') != 'amd64' or images[0].get('Os') != 'linux':
    raise RuntimeError('Current immutable image differs')
image_id = images[0]['Id']
if not re.fullmatch(r'sha256:[a-f0-9]{64}', image_id):
    raise RuntimeError('Current image ID is unresolved')
interfaces = json.loads(run(['ip', '-j', '-4', 'address', 'show']))
matching = [value for value in interfaces if value.get('address','').lower() == expected['mac'] and any(ip.get('family') == 'inet' and ip.get('local') == expected['address'] for ip in value.get('addr_info',[]))]
if len(matching) != 1 or not re.fullmatch(r'[a-zA-Z0-9_.:-]{1,32}', matching[0].get('ifname','')):
    raise RuntimeError('Current guest NIC MAC/address differs')
for name in ['daemons','vtysh.conf']:
    path = root / 'frr' / name
    if path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest() != plan.get('daemonFilesSha256',{}).get(name):
        raise RuntimeError('Guest daemon configuration differs')
config = payload['configuration']
if hashlib.sha256(config.encode()).hexdigest() != expected['configSha256']:
    raise RuntimeError('Requested config digest differs')
config_record = {key: expected[key] for key in ['sourcePlanSha256','relayPlanSha256','relayName','configSha256']}
conf_path = root / 'frr' / 'frr.conf'
record_path = root / 'config.json'
for path, content, file_mode in [(conf_path,config,0o644),(record_path,json.dumps(config_record),0o600)]:
    if path.exists() or path.is_symlink():
        if path.is_symlink() or not path.is_file() or path.stat().st_uid != 0:
            raise RuntimeError('Guest configuration file owner differs')
        valid = (read(path) == config_record) if path == record_path else (hashlib.sha256(path.read_bytes()).hexdigest() == expected['configSha256'])
        if not valid:
            raise RuntimeError('Existing guest configuration differs; replacement plan required')
    else:
        if mode == 'observe':
            raise RuntimeError('Guest configuration observation unavailable')
        temporary = path.with_suffix(path.suffix + '.pending')
        if temporary.exists() or temporary.is_symlink():
            if temporary.is_symlink() or not temporary.is_file() or temporary.stat().st_uid != 0 or temporary.read_text() != content:
                raise RuntimeError('Pending guest configuration differs')
        else:
            with open(temporary, 'x') as output:
                output.write(content)
                output.flush()
                os.fsync(output.fileno())
        temporary.chmod(file_mode)
        temporary.replace(path)
        directory = os.open(str(path.parent), os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
if mode == 'activate':
    parser_output = run([docker, 'run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', 'frr', '--entrypoint', '/usr/bin/vtysh', '--mount', 'type=bind,source=/etc/xcsh-relay/frr,target=/etc/frr,readonly', image_id, '--config_dir', '/etc/frr', '-C', '-f', '/etc/frr/frr.conf'])
    if parser_output.strip():
        raise RuntimeError('Guest configuration parser returned diagnostics')
active = subprocess.run(['systemctl','is-active','--quiet','xcsh-relay.service'], capture_output=True, text=True, timeout=15)
if active.returncode not in [0,3]:
    raise RuntimeError('Guest service state unavailable')
if active.returncode == 3:
    if mode == 'observe':
        raise RuntimeError('Guest service observation is inactive')
    run(['systemctl','start','xcsh-relay.service'])
run(['systemctl','is-active','--quiet','xcsh-relay.service'])
deadline = time.monotonic() + 30
while True:
    current = subprocess.run([docker,'container','inspect','xcsh-relay-frr'], capture_output=True, text=True, env=env, timeout=15)
    if current.returncode == 0 and not current.stderr.strip():
        containers = json.loads(current.stdout)
        if len(containers) == 1 and containers[0].get('State',{}).get('Running') is True:
            candidate_id = containers[0].get('Id','')
            if not re.fullmatch(r'[a-f0-9]{64}', candidate_id) or containers[0].get('Image') != image_id:
                raise RuntimeError('Current routing container identity differs')
            probe = subprocess.run([docker,'exec',candidate_id,'/usr/bin/vtysh','-c','show daemons'], capture_output=True, text=True, env=env, timeout=15)
            daemons = probe.stdout.split()
            if probe.returncode == 0 and not probe.stderr.strip() and len(daemons) == len(set(daemons)) and set(daemons) == set(${JSON.stringify(relayDaemons)}):
                break
            if mode == 'observe':
                raise RuntimeError('Current routing daemon observation unavailable')
    elif current.returncode != 1 or not re.fullmatch(r'Error(?: response from daemon)?: No such (?:container|object): xcsh-relay-frr', current.stderr.strip()):
        raise RuntimeError('Current container observation unavailable')
    if time.monotonic() >= deadline:
        raise RuntimeError('Current routing container has not started')
    time.sleep(1)
if len(containers) != 1:
    raise RuntimeError('Current routing container missing or duplicated')
container = containers[0]
host = container.get('HostConfig',{})
capabilities = set(${JSON.stringify(relayCapabilities)})
reported_caps = host.get('CapAdd',[])
if not isinstance(reported_caps,list) or any(not isinstance(cap,str) for cap in reported_caps):
    raise RuntimeError('Current routing capabilities malformed')
normalized_caps = [cap.removeprefix('CAP_') for cap in reported_caps]
if len(normalized_caps) != len(set(normalized_caps)) or set(normalized_caps) != capabilities:
    raise RuntimeError('Current routing capabilities differ')
if host.get('Tmpfs') != ${JSON.stringify(relayTmpfs)} or sorted(host.get('GroupAdd',[])) != sorted(${JSON.stringify(relayGroups)}):
    raise RuntimeError('Current routing writable layout/groups differ')
runtime_config = container.get('Config',{})
if runtime_config.get('Entrypoint') != ['/sbin/tini','--'] or runtime_config.get('Cmd') != ['/usr/lib/frr/docker-start'] or runtime_config.get('User') not in ['', 'root', '0']:
    raise RuntimeError('Current routing entrypoint differs')
if container.get('Image') != image_id or container.get('State',{}).get('Running') is not True or host.get('NetworkMode') != 'host' or host.get('ReadonlyRootfs') is not True or host.get('Privileged') is not False or host.get('CapDrop') != ['ALL'] or host.get('SecurityOpt') not in [['no-new-privileges'], ['no-new-privileges=true']]:
    raise RuntimeError('Current routing container identity/capabilities differ')
mounts = [mount for mount in container.get('Mounts',[]) if mount.get('Destination') == '/etc/frr']
if len(mounts) != 1 or mounts[0].get('Source') != str(root / 'frr') or mounts[0].get('RW') is not False:
    raise RuntimeError('Current routing container config mount differs')
container_id = container.get('Id','')
if not re.fullmatch(r'[a-f0-9]{64}', container_id):
    raise RuntimeError('Current container identity unavailable')
receipt = dict(expected, status='configured', imageId=image_id, interfaceName=matching[0]['ifname'], containerId=container_id)
print('XCSH_RELAY_RECEIPT:' + expected['nonce'] + ':' + json.dumps(receipt, separators=(',',':')))
`;
function compileAzureRelayGuestActivation(source, plan, relayName, server, ceEndpoints, nonce) {
  require17(/^[a-f0-9]{32}$/.test(nonce), 'resolved response nonce required');
  const configuration = compileAzureRelayFrrConfig(source, plan, relayName, server, ceEndpoints, plan.returnPrefixes);
  const relay = server.relays.find((item) => item.name === relayName);
  require17(relay && /^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(relay.mac), 'joined relay MAC required');
  if (!relay) throw Error('Azure relay guest: relay missing');
  const expected = {
    nonce,
    sourcePlanSha256: source.planSha256,
    relayPlanSha256: plan.planSha256,
    relayName,
    vmId: relay.vmId,
    nicId: relay.nicId,
    mac: relay.mac,
    address: relay.address,
    configSha256: configuration.configSha256,
    frrImage: plan.frr.image,
    frrVersion: plan.frr.version,
    dockerVersion: plan.docker.version,
    dockerArchiveSha256: plan.docker.sha256,
  };
  return guestRequest(expected, configuration.config, 'activate');
}
function guestRequest(expected, configuration, mode) {
  const payload = { expected, configuration, mode };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
  const python = `import base64, json
payload = json.loads(base64.b64decode('${encoded}'))
expected = payload['expected']
${activationSource}`;
  const script = `python3 - <<'XCSH_RELAY_GUEST'
${python}XCSH_RELAY_GUEST`;
  const body = { commandId: 'RunShellScript', script: [script] };
  const subscription = expected.vmId.split('/')[2];
  const args = [
    'vm',
    'run-command',
    'invoke',
    '--ids',
    expected.vmId,
    '--command-id',
    body.commandId,
    '--scripts',
    script,
    '--subscription',
    subscription,
    '--output',
    'json',
  ];
  return {
    expected: structuredClone(expected),
    configuration,
    mode,
    body,
    args,
    python,
    requestSha256: canonicalSha256({ expected, body, args, configuration, mode }),
  };
}
function compileAzureRelayGuestObservation(activation) {
  verifyRequest(activation);
  require17(activation.mode === 'activate', 'activation request required for recovery');
  return guestRequest(activation.expected, activation.configuration, 'observe');
}
function verifyRequest(request) {
  require17(
    request.requestSha256 ===
      canonicalSha256({
        expected: request.expected,
        body: request.body,
        args: request.args,
        configuration: request.configuration,
        mode: request.mode,
      }) && sha256Hex(request.configuration) === request.expected.configSha256,
    'request integrity differs',
  );
}
function parseAzureRelayGuestReceipt(request, raw) {
  verifyRequest(request);
  const result = object17(raw);
  require17(
    !result.nextLink && !result.error && Array.isArray(result.value) && result.value.length === 2,
    'complete guest stdout/stderr required',
  );
  const values = result.value.map(object17);
  const stdout = values.filter((value) => value.code === 'ComponentStatus/StdOut/succeeded' && value.level === 'Info');
  const stderr = values.filter((value) => value.code === 'ComponentStatus/StdErr/succeeded' && value.level === 'Info');
  require17(
    stdout.length === 1 &&
      stderr.length === 1 &&
      typeof stdout[0].message === 'string' &&
      typeof stderr[0].message === 'string' &&
      !stderr[0].message.trim(),
    'guest command evidence unavailable or contains diagnostics',
  );
  const prefix = `XCSH_RELAY_RECEIPT:${request.expected.nonce}:`;
  const lines = stdout[0].message.trim().split(`
`);
  require17(lines.length === 1 && lines[0].startsWith(prefix), 'one nonce-bound guest receipt required');
  const value = object17(JSON.parse(lines[0].slice(prefix.length)));
  require17(
    Object.keys(value).sort().join(',') ===
      [...Object.keys(request.expected), 'status', 'imageId', 'interfaceName', 'containerId'].sort().join(','),
    'unexpected guest receipt fields',
  );
  for (const [key, expected] of Object.entries(request.expected))
    require17(value[key] === expected, 'guest receipt identity differs');
  require17(
    value.status === 'configured' &&
      typeof value.imageId === 'string' &&
      /^sha256:[a-f0-9]{64}$/.test(value.imageId) &&
      typeof value.containerId === 'string' &&
      /^[a-f0-9]{64}$/.test(value.containerId) &&
      typeof value.interfaceName === 'string' &&
      /^[a-zA-Z0-9_.:-]{1,32}$/.test(value.interfaceName),
    'current guest runtime identity unavailable',
  );
  return {
    ...request.expected,
    imageId: String(value.imageId),
    containerId: String(value.containerId),
    interfaceName: String(value.interfaceName),
    status: 'configured',
    requestSha256: request.requestSha256,
    observedAt: new Date().toISOString(),
    routing: 'unknown',
    traffic: 'unknown',
    ceSampleFreshnessQualified: false,
  };
}

// plugins/azure/src/ce/relay-guest-sessions.ts
var require18 = (value, message) => {
  if (!value) throw Error(`Azure relay guest sessions: ${message}`);
};
var object18 = (value) => {
  require18(value && typeof value === 'object' && !Array.isArray(value), 'malformed session evidence');
  return value;
};
function compileAzureRelayGuestSessions(source, plan, relayName, identity, ceEndpoints, nonce, outage) {
  if (outage !== undefined)
    require18(
      outage &&
        Object.keys(outage).join(',') === 'nodeIndex' &&
        source.topology.ha &&
        source.topology.nodeCount === 3 &&
        ceEndpoints.length === 3 &&
        Number.isInteger(outage.nodeIndex) &&
        outage.nodeIndex >= 1 &&
        outage.nodeIndex <= 3 &&
        ceEndpoints.filter((row) => row.node === outage.nodeIndex).length === 1,
      'one selected node of a complete three-node HA peer scope required',
    );
  require18(plan.frr.version === '10.4.1', 'FRR neighbor mapping requires the qualified 10.4.1 version');
  const activation = compileAzureRelayGuestActivation(source, plan, relayName, identity, ceEndpoints, nonce);
  const observation = compileAzureRelayGuestObservation(activation);
  const relay = plan.relays.find((row) => row.name === relayName);
  if (!relay) throw Error('Azure relay guest sessions: relay is absent');
  const peers = [
    ...ceEndpoints.toSorted((a, b) => a.node - b.node).map((row) => ({ address: row.address, asn: plan.localAsn })),
    ...identity.serviceAddresses.toSorted().map((address) => ({ address, asn: 65515 })),
  ];
  const unavailablePeer =
    outage === undefined
      ? undefined
      : {
          nodeIndex: outage.nodeIndex,
          address: ceEndpoints.find((row) => row.node === outage.nodeIndex)?.address,
          states: ['Idle', 'Connect', 'Active'],
        };
  const sessionBinding = {
    localAsn: relay.asn,
    localAddress: relay.privateAddress,
    peers,
    ...(unavailablePeer ? { unavailablePeer } : {}),
  };
  const encoded = Buffer.from(JSON.stringify(sessionBinding)).toString('base64');
  const original = "print('XCSH_RELAY_RECEIPT:' + expected['nonce'] + ':' + json.dumps(receipt, separators=(',',':')))";
  require18(observation.python.split(original).length === 2, 'guest base program mapping differs');
  const readback = `binding = json.loads(base64.b64decode('${encoded}'))
neighbors = json.loads(run([docker,'exec',container_id,'/usr/bin/vtysh','-c','show bgp ipv4 neighbors json']))
if not isinstance(neighbors, dict) or sorted(neighbors) != sorted(peer['address'] for peer in binding['peers']):
    raise RuntimeError('FRR neighbor scope is missing or foreign')
sessions = []
for peer in binding['peers']:
    current = neighbors[peer['address']]
    wanted_states = binding['unavailablePeer']['states'] if peer['address'] == binding.get('unavailablePeer',{}).get('address') else ['Established']
    if not isinstance(current, dict) or current.get('localAs') != binding['localAsn'] or current.get('remoteAs') != peer['asn'] or current.get('localRouterId') != binding['localAddress'] or current.get('hostLocal') != binding['localAddress'] or current.get('hostForeign') != peer['address'] or current.get('bgpVersion') != 4 or current.get('adminShutDown', False) is not False or current.get('bgpState') not in wanted_states:
        raise RuntimeError('FRR current neighbor identity or establishment differs')
    session = dict(address=peer['address'],localAs=current['localAs'],remoteAs=current['remoteAs'],localRouterId=current['localRouterId'],hostLocal=current['hostLocal'],hostForeign=current['hostForeign'],bgpVersion=current['bgpVersion'],state=current['bgpState'])
    if 'unavailablePeer' in binding:
        session['adminShutDown'] = current.get('adminShutDown', False)
    sessions.append(session)
final = json.loads(run([docker,'container','inspect','xcsh-relay-frr']))
if len(final) != 1 or final[0].get('Id') != container_id or final[0].get('Image') != image_id or final[0].get('State',{}).get('Running') is not True:
    raise RuntimeError('FRR container changed during session collection')
print('XCSH_RELAY_SESSIONS:' + expected['nonce'] + ':' + json.dumps(dict(guest=receipt,sessions=sessions), separators=(',',':')))
`;
  const python = observation.python.replace(original, readback.trimEnd());
  const script = `python3 - <<'XCSH_RELAY_GUEST'
${python}XCSH_RELAY_GUEST`;
  const body = { commandId: 'RunShellScript', script: [script] };
  const args = [...observation.args];
  args[args.indexOf('--scripts') + 1] = script;
  const draft = { expected: observation.expected, sessionBinding, body, args, python, observation };
  return { ...draft, requestSha256: canonicalSha256(draft) };
}
function parseAzureRelayGuestSessions(request, raw) {
  const { requestSha256, ...draft } = request;
  require18(requestSha256 === canonicalSha256(draft), 'request integrity differs');
  const result = object18(raw);
  require18(
    Object.keys(result).every((key) => ['value', 'name', 'startTime', 'endTime'].includes(key)) &&
      Array.isArray(result.value) &&
      result.value.length === 2,
    'complete public command result required',
  );
  const values = result.value.map(object18);
  const stdout = values.filter((row) => row.code === 'ComponentStatus/StdOut/succeeded' && row.level === 'Info');
  const stderr = values.filter((row) => row.code === 'ComponentStatus/StdErr/succeeded' && row.level === 'Info');
  require18(
    stdout.length === 1 &&
      stderr.length === 1 &&
      typeof stdout[0].message === 'string' &&
      typeof stderr[0].message === 'string' &&
      !stderr[0].message.trim(),
    'session command evidence unavailable',
  );
  const prefix = `XCSH_RELAY_SESSIONS:${request.expected.nonce}:`;
  const lines = stdout[0].message.trim().split(`
`);
  require18(lines.length === 1 && lines[0].startsWith(prefix), 'one nonce-bound session receipt required');
  const payload = object18(JSON.parse(lines[0].slice(prefix.length)));
  require18(Object.keys(payload).sort().join(',') === 'guest,sessions', 'unexpected session receipt fields');
  const guest = parseAzureRelayGuestReceipt(request.observation, {
    value: [
      {
        code: 'ComponentStatus/StdOut/succeeded',
        level: 'Info',
        message: `XCSH_RELAY_RECEIPT:${request.expected.nonce}:${JSON.stringify(payload.guest)}`,
      },
      { code: 'ComponentStatus/StdErr/succeeded', level: 'Info', message: '' },
    ],
  });
  require18(
    Array.isArray(payload.sessions) && payload.sessions.length === request.sessionBinding.peers.length,
    'complete FRR session scope required',
  );
  const sessions = payload.sessions.map(object18);
  const unavailable = request.sessionBinding.unavailablePeer;
  if (unavailable)
    require18(
      Object.keys(unavailable).sort().join(',') === 'address,nodeIndex,states' &&
        Number.isInteger(unavailable.nodeIndex) &&
        unavailable.nodeIndex >= 1 &&
        unavailable.nodeIndex <= 3 &&
        request.sessionBinding.peers.length === 5 &&
        request.sessionBinding.peers[unavailable.nodeIndex - 1].address === unavailable.address &&
        canonicalSha256(unavailable.states) === canonicalSha256(['Idle', 'Connect', 'Active']),
      'selected outage peer expectation differs',
    );
  for (const peer of request.sessionBinding.peers) {
    const rows = sessions.filter((row) => row.address === peer.address);
    require18(rows.length === 1, 'missing or duplicate FRR neighbor');
    const row = rows[0];
    require18(
      Object.keys(row).sort().join(',') ===
        (unavailable
          ? 'address,adminShutDown,bgpVersion,hostForeign,hostLocal,localAs,localRouterId,remoteAs,state'
          : 'address,bgpVersion,hostForeign,hostLocal,localAs,localRouterId,remoteAs,state') &&
        row.localAs === request.sessionBinding.localAsn &&
        row.remoteAs === peer.asn &&
        row.localRouterId === request.sessionBinding.localAddress &&
        row.hostLocal === request.sessionBinding.localAddress &&
        row.hostForeign === peer.address &&
        row.bgpVersion === 4 &&
        (unavailable?.address === peer.address
          ? unavailable.states.includes(row.state)
          : row.state === 'Established') &&
        (!unavailable || row.adminShutDown === false),
      'current FRR session identity or establishment differs',
    );
  }
  return {
    status: 'observed',
    ...(unavailable
      ? {
          outage: {
            nodeIndex: unavailable.nodeIndex,
            address: unavailable.address,
            state: sessions.find((row) => row.address === unavailable.address)?.state,
            ceEstablishedSessions: 2,
            routeServerEstablishedSessions: 2,
          },
        }
      : {}),
    source: 'current-frr-neighbor-readback',
    guest,
    sessions,
    requestSha256,
    collectedAt: new Date().toISOString(),
    routeExchange: 'unknown',
    traffic: 'unknown',
    freshness: 'unqualified',
    ceSampleFreshnessQualified: false,
  };
}

// plugins/azure/src/ce/relay-guest-routes.ts
var require19 = (value, message) => {
  if (!value) throw Error(`Azure relay guest routes: ${message}`);
};
var object19 = (value) => {
  require19(value && typeof value === 'object' && !Array.isArray(value), 'malformed route evidence');
  return value;
};
function compileAzureRelayGuestRoute(
  source,
  plan,
  relayName,
  identity,
  ceEndpoints,
  nonce,
  direction,
  prefix,
  peerAddress,
  outage,
) {
  const sessionRequest = compileAzureRelayGuestSessions(source, plan, relayName, identity, ceEndpoints, nonce, outage);
  require19(['received', 'advertised'].includes(direction), 'explicit route direction required');
  const target = sessionRequest.sessionBinding.peers.find((peer) => peer.address === peerAddress);
  const vip = plan.vipPrefixes.includes(prefix);
  const returning = plan.returnPrefixes.includes(prefix);
  require19(
    vip !== returning &&
      (direction === 'received'
        ? peerAddress === undefined
        : target &&
          target.address !== sessionRequest.sessionBinding.unavailablePeer?.address &&
          (target.asn === 65515 ? vip : returning)),
    'planned prefix and exact advertised peer policy required',
  );
  const sourcePeers = sessionRequest.sessionBinding.peers.filter(
    (peer) =>
      (vip ? peer.asn !== 65515 : peer.asn === 65515) &&
      peer.address !== sessionRequest.sessionBinding.unavailablePeer?.address,
  );
  const command =
    direction === 'received'
      ? 'show bgp ipv4 unicast json'
      : `show bgp ipv4 unicast neighbors ${peerAddress} advertised-routes json`;
  const routeBinding = {
    direction,
    prefix,
    peerAddress: peerAddress ?? null,
    sourcePeers,
    command,
    localAsn: sessionRequest.sessionBinding.localAsn,
    localAddress: sessionRequest.sessionBinding.localAddress,
  };
  const encoded = Buffer.from(JSON.stringify(routeBinding)).toString('base64');
  const original =
    "print('XCSH_RELAY_SESSIONS:' + expected['nonce'] + ':' + json.dumps(dict(guest=receipt,sessions=sessions), separators=(',',':')))";
  require19(sessionRequest.python.split(original).length === 2, 'session program mapping differs');
  const readback = `route_binding = json.loads(base64.b64decode('${encoded}'))
table = json.loads(run([docker,'exec',container_id,'/usr/bin/vtysh','-c',route_binding['command']]))
if not isinstance(table, dict) or any(table.get(key) for key in ['error','errors','nextLink','next_page_token']):
    raise RuntimeError('Route read unavailable or partial')
if table.get('localAS') != route_binding['localAsn']:
    raise RuntimeError('Route table ASN differs')
source_asns = {peer['asn'] for peer in route_binding['sourcePeers']}
if len(source_asns) != 1:
    raise RuntimeError('Route source policy is ambiguous')
source_asn = next(iter(source_asns))
def path_matches(value):
    return isinstance(value,str) and re.fullmatch(str(source_asn) + r'(?: ' + str(source_asn) + r')*', value) is not None
if route_binding['direction'] == 'received':
    routes = table.get('routes')
    if table.get('routerId') != route_binding['localAddress'] or table.get('vrfName') != 'default' or not isinstance(routes,dict) or type(table.get('totalRoutes')) is not int or table['totalRoutes'] != len(routes) or any(not isinstance(paths,list) for paths in routes.values()) or type(table.get('totalPaths')) is not int or table['totalPaths'] != sum(len(paths) for paths in routes.values()):
        raise RuntimeError('Received route table scope differs')
    paths = routes.get(route_binding['prefix'])
    if not isinstance(paths,list) or not paths or any(not isinstance(path,dict) for path in paths) or len({json.dumps({key:path.get(key) for key in ['peerId','path','nexthops']},sort_keys=True) for path in paths}) != len(paths):
        raise RuntimeError('Received prefix is missing, malformed or duplicate')
    best = [path for path in paths if path.get('bestpath') is True]
    if len(best) != 1:
        raise RuntimeError('One selected received path required')
    path = best[0]
    peers = [peer for peer in route_binding['sourcePeers'] if peer['address'] == path.get('peerId')]
    nexthops = path.get('nexthops')
    if len(peers) != 1 or path.get('network') != route_binding['prefix'] or path.get('valid') is not True or any(path.get(key,False) is not False for key in ['stale','removed','suppressed','history','damped','unsorted']) or not path_matches(path.get('path')) or not isinstance(nexthops,list) or len(nexthops) != 1 or not isinstance(nexthops[0],dict) or nexthops[0].get('ip') != peers[0]['address'] or nexthops[0].get('afi') != 'ipv4' or nexthops[0].get('used') is not True:
        raise RuntimeError('Selected received path source or next hop differs')
    route = dict(direction='received',prefix=route_binding['prefix'],peerAddress=peers[0]['address'],asn=source_asn,path=path['path'],nextHop=nexthops[0]['ip'],nextHopEncoding='explicit',selected=True)
else:
    routes = table.get('advertisedRoutes')
    if table.get('bgpLocalRouterId') != route_binding['localAddress'] or not isinstance(routes,dict) or type(table.get('totalPrefixCounter')) is not int or table['totalPrefixCounter'] != len(routes):
        raise RuntimeError('Advertised route scope differs')
    path = routes.get(route_binding['prefix'])
    if not isinstance(path,dict) or path.get('network') != route_binding['prefix'] or path.get('valid') is not True or path.get('best') is not True or not path_matches(path.get('path')) or path.get('nextHop') not in ['0.0.0.0',route_binding['localAddress']]:
        raise RuntimeError('Advertised prefix policy or next-hop encoding differs')
    route = dict(direction='advertised',prefix=route_binding['prefix'],peerAddress=route_binding['peerAddress'],asn=source_asn,path=path['path'],nextHop=path['nextHop'],nextHopEncoding='implicit-self' if path['nextHop']=='0.0.0.0' else 'explicit-self',selected=True)
final = json.loads(run([docker,'container','inspect','xcsh-relay-frr']))
if len(final) != 1 or final[0].get('Id') != container_id or final[0].get('Image') != image_id or final[0].get('State',{}).get('Running') is not True:
    raise RuntimeError('FRR container changed during route collection')
print('XCSH_RELAY_ROUTE:' + expected['nonce'] + ':' + json.dumps(dict(session=dict(guest=receipt,sessions=sessions),route=route), separators=(',',':')))
`;
  const python = sessionRequest.python.replace(original, readback.trimEnd());
  const script = `python3 - <<'XCSH_RELAY_GUEST'
${python}XCSH_RELAY_GUEST`;
  const body = { commandId: 'RunShellScript', script: [script] };
  const args = [...sessionRequest.args];
  args[args.indexOf('--scripts') + 1] = script;
  const draft = { sessionRequest, routeBinding, python, body, args };
  return { ...draft, requestSha256: canonicalSha256(draft) };
}
function parseAzureRelayGuestRoute(request, raw) {
  const { requestSha256, ...draft } = request;
  require19(requestSha256 === canonicalSha256(draft), 'request integrity differs');
  const value = object19(raw);
  require19(
    !value.error && !value.nextLink && Array.isArray(value.value) && value.value.length === 2,
    'complete public command result required',
  );
  const entries = value.value.map(object19);
  const stdout = entries.filter((row) => row.code === 'ComponentStatus/StdOut/succeeded' && row.level === 'Info');
  const stderr = entries.filter((row) => row.code === 'ComponentStatus/StdErr/succeeded' && row.level === 'Info');
  require19(
    stdout.length === 1 &&
      stderr.length === 1 &&
      typeof stdout[0].message === 'string' &&
      typeof stderr[0].message === 'string' &&
      !stderr[0].message.trim(),
    'route command unavailable or has diagnostics',
  );
  const nonce = request.sessionRequest.expected.nonce;
  const prefix = `XCSH_RELAY_ROUTE:${nonce}:`;
  const lines = stdout[0].message.trim().split(`
`);
  require19(lines.length === 1 && lines[0].startsWith(prefix), 'one nonce-bound route receipt required');
  const payload = object19(JSON.parse(lines[0].slice(prefix.length)));
  require19(Object.keys(payload).sort().join(',') === 'route,session', 'unexpected route receipt fields');
  const session = parseAzureRelayGuestSessions(request.sessionRequest, {
    value: [
      {
        code: 'ComponentStatus/StdOut/succeeded',
        level: 'Info',
        message: `XCSH_RELAY_SESSIONS:${nonce}:${JSON.stringify(payload.session)}`,
      },
      { code: 'ComponentStatus/StdErr/succeeded', level: 'Info', message: '' },
    ],
  });
  const route = object19(payload.route);
  const binding = request.routeBinding;
  const asn = binding.sourcePeers[0].asn;
  require19(
    Object.keys(route).sort().join(',') === 'asn,direction,nextHop,nextHopEncoding,path,peerAddress,prefix,selected' &&
      route.direction === binding.direction &&
      route.prefix === binding.prefix &&
      route.asn === asn &&
      typeof route.path === 'string' &&
      new RegExp(`^${asn}(?: ${asn})*$`).test(route.path) &&
      route.selected === true,
    'route identity or source path differs',
  );
  if (binding.direction === 'received')
    require19(
      binding.sourcePeers.some((peer) => peer.address === route.peerAddress) &&
        route.nextHop === route.peerAddress &&
        route.nextHopEncoding === 'explicit',
      'received source/next hop differs',
    );
  else
    require19(
      route.peerAddress === binding.peerAddress &&
        ((route.nextHop === '0.0.0.0' && route.nextHopEncoding === 'implicit-self') ||
          (route.nextHop === binding.localAddress && route.nextHopEncoding === 'explicit-self')),
      'advertised peer/encoding differs',
    );
  return {
    status: 'observed',
    source: 'current-frr-route-membership',
    session,
    route,
    requestSha256,
    collectedAt: new Date().toISOString(),
    fib: 'unknown',
    traffic: 'unknown',
    freshness: 'unqualified',
    ceSampleFreshnessQualified: false,
  };
}

// plugins/azure/src/ce/relay-guest-fib.ts
var require20 = (value, message) => {
  if (!value) throw Error(`Azure relay guest FIB: ${message}`);
};
var object20 = (value) => {
  require20(value && typeof value === 'object' && !Array.isArray(value), 'malformed evidence');
  return value;
};
function compileAzureRelayGuestFib(...args) {
  const routeRequest = compileAzureRelayGuestRoute(...args);
  require20(routeRequest.routeBinding.direction === 'received', 'received route required for FIB observation');
  const [source, plan] = args;
  const returning = plan.returnPrefixes.includes(routeRequest.routeBinding.prefix);
  const subnet = plan.sloCidr
    .split('/')[0]
    .split('.')
    .reduce((sum, octet) => sum * 256 + Number(octet), 0);
  const gateway = [24, 16, 8, 0].map((shift) => Math.floor((subnet + 1) / 2 ** shift) % 256).join('.');
  const fibBinding = {
    prefix: routeRequest.routeBinding.prefix,
    returning,
    azureGateway: gateway,
    sourcePlanSha256: source.planSha256,
  };
  const encoded = Buffer.from(JSON.stringify(fibBinding)).toString('base64');
  const original =
    "print('XCSH_RELAY_ROUTE:' + expected['nonce'] + ':' + json.dumps(dict(session=dict(guest=receipt,sessions=sessions),route=route), separators=(',',':')))";
  require20(routeRequest.python.split(original).length === 2, 'route program mapping differs');
  const readback = `fib_binding = json.loads(base64.b64decode('${encoded}'))
installed = json.loads(run([docker,'exec',container_id,'/usr/bin/vtysh','-c','show ip route ' + fib_binding['prefix'] + ' json']))
if not isinstance(installed,dict) or set(installed) != {fib_binding['prefix']}:
    raise RuntimeError('Exact Zebra prefix unavailable or partial')
paths = installed[fib_binding['prefix']]
if not isinstance(paths,list) or len(paths) != 1 or not isinstance(paths[0],dict):
    raise RuntimeError('One exact Zebra route required')
zebra = paths[0]
next_hop = fib_binding['azureGateway'] if fib_binding['returning'] else route['nextHop']
if zebra.get('prefix') != fib_binding['prefix'] or zebra.get('protocol') != 'bgp' or zebra.get('vrfId') != 0 or zebra.get('vrfName') != 'default' or zebra.get('table') != 254 or any(zebra.get(key) is not True for key in ['selected','destSelected','installed']):
    raise RuntimeError('Zebra selected installation differs')
nexthops = zebra.get('nexthops')
if not isinstance(nexthops,list) or len(nexthops) != 1 or not isinstance(nexthops[0],dict):
    raise RuntimeError('One exact Zebra next hop required')
hop = nexthops[0]
if hop.get('ip') != next_hop or hop.get('afi') != 'ipv4' or hop.get('active') is not True or hop.get('fib') is not True or hop.get('interfaceName') != receipt['interfaceName']:
    raise RuntimeError('Zebra next hop/device installation differs')
def exact_prefix(value):
    return value == fib_binding['prefix'] or (fib_binding['prefix'].endswith('/32') and value == fib_binding['prefix'][:-3])
kernel = json.loads(run(['ip','-j','-4','route','show','table','main','exact',fib_binding['prefix']]))
if not isinstance(kernel,list) or len(kernel) != 1 or not isinstance(kernel[0],dict):
    raise RuntimeError('One exact kernel route required; default fallback cannot pass')
entry = kernel[0]
if not exact_prefix(entry.get('dst')) or entry.get('gateway') != next_hop or entry.get('dev') != receipt['interfaceName'] or entry.get('protocol') not in ['bgp','186',186] or entry.get('flags') != [] or entry.get('type','unicast') != 'unicast' or entry.get('table','main') not in ['main',254] or 'multipath' in entry or 'nexthops' in entry:
    raise RuntimeError('Kernel BGP prefix/next-hop/device differs')
probe_address = fib_binding['prefix'].split('/')[0]
lookup = json.loads(run(['ip','-j','-4','route','get',probe_address]))
if not isinstance(lookup,list) or len(lookup) != 1 or not isinstance(lookup[0],dict):
    raise RuntimeError('One kernel route lookup required')
result = lookup[0]
if result.get('dst') != probe_address or result.get('gateway') != next_hop or result.get('dev') != receipt['interfaceName'] or result.get('prefsrc') != expected['address'] or result.get('flags') != [] or result.get('type','unicast') != 'unicast' or result.get('table','main') not in ['main',254] or 'multipath' in result:
    raise RuntimeError('Kernel lookup path/source differs')
interfaces = json.loads(run(['ip','-j','-4','address','show']))
joined = [item for item in interfaces if item.get('ifname') == receipt['interfaceName'] and item.get('address','').lower() == expected['mac'] and any(address.get('family') == 'inet' and address.get('local') == expected['address'] for address in item.get('addr_info',[]))]
if len(joined) != 1 or type(joined[0].get('ifindex')) is not int or hop.get('interfaceIndex') != joined[0]['ifindex']:
    raise RuntimeError('Kernel/Zebra physical interface join changed')
final = json.loads(run([docker,'container','inspect','xcsh-relay-frr']))
if len(final) != 1 or final[0].get('Id') != container_id or final[0].get('Image') != image_id or final[0].get('State',{}).get('Running') is not True:
    raise RuntimeError('FRR container changed during FIB collection')
fib = dict(prefix=fib_binding['prefix'],nextHop=next_hop,interfaceName=receipt['interfaceName'],interfaceIndex=joined[0]['ifindex'],protocol='bgp',table=254,installed=True,lookupAddress=probe_address,sourceAddress=expected['address'])
print('XCSH_RELAY_FIB:' + expected['nonce'] + ':' + json.dumps(dict(membership=dict(session=dict(guest=receipt,sessions=sessions),route=route),fib=fib),separators=(',',':')))
`;
  const python = routeRequest.python.replace(original, readback.trimEnd());
  const script = `python3 - <<'XCSH_RELAY_GUEST'
${python}XCSH_RELAY_GUEST`;
  const body = { commandId: 'RunShellScript', script: [script] };
  const commandArgs = [...routeRequest.args];
  commandArgs[commandArgs.indexOf('--scripts') + 1] = script;
  const draft = { routeRequest, fibBinding, python, body, args: commandArgs };
  return { ...draft, requestSha256: canonicalSha256(draft) };
}
function parseAzureRelayGuestFib(request, raw) {
  const { requestSha256, ...draft } = request;
  require20(requestSha256 === canonicalSha256(draft), 'request integrity differs');
  const value = object20(raw);
  require20(
    !value.error && !value.nextLink && Array.isArray(value.value) && value.value.length === 2,
    'complete public response required',
  );
  const entries = value.value.map(object20);
  const stdout = entries.filter((entry) => entry.code === 'ComponentStatus/StdOut/succeeded' && entry.level === 'Info');
  const stderr = entries.filter((entry) => entry.code === 'ComponentStatus/StdErr/succeeded' && entry.level === 'Info');
  require20(
    stdout.length === 1 &&
      stderr.length === 1 &&
      typeof stdout[0].message === 'string' &&
      typeof stderr[0].message === 'string' &&
      !stderr[0].message.trim(),
    'command unavailable or contains diagnostics',
  );
  const nonce = request.routeRequest.sessionRequest.expected.nonce;
  const marker = `XCSH_RELAY_FIB:${nonce}:`;
  const lines = stdout[0].message.trim().split(`
`);
  require20(lines.length === 1 && lines[0].startsWith(marker), 'one nonce-bound FIB receipt required');
  const payload = object20(JSON.parse(lines[0].slice(marker.length)));
  require20(Object.keys(payload).sort().join(',') === 'fib,membership', 'unexpected receipt fields');
  const membership = parseAzureRelayGuestRoute(request.routeRequest, {
    value: [
      {
        code: 'ComponentStatus/StdOut/succeeded',
        level: 'Info',
        message: `XCSH_RELAY_ROUTE:${nonce}:${JSON.stringify(payload.membership)}`,
      },
      { code: 'ComponentStatus/StdErr/succeeded', level: 'Info', message: '' },
    ],
  });
  const fib = object20(payload.fib);
  const binding = request.fibBinding;
  const guest = object20(membership.session.guest);
  require20(
    Object.keys(fib).sort().join(',') ===
      'installed,interfaceIndex,interfaceName,lookupAddress,nextHop,prefix,protocol,sourceAddress,table' &&
      fib.prefix === binding.prefix &&
      fib.nextHop === (binding.returning ? binding.azureGateway : membership.route.nextHop) &&
      fib.interfaceName === guest.interfaceName &&
      Number.isInteger(fib.interfaceIndex) &&
      fib.interfaceIndex > 0 &&
      fib.protocol === 'bgp' &&
      fib.table === 254 &&
      fib.installed === true &&
      fib.lookupAddress === binding.prefix.split('/')[0] &&
      fib.sourceAddress === guest.address,
    'FIB receipt identity or installed path differs',
  );
  return {
    status: 'observed',
    source: 'current-linux-fib',
    membership,
    fib,
    requestSha256,
    collectedAt: new Date().toISOString(),
    traffic: 'unknown',
    ceSampleFreshnessQualified: false,
  };
}

// plugins/azure/src/ce/relay-artifact-provenance.ts
var azureRelayHistoricalArtifacts = new Set([
  'relay-routing-workflow.json',
  'platform-relay-routing.json',
  'relay-routing-configuration.json',
  'relay-routing-observation.json',
]);
var require21 = (condition, message) => {
  if (!condition) throw Error(`Azure relay artifact provenance: ${message}`);
};
var object21 = (value) => {
  require21(value && typeof value === 'object' && !Array.isArray(value), 'malformed record');
  return value;
};
var array3 = (value) => {
  require21(Array.isArray(value), 'malformed list');
  return value.map(object21);
};
var keys = (value, expected) =>
  require21(Object.keys(value).sort().join(',') === expected.toSorted().join(','), 'record fields differ');
var sha2 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
var text2 = (value) => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(value);
var timestamp = (value) =>
  require21(
    typeof value === 'string' && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now(),
    'historical collection timestamp differs',
  );
var same9 = canonicalEqual;
var rawResult = (marker, nonce, payload) => ({
  value: [
    {
      code: 'ComponentStatus/StdOut/succeeded',
      level: 'Info',
      message: `${marker}:${nonce}:${JSON.stringify(payload)}`,
    },
    { code: 'ComponentStatus/StdErr/succeeded', level: 'Info', message: '' },
  ],
});
function withoutCollectionTimes(value) {
  if (Array.isArray(value)) return value.map(withoutCollectionTimes);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, row]) => {
        if (key === 'observedAt' || key === 'collectedAt') {
          timestamp(row);
          return [];
        }
        return [[key, withoutCollectionTimes(row)]];
      }),
    );
  return value;
}
var guestPayload = (guest, expected) =>
  Object.fromEntries(
    [...Object.keys(expected), 'status', 'imageId', 'interfaceName', 'containerId'].map((key) => [key, guest[key]]),
  );
function verifyAzureRelayHistoricalArtifacts(source, siteUid, records, outage) {
  if (outage) {
    require21(
      Object.keys(outage).join(',') === 'nodeIndex' &&
        source.topology.ha &&
        source.topology.nodeCount === 3 &&
        source.nics.length === 2 &&
        Number.isInteger(outage.nodeIndex) &&
        outage.nodeIndex >= 1 &&
        outage.nodeIndex <= 3 &&
        records.has('relay-routing-observation.json'),
      'outage requires exact selected HA node and complete observation',
    );
    outage = structuredClone(outage);
  }
  if (!records.size) return;
  require21(
    ['native', 'terraform'].includes(source.engine) && source.relayProfile && text2(siteUid),
    'owning relay plan or site missing',
  );
  verifyAzureCePlan(source);
  const plan = azureRelayPlanForDeployment(source),
    resourceSource = azureRelayResourceSource(source),
    binding = azureUpgradeBinding(source);
  const journal = object21(records.get('relay-routing-workflow.json'));
  keys(journal, [
    'schemaVersion',
    'engine',
    'sourcePlanSha256',
    'relayPlanSha256',
    'siteUid',
    'bindingSha256',
    'identity',
    'relays',
  ]);
  require21(
    journal.schemaVersion === 2 &&
      journal.engine === source.engine &&
      journal.sourcePlanSha256 === source.planSha256 &&
      journal.relayPlanSha256 === plan.planSha256 &&
      journal.siteUid === siteUid &&
      sha2(journal.bindingSha256),
    'workflow owner, engine or site differs',
  );
  const identity = object21(journal.identity);
  keys(identity, ['stable', 'server', 'slo', 'endpoints']);
  const stable = object21(identity.stable),
    server = object21(identity.server);
  keys(server, [
    'status',
    'source',
    'sourcePlanSha256',
    'planSha256',
    'routeServerId',
    'hostedSubnetId',
    'serviceAddresses',
    'relays',
    'peers',
    'reads',
    'observedAt',
    'sessions',
    'software',
    'traffic',
    'ceSampleFreshnessQualified',
  ]);
  require21(server.source === 'azure-cli-current-identity', 'historical identity source differs');
  const common = ['--resource-group', source.intent.resourceGroup, '--name', `${source.deploymentName}-rs`];
  const identityQueries = [
    ['network', 'routeserver', 'show', ...common],
    [
      'rest',
      '--method',
      'get',
      '--url',
      `https://management.azure.com${plan.routeServerId}/ipConfigurations?api-version=2024-05-01`,
    ],
    ['network', 'vnet', 'subnet', 'show', '--ids', `${plan.vnetId}/subnets/RouteServerSubnet`],
    ...plan.relays.map((relay) => [
      'network',
      'routeserver',
      'peering',
      'show',
      '--resource-group',
      source.intent.resourceGroup,
      '--routeserver',
      `${source.deploymentName}-rs`,
      '--name',
      relay.name,
    ]),
  ].map((args) => [...args, '--subscription', source.subscription.id, '--output', 'json']);
  for (const [index, read] of array3(server.reads).entries()) {
    keys(read, ['args', 'responseSha256', 'observedAt']);
    require21(
      Array.isArray(read.args) &&
        read.args.every((arg) => typeof arg === 'string') &&
        same9(read.args, identityQueries[index]) &&
        sha2(read.responseSha256),
      'historical identity read differs',
    );
    timestamp(read.observedAt);
  }
  require21(array3(server.reads).length === 5, 'historical identity reads incomplete');
  keys(stable, ['siteUid', 'cloud', 'relays', 'serviceAddresses', 'peers']);
  require21(
    stable.siteUid === siteUid &&
      canonicalSha256(stable) === journal.bindingSha256 &&
      same9(stable.relays, server.relays) &&
      same9(stable.serviceAddresses, server.serviceAddresses) &&
      same9(stable.peers, server.peers),
    'historical identity digest differs',
  );
  require21(
    server.status === 'observed' &&
      server.sourcePlanSha256 === source.planSha256 &&
      server.planSha256 === plan.planSha256 &&
      server.routeServerId === plan.routeServerId &&
      server.hostedSubnetId === `${plan.vnetId}/subnets/RouteServerSubnet` &&
      server.ceSampleFreshnessQualified === false &&
      server.sessions === 'unknown' &&
      server.software === 'unknown' &&
      server.traffic === 'unknown',
    'historical Route Server binding differs',
  );
  timestamp(server.observedAt);
  require21(
    Array.isArray(server.relays) &&
      server.relays.length === plan.relays.length &&
      Array.isArray(server.peers) &&
      server.peers.length === plan.relays.length,
    'complete historical relay identities required',
  );
  const macs = new Set();
  const validMac = (value) => {
    require21(
      typeof value === 'string' &&
        /^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(value) &&
        !(Number.parseInt(value.slice(0, 2), 16) & 1) &&
        value !== '00:00:00:00:00:00' &&
        !macs.has(value),
      'distinct unicast MAC required',
    );
    macs.add(value);
  };
  for (const [index, relay] of plan.relays.entries()) {
    const row = array3(server.relays)[index],
      peer = array3(server.peers)[index];
    keys(row, ['name', 'vmId', 'nicId', 'osDiskId', 'ipConfigurationId', 'subnetId', 'mac', 'address', 'asn']);
    keys(peer, ['id', 'name', 'peerAsn', 'peerIp']);
    require21(
      row.osDiskId === relay.osDiskId &&
        row.name === relay.name &&
        row.vmId === relay.vmId &&
        row.nicId === relay.nicId &&
        row.address === relay.privateAddress &&
        row.asn === relay.asn &&
        row.subnetId === plan.sloSubnetId &&
        row.ipConfigurationId === relay.ipConfigurationId &&
        peer.id === `${plan.routeServerId}/bgpConnections/${relay.name}` &&
        peer.name === relay.name &&
        peer.peerAsn === relay.asn &&
        peer.peerIp === relay.privateAddress,
      'foreign or reordered relay graph',
    );
    validMac(row.mac);
  }
  require21(
    Array.isArray(stable.cloud) &&
      stable.cloud.length === binding.nodes.length * source.nics.length &&
      Array.isArray(identity.slo) &&
      identity.slo.length === binding.nodes.length &&
      Array.isArray(identity.endpoints) &&
      identity.endpoints.length === binding.nodes.length,
    'partial CE identity snapshot',
  );
  const uuids = new Set(),
    interfaces = new Set(),
    interfaceUids = new Set();
  for (let node = 1; node <= source.topology.nodeCount; node++) {
    const nodeName = `${source.deploymentName}-${node}`;
    const vm = resourceSource.actions.find((row) => row.kind === 'vm-create' && row.node === node);
    const rows = array3(stable.cloud).filter((row) => row.node === nodeName);
    require21(rows.length === source.nics.length, 'partial or foreign CE node');
    const uuid = rows[0].vmUuid;
    require21(
      typeof uuid === 'string' &&
        /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(uuid) &&
        !uuids.has(uuid.toLowerCase()),
      'distinct CE VM UUID required',
    );
    uuids.add(uuid.toLowerCase());
    for (const nic of source.nics) {
      const selected = rows.filter((row) => row.role === nic.role);
      require21(selected.length === 1, 'duplicate CE role');
      const row = selected[0],
        action = resourceSource.actions.find(
          (item) => item.kind === 'nic-create' && item.node === node && item.resourceId?.endsWith(`-nic${nic.index}`),
        );
      keys(row, [
        'node',
        'role',
        'vmId',
        'vmUuid',
        'nicId',
        'ipConfigurationId',
        'mac',
        'subnetId',
        'device',
        'interfaceName',
        'interfaceUid',
        'ipv4',
      ]);
      require21(
        vm?.resourceId &&
          row.vmId === vm.resourceId &&
          row.vmUuid === uuid &&
          action?.resourceId &&
          row.nicId === action.resourceId &&
          typeof row.ipConfigurationId === 'string' &&
          row.ipConfigurationId.startsWith(`${action.resourceId}/ipConfigurations/`) &&
          row.subnetId === `${plan.vnetId}/subnets/${nic.subnet.name}` &&
          text2(row.device) &&
          text2(row.interfaceName) &&
          !interfaces.has(row.interfaceName),
        'CE VM/NIC/device/interface join differs',
      );
      interfaces.add(row.interfaceName);
      const interfaceUid = parseGeneratedInterfaceUid(row.interfaceUid);
      require21(!interfaceUids.has(interfaceUid.toLowerCase()), 'distinct generated interface UID required');
      interfaceUids.add(interfaceUid.toLowerCase());
      validMac(row.mac);
      if (nic.role === 'slo') {
        const slo = array3(identity.slo).filter((item) => item.node === nodeName);
        const endpoints = array3(identity.endpoints).filter((item) => item.node === node);
        if (endpoints.length === 1) keys(endpoints[0], ['node', 'address']);
        require21(
          slo.length === 1 &&
            endpoints.length === 1 &&
            slo[0].role === 'slo' &&
            slo[0].mac === row.mac &&
            slo[0].device === row.device &&
            slo[0].interfaceName === row.interfaceName &&
            slo[0].interfaceUid === row.interfaceUid &&
            slo[0].linkUp === true &&
            same9(slo[0].ipv4, row.ipv4) &&
            endpoints[0].address === object21(row.ipv4).address &&
            object21(row.ipv4).prefixLength === Number(plan.sloCidr.split('/')[1]),
          'SLO endpoint binding differs',
        );
      }
    }
  }
  const historical = identity;
  const activation = (relayName, nonce) =>
    compileAzureRelayGuestActivation(source, plan, relayName, historical.server, historical.endpoints, nonce);
  for (const relay of plan.relays) activation(relay.name, '0'.repeat(32));
  const entries = object21(journal.relays),
    names = Object.keys(entries),
    nonces = new Set();
  require21(
    names.every((name, index) => name === plan.relays[index]?.name),
    'submission prefix order differs',
  );
  const receipts = [];
  for (const name of names) {
    const entry = object21(entries[name]);
    keys(entry, ['nonce', 'requestSha256', 'submitted', ...('receipt' in entry ? ['receipt'] : [])]);
    require21(
      entry.submitted === true &&
        typeof entry.nonce === 'string' &&
        /^[a-f0-9]{32}$/.test(entry.nonce) &&
        !nonces.has(entry.nonce),
      'submission or distinct nonce differs',
    );
    nonces.add(entry.nonce);
    const request = activation(name, entry.nonce);
    require21(entry.requestSha256 === request.requestSha256, 'compiled submission digest differs');
    if ('receipt' in entry) {
      const receipt = object21(entry.receipt),
        probe = compileAzureRelayGuestObservation(request);
      require21(
        [request.requestSha256, probe.requestSha256].includes(String(receipt.requestSha256)),
        'guest receipt request differs',
      );
      const selected = receipt.requestSha256 === request.requestSha256 ? request : probe;
      const parsed = parseAzureRelayGuestReceipt(
        selected,
        rawResult('XCSH_RELAY_RECEIPT', selected.expected.nonce, guestPayload(receipt, selected.expected)),
      );
      require21(
        same9(withoutCollectionTimes(receipt), withoutCollectionTimes(parsed)),
        'guest receipt provenance differs',
      );
      receipts.push(receipt);
    }
  }
  const slo = historical.slo.map((row) => ({ node: row.node, role: 'slo', interfaceName: row.interfaceName }));
  const relays = plan.relays.map((relay) => ({ name: relay.name, address: relay.privateAddress, asn: relay.asn }));
  const routing = buildAzureRelayRouting(source.siteName, plan.localAsn, slo, relays, () => {});
  const platform = records.get('platform-relay-routing.json');
  if (platform !== undefined) {
    const value = object21(platform);
    keys(value, [
      'kind',
      'name',
      'uid',
      'siteName',
      'siteUid',
      'owner',
      'localAsn',
      'interfaces',
      'relays',
      'expectedSessions',
      'expectedPeers',
      'contractFingerprint',
    ]);
    require21(
      value.kind === 'bgp' &&
        value.name === routing.bgp.name &&
        text2(value.uid) &&
        value.siteName === source.siteName &&
        value.siteUid === siteUid &&
        same9(value.owner, binding.owner) &&
        value.localAsn === plan.localAsn &&
        same9(value.interfaces, slo) &&
        same9(value.relays, relays) &&
        value.expectedSessions === routing.expectedSessions &&
        same9(value.expectedPeers, routing.expectedPeers) &&
        text2(value.contractFingerprint),
      'platform BGP owner or binding differs',
    );
  }
  require21(names.length === 0 || platform !== undefined, 'submitted guests require platform routing provenance');
  const configuration = records.get('relay-routing-configuration.json');
  if (configuration !== undefined) {
    const value = object21(configuration);
    keys(value, [
      'status',
      'sourcePlanSha256',
      'relayPlanSha256',
      'siteUid',
      'bindingSha256',
      'guestReceipts',
      'observedAt',
      'routing',
      'traffic',
      'ceSampleFreshnessQualified',
    ]);
    require21(
      value.status === 'configured' &&
        value.sourcePlanSha256 === source.planSha256 &&
        value.relayPlanSha256 === plan.planSha256 &&
        value.siteUid === siteUid &&
        value.bindingSha256 === journal.bindingSha256 &&
        receipts.length === plan.relays.length &&
        same9(value.guestReceipts, receipts) &&
        value.routing === 'unknown' &&
        value.traffic === 'unknown' &&
        value.ceSampleFreshnessQualified === false,
      'configuration completeness or binding differs',
    );
    timestamp(value.observedAt);
  }
  const observedNodes = binding.nodes.filter((_node, index) => index + 1 !== outage?.nodeIndex);
  const observation = records.get('relay-routing-observation.json');
  if (observation !== undefined) {
    require21(configuration !== undefined, 'observation requires completed configuration');
    const value = object21(observation);
    keys(value, [
      ...(outage ? ['outage'] : []),
      'status',
      'sourcePlanSha256',
      'relayPlanSha256',
      'siteUid',
      'bindingSha256',
      'sessions',
      'finalSessions',
      'ceRoutes',
      'guestRoutes',
      'guestFib',
      'cloudRoutes',
      'collectedAt',
      'ceRouteScope',
      'routing',
      'fib',
      'traffic',
      'freshness',
      'ceSampleFreshnessQualified',
    ]);
    require21(
      value.status === 'observed' &&
        value.sourcePlanSha256 === source.planSha256 &&
        value.relayPlanSha256 === plan.planSha256 &&
        value.siteUid === siteUid &&
        value.bindingSha256 === journal.bindingSha256 &&
        value.ceRouteScope === 'unqualified' &&
        value.routing === 'unknown' &&
        value.fib === 'unknown' &&
        value.traffic === 'unknown' &&
        value.freshness === 'unqualified' &&
        value.ceSampleFreshnessQualified === false,
      'observation identity or unsupported acceptance claim differs',
    );
    if (outage) {
      const selected = object21(value.outage);
      keys(selected, [
        'nodeIndex',
        'powerState',
        'currentInterfaces',
        'retainedInterfaceIdentity',
        'ceSampleFreshnessQualified',
      ]);
      require21(
        selected.nodeIndex === outage.nodeIndex &&
          selected.powerState === 'deallocated' &&
          selected.currentInterfaces === 4 &&
          selected.retainedInterfaceIdentity === 'historical' &&
          selected.ceSampleFreshnessQualified === false,
        'historical stopped-node scope differs',
      );
    }
    timestamp(value.collectedAt);
    for (const key of ['sessions', 'finalSessions', 'ceRoutes']) {
      const row = object21(value[key]);
      require21(
        same9(row.owner, binding.owner) &&
          row.siteName === source.siteName &&
          row.status === (key === 'ceRoutes' ? 'observed' : 'healthy'),
        'CE routing observation owner differs',
      );
      timestamp(row.observedAt);
      require21(Array.isArray(row[key === 'ceRoutes' ? 'nodes' : 'sessions']), 'malformed CE routing observation');
      require21(
        row.contractFingerprint === object21(platform).contractFingerprint &&
          typeof row.source === 'string' &&
          row.source.length > 0,
        'CE routing contract provenance differs',
      );
      if (key === 'ceRoutes') {
        const nodes = array3(row.nodes);
        const wire = {
          ver: nodes.map((node) => ({
            name: node.node,
            ri_table: array3(node.routingInstances).map((instance) => ({
              routing_instance: instance.name,
              rt_table: array3(instance.tables).map((table) => ({
                name: table.name,
                imported: table.imported.map((subnet) => ({ subnet })),
                exported: table.exported.map((subnet) => ({ subnet })),
              })),
            })),
          })),
        };
        require21(same9(parseBgpRoutes(wire, observedNodes).nodes, nodes), 'CE route inventory provenance differs');
        if (row.pathInventory !== undefined) {
          const paths = object21(row.pathInventory);
          require21(
            ['observed', 'unknown'].includes(String(paths.status)) &&
              paths.scope === 'unqualified' &&
              paths.freshness === 'unqualified' &&
              paths.traffic === 'unknown',
            'CE path qualifier differs',
          );
          if (paths.status === 'observed')
            require21(
              array3(paths.nodes).length === observedNodes.length &&
                array3(paths.nodes).every((node, index) => node.node === observedNodes[index]),
              'CE path node provenance differs',
            );
          else require21(typeof paths.reason === 'string' && paths.reason.length > 0, 'CE unknown path reason missing');
        }
      } else {
        const sessions = array3(row.sessions),
          expected = routing.expectedPeers
            .filter((peer) => observedNodes.includes(peer.node))
            .map(({ node, interfaceName, peerAddress }) => ({
              node,
              interfaceName,
              peerAddress,
            }));
        const wire = {
          ver: observedNodes.map((node) => ({
            name: node,
            peer: sessions
              .filter((session) => session.node === node)
              .map((session) => ({
                interface_name: session.interfaceName,
                peer_address: { ipv4: { addr: session.peerAddress } },
                protocol_status: session.state,
                received_prefix_count: session.receivedPrefixCount,
                advertised_prefix_count: session.advertisedPrefixCount,
                up_down_timestamp: session.stateChangedAt,
              })),
          })),
        };
        const parsed = parseBgpSessions(wire, expected);
        require21(
          same9(parsed.sessions, sessions) &&
            row.expectedSessions === parsed.expectedSessions &&
            row.establishedSessions === parsed.establishedSessions,
          'CE session inventory provenance differs',
        );
      }
    }
    require21(Array.isArray(value.guestRoutes) && Array.isArray(value.guestFib), 'missing guest route observations');
    let routeIndex = 0,
      fibIndex = 0;
    const probeNonces = new Set();
    for (const relay of plan.relays) {
      const tasks = [
        ...plan.vipPrefixes.map((prefix) => ({
          direction: 'received',
          prefix,
          peer: undefined,
        })),
        ...plan.returnPrefixes.map((prefix) => ({
          direction: 'received',
          prefix,
          peer: undefined,
        })),
        ...plan.vipPrefixes.flatMap((prefix) =>
          historical.server.serviceAddresses.map((peer) => ({ direction: 'advertised', prefix, peer })),
        ),
        ...plan.returnPrefixes.flatMap((prefix) =>
          historical.endpoints
            .filter((row) => row.node !== outage?.nodeIndex)
            .map(({ address: peer }) => ({ direction: 'advertised', prefix, peer })),
        ),
      ];
      for (const task of tasks) {
        const row = array3(value.guestRoutes)[routeIndex++],
          session = object21(row.session),
          guest = object21(session.guest);
        const nonce = guest.nonce;
        require21(
          typeof nonce === 'string' && /^[a-f0-9]{32}$/.test(nonce) && !probeNonces.has(nonce),
          'distinct route probe nonce required',
        );
        probeNonces.add(nonce);
        const compile = task.direction === 'received' ? compileAzureRelayGuestFib : compileAzureRelayGuestRoute;
        const request = compile(
          source,
          plan,
          relay.name,
          historical.server,
          historical.endpoints,
          nonce,
          task.direction,
          task.prefix,
          task.peer,
          outage,
        );
        const routeRequest = 'routeRequest' in request ? request.routeRequest : request;
        const payload = {
          session: { guest: guestPayload(guest, routeRequest.sessionRequest.expected), sessions: session.sessions },
          route: row.route,
        };
        const parsed = parseAzureRelayGuestRoute(routeRequest, rawResult('XCSH_RELAY_ROUTE', nonce, payload));
        require21(same9(withoutCollectionTimes(row), withoutCollectionTimes(parsed)), 'guest route provenance differs');
        const configured = object21(object21(entries[relay.name]).receipt);
        require21(
          ['containerId', 'imageId', 'interfaceName'].every((key) => guest[key] === configured[key]),
          'guest changed since configuration',
        );
        if ('routeRequest' in request) {
          const fib = array3(value.guestFib)[fibIndex++];
          const parsedFib = parseAzureRelayGuestFib(
            request,
            rawResult('XCSH_RELAY_FIB', nonce, { membership: payload, fib: fib.fib }),
          );
          require21(
            same9(withoutCollectionTimes(fib), withoutCollectionTimes(parsedFib)) && same9(fib.membership, row),
            'guest FIB provenance differs',
          );
        }
      }
    }
    require21(
      routeIndex === array3(value.guestRoutes).length && fibIndex === array3(value.guestFib).length,
      'duplicate or surplus route observations',
    );
    const cloud = object21(value.cloudRoutes);
    keys(cloud, [
      'status',
      'source',
      'sourcePlanSha256',
      'relayPlanSha256',
      'routeServerId',
      'identitySha256',
      'peers',
      'reads',
      'collectedAt',
      'sessions',
      'traffic',
      'freshness',
      'ceSampleFreshnessQualified',
    ]);
    require21(
      cloud.source === 'azure-cli-current-route-exchange' &&
        cloud.sessions === 'unknown' &&
        cloud.identitySha256 ===
          canonicalSha256({
            sourcePlanSha256: server.sourcePlanSha256,
            planSha256: server.planSha256,
            routeServerId: server.routeServerId,
            hostedSubnetId: server.hostedSubnetId,
            serviceAddresses: server.serviceAddresses,
            relays: server.relays,
            peers: server.peers,
          }),
      'cloud exchange identity digest differs',
    );
    const reads = [];
    for (const [index, relay] of plan.relays.entries()) {
      const peer = array3(cloud.peers)[index];
      keys(peer, ['relayName', 'peerId', 'learned', 'advertised']);
      require21(
        peer.relayName === relay.name && peer.peerId === `${plan.routeServerId}/bgpConnections/${relay.name}`,
        'cloud exchange peer differs',
      );
      for (const direction of ['learned', 'advertised']) {
        reads.push([
          'network',
          'routeserver',
          'peering',
          `list-${direction}-routes`,
          '--resource-group',
          source.intent.resourceGroup,
          '--routeserver',
          `${source.deploymentName}-rs`,
          '--name',
          relay.name,
          '--subscription',
          source.subscription.id,
          '--output',
          'json',
        ]);
        const roles = array3(peer[direction]);
        require21(roles.length === 2, 'complete cloud service roles required');
        for (const [roleIndex, role] of roles.entries()) {
          keys(role, ['role', 'routeCount', 'matches']);
          require21(
            role.role === `RouteServiceRole_IN_${roleIndex}` &&
              Number.isSafeInteger(role.routeCount) &&
              Number(role.routeCount) >= 0,
            'cloud role or route count differs',
          );
          const prefixes = direction === 'learned' ? plan.vipPrefixes : plan.returnPrefixes;
          const matches = array3(role.matches);
          require21(matches.length === prefixes.length, 'partial cloud prefix scope');
          let pathsCount = 0;
          for (const [prefixIndex, match] of matches.entries()) {
            keys(match, ['prefix', 'paths']);
            require21(match.prefix === prefixes[prefixIndex], 'foreign cloud prefix');
            const paths = array3(match.paths),
              seen = new Set();
            require21(paths.length > 0, 'missing cloud paths');
            pathsCount += paths.length;
            for (const path of paths) {
              keys(path, ['localAddress', 'nextHop', 'sourcePeer', 'asPath']);
              require21(
                historical.server.serviceAddresses.includes(String(path.localAddress)) &&
                  !seen.has(canonicalSha256(path)),
                'foreign or duplicate cloud path',
              );
              seen.add(canonicalSha256(path));
              if (direction === 'learned')
                require21(
                  path.nextHop === relay.privateAddress &&
                    path.sourcePeer === relay.privateAddress &&
                    typeof path.asPath === 'string' &&
                    new RegExp(`^${relay.asn}(?:-${relay.asn})*-${plan.localAsn}(?:-${plan.localAsn})*$`).test(
                      path.asPath,
                    ),
                  'cloud VIP path binding differs',
                );
              else
                require21(
                  path.nextHop === path.localAddress &&
                    path.sourcePeer === path.localAddress &&
                    path.asPath === '65515',
                  'cloud return path differs',
                );
            }
          }
          require21(Number(role.routeCount) >= pathsCount, 'cloud route count contradicts paths');
        }
      }
    }
    require21(same9(cloud.reads, reads), 'cloud exchange read scope differs');
    require21(
      cloud.status === 'observed' &&
        cloud.sourcePlanSha256 === source.planSha256 &&
        cloud.relayPlanSha256 === plan.planSha256 &&
        cloud.routeServerId === plan.routeServerId &&
        sha2(cloud.identitySha256) &&
        cloud.traffic === 'unknown' &&
        cloud.freshness === 'unqualified' &&
        cloud.ceSampleFreshnessQualified === false &&
        Array.isArray(cloud.peers) &&
        cloud.peers.length === plan.relays.length &&
        Array.isArray(cloud.reads) &&
        cloud.reads.length > 0,
      'cloud exchange provenance differs',
    );
    timestamp(cloud.collectedAt);
  }
}
function requireAzureRelayHistoricalAcceptance(source, siteUid, records) {
  verifyAzureRelayHistoricalArtifacts(source, siteUid, records);
  const observation = object21(records.get('relay-routing-observation.json'));
  require21(
    observation.routing === 'healthy' &&
      observation.ceSampleFreshnessQualified === true &&
      observation.ceRouteScope !== 'unqualified' &&
      observation.freshness !== 'unqualified',
    'predecessor operational routing acceptance remains unqualified',
  );
}
function isAzureRelayReplacementHistoricalArtifact(name) {
  const match = /^azure-ce-[a-f0-9]{24}-replacement-(.+)$/.exec(name);
  return Boolean(match && azureRelayHistoricalArtifacts.has(match[1]));
}
function verifyAzureRelayReplacementHistories(base, siteUid, records, sources) {
  const generations = new Map();
  for (const [name, value] of records) {
    if (!isAzureRelayReplacementHistoricalArtifact(name)) continue;
    const match = /^(azure-ce-[a-f0-9]{24})-replacement-(.+)$/.exec(name);
    require21(match, 'replacement journal name differs');
    const planId = match[1],
      file = match[2];
    if (!generations.has(planId)) generations.set(planId, new Map());
    generations.get(planId)?.set(file, value);
  }
  for (const [planId, history] of generations) {
    const matches = [...sources.values()].filter((source) => source.planId === planId);
    require21(matches.length === 1, 'replacement journal source is missing or ambiguous');
    const source = matches[0];
    verifyAzureCePlan(source);
    require21(
      source.relayProfile?.schemaVersion === 2 &&
        source.intent.operation === 'replace-node' &&
        source.engine === base.engine &&
        same9(azureUpgradeBinding(source), azureUpgradeBinding(base)) &&
        same9(azureRelayResourceSource(source), azureRelayResourceSource(base)),
      'replacement journal generation or original resource owner differs',
    );
    verifyAzureRelayHistoricalArtifacts(source, siteUid, history);
  }
}

// plugins/azure/src/ce/relay-current-identity.ts
var require22 = (condition, message) => {
  if (!condition) throw Error(`Azure relay workflow: ${message}`);
};
var object22 = (value) => {
  require22(value && typeof value === 'object' && !Array.isArray(value), 'malformed current identity');
  return value;
};
var sameId2 = (value, expected) => typeof value === 'string' && value.toLowerCase() === expected.toLowerCase();
var mac3 = (value) => {
  const normalized = typeof value === 'string' ? value.toLowerCase().replaceAll('-', ':') : '';
  require22(
    /^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(normalized) &&
      (Number.parseInt(normalized.slice(0, 2), 16) & 1) === 0 &&
      normalized !== '00:00:00:00:00:00',
    'distinct unicast MAC required',
  );
  return normalized;
};
async function azureRelayCurrentIdentityContext(source, expected, runtime, storage, api, signal, outage) {
  source = structuredClone(source);
  expected = structuredClone(expected);
  const plan = azureRelayPlanForDeployment(source);
  const resourceSource = azureRelayResourceSource(source);
  const retainedOwners = new Map(
    source.relayProfile?.schemaVersion === 2
      ? source.relayProfile.retainedResourceOwners.map((row) => [row.resourceId.toLowerCase(), row.ownerPlanSha256])
      : [],
  );
  const selectedVm =
    source.relayProfile?.schemaVersion === 2
      ? source.actions.find((action) => action.kind === 'vm-create' && action.node === source.intent.replacementNode)
          ?.resourceId
      : undefined;
  require22(runtime.engine === source.engine, 'runtime engine differs');
  await storage.verify();
  const binding = azureUpgradeBinding(source);
  require22(canonicalSha256(storage.owner) === canonicalSha256(binding.owner), 'storage owner differs');
  signal?.throwIfAborted();
  let baseline;
  if (outage) {
    require22(
      Object.keys(outage).sort().join(',') === 'baselineRecords,nodeIndex' &&
        source.topology.ha &&
        source.topology.nodeCount === 3 &&
        source.nics.length === 2 &&
        Number.isInteger(outage.nodeIndex) &&
        outage.nodeIndex >= 1 &&
        outage.nodeIndex <= 3 &&
        outage.baselineRecords instanceof Map &&
        runtime.observeAzureInterfacesForNodes,
      'outage requires one exact HA node and read-only surviving interface observer',
    );
    outage = structuredClone(outage);
    require22(
      outage.baselineRecords.has('relay-routing-configuration.json'),
      'completed baseline configuration required',
    );
    const journal = object22(outage.baselineRecords.get('relay-routing-workflow.json'));
    verifyAzureRelayHistoricalArtifacts(source, String(journal.siteUid), outage.baselineRecords);
    baseline = journal;
  }
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const bounded = async (task) => {
    deadline.throwIfAborted();
    const abort = Promise.withResolvers();
    const onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([task(), abort.promise]);
      deadline.throwIfAborted();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const read = async (args, id, details = false) => {
    const raw = await bounded(() =>
      api.exec(
        'az',
        [
          ...args,
          'show',
          '--ids',
          id,
          ...(details ? ['--show-details'] : []),
          '--subscription',
          source.subscription.id,
          '--output',
          'json',
        ],
        {
          signal: deadline,
        },
      ),
    );
    require22(raw.exitCode === 0, 'cloud identity read unavailable');
    const value = object22(JSON.parse(raw.stdout));
    require22(
      sameId2(value.id, id) &&
        value.provisioningState === 'Succeeded' &&
        value.location === source.region &&
        !['nextLink', 'nextPageToken', 'errors', 'error'].some((key) => value[key]),
      'incomplete or foreign cloud identity',
    );
    const tags = object22(value.tags);
    for (const [key, wanted] of Object.entries({
      'xcsh-managed-by': 'azure-ce',
      'xcsh-execution-engine': source.engine,
      'xcsh-deployment-id': source.deploymentName,
      'xcsh-plan-sha256':
        id.toLowerCase() === selectedVm?.toLowerCase()
          ? source.planSha256
          : (retainedOwners.get(id.toLowerCase()) ?? resourceSource.planSha256),
    }))
      require22(tags[key] === wanted, 'CE cloud owner differs');
    return value;
  };
  const observe = async () => {
    await storage.verify();
    if (outage) {
      const raw = await bounded(() =>
        api.exec('az', ['account', 'show', '--subscription', source.subscription.id, '--output', 'json'], {
          signal: deadline,
        }),
      );
      require22(raw.exitCode === 0, 'outage account read unavailable');
      const account = object22(JSON.parse(raw.stdout));
      require22(
        sameId2(account.id, source.subscription.id) &&
          sameId2(account.tenantId, source.subscription.tenantId) &&
          account.environmentName === source.subscription.cloud &&
          account.state === 'Enabled' &&
          !['nextLink', 'errors', 'error'].some((key) => account[key]),
        'outage account identity differs',
      );
    }
    const site = await bounded(() => runtime.observeOwnedSite(binding, deadline));
    const siteUid = object22(site.system_metadata).uid;
    require22(typeof siteUid === 'string' && siteUid.trim(), 'logical site UID unavailable');
    require22(
      expected.length === binding.nodes.length * source.nics.length &&
        new Set(expected.map((row) => `${row.node}/${row.role}`)).size === expected.length &&
        expected.every((row) => binding.nodes.includes(row.node) && source.nics.some((nic) => nic.role === row.role)),
      'complete expected CE interface scope required',
    );
    if (baseline) require22(siteUid === baseline.siteUid, 'outage logical site differs from baseline');
    const selectedNode = outage ? binding.nodes[outage.nodeIndex - 1] : undefined;
    const currentExpected = expected.filter((row) => row.node !== selectedNode);
    const platform = await bounded(() => {
      if (!outage) return runtime.observeAzureInterfaces(binding, expected, deadline);
      if (!runtime.observeAzureInterfacesForNodes) throw Error('Azure relay workflow: surviving observer unavailable');
      return runtime.observeAzureInterfacesForNodes(
        binding,
        expected,
        binding.nodes.filter((node) => node !== selectedNode),
        deadline,
      );
    });
    require22(
      platform.status === 'observed' &&
        platform.interfaces.length === currentExpected.length &&
        platform.interfaces.every(
          (row) =>
            row.linkUp === true &&
            currentExpected.some((wanted) => wanted.node === row.node && wanted.role === row.role),
        ),
      'complete verified up CE evidence required',
    );
    requireQualifiedUpInterfaceEvidence(platform, currentExpected);
    const cloud = [];
    const slo = [];
    const endpoints = [];
    const usedMacs = new Set();
    const usedVms = new Set();
    for (let node = 1; node <= source.topology.nodeCount; node++) {
      const nodeName = `${source.deploymentName}-${node}`;
      const vms = resourceSource.actions.filter((action) => action.kind === 'vm-create' && action.node === node);
      require22(vms.length === 1 && vms[0].resourceId, 'one saved CE VM required');
      const vmId = vms[0].resourceId;
      const stopped = nodeName === selectedNode;
      const vm = await read(['vm'], vmId, stopped);
      if (stopped) require22(vm.powerState === 'VM deallocated', 'selected VM must explicitly be deallocated');
      require22(
        typeof vm.vmId === 'string' &&
          /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(vm.vmId) &&
          !usedVms.has(vm.vmId.toLowerCase()),
        'distinct CE VM UUID required',
      );
      usedVms.add(vm.vmId.toLowerCase());
      const references = object22(vm.networkProfile).networkInterfaces;
      require22(
        Array.isArray(references) && references.length === source.nics.length,
        'complete CE VM NIC references required',
      );
      for (const selected of source.nics) {
        const actions = resourceSource.actions.filter(
          (action) =>
            action.kind === 'nic-create' &&
            action.node === node &&
            action.resourceId?.endsWith(`-nic${selected.index}`),
        );
        require22(actions.length === 1 && actions[0].resourceId, 'one saved CE NIC required');
        const nicId = actions[0].resourceId;
        require22(references.filter((ref) => sameId2(object22(ref).id, nicId)).length === 1, 'CE VM NIC join differs');
        const nic = await read(['network', 'nic'], nicId);
        require22(sameId2(object22(nic.virtualMachine).id, vmId), 'CE NIC VM attachment differs');
        const normalized = mac3(nic.macAddress);
        require22(!usedMacs.has(normalized), 'CE MAC duplicated');
        usedMacs.add(normalized);
        const requested = expected.filter((row) => row.node === nodeName && row.role === selected.role);
        const observed = stopped
          ? (baseline?.identity.stable.cloud ?? []).filter((row) => row.node === nodeName && row.role === selected.role)
          : platform.interfaces.filter((row) => row.node === nodeName && row.role === selected.role);
        require22(
          requested.length === 1 &&
            observed.length === 1 &&
            mac3(requested[0].mac) === normalized &&
            mac3(observed[0].mac) === normalized &&
            /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(observed[0].device) &&
            /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(observed[0].interfaceName),
          'authoritative CE/cloud MAC/device join differs',
        );
        parseGeneratedInterfaceUid(observed[0].interfaceUid);
        const configs = nic.ipConfigurations;
        require22(Array.isArray(configs) && configs.length === 1, 'one complete CE NIC IP configuration required');
        const config = object22(configs[0]);
        require22(
          typeof config.name === 'string' &&
            /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(config.name) &&
            sameId2(config.id, `${nicId}/ipConfigurations/${config.name}`),
          'CE IP configuration identity differs',
        );
        const subnets = resourceSource.actions.filter(
          (action) =>
            action.kind === 'subnet-create' &&
            action.args?.[action.args.indexOf('--name') + 1] === selected.subnet.name,
        );
        require22(
          subnets.length === 1 && subnets[0].resourceId && sameId2(object22(config.subnet).id, subnets[0].resourceId),
          'CE subnet join differs',
        );
        if (selected.role === 'slo') {
          const ip = observed[0].ipv4;
          require22(
            config.privateIPAddressVersion === 'IPv4' &&
              (config.primary === true || config.primary === undefined) &&
              ip &&
              ip.address === config.privateIPAddress &&
              ip.prefixLength === Number(plan.sloCidr.split('/')[1]),
            'authoritative CE/cloud SLO IP differs',
          );
          if (!stopped) slo.push(observed[0]);
          endpoints.push({ node, address: ip?.address });
        }
        cloud.push({
          node: nodeName,
          role: selected.role,
          vmId,
          vmUuid: vm.vmId,
          nicId,
          ipConfigurationId: config.id,
          mac: normalized,
          subnetId: subnets[0].resourceId,
          device: observed[0].device,
          interfaceName: observed[0].interfaceName,
          interfaceUid: observed[0].interfaceUid,
          ipv4: observed[0].ipv4,
        });
      }
    }
    const server = await observeAzureRelayRouteServerIdentity(source, plan, api, deadline);
    const finalSite = await bounded(() => runtime.observeOwnedSite(binding, deadline));
    require22(object22(finalSite.system_metadata).uid === siteUid, 'logical site changed during identity collection');
    const stable = {
      siteUid,
      cloud,
      relays: server.relays,
      serviceAddresses: server.serviceAddresses,
      peers: server.peers,
    };
    if (baseline) {
      require22(
        canonicalSha256(stable) === baseline.bindingSha256,
        'outage current cloud/CE binding differs from baseline',
      );
      const selected = cloud.find((row) => row.node === selectedNode);
      if (!selected) throw Error('Azure relay workflow: selected cloud identity unavailable');
      const finalVm = await read(['vm'], selected.vmId, true);
      require22(
        finalVm.powerState === 'VM deallocated' && sameId2(finalVm.vmId, selected.vmUuid),
        'selected VM must remain identity-bound and deallocated during collection',
      );
    }
    deadline.throwIfAborted();
    return {
      ...(outage
        ? {
            outage: {
              nodeIndex: outage.nodeIndex,
              powerState: 'deallocated',
              currentInterfaces: platform.interfaces.length,
              retainedInterfaceIdentity: 'historical',
              ceSampleFreshnessQualified: false,
            },
          }
        : {}),
      siteUid,
      server,
      slo,
      endpoints,
      bindingSha256: canonicalSha256(stable),
      identity: { stable, server, slo, endpoints },
    };
  };
  return { source, expected, plan, binding, deadline, bounded, observe };
}

// plugins/azure/src/ce/relay-route-evidence.ts
import { isIP as isIP15 } from 'node:net';

var require23 = (value, message) => {
  if (!value) throw Error(`Azure relay route evidence: ${message}`);
};
var object23 = (value) => {
  require23(value && typeof value === 'object' && !Array.isArray(value), 'malformed route map');
  return value;
};
var prefix3 = (value) => {
  if (typeof value !== 'string') return false;
  const [address, bits, extra] = value.split('/');
  if (extra !== undefined || isIP15(address) !== 4 || !/^(?:[0-9]|[12][0-9]|3[0-2])$/.test(bits)) return false;
  const integer = address.split('.').reduce((sum, octet) => sum * 256 + Number(octet), 0);
  return integer % 2 ** (32 - Number(bits)) === 0;
};
function parseAzureRelayRouteExchange(source, plan, relayName, identity, learned, advertised) {
  verifyAzureRelayPlan(source, plan);
  const relay = plan.relays.find((row) => row.name === relayName);
  require23(
    relay &&
      identity.status === 'observed' &&
      identity.sourcePlanSha256 === source.planSha256 &&
      identity.planSha256 === plan.planSha256 &&
      identity.routeServerId === plan.routeServerId &&
      identity.serviceAddresses.length === 2 &&
      new Set(identity.serviceAddresses).size === 2 &&
      identity.serviceAddresses.every((ip) => isIP15(ip) === 4),
    'current joined Route Server identity required',
  );
  if (!relay) throw Error('Azure relay route evidence: relay is absent');
  require23(
    identity.peers.filter(
      (peer) =>
        peer.name === relayName &&
        peer.peerIp === relay.privateAddress &&
        peer.peerAsn === relay.asn &&
        peer.id === `${plan.routeServerId}/bgpConnections/${relayName}`,
    ).length === 1,
    'selected relay peer identity differs',
  );
  const roles = (raw, direction) => {
    const map = object23(raw);
    require23(
      Object.keys(map).sort().join(',') === 'RouteServiceRole_IN_0,RouteServiceRole_IN_1',
      'two complete service-role route lists required',
    );
    return Object.entries(map)
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([role, values]) => {
        require23(Array.isArray(values), 'malformed service-role routes');
        const seen = new Set();
        const routes = values.map((entry) => {
          const route = object23(entry);
          require23(
            prefix3(route.network) &&
              typeof route.localAddress === 'string' &&
              identity.serviceAddresses.includes(route.localAddress) &&
              typeof route.nextHop === 'string' &&
              isIP15(route.nextHop) === 4 &&
              typeof route.sourcePeer === 'string' &&
              isIP15(route.sourcePeer) === 4 &&
              typeof route.origin === 'string' &&
              route.origin.trim() &&
              typeof route.asPath === 'string' &&
              /^(?:[1-9][0-9]*)(?:-[1-9][0-9]*)*$/.test(route.asPath) &&
              route.asPath.split('-').every((asn) => Number(asn) < 4294967295) &&
              Number.isInteger(route.weight) &&
              Number(route.weight) >= 0 &&
              Number(route.weight) <= 2147483647,
            'malformed route identity or path',
          );
          const key = canonicalSha256({
            network: route.network,
            localAddress: route.localAddress,
            nextHop: route.nextHop,
            sourcePeer: route.sourcePeer,
            asPath: route.asPath,
          });
          require23(!seen.has(key), 'duplicate route observation');
          seen.add(key);
          return route;
        });
        const wanted = direction === 'learned' ? plan.vipPrefixes : plan.returnPrefixes;
        const matches = wanted.map((network) => {
          const rows = routes.filter((row) => row.network === network);
          require23(rows.length > 0, 'expected prefix exchange has not converged');
          for (const row of rows) {
            if (direction === 'learned') {
              const path = row.asPath.split('-').map(Number);
              require23(
                row.nextHop === relay.privateAddress &&
                  row.sourcePeer === relay.privateAddress &&
                  row.origin === 'EBgp' &&
                  path[0] === relay.asn &&
                  path.at(-1) === plan.localAsn &&
                  new RegExp(`^${relay.asn}(?:-${relay.asn})*-${plan.localAsn}(?:-${plan.localAsn})*$`).test(
                    row.asPath,
                  ),
                'VIP source/next-hop/AS path differs',
              );
            } else {
              require23(
                row.nextHop === row.localAddress &&
                  row.sourcePeer === row.localAddress &&
                  row.origin === 'Igp' &&
                  row.asPath === '65515',
                'Azure return source/next-hop/AS path differs',
              );
            }
          }
          return {
            prefix: network,
            paths: rows.map((row) => ({
              localAddress: row.localAddress,
              nextHop: row.nextHop,
              sourcePeer: row.sourcePeer,
              asPath: row.asPath,
            })),
          };
        });
        return { role, routeCount: routes.length, matches };
      });
  };
  return {
    relayName,
    peerId: `${plan.routeServerId}/bgpConnections/${relayName}`,
    learned: roles(learned, 'learned'),
    advertised: roles(advertised, 'advertised'),
  };
}
async function observeAzureRelayRouteExchange(source, plan, api, signal) {
  source = structuredClone(source);
  plan = structuredClone(plan);
  verifyAzureRelayPlan(source, plan);
  signal?.throwIfAborted();
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const bounded = async (task) => {
    deadline.throwIfAborted();
    const abort = Promise.withResolvers();
    const onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([task(), abort.promise]);
      deadline.throwIfAborted();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const identity = await bounded(() => observeAzureRelayRouteServerIdentity(source, plan, api, deadline));
  const stable = (row) =>
    canonicalSha256({
      sourcePlanSha256: row.sourcePlanSha256,
      planSha256: row.planSha256,
      routeServerId: row.routeServerId,
      hostedSubnetId: row.hostedSubnetId,
      serviceAddresses: row.serviceAddresses,
      relays: row.relays,
      peers: row.peers,
    });
  const identitySha256 = stable(identity);
  const reads = [];
  const read = async (relayName, direction) => {
    const args = [
      'network',
      'routeserver',
      'peering',
      `list-${direction}-routes`,
      '--resource-group',
      source.intent.resourceGroup,
      '--routeserver',
      `${source.deploymentName}-rs`,
      '--name',
      relayName,
      '--subscription',
      source.subscription.id,
      '--output',
      'json',
    ];
    reads.push(args);
    const raw = await bounded(() => api.exec('az', args, { signal: deadline }));
    require23(raw.exitCode === 0, 'route read unavailable');
    return JSON.parse(raw.stdout);
  };
  const revalidate = async () =>
    require23(
      stable(await bounded(() => observeAzureRelayRouteServerIdentity(source, plan, api, deadline))) === identitySha256,
      'current cloud identity changed during route collection',
    );
  const peers = [];
  for (const relay of plan.relays) {
    await revalidate();
    const learned = await read(relay.name, 'learned');
    const advertised = await read(relay.name, 'advertised');
    peers.push(parseAzureRelayRouteExchange(source, plan, relay.name, identity, learned, advertised));
    await revalidate();
  }
  deadline.throwIfAborted();
  return {
    status: 'observed',
    source: 'azure-cli-current-route-exchange',
    sourcePlanSha256: source.planSha256,
    relayPlanSha256: plan.planSha256,
    routeServerId: plan.routeServerId,
    identitySha256,
    peers,
    reads,
    collectedAt: new Date().toISOString(),
    sessions: 'unknown',
    traffic: 'unknown',
    freshness: 'unqualified',
    ceSampleFreshnessQualified: false,
  };
}

// plugins/azure/src/ce/relay-observation.ts
var require24 = (condition, message) => {
  if (!condition) throw Error(`Azure relay observation: ${message}`);
};
var object24 = (value) => {
  require24(value && typeof value === 'object' && !Array.isArray(value), 'malformed owned checkpoint');
  return value;
};
async function observeAzureRelayRoutingWorkflow(source, expected, runtime, storage, api, signal, outage) {
  signal?.throwIfAborted();
  outage = outage ? structuredClone(outage) : undefined;
  runtime.requireAzureRelayRoutingContract();
  await storage.verify();
  if (outage)
    require24(
      Object.keys(outage).join(',') === 'nodeIndex' && runtime.observeBgpRoutesForNodes,
      'outage requires exact selected node and surviving route observer',
    );
  const baselineRecords = outage
    ? new Map(
        await Promise.all(
          ['relay-routing-workflow.json', 'platform-relay-routing.json', 'relay-routing-configuration.json'].map(
            async (name) => [name, await storage.read(name)],
          ),
        ),
      )
    : undefined;
  const context = await azureRelayCurrentIdentityContext(
    source,
    expected,
    runtime,
    storage,
    api,
    signal,
    outage && baselineRecords ? { nodeIndex: outage.nodeIndex, baselineRecords } : undefined,
  );
  const { plan, binding, bounded, deadline, observe } = context;
  source = context.source;
  const journal = object24(await storage.read('relay-routing-workflow.json'));
  require24(
    Object.keys(journal).sort().join(',') ===
      'bindingSha256,engine,identity,relayPlanSha256,relays,schemaVersion,siteUid,sourcePlanSha256' &&
      journal.schemaVersion === 2 &&
      journal.engine === source.engine &&
      journal.sourcePlanSha256 === source.planSha256 &&
      journal.relayPlanSha256 === plan.planSha256,
    'checkpoint owner or shape differs',
  );
  const entries = object24(journal.relays);
  require24(
    Object.keys(entries).join(',') === plan.relays.map((relay) => relay.name).join(','),
    'complete ordered configured relay checkpoint required',
  );
  const initial = await observe();
  const revalidate = async () => {
    await storage.verify();
    const current = await observe();
    require24(
      current.siteUid === journal.siteUid && current.bindingSha256 === journal.bindingSha256,
      'current cloud/CE/site binding differs from configuration',
    );
    return current;
  };
  await revalidate();
  const guestIdentity = new Map();
  const usedNonces = new Set();
  for (const relay of plan.relays) {
    const entry = object24(entries[relay.name]);
    require24(
      Object.keys(entry).sort().join(',') === 'nonce,receipt,requestSha256,submitted' &&
        entry.submitted === true &&
        typeof entry.nonce === 'string' &&
        /^[a-f0-9]{32}$/.test(entry.nonce) &&
        !usedNonces.has(entry.nonce),
      'complete distinct guest submission checkpoint required',
    );
    usedNonces.add(entry.nonce);
    const activation = compileAzureRelayGuestActivation(
      source,
      plan,
      relay.name,
      initial.server,
      initial.endpoints,
      entry.nonce,
    );
    const observation = compileAzureRelayGuestObservation(activation);
    require24(entry.requestSha256 === activation.requestSha256, 'saved guest request differs');
    const receipt = object24(entry.receipt);
    require24(
      Object.keys(receipt).sort().join(',') ===
        [
          ...Object.keys(activation.expected),
          'status',
          'imageId',
          'interfaceName',
          'containerId',
          'requestSha256',
          'observedAt',
          'routing',
          'traffic',
          'ceSampleFreshnessQualified',
        ]
          .sort()
          .join(','),
      'saved guest receipt shape differs',
    );
    for (const [key, value] of Object.entries(activation.expected))
      require24(receipt[key] === value, 'saved guest receipt binding differs');
    require24(
      receipt.status === 'configured' &&
        [activation.requestSha256, observation.requestSha256].includes(receipt.requestSha256) &&
        typeof receipt.imageId === 'string' &&
        /^sha256:[a-f0-9]{64}$/.test(receipt.imageId) &&
        typeof receipt.containerId === 'string' &&
        /^[a-f0-9]{64}$/.test(receipt.containerId) &&
        typeof receipt.interfaceName === 'string' &&
        /^[a-zA-Z0-9_.:-]{1,32}$/.test(receipt.interfaceName),
      'saved guest configuration identity unavailable',
    );
    guestIdentity.set(relay.name, receipt);
  }
  const sessionsExpected = initial.slo.flatMap((row) =>
    plan.relays.map((relay) => ({
      node: row.node,
      interfaceName: row.interfaceName,
      peerAddress: relay.privateAddress,
    })),
  );
  const sessions = await bounded(() => runtime.observeBgpSessions(binding, sessionsExpected, deadline));
  require24(sessions.status === 'healthy', 'complete Established CE-to-relay sessions required');
  await revalidate();
  const ceRoutes = await bounded(() => {
    if (!outage) return runtime.observeBgpRoutes(binding, deadline);
    if (!runtime.observeBgpRoutesForNodes) throw Error('Azure relay observation: surviving route observer unavailable');
    return runtime.observeBgpRoutesForNodes(
      binding,
      initial.slo.map((row) => row.node),
      deadline,
    );
  });
  require24(ceRoutes.status === 'observed', 'complete current CE route inventory required');
  await revalidate();
  const guestRoutes = [];
  const guestFib = [];
  for (const relay of plan.relays) {
    const tasks = [
      ...plan.vipPrefixes.map((prefix) => ({
        direction: 'received',
        prefix,
        peer: undefined,
      })),
      ...plan.returnPrefixes.map((prefix) => ({
        direction: 'received',
        prefix,
        peer: undefined,
      })),
      ...plan.vipPrefixes.flatMap((prefix) =>
        initial.server.serviceAddresses.map((peer) => ({ direction: 'advertised', prefix, peer })),
      ),
      ...plan.returnPrefixes.flatMap((prefix) =>
        initial.endpoints
          .filter((row) => row.node !== outage?.nodeIndex)
          .map(({ address: peer }) => ({ direction: 'advertised', prefix, peer })),
      ),
    ];
    require24(tasks.length > 0, 'planned route membership scope required');
    for (const task of tasks) {
      const current = await revalidate();
      const compile = task.direction === 'received' ? compileAzureRelayGuestFib : compileAzureRelayGuestRoute;
      const request = compile(
        source,
        plan,
        relay.name,
        current.server,
        current.endpoints,
        randomBytes(16).toString('hex'),
        task.direction,
        task.prefix,
        task.peer,
        outage,
      );
      const raw = await bounded(() => api.exec('az', request.args, { signal: deadline }));
      require24(raw.exitCode === 0, 'guest route observation unavailable');
      const response = JSON.parse(raw.stdout);
      const evidence =
        'fibBinding' in request
          ? (() => {
              const fib = parseAzureRelayGuestFib(request, response);
              guestFib.push(fib);
              return fib.membership;
            })()
          : parseAzureRelayGuestRoute(request, response);
      const prior = guestIdentity.get(relay.name);
      for (const key of ['containerId', 'imageId', 'interfaceName'])
        require24(
          object24(evidence.session.guest)[key] === prior?.[key],
          'guest runtime changed since owned configuration',
        );
      guestRoutes.push(evidence);
      await revalidate();
    }
  }
  const cloudRoutes = await bounded(() => observeAzureRelayRouteExchange(source, plan, api, deadline));
  await revalidate();
  const finalSessions = await bounded(() => runtime.observeBgpSessions(binding, sessionsExpected, deadline));
  require24(finalSessions.status === 'healthy', 'CE-to-relay sessions changed during collection');
  await revalidate();
  deadline.throwIfAborted();
  return {
    ...(initial.outage ? { outage: initial.outage } : {}),
    status: 'observed',
    sourcePlanSha256: source.planSha256,
    relayPlanSha256: plan.planSha256,
    siteUid: initial.siteUid,
    bindingSha256: initial.bindingSha256,
    sessions,
    finalSessions,
    ceRoutes,
    guestRoutes,
    guestFib,
    cloudRoutes,
    collectedAt: new Date().toISOString(),
    ceRouteScope: 'unqualified',
    routing: 'unknown',
    fib: 'unknown',
    traffic: 'unknown',
    freshness: 'unqualified',
    ceSampleFreshnessQualified: false,
  };
}

// plugins/azure/src/ce/relay-workflow.ts
import { randomBytes as randomBytes2 } from 'node:crypto';

var name2 = 'relay-routing-workflow.json';
var require25 = (condition, message) => {
  if (!condition) throw Error(`Azure relay workflow: ${message}`);
};
async function ensureAzureRelayRoutingWorkflow(source, expected, runtime, storage, api, signal) {
  const context = await azureRelayCurrentIdentityContext(source, expected, runtime, storage, api, signal);
  ({ source, expected } = context);
  const { plan, binding, deadline, bounded, observe } = context;
  let journal;
  try {
    journal = await storage.read(name2);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (journal)
    require25(
      Object.keys(journal).sort().join(',') ===
        'bindingSha256,engine,identity,relayPlanSha256,relays,schemaVersion,siteUid,sourcePlanSha256' &&
        journal.schemaVersion === 2 &&
        journal.engine === source.engine &&
        journal.sourcePlanSha256 === source.planSha256 &&
        journal.relayPlanSha256 === plan.planSha256 &&
        typeof journal.siteUid === 'string' &&
        /^[a-f0-9]{64}$/.test(journal.bindingSha256) &&
        journal.relays &&
        typeof journal.relays === 'object' &&
        !Array.isArray(journal.relays),
      'checkpoint owner or shape differs',
    );
  const initial = await observe();
  if (journal)
    require25(
      journal.siteUid === initial.siteUid &&
        journal.bindingSha256 === initial.bindingSha256 &&
        canonicalSha256(journal.identity.stable) === initial.bindingSha256 &&
        Object.keys(journal.relays).every((relay) => plan.relays.some((item) => item.name === relay)),
      'checkpoint site or current cloud/CE binding differs',
    );
  else {
    journal = {
      schemaVersion: 2,
      identity: structuredClone(initial.identity),
      engine: source.engine,
      sourcePlanSha256: source.planSha256,
      relayPlanSha256: plan.planSha256,
      siteUid: initial.siteUid,
      bindingSha256: initial.bindingSha256,
      relays: {},
    };
    await storage.write(name2, journal);
  }
  for (const [index, relayName] of Object.keys(journal.relays).entries()) {
    require25(relayName === plan.relays[index]?.name, 'checkpoint relay submission order differs');
    const entry = journal.relays[relayName];
    require25(
      entry &&
        Object.keys(entry).sort().join(',') ===
          ['nonce', 'requestSha256', 'submitted', ...(entry.receipt ? ['receipt'] : [])].sort().join(',') &&
        entry.submitted === true &&
        /^[a-f0-9]{32}$/.test(entry.nonce),
      'checkpoint guest submission differs',
    );
    const request = compileAzureRelayGuestActivation(
      source,
      plan,
      relayName,
      initial.server,
      initial.endpoints,
      entry.nonce,
    );
    require25(entry.requestSha256 === request.requestSha256, 'checkpoint guest request differs');
  }
  require25(
    new Set(Object.values(journal.relays).map((entry) => entry.nonce)).size === Object.keys(journal.relays).length,
    'checkpoint guest nonces are duplicated',
  );
  const revalidate = async () => {
    await storage.verify();
    const current = await observe();
    require25(
      current.siteUid === journal?.siteUid && current.bindingSha256 === journal.bindingSha256,
      'current cloud/CE/site binding changed',
    );
    return current;
  };
  await revalidate();
  await bounded(() =>
    runtime.ensureAzureRelayRouting(
      binding,
      plan.localAsn,
      initial.slo.map((row) => ({ node: row.node, role: 'slo', interfaceName: row.interfaceName })),
      plan.relays.map((relay) => ({ name: relay.name, address: relay.privateAddress, asn: relay.asn })),
      (record) => storage.write('platform-relay-routing.json', record),
      deadline,
    ),
  );
  for (const relay of plan.relays) {
    const current = await revalidate();
    let entry = journal.relays[relay.name];
    if (entry)
      require25(
        entry.submitted === true && /^[a-f0-9]{32}$/.test(entry.nonce) && /^[a-f0-9]{64}$/.test(entry.requestSha256),
        'checkpoint guest submission differs',
      );
    const nonce = entry?.nonce ?? randomBytes2(16).toString('hex');
    const activation = compileAzureRelayGuestActivation(
      source,
      plan,
      relay.name,
      current.server,
      current.endpoints,
      nonce,
    );
    if (entry) require25(entry.requestSha256 === activation.requestSha256, 'checkpoint guest request differs');
    const request = entry ? compileAzureRelayGuestObservation(activation) : activation;
    if (!entry) {
      entry = { nonce, requestSha256: activation.requestSha256, submitted: true };
      journal.relays[relay.name] = entry;
      await storage.write(name2, journal);
    }
    const raw = await bounded(() => api.exec('az', request.args, { signal: deadline }));
    require25(raw.exitCode === 0, 'guest command outcome unavailable');
    const receipt = parseAzureRelayGuestReceipt(request, JSON.parse(raw.stdout));
    await revalidate();
    entry.receipt = receipt;
    await storage.write(name2, journal);
  }
  for (const relay of plan.relays) {
    const current = await revalidate();
    const entry = journal.relays[relay.name];
    const activation = compileAzureRelayGuestActivation(
      source,
      plan,
      relay.name,
      current.server,
      current.endpoints,
      entry.nonce,
    );
    require25(entry.requestSha256 === activation.requestSha256, 'final guest request binding differs');
    const request = compileAzureRelayGuestObservation(activation);
    const raw = await bounded(() => api.exec('az', request.args, { signal: deadline }));
    require25(raw.exitCode === 0, 'final guest observation unavailable');
    entry.receipt = parseAzureRelayGuestReceipt(request, JSON.parse(raw.stdout));
    await revalidate();
    await storage.write(name2, journal);
  }
  await revalidate();
  deadline.throwIfAborted();
  return {
    status: 'configured',
    sourcePlanSha256: source.planSha256,
    relayPlanSha256: plan.planSha256,
    siteUid: journal.siteUid,
    bindingSha256: journal.bindingSha256,
    guestReceipts: plan.relays.map((relay) => journal?.relays[relay.name].receipt),
    observedAt: new Date().toISOString(),
    routing: 'unknown',
    traffic: 'unknown',
    ceSampleFreshnessQualified: false,
  };
}

// plugins/azure/src/ce/relay-routing-dispatch.ts
function requireAzureCeRoutingContract(plan, runtime) {
  verifyAzureCePlan(plan);
  if (runtime.engine !== plan.engine) throw Error('Azure routing execution engine differs from the owning plan');
  if (plan.routing.mode !== 'route-server') return;
  if (plan.relayProfile) runtime.requireAzureRelayRoutingContract();
  else runtime.requireRoutingContract('azure');
}
var defaults = { configure: ensureAzureRelayRoutingWorkflow, observe: observeAzureRelayRoutingWorkflow };
async function configureAzureSelectedRelayRouting(plan, expected, runtime, storage, api, signal, drivers = defaults) {
  signal?.throwIfAborted();
  verifyAzureCePlan(plan);
  if (!plan.relayProfile || plan.routing.mode !== 'route-server') throw Error('Azure relay routing is not selected');
  if (runtime.engine !== plan.engine) throw Error('Azure relay routing execution engine differs');
  runtime.requireAzureRelayRoutingContract();
  await storage.verify();
  if (plan.relayProfile.schemaVersion === 2) {
    const original = storage;
    const name = (file) => `${plan.planId}-replacement-${file}`;
    storage = {
      owner: original.owner,
      verify: () => original.verify(),
      read: (file) => original.read(name(file)),
      write: (file, value) => original.write(name(file), value),
    };
  }
  const configuration = await drivers.configure(plan, expected, runtime, storage, api, signal);
  await storage.write('relay-routing-configuration.json', configuration);
  signal?.throwIfAborted();
  const observation = await drivers.observe(plan, expected, runtime, storage, api, signal);
  await storage.write('relay-routing-observation.json', observation);
  await storage.verify();
  signal?.throwIfAborted();
  return {
    planId: plan.planId,
    planSha256: plan.planSha256,
    engine: plan.engine,
    status: observation.routing,
    configuration,
    observation,
    routing: observation.routing,
    traffic: observation.traffic,
    ceSampleFreshnessQualified: observation.ceSampleFreshnessQualified,
  };
}

// plugins/azure/src/ce/native-workflow.ts
var lower7 = (value) => (typeof value === 'string' ? value.toLowerCase() : '');
var checkpointName = (plan) => `native-admission-${plan.planSha256}.json`;
async function readCheckpoint(plan, storage) {
  let checkpoint;
  try {
    checkpoint = await storage.read(checkpointName(plan));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    checkpoint = {
      schemaVersion: 1,
      engine: 'native',
      planSha256: plan.planSha256,
      siteReserved: false,
      bootstrapByNode: {},
      launchedAtByNode: {},
    };
    await storage.write(checkpointName(plan), checkpoint);
  }
  validateAzureNativeAdmissionCheckpoint(plan, checkpoint);
  return checkpoint;
}
function validateAzureNativeAdmissionCheckpoint(plan, checkpoint) {
  const bootstrappedNodes = Object.keys(checkpoint.bootstrapByNode);
  const launchedNodes = Object.keys(checkpoint.launchedAtByNode);
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.engine !== 'native' ||
    checkpoint.planSha256 !== plan.planSha256 ||
    typeof checkpoint.siteReserved !== 'boolean' ||
    !checkpoint.bootstrapByNode ||
    typeof checkpoint.bootstrapByNode !== 'object' ||
    Object.entries(checkpoint.bootstrapByNode).some(
      ([node, bootstrap]) =>
        !/^[1-3]$/.test(node) ||
        Number(node) > plan.topology.nodeCount ||
        typeof bootstrap !== 'string' ||
        !bootstrap.startsWith('#cloud-config') ||
        !bootstrap.includes('/etc/vpm/user_data') ||
        /__\w+__/.test(bootstrap),
    ) ||
    !checkpoint.launchedAtByNode ||
    typeof checkpoint.launchedAtByNode !== 'object' ||
    Object.entries(checkpoint.launchedAtByNode).some(
      ([node, launchedAt]) => !checkpoint.bootstrapByNode[node] || Number.isNaN(Date.parse(launchedAt)),
    ) ||
    launchedNodes.length > bootstrappedNodes.length ||
    (plan.intent.operation === 'deploy' &&
      (bootstrappedNodes.some((node, index) => Number(node) !== index + 1) ||
        launchedNodes.some((node, index) => Number(node) !== index + 1) ||
        (bootstrappedNodes.length > 0 && !checkpoint.siteReserved)))
  )
    throw new Error('Azure native admission checkpoint differs from the owning plan');
  const replacement = checkpoint.replacement;
  if (replacement !== undefined) {
    validateAzureNativeReplacementState(plan, replacement);
  } else if (plan.intent.operation === 'replace-node' && (bootstrappedNodes.length || launchedNodes.length)) {
    throw new Error('Azure native replacement evidence is missing before bootstrap');
  }
}
function validateAzureNativeReplacementState(plan, replacement) {
  if (plan.networkReplacementProfile) validateAzureNativeNetworkReplacementMetadata2(plan, replacement);
  if (!plan.relayProfile && !plan.networkReplacementProfile && replacement.originalSourcePlan)
    verifyAzureNativeReplacementOriginalSource(plan, replacement.originalSourcePlan);
  const keys = Object.keys(replacement).sort().join(',');
  const expectedKeys = [
    ...(replacement.newVmId ? ['newVmId'] : []),
    'node',
    'oldVmIds',
    'ownerPlanSha256ByNode',
    ...(replacement.routeServer ? ['routeServer'] : []),
    ...(replacement.retainedNics ? ['retainedNics'] : []),
    ...(replacement.originalSourcePlan ? ['originalSourcePlan'] : []),
    ...(plan.networkReplacementProfile ? ['networkSourcePlan', 'networkInventory', 'networkHistorySha256'] : []),
    'siteConfigurationSha256',
    'siteUid',
    'status',
  ]
    .sort()
    .join(',');
  const nodes = Array.from({ length: plan.topology.nodeCount }, (_, index) => `${plan.deploymentName}-${index + 1}`);
  if (
    plan.intent.operation !== 'replace-node' ||
    keys !== expectedKeys ||
    replacement.node !== plan.intent.replacementNode ||
    !replacement.siteUid ||
    !/^[a-f0-9]{64}$/.test(replacement.siteConfigurationSha256) ||
    !['prepared', 'registered'].includes(replacement.status) ||
    Object.keys(replacement.oldVmIds).sort().join(',') !== nodes.sort().join(',') ||
    Object.keys(replacement.ownerPlanSha256ByNode).sort().join(',') !== nodes.sort().join(',') ||
    Object.values(replacement.oldVmIds).some((id) => !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) ||
    new Set(Object.values(replacement.oldVmIds).map((id) => id.toLowerCase())).size !== nodes.length ||
    Object.entries(replacement.ownerPlanSha256ByNode).some(
      ([node, digest]) =>
        !/^[a-f0-9]{64}$/.test(digest) ||
        (plan.relayProfile?.schemaVersion === 2 &&
          digest !==
            azureRelayReplacementRetainedOwner(
              plan,
              `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${node}`,
            )),
    ) ||
    !replacement.retainedNics ||
    (plan.relayProfile
      ? plan.relayProfile.schemaVersion !== 2 ||
        replacement.originalSourcePlan !== undefined ||
        !validAzureRelayRetainedNics(plan, replacement.retainedNics)
      : !replacement.originalSourcePlan ||
        (!plan.networkReplacementProfile &&
          !validAzureRetainedNicsForSource(replacement.originalSourcePlan, replacement.retainedNics))) ||
    (plan.routing.mode === 'route-server') !== Boolean(replacement.routeServer) ||
    (replacement.routeServer !== undefined &&
      !validAzureReplacementRouteServerOwnership(plan, replacement.routeServer)) ||
    (replacement.status === 'registered') !== Boolean(replacement.newVmId) ||
    (replacement.newVmId !== undefined &&
      (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(replacement.newVmId) ||
        Object.values(replacement.oldVmIds).some((id) => id.toLowerCase() === replacement.newVmId?.toLowerCase())))
  )
    throw new Error('Azure native replacement checkpoint differs from the owning plan');
}
var waitUntil = async (notBefore, signal) => {
  const remaining = notBefore - Date.now();
  if (remaining <= 0) return;
  await new Promise((resolve, reject) => {
    const aborted = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('Azure native HA admission cancelled'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', aborted);
      resolve();
    }, remaining);
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) aborted();
  });
};
async function prepareAzureNativeAdmission(plan, runtime, storage, signal) {
  if (plan.engine !== 'native' || runtime.engine !== 'native')
    throw new Error('Azure native workflow requires native ownership');
  if (plan.actions.some((action) => action.requiresBootstrap)) runtime.requireBootstrapContract('azure');
  requireAzureCeRoutingContract(plan, runtime);
  await storage.verify();
  const checkpoint = await readCheckpoint(plan, storage);
  if (plan.intent.operation === 'deploy') {
    await runtime.reserveSite(
      azureUpgradeBinding(plan),
      (record) => storage.write('native-site.json', record),
      signal,
      plan.intent.workloadFixture ? [plan.intent.workloadFixture.cidr] : [],
    );
    checkpoint.siteReserved = true;
    await storage.write(checkpointName(plan), checkpoint);
  }
  return checkpoint;
}
async function prepareAzureNativeReplacement(plan, checkpoint, api, runtime, storage, signal, networkSource) {
  if (plan.intent.operation !== 'replace-node' || !plan.intent.replacementNode)
    throw new Error('Azure native replacement requires an exact selected node');
  await storage.verify();
  const binding = azureUpgradeBinding(plan);
  const site = await runtime.observeOwnedSite(binding, signal);
  const metadata = site.system_metadata;
  const siteUid = typeof metadata?.uid === 'string' ? metadata.uid : '';
  if (!siteUid) throw new Error('Azure native replacement site identity is unavailable');
  const siteConfigurationSha256 = canonicalSha256(runtime.ownedSiteConfiguration(binding, site));
  if (plan.networkReplacementProfile) {
    if (
      !networkSource ||
      networkSource.source.siteUid !== siteUid ||
      networkSource.source.siteConfigurationSha256 !== siteConfigurationSha256
    )
      throw Error('Azure native network replacement qualified site binding differs');
    const routeServer =
      plan.routing.mode === 'route-server'
        ? await captureAzureReplacementRouteServerOwnership(plan, api, signal)
        : undefined;
    if (routeServer && routeServer.ownerPlanSha256 !== networkSource.original.planSha256)
      throw Error('Azure native network replacement original Route Server owner differs');
    if (checkpoint.replacement) {
      validateAzureNativeAdmissionCheckpoint(plan, checkpoint);
      if (
        checkpoint.replacement.siteUid !== siteUid ||
        checkpoint.replacement.siteConfigurationSha256 !== siteConfigurationSha256 ||
        canonicalSha256(checkpoint.replacement.routeServer ?? null) !== canonicalSha256(routeServer ?? null)
      )
        throw Error('Azure native network replacement retained site or Route Server changed');
      return;
    }
    checkpoint.replacement = {
      node: plan.intent.replacementNode,
      oldVmIds: Object.fromEntries(
        Object.entries(networkSource.networkInventory.nodes).map(([index, vm]) => [
          `${plan.deploymentName}-${index}`,
          vm.vmId,
        ]),
      ),
      ownerPlanSha256ByNode: Object.fromEntries(
        Object.entries(networkSource.networkInventory.nodes).map(([index, vm]) => [
          `${plan.deploymentName}-${index}`,
          vm.ownerPlanSha256,
        ]),
      ),
      siteUid,
      siteConfigurationSha256,
      status: 'prepared',
      originalSourcePlan: networkSource.original,
      networkSourcePlan: networkSource.networkSource,
      networkInventory: networkSource.networkInventory,
      networkHistorySha256: networkSource.historySha256,
      retainedNics: azureNativeNetworkReplacementNics2(networkSource.networkInventory),
      ...(routeServer ? { routeServer } : {}),
    };
    validateAzureNativeAdmissionCheckpoint(plan, checkpoint);
    await storage.write(checkpointName(plan), checkpoint);
    return;
  }
  if (checkpoint.replacement) {
    if (
      checkpoint.replacement.siteUid !== siteUid ||
      checkpoint.replacement.siteConfigurationSha256 !== siteConfigurationSha256
    )
      throw new Error('Azure native replacement site identity or configuration changed');
    if (!plan.relayProfile) {
      const { original } = await qualifyAzureNativeReplacementOriginalSource(
        plan,
        checkpoint.replacement.oldVmIds,
        checkpoint.replacement.ownerPlanSha256ByNode,
        siteUid,
        storage,
      );
      if (
        canonicalSha256(original) !== canonicalSha256(checkpoint.replacement.originalSourcePlan) ||
        canonicalSha256(await captureAzureRetainedNicsForSource(original, api, signal)) !==
          canonicalSha256(checkpoint.replacement.retainedNics)
      )
        throw Error('Azure native replacement retained source or interfaces changed');
    }
    if (
      plan.relayProfile &&
      canonicalSha256(await captureAzureReplacementRouteServerOwnership(plan, api, signal)) !==
        canonicalSha256(checkpoint.replacement.routeServer)
    )
      throw Error('Azure native replacement retained relay ownership changed');
    return;
  }
  const rows = await listAzureNativeVms(plan, api);
  const oldVmIds = {};
  const ownerPlanSha256ByNode = {};
  for (let index = 1; index <= plan.topology.nodeCount; index++) {
    const node = `${plan.deploymentName}-${index}`;
    const resourceId = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${node}`;
    const matches = rows.filter((row) => row && typeof row === 'object' && lower7(row.id) === resourceId.toLowerCase());
    const vm = matches.length === 1 ? matches[0] : undefined;
    const tags = vm?.tags;
    const vmId = vm?.vmId;
    const ownerPlanSha256 = tags?.['xcsh-plan-sha256'];
    if (
      !vm ||
      typeof vmId !== 'string' ||
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(vmId) ||
      tags?.['xcsh-managed-by'] !== 'azure-ce' ||
      tags?.['xcsh-deployment-id'] !== plan.deploymentName ||
      tags?.['xcsh-execution-engine'] !== 'native' ||
      typeof ownerPlanSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(ownerPlanSha256) ||
      (plan.relayProfile?.schemaVersion === 2 &&
        ownerPlanSha256 !== azureRelayReplacementRetainedOwner(plan, resourceId))
    )
      throw new Error('Azure native replacement VM identity or ownership is unavailable');
    oldVmIds[node] = vmId;
    ownerPlanSha256ByNode[node] = ownerPlanSha256;
  }
  const targetNode = `${plan.deploymentName}-${plan.intent.replacementNode}`;
  const deleteAction = plan.actions.find(
    (action) => action.kind === 'vm-delete' && action.node === plan.intent.replacementNode,
  );
  if (
    !deleteAction ||
    deleteAction.expectedOwnerPlanSha256 !== ownerPlanSha256ByNode[targetNode] ||
    deleteAction.resourceId?.toLowerCase() !==
      `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${targetNode}`.toLowerCase()
  )
    throw new Error('Azure native replacement delete boundary differs from the observed VM');
  const routeServer =
    plan.routing.mode === 'route-server'
      ? await captureAzureReplacementRouteServerOwnership(plan, api, signal)
      : undefined;
  const retainedSource = !plan.relayProfile
    ? await qualifyAzureNativeReplacementOriginalSource(plan, oldVmIds, ownerPlanSha256ByNode, siteUid, storage)
    : undefined;
  const originalSourcePlan = retainedSource?.original;
  const retainedNics =
    plan.relayProfile?.schemaVersion === 2
      ? await captureAzureRelayRetainedNics(plan, api, signal)
      : originalSourcePlan
        ? await captureAzureRetainedNicsForSource(originalSourcePlan, api, signal)
        : undefined;
  if (retainedSource?.retainedNics && canonicalSha256(retainedSource.retainedNics) !== canonicalSha256(retainedNics))
    throw Error('Azure native replacement prior retained interface identities changed');
  if (originalSourcePlan && routeServer && routeServer.ownerPlanSha256 !== originalSourcePlan.planSha256)
    throw Error('Azure native replacement original Route Server owner differs');
  checkpoint.replacement = {
    node: plan.intent.replacementNode,
    oldVmIds,
    ownerPlanSha256ByNode,
    siteUid,
    siteConfigurationSha256,
    status: 'prepared',
    ...(routeServer ? { routeServer } : {}),
    ...(retainedNics ? { retainedNics } : {}),
    ...(originalSourcePlan ? { originalSourcePlan } : {}),
  };
  validateAzureNativeAdmissionCheckpoint(plan, checkpoint);
  await storage.write(checkpointName(plan), checkpoint);
}
async function azureNativeBootstrapForAction(
  plan,
  action,
  checkpoint,
  runtime,
  storage,
  signal,
  haSerialDelayMs = 180000,
) {
  if (!action.requiresBootstrap || !action.node) throw new Error('Azure bootstrap action identity is unavailable');
  const node = String(action.node);
  if (plan.intent.operation === 'deploy' && plan.topology.ha && action.node > 1) {
    const previous = checkpoint.launchedAtByNode[String(action.node - 1)];
    if (!previous) throw new Error('Prior Azure HA node launch boundary is unavailable');
    await waitUntil(Date.parse(previous) + haSerialDelayMs, signal);
  }
  await storage.verify();
  if (!checkpoint.bootstrapByNode[node]) {
    const nodeName = `${plan.deploymentName}-${node}`;
    const tokenName = `${plan.deploymentName.slice(0, 40)}-${node}-${plan.planSha256.slice(0, 12)}`;
    checkpoint.bootstrapByNode[node] = await runtime.bootstrap(
      azureUpgradeBinding(plan),
      nodeName,
      tokenName,
      (secret) => storage.write(`${tokenName}.json`, secret),
      signal,
    );
    await storage.write(checkpointName(plan), checkpoint);
  }
  return checkpoint.bootstrapByNode[node];
}
async function recordAzureNativeLaunch(plan, node, checkpoint, storage) {
  checkpoint.launchedAtByNode[String(node)] ??= new Date().toISOString();
  await storage.write(checkpointName(plan), checkpoint);
}
async function withAzureNativeBootstrapFile(bootstrap, run) {
  if (!bootstrap.startsWith('#cloud-config') || !bootstrap.includes('/etc/vpm/user_data') || /__\w+__/.test(bootstrap))
    throw new Error('Azure native admission requires resolved platform cloud-init');
  const directory = await mkdtemp(join2(tmpdir(), 'xcsh-azure-ce-'));
  await chmod(directory, 448);
  const path = join2(directory, 'cloud-init.yaml');
  try {
    await writeFile2(path, bootstrap, { mode: 384, flag: 'wx' });
    return await run(path);
  } finally {
    await rm2(directory, { recursive: true, force: true });
  }
}
async function collectAzureNativeVmState(plan, action, api, signal) {
  if (
    action.kind !== 'vm-state-gate' ||
    !action.node ||
    !action.expectedPowerState ||
    !action.expectedOwnerPlanSha256 ||
    !/^[a-f0-9]{64}$/.test(action.expectedOwnerPlanSha256) ||
    action.mutates ||
    action.command ||
    action.args
  )
    throw new Error('Azure VM state gate is malformed');
  const name = `${plan.deploymentName}-${action.node}`;
  const vm = plan.actions.filter((candidate) => candidate.kind === 'vm-create' && candidate.node === action.node);
  const resourceId =
    vm.length === 1 && vm[0].resourceId
      ? vm[0].resourceId
      : `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${name}`;
  signal?.throwIfAborted();
  const result = await api.exec(
    'az',
    ['vm', 'show', '--ids', resourceId, '--show-details', '--subscription', plan.subscription.id, '--output', 'json'],
    signal ? { signal } : undefined,
  );
  signal?.throwIfAborted();
  if (result.exitCode !== 0) throw new Error('Azure VM state observation unavailable');
  let value;
  try {
    value = JSON.parse(result.stdout);
  } catch {
    throw new Error('Malformed Azure VM state observation');
  }
  const powerState =
    typeof value.powerState === 'string' ? value.powerState.toLowerCase().replace(/^vm\s+/, '') : 'unknown';
  const tags = value.tags;
  if (
    typeof value.id !== 'string' ||
    value.id.toLowerCase() !== resourceId.toLowerCase() ||
    value.name !== name ||
    typeof value.location !== 'string' ||
    value.location.toLowerCase() !== plan.region.toLowerCase() ||
    value.provisioningState !== 'Succeeded' ||
    tags?.['xcsh-managed-by'] !== 'azure-ce' ||
    tags?.['xcsh-deployment-id'] !== plan.deploymentName ||
    tags?.['xcsh-execution-engine'] !== plan.engine ||
    tags?.['xcsh-plan-sha256'] !== action.expectedOwnerPlanSha256
  )
    throw new Error('Azure VM state identity or ownership differs');
  return {
    planId: plan.planId,
    planSha256: plan.planSha256,
    engine: plan.engine,
    subscriptionId: plan.subscription.id,
    region: plan.region,
    deploymentId: plan.deploymentName,
    node: action.node,
    resourceId,
    source: 'azure-cli-live',
    observedAt: new Date().toISOString(),
    expectedPowerState: action.expectedPowerState,
    ownerPlanSha256: action.expectedOwnerPlanSha256,
    expectedVmSize: action.expectedVmSize,
    vmSize: typeof value.hardwareProfile?.vmSize === 'string' ? value.hardwareProfile.vmSize : 'unknown',
    powerState,
    status:
      powerState === action.expectedPowerState &&
      (action.expectedVmSize === undefined || value.hardwareProfile?.vmSize === action.expectedVmSize)
        ? 'healthy'
        : 'degraded',
  };
}
async function listAzureNativeVms(plan, api) {
  const result = await api.exec('az', [
    'vm',
    'list',
    '--resource-group',
    plan.intent.resourceGroup,
    '--show-details',
    '--subscription',
    plan.subscription.id,
    '--output',
    'json',
  ]);
  if (result.exitCode !== 0) throw new Error('Azure VM identity observation unavailable');
  let value;
  try {
    value = JSON.parse(result.stdout);
  } catch {
    throw new Error('Malformed Azure VM identity observation');
  }
  if (!Array.isArray(value)) throw new Error('Incomplete Azure VM identity observation');
  return value;
}
async function collectAzureNativeAdmissionHealth(
  plan,
  admittedNodeCount,
  api,
  runtime,
  storage,
  signal,
  nativeCheckpoint,
) {
  await storage.verify();
  const vms = await listAzureNativeVms(plan, api);
  const admittedNodes = Array.from({ length: admittedNodeCount }, (_, index) => `${plan.deploymentName}-${index + 1}`);
  const scope =
    `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/`.toLowerCase();
  const instances = Object.fromEntries(
    admittedNodes.map((node) => {
      const matches = vms.filter(
        (vm) =>
          vm &&
          typeof vm === 'object' &&
          typeof vm.id === 'string' &&
          vm.id.toLowerCase() === scope + node.toLowerCase(),
      );
      if (matches.length !== 1) throw new Error('Azure admitted VM identity is missing or ambiguous');
      const vmId = matches[0].vmId;
      if (typeof vmId !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(vmId))
        throw new Error('Azure admitted VM UUID is unavailable');
      return [node, vmId];
    }),
  );
  if (new Set(Object.values(instances).map((id) => id.toLowerCase())).size !== admittedNodes.length)
    throw Error('Azure admitted VM UUIDs are duplicated');
  if (nativeCheckpoint) validateAzureNativeAdmissionCheckpoint(plan, nativeCheckpoint);
  const replacement = plan.intent.operation === 'replace-node' ? nativeCheckpoint?.replacement : undefined;
  if (plan.intent.operation === 'replace-node') {
    const target = `${plan.deploymentName}-${plan.intent.replacementNode}`;
    if (
      !replacement ||
      replacement.node !== plan.intent.replacementNode ||
      instances[target]?.toLowerCase() === replacement.oldVmIds[target]?.toLowerCase() ||
      (replacement.newVmId !== undefined && instances[target]?.toLowerCase() !== replacement.newVmId.toLowerCase()) ||
      Object.entries(instances).some(
        ([node, vmId]) => node !== target && vmId.toLowerCase() !== replacement.oldVmIds[node]?.toLowerCase(),
      )
    )
      throw new Error('Azure native replacement VM identities did not change exactly once');
  }
  const binding = azureUpgradeBinding(plan);
  await runtime.approveRegistrations(
    binding,
    instances,
    (record) => storage.write(`native-registration-node-${admittedNodeCount}.json`, record),
    signal,
    admittedNodes,
  );
  const replacementOwners = replacement
    ? Object.fromEntries(
        Object.entries(replacement.ownerPlanSha256ByNode).map(([node, digest]) => [
          node,
          node === `${plan.deploymentName}-${replacement.node}` ? plan.planSha256 : digest,
        ]),
      )
    : undefined;
  const health = await collectAzurePlatformHealth(plan, vms, runtime, signal, admittedNodeCount, replacementOwners);
  if (admittedNodeCount !== plan.topology.nodeCount) return health;
  const expectedInterfaces = [];
  for (const node of admittedNodes)
    for (const nic of plan.nics.filter((item) => item.role === 'slo' || item.role === 'data' || item.role === 'sli')) {
      const name = `${node}-nic${nic.index}`;
      const result = await api.exec('az', [
        'network',
        'nic',
        'show',
        '--resource-group',
        plan.intent.resourceGroup,
        '--name',
        name,
        '--subscription',
        plan.subscription.id,
        '--output',
        'json',
      ]);
      if (result.exitCode !== 0) throw new Error('Azure NIC identity observation unavailable');
      let value;
      try {
        value = JSON.parse(result.stdout);
      } catch {
        throw new Error('Malformed Azure NIC identity observation');
      }
      const expectedId = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network/networkInterfaces/${name}`;
      const expectedVm = `${scope}${node}`;
      const tags = value.tags;
      const rawMac = typeof value.macAddress === 'string' ? value.macAddress.replaceAll('-', ':').toLowerCase() : '';
      if (
        typeof value.id !== 'string' ||
        value.id.toLowerCase() !== expectedId.toLowerCase() ||
        value.provisioningState !== 'Succeeded' ||
        typeof value.virtualMachine?.id !== 'string' ||
        value.virtualMachine.id.toLowerCase() !== expectedVm ||
        tags?.['xcsh-managed-by'] !== 'azure-ce' ||
        tags?.['xcsh-deployment-id'] !== plan.deploymentName ||
        tags?.['xcsh-execution-engine'] !== plan.engine ||
        tags?.['xcsh-plan-sha256'] !==
          (replacement?.retainedNics?.[`${binding.nodes.indexOf(node) + 1}:${nic.index}`]?.ownerPlanSha256 ??
            replacement?.ownerPlanSha256ByNode[node] ??
            (() => {
              const owners = new Set(
                plan.actions
                  .filter(
                    (action) =>
                      action.kind === 'nic-update' &&
                      action.resourceId?.toLowerCase() === expectedId.toLowerCase() &&
                      action.expectedOwnerPlanSha256,
                  )
                  .map((action) => action.expectedOwnerPlanSha256),
              );
              return owners.size === 1 ? [...owners][0] : plan.planSha256;
            })()) ||
        !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(rawMac)
      )
        throw new Error('Azure NIC ownership or MAC binding is unavailable');
      expectedInterfaces.push({ node, role: nic.role, mac: rawMac });
    }
  if (
    replacement?.retainedNics &&
    canonicalSha256(
      plan.relayProfile
        ? await captureAzureRelayRetainedNics(plan, api, signal)
        : plan.networkReplacementProfile
          ? await captureAzureNativeNetworkReplacementNics2(plan, replacement.networkInventory, api, signal)
          : await captureAzureRetainedNicsForSource(replacement.originalSourcePlan, api, signal),
    ) !== canonicalSha256(replacement.retainedNics)
  )
    throw Error('Azure native replacement retained interface identity changed');
  const configuration = await runtime.observeRegisteredConfiguration(binding, instances, expectedInterfaces, signal);
  let siteSnapshot;
  if (
    health.status === 'healthy' &&
    configuration.status === 'configured' &&
    runtime.observeOwnedSite &&
    runtime.ownedSiteConfiguration
  ) {
    const site = await runtime.observeOwnedSite(binding, signal),
      siteUid = site.system_metadata?.uid,
      siteConfiguration = runtime.ownedSiteConfiguration(binding, site);
    if (typeof siteUid !== 'string' || !siteUid.trim() || configuration.siteUid !== siteUid)
      throw Error('Azure native registered configuration differs from the owned logical site');
    siteSnapshot = { siteUid, siteConfiguration, siteConfigurationSha256: canonicalSha256(siteConfiguration) };
  }
  if (replacement && health.status === 'healthy' && configuration.status === 'configured') {
    if (!runtime.observeOwnedSite || !runtime.ownedSiteConfiguration)
      throw new Error('Azure native replacement platform identity observer is unavailable');
    const site = await runtime.observeOwnedSite(binding, signal);
    const siteUid = site.system_metadata?.uid;
    if (
      siteUid !== replacement.siteUid ||
      canonicalSha256(runtime.ownedSiteConfiguration(binding, site)) !== replacement.siteConfigurationSha256
    )
      throw new Error('Azure native replacement changed the logical site identity or configuration');
    const target = `${plan.deploymentName}-${replacement.node}`;
    replacement.status = 'registered';
    replacement.newVmId = instances[target];
    await storage.write(checkpointName(plan), nativeCheckpoint);
  }
  return {
    ...health,
    configuration,
    ...siteSnapshot,
    status: health.status === 'healthy' && configuration.status === 'configured' ? 'healthy' : 'unknown',
  };
}

// plugins/azure/src/ce/network-update-native-source.ts
var require26 = (condition, message) => {
  if (!condition) throw Error(`Azure native network source: ${message}`);
};
var object25 = (value) => {
  require26(value && typeof value === 'object' && !Array.isArray(value), 'malformed provenance record');
  return value;
};
var same10 = canonicalEqual;
var lower8 = (value) => (typeof value === 'string' ? value.toLowerCase() : '');
async function qualifyAzureNativeNetworkUpdateSource(plan, before, store, load) {
  verifyAzureCePlan(plan);
  await store.verify();
  require26(
    plan.engine === 'native' && !plan.relayProfile && plan.intent.operation === 'update-network',
    'owned native network plan required',
  );
  const profile = verifyAzureNativeNetworkProfile(plan);
  const owners = new Set(
    Object.values(before.nodes).flatMap((node) => Object.values(node.nics).map((nic) => nic.ownerPlanSha256)),
  );
  require26(owners.size === 1, 'retained NICs do not identify one original creation');
  const digest = [...owners][0],
    original = await store.read(`native-source-${digest}.json`);
  verifyAzureCePlan(original);
  require26(
    profile.originalPlanSha256 === digest &&
      original.planSha256 === digest &&
      original.intent.operation === 'deploy' &&
      original.engine === 'native' &&
      !original.relayProfile &&
      same10(azureUpgradeBinding(plan), azureUpgradeBinding(original)) &&
      same10(azureNativeNetworkScope(plan, true), azureNativeNetworkScope(original, true)),
    'original creation scope differs beyond permitted subnets',
  );
  const site = object25(await store.read('native-site.json'));
  const generations = new Set(),
    boundaries = new Map();
  const readSource = async (sha) => {
    const source = await store.read(`native-source-${sha}.json`);
    verifyAzureCePlan(source);
    require26(
      source.planSha256 === sha &&
        source.engine === 'native' &&
        !source.relayProfile &&
        (source.networkReplacementProfile
          ? same10(azureNativeNetworkScope(source, true), azureNativeNetworkScope(original, true))
          : same10(azureNativeNetworkScope(source, false), azureNativeNetworkScope(original, false))) &&
        same10(azureUpgradeBinding(source), azureUpgradeBinding(original)),
      'prior generation source scope differs',
    );
    if (source.networkReplacementProfile) {
      const network = await store.read(
        `native-source-${source.networkReplacementProfile.retainedNetworkPlanSha256}.json`,
      );
      verifyAzureNativeNetworkReplacementOriginalSource(source, original, network);
      await readAzureNativeNetworkGenerationCompletion(source, store, load);
    }
    const publicCheckpoint = await load(source);
    require26(
      publicCheckpoint?.state === 'complete' &&
        !publicCheckpoint.pendingAction &&
        same10(
          publicCheckpoint.completedActionIds,
          source.actions.map((action) => action.id),
        ),
      'prior generation public execution is incomplete',
    );
    const admission = await store.read(`native-admission-${sha}.json`);
    validateAzureNativeAdmissionCheckpoint(source, admission);
    const expected =
      source.intent.operation === 'deploy'
        ? binding.nodes.map((_, index) => String(index + 1))
        : [String(source.intent.replacementNode)];
    require26(
      admission.siteReserved === (source.intent.operation === 'deploy') &&
        same10(Object.keys(admission.bootstrapByNode).sort(), expected.toSorted()) &&
        same10(Object.keys(admission.launchedAtByNode).sort(), expected.toSorted()) &&
        Object.values(admission.launchedAtByNode).every((at) => Date.parse(at) <= Date.now()),
      'prior generation admission is incomplete',
    );
    generations.add(sha);
    return { source, admission, health: await readAzureNativeFinalConfiguration(source, before, store) };
  };
  const binding = azureUpgradeBinding(original),
    birth = await readSource(digest);
  require26(
    site.siteName === original.siteName &&
      site.uid === birth.health.siteUid &&
      same10(site.owner, binding.owner) &&
      site.contractFingerprint === birth.health.contractFingerprint,
    'original reservation identity differs',
  );
  const histories = await qualifyAzureNativeNetworkHistories(plan, before, original, store, load, {
    siteUid: birth.health.siteUid,
    siteConfigurationSha256: birth.health.siteConfigurationSha256,
  });
  const visit = async (sha, node, vmId, path) => {
    require26(/^[a-f0-9]{64}$/.test(sha) && !path.has(sha), 'cyclic or unresolved VM generation');
    const key = `${sha}:${node}`;
    require26(!boundaries.has(key) || boundaries.get(key) === lower8(vmId), 'inconsistent predecessor UUID');
    boundaries.set(key, lower8(vmId));
    const generation = sha === digest ? birth : await readSource(sha);
    require26(
      lower8(generation.health.instances[node]) === lower8(vmId) &&
        generation.health.siteUid === birth.health.siteUid &&
        generation.health.siteConfigurationSha256 === birth.health.siteConfigurationSha256,
      'historical UUID or site configuration differs',
    );
    if (sha === digest) return;
    const prior = generation.admission.replacement;
    require26(
      generation.source.intent.operation === 'replace-node' &&
        prior?.status === 'registered' &&
        same10(prior.originalSourcePlan, original) &&
        prior.siteUid === birth.health.siteUid &&
        prior.siteConfigurationSha256 === birth.health.siteConfigurationSha256 &&
        generation.source.intent.replacementNode === binding.nodes.indexOf(node) + 1 &&
        lower8(prior.newVmId) === lower8(vmId),
      'prior replacement registration differs',
    );
    for (const name of binding.nodes) {
      if (name !== node)
        require26(
          lower8(generation.health.instances[name]) === lower8(prior?.oldVmIds[name]),
          'replacement survivor UUID differs',
        );
      await visit(prior?.ownerPlanSha256ByNode[name], name, prior?.oldVmIds[name], new Set([...path, sha]));
    }
  };
  for (const [index, node] of binding.nodes.entries()) {
    const vm = before.nodes[String(index + 1)];
    await visit(vm.ownerPlanSha256, node, vm.vmId, new Set());
    for (const nic of original.nics) {
      const saved = histories.originalBoundary.nodes[String(index + 1)].nics[String(nic.index)],
        subnet =
          nic.subnet.resourceId ??
          `/subscriptions/${original.subscription.id}/resourceGroups/${original.intent.resourceGroup}/providers/Microsoft.Network/virtualNetworks/${original.deploymentName}-vnet/subnets/${nic.subnet.name}`;
      require26(
        lower8(saved.subnetId) === lower8(subnet) && (!nic.subnet.cidr || saved.subnetCidr === nic.subnet.cidr),
        'preceding network change requires completed network-history provenance',
      );
    }
  }
  return {
    originalPlanSha256: digest,
    siteUid: birth.health.siteUid,
    siteConfigurationSha256: birth.health.siteConfigurationSha256,
    generationPlanSha256s: [...generations].sort(),
    networkHistoryPlanSha256s: histories.planSha256s,
  };
}
async function verifyAzureNativeNetworkUpdateSite(plan, source, runtime, signal) {
  const binding = azureUpgradeBinding(plan),
    site = await runtime.observeOwnedSite(binding, signal);
  require26(
    object25(site.system_metadata).uid === source.siteUid &&
      canonicalSha256(runtime.ownedSiteConfiguration(binding, site)) === source.siteConfigurationSha256,
    'owned logical-site identity or configuration changed',
  );
}

// plugins/azure/src/ce/native-network-replacement-execution.ts
function require27(condition, message) {
  if (!condition) throw Error(`Azure native network replacement execution: ${message}`);
}
var same11 = canonicalEqual;
var lower9 = (value) => (typeof value === 'string' ? value.toLowerCase() : '');
var object26 = (value) => {
  require27(value && typeof value === 'object' && !Array.isArray(value), 'malformed cloud identity');
  return value;
};
function azureNativeNetworkReplacementNics2(inventory) {
  return Object.fromEntries(
    Object.entries(inventory.nodes).flatMap(([node, vm]) =>
      Object.entries(vm.nics).map(([index, nic]) => [
        `${node}:${index}`,
        {
          resourceId: nic.resourceId,
          subnetId: nic.subnetId,
          mac: nic.mac,
          privateIp: nic.privateIp,
          ownerPlanSha256: nic.ownerPlanSha256,
        },
      ]),
    ),
  );
}
function validateAzureNativeNetworkReplacementMetadata2(plan, value) {
  require27(
    value.originalSourcePlan &&
      value.networkSourcePlan &&
      value.networkInventory &&
      typeof value.networkHistorySha256 === 'string' &&
      /^[a-f0-9]{64}$/.test(value.networkHistorySha256),
    'complete original/network identity metadata required',
  );
  verifyAzureNativeNetworkReplacementOriginalSource(plan, value.originalSourcePlan, value.networkSourcePlan);
  if (plan.networkReplacementProfile?.schemaVersion === 2)
    validateAzureNativeNetworkGenerationInventory(value.networkSourcePlan, value.networkInventory);
  else validateAzureNetworkUpdateInventory(value.networkSourcePlan, value.networkInventory);
  const inventory = value.networkInventory;
  require27(
    same11(value.retainedNics, azureNativeNetworkReplacementNics2(inventory)) &&
      Object.entries(inventory.nodes).every(
        ([index, vm]) =>
          value.oldVmIds[`${plan.deploymentName}-${index}`]?.toLowerCase() === vm.vmId.toLowerCase() &&
          value.ownerPlanSha256ByNode[`${plan.deploymentName}-${index}`] === vm.ownerPlanSha256,
      ),
    'frozen network/VM generation binding differs',
  );
}
async function captureAzureNativeNetworkReplacementNics2(plan, inventory, api, signal, independentlyAbsentNode) {
  const result = {};
  for (const [node, vm] of Object.entries(inventory.nodes))
    for (const [index, expected] of Object.entries(vm.nics)) {
      signal?.throwIfAborted();
      const raw = await api.exec(
        'az',
        [
          'network',
          'nic',
          'show',
          '--ids',
          expected.resourceId,
          '--subscription',
          plan.subscription.id,
          '--output',
          'json',
        ],
        signal ? { signal } : undefined,
      );
      require27(raw.exitCode === 0, 'current NIC evidence unavailable');
      let row;
      try {
        row = object26(JSON.parse(raw.stdout));
      } catch {
        throw Error('Azure native network replacement execution: malformed NIC evidence');
      }
      const tags = object26(row.tags);
      const attachment = row.virtualMachine == null ? undefined : object26(row.virtualMachine);
      require27(
        lower9(row.id) === lower9(expected.resourceId) &&
          lower9(row.location) === lower9(plan.region) &&
          row.provisioningState === 'Succeeded' &&
          !['nextLink', 'error', 'errors'].some((key) => row[key] !== undefined) &&
          tags['xcsh-managed-by'] === 'azure-ce' &&
          tags['xcsh-execution-engine'] === 'native' &&
          tags['xcsh-deployment-id'] === plan.deploymentName &&
          tags['xcsh-plan-sha256'] === expected.ownerPlanSha256 &&
          lower9(row.macAddress).replaceAll('-', ':') === expected.mac &&
          (node === independentlyAbsentNode
            ? attachment === undefined
            : lower9(attachment?.id) === lower9(vm.resourceId)) &&
          Array.isArray(row.ipConfigurations) &&
          row.ipConfigurations.length === 1,
        'retained NIC ownership/MAC/attachment differs',
      );
      const ip = object26(row.ipConfigurations[0]);
      require27(
        lower9(ip.id) === lower9(expected.ipConfigurationId) &&
          ip.name === expected.ipConfigurationName &&
          ip.privateIPAddressVersion === 'IPv4' &&
          ip.privateIPAllocationMethod === expected.allocation &&
          lower9(object26(ip.subnet).id) === lower9(expected.subnetId) &&
          ip.privateIPAddress === expected.privateIp &&
          usableAzureNetworkAddress(ip.privateIPAddress, expected.subnetCidr),
        'retained IP configuration/address/subnet differs',
      );
      result[`${node}:${index}`] = {
        resourceId: expected.resourceId,
        subnetId: expected.subnetId,
        mac: expected.mac,
        privateIp: expected.privateIp,
        ownerPlanSha256: expected.ownerPlanSha256,
      };
    }
  return result;
}
async function verifyAzureNativeNetworkReplacementExecution2(
  plan,
  admission,
  store,
  load,
  api,
  runtime,
  checkpoint,
  signal,
) {
  if (checkpoint) validateAzureCeCheckpoint(checkpoint, plan);
  if (!admission?.replacement) {
    require27(
      !checkpoint?.completedActionIds.length && !checkpoint?.pendingAction,
      'executed replacement lacks frozen network identity',
    );
    return qualifyAzureNativeNetworkReplacementSource(plan, store, load, api, runtime, signal);
  }
  const value = admission.replacement;
  validateAzureNativeNetworkReplacementMetadata2(plan, value);
  const history = await qualifyAzureNativeNetworkReplacementHistory(plan, store, load);
  require27(
    same11(value.originalSourcePlan, history.original) &&
      same11(value.networkSourcePlan, history.networkSource) &&
      value.networkHistorySha256 === history.historySha256 &&
      same11(value.networkInventory?.nodes, history.networkInventory.nodes) &&
      value.siteUid === history.source.siteUid &&
      value.siteConfigurationSha256 === history.source.siteConfigurationSha256,
    'frozen history or owned site binding changed',
  );
  const inventory = value.networkInventory;
  const prefix = checkpoint?.completedActionIds ?? [];
  const deleted = plan.actions.some((a) => a.kind === 'vm-delete' && prefix.includes(a.id));
  const created = plan.actions.some((a) => a.kind === 'vm-create' && prefix.includes(a.id));
  const pending = checkpoint?.pendingAction;
  if (pending) validateAzureNativePendingAction(plan, prefix, pending);
  const allowOld = !deleted && !created;
  const allowAbsent = (deleted && !created) || pending?.kind === 'vm-delete';
  const allowNew = created || pending?.kind === 'vm-create';
  let absentNode;
  for (const [index, before] of Object.entries(inventory.nodes)) {
    const selected = Number(index) === plan.intent.replacementNode;
    const raw = await api.exec(
      'az',
      [
        'vm',
        'show',
        '--ids',
        before.resourceId,
        '--show-details',
        '--subscription',
        plan.subscription.id,
        '--output',
        'json',
      ],
      signal ? { signal } : undefined,
    );
    if (raw.exitCode !== 0) {
      let code;
      try {
        const error = object26(JSON.parse(raw.stderr || raw.stdout));
        code = object26(error.error ?? error).code;
      } catch {
        code = undefined;
      }
      require27(
        selected && allowAbsent && code === 'ResourceNotFound',
        'VM evidence unavailable or unqualified absence',
      );
      absentNode = index;
      continue;
    }
    let row;
    try {
      row = object26(JSON.parse(raw.stdout));
    } catch {
      throw Error('Azure native network replacement execution: malformed VM evidence');
    }
    const tags = object26(row.tags),
      uuid = lower9(row.vmId),
      isOld = uuid === before.vmId.toLowerCase() && tags['xcsh-plan-sha256'] === before.ownerPlanSha256;
    const isNew =
      /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(uuid) &&
      !Object.values(value.oldVmIds).some((id) => id.toLowerCase() === uuid) &&
      tags['xcsh-plan-sha256'] === plan.planSha256 &&
      (!value.newVmId || value.newVmId.toLowerCase() === uuid);
    const attached = object26(row.networkProfile).networkInterfaces;
    require27(
      Array.isArray(attached) &&
        same11(
          attached.map((nic) => lower9(object26(nic).id)),
          Object.values(before.nics).map((nic) => lower9(nic.resourceId)),
        ),
      'VM-side retained interface binding differs',
    );
    if (selected && isNew) {
      const image = object26(object26(row.storageProfile).imageReference),
        marketplace = object26(row.plan);
      require27(
        lower9(image.publisher) === lower9(plan.image.publisher) &&
          lower9(image.offer) === lower9(plan.image.offer) &&
          lower9(image.sku) === lower9(plan.image.plan) &&
          lower9(image.version) === lower9(plan.image.version) &&
          lower9(marketplace.publisher) === lower9(plan.image.publisher) &&
          lower9(marketplace.product) === lower9(plan.image.offer) &&
          lower9(marketplace.name) === lower9(plan.image.plan),
        'recreated VM pinned image/Marketplace binding differs',
      );
    }
    require27(
      lower9(row.id) === lower9(before.resourceId) &&
        row.name === `${plan.deploymentName}-${index}` &&
        lower9(row.location) === lower9(plan.region) &&
        row.provisioningState === 'Succeeded' &&
        lower9(object26(row.hardwareProfile).vmSize) === lower9(plan.vm.size) &&
        tags['xcsh-managed-by'] === 'azure-ce' &&
        tags['xcsh-execution-engine'] === 'native' &&
        tags['xcsh-deployment-id'] === plan.deploymentName &&
        !['nextLink', 'error', 'errors'].some((key) => row[key] !== undefined) &&
        (selected ? (allowOld && isOld) || (allowNew && isNew) : isOld),
      'old/new/survivor VM generation differs',
    );
  }
  const nics = await captureAzureNativeNetworkReplacementNics2(plan, inventory, api, signal, absentNode);
  require27(same11(nics, value.retainedNics), 'retained interface identity changed');
  await verifyAzureNativeNetworkUpdateSite(history.networkSource, history.source, runtime, signal);
  return { ...history, networkInventory: inventory };
}

// plugins/azure/src/ce/native-network-replacement-retirement.ts
var require28 = (condition, message) => {
  if (!condition) throw Error(`Azure native network replacement retirement: ${message}`);
};
var same12 = canonicalEqual;
async function verifyAzureNativeNetworkReplacementRetirementSource(plan, replacement, store) {
  validateAzureNativeNetworkReplacementMetadata2(plan, replacement);
  const { originalSourcePlan: original, networkSourcePlan: network, networkInventory: inventory } = replacement;
  for (const source of [plan, original, network])
    require28(
      same12(await store.read(`native-source-${source.planSha256}.json`), source),
      'exact saved source differs',
    );
  const history = validateAzureNativeNetworkHistory(network, await store.read(azureNativeNetworkHistoryName(network)));
  const expected =
    plan.networkReplacementProfile?.schemaVersion === 2
      ? (
          await qualifyAzureNativeNetworkGenerationBoundary(
            network,
            history.networkUpdate.current,
            plan.networkReplacementProfile.retainedReplacementPlanSha256,
            store,
          )
        ).inventory
      : history.networkUpdate.current;
  require28(
    canonicalSha256(history) === replacement.networkHistorySha256 &&
      same12(expected.nodes, inventory.nodes) &&
      history.networkUpdate.source?.originalPlanSha256 === original.planSha256,
    'frozen complete network history differs',
  );
  const birth = await readAzureNativeFinalConfiguration(original, inventory, store),
    final = await readAzureNativeFinalConfiguration(network, history.networkUpdate.current, store);
  const reservation = await store.read('native-site.json');
  require28(
    final.receiptSha256 === history.finalConfigurationSha256 &&
      final.siteUid === replacement.siteUid &&
      birth.siteUid === replacement.siteUid &&
      final.siteConfigurationSha256 === replacement.siteConfigurationSha256 &&
      birth.siteConfigurationSha256 === replacement.siteConfigurationSha256 &&
      history.networkUpdate.source?.siteUid === replacement.siteUid &&
      history.networkUpdate.source?.siteConfigurationSha256 === replacement.siteConfigurationSha256 &&
      reservation.uid === birth.siteUid &&
      reservation.siteName === original.siteName &&
      reservation.contractFingerprint === birth.contractFingerprint &&
      same12(reservation.owner, azureUpgradeBinding(original).owner) &&
      Object.entries(final.instances).every(
        ([node, uuid]) =>
          uuid.toLowerCase() ===
          history.networkUpdate.current.nodes[
            String(azureUpgradeBinding(network).nodes.indexOf(node) + 1)
          ].vmId.toLowerCase(),
      ),
    'original/network registered configuration or logical site differs',
  );
  if (replacement.status === 'registered') {
    const registered = await readAzureNativeFinalConfiguration(plan, inventory, store);
    const selected = `${plan.deploymentName}-${replacement.node}`;
    require28(
      registered.siteUid === replacement.siteUid &&
        registered.siteConfigurationSha256 === replacement.siteConfigurationSha256 &&
        Object.entries(registered.instances).every(
          ([node, uuid]) =>
            uuid.toLowerCase() ===
            (node === selected ? replacement.newVmId : replacement.oldVmIds[node])?.toLowerCase(),
        ),
      'registered selected/survivor generation differs',
    );
  }
}
async function verifyAzureNativeNetworkReplacementRetirementNicBridge(plan, current, priorDigest, prior, records) {
  validateAzureNativeNetworkReplacementMetadata2(plan, current);
  const original = current.originalSourcePlan;
  let digest = current.networkSourcePlan?.planSha256;
  const visited = new Set();
  const chain = [];
  const store = {
    async read(name) {
      require28(records.has(name), 'required NIC bridge record is missing');
      return records.get(name);
    },
  };
  while (digest !== original.planSha256) {
    require28(!visited.has(digest), 'cyclic NIC bridge history');
    visited.add(digest);
    const source = records.get(`native-source-${digest}.json`);
    require28(source, 'NIC bridge source is missing');
    verifyAzureCePlan(source);
    const profile = verifyAzureNativeNetworkProfile(source);
    require28(
      source.planSha256 === digest &&
        profile.originalPlanSha256 === original.planSha256 &&
        same12(azureUpgradeBinding(source), azureUpgradeBinding(original)) &&
        same12(azureNativeNetworkScope(source, true), azureNativeNetworkScope(original, true)),
      'NIC bridge source scope differs',
    );
    const history = validateAzureNativeNetworkHistory(source, records.get(azureNativeNetworkHistoryName(source)));
    const final = await readAzureNativeFinalConfiguration(source, history.networkUpdate.current, store);
    require28(
      history.networkUpdate.source?.siteUid === current.siteUid &&
        history.networkUpdate.source?.siteConfigurationSha256 === current.siteConfigurationSha256 &&
        final.receiptSha256 === history.finalConfigurationSha256 &&
        final.siteUid === current.siteUid &&
        final.siteConfigurationSha256 === current.siteConfigurationSha256,
      'NIC bridge final configuration differs',
    );
    chain.unshift({ source, history });
    digest = profile.retainedPlanSha256;
  }
  const latest = chain.at(-1);
  if (!latest) throw Error('Azure native network replacement retirement: complete NIC bridge is missing');
  const expected =
    plan.networkReplacementProfile?.schemaVersion === 2
      ? (
          await qualifyAzureNativeNetworkGenerationBoundary(
            latest.source,
            latest.history.networkUpdate.current,
            plan.networkReplacementProfile.retainedReplacementPlanSha256,
            store,
          )
        ).inventory
      : latest.history.networkUpdate.current;
  require28(
    canonicalSha256(latest.history) === current.networkHistorySha256 &&
      same12(expected.nodes, current.networkInventory?.nodes),
    'NIC bridge current endpoint differs',
  );
  let start = -1;
  for (const [index, entry] of chain.entries()) {
    const { history } = entry;
    const selected = history.networkUpdate.before.nodes[String(prior.node)];
    if (
      !history.networkUpdate.source?.generationPlanSha256s.includes(priorDigest) ||
      !same12(azureNativeNetworkReplacementNics2(history.networkUpdate.before), prior.retainedNics) ||
      selected.vmId.toLowerCase() !== prior.newVmId?.toLowerCase() ||
      selected.ownerPlanSha256 !== priorDigest
    )
      continue;
    const exactSurvivors = azureUpgradeBinding(original).nodes.every(
      (node, position) =>
        position + 1 === prior.node ||
        (history.networkUpdate.before.nodes[String(position + 1)].vmId.toLowerCase() ===
          prior.oldVmIds[node]?.toLowerCase() &&
          history.networkUpdate.before.nodes[String(position + 1)].ownerPlanSha256 ===
            prior.ownerPlanSha256ByNode[node]),
    );
    if (exactSurvivors) {
      start = index;
      break;
    }
    const profile = verifyAzureNativeNetworkProfile(entry.source),
      predecessor = chain[index - 1];
    if (profile.schemaVersion !== 2 || !predecessor) continue;
    const generations = await qualifyAzureNativeNetworkGenerationBoundary(
      predecessor.source,
      predecessor.history.networkUpdate.current,
      profile.retainedReplacementPlanSha256,
      store,
    );
    require28(
      generations.generationPlanSha256s.includes(priorDigest),
      'NIC bridge lacks completed survivor generation lineage',
    );
    verifyAzureNativeNetworkHistoryBoundary(generations.inventory, history.networkUpdate.before);
    start = index;
    break;
  }
  require28(start >= 0, 'NIC bridge lacks exact registered predecessor generation');
  for (let index = start + 1; index < chain.length; index++) {
    const previous = chain[index - 1],
      entry = chain[index],
      binding = verifyAzureNativeNetworkProfile(entry.source);
    const boundary =
      binding.schemaVersion === 2
        ? (
            await qualifyAzureNativeNetworkGenerationBoundary(
              previous.source,
              previous.history.networkUpdate.current,
              binding.retainedReplacementPlanSha256,
              store,
            )
          ).inventory
        : previous.history.networkUpdate.current;
    verifyAzureNativeNetworkHistoryBoundary(boundary, entry.history.networkUpdate.before);
  }
}

// plugins/azure/src/ce/native-replacement-history.ts
var require29 = (condition, message) => {
  if (!condition) throw Error(`Azure native replacement history: ${message}`);
};
var same13 = canonicalEqual;
var object27 = (value) => {
  require29(value && typeof value === 'object' && !Array.isArray(value), 'malformed record');
  return value;
};
var azureNativeReplacementHistoryName = (plan) => `native-replacement-history-${plan.planSha256}.json`;
var isAzureNativeReplacementHistory = (name) => /^native-replacement-history-[a-f0-9]{64}\.json$/.test(name);
function validate(plan, value) {
  const record = object27(value);
  require29(
    Object.keys(record).sort().join(',') ===
      'bootstrappedNodes,engine,kind,launchedAtByNode,owner,replacement,schemaVersion,sourcePlanSha256' &&
      record.schemaVersion === 1 &&
      record.kind === 'azure-native-replacement-history' &&
      record.engine === 'native' &&
      record.sourcePlanSha256 === plan.planSha256 &&
      same13(record.owner, azureUpgradeBinding(plan).owner),
    'source or record fields differ',
  );
  const replacement = object27(record.replacement);
  validateAzureNativeReplacementState(plan, replacement);
  require29(!plan.relayProfile && replacement.originalSourcePlan, 'standard original creation missing');
  const bootstrapped = record.bootstrappedNodes;
  const launched = object27(record.launchedAtByNode);
  require29(
    Array.isArray(bootstrapped) &&
      new Set(bootstrapped).size === bootstrapped.length &&
      bootstrapped.every((node) => node === String(replacement.node)) &&
      Object.entries(launched).every(
        ([node, at]) =>
          bootstrapped.includes(node) &&
          typeof at === 'string' &&
          Number.isFinite(Date.parse(at)) &&
          Date.parse(at) <= Date.now(),
      ) &&
      (replacement.status !== 'registered' ||
        (bootstrapped.includes(String(replacement.node)) && Object.hasOwn(launched, String(replacement.node)))),
    'generation launch boundary differs',
  );
  return replacement;
}
async function persistAzureNativeReplacementHistory(plan, checkpoint, store) {
  validateAzureNativeAdmissionCheckpoint(plan, checkpoint);
  const value = {
    schemaVersion: 1,
    kind: 'azure-native-replacement-history',
    engine: 'native',
    owner: azureUpgradeBinding(plan).owner,
    sourcePlanSha256: plan.planSha256,
    replacement: structuredClone(checkpoint.replacement),
    bootstrappedNodes: Object.keys(checkpoint.bootstrapByNode).sort(),
    launchedAtByNode: structuredClone(checkpoint.launchedAtByNode),
  };
  validate(plan, value);
  let saved;
  try {
    saved = await store.read(azureNativeReplacementHistoryName(plan));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  require29(saved === undefined || same13(saved, value), 'saved immutable generation history changed');
  if (saved === undefined) await store.write(azureNativeReplacementHistoryName(plan), value);
}
async function verifyAzureNativeReplacementHistories(base, siteUid, records) {
  const sources = new Map([[base.planSha256, base]]);
  const histories = new Map();
  for (const [name, value] of records)
    if (name.startsWith('native-source-')) {
      const source = value;
      verifyAzureCePlan(source);
      require29(name === `native-source-${source.planSha256}.json`, 'source filename differs');
      if (source.intent.operation === 'replace-node') {
        if (source.networkReplacementProfile) {
          const network = records.get(
            `native-source-${source.networkReplacementProfile.retainedNetworkPlanSha256}.json`,
          );
          require29(network, 'retained network source is unresolved');
          verifyAzureNativeNetworkReplacementOriginalSource(source, base, network);
        } else verifyAzureNativeReplacementOriginalSource(source, base);
      }
      sources.set(source.planSha256, source);
    }
  for (const [name, value] of records)
    if (isAzureNativeReplacementHistory(name)) {
      const source = sources.get(String(object27(value).sourcePlanSha256));
      require29(source && name === azureNativeReplacementHistoryName(source), 'history source is unresolved');
      const replacement = validate(source, value);
      require29(
        same13(replacement.originalSourcePlan, base) &&
          replacement.siteUid === siteUid &&
          !histories.has(source.planSha256),
        'original creation or logical site differs',
      );
      histories.set(source.planSha256, replacement);
    }
  const nodes = azureUpgradeBinding(base).nodes;
  const boundaries = new Map();
  const visit = async (digest, path) => {
    require29(!path.has(digest), 'recursive generation history');
    const current = histories.get(digest);
    require29(current, 'generation history is unresolved');
    const next = new Set([...path, digest]);
    for (const node of nodes) {
      const owner = current?.ownerPlanSha256ByNode[node];
      const key = `${owner}:${node}`,
        vmId = current?.oldVmIds[node]?.toLowerCase();
      require29(
        vmId && (!boundaries.has(key) || boundaries.get(key) === vmId),
        'survivor UUID differs across historical generation boundaries',
      );
      boundaries.set(key, vmId);
      if (owner === base.planSha256) continue;
      const source = sources.get(owner),
        prior = histories.get(owner);
      require29(
        source?.intent.replacementNode === nodes.indexOf(node) + 1 &&
          prior?.status === 'registered' &&
          prior.newVmId?.toLowerCase() === current?.oldVmIds[node]?.toLowerCase(),
        'retained VM owner or interface predecessor differs',
      );
      if (!same13(prior?.retainedNics, current?.retainedNics)) {
        const currentSource = sources.get(digest);
        require29(currentSource?.networkReplacementProfile, 'retained VM owner or interface predecessor differs');
        await verifyAzureNativeNetworkReplacementRetirementNicBridge(currentSource, current, owner, prior, records);
      }
      await visit(owner, next);
    }
  };
  for (const digest of histories.keys()) await visit(digest, new Set());
  for (const source of sources.values())
    if (source.intent.operation === 'replace-node' && !histories.has(source.planSha256))
      require29(
        !Array.from(records.keys()).some((name) => name.startsWith(`native-action-${source.planSha256}-`)),
        'executed source has no replacement history',
      );
}

// plugins/azure/src/ce/native-network-generation.ts
function require30(condition, message) {
  if (!condition) throw Error(`Azure native network generation: ${message}`);
}
var same14 = canonicalEqual;
var object28 = (value) => {
  require30(value && typeof value === 'object' && !Array.isArray(value), 'malformed generation record');
  return value;
};
var azureNativeNetworkGenerationCompletionName = (source) => `native-network-generation-${source.planSha256}.json`;
var isAzureNativeNetworkGenerationCompletion = (name) => /^native-network-generation-[a-f0-9]{64}\.json$/.test(name);
function complete(source, checkpoint) {
  validateAzureCeCheckpoint(checkpoint, source);
  require30(
    checkpoint.state === 'complete' &&
      !checkpoint.pendingAction &&
      !checkpoint.failedActionId &&
      same14(
        checkpoint.completedActionIds,
        source.actions.map((a) => a.id),
      ),
    'complete ordered public generation execution required',
  );
}
function validateAzureNativeNetworkGenerationInventory(network, inventory) {
  const normalized = structuredClone(inventory);
  require30(
    inventory && typeof inventory === 'object' && inventory.nodes && typeof inventory.nodes === 'object',
    'complete generation inventory required',
  );
  for (const [index, node] of Object.entries(normalized.nodes)) {
    require30(
      typeof node.ownerPlanSha256 === 'string' && /^[a-f0-9]{64}$/.test(node.ownerPlanSha256),
      'generation owner is unresolved',
    );
    const action = network.actions.find((a) => a.kind === 'vm-deallocate' && a.node === Number(index));
    require30(action?.expectedOwnerPlanSha256, 'original network VM action is unresolved');
    node.ownerPlanSha256 = action.expectedOwnerPlanSha256;
  }
  validateAzureNetworkUpdateInventory(network, normalized);
}
async function persistAzureNativeNetworkGenerationCompletion(source, checkpoint, store) {
  await store.verify();
  verifyAzureNativeNetworkReplacementProfile(source);
  complete(source, checkpoint);
  require30(
    same14(store.owner, azureUpgradeBinding(source).owner) &&
      same14(await store.read(`native-source-${source.planSha256}.json`), source),
    'saved generation source or store differs',
  );
  const admission = await store.read(`native-admission-${source.planSha256}.json`);
  validateAzureNativeAdmissionCheckpoint(source, admission);
  require30(
    admission.replacement?.status === 'registered' && admission.replacement.networkInventory,
    'registered generation identity required',
  );
  await persistAzureNativeReplacementHistory(source, admission, store);
  const history = await store.read(azureNativeReplacementHistoryName(source));
  const final = await readAzureNativeFinalConfiguration(source, admission.replacement.networkInventory, store);
  const selected = `${source.deploymentName}-${source.intent.replacementNode}`;
  require30(
    final.siteUid === admission.replacement.siteUid &&
      final.siteConfigurationSha256 === admission.replacement.siteConfigurationSha256 &&
      Object.entries(final.instances).every(
        ([node, uuid]) =>
          uuid.toLowerCase() ===
          (node === selected ? admission.replacement?.newVmId : admission.replacement?.oldVmIds[node])?.toLowerCase(),
      ),
    'completed generation selected/survivor registration differs',
  );
  const row = {
    schemaVersion: 1,
    kind: 'azure-native-network-generation-completion',
    engine: 'native',
    owner: store.owner,
    sourcePlanSha256: source.planSha256,
    checkpoint: structuredClone(checkpoint),
    checkpointSha256: canonicalSha256(checkpoint),
    replacementHistorySha256: canonicalSha256(history),
    finalConfigurationSha256: final.receiptSha256,
  };
  let saved;
  try {
    saved = await store.read(azureNativeNetworkGenerationCompletionName(source));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  require30(saved === undefined || same14(saved, row), 'immutable completed generation receipt changed');
  if (saved === undefined) await store.write(azureNativeNetworkGenerationCompletionName(source), row);
}
async function readAzureNativeNetworkGenerationCompletion(source, store, load) {
  verifyAzureCePlan(source);
  verifyAzureNativeNetworkReplacementProfile(source);
  const row = object28(await store.read(azureNativeNetworkGenerationCompletionName(source)));
  require30(
    Object.keys(row).sort().join(',') ===
      'checkpoint,checkpointSha256,engine,finalConfigurationSha256,kind,owner,replacementHistorySha256,schemaVersion,sourcePlanSha256' &&
      row.schemaVersion === 1 &&
      row.kind === 'azure-native-network-generation-completion' &&
      row.engine === 'native' &&
      row.sourcePlanSha256 === source.planSha256 &&
      same14(row.owner, azureUpgradeBinding(source).owner) &&
      row.checkpointSha256 === canonicalSha256(row.checkpoint),
    'public generation receipt schema, owner or digest differs',
  );
  complete(source, row.checkpoint);
  if (load) require30(same14(await load(source), row.checkpoint), 'saved public generation completion differs');
  const record = object28(await store.read(azureNativeReplacementHistoryName(source)));
  require30(
    row.replacementHistorySha256 === canonicalSha256(record) &&
      record.schemaVersion === 1 &&
      record.kind === 'azure-native-replacement-history' &&
      record.engine === 'native' &&
      record.sourcePlanSha256 === source.planSha256 &&
      same14(record.owner, azureUpgradeBinding(source).owner),
    'immutable replacement history differs',
  );
  if (load) {
    const admission = await store.read(`native-admission-${source.planSha256}.json`);
    validateAzureNativeAdmissionCheckpoint(source, admission);
    require30(
      same14(record, {
        schemaVersion: 1,
        kind: 'azure-native-replacement-history',
        engine: 'native',
        owner: azureUpgradeBinding(source).owner,
        sourcePlanSha256: source.planSha256,
        replacement: admission.replacement,
        bootstrappedNodes: Object.keys(admission.bootstrapByNode).sort(),
        launchedAtByNode: admission.launchedAtByNode,
      }),
      'live admission differs from immutable completed generation',
    );
  }
  const replacement = record.replacement;
  validateAzureNativeReplacementState(source, replacement);
  require30(
    replacement.status === 'registered' && replacement.networkInventory,
    'completed registered generation missing',
  );
  const launched = object28(record.launchedAtByNode);
  require30(
    same14(record.bootstrappedNodes, [String(replacement.node)]) &&
      Object.keys(launched).join(',') === String(replacement.node) &&
      typeof launched[String(replacement.node)] === 'string' &&
      Number.isFinite(Date.parse(String(launched[String(replacement.node)]))) &&
      Date.parse(String(launched[String(replacement.node)])) <= Date.now(),
    'completed generation launch boundary differs',
  );
  const final = await readAzureNativeFinalConfiguration(source, replacement.networkInventory, store);
  require30(
    final.receiptSha256 === row.finalConfigurationSha256 &&
      final.siteUid === replacement.siteUid &&
      final.siteConfigurationSha256 === replacement.siteConfigurationSha256 &&
      Object.entries(final.instances).every(
        ([node, uuid]) =>
          uuid.toLowerCase() ===
          (node === `${source.deploymentName}-${replacement.node}`
            ? replacement.newVmId
            : replacement.oldVmIds[node]
          )?.toLowerCase(),
      ),
    'immutable registered generation configuration differs',
  );
  return { replacement, final, receiptSha256: canonicalSha256(row) };
}
async function qualifyAzureNativeNetworkGenerationBoundary(
  network,
  originalInventory,
  retainedReplacementSha,
  store,
  load,
) {
  const history = validateAzureNativeNetworkHistory(network, await store.read(azureNativeNetworkHistoryName(network)));
  require30(
    same14(history.networkUpdate.current.nodes, originalInventory.nodes),
    'original completed network inventory differs',
  );
  const networkFinal = await readAzureNativeFinalConfiguration(network, history.networkUpdate.current, store);
  require30(
    networkFinal.receiptSha256 === history.finalConfigurationSha256,
    'original network configuration digest differs',
  );
  const chain = [],
    visited = new Set();
  let digest = retainedReplacementSha;
  while (digest) {
    require30(
      /^[a-f0-9]{64}$/.test(digest) && !visited.has(digest) && digest !== network.planSha256,
      'cyclic or unresolved completed generation chain',
    );
    visited.add(digest);
    const source = await store.read(`native-source-${digest}.json`);
    verifyAzureCePlan(source);
    require30(source.planSha256 === digest, 'completed generation source filename differs');
    const profile = verifyAzureNativeNetworkReplacementProfile(source);
    const original = await store.read(`native-source-${profile.originalPlanSha256}.json`);
    verifyAzureNativeNetworkReplacementOriginalSource(source, original, network);
    chain.unshift(source);
    digest = profile.schemaVersion === 2 ? profile.retainedReplacementPlanSha256 : undefined;
  }
  const inventory = structuredClone(originalInventory);
  const receipts = [];
  for (const source of chain) {
    const generation = await readAzureNativeNetworkGenerationCompletion(source, store, load);
    const prior = generation.replacement;
    require30(
      prior.networkSourcePlan &&
        same14(prior.networkSourcePlan, network) &&
        prior.networkHistorySha256 === canonicalSha256(history) &&
        prior.siteUid === networkFinal.siteUid &&
        prior.siteConfigurationSha256 === networkFinal.siteConfigurationSha256 &&
        prior.networkInventory &&
        same14(prior.networkInventory.nodes, inventory.nodes) &&
        same14(prior.retainedNics, azureNativeNetworkReplacementNics2(inventory)) &&
        Object.entries(inventory.nodes).every(
          ([index, vm]) =>
            prior.oldVmIds[`${source.deploymentName}-${index}`]?.toLowerCase() === vm.vmId.toLowerCase() &&
            prior.ownerPlanSha256ByNode[`${source.deploymentName}-${index}`] === vm.ownerPlanSha256,
        ),
      'complete selected/survivor predecessor inventory differs',
    );
    const selected = inventory.nodes[String(source.intent.replacementNode)];
    require30(
      selected &&
        prior.newVmId &&
        !Object.values(inventory.nodes).some((vm) => vm.vmId.toLowerCase() === prior.newVmId?.toLowerCase()),
      'new generation UUID duplicates a predecessor or survivor',
    );
    selected.vmId = prior.newVmId;
    selected.ownerPlanSha256 = source.planSha256;
    receipts.push(generation.receiptSha256);
  }
  return { inventory, generationPlanSha256s: chain.map((p) => p.planSha256), receiptSha256: canonicalSha256(receipts) };
}

// plugins/azure/src/ce/native-network-replacement.ts
function require31(condition, message) {
  if (!condition) throw Error(`Azure native network replacement: ${message}`);
}
var same15 = canonicalEqual;
function verifyAzureNativeNetworkReplacementProfile(plan) {
  const profile = plan.networkReplacementProfile;
  require31(
    profile &&
      typeof profile === 'object' &&
      !Array.isArray(profile) &&
      ((profile.schemaVersion === 1 &&
        Object.keys(profile).sort().join(',') === 'originalPlanSha256,retainedNetworkPlanSha256,schemaVersion') ||
        (profile.schemaVersion === 2 &&
          Object.keys(profile).sort().join(',') ===
            'originalPlanSha256,retainedNetworkPlanSha256,retainedReplacementPlanSha256,schemaVersion' &&
          /^[a-f0-9]{64}$/.test(profile.retainedReplacementPlanSha256) &&
          ![profile.originalPlanSha256, profile.retainedNetworkPlanSha256, plan.planSha256].includes(
            profile.retainedReplacementPlanSha256,
          ))) &&
      plan.engine === 'native' &&
      !plan.relayProfile &&
      !plan.networkProfile &&
      plan.intent.operation === 'replace-node' &&
      Number.isInteger(plan.intent.replacementNode) &&
      Number(plan.intent.replacementNode) >= 1 &&
      Number(plan.intent.replacementNode) <= plan.topology.nodeCount &&
      /^[a-f0-9]{64}$/.test(profile.originalPlanSha256) &&
      /^[a-f0-9]{64}$/.test(profile.retainedNetworkPlanSha256) &&
      profile.originalPlanSha256 !== profile.retainedNetworkPlanSha256 &&
      profile.originalPlanSha256 !== plan.planSha256 &&
      profile.retainedNetworkPlanSha256 !== plan.planSha256,
    'exact original and retained network source identities required',
  );
  return profile;
}
function verifyAzureNativeNetworkReplacementOriginalSource(plan, original, network) {
  for (const source of [plan, original, network]) verifyAzureCePlan(source);
  const profile = verifyAzureNativeNetworkReplacementProfile(plan),
    predecessor = verifyAzureNativeNetworkProfile(network);
  require31(
    original.engine === 'native' &&
      !original.relayProfile &&
      original.intent.operation === 'deploy' &&
      profile.originalPlanSha256 === original.planSha256 &&
      profile.retainedNetworkPlanSha256 === network.planSha256 &&
      predecessor.originalPlanSha256 === original.planSha256 &&
      same15(azureUpgradeBinding(plan), azureUpgradeBinding(original)) &&
      same15(azureUpgradeBinding(network), azureUpgradeBinding(original)) &&
      same15(azureNativeNetworkScope(plan, true), azureNativeNetworkScope(original, true)) &&
      same15(azureNativeNetworkScope(network, true), azureNativeNetworkScope(original, true)) &&
      same15(azureNativeNetworkScope(plan, false), azureNativeNetworkScope(network, false)),
    'original scope or exact retained network configuration differs',
  );
}
function compileAzureNativeNetworkReplacementPlan(base, network, original) {
  for (const source of [base, network, original]) verifyAzureCePlan(source);
  require31(
    base.engine === 'native' &&
      !base.relayProfile &&
      !base.networkProfile &&
      !base.networkReplacementProfile &&
      base.intent.operation === 'replace-node',
    'unbound native replacement plan required',
  );
  const { planId: _id, planSha256: _sha, ...draft } = structuredClone(base);
  if (network.networkReplacementProfile) {
    const retained = verifyAzureNativeNetworkReplacementProfile(network);
    require31(
      retained.originalPlanSha256 === original.planSha256 &&
        same15(azureUpgradeBinding(base), azureUpgradeBinding(original)) &&
        same15(azureUpgradeBinding(network), azureUpgradeBinding(original)) &&
        same15(azureNativeNetworkScope(base, true), azureNativeNetworkScope(original, true)) &&
        same15(azureNativeNetworkScope(base, false), azureNativeNetworkScope(network, false)),
      'retained replacement scope or original identity differs',
    );
    draft.networkReplacementProfile = {
      schemaVersion: 2,
      originalPlanSha256: original.planSha256,
      retainedNetworkPlanSha256: retained.retainedNetworkPlanSha256,
      retainedReplacementPlanSha256: network.planSha256,
    };
  } else
    draft.networkReplacementProfile = {
      schemaVersion: 1,
      originalPlanSha256: original.planSha256,
      retainedNetworkPlanSha256: network.planSha256,
    };
  const digest = canonicalSha256(draft),
    plan = { ...draft, planId: `azure-ce-${digest.slice(0, 24)}`, planSha256: digest };
  if (network.networkReplacementProfile) verifyAzureCePlan(plan);
  else verifyAzureNativeNetworkReplacementOriginalSource(plan, original, network);
  return plan;
}
function completed(plan, checkpoint) {
  require31(
    checkpoint?.engine === 'native' &&
      checkpoint.planId === plan.planId &&
      checkpoint.planSha256 === plan.planSha256 &&
      checkpoint.state === 'complete' &&
      !checkpoint.pendingAction &&
      same15(
        checkpoint.completedActionIds,
        plan.actions.map((action) => action.id),
      ),
    'complete ordered network public execution required',
  );
  return checkpoint;
}
async function qualifyAzureNativeNetworkReplacementHistory(plan, store, load) {
  await store.verify();
  verifyAzureCePlan(plan);
  const profile = verifyAzureNativeNetworkReplacementProfile(plan);
  const original = await store.read(`native-source-${profile.originalPlanSha256}.json`);
  const networkSource = await store.read(`native-source-${profile.retainedNetworkPlanSha256}.json`);
  verifyAzureNativeNetworkReplacementOriginalSource(plan, original, networkSource);
  const history = validateAzureNativeNetworkHistory(
    networkSource,
    await store.read(azureNativeNetworkHistoryName(networkSource)),
  );
  const checkpoint = completed(networkSource, await load(networkSource));
  require31(
    same15(checkpoint.networkUpdate, history.networkUpdate),
    'completed network checkpoint and immutable history differ',
  );
  const source = await qualifyAzureNativeNetworkUpdateSource(networkSource, history.networkUpdate.before, store, load);
  require31(same15(history.networkUpdate.source, source), 'completed network source binding changed');
  const final = await readAzureNativeFinalConfiguration(networkSource, history.networkUpdate.current, store);
  require31(
    final.receiptSha256 === history.finalConfigurationSha256 &&
      final.siteUid === source.siteUid &&
      final.siteConfigurationSha256 === source.siteConfigurationSha256 &&
      Object.entries(final.instances).every(
        ([node, uuid]) =>
          uuid.toLowerCase() ===
          history.networkUpdate.current.nodes[
            String(azureUpgradeBinding(networkSource).nodes.indexOf(node) + 1)
          ].vmId.toLowerCase(),
      ),
    'final network configuration receipt or registered UUID differs',
  );
  const networkInventory =
    profile.schemaVersion === 2
      ? (
          await qualifyAzureNativeNetworkGenerationBoundary(
            networkSource,
            history.networkUpdate.current,
            profile.retainedReplacementPlanSha256,
            store,
            load,
          )
        ).inventory
      : history.networkUpdate.current;
  const selected = plan.actions.filter(
    (action) => action.kind === 'vm-delete' && action.node === plan.intent.replacementNode,
  );
  const before = networkInventory.nodes[String(plan.intent.replacementNode)];
  require31(
    selected.length === 1 &&
      selected[0].resourceId?.toLowerCase() === before.resourceId.toLowerCase() &&
      selected[0].expectedOwnerPlanSha256 === before.ownerPlanSha256,
    'selected VM delete boundary differs',
  );
  return { original, networkSource, source, networkInventory, historySha256: canonicalSha256(history) };
}
async function qualifyAzureNativeNetworkReplacementSource(plan, store, load, api, runtime, signal) {
  signal?.throwIfAborted();
  const history = await qualifyAzureNativeNetworkReplacementHistory(plan, store, load);
  if (plan.networkReplacementProfile?.schemaVersion === 2) {
    const { verifyAzureNativeNetworkReplacementExecution, azureNativeNetworkReplacementNics } = await import(
      './runtime-vpwehc0d.js'
    );
    const prepared = {
      schemaVersion: 1,
      engine: 'native',
      planSha256: plan.planSha256,
      siteReserved: false,
      bootstrapByNode: {},
      launchedAtByNode: {},
      replacement: {
        node: Number(plan.intent.replacementNode),
        status: 'prepared',
        siteUid: history.source.siteUid,
        siteConfigurationSha256: history.source.siteConfigurationSha256,
        originalSourcePlan: history.original,
        networkSourcePlan: history.networkSource,
        networkInventory: history.networkInventory,
        networkHistorySha256: history.historySha256,
        oldVmIds: Object.fromEntries(
          Object.entries(history.networkInventory.nodes).map(([index, vm]) => [
            `${plan.deploymentName}-${index}`,
            vm.vmId,
          ]),
        ),
        ownerPlanSha256ByNode: Object.fromEntries(
          Object.entries(history.networkInventory.nodes).map(([index, vm]) => [
            `${plan.deploymentName}-${index}`,
            vm.ownerPlanSha256,
          ]),
        ),
        retainedNics: azureNativeNetworkReplacementNics(history.networkInventory),
      },
    };
    await verifyAzureNativeNetworkReplacementExecution(plan, prepared, store, load, api, runtime, undefined, signal);
    return history;
  }
  const networkInventory = await captureAzureNetworkUpdateInventory(history.networkSource, api, signal);
  verifyAzureNativeNetworkHistoryBoundary(history.networkInventory, networkInventory);
  await verifyAzureNativeNetworkUpdateSite(history.networkSource, history.source, runtime, signal);
  signal?.throwIfAborted();
  return { ...history, networkInventory };
}

// plugins/azure/src/ce/native-network-plan.ts
var require32 = (condition, message) => {
  if (!condition) throw Error(`Azure native network plan: ${message}`);
};
var same16 = canonicalEqual;
function azureNativeNetworkScope(plan, permitSubnetChange) {
  const { operation: _operation, replacementNode: _node, nics, ...intent } = plan.intent;
  const { termsAccepted: _terms, ...image } = plan.image;
  const { forwardingRoutes: _forwarding, ...configurationRouting } = plan.routing;
  const { forwardingRoutes: _intentForwarding, ...configurationIntentRouting } = intent.routing;
  const nicScope = (nic) => {
    const { subnet: _subnet, ...rest } = nic;
    return permitSubnetChange ? rest : nic;
  };
  return {
    intent: {
      ...intent,
      routing: permitSubnetChange ? configurationIntentRouting : intent.routing,
      nics: nics.map((nic) => nicScope(nic)),
    },
    image,
    subscription: plan.subscription,
    topology: plan.topology,
    nics: plan.nics.map((nic) => nicScope(nic)),
    vm: plan.vm,
    routing: permitSubnetChange ? configurationRouting : plan.routing,
    egress: plan.egress,
    workloadProfile: plan.workloadProfile ?? null,
  };
}
function verifyAzureNativeNetworkProfile(plan) {
  const profile = plan.networkProfile;
  require32(
    profile &&
      typeof profile === 'object' &&
      !Array.isArray(profile) &&
      ((profile.schemaVersion === 1 &&
        Object.keys(profile).sort().join(',') === 'originalPlanSha256,retainedPlanSha256,schemaVersion') ||
        (profile.schemaVersion === 2 &&
          Object.keys(profile).sort().join(',') ===
            'originalPlanSha256,retainedPlanSha256,retainedReplacementPlanSha256,schemaVersion' &&
          /^[a-f0-9]{64}$/.test(profile.retainedReplacementPlanSha256) &&
          ![profile.originalPlanSha256, profile.retainedPlanSha256, plan.planSha256].includes(
            profile.retainedReplacementPlanSha256,
          ))) &&
      plan.engine === 'native' &&
      !plan.relayProfile &&
      plan.intent.operation === 'update-network' &&
      /^[a-f0-9]{64}$/.test(profile.originalPlanSha256) &&
      /^[a-f0-9]{64}$/.test(profile.retainedPlanSha256) &&
      profile.originalPlanSha256 !== plan.planSha256 &&
      profile.retainedPlanSha256 !== plan.planSha256,
    'exact original and preceding deployment identities required',
  );
  return profile;
}
function compileAzureNativeNetworkUpdatePlan(base, retained, original = retained) {
  for (const source of [base, retained, original]) verifyAzureCePlan(source);
  require32(
    base.intent.operation === 'update-network' &&
      !base.networkProfile &&
      base.engine === 'native' &&
      !base.relayProfile &&
      original.engine === 'native' &&
      !original.relayProfile &&
      original.intent.operation === 'deploy' &&
      retained.engine === 'native' &&
      !retained.relayProfile &&
      same16(azureUpgradeBinding(base), azureUpgradeBinding(original)) &&
      same16(azureUpgradeBinding(retained), azureUpgradeBinding(original)) &&
      same16(azureNativeNetworkScope(base, true), azureNativeNetworkScope(original, true)) &&
      same16(azureNativeNetworkScope(retained, true), azureNativeNetworkScope(original, true)),
    'retained creation/network scope differs',
  );
  verifyAzureForwardingPredecessor(base, retained);
  if (retained.intent.operation === 'update-network')
    require32(
      verifyAzureNativeNetworkProfile(retained).originalPlanSha256 === original.planSha256,
      'retained network original source differs',
    );
  else if (retained.networkReplacementProfile)
    require32(
      verifyAzureNativeNetworkReplacementProfile(retained).originalPlanSha256 === original.planSha256,
      'retained replacement original differs',
    );
  else
    require32(
      retained.intent.operation === 'deploy' && same16(retained, original),
      'retained source must be the original creation or a network deployment',
    );
  const { planId: _planId, planSha256: _planSha256, ...draft } = structuredClone(base);
  draft.networkProfile = retained.networkReplacementProfile
    ? {
        schemaVersion: 2,
        originalPlanSha256: original.planSha256,
        retainedPlanSha256: retained.networkReplacementProfile.retainedNetworkPlanSha256,
        retainedReplacementPlanSha256: retained.planSha256,
      }
    : { schemaVersion: 1, originalPlanSha256: original.planSha256, retainedPlanSha256: retained.planSha256 };
  const digest = canonicalSha256(draft);
  const plan = { ...draft, planId: `azure-ce-${digest.slice(0, 24)}`, planSha256: digest };
  verifyAzureCePlan(plan);
  return plan;
}

// plugins/azure/src/ce/terraform-network-replacement-plan.ts
var same17 = canonicalEqual;
var sha3 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function require33(value, message) {
  if (!value) throw Error(`Azure Terraform network replacement plan: ${message}`);
}
function verifyAzureTerraformNetworkReplacementProfile(plan) {
  const profile = plan.terraformNetworkReplacementProfile;
  require33(
    profile &&
      typeof profile === 'object' &&
      !Array.isArray(profile) &&
      Object.keys(profile).sort().join(',') === 'kind,originalPlanSha256,retainedPlanSha256,schemaVersion' &&
      profile.schemaVersion === 1 &&
      profile.kind === 'azure-terraform-network-bound-replacement' &&
      sha3(profile.originalPlanSha256) &&
      sha3(profile.retainedPlanSha256) &&
      new Set([profile.originalPlanSha256, profile.retainedPlanSha256, plan.planSha256]).size === 3 &&
      plan.engine === 'terraform' &&
      plan.intent.engine === 'terraform' &&
      plan.intent.operation === 'replace-node' &&
      Number.isInteger(plan.intent.replacementNode) &&
      Number(plan.intent.replacementNode) >= 1 &&
      Number(plan.intent.replacementNode) <= plan.topology.nodeCount &&
      !plan.relayProfile &&
      !plan.networkProfile &&
      !plan.networkReplacementProfile &&
      !plan.terraformNetworkProfile &&
      same17(
        plan.nics,
        plan.intent.nics.map((nic, index) => ({ ...nic, index })),
      ),
    'exact original and preceding Terraform generation with one selected node required',
  );
  return profile;
}
function compileAzureTerraformNetworkReplacementPlan(base, retained, original) {
  for (const p of [base, retained, original]) verifyAzureCePlan(p);
  require33(
    base.engine === 'terraform' &&
      base.intent.operation === 'replace-node' &&
      !base.relayProfile &&
      !base.networkProfile &&
      !base.networkReplacementProfile &&
      !base.terraformNetworkProfile &&
      !base.terraformNetworkReplacementProfile &&
      original.engine === 'terraform' &&
      original.intent.operation === 'deploy' &&
      !original.relayProfile &&
      retained.engine === 'terraform' &&
      !retained.relayProfile &&
      !retained.networkProfile &&
      !retained.networkReplacementProfile &&
      same17(azureUpgradeBinding(base), azureUpgradeBinding(original)) &&
      same17(azureUpgradeBinding(retained), azureUpgradeBinding(original)) &&
      same17(azureTerraformNetworkScope(base, true), azureTerraformNetworkScope(original, true)) &&
      same17(azureTerraformNetworkScope(retained, true), azureTerraformNetworkScope(original, true)) &&
      same17(azureTerraformNetworkScope(base, false), azureTerraformNetworkScope(retained, false)),
    'exact retained subnet configuration and original CE/provider scope required',
  );
  const retainedOriginal =
    retained.intent.operation === 'update-network'
      ? verifyAzureTerraformNetworkProfile(retained).originalPlanSha256
      : verifyAzureTerraformNetworkReplacementProfile(retained).originalPlanSha256;
  require33(retainedOriginal === original.planSha256, 'retained original identity differs');
  const { planId: _id, planSha256: _sha, ...draft } = structuredClone(base);
  draft.terraformNetworkReplacementProfile = {
    schemaVersion: 1,
    kind: 'azure-terraform-network-bound-replacement',
    originalPlanSha256: original.planSha256,
    retainedPlanSha256: retained.planSha256,
  };
  const digest = canonicalSha256(draft);
  const plan = { ...draft, planId: `azure-ce-${digest.slice(0, 24)}`, planSha256: digest };
  verifyAzureCePlan(plan);
  return plan;
}

// plugins/azure/src/ce/terraform-network-plan.ts
function require34(value, message) {
  if (!value) throw Error(`Azure Terraform network plan: ${message}`);
}
var same18 = canonicalEqual;
var sha4 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function azureTerraformNetworkScope(plan, permitSubnetChange) {
  const { operation: _operation, replacementNode: _node, nics, ...intent } = plan.intent;
  const { termsAccepted: _terms, ...image } = plan.image;
  const { forwardingRoutes: _forwarding, ...configurationRouting } = plan.routing;
  const { forwardingRoutes: _intentForwarding, ...configurationIntentRouting } = intent.routing;
  const nicScope = (nic) => {
    const { subnet: _subnet, ...rest } = nic;
    return permitSubnetChange ? rest : nic;
  };
  return {
    intent: {
      ...intent,
      routing: permitSubnetChange ? configurationIntentRouting : intent.routing,
      nics: nics.map((nic) => nicScope(nic)),
    },
    image,
    subscription: plan.subscription,
    namespace: plan.namespace,
    securityRules: plan.securityRules,
    topology: plan.topology,
    nics: plan.nics.map((nic) => nicScope(nic)),
    vm: plan.vm,
    routing: permitSubnetChange ? configurationRouting : plan.routing,
    egress: plan.egress,
    workloadProfile: plan.workloadProfile ?? null,
  };
}
function verifyAzureTerraformNetworkProfile(plan) {
  const profile = plan.terraformNetworkProfile;
  require34(
    profile &&
      typeof profile === 'object' &&
      !Array.isArray(profile) &&
      Object.keys(profile).sort().join(',') === 'kind,originalPlanSha256,retainedPlanSha256,schemaVersion' &&
      profile.schemaVersion === 1 &&
      profile.kind === 'azure-terraform-network-generation' &&
      same18(
        plan.nics,
        plan.intent.nics.map((nic, index) => ({ ...nic, index })),
      ) &&
      plan.engine === 'terraform' &&
      plan.intent.engine === 'terraform' &&
      plan.intent.operation === 'update-network' &&
      !plan.relayProfile &&
      !plan.networkProfile &&
      !plan.networkReplacementProfile &&
      !plan.terraformNetworkReplacementProfile &&
      sha4(profile.originalPlanSha256) &&
      sha4(profile.retainedPlanSha256) &&
      profile.originalPlanSha256 !== plan.planSha256 &&
      profile.retainedPlanSha256 !== plan.planSha256,
    'exact original and explicit preceding Terraform generation required',
  );
  return profile;
}
function compileAzureTerraformNetworkUpdatePlan(base, retained, original = retained) {
  for (const source of [base, retained, original]) verifyAzureCePlan(source);
  require34(
    base.engine === 'terraform' &&
      base.intent.operation === 'update-network' &&
      !base.terraformNetworkProfile &&
      !base.terraformNetworkReplacementProfile &&
      !base.networkProfile &&
      !base.networkReplacementProfile &&
      !base.relayProfile &&
      original.engine === 'terraform' &&
      original.intent.operation === 'deploy' &&
      !original.terraformNetworkProfile &&
      !original.terraformNetworkReplacementProfile &&
      !original.networkProfile &&
      !original.networkReplacementProfile &&
      !original.relayProfile &&
      retained.engine === 'terraform' &&
      !retained.networkProfile &&
      !retained.networkReplacementProfile &&
      !retained.relayProfile &&
      same18(azureUpgradeBinding(base), azureUpgradeBinding(original)) &&
      same18(azureUpgradeBinding(retained), azureUpgradeBinding(original)) &&
      same18(azureTerraformNetworkScope(base, true), azureTerraformNetworkScope(original, true)) &&
      same18(azureTerraformNetworkScope(retained, true), azureTerraformNetworkScope(original, true)),
    'creation scope differs beyond permitted subnet changes',
  );
  verifyAzureForwardingPredecessor(base, retained);
  if (retained.intent.operation === 'update-network') {
    require34(
      verifyAzureTerraformNetworkProfile(retained).originalPlanSha256 === original.planSha256,
      'retained network original differs',
    );
  } else if (retained.terraformNetworkReplacementProfile) {
    require34(
      verifyAzureTerraformNetworkReplacementProfile(retained).originalPlanSha256 === original.planSha256,
      'retained replacement original differs',
    );
  } else if (retained.intent.operation === 'replace-node') {
    require34(
      !retained.terraformNetworkProfile &&
        !retained.terraformNetworkReplacementProfile &&
        Number.isInteger(retained.intent.replacementNode) &&
        retained.intent.replacementNode >= 1 &&
        retained.intent.replacementNode <= retained.topology.nodeCount &&
        same18(azureTerraformNetworkScope(retained, false), azureTerraformNetworkScope(original, false)),
      'initial replacement must retain original subnet scope',
    );
  } else {
    require34(
      retained.intent.operation === 'deploy' && same18(retained, original),
      'retained source must be exact creation or explicit network/replacement predecessor',
    );
  }
  const { planId: _id, planSha256: _sha, ...draft } = structuredClone(base);
  draft.terraformNetworkProfile = {
    schemaVersion: 1,
    kind: 'azure-terraform-network-generation',
    originalPlanSha256: original.planSha256,
    retainedPlanSha256: retained.planSha256,
  };
  const digest = canonicalSha256(draft);
  const plan = { ...draft, planId: `azure-ce-${digest.slice(0, 24)}`, planSha256: digest };
  verifyAzureCePlan(plan);
  verifyAzureTerraformNetworkProfile(plan);
  return plan;
}

// plugins/azure/src/ce/relay-catalog.ts
var require35 = (condition, message) => {
  if (!condition) throw Error(`Azure relay catalog: ${message}`);
};
var object29 = (value) => {
  require35(value && typeof value === 'object' && !Array.isArray(value), 'malformed observation');
  const result = value;
  require35(
    !['nextLink', 'nextPageToken', 'error', 'errors', 'NextToken'].some((key) => result[key]),
    'partial or failed observation',
  );
  return result;
};
var same19 = (value, expected) => typeof value === 'string' && value.toLowerCase() === expected.toLowerCase();
async function resolveAzureLinuxHostCatalog(source, selection, api, signal) {
  verifyAzureCePlan(source);
  signal?.throwIfAborted();
  require35(
    source.intent.operation === 'deploy' && source.routing.mode === 'route-server',
    'owning Route Server creation plan required',
  );
  const image = selection?.hostImage;
  const safe = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
  require35(
    image &&
      [image.publisher, image.offer, image.sku].every((value) => typeof value === 'string' && safe.test(value)) &&
      /^\d+\.\d+\.\d+$/.test(image.version),
    'resolved exact host image required',
  );
  require35(typeof selection.vmSize === 'string' && safe.test(selection.vmSize), 'resolved VM size required');
  const urn = [image.publisher, image.offer, image.sku, image.version].join(':');
  const imageId = `/subscriptions/${source.subscription.id}/providers/Microsoft.Compute/locations/${source.region}/publishers/${image.publisher}/artifacttypes/vmimage/offers/${image.offer}/skus/${image.sku}/versions/${image.version}`;
  const deadline = AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]);
  const reads = [];
  const read = async (args) => {
    deadline.throwIfAborted();
    const fullArgs = [...args, '--subscription', source.subscription.id, '--output', 'json'];
    const abort = Promise.withResolvers();
    const onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    let raw;
    try {
      raw = await Promise.race([api.exec('az', fullArgs, { signal: deadline }), abort.promise]);
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
    deadline.throwIfAborted();
    require35(raw.exitCode === 0, 'cloud catalog read unavailable');
    let response;
    try {
      response = JSON.parse(raw.stdout);
    } catch {
      throw Error('Azure relay catalog: malformed JSON');
    }
    reads.push({
      command: 'az',
      args: fullArgs,
      responseSha256: canonicalSha256(response),
      observedAt: new Date().toISOString(),
    });
    return response;
  };
  const account = object29(await read(['account', 'show']));
  require35(
    same19(account.id, source.subscription.id) &&
      same19(account.tenantId, source.subscription.tenantId) &&
      account.environmentName === 'AzureCloud',
    'subscription, tenant or cloud differs',
  );
  const host = object29(await read(['vm', 'image', 'show', '--urn', urn, '--location', source.region]));
  require35(
    same19(host.id, imageId) && object29(host.osDiskImage).operatingSystem === 'Linux' && host.architecture === 'x64',
    'exact Linux host image identity differs',
  );
  const rawSkus = await read(['vm', 'list-skus', '--size', selection.vmSize, '--location', source.region, '--all']);
  require35(Array.isArray(rawSkus), 'complete SKU list required');
  const skus = rawSkus
    .map(object29)
    .filter((sku) => same19(sku.name, selection.vmSize) && same19(sku.resourceType, 'virtualMachines'));
  require35(skus.length === 1, 'SKU missing or ambiguous');
  const sku = skus[0];
  require35(
    Array.isArray(sku.locations) && sku.locations.some((location) => same19(location, source.region)),
    'SKU region differs',
  );
  require35(Array.isArray(sku.locationInfo), 'SKU regional details missing');
  const infos = sku.locationInfo.map(object29).filter((info) => same19(info.location, source.region));
  require35(infos.length === 1, 'SKU regional details missing or ambiguous');
  require35(
    Array.isArray(sku.restrictions) && Array.isArray(sku.capabilities),
    'SKU restrictions or capabilities missing',
  );
  const restricted = sku.restrictions.map(object29).some((restriction) => {
    if (restriction.type === 'Zone') return false;
    if (restriction.type !== 'Location') return true;
    const info = restriction.restrictionInfo === undefined ? undefined : object29(restriction.restrictionInfo);
    const locations = info?.locations ?? restriction.values;
    return (
      !Array.isArray(locations) ||
      locations.length === 0 ||
      locations.some((location) => same19(location, source.region))
    );
  });
  const capabilities = sku.capabilities.map(object29);
  const architectures = capabilities.filter((capability) => same19(capability.name, 'CpuArchitectureType'));
  require35(architectures.length === 1 && architectures[0].value === 'x64', 'host SKU architecture missing or differs');
  const number = (name, integer) => {
    const matches = capabilities.filter((capability) => same19(capability.name, name));
    require35(
      matches.length === 1 && typeof matches[0].value === 'string' && /^\d+(?:\.\d+)?$/.test(matches[0].value),
      'SKU capability missing or ambiguous',
    );
    const value = Number(matches[0].value);
    require35(Number.isFinite(value) && value > 0 && (!integer || Number.isInteger(value)), 'invalid SKU capability');
    return value;
  };
  const zones = infos[0].zones ?? [];
  require35(
    Array.isArray(zones) &&
      zones.every((zone) => typeof zone === 'string' && /^[1-9]\d*$/.test(zone)) &&
      new Set(zones).size === zones.length,
    'invalid SKU zones',
  );
  const size = {
    name: selection.vmSize,
    ...readAzureSkuHardware(sku),
    maxNics: number('MaxNetworkInterfaces', true),
    vCpus: number('vCPUs', true),
    memoryGb: number('MemoryGB', false),
    zones: zones.toSorted(),
    restricted,
  };
  const catalog = {
    region: source.region,
    image: { id: host.id, urn, osType: 'Linux', architecture: 'amd64' },
    vmSizes: [size],
    provenance: {
      method: 'azure-cli-live',
      sourcePlanSha256: source.planSha256,
      observedAt: new Date().toISOString(),
      reads,
    },
  };
  deadline.throwIfAborted();
  return catalog;
}
async function resolveAzureRelayCatalog(source, selection, api, signal) {
  const catalog = await resolveAzureLinuxHostCatalog(source, selection, api, signal);
  compileAzureRelayPlan(source, selection, catalog);
  return catalog;
}

// plugins/azure/src/ce/workload-plan.ts
var require36 = (value, message) => {
  if (!value) throw Error(`Azure workload plan: ${message}`);
};
function azureWorkloadSelection(plan) {
  const version = plan.intent.workloadFixture?.imageVersion;
  require36(typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version), 'exact Ubuntu image version required');
  return {
    hostImage: { ...AZURE_CE_WORKLOAD_FIXTURE_IMAGE, version },
    vmSize: AZURE_CE_WORKLOAD_FIXTURE_VM_SIZE,
  };
}
async function resolveAzureWorkloadCatalog(plan, api, signal) {
  return resolveAzureLinuxHostCatalog(plan, azureWorkloadSelection(plan), api, signal);
}
function compileAzureWorkloadDeploymentPlan(source, catalog) {
  require36(!source.workloadProfile && !source.relayProfile, 'unprofiled foundation required');
  verifyAzureCePlan(source);
  require36(
    source.engine === 'terraform' &&
      source.intent.operation === 'deploy' &&
      source.routing.mode === 'route-server' &&
      source.intent.workloadFixture,
    'owning Terraform workload deployment required',
  );
  const selection = azureWorkloadSelection(source);
  const urn = Object.values(selection.hostImage).join(':');
  const imageId = `/subscriptions/${source.subscription.id}/providers/Microsoft.Compute/locations/${source.region}/publishers/${selection.hostImage.publisher}/artifacttypes/vmimage/offers/${selection.hostImage.offer}/skus/${selection.hostImage.sku}/versions/${selection.hostImage.version}`;
  require36(
    catalog.region === source.region &&
      catalog.image.urn === urn &&
      catalog.image.id.toLowerCase() === imageId.toLowerCase() &&
      catalog.image.osType === 'Linux' &&
      catalog.image.architecture === 'amd64',
    'exact workload image identity differs',
  );
  require36(
    catalog.vmSizes.length === 1 &&
      catalog.vmSizes[0].name === selection.vmSize &&
      !catalog.vmSizes[0].restricted &&
      catalog.vmSizes[0].vCpus === AZURE_CE_WORKLOAD_FIXTURE_VCPUS &&
      catalog.vmSizes[0].maxNics >= 1 &&
      catalog.vmSizes[0].memoryGb >= 1,
    'workload SKU capacity or region eligibility differs',
  );
  const queries = [
    ['account', 'show'],
    ['vm', 'image', 'show', '--urn', urn, '--location', source.region],
    ['vm', 'list-skus', '--size', selection.vmSize, '--location', source.region, '--all'],
  ].map((args) => [...args, '--subscription', source.subscription.id, '--output', 'json']);
  const provenance = catalog.provenance;
  require36(
    provenance?.method === 'azure-cli-live' &&
      provenance.sourcePlanSha256 === source.planSha256 &&
      Number.isFinite(Date.parse(provenance.observedAt)) &&
      provenance.reads.length === 3 &&
      provenance.reads.every(
        (read, index) =>
          read.command === 'az' &&
          JSON.stringify(read.args) === JSON.stringify(queries[index]) &&
          /^[a-f0-9]{64}$/.test(read.responseSha256) &&
          Number.isFinite(Date.parse(read.observedAt)) &&
          Date.parse(read.observedAt) <= Date.parse(provenance.observedAt),
      ),
    'catalog provenance differs or is incomplete',
  );
  const { planId: _id, planSha256: _sha, ...base } = structuredClone(source);
  const draft = {
    ...base,
    workloadProfile: {
      schemaVersion: 1,
      foundationPlan: structuredClone(source),
      catalog: structuredClone(catalog),
    },
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-${planSha256.slice(0, 24)}`, planSha256 };
}
function verifyAzureWorkloadDeploymentProfile(plan) {
  const profile = plan.workloadProfile;
  require36(
    profile?.schemaVersion === 1 && Object.keys(profile).sort().join(',') === 'catalog,foundationPlan,schemaVersion',
    'profile shape differs',
  );
  if (!profile) throw Error('Azure workload plan: profile missing');
  const expected = compileAzureWorkloadDeploymentPlan(profile.foundationPlan, profile.catalog);
  require36(
    canonicalSha256(plan) === canonicalSha256(expected),
    'workload execution graph differs from collected catalog',
  );
}

// plugins/azure/src/ce/artifacts.ts
var memoryPlans = new Map();
var persistedPlans = new WeakMap();
function planSession(session) {
  const id = session.getSessionId(),
    directory = session.getArtifactsDir();
  const callbacks = [session.getSessionId, session.getArtifactsDir, session.getArtifactPath, session.saveArtifact];
  return {
    id,
    directory,
    seal: () => {
      if (
        session.getSessionId() !== id ||
        session.getArtifactsDir() !== directory ||
        callbacks.some(
          (callback, index) =>
            callback !==
            [session.getSessionId, session.getArtifactsDir, session.getArtifactPath, session.saveArtifact][index],
        )
      )
        throw Error('Azure CE plan session changed during artifact access');
    },
  };
}
async function readPlanPacket(path, directory) {
  if (resolve(dirname2(path)) !== resolve(directory) || !path.endsWith('.azure-ce-plan.log'))
    throw Error('Azure CE plan artifact path differs from its session');
  const info = await lstat2(path);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.size > 32 * 1024 * 1024 ||
    (await realpath(path)) !== join3(await realpath(directory), basename2(path))
  )
    throw Error('Azure CE plan artifact identity is invalid');
  const directoryIdentity = await realpath(directory);
  const bytes = await readFile4(path, 'utf8');
  const final = await lstat2(path);
  if (
    (await realpath(directory)) !== directoryIdentity ||
    !final.isFile() ||
    final.isSymbolicLink() ||
    final.dev !== info.dev ||
    final.ino !== info.ino ||
    final.size !== info.size ||
    final.mtimeMs !== info.mtimeMs
  )
    throw Error('Azure CE plan artifact changed during read');
  return bytes;
}
function verifyPlanEnvelope(value, planId, planSha256) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Azure CE plan envelope is malformed');
  const row = value;
  if (
    row.kind !== 'azure-ce-plan' ||
    row.plan?.planId !== planId ||
    row.plan?.planSha256 !== planSha256 ||
    row.observation?.schemaVersion !== AZURE_CE_SCHEMA_VERSION
  )
    throw Error('Azure CE plan envelope identity differs');
  verifyAzureCePlan(row.plan);
  return structuredClone(row);
}
function verifyAzureCePlan(plan) {
  if (plan.schemaVersion !== AZURE_CE_SCHEMA_VERSION || plan.intent.schemaVersion !== AZURE_CE_SCHEMA_VERSION)
    throw new Error('Persisted Azure CE plan uses an unsupported schema version');
  if (!['native', 'terraform'].includes(plan.engine) || plan.intent.engine !== plan.engine)
    throw new Error('Persisted Azure CE plan has invalid execution ownership');
  const { planId, planSha256, ...draft } = plan;
  const actual = canonicalSha256(draft);
  if (!safeHexEqual(actual, planSha256) || planId !== `azure-ce-${planSha256.slice(0, 24)}`) {
    throw new Error('Persisted Azure CE plan failed integrity validation');
  }
  if (plan.networkReplacementProfile !== undefined) verifyAzureNativeNetworkReplacementProfile(plan);
  if (plan.networkProfile !== undefined) verifyAzureNativeNetworkProfile(plan);
  if (plan.terraformNetworkProfile !== undefined) verifyAzureTerraformNetworkProfile(plan);
  if (plan.terraformNetworkReplacementProfile !== undefined) verifyAzureTerraformNetworkReplacementProfile(plan);
  if (plan.relayProfile?.schemaVersion === 2) verifyAzureRelayReplacementProfile(plan);
  else if (plan.relayProfile) verifyAzureRelayDeploymentProfile(plan);
  else if (plan.workloadProfile) verifyAzureWorkloadDeploymentProfile(plan);
}
async function saveDiscoveryArtifact(session, observation) {
  if (observation.schemaVersion !== AZURE_CE_SCHEMA_VERSION)
    throw new Error('Azure CE discovery observation uses an unsupported schema version');
  return session.saveArtifact(JSON.stringify({ kind: 'azure-ce-discovery', observation }), 'azure-ce-discovery');
}
async function loadDiscoveryArtifact(session, id) {
  if (!/^\d+$/.test(id)) throw new Error('Invalid discovery artifact ID');
  const path = await session.getArtifactPath(id);
  if (!path) throw new Error(`Discovery artifact ${id} was not found in this session`);
  const envelope = JSON.parse(await Bun.file(path).text());
  if (envelope.kind !== 'azure-ce-discovery' || envelope.observation?.schemaVersion !== AZURE_CE_SCHEMA_VERSION)
    throw new Error('Artifact is not an Azure CE discovery observation');
  return envelope.observation;
}
async function savePlanArtifact(session, plan, observation) {
  verifyAzureCePlan(plan);
  const scope = planSession(session);
  const inputSha256 = canonicalSha256({ plan, observation });
  const envelope = structuredClone({ kind: 'azure-ce-plan', plan, observation });
  const bytes = canonicalStringify(envelope);
  const id = await session.saveArtifact(bytes, 'azure-ce-plan');
  scope.seal();
  if (canonicalSha256({ plan, observation }) !== inputSha256)
    throw Error('Azure CE plan input changed during publication');
  if (scope.directory !== null) {
    if (typeof id !== 'string' || !id) throw Error('Azure CE plan persistence acknowledgement is missing');
    let path = await session.getArtifactPath(id);
    scope.seal();
    if (!path) {
      const suffix = '.azure-ce-plan.log';
      const names = (await readdir(scope.directory)).filter(
        (name) =>
          name.endsWith(suffix) &&
          (name === id ||
            (/^\d+$/.test(id) &&
              /^\d+$/.test(name.slice(0, -suffix.length)) &&
              BigInt(name.slice(0, -suffix.length)) === BigInt(id))),
      );
      scope.seal();
      const selected = names.length === 1 ? names[0] : undefined;
      if (selected === undefined) throw Error('Azure CE plan persisted receipt path is missing or ambiguous');
      path = join3(scope.directory, selected);
    }
    const actual = await readPlanPacket(path, scope.directory);
    scope.seal();
    if (actual !== bytes || canonicalSha256({ plan, observation }) !== inputSha256)
      throw Error('Azure CE plan persisted bytes or input changed during publication');
    const records = persistedPlans.get(session) ?? new Map();
    records.set(`${scope.id}:${scope.directory}:${planIdKey(plan.planId, plan.planSha256)}`, {
      path,
      sha256: sha256Hex(bytes),
    });
    persistedPlans.set(session, records);
  } else {
    const plans = memoryPlans.get(scope.id) ?? [];
    plans.push(envelope);
    memoryPlans.set(scope.id, plans);
    return;
  }
  return id;
}
function planIdKey(planId, planSha256) {
  return `${planId}:${planSha256}`;
}
async function loadPlanArtifact(session, planId, planSha256) {
  if (!/^[a-f0-9]{64}$/.test(planSha256) || planId !== `azure-ce-${planSha256.slice(0, 24)}`)
    throw Error('Invalid exact Azure CE plan identity');
  const scope = planSession(session);
  if (scope.directory === null) {
    const memory = memoryPlans
      .get(scope.id)
      ?.find((row) => row.plan.planId === planId && row.plan.planSha256 === planSha256);
    scope.seal();
    if (!memory) throw Error('The exact plan is unavailable in this non-persistent session');
    return verifyPlanEnvelope(memory, planId, planSha256);
  }
  const known = persistedPlans.get(session)?.get(`${scope.id}:${scope.directory}:${planIdKey(planId, planSha256)}`);
  if (known) {
    const bytes = await readPlanPacket(known.path, scope.directory);
    scope.seal();
    if (sha256Hex(bytes) !== known.sha256) throw Error('Azure CE plan persisted bytes changed after publication');
    return verifyPlanEnvelope(JSON.parse(bytes), planId, planSha256);
  }
  let files;
  try {
    files = (await readdir(scope.directory)).filter((file) => file.endsWith('.azure-ce-plan.log')).sort();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    files = [];
  }
  scope.seal();
  let selected;
  for (const file of files) {
    const bytes = await readPlanPacket(join3(scope.directory, file), scope.directory);
    scope.seal();
    let value;
    try {
      value = JSON.parse(bytes);
    } catch {
      continue;
    }
    const row = value;
    if (!row || (row.plan?.planId !== planId && row.plan?.planSha256 !== planSha256)) continue;
    const current = verifyPlanEnvelope(row, planId, planSha256);
    if (selected && canonicalSha256(selected) !== canonicalSha256(current))
      throw Error('Ambiguous exact Azure CE plan artifacts');
    selected = current;
  }
  scope.seal();
  if (selected) return selected;
  throw new Error('No exact, integrity-valid Azure CE plan was found in this session');
}
async function saveCheckpoint(session, plan, checkpoint) {
  validateAzureCeCheckpoint(checkpoint, plan);
  const artifactId = await session.saveArtifact(
    JSON.stringify({ kind: 'azure-ce-checkpoint', checkpoint }),
    'azure-ce-checkpoint',
  );
  if (!artifactId) throw new Error('Azure CE checkpoint persistence failed');
  return artifactId;
}
async function loadCheckpoint(session, plan) {
  const artifactsDir = session.getArtifactsDir();
  if (!artifactsDir) return;
  let files;
  try {
    files = (await readdir(artifactsDir))
      .filter((file) => file.endsWith('.azure-ce-checkpoint.log'))
      .sort()
      .reverse();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return;
  }
  for (const file of files) {
    let envelope;
    const content = await Bun.file(join3(artifactsDir, file)).text();
    try {
      envelope = JSON.parse(content);
    } catch {
      throw new Error('Persisted Azure CE checkpoint JSON is malformed');
    }
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope))
      throw new Error('Persisted Azure CE checkpoint envelope is malformed');
    const record = envelope;
    const checkpoint = record.checkpoint;
    if (!checkpoint || typeof checkpoint !== 'object' || Array.isArray(checkpoint))
      throw new Error('Persisted Azure CE checkpoint is malformed');
    const identity = checkpoint;
    if (identity.planId !== plan.planId && identity.planSha256 !== plan.planSha256) continue;
    if (record.kind !== 'azure-ce-checkpoint') {
      throw new Error('Persisted Azure CE checkpoint envelope is malformed');
    }
    return validateAzureCeCheckpoint(checkpoint, plan);
  }
  return;
}
async function readAzureCePlanInventory(session, signal) {
  const scope = planSession(session);
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    scope.seal();
  };
  const step = async (work) => {
    seal();
    const abort = Promise.withResolvers(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([work(), abort.promise]);
      seal();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const envelope = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw Error('Azure CE plan inventory envelope is malformed');
    const row = value;
    return verifyPlanEnvelope(row, row.plan?.planId, row.plan?.planSha256);
  };
  const inspect = async () => {
    seal();
    const rows = [];
    const packets = [];
    let directoryIdentity = null;
    if (scope.directory === null) {
      const memory = structuredClone(memoryPlans.get(scope.id) ?? []);
      for (const [index, value] of memory.entries()) {
        rows.push(envelope(value));
        packets.push({ name: String(index), sha256: canonicalSha256(value) });
      }
      seal();
      if (canonicalSha256(memoryPlans.get(scope.id) ?? []) !== canonicalSha256(memory))
        throw Error('Azure CE memory plan inventory changed during inspection');
    } else {
      const directory = scope.directory;
      const identity = async () => {
        const stat = await step(() => lstat2(directory));
        if (
          !stat.isDirectory() ||
          stat.isSymbolicLink() ||
          (await step(() => realpath(directory))) !== resolve(directory)
        )
          throw Error('Azure CE plan inventory directory identity is invalid');
        return `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
      };
      directoryIdentity = await identity();
      const names = async () =>
        (await step(() => readdir(directory))).filter((name) => name.endsWith('.azure-ce-plan.log')).sort();
      const files = await names();
      const pinned = [...(persistedPlans.get(session)?.entries() ?? [])].filter(([key]) =>
        key.startsWith(`${scope.id}:${directory}:`),
      );
      for (const [, record] of pinned)
        if (!files.includes(basename2(record.path))) throw Error('Azure CE plan inventory lost a published packet');
      for (const name of files) {
        const path = join3(directory, name),
          stat = await step(() => lstat2(path));
        const bytes = await step(() => readPlanPacket(path, directory));
        const final = await step(() => lstat2(path));
        const packetIdentity = (value) => `${value.dev}:${value.ino}:${value.size}:${value.mtimeMs}:${value.ctimeMs}`;
        if (packetIdentity(stat) !== packetIdentity(final))
          throw Error('Azure CE plan inventory packet changed during inspection');
        const sha256 = sha256Hex(bytes);
        if (pinned.some(([, record]) => record.path === path && record.sha256 !== sha256))
          throw Error('Azure CE plan inventory published packet changed');
        rows.push(envelope(JSON.parse(bytes)));
        packets.push({ name, sha256, identity: packetIdentity(final) });
      }
      if (canonicalSha256(await names()) !== canonicalSha256(files) || (await identity()) !== directoryIdentity)
        throw Error('Azure CE plan inventory changed during inspection');
      if (
        canonicalSha256(
          [...(persistedPlans.get(session)?.entries() ?? [])].filter(([key]) =>
            key.startsWith(`${scope.id}:${directory}:`),
          ),
        ) !== canonicalSha256(pinned)
      )
        throw Error('Azure CE plan inventory publications changed during inspection');
    }
    const unique = new Map();
    for (const row of rows) {
      const key = planIdKey(row.plan.planId, row.plan.planSha256),
        previous = unique.get(key);
      if (previous && canonicalSha256(previous) !== canonicalSha256(row))
        throw Error('Ambiguous exact Azure CE plan inventory');
      unique.set(key, row);
    }
    seal();
    return {
      plans: [...unique.values()].sort((a, b) => a.plan.planSha256.localeCompare(b.plan.planSha256)),
      sourceSha256: canonicalSha256({ sessionId: scope.id, directory: scope.directory, directoryIdentity, packets }),
    };
  };
  const snapshot = await inspect();
  const recheck = async () => {
    const current = await inspect();
    if (
      current.sourceSha256 !== snapshot.sourceSha256 ||
      canonicalSha256(current.plans) !== canonicalSha256(snapshot.plans)
    )
      throw Error('Azure CE plan inventory changed after inspection');
  };
  await recheck();
  return { ...structuredClone(snapshot), recheck };
}

export {
  AZURE_CE_CHECKPOINT_SCHEMA_VERSION,
  AZURE_CE_SCHEMA_VERSION,
  AZURE_CE_SHARED_CONTRACT_URL,
  AZURE_CE_TERRAFORM_VERSION,
  acquireProcessLock,
  assertActionOwnership,
  assertApplyAllowed,
  assertAzureCeRoutingExecutable,
  assertObservationFresh,
  assessCeUpgradeTransition,
  azureNativeBootstrapForAction,
  azureNativeNetworkGenerationCompletionName,
  azureNativeNetworkReplacementNics2,
  azureNativeNetworkScope,
  azureNativePendingActionConverged,
  azureNetworkUpdateAppliedNics,
  azureRelayHistoricalArtifacts,
  azureRelayOwnershipTags,
  azureRelayPlanForDeployment,
  azureRelayReplacementRetainedOwner,
  azureRelayResourceSource,
  azureTerraformCurrentDeployment,
  azureTerraformFoundationDeployment,
  azureTerraformNetworkScope,
  azureUpgradeBinding,
  buildAzureNativePendingAction,
  buildSiteUpgradeRequest,
  captureAzureNativeNetworkReplacementNics2,
  captureAzureNetworkUpdateInventory,
  captureAzureReplacementRouteServerOwnership,
  classifyAzureImageHardwareCompatibility,
  collectAzureAbsentDeletionTail,
  collectAzureNativeAdmissionHealth,
  collectAzureNativeVmState,
  collectAzurePlatformHealth,
  collectAzureRouteServerFailoverHealth,
  collectAzureRouteServerHealth,
  compileAzureCePlan,
  compileAzureNativeNetworkReplacementPlan,
  compileAzureNativeNetworkUpdatePlan,
  compileAzureRelayDeploymentPlan,
  compileAzureRelayReplacementPlan,
  compileAzureTerraformNetworkReplacementPlan,
  compileAzureTerraformNetworkUpdatePlan,
  compileAzureWorkloadDeploymentPlan,
  configureAzureSelectedRelayRouting,
  createWireValidator,
  discoverAzureRouteServerIdentity,
  fingerprintCheckpointObservation,
  fingerprintCurrentObservation,
  initialSoftwareSettings,
  isAzureNativeNetworkCheckpointHistory,
  isAzureNativeNetworkGenerationCompletion,
  isAzureNativeNetworkHistory,
  isAzureNativeReplacementHistory,
  isAzureRelayReplacementHistoricalArtifact,
  listAzureNativeVms,
  loadCheckpoint,
  loadDiscoveryArtifact,
  loadPlanArtifact,
  normalizeAzureDeploymentCapacity,
  normalizeAzureForwardingExpectations,
  observeAzureRelayRoutingWorkflow,
  parseBgpRoutePaths,
  parseBgpRoutes,
  parseBgpSessions,
  parseGeneratedInterfaceUid,
  persistAzureNativeNetworkCheckpointHistory,
  persistAzureNativeNetworkGenerationCompletion,
  persistAzureNativeNetworkHistory,
  persistAzureNativeReplacementHistory,
  prepareAzureNativeAdmission,
  prepareAzureNativeReplacement,
  prepareAzureTerraformUpgrade,
  qualifyAzureNativeNetworkUpdateSource,
  readAzureCePlanInventory,
  readAzureImageHardware,
  readAzureNativeNetworkGenerationCompletion,
  readAzureSkuHardware,
  reconcileAzureNativeDeletionPrefix,
  recordAzureNativeLaunch,
  renderAzureRelayCloudInit,
  renderAzureTerraformFoundation,
  requireAzureCeRoutingContract,
  requireAzureNativePriorGenerationExecution,
  requireAzureRelayHistoricalAcceptance,
  requireCompleteInterfaceEvidence,
  requireQualifiedUpInterfaceEvidence,
  resolveActionArgs,
  resolveAzureForwardingExpectations,
  resolveAzureNicAddress,
  resolveAzureRelayCatalog,
  resolveAzureWorkloadCatalog,
  resolveInterfaceAddress,
  runAzureTerraformUpgrade,
  saveCheckpoint,
  saveDiscoveryArtifact,
  savePlanArtifact,
  usableAzureNetworkAddress,
  validAzureRelayRetainedNics,
  validAzureReplacementRouteServerOwnership,
  validAzureRetainedNicsForSource,
  validateAzureDeletionTail,
  validateAzureNativeAdmissionCheckpoint,
  validateAzureNativeNetworkReplacementMetadata2,
  validateAzureNativeNetworkUpdateCheckpoint,
  validateAzureNativePendingAction,
  validateAzureNetworkUpdateInventory,
  validateExpectedForwardingRoutes,
  verifyAzureCePlan,
  verifyAzureNativeNetworkHistoryRecords,
  verifyAzureNativeNetworkProfile,
  verifyAzureNativeNetworkReplacementExecution2,
  verifyAzureNativeNetworkReplacementRetirementSource,
  verifyAzureNativeNetworkUpdateSite,
  verifyAzureNativeReplacementHistories,
  verifyAzureNativeReplacementOriginalSource,
  verifyAzureNetworkUpdateProgress,
  verifyAzureRelayHistoricalArtifacts,
  verifyAzureRelayPlan,
  verifyAzureRelayReplacementHistories,
  verifyAzureTerraformNetworkProfile,
  verifyAzureTerraformNetworkReplacementProfile,
  verifyAzureTerraformUpgrade,
  withAzureNativeBootstrapFile,
};
