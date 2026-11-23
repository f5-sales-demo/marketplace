// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun

import { canonicalSha256 } from './runtime-6j4b2rhv.js';
import { CE_API_RELEASE, loadPublishedCeApi } from './runtime-cfmmcdyk.js';
import {
  acquireProcessLock,
  assessCeUpgradeTransition,
  azureUpgradeBinding,
  buildSiteUpgradeRequest,
  createWireValidator,
  initialSoftwareSettings,
  verifyAzureCePlan,
} from './runtime-ragavjaz.js';

// plugins/platform/src/ce/upgrade-contract.ts
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed upgrade contract');
  return value;
}
var routes = {
  software: ['/api/config/namespaces/{namespace}/sites/{name}/upgrade_sw', 'post', 'siteUpgradeSWRequest'],
  os: ['/api/config/namespaces/{namespace}/sites/{name}/upgrade_os', 'post', 'siteUpgradeOSRequest'],
  site: ['/api/config/namespaces/{namespace}/sites/{name}', 'get', 'siteGetResponse'],
  targets: ['/api/maurice/upgradable_sw_versions', 'get', 'upgrade_statusGetUpgradableSWVersionsResponse'],
  precheck: [
    '/api/maurice/namespaces/{namespace}/sites/{name}/pre_upgrade_check',
    'get',
    'upgrade_statusPreUpgradeCheckResponse',
  ],
  progress: [
    '/api/maurice/namespaces/{namespace}/sites/{name}/upgrade_status',
    'get',
    'upgrade_statusGetUpgradeStatusResponse',
  ],
};

