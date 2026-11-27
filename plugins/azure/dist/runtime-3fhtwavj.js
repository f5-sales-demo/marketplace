// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun
import './runtime-cfmmcdyk.js';
import {
  assertAzureNativeActive,
  azureCurrentTrafficArtifactIdentity,
  guardAzureCeApplyObject,
  observeAzureCeRetirementAbsence,
  observeAzureNativeRetirementAbsence,
  observeAzureRelayRetirementAbsence,
  retireAzureNativeRelayKey,
  validateAzureCurrentTrafficHistory,
  validateAzureTrafficCheckpoint,
} from './runtime-dx19fw2n.js';
import {
  AzureTerraformOutcomeAbsent,
  azureTerraformNetworkPowerDeployment,
  azureTerraformNetworkPowerSelections,
  azureTerraformNetworkReplacementCompletionName,
  azureTerraformNetworkRetiredPowerDeployment,
  beginAzureTerraformRetirement,
  bindAwsCloudInit,
  collectAzureReplacementOperationalIdentity,
  createAzureOperationalAcquisitionCustody,
  createAzureOperationalAcquisitionSession,
  createAzureReplacementReadingsAcquisitionSession,
  executeAzureCeNativeApply2,
  isAzureNativeVmAuthenticationArtifact,
  isAzureTerraformReplacementHistoricalArtifact,
  loadAzureTerraformOutcome,
  observeAzureTerraformNetworkPower,
  openAzureTerraformNetworkReplacementCompletionArtifacts,
  parseNodeHealthJson,
  persistAzureNativeSource,
  readAzureTerraformNetworkCompletedPowerRetirement,
  readAzureTerraformNetworkCompletionOne,
  readAzureTerraformNetworkRetirementGraph,
  readAzureTerraformOriginalReceiptInventory,
  readAzureTerraformParentPrivateFile,
  readAzureTerraformReplacementRefreshInventory,
  recheckAzureTerraformNetworkRetirementGraph,
  runAzureTerraformNetworkGenerationHistory,
  VerifiedIngressContract,
  validateAzureIngressSource,
  validateAzureTerraformNetworkPowerPlan,
  validateAzureTerraformNetworkPowerProjection,
  validateAzureTerraformNetworkReplacementCompletion,
  verifyAzureNativeVmAuthenticationArtifacts,
  verifyAzureTerraformReplacementHistoricalArtifacts,
  withAzureTerraformPowerLifecycle,
} from './runtime-e03x8t47.js';
import {
  AZURE_CE_CHECKPOINT_SCHEMA_VERSION,
  AZURE_CE_TERRAFORM_VERSION,
  acquireProcessLock,
  azureNativeNetworkGenerationCompletionName,
  azureNativeNetworkScope,
  azureRelayHistoricalArtifacts,
  azureRelayPlanForDeployment,
  azureRelayResourceSource,
  azureTerraformCurrentDeployment,
  azureTerraformFoundationDeployment,
  azureTerraformNetworkScope,
  azureUpgradeBinding,
  isAzureNativeNetworkCheckpointHistory,
  isAzureNativeNetworkGenerationCompletion,
  isAzureNativeNetworkHistory,
  isAzureNativeReplacementHistory,
  isAzureRelayReplacementHistoricalArtifact,
  loadCheckpoint,
  loadPlanArtifact,
  parseBgpRoutePaths,
  parseBgpRoutes,
  parseBgpSessions,
  parseGeneratedInterfaceUid,
  persistAzureNativeReplacementHistory,
  readAzureCePlanInventory,
  readAzureNativeNetworkGenerationCompletion,
  saveCheckpoint,
  validateAzureNativeAdmissionCheckpoint,
  verifyAzureCePlan,
  verifyAzureNativeNetworkHistoryRecords,
  verifyAzureNativeNetworkProfile,
  verifyAzureNativeNetworkReplacementRetirementSource,
  verifyAzureNativeReplacementHistories,
  verifyAzureNativeReplacementOriginalSource,
  verifyAzureRelayHistoricalArtifacts,
  verifyAzureRelayReplacementHistories,
  verifyAzureTerraformNetworkProfile,
  verifyAzureTerraformNetworkReplacementProfile,
  verifyAzureTerraformUpgrade,
} from './runtime-ragavjaz.js';
import {
  azureFailoverOwner,
  azureTerraformFailoverDeployment,
  buildAzureCeFailoverPlan,
  requireAzureFailoverExecutionContract,
  validateAzureFailoverCheckpoint,
  validateAzureFailoverReceipt,
  validateAzureFailoverTrafficHistory,
  validateAzureTerraformFailoverPlan,
  validateAzureTerraformFailoverRetirement,
  verifyAzureCeFailoverPlan,
} from './runtime-te1kanfn.js';
import './runtime-zvpjt7fv.js';

// plugins/azure/src/ce/native-bootstrap-retirement.ts
// plugins/platform/src/ce/token-store.ts
import { createHash, createHash as createHash2, randomUUID } from 'node:crypto';
// plugins/azure/src/ce/native-teardown.ts
import {
  chmod,
  lstat,
  lstat as lstat2,
  mkdir,
  readdir,
  readdir as readdir2,
  readdir as readdir32,
  readFile,
  readFile as readFile2,
  realpath,
  realpath as realpath2,
  rename,
  unlink,
  unlink as unlink2,
  writeFile,
} from 'node:fs/promises';
// plugins/azure/src/tools/azure-ce-teardown.ts
import { isAbsolute, join, join as join2, join as join36, join as join37, resolve, sep } from 'node:path';
import {
  canonicalEqual,
  canonicalSha256,
  canonicalSnapshot,
  canonicalStringify,
  safeHexEqual,
} from './runtime-6j4b2rhv.js';
import { makeExecApi } from './runtime-2139fbqg.js';
import {
  VerifiedUpgradeContract,
  validateNativeUpgradeCheckpoint,
  validateNativeUpgradeReceipt,
  validateNativeUpgradeSerial,
  verifyAzureNativeUpgrade,
} from './runtime-d4estz5g.js';
import { azurePlatformService, azureTerraformService } from './runtime-hxhs7mq0.js';
import { withAzureCeExecution } from './runtime-tdt4p3w8.js';

function assertWithin(root, target) {
  const base = resolve(root);
  const candidate = resolve(target);
  if (candidate !== base && !candidate.startsWith(`${base}${sep}`))
    throw new Error('Bootstrap path escapes the secure root');
}
async function retireBootstrapToken(binding, evidenceSha256, signal) {
  signal?.throwIfAborted();
  const match = /^f5xc-ce:\/\/([a-zA-Z0-9._-]{1,128})\/([a-zA-Z0-9._-]{1,128})$/.exec(binding.reference);
  if (
    !match ||
    binding.schemaVersion !== 1 ||
    !isAbsolute(binding.root) ||
    resolve(binding.root) !== binding.root ||
    !/^[a-f0-9]{64}$/.test(binding.digest) ||
    !/^[a-f0-9]{64}$/.test(evidenceSha256) ||
    binding.uid !== (process.getuid?.() ?? null) ||
    !Number.isFinite(Date.parse(binding.expiresAt))
  )
    throw Error('Bootstrap retirement binding differs');
  const [, session, id] = match;
  const directory = join(binding.root, session, id);
  for (const path of [binding.root, join(binding.root, session), directory]) {
    assertWithin(binding.root, path);
    const stat = await lstat(path);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.uid !== binding.uid ||
      (stat.mode & 511) !== 448 ||
      (await realpath(path)) !== path
    )
      throw Error('Bootstrap retirement directory differs');
  }
  const secureFile = async (name) => {
    const path = join(directory, name),
      stat = await lstat(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      stat.uid !== binding.uid ||
      (stat.mode & 511) !== 384
    )
      throw Error('Bootstrap retirement file differs');
    return readFile(path);
  };
  const names = await readdir(directory);
  if (names.some((name) => !['metadata.json', 'token'].includes(name)))
    throw Error('Bootstrap checkout has in-flight or unknown artifacts');
  const metadata = JSON.parse((await secureFile('metadata.json')).toString());
  if (
    metadata.version !== 1 ||
    metadata.session !== session ||
    metadata.id !== id ||
    metadata.uid !== binding.uid ||
    metadata.digest !== binding.digest ||
    metadata.expiresAt !== binding.expiresAt ||
    typeof metadata.consumed !== 'boolean'
  )
    throw Error('Bootstrap retirement metadata differs');
  const receipt = {
    schemaVersion: 1,
    status: 'bootstrap-secret-retired',
    reference: binding.reference,
    digest: binding.digest,
    evidenceSha256,
  };
  if (metadata.checkoutReady !== true) throw Error('Bootstrap checkout issuance is incomplete');
  if (metadata.retirementPending && JSON.stringify(metadata.retirementPending) !== JSON.stringify(receipt))
    throw Error('Bootstrap pending retirement evidence differs');
  if (metadata.retirement && JSON.stringify(metadata.retirement) !== JSON.stringify(receipt))
    throw Error('Bootstrap retirement evidence differs');
  const persist = async (value) => {
    const temporary = join(directory, `metadata-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify(value), { mode: 384, flag: 'wx' });
      await rename(temporary, join(directory, 'metadata.json'));
    } finally {
      await unlink(temporary).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
  };
  if (!names.includes('token') && !metadata.consumed && !metadata.retirementPending)
    throw Error('Unconsumed bootstrap token is missing');
  if (names.includes('token')) {
    if (metadata.retirement || metadata.consumed)
      throw Error('Bootstrap secret reappeared after consumption or retirement');
    const bytes = await secureFile('token');
    if (createHash('sha256').update(bytes).digest('hex') !== binding.digest)
      throw Error('Bootstrap retirement token digest differs');
    signal?.throwIfAborted();
    if (!metadata.retirementPending) await persist({ ...metadata, retirementPending: receipt });
    signal?.throwIfAborted();
    await unlink(join(directory, 'token'));
  }
  signal?.throwIfAborted();
  if (!metadata.retirement)
    await persist({ ...metadata, consumed: true, retirementPending: receipt, retirement: receipt });
  return receipt;
}

// plugins/azure/src/ce/native-bootstrap-retirement.ts
var markerName = 'azure-native-bootstrap-retirement.json';
var sha = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
var hash = (value) => createHash2('sha256').update(value).digest('hex');
var object = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Malformed native bootstrap retirement evidence');
  return value;
};
var optional = async (store, name) => {
  try {
    return await store.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
};
async function retireAzureNativeBootstrapArtifacts(base, cloud, teardown, runtime, contract, store, api, signal) {
  const deadline = AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]);
  deadline.throwIfAborted();
  await store.verify();
  const release = await acquireProcessLock(join2(store.directory, '.azure-relay-native-mutation-lock'));
  try {
    const binding = azureUpgradeBinding(base);
    if (
      canonicalSha256(compileAzureNativeTeardown(base, cloud, teardown.drain, teardown.retirement)) !==
        canonicalSha256(teardown) ||
      canonicalSha256(store.owner) !== canonicalSha256(binding.owner) ||
      canonicalSha256(await store.read(`${teardown.planId}.json`)) !== canonicalSha256(teardown)
    )
      throw Error('Native bootstrap retirement source or teardown differs');
    const authorization = object(await store.read(`${teardown.planId}-authorization.json`));
    if (
      authorization.schemaVersion !== 1 ||
      authorization.engine !== 'native' ||
      authorization.mutations !== true ||
      authorization.sourcePlanSha256 !== base.planSha256 ||
      authorization.teardownPlanSha256 !== teardown.planSha256
    )
      throw Error('Native bootstrap retirement mutation authorization differs');
    if (base.relayProfile) {
      const key = object(await store.read('azure-native-relay-key-retirement.json'));
      const { phase, checkpointSha256, ...keyDraft } = key;
      if (
        phase !== 'retired' ||
        checkpointSha256 !== canonicalSha256(keyDraft) ||
        key.sourcePlanSha256 !== base.planSha256 ||
        key.teardownPlanSha256 !== teardown.planSha256 ||
        canonicalSha256(key.owner) !== canonicalSha256(binding.owner)
      )
        throw Error('Native bootstrap retirement requires completed exact relay key retirement');
    } else if ((await optional(store, 'azure-native-relay-key-retirement.json')) !== undefined) {
      throw Error('Standard native retirement has an orphan relay key marker');
    }
    const receipt = object(await store.read('azure-native-teardown-receipt.json'));
    if (
      (await optional(store, 'relay-native-execution.json')) !== undefined ||
      receipt.status !== 'retired' ||
      receipt.sourcePlanSha256 !== base.planSha256 ||
      receipt.teardownPlanSha256 !== teardown.planSha256 ||
      receipt.cloudPlanSha256 !== cloud.planSha256 ||
      receipt.cloud !== 'absent' ||
      receipt.sites !== 'deleted'
    )
      throw Error('Native bootstrap retirement requires completed exact cloud/site/key retirement');
    const fresh = () => observeAzureNativeRetirementAbsence(base, teardown, runtime, contract, api, deadline);
    const absenceSha256 = await fresh();
    const directory = async () => {
      const stat = await lstat2(store.directory);
      if (
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        stat.uid !== process.getuid?.() ||
        (await realpath2(store.directory)) !== store.directory
      )
        throw Error('Native bootstrap retirement directory differs');
    };
    const bytes = async (name) => {
      const path = join2(store.directory, name),
        stat = await lstat2(path);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.nlink !== 1 ||
        stat.uid !== process.getuid?.() ||
        stat.mode & 63
      )
        throw Error('Native bootstrap retirement file differs');
      return readFile2(path);
    };
    let marker = await optional(store, markerName);
    if (marker === undefined) {
      await directory();
      const names = (await readdir2(store.directory)).sort(),
        sources = new Map([
          [base.planSha256, base],
          [cloud.planSha256, cloud],
        ]);
      for (const name of names.filter((name) => /^native-source-[a-f0-9]{64}\.json$/.test(name))) {
        const source = object(await store.read(name));
        verifyAzureCePlan(source);
        if (
          source.engine !== 'native' ||
          canonicalSha256(azureUpgradeBinding(source).owner) !== canonicalSha256(binding.owner) ||
          source.siteName !== base.siteName ||
          name !== `native-source-${source.planSha256}.json`
        )
          throw Error('Native source registry ownership differs');
        sources.set(source.planSha256, source);
      }
      const tokens = new Map();
      for (const site of teardown.retirement)
        for (const token of site.tokens) {
          if (
            !binding.nodes.includes(token.node) ||
            site.siteName !== binding.siteName ||
            !/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(token.name) ||
            tokens.has(`${token.name}.json`)
          )
            throw Error('Native retirement token inventory differs');
          tokens.set(`${token.name}.json`, { ...token, siteName: site.siteName });
        }
      const selected = names.filter(
        (name) =>
          name.startsWith('native-admission-') ||
          tokens.has(name) ||
          /^bootstrap-checkout-[a-f0-9-]{36}\.json$/.test(name),
      );
      const items = [],
        parsed = new Map();
      for (const name of selected) {
        deadline.throwIfAborted();
        const raw = await bytes(name);
        let value;
        try {
          value = object(JSON.parse(raw.toString()));
        } catch {
          throw Error('Malformed native enrollment staging');
        }
        parsed.set(name, value);
        items.push({ name, sha256: hash(raw), preserve: name.startsWith('bootstrap-checkout-') });
      }
      for (const [name, value] of parsed) {
        if (tokens.has(name)) {
          const token = tokens.get(name);
          if (
            Object.keys(value).sort().join(',') !== 'jwt,node,siteName,tokenName' ||
            value.tokenName !== token?.name ||
            value.node !== token?.node ||
            value.siteName !== token?.siteName ||
            typeof value.jwt !== 'string' ||
            !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.jwt)
          )
            throw Error('Native enrollment token binding differs');
        } else if (name.startsWith('native-admission-')) {
          const source = sources.get(String(value.planSha256));
          if (
            !source ||
            name !== `native-admission-${source.planSha256}.json` ||
            !names.includes(`native-source-${source.planSha256}.json`)
          )
            throw Error('Native admission source is unresolved');
          if (
            base.relayProfile
              ? !source.relayProfile ||
                canonicalSha256(azureRelayResourceSource(source)) !== canonicalSha256(azureRelayResourceSource(base))
              : source.relayProfile !== undefined ||
                (source.intent.operation === 'replace-node'
                  ? !object(value.replacement).originalSourcePlan ||
                    canonicalSha256(object(value.replacement).originalSourcePlan) !== canonicalSha256(base)
                  : source.intent.operation === 'update-network'
                    ? verifyAzureNativeNetworkProfile(source).originalPlanSha256 !== base.planSha256 ||
                      canonicalSha256(azureNativeNetworkScope(source, true)) !==
                        canonicalSha256(azureNativeNetworkScope(base, true)) ||
                      value.siteReserved !== false ||
                      Object.keys(object(value.bootstrapByNode)).length !== 0 ||
                      Object.keys(object(value.launchedAtByNode)).length !== 0 ||
                      value.replacement !== undefined
                    : source.planSha256 !== base.planSha256)
          )
            throw Error('Native admission original resource owner differs');
          if (!source.relayProfile && source.intent.operation === 'replace-node') {
            if (source.networkReplacementProfile)
              await verifyAzureNativeNetworkReplacementRetirementSource(source, object(value.replacement), store);
            else verifyAzureNativeReplacementOriginalSource(source, base);
          }
          validateAzureNativeAdmissionCheckpoint(source, value);
          if (
            Object.keys(value).sort().join(',') !==
            [
              'schemaVersion',
              'engine',
              'planSha256',
              'siteReserved',
              'bootstrapByNode',
              'launchedAtByNode',
              ...('replacement' in value ? ['replacement'] : []),
            ]
              .sort()
              .join(',')
          )
            throw Error('Native admission staging fields differ');
          for (const [node, material] of Object.entries(object(value.bootstrapByNode))) {
            const tokenName = `${source.deploymentName.slice(0, 40)}-${node}-${source.planSha256.slice(0, 12)}`;
            const token = parsed.get(`${tokenName}.json`);
            if (
              !token ||
              token.node !== `${source.deploymentName}-${node}` ||
              typeof token.jwt !== 'string' ||
              typeof material !== 'string'
            )
              throw Error('Native admission upstream token provenance is missing');
            bindAwsCloudInit({ cloud_init_config: material }, token.jwt);
          }
        } else {
          if (
            Object.keys(value).sort().join(',') !==
            'binding,checkout,contractFingerprint,node,owner,schemaVersion,siteUid,tokenName'
          )
            throw Error('Native opaque bootstrap checkout fields differ');
          const checkout = object(value.checkout),
            token = parsed.get(`${String(value.tokenName)}.json`);
          if (
            value.schemaVersion !== 1 ||
            canonicalSha256(value.owner) !== canonicalSha256(binding.owner) ||
            canonicalSha256(value.binding) !== canonicalSha256(binding) ||
            value.siteUid !== teardown.retirement[0].siteUid ||
            value.contractFingerprint !== teardown.drain.siteContractFingerprint ||
            !tokens.has(`${String(value.tokenName)}.json`) ||
            token?.node !== value.node ||
            typeof token?.jwt !== 'string' ||
            hash(token.jwt) !== checkout.digest ||
            name !== `bootstrap-checkout-${String(checkout.reference).split('/').at(-1)}.json`
          )
            throw Error('Native opaque bootstrap checkout binding differs');
        }
      }
      for (const [name, value] of parsed)
        if (name.startsWith('native-admission-')) {
          const source = sources.get(String(value.planSha256));
          if (source && !source.relayProfile && source.intent.operation === 'replace-node')
            await persistAzureNativeReplacementHistory(source, value, store);
        }
      const draft = {
        schemaVersion: 1,
        engine: 'native',
        owner: binding.owner,
        sourcePlanSha256: base.planSha256,
        teardownPlanSha256: teardown.planSha256,
        absenceSha256,
        artifacts: items,
        inventorySha256: canonicalSha256(items),
      };
      marker = { ...draft, checkpointSha256: canonicalSha256(draft), phase: 'retiring' };
      deadline.throwIfAborted();
      await store.write(markerName, marker);
    }
    const value = object(marker),
      { phase: markerPhase, checkpointSha256: markerSha256, ...draft } = value;
    if (
      value.schemaVersion !== 1 ||
      value.engine !== 'native' ||
      canonicalSha256(value.owner) !== canonicalSha256(binding.owner) ||
      value.sourcePlanSha256 !== base.planSha256 ||
      value.teardownPlanSha256 !== teardown.planSha256 ||
      !['retiring', 'retired'].includes(String(markerPhase)) ||
      markerSha256 !== canonicalSha256(draft) ||
      !sha(value.absenceSha256) ||
      !Array.isArray(value.artifacts) ||
      value.inventorySha256 !== canonicalSha256(value.artifacts)
    )
      throw Error('Native bootstrap retirement checkpoint differs');
    const recorded = new Map();
    const allowedTokens = new Set(
      teardown.retirement.flatMap((site) => site.tokens.map((token) => `${token.name}.json`)),
    );
    for (const row of value.artifacts) {
      const item = object(row);
      if (
        typeof item.name !== 'string' ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(item.name) ||
        !sha(item.sha256) ||
        typeof item.preserve !== 'boolean' ||
        recorded.has(item.name) ||
        (!/^native-admission-[a-f0-9]{64}\.json$/.test(item.name) &&
          !allowedTokens.has(item.name) &&
          !/^bootstrap-checkout-[a-f0-9-]{36}\.json$/.test(item.name)) ||
        item.preserve !== item.name.startsWith('bootstrap-checkout-')
      )
        throw Error('Native bootstrap retirement inventory malformed');
      recorded.set(item.name, item);
    }
    await directory();
    for (const [name, item] of recorded) {
      let raw;
      try {
        raw = await bytes(name);
      } catch (error) {
        if (error.code === 'ENOENT' && !item.preserve) continue;
        throw error;
      }
      if (hash(raw) !== item.sha256 || (markerPhase === 'retired' && !item.preserve))
        throw Error('Native enrollment staging changed after retirement preflight');
    }
    const currentNames = await readdir2(store.directory);
    const tokenNames = new Set(teardown.retirement.flatMap((site) => site.tokens.map((token) => `${token.name}.json`)));
    if (
      currentNames.some(
        (name) =>
          (name.startsWith('native-admission-') || name.startsWith('bootstrap-checkout-') || tokenNames.has(name)) &&
          !recorded.has(name),
      )
    )
      throw Error('Native enrollment staging appeared after retirement preflight');
    if (markerPhase === 'retiring') {
      for (const item of recorded.values())
        if (item.preserve) {
          await fresh();
          deadline.throwIfAborted();
          const checkout = object(await store.read(item.name)).checkout;
          await retireBootstrapToken(checkout, String(value.absenceSha256), deadline);
        }
      for (const item of recorded.values())
        if (!item.preserve && (await optional(store, item.name)) !== undefined) {
          await fresh();
          deadline.throwIfAborted();
          await directory();
          await store.verify();
          if (hash(await bytes(item.name)) !== item.sha256)
            throw Error('Native enrollment staging changed before deletion');
          deadline.throwIfAborted();
          await unlink2(join2(store.directory, item.name));
        }
      deadline.throwIfAborted();
      await store.write(markerName, { ...value, phase: 'retired' });
    }
    await fresh();
    return {
      status: 'native-bootstrap-retired',
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: teardown.planSha256,
      checkpointSha256: markerSha256,
      retiredArtifacts: [...recorded.values()].filter((item) => !item.preserve).length,
      remainingStaging: (await readdir2(store.directory)).filter(
        (name) => name !== markerName && name !== 'owner.json' && name !== '.azure-relay-native-mutation-lock',
      ).length,
      completeCleanup: false,
    };
  } finally {
    await release();
  }
}

// plugins/azure/src/ce/native-parent-retirement.ts
import { createHash as createHash4 } from 'node:crypto';
import {
  lstat as lstat3,
  readdir as readdir3,
  readFile as readFile3,
  realpath as realpath3,
  unlink as unlink3,
} from 'node:fs/promises';
// plugins/azure/src/ce/failover-artifact-provenance.ts
import { isIP, isIP as isIP3 } from 'node:net';
import { join as join3 } from 'node:path';

var phases = ['baseline', 'outage', 'recovered'];
var sourcePattern = /^azure-ce-failover-[a-f0-9]{24}\.json$/;
var isAzureFailoverHistoricalArtifact = (name) => /^azure-ce-failover-[a-f0-9]{24}(?:-[a-z0-9-]+)?\.json$/.test(name);
var require2 = (condition, message) => {
  if (!condition) throw Error(`Azure failover history: ${message}`);
};
var object2 = (input) => {
  require2(input && typeof input === 'object' && !Array.isArray(input), 'malformed record');
  return input;
};
var keys = (value, required, optional = []) =>
  require2(
    required.every((key) => key in value) &&
      Object.keys(value).every((key) => [...required, ...optional].includes(key)),
    'record fields differ',
  );
var same = canonicalEqual;
var timestamp = (value) => {
  require2(
    typeof value === 'string' && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now(),
    'historical timestamp differs',
  );
  return Date.parse(value);
};
var rows = (value) => {
  require2(Array.isArray(value), 'complete list required');
  return value.map(object2);
};
function directPhase(base, failover, phase, value, siteUid, records) {
  keys(value, [
    'acceptance',
    'phase',
    'expectedEstablishedSessions',
    'sessions',
    'effectiveRoutes',
    'routeServer',
    'traffic',
    'trafficCheckpointKey',
    'trafficRequestedAt',
    'observedAt',
  ]);
  require2(value.acceptance === 'passed', 'direct phase acceptance differs');
  const routing = requireAzureFailoverExecutionContract(base, failover, records.get('platform-routing.json'));
  require2(routing.siteUid === siteUid, 'direct routing site differs');
  const binding = azureUpgradeBinding(base),
    selected = binding.nodes[failover.nodeIndex - 1];
  const interfaces = routing.interfaces.filter((row) => phase !== 'outage' || row.node !== selected);
  const nodes = interfaces.map((row) => row.node);
  const expected = interfaces.flatMap((row) =>
    routing.routeServerAddresses.map((peerAddress) => ({ ...row, peerAddress })),
  );
  const sessions = object2(value.sessions),
    routes = object2(value.effectiveRoutes);
  keys(sessions, [
    'status',
    'expectedSessions',
    'establishedSessions',
    'sessions',
    'owner',
    'siteName',
    'source',
    'observedAt',
    'contractFingerprint',
  ]);
  keys(routes, [
    'status',
    'nodes',
    'pathInventory',
    'owner',
    'siteName',
    'source',
    'observedAt',
    'contractFingerprint',
  ]);
  for (const row of [sessions, routes]) {
    require2(
      same(row.owner, binding.owner) &&
        row.siteName === base.siteName &&
        row.contractFingerprint === routing.contractFingerprint &&
        typeof row.source === 'string' &&
        row.source,
      'direct CE owner/site/contract differs',
    );
    require2(timestamp(row.observedAt) <= timestamp(value.observedAt), 'CE observation follows phase receipt');
  }
  require2(sessions.status === 'healthy' && routes.status === 'observed', 'direct CE observation unavailable');
  const peers = rows(sessions.sessions);
  const parsed = parseBgpSessions(
    {
      ver: nodes.map((node) => ({
        name: node,
        peer: peers
          .filter((row) => row.node === node)
          .map((row) => ({
            interface_name: row.interfaceName,
            peer_address: { ipv4: { addr: row.peerAddress } },
            protocol_status: row.state,
            received_prefix_count: row.receivedPrefixCount,
            advertised_prefix_count: row.advertisedPrefixCount,
            up_down_timestamp: row.stateChangedAt,
          })),
      })),
    },
    expected,
  );
  require2(
    same(parsed.sessions, peers) &&
      parsed.expectedSessions === sessions.expectedSessions &&
      parsed.establishedSessions === sessions.establishedSessions &&
      parsed.establishedSessions === expected.length,
    'direct CE session scope differs',
  );
  const routeNodes = rows(routes.nodes);
  const wire = {
    ver: routeNodes.map((node) => ({
      name: node.node,
      ri_table: rows(node.routingInstances).map((instance) => ({
        routing_instance: instance.name,
        rt_table: rows(instance.tables).map((table) => ({
          name: table.name,
          imported: rowsOrStrings(table.imported).map((subnet) => ({ subnet })),
          exported: rowsOrStrings(table.exported).map((subnet) => ({ subnet })),
        })),
      })),
    })),
  };
  require2(same(parseBgpRoutes(wire, nodes).nodes, routeNodes), 'direct CE route scope differs');
  const paths = object2(routes.pathInventory);
  const qualifiers = ['status', 'scope', 'freshness', 'traffic'];
  require2(
    paths.scope === 'unqualified' && paths.freshness === 'unqualified' && paths.traffic === 'unknown',
    'direct CE path qualifiers differ',
  );
  if (paths.status === 'unknown') {
    keys(paths, [...qualifiers, 'reason']);
    require2(typeof paths.reason === 'string' && paths.reason.length > 0, 'unknown CE path reason missing');
  } else {
    keys(paths, [...qualifiers, 'nodes']);
    require2(paths.status === 'observed', 'CE path status differs');
    const pathNodes = rows(paths.nodes);
    const pathWire = {
      ver: pathNodes.map((node) => ({
        name: node.node,
        ri_table: rows(node.routingInstances).map((instance) => ({
          routing_instance: instance.name,
          rt_table: rows(instance.tables).map((table) => ({
            name: table.name,
            imported: table.imported,
            exported: table.exported,
          })),
        })),
      })),
    };
    require2(
      same(parseBgpRoutes(pathWire, nodes).nodes, routeNodes) && same(parseBgpRoutePaths(pathWire, nodes), paths),
      'direct CE path inventory differs',
    );
  }
  const cloud = object2(value.routeServer);
  keys(cloud, [
    'status',
    'phase',
    'selectedNode',
    'expectedEstablishedSessions',
    'routeServerId',
    'serviceAddresses',
    'peers',
    'observedAt',
  ]);
  const server = base.actions.filter((row) => row.kind === 'route-server-create');
  require2(
    cloud.status === 'healthy' &&
      cloud.phase === (phase === 'outage' ? 'outage' : 'recovered') &&
      cloud.selectedNode === failover.nodeIndex &&
      cloud.expectedEstablishedSessions === expected.length &&
      server.length === 1 &&
      cloud.routeServerId === server[0].resourceId &&
      same(cloud.serviceAddresses, [...routing.routeServerAddresses].sort()),
    'direct cloud topology differs',
  );
  require2(timestamp(cloud.observedAt) <= timestamp(value.observedAt), 'cloud observation follows phase receipt');
  const cloudPeers = rows(cloud.peers),
    ips = new Set();
  require2(cloudPeers.length === 3, 'complete retained cloud peers required');
  for (const [index, peer] of cloudPeers.entries()) {
    keys(peer, ['node', 'name', 'peerIp', 'peerAsn', 'provisioningState', 'roles']);
    require2(
      peer.node === index + 1 &&
        peer.name === binding.nodes[index] &&
        peer.peerAsn === base.routing.localAsn &&
        peer.provisioningState === 'Succeeded' &&
        typeof peer.peerIp === 'string' &&
        isIP(peer.peerIp) === 4 &&
        !ips.has(peer.peerIp),
      'direct cloud peer differs',
    );
    ips.add(peer.peerIp);
    const roleRows = rows(peer.roles);
    require2(roleRows.length === 2, 'both cloud service roles required');
    for (const [roleIndex, role] of roleRows.entries()) {
      keys(role, ['role', 'learnedRouteCount', 'matchedPrefixes']);
      const expectedPrefixes =
        phase === 'outage' && peer.node === failover.nodeIndex ? [] : base.routing.destinationCidrs;
      require2(
        role.role === `RouteServiceRole_IN_${roleIndex}` &&
          Number.isSafeInteger(role.learnedRouteCount) &&
          Number(role.learnedRouteCount) >= expectedPrefixes.length &&
          same(role.matchedPrefixes, expectedPrefixes),
        'direct cloud withdrawal/restoration differs',
      );
    }
  }
}
function rowsOrStrings(value) {
  require2(Array.isArray(value), 'route prefix list required');
  return value;
}
async function verifyAzureFailoverHistoricalArtifacts(base, siteUid, records) {
  const names = [...records.keys()].filter(isAzureFailoverHistoricalArtifact);
  const sources = new Map();
  for (const name of names.filter((name) => sourcePattern.test(name))) {
    const source = records.get(name);
    verifyAzureCeFailoverPlan(base, source);
    require2(name === `${source.planId}.json`, 'source filename differs');
    sources.set(source.planId, source);
  }
  const consumed = new Set();
  let histories = 0,
    checkpoints = 0;
  for (const failover of sources.values()) {
    const id = failover.planId;
    consumed.add(`${id}.json`);
    const read = (suffix) => records.get(`${id}${suffix}.json`);
    const consume = (suffix) => {
      if (records.has(`${id}${suffix}.json`)) consumed.add(`${id}${suffix}.json`);
    };
    const prep = read('-preparation-evidence');
    if (prep !== undefined) {
      const value = object2(prep);
      keys(value, [
        'schemaVersion',
        'source',
        'subscriptionId',
        'region',
        'engine',
        'deploymentId',
        'sourcePlanSha256',
        'nodeIndex',
        'vmResourceId',
        'vmId',
        'powerState',
        'observedAt',
      ]);
      timestamp(value.observedAt);
      require2(same(buildAzureCeFailoverPlan(base, prep), failover), 'preparation identity differs');
      consume('-preparation-evidence');
    }
    const auth = read('-authorization');
    if (auth !== undefined) {
      require2(
        same(auth, {
          schemaVersion: 1,
          engine: base.engine,
          sourcePlanSha256: base.planSha256,
          failoverPlanSha256: failover.planSha256,
          mutations: true,
        }),
        'authorization differs',
      );
      consume('-authorization');
    }
    const checkpointValue = read('-checkpoint'),
      receipt = read('-receipt');
    const active =
      checkpointValue === undefined ? undefined : validateAzureFailoverCheckpoint(base, failover, checkpointValue);
    if (active) {
      require2(auth, 'checkpoint authorization missing');
      consume('-checkpoint');
    }
    if (receipt !== undefined) {
      require2(active && ['release', 'complete'].includes(active.phase), 'receipt precedes durable release');
      validateAzureFailoverReceipt(base, failover, receipt);
      consume('-receipt');
    }
    if (active?.phase === 'complete') require2(receipt, 'complete checkpoint receipt missing');
    const catalogs = new Map();
    for (const phase of phases) {
      const catalog = read(`-${phase}-traffic-observations`);
      if (catalog === undefined) continue;
      const leaves = new Map();
      for (const name of names.filter(
        (name) =>
          name.startsWith(`${id}-${phase}-traffic-`) &&
          /^[a-f0-9]{32}\.json$/.test(name.slice(`${id}-${phase}-traffic-`.length)),
      ))
        leaves.set(name, records.get(name));
      const checked = validateAzureFailoverTrafficHistory(base, failover, phase, catalog, leaves);
      catalogs.set(phase, checked);
      histories++;
      checkpoints += leaves.size;
      consume(`-${phase}-traffic-observations`);
      for (const name of leaves.keys()) consumed.add(name);
    }
    const phaseEvidence = new Map();
    const phaseOrder = ['baseline', 'stop', 'outage', 'start', 'recovered', 'release', 'complete'];
    const reached = (phase) => active && phaseOrder.indexOf(active.phase) >= phaseOrder.indexOf(phase);
    for (const phase of phases) {
      const input = read(`-${phase}-evidence`);
      if (input === undefined) continue;
      const value = object2(input);
      require2(
        value.phase === phase && value.expectedEstablishedSessions === (phase === 'outage' ? 4 : 6),
        'phase scope differs',
      );
      timestamp(value.observedAt);
      require2(phase === 'baseline' || reached(phase), 'phase evidence precedes durable phase');
      const previous =
        phase === 'outage'
          ? phaseEvidence.get('baseline')
          : phase === 'recovered'
            ? phaseEvidence.get('outage')
            : undefined;
      require2(
        phase === 'baseline' || (previous && timestamp(value.trafficRequestedAt) >= timestamp(previous.observedAt)),
        'phase evidence sequence differs',
      );
      const catalog = catalogs.get(phase);
      const request = catalog?.history.observations.find((row) => row.checkpointKey === value.trafficCheckpointKey);
      require2(
        request?.checkpointSha256 && request.requestedAt === value.trafficRequestedAt,
        'phase traffic catalog binding missing',
      );
      const traffic = validateAzureTrafficCheckpoint(base, records.get(`${value.trafficCheckpointKey}.json`));
      require2(
        traffic &&
          same(traffic, value.traffic) &&
          timestamp(traffic.observedAt) >= timestamp(value.trafficRequestedAt) &&
          timestamp(traffic.observedAt) <= timestamp(value.observedAt),
        'phase HTTP evidence differs',
      );
      if (base.relayProfile) {
        keys(value, [
          'acceptance',
          'phase',
          'topology',
          'expectedEstablishedSessions',
          'expectedCloudEstablishedSessions',
          'observation',
          'traffic',
          'trafficCheckpointKey',
          'trafficRequestedAt',
          'reason',
          'observedAt',
        ]);
        require2(
          value.acceptance === 'unknown' &&
            value.topology === 'ce-relay-route-server' &&
            value.expectedCloudEstablishedSessions === 4 &&
            typeof value.reason === 'string' &&
            value.reason,
          'unsupported relay acceptance claim',
        );
        const replay = new Map(
          [...records].filter(([name]) =>
            ['relay-routing-workflow.json', 'platform-relay-routing.json', 'relay-routing-configuration.json'].includes(
              name,
            ),
          ),
        );
        replay.set('relay-routing-observation.json', value.observation);
        verifyAzureRelayHistoricalArtifacts(
          base,
          siteUid,
          replay,
          phase === 'outage' ? { nodeIndex: failover.nodeIndex } : undefined,
        );
      } else directPhase(base, failover, phase, value, siteUid, records);
      phaseEvidence.set(phase, value);
      consume(`-${phase}-evidence`);
    }
    if (active) {
      const required = active.phase === 'baseline' ? [] : ['baseline'];
      if (['start', 'recovered', 'release', 'complete'].includes(active.phase)) required.push('outage');
      if (['release', 'complete'].includes(active.phase)) required.push('recovered');
      for (const phase of required)
        require2(phaseEvidence.get(phase)?.acceptance === 'passed', 'advanced checkpoint phase evidence missing');
    }
    if (receipt)
      require2(
        phaseEvidence.get('recovered') &&
          timestamp(object2(receipt).observedAt) >= timestamp(phaseEvidence.get('recovered')?.observedAt),
        'completion receipt precedes recovery',
      );
    for (const phase of ['stop', 'start', 'release']) {
      const plan = read(`-${phase}-plan`);
      if (plan === undefined) continue;
      const predecessor = phase === 'start' ? 'stop' : phase === 'release' ? 'start' : undefined;
      require2(
        base.engine === 'terraform' && reached(phase) && auth && (!predecessor || read(`-${predecessor}-plan`)),
        'Terraform phase plan sequence or authorization missing',
      );
      await validateAzureTerraformFailoverPlan(base, failover, phase, plan);
      consume(`-${phase}-plan`);
    }
    const final = read('-final-plan');
    if (final !== undefined) {
      require2(
        base.engine === 'terraform' &&
          active &&
          ['release', 'complete'].includes(active.phase) &&
          read('-release-plan'),
        'final Terraform release sequence differs',
      );
      await validateAzureTerraformFailoverPlan(base, failover, 'release', final, true);
      consume('-final-plan');
    }
    const retirement = read('-stage-retirement');
    if (retirement !== undefined) {
      require2(
        base.engine === 'terraform' && active?.phase === 'complete' && receipt && final,
        'stage retirement precedes failover completion',
      );
      await validateAzureTerraformFailoverRetirement(base, failover, retirement);
      consume('-stage-retirement');
    }
    if (base.engine === 'terraform' && active) {
      if (reached('outage')) require2(read('-stop-plan'), 'Terraform outage stop plan missing');
      if (reached('recovered')) require2(read('-start-plan'), 'Terraform recovery start plan missing');
      if (receipt) require2(read('-release-plan') && final, 'Terraform completion release/final plan missing');
    }
  }
  require2(
    names.every((name) => consumed.has(name)),
    'unknown or orphan failover artifact',
  );
  return { plans: sources.size, histories, checkpoints, currentEvidenceQualified: false };
}

// plugins/platform/src/ce/ingress-lifecycle.ts
import { createHash as createHash3 } from 'node:crypto';
import { isIP as isIP2 } from 'node:net';

// plugins/platform/src/ce/site-labels.ts
var discoveryLabels = new Set(['domain', 'host-os-version', 'hw-model', 'hw-serial-number', 'hw-vendor', 'hw-version']);

// plugins/platform/src/ce/runtime.ts
var CE_API_ERROR_BRAND = Symbol.for('xcsh.ce.api-error.v1');

// plugins/platform/src/ce/ingress-lifecycle.ts
function validatePrimarySelections(intent, selections, provider) {
  if (intent.usePrimaryInterfaceAddress === undefined) return false;
  if (intent.usePrimaryInterfaceAddress !== true || provider !== 'aws')
    throw new Error('Primary-interface ingress mode or provider differs');
  const groups = new Map();
  for (const selected of selections) {
    const binding = selected.binding;
    if (
      !binding ||
      !Array.isArray(binding.nodes) ||
      ![1, 3].includes(binding.nodes.length) ||
      new Set(binding.nodes).size !== binding.nodes.length ||
      !binding.nodes.includes(selected.node) ||
      selected.insideAddress !== undefined
    )
      throw new Error('Primary-interface ingress requires exact site and node bindings');
    const group = groups.get(binding.siteName);
    if (group) {
      if (!same2(group.binding, binding) || group.nodes.has(selected.node))
        throw new Error('Primary-interface ingress site bindings conflict');
      group.nodes.add(selected.node);
    } else groups.set(binding.siteName, { binding, nodes: new Set([selected.node]) });
  }
  for (const { binding, nodes } of groups.values())
    if (nodes.size !== binding.nodes.length || binding.nodes.some((node) => !nodes.has(node)))
      throw new Error('Primary-interface ingress requires every site node');
  return true;
}
function listenerPlacements(intent, placements) {
  return intent.usePrimaryInterfaceAddress === true
    ? [...new Set(placements.map((row) => row.siteName))].map((name) => ({
        name,
        usePrimaryInterfaceAddress: true,
      }))
    : placements.map((row) => ({ name: row.siteName, insideAddress: row.insideAddress }));
}
function object3(value) {
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
var hash2 = (value) => createHash3('sha256').update(canonical(value)).digest('hex');
var same2 = (a, b) => canonical(a) === canonical(b);
function fields(value, names) {
  if (Object.keys(value).sort().join(',') !== names.toSorted().join(','))
    throw new Error('Ingress historical fields differ');
}
function text(value) {
  if (typeof value !== 'string' || !value || value.length > 512) throw new Error('Ingress historical identity missing');
  return value;
}
function validateCeIngressHistoricalPlan(value, owner, contract, siteFingerprint) {
  const raw = object3(value);
  fields(raw, [
    'schemaVersion',
    'kind',
    'observedAt',
    'material',
    'id',
    'sha256',
    'request',
    ...(raw.source !== undefined ? ['source'] : []),
  ]);
  const plan = raw;
  const { id, sha256, request, ...draft } = plan;
  if (
    draft.schemaVersion !== 1 ||
    draft.kind !== 'ce-inside-http-ingress' ||
    typeof id !== 'string' ||
    !/^[a-f0-9]{24}$/.test(id) ||
    hash2(draft) !== sha256 ||
    sha256.slice(0, 24) !== id ||
    typeof draft.observedAt !== 'string' ||
    !Number.isFinite(Date.parse(draft.observedAt)) ||
    Date.parse(draft.observedAt) > Date.now()
  )
    throw new Error('Obsolete, forged or foreign ingress plan');
  if (raw.source !== undefined) {
    const source = object3(raw.source);
    fields(source, ['schemaVersion', 'kind', 'sourcePlanSha256', 'sourceArtifactSha256']);
    if (
      owner.provider !== 'azure' ||
      source.schemaVersion !== 1 ||
      source.kind !== 'azure-ce-source' ||
      typeof source.sourcePlanSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(source.sourcePlanSha256) ||
      typeof source.sourceArtifactSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(source.sourceArtifactSha256)
    )
      throw new Error('Ingress source binding differs');
  }
  const material = object3(plan.material);
  fields(material, [
    'owner',
    'contractFingerprint',
    'siteFingerprint',
    'intent',
    'selections',
    'placements',
    'originRequest',
    'request',
  ]);
  if (
    !same2(material.owner, owner) ||
    material.contractFingerprint !== contract.fingerprint ||
    material.siteFingerprint !== siteFingerprint ||
    !Array.isArray(material.selections) ||
    !Array.isArray(material.placements) ||
    material.selections.length < 1 ||
    material.selections.length > 32 ||
    material.placements.length !== material.selections.length
  )
    throw new Error('Ingress historical owner or placement differs');
  const primary = validatePrimarySelections(plan.material.intent, plan.material.selections, owner.provider);
  const uidSites = new Map();
  const siteIds = new Map();
  const sites = new Set(),
    nodes = new Set(),
    macs = new Set(),
    uids = new Set(),
    addresses = new Set();
  for (let i = 0; i < plan.material.selections.length; i++) {
    const selected = plan.material.selections[i],
      placement = plan.material.placements[i];
    fields(object3(selected), [
      'binding',
      'node',
      'mac',
      ...(selected.insideAddress !== undefined ? ['insideAddress'] : []),
    ]);
    fields(object3(placement), ['siteName', 'siteUid', 'interface', 'insideAddress']);
    const binding = selected.binding;
    fields(object3(binding), ['owner', 'siteName', 'nodes']);
    if (
      !same2(binding.owner, owner) ||
      !['aws', 'azure'].includes(owner.provider) ||
      !Array.isArray(binding.nodes) ||
      new Set(binding.nodes).size !== binding.nodes.length ||
      (owner.provider === 'aws' ? !primary && binding.nodes.length !== 1 : ![1, 3].includes(binding.nodes.length)) ||
      !binding.nodes.includes(selected.node) ||
      binding.siteName !== placement.siteName ||
      (!primary && sites.has(binding.siteName)) ||
      nodes.has(selected.node) ||
      macs.has(selected.mac.toLowerCase()) ||
      (uids.has(placement.siteUid) && (!primary || uidSites.get(placement.siteUid) !== binding.siteName)) ||
      (siteIds.has(binding.siteName) && siteIds.get(binding.siteName) !== placement.siteUid) ||
      !/^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/i.test(selected.mac) ||
      isIP2(placement.insideAddress) !== 4 ||
      addresses.has(placement.insideAddress)
    )
      throw new Error('Ingress historical selection identity differs');
    text(binding.siteName);
    text(selected.node);
    text(placement.siteUid);
    const iface = placement.interface;
    fields(object3(iface), ['node', 'role', 'mac', 'device', 'interfaceName', 'interfaceUid', 'mtu', 'linkUp', 'ipv4']);
    if (
      iface.node !== selected.node ||
      iface.role !== 'sli' ||
      iface.mac !== selected.mac.toLowerCase() ||
      iface.linkUp !== true ||
      !Number.isInteger(iface.mtu) ||
      (iface.mtu !== 0 && (iface.mtu < 576 || iface.mtu > 8000)) ||
      !iface.ipv4
    )
      throw new Error('Ingress historical SLI identity differs');
    text(iface.device);
    text(iface.interfaceName);
    parseGeneratedInterfaceUid(iface.interfaceUid);
    fields(object3(iface.ipv4), ['address', 'prefixLength']);
    if (
      isIP2(iface.ipv4.address) !== 4 ||
      !Number.isInteger(iface.ipv4.prefixLength) ||
      iface.ipv4.prefixLength < 0 ||
      iface.ipv4.prefixLength > 32 ||
      placement.insideAddress !== (selected.insideAddress ?? iface.ipv4.address)
    )
      throw new Error('Ingress historical inside address differs');
    uidSites.set(placement.siteUid, binding.siteName);
    siteIds.set(binding.siteName, placement.siteUid);
    sites.add(binding.siteName);
    nodes.add(selected.node);
    macs.add(selected.mac.toLowerCase());
    uids.add(placement.siteUid);
    addresses.add(placement.insideAddress);
  }
  const labels = {
    'xcsh-ce-deployment': owner.deploymentId,
    'xcsh-ce-engine': owner.engine,
    'xcsh-ce-provider': owner.provider,
    'xcsh-ce-account': owner.account,
    'xcsh-ce-region': owner.region,
  };
  const { originAddress, usePrimaryInterfaceAddress: _primary, ...intent } = plan.material.intent;
  const built = contract.build({
    ...intent,
    sites: listenerPlacements(plan.material.intent, plan.material.placements),
  });
  const origin = contract.buildOrigin({
    name: plan.material.intent.originPool.name,
    namespace: plan.material.intent.originPool.namespace,
    originAddress,
    port: plan.material.intent.port,
    siteNames: [...new Set(plan.material.placements.map((row) => row.siteName))],
  });
  if (
    !same2(request, material.request) ||
    !same2(request, { metadata: { ...built.metadata, labels }, spec: built.spec }) ||
    !same2(material.originRequest, { metadata: { ...origin.metadata, labels }, spec: origin.spec })
  )
    throw new Error('Ingress historical request differs from exact contract compilation');
  return plan;
}

// plugins/azure/src/ce/ingress-artifact-provenance.ts
var require3 = (value, message) => {
  if (!value) throw new Error(`Azure ingress history: ${message}`);
};
var same3 = canonicalEqual;
var object4 = (value) => {
  require3(value && typeof value === 'object' && !Array.isArray(value), 'malformed record');
  return value;
};
var keys2 = (value, expected) =>
  require3(Object.keys(value).sort().join(',') === expected.toSorted().join(','), 'record fields differ');
var identity = (value) => typeof value === 'string' && value.length > 0;
var sha2 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
var time = (value) => {
  require3(
    typeof value === 'string' && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now(),
    'historical collection time differs',
  );
  return Date.parse(String(value));
};
var isAzureIngressHistoricalArtifact = (name) =>
  !!azureCurrentTrafficArtifactIdentity(name) ||
  name === 'azure-platform-ingress.json' ||
  name === 'azure-traffic-probe.json' ||
  /^azure-ingress-source-[a-f0-9]{64}\.json$/.test(name) ||
  /^ingress-(?:plan|checkpoint|origin-checkpoint)-[a-f0-9]{24}\.json$/.test(name) ||
  /^azure-ce-[a-f0-9]{24}-[a-zA-Z0-9._-]+-traffic-probe\.json$/.test(name);
function verifyAzureIngressHistoricalArtifacts(base, rawDrain, contract, records) {
  const selectedRecords = [...records].filter(([name]) => isAzureIngressHistoricalArtifact(name));
  if (!selectedRecords.length) return;
  const binding = azureUpgradeBinding(base),
    owner = binding.owner,
    drain = object4(rawDrain);
  require3(
    same3(drain.owner, owner) &&
      drain.ingressContractFingerprint === contract.fingerprint &&
      identity(drain.siteContractFingerprint) &&
      Array.isArray(drain.listeners) &&
      Array.isArray(drain.origins) &&
      Array.isArray(drain.sites),
    'drain provenance missing',
  );
  const journals = new Map();
  for (const [name, raw] of selectedRecords)
    if (name.startsWith('azure-ingress-source-')) {
      const source = validateAzureIngressSource(raw, owner, contract.fingerprint);
      require3(
        source.plan.siteName === base.siteName && name === `azure-ingress-source-${source.plan.planSha256}.json`,
        'source site or filename differs',
      );
      journals.set(source.plan.planSha256, source);
    }
  const plans = new Map();
  for (const [name, raw] of selectedRecords)
    if (name.startsWith('ingress-plan-')) {
      const plan = validateCeIngressHistoricalPlan(raw, owner, contract, String(drain.siteContractFingerprint));
      const source = plan.source;
      require3(source, 'exact source binding missing');
      const journal = journals.get(String(source?.sourcePlanSha256));
      require3(
        journal &&
          source?.sourceArtifactSha256 === canonicalSha256(journal.record) &&
          same3(plan.material.intent, journal.intent) &&
          same3(plan.material.selections, journal.selections) &&
          time(journal.record.observedAt) <= time(plan.observedAt) &&
          name === `ingress-plan-${plan.id}.json`,
        'plan/source identity join differs',
      );
      plans.set(plan.id, plan);
    }
  function checkpoint(name, id, origin) {
    const raw = records.get(name);
    if (raw === undefined) return;
    const record = object4(raw),
      plan = plans.get(id);
    require3(
      plan && record.planSha256 === plan.sha256 && ['creating', 'created', 'deleted'].includes(String(record.phase)),
      'checkpoint plan differs',
    );
    if (record.phase === 'creating') keys2(record, ['phase', 'planSha256']);
    else {
      keys2(record, ['phase', 'planSha256', 'uid', 'observedAt', ...(origin ? [] : ['listener', 'routes', 'traffic'])]);
      require3(
        identity(record.uid) && time(record.observedAt) >= time(plan?.observedAt),
        'checkpoint resource identity differs',
      );
      if (!origin)
        require3(
          record.listener === 'configured' && record.routes === 'unknown' && record.traffic === 'unknown',
          'configuration checkpoint state differs',
        );
    }
    return record;
  }
  const checkpoints = new Map();
  for (const [id, plan] of plans) {
    const listener = checkpoint(`ingress-checkpoint-${id}.json`, id, false);
    const origin = checkpoint(`ingress-origin-checkpoint-${id}.json`, id, true);
    require3(!listener || origin, 'listener checkpoint has no preceding origin');
    require3(!listener || origin?.phase !== 'creating', 'listener preceded origin completion');
    const corrected = listener?.phase === 'deleted' && origin?.phase === 'deleted';
    const matchingListeners = drain.listeners.map(object4).filter((row) => row.id === id);
    require3(matchingListeners.length <= 1, 'duplicate drain listener');
    if (listener && listener.phase !== 'creating' && !corrected) {
      require3(
        matchingListeners.length === 1 &&
          matchingListeners[0].name === plan.request.metadata.name &&
          matchingListeners[0].namespace === plan.request.metadata.namespace,
        'listener not bound to completed drain',
      );
    } else require3(matchingListeners.length === 0, 'incomplete or corrected listener entered current drain');
    if (origin && origin.phase !== 'creating' && !corrected) {
      const origins = drain.origins.map(object4).filter((row) => {
        const ref = object4(row.origin);
        return (
          ref.name === plan.material.intent.originPool.name &&
          ref.namespace === plan.material.intent.originPool.namespace
        );
      });
      require3(origins.length === 1, 'origin not bound to completed drain');
      const snapshot = origins[0],
        ref = object4(snapshot.origin);
      require3(
        snapshot.schemaVersion === 1 &&
          same3(snapshot.owner, owner) &&
          ref.uid === origin.uid &&
          snapshot.contractFingerprint === contract.fingerprint &&
          identity(snapshot.resourceVersion) &&
          sha2(snapshot.specSha256),
        'origin drain UID or provenance differs',
      );
      time(snapshot.observedAt);
    }
    if (!corrected) {
      const site = drain.sites.map(object4).filter((row) => object4(row.binding).siteName === base.siteName);
      require3(
        site.length === 1 &&
          same3(site[0].binding, plan.material.selections[0].binding) &&
          site[0].siteUid === plan.material.placements[0].siteUid,
        'logical site UID/drain join differs',
      );
    }
    checkpoints.set(id, { listener, origin });
  }
  for (const [name] of selectedRecords)
    if (/^ingress-(?:checkpoint|origin-checkpoint)-/.test(name))
      require3(plans.has(String(name.match(/([a-f0-9]{24})\.json$/)?.[1])), 'orphan checkpoint has no compiled plan');
  const marker = records.get('azure-platform-ingress.json');
  if (marker !== undefined) {
    const value = object4(marker);
    keys2(value, [
      'schemaVersion',
      'engine',
      'sourcePlanSha256',
      'sourceArtifactSha256',
      'configurationSha256',
      'ingressPlanId',
      'contractFingerprint',
    ]);
    const plan = plans.get(String(value.ingressPlanId)),
      journal = journals.get(String(value.sourcePlanSha256));
    require3(
      value.schemaVersion === 2 &&
        value.engine === base.engine &&
        value.contractFingerprint === contract.fingerprint &&
        plan &&
        journal &&
        value.sourceArtifactSha256 === canonicalSha256(journal.record) &&
        value.configurationSha256 === journal.configurationSha256 &&
        same3(plan.source, {
          schemaVersion: 1,
          kind: 'azure-ce-source',
          sourcePlanSha256: value.sourcePlanSha256,
          sourceArtifactSha256: value.sourceArtifactSha256,
        }),
      'active marker source/plan differs',
    );
  }
  const traffic = new Map();
  for (const [name, raw] of selectedRecords)
    if (name === 'azure-traffic-probe.json' || name.endsWith('-traffic-probe.json')) {
      const state = object4(raw),
        journal = journals.get(String(state.planSha256));
      require3(journal, 'traffic source journal missing');
      const sourcePlan = journal?.plan;
      if (name !== 'azure-traffic-probe.json') {
        const actions = sourcePlan.actions.filter(
          (row) => row.kind === 'traffic-gate' && name === `${sourcePlan.planId}-${row.id}-traffic-probe.json`,
        );
        require3(sourcePlan.engine === 'native' && actions.length === 1, 'traffic execution filename differs');
      } else require3(sourcePlan.engine === 'terraform', 'default traffic checkpoint is not Terraform-owned');
      require3(
        same3(state.sourceIdentity, journal?.record.sourceIdentity),
        'traffic/ingress source attachment differs',
      );
      const evidence = validateAzureTrafficCheckpoint(sourcePlan, state);
      if (evidence) traffic.set(`${sourcePlan.planSha256}/${name}`, evidence);
    }
  for (const [name, raw] of selectedRecords) {
    const current = azureCurrentTrafficArtifactIdentity(name);
    if (!current) continue;
    const checkpointName = `${current.checkpointKey}.json`;
    const checkpoint = current.receipt ? records.get(checkpointName) : raw;
    require3(checkpoint !== undefined, 'current sample receipt has no checkpoint');
    const state = object4(checkpoint),
      journal = journals.get(String(state.planSha256));
    require3(journal, 'current sample source journal missing');
    require3(same3(state.sourceIdentity, journal?.record.sourceIdentity), 'current sample source attachment differs');
    const sourcePlan = journal?.plan;
    validateAzureTrafficCheckpoint(sourcePlan, checkpoint);
    if (current.receipt) validateAzureCurrentTrafficHistory(sourcePlan, current.checkpointKey, checkpoint, raw);
  }
  for (const [name, raw] of records)
    if (name.startsWith('native-action-')) {
      const action = object4(raw),
        evidence = object4(action.evidence);
      if (evidence.ingressPlanId !== undefined) {
        const plan = plans.get(String(evidence.ingressPlanId)),
          checkpoint = checkpoints.get(String(evidence.ingressPlanId))?.listener;
        require3(
          plan &&
            checkpoint &&
            evidence.uid === checkpoint.uid &&
            evidence.contractFingerprint === contract.fingerprint &&
            evidence.listener === 'configured',
          'public ingress action/lifecycle receipt differs',
        );
      }
      if (evidence.source === 'azure:vm-run-command') {
        const journal = journals.get(String(action.sourcePlanSha256));
        require3(journal, 'public traffic source missing');
        const file = `${journal?.plan.planId}-${String(action.actionId)}-traffic-probe.json`;
        require3(
          same3(evidence, traffic.get(`${journal?.plan.planSha256}/${file}`)),
          'public traffic action/checkpoint receipt differs',
        );
      }
    }
}

// plugins/azure/src/ce/native-upgrade-artifact-provenance.ts
var sourcePattern2 = /^azure-ce-native-upgrade-[a-f0-9]{24}\.json$/;
var artifactPattern = /^azure-ce-native-upgrade-[a-f0-9]{24}(?:-(?:authorization|checkpoint|receipt))?\.json$/;
var isAzureNativeUpgradeHistoricalArtifact = (name) =>
  name === 'native-ce-upgrade-serial.json' || artifactPattern.test(name);
var same4 = canonicalEqual;
var require4 = (condition, message) => {
  if (!condition) throw Error(`Native upgrade history: ${message}`);
};
var keys3 = (value, names) => {
  require4(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).sort().join(',') === names.toSorted().join(','),
    'record fields differ',
  );
};
function verifyAzureNativeUpgradeHistoricalArtifacts(base, teardown, contract, records) {
  const names = [...records.keys()].filter(isAzureNativeUpgradeHistoricalArtifact);
  if (!names.length) return;
  require4(contract, 'verified upgrade contract missing');
  const sources = new Map();
  for (const name of names.filter((name) => sourcePattern2.test(name))) {
    const upgrade = records.get(name);
    keys3(upgrade?.expectation, [
      'binding',
      'siteUid',
      'physicalSiteUid',
      'contractFingerprint',
      'siteContractFingerprint',
      'before',
      'target',
    ]);
    keys3(upgrade.expectation.before, ['software', 'os']);
    verifyAzureNativeUpgrade(base, upgrade, contract);
    require4(
      name === `${upgrade.planId}.json` &&
        upgrade.expectation.siteUid === teardown.retirement[0].siteUid &&
        upgrade.expectation.physicalSiteUid === teardown.retirement[0].physicalSiteUid &&
        upgrade.expectation.siteContractFingerprint === teardown.drain.siteContractFingerprint,
      'source site identity differs',
    );
    sources.set(upgrade.planId, upgrade);
  }
  require4(sources.size > 0, 'source missing');
  let serial;
  if (records.has('native-ce-upgrade-serial.json')) {
    serial = validateNativeUpgradeSerial(records.get('native-ce-upgrade-serial.json'));
    for (const [id, digest] of [
      [serial.activePlanId, serial.activePlanSha256],
      [serial.lastPlanId, serial.lastPlanSha256],
    ]) {
      if (id !== undefined) require4(sources.get(id)?.planSha256 === digest, 'serial source differs');
    }
    if (serial.lastPlanId) require4(records.has(`${serial.lastPlanId}-checkpoint.json`), 'last checkpoint missing');
    if (serial.activePlanId)
      require4(records.has(`${serial.activePlanId}-checkpoint.json`), 'active checkpoint missing');
  }
  for (const name of names) {
    if (name === 'native-ce-upgrade-serial.json' || sourcePattern2.test(name)) continue;
    const id = name.replace(/-(authorization|checkpoint|receipt)\.json$/, '');
    const source = sources.get(id);
    require4(source, 'artifact source missing');
  }
  for (const upgrade of sources.values()) {
    const auth = records.get(`${upgrade.planId}-authorization.json`);
    const checkpoint = records.get(`${upgrade.planId}-checkpoint.json`);
    const receipt = records.get(`${upgrade.planId}-receipt.json`);
    if (auth !== undefined)
      require4(
        same4(auth, {
          schemaVersion: 2,
          engine: 'native',
          sourcePlanSha256: base.planSha256,
          upgradePlanSha256: upgrade.planSha256,
          mutations: true,
        }),
        'authorization differs',
      );
    if (checkpoint !== undefined) {
      require4(auth, 'checkpoint authorization missing');
      const checked = validateNativeUpgradeCheckpoint(upgrade, checkpoint);
      if (checked.phase !== 'ready') require4(serial, 'submitted serial ledger missing');
      if (checked.phase === 'submitted')
        require4(serial?.activePlanId === upgrade.planId, 'submitted serial source differs');
      if (checked.phase === 'complete')
        require4(serial?.activePlanId || serial?.lastPlanId, 'completed serial source missing');
      if (serial?.lastPlanId === upgrade.planId)
        require4(checked.phase !== 'submitted', 'last upgrade is still submitted');
      if (checked.phase === 'complete') require4(receipt, 'completed receipt missing');
      if (receipt !== undefined) {
        require4(checked.phase !== 'ready', 'receipt predates submission');
        validateNativeUpgradeReceipt(upgrade, receipt);
      }
    } else require4(receipt === undefined, 'receipt checkpoint missing');
  }
}

// plugins/azure/src/ce/native-parent-retirement.ts
var markerName2 = 'azure-native-parent-artifact-retirement.json';
var lockName = '.azure-relay-native-mutation-lock';
var hash3 = (raw) => createHash4('sha256').update(raw).digest('hex');
var sha3 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
var same5 = canonicalEqual;
var require5 = (condition, message) => {
  if (!condition) throw Error(`Native parent retirement: ${message}`);
};
var object5 = (value) => {
  require5(value && typeof value === 'object' && !Array.isArray(value), 'malformed record');
  return value;
};
var keys4 = (value, expected) =>
  require5(Object.keys(value).sort().join(',') === expected.toSorted().join(','), 'record fields differ');
var timestamp2 = (value) =>
  require5(
    typeof value === 'string' && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now(),
    'historical collection time differs',
  );
var optional2 = async (store, name) => {
  try {
    return await store.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
};
async function retireAzureNativeParentArtifacts(
  base,
  cloud,
  teardown,
  runtime,
  contract,
  store,
  api,
  signal,
  upgradeContract,
) {
  const deadline = AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]);
  deadline.throwIfAborted();
  await store.verify();
  const release = await acquireProcessLock(join3(store.directory, lockName));
  try {
    const binding = azureUpgradeBinding(base),
      relay = base.relayProfile ? azureRelayPlanForDeployment(base) : undefined;
    require5(
      base.engine === 'native' &&
        same5(store.owner, binding.owner) &&
        same5(compileAzureNativeTeardown(base, cloud, teardown.drain, teardown.retirement), teardown),
      'source, owner or teardown differs',
    );
    require5(same5(await store.read(`${teardown.planId}.json`), teardown), 'saved teardown differs');
    require5(
      same5(await store.read(`${teardown.planId}-authorization.json`), {
        schemaVersion: 1,
        engine: 'native',
        sourcePlanSha256: base.planSha256,
        teardownPlanSha256: teardown.planSha256,
        mutations: true,
      }),
      'mutation authorization differs',
    );
    require5(
      same5(await store.read('azure-native-lifecycle-retirement.json'), {
        schemaVersion: 1,
        engine: 'native',
        owner: binding.owner,
        sourcePlanSha256: base.planSha256,
        teardownPlanSha256: teardown.planSha256,
      }),
      'lifecycle barrier differs',
    );
    const bootstrap = object5(await store.read('azure-native-bootstrap-retirement.json'));
    const key = relay ? object5(await store.read('azure-native-relay-key-retirement.json')) : undefined;
    require5(
      relay || (await optional2(store, 'azure-native-relay-key-retirement.json')) === undefined,
      'orphan relay key marker',
    );
    for (const value of key ? [bootstrap, key] : [bootstrap]) {
      const { phase, checkpointSha256, ...draft } = value;
      require5(
        phase === 'retired' &&
          value.schemaVersion === 1 &&
          value.engine === 'native' &&
          same5(value.owner, binding.owner) &&
          value.sourcePlanSha256 === base.planSha256 &&
          value.teardownPlanSha256 === teardown.planSha256 &&
          checkpointSha256 === canonicalSha256(draft) &&
          sha3(value.absenceSha256),
        'exact completed secret retirement missing',
      );
    }
    if (key && relay) {
      keys4(key, [
        'schemaVersion',
        'engine',
        'owner',
        'sourcePlanSha256',
        'relayPlanSha256',
        'teardownPlanSha256',
        'journalSha256',
        'absenceSha256',
        'checkpointSha256',
        'phase',
      ]);
      require5(
        key.relayPlanSha256 === relay.planSha256 && (key.journalSha256 === null || sha3(key.journalSha256)),
        'key source differs',
      );
    }
    keys4(bootstrap, [
      'schemaVersion',
      'engine',
      'owner',
      'sourcePlanSha256',
      'teardownPlanSha256',
      'absenceSha256',
      'artifacts',
      'inventorySha256',
      'checkpointSha256',
      'phase',
    ]);
    require5(
      Array.isArray(bootstrap.artifacts) && bootstrap.inventorySha256 === canonicalSha256(bootstrap.artifacts),
      'bootstrap inventory differs',
    );
    const receipt = object5(await store.read('azure-native-teardown-receipt.json'));
    keys4(receipt, [
      'status',
      'sourcePlanSha256',
      'teardownPlanSha256',
      'cloudPlanSha256',
      'cloud',
      'sites',
      'observedAt',
    ]);
    require5(
      receipt.status === 'retired' &&
        receipt.sourcePlanSha256 === base.planSha256 &&
        receipt.teardownPlanSha256 === teardown.planSha256 &&
        receipt.cloudPlanSha256 === cloud.planSha256 &&
        receipt.cloud === 'absent' &&
        receipt.sites === 'deleted',
      'exact cloud/site receipt missing',
    );
    timestamp2(receipt.observedAt);
    const fresh = () => observeAzureNativeRetirementAbsence(base, teardown, runtime, contract, api, deadline);
    const absenceSha256 = await fresh();
    const directory = async () => {
      const stat = await lstat3(store.directory);
      require5(
        stat.isDirectory() &&
          !stat.isSymbolicLink() &&
          stat.uid === process.getuid?.() &&
          (await realpath3(store.directory)) === store.directory,
        'directory identity differs',
      );
    };
    const bytes = async (name) => {
      const stat = await lstat3(join3(store.directory, name));
      require5(
        stat.isFile() &&
          !stat.isSymbolicLink() &&
          stat.nlink === 1 &&
          stat.uid === process.getuid?.() &&
          !(stat.mode & 63),
        'file identity differs',
      );
      return readFile3(join3(store.directory, name));
    };
    const checkouts = new Map();
    for (const row of bootstrap.artifacts) {
      const item = object5(row);
      keys4(item, ['name', 'sha256', 'preserve']);
      require5(
        typeof item.name === 'string' && sha3(item.sha256) && typeof item.preserve === 'boolean',
        'bootstrap artifact malformed',
      );
      if (item.preserve) {
        require5(
          /^bootstrap-checkout-[a-f0-9-]{36}\.json$/.test(String(item.name)) && !checkouts.has(String(item.name)),
          'opaque reference inventory differs',
        );
        checkouts.set(String(item.name), String(item.sha256));
      } else require5((await optional2(store, String(item.name))) === undefined, 'enrollment staging reappeared');
    }
    const preserve = new Set([
      'owner.json',
      'azure-native-lifecycle-retirement.json',
      ...(relay ? ['azure-native-relay-key-retirement.json'] : []),
      'azure-native-bootstrap-retirement.json',
      'azure-native-teardown-receipt.json',
      `${teardown.planId}.json`,
      `${teardown.planId}-authorization.json`,
      ...checkouts.keys(),
    ]);
    const core = new Set([
      'native-site.json',
      'platform-drain-source.json',
      'platform-drain-progress.json',
      'platform-drain-receipt.json',
      `site-binding-${base.siteName}.json`,
      `public-site-${base.siteName}.json`,
    ]);
    const allowed = (name) =>
      preserve.has(name) ||
      core.has(name) ||
      isAzureNativeVmAuthenticationArtifact(name) ||
      (Boolean(relay) &&
        (azureRelayHistoricalArtifacts.has(name) || isAzureRelayReplacementHistoricalArtifact(name))) ||
      (!relay &&
        (isAzureNativeReplacementHistory(name) ||
          isAzureNativeNetworkHistory(name) ||
          isAzureNativeNetworkCheckpointHistory(name) ||
          isAzureNativeNetworkGenerationCompletion(name))) ||
      isAzureIngressHistoricalArtifact(name) ||
      isAzureFailoverHistoricalArtifact(name) ||
      isAzureNativeUpgradeHistoricalArtifact(name) ||
      /^native-source-[a-f0-9]{64}\.json$/.test(name) ||
      /^native-action-[a-f0-9]{64}-[a-zA-Z0-9._-]+\.json$/.test(name) ||
      /^native-registration-node-[1-3]\.json$/.test(name) ||
      /^azure-ce-teardown-[a-f0-9]{24}(?:-authorization)?\.json$/.test(name);
    const inventory = async () => {
      await directory();
      const result = [],
        records = new Map();
      for (const name of (await readdir3(store.directory)).sort()) {
        if (name === markerName2 || name === lockName) continue;
        require5(allowed(name), 'unknown or unqualified artifact blocks retirement');
        const raw = await bytes(name);
        let record;
        try {
          record = object5(JSON.parse(raw.toString()));
        } catch {
          throw Error('Native parent retirement: malformed artifact');
        }
        records.set(name, record);
        result.push({ name, sha256: hash3(raw), preserve: preserve.has(name) });
      }
      for (const name of preserve) require5(records.has(name), 'terminal receipt or opaque reference missing');
      for (const [name, digest] of checkouts)
        require5(result.find((item) => item.name === name)?.sha256 === digest, 'opaque reference changed');
      return { result, records };
    };
    let marker = await optional2(store, markerName2);
    if (marker === undefined) {
      const { result, records } = await inventory();
      const sources = new Map([
        [base.planSha256, base],
        [cloud.planSha256, cloud],
      ]);
      for (const [name, value] of records)
        if (name.startsWith('native-source-')) {
          const source = value;
          verifyAzureCePlan(source);
          require5(
            source.engine === 'native' &&
              same5(azureUpgradeBinding(source).owner, binding.owner) &&
              source.siteName === base.siteName &&
              name === `native-source-${source.planSha256}.json`,
            'native source registry differs',
          );
          sources.set(source.planSha256, source);
        }
      verifyAzureNativeVmAuthenticationArtifacts(
        base,
        sources,
        teardown.retirement[0].siteUid,
        teardown.drain.siteContractFingerprint,
        records,
      );
      if (relay) verifyAzureRelayReplacementHistories(base, teardown.retirement[0].siteUid, records, sources);
      else {
        await verifyAzureNativeReplacementHistories(base, teardown.retirement[0].siteUid, records);
        await verifyAzureNativeNetworkHistoryRecords(base, teardown.retirement[0].siteUid, records);
        for (const source of sources.values())
          if (source.networkReplacementProfile) {
            const history = records.get(`native-replacement-history-${source.planSha256}.json`);
            if (history)
              await verifyAzureNativeNetworkReplacementRetirementSource(source, object5(history).replacement, {
                async read(name) {
                  require5(records.has(name), 'required network replacement record is missing');
                  return records.get(name);
                },
              });
          }
      }
      const identity = (value, source) => {
        if (Array.isArray(value)) {
          for (const row of value) identity(row, source);
          return;
        }
        if (!value || typeof value !== 'object') return;
        const row = value;
        if (row.owner !== undefined) require5(same5(row.owner, binding.owner), 'action payload owner differs');
        if (row.siteName !== undefined) require5(row.siteName === base.siteName, 'action payload site differs');
        if (row.engine !== undefined) require5(row.engine === 'native', 'action payload engine differs');
        if (row.sourcePlanSha256 !== undefined)
          require5(row.sourcePlanSha256 === source.planSha256, 'action payload source differs');
        for (const nested of Object.values(row)) identity(nested, source);
      };
      for (const [name, value] of records) {
        if (name === 'owner.json')
          require5(same5(value, { schemaVersion: 2, owner: binding.owner }), 'owner manifest differs');
        else if (/^azure-ce-teardown-[a-f0-9]{24}\.json$/.test(name) && name !== `${teardown.planId}.json`) {
          const prior = value;
          const priorCloud = sources.get(prior.cloudPlanSha256);
          require5(
            priorCloud &&
              same5(compileAzureNativeTeardown(base, priorCloud, prior.drain, prior.retirement), prior) &&
              name === `${prior.planId}.json`,
            'historical teardown source differs',
          );
        } else if (
          /^azure-ce-teardown-[a-f0-9]{24}-authorization\.json$/.test(name) &&
          name !== `${teardown.planId}-authorization.json`
        ) {
          const plan = records.get(name.replace('-authorization.json', '.json'));
          require5(
            plan &&
              same5(value, {
                schemaVersion: 1,
                engine: 'native',
                sourcePlanSha256: base.planSha256,
                teardownPlanSha256: plan.planSha256,
                mutations: true,
              }),
            'historical teardown authorization differs',
          );
        } else if (isAzureNativeNetworkGenerationCompletion(name)) {
          const source = sources.get(String(value.sourcePlanSha256));
          if (!source || name !== azureNativeNetworkGenerationCompletionName(source))
            throw Error('Azure native parent retirement: public generation source filename differs');
          await readAzureNativeNetworkGenerationCompletion(source, {
            async read(key) {
              require5(records.has(key), 'required completed generation record is missing');
              return records.get(key);
            },
          });
        } else if (name.startsWith('native-action-')) {
          keys4(value, [
            'schemaVersion',
            'engine',
            'owner',
            'sourcePlanSha256',
            'actionId',
            'actionSha256',
            'evidence',
          ]);
          const source = sources.get(String(value.sourcePlanSha256));
          const actions = source?.actions.filter((row) => row.id === value.actionId);
          require5(
            source &&
              actions?.length === 1 &&
              value.schemaVersion === 1 &&
              value.engine === 'native' &&
              same5(value.owner, binding.owner) &&
              value.actionSha256 === canonicalSha256(actions[0]) &&
              name === `native-action-${source.planSha256}-${value.actionId}.json`,
            'action source, owner or action differs',
          );
          const payload = object5(value.evidence);
          const action = actions?.[0];
          require5(
            action &&
              [
                'relay-provision',
                'vm-state-gate',
                'health-gate',
                'bgp-gate',
                'f5-ingress-configure',
                'traffic-gate',
              ].includes(action.kind),
            'unqualified action evidence kind',
          );
          if (payload.planId !== undefined) require5(payload.planId === source?.planId, 'action payload plan differs');
          if (payload.planSha256 !== undefined)
            require5(payload.planSha256 === source?.planSha256, 'action payload plan hash differs');
          if (action?.kind === 'relay-provision') {
            keys4(payload, [
              'status',
              'sourcePlanSha256',
              'relayPlanSha256',
              'resourceIds',
              'observedAt',
              'software',
              'routing',
              'traffic',
            ]);
            const profile = azureRelayPlanForDeployment(source);
            const ids = profile.relays.flatMap((row) => [
              ...(row.publicIpId ? [row.publicIpId] : []),
              row.nicId,
              row.vmId,
              `${profile.routeServerId}/bgpConnections/${row.name}`,
            ]);
            require5(
              payload.status === 'provisioned' &&
                payload.sourcePlanSha256 === source?.planSha256 &&
                payload.relayPlanSha256 === profile.planSha256 &&
                same5(payload.resourceIds, ids) &&
                payload.software === 'unknown' &&
                payload.routing === 'unknown' &&
                payload.traffic === 'unknown',
              'relay provisioning evidence differs',
            );
            timestamp2(payload.observedAt);
          } else if (action?.kind === 'vm-state-gate') {
            require5(
              payload.engine === 'native' &&
                payload.subscriptionId === source?.subscription.id &&
                payload.region === source?.region &&
                payload.deploymentId === source?.deploymentName &&
                payload.node === action.node &&
                payload.ownerPlanSha256 === action.expectedOwnerPlanSha256 &&
                payload.expectedPowerState === action.expectedPowerState &&
                ['healthy', 'degraded'].includes(String(payload.status)) &&
                payload.resourceId ===
                  `/subscriptions/${source?.subscription.id}/resourceGroups/${source?.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${source?.deploymentName}-${action.node}`,
              'VM gate evidence differs',
            );
            timestamp2(payload.observedAt);
          } else if (action?.kind === 'health-gate') {
            require5(
              payload.engine === 'native' &&
                payload.subscriptionId === source?.subscription.id &&
                payload.siteName === source?.siteName &&
                ['healthy', 'degraded', 'unknown'].includes(String(payload.status)) &&
                payload.scope === 'site-global-and-registration-only' &&
                ['nodeHealth', 'bgp', 'routes', 'traffic'].every((key) => payload[key] === 'unknown'),
              'CE health evidence differs',
            );
            timestamp2(payload.observedAt);
          } else if (action?.kind === 'bgp-gate' && source?.relayProfile) {
            const prefix = source.relayProfile.schemaVersion === 2 ? `${source.planId}-replacement-` : '';
            require5(
              same5(payload.configuration, records.get(`${prefix}relay-routing-configuration.json`)) &&
                same5(payload.observation, records.get(`${prefix}relay-routing-observation.json`)),
              'relay action and workflow observations differ',
            );
          } else if (action?.kind === 'f5-ingress-configure') {
            keys4(payload, [
              'ingressPlanId',
              'contractFingerprint',
              'uid',
              'listener',
              'routes',
              'traffic',
              'observedAt',
            ]);
            require5(
              typeof payload.ingressPlanId === 'string' &&
                /^[a-f0-9]{24}$/.test(payload.ingressPlanId) &&
                payload.contractFingerprint === contract.fingerprint &&
                typeof payload.uid === 'string' &&
                payload.uid.length > 0 &&
                payload.listener === 'configured',
              'ingress action evidence differs',
            );
            timestamp2(payload.observedAt);
          } else if (action?.kind === 'traffic-gate') {
            const ingress = source?.intent.ingress;
            const probe = ingress?.mode === 'platform-http' ? ingress.probe : undefined;
            require5(
              payload.source === 'azure:vm-run-command' &&
                payload.status === 'healthy' &&
                probe &&
                payload.httpStatus === probe.expectedStatus &&
                payload.expectedStatus === payload.httpStatus &&
                payload.bodySha256 === probe?.expectedBodySha256 &&
                payload.expectedBodySha256 === payload.bodySha256,
              'traffic gate evidence differs',
            );
            timestamp2(payload.observedAt);
          }
          identity(value.evidence, source);
        } else if (name === 'native-site.json') {
          keys4(value, ['siteName', 'uid', 'owner', 'contractFingerprint']);
          require5(
            value.siteName === base.siteName &&
              value.uid === teardown.retirement[0].siteUid &&
              same5(value.owner, binding.owner) &&
              value.contractFingerprint === teardown.drain.siteContractFingerprint,
            'site reservation differs',
          );
        } else if (name.startsWith('native-registration-node-')) {
          keys4(value, ['siteName', 'node', 'registration', 'instanceId', 'action', 'state']);
          const count = Number(name.match(/node-([1-3])/)?.[1]);
          require5(
            count <= binding.nodes.length &&
              binding.nodes.slice(0, count).includes(String(value.node)) &&
              value.siteName === base.siteName &&
              value.action === 'approve-registration' &&
              ['requested', 'submitted'].includes(String(value.state)) &&
              typeof value.registration === 'string' &&
              /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(value.registration) &&
              typeof value.instanceId === 'string' &&
              /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value.instanceId),
            'registration binding differs',
          );
        } else if (name === `site-binding-${base.siteName}.json`) {
          keys4(value, [
            'schemaVersion',
            'tenantOrigin',
            'contractFingerprint',
            'siteUid',
            'binding',
            'expectedInterfaces',
          ]);
          require5(
            value.schemaVersion === 1 &&
              same5(value.binding, binding) &&
              value.siteUid === teardown.retirement[0].siteUid &&
              value.contractFingerprint === teardown.drain.siteContractFingerprint &&
              typeof value.tenantOrigin === 'string' &&
              new URL(value.tenantOrigin).origin === value.tenantOrigin &&
              value.tenantOrigin.startsWith('https://') &&
              Array.isArray(value.expectedInterfaces),
            'deployment site binding differs',
          );
          const used = new Set(),
            roles = new Set();
          for (const raw of value.expectedInterfaces) {
            const row = object5(raw);
            keys4(row, ['node', 'role', 'mac', ...(row.staticIp !== undefined ? ['staticIp'] : [])]);
            require5(
              binding.nodes.includes(String(row.node)) &&
                ['slo', 'sli', 'data'].includes(String(row.role)) &&
                typeof row.mac === 'string' &&
                /^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/i.test(row.mac) &&
                !used.has(row.mac.toLowerCase()) &&
                !roles.has(`${row.node}/${row.role === 'data' ? 'sli' : row.role}`),
              'bound interface identity differs',
            );
            if (row.staticIp !== undefined) {
              const configured = object5(row.staticIp);
              keys4(configured, [
                'ip_address',
                ...(configured.default_gw !== undefined ? ['default_gw'] : []),
                ...(configured.dns_server !== undefined ? ['dns_server'] : []),
              ]);
              const ip = String(configured.ip_address).split('/');
              require5(
                ip.length === 2 &&
                  isIP3(ip[0]) === 4 &&
                  /^\d{1,2}$/.test(ip[1]) &&
                  Number(ip[1]) <= 32 &&
                  [configured.default_gw, configured.dns_server].every(
                    (value) => value === undefined || (typeof value === 'string' && isIP3(value) === 4),
                  ),
                'bound static interface configuration differs',
              );
            }
            used.add(String(row.mac).toLowerCase());
            roles.add(`${row.node}/${row.role === 'data' ? 'sli' : row.role}`);
          }
          require5(
            value.expectedInterfaces.length === 0 || value.expectedInterfaces.length === binding.nodes.length * 2,
            'partial bound interfaces',
          );
        } else if (name === `public-site-${base.siteName}.json`) {
          keys4(value, ['planId', 'record']);
          const record = object5(value.record);
          keys4(record, ['phase', 'resourceVersion', 'uid']);
          require5(
            typeof value.planId === 'string' &&
              /^f5xc-ce-v2-[a-f0-9]{24}$/.test(value.planId) &&
              ['replace-prepared', 'replace-observed'].includes(String(record.phase)) &&
              record.uid === teardown.retirement[0].siteUid &&
              typeof record.resourceVersion === 'string' &&
              record.resourceVersion.length > 0,
            'public site journal differs',
          );
        } else if (name === 'platform-drain-source.json')
          require5(
            same5(value, {
              sha256: canonicalSha256(teardown.drain),
              plan: teardown.drain,
            }),
            'drain source differs',
          );
        else if (name === 'platform-drain-progress.json' || name === 'platform-drain-receipt.json') {
          require5(records.has('platform-drain-source.json'), 'drain source missing');
          const completed = [
            ...teardown.drain.listeners.map((row) => `listener:${row.namespace}/${row.name}`),
            ...teardown.drain.origins.map((row) => `origin:${row.origin.namespace}/${row.origin.name}`),
            ...['bgp', 'bgp_routing_policy', 'external_connector'].flatMap((kind) =>
              teardown.drain.sites.flatMap((site) =>
                site.routing.filter((row) => row.kind === kind).map((row) => `${row.kind}:${row.name}`),
              ),
            ),
          ];
          require5(
            value.planSha256 === canonicalSha256(teardown.drain) && same5(value.completed, completed),
            'drain completed inventory differs',
          );
          timestamp2(value.observedAt);
          if (name.endsWith('progress.json')) {
            keys4(value, ['schemaVersion', 'planSha256', 'completed', 'observedAt']);
            require5(value.schemaVersion === 1, 'drain checkpoint schema differs');
          } else {
            keys4(value, [
              'status',
              'owner',
              'sourcePlanSha256',
              'planSha256',
              'completed',
              'cloud',
              'sites',
              'observedAt',
            ]);
            require5(
              value.status === 'platform-drained' &&
                same5(value.owner, binding.owner) &&
                value.sourcePlanSha256 === base.planSha256 &&
                value.cloud === 'unknown' &&
                value.sites === 'not-retired',
              'drain receipt differs',
            );
          }
        }
      }
      const relayRecords = new Map([...records].filter(([name]) => azureRelayHistoricalArtifacts.has(name)));
      if (relay) verifyAzureRelayHistoricalArtifacts(base, teardown.retirement[0].siteUid, relayRecords);
      verifyAzureIngressHistoricalArtifacts(base, teardown.drain, contract, records);
      verifyAzureNativeUpgradeHistoricalArtifacts(base, teardown, upgradeContract, records);
      await verifyAzureFailoverHistoricalArtifacts(base, teardown.retirement[0].siteUid, records);
      const draft = {
        schemaVersion: 1,
        engine: 'native',
        owner: binding.owner,
        sourcePlanSha256: base.planSha256,
        cloudPlanSha256: cloud.planSha256,
        teardownPlanSha256: teardown.planSha256,
        absenceSha256,
        artifacts: result,
        inventorySha256: canonicalSha256(result),
      };
      marker = { ...draft, checkpointSha256: canonicalSha256(draft), phase: 'retiring' };
      deadline.throwIfAborted();
      await store.write(markerName2, marker);
    }
    const value = object5(marker),
      { phase, checkpointSha256, ...draft } = value;
    keys4(value, [
      'schemaVersion',
      'engine',
      'owner',
      'sourcePlanSha256',
      'cloudPlanSha256',
      'teardownPlanSha256',
      'absenceSha256',
      'artifacts',
      'inventorySha256',
      'checkpointSha256',
      'phase',
    ]);
    require5(
      value.schemaVersion === 1 &&
        value.engine === 'native' &&
        same5(value.owner, binding.owner) &&
        value.sourcePlanSha256 === base.planSha256 &&
        value.cloudPlanSha256 === cloud.planSha256 &&
        value.teardownPlanSha256 === teardown.planSha256 &&
        sha3(value.absenceSha256) &&
        Array.isArray(value.artifacts) &&
        value.inventorySha256 === canonicalSha256(value.artifacts) &&
        checkpointSha256 === canonicalSha256(draft) &&
        ['retiring', 'retired'].includes(String(phase)),
      'checkpoint differs',
    );
    const recorded = new Map();
    for (const raw of value.artifacts) {
      const item = object5(raw);
      keys4(item, ['name', 'sha256', 'preserve']);
      require5(
        typeof item.name === 'string' &&
          allowed(item.name) &&
          sha3(item.sha256) &&
          item.preserve === preserve.has(String(item.name)) &&
          !recorded.has(String(item.name)),
        'inventory malformed',
      );
      recorded.set(String(item.name), item);
    }
    const current = (await inventory()).result;
    require5(
      current.every((item) => same5(item, recorded.get(item.name))) &&
        [...recorded.values()].every((item) => !item.preserve || current.some((row) => row.name === item.name)) &&
        (phase !== 'retired' || current.every((item) => item.preserve)),
      'inventory changed after preflight',
    );
    for (const name of checkouts.keys()) {
      await fresh();
      deadline.throwIfAborted();
      const checkout = object5(await store.read(name)).checkout;
      await retireBootstrapToken(checkout, String(bootstrap.absenceSha256), deadline);
    }
    for (const item of current.filter((item) => !item.preserve)) {
      await fresh();
      deadline.throwIfAborted();
      await store.verify();
      await directory();
      require5(hash3(await bytes(item.name)) === item.sha256, 'artifact changed before deletion');
      deadline.throwIfAborted();
      await unlink3(join3(store.directory, item.name));
    }
    await fresh();
    deadline.throwIfAborted();
    const final = (await inventory()).result;
    require5(
      final.every((item) => item.preserve && same5(item, recorded.get(item.name))),
      'final retained inventory differs',
    );
    if (phase !== 'retired') await store.write(markerName2, { ...value, phase: 'retired' });
    return {
      status: 'native-deployment-artifacts-retired',
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: teardown.planSha256,
      inventorySha256: value.inventorySha256,
      retiredArtifacts: [...recorded.values()].filter((item) => !item.preserve).length,
      remainingStaging: 0,
      completeCleanup: true,
    };
  } finally {
    await release();
  }
}

// plugins/azure/src/ce/terraform-teardown.ts
import { readdir as readdir31 } from 'node:fs/promises';

// plugins/azure/src/ce/terraform-destroy-ownership.ts
var cloudTypes = new Set([
  'azurerm_linux_virtual_machine',
  'azurerm_network_interface',
  'azurerm_network_interface_security_group_association',
  'azurerm_network_security_group',
  'azurerm_network_security_rule',
  'azurerm_public_ip',
  'azurerm_resource_group',
  'azurerm_route_server',
  'azurerm_route_server_bgp_connection',
  'azurerm_subnet',
  'azurerm_virtual_network',
]);
var udrTypes = new Set(['azurerm_route', 'azurerm_route_table', 'azurerm_subnet_route_table_association']);
var localTypes = new Set(['tls_private_key']);
var marketplaceTermsAddress = 'azapi_resource_action.marketplace_terms';
var marketplaceTermsType = 'Microsoft.MarketplaceOrdering/offerTypes/publishers/offers/plans/agreements@2021-01-01';
var object6 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Malformed Azure Terraform teardown identity');
  return value;
};
var lower = (value) => (typeof value === 'string' ? value.toLowerCase() : '');
async function read(api, plan, args, signal) {
  signal?.throwIfAborted();
  const result = await api.exec(
    'az',
    [...args, '--subscription', plan.subscription.id, '--output', 'json'],
    signal ? { signal } : undefined,
  );
  signal?.throwIfAborted();
  if (result.exitCode !== 0) throw new Error('Azure Terraform teardown ownership observation unavailable');
  try {
    return object6(JSON.parse(result.stdout));
  } catch {
    throw new Error('Malformed Azure Terraform teardown ownership observation');
  }
}
async function observeAzureTerraformDestroyBoundary(plan, api, signal) {
  verifyAzureCePlan(plan);
  const account = await read(api, plan, ['account', 'show'], signal);
  if (
    lower(account.id) !== lower(plan.subscription.id) ||
    lower(account.tenantId) !== lower(plan.subscription.tenantId) ||
    account.environmentName !== plan.subscription.cloud ||
    account.state !== 'Enabled'
  )
    throw new Error('Azure Terraform teardown account differs from deployment');
  const groupId = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}`;
  signal?.throwIfAborted();
  const existsResult = await api.exec(
    'az',
    [
      'group',
      'exists',
      '--name',
      plan.intent.resourceGroup,
      '--subscription',
      plan.subscription.id,
      '--output',
      'json',
    ],
    signal ? { signal } : undefined,
  );
  signal?.throwIfAborted();
  if (existsResult.exitCode !== 0) throw new Error('Azure Terraform teardown boundary observation unavailable');
  let exists;
  try {
    exists = JSON.parse(existsResult.stdout);
  } catch {
    throw new Error('Malformed Azure Terraform teardown boundary observation');
  }
  if (exists === false) return { status: 'absent', resourceGroupId: groupId, observedAt: new Date().toISOString() };
  if (exists !== true) throw new Error('Malformed Azure Terraform teardown boundary observation');
  const group = await read(api, plan, ['group', 'show', '--name', plan.intent.resourceGroup], signal);
  const tags = object6(group.tags);
  if (
    lower(group.id) !== lower(groupId) ||
    lower(group.location) !== lower(plan.region) ||
    tags['xcsh-managed-by'] !== 'azure-ce' ||
    tags['xcsh-execution-engine'] !== 'terraform' ||
    tags['xcsh-deployment-id'] !== plan.deploymentName ||
    tags['xcsh-plan-sha256'] !== plan.planSha256
  )
    throw new Error('Azure Terraform teardown resource group is foreign or replaced');
  return {
    status: 'owned',
    resourceGroupId: groupId,
    ownerPlanSha256: plan.planSha256,
    observedAt: new Date().toISOString(),
  };
}
async function verifyAzureTerraformDestroyOwnership(plan, receipt, session, api, env, signal) {
  verifyAzureCePlan(plan);
  if (
    plan.engine !== 'terraform' ||
    plan.intent.operation !== 'deploy' ||
    plan.intent.brownfield.resourceIds.length ||
    receipt.schemaVersion !== 1 ||
    receipt.engine !== 'terraform' ||
    receipt.operation !== 'destroy' ||
    receipt.deploymentId !== plan.deploymentName ||
    receipt.backendIdentity !== `local:${plan.deploymentName}` ||
    receipt.actionInvocations?.length ||
    receipt.changes.some(
      (change) =>
        change.actions.join(',') !== 'delete' ||
        !new RegExp(`^${change.type}\\.[a-z][a-z0-9_]*$`).test(change.address) ||
        (!cloudTypes.has(change.type) &&
          !(plan.routing.udr && udrTypes.has(change.type)) &&
          !localTypes.has(change.type) &&
          !(change.type === 'azapi_resource_action' && change.address === marketplaceTermsAddress)),
    ) ||
    new Set(receipt.changes.map((change) => change.address)).size !== receipt.changes.length
  )
    throw new Error('Exact owning Azure Terraform destroy plan with supported resource types required');
  const boundary = await observeAzureTerraformDestroyBoundary(plan, api, signal);
  if (boundary.status !== 'owned' && receipt.changes.length)
    throw new Error('Azure Terraform teardown resource group is absent');
  const groupId = boundary.resourceGroupId;
  const selections = receipt.changes.length
    ? Object.fromEntries(
        receipt.changes.map((change) => [
          change.address,
          change.type === 'azapi_resource_action'
            ? ['resource_id', 'type', 'method', 'when']
            : change.type === 'azurerm_subnet_route_table_association'
              ? ['id', 'subnet_id', 'route_table_id']
              : change.type === 'azurerm_route'
                ? ['id', 'name', 'address_prefix', 'route_table_name']
                : ['id'],
        ]),
      )
    : { 'azurerm_resource_group.ce': ['id'] };
  const fields = await session.readPlannedResourceFields(receipt, selections, env, signal);
  if (!receipt.changes.length) {
    if (fields['azurerm_resource_group.ce'] !== null || Object.keys(fields).length !== 1)
      throw new Error('Empty Azure Terraform destroy plan identity differs');
    return { resourceGroupId: groupId, resourceCount: 0, ownerPlanSha256: plan.planSha256 };
  }
  if (Object.keys(fields).length !== receipt.changes.length)
    throw new Error('Incomplete Azure Terraform teardown identity projection');
  for (const change of receipt.changes) {
    if (change.type === 'azapi_resource_action') {
      const terms = object6(fields[change.address]);
      const expectedResourceId = [
        `/subscriptions/${plan.subscription.id}`,
        'providers/Microsoft.MarketplaceOrdering',
        'offerTypes/virtualmachine',
        `publishers/${plan.image.publisher}`,
        `offers/${plan.image.offer}`,
        `plans/${plan.image.plan}`,
        'agreements/current',
      ].join('/');
      if (
        lower(terms.resource_id) !== lower(expectedResourceId) ||
        terms.type !== marketplaceTermsType ||
        terms.method !== 'PUT' ||
        terms.when !== 'apply'
      )
        throw new Error(
          'Azure Terraform destroy Marketplace agreement action differs from the exact apply-only contract',
        );
      continue;
    }
    if (udrTypes.has(change.type)) {
      const value = object6(fields[change.address]),
        udr = plan.routing.udr;
      if (!udr) throw Error('UDR teardown requires an explicit owning routing profile');
      const tableId = `${groupId}/providers/Microsoft.Network/routeTables/${plan.deploymentName}-rt`;
      if (change.type === 'azurerm_route_table') {
        if (change.address !== 'azurerm_route_table.ce' || lower(value.id) !== lower(tableId))
          throw Error('UDR teardown route table identity differs');
      } else if (change.type === 'azurerm_route') {
        const match = /^azurerm_route\.route_(\d+)$/.exec(change.address),
          index = match ? Number(match[1]) : -1;
        const name = `ce-route-${index + 1}`,
          prefix = plan.routing.destinationCidrs[index];
        if (
          !prefix ||
          lower(value.id) !== lower(`${tableId}/routes/${name}`) ||
          value.name !== name ||
          value.route_table_name !== `${plan.deploymentName}-rt` ||
          value.address_prefix !== prefix
        )
          throw Error('UDR teardown route destination or table identity differs');
      } else {
        const match = /^azurerm_subnet_route_table_association\.udr_(\d+)$/.exec(change.address),
          index = match ? Number(match[1]) : -1;
        const name = udr.subnetNames[index],
          subnetId = `${groupId}/providers/Microsoft.Network/virtualNetworks/${plan.deploymentName}-vnet/subnets/${name}`;
        if (
          !name ||
          lower(value.id) !== lower(subnetId) ||
          lower(value.subnet_id) !== lower(subnetId) ||
          lower(value.route_table_id) !== lower(tableId)
        )
          throw Error('UDR teardown approved subnet association differs');
      }
      continue;
    }
    const id = object6(fields[change.address]).id;
    if (typeof id !== 'string' || !id) throw new Error('Azure Terraform teardown resource ID is unavailable');
    if (localTypes.has(change.type)) continue;
    if (
      change.type === 'azurerm_resource_group'
        ? lower(id) !== lower(groupId)
        : !lower(id).startsWith(`${lower(groupId)}/`)
    )
      throw new Error('Azure Terraform destroy target is outside the owned resource group');
  }
  return { resourceGroupId: groupId, resourceCount: receipt.changes.length, ownerPlanSha256: plan.planSha256 };
}

// plugins/azure/src/ce/terraform-pending-import.ts
import { createHash as createHash5 } from 'node:crypto';

var hash4 = (s) => createHash5('sha256').update(s).digest('hex');
var object7 = (v) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Malformed pending Azure VM identity');
  return v;
};
var journalName = 'azure-terraform-pending-vm-import.json';
async function reconcileAzurePendingVm(base, session, storage, api, env, signal) {
  if (
    !session.readResourceIdentities ||
    !session.readConfigurationSha256 ||
    !session.planImports ||
    !session.readPlanApplicationHistory
  )
    throw Error('Pending Azure VM owning import service unavailable');
  const id = `/subscriptions/${base.subscription.id}/resourceGroups/${base.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${base.deploymentName}-1`;
  const address = 'azurerm_linux_virtual_machine.node_1';
  const observe = async () => {
    if ((await observeAzureTerraformDestroyBoundary(base, api, signal)).status !== 'owned') return;
    const r = await api.exec(
      'az',
      ['vm', 'show', '--ids', id, '--subscription', base.subscription.id, '--output', 'json'],
      signal ? { signal } : undefined,
    );
    if (r.exitCode !== 0) {
      if (/ResourceNotFound|ResourceGroupNotFound/.test(r.stderr)) return;
      throw Error('Pending Azure VM observation unavailable');
    }
    const vm = object7(JSON.parse(r.stdout)),
      tags = object7(vm.tags);
    const expected = base.nics
      .map((n) => n.index)
      .map(
        (i) =>
          `${id.split('/providers/')[0]}/providers/Microsoft.Network/networkInterfaces/${base.deploymentName}-1-nic${i}`,
      );
    const nics = object7(vm.networkProfile).networkInterfaces;
    if (
      vm.id !== id ||
      vm.name !== `${base.deploymentName}-1` ||
      vm.location !== base.region ||
      vm.provisioningState !== 'Failed' ||
      typeof vm.vmId !== 'string' ||
      !vm.vmId ||
      object7(vm.hardwareProfile).vmSize !== base.vm.size ||
      tags['xcsh-managed-by'] !== 'azure-ce' ||
      tags['xcsh-execution-engine'] !== 'terraform' ||
      tags['xcsh-deployment-id'] !== base.deploymentName ||
      tags['xcsh-plan-sha256'] !== base.planSha256 ||
      tags['xcsh-node-index'] !== '1' ||
      tags['ves-io-site-name'] !== base.siteName ||
      !Array.isArray(nics) ||
      nics.length !== base.nics.length ||
      canonicalSha256(nics.map((n) => object7(n).id).sort()) !==
        canonicalSha256(expected.slice(0, base.nics.length).sort())
    )
      throw Error('Pending Azure VM is foreign, replaced or no longer failed');
    return vm;
  };
  let saved;
  try {
    saved = object7(await storage.read(journalName));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const identities = await session.readResourceIdentities(env, signal);
  const existing = identities.filter((r) => r.address === address);
  if (
    existing.length &&
    (existing.length !== 1 || existing[0].id !== id || existing[0].type !== 'azurerm_linux_virtual_machine')
  )
    throw Error('Pending VM state identity differs');
  if (existing.length && !saved) return false;
  const vm = await observe();
  if (!vm) {
    if (saved && saved.status !== 'imported') throw Error('Pending VM disappeared before import reconciliation');
    return;
  }
  if (!saved) {
    const configurationSha256 = await session.readConfigurationSha256();
    const originalConfiguration = await session.readConfiguration(configurationSha256);
    const config = object7(JSON.parse(originalConfiguration)),
      resources = object7(config.resource);
    const desired = object7(object7(resources.azurerm_linux_virtual_machine).node_1);
    const keys = object7(object7(object7(vm.osProfile).linuxConfiguration).ssh).publicKeys;
    if (!Array.isArray(keys) || keys.length !== 1 || typeof object7(keys[0]).keyData !== 'string')
      throw Error('Pending VM public bootstrap identity unavailable');
    desired.admin_ssh_key = [{ username: object7(vm.osProfile).adminUsername, public_key: object7(keys[0]).keyData }];
    desired.lifecycle = { ignore_changes: 'all' };
    if (!identities.some((r) => r.type === 'tls_private_key')) delete resources.tls_private_key;
    if (config.output) {
      const names = Object.keys(object7(config.output));
      const values = await session.readOutputs(names, env, signal, true);
      const output = {};
      for (const name of names) if (Object.hasOwn(values, name)) output[name] = { value: values[name] };
      if (Object.keys(output).length) config.output = output;
      else delete config.output;
    }
    config.import = [{ to: address, id }];
    const importedConfiguration = JSON.stringify(config);
    saved = {
      schemaVersion: 2,
      sourcePlanSha256: base.planSha256,
      vmId: String(vm.vmId),
      id,
      address,
      originalConfiguration,
      configurationSha256,
      importedConfiguration,
      importedConfigurationSha256: hash4(importedConfiguration),
    };
    await storage.write(journalName, saved);
  }
  if (
    saved.schemaVersion !== 2 ||
    saved.sourcePlanSha256 !== base.planSha256 ||
    saved.id !== id ||
    saved.address !== address ||
    saved.vmId !== vm.vmId ||
    typeof saved.originalConfiguration !== 'string' ||
    typeof saved.importedConfiguration !== 'string' ||
    hash4(saved.originalConfiguration) !== saved.configurationSha256 ||
    hash4(saved.importedConfiguration) !== saved.importedConfigurationSha256
  )
    throw Error('Pending Azure VM import journal differs');
  const intents = [
    {
      address,
      type: 'azurerm_linux_virtual_machine',
      providerName: 'registry.terraform.io/hashicorp/azurerm',
      idSha256: hash4(id),
    },
  ];
  const validateReceipt = (receipt) => {
    if (
      receipt.schemaVersion !== 1 ||
      receipt.engine !== 'terraform' ||
      receipt.deploymentId !== base.deploymentName ||
      receipt.backendIdentity !== `local:${base.deploymentName}` ||
      receipt.configurationSha256 !== saved?.importedConfigurationSha256 ||
      !/^[a-f0-9]{64}$/.test(receipt.planSha256) ||
      !/^[a-f0-9]{64}$/.test(receipt.providerLockSha256) ||
      receipt.noChanges !== false ||
      receipt.operation ||
      receipt.refreshOriginSha256 ||
      receipt.actionInvocations?.length ||
      receipt.relinquishments?.length ||
      canonicalSha256(receipt.imports) !== canonicalSha256(intents) ||
      !Array.isArray(receipt.changes) ||
      new Set(receipt.changes.map((c) => c.address)).size !== receipt.changes.length ||
      receipt.changes.some((c) => c.actions.join(',') !== 'no-op')
    )
      throw Error('Pending VM import plan is mutating or foreign');
  };
  const appliedHistory = async (receipt) => {
    validateReceipt(receipt);
    const readHistory = session.readPlanApplicationHistory;
    if (!readHistory) throw Error('Pending VM import history service unavailable');
    const history = await readHistory.call(session, receipt, signal);
    if (
      history.schemaVersion !== 1 ||
      history.scope !== 'exact-saved-plan-journal-history' ||
      history.receiptSha256 !== canonicalSha256(receipt) ||
      !/^[a-f0-9]{64}$/.test(history.manifestSha256) ||
      history.incompleteArchives !== 0 ||
      history.applicationOutcomeQualified !== false ||
      history.retirementQualified !== false ||
      !Array.isArray(history.matches) ||
      !history.matches.length
    )
      throw Error('Pending VM import exact journal history unavailable');
    const seen = new Set();
    let applied = false;
    for (const match of history.matches) {
      const key = `${match.location}/${match.archiveSha256}`;
      if (
        !['current', 'revision', 'plan-history'].includes(match.location) ||
        seen.has(key) ||
        !['planned', 'applied'].includes(match.state) ||
        !/^[a-f0-9]{64}$/.test(match.archiveSha256) ||
        !/^[a-f0-9]{64}$/.test(match.journalSha256) ||
        !/^[a-f0-9]{64}$/.test(match.manifestSha256) ||
        match.savedPlanSha256 !== receipt.planSha256 ||
        match.configurationSha256 !== receipt.configurationSha256
      )
        throw Error('Pending VM import archived journal differs');
      seen.add(key);
      applied ||= match.state === 'applied';
    }
    if (!applied) throw Error('Pending VM import applied history unavailable');
    return history;
  };
  const recheckCompletion = async (expectedConfigurationSha256) => {
    signal?.throwIfAborted();
    if (!session.readResourceIdentities || !session.readConfigurationSha256)
      throw Error('Pending VM import owning observer changed');
    const rows = (await session.readResourceIdentities(env, signal)).filter((row) => row.address === address);
    if (rows.length !== 1 || rows[0].id !== id || rows[0].type !== 'azurerm_linux_virtual_machine')
      throw Error('Pending VM state identity differs');
    if (canonicalSha256(await observe()) !== canonicalSha256(vm))
      throw Error('Pending VM changed before import completion');
    if ((await session.readConfigurationSha256()) !== expectedConfigurationSha256)
      throw Error('Pending VM import configuration changed');
    signal?.throwIfAborted();
    return { address: rows[0].address, type: rows[0].type, id: rows[0].id };
  };
  let receipt = saved.receipt;
  const retainApplication = async (appliedReceipt) => {
    const history = await appliedHistory(appliedReceipt);
    const stateIdentity = await recheckCompletion(saved.configurationSha256);
    const body = {
      schemaVersion: 1,
      receiptSha256: canonicalSha256(appliedReceipt),
      vmObservationSha256: canonicalSha256(vm),
      stateIdentity,
      history,
      historySha256: canonicalSha256(history),
      originalConfigurationSha256: saved.configurationSha256,
      importedConfigurationSha256: saved.importedConfigurationSha256,
    };
    return { ...body, evidenceSha256: canonicalSha256(body) };
  };
  if (saved.status === 'imported') {
    const application = saved.application;
    if (!application || !receipt) throw Error('Pending VM imported checkpoint lacks state provenance');
    const { evidenceSha256, ...body } = application;
    if (
      application.schemaVersion !== 1 ||
      evidenceSha256 !== canonicalSha256(body) ||
      application.receiptSha256 !== canonicalSha256(receipt) ||
      application.historySha256 !== canonicalSha256(application.history) ||
      application.originalConfigurationSha256 !== saved.configurationSha256 ||
      application.importedConfigurationSha256 !== saved.importedConfigurationSha256 ||
      canonicalSha256(application.stateIdentity) !==
        canonicalSha256({ address, type: 'azurerm_linux_virtual_machine', id })
    )
      throw Error('Pending VM imported checkpoint state provenance differs');
  }
  const current = await session.readConfigurationSha256();
  if (current === saved.configurationSha256) {
    if (existing.length) {
      if (!receipt) throw Error('Pending VM reconciliation lacks saved import receipt');
      const observedHistory = await appliedHistory(receipt);
      await recheckCompletion(saved.configurationSha256);
      if (canonicalSha256(await observe()) !== canonicalSha256(vm))
        throw Error('Pending VM changed before import reconciliation');
      if (saved.status === 'imported') {
        if (
          !saved.application ||
          canonicalSha256(saved.application.history.matches) !== canonicalSha256(observedHistory.matches)
        )
          throw Error('Pending VM original applied history changed');
        return true;
      }
      saved.application = await retainApplication(receipt);
      saved.status = 'imported';
      await storage.write(journalName, saved);
      return true;
    }
    await session.reviseConfiguration(current, saved.importedConfiguration);
  } else if (current !== saved.importedConfigurationSha256)
    throw Error('Pending import executor configuration differs');
  receipt ??= await session.planImports(intents, env, signal);
  validateReceipt(receipt);
  saved.receipt = receipt;
  await storage.write(journalName, saved);
  if (canonicalSha256(await observe()) !== canonicalSha256(vm))
    throw Error('Pending VM changed before import submission');
  const state = await session.readPlanApplicationState(receipt);
  if (state === 'planned') await session.apply(receipt, env, signal);
  const projected = await session.readResourceIdentities(env, signal);
  if (
    projected.filter((r) => r.address === address).length !== 1 ||
    projected.find((r) => r.address === address)?.id !== id ||
    projected.find((r) => r.address === address)?.type !== 'azurerm_linux_virtual_machine' ||
    canonicalSha256(await observe()) !== canonicalSha256(vm)
  )
    throw Error('Pending VM import outcome unavailable');
  if ((await session.readPlanApplicationState(receipt)) === 'applying')
    await session.reconcileApplyFromEvidence(receipt, canonicalSha256({ projected, vm }));
  if ((await session.readPlanApplicationState(receipt)) !== 'applied')
    throw Error('Pending VM import lacks applied journal');
  await appliedHistory(receipt);
  await recheckCompletion(saved.importedConfigurationSha256);
  await session.reviseConfiguration(saved.importedConfigurationSha256, saved.originalConfiguration);
  saved.application = await retainApplication(receipt);
  saved.status = 'imported';
  await storage.write(journalName, saved);
  return true;
}

// plugins/azure/src/ce/terraform-cloud-teardown.ts
async function optional3(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function runAzureTerraformCloudTeardown(plan, session, storage, api, env, signal, pendingAdmission = false) {
  verifyAzureCePlan(plan);
  if (plan.engine !== 'terraform' || plan.intent.operation !== 'deploy')
    throw new Error('Azure Terraform teardown requires the original Terraform deployment plan');
  await storage.verify();
  const name = 'azure-terraform-cloud-destroy-plan.json';
  let receipt = await optional3(storage, name);
  if (pendingAdmission) {
    if (receipt && (await session.readPlanApplicationState(receipt)) === 'applying') {
      const boundary = await observeAzureTerraformDestroyBoundary(plan, api, signal);
      await storage.write('azure-terraform-cloud-destroy-reconciliation.json', boundary);
      await session.reconcileApplyFromEvidence(receipt, canonicalSha256(boundary));
    }
    if (await reconcileAzurePendingVm(plan, session, storage, api, env, signal)) receipt = undefined;
  }
  if (!receipt) {
    receipt = await session.planDestroy(env, signal);
    await verifyAzureTerraformDestroyOwnership(plan, receipt, session, api, env, signal);
    await storage.write(name, receipt);
  }
  if (!receipt.noChanges) {
    try {
      await session.apply(receipt, env, signal);
    } catch {
      const evidence = await observeAzureTerraformDestroyBoundary(plan, api, signal);
      await storage.write('azure-terraform-cloud-destroy-reconciliation.json', evidence);
      await session.reconcileApplyFromEvidence(receipt, canonicalSha256(evidence));
      if (evidence.status !== 'absent') {
        receipt = await session.planDestroy(env, signal);
        await verifyAzureTerraformDestroyOwnership(plan, receipt, session, api, env, signal);
        await storage.write(name, receipt);
        if (!receipt.noChanges) await session.apply(receipt, env, signal);
      }
    }
  }
  const final = await session.planDestroy(env, signal);
  if (
    final.engine !== 'terraform' ||
    final.operation !== 'destroy' ||
    final.deploymentId !== plan.deploymentName ||
    final.backendIdentity !== `local:${plan.deploymentName}` ||
    !final.noChanges ||
    final.changes.length
  )
    throw new Error('Azure Terraform cloud teardown did not converge to no changes');
  await storage.write('azure-terraform-cloud-destroy-final.json', final);
  return {
    status: 'terraform-cloud-retired',
    sourcePlanSha256: plan.planSha256,
    finalPlanSha256: final.planSha256,
  };
}

// plugins/azure/src/ce/terraform-enrollment-history.ts
import { readdir as readdir4 } from 'node:fs/promises';

async function collectAzureHistoricalEnrollmentTokens(request, storage, signal) {
  signal?.throwIfAborted();
  const plan = structuredClone(request),
    binding = azureUpgradeBinding(plan),
    owner = canonicalSha256(storage.owner),
    { directory, verify, read } = storage;
  verifyAzureCePlan(plan);
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    if (
      canonicalSha256(request) !== canonicalSha256(plan) ||
      canonicalSha256(storage.owner) !== owner ||
      owner !== canonicalSha256(binding.owner) ||
      storage.directory !== directory ||
      storage.verify !== verify ||
      storage.read !== read
    )
      throw Error('Azure historical enrollment owning context differs');
  };
  const bounded = async (work) => {
    seal();
    const canceled = Promise.withResolvers(),
      onAbort = () => canceled.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      deadline.throwIfAborted();
      const result = await Promise.race([work(), canceled.promise]);
      seal();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  seal();
  await bounded(() => verify.call(storage));
  seal();
  const initial = await bounded(() => readdir4(directory, { withFileTypes: true })),
    names = initial.map((entry) => entry.name).sort(),
    records = new Map(),
    tokens = [];
  for (const [index, node] of binding.nodes.entries()) {
    const prefixes = [
      `${plan.deploymentName.slice(0, 40)}-${index + 1}-`,
      `${plan.siteName.slice(0, 36)}-${index + 1}-r-`,
    ];
    for (const entry of initial) {
      const prefix = prefixes.find((value) => entry.name.startsWith(value));
      if (!prefix || !/^[a-f0-9]{12}\.json$/.test(entry.name.slice(prefix.length))) continue;
      seal();
      if (!entry.isFile()) throw Error('Azure historical enrollment artifact is not a regular file');
      const raw = await bounded(() => read.call(storage, entry.name));
      seal();
      if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw Error('Azure historical enrollment record is malformed');
      const value = raw;
      if (
        Object.keys(value).sort().join(',') !== 'jwt,node,siteName,tokenName' ||
        value.tokenName !== entry.name.slice(0, -5) ||
        value.siteName !== binding.siteName ||
        value.node !== node ||
        typeof value.jwt !== 'string' ||
        !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.jwt) ||
        records.has(entry.name)
      )
        throw Error('Azure historical enrollment identity or schema differs');
      records.set(entry.name, canonicalSha256(raw));
      tokens.push({ node, name: String(value.tokenName) });
    }
  }
  seal();
  if (canonicalSha256((await bounded(() => readdir4(directory))).sort()) !== canonicalSha256(names))
    throw Error('Azure historical enrollment namespace changed');
  for (const [name, digest] of records) {
    if (canonicalSha256(await bounded(() => read.call(storage, name))) !== digest)
      throw Error('Azure historical enrollment record changed');
    seal();
  }
  await bounded(() => verify.call(storage));
  seal();
  if (canonicalSha256((await bounded(() => readdir4(directory))).sort()) !== canonicalSha256(names))
    throw Error('Azure historical enrollment namespace changed');
  seal();
  return tokens.sort((a, b) => a.name.localeCompare(b.name));
}

// plugins/azure/src/ce/terraform-foundation-teardown.ts
// plugins/terraform/src/initialization.ts
import { createHash as createHash6, createHash as createHash7 } from 'node:crypto';
import { constants } from 'node:fs';
import {
  lstat as lstat4,
  lstat as lstat5,
  mkdir as mkdir2,
  open,
  readdir as readdir5,
  readdir as readdir6,
  readFile as readFile4,
  realpath as realpath4,
  realpath as realpath5,
  unlink as unlink4,
  writeFile as writeFile2,
} from 'node:fs/promises';
import { isAbsolute as isAbsolute2, join as join4, join as join5, resolve as resolve2 } from 'node:path';

var hash5 = (bytes) => createHash6('sha256').update(bytes).digest('hex');
async function directory(path) {
  const stat = await lstat4(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    stat.mode & 63 ||
    (await realpath4(path)) !== path
  )
    throw Error('Initialization directory custody differs');
  return { dev: stat.dev, ino: stat.ino, uid: stat.uid };
}
async function exists(path) {
  try {
    await lstat4(path);
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return false;
  }
}
async function bytes(path) {
  const before = await lstat4(path);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.uid !== process.getuid?.() ||
    before.mode & 63
  )
    throw Error('Initialization input custody differs');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      opened.size !== before.size ||
      opened.uid !== before.uid ||
      opened.mode !== before.mode ||
      opened.nlink !== 1
    )
      throw Error('Initialization input changed before observation');
    const value = await handle.readFile();
    const after = await handle.stat();
    const pathAfter = await lstat4(path);
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs ||
      after.nlink !== 1 ||
      after.mode !== before.mode ||
      after.uid !== before.uid ||
      pathAfter.dev !== after.dev ||
      pathAfter.ino !== after.ino ||
      pathAfter.isSymbolicLink()
    )
      throw Error('Initialization input changed during observation');
    return { value, stat: after };
  } finally {
    await handle.close();
  }
}
async function readInitializationManifest(root, deploymentId, owner) {
  if (
    !isAbsolute2(root) ||
    resolve2(root) !== root ||
    !/^[a-z][a-z0-9-]{0,62}$/.test(deploymentId) ||
    owner.engine !== 'terraform' ||
    owner.deploymentId !== deploymentId
  )
    throw Error('Initialization read owner differs');
  const custody = await directory(root);
  const raw = await bytes(join4(root, `.initialization-${deploymentId}.json`));
  if (raw.value.length > 65536) throw Error('Initialization intent size is invalid');
  const record = JSON.parse(raw.value.toString());
  const manifest = record.manifest;
  const scope = manifest?.scope;
  const inputs = record.inputs;
  if (
    Object.keys(record).sort().join(',') !== 'custody,deploymentId,inputs,manifest,root,schemaVersion' ||
    record.schemaVersion !== 1 ||
    record.root !== root ||
    record.deploymentId !== deploymentId ||
    JSON.stringify(record.custody) !== JSON.stringify(custody) ||
    !manifest ||
    !scope ||
    !inputs ||
    manifest.schemaVersion !== 1 ||
    manifest.engine !== owner.engine ||
    manifest.deploymentId !== deploymentId ||
    scope.cloud !== owner.provider ||
    scope.account !== owner.account ||
    scope.region !== owner.region ||
    Object.keys(inputs).sort().join(',') !== '.terraform.lock.hcl,deployment.json,deployment.tfrc,main.tf.json' ||
    Object.values(inputs).some((value) => typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) ||
    inputs['deployment.json'] !== hash5(Buffer.from(JSON.stringify(manifest))) ||
    inputs['main.tf.json'] !== manifest.configurationSha256 ||
    inputs['.terraform.lock.hcl'] !== manifest.providerLockSha256
  )
    throw Error('Original initialization manifest is unqualified');
  if (await exists(join4(root, deploymentId))) {
    await directory(join4(root, deploymentId));
    const names = await readdir5(join4(root, deploymentId));
    if (names.some((name) => !Object.hasOwn(inputs, name)))
      throw Error('Unqualified initialization artifacts block manifest observation');
    for (const name of names) await bytes(join4(root, deploymentId, name));
  }
  if (JSON.stringify(await directory(root)) !== JSON.stringify(custody))
    throw Error('Initialization read parent changed');
  return structuredClone(manifest);
}

// plugins/azure/src/ce/terraform-foundation-teardown.ts
var hash6 = (v) => createHash7('sha256').update(v).digest('hex');
var sha4 = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
var object8 = (v) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Malformed Azure foundation retirement evidence');
  return v;
};
var checkpointName = 'azure-terraform-foundation-teardown-checkpoint.json';
var receiptName = 'azure-terraform-foundation-teardown-receipt.json';
async function optional4(store, name) {
  try {
    return await store.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function deployment(base, version) {
  if (!['1.16.1', '1.16.5', AZURE_CE_TERRAFORM_VERSION].includes(version))
    throw Error('Azure foundation retirement runtime is unqualified');
  const value = await azureTerraformFoundationDeployment(base);
  const config = JSON.parse(value.configuration);
  config.terraform.required_version = `= ${version}`;
  return { ...value, terraformVersion: version, configuration: JSON.stringify(config) };
}
var manifest = ({ configuration, providerLock, ...identity }) => ({
  ...identity,
  configurationSha256: hash6(configuration),
  providerLockSha256: hash6(providerLock),
});
var emptyConfiguration = (value) => {
  const config = JSON.parse(value.configuration);
  return JSON.stringify({ terraform: config.terraform, provider: config.provider });
};
async function privateManifest(store, name) {
  await store.verify();
  try {
    const directory = join5(store.directory, name);
    const dir = await lstat5(directory);
    if (
      !dir.isDirectory() ||
      dir.isSymbolicLink() ||
      dir.uid !== process.getuid?.() ||
      (await realpath5(directory)) !== directory
    )
      throw Error('Azure foundation workspace ownership differs');
    const file = join5(directory, 'deployment.json');
    const stat = await lstat5(file);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      stat.uid !== process.getuid?.() ||
      stat.mode & 63
    )
      throw Error('Azure foundation manifest ownership differs');
    return object8(JSON.parse(await readFile4(file, 'utf8')));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return readInitializationManifest(store.directory, name, store.owner);
  }
}
async function journal(base, store, reservedSite) {
  verifyAzureCePlan(base);
  await store.verify();
  if (
    base.engine !== 'terraform' ||
    base.intent.operation !== 'deploy' ||
    canonicalSha256(store.owner) !== canonicalSha256(azureUpgradeBinding(base).owner)
  )
    throw Error('Azure foundation retirement requires the original owning deployment');
  const authorization = object8(await store.read(`terraform-authorization-${base.planSha256}.json`));
  const workflow = object8(await store.read('terraform-workflow.json'));
  if (
    authorization.schemaVersion !== 1 ||
    authorization.engine !== 'terraform' ||
    authorization.planSha256 !== base.planSha256 ||
    authorization.mutations !== true ||
    workflow.schemaVersion !== 1 ||
    workflow.engine !== 'terraform' ||
    workflow.planSha256 !== base.planSha256 ||
    workflow.stage !== 'network-pending' ||
    !sha4(workflow.configurationSha256) ||
    Object.keys(object8(workflow.bootstrapByNode)).length ||
    Object.keys(object8(workflow.launchedAtByNode)).length
  )
    throw Error('Azure foundation retirement requires exact pre-admission authorization and journal');
  if (reservedSite) {
    const binding = azureUpgradeBinding(base);
    const site = object8(await store.read('terraform-site.json'));
    const saved = object8(await store.read(`site-binding-${base.siteName}.json`));
    const origin = new URL(String(saved.tenantOrigin));
    if (
      site.siteName !== base.siteName ||
      site.uid !== reservedSite.siteUid ||
      canonicalSha256(site.owner) !== canonicalSha256(binding.owner) ||
      site.contractFingerprint !== saved.contractFingerprint ||
      saved.schemaVersion !== 1 ||
      saved.siteUid !== reservedSite.siteUid ||
      canonicalSha256(saved.binding) !== canonicalSha256(binding) ||
      !Array.isArray(saved.expectedInterfaces) ||
      saved.expectedInterfaces.length ||
      origin.protocol !== 'https:' ||
      origin.username ||
      origin.password ||
      origin.search ||
      origin.hash ||
      origin.pathname !== '/'
    )
      throw Error('Reserved Azure site provenance differs');
  }
  const allowed = new Set([
    'owner.json',
    base.deploymentName,
    `terraform-authorization-${base.planSha256}.json`,
    'terraform-workflow.json',
    'terraform-foundation-plan.json',
    'azure-terraform-lifecycle-retirement.json',
    'azure-terraform-cloud-destroy-plan.json',
    'azure-terraform-cloud-destroy-final.json',
    'azure-terraform-cloud-destroy-reconciliation.json',
    checkpointName,
    receiptName,
  ]);
  for (const entry of await readdir6(store.directory, { withFileTypes: true })) {
    if (entry.name === `.initialization-${base.deploymentName}.json`) {
      if (!entry.isFile()) throw Error('Azure initialization intent type differs');
      await readInitializationManifest(store.directory, base.deploymentName, store.owner);
      continue;
    }
    if (reservedSite && ['terraform-site.json', `site-binding-${base.siteName}.json`].includes(entry.name)) {
      if (!entry.isFile()) throw Error('Reserved Azure site artifact type differs');
      continue;
    }
    if (entry.name === 'terraform-original-deployment-receipts') {
      if (!entry.isDirectory()) throw Error('Azure foundation original receipt namespace type differs');
      const inventory = await readAzureTerraformOriginalReceiptInventory(base, {}, store);
      if (
        inventory.status !== 'complete' ||
        inventory.records.some(
          (row) => row.record.stage.kind !== 'foundation' || Object.keys(row.record.bootstrapSha256ByNode).length !== 0,
        )
      )
        throw Error('Azure foundation original receipt metadata is incomplete or contains admission');
      continue;
    }
    if (allowed.has(entry.name)) {
      if (entry.name !== base.deploymentName && !entry.isFile()) throw Error('Azure retirement journal type differs');
      continue;
    }
    if (/^azure-ce-foundation-teardown-[a-f0-9]{24}(?:-authorization)?\.json$/.test(entry.name) && entry.isFile())
      continue;
    if (entry.name === '.azure-terraform-lifecycle-lock' && entry.isDirectory()) continue;
    throw Error('Azure admission or another lifecycle has started; explicit platform retirement is required');
  }
  return workflow;
}
function requireAbsence(value, base, runtime, contract) {
  const at = Date.parse(value.observedAt);
  if (
    value.status !== 'absent' ||
    canonicalSha256(value.owner) !== canonicalSha256(azureUpgradeBinding(base).owner) ||
    value.siteContractFingerprint !== runtime.contract.fingerprint ||
    value.ingressContractFingerprint !== contract.fingerprint ||
    !Number.isFinite(at) ||
    at > Date.now() ||
    Date.now() - at > 60000
  )
    throw Error('Fresh unregistered Azure platform absence is unavailable');
  return value;
}
function requireReservedObservation(value, base, runtime, contract, expected, exact) {
  const at = Date.parse(value.observedAt);
  if (value.status !== 'observed') throw Error('Fresh reserved Azure site inventory unavailable');
  const site = value.sites?.[0];
  if (
    canonicalSha256(value.owner) !== canonicalSha256(azureUpgradeBinding(base).owner) ||
    value.siteContractFingerprint !== runtime.contract.fingerprint ||
    value.ingressContractFingerprint !== contract.fingerprint ||
    !Number.isFinite(at) ||
    at > Date.now() ||
    Date.now() - at > 60000 ||
    !Array.isArray(value.resources) ||
    value.resources.length ||
    !Array.isArray(value.sites) ||
    value.sites.length !== 1 ||
    !site ||
    site.siteName !== base.siteName ||
    (site.siteUid !== expected.siteUid && (exact || site.siteUid !== null)) ||
    (site.physicalSiteUid !== expected.physicalSiteUid && (exact || site.physicalSiteUid !== null)) ||
    (expected.physicalSiteUid !== null &&
      (typeof expected.physicalSiteUid !== 'string' || !expected.physicalSiteUid.trim()))
  )
    throw Error('Fresh reserved Azure site inventory differs or enrollment has started');
  return value;
}
function compile(base, source, site, ingress, reservedSite) {
  verifyAzureCePlan(base);
  if (
    base.engine !== 'terraform' ||
    !sha4(source.configurationSha256) ||
    !sha4(source.manifestSha256) ||
    !/^sha256:[a-f0-9]{64}$/.test(site) ||
    !/^sha256:[a-f0-9]{64}$/.test(ingress)
  )
    throw Error('Azure foundation teardown source or contract differs');
  const draft = {
    schemaVersion: 1,
    kind: 'azure-ce-terraform-foundation-teardown',
    engine: 'terraform',
    sourcePlanSha256: base.planSha256,
    source: structuredClone(source),
    drain: {
      schemaVersion: 1,
      owner: azureUpgradeBinding(base).owner,
      sourcePlanSha256: base.planSha256,
      siteContractFingerprint: site,
      ingressContractFingerprint: ingress,
      sites: [],
      listeners: [],
      origins: [],
    },
    retirement: [],
    ...(reservedSite ? { reservedSite: structuredClone(reservedSite) } : {}),
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-foundation-teardown-${planSha256.slice(0, 24)}`, planSha256 };
}
async function prepareAzureFoundationTeardown(base, runtime, contract, store, signal) {
  signal?.throwIfAborted();
  if (runtime.engine !== 'terraform') throw Error('Azure foundation teardown runtime engine differs');
  const savedSite = await optional4(store, 'terraform-site.json');
  let reservedSite;
  if (savedSite !== undefined) {
    const value = object8(savedSite);
    if (
      typeof value.uid !== 'string' ||
      !value.uid.trim() ||
      value.contractFingerprint !== runtime.contract.fingerprint
    )
      throw Error('Reserved Azure site checkpoint differs; admission provenance required');
    const observation = await runtime.preRegistrationInventory(
      [azureUpgradeBinding(base)],
      ['default'],
      contract,
      signal,
    );
    if (observation.status !== 'observed') throw Error('Fresh reserved Azure site inventory unavailable');
    reservedSite = { siteUid: value.uid, physicalSiteUid: observation.sites?.[0]?.physicalSiteUid ?? null };
    requireReservedObservation(observation, base, runtime, contract, reservedSite, true);
  }
  const workflow = await journal(base, store, reservedSite);
  const actual = await privateManifest(store, base.deploymentName);
  const expected = manifest(await deployment(base, String(actual.terraformVersion)));
  if (
    canonicalSha256(actual) !== canonicalSha256(expected) ||
    workflow.configurationSha256 !== expected.configurationSha256
  )
    throw Error('Azure foundation source manifest or configuration differs');
  const source = {
    terraformVersion: String(actual.terraformVersion),
    configurationSha256: expected.configurationSha256,
    manifestSha256: canonicalSha256(expected),
  };
  const plan = compile(base, source, runtime.contract.fingerprint, contract.fingerprint, reservedSite);
  for (let i = 0; i < 2; i++) {
    signal?.throwIfAborted();
    if (reservedSite)
      requireReservedObservation(
        await runtime.preRegistrationInventory([azureUpgradeBinding(base)], ['default'], contract, signal),
        base,
        runtime,
        contract,
        reservedSite,
        true,
      );
    else
      requireAbsence(
        await runtime.unregisteredAbsence([azureUpgradeBinding(base)], ['default'], contract, signal),
        base,
        runtime,
        contract,
      );
  }
  await journal(base, store, reservedSite);
  if (canonicalSha256(await privateManifest(store, base.deploymentName)) !== source.manifestSha256)
    throw Error('Azure foundation source changed during preparation');
  await store.write(`${plan.planId}.json`, plan);
  return plan;
}
async function azureFoundationTeardownDeployment(base, plan) {
  const value = await deployment(base, plan.source.terraformVersion);
  if (
    hash6(value.configuration) !== plan.source.configurationSha256 ||
    canonicalSha256(manifest(value)) !== plan.source.manifestSha256
  )
    throw Error('Azure foundation teardown source deployment differs');
  return value;
}
async function runAzureFoundationTeardown(
  base,
  input,
  authorized,
  runtime,
  contract,
  session,
  store,
  api,
  env,
  signal,
) {
  base = structuredClone(base);
  input = structuredClone(input);
  env = { ...env };
  const sourceDeployment = await azureFoundationTeardownDeployment(base, input);
  const empty = emptyConfiguration(sourceDeployment);
  let checkpoint = await optional4(store, checkpointName);
  const validFinal = (final) =>
    !!final &&
    final.schemaVersion === 1 &&
    final.engine === 'terraform' &&
    final.noChanges === true &&
    Array.isArray(final.changes) &&
    final.changes.length === 0 &&
    !final.operation &&
    !final.actionInvocations &&
    !final.imports &&
    !final.relinquishments &&
    final.deploymentId === base.deploymentName &&
    final.backendIdentity === `local:${base.deploymentName}` &&
    final.configurationSha256 === hash6(empty) &&
    final.providerLockSha256 === hash6(sourceDeployment.providerLock) &&
    sha4(final.planSha256);
  if (
    checkpoint &&
    (checkpoint.schemaVersion !== 1 ||
      checkpoint.sourcePlanSha256 !== base.planSha256 ||
      checkpoint.teardownPlanSha256 !== input.planSha256 ||
      !['cloud-pending', 'cloud-retired', 'retiring', 'retired'].includes(checkpoint.phase) ||
      (checkpoint.phase !== 'cloud-pending' && !sha4(checkpoint.emptyEvidenceSha256)) ||
      (['retiring', 'retired'].includes(checkpoint.phase) &&
        (!validFinal(checkpoint.finalPlan) || !sha4(checkpoint.retirementEvidenceSha256))))
  )
    throw Error('Azure foundation teardown checkpoint differs');
  const validate = async () => {
    signal?.throwIfAborted();
    await journal(base, store, input.reservedSite);
    if (
      input.reservedSite &&
      object8(await store.read('terraform-site.json')).contractFingerprint !== runtime.contract.fingerprint
    )
      throw Error('Reserved Azure site contract changed');
    if (
      runtime.engine !== 'terraform' ||
      authorized !== input.planSha256 ||
      canonicalSha256(input) !==
        canonicalSha256(
          compile(base, input.source, runtime.contract.fingerprint, contract.fingerprint, input.reservedSite),
        ) ||
      canonicalSha256(await store.read(`${input.planId}.json`)) !== canonicalSha256(input)
    )
      throw Error('Azure foundation teardown immutable authorization or contract differs');
    const actual = await privateManifest(store, base.deploymentName);
    if (
      canonicalSha256(actual) !== canonicalSha256(manifest(sourceDeployment)) &&
      !(
        checkpoint &&
        checkpoint.phase !== 'cloud-pending' &&
        canonicalSha256(actual) === canonicalSha256(manifest({ ...sourceDeployment, configuration: empty }))
      )
    )
      throw Error('Azure foundation teardown current manifest differs');
  };
  const fresh = async (mustBeAbsent) => {
    await validate();
    const platform = requireAbsence(
      await runtime.unregisteredAbsence([azureUpgradeBinding(base)], ['default'], contract, signal),
      base,
      runtime,
      contract,
    );
    const cloud = await observeAzureTerraformDestroyBoundary(base, api, signal);
    if (mustBeAbsent && cloud.status !== 'absent') throw Error('Azure foundation cloud absence has not converged');
    return { platform, cloud };
  };
  await validate();
  if (input.reservedSite && (!checkpoint || checkpoint.phase === 'cloud-pending')) {
    requireReservedObservation(
      await runtime.preRegistrationInventory([azureUpgradeBinding(base)], ['default'], contract, signal),
      base,
      runtime,
      contract,
      input.reservedSite,
      false,
    );
    await beginAzureTerraformRetirement(base, input, store);
    await validate();
    requireReservedObservation(
      await runtime.preRegistrationInventory([azureUpgradeBinding(base)], ['default'], contract, signal),
      base,
      runtime,
      contract,
      input.reservedSite,
      false,
    );
    const deletion = await runtime.deleteSiteExact(azureUpgradeBinding(base), input.reservedSite.siteUid, signal);
    if (deletion.status !== 'deleted') return { status: 'pending-reserved-site-retirement' };
  }
  await fresh(checkpoint !== undefined && checkpoint.phase !== 'cloud-pending');
  await beginAzureTerraformRetirement(base, input, store);
  if (!checkpoint) {
    checkpoint = {
      schemaVersion: 1,
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: input.planSha256,
      phase: 'cloud-pending',
    };
    await store.write(checkpointName, checkpoint);
  }
  if (checkpoint.phase === 'cloud-pending') {
    await runAzureTerraformCloudTeardown(base, session, store, api, env, signal);
    const absence = await fresh(true);
    checkpoint.phase = 'cloud-retired';
    checkpoint.emptyEvidenceSha256 = canonicalSha256(absence);
    await store.write(checkpointName, checkpoint);
  }
  if (checkpoint.phase === 'cloud-retired') {
    if (!session.cancelUnsubmittedPlan || !session.retireArtifacts || !sha4(checkpoint.emptyEvidenceSha256))
      throw Error('Azure owning runner cancellation or retirement service is unavailable');
    await fresh(true);
    const destroy = await store.read('azure-terraform-cloud-destroy-final.json');
    if (
      !destroy.noChanges ||
      destroy.operation !== 'destroy' ||
      destroy.changes.length ||
      destroy.deploymentId !== base.deploymentName ||
      destroy.backendIdentity !== `local:${base.deploymentName}`
    )
      throw Error('Azure foundation final destroy receipt differs');
    await session.cancelUnsubmittedPlan(
      destroy,
      input.source.configurationSha256,
      empty,
      checkpoint.emptyEvidenceSha256,
    );
    const final = await session.plan(env, signal);
    if (!validFinal(final)) throw Error('Azure foundation final refresh-enabled empty plan differs');
    const absence = await fresh(true);
    checkpoint.finalPlan = final;
    checkpoint.retirementEvidenceSha256 = canonicalSha256(absence);
    checkpoint.phase = 'retiring';
    await store.write(checkpointName, checkpoint);
  }
  if (checkpoint.phase === 'retiring') {
    await fresh(true);
    if (!session.retireArtifacts || !checkpoint.finalPlan || !sha4(checkpoint.retirementEvidenceSha256))
      throw Error('Azure foundation terminal retirement evidence is incomplete');
    checkpoint.artifacts = await session.retireArtifacts(
      checkpoint.finalPlan,
      checkpoint.retirementEvidenceSha256,
      env,
      signal,
    );
    checkpoint.phase = 'retired';
    await store.write(checkpointName, checkpoint);
  }
  await fresh(true);
  if (!checkpoint.finalPlan || !checkpoint.artifacts || !sha4(checkpoint.retirementEvidenceSha256))
    throw Error('Azure foundation terminal receipt is incomplete');
  const artifacts = object8(checkpoint.artifacts);
  if (
    artifacts.status !== 'runner-artifacts-retired' ||
    artifacts.manifestSha256 !== canonicalSha256(manifest({ ...sourceDeployment, configuration: empty })) ||
    artifacts.evidenceSha256 !== checkpoint.retirementEvidenceSha256 ||
    artifacts.finalPlanSha256 !== checkpoint.finalPlan.planSha256 ||
    !sha4(artifacts.inventorySha256) ||
    !Number.isSafeInteger(artifacts.retiredArtifacts) ||
    Number(artifacts.retiredArtifacts) < 0
  )
    throw Error('Azure foundation artifact retirement receipt differs');
  const receipt = {
    status: 'deployment-artifacts-retired',
    sourcePlanSha256: base.planSha256,
    teardownPlanSha256: input.planSha256,
    finalPlanSha256: checkpoint.finalPlan.planSha256,
    artifacts: checkpoint.artifacts,
    cloud: 'absent',
    platform: 'absent',
  };
  await store.write(receiptName, receipt);
  return receipt;
}

// plugins/azure/src/ce/terraform-pending-admission.ts
import { createHash as createHash8 } from 'node:crypto';
import { lstat as lstat6, readdir as readdir7, readFile as readFile5, realpath as realpath6 } from 'node:fs/promises';
import { join as join6 } from 'node:path';

var hash7 = (value) => createHash8('sha256').update(value).digest('hex');
var object9 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Invalid Azure pending admission journal');
  return value;
};
async function azurePendingAdmissionJournal(base, storage, fingerprint, verifyManifest = false) {
  verifyAzureCePlan(base);
  const binding = azureUpgradeBinding(base);
  await storage.verify();
  if (
    base.engine !== 'terraform' ||
    base.intent.operation !== 'deploy' ||
    base.topology.nodeCount !== 1 ||
    canonicalSha256(storage.owner) !== canonicalSha256(binding.owner)
  )
    throw Error('Azure pending admission owner or profile differs');
  const auth = object9(await storage.read(`terraform-authorization-${base.planSha256}.json`));
  const workflow = object9(await storage.read('terraform-workflow.json'));
  const bootstrap = object9(workflow.bootstrapByNode);
  if (
    auth.schemaVersion !== 1 ||
    auth.engine !== 'terraform' ||
    auth.planSha256 !== base.planSha256 ||
    auth.mutations !== true ||
    workflow.schemaVersion !== 1 ||
    workflow.engine !== 'terraform' ||
    workflow.planSha256 !== base.planSha256 ||
    workflow.stage !== 'network-pending' ||
    Object.keys(object9(workflow.launchedAtByNode)).length ||
    Object.keys(bootstrap).length !== 1 ||
    typeof bootstrap['1'] !== 'string'
  )
    throw Error('Azure failed-admission journal differs or launch has completed');
  const deployment = await azureTerraformFoundationDeployment(base, { 1: bootstrap['1'] });
  if (workflow.configurationSha256 !== hash7(deployment.configuration))
    throw Error('Azure pending admission configuration differs');
  const site = object9(await storage.read('terraform-site.json'));
  const saved = object9(await storage.read(`site-binding-${base.siteName}.json`));
  if (
    site.siteName !== base.siteName ||
    typeof site.uid !== 'string' ||
    !site.uid.trim() ||
    canonicalSha256(site.owner) !== canonicalSha256(binding.owner) ||
    site.contractFingerprint !== fingerprint ||
    saved.schemaVersion !== 1 ||
    saved.contractFingerprint !== fingerprint ||
    saved.siteUid !== site.uid ||
    canonicalSha256(saved.binding) !== canonicalSha256(binding) ||
    !Array.isArray(saved.expectedInterfaces) ||
    saved.expectedInterfaces.length
  )
    throw Error('Azure pending admission site provenance differs');
  const origin = new URL(String(saved.tenantOrigin));
  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  )
    throw Error('Azure pending tenant origin differs');
  const tokenName = `${base.deploymentName.slice(0, 40)}-1-${base.planSha256.slice(0, 12)}`;
  const token = object9(await storage.read(`${tokenName}.json`));
  if (
    token.tokenName !== tokenName ||
    token.siteName !== base.siteName ||
    token.node !== binding.nodes[0] ||
    typeof token.jwt !== 'string' ||
    !token.jwt
  )
    throw Error('Azure pending enrollment provenance differs');
  const admission = object9(await storage.read('terraform-admission-plan-node-1.json'));
  if (
    admission.schemaVersion !== 1 ||
    admission.engine !== 'terraform' ||
    admission.deploymentId !== base.deploymentName ||
    admission.backendIdentity !== deployment.backendIdentity ||
    admission.configurationSha256 !== workflow.configurationSha256 ||
    admission.providerLockSha256 !== hash7(deployment.providerLock) ||
    typeof admission.planSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(admission.planSha256)
  )
    throw Error('Azure pending admission saved plan differs');
  for (const entry of await readdir7(storage.directory))
    if (/^(?:terraform-registration|terraform-routing|ingress-plan-|azure-ce-upgrade-|azure-ce-replace-)/.test(entry))
      throw Error('Azure post-admission lifecycle has started');
  if (verifyManifest) {
    const directory = join6(storage.directory, base.deploymentName),
      file = join6(directory, 'deployment.json');
    const d = await lstat6(directory),
      f = await lstat6(file);
    if (
      !d.isDirectory() ||
      d.isSymbolicLink() ||
      d.uid !== process.getuid?.() ||
      (await realpath6(directory)) !== directory ||
      !f.isFile() ||
      f.isSymbolicLink() ||
      f.uid !== process.getuid?.() ||
      f.nlink !== 1 ||
      f.mode & 63
    )
      throw Error('Azure pending executor ownership differs');
    const { configuration, providerLock, ...identity } = deployment;
    const expected = {
      ...identity,
      configurationSha256: hash7(configuration),
      providerLockSha256: hash7(providerLock),
    };
    if (canonicalSha256(JSON.parse(await readFile5(file, 'utf8'))) !== canonicalSha256(expected))
      throw Error('Azure pending frozen executor differs');
  }
  return {
    sha256: canonicalSha256({ auth, workflow, site, saved, token, admission }),
    siteUid: site.uid,
    tokenName,
    node: binding.nodes[0],
  };
}
async function observeAzurePendingAdmission(base, runtime, contract, storage, signal) {
  const journal = await azurePendingAdmissionJournal(base, storage, runtime.contract.fingerprint);
  const value = await runtime.preRegistrationInventory([azureUpgradeBinding(base)], ['default'], contract, signal);
  const at = Date.parse(value.observedAt);
  if (
    value.status !== 'observed' ||
    canonicalSha256(value.owner) !== canonicalSha256(storage.owner) ||
    value.siteContractFingerprint !== runtime.contract.fingerprint ||
    value.ingressContractFingerprint !== contract.fingerprint ||
    !Number.isFinite(at) ||
    at > Date.now() ||
    Date.now() - at > 60000 ||
    value.sites.length !== 1 ||
    value.resources.length > 1 ||
    (value.sites[0].siteUid !== null &&
      (typeof value.sites[0].siteUid !== 'string' || !value.sites[0].siteUid.trim())) ||
    (value.sites[0].physicalSiteUid !== null &&
      (typeof value.sites[0].physicalSiteUid !== 'string' || !value.sites[0].physicalSiteUid.trim())) ||
    (value.sites[0].siteUid !== null && value.sites[0].siteUid === value.sites[0].physicalSiteUid) ||
    value.resources.some((row) => row.uid === value.sites[0].siteUid || row.uid === value.sites[0].physicalSiteUid) ||
    value.sites[0].siteName !== base.siteName ||
    value.resources.some(
      (row) =>
        row.kind !== 'tokens' ||
        row.namespace !== 'system' ||
        typeof row.uid !== 'string' ||
        !row.uid.trim() ||
        row.name !== journal.tokenName ||
        row.node !== journal.node ||
        row.siteName !== base.siteName,
    )
  )
    throw Error('Azure pending admission inventory is incomplete');
  return { value, journal };
}

// plugins/azure/src/ce/terraform-failover-retirement.ts
import { createHash as createHash9 } from 'node:crypto';
// plugins/azure/src/ce/terraform-teardown-stage-history.ts
import { lstat as lstat27, readdir as readdir8, readdir as readdir28, realpath as realpath26 } from 'node:fs/promises';
import { join as join7, join as join31 } from 'node:path';

var hash8 = (value) => createHash9('sha256').update(value).digest('hex');
async function optional5(store, name) {
  try {
    return await store.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function qualifiedAzureTerraformFailoverStages(base, store, stages) {
  const sources = [];
  for (const name of (await readdir8(store.directory)).filter((name) =>
    /^azure-ce-failover-[a-f0-9]{24}\.json$/.test(name),
  )) {
    const source = await store.read(name);
    verifyAzureCeFailoverPlan(base, source);
    if (base.engine !== 'terraform' || name !== `${source.planId}.json`) throw Error('Failover stage source differs');
    const stage = `failover-${source.planSha256.slice(0, 24)}`;
    if (stages.includes(stage)) sources.push(source);
  }
  if (
    new Set(sources.map((row) => row.planSha256)).size !== sources.length ||
    new Set(stages).size !== stages.length ||
    stages.some((stage) => !sources.some((row) => stage === `failover-${row.planSha256.slice(0, 24)}`))
  )
    throw Error('Unqualified Terraform failover stage blocks terminal cleanup');
  return sources.sort((a, b) => a.planId.localeCompare(b.planId));
}
async function retireAzureTerraformFailoverStage(
  base,
  failover,
  siteUid,
  terraform,
  store,
  evidenceSha256,
  env,
  signal,
) {
  base = structuredClone(base);
  failover = structuredClone(failover);
  env = { ...env };
  verifyAzureCeFailoverPlan(base, failover);
  if (
    base.engine !== 'terraform' ||
    canonicalSha256(store.owner) !== canonicalSha256(azureFailoverOwner(base)) ||
    !/^[a-f0-9]{64}$/.test(evidenceSha256)
  )
    throw Error('Failover retirement owner or external absence differs');
  const release = await acquireProcessLock(join7(store.directory, '.failover-lock'));
  try {
    const deployment = await azureTerraformFailoverDeployment(base, failover, 'release');
    const name = `${failover.planId}-stage-retirement.json`;
    const validate = async () => {
      signal?.throwIfAborted();
      await store.verify();
      const records = new Map();
      for (const entry of await readdir8(store.directory))
        if (
          isAzureFailoverHistoricalArtifact(entry) ||
          azureRelayHistoricalArtifacts.has(entry) ||
          entry === 'platform-routing.json'
        )
          records.set(entry, await store.read(entry));
      await verifyAzureFailoverHistoricalArtifacts(base, siteUid, records);
      if (
        canonicalSha256(records.get(`${failover.planId}.json`)) !== canonicalSha256(failover) ||
        validateAzureFailoverCheckpoint(base, failover, records.get(`${failover.planId}-checkpoint.json`)).phase !==
          'complete'
      )
        throw Error('Incomplete failover blocks stage retirement');
      validateAzureFailoverReceipt(base, failover, records.get(`${failover.planId}-receipt.json`));
      return await validateAzureTerraformFailoverPlan(
        base,
        failover,
        'release',
        records.get(`${failover.planId}-release-plan.json`),
      );
    };
    const applied = await validate();
    let checkpoint = await optional5(store, name);
    if (checkpoint !== undefined)
      await validateAzureTerraformFailoverRetirement(base, failover, checkpoint, evidenceSha256);
    const session = await terraform.open(store.owner, deployment, 'current');
    if (!session.readConfigurationSha256 || !session.retireArtifacts)
      throw Error('Owning failover runner retirement unavailable');
    const bound = {
      schemaVersion: 1,
      owner: store.owner,
      sourcePlanSha256: base.planSha256,
      failoverPlanSha256: failover.planSha256,
      deploymentSha256: canonicalSha256(deployment),
      evidenceSha256,
    };
    if (checkpoint === undefined) {
      if ((await session.readConfigurationSha256()) !== hash8(deployment.configuration))
        throw Error('Failover stage configuration differs');
      if (!applied.noChanges && (await session.readPlanApplicationState(applied)) !== 'applied')
        throw Error('Failover release application unresolved');
      checkpoint = { ...bound, status: 'preparing' };
      await store.write(name, checkpoint);
    }
    let current = await validateAzureTerraformFailoverRetirement(base, failover, checkpoint, evidenceSha256);
    if (current.status === 'preparing') {
      const receipt = await validateAzureTerraformFailoverPlan(
        base,
        failover,
        'release',
        await session.plan(env, signal),
        true,
      );
      await validate();
      checkpoint = { ...bound, status: 'retiring', receipt, receiptSha256: canonicalSha256(receipt) };
      await store.write(name, checkpoint);
      current = await validateAzureTerraformFailoverRetirement(base, failover, checkpoint, evidenceSha256);
    }
    await validate();
    const result = await session.retireArtifacts(current.receipt, evidenceSha256, env, signal);
    signal?.throwIfAborted();
    const retired = { ...current, status: 'retired', result };
    await validateAzureTerraformFailoverRetirement(base, failover, retired, evidenceSha256);
    signal?.throwIfAborted();
    await store.write(name, retired);
    return result;
  } finally {
    await release();
  }
}

// plugins/azure/src/ce/terraform-network-cancelled-main-binding.ts
// plugins/azure/src/ce/terraform-network-destroy-journal-custody.ts
// plugins/azure/src/ce/terraform-network-empty-main-binding.ts
import { createHash as createHash10, createHash as createHash29, createHash as createHash30 } from 'node:crypto';
import { constants as constants2, constants as constants15, constants as constants16 } from 'node:fs';
import {
  lstat as lstat7,
  lstat as lstat25,
  lstat as lstat26,
  open as open2,
  open as open12,
  open as openFile4,
  readdir as readdir26,
  readdir as readdir27,
  realpath as realpath7,
  realpath as realpath24,
  realpath as realpath25,
} from 'node:fs/promises';
import { join as join8, join as join28, join as join29 } from 'node:path';

// plugins/azure/src/ce/terraform-terminal-snapshot.ts
import { types as utilTypes } from 'node:util';

var snapshots = new WeakMap();
function require6(value, message) {
  if (!value) throw Error(`Azure terminal snapshot: ${message}`);
}
function sealAzureTerraformTerminalSnapshot(value) {
  require6(value && typeof value === 'object' && !Array.isArray(value), 'terminal object required');
  const inspect = (entry, ancestry) => {
    if (entry === undefined || entry === null || typeof entry === 'string' || typeof entry === 'boolean') return;
    if (typeof entry === 'number') {
      require6(Number.isFinite(entry), 'finite JSON number required');
      return;
    }
    require6(typeof entry === 'object' && !utilTypes.isProxy(entry), 'ordinary JSON data required');
    require6(!ancestry.has(entry), 'cyclic terminal value');
    const prototype = Object.getPrototypeOf(entry);
    require6(
      Array.isArray(entry) ? prototype === Array.prototype : prototype === Object.prototype || prototype === null,
      'ordinary JSON prototype required',
    );
    require6(
      Object.getOwnPropertySymbols(entry).length === 0 && !('toJSON' in entry),
      'custom JSON behavior forbidden',
    );
    const descriptors = Object.getOwnPropertyDescriptors(entry);
    require6(!Object.hasOwn(descriptors, '__proto__'), 'prototype field forbidden');
    ancestry.add(entry);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      require6(Object.hasOwn(descriptor, 'value'), 'accessor terminal field forbidden');
      if (Array.isArray(entry))
        require6(key === 'length' || /^(0|[1-9][0-9]*)$/.test(key), 'custom array field forbidden');
      if (descriptor.enumerable) inspect(descriptor.value, ancestry);
    }
    ancestry.delete(entry);
  };
  inspect(value, new Set());
  const digest = canonicalSha256({ value });
  const rawDigest = canonicalSha256(value);
  const snapshot = JSON.parse(canonicalStringify(value));
  const freeze = (entry) => {
    if (!entry || typeof entry !== 'object') return;
    for (const child of Object.values(entry)) freeze(child);
    Object.freeze(entry);
  };
  freeze(snapshot);
  require6(
    canonicalSha256({ value: snapshot }) === digest && canonicalSha256(snapshot) === rawDigest,
    'sealed digest differs',
  );
  snapshots.set(snapshot, { wrapped: digest, raw: rawDigest });
  return snapshot;
}
function matchesAzureTerraformTerminalSnapshot(value, expectedSha256, mode = 'wrapped') {
  const sealed = value && typeof value === 'object' ? snapshots.get(value) : undefined;
  return sealed === undefined
    ? canonicalSha256(mode === 'raw' ? value : { value }) === expectedSha256
    : sealed[mode] === expectedSha256;
}
function captureAzureTerraformTerminalSnapshot(value, mode = 'wrapped') {
  const wrap = (input) => (mode === 'raw' ? input : { value: input });
  const expectedSha256 = canonicalSha256(wrap(value));
  const matches = canonicalSnapshot(wrap(value));
  return (current) => {
    const sealed = current && typeof current === 'object' ? snapshots.get(current) : undefined;
    return sealed === undefined ? matches(wrap(current)) : sealed[mode] === expectedSha256;
  };
}

// plugins/azure/src/ce/terraform-network-empty-main-binding.ts
var same6 = (a, b) => canonicalEqual({ value: a }, { value: b });
var hash9 = (bytes) => createHash10('sha256').update(bytes).digest('hex');
var sha5 = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require7(v, message) {
  if (!v) throw Error(`Azure network empty-main binding: ${message}`);
}
function object10(v) {
  require7(v && typeof v === 'object' && !Array.isArray(v), 'record object required');
  return v;
}
function parsePrivate(value) {
  try {
    return JSON.parse(value);
  } catch {
    throw Error('Azure network empty-main binding: malformed private configuration');
  }
}
var witnesses = new WeakMap();
async function qualifyAzureTerraformNetworkEmptyMainBinding(request, store, context, signal) {
  const original = structuredClone(request),
    owner = structuredClone(store.owner),
    directory = store.directory,
    teardown = structuredClone(context.destroyTeardown),
    terminal = structuredClone(context.terminalCleanup),
    site = structuredClone(context.site),
    terraform = context.terraform;
  const dependencies = [
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'verify', value: store.verify },
    { target: terraform, key: 'open', value: terraform.open },
  ];
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const terminalSha256 = canonicalSha256({ value: terminal });
  const seal = () => {
    deadline.throwIfAborted();
    require7(
      same6(request, original) &&
        same6(store.owner, owner) &&
        store.directory === directory &&
        context.terraform === terraform &&
        same6(context.destroyTeardown, teardown) &&
        matchesAzureTerraformTerminalSnapshot(context.terminalCleanup, terminalSha256) &&
        same6(context.site, site) &&
        dependencies.every(({ target, key, value }) => Reflect.get(target, key) === value),
      'owning request or context changed',
    );
  };
  const step = async (action, parent) => {
    seal();
    const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
    active.throwIfAborted();
    const aborted = Promise.withResolvers(),
      onAbort = () => aborted.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([action(), aborted.promise]);
      active.throwIfAborted();
      seal();
      return value;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  const records = new Map();
  const readRecord = async (name, parent) =>
    step(async () => {
      const logical = await store.read(name),
        file = await open2(join8(directory, name), constants2.O_RDONLY | constants2.O_NOFOLLOW);
      try {
        const first = await file.stat(),
          bytes = await file.readFile(),
          last = await file.stat(),
          named = await lstat7(join8(directory, name));
        require7(
          first.isFile() &&
            first.uid === process.getuid?.() &&
            first.nlink === 1 &&
            (first.mode & 63) === 0 &&
            last.dev === first.dev &&
            last.ino === first.ino &&
            last.size === first.size &&
            last.mtimeMs === first.mtimeMs &&
            last.ctimeMs === first.ctimeMs &&
            named.isFile() &&
            !named.isSymbolicLink() &&
            named.dev === first.dev &&
            named.ino === first.ino &&
            named.uid === first.uid &&
            named.nlink === 1 &&
            (named.mode & 63) === 0 &&
            same6(JSON.parse(bytes.toString()), logical),
          'private record custody differs',
        );
        const digest = canonicalSha256({
          identity: `${first.dev}:${first.ino}:${first.birthtimeMs}`,
          bytes: hash9(bytes),
        });
        require7(!records.has(name) || records.get(name) === digest, 'private record bytes or identity changed');
        records.set(name, digest);
        return structuredClone(logical);
      } finally {
        await file.close();
      }
    }, parent);
  const root = await step(() => lstat7(directory));
  require7(
    root.isDirectory() &&
      !root.isSymbolicLink() &&
      root.uid === process.getuid?.() &&
      (root.mode & 63) === 0 &&
      (await step(() => realpath7(directory))) === directory,
    'private directory differs',
  );
  require7(
    original.engine === 'terraform' &&
      original.intent.operation === 'deploy' &&
      same6(azureUpgradeBinding(original).owner, owner) &&
      same6(
        compileAzureTerraformTeardown(
          original,
          teardown.drain,
          teardown.retirement,
          teardown.pendingAdmissionJournalSha256,
        ),
        teardown,
      ) &&
      teardown.retirement[0]?.siteUid === site.siteUid,
    'compiled source owner or site differs',
  );
  await step(() => store.verify());
  require7(same6(await readRecord(`${teardown.planId}.json`), teardown), 'saved teardown differs');
  require7(
    same6(await readRecord(`${teardown.planId}-authorization.json`), {
      schemaVersion: 1,
      engine: 'terraform',
      sourcePlanSha256: original.planSha256,
      teardownPlanSha256: teardown.planSha256,
      mutations: true,
    }),
    'saved authorization differs',
  );
  require7(
    same6(await readRecord('azure-terraform-terminal-cleanup.json'), terminal),
    'saved terminal checkpoint differs',
  );
  const checkpoint = object10(terminal),
    destroy = object10(checkpoint.destroy),
    final = object10(checkpoint.final);
  const deployment = await step(() => azureTerraformCurrentDeployment(original));
  const { configuration: emptyConfiguration, providerLock, ...identity } = deployment;
  const emptySha256 = hash9(emptyConfiguration),
    manifestSha256 = canonicalSha256({
      ...identity,
      configurationSha256: emptySha256,
      providerLockSha256: hash9(providerLock),
    });
  require7(
    checkpoint.schemaVersion === 1 &&
      checkpoint.phase === 'retiring' &&
      checkpoint.sourcePlanSha256 === original.planSha256 &&
      checkpoint.teardownPlanSha256 === teardown.planSha256 &&
      checkpoint.emptyConfiguration === emptyConfiguration &&
      checkpoint.emptyConfigurationSha256 === emptySha256 &&
      sha5(checkpoint.evidenceSha256) &&
      checkpoint.evidenceSha256 === canonicalSha256(checkpoint.evidence) &&
      sha5(checkpoint.retirementEvidenceSha256) &&
      checkpoint.retirementEvidenceSha256 === canonicalSha256(checkpoint.retirementEvidence) &&
      checkpoint.checkpointSha256 ===
        canonicalSha256({
          configurationSha256: checkpoint.configurationSha256,
          emptyConfiguration,
          destroy,
          evidence: checkpoint.evidence,
        }),
    'terminal checkpoint binding differs',
  );
  require7(
    same6(await readRecord('azure-terraform-cloud-destroy-final.json'), destroy) &&
      destroy.operation === 'destroy' &&
      destroy.configurationSha256 === checkpoint.configurationSha256 &&
      destroy.noChanges &&
      destroy.changes.length === 0 &&
      typeof checkpoint.retainedDestroyConfiguration === 'string' &&
      hash9(checkpoint.retainedDestroyConfiguration) === destroy.configurationSha256,
    'retained destroy configuration or receipt differs',
  );
  const retained = object10(parsePrivate(checkpoint.retainedDestroyConfiguration)),
    retainedNetwork = object10(checkpoint.retainedNetworkCustody);
  require7(
    same6({ terraform: retained.terraform, provider: retained.provider }, JSON.parse(emptyConfiguration)) &&
      retainedNetwork.scope === 'post-destroy-authenticated-network-stage-journal-custody' &&
      same6(retainedNetwork.owner, owner) &&
      retainedNetwork.originalPlanSha256 === original.planSha256 &&
      retainedNetwork.teardownPlanSha256 === teardown.planSha256 &&
      same6(retainedNetwork.site, site),
    'retained provider identity or network source differs',
  );
  for (const receipt of [destroy, final])
    require7(
      receipt.schemaVersion === 1 &&
        receipt.engine === 'terraform' &&
        receipt.deploymentId === deployment.deploymentId &&
        receipt.backendIdentity === deployment.backendIdentity &&
        receipt.providerLockSha256 === hash9(providerLock) &&
        sha5(receipt.planSha256) &&
        receipt.noChanges &&
        Array.isArray(receipt.changes) &&
        receipt.changes.length === 0 &&
        !receipt.actionInvocations &&
        !receipt.imports &&
        !receipt.relinquishments,
      'exact owning no-change receipt required',
    );
  require7(!final.operation && final.configurationSha256 === emptySha256, 'ordinary empty final required');
  const session = await step(() => terraform.open(owner, deployment, 'current'));
  const {
    readCancelledPlanContinuation: readContinuation,
    readConfiguration,
    readCurrentPlanJournal: readCurrent,
  } = session;
  require7(
    typeof readContinuation === 'function' &&
      typeof readConfiguration === 'function' &&
      typeof readCurrent === 'function',
    'native continuation readers required',
  );
  for (const key of ['readCancelledPlanContinuation', 'readConfiguration', 'readCurrentPlanJournal'])
    dependencies.push({ target: session, key, value: Reflect.get(session, key) });
  const inspect = async (parent) => {
    const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
    const provenance = await step(
      () =>
        readContinuation.call(
          session,
          destroy,
          destroy.configurationSha256,
          emptySha256,
          checkpoint.evidenceSha256,
          final,
          active,
        ),
      parent,
    );
    require7(
      provenance.schemaVersion === 1 &&
        provenance.scope === 'exact-cancelled-plan-current-continuation-provenance' &&
        provenance.cancellationQualified &&
        provenance.manifestSha256 === manifestSha256 &&
        provenance.currentConfigurationSha256 === emptySha256 &&
        provenance.originalReceiptSha256 === canonicalSha256(destroy) &&
        sha5(provenance.cancellationRecordSha256) &&
        provenance.originalArchiveSha256s.length > 0 &&
        provenance.originalArchiveSha256s.every(sha5) &&
        provenance.continuation.state === 'planned' &&
        provenance.continuation.receiptSha256 === canonicalSha256(final) &&
        provenance.continuation.savedPlanSha256 === final.planSha256 &&
        provenance.continuation.ordinaryRefreshEnabled &&
        sha5(provenance.continuation.executionSha256) &&
        provenance.planSemanticsQualified === false &&
        provenance.applicationOutcomeQualified === false &&
        provenance.runnerRetirementQualified === false &&
        provenance.retirementQualified === false,
      'native cancellation continuation differs',
    );
    require7(
      (await step(() => readConfiguration.call(session, emptySha256), parent)) === emptyConfiguration,
      'current empty configuration bytes differ',
    );
    const current = await step(() => readCurrent.call(session, emptySha256, active), parent);
    require7(
      current.state === 'planned' &&
        same6(current.receipt, final) &&
        current.manifestSha256 === manifestSha256 &&
        current.ordinaryRefreshEnabled === true &&
        current.savedPlanSha256 === final.planSha256 &&
        current.executionSha256 === provenance.continuation.executionSha256 &&
        current.journalSha256 === provenance.continuation.journalSha256,
      'current ordinary native journal differs',
    );
    for (const name of records.keys()) await readRecord(name, parent);
    const now = await step(() => lstat7(directory), parent);
    require7(
      now.dev === root.dev &&
        now.ino === root.ino &&
        now.birthtimeMs === root.birthtimeMs &&
        now.isDirectory() &&
        !now.isSymbolicLink() &&
        now.uid === root.uid &&
        (now.mode & 63) === 0,
      'private directory identity changed',
    );
    seal();
    return { provenance, current };
  };
  const first = await inspect();
  const result = {
    schemaVersion: 1,
    scope: 'authenticated-terminal-empty-main-configuration-binding',
    owner,
    site,
    originalPlanSha256: original.planSha256,
    teardownPlanSha256: teardown.planSha256,
    configurationSha256: emptySha256,
    retainedDestroyConfigurationSha256: destroy.configurationSha256,
    cancellationRecordNameSha256: hash9(
      `configuration-cancellation-${canonicalSha256({
        receipt: destroy,
        expectedSha256: destroy.configurationSha256,
        nextSha256: emptySha256,
      })}.json`,
    ),
    cancellationRecordSha256: first.provenance.cancellationRecordSha256,
    finalReceiptSha256: canonicalSha256(final),
    nativeJournalSha256: first.current.journalSha256,
    nativeExecutionSha256: first.current.executionSha256,
    cancellationQualified: true,
    ordinaryCurrentJournalQualified: true,
    emptyStateQualified: false,
    independentCloudCleanupQualified: false,
    mainRunnerRetirementQualified: false,
    parentRetirementQualified: false,
  };
  const digest = canonicalSha256(result);
  witnesses.set(result, {
    originalPlanSha256: original.planSha256,
    store,
    context,
    digest,
    async recheck(parent) {
      require7(canonicalSha256(result) === digest && same6(await inspect(parent), first), 'native binding changed');
    },
  });
  return result;
}
async function recheckAzureTerraformNetworkEmptyMainBinding(witness, originalPlanSha256, store, context, signal) {
  signal?.throwIfAborted();
  const bound = witness && typeof witness === 'object' ? witnesses.get(witness) : undefined;
  require7(
    bound &&
      bound.store === store &&
      bound.context === context &&
      bound.originalPlanSha256 === originalPlanSha256 &&
      canonicalSha256(witness) === bound.digest,
    'owning native empty-main witness required',
  );
  await bound.recheck(signal);
}

// plugins/azure/src/ce/terraform-network-retired-main-custody.ts
// plugins/azure/src/ce/terraform-network-power-runner-history.ts
// plugins/azure/src/ce/terraform-network-power-cancelled-release.ts
import { createHash as createHash11, createHash as createHash12, createHash as createHash28 } from 'node:crypto';
import { constants as constants3, constants as constants14 } from 'node:fs';
import {
  lstat as lstat8,
  lstat as lstat9,
  lstat as lstat24,
  open as open11,
  open as openFile,
  readdir as readdir9,
  readdir as readdir10,
  readdir as readdir25,
  realpath as realpath8,
  realpath as realpath9,
  realpath as realpath23,
} from 'node:fs/promises';
import { join as join9, join as join10, join as join27 } from 'node:path';

// plugins/azure/src/ce/terraform-network-power-cancellation-packet.ts
var same7 = canonicalEqual;
function require8(value, message) {
  if (!value) throw Error(`Azure Terraform network power cancellation: ${message}`);
}
var object11 = (input) => {
  require8(input && typeof input === 'object' && !Array.isArray(input), 'malformed cancellation packet');
  return input;
};
async function validateAzureTerraformPowerCancellationPacket(
  plan,
  before,
  selectedNode,
  selectedOperation,
  bound,
  input,
  publishedMutation,
) {
  const packet = object11(input);
  const keys = [
    ...Object.keys(bound),
    'status',
    'receipt',
    'originalJournalSha256',
    'prior',
    'proposed',
    'evidenceSha256',
    ...(packet.status === 'cancelled' ? ['provenance'] : []),
  ];
  require8(
    same7(Object.keys(packet).sort(), keys.sort()) &&
      (packet.status === 'preparing' || packet.status === 'cancelled') &&
      Object.entries(bound).every(([key, value]) => same7(packet[key], value)) &&
      typeof packet.originalJournalSha256 === 'string' &&
      /^[a-f0-9]{64}$/.test(packet.originalJournalSha256),
    'stage cancellation source or schema differs',
  );
  const receipt = await validateAzureTerraformNetworkPowerPlan(
    plan,
    before,
    selectedNode,
    selectedOperation,
    packet.receipt,
    'mutation',
  );
  require8(!publishedMutation || same7(publishedMutation, receipt), 'published original receipt differs');
  await validateAzureTerraformNetworkPowerProjection(
    plan,
    before,
    selectedNode,
    selectedOperation,
    receipt,
    'mutation',
    packet.prior,
    packet.proposed,
  );
  require8(
    packet.evidenceSha256 ===
      canonicalSha256({
        ...bound,
        receipt,
        originalJournalSha256: packet.originalJournalSha256,
        prior: packet.prior,
        proposed: packet.proposed,
      }),
    'original cancellation evidence differs',
  );
  return { packet, receipt, evidenceSha256: packet.evidenceSha256 };
}

// plugins/azure/src/ce/terraform-network-power-cancelled-release.ts
var hash10 = (value) => createHash11('sha256').update(value).digest('hex');
var same8 = canonicalEqual;
var address = 'azapi_resource_action.ce_network';
function require9(value, message) {
  if (!value) throw Error(`Azure Terraform cancelled power release: ${message}`);
}
function object12(value) {
  require9(value && typeof value === 'object' && !Array.isArray(value), 'malformed release packet');
  return value;
}
async function readAzureTerraformNetworkCancelledPowerRetirement(
  request,
  node,
  operation,
  terraform,
  store,
  loaders,
  site,
  verifier,
  signal,
  replacementVerifier,
) {
  const result = await runCancelledPowerStage(
    [request, node, operation, terraform, store, loaders, site, verifier, undefined, {}, signal, replacementVerifier],
    true,
    true,
  );
  require9(result.scope === 'selected-cancelled-network-power-retirement-history', 'unexpected mutation result');
  return result;
}
async function runCancelledPowerStage(args, retire, readOnly = false) {
  const [
    request,
    node,
    operation,
    rawTerraform,
    rawStore,
    loaders,
    siteRequest,
    verifier,
    rawApi,
    environment,
    signal,
    replacementVerifier,
  ] = args;
  const plan = structuredClone(request),
    site = structuredClone(siteRequest),
    owner = structuredClone(rawStore.owner),
    directory = rawStore.directory,
    env = { ...environment };
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const bindings = [];
  const bind = (target, keys) => {
    for (const key of keys) bindings.push({ object: target, key, value: Reflect.get(target, key) });
  };
  bind(rawTerraform, ['open']);
  bind(rawStore, ['read', 'write', 'verify']);
  bind(loaders, ['loadSource', 'loadOutcome']);
  if (rawApi) bind(rawApi, ['exec']);
  require9(readOnly || rawApi, 'cloud observer required for release or retirement');
  const seal = () => {
    deadline.throwIfAborted();
    require9(
      same8(request, plan) &&
        same8(siteRequest, site) &&
        same8(rawStore.owner, owner) &&
        same8(environment, env) &&
        rawStore.directory === directory &&
        bindings.every(({ object: target, key, value }) => Reflect.get(target, key) === value),
      'request or owning dependency changed',
    );
  };
  seal();
  require9(
    Number.isInteger(node) &&
      node >= 1 &&
      node <= plan.topology.nodeCount &&
      (operation === 'deallocate' || operation === 'start'),
    'selected node or operation differs',
  );
  const execute = readOnly
    ? async (_directory, _deadline, _seal, action) =>
        action(async (work, mutation) => {
          seal();
          require9(!mutation, 'inspection cannot execute a mutation');
          const aborted = Promise.withResolvers(),
            onAbort = () => aborted.reject(deadline.reason);
          deadline.addEventListener('abort', onAbort, { once: true });
          try {
            const value = await Promise.race([work(), aborted.promise]);
            seal();
            return value;
          } finally {
            deadline.removeEventListener('abort', onAbort);
          }
        })
    : withAzureTerraformPowerLifecycle;
  return execute(
    directory,
    deadline,
    seal,
    async (step) => {
      const guard = (target, keys, mutations = []) => {
        bind(target, keys);
        const methods = new Map();
        for (const key of keys) {
          const method = Reflect.get(target, key);
          if (typeof method === 'function')
            methods.set(key, (...args) =>
              step(async () => await Reflect.apply(method, target, args), mutations.includes(key)),
            );
        }
        return new Proxy(target, {
          get: (target, key) => (methods.has(key) ? methods.get(key) : Reflect.get(target, key)),
        });
      };
      const store = guard(rawStore, ['read', 'write', 'verify'], ['write']),
        terraform = guard(rawTerraform, ['open'], readOnly ? [] : ['open']),
        api = rawApi ? guard(rawApi, ['exec']) : undefined;
      const graphRead = () =>
        step(() =>
          readAzureTerraformNetworkRetirementGraph(plan, store, loaders, site, verifier, deadline, replacementVerifier),
        );
      const graph = await graphRead(),
        graphSha256 = canonicalSha256(graph),
        row = graph.checkpoint.snapshot?.checkpoint.nodes.find((value) => value.node === node),
        historyNode = graph.nodes.find((value) => value.node === node);
      require9(row && historyNode?.preflightPresent, 'original selected preflight unavailable');
      const before = row.before,
        history = operation === 'deallocate' ? historyNode.deallocate : historyNode.start;
      require9(
        !history.receipts.release &&
          !history.receipts.current &&
          !history.packetSha256ByName[
            `${plan.planId}-terraform-network-node-${node}-${operation}-mutation-complete.json`
          ],
        'completed mutation requires its owning release lifecycle',
      );
      const mutation = await step(() => azureTerraformNetworkPowerDeployment(plan, before, node, operation)),
        release = await step(() => azureTerraformNetworkPowerDeployment(plan, before, node, operation, true));
      require9(
        mutation.stage && graph.powerDeployments.some((value) => same8(value, mutation)),
        'original runner identity differs',
      );
      const root = join9(directory, 'terraform-stages'),
        stageDirectory = join9(root, mutation.stage),
        runnerDirectory = join9(stageDirectory, mutation.deploymentId);
      const inventory = (path) =>
        step(async () => {
          const stat = await lstat8(path);
          require9(
            stat.isDirectory() &&
              !stat.isSymbolicLink() &&
              stat.uid === process.getuid?.() &&
              (stat.mode & 63) === 0 &&
              (await realpath8(path)) === path,
            'stage ownership differs',
          );
          return (await readdir9(path)).sort();
        });
      const names = await inventory(root),
        stages = await inventory(stageDirectory);
      require9(
        names
          .filter((name) => name.startsWith(`network-${plan.planSha256.slice(0, 24)}-`))
          .every((stage) => graph.powerDeployments.some((value) => value.stage === stage)) &&
          same8(stages, [mutation.deploymentId]),
        'foreign or orphan selected runner',
      );
      const runnerNames = await inventory(runnerDirectory);
      const barrierPresent = runnerNames.includes('artifact-retirement.json');
      require9(
        !runnerNames.includes('configuration-transition.json') && (!barrierPresent || retire),
        'pending revision or artifact retirement requires owner recovery',
      );
      const identity = canonicalSha256({
          planSha256: plan.planSha256,
          selectedNode: node,
          selectedOperation: operation,
        }).slice(0, 24),
        cancellationName = `azure-power-cancel-${identity}.json`,
        prefix = `azure-power-state-release-${identity}`;
      const optional = async (name) => {
        try {
          return await store.read(name);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      };
      const saved = await store.read(cancellationName),
        cancellationPacketSha256 = canonicalSha256(saved);
      const cancellationBound = {
        schemaVersion: 1,
        owner,
        sourcePlanSha256: plan.planSha256,
        graphSha256,
        node,
        operation,
        stage: mutation.stage,
        mutationDeploymentSha256: canonicalSha256(mutation),
        releaseDeploymentSha256: canonicalSha256(release),
      };
      const original = await step(() =>
        validateAzureTerraformPowerCancellationPacket(
          plan,
          before,
          node,
          operation,
          cancellationBound,
          saved,
          history.receipts.mutation,
        ),
      );
      require9(original.packet.status === 'cancelled', 'completed original cancellation required');
      const originalProvenance = object12(original.packet.provenance);
      require9(
        same8(
          Object.keys(originalProvenance).sort(),
          [
            'schemaVersion',
            'scope',
            'status',
            'manifestSha256',
            'cancellationRecordSha256',
            'originalReceiptSha256',
            'originalArchiveSha256s',
            'currentConfigurationSha256',
            'cancellationQualified',
            'applicationOutcomeQualified',
            'runnerRetirementQualified',
            'retirementQualified',
          ].sort(),
        ) &&
          originalProvenance.schemaVersion === 1 &&
          originalProvenance.scope === 'exact-unsubmitted-plan-cancellation-provenance' &&
          originalProvenance.status === 'cancelled' &&
          originalProvenance.cancellationQualified === true &&
          originalProvenance.applicationOutcomeQualified === false &&
          originalProvenance.runnerRetirementQualified === false &&
          originalProvenance.retirementQualified === false &&
          originalProvenance.currentConfigurationSha256 === hash10(release.configuration) &&
          originalProvenance.originalReceiptSha256 === canonicalSha256(original.receipt),
        'original cancellation provenance schema or qualification differs',
      );
      const session = guard(
        await terraform.open(owner, mutation, 'current'),
        [
          'readConfigurationSha256',
          'readCurrentPlanJournal',
          'readPlanApplicationHistory',
          'readUnsubmittedPlanCancellation',
          'readCancelledPlanContinuation',
          'readPlannedResourceFields',
          'readProposedResourceFields',
          'readAppliedResourceFields',
          'plan',
          'apply',
          'reconcileApplyFromEvidence',
          'readArtifactRetirement',
          'retireArtifacts',
        ],
        ['plan', 'apply', 'reconcileApplyFromEvidence', 'retireArtifacts'],
      );
      require9(
        session.readConfigurationSha256 &&
          session.readCurrentPlanJournal &&
          session.readPlanApplicationHistory &&
          session.readUnsubmittedPlanCancellation &&
          session.readCancelledPlanContinuation,
        'owning continuation contract unavailable',
      );
      const {
        readCurrentPlanJournal: readCurrent,
        readPlanApplicationHistory: readHistory,
        readUnsubmittedPlanCancellation: readCancellation,
        readCancelledPlanContinuation: readContinuation,
      } = session;
      const configuration = async () =>
        require9(
          (await session.readConfigurationSha256?.()) === hash10(release.configuration),
          'exact derived release configuration required',
        );
      const { configuration: source, providerLock, ...deploymentIdentity } = release;
      const manifestSha256 = canonicalSha256({
        ...deploymentIdentity,
        configurationSha256: hash10(source),
        providerLockSha256: hash10(providerLock),
      });
      require9(originalProvenance.manifestSha256 === manifestSha256, 'original cancellation manifest differs');
      const journal = async () => {
        await configuration();
        const value = await readCurrent.call(session, hash10(release.configuration), deadline);
        require9(
          value.schemaVersion === 1 &&
            value.scope === 'current-saved-plan-byte-and-journal-binding' &&
            value.planSemanticsQualified === false &&
            value.manifestSha256 === manifestSha256,
          'current journal identity differs',
        );
        return value;
      };
      const originalCustody = async (receipt) => {
        const value = receipt
          ? await readContinuation.call(
              session,
              original.receipt,
              hash10(mutation.configuration),
              hash10(release.configuration),
              original.evidenceSha256,
              receipt,
              deadline,
            )
          : await readCancellation.call(
              session,
              original.receipt,
              hash10(mutation.configuration),
              hash10(release.configuration),
              original.evidenceSha256,
              deadline,
            );
        require9(
          value.schemaVersion === 1 &&
            value.scope ===
              (receipt
                ? 'exact-cancelled-plan-current-continuation-provenance'
                : 'exact-unsubmitted-plan-cancellation-provenance') &&
            (receipt || ('status' in value && value.status === 'cancelled')) &&
            (!receipt || ('planSemanticsQualified' in value && value.planSemanticsQualified === false)) &&
            value.cancellationQualified === true &&
            value.cancellationRecordSha256 === originalProvenance.cancellationRecordSha256 &&
            same8(value.originalArchiveSha256s, originalProvenance.originalArchiveSha256s) &&
            value.originalReceiptSha256 === canonicalSha256(original.receipt) &&
            value.currentConfigurationSha256 === hash10(release.configuration) &&
            value.manifestSha256 === manifestSha256 &&
            value.applicationOutcomeQualified === false &&
            value.runnerRetirementQualified === false &&
            value.retirementQualified === false,
          'original cancellation record or archive custody differs',
        );
        const archived = await readHistory.call(session, original.receipt, deadline);
        require9(
          archived.schemaVersion === 1 &&
            archived.scope === 'exact-saved-plan-journal-history' &&
            archived.receiptSha256 === canonicalSha256(original.receipt) &&
            archived.incompleteArchives === 0 &&
            archived.applicationOutcomeQualified === false &&
            archived.retirementQualified === false &&
            archived.matches.every((entry) => entry.state === 'planned') &&
            archived.matches.some(
              (entry) =>
                entry.location !== 'current' &&
                entry.journalSha256 === original.packet.originalJournalSha256 &&
                entry.savedPlanSha256 === original.receipt.planSha256,
            ) &&
            same8(
              archived.matches.map((entry) => entry.archiveSha256).toSorted(),
              originalProvenance.originalArchiveSha256s,
            ),
          'original unsubmitted archive history differs',
        );
        require9(
          canonicalSha256(await store.read(cancellationName)) === cancellationPacketSha256 &&
            canonicalSha256(await graphRead()) === graphSha256 &&
            same8(await inventory(root), names) &&
            same8(await inventory(stageDirectory), stages),
          'original source or stage inventory changed',
        );
        return value;
      };
      const appliedNics = Array.from({ length: node - 1 }, (_, index) =>
        plan.nics.map((nic) => `${index + 1}:${nic.index}`),
      ).flat();
      if (operation === 'start') appliedNics.push(...plan.nics.map((nic) => `${node}:${nic.index}`));
      const observe = () =>
        step(async () => {
          require9(api && !readOnly, 'inspection cannot collect current cloud evidence');
          const value = await observeAzureTerraformNetworkPower(
            plan,
            before,
            node,
            operation,
            appliedNics,
            api,
            deadline,
          );
          require9(
            ['running', 'deallocated', 'stopped'].includes(value.powerState),
            'stable selected power observation required',
          );
          const { observedAt: _observedAt, inventory: inventoryValue, ...power } = value;
          const { collectedAt: _collectedAt, ...network } = inventoryValue;
          return { ...power, inventory: network };
        });
      const bound = {
        schemaVersion: 1,
        owner,
        sourcePlanSha256: plan.planSha256,
        graphSha256,
        node,
        operation,
        stage: mutation.stage,
        cancellationPacketSha256,
        originalReceiptSha256: canonicalSha256(original.receipt),
        originalEvidenceSha256: original.evidenceSha256,
        releaseDeploymentSha256: canonicalSha256(release),
        manifestSha256,
      };
      const packet = (input, fields) => {
        const value = object12(input);
        require9(
          same8(Object.keys(value).sort(), [...Object.keys(bound), ...fields].sort()) &&
            Object.entries(bound).every(([key, expected]) => same8(value[key], expected)),
          'release packet source or schema differs',
        );
        return value;
      };
      const persist = async (name, value) => {
        const saved = await optional(name);
        require9(saved === undefined || same8(saved, value), 'immutable release publication differs');
        if (saved === undefined) await store.write(name, value);
        require9(same8(await store.read(name), value), 'release publication changed');
      };
      const retiredPrefix = `azure-power-runner-retirement-${identity}`;
      const retirement = async (proof) => {
        require9(
          session.readArtifactRetirement && (readOnly || session.retireArtifacts),
          'owning artifact retirement contract unavailable',
        );
        const phaseNames = ['authorization', 'plan', 'submission', 'outcome', 'complete', 'finalizing', 'final'].map(
          (phase) => `${prefix}-${phase}.json`,
        );
        const preparingName = `${retiredPrefix}-preparing.json`,
          retiringName = `${retiredPrefix}-retiring.json`,
          retiredName = `${retiredPrefix}-retired.json`;
        const snapshots = {};
        for (const name of phaseNames) {
          const value = await optional(name);
          snapshots[name] = value === undefined ? null : canonicalSha256(value);
        }
        const inspection = (status, proof) => ({
          schemaVersion: 1,
          scope: 'selected-cancelled-network-power-retirement-history',
          sourcePlanSha256: plan.planSha256,
          graphSha256,
          node,
          operation,
          stage: mutation.stage,
          status,
          proof,
          runnerRetirementQualified: status === 'retired',
          currentOperationalAcceptanceQualified: false,
          parentRetirementQualified: false,
          retirementQualified: false,
        });
        let preparing = await optional(preparingName);
        if (readOnly && preparing === undefined) {
          require9(
            !barrierPresent &&
              (await optional(retiringName)) === undefined &&
              (await optional(retiredName)) === undefined,
            'retirement evidence lacks original preparing authorization',
          );
          require9(
            canonicalSha256(await graphRead()) === graphSha256 &&
              canonicalSha256(await store.read(cancellationName)) === cancellationPacketSha256 &&
              same8(await inventory(root), names) &&
              same8(await inventory(stageDirectory), stages) &&
              same8(await inventory(runnerDirectory), runnerNames) &&
              (await optional(preparingName)) === undefined,
            'absent preparation changed during inspection',
          );
          return inspection('absent');
        }
        if (proof) {
          require9(!barrierPresent, 'new preparing authorization cannot follow a barrier');
          require9(
            phaseNames.every((name) => name.endsWith('-submission.json') || snapshots[name] !== null),
            'original release packet unavailable before retirement',
          );
          const expected = {
            ...bound,
            status: 'preparing',
            packetSha256ByName: snapshots,
            finalReceipt: proof.final,
            baseline: proof.baseline,
            releaseReceiptSha256: proof.releaseReceiptSha256,
            finalJournalSha256: proof.finalJournalSha256,
            finalExecutionSha256: proof.finalExecutionSha256,
          };
          if (preparing === undefined) {
            require9(
              (await optional(retiringName)) === undefined && (await optional(retiredName)) === undefined,
              'retirement publication lacks original preparing authorization',
            );
          }
          await persist(preparingName, expected);
          preparing = expected;
        }
        require9(preparing !== undefined, 'permanent barrier lacks original preparing authorization');
        const prepared = packet(preparing, [
          'status',
          'packetSha256ByName',
          'finalReceipt',
          'baseline',
          'releaseReceiptSha256',
          'finalJournalSha256',
          'finalExecutionSha256',
        ]);
        require9(
          prepared.status === 'preparing' &&
            same8(prepared.packetSha256ByName, snapshots) &&
            phaseNames.every((name) => name.endsWith('-submission.json') || snapshots[name] !== null) &&
            [prepared.releaseReceiptSha256, prepared.finalJournalSha256, prepared.finalExecutionSha256].every(
              (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value),
            ),
          'original retirement preparation or packet custody differs',
        );
        const final = await step(() =>
          validateAzureTerraformNetworkPowerPlan(plan, before, node, operation, prepared.finalReceipt, 'final'),
        );
        const savedFinal = packet(await store.read(`${prefix}-final.json`), [
          'status',
          'planPacketSha256',
          'completionSha256',
          'finalizingSha256',
          'receipt',
          'journalSha256',
          'executionSha256',
        ]);
        require9(
          savedFinal.status === 'final' &&
            same8(savedFinal.receipt, final) &&
            savedFinal.journalSha256 === prepared.finalJournalSha256 &&
            savedFinal.executionSha256 === prepared.finalExecutionSha256,
          'original final retirement receipt differs',
        );
        const preparingSha256 = canonicalSha256(prepared),
          retiring = { ...bound, status: 'retiring', preparingSha256, finalReceiptSha256: canonicalSha256(final) };
        const unchanged = async () => {
          require9(
            canonicalSha256(await graphRead()) === graphSha256 &&
              canonicalSha256(await store.read(cancellationName)) === cancellationPacketSha256 &&
              same8(await inventory(root), names) &&
              same8(await inventory(stageDirectory), stages) &&
              same8(await store.read(preparingName), prepared),
            'retirement source changed',
          );
          for (const name of phaseNames) {
            const value = await optional(name);
            require9(
              (value === undefined ? null : canonicalSha256(value)) === snapshots[name],
              'retirement original release packet changed',
            );
          }
          if (!readOnly)
            require9(same8(await observe(), prepared.baseline), 'selected cloud identity changed during retirement');
          else
            require9(
              same8(await inventory(runnerDirectory), runnerNames),
              'retained runner inventory changed during inspection',
            );
        };
        await unchanged();
        let observed = await session.readArtifactRetirement(final, preparingSha256, deadline);
        if (readOnly) {
          require9(
            ['absent', 'retiring', 'runner-artifacts-retired'].includes(observed.status),
            'retirement reader status differs',
          );
          const savedRetiring = await optional(retiringName),
            savedRetired = await optional(retiredName);
          if (savedRetiring !== undefined)
            require9(same8(savedRetiring, retiring), 'original retiring authorization differs');
          require9(
            observed.status === 'absent' || savedRetiring !== undefined,
            'barrier lacks original retiring authorization',
          );
          require9(
            observed.status === 'runner-artifacts-retired' || savedRetired === undefined,
            'incomplete barrier has completed retirement publication',
          );
          let status = observed.status === 'absent' ? 'preparing' : 'retiring';
          if (observed.status === 'runner-artifacts-retired') {
            require9(
              observed.receipt.manifestSha256 === manifestSha256 &&
                observed.receipt.evidenceSha256 === preparingSha256 &&
                observed.receipt.finalPlanSha256 === final.planSha256 &&
                typeof observed.markerSha256 === 'string' &&
                /^[a-f0-9]{64}$/.test(observed.markerSha256),
              'original retained retirement receipt binding differs',
            );
            const expected = {
              ...bound,
              status: 'retired',
              preparingSha256,
              retiringSha256: canonicalSha256(retiring),
              finalReceiptSha256: canonicalSha256(final),
              markerSha256: observed.markerSha256,
              receipt: observed.receipt,
            };
            require9(
              savedRetired === undefined || same8(savedRetired, expected),
              'retired publication differs from retained receipt',
            );
            status = savedRetired === undefined ? 'retired-unpublished' : 'retired';
          }
          await unchanged();
          require9(
            same8({ value: await optional(retiringName) }, { value: savedRetiring }) &&
              same8({ value: await optional(retiredName) }, { value: savedRetired }) &&
              same8(await session.readArtifactRetirement(final, preparingSha256, deadline), observed),
            'retirement proof changed across inspection',
          );
          await unchanged();
          require9(
            same8({ value: await optional(retiringName) }, { value: savedRetiring }) &&
              same8({ value: await optional(retiredName) }, { value: savedRetired }),
            'retirement publication changed at final inspection boundary',
          );
          return inspection(status, {
            preparingSha256,
            finalReceiptSha256: canonicalSha256(final),
            publicationSha256: savedRetired === undefined ? null : canonicalSha256(savedRetired),
            observed,
          });
        }
        require9(session.retireArtifacts, 'owning retirement mutation contract unavailable');
        if (observed.status === 'absent') {
          require9(
            proof && !barrierPresent && (await optional(retiredName)) === undefined,
            'absent barrier cannot recover completed retirement',
          );
          const current = await journal();
          require9(
            current.state === 'planned' &&
              same8(current.receipt, final) &&
              current.journalSha256 === prepared.finalJournalSha256 &&
              current.executionSha256 === prepared.finalExecutionSha256 &&
              current.ordinaryRefreshEnabled === true,
            'original final journal changed before retirement',
          );
          await persist(retiringName, retiring);
          await unchanged();
          await session.retireArtifacts(final, preparingSha256, env, deadline);
          observed = await session.readArtifactRetirement(final, preparingSha256, deadline);
        } else {
          require9(same8(await optional(retiringName), retiring), 'barrier lacks original retiring authorization');
          if (observed.status === 'retiring') {
            require9(
              (await optional(retiredName)) === undefined,
              'partial barrier has completed retirement publication',
            );
            await unchanged();
            await session.retireArtifacts(final, preparingSha256, env, deadline);
            observed = await session.readArtifactRetirement(final, preparingSha256, deadline);
          }
        }
        require9(observed.status === 'runner-artifacts-retired', 'selected runner retirement remains incomplete');
        require9(
          observed.receipt.manifestSha256 === manifestSha256 &&
            observed.receipt.evidenceSha256 === preparingSha256 &&
            observed.receipt.finalPlanSha256 === final.planSha256 &&
            typeof observed.markerSha256 === 'string' &&
            /^[a-f0-9]{64}$/.test(observed.markerSha256),
          'original retained retirement receipt binding differs',
        );
        const retired = {
          ...bound,
          status: 'retired',
          preparingSha256,
          retiringSha256: canonicalSha256(retiring),
          finalReceiptSha256: canonicalSha256(final),
          markerSha256: observed.markerSha256,
          receipt: observed.receipt,
        };
        await unchanged();
        require9(same8(await optional(retiringName), retiring), 'retiring authorization changed');
        await persist(retiredName, retired);
        require9(
          same8(await session.readArtifactRetirement(final, preparingSha256, deadline), observed),
          'retained retirement proof changed before final boundary',
        );
        await unchanged();
        seal();
        return {
          schemaVersion: 1,
          scope: 'selected-cancelled-network-power-runner-retirement',
          sourcePlanSha256: plan.planSha256,
          node,
          operation,
          stage: mutation.stage,
          cancellationPacketSha256,
          releaseReceiptSha256: prepared.releaseReceiptSha256,
          finalReceiptSha256: canonicalSha256(final),
          preparingSha256,
          markerSha256: observed.markerSha256,
          artifactRetirementReceiptSha256: canonicalSha256(observed.receipt),
          selectedReleaseOutcomeQualified: true,
          finalOrdinarySelectedAbsenceQualified: true,
          wholeAppliedStateEmptyQualified: true,
          independentCleanupQualified: true,
          runnerRetirementQualified: true,
          parentRetirementQualified: false,
          retirementQualified: false,
        };
      };
      if (readOnly || barrierPresent) return retirement();
      let authorization = await optional(`${prefix}-authorization.json`);
      if (authorization === undefined) {
        await originalCustody();
        const current = await journal();
        require9(
          current.state === 'absent' &&
            current.receipt === undefined &&
            current.savedPlanSha256 === null &&
            current.journalSha256 === null,
          'saved release lacks original planning authorization',
        );
        require9(
          (await optional(`${prefix}-plan.json`)) === undefined &&
            (await optional(`${prefix}-submission.json`)) === undefined &&
            (await optional(`${prefix}-outcome.json`)) === undefined &&
            (await optional(`${prefix}-complete.json`)) === undefined &&
            (await optional(`${prefix}-finalizing.json`)) === undefined &&
            (await optional(`${prefix}-final.json`)) === undefined,
          'release packets lack original authorization',
        );
        authorization = { ...bound, status: 'authorized', prior: original.packet.prior, baseline: await observe() };
        await persist(`${prefix}-authorization.json`, authorization);
      }
      const authorized = packet(authorization, ['status', 'prior', 'baseline']);
      require9(
        authorized.status === 'authorized' &&
          same8(authorized.prior, original.packet.prior) &&
          same8(authorized.baseline, await observe()),
        'original selected prior or stable cloud baseline differs',
      );
      const authorizationSha256 = canonicalSha256(authorized);
      const stable = async () =>
        require9(
          same8(await observe(), authorized.baseline),
          'selected VM or network changed during state-only release',
        );
      const sealAuthorization = async () =>
        require9(
          same8(await store.read(`${prefix}-authorization.json`), authorized),
          'original release authorization changed',
        );
      let planPacket = await optional(`${prefix}-plan.json`);
      if (planPacket === undefined) {
        await sealAuthorization();
        const current = await journal();
        let receipt;
        if (current.state === 'absent') {
          await originalCustody();
          await stable();
          receipt = await session.plan(env, deadline);
        } else {
          require9(
            current.state === 'planned' && current.receipt,
            'unpublished submitted release requires original plan and submission',
          );
          receipt = current.receipt;
        }
        await step(() => validateAzureTerraformNetworkPowerPlan(plan, before, node, operation, receipt, 'release'));
        const prior = await session.readPlannedResourceFields(
            receipt,
            azureTerraformNetworkPowerSelections,
            env,
            deadline,
          ),
          proposed = await session.readProposedResourceFields(
            receipt,
            azureTerraformNetworkPowerSelections,
            env,
            deadline,
          );
        await step(() =>
          validateAzureTerraformNetworkPowerProjection(
            plan,
            before,
            node,
            operation,
            receipt,
            'release',
            prior,
            proposed,
          ),
        );
        require9(same8(prior, original.packet.prior), 'release prior differs from original cancelled prior');
        const custody = await originalCustody(receipt);
        require9(
          'continuation' in custody &&
            custody.continuation &&
            custody.continuation.state === 'planned' &&
            custody.continuation.ordinaryRefreshEnabled === true,
          'release lacks original ordinary unsubmitted execution',
        );
        planPacket = {
          ...bound,
          status: 'planned',
          authorizationSha256,
          receipt,
          prior,
          proposed,
          originalExecutionSha256: custody.continuation.executionSha256,
          originalReleaseJournalSha256: custody.continuation.journalSha256,
        };
        await stable();
        await sealAuthorization();
        await persist(`${prefix}-plan.json`, planPacket);
      }
      const planned = packet(planPacket, [
        'status',
        'authorizationSha256',
        'receipt',
        'prior',
        'proposed',
        'originalExecutionSha256',
        'originalReleaseJournalSha256',
      ]);
      require9(
        planned.status === 'planned' &&
          planned.authorizationSha256 === authorizationSha256 &&
          same8(planned.prior, original.packet.prior) &&
          typeof planned.originalExecutionSha256 === 'string' &&
          /^[a-f0-9]{64}$/.test(planned.originalExecutionSha256) &&
          typeof planned.originalReleaseJournalSha256 === 'string' &&
          /^[a-f0-9]{64}$/.test(planned.originalReleaseJournalSha256),
        'original release plan binding differs',
      );
      const released = await step(() =>
        validateAzureTerraformNetworkPowerPlan(plan, before, node, operation, planned.receipt, 'release'),
      );
      await step(() =>
        validateAzureTerraformNetworkPowerProjection(
          plan,
          before,
          node,
          operation,
          released,
          'release',
          planned.prior,
          planned.proposed,
        ),
      );
      const planPacketSha256 = canonicalSha256(planned);
      const expectedSubmission = {
        ...bound,
        status: 'submitted',
        planPacketSha256,
        authorizationSha256,
        receiptSha256: canonicalSha256(released),
        originalReleaseJournalSha256: planned.originalReleaseJournalSha256,
      };
      const validateSubmission = async () =>
        require9(
          released.noChanges
            ? (await optional(`${prefix}-submission.json`)) === undefined
            : same8(await optional(`${prefix}-submission.json`), expectedSubmission),
          'original submission authorization differs',
        );
      const active = async (receipt) => {
        const value = await originalCustody(receipt);
        require9(
          'continuation' in value &&
            value.continuation &&
            value.continuation.ordinaryRefreshEnabled === true &&
            value.continuation.executionSha256 === planned.originalExecutionSha256,
          'original release execution changed',
        );
        return value.continuation;
      };
      const outcomeName = `${prefix}-outcome.json`,
        completionName = `${prefix}-complete.json`;
      let complete = await optional(completionName);
      if (complete === undefined) {
        let current = await active(released);
        const submission = {
          ...bound,
          status: 'submitted',
          planPacketSha256,
          authorizationSha256,
          receiptSha256: canonicalSha256(released),
          originalReleaseJournalSha256: planned.originalReleaseJournalSha256,
        };
        if (!released.noChanges) {
          const submitted = await optional(`${prefix}-submission.json`);
          if (current.state === 'planned') {
            require9(
              current.journalSha256 === planned.originalReleaseJournalSha256,
              'original planned journal changed before submission',
            );
            require9(
              submitted === undefined || same8(submitted, submission),
              'planned submission authorization differs',
            );
            await stable();
            await sealAuthorization();
            await persist(`${prefix}-submission.json`, submission);
            await session.apply(released, env, deadline);
            current = await active(released);
          } else
            require9(
              same8(submitted, submission) && (current.state === 'applying' || current.state === 'applied'),
              'submitted release lacks exact original submission authorization',
            );
        } else
          require9(
            current.state === 'planned' &&
              current.journalSha256 === planned.originalReleaseJournalSha256 &&
              (await optional(`${prefix}-submission.json`)) === undefined,
            'empty release has an unexpected submission',
          );
        const fields = await session.readAppliedResourceFields(
          released,
          azureTerraformNetworkPowerSelections,
          env,
          deadline,
        );
        require9(same8(fields, { [address]: null }), 'selected release outcome unavailable: original control remains');
        await stable();
        await sealAuthorization();
        const outcome = {
          ...bound,
          status: 'observed',
          planPacketSha256,
          authorizationSha256,
          receiptSha256: canonicalSha256(released),
          originalExecutionSha256: planned.originalExecutionSha256,
          state: fields,
          cloud: authorized.baseline,
        };
        await persist(outcomeName, outcome);
        require9(
          same8(
            await session.readAppliedResourceFields(released, azureTerraformNetworkPowerSelections, env, deadline),
            fields,
          ),
          'selected applied outcome changed before reconciliation',
        );
        await stable();
        if (current.state === 'applying') await session.reconcileApplyFromEvidence(released, canonicalSha256(outcome));
        current = await active(released);
        require9(
          current.state === (released.noChanges ? 'planned' : 'applied'),
          'selected release journal not settled',
        );
        complete = {
          ...bound,
          status: 'complete',
          planPacketSha256,
          authorizationSha256,
          receiptSha256: canonicalSha256(released),
          outcomeSha256: canonicalSha256(outcome),
          releasedJournalSha256: current.journalSha256,
          releasedState: current.state,
        };
        await persist(completionName, complete);
      }
      await validateSubmission();
      const completed = packet(complete, [
        'status',
        'planPacketSha256',
        'authorizationSha256',
        'receiptSha256',
        'outcomeSha256',
        'releasedJournalSha256',
        'releasedState',
      ]);
      require9(
        completed.status === 'complete' &&
          completed.planPacketSha256 === planPacketSha256 &&
          completed.authorizationSha256 === authorizationSha256 &&
          completed.receiptSha256 === canonicalSha256(released) &&
          completed.releasedState === (released.noChanges ? 'planned' : 'applied') &&
          typeof completed.releasedJournalSha256 === 'string' &&
          /^[a-f0-9]{64}$/.test(completed.releasedJournalSha256),
        'release completion binding differs',
      );
      const outcome = packet(await store.read(outcomeName), [
        'status',
        'planPacketSha256',
        'authorizationSha256',
        'receiptSha256',
        'originalExecutionSha256',
        'state',
        'cloud',
      ]);
      require9(
        outcome.status === 'observed' &&
          outcome.planPacketSha256 === planPacketSha256 &&
          outcome.authorizationSha256 === authorizationSha256 &&
          outcome.receiptSha256 === canonicalSha256(released) &&
          outcome.originalExecutionSha256 === planned.originalExecutionSha256 &&
          same8(outcome.state, { [address]: null }) &&
          same8(outcome.cloud, authorized.baseline) &&
          canonicalSha256(outcome) === completed.outcomeSha256,
        'original selected outcome differs',
      );
      await stable();
      await sealAuthorization();
      const originalReleaseHistory = async () => {
        const value = await readHistory.call(session, released, deadline);
        require9(
          value.schemaVersion === 1 &&
            value.scope === 'exact-saved-plan-journal-history' &&
            value.receiptSha256 === canonicalSha256(released) &&
            value.incompleteArchives === 0 &&
            value.applicationOutcomeQualified === false &&
            value.retirementQualified === false &&
            value.matches.some(
              (entry) =>
                entry.journalSha256 === completed.releasedJournalSha256 &&
                entry.state === completed.releasedState &&
                entry.manifestSha256 === manifestSha256 &&
                entry.savedPlanSha256 === released.planSha256,
            ),
          'original completed release journal unavailable',
        );
      };
      await originalReleaseHistory();
      const finalizing = {
        ...bound,
        status: 'finalizing',
        planPacketSha256,
        completionSha256: canonicalSha256(completed),
        originalReleaseJournalSha256: completed.releasedJournalSha256,
        originalReleaseState: completed.releasedState,
      };
      const current = await journal(),
        savedFinalizing = await optional(`${prefix}-finalizing.json`);
      if (savedFinalizing === undefined) {
        require9(
          current.receipt &&
            same8(current.receipt, released) &&
            current.journalSha256 === completed.releasedJournalSha256 &&
            current.state === completed.releasedState &&
            (await optional(`${prefix}-final.json`)) === undefined,
          'final refresh lacks original completed release authorization',
        );
        await persist(`${prefix}-finalizing.json`, finalizing);
      } else require9(same8(savedFinalizing, finalizing), 'finalizing source differs');
      let final;
      if (current.receipt && same8(current.receipt, released)) {
        require9(
          current.journalSha256 === completed.releasedJournalSha256 && current.state === completed.releasedState,
          'original release changed before final refresh',
        );
        if (released.noChanges && released.changes.length === 0) final = released;
        else {
          require9(
            (await optional(`${prefix}-final.json`)) === undefined,
            'published final differs from original current release',
          );
          await stable();
          await sealAuthorization();
          final = await session.plan(env, deadline);
        }
      } else {
        require9(current.state === 'planned' && current.receipt, 'current final receipt unavailable');
        final = current.receipt;
      }
      await step(() => validateAzureTerraformNetworkPowerPlan(plan, before, node, operation, final, 'final'));
      const finalPrior = await session.readPlannedResourceFields(
          final,
          azureTerraformNetworkPowerSelections,
          env,
          deadline,
        ),
        finalProposed = await session.readProposedResourceFields(
          final,
          azureTerraformNetworkPowerSelections,
          env,
          deadline,
        );
      await step(() =>
        validateAzureTerraformNetworkPowerProjection(
          plan,
          before,
          node,
          operation,
          final,
          'final',
          finalPrior,
          finalProposed,
        ),
      );
      const finalJournal = await journal();
      require9(
        finalJournal.state === 'planned' &&
          same8(finalJournal.receipt, final) &&
          finalJournal.ordinaryRefreshEnabled === true &&
          typeof finalJournal.executionSha256 === 'string' &&
          /^[a-f0-9]{64}$/.test(finalJournal.executionSha256),
        'ordinary current final execution unavailable',
      );
      await originalCustody(final);
      await originalReleaseHistory();
      require9(
        same8(await session.readAppliedResourceFields(final, azureTerraformNetworkPowerSelections, env, deadline), {
          [address]: null,
        }),
        'final applied selected control remains',
      );
      await stable();
      await sealAuthorization();
      const finalPacket = {
        ...bound,
        status: 'final',
        planPacketSha256,
        completionSha256: canonicalSha256(completed),
        finalizingSha256: canonicalSha256(finalizing),
        receipt: final,
        journalSha256: finalJournal.journalSha256,
        executionSha256: finalJournal.executionSha256,
      };
      await persist(`${prefix}-final.json`, finalPacket);
      require9(
        same8(await journal(), finalJournal) &&
          same8(await store.read(`${prefix}-plan.json`), planned) &&
          same8(await store.read(completionName), completed) &&
          same8(await store.read(outcomeName), outcome) &&
          same8(await store.read(`${prefix}-finalizing.json`), finalizing),
        'release evidence changed across final publication',
      );
      await validateSubmission();
      seal();
      if (retire)
        return retirement({
          final,
          baseline: authorized.baseline,
          releaseReceiptSha256: canonicalSha256(released),
          finalJournalSha256: finalJournal.journalSha256,
          finalExecutionSha256: finalJournal.executionSha256,
        });
      return {
        schemaVersion: 1,
        scope: 'selected-cancelled-network-power-state-release',
        sourcePlanSha256: plan.planSha256,
        node,
        operation,
        stage: mutation.stage,
        cancellationPacketSha256,
        releaseReceiptSha256: canonicalSha256(released),
        finalReceiptSha256: canonicalSha256(final),
        selectedReleaseOutcomeQualified: true,
        finalOrdinarySelectedAbsenceQualified: true,
        wholeAppliedStateEmptyQualified: false,
        independentCleanupQualified: false,
        runnerRetirementQualified: false,
        parentRetirementQualified: false,
        retirementQualified: false,
      };
    },
    { beforeLock: (step) => step(() => rawStore.verify()) },
  );
}

// plugins/azure/src/ce/terraform-network-power-runner-history.ts
var hash11 = (value) => createHash12('sha256').update(value).digest('hex');
var same9 = (a, b) => canonicalEqual(a, b);
function require10(value, message) {
  if (!value) throw Error(`Azure Terraform network power runner history: ${message}`);
}
async function readAzureTerraformNetworkPowerRunnerHistory(
  request,
  store,
  terraform,
  loaders,
  siteRequest,
  verifier,
  signal,
  replacementVerifier,
  graphWitness,
) {
  const plan = structuredClone(request),
    site = structuredClone(siteRequest),
    owner = structuredClone(store.owner),
    directory = store.directory,
    open = terraform.open,
    { read, verify } = store,
    { loadSource, loadOutcome } = loaders;
  const graphWitnessSha256 = graphWitness === undefined ? undefined : canonicalSha256(graphWitness);
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require10(
      (graphWitness === undefined || canonicalSha256(graphWitness) === graphWitnessSha256) &&
        same9(request, plan) &&
        same9(siteRequest, site) &&
        same9(store.owner, owner) &&
        store.directory === directory &&
        terraform.open === open &&
        store.read === read &&
        store.verify === verify &&
        loaders.loadSource === loadSource &&
        loaders.loadOutcome === loadOutcome,
      'request or owning dependency changed',
    );
  };
  const step = async (action) => {
    seal();
    const aborted = Promise.withResolvers(),
      onAbort = () => aborted.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([action(), aborted.promise]);
      seal();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const directories = new Map(),
    markers = new Map();
  const inventory = async (path) =>
    step(async () => {
      let names = null;
      try {
        const stat = await lstat9(path);
        require10(
          stat.isDirectory() &&
            !stat.isSymbolicLink() &&
            stat.uid === process.getuid?.() &&
            (stat.mode & 63) === 0 &&
            (await realpath9(path)) === path,
          'stage directory ownership differs',
        );
        names = (await readdir10(path)).sort();
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      require10(!directories.has(path) || same9(directories.get(path), names), 'stage directory inventory changed');
      directories.set(path, names);
      return names;
    });
  const exists = async (path) =>
    step(async () => {
      let found = true;
      try {
        await lstat9(path);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        found = false;
      }
      require10(!markers.has(path) || markers.get(path) === found, 'stage marker presence changed');
      markers.set(path, found);
      return found;
    });
  const retainedFiles = new Map();
  const retainedFile = async (path, expectedSha256) =>
    step(async () => {
      const file = await openFile(path, constants3.O_RDONLY | constants3.O_NOFOLLOW);
      try {
        const before = await file.stat();
        require10(
          before.isFile() && before.uid === process.getuid?.() && before.nlink === 1 && (before.mode & 63) === 0,
          'retained completed runner file ownership differs',
        );
        const bytes = await file.readFile(),
          after = await file.stat(),
          named = await lstat9(path);
        require10(
          after.dev === before.dev &&
            after.ino === before.ino &&
            after.size === before.size &&
            after.mtimeMs === before.mtimeMs &&
            after.ctimeMs === before.ctimeMs &&
            named.isFile() &&
            !named.isSymbolicLink() &&
            named.dev === before.dev &&
            named.ino === before.ino &&
            named.uid === before.uid &&
            named.nlink === 1 &&
            (named.mode & 63) === 0,
          'retained completed runner file changed during read',
        );
        const digest = createHash12('sha256').update(bytes).digest('hex');
        require10(
          (expectedSha256 === undefined || digest === expectedSha256) &&
            (!retainedFiles.has(path) || retainedFiles.get(path) === digest),
          'authenticated completed runner bytes changed',
        );
        retainedFiles.set(path, digest);
        return bytes;
      } finally {
        await file.close();
      }
    });
  const graphRead = () =>
    step(() =>
      graphWitness === undefined
        ? readAzureTerraformNetworkRetirementGraph(plan, store, loaders, site, verifier, deadline, replacementVerifier)
        : recheckAzureTerraformNetworkRetirementGraph(
            graphWitness,
            plan,
            store,
            loaders,
            site,
            verifier,
            deadline,
            replacementVerifier,
          ),
    );
  const graph = await graphRead(),
    graphSha256 = canonicalSha256(graph);
  const root = join10(directory, 'terraform-stages'),
    names = await inventory(root),
    prefix = `network-${plan.planSha256.slice(0, 24)}-`;
  const selected = (names ?? []).filter((name) => name.startsWith(prefix));
  const deployments = graph.powerDeployments;
  require10(
    new Set(deployments.map((deployment) => deployment.stage)).size === deployments.length &&
      selected.every((stage) => deployments.some((deployment) => deployment.stage === stage)),
    'orphan or serially unauthorized selected power runner',
  );
  const rows = [];
  const rechecks = [];
  for (const deployment of deployments) {
    require10(deployment.stage, 'derived stage identity missing');
    const match = deployment.stage.match(/-node-(\d+)-(deallocate|start)$/);
    require10(match, 'derived selected stage malformed');
    const node = Number(match[1]),
      operation = match[2];
    const checkpoint = graph.checkpoint.snapshot?.checkpoint.nodes.find((row) => row.node === node),
      historyNode = graph.nodes.find((row) => row.node === node);
    require10(checkpoint && historyNode, 'selected runner lacks exact original serial node');
    const history = operation === 'start' ? historyNode.start : historyNode.deallocate;
    const row = { stage: deployment.stage, node, operation, deploymentSha256: canonicalSha256(deployment) };
    if (!selected.includes(deployment.stage)) {
      require10(!history.lastPacket, 'published selected power history lacks owning runner directory');
      rows.push({ ...row, status: 'missing' });
      continue;
    }
    const stageDirectory = join10(root, deployment.stage),
      runnerDirectory = join10(stageDirectory, deployment.deploymentId);
    const stageNames = await inventory(stageDirectory);
    require10(
      stageNames && same9(stageNames, [deployment.deploymentId]),
      'stage directory has foreign or orphan runner',
    );
    require10(await inventory(runnerDirectory), 'owning runner directory missing');
    require10(
      !(await exists(join10(runnerDirectory, 'configuration-transition.json'))),
      'pending runner revision requires owner recovery',
    );
    if (await exists(join10(runnerDirectory, 'artifact-retirement.json'))) {
      const identity = canonicalSha256({
        planSha256: plan.planSha256,
        selectedNode: node,
        selectedOperation: operation,
      }).slice(0, 24);
      const readCancellation = async () => {
        try {
          return await step(() => store.read(`azure-power-cancel-${identity}.json`));
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      };
      const cancellation = await readCancellation();
      rechecks.push(async () =>
        require10(
          same9({ value: await readCancellation() }, { value: cancellation }),
          'selected cancellation presence or custody changed',
        ),
      );
      if (cancellation !== undefined) {
        const inspect = () =>
          step(() =>
            readAzureTerraformNetworkCancelledPowerRetirement(
              plan,
              node,
              operation,
              terraform,
              store,
              loaders,
              site,
              verifier,
              deadline,
              replacementVerifier,
            ),
          );
        const retirement = await inspect();
        rows.push({
          ...row,
          status: retirement.runnerRetirementQualified ? 'retired' : 'retired-awaiting-receipt',
          retirement,
        });
        rechecks.push(async () =>
          require10(same9(await inspect(), retirement), 'retired selected runner proof changed'),
        );
      } else {
        const completedIdentity = canonicalSha256({ planSha256: plan.planSha256, node, operation }).slice(0, 24);
        const packetNames = ['preparing', 'retiring', 'retired'].map(
          (phase) => `azure-power-completed-retirement-${completedIdentity}-${phase}.json`,
        );
        const readPackets = async () => {
          const packets = [];
          for (const name of packetNames) {
            try {
              packets.push(await step(() => store.read(name)));
            } catch (error) {
              if (error.code !== 'ENOENT') throw error;
              packets.push(null);
            }
          }
          return packets;
        };
        const packets = await readPackets();
        rechecks.push(async () =>
          require10(same9(await readPackets(), packets), 'completed retirement publication custody changed'),
        );
        if (packets.some((packet) => packet !== null)) {
          const inspect = () =>
            step(() =>
              readAzureTerraformNetworkCompletedPowerRetirement(
                plan,
                node,
                operation,
                terraform,
                store,
                loaders,
                site,
                verifier,
                deadline,
                replacementVerifier,
                graphWitness ?? graph,
              ),
            );
          const retirement = await inspect();
          rows.push({
            ...row,
            status: retirement.runnerRetirementQualified ? 'retired' : 'retired-awaiting-receipt',
            retirement,
          });
          if (retirement.runnerRetirementQualified) {
            const proof = retirement.proof;
            require10(
              proof?.observed?.status === 'runner-artifacts-retired' &&
                typeof proof.observed.markerSha256 === 'string' &&
                /^[a-f0-9]{64}$/.test(proof.observed.markerSha256) &&
                typeof proof.observed.receipt?.manifestSha256 === 'string',
              'completed retained proof missing',
            );
            const release = await step(() =>
              azureTerraformNetworkPowerDeployment(plan, checkpoint.before, node, operation, true),
            );
            const { configuration, providerLock, ...identity } = release;
            const manifest = {
              ...identity,
              configurationSha256: hash11(configuration),
              providerLockSha256: hash11(providerLock),
            };
            require10(
              canonicalSha256(manifest) === proof.observed.receipt.manifestSha256,
              'completed retained manifest differs from selected release',
            );
            require10(
              same9(await inventory(runnerDirectory), ['artifact-retirement.json', 'deployment.json']),
              'completed retired runner retains unexpected artifacts',
            );
            require10(
              same9(JSON.parse((await retainedFile(join10(runnerDirectory, 'deployment.json'))).toString()), manifest),
              'completed retained manifest bytes differ',
            );
            await retainedFile(join10(runnerDirectory, 'artifact-retirement.json'), proof.observed.markerSha256);
          } else {
            rechecks.push(async () =>
              require10(same9(await inspect(), retirement), 'completed selected retirement proof changed'),
            );
          }
        } else rows.push({ ...row, status: 'retired-awaiting-receipt' });
      }
      continue;
    }
    const session = await step(() => open.call(terraform, owner, deployment, 'current'));
    const {
      readConfigurationSha256: currentConfiguration,
      readCurrentPlanJournal: currentJournal,
      readPlanApplicationHistory: applicationHistory,
    } = session;
    require10(currentConfiguration && currentJournal && applicationHistory, 'owning journal inspection unavailable');
    const methods = () =>
      require10(
        session.readConfigurationSha256 === currentConfiguration &&
          session.readCurrentPlanJournal === currentJournal &&
          session.readPlanApplicationHistory === applicationHistory,
        'owning runner method changed',
      );
    const release = await step(() =>
      azureTerraformNetworkPowerDeployment(plan, checkpoint.before, node, operation, true),
    );
    require10(
      same9(
        deployment,
        await step(() => azureTerraformNetworkPowerDeployment(plan, checkpoint.before, node, operation)),
      ),
      'derived stage differs from serial inventory',
    );
    const manifestOf = (value) => {
      const { configuration, providerLock, ...identity } = value;
      return { ...identity, configurationSha256: hash11(configuration), providerLockSha256: hash11(providerLock) };
    };
    const configuration = await step(() => currentConfiguration.call(session));
    methods();
    require10(
      configuration === hash11(deployment.configuration) || configuration === hash11(release.configuration),
      'current isolated power configuration differs',
    );
    const configurationPhase = configuration === hash11(deployment.configuration) ? 'mutation' : 'release';
    require10(
      configurationPhase !== 'mutation' || !history.receipts.release,
      'actual runner is behind published release history',
    );
    if (configurationPhase === 'release')
      require10(
        history.receipts.mutation &&
          history.packetSha256ByName[
            `${plan.planId}-terraform-network-node-${node}-${operation}-mutation-complete.json`
          ],
        'release configuration lacks original completed mutation history',
      );
    const current = await step(() => currentJournal.call(session, configuration, deadline));
    methods();
    require10(
      current.schemaVersion === 1 &&
        current.scope === 'current-saved-plan-byte-and-journal-binding' &&
        current.planSemanticsQualified === false &&
        current.manifestSha256 ===
          canonicalSha256(manifestOf(configurationPhase === 'mutation' ? deployment : release)),
      'current journal contract differs',
    );
    if (current.receipt) {
      await step(() =>
        validateAzureTerraformNetworkPowerPlan(
          plan,
          checkpoint.before,
          node,
          operation,
          current.receipt,
          configurationPhase,
        ),
      );
      require10(
        current.savedPlanSha256 === current.receipt.planSha256 &&
          current.journalSha256 &&
          ['planned', 'applying', 'applied'].includes(current.state),
        'current journal receipt binding differs',
      );
      const recorded =
        configurationPhase === 'mutation'
          ? [history.receipts.mutation]
          : [history.receipts.release, history.receipts.final, history.receipts.current];
      require10(
        recorded.some((receipt) => receipt && same9(receipt, current.receipt)) || current.state === 'planned',
        'unpublished submitted current journal',
      );
    } else
      require10(
        current.state === 'absent' && current.savedPlanSha256 === null && current.journalSha256 === null,
        'unbound absent current journal',
      );
    const phases = {};
    for (const phase of ['mutation', 'release']) {
      const receipt = history.receipts[phase];
      if (!receipt) continue;
      const actual = await step(() => applicationHistory.call(session, receipt, deadline));
      methods();
      require10(
        actual.schemaVersion === 1 &&
          actual.scope === 'exact-saved-plan-journal-history' &&
          actual.receiptSha256 === canonicalSha256(receipt) &&
          actual.applicationOutcomeQualified === false &&
          actual.retirementQualified === false &&
          actual.manifestSha256 === current.manifestSha256 &&
          Number.isSafeInteger(actual.incompleteArchives) &&
          actual.incompleteArchives >= 0 &&
          Array.isArray(actual.matches),
        'original phase journal history contract differs',
      );
      require10(
        actual.matches.every(
          (entry) =>
            ['current', 'revision', 'plan-history'].includes(entry.location) &&
            ['planned', 'applying', 'applied'].includes(entry.state) &&
            /^[a-f0-9]{64}$/.test(entry.archiveSha256) &&
            /^[a-f0-9]{64}$/.test(entry.journalSha256) &&
            entry.savedPlanSha256 === receipt.planSha256 &&
            entry.configurationSha256 === receipt.configurationSha256 &&
            entry.manifestSha256 === canonicalSha256(manifestOf(phase === 'mutation' ? deployment : release)),
        ),
        'original phase journal record identity differs',
      );
      const states = new Set(actual.matches.map((entry) => entry.state));
      const submission =
        states.has('applied') && states.has('applying')
          ? 'ambiguous'
          : states.has('applied')
            ? 'applied'
            : states.has('applying')
              ? 'unresolved'
              : states.has('planned')
                ? receipt.noChanges
                  ? 'no-change'
                  : 'unsubmitted'
                : 'missing';
      phases[phase] = { receiptSha256: canonicalSha256(receipt), submission, history: actual };
      rechecks.push(async () => {
        methods();
        require10(
          same9(await step(() => applicationHistory.call(session, receipt, deadline)), actual),
          'original selected runner phase journal changed',
        );
        methods();
      });
    }
    rows.push({ ...row, status: 'inspected', configurationPhase, current, phases });
    rechecks.push(async () => {
      methods();
      require10(
        (await step(() => currentConfiguration.call(session))) === configuration &&
          same9(await step(() => currentJournal.call(session, configuration, deadline)), current),
        'current selected runner journal changed',
      );
      methods();
    });
  }
  require10(
    canonicalSha256(await graphRead()) === graphSha256,
    'original serial graph changed across runner inspection',
  );
  for (const check of rechecks) await check();
  for (const path of directories.keys()) await inventory(path);
  for (const path of markers.keys()) await exists(path);
  for (const path of retainedFiles.keys()) await retainedFile(path);
  require10(
    canonicalSha256(await graphRead()) === graphSha256,
    'original serial graph changed at completed custody boundary',
  );
  seal();
  return {
    schemaVersion: 1,
    scope: 'network-power-graph-and-runner-journal-history',
    planSha256: plan.planSha256,
    graphSha256,
    rows,
    currentOperationalAcceptanceQualified: false,
    applicationOutcomeQualified: false,
    runnerRetirementQualified: false,
    parentRetirementQualified: false,
    retirementQualified: false,
  };
}

// plugins/azure/src/ce/terraform-network-retirement-lineage.ts
// plugins/azure/src/ce/terraform-network-main-runner-history.ts
import { createHash as createHash13, createHash as createHash16 } from 'node:crypto';
import { constants as constants6 } from 'node:fs';
import {
  lstat as lstat10,
  lstat as lstat13,
  open as openFile3,
  readdir as readdir11,
  readdir as readdir14,
  realpath as realpath10,
  realpath as realpath13,
} from 'node:fs/promises';
import { join as join11, join as join14 } from 'node:path';

var same10 = (a, b) => canonicalEqual({ value: a }, { value: b });
var hash12 = (value) => createHash13('sha256').update(value).digest('hex');
var sha6 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function require11(value, message) {
  if (!value) throw Error(`Azure Terraform network main runner history: ${message}`);
}
function keys5(value, fields) {
  require11(value && typeof value === 'object' && !Array.isArray(value), 'complete journal object required');
  const row = value;
  require11(same10(Object.keys(row).sort(), fields.toSorted()), 'journal schema differs');
  return row;
}
async function readAzureTerraformNetworkMainRunnerHistory(
  request,
  store,
  terraform,
  loaders,
  siteRequest,
  verifier,
  signal,
  replacementVerifier,
  lineageWitness,
  emptyMainAdmission,
) {
  const plan = structuredClone(request),
    site = structuredClone(siteRequest),
    owner = structuredClone(store.owner),
    { directory, read: readPacket } = store;
  const dependencies = [
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'verify', value: store.verify },
    { target: terraform, key: 'open', value: terraform.open },
    { target: loaders, key: 'loadSource', value: loaders.loadSource },
    { target: loaders, key: 'loadOutcome', value: loaders.loadOutcome },
  ];
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require11(
      same10(request, plan) &&
        same10(siteRequest, site) &&
        same10(store.owner, owner) &&
        store.directory === directory &&
        dependencies.every(({ target, key, value }) => Reflect.get(target, key) === value),
      'request or owning dependency changed',
    );
  };
  const step = async (action) => {
    seal();
    const aborted = Promise.withResolvers(),
      onAbort = () => aborted.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([action(), aborted.promise]);
      seal();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const lineageRead = () =>
    step(() =>
      recheckAzureTerraformNetworkRetirementLineage(
        lineageWitness,
        plan,
        store,
        loaders,
        site,
        verifier,
        deadline,
        replacementVerifier,
      ),
    );
  const recheckEmpty = async () => {
    if (!emptyMainAdmission) return;
    require11(
      emptyMainAdmission.context.terraform === terraform && same10(emptyMainAdmission.context.site, site),
      'terminal main owner context differs',
    );
    await step(() =>
      recheckAzureTerraformNetworkEmptyMainBinding(
        emptyMainAdmission.witness,
        emptyMainAdmission.witness.originalPlanSha256,
        store,
        emptyMainAdmission.context,
        deadline,
      ),
    );
  };
  await recheckEmpty();
  const lineage = lineageWitness === undefined ? undefined : await lineageRead();
  const graphRead = () =>
    lineageWitness === undefined
      ? step(() =>
          readAzureTerraformNetworkRetirementGraph(plan, store, loaders, site, verifier, deadline, replacementVerifier),
        )
      : lineageRead().then((value) => value.graph);
  const graph = lineage?.graph ?? (await graphRead()),
    graphSha256 = canonicalSha256(graph);
  const deployment = await step(() => azureTerraformCurrentDeployment(plan));
  require11(
    !deployment.stage &&
      deployment.deploymentId === owner.deploymentId &&
      deployment.scope.account === owner.account &&
      deployment.scope.region === owner.region &&
      deployment.scope.cloud === owner.provider,
    'main runner deployment identity differs',
  );
  const runnerDirectory = join11(directory, deployment.deploymentId);
  const inventory = () =>
    step(async () => {
      try {
        const stat = await lstat10(runnerDirectory);
        require11(
          stat.isDirectory() &&
            !stat.isSymbolicLink() &&
            stat.uid === process.getuid?.() &&
            (stat.mode & 63) === 0 &&
            (await realpath10(runnerDirectory)) === runnerDirectory,
          'main runner private directory ownership differs',
        );
        return (await readdir11(runnerDirectory)).sort();
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        return null;
      }
    });
  const names = await inventory();
  require11(!names?.includes('configuration-transition.json'), 'pending main runner revision requires owner recovery');
  const rows = [],
    terminalRows = [],
    receipts = [];
  const rechecks = [];
  for (const node of graph.nodes) {
    for (const stage of ['nic', 'routing']) {
      const history = node[stage];
      if (!history) continue;
      for (const phase of ['mutation', 'release', 'final', 'current']) {
        const receipt = history.receipts[phase];
        if (!receipt) continue;
        const prefix = `${plan.planId}-terraform-network-node-${node.node}${stage === 'routing' ? '-routing' : ''}`;
        const publishedCompletion =
          phase === 'mutation' || phase === 'release'
            ? history.packetSha256ByName[`${prefix}-${phase}-complete.json`] !== undefined
            : false;
        rows.push({
          node: node.node,
          stage,
          phase,
          receiptSha256: canonicalSha256(receipt),
          configurationSha256: receipt.configurationSha256,
          publishedCompletion,
          submission: 'missing',
        });
        receipts.push(structuredClone(receipt));
      }
    }
  }
  for (const [publicationName, packetSha256] of Object.entries(graph.checkpoint.completionSha256ByName)) {
    const packet = await step(() => readPacket.call(store, publicationName));
    require11(canonicalSha256(packet) === packetSha256, 'terminal publication changed after graph authentication');
    require11(packet && typeof packet === 'object' && !Array.isArray(packet), 'terminal publication object required');
    const receipt = packet.receipt;
    require11(
      receipt &&
        receipt.noChanges === true &&
        Array.isArray(receipt.changes) &&
        receipt.changes.every((change) => change.actions.length === 1 && change.actions[0] === 'no-op'),
      'terminal publication requires exact no-change receipt',
    );
    terminalRows.push({
      publicationName,
      packetSha256,
      receiptSha256: canonicalSha256(receipt),
      configurationSha256: receipt.configurationSha256,
      publishedCompletion: true,
      submission: 'missing',
    });
    receipts.push(structuredClone(receipt));
    rechecks.push(async () => {
      require11(
        canonicalSha256(await step(() => readPacket.call(store, publicationName))) === packetSha256,
        'terminal publication changed at saved-byte boundary',
      );
    });
  }
  const custodyRows = [...rows, ...terminalRows];
  const status = !names
    ? 'missing'
    : names.includes('artifact-retirement.json')
      ? 'retired-awaiting-original-history'
      : 'inspected';
  let current;
  if (status === 'inspected') {
    const session = await step(() => terraform.open(owner, deployment, 'current'));
    const {
      readConfigurationSha256: readConfiguration,
      readCurrentPlanJournal: readCurrent,
      readPlanApplicationHistory: readHistory,
    } = session;
    require11(readConfiguration && readCurrent && readHistory, 'authenticated main runner journal readers unavailable');
    const methods = () =>
      require11(
        session.readConfigurationSha256 === readConfiguration &&
          session.readCurrentPlanJournal === readCurrent &&
          session.readPlanApplicationHistory === readHistory,
        'main runner reader method changed',
      );
    const configuration = await step(() => readConfiguration.call(session));
    methods();
    const configurations = new Set([
      graph.original.binding.sourceConfigurationSha256,
      ...receipts.map((receipt) => receipt.configurationSha256),
      ...(lineage?.lineage.configurationSha256s ?? []),
      ...(emptyMainAdmission ? [emptyMainAdmission.witness.configurationSha256] : []),
    ]);
    require11(
      sha6(configuration) && configurations.has(configuration),
      'current main runner configuration is outside original graph',
    );
    const manifestOf = (configurationSha256) => {
      const { configuration: _source, providerLock, ...identity } = deployment;
      return canonicalSha256({ ...identity, configurationSha256, providerLockSha256: hash12(providerLock) });
    };
    current = await step(() => readCurrent.call(session, configuration, deadline));
    methods();
    keys5(current, [
      'schemaVersion',
      'scope',
      'state',
      'receipt',
      'manifestSha256',
      'journalSha256',
      'savedPlanSha256',
      'planSemanticsQualified',
      ...(current.executionSha256 !== undefined ? ['executionSha256', 'ordinaryRefreshEnabled'] : []),
    ]);
    require11(
      current.executionSha256 === undefined ||
        (sha6(current.executionSha256) && typeof current.ordinaryRefreshEnabled === 'boolean'),
      'current execution binding differs',
    );
    const manifestSha256 = manifestOf(configuration);
    require11(
      current.schemaVersion === 1 &&
        current.scope === 'current-saved-plan-byte-and-journal-binding' &&
        current.manifestSha256 === manifestSha256 &&
        current.planSemanticsQualified === false &&
        ['absent', 'planned', 'applying', 'applied'].includes(current.state),
      'current main runner journal identity differs',
    );
    require11(
      current.receipt
        ? current.savedPlanSha256 === current.receipt.planSha256 &&
            sha6(current.savedPlanSha256) &&
            current.receipt.schemaVersion === 1 &&
            current.receipt.engine === 'terraform' &&
            sha6(current.journalSha256) &&
            current.receipt.configurationSha256 === configuration &&
            current.receipt.deploymentId === deployment.deploymentId &&
            current.receipt.backendIdentity === deployment.backendIdentity &&
            current.receipt.providerLockSha256 === hash12(deployment.providerLock) &&
            current.state !== 'absent'
        : current.state === 'absent' && current.savedPlanSha256 === null && current.journalSha256 === null,
      'current main runner saved receipt binding differs',
    );
    for (const [index, receipt] of receipts.entries()) {
      const actual = await step(() => readHistory.call(session, receipt, deadline));
      methods();
      keys5(actual, [
        'schemaVersion',
        'scope',
        'receiptSha256',
        'manifestSha256',
        'incompleteArchives',
        'matches',
        'applicationOutcomeQualified',
        'retirementQualified',
      ]);
      require11(
        actual.schemaVersion === 1 &&
          actual.scope === 'exact-saved-plan-journal-history' &&
          actual.receiptSha256 === canonicalSha256(receipt) &&
          actual.manifestSha256 === manifestSha256 &&
          Number.isSafeInteger(actual.incompleteArchives) &&
          actual.incompleteArchives >= 0 &&
          Array.isArray(actual.matches) &&
          actual.applicationOutcomeQualified === false &&
          actual.retirementQualified === false,
        'original main runner history contract differs',
      );
      const seen = new Set();
      for (const match of actual.matches) {
        keys5(match, [
          'location',
          'archiveSha256',
          'state',
          'journalSha256',
          'savedPlanSha256',
          'configurationSha256',
          'manifestSha256',
        ]);
        const key = `${match.location}:${match.archiveSha256}`;
        require11(
          ['current', 'revision', 'plan-history'].includes(match.location) &&
            ['planned', 'applying', 'applied'].includes(match.state) &&
            sha6(match.archiveSha256) &&
            sha6(match.journalSha256) &&
            match.savedPlanSha256 === receipt.planSha256 &&
            match.configurationSha256 === receipt.configurationSha256 &&
            match.manifestSha256 === manifestOf(receipt.configurationSha256) &&
            !seen.has(key),
          'original main runner journal occurrence differs or duplicates',
        );
        seen.add(key);
      }
      const states = new Set(actual.matches.map((match) => match.state));
      custodyRows[index].submission =
        actual.incompleteArchives > 0
          ? 'partial'
          : states.has('applying') && states.has('applied')
            ? 'ambiguous'
            : states.has('applying')
              ? 'unresolved'
              : states.has('applied')
                ? 'applied'
                : states.has('planned')
                  ? receipt.noChanges
                    ? 'no-change'
                    : 'unsubmitted'
                  : 'missing';
      custodyRows[index].history = structuredClone(actual);
      rechecks.push(async () => {
        methods();
        require11(
          same10(await step(() => readHistory.call(session, receipt, deadline)), actual),
          'original main runner journal changed',
        );
        methods();
      });
    }
    const originalCurrent = structuredClone(current);
    rechecks.push(async () => {
      methods();
      require11(
        (await step(() => readConfiguration.call(session))) === configuration &&
          same10(await step(() => readCurrent.call(session, configuration, deadline)), originalCurrent),
        'current main runner journal changed',
      );
      methods();
    });
  }
  require11(canonicalSha256(await graphRead()) === graphSha256, 'original network graph changed');
  for (const recheck of rechecks) await recheck();
  require11(same10(await inventory(), names), 'main runner inventory changed');
  require11(canonicalSha256(await graphRead()) === graphSha256, 'original network graph changed at final boundary');
  await recheckEmpty();
  seal();
  return {
    schemaVersion: 1,
    scope: 'network-main-runner-original-journal-history',
    planSha256: plan.planSha256,
    graphSha256,
    ...(lineage ? { lineageSha256: canonicalSha256(lineage.lineage) } : {}),
    status,
    rows,
    terminalRows,
    ...(current ? { current } : {}),
    originalPublishedJournalsQualified:
      status === 'inspected' &&
      rows.length > 0 &&
      rows.every((row) => row.submission === 'applied' || row.submission === 'no-change'),
    terminalPublishedJournalsQualified:
      status === 'inspected' &&
      terminalRows.length > 0 &&
      terminalRows.every((row) => row.submission === 'no-change' || row.submission === 'applied'),
    applicationOutcomeQualified: false,
    currentOperationalAcceptanceQualified: false,
    runnerRetirementQualified: false,
    parentRetirementQualified: false,
    retirementQualified: false,
  };
}

// plugins/azure/src/ce/terraform-network-replacement-receipt-provenance.ts
import { createHash as createHash14 } from 'node:crypto';
import { constants as constants4 } from 'node:fs';
import { lstat as lstat11, open as openFile2, readdir as readdir12, realpath as realpath11 } from 'node:fs/promises';
import { join as join12 } from 'node:path';

function require12(value, message) {
  if (!value) throw Error(`Azure Terraform replacement receipt provenance: ${message}`);
}
async function readAzureTerraformNetworkReplacementReceiptProvenance(
  request,
  store,
  loaders,
  siteRequest,
  verifier,
  replacementVerifier,
  signal,
) {
  const plan = structuredClone(request),
    owner = structuredClone(store.owner),
    site = structuredClone(siteRequest),
    directory = store.directory;
  const bindings = [
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'verify', value: store.verify },
    { target: loaders, key: 'loadSource', value: loaders.loadSource },
    { target: loaders, key: 'loadOutcome', value: loaders.loadOutcome },
  ];
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const requestMatches = canonicalSnapshot(plan),
    ownerMatches = canonicalSnapshot(owner),
    siteMatches = canonicalSnapshot(site);
  const seal = () => {
    deadline.throwIfAborted();
    require12(
      requestMatches(request) &&
        ownerMatches(store.owner) &&
        siteMatches(siteRequest) &&
        store.directory === directory &&
        bindings.every(({ target, key, value }) => Reflect.get(target, key) === value),
      'owning context changed',
    );
  };
  const step = async (action) => {
    seal();
    const abort = Promise.withResolvers(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), abort.promise]);
      seal();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  seal();
  verifyAzureCePlan(plan);
  verifyAzureTerraformNetworkReplacementProfile(plan);
  require12(
    canonicalEqual(azureUpgradeBinding(plan).owner, owner) &&
      typeof verifier === 'function' &&
      typeof replacementVerifier === 'function',
    'owned replacement and distinct historical verifiers required',
  );
  await step(() => store.verify());
  const packetSnapshot = async () => {
    seal();
    const before = await step(() => lstat11(directory));
    require12(
      before.isDirectory() &&
        !before.isSymbolicLink() &&
        before.uid === process.getuid?.() &&
        (before.mode & 63) === 0 &&
        (await step(() => realpath11(directory))) === directory,
      'private receipt packet directory ownership differs',
    );
    const names = (await step(() => readdir12(directory))).sort(),
      bytesByName = {},
      fileIdentitiesByName = {};
    for (const name of names.filter((name) => name.endsWith('.json'))) {
      require12(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.json$/.test(name), 'private receipt packet filename differs');
      const path = join12(directory, name),
        handle = await step(() => openFile2(path, constants4.O_RDONLY | constants4.O_NOFOLLOW));
      try {
        const stat = await step(() => handle.stat());
        require12(
          stat.isFile() && stat.uid === process.getuid?.() && stat.nlink === 1 && (stat.mode & 63) === 0,
          'private receipt packet file ownership differs',
        );
        const bytes = await step(() => handle.readFile()),
          after = await step(() => handle.stat()),
          named = await step(() => lstat11(path));
        require12(
          after.dev === stat.dev &&
            after.ino === stat.ino &&
            after.size === stat.size &&
            after.mtimeMs === stat.mtimeMs &&
            after.ctimeMs === stat.ctimeMs &&
            named.isFile() &&
            !named.isSymbolicLink() &&
            named.dev === stat.dev &&
            named.ino === stat.ino &&
            named.uid === stat.uid &&
            named.nlink === 1 &&
            (named.mode & 63) === 0,
          'private receipt packet changed during native read',
        );
        bytesByName[name] = createHash14('sha256').update(bytes).digest('hex');
        fileIdentitiesByName[name] = `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
      } finally {
        await handle.close();
      }
    }
    const after = await step(() => lstat11(directory));
    require12(
      after.dev === before.dev &&
        after.ino === before.ino &&
        canonicalEqual((await step(() => readdir12(directory))).sort(), names),
      'private receipt packet namespace changed',
    );
    return { identity: `${before.dev}:${before.ino}:${before.birthtimeMs}`, names, bytesByName, fileIdentitiesByName };
  };
  const originalPackets = await packetSnapshot();
  const readHistory = () =>
    step(() =>
      runAzureTerraformNetworkGenerationHistory(
        plan,
        store,
        loaders,
        verifier,
        readAzureTerraformNetworkCompletionOne,
        undefined,
        deadline,
        replacementVerifier,
      ),
    );
  const generation = await readHistory(),
    history = generation.completion;
  require12(
    history?.kind === 'azure-terraform-network-replacement-completion-history' &&
      history.sourcePlanSha256 === plan.planSha256 &&
      canonicalEqual(history.owner, owner) &&
      canonicalEqual(history.site, site),
    'complete owning replacement generation and site required',
  );
  const context = await step(() =>
    openAzureTerraformNetworkReplacementCompletionArtifacts(
      plan,
      store,
      {
        loaders,
        site,
        journalSha256: history.journalSha256,
        sourceBindingSha256: history.sourceBindingSha256,
        qualifyHistorical: verifier,
        qualifyCompletedOperational: replacementVerifier,
      },
      deadline,
    ),
  );
  const name = azureTerraformNetworkReplacementCompletionName(plan);
  const raw = await step(() => context.read(name));
  require12(
    canonicalSha256(raw) === history.completionSha256,
    'immutable receipt publication differs from authenticated outcome',
  );
  const packet = validateAzureTerraformNetworkReplacementCompletion(context, raw);
  await step(() => context.qualify(packet.operational, 'historical'));
  const outcome = structuredClone(await step(() => loaders.loadOutcome(plan)));
  require12(
    outcome.networkReplacementCompletionSha256 === history.completionSha256,
    'owning completion outcome changed',
  );
  const refresh = await step(() =>
    readAzureTerraformReplacementRefreshInventory(
      context,
      store,
      packet,
      outcome.networkReplacementRefreshInventorySha256,
    ),
  );
  const receipts = [
    {
      stage: 'quiesce',
      publicationName: `${plan.planId}-terraform-quiesce-plan.json`,
      publicationSha256: packet.stageRecordSha256.quiesce,
      receipt: structuredClone(context.stageRecords.quiesce.receipt),
    },
    {
      stage: 'launch',
      publicationName: `${plan.planId}-terraform-launch-plan.json`,
      publicationSha256: packet.stageRecordSha256.launch,
      receipt: structuredClone(context.stageRecords.launch.receipt),
    },
    {
      stage: 'immutable-final',
      publicationName: name,
      publicationSha256: history.completionSha256,
      receipt: structuredClone(packet.finalReceipt),
    },
    ...(refresh?.record.receipts.map((row) => ({
      stage: 'refreshed-final',
      publicationName: refresh.name,
      publicationSha256: refresh.publicationSha256,
      receipt: structuredClone(row.receipt),
    })) ?? []),
  ].map((row) => ({
    ...row,
    receiptSha256: canonicalSha256(row.receipt),
    configurationSha256: row.receipt.configurationSha256,
  }));
  await step(() => context.finish());
  const fresh = await readHistory();
  require12(canonicalEqual(fresh, generation), 'owning generation changed across receipt collection');
  await step(() => context.finish());
  require12(
    canonicalSha256(await step(() => context.read(name))) === history.completionSha256,
    'immutable receipt publication changed at final boundary',
  );
  require12(
    canonicalEqual(await packetSnapshot(), originalPackets),
    'native receipt packet changed across provenance callbacks',
  );
  require12(canonicalEqual(await step(() => loaders.loadOutcome(plan)), outcome), 'owning refresh outcome changed');
  seal();
  return {
    schemaVersion: 1,
    scope: 'authenticated-completed-replacement-original-receipt-provenance',
    engine: 'terraform',
    owner,
    site,
    planSha256: plan.planSha256,
    originalPlanSha256: history.originalPlanSha256,
    retainedPlanSha256: history.retainedPlanSha256,
    completionSha256: history.completionSha256,
    checkpointSha256: history.checkpointSha256,
    journalSha256: history.journalSha256,
    sourceBindingSha256: history.sourceBindingSha256,
    finalConfigurationSha256: history.finalConfigurationSha256,
    providerLockSha256: history.providerLockSha256,
    receipts,
    nativeSavedJournalsQualified: false,
    refreshedFinalReceiptsQualified: true,
    refreshInventorySha256: refresh?.publicationSha256,
    interruptedPrefixQualified: false,
    currentOperationalAcceptanceQualified: false,
    parentRetirementQualified: false,
  };
}

// plugins/azure/src/ce/terraform-network-retirement-requests.ts
var same11 = canonicalEqual;
function require13(value, message) {
  if (!value) throw Error(`Azure Terraform network retirement requests: ${message}`);
}
async function readAzureTerraformNetworkRetirementRequests(originalRequest, session, signal) {
  signal?.throwIfAborted();
  const original = structuredClone(originalRequest);
  verifyAzureCePlan(original);
  require13(
    original.engine === 'terraform' &&
      original.intent.operation === 'deploy' &&
      !original.terraformNetworkProfile &&
      !original.terraformNetworkReplacementProfile &&
      !original.relayProfile,
    'exact original Terraform deploy required',
  );
  const binding = azureUpgradeBinding(original);
  const inventory = await readAzureCePlanInventory(session, signal);
  const plans = new Map(inventory.plans.map(({ plan }) => [plan.planSha256, plan]));
  require13(
    same11(plans.get(original.planSha256) ?? null, original),
    'original deploy missing or changed in public plan inventory',
  );
  const selected = inventory.plans
    .map(({ plan }) => plan)
    .filter((plan) => {
      const profile = plan.terraformNetworkProfile ?? plan.terraformNetworkReplacementProfile;
      const ownerMatches = same11(azureUpgradeBinding(plan).owner, binding.owner);
      if (profile?.originalPlanSha256 === original.planSha256 || (ownerMatches && profile)) {
        require13(
          profile?.originalPlanSha256 === original.planSha256 && same11(azureUpgradeBinding(plan), binding),
          'network request original lineage or owner differs',
        );
        return true;
      }
      require13(
        !(ownerMatches && plan.engine === 'terraform' && plan.intent.operation === 'update-network'),
        'network execution identifiers unresolved',
      );
      return false;
    });
  const profileOf = (plan) =>
    plan.terraformNetworkProfile
      ? verifyAzureTerraformNetworkProfile(plan)
      : verifyAzureTerraformNetworkReplacementProfile(plan);
  const ancestry = (plan, seen = new Set()) => {
    require13(!seen.has(plan.planSha256), 'cyclic network ancestry');
    seen.add(plan.planSha256);
    const profile = profileOf(plan),
      retained = plans.get(profile.retainedPlanSha256);
    require13(
      retained &&
        same11(azureUpgradeBinding(retained), binding) &&
        same11(azureTerraformNetworkScope(plan, true), azureTerraformNetworkScope(original, true)) &&
        same11(azureTerraformNetworkScope(retained, true), azureTerraformNetworkScope(original, true)),
      'exact retained predecessor or original provider scope unavailable',
    );
    if (plan.terraformNetworkReplacementProfile)
      require13(
        same11(azureTerraformNetworkScope(plan, false), azureTerraformNetworkScope(retained, false)),
        'replacement retained subnet scope differs',
      );
    if (retained.planSha256 === original.planSha256) {
      require13(!plan.terraformNetworkReplacementProfile, 'network-bound replacement requires preceding generation');
      return [original.planSha256];
    }
    if (retained.terraformNetworkProfile || retained.terraformNetworkReplacementProfile) {
      require13(profileOf(retained).originalPlanSha256 === original.planSha256, 'retained original differs');
      return [...ancestry(retained, seen), retained.planSha256];
    }
    require13(
      !plan.terraformNetworkReplacementProfile &&
        retained.engine === 'terraform' &&
        retained.intent.operation === 'replace-node' &&
        Number.isInteger(retained.intent.replacementNode) &&
        Number(retained.intent.replacementNode) >= 1 &&
        Number(retained.intent.replacementNode) <= original.topology.nodeCount &&
        !retained.networkProfile &&
        !retained.networkReplacementProfile &&
        !retained.relayProfile &&
        same11(azureTerraformNetworkScope(retained, false), azureTerraformNetworkScope(original, false)),
      'initial replacement predecessor is unresolved',
    );
    return [original.planSha256, retained.planSha256];
  };
  const requests = selected.map((plan) => ({
    kind: plan.terraformNetworkProfile ? 'network-update' : 'node-replacement',
    planId: plan.planId,
    planSha256: plan.planSha256,
    retainedPlanSha256: profileOf(plan).retainedPlanSha256,
    ancestry: ancestry(plan),
    execution: 'unclassified',
  }));
  const recheck = async () => {
    signal?.throwIfAborted();
    require13(same11(originalRequest, original), 'original request changed');
    await inventory.recheck();
    require13(same11(originalRequest, original), 'original request changed');
  };
  await recheck();
  return {
    schemaVersion: 1,
    originalPlanSha256: original.planSha256,
    owner: structuredClone(binding.owner),
    requests,
    publicPlanInventorySha256: inventory.sourceSha256,
    requestInventorySha256: canonicalSha256({
      originalPlanSha256: original.planSha256,
      publicPlanInventorySha256: inventory.sourceSha256,
      requests,
    }),
    executionHistoryQualified: false,
    parentRetirementQualified: false,
    recheck,
  };
}

// plugins/azure/src/ce/terraform-original-receipt-provenance.ts
import { createHash as createHash15 } from 'node:crypto';
import { constants as constants5 } from 'node:fs';
import { lstat as lstat12, open as open3, readdir as readdir13, realpath as realpath12 } from 'node:fs/promises';
import { join as join13 } from 'node:path';

var same12 = canonicalEqual;
function require14(value, message) {
  if (!value) throw Error(`Azure Terraform original receipt provenance: ${message}`);
}
async function readAzureTerraformOriginalReceiptProvenance(request, store, loaders, signal) {
  const plan = structuredClone(request),
    owner = structuredClone(store.owner),
    directory = store.directory,
    deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]),
    bindings = [
      { target: store, key: 'read', value: store.read },
      { target: store, key: 'verify', value: store.verify },
      { target: loaders, key: 'loadSource', value: loaders.loadSource },
      { target: loaders, key: 'loadOutcome', value: loaders.loadOutcome },
    ];
  const requestMatches = canonicalSnapshot(plan),
    ownerMatches = canonicalSnapshot(owner);
  const seal = () => {
    deadline.throwIfAborted();
    require14(
      requestMatches(request) &&
        ownerMatches(store.owner) &&
        store.directory === directory &&
        bindings.every((row) => Reflect.get(row.target, row.key) === row.value),
      'owning request or dependency changed',
    );
  };
  const step = async (action) => {
    seal();
    let aborted = () => {};
    const failure = new Promise((_, reject) => {
      aborted = () => reject(deadline.reason);
      deadline.addEventListener('abort', aborted, { once: true });
    });
    try {
      const result = await Promise.race([Promise.resolve().then(action), failure]);
      seal();
      return result;
    } finally {
      deadline.removeEventListener('abort', aborted);
    }
  };
  verifyAzureCePlan(plan);
  require14(
    plan.engine === 'terraform' && plan.intent.operation === 'deploy' && same12(owner, azureUpgradeBinding(plan).owner),
    'exact original deployment owner required',
  );
  await step(() => store.verify());
  const snapshot = async () => {
    const dirs = {},
      files = {},
      contents = new Map(),
      fragments = [];
    const audit = join13(directory, 'terraform-original-deployment-publication-fragments'),
      auditStat = await step(() =>
        lstat12(audit).catch((error) => {
          if (error.code === 'ENOENT') return;
          throw error;
        }),
      );
    for (const path of [
      directory,
      join13(directory, 'terraform-original-deployment-receipts'),
      ...(auditStat ? [audit] : []),
    ]) {
      const before = await step(() => lstat12(path));
      require14(
        before.isDirectory() &&
          !before.isSymbolicLink() &&
          before.uid === process.getuid?.() &&
          (before.mode & 63) === 0 &&
          (await step(() => realpath12(path))) === path,
        'private original packet directory differs',
      );
      const names = (await step(() => readdir13(path))).sort();
      dirs[path] = { identity: `${before.dev}:${before.ino}:${before.birthtimeMs}`, names };
      for (const name of names.filter((name) => (path === directory ? name.endsWith('.json') : true))) {
        require14(
          path === audit
            ? /^[a-f0-9]{64}-[a-f0-9-]{36}\.pending\.[a-f0-9]{64}\.fragment$/.test(name)
            : /^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.json$/.test(name),
          'original packet namespace contains unresolved evidence',
        );
        const selected = join13(path, name),
          handle = await step(() => open3(selected, constants5.O_RDONLY | constants5.O_NOFOLLOW));
        try {
          const stat = await step(() => handle.stat());
          require14(
            stat.isFile() && stat.uid === process.getuid?.() && stat.nlink === 1 && (stat.mode & 63) === 0,
            'original packet file ownership differs',
          );
          const bytes = await step(() => handle.readFile()),
            after = await step(() => handle.stat()),
            named = await step(() => lstat12(selected));
          require14(
            after.dev === stat.dev &&
              after.ino === stat.ino &&
              after.size === stat.size &&
              after.mtimeMs === stat.mtimeMs &&
              after.ctimeMs === stat.ctimeMs &&
              named.isFile() &&
              !named.isSymbolicLink() &&
              named.dev === stat.dev &&
              named.ino === stat.ino &&
              named.nlink === 1 &&
              named.uid === stat.uid &&
              (named.mode & 63) === 0,
            'original packet bytes changed during native read',
          );
          contents.set(selected, bytes);
          files[selected] = {
            identity: `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`,
            sha256: createHash15('sha256').update(bytes).digest('hex'),
          };
        } finally {
          await handle.close();
        }
      }
      const after = await step(() => lstat12(path));
      require14(
        after.dev === before.dev &&
          after.ino === before.ino &&
          same12(names, (await step(() => readdir13(path))).sort()),
        'original packet namespace changed',
      );
    }
    for (const name of dirs[audit]?.names ?? []) {
      const bytes = contents.get(join13(audit, name)),
        publicationSha256 = name.slice(0, 64),
        published = contents.get(
          join13(directory, 'terraform-original-deployment-receipts', `${publicationSha256}.json`),
        ),
        fragmentSha256 = name.slice(-73, -9);
      require14(
        bytes &&
          published &&
          createHash15('sha256').update(bytes).digest('hex') === fragmentSha256 &&
          bytes.length < published.length &&
          published.subarray(0, bytes.length).equals(bytes),
        'preserved original fragment digest or publication prefix differs',
      );
      fragments.push({ name, publicationSha256, fragmentSha256, fragmentBytes: bytes.length });
    }
    return { dirs, files, fragments };
  };
  const packets = await snapshot(),
    source = await step(() => loaders.loadSource(plan.planSha256));
  verifyAzureCePlan(source);
  require14(same12(source, plan), 'owning original public source differs');
  const outcome = structuredClone(await step(() => loaders.loadOutcome(plan)));
  require14(
    outcome.planId === plan.planId &&
      outcome.planSha256 === plan.planSha256 &&
      outcome.engine === 'terraform' &&
      (outcome.status === 'registered' || outcome.status === 'accepted') &&
      typeof outcome.originalReceiptInventorySha256 === 'string' &&
      /^[a-f0-9]{64}$/.test(outcome.originalReceiptInventorySha256),
    'completed owning original public outcome and receipt inventory binding required',
  );
  const checkpoint = structuredClone(await step(() => store.read('terraform-workflow.json')));
  require14(
    checkpoint.schemaVersion === 1 &&
      checkpoint.engine === 'terraform' &&
      checkpoint.planSha256 === plan.planSha256 &&
      checkpoint.stage === 'registered' &&
      same12(checkpoint.originalReceiptInventorySha256, outcome.originalReceiptInventorySha256) &&
      checkpoint.bootstrapByNode &&
      typeof checkpoint.bootstrapByNode === 'object' &&
      !Array.isArray(checkpoint.bootstrapByNode),
    'owning original checkpoint differs from completed public outcome',
  );
  const inventory = await step(() =>
    readAzureTerraformOriginalReceiptInventory(plan, checkpoint.bootstrapByNode, store, deadline),
  );
  require14(
    inventory.status === 'complete' && canonicalSha256(inventory) === outcome.originalReceiptInventorySha256,
    'original receipt inventory differs from authenticated public outcome',
  );
  const records = inventory.records.map((row) => row.record);
  require14(
    records.some(
      (record) => record.stage.kind === 'foundation' && Object.keys(record.bootstrapSha256ByNode).length === 0,
    ) &&
      Array.from({ length: plan.topology.nodeCount }, (_, index) => index + 1).every((node) =>
        records.some((record) => record.stage.kind === 'node-admission' && record.stage.node === node),
      ) &&
      (plan.intent.ingress?.mode !== 'platform-http' ||
        records.some((record) => record.stage.kind === 'ingress-final')),
    'original receipt stage inventory is incomplete',
  );
  require14(
    same12(await step(() => loaders.loadSource(plan.planSha256)), source) &&
      same12(await step(() => loaders.loadOutcome(plan)), outcome),
    'owning original public source or outcome changed',
  );
  require14(
    same12(await step(() => store.read('terraform-workflow.json')), checkpoint),
    'owning original checkpoint changed',
  );
  require14(
    same12(
      await step(() => readAzureTerraformOriginalReceiptInventory(plan, checkpoint.bootstrapByNode, store, deadline)),
      inventory,
    ),
    'original receipt descriptors changed',
  );
  require14(same12(await snapshot(), packets), 'original packet bytes or namespace changed across callbacks');
  seal();
  return {
    schemaVersion: 1,
    scope: 'owning-original-deployment-receipt-provenance',
    originalPlanSha256: plan.planSha256,
    ownerSha256: canonicalSha256(owner),
    outcomeSha256: canonicalSha256(outcome),
    checkpointSha256: canonicalSha256(checkpoint),
    receiptInventorySha256: canonicalSha256(inventory),
    receipts: inventory.records,
    publicationFragments: packets.fragments,
    owningPublicOutcomeAuthenticated: true,
    nativeJournalsQualified: false,
    siteIdentityQualified: false,
    operationalAcceptanceQualified: false,
  };
}

// plugins/azure/src/ce/terraform-network-retirement-lineage.ts
var same13 = (a, b) => canonicalEqual({ value: a }, { value: b });
function require15(value, message) {
  if (!value) throw Error(`Azure Terraform network retirement lineage: ${message}`);
}
var witnesses2 = new WeakMap();
async function recheckAzureTerraformNetworkRetirementLineage(
  witness,
  request,
  store,
  loaders,
  site,
  verifier,
  signal,
  replacementVerifier,
) {
  signal?.throwIfAborted();
  const bound = witness && typeof witness === 'object' ? witnesses2.get(witness) : undefined;
  require15(bound, 'owning authenticated lineage witness required');
  const context = () =>
    require15(
      bound.store === store &&
        bound.loaders === loaders &&
        bound.verifier === verifier &&
        bound.replacementVerifier === replacementVerifier &&
        bound.siteSha256 === canonicalSha256(site) &&
        bound.staged.has(request.planSha256) &&
        canonicalSha256(witness) === bound.resultSha256,
      'owning authenticated lineage context required',
    );
  context();
  const result = await bound.recheck(signal);
  const graph = await recheckAzureTerraformNetworkRetirementGraph(
    bound.staged.get(request.planSha256),
    request,
    store,
    loaders,
    site,
    verifier,
    signal,
    replacementVerifier,
  );
  context();
  require15(canonicalSha256(result) === bound.resultSha256, 'authenticated lineage changed');
  return { lineage: structuredClone(result), graph: structuredClone(graph) };
}
async function readAzureTerraformNetworkRetirementLineage(
  originalRequest,
  publicSession,
  store,
  loaders,
  siteRequest,
  verifier,
  signal,
  replacementVerifier,
) {
  const original = structuredClone(originalRequest),
    site = structuredClone(siteRequest),
    owner = structuredClone(store.owner),
    directory = store.directory;
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const bindings = [
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'verify', value: store.verify },
    { target: loaders, key: 'loadSource', value: loaders.loadSource },
    { target: loaders, key: 'loadOutcome', value: loaders.loadOutcome },
    { target: publicSession, key: 'getSessionId', value: publicSession.getSessionId },
    { target: publicSession, key: 'getArtifactsDir', value: publicSession.getArtifactsDir },
    { target: publicSession, key: 'getArtifactPath', value: publicSession.getArtifactPath },
    { target: publicSession, key: 'saveArtifact', value: publicSession.saveArtifact },
  ];
  const seal = () => {
    deadline.throwIfAborted();
    require15(
      same13(originalRequest, original) &&
        same13(siteRequest, site) &&
        same13(store.owner, owner) &&
        store.directory === directory &&
        bindings.every(({ target, key, value }) => Reflect.get(target, key) === value),
      'request or owning dependencies changed',
    );
  };
  const step = async (action, parentSignal) => {
    seal();
    const active = AbortSignal.any([deadline, ...(parentSignal ? [parentSignal] : [])]);
    active.throwIfAborted();
    const aborted = Promise.withResolvers(),
      onAbort = () => aborted.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), aborted.promise]);
      active.throwIfAborted();
      seal();
      return result;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  seal();
  verifyAzureCePlan(original);
  require15(
    original.engine === 'terraform' &&
      original.intent.operation === 'deploy' &&
      same13(azureUpgradeBinding(original).owner, owner),
    'original deployment ownership differs',
  );
  await step(() => store.verify());
  const inventory = await step(() => readAzureTerraformNetworkRetirementRequests(original, publicSession, deadline));
  const sources = new Map(),
    graphs = new Map(),
    replacements = new Map(),
    outcomes = new Map(),
    rows = [];
  const exactSource = async (digest) => {
    const source = await step(() => loaders.loadSource(digest));
    verifyAzureCePlan(source);
    require15(
      source.planSha256 === digest && same13(azureUpgradeBinding(source).owner, owner),
      'exact source identity differs',
    );
    sources.set(digest, structuredClone(source));
    return source;
  };
  require15(same13(await exactSource(original.planSha256), original), 'exact original deploy source differs');
  const directorySnapshot = async (path, absentAllowed = false) => {
    try {
      const stat = await step(() => lstat13(path));
      require15(
        stat.isDirectory() &&
          !stat.isSymbolicLink() &&
          stat.uid === process.getuid?.() &&
          (stat.mode & 63) === 0 &&
          (await step(() => realpath13(path))) === path,
        'private directory ownership differs',
      );
      return {
        identity: `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`,
        names: (await step(() => readdir14(path))).sort(),
      };
    } catch (error) {
      if (absentAllowed && error.code === 'ENOENT') return null;
      throw error;
    }
  };
  const root = await directorySnapshot(directory),
    children = await directorySnapshot(join14(directory, 'terraform-stages'), true);
  const configurations = new Set();
  for (const row of inventory.requests) {
    const plan = await exactSource(row.planSha256);
    require15(
      plan.planId === row.planId &&
        (plan.terraformNetworkProfile ?? plan.terraformNetworkReplacementProfile)?.retainedPlanSha256 ===
          row.retainedPlanSha256,
      'public request differs from owning source',
    );
    if (row.kind === 'node-replacement') {
      let outcome,
        absent = false;
      try {
        outcome = await step(() => loaders.loadOutcome(plan));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        absent = true;
      }
      require15(
        absent || (outcome && typeof outcome === 'object' && !Array.isArray(outcome)),
        'complete replacement outcome object or explicit absence required',
      );
      outcomes.set(plan.planSha256, { absent, outcome: structuredClone(outcome) });
      if (!absent && outcome.status === 'complete' && replacementVerifier) {
        const provenance = await step(() =>
          readAzureTerraformNetworkReplacementReceiptProvenance(
            plan,
            store,
            loaders,
            site,
            verifier,
            replacementVerifier,
            deadline,
          ),
        );
        require15(
          provenance.originalPlanSha256 === original.planSha256 &&
            provenance.retainedPlanSha256 === row.retainedPlanSha256,
          'replacement public/source/original receipt provenance differs',
        );
        replacements.set(plan.planSha256, structuredClone(provenance));
        for (const receipt of provenance.receipts) configurations.add(receipt.configurationSha256);
        rows.push({
          planSha256: row.planSha256,
          kind: row.kind,
          execution: 'completed-replacement',
          replacementProvenanceSha256: canonicalSha256(provenance),
        });
      } else {
        const hasPackets = root?.names.some((name) => name.startsWith(`${row.planId}-`)) ?? true,
          hasChildren = children?.names.some((name) => name.includes(row.planSha256.slice(0, 24)));
        rows.push({
          planSha256: row.planSha256,
          kind: row.kind,
          execution: absent && !hasPackets && !hasChildren ? 'unstaged-no-outcome' : 'unqualified-replacement',
        });
      }
      continue;
    }
    const prefix = `${row.planId}-terraform-network`,
      names = root?.names.filter((name) => name.startsWith(prefix)) ?? [];
    if (!names.includes(`${prefix}-source.json`)) {
      require15(
        names.length === 0 &&
          !children?.names.some((name) => name.startsWith(`network-${row.planSha256.slice(0, 24)}-`)),
        'unstaged request has execution packets or children',
      );
      let outcome,
        absent = false;
      try {
        outcome = await step(() => loaders.loadOutcome(plan));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        absent = true;
      }
      require15(
        absent || (outcome && typeof outcome === 'object' && !Array.isArray(outcome)),
        'complete outcome object or explicit absence required',
      );
      outcomes.set(plan.planSha256, { absent, outcome: structuredClone(outcome) });
      rows.push({
        planSha256: row.planSha256,
        kind: row.kind,
        execution: absent ? 'unstaged-no-outcome' : 'unstaged-outcome-present',
      });
      continue;
    }
    const graph = await step(() =>
      readAzureTerraformNetworkRetirementGraph(plan, store, loaders, site, verifier, deadline, replacementVerifier),
    );
    graphs.set(plan.planSha256, graph);
    configurations.add(graph.original.binding.sourceConfigurationSha256);
    for (const node of graph.nodes)
      for (const history of [node.nic, node.routing])
        if (history) {
          for (const receipt of Object.values(history.receipts))
            if (receipt) configurations.add(receipt.configurationSha256);
        }
    for (const [name, digest] of Object.entries(graph.checkpoint.completionSha256ByName)) {
      const packet = await step(() => store.read(name));
      require15(canonicalSha256(packet) === digest, 'terminal graph publication changed');
      const receipt = packet.receipt;
      configurations.add(receipt.configurationSha256);
    }
    rows.push({
      planSha256: row.planSha256,
      kind: row.kind,
      execution: 'staged-network',
      graphSha256: canonicalSha256(graph),
    });
  }
  for (const a of inventory.requests.filter((row) => graphs.has(row.planSha256) || replacements.has(row.planSha256)))
    for (const b of inventory.requests.filter((row) => graphs.has(row.planSha256) || replacements.has(row.planSha256)))
      require15(
        a.planSha256 === b.planSha256 || a.ancestry.includes(b.planSha256) || b.ancestry.includes(a.planSha256),
        'staged public lineage forks',
      );
  const result = {
    schemaVersion: 1,
    scope: 'authenticated-network-shared-main-configuration-lineage',
    originalPlanSha256: original.planSha256,
    owner,
    site,
    rows,
    publicPlanInventorySha256: inventory.publicPlanInventorySha256,
    requestInventorySha256: inventory.requestInventorySha256,
    configurationSha256s: [...configurations].sort(),
    allPublicExecutionGraphsQualified: rows.every(
      (row) => row.execution === 'staged-network' || row.execution === 'completed-replacement',
    ),
    unstagedMainJournalAbsenceQualified: false,
    mainJournalsQualified: false,
    childRetirementQualified: false,
    parentRetirementQualified: false,
    currentOperationalAcceptanceQualified: false,
  };
  const digest = canonicalSha256(result);
  const recheck = async (parentSignal) => {
    seal();
    require15(canonicalSha256(result) === digest, 'authenticated lineage changed');
    await step(() => store.verify(), parentSignal);
    await step(() => inventory.recheck(), parentSignal);
    for (const [sha256, source] of sources)
      require15(
        same13(await step(() => loaders.loadSource(sha256), parentSignal), source),
        'source changed across lineage',
      );
    for (const [sha256, graph] of graphs)
      await step(
        () =>
          recheckAzureTerraformNetworkRetirementGraph(
            graph,
            sources.get(sha256),
            store,
            loaders,
            site,
            verifier,
            deadline,
            replacementVerifier,
          ),
        parentSignal,
      );
    for (const [sha256, expected] of replacements) {
      require15(replacementVerifier, 'owning replacement historical verifier unavailable');
      const actual = await step(
        () =>
          readAzureTerraformNetworkReplacementReceiptProvenance(
            sources.get(sha256),
            store,
            loaders,
            site,
            verifier,
            replacementVerifier,
            deadline,
          ),
        parentSignal,
      );
      require15(same13(actual, expected), 'replacement receipt provenance changed across lineage');
    }
    for (const [sha256, expected] of outcomes) {
      let actual,
        absent = false;
      try {
        actual = await step(() => loaders.loadOutcome(sources.get(sha256)), parentSignal);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        absent = true;
      }
      require15(same13({ absent, outcome: actual }, expected), 'unstaged outcome changed');
    }
    require15(
      same13(await directorySnapshot(directory), root) &&
        same13(await directorySnapshot(join14(directory, 'terraform-stages'), true), children),
      'execution directory changed across lineage',
    );
    await step(() => inventory.recheck(), parentSignal);
    seal();
    require15(canonicalSha256(result) === digest, 'authenticated lineage changed');
    return result;
  };
  await recheck();
  witnesses2.set(result, {
    store,
    loaders,
    verifier,
    replacementVerifier,
    siteSha256: canonicalSha256(site),
    staged: graphs,
    replacements,
    resultSha256: digest,
    assertContext() {
      seal();
      require15(canonicalSha256(result) === digest, 'authenticated lineage changed');
    },
    recheck,
  });
  return result;
}
async function readAzureTerraformNetworkAllOriginalCustody(
  original,
  publicSession,
  store,
  terraform,
  loaders,
  site,
  verifier,
  signal,
  replacementVerifier,
  emptyMainAdmission,
) {
  const active = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const recheckEmpty = async () => {
    if (!emptyMainAdmission) return;
    require15(
      emptyMainAdmission.context.terraform === terraform && same13(emptyMainAdmission.context.site, site),
      'terminal collection owner context differs',
    );
    await recheckAzureTerraformNetworkEmptyMainBinding(
      emptyMainAdmission.witness,
      original.planSha256,
      store,
      emptyMainAdmission.context,
      active,
    );
  };
  await recheckEmpty();
  const open = terraform.open;
  const root = await readAzureTerraformNetworkRetirementLineage(
    original,
    publicSession,
    store,
    loaders,
    site,
    verifier,
    active,
    replacementVerifier,
  );
  const context = witnesses2.get(root);
  require15(context, 'owning collection context missing');
  let live = true;
  const child = structuredClone(root),
    childSha256 = canonicalSha256(child);
  const boundary = () => {
    active.throwIfAborted();
    require15(live, 'collection scope expired');
    require15(terraform.open === open, 'collection owning runner dependency changed');
    context.assertContext();
    require15(canonicalSha256(child) === childSha256, 'collection witness changed');
  };
  const step = async (action) => {
    boundary();
    const aborted = Promise.withResolvers(),
      onAbort = () => aborted.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), aborted.promise]);
      boundary();
      return result;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  witnesses2.set(child, {
    ...context,
    resultSha256: childSha256,
    assertContext: boundary,
    recheck: async () => {
      boundary();
      return structuredClone(root);
    },
  });
  try {
    const files = new Map(),
      directories = new Map();
    const file = async (path) =>
      step(async () => {
        let digest = null;
        const handle = await openFile3(path, constants6.O_RDONLY | constants6.O_NOFOLLOW).catch((error) => {
          if (error.code === 'ENOENT') return;
          throw error;
        });
        if (!handle) {
          require15(!files.has(path) || files.get(path) === null, 'native journal bytes changed across collection');
          files.set(path, null);
          return;
        }
        try {
          const before = await handle.stat();
          require15(
            before.isFile() && before.uid === process.getuid?.() && before.nlink === 1 && (before.mode & 63) === 0,
            'native journal file ownership differs',
          );
          const bytes = await handle.readFile(),
            after = await handle.stat(),
            named = await lstat13(path);
          require15(
            after.dev === before.dev &&
              after.ino === before.ino &&
              after.size === before.size &&
              after.mtimeMs === before.mtimeMs &&
              after.ctimeMs === before.ctimeMs &&
              named.isFile() &&
              !named.isSymbolicLink() &&
              named.dev === before.dev &&
              named.ino === before.ino &&
              named.uid === before.uid &&
              named.nlink === 1 &&
              (named.mode & 63) === 0,
            'native journal changed during read',
          );
          digest = createHash16('sha256').update(bytes).digest('hex');
        } finally {
          await handle.close();
        }
        require15(!files.has(path) || files.get(path) === digest, 'native journal bytes changed across collection');
        files.set(path, digest);
      });
    const directory = async (path) =>
      step(async () => {
        let snapshot = null;
        const stat = await lstat13(path).catch((error) => {
          if (error.code === 'ENOENT') return;
          throw error;
        });
        if (!stat) {
          require15(
            !directories.has(path) || directories.get(path) === null,
            'native journal namespace changed across collection',
          );
          directories.set(path, null);
          return [];
        }
        require15(
          stat.isDirectory() &&
            !stat.isSymbolicLink() &&
            stat.uid === process.getuid?.() &&
            (stat.mode & 63) === 0 &&
            (await realpath13(path)) === path,
          'native journal directory ownership differs',
        );
        snapshot = { identity: `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`, names: (await readdir14(path)).sort() };
        require15(
          !directories.has(path) || same13(directories.get(path), snapshot),
          'native journal namespace changed across collection',
        );
        directories.set(path, snapshot);
        return snapshot?.names ?? [];
      });
    const owningNames = await directory(store.directory);
    for (const name of owningNames.filter((name) => name.endsWith('.json'))) {
      require15(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.json$/.test(name), 'owning packet filename differs');
      await file(join14(store.directory, name));
    }
    const originalReceiptDirectory = join14(store.directory, 'terraform-original-deployment-receipts');
    const originalReceiptNames = await directory(originalReceiptDirectory);
    for (const name of originalReceiptNames) {
      require15(/^[a-f0-9]{64}\.json$/.test(name), 'original receipt publication is incomplete or malformed');
      await file(join14(originalReceiptDirectory, name));
    }
    const originalFragmentDirectory = join14(store.directory, 'terraform-original-deployment-publication-fragments');
    for (const name of await directory(originalFragmentDirectory)) {
      require15(
        /^[a-f0-9]{64}-[a-f0-9-]{36}\.pending\.[a-f0-9]{64}\.fragment$/.test(name),
        'original publication fragment namespace differs',
      );
      await file(join14(originalFragmentDirectory, name));
    }
    const originalMain = await step(() => azureTerraformCurrentDeployment(original));
    require15(
      !originalMain.stage &&
        originalMain.deploymentId === store.owner.deploymentId &&
        originalMain.scope.account === store.owner.account &&
        originalMain.scope.region === store.owner.region &&
        originalMain.scope.cloud === store.owner.provider,
      'shared main deployment ownership differs',
    );
    const mainDirectory = join14(store.directory, originalMain.deploymentId);
    const runnerDirectories = new Set([mainDirectory]);
    for (const row of root.rows.filter((row) => row.execution === 'staged-network')) {
      const plan = structuredClone(await step(() => loaders.loadSource(row.planSha256)));
      verifyAzureCePlan(plan);
      require15(
        plan.planSha256 === row.planSha256 && same13(azureUpgradeBinding(plan).owner, store.owner),
        'native snapshot source identity differs',
      );
      const main = await step(() => azureTerraformCurrentDeployment(plan));
      runnerDirectories.add(join14(store.directory, main.deploymentId));
      const graph = context.staged.get(row.planSha256);
      require15(graph, 'owning staged graph missing');
      for (const power of graph.powerDeployments) {
        require15(power.stage, 'owning power stage missing');
        runnerDirectories.add(join14(store.directory, 'terraform-stages', power.stage, power.deploymentId));
      }
    }
    for (const path of runnerDirectories) {
      const names = await directory(path);
      for (const name of [
        'deployment.json',
        'main.tf.json',
        '.terraform.lock.hcl',
        'deployment.tfrc',
        'saved.tfplan',
        'plan-receipt.json',
        'artifact-retirement.json',
        'configuration-transition.json',
      ])
        await file(join14(path, name));
      for (const archive of ['revisions', 'plan-history']) {
        const root = join14(path, archive);
        const entries = await directory(root);
        for (const name of entries) {
          require15(
            (archive === 'revisions' ? /^[a-f0-9-]{36}$/ : /^[a-f0-9]{64}$/).test(name),
            'native journal archive identity differs',
          );
          const child = join14(root, name);
          for (const entry of await directory(child)) {
            require15(
              [
                'main.tf.json',
                'deployment.json',
                'saved.tfplan',
                'plan-receipt.json',
                '.terraform.lock.hcl',
                'deployment.tfrc',
                'inventory.json',
              ].includes(entry),
              'native journal archive file differs',
            );
            await file(join14(child, entry));
          }
        }
      }
      require15(same13(names, await directory(path)), 'native journal namespace changed during snapshot');
    }
    if (emptyMainAdmission) {
      const cancellationName = `configuration-cancellation-${canonicalSha256({
        receipt: emptyMainAdmission.context.terminalCleanup.destroy,
        expectedSha256: emptyMainAdmission.witness.retainedDestroyConfigurationSha256,
        nextSha256: emptyMainAdmission.witness.configurationSha256,
      })}.json`;
      require15(
        createHash16('sha256').update(cancellationName).digest('hex') ===
          emptyMainAdmission.witness.cancellationRecordNameSha256,
        'native cancellation record name differs',
      );
      await file(join14(mainDirectory, cancellationName));
    }
    let native;
    let recheckNative;
    const mainNames = await directory(mainDirectory);
    if (directories.get(mainDirectory) !== null && !mainNames.includes('artifact-retirement.json')) {
      require15(
        !mainNames.includes('configuration-transition.json'),
        'pending shared main revision requires owner recovery',
      );
      const session = await step(() => open.call(terraform, store.owner, originalMain, 'current'));
      const { readPlanJournalInventory: read, readConfigurationSha256: readConfiguration } = session;
      require15(read && readConfiguration, 'exhaustive authenticated shared main readers unavailable');
      const methods = () =>
        require15(
          session.readPlanJournalInventory === read && session.readConfigurationSha256 === readConfiguration,
          'shared main inventory dependency changed',
        );
      const configurationSha256 = await step(() => readConfiguration.call(session));
      const { configuration: _source, providerLock, ...identity } = originalMain;
      const manifestOf = (configurationSha256) =>
        canonicalSha256({
          ...identity,
          configurationSha256,
          providerLockSha256: createHash16('sha256').update(providerLock).digest('hex'),
        });
      const validSha = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
      const exact = (value, fields) => {
        require15(
          value &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            same13(Object.keys(value).sort(), fields.toSorted()),
          'shared main inventory schema differs',
        );
      };
      const inspect = async () => {
        methods();
        const value = structuredClone(await step(() => read.call(session, active)));
        methods();
        exact(value, [
          'schemaVersion',
          'scope',
          'status',
          'manifestSha256',
          'entries',
          'entriesSha256',
          'namespaceSha256',
          'unrecognizedRootEntrySha256s',
          'incompleteArchives',
          'applicationOutcomeQualified',
          'retirementQualified',
        ]);
        require15(
          validSha(configurationSha256) &&
            value.schemaVersion === 1 &&
            value.scope === 'all-native-saved-plan-journal-inventory' &&
            ['complete', 'partial'].includes(value.status) &&
            value.manifestSha256 === manifestOf(configurationSha256) &&
            Array.isArray(value.entries) &&
            value.entries.length > 0 &&
            value.entriesSha256 === canonicalSha256(value.entries) &&
            validSha(value.namespaceSha256) &&
            Array.isArray(value.unrecognizedRootEntrySha256s) &&
            value.unrecognizedRootEntrySha256s.every(validSha) &&
            new Set(value.unrecognizedRootEntrySha256s).size === value.unrecognizedRootEntrySha256s.length &&
            Number.isSafeInteger(value.incompleteArchives) &&
            value.incompleteArchives >= 0 &&
            value.applicationOutcomeQualified === false &&
            value.retirementQualified === false,
          'shared main inventory identity differs',
        );
        const seen = new Set();
        let partial = 0,
          current = 0;
        for (const entry of value.entries) {
          exact(entry, [
            'location',
            'archiveRef',
            'archiveSha256',
            'state',
            'receiptSha256',
            'journalSha256',
            'savedPlanSha256',
            'configurationSha256',
            'manifestSha256',
            ...(entry.executionSha256 !== undefined ? ['executionSha256', 'ordinaryRefreshEnabled'] : []),
          ]);
          const key = `${entry.location}:${entry.archiveRef}`;
          require15(
            ['current', 'revision', 'plan-history'].includes(entry.location) &&
              !seen.has(key) &&
              validSha(entry.archiveSha256) &&
              validSha(entry.configurationSha256) &&
              entry.manifestSha256 === manifestOf(entry.configurationSha256) &&
              (entry.location === 'current'
                ? entry.archiveRef === null && entry.configurationSha256 === configurationSha256
                : typeof entry.archiveRef === 'string' &&
                  (entry.location === 'revision' ? /^[a-f0-9-]{36}$/ : /^[a-f0-9]{64}$/).test(entry.archiveRef)) &&
              ['absent', 'unknown', 'planned', 'applying', 'applied'].includes(entry.state),
            'shared main inventory occurrence differs or duplicates',
          );
          seen.add(key);
          if (entry.location === 'current') current++;
          if (entry.state === 'absent' || entry.state === 'unknown') {
            require15(
              entry.receiptSha256 === null &&
                entry.executionSha256 === undefined &&
                (entry.state === 'absent'
                  ? entry.journalSha256 === null && entry.savedPlanSha256 === null
                  : (entry.journalSha256 === null) !== (entry.savedPlanSha256 === null) &&
                    (entry.journalSha256 === null || validSha(entry.journalSha256)) &&
                    (entry.savedPlanSha256 === null || validSha(entry.savedPlanSha256))),
              'shared main partial journal state differs',
            );
            if (entry.state === 'unknown') partial++;
          } else
            require15(
              validSha(entry.receiptSha256) &&
                validSha(entry.journalSha256) &&
                validSha(entry.savedPlanSha256) &&
                (entry.executionSha256 === undefined ||
                  (validSha(entry.executionSha256) && typeof entry.ordinaryRefreshEnabled === 'boolean')),
              'shared main saved receipt identity differs',
            );
        }
        require15(
          current === 1 &&
            value.incompleteArchives === partial &&
            value.status === (partial || value.unrecognizedRootEntrySha256s.length ? 'partial' : 'complete'),
          'shared main inventory completeness differs',
        );
        methods();
        return value;
      };
      native = await inspect();
      const frozen = structuredClone(native);
      recheckNative = async () => {
        methods();
        require15(
          (await step(() => readConfiguration.call(session))) === configurationSha256 &&
            same13(await inspect(), frozen),
          'shared main inventory changed at final boundary',
        );
        methods();
      };
    }
    const rows = [];
    for (const row of root.rows.filter((row) => row.execution === 'staged-network')) {
      const plan = structuredClone(await step(() => loaders.loadSource(row.planSha256)));
      verifyAzureCePlan(plan);
      require15(
        plan.planSha256 === row.planSha256 && same13(azureUpgradeBinding(plan).owner, store.owner),
        'collection source identity differs',
      );
      const main = await step(() =>
        readAzureTerraformNetworkMainRunnerHistory(
          plan,
          store,
          terraform,
          loaders,
          site,
          verifier,
          active,
          replacementVerifier,
          child,
          emptyMainAdmission,
        ),
      );
      const power = await step(() =>
        readAzureTerraformNetworkPowerRunnerHistory(
          plan,
          store,
          terraform,
          loaders,
          site,
          verifier,
          active,
          replacementVerifier,
          context.staged.get(row.planSha256),
        ),
      );
      require15(
        main.lineageSha256 === canonicalSha256(root) && main.graphSha256 === power.graphSha256,
        'collection journal/graph join differs',
      );
      rows.push({ planSha256: row.planSha256, main: structuredClone(main), power: structuredClone(power) });
    }
    const accepted = new Map();
    const configurations = new Set();
    for (const graph of context.staged.values()) configurations.add(graph.original.binding.sourceConfigurationSha256);
    for (const row of rows)
      for (const receipt of [...row.main.rows, ...row.main.terminalRows]) {
        configurations.add(receipt.configurationSha256);
        for (const match of receipt.history?.matches ?? []) {
          const existing = accepted.get(receipt.receiptSha256);
          require15(
            !existing ||
              (existing.configurationSha256 === match.configurationSha256 &&
                existing.savedPlanSha256 === match.savedPlanSha256 &&
                existing.manifestSha256 === match.manifestSha256),
            'shared main receipt provenance conflicts',
          );
          const binding = existing ?? {
            configurationSha256: match.configurationSha256,
            savedPlanSha256: match.savedPlanSha256,
            manifestSha256: match.manifestSha256,
            planSha256s: new Set(),
          };
          binding.planSha256s.add(row.planSha256);
          accepted.set(receipt.receiptSha256, binding);
        }
      }
    const nativeReceiptInventoryComplete =
      native?.status === 'complete' ||
      (!!emptyMainAdmission &&
        native?.status === 'partial' &&
        native.incompleteArchives === 0 &&
        same13(native.unrecognizedRootEntrySha256s, [emptyMainAdmission.witness.cancellationRecordNameSha256]));
    const { configuration: _originalSource, providerLock: originalLock, ...mainIdentity } = originalMain;
    const originalRows = [];
    const originalProof =
      directories.get(originalReceiptDirectory) !== null
        ? await step(() => readAzureTerraformOriginalReceiptProvenance(original, store, loaders, active))
        : undefined;
    if (originalProof) {
      require15(
        originalProof.originalPlanSha256 === original.planSha256 &&
          originalProof.ownerSha256 === canonicalSha256(store.owner),
        'original receipt public/source/owner binding differs',
      );
      for (const record of originalProof.receipts) {
        const receipt = record.record.receipt,
          receiptSha256 = canonicalSha256(receipt),
          manifestSha256 = canonicalSha256({
            ...mainIdentity,
            configurationSha256: receipt.configurationSha256,
            providerLockSha256: createHash16('sha256').update(originalLock).digest('hex'),
          });
        const existing = accepted.get(receiptSha256);
        require15(
          !existing ||
            (existing.configurationSha256 === receipt.configurationSha256 &&
              existing.savedPlanSha256 === receipt.planSha256 &&
              existing.manifestSha256 === manifestSha256),
          'shared main original receipt provenance conflicts',
        );
        const binding = existing ?? {
          configurationSha256: receipt.configurationSha256,
          savedPlanSha256: receipt.planSha256,
          manifestSha256,
          planSha256s: new Set(),
        };
        binding.planSha256s.add(original.planSha256);
        accepted.set(receiptSha256, binding);
        configurations.add(receipt.configurationSha256);
        const matches = native?.entries.filter((entry) => entry.receiptSha256 === receiptSha256) ?? [],
          states = new Set(matches.map((entry) => entry.state));
        const submission = !nativeReceiptInventoryComplete
          ? 'partial'
          : states.has('applying') && states.has('applied')
            ? 'ambiguous'
            : states.has('applying')
              ? 'unresolved'
              : states.has('applied')
                ? 'applied'
                : states.has('planned')
                  ? receipt.noChanges
                    ? 'no-change'
                    : 'unsubmitted'
                  : 'missing';
        originalRows.push({
          stage: record.record.stage,
          publicationName: record.name,
          publicationSha256: record.publicationSha256,
          receiptSha256,
          configurationSha256: receipt.configurationSha256,
          submission,
        });
      }
    }
    const replacementRows = [];
    for (const [planSha256, proof] of context.replacements) {
      const records = proof.receipts.map((record) => {
        const receipt = record.receipt,
          receiptSha256 = canonicalSha256(receipt);
        const manifestSha256 = canonicalSha256({
          ...mainIdentity,
          configurationSha256: receipt.configurationSha256,
          providerLockSha256: createHash16('sha256').update(originalLock).digest('hex'),
        });
        const existing = accepted.get(receiptSha256);
        require15(
          !existing ||
            (existing.configurationSha256 === receipt.configurationSha256 &&
              existing.savedPlanSha256 === receipt.planSha256 &&
              existing.manifestSha256 === manifestSha256),
          'shared main replacement receipt provenance conflicts',
        );
        const binding = existing ?? {
          configurationSha256: receipt.configurationSha256,
          savedPlanSha256: receipt.planSha256,
          manifestSha256,
          planSha256s: new Set(),
        };
        binding.planSha256s.add(planSha256);
        accepted.set(receiptSha256, binding);
        configurations.add(receipt.configurationSha256);
        const matches = native?.entries.filter((entry) => entry.receiptSha256 === receiptSha256) ?? [];
        const states = new Set(matches.map((entry) => entry.state));
        const submission = !nativeReceiptInventoryComplete
          ? 'partial'
          : states.has('applying') && states.has('applied')
            ? 'ambiguous'
            : states.has('applying')
              ? 'unresolved'
              : states.has('applied')
                ? 'applied'
                : states.has('planned')
                  ? receipt.noChanges
                    ? 'no-change'
                    : 'unsubmitted'
                  : 'missing';
        return {
          stage: record.stage,
          publicationName: record.publicationName,
          publicationSha256: record.publicationSha256,
          receiptSha256,
          configurationSha256: receipt.configurationSha256,
          submission,
        };
      });
      replacementRows.push({
        planSha256,
        provenanceSha256: canonicalSha256(proof),
        records,
        originalPublishedJournalsQualified: records.every(
          (row) => row.submission === 'applied' || row.submission === 'no-change',
        ),
      });
    }
    const nativeRows =
      native?.entries.map((entry) => {
        const binding = entry.receiptSha256 ? accepted.get(entry.receiptSha256) : undefined;
        if (binding)
          require15(
            binding.configurationSha256 === entry.configurationSha256 &&
              binding.savedPlanSha256 === entry.savedPlanSha256 &&
              binding.manifestSha256 === entry.manifestSha256,
            'shared main native receipt/provenance join differs',
          );
        return {
          ...entry,
          provenance:
            entry.state === 'unknown'
              ? 'partial'
              : entry.state === 'absent'
                ? configurations.has(entry.configurationSha256)
                  ? 'known-empty-configuration'
                  : 'unaccounted-configuration'
                : binding
                  ? 'authenticated-execution-receipt'
                  : 'unaccounted-receipt',
          planSha256s: binding ? [...binding.planSha256s].sort() : [],
        };
      }) ?? [];
    const allNativeReceiptsAccounted =
      native?.status === 'complete' &&
      nativeRows.every(
        (row) => row.provenance === 'authenticated-execution-receipt' || row.provenance === 'known-empty-configuration',
      );
    const originalDeploymentJournalsQualified =
      !!originalProof &&
      originalRows.length > 0 &&
      originalRows.every((row) => row.submission === 'applied' || row.submission === 'no-change');
    const unstagedRequestAbsenceQualified =
      allNativeReceiptsAccounted &&
      originalDeploymentJournalsQualified &&
      native?.unrecognizedRootEntrySha256s.length === 0 &&
      rows.length === 0 &&
      root.rows.every((row) => row.execution === 'unstaged-no-outcome');
    const completedNetworkRows = [...rows],
      completedReplacementRows = [...replacementRows];
    const completedPublicRequestCustodyQualified =
      allNativeReceiptsAccounted &&
      originalDeploymentJournalsQualified &&
      native?.status === 'complete' &&
      native.unrecognizedRootEntrySha256s.length === 0 &&
      root.rows.some((row) => row.execution === 'staged-network' || row.execution === 'completed-replacement') &&
      completedNetworkRows.length === root.rows.filter((row) => row.execution === 'staged-network').length &&
      completedReplacementRows.length === root.rows.filter((row) => row.execution === 'completed-replacement').length &&
      root.rows.every((request) => {
        if (request.execution === 'unstaged-no-outcome') return true;
        if (request.execution === 'completed-replacement') {
          const matches = completedReplacementRows.filter((row) => row.planSha256 === request.planSha256);
          return matches.length === 1 && matches[0].records.length > 0 && matches[0].originalPublishedJournalsQualified;
        }
        if (request.execution !== 'staged-network') return false;
        const matches = completedNetworkRows.filter((row) => row.planSha256 === request.planSha256);
        return (
          matches.length === 1 &&
          matches[0].main.originalPublishedJournalsQualified &&
          matches[0].main.terminalPublishedJournalsQualified &&
          matches[0].power.rows.every(
            (power) => power.status === 'retired' && power.retirement?.runnerRetirementQualified === true,
          )
        );
      });
    const sharedMain = {
      schemaVersion: 1,
      scope: 'exhaustive-shared-main-network-and-replacement-receipt-accounting',
      status: native
        ? native.status
        : mainNames.includes('artifact-retirement.json')
          ? 'retired-unqualified'
          : 'missing',
      ...(native
        ? {
            inventorySha256: canonicalSha256(native),
            incompleteArchives: native.incompleteArchives,
            namespaceSha256: native.namespaceSha256,
            manifestSha256: native.manifestSha256,
            unrecognizedRootEntrySha256s: native.unrecognizedRootEntrySha256s,
          }
        : {}),
      rows: nativeRows,
      originalRows,
      ...(originalProof ? { originalReceiptProvenanceSha256: canonicalSha256(originalProof) } : {}),
      replacementRows,
      allNativeReceiptsAccounted,
      originalDeploymentJournalsQualified,
      replacementJournalsQualified:
        root.rows.every(
          (row) =>
            row.kind !== 'node-replacement' ||
            row.execution === 'completed-replacement' ||
            row.execution === 'unstaged-no-outcome',
        ) &&
        replacementRows.length > 0 &&
        replacementRows.every((row) => row.originalPublishedJournalsQualified),
      unstagedRequestAbsenceQualified,
      parentRetirementQualified: false,
      currentOperationalAcceptanceQualified: false,
    };
    if (originalProof)
      require15(
        same13(
          await step(() => readAzureTerraformOriginalReceiptProvenance(original, store, loaders, active)),
          originalProof,
        ),
        'original receipt provenance changed at final native boundary',
      );
    if (recheckNative) await recheckNative();
    require15(
      same13(await step(() => context.recheck(active)), root),
      'collection lineage changed at final native boundary',
    );
    await recheckEmpty();
    for (const path of directories.keys()) await directory(path);
    for (const path of files.keys()) await file(path);
    boundary();
    return {
      schemaVersion: 1,
      scope: 'all-staged-network-original-journal-custody',
      lineage: structuredClone(root),
      lineageSha256: canonicalSha256(root),
      rows,
      sharedMain,
      allPublicRequestCustodyQualified: unstagedRequestAbsenceQualified || completedPublicRequestCustodyQualified,
      parentRetirementQualified: false,
      currentOperationalAcceptanceQualified: false,
    };
  } finally {
    live = false;
    witnesses2.delete(child);
  }
}

// plugins/azure/src/ce/terraform-network-terminal-staging-projection.ts
// plugins/azure/src/ce/terraform-network-parent-inventory.ts
// plugins/azure/src/ce/terraform-network-authenticated-packet-inventory.ts
import { createHash as createHash17, createHash as createHash26, createHash as createHash27 } from 'node:crypto';
import { constants as constants7, constants as constants13 } from 'node:fs';
import {
  lstat as lstat14,
  lstat as lstat23,
  open as open4,
  open as open10,
  readdir as readdir15,
  readdir as readdir24,
  realpath as realpath14,
  realpath as realpath22,
} from 'node:fs/promises';
import { join as join15, join as join26 } from 'node:path';

var same14 = (a, b) => canonicalEqual({ value: a }, { value: b });
var hash13 = (bytes) => createHash17('sha256').update(bytes).digest('hex');
var identity2 = (stat) => `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
function require16(value, message) {
  if (!value) throw Error(`Azure authenticated network packet inventory: ${message}`);
}
var witnesses3 = new WeakMap();
async function readAzureTerraformNetworkAuthenticatedPacketInventory(request, store, context, signal) {
  const plan = structuredClone(request),
    owner = structuredClone(store.owner),
    directory = store.directory,
    site = structuredClone(context.site),
    { loaders, verifier, replacementVerifier } = context;
  const dependencies = [
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'verify', value: store.verify },
    { target: loaders, key: 'loadSource', value: loaders.loadSource },
    { target: loaders, key: 'loadOutcome', value: loaders.loadOutcome },
  ];
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require16(
      same14(request, plan) &&
        same14(store.owner, owner) &&
        store.directory === directory &&
        same14(context.site, site) &&
        context.loaders === loaders &&
        context.verifier === verifier &&
        context.replacementVerifier === replacementVerifier &&
        dependencies.every(({ target, key, value }) => Reflect.get(target, key) === value),
      'owning context changed',
    );
  };
  const step = async (action, parent) => {
    seal();
    const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
    active.throwIfAborted();
    const aborted = Promise.withResolvers(),
      onAbort = () => aborted.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), aborted.promise]);
      active.throwIfAborted();
      seal();
      return result;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  seal();
  require16(
    plan.engine === 'terraform' &&
      same14(azureUpgradeBinding(plan).owner, owner) &&
      !!(plan.terraformNetworkProfile || plan.terraformNetworkReplacementProfile),
    'exact owning network request required',
  );
  await step(() => store.verify());
  const snapshot = async (parent) => {
    const before = await step(() => lstat14(directory), parent);
    require16(
      before.isDirectory() &&
        !before.isSymbolicLink() &&
        before.uid === process.getuid?.() &&
        (before.mode & 63) === 0 &&
        (await step(() => realpath14(directory), parent)) === directory,
      'private root ownership differs',
    );
    const names = (await step(() => readdir15(directory), parent)).sort();
    const packets = {};
    for (const name of names.filter((name) => name.endsWith('.json'))) {
      require16(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.json$/.test(name), 'private root packet filename differs');
      const path = join15(directory, name),
        handle = await step(() => open4(path, constants7.O_RDONLY | constants7.O_NOFOLLOW), parent);
      try {
        const first = await step(() => handle.stat(), parent),
          bytes = await step(() => handle.readFile(), parent),
          last = await step(() => handle.stat(), parent),
          named = await step(() => lstat14(path), parent);
        require16(
          first.isFile() &&
            first.uid === process.getuid?.() &&
            first.nlink === 1 &&
            (first.mode & 63) === 0 &&
            identity2(first) === identity2(last) &&
            first.size === last.size &&
            first.mtimeMs === last.mtimeMs &&
            first.ctimeMs === last.ctimeMs &&
            named.isFile() &&
            !named.isSymbolicLink() &&
            identity2(named) === identity2(first) &&
            named.uid === first.uid &&
            named.nlink === 1 &&
            (named.mode & 63) === 0,
          'native packet custody differs',
        );
        let logical;
        try {
          logical = JSON.parse(bytes.toString());
        } catch {
          throw Error('Azure authenticated network packet inventory: malformed native packet');
        }
        packets[name] = {
          identity: identity2(first),
          bytesSha256: hash13(bytes),
          packetSha256: canonicalSha256(logical),
        };
      } finally {
        await handle.close();
      }
    }
    const after = await step(() => lstat14(directory), parent);
    require16(
      after.isDirectory() &&
        !after.isSymbolicLink() &&
        identity2(after) === identity2(before) &&
        after.uid === before.uid &&
        (after.mode & 63) === 0 &&
        same14((await step(() => readdir15(directory), parent)).sort(), names),
      'native namespace changed during collection',
    );
    return { identity: identity2(before), names, packets };
  };
  const original = await snapshot();
  const inspect = async (parent) => {
    require16(same14(await snapshot(parent), original), 'native packet bytes, inode or namespace changed');
    const consumed = new Map(),
      absent = new Set();
    const read = async (name) => {
      require16(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.json$/.test(name), 'owning reader requested a foreign packet path');
      let value;
      try {
        value = await step(() => store.read(name), parent);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        require16(!original.packets[name] && !consumed.has(name), 'logical absence differs from native publication');
        absent.add(name);
        throw error;
      }
      const digest = canonicalSha256(value),
        native = original.packets[name];
      require16(
        native &&
          !absent.has(name) &&
          native.packetSha256 === digest &&
          (!consumed.has(name) || consumed.get(name) === digest),
        'semantic packet differs from native publication',
      );
      consumed.set(name, digest);
      return structuredClone(value);
    };
    const verify = () => step(() => store.verify(), parent);
    const rejectMutation = () => {
      throw Error('Authenticated packet inventory must not mutate storage');
    };
    const methods = new Map();
    const readonlyStore = new Proxy(store, {
      get(target, key) {
        if (key === 'read') return read;
        if (key === 'verify') return verify;
        if (['write', 'remove', 'retire'].includes(String(key))) return rejectMutation;
        const value = Reflect.get(target, key, target);
        if (typeof value !== 'function') return value;
        const cached = methods.get(key);
        if (cached && cached.value === value) return cached.bound;
        const bound = value.bind(target);
        methods.set(key, { value, bound });
        return bound;
      },
    });
    const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
    let provenance;
    if (plan.terraformNetworkReplacementProfile) {
      require16(replacementVerifier, 'owning completed-replacement verifier required');
      provenance = await step(
        () =>
          readAzureTerraformNetworkReplacementReceiptProvenance(
            plan,
            readonlyStore,
            loaders,
            site,
            verifier,
            replacementVerifier,
            active,
          ),
        parent,
      );
    } else {
      provenance = await step(
        () =>
          readAzureTerraformNetworkRetirementGraph(
            plan,
            readonlyStore,
            loaders,
            site,
            verifier,
            active,
            replacementVerifier,
          ),
        parent,
      );
    }
    require16(consumed.size > 0, 'owning reader consumed no authenticated packets');
    require16(
      same14(await snapshot(parent), original),
      'native packet bytes, inode or namespace changed across authentication',
    );
    await step(() => store.verify(), parent);
    return {
      provenanceSha256: canonicalSha256(provenance),
      packets: [...consumed.keys()].sort().map((name) => {
        const native = original.packets[name];
        require16(native, 'consumed native packet missing');
        return { name, ...native };
      }),
      absentPackets: [...absent].sort(),
    };
  };
  const first = await inspect();
  const result = {
    schemaVersion: 1,
    scope: 'authenticated-network-parent-enrollment-packet-inventory',
    owner,
    site,
    sourcePlanSha256: plan.planSha256,
    kind: plan.terraformNetworkReplacementProfile ? 'completed-replacement' : 'network-graph',
    rootIdentity: original.identity,
    nativeRootSnapshotSha256: canonicalSha256(original),
    namespaceNames: original.names,
    ...first,
    unconsumedRootPackets: Object.keys(original.packets)
      .filter((name) => !first.packets.some((packet) => packet.name === name))
      .sort(),
    completeParentInventoryQualified: false,
    nativeChildRetirementQualified: false,
    parentRetirementQualified: false,
    currentOperationalAcceptanceQualified: false,
  };
  const digest = canonicalSha256(result);
  witnesses3.set(result, {
    request,
    store,
    context,
    digest,
    async recheck(parent) {
      require16(
        canonicalSha256(result) === digest && same14(await inspect(parent), first),
        'authenticated packet inventory changed',
      );
    },
  });
  return result;
}

// plugins/azure/src/ce/terraform-network-parent-public-bindings.ts
var sha7 = (value) => /^[a-f0-9]{64}$/.test(value);
function require17(value, message) {
  if (!value) throw Error(`Azure network parent public bindings: ${message}`);
}
function captureAzureNetworkParentPublicBindings(owningLoaders, signal, assertContext) {
  const { loadSource, loadOutcome } = owningLoaders;
  const sources = new Map();
  const outcomes = new Map();
  const boundary = () => {
    signal.throwIfAborted();
    assertContext();
    require17(
      owningLoaders.loadSource === loadSource && owningLoaders.loadOutcome === loadOutcome,
      'owning loader changed',
    );
  };
  const step = async (action) => {
    boundary();
    const canceled = Promise.withResolvers(),
      onAbort = () => canceled.reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), canceled.promise]);
      boundary();
      return result;
    } catch (error) {
      boundary();
      throw error;
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  };
  const sourceRecord = (plan) => {
    require17(sha7(plan.planSha256), 'execution source identifier unresolved');
    const record = { planSha256: plan.planSha256, sourceSha256: canonicalSha256(plan) };
    const previous = sources.get(record.planSha256);
    require17(!previous || previous.sourceSha256 === record.sourceSha256, 'repeated source changed');
    sources.set(record.planSha256, record);
    return record;
  };
  const loaders = {
    async loadSource(digest) {
      boundary();
      require17(sha7(digest), 'execution source identifier unresolved');
      const value = structuredClone(await step(() => loadSource.call(owningLoaders, digest)));
      require17(value.planSha256 === digest, 'loaded source identity differs');
      sourceRecord(value);
      boundary();
      return value;
    },
    async loadOutcome(plan) {
      boundary();
      const input = structuredClone(plan),
        source = sourceRecord(input),
        callbackInput = structuredClone(input);
      const previous = outcomes.get(input.planSha256);
      let value, absence;
      try {
        value = structuredClone(await step(() => loadOutcome.call(owningLoaders, callbackInput)));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        absence = error;
      }
      boundary();
      require17(
        absence || (value && typeof value === 'object' && !Array.isArray(value)),
        'complete outcome or explicit absence required',
      );
      require17(
        canonicalSha256(callbackInput) === source.sourceSha256 && canonicalSha256(plan) === source.sourceSha256,
        'outcome source input changed',
      );
      const record = {
        ...source,
        publication: absence ? 'absent' : 'published',
        outcomeSha256: absence ? null : canonicalSha256({ value }),
      };
      require17(!previous || canonicalSha256(previous.record) === canonicalSha256(record), 'repeated outcome changed');
      outcomes.set(input.planSha256, { input, record });
      if (absence) throw absence;
      return value;
    },
  };
  const snapshot = () => {
    boundary();
    return {
      sources: [...sources.values()]
        .sort((a, b) => a.planSha256.localeCompare(b.planSha256))
        .map((row) => ({ ...row })),
      outcomes: [...outcomes.values()]
        .map(({ record }) => ({ ...record }))
        .sort((a, b) => a.planSha256.localeCompare(b.planSha256)),
    };
  };
  return {
    loaders,
    snapshot,
    async recheck() {
      const expected = canonicalSha256(snapshot());
      for (const digest of [...sources.keys()].sort()) await loaders.loadSource(digest);
      for (const { input, record } of [...outcomes.values()]) {
        try {
          await loaders.loadOutcome(structuredClone(input));
        } catch (error) {
          if (record.publication !== 'absent' || error.code !== 'ENOENT') throw error;
        }
      }
      require17(canonicalSha256(snapshot()) === expected, 'public mapping changed across recheck');
    },
  };
}

// plugins/azure/src/ce/terraform-network-parent-public-custody.ts
import { createHash as createHash18 } from 'node:crypto';
import { lstat as lstat15, readdir as readdir16, realpath as realpath15 } from 'node:fs/promises';
import { isAbsolute as isAbsolute3, join as join16 } from 'node:path';

var sha8 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
var same15 = (a, b) => canonicalEqual({ value: a }, { value: b });
function require18(value, message) {
  if (!value) throw Error(`Azure network parent public custody: ${message}`);
}
async function readAzureTerraformNetworkParentPublicCustody(request, session, retained, signal) {
  const original = structuredClone(request),
    binding = structuredClone(retained),
    directory = session.getArtifactsDir(),
    sessionId = session.getSessionId();
  const callbacks = ['getArtifactsDir', 'getSessionId', 'getArtifactPath', 'saveArtifact'].map((key) => ({
    key,
    value: Reflect.get(session, key),
  }));
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const nativeSeal = () => {
    deadline.throwIfAborted();
    require18(
      same15(request, original) &&
        same15(retained, binding) &&
        callbacks.every(({ key, value }) => Reflect.get(session, key) === value),
      'owning public context changed',
    );
  };
  const seal = () => {
    nativeSeal();
    require18(
      session.getArtifactsDir() === directory && session.getSessionId() === sessionId,
      'owning public context changed',
    );
    nativeSeal();
  };
  const step = async (action, parent) => {
    seal();
    const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
    active.throwIfAborted();
    const canceled = Promise.withResolvers(),
      onAbort = () => canceled.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), canceled.promise]);
      active.throwIfAborted();
      seal();
      return result;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  const nativeStep = async (action, parent) => {
    nativeSeal();
    const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
    active.throwIfAborted();
    const canceled = Promise.withResolvers(),
      onAbort = () => canceled.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), canceled.promise]);
      active.throwIfAborted();
      nativeSeal();
      return result;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  seal();
  require18(directory && isAbsolute3(directory), 'durable public evidence directory required');
  require18(
    sha8(binding.publicPlanInventorySha256) &&
      sha8(binding.requestInventorySha256) &&
      binding.publicBindings &&
      Array.isArray(binding.publicBindings.sources) &&
      Array.isArray(binding.publicBindings.outcomes),
    'complete native-bound public mapping required',
  );
  const sourceRows = binding.publicBindings.sources,
    outcomeRows = binding.publicBindings.outcomes;
  require18(
    sourceRows.length > 0 &&
      sourceRows.every(
        (row) =>
          sha8(row.planSha256) &&
          sha8(row.sourceSha256) &&
          Object.keys(row).sort().join(',') === 'planSha256,sourceSha256',
      ) &&
      new Set(sourceRows.map((row) => row.planSha256)).size === sourceRows.length,
    'missing, malformed or duplicate public source mapping',
  );
  require18(
    outcomeRows.every(
      (row) =>
        sha8(row.planSha256) &&
        sha8(row.sourceSha256) &&
        Object.keys(row).sort().join(',') === 'outcomeSha256,planSha256,publication,sourceSha256' &&
        (row.publication === 'published'
          ? sha8(row.outcomeSha256)
          : row.publication === 'absent' && row.outcomeSha256 === null) &&
        sourceRows.some((source) => source.planSha256 === row.planSha256 && source.sourceSha256 === row.sourceSha256),
    ) && new Set(outcomeRows.map((row) => row.planSha256)).size === outcomeRows.length,
    'malformed, duplicate or foreign public outcome mapping',
  );
  require18(
    outcomeRows.some((row) => row.planSha256 === original.planSha256),
    'original public outcome mapping missing',
  );
  const snapshot = async (parent) => {
    seal();
    const root = await nativeStep(() => lstat15(directory), parent);
    require18(
      root.isDirectory() &&
        !root.isSymbolicLink() &&
        root.uid === process.getuid?.() &&
        (root.mode & 63) === 0 &&
        (await nativeStep(() => realpath15(directory), parent)) === directory,
      'public directory ownership differs',
    );
    const identity = `${root.dev}:${root.ino}:${root.birthtimeMs}`;
    const names = (await nativeStep(() => readdir16(directory), parent))
      .filter((name) => name.endsWith('.azure-ce-plan.log') || name.endsWith('.azure-ce-terraform-checkpoint.log'))
      .sort();
    const files = [];
    for (const name of names) {
      require18(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name), 'foreign public evidence filename');
      const file = await nativeStep(
        () => readAzureTerraformParentPrivateFile(join16(directory, name), deadline),
        parent,
      );
      let value;
      try {
        value = JSON.parse(file.bytes.toString());
      } catch {
        throw Error('Azure network parent public custody: malformed public evidence');
      }
      require18(value && typeof value === 'object' && !Array.isArray(value), 'malformed public evidence');
      files.push({ name, identity: file.identity, sha256: createHash18('sha256').update(file.bytes).digest('hex') });
    }
    const after = await nativeStep(() => lstat15(directory), parent);
    require18(
      after.isDirectory() &&
        !after.isSymbolicLink() &&
        after.uid === root.uid &&
        (after.mode & 63) === 0 &&
        (await nativeStep(() => realpath15(directory), parent)) === directory &&
        `${after.dev}:${after.ino}:${after.birthtimeMs}` === identity &&
        same15(
          (await nativeStep(() => readdir16(directory), parent))
            .filter(
              (name) => name.endsWith('.azure-ce-plan.log') || name.endsWith('.azure-ce-terraform-checkpoint.log'),
            )
            .sort(),
          names,
        ),
      'public evidence namespace changed',
    );
    nativeSeal();
    return { identity, files };
  };
  const first = await snapshot();
  require18(
    !Object.hasOwn(binding, 'publicEvidenceSnapshotSha256') ||
      (sha8(binding.publicEvidenceSnapshotSha256) && canonicalSha256(first) === binding.publicEvidenceSnapshotSha256),
    'native-bound public namespace changed',
  );
  const inspect = async (parent) => {
    require18(same15(await snapshot(parent), first), 'public evidence bytes, inode or namespace changed');
    const requests = await step(() => readAzureTerraformNetworkRetirementRequests(original, session, deadline), parent);
    require18(
      requests.publicPlanInventorySha256 === binding.publicPlanInventorySha256 &&
        requests.requestInventorySha256 === binding.requestInventorySha256,
      'exact public request inventory changed',
    );
    require18(
      [original.planSha256, ...requests.requests.map((row) => row.planSha256)].every((digest) =>
        sourceRows.some((row) => row.planSha256 === digest),
      ),
      'public request missing from retained source mapping',
    );
    require18(
      requests.requests.every((row) => outcomeRows.some((outcome) => outcome.planSha256 === row.planSha256)),
      'public request missing from retained outcome mapping',
    );
    const inventory = await step(() => readAzureCePlanInventory(session, deadline), parent);
    require18(inventory.sourceSha256 === binding.publicPlanInventorySha256, 'public source inventory changed');
    const plans = new Map(inventory.plans.map(({ plan }) => [plan.planSha256, plan]));
    for (const row of sourceRows)
      require18(
        plans.has(row.planSha256) && canonicalSha256(plans.get(row.planSha256)) === row.sourceSha256,
        'public source missing or changed',
      );
    for (const row of outcomeRows) {
      const source = plans.get(row.planSha256);
      require18(source, 'public outcome source missing');
      let outcome,
        absent = false;
      try {
        outcome = await step(() => loadAzureTerraformOutcome(session, source), parent);
      } catch (error) {
        if (!(error instanceof AzureTerraformOutcomeAbsent)) throw error;
        absent = true;
      }
      require18(
        row.publication === (absent ? 'absent' : 'published') &&
          (absent ? row.outcomeSha256 === null : row.outcomeSha256 === canonicalSha256({ value: outcome })),
        'public outcome publication changed',
      );
    }
    await step(() => requests.recheck(), parent);
    await step(() => inventory.recheck(), parent);
    require18(same15(await snapshot(parent), first), 'public evidence bytes, inode or namespace changed');
    nativeSeal();
  };
  await inspect();
  return {
    schemaVersion: 1,
    scope: 'post-parent-public-evidence-match-only',
    originalPlanSha256: original.planSha256,
    publicBindingsSha256: canonicalSha256(binding),
    publicEvidenceSnapshotSha256: canonicalSha256(first),
    parentRetirementQualified: false,
    nativeBarrierReadQualified: false,
    currentOperationalAcceptanceQualified: false,
    recheck: inspect,
  };
}

// plugins/azure/src/ce/terraform-original-parent-directory-inventory.ts
import { createHash as createHash19 } from 'node:crypto';
import { constants as constants8 } from 'node:fs';
import { lstat as lstat16, open as open5, readdir as readdir17, realpath as realpath16 } from 'node:fs/promises';
import { join as join17 } from 'node:path';

var same16 = (a, b) => canonicalEqual({ value: a }, { value: b });
var hash14 = (bytes) => createHash19('sha256').update(bytes).digest('hex');
var identity3 = (stat) => `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
function require19(value, message) {
  if (!value) throw Error(`Azure original parent directory inventory: ${message}`);
}
var witnesses4 = new WeakMap();
async function readAzureTerraformOriginalParentDirectoryInventory(request, store, loaders, signal) {
  const plan = structuredClone(request),
    owner = structuredClone(store.owner),
    directory = store.directory;
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const dependencies = [
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'verify', value: store.verify },
    { target: loaders, key: 'loadSource', value: loaders.loadSource },
    { target: loaders, key: 'loadOutcome', value: loaders.loadOutcome },
  ];
  const seal = () => {
    deadline.throwIfAborted();
    require19(
      same16(request, plan) &&
        same16(store.owner, owner) &&
        store.directory === directory &&
        dependencies.every(({ target, key, value }) => Reflect.get(target, key) === value),
      'owning context changed',
    );
  };
  const step = async (action, parent) => {
    seal();
    const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
    active.throwIfAborted();
    const aborted = Promise.withResolvers(),
      onAbort = () => aborted.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), aborted.promise]);
      active.throwIfAborted();
      seal();
      return result;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  const snapshot = async (parent) => {
    const root = await step(() => lstat16(directory), parent);
    require19(
      root.isDirectory() &&
        !root.isSymbolicLink() &&
        root.uid === process.getuid?.() &&
        (root.mode & 63) === 0 &&
        (await step(() => realpath16(directory), parent)) === directory,
      'private root differs',
    );
    const directories = [];
    const files = [];
    for (const name of [
      'terraform-original-deployment-receipts',
      'terraform-original-deployment-publication-fragments',
    ]) {
      const path = join17(directory, name);
      let first;
      try {
        first = await step(() => lstat16(path), parent);
      } catch (error) {
        if (name.endsWith('publication-fragments') && error.code === 'ENOENT') continue;
        throw error;
      }
      require19(
        first.isDirectory() &&
          !first.isSymbolicLink() &&
          first.uid === process.getuid?.() &&
          (first.mode & 63) === 0 &&
          (await step(() => realpath16(path), parent)) === path,
        'original directory ownership differs',
      );
      const names = (await step(() => readdir17(path), parent)).sort();
      for (const fileName of names) {
        require19(
          name.endsWith('receipts')
            ? /^[a-f0-9]{64}\.json$/.test(fileName)
            : /^[a-f0-9]{64}-[a-f0-9-]{36}\.pending\.[a-f0-9]{64}\.fragment$/.test(fileName),
          'unaccounted original directory entry',
        );
        const selected = join17(path, fileName),
          handle = await step(() => open5(selected, constants8.O_RDONLY | constants8.O_NOFOLLOW), parent);
        try {
          const before = await step(() => handle.stat(), parent),
            bytes = await step(() => handle.readFile(), parent),
            after = await step(() => handle.stat(), parent),
            named = await step(() => lstat16(selected), parent);
          require19(
            before.isFile() &&
              before.uid === process.getuid?.() &&
              before.nlink === 1 &&
              (before.mode & 63) === 0 &&
              identity3(before) === identity3(after) &&
              before.size === after.size &&
              before.mtimeMs === after.mtimeMs &&
              before.ctimeMs === after.ctimeMs &&
              named.isFile() &&
              !named.isSymbolicLink() &&
              identity3(named) === identity3(before) &&
              named.uid === before.uid &&
              named.nlink === 1 &&
              (named.mode & 63) === 0,
            'original file bytes or identity changed',
          );
          files.push({ path: `${name}/${fileName}`, identity: identity3(before), bytesSha256: hash14(bytes) });
        } finally {
          await handle.close();
        }
      }
      const after = await step(() => lstat16(path), parent);
      require19(
        after.isDirectory() &&
          !after.isSymbolicLink() &&
          identity3(after) === identity3(first) &&
          after.uid === first.uid &&
          (after.mode & 63) === 0 &&
          same16((await step(() => readdir17(path), parent)).sort(), names),
        'original directory changed during read',
      );
      directories.push({ path: name, identity: identity3(first), names });
    }
    const afterRoot = await step(() => lstat16(directory), parent);
    require19(
      afterRoot.isDirectory() &&
        !afterRoot.isSymbolicLink() &&
        identity3(afterRoot) === identity3(root) &&
        afterRoot.uid === root.uid &&
        (afterRoot.mode & 63) === 0,
      'private root identity changed',
    );
    return { rootIdentity: identity3(root), directories, files };
  };
  seal();
  await step(() => store.verify());
  const original = await snapshot();
  const inspect = async (parent) => {
    require19(same16(await snapshot(parent), original), 'original bytes, inode or namespace changed');
    const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
    const provenance = await step(
      () => readAzureTerraformOriginalReceiptProvenance(plan, store, loaders, active),
      parent,
    );
    const receipts = original.directories.find((row) => row.path === 'terraform-original-deployment-receipts');
    require19(
      receipts &&
        same16(receipts.names, provenance.receipts.map((row) => `${canonicalSha256(row.record)}.json`).sort()),
      'original directory differs from authenticated public receipt inventory',
    );
    const fragments = original.directories.find(
      (row) => row.path === 'terraform-original-deployment-publication-fragments',
    );
    require19(
      same16(fragments?.names ?? [], provenance.publicationFragments.map((row) => row.name).sort()),
      'original fragments differ from authenticated publication provenance',
    );
    require19(same16(await snapshot(parent), original), 'original bytes, inode or namespace changed across callbacks');
    await step(() => store.verify(), parent);
    return canonicalSha256(provenance);
  };
  const provenanceSha256 = await inspect();
  const result = {
    schemaVersion: 1,
    scope: 'authenticated-original-parent-enrollment-directory-inventory',
    owner,
    originalPlanSha256: plan.planSha256,
    ...original,
    provenanceSha256,
    originalReceiptMetadataQualified: true,
    completeParentInventoryQualified: false,
    nativeJournalsQualified: false,
    parentRetirementQualified: false,
    currentOperationalAcceptanceQualified: false,
  };
  const digest = canonicalSha256(result);
  witnesses4.set(result, {
    request,
    store,
    loaders,
    digest,
    async recheck(parent) {
      require19(
        canonicalSha256(result) === digest && (await inspect(parent)) === provenanceSha256,
        'original directory inventory changed',
      );
    },
  });
  return result;
}

// plugins/azure/src/ce/terraform-parent-disposition.ts
// plugins/terraform/src/cleanup-verifier-worker.ts
import { createHash as createHash20, createHash as createHash25 } from 'node:crypto';
import { isIP as isIP4 } from 'node:net';
import { join as join25 } from 'node:path';

var hash15 = (value) => createHash20('sha256').update(value).digest('hex');
var encode = (value) => {
  if (Array.isArray(value)) return `[${value.map(encode).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${encode(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
};

// plugins/terraform/src/independent-cleanup.ts
var sha9 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
var evidenceKeys =
  'commands,completedAt,evidenceSha256,executorPid,finalPlanSha256,inputInventorySha256,interpreterSha256,manifestSha256,nonce,originalPlanJsonSha256,parentPid,planReceiptSha256,refreshedPlanJsonSha256,refreshedPlanSha256,requestSha256,schemaVersion,startedAt,stateJsonSha256,status,terraformExecutablePathSha256,terraformExecutableSha256,terraformVersion,workerSha256';
function verifyRetainedCleanup(value, bindings, expectedSha256) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Independent cleanup retirement evidence is missing');
  const evidence = value;
  if (
    Object.keys(evidence).sort().join(',') !== evidenceKeys ||
    evidence.schemaVersion !== 1 ||
    evidence.status !== 'independently-verified' ||
    !sha9(expectedSha256) ||
    hash15(encode(evidence)) !== expectedSha256 ||
    Object.entries(bindings).some(([key, expected]) => evidence[key] !== expected) ||
    ![
      evidence.nonce,
      evidence.requestSha256,
      evidence.inputInventorySha256,
      evidence.terraformExecutableSha256,
      evidence.terraformExecutablePathSha256,
      evidence.interpreterSha256,
      evidence.workerSha256,
      evidence.stateJsonSha256,
      evidence.originalPlanJsonSha256,
      evidence.refreshedPlanSha256,
      evidence.refreshedPlanJsonSha256,
    ].every(sha9) ||
    !Number.isFinite(Date.parse(evidence.startedAt)) ||
    !Number.isFinite(Date.parse(evidence.completedAt)) ||
    Date.parse(evidence.completedAt) < Date.parse(evidence.startedAt) ||
    !Number.isSafeInteger(evidence.parentPid) ||
    evidence.parentPid <= 0 ||
    !Number.isSafeInteger(evidence.executorPid) ||
    evidence.executorPid <= 0 ||
    evidence.executorPid === evidence.parentPid ||
    !/^\d+\.\d+\.\d+$/.test(evidence.terraformVersion) ||
    encode(evidence.commands) !==
      encode([
        ['version', '-json'],
        ['show', '-json', 'saved.tfplan'],
        ['show', '-json'],
        [
          'plan',
          '-input=false',
          '-lock=true',
          '-lock-timeout=60s',
          '-refresh=true',
          `-out=independent-cleanup-${evidence.nonce}.tfplan`,
        ],
        ['show', '-json', `independent-cleanup-${evidence.nonce}.tfplan`],
      ])
  )
    throw Error('Independent cleanup retirement provenance differs');
  return evidence;
}

// plugins/azure/src/ce/network-operational-retirement-session.ts
import { constants as constants9 } from 'node:fs';
import { lstat as lstat17, open as open6, readdir as readdir18, realpath as realpath17 } from 'node:fs/promises';
import { join as join18 } from 'node:path';

var same17 = canonicalEqual;
var digest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
var suffix = '.azure-ce-network-operational-issuer.log';
var observerName = (name) =>
  ['azure-network-observer-', 'azure-network-issuer-', 'azure-network-observation-'].some((prefix) =>
    name.startsWith(prefix),
  );
function require20(value, message) {
  if (!value) throw Error(`Azure operational retirement session: ${message}`);
}
var sessions = new WeakMap();
async function createAzureOperationalRetirementSession(request, transport, cloud, storage, publicSession, signal) {
  const original = structuredClone(request),
    requestMatches = canonicalSnapshot(original),
    owner = structuredClone(storage.owner),
    directory = storage.directory;
  verifyAzureCePlan(original);
  require20(
    original.engine === 'terraform' &&
      original.intent.operation === 'deploy' &&
      same17(azureUpgradeBinding(original).owner, owner),
    'original Terraform deployment required',
  );
  const publicDirectory = publicSession.getArtifactsDir(),
    sessionId = publicSession.getSessionId();
  require20(
    typeof publicDirectory === 'string' && publicDirectory.startsWith('/'),
    'persistent original public session required',
  );
  const callbacks = [
    publicSession.getSessionId,
    publicSession.getArtifactsDir,
    publicSession.getArtifactPath,
    publicSession.saveArtifact,
  ];
  const storeCallbacks = [storage.verify, storage.read, storage.write, storage.remove];
  const seal = () => {
    signal?.throwIfAborted();
    require20(
      requestMatches(request) &&
        requestMatches(original) &&
        same17(storage.owner, owner) &&
        storage.directory === directory &&
        transport.engine === 'terraform' &&
        publicSession.getSessionId() === sessionId &&
        publicSession.getArtifactsDir() === publicDirectory &&
        callbacks.every(
          (fn, i) =>
            fn ===
            [
              publicSession.getSessionId,
              publicSession.getArtifactsDir,
              publicSession.getArtifactPath,
              publicSession.saveArtifact,
            ][i],
        ) &&
        storeCallbacks.every((fn, i) => fn === [storage.verify, storage.read, storage.write, storage.remove][i]),
      'owning deployment or callbacks changed',
    );
  };
  const store = guardAzureCeApplyObject(storage, seal, {}, ['owner', 'directory']);
  const runtime = guardAzureCeApplyObject(transport, seal, {}, ['engine']);
  const api = guardAzureCeApplyObject(cloud, seal);
  let privateIdentity, publicIdentity;
  const fileIdentities = new Map();
  const bounded = async (work, parent) => {
    const active = AbortSignal.any([
      AbortSignal.timeout(180000),
      ...(signal ? [signal] : []),
      ...(parent ? [parent] : []),
    ]);
    seal();
    active.throwIfAborted();
    const aborted = Promise.withResolvers(),
      onAbort = () => aborted.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([work(active), aborted.promise]);
      active.throwIfAborted();
      seal();
      return value;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  const inspect = async (active) => {
    seal();
    active.throwIfAborted();
    await store.verify();
    const root = await lstat17(directory),
      native = await lstat17(publicDirectory);
    require20(
      root.isDirectory() &&
        !root.isSymbolicLink() &&
        root.uid === process.getuid?.() &&
        (root.mode & 63) === 0 &&
        (await realpath17(directory)) === directory,
      'private directory custody differs',
    );
    require20(
      native.isDirectory() &&
        !native.isSymbolicLink() &&
        native.uid === process.getuid?.() &&
        (native.mode & 18) === 0 &&
        (await realpath17(publicDirectory)) === publicDirectory,
      'public directory custody differs',
    );
    const identity = (value) => `${value.dev}:${value.ino}:${value.birthtimeMs}`;
    require20(
      (privateIdentity === undefined || privateIdentity === identity(root)) &&
        (publicIdentity === undefined || publicIdentity === identity(native)),
      'owning directory replaced',
    );
    privateIdentity = identity(root);
    publicIdentity = identity(native);
    const source = await loadPlanArtifact(publicSession, original.planId, original.planSha256);
    require20(same17(source.plan, original), 'original public deployment differs');
    const names = (await readdir18(publicDirectory)).filter((name) => name.endsWith(suffix)).sort();
    const bindings = [];
    for (const name of names) {
      active.throwIfAborted();
      seal();
      const path = join18(publicDirectory, name),
        handle = await open6(path, constants9.O_RDONLY | constants9.O_NOFOLLOW | constants9.O_NONBLOCK);
      let raw;
      try {
        const before = await handle.stat();
        require20(
          before.isFile() &&
            before.uid === process.getuid?.() &&
            before.nlink === 1 &&
            (before.mode & 18) === 0 &&
            before.size <= 131072,
          'public issuer file custody differs',
        );
        raw = await handle.readFile('utf8');
        const after = await handle.stat(),
          named = await lstat17(path);
        const stamp = (value) =>
          `${value.dev}:${value.ino}:${value.birthtimeMs}:${value.size}:${value.mtimeMs}:${value.ctimeMs}:${value.uid}:${value.mode}:${value.nlink}`;
        require20(
          named.isFile() && !named.isSymbolicLink() && stamp(before) === stamp(after) && stamp(after) === stamp(named),
          'public issuer file changed',
        );
        const retained = canonicalSha256({ stamp: stamp(named), raw });
        require20(
          !fileIdentities.has(path) || fileIdentities.get(path) === retained,
          'original public issuer replaced',
        );
        fileIdentities.set(path, retained);
      } finally {
        await handle.close();
      }
      const row = parseNodeHealthJson(raw);
      require20(
        same17(
          Object.keys(row).sort(),
          ['schemaVersion', 'kind', 'engine', 'owner', 'planId', 'planSha256', 'issuerSha256'].sort(),
        ) &&
          row.schemaVersion === 1 &&
          row.kind === 'azure-network-operational-issuer-binding' &&
          row.engine === 'terraform' &&
          typeof row.planId === 'string' &&
          digest(row.planSha256) &&
          digest(row.issuerSha256),
        'original public issuer schema differs',
      );
      if (!same17(row.owner, owner)) continue;
      const candidate = (await loadPlanArtifact(publicSession, row.planId, row.planSha256)).plan;
      require20(
        candidate.engine === 'terraform' &&
          candidate.intent.operation === 'update-network' &&
          same17(azureUpgradeBinding(candidate), azureUpgradeBinding(original)) &&
          same17(azureTerraformNetworkScope(candidate, true), azureTerraformNetworkScope(original, true)) &&
          (!candidate.terraformNetworkProfile ||
            candidate.terraformNetworkProfile.originalPlanSha256 === original.planSha256),
        'original issuer network source differs from deployment',
      );
      bindings.push({ issuerSha256: row.issuerSha256, source: candidate });
    }
    require20(
      same17(names, (await readdir18(publicDirectory)).filter((name) => name.endsWith(suffix)).sort()),
      'public issuer namespace changed',
    );
    const pins = [...new Set(bindings.map((row) => row.issuerSha256))];
    require20(pins.length <= 1, 'conflicting original public issuers');
    const privateNames = (await readdir18(directory)).filter(observerName).sort();
    require20(bindings.length > 0 || privateNames.length === 0, 'observer artifacts have no original public issuer');
    const finalPrivate = await lstat17(directory),
      finalPublic = await lstat17(publicDirectory);
    require20(
      identity(finalPrivate) === privateIdentity &&
        identity(finalPublic) === publicIdentity &&
        (finalPrivate.mode & 63) === 0 &&
        (finalPublic.mode & 18) === 0,
      'directory custody changed during source inspection',
    );
    active.throwIfAborted();
    seal();
    return { bindings, privateNames };
  };
  const opening = await bounded(inspect);
  const acquisition = opening.bindings.length
    ? await createAzureOperationalAcquisitionSession(
        opening.bindings[0].source,
        runtime,
        api,
        store,
        publicSession,
        undefined,
        signal,
      )
    : undefined;
  const sameBindings = (value) =>
    same17(
      value.bindings.map((row) => ({ issuerSha256: row.issuerSha256, sourcePlanSha256: row.source.planSha256 })),
      opening.bindings.map((row) => ({ issuerSha256: row.issuerSha256, sourcePlanSha256: row.source.planSha256 })),
    );
  const absent = async (active) => {
    const claim = acquireProcessLock(join18(directory, '.azure-operational-acquisition-lock'));
    let release;
    try {
      const aborted = Promise.withResolvers(),
        onAbort = () => aborted.reject(active.reason);
      active.addEventListener('abort', onAbort, { once: true });
      try {
        release = await Promise.race([claim, aborted.promise]);
      } finally {
        active.removeEventListener('abort', onAbort);
      }
    } catch (error) {
      await claim.then(
        (unlock) => unlock(),
        () => {},
      );
      throw error;
    }
    try {
      const first = await inspect(active),
        last = await inspect(active);
      require20(
        sameBindings(first) && sameBindings(last) && !first.privateNames.length && !last.privateNames.length,
        'observer absence changed',
      );
      return {
        status: 'authenticated',
        scope: 'owning-observer-artifact-disposition',
        owner: structuredClone(owner),
        issuerSha256: null,
        observerState: 'absent',
        artifacts: [],
        signingMaterialPresent: false,
        operationalAcceptance: 'unknown',
        canSatisfyInterfaceMutationGate: false,
      };
    } finally {
      await release();
    }
  };
  const read = (parent) =>
    bounded(async (active) => {
      if (!acquisition) return absent(active);
      require20(sameBindings(await inspect(active)), 'original source binding changed');
      const inventory = await acquisition.authenticateRetirementInventory(active);
      require20(sameBindings(await inspect(active)), 'original source binding changed');
      return { ...inventory, observerState: 'present' };
    }, parent);
  const facade = Object.freeze({
    authenticateRetirementInventory: read,
    retireSigningMaterial(parent) {
      return bounded(async (active) => {
        if (!acquisition)
          return {
            status: 'absent',
            scope: 'operational-observer-signing-material',
            artifactInventory: await absent(active),
          };
        require20(sameBindings(await inspect(active)), 'original source binding changed');
        const retired = await acquisition.retireSigningMaterial(active);
        require20(sameBindings(await inspect(active)), 'original source binding changed');
        return {
          status: retired.status,
          scope: retired.scope,
          artifactInventory: { ...retired.artifactInventory, observerState: 'present' },
        };
      }, parent);
    },
  });
  sessions.set(facade, { source: original, store: storage, publicSession, read });
  return facade;
}
async function readAuthenticatedAzureOperationalRetirementInventory(candidate, original, store, publicSession, signal) {
  const bound = candidate && typeof candidate === 'object' ? sessions.get(candidate) : undefined;
  require20(
    bound &&
      same17(bound.source, original) &&
      bound.publicSession === publicSession &&
      bound.store.directory === store.directory &&
      same17(bound.store.owner, store.owner),
    'genuine owning retirement session required',
  );
  return bound.read(signal);
}

// plugins/azure/src/ce/network-operational-parent-disposition.ts
async function collectAzureOperationalParentDispositions(original, store, publicSession, snapshot, session, signal) {
  const observed = await readAuthenticatedAzureOperationalRetirementInventory(
    session,
    original,
    store,
    publicSession,
    signal,
  );
  if (observed.signingMaterialPresent) throw Error('Azure operational parent: signing material still present');
  const byPath = new Map(snapshot.map((file) => [file.path, file]));
  if (byPath.size !== snapshot.length) throw Error('Azure operational parent: duplicate native file');
  const paths = new Set();
  const decisions = observed.artifacts.map((artifact) => {
    const file = byPath.get(artifact.path);
    if (
      !file ||
      paths.has(artifact.path) ||
      artifact.action !== 'preserve' ||
      file.identity !== artifact.identity ||
      file.sha256 !== artifact.sha256 ||
      file.packetSha256 !== artifact.packetSha256
    )
      throw Error('Azure operational parent: original authenticated artifact differs from native snapshot');
    paths.add(artifact.path);
    return {
      ...file,
      action: 'preserve',
      schema: artifact.schema,
      semanticProvenanceSha256: artifact.semanticProvenanceSha256,
    };
  });
  const required = snapshot.filter((file) =>
    ['azure-network-observer-', 'azure-network-issuer-', 'azure-network-observation-'].some((prefix) =>
      file.path.startsWith(prefix),
    ),
  );
  if (required.some((file) => !paths.has(file.path)))
    throw Error('Azure operational parent: unclassified observer artifact');
  return decisions;
}

// plugins/azure/src/ce/network-replacement-operational-retirement-session.ts
// plugins/azure/src/ce/network-replacement-operational-session.ts
import { constants as constants10, constants as constants11 } from 'node:fs';
import {
  lstat as lstat18,
  lstat as lstat19,
  open as open7,
  open as open8,
  readdir as readdir19,
  readdir as readdir20,
  realpath as realpath18,
  realpath as realpath19,
} from 'node:fs/promises';
import { dirname, join as join19, join as join20 } from 'node:path';

// plugins/azure/src/ce/network-replacement-operational-provenance.ts
var same18 = canonicalEqual;
var sha10 = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require21(value, message) {
  if (!value) throw Error(`Azure replacement acquisition provenance: ${message}`);
}
function object13(value) {
  require21(value && typeof value === 'object' && !Array.isArray(value), 'complete replacement record required');
  return value;
}
function createAzureReplacementAcquisitionCollector(
  request,
  transport,
  cloud,
  storage,
  terraform,
  dependencies,
  trustedIssuerSha256,
  originalIssuerPublication,
  loadOriginalSource,
) {
  const plan = structuredClone(request),
    owner = structuredClone(storage.owner),
    directory = storage.directory,
    requestMatches = canonicalSnapshot(request);
  const validateSource = (source, expectedOwner) => {
    verifyAzureCePlan(source);
    verifyAzureTerraformNetworkReplacementProfile(source);
    require21(
      source.engine === 'terraform' && same18(azureUpgradeBinding(source).owner, expectedOwner),
      'owning Terraform replacement plan required',
    );
  };
  validateSource(plan, owner);
  const {
    loaders: originalLoaders,
    qualifyHistorical: historical,
    qualifyReplacementCompleted: completed,
  } = dependencies;
  const seal = () =>
    require21(
      requestMatches(request) &&
        requestMatches(plan) &&
        storage.directory === directory &&
        same18(storage.owner, owner) &&
        transport.engine === 'terraform' &&
        dependencies.loaders === originalLoaders &&
        dependencies.qualifyHistorical === historical &&
        dependencies.qualifyReplacementCompleted === completed,
      'owning replacement collector context changed',
    );
  const runtime = guardAzureCeApplyObject(transport, seal, {}, ['engine']),
    api = guardAzureCeApplyObject(cloud, seal),
    session = guardAzureCeApplyObject(terraform, seal),
    loaders = guardAzureCeApplyObject(dependencies.loaders, seal),
    guardedDependencies = guardAzureCeApplyObject(dependencies, seal),
    observer = Object.freeze({
      loaders,
      qualifyHistorical: guardedDependencies.qualifyHistorical,
      ...(completed ? { qualifyReplacementCompleted: guardedDependencies.qualifyReplacementCompleted } : {}),
    });
  return createAzureOperationalAcquisitionCustody(
    request,
    storage,
    {
      family: 'replacement',
      verifyContext: seal,
      validateSource,
      validatePurpose(purpose) {
        require21(purpose === 'preflight' || purpose === 'final', 'replacement purpose differs');
      },
      validateIdentity(raw, source, expectedOwner) {
        const identity = object13(raw),
          site = object13(identity.site),
          nodes = object13(identity.nodes);
        require21(
          same18(
            Object.keys(identity).sort(),
            [
              'owner',
              'planSha256',
              'journalSha256',
              'sourceBindingSha256',
              'configurationSha256',
              'site',
              'phase',
              'nodes',
            ].sort(),
          ) &&
            identity.planSha256 === source.planSha256 &&
            same18(identity.owner, expectedOwner) &&
            sha10(identity.journalSha256) &&
            sha10(identity.sourceBindingSha256) &&
            sha10(identity.configurationSha256) &&
            same18(Object.keys(site).sort(), ['siteConfigurationSha256', 'siteUid']) &&
            sha10(site.siteConfigurationSha256) &&
            typeof site.siteUid === 'string' &&
            site.siteUid.trim() &&
            (identity.phase === 'intact' || identity.phase === 'launched') &&
            same18(
              Object.keys(nodes).sort(),
              Array.from({ length: source.topology.nodeCount }, (_, i) => String(i + 1)).sort(),
            ),
          'entire resolved replacement identity required',
        );
      },
      validateReadings(raw, expected, source, expectedOwner) {
        const readings = object13(raw),
          identity = object13(expected);
        require21(
          readings.schemaVersion === 1 &&
            readings.scope === 'replacement-registration-interface-identity' &&
            same18(readings.owner, expectedOwner) &&
            readings.planSha256 === source.planSha256 &&
            readings.journalSha256 === identity.journalSha256 &&
            readings.sourceBindingSha256 === identity.sourceBindingSha256 &&
            readings.configurationSha256 === identity.configurationSha256 &&
            same18(readings.site, identity.site) &&
            readings.phase === identity.phase &&
            readings.purpose === (identity.phase === 'intact' ? 'preflight' : 'final') &&
            readings.expectedIdentitySha256 === canonicalSha256(expected) &&
            readings.expectedInventorySha256 === canonicalSha256(identity.nodes),
          'signed full replacement scope differs',
        );
      },
      collectReadings(identity, purpose, signal) {
        return collectAzureReplacementOperationalIdentity(
          plan,
          identity,
          runtime,
          api,
          storage,
          session,
          observer,
          purpose,
          signal,
        );
      },
    },
    trustedIssuerSha256,
    originalIssuerPublication,
    loadOriginalSource,
  );
}

// plugins/azure/src/ce/network-replacement-operational-session.ts
var toolType = 'azure-ce-replacement-operational-issuer';
var suffix2 = `.${toolType}.log`;
var same19 = canonicalEqual;
var sha11 = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require22(value, reason) {
  if (!value) throw Error(`Azure replacement operational issuer session: ${reason}`);
}
async function createAzureReplacementAcquisitionSession(
  request,
  runtime,
  api,
  store,
  terraform,
  dependencies,
  session,
  signal,
) {
  const plan = structuredClone(request),
    owner = structuredClone(store.owner),
    directory = session.getArtifactsDir(),
    sessionId = session.getSessionId(),
    privateDirectory = store.directory;
  require22(typeof directory === 'string' && directory.startsWith('/'), 'persistent native session required');
  verifyAzureTerraformNetworkReplacementProfile(plan);
  require22(
    plan.engine === 'terraform' &&
      plan.intent.operation === 'replace-node' &&
      same19(owner, azureUpgradeBinding(plan).owner),
    'owning network-bound replacement plan required',
  );
  const callbacks = [
    session.getSessionId,
    session.getArtifactsDir,
    session.getArtifactPath,
    session.saveArtifact,
    store.verify,
    store.read,
  ];
  const seal = () => {
    signal?.throwIfAborted();
    require22(
      same19(request, plan) &&
        same19(store.owner, owner) &&
        store.directory === privateDirectory &&
        session.getSessionId() === sessionId &&
        session.getArtifactsDir() === directory &&
        same19(owner, azureUpgradeBinding(plan).owner) &&
        callbacks.every(
          (fn, i) =>
            fn ===
            [
              session.getSessionId,
              session.getArtifactsDir,
              session.getArtifactPath,
              session.saveArtifact,
              store.verify,
              store.read,
            ][i],
        ),
      'owning session changed',
    );
  };
  const identities = new Map();
  let rootIdentity, privateIdentity, retained;
  const bounded = async (work, parent) => {
    const active = AbortSignal.any([
      AbortSignal.timeout(180000),
      ...(signal ? [signal] : []),
      ...(parent ? [parent] : []),
    ]);
    const step = async (task) => {
      seal();
      active.throwIfAborted();
      const aborted = Promise.withResolvers(),
        onAbort = () => aborted.reject(active.reason);
      active.addEventListener('abort', onAbort, { once: true });
      try {
        const value = await Promise.race([Promise.resolve().then(task), aborted.promise]);
        seal();
        active.throwIfAborted();
        return value;
      } finally {
        active.removeEventListener('abort', onAbort);
      }
    };
    return step(() => work(active));
  };
  const verifyPrivateDirectory = async () => {
    const root = await lstat18(privateDirectory);
    require22(
      root.isDirectory() &&
        !root.isSymbolicLink() &&
        root.uid === process.getuid?.() &&
        (root.mode & 63) === 0 &&
        (await realpath18(privateDirectory)) === privateDirectory,
      'private signing directory custody differs',
    );
    const identity = `${root.dev}:${root.ino}:${root.birthtimeMs}`;
    require22(privateIdentity === undefined || privateIdentity === identity, 'private signing directory replaced');
    privateIdentity = identity;
  };
  const readPins = async (active) => {
    active.throwIfAborted();
    seal();
    await verifyPrivateDirectory();
    await store.verify();
    const root = await lstat18(directory);
    require22(
      root.isDirectory() &&
        !root.isSymbolicLink() &&
        root.uid === process.getuid?.() &&
        (root.mode & 18) === 0 &&
        (await realpath18(directory)) === directory,
      'native session directory custody differs',
    );
    const identity = `${root.dev}:${root.ino}:${root.birthtimeMs}`;
    require22(rootIdentity === undefined || rootIdentity === identity, 'native session directory replaced');
    rootIdentity = identity;
    const original = await loadPlanArtifact(session, plan.planId, plan.planSha256);
    require22(same19(original.plan, plan), 'owning public source differs');
    const names = (await readdir19(directory)).filter((n) => n.endsWith(suffix2)).sort();
    const observed = [];
    for (const name of names) {
      active.throwIfAborted();
      seal();
      const path = join19(directory, name),
        file = await open7(path, constants10.O_RDONLY | constants10.O_NOFOLLOW);
      let raw;
      try {
        const before = await file.stat();
        require22(
          before.isFile() &&
            before.uid === process.getuid?.() &&
            before.nlink === 1 &&
            (before.mode & 18) === 0 &&
            before.size <= 131072,
          'issuer artifact custody differs',
        );
        raw = await file.readFile('utf8');
        const after = await file.stat(),
          named = await lstat18(path);
        const fileIdentity = (v) =>
          `${v.dev}:${v.ino}:${v.size}:${v.mtimeMs}:${v.ctimeMs}:${v.birthtimeMs}:${v.uid}:${v.nlink}:${v.mode}`;
        require22(
          named.isFile() &&
            !named.isSymbolicLink() &&
            fileIdentity(before) === fileIdentity(after) &&
            fileIdentity(after) === fileIdentity(named),
          'issuer artifact changed while read',
        );
        const custody = canonicalSha256({ identity: fileIdentity(after), raw });
        require22(!identities.has(path) || identities.get(path) === custody, 'original issuer artifact changed');
        identities.set(path, custody);
      } finally {
        await file.close();
      }
      const row = parseNodeHealthJson(raw);
      require22(
        same19(
          Object.keys(row).sort(),
          ['engine', 'issuerSha256', 'kind', 'owner', 'planId', 'planSha256', 'schemaVersion'].sort(),
        ) &&
          row.schemaVersion === 1 &&
          row.engine === 'terraform' &&
          row.kind === 'azure-replacement-operational-issuer-binding' &&
          sha11(row.issuerSha256) &&
          sha11(row.planSha256) &&
          typeof row.planId === 'string',
        'issuer binding schema differs',
      );
      if (!same19(row.owner, owner)) continue;
      const source = await loadPlanArtifact(session, row.planId, row.planSha256);
      verifyAzureTerraformNetworkReplacementProfile(source.plan);
      require22(
        source.plan.engine === 'terraform' &&
          source.plan.intent.operation === 'replace-node' &&
          same19(azureUpgradeBinding(source.plan).owner, owner),
        'issuer source ownership differs',
      );
      observed.push(row.issuerSha256);
    }
    require22(
      same19(names, (await readdir19(directory)).filter((n) => n.endsWith(suffix2)).sort()),
      'issuer namespace changed while read',
    );
    const final = await lstat18(directory);
    require22(
      final.isDirectory() &&
        !final.isSymbolicLink() &&
        final.uid === process.getuid?.() &&
        (final.mode & 18) === 0 &&
        `${final.dev}:${final.ino}:${final.birthtimeMs}` === rootIdentity &&
        (await realpath18(directory)) === directory,
      'native session directory changed',
    );
    active.throwIfAborted();
    seal();
    await verifyPrivateDirectory();
    const pins = [...new Set(observed)];
    require22(pins.length <= 1, 'conflicting original issuer pins');
    return pins[0];
  };
  retained = await bounded(readPins);
  let pointer;
  try {
    pointer = await store.read('azure-replacement-observer-issuer.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  require22(pointer === undefined || retained !== undefined, 'original public issuer pin unavailable');
  const originalIssuerPublication = async (issuerSha256, active) => {
    require22(sha11(issuerSha256) && (retained === undefined || retained === issuerSha256), 'original issuer changed');
    const before = await readPins(active);
    require22(before === undefined || before === issuerSha256, 'published issuer changed');
    if (before === undefined) {
      const record = {
        schemaVersion: 1,
        kind: 'azure-replacement-operational-issuer-binding',
        engine: 'terraform',
        owner,
        planId: plan.planId,
        planSha256: plan.planSha256,
        issuerSha256,
      };
      const id = await session.saveArtifact(JSON.stringify(record), toolType);
      require22(typeof id === 'string' && id.length > 0, 'original issuer publication not acknowledged');
      const path = await session.getArtifactPath(id);
      require22(
        typeof path === 'string' && dirname(path) === directory && path.endsWith(suffix2),
        'original issuer publication path differs',
      );
    }
    require22((await readPins(active)) === issuerSha256, 'original issuer publication unavailable');
    retained = issuerSha256;
  };
  const collector = createAzureReplacementAcquisitionCollector(
    request,
    runtime,
    api,
    store,
    terraform,
    dependencies,
    retained,
    originalIssuerPublication,
    async (planSha256, active) => {
      active.throwIfAborted();
      seal();
      const source = await loadPlanArtifact(session, `azure-ce-${planSha256.slice(0, 24)}`, planSha256);
      verifyAzureTerraformNetworkReplacementProfile(source.plan);
      active.throwIfAborted();
      seal();
      require22(
        source.plan.engine === 'terraform' &&
          source.plan.intent.operation === 'replace-node' &&
          same19(azureUpgradeBinding(source.plan).owner, owner),
        'original observation source ownership differs',
      );
      return source.plan;
    },
  );
  const check = async (active) => {
    require22((await readPins(active)) === retained, 'original public issuer binding changed');
  };
  return Object.freeze({
    authenticateRetirementInventory(parent) {
      return bounded(async (active) => {
        require22(retained !== undefined, 'original public issuer pin unavailable');
        await check(active);
        const result = await collector.authenticateRetirementInventory(active);
        await check(active);
        return result;
      }, parent);
    },
    collect(...args) {
      return bounded(async (active) => {
        await check(active);
        const result = await collector.collect(args[0], args[1], active, args[3]);
        await check(active);
        require22(retained === result.issuerSha256, 'acquisition issuer was not published');
        return result;
      }, args[2]);
    },
    authenticate(...args) {
      return bounded(async (active) => {
        require22(retained !== undefined, 'original public issuer pin unavailable');
        await check(active);
        const result = await collector.authenticate(args[0], args[1], args[2], args[3], active);
        await check(active);
        return result;
      }, args[4]);
    },
    retireSigningMaterial(parent) {
      return bounded(async (active) => {
        require22(retained !== undefined, 'original public issuer pin unavailable');
        await check(active);
        const result = await collector.retireSigningMaterial(active);
        await check(active);
        return result;
      }, parent);
    },
  });
}

// plugins/azure/src/ce/network-replacement-operational-retirement-session.ts
var same20 = canonicalEqual;
var digest2 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
var suffix3 = '.azure-ce-replacement-operational-issuer.log';
var observerName2 = (name) =>
  ['azure-replacement-observer-', 'azure-replacement-issuer-', 'azure-replacement-observation-'].some((prefix) =>
    name.startsWith(prefix),
  );
function require23(value, message) {
  if (!value) throw Error(`Azure replacement operational retirement session: ${message}`);
}
var sessions2 = new WeakMap();
async function createAzureReplacementOperationalRetirementSession(
  request,
  transport,
  cloud,
  storage,
  terraform,
  dependencies,
  publicSession,
  signal,
) {
  const original = structuredClone(request),
    requestMatches = canonicalSnapshot(original),
    owner = structuredClone(storage.owner),
    directory = storage.directory;
  verifyAzureCePlan(original);
  require23(
    original.engine === 'terraform' &&
      original.intent.operation === 'deploy' &&
      same20(azureUpgradeBinding(original).owner, owner),
    'original Terraform deployment required',
  );
  const publicDirectory = publicSession.getArtifactsDir(),
    sessionId = publicSession.getSessionId();
  require23(
    typeof publicDirectory === 'string' && publicDirectory.startsWith('/'),
    'persistent original public session required',
  );
  const callbacks = [
    publicSession.getSessionId,
    publicSession.getArtifactsDir,
    publicSession.getArtifactPath,
    publicSession.saveArtifact,
  ];
  const storeCallbacks = [storage.verify, storage.read, storage.write, storage.remove];
  const seal = () => {
    signal?.throwIfAborted();
    require23(
      requestMatches(request) &&
        requestMatches(original) &&
        same20(storage.owner, owner) &&
        storage.directory === directory &&
        transport.engine === 'terraform' &&
        publicSession.getSessionId() === sessionId &&
        publicSession.getArtifactsDir() === publicDirectory &&
        callbacks.every(
          (fn, i) =>
            fn ===
            [
              publicSession.getSessionId,
              publicSession.getArtifactsDir,
              publicSession.getArtifactPath,
              publicSession.saveArtifact,
            ][i],
        ) &&
        storeCallbacks.every((fn, i) => fn === [storage.verify, storage.read, storage.write, storage.remove][i]),
      'owning deployment or callbacks changed',
    );
  };
  const store = guardAzureCeApplyObject(storage, seal, {}, ['owner', 'directory']);
  const runtime = guardAzureCeApplyObject(transport, seal, {}, ['engine']);
  const api = guardAzureCeApplyObject(cloud, seal);
  let privateIdentity, publicIdentity;
  const fileIdentities = new Map();
  const bounded = async (work, parent) => {
    const active = AbortSignal.any([
      AbortSignal.timeout(180000),
      ...(signal ? [signal] : []),
      ...(parent ? [parent] : []),
    ]);
    seal();
    active.throwIfAborted();
    const aborted = Promise.withResolvers(),
      onAbort = () => aborted.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([work(active), aborted.promise]);
      active.throwIfAborted();
      seal();
      return value;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  const inspect = async (active) => {
    seal();
    active.throwIfAborted();
    await store.verify();
    const root = await lstat19(directory),
      native = await lstat19(publicDirectory);
    require23(
      root.isDirectory() &&
        !root.isSymbolicLink() &&
        root.uid === process.getuid?.() &&
        (root.mode & 63) === 0 &&
        (await realpath19(directory)) === directory,
      'private directory custody differs',
    );
    require23(
      native.isDirectory() &&
        !native.isSymbolicLink() &&
        native.uid === process.getuid?.() &&
        (native.mode & 18) === 0 &&
        (await realpath19(publicDirectory)) === publicDirectory,
      'public directory custody differs',
    );
    const identity = (value) => `${value.dev}:${value.ino}:${value.birthtimeMs}`;
    require23(
      (privateIdentity === undefined || privateIdentity === identity(root)) &&
        (publicIdentity === undefined || publicIdentity === identity(native)),
      'owning directory replaced',
    );
    privateIdentity = identity(root);
    publicIdentity = identity(native);
    const source = await loadPlanArtifact(publicSession, original.planId, original.planSha256);
    require23(same20(source.plan, original), 'original public deployment differs');
    const names = (await readdir20(publicDirectory)).filter((name) => name.endsWith(suffix3)).sort();
    const bindings = [];
    for (const name of names) {
      active.throwIfAborted();
      seal();
      const path = join20(publicDirectory, name),
        handle = await open8(path, constants11.O_RDONLY | constants11.O_NOFOLLOW | constants11.O_NONBLOCK);
      let raw;
      try {
        const before = await handle.stat();
        require23(
          before.isFile() &&
            before.uid === process.getuid?.() &&
            before.nlink === 1 &&
            (before.mode & 18) === 0 &&
            before.size <= 131072,
          'public issuer file custody differs',
        );
        raw = await handle.readFile('utf8');
        const after = await handle.stat(),
          named = await lstat19(path);
        const stamp = (value) =>
          `${value.dev}:${value.ino}:${value.birthtimeMs}:${value.size}:${value.mtimeMs}:${value.ctimeMs}:${value.uid}:${value.mode}:${value.nlink}`;
        require23(
          named.isFile() && !named.isSymbolicLink() && stamp(before) === stamp(after) && stamp(after) === stamp(named),
          'public issuer file changed',
        );
        const retained = canonicalSha256({ stamp: stamp(named), raw });
        require23(
          !fileIdentities.has(path) || fileIdentities.get(path) === retained,
          'original public issuer replaced',
        );
        fileIdentities.set(path, retained);
      } finally {
        await handle.close();
      }
      const row = parseNodeHealthJson(raw);
      require23(
        same20(
          Object.keys(row).sort(),
          ['schemaVersion', 'kind', 'engine', 'owner', 'planId', 'planSha256', 'issuerSha256'].sort(),
        ) &&
          row.schemaVersion === 1 &&
          row.kind === 'azure-replacement-operational-issuer-binding' &&
          row.engine === 'terraform' &&
          typeof row.planId === 'string' &&
          digest2(row.planSha256) &&
          digest2(row.issuerSha256),
        'original public issuer schema differs',
      );
      if (!same20(row.owner, owner)) continue;
      const candidate = (await loadPlanArtifact(publicSession, row.planId, row.planSha256)).plan;
      const profile = verifyAzureTerraformNetworkReplacementProfile(candidate);
      require23(
        candidate.engine === 'terraform' &&
          candidate.intent.operation === 'replace-node' &&
          same20(azureUpgradeBinding(candidate), azureUpgradeBinding(original)) &&
          same20(azureTerraformNetworkScope(candidate, true), azureTerraformNetworkScope(original, true)) &&
          profile.originalPlanSha256 === original.planSha256,
        'original issuer replacement source differs from deployment',
      );
      bindings.push({ issuerSha256: row.issuerSha256, source: candidate });
    }
    require23(
      same20(names, (await readdir20(publicDirectory)).filter((name) => name.endsWith(suffix3)).sort()),
      'public issuer namespace changed',
    );
    const pins = [...new Set(bindings.map((row) => row.issuerSha256))];
    require23(pins.length <= 1, 'conflicting original public issuers');
    const privateNames = (await readdir20(directory)).filter(observerName2).sort();
    require23(bindings.length > 0 || privateNames.length === 0, 'observer artifacts have no original public issuer');
    const finalPrivate = await lstat19(directory),
      finalPublic = await lstat19(publicDirectory);
    require23(
      identity(finalPrivate) === privateIdentity &&
        identity(finalPublic) === publicIdentity &&
        (finalPrivate.mode & 63) === 0 &&
        (finalPublic.mode & 18) === 0,
      'directory custody changed during source inspection',
    );
    active.throwIfAborted();
    seal();
    return { bindings, privateNames };
  };
  const opening = await bounded(inspect);
  const acquisition = opening.bindings.length
    ? await createAzureReplacementAcquisitionSession(
        opening.bindings[0].source,
        runtime,
        api,
        store,
        terraform,
        dependencies,
        publicSession,
        signal,
      )
    : undefined;
  const sameBindings = (value) =>
    same20(
      value.bindings.map((row) => ({ issuerSha256: row.issuerSha256, sourcePlanSha256: row.source.planSha256 })),
      opening.bindings.map((row) => ({ issuerSha256: row.issuerSha256, sourcePlanSha256: row.source.planSha256 })),
    );
  const absent = async (active) => {
    const claim = acquireProcessLock(join20(directory, '.azure-replacement-operational-acquisition-lock'));
    let release;
    try {
      const aborted = Promise.withResolvers(),
        onAbort = () => aborted.reject(active.reason);
      active.addEventListener('abort', onAbort, { once: true });
      try {
        release = await Promise.race([claim, aborted.promise]);
      } finally {
        active.removeEventListener('abort', onAbort);
      }
    } catch (error) {
      await claim.then(
        (unlock) => unlock(),
        () => {},
      );
      throw error;
    }
    try {
      const first = await inspect(active),
        last = await inspect(active);
      require23(
        sameBindings(first) && sameBindings(last) && !first.privateNames.length && !last.privateNames.length,
        'observer absence changed',
      );
      return {
        status: 'authenticated',
        scope: 'owning-observer-artifact-disposition',
        owner: structuredClone(owner),
        issuerSha256: null,
        observerState: 'absent',
        artifacts: [],
        signingMaterialPresent: false,
        operationalAcceptance: 'unknown',
        canSatisfyInterfaceMutationGate: false,
      };
    } finally {
      await release();
    }
  };
  const read = (parent) =>
    bounded(async (active) => {
      if (!acquisition) return absent(active);
      require23(sameBindings(await inspect(active)), 'original source binding changed');
      const inventory = await acquisition.authenticateRetirementInventory(active);
      require23(sameBindings(await inspect(active)), 'original source binding changed');
      return { ...inventory, observerState: 'present' };
    }, parent);
  const facade = Object.freeze({
    authenticateRetirementInventory: read,
    retireSigningMaterial(parent) {
      return bounded(async (active) => {
        if (!acquisition)
          return {
            status: 'absent',
            scope: 'operational-observer-signing-material',
            artifactInventory: await absent(active),
          };
        require23(sameBindings(await inspect(active)), 'original source binding changed');
        const retired = await acquisition.retireSigningMaterial(active);
        require23(sameBindings(await inspect(active)), 'original source binding changed');
        return {
          status: retired.status,
          scope: retired.scope,
          artifactInventory: { ...retired.artifactInventory, observerState: 'present' },
        };
      }, parent);
    },
  });
  sessions2.set(facade, { source: original, store: storage, publicSession, read });
  return facade;
}
async function readAuthenticatedAzureReplacementOperationalRetirementInventory(
  candidate,
  original,
  store,
  publicSession,
  signal,
) {
  const bound = candidate && typeof candidate === 'object' ? sessions2.get(candidate) : undefined;
  require23(
    bound &&
      same20(bound.source, original) &&
      bound.publicSession === publicSession &&
      bound.store.directory === store.directory &&
      same20(bound.store.owner, store.owner),
    'genuine owning retirement session required',
  );
  return bound.read(signal);
}

// plugins/azure/src/ce/network-replacement-operational-parent-disposition.ts
async function collectAzureReplacementOperationalParentDispositions(
  original,
  store,
  publicSession,
  snapshot,
  session,
  signal,
) {
  const observed = await readAuthenticatedAzureReplacementOperationalRetirementInventory(
    session,
    original,
    store,
    publicSession,
    signal,
  );
  if (observed.signingMaterialPresent)
    throw Error('Azure replacement operational parent: signing material still present');
  const byPath = new Map(snapshot.map((file) => [file.path, file]));
  if (byPath.size !== snapshot.length) throw Error('Azure replacement operational parent: duplicate native file');
  const paths = new Set();
  const decisions = observed.artifacts.map((artifact) => {
    const file = byPath.get(artifact.path);
    if (
      !file ||
      paths.has(artifact.path) ||
      artifact.action !== 'preserve' ||
      file.identity !== artifact.identity ||
      file.sha256 !== artifact.sha256 ||
      file.packetSha256 !== artifact.packetSha256
    )
      throw Error('Azure replacement operational parent: original authenticated artifact differs from native snapshot');
    paths.add(artifact.path);
    return {
      ...file,
      action: 'preserve',
      schema: artifact.schema,
      semanticProvenanceSha256: artifact.semanticProvenanceSha256,
    };
  });
  const required = snapshot.filter((file) =>
    ['azure-replacement-observer-', 'azure-replacement-issuer-', 'azure-replacement-observation-'].some((prefix) =>
      file.path.startsWith(prefix),
    ),
  );
  if (required.some((file) => !paths.has(file.path)))
    throw Error('Azure replacement operational parent: unclassified observer artifact');
  return decisions;
}

// plugins/azure/src/ce/network-replacement-readings-retirement-session.ts
import { constants as constants12 } from 'node:fs';
import { lstat as lstat20, open as open9, readdir as readdir21, realpath as realpath20 } from 'node:fs/promises';
import { join as join21 } from 'node:path';

var same21 = canonicalEqual;
var digest3 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
var suffix4 = '.azure-ce-replacement-readings-operational-issuer.log';
var observerName3 = (name) =>
  [
    'azure-replacement-readings-observer-',
    'azure-replacement-readings-issuer-',
    'azure-replacement-readings-observation-',
  ].some((prefix) => name.startsWith(prefix));
function require24(value, message) {
  if (!value) throw Error(`Azure replacement readings operational retirement session: ${message}`);
}
var sessions3 = new WeakMap();
async function createAzureReplacementReadingsOperationalRetirementSession(
  request,
  transport,
  cloud,
  storage,
  terraform,
  dependencies,
  publicSession,
  signal,
) {
  const original = structuredClone(request),
    requestMatches = canonicalSnapshot(original),
    owner = structuredClone(storage.owner),
    directory = storage.directory;
  verifyAzureCePlan(original);
  require24(
    original.engine === 'terraform' &&
      original.intent.operation === 'deploy' &&
      same21(azureUpgradeBinding(original).owner, owner),
    'original Terraform deployment required',
  );
  const publicDirectory = publicSession.getArtifactsDir(),
    sessionId = publicSession.getSessionId();
  require24(
    typeof publicDirectory === 'string' && publicDirectory.startsWith('/'),
    'persistent original public session required',
  );
  const callbacks = [
    publicSession.getSessionId,
    publicSession.getArtifactsDir,
    publicSession.getArtifactPath,
    publicSession.saveArtifact,
  ];
  const storeCallbacks = [storage.verify, storage.read, storage.write, storage.remove];
  const seal = () => {
    signal?.throwIfAborted();
    require24(
      requestMatches(request) &&
        requestMatches(original) &&
        same21(storage.owner, owner) &&
        storage.directory === directory &&
        transport.engine === 'terraform' &&
        publicSession.getSessionId() === sessionId &&
        publicSession.getArtifactsDir() === publicDirectory &&
        callbacks.every(
          (fn, i) =>
            fn ===
            [
              publicSession.getSessionId,
              publicSession.getArtifactsDir,
              publicSession.getArtifactPath,
              publicSession.saveArtifact,
            ][i],
        ) &&
        storeCallbacks.every((fn, i) => fn === [storage.verify, storage.read, storage.write, storage.remove][i]),
      'owning deployment or callbacks changed',
    );
  };
  const store = guardAzureCeApplyObject(storage, seal, {}, ['owner', 'directory']);
  const runtime = guardAzureCeApplyObject(transport, seal, {}, ['engine']);
  const api = guardAzureCeApplyObject(cloud, seal);
  let privateIdentity, publicIdentity;
  const fileIdentities = new Map();
  const bounded = async (work, parent) => {
    const active = AbortSignal.any([
      AbortSignal.timeout(180000),
      ...(signal ? [signal] : []),
      ...(parent ? [parent] : []),
    ]);
    seal();
    active.throwIfAborted();
    const aborted = Promise.withResolvers(),
      onAbort = () => aborted.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([work(active), aborted.promise]);
      active.throwIfAborted();
      seal();
      return value;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  const inspect = async (active) => {
    seal();
    active.throwIfAborted();
    await store.verify();
    const root = await lstat20(directory),
      native = await lstat20(publicDirectory);
    require24(
      root.isDirectory() &&
        !root.isSymbolicLink() &&
        root.uid === process.getuid?.() &&
        (root.mode & 63) === 0 &&
        (await realpath20(directory)) === directory,
      'private directory custody differs',
    );
    require24(
      native.isDirectory() &&
        !native.isSymbolicLink() &&
        native.uid === process.getuid?.() &&
        (native.mode & 18) === 0 &&
        (await realpath20(publicDirectory)) === publicDirectory,
      'public directory custody differs',
    );
    const identity = (value) => `${value.dev}:${value.ino}:${value.birthtimeMs}`;
    require24(
      (privateIdentity === undefined || privateIdentity === identity(root)) &&
        (publicIdentity === undefined || publicIdentity === identity(native)),
      'owning directory replaced',
    );
    privateIdentity = identity(root);
    publicIdentity = identity(native);
    const source = await loadPlanArtifact(publicSession, original.planId, original.planSha256);
    require24(same21(source.plan, original), 'original public deployment differs');
    const names = (await readdir21(publicDirectory)).filter((name) => name.endsWith(suffix4)).sort();
    const bindings = [];
    for (const name of names) {
      active.throwIfAborted();
      seal();
      const path = join21(publicDirectory, name),
        handle = await open9(path, constants12.O_RDONLY | constants12.O_NOFOLLOW | constants12.O_NONBLOCK);
      let raw;
      try {
        const before = await handle.stat();
        require24(
          before.isFile() &&
            before.uid === process.getuid?.() &&
            before.nlink === 1 &&
            (before.mode & 18) === 0 &&
            before.size <= 131072,
          'public issuer file custody differs',
        );
        raw = await handle.readFile('utf8');
        const after = await handle.stat(),
          named = await lstat20(path);
        const stamp = (value) =>
          `${value.dev}:${value.ino}:${value.birthtimeMs}:${value.size}:${value.mtimeMs}:${value.ctimeMs}:${value.uid}:${value.mode}:${value.nlink}`;
        require24(
          named.isFile() && !named.isSymbolicLink() && stamp(before) === stamp(after) && stamp(after) === stamp(named),
          'public issuer file changed',
        );
        const retained = canonicalSha256({ stamp: stamp(named), raw });
        require24(
          !fileIdentities.has(path) || fileIdentities.get(path) === retained,
          'original public issuer replaced',
        );
        fileIdentities.set(path, retained);
      } finally {
        await handle.close();
      }
      const row = parseNodeHealthJson(raw);
      require24(
        same21(
          Object.keys(row).sort(),
          ['schemaVersion', 'kind', 'engine', 'owner', 'planId', 'planSha256', 'issuerSha256'].sort(),
        ) &&
          row.schemaVersion === 1 &&
          row.kind === 'azure-replacement-readings-operational-issuer-binding' &&
          row.engine === 'terraform' &&
          typeof row.planId === 'string' &&
          digest3(row.planSha256) &&
          digest3(row.issuerSha256),
        'original public issuer schema differs',
      );
      if (!same21(row.owner, owner)) continue;
      const candidate = (await loadPlanArtifact(publicSession, row.planId, row.planSha256)).plan;
      const profile = verifyAzureTerraformNetworkReplacementProfile(candidate);
      require24(
        candidate.engine === 'terraform' &&
          candidate.intent.operation === 'replace-node' &&
          same21(azureUpgradeBinding(candidate), azureUpgradeBinding(original)) &&
          same21(azureTerraformNetworkScope(candidate, true), azureTerraformNetworkScope(original, true)) &&
          profile.originalPlanSha256 === original.planSha256,
        'original issuer replacement source differs from deployment',
      );
      bindings.push({ issuerSha256: row.issuerSha256, source: candidate });
    }
    require24(
      same21(names, (await readdir21(publicDirectory)).filter((name) => name.endsWith(suffix4)).sort()),
      'public issuer namespace changed',
    );
    const pins = [...new Set(bindings.map((row) => row.issuerSha256))];
    require24(pins.length <= 1, 'conflicting original public issuers');
    const privateNames = (await readdir21(directory)).filter(observerName3).sort();
    require24(bindings.length > 0 || privateNames.length === 0, 'observer artifacts have no original public issuer');
    const finalPrivate = await lstat20(directory),
      finalPublic = await lstat20(publicDirectory);
    require24(
      identity(finalPrivate) === privateIdentity &&
        identity(finalPublic) === publicIdentity &&
        (finalPrivate.mode & 63) === 0 &&
        (finalPublic.mode & 18) === 0,
      'directory custody changed during source inspection',
    );
    active.throwIfAborted();
    seal();
    return { bindings, privateNames };
  };
  const opening = await bounded(inspect);
  const acquisition = opening.bindings.length
    ? await createAzureReplacementReadingsAcquisitionSession(
        opening.bindings[0].source,
        runtime,
        api,
        store,
        terraform,
        dependencies,
        publicSession,
        signal,
      )
    : undefined;
  const sameBindings = (value) =>
    same21(
      value.bindings.map((row) => ({ issuerSha256: row.issuerSha256, sourcePlanSha256: row.source.planSha256 })),
      opening.bindings.map((row) => ({ issuerSha256: row.issuerSha256, sourcePlanSha256: row.source.planSha256 })),
    );
  const absent = async (active) => {
    const claim = acquireProcessLock(join21(directory, '.azure-replacement-readings-operational-acquisition-lock'));
    let release;
    try {
      const aborted = Promise.withResolvers(),
        onAbort = () => aborted.reject(active.reason);
      active.addEventListener('abort', onAbort, { once: true });
      try {
        release = await Promise.race([claim, aborted.promise]);
      } finally {
        active.removeEventListener('abort', onAbort);
      }
    } catch (error) {
      await claim.then(
        (unlock) => unlock(),
        () => {},
      );
      throw error;
    }
    try {
      const first = await inspect(active),
        last = await inspect(active);
      require24(
        sameBindings(first) && sameBindings(last) && !first.privateNames.length && !last.privateNames.length,
        'observer absence changed',
      );
      return {
        status: 'authenticated',
        scope: 'owning-observer-artifact-disposition',
        owner: structuredClone(owner),
        issuerSha256: null,
        observerState: 'absent',
        artifacts: [],
        signingMaterialPresent: false,
        operationalAcceptance: 'unknown',
        canSatisfyInterfaceMutationGate: false,
      };
    } finally {
      await release();
    }
  };
  const read = (parent) =>
    bounded(async (active) => {
      if (!acquisition) return absent(active);
      require24(sameBindings(await inspect(active)), 'original source binding changed');
      const inventory = await acquisition.authenticateRetirementInventory(active);
      require24(sameBindings(await inspect(active)), 'original source binding changed');
      return { ...inventory, observerState: 'present' };
    }, parent);
  const facade = Object.freeze({
    authenticateRetirementInventory: read,
    retireSigningMaterial(parent) {
      return bounded(async (active) => {
        if (!acquisition)
          return {
            status: 'absent',
            scope: 'operational-observer-signing-material',
            artifactInventory: await absent(active),
          };
        require24(sameBindings(await inspect(active)), 'original source binding changed');
        const retired = await acquisition.retireSigningMaterial(active);
        require24(sameBindings(await inspect(active)), 'original source binding changed');
        return {
          status: retired.status,
          scope: retired.scope,
          artifactInventory: { ...retired.artifactInventory, observerState: 'present' },
        };
      }, parent);
    },
  });
  sessions3.set(facade, { source: original, store: storage, publicSession, read });
  return facade;
}
async function readAuthenticatedAzureReplacementReadingsOperationalRetirementInventory(
  candidate,
  original,
  store,
  publicSession,
  signal,
) {
  const bound = candidate && typeof candidate === 'object' ? sessions3.get(candidate) : undefined;
  require24(
    bound &&
      same21(bound.source, original) &&
      bound.publicSession === publicSession &&
      bound.store.directory === store.directory &&
      same21(bound.store.owner, store.owner),
    'genuine owning retirement session required',
  );
  return bound.read(signal);
}

// plugins/azure/src/ce/network-replacement-readings-parent-disposition.ts
async function collectAzureReplacementReadingsOperationalParentDispositions(
  original,
  store,
  publicSession,
  snapshot,
  session,
  signal,
) {
  const observed = await readAuthenticatedAzureReplacementReadingsOperationalRetirementInventory(
    session,
    original,
    store,
    publicSession,
    signal,
  );
  if (observed.signingMaterialPresent)
    throw Error('Azure replacement readings operational parent: signing material still present');
  const byPath = new Map(snapshot.map((file) => [file.path, file]));
  if (byPath.size !== snapshot.length)
    throw Error('Azure replacement readings operational parent: duplicate native file');
  const paths = new Set();
  const decisions = observed.artifacts.map((artifact) => {
    const file = byPath.get(artifact.path);
    if (
      !file ||
      paths.has(artifact.path) ||
      artifact.action !== 'preserve' ||
      file.identity !== artifact.identity ||
      file.sha256 !== artifact.sha256 ||
      file.packetSha256 !== artifact.packetSha256
    )
      throw Error(
        'Azure replacement readings operational parent: original authenticated artifact differs from native snapshot',
      );
    paths.add(artifact.path);
    return {
      ...file,
      action: 'preserve',
      schema: artifact.schema,
      semanticProvenanceSha256: artifact.semanticProvenanceSha256,
    };
  });
  const required = snapshot.filter((file) =>
    [
      'azure-replacement-readings-observer-',
      'azure-replacement-readings-issuer-',
      'azure-replacement-readings-observation-',
    ].some((prefix) => file.path.startsWith(prefix)),
  );
  if (required.some((file) => !paths.has(file.path)))
    throw Error('Azure replacement readings operational parent: unclassified observer artifact');
  return decisions;
}

// plugins/azure/src/ce/terraform-pending-import-provenance.ts
import { createHash as createHash21 } from 'node:crypto';
import { join as join22 } from 'node:path';

var hash16 = (v) => createHash21('sha256').update(v).digest('hex');
var same22 = (a, b) => canonicalEqual({ value: a }, { value: b });
var sha12 = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require25(v, message) {
  if (!v) throw Error(`Azure pending import provenance: ${message}`);
}
function object14(v) {
  require25(v && typeof v === 'object' && !Array.isArray(v), 'record required');
  return v;
}
function keys6(v, fields) {
  require25(same22(Object.keys(object14(v)).sort(), fields.toSorted()), 'schema fields differ');
}
async function readAzureTerraformPendingImportProvenance(request, store, session, signal, emptyMainAdmission) {
  const base = structuredClone(request),
    owner = structuredClone(store.owner),
    directory = store.directory,
    admittedWitness = emptyMainAdmission?.witness,
    admittedContext = emptyMainAdmission?.context,
    admittedDigest = admittedWitness ? canonicalSha256(admittedWitness) : undefined;
  const dependencies = [
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'verify', value: store.verify },
    { target: session, key: 'readPlanApplicationHistory', value: session.readPlanApplicationHistory },
    { target: session, key: 'readPlanJournalInventory', value: session.readPlanJournalInventory },
  ];
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require25(
      same22(request, base) &&
        same22(store.owner, owner) &&
        store.directory === directory &&
        emptyMainAdmission?.witness === admittedWitness &&
        emptyMainAdmission?.context === admittedContext &&
        (!admittedWitness || canonicalSha256(admittedWitness) === admittedDigest) &&
        dependencies.every((row) => Reflect.get(row.target, row.key) === row.value),
      'owning input or observer changed',
    );
  };
  const step = async (action) => {
    seal();
    const aborted = Promise.withResolvers();
    const onAbort = () => aborted.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([action(), aborted.promise]);
      seal();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const recheckCancellation = async () => {
    if (emptyMainAdmission)
      await step(() =>
        recheckAzureTerraformNetworkEmptyMainBinding(
          emptyMainAdmission.witness,
          base.planSha256,
          store,
          emptyMainAdmission.context,
          deadline,
        ),
      );
  };
  verifyAzureCePlan(base);
  require25(
    base.engine === 'terraform' &&
      same22(owner, azureUpgradeBinding(base).owner) &&
      session.readPlanApplicationHistory &&
      session.readPlanJournalInventory,
    'owning native observers required',
  );
  const readHistory = session.readPlanApplicationHistory.bind(session),
    readInventory = session.readPlanJournalInventory.bind(session);
  const name = 'azure-terraform-pending-vm-import.json';
  const snapshot = async () => {
    await step(() => store.verify());
    const native = await step(() => readAzureTerraformParentPrivateFile(join22(directory, name), deadline));
    let parsed;
    try {
      parsed = JSON.parse(native.bytes.toString());
    } catch {
      throw Error('Azure pending import provenance: malformed native packet');
    }
    const logical = await step(() => store.read(name));
    const nativeAfter = await step(() => readAzureTerraformParentPrivateFile(join22(directory, name), deadline));
    require25(
      nativeAfter.identity === native.identity && hash16(nativeAfter.bytes) === hash16(native.bytes),
      'native packet changed during logical read',
    );
    require25(same22(parsed, logical), 'logical and native packet differ');
    return {
      value: object14(logical),
      identity: native.identity,
      bytesSha256: hash16(native.bytes),
      packetSha256: canonicalSha256(logical),
    };
  };
  await recheckCancellation();
  const first = await snapshot(),
    value = first.value;
  keys6(value, [
    'schemaVersion',
    'sourcePlanSha256',
    'vmId',
    'id',
    'address',
    'originalConfiguration',
    'configurationSha256',
    'importedConfiguration',
    'importedConfigurationSha256',
    'receipt',
    'status',
    'application',
  ]);
  const id = `/subscriptions/${base.subscription.id}/resourceGroups/${base.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${base.deploymentName}-1`;
  const address = 'azurerm_linux_virtual_machine.node_1';
  require25(
    value.schemaVersion === 2 &&
      value.sourcePlanSha256 === base.planSha256 &&
      value.id === id &&
      value.address === address &&
      typeof value.vmId === 'string' &&
      value.vmId.length > 0 &&
      value.status === 'imported' &&
      typeof value.originalConfiguration === 'string' &&
      hash16(value.originalConfiguration) === value.configurationSha256 &&
      typeof value.importedConfiguration === 'string' &&
      hash16(value.importedConfiguration) === value.importedConfigurationSha256,
    'completed owning import configuration required',
  );
  const imported = object14(JSON.parse(value.importedConfiguration));
  require25(same22(imported.import, [{ to: address, id }]), 'exact import declaration required');
  const receipt = object14(value.receipt);
  require25(
    receipt.schemaVersion === 1 &&
      receipt.engine === 'terraform' &&
      receipt.deploymentId === base.deploymentName &&
      receipt.backendIdentity === `local:${base.deploymentName}` &&
      receipt.configurationSha256 === value.importedConfigurationSha256 &&
      sha12(receipt.planSha256) &&
      sha12(receipt.providerLockSha256) &&
      receipt.noChanges === false &&
      !receipt.operation &&
      !receipt.refreshOriginSha256 &&
      !receipt.actionInvocations?.length &&
      !receipt.relinquishments?.length &&
      same22(receipt.imports, [
        {
          address,
          type: 'azurerm_linux_virtual_machine',
          providerName: 'registry.terraform.io/hashicorp/azurerm',
          idSha256: hash16(id),
        },
      ]) &&
      Array.isArray(receipt.changes) &&
      new Set(receipt.changes.map((row) => row.address)).size === receipt.changes.length &&
      receipt.changes.every((row) => row.actions.join(',') === 'no-op'),
    'nonmutating exact saved import receipt required',
  );
  const application = object14(value.application);
  keys6(application, [
    'schemaVersion',
    'receiptSha256',
    'vmObservationSha256',
    'stateIdentity',
    'history',
    'historySha256',
    'originalConfigurationSha256',
    'importedConfigurationSha256',
    'evidenceSha256',
  ]);
  const { evidenceSha256, ...body } = application;
  require25(
    application.schemaVersion === 1 &&
      evidenceSha256 === canonicalSha256(body) &&
      sha12(application.vmObservationSha256) &&
      application.receiptSha256 === canonicalSha256(receipt) &&
      application.historySha256 === canonicalSha256(application.history) &&
      application.originalConfigurationSha256 === value.configurationSha256 &&
      application.importedConfigurationSha256 === value.importedConfigurationSha256 &&
      same22(application.stateIdentity, {
        address,
        type: 'azurerm_linux_virtual_machine',
        id,
      }),
    'restricted state receipt differs',
  );
  const deployment = await step(() => azureTerraformCurrentDeployment(base));
  const { configuration: _configuration, providerLock, ...manifestIdentity } = deployment;
  require25(hash16(providerLock) === receipt.providerLockSha256, 'installed owning provider lock differs');
  const expectedImportedManifestSha256 = canonicalSha256({
    ...manifestIdentity,
    configurationSha256: value.importedConfigurationSha256,
    providerLockSha256: receipt.providerLockSha256,
  });
  const history = await step(() => readHistory(receipt, deadline)),
    inventory = await step(() => readInventory(deadline));
  require25(
    history.incompleteArchives === 0 &&
      history.receiptSha256 === canonicalSha256(receipt) &&
      same22(history.matches, object14(application.history).matches) &&
      history.matches.length > 0 &&
      history.matches.some((row) => row.state === 'applied') &&
      history.matches.every(
        (row) =>
          ['planned', 'applied'].includes(row.state) &&
          row.configurationSha256 === value.importedConfigurationSha256 &&
          row.savedPlanSha256 === receipt.planSha256 &&
          row.manifestSha256 === expectedImportedManifestSha256,
      ) &&
      (emptyMainAdmission
        ? inventory.status === 'partial' &&
          same22(inventory.unrecognizedRootEntrySha256s, [emptyMainAdmission.witness.cancellationRecordNameSha256])
        : inventory.status === 'complete' && inventory.unrecognizedRootEntrySha256s?.length === 0) &&
      inventory.incompleteArchives === 0 &&
      inventory.entries.some((row) => row.configurationSha256 === value.configurationSha256) &&
      inventory.entries.some(
        (row) =>
          row.configurationSha256 === value.importedConfigurationSha256 &&
          row.receiptSha256 === canonicalSha256(receipt) &&
          row.state === 'applied',
      ),
    `original/import configuration and applied native archives required: ${JSON.stringify({
      incompleteHistoryArchives: history.incompleteArchives,
      exactReceipt: history.receiptSha256 === canonicalSha256(receipt),
      retainedMatchesEqual: same22(history.matches, object14(application.history).matches),
      historyMatches: history.matches.length,
      appliedMatch: history.matches.some((row) => row.state === 'applied'),
      manifestMatches: history.matches.every((row) => row.manifestSha256 === expectedImportedManifestSha256),
      inventoryStatus: inventory.status,
      incompleteInventoryArchives: inventory.incompleteArchives,
      unrecognizedRootCount: inventory.unrecognizedRootEntrySha256s?.length,
      originalArchivePresent: inventory.entries.some((row) => row.configurationSha256 === value.configurationSha256),
      appliedImportedArchivePresent: inventory.entries.some(
        (row) =>
          row.configurationSha256 === value.importedConfigurationSha256 &&
          row.receiptSha256 === canonicalSha256(receipt) &&
          row.state === 'applied',
      ),
    })}`,
  );
  require25(
    same22(await snapshot(), first) &&
      same22(await step(() => readHistory(receipt, deadline)), history) &&
      same22(await step(() => readInventory(deadline)), inventory) &&
      same22(await snapshot(), first),
    'native custody changed during observation',
  );
  await recheckCancellation();
  require25(same22(await snapshot(), first), 'native custody changed after cancellation recheck');
  seal();
  return {
    schemaVersion: 1,
    scope: 'azure-terraform-pending-import-provenance',
    sourcePlanSha256: base.planSha256,
    path: name,
    identity: first.identity,
    bytesSha256: first.bytesSha256,
    packetSha256: first.packetSha256,
    applicationEvidenceSha256: evidenceSha256,
    receiptSha256: canonicalSha256(receipt),
    historySha256: canonicalSha256(history),
    inventorySha256: canonicalSha256(inventory),
    payloadSha256ByField: {
      originalConfiguration: String(value.configurationSha256),
      importedConfiguration: String(value.importedConfigurationSha256),
    },
    nativeImportJournalCustodyQualified: true,
    historicalStateReceiptCustodyQualified: true,
    currentOperationalAcceptanceQualified: false,
    retirementQualified: false,
  };
}

// plugins/azure/src/ce/terraform-upgrade-artifact-provenance.ts
import { createHash as createHash22 } from 'node:crypto';

var sourcePattern3 = /^azure-ce-upgrade-[a-f0-9]{24}\.json$/;
var artifactPattern2 =
  /^azure-ce-upgrade-[a-f0-9]{24}(?:-(?:authorization|checkpoint|action-plan|receipt|stage-retirement))?\.json$/;
var serialName = 'terraform-ce-upgrade-serial.json';
var hash17 = (value) => createHash22('sha256').update(value).digest('hex');
var sha13 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
var same23 = (left, right) => canonicalEqual({ value: left }, { value: right });
function require26(value, message) {
  if (!value) throw Error(`Terraform upgrade history: ${message}`);
}
function object15(value) {
  require26(value && typeof value === 'object' && !Array.isArray(value), 'record object required');
  return value;
}
function keys7(value, fields) {
  const names = Object.entries(object15(value))
    .filter(([, item]) => item !== undefined)
    .map(([name]) => name)
    .sort();
  require26(same23(names, fields.toSorted()), 'record fields differ');
}
var isAzureTerraformUpgradeHistoricalArtifact = (name) => name === serialName || artifactPattern2.test(name);
async function verifyAzureTerraformUpgradeHistoricalArtifacts(request, currentSite, contract, currentRecords, signal) {
  const base = structuredClone(request),
    site = structuredClone(currentSite);
  const records = new Map([...currentRecords].map(([name, value]) => [name, structuredClone(value)]));
  const inventory = (rows) => [...rows].sort(([left], [right]) => left.localeCompare(right));
  const requestSha256 = canonicalSha256(base),
    siteSha256 = canonicalSha256(site),
    recordsSha256 = canonicalSha256(inventory(records));
  const build = contract?.build,
    fingerprint = contract?.fingerprint;
  const seal = () => {
    signal?.throwIfAborted();
    require26(
      canonicalSha256(request) === requestSha256 &&
        canonicalSha256(currentSite) === siteSha256 &&
        canonicalSha256(inventory(currentRecords)) === recordsSha256 &&
        contract?.build === build &&
        contract?.fingerprint === fingerprint,
      'owning source, site, records or contract changed',
    );
  };
  seal();
  for (const name of records.keys())
    if (name.startsWith('azure-ce-upgrade-') && name.endsWith('.json'))
      require26(artifactPattern2.test(name), 'unclassified upgrade root record');
  const names = [...records.keys()].filter(isAzureTerraformUpgradeHistoricalArtifact).sort();
  const sources = new Map();
  if (names.length)
    require26(
      contract &&
        base.engine === 'terraform' &&
        typeof site.siteUid === 'string' &&
        site.siteUid.length > 0 &&
        typeof site.physicalSiteUid === 'string' &&
        site.physicalSiteUid.length > 0 &&
        /^sha256:[a-f0-9]{64}$/.test(site.siteContractFingerprint),
      'verified contract and exact site identity required',
    );
  for (const name of names.filter((name) => sourcePattern3.test(name))) {
    const upgrade = records.get(name);
    seal();
    await verifyAzureTerraformUpgrade(base, upgrade, contract);
    seal();
    require26(
      name === `${upgrade.planId}.json` &&
        !sources.has(upgrade.planId) &&
        upgrade.expectation.siteUid === site.siteUid &&
        upgrade.expectation.physicalSiteUid === site.physicalSiteUid &&
        upgrade.expectation.siteContractFingerprint === site.siteContractFingerprint,
      'source filename, duplicate or site identity differs',
    );
    sources.set(upgrade.planId, structuredClone(upgrade));
  }
  if (names.length) require26(sources.size > 0, 'upgrade source missing');
  const checkpoints = new Map();
  const actions = new Map();
  const stageRetirementPaths = [];
  for (const name of names) {
    if (name === serialName || sourcePattern3.test(name)) continue;
    const id = name.replace(/-(authorization|checkpoint|action-plan|receipt|stage-retirement)\.json$/, '');
    require26(sources.has(id), 'root artifact source missing');
    if (name.endsWith('-stage-retirement.json')) stageRetirementPaths.push(name);
  }
  for (const upgrade of sources.values()) {
    const id = upgrade.planId,
      auth = records.get(`${id}-authorization.json`),
      rawCheckpoint = records.get(`${id}-checkpoint.json`),
      rawAction = records.get(`${id}-action-plan.json`),
      rawReceipt = records.get(`${id}-receipt.json`);
    if (auth !== undefined)
      require26(
        same23(auth, {
          schemaVersion: 2,
          engine: 'terraform',
          sourcePlanSha256: base.planSha256,
          upgradePlanSha256: upgrade.planSha256,
          mutations: true,
        }),
        'authorization differs',
      );
    if (rawCheckpoint === undefined) {
      require26(rawAction === undefined && rawReceipt === undefined, 'action or completion checkpoint missing');
      continue;
    }
    require26(auth !== undefined, 'checkpoint authorization missing');
    const checkpoint = object15(rawCheckpoint);
    keys7(checkpoint, [
      'schemaVersion',
      'engine',
      'sourcePlanSha256',
      'upgradePlanSha256',
      'phase',
      ...(checkpoint.actionPlanSha256 === undefined ? [] : ['actionPlanSha256']),
    ]);
    require26(
      checkpoint.schemaVersion === 2 &&
        checkpoint.engine === 'terraform' &&
        checkpoint.sourcePlanSha256 === base.planSha256 &&
        checkpoint.upgradePlanSha256 === upgrade.planSha256 &&
        ['ready', 'submitted', 'complete'].includes(String(checkpoint.phase)) &&
        (checkpoint.phase === 'ready' ? checkpoint.actionPlanSha256 === undefined : sha13(checkpoint.actionPlanSha256)),
      'checkpoint state or source differs',
    );
    checkpoints.set(id, checkpoint);
    if (rawAction !== undefined) {
      const action = object15(rawAction);
      keys7(action, [
        'schemaVersion',
        'engine',
        'deploymentId',
        'backendIdentity',
        'configurationSha256',
        'providerLockSha256',
        'planSha256',
        'changes',
        'noChanges',
        'actionInvocations',
      ]);
      require26(
        action.schemaVersion === 1 &&
          action.engine === 'terraform' &&
          action.deploymentId === upgrade.deployment.deploymentId &&
          action.backendIdentity === upgrade.deployment.backendIdentity &&
          action.configurationSha256 === hash17(upgrade.deployment.configuration) &&
          action.providerLockSha256 === hash17(upgrade.deployment.providerLock) &&
          sha13(action.planSha256) &&
          action.noChanges === false &&
          same23(action.changes, []) &&
          same23(action.actionInvocations, [upgrade.action]) &&
          (checkpoint.phase === 'ready' || action.planSha256 === checkpoint.actionPlanSha256),
        'saved action identity or intent differs',
      );
      actions.set(id, action);
    }
    if (checkpoint.phase !== 'ready') require26(rawAction !== undefined, 'submitted action missing');
    if (checkpoint.phase === 'complete') require26(rawReceipt !== undefined, 'completed receipt missing');
    if (rawReceipt !== undefined) {
      require26(checkpoint.phase !== 'ready' && rawAction !== undefined, 'receipt predates submission');
      const receipt = object15(rawReceipt),
        action = actions.get(id);
      keys7(receipt, [
        'status',
        'engine',
        'planId',
        'planSha256',
        'siteName',
        'target',
        'actionPlanSha256',
        'observedAt',
        'nodeHealth',
        'routing',
        'traffic',
      ]);
      require26(
        receipt.status === 'upgrade-complete' &&
          receipt.engine === 'terraform' &&
          receipt.planId === id &&
          receipt.planSha256 === upgrade.planSha256 &&
          receipt.siteName === upgrade.expectation.binding.siteName &&
          same23(receipt.target, upgrade.expectation.target) &&
          receipt.actionPlanSha256 === action?.planSha256 &&
          typeof receipt.observedAt === 'string' &&
          Number.isFinite(Date.parse(receipt.observedAt)) &&
          Date.parse(receipt.observedAt) <= Date.now() &&
          receipt.nodeHealth === 'unknown' &&
          receipt.routing === 'unknown' &&
          receipt.traffic === 'unknown',
        'completion receipt identity or historical state differs',
      );
    }
  }
  const rawSerial = records.get(serialName);
  let serial;
  if (rawSerial !== undefined) {
    serial = object15(rawSerial);
    keys7(serial, [
      'schemaVersion',
      'engine',
      'status',
      ...['activePlanId', 'activePlanSha256', 'lastPlanId', 'lastPlanSha256'].filter(
        (key) => serial?.[key] !== undefined,
      ),
    ]);
    require26(
      serial.schemaVersion === 2 &&
        serial.engine === 'terraform' &&
        ['active', 'idle'].includes(String(serial.status)) &&
        (serial.activePlanId === undefined) === (serial.activePlanSha256 === undefined) &&
        (serial.lastPlanId === undefined) === (serial.lastPlanSha256 === undefined) &&
        (serial.status === 'active'
          ? typeof serial.activePlanId === 'string' && sha13(serial.activePlanSha256)
          : serial.activePlanId === undefined),
      'serial lifecycle state differs',
    );
    for (const [id, digest] of [
      [serial.activePlanId, serial.activePlanSha256],
      [serial.lastPlanId, serial.lastPlanSha256],
    ])
      if (id !== undefined)
        require26(
          typeof id === 'string' && sha13(digest) && sources.get(id)?.planSha256 === digest && checkpoints.has(id),
          'serial source or checkpoint differs',
        );
    if (serial.lastPlanId !== undefined)
      require26(checkpoints.get(String(serial.lastPlanId))?.phase !== 'submitted', 'last upgrade is still submitted');
  }
  for (const [id, checkpoint] of checkpoints) {
    if (checkpoint.phase === 'submitted')
      require26(serial?.status === 'active' && serial.activePlanId === id, 'submitted serial owner differs');
    if (checkpoint.phase === 'complete')
      require26(
        serial && (serial.activePlanId !== undefined || serial.lastPlanId !== undefined),
        'completed serial ledger missing',
      );
    if (checkpoint.phase === 'ready' && actions.has(id))
      require26(serial?.status === 'active' && serial.activePlanId === id, 'prepared action serial owner differs');
  }
  seal();
  return {
    scope: 'read-only-terraform-upgrade-root-provenance',
    sources,
    rootArtifacts: names
      .filter((name) => !stageRetirementPaths.includes(name))
      .map((path) => ({ path, packetSha256: canonicalSha256(records.get(path)) })),
    stageRetirementPaths,
    nativeStageRetirementQualified: false,
    currentOperationalAcceptanceQualified: false,
  };
}

// plugins/azure/src/ce/terraform-upgrade-retirement.ts
// plugins/azure/src/ce/terraform-upgrade-applied-journal.ts
import { createHash as createHash23, createHash as createHash24 } from 'node:crypto';
import {
  lstat as lstat21,
  lstat as lstat22,
  readdir as readdir22,
  readdir as readdir23,
  realpath as realpath21,
} from 'node:fs/promises';
import { join as join23, join as join24 } from 'node:path';

var hash18 = (bytes) => createHash23('sha256').update(bytes).digest('hex');
var same24 = (a, b) => canonicalEqual({ value: a }, { value: b });
var sha14 = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require27(v, message) {
  if (!v) throw Error(`Azure upgrade applied journal: ${message}`);
}
function object16(v) {
  require27(v && typeof v === 'object' && !Array.isArray(v), 'complete record required');
  return v;
}
function keys8(v, names) {
  require27(same24(Object.keys(object16(v)).sort(), names.toSorted()), 'journal fields differ');
}
var witnesses5 = new WeakMap();
async function qualifyAzureTerraformUpgradeAppliedJournal(
  request,
  input,
  currentSite,
  contract,
  store,
  session,
  signal,
) {
  const base = structuredClone(request),
    upgrade = structuredClone(input),
    site = structuredClone(currentSite),
    owner = structuredClone(store.owner),
    directory = store.directory;
  const dependencies = [
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'verify', value: store.verify },
    { target: session, key: 'readPlanApplicationHistory', value: session.readPlanApplicationHistory },
    ...['identity', 'publication', 'releaseTag', 'commit', 'fingerprint', 'build', 'observationPaths'].map((key) => ({
      target: contract,
      key,
      value: Reflect.get(contract, key),
    })),
  ];
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = (active) => {
    active.throwIfAborted();
    require27(
      same24(request, base) &&
        same24(input, upgrade) &&
        same24(currentSite, site) &&
        same24(store.owner, owner) &&
        store.directory === directory &&
        dependencies.every(({ target, key, value }) => Reflect.get(target, key) === value),
      'owning input or dependency changed',
    );
  };
  const step = async (action, active) => {
    seal(active);
    const abort = Promise.withResolvers(),
      onAbort = () => abort.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([action(), abort.promise]);
      seal(active);
      return value;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  seal(deadline);
  require27(
    base.engine === 'terraform' &&
      same24(owner, azureUpgradeBinding(base).owner) &&
      typeof session.readPlanApplicationHistory === 'function',
    'owning journal observer required',
  );
  const readHistory = session.readPlanApplicationHistory.bind(session);
  const snapshot = async (active) => {
    await step(() => store.verify(), active);
    const root = await step(() => lstat21(directory), active);
    require27(
      root.isDirectory() &&
        !root.isSymbolicLink() &&
        root.uid === process.getuid?.() &&
        (root.mode & 63) === 0 &&
        (await step(() => realpath21(directory), active)) === directory,
      'private owning directory differs',
    );
    const names = (await step(() => readdir22(directory), active))
      .filter(
        (name) =>
          (name.startsWith('azure-ce-upgrade-') || name === 'terraform-ce-upgrade-serial.json') &&
          !name.endsWith('-stage-retirement.json'),
      )
      .sort();
    const records = new Map();
    const files = [];
    for (const name of names) {
      const native = await step(() => readAzureTerraformParentPrivateFile(join23(directory, name), active), active);
      let parsed;
      try {
        parsed = JSON.parse(native.bytes.toString());
      } catch {
        throw Error('Azure upgrade applied journal: malformed root record');
      }
      const logical = await step(() => store.read(name), active);
      require27(same24(parsed, logical), 'root logical and native bytes differ');
      records.set(name, structuredClone(logical));
      files.push({
        path: name,
        identity: native.identity,
        bytesSha256: hash18(native.bytes),
        packetSha256: canonicalSha256(logical),
      });
    }
    return { records, files, rootIdentity: `${root.dev}:${root.ino}:${root.birthtimeMs}`, names };
  };
  const first = await snapshot(deadline);
  const rootHistory = await step(
    () => verifyAzureTerraformUpgradeHistoricalArtifacts(base, site, contract, first.records, deadline),
    deadline,
  );
  require27(same24(rootHistory.sources.get(upgrade.planId), upgrade), 'exact saved upgrade source required');
  const checkpoint = object16(first.records.get(`${upgrade.planId}-checkpoint.json`)),
    serial = object16(first.records.get('terraform-ce-upgrade-serial.json'));
  require27(
    checkpoint.phase === 'complete' && serial.status === 'idle' && serial.activePlanId === undefined,
    'complete inactive upgrade required',
  );
  const action = object16(first.records.get(`${upgrade.planId}-action-plan.json`));
  const { configuration, providerLock, ...identity } = upgrade.deployment;
  const manifestSha256 = canonicalSha256({
    ...identity,
    configurationSha256: hash18(configuration),
    providerLockSha256: hash18(providerLock),
  });
  const validateHistory = (raw) => verifyAzureTerraformUpgradeAppliedJournalHistory(raw, action, manifestSha256);
  const history = validateHistory(await step(() => readHistory(action, deadline), deadline));
  require27(same24(await snapshot(deadline), first), 'root bytes or namespace changed during observation');
  const body = {
    schemaVersion: 1,
    scope: 'azure-terraform-upgrade-applied-journal-custody',
    sourcePlanSha256: base.planSha256,
    upgradePlanSha256: upgrade.planSha256,
    site,
    contractFingerprint: contract.fingerprint,
    actionReceiptSha256: canonicalSha256(action),
    manifestSha256,
    files: first.files,
    rootIdentity: first.rootIdentity,
    history,
    historySha256: canonicalSha256(history),
    journalCustodyQualified: true,
    applicationOutcomeQualified: false,
    retirementQualified: false,
    currentOperationalAcceptanceQualified: false,
  };
  const digest = canonicalSha256(body);
  witnesses5.set(body, {
    request,
    input,
    site: currentSite,
    contract,
    store,
    session,
    digest,
    async recheck(parent) {
      const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
      seal(active);
      require27(
        canonicalSha256(body) === digest && same24(await snapshot(active), first),
        'owning witness or root custody changed',
      );
      require27(
        same24(validateHistory(await step(() => readHistory(action, active), active)), history),
        'native journal history changed',
      );
      require27(same24(await snapshot(active), first), 'root bytes or namespace changed during recheck');
      seal(active);
    },
  });
  return body;
}
async function recheckAzureTerraformUpgradeAppliedJournal(
  witness,
  request,
  input,
  site,
  contract,
  store,
  session,
  signal,
) {
  const bound = witness && typeof witness === 'object' ? witnesses5.get(witness) : undefined;
  require27(
    bound &&
      bound.request === request &&
      bound.input === input &&
      bound.site === site &&
      bound.contract === contract &&
      bound.store === store &&
      bound.session === session &&
      bound.digest === canonicalSha256(witness),
    'owning applied journal witness required',
  );
  await bound.recheck(signal);
}
function verifyAzureTerraformUpgradeAppliedJournalHistory(raw, action, manifestSha256) {
  const history = object16(raw);
  keys8(history, [
    'schemaVersion',
    'scope',
    'receiptSha256',
    'manifestSha256',
    'matches',
    'incompleteArchives',
    'applicationOutcomeQualified',
    'retirementQualified',
  ]);
  require27(
    history.schemaVersion === 1 &&
      history.scope === 'exact-saved-plan-journal-history' &&
      history.receiptSha256 === canonicalSha256(action) &&
      history.manifestSha256 === manifestSha256 &&
      history.incompleteArchives === 0 &&
      history.applicationOutcomeQualified === false &&
      history.retirementQualified === false &&
      Array.isArray(history.matches) &&
      history.matches.length > 0,
    'exact complete native journal history required',
  );
  const seen = new Set();
  let applied = false;
  for (const rawMatch of history.matches) {
    const match = object16(rawMatch);
    keys8(match, [
      'location',
      'archiveSha256',
      'state',
      'journalSha256',
      'savedPlanSha256',
      'configurationSha256',
      'manifestSha256',
    ]);
    const key = `${match.location}/${match.archiveSha256}`;
    require27(
      ['current', 'revision', 'plan-history'].includes(String(match.location)) &&
        !seen.has(key) &&
        ['planned', 'applied'].includes(String(match.state)) &&
        sha14(match.archiveSha256) &&
        sha14(match.journalSha256) &&
        match.savedPlanSha256 === action.planSha256 &&
        match.configurationSha256 === action.configurationSha256 &&
        match.manifestSha256 === manifestSha256,
      'ambiguous or foreign journal occurrence',
    );
    seen.add(key);
    applied ||= match.state === 'applied';
  }
  require27(applied, 'native applied journal occurrence required');
  return structuredClone(history);
}

// plugins/azure/src/ce/terraform-upgrade-retirement.ts
var hash19 = (v) => createHash24('sha256').update(v).digest('hex');
var same25 = (a, b) => canonicalEqual({ value: a }, { value: b });
var sha15 = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require28(v, message) {
  if (!v) throw Error(`Azure upgrade stage retirement: ${message}`);
}
function object17(v) {
  require28(v && typeof v === 'object' && !Array.isArray(v), 'complete checkpoint required');
  return v;
}
function keys9(v, names) {
  require28(
    same25(
      Object.entries(object17(v))
        .filter(([, value]) => value !== undefined)
        .map(([key]) => key)
        .sort(),
      names.toSorted(),
    ),
    'checkpoint fields differ',
  );
}
async function optional6(store, name) {
  try {
    return await store.read(name);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}
async function accessAzureTerraformUpgradeStage(
  request,
  input,
  contract,
  terraform,
  store,
  externalEvidenceSha256,
  environment,
  signal,
  observationOnly,
) {
  const base = structuredClone(request),
    upgrade = structuredClone(input),
    env = { ...environment },
    owner = structuredClone(store.owner),
    directory = store.directory;
  const active = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const dependencies = [
    { target: terraform, key: 'open', value: terraform.open },
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'write', value: store.write },
    { target: store, key: 'verify', value: store.verify },
    ...['identity', 'publication', 'releaseTag', 'commit', 'fingerprint', 'build', 'observationPaths'].map((key) => ({
      target: contract,
      key,
      value: Reflect.get(contract, key),
    })),
  ];
  const seal = () => {
    active.throwIfAborted();
    require28(
      same25(request, base) &&
        same25(input, upgrade) &&
        same25(store.owner, owner) &&
        store.directory === directory &&
        dependencies.every(({ target, key, value }) => Reflect.get(target, key) === value),
      'owning input or method changed',
    );
  };
  const step = async (action) => {
    seal();
    const aborted = Promise.withResolvers(),
      onAbort = () => aborted.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), aborted.promise]);
      seal();
      return result;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  seal();
  await step(() => verifyAzureTerraformUpgrade(base, upgrade, contract));
  require28(
    sha15(externalEvidenceSha256) && same25(owner, azureUpgradeBinding(base).owner),
    'owning external absence digest required',
  );
  const site = {
    siteUid: upgrade.expectation.siteUid,
    physicalSiteUid: upgrade.expectation.physicalSiteUid,
    siteContractFingerprint: upgrade.expectation.siteContractFingerprint,
  };
  const { configuration, providerLock, ...identity } = upgrade.deployment;
  const manifestSha256 = canonicalSha256({
    ...identity,
    configurationSha256: hash19(configuration),
    providerLockSha256: hash19(providerLock),
  });
  const deploymentSha256 = canonicalSha256(upgrade.deployment),
    name = `${upgrade.planId}-stage-retirement.json`;
  const release = await acquireProcessLock(join24(directory, '.upgrade-lock'));
  try {
    const roots = async () => {
      await step(() => store.verify());
      const names = (await step(() => readdir23(directory)))
        .filter(
          (path) =>
            (path.startsWith('azure-ce-upgrade-') || path === 'terraform-ce-upgrade-serial.json') &&
            !path.endsWith('-stage-retirement.json'),
        )
        .sort();
      const records = new Map();
      for (const path of names) records.set(path, await step(() => store.read(path)));
      const history = await step(() =>
        verifyAzureTerraformUpgradeHistoricalArtifacts(base, site, contract, records, active),
      );
      require28(
        same25(history.sources.get(upgrade.planId), upgrade) &&
          object17(records.get(`${upgrade.planId}-checkpoint.json`)).phase === 'complete' &&
          object17(records.get('terraform-ce-upgrade-serial.json')).status === 'idle',
        'complete inactive owning roots required',
      );
      return {
        names,
        records,
        action: object17(records.get(`${upgrade.planId}-action-plan.json`)),
      };
    };
    const source = await roots(),
      action = source.action;
    const finalReceipt = (raw) => {
      const receipt = object17(raw);
      keys9(receipt, [
        'schemaVersion',
        'engine',
        'deploymentId',
        'backendIdentity',
        'configurationSha256',
        'providerLockSha256',
        'planSha256',
        'changes',
        'noChanges',
      ]);
      require28(
        receipt.schemaVersion === 1 &&
          receipt.engine === 'terraform' &&
          receipt.deploymentId === upgrade.deployment.deploymentId &&
          receipt.backendIdentity === upgrade.deployment.backendIdentity &&
          receipt.configurationSha256 === hash19(configuration) &&
          receipt.providerLockSha256 === hash19(providerLock) &&
          sha15(receipt.planSha256) &&
          receipt.noChanges === true &&
          Array.isArray(receipt.changes) &&
          receipt.changes.length === 0,
        'exact ordinary final no-change receipt required',
      );
      return receipt;
    };
    const envelope = (appliedJournalSha256, receiptSha256) => ({
      schemaVersion: 2,
      kind: 'azure-terraform-upgrade-stage-retirement',
      externalEvidenceSha256,
      sourcePlanSha256: base.planSha256,
      upgradePlanSha256: upgrade.planSha256,
      deploymentSha256,
      appliedJournalSha256,
      receiptSha256,
    });
    const validate = (raw) => {
      const c = object17(raw),
        bound = [
          'schemaVersion',
          'status',
          'owner',
          'sourcePlanSha256',
          'upgradePlanSha256',
          'deploymentSha256',
          'externalEvidenceSha256',
        ];
      require28(
        c.schemaVersion === 2 &&
          ['preparing', 'capturing', 'retiring', 'retired'].includes(String(c.status)) &&
          same25(c.owner, owner) &&
          c.sourcePlanSha256 === base.planSha256 &&
          c.upgradePlanSha256 === upgrade.planSha256 &&
          c.deploymentSha256 === deploymentSha256 &&
          c.externalEvidenceSha256 === externalEvidenceSha256,
        'original stage checkpoint identity differs',
      );
      if (c.status !== 'preparing') {
        bound.push('receipt', 'receiptSha256');
        finalReceipt(c.receipt);
        require28(c.receiptSha256 === canonicalSha256(c.receipt), 'final receipt digest differs');
      }
      if (c.status === 'retiring' || c.status === 'retired') {
        bound.push('appliedJournal', 'appliedJournalSha256', 'retirementEvidence', 'evidenceSha256');
        require28(
          sha15(c.appliedJournalSha256) &&
            c.appliedJournalSha256 === canonicalSha256(c.appliedJournal) &&
            same25(c.retirementEvidence, envelope(c.appliedJournalSha256, String(c.receiptSha256))) &&
            c.evidenceSha256 === canonicalSha256(c.retirementEvidence),
          'original stage evidence envelope differs',
        );
      }
      if (c.status === 'retired') bound.push('result');
      keys9(c, bound);
      return c;
    };
    let checkpoint = await optional6(store, name);
    if (checkpoint !== undefined) validate(checkpoint);
    if (observationOnly !== undefined)
      require28(
        checkpoint !== undefined && object17(checkpoint).status === 'retired' && same25(checkpoint, observationOnly),
        'read-only completed stage checkpoint required',
      );
    const session = await step(() => terraform.open(owner, upgrade.deployment, 'current'));
    require28(
      session.retireArtifacts &&
        session.readArtifactRetirement &&
        session.readPlanApplicationHistory &&
        session.readConfigurationSha256,
      'owning native retirement and journal observers required',
    );
    const readConfiguration = session.readConfigurationSha256.bind(session),
      observeRetirement = session.readArtifactRetirement.bind(session),
      retire = session.retireArtifacts.bind(session);
    for (const key of [
      'retireArtifacts',
      'readArtifactRetirement',
      'readPlanApplicationHistory',
      'readConfigurationSha256',
      'readPlanApplicationState',
      'plan',
    ])
      dependencies.push({ target: session, key, value: Reflect.get(session, key) });
    if (checkpoint === undefined) {
      require28(
        (await step(() => readConfiguration())) === hash19(configuration) &&
          (await step(() => session.readPlanApplicationState(action))) === 'applied',
        'owning applied action required',
      );
      checkpoint = {
        schemaVersion: 2,
        status: 'preparing',
        owner,
        sourcePlanSha256: base.planSha256,
        upgradePlanSha256: upgrade.planSha256,
        deploymentSha256,
        externalEvidenceSha256,
      };
      await step(() => store.write(name, checkpoint));
    }
    const unchanged = async () => {
      require28(same25(await step(() => store.read(name)), checkpoint), 'stage checkpoint changed across boundary');
      await roots();
    };
    if (object17(checkpoint).status === 'preparing') {
      const before = await step(() =>
        qualifyAzureTerraformUpgradeAppliedJournal(base, upgrade, site, contract, store, session, active),
      );
      await step(() =>
        recheckAzureTerraformUpgradeAppliedJournal(before, base, upgrade, site, contract, store, session, active),
      );
      const receipt = finalReceipt(await step(() => session.plan(env, active)));
      await unchanged();
      checkpoint = { ...object17(checkpoint), status: 'capturing', receipt, receiptSha256: canonicalSha256(receipt) };
      await step(() => store.write(name, checkpoint));
    }
    if (object17(checkpoint).status === 'capturing') {
      const proof = await step(() =>
        qualifyAzureTerraformUpgradeAppliedJournal(base, upgrade, site, contract, store, session, active),
      );
      await unchanged();
      await step(() =>
        recheckAzureTerraformUpgradeAppliedJournal(proof, base, upgrade, site, contract, store, session, active),
      );
      const appliedJournalSha256 = canonicalSha256(proof),
        retirementEvidence = envelope(appliedJournalSha256, String(object17(checkpoint).receiptSha256));
      checkpoint = {
        ...object17(checkpoint),
        status: 'retiring',
        appliedJournal: structuredClone(proof),
        appliedJournalSha256,
        retirementEvidence,
        evidenceSha256: canonicalSha256(retirementEvidence),
      };
      await step(() => store.write(name, checkpoint));
      await step(() =>
        recheckAzureTerraformUpgradeAppliedJournal(proof, base, upgrade, site, contract, store, session, active),
      );
    }
    const c = validate(checkpoint),
      receipt = finalReceipt(c.receipt),
      evidenceSha256 = String(c.evidenceSha256);
    const retained = async () => {
      const proof = object17(c.appliedJournal);
      keys9(proof, [
        'schemaVersion',
        'scope',
        'sourcePlanSha256',
        'upgradePlanSha256',
        'site',
        'contractFingerprint',
        'actionReceiptSha256',
        'manifestSha256',
        'files',
        'rootIdentity',
        'history',
        'historySha256',
        'journalCustodyQualified',
        'applicationOutcomeQualified',
        'retirementQualified',
        'currentOperationalAcceptanceQualified',
      ]);
      require28(
        proof.schemaVersion === 1 &&
          proof.scope === 'azure-terraform-upgrade-applied-journal-custody' &&
          proof.sourcePlanSha256 === base.planSha256 &&
          proof.upgradePlanSha256 === upgrade.planSha256 &&
          same25(proof.site, site) &&
          proof.contractFingerprint === contract.fingerprint &&
          proof.actionReceiptSha256 === canonicalSha256(action) &&
          proof.manifestSha256 === manifestSha256 &&
          proof.historySha256 === canonicalSha256(proof.history) &&
          proof.journalCustodyQualified === true &&
          proof.applicationOutcomeQualified === false &&
          proof.retirementQualified === false &&
          proof.currentOperationalAcceptanceQualified === false &&
          Array.isArray(proof.files),
        'retained applied custody differs',
      );
      verifyAzureTerraformUpgradeAppliedJournalHistory(proof.history, action, manifestSha256);
      const current = await roots(),
        files = proof.files.map(object17);
      require28(same25(files.map((file) => file.path).sort(), current.names), 'retained root namespace differs');
      const root = await step(() => lstat22(directory));
      require28(proof.rootIdentity === `${root.dev}:${root.ino}:${root.birthtimeMs}`, 'retained root identity differs');
      for (const file of files) {
        keys9(file, ['path', 'identity', 'bytesSha256', 'packetSha256']);
        require28(typeof file.path === 'string' && current.names.includes(file.path), 'retained root path differs');
        const native = await step(() => readAzureTerraformParentPrivateFile(join24(directory, file.path), active));
        require28(
          native.identity === file.identity &&
            hash19(native.bytes) === file.bytesSha256 &&
            file.packetSha256 === canonicalSha256(current.records.get(file.path)),
          'retained root bytes or inode differ',
        );
      }
      await unchanged();
    };
    const result = (raw) => {
      const value = object17(raw);
      keys9(value, [
        'status',
        'manifestSha256',
        'evidenceSha256',
        'finalPlanSha256',
        'inventorySha256',
        'retiredArtifacts',
        'independentCleanupSha256',
      ]);
      require28(
        value.status === 'runner-artifacts-retired' &&
          value.manifestSha256 === manifestSha256 &&
          value.evidenceSha256 === evidenceSha256 &&
          value.finalPlanSha256 === receipt.planSha256 &&
          sha15(value.inventorySha256) &&
          sha15(value.independentCleanupSha256) &&
          Number.isSafeInteger(value.retiredArtifacts) &&
          Number(value.retiredArtifacts) >= 0,
        'native retirement result differs',
      );
      return value;
    };
    await retained();
    const observed = await step(() => observeRetirement(receipt, evidenceSha256, active));
    await retained();
    if (observed.status === 'runner-artifacts-retired') {
      const native = result(observed.receipt);
      require28(sha15(observed.markerSha256), 'permanent native marker identity required');
      if (c.status === 'retired')
        require28(same25(c.result, native), 'completed root result differs from native barrier');
      else {
        checkpoint = { ...c, status: 'retired', result: native };
        await step(() => store.write(name, checkpoint));
      }
      return native;
    }
    require28(c.status === 'retiring', 'completed stage lost its permanent native barrier');
    if (observed.status === 'absent') {
      const fresh = await step(() =>
        qualifyAzureTerraformUpgradeAppliedJournal(base, upgrade, site, contract, store, session, active),
      );
      require28(same25(fresh, c.appliedJournal), 'pre-deletion applied custody changed');
      await step(() =>
        recheckAzureTerraformUpgradeAppliedJournal(fresh, base, upgrade, site, contract, store, session, active),
      );
    } else
      require28(
        sha15(observed.markerSha256) &&
          sha15(observed.independentCleanupSha256) &&
          Number.isSafeInteger(observed.remainingArtifacts) &&
          observed.remainingArtifacts >= 0,
        'partial native marker identity required',
      );
    await retained();
    const retired = result(await step(() => retire(receipt, evidenceSha256, env, active)));
    await retained();
    const permanent = await step(() => observeRetirement(receipt, evidenceSha256, active));
    require28(
      permanent.status === 'runner-artifacts-retired' &&
        sha15(permanent.markerSha256) &&
        same25(result(permanent.receipt), retired),
      'owning permanent native barrier required after cleanup',
    );
    await retained();
    checkpoint = { ...c, status: 'retired', result: retired };
    await step(() => store.write(name, checkpoint));
    return retired;
  } finally {
    await release();
  }
}
async function retireAzureTerraformUpgradeStage(
  request,
  input,
  contract,
  terraform,
  store,
  externalEvidenceSha256,
  environment,
  signal,
) {
  return accessAzureTerraformUpgradeStage(
    request,
    input,
    contract,
    terraform,
    store,
    externalEvidenceSha256,
    environment,
    signal,
  );
}
async function readAzureTerraformUpgradeStageRetirement(request, input, contract, terraform, store, signal) {
  signal?.throwIfAborted();
  require28(/^azure-ce-upgrade-[a-f0-9]{24}$/.test(input.planId), 'read-only stage source identifier required');
  const name = `${input.planId}-stage-retirement.json`,
    path = join24(store.directory, name),
    before = await readAzureTerraformParentPrivateFile(path, signal),
    checkpoint = object17(JSON.parse(before.bytes.toString()));
  require28(
    checkpoint.schemaVersion === 2 && checkpoint.status === 'retired' && sha15(checkpoint.externalEvidenceSha256),
    'read-only completed stage checkpoint required',
  );
  const result = await accessAzureTerraformUpgradeStage(
    request,
    input,
    contract,
    terraform,
    store,
    checkpoint.externalEvidenceSha256,
    {},
    signal,
    checkpoint,
  );
  const after = await readAzureTerraformParentPrivateFile(path, signal);
  require28(
    after.identity === before.identity && after.bytes.equals(before.bytes),
    'read-only stage checkpoint descriptor changed',
  );
  return result;
}
async function finalizeAzureTerraformUpgradeStageRetirement(
  request,
  input,
  contract,
  terraform,
  store,
  newStageExternalEvidenceSha256,
  environment,
  signal,
) {
  signal?.throwIfAborted();
  require28(sha15(newStageExternalEvidenceSha256), 'resolved external absence digest required');
  await verifyAzureTerraformUpgrade(request, input, contract);
  const saved = await optional6(store, `${input.planId}-stage-retirement.json`);
  if (saved === undefined)
    return retireAzureTerraformUpgradeStage(
      request,
      input,
      contract,
      terraform,
      store,
      newStageExternalEvidenceSha256,
      environment,
      signal,
    );
  const checkpoint = object17(saved);
  require28(
    checkpoint.schemaVersion === 2 && sha15(checkpoint.externalEvidenceSha256),
    'original stage external evidence required',
  );
  if (checkpoint.status === 'retired')
    return readAzureTerraformUpgradeStageRetirement(request, input, contract, terraform, store, signal);
  return retireAzureTerraformUpgradeStage(
    request,
    input,
    contract,
    terraform,
    store,
    checkpoint.externalEvidenceSha256,
    environment,
    signal,
  );
}
async function qualifiedAzureTerraformUpgradeStages(base, store, stages, contract) {
  const { readdir } = await import('fs/promises');
  const sources = (await readdir(store.directory)).filter((name) => /^azure-ce-upgrade-[a-f0-9]{24}\.json$/.test(name));
  const upgrades = [];
  for (const name of sources) {
    const upgrade = await store.read(name);
    await verifyAzureTerraformUpgrade(base, upgrade, contract);
    if (name !== `${upgrade.planId}.json`) throw Error('Upgrade source file identity differs');
    if (stages.includes(String(upgrade.deployment.stage))) upgrades.push(upgrade);
  }
  if (
    new Set(upgrades.map((u) => u.deployment.stage)).size !== upgrades.length ||
    stages.some((stage) => !upgrades.some((u) => u.deployment.stage === stage))
  )
    throw Error('Unqualified Terraform stage blocks terminal cleanup');
  return upgrades.sort((a, b) => String(a.deployment.stage).localeCompare(String(b.deployment.stage)));
}

// plugins/azure/src/ce/terraform-parent-disposition.ts
var hash20 = (input) => createHash25('sha256').update(input).digest('hex');
var same26 = (a, b) => canonicalEqual({ value: a }, { value: b });
var sha16 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function require29(value, message) {
  if (!value) throw Error(`Azure parent disposition: ${message}`);
}
function object18(value) {
  require29(value && typeof value === 'object' && !Array.isArray(value), 'complete schema record required');
  return value;
}
function keys10(value, fields) {
  require29(same26(Object.keys(object18(value)).sort(), fields.toSorted()), 'record fields differ');
}
function timestamp3(value) {
  require29(
    typeof value === 'string' && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now(),
    'historical timestamp differs',
  );
}
function validateAzureTerraformParentTeardownReceipt(raw, base, teardown, final) {
  const receipt = object18(raw),
    destroy = object18(final);
  keys10(receipt, [
    'status',
    'sourcePlanSha256',
    'teardownPlanSha256',
    'finalPlanSha256',
    'cloud',
    'sites',
    'observedAt',
  ]);
  require29(
    receipt.status === 'retired' &&
      receipt.sourcePlanSha256 === base.planSha256 &&
      receipt.teardownPlanSha256 === teardown.planSha256 &&
      receipt.cloud === 'absent' &&
      receipt.sites === 'deleted' &&
      sha16(receipt.finalPlanSha256) &&
      receipt.finalPlanSha256 === destroy.planSha256 &&
      destroy.operation === 'destroy' &&
      destroy.noChanges === true &&
      Array.isArray(destroy.changes) &&
      destroy.changes.length === 0,
    'completed teardown receipt differs from owning final destroy',
  );
  timestamp3(receipt.observedAt);
  return receipt;
}
async function collectAzureTerraformParentDispositions(
  base,
  store,
  context,
  snapshot,
  authority,
  signal,
  contracts = {},
) {
  signal?.throwIfAborted();
  const teardown = context.destroyTeardown,
    binding = azureUpgradeBinding(base),
    owner = binding.owner;
  require29(
    base.engine === 'terraform' &&
      same26(store.owner, owner) &&
      teardown.sourcePlanSha256 === base.planSha256 &&
      teardown.retirement.length === 1 &&
      teardown.retirement[0].siteName === base.siteName &&
      teardown.retirement[0].siteUid === context.site.siteUid,
    'owning source or logical site differs',
  );
  const files = [...snapshot.files, snapshot.terminalFile],
    byPath = new Map(files.map((file) => [file.path, file]));
  require29(byPath.size === files.length, 'duplicate native file');
  const records = new Map();
  for (const file of files.filter((file) => !file.path.includes('/'))) {
    signal?.throwIfAborted();
    const value = await store.read(file.path);
    require29(canonicalSha256(value) === file.packetSha256, 'semantic record differs from native snapshot');
    records.set(file.path, structuredClone(value));
  }
  const decisions = new Map();
  const decide = (path, action, schema, provenance, payloadSha256ByField) => {
    const file = byPath.get(path);
    require29(file && schema.length > 0, 'decision lacks exact native file or schema');
    const decision = {
      ...file,
      action,
      schema,
      semanticProvenanceSha256: canonicalSha256(provenance),
      ...(payloadSha256ByField ? { payloadSha256ByField } : {}),
    };
    require29(!decisions.has(path), 'conflicting or duplicate semantic decision');
    decisions.set(path, decision);
  };
  const original = await readAzureTerraformOriginalReceiptProvenance(base, store, context.loaders, signal);
  require29(
    canonicalSha256(original) === authority.originalDirectories.provenanceSha256,
    'original receipt directory authority differs',
  );
  const outcome = await context.loaders.loadOutcome(base);
  require29(canonicalSha256(outcome) === original.outcomeSha256, 'original public outcome differs');
  const rootGeneric = new Set();
  const generic = (path, action, schema, provenance, payload) => {
    rootGeneric.add(path);
    decide(path, action, schema, provenance, payload);
  };
  if (contracts.observer) {
    const observer = await collectAzureOperationalParentDispositions(
      base,
      store,
      context.publicSession,
      files,
      contracts.observer,
      signal,
    );
    for (const file of observer) {
      generic(file.path, file.action, file.schema, { observer: file.semanticProvenanceSha256 });
      const decision = decisions.get(file.path);
      require29(decision, 'owning observer decision missing');
      decision.semanticProvenanceSha256 = file.semanticProvenanceSha256;
    }
  }
  if (contracts.replacementObserver) {
    const observer = await collectAzureReplacementOperationalParentDispositions(
      base,
      store,
      context.publicSession,
      files,
      contracts.replacementObserver,
      signal,
    );
    for (const file of observer) {
      generic(file.path, file.action, file.schema, { observer: file.semanticProvenanceSha256 });
      const decision = decisions.get(file.path);
      require29(decision, 'owning replacement observer decision missing');
      decision.semanticProvenanceSha256 = file.semanticProvenanceSha256;
    }
  }
  if (contracts.replacementReadingsObserver) {
    const observer = await collectAzureReplacementReadingsOperationalParentDispositions(
      base,
      store,
      context.publicSession,
      files,
      contracts.replacementReadingsObserver,
      signal,
    );
    for (const file of observer) {
      generic(file.path, file.action, file.schema, { observer: file.semanticProvenanceSha256 });
      const decision = decisions.get(file.path);
      require29(decision, 'owning replacement readings observer decision missing');
      decision.semanticProvenanceSha256 = file.semanticProvenanceSha256;
    }
  }
  const record = (name) => object18(records.get(name));
  keys10(record('owner.json'), ['schemaVersion', 'owner']);
  require29(same26(record('owner.json'), { schemaVersion: 2, owner }), 'owner manifest differs');
  generic('owner.json', 'preserve', 'ce-owner-v2', { owner });
  require29(
    same26(records.get('azure-terraform-terminal-cleanup.json'), context.terminalCleanup),
    'owning terminal checkpoint differs',
  );
  generic(
    'azure-terraform-terminal-cleanup.json',
    'owning-transition',
    'terraform-terminal-cleanup-v1',
    authority.terminal,
  );
  require29(same26(records.get(`${teardown.planId}.json`), teardown), 'saved compiled teardown differs');
  generic(`${teardown.planId}.json`, 'preserve', 'terraform-teardown-plan', teardown);
  require29(
    same26(records.get(`${teardown.planId}-authorization.json`), {
      schemaVersion: 1,
      engine: 'terraform',
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: teardown.planSha256,
      mutations: true,
    }),
    'teardown authorization differs',
  );
  generic(`${teardown.planId}-authorization.json`, 'preserve', 'terraform-teardown-authorization-v1', teardown);
  require29(
    same26(records.get('azure-terraform-lifecycle-retirement.json'), {
      schemaVersion: 1,
      engine: 'terraform',
      owner,
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: teardown.planSha256,
      kind: teardown.kind,
    }),
    'lifecycle retirement differs',
  );
  generic('azure-terraform-lifecycle-retirement.json', 'preserve', 'terraform-lifecycle-retirement-v1', teardown);
  const terminal = object18(authority.terminal);
  require29(
    terminal.destroyJournalCustodyQualified === true &&
      terminal.publicJournalCustodyQualified === true &&
      terminal.currentEmptyMainJournalCustodyQualified === true &&
      same26(terminal.owner, owner) &&
      terminal.originalPlanSha256 === base.planSha256 &&
      terminal.teardownPlanSha256 === teardown.planSha256 &&
      Array.isArray(terminal.consumed),
    'owning terminal native journal authority required',
  );
  for (const [name, phase] of [
    ['azure-terraform-cloud-destroy-plan.json', 'destroy'],
    ['azure-terraform-cloud-destroy-final.json', 'final'],
  ]) {
    const receipt = record(name),
      joins = terminal.consumed.map(object18).filter((row) => row.phase === phase);
    require29(
      joins.length === 1 && joins[0].receiptSha256 === canonicalSha256(receipt) && sha16(joins[0].historySha256),
      'destroy receipt lacks owning native application provenance',
    );
    generic(name, 'preserve', 'terraform-native-destroy-receipt-v1', joins[0]);
  }
  if (records.has('azure-terraform-teardown-receipt.json')) {
    const receipt = record('azure-terraform-teardown-receipt.json');
    validateAzureTerraformParentTeardownReceipt(
      receipt,
      base,
      teardown,
      record('azure-terraform-cloud-destroy-final.json'),
    );
    generic('azure-terraform-teardown-receipt.json', 'preserve', 'terraform-completed-teardown-receipt-v1', {
      receipt,
      terminal: authority.terminal,
    });
  }
  const workflow = record('terraform-workflow.json');
  require29(
    canonicalSha256(workflow) === original.checkpointSha256,
    'original workflow differs from owning completed public outcome',
  );
  const bootstrap = object18(workflow.bootstrapByNode),
    payload = {};
  for (const [node, value] of Object.entries(bootstrap)) {
    require29(
      /^[1-3]$/.test(node) && Number(node) <= base.topology.nodeCount && typeof value === 'string',
      'workflow bootstrap schema differs',
    );
    payload[`bootstrapByNode.${node}`] = hash20(value);
  }
  generic('terraform-workflow.json', 'delete', 'terraform-original-workflow-v1', original, payload);
  for (const [name, kind, node] of [
    ['terraform-foundation-plan.json', 'foundation', undefined],
    ...Array.from({ length: base.topology.nodeCount }, (_, index) => [
      `terraform-admission-plan-node-${index + 1}.json`,
      'node-admission',
      index + 1,
    ]),
  ]) {
    const value = records.get(name),
      matches = original.receipts.filter(
        (row) =>
          row.record.stage.kind === kind &&
          (kind !== 'node-admission' ||
            (row.record.stage.kind === 'node-admission' && row.record.stage.node === node)) &&
          same26(row.record.receipt, value),
      );
    require29(matches.length === 1, 'root foundation or admission receipt differs from exact original publication');
    generic(name, 'preserve', 'terraform-original-published-plan-receipt-v1', matches[0]);
  }
  require29(
    same26(records.get('terraform-registration-configuration.json'), outcome.configuration),
    'registered configuration differs from original public outcome',
  );
  require29(
    same26(records.get('terraform-registration-observation.json'), outcome.registrations),
    'registration observation differs from original public outcome',
  );
  for (const name of ['terraform-registration-configuration.json', 'terraform-registration-observation.json'])
    generic(name, 'preserve', 'terraform-original-registration-evidence', {
      originalOutcomeSha256: original.outcomeSha256,
      packetSha256: canonicalSha256(records.get(name)),
    });
  const tokens = new Map(
    teardown.retirement.flatMap((site) =>
      site.tokens.map((token) => [`${token.name}.json`, { ...token, siteName: site.siteName }]),
    ),
  );
  require29(
    tokens.size === teardown.retirement.reduce((total, site) => total + site.tokens.length, 0),
    'duplicate issued token identity',
  );
  for (const [name, token] of tokens) {
    if (!records.has(name)) continue;
    const value = record(name);
    keys10(value, ['jwt', 'node', 'siteName', 'tokenName']);
    require29(
      value.tokenName === token.name &&
        value.node === token.node &&
        value.siteName === token.siteName &&
        typeof value.jwt === 'string' &&
        /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.jwt),
      'issued token schema or identity differs',
    );
    generic(
      name,
      'delete',
      'ce-bootstrap-token-v1',
      { token, teardownPlanSha256: teardown.planSha256 },
      { jwt: hash20(value.jwt) },
    );
  }
  if (records.has('azure-terraform-pending-vm-import.json')) {
    const pendingSession = await context.terraform.open(owner, await azureTerraformCurrentDeployment(base), 'current');
    const pendingAdmission = {
      witness: await qualifyAzureTerraformNetworkEmptyMainBinding(base, store, context, signal),
      context,
    };
    const proof = await readAzureTerraformPendingImportProvenance(
      base,
      store,
      pendingSession,
      signal,
      pendingAdmission,
    );
    const file = byPath.get(proof.path);
    require29(
      file &&
        file.identity === proof.identity &&
        file.sha256 === proof.bytesSha256 &&
        file.packetSha256 === proof.packetSha256,
      'pending import native custody differs from parent snapshot',
    );
    generic(proof.path, 'delete', 'azure-terraform-pending-import-v2', proof, proof.payloadSha256ByField);
  }
  for (const [name, raw] of records) {
    if (rootGeneric.has(name)) continue;
    const value = object18(raw);
    if (name === `terraform-authorization-${base.planSha256}.json`) {
      require29(
        same26(value, {
          schemaVersion: 1,
          engine: 'terraform',
          planSha256: base.planSha256,
          mutations: true,
        }),
        'original deployment authorization differs',
      );
      generic(name, 'preserve', 'terraform-original-authorization-v1', base);
    } else if (name === 'terraform-site.json') {
      keys10(value, ['siteName', 'uid', 'owner', 'contractFingerprint']);
      require29(
        value.siteName === base.siteName &&
          value.uid === context.site.siteUid &&
          same26(value.owner, owner) &&
          value.contractFingerprint === teardown.drain.siteContractFingerprint,
        'original site reservation differs',
      );
      generic(name, 'preserve', 'ce-site-reservation', { owner, siteUid: context.site.siteUid });
    } else if (name === `site-binding-${base.siteName}.json`) {
      keys10(value, [
        'schemaVersion',
        'tenantOrigin',
        'contractFingerprint',
        'siteUid',
        'binding',
        'expectedInterfaces',
      ]);
      require29(
        value.schemaVersion === 1 &&
          same26(value.binding, binding) &&
          value.siteUid === context.site.siteUid &&
          value.contractFingerprint === teardown.drain.siteContractFingerprint &&
          typeof value.tenantOrigin === 'string' &&
          new URL(value.tenantOrigin).origin === value.tenantOrigin &&
          value.tenantOrigin.startsWith('https://') &&
          Array.isArray(value.expectedInterfaces),
        'trusted site binding differs',
      );
      const macs = new Set(),
        roles = new Set();
      for (const rawInterface of value.expectedInterfaces) {
        const row = object18(rawInterface);
        keys10(row, ['node', 'role', 'mac', ...(row.staticIp === undefined ? [] : ['staticIp'])]);
        const role = row.role === 'data' ? 'sli' : row.role;
        require29(
          binding.nodes.includes(String(row.node)) &&
            ['slo', 'sli'].includes(String(role)) &&
            typeof row.mac === 'string' &&
            /^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/i.test(row.mac) &&
            !macs.has(row.mac.toLowerCase()) &&
            !roles.has(`${row.node}/${role}`),
          'bound physical interface differs',
        );
        if (row.staticIp !== undefined) {
          const ip = object18(row.staticIp),
            configured = String(ip.ip_address).split('/');
          keys10(ip, [
            'ip_address',
            ...(ip.default_gw === undefined ? [] : ['default_gw']),
            ...(ip.dns_server === undefined ? [] : ['dns_server']),
          ]);
          require29(
            configured.length === 2 &&
              isIP4(configured[0]) === 4 &&
              /^\d{1,2}$/.test(configured[1]) &&
              Number(configured[1]) <= 32 &&
              [ip.default_gw, ip.dns_server].every((v) => v === undefined || (typeof v === 'string' && isIP4(v) === 4)),
            'static interface schema differs',
          );
        }
        macs.add(row.mac.toLowerCase());
        roles.add(`${row.node}/${role}`);
      }
      require29(
        value.expectedInterfaces.length === binding.nodes.length * 2,
        'complete authoritative interface binding required',
      );
      generic(name, 'preserve', 'ce-deployment-site-binding-v1', { binding, siteUid: context.site.siteUid });
    } else if (name === `public-site-${base.siteName}.json`) {
      keys10(value, ['planId', 'record']);
      const saved = object18(value.record);
      keys10(saved, ['phase', 'resourceVersion', 'uid']);
      require29(
        typeof value.planId === 'string' &&
          /^f5xc-ce-v2-[a-f0-9]{24}$/.test(value.planId) &&
          ['replace-prepared', 'replace-observed'].includes(String(saved.phase)) &&
          saved.uid === context.site.siteUid &&
          typeof saved.resourceVersion === 'string' &&
          saved.resourceVersion.length > 0,
        'public site replacement journal differs',
      );
      generic(name, 'preserve', 'public-site-replacement-journal', { siteUid: context.site.siteUid, value });
    } else if (/^bootstrap-checkout-[a-f0-9-]{36}\.json$/.test(name)) {
      const checkout = object18(value.checkout),
        token = tokens.get(`${String(value.tokenName)}.json`);
      require29(
        value.schemaVersion === 1 &&
          same26(value.owner, owner) &&
          same26(value.binding, binding) &&
          value.siteUid === context.site.siteUid &&
          value.contractFingerprint === teardown.drain.siteContractFingerprint &&
          token &&
          token.node === value.node &&
          name === `bootstrap-checkout-${String(checkout.reference).split('/').at(-1)}.json` &&
          sha16(checkout.digest),
        'opaque checkout provenance differs',
      );
      const upstream = record(`${token.name}.json`);
      require29(
        typeof upstream.jwt === 'string' && hash20(upstream.jwt) === checkout.digest,
        'opaque checkout upstream token differs',
      );
      generic(name, 'preserve', 'ce-bootstrap-checkout-v1', { value, token });
    } else if (name === 'azure-terraform-cloud-destroy-reconciliation.json') {
      require29(
        ['absent', 'owned'].includes(String(value.status)) &&
          (value.status !== 'owned' || value.ownerPlanSha256 === base.planSha256) &&
          value.resourceGroupId ===
            `/subscriptions/${base.subscription.id}/resourceGroups/${base.intent.resourceGroup}`,
        'historical cloud reconciliation differs',
      );
      timestamp3(value.observedAt);
      generic(name, 'preserve', 'terraform-destroy-reconciliation', { value, owner });
    } else if (name === 'platform-drain-source.json') {
      require29(
        same26(value, { sha256: canonicalSha256(teardown.drain), plan: teardown.drain }),
        'drain source differs',
      );
      generic(name, 'preserve', 'ce-platform-drain-source', teardown.drain);
    } else if (name === 'platform-drain-progress.json' || name === 'platform-drain-receipt.json') {
      require29(
        same26(records.get('platform-drain-source.json'), {
          sha256: canonicalSha256(teardown.drain),
          plan: teardown.drain,
        }),
        'drain source missing',
      );
      const completed = [
        ...teardown.drain.listeners.map((row) => `listener:${row.namespace}/${row.name}`),
        ...teardown.drain.origins.map((row) => `origin:${row.origin.namespace}/${row.origin.name}`),
        ...['bgp', 'bgp_routing_policy', 'external_connector'].flatMap((kind) =>
          teardown.drain.sites.flatMap((site) =>
            site.routing.filter((row) => row.kind === kind).map((row) => `${row.kind}:${row.name}`),
          ),
        ),
      ];
      require29(
        value.planSha256 === canonicalSha256(teardown.drain) && same26(value.completed, completed),
        'drain completed target inventory differs',
      );
      timestamp3(value.observedAt);
      if (name.endsWith('progress.json')) {
        keys10(value, ['schemaVersion', 'planSha256', 'completed', 'observedAt']);
        require29(value.schemaVersion === 1, 'drain progress schema differs');
      } else {
        keys10(value, [
          'status',
          'owner',
          'sourcePlanSha256',
          'planSha256',
          'completed',
          'cloud',
          'sites',
          'observedAt',
        ]);
        require29(
          value.status === 'platform-drained' &&
            same26(value.owner, owner) &&
            value.sourcePlanSha256 === base.planSha256 &&
            value.cloud === 'unknown' &&
            value.sites === 'not-retired',
          'drain receipt differs',
        );
      }
      generic(name, 'preserve', 'ce-platform-drain-completed', teardown.drain);
    }
  }
  const locks = new Set(original.receipts.map((row) => row.record.receipt.providerLockSha256));
  require29(locks.size === 1, 'original provider lock inventory differs');
  const providerLockSha256 = [...locks][0];
  const networkPackets = new Set(authority.packets.map((packet) => packet.path));
  const replacement = new Map(
    [...records].filter(
      ([name]) =>
        (isAzureTerraformReplacementHistoricalArtifact(name) && !networkPackets.has(name)) || tokens.has(name),
    ),
  );
  if ([...replacement.keys()].some(isAzureTerraformReplacementHistoricalArtifact)) {
    require29(sha16(providerLockSha256), 'owning provider lock identity required');
    verifyAzureTerraformReplacementHistoricalArtifacts(base, teardown.retirement, replacement, providerLockSha256);
  }
  const relay = new Map([...records].filter(([name]) => azureRelayHistoricalArtifacts.has(name)));
  if (relay.size) verifyAzureRelayHistoricalArtifacts(base, context.site.siteUid, relay);
  const ingress = new Map([...records].filter(([name]) => isAzureIngressHistoricalArtifact(name)));
  if (ingress.size) {
    require29(contracts.ingress, 'verified ingress contract required for historical schema validation');
    verifyAzureIngressHistoricalArtifacts(base, teardown.drain, contracts.ingress, records);
  }
  const failover = new Map(
    [...records].filter(
      ([name]) =>
        isAzureFailoverHistoricalArtifact(name) ||
        azureRelayHistoricalArtifacts.has(name) ||
        name === 'platform-routing.json',
    ),
  );
  if ([...failover.keys()].some(isAzureFailoverHistoricalArtifact))
    await verifyAzureFailoverHistoricalArtifacts(base, context.site.siteUid, failover);
  const upgradeHistory = await verifyAzureTerraformUpgradeHistoricalArtifacts(
    base,
    {
      siteUid: context.site.siteUid,
      physicalSiteUid: teardown.retirement[0].physicalSiteUid,
      siteContractFingerprint: teardown.drain.siteContractFingerprint,
    },
    contracts.upgrade,
    records,
    signal,
  );
  for (const artifact of upgradeHistory.rootArtifacts) {
    require29(
      byPath.get(artifact.path)?.packetSha256 === artifact.packetSha256,
      'upgrade root native identity differs',
    );
    generic(artifact.path, 'preserve', 'azure-terraform-upgrade-root-history-v2', artifact);
  }
  const stages = new Map();
  const upgradeStages = new Set();
  for (const upgrade of upgradeHistory.sources.values()) {
    const stage = upgrade.deployment.stage;
    require29(typeof stage === 'string' && !upgradeStages.has(stage), 'upgrade stage source differs');
    upgradeStages.add(stage);
    const directory = `terraform-stages/${stage}`;
    const staged =
      snapshot.directories.some((row) => row.path === directory || row.path.startsWith(`${directory}/`)) ||
      files.some((row) => row.path.startsWith(`${directory}/`));
    if (!staged) {
      const serial = records.get('terraform-ce-upgrade-serial.json');
      require29(
        !upgradeHistory.rootArtifacts.some((row) => row.path.startsWith(`${upgrade.planId}-`)) &&
          !upgradeHistory.stageRetirementPaths.includes(`${upgrade.planId}-stage-retirement.json`) &&
          (!serial ||
            (object18(serial).activePlanId !== upgrade.planId && object18(serial).lastPlanId !== upgrade.planId)),
        'unstaged upgrade has execution or retirement records',
      );
      continue;
    }
    stages.set(stage, { source: object18(upgrade), deployment: object18(upgrade.deployment), failover: false });
  }
  for (const [name, raw] of records) {
    if (/^azure-ce-failover-[a-f0-9]{24}\.json$/.test(name)) {
      const source = raw;
      verifyAzureCeFailoverPlan(base, source);
      const deployment = await azureTerraformFailoverDeployment(base, source, 'release');
      require29(
        name === `${source.planId}.json` && typeof deployment.stage === 'string' && !stages.has(deployment.stage),
        'failover stage source differs',
      );
      stages.set(deployment.stage, { source: object18(raw), deployment: object18(deployment), failover: true });
    }
  }
  const networkStages = new Map(authority.children.map((child) => [child.stage, child]));
  require29(networkStages.size === authority.children.length, 'duplicate owning network child');
  const directoryDecisions = [];
  const allowedDirectories = new Set(['', base.deploymentName, 'terraform-stages']);
  for (const child of authority.children) {
    const stage = snapshot.directories.find((row) => row.path === `terraform-stages/${child.stage}`);
    require29(stage && same26(stage.names, [base.deploymentName]), 'network child runner owner differs');
    const prefix = `${stage.path}/${base.deploymentName}`,
      proof = object18(child.proof),
      observed = object18(proof.observed),
      receipt = object18(observed.receipt);
    require29(
      byPath.get(`${prefix}/artifact-retirement.json`)?.sha256 === observed.markerSha256 &&
        byPath.get(`${prefix}/deployment.json`)?.packetSha256 === receipt.manifestSha256,
      'owning child marker or manifest differs',
    );
    for (const name of ['deployment.json', 'artifact-retirement.json'])
      decide(`${prefix}/${name}`, 'preserve', 'native-network-child-retirement', {
        retirementSha256: child.retirementSha256,
        proof: child.proof,
      });
    allowedDirectories.add(stage.path);
    allowedDirectories.add(prefix);
  }
  for (const [stageName, stage] of stages) {
    const prefix = `terraform-stages/${stageName}/${base.deploymentName}`;
    const readStage = async (name) => {
      const path = `${prefix}/${name}`,
        native = await readAzureTerraformParentPrivateFile(join25(store.directory, path), signal);
      require29(
        native.identity === byPath.get(path)?.identity && hash20(native.bytes) === byPath.get(path)?.sha256,
        'stage descriptor custody differs',
      );
      return object18(JSON.parse(native.bytes.toString()));
    };
    const marker = await readStage('artifact-retirement.json'),
      manifest = await readStage('deployment.json');
    const retirementName = `${String(stage.source.planId)}-stage-retirement.json`,
      retirement = record(retirementName),
      final = object18(retirement.receipt);
    const { configuration, providerLock, ...identity } = stage.deployment;
    require29(
      typeof configuration === 'string' &&
        typeof providerLock === 'string' &&
        same26(manifest, {
          ...identity,
          configurationSha256: hash20(configuration),
          providerLockSha256: hash20(providerLock),
        }) &&
        retirement.schemaVersion === (stage.failover ? 1 : 2) &&
        retirement.status === 'retired' &&
        same26(retirement.owner, owner) &&
        retirement.sourcePlanSha256 === base.planSha256 &&
        (stage.failover ? retirement.failoverPlanSha256 : retirement.upgradePlanSha256) === stage.source.planSha256 &&
        retirement.deploymentSha256 === canonicalSha256(stage.deployment) &&
        sha16(retirement.evidenceSha256) &&
        retirement.receiptSha256 === canonicalSha256(final) &&
        final.noChanges === true &&
        final.backendIdentity === manifest.backendIdentity &&
        final.configurationSha256 === manifest.configurationSha256 &&
        final.providerLockSha256 === manifest.providerLockSha256 &&
        marker.schemaVersion === 1 &&
        marker.status === 'runner-artifacts-retired' &&
        marker.manifestSha256 === canonicalSha256(manifest) &&
        marker.evidenceSha256 === retirement.evidenceSha256 &&
        marker.finalPlanSha256 === final.planSha256 &&
        marker.planReceiptSha256 === canonicalSha256(final) &&
        Array.isArray(marker.artifacts) &&
        marker.inventorySha256 === hash20(JSON.stringify(marker.artifacts)),
      'retained stage original evidence or native receipt differs',
    );
    if (stage.failover)
      await validateAzureTerraformFailoverRetirement(base, stage.source, retirement, String(retirement.evidenceSha256));
    verifyRetainedCleanup(
      marker.independentCleanup,
      {
        manifestSha256: canonicalSha256(manifest),
        evidenceSha256: String(retirement.evidenceSha256),
        finalPlanSha256: String(final.planSha256),
        planReceiptSha256: canonicalSha256(final),
      },
      marker.independentCleanupSha256,
    );
    if (!stage.failover) {
      require29(
        upgradeHistory.stageRetirementPaths.includes(retirementName) && contracts.upgrade,
        'upgrade native retirement root or trusted contract missing',
      );
      const observed = await readAzureTerraformUpgradeStageRetirement(
        base,
        stage.source,
        contracts.upgrade,
        context.terraform,
        store,
        signal,
      );
      require29(
        same26(observed, retirement.result) &&
          observed.manifestSha256 === canonicalSha256(manifest) &&
          observed.evidenceSha256 === retirement.evidenceSha256 &&
          observed.finalPlanSha256 === final.planSha256 &&
          observed.inventorySha256 === marker.inventorySha256 &&
          observed.independentCleanupSha256 === marker.independentCleanupSha256 &&
          observed.retiredArtifacts === marker.artifacts.length,
        'upgrade completed root result or permanent native barrier differs',
      );
      generic(retirementName, 'preserve', 'azure-terraform-upgrade-native-retirement-v2', {
        originalEvidenceSha256: retirement.evidenceSha256,
        retirementSha256: canonicalSha256(retirement),
        markerSha256: canonicalSha256(marker),
      });
    }
    for (const name of ['deployment.json', 'artifact-retirement.json']) {
      const path = `${prefix}/${name}`,
        logical = name === 'deployment.json' ? manifest : marker;
      require29(byPath.get(path)?.packetSha256 === canonicalSha256(logical), 'retained stage native record differs');
      decide(path, 'preserve', 'native-generic-stage-retirement', {
        sourcePlanSha256: stage.source.planSha256,
        retirement,
        markerSha256: canonicalSha256(marker),
      });
    }
    allowedDirectories.add(`terraform-stages/${stageName}`);
    allowedDirectories.add(prefix);
  }
  for (const file of authority.originalDirectories.files) {
    require29(
      byPath.get(file.path)?.identity === file.identity && byPath.get(file.path)?.sha256 === file.bytesSha256,
      'original receipt metadata native identity differs',
    );
    decide(
      file.path,
      'preserve',
      file.path.includes('publication-fragments/')
        ? 'original-authenticated-publication-fragment'
        : 'original-published-receipt-metadata',
      original,
    );
    allowedDirectories.add(file.path.split('/')[0]);
  }
  for (const name of ['terraform-original-deployment-receipts', 'terraform-original-deployment-publication-fragments'])
    if (snapshot.directories.some((row) => row.path === name)) allowedDirectories.add(name);
  for (const directory of snapshot.directories) {
    require29(allowedDirectories.has(directory.path), 'unclassified root or nested directory');
    if (directory.path === 'terraform-stages')
      require29(
        same26(directory.names, [...networkStages.keys(), ...stages.keys()].sort()),
        'unaccounted stage directory',
      );
    if (directory.path.startsWith('terraform-stages/')) {
      const runner = directory.path.split('/').length === 3;
      require29(
        same26(directory.names, runner ? ['artifact-retirement.json', 'deployment.json'] : [base.deploymentName]),
        'stage namespace differs',
      );
    }
    directoryDecisions.push({
      ...directory,
      action: directory.path === base.deploymentName ? 'owning-transition' : 'preserve',
      schema:
        directory.path === base.deploymentName ? 'owning-native-main-transition' : 'authenticated-parent-namespace',
    });
  }
  const sensitive = new Map(authority.sensitive.map((row) => [row.path, row]));
  require29(sensitive.size === authority.sensitive.length, 'duplicate sensitive schema decision');
  for (const packet of authority.packets) {
    if (decisions.has(packet.path)) continue;
    const file = byPath.get(packet.path),
      selected = sensitive.get(packet.path);
    require29(
      file && file.packetSha256 === packet.packetSha256 && sha16(packet.semanticProvenanceSha256),
      'owning packet authority differs from native bytes',
    );
    if (selected) {
      require29(
        same26(
          {
            path: selected.path,
            identity: selected.identity,
            sha256: selected.sha256,
            packetSha256: selected.packetSha256,
          },
          file,
        ),
        'sensitive schema decision native join differs',
      );
      decide(
        packet.path,
        'delete',
        selected.schema,
        { semanticProvenanceSha256: selected.semanticProvenanceSha256, sourcePlanSha256: selected.sourcePlanSha256 },
        selected.payloadSha256ByField,
      );
    } else
      decide(packet.path, 'preserve', packet.schema, {
        semanticProvenanceSha256: packet.semanticProvenanceSha256,
        packetSha256: packet.packetSha256,
      });
  }
  for (const [name, raw] of records) {
    if (decisions.has(name)) continue;
    if (
      isAzureTerraformReplacementHistoricalArtifact(name) ||
      azureRelayHistoricalArtifacts.has(name) ||
      isAzureIngressHistoricalArtifact(name) ||
      isAzureFailoverHistoricalArtifact(name) ||
      (name === 'platform-routing.json' && [...failover.keys()].some(isAzureFailoverHistoricalArtifact))
    )
      generic(name, 'preserve', 'owning-generic-historical-artifact', {
        value: raw,
        originalPlanSha256: base.planSha256,
      });
  }
  require29(
    files.every((file) => decisions.has(file.path)) && decisions.size === files.length,
    `unclassified parent file blocks complete disposition: ${files
      .filter((file) => !decisions.has(file.path))
      .map((file) => file.path)
      .join(',')}`,
  );
  require29(
    sensitive.size === authority.sensitive.filter((row) => decisions.get(row.path)?.action === 'delete').length,
    'sensitive staging lacks typed deletion',
  );
  require29(
    new Set(directoryDecisions.map((row) => row.path)).size === snapshot.directories.length,
    'duplicate directory disposition',
  );
  signal?.throwIfAborted();
  return {
    parentArtifactDecisions: [...decisions.values()].sort((a, b) => a.path.localeCompare(b.path)),
    parentDirectoryDecisions: directoryDecisions.sort((a, b) => a.path.localeCompare(b.path)),
    completeParentDispositionQualified: true,
  };
}

// plugins/azure/src/ce/terraform-network-parent-inventory.ts
var same27 = (a, b) => canonicalEqual({ value: a }, { value: b });
var hash21 = (bytes) => createHash26('sha256').update(bytes).digest('hex');
var identity4 = (stat) => `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
var safe = (path) =>
  path.split('/').every((part) => /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(part) && part !== '.' && part !== '..');
var sha17 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function require30(value, message) {
  if (!value) throw Error(`Azure network parent inventory: ${message}`);
}
function object19(value) {
  require30(value && typeof value === 'object' && !Array.isArray(value), 'complete record required');
  return value;
}
var parentMarker = 'azure-terraform-parent-artifact-retirement.json';
var terminalName = 'azure-terraform-terminal-cleanup.json';
var lockName2 = '.azure-terraform-lifecycle-lock';
function azureNetworkParentTerminalProjection(value) {
  const record = structuredClone(object19(value));
  for (const name of [
    'phase',
    'artifacts',
    'retirementEvidence',
    'retirementEvidenceSha256',
    'retainedTerminalNetworkCustody',
    'retainedNetworkParentInventory',
    'retainedDestroyConfiguration',
    'retainedDestroyConfigurationSha256',
    'sensitiveStagingRetired',
  ])
    delete record[name];
  return canonicalSha256(record);
}
var witnesses6 = new WeakMap();
async function readAzureTerraformNetworkParentInventory(request, store, context, terminalWitness, signal) {
  const plan = structuredClone(request),
    owner = structuredClone(store.owner),
    root = store.directory,
    teardown = structuredClone(context.destroyTeardown),
    checkpoint = structuredClone(context.terminalCleanup),
    site = structuredClone(context.site),
    { loaders, verifier, replacementVerifier, terraform, publicSession } = context;
  const bindings = [
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'verify', value: store.verify },
    { target: loaders, key: 'loadSource', value: loaders.loadSource },
    { target: loaders, key: 'loadOutcome', value: loaders.loadOutcome },
    { target: terraform, key: 'open', value: terraform.open },
    ...['getSessionId', 'getArtifactsDir', 'getArtifactPath', 'saveArtifact'].map((key) => ({
      target: publicSession,
      key,
      value: Reflect.get(publicSession, key),
    })),
  ];
  const parentContracts = context.parentContracts;
  const contracts = {
    ingress: parentContracts?.ingress,
    upgrade: parentContracts?.upgrade,
    observer: parentContracts?.observer,
    replacementObserver: parentContracts?.replacementObserver,
  };
  const contractBindings = Object.entries(contracts).flatMap(([kind, contract]) =>
    contract
      ? (kind === 'observer' || kind === 'replacementObserver'
          ? ['authenticateRetirementInventory', 'retireSigningMaterial']
          : [
              'identity',
              'publication',
              'releaseTag',
              'commit',
              'fingerprint',
              ...(kind === 'upgrade'
                ? ['build', 'observationPaths']
                : ['build', 'buildOrigin', 'projectObserved', 'projectOriginObserved']),
            ]
        ).map((key) => ({
          target: contract,
          key,
          value: Reflect.get(contract, key),
        }))
      : [],
  );
  const sealContracts = (current) => {
    require30(
      current.parentContracts === parentContracts &&
        current.parentContracts?.ingress === contracts.ingress &&
        current.parentContracts?.upgrade === contracts.upgrade &&
        current.parentContracts?.observer === contracts.observer &&
        current.parentContracts?.replacementObserver === contracts.replacementObserver &&
        contractBindings.every(({ target, key, value }) => Reflect.get(target, key) === value),
      'owning parent contract changed',
    );
  };
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const planSha256 = canonicalSha256({ value: plan }),
    ownerSha256 = canonicalSha256({ value: owner }),
    teardownSha256 = canonicalSha256({ value: teardown }),
    checkpointSha256 = canonicalSha256({ value: checkpoint }),
    siteSha256 = canonicalSha256({ value: site });
  const seal = () => {
    deadline.throwIfAborted();
    sealContracts(context);
    require30(
      canonicalSha256({ value: request }) === planSha256 &&
        canonicalSha256({ value: store.owner }) === ownerSha256 &&
        store.directory === root &&
        canonicalSha256({ value: context.destroyTeardown }) === teardownSha256 &&
        matchesAzureTerraformTerminalSnapshot(context.terminalCleanup, checkpointSha256) &&
        canonicalSha256({ value: context.site }) === siteSha256 &&
        context.loaders === loaders &&
        context.verifier === verifier &&
        context.replacementVerifier === replacementVerifier &&
        context.terraform === terraform &&
        context.publicSession === publicSession &&
        bindings.every(({ target, key, value }) => Reflect.get(target, key) === value),
      'owning context changed',
    );
  };
  const step = async (action, parent) => {
    seal();
    const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
    active.throwIfAborted();
    const aborted = Promise.withResolvers(),
      onAbort = () => aborted.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), aborted.promise]);
      active.throwIfAborted();
      seal();
      return result;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  seal();
  require30(
    plan.engine === 'terraform' &&
      plan.intent.operation === 'deploy' &&
      same27(azureUpgradeBinding(plan).owner, owner) &&
      same27(
        compileAzureTerraformTeardown(
          plan,
          teardown.drain,
          teardown.retirement,
          teardown.pendingAdmissionJournalSha256,
        ),
        teardown,
      ),
    'compiled original deployment or teardown differs',
  );
  const terminal = object19(terminalWitness),
    lineage = object19(terminal.retainedLineage);
  require30(
    sha17(lineage.publicPlanInventorySha256) &&
      sha17(lineage.requestInventorySha256) &&
      terminal.currentEmptyMainJournalCustodyQualified === true &&
      terminal.powerRunnerRetirementQualified === true &&
      terminal.mainRunnerRetirementQualified === false &&
      same27(terminal.owner, owner) &&
      terminal.originalPlanSha256 === plan.planSha256 &&
      terminal.teardownPlanSha256 === teardown.planSha256 &&
      Array.isArray(terminal.retainedPowerChildren) &&
      Array.isArray(lineage.rows),
    'pre-main terminal custody required',
  );
  const checkpointRecord = object19(checkpoint);
  require30(
    checkpointRecord.phase === 'retiring' &&
      typeof checkpointRecord.retainedDestroyConfiguration === 'string' &&
      hash21(checkpointRecord.retainedDestroyConfiguration) === checkpointRecord.configurationSha256,
    'retained source digest required for sensitive staging retirement',
  );
  const nativeStep = async (action, parent) => {
    const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
    const boundary = () => {
      active.throwIfAborted();
      sealContracts(context);
      require30(
        store.directory === root &&
          context.loaders === loaders &&
          context.terraform === terraform &&
          context.publicSession === publicSession &&
          context.verifier === verifier &&
          context.replacementVerifier === replacementVerifier &&
          bindings.every(({ target, key, value }) => Reflect.get(target, key) === value),
        'owning context changed',
      );
    };
    boundary();
    const aborted = Promise.withResolvers(),
      onAbort = () => aborted.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), aborted.promise]);
      boundary();
      return result;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  const snapshot = async (parent, expectedCheckpoint = checkpoint) => {
    seal();
    const directories = [],
      files = [];
    let terminalFile;
    const directory = async (path) => {
      const full = path ? join26(root, path) : root,
        first = await nativeStep(() => lstat23(full), parent);
      require30(
        first.isDirectory() &&
          !first.isSymbolicLink() &&
          first.uid === process.getuid?.() &&
          (first.mode & 63) === 0 &&
          (await nativeStep(() => realpath22(full), parent)) === full,
        'private directory ownership differs',
      );
      const names = (await nativeStep(() => readdir24(full), parent))
        .filter((name) => path || (name !== parentMarker && name !== lockName2))
        .sort();
      const after = await nativeStep(() => lstat23(full), parent);
      require30(
        after.isDirectory() &&
          !after.isSymbolicLink() &&
          identity4(first) === identity4(after) &&
          after.uid === first.uid &&
          (after.mode & 63) === 0,
        'directory changed during read',
      );
      const value = { path, identity: identity4(first), names };
      directories.push(value);
      return value;
    };
    const file = async (path, fragment = false) => {
      require30(safe(path), 'foreign private file path');
      const full = join26(root, path),
        handle = await nativeStep(() => open10(full, constants13.O_RDONLY | constants13.O_NOFOLLOW), parent);
      try {
        const first = await nativeStep(() => handle.stat(), parent),
          bytes = await nativeStep(() => handle.readFile(), parent),
          after = await nativeStep(() => handle.stat(), parent),
          named = await nativeStep(() => lstat23(full), parent);
        require30(
          first.isFile() &&
            first.uid === process.getuid?.() &&
            first.nlink === 1 &&
            (first.mode & 63) === 0 &&
            identity4(first) === identity4(after) &&
            first.size === after.size &&
            first.mtimeMs === after.mtimeMs &&
            first.ctimeMs === after.ctimeMs &&
            named.isFile() &&
            !named.isSymbolicLink() &&
            identity4(named) === identity4(first) &&
            named.nlink === 1 &&
            named.uid === first.uid &&
            (named.mode & 63) === 0,
          'private file bytes or identity changed',
        );
        let logical;
        try {
          logical = fragment ? undefined : JSON.parse(bytes.toString());
        } catch {
          throw Error('Azure network parent inventory: malformed JSON staging');
        }
        const item = {
          path,
          identity: identity4(first),
          sha256: hash21(bytes),
          packetSha256: fragment ? hash21(bytes) : canonicalSha256(logical),
        };
        files.push(item);
        return logical;
      } finally {
        await handle.close();
      }
    };
    const rootDirectory = await directory('');
    for (const name of rootDirectory.names) {
      if (name === terminalName) {
        require30(same27(await file(name), expectedCheckpoint), 'saved terminal checkpoint differs');
        terminalFile = files.pop();
        continue;
      }
      const full = join26(root, name),
        stat = await nativeStep(() => lstat23(full), parent);
      if (stat.isFile()) {
        await file(name);
        continue;
      }
      require30(stat.isDirectory() && !stat.isSymbolicLink(), 'foreign root entry');
      const selected = await directory(name);
      if (name === plan.deploymentName) continue;
      if (name === 'terraform-stages') {
        for (const stage of selected.names) {
          require30(safe(stage), 'foreign stage path');
          const stageDirectory = await directory(`${name}/${stage}`);
          require30(stageDirectory.names.length === 1, 'stage runner is missing or ambiguous');
          const runner = stageDirectory.names[0];
          require30(runner && safe(runner), 'foreign runner path');
          const runnerPath = `${name}/${stage}/${runner}`,
            runnerDirectory = await directory(runnerPath);
          require30(
            same27(runnerDirectory.names, ['artifact-retirement.json', 'deployment.json']),
            'unretired stage artifacts',
          );
          for (const entry of runnerDirectory.names) await file(`${runnerPath}/${entry}`);
        }
      } else if (name === 'terraform-original-deployment-receipts') {
        for (const entry of selected.names) await file(`${name}/${entry}`);
      } else if (name === 'terraform-original-deployment-publication-fragments') {
        for (const entry of selected.names) await file(`${name}/${entry}`, true);
      }
    }
    for (const selected of directories) {
      const full = selected.path ? join26(root, selected.path) : root;
      const stat = await nativeStep(() => lstat23(full), parent);
      const names = (await nativeStep(() => readdir24(full), parent))
        .filter((name) => selected.path || (name !== parentMarker && name !== lockName2))
        .sort();
      require30(
        identity4(stat) === selected.identity && same27(names, selected.names),
        'namespace changed during snapshot',
      );
    }
    seal();
    require30(terminalFile, 'owning terminal checkpoint is absent');
    return {
      terminalFile,
      rootIdentity: rootDirectory.identity,
      rootNames: rootDirectory.names,
      directories: directories.sort((a, b) => a.path.localeCompare(b.path)),
      files: files.sort((a, b) => a.path.localeCompare(b.path)),
    };
  };
  await step(() => store.verify());
  authenticateAzureTerraformNetworkDestroyJournalCustody(terminalWitness, request, store, context, deadline);
  seal();
  const authenticatedTerminal = structuredClone(terminalWitness),
    authenticatedTerminalSha256 = canonicalSha256(authenticatedTerminal);
  const first = await snapshot(),
    nativeByName = new Map(first.files.map((row) => [row.path, row]));
  const authenticated = new Map(),
    provenance = [];
  const absentNetworkPackets = new Set();
  const remember = (name, digest) => {
    const native = nativeByName.get(name);
    require30(
      native && native.packetSha256 === digest && (!authenticated.has(name) || authenticated.get(name) === digest),
      'semantic packet differs from frozen native bytes',
    );
    authenticated.set(name, digest);
  };
  const read = async (name) => {
    const value = await step(() => store.read(name));
    remember(name, canonicalSha256(value));
    return structuredClone(value);
  };
  const verify = () => step(() => store.verify()),
    methods = new Map();
  const rejectMutation = () => {
    throw Error('Parent enrollment cannot mutate storage');
  };
  const readonlyStore = new Proxy(store, {
    get(target, key) {
      if (key === 'read') return read;
      if (key === 'verify') return verify;
      if (['write', 'remove', 'retire'].includes(String(key))) return rejectMutation;
      const value = Reflect.get(target, key, target);
      if (typeof value !== 'function') return value;
      const cached = methods.get(key);
      if (cached && cached.value === value) return cached.bound;
      const bound = value.bind(target);
      methods.set(key, { value, bound });
      return bound;
    },
  });
  const publicBindings = captureAzureNetworkParentPublicBindings(loaders, deadline, seal);
  const semanticLoaders = publicBindings.loaders;
  require30(same27(await semanticLoaders.loadSource(plan.planSha256), plan), 'original public source differs');
  await semanticLoaders.loadOutcome(plan);
  for (const raw of lineage.rows) {
    const row = object19(raw);
    require30(sha17(row.planSha256), 'unresolved public execution source');
    const source = await semanticLoaders.loadSource(row.planSha256);
    let absent = false;
    try {
      await semanticLoaders.loadOutcome(source);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      absent = true;
    }
    require30(
      absent === (row.execution === 'unstaged-no-outcome'),
      'public outcome availability differs from owning lineage',
    );
  }
  const packetAuthorities = new Map();
  const sensitiveDecisions = new Map();
  const sensitive = async (name, schema, source, semanticProvenanceSha256, fields) => {
    const native = nativeByName.get(name),
      expected = authenticated.get(name);
    require30(
      native && expected && native.packetSha256 === expected && sha17(semanticProvenanceSha256),
      'sensitive decision lacks owning semantic and native provenance',
    );
    const value = object19(await readonlyStore.read(name));
    require30(
      value.schemaVersion === 1 &&
        (schema === 'completed-power-preparing-v1' ? value.sourcePlanSha256 : value.planSha256) === source.planSha256,
      'sensitive staging source identity differs',
    );
    const payloadSha256ByField = {};
    for (const field of fields) {
      const payload = value[field];
      if (field === 'originalGraph') {
        require30(
          payload &&
            typeof payload === 'object' &&
            !Array.isArray(payload) &&
            value.graphSha256 === canonicalSha256(payload),
          'sensitive original graph binding differs',
        );
        payloadSha256ByField[field] = canonicalSha256(payload);
      } else {
        require30(typeof payload === 'string', 'sensitive persisted payload schema differs');
        payloadSha256ByField[field] = hash21(payload);
      }
    }
    const decision = {
      path: name,
      action: 'delete',
      schema,
      sourcePlanSha256: source.planSha256,
      identity: native.identity,
      sha256: native.sha256,
      packetSha256: native.packetSha256,
      semanticProvenanceSha256,
      payloadSha256ByField,
    };
    const existing = sensitiveDecisions.get(name);
    require30(!existing || same27(existing, decision), 'conflicting sensitive staging decisions');
    sensitiveDecisions.set(name, decision);
  };
  const allChildren = [];
  for (const raw of lineage.rows) {
    const row = object19(raw);
    require30(
      ['staged-network', 'completed-replacement', 'unstaged-no-outcome'].includes(String(row.execution)),
      'unqualified public lineage',
    );
    if (row.execution === 'unstaged-no-outcome') continue;
    require30(sha17(row.planSha256), 'unresolved public execution source');
    const source = await step(() => semanticLoaders.loadSource(row.planSha256));
    require30(source.planSha256 === row.planSha256, 'loaded public execution differs');
    const packets = await step(() =>
      readAzureTerraformNetworkAuthenticatedPacketInventory(
        source,
        store,
        { loaders: semanticLoaders, site, verifier, replacementVerifier },
        deadline,
      ),
    );
    for (const packet of packets.packets) {
      remember(packet.name, packet.packetSha256);
      const authority = {
        path: packet.name,
        packetSha256: packet.packetSha256,
        schema: `${packets.kind}-owning-packet-v1`,
        semanticProvenanceSha256: packets.provenanceSha256,
      };
      const existing = packetAuthorities.get(packet.name);
      require30(!existing || existing.packetSha256 === authority.packetSha256, 'owning packet authority conflicts');
      packetAuthorities.set(packet.name, authority);
    }
    for (const name of packets.absentPackets) {
      require30(!nativeByName.has(name) && !first.rootNames.includes(name), 'absent network packet is published');
      absentNetworkPackets.add(name);
    }
    provenance.push({ sourcePlanSha256: source.planSha256, kind: packets.kind, sha256: packets.provenanceSha256 });
    if (row.execution === 'staged-network') {
      await sensitive(
        `${source.planId}-terraform-network-source.json`,
        'network-source-v1',
        source,
        packets.provenanceSha256,
        ['source'],
      );
    } else {
      await sensitive(
        `${source.planId}-terraform-network-replacement-source.json`,
        'network-replacement-source-v1',
        source,
        packets.provenanceSha256,
        ['source'],
      );
      await sensitive(
        `${source.planId}-terraform-replacement-source.json`,
        'replacement-private-source-v1',
        source,
        packets.provenanceSha256,
        ['source', 'bootstrap'],
      );
    }
    if (row.execution === 'staged-network') {
      const power = await step(() =>
        readAzureTerraformNetworkPowerRunnerHistory(
          source,
          readonlyStore,
          terraform,
          semanticLoaders,
          site,
          verifier,
          deadline,
          replacementVerifier,
        ),
      );
      for (const [name, packetSha256] of authenticated) {
        if (packetAuthorities.has(name)) continue;
        packetAuthorities.set(name, {
          path: name,
          packetSha256,
          schema: 'owning-network-power-history-v1',
          semanticProvenanceSha256: canonicalSha256(power),
        });
      }
      for (const child of power.rows) {
        const retired = child.retirement;
        require30(
          child.status === 'retired' && retired?.runnerRetirementQualified,
          'complete native child retirement required',
        );
        if (retired.scope === 'selected-completed-network-power-retirement-history') {
          const selected = canonicalSha256({
            planSha256: source.planSha256,
            node: retired.node,
            operation: retired.operation,
          }).slice(0, 24);
          await sensitive(
            `azure-power-completed-retirement-${selected}-preparing.json`,
            'completed-power-preparing-v1',
            source,
            canonicalSha256(retired),
            ['originalGraph'],
          );
        }
        allChildren.push({
          networkPlanSha256: source.planSha256,
          node: retired.node,
          operation: retired.operation,
          stage: child.stage,
          retirementSha256: canonicalSha256(retired),
          proof: structuredClone(retired.proof),
        });
      }
    }
  }
  allChildren.sort((a, b) => a.stage.localeCompare(b.stage));
  require30(same27(allChildren, terminal.retainedPowerChildren), 'retained native child identities differ');
  for (const child of allChildren) {
    const proof = object19(child.proof),
      observed = object19(proof.observed),
      receipt = object19(observed.receipt);
    const stage = first.directories.find((row) => row.path === `terraform-stages/${child.stage}`);
    require30(stage && stage.names.length === 1, 'missing child directory');
    const runner = stage.names[0];
    require30(runner, 'missing child runner');
    const prefix = `${stage.path}/${runner}`;
    require30(
      nativeByName.get(`${prefix}/artifact-retirement.json`)?.sha256 === observed.markerSha256 &&
        nativeByName.get(`${prefix}/deployment.json`)?.packetSha256 === receipt.manifestSha256,
      'native child marker or manifest differs',
    );
  }
  const originalDirectories = await step(() =>
    readAzureTerraformOriginalParentDirectoryInventory(plan, store, semanticLoaders, deadline),
  );
  for (const file of originalDirectories.files) {
    require30(
      nativeByName.get(file.path)?.sha256 === file.bytesSha256 &&
        nativeByName.get(file.path)?.identity === file.identity,
      'original metadata differs from frozen directory',
    );
  }
  const parentNative = new Map([...first.files, first.terminalFile].map((row) => [row.path, row]));
  const parentRead = async (name) => {
    const native = parentNative.get(name);
    require30(native && !name.includes('/'), 'unaccounted generic parent packet');
    const value = await step(() => store.read(name));
    require30(canonicalSha256(value) === native.packetSha256, 'generic parent record differs from native bytes');
    return structuredClone(value);
  };
  const genericStore = new Proxy(readonlyStore, {
    get(target, key) {
      return key === 'read' ? parentRead : Reflect.get(target, key);
    },
  });
  const disposition = await step(() =>
    collectAzureTerraformParentDispositions(
      plan,
      genericStore,
      { ...context, loaders: semanticLoaders },
      first,
      {
        packets: [...packetAuthorities.values()],
        sensitive: [...sensitiveDecisions.values()],
        terminal: authenticatedTerminal,
        children: allChildren,
        originalDirectories,
      },
      deadline,
      contracts,
    ),
  );
  await step(() =>
    recheckAzureTerraformNetworkDestroyJournalCustody(terminalWitness, request, store, context, deadline),
  );
  await step(() => publicBindings.recheck());
  const publicMapping = {
    publicBindings: publicBindings.snapshot(),
    publicPlanInventorySha256: lineage.publicPlanInventorySha256,
    requestInventorySha256: lineage.requestInventorySha256,
  };
  const publicEvidence = await step(() =>
    readAzureTerraformNetworkParentPublicCustody(request, publicSession, publicMapping, deadline),
  );
  require30(same27(await snapshot(), first), 'parent bytes, inode or namespace changed across enrollment');
  const body = {
    schemaVersion: 1,
    scope: 'native-bound-network-parent-inventory',
    owner,
    originalPlanSha256: plan.planSha256,
    teardownPlanSha256: teardown.planSha256,
    mainDirectory: plan.deploymentName,
    ...first,
    networkPacketNames: [...authenticated.keys()].sort(),
    sensitiveStagingDecisions: [...sensitiveDecisions.values()].sort((a, b) => a.path.localeCompare(b.path)),
    ...disposition,
    absentNetworkPacketNames: [...absentNetworkPackets].sort(),
    ...publicMapping,
    publicEvidenceSnapshotSha256: publicEvidence.publicEvidenceSnapshotSha256,
    publicLineageSha256: canonicalSha256(lineage),
    provenance: provenance.sort((a, b) => a.sourcePlanSha256.localeCompare(b.sourcePlanSha256)),
    children: allChildren,
    originalDirectories: structuredClone(originalDirectories),
    terminalProjectionSha256: azureNetworkParentTerminalProjection(checkpoint),
    retainedDestroyConfigurationSha256: hash21(checkpointRecord.retainedDestroyConfiguration),
    parentRetirementQualified: false,
  };
  const digest = canonicalSha256(body);
  witnesses6.set(body, {
    request,
    store,
    context,
    digest,
    async qualifyPublishedEnvelope(currentContext, parent) {
      seal();
      require30(
        canonicalSha256(body) === digest && canonicalSha256(terminalWitness) === authenticatedTerminalSha256,
        'owning parent enrollment or terminal witness changed',
      );
      const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
      const retirementEvidence = {
        ...object19(checkpointRecord.retirementEvidence),
        terminalNetwork: structuredClone(authenticatedTerminal),
        networkParentInventory: structuredClone(body),
      };
      const publishedCheckpoint = {
        ...checkpointRecord,
        retainedTerminalNetworkCustody: structuredClone(authenticatedTerminal),
        retainedNetworkParentInventory: structuredClone(body),
        retirementEvidence,
        retirementEvidenceSha256: canonicalSha256(retirementEvidence),
      };
      const publicationSeal = () => {
        active.throwIfAborted();
        sealContracts(currentContext);
        seal();
        require30(
          same27(currentContext.terminalCleanup, publishedCheckpoint) &&
            same27(currentContext.destroyTeardown, teardown) &&
            same27(currentContext.site, site) &&
            currentContext.loaders === loaders &&
            currentContext.verifier === verifier &&
            currentContext.replacementVerifier === replacementVerifier &&
            currentContext.terraform === terraform &&
            currentContext.publicSession === publicSession,
          'exact owning frozen-envelope publication context required',
        );
        require30(
          canonicalSha256(body) === digest && canonicalSha256(terminalWitness) === authenticatedTerminalSha256,
          'owning parent enrollment or terminal witness changed',
        );
      };
      let publishedTerminalFile;
      const checkSnapshot = async () => {
        publicationSeal();
        const current = await snapshot(active, publishedCheckpoint);
        const { terminalFile: currentTerminalFile, ...currentParent } = current;
        const { terminalFile: originalTerminalFile, ...originalParent } = first;
        require30(
          currentTerminalFile.path === terminalName &&
            originalTerminalFile.path === terminalName &&
            same27(currentParent, originalParent),
          'parent bytes, inode or namespace changed across owning publication',
        );
        require30(
          !publishedTerminalFile || same27(currentTerminalFile, publishedTerminalFile),
          'published terminal bytes or inode changed during qualification',
        );
        publishedTerminalFile ??= structuredClone(currentTerminalFile);
        publicationSeal();
      };
      await checkSnapshot();
      publicationSeal();
      const freshTerminal = await step(
        () => qualifyAzureTerraformNetworkTerminalJournalCustody(request, store, currentContext, active),
        parent,
      );
      publicationSeal();
      const { recordSha256: currentRecordSha256, ...currentProof } = object19(freshTerminal);
      const { recordSha256: originalRecordSha256, ...originalProof } = object19(authenticatedTerminal);
      require30(
        sha17(currentRecordSha256) && sha17(originalRecordSha256) && same27(currentProof, originalProof),
        'terminal custody changed across owning publication',
      );
      await step(() => publicBindings.recheck(), parent);
      await step(() => publicEvidence.recheck(parent), parent);
      await checkSnapshot();
    },
    async recheck(parent) {
      require30(canonicalSha256(body) === digest, 'parent inventory witness changed');
      const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
      require30(same27(await snapshot(parent), first), 'parent bytes, inode or namespace changed');
      await step(
        () => recheckAzureTerraformNetworkDestroyJournalCustody(terminalWitness, request, store, context, active),
        parent,
      );
      require30(same27(await snapshot(parent), first), 'parent bytes, inode or namespace changed');
      await step(() => publicBindings.recheck(), parent);
      await step(() => publicEvidence.recheck(parent), parent);
      require30(same27(await snapshot(parent), first), 'parent bytes, inode or namespace changed');
      seal();
    },
  });
  return body;
}
async function recheckAzureTerraformNetworkParentInventory(witness, request, store, context, signal) {
  signal?.throwIfAborted();
  const bound = witness && typeof witness === 'object' ? witnesses6.get(witness) : undefined;
  require30(
    bound &&
      bound.request === request &&
      bound.store === store &&
      bound.context === context &&
      canonicalSha256(witness) === bound.digest,
    'owning parent inventory witness required',
  );
  await bound.recheck(signal);
}
async function qualifyAzureTerraformNetworkParentPublishedEnvelope(
  witness,
  request,
  store,
  originalContext,
  currentContext,
  signal,
) {
  signal?.throwIfAborted();
  const bound = witness && typeof witness === 'object' ? witnesses6.get(witness) : undefined;
  require30(
    bound &&
      bound.request === request &&
      bound.store === store &&
      bound.context === originalContext &&
      canonicalSha256(witness) === bound.digest,
    'owning parent inventory witness required',
  );
  await bound.qualifyPublishedEnvelope(currentContext, signal);
  require30(canonicalSha256(witness) === bound.digest, 'owning parent inventory witness changed');
}

// plugins/azure/src/ce/terraform-network-terminal-staging-projection.ts
var sha18 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
var hash22 = (value) => createHash27('sha256').update(value).digest('hex');
var same28 = (left, right) => canonicalEqual({ value: left }, { value: right });
function require31(value, message) {
  if (!value) throw Error(`Azure terminal staging projection: ${message}`);
}
function object20(value) {
  require31(value && typeof value === 'object' && !Array.isArray(value), 'complete record required');
  return value;
}
function prepareAzureTerraformNetworkTerminalStagingProjection(checkpoint, observed) {
  const terminal = structuredClone(object20(checkpoint)),
    barrier = object20(observed),
    evidence = object20(terminal.retirementEvidence),
    inventory = object20(terminal.retainedNetworkParentInventory),
    receipt = object20(barrier.receipt),
    final = object20(terminal.final);
  require31(
    terminal.phase === 'retired' &&
      inventory.schemaVersion === 1 &&
      inventory.scope === 'native-bound-network-parent-inventory' &&
      inventory.parentRetirementQualified === false &&
      sha18(terminal.sourcePlanSha256) &&
      terminal.sourcePlanSha256 === inventory.originalPlanSha256 &&
      sha18(terminal.teardownPlanSha256) &&
      terminal.teardownPlanSha256 === inventory.teardownPlanSha256 &&
      same28(evidence.networkParentInventory, inventory) &&
      sha18(terminal.retirementEvidenceSha256) &&
      canonicalSha256(evidence) === terminal.retirementEvidenceSha256 &&
      azureNetworkParentTerminalProjection(terminal) === inventory.terminalProjectionSha256,
    'native-bound protected checkpoint differs',
  );
  require31(
    barrier.status === 'runner-artifacts-retired' &&
      sha18(barrier.markerSha256) &&
      same28(receipt, terminal.artifacts) &&
      receipt.evidenceSha256 === terminal.retirementEvidenceSha256 &&
      sha18(receipt.manifestSha256) &&
      sha18(receipt.independentCleanupSha256) &&
      sha18(final.planSha256) &&
      receipt.finalPlanSha256 === final.planSha256 &&
      final.noChanges === true &&
      final.engine === 'terraform' &&
      final.schemaVersion === 1 &&
      Array.isArray(final.changes) &&
      final.changes.length === 0 &&
      !final.operation &&
      !final.actionInvocations &&
      !final.imports &&
      !final.relinquishments,
    'complete matching native barrier and ordinary final receipt required',
  );
  const digest = inventory.retainedDestroyConfigurationSha256;
  require31(sha18(digest) && digest === terminal.configurationSha256, 'retained destroy digest differs');
  const present = Object.hasOwn(terminal, 'retainedDestroyConfiguration');
  if (present) {
    require31(
      typeof terminal.retainedDestroyConfiguration === 'string' &&
        hash22(terminal.retainedDestroyConfiguration) === digest,
      'retained destroy plaintext differs',
    );
    require31(
      !Object.hasOwn(terminal, 'retainedDestroyConfigurationSha256') ||
        terminal.retainedDestroyConfigurationSha256 === digest,
      'conflicting retained destroy digest',
    );
    delete terminal.retainedDestroyConfiguration;
    terminal.retainedDestroyConfigurationSha256 = digest;
  } else require31(terminal.retainedDestroyConfigurationSha256 === digest, 'missing authenticated destroy digest');
  require31(
    azureNetworkParentTerminalProjection(terminal) === inventory.terminalProjectionSha256,
    'protected checkpoint changed during projection',
  );
  return {
    schemaVersion: 1,
    scope: 'retained-destroy-configuration-projection-only',
    checkpoint: terminal,
    checkpointSha256: canonicalSha256(terminal),
    retainedDestroyConfigurationSha256: digest,
    transformationRequired: present,
    nativeBarrierReadQualified: false,
    parentRetirementQualified: false,
    currentOperationalAcceptanceQualified: false,
  };
}

// plugins/azure/src/ce/terraform-network-retired-main-custody.ts
var same29 = (a, b) => canonicalEqual({ value: a }, { value: b });
var hash23 = (v) => createHash28('sha256').update(v).digest('hex');
var sha19 = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require32(v, message) {
  if (!v) throw Error(`Azure network retired-main custody: ${message}`);
}
function object21(v) {
  require32(v && typeof v === 'object' && !Array.isArray(v), 'complete record required');
  return v;
}
var witnesses7 = new WeakMap();
async function qualifyAzureTerraformNetworkRetiredMainCustody(request, store, context, signal) {
  return qualifyRetiredMainCustody(request, store, context, signal, false);
}
async function qualifyRetiredMainCustody(request, store, context, signal, projectedCheckpoint) {
  const original = structuredClone(request),
    owner = structuredClone(store.owner),
    directory = store.directory,
    teardown = structuredClone(context.destroyTeardown),
    checkpoint = structuredClone(context.terminalCleanup),
    site = structuredClone(context.site),
    { terraform, publicSession, loaders, verifier, replacementVerifier } = context;
  const dependencies = [
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'verify', value: store.verify },
    { target: terraform, key: 'open', value: terraform.open },
    { target: loaders, key: 'loadSource', value: loaders.loadSource },
    { target: loaders, key: 'loadOutcome', value: loaders.loadOutcome },
    ...['getSessionId', 'getArtifactsDir', 'getArtifactPath', 'saveArtifact'].map((key) => ({
      target: publicSession,
      key,
      value: Reflect.get(publicSession, key),
    })),
  ];
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const originalMatches = canonicalSnapshot({ value: original }),
    ownerMatches = canonicalSnapshot({ value: owner }),
    teardownMatches = canonicalSnapshot({ value: teardown }),
    terminalMatches = captureAzureTerraformTerminalSnapshot(checkpoint),
    siteMatches = canonicalSnapshot({ value: site });
  const seal = () => {
    deadline.throwIfAborted();
    require32(
      originalMatches({ value: request }) &&
        ownerMatches({ value: store.owner }) &&
        store.directory === directory &&
        teardownMatches({ value: context.destroyTeardown }) &&
        terminalMatches(context.terminalCleanup) &&
        siteMatches({ value: context.site }) &&
        context.terraform === terraform &&
        context.publicSession === publicSession &&
        context.loaders === loaders &&
        context.verifier === verifier &&
        context.replacementVerifier === replacementVerifier &&
        dependencies.every(({ target, key, value }) => Reflect.get(target, key) === value),
      'owning context changed',
    );
  };
  const step = async (action, parent) => {
    seal();
    const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
    active.throwIfAborted();
    const aborted = Promise.withResolvers(),
      onAbort = () => aborted.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([action(), aborted.promise]);
      active.throwIfAborted();
      seal();
      return value;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  const records = new Map();
  const readRecord = async (name, parent) =>
    step(async () => {
      const logical = await store.read(name),
        file = await open11(join27(directory, name), constants14.O_RDONLY | constants14.O_NOFOLLOW);
      try {
        const first = await file.stat(),
          bytes = await file.readFile(),
          last = await file.stat(),
          named = await lstat24(join27(directory, name));
        let parsed;
        try {
          parsed = JSON.parse(bytes.toString());
        } catch {
          throw Error('Azure network retired-main custody: malformed private record');
        }
        require32(
          first.isFile() &&
            first.uid === process.getuid?.() &&
            first.nlink === 1 &&
            (first.mode & 63) === 0 &&
            last.dev === first.dev &&
            last.ino === first.ino &&
            last.size === first.size &&
            last.mtimeMs === first.mtimeMs &&
            last.ctimeMs === first.ctimeMs &&
            named.isFile() &&
            !named.isSymbolicLink() &&
            named.dev === first.dev &&
            named.ino === first.ino &&
            named.uid === first.uid &&
            named.nlink === 1 &&
            (named.mode & 63) === 0 &&
            same29(parsed, logical),
          'private record custody differs',
        );
        const digest = canonicalSha256({
          identity: `${first.dev}:${first.ino}:${first.birthtimeMs}`,
          bytes: hash23(bytes),
        });
        require32(!records.has(name) || records.get(name) === digest, 'private record bytes or identity changed');
        records.set(name, digest);
        return structuredClone(logical);
      } finally {
        await file.close();
      }
    }, parent);
  const root = await step(() => lstat24(directory));
  require32(
    root.isDirectory() &&
      !root.isSymbolicLink() &&
      root.uid === process.getuid?.() &&
      (root.mode & 63) === 0 &&
      (await step(() => realpath23(directory))) === directory,
    'private root differs',
  );
  require32(
    original.engine === 'terraform' &&
      original.intent.operation === 'deploy' &&
      same29(azureUpgradeBinding(original).owner, owner) &&
      same29(
        compileAzureTerraformTeardown(
          original,
          teardown.drain,
          teardown.retirement,
          teardown.pendingAdmissionJournalSha256,
        ),
        teardown,
      ) &&
      teardown.retirement[0]?.siteUid === site.siteUid,
    'compiled owner or teardown differs',
  );
  await step(() => store.verify());
  require32(same29(await readRecord(`${teardown.planId}.json`), teardown), 'saved teardown differs');
  require32(
    same29(await readRecord(`${teardown.planId}-authorization.json`), {
      schemaVersion: 1,
      engine: 'terraform',
      sourcePlanSha256: original.planSha256,
      teardownPlanSha256: teardown.planSha256,
      mutations: true,
    }),
    'saved authorization differs',
  );
  const lifecycle = object21(await readRecord('azure-terraform-lifecycle-retirement.json'));
  require32(
    lifecycle.schemaVersion === 1 &&
      lifecycle.kind === teardown.kind &&
      same29(lifecycle.owner, owner) &&
      lifecycle.sourcePlanSha256 === original.planSha256 &&
      lifecycle.teardownPlanSha256 === teardown.planSha256,
    'saved lifecycle differs',
  );
  require32(
    same29(await readRecord('azure-terraform-terminal-cleanup.json'), checkpoint),
    'saved terminal checkpoint differs',
  );
  const terminal = object21(checkpoint),
    final = object21(terminal.final),
    destroy = object21(terminal.destroy),
    retained = object21(terminal.retainedTerminalNetworkCustody),
    evidence = object21(terminal.retirementEvidence);
  const deployment = await step(() => azureTerraformCurrentDeployment(original));
  const { configuration, providerLock, ...identity } = deployment;
  const configurationSha256 = hash23(configuration),
    manifestSha256 = canonicalSha256({ ...identity, configurationSha256, providerLockSha256: hash23(providerLock) });
  require32(
    terminal.schemaVersion === 1 &&
      terminal.phase === 'retired' &&
      terminal.sourcePlanSha256 === original.planSha256 &&
      terminal.teardownPlanSha256 === teardown.planSha256 &&
      terminal.emptyConfiguration === configuration &&
      terminal.emptyConfigurationSha256 === configurationSha256 &&
      sha19(terminal.evidenceSha256) &&
      terminal.evidenceSha256 === canonicalSha256(terminal.evidence) &&
      sha19(terminal.retirementEvidenceSha256) &&
      terminal.retirementEvidenceSha256 === canonicalSha256(evidence) &&
      same29(evidence.terminalNetwork, retained) &&
      terminal.checkpointSha256 ===
        canonicalSha256({
          configurationSha256: terminal.configurationSha256,
          emptyConfiguration: configuration,
          destroy,
          evidence: terminal.evidence,
        }),
    'retired checkpoint binding differs',
  );
  require32(
    final.schemaVersion === 1 &&
      final.engine === 'terraform' &&
      final.deploymentId === deployment.deploymentId &&
      final.backendIdentity === deployment.backendIdentity &&
      final.configurationSha256 === configurationSha256 &&
      final.providerLockSha256 === hash23(providerLock) &&
      sha19(final.planSha256) &&
      final.noChanges === true &&
      Array.isArray(final.changes) &&
      final.changes.length === 0 &&
      !final.operation &&
      !final.actionInvocations &&
      !final.imports &&
      !final.relinquishments,
    'exact ordinary final receipt required',
  );
  require32(
    same29(await readRecord('azure-terraform-cloud-destroy-final.json'), destroy) &&
      destroy.operation === 'destroy' &&
      destroy.schemaVersion === 1 &&
      destroy.engine === 'terraform' &&
      destroy.deploymentId === deployment.deploymentId &&
      destroy.backendIdentity === deployment.backendIdentity &&
      destroy.providerLockSha256 === hash23(providerLock) &&
      sha19(destroy.planSha256) &&
      destroy.noChanges === true &&
      Array.isArray(destroy.changes) &&
      destroy.changes.length === 0 &&
      !destroy.actionInvocations &&
      !destroy.imports &&
      !destroy.relinquishments &&
      destroy.configurationSha256 === terminal.configurationSha256 &&
      (projectedCheckpoint
        ? !Object.hasOwn(terminal, 'retainedDestroyConfiguration') &&
          terminal.retainedDestroyConfigurationSha256 === destroy.configurationSha256
        : typeof terminal.retainedDestroyConfiguration === 'string' &&
          hash23(terminal.retainedDestroyConfiguration) === destroy.configurationSha256),
    'retained destroy source differs',
  );
  require32(
    retained.scope === 'post-destroy-authenticated-network-stage-journal-custody' &&
      same29(retained.owner, owner) &&
      same29(retained.site, site) &&
      retained.originalPlanSha256 === original.planSha256 &&
      retained.teardownPlanSha256 === teardown.planSha256 &&
      retained.publicJournalCustodyQualified === true &&
      retained.destroyJournalCustodyQualified === true &&
      retained.currentEmptyMainJournalCustodyQualified === true &&
      retained.powerRunnerRetirementQualified === true &&
      retained.mainRunnerRetirementQualified === false &&
      retained.parentRetirementQualified === false &&
      Array.isArray(retained.retainedPowerChildren) &&
      Array.isArray(retained.stages),
    'qualified retained terminal custody required',
  );
  const emptyBinding = object21(retained.emptyMainBinding);
  require32(
    emptyBinding.scope === 'authenticated-terminal-empty-main-configuration-binding' &&
      same29(emptyBinding.owner, owner) &&
      same29(emptyBinding.site, site) &&
      emptyBinding.originalPlanSha256 === original.planSha256 &&
      emptyBinding.teardownPlanSha256 === teardown.planSha256 &&
      emptyBinding.configurationSha256 === configurationSha256 &&
      emptyBinding.retainedDestroyConfigurationSha256 === destroy.configurationSha256 &&
      emptyBinding.finalReceiptSha256 === canonicalSha256(final),
    'retained empty-main binding differs',
  );
  const nativeFiles = new Map();
  const nativeDirectories = new Map();
  const nativeDirectory = async (path, parent) =>
    step(async () => {
      const before = await lstat24(path),
        names = (await readdir25(path)).sort(),
        after = await lstat24(path);
      require32(
        before.isDirectory() &&
          !before.isSymbolicLink() &&
          before.uid === process.getuid?.() &&
          (before.mode & 63) === 0 &&
          (await realpath23(path)) === path &&
          after.isDirectory() &&
          !after.isSymbolicLink() &&
          before.dev === after.dev &&
          before.ino === after.ino &&
          before.birthtimeMs === after.birthtimeMs &&
          after.uid === before.uid &&
          (after.mode & 63) === 0,
        'native directory custody differs',
      );
      const snapshot = { identity: `${before.dev}:${before.ino}:${before.birthtimeMs}`, names };
      require32(
        !nativeDirectories.has(path) || same29(nativeDirectories.get(path), snapshot),
        'native directory identity or inventory changed',
      );
      nativeDirectories.set(path, snapshot);
      return names;
    }, parent);
  const nativeFile = async (path, expectedSha256, parent) =>
    step(async () => {
      const file = await open11(path, constants14.O_RDONLY | constants14.O_NOFOLLOW);
      try {
        const first = await file.stat(),
          bytes = await file.readFile(),
          last = await file.stat(),
          named = await lstat24(path);
        require32(
          first.isFile() &&
            first.uid === process.getuid?.() &&
            first.nlink === 1 &&
            (first.mode & 63) === 0 &&
            last.dev === first.dev &&
            last.ino === first.ino &&
            last.size === first.size &&
            last.mtimeMs === first.mtimeMs &&
            last.ctimeMs === first.ctimeMs &&
            named.isFile() &&
            !named.isSymbolicLink() &&
            named.dev === first.dev &&
            named.ino === first.ino &&
            named.birthtimeMs === first.birthtimeMs &&
            named.uid === first.uid &&
            named.nlink === 1 &&
            (named.mode & 63) === 0,
          'native file changed during read',
        );
        const snapshot = { identity: `${first.dev}:${first.ino}:${first.birthtimeMs}`, bytes: hash23(bytes) };
        require32(
          (expectedSha256 === undefined || snapshot.bytes === expectedSha256) &&
            (!nativeFiles.has(path) || same29(nativeFiles.get(path), snapshot)),
          'native file bytes or identity changed',
        );
        nativeFiles.set(path, snapshot);
        return bytes;
      } finally {
        await file.close();
      }
    }, parent);
  const nativeBoundary = async (parent) => {
    for (const path of nativeDirectories.keys()) await nativeDirectory(path, parent);
    for (const path of nativeFiles.keys()) await nativeFile(path, undefined, parent);
  };
  const session = await step(() => terraform.open(owner, deployment, 'current')),
    readRetirement = session.readArtifactRetirement;
  require32(typeof readRetirement === 'function', 'owning native permanent barrier reader required');
  dependencies.push({ target: session, key: 'readArtifactRetirement', value: readRetirement });
  const authenticatedPower = new Map();
  const inspect = async (parent) => {
    const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
    await nativeBoundary(parent);
    for (const name of await nativeDirectory(directory, parent))
      if (name.endsWith('.json')) await readRecord(name, parent);
    for (const name of records.keys()) await readRecord(name, parent);
    const mainDirectory = join27(directory, deployment.deploymentId);
    require32(
      same29(await nativeDirectory(mainDirectory, parent), ['artifact-retirement.json', 'deployment.json']),
      'native main inventory differs',
    );
    const observed = await step(
      () => readRetirement.call(session, final, terminal.retirementEvidenceSha256, active),
      parent,
    );
    require32(observed.status === 'runner-artifacts-retired', 'native main barrier is absent or incomplete');
    require32(
      sha19(observed.markerSha256) &&
        same29(observed.receipt, terminal.artifacts) &&
        observed.receipt.manifestSha256 === manifestSha256 &&
        observed.receipt.evidenceSha256 === terminal.retirementEvidenceSha256 &&
        observed.receipt.finalPlanSha256 === final.planSha256 &&
        sha19(observed.receipt.independentCleanupSha256),
      'native main barrier binding differs',
    );
    if (projectedCheckpoint) {
      const projection = prepareAzureTerraformNetworkTerminalStagingProjection(checkpoint, observed);
      require32(
        !projection.transformationRequired && same29(projection.checkpoint, checkpoint),
        'exact post-plaintext checkpoint and frozen parent barrier required',
      );
    }
    await nativeFile(join27(mainDirectory, 'artifact-retirement.json'), observed.markerSha256, parent);
    require32(
      same29(JSON.parse((await nativeFile(join27(mainDirectory, 'deployment.json'), undefined, parent)).toString()), {
        ...identity,
        configurationSha256,
        providerLockSha256: hash23(providerLock),
      }),
      'native main manifest differs',
    );
    const lineage = await step(
      () =>
        readAzureTerraformNetworkRetirementLineage(
          original,
          publicSession,
          store,
          loaders,
          site,
          verifier,
          active,
          replacementVerifier,
        ),
      parent,
    );
    require32(
      same29(lineage, retained.retainedLineage) &&
        lineage.rows.every((row) =>
          ['staged-network', 'completed-replacement', 'unstaged-no-outcome'].includes(row.execution),
        ),
      'retained public lineage differs',
    );
    const children = [];
    for (const row of lineage.rows.filter((row) => row.execution === 'staged-network')) {
      const source = await step(() => loaders.loadSource(row.planSha256), parent);
      require32(
        source.planSha256 === row.planSha256 && same29(azureUpgradeBinding(source).owner, owner),
        'retained child source differs',
      );
      let power = authenticatedPower.get(row.planSha256);
      if (!power) {
        power = await step(
          () =>
            readAzureTerraformNetworkPowerRunnerHistory(
              source,
              store,
              terraform,
              loaders,
              site,
              verifier,
              active,
              replacementVerifier,
            ),
          parent,
        );
        authenticatedPower.set(row.planSha256, structuredClone(power));
      }
      require32(power.graphSha256 === row.graphSha256 && power.rows.length > 0, 'retained child graph differs');
      for (const child of power.rows) {
        const retirement = child.retirement;
        require32(
          child.status === 'retired' &&
            retirement?.runnerRetirementQualified &&
            retirement.sourcePlanSha256 === row.planSha256 &&
            retirement.stage === child.stage,
          'retained child native marker incomplete',
        );
        const stageDirectory = join27(directory, 'terraform-stages', child.stage);
        const runnerNames = await nativeDirectory(stageDirectory, parent);
        const runnerName = runnerNames[0];
        require32(
          runnerNames.length === 1 && typeof runnerName === 'string' && /^[a-zA-Z0-9_-]+$/.test(runnerName),
          'native child runner identity differs',
        );
        const runnerDirectory = join27(stageDirectory, runnerName);
        require32(
          same29(await nativeDirectory(runnerDirectory, parent), ['artifact-retirement.json', 'deployment.json']),
          'native child inventory differs',
        );
        const proof = object21(retirement.proof),
          observedChild = object21(proof.observed),
          childReceipt = object21(observedChild.receipt);
        require32(
          observedChild.status === 'runner-artifacts-retired' &&
            sha19(observedChild.markerSha256) &&
            sha19(childReceipt.manifestSha256),
          'native child proof incomplete',
        );
        await nativeFile(join27(runnerDirectory, 'artifact-retirement.json'), observedChild.markerSha256, parent);
        require32(
          canonicalSha256(
            JSON.parse((await nativeFile(join27(runnerDirectory, 'deployment.json'), undefined, parent)).toString()),
          ) === childReceipt.manifestSha256,
          'native child manifest differs',
        );
        children.push({
          networkPlanSha256: row.planSha256,
          node: retirement.node,
          operation: retirement.operation,
          stage: child.stage,
          retirementSha256: canonicalSha256(retirement),
          proof: structuredClone(retirement.proof),
        });
      }
    }
    children.sort((a, b) => a.stage.localeCompare(b.stage));
    require32(
      same29(children, retained.retainedPowerChildren) &&
        same29(children.map((child) => child.stage).sort(), retained.stages) &&
        new Set(children.map((child) => `${child.networkPlanSha256}:${child.node}:${child.operation}`)).size ===
          children.length,
      'retained child identities differ, duplicate or are partial',
    );
    require32(
      same29(
        await step(
          () =>
            readAzureTerraformNetworkRetirementLineage(
              original,
              publicSession,
              store,
              loaders,
              site,
              verifier,
              active,
              replacementVerifier,
            ),
          parent,
        ),
        lineage,
      ),
      'public lineage changed',
    );
    require32(
      same29(
        await step(() => readRetirement.call(session, final, terminal.retirementEvidenceSha256, active), parent),
        observed,
      ),
      'native main barrier changed',
    );
    await nativeBoundary(parent);
    for (const name of records.keys()) await readRecord(name, parent);
    const now = await step(() => lstat24(directory), parent);
    require32(
      now.dev === root.dev &&
        now.ino === root.ino &&
        now.birthtimeMs === root.birthtimeMs &&
        now.isDirectory() &&
        !now.isSymbolicLink() &&
        now.uid === root.uid &&
        (now.mode & 63) === 0,
      'private root changed',
    );
    await finalNativeBoundary(parent);
    seal();
    return {
      children,
      lineageSha256: canonicalSha256(lineage),
      markerSha256: observed.markerSha256,
      receiptSha256: canonicalSha256(observed.receipt),
    };
  };
  let projectedIdentity;
  const nativeRecordBoundary = async (parent, projected = false) => {
    for (const name of records.keys()) {
      const file = await step(() => readAzureTerraformParentPrivateFile(join27(directory, name), parent), parent);
      if (projected && name === 'azure-terraform-terminal-cleanup.json') {
        const expected = prepareAzureTerraformNetworkTerminalStagingProjection(checkpoint, {
          status: 'runner-artifacts-retired',
          markerSha256: first.markerSha256,
          receipt: terminal.artifacts,
        });
        require32(
          expected.transformationRequired &&
            hash23(file.bytes) === hash23(JSON.stringify(expected.checkpoint)) &&
            same29(JSON.parse(file.bytes.toString()), expected.checkpoint) &&
            (projectedIdentity === undefined || projectedIdentity === file.identity),
          'exact projected terminal custody differs',
        );
        projectedIdentity = file.identity;
      } else
        require32(
          records.get(name) ===
            canonicalSha256({
              identity: file.identity,
              bytes: hash23(file.bytes),
            }),
          'private record bytes or identity changed',
        );
    }
  };
  const finalNativeBoundary = async (parent, projected = false) => {
    seal();
    await nativeRecordBoundary(parent, projected);
    await nativeBoundary(parent);
    const now = await step(() => lstat24(directory), parent);
    require32(
      now.dev === root.dev &&
        now.ino === root.ino &&
        now.birthtimeMs === root.birthtimeMs &&
        now.isDirectory() &&
        !now.isSymbolicLink() &&
        now.uid === root.uid &&
        (now.mode & 63) === 0 &&
        (await step(() => realpath23(directory), parent)) === directory,
      'private root changed',
    );
    seal();
  };
  const first = await inspect();
  const result = {
    schemaVersion: 1,
    scope: projectedCheckpoint
      ? 'post-plaintext-retired-main-authenticated-network-stage-custody'
      : 'retired-main-authenticated-network-stage-custody',
    owner,
    site,
    originalPlanSha256: original.planSha256,
    teardownPlanSha256: teardown.planSha256,
    stages: first.children.map((child) => child.stage).sort(),
    retainedPowerChildren: first.children,
    retainedLineageSha256: first.lineageSha256,
    mainMarkerSha256: first.markerSha256,
    mainRetirementReceiptSha256: first.receiptSha256,
    retainedTerminalCustodySha256: canonicalSha256(retained),
    publicJournalCustodyQualified: true,
    powerRunnerRetirementQualified: true,
    mainRunnerRetirementQualified: true,
    parentRetirementQualified: false,
    independentCloudCleanupQualified: false,
    emptyStateQualified: false,
    currentOperationalAcceptanceQualified: false,
  };
  const digest = canonicalSha256(result);
  witnesses7.set(result, {
    request,
    store,
    context,
    digest,
    async recheck(parent) {
      require32(
        canonicalSha256(result) === digest && same29(await inspect(parent), first),
        'retained main custody changed',
      );
    },
    async nativeRecheck(projected, parent) {
      require32(canonicalSha256(result) === digest, 'retained main custody changed');
      await finalNativeBoundary(parent, projected);
    },
  });
  return result;
}
async function recheckAzureTerraformNetworkRetiredMainCustody(witness, request, store, context, signal) {
  signal?.throwIfAborted();
  const bound = witness && typeof witness === 'object' ? witnesses7.get(witness) : undefined;
  require32(
    bound &&
      bound.request === request &&
      bound.store === store &&
      bound.context === context &&
      canonicalSha256(witness) === bound.digest,
    'owning retired-main witness required',
  );
  await bound.recheck(signal);
}
async function recheckAzureTerraformNetworkRetiredMainNativeCustody(
  witness,
  request,
  store,
  context,
  projected,
  signal,
) {
  signal?.throwIfAborted();
  const bound = witness && typeof witness === 'object' ? witnesses7.get(witness) : undefined;
  require32(
    bound &&
      bound.request === request &&
      bound.store === store &&
      bound.context === context &&
      canonicalSha256(witness) === bound.digest,
    'owning retired-main witness required',
  );
  await bound.nativeRecheck(projected, signal);
}

// plugins/azure/src/ce/terraform-network-destroy-journal-custody.ts
var same30 = (a, b) => canonicalEqual({ value: a }, { value: b });
var hash24 = (bytes) => createHash29('sha256').update(bytes).digest('hex');
var sha20 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function require33(value, message) {
  if (!value) throw Error(`Azure Terraform network destroy journal custody: ${message}`);
}
function object22(value) {
  require33(value && typeof value === 'object' && !Array.isArray(value), 'record object required');
  return value;
}
function keys11(value, fields) {
  require33(same30(Object.keys(object22(value)).sort(), fields.toSorted()), 'native journal schema differs');
}
var witnesses8 = new WeakMap();
async function qualifyAzureTerraformNetworkJournalCustody(request, store, context, signal, emptyMainAdmission) {
  const original = structuredClone(request),
    teardown = structuredClone(context.destroyTeardown),
    owner = structuredClone(store.owner),
    directory = store.directory,
    site = structuredClone(context.site),
    { publicSession, terraform, loaders, verifier, replacementVerifier } = context;
  const dependencies = [
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'verify', value: store.verify },
    { target: terraform, key: 'open', value: terraform.open },
    { target: loaders, key: 'loadSource', value: loaders.loadSource },
    { target: loaders, key: 'loadOutcome', value: loaders.loadOutcome },
    ...['getSessionId', 'getArtifactsDir', 'getArtifactPath', 'saveArtifact'].map((key) => ({
      target: publicSession,
      key,
      value: Reflect.get(publicSession, key),
    })),
  ];
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require33(
      same30(request, original) &&
        same30(store.owner, owner) &&
        store.directory === directory &&
        context.publicSession === publicSession &&
        context.terraform === terraform &&
        context.loaders === loaders &&
        context.verifier === verifier &&
        context.replacementVerifier === replacementVerifier &&
        same30(context.site, site) &&
        same30(context.destroyTeardown, teardown) &&
        dependencies.every(({ target, key, value }) => Reflect.get(target, key) === value),
      'owning request or dependency changed',
    );
  };
  const step = async (action, parentSignal) => {
    seal();
    const active = AbortSignal.any([deadline, ...(parentSignal ? [parentSignal] : [])]);
    active.throwIfAborted();
    const canceled = Promise.withResolvers(),
      onAbort = () => canceled.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), canceled.promise]);
      active.throwIfAborted();
      seal();
      return result;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  const namespace = () =>
    step(async () => {
      const stat = await lstat25(directory);
      require33(
        stat.isDirectory() &&
          !stat.isSymbolicLink() &&
          stat.uid === process.getuid?.() &&
          (stat.mode & 63) === 0 &&
          (await realpath24(directory)) === directory,
        'private directory differs',
      );
      return { identity: `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`, names: (await readdir26(directory)).sort() };
    });
  const recordDigests = new Map();
  const readRecord = async (name) => {
    const value = structuredClone(await step(() => store.read(name)));
    const native = await step(async () => {
      const file = await openFile4(join28(directory, name), constants15.O_RDONLY | constants15.O_NOFOLLOW);
      try {
        const before = await file.stat();
        require33(
          before.isFile() && before.uid === process.getuid?.() && before.nlink === 1 && (before.mode & 63) === 0,
          'record file ownership differs',
        );
        const bytes = await file.readFile(),
          after = await file.stat(),
          named = await lstat25(join28(directory, name));
        require33(
          after.dev === before.dev &&
            after.ino === before.ino &&
            after.size === before.size &&
            after.mtimeMs === before.mtimeMs &&
            after.ctimeMs === before.ctimeMs &&
            named.isFile() &&
            !named.isSymbolicLink() &&
            named.dev === before.dev &&
            named.ino === before.ino &&
            named.uid === before.uid &&
            named.nlink === 1 &&
            (named.mode & 63) === 0,
          'record changed during native read',
        );
        require33(same30(JSON.parse(bytes.toString()), value), 'record reader differs from native bytes');
        return canonicalSha256({ identity: `${before.dev}:${before.ino}:${before.birthtimeMs}`, bytes: hash24(bytes) });
      } finally {
        await file.close();
      }
    });
    require33(!recordDigests.has(name) || recordDigests.get(name) === native, 'record bytes or identity changed');
    recordDigests.set(name, native);
    return value;
  };
  seal();
  require33(
    original.engine === 'terraform' &&
      original.intent.operation === 'deploy' &&
      same30(azureUpgradeBinding(original).owner, owner) &&
      same30(
        compileAzureTerraformTeardown(
          original,
          teardown.drain,
          teardown.retirement,
          teardown.pendingAdmissionJournalSha256,
        ),
        teardown,
      ) &&
      teardown.retirement[0]?.siteUid === site.siteUid,
    'compiled teardown source, owner or site differs',
  );
  await step(() => store.verify());
  const root = await namespace();
  require33(same30(await readRecord(`${teardown.planId}.json`), teardown), 'saved teardown source differs');
  const authorization = object22(await readRecord(`${teardown.planId}-authorization.json`)),
    lifecycle = object22(await readRecord('azure-terraform-lifecycle-retirement.json'));
  require33(
    same30(authorization, {
      schemaVersion: 1,
      engine: 'terraform',
      sourcePlanSha256: original.planSha256,
      teardownPlanSha256: teardown.planSha256,
      mutations: true,
    }) &&
      lifecycle.schemaVersion === 1 &&
      lifecycle.kind === teardown.kind &&
      same30(lifecycle.owner, owner) &&
      lifecycle.sourcePlanSha256 === original.planSha256 &&
      lifecycle.teardownPlanSha256 === teardown.planSha256,
    'saved lifecycle or destruction authorization differs',
  );
  const plan = await readRecord('azure-terraform-cloud-destroy-plan.json'),
    final = await readRecord('azure-terraform-cloud-destroy-final.json');
  const deployment = await step(() => azureTerraformCurrentDeployment(original)),
    { configuration: _configuration, providerLock, ...identity } = deployment;
  const manifestOf = (configurationSha256) =>
    canonicalSha256({
      ...identity,
      configurationSha256,
      providerLockSha256: hash24(providerLock),
    });
  for (const receipt of [plan, final]) {
    require33(
      receipt &&
        receipt.schemaVersion === 1 &&
        receipt.engine === 'terraform' &&
        receipt.operation === 'destroy' &&
        receipt.deploymentId === deployment.deploymentId &&
        receipt.backendIdentity === deployment.backendIdentity &&
        sha20(receipt.planSha256) &&
        sha20(receipt.configurationSha256) &&
        receipt.providerLockSha256 === hash24(providerLock) &&
        !receipt.actionInvocations &&
        !receipt.imports &&
        !receipt.relinquishments &&
        Array.isArray(receipt.changes) &&
        typeof receipt.noChanges === 'boolean' &&
        receipt.noChanges === (receipt.changes.length === 0) &&
        receipt.changes.every((change) => change.actions.join(',') === 'delete') &&
        new Set(receipt.changes.map((change) => change.address)).size === receipt.changes.length,
      'exact owning delete-only destroy receipt required',
    );
  }
  require33(
    final.noChanges && final.changes.length === 0 && plan.configurationSha256 === final.configurationSha256,
    'final destroy receipt or configuration differs',
  );
  const session = await step(() => terraform.open(owner, deployment, 'current'));
  const {
    readConfiguration,
    readConfigurationSha256,
    readPlanApplicationHistory: readHistory,
    readCurrentPlanJournal: readCurrent,
  } = session;
  require33(
    typeof readConfiguration === 'function' &&
      typeof readConfigurationSha256 === 'function' &&
      typeof readHistory === 'function' &&
      typeof readCurrent === 'function',
    'owning current and historical native journal readers required',
  );
  for (const key of [
    'readConfiguration',
    'readConfigurationSha256',
    'readPlanApplicationHistory',
    'readPlanJournalInventory',
    'readCurrentPlanJournal',
  ])
    dependencies.push({ target: session, key, value: Reflect.get(session, key) });
  const recheckEmpty = async (parent) => {
    if (emptyMainAdmission)
      await step(
        () =>
          recheckAzureTerraformNetworkEmptyMainBinding(
            emptyMainAdmission.witness,
            original.planSha256,
            store,
            emptyMainAdmission.context,
            AbortSignal.any([deadline, ...(parent ? [parent] : [])]),
          ),
        parent,
      );
  };
  await recheckEmpty();
  const currentConfigurationSha256 = emptyMainAdmission?.witness.configurationSha256 ?? final.configurationSha256;
  const source = emptyMainAdmission
    ? String(emptyMainAdmission.context.terminalCleanup.retainedDestroyConfiguration)
    : await step(() => readConfiguration.call(session, final.configurationSha256));
  require33(
    hash24(source) === final.configurationSha256 &&
      (await step(() => readConfigurationSha256.call(session))) === currentConfigurationSha256,
    'owning current configuration bytes differ',
  );
  const resources = object22(object22(JSON.parse(source)).resource),
    addresses = new Set();
  for (const [type, rows] of Object.entries(resources))
    for (const name of Object.keys(object22(rows))) addresses.add(`${type}.${name}`);
  require33(
    plan.changes.every((change) => addresses.has(change.address) && change.address.startsWith(`${change.type}.`)),
    'destroy receipt includes resource outside authenticated current configuration',
  );
  const inspect = async (parentSignal) => {
    const active = AbortSignal.any([deadline, ...(parentSignal ? [parentSignal] : [])]);
    active.throwIfAborted();
    await recheckEmpty(parentSignal);
    const history = await step(
      () =>
        readAzureTerraformNetworkAllOriginalCustody(
          original,
          publicSession,
          store,
          terraform,
          loaders,
          site,
          verifier,
          active,
          replacementVerifier,
          emptyMainAdmission,
        ),
      parentSignal,
    );
    const nativeRootAccounted = emptyMainAdmission
      ? history.sharedMain.status === 'partial' &&
        history.sharedMain.incompleteArchives === 0 &&
        same30(history.sharedMain.unrecognizedRootEntrySha256s, [
          emptyMainAdmission.witness.cancellationRecordNameSha256,
        ])
      : history.sharedMain.status === 'complete' && history.sharedMain.unrecognizedRootEntrySha256s?.length === 0;
    require33(
      nativeRootAccounted &&
        history.sharedMain.originalDeploymentJournalsQualified &&
        history.lineage.configurationSha256s.includes(final.configurationSha256),
      `complete retained original native custody and known configuration required: ${JSON.stringify({ status: history.sharedMain.status, incompleteArchives: history.sharedMain.incompleteArchives, unrecognizedRoots: history.sharedMain.unrecognizedRootEntrySha256s?.length, exactCancellation: emptyMainAdmission ? same30(history.sharedMain.unrecognizedRootEntrySha256s, [emptyMainAdmission.witness.cancellationRecordNameSha256]) : undefined, originalQualified: history.sharedMain.originalDeploymentJournalsQualified, knownConfiguration: history.lineage.configurationSha256s.includes(final.configurationSha256) })}`,
    );
    const currentReceipt = emptyMainAdmission ? emptyMainAdmission.context.terminalCleanup.final : final;
    const current = await step(() => readCurrent.call(session, currentConfigurationSha256, active), parentSignal);
    keys11(current, [
      'schemaVersion',
      'scope',
      'state',
      'receipt',
      'manifestSha256',
      'journalSha256',
      'savedPlanSha256',
      'planSemanticsQualified',
      'executionSha256',
      'ordinaryRefreshEnabled',
    ]);
    require33(current.state === 'planned' || current.state === 'applied', 'current destroy receipt is unresolved');
    require33(
      current.schemaVersion === 1 &&
        current.scope === 'current-saved-plan-byte-and-journal-binding' &&
        current.planSemanticsQualified === false &&
        same30(current.receipt, currentReceipt) &&
        current.savedPlanSha256 === currentReceipt.planSha256 &&
        current.manifestSha256 === manifestOf(currentConfigurationSha256) &&
        sha20(current.journalSha256) &&
        sha20(current.executionSha256) &&
        current.ordinaryRefreshEnabled === !!emptyMainAdmission,
      'exact current destroy saved-plan and execution binding required',
    );
    const consumed = [];
    for (const [phase, receipt] of [
      ['destroy', plan],
      ['final', final],
      ...(emptyMainAdmission ? [['ordinary-empty-final', currentReceipt]] : []),
    ]) {
      const native = await step(() => readHistory.call(session, receipt, active), parentSignal);
      keys11(native, [
        'schemaVersion',
        'scope',
        'receiptSha256',
        'manifestSha256',
        'incompleteArchives',
        'matches',
        'applicationOutcomeQualified',
        'retirementQualified',
      ]);
      require33(
        native.schemaVersion === 1 &&
          native.scope === 'exact-saved-plan-journal-history' &&
          native.receiptSha256 === canonicalSha256(receipt) &&
          native.manifestSha256 === manifestOf(currentConfigurationSha256) &&
          native.incompleteArchives === 0 &&
          native.applicationOutcomeQualified === false &&
          native.retirementQualified === false &&
          Array.isArray(native.matches) &&
          native.matches.length > 0,
        'complete exact destroy application history required',
      );
      const seen = new Set();
      for (const match of native.matches) {
        keys11(match, [
          'location',
          'archiveSha256',
          'state',
          'journalSha256',
          'savedPlanSha256',
          'configurationSha256',
          'manifestSha256',
        ]);
        const occurrence = `${match.location}:${match.archiveSha256}`;
        require33(
          ['current', 'revision', 'plan-history'].includes(match.location) &&
            !seen.has(occurrence) &&
            sha20(match.archiveSha256) &&
            sha20(match.journalSha256) &&
            match.savedPlanSha256 === receipt.planSha256 &&
            match.configurationSha256 === receipt.configurationSha256 &&
            match.manifestSha256 === manifestOf(receipt.configurationSha256) &&
            ['planned', 'applied'].includes(match.state),
          'foreign, duplicate or unresolved destroy history',
        );
        seen.add(occurrence);
      }
      require33(
        receipt.noChanges || native.matches.some((match) => match.state === 'applied'),
        'destroy mutation lacks exact consumed native application',
      );
      consumed.push({ phase, receiptSha256: canonicalSha256(receipt), historySha256: canonicalSha256(native) });
    }
    const pendingName = 'azure-terraform-pending-vm-import.json';
    const pendingProof = root.names.includes(pendingName)
      ? await step(
          () => readAzureTerraformPendingImportProvenance(original, store, session, active, emptyMainAdmission),
          parentSignal,
        )
      : undefined;
    const pendingReceipt = pendingProof ? object22(await readRecord(pendingName)).receipt : undefined;
    if (pendingProof) {
      require33(
        pendingReceipt && canonicalSha256(pendingReceipt) === pendingProof.receiptSha256,
        'pending import receipt differs from owning native provenance',
      );
      consumed.push({
        phase: 'pending-import',
        receiptSha256: pendingProof.receiptSha256,
        historySha256: pendingProof.historySha256,
      });
    }
    const expected = [
      plan,
      final,
      ...(emptyMainAdmission ? [currentReceipt] : []),
      ...(pendingReceipt ? [pendingReceipt] : []),
    ];
    const accounted = history.sharedMain.rows.every((row) => {
      if (row.provenance === 'authenticated-execution-receipt' || row.provenance === 'known-empty-configuration')
        return true;
      return (
        row.provenance === 'unaccounted-receipt' &&
        expected.some(
          (receipt) =>
            row.receiptSha256 === canonicalSha256(receipt) &&
            row.savedPlanSha256 === receipt.planSha256 &&
            row.configurationSha256 === receipt.configurationSha256 &&
            row.manifestSha256 === manifestOf(receipt.configurationSha256) &&
            ['planned', 'applied'].includes(row.state) &&
            sha20(row.executionSha256) &&
            row.ordinaryRefreshEnabled === (receipt === currentReceipt && !!emptyMainAdmission),
        )
      );
    });
    require33(
      accounted &&
        expected.every((receipt) =>
          history.sharedMain.rows.some((row) => row.receiptSha256 === canonicalSha256(receipt)),
        ),
      'unaccounted or missing additional native receipt',
    );
    require33(
      history.lineage.rows.every(
        (row) =>
          row.execution === 'staged-network' ||
          row.execution === 'completed-replacement' ||
          row.execution === 'unstaged-no-outcome',
      ) &&
        history.rows.length === history.lineage.rows.filter((row) => row.execution === 'staged-network').length &&
        history.sharedMain.replacementRows.length ===
          history.lineage.rows.filter((row) => row.execution === 'completed-replacement').length &&
        history.sharedMain.replacementRows.every(
          (row) => row.records.length > 0 && row.originalPublishedJournalsQualified,
        ),
      'complete retained public execution or genuine absence custody required',
    );
    const stages = history.rows
      .flatMap((row) => {
        require33(
          row.main.originalPublishedJournalsQualified &&
            row.main.terminalPublishedJournalsQualified &&
            row.power.rows.length > 0 &&
            row.power.rows.every((power) => power.status === 'retired' && power.retirement?.runnerRetirementQualified),
          'retained network or power custody incomplete',
        );
        return row.power.rows.map((power) => power.stage);
      })
      .sort();
    require33(new Set(stages).size === stages.length, 'duplicate retained power stage');
    const retainedPowerChildren = history.rows
      .flatMap((row) =>
        row.power.rows.map((power) => {
          const retirement = power.retirement;
          require33(
            retirement &&
              retirement.sourcePlanSha256 === row.planSha256 &&
              retirement.stage === power.stage &&
              retirement.status === 'retired' &&
              retirement.runnerRetirementQualified &&
              Number.isInteger(retirement.node) &&
              retirement.node >= 1 &&
              (retirement.operation === 'start' || retirement.operation === 'deallocate'),
            'retained child source, identity or retirement differs',
          );
          const proof = object22(retirement.proof),
            observed = object22(proof.observed),
            receipt = object22(observed.receipt);
          keys11(proof, ['preparingSha256', 'finalReceiptSha256', 'observed']);
          keys11(observed, ['status', 'markerSha256', 'receipt']);
          require33(
            sha20(proof.preparingSha256) &&
              sha20(proof.finalReceiptSha256) &&
              observed.status === 'runner-artifacts-retired' &&
              sha20(observed.markerSha256) &&
              receipt.status === 'runner-artifacts-retired' &&
              receipt.evidenceSha256 === proof.preparingSha256 &&
              sha20(receipt.manifestSha256) &&
              sha20(receipt.finalPlanSha256) &&
              sha20(receipt.inventorySha256) &&
              sha20(receipt.independentCleanupSha256) &&
              Number.isSafeInteger(receipt.retiredArtifacts) &&
              Number(receipt.retiredArtifacts) >= 0,
            'exact retained child native marker proof required',
          );
          return {
            networkPlanSha256: row.planSha256,
            node: retirement.node,
            operation: retirement.operation,
            stage: power.stage,
            retirementSha256: canonicalSha256(retirement),
            proof: structuredClone(retirement.proof),
          };
        }),
      )
      .sort((a, b) => a.stage.localeCompare(b.stage));
    require33(
      same30(
        retainedPowerChildren.map((child) => child.stage),
        stages,
      ) &&
        new Set(retainedPowerChildren.map((child) => `${child.networkPlanSha256}:${child.node}:${child.operation}`))
          .size === retainedPowerChildren.length,
      'duplicate or partial retained child identity',
    );
    for (const name of recordDigests.keys()) await step(() => readRecord(name), parentSignal);
    require33(
      same30(await namespace(), root) &&
        (await step(() => readConfigurationSha256.call(session), parentSignal)) === currentConfigurationSha256 &&
        (emptyMainAdmission ||
          (await step(() => readConfiguration.call(session, final.configurationSha256), parentSignal)) === source) &&
        same30(await step(() => readCurrent.call(session, currentConfigurationSha256, active), parentSignal), current),
      'owning source or native current boundary changed',
    );
    if (pendingProof)
      require33(
        same30(
          await step(
            () => readAzureTerraformPendingImportProvenance(original, store, session, active, emptyMainAdmission),
            parentSignal,
          ),
          pendingProof,
        ),
        'pending import provenance changed across terminal accounting',
      );
    await recheckEmpty(parentSignal);
    if (emptyMainAdmission)
      require33(
        same30(
          retainedPowerChildren,
          emptyMainAdmission.context.terminalCleanup.retainedNetworkCustody.retainedPowerChildren,
        ),
        'terminal retained child identity differs',
      );
    active.throwIfAborted();
    seal();
    return {
      stages,
      retainedPowerChildren,
      retainedLineage: structuredClone(history.lineage),
      historySha256: canonicalSha256(history),
      currentSha256: canonicalSha256(current),
      consumed,
    };
  };
  const first = await inspect();
  const result = {
    schemaVersion: 1,
    scope: 'post-destroy-authenticated-network-stage-journal-custody',
    owner,
    site,
    originalPlanSha256: original.planSha256,
    teardownPlanSha256: teardown.planSha256,
    ...first,
    recordSha256: canonicalSha256([...recordDigests].sort(([a], [b]) => a.localeCompare(b))),
    ...(emptyMainAdmission
      ? {
          currentEmptyMainJournalCustodyQualified: true,
          emptyMainBinding: structuredClone(emptyMainAdmission.witness),
        }
      : {}),
    publicJournalCustodyQualified: true,
    destroyJournalCustodyQualified: true,
    powerRunnerRetirementQualified: true,
    mainRunnerRetirementQualified: false,
    independentCloudCleanupQualified: false,
    emptyStateQualified: false,
    parentRetirementQualified: false,
    currentOperationalAcceptanceQualified: false,
  };
  const digest = canonicalSha256(result);
  witnesses8.set(result, {
    request,
    store,
    context,
    digest,
    authenticate: seal,
    async recheck(parentSignal) {
      seal();
      require33(
        canonicalSha256(result) === digest && same30(await step(() => inspect(parentSignal), parentSignal), first),
        'authenticated destroy custody changed',
      );
      seal();
    },
  });
  return result;
}
function authenticateAzureTerraformNetworkDestroyJournalCustody(witness, request, store, context, signal) {
  signal?.throwIfAborted();
  const bound = witness && typeof witness === 'object' ? witnesses8.get(witness) : undefined;
  require33(
    bound &&
      bound.request === request &&
      bound.store === store &&
      bound.context === context &&
      canonicalSha256(witness) === bound.digest,
    'owning authenticated destroy custody witness required',
  );
  bound.authenticate();
  signal?.throwIfAborted();
}
async function recheckAzureTerraformNetworkDestroyJournalCustody(witness, request, store, context, signal) {
  signal?.throwIfAborted();
  const bound = witness && typeof witness === 'object' ? witnesses8.get(witness) : undefined;
  require33(
    bound &&
      bound.request === request &&
      bound.store === store &&
      bound.context === context &&
      canonicalSha256(witness) === bound.digest,
    'owning authenticated destroy custody witness required',
  );
  await bound.recheck(signal);
  require33(canonicalSha256(witness) === bound.digest, 'authenticated destroy custody changed');
}
async function qualifyAzureTerraformNetworkDestroyJournalCustody(request, store, context, signal) {
  return qualifyAzureTerraformNetworkJournalCustody(request, store, context, signal);
}
async function qualifyAzureTerraformNetworkTerminalJournalCustody(request, store, context, signal) {
  if (
    context.terminalCleanup &&
    typeof context.terminalCleanup === 'object' &&
    Reflect.get(context.terminalCleanup, 'phase') === 'retired'
  )
    return qualifyAzureTerraformNetworkRetiredMainCustody(request, store, context, signal);
  const witness = await qualifyAzureTerraformNetworkEmptyMainBinding(request, store, context, signal);
  return qualifyAzureTerraformNetworkJournalCustody(request, store, context, signal, { witness, context });
}

// plugins/azure/src/ce/terraform-network-cancelled-main-binding.ts
var same31 = (a, b) => canonicalEqual({ value: a }, { value: b });
var hash25 = (v) => createHash30('sha256').update(v).digest('hex');
var sha21 = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require34(v, message) {
  if (!v) throw Error(`Azure network cancellation/planning binding: ${message}`);
}
function object23(v) {
  require34(v && typeof v === 'object' && !Array.isArray(v), 'complete record required');
  return v;
}
var witnesses9 = new WeakMap();
async function qualifyAzureTerraformNetworkCancelledMainBinding(request, store, context, signal) {
  const original = structuredClone(request),
    owner = structuredClone(store.owner),
    directory = store.directory,
    teardown = structuredClone(context.destroyTeardown),
    checkpoint = structuredClone(context.terminalCleanup),
    site = structuredClone(context.site),
    { terraform, publicSession, loaders, verifier, replacementVerifier } = context;
  const dependencies = [
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'verify', value: store.verify },
    { target: terraform, key: 'open', value: terraform.open },
    { target: loaders, key: 'loadSource', value: loaders.loadSource },
    { target: loaders, key: 'loadOutcome', value: loaders.loadOutcome },
    ...['getSessionId', 'getArtifactsDir', 'getArtifactPath', 'saveArtifact'].map((key) => ({
      target: publicSession,
      key,
      value: Reflect.get(publicSession, key),
    })),
  ];
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require34(
      same31(request, original) &&
        same31(store.owner, owner) &&
        store.directory === directory &&
        same31(context.destroyTeardown, teardown) &&
        same31(context.terminalCleanup, checkpoint) &&
        same31(context.site, site) &&
        context.terraform === terraform &&
        context.publicSession === publicSession &&
        context.loaders === loaders &&
        context.verifier === verifier &&
        context.replacementVerifier === replacementVerifier &&
        dependencies.every(({ target, key, value }) => Reflect.get(target, key) === value),
      'owning context changed',
    );
  };
  const step = async (action, parent) => {
    seal();
    const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
    active.throwIfAborted();
    const aborted = Promise.withResolvers(),
      onAbort = () => aborted.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([action(), aborted.promise]);
      active.throwIfAborted();
      seal();
      return value;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  const records = new Map();
  const readRecord = async (name, parent) =>
    step(async () => {
      const logical = await store.read(name),
        file = await open12(join29(directory, name), constants16.O_RDONLY | constants16.O_NOFOLLOW);
      try {
        const first = await file.stat(),
          bytes = await file.readFile(),
          last = await file.stat(),
          named = await lstat26(join29(directory, name));
        let parsed;
        try {
          parsed = JSON.parse(bytes.toString());
        } catch {
          throw Error('Azure network cancellation/planning binding: malformed private record');
        }
        require34(
          first.isFile() &&
            first.uid === process.getuid?.() &&
            first.nlink === 1 &&
            (first.mode & 63) === 0 &&
            last.dev === first.dev &&
            last.ino === first.ino &&
            last.size === first.size &&
            last.mtimeMs === first.mtimeMs &&
            last.ctimeMs === first.ctimeMs &&
            named.isFile() &&
            !named.isSymbolicLink() &&
            named.dev === first.dev &&
            named.ino === first.ino &&
            named.uid === first.uid &&
            named.nlink === 1 &&
            (named.mode & 63) === 0 &&
            same31(parsed, logical),
          'private record custody differs',
        );
        const digest = canonicalSha256({
          identity: `${first.dev}:${first.ino}:${first.birthtimeMs}`,
          bytes: hash25(bytes),
        });
        require34(!records.has(name) || records.get(name) === digest, 'private record bytes or identity changed');
        records.set(name, digest);
        return structuredClone(logical);
      } finally {
        await file.close();
      }
    }, parent);
  const root = await step(() => lstat26(directory));
  require34(
    root.isDirectory() &&
      !root.isSymbolicLink() &&
      root.uid === process.getuid?.() &&
      (root.mode & 63) === 0 &&
      (await step(() => realpath25(directory))) === directory,
    'private root differs',
  );
  require34(
    original.engine === 'terraform' &&
      original.intent.operation === 'deploy' &&
      same31(azureUpgradeBinding(original).owner, owner) &&
      same31(
        compileAzureTerraformTeardown(
          original,
          teardown.drain,
          teardown.retirement,
          teardown.pendingAdmissionJournalSha256,
        ),
        teardown,
      ) &&
      teardown.retirement[0]?.siteUid === site.siteUid,
    'compiled owner or teardown differs',
  );
  await step(() => store.verify());
  require34(same31(await readRecord(`${teardown.planId}.json`), teardown), 'saved teardown differs');
  require34(
    same31(await readRecord(`${teardown.planId}-authorization.json`), {
      schemaVersion: 1,
      engine: 'terraform',
      sourcePlanSha256: original.planSha256,
      teardownPlanSha256: teardown.planSha256,
      mutations: true,
    }),
    'saved authorization differs',
  );
  const lifecycle = object23(await readRecord('azure-terraform-lifecycle-retirement.json'));
  require34(
    lifecycle.schemaVersion === 1 &&
      lifecycle.kind === teardown.kind &&
      same31(lifecycle.owner, owner) &&
      lifecycle.sourcePlanSha256 === original.planSha256 &&
      lifecycle.teardownPlanSha256 === teardown.planSha256,
    'saved lifecycle differs',
  );
  require34(
    same31(await readRecord('azure-terraform-terminal-cleanup.json'), checkpoint),
    'saved terminal checkpoint differs',
  );
  const terminal = object23(checkpoint),
    destroy = object23(terminal.destroy),
    retained = object23(terminal.retainedNetworkCustody),
    evidence = object23(terminal.evidence);
  const deployment = await step(() => azureTerraformCurrentDeployment(original));
  const { configuration, providerLock, ...identity } = deployment;
  const configurationSha256 = hash25(configuration),
    manifestOf = (digest) =>
      canonicalSha256({ ...identity, configurationSha256: digest, providerLockSha256: hash25(providerLock) });
  require34(
    terminal.schemaVersion === 1 &&
      ['cancelling', 'planning'].includes(String(terminal.phase)) &&
      terminal.final === undefined &&
      terminal.retirementEvidence === undefined &&
      terminal.artifacts === undefined &&
      terminal.sourcePlanSha256 === original.planSha256 &&
      terminal.teardownPlanSha256 === teardown.planSha256 &&
      terminal.emptyConfiguration === configuration &&
      terminal.emptyConfigurationSha256 === configurationSha256 &&
      sha21(terminal.evidenceSha256) &&
      terminal.evidenceSha256 === canonicalSha256(evidence) &&
      same31(evidence.network, retained) &&
      terminal.checkpointSha256 ===
        canonicalSha256({
          configurationSha256: terminal.configurationSha256,
          emptyConfiguration: configuration,
          destroy,
          evidence,
        }),
    'cancellation checkpoint binding differs',
  );
  require34(
    same31(await readRecord('azure-terraform-cloud-destroy-final.json'), destroy) &&
      destroy.operation === 'destroy' &&
      destroy.schemaVersion === 1 &&
      destroy.engine === 'terraform' &&
      destroy.deploymentId === deployment.deploymentId &&
      destroy.backendIdentity === deployment.backendIdentity &&
      destroy.providerLockSha256 === hash25(providerLock) &&
      sha21(destroy.planSha256) &&
      destroy.noChanges === true &&
      Array.isArray(destroy.changes) &&
      destroy.changes.length === 0 &&
      !destroy.actionInvocations &&
      !destroy.imports &&
      !destroy.relinquishments &&
      destroy.configurationSha256 === terminal.configurationSha256 &&
      typeof terminal.retainedDestroyConfiguration === 'string' &&
      hash25(terminal.retainedDestroyConfiguration) === destroy.configurationSha256,
    'retained destroy source differs',
  );
  const retainedConfiguration = object23(JSON.parse(terminal.retainedDestroyConfiguration));
  require34(
    same31(
      { terraform: retainedConfiguration.terraform, provider: retainedConfiguration.provider },
      JSON.parse(configuration),
    ),
    'retained provider and execution identity differ',
  );
  require34(
    retained.scope === 'post-destroy-authenticated-network-stage-journal-custody' &&
      same31(retained.owner, owner) &&
      same31(retained.site, site) &&
      retained.originalPlanSha256 === original.planSha256 &&
      retained.teardownPlanSha256 === teardown.planSha256 &&
      retained.publicJournalCustodyQualified === true &&
      retained.destroyJournalCustodyQualified === true &&
      retained.powerRunnerRetirementQualified === true &&
      retained.mainRunnerRetirementQualified === false &&
      retained.parentRetirementQualified === false &&
      retained.currentEmptyMainJournalCustodyQualified === undefined &&
      Array.isArray(retained.retainedPowerChildren) &&
      Array.isArray(retained.stages),
    'qualified retained destroy custody required',
  );
  const nativeFiles = new Map();
  const nativeDirectories = new Map();
  const nativeDirectory = async (path, parent) =>
    step(async () => {
      const before = await lstat26(path),
        names = (await readdir27(path)).sort(),
        after = await lstat26(path);
      require34(
        before.isDirectory() &&
          !before.isSymbolicLink() &&
          before.uid === process.getuid?.() &&
          (before.mode & 63) === 0 &&
          (await realpath25(path)) === path &&
          after.isDirectory() &&
          !after.isSymbolicLink() &&
          before.dev === after.dev &&
          before.ino === after.ino &&
          before.birthtimeMs === after.birthtimeMs &&
          after.uid === before.uid &&
          (after.mode & 63) === 0,
        'native directory custody differs',
      );
      const snapshot = { identity: `${before.dev}:${before.ino}:${before.birthtimeMs}`, names };
      require34(
        !nativeDirectories.has(path) || same31(nativeDirectories.get(path), snapshot),
        'native directory identity or inventory changed',
      );
      nativeDirectories.set(path, snapshot);
      return names;
    }, parent);
  const nativeFile = async (path, expectedSha256, parent) =>
    step(async () => {
      const file = await open12(path, constants16.O_RDONLY | constants16.O_NOFOLLOW);
      try {
        const first = await file.stat(),
          bytes = await file.readFile(),
          last = await file.stat(),
          named = await lstat26(path);
        require34(
          first.isFile() &&
            first.uid === process.getuid?.() &&
            first.nlink === 1 &&
            (first.mode & 63) === 0 &&
            last.dev === first.dev &&
            last.ino === first.ino &&
            last.size === first.size &&
            last.mtimeMs === first.mtimeMs &&
            last.ctimeMs === first.ctimeMs &&
            named.isFile() &&
            !named.isSymbolicLink() &&
            named.dev === first.dev &&
            named.ino === first.ino &&
            named.birthtimeMs === first.birthtimeMs &&
            named.uid === first.uid &&
            named.nlink === 1 &&
            (named.mode & 63) === 0,
          'native file changed during read',
        );
        const snapshot = { identity: `${first.dev}:${first.ino}:${first.birthtimeMs}`, bytes: hash25(bytes) };
        require34(
          (expectedSha256 === undefined || snapshot.bytes === expectedSha256) &&
            (!nativeFiles.has(path) || same31(nativeFiles.get(path), snapshot)),
          'native file bytes or identity changed',
        );
        nativeFiles.set(path, snapshot);
        return bytes;
      } finally {
        await file.close();
      }
    }, parent);
  const nativeBoundary = async (parent) => {
    for (const path of nativeDirectories.keys()) await nativeDirectory(path, parent);
    for (const path of nativeFiles.keys()) await nativeFile(path, undefined, parent);
  };
  const session = await step(() => terraform.open(owner, deployment, 'current'));
  const {
    readUnsubmittedPlanCancellation: readCancellation,
    readCurrentPlanJournal: readCurrent,
    readCancelledPlanContinuation: readContinuation,
    readConfiguration,
  } = session;
  require34(
    readCancellation && readCurrent && readContinuation && readConfiguration,
    'native cancellation and current readers required',
  );
  for (const key of [
    'readUnsubmittedPlanCancellation',
    'readCurrentPlanJournal',
    'readCancelledPlanContinuation',
    'readConfiguration',
  ])
    dependencies.push({ target: session, key, value: Reflect.get(session, key) });
  const authenticatedPower = new Map();
  const inspect = async (parent) => {
    const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
    await nativeBoundary(parent);
    for (const name of await nativeDirectory(directory, parent))
      if (name.endsWith('.json')) await readRecord(name, parent);
    for (const name of records.keys()) await readRecord(name, parent);
    const mainDirectory = join29(directory, deployment.deploymentId);
    const mainNames = await nativeDirectory(mainDirectory, parent);
    require34(!mainNames.includes('artifact-retirement.json'), 'main retirement is outside cancellation/planning');
    for (const name of mainNames)
      if (name.endsWith('.json') || name === 'saved.tfplan')
        await nativeFile(join29(mainDirectory, name), undefined, parent);
    for (const rootName of ['revisions', 'plan-history'])
      if (mainNames.includes(rootName)) {
        const archiveRoot = join29(mainDirectory, rootName);
        for (const archive of await nativeDirectory(archiveRoot, parent)) {
          require34(
            (rootName === 'revisions' ? /^[a-f0-9-]{36}$/ : /^[a-f0-9]{64}$/).test(archive),
            'archive identity differs',
          );
          const path = join29(archiveRoot, archive);
          for (const name of await nativeDirectory(path, parent))
            await nativeFile(join29(path, name), undefined, parent);
        }
      }
    const cancellation = await step(
      () =>
        readCancellation.call(
          session,
          destroy,
          destroy.configurationSha256,
          configurationSha256,
          terminal.evidenceSha256,
          active,
        ),
      parent,
    );
    require34(
      cancellation.schemaVersion === 1 &&
        cancellation.scope === 'exact-unsubmitted-plan-cancellation-provenance' &&
        ['absent', 'pending', 'cancelled'].includes(cancellation.status) &&
        [destroy.configurationSha256, configurationSha256].includes(cancellation.currentConfigurationSha256) &&
        cancellation.manifestSha256 === manifestOf(cancellation.currentConfigurationSha256) &&
        cancellation.originalReceiptSha256 === canonicalSha256(destroy) &&
        cancellation.cancellationQualified === (cancellation.status === 'cancelled') &&
        cancellation.applicationOutcomeQualified === false &&
        cancellation.runnerRetirementQualified === false &&
        cancellation.retirementQualified === false,
      'native cancellation identity differs',
    );
    let currentPlanReceipt = null;
    let ordinaryCurrentJournalQualified = false;
    let ordinaryPlanReady = false;
    let currentJournalSha256 = null;
    let initialDestroyCustody;
    if (cancellation.status === 'absent') {
      require34(
        cancellation.cancellationRecordSha256 === null &&
          cancellation.currentConfigurationSha256 === destroy.configurationSha256 &&
          terminal.phase === 'cancelling',
        'first cancellation requires original current configuration',
      );
      const custody = await step(
        () => qualifyAzureTerraformNetworkDestroyJournalCustody(request, store, context, active),
        parent,
      );
      require34(same31(custody, retained), 'retained custody differs before first cancellation');
      initialDestroyCustody = custody;
      require34(
        (await step(() => readConfiguration.call(session, destroy.configurationSha256), parent)) ===
          terminal.retainedDestroyConfiguration,
        'retained current destroy bytes differ',
      );
    } else {
      require34(
        sha21(cancellation.cancellationRecordSha256) && cancellation.originalArchiveSha256s.every(sha21),
        'native cancellation record differs',
      );
      if (cancellation.status === 'cancelled') {
        require34(
          cancellation.currentConfigurationSha256 === configurationSha256 &&
            cancellation.originalArchiveSha256s.length > 0 &&
            (await step(() => readConfiguration.call(session, configurationSha256), parent)) === configuration,
          'completed cancellation lacks exact archived original and current empty configuration',
        );
        const current = await step(() => readCurrent.call(session, configurationSha256, active), parent);
        require34(current.manifestSha256 === manifestOf(configurationSha256), 'current native manifest differs');
        if (current.state === 'absent') {
          require34(
            current.receipt === undefined && current.savedPlanSha256 === null && current.journalSha256 === null,
            'ordinary current slot is partial',
          );
          ordinaryPlanReady = true;
        } else {
          const final = current.receipt;
          require34(
            current.state === 'planned' &&
              final &&
              !final.operation &&
              final.noChanges === true &&
              Array.isArray(final.changes) &&
              final.changes.length === 0 &&
              !final.actionInvocations &&
              !final.imports &&
              !final.relinquishments &&
              final.configurationSha256 === configurationSha256 &&
              final.deploymentId === deployment.deploymentId &&
              final.backendIdentity === deployment.backendIdentity &&
              final.providerLockSha256 === hash25(providerLock) &&
              sha21(final.planSha256) &&
              current.savedPlanSha256 === final.planSha256 &&
              current.ordinaryRefreshEnabled === true &&
              sha21(current.executionSha256) &&
              sha21(current.journalSha256),
            'exact ordinary planned continuation required',
          );
          const continuation = await step(
            () =>
              readContinuation.call(
                session,
                destroy,
                destroy.configurationSha256,
                configurationSha256,
                terminal.evidenceSha256,
                final,
                active,
              ),
            parent,
          );
          require34(
            continuation.cancellationQualified &&
              continuation.manifestSha256 === current.manifestSha256 &&
              continuation.currentConfigurationSha256 === configurationSha256 &&
              continuation.originalReceiptSha256 === canonicalSha256(destroy) &&
              continuation.cancellationRecordSha256 === cancellation.cancellationRecordSha256 &&
              continuation.continuation.state === 'planned' &&
              continuation.continuation.receiptSha256 === canonicalSha256(final) &&
              continuation.continuation.savedPlanSha256 === final.planSha256 &&
              continuation.continuation.journalSha256 === current.journalSha256 &&
              continuation.continuation.executionSha256 === current.executionSha256 &&
              continuation.continuation.ordinaryRefreshEnabled,
            'native ordinary continuation differs',
          );
          currentPlanReceipt = structuredClone(final);
          ordinaryCurrentJournalQualified = true;
          currentJournalSha256 = current.journalSha256;
        }
      }
    }
    if (initialDestroyCustody) {
      const children = structuredClone(initialDestroyCustody.retainedPowerChildren);
      for (const child of children) {
        const stageDirectory = join29(directory, 'terraform-stages', child.stage);
        const names = await nativeDirectory(stageDirectory, parent);
        require34(
          names.length === 1 && /^[a-zA-Z0-9_-]+$/.test(requirePresent(names[0])),
          'native child runner identity differs',
        );
        const path = join29(stageDirectory, requirePresent(names[0]));
        require34(
          same31(await nativeDirectory(path, parent), ['artifact-retirement.json', 'deployment.json']),
          'native child inventory differs',
        );
        const proof = object23(child.proof),
          observed = object23(proof.observed),
          receipt = object23(observed.receipt);
        require34(
          observed.status === 'runner-artifacts-retired' &&
            sha21(observed.markerSha256) &&
            sha21(receipt.manifestSha256),
          'native child proof incomplete',
        );
        await nativeFile(join29(path, 'artifact-retirement.json'), observed.markerSha256, parent);
        require34(
          canonicalSha256(
            JSON.parse((await nativeFile(join29(path, 'deployment.json'), undefined, parent)).toString()),
          ) === receipt.manifestSha256,
          'native child manifest differs',
        );
      }
      require34(
        same31(
          await step(
            () =>
              readCancellation.call(
                session,
                destroy,
                destroy.configurationSha256,
                configurationSha256,
                terminal.evidenceSha256,
                active,
              ),
            parent,
          ),
          cancellation,
        ),
        'native cancellation changed',
      );
      await nativeBoundary(parent);
      for (const name of records.keys()) await readRecord(name, parent);
      seal();
      return {
        cancellationStatus: cancellation.status,
        cancellationRecordSha256: cancellation.cancellationRecordSha256,
        cancellationQualified: cancellation.cancellationQualified,
        currentPlanReceipt,
        ordinaryCurrentJournalQualified,
        ordinaryPlanReady,
        currentJournalSha256,
        children,
        lineageSha256: canonicalSha256(initialDestroyCustody.retainedLineage),
      };
    }
    const lineage = await step(
      () =>
        readAzureTerraformNetworkRetirementLineage(
          original,
          publicSession,
          store,
          loaders,
          site,
          verifier,
          active,
          replacementVerifier,
        ),
      parent,
    );
    require34(
      same31(lineage, retained.retainedLineage) &&
        lineage.rows.every((row) =>
          ['staged-network', 'completed-replacement', 'unstaged-no-outcome'].includes(row.execution),
        ),
      'retained public lineage differs',
    );
    const children = [];
    for (const row of lineage.rows.filter((row) => row.execution === 'staged-network')) {
      const source = await step(() => loaders.loadSource(row.planSha256), parent);
      require34(
        source.planSha256 === row.planSha256 && same31(azureUpgradeBinding(source).owner, owner),
        'retained child source differs',
      );
      let power = authenticatedPower.get(row.planSha256);
      if (!power) {
        power = await step(
          () =>
            readAzureTerraformNetworkPowerRunnerHistory(
              source,
              store,
              terraform,
              loaders,
              site,
              verifier,
              active,
              replacementVerifier,
            ),
          parent,
        );
        authenticatedPower.set(row.planSha256, structuredClone(power));
      }
      require34(power.graphSha256 === row.graphSha256 && power.rows.length > 0, 'retained child graph differs');
      for (const child of power.rows) {
        const retirement = child.retirement;
        require34(
          child.status === 'retired' &&
            retirement?.runnerRetirementQualified &&
            retirement.sourcePlanSha256 === row.planSha256 &&
            retirement.stage === child.stage,
          'retained child native marker incomplete',
        );
        const stageDirectory = join29(directory, 'terraform-stages', child.stage);
        const runnerNames = await nativeDirectory(stageDirectory, parent);
        require34(
          runnerNames.length === 1 && /^[a-zA-Z0-9_-]+$/.test(requirePresent(runnerNames[0])),
          'native child runner identity differs',
        );
        const runnerDirectory = join29(stageDirectory, requirePresent(runnerNames[0]));
        require34(
          same31(await nativeDirectory(runnerDirectory, parent), ['artifact-retirement.json', 'deployment.json']),
          'native child inventory differs',
        );
        const proof = object23(retirement.proof),
          observedChild = object23(proof.observed),
          childReceipt = object23(observedChild.receipt);
        require34(
          observedChild.status === 'runner-artifacts-retired' &&
            sha21(observedChild.markerSha256) &&
            sha21(childReceipt.manifestSha256),
          'native child proof incomplete',
        );
        await nativeFile(join29(runnerDirectory, 'artifact-retirement.json'), observedChild.markerSha256, parent);
        require34(
          canonicalSha256(
            JSON.parse((await nativeFile(join29(runnerDirectory, 'deployment.json'), undefined, parent)).toString()),
          ) === childReceipt.manifestSha256,
          'native child manifest differs',
        );
        children.push({
          networkPlanSha256: row.planSha256,
          node: retirement.node,
          operation: retirement.operation,
          stage: child.stage,
          retirementSha256: canonicalSha256(retirement),
          proof: structuredClone(retirement.proof),
        });
      }
    }
    children.sort((a, b) => a.stage.localeCompare(b.stage));
    require34(
      same31(children, retained.retainedPowerChildren) &&
        same31(children.map((child) => child.stage).sort(), retained.stages) &&
        new Set(children.map((child) => `${child.networkPlanSha256}:${child.node}:${child.operation}`)).size ===
          children.length,
      'retained child identities differ, duplicate or are partial',
    );
    require34(
      same31(
        await step(
          () =>
            readAzureTerraformNetworkRetirementLineage(
              original,
              publicSession,
              store,
              loaders,
              site,
              verifier,
              active,
              replacementVerifier,
            ),
          parent,
        ),
        lineage,
      ),
      'public lineage changed',
    );
    require34(
      same31(
        await step(
          () =>
            readCancellation.call(
              session,
              destroy,
              destroy.configurationSha256,
              configurationSha256,
              terminal.evidenceSha256,
              active,
            ),
          parent,
        ),
        cancellation,
      ),
      'native cancellation changed',
    );
    await nativeBoundary(parent);
    for (const name of records.keys()) await readRecord(name, parent);
    seal();
    return {
      cancellationStatus: cancellation.status,
      cancellationRecordSha256: cancellation.cancellationRecordSha256,
      cancellationQualified: cancellation.cancellationQualified,
      currentPlanReceipt,
      ordinaryCurrentJournalQualified,
      ordinaryPlanReady,
      currentJournalSha256,
      children,
      lineageSha256: canonicalSha256(lineage),
    };
  };
  const mint = (first) => {
    const result = {
      schemaVersion: 1,
      scope: 'authenticated-terminal-cancellation-planning-binding',
      owner,
      site,
      originalPlanSha256: original.planSha256,
      teardownPlanSha256: teardown.planSha256,
      retainedDestroyConfigurationSha256: destroy.configurationSha256,
      configurationSha256,
      ...first,
      stages: first.children.map((child) => child.stage).sort(),
      publicJournalCustodyQualified: true,
      powerRunnerRetirementQualified: true,
      emptyStateQualified: false,
      independentCloudCleanupQualified: false,
      mainRunnerRetirementQualified: false,
      parentRetirementQualified: false,
      currentOperationalAcceptanceQualified: false,
    };
    const digest = canonicalSha256(result);
    witnesses9.set(result, {
      request,
      store,
      context,
      digest,
      async recheck(parent) {
        require34(
          canonicalSha256(result) === digest && same31(await inspect(parent), first),
          'cancellation/planning custody changed',
        );
      },
      async refresh(parent) {
        seal();
        require34(
          canonicalSha256(result) === digest &&
            first.cancellationStatus === 'cancelled' &&
            first.ordinaryPlanReady &&
            first.currentPlanReceipt === null &&
            !first.ordinaryCurrentJournalQualified,
          'owning previously absent ordinary slot required',
        );
        const mainDirectory = join29(directory, deployment.deploymentId),
          prior = nativeDirectories.get(mainDirectory);
        require34(
          prior && !prior.names.includes('plan-receipt.json') && !prior.names.includes('saved.tfplan'),
          'original absent current namespace required',
        );
        const before = await step(() => lstat26(mainDirectory), parent),
          names = (await step(() => readdir27(mainDirectory), parent)).sort();
        require34(
          `${before.dev}:${before.ino}:${before.birthtimeMs}` === prior.identity &&
            same31(names, [...prior.names, 'plan-receipt.json', 'saved.tfplan'].sort()),
          'ordinary continuation namespace differs',
        );
        nativeDirectories.set(mainDirectory, { ...prior, names });
        const current = await inspect(parent);
        require34(
          current.cancellationStatus === 'cancelled' &&
            current.ordinaryCurrentJournalQualified &&
            !current.ordinaryPlanReady &&
            current.currentPlanReceipt !== null &&
            same31(current.children, first.children) &&
            current.lineageSha256 === first.lineageSha256,
          'ordinary continuation or retained custody differs',
        );
        return mint(current);
      },
    });
    return result;
  };
  return mint(await inspect());
}
async function recheckAzureTerraformNetworkCancelledMainBinding(witness, request, store, context, signal) {
  signal?.throwIfAborted();
  const bound = witness && typeof witness === 'object' ? witnesses9.get(witness) : undefined;
  require34(
    bound &&
      bound.request === request &&
      bound.store === store &&
      bound.context === context &&
      canonicalSha256(witness) === bound.digest,
    'owning cancellation/planning witness required',
  );
  await bound.recheck(signal);
}
async function refreshAzureTerraformNetworkCancelledMainBinding(witness, request, store, context, signal) {
  signal?.throwIfAborted();
  const bound = witness && typeof witness === 'object' ? witnesses9.get(witness) : undefined;
  require34(
    bound &&
      bound.request === request &&
      bound.store === store &&
      bound.context === context &&
      canonicalSha256(witness) === bound.digest,
    'owning cancellation/planning witness required',
  );
  return await bound.refresh(signal);
}
function requirePresent(value) {
  if (value === null || value === undefined) throw Error('Required qualified evidence is missing');
  return value;
}

// plugins/azure/src/ce/terraform-network-frozen-retired-services.ts
import { createHash as createHash31 } from 'node:crypto';
import { join as join30 } from 'node:path';

// plugins/azure/src/ce/terraform-network-post-plaintext-parent-custody.ts
function require35(v, message) {
  if (!v) throw Error(`Azure post-plaintext parent custody: ${message}`);
}
var witnesses10 = new WeakMap();
async function recheckAzureTerraformNetworkPostPlaintextParentCustody(witness, request, store, context, signal) {
  signal?.throwIfAborted();
  const bound = witness && typeof witness === 'object' ? witnesses10.get(witness) : undefined;
  require35(
    bound &&
      bound.request === request &&
      bound.store === store &&
      bound.context === context &&
      canonicalSha256(witness) === bound.digest,
    'owning post-plaintext parent witness required',
  );
  await bound.recheck(signal);
}

// plugins/azure/src/ce/terraform-network-frozen-retired-services.ts
var hash26 = (v) => createHash31('sha256').update(v).digest('hex');
var same32 = (a, b) => canonicalEqual({ value: a }, { value: b });
var sha22 = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require36(v, message) {
  if (!v) throw Error(`Azure frozen retired services: ${message}`);
}
function object24(v) {
  require36(v && typeof v === 'object' && !Array.isArray(v), 'complete record required');
  return v;
}
var witnesses11 = new WeakMap();
async function qualifyAzureTerraformNetworkFreshRetiredServices(request, store, context, signal) {
  return qualifyServices(request, store, context, undefined, true, signal);
}
async function qualifyServices(request, store, context, parentWitness, fresh, signal) {
  const original = structuredClone(request),
    owner = structuredClone(store.owner),
    root = store.directory,
    terminal = structuredClone(context.terminalCleanup),
    teardown = structuredClone(context.destroyTeardown),
    site = structuredClone(context.site),
    { terraform, loaders } = context;
  const methods = [
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'verify', value: store.verify },
    { target: terraform, key: 'open', value: terraform.open },
    { target: loaders, key: 'loadSource', value: loaders.loadSource },
  ];
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const terminalMatches = captureAzureTerraformTerminalSnapshot(terminal);
  const seal = () => {
    deadline.throwIfAborted();
    require36(
      same32(request, original) &&
        same32(store.owner, owner) &&
        store.directory === root &&
        terminalMatches(context.terminalCleanup) &&
        same32(context.destroyTeardown, teardown) &&
        same32(context.site, site) &&
        context.terraform === terraform &&
        context.loaders === loaders &&
        methods.every(({ target, key, value }) => Reflect.get(target, key) === value),
      'owning context changed',
    );
  };
  const step = async (action, parent) => {
    seal();
    const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
    active.throwIfAborted();
    const aborted = Promise.withResolvers(),
      onAbort = () => aborted.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([action(), aborted.promise]);
      active.throwIfAborted();
      seal();
      return value;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  if (!fresh)
    await step(() =>
      recheckAzureTerraformNetworkPostPlaintextParentCustody(parentWitness, request, store, context, deadline),
    );
  verifyAzureCePlan(original);
  const checkpoint = object24(terminal),
    frozen = structuredClone(checkpoint.retainedNetworkParentInventory);
  require36(
    frozen &&
      same32(frozen, object24(checkpoint.retirementEvidence).networkParentInventory) &&
      frozen.schemaVersion === 1 &&
      frozen.mainDirectory === request.deploymentName &&
      !Object.hasOwn(checkpoint, 'retainedDestroyConfiguration') &&
      frozen.scope === 'native-bound-network-parent-inventory' &&
      frozen.completeParentDispositionQualified === true &&
      same32(frozen.owner, owner) &&
      frozen.originalPlanSha256 === request.planSha256 &&
      frozen.teardownPlanSha256 === teardown.planSha256,
    'authenticated frozen parent required',
  );
  const custody = new Map();
  const file = async (path, parent) => {
    require36(
      path !== '' && path.split('/').every((p) => /^[a-zA-Z0-9_.-]+$/.test(p) && p !== '.' && p !== '..'),
      'foreign native path',
    );
    const native = await step(
      () =>
        readAzureTerraformParentPrivateFile(
          join30(root, path),
          parent ? AbortSignal.any([deadline, parent]) : deadline,
        ),
      parent,
    );
    const value = { identity: native.identity, bytesSha256: hash26(native.bytes) };
    require36(!custody.has(path) || same32(custody.get(path), value), 'retained native bytes or identity changed');
    custody.set(path, value);
    return JSON.parse(native.bytes.toString());
  };
  const record = async (path, parent) => {
    const logical = await step(() => store.read(path), parent),
      native = await file(path, parent);
    require36(same32(logical, native), 'logical and native record differ');
    return structuredClone(native);
  };
  const boundary = async (parent) => {
    for (const path of custody.keys()) await file(path, parent);
    seal();
  };
  const declared = new Map([...frozen.files, frozen.terminalFile].map((row) => [row.path, row]));
  const frozenRecord = async (path, parent) => {
    const native = await record(path, parent),
      snapshot = custody.get(path),
      expected = declared.get(path),
      decision = frozen.parentArtifactDecisions.find((row) => row.path === path);
    require36(
      snapshot &&
        expected &&
        decision &&
        decision.action === 'preserve' &&
        expected.identity === snapshot.identity &&
        expected.sha256 === snapshot.bytesSha256 &&
        expected.packetSha256 === canonicalSha256(native),
      'retained record lacks frozen preserved decision',
    );
    return native;
  };
  require36(same32(await record('azure-terraform-terminal-cleanup.json'), terminal), 'saved terminal differs');
  require36(same32(await frozenRecord('owner.json'), { schemaVersion: 2, owner }), 'saved owner differs');
  require36(same32(await frozenRecord(`${teardown.planId}.json`), teardown), 'saved teardown differs');
  const deployment = await step(() => azureTerraformCurrentDeployment(original));
  const mainSession = await step(() => terraform.open(owner, deployment, 'current'));
  const bind = (session) => {
    const reader = session.readArtifactRetirement;
    require36(typeof reader === 'function', 'owning native retirement service reader required');
    methods.push({ target: session, key: 'readArtifactRetirement', value: reader });
    return reader;
  };
  const mainReader = bind(mainSession),
    final = object24(checkpoint.final);
  require36(
    sha22(checkpoint.retirementEvidenceSha256) &&
      checkpoint.retirementEvidenceSha256 === canonicalSha256(checkpoint.retirementEvidence),
    'native evidence digest differs',
  );
  const main = await step(() => mainReader.call(mainSession, final, checkpoint.retirementEvidenceSha256, deadline));
  require36(
    main.status === 'runner-artifacts-retired' && same32(main.receipt, checkpoint.artifacts),
    'main native barrier differs',
  );
  const mainManifest = await file(`${deployment.deploymentId}/deployment.json`),
    mainMarker = await file(`${deployment.deploymentId}/artifact-retirement.json`);
  require36(
    canonicalSha256(mainManifest) === main.receipt.manifestSha256 &&
      custody.get(`${deployment.deploymentId}/artifact-retirement.json`)?.bytesSha256 === main.markerSha256 &&
      object24(mainMarker).status === 'runner-artifacts-retired',
    'main native filesystem differs',
  );
  const rows = [];
  const sources = new Map();
  for (const child of frozen.children) {
    let source = sources.get(child.networkPlanSha256);
    if (!source) {
      source = structuredClone(await step(() => loaders.loadSource(child.networkPlanSha256)));
      verifyAzureCePlan(source);
      const publicBinding = frozen.publicBindings.sources.filter((row) => row.planSha256 === child.networkPlanSha256);
      require36(
        source.planSha256 === child.networkPlanSha256 &&
          publicBinding.length === 1 &&
          publicBinding[0]?.sourceSha256 === canonicalSha256(source) &&
          same32(azureUpgradeBinding(source).owner, owner),
        'frozen public source differs',
      );
      sources.set(source.planSha256, source);
    }
    require36(child.operation === 'deallocate' || child.operation === 'start', 'exact selected operation required');
    const selected = await step(() => azureTerraformNetworkRetiredPowerDeployment(source, child.node, child.operation));
    require36(selected.stage === child.stage, 'selected native stage differs');
    const proof = object24(child.proof),
      expected = object24(proof.observed);
    require36(
      expected.status === 'runner-artifacts-retired' &&
        sha22(expected.markerSha256) &&
        sha22(proof.preparingSha256) &&
        sha22(proof.finalReceiptSha256),
      'complete frozen child proof required',
    );
    const cancelId = canonicalSha256({
      planSha256: source.planSha256,
      selectedNode: child.node,
      selectedOperation: child.operation,
    }).slice(0, 24);
    const cancelled = frozen.networkPacketNames.includes(`azure-power-cancel-${cancelId}.json`);
    const receiptPath = cancelled
      ? `azure-power-runner-retirement-${cancelId}-preparing.json`
      : `${source.planId}-terraform-network-node-${child.node}-${child.operation}-final-plan.json`;
    const packet = await frozenRecord(receiptPath),
      receipt = cancelled ? object24(packet).finalReceipt : packet;
    require36(canonicalSha256(receipt) === proof.finalReceiptSha256, 'exact preserved final receipt differs');
    const session = await step(() => terraform.open(owner, selected, 'current')),
      reader = bind(session);
    const observed = await step(() => reader.call(session, receipt, proof.preparingSha256, deadline));
    require36(
      observed.status === 'runner-artifacts-retired' && same32(observed, expected),
      'child native service differs from frozen proof',
    );
    const directory = `terraform-stages/${child.stage}/${selected.deploymentId}`;
    const manifest = await file(`${directory}/deployment.json`);
    await file(`${directory}/artifact-retirement.json`);
    for (const path of [`${directory}/deployment.json`, `${directory}/artifact-retirement.json`]) {
      const expectedFile = declared.get(path),
        snapshot = custody.get(path);
      require36(
        expectedFile &&
          snapshot &&
          expectedFile.identity === snapshot.identity &&
          expectedFile.sha256 === snapshot.bytesSha256,
        'child frozen native identity differs',
      );
    }
    require36(
      canonicalSha256(manifest) === observed.receipt.manifestSha256 &&
        custody.get(`${directory}/artifact-retirement.json`)?.bytesSha256 === observed.markerSha256,
      'child native manifest or marker differs',
    );
    rows.push({ child, session, reader, final: receipt, evidenceSha256: proof.preparingSha256, observed });
  }
  require36(
    rows.length === frozen.children.length && new Set(rows.map((row) => row.child.stage)).size === rows.length,
    'duplicate or partial child bindings',
  );
  const inspect = async (parent) => {
    await boundary(parent);
    require36(
      same32(
        await step(
          () =>
            mainReader.call(
              mainSession,
              final,
              checkpoint.retirementEvidenceSha256,
              parent ? AbortSignal.any([deadline, parent]) : deadline,
            ),
          parent,
        ),
        main,
      ),
      'main native barrier changed',
    );
    for (const row of rows)
      require36(
        same32(
          await step(
            () =>
              row.reader.call(
                row.session,
                row.final,
                row.evidenceSha256,
                parent ? AbortSignal.any([deadline, parent]) : deadline,
              ),
            parent,
          ),
          row.observed,
        ),
        'child native barrier changed',
      );
    await boundary(parent);
  };
  await inspect();
  const result = {
    schemaVersion: 1,
    scope: fresh
      ? 'fresh-native-marker-authenticated-retired-service-custody'
      : 'in-process-frozen-native-retired-service-custody',
    owner,
    originalPlanSha256: original.planSha256,
    teardownPlanSha256: teardown.planSha256,
    frozenParentInventorySha256: canonicalSha256(frozen),
    mainMarkerSha256: main.markerSha256,
    children: rows.map((row) => ({
      stage: row.child.stage,
      networkPlanSha256: row.child.networkPlanSha256,
      node: row.child.node,
      operation: row.child.operation,
      markerSha256: row.observed.markerSha256,
    })),
    nativeServicesQualified: true,
    freshNativeServiceObservation: fresh,
    freshPostDeletionRecoveryQualified: false,
    sensitiveDeletionExecutionQualified: false,
    parentRetirementQualified: false,
    liveQualified: false,
  };
  const digest = canonicalSha256(result);
  witnesses11.set(result, {
    request,
    store,
    context,
    digest,
    async recheck(parent) {
      require36(canonicalSha256(result) === digest, 'retired service witness changed');
      await inspect(parent);
    },
  });
  return result;
}
async function recheckAzureTerraformNetworkFrozenRetiredServices(witness, request, store, context, signal) {
  signal?.throwIfAborted();
  const bound = witness && typeof witness === 'object' ? witnesses11.get(witness) : undefined;
  require36(
    bound &&
      bound.request === request &&
      bound.store === store &&
      bound.context === context &&
      canonicalSha256(witness) === bound.digest,
    'owning frozen retired services witness required',
  );
  await bound.recheck(signal);
}

// plugins/azure/src/ce/terraform-network-teardown-admission.ts
var witnesses12 = new WeakMap();
function require37(value, message) {
  if (!value) throw Error(`Azure Terraform network teardown admission: ${message}`);
}
async function qualifyAzureTerraformNetworkTeardownAdmission(request, store, context, signal) {
  const original = structuredClone(request),
    owner = structuredClone(store.owner),
    directory = store.directory,
    site = structuredClone(context.site),
    { publicSession, terraform, loaders, verifier, replacementVerifier } = context;
  const dependencies = [
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'verify', value: store.verify },
    { target: terraform, key: 'open', value: terraform.open },
    { target: loaders, key: 'loadSource', value: loaders.loadSource },
    { target: loaders, key: 'loadOutcome', value: loaders.loadOutcome },
    ...['getSessionId', 'getArtifactsDir', 'getArtifactPath', 'saveArtifact'].map((key) => ({
      target: publicSession,
      key,
      value: Reflect.get(publicSession, key),
    })),
  ];
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require37(
      canonicalSha256(request) === canonicalSha256(original) &&
        canonicalSha256(store.owner) === canonicalSha256(owner) &&
        store.directory === directory &&
        context.publicSession === publicSession &&
        context.terraform === terraform &&
        context.loaders === loaders &&
        context.verifier === verifier &&
        context.replacementVerifier === replacementVerifier &&
        canonicalSha256(context.site) === canonicalSha256(site) &&
        dependencies.every(({ target, key, value }) => Reflect.get(target, key) === value),
      'owning request, context or dependency changed',
    );
  };
  const collect = async (parentSignal) => {
    seal();
    const active = AbortSignal.any([deadline, ...(parentSignal ? [parentSignal] : [])]);
    active.throwIfAborted();
    const canceled = Promise.withResolvers(),
      onAbort = () => canceled.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const history = await Promise.race([
        readAzureTerraformNetworkAllOriginalCustody(
          original,
          publicSession,
          store,
          terraform,
          loaders,
          site,
          verifier,
          active,
          replacementVerifier,
        ),
        canceled.promise,
      ]);
      active.throwIfAborted();
      seal();
      require37(
        history.allPublicRequestCustodyQualified &&
          history.sharedMain.status === 'complete' &&
          history.sharedMain.allNativeReceiptsAccounted &&
          history.sharedMain.originalDeploymentJournalsQualified &&
          history.sharedMain.unrecognizedRootEntrySha256s?.length === 0,
        'complete original and public native journal custody required',
      );
      const powers = history.rows.flatMap((row) => {
        require37(
          row.main.originalPublishedJournalsQualified &&
            row.main.terminalPublishedJournalsQualified &&
            row.power.rows.length > 0 &&
            row.power.rows.every(
              (power) => power.status === 'retired' && power.retirement?.runnerRetirementQualified === true,
            ),
          'complete published network and retired power custody required',
        );
        return row.power.rows.map((power) => ({ planSha256: row.planSha256, ...power }));
      });
      const stages = powers.map((power) => power.stage).sort();
      require37(new Set(stages).size === stages.length, 'duplicate authenticated power stage');
      return { history, stages };
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  const first = await collect(),
    historySha256 = canonicalSha256(first.history);
  const result = {
    schemaVersion: 1,
    scope: 'pre-destroy-authenticated-network-stage-history',
    originalPlanSha256: original.planSha256,
    owner,
    site,
    stages: first.stages,
    historySha256,
    publicJournalCustodyQualified: true,
    powerRunnerRetirementQualified: true,
    mainRunnerRetirementQualified: false,
    parentRetirementQualified: false,
    currentOperationalAcceptanceQualified: false,
  };
  const digest = canonicalSha256(result);
  witnesses12.set(result, {
    request,
    store,
    context,
    digest,
    async recheck(parentSignal) {
      seal();
      require37(canonicalSha256(result) === digest, 'authenticated witness changed');
      const current = await collect(parentSignal);
      require37(
        canonicalSha256(current.history) === historySha256 &&
          canonicalSha256(current.stages) === canonicalSha256(result.stages),
        'authenticated network stage history changed',
      );
      seal();
    },
  });
  return result;
}
async function recheckAzureTerraformNetworkTeardownAdmission(witness, request, store, context, signal) {
  signal?.throwIfAborted();
  const bound = witness && typeof witness === 'object' ? witnesses12.get(witness) : undefined;
  require37(
    bound &&
      bound.request === request &&
      bound.store === store &&
      bound.context === context &&
      canonicalSha256(witness) === bound.digest,
    'owning authenticated admission witness required',
  );
  await bound.recheck(signal);
  require37(canonicalSha256(witness) === bound.digest, 'authenticated witness changed');
}

// plugins/azure/src/ce/terraform-teardown-stage-history.ts
var stageHistoryWitnesses = new WeakMap();
async function recheckAzureTerraformTeardownStageHistory(witness, request, store, signal, context) {
  signal?.throwIfAborted();
  const bound = witness && typeof witness === 'object' ? stageHistoryWitnesses.get(witness) : undefined;
  if (
    !bound ||
    bound.request !== request ||
    bound.store !== store ||
    bound.context !== context ||
    canonicalSha256(witness) !== bound.digest
  )
    throw Error('Azure owning stage history witness required');
  const aborted = Promise.withResolvers(),
    onAbort = () => aborted.reject(signal?.reason);
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    await Promise.race([bound.recheck(signal), aborted.promise]);
    signal?.throwIfAborted();
    if (canonicalSha256(witness) !== bound.digest) throw Error('Azure stage history witness changed');
    return witness;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
async function qualifyAzureTerraformTeardownStageHistory(request, store, signal, networkContext) {
  const base = structuredClone(request),
    owner = structuredClone(store.owner),
    { directory, read, verify } = store;
  const phase = () =>
    canonicalSha256({
      provided: !!networkContext && Object.hasOwn(networkContext, 'destroyTeardown'),
      value: networkContext?.destroyTeardown,
      terminalProvided: !!networkContext && Object.hasOwn(networkContext, 'terminalCleanup'),
      terminal: networkContext?.terminalCleanup,
    });
  const requestedPhaseSha256 = phase();
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    if (
      phase() !== requestedPhaseSha256 ||
      base.engine !== 'terraform' ||
      canonicalSha256(request) !== canonicalSha256(base) ||
      canonicalSha256(store.owner) !== canonicalSha256(owner) ||
      canonicalSha256(owner) !== canonicalSha256(azureUpgradeBinding(base).owner) ||
      store.directory !== directory ||
      store.read !== read ||
      store.verify !== verify
    )
      throw Error('Azure teardown stage owner or dependency changed');
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
  const privateDirectories = new Map();
  const privateDirectory = async (path) => {
    const stat = await step(() => lstat27(path));
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.uid !== process.getuid?.() ||
      (stat.mode & 63) !== 0 ||
      (await step(() => realpath26(path))) !== path
    )
      throw Error('Azure teardown stage private directory ownership differs');
    const identity = `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
    if (privateDirectories.has(path) && privateDirectories.get(path) !== identity)
      throw Error('Azure teardown stage directory identity changed');
    privateDirectories.set(path, identity);
  };
  const stagesRoot = join31(directory, 'terraform-stages');
  const inventory = async () => {
    try {
      await privateDirectory(stagesRoot);
      return await step(() => readdir28(stagesRoot));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return [];
    }
  };
  await privateDirectory(directory);
  await step(() => verify.call(store));
  const stages = (await inventory()).sort();
  for (const stage of stages) await privateDirectory(join31(stagesRoot, stage));
  if (
    networkContext &&
    Object.hasOwn(networkContext, 'destroyTeardown') &&
    (!networkContext.destroyTeardown || typeof networkContext.destroyTeardown !== 'object')
  )
    throw Error('Malformed Azure post-destroy stage context');
  const destroyContext = networkContext?.destroyTeardown ? networkContext : undefined;
  if (
    networkContext &&
    Object.hasOwn(networkContext, 'terminalCleanup') &&
    (!destroyContext || !networkContext.terminalCleanup || typeof networkContext.terminalCleanup !== 'object')
  )
    throw Error('Malformed Azure terminal empty-main stage context');
  const terminalPlanning =
    !!networkContext?.terminalCleanup &&
    typeof networkContext.terminalCleanup === 'object' &&
    ['cancelling', 'planning'].includes(String(Reflect.get(networkContext.terminalCleanup, 'phase')));
  const postPlaintext =
    !!networkContext?.terminalCleanup &&
    typeof networkContext.terminalCleanup === 'object' &&
    Reflect.get(networkContext.terminalCleanup, 'phase') === 'retired' &&
    !Object.hasOwn(networkContext.terminalCleanup, 'retainedDestroyConfiguration');
  const retiredNetwork = postPlaintext
    ? await step(() => qualifyAzureTerraformNetworkFreshRetiredServices(request, store, networkContext, deadline))
    : undefined;
  const network = postPlaintext
    ? undefined
    : terminalPlanning
      ? await step(() => qualifyAzureTerraformNetworkCancelledMainBinding(request, store, networkContext, deadline))
      : networkContext && Object.hasOwn(networkContext, 'terminalCleanup')
        ? await step(() => qualifyAzureTerraformNetworkTerminalJournalCustody(request, store, networkContext, deadline))
        : destroyContext
          ? await step(() =>
              qualifyAzureTerraformNetworkDestroyJournalCustody(request, store, destroyContext, deadline),
            )
          : networkContext
            ? await step(() => qualifyAzureTerraformNetworkTeardownAdmission(request, store, networkContext, deadline))
            : undefined;
  const networkStages = retiredNetwork ? retiredNetwork.children.map((child) => child.stage) : (network?.stages ?? []);
  if (
    networkStages.some((stage) => !stages.includes(stage)) ||
    stages.some(
      (stage) => !networkStages.includes(stage) && !/^(?:upgrade-(?:software|os)|failover)-[a-f0-9]{24}$/.test(stage),
    )
  )
    throw Error('Unqualified Azure stage blocks terminal cleanup');
  for (const stage of stages) await privateDirectory(join31(stagesRoot, stage));
  const records = new Map();
  const readSource = async (name) => {
    const value = structuredClone(await step(() => read.call(store, name)));
    const digest = canonicalSha256(value);
    if (records.has(name) && records.get(name) !== digest)
      throw Error('Azure teardown stage source changed during qualification');
    records.set(name, digest);
    return value;
  };
  const sourceInventory = () =>
    step(async () =>
      (await readdir28(directory))
        .filter((name) => /^azure-ce-(?:failover|upgrade)-[a-f0-9]{24}\.json$/.test(name))
        .sort(),
    );
  const sourceNames = await sourceInventory();
  const readers = new Map([
    ['read', readSource],
    ['verify', () => step(() => verify.call(store))],
  ]);
  const readonlyStore = new Proxy(store, {
    get(target, key) {
      if (readers.has(key)) return readers.get(key);
      if (['write', 'remove', 'retire'].includes(String(key)))
        return () => {
          throw Error('Stage history qualification cannot mutate storage');
        };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const failoverStages = stages.filter((stage) => stage.startsWith('failover-')),
    upgradeStages = stages.filter((stage) => stage.startsWith('upgrade-'));
  const failovers = await step(() => qualifiedAzureTerraformFailoverStages(base, readonlyStore, failoverStages));
  const upgradeContract = upgradeStages.length
    ? await step(() => VerifiedUpgradeContract.release(fetch, deadline))
    : undefined;
  const upgrades = upgradeContract
    ? await step(() => qualifiedAzureTerraformUpgradeStages(base, readonlyStore, upgradeStages, upgradeContract))
    : [];
  const recheckPrivateBefore = async () => {
    if (canonicalSha256((await inventory()).sort()) !== canonicalSha256(stages))
      throw Error('Azure teardown stage inventory changed during qualification');
    for (const stage of stages) await privateDirectory(join31(stagesRoot, stage));
    for (const name of records.keys()) await readSource(name);
    if (canonicalSha256(await sourceInventory()) !== canonicalSha256(sourceNames))
      throw Error('Azure teardown stage source inventory changed during qualification');
  };
  const recheckNative = async (parent) => {
    const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
    active.throwIfAborted();
    if (retiredNetwork)
      await step(() =>
        recheckAzureTerraformNetworkFrozenRetiredServices(retiredNetwork, request, store, networkContext, active),
      );
    else if (network && terminalPlanning)
      await step(() =>
        recheckAzureTerraformNetworkCancelledMainBinding(network, request, store, networkContext, active),
      );
    else if (
      network &&
      networkContext?.terminalCleanup &&
      typeof networkContext.terminalCleanup === 'object' &&
      Reflect.get(networkContext.terminalCleanup, 'phase') === 'retired'
    )
      await step(() => recheckAzureTerraformNetworkRetiredMainCustody(network, request, store, networkContext, active));
    else if (network && destroyContext)
      await step(() =>
        recheckAzureTerraformNetworkDestroyJournalCustody(network, request, store, destroyContext, active),
      );
    else if (network && networkContext)
      await step(() => recheckAzureTerraformNetworkTeardownAdmission(network, request, store, networkContext, active));
    active.throwIfAborted();
  };
  const recheckPrivateAfter = async () => {
    if (canonicalSha256((await inventory()).sort()) !== canonicalSha256(stages))
      throw Error('Azure teardown stage inventory changed after network qualification');
    for (const stage of stages) await privateDirectory(join31(stagesRoot, stage));
    for (const name of records.keys()) await readSource(name);
    if (canonicalSha256(await sourceInventory()) !== canonicalSha256(sourceNames))
      throw Error('Azure teardown stage source inventory changed after network qualification');
    await step(() => verify.call(store));
    await privateDirectory(directory);
    seal();
  };
  await recheckPrivateBefore();
  await recheckNative();
  await recheckPrivateAfter();
  const sourceSha256 = canonicalSha256({
    stages,
    ...(network ? { network } : {}),
    ...(retiredNetwork ? { retiredNetwork } : {}),
    sourceNames,
    records: [...records].sort(([a], [b]) => a.localeCompare(b)),
    directories: [...privateDirectories].sort(([a], [b]) => a.localeCompare(b)),
  });
  const result = {
    stages,
    failovers,
    upgrades,
    upgradeContract,
    sourceSha256,
    ...(network ? { network } : {}),
    ...(retiredNetwork ? { retiredNetwork } : {}),
  };
  const digest = canonicalSha256(result);
  stageHistoryWitnesses.set(result, {
    request,
    store,
    context: networkContext,
    digest,
    async recheck(parent) {
      seal();
      if (canonicalSha256(result) !== digest) throw Error('Azure stage history witness changed');
      await recheckPrivateBefore();
      await recheckNative(parent);
      await recheckPrivateAfter();
      seal();
    },
  });
  return result;
}

// plugins/azure/src/ce/terraform-terminal-cleanup.ts
import { createHash as createHash38 } from 'node:crypto';

// plugins/azure/src/ce/terraform-network-fresh-parent-absence.ts
var same33 = (a, b) => canonicalEqual({ value: a }, { value: b });
function require38(value, message) {
  if (!value) throw Error(`Azure fresh parent absence: ${message}`);
}
var witnesses13 = new WeakMap();
async function qualifyAzureTerraformNetworkFreshParentAbsence(request, store, context, runtime, contract, api, signal) {
  const active = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const original = structuredClone(request),
    owner = structuredClone(store.owner),
    root = store.directory,
    terminal = structuredClone(context.terminalCleanup),
    teardown = structuredClone(context.destroyTeardown),
    siteContract = runtime.contract,
    siteFingerprint = runtime.contract.fingerprint,
    ingressFingerprint = contract.fingerprint;
  const runtimeAbsence = runtime.unregisteredAbsence,
    exec = api.exec,
    { read, verify } = store;
  const originalSha256 = canonicalSha256({ value: original }),
    ownerSha256 = canonicalSha256({ value: owner }),
    terminalSha256 = canonicalSha256({ value: terminal }),
    teardownSha256 = canonicalSha256({ value: teardown });
  const guard = () => {
    active.throwIfAborted();
    require38(
      canonicalSha256({ value: request }) === originalSha256 &&
        canonicalSha256({ value: store.owner }) === ownerSha256 &&
        store.directory === root &&
        matchesAzureTerraformTerminalSnapshot(context.terminalCleanup, terminalSha256) &&
        canonicalSha256({ value: context.destroyTeardown }) === teardownSha256 &&
        runtime.engine === 'terraform' &&
        runtime.contract === siteContract &&
        runtime.contract.fingerprint === siteFingerprint &&
        contract.fingerprint === ingressFingerprint &&
        runtime.unregisteredAbsence === runtimeAbsence &&
        api.exec === exec &&
        store.read === read &&
        store.verify === verify,
      'owning context or dependency changed',
    );
  };
  guard();
  const binding = azureUpgradeBinding(request);
  require38(
    same33(binding.owner, owner) &&
      same33(
        compileAzureTerraformTeardown(
          request,
          teardown.drain,
          teardown.retirement,
          teardown.pendingAdmissionJournalSha256,
        ),
        teardown,
      ) &&
      teardown.drain.siteContractFingerprint === siteFingerprint &&
      teardown.drain.ingressContractFingerprint === ingressFingerprint,
    'exact compiled identity and contracts required',
  );
  const namespaces = new Set(['default']);
  for (const name of [
    ...teardown.drain.listeners.map((row) => row.namespace),
    ...teardown.drain.origins.map((row) => row.origin.namespace),
  ]) {
    require38(typeof name === 'string' && /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(name), 'exact namespace required');
    namespaces.add(name);
  }
  const native = await qualifyAzureTerraformNetworkFreshRetiredServices(request, store, context, active);
  guard();
  const step = async (action, parent) => {
    guard();
    const current = AbortSignal.any([active, ...(parent ? [parent] : [])]);
    current.throwIfAborted();
    const aborted = Promise.withResolvers(),
      onAbort = () => aborted.reject(current.reason);
    current.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), aborted.promise]);
      current.throwIfAborted();
      guard();
      return result;
    } finally {
      current.removeEventListener('abort', onAbort);
    }
  };
  const inspect = async (parent) => {
    await step(
      () =>
        recheckAzureTerraformNetworkFrozenRetiredServices(
          native,
          request,
          store,
          context,
          parent ? AbortSignal.any([active, parent]) : active,
        ),
      parent,
    );
    const start = Date.now();
    const platform = await step(
      () =>
        runtimeAbsence.call(
          runtime,
          [binding],
          [...namespaces].sort(),
          contract,
          parent ? AbortSignal.any([active, parent]) : active,
        ),
      parent,
    );
    const began = Date.parse(platform.startedAt),
      at = Date.parse(platform.observedAt);
    require38(
      platform.status === 'absent' &&
        same33(platform.owner, owner) &&
        platform.siteContractFingerprint === siteFingerprint &&
        platform.ingressContractFingerprint === ingressFingerprint &&
        Number.isFinite(began) &&
        Number.isFinite(at) &&
        began >= start &&
        at >= began &&
        at <= Date.now() &&
        Date.now() - at <= 60000 &&
        Array.isArray(platform.sources) &&
        platform.sources.length > 0,
      'current complete platform absence required',
    );
    const cloudStart = Date.now();
    const cloud = await step(
      () => observeAzureCeRetirementAbsence(request, api, parent ? AbortSignal.any([active, parent]) : active),
      parent,
    );
    const cloudAt = Date.parse(cloud.observedAt);
    require38(
      cloud.status === 'absent' &&
        cloud.engine === 'terraform' &&
        cloud.sourcePlanSha256 === request.planSha256 &&
        Number.isFinite(cloudAt) &&
        cloudAt >= cloudStart &&
        cloudAt <= Date.now() &&
        Date.now() - cloudAt <= 60000 &&
        cloud.reads.length === 3,
      'current complete cloud absence required',
    );
    await step(
      () =>
        recheckAzureTerraformNetworkFrozenRetiredServices(
          native,
          request,
          store,
          context,
          parent ? AbortSignal.any([active, parent]) : active,
        ),
      parent,
    );
    require38(Date.now() - at <= 60000 && Date.now() - cloudAt <= 60000, 'external observations became stale');
    return { platform, cloud };
  };
  const evidence = await inspect();
  const result = {
    schemaVersion: 1,
    scope: 'fresh-native-bound-azure-cloud-and-platform-resource-absence',
    owner,
    originalPlanSha256: request.planSha256,
    teardownPlanSha256: teardown.planSha256,
    frozenParentInventorySha256: native.frozenParentInventorySha256,
    mainMarkerSha256: native.mainMarkerSha256,
    evidence,
    evidenceSha256: canonicalSha256(evidence),
    interfaceAbsenceQualified: false,
    fullExternalCleanupQualified: false,
    bootstrapRetirementQualified: false,
    parentRetirementQualified: false,
    installedQualified: false,
    liveQualified: false,
  };
  const digest = canonicalSha256(result);
  witnesses13.set(result, {
    request,
    store,
    context,
    runtime,
    contract,
    api,
    digest,
    async recheck(parent) {
      require38(canonicalSha256(result) === digest, 'absence witness changed');
      return inspect(parent);
    },
  });
  return result;
}
async function recheckAzureTerraformNetworkFreshParentAbsence(
  witness,
  request,
  store,
  context,
  runtime,
  contract,
  api,
  signal,
) {
  signal?.throwIfAborted();
  const bound = witness && typeof witness === 'object' ? witnesses13.get(witness) : undefined;
  require38(
    bound &&
      bound.request === request &&
      bound.store === store &&
      bound.context === context &&
      bound.runtime === runtime &&
      bound.contract === contract &&
      bound.api === api &&
      canonicalSha256(witness) === bound.digest,
    'owning fresh absence witness required',
  );
  return bound.recheck(signal);
}

// plugins/azure/src/ce/terraform-network-opaque-checkout-retirement.ts
// plugins/azure/src/ce/terraform-network-sensitive-packet-retirement.ts
import { createHash as createHash32, createHash as createHash33 } from 'node:crypto';
import {
  lstat as lstat28,
  lstat as lstat29,
  readdir as readdir29,
  realpath as realpath27,
  unlink as unlink5,
} from 'node:fs/promises';
import { isAbsolute as isAbsolute4, join as join32, join as join33, resolve as resolve3 } from 'node:path';

var nonBootstrapMarkerName = 'azure-terraform-network-packet-retirement.json';
var bootstrapMarkerName = 'azure-terraform-network-bootstrap-packet-retirement.json';
var hash27 = (bytes) => createHash32('sha256').update(bytes).digest('hex');
var same34 = (a, b) => canonicalEqual({ value: a }, { value: b });
var safe2 = (path) =>
  path !== '' && path.split('/').every((part) => /^[a-zA-Z0-9_.-]+$/.test(part) && part !== '.' && part !== '..');
function require39(value, message) {
  if (!value) throw Error(`Azure network packet retirement: ${message}`);
}
var bootstrapObservations = new WeakMap();
async function recheckAzureTerraformNetworkRetiredBootstrapPackets(
  observation,
  request,
  store,
  context,
  absence,
  runtime,
  contract,
  api,
  signal,
) {
  signal?.throwIfAborted();
  const bound = observation && typeof observation === 'object' ? bootstrapObservations.get(observation) : undefined;
  require39(
    bound &&
      bound.request === request &&
      bound.store === store &&
      bound.context === context &&
      bound.absence === absence &&
      bound.runtime === runtime &&
      bound.contract === contract &&
      bound.api === api &&
      canonicalSha256(observation) === bound.digest,
    'genuine owning completed bootstrap observation required',
  );
  const active = AbortSignal.any([bound.deadline, ...(signal ? [signal] : [])]);
  active.throwIfAborted();
  const aborted = Promise.withResolvers(),
    onAbort = () => aborted.reject(active.reason);
  active.addEventListener('abort', onAbort, { once: true });
  try {
    await Promise.race([bound.recheck(), aborted.promise]);
    active.throwIfAborted();
    require39(canonicalSha256(observation) === bound.digest, 'completed bootstrap observation changed');
    return observation;
  } finally {
    active.removeEventListener('abort', onAbort);
  }
}
async function retireAzureTerraformNetworkSensitivePackets(request, store, context, signal) {
  const result = await retirePackets(request, store, context, 'non-bootstrap', undefined, signal);
  return { ...result, status: 'non-bootstrap-packets-retired' };
}
async function retireAzureTerraformNetworkBootstrapPackets(
  request,
  store,
  context,
  absence,
  runtime,
  contract,
  api,
  signal,
) {
  const active = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const beforeSnapshot = (active) =>
    recheckAzureTerraformNetworkFreshParentAbsence(absence, request, store, context, runtime, contract, api, active);
  await beforeSnapshot(active);
  const result = await retirePackets(request, store, context, 'bootstrap', beforeSnapshot, active);
  return {
    ...result,
    status: 'bootstrap-packets-retired',
    interfaceAbsenceQualified: false,
    fullExternalCleanupQualified: false,
  };
}
async function qualifyAzureTerraformNetworkRetiredBootstrapPackets(
  request,
  store,
  context,
  absence,
  runtime,
  contract,
  api,
  signal,
) {
  const active = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const fresh = (selected) =>
    recheckAzureTerraformNetworkFreshParentAbsence(absence, request, store, context, runtime, contract, api, selected);
  await fresh(active);
  let recheck;
  const result = await retirePackets(request, store, context, 'bootstrap', fresh, active, true, (callback) => {
    recheck = callback;
  });
  require39(recheck, 'completed native snapshot recheck required');
  const observation = {
    ...result,
    status: 'retired-bootstrap-packets-observed',
    completeParentFileCustodyQualified: true,
    bootstrapPacketRetirementQualified: true,
    interfaceAbsenceQualified: false,
    fullExternalCleanupQualified: false,
    opaqueCheckoutRetirementQualified: false,
  };
  bootstrapObservations.set(observation, {
    request,
    store,
    context,
    absence,
    runtime,
    contract,
    api,
    digest: canonicalSha256(observation),
    deadline: active,
    recheck,
  });
  return observation;
}
async function retirePackets(
  request,
  store,
  context,
  kind,
  beforeSnapshot,
  signal,
  readOnly = false,
  onCompletedReadOnlySnapshot,
) {
  const markerName = kind === 'bootstrap' ? bootstrapMarkerName : nonBootstrapMarkerName;
  const active = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const root = store.directory,
    owner = structuredClone(store.owner),
    original = structuredClone(request),
    terminal = structuredClone(context.terminalCleanup);
  const { read, verify, write } = store;
  const requestMatches = canonicalSnapshot({ value: original }),
    ownerMatches = canonicalSnapshot({ value: owner }),
    terminalMatches = captureAzureTerraformTerminalSnapshot(terminal);
  const guard = () => {
    active.throwIfAborted();
    require39(
      store.directory === root &&
        ownerMatches({ value: store.owner }) &&
        requestMatches({ value: request }) &&
        terminalMatches(context.terminalCleanup) &&
        store.read === read &&
        store.verify === verify &&
        store.write === write,
      'owning context changed',
    );
  };
  guard();
  const native = await qualifyAzureTerraformNetworkFreshRetiredServices(request, store, context, active);
  guard();
  require39(terminal && typeof terminal === 'object' && !Array.isArray(terminal), 'complete terminal record required');
  const frozen = structuredClone(Reflect.get(terminal, 'retainedNetworkParentInventory'));
  require39(
    frozen && canonicalSha256(frozen) === native.frozenParentInventorySha256,
    'native frozen inventory differs',
  );
  const actions = frozen.parentArtifactDecisions
    .filter(
      (row) =>
        row.action === 'delete' &&
        (kind === 'bootstrap' ? row.schema === 'ce-bootstrap-token-v1' : row.schema !== 'ce-bootstrap-token-v1'),
    )
    .sort((a, b) => a.path.localeCompare(b.path));
  const deferredBootstrap = frozen.parentArtifactDecisions
    .filter((row) => kind === 'non-bootstrap' && row.action === 'delete' && row.schema === 'ce-bootstrap-token-v1')
    .sort((a, b) => a.path.localeCompare(b.path));
  const paths = actions.map((row) => row.path);
  require39(
    (kind === 'bootstrap' || paths.length > 0) &&
      new Set(paths).size === paths.length &&
      actions.every((row) => safe2(row.path) && row.path !== markerName),
    'complete typed packet actions required',
  );
  const binding = {
    schemaVersion: 1,
    scope:
      kind === 'bootstrap'
        ? 'fresh-native-bound-bootstrap-packet-retirement'
        : 'native-bound-non-bootstrap-packet-retirement',
    owner,
    originalPlanSha256: request.planSha256,
    teardownPlanSha256: context.destroyTeardown.planSha256,
    frozenInventorySha256: canonicalSha256(frozen),
    mainMarkerSha256: native.mainMarkerSha256,
    actions,
    deferredBootstrap,
  };
  const previouslyDeleted = new Set();
  let priorMarker;
  if (kind === 'bootstrap') {
    const priorActions = frozen.parentArtifactDecisions
      .filter((row) => row.action === 'delete' && row.schema !== 'ce-bootstrap-token-v1')
      .sort((a, b) => a.path.localeCompare(b.path));
    const priorDeferred = frozen.parentArtifactDecisions
      .filter((row) => row.action === 'delete' && row.schema === 'ce-bootstrap-token-v1')
      .sort((a, b) => a.path.localeCompare(b.path));
    const logical = await read.call(store, nonBootstrapMarkerName);
    guard();
    const file = await readAzureTerraformParentPrivateFile(join32(root, nonBootstrapMarkerName), active);
    guard();
    const value = JSON.parse(file.bytes.toString());
    const priorBinding = {
      ...binding,
      scope: 'native-bound-non-bootstrap-packet-retirement',
      actions: priorActions,
      deferredBootstrap: priorDeferred,
      status: 'packets-retired',
      deleted: priorActions.map((row) => row.path),
      pending: null,
    };
    require39(
      same34(logical, value) && same34(value, priorBinding),
      'completed native non-bootstrap checkpoint required',
    );
    priorMarker = {
      path: nonBootstrapMarkerName,
      identity: file.identity,
      sha256: hash27(file.bytes),
      packetSha256: canonicalSha256(value),
    };
    for (const row of priorActions) previouslyDeleted.add(row.path);
  }
  let checkpoint;
  const load = async () => {
    guard();
    const logical = await read.call(store, markerName);
    guard();
    const file = await readAzureTerraformParentPrivateFile(join32(root, markerName), active);
    guard();
    const value = JSON.parse(file.bytes.toString());
    require39(same34(logical, value), 'logical and native checkpoint differ');
    require39(
      Array.isArray(value.deleted) &&
        value.deleted.every((path) => typeof path === 'string') &&
        value.deleted.length <= paths.length &&
        same34(value.deleted, paths.slice(0, value.deleted.length)) &&
        (value.pending === null ||
          (typeof value.pending === 'string' &&
            value.deleted.length < paths.length &&
            value.pending === paths[value.deleted.length])) &&
        ['retiring', 'packets-retired'].includes(value.status) &&
        (value.status !== 'packets-retired' || (value.pending === null && value.deleted.length === paths.length)),
      'checkpoint progress differs',
    );
    require39(
      same34(value, {
        ...binding,
        status: value.status,
        deleted: value.deleted,
        pending: value.pending,
      }),
      'checkpoint native authority differs',
    );
    return value;
  };
  try {
    checkpoint = await load();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (readOnly) require39(checkpoint?.status === 'packets-retired', 'completed bootstrap packet retirement required');
  const main = new Map();
  for (const path of [`${frozen.mainDirectory}/artifact-retirement.json`, `${frozen.mainDirectory}/deployment.json`]) {
    const file = await readAzureTerraformParentPrivateFile(join32(root, path), active);
    main.set(path, {
      identity: file.identity,
      sha256: hash27(file.bytes),
      packetSha256: canonicalSha256(JSON.parse(file.bytes.toString())),
    });
  }
  const expected = new Map([...frozen.files, frozen.terminalFile].map((row) => [row.path, row]));
  require39(
    !expected.has(markerName) && expected.size === frozen.files.length + 1,
    'frozen files duplicate or foreign checkpoint',
  );
  for (const [path, row] of main) expected.set(path, { path, ...row });
  if (priorMarker) expected.set(priorMarker.path, priorMarker);
  const directories = new Map(frozen.directories.map((row) => [row.path, row]));
  require39(directories.size === frozen.directories.length, 'duplicate frozen directories');
  const snapshot = async (progress) => {
    guard();
    await verify.call(store);
    guard();
    if (progress) require39(same34(await load(), progress), 'saved progress changed');
    if (beforeSnapshot) {
      await beforeSnapshot(active);
      guard();
    }
    await recheckAzureTerraformNetworkFrozenRetiredServices(native, request, store, context, active);
    guard();
    const absent = new Set([...previouslyDeleted, ...(progress?.deleted ?? [])]);
    if (progress?.pending) {
      try {
        await lstat28(join32(root, progress.pending));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        absent.add(progress.pending);
      }
    }
    const seen = new Set(),
      seenDirs = new Set();
    const walk = async (path) => {
      guard();
      const full = path ? join32(root, path) : root,
        stat = await lstat28(full),
        declared = directories.get(path);
      require39(
        declared &&
          stat.isDirectory() &&
          !stat.isSymbolicLink() &&
          stat.uid === process.getuid?.() &&
          (stat.mode & 63) === 0 &&
          `${stat.dev}:${stat.ino}:${stat.birthtimeMs}` === declared.identity &&
          (await realpath27(full)) === full,
        'native directory identity differs',
      );
      const all = (await readdir29(full)).sort();
      const names = all.filter((name) => path !== '' || name !== '.azure-terraform-lifecycle-lock');
      const expectedNames = (
        path === frozen.mainDirectory ? ['artifact-retirement.json', 'deployment.json'] : declared.names
      ).filter((name) => !absent.has(path ? `${path}/${name}` : name));
      if (path === '' && progress) expectedNames.push(markerName);
      if (path === '' && priorMarker) expectedNames.push(priorMarker.path);
      require39(same34(names, expectedNames.sort()), 'exhaustive directory namespace differs');
      seenDirs.add(path);
      for (const name of names) {
        const selected = path ? `${path}/${name}` : name;
        require39(safe2(selected), 'foreign native path');
        if (selected === markerName) {
          const file = await readAzureTerraformParentPrivateFile(join32(root, selected), active);
          require39(progress && same34(JSON.parse(file.bytes.toString()), progress), 'native saved progress changed');
          continue;
        }
        const current = await lstat28(join32(root, selected));
        if (current.isDirectory() && !current.isSymbolicLink()) {
          await walk(selected);
          continue;
        }
        require39(current.isFile() && !current.isSymbolicLink(), 'foreign native entry');
        const file = await readAzureTerraformParentPrivateFile(join32(root, selected), active),
          prior = expected.get(selected);
        const fragment = selected.startsWith('terraform-original-deployment-publication-fragments/');
        const parsed = fragment ? undefined : JSON.parse(file.bytes.toString());
        if (selected === 'azure-terraform-terminal-cleanup.json')
          require39(same34(parsed, terminal), 'projected terminal differs');
        else
          require39(
            prior &&
              prior.identity === file.identity &&
              prior.sha256 === hash27(file.bytes) &&
              prior.packetSha256 === (fragment ? hash27(file.bytes) : canonicalSha256(parsed)),
            'frozen file bytes or identity differ',
          );
        seen.add(selected);
      }
      const after = await lstat28(full);
      guard();
      require39(
        after.isDirectory() &&
          !after.isSymbolicLink() &&
          after.dev === stat.dev &&
          after.ino === stat.ino &&
          after.birthtimeMs === stat.birthtimeMs &&
          after.uid === stat.uid &&
          (after.mode & 63) === 0 &&
          same34(all, (await readdir29(full)).sort()),
        'native namespace changed during snapshot',
      );
    };
    await walk('');
    require39(
      same34([...seen].sort(), [...expected.keys()].filter((path) => !absent.has(path)).sort()) &&
        same34([...seenDirs].sort(), [...directories.keys()].sort()),
      'partial native discovery',
    );
    guard();
    guard();
  };
  const result = (value) => ({
    owner,
    sourcePlanSha256: request.planSha256,
    teardownPlanSha256: context.destroyTeardown.planSha256,
    inventorySha256: binding.frozenInventorySha256,
    checkpointSha256: canonicalSha256(value),
    retiredPackets: paths.length,
    deferredBootstrapTokens: deferredBootstrap.length,
    parentRetirementQualified: false,
    liveQualified: false,
  });
  await snapshot(checkpoint);
  if (checkpoint?.status === 'packets-retired') {
    const completed = checkpoint;
    if (readOnly) onCompletedReadOnlySnapshot?.(() => snapshot(completed));
    return result(completed);
  }
  const publish = async (value) => {
    guard();
    await write.call(store, markerName, value, active);
    guard();
    const saved = await load();
    require39(same34(saved, value), 'published checkpoint differs');
    checkpoint = saved;
  };
  if (!checkpoint) {
    await publish({ ...binding, status: 'retiring', deleted: [], pending: null });
  }
  require39(checkpoint, 'durable checkpoint required');
  while (checkpoint.deleted.length < paths.length) {
    const selected = paths[checkpoint.deleted.length];
    require39(selected, 'selected typed action required');
    if (checkpoint.pending === null) await publish({ ...checkpoint, pending: selected });
    await snapshot(checkpoint);
    guard();
    let missing = false;
    try {
      await lstat28(join32(root, selected));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      missing = true;
    }
    if (!missing) {
      const file = await readAzureTerraformParentPrivateFile(join32(root, selected), active),
        declared = expected.get(selected);
      require39(
        declared && file.identity === declared.identity && hash27(file.bytes) === declared.sha256,
        'selected packet changed before deletion',
      );
      guard();
      await unlink5(join32(root, selected));
      guard();
    }
    await snapshot(checkpoint);
    await publish({ ...checkpoint, deleted: [...checkpoint.deleted, selected], pending: null });
  }
  await snapshot(checkpoint);
  await publish({ ...checkpoint, status: 'packets-retired' });
  await snapshot(checkpoint);
  return result(checkpoint);
}

// plugins/azure/src/ce/terraform-network-opaque-checkout-retirement.ts
var hash28 = (bytes) => createHash33('sha256').update(bytes).digest('hex');
var same35 = (a, b) => canonicalEqual({ value: a }, { value: b });
function require40(value, message) {
  if (!value) throw Error(`Azure network opaque checkout retirement: ${message}`);
}
function object25(value) {
  require40(value && typeof value === 'object' && !Array.isArray(value), 'record required');
  return value;
}
async function readAzureTerraformNetworkFrozenCheckouts(request, store, context, inventory, mainMarkerSha256, signal) {
  const active = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const step = async (action) => {
    active.throwIfAborted();
    const aborted = Promise.withResolvers(),
      onAbort = () => aborted.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), aborted.promise]);
      active.throwIfAborted();
      return result;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  active.throwIfAborted();
  const root = store.directory;
  const declarations = inventory.directories.filter((directory) => directory.path === '');
  require40(declarations.length === 1, 'exact frozen root directory required');
  const rootIdentity = declarations[0]?.identity;
  const checkRoot = async () => {
    active.throwIfAborted();
    const stat = await lstat29(root);
    require40(
      store.directory === root &&
        stat.isDirectory() &&
        !stat.isSymbolicLink() &&
        stat.uid === process.getuid?.() &&
        (stat.mode & 63) === 0 &&
        `${stat.dev}:${stat.ino}:${stat.birthtimeMs}` === rootIdentity,
      'frozen checkout parent directory identity differs',
    );
    active.throwIfAborted();
  };
  await checkRoot();
  const binding = azureUpgradeBinding(request),
    owner = structuredClone(store.owner);
  require40(
    same35(owner, binding.owner) &&
      same35(inventory.owner, owner) &&
      inventory.originalPlanSha256 === request.planSha256 &&
      inventory.teardownPlanSha256 === context.destroyTeardown.planSha256 &&
      /^[a-f0-9]{64}$/.test(mainMarkerSha256),
    'frozen owner or source differs',
  );
  const rows = inventory.parentArtifactDecisions.filter((row) => row.schema === 'ce-bootstrap-checkout-v1');
  require40(new Set(rows.map((row) => row.path)).size === rows.length, 'duplicate checkout decision');
  require40(
    same35(
      inventory.files
        .filter((file) => /^bootstrap-checkout-/.test(file.path))
        .map((file) => file.path)
        .sort(),
      rows.map((row) => row.path).sort(),
    ),
    'partial or unclassified frozen checkout selection',
  );
  const selected = [];
  for (const row of rows.sort((a, b) => a.path.localeCompare(b.path))) {
    active.throwIfAborted();
    require40(
      row.action === 'preserve' && /^bootstrap-checkout-[a-f0-9-]{36}\.json$/.test(row.path),
      'checkout preserve decision required',
    );
    const declared = inventory.files.filter((file) => file.path === row.path);
    require40(
      declared.length === 1 &&
        same35(declared[0], {
          path: row.path,
          identity: row.identity,
          sha256: row.sha256,
          packetSha256: row.packetSha256,
        }),
      'checkout file declaration differs',
    );
    const path = join33(store.directory, row.path);
    const native = await readAzureTerraformParentPrivateFile(path, active);
    const value = object25(JSON.parse(native.bytes.toString()));
    require40(
      native.identity === row.identity &&
        hash28(native.bytes) === row.sha256 &&
        canonicalSha256(value) === row.packetSha256 &&
        same35(value, await step(() => store.read(row.path))),
      'checkout native identity or raw/logical bytes differ',
    );
    const after = await readAzureTerraformParentPrivateFile(path, active);
    require40(
      after.identity === native.identity && after.bytes.equals(native.bytes),
      'checkout changed across logical read',
    );
    await checkRoot();
    require40(
      same35(
        Object.keys(value).sort(),
        ['binding', 'checkout', 'contractFingerprint', 'node', 'owner', 'schemaVersion', 'siteUid', 'tokenName'].sort(),
      ),
      'checkout fields differ',
    );
    const checkout = object25(value.checkout);
    require40(
      same35(Object.keys(checkout).sort(), ['schemaVersion', 'reference', 'root', 'digest', 'expiresAt', 'uid'].sort()),
      'opaque binding fields differ',
    );
    const tokens = context.destroyTeardown.retirement.flatMap((site) =>
      site.tokens
        .filter((token) => token.name === value.tokenName)
        .map((token) => ({ ...token, siteName: site.siteName })),
    );
    require40(tokens.length === 1, 'exact issued token required');
    const token = tokens[0];
    require40(
      token &&
        value.schemaVersion === 1 &&
        same35(value.owner, owner) &&
        same35(value.binding, binding) &&
        value.siteUid === context.site.siteUid &&
        value.contractFingerprint === context.destroyTeardown.drain.siteContractFingerprint &&
        value.node === token.node &&
        row.path === `bootstrap-checkout-${String(checkout.reference).split('/').at(-1)}.json` &&
        checkout.schemaVersion === 1 &&
        checkout.uid === (process.getuid?.() ?? null) &&
        typeof checkout.reference === 'string' &&
        /^f5xc-ce:\/\/[a-zA-Z0-9._-]{1,128}\/[a-zA-Z0-9._-]{1,128}$/.test(checkout.reference) &&
        typeof checkout.root === 'string' &&
        isAbsolute4(checkout.root) &&
        resolve3(checkout.root) === checkout.root &&
        typeof checkout.digest === 'string' &&
        /^[a-f0-9]{64}$/.test(checkout.digest) &&
        typeof checkout.expiresAt === 'string' &&
        Number.isFinite(Date.parse(checkout.expiresAt)) &&
        row.semanticProvenanceSha256 === canonicalSha256({ value, token }),
      'checkout owner/site/node/token join differs',
    );
    const issued = inventory.parentArtifactDecisions.filter(
      (item) =>
        item.path === `${token.name}.json` && item.schema === 'ce-bootstrap-token-v1' && item.action === 'delete',
    );
    require40(
      issued.length === 1 && issued[0]?.payloadSha256ByField?.jwt === checkout.digest,
      'frozen upstream token digest differs',
    );
    const evidenceSha256 = canonicalSha256({
      schemaVersion: 1,
      scope: 'azure-network-opaque-checkout-retirement',
      owner,
      originalPlanSha256: request.planSha256,
      teardownPlanSha256: context.destroyTeardown.planSha256,
      frozenInventorySha256: canonicalSha256(inventory),
      mainMarkerSha256,
      checkoutDecision: row,
      checkout,
    });
    selected.push({
      path: row.path,
      binding: structuredClone(checkout),
      evidenceSha256,
    });
  }
  require40(
    new Set(selected.map((row) => row.binding.reference)).size === selected.length,
    'duplicate opaque reference',
  );
  active.throwIfAborted();
  await checkRoot();
  return selected;
}
async function retireAzureTerraformNetworkOpaqueCheckouts(
  request,
  store,
  context,
  absence,
  runtime,
  contract,
  api,
  signal,
) {
  const active = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const { directory: root, read, verify, write } = store;
  const sealSha256 = canonicalSha256({
    request,
    owner: store.owner,
    terminal: context.terminalCleanup,
    teardown: context.destroyTeardown,
    site: context.site,
  });
  const guard = () => {
    active.throwIfAborted();
    require40(
      store.directory === root &&
        store.read === read &&
        store.verify === verify &&
        store.write === write &&
        canonicalSha256({
          request,
          owner: store.owner,
          terminal: context.terminalCleanup,
          teardown: context.destroyTeardown,
          site: context.site,
        }) === sealSha256,
      'owning context changed',
    );
  };
  guard();
  const custody = await qualifyAzureTerraformNetworkRetiredBootstrapPackets(
    request,
    store,
    context,
    absence,
    runtime,
    contract,
    api,
    active,
  );
  guard();
  const inventory = structuredClone(object25(context.terminalCleanup).retainedNetworkParentInventory);
  require40(canonicalSha256(inventory) === custody.inventorySha256, 'completed native inventory differs');
  const marker = object25(await store.read('azure-terraform-network-bootstrap-packet-retirement.json'));
  require40(
    marker.status === 'packets-retired' &&
      marker.pending === null &&
      marker.frozenInventorySha256 === custody.inventorySha256 &&
      canonicalSha256(marker) === custody.checkpointSha256 &&
      typeof marker.mainMarkerSha256 === 'string',
    'completed native bootstrap packet marker required',
  );
  const selected = await readAzureTerraformNetworkFrozenCheckouts(
    request,
    store,
    context,
    inventory,
    marker.mainMarkerSha256,
    active,
  );
  const receipts = [];
  for (const row of selected) {
    guard();
    await recheckAzureTerraformNetworkFreshParentAbsence(
      absence,
      request,
      store,
      context,
      runtime,
      contract,
      api,
      active,
    );
    require40(
      same35(
        await readAzureTerraformNetworkFrozenCheckouts(
          request,
          store,
          context,
          inventory,
          marker.mainMarkerSha256,
          active,
        ),
        selected,
      ),
      'checkout selection changed',
    );
    guard();
    receipts.push(await retireBootstrapToken(row.binding, row.evidenceSha256, active));
    guard();
    const parts = row.binding.reference.slice('f5xc-ce://'.length).split('/');
    const directory = join33(row.binding.root, ...parts);
    const metadata = object25(
      JSON.parse(
        (await readAzureTerraformParentPrivateFile(join33(directory, 'metadata.json'), active)).bytes.toString(),
      ),
    );
    const expectedReceipt = {
      schemaVersion: 1,
      status: 'bootstrap-secret-retired',
      reference: row.binding.reference,
      digest: row.binding.digest,
      evidenceSha256: row.evidenceSha256,
    };
    require40(
      metadata.version === 1 &&
        metadata.session === parts[0] &&
        metadata.id === parts[1] &&
        metadata.uid === row.binding.uid &&
        metadata.digest === row.binding.digest &&
        metadata.expiresAt === row.binding.expiresAt &&
        metadata.checkoutReady === true &&
        metadata.consumed === true &&
        same35(metadata.retirementPending, expectedReceipt) &&
        same35(metadata.retirement, expectedReceipt),
      'independent completed token metadata differs',
    );
    try {
      await lstat29(join33(directory, 'token'));
      throw Error('Opaque bootstrap secret remains after retirement');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    guard();
  }
  const after = await recheckAzureTerraformNetworkRetiredBootstrapPackets(
    custody,
    request,
    store,
    context,
    absence,
    runtime,
    contract,
    api,
    active,
  );
  guard();
  require40(
    same35(custody, after) &&
      same35(
        await readAzureTerraformNetworkFrozenCheckouts(
          request,
          store,
          context,
          inventory,
          marker.mainMarkerSha256,
          active,
        ),
        selected,
      ),
    'post-retirement custody differs',
  );
  return {
    status: 'network-opaque-checkouts-retired',
    sourcePlanSha256: request.planSha256,
    teardownPlanSha256: context.destroyTeardown.planSha256,
    inventorySha256: custody.inventorySha256,
    parent: after,
    receipts,
    opaqueCheckoutRetirementQualified: true,
    completeCleanup: false,
    parentRetirementQualified: false,
    interfaceAbsenceQualified: false,
    fullExternalCleanupQualified: false,
    liveQualified: false,
  };
}

// plugins/azure/src/ce/terraform-network-terminal-main-retirement.ts
import { createHash as createHash34 } from 'node:crypto';

var name = 'azure-terraform-terminal-cleanup.json';
var same36 = (a, b) => canonicalEqual({ value: a }, { value: b });
var hash29 = (s) => createHash34('sha256').update(s).digest('hex');
var sha23 = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require41(v, message) {
  if (!v) throw Error(`Azure network terminal main retirement: ${message}`);
}
function object26(v) {
  require41(v && typeof v === 'object' && !Array.isArray(v), 'complete record required');
  return v;
}
async function retireAzureTerraformNetworkTerminalMain(request, store, context, beforeRetirement, env, signal) {
  const original = structuredClone(request),
    originalContext = structuredClone(context.terminalCleanup),
    owner = structuredClone(store.owner),
    directory = store.directory,
    teardown = structuredClone(context.destroyTeardown),
    environment = { ...env },
    terraform = context.terraform,
    site = structuredClone(context.site),
    { publicSession, loaders, verifier, replacementVerifier } = context;
  const dependencies = [
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'write', value: store.write },
    { target: store, key: 'verify', value: store.verify },
    { target: terraform, key: 'open', value: terraform.open },
    { target: loaders, key: 'loadSource', value: loaders.loadSource },
    { target: loaders, key: 'loadOutcome', value: loaders.loadOutcome },
    ...['getSessionId', 'getArtifactsDir', 'getArtifactPath', 'saveArtifact'].map((key) => ({
      target: publicSession,
      key,
      value: Reflect.get(publicSession, key),
    })),
  ];
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const originalSha256 = canonicalSha256({ value: original }),
    originalContextSha256 = canonicalSha256({ value: originalContext }),
    teardownSha256 = canonicalSha256({ value: teardown }),
    ownerSha256 = canonicalSha256({ value: owner }),
    siteSha256 = canonicalSha256({ value: site });
  const seal = () => {
    deadline.throwIfAborted();
    require41(
      canonicalSha256({ value: request }) === originalSha256 &&
        matchesAzureTerraformTerminalSnapshot(context.terminalCleanup, originalContextSha256) &&
        canonicalSha256({ value: context.destroyTeardown }) === teardownSha256 &&
        canonicalSha256({ value: store.owner }) === ownerSha256 &&
        store.directory === directory &&
        context.terraform === terraform &&
        canonicalSha256({ value: context.site }) === siteSha256 &&
        context.publicSession === publicSession &&
        context.loaders === loaders &&
        context.verifier === verifier &&
        context.replacementVerifier === replacementVerifier &&
        dependencies.every(({ target, key, value }) => Reflect.get(target, key) === value),
      'owning request or dependency changed',
    );
  };
  const step = async (action) => {
    seal();
    const aborted = Promise.withResolvers(),
      onAbort = () => aborted.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([action(), aborted.promise]);
      seal();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  seal();
  await step(() => store.verify());
  require41(
    same36(azureUpgradeBinding(original).owner, owner) &&
      same36(
        compileAzureTerraformTeardown(
          original,
          teardown.drain,
          teardown.retirement,
          teardown.pendingAdmissionJournalSha256,
        ),
        teardown,
      ),
    'compiled teardown differs',
  );
  require41(
    same36(await step(() => store.read(`${teardown.planId}.json`)), teardown) &&
      same36(await step(() => store.read(`${teardown.planId}-authorization.json`)), {
        schemaVersion: 1,
        engine: 'terraform',
        sourcePlanSha256: original.planSha256,
        teardownPlanSha256: teardown.planSha256,
        mutations: true,
      }),
    'saved authorization differs',
  );
  let checkpoint = object26(await step(() => store.read(name)));
  require41(
    same36(checkpoint, originalContext) && ['retiring', 'retired'].includes(String(checkpoint.phase)),
    'owning final checkpoint required',
  );
  const final = object26(checkpoint.final);
  const deployment = await step(() => azureTerraformCurrentDeployment(original));
  require41(
    final.schemaVersion === 1 &&
      final.engine === 'terraform' &&
      final.deploymentId === deployment.deploymentId &&
      final.backendIdentity === deployment.backendIdentity &&
      final.configurationSha256 === hash29(deployment.configuration) &&
      final.providerLockSha256 === hash29(deployment.providerLock) &&
      final.noChanges &&
      sha23(final.planSha256) &&
      Array.isArray(final.changes) &&
      final.changes.length === 0 &&
      !final.operation &&
      !final.actionInvocations &&
      !final.imports &&
      !final.relinquishments,
    'ordinary empty final receipt differs',
  );
  if (checkpoint.phase === 'retired') {
    const frozen = object26(checkpoint.retainedNetworkParentInventory),
      nativeEvidence = object26(checkpoint.retirementEvidence);
    require41(
      same36(nativeEvidence.networkParentInventory, frozen) &&
        frozen.schemaVersion === 1 &&
        frozen.scope === 'native-bound-network-parent-inventory' &&
        same36(frozen.owner, owner) &&
        frozen.originalPlanSha256 === original.planSha256 &&
        frozen.teardownPlanSha256 === teardown.planSha256 &&
        frozen.parentRetirementQualified === false,
      'retired parent inventory binding differs',
    );
    const custody = await step(() => qualifyAzureTerraformNetworkRetiredMainCustody(request, store, context, deadline));
    return {
      checkpoint: structuredClone(checkpoint),
      custody,
      resumed: true,
      parentRetirementQualified: false,
    };
  }
  let sameCallParentInventory;
  if (!checkpoint.retainedTerminalNetworkCustody) {
    const terminal = await step(() =>
      qualifyAzureTerraformNetworkTerminalJournalCustody(request, store, context, deadline),
    );
    require41(terminal.mainRunnerRetirementQualified === false, 'pre-retirement terminal custody required');
    await step(() => beforeRetirement(deadline));
    const parentInventory = await step(() =>
      readAzureTerraformNetworkParentInventory(request, store, context, terminal, deadline),
    );
    const evidence = {
      ...object26(checkpoint.retirementEvidence),
      terminalNetwork: structuredClone(terminal),
      networkParentInventory: structuredClone(parentInventory),
    };
    checkpoint = {
      ...checkpoint,
      retainedTerminalNetworkCustody: structuredClone(terminal),
      retainedNetworkParentInventory: structuredClone(parentInventory),
      retirementEvidence: evidence,
      retirementEvidenceSha256: canonicalSha256(evidence),
    };
    await step(() => store.write(name, checkpoint));
    sameCallParentInventory = parentInventory;
  }
  const evidence = object26(checkpoint.retirementEvidence),
    retained = object26(checkpoint.retainedTerminalNetworkCustody),
    frozenInventory = object26(checkpoint.retainedNetworkParentInventory);
  require41(
    same36(evidence.networkParentInventory, frozenInventory) &&
      frozenInventory.schemaVersion === 1 &&
      frozenInventory.scope === 'native-bound-network-parent-inventory' &&
      same36(frozenInventory.owner, owner) &&
      frozenInventory.originalPlanSha256 === original.planSha256 &&
      frozenInventory.teardownPlanSha256 === teardown.planSha256 &&
      frozenInventory.parentRetirementQualified === false,
    'frozen parent inventory differs',
  );
  require41(
    sha23(checkpoint.retirementEvidenceSha256) &&
      checkpoint.retirementEvidenceSha256 === canonicalSha256(evidence) &&
      same36(evidence.terminalNetwork, retained) &&
      retained.currentEmptyMainJournalCustodyQualified === true &&
      retained.mainRunnerRetirementQualified === false &&
      retained.originalPlanSha256 === original.planSha256 &&
      retained.teardownPlanSha256 === teardown.planSha256 &&
      same36(retained.owner, owner),
    'frozen terminal custody differs',
  );
  const session = await step(() => terraform.open(owner, deployment, 'current'));
  const { readArtifactRetirement: readRetirement, retireArtifacts: retire } = session;
  require41(readRetirement && retire, 'native retirement and permanent barrier interfaces required');
  dependencies.push(
    { target: session, key: 'readArtifactRetirement', value: readRetirement },
    { target: session, key: 'retireArtifacts', value: retire },
  );
  const evidenceSha256 = checkpoint.retirementEvidenceSha256;
  let observed = await step(() => readRetirement.call(session, final, evidenceSha256, deadline));
  const resumedFromBarrier = observed.status === 'runner-artifacts-retired';
  if (observed.status !== 'runner-artifacts-retired') {
    if (observed.status === 'absent') {
      const frozenContext = { ...context, terminalCleanup: checkpoint };
      if (sameCallParentInventory) {
        await step(() => beforeRetirement(deadline));
        await step(() =>
          qualifyAzureTerraformNetworkParentPublishedEnvelope(
            sameCallParentInventory,
            request,
            store,
            context,
            frozenContext,
            deadline,
          ),
        );
      } else {
        const terminal = await step(() =>
          qualifyAzureTerraformNetworkTerminalJournalCustody(request, store, frozenContext, deadline),
        );
        const { recordSha256: currentRecordSha256, ...currentProof } = object26(terminal);
        const { recordSha256: frozenRecordSha256, ...frozenProof } = retained;
        require41(
          sha23(currentRecordSha256) && sha23(frozenRecordSha256) && same36(currentProof, frozenProof),
          'frozen terminal custody changed before retirement',
        );
        const currentInventory = await step(() =>
          readAzureTerraformNetworkParentInventory(request, store, frozenContext, terminal, deadline),
        );
        const { terminalFile: currentTerminalFile, ...currentParentInventory } = currentInventory;
        const { terminalFile: frozenTerminalFile, ...retainedParentInventory } = frozenInventory;
        require41(
          sha23(object26(currentTerminalFile).sha256) &&
            sha23(object26(frozenTerminalFile).sha256) &&
            same36(currentParentInventory, retainedParentInventory),
          'frozen parent inventory changed before retirement',
        );
        await step(() => beforeRetirement(deadline));
        await step(() =>
          recheckAzureTerraformNetworkParentInventory(currentInventory, request, store, frozenContext, deadline),
        );
      }
    } else {
      require41(
        observed.status === 'retiring' && sha23(observed.independentCleanupSha256),
        'native partial barrier differs',
      );
      await step(() => beforeRetirement(deadline));
    }
    require41(same36(await step(() => store.read(name)), checkpoint), 'saved frozen checkpoint changed');
    const receipt = await step(() => retire.call(session, final, evidenceSha256, environment, deadline));
    observed = await step(() => readRetirement.call(session, final, evidenceSha256, deadline));
    require41(
      observed.status === 'runner-artifacts-retired' && same36(observed.receipt, receipt),
      'native retirement acknowledgement lacks permanent proof',
    );
  }
  require41(observed.status === 'runner-artifacts-retired', 'native permanent main barrier required');
  checkpoint = { ...checkpoint, phase: 'retired', artifacts: structuredClone(observed.receipt) };
  await step(() => store.write(name, checkpoint));
  const retiredContext = { ...context, terminalCleanup: checkpoint };
  const custody = await step(() =>
    qualifyAzureTerraformNetworkRetiredMainCustody(request, store, retiredContext, deadline),
  );
  return {
    checkpoint: structuredClone(checkpoint),
    custody,
    resumed: resumedFromBarrier,
    parentRetirementQualified: false,
  };
}

// plugins/azure/src/ce/terraform-network-terminal-plaintext-retirement.ts
import { createHash as createHash35 } from 'node:crypto';
import { join as join34 } from 'node:path';

var name2 = 'azure-terraform-terminal-cleanup.json';
var hash30 = (bytes) => createHash35('sha256').update(bytes).digest('hex');
var same37 = (left, right) => canonicalEqual({ value: left }, { value: right });
function require42(value, message) {
  if (!value) throw Error(`Azure terminal plaintext retirement: ${message}`);
}
function object27(value) {
  require42(value && typeof value === 'object' && !Array.isArray(value), 'complete record required');
  return value;
}
async function retireAzureTerraformNetworkTerminalPlaintext(request, store, context, beforeTransformation, signal) {
  const original = structuredClone(request),
    owner = structuredClone(store.owner),
    root = store.directory,
    checkpoint = structuredClone(context.terminalCleanup),
    checkpointSha256 = canonicalSha256(checkpoint),
    site = structuredClone(context.site),
    teardown = structuredClone(context.destroyTeardown),
    { loaders, terraform, publicSession, verifier, replacementVerifier } = context;
  const methods = [
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'write', value: store.write },
    { target: store, key: 'verify', value: store.verify },
    { target: loaders, key: 'loadSource', value: loaders.loadSource },
    { target: loaders, key: 'loadOutcome', value: loaders.loadOutcome },
    { target: terraform, key: 'open', value: terraform.open },
    ...['getSessionId', 'getArtifactsDir', 'getArtifactPath', 'saveArtifact'].map((key) => ({
      target: publicSession,
      key,
      value: Reflect.get(publicSession, key),
    })),
  ];
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require42(
      same37(request, original) &&
        same37(store.owner, owner) &&
        store.directory === root &&
        matchesAzureTerraformTerminalSnapshot(context.terminalCleanup, checkpointSha256, 'raw') &&
        same37(context.site, site) &&
        same37(context.destroyTeardown, teardown) &&
        context.loaders === loaders &&
        context.terraform === terraform &&
        context.publicSession === publicSession &&
        context.verifier === verifier &&
        context.replacementVerifier === replacementVerifier &&
        methods.every(({ target, key, value }) => Reflect.get(target, key) === value),
      'owning inputs or methods changed',
    );
  };
  const step = async (action) => {
    seal();
    const canceled = Promise.withResolvers(),
      onAbort = () => canceled.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), canceled.promise]);
      seal();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  seal();
  const nativeWitness = await step(() =>
    qualifyAzureTerraformNetworkRetiredMainCustody(request, store, context, deadline),
  );
  const native = structuredClone(nativeWitness);
  const terminal = object27(checkpoint);
  require42(
    native.mainRunnerRetirementQualified === true &&
      native.parentRetirementQualified === false &&
      native.mainRetirementReceiptSha256 === canonicalSha256(terminal.artifacts),
    'native retirement receipt differs',
  );
  const projection = prepareAzureTerraformNetworkTerminalStagingProjection(checkpoint, {
    status: 'runner-artifacts-retired',
    markerSha256: native.mainMarkerSha256,
    receipt: terminal.artifacts,
  });
  require42(projection.transformationRequired, 'terminal plaintext already transformed; use post-parent reader');
  const path = join34(root, name2),
    markerPath = join34(
      root,
      String(object27(terminal.retainedNetworkParentInventory).mainDirectory),
      'artifact-retirement.json',
    );
  const before = await step(() => readAzureTerraformParentPrivateFile(path, deadline));
  require42(same37(JSON.parse(before.bytes.toString()), checkpoint), 'saved terminal checkpoint differs');
  const marker = await step(() => readAzureTerraformParentPrivateFile(markerPath, deadline));
  require42(hash30(marker.bytes) === native.mainMarkerSha256, 'permanent main marker differs');
  const custody = async () => {
    await step(() => store.verify());
    const current = await step(() => readAzureTerraformParentPrivateFile(path, deadline));
    const nativeMarker = await step(() => readAzureTerraformParentPrivateFile(markerPath, deadline));
    require42(
      current.identity === before.identity &&
        hash30(current.bytes) === hash30(before.bytes) &&
        nativeMarker.identity === marker.identity &&
        hash30(nativeMarker.bytes) === hash30(marker.bytes),
      'terminal bytes, inode or permanent marker changed',
    );
  };
  await step(() => beforeTransformation(deadline));
  await step(() => recheckAzureTerraformNetworkRetiredMainCustody(nativeWitness, request, store, context, deadline));
  await custody();
  await step(() =>
    recheckAzureTerraformNetworkRetiredMainNativeCustody(nativeWitness, request, store, context, false, deadline),
  );
  await step(() => store.write(name2, projection.checkpoint, deadline));
  await step(() =>
    recheckAzureTerraformNetworkRetiredMainNativeCustody(nativeWitness, request, store, context, true, deadline),
  );
  const transformed = await step(() => readAzureTerraformParentPrivateFile(path, deadline));
  require42(
    same37(JSON.parse(transformed.bytes.toString()), projection.checkpoint),
    'owning terminal transformation differs',
  );
  const afterMarker = await step(() => readAzureTerraformParentPrivateFile(markerPath, deadline));
  require42(
    afterMarker.identity === marker.identity && hash30(afterMarker.bytes) === hash30(marker.bytes),
    'permanent main marker changed during transformation',
  );
  return {
    schemaVersion: 1,
    scope: 'native-authenticated-terminal-plaintext-transformation-only',
    checkpoint: projection.checkpoint,
    checkpointSha256: projection.checkpointSha256,
    terminalFile: { path: name2, identity: transformed.identity, sha256: hash30(transformed.bytes) },
    mainMarkerSha256: native.mainMarkerSha256,
    retainedDestroyConfigurationSha256: projection.retainedDestroyConfigurationSha256,
    parentRetirementQualified: false,
    currentOperationalAcceptanceQualified: false,
  };
}

// plugins/azure/src/ce/terraform-network-terminal-planning.ts
import { createHash as createHash36 } from 'node:crypto';

var name3 = 'azure-terraform-terminal-cleanup.json';
var same38 = (a, b) => canonicalEqual({ value: a }, { value: b });
var hash31 = (s) => createHash36('sha256').update(s).digest('hex');
function require43(v, message) {
  if (!v) throw Error(`Azure network terminal planning: ${message}`);
}
function object28(v) {
  require43(v && typeof v === 'object' && !Array.isArray(v), 'complete record required');
  return v;
}
async function prepareAzureTerraformNetworkTerminalPlanning(request, store, context, freshAbsence, env, signal) {
  const original = structuredClone(request),
    owner = structuredClone(store.owner),
    directory = store.directory,
    teardown = structuredClone(context.destroyTeardown),
    site = structuredClone(context.site),
    environment = { ...env },
    { terraform, publicSession, loaders, verifier, replacementVerifier } = context;
  const dependencies = [
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'write', value: store.write },
    { target: store, key: 'verify', value: store.verify },
    { target: terraform, key: 'open', value: terraform.open },
    { target: loaders, key: 'loadSource', value: loaders.loadSource },
    { target: loaders, key: 'loadOutcome', value: loaders.loadOutcome },
    ...['getSessionId', 'getArtifactsDir', 'getArtifactPath', 'saveArtifact'].map((key) => ({
      target: publicSession,
      key,
      value: Reflect.get(publicSession, key),
    })),
  ];
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require43(
      same38(request, original) &&
        same38(store.owner, owner) &&
        store.directory === directory &&
        same38(context.destroyTeardown, teardown) &&
        same38(context.site, site) &&
        context.terraform === terraform &&
        context.publicSession === publicSession &&
        context.loaders === loaders &&
        context.verifier === verifier &&
        context.replacementVerifier === replacementVerifier &&
        same38(env, environment) &&
        dependencies.every(({ target, key, value }) => Reflect.get(target, key) === value),
      'owning context changed',
    );
  };
  const step = async (action) => {
    seal();
    const aborted = Promise.withResolvers(),
      onAbort = () => aborted.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([action(), aborted.promise]);
      seal();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  seal();
  await step(() => store.verify());
  require43(
    same38(azureUpgradeBinding(original).owner, owner) &&
      same38(
        compileAzureTerraformTeardown(
          original,
          teardown.drain,
          teardown.retirement,
          teardown.pendingAdmissionJournalSha256,
        ),
        teardown,
      ),
    'compiled teardown differs',
  );
  const deployment = await step(() => azureTerraformCurrentDeployment(original));
  const session = await step(() => terraform.open(owner, deployment, 'current'));
  const {
    readConfiguration,
    readConfigurationSha256: readDigest,
    cancelUnsubmittedPlan: cancel,
    plan,
    readUnsubmittedPlanCancellation: readCancellation,
  } = session;
  require43(
    typeof readConfiguration === 'function' &&
      typeof readDigest === 'function' &&
      typeof cancel === 'function' &&
      typeof plan === 'function' &&
      typeof readCancellation === 'function',
    'native current, cancellation and planning interfaces required',
  );
  for (const key of [
    'readConfiguration',
    'readConfigurationSha256',
    'cancelUnsubmittedPlan',
    'plan',
    'readUnsubmittedPlanCancellation',
  ])
    dependencies.push({ target: session, key, value: Reflect.get(session, key) });
  let checkpoint;
  try {
    checkpoint = object28(await step(() => store.read(name3)));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!checkpoint) {
    const custody = await step(() =>
      qualifyAzureTerraformNetworkDestroyJournalCustody(request, store, context, deadline),
    );
    const destroy = object28(await step(() => store.read('azure-terraform-cloud-destroy-final.json')));
    const currentDigest = await step(() => readDigest.call(session));
    require43(currentDigest === destroy.configurationSha256, 'current destroy configuration differs');
    const retainedDestroyConfiguration = await step(() => readConfiguration.call(session, destroy.configurationSha256));
    require43(hash31(retainedDestroyConfiguration) === destroy.configurationSha256, 'retained destroy bytes differ');
    const retained = object28(JSON.parse(retainedDestroyConfiguration));
    require43(
      same38({ terraform: retained.terraform, provider: retained.provider }, JSON.parse(deployment.configuration)),
      'retained provider identity differs',
    );
    const evidence = { ...object28(await step(() => freshAbsence(deadline))), network: structuredClone(custody) };
    await step(() => store.verify());
    checkpoint = {
      schemaVersion: 1,
      sourcePlanSha256: original.planSha256,
      teardownPlanSha256: teardown.planSha256,
      configurationSha256: destroy.configurationSha256,
      emptyConfiguration: deployment.configuration,
      emptyConfigurationSha256: hash31(deployment.configuration),
      destroy,
      evidence,
      evidenceSha256: canonicalSha256(evidence),
      checkpointSha256: canonicalSha256({
        configurationSha256: destroy.configurationSha256,
        emptyConfiguration: deployment.configuration,
        destroy,
        evidence,
      }),
      retainedDestroyConfiguration,
      retainedNetworkCustody: structuredClone(custody),
      phase: 'cancelling',
    };
    await step(() => store.write(name3, checkpoint, deadline));
  }
  require43(['cancelling', 'planning'].includes(String(checkpoint.phase)), 'cancellation/planning phase required');
  const qualify = (current) => {
    const boundContext = { ...context, terminalCleanup: current };
    return {
      boundContext,
      read: () => step(() => qualifyAzureTerraformNetworkCancelledMainBinding(request, store, boundContext, deadline)),
    };
  };
  const assertSaved = (current) =>
    step(async () => {
      require43(same38(await store.read(name3), current), 'saved checkpoint changed');
    });
  if (checkpoint.phase === 'cancelling') {
    const { boundContext, read } = qualify(checkpoint),
      observed = await read();
    if (!observed.cancellationQualified) {
      await step(() => freshAbsence(deadline));
      await step(() =>
        recheckAzureTerraformNetworkCancelledMainBinding(observed, request, store, boundContext, deadline),
      );
      await assertSaved(checkpoint);
      const cancelling = checkpoint;
      const actual = await step(() =>
        cancel.call(
          session,
          cancelling.destroy,
          cancelling.configurationSha256,
          cancelling.emptyConfiguration,
          cancelling.evidenceSha256,
        ),
      );
      require43(actual === hash31(deployment.configuration), 'native cancelled configuration differs');
      const cancellation = await step(() =>
        readCancellation.call(
          session,
          cancelling.destroy,
          cancelling.configurationSha256,
          hash31(deployment.configuration),
          cancelling.evidenceSha256,
          deadline,
        ),
      );
      require43(
        cancellation.cancellationQualified &&
          cancellation.status === 'cancelled' &&
          cancellation.currentConfigurationSha256 === hash31(deployment.configuration),
        'native cancellation is incomplete',
      );
    }
    await assertSaved(checkpoint);
    checkpoint = { ...checkpoint, phase: 'planning' };
    await step(() => store.write(name3, checkpoint, deadline));
  }
  const { boundContext, read } = qualify(checkpoint),
    observed = await read();
  require43(observed.cancellationQualified, 'ordinary planning requires completed native cancellation');
  let final = observed.currentPlanReceipt;
  let current = observed;
  const recoveredExistingPlan = final !== null;
  let retirementEvidence;
  if (!final) {
    require43(observed.ordinaryPlanReady, 'exact absent current slot required');
    await step(() => freshAbsence(deadline));
    await step(() =>
      recheckAzureTerraformNetworkCancelledMainBinding(observed, request, store, boundContext, deadline),
    );
    await assertSaved(checkpoint);
    final = await step(() => plan.call(session, environment, deadline));
    retirementEvidence = object28(await step(() => freshAbsence(deadline)));
    const after = await step(() =>
      refreshAzureTerraformNetworkCancelledMainBinding(observed, request, store, boundContext, deadline),
    );
    current = after;
    require43(
      after.ordinaryCurrentJournalQualified && same38(after.currentPlanReceipt, final),
      'ordinary native plan lacks exact continuation proof',
    );
  }
  require43(
    current.ordinaryCurrentJournalQualified && same38(current.currentPlanReceipt, final),
    'native ordinary continuation changed',
  );
  if (recoveredExistingPlan) {
    retirementEvidence = object28(await step(() => freshAbsence(deadline)));
    await step(() => recheckAzureTerraformNetworkCancelledMainBinding(current, request, store, boundContext, deadline));
  }
  require43(retirementEvidence, 'fresh retirement evidence required');
  await assertSaved(checkpoint);
  checkpoint = {
    ...checkpoint,
    phase: 'retiring',
    final: structuredClone(final),
    retirementEvidence,
    retirementEvidenceSha256: canonicalSha256(retirementEvidence),
  };
  await step(() => store.write(name3, checkpoint, deadline));
  return {
    checkpoint: structuredClone(checkpoint),
    recoveredExistingPlan,
    mainRunnerRetirementQualified: false,
    parentRetirementQualified: false,
    independentCloudCleanupQualified: false,
  };
}

// plugins/azure/src/ce/terraform-parent-retirement.ts
import { createHash as createHash37 } from 'node:crypto';
import { lstat as lstat30, readdir as readdir30, realpath as realpath28, unlink as unlink6 } from 'node:fs/promises';
import { join as join35 } from 'node:path';

var markerName3 = 'azure-terraform-parent-artifact-retirement.json';
var hash32 = (value) => createHash37('sha256').update(value).digest('hex');
var sha24 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
var object29 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed Azure parent retirement');
  return value;
};
var parseArtifact = (bytes) => {
  try {
    return JSON.parse(Buffer.from(bytes).toString());
  } catch {
    throw Error('Malformed Azure parent artifact');
  }
};
async function retireAzureTerraformParentArtifacts(base, teardown, evidenceSha256, store, signal, ingressContract) {
  const binding = azureUpgradeBinding(base);
  if (
    base.engine !== 'terraform' ||
    canonicalSha256(store.owner) !== canonicalSha256(binding.owner) ||
    teardown.sourcePlanSha256 !== base.planSha256 ||
    !sha24(teardown.planSha256) ||
    !sha24(evidenceSha256) ||
    !/^azure-ce-teardown-[a-z0-9-]+$/.test(teardown.planId)
  )
    throw Error('Azure parent retirement owner or source differs');
  signal?.throwIfAborted();
  await store.verify();
  const lifecycle = object29(await store.read('azure-terraform-lifecycle-retirement.json')),
    authorization = object29(await store.read(`${teardown.planId}-authorization.json`)),
    terminal = object29(await store.read('azure-terraform-terminal-cleanup.json'));
  if (
    lifecycle.sourcePlanSha256 !== base.planSha256 ||
    lifecycle.teardownPlanSha256 !== teardown.planSha256 ||
    lifecycle.kind !== teardown.kind ||
    canonicalSha256(lifecycle.owner) !== canonicalSha256(binding.owner) ||
    authorization.schemaVersion !== 1 ||
    authorization.engine !== 'terraform' ||
    authorization.sourcePlanSha256 !== base.planSha256 ||
    authorization.teardownPlanSha256 !== teardown.planSha256 ||
    authorization.mutations !== true ||
    canonicalSha256(await store.read(`${teardown.planId}.json`)) !== canonicalSha256(teardown) ||
    terminal.phase !== 'retired' ||
    terminal.sourcePlanSha256 !== base.planSha256 ||
    terminal.teardownPlanSha256 !== teardown.planSha256 ||
    terminal.retirementEvidenceSha256 !== evidenceSha256 ||
    !terminal.retirementEvidence ||
    typeof terminal.retirementEvidence !== 'object' ||
    Array.isArray(terminal.retirementEvidence) ||
    canonicalSha256(terminal.retirementEvidence) !== evidenceSha256
  )
    throw Error('Azure parent retirement authorization or terminal evidence differs');
  const terminalSha256 = canonicalSha256(terminal);
  const verifyTerminal = async () => {
    signal?.throwIfAborted();
    await store.verify();
    if (canonicalSha256(await store.read('azure-terraform-terminal-cleanup.json')) !== terminalSha256)
      throw Error('Azure parent terminal evidence changed');
    signal?.throwIfAborted();
  };
  await verifyTerminal();
  const directory = async (path) => {
    const stat = await lstat30(path);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.uid !== process.getuid?.() ||
      (await realpath28(path)) !== path
    )
      throw Error('Azure parent directory differs');
  };
  const fileIdentities = new Map();
  const file = async (path) => {
    const current = await readAzureTerraformParentPrivateFile(path, signal);
    if (fileIdentities.has(path) && fileIdentities.get(path) !== current.identity)
      throw Error('Azure parent file inode changed');
    fileIdentities.set(path, current.identity);
    return current.bytes;
  };
  const deployment = await azureTerraformCurrentDeployment(base),
    { configuration, providerLock, ...rest } = deployment;
  const expectedManifest = {
    ...rest,
    configurationSha256: hash32(configuration),
    providerLockSha256: hash32(providerLock),
  };
  const upgrades = new Map();
  const upgradeJournals = new Set();
  for (const name of (await readdir30(store.directory)).filter((name) =>
    /^azure-ce-upgrade-[a-f0-9]{24}\.json$/.test(name),
  )) {
    const source = object29(await store.read(name)),
      deployment = object29(source.deployment);
    const { planId, planSha256, ...draft } = source;
    if (
      source.schemaVersion !== 2 ||
      source.engine !== 'terraform' ||
      source.kind !== 'azure-ce-terraform-upgrade' ||
      source.sourcePlanSha256 !== base.planSha256 ||
      canonicalSha256(object29(source.expectation).binding) !== canonicalSha256(binding) ||
      !sha24(planSha256) ||
      canonicalSha256(draft) !== planSha256 ||
      planId !== `azure-ce-upgrade-${planSha256.slice(0, 24)}` ||
      name !== `${planId}.json` ||
      typeof deployment.stage !== 'string' ||
      !/^upgrade-(?:software|os)-[a-f0-9]{24}$/.test(deployment.stage) ||
      upgrades.has(deployment.stage)
    )
      throw Error('Azure upgrade source provenance differs');
    upgrades.set(deployment.stage, source);
    for (const suffix of ['', '-authorization', '-checkpoint', '-action-plan', '-receipt', '-stage-retirement'])
      upgradeJournals.add(`${planId}${suffix}.json`);
  }
  if (upgrades.size) {
    const serial = object29(await store.read('terraform-ce-upgrade-serial.json'));
    const last = [...upgrades.values()].find((row) => row.planId === serial.lastPlanId);
    if (
      serial.schemaVersion !== 2 ||
      serial.engine !== 'terraform' ||
      serial.status !== 'idle' ||
      serial.activePlanId !== undefined ||
      serial.activePlanSha256 !== undefined ||
      !last ||
      last.planSha256 !== serial.lastPlanSha256
    )
      throw Error('Azure serial upgrade provenance differs');
  }
  const failovers = new Map();
  const failoverJournals = (await readdir30(store.directory)).filter(isAzureFailoverHistoricalArtifact);
  for (const name of failoverJournals.filter((name) => /^azure-ce-failover-[a-f0-9]{24}\.json$/.test(name))) {
    const source = await store.read(name);
    verifyAzureCeFailoverPlan(base, source);
    if (name !== `${source.planId}.json`) throw Error('Failover source filename differs');
    const deployment = await azureTerraformFailoverDeployment(base, source, 'release');
    if (failovers.has(String(deployment.stage))) throw Error('Duplicate failover stage source');
    failovers.set(String(deployment.stage), { ...source, deployment });
  }
  const preserve = new Set([
    'owner.json',
    'azure-terraform-lifecycle-retirement.json',
    'azure-terraform-terminal-cleanup.json',
    'azure-terraform-teardown-receipt.json',
    `${teardown.planId}.json`,
    `${teardown.planId}-authorization.json`,
  ]);
  for (const name of [...upgradeJournals, ...failoverJournals]) preserve.add(name);
  if (failoverJournals.length) {
    preserve.add('platform-routing.json');
    for (const name of azureRelayHistoricalArtifacts) preserve.add(name);
  }
  if (upgrades.size) preserve.add('terraform-ce-upgrade-serial.json');
  const allowed = new Set([
    'terraform-workflow.json',
    'terraform-registration-configuration.json',
    'terraform-registration-observation.json',
    'terraform-foundation-plan.json',
    'terraform-site.json',
    'azure-terraform-cloud-destroy-plan.json',
    'azure-terraform-cloud-destroy-final.json',
    'azure-terraform-cloud-destroy-reconciliation.json',
    'azure-terraform-pending-vm-import.json',
    'platform-drain-source.json',
    'platform-drain-progress.json',
    'platform-drain-receipt.json',
    `site-binding-${base.siteName}.json`,
    `public-site-${base.siteName}.json`,
  ]);
  const tokens = new Map(
    teardown.retirement.flatMap((site) =>
      site.tokens.map((token) => [`${token.name}.json`, { ...token, siteName: site.siteName }]),
    ),
  );
  let saved;
  try {
    saved = object29(await store.read(markerName3));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const inventory = async (recorded) => {
    await verifyTerminal();
    await directory(store.directory);
    const items = [];
    const relayRecords = new Map();
    const replacementRecords = new Map();
    const ingressRecords = new Map();
    const failoverRecords = new Map();
    let runner = false;
    const add = async (path, keep) => {
      const bytes = await file(join35(store.directory, path));
      const identity = fileIdentities.get(join35(store.directory, path));
      if (!identity) throw Error('Azure parent file identity missing');
      items.push({ path, preserve: keep, sha256: hash32(bytes), identity });
      if (azureRelayHistoricalArtifacts.has(path)) relayRecords.set(path, parseArtifact(bytes));
      if (isAzureTerraformReplacementHistoricalArtifact(path) || tokens.has(path))
        replacementRecords.set(path, parseArtifact(bytes));
      if (isAzureIngressHistoricalArtifact(path)) ingressRecords.set(path, parseArtifact(bytes));
      if (
        isAzureFailoverHistoricalArtifact(path) ||
        azureRelayHistoricalArtifacts.has(path) ||
        path === 'platform-routing.json'
      )
        failoverRecords.set(path, parseArtifact(bytes));
    };
    for (const name of (await readdir30(store.directory)).sort()) {
      if (name === markerName3 || name === '.azure-terraform-lifecycle-lock') continue;
      if (
        name === 'terraform-original-deployment-receipts' ||
        name === 'terraform-original-deployment-publication-fragments'
      ) {
        const path = join35(store.directory, name);
        await directory(path);
        if (((await lstat30(path)).mode & 63) !== 0)
          throw Error('Azure original receipt metadata directory ownership differs');
        const names = (await readdir30(path)).sort();
        if (recorded) {
          const expectedNames = [...recorded.values()]
            .filter((item) => item.path.startsWith(`${name}/`) && item.preserve)
            .map((item) => item.path.slice(name.length + 1))
            .sort();
          if (canonicalSha256(names) !== canonicalSha256(expectedNames))
            throw Error('Azure original receipt metadata namespace changed');
        } else {
          const workflow = object29(await store.read('terraform-workflow.json'));
          if (
            workflow.schemaVersion !== 1 ||
            workflow.engine !== 'terraform' ||
            workflow.planSha256 !== base.planSha256
          )
            throw Error('Azure original receipt metadata workflow owner differs');
          const prefix = object29(workflow.bootstrapByNode);
          const original = await readAzureTerraformOriginalReceiptInventory(base, prefix, store, signal);
          if (
            original.status !== 'complete' ||
            original.records.length === 0 ||
            (name === 'terraform-original-deployment-receipts' &&
              canonicalSha256(original.records.map((row) => row.name).sort()) !== canonicalSha256(names)) ||
            (workflow.originalReceiptInventorySha256 !== undefined &&
              workflow.originalReceiptInventorySha256 !== canonicalSha256(original))
          )
            throw Error('Azure original receipt metadata inventory is incomplete or changed');
        }
        for (const entry of names) {
          if (name === 'terraform-original-deployment-receipts') {
            if (!/^[a-f0-9]{64}\.json$/.test(entry)) throw Error('Azure original receipt metadata entry differs');
          } else {
            const match = /^([a-f0-9]{64})-[a-f0-9-]{36}\.pending\.([a-f0-9]{64})\.fragment$/.exec(entry);
            if (!match) throw Error('Azure original receipt metadata fragment name differs');
            const fragment = await file(join35(path, entry)),
              publication = await file(
                join35(store.directory, 'terraform-original-deployment-receipts', `${match[1]}.json`),
              );
            if (
              hash32(fragment) !== match[2] ||
              fragment.length >= publication.length ||
              !publication.subarray(0, fragment.length).equals(fragment) ||
              canonicalSha256(parseArtifact(publication)) !== match[1]
            )
              throw Error('Azure original receipt metadata fragment provenance differs');
          }
          await add(`${name}/${entry}`, true);
        }
        continue;
      }
      if (name === base.deploymentName) {
        runner = true;
        const path = join35(store.directory, name);
        await directory(path);
        if (
          JSON.stringify((await readdir30(path)).sort()) !==
          JSON.stringify(['artifact-retirement.json', 'deployment.json'])
        )
          throw Error('Azure runner has unretired artifacts');
        const manifest = object29(JSON.parse((await file(join35(path, 'deployment.json'))).toString())),
          marker = object29(JSON.parse((await file(join35(path, 'artifact-retirement.json'))).toString()));
        const receipt = object29(terminal.artifacts),
          final = object29(terminal.final);
        if (
          canonicalSha256(manifest) !== canonicalSha256(expectedManifest) ||
          marker.schemaVersion !== 1 ||
          marker.status !== 'runner-artifacts-retired' ||
          marker.manifestSha256 !== canonicalSha256(manifest) ||
          marker.evidenceSha256 !== evidenceSha256 ||
          marker.finalPlanSha256 !== final.planSha256 ||
          marker.planReceiptSha256 !== canonicalSha256(final) ||
          receipt.independentCleanupSha256 !== marker.independentCleanupSha256 ||
          receipt.finalPlanSha256 !== final.planSha256 ||
          receipt.manifestSha256 !== marker.manifestSha256 ||
          receipt.evidenceSha256 !== evidenceSha256 ||
          receipt.inventorySha256 !== marker.inventorySha256 ||
          !Array.isArray(marker.artifacts) ||
          marker.inventorySha256 !== hash32(JSON.stringify(marker.artifacts))
        )
          throw Error('Azure runner retirement provenance differs');
        verifyRetainedCleanup(
          marker.independentCleanup,
          {
            manifestSha256: canonicalSha256(manifest),
            evidenceSha256,
            finalPlanSha256: String(final.planSha256),
            planReceiptSha256: canonicalSha256(final),
          },
          marker.independentCleanupSha256,
        );
        for (const entry of ['artifact-retirement.json', 'deployment.json']) await add(`${name}/${entry}`, true);
        continue;
      }
      if (name === 'terraform-stages') {
        const stagesRoot = join35(store.directory, name);
        await directory(stagesRoot);
        for (const stage of (await readdir30(stagesRoot)).sort()) {
          const upgrade = upgrades.get(stage) ?? failovers.get(stage);
          const failover = failovers.has(stage);
          if (!upgrade) throw Error('Unqualified Azure stage blocks parent retirement');
          const stagePath = join35(stagesRoot, stage);
          await directory(stagePath);
          if (JSON.stringify((await readdir30(stagePath)).sort()) !== JSON.stringify([base.deploymentName]))
            throw Error('Azure stage owner differs');
          const prefix = `${name}/${stage}/${base.deploymentName}`;
          const path = join35(store.directory, prefix);
          await directory(path);
          if (
            JSON.stringify((await readdir30(path)).sort()) !==
            JSON.stringify(['artifact-retirement.json', 'deployment.json'])
          )
            throw Error('Azure stage has unretired artifacts');
          const deployment = object29(upgrade.deployment),
            { configuration, providerLock, ...identity } = deployment;
          const manifest = object29(JSON.parse((await file(join35(path, 'deployment.json'))).toString()));
          const marker = object29(JSON.parse((await file(join35(path, 'artifact-retirement.json'))).toString()));
          const retirement = object29(await store.read(`${upgrade.planId}-stage-retirement.json`));
          if (failover) {
            const { deployment: _deployment, ...source } = upgrade;
            await validateAzureTerraformFailoverRetirement(base, source, retirement, evidenceSha256);
            const result = object29(retirement.result);
            for (const key of [
              'manifestSha256',
              'evidenceSha256',
              'finalPlanSha256',
              'inventorySha256',
              'independentCleanupSha256',
            ])
              if (result[key] !== marker[key]) throw Error('Failover stage and runner retirement receipts differ');
            if (!Array.isArray(marker.artifacts) || result.retiredArtifacts !== marker.artifacts.length)
              throw Error('Failover runner artifact count differs');
          }
          const final = object29(retirement.receipt);
          const stageEvidenceSha256 = failover ? evidenceSha256 : retirement.evidenceSha256;
          if (!failover) {
            const exactKeys = (value, names) => {
              if (canonicalSha256(Object.keys(object29(value)).sort()) !== canonicalSha256(names.toSorted()))
                throw Error('Azure upgrade retained checkpoint provenance differs');
            };
            exactKeys(retirement, [
              'schemaVersion',
              'status',
              'owner',
              'sourcePlanSha256',
              'upgradePlanSha256',
              'deploymentSha256',
              'externalEvidenceSha256',
              'receipt',
              'receiptSha256',
              'appliedJournal',
              'appliedJournalSha256',
              'retirementEvidence',
              'evidenceSha256',
              'result',
            ]);
            exactKeys(final, [
              'schemaVersion',
              'engine',
              'deploymentId',
              'backendIdentity',
              'configurationSha256',
              'providerLockSha256',
              'planSha256',
              'changes',
              'noChanges',
            ]);
            if (
              final.schemaVersion !== 1 ||
              final.engine !== 'terraform' ||
              final.deploymentId !== deployment.deploymentId ||
              !sha24(final.planSha256) ||
              !Array.isArray(final.changes) ||
              final.changes.length !== 0
            )
              throw Error('Azure upgrade final plan provenance differs');
            const proof = object29(retirement.appliedJournal),
              action = object29(await store.read(`${upgrade.planId}-action-plan.json`)),
              envelope = {
                schemaVersion: 2,
                kind: 'azure-terraform-upgrade-stage-retirement',
                externalEvidenceSha256: retirement.externalEvidenceSha256,
                sourcePlanSha256: base.planSha256,
                upgradePlanSha256: upgrade.planSha256,
                deploymentSha256: canonicalSha256(deployment),
                appliedJournalSha256: canonicalSha256(proof),
                receiptSha256: canonicalSha256(final),
              };
            exactKeys(proof, [
              'schemaVersion',
              'scope',
              'sourcePlanSha256',
              'upgradePlanSha256',
              'site',
              'contractFingerprint',
              'actionReceiptSha256',
              'manifestSha256',
              'files',
              'rootIdentity',
              'history',
              'historySha256',
              'journalCustodyQualified',
              'applicationOutcomeQualified',
              'retirementQualified',
              'currentOperationalAcceptanceQualified',
            ]);
            if (
              !sha24(retirement.externalEvidenceSha256) ||
              retirement.appliedJournalSha256 !== canonicalSha256(proof) ||
              canonicalSha256(retirement.retirementEvidence) !== canonicalSha256(envelope) ||
              stageEvidenceSha256 !== canonicalSha256(envelope) ||
              proof.schemaVersion !== 1 ||
              proof.scope !== 'azure-terraform-upgrade-applied-journal-custody' ||
              proof.sourcePlanSha256 !== base.planSha256 ||
              proof.upgradePlanSha256 !== upgrade.planSha256 ||
              canonicalSha256(proof.site) !==
                canonicalSha256({
                  siteUid: object29(upgrade.expectation).siteUid,
                  physicalSiteUid: object29(upgrade.expectation).physicalSiteUid,
                  siteContractFingerprint: object29(upgrade.expectation).siteContractFingerprint,
                }) ||
              proof.contractFingerprint !== object29(upgrade.expectation).contractFingerprint ||
              proof.manifestSha256 !== canonicalSha256(manifest) ||
              proof.actionReceiptSha256 !== canonicalSha256(action) ||
              proof.historySha256 !== canonicalSha256(proof.history) ||
              proof.journalCustodyQualified !== true ||
              proof.applicationOutcomeQualified !== false ||
              proof.retirementQualified !== false ||
              proof.currentOperationalAcceptanceQualified !== false ||
              !Array.isArray(proof.files)
            )
              throw Error('Azure upgrade retained custody provenance differs');
            verifyAzureTerraformUpgradeAppliedJournalHistory(proof.history, action, canonicalSha256(manifest));
            const root = await lstat30(store.directory),
              names = (await readdir30(store.directory))
                .filter(
                  (name) =>
                    (name.startsWith('azure-ce-upgrade-') || name === 'terraform-ce-upgrade-serial.json') &&
                    !name.endsWith('-stage-retirement.json'),
                )
                .sort();
            if (
              proof.rootIdentity !== `${root.dev}:${root.ino}:${root.birthtimeMs}` ||
              canonicalSha256(proof.files.map((raw) => object29(raw).path).sort()) !== canonicalSha256(names)
            )
              throw Error('Azure upgrade retained root provenance differs');
            for (const raw of proof.files) {
              const retained = object29(raw);
              exactKeys(retained, ['path', 'identity', 'bytesSha256', 'packetSha256']);
              if (typeof retained.path !== 'string' || !names.includes(retained.path))
                throw Error('Azure upgrade retained file provenance differs');
              const native = await readAzureTerraformParentPrivateFile(join35(store.directory, retained.path), signal);
              if (
                native.identity !== retained.identity ||
                hash32(native.bytes) !== retained.bytesSha256 ||
                canonicalSha256(parseArtifact(native.bytes)) !== retained.packetSha256
              )
                throw Error('Azure upgrade retained file provenance differs');
            }
            const result = object29(retirement.result);
            exactKeys(result, [
              'status',
              'manifestSha256',
              'evidenceSha256',
              'finalPlanSha256',
              'inventorySha256',
              'retiredArtifacts',
              'independentCleanupSha256',
            ]);
            for (const key of [
              'manifestSha256',
              'evidenceSha256',
              'finalPlanSha256',
              'inventorySha256',
              'independentCleanupSha256',
            ])
              if (result[key] !== marker[key]) throw Error('Azure upgrade runner retirement provenance differs');
            if (
              result.status !== 'runner-artifacts-retired' ||
              !Array.isArray(marker.artifacts) ||
              result.retiredArtifacts !== marker.artifacts.length
            )
              throw Error('Azure upgrade runner retirement provenance differs');
          }
          if (
            typeof configuration !== 'string' ||
            typeof providerLock !== 'string' ||
            canonicalSha256(manifest) !==
              canonicalSha256({
                ...identity,
                configurationSha256: hash32(configuration),
                providerLockSha256: hash32(providerLock),
              }) ||
            retirement.schemaVersion !== (failover ? 1 : 2) ||
            retirement.status !== 'retired' ||
            canonicalSha256(retirement.owner) !== canonicalSha256(binding.owner) ||
            retirement.sourcePlanSha256 !== base.planSha256 ||
            (failover ? retirement.failoverPlanSha256 : retirement.upgradePlanSha256) !== upgrade.planSha256 ||
            retirement.deploymentSha256 !== canonicalSha256(deployment) ||
            retirement.evidenceSha256 !== stageEvidenceSha256 ||
            retirement.receiptSha256 !== canonicalSha256(final) ||
            final.noChanges !== true ||
            final.backendIdentity !== manifest.backendIdentity ||
            final.configurationSha256 !== manifest.configurationSha256 ||
            final.providerLockSha256 !== manifest.providerLockSha256 ||
            marker.schemaVersion !== 1 ||
            marker.status !== 'runner-artifacts-retired' ||
            marker.manifestSha256 !== canonicalSha256(manifest) ||
            marker.evidenceSha256 !== stageEvidenceSha256 ||
            marker.finalPlanSha256 !== final.planSha256 ||
            marker.planReceiptSha256 !== canonicalSha256(final) ||
            !Array.isArray(marker.artifacts) ||
            marker.inventorySha256 !== hash32(JSON.stringify(marker.artifacts))
          )
            throw Error('Azure upgrade runner retirement provenance differs');
          verifyRetainedCleanup(
            marker.independentCleanup,
            {
              manifestSha256: canonicalSha256(manifest),
              evidenceSha256: String(stageEvidenceSha256),
              finalPlanSha256: String(final.planSha256),
              planReceiptSha256: canonicalSha256(final),
            },
            marker.independentCleanupSha256,
          );
          for (const entry of ['artifact-retirement.json', 'deployment.json']) await add(`${prefix}/${entry}`, true);
        }
        continue;
      }
      const checkout = /^bootstrap-checkout-[a-f0-9-]{36}\.json$/.test(name);
      if (
        !preserve.has(name) &&
        !allowed.has(name) &&
        !azureRelayHistoricalArtifacts.has(name) &&
        !isAzureIngressHistoricalArtifact(name) &&
        !isAzureTerraformReplacementHistoricalArtifact(name) &&
        !tokens.has(name) &&
        !checkout &&
        !/^terraform-(?:authorization-[a-f0-9]{64}|admission-plan-node-[1-3])\.json$/.test(name)
      )
        throw Error('Unknown Azure parent artifact blocks retirement');
      if (name === `public-site-${base.siteName}.json`) {
        const value = object29(await store.read(name)),
          record = object29(value.record);
        if (
          JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(['planId', 'record']) ||
          JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(['phase', 'resourceVersion', 'uid']) ||
          typeof value.planId !== 'string' ||
          !/^f5xc-ce-v2-[a-f0-9]{24}$/.test(value.planId) ||
          !['replace-prepared', 'replace-observed'].includes(String(record.phase)) ||
          record.uid !== teardown.retirement.find((site) => site.siteName === base.siteName)?.siteUid ||
          typeof record.resourceVersion !== 'string' ||
          !record.resourceVersion
        )
          throw Error('Azure public site replacement journal provenance differs');
      }
      if (name === 'azure-terraform-cloud-destroy-reconciliation.json') {
        const value = object29(await store.read(name));
        const observedAt = typeof value.observedAt === 'string' ? Date.parse(value.observedAt) : NaN;
        if (
          !['absent', 'owned'].includes(String(value.status)) ||
          (value.status === 'owned' && value.ownerPlanSha256 !== base.planSha256) ||
          value.resourceGroupId !==
            `/subscriptions/${base.subscription.id}/resourceGroups/${base.intent.resourceGroup}` ||
          !Number.isFinite(observedAt) ||
          observedAt > Date.now()
        )
          throw Error('Azure destroy reconciliation provenance differs');
      }
      if (tokens.has(name) && !recorded?.has(name)) {
        const value = object29(await store.read(name)),
          token = tokens.get(name);
        if (
          !token ||
          value.tokenName !== token.name ||
          value.siteName !== token.siteName ||
          value.node !== token.node ||
          Object.keys(value).sort().join(',') !== 'jwt,node,siteName,tokenName' ||
          typeof value.jwt !== 'string' ||
          !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.jwt)
        )
          throw Error('Azure parent token identity differs');
      }
      if (checkout) {
        const value = object29(await store.read(name)),
          checkoutBinding = object29(value.checkout);
        if (
          value.schemaVersion !== 1 ||
          canonicalSha256(value.owner) !== canonicalSha256(binding.owner) ||
          canonicalSha256(value.binding) !== canonicalSha256(binding) ||
          value.siteUid !== teardown.retirement[0]?.siteUid ||
          value.contractFingerprint !== teardown.drain.siteContractFingerprint ||
          !tokens.has(`${String(value.tokenName)}.json`) ||
          tokens.get(`${String(value.tokenName)}.json`)?.node !== value.node ||
          name !== `bootstrap-checkout-${String(checkoutBinding.reference).split('/').at(-1)}.json`
        )
          throw Error('Azure bootstrap checkout provenance differs');
        if (!recorded?.has(name)) {
          const token = object29(await store.read(`${String(value.tokenName)}.json`));
          if (typeof token.jwt !== 'string' || hash32(token.jwt) !== checkoutBinding.digest)
            throw Error('Azure checkout upstream token differs');
        }
      }
      await add(name, preserve.has(name) || checkout);
    }
    if (!runner) throw Error('Azure owning runner retirement missing');
    if (!recorded && [...replacementRecords.keys()].some(isAzureTerraformReplacementHistoricalArtifact))
      verifyAzureTerraformReplacementHistoricalArtifacts(
        base,
        teardown.retirement,
        replacementRecords,
        expectedManifest.providerLockSha256,
      );
    if (!recorded && relayRecords.size) {
      const sites = teardown.retirement.filter((site) => site.siteName === base.siteName);
      if (sites.length !== 1) throw Error('Azure relay retirement logical site is ambiguous');
      verifyAzureRelayHistoricalArtifacts(base, sites[0].siteUid, relayRecords);
    }
    if (failoverJournals.length) {
      const sites = teardown.retirement.filter((site) => site.siteName === base.siteName);
      if (sites.length !== 1) throw Error('Failover retirement site is ambiguous');
      await verifyAzureFailoverHistoricalArtifacts(base, sites[0].siteUid, failoverRecords);
    }
    if (!recorded && ingressRecords.size) {
      if (!ingressContract) throw Error('Verified ingress contract is required for parent history retirement');
      verifyAzureIngressHistoricalArtifacts(base, teardown.drain, ingressContract, ingressRecords);
    }
    await verifyTerminal();
    return items.sort((a, b) => a.path.localeCompare(b.path));
  };
  if (!saved) {
    const artifacts = await inventory();
    saved = {
      schemaVersion: 2,
      status: 'retiring',
      owner: binding.owner,
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: teardown.planSha256,
      evidenceSha256,
      artifacts,
      inventorySha256: canonicalSha256(artifacts),
    };
    await store.write(markerName3, saved);
  }
  if (
    saved.schemaVersion !== 2 ||
    !['retiring', 'deployment-artifacts-retired'].includes(String(saved.status)) ||
    canonicalSha256(saved.owner) !== canonicalSha256(binding.owner) ||
    saved.sourcePlanSha256 !== base.planSha256 ||
    saved.teardownPlanSha256 !== teardown.planSha256 ||
    saved.evidenceSha256 !== evidenceSha256 ||
    !Array.isArray(saved.artifacts) ||
    saved.inventorySha256 !== canonicalSha256(saved.artifacts)
  )
    throw Error('Azure parent checkpoint differs');
  const expected = new Map();
  for (const row of saved.artifacts) {
    const item = object29(row);
    if (
      typeof item.path !== 'string' ||
      item.path.split('/').some((part) => !part || part === '.' || part === '..') ||
      !sha24(item.sha256) ||
      typeof item.identity !== 'string' ||
      !item.identity ||
      typeof item.preserve !== 'boolean' ||
      expected.has(item.path)
    )
      throw Error('Azure parent inventory malformed');
    expected.set(item.path, item);
  }
  const current = await inventory(expected);
  if (
    current.some((item) => canonicalSha256(item) !== canonicalSha256(expected.get(item.path))) ||
    [...expected.values()].some((item) => item.preserve && !current.some((row) => row.path === item.path)) ||
    (saved.status === 'deployment-artifacts-retired' && current.some((item) => !item.preserve))
  )
    throw Error('Azure parent inventory changed');
  for (const item of current.filter((item) => item.path.startsWith('bootstrap-checkout-'))) {
    signal?.throwIfAborted();
    const value = object29(await store.read(item.path));
    await verifyTerminal();
    await retireBootstrapToken(value.checkout, evidenceSha256, signal);
    await verifyTerminal();
  }
  for (const item of current.filter((item) => !item.preserve)) {
    signal?.throwIfAborted();
    await directory(store.directory);
    await store.verify();
    if (hash32(await file(join35(store.directory, item.path))) !== item.sha256)
      throw Error('Azure parent artifact changed before deletion');
    signal?.throwIfAborted();
    await verifyTerminal();
    if (hash32(await file(join35(store.directory, item.path))) !== item.sha256)
      throw Error('Azure parent artifact changed after terminal verification');
    signal?.throwIfAborted();
    await unlink6(join35(store.directory, item.path));
  }
  signal?.throwIfAborted();
  await verifyTerminal();
  await store.write(markerName3, { ...saved, status: 'deployment-artifacts-retired' });
  return {
    status: 'deployment-artifacts-retired',
    owner: binding.owner,
    sourcePlanSha256: base.planSha256,
    teardownPlanSha256: teardown.planSha256,
    evidenceSha256,
    inventorySha256: saved.inventorySha256,
    retiredArtifacts: [...expected.values()].filter((item) => !item.preserve).length,
  };
}

// plugins/azure/src/ce/terraform-terminal-cleanup.ts
var name4 = 'azure-terraform-terminal-cleanup.json';
var hash33 = (value) => createHash38('sha256').update(value).digest('hex');
var sha25 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
var object30 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed Azure terminal cleanup');
  return value;
};
async function hasAzureTerraformTerminalCleanup(store) {
  try {
    await store.read(name4);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}
async function finalizeAzureTerraformRunnerCleanup(
  base,
  teardown,
  runtime,
  contract,
  session,
  store,
  api,
  env,
  signal,
  terraform,
  networkContext,
  stageAdmission,
) {
  const binding = azureUpgradeBinding(base);
  const deployment = await azureTerraformCurrentDeployment(base);
  const identity = (({ configuration, providerLock, ...rest }) => ({
    ...rest,
    configurationSha256: hash33(configuration),
    providerLockSha256: hash33(providerLock),
  }))(deployment);
  const namespaces = new Set(['default']);
  for (const value of [
    ...teardown.drain.listeners.map((row) => row.namespace),
    ...teardown.drain.origins.map((row) => row.origin.namespace),
  ]) {
    if (typeof value !== 'string' || !/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value))
      throw Error('Azure terminal namespace differs');
    namespaces.add(value);
  }
  const fresh = async (active = signal) => {
    active?.throwIfAborted();
    await store.verify();
    if (
      runtime.engine !== 'terraform' ||
      canonicalSha256(store.owner) !== canonicalSha256(binding.owner) ||
      teardown.sourcePlanSha256 !== base.planSha256 ||
      teardown.drain.siteContractFingerprint !== runtime.contract.fingerprint ||
      teardown.drain.ingressContractFingerprint !== contract.fingerprint ||
      canonicalSha256(await store.read(`${teardown.planId}.json`)) !== canonicalSha256(teardown)
    )
      throw Error('Azure terminal owner or contracts differ');
    const start = Date.now();
    const platform = await runtime.unregisteredAbsence([binding], [...namespaces].sort(), contract, active);
    const at = Date.parse(platform.observedAt),
      began = Date.parse(platform.startedAt);
    if (
      platform.status !== 'absent' ||
      canonicalSha256(platform.owner) !== canonicalSha256(binding.owner) ||
      platform.siteContractFingerprint !== runtime.contract.fingerprint ||
      platform.ingressContractFingerprint !== contract.fingerprint ||
      !Number.isFinite(at) ||
      !Number.isFinite(began) ||
      began < start ||
      at < began ||
      at > Date.now() ||
      Date.now() - at > 60000 ||
      !Array.isArray(platform.sources) ||
      !platform.sources.length
    )
      throw Error('Fresh complete Azure platform absence unavailable');
    const cloud = base.relayProfile
      ? await observeAzureRelayRetirementAbsence(base, api, active)
      : await observeAzureTerraformDestroyBoundary(base, api, active);
    if (cloud.status !== 'absent') throw Error('Fresh Azure cloud absence unavailable');
    return { platform, cloud };
  };
  let checkpoint;
  try {
    checkpoint = await store.read(name4);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (
    networkContext &&
    (networkContext.terraform !== terraform ||
      canonicalSha256(networkContext.destroyTeardown) !== canonicalSha256(teardown))
  )
    throw Error('Azure terminal owning network context differs');
  const stageContext =
    networkContext && checkpoint
      ? { ...networkContext, terminalCleanup: sealAzureTerraformTerminalSnapshot(checkpoint) }
      : networkContext;
  if (stageAdmission) {
    const admitted = stageAdmission.context;
    if (
      !networkContext ||
      !admitted ||
      stageAdmission.history.failovers.length ||
      stageAdmission.history.upgrades.length ||
      (!stageAdmission.history.network && !stageAdmission.history.retiredNetwork) ||
      canonicalSha256({ value: admitted }) !== canonicalSha256({ value: stageContext }) ||
      admitted.publicSession !== networkContext.publicSession ||
      admitted.terraform !== networkContext.terraform ||
      admitted.loaders !== networkContext.loaders ||
      admitted.site !== networkContext.site ||
      admitted.verifier !== networkContext.verifier ||
      admitted.replacementVerifier !== networkContext.replacementVerifier
    )
      throw Error('Azure terminal stage history admission differs');
  }
  const history = stageAdmission
    ? await recheckAzureTerraformTeardownStageHistory(
        stageAdmission.history,
        base,
        store,
        signal,
        stageAdmission.context,
      )
    : await qualifyAzureTerraformTeardownStageHistory(base, store, signal, stageContext);
  const { stages, failovers, upgrades, upgradeContract } = history;
  if (stages.length && !terraform) throw Error('Owning Azure upgrade retirement service unavailable');
  const validFinal = (final) =>
    !!final &&
    final.schemaVersion === 1 &&
    final.engine === 'terraform' &&
    final.deploymentId === base.deploymentName &&
    final.backendIdentity === deployment.backendIdentity &&
    final.configurationSha256 === identity.configurationSha256 &&
    final.providerLockSha256 === identity.providerLockSha256 &&
    final.noChanges === true &&
    Array.isArray(final.changes) &&
    !final.changes.length &&
    sha25(final.planSha256) &&
    !final.operation &&
    !final.actionInvocations &&
    !final.imports &&
    !final.relinquishments;
  await fresh();
  const observer = networkContext
    ? await createAzureOperationalRetirementSession(base, runtime, api, store, networkContext.publicSession, signal)
    : undefined;
  if (observer) await observer.retireSigningMaterial(signal);
  const replacementObserver = networkContext
    ? await createAzureReplacementOperationalRetirementSession(
        base,
        runtime,
        api,
        store,
        session,
        {
          loaders: networkContext.loaders,
          qualifyHistorical: networkContext.verifier,
          ...(networkContext.replacementVerifier
            ? { qualifyReplacementCompleted: networkContext.replacementVerifier }
            : {}),
        },
        networkContext.publicSession,
        signal,
      )
    : undefined;
  if (replacementObserver) await replacementObserver.retireSigningMaterial(signal);
  const replacementReadingsObserver = networkContext
    ? await createAzureReplacementReadingsOperationalRetirementSession(
        base,
        runtime,
        api,
        store,
        session,
        {
          loaders: networkContext.loaders,
          qualifyHistorical: networkContext.verifier,
          ...(networkContext.replacementVerifier
            ? { qualifyReplacementCompleted: networkContext.replacementVerifier }
            : {}),
        },
        networkContext.publicSession,
        signal,
      )
    : undefined;
  if (replacementReadingsObserver) await replacementReadingsObserver.retireSigningMaterial(signal);
  const parentContracts = Object.freeze({
    ingress: contract,
    ...(upgradeContract ? { upgrade: upgradeContract } : {}),
    ...(observer ? { observer } : {}),
    ...(replacementObserver ? { replacementObserver } : {}),
    ...(replacementReadingsObserver ? { replacementReadingsObserver } : {}),
  });
  await fresh();
  if (networkContext && (!checkpoint || ['cancelling', 'planning'].includes(checkpoint.phase))) {
    const prepared = await prepareAzureTerraformNetworkTerminalPlanning(
      base,
      store,
      networkContext,
      (active) => fresh(active),
      env,
      signal,
    );
    checkpoint = prepared.checkpoint;
  }
  if (!checkpoint) {
    if (!session.readConfigurationSha256 || !session.cancelUnsubmittedPlan || !session.retireArtifacts)
      throw Error('Azure owning runner cleanup unavailable');
    const configurationSha256 = await session.readConfigurationSha256();
    if (!sha25(configurationSha256)) throw Error('Azure current configuration is unresolved');
    const configuration = object30(JSON.parse(await session.readConfiguration(configurationSha256)));
    const renderedEmpty = JSON.stringify({ terraform: configuration.terraform, provider: configuration.provider });
    if (canonicalSha256(JSON.parse(renderedEmpty)) !== canonicalSha256(JSON.parse(deployment.configuration)))
      throw Error('Azure empty configuration provider or execution identity differs');
    const emptyConfiguration = deployment.configuration;
    const destroy = await store.read('azure-terraform-cloud-destroy-final.json');
    if (
      destroy.schemaVersion !== 1 ||
      destroy.engine !== 'terraform' ||
      destroy.operation !== 'destroy' ||
      destroy.noChanges !== true ||
      destroy.deploymentId !== base.deploymentName ||
      destroy.backendIdentity !== deployment.backendIdentity ||
      destroy.configurationSha256 !== configurationSha256 ||
      destroy.providerLockSha256 !== identity.providerLockSha256 ||
      !sha25(destroy.planSha256) ||
      !Array.isArray(destroy.changes) ||
      destroy.changes.length
    )
      throw Error('Azure terminal destroy evidence differs');
    const evidence = await fresh();
    checkpoint = {
      schemaVersion: 1,
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: teardown.planSha256,
      configurationSha256,
      emptyConfiguration,
      emptyConfigurationSha256: hash33(emptyConfiguration),
      destroy,
      evidence,
      evidenceSha256: canonicalSha256(evidence),
      checkpointSha256: canonicalSha256({ configurationSha256, emptyConfiguration, destroy, evidence }),
      phase: 'cancelling',
    };
    await store.write(name4, checkpoint);
  }
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.sourcePlanSha256 !== base.planSha256 ||
    checkpoint.teardownPlanSha256 !== teardown.planSha256 ||
    !sha25(checkpoint.configurationSha256) ||
    !sha25(checkpoint.evidenceSha256) ||
    checkpoint.evidenceSha256 !== canonicalSha256(checkpoint.evidence) ||
    checkpoint.checkpointSha256 !==
      canonicalSha256({
        configurationSha256: checkpoint.configurationSha256,
        emptyConfiguration: checkpoint.emptyConfiguration,
        destroy: checkpoint.destroy,
        evidence: checkpoint.evidence,
      }) ||
    typeof checkpoint.emptyConfiguration !== 'string' ||
    checkpoint.emptyConfigurationSha256 !== hash33(checkpoint.emptyConfiguration) ||
    checkpoint.emptyConfigurationSha256 !== identity.configurationSha256 ||
    !['cancelling', 'planning', 'retiring', 'retired'].includes(checkpoint.phase) ||
    (['retiring', 'retired'].includes(checkpoint.phase) &&
      (!validFinal(checkpoint.final) ||
        !sha25(checkpoint.retirementEvidenceSha256) ||
        !checkpoint.retirementEvidence ||
        checkpoint.retirementEvidenceSha256 !== canonicalSha256(checkpoint.retirementEvidence)))
  )
    throw Error('Azure terminal checkpoint differs');
  if (checkpoint.phase === 'cancelling') {
    await fresh();
    if (!session.cancelUnsubmittedPlan) throw Error('Azure owning runner cancellation unavailable');
    const actual = await session.cancelUnsubmittedPlan(
      checkpoint.destroy,
      checkpoint.configurationSha256,
      checkpoint.emptyConfiguration,
      checkpoint.evidenceSha256,
    );
    if (actual !== checkpoint.emptyConfigurationSha256) throw Error('Azure cancelled configuration differs');
    checkpoint.phase = 'planning';
    await store.write(name4, checkpoint);
  }
  if (checkpoint.phase === 'planning') {
    await fresh();
    const final = await session.plan(env, signal);
    if (!validFinal(final)) throw Error('Azure final ordinary refresh-enabled plan differs');
    checkpoint.final = final;
    checkpoint.retirementEvidence = await fresh();
    checkpoint.retirementEvidenceSha256 = canonicalSha256(checkpoint.retirementEvidence);
    checkpoint.phase = 'retiring';
    await store.write(name4, checkpoint);
  }
  if (networkContext && ['retiring', 'retired'].includes(checkpoint.phase)) {
    if (checkpoint.phase === 'retiring' || Object.hasOwn(checkpoint, 'retainedDestroyConfiguration')) {
      const retired = await retireAzureTerraformNetworkTerminalMain(
        base,
        store,
        { ...networkContext, terminalCleanup: sealAzureTerraformTerminalSnapshot(checkpoint), parentContracts },
        async (active) => {
          await fresh(active);
        },
        env,
        signal,
      );
      checkpoint = retired.checkpoint;
    }
  } else if (checkpoint.phase === 'retiring') {
    await fresh();
    if (!session.retireArtifacts || !checkpoint.final || !checkpoint.retirementEvidenceSha256)
      throw Error('Azure owning runner retirement unavailable');
    checkpoint.artifacts = await session.retireArtifacts(
      checkpoint.final,
      checkpoint.retirementEvidenceSha256,
      env,
      signal,
    );
    const value = checkpoint.artifacts;
    if (
      value.status !== 'runner-artifacts-retired' ||
      value.manifestSha256 !== canonicalSha256(identity) ||
      value.evidenceSha256 !== checkpoint.retirementEvidenceSha256 ||
      value.finalPlanSha256 !== checkpoint.final.planSha256 ||
      !sha25(value.inventorySha256) ||
      !Number.isSafeInteger(value.retiredArtifacts) ||
      value.retiredArtifacts < 0
    )
      throw Error('Azure runner retirement receipt differs');
    checkpoint.phase = 'retired';
    await store.write(name4, checkpoint);
  }
  await fresh();
  const value = checkpoint.artifacts;
  if (
    !value ||
    !checkpoint.final ||
    value.status !== 'runner-artifacts-retired' ||
    value.manifestSha256 !== canonicalSha256(identity) ||
    value.evidenceSha256 !== checkpoint.retirementEvidenceSha256 ||
    value.finalPlanSha256 !== checkpoint.final.planSha256 ||
    !sha25(value.inventorySha256) ||
    !Number.isSafeInteger(value.retiredArtifacts) ||
    value.retiredArtifacts < 0
  )
    throw Error('Azure terminal retirement evidence differs');
  if (!checkpoint.retirementEvidenceSha256) throw Error('Azure parent retirement evidence missing');
  for (const upgrade of upgrades) {
    await fresh();
    if (!terraform || !upgradeContract) throw Error('Owning Azure upgrade retirement service unavailable');
    await finalizeAzureTerraformUpgradeStageRetirement(
      base,
      upgrade,
      upgradeContract,
      terraform,
      store,
      checkpoint.retirementEvidenceSha256,
      env,
      signal,
    );
    await fresh();
  }
  for (const failover of failovers) {
    await fresh();
    if (!terraform) throw Error('Owning Azure failover retirement service unavailable');
    const sites = teardown.retirement.filter((site) => site.siteName === base.siteName);
    if (sites.length !== 1) throw Error('Failover retirement site is ambiguous');
    await retireAzureTerraformFailoverStage(
      base,
      failover,
      sites[0].siteUid,
      terraform,
      store,
      checkpoint.retirementEvidenceSha256,
      env,
      signal,
    );
    await fresh();
  }
  if (networkContext) {
    if (Object.hasOwn(checkpoint, 'retainedDestroyConfiguration')) {
      const transformed = await retireAzureTerraformNetworkTerminalPlaintext(
        base,
        store,
        { ...networkContext, terminalCleanup: sealAzureTerraformTerminalSnapshot(checkpoint), parentContracts },
        async (active) => {
          await fresh(active);
        },
        signal,
      );
      checkpoint = transformed.checkpoint;
    }
    const postContext = {
      ...networkContext,
      terminalCleanup: sealAzureTerraformTerminalSnapshot(checkpoint),
      parentContracts,
    };
    const absence = await qualifyAzureTerraformNetworkFreshParentAbsence(
      base,
      store,
      postContext,
      runtime,
      contract,
      api,
      signal,
    );
    let bootstrapProgress;
    try {
      bootstrapProgress = await store.read('azure-terraform-network-bootstrap-packet-retirement.json');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (bootstrapProgress === undefined)
      await retireAzureTerraformNetworkSensitivePackets(base, store, postContext, signal);
    await retireAzureTerraformNetworkBootstrapPackets(
      base,
      store,
      postContext,
      absence,
      runtime,
      contract,
      api,
      signal,
    );
    const checkoutRetirement = await retireAzureTerraformNetworkOpaqueCheckouts(
      base,
      store,
      postContext,
      absence,
      runtime,
      contract,
      api,
      signal,
    );
    const parent = checkoutRetirement.parent;
    if (!checkpoint.final) throw Error('Azure network final receipt missing after packet retirement');
    return {
      parent,
      checkoutRetirement,
      status: 'network-parent-packets-retired',
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: teardown.planSha256,
      finalPlanSha256: checkpoint.final.planSha256,
      artifacts: value,
      cloud: 'absent',
      sites: 'deleted',
      completeCleanup: false,
      parentRetirementQualified: false,
      interfaceAbsenceQualified: false,
      opaqueCheckoutRetirementQualified: true,
      fullExternalCleanupQualified: false,
    };
  }
  const parent = await retireAzureTerraformParentArtifacts(
    base,
    teardown,
    checkpoint.retirementEvidenceSha256,
    store,
    signal,
    contract,
  );
  return {
    parent,
    status: 'deployment-artifacts-retired',
    sourcePlanSha256: base.planSha256,
    teardownPlanSha256: teardown.planSha256,
    finalPlanSha256: checkpoint.final.planSha256,
    artifacts: value,
    cloud: 'absent',
    sites: 'deleted',
    completeCleanup: false,
  };
}

// plugins/azure/src/ce/terraform-teardown.ts
var object31 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed Azure teardown material');
  return value;
};
var safeName = (value) => typeof value === 'string' && /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
function compileAzureTerraformTeardown(base, drain, retirement, pendingAdmissionJournalSha256) {
  verifyAzureCePlan(base);
  const binding = azureUpgradeBinding(base);
  if (
    base.engine !== 'terraform' ||
    (pendingAdmissionJournalSha256 !== undefined && !/^[a-f0-9]{64}$/.test(pendingAdmissionJournalSha256)) ||
    drain.schemaVersion !== 1 ||
    drain.sourcePlanSha256 !== base.planSha256 ||
    canonicalSha256(drain.owner) !== canonicalSha256(binding.owner) ||
    drain.sites.length !== 1 ||
    canonicalSha256(drain.sites[0].binding) !== canonicalSha256(binding) ||
    retirement.length !== 1 ||
    retirement[0].siteName !== binding.siteName ||
    retirement[0].siteUid !== drain.sites[0].siteUid ||
    !retirement[0].physicalSiteUid ||
    binding.nodes.some((node) => !retirement[0].tokens.some((token) => token.node === node))
  )
    throw new Error('Azure Terraform teardown source or site inventory differs');
  const identities = new Set();
  for (const token of retirement[0].tokens) {
    if (
      !binding.nodes.includes(token.node) ||
      !safeName(token.name) ||
      identities.has(token.name) ||
      (pendingAdmissionJournalSha256 !== undefined && (typeof token.uid !== 'string' || !token.uid.trim()))
    )
      throw new Error('Azure Terraform teardown token identity differs');
    identities.add(token.name);
  }
  const draft = {
    schemaVersion: 1,
    kind: 'azure-ce-terraform-teardown',
    engine: 'terraform',
    sourcePlanSha256: base.planSha256,
    drain: structuredClone(drain),
    retirement: structuredClone(retirement),
    ...(pendingAdmissionJournalSha256 ? { pendingAdmissionJournalSha256 } : {}),
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-teardown-${planSha256.slice(0, 24)}`, planSha256 };
}
async function collectAzureTeardownMaterial(base, runtime, contract, storage, signal) {
  verifyAzureCePlan(base);
  const binding = azureUpgradeBinding(base);
  if (runtime.engine !== base.engine || canonicalSha256(storage.owner) !== canonicalSha256(binding.owner))
    throw new Error('Azure teardown preparation requires the owning execution engine');
  await storage.verify();
  const entries = await readdir31(storage.directory, { withFileTypes: true });
  const ingressFiles = entries.filter((entry) => /^ingress-plan-[a-f0-9]{24}\.json$/.test(entry.name));
  const namespaces = new Set(['default']);
  for (const entry of ingressFiles) {
    if (!entry.isFile()) throw new Error('Azure teardown ingress artifact is not a regular file');
    const saved = object31(await storage.read(entry.name));
    const namespace = object31(object31(saved.request).metadata).namespace;
    const originNamespace = object31(object31(object31(saved.material).intent).originPool).namespace;
    if (!safeName(namespace) || !safeName(originNamespace)) throw new Error('Azure teardown namespace is invalid');
    namespaces.add(namespace);
    namespaces.add(originNamespace);
  }
  let pendingAdmissionJournalSha256;
  const observe = async () => {
    let value = pendingAdmissionJournalSha256
      ? undefined
      : await runtime.teardownInventory([binding], [...namespaces].sort(), contract, signal);
    if (pendingAdmissionJournalSha256 || (value?.status === 'unknown' && base.engine === 'terraform')) {
      const pending = await observeAzurePendingAdmission(base, runtime, contract, storage, signal);
      if (
        pending.value.sites[0].siteUid !== pending.journal.siteUid ||
        !pending.value.sites[0].physicalSiteUid ||
        pending.value.resources.length !== 1
      )
        throw Error('Azure pending teardown exact site or enrollment identity differs');
      await azurePendingAdmissionJournal(base, storage, runtime.contract.fingerprint, true);
      if (pendingAdmissionJournalSha256 && pendingAdmissionJournalSha256 !== pending.journal.sha256)
        throw Error('Azure pending admission changed during preparation');
      pendingAdmissionJournalSha256 = pending.journal.sha256;
      value = {
        ...pending.value,
        sites: pending.value.sites.map((row) => ({
          ...row,
          siteUid: String(row.siteUid),
          physicalSiteUid: String(row.physicalSiteUid),
        })),
      };
    }
    if (!value) throw Error('Azure teardown inventory is unavailable');
    const observedAt = Date.parse(value.observedAt);
    if (
      value.status !== 'observed' ||
      canonicalSha256(value.owner) !== canonicalSha256(binding.owner) ||
      value.siteContractFingerprint !== runtime.contract.fingerprint ||
      value.ingressContractFingerprint !== contract.fingerprint ||
      !Number.isFinite(observedAt) ||
      observedAt > Date.now() ||
      Date.now() - observedAt > 60000
    )
      throw new Error('Fresh Azure platform teardown inventory is unavailable');
    return value;
  };
  const before = await observe();
  const ingress = runtime.ingress(contract, storage);
  const listeners = [];
  for (const live of before.resources.filter((row) => row.kind === 'http_loadbalancers')) {
    if (!live.ingressPlanId) throw new Error('Azure listener has no persisted plan identity');
    const reference = await ingress.teardownReference(live.ingressPlanId);
    if (reference.name !== live.name || reference.namespace !== live.namespace || reference.uid !== live.uid)
      throw new Error('Azure listener checkpoint differs from platform inventory');
    listeners.push({ id: reference.id, name: reference.name, namespace: reference.namespace });
  }
  const origins = [];
  const originTeardown = runtime.originTeardown(contract);
  for (const live of before.resources.filter((row) => row.kind === 'origin_pools'))
    origins.push(
      await originTeardown.observe(
        binding.owner,
        { name: live.name, namespace: live.namespace, uid: live.uid },
        signal,
      ),
    );
  const site = before.sites.filter((row) => row.siteName === binding.siteName);
  if (site.length !== 1) throw new Error('Azure teardown site inventory is missing or ambiguous');
  const routing = before.resources
    .filter(
      (row) =>
        row.siteName === binding.siteName &&
        (row.kind === 'bgps' || row.kind === 'bgp_routing_policys' || row.kind === 'external_connectors'),
    )
    .map((row) => ({
      kind:
        row.kind === 'bgps' ? 'bgp' : row.kind === 'bgp_routing_policys' ? 'bgp_routing_policy' : 'external_connector',
      name: row.name,
      uid: row.uid,
    }));
  const tokenRows = new Map(
    (await collectAzureHistoricalEnrollmentTokens(base, storage, signal)).map((token) => [token.name, token]),
  );
  for (const row of before.resources.filter((row) => row.kind === 'tokens' && row.siteName === binding.siteName)) {
    if (!row.node) throw new Error('Azure teardown token node identity is unavailable');
    const existing = tokenRows.get(row.name);
    if (existing && existing.node !== row.node) throw new Error('Azure teardown enrollment identities conflict');
    tokenRows.set(row.name, {
      node: row.node,
      name: row.name,
      ...(pendingAdmissionJournalSha256 ? { uid: row.uid } : {}),
    });
  }
  const drain = {
    schemaVersion: 1,
    owner: binding.owner,
    sourcePlanSha256: base.planSha256,
    siteContractFingerprint: runtime.contract.fingerprint,
    ingressContractFingerprint: contract.fingerprint,
    listeners,
    origins,
    sites: [{ binding, siteUid: site[0].siteUid, routing }],
  };
  const retirement = [
    {
      siteName: site[0].siteName,
      siteUid: site[0].siteUid,
      physicalSiteUid: site[0].physicalSiteUid,
      tokens: [...tokenRows.values()].sort((a, b) => a.name.localeCompare(b.name)),
    },
  ];
  const after = await observe();
  if (
    canonicalSha256({ sites: before.sites, resources: before.resources }) !==
    canonicalSha256({ sites: after.sites, resources: after.resources })
  )
    throw new Error('Azure teardown source changed during preparation');
  return { drain, retirement, ...(pendingAdmissionJournalSha256 ? { pendingAdmissionJournalSha256 } : {}) };
}
async function prepareAzureTerraformTeardown(base, runtime, contract, storage, signal) {
  if (base.engine !== 'terraform') throw new Error('Azure Terraform teardown requires Terraform ownership');
  let workflow;
  try {
    workflow = await storage.read('terraform-workflow.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (
    workflow !== undefined &&
    object31(workflow).stage === 'network-pending' &&
    Object.keys(object31(object31(workflow).bootstrapByNode)).length === 0
  )
    return prepareAzureFoundationTeardown(base, runtime, contract, storage, signal);
  const { drain, retirement, pendingAdmissionJournalSha256 } = await collectAzureTeardownMaterial(
    base,
    runtime,
    contract,
    storage,
    signal,
  );
  const plan = compileAzureTerraformTeardown(base, drain, retirement, pendingAdmissionJournalSha256);
  await storage.write(`${plan.planId}.json`, plan);
  return plan;
}
async function runAzureTerraformTeardown(
  base,
  input,
  authorizedPlanSha256,
  runtime,
  contract,
  session,
  storage,
  api,
  env,
  signal,
  terraform,
  networkContext,
) {
  const validateNetworkContext = () => {
    if (networkContext === undefined) return;
    const context = networkContext;
    if (
      input.kind === 'azure-ce-terraform-foundation-teardown' ||
      base.engine !== 'terraform' ||
      runtime.engine !== 'terraform' ||
      !terraform ||
      context.terraform !== terraform ||
      canonicalSha256(context.destroyTeardown) !== canonicalSha256(input) ||
      input.sourcePlanSha256 !== base.planSha256 ||
      input.retirement.length !== 1 ||
      input.retirement[0].siteName !== base.siteName ||
      context.site?.siteUid !== input.retirement[0].siteUid ||
      !/^[a-f0-9]{64}$/.test(context.site?.siteConfigurationSha256 ?? '') ||
      typeof context.loaders?.loadSource !== 'function' ||
      typeof context.loaders?.loadOutcome !== 'function' ||
      typeof context.verifier !== 'function' ||
      (context.replacementVerifier !== undefined && typeof context.replacementVerifier !== 'function') ||
      !['getSessionId', 'getArtifactsDir', 'getArtifactPath', 'saveArtifact'].every(
        (key) => typeof Reflect.get(context.publicSession ?? {}, key) === 'function',
      )
    )
      throw Error('Azure network teardown context differs');
  };
  validateNetworkContext();
  if (input.kind === 'azure-ce-terraform-foundation-teardown')
    return runAzureFoundationTeardown(
      base,
      input,
      authorizedPlanSha256,
      runtime,
      contract,
      session,
      storage,
      api,
      env,
      signal,
    );
  const expected = compileAzureTerraformTeardown(
    base,
    input.drain,
    input.retirement,
    input.pendingAdmissionJournalSha256,
  );
  let stageHistorySha256;
  let stageAdmission;
  const validate = async () => {
    validateNetworkContext();
    signal?.throwIfAborted();
    let terminalCleanup;
    if (networkContext) {
      try {
        terminalCleanup = await storage.read('azure-terraform-terminal-cleanup.json');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    const stageContext =
      networkContext && terminalCleanup !== undefined
        ? { ...networkContext, terminalCleanup: sealAzureTerraformTerminalSnapshot(terminalCleanup) }
        : networkContext;
    const history = await qualifyAzureTerraformTeardownStageHistory(base, storage, signal, stageContext);
    if (history.stages.length && !terraform) throw Error('Owning Azure upgrade retirement service unavailable');
    if (stageHistorySha256 !== undefined && stageHistorySha256 !== history.sourceSha256)
      throw Error('Azure teardown stage history changed between actions');
    stageHistorySha256 = history.sourceSha256;
    stageAdmission =
      networkContext &&
      !history.failovers.length &&
      !history.upgrades.length &&
      (history.network || history.retiredNetwork)
        ? { history, context: stageContext }
        : undefined;
    await storage.verify();
    if (
      canonicalSha256(expected) !== canonicalSha256(input) ||
      authorizedPlanSha256 !== input.planSha256 ||
      runtime.engine !== 'terraform' ||
      runtime.contract.fingerprint !== input.drain.siteContractFingerprint ||
      contract.fingerprint !== input.drain.ingressContractFingerprint ||
      canonicalSha256(storage.owner) !== canonicalSha256(input.drain.owner)
    )
      throw new Error('Azure Terraform teardown authorization, ownership or contract differs');
    if (input.pendingAdmissionJournalSha256 && !(await hasAzureTerraformTerminalCleanup(storage))) {
      const pending = await observeAzurePendingAdmission(base, runtime, contract, storage, signal);
      const original = input.retirement[0],
        site = pending.value.sites[0];
      if (
        pending.journal.sha256 !== input.pendingAdmissionJournalSha256 ||
        (site.siteUid !== null && site.siteUid !== original.siteUid) ||
        (site.physicalSiteUid !== null && site.physicalSiteUid !== original.physicalSiteUid) ||
        pending.value.resources.some(
          (row) =>
            !original.tokens.some(
              (token) => token.name === row.name && token.node === row.node && token.uid === row.uid,
            ),
        )
      )
        throw Error('Azure pending teardown journal or site identity changed');
    }
  };
  await validate();
  await beginAzureTerraformRetirement(base, input, storage);
  if (await hasAzureTerraformTerminalCleanup(storage))
    return finalizeAzureTerraformRunnerCleanup(
      base,
      input,
      runtime,
      contract,
      session,
      storage,
      api,
      env,
      signal,
      terraform,
      networkContext,
      stageAdmission,
    );
  let completed;
  try {
    completed = await storage.read('azure-terraform-teardown-receipt.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (completed !== undefined) {
    const receipt = object31(completed),
      final = object31(await storage.read('azure-terraform-cloud-destroy-final.json'));
    if (
      receipt.status !== 'retired' ||
      receipt.sourcePlanSha256 !== base.planSha256 ||
      receipt.teardownPlanSha256 !== input.planSha256 ||
      receipt.cloud !== 'absent' ||
      receipt.sites !== 'deleted' ||
      receipt.finalPlanSha256 !== final.planSha256 ||
      !/^[a-f0-9]{64}$/.test(String(final.planSha256)) ||
      final.operation !== 'destroy' ||
      final.noChanges !== true ||
      !Array.isArray(final.changes) ||
      final.changes.length
    )
      throw Error('Azure completed teardown receipt differs');
    return finalizeAzureTerraformRunnerCleanup(
      base,
      input,
      runtime,
      contract,
      session,
      storage,
      api,
      env,
      signal,
      terraform,
      networkContext,
      stageAdmission,
    );
  }
  const drained = await runtime.drainPlatform(input.drain, contract, storage, signal);
  if (drained.status !== 'platform-drained') return { status: 'pending-platform-drain' };
  await validate();
  const cloud = await runAzureTerraformCloudTeardown(
    base,
    session,
    storage,
    api,
    env,
    signal,
    !!input.pendingAdmissionJournalSha256,
  );
  for (const site of input.retirement) {
    await validate();
    const current = await runtime.observeSiteDeletion(azureUpgradeBinding(base), site, signal);
    if (!['pending', 'deleted'].includes(current.status)) throw new Error('Azure site retirement evidence is unknown');
    for (const token of site.tokens) {
      await validate();
      if (input.pendingAdmissionJournalSha256) {
        if (!token.uid) throw Error('Azure pending token UID is unavailable');
        await runtime.deleteBootstrapTokenExact(azureUpgradeBinding(base), token.node, token.name, token.uid, signal);
      } else await runtime.deleteBootstrapToken(azureUpgradeBinding(base), token.node, token.name, signal);
    }
    await validate();
    await runtime.deleteSiteExact(azureUpgradeBinding(base), site.siteUid, signal);
    if ((await runtime.observeSiteDeletion(azureUpgradeBinding(base), site, signal)).status !== 'deleted')
      return { status: 'pending-site-retirement', cloud };
  }
  await validate();
  const boundary = await observeAzureTerraformDestroyBoundary(base, api, signal);
  if (boundary.status !== 'absent') throw new Error('Azure cloud retirement absence has not converged');
  const receipt = {
    status: 'retired',
    sourcePlanSha256: base.planSha256,
    teardownPlanSha256: input.planSha256,
    finalPlanSha256: cloud.finalPlanSha256,
    cloud: boundary.status,
    sites: 'deleted',
    observedAt: new Date().toISOString(),
  };
  await storage.write('azure-terraform-teardown-receipt.json', receipt);
  return finalizeAzureTerraformRunnerCleanup(
    base,
    input,
    runtime,
    contract,
    session,
    storage,
    api,
    env,
    signal,
    terraform,
    networkContext,
    stageAdmission,
  );
}

// plugins/azure/src/ce/native-teardown.ts
function validateCloudPlan(base, cloud) {
  verifyAzureCePlan(base);
  verifyAzureCePlan(cloud);
  const groupId = `/subscriptions/${base.subscription.id}/resourceGroups/${base.intent.resourceGroup}`;
  const groupDeletes = cloud.actions.filter(
    (action) => action.kind === 'resource-delete' && action.resourceId?.toLowerCase() === groupId.toLowerCase(),
  );
  if (
    base.engine !== 'native' ||
    base.intent.operation !== 'deploy' ||
    cloud.engine !== 'native' ||
    cloud.intent.operation !== 'teardown' ||
    cloud.deploymentName !== base.deploymentName ||
    cloud.subscription.id !== base.subscription.id ||
    cloud.region !== base.region ||
    cloud.siteName !== base.siteName ||
    cloud.actions.some((action) => action.phase !== 'teardown' || !action.mutates) ||
    groupDeletes.length !== 1 ||
    cloud.actions.at(-1)?.id !== groupDeletes[0].id
  )
    throw new Error('Azure native cloud teardown plan differs from the original deployment');
}
function compileAzureNativeTeardown(base, cloud, drain, retirement) {
  validateCloudPlan(base, cloud);
  const binding = azureUpgradeBinding(base);
  if (
    drain.sourcePlanSha256 !== base.planSha256 ||
    canonicalSha256(drain.owner) !== canonicalSha256(binding.owner) ||
    drain.sites.length !== 1 ||
    canonicalSha256(drain.sites[0].binding) !== canonicalSha256(binding) ||
    retirement.length !== 1 ||
    retirement[0].siteName !== binding.siteName ||
    retirement[0].siteUid !== drain.sites[0].siteUid ||
    !retirement[0].physicalSiteUid ||
    binding.nodes.some((node) => !retirement[0].tokens.some((token) => token.node === node))
  )
    throw new Error('Azure native teardown source or site inventory differs');
  const draft = {
    schemaVersion: 1,
    kind: 'azure-ce-native-teardown',
    engine: 'native',
    sourcePlanSha256: base.planSha256,
    cloudPlanId: cloud.planId,
    cloudPlanSha256: cloud.planSha256,
    drain: structuredClone(drain),
    retirement: structuredClone(retirement),
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-teardown-${planSha256.slice(0, 24)}`, planSha256 };
}
async function prepareAzureNativeTeardown(base, cloud, runtime, contract, storage, signal) {
  validateCloudPlan(base, cloud);
  await assertAzureNativeActive(storage);
  const { drain, retirement } = await collectAzureTeardownMaterial(base, runtime, contract, storage, signal);
  const plan = compileAzureNativeTeardown(base, cloud, drain, retirement);
  await persistAzureNativeSource(base, storage);
  await persistAzureNativeSource(cloud, storage);
  await storage.write(`${plan.planId}.json`, plan);
  return plan;
}
async function runAzureNativeTeardown(
  base,
  cloud,
  input,
  authorizedPlanSha256,
  runtime,
  contract,
  storage,
  applyCloud,
  signal,
  api,
  upgradeContract,
) {
  const expected = compileAzureNativeTeardown(base, cloud, input.drain, input.retirement);
  const binding = azureUpgradeBinding(base);
  const validate = async () => {
    signal?.throwIfAborted();
    await storage.verify();
    if (
      canonicalSha256(expected) !== canonicalSha256(input) ||
      authorizedPlanSha256 !== input.planSha256 ||
      runtime.engine !== 'native' ||
      runtime.contract.fingerprint !== input.drain.siteContractFingerprint ||
      contract.fingerprint !== input.drain.ingressContractFingerprint ||
      canonicalSha256(storage.owner) !== canonicalSha256(input.drain.owner)
    )
      throw new Error('Azure native teardown authorization, ownership or contract differs');
  };
  await validate();
  if (!api)
    throw Error('Azure native teardown requires independent cloud absence collection before staging retirement');
  const releaseRetirement = await acquireProcessLock(join36(storage.directory, '.azure-relay-native-mutation-lock'));
  try {
    await validate();
    const authorization = {
      schemaVersion: 1,
      engine: 'native',
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: input.planSha256,
      mutations: true,
    };
    const retirement = {
      schemaVersion: 1,
      engine: 'native',
      owner: binding.owner,
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: input.planSha256,
    };
    for (const [name, value] of [
      [`${input.planId}-authorization.json`, authorization],
      ['azure-native-lifecycle-retirement.json', retirement],
    ]) {
      let saved;
      try {
        saved = await storage.read(name);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (saved !== undefined && canonicalSha256(saved) !== canonicalSha256(value))
        throw Error('Azure native retirement belongs to another immutable teardown');
      if (saved === undefined) await storage.write(name, value);
    }
  } finally {
    await releaseRetirement();
  }
  let savedReceipt;
  try {
    savedReceipt = await storage.read('azure-native-teardown-receipt.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  let receipt;
  if (savedReceipt !== undefined) {
    const value = savedReceipt;
    if (
      value?.status !== 'retired' ||
      value.sourcePlanSha256 !== base.planSha256 ||
      value.teardownPlanSha256 !== input.planSha256 ||
      value.cloudPlanSha256 !== cloud.planSha256 ||
      value.cloud !== 'absent' ||
      value.sites !== 'deleted'
    )
      throw Error('Saved native retirement receipt differs');
    receipt = value;
  } else {
    const drained = await runtime.drainPlatform(input.drain, contract, storage, signal);
    if (drained.status !== 'platform-drained') return { status: 'pending-platform-drain' };
    await validate();
    const retired = await applyCloud(signal);
    if (retired.status !== 'retired' || retired.absence !== 'absent')
      throw new Error('Azure native cloud retirement absence is unavailable');
    for (const site of input.retirement) {
      await validate();
      const current = await runtime.observeSiteDeletion(binding, site, signal);
      if (!['pending', 'deleted'].includes(current.status))
        throw new Error('Azure native site retirement evidence is unknown');
      for (const token of site.tokens) {
        await validate();
        await runtime.deleteBootstrapToken(binding, token.node, token.name, signal);
      }
      await validate();
      await runtime.deleteSiteExact(binding, site.siteUid, signal);
      if ((await runtime.observeSiteDeletion(binding, site, signal)).status !== 'deleted')
        return { status: 'pending-site-retirement' };
    }
    receipt = {
      status: 'retired',
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: input.planSha256,
      cloudPlanSha256: cloud.planSha256,
      cloud: 'absent',
      sites: 'deleted',
      observedAt: new Date().toISOString(),
    };
    await storage.write('azure-native-teardown-receipt.json', receipt);
  }
  {
    const relayKey = base.relayProfile
      ? await retireAzureNativeRelayKey(base, input, runtime, contract, storage, api, signal)
      : undefined;
    const bootstrap = await retireAzureNativeBootstrapArtifacts(
      base,
      cloud,
      input,
      runtime,
      contract,
      storage,
      api,
      signal,
    );
    const names = await readdir32(storage.directory);
    const verifiedUpgrade =
      upgradeContract ??
      (!names.includes('azure-native-parent-artifact-retirement.json') &&
      names.some(isAzureNativeUpgradeHistoricalArtifact)
        ? await VerifiedUpgradeContract.release(fetch, signal)
        : undefined);
    const parent = await retireAzureNativeParentArtifacts(
      base,
      cloud,
      input,
      runtime,
      contract,
      storage,
      api,
      signal,
      verifiedUpgrade,
    );
    return { ...receipt, ...(relayKey ? { relayKey } : {}), bootstrap, parent, completeCleanup: true };
  }
}
async function observeAzureNativeGroupAbsence(base, api, signal) {
  verifyAzureCePlan(base);
  signal?.throwIfAborted();
  const account = await api.exec(
    'az',
    ['account', 'show', '--subscription', base.subscription.id, '--output', 'json'],
    signal ? { signal } : undefined,
  );
  if (account.exitCode !== 0) throw new Error('Azure native teardown account evidence is unavailable');
  let identity;
  try {
    identity = JSON.parse(account.stdout);
  } catch {
    throw new Error('Malformed Azure native teardown account evidence');
  }
  if (
    String(identity.id).toLowerCase() !== base.subscription.id.toLowerCase() ||
    String(identity.tenantId).toLowerCase() !== base.subscription.tenantId.toLowerCase() ||
    identity.environmentName !== base.subscription.cloud ||
    identity.state !== 'Enabled'
  )
    throw new Error('Azure native teardown account differs from deployment');
  const result = await api.exec(
    'az',
    [
      'group',
      'exists',
      '--name',
      base.intent.resourceGroup,
      '--subscription',
      base.subscription.id,
      '--output',
      'json',
    ],
    signal ? { signal } : undefined,
  );
  signal?.throwIfAborted();
  if (result.exitCode !== 0) throw new Error('Azure native teardown absence evidence is unavailable');
  let exists;
  try {
    exists = JSON.parse(result.stdout);
  } catch {
    throw new Error('Malformed Azure native teardown absence evidence');
  }
  if (exists !== false) throw new Error('Azure native resource group retirement has not converged');
  return { status: 'retired', absence: 'absent' };
}

// plugins/azure/src/tools/azure-ce-teardown.ts
var defaults = {
  platform: azurePlatformService,
  terraform: azureTerraformService,
  contract: (signal) => VerifiedIngressContract.release(fetch, signal),
  prepare: prepareAzureTerraformTeardown,
  run: runAzureTerraformTeardown,
  prepareNative: prepareAzureNativeTeardown,
  runNative: runAzureNativeTeardown,
  applyNative: executeAzureCeNativeApply2,
  makeApi: makeExecApi,
};
var optional7 = async (storage, name) => {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
};
function createAzureCeTeardownTool(pi, dependencies = defaults) {
  const { Type } = pi.typebox;
  return {
    name: 'azure_ce_teardown',
    label: 'Teardown Azure Customer Edge',
    description:
      'Prepare or apply an immutable native or Terraform Azure Customer Edge teardown. It drains platform resources, retires the exact cloud resources, enrollment and site identities, and verifies absence and private staging retirement.',
    parameters: Type.Object({
      operation: Type.Union([Type.Literal('prepare'), Type.Literal('apply')]),
      basePlanId: Type.String(),
      basePlanSha256: Type.String(),
      teardownPlanId: Type.Optional(Type.String()),
      teardownPlanSha256: Type.Optional(Type.String()),
      cloudPlanId: Type.Optional(Type.String()),
      cloudPlanSha256: Type.Optional(Type.String()),
    }),
    async execute(_id, params, signal, _update, ctx) {
      let release;
      try {
        const allowed =
          params.operation === 'prepare'
            ? ['basePlanId', 'basePlanSha256', 'cloudPlanId', 'cloudPlanSha256', 'operation']
            : ['basePlanId', 'basePlanSha256', 'operation', 'teardownPlanId', 'teardownPlanSha256'];
        if (Object.keys(params).some((key) => !allowed.includes(key)))
          throw new Error(`Azure CE teardown ${params.operation} parameters differ`);
        const { plan } = await loadPlanArtifact(ctx.sessionManager, params.basePlanId, params.basePlanSha256);
        if (plan.intent.operation !== 'deploy')
          throw new Error('Azure CE teardown requires the original deployment plan');
        const platform = await dependencies.platform(pi, signal);
        const storage = await platform.storage(azureUpgradeBinding(plan).owner);
        if (plan.engine === 'terraform')
          release = await acquireProcessLock(join37(storage.directory, '.azure-terraform-lifecycle-lock'));
        const runtime = await platform.runtime(plan.engine, plan.intent.platformContext);
        const contract = await dependencies.contract(signal);
        if (params.operation === 'prepare') {
          const cloud =
            plan.engine === 'native' && params.cloudPlanId && params.cloudPlanSha256
              ? (await loadPlanArtifact(ctx.sessionManager, params.cloudPlanId, params.cloudPlanSha256)).plan
              : undefined;
          if (plan.engine === 'native' && !cloud)
            throw new Error('Native Azure teardown requires the exact reviewed cloud teardown plan');
          if (plan.engine === 'terraform' && (params.cloudPlanId || params.cloudPlanSha256))
            throw new Error('Terraform Azure teardown does not accept a separate cloud plan');
          const teardown =
            plan.engine === 'terraform'
              ? await dependencies.prepare(plan, runtime, contract, storage, signal)
              : await dependencies.prepareNative(plan, cloud, runtime, contract, storage, signal);
          const artifactId = await ctx.sessionManager.saveArtifact(
            JSON.stringify({
              kind: teardown.kind,
              engine: teardown.engine,
              planId: teardown.planId,
              planSha256: teardown.planSha256,
              sourcePlanSha256: teardown.sourcePlanSha256,
              siteCount: teardown.retirement.length,
              listenerCount: teardown.drain.listeners.length,
              originCount: teardown.drain.origins.length,
              routingCount: teardown.drain.sites.reduce((sum, site) => sum + site.routing.length, 0),
            }),
            'azure-ce-teardown-plan',
          );
          if (!artifactId) throw new Error('Azure CE teardown plan artifact persistence failed');
          return {
            content: [
              {
                type: 'text',
                text: `Teardown plan ID: ${teardown.planId}
SHA-256: ${teardown.planSha256}
Artifact: artifact://${artifactId}`,
              },
            ],
            details: {
              tool: 'azure_ce_teardown',
              operation: 'prepare',
              artifactId,
              planId: teardown.planId,
              planSha256: teardown.planSha256,
            },
          };
        }
        if (!params.teardownPlanId || !params.teardownPlanSha256)
          throw new Error('Azure CE teardown apply requires the exact teardown plan identity');
        const teardown = await storage.read(`${params.teardownPlanId}.json`);
        if (
          teardown.planId !== params.teardownPlanId ||
          !safeHexEqual(teardown.planSha256, params.teardownPlanSha256) ||
          teardown.sourcePlanSha256 !== plan.planSha256
        )
          throw new Error('Persisted Azure CE teardown plan identity differs');
        const authorizationName = `${teardown.planId}-authorization.json`;
        const authorization = await optional7(storage, authorizationName);
        if (authorization === undefined) {
          if (ctx.hasUI) {
            if (
              !(await ctx.ui.confirm(
                'Apply immutable Azure CE teardown plan',
                `${teardown.planId}
${teardown.planSha256}`,
              ))
            )
              throw new Error('Azure CE teardown was not approved');
          } else if (process.env.XCSH_CE_HEADLESS_MUTATIONS !== '1' || process.env.XCSH_CE_ALLOW_DESTROY !== '1') {
            throw new Error('Headless Azure CE teardown requires mutation and destroy authorization');
          }
          await storage.write(authorizationName, {
            schemaVersion: 1,
            engine: plan.engine,
            sourcePlanSha256: plan.planSha256,
            teardownPlanSha256: teardown.planSha256,
            mutations: true,
          });
        } else if (
          !authorization ||
          typeof authorization !== 'object' ||
          authorization.schemaVersion !== 1 ||
          authorization.engine !== plan.engine ||
          authorization.sourcePlanSha256 !== plan.planSha256 ||
          authorization.teardownPlanSha256 !== teardown.planSha256 ||
          authorization.mutations !== true
        ) {
          throw new Error('Persisted Azure CE teardown authorization differs');
        }
        const terraformService = plan.engine === 'terraform' ? await dependencies.terraform(pi, signal) : undefined;
        const requireTerraform = () => {
          if (!terraformService) throw new Error('Terraform teardown requires its owning service');
          return terraformService;
        };
        const result =
          plan.engine === 'terraform'
            ? await dependencies.run(
                plan,
                teardown,
                params.teardownPlanSha256,
                runtime,
                contract,
                await requireTerraform().open(
                  azureUpgradeBinding(plan).owner,
                  teardown.kind === 'azure-ce-terraform-foundation-teardown'
                    ? await azureFoundationTeardownDeployment(plan, teardown)
                    : await azureTerraformCurrentDeployment(plan),
                  'recover-initialization',
                  process.env,
                  signal,
                ),
                storage,
                dependencies.makeApi(ctx.cwd),
                process.env,
                signal,
                terraformService,
              )
            : await dependencies.runNative(
                plan,
                (await loadPlanArtifact(ctx.sessionManager, teardown.cloudPlanId, teardown.cloudPlanSha256)).plan,
                teardown,
                params.teardownPlanSha256,
                runtime,
                contract,
                storage,
                async (signal) => {
                  const native = teardown;
                  const { plan: cloud } = await loadPlanArtifact(
                    ctx.sessionManager,
                    native.cloudPlanId,
                    native.cloudPlanSha256,
                  );
                  if (!(await loadCheckpoint(ctx.sessionManager, cloud)))
                    await saveCheckpoint(ctx.sessionManager, cloud, {
                      schemaVersion: AZURE_CE_CHECKPOINT_SCHEMA_VERSION,
                      engine: 'native',
                      authorization: { apply: true, terms: false, destroy: true },
                      planId: cloud.planId,
                      planSha256: cloud.planSha256,
                      completedActionIds: [],
                      state: 'running',
                    });
                  const api = withAzureCeExecution(dependencies.makeApi(ctx.cwd), signal);
                  const applied = await dependencies.applyNative(
                    { planId: cloud.planId, planSha256: cloud.planSha256 },
                    ctx,
                    api,
                    async () => platform,
                    signal,
                  );
                  if (applied.checkpoint.state !== 'complete')
                    throw new Error('Azure native cloud teardown remains partial');
                  return observeAzureNativeGroupAbsence(plan, api, signal);
                },
                signal,
                withAzureCeExecution(dependencies.makeApi(ctx.cwd), signal),
              );
        const artifactId = await ctx.sessionManager.saveArtifact(
          JSON.stringify(result),
          'azure-ce-teardown-checkpoint',
        );
        if (!artifactId) throw new Error('Azure CE teardown checkpoint artifact persistence failed');
        return {
          content: [{ type: 'text', text: `Azure CE teardown ${plan.deploymentName}: ${result.status}.` }],
          details: { tool: 'azure_ce_teardown', operation: 'apply', artifactId, ...result },
        };
      } catch (error) {
        signal?.throwIfAborted();
        return {
          content: [
            {
              type: 'text',
              text: `Azure CE teardown failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'azure_ce_teardown', operation: params.operation },
        };
      } finally {
        await release?.();
      }
    },
  };
}

export { createAzureCeTeardownTool };
