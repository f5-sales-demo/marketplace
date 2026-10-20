// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun
var __esm = (fn, res, err) => () => {
  if (fn)
    try {
      res = fn((fn = 0));
    } catch (e) {
      err = [e];
    }
  if (err) throw err[0];
  return res;
};

// plugins/platform/src/ce/deployment-store.ts
import { createHash, randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

function key(owner) {
  return createHash('sha256')
    .update(JSON.stringify([owner.provider, owner.account, owner.region, owner.deploymentId]))
    .digest('hex');
}
function sameOwner(a, b) {
  return ['deploymentId', 'engine', 'provider', 'account', 'region'].every((field) => a[field] === b[field]);
}
async function directory(path) {
  await mkdir(path, { recursive: true, mode: 448 });
  const stat = await lstat(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    (await realpath(path)) !== path
  )
    throw new Error('CE deployment storage ownership is invalid');
  await chmod(path, 448);
}

class CeDeploymentStore {
  directory;
  owner;
  constructor(directory, owner) {
    this.directory = directory;
    this.owner = owner;
  }
  static async open(root, owner) {
    if (
      !isAbsolute(root) ||
      !['native', 'terraform'].includes(owner.engine) ||
      !['aws', 'azure'].includes(owner.provider) ||
      [owner.account, owner.region, owner.deploymentId].some((value) => !value || /[\r\n]/.test(value))
    )
      throw new Error('Invalid CE storage binding');
    await directory(root);
    const path = join(root, key(owner));
    await directory(path);
    const store = new CeDeploymentStore(path, structuredClone(owner));
    try {
      await writeFile(join(path, 'owner.json'), JSON.stringify({ schemaVersion: 2, owner }), {
        flag: 'wx',
        mode: 384,
      });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    await store.verify();
    return store;
  }
  #path(name) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(name)) throw new Error('Invalid CE storage item');
    return join(this.directory, name);
  }
  async #read(name) {
    const path = this.#path(name);
    const stat = await lstat(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      stat.uid !== process.getuid?.() ||
      (stat.mode & 63) !== 0
    )
      throw new Error('CE storage item ownership is invalid');
    return readFile(path);
  }
  async verify() {
    let manifest;
    try {
      manifest = JSON.parse((await this.#read('owner.json')).toString());
    } catch {
      throw new Error('CE owner manifest is unavailable');
    }
    if (manifest.schemaVersion !== 2 || !sameOwner(manifest.owner, this.owner))
      throw new Error('CE deployment belongs to another execution engine or scope');
  }
  async write(name, value) {
    if (name === 'owner.json') throw new Error('CE deployment ownership is immutable');
    await this.verify();
    const temporary = this.#path(`tmp-${randomUUID()}`);
    try {
      await writeFile(temporary, JSON.stringify(value), { flag: 'wx', mode: 384 });
      await rename(temporary, this.#path(name));
    } finally {
      await rm(temporary, { force: true });
    }
  }
  async read(name) {
    await this.verify();
    return JSON.parse((await this.#read(name)).toString());
  }
  async remove(name) {
    if (name === 'owner.json') throw new Error('CE deployment ownership is immutable');
    await this.verify();
    await rm(this.#path(name), { force: true });
  }
}
var init_deployment_store = () => {};

// plugins/platform/src/ce/bgp-evidence.ts
import { isIP } from 'node:net';

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
        isIP(item.peerAddress) !== 4,
    )
  )
    throw new Error('Invalid expected BGP session identity');
  const value = object(response);
  if (
    value.next_page_token ||
    value.next_token ||
    value.continuation_token ||
    value.NextToken ||
    (value.errors !== undefined && array(value.errors).length)
  )
    throw new Error('Partial BGP session evidence');
  const expectedNodes = [...new Set(expected.map((item) => item.node))];
  const nodes = array(value.ver).map(object);
  if (
    nodes.length !== expectedNodes.length ||
    expectedNodes.some((node) => nodes.filter((candidate) => matchesNode(node, candidate.name)).length !== 1)
  )
    throw new Error('BGP session node identity differs');
  const actual = nodes.flatMap((node) =>
    array(node.peer).map((item) => {
      const peer = object(item);
      const address = object(object(peer.peer_address).ipv4).addr;
      if (
        typeof node.name !== 'string' ||
        typeof peer.interface_name !== 'string' ||
        typeof address !== 'string' ||
        isIP(address) !== 4 ||
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
var object = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed BGP session evidence');
    return value;
  },
  array = (value) => {
    if (!Array.isArray(value)) throw new Error('Incomplete BGP session evidence');
    return value;
  },
  matchesNode = (expected, actual) =>
    actual === expected || (typeof actual === 'string' && actual.startsWith(`${expected}.`));
var init_bgp_evidence = () => {};

// plugins/platform/src/ce/bgp-route-evidence.ts
import { isIP as isIP2 } from 'node:net';

function parseBgpRoutes(response, expectedNodes) {
  if (
    ![1, 2, 3].includes(expectedNodes.length) ||
    new Set(expectedNodes).size !== expectedNodes.length ||
    expectedNodes.some((node) => !/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(node))
  )
    throw new Error('Invalid expected BGP route node identity');
  const value = object2(response);
  if (
    value.next_page_token ||
    value.next_token ||
    value.continuation_token ||
    value.NextToken ||
    (value.errors !== undefined && array2(value.errors).length)
  )
    throw new Error('Partial BGP route evidence');
  const rows = array2(value.ver).map(object2);
  if (
    rows.length !== expectedNodes.length ||
    expectedNodes.some((node) => rows.filter((candidate) => matchesNode2(node, candidate.name)).length !== 1)
  )
    throw new Error('BGP route node identity differs');
  const nodes = expectedNodes.map((node) => {
    const row = rows.find((candidate) => matchesNode2(node, candidate.name));
    if (!row) throw new Error('BGP route node identity differs');
    const routingInstances = array2(row.ri_table).map((entry) => {
      const instance = object2(entry);
      if (typeof instance.routing_instance !== 'string' || !instance.routing_instance)
        throw new Error('Malformed BGP routing instance evidence');
      const tables = array2(instance.rt_table).map((entry) => {
        const table = object2(entry);
        if (typeof table.name !== 'string' || !table.name) throw new Error('Malformed BGP route table evidence');
        const routes = (kind) => {
          const seen = new Set();
          return array2(table[kind]).map((entry) => {
            const route = object2(entry);
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
var object2 = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed BGP route evidence');
    return value;
  },
  array2 = (value) => {
    if (!Array.isArray(value)) throw new Error('Incomplete BGP route evidence');
    return value;
  },
  matchesNode2 = (expected, actual) =>
    actual === expected || (typeof actual === 'string' && actual.startsWith(`${expected}.`)),
  cidr = (value) => {
    if (typeof value !== 'string') return false;
    const parts = value.split('/');
    if (parts.length !== 2) return false;
    const family = isIP2(parts[0]);
    const prefix = Number(parts[1]);
    return (
      Number.isInteger(prefix) && prefix >= 0 && ((family === 4 && prefix <= 32) || (family === 6 && prefix <= 128))
    );
  };
var init_bgp_route_evidence = () => {};

// plugins/platform/src/ce/bgp-service-membership.ts
import { isIP as isIP3 } from 'node:net';

function subnet(value) {
  const [ip, bits] = value.split('/');
  return {
    family: isIP3(ip),
    bits: Number(bits),
    address: ip.split('.').reduce((n, o) => (n * 256 + Number(o)) >>> 0, 0),
  };
}
function overlaps(left, right) {
  const a = subnet(left),
    b = subnet(right);
  if (a.family !== 4 || b.family !== 4) return false;
  const bits = Math.min(a.bits, b.bits),
    mask = bits === 0 ? 0 : (4294967295 << (32 - bits)) >>> 0;
  return (a.address & mask) >>> 0 === (b.address & mask) >>> 0;
}
function parseBgpServiceMembership(peerResponse, routeResponse, expected, bindings, servicePrefixes) {
  const nodes = [...new Set(expected.map((s) => s.node))];
  if (
    !Array.isArray(bindings) ||
    bindings.length !== nodes.length ||
    new Set(bindings.map((b) => b.node)).size !== nodes.length ||
    nodes.some((node) => !bindings.some((b) => b.node === node)) ||
    bindings.some(
      (b) =>
        typeof b.routingInstance !== 'string' ||
        !b.routingInstance ||
        b.routingInstance.includes('__') ||
        typeof b.table !== 'string' ||
        !b.table ||
        b.table.includes('__'),
    ) ||
    !Array.isArray(servicePrefixes) ||
    !servicePrefixes.length ||
    new Set(servicePrefixes).size !== servicePrefixes.length
  )
    throw Error('BGP service binding incomplete or ambiguous');
  for (const cidr of servicePrefixes) {
    const [ip, bits, extra] = cidr.split('/');
    if (
      isIP3(ip) !== 4 ||
      !/^\d{1,2}$/.test(bits ?? '') ||
      Number(bits) < 1 ||
      Number(bits) > 32 ||
      extra !== undefined
    )
      throw Error('BGP service prefix unresolved');
    const address = ip.split('.').reduce((n, o) => (n * 256 + Number(o)) >>> 0, 0),
      mask = (4294967295 << (32 - Number(bits))) >>> 0;
    if ((address & mask) >>> 0 !== address) throw Error('BGP service prefix is not network aligned');
  }
  const sessions = parseBgpSessions(peerResponse, expected);
  const routes = parseBgpRoutes(routeResponse, nodes);
  const membership = bindings.map((binding) => {
    const node = routes.nodes.find((n) => n.node === binding.node);
    const instance = node?.routingInstances.find((r) => r.name === binding.routingInstance);
    const table = instance?.tables.find((t) => t.name === binding.table);
    if (!table) throw Error('BGP service routing instance or table missing');
    return {
      ...binding,
      prefixes: servicePrefixes.map((prefix) => ({
        prefix,
        exported: table.exported.includes(prefix),
        overlappingExports: table.exported.filter((route) => overlaps(route, prefix)),
      })),
    };
  });
  const flags = membership.flatMap((m) => m.prefixes.map((p) => p.exported));
  return {
    status:
      sessions.status !== 'healthy'
        ? 'pending'
        : flags.every(Boolean)
          ? 'active'
          : flags.every((v) => !v) &&
              membership.every((row) => row.prefixes.every((prefix) => prefix.overlappingExports.length === 0))
            ? 'withdrawn'
            : 'pending',
    sessions: sessions.sessions,
    membership,
    freshness: 'unqualified',
    traffic: 'unknown',
  };
}
var init_bgp_service_membership = __esm(() => {
  init_bgp_evidence();
  init_bgp_route_evidence();
});

// plugins/platform/src/ce/bootstrap.ts
function object3(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed bootstrap response');
  return value;
}
function bindAwsCloudInit(response, jwt) {
  const material = object3(response).cloud_init_config;
  if (typeof material !== 'string' || material.length > 1024 * 1024 || !material.startsWith('#cloud-config'))
    throw new Error('Unsupported cloud-init material');
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(jwt)) throw new Error('Malformed site-bound JWT');
  const bound = material.replaceAll('{{ .Token }}', jwt).replaceAll('{{ .token }}', jwt);
  if (/\{\{|\}\}/.test(bound)) throw new Error('Unresolved cloud-init placeholder');
  let parsed;
  try {
    parsed = object3(Bun.YAML.parse(bound));
  } catch {
    throw new Error('Malformed cloud-init material');
  }
  if (!Array.isArray(parsed.write_files)) throw new Error('Cloud-init has no issued user data');
  const files = parsed.write_files.map(object3);
  if (files.some((file) => file.path === '/etc/vpm/config.yaml'))
    throw new Error('Cloud-init overwrites certified image configuration');
  const userData = files.filter((file) => file.path === '/etc/vpm/user_data');
  if (userData.length !== 1 || typeof userData[0].content !== 'string')
    throw new Error('Cloud-init user data identity is invalid');
  const tokens = userData[0].content.split(/\r?\n/).filter((line) => line.startsWith('token:'));
  if (tokens.length !== 1 || tokens[0].slice('token:'.length).trim() !== jwt)
    throw new Error('Cloud-init does not contain the issued site-bound JWT');
  return bound;
}
var init_bootstrap = () => {};

// plugins/platform/src/ce/process-lock.ts
import { randomUUID as randomUUID2 } from 'node:crypto';
import {
  lstat as lstat2,
  mkdir as mkdir2,
  readFile as readFile2,
  rename as rename2,
  rm as rm2,
  writeFile as writeFile2,
} from 'node:fs/promises';
import { basename, dirname, join as join2 } from 'node:path';

async function bootId() {
  const value = (await readFile2('/proc/sys/kernel/random/boot_id', 'utf8')).trim();
  if (!bootPattern.test(value)) throw new Error('Process boot identity is unavailable');
  return value;
}
async function processStartTicks(pid) {
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
async function acquireProcessLock(path) {
  if (!path.startsWith('/') || !/^\.[a-z][a-z0-9-]*-lock$/.test(basename(path)))
    throw new Error('Invalid operation lock path');
  const currentBootId = await bootId();
  const currentStart = await processStartTicks(process.pid);
  if (!currentStart) throw new Error('Current process identity is unavailable');
  const mine = {
    schemaVersion: 1,
    token: randomUUID2(),
    pid: process.pid,
    bootId: currentBootId,
    processStartTicks: currentStart,
  };
  const parent = dirname(path);
  for (let attempt = 0; attempt < 4; attempt++) {
    const candidate = join2(parent, `${basename(path)}.claim-${mine.token}`);
    await mkdir2(candidate, { mode: 448 });
    await writeFile2(join2(candidate, 'claim.json'), JSON.stringify(mine), { mode: 384, flag: 'wx' });
    try {
      await rename2(candidate, path);
      return async () => {
        const owned = await readClaim(path);
        if (owned.token !== mine.token) throw new Error('Operation lock ownership changed');
        await rm2(path, { recursive: true });
      };
    } catch (error) {
      await rm2(candidate, { recursive: true });
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
    const stale = join2(parent, `${basename(path)}.stale-${randomUUID2()}`);
    try {
      await rename2(path, stale);
      await rm2(stale, { recursive: true });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  throw new Error('Operation lock could not be acquired');
}
var tokenPattern, bootPattern;
var init_process_lock = __esm(() => {
  tokenPattern = /^[a-f0-9-]{36}$/;
  bootPattern = /^[a-f0-9-]{36}$/;
});

// plugins/platform/src/ce/ingress-lifecycle.ts
import { createHash as createHash2 } from 'node:crypto';
import { isIP as isIP4 } from 'node:net';
import { join as join3 } from 'node:path';

function object4(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed ingress evidence');
  return value;
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function matches(actual, expected) {
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((item, i) => matches(actual[i], item))
    );
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false;
    const want = expected;
    const got = actual;
    return (
      Object.entries(want).every(([key, value]) => Object.hasOwn(got, key) && matches(got[key], value)) &&
      Object.entries(got).every(
        ([key, value]) =>
          Object.hasOwn(want, key) ||
          value === null ||
          value === '' ||
          value === false ||
          value === 0 ||
          (Array.isArray(value) && value.length === 0),
      )
    );
  }
  return actual === expected;
}

class CeIngressLifecycle {
  port;
  contract;
  storage;
  constructor(port, contract, storage) {
    this.port = port;
    this.contract = contract;
    this.storage = storage;
  }
  async #locked(operation) {
    await this.storage.verify();
    if (this.port.engine !== this.storage.owner.engine) throw new Error('Only the owning engine may mutate ingress');
    const path = join3(this.storage.directory, '.ingress-lock');
    const release = await acquireProcessLock(path);
    try {
      return await operation();
    } finally {
      await release();
    }
  }
  #labels() {
    const owner = this.storage.owner;
    return {
      'xcsh-ce-deployment': owner.deploymentId,
      'xcsh-ce-engine': owner.engine,
      'xcsh-ce-provider': owner.provider,
      'xcsh-ce-account': owner.account,
      'xcsh-ce-region': owner.region,
    };
  }
  async #material(provider, intent, selections, signal) {
    const deadline = AbortSignal.timeout(60000);
    signal = signal ? AbortSignal.any([signal, deadline]) : deadline;
    signal.throwIfAborted();
    if (!Array.isArray(selections) || selections.length < 1 || selections.length > 32)
      throw new Error('Ingress site selections required');
    const names = new Set();
    const nodes = new Set();
    const macs = new Set();
    const addresses = new Set();
    const siteUids = new Set();
    const placements = [];
    for (const selected of selections) {
      const { binding } = selected;
      if (
        !same(binding.owner, this.storage.owner) ||
        binding.owner.provider !== provider ||
        names.has(binding.siteName) ||
        nodes.has(selected.node) ||
        macs.has(selected.mac.toLowerCase()) ||
        (provider === 'aws'
          ? binding.nodes.length !== 1 || binding.nodes[0] !== selected.node
          : ![1, 3].includes(binding.nodes.length) || !binding.nodes.includes(selected.node)) ||
        !/^(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/.test(selected.mac) ||
        (selected.insideAddress !== undefined &&
          (isIP4(selected.insideAddress) !== 4 || addresses.has(selected.insideAddress)))
      )
        throw new Error(`Ingress requires distinct owned ${provider} sites with an observed inside interface`);
      names.add(binding.siteName);
      nodes.add(selected.node);
      macs.add(selected.mac.toLowerCase());
      if (selected.insideAddress) addresses.add(selected.insideAddress);
      const before = await this.port.observeOwnedSite(binding, signal);
      const observation = await (provider === 'aws'
        ? this.port.observeAwsInterfaces(binding, [{ node: selected.node, role: 'sli', mac: selected.mac }], signal)
        : this.port.observeAzureInterfaces(binding, [{ node: selected.node, role: 'sli', mac: selected.mac }], signal));
      const observedAt = Date.parse(observation.observedAt);
      const inside = observation.interfaces;
      if (
        observation.status !== 'observed' ||
        !Number.isFinite(observedAt) ||
        observedAt > Date.now() ||
        Date.now() - observedAt > 60000 ||
        inside.length !== 1 ||
        inside[0].role !== 'sli' ||
        inside[0].node !== selected.node ||
        inside[0].mac !== selected.mac.toLowerCase() ||
        !inside[0].linkUp ||
        !inside[0].ipv4
      )
        throw new Error('Fresh inside interface address evidence is unavailable');
      const after = await this.port.observeOwnedSite(binding, signal);
      if (uid(before) !== uid(after)) throw new Error('Site replaced during ingress discovery');
      if (siteUids.has(uid(after))) throw new Error('Duplicate physical deployment identity');
      siteUids.add(uid(after));
      placements.push({
        siteName: binding.siteName,
        siteUid: uid(after),
        interface: inside[0],
        insideAddress: selected.insideAddress ?? inside[0].ipv4?.address,
      });
    }
    const { originAddress, ...listenerIntent } = intent;
    const built = this.contract.build({
      ...listenerIntent,
      sites: placements.map((p) => {
        const insideAddress = p.insideAddress;
        if (!insideAddress) throw new Error('Inside address became unavailable');
        return { name: p.siteName, insideAddress };
      }),
    });
    const origin = this.contract.buildOrigin({
      name: intent.originPool.name,
      namespace: intent.originPool.namespace,
      originAddress,
      port: intent.port,
      siteNames: placements.map((placement) => placement.siteName),
    });
    signal.throwIfAborted();
    return {
      owner: this.storage.owner,
      contractFingerprint: this.contract.fingerprint,
      siteFingerprint: this.port.siteFingerprint,
      intent: structuredClone(intent),
      selections: structuredClone(selections),
      placements,
      originRequest: {
        metadata: { ...origin.metadata, labels: this.#labels() },
        spec: origin.spec,
      },
      request: { metadata: { ...built.metadata, labels: this.#labels() }, spec: built.spec },
    };
  }
  async planAws(intent, selections, signal) {
    return this.#plan('aws', intent, selections, signal);
  }
  async planAzure(intent, selections, signal) {
    return this.#plan('azure', intent, selections, signal);
  }
  async #plan(provider, intent, selections, signal) {
    return this.#locked(async () => {
      const material = await this.#material(provider, intent, selections, signal);
      const draft = {
        schemaVersion: 1,
        kind: 'ce-inside-http-ingress',
        observedAt: new Date().toISOString(),
        material,
      };
      const sha256 = hash(draft);
      const id = sha256.slice(0, 24);
      const plan = { ...draft, id, sha256, request: material.request };
      await this.storage.write(`ingress-plan-${id}.json`, plan);
      return plan;
    });
  }
  async #load(id) {
    if (!/^[0-9a-f]{24}$/.test(id)) throw new Error('Invalid ingress plan identity');
    const plan = await this.storage.read(`ingress-plan-${id}.json`);
    const { id: savedId, sha256, request, ...draft } = plan;
    if (
      savedId !== id ||
      draft.schemaVersion !== 1 ||
      draft.kind !== 'ce-inside-http-ingress' ||
      hash(draft) !== sha256 ||
      sha256.slice(0, 24) !== id ||
      !same(request, draft.material.request) ||
      !same(draft.material.owner, this.storage.owner) ||
      draft.material.contractFingerprint !== this.contract.fingerprint ||
      draft.material.siteFingerprint !== this.port.siteFingerprint
    )
      throw new Error('Obsolete, forged or foreign ingress plan');
    return plan;
  }
  async matchesAzure(id, intent, selections, signal) {
    return this.#locked(async () => {
      const plan = await this.#load(id);
      if (plan.material.owner.provider !== 'azure') throw new Error('Ingress plan is not Azure-owned');
      const current = await this.#material('azure', intent, selections, signal);
      return same(current, plan.material);
    });
  }
  async #read(path, signal) {
    try {
      return await this.port.request(path, {}, signal);
    } catch (error) {
      if (error instanceof CeApiError && error.category === 'not-found') return;
      throw error;
    }
  }
  async #checkpoint(id) {
    try {
      return object4(await this.storage.read(`ingress-checkpoint-${id}.json`));
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
  }
  async #originCheckpoint(id) {
    try {
      return object4(await this.storage.read(`ingress-origin-checkpoint-${id}.json`));
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
  }
  #owned(actual, plan, expectedUid) {
    const metadata = object4(actual.metadata);
    const labels = object4(metadata.labels);
    if (
      metadata.name !== plan.request.metadata.name ||
      metadata.namespace !== plan.request.metadata.namespace ||
      labels['xcsh-ce-ingress-plan'] !== plan.id ||
      Object.entries(this.#labels()).some(([key, value]) => labels[key] !== value) ||
      (expectedUid !== undefined && uid(actual) !== expectedUid) ||
      !matches(this.contract.projectObserved(actual.spec), this.contract.projectObserved(plan.request.spec))
    )
      throw new Error('Live listener ownership, UID or configuration differs from saved ingress plan');
  }
  #ownedOrigin(actual, plan, expectedUid) {
    const metadata = object4(actual.metadata);
    const labels = object4(metadata.labels);
    const expected = plan.material.originRequest;
    if (
      metadata.name !== expected.metadata.name ||
      metadata.namespace !== expected.metadata.namespace ||
      labels['xcsh-ce-ingress-plan'] !== plan.id ||
      Object.entries(this.#labels()).some(([key, value]) => labels[key] !== value) ||
      (expectedUid !== undefined && uid(actual) !== expectedUid) ||
      !matches(this.contract.projectOriginObserved(actual.spec), this.contract.projectOriginObserved(expected.spec))
    )
      throw new Error('Live origin ownership, UID or configuration differs from saved ingress plan');
  }
  async apply(id, signal) {
    return this.#locked(async () => {
      const plan = await this.#load(id);
      const checkpoint = await this.#checkpoint(id);
      if (
        checkpoint?.phase === 'deleted' ||
        (checkpoint &&
          (checkpoint.planSha256 !== plan.sha256 ||
            !['creating', 'created'].includes(String(checkpoint.phase)) ||
            (checkpoint.phase === 'created' && (typeof checkpoint.uid !== 'string' || !checkpoint.uid))))
      )
        throw new Error('Ingress checkpoint does not admit application');
      const current = await this.#material(
        plan.material.owner.provider,
        plan.material.intent,
        plan.material.selections,
        signal,
      );
      if (!same(current, plan.material)) throw new Error('Ingress identities or addresses changed; replan required');
      const originCheckpoint = await this.#originCheckpoint(id);
      if (
        originCheckpoint &&
        (originCheckpoint.planSha256 !== plan.sha256 ||
          !['creating', 'created'].includes(String(originCheckpoint.phase)) ||
          (originCheckpoint.phase === 'created' && (typeof originCheckpoint.uid !== 'string' || !originCheckpoint.uid)))
      )
        throw new Error('Origin checkpoint does not admit application');
      const originCollection = `/api/config/namespaces/${plan.material.originRequest.metadata.namespace}/origin_pools`;
      let origin = await this.#read(`${originCollection}/${plan.material.originRequest.metadata.name}`, signal);
      if (!origin) {
        if (originCheckpoint?.uid) throw new Error('Checkpointed origin is missing; reconcile before replacement');
        await this.storage.write(`ingress-origin-checkpoint-${id}.json`, {
          phase: 'creating',
          planSha256: plan.sha256,
        });
        if (
          !same(
            await this.#material(plan.material.owner.provider, plan.material.intent, plan.material.selections, signal),
            plan.material,
          )
        )
          throw new Error('Ingress evidence changed before origin mutation');
        try {
          await this.port.request(
            originCollection,
            {
              method: 'POST',
              body: JSON.stringify({
                ...plan.material.originRequest,
                metadata: {
                  ...plan.material.originRequest.metadata,
                  labels: { ...plan.material.originRequest.metadata.labels, 'xcsh-ce-ingress-plan': id },
                },
              }),
            },
            signal,
          );
        } catch (error) {
          if (!(error instanceof CeApiError && ['transient', 'conflict'].includes(error.category))) throw error;
        }
        origin = await this.#read(`${originCollection}/${plan.material.originRequest.metadata.name}`, signal);
        if (!origin) throw new Error('Origin creation is not yet observable; resume the saved plan');
      }
      this.#ownedOrigin(origin, plan, originCheckpoint?.uid);
      const originUid = uid(origin);
      await this.storage.write(`ingress-origin-checkpoint-${id}.json`, {
        phase: 'created',
        planSha256: plan.sha256,
        uid: originUid,
        observedAt: new Date().toISOString(),
      });
      const collection = `/api/config/namespaces/${plan.request.metadata.namespace}/http_loadbalancers`;
      let existing = await this.#read(`${collection}/${plan.request.metadata.name}`, signal);
      if (!existing) {
        if (checkpoint?.uid) throw new Error('Checkpointed listener is missing; reconcile before replacement');
        await this.storage.write(`ingress-checkpoint-${id}.json`, { phase: 'creating', planSha256: plan.sha256 });
        if (
          !same(
            await this.#material(plan.material.owner.provider, plan.material.intent, plan.material.selections, signal),
            plan.material,
          )
        )
          throw new Error('Ingress evidence changed before mutation');
        try {
          await this.port.request(
            collection,
            {
              method: 'POST',
              body: JSON.stringify({
                ...plan.request,
                metadata: {
                  ...plan.request.metadata,
                  labels: { ...plan.request.metadata.labels, 'xcsh-ce-ingress-plan': id },
                },
              }),
            },
            signal,
          );
        } catch (error) {
          if (!(error instanceof CeApiError && ['transient', 'conflict'].includes(error.category))) throw error;
        }
        existing = await this.#read(`${collection}/${plan.request.metadata.name}`, signal);
        if (!existing) throw new Error('Ingress creation is not yet observable; resume the saved plan');
      }
      this.#owned(existing, plan, checkpoint?.uid);
      const receipt = {
        phase: 'created',
        planSha256: plan.sha256,
        uid: uid(existing),
        observedAt: new Date().toISOString(),
        listener: 'configured',
        routes: 'unknown',
        traffic: 'unknown',
      };
      await this.storage.write(`ingress-checkpoint-${id}.json`, receipt);
      return receipt;
    });
  }
  async teardownReference(id) {
    const plan = await this.#load(id),
      checkpoint = await this.#checkpoint(id),
      originCheckpoint = await this.#originCheckpoint(id);
    if (
      !checkpoint ||
      !['created', 'deleted'].includes(String(checkpoint.phase)) ||
      checkpoint.planSha256 !== plan.sha256 ||
      typeof checkpoint.uid !== 'string' ||
      !checkpoint.uid ||
      !originCheckpoint ||
      originCheckpoint.phase !== 'created' ||
      originCheckpoint.planSha256 !== plan.sha256 ||
      typeof originCheckpoint.uid !== 'string' ||
      !originCheckpoint.uid
    )
      throw new Error('Validated listener checkpoint required for teardown reference');
    return {
      id,
      name: plan.request.metadata.name,
      namespace: plan.request.metadata.namespace,
      uid: checkpoint.uid,
      phase: String(checkpoint.phase),
      originPool: { ...plan.material.intent.originPool, uid: originCheckpoint.uid },
    };
  }
  async retire(id, signal) {
    return this.#locked(async () => {
      const plan = await this.#load(id);
      const listenerCheckpoint = await this.#checkpoint(id);
      const originCheckpoint = await this.#originCheckpoint(id);
      if (
        !listenerCheckpoint ||
        !['created', 'deleted'].includes(String(listenerCheckpoint.phase)) ||
        listenerCheckpoint.planSha256 !== plan.sha256 ||
        typeof listenerCheckpoint.uid !== 'string' ||
        !listenerCheckpoint.uid ||
        !originCheckpoint ||
        !['created', 'deleted'].includes(String(originCheckpoint.phase)) ||
        originCheckpoint.planSha256 !== plan.sha256 ||
        typeof originCheckpoint.uid !== 'string' ||
        !originCheckpoint.uid
      )
        throw new Error('Validated ingress identities are required for correction');
      const listenerPath = `/api/config/namespaces/${plan.request.metadata.namespace}/http_loadbalancers/${plan.request.metadata.name}`;
      const listener = await this.#read(listenerPath, signal);
      if (listener) {
        if (listenerCheckpoint.phase === 'deleted') throw new Error('Listener reappeared after correction');
        this.#owned(listener, plan, listenerCheckpoint.uid);
        await this.port.request(listenerPath, { method: 'DELETE' }, signal);
        if (await this.#read(listenerPath, signal)) throw new Error('Listener correction is still converging');
      }
      await this.storage.write(`ingress-checkpoint-${id}.json`, {
        ...listenerCheckpoint,
        phase: 'deleted',
        observedAt: new Date().toISOString(),
      });
      const originPath =
        `/api/config/namespaces/${plan.material.originRequest.metadata.namespace}/origin_pools/` +
        plan.material.originRequest.metadata.name;
      const origin = await this.#read(originPath, signal);
      if (origin) {
        if (originCheckpoint.phase === 'deleted') throw new Error('Origin reappeared after correction');
        this.#ownedOrigin(origin, plan, originCheckpoint.uid);
        try {
          await this.port.request(originPath, { method: 'DELETE' }, signal);
        } catch (error) {
          if (!(error instanceof CeApiError && ['not-found', 'transient', 'deadline'].includes(error.category)))
            throw error;
        }
        if (await this.#read(originPath, signal)) throw new Error('Origin correction is still converging');
      }
      await this.storage.write(`ingress-origin-checkpoint-${id}.json`, {
        ...originCheckpoint,
        phase: 'deleted',
        observedAt: new Date().toISOString(),
      });
    });
  }
  async delete(id, signal) {
    return this.#locked(async () => {
      const plan = await this.#load(id);
      const checkpoint = await this.#checkpoint(id);
      if (
        !checkpoint ||
        !['created', 'deleted'].includes(String(checkpoint.phase)) ||
        checkpoint.planSha256 !== plan.sha256 ||
        typeof checkpoint.uid !== 'string' ||
        !checkpoint.uid
      )
        throw new Error('A durable listener UID is required before teardown');
      const path = `/api/config/namespaces/${plan.request.metadata.namespace}/http_loadbalancers/${plan.request.metadata.name}`;
      const existing = await this.#read(path, signal);
      if (existing) {
        if (checkpoint.phase === 'deleted') throw new Error('Listener reappeared after teardown');
        this.#owned(existing, plan, checkpoint.uid);
        await this.port.request(path, { method: 'DELETE' }, signal);
        if (await this.#read(path, signal)) throw new Error('Listener deletion is still converging; resume teardown');
      }
      await this.storage.write(`ingress-checkpoint-${id}.json`, {
        ...checkpoint,
        phase: 'deleted',
        observedAt: new Date().toISOString(),
      });
    });
  }
}
var hash = (value) => createHash2('sha256').update(canonical(value)).digest('hex'),
  same = (a, b) => canonical(a) === canonical(b),
  uid = (value) => {
    const result = object4(value.system_metadata).uid;
    if (typeof result !== 'string' || !result) throw new Error('Ingress resource UID is unavailable');
    return result;
  };
var init_ingress_lifecycle = __esm(() => {
  init_process_lock();
  init_runtime();
});

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

// plugins/platform/src/ce/interface-evidence.ts
import { isIP as isIP5 } from 'node:net';

function observedIpv4(link) {
  if (link.active_state !== 'STATE_ACTIVE') return null;
  try {
    const ipv4 = object5(object5(link.ip).ipv4);
    if (
      typeof ipv4.prefix !== 'string' ||
      isIP5(ipv4.prefix) !== 4 ||
      !Number.isInteger(ipv4.plen) ||
      Number(ipv4.plen) < 0 ||
      Number(ipv4.plen) > 32
    )
      return null;
    return { address: ipv4.prefix, prefixLength: Number(ipv4.plen) };
  } catch {
    return null;
  }
}
function correlateCeInterfaces(configuration, objects, physical, expected, provider = 'aws') {
  const metadata = object5(configuration.metadata);
  const uid = identity(object5(configuration.system_metadata).uid);
  const statusMetadata = object5(physical.metadata);
  if (statusMetadata.name !== metadata.name || metadata.namespace !== 'system' || statusMetadata.namespace !== 'system')
    throw new Error('Foreign physical site evidence');
  if (
    objects.next_page_token ||
    objects.next_token ||
    objects.continuation_token ||
    objects.NextToken ||
    (objects.errors !== undefined && array3(objects.errors).length)
  )
    throw new Error('Partial interface discovery');
  const realized = array3(objects.items).map(object5);
  const configured = array3(object5(object5(object5(configuration.spec)[provider]).not_managed).node_list).flatMap(
    (item) => {
      const node = object5(item);
      const hostname = identity(node.hostname);
      return array3(node.interface_list).map((item) => {
        const iface = object5(item);
        const ethernet = object5(iface.ethernet_interface);
        const network = object5(iface.network_option);
        const slo = Object.hasOwn(network, 'site_local_network');
        const sli = Object.hasOwn(network, 'site_local_inside_network');
        if (
          slo === sli ||
          !Number.isInteger(iface.mtu) ||
          (Number(iface.mtu) !== 0 && (Number(iface.mtu) < 576 || Number(iface.mtu) > 9000))
        )
          throw new Error('Ambiguous interface role or MTU');
        return {
          node: hostname,
          mac: mac(ethernet.mac),
          device: identity(ethernet.device),
          outside: slo,
          mtu: Number(iface.mtu),
        };
      });
    },
  );
  const statuses = array3(physical.status).map(object5);
  const seen = new Set();
  if (!expected.length) throw new Error('Expected interface bindings required');
  return expected.map((binding) => {
    const normalized = mac(binding.mac);
    const key = `${binding.node}/${normalized}`;
    if (seen.has(key)) throw new Error('Duplicate expected interface identity');
    seen.add(key);
    const candidates = configured.filter((item) => item.node === binding.node && item.mac === normalized);
    if (candidates.length !== 1 || candidates[0].outside !== (binding.role === 'slo'))
      throw new Error('Configured MAC binding differs');
    const { outside: _outside, ...configuredInterface } = candidates[0];
    const iface = { ...configuredInterface, role: binding.role };
    const matches = realized.filter((item) => {
      const owner = object5(item.owner_view ?? {});
      if (
        owner.kind !== 'securemesh_site_v2' ||
        owner.name !== metadata.name ||
        owner.namespace !== 'system' ||
        owner.uid !== uid
      )
        return false;
      const ethernet = object5(object5(item.get_spec).ethernet_interface);
      if (ethernet.node !== iface.node || ethernet.device !== iface.device) return false;
      const slo = Object.hasOwn(ethernet, 'site_local_network');
      const sli = Object.hasOwn(ethernet, 'site_local_inside_network');
      if (item.namespace !== 'system' || slo === sli || slo !== (iface.role === 'slo') || ethernet.mtu !== iface.mtu)
        throw new Error('Realized interface disagrees with configured identity');
      return true;
    });
    if (matches.length !== 1) throw new Error('Ambiguous realized interface identity');
    const publications = statuses.filter((item) => {
      if (item.ver_status === undefined || item.ver_status === null) return false;
      const publisher = object5(item.metadata);
      return (
        publisher.creator_class === 'ver' &&
        publisher.publish === 'STATUS_PUBLISH' &&
        publisher.vtrp_stale === false &&
        (matchesNode3(iface.node, publisher.creator_id) ||
          (publisher.creator_id === metadata.name &&
            publisher.status_id === `${iface.node}_SiteStatusMgr` &&
            object5(item.ver_status).ver_instance_name === `${iface.node}-${metadata.name}` &&
            typeof object5(physical.system_metadata ?? {}).uid === 'string' &&
            object5(physical.system_metadata).uid !== '' &&
            array3(item.object_refs).filter((ref) => {
              const value = object5(ref);
              return (
                value.kind === 'ves.io.vega.cfg.site.Object' && value.uid === object5(physical.system_metadata).uid
              );
            }).length === 1))
      );
    });
    if (publications.length !== 1) throw new Error('Physical interface publication is missing, stale or duplicated');
    const links = array3(object5(publications[0].ver_status).intf_status)
      .map(object5)
      .filter((item) => item.name === iface.device);
    if (
      links.length !== 1 ||
      mac(links[0].mac) !== normalized ||
      links[0].link_type !== 'LINK_TYPE_ETHERNET' ||
      links[0].network_type !==
        (iface.role === 'slo' ? 'VIRTUAL_NETWORK_SITE_LOCAL' : 'VIRTUAL_NETWORK_SITE_LOCAL_INSIDE') ||
      typeof links[0].link_state !== 'boolean'
    )
      throw new Error('Physical interface link state is not explicit or identity verified');
    return {
      ...iface,
      interfaceName: identity(matches[0].name),
      linkUp: links[0].link_state,
      ipv4: observedIpv4(links[0]),
    };
  });
}
var object5 = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed interface evidence');
    return value;
  },
  array3 = (value) => {
    if (!Array.isArray(value)) throw new Error('Missing interface evidence collection');
    return value;
  },
  mac = (value) => {
    if (typeof value !== 'string' || !/^(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/.test(value))
      throw new Error('Malformed interface MAC');
    return value.toLowerCase();
  },
  identity = (value) => {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(value))
      throw new Error('Missing interface identity');
    return value;
  },
  matchesNode3 = (expected, actual) =>
    actual === expected || (typeof actual === 'string' && actual.startsWith(`${expected}.`));
var init_interface_evidence = () => {};

// plugins/platform/src/ce/origin-teardown.ts
import { createHash as createHash3 } from 'node:crypto';

function object6(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed origin evidence');
  return value;
}
function canonical2(value) {
  if (Array.isArray(value)) return `[${value.map(canonical2).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical2(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function path(locator, kind) {
  if (
    !locator ||
    ![locator.name, locator.namespace].every(
      (value) => typeof value === 'string' && /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value),
    )
  )
    throw new Error('Invalid origin or listener scope');
  return `/api/config/namespaces/${locator.namespace}/${kind}/${locator.name}`;
}

class CeOriginTeardown {
  port;
  fingerprint;
  constructor(port, fingerprint) {
    this.port = port;
    this.fingerprint = fingerprint;
  }
  #scope(owner, origin, mutate = false) {
    if (
      !owner ||
      !['native', 'terraform'].includes(owner.engine) ||
      !['aws', 'azure'].includes(owner.provider) ||
      [owner.deploymentId, owner.account, owner.region].some(
        (value) => typeof value !== 'string' || !value || /[\r\n]/.test(value),
      ) ||
      (mutate && owner.engine !== this.port.engine)
    )
      throw new Error('Origin ownership or execution engine differs');
    path(origin, 'origin_pools');
    if (typeof origin.uid !== 'string' || !origin.uid.trim()) throw new Error('Exact origin UID is required');
  }
  async #read(source, signal) {
    signal?.throwIfAborted();
    try {
      return object6(await this.port.request(source, {}, signal));
    } catch (error) {
      if (error instanceof CeApiError && error.category === 'not-found') return;
      throw error;
    }
  }
  #identity(value, owner, origin) {
    const metadata = object6(value.metadata),
      labels = object6(metadata.labels);
    const expected = {
      'xcsh-ce-deployment': owner.deploymentId,
      'xcsh-ce-engine': owner.engine,
      'xcsh-ce-provider': owner.provider,
      'xcsh-ce-account': owner.account,
      'xcsh-ce-region': owner.region,
    };
    if (
      metadata.name !== origin.name ||
      metadata.namespace !== origin.namespace ||
      object6(value.system_metadata).uid !== origin.uid ||
      Object.entries(expected).some(([key, item]) => labels[key] !== item)
    )
      throw new Error('Live origin UID or ownership differs');
    if (typeof value.resource_version !== 'string' || !value.resource_version)
      throw new Error('Origin resource version is unavailable');
    return { resourceVersion: value.resource_version, specSha256: digest(object6(value.spec)) };
  }
  async observe(owner, origin, signal) {
    owner = structuredClone(owner);
    origin = structuredClone(origin);
    this.#scope(owner, origin);
    const current = await this.#read(path(origin, 'origin_pools'), signal);
    if (!current) throw new Error('Origin must be observed before planning teardown');
    return {
      schemaVersion: 1,
      owner,
      origin,
      ...this.#identity(current, owner, origin),
      contractFingerprint: this.fingerprint,
      observedAt: new Date().toISOString(),
    };
  }
  async delete(snapshot, listeners, signal) {
    snapshot = structuredClone(snapshot);
    listeners = structuredClone(listeners);
    signal?.throwIfAborted();
    this.#scope(snapshot?.owner, snapshot?.origin, true);
    if (
      snapshot.schemaVersion !== 1 ||
      snapshot.contractFingerprint !== this.fingerprint ||
      !/^[a-f0-9]{64}$/.test(snapshot.specSha256) ||
      typeof snapshot.resourceVersion !== 'string' ||
      !snapshot.resourceVersion ||
      !Number.isFinite(Date.parse(snapshot.observedAt))
    )
      throw new Error('Origin teardown snapshot is invalid');
    if (!Array.isArray(listeners) || listeners.length > 128) throw new Error('Recorded listener inventory is required');
    const listenerPaths = listeners.map((listener) => path(listener, 'http_loadbalancers'));
    if (new Set(listenerPaths).size !== listenerPaths.length) throw new Error('Duplicate listener identities');
    const source = path(snapshot.origin, 'origin_pools');
    for (const listener of listenerPaths)
      if (await this.#read(listener, signal)) throw new Error('Listener must be absent before origin deletion');
    const check = (value) => {
      const identity = this.#identity(value, snapshot.owner, snapshot.origin);
      if (identity.resourceVersion !== snapshot.resourceVersion || identity.specSha256 !== snapshot.specSha256)
        throw new Error('Origin configuration changed after teardown planning');
    };
    let current = await this.#read(source, signal);
    if (current) {
      check(current);
      signal?.throwIfAborted();
      this.#scope(snapshot.owner, snapshot.origin, true);
      try {
        await this.port.request(source, { method: 'DELETE' }, signal);
      } catch (error) {
        if (!(error instanceof CeApiError) || !['not-found', 'transient', 'deadline'].includes(error.category))
          throw error;
      }
      current = await this.#read(source, signal);
      if (current) check(current);
    }
    return {
      status: current ? 'pending' : 'deleted',
      owner: snapshot.owner,
      origin: snapshot.origin,
      source,
      listenerSources: listenerPaths,
      specSha256: snapshot.specSha256,
      contractFingerprint: this.fingerprint,
      observedAt: new Date().toISOString(),
    };
  }
}
var digest = (value) => createHash3('sha256').update(canonical2(value)).digest('hex');
var init_origin_teardown = __esm(() => {
  init_runtime();
});

// plugins/platform/src/ce/platform-drain.ts
import { createHash as createHash4 } from 'node:crypto';

function canonical3(value) {
  if (Array.isArray(value)) return `[${value.map(canonical3).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical3(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function validate(plan, store, port) {
  if (
    plan?.schemaVersion !== 1 ||
    canonical3(plan.owner) !== canonical3(store.owner) ||
    plan.owner.engine !== port.engine ||
    !/^[a-f0-9]{64}$/.test(plan.sourcePlanSha256) ||
    plan.siteContractFingerprint !== port.siteContractFingerprint ||
    plan.ingressContractFingerprint !== port.ingressContractFingerprint ||
    !text(plan.siteContractFingerprint) ||
    !text(plan.ingressContractFingerprint) ||
    !list(plan.listeners, 128) ||
    !list(plan.origins, 128) ||
    !list(plan.sites, 32) ||
    !plan.sites.length
  )
    throw new Error('Platform drain plan scope or contract differs');
  const identities = new Set();
  const unique = (key) => {
    if (identities.has(key)) throw new Error('Duplicate platform drain identity');
    identities.add(key);
  };
  for (const listener of plan.listeners) {
    if (!listener || !/^[a-f0-9]{24}$/.test(listener.id) || !name(listener.name) || !name(listener.namespace))
      throw new Error('Invalid drain listener');
    unique(`listener:${listener.namespace}/${listener.name}`);
    unique(`listener-plan:${listener.id}`);
  }
  for (const snapshot of plan.origins) {
    if (
      snapshot?.schemaVersion !== 1 ||
      canonical3(snapshot.owner) !== canonical3(plan.owner) ||
      snapshot.contractFingerprint !== plan.ingressContractFingerprint ||
      !snapshot.origin ||
      !name(snapshot.origin.name) ||
      !name(snapshot.origin.namespace) ||
      !text(snapshot.origin.uid) ||
      !text(snapshot.resourceVersion) ||
      !/^[a-f0-9]{64}$/.test(snapshot.specSha256) ||
      !Number.isFinite(Date.parse(snapshot.observedAt))
    )
      throw new Error('Invalid drain origin observation');
    unique(`origin:${snapshot.origin.namespace}/${snapshot.origin.name}`);
    unique(`uid:${snapshot.origin.uid}`);
  }
  for (const site of plan.sites) {
    if (
      !site?.binding ||
      canonical3(site.binding.owner) !== canonical3(plan.owner) ||
      !name(site.binding.siteName) ||
      !text(site.siteUid) ||
      !Array.isArray(site.binding.nodes) ||
      ![1, 3].includes(site.binding.nodes.length) ||
      !list(site.routing, 128)
    )
      throw new Error('Invalid drain site identity');
    unique(`site:${site.binding.siteName}`);
    unique(`uid:${site.siteUid}`);
    for (const node of site.binding.nodes) {
      if (!name(node)) throw new Error('Invalid drain node');
      unique(`node:${node}`);
    }
    for (const resource of site.routing) {
      if (
        !resource ||
        !['bgp', 'bgp_routing_policy', 'external_connector'].includes(resource.kind) ||
        !name(resource.name) ||
        !text(resource.uid)
      )
        throw new Error('Invalid drain routing identity');
      unique(`${resource.kind}:${resource.name}`);
      unique(`uid:${resource.uid}`);
    }
  }
}
async function drainCePlatform(input, store, port, signal) {
  const plan = structuredClone(input);
  validate(plan, store, port);
  signal?.throwIfAborted();
  await store.verify();
  const sha256 = hash2(plan);
  let saved;
  try {
    saved = await store.read('platform-drain-source.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (saved === undefined) await store.write('platform-drain-source.json', { sha256, plan });
  else if (!saved || typeof saved !== 'object' || canonical3(saved) !== canonical3({ sha256, plan }))
    throw new Error('Persisted platform drain source differs');
  const completed = [];
  const checkpoint = async () =>
    store.write('platform-drain-progress.json', {
      schemaVersion: 1,
      planSha256: sha256,
      completed: [...completed],
      observedAt: new Date().toISOString(),
    });
  const boundary = async () => {
    signal?.throwIfAborted();
    await store.verify();
    validate(plan, store, port);
  };
  const siteIdentity = async (site) => {
    let current;
    try {
      current = await port.observeOwnedSite(site.binding, signal);
    } catch (error) {
      if (error instanceof CeApiError && error.category === 'not-found') return;
      throw error;
    }
    if (!current || current.system_metadata?.uid !== site.siteUid)
      throw new Error('Site replaced after platform drain planning');
  };
  for (const site of plan.sites) await siteIdentity(site);
  for (const listener of plan.listeners) {
    await boundary();
    await port.deleteListener(listener, signal);
    completed.push(`listener:${listener.namespace}/${listener.name}`);
    await checkpoint();
  }
  for (const origin of plan.origins) {
    await boundary();
    const observation = await port.deleteOrigin(origin, plan.listeners, signal);
    if (observation.status !== 'deleted') return { status: 'pending-origin', planSha256: sha256, completed };
    completed.push(`origin:${origin.origin.namespace}/${origin.origin.name}`);
    await checkpoint();
  }
  for (const kind of ['bgp', 'bgp_routing_policy', 'external_connector'])
    for (const site of plan.sites)
      for (const resource of site.routing.filter((row) => row.kind === kind)) {
        await boundary();
        await siteIdentity(site);
        await port.deleteRouting(site.binding, resource, signal);
        completed.push(`${resource.kind}:${resource.name}`);
        await checkpoint();
      }
  await boundary();
  const receipt = {
    status: 'platform-drained',
    owner: plan.owner,
    sourcePlanSha256: plan.sourcePlanSha256,
    planSha256: sha256,
    completed,
    cloud: 'unknown',
    sites: 'not-retired',
    observedAt: new Date().toISOString(),
  };
  await store.write('platform-drain-receipt.json', receipt);
  return receipt;
}
var hash2 = (value) => createHash4('sha256').update(canonical3(value)).digest('hex'),
  name = (value) => typeof value === 'string' && /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value),
  text = (value) => typeof value === 'string' && !!value.trim(),
  list = (value, maximum) => Array.isArray(value) && value.length <= maximum;
var init_platform_drain = __esm(() => {
  init_runtime();
});

// plugins/platform/src/ce/registration-devices.ts
function correlateRegistrationDevices(response, siteName, instances, expected, provider = 'aws') {
  if (
    response.next_page_token ||
    response.next_token ||
    response.continue ||
    response.continuation_token ||
    (response.errors !== undefined && array4(response.errors).length)
  )
    throw new Error('Incomplete registration inventory');
  const nodes = Object.keys(instances);
  if (
    ![1, 3].includes(nodes.length) ||
    !expected.length ||
    nodes.some((node) => !expected.some((i) => i.node === node))
  )
    throw new Error('Incomplete expected node inventory');
  const items = array4(response.items).map(object7);
  const inventory = new Map();
  for (const node of nodes) {
    const matches = items.filter((item) => {
      const spec = object7(item.get_spec);
      return object7(spec.passport).cluster_name === siteName && object7(spec.infra).hostname === node;
    });
    if (matches.length !== 1) throw new Error('Ambiguous registration inventory');
    const registration = matches[0];
    const spec = object7(registration.get_spec);
    const infra = object7(spec.infra);
    const state = object7(object7(registration.object).status).current_state;
    if (
      !(provider === 'aws'
        ? /^i-[0-9a-f]{8,17}$/.test(instances[node])
        : /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(instances[node])) ||
      infra.instance_id !== instances[node] ||
      object7(spec.passport).cluster_size !== nodes.length ||
      !['ADMITTED', 'ONLINE'].includes(String(state))
    )
      throw new Error('Registration instance binding is unavailable');
    inventory.set(node, array4(object7(infra.hw_info).network).map(object7));
  }
  const seenMacs = new Set();
  const seenRoles = new Set();
  const seenDevices = new Set();
  return expected.map((binding) => {
    const normalized = mac2(binding.mac);
    const role = `${binding.node}/${binding.role}`;
    if (!['slo', 'data', 'sli'].includes(binding.role) || seenMacs.has(normalized) || seenRoles.has(role))
      throw new Error('Duplicate or unsupported expected interface');
    seenMacs.add(normalized);
    seenRoles.add(role);
    let matches = inventory.get(binding.node)?.filter((item) => mac2(item.mac_address) === normalized);
    if (provider === 'azure' && matches?.length === 2) {
      const synthetic = matches.filter((item) => item.driver === 'hv_netvsc');
      const vf = matches.filter((item) => item.driver === 'mlx5_core');
      if (synthetic.length === 1 && vf.length === 1 && synthetic[0].name !== vf[0].name) matches = synthetic;
    }
    if (matches?.length !== 1) throw new Error('Guest MAC identity is unavailable or duplicated');
    const device = matches[0].name;
    if (typeof device !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/.test(device))
      throw new Error('Guest device identity is unavailable');
    const key = `${binding.node}/${device}`;
    if (seenDevices.has(key)) throw new Error('Duplicate guest device identity');
    seenDevices.add(key);
    return { ...binding, mac: normalized, device };
  });
}
function verifyRegisteredInterfaceConfiguration(spec, devices, provider = 'aws') {
  const nodes = array4(object7(object7(spec[provider]).not_managed).node_list).map(object7);
  const expectedNodes = new Set(devices.map((item) => item.node));
  if (!devices.length || nodes.length !== expectedNodes.size) throw new Error('Configured node count differs');
  for (const nodeName of expectedNodes) {
    const matches = nodes.filter((node) => node.hostname === nodeName);
    if (matches.length !== 1) throw new Error('Configured node identity differs');
    const interfaces = array4(matches[0].interface_list).map(object7);
    const expected = devices.filter((item) => item.node === nodeName);
    if (interfaces.length !== expected.length) throw new Error('Configured interface count differs');
    for (const device of expected) {
      const matches = interfaces.filter((item) => mac2(object7(item.ethernet_interface).mac) === device.mac);
      if (matches.length !== 1) throw new Error('Configured interface MAC differs');
      const item = matches[0];
      const network = object7(item.network_option);
      const choice = device.role === 'slo' ? 'site_local_network' : 'site_local_inside_network';
      if (
        object7(item.ethernet_interface).device !== device.device ||
        Object.keys(network).length !== 1 ||
        !Object.hasOwn(network, choice) ||
        Object.hasOwn(item, 'dhcp_server') ||
        Object.hasOwn(item, 'no_ipv4_address') ||
        (device.staticIp
          ? typeof device.staticIp.ip_address !== 'string' ||
            !device.staticIp.ip_address ||
            Object.hasOwn(item, 'dhcp_client') ||
            !Object.hasOwn(item, 'static_ip') ||
            Object.entries(device.staticIp).some(([key, value]) => object7(item.static_ip)[key] !== value)
          : !Object.hasOwn(item, 'dhcp_client') || Object.hasOwn(item, 'static_ip'))
      )
        throw new Error('Configured guest device, role or addressing differs');
    }
  }
}
var object7 = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Malformed registration inventory');
    return value;
  },
  array4 = (value) => {
    if (!Array.isArray(value)) throw new Error('Missing registration inventory');
    return value;
  },
  mac2 = (value) => {
    if (typeof value !== 'string' || !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(value))
      throw new Error('Malformed registration MAC');
    return value.toLowerCase();
  };

// plugins/platform/src/ce/registration-observation.ts
function registrationInstanceBindings(response, siteName, nodes, cloudIds) {
  if (!Array.isArray(response.items)) throw new Error('Missing registration observation');
  const result = {};
  for (const value of response.items) {
    const spec = object8(object8(value).get_spec);
    const infra = object8(spec.infra);
    if (
      object8(spec.passport).cluster_name !== siteName ||
      !nodes.includes(String(infra.hostname)) ||
      !cloudIds.includes(String(infra.instance_id))
    )
      continue;
    const node = String(infra.hostname);
    if (result[node] || Object.values(result).includes(String(infra.instance_id)))
      throw new Error('Ambiguous registration/cloud join');
    result[node] = String(infra.instance_id);
  }
  return result;
}
function parseRegistrationObservation(response, siteName, nodes, clusterSize, expectedInstances) {
  if (
    !Array.isArray(response.items) ||
    response.next_page_token ||
    response.continue ||
    (response.errors !== undefined && (!Array.isArray(response.errors) || response.errors.length))
  )
    return { status: 'unknown', reason: 'registration-list-incomplete' };
  const observations = nodes.map((node) => {
    const matches = response.items.map(object8).filter((item) => {
      const spec = object8(item.get_spec);
      const state = object8(object8(item.object).status).current_state;
      return (
        object8(spec.passport).cluster_name === siteName &&
        object8(spec.infra).hostname === node &&
        !['RETIRED', 'FAILED', 'DONE', 'FAILED_INACTIVE'].includes(String(state))
      );
    });
    if (matches.length !== 1)
      return { node, status: 'unknown', reason: matches.length ? 'ambiguous-registration' : 'registration-not-found' };
    const item = matches[0],
      spec = object8(item.get_spec),
      infra = object8(spec.infra);
    const state = object8(object8(item.object).status).current_state;
    if (
      !expectedInstances[node] ||
      infra.instance_id !== expectedInstances[node] ||
      typeof item.name !== 'string' ||
      !/^r-[a-z0-9-]+$/.test(item.name) ||
      typeof state !== 'string' ||
      !['NOTSET', 'NEW', 'APPROVED', 'ADMITTED', 'PENDING', 'ONLINE', 'UPGRADING', 'MAINTENANCE'].includes(state) ||
      (state !== 'NEW' && object8(spec.passport).cluster_size !== clusterSize)
    )
      return { node, status: 'unknown', reason: 'registration-resource-binding-incomplete' };
    return {
      node,
      registration: item.name,
      instanceId: infra.instance_id,
      state,
      status: state === 'ONLINE' ? 'healthy' : 'degraded',
    };
  });
  return {
    nodes: observations,
    status: observations.every((node) => node.status === 'healthy')
      ? 'healthy'
      : observations.some((node) => node.status === 'unknown')
        ? 'unknown'
        : 'degraded',
  };
}
var object8 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Malformed registration observation');
  return value;
};

// plugins/platform/src/ce/site-labels.ts
function writableSiteLabels(labels) {
  return Object.fromEntries(
    Object.entries(labels).filter(
      ([key]) => !key.startsWith('ves.io/') && !key.startsWith('internal.ves.io/') && !discoveryLabels.has(key),
    ),
  );
}
function writableSiteMetadata(metadata) {
  const labels = metadata.labels;
  if (labels === undefined) return { ...metadata };
  if (!labels || typeof labels !== 'object' || Array.isArray(labels)) throw new Error('Malformed site labels');
  return { ...metadata, labels: writableSiteLabels(labels) };
}
var discoveryLabels;
var init_site_labels = __esm(() => {
  discoveryLabels = new Set(['domain', 'host-os-version', 'hw-model', 'hw-serial-number', 'hw-vendor', 'hw-version']);
});

// plugins/platform/src/ce/teardown-inventory.ts
async function collectCeTeardownInventory(port, input, namespaces, contracts, signal) {
  const bindings = structuredClone(input);
  namespaces = structuredClone(namespaces);
  contracts = structuredClone(contracts);
  const owner = bindings?.[0]?.owner;
  if (
    !owner ||
    !name2(owner.deploymentId) ||
    !['native', 'terraform'].includes(owner.engine) ||
    !['aws', 'azure'].includes(owner.provider) ||
    !text2(owner.account) ||
    !text2(owner.region) ||
    !Array.isArray(bindings) ||
    !bindings.length ||
    bindings.length > 32 ||
    !Array.isArray(namespaces) ||
    !namespaces.length ||
    namespaces.length > 128 ||
    namespaces.some((value) => !name2(value)) ||
    new Set(namespaces).size !== namespaces.length ||
    !text2(contracts.site) ||
    !text2(contracts.ingress)
  )
    throw new Error('Invalid teardown inventory scope');
  const labels = ownerLabels(owner),
    sites = new Set(),
    nodes = new Map();
  for (const binding of bindings) {
    if (
      !name2(binding.siteName) ||
      sites.has(binding.siteName) ||
      Object.keys(ownerLabels(binding.owner)).some((key) => ownerLabels(binding.owner)[key] !== labels[key]) ||
      !Array.isArray(binding.nodes) ||
      ![1, 3].includes(binding.nodes.length)
    )
      throw new Error('Invalid teardown site scope');
    sites.add(binding.siteName);
    for (const node of binding.nodes) {
      if (!name2(node) || nodes.has(node)) throw new Error('Invalid teardown node scope');
      nodes.set(node, binding.siteName);
    }
  }
  signal?.throwIfAborted();
  const sources = [];
  const base = {
    owner,
    siteContractFingerprint: contracts.site,
    ingressContractFingerprint: contracts.ingress,
    startedAt: new Date().toISOString(),
  };
  const read = async (path) => {
    signal?.throwIfAborted();
    sources.push(path);
    return object9(await port.request(path, {}, signal));
  };
  const owned = (actual) => {
    const row = object9(actual);
    if (Object.entries(labels).some(([key, value]) => row[key] !== value))
      throw new Error('Inventory ownership differs');
    return row;
  };
  const readSite = async (binding, physical) => {
    const value = await read(
      `/api/config/namespaces/system/${physical ? 'sites' : 'securemesh_site_v2s'}/${binding.siteName}`,
    );
    const metadata = object9(value.metadata),
      uid = object9(value.system_metadata).uid;
    owned(metadata.labels);
    if (metadata.name !== binding.siteName || metadata.namespace !== 'system' || !text2(uid))
      throw new Error('Site inventory identity differs');
    if (physical) {
      const observed = object9(value.spec).main_nodes;
      if (
        !Array.isArray(observed) ||
        observed.length !== binding.nodes.length ||
        new Set(observed.map((row) => object9(row).name)).size !== observed.length ||
        observed.some((row) => !binding.nodes.includes(String(object9(row).name)))
      )
        throw new Error('Physical node inventory differs');
    }
    return uid;
  };
  try {
    const identities = [];
    for (const binding of bindings)
      identities.push({
        siteName: binding.siteName,
        siteUid: await readSite(binding, false),
        physicalSiteUid: await readSite(binding, true),
      });
    const resources = [],
      seen = new Set(),
      uids = new Set(identities.flatMap((row) => [row.siteUid, row.physicalSiteUid]));
    if (uids.size !== identities.length * 2) throw new Error('Duplicate site UID');
    const collections = [
      { kind: 'tokens', namespace: 'system', prefix: 'register' },
      { kind: 'bgps', namespace: 'system', prefix: 'config' },
      { kind: 'bgp_routing_policys', namespace: 'system', prefix: 'config' },
      { kind: 'external_connectors', namespace: 'system', prefix: 'config' },
      ...namespaces.flatMap((namespace) => [
        { kind: 'http_loadbalancers', namespace, prefix: 'config' },
        { kind: 'origin_pools', namespace, prefix: 'config' },
      ]),
    ];
    for (const { kind, namespace, prefix } of collections) {
      const query = new URLSearchParams({ label_filter: `xcsh-ce-deployment=${owner.deploymentId}` });
      const response = await read(`/api/${prefix}/namespaces/${namespace}/${kind}?${query}`);
      if (
        !Array.isArray(response.items) ||
        response.items.length > 1e4 ||
        (response.errors !== undefined && (!Array.isArray(response.errors) || response.errors.length)) ||
        Object.keys(response).some((key) => !['items', 'errors'].includes(key))
      )
        throw new Error('Incomplete teardown collection');
      for (const item of response.items) {
        const row = object9(item),
          rowLabels = owned(row.labels),
          key = `${namespace}/${kind}/${row.name}`;
        if (!name2(row.name) || row.namespace !== namespace || !text2(row.uid) || seen.has(key) || uids.has(row.uid))
          throw new Error('Invalid or duplicate teardown resource');
        const metadata = row.metadata === undefined || row.metadata === null ? {} : object9(row.metadata),
          system =
            row.system_metadata === undefined || row.system_metadata === null ? {} : object9(row.system_metadata);
        if (
          ['name', 'namespace'].some(
            (key) => metadata[key] !== undefined && metadata[key] !== '' && metadata[key] !== row[key],
          ) ||
          (system.uid !== undefined && system.uid !== '' && system.uid !== row.uid)
        )
          throw new Error('Conflicting flat and nested inventory identities');
        if (metadata.labels !== undefined && Object.keys(object9(metadata.labels)).length) owned(metadata.labels);
        const selected = { kind, name: row.name, namespace, uid: row.uid };
        if (kind === 'tokens') {
          const node = rowLabels['xcsh-ce-node'];
          if (typeof node !== 'string' || !nodes.has(node)) throw new Error('Unknown token node');
          selected.node = node;
          selected.siteName = nodes.get(node);
        }
        if (kind === 'bgps' || kind === 'bgp_routing_policys' || kind === 'external_connectors') {
          const siteName = rowLabels['xcsh-ce-site'],
            siteUid = rowLabels['xcsh-ce-site-uid'];
          if (
            typeof siteName !== 'string' ||
            !identities.some((site) => site.siteName === siteName && site.siteUid === siteUid)
          )
            throw new Error('Routing site binding differs');
          selected.siteName = siteName;
          selected.siteUid = String(siteUid);
        }
        if (kind === 'http_loadbalancers') {
          const id = rowLabels['xcsh-ce-ingress-plan'];
          if (typeof id !== 'string' || !/^[a-f0-9]{24}$/.test(id)) throw new Error('Listener plan identity missing');
          selected.ingressPlanId = id;
        }
        seen.add(key);
        uids.add(row.uid);
        resources.push(selected);
      }
    }
    for (const [bindingIndex, binding] of bindings.entries())
      if (
        (await readSite(binding, false)) !== identities[bindingIndex].siteUid ||
        (await readSite(binding, true)) !== identities[bindingIndex].physicalSiteUid
      )
        throw new Error('Site identity changed during inventory');
    return {
      ...base,
      status: 'observed',
      resources,
      sites: identities,
      sources,
      observedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      ...base,
      status: 'unknown',
      reason: error instanceof CeApiError ? error.category : 'ownership-or-collection-incomplete',
      sources,
      observedAt: new Date().toISOString(),
    };
  }
}
var object9 = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed teardown inventory');
    return value;
  },
  name2 = (value) => typeof value === 'string' && /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value),
  text2 = (value) => typeof value === 'string' && !!value.trim(),
  ownerLabels = (owner) => ({
    'xcsh-ce-deployment': owner.deploymentId,
    'xcsh-ce-engine': owner.engine,
    'xcsh-ce-provider': owner.provider,
    'xcsh-ce-account': owner.account,
    'xcsh-ce-region': owner.region,
  });
var init_teardown_inventory = __esm(() => {
  init_runtime();
});

// plugins/platform/src/ce/upgrade-evidence.ts
function object10(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed upgrade evidence');
  return value;
}
function text3(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Missing upgrade evidence');
  return value;
}
function version(rows, key, statusId, installed, completedDeploymentFallback = false) {
  const observations = [];
  const seen = new Set();
  for (const value of rows) {
    const row = object10(value);
    if (!row.metadata || typeof row.metadata !== 'object' || Array.isArray(row.metadata)) continue;
    const metadata = row.metadata;
    if (metadata.status_id !== statusId) continue;
    if (metadata.creator_class !== 'maurice' || metadata.publish !== 'STATUS_PUBLISH')
      throw new Error('Upgrade status publisher differs');
    if (metadata.vtrp_stale === true) continue;
    if (metadata.vtrp_stale !== false) throw new Error('Upgrade publisher freshness is unknown');
    const uid = text3(metadata.uid);
    if (seen.has(uid)) throw new Error('Duplicate upgrade publisher');
    seen.add(uid);
    const block = object10(row[key]);
    const deployment = object10(block.deployment_state);
    let current = block;
    for (const part of installed) current = object10(current)[part];
    const phase = text3(deployment.phase);
    const result = text3(deployment.result);
    if (
      completedDeploymentFallback &&
      (typeof current !== 'string' || !current.trim()) &&
      phase === 'UPGRADE_COMPLETED' &&
      ['Completed', 'success'].includes(result)
    )
      current = deployment.version;
    observations.push({
      installed: text3(current),
      available: text3(block.available_version),
      phase,
      result,
    });
  }
  if (!observations.length || new Set(observations.map((value) => JSON.stringify(value))).size !== 1)
    throw new Error('Missing or conflicting upgrade version observations');
  return observations[0];
}
function parseSiteUpgradeState(raw, binding) {
  const site = object10(raw);
  const metadata = object10(site.metadata);
  const spec = object10(site.spec);
  const nodes = spec.main_nodes;
  if (
    metadata.name !== binding.siteName ||
    metadata.namespace !== 'system' ||
    !Array.isArray(nodes) ||
    nodes.length !== binding.nodes.length ||
    new Set(nodes.map((node) => object10(node).name)).size !== nodes.length ||
    nodes.some((node) => typeof object10(node).name !== 'string' || !binding.nodes.includes(object10(node).name)) ||
    !Array.isArray(site.status)
  )
    throw new Error('Upgrade physical site or node membership differs');
  const state = text3(spec.site_state);
  const software = version(
    site.status,
    'volterra_software_status',
    'software-version',
    ['last_installed_version'],
    true,
  );
  const os = version(site.status, 'operating_system_status', 'operating-system-version', [
    'deployment_state',
    'version',
  ]);
  initialSoftwareSettings({ software: software.installed, os: os.installed });
  return {
    physicalSiteUid: text3(object10(site.system_metadata).uid),
    siteState: state,
    online: state === 'ONLINE',
    software,
    os,
  };
}
function parseUpgradePrechecks(raw) {
  const list = object10(raw).checklist;
  if (!Array.isArray(list) || !list.length) throw new Error('Missing upgrade prechecks');
  const seen = new Set();
  const checks = list.map((value) => {
    const row = object10(value),
      name = text3(row.item),
      status = text3(row.status);
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
  const values = object10(raw).sw_versions;
  if (
    !Array.isArray(values) ||
    values.some((value) => typeof value !== 'string' || !/^crt-\d{8}-\d{4}$/.test(value)) ||
    new Set(values).size !== values.length
  )
    throw new Error('Missing or malformed software upgrade targets');
  return values;
}
function parseUpgradeProgress(raw, siteName) {
  const value = object10(object10(object10(raw).upgrade_status).sw_upgrade_progress);
  if (value.site !== siteName) throw new Error('Upgrade progress site differs');
  if (!['UNKNOWN', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'SKIPPED'].includes(text3(value.status)))
    throw new Error('Unknown upgrade progress status');
  return { status: text3(value.status), version: text3(value.version) };
}
var init_upgrade_evidence = () => {};

// plugins/platform/src/ce/runtime.ts
function object11(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CeApiError('malformed');
  return value;
}
function subset(actual, desired) {
  if (Array.isArray(desired))
    return (
      Array.isArray(actual) &&
      actual.length === desired.length &&
      desired.every((value, index) => subset(actual[index], value))
    );
  if (desired && typeof desired === 'object')
    return Boolean(
      actual &&
        typeof actual === 'object' &&
        !Array.isArray(actual) &&
        Object.entries(desired).every(([key, value]) => subset(actual[key], value)),
    );
  return actual === desired;
}

class CeRuntime {
  contract;
  engine;
  fetcher;
  resourceMutation;
  recordBinding;
  #base;
  #credential;
  #mutationOwner;
  constructor(contract, engine, apiUrl, credential, fetcher = fetch, resourceMutation, recordBinding) {
    this.contract = contract;
    this.engine = engine;
    this.fetcher = fetcher;
    this.resourceMutation = resourceMutation;
    this.recordBinding = recordBinding;
    this.#base = new URL(apiUrl);
    if (
      this.#base.protocol !== 'https:' ||
      this.#base.username ||
      this.#base.password ||
      this.#base.search ||
      this.#base.hash ||
      !credential
    )
      throw new Error('Explicit HTTPS tenant and credential required');
    this.#credential = credential;
  }
  async #request(path, init = {}, signal) {
    const url = new URL(path, this.#base);
    if (!path.startsWith('/api/') || url.origin !== this.#base.origin)
      throw new Error('F5 request escaped tenant scope');
    if (
      this.engine === 'terraform' &&
      (this.#mutationOwner?.provider ?? 'aws') === 'aws' &&
      ['POST', 'PUT', 'DELETE'].includes(init.method ?? 'GET') &&
      path.startsWith('/api/config/')
    ) {
      if (!this.resourceMutation || !this.#mutationOwner)
        throw new Error('Terraform F5 resource-state execution is unavailable; native REST mutation is prohibited');
      return this.resourceMutation(this.#mutationOwner, path, init, signal);
    }
    const deadline = AbortSignal.timeout(60000);
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
    try {
      const response = await this.fetcher(url, {
        ...init,
        redirect: 'error',
        signal: combined,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `APIToken ${this.#credential}`,
        },
      });
      if (!response.ok) {
        const status = response.status;
        throw new CeApiError(
          status === 401
            ? 'expired'
            : status === 403
              ? 'authorization'
              : status === 404
                ? 'not-found'
                : status === 409
                  ? 'conflict'
                  : status === 429
                    ? 'throttled'
                    : status >= 500
                      ? 'transient'
                      : 'invalid-request',
          status,
        );
      }
      if (!response.body) return {};
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 16 * 1024 * 1024) {
            await reader.cancel();
            throw new CeApiError('malformed');
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return {};
      try {
        return object11(JSON.parse(text));
      } catch {
        throw new CeApiError('malformed');
      }
    } catch (error) {
      if (signal?.aborted) throw new CeApiError('cancelled');
      if (deadline.aborted) throw new CeApiError('deadline');
      if (error instanceof CeApiError) throw error;
      throw new CeApiError('transient');
    }
  }
  #binding(binding, mutation = false) {
    if (
      !safeName.test(binding.siteName) ||
      !safeName.test(binding.owner.deploymentId) ||
      !['aws', 'azure'].includes(binding.owner.provider) ||
      !['native', 'terraform'].includes(binding.owner.engine) ||
      !binding.owner.account ||
      !binding.owner.region ||
      !Array.isArray(binding.nodes) ||
      !binding.nodes.length ||
      binding.nodes.some((node) => !safeName.test(node)) ||
      new Set(binding.nodes).size !== binding.nodes.length
    )
      throw new Error('Invalid CE deployment binding');
    if (mutation && binding.owner.engine !== this.engine)
      throw new Error('Only the owning execution engine may mutate the site');
    if (mutation) this.#mutationOwner = structuredClone(binding.owner);
  }
  #labels(binding) {
    return {
      'xcsh-ce-deployment': binding.owner.deploymentId,
      'xcsh-ce-engine': binding.owner.engine,
      'xcsh-ce-provider': binding.owner.provider,
      'xcsh-ce-account': binding.owner.account,
      'xcsh-ce-region': binding.owner.region,
    };
  }
  #owned(site, binding) {
    const metadata = object11(site.metadata);
    if (
      metadata.name !== binding.siteName ||
      metadata.namespace !== 'system' ||
      !subset(metadata.labels, this.#labels(binding))
    )
      throw new Error('Live site ownership or scope does not match deployment');
  }
  #sitePath(binding) {
    return `/api/config/namespaces/system/securemesh_site_v2s/${binding.siteName}`;
  }
  async observeSite(binding, signal) {
    this.#binding(binding);
    return this.#request(this.#sitePath(binding), {}, signal);
  }
  async observeOwnedSite(binding, signal) {
    const site = await this.observeSite(binding, signal);
    this.#owned(site, binding);
    return site;
  }
  async observePowerVersions(binding, signal) {
    binding = structuredClone(binding);
    this.#binding(binding);
    const source = `/api/config/namespaces/system/sites/${binding.siteName}`;
    const base = {
      owner: structuredClone(binding.owner),
      siteName: binding.siteName,
      nodes: [...binding.nodes],
      contractFingerprint: this.contract.fingerprint,
      source,
      collectedAt: new Date().toISOString(),
      freshness: 'unqualified',
      canSatisfyInterfaceMutationGate: false,
    };
    try {
      const logical = await this.observeOwnedSite(binding, signal),
        siteUid = object11(logical.system_metadata).uid;
      if (typeof siteUid !== 'string' || !siteUid.trim()) throw new CeApiError('malformed');
      const read = async () => {
        const physical = await this.#request(source, {}, signal);
        this.#owned(physical, binding);
        return parseSiteUpgradeState(physical, binding);
      };
      const state = await read(),
        finalLogical = await this.observeOwnedSite(binding, signal),
        finalState = await read();
      if (
        object11(finalLogical.system_metadata).uid !== siteUid ||
        JSON.stringify(state) !== JSON.stringify(finalState)
      )
        throw new CeApiError('conflict');
      return {
        ...base,
        ...state,
        siteUid,
        status: 'observed',
        collectedAt: new Date().toISOString(),
        stable:
          state.online &&
          [state.software, state.os].every(
            (version) => version.phase === 'UPGRADE_COMPLETED' && ['Completed', 'success'].includes(version.result),
          ),
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      return {
        ...base,
        status: 'unknown',
        stable: false,
        collectedAt: new Date().toISOString(),
        reason: error instanceof CeApiError ? error.category : 'ownership-or-response-invalid',
      };
    }
  }
  async observeUpgrade(binding, contract, targetSoftware, signal) {
    binding = structuredClone(binding);
    this.#binding(binding);
    if (targetSoftware !== undefined)
      contract.build({ siteName: binding.siteName, kind: 'software', version: targetSoftware });
    const source = `/api/config/namespaces/system/sites/${binding.siteName}`;
    const base = {
      owner: structuredClone(binding.owner),
      siteName: binding.siteName,
      nodes: [...binding.nodes],
      contractFingerprint: contract.fingerprint,
      siteContractFingerprint: this.contract.fingerprint,
      source,
      startedAt: new Date().toISOString(),
      targetSoftware,
    };
    try {
      const logical = await this.observeOwnedSite(binding, signal);
      const siteUid = object11(logical.system_metadata).uid;
      if (typeof siteUid !== 'string' || !siteUid.trim()) throw new CeApiError('malformed');
      const physical = await this.#request(source, {}, signal);
      this.#owned(physical, binding);
      const state = parseSiteUpgradeState(physical, binding);
      const selectedSoftware = targetSoftware ?? state.software.installed;
      const paths = contract.observationPaths(
        binding.siteName,
        { software: state.software.installed, os: state.os.installed },
        selectedSoftware,
      );
      const targets = parseSoftwareTargets(await this.#request(paths.targets, {}, signal));
      const prechecks = parseUpgradePrechecks(await this.#request(paths.precheck, {}, signal));
      const progress = parseUpgradeProgress(await this.#request(paths.progress, {}, signal), binding.siteName);
      const finalLogical = await this.observeOwnedSite(binding, signal);
      const finalPhysical = await this.#request(source, {}, signal);
      this.#owned(finalPhysical, binding);
      if (
        object11(finalLogical.system_metadata).uid !== siteUid ||
        JSON.stringify(parseSiteUpgradeState(finalPhysical, binding)) !== JSON.stringify(state)
      )
        throw new CeApiError('conflict');
      return {
        ...base,
        targetSoftware: selectedSoftware,
        status: 'observed',
        observedAt: new Date().toISOString(),
        sources: paths,
        siteUid,
        ...state,
        targets,
        prechecks,
        progress,
        targetSoftwareListed: targets.includes(selectedSoftware),
        nodeHealth: 'unknown',
        routing: 'unknown',
        traffic: 'unknown',
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      return {
        ...base,
        status: 'unknown',
        observedAt: new Date().toISOString(),
        reason: error instanceof CeApiError ? error.category : 'ownership-or-response-invalid',
      };
    }
  }
  async submitUpgrade(binding, contract, target, expectedSiteUid, onMutationBoundary, signal) {
    binding = structuredClone(binding);
    this.#binding(binding, true);
    if (typeof expectedSiteUid !== 'string' || !expectedSiteUid.trim())
      throw new Error('Exact logical site identity is required for upgrade');
    const request = contract.build({ siteName: binding.siteName, ...structuredClone(target) });
    const site = await this.observeOwnedSite(binding, signal);
    if (object11(site.system_metadata).uid !== expectedSiteUid)
      throw new Error('Upgrade site identity changed before mutation');
    await onMutationBoundary();
    await this.#request(request.path, { method: request.method, body: JSON.stringify(request.body) }, signal);
    return {
      status: 'submitted',
      siteName: binding.siteName,
      siteUid: expectedSiteUid,
      target: structuredClone(target),
      contractFingerprint: contract.fingerprint,
      source: request.path,
      submittedAt: new Date().toISOString(),
    };
  }
  teardownInventory(bindings, namespaces, contract, signal) {
    for (const binding of bindings) this.#binding(binding);
    return collectCeTeardownInventory(
      { request: (path, init, signal) => this.#request(path, init, signal) },
      bindings,
      namespaces,
      { site: this.contract.fingerprint, ingress: contract.fingerprint },
      signal,
    );
  }
  drainPlatform(plan, contract, storage, signal) {
    const ingress = this.ingress(contract, storage),
      origins = this.originTeardown(contract);
    return drainCePlatform(
      plan,
      storage,
      {
        engine: this.engine,
        siteContractFingerprint: this.contract.fingerprint,
        ingressContractFingerprint: contract.fingerprint,
        observeOwnedSite: (binding, signal) => this.observeOwnedSite(binding, signal),
        deleteListener: async (listener, signal) => {
          const saved = await storage.read(`ingress-plan-${listener.id}.json`);
          if (
            saved?.request?.metadata?.name !== listener.name ||
            saved.request.metadata.namespace !== listener.namespace
          )
            throw new Error('Drain listener differs from persisted ingress plan');
          await ingress.delete(listener.id, signal);
        },
        deleteOrigin: (snapshot, listeners, signal) => origins.delete(snapshot, listeners, signal),
        deleteRouting: (binding, resource, signal) => this.deleteRouting(binding, resource, signal),
      },
      signal,
    );
  }
  originTeardown(contract) {
    return new CeOriginTeardown(
      { engine: this.engine, request: (path, init, signal) => this.#request(path, init, signal) },
      contract.fingerprint,
    );
  }
  ingress(contract, storage) {
    if (storage.owner.engine !== this.engine) throw new Error('Ingress storage belongs to another engine');
    this.#mutationOwner = structuredClone(storage.owner);
    return new CeIngressLifecycle(
      {
        engine: this.engine,
        siteFingerprint: this.contract.fingerprint,
        observeOwnedSite: (binding, signal) => this.observeOwnedSite(binding, signal),
        observeAwsInterfaces: (binding, expected, signal) => this.observeAwsInterfaces(binding, expected, signal),
        observeAzureInterfaces: (binding, expected, signal) => this.observeAzureInterfaces(binding, expected, signal),
        request: (path, init, signal) => this.#request(path, init, signal),
      },
      contract,
      storage,
    );
  }
  ownedSiteConfiguration(binding, site) {
    this.#binding(binding);
    this.#owned(site, binding);
    const request = this.contract.siteCreateRequest(site);
    return { ...request, metadata: writableSiteMetadata(object11(request.metadata)) };
  }
  async ensureSite(binding, intent, checkpoint, signal) {
    this.#binding(binding, true);
    if (
      intent.provider !== binding.owner.provider ||
      !subset(
        intent.nodes.map((node) => node.hostname),
        binding.nodes,
      )
    )
      throw new Error('Site intent and deployment binding disagree');
    if (binding.initialVersions) {
      const software = initialSoftwareSettings(binding.initialVersions);
      if (intent.settings.software_settings && !subset(intent.settings.software_settings, software))
        throw new Error('Initial versions differ from the owning site binding');
      intent = { ...intent, settings: { ...intent.settings, software_settings: software } };
    }
    const spec = this.contract.buildSite(intent);
    await this.#ensureSpec(binding, spec, checkpoint, signal);
  }
  async replaceSite(binding, intent, expected, checkpoint, signal) {
    this.#binding(binding, true);
    if (
      intent.provider !== binding.owner.provider ||
      !subset(
        intent.nodes.map((node) => node.hostname),
        binding.nodes,
      )
    )
      throw new Error('Site intent and deployment binding disagree');
    const before = await this.observeOwnedSite(binding, signal);
    if (object11(before.system_metadata).uid !== expected.uid || before.resource_version !== expected.resourceVersion)
      throw new Error('Site UID or resource version changed; replan required');
    const desired = this.contract.buildSite(intent);
    const original = object11(object11(object11(before.spec)[binding.owner.provider]).not_managed).node_list;
    const nodes = object11(object11(desired[binding.owner.provider]).not_managed).node_list;
    for (const node of nodes)
      for (const iface of node.interface_list) {
        const ethernet = object11(iface.ethernet_interface);
        const observed = original
          .find((item) => item.hostname === node.hostname)
          ?.interface_list?.find(
            (item) =>
              object11(item.ethernet_interface).mac === ethernet.mac &&
              object11(item.ethernet_interface).device === ethernet.device,
          );
        if (!observed) throw new Error('Physical interface changes require the owning cloud replacement workflow');
        for (const field of ['is_primary', 'is_management'])
          if (typeof observed[field] === 'boolean') iface[field] = observed[field];
      }
    const replacement = this.contract.siteReplaceRequest({ ...before, spec: desired });
    this.contract.validateObservedSiteReplace(before, replacement);
    await checkpoint({ phase: 'replace-prepared', uid: expected.uid, resourceVersion: expected.resourceVersion });
    await this.#request(this.#sitePath(binding), { method: 'PUT', body: JSON.stringify(replacement) }, signal);
    const after = await this.observeOwnedSite(binding, signal);
    if (object11(after.system_metadata).uid !== expected.uid || !subset(after.spec, replacement.spec))
      throw new Error('Replacement configuration has not converged');
    await this.recordBinding?.(binding, expected.uid, []);
    await checkpoint({ phase: 'replace-observed', uid: expected.uid, resourceVersion: after.resource_version });
  }
  async prepareAwsSiteReplacement(binding, instances, expected, signal) {
    this.#binding(binding, true);
    const devices = await this.observeAwsGuestDevices(binding, instances, expected, signal);
    if (devices.status !== 'observed') throw new Error('Replacement guest interface inventory is unavailable');
    const before = await this.observeOwnedSite(binding, signal);
    verifyRegisteredInterfaceConfiguration(object11(before.spec), devices.interfaces);
    const uid = object11(before.system_metadata).uid;
    if (typeof uid !== 'string' || !uid || typeof before.resource_version !== 'string' || !before.resource_version)
      throw new Error('Replacement site identity and resource version are required');
    const request = this.ownedSiteConfiguration(binding, before);
    const interfaces = devices.interfaces.map((device) => {
      const desired = expected.find((item) => item.node === device.node && item.mac.toLowerCase() === device.mac);
      if (!desired || !Number.isInteger(desired.mtu) || desired.mtu < 576 || desired.mtu > 9000)
        throw new Error('Replacement interface MTU is invalid');
      return { ...device, mtu: desired.mtu };
    });
    const nodes = object11(object11(object11(request.spec).aws).not_managed).node_list;
    for (const node of nodes)
      for (const iface of node.interface_list) {
        const expected = interfaces.find(
          (item) => item.node === node.hostname && item.mac === object11(iface.ethernet_interface).mac,
        );
        if (!expected) throw new Error('Replacement interface identity differs');
        iface.mtu = expected.mtu;
      }
    this.contract.validateSiteCreate(request);
    return {
      owner: structuredClone(binding.owner),
      siteName: binding.siteName,
      uid,
      resourceVersion: before.resource_version,
      contractFingerprint: this.contract.fingerprint,
      instances: { ...instances },
      interfaces,
      request,
      source: this.#sitePath(binding),
      deviceSource: devices.source,
      evidenceKind: 'owned-site-replacement',
      observedAt: new Date().toISOString(),
    };
  }
  async ensureAwsPreparedSite(binding, preparation, checkpoint, signal) {
    this.#binding(binding, true);
    const request = object11(preparation.request);
    if (
      binding.owner.provider !== 'aws' ||
      !subset(preparation.owner, binding.owner) ||
      preparation.contractFingerprint !== this.contract.fingerprint ||
      preparation.siteName !== binding.siteName ||
      !['preboot-interface-configuration-required', 'owned-site-replacement'].includes(
        String(preparation.evidenceKind),
      ) ||
      typeof preparation.uid !== 'string' ||
      !preparation.uid
    )
      throw new Error('Prepared site ownership, contract or identity differs');
    this.#owned(request, binding);
    this.contract.validateSiteCreate(request);
    if (
      binding.initialVersions &&
      !subset(object11(request.spec).software_settings, initialSoftwareSettings(binding.initialVersions))
    )
      throw new Error('Prepared site initial versions differ from the owning binding');
    const interfaces = preparation.interfaces;
    if (
      !Array.isArray(interfaces) ||
      interfaces.some((item) => !binding.nodes.includes(item.node)) ||
      new Set(interfaces.map((item) => item.node)).size !== binding.nodes.length
    )
      throw new Error('Prepared site nodes differ from deployment');
    verifyRegisteredInterfaceConfiguration(object11(request.spec), interfaces);
    const nodes = object11(object11(object11(request.spec).aws).not_managed).node_list;
    for (const node of nodes)
      for (const iface of node.interface_list) {
        const expected = interfaces.find(
          (item) => item.node === node.hostname && item.mac === object11(iface.ethernet_interface).mac,
        );
        if (
          !expected ||
          !Number.isInteger(expected.mtu) ||
          expected.mtu < 576 ||
          expected.mtu > 9000 ||
          iface.mtu !== expected.mtu
        )
          throw new Error('Prepared MTU differs from the replacement requirement');
      }
    let existing;
    try {
      existing = await this.observeSite(binding, signal);
    } catch (error) {
      if (!(error instanceof CeApiError && error.category === 'not-found')) throw error;
    }
    if (existing && object11(existing.system_metadata).uid === preparation.uid)
      throw new Error('Original site still exists; coupled replacement has not removed it');
    await this.#ensureSpec(
      binding,
      object11(request.spec),
      checkpoint,
      signal,
      writableSiteMetadata(object11(request.metadata)),
    );
  }
  async reserveSite(binding, checkpoint, signal, advertisedRoutes = []) {
    this.#binding(binding, true);
    if (![1, 3].includes(binding.nodes.length)) throw new Error('A site reservation needs one or three intended nodes');
    if (
      !Array.isArray(advertisedRoutes) ||
      advertisedRoutes.some((route) => !/^\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2}$/.test(route))
    )
      throw new Error('Site reservation has invalid advertised route');
    const spec = {
      ...(binding.initialVersions ? { software_settings: initialSoftwareSettings(binding.initialVersions) } : {}),
      [binding.owner.provider]: { not_managed: {} },
      [binding.nodes.length === 3 ? 'enable_ha' : 'disable_ha']: {},
      disable_management_network: {},
      block_all_services: {},
      no_network_policy: {},
      no_forward_proxy: {},
      logs_streaming_disabled: {},
      ...(advertisedRoutes.length
        ? {
            local_vrf: {
              slo_config: {
                static_routes: {
                  static_routes: advertisedRoutes.map((ip_prefixes) => ({
                    ip_prefixes: [ip_prefixes],
                    default_gateway: {},
                    attrs: ['ROUTE_ATTR_ADVERTISE', 'ROUTE_ATTR_INSTALL_FORWARDING'],
                  })),
                },
              },
            },
          }
        : {}),
    };
    this.contract.validateSite(spec);
    await this.#ensureSpec(binding, spec, checkpoint, signal);
  }
  requireBootstrapContract(provider) {
    this.contract.bootstrapQuery(provider);
  }
  requireRoutingContract(provider) {
    this.contract.requireRoutingContract(provider);
  }
  async #ensureSpec(binding, spec, checkpoint, signal, metadata) {
    let existing;
    try {
      existing = await this.observeSite(binding, signal);
    } catch (error) {
      if (!(error instanceof CeApiError && error.category === 'not-found')) throw error;
    }
    if (!existing) {
      try {
        await this.#request(
          '/api/config/namespaces/system/securemesh_site_v2s',
          {
            method: 'POST',
            body: JSON.stringify({
              metadata: metadata ?? { name: binding.siteName, namespace: 'system', labels: this.#labels(binding) },
              spec,
            }),
          },
          signal,
        );
      } catch (error) {
        if (!(error instanceof CeApiError && ['transient', 'conflict'].includes(error.category))) throw error;
      }
      existing = await this.observeSite(binding, signal);
    }
    this.#owned(existing, binding);
    if (metadata && !subset(existing.metadata, metadata))
      throw new Error('Existing site metadata differs; replan required');
    if (!subset(existing.spec, spec)) throw new Error('Existing site configuration differs; replan required');
    const uid = object11(existing.system_metadata).uid;
    if (typeof uid !== 'string' || !uid) throw new CeApiError('malformed');
    await this.recordBinding?.(binding, uid);
    await checkpoint({
      siteName: binding.siteName,
      uid,
      owner: binding.owner,
      contractFingerprint: this.contract.fingerprint,
    });
  }
  requireAwsRoutingContract() {
    if (!this.contract.awsRoutingAvailable)
      throw new Error('Pinned AWS routing schemas are required before deployment');
  }
  async reconcileTerraformResources(owner, signal) {
    if (this.engine !== 'terraform' || owner.engine !== 'terraform' || !this.resourceMutation)
      throw new Error('Terraform F5 state service is unavailable');
    await this.resourceMutation(owner, '/api/config/terraform-f5-reconcile', { method: 'RECONCILE' }, signal);
  }
  requireAwsHaContract() {
    this.contract.requireAwsHaNodeConfiguration();
  }
  async observeAwsGuestDevices(binding, expectedInstances, expected, signal) {
    if (binding.owner.provider !== 'aws') throw new Error('AWS registration inventory requires AWS ownership');
    return this.observeRegisteredDevices(binding, expectedInstances, expected, signal);
  }
  async observeRegisteredDevices(binding, expectedInstances, expected, signal) {
    this.#binding(binding);
    const source = `/api/register/namespaces/system/registrations_by_site/${binding.siteName}`;
    const base = {
      owner: binding.owner,
      siteName: binding.siteName,
      source,
      observedAt: new Date().toISOString(),
      evidenceKind: 'registration-hardware-inventory',
    };
    try {
      if (
        Object.keys(expectedInstances).length !== binding.nodes.length ||
        binding.nodes.some((node) => !Object.hasOwn(expectedInstances, node))
      )
        throw new Error('Registration inventory scope differs');
      this.#owned(await this.observeSite(binding, signal), binding);
      const response = await this.#request(source, {}, signal);
      const interfaces = correlateRegistrationDevices(
        response,
        binding.siteName,
        expectedInstances,
        expected,
        binding.owner.provider,
      );
      return { ...base, status: 'observed', interfaces };
    } catch (error) {
      if (signal?.aborted) throw error;
      return { ...base, status: 'unknown', interfaces: [] };
    }
  }
  async observeAwsRegisteredConfiguration(binding, expectedInstances, expected, signal) {
    if (binding.owner.provider !== 'aws') throw new Error('AWS configuration observation requires AWS ownership');
    return this.observeRegisteredConfiguration(binding, expectedInstances, expected, signal);
  }
  async observeRegisteredConfiguration(binding, expectedInstances, expected, signal) {
    const evidence = await this.observeRegisteredDevices(binding, expectedInstances, expected, signal);
    if (evidence.status !== 'observed') return { ...evidence, status: 'unknown' };
    try {
      const configuration = await this.#request(
        this.contract.configurationPath(binding.owner.provider, binding.siteName),
        {},
        signal,
      );
      this.#owned(configuration, binding);
      verifyRegisteredInterfaceConfiguration(object11(configuration.spec), evidence.interfaces, binding.owner.provider);
      const uid = object11(configuration.system_metadata).uid;
      if (typeof uid !== 'string' || !uid) throw new CeApiError('malformed');
      await this.recordBinding?.(binding, uid, evidence.interfaces);
      return {
        ...evidence,
        configurationSource: this.#sitePath(binding),
        siteUid: uid,
        observedAt: new Date().toISOString(),
        status: 'configured',
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      return { ...evidence, status: 'unknown' };
    }
  }
  async ensureAwsInterfaceMtu(binding, instances, expected, checkpoint, signal) {
    this.#binding(binding, true);
    if (expected.some((item) => !Number.isInteger(item.mtu) || item.mtu < 576 || item.mtu > 9000))
      throw new Error('Explicit supported interface MTU is required');
    const devices = await this.observeAwsGuestDevices(binding, instances, expected, signal);
    if (devices.status !== 'observed') throw new Error('Guest interface inventory has not converged');
    const before = await this.observeSite(binding, signal);
    this.#owned(before, binding);
    verifyRegisteredInterfaceConfiguration(object11(before.spec), devices.interfaces);
    const uid = object11(before.system_metadata).uid;
    if (typeof uid !== 'string' || !uid) throw new CeApiError('malformed');
    const nodes = object11(object11(object11(before.spec).aws).not_managed).node_list;
    const matches = (node, iface) => {
      const ethernet = object11(iface.ethernet_interface);
      return expected.find((item) => item.node === node.hostname && item.mac.toLowerCase() === ethernet.mac);
    };
    const changed = nodes.some((node) => node.interface_list.some((iface) => iface.mtu !== matches(node, iface)?.mtu));
    if (changed) {
      if (typeof before.resource_version !== 'string' || !before.resource_version)
        throw new Error('Site resource version is required for an interface update');
      const request = this.ownedSiteConfiguration(binding, before);
      const desiredNodes = object11(object11(object11(request.spec).aws).not_managed).node_list;
      for (const node of desiredNodes)
        for (const iface of node.interface_list) {
          const desired = matches(node, iface);
          if (!desired) throw new Error('Preboot interface identity differs from observed inventory');
          iface.mtu = desired.mtu;
        }
      this.contract.validateSiteCreate(request);
      await checkpoint({
        owner: binding.owner,
        siteName: binding.siteName,
        uid,
        contractFingerprint: this.contract.fingerprint,
        resourceVersion: before.resource_version,
        instances: { ...instances },
        interfaces: devices.interfaces.map((device) => ({
          ...device,
          mtu: expected.find((item) => item.node === device.node && item.mac.toLowerCase() === device.mac)?.mtu,
        })),
        source: this.#sitePath(binding),
        deviceSource: `/api/register/namespaces/system/registrations_by_site/${binding.siteName}`,
        request,
        evidenceKind: 'preboot-interface-configuration-required',
        observedAt: new Date().toISOString(),
        packetMtu: 'unknown',
      });
      throw new Error('AWS interface MTU requires coupled VM/site replacement with configuration before registration');
    }
    await checkpoint({
      owner: binding.owner,
      siteName: binding.siteName,
      uid,
      contractFingerprint: this.contract.fingerprint,
      interfaces: expected,
      source: this.#sitePath(binding),
      evidenceKind: 'configured-mtu',
      observedAt: new Date().toISOString(),
      packetMtu: 'unknown',
    });
  }
  async observeAwsInterfaces(binding, expected, signal) {
    if (binding.owner.provider !== 'aws') throw new Error('AWS interface observation requires AWS ownership');
    return this.observeInterfaces(binding, expected, signal);
  }
  async observeAzureInterfaces(binding, expected, signal) {
    if (binding.owner.provider !== 'azure') throw new Error('Azure interface observation requires Azure ownership');
    return this.observeInterfaces(binding, expected, signal);
  }
  async observeBgpServiceMembership(binding, siteUid, expected, tables, prefixes, signal) {
    this.#binding(binding);
    const nodes = [...new Set(expected.map((s) => s.node))];
    if (!siteUid.trim() || nodes.length !== binding.nodes.length || nodes.some((node) => !binding.nodes.includes(node)))
      throw Error('BGP service logical site UID or expected nodes differ');
    const checkSite = async () => {
      const site = await this.observeOwnedSite(binding, signal);
      if (object11(site.system_metadata).uid !== siteUid) throw Error('BGP service site identity changed');
    };
    await checkSite();
    const sources = {
      peers: this.contract.bgpPeersPath(binding.owner.provider, binding.siteName),
      routes: this.contract.bgpRoutesPath(binding.owner.provider, binding.siteName),
    };
    const peerResponse = await this.#request(sources.peers, {}, signal);
    const routeResponse = await this.#request(sources.routes, {}, signal);
    const observation = parseBgpServiceMembership(peerResponse, routeResponse, expected, tables, prefixes);
    await checkSite();
    return {
      ...observation,
      owner: structuredClone(binding.owner),
      siteName: binding.siteName,
      siteUid,
      sources,
      contractFingerprint: this.contract.fingerprint,
      collectedAt: new Date().toISOString(),
    };
  }
  async observeBgpSessions(binding, expected, signal) {
    this.#binding(binding);
    this.#owned(await this.observeSite(binding, signal), binding);
    const source = this.contract.bgpPeersPath(binding.owner.provider, binding.siteName);
    const evidence = parseBgpSessions(await this.#request(source, {}, signal), expected);
    return {
      ...evidence,
      owner: structuredClone(binding.owner),
      siteName: binding.siteName,
      source,
      observedAt: new Date().toISOString(),
      contractFingerprint: this.contract.fingerprint,
    };
  }
  async observeBgpRoutes(binding, signal) {
    return this.observeBgpRoutesForNodes(binding, binding.nodes, signal);
  }
  async observeBgpRoutesForNodes(binding, expectedNodes, signal) {
    this.#binding(binding);
    if (
      !Array.isArray(expectedNodes) ||
      expectedNodes.length < 1 ||
      expectedNodes.length > binding.nodes.length ||
      new Set(expectedNodes).size !== expectedNodes.length ||
      expectedNodes.some((node) => !binding.nodes.includes(node))
    )
      throw new Error('BGP route observation nodes differ from the owned site');
    this.#owned(await this.observeSite(binding, signal), binding);
    const source = this.contract.bgpRoutesPath(binding.owner.provider, binding.siteName);
    const evidence = parseBgpRoutes(await this.#request(source, {}, signal), expectedNodes);
    return {
      ...evidence,
      owner: structuredClone(binding.owner),
      siteName: binding.siteName,
      source,
      observedAt: new Date().toISOString(),
      contractFingerprint: this.contract.fingerprint,
    };
  }
  async observeInterfaces(binding, expected, signal) {
    this.#binding(binding);
    const observedAt = new Date().toISOString();
    try {
      if (expected.some((item) => !binding.nodes.includes(item.node)))
        throw new Error('Interface binding differs from site');
      const configuration = await this.#request(
        this.contract.configurationPath(binding.owner.provider, binding.siteName),
        {},
        signal,
      );
      this.#owned(configuration, binding);
      const objects = await this.#request(
        '/api/config/namespaces/system/network_interfaces?report_fields=get_spec&report_fields=system_metadata',
        {},
        signal,
      );
      const physical = await this.#request(`/api/config/namespaces/system/sites/${binding.siteName}`, {}, signal);
      const interfaces = correlateCeInterfaces(configuration, objects, physical, expected, binding.owner.provider);
      const finalConfiguration = await this.#request(
        this.contract.configurationPath(binding.owner.provider, binding.siteName),
        {},
        signal,
      );
      this.#owned(finalConfiguration, binding);
      if (
        object11(finalConfiguration.system_metadata).uid !== object11(configuration.system_metadata).uid ||
        JSON.stringify(finalConfiguration.spec) !== JSON.stringify(configuration.spec)
      )
        throw new CeApiError('conflict');
      await this.recordBinding?.(binding, String(object11(configuration.system_metadata).uid), expected);
      return {
        status: interfaces.every((row) => row.linkUp) ? 'observed' : 'down',
        interfaces,
        observedAt,
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      return { status: 'unknown', interfaces: [], observedAt };
    }
  }
  async ensureAwsRouting(binding, localAsn, remoteAsn, interfaces, deniedExportPrefixes, checkpoint, signal, rebind) {
    this.#binding(binding, true);
    if (binding.owner.provider !== 'aws' || interfaces.some((item) => !binding.nodes.includes(item.node)))
      throw new Error('AWS routing interface and site ownership differ');
    this.#owned(await this.observeSite(binding, signal), binding);
    const routing = this.contract.buildAwsRouting(
      binding.siteName,
      localAsn,
      remoteAsn,
      interfaces,
      deniedExportPrefixes,
    );
    if (rebind) {
      const expected = [
        ...routing.connectors.map((r) => `external_connector/${r.name}`),
        `bgp_routing_policy/${routing.exportPolicy.name}`,
        `bgp/${routing.bgp.name}`,
      ];
      const recorded = rebind.resources.map((r) => `${r.kind}/${r.name}`);
      if (
        !rebind.siteUid.trim() ||
        recorded.length !== expected.length ||
        new Set(recorded).size !== recorded.length ||
        expected.some((key) => !recorded.includes(key)) ||
        rebind.resources.some((r) => !r.uid.trim())
      )
        throw new Error('Exact replacement routing inventory required');
    }
    for (const [kind, resources] of [
      ['external_connector', routing.connectors],
      ['bgp_routing_policy', [routing.exportPolicy]],
      ['bgp', [routing.bgp]],
    ])
      for (const resource of resources) {
        const path = `/api/config/namespaces/system/${kind}s/${resource.name}`;
        const observe = () => this.#request(path, {}, signal);
        let existing;
        try {
          existing = await observe();
        } catch (error) {
          if (!(error instanceof CeApiError && error.category === 'not-found')) throw error;
        }
        if (!existing && rebind) throw new Error('Recorded replacement routing object is missing');
        if (!existing) {
          const site = await this.observeOwnedSite(binding, signal);
          const siteUid = object11(site.system_metadata).uid;
          if (typeof siteUid !== 'string' || !siteUid.trim())
            throw new Error('Routing creation requires a logical site UID');
          this.contract.validateRouting(kind, resource.spec);
          try {
            await this.#request(
              `/api/config/namespaces/system/${kind}s`,
              {
                method: 'POST',
                body: JSON.stringify({
                  metadata: {
                    name: resource.name,
                    namespace: 'system',
                    labels: { ...this.#labels(binding), 'xcsh-ce-site': binding.siteName, 'xcsh-ce-site-uid': siteUid },
                  },
                  spec: resource.spec,
                }),
              },
              signal,
            );
          } catch (error) {
            if (!(error instanceof CeApiError && ['transient', 'conflict'].includes(error.category))) throw error;
          }
          existing = await observe();
        }
        this.#owned(existing, { ...binding, siteName: resource.name });
        if (
          object11(object11(existing.metadata).labels)['xcsh-ce-site'] !== binding.siteName ||
          !subset(existing.spec, resource.spec) ||
          (kind === 'bgp' &&
            Array.isArray(object11(existing.spec).peers) &&
            object11(existing.spec).peers.some((peer) => Object.hasOwn(object11(peer), 'routing_policies')))
        )
          throw new Error('Existing routing object differs from site-bound intent; replan required');
        const uid = object11(existing.system_metadata).uid;
        if (typeof uid !== 'string' || !uid) throw new CeApiError('malformed');
        if (rebind) {
          const recorded = rebind.resources.find((r) => r.kind === kind && r.name === resource.name);
          if (uid !== recorded?.uid) throw new Error('Replacement routing object UID changed');
          const site = await this.observeSite(binding, signal);
          this.#owned(site, binding);
          if (object11(site.system_metadata).uid !== rebind.siteUid) throw new Error('Replacement site UID changed');
          if (object11(object11(existing.metadata).labels)['xcsh-ce-site-uid'] !== rebind.siteUid) {
            const body = rebind.contract.build(kind, existing, resource.spec, rebind.siteUid);
            await checkpoint({
              kind,
              name: resource.name,
              uid,
              siteName: binding.siteName,
              owner: binding.owner,
              siteUid: rebind.siteUid,
              phase: 'rebind-pending',
              contractFingerprint: rebind.contract.fingerprint,
            });
            const freshSite = await this.observeSite(binding, signal);
            this.#owned(freshSite, binding);
            if (object11(freshSite.system_metadata).uid !== rebind.siteUid)
              throw new Error('Replacement site UID changed');
            const fresh = await observe();
            this.#owned(fresh, { ...binding, siteName: resource.name });
            if (
              object11(fresh.system_metadata).uid !== uid ||
              fresh.resource_version !== existing.resource_version ||
              !subset(fresh.metadata, existing.metadata) ||
              !subset(existing.metadata, fresh.metadata) ||
              !subset(fresh.spec, existing.spec) ||
              !subset(existing.spec, fresh.spec)
            )
              throw new Error('Routing changed before replacement rebind');
            try {
              await this.#request(path, { method: 'PUT', body: JSON.stringify(body) }, signal);
            } catch (error) {
              if (!(error instanceof CeApiError && ['transient', 'conflict'].includes(error.category))) throw error;
            }
            existing = await observe();
            this.#owned(existing, { ...binding, siteName: resource.name });
            if (
              object11(existing.system_metadata).uid !== uid ||
              object11(object11(existing.metadata).labels)['xcsh-ce-site-uid'] !== rebind.siteUid ||
              !subset(existing.spec, resource.spec)
            )
              throw new Error('Routing replacement readback differs');
          }
        }
        await checkpoint({
          kind,
          name: resource.name,
          siteName: binding.siteName,
          uid,
          owner: binding.owner,
          contractFingerprint: this.contract.fingerprint,
        });
      }
  }
  async ensureAzureRouting(binding, localAsn, remoteAsn, interfaces, routeServerAddresses, checkpoint, signal) {
    this.#binding(binding, true);
    this.requireRoutingContract('azure');
    if (
      binding.owner.provider !== 'azure' ||
      interfaces.length !== binding.nodes.length ||
      interfaces.some((item) => !binding.nodes.includes(item.node))
    )
      throw new Error('Azure routing interface and site ownership differ');
    let site = await this.observeOwnedSite(binding, signal);
    let siteUid = object11(site.system_metadata).uid;
    if (typeof siteUid !== 'string' || !siteUid.trim()) throw new Error('Azure routing requires a logical site UID');
    const routing = this.contract.buildAzureRouting(
      binding.siteName,
      localAsn,
      remoteAsn,
      interfaces,
      routeServerAddresses,
    );
    const resource = routing.bgp;
    const path = `/api/config/namespaces/system/bgps/${resource.name}`;
    const observe = () => this.#request(path, {}, signal);
    let existing;
    try {
      existing = await observe();
    } catch (error) {
      if (!(error instanceof CeApiError && error.category === 'not-found')) throw error;
    }
    if (!existing) {
      site = await this.observeOwnedSite(binding, signal);
      siteUid = object11(site.system_metadata).uid;
      if (typeof siteUid !== 'string' || !siteUid.trim()) throw new Error('Azure routing requires a logical site UID');
      this.contract.validateRouting('bgp', resource.spec);
      try {
        await this.#request(
          '/api/config/namespaces/system/bgps',
          {
            method: 'POST',
            body: JSON.stringify({
              metadata: {
                name: resource.name,
                namespace: 'system',
                labels: { ...this.#labels(binding), 'xcsh-ce-site': binding.siteName, 'xcsh-ce-site-uid': siteUid },
              },
              spec: resource.spec,
            }),
          },
          signal,
        );
      } catch (error) {
        if (!(error instanceof CeApiError && ['transient', 'conflict'].includes(error.category))) throw error;
      }
      existing = await observe();
    }
    this.#owned(existing, { ...binding, siteName: resource.name });
    if (
      object11(object11(existing.metadata).labels)['xcsh-ce-site'] !== binding.siteName ||
      object11(object11(existing.metadata).labels)['xcsh-ce-site-uid'] !== siteUid ||
      !subset(existing.spec, resource.spec)
    )
      throw new Error('Existing Azure routing object differs from site-bound intent; replan required');
    const uid = object11(existing.system_metadata).uid;
    if (typeof uid !== 'string' || !uid.trim()) throw new CeApiError('malformed');
    await checkpoint({
      kind: 'bgp',
      name: resource.name,
      uid,
      siteName: binding.siteName,
      siteUid,
      owner: binding.owner,
      localAsn,
      remoteAsn,
      interfaces: interfaces.map(({ node, interfaceName }) => ({ node, interfaceName })),
      expectedSessions: routing.expectedSessions,
      routeServerAddresses: [...routeServerAddresses],
      contractFingerprint: this.contract.fingerprint,
    });
  }
  async createPowerRoutingPolicy(input, disposition, checkpoint, signal) {
    return this.#createPowerRoutingPolicy(input, disposition, checkpoint, signal, 'native');
  }
  async createTerraformPowerRoutingPolicy(input, disposition, checkpoint, signal) {
    return this.#createPowerRoutingPolicy(input, disposition, checkpoint, signal, 'terraform');
  }
  async #createPowerRoutingPolicy(input, disposition, checkpoint, signal, expectedEngine) {
    const intent = structuredClone(input);
    const { binding, siteUid, name, spec, attemptId } = intent;
    this.#binding(binding, true);
    if (
      this.engine !== expectedEngine ||
      (expectedEngine === 'terraform' && !this.resourceMutation) ||
      binding.owner.provider !== 'aws' ||
      !safeName.test(name) ||
      !siteUid.trim() ||
      !/^[a-f0-9]{64}$/.test(attemptId) ||
      intent.contractFingerprint !== this.contract.fingerprint ||
      !['not-submitted', 'submitted'].includes(disposition)
    )
      throw Error('Power policy creation identity or contract differs');
    this.contract.validateRouting('bgp_routing_policy', spec);
    const request = this.contract.routingCreateRequest(
      'bgp_routing_policy',
      {
        name,
        namespace: 'system',
        labels: {
          ...this.#labels(binding),
          'xcsh-ce-site': binding.siteName,
          'xcsh-ce-site-uid': siteUid,
          'xcsh-ce-power-attempt': attemptId,
        },
      },
      spec,
    );
    const checkSite = async () => {
      const site = await this.observeOwnedSite(binding, signal);
      if (object11(site.system_metadata).uid !== siteUid) throw Error('Power policy site identity changed');
    };
    await checkSite();
    const path = `/api/config/namespaces/system/bgp_routing_policys/${name}`;
    const read = async () => {
      let child;
      try {
        child = await this.#request(path, {}, signal);
      } catch (error) {
        if (error instanceof CeApiError && error.category === 'not-found') return;
        throw error;
      }
      this.#owned(child, { ...binding, siteName: name });
      const labels = object11(object11(child.metadata).labels),
        uid = object11(child.system_metadata).uid;
      if (
        labels['xcsh-ce-site'] !== binding.siteName ||
        labels['xcsh-ce-site-uid'] !== siteUid ||
        labels['xcsh-ce-power-attempt'] !== attemptId ||
        typeof uid !== 'string' ||
        !uid.trim()
      )
        throw Error('Power policy child identity or original attempt differs');
      if (typeof child.resource_version !== 'string' || !child.resource_version.trim())
        throw Error('Power policy revision missing');
      const projected = this.contract.routingReplaceRequest('bgp_routing_policy', child, object11(child.spec), siteUid);
      if (!subset(projected.spec, spec) || !subset(spec, projected.spec))
        throw Error('Power policy actual spec differs');
      return {
        ...intent,
        kind: 'bgp_routing_policy',
        uid,
        resourceVersion: child.resource_version,
        spec: object11(projected.spec),
        collectedAt: new Date().toISOString(),
      };
    };
    let observed = await read();
    if (!observed && disposition === 'not-submitted') {
      await checkpoint({ ...intent, kind: 'bgp_routing_policy', phase: 'power-policy-create-dispatch' });
      await checkSite();
      observed = await read();
      if (!observed) {
        signal?.throwIfAborted();
        try {
          await this.#request(
            '/api/config/namespaces/system/bgp_routing_policys',
            {
              method: 'POST',
              body: JSON.stringify(request),
            },
            signal,
          );
        } catch (error) {
          if (!(error instanceof CeApiError && ['transient', 'conflict', 'deadline'].includes(error.category)))
            throw error;
        }
        observed = await read();
      }
    }
    await checkSite();
    return observed
      ? { ...observed, status: 'observed' }
      : { ...intent, status: 'pending', collectedAt: new Date().toISOString() };
  }
  async deletePowerRoutingPolicy(input, disposition, checkpoint, signal) {
    return this.#deletePowerRoutingPolicy(input, disposition, checkpoint, signal, 'native');
  }
  async deleteTerraformPowerRoutingPolicy(input, disposition, checkpoint, signal) {
    return this.#deletePowerRoutingPolicy(input, disposition, checkpoint, signal, 'terraform');
  }
  async #deletePowerRoutingPolicy(input, disposition, checkpoint, signal, expectedEngine) {
    const snapshot = structuredClone(input),
      { binding, siteUid, name, uid, resourceVersion, spec, attemptId } = snapshot;
    this.#binding(binding, true);
    if (
      this.engine !== expectedEngine ||
      (expectedEngine === 'terraform' && !this.resourceMutation) ||
      binding.owner.provider !== 'aws' ||
      !safeName.test(name) ||
      !siteUid.trim() ||
      !uid.trim() ||
      !resourceVersion.trim() ||
      !/^[a-f0-9]{64}$/.test(attemptId) ||
      snapshot.contractFingerprint !== this.contract.fingerprint ||
      !['not-submitted', 'submitted'].includes(disposition)
    )
      throw Error('Power policy retirement identity or contract differs');
    this.contract.validateRouting('bgp_routing_policy', spec);
    const checkSite = async () => {
      const site = await this.observeOwnedSite(binding, signal);
      if (object11(site.system_metadata).uid !== siteUid) throw Error('Power policy retirement site identity changed');
    };
    const path = `/api/config/namespaces/system/bgp_routing_policys/${name}`;
    const read = async () => {
      let child;
      try {
        child = await this.#request(path, {}, signal);
      } catch (error) {
        if (error instanceof CeApiError && error.category === 'not-found') return;
        throw error;
      }
      this.#owned(child, { ...binding, siteName: name });
      const labels = object11(object11(child.metadata).labels);
      if (
        object11(child.system_metadata).uid !== uid ||
        labels['xcsh-ce-site'] !== binding.siteName ||
        labels['xcsh-ce-site-uid'] !== siteUid ||
        labels['xcsh-ce-power-attempt'] !== attemptId ||
        child.resource_version !== resourceVersion
      )
        throw Error('Power policy retirement child identity, attempt or revision differs');
      this.contract.validateRouting('bgp_routing_policy', object11(child.spec));
      if (!subset(child.spec, spec) || !subset(spec, child.spec))
        throw Error('Power policy retirement actual spec differs');
      return child;
    };
    await checkSite();
    let existing = await read();
    if (existing && disposition === 'not-submitted') {
      await checkpoint({ ...snapshot, kind: 'bgp_routing_policy', phase: 'power-policy-delete-dispatch' });
      await checkSite();
      existing = await read();
      if (existing) {
        signal?.throwIfAborted();
        try {
          await this.#request(path, { method: 'DELETE' }, signal);
        } catch (error) {
          if (
            !(
              error instanceof CeApiError && ['transient', 'conflict', 'deadline', 'not-found'].includes(error.category)
            )
          )
            throw error;
        }
        existing = await read();
      }
    }
    await checkSite();
    return {
      ...snapshot,
      status: existing ? 'pending' : 'deleted',
      collectedAt: new Date().toISOString(),
    };
  }
  async observePowerRouting(binding, kind, name, signal) {
    this.#binding(binding);
    if (
      binding.owner.provider !== 'aws' ||
      !['bgp', 'bgp_routing_policy', 'external_connector'].includes(kind) ||
      !safeName.test(name)
    )
      throw Error('Power routing observation scope differs');
    const site = await this.observeOwnedSite(binding, signal);
    const siteUid = object11(site.system_metadata).uid;
    if (typeof siteUid !== 'string' || !siteUid.trim()) throw Error('Power routing site identity missing');
    const child = await this.#request(`/api/config/namespaces/system/${kind}s/${name}`, {}, signal);
    this.#owned(child, { ...binding, siteName: name });
    const uid = object11(child.system_metadata).uid;
    if (
      typeof uid !== 'string' ||
      !uid.trim() ||
      object11(object11(child.metadata).labels)['xcsh-ce-site'] !== binding.siteName ||
      object11(object11(child.metadata).labels)['xcsh-ce-site-uid'] !== siteUid
    )
      throw Error('Power routing child identity differs');
    if (typeof child.resource_version !== 'string' || !child.resource_version.trim())
      throw Error('Power routing revision missing');
    const request = this.contract.routingReplaceRequest(kind, child, object11(child.spec), siteUid);
    const finalSite = await this.observeOwnedSite(binding, signal);
    if (object11(finalSite.system_metadata).uid !== siteUid)
      throw Error('Power routing site identity changed during observation');
    return {
      binding: structuredClone(binding),
      kind,
      name,
      uid,
      siteUid,
      resourceVersion: child.resource_version,
      spec: object11(request.spec),
      contractFingerprint: this.contract.fingerprint,
      collectedAt: new Date().toISOString(),
    };
  }
  async replacePowerRouting(snapshot, desired, checkpoint, signal) {
    const { binding } = snapshot;
    this.#binding(binding, true);
    if (
      binding.owner.provider !== 'aws' ||
      snapshot.contractFingerprint !== this.contract.fingerprint ||
      !['bgp', 'bgp_routing_policy'].includes(snapshot.kind) ||
      !safeName.test(snapshot.name) ||
      !snapshot.uid.trim() ||
      !snapshot.siteUid.trim() ||
      !snapshot.resourceVersion.trim()
    )
      throw Error('Power routing identity or contract differs');
    const site = await this.observeOwnedSite(binding, signal);
    if (object11(site.system_metadata).uid !== snapshot.siteUid) throw Error('Power routing site identity differs');
    const path = `/api/config/namespaces/system/${snapshot.kind}s/${snapshot.name}`;
    const check = (value) => {
      this.#owned(value, { ...binding, siteName: snapshot.name });
      if (
        object11(value.system_metadata).uid !== snapshot.uid ||
        object11(object11(value.metadata).labels)['xcsh-ce-site'] !== binding.siteName ||
        object11(object11(value.metadata).labels)['xcsh-ce-site-uid'] !== snapshot.siteUid
      )
        throw Error('Power routing object identity differs');
    };
    let existing = await this.#request(path, {}, signal);
    check(existing);
    const request = this.contract.routingReplaceRequest(snapshot.kind, existing, desired, snapshot.siteUid);
    const projection = this.contract.routingReplaceRequest(
      snapshot.kind,
      existing,
      object11(existing.spec),
      snapshot.siteUid,
    );
    if (subset(projection.spec, request.spec) && subset(request.spec, projection.spec)) return;
    if (
      existing.resource_version !== snapshot.resourceVersion ||
      !subset(projection.spec, snapshot.spec) ||
      !subset(snapshot.spec, projection.spec)
    )
      throw Error('Power routing original revision differs; reconcile retained attempt');
    await checkpoint({
      kind: snapshot.kind,
      name: snapshot.name,
      uid: snapshot.uid,
      siteUid: snapshot.siteUid,
      resourceVersion: snapshot.resourceVersion,
      contractFingerprint: snapshot.contractFingerprint,
      phase: 'power-routing-dispatch',
    });
    const freshSite = await this.observeOwnedSite(binding, signal);
    if (object11(freshSite.system_metadata).uid !== snapshot.siteUid)
      throw Error('Power routing site identity changed');
    const fresh = await this.#request(path, {}, signal);
    check(fresh);
    const freshProjection = this.contract.routingReplaceRequest(
      snapshot.kind,
      fresh,
      object11(fresh.spec),
      snapshot.siteUid,
    );
    if (
      fresh.resource_version !== snapshot.resourceVersion ||
      !subset(freshProjection.spec, snapshot.spec) ||
      !subset(snapshot.spec, freshProjection.spec)
    )
      throw Error('Power routing original revision changed');
    try {
      await this.#request(path, { method: 'PUT', body: JSON.stringify(request) }, signal);
    } catch (error) {
      if (!(error instanceof CeApiError && ['transient', 'conflict'].includes(error.category))) throw error;
    }
    existing = await this.#request(path, {}, signal);
    check(existing);
    const observed = this.contract.routingReplaceRequest(
      snapshot.kind,
      existing,
      object11(existing.spec),
      snapshot.siteUid,
    );
    if (!subset(observed.spec, request.spec) || !subset(request.spec, observed.spec))
      throw Error('Power routing replacement pending; reconcile retained attempt');
  }
  async deleteRouting(binding, resource, signal) {
    this.#binding(binding, true);
    if (
      !['bgp', 'bgp_routing_policy', 'external_connector'].includes(resource.kind) ||
      !safeName.test(resource.name) ||
      typeof resource.uid !== 'string' ||
      !resource.uid.trim()
    )
      throw new Error('Exact routing kind, name and checkpoint UID required');
    const path = `/api/config/namespaces/system/${resource.kind}s/${resource.name}`;
    let existing;
    try {
      existing = await this.#request(path, {}, signal);
    } catch (error) {
      if (error instanceof CeApiError && error.category === 'not-found') return;
      throw error;
    }
    this.#owned(existing, { ...binding, siteName: resource.name });
    if (
      object11(existing.system_metadata).uid !== resource.uid ||
      object11(object11(existing.metadata).labels)['xcsh-ce-site'] !== binding.siteName
    )
      throw new Error('Routing checkpoint UID or site ownership differs');
    await this.observeOwnedSite(binding, signal);
    await this.#request(path, { method: 'DELETE' }, signal);
    try {
      await this.#request(path, {}, signal);
    } catch (error) {
      if (error instanceof CeApiError && error.category === 'not-found') return;
      throw error;
    }
    throw new Error('Routing deletion is still converging; resume teardown');
  }
  async deleteSite(binding, signal) {
    this.#binding(binding, true);
    let site;
    try {
      site = await this.observeSite(binding, signal);
    } catch (error) {
      if (error instanceof CeApiError && error.category === 'not-found') return;
      throw error;
    }
    this.#owned(site, binding);
    await this.#request(this.#sitePath(binding), { method: 'DELETE' }, signal);
  }
  async deleteSiteExact(binding, expectedUid, signal) {
    this.#binding(binding, true);
    signal?.throwIfAborted();
    if (typeof expectedUid !== 'string' || !expectedUid.trim()) throw new Error('Exact site UID required for deletion');
    const source = this.#sitePath(binding);
    const read = async () => {
      try {
        return await this.#request(source, {}, signal);
      } catch (error) {
        if (error instanceof CeApiError && error.category === 'not-found') return;
        throw error;
      }
    };
    const check = (site) => {
      this.#owned(site, binding);
      if (object11(site.system_metadata).uid !== expectedUid)
        throw new Error('Site UID changed before or during deletion');
    };
    let current = await read();
    if (current) {
      check(current);
      try {
        await this.#request(source, { method: 'DELETE' }, signal);
      } catch (error) {
        if (!(error instanceof CeApiError) || !['not-found', 'transient', 'deadline'].includes(error.category))
          throw error;
      }
      current = await read();
      if (current) check(current);
    }
    return {
      status: current ? 'pending' : 'deleted',
      owner: binding.owner,
      siteName: binding.siteName,
      siteUid: expectedUid,
      source,
      contractFingerprint: this.contract.fingerprint,
      observedAt: new Date().toISOString(),
    };
  }
  async observeSiteDeletion(binding, expected, signal) {
    this.#binding(binding);
    signal?.throwIfAborted();
    if (![expected.siteUid, expected.physicalSiteUid].every((uid) => typeof uid === 'string' && uid.trim()))
      throw new Error('Logical and physical site UIDs are required for deletion observation');
    const sources = {
      logical: this.#sitePath(binding),
      physical: `/api/config/namespaces/system/sites/${binding.siteName}`,
      registrations: `/api/register/namespaces/system/registrations_by_site/${binding.siteName}`,
    };
    const base = {
      owner: binding.owner,
      siteName: binding.siteName,
      ...expected,
      sources,
      contractFingerprint: this.contract.fingerprint,
    };
    const read = async (path) => {
      try {
        return await this.#request(path, {}, signal);
      } catch (error) {
        if (error instanceof CeApiError && error.category === 'not-found') return;
        throw error;
      }
    };
    try {
      const logical = await read(sources.logical);
      if (logical) {
        this.#owned(logical, binding);
        if (object11(logical.system_metadata).uid !== expected.siteUid)
          throw new Error('Logical site identity changed');
      }
      const physical = await read(sources.physical);
      if (
        physical &&
        (object11(physical.metadata).name !== binding.siteName ||
          object11(physical.metadata).namespace !== 'system' ||
          object11(physical.system_metadata).uid !== expected.physicalSiteUid)
      )
        throw new Error('Physical site identity changed');
      const registrations = await read(sources.registrations);
      let activeRegistrations = 0;
      if (registrations) {
        if (
          !Array.isArray(registrations.items) ||
          registrations.next_page_token ||
          registrations.next_token ||
          registrations.continuation_token ||
          registrations.continue ||
          registrations.nextLink ||
          (registrations.errors !== undefined && (!Array.isArray(registrations.errors) || registrations.errors.length))
        )
          throw new Error('Incomplete registration retirement evidence');
        const seen = new Set();
        const inactive = ['RETIRED', 'FAILED', 'DONE', 'FAILED_INACTIVE'];
        const active = ['NOTSET', 'NEW', 'APPROVED', 'ADMITTED', 'PENDING', 'ONLINE', 'UPGRADING', 'MAINTENANCE'];
        for (const raw of registrations.items) {
          const item = object11(raw),
            spec = object11(item.get_spec),
            state = object11(object11(item.object).status).current_state;
          if (
            typeof item.name !== 'string' ||
            !/^r-[a-z0-9-]+$/.test(item.name) ||
            seen.has(item.name) ||
            object11(spec.passport).cluster_name !== binding.siteName ||
            !binding.nodes.includes(String(object11(spec.infra).hostname)) ||
            typeof state !== 'string' ||
            ![...inactive, ...active].includes(state)
          )
            throw new Error('Registration retirement identity is malformed or foreign');
          seen.add(item.name);
          if (active.includes(state)) activeRegistrations++;
        }
      }
      return {
        ...base,
        status: !logical && !physical && activeRegistrations === 0 ? 'deleted' : 'pending',
        logicalAbsent: !logical,
        physicalAbsent: !physical,
        activeRegistrations,
        observedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      return {
        ...base,
        status: 'unknown',
        reason: error instanceof CeApiError ? error.category : 'identity-or-response-invalid',
        observedAt: new Date().toISOString(),
      };
    }
  }
  async bootstrap(binding, node, tokenName, persistIssuedToken, signal) {
    this.#binding(binding, true);
    if (!binding.nodes.includes(node) || !safeName.test(tokenName))
      throw new Error('Bootstrap node is not in this site');
    const bootstrap = this.contract.bootstrapQuery(binding.owner.provider);
    this.#owned(await this.observeSite(binding, signal), binding);
    const path = `/api/register/namespaces/system/tokens/${tokenName}`;
    let token;
    try {
      token = await this.#request(path, {}, signal);
    } catch (error) {
      if (!(error instanceof CeApiError && error.category === 'not-found')) throw error;
    }
    if (!token) {
      try {
        await this.#request(
          '/api/register/namespaces/system/tokens',
          {
            method: 'POST',
            body: JSON.stringify({
              metadata: {
                name: tokenName,
                namespace: 'system',
                labels: { ...this.#labels(binding), 'xcsh-ce-node': node },
              },
              spec: { type: 1, site_name: binding.siteName },
            }),
          },
          signal,
        );
      } catch (error) {
        if (!(error instanceof CeApiError && ['transient', 'conflict'].includes(error.category))) throw error;
      }
      token = await this.#request(path, {}, signal);
    }
    const metadata = object11(token.metadata);
    if (
      metadata.name !== tokenName ||
      metadata.namespace !== 'system' ||
      !subset(metadata.labels, { ...this.#labels(binding), 'xcsh-ce-node': node })
    )
      throw new Error('Registration token ownership does not match node');
    const spec = object11(token.spec);
    if (spec.site_name !== binding.siteName || ![1, 'JWT'].includes(spec.type) || typeof spec.content !== 'string')
      throw new Error('Registration JWT is not bound to the site');
    try {
      const claims = object11(JSON.parse(Buffer.from(spec.content.split('.')[1], 'base64url').toString('utf8')));
      if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now() + 60000)
        throw new Error();
    } catch {
      throw new Error('Registration JWT expiry is missing or too near');
    }
    await persistIssuedToken({ tokenName, siteName: binding.siteName, node, jwt: spec.content });
    const query = new URLSearchParams({
      provider: bootstrap.provider,
      site_name: binding.siteName,
      enable_management_network: String(bootstrap.enableManagementNetwork),
    });
    return bindAwsCloudInit(
      await this.#request(`/api/register/namespaces/system/get-cloud-init-config?${query}`, {}, signal),
      spec.content,
    );
  }
  async deleteBootstrapToken(binding, node, tokenName, signal) {
    this.#binding(binding, true);
    if (!binding.nodes.includes(node) || !safeName.test(tokenName)) throw new Error('Bootstrap identity mismatch');
    const path = `/api/register/namespaces/system/tokens/${tokenName}`;
    let token;
    try {
      token = await this.#request(path, {}, signal);
    } catch (error) {
      if (error instanceof CeApiError && error.category === 'not-found') return;
      throw error;
    }
    const metadata = object11(token.metadata);
    if (
      metadata.name !== tokenName ||
      metadata.namespace !== 'system' ||
      object11(token.spec).site_name !== binding.siteName ||
      !subset(metadata.labels, { ...this.#labels(binding), 'xcsh-ce-node': node })
    )
      throw new Error('Registration token ownership mismatch');
    signal?.throwIfAborted();
    try {
      await this.#request(path, { method: 'DELETE' }, signal);
    } catch (error) {
      if (!(error instanceof CeApiError) || !['not-found', 'transient', 'deadline'].includes(error.category))
        throw error;
    }
    try {
      await this.#request(path, {}, signal);
    } catch (error) {
      if (error instanceof CeApiError && error.category === 'not-found') return;
      throw error;
    }
    throw new Error('Registration token deletion is still converging; resume revocation');
  }
  async observeHealth(binding, signal, readOnly = false) {
    this.#binding(binding);
    const source = `/api/operate/namespaces/system/sites/${binding.siteName}/vpm/debug/global/health`;
    const base = {
      owner: binding.owner,
      siteName: binding.siteName,
      nodes: binding.nodes,
      contractFingerprint: this.contract.fingerprint,
      source,
      observedAt: new Date().toISOString(),
    };
    const profile = this.contract.provider(binding.owner.provider);
    if (
      !profile.runtime ||
      object11(object11(profile.runtime).health).path !==
        '/api/operate/namespaces/system/sites/{site}/vpm/debug/global/health'
    )
      return { ...base, status: 'unknown', reason: 'provider-health-contract-unavailable' };
    try {
      const site = await this.observeSite(binding, signal);
      if (!readOnly) this.#owned(site, binding);
      else if (
        object11(site.metadata).name !== binding.siteName ||
        object11(site.metadata).namespace !== 'system' ||
        typeof object11(site.system_metadata).uid !== 'string'
      )
        throw new Error('Read-only site identity differs');
      const health = await this.#request(source, {}, signal);
      const matches = binding.nodes.filter(
        (node) =>
          health.hostname === node || (typeof health.hostname === 'string' && health.hostname.startsWith(`${node}.`)),
      );
      if (
        matches.length !== 1 ||
        typeof health.state !== 'string' ||
        !['PROVISIONED', 'PROVISIONING', 'INITIALIZING', 'FAILED', 'DEGRADED', 'NOT_PROVISIONED'].includes(health.state)
      )
        return { ...base, status: 'unknown', reason: 'health-identity-or-state-missing' };
      return {
        ...base,
        status: health.state === 'PROVISIONED' ? 'healthy' : 'degraded',
        representativeNode: matches[0],
        state: health.state,
        scope: 'site-global-only',
        nodeHealth: 'unknown',
        siteUid: object11(site.system_metadata).uid,
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      return {
        ...base,
        status: 'unknown',
        reason: error instanceof CeApiError ? error.category : 'ownership-or-response-invalid',
      };
    }
  }
  async observeRegistrations(binding, expectedInstances, signal, admittedNodes = binding.nodes) {
    this.#binding(binding);
    const source = `/api/register/namespaces/system/registrations_by_site/${binding.siteName}`;
    const base = {
      owner: binding.owner,
      siteName: binding.siteName,
      contractFingerprint: this.contract.fingerprint,
      source,
      observedAt: new Date().toISOString(),
    };
    try {
      if (
        !Array.isArray(admittedNodes) ||
        !admittedNodes.length ||
        admittedNodes.some((node) => !binding.nodes.includes(node) || !expectedInstances[node]) ||
        new Set(admittedNodes).size !== admittedNodes.length
      )
        throw new Error('Registration admission scope differs');
      this.#owned(await this.observeSite(binding, signal), binding);
      const response = await this.#request(source, {}, signal);
      return {
        ...base,
        ...parseRegistrationObservation(
          response,
          binding.siteName,
          admittedNodes,
          binding.nodes.length,
          expectedInstances,
        ),
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      return {
        ...base,
        status: 'unknown',
        reason: error instanceof CeApiError ? error.category : 'ownership-or-response-invalid',
      };
    }
  }
  async observeReadOnlySite(siteName, cloudInstanceIds, signal) {
    if (
      !safeName.test(siteName) ||
      !Array.isArray(cloudInstanceIds) ||
      cloudInstanceIds.some((id) => !/^i-[0-9a-f]{8,21}$/.test(id)) ||
      new Set(cloudInstanceIds).size !== cloudInstanceIds.length
    )
      throw new Error('Invalid read-only site scope');
    const source = this.contract.configurationPath('aws', siteName);
    const observedAt = new Date().toISOString();
    const configuration = await this.#request(source, {}, signal);
    if (
      object11(configuration.metadata).name !== siteName ||
      object11(configuration.metadata).namespace !== 'system' ||
      typeof object11(configuration.system_metadata).uid !== 'string'
    )
      throw new Error('Read-only site identity is unverified');
    const rawNodes = object11(object11(object11(configuration.spec).aws).not_managed).node_list;
    if (!Array.isArray(rawNodes) || !rawNodes.length)
      return { status: 'unknown', siteName, source, observedAt, reason: 'configured-node-identities-unavailable' };
    const nodes = rawNodes.map((node) => String(object11(node).hostname));
    if (nodes.some((node) => !safeName.test(node)) || new Set(nodes).size !== nodes.length)
      throw new Error('Ambiguous configured node identity');
    const binding = {
      siteName,
      nodes,
      owner: {
        deploymentId: 'ce-inventory',
        engine: 'native',
        provider: 'aws',
        account: 'unknown',
        region: 'inventory',
      },
    };
    const unknown = (reason) => ({ status: 'unknown', reason, observedAt, siteName });
    const observation = async (path, parse) => {
      try {
        return {
          siteName,
          siteUid: object11(configuration.system_metadata).uid,
          source: path,
          observedAt: new Date().toISOString(),
          observation: parse(await this.#request(path, {}, signal)),
        };
      } catch {
        signal?.throwIfAborted();
        return { ...unknown('read-only-evidence-unavailable-or-malformed'), source: path };
      }
    };
    const health = await this.observeHealth(binding, signal, true);
    delete health.owner;
    const registrations = await observation(
      `/api/register/namespaces/system/registrations_by_site/${siteName}`,
      (response) =>
        parseRegistrationObservation(
          response,
          siteName,
          nodes,
          nodes.length,
          registrationInstanceBindings(response, siteName, nodes, cloudInstanceIds),
        ),
    );
    const routes = await observation(this.contract.bgpRoutesPath('aws', siteName), (response) =>
      parseBgpRoutes(response, nodes),
    );
    const versions = await observation(`/api/config/namespaces/system/sites/${siteName}`, (response) =>
      parseSiteUpgradeState(response, binding),
    );
    return {
      status: 'observed',
      siteName,
      siteUid: object11(configuration.system_metadata).uid,
      source,
      observedAt,
      ownership: 'read-only',
      canSatisfyMutationGate: false,
      nodes,
      health,
      registrations,
      routes,
      versions,
    };
  }
  async approveRegistrations(binding, expectedInstances, checkpoint, signal, admittedNodes = binding.nodes) {
    this.#binding(binding, true);
    const observation = await this.observeRegistrations(binding, expectedInstances, signal, admittedNodes);
    if (!Array.isArray(observation.nodes)) return observation;
    for (const value of observation.nodes) {
      const node = object11(value);
      if (node.state !== 'NEW' || typeof node.registration !== 'string' || typeof node.node !== 'string') continue;
      this.#owned(await this.observeSite(binding, signal), binding);
      const path = `/api/register/namespaces/system/registrations/${node.registration}`;
      const source = await this.#request(path, {}, signal);
      const nested = (...paths) => {
        for (const candidate of paths) {
          let current = source;
          for (const segment of candidate.split('.'))
            current = current && typeof current === 'object' ? current[segment] : undefined;
          if (current !== undefined) return current;
        }
        return;
      };
      const passport = object11(nested('object.spec.gc_spec.passport', 'spec.gc_spec.passport', 'spec.passport'));
      const state = nested(
        'object.status.current_state',
        'object.status.state',
        'status.current_state',
        'status.state',
        'state',
      );
      if (passport.cluster_name !== binding.siteName) throw new Error('Registration passport belongs to another site');
      if (state !== 'NEW') continue;
      const record = {
        siteName: binding.siteName,
        node: node.node,
        registration: node.registration,
        instanceId: node.instanceId,
        action: 'approve-registration',
      };
      await checkpoint({ ...record, state: 'requested' });
      await this.#request(
        `/api/register/namespaces/system/registration/${node.registration}/approve`,
        {
          method: 'POST',
          body: JSON.stringify({
            namespace: 'system',
            name: node.registration,
            state: 'APPROVED',
            passport: { ...passport, cluster_size: binding.nodes.length },
          }),
        },
        signal,
      );
      await checkpoint({ ...record, state: 'submitted' });
    }
    return this.observeRegistrations(binding, expectedInstances, signal, admittedNodes);
  }
}
var CE_API_ERROR_BRAND, CeApiError, safeName;
var init_runtime = __esm(() => {
  init_bgp_evidence();
  init_bgp_route_evidence();
  init_bgp_service_membership();
  init_bootstrap();
  init_ingress_lifecycle();
  init_interface_evidence();
  init_origin_teardown();
  init_platform_drain();
  init_site_labels();
  init_teardown_inventory();
  init_upgrade_evidence();
  CE_API_ERROR_BRAND = Symbol.for('xcsh.ce.api-error.v1');
  CeApiError = class CeApiError extends Error {
    category;
    status;
    [CE_API_ERROR_BRAND] = true;
    static [Symbol.hasInstance](value) {
      if (!(value instanceof Error)) return false;
      const candidate = value;
      return (
        candidate[CE_API_ERROR_BRAND] === true &&
        [
          'authorization',
          'expired',
          'throttled',
          'not-found',
          'conflict',
          'invalid-request',
          'transient',
          'malformed',
          'cancelled',
          'deadline',
        ].includes(String(candidate.category)) &&
        (candidate.status === undefined ||
          (Number.isInteger(candidate.status) && Number(candidate.status) >= 100 && Number(candidate.status) <= 599))
      );
    }
    constructor(category, status) {
      super(`F5 CE API ${category}${status ? ` (HTTP ${status})` : ''}`);
      this.category = category;
      this.status = status;
    }
  };
  safeName = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
});

// plugins/platform/src/ce/contract-auth.ts
import { execFileSync } from 'node:child_process';

function existingContractCredential(env = process.env) {
  const configured = env.GH_TOKEN || env.GITHUB_TOKEN;
  if (configured) return configured;
  try {
    return (
      execFileSync('gh', ['auth', 'token'], {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() || undefined
    );
  } catch {
    return;
  }
}
function contractHeaders(url, token) {
  const headers = { Accept: 'application/vnd.github+json' };
  const target = new URL(url);
  if (
    token &&
    target.origin === 'https://api.github.com' &&
    target.pathname.startsWith('/repos/f5-sales-demo/api-specs-enriched/')
  )
    headers.Authorization = `Bearer ${token}`;
  return headers;
}
function authenticatedContractHeaders(url) {
  const target = new URL(url);
  const scoped =
    target.origin === 'https://api.github.com' &&
    target.pathname.startsWith('/repos/f5-sales-demo/api-specs-enriched/');
  return contractHeaders(url, scoped ? existingContractCredential() : undefined);
}
var init_contract_auth = () => {};

// plugins/platform/src/ce/verified-api-release.ts
import { createHash as createHash5 } from 'node:crypto';

function object12(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed CE API contract');
  return value;
}
function parse(bytes) {
  try {
    return object12(JSON.parse(Buffer.from(bytes).toString('utf8')));
  } catch {
    throw new Error('Malformed CE API contract JSON');
  }
}
async function loadPublishedCeApi(fetcher = fetch, signal) {
  signal?.throwIfAborted();
  let pending = verifiedSchemas.get(fetcher);
  if (!pending) {
    pending = verifyPublishedCeApi(fetcher, signal);
    verifiedSchemas.set(fetcher, pending);
    pending.catch(() => {
      if (verifiedSchemas.get(fetcher) === pending) verifiedSchemas.delete(fetcher);
    });
  }
  const api = await pending;
  signal?.throwIfAborted();
  return structuredClone(api);
}
async function verifyPublishedCeApi(fetcher, signal) {
  const deadline = AbortSignal.timeout(60000);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const read = async (url, maximum = 1048576) => {
    combined.throwIfAborted();
    let response;
    try {
      response = await fetcher(url, { signal: combined, headers: authenticatedContractHeaders(url) });
    } catch {
      throw new CeContractFailure('public_contract_transport', 'Published contract transport failed');
    }
    if (!response.ok || !response.body)
      throw new CeContractFailure(
        'public_contract_transport',
        `CE API contract download failed: HTTP ${response.status}, ${new URL(url).hostname}`,
      );
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        combined.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maximum) throw new Error('CE API contract download exceeds size limit');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    return Buffer.concat(chunks);
  };
  const release = parse(await read(`https://api.github.com/repos/${repository}/releases/tags/${tag}`));
  if (release.tag_name !== tag || release.immutable !== true || release.draft !== false || release.prerelease !== false)
    throw new Error('CE API release is not the pinned immutable publication');
  const matches =
    typeof release.body === 'string' ? [...release.body.matchAll(/^<!-- publication-receipt:(.+) -->$/gm)] : [];
  if (matches.length !== 1) throw new Error('CE API publication receipt is missing or ambiguous');
  const receipt = parse(Buffer.from(matches[0][1]));
  if (receipt.commit !== commit || receipt.version !== '12.0.9' || object12(receipt.assets)['openapi.json'] !== digest2)
    throw new Error('CE API publication receipt differs from the pinned contract');
  const assets = Array.isArray(release.assets)
    ? release.assets.map(object12).filter((asset) => asset.name === 'openapi.json')
    : [];
  if (assets.length !== 1 || assets[0].digest !== digest2 || assets[0].browser_download_url !== assetUrl)
    throw new Error('CE API schema asset binding differs from the pinned contract');
  const resolved = parse(await read(`https://api.github.com/repos/${repository}/commits/${tag}`));
  if (resolved.sha !== commit) throw new Error('CE API release tag moved');
  const bytes = await read(assetUrl, 64 * 1024 * 1024);
  if (`sha256:${createHash5('sha256').update(bytes).digest('hex')}` !== digest2)
    throw new Error('CE API schema checksum mismatch');
  const api = parse(bytes);
  combined.throwIfAborted();
  return api;
}
var CeContractFailure,
  repository = 'f5-sales-demo/api-specs-enriched',
  tag = 'v12.0.9',
  commit = 'e04c5d45f7a4e103e2dc84bf52b767182b4de3bc',
  digest2 = 'sha256:8a3ea9bce1bab8aa228c10e0d646e693bcfb9c36562ad4efefef3c5b74062753',
  assetUrl,
  CE_API_RELEASE,
  verifiedSchemas;
var init_verified_api_release = __esm(() => {
  init_contract_auth();
  CeContractFailure = class CeContractFailure extends Error {
    category;
    constructor(category, message) {
      super(message);
      this.category = category;
    }
  };
  assetUrl = `https://github.com/${repository}/releases/download/${tag}/openapi.json`;
  CE_API_RELEASE = Object.freeze({ tag, commit, fingerprint: digest2 });
  verifiedSchemas = new WeakMap();
});

// plugins/platform/src/ce/release-contract.ts
function fail(message) {
  throw new ReleaseContractFailure(message);
}
function object13(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} is malformed`);
  return value;
}
function parseKvmImageResolution(openapi) {
  const api = object13(openapi, 'KVM image resolution OpenAPI');
  const paths = object13(api.paths, 'KVM image resolution paths');
  const endpoint = '/api/maurice/software_os_version';
  const operation = object13(
    object13(paths[endpoint], 'KVM image resolution path').post,
    'KVM image resolution operation',
  );
  const operationId = 'ves.io.schema.virtual_appliance.SoftwareVersionOsImageCustomApi.GetImage';
  const requestRef = object13(
    object13(
      object13(operation.requestBody, 'KVM image resolution request').content,
      'KVM image resolution request content',
    )['application/json'],
    'KVM image resolution request JSON',
  ).schema;
  const responseRef = object13(
    object13(
      object13(object13(operation.responses, 'KVM image resolution responses')['200'], 'KVM image resolution response')
        .content,
      'KVM image resolution response content',
    )['application/json'],
    'KVM image resolution response JSON',
  ).schema;
  const schemas = object13(
    object13(api.components, 'KVM image resolution components').schemas,
    'KVM image resolution schemas',
  );
  const request = object13(
    object13(schemas.virtual_applianceGetImageRequest, 'KVM image resolution request schema').properties,
    'KVM image resolution request properties',
  );
  const uids = object13(request.uids, 'KVM image resolution UIDs');
  const images = object13(
    object13(
      object13(schemas.virtual_applianceGetImageResponse, 'KVM image resolution response schema').properties,
      'KVM image resolution response properties',
    ).images,
    'KVM image resolution images',
  );
  const image = object13(
    object13(images.additionalProperties, 'KVM image resolution image').properties,
    'KVM image resolution image fields',
  );
  const link = object13(image.download_image_link, 'KVM image resolution link');
  const checksum = object13(image.image_md5_sum, 'KVM image resolution checksum');
  const error = object13(image.error_description, 'KVM image resolution error');
  if (
    operation.operationId !== operationId ||
    object13(requestRef, 'KVM image resolution request reference').$ref !==
      '#/components/schemas/virtual_applianceGetImageRequest' ||
    object13(responseRef, 'KVM image resolution response reference').$ref !==
      '#/components/schemas/virtual_applianceGetImageResponse' ||
    uids.type !== 'array' ||
    uids.uniqueItems !== true ||
    uids.minItems !== 1 ||
    object13(uids.items, 'KVM image resolution UID item').type !== 'string' ||
    typeof uids.description !== 'string' ||
    !uids.description.includes('owner_view.kind equal to securemesh_site_v2') ||
    !uids.description.includes('owner_view.uid to the exact Secure Mesh Site v2 configuration UID') ||
    images.type !== 'object' ||
    link.type !== 'string' ||
    link.format !== 'uri' ||
    checksum.type !== 'string' ||
    checksum.pattern !== '^[0-9a-fA-F]{32}$' ||
    error.type !== 'string'
  )
    fail('KVM image resolution schema is unsupported');
  return {
    id: 'site_uid_image_resolution',
    endpoint,
    operation: operationId,
    ownerJoin: {
      namespace: 'system',
      namedConfiguration: 'exactly_one',
      ownerKind: 'securemesh_site_v2',
      cardinality: 'exactly_one',
      uidSource: 'site_object',
    },
    validation: [
      'exact_site_uid_mapping',
      'empty_error_description',
      'https_image_url',
      'md5_checksum',
      'ownership_recheck',
    ],
  };
}
var RELEASE_TAG, RELEASE_COMMIT, OPENAPI_SHA256, RELEASE_URL, TAG_URL, REQUIRED_ASSETS, ReleaseContractFailure;
var init_release_contract = __esm(() => {
  init_verified_api_release();
  RELEASE_TAG = CE_API_RELEASE.tag;
  RELEASE_COMMIT = CE_API_RELEASE.commit;
  OPENAPI_SHA256 = CE_API_RELEASE.fingerprint;
  RELEASE_URL = `https://api.github.com/repos/f5-sales-demo/api-specs-enriched/releases/tags/${RELEASE_TAG}`;
  TAG_URL = `https://api.github.com/repos/f5-sales-demo/api-specs-enriched/commits/${RELEASE_TAG}`;
  REQUIRED_ASSETS = new Set([
    'api-catalog.json',
    'concurrency_contracts.json',
    'f5xc-api-specs-v12.0.9.zip',
    'index.json',
    'minimal-export-defaults.json',
    'openapi.json',
    'smsv2-contract-manifest.json',
    'smsv2-contract.json',
    'smsv2-evidence-receipt.json',
    'smsv2_parity_manifest.json',
    'upstream-contract-removals.json',
  ]);
  ReleaseContractFailure = class ReleaseContractFailure extends Error {
    category;
    constructor(message) {
      super(`Verified SMSv2 release is unavailable: ${message}`);
      this.category = message.startsWith('public_contract_transport')
        ? 'public_contract_transport'
        : message.startsWith('public_contract_http')
          ? 'public_contract_http'
          : message.startsWith('public_contract_parsing')
            ? 'public_contract_parsing'
            : message.includes('checksum') || message.includes('digest') || message.includes('asset')
              ? 'public_contract_integrity'
              : 'public_contract_provenance';
    }
  };
});

// plugins/platform/src/ce/wire-replace.ts
function projectReplaceSnapshot(value, schemas, root, ignoredRootFields = []) {
  function shape(value, depth = 0) {
    if (depth > 50) throw new Error('Replacement schema nesting exceeds limit');
    const schema = object14(value);
    let resolved = {};
    if (schema.$ref) {
      if (typeof schema.$ref !== 'string' || !schema.$ref.startsWith('#/components/schemas/'))
        throw new Error('Unsupported replacement reference');
      resolved = shape(schemas[schema.$ref.slice('#/components/schemas/'.length)], depth + 1);
    }
    if (schema.allOf)
      for (const item of schema.allOf) {
        const part = shape(item, depth + 1);
        resolved = {
          ...resolved,
          ...part,
          ...(resolved.properties || part.properties
            ? { properties: { ...resolved.properties, ...part.properties } }
            : {}),
        };
      }
    return {
      ...resolved,
      ...schema,
      ...(schema.properties ? { properties: { ...resolved.properties, ...object14(schema.properties) } } : {}),
    };
  }
  function project(value, schemaValue, top = false) {
    const schema = shape(schemaValue);
    if (schema.readOnly === true || value === null || (value === '' && Number(schema.minLength) > 0)) return;
    if (Array.isArray(value)) {
      if (!schema.items) throw new Error('Replacement array schema missing');
      return value.map((item) => {
        const projected = project(item, schema.items);
        if (projected === undefined) throw new Error('Replacement array contains an unset item');
        return projected;
      });
    }
    if (value && typeof value === 'object') {
      if (schema.properties === undefined && schema.additionalProperties === undefined) return structuredClone(value);
      const properties = object14(schema.properties ?? {});
      const result = {};
      for (const [key, item] of Object.entries(value)) {
        const canonicalKey = Object.hasOwn(properties, key)
          ? key
          : Object.keys(properties).find((name) => object14(properties[name])['x-f5xc-wire-name'] === key);
        if (canonicalKey === undefined) {
          if (top && ignoredRootFields.includes(key)) continue;
          if (schema.additionalProperties === true) {
            result[key] = structuredClone(item);
            continue;
          }
          if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            const projected = project(item, schema.additionalProperties);
            if (projected !== undefined) result[key] = projected;
            continue;
          }
          throw new Error('GET snapshot contains an unsupported replacement field');
        }
        const wireName = object14(properties[canonicalKey])['x-f5xc-wire-name'];
        const outputKey = typeof wireName === 'string' ? wireName : canonicalKey;
        if (Object.hasOwn(result, outputKey)) throw new Error('Duplicate canonical and wire field aliases');
        const projected = project(item, properties[canonicalKey]);
        if (projected !== undefined) result[outputKey] = projected;
      }
      return result;
    }
    return structuredClone(value);
  }
  return object14(project(value, schemas[root], true));
}
var object14 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed replacement schema');
  return value;
};

// plugins/platform/src/ce/wire-schema.ts
import { isIP as isIP6 } from 'node:net';

function object15(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('SMSv2 schema is malformed');
  return value;
}
function requestSchema(schemas, root) {
  const definitions = {};
  const referenced = new Set();
  function convert(value) {
    if (typeof value === 'boolean') return value;
    const source = object15(value);
    if (source.readOnly === true) return false;
    const result = {};
    for (const [key, item] of Object.entries(source)) {
      if (keywords.has(key)) result[key] = item;
      if (key === 'required' && Array.isArray(item))
        result.required = item.map((name) => {
          const property = object15(source.properties ?? {})[String(name)];
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
          Object.entries(object15(item)).map(([name, schema]) => {
            const wireName = object15(schema)['x-f5xc-wire-name'];
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
        const property = object15(source.properties ?? {})[String(name)];
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
    const properties = object15(object15(schemas.securemesh_site_v2Interface).properties);
    const projected = object15(object15(object15(schema.definitions).securemesh_site_v2Interface).properties);
    for (const field of ['is_primary', 'is_management']) {
      const source = object15(properties[field]);
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
    const family = isIP6(address);
    if (!family || extra !== undefined || !/^\d+$/.test(length ?? '')) return false;
    const bits = Number(length);
    return bits >= 0 && bits <= (family === 4 ? 32 : 128);
  }
  if (format === 'ipv4') return isIP6(value) === 4;
  if (format === 'ipv6') return isIP6(value) === 6;
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
    const definition = object15(document.definitions)[schemaValue.$ref.slice(prefix.length)];
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
    const properties = schemaValue.properties ? object15(schemaValue.properties) : undefined;
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
var keywords;
var init_wire_schema = __esm(() => {
  keywords = new Set([
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
});

// plugins/platform/src/ce/wire-routing.ts
import { isIP as isIP7 } from 'node:net';

function buildAzureRouting(siteName, localAsn, remoteAsn, bindings, routeServerAddresses, validate) {
  const name = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  const interfaceName = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/;
  const reserved = new Set([8074, 8075, 12076, 23456, 65515, 65517, 65518, 65519, 65520]);
  if (
    !name.test(siteName) ||
    ![1, 3].includes(bindings.length) ||
    !Number.isInteger(localAsn) ||
    localAsn < 1 ||
    localAsn > 65534 ||
    reserved.has(localAsn) ||
    (localAsn >= 64496 && localAsn <= 64511) ||
    remoteAsn !== 65515 ||
    routeServerAddresses.length !== 2 ||
    new Set(routeServerAddresses).size !== 2 ||
    routeServerAddresses.some((address) => isIP7(address) !== 4)
  )
    throw new Error('Unsupported Azure Route Server site or peer topology');
  const nodes = new Set();
  const interfaces = new Set();
  for (const binding of bindings) {
    if (
      !name.test(binding.node) ||
      nodes.has(binding.node) ||
      !interfaceName.test(binding.interfaceName) ||
      binding.interfaceName.includes('__') ||
      interfaces.has(binding.interfaceName)
    )
      throw new Error('Invalid observed Azure SLO interface binding');
    nodes.add(binding.node);
    interfaces.add(binding.interfaceName);
  }
  const spec = {
    where: {
      site: {
        network_type: 'VIRTUAL_NETWORK_SITE_LOCAL',
        ref: [{ name: siteName, namespace: 'system' }],
        disable_internet_vip: {},
      },
    },
    bgp_parameters: { asn: localAsn, local_address: {} },
    peers: bindings.flatMap((binding, bindingIndex) =>
      routeServerAddresses.map((address, addressIndex) => ({
        metadata: { name: `peer-${bindingIndex + 1}-${addressIndex + 1}` },
        external: {
          asn: remoteAsn,
          address,
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
  return {
    bgp: { name: `${siteName.slice(0, 45)}-route-server-bgp`, spec },
    expectedSessions: bindings.length * routeServerAddresses.length,
    payloadNetwork: 'slo',
  };
}
function buildAwsRouting(siteName, localAsn, remoteAsn, bindings, deniedExportPrefixes, validate) {
  const name = /^[a-z][a-z0-9-]{0,62}$/;
  if (
    !name.test(siteName) ||
    !bindings.length ||
    bindings.length > 4 ||
    ![localAsn, remoteAsn].every((asn) => Number.isInteger(asn) && asn > 0 && asn < 4294967295) ||
    localAsn === remoteAsn ||
    !Array.isArray(deniedExportPrefixes) ||
    deniedExportPrefixes.length < 1 ||
    deniedExportPrefixes.length > 8 ||
    new Set(deniedExportPrefixes).size !== deniedExportPrefixes.length ||
    deniedExportPrefixes.some((prefix) => {
      const [address, length, extra] = prefix.split('/');
      return extra !== undefined || isIP7(address) !== 4 || !/^\d+$/.test(length ?? '') || Number(length) > 32;
    })
  )
    throw new Error('Unsupported AWS routing site or peer topology');
  const names = new Set();
  const endpoints = new Set();
  const connectors = bindings.map((binding) => {
    if (
      !name.test(binding.name) ||
      names.has(binding.name) ||
      !name.test(binding.node) ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(binding.interfaceName) ||
      !Number.isInteger(binding.interfaceMtu) ||
      binding.interfaceMtu < 600 ||
      binding.interfaceMtu > 9000 ||
      !Array.isArray(binding.awsBgpAddresses) ||
      binding.awsBgpAddresses.length !== 2
    )
      throw new Error('Invalid observed GRE interface binding');
    names.add(binding.name);
    if (
      [binding.awsGreAddress, binding.ceInsideAddress, ...binding.awsBgpAddresses].some(
        (address) => isIP7(address) !== 4,
      ) ||
      binding.awsBgpAddresses[0] === binding.awsBgpAddresses[1] ||
      binding.awsBgpAddresses.includes(binding.ceInsideAddress)
    )
      throw new Error('Invalid AWS GRE or BGP endpoint evidence');
    const numeric = (address) => address.split('.').reduce((value, octet) => value * 256 + Number(octet), 0);
    const local = numeric(binding.ceInsideAddress);
    const network = Math.floor(local / 8) * 8;
    if (
      !binding.ceInsideAddress.startsWith('169.254.') ||
      local - network !== 1 ||
      binding.awsBgpAddresses.some(
        (address) =>
          Math.floor(numeric(address) / 8) * 8 !== network ||
          numeric(address) - network < 2 ||
          numeric(address) - network > 6,
      )
    )
      throw new Error('AWS BGP endpoints do not share the observed inside network');
    for (const address of binding.awsBgpAddresses) {
      if (endpoints.has(address)) throw new Error('Duplicate AWS BGP endpoint');
      endpoints.add(address);
    }
    const spec = {
      ce_site_reference: { name: siteName, namespace: 'system' },
      gre: {
        gre_parameters: {
          site_local_inside_network: {},
          tunnel_mtu: Math.min(binding.interfaceMtu - 24, 1370),
          peer_ip_address: { addr: binding.awsGreAddress },
          tunnel_eps: [
            {
              node: binding.node,
              interface: binding.interfaceName,
              local_tunnel_ip: `${binding.ceInsideAddress}/29`,
              remote_tunnel_ip: `${binding.awsBgpAddresses[0]}/29`,
            },
          ],
        },
      },
    };
    validate('external_connector', spec);
    return { name: binding.name, spec };
  });
  const exportPolicy = {
    name: `${siteName.slice(0, 43)}-tgw-export-policy`,
    spec: {
      rules: [
        {
          match: {
            ip_prefixes: {
              prefixes: deniedExportPrefixes.map((ip_prefixes) => ({ ip_prefixes, equal_or_longer_than: {} })),
            },
          },
          action: { deny: {} },
        },
      ],
    },
  };
  validate('bgp_routing_policy', exportPolicy.spec);
  const bgpSpec = {
    where: {
      site: { network_type: 'VIRTUAL_NETWORK_SITE_LOCAL_INSIDE', ref: [{ name: siteName, namespace: 'system' }] },
    },
    bgp_parameters: { asn: localAsn, local_address: {} },
    peers: bindings.flatMap((binding, bindingIndex) =>
      binding.awsBgpAddresses.map((address, index) => ({
        metadata: { name: `peer-${bindingIndex + 1}-${index + 1}` },
        external: {
          asn: remoteAsn,
          address,
          port: 179,
          family_inet: { enable: {} },
          interface: { name: `ves-io-external-connector-${binding.name}`, namespace: 'system' },
          disable_v6: {},
        },
        passive_mode_disabled: {},
        bfd_disabled: {},
      })),
    ),
  };
  validate('bgp', bgpSpec);
  return {
    connectors,
    exportPolicy,
    bgp: { name: `${siteName.slice(0, 55)}-tgw-bgp`, spec: bgpSpec },
    payloadNetwork: 'sli',
    expectedSessions: bindings.length * 2,
    ebgpMultihopTtlEvidence: 'unknown',
  };
}
function routingValidators(network, marketplace) {
  const validators = {
    bgp: createWireValidator(network, 'bgpCreateSpecType'),
    bgp_routing_policy: createWireValidator(network, 'schemabgp_routing_policyCreateSpecType'),
    external_connector: createWireValidator(marketplace, 'external_connectorCreateSpecType'),
  };
  return (kind, spec) => validators[kind](spec);
}
var init_wire_routing = __esm(() => {
  init_wire_schema();
});

// plugins/platform/src/ce/wire-site.ts
function object16(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid SMSv2 site identity');
  return value;
}
function canonical4(value) {
  if (Array.isArray(value)) return `[${value.map(canonical4).join(',')}]`;
  if (value && typeof value === 'object')
    return JSON.stringify(
      Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, canonical4(item)]),
      ),
    );
  return JSON.stringify(value);
}
function buildWireSite(intent, schemas) {
  if (
    intent.schemaVersion !== 2 ||
    !['aws', 'azure'].includes(intent.provider) ||
    !['one-node', 'three-node'].includes(intent.haMode)
  )
    throw new Error('Obsolete or unsupported SMSv2 site intent');
  if (!Array.isArray(intent.nodes) || intent.nodes.length !== (intent.haMode === 'three-node' ? 3 : 1))
    throw new Error('SMSv2 site node count does not match HA selection');
  const hostnames = new Set();
  const identities = new Set();
  let layout;
  for (const node of intent.nodes) {
    if (!names.test(node.hostname) || hostnames.has(node.hostname))
      throw new Error('SMSv2 hostnames must be unique DNS names');
    hostnames.add(node.hostname);
    if (!Array.isArray(node.interfaces) || node.interfaces.length < 1 || node.interfaces.length > 8)
      throw new Error('Unsupported SMSv2 interface count');
    const interfaceNames = new Set();
    const roles = node.interfaces.map((item) => {
      const ethernet = object16(item.ethernet_interface);
      if (typeof ethernet.mac !== 'string' || !macs.test(ethernet.mac) || identities.has(ethernet.mac))
        throw new Error('SMSv2 MAC identity is missing, malformed or duplicated');
      identities.add(ethernet.mac);
      if (
        intent.provider === 'aws' &&
        (typeof ethernet.device !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/.test(ethernet.device))
      )
        throw new Error('An observed AWS guest device is required before configuring an interface');
      if (typeof item.name !== 'string' || !names.test(item.name) || interfaceNames.has(item.name))
        throw new Error('SMSv2 interface names must be unique');
      interfaceNames.add(item.name);
      const network = object16(item.network_option);
      const addressing = ['dhcp_client', 'static_ip', 'no_ipv4_address'].filter((key) => Object.hasOwn(item, key));
      if (addressing.length !== 1) throw new Error('SMSv2 interface addressing must be explicit');
      return { name: item.name, network, addressing: addressing[0], mtu: item.mtu ?? null };
    });
    if (
      !Object.hasOwn(roles[0].network, 'site_local_network') ||
      roles.filter((role) => Object.hasOwn(role.network, 'site_local_network')).length !== 1
    )
      throw new Error('SMSv2 requires one explicit first SLO interface');
    const current = canonical4(roles);
    if (layout !== undefined && layout !== current)
      throw new Error('HA interfaces must have homogeneous order, roles and addressing');
    layout = current;
  }
  const settings = object16(intent.settings);
  const protectedFields = [
    'aws',
    'azure',
    'baremetal',
    'gcp',
    'kvm',
    'oci',
    'openstack',
    'vmware',
    'nutanix',
    'equinix',
    'openshift_virtualization',
    'enable_ha',
    'disable_ha',
    'enable_management_network',
    'disable_management_network',
  ];
  if (protectedFields.some((field) => Object.hasOwn(settings, field)))
    throw new Error('Site settings cannot replace provider, HA or management identity');
  const spec = { ...structuredClone(defaults), ...structuredClone(settings) };
  const root = object16(schemas.viewssecuremesh_site_v2CreateSpecType);
  for (const [key, value] of Object.entries(root)) {
    if (!key.startsWith('x-ves-oneof-field-')) continue;
    const group = typeof value === 'string' ? JSON.parse(value) : value;
    if (group.some((field) => Object.hasOwn(settings, field))) {
      for (const field of group) if (!Object.hasOwn(settings, field)) delete spec[field];
    }
  }
  spec[intent.provider] = {
    not_managed: {
      node_list: intent.nodes.map((node) => ({
        hostname: node.hostname,
        type: 'Control',
        interface_list: structuredClone(node.interfaces),
      })),
    },
  };
  spec[intent.haMode === 'three-node' ? 'enable_ha' : 'disable_ha'] = {};
  spec.disable_management_network = {};
  createWireValidator(schemas)(spec);
  return spec;
}
var names, macs, defaults;
var init_wire_site = __esm(() => {
  init_wire_schema();
  names = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  macs = /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/;
  defaults = {
    block_all_services: {},
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
});

// plugins/platform/src/ce/verified-contract.ts
import { createHash as createHash6 } from 'node:crypto';

function object17(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid verified CE contract');
  return value;
}
function parse2(bytes) {
  try {
    return object17(JSON.parse(Buffer.from(bytes).toString('utf8')));
  } catch {
    throw new Error('Malformed CE contract artifact');
  }
}

class VerifiedCeContract {
  commit;
  fingerprint;
  kvmImageResolution;
  publication;
  #contract;
  #schemas;
  #validate;
  #routing;
  #routingSchemas;
  constructor(commit, fingerprint, contract, schemas, networking, publication, kvmImageResolution) {
    this.commit = commit;
    this.fingerprint = fingerprint;
    this.kvmImageResolution = kvmImageResolution;
    this.publication = publication;
    this.#contract = contract;
    this.#schemas = schemas;
    this.#validate = createWireValidator(schemas);
    if (networking) {
      this.#routing = routingValidators(networking.network, networking.marketplace);
      this.#routingSchemas = networking;
    }
  }
  static async published(fetcher = fetch, signal) {
    const api = await loadPublishedCeApi(fetcher, signal);
    const read = async (name) => {
      const response = await fetcher(`${publishedBase}/${name}`, { signal });
      if (!response.ok) throw new Error('Published SMSv2 contract asset download failed');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (hash3(bytes) !== publishedAssets[name]) throw new Error('Published SMSv2 contract asset checksum mismatch');
      return parse2(bytes);
    };
    const [contract, manifest, evidence] = await Promise.all([
      read('smsv2-contract.json'),
      read('smsv2-contract-manifest.json'),
      read('smsv2-evidence-receipt.json'),
    ]);
    const release = object17(manifest.release);
    const bindings = object17(manifest.assets);
    if (
      manifest.schema_version !== 1 ||
      release.commit !== CE_API_RELEASE.commit ||
      contract.contract_id !== 'f5xc-smsv2-api/v1' ||
      contract.version !== '7.0.0' ||
      evidence.contract_id !== contract.contract_id ||
      bindings['smsv2-contract.json'] !== publishedAssets['smsv2-contract.json'] ||
      bindings['smsv2-evidence-receipt.json'] !== publishedAssets['smsv2-evidence-receipt.json']
    )
      throw new Error('Published SMSv2 contract binding is invalid');
    const schemas = object17(object17(api.components).schemas);
    return new VerifiedCeContract(
      CE_API_RELEASE.commit,
      publishedAssets['smsv2-contract-manifest.json'],
      contract,
      schemas,
      { network: schemas, marketplace: schemas },
      'published-release',
      {
        ...parseKvmImageResolution(api),
        publication: {
          repository: 'f5-sales-demo/api-specs-enriched',
          tag: 'v12.0.9',
          commit: CE_API_RELEASE.commit,
          asset: 'openapi.json',
          sha256: CE_API_RELEASE.fingerprint,
        },
      },
    );
  }
  get awsRoutingAvailable() {
    return this.#routing !== undefined;
  }
  buildAwsRouting(siteName, localAsn, remoteAsn, bindings, deniedExportPrefixes) {
    if (!this.#routing) throw new Error('Pinned CE routing schemas are unavailable');
    return buildAwsRouting(siteName, localAsn, remoteAsn, bindings, deniedExportPrefixes, this.#routing);
  }
  buildAzureRouting(siteName, localAsn, remoteAsn, bindings, routeServerAddresses) {
    if (!this.#routing) throw new Error('Pinned CE routing schemas are unavailable');
    return buildAzureRouting(siteName, localAsn, remoteAsn, bindings, routeServerAddresses, this.#routing);
  }
  routingCreateRequest(kind, metadata, spec) {
    if (!this.#routingSchemas) throw Error('Pinned routing creation contract is required');
    const schemas = kind === 'external_connector' ? this.#routingSchemas.marketplace : this.#routingSchemas.network;
    const request = { metadata: structuredClone(metadata), spec: structuredClone(spec) };
    createWireValidator(schemas, `${kind}CreateRequest`)(request);
    return request;
  }
  routingReplaceRequest(kind, snapshot, desiredSpec, siteUid) {
    if (
      !this.#routingSchemas ||
      !siteUid.trim() ||
      typeof snapshot.resource_version !== 'string' ||
      !snapshot.resource_version
    )
      throw new Error('Pinned routing replacement contract and exact identity are required');
    const schemas = kind === 'external_connector' ? this.#routingSchemas.marketplace : this.#routingSchemas.network;
    const metadata = projectReplaceSnapshot(snapshot.metadata, schemas, 'schemaObjectReplaceMetaType');
    metadata.labels = { ...object17(metadata.labels), 'xcsh-ce-site-uid': siteUid };
    const request = { metadata, spec: structuredClone(desiredSpec), resource_version: snapshot.resource_version };
    createWireValidator(schemas, `${kind}ReplaceRequest`)(request);
    return request;
  }
  validateRouting(kind, spec) {
    if (!this.#routing) throw new Error('Pinned CE routing schemas are unavailable');
    this.#routing(kind, spec);
  }
  requireRoutingContract(providerName) {
    if (providerName === 'azure') this.requireAzureRouteServerEbgpMultihop();
    if (!this.#routing) throw new Error('Pinned CE routing schemas are unavailable');
    this.configurationPath(providerName, 'contract-check');
    this.bgpPeersPath(providerName, 'contract-check');
    this.bgpRoutesPath(providerName, 'contract-check');
  }
  azureRouteServerEbgpMultihop() {
    const azure = object17(object17(this.#contract.providers).azure);
    const capability = object17(azure.route_server_ebgp_multihop);
    const source = object17(capability.source);
    const schemaPaths = source.schema_paths;
    if (
      capability.availability !== 'unavailable' ||
      capability.enforcement !== 'reject_before_mutation' ||
      capability.reason !== 'no_schema_valid_ebgp_multihop_request_control' ||
      source.repository !== 'f5-sales-demo/api-specs-enriched' ||
      typeof source.commit !== 'string' ||
      !commitPattern.test(source.commit) ||
      source.asset_path !== 'docs/specifications/api/network.json' ||
      typeof source.asset_sha256 !== 'string' ||
      !digestPattern.test(source.asset_sha256) ||
      !Array.isArray(schemaPaths) ||
      !schemaPaths.every((path) => typeof path === 'string')
    )
      throw new Error('Azure Route Server eBGP multihop capability contract is unavailable');
    return {
      availability: 'unavailable',
      enforcement: 'reject_before_mutation',
      reason: 'no_schema_valid_ebgp_multihop_request_control',
      source: {
        repository: 'f5-sales-demo/api-specs-enriched',
        commit: source.commit,
        asset_path: 'docs/specifications/api/network.json',
        asset_sha256: source.asset_sha256,
        schema_paths: [...schemaPaths],
      },
    };
  }
  requireAzureRouteServerEbgpMultihop() {
    const capability = this.azureRouteServerEbgpMultihop();
    throw new Error(`Azure Route Server eBGP multihop is ${capability.availability}: ${capability.reason}`);
  }
  configurationPath(providerName, siteName) {
    const provider = object17(object17(this.#contract.providers)[providerName]);
    const observation = object17(object17(provider.runtime).configuration);
    const mappings = object17(observation.response_mappings);
    const normalization = object17(observation.normalization);
    const nullability = object17(observation.nullability);
    const expectedMappings = {
      interfaces: 'interface_list[]',
      mac: 'ethernet_interface.mac',
      mtu: 'mtu',
      node: 'hostname',
      nodes: `spec.${providerName}.not_managed.node_list[]`,
      public_ip: 'public_ip',
      role: 'network_option',
      ...(providerName === 'azure' ? { device: 'ethernet_interface.device', provider: 'spec.azure.not_managed' } : {}),
    };
    if (
      observation.method !== 'GET' ||
      observation.path !== '/api/config/namespaces/{namespace}/securemesh_site_v2s/{site}' ||
      observation.operation_id !== 'ves.io.schema.views.securemesh_site_v2.API.Get' ||
      observation.response_schema !== 'securemesh_site_v2GetResponse' ||
      observation.authority !== 'f5xc' ||
      observation.semantics !== 'configuration' ||
      JSON.stringify(Object.entries(mappings).toSorted()) !==
        JSON.stringify(Object.entries(expectedMappings).toSorted()) ||
      normalization.node !== 'trim' ||
      normalization.mac !== 'ieee802_lowercase_colon' ||
      normalization.role !== 'slo_or_sli' ||
      nullability.public_ip !== 'nullable' ||
      nullability.all_identity_fields !== 'non_null' ||
      JSON.stringify(observation.correlation) !== JSON.stringify(['node', 'normalized_mac'])
    )
      throw new Error(`Verified ${providerName} configuration observation mapping is unavailable`);
    return `/api/config/namespaces/system/securemesh_site_v2s/${siteName}`;
  }
  bgpPeersPath(providerName, siteName) {
    const provider = object17(object17(this.#contract.providers)[providerName]);
    const runtime = object17(provider.runtime);
    const observation = object17(runtime.bgp_peers);
    const mappings = object17(observation.response_mappings);
    const peerAddress = object17(mappings.peer_address);
    if (
      observation.method !== 'GET' ||
      observation.path !== '/api/operate/namespaces/{namespace}/sites/{site}/ver/bgp_peers' ||
      observation.operation_id !== 'ves.io.schema.operate.bgp.CustomPublicAPI.ShowBGPPeers' ||
      observation.response_schema !== 'bgpBGPPeersResponse' ||
      observation.authority !== 'f5xc' ||
      observation.semantics !== 'observational_read_only' ||
      mappings.nodes !== 'ver[]' ||
      mappings.node !== 'ver[].name' ||
      mappings.peers !== 'ver[].peer[]' ||
      mappings.interface_name !== 'ver[].peer[].interface_name' ||
      peerAddress.ipv4 !== 'ver[].peer[].peer_address.ipv4.addr' ||
      peerAddress.ipv6 !== 'ver[].peer[].peer_address.ipv6.addr' ||
      mappings.state !== 'ver[].peer[].protocol_status' ||
      mappings.received_prefix_count !== 'ver[].peer[].received_prefix_count' ||
      mappings.advertised_prefix_count !== 'ver[].peer[].advertised_prefix_count' ||
      mappings.state_changed_at !== 'ver[].peer[].up_down_timestamp' ||
      object17(observation.normalization).node !== 'configured_hostname_or_fqdn' ||
      JSON.stringify(observation.correlation) !== JSON.stringify(['canonical_node', 'peer_address'])
    )
      throw new Error(`Verified ${providerName} BGP observation mapping is unavailable`);
    return `/api/operate/namespaces/system/sites/${siteName}/ver/bgp_peers`;
  }
  bgpRoutesPath(providerName, siteName) {
    const provider = object17(object17(this.#contract.providers)[providerName]);
    const observation = object17(object17(provider.runtime).bgp_routes);
    const mappings = object17(observation.response_mappings);
    if (
      observation.method !== 'GET' ||
      observation.path !== '/api/operate/namespaces/{namespace}/sites/{site}/ver/bgp_routes' ||
      observation.operation_id !== 'ves.io.schema.operate.bgp.CustomPublicAPI.ShowBGPRoutes' ||
      observation.response_schema !== 'bgpBGPRoutesResponse' ||
      observation.authority !== 'f5xc' ||
      observation.semantics !== 'observational_read_only' ||
      mappings.nodes !== 'ver[]' ||
      mappings.node !== 'ver[].name' ||
      mappings.routing_instances !== 'ver[].ri_table[]' ||
      mappings.route_tables !== 'ver[].ri_table[].rt_table[]' ||
      mappings.imported_routes !== 'ver[].ri_table[].rt_table[].imported[]' ||
      mappings.exported_routes !== 'ver[].ri_table[].rt_table[].exported[]' ||
      JSON.stringify(mappings.route_prefixes) !==
        JSON.stringify([
          'ver[].ri_table[].rt_table[].imported[].subnet',
          'ver[].ri_table[].rt_table[].exported[].subnet',
        ]) ||
      object17(observation.normalization).node !== 'configured_hostname_or_fqdn' ||
      JSON.stringify(observation.correlation) !== JSON.stringify(['canonical_node'])
    )
      throw new Error(`Verified ${providerName} BGP route observation mapping is unavailable`);
    return `/api/operate/namespaces/system/sites/${siteName}/ver/bgp_routes`;
  }
  buildSite(intent) {
    if (intent.provider === 'aws' && intent.haMode === 'three-node') this.requireAwsHaNodeConfiguration();
    return buildWireSite(intent, this.#schemas);
  }
  requireAwsHaNodeConfiguration() {
    const configuration = object17(this.provider('aws').node_configuration);
    const invariants = object17(configuration.invariants);
    if (configuration.availability !== 'evidence_backed' || invariants.ha !== 'enabled' || invariants.node_count !== 3)
      throw new Error(
        'Published AWS node configuration requires one non-HA node; qualify and publish three-node support before HA mutation',
      );
  }
  validateSite(spec) {
    this.#validate(spec);
  }
  siteCreateRequest(snapshot) {
    const request = {
      metadata: projectReplaceSnapshot(snapshot.metadata, this.#schemas, 'schemaObjectCreateMetaType'),
      spec: projectReplaceSnapshot(snapshot.spec, this.#schemas, 'viewssecuremesh_site_v2CreateSpecType', [
        'site_state',
        'site_errors',
        'operating_system_version',
        'volterra_software_version',
      ]),
    };
    this.validateSiteCreate(request);
    return request;
  }
  validateSiteCreate(request) {
    createWireValidator(this.#schemas, 'securemesh_site_v2CreateRequest')(request);
  }
  siteReplaceRequest(snapshot) {
    const request = {
      metadata: projectReplaceSnapshot(snapshot.metadata, this.#schemas, 'schemaObjectReplaceMetaType'),
      spec: projectReplaceSnapshot(snapshot.spec, this.#schemas, 'viewssecuremesh_site_v2ReplaceSpecType', [
        'site_state',
        'site_errors',
        'operating_system_version',
        'volterra_software_version',
        'disable_management_network',
        'enable_management_network',
      ]),
      resource_version: snapshot.resource_version,
    };
    for (const provider of ['aws', 'azure']) {
      const original = object17(snapshot.spec)[provider];
      const projected = object17(request.spec)[provider];
      if (!original || !projected) continue;
      const originalNodes = object17(original.not_managed ?? {}).node_list;
      const projectedNodes = object17(projected.not_managed ?? {}).node_list;
      for (const node of projectedNodes ?? [])
        for (const iface of node.interface_list) {
          const ethernet = object17(iface.ethernet_interface);
          const observed = originalNodes
            ?.find((item) => item.hostname === node.hostname)
            ?.interface_list?.find(
              (item) =>
                object17(item.ethernet_interface).mac === ethernet.mac &&
                object17(item.ethernet_interface).device === ethernet.device,
            );
          for (const field of ['is_primary', 'is_management'])
            if (typeof observed?.[field] === 'boolean') iface[field] = observed[field];
        }
    }
    this.validateObservedSiteReplace(snapshot, request);
    return request;
  }
  validateObservedSiteReplace(snapshot, request) {
    if (
      object17(snapshot.metadata).name !== object17(request.metadata).name ||
      object17(snapshot.metadata).namespace !== object17(request.metadata).namespace ||
      !snapshot.resource_version ||
      request.resource_version !== snapshot.resource_version
    )
      throw new Error('Replacement snapshot identity or resource version differs');
    for (const provider of ['aws', 'azure']) {
      const before = object17(snapshot.spec)[provider];
      const after = object17(request.spec)[provider];
      if (!before && !after) continue;
      if (!before || !after) throw new Error('Replacement provider identity differs');
      const original = object17(before.not_managed ?? {}).node_list;
      const nodes = object17(after.not_managed ?? {}).node_list;
      for (const node of nodes ?? [])
        for (const iface of node.interface_list) {
          const ethernet = object17(iface.ethernet_interface);
          const observed = original
            ?.find((item) => item.hostname === node.hostname)
            ?.interface_list?.find(
              (item) =>
                object17(item.ethernet_interface).mac === ethernet.mac &&
                object17(item.ethernet_interface).device === ethernet.device,
            );
          if (!observed) throw new Error('Replacement physical interface identity differs');
          for (const field of ['is_primary', 'is_management'])
            if (iface[field] !== observed[field]) throw new Error('Observed interface identity flags changed');
        }
    }
    createWireValidator(
      this.#schemas,
      'securemesh_site_v2ReplaceRequest',
      object17(snapshot.spec).aws !== undefined || object17(snapshot.spec).azure !== undefined,
    )(request);
  }
  validateSiteReplace(request) {
    createWireValidator(this.#schemas, 'securemesh_site_v2ReplaceRequest')(request);
  }
  provider(name) {
    return structuredClone(object17(object17(this.#contract.providers)[name]));
  }
  bootstrapQuery(name) {
    const provider = object17(object17(this.#contract.providers)[name]);
    const bootstrap = object17(provider.bootstrap);
    if (
      bootstrap.mode !== 'site_bound_jwt_cloud_init' ||
      bootstrap.headless_checkout !== 'available' ||
      bootstrap.schema_support !== 'available' ||
      !bootstrap.cloud_init ||
      typeof bootstrap.cloud_init !== 'object' ||
      Array.isArray(bootstrap.cloud_init)
    )
      throw new Error(`Verified ${name} headless bootstrap capability is unavailable`);
    const cloudInit = object17(bootstrap.cloud_init);
    const query = object17(cloudInit.query_fields);
    if (
      cloudInit.method !== 'GET' ||
      cloudInit.path !== '/api/register/namespaces/system/get-cloud-init-config' ||
      query.provider !== name ||
      query.site_name !== 'site_name' ||
      query.enable_management_network !== false ||
      cloudInit.response_path !== 'cloud_init_config' ||
      cloudInit.sensitive !== true
    )
      throw new Error(`Verified ${name} bootstrap mapping is unsupported`);
    return { provider: name, enableManagementNetwork: false };
  }
  get api() {
    return structuredClone(object17(this.#contract.api));
  }
}
var hash3 = (bytes) => `sha256:${createHash6('sha256').update(bytes).digest('hex')}`,
  commitPattern,
  digestPattern,
  publishedAssets,
  publishedBase = 'https://github.com/f5-sales-demo/api-specs-enriched/releases/download/v12.0.9';
var init_verified_contract = __esm(() => {
  init_release_contract();
  init_verified_api_release();
  init_wire_routing();
  init_wire_schema();
  init_wire_site();
  commitPattern = /^[0-9a-f]{40}$/;
  digestPattern = /^sha256:[0-9a-f]{64}$/;
  publishedAssets = Object.freeze({
    'smsv2-contract.json': 'sha256:2dd4d33693c9e228bfb304d7558a2f50ca9cc0146407f8fb9b5f0ca7d7c56f3c',
    'smsv2-contract-manifest.json': 'sha256:3adcfb6462a887a0f65198ed392c742fbc2ab9ba9df1cac33f36e5fe54fd6662',
    'smsv2-evidence-receipt.json': 'sha256:e9bd60f46acd2a003010cbf20d0581af364cce0486f8a7eefc9eb85562ab0bff',
  });
});

// plugins/platform/src/ce/service.ts
import { readdir, readFile as readFile3 } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join as join4 } from 'node:path';

function credentials(url, credential) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new CeContextFailure('Invalid F5 context URL');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password)
    throw new CeContextFailure('F5 context must use credential-free HTTPS');
  return { url, credential };
}
async function context(env, contextName) {
  if (contextName) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/.test(contextName)) throw new CeContextFailure('Invalid F5 context name');
    const directory = join4(env.XDG_CONFIG_HOME ?? join4(homedir(), '.config'), 'xcsh', 'contexts');
    let parsed;
    try {
      parsed = JSON.parse(await readFile3(join4(directory, `${contextName}.json`), 'utf8'));
    } catch {
      throw new CeContextFailure('F5 context is unavailable');
    }
    if (typeof parsed.apiUrl !== 'string' || typeof parsed.apiToken !== 'string' || !parsed.apiToken)
      throw new CeContextFailure('F5 context has no supported API credential');
    return credentials(parsed.apiUrl, parsed.apiToken);
  }
  const url = env.XCSH_API_URL;
  const credential = env.XCSH_API_TOKEN;
  if (!url || !credential) throw new CeContextFailure('Select an F5 context or provide its scoped API environment');
  return credentials(url, credential);
}
function createCePlatformService(
  env = process.env,
  loadPublishedContract = () => VerifiedCeContract.published(),
  resourceMutation,
) {
  const environment = () => (typeof env === 'function' ? env() : env);
  let loaded;
  const contract = () => {
    if (!loaded)
      loaded = loadPublishedContract().catch((error) => {
        loaded = undefined;
        throw error;
      });
    return loaded;
  };
  const root = () =>
    environment().XCSH_CE_DEPLOYMENTS_DIR ??
    join4(environment().XDG_STATE_HOME ?? join4(homedir(), '.local', 'state'), 'xcsh', 'ce-deployments');
  const storage = (owner) => CeDeploymentStore.open(root(), owner);
  return {
    async providerEnvironment(contextName) {
      const credentials = await context(environment(), contextName);
      return { XCSH_API_URL: credentials.url, XCSH_API_TOKEN: credentials.credential };
    },
    storage,
    async siteBinding(siteName, contextName) {
      if (!/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(siteName)) throw new Error('Invalid site identity');
      const origin = new URL((await context(environment(), contextName)).url).origin;
      const records = [];
      for (const item of await readdir(root(), { withFileTypes: true })) {
        if (!item.isDirectory() || !/^[a-f0-9]{64}$/.test(item.name)) continue;
        const manifest = JSON.parse(await readFile3(join4(root(), item.name, 'owner.json'), 'utf8'));
        const store = await storage(manifest.owner);
        if (store.directory !== join4(root(), item.name)) throw new Error('Stored owner directory differs');
        let record;
        try {
          record = await store.read(`site-binding-${siteName}.json`);
        } catch (error) {
          if (error.code === 'ENOENT') continue;
          throw error;
        }
        if (
          record.schemaVersion !== 1 ||
          record.binding.siteName !== siteName ||
          JSON.stringify(record.binding.owner) !== JSON.stringify(store.owner) ||
          !record.siteUid ||
          !Array.isArray(record.expectedInterfaces)
        )
          throw new Error('Stored site binding is malformed');
        if (record.tenantOrigin === origin) records.push(record);
      }
      if (records.length !== 1) throw new Error('Site binding is missing or ambiguous');
      return records[0];
    },
    async capabilities(contextName) {
      const credentials = await context(environment(), contextName);
      const artifact = await contract();
      const origin = new URL(credentials.url).origin;
      if (!origin.startsWith('https://')) throw new Error('F5 context must use HTTPS');
      const aws = artifact.provider('aws');
      const capabilities = aws.capabilities;
      const azureRouteServerEbgpMultihop = artifact.azureRouteServerEbgpMultihop();
      return {
        contractIdentity: 'f5xc-smsv2-api/v1@12.0.9',
        smsv2ContractVersion: 'v2',
        supportedProviders: ['aws', 'azure'],
        bootstrapDrivers: ['api'],
        ...(artifact.kvmImageResolution ? { kvmImageResolution: structuredClone(artifact.kvmImageResolution) } : {}),
        providerNetworkingProfiles: {
          aws: ['direct-eni', 'nlb-ingress', 'tgw-static', 'tgw-connect'],
          azure: ['direct-nic', 'load-balancer-ingress', 'route-server-bgp'],
        },
        awsSmsv2TgwConnect: {
          supported: capabilities.tgw_connect === 'available',
          schemaVersion: 'f5xc-smsv2-aws-tgw-telemetry/v2',
        },
        azureRouteServerEbgpMultihop,
        source: 'verified-api-contract',
        contractFingerprint: artifact.fingerprint,
        contractCommit: artifact.commit,
        publication: artifact.publication,
        tenantOrigin: origin,
        ...(contextName ? { platformContext: contextName } : {}),
        liveAcceptance: 'not-established',
      };
    },
    async runtime(engine, contextName) {
      const credentials = await context(environment(), contextName);
      const artifact = await contract();
      return new CeRuntime(
        artifact,
        engine,
        credentials.url,
        credentials.credential,
        fetch,
        engine === 'terraform' ? resourceMutation?.(contextName, new URL(credentials.url).origin) : undefined,
        async (binding, siteUid, expected) => {
          const store = await storage(binding.owner);
          const name = `site-binding-${binding.siteName}.json`;
          let prior;
          try {
            prior = await store.read(name);
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
          }
          const retained =
            prior?.siteUid === siteUid &&
            prior.contractFingerprint === artifact.fingerprint &&
            prior.tenantOrigin === new URL(credentials.url).origin
              ? prior.expectedInterfaces
              : [];
          await store.write(name, {
            schemaVersion: 1,
            tenantOrigin: new URL(credentials.url).origin,
            contractFingerprint: artifact.fingerprint,
            siteUid,
            binding: structuredClone(binding),
            expectedInterfaces: structuredClone(expected ?? retained),
          });
        },
      );
    },
  };
}
function registerCePlatformService(bus, service) {
  return bus.on(CE_SERVICE_CHANNEL, (data) => {
    if (!data || typeof data !== 'object') return;
    const request = data;
    if (request.version === 2 && typeof request.resolve === 'function') request.resolve(service);
  });
}
function requestTerraformResourceMutation(bus, contextName, tenantOrigin) {
  return (owner, path, init, signal) =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      const timeout = AbortSignal.timeout(15 * 60000);
      const operationSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
      const abort = () => {
        clearTimeout(timer);
        reject(operationSignal.reason ?? new Error('Terraform resource mutation cancelled'));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', abort);
        reject(new Error('Terraform resource mutation outcome is unknown'));
      }, 15 * 60000);
      signal?.addEventListener('abort', abort, { once: true });
      const finish = (result) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        if (result instanceof Error) reject(result);
        else resolve(result);
      };
      bus.emit(CE_TERRAFORM_RESOURCE_CHANNEL, {
        owner,
        path,
        init,
        contextName,
        tenantOrigin,
        signal: operationSignal,
        resolve: finish,
        reject: finish,
      });
    });
}
var CE_SERVICE_CHANNEL = 'xcsh:ce-platform:v2:service',
  CE_TERRAFORM_RESOURCE_CHANNEL = 'xcsh:ce-terraform:v1:resource-mutation',
  CeContextFailure;
var init_service = __esm(() => {
  init_deployment_store();
  init_runtime();
  init_verified_contract();
  CeContextFailure = class CeContextFailure extends Error {
    category = 'context';
  };
});

// plugins/platform/src/ce/security.ts
function containsControlCharacters(value) {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}
function assertSafeName(value, label) {
  if (!SAFE_NAME.test(value))
    throw new PublicCeError(`${label} must contain only letters, numbers, dots, underscores, and hyphens`);
}
function assertSecretFree(value, path = 'config') {
  if (typeof value === 'string') {
    if (containsControlCharacters(value)) throw new PublicCeError(`${path} contains control characters`);
    if (SENSITIVE_VALUE.test(value)) throw new PublicCeError(`${path} contains credential-shaped data`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertSecretFree(item, `${path}[${index}]`);
    });
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) throw new PublicCeError(`${path}.${key} is not allowed in a secret-free CE plan`);
    assertSecretFree(item, `${path}.${key}`);
  }
}
function publicFailure(error, fallback) {
  return error instanceof PublicCeError ? error.message : fallback;
}
var SAFE_NAME, FORBIDDEN_KEY, SENSITIVE_VALUE, PublicCeError;
var init_security = __esm(() => {
  SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/;
  FORBIDDEN_KEY = /(?:^|_)(?:token|secret|password|credential|private_?key|custom_?data|user_?data)(?:$|_)/i;
  SENSITIVE_VALUE = /(?:APIToken|Bearer)\s+\S+|f5xc-ce:\/\//i;
  PublicCeError = class PublicCeError extends Error {};
});

// plugins/platform/src/tools/f5xc-ce-v2-site.ts
import { createHash as createHash7, timingSafeEqual } from 'node:crypto';

function canonical5(value) {
  if (Array.isArray(value)) return `[${value.map(canonical5).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical5(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function createSitePlan(request, tenantOrigin) {
  assertSafeName(request.siteName, 'siteName');
  if (request.namespace !== 'system' || request.binding?.siteName !== request.siteName)
    throw new PublicCeError('The exact system-namespace deployment binding is required');
  assertSecretFree(request);
  if (['create', 'update'].includes(request.action) && !request.config)
    throw new PublicCeError('A schema-valid site intent with resolved node interfaces is required');
  if (['update', 'delete'].includes(request.action) && !request.expectedUid)
    throw new PublicCeError('The exact existing site UID is required');
  if (request.action === 'update' && !request.expectedResourceVersion)
    throw new PublicCeError('The exact existing resource version is required');
  const { planSha256: _hash, ...params } = request;
  const draft = { schemaVersion: 3, ...params, tenantOrigin };
  const planSha256 = createHash7('sha256').update(canonical5(draft)).digest('hex');
  return { ...draft, planId: `f5xc-ce-v2-${planSha256.slice(0, 24)}`, planSha256 };
}
function ceBindingSchema(pi) {
  const { Type } = pi.typebox;
  return Type.Object({
    owner: Type.Object({
      deploymentId: Type.String(),
      engine: Type.Union([Type.Literal('native'), Type.Literal('terraform')]),
      provider: Type.Union([Type.Literal('aws'), Type.Literal('azure')]),
      account: Type.String(),
      region: Type.String(),
    }),
    siteName: Type.String(),
    nodes: Type.Array(Type.String()),
  });
}
function createF5xcCeV2SiteTool(pi, makeService = () => createCePlatformService()) {
  const { Type } = pi.typebox;
  return {
    name: 'f5xc_ce_v2_site',
    label: 'F5 Secure Mesh Site v2',
    description:
      'Plan and execute owned CE site operations through the native or Terraform lifecycle service. Creation and replacement require resolved MAC/device interfaces and an exact tenant-bound plan hash.',
    parameters: Type.Object({
      action: Type.Union(['create', 'read', 'update', 'delete'].map((v) => Type.Literal(v))),
      namespace: Type.String(),
      siteName: Type.String(),
      binding: ceBindingSchema(pi),
      config: Type.Optional(
        Type.Object({
          schemaVersion: Type.Literal(2),
          provider: Type.Union([Type.Literal('aws'), Type.Literal('azure')]),
          haMode: Type.Union([Type.Literal('one-node'), Type.Literal('three-node')]),
          nodes: Type.Array(Type.Object({ hostname: Type.String(), interfaces: Type.Array(Type.Unknown()) })),
          settings: Type.Unknown(),
        }),
      ),
      expectedUid: Type.Optional(Type.String()),
      expectedResourceVersion: Type.Optional(Type.String()),
      platformContext: Type.Optional(Type.String()),
      planSha256: Type.Optional(Type.String()),
    }),
    async execute(_id, params, signal, _update, ctx) {
      try {
        const service = makeService(ctx);
        const capability = await service.capabilities(params.platformContext);
        const plan = createSitePlan(params, capability.tenantOrigin);
        const runtime = await service.runtime(params.binding.owner.engine, params.platformContext);
        if (params.config) runtime.contract.buildSite(params.config);
        if (params.action === 'read') {
          const site = await runtime.observeOwnedSite(params.binding, signal);
          return {
            content: [{ type: 'text', text: `Read ${params.siteName}.` }],
            details: {
              tool: 'f5xc_ce_v2_site',
              siteUid: site.system_metadata.uid,
              resourceVersion: site.resource_version,
            },
          };
        }
        if (!params.planSha256) {
          const artifactId = await ctx.sessionManager.saveArtifact(
            JSON.stringify({ kind: 'f5xc-ce-v2-site-plan', plan }),
            'f5xc-ce-v2-site-plan',
          );
          return {
            content: [
              {
                type: 'text',
                text: `Site plan: ${plan.planId}
SHA-256: ${plan.planSha256}`,
              },
            ],
            details: { tool: 'f5xc_ce_v2_site', plan, artifactId },
          };
        }
        if (
          !/^[a-f0-9]{64}$/.test(params.planSha256) ||
          !timingSafeEqual(Buffer.from(params.planSha256, 'hex'), Buffer.from(plan.planSha256, 'hex'))
        )
          throw new PublicCeError('Site plan SHA-256 does not match the canonical request and tenant');
        if (!ctx.hasUI && process.env.XCSH_CE_HEADLESS_MUTATIONS !== '1')
          throw new PublicCeError('Headless mutation requires XCSH_CE_HEADLESS_MUTATIONS=1');
        if (params.action === 'delete' && !ctx.hasUI && process.env.XCSH_CE_ALLOW_DESTROY !== '1')
          throw new PublicCeError('Headless deletion requires XCSH_CE_ALLOW_DESTROY=1');
        if (
          ctx.hasUI &&
          !(await ctx.ui.confirm(
            `${params.action} Secure Mesh Site v2`,
            `${plan.planId}
${plan.planSha256}`,
          ))
        )
          throw new PublicCeError('Site mutation was not approved');
        const store = await service.storage(params.binding.owner);
        const checkpoint = (record) =>
          store.write(`public-site-${params.siteName}.json`, { planId: plan.planId, record });
        if (params.action === 'create') {
          if (!params.config) throw new PublicCeError('Site intent is required');
          await runtime.ensureSite(params.binding, params.config, checkpoint, signal);
        } else if (params.action === 'update') {
          if (!params.config || !params.expectedUid || !params.expectedResourceVersion)
            throw new PublicCeError('Exact replacement identity is required');
          await runtime.replaceSite(
            params.binding,
            params.config,
            { uid: params.expectedUid, resourceVersion: params.expectedResourceVersion },
            checkpoint,
            signal,
          );
        } else {
          if (!params.expectedUid) throw new PublicCeError('Exact deletion UID is required');
          await runtime.deleteSiteExact(params.binding, params.expectedUid, signal);
        }
        return {
          content: [{ type: 'text', text: `${params.action} completed for ${params.siteName}.` }],
          details: { tool: 'f5xc_ce_v2_site', planId: plan.planId },
        };
      } catch (error) {
        signal?.throwIfAborted();
        return {
          content: [
            {
              type: 'text',
              text: `CE site operation failed: ${publicFailure(error, 'the owned lifecycle operation was rejected')}`,
            },
          ],
          isError: true,
          details: { tool: 'f5xc_ce_v2_site' },
        };
      }
    },
  };
}
var init_f5xc_ce_v2_site = __esm(() => {
  init_security();
  init_service();
});

// plugins/platform/src/ce/token-store.ts
import { createHash as createHash8, randomUUID as randomUUID3 } from 'node:crypto';
import { chmod as chmod2, mkdir as mkdir3, writeFile as writeFile3 } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute as isAbsolute2, join as join5, resolve, sep } from 'node:path';

function defaultBootstrapRoot() {
  return join5(tmpdir(), 'xcsh-f5xc-ce');
}
function assertWithin(root, target) {
  const base = resolve(root);
  const candidate = resolve(target);
  if (candidate !== base && !candidate.startsWith(`${base}${sep}`))
    throw new Error('Bootstrap path escapes the secure root');
}
async function storeBootstrapToken(input) {
  const root = input.root ?? defaultBootstrapRoot();
  if (!isAbsolute2(root)) throw new Error('Bootstrap root must be absolute');
  if (!SAFE_ID.test(input.sessionId)) throw new Error('Invalid session identifier for bootstrap storage');
  if (!input.token || Array.from(input.token).some((character) => [0, 10, 13].includes(character.charCodeAt(0))))
    throw new Error('Bootstrap token is empty or malformed');
  if (!Number.isInteger(input.expiresInSeconds) || input.expiresInSeconds < 1 || input.expiresInSeconds > 900)
    throw new Error('Bootstrap expiry must be between 1 and 900 seconds');
  const id = randomUUID3();
  const sessionDir = join5(root, input.sessionId);
  const itemDir = join5(sessionDir, id);
  for (const target of [sessionDir, itemDir]) assertWithin(root, target);
  await mkdir3(root, { recursive: true, mode: 448 });
  await chmod2(root, 448);
  await mkdir3(sessionDir, { recursive: true, mode: 448 });
  await chmod2(sessionDir, 448);
  await mkdir3(itemDir, { mode: 448 });
  const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000).toISOString();
  const digest = createHash8('sha256').update(input.token, 'utf8').digest('hex');
  const metadata = {
    version: 1,
    session: input.sessionId,
    id,
    uid: typeof process.getuid === 'function' ? process.getuid() : null,
    digest,
    expiresAt,
    consumed: false,
  };
  await writeFile3(join5(itemDir, 'token'), input.token, { mode: 384, flag: 'wx' });
  await writeFile3(join5(itemDir, 'metadata.json'), JSON.stringify(metadata), { mode: 384, flag: 'wx' });
  return { reference: `f5xc-ce://${input.sessionId}/${id}`, expiresAt };
}
var SAFE_ID;
var init_token_store = __esm(() => {
  SAFE_ID = /^[a-zA-Z0-9._-]{1,128}$/;
});

// plugins/platform/src/tools/f5xc-ce-v2-bootstrap.ts
import { randomUUID as randomUUID4 } from 'node:crypto';

function createF5xcCeV2BootstrapTool(pi, makeService = () => createCePlatformService(), root = defaultBootstrapRoot()) {
  const { Type } = pi.typebox;
  return {
    name: 'f5xc_ce_v2_bootstrap',
    label: 'Checkout CE v2 Bootstrap',
    description:
      'Issue verified site-bound bootstrap through the API in interactive or headless execution, returning a short-lived, one-use local reference. The upstream token remains privately tracked for coordinated revocation.',
    parameters: Type.Object({
      namespace: Type.String(),
      siteName: Type.String(),
      nodeName: Type.String(),
      expiresInSeconds: Type.Number({ minimum: 1, maximum: 900 }),
      platformContext: Type.Optional(Type.String()),
    }),
    async execute(_id, params, signal, _update, ctx) {
      try {
        assertSafeName(params.siteName, 'siteName');
        assertSafeName(params.nodeName, 'nodeName');
        if (
          params.namespace !== 'system' ||
          !Number.isInteger(params.expiresInSeconds) ||
          params.expiresInSeconds < 1 ||
          params.expiresInSeconds > 900
        )
          throw new PublicCeError('A system-namespace site and expiry of 1 to 900 seconds are required');
        if (!ctx.hasUI && process.env.XCSH_CE_HEADLESS_MUTATIONS !== '1')
          throw new PublicCeError('Headless bootstrap requires XCSH_CE_HEADLESS_MUTATIONS=1');
        const service = makeService(ctx);
        const known = await service.siteBinding?.(params.siteName, params.platformContext);
        if (!known || !known.binding.nodes.includes(params.nodeName))
          throw new PublicCeError('A trusted deployment and node binding is required');
        const runtime = await service.runtime(known.binding.owner.engine, params.platformContext);
        if (runtime.contract.fingerprint !== known.contractFingerprint)
          throw new PublicCeError('Deployment contract binding requires refresh');
        const site = await runtime.observeOwnedSite(known.binding, signal);
        if (site.system_metadata.uid !== known.siteUid)
          throw new PublicCeError('Deployment site UID changed; refresh bindings');
        if (ctx.hasUI && !(await ctx.ui.confirm('Checkout CE bootstrap', `${params.siteName}/${params.nodeName}`)))
          throw new PublicCeError('Bootstrap checkout was not approved');
        const store = await service.storage(known.binding.owner);
        const tokenName = `${params.siteName.slice(0, 40)}-bt-${randomUUID4().slice(0, 8)}`;
        let jwt;
        await runtime.bootstrap(
          known.binding,
          params.nodeName,
          tokenName,
          async (secret) => {
            await store.write(`${tokenName}.json`, secret);
            jwt = secret.jwt;
          },
          signal,
        );
        if (!jwt) throw new PublicCeError('Issued bootstrap token was not checkpointed');
        const claims = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
        const lifetime = Math.min(params.expiresInSeconds, Math.floor((claims.exp * 1000 - Date.now()) / 1000));
        const stored = await storeBootstrapToken({
          sessionId: ctx.sessionManager.getSessionId(),
          token: jwt,
          expiresInSeconds: lifetime,
          root,
        });
        return {
          content: [
            {
              type: 'text',
              text: `Bootstrap reference: ${stored.reference}
Expires: ${stored.expiresAt}`,
            },
          ],
          details: { tool: 'f5xc_ce_v2_bootstrap', ...stored },
        };
      } catch (error) {
        signal?.throwIfAborted();
        return {
          content: [
            {
              type: 'text',
              text: `CE bootstrap failed: ${publicFailure(error, 'the owned API checkout was rejected')}`,
            },
          ],
          isError: true,
          details: { tool: 'f5xc_ce_v2_bootstrap' },
        };
      }
    },
  };
}
var init_f5xc_ce_v2_bootstrap = __esm(() => {
  init_security();
  init_service();
  init_token_store();
});

// plugins/platform/src/tools/f5xc-ce-v2-status.ts
function createF5xcCeV2StatusTool(pi, makeService = () => createCePlatformService()) {
  const { Type } = pi.typebox;
  return {
    name: 'f5xc_ce_v2_status',
    label: 'F5 CE v2 Status',
    description:
      'Observe interfaces using the active tenant and trusted deployment/MAC bindings. Explicit down differs from unavailable evidence. Fetch time is not a CE heartbeat timestamp.',
    parameters: Type.Object({
      namespace: Type.String(),
      siteName: Type.String(),
      platformContext: Type.Optional(Type.String()),
    }),
    async execute(_id, params, signal, _update, ctx) {
      const reason = 'binding-or-evidence-unavailable';
      try {
        if (params.namespace !== 'system') throw new Error('namespace');
        const service = makeService(ctx);
        const known = await service.siteBinding?.(params.siteName, params.platformContext);
        if (!known || !known.expectedInterfaces.length) throw new Error('missing binding');
        const runtime = await service.runtime(known.binding.owner.engine, params.platformContext);
        if (runtime.contract.fingerprint !== known.contractFingerprint) throw new Error('stale binding');
        const site = await runtime.observeOwnedSite(known.binding, signal);
        if (site.system_metadata.uid !== known.siteUid) throw new Error('rebuilt site');
        const spec = site.spec;
        const nodes = spec[known.binding.owner.provider].not_managed.node_list;
        if (
          !Array.isArray(nodes) ||
          nodes.length !== known.binding.nodes.length ||
          nodes.some((node) => !known.binding.nodes.includes(node.hostname) || !Array.isArray(node.interface_list)) ||
          nodes.reduce((count, node) => count + node.interface_list.length, 0) !== known.expectedInterfaces.length
        )
          throw new Error('incomplete interface bindings');
        const evidence =
          known.binding.owner.provider === 'aws'
            ? await runtime.observeAwsInterfaces(known.binding, known.expectedInterfaces, signal)
            : await runtime.observeAzureInterfaces(known.binding, known.expectedInterfaces, signal);
        return {
          content: [
            {
              type: 'text',
              text: `CE ${params.siteName} interfaces: ${evidence.status}. CE sample age remains unqualified.`,
            },
          ],
          details: {
            tool: 'f5xc_ce_v2_status',
            status: evidence.status,
            siteUid: known.siteUid,
            interfaces: evidence.interfaces,
            fetchedAt: evidence.observedAt,
            ceSampleAge: 'unknown',
            freshnessQualification: 'pending-1930',
            canSatisfyMutationGate: false,
          },
        };
      } catch {
        signal?.throwIfAborted();
      }
      return {
        content: [
          {
            type: 'text',
            text: `CE ${params.siteName} interface observations are unknown; verify context and deployment bindings.`,
          },
        ],
        details: {
          tool: 'f5xc_ce_v2_status',
          status: 'unknown',
          reason,
          interfaces: [],
          canSatisfyMutationGate: false,
        },
      };
    },
  };
}
var init_f5xc_ce_v2_status = __esm(() => {
  init_service();
});

// plugins/platform/src/tools/f5xc-ce-v2-capabilities.ts
function createF5xcCeV2CapabilitiesTool(pi, makeService = () => createCePlatformService()) {
  const { Type } = pi.typebox;
  return {
    name: 'f5xc_ce_v2_capabilities',
    label: 'F5 CE v2 Capabilities',
    description:
      'Return non-secret Secure Mesh Site v2 contract, provider, bootstrap-driver, networking-profile, AWS TGW Connect, and KVM Site UID image resolution evidence.',
    parameters: Type.Object({ platformContext: Type.Optional(Type.String()) }),
    async execute(_id, _params, _signal, _update, ctx) {
      try {
        const capabilities = await makeService(ctx).capabilities(_params.platformContext);
        return {
          content: [
            {
              type: 'text',
              text: `Secure Mesh Site v2 ${capabilities.smsv2ContractVersion}; providers: ${capabilities.supportedProviders.join(', ')}; AWS TGW Connect: ${capabilities.awsSmsv2TgwConnect.supported ? capabilities.awsSmsv2TgwConnect.schemaVersion : 'unsupported'}.`,
            },
          ],
          details: { tool: 'f5xc_ce_v2_capabilities', capabilities },
        };
      } catch (error) {
        const category =
          error instanceof ReleaseContractFailure ||
          error instanceof CeContextFailure ||
          error instanceof CeContractFailure
            ? error.category
            : 'unexpected';
        return {
          content: [
            {
              type: 'text',
              text: `Secure Mesh Site v2 capabilities failed (${category}).`,
            },
          ],
          isError: true,
          details: { tool: 'f5xc_ce_v2_capabilities', failure: { category } },
        };
      }
    },
  };
}
var init_f5xc_ce_v2_capabilities = __esm(() => {
  init_release_contract();
  init_service();
  init_verified_api_release();
});

// plugins/platform/src/index.ts
init_service();

// plugins/platform/src/presentation.ts
var record = (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {});
var rows = (v) => Array.isArray(v) && v.every((x) => x !== null && typeof x === 'object' && !Array.isArray(x));
var strings = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
var fields = (values, title) => ({
  kind: 'fields',
  title,
  values,
  previewFields: 'all',
});
function validConfig(value) {
  const c = record(value);
  return (
    typeof c.provider === 'string' &&
    typeof c.haMode === 'string' &&
    rows(c.vrfs) &&
    c.vrfs.every((v) => typeof v.name === 'string' && typeof v.index === 'number') &&
    rows(c.interfaces) &&
    c.interfaces.every(
      (n) =>
        typeof n.index === 'number' &&
        typeof n.role === 'string' &&
        typeof n.vrf === 'string' &&
        typeof record(n.addressing).mode === 'string' &&
        strings(record(n.addressing).addresses),
    ) &&
    rows(c.bgpPeers) &&
    typeof record(c.providerNetwork).profile === 'string'
  );
}
function presentTool(tool, p) {
  const scope = (input) => {
    const labels = {
      action: 'Operation',
      namespace: 'Namespace',
      siteName: 'Site',
      nodeName: 'Node',
      expiresInSeconds: 'Requested lifetime (seconds)',
      expectedEtag: 'Expected ETag',
      planSha256: 'Approved plan SHA-256',
    };
    const values = Object.fromEntries(
      Object.entries(record(input))
        .filter(([k]) => k in labels)
        .map(([k, v]) => [labels[k], v]),
    );
    return Object.keys(values).length ? [fields(values, 'Scope')] : [];
  };
  const table = (items, columns, title) => ({ ...p.table(items, columns, title), previewRows: 12 });
  const network = (c) => [
    fields(
      {
        Provider: c.provider,
        'HA mode': c.haMode,
        'Network profile': record(c.providerNetwork).profile,
        VRFs: c.vrfs.length,
        Interfaces: c.interfaces.length,
        'BGP peers': c.bgpPeers.length,
      },
      'Network summary',
    ),
    table(
      c.vrfs,
      [
        { key: 'index', label: 'Index' },
        { key: 'name', label: 'VRF' },
      ],
      'VRFs',
    ),
    table(
      c.interfaces.map((n) => ({
        index: n.index,
        role: n.role,
        vrf: n.vrf,
        addressingMode: record(n.addressing).mode,
        addresses: record(n.addressing).addresses,
        gateway: record(n.addressing).gateway,
      })),
      [
        { key: 'index', label: 'Index' },
        { key: 'role', label: 'Role' },
        { key: 'vrf', label: 'VRF' },
        { key: 'addressingMode', label: 'Addressing mode' },
        { key: 'addresses', label: 'Addresses' },
        { key: 'gateway', label: 'Gateway' },
      ],
      'Interfaces',
    ),
    table(
      c.bgpPeers,
      [
        { key: 'index', label: 'Index' },
        { key: 'vrf', label: 'VRF' },
        { key: 'interfaceIndex', label: 'Interface index' },
        { key: 'peerAddress', label: 'Peer address' },
        { key: 'localAsn', label: 'Local ASN' },
        { key: 'peerAsn', label: 'Peer ASN' },
      ],
      'BGP peers',
    ),
    ...(Object.keys(record(record(c.providerNetwork).metadata)).length
      ? [fields(record(record(c.providerNetwork).metadata), 'Provider network metadata')]
      : []),
  ];
  return p.withPresentation(tool, {
    call: (input, options) => ({
      summary: tool.label ?? tool.name,
      sections: options.expanded ? p.data(input, 'Complete request') : scope(input),
    }),
    result: (result, options, input) => {
      const d = record(result.details),
        base = scope(input);
      const texts = result.content
        .filter((b) => b.type === 'text')
        .map((b) => ({
          kind: 'code',
          title: result.isError ? 'Complete corrective guidance' : 'Guidance',
          text: b.text ?? '',
        }));
      if (result.isError)
        return {
          summary: 'Platform operation failed',
          sections: [...base, ...p.data(d, 'Failure evidence'), ...texts],
        };
      const complete = (summary, sections, warnings = []) => ({
        summary,
        expandedEvidence: 'provided',
        sections: [
          ...base,
          ...(options.expanded
            ? p.data(
                typeof d.artifactId === 'string' && d.artifactId
                  ? { ...d, artifactId: `artifact://${d.artifactId}` }
                  : d,
                'Complete safe evidence',
              )
            : sections),
        ],
        warnings,
      });
      const c = record(d.capabilities),
        tgw = record(c.awsSmsv2TgwConnect),
        kvm = record(c.kvmImageResolution);
      if (
        tool.name === 'f5xc_ce_v2_capabilities' &&
        typeof c.smsv2ContractVersion === 'string' &&
        strings(c.supportedProviders) &&
        strings(c.bootstrapDrivers) &&
        Object.values(record(c.providerNetworkingProfiles)).every(strings) &&
        typeof tgw.supported === 'boolean' &&
        typeof kvm.id === 'string'
      ) {
        return complete(
          'Secure Mesh Site v2 capabilities',
          [
            fields(
              {
                Contract: c.smsv2ContractVersion,
                Providers: c.supportedProviders,
                'Bootstrap drivers': c.bootstrapDrivers,
                'AWS TGW Connect supported': tgw.supported,
                'AWS TGW Connect schema': tgw.schemaVersion,
              },
              'Capability summary',
            ),
            table(
              Object.entries(record(c.providerNetworkingProfiles)).flatMap(([provider, profiles]) =>
                profiles.map((profile) => ({ provider, profile })),
              ),
              [
                { key: 'provider', label: 'Provider' },
                { key: 'profile', label: 'Networking profile' },
              ],
              'Networking profiles',
            ),
            fields({ ID: kvm.id, Endpoint: kvm.endpoint, Operation: kvm.operation }, 'KVM image resolution'),
          ],
          ['Capabilities do not establish site runtime health or authorize bootstrap checkout.'],
        );
      }
      const plan = record(d.plan);
      if (
        tool.name === 'f5xc_ce_v2_site' &&
        plan.schemaVersion === 2 &&
        typeof plan.planId === 'string' &&
        typeof plan.planSha256 === 'string' &&
        /^[a-f0-9]{64}$/.test(plan.planSha256) &&
        ['create', 'update', 'delete'].includes(String(plan.action)) &&
        (plan.config === null || validConfig(plan.config))
      ) {
        return complete(
          'Secure Mesh Site v2 plan',
          [
            fields(
              {
                Operation: plan.action,
                Site: plan.siteName,
                Namespace: plan.namespace,
                'Plan ID': plan.planId,
                'Plan SHA-256': plan.planSha256,
                Artifact:
                  typeof d.artifactId === 'string' && d.artifactId
                    ? `artifact://${d.artifactId}`
                    : 'session memory only',
                'Expected ETag': plan.expectedEtag,
                Mutation: 'not attempted',
              },
              'Site plan',
            ),
            ...(plan.config === null ? [] : network(record(plan.config))),
          ],
          ['A plan does not establish approval or an applied mutation.'],
        );
      }
      const site = record(d.site),
        config = record(site.spec),
        metadata = record(site.metadata);
      if (tool.name === 'f5xc_ce_v2_site' && validConfig(config)) {
        return complete(
          'Secure Mesh Site v2 configuration',
          [
            fields(
              {
                Site: metadata.name ?? record(input).siteName,
                Namespace: metadata.namespace ?? record(input).namespace,
                ETag: site.etag ?? 'unknown',
                Provider: config.provider,
                'HA mode': config.haMode,
                ...(d.planId !== undefined ? { 'Applied plan ID': d.planId } : {}),
              },
              'Site identity',
            ),
            ...network(config),
          ],
          ['Configuration evidence does not establish site runtime health.'],
        );
      }
      if (
        tool.name === 'f5xc_ce_v2_bootstrap' &&
        typeof d.reference === 'string' &&
        d.reference.startsWith('f5xc-ce://') &&
        (typeof d.expiresAt === 'number' || typeof d.expiresAt === 'string')
      ) {
        return complete('Session-bound bootstrap reference', [
          fields({ Reference: d.reference, 'Expires at': d.expiresAt }, 'Bootstrap reference'),
        ]);
      }
      if (tool.name === 'f5xc_ce_v2_status' && d.capability === 'unavailable' && d.reason === 'runtime_status') {
        return {
          summary: 'Secure Mesh Site v2 telemetry unavailable',
          sections: [
            ...base,
            fields({ Availability: d.capability, Reason: d.reason, Health: 'unknown' }, 'Telemetry availability'),
            ...(options.expanded ? p.data(d, 'Availability evidence') : []),
            ...texts,
          ],
        };
      }
      return { sections: [...base, ...texts] };
    },
  });
}

// plugins/platform/src/index.ts
function activeContextEnvironment(pi, settings) {
  const environment = { ...process.env };
  const configured = (settings ?? pi.settings)?.get('bash.environment');
  if (!configured || typeof configured !== 'object' || Array.isArray(configured)) return environment;
  for (const [name, value] of Object.entries(configured)) {
    if (/^XCSH_[A-Z0-9_]+$/.test(name) && typeof value === 'string' && process.env[name] === undefined)
      environment[name] = value;
  }
  return environment;
}
var factory = async (pi) => {
  const presentTool2 = (tool) => presentTool(tool, pi.presentation);
  pi.setLabel('F5 Distributed Cloud Platform');
  let sessionSettings;
  const observeSession = (_event, context) => {
    sessionSettings = context.settings;
  };
  pi.on?.('session_start', observeSession);
  pi.on?.('context', observeSession);
  pi.integrations.register({
    id: 'platform',
    name: 'F5 Distributed Cloud Platform',
    plugin: 'platform',
    kind: 'local',
    setup: {
      pluginDependencies: [],
      requiredEnvironment: ['XCSH_API_URL', 'XCSH_API_TOKEN', 'XCSH_TENANT'],
      profileFields: [],
      steps: [],
      verification: [],
      guidedAction: { kind: 'context_wizard' },
    },
    async probe() {
      const environment = activeContextEnvironment(pi, sessionSettings);
      const url = environment.XCSH_API_URL;
      const token = environment.XCSH_API_TOKEN;
      const tenant = environment.XCSH_TENANT;
      if (!url || !token || !tenant) return { state: 'setup_required', reason: 'not_authenticated' };
      try {
        new URL(url);
        return { state: 'ready', value: { tenantConfigured: true } };
      } catch {
        return { state: 'error', reason: 'invalid_response' };
      }
    },
  });
  const service = createCePlatformService(
    () => activeContextEnvironment(pi, sessionSettings),
    undefined,
    (contextName, tenantOrigin) => {
      if (!pi.events) throw new Error('Terraform platform service is unavailable');
      return requestTerraformResourceMutation(pi.events, contextName, tenantOrigin);
    },
  );
  if (pi.events) registerCePlatformService(pi.events, service);
  const makeService = (context) => {
    if (context?.settings) sessionSettings = context.settings;
    return service;
  };
  if (typeof pi.registerTool !== 'function') return;
  await Promise.resolve().then(() => init_f5xc_ce_v2_site());
  await Promise.resolve().then(() => init_f5xc_ce_v2_bootstrap());
  await Promise.resolve().then(() => init_f5xc_ce_v2_status());
  await Promise.resolve().then(() => init_f5xc_ce_v2_capabilities());
  pi.registerTool(presentTool2(createF5xcCeV2CapabilitiesTool(pi, makeService)));
  pi.registerTool(presentTool2(createF5xcCeV2SiteTool(pi, makeService)));
  pi.registerTool(presentTool2(createF5xcCeV2BootstrapTool(pi, makeService)));
  pi.registerTool(presentTool2(createF5xcCeV2StatusTool(pi, makeService)));
};
var src_default = factory;

export { src_default as default };