class VerifiedUpgradeContract {
  identity = 'f5xc-ce-upgrade-api/v1';
  publication = 'immutable-release';
  releaseTag = CE_API_RELEASE.tag;
  commit = CE_API_RELEASE.commit;
  fingerprint = CE_API_RELEASE.fingerprint;
  #software;
  #os;
  constructor(schemas) {
    this.#software = createWireValidator(schemas, 'siteUpgradeSWRequest');
    this.#os = createWireValidator(schemas, 'siteUpgradeOSRequest');
  }
  static async release(fetcher = fetch, signal) {
    const api = await loadPublishedCeApi(fetcher, signal);
    const paths = object(api.paths);
    for (const [path, method, schemaName] of Object.values(routes)) {
      const operation = object(object(paths[path])[method]);
      const container = method === 'post' ? object(operation.requestBody) : object(object(operation.responses)['200']);
      const schema = object(object(object(container.content)['application/json']).schema);
      if (schema.$ref !== `#/components/schemas/${schemaName}`) throw new Error('Upgrade API path or schema differs');
    }
    return new VerifiedUpgradeContract(object(object(api.components).schemas));
  }
  observationPaths(siteName, current, targetSoftware) {
    initialSoftwareSettings(current);
    this.build({ siteName, kind: 'software', version: targetSoftware });
    return {
      site: `/api/config/namespaces/system/sites/${siteName}`,
      targets: `/api/maurice/upgradable_sw_versions?${new URLSearchParams({ current_os_version: current.os, current_sw_version: current.software })}`,
      precheck: `/api/maurice/namespaces/system/sites/${siteName}/pre_upgrade_check?${new URLSearchParams({ sw_version: targetSoftware })}`,
      progress: `/api/maurice/namespaces/system/sites/${siteName}/upgrade_status`,
    };
  }
  build(input) {
    return buildSiteUpgradeRequest(input, input.kind === 'software' ? this.#software : this.#os);
  }
}

// plugins/platform/src/ce/native-upgrade.ts
import { createHash, timingSafeEqual } from 'node:crypto';

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
var hash = (value) => createHash('sha256').update(canonical(value)).digest('hex');
var sameHash = (left, right) =>
  /^[a-f0-9]{64}$/.test(left) &&
  /^[a-f0-9]{64}$/.test(right) &&
  timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
async function optional(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
function exactFields(value, expected) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== expected.toSorted().join(',')
  )
    throw Error('Native upgrade record fields differ');
}
function validateNativeUpgradeReceipt(upgrade, value) {
  exactFields(value, [
    'status',
    'engine',
    'planId',
    'planSha256',
    'siteName',
    'target',
    'observedAt',
    'nodeHealth',
    'routing',
    'traffic',
  ]);
  const time = typeof value.observedAt === 'string' ? Date.parse(value.observedAt) : NaN;
  if (
    value.status !== 'upgrade-complete' ||
    value.engine !== 'native' ||
    value.planId !== upgrade.planId ||
    value.planSha256 !== upgrade.planSha256 ||
    value.siteName !== upgrade.expectation.binding.siteName ||
    hash(value.target) !== hash(upgrade.expectation.target) ||
    !Number.isFinite(time) ||
    time > Date.now() ||
    new Date(time).toISOString() !== value.observedAt ||
    value.nodeHealth !== 'unknown' ||
    value.routing !== 'unknown' ||
    value.traffic !== 'unknown'
  )
    throw Error('Completed native upgrade receipt differs');
  return value;
}
function validateNativeUpgradeCheckpoint(upgrade, value) {
  exactFields(value, ['schemaVersion', 'engine', 'sourcePlanSha256', 'upgradePlanSha256', 'phase']);
  if (
    value.schemaVersion !== 1 ||
    value.engine !== 'native' ||
    value.sourcePlanSha256 !== upgrade.sourcePlanSha256 ||
    value.upgradePlanSha256 !== upgrade.planSha256 ||
    !['ready', 'submitted', 'complete'].includes(String(value.phase))
  )
    throw Error('Native upgrade checkpoint differs');
  return value;
}
function validateNativeUpgradeSerial(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Native serial upgrade ledger differs');
  const row = value;
  exactFields(row, [
    'schemaVersion',
    'engine',
    'status',
    ...(row.activePlanId !== undefined ? ['activePlanId'] : []),
    ...(row.activePlanSha256 !== undefined ? ['activePlanSha256'] : []),
    ...(row.lastPlanId !== undefined ? ['lastPlanId'] : []),
    ...(row.lastPlanSha256 !== undefined ? ['lastPlanSha256'] : []),
  ]);
  const pair = (id, digest) =>
    typeof id === 'string' &&
    /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id) &&
    typeof digest === 'string' &&
    /^[a-f0-9]{64}$/.test(digest);
  if (
    row.schemaVersion !== 1 ||
    row.engine !== 'native' ||
    !['active', 'idle'].includes(String(row.status)) ||
    (row.status === 'idle' && (row.activePlanId !== undefined || row.activePlanSha256 !== undefined)) ||
    (row.status === 'active' && !pair(row.activePlanId, row.activePlanSha256)) ||
    ((row.lastPlanId !== undefined || row.lastPlanSha256 !== undefined) && !pair(row.lastPlanId, row.lastPlanSha256))
  )
    throw Error('Native serial upgrade ledger differs');
  return row;
}
async function runNativeCeUpgrade(input, authorizedPlanSha256, verify, runtime, contract, storage, signal) {
  const upgrade = structuredClone(input);
  if (upgrade.schemaVersion !== 1 || upgrade.engine !== 'native')
    throw new Error('Native upgrade schema is obsolete; prepare a new v1 plan');
  await verify(upgrade);
  if (!sameHash(upgrade.planSha256, authorizedPlanSha256))
    throw new Error('Exact native upgrade authorization is required');
  if (
    runtime.engine !== 'native' ||
    storage.owner.engine !== 'native' ||
    hash(storage.owner) !== hash(upgrade.expectation.binding.owner)
  )
    throw new Error('Only the owning native engine may upgrade this site');
  const release = await acquireProcessLock(`${storage.directory}/.upgrade-lock`);
  try {
    signal?.throwIfAborted();
    await storage.verify();
    signal?.throwIfAborted();
    const sourceName = `${upgrade.planId}.json`;
    const saved = await optional(storage, sourceName);
    if (saved === undefined) await storage.write(sourceName, upgrade);
    else if (hash(saved) !== hash(upgrade)) throw new Error('Saved native upgrade source differs');
    const checkpointName = `${upgrade.planId}-checkpoint.json`;
    const loadedCheckpoint = await optional(storage, checkpointName);
    let checkpoint;
    if (loadedCheckpoint === undefined) {
      checkpoint = {
        schemaVersion: 1,
        engine: 'native',
        sourcePlanSha256: upgrade.sourcePlanSha256,
        upgradePlanSha256: upgrade.planSha256,
        phase: 'ready',
      };
      await storage.write(checkpointName, checkpoint);
    } else checkpoint = loadedCheckpoint;
    checkpoint = validateNativeUpgradeCheckpoint(upgrade, checkpoint);
    let serial = (await optional(storage, 'native-ce-upgrade-serial.json')) ?? {
      schemaVersion: 1,
      engine: 'native',
      status: 'idle',
    };
    serial = validateNativeUpgradeSerial(serial);
    if (
      serial.status === 'active' &&
      (serial.activePlanId !== upgrade.planId || serial.activePlanSha256 !== upgrade.planSha256)
    )
      throw Error('Another native site upgrade is active');
    if (serial.lastPlanId !== undefined) {
      const last = await optional(storage, `${serial.lastPlanId}.json`);
      if (
        !last ||
        last.planId !== serial.lastPlanId ||
        last.planSha256 !== serial.lastPlanSha256 ||
        last.sourcePlanSha256 !== upgrade.sourcePlanSha256 ||
        hash(last.expectation.binding.owner) !== hash(storage.owner)
      )
        throw Error('Native serial upgrade source differs');
      await verify(last);
    }
    if (checkpoint.phase === 'submitted' && serial.status !== 'active')
      throw Error('Submitted native upgrade serial source missing');
    if (checkpoint.phase === 'complete' && serial.status === 'idle' && !serial.lastPlanId)
      throw Error('Completed native upgrade serial source missing');
    if (serial.status === 'idle' && checkpoint.phase === 'ready') {
      serial = {
        schemaVersion: 1,
        engine: 'native',
        status: 'active',
        activePlanId: upgrade.planId,
        activePlanSha256: upgrade.planSha256,
        lastPlanId: serial.lastPlanId,
        lastPlanSha256: serial.lastPlanSha256,
      };
      await storage.write('native-ce-upgrade-serial.json', serial);
    }
    const observe = async () => {
      signal?.throwIfAborted();
      const result = await runtime.observeUpgrade(
        upgrade.expectation.binding,
        contract,
        upgrade.expectation.target.kind === 'software' ? upgrade.expectation.target.version : undefined,
        signal,
      );
      signal?.throwIfAborted();
      return result;
    };
    const publishComplete = async () => {
      signal?.throwIfAborted();
      let receipt = await optional(storage, `${upgrade.planId}-receipt.json`);
      if (receipt === undefined) {
        if (checkpoint.phase === 'complete') throw Error('Completed native upgrade receipt missing');
        receipt = {
          status: 'upgrade-complete',
          engine: 'native',
          planId: upgrade.planId,
          planSha256: upgrade.planSha256,
          siteName: upgrade.expectation.binding.siteName,
          target: upgrade.expectation.target,
          observedAt: new Date().toISOString(),
          nodeHealth: 'unknown',
          routing: 'unknown',
          traffic: 'unknown',
        };
        validateNativeUpgradeReceipt(upgrade, receipt);
        signal?.throwIfAborted();
        await storage.write(`${upgrade.planId}-receipt.json`, receipt);
      } else validateNativeUpgradeReceipt(upgrade, receipt);
      signal?.throwIfAborted();
      if (checkpoint.phase !== 'complete') {
        checkpoint = { ...checkpoint, phase: 'complete' };
        await storage.write(checkpointName, checkpoint);
      }
      signal?.throwIfAborted();
      if (serial.status === 'active') {
        serial = {
          schemaVersion: 1,
          engine: 'native',
          status: 'idle',
          lastPlanId: upgrade.planId,
          lastPlanSha256: upgrade.planSha256,
        };
        await storage.write('native-ce-upgrade-serial.json', serial);
      } else if (!serial.lastPlanId) throw Error('Completed native upgrade serial source missing');
      signal?.throwIfAborted();
      return receipt;
    };
    let transition = assessCeUpgradeTransition(upgrade.expectation, await observe());
    if (checkpoint.phase === 'complete') {
      if (transition !== 'versions-complete') throw new Error('Completed native upgrade version evidence regressed');
      return await publishComplete();
    }
    if (transition === 'failed') throw new Error('Native upgrade failed');
    if (transition === 'unknown') {
      if (checkpoint.phase === 'submitted')
        return {
          status: 'upgrade-convergence-unknown',
          planId: upgrade.planId,
          planSha256: upgrade.planSha256,
        };
      throw new Error('Native upgrade evidence is unknown');
    }
    if (checkpoint.phase === 'ready' && transition === 'versions-complete') {
      serial = {
        schemaVersion: 1,
        engine: 'native',
        status: 'idle',
        lastPlanId: upgrade.planId,
        lastPlanSha256: upgrade.planSha256,
      };
      await storage.write('native-ce-upgrade-serial.json', serial);
      return { status: 'target-already-complete', planId: upgrade.planId, planSha256: upgrade.planSha256 };
    }
    if (checkpoint.phase === 'ready' && transition !== 'ready')
      throw new Error('Upgrade began outside the authorized native action');
    if (checkpoint.phase === 'ready') {
      let crossedBoundary = false;
      try {
        await runtime.submitUpgrade(
          upgrade.expectation.binding,
          contract,
          upgrade.expectation.target,
          upgrade.expectation.siteUid,
          async () => {
            signal?.throwIfAborted();
            checkpoint = {
              schemaVersion: 1,
              engine: 'native',
              sourcePlanSha256: upgrade.sourcePlanSha256,
              upgradePlanSha256: upgrade.planSha256,
              phase: 'submitted',
            };
            await storage.write(checkpointName, checkpoint);
            crossedBoundary = true;
          },
          signal,
        );
      } catch (error) {
        signal?.throwIfAborted();
        if (!crossedBoundary) throw error;
        return {
          status: 'upgrade-submission-unconfirmed',
          planId: upgrade.planId,
          planSha256: upgrade.planSha256,
        };
      }
      if (!crossedBoundary) throw Error('Native upgrade submission boundary missing');
      transition = assessCeUpgradeTransition(upgrade.expectation, await observe());
    }
    if (transition !== 'versions-complete') {
      if (transition === 'unknown' && checkpoint.phase === 'submitted')
        return {
          status: 'upgrade-convergence-unknown',
          planId: upgrade.planId,
          planSha256: upgrade.planSha256,
        };
      if (!['ready', 'converging'].includes(transition)) throw new Error('Native upgrade convergence is unknown');
      return {
        status:
          checkpoint.phase === 'submitted' && transition === 'ready'
            ? 'upgrade-submission-unconfirmed'
            : 'upgrade-converging',
        planId: upgrade.planId,
        planSha256: upgrade.planSha256,
      };
    }
    return await publishComplete();
  } finally {
    await release();
  }
}

// plugins/azure/src/ce/native-upgrade.ts
function build(base, expectation, contract) {
  verifyAzureCePlan(base);
  initialSoftwareSettings(expectation.before);
  const binding = azureUpgradeBinding(base);
  if (
    base.engine !== 'native' ||
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
    throw new Error('Azure native upgrade identities, scope or effective versions are incomplete');
  contract.build({ siteName: base.siteName, ...expectation.target });
  const draft = {
    schemaVersion: 1,
    engine: 'native',
    kind: 'azure-ce-native-upgrade',
    sourcePlanSha256: base.planSha256,
    expectation,
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-native-upgrade-${planSha256.slice(0, 24)}`, planSha256 };
}
async function prepareAzureNativeUpgrade(base, target, runtime, contract, signal) {
  signal?.throwIfAborted();
  verifyAzureCePlan(base);
  if (base.engine !== 'native') throw new Error('Azure native upgrade requires a native-owned plan');
  contract.build({ siteName: base.siteName, ...target });
  const binding = azureUpgradeBinding(base);
  const observation = await runtime.observeUpgrade(
    binding,
    contract,
    target.kind === 'software' ? target.version : undefined,
    signal,
  );
  signal?.throwIfAborted();
  if (observation.status !== 'observed') throw new Error('Fresh Azure native upgrade version evidence is unavailable');
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
    throw new Error('Azure native site version readiness has not converged');
  return build(base, expectation, contract);
}
function verifyAzureNativeUpgrade(base, upgrade, contract) {
  if (upgrade.schemaVersion !== 1 || upgrade.engine !== 'native')
    throw new Error('Azure native upgrade schema is obsolete; prepare a new v1 plan');
  const expected = build(base, upgrade.expectation, contract);
  if (canonicalSha256(upgrade) !== canonicalSha256(expected))
    throw new Error('Saved Azure native upgrade plan changed');
}
async function runAzureNativeUpgrade(base, upgrade, authorizedPlanSha256, runtime, contract, storage, signal) {
  signal?.throwIfAborted();
  await storage.verify();
  try {
    await storage.read('azure-native-lifecycle-retirement.json');
    throw Error('Azure native lifecycle is retired; upgrade cannot execute');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return runNativeCeUpgrade(
    upgrade,
    authorizedPlanSha256,
    async (candidate) => verifyAzureNativeUpgrade(base, candidate, contract),
    runtime,
    contract,
    storage,
    signal,
  );
}

export {
  prepareAzureNativeUpgrade,
  runAzureNativeUpgrade,
  VerifiedUpgradeContract,
  validateNativeUpgradeCheckpoint,
  validateNativeUpgradeReceipt,
  validateNativeUpgradeSerial,
  verifyAzureNativeUpgrade,
};
