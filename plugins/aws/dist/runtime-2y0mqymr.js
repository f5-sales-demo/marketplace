// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun

// plugins/aws/src/ce/native-creation-reader.ts
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  acquireProcessLock,
  loadAwsCheckpoint,
  loadAwsPlan,
  saveAwsCheckpoint,
  verifyAwsCePlan,
} from './runtime-2srcqb9f.js';
import { AwsNotFoundError, detectAwsError, execAwsJson, makeExecApi } from './runtime-30f0rzjf.js';
import { awsPlatformService, observeAwsResources, validateInitialRegistrationRetirement } from './runtime-34m2wbsj.js';
import { scopedAwsApi } from './runtime-fex55vat.js';
import {
  evidencePasses,
  powerServiceComponentSha256,
  reviseAwsTerraformDirectServiceRoutes,
  reviseAwsTerraformNlbMembership,
  reviseAwsTerraformPowerConfiguration,
  reviseAwsTerraformStaticServiceRoutes,
  validateAwsBgpPowerPreparation,
  validateAwsTerraformDirectServiceReceipt,
  validateAwsTerraformNlbMembershipReceipt,
  validateAwsTerraformPowerReceipt,
  validateAwsTerraformStaticServiceReceipt,
  verifyAwsWholeSitePowerPlan,
} from './runtime-g5vyk8tm.js';
import {
  awsCeRevalidationDiagnostic,
  awsTerraformFoundationDeployment,
  awsTerraformService,
  beginAwsTerraformRetirement,
  collectAwsNativeCloudRetirement,
  executeAwsCeApply,
  loadAwsTerraformBrownfieldBinding,
  observeAwsTerraformDirectPhase,
  prepareAwsTerraformBrownfieldBinding,
  renderAwsTerraformDirectTransition,
  terraformPreflightReferences,
  VerifiedIngressContract,
  VerifiedUpgradeContract,
  withAwsNativeOperation,
  withAwsTerraformLifecycle,
} from './runtime-g9xhhtaz.js';
import { AWS_CE_PROVIDER_LOCK_SHA256, siteBindings, siteForNode, siteTopology } from './runtime-s4v0smk7.js';
import { verifyAwsTerraformUpgrade } from './runtime-wegex2sv.js';
import { canonicalSha256, safeHexEqual, sha256Hex } from './runtime-wvre8ba5.js';

// plugins/aws/src/ce/native-creation-projection.ts
function projectAwsNativeInitialCreation(plan, checkpoints) {
  verifyAwsCePlan(plan);
  const selected = siteBindings(plan);
  if (
    plan.engine !== 'native' ||
    plan.intent.operation !== 'deploy' ||
    selected.length !== 1 ||
    selected[0].site.nodeIndexes.join(',') !== '1' ||
    selected[0].binding.nodes.length !== 1
  )
    throw Error('Original native pending creation requires exactly one native node');
  const matching = checkpoints.filter((c) => c.planId === plan.planId && c.planSha256 === plan.planSha256);
  if (!matching.length) throw Error('Original native creation checkpoint is unavailable');
  const actionIds = plan.actions.map((a) => a.id);
  const run = plan.actions.filter((a) => a.kind === 'instance-run' && a.node === 1);
  if (run.length !== 1) throw Error('Original native instance creation action is ambiguous');
  const runIndex = actionIds.indexOf(run[0].id);
  const projections = [];
  for (const c of matching) {
    if (
      c.schemaVersion !== 2 ||
      c.engine !== 'native' ||
      c.authorization?.planSha256 !== plan.planSha256 ||
      c.authorization.mutations !== true ||
      !['running', 'partial', 'complete'].includes(c.state) ||
      !Array.isArray(c.completedActionIds) ||
      canonicalSha256(c.completedActionIds) !== canonicalSha256(actionIds.slice(0, c.completedActionIds.length)) ||
      (c.childPlanSha256s?.length ?? 0) ||
      !c.resolvedValues ||
      typeof c.resolvedValues !== 'object' ||
      Array.isArray(c.resolvedValues)
    )
      throw Error('Original native creation checkpoint is malformed, conflicting, or replaced');
    if (c.completedActionIds.some((id) => plan.actions.some((a) => a.id === id && a.phase === 'registration')))
      throw Error('Original native admission has advanced beyond pending retirement');
    if (c.completedActionIds.length <= runIndex) continue;
    if (c.pendingCreate || c.pendingDelete) throw Error('Original native creation outcome remains ambiguous');
    const instanceId = c.resolvedValues.__INSTANCE_1__;
    if (!/^i-[0-9a-f]{8,17}$/.test(instanceId ?? '')) throw Error('Original native instance identifier is unresolved');
    const interfaces = plan.interfaces.map((iface) => {
      const id = c.resolvedValues[`__ENI_1_${iface.index}__`];
      const mac = c.resolvedValues[`__ENI_1_${iface.index}_MAC__`];
      if (
        !['slo', 'sli'].includes(iface.role) ||
        !/^eni-[0-9a-f]{8,17}$/.test(id ?? '') ||
        !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac ?? '') ||
        !iface.guestDevice
      )
        throw Error('Original native interface identifier, MAC, role or device is unresolved');
      return { index: iface.index, role: iface.role, id, mac, device: iface.guestDevice };
    });
    if (
      new Set(interfaces.map((i) => i.id)).size !== interfaces.length ||
      new Set(interfaces.map((i) => i.mac)).size !== interfaces.length ||
      new Set(interfaces.map((i) => i.device)).size !== interfaces.length
    )
      throw Error('Original native interface identities are duplicated');
    projections.push({
      schemaVersion: 1,
      engine: 'native',
      sourcePlanId: plan.planId,
      sourcePlanSha256: plan.planSha256,
      ownerSha256: canonicalSha256(selected[0].binding.owner),
      node: selected[0].binding.nodes[0],
      instanceId,
      instanceActionId: run[0].id,
      imageId: plan.image.id,
      interfaces,
    });
  }
  if (!projections.length) throw Error('Original native instance creation has not been recorded');
  if (new Set(projections.map(canonicalSha256)).size !== 1)
    throw Error('Original native creation identities conflict across checkpoints');
  return projections[0];
}

// plugins/aws/src/ce/native-creation-reader.ts
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Original native cloud response is malformed');
  return value;
}
async function readAwsNativeInitialCreation(plan, manager, rawApi, signal) {
  const directory = manager.getArtifactsDir();
  if (!directory) throw Error('Original native checkpoint directory is unavailable');
  const snapshot = async () => {
    signal?.throwIfAborted();
    const checkpoints = [];
    for (const name of (await readdir(directory)).filter((n) => n.endsWith('.aws-ce-checkpoint.log'))) {
      const path = join(directory, name),
        info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid?.() || info.nlink !== 1)
        throw Error('Original native checkpoint file ownership differs');
      let envelope;
      try {
        envelope = object(JSON.parse(await readFile(path, 'utf8')));
      } catch {
        throw Error('Original native checkpoint collection is malformed');
      }
      if (envelope.kind !== 'aws-ce-checkpoint') throw Error('Original native checkpoint envelope differs');
      const c = object(envelope.checkpoint);
      if (c.planId === plan.planId && c.planSha256 === plan.planSha256) checkpoints.push(c);
    }
    return projectAwsNativeInitialCreation(plan, checkpoints);
  };
  const before = await snapshot(),
    api = scopedAwsApi(rawApi, plan.intent.awsProfile, signal);
  const result = await api.exec('aws', ['sts', 'get-caller-identity', '--region', plan.region, '--output', 'json'], {
    signal,
  });
  if (result.exitCode !== 0) throw Error('Original native cloud identity is unavailable');
  const identity = object(JSON.parse(result.stdout));
  if (
    identity.Account !== plan.accountId ||
    typeof identity.Arn !== 'string' ||
    !identity.Arn.startsWith(`arn:${plan.partition}:`) ||
    identity.Arn.split(':')[4] !== plan.accountId
  )
    throw Error('Original native cloud account or partition differs');
  const ids = [before.instanceId, ...before.interfaces.map((i) => i.id)];
  const observed = await observeAwsResources(api, ids, plan.region, {
    deploymentName: plan.deploymentName,
    planSha256s: [plan.planSha256],
  });
  if (observed.length !== ids.length || new Set(observed.map((r) => r.id)).size !== ids.length)
    throw Error('Original native hardware inventory is partial or duplicated');
  const binding = siteBindings(plan)[0].binding;
  for (const resource of observed) {
    if (
      !ids.includes(resource.id) ||
      !resource.exists ||
      !resource.owned ||
      resource.region !== plan.region ||
      resource.tags['xcsh-execution-engine'] !== 'native' ||
      resource.tags['xcsh-plan-sha256'] !== plan.planSha256 ||
      resource.tags['ves-io-site-name'] !== binding.siteName ||
      resource.tags['xcsh-node-index'] !== '1'
    )
      throw Error('Original native hardware ownership differs');
  }
  const vm = observed.find((r) => r.id === before.instanceId);
  const reservations = vm?.state.Reservations;
  if (!Array.isArray(reservations) || reservations.length !== 1)
    throw Error('Original native instance reservation is incomplete');
  const reservation = object(reservations[0]);
  if (
    reservation.OwnerId !== plan.accountId ||
    !Array.isArray(reservation.Instances) ||
    reservation.Instances.length !== 1
  )
    throw Error('Original native instance reservation owner differs');
  const instance = object(reservation.Instances[0]);
  if (
    instance.InstanceId !== before.instanceId ||
    instance.ImageId !== before.imageId ||
    !['pending', 'running', 'stopping', 'stopped'].includes(String(object(instance.State).Name))
  )
    throw Error('Original native instance/image identity differs or has retired');
  const attached = instance.NetworkInterfaces;
  if (
    !Array.isArray(attached) ||
    attached.length !== before.interfaces.length ||
    new Set(attached.map((r) => object(r).NetworkInterfaceId)).size !== attached.length
  )
    throw Error('Original native instance interface coverage is incomplete');
  for (const iface of before.interfaces) {
    const resource = observed.find((r) => r.id === iface.id),
      list = resource?.state.NetworkInterfaces;
    if (
      !resource ||
      resource.tags['xcsh-interface-index'] !== String(iface.index) ||
      !Array.isArray(list) ||
      list.length !== 1
    )
      throw Error('Original native interface snapshot is incomplete');
    const live = object(list[0]),
      attachment = object(live.Attachment);
    if (
      live.NetworkInterfaceId !== iface.id ||
      live.MacAddress !== iface.mac ||
      live.OwnerId !== plan.accountId ||
      attachment.InstanceId !== before.instanceId ||
      attachment.DeviceIndex !== iface.index ||
      attachment.Status !== 'attached' ||
      !attached.some(
        (r) => object(r).NetworkInterfaceId === iface.id && object(object(r).Attachment).DeviceIndex === iface.index,
      )
    )
      throw Error('Original native node/interface/MAC/device-index join differs');
  }
  const after = await snapshot();
  if (canonicalSha256(before) !== canonicalSha256(after))
    throw Error('Original native creation identity changed during current hardware collection');
  signal?.throwIfAborted();
  return before;
}

// plugins/aws/src/ce/native-bootstrap-retirement.ts
// plugins/platform/src/ce/token-store.ts
import { createHash, createHash as createHash2, randomUUID } from 'node:crypto';
import {
  chmod,
  lstat as lstat2,
  lstat as lstat3,
  mkdir,
  readdir as readdir2,
  readdir as readdir3,
  readFile as readFile2,
  readFile as readFile3,
  realpath,
  realpath as realpath2,
  rename,
  rmdir,
  unlink,
  unlink as unlink2,
  writeFile,
} from 'node:fs/promises';
// plugins/aws/src/ce/native-teardown.ts
import { isAbsolute, join as join2, join as join3, join as join9, resolve, sep } from 'node:path';

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
  const directory = join2(binding.root, session, id);
  for (const path of [binding.root, join2(binding.root, session), directory]) {
    assertWithin(binding.root, path);
    const stat = await lstat2(path);
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
    const path = join2(directory, name),
      stat = await lstat2(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      stat.uid !== binding.uid ||
      (stat.mode & 511) !== 384
    )
      throw Error('Bootstrap retirement file differs');
    return readFile2(path);
  };
  const names = await readdir2(directory);
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
    const temporary = join2(directory, `metadata-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify(value), { mode: 384, flag: 'wx' });
      await rename(temporary, join2(directory, 'metadata.json'));
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
    await unlink(join2(directory, 'token'));
  }
  signal?.throwIfAborted();
  if (!metadata.retirement)
    await persist({ ...metadata, consumed: true, retirementPending: receipt, retirement: receipt });
  return receipt;
}

// plugins/aws/src/ce/native-bootstrap-retirement.ts
var markerName = 'aws-native-bootstrap-retirement.json';
var hash = (body) => createHash2('sha256').update(body).digest('hex');
var object2 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Native credential binding is malformed');
  return value;
};
async function optional(read) {
  try {
    return await read();
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
}
async function directory(path) {
  const info = await lstat3(path);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    info.uid !== process.getuid?.() ||
    (info.mode & 511) !== 448 ||
    (await realpath2(path)) !== path
  )
    throw Error('Native credential directory ownership differs');
}
async function file(path) {
  const info = await lstat3(path);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.nlink !== 1 ||
    info.uid !== process.getuid?.() ||
    (info.mode & 511) !== 384 ||
    info.size > 2 * 1024 * 1024 ||
    (await realpath2(path)) !== path
  )
    throw Error('Native credential file ownership differs');
  return readFile3(path);
}
async function retireAwsNativeBootstrapCredentials(base, plan, store, signal) {
  signal?.throwIfAborted();
  await store.verify();
  if (
    base.engine !== 'native' ||
    store.owner.engine !== 'native' ||
    store.owner.provider !== 'aws' ||
    plan.sourcePlanSha256 !== base.planSha256 ||
    canonicalSha256(store.owner) !== canonicalSha256(plan.drain.owner)
  )
    throw Error('Native credential retirement owner differs');
  const evidence = {
    owner: store.owner,
    sourcePlanSha256: base.planSha256,
    teardownPlanSha256: plan.planSha256,
    cloudPlanSha256: plan.cloudPlanSha256,
    retirement: plan.retirement,
  };
  const evidenceSha256 = canonicalSha256(evidence);
  const tokens = new Map(
    plan.retirement.flatMap((site) => site.tokens.map((token) => [token.name, { ...token, siteName: site.siteName }])),
  );
  if (tokens.size !== plan.retirement.reduce((count, site) => count + site.tokens.length, 0))
    throw Error('Native token retirement inventory is duplicated');
  let marker = await optional(() => store.read(markerName));
  if (!marker) {
    const items = [];
    const emptyDirectories = [];
    const digests = new Map();
    for (const [name, expected] of tokens) {
      const bytes = await optional(() => file(join3(store.directory, `${name}.json`)));
      if (!bytes) continue;
      const value = object2(await store.read(`${name}.json`));
      if (
        value.tokenName !== name ||
        value.node !== expected.node ||
        value.siteName !== expected.siteName ||
        typeof value.jwt !== 'string' ||
        !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.jwt)
      )
        throw Error('Native issued-token checkpoint differs');
      digests.set(name, { node: expected.node, digest: hash(value.jwt) });
      items.push({
        path: `${name}.json`,
        kind: 'token',
        sha256: hash(bytes),
        tokenName: name,
        node: expected.node,
        siteName: expected.siteName,
        tokenDigest: hash(value.jwt),
      });
    }
    for (const name of (await readdir3(store.directory)).sort()) {
      if (name.endsWith('.json') && !tokens.has(name.slice(0, -5))) {
        const candidate = object2(await store.read(name));
        if (Object.hasOwn(candidate, 'jwt')) throw Error('Unbound native token checkpoint blocks retirement');
      }
      if (/^bootstrap-checkout-[a-f0-9-]{36}\.json$/.test(name)) {
        const value = object2(await store.read(name)),
          checkout = object2(value.checkout);
        const site = plan.retirement.find((item) => item.siteUid === value.siteUid);
        const binding = siteBindings(base).find((item) => item.binding.siteName === site?.siteName)?.binding;
        const token = tokens.get(String(value.tokenName)),
          issued = digests.get(String(value.tokenName));
        if (
          value.schemaVersion !== 1 ||
          !site ||
          !binding ||
          !token ||
          !issued ||
          canonicalSha256(value.owner) !== canonicalSha256(store.owner) ||
          canonicalSha256(value.binding) !== canonicalSha256(binding) ||
          value.node !== token.node ||
          token.siteName !== site.siteName ||
          value.contractFingerprint !== plan.drain.siteContractFingerprint ||
          checkout.digest !== issued.digest ||
          name !== `bootstrap-checkout-${String(checkout.reference).split('/').at(-1)}.json`
        )
          throw Error('Native opaque checkout provenance differs');
        items.push({
          path: name,
          kind: 'checkout',
          tokenName: token.name,
          node: token.node,
          siteName: token.siteName,
          tokenDigest: issued.digest,
          sha256: hash(await file(join3(store.directory, name))),
          checkout,
        });
      } else if (/^node-[A-Za-z0-9]{6}$/.test(name)) {
        const path = join3(store.directory, name);
        await directory(path);
        if ((await readdir3(path)).length === 0) {
          const info = await lstat3(path);
          emptyDirectories.push({ path: name, inode: info.ino, device: info.dev });
          continue;
        }
        if (JSON.stringify((await readdir3(path)).sort()) !== JSON.stringify(['cloud-init.yaml']))
          throw Error('Native launch staging inventory differs');
        const bytes = await file(join3(path, 'cloud-init.yaml'));
        let document, token;
        try {
          document = object2(Bun.YAML.parse(bytes.toString()));
          const files = document.write_files;
          if (!Array.isArray(files)) throw Error();
          const userData = files.map(object2).filter((item) => item.path === '/etc/vpm/user_data');
          if (userData.length !== 1 || typeof userData[0].content !== 'string') throw Error();
          token = object2(Bun.YAML.parse(userData[0].content)).token;
        } catch {
          throw Error('Native launch staging is malformed');
        }
        if (
          typeof token !== 'string' ||
          ![...digests.values()].some((item) => item.node === document.hostname && item.digest === hash(token))
        )
          throw Error('Native launch staging token or node differs');
        const matched = [...digests.entries()].find(
          ([, item]) => item.node === document.hostname && item.digest === hash(token),
        );
        if (!matched) throw Error('Native launch staging binding is missing');
        const expected = tokens.get(matched[0]);
        if (!expected) throw Error('Native launch token inventory differs');
        items.push({
          path: `${name}/cloud-init.yaml`,
          kind: 'cloud-init',
          sha256: hash(bytes),
          tokenName: matched[0],
          node: expected.node,
          siteName: expected.siteName,
          tokenDigest: matched[1].digest,
        });
      }
    }
    marker = {
      schemaVersion: 2,
      evidenceSha256,
      items,
      emptyDirectories,
      inventorySha256: canonicalSha256({ items, emptyDirectories }),
      status: 'retiring',
    };
    await store.write(markerName, marker, signal);
  }
  if (
    marker.schemaVersion !== 2 ||
    marker.evidenceSha256 !== evidenceSha256 ||
    !Array.isArray(marker.items) ||
    !Array.isArray(marker.emptyDirectories) ||
    marker.inventorySha256 !== canonicalSha256({ items: marker.items, emptyDirectories: marker.emptyDirectories }) ||
    !['retiring', 'retired'].includes(marker.status)
  )
    throw Error('Native credential retirement journal differs');
  if (new Set(marker.items.map((item) => item.path)).size !== marker.items.length)
    throw Error('Native credential inventory paths are duplicated');
  for (const item of marker.items) {
    const expected = tokens.get(item.tokenName);
    if (
      !expected ||
      item.node !== expected.node ||
      item.siteName !== expected.siteName ||
      !/^[a-f0-9]{64}$/.test(item.tokenDigest) ||
      !['token', 'checkout', 'cloud-init'].includes(item.kind) ||
      (item.kind === 'token' && item.path !== `${item.tokenName}.json`) ||
      (item.kind === 'checkout' &&
        (!item.checkout ||
          item.checkout.digest !== item.tokenDigest ||
          item.path !== `bootstrap-checkout-${item.checkout.reference.split('/').at(-1)}.json`)) ||
      (item.kind === 'cloud-init' && !item.path.endsWith('/cloud-init.yaml'))
    )
      throw Error('Native credential journal target differs');
    if (
      !/^(?:[a-z][a-z0-9-]{0,62}\.json|bootstrap-checkout-[a-f0-9-]{36}\.json|node-[A-Za-z0-9]{6}\/cloud-init\.yaml)$/.test(
        item.path,
      ) ||
      !/^[a-f0-9]{64}$/.test(item.sha256)
    )
      throw Error('Native credential retirement path differs');
    const bytes = await optional(() => file(join3(store.directory, item.path)));
    if (bytes && hash(bytes) !== item.sha256) throw Error('Native credential staging changed after preparation');
  }
  const emptyPaths = new Set();
  for (const item of marker.emptyDirectories) {
    if (
      !/^node-[A-Za-z0-9]{6}$/.test(item.path) ||
      emptyPaths.has(item.path) ||
      !Number.isSafeInteger(item.inode) ||
      !Number.isSafeInteger(item.device) ||
      marker.items.some((file) => file.path.startsWith(`${item.path}/`))
    )
      throw Error('Native empty launch directory journal differs');
    emptyPaths.add(item.path);
    const path = join3(store.directory, item.path),
      info = await optional(() => lstat3(path));
    if (info) {
      await directory(path);
      if (info.ino !== item.inode || info.dev !== item.device || (await readdir3(path)).length)
        throw Error('Native empty launch directory changed after preparation');
    }
  }
  for (const item of marker.items.filter((item) => item.kind === 'checkout')) {
    signal?.throwIfAborted();
    if (!item.checkout) throw Error('Native checkout retirement binding is missing');
    await retireBootstrapToken(item.checkout, evidenceSha256, signal);
  }
  for (const item of marker.items) {
    signal?.throwIfAborted();
    await store.verify();
    const path = join3(store.directory, item.path),
      bytes = await optional(() => file(path));
    if (bytes && hash(bytes) !== item.sha256) throw Error('Native credential staging changed before retirement');
    if (bytes) await unlink2(path);
    if (item.kind === 'cloud-init') {
      const parent = join3(store.directory, item.path.split('/')[0]);
      if (await optional(() => lstat3(parent))) {
        await directory(parent);
        await rmdir(parent);
      }
    }
  }
  for (const item of marker.emptyDirectories) {
    signal?.throwIfAborted();
    await store.verify();
    const path = join3(store.directory, item.path),
      info = await optional(() => lstat3(path));
    if (info) {
      await directory(path);
      if (info.ino !== item.inode || info.dev !== item.device || (await readdir3(path)).length)
        throw Error('Native empty launch directory changed before retirement');
      await rmdir(path);
    }
  }
  for (const name of await readdir3(store.directory)) {
    if (/^bootstrap-checkout-[a-f0-9-]{36}\.json$/.test(name) || /^node-[A-Za-z0-9]{6}$/.test(name))
      throw Error('New native credential staging blocks completion');
    if (name.endsWith('.json') && Object.hasOwn(object2(await store.read(name)), 'jwt'))
      throw Error('Remaining native token checkpoint blocks completion');
  }
  await store.write(markerName, { ...marker, status: 'retired' }, signal);
  return {
    status: 'bootstrap-credentials-retired',
    evidenceSha256,
    inventorySha256: marker.inventorySha256,
    retiredArtifacts: marker.items.length + marker.emptyDirectories.length,
  };
}

// plugins/aws/src/ce/native-reservation-teardown.ts
import { join as join4 } from 'node:path';

var text = (value) => typeof value === 'string' && !!value.trim();
var name = (value) => typeof value === 'string' && /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
var pointer = 'aws-native-reservation-teardown.json';
async function optional2(storage, path) {
  try {
    return await storage.read(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
function scope(base, cloud) {
  verifyAwsCePlan(base);
  verifyAwsCePlan(cloud);
  const sites = siteBindings(base);
  const intent = { ...base.intent, operation: 'teardown' };
  delete intent.replacementNode;
  if (
    base.engine !== 'native' ||
    base.intent.operation === 'teardown' ||
    cloud.engine !== 'native' ||
    cloud.intent.operation !== 'teardown' ||
    sites.length !== 1 ||
    sites[0].binding.nodes.length !== 1 ||
    canonicalSha256(intent) !== canonicalSha256(cloud.intent) ||
    canonicalSha256(base.rollback.resources) !== canonicalSha256(cloud.rollback.resources) ||
    cloud.actions.length ||
    cloud.ownershipInventory.some((row) => row.owned)
  )
    throw Error('Native reservation requires exact single-node source and empty cloud teardown plans');
  return sites[0].binding;
}
function assertAwsNativePreRegistrationInventory(value, binding, fingerprints) {
  if (
    value.status !== 'observed' ||
    canonicalSha256(value.owner) !== canonicalSha256(binding.owner) ||
    value.siteContractFingerprint !== fingerprints.site ||
    value.ingressContractFingerprint !== fingerprints.ingress ||
    !Array.isArray(value.sites) ||
    value.sites.length !== 1 ||
    !Array.isArray(value.resources) ||
    !Array.isArray(value.sources) ||
    !value.sources.length
  )
    throw Error('Native reservation inventory is unavailable or differs from ownership');
  const site = value.sites[0];
  if (
    site.siteName !== binding.siteName ||
    !(site.siteUid === null || text(site.siteUid)) ||
    !(site.physicalSiteUid === null || text(site.physicalSiteUid))
  )
    throw Error('Native reservation site identity is incomplete');
  const uids = new Set();
  for (const uid of [site.siteUid, site.physicalSiteUid])
    if (uid !== null) {
      if (uids.has(uid)) throw Error('Duplicate native reservation UID');
      uids.add(uid);
    }
  const names = new Set();
  for (const resource of value.resources) {
    if (
      resource.kind !== 'tokens' ||
      !name(resource.name) ||
      !text(resource.uid) ||
      resource.namespace !== 'system' ||
      resource.siteName !== binding.siteName ||
      !binding.nodes.includes(String(resource.node)) ||
      names.has(resource.name) ||
      uids.has(resource.uid)
    )
      throw Error('Native reservation token inventory is foreign, duplicate, or post-admission');
    names.add(resource.name);
    uids.add(resource.uid);
  }
}
function assertAwsNativeInventoryFresh(value) {
  const observed = Date.parse(value.observedAt),
    started = Date.parse(value.startedAt);
  if (
    !Number.isFinite(observed) ||
    !Number.isFinite(started) ||
    started > observed ||
    observed > Date.now() ||
    Date.now() - started > 60000
  )
    throw Error('Native reservation collection is stale');
}
function compileAwsNativeReservationTeardown(base, cloud, inventory) {
  const binding = scope(base, cloud);
  assertAwsNativePreRegistrationInventory(inventory, binding, {
    site: inventory.siteContractFingerprint,
    ingress: inventory.ingressContractFingerprint,
  });
  if (
    !text(inventory.siteContractFingerprint) ||
    !text(inventory.ingressContractFingerprint) ||
    !text(inventory.sites[0].siteUid)
  )
    throw Error('Native reservation original logical UID is required');
  const site = inventory.sites[0];
  const draft = {
    schemaVersion: 1,
    kind: 'aws-ce-native-reservation-teardown',
    engine: 'native',
    sourcePlanSha256: base.planSha256,
    cloudPlanId: cloud.planId,
    cloudPlanSha256: cloud.planSha256,
    drain: {
      schemaVersion: 1,
      owner: binding.owner,
      sourcePlanSha256: base.planSha256,
      siteContractFingerprint: inventory.siteContractFingerprint,
      ingressContractFingerprint: inventory.ingressContractFingerprint,
      listeners: [],
      origins: [],
      sites: [{ binding, siteUid: site.siteUid, routing: [] }],
    },
    retirement: [
      {
        siteName: site.siteName,
        siteUid: site.siteUid,
        physicalSiteUid: site.physicalSiteUid,
        tokens: inventory.resources.map((r) => ({ node: r.node, name: r.name })),
      },
    ],
    reservationInventory: structuredClone(inventory),
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-native-reservation-teardown-${planSha256.slice(0, 24)}`, planSha256 };
}
async function prepareAwsNativeReservationTeardown(base, cloud, runtime, contract, storage, signal) {
  const old = await optional2(storage, pointer);
  if (old !== undefined) {
    const plan = old;
    const compiled = compileAwsNativeReservationTeardown(base, cloud, plan.reservationInventory);
    if (
      canonicalSha256(plan) !== canonicalSha256(compiled) ||
      plan.drain.siteContractFingerprint !== runtime.contract.fingerprint ||
      plan.drain.ingressContractFingerprint !== contract.fingerprint ||
      canonicalSha256(storage.owner) !== canonicalSha256(plan.drain.owner)
    )
      throw Error('Persisted native reservation retirement differs');
    return plan;
  }
  if (
    cloud.actions.length ||
    cloud.ownershipInventory.some((r) => r.owned) ||
    siteBindings(base).length !== 1 ||
    siteBindings(base)[0].binding.nodes.length !== 1
  )
    return;
  const binding = scope(base, cloud);
  await storage.verify();
  if (runtime.engine !== 'native' || canonicalSha256(storage.owner) !== canonicalSha256(binding.owner))
    throw Error('Native reservation deployment owner differs');
  const inventory = await runtime.preRegistrationInventory([binding], ['default'], contract, signal);
  if (inventory.status !== 'observed') return;
  assertAwsNativePreRegistrationInventory(inventory, binding, {
    site: runtime.contract.fingerprint,
    ingress: contract.fingerprint,
  });
  assertAwsNativeInventoryFresh(inventory);
  if (!text(inventory.sites[0].siteUid)) return;
  if (
    inventory.sites[0].physicalSiteUid !== null &&
    binding.nodes.every((node) => inventory.resources.some((r) => r.node === node))
  )
    return;
  const second = await runtime.preRegistrationInventory([binding], ['default'], contract, signal);
  assertAwsNativePreRegistrationInventory(second, binding, {
    site: runtime.contract.fingerprint,
    ingress: contract.fingerprint,
  });
  assertAwsNativeInventoryFresh(second);
  if (
    canonicalSha256({ sites: inventory.sites, resources: inventory.resources }) !==
    canonicalSha256({ sites: second.sites, resources: second.resources })
  )
    throw Error('Native reservation inventory changed during preparation');
  const plan = compileAwsNativeReservationTeardown(base, cloud, second);
  await storage.write(`${plan.planId}.json`, plan, signal);
  await storage.write(pointer, plan, signal);
  return plan;
}
async function runAwsNativeReservationTeardown(
  base,
  cloud,
  input,
  authorized,
  runtime,
  contract,
  storage,
  retireCloud,
  signal,
) {
  const plan = structuredClone(input),
    binding = scope(base, cloud);
  const expected = compileAwsNativeReservationTeardown(base, cloud, plan.reservationInventory);
  const validate = async () => {
    signal?.throwIfAborted();
    await storage.verify();
    if (
      canonicalSha256(plan) !== canonicalSha256(expected) ||
      authorized !== plan.planSha256 ||
      runtime.engine !== 'native' ||
      canonicalSha256(storage.owner) !== canonicalSha256(binding.owner) ||
      plan.drain.siteContractFingerprint !== runtime.contract.fingerprint ||
      plan.drain.ingressContractFingerprint !== contract.fingerprint
    )
      throw Error('Native reservation authorization or immutable source differs');
  };
  const observe = async () => {
    await validate();
    const current = await runtime.preRegistrationInventory([binding], ['default'], contract, signal);
    assertAwsNativePreRegistrationInventory(current, binding, {
      site: runtime.contract.fingerprint,
      ingress: contract.fingerprint,
    });
    assertAwsNativeInventoryFresh(current);
    const original = plan.reservationInventory.sites[0],
      site = current.sites[0];
    if (
      (site.siteUid !== null && site.siteUid !== original.siteUid) ||
      (site.physicalSiteUid !== null && site.physicalSiteUid !== original.physicalSiteUid)
    )
      throw Error('Native reservation identity changed; replan required');
    const match = (r) =>
      plan.reservationInventory.resources.some((expected) => canonicalSha256(r) === canonicalSha256(expected));
    if (current.resources.some((r) => !match(r))) throw Error('New native reservation token requires a new plan');
    return current;
  };
  const cloudAbsent = async () => {
    await validate();
    const receipt = await retireCloud(plan, signal);
    if (
      receipt.status !== 'native-cloud-retired' ||
      receipt.cloudPlanId !== plan.cloudPlanId ||
      receipt.cloudPlanSha256 !== plan.cloudPlanSha256 ||
      receipt.absence !== 'absent'
    )
      throw Error('Native reservation owner cloud absence is unverified');
  };
  await validate();
  return withAwsNativeOperation(storage, { kind: 'retire', cloudPlanSha256: plan.cloudPlanSha256 }, async () => {
    const release = await acquireProcessLock(join4(storage.directory, '.aws-native-teardown-lock'));
    try {
      await observe();
      await cloudAbsent();
      await observe();
      const marker = {
        schemaVersion: 1,
        engine: 'native',
        owner: binding.owner,
        sourcePlanSha256: base.planSha256,
        teardownPlanSha256: plan.planSha256,
      };
      const prior = await optional2(storage, 'aws-native-lifecycle-retirement.json');
      if (prior !== undefined && canonicalSha256(prior) !== canonicalSha256(marker))
        throw Error('Native reservation retirement belongs to another immutable teardown');
      if (prior === undefined) await storage.write('aws-native-lifecycle-retirement.json', marker, signal);
      const completed = ['platform-drained', 'native-cloud-retired'];
      for (const token of plan.retirement[0].tokens) {
        const current = await observe();
        const expectedToken = plan.reservationInventory.resources.find((r) => r.name === token.name);
        if (!expectedToken) throw Error('Native reservation token UID is missing');
        if (current.resources.some((r) => r.name === token.name))
          await runtime.deleteBootstrapTokenExact(binding, token.node, token.name, expectedToken.uid, signal);
        if ((await observe()).resources.some((r) => r.name === token.name))
          throw Error('Native reservation token deletion is pending');
        completed.push(`token:${token.name}`);
      }
      await observe();
      await runtime.deleteSiteExact(binding, plan.retirement[0].siteUid, signal);
      const after = await observe();
      if (after.sites[0].siteUid !== null || after.sites[0].physicalSiteUid !== null || after.resources.length)
        return {
          status: 'pending-site-retirement',
          siteName: binding.siteName,
          cloudInventory: 'absent',
        };
      completed.push(`site:${binding.siteName}`);
      await cloudAbsent();
      await observe();
      const credentials = await retireAwsNativeBootstrapCredentials(base, plan, storage, signal);
      const receipt = {
        status: 'ce-retired-supporting-infrastructure-unverified',
        owner: binding.owner,
        planSha256: plan.planSha256,
        sourcePlanSha256: base.planSha256,
        cloudPlanSha256: plan.cloudPlanSha256,
        completed,
        platformDrainEvidence: 'verified-empty-native-reservation',
        credentialStaging: credentials.status,
        credentialRetirementEvidenceSha256: credentials.evidenceSha256,
        cloudInventory: 'absent',
        observedAt: new Date().toISOString(),
      };
      await storage.write(`${plan.planId}-receipt.json`, receipt, signal);
      await storage.write('aws-native-teardown-receipt.json', receipt, signal);
      return receipt;
    } finally {
      await release();
    }
  });
}

// plugins/aws/src/ce/native-foundation-teardown.ts
var pointer2 = 'aws-native-foundation-teardown.json';
async function optional3(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
function binding(base, cloud) {
  const selected = validateAwsNativeCloudTeardown(base, cloud);
  const targets = cloud.ownershipInventory.filter((r) => r.owned && r.action === 'delete');
  const deletes = cloud.actions.filter((a) => a.kind === 'resource-delete');
  if (
    selected.length !== 1 ||
    selected[0].binding.nodes.length !== 1 ||
    cloud.ownershipInventory.some((r) => r.owned && r.resourceId.startsWith('i-')) ||
    new Set(targets.map((r) => r.resourceId)).size !== targets.length ||
    deletes.some((a) => targets.filter((r) => r.resourceId === a.resourceId).length !== 1) ||
    targets.some((r) => deletes.filter((a) => a.resourceId === r.resourceId).length !== 1)
  )
    throw Error('Native pre-logical foundation cloud inventory or single-node scope differs');
  return selected[0].binding;
}
function absent(inventory) {
  return (
    inventory.sites.every((s) => s.siteUid === null && s.physicalSiteUid === null) && inventory.resources.length === 0
  );
}
function compileAwsNativeFoundationTeardown(base, cloud, inventory) {
  const selected = binding(base, cloud);
  assertAwsNativePreRegistrationInventory(inventory, selected, {
    site: inventory.siteContractFingerprint,
    ingress: inventory.ingressContractFingerprint,
  });
  if (!absent(inventory)) throw Error('Native pre-logical platform absence is unverified');
  const draft = {
    schemaVersion: 1,
    kind: 'aws-ce-native-foundation-teardown',
    engine: 'native',
    sourcePlanSha256: base.planSha256,
    cloudPlanId: cloud.planId,
    cloudPlanSha256: cloud.planSha256,
    drain: {
      schemaVersion: 1,
      owner: selected.owner,
      sourcePlanSha256: base.planSha256,
      siteContractFingerprint: inventory.siteContractFingerprint,
      ingressContractFingerprint: inventory.ingressContractFingerprint,
      listeners: [],
      origins: [],
      sites: [],
    },
    retirement: [],
    platformAbsence: structuredClone(inventory),
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-native-foundation-teardown-${planSha256.slice(0, 24)}`, planSha256 };
}
async function prepareAwsNativeFoundationTeardown(base, cloud, runtime, contract, storage, signal) {
  const old = await optional3(storage, pointer2);
  if (old !== undefined) {
    const plan = old;
    const expected = compileAwsNativeFoundationTeardown(base, cloud, plan.platformAbsence);
    if (
      canonicalSha256(plan) !== canonicalSha256(expected) ||
      plan.drain.siteContractFingerprint !== runtime.contract.fingerprint ||
      plan.drain.ingressContractFingerprint !== contract.fingerprint ||
      canonicalSha256(storage.owner) !== canonicalSha256(plan.drain.owner)
    )
      throw Error('Persisted native foundation identity differs');
    return plan;
  }
  if (
    (await optional3(storage, 'aws-native-reservation-teardown.json')) !== undefined ||
    (await optional3(storage, 'aws-native-teardown-material.json')) !== undefined ||
    (await optional3(storage, 'aws-native-teardown-source.json')) !== undefined ||
    (await optional3(storage, 'aws-native-lifecycle-retirement.json')) !== undefined
  )
    return;
  const selected = validateAwsNativeCloudTeardown(base, cloud);
  if (selected.length !== 1 || selected[0].binding.nodes.length !== 1) return;
  const scope = selected[0].binding;
  await storage.verify();
  if (runtime.engine !== 'native' || canonicalSha256(scope.owner) !== canonicalSha256(storage.owner))
    throw Error('Native foundation owner differs');
  const first = await runtime.preRegistrationInventory([scope], ['default'], contract, signal);
  if (first.status !== 'observed') return;
  assertAwsNativePreRegistrationInventory(first, scope, {
    site: runtime.contract.fingerprint,
    ingress: contract.fingerprint,
  });
  assertAwsNativeInventoryFresh(first);
  if (!absent(first)) return;
  const second = await runtime.preRegistrationInventory([scope], ['default'], contract, signal);
  assertAwsNativePreRegistrationInventory(second, scope, {
    site: runtime.contract.fingerprint,
    ingress: contract.fingerprint,
  });
  assertAwsNativeInventoryFresh(second);
  if (
    !absent(second) ||
    canonicalSha256({ sites: first.sites, resources: first.resources }) !==
      canonicalSha256({ sites: second.sites, resources: second.resources })
  )
    throw Error('Native foundation absence changed during preparation');
  const plan = compileAwsNativeFoundationTeardown(base, cloud, second);
  await storage.write(`${plan.planId}.json`, plan, signal);
  await storage.write(pointer2, plan, signal);
  return plan;
}
async function runAwsNativeFoundationTeardown(
  base,
  cloud,
  input,
  authorized,
  runtime,
  contract,
  storage,
  retireCloud,
  signal,
) {
  const plan = structuredClone(input),
    scope = binding(base, cloud),
    expected = compileAwsNativeFoundationTeardown(base, cloud, plan.platformAbsence);
  const validate = async () => {
    signal?.throwIfAborted();
    await storage.verify();
    if (
      canonicalSha256(plan) !== canonicalSha256(expected) ||
      authorized !== plan.planSha256 ||
      runtime.engine !== 'native' ||
      canonicalSha256(scope.owner) !== canonicalSha256(storage.owner) ||
      plan.drain.siteContractFingerprint !== runtime.contract.fingerprint ||
      plan.drain.ingressContractFingerprint !== contract.fingerprint
    )
      throw Error('Native foundation authorization or source differs');
  };
  const observe = async () => {
    await validate();
    const current = await runtime.preRegistrationInventory([scope], ['default'], contract, signal);
    assertAwsNativePreRegistrationInventory(current, scope, {
      site: runtime.contract.fingerprint,
      ingress: contract.fingerprint,
    });
    assertAwsNativeInventoryFresh(current);
    if (!absent(current)) throw Error('Native foundation platform absence is unverified');
  };
  await validate();
  return withAwsNativeOperation(storage, { kind: 'retire', cloudPlanSha256: plan.cloudPlanSha256 }, async () => {
    await observe();
    const marker = {
      schemaVersion: 1,
      engine: 'native',
      owner: scope.owner,
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: plan.planSha256,
    };
    const prior = await optional3(storage, 'aws-native-lifecycle-retirement.json');
    if (prior !== undefined && canonicalSha256(prior) !== canonicalSha256(marker))
      throw Error('Native foundation retirement belongs to another immutable plan');
    if (prior === undefined) await storage.write('aws-native-lifecycle-retirement.json', marker, signal);
    await observe();
    const cloudReceipt = await retireCloud(plan, signal);
    if (
      cloudReceipt.status !== 'native-cloud-retired' ||
      cloudReceipt.cloudPlanId !== plan.cloudPlanId ||
      cloudReceipt.cloudPlanSha256 !== plan.cloudPlanSha256 ||
      cloudReceipt.absence !== 'absent'
    )
      throw Error('Native foundation exact cloud absence is unverified');
    await observe();
    const credentials = await retireAwsNativeBootstrapCredentials(base, plan, storage, signal);
    await observe();
    const receipt = {
      status: 'ce-retired-supporting-infrastructure-unverified',
      owner: scope.owner,
      planSha256: plan.planSha256,
      sourcePlanSha256: base.planSha256,
      cloudPlanSha256: plan.cloudPlanSha256,
      completed: ['platform-drained', 'native-cloud-retired'],
      platformDrainEvidence: 'verified-absent-native-foundation',
      cloudInventory: 'absent',
      credentialStaging: credentials.status,
      credentialRetirementEvidenceSha256: credentials.evidenceSha256,
      observedAt: new Date().toISOString(),
    };
    await storage.write(`${plan.planId}-receipt.json`, receipt, signal);
    await storage.write('aws-native-teardown-receipt.json', receipt, signal);
    return receipt;
  });
}

// plugins/aws/src/ce/native-pending-teardown.ts
import { join as join5 } from 'node:path';

var pointer3 = 'aws-native-pending-teardown.json';
async function optional4(storage, path) {
  try {
    return await storage.read(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
function scope2(base, cloud, creation) {
  const selected = validateAwsNativeCloudTeardown(base, cloud);
  if (
    base.intent.operation !== 'deploy' ||
    selected.length !== 1 ||
    selected[0].site.nodeIndexes.join(',') !== '1' ||
    selected[0].binding.nodes.length !== 1 ||
    creation.schemaVersion !== 1 ||
    creation.engine !== 'native' ||
    creation.sourcePlanId !== base.planId ||
    creation.sourcePlanSha256 !== base.planSha256 ||
    creation.ownerSha256 !== canonicalSha256(selected[0].binding.owner) ||
    creation.node !== selected[0].binding.nodes[0] ||
    !/^i-[0-9a-f]{8,17}$/.test(creation.instanceId) ||
    creation.imageId !== base.image.id ||
    !base.actions.some((a) => a.kind === 'instance-run' && a.node === 1 && a.id === creation.instanceActionId)
  )
    throw Error('Native pending retirement original single-node creation differs');
  if (
    !cloud.actions.some((a) => a.kind === 'resource-delete' && a.resourceId === creation.instanceId) ||
    !cloud.ownershipInventory.some((r) => r.owned && r.action === 'delete' && r.resourceId === creation.instanceId)
  )
    throw Error('Native pending retirement cloud plan lacks the original instance');
  if (
    creation.interfaces.length !== base.interfaces.length ||
    creation.interfaces.some(
      (i, n) =>
        i.index !== n ||
        i.role !== base.interfaces[n].role ||
        i.device !== base.interfaces[n].guestDevice ||
        !/^eni-[0-9a-f]{8,17}$/.test(i.id) ||
        !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(i.mac),
    ) ||
    new Set(creation.interfaces.map((i) => i.id)).size !== creation.interfaces.length ||
    new Set(creation.interfaces.map((i) => i.mac)).size !== creation.interfaces.length
  )
    throw Error('Native pending retirement original interface coverage differs');
  return selected[0].binding;
}
function inventory(value, binding, fingerprints) {
  assertAwsNativePreRegistrationInventory(value, binding, fingerprints);
  if (!Array.isArray(value.registrations)) throw Error('Native pending registration inventory is incomplete');
  const uids = new Set(value.resources.map((r) => r.uid));
  for (const site of value.sites)
    for (const uid of [site.siteUid, site.physicalSiteUid]) if (uid !== null) uids.add(uid);
  for (const r of value.registrations) {
    validateInitialRegistrationRetirement(binding, r);
    if (uids.has(r.uid)) throw Error('Native pending registration UID duplicates another resource');
    uids.add(r.uid);
  }
}
function compileAwsNativePendingTeardown(base, cloud, creation, observed) {
  const binding = scope2(base, cloud, creation);
  const value = observed;
  inventory(value, binding, { site: observed.siteContractFingerprint, ingress: observed.ingressContractFingerprint });
  const site = value.sites[0];
  if (
    !site.siteUid ||
    !site.physicalSiteUid ||
    value.registrations.length !== 1 ||
    value.registrations[0].instanceId !== creation.instanceId
  )
    throw Error('Native pending retirement requires original logical/physical/registration identities');
  const draft = {
    schemaVersion: 1,
    kind: 'aws-ce-native-pending-teardown',
    engine: 'native',
    sourcePlanSha256: base.planSha256,
    cloudPlanId: cloud.planId,
    cloudPlanSha256: cloud.planSha256,
    creation: structuredClone(creation),
    pendingInventory: structuredClone(value),
    drain: {
      schemaVersion: 1,
      owner: binding.owner,
      sourcePlanSha256: base.planSha256,
      siteContractFingerprint: value.siteContractFingerprint,
      ingressContractFingerprint: value.ingressContractFingerprint,
      listeners: [],
      origins: [],
      sites: [],
    },
    retirement: [
      {
        siteName: site.siteName,
        siteUid: site.siteUid,
        physicalSiteUid: site.physicalSiteUid,
        tokens: value.resources.map((r) => ({ node: r.node, name: r.name })),
      },
    ],
    registrations: structuredClone(value.registrations),
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-native-pending-teardown-${planSha256.slice(0, 24)}`, planSha256 };
}
async function prepareAwsNativePendingTeardown(base, cloud, runtime, contract, storage, signal, readCreation) {
  await storage.verify();
  const owned = validateAwsNativeCloudTeardown(base, cloud);
  if (runtime.engine !== 'native' || canonicalSha256(storage.owner) !== canonicalSha256(owned[0].binding.owner))
    throw Error('Native pending preparation runtime or storage owner differs');
  const old = await optional4(storage, pointer3);
  if (old !== undefined) {
    const p = old;
    const expected = compileAwsNativePendingTeardown(base, cloud, p.creation, p.pendingInventory);
    if (
      canonicalSha256(p) !== canonicalSha256(expected) ||
      p.drain.siteContractFingerprint !== runtime.contract.fingerprint ||
      p.drain.ingressContractFingerprint !== contract.fingerprint ||
      canonicalSha256(p.drain.owner) !== canonicalSha256(storage.owner)
    )
      throw Error('Persisted native pending retirement identity differs');
    return p;
  }
  if (!readCreation) return;
  const selected = validateAwsNativeCloudTeardown(base, cloud);
  if (selected.length !== 1 || selected[0].binding.nodes.length !== 1 || base.intent.operation !== 'deploy') return;
  const binding = selected[0].binding;
  const first = await runtime.preRegistrationInventory([binding], ['default'], contract, signal);
  if (first.status !== 'unknown' || first.reason !== 'initial-registration-cloud-binding-required') return;
  if (!readCreation) throw Error('Original native public creation reader is unavailable');
  const before = await readCreation(signal);
  scope2(base, cloud, before);
  const instances = { [before.node]: before.instanceId };
  const current = await runtime.preRegistrationInventory([binding], ['default'], contract, signal, instances);
  inventory(current, binding, { site: runtime.contract.fingerprint, ingress: contract.fingerprint });
  assertAwsNativeInventoryFresh(current);
  const again = await runtime.preRegistrationInventory([binding], ['default'], contract, signal, instances);
  inventory(again, binding, { site: runtime.contract.fingerprint, ingress: contract.fingerprint });
  assertAwsNativeInventoryFresh(again);
  if (
    canonicalSha256({ sites: current.sites, resources: current.resources, registrations: current.registrations }) !==
      canonicalSha256({ sites: again.sites, resources: again.resources, registrations: again.registrations }) ||
    canonicalSha256(before) !== canonicalSha256(await readCreation(signal))
  )
    throw Error('Native pending source changed during preparation');
  const plan = compileAwsNativePendingTeardown(base, cloud, before, again);
  await storage.verify();
  await storage.write(`${plan.planId}.json`, plan, signal);
  await storage.write(pointer3, plan, signal);
  return plan;
}
async function runAwsNativePendingTeardown(
  base,
  cloud,
  input,
  authorized,
  runtime,
  contract,
  storage,
  retireCloud,
  signal,
) {
  const plan = structuredClone(input),
    binding = scope2(base, cloud, plan.creation),
    expected = compileAwsNativePendingTeardown(base, cloud, plan.creation, plan.pendingInventory);
  const validate = async () => {
    signal?.throwIfAborted();
    await storage.verify();
    if (
      canonicalSha256(plan) !== canonicalSha256(expected) ||
      authorized !== plan.planSha256 ||
      runtime.engine !== 'native' ||
      canonicalSha256(storage.owner) !== canonicalSha256(binding.owner) ||
      runtime.contract.fingerprint !== plan.drain.siteContractFingerprint ||
      contract.fingerprint !== plan.drain.ingressContractFingerprint
    )
      throw Error('Native pending authorization/source/contract differs');
  };
  const observe = async () => {
    await validate();
    const current = await runtime.preRegistrationInventory([binding], ['default'], contract, signal, {
      [plan.creation.node]: plan.creation.instanceId,
    });
    inventory(current, binding, { site: runtime.contract.fingerprint, ingress: contract.fingerprint });
    assertAwsNativeInventoryFresh(current);
    const original = plan.pendingInventory.sites[0],
      site = current.sites[0];
    if (
      (site.siteUid !== null && site.siteUid !== original.siteUid) ||
      (site.physicalSiteUid !== null && site.physicalSiteUid !== original.physicalSiteUid) ||
      current.resources.some(
        (r) => !plan.pendingInventory.resources.some((e) => canonicalSha256(e) === canonicalSha256(r)),
      ) ||
      current.registrations.some((r) => !plan.registrations.some((e) => canonicalSha256(e) === canonicalSha256(r)))
    )
      throw Error('Native pending identity has advanced or changed');
    return current;
  };
  const cloudAbsent = async () => {
    await validate();
    const r = await retireCloud(plan, signal);
    if (
      r.status !== 'native-cloud-retired' ||
      r.absence !== 'absent' ||
      r.cloudPlanId !== plan.cloudPlanId ||
      r.cloudPlanSha256 !== plan.cloudPlanSha256
    )
      throw Error('Native pending exact cloud retirement is unverified');
  };
  await validate();
  return withAwsNativeOperation(storage, { kind: 'retire', cloudPlanSha256: plan.cloudPlanSha256 }, async () => {
    const release = await acquireProcessLock(join5(storage.directory, '.aws-native-teardown-lock'));
    try {
      await observe();
      const marker = {
        schemaVersion: 1,
        engine: 'native',
        owner: binding.owner,
        sourcePlanSha256: base.planSha256,
        teardownPlanSha256: plan.planSha256,
      };
      const old = await optional4(storage, 'aws-native-lifecycle-retirement.json');
      if (old !== undefined && canonicalSha256(old) !== canonicalSha256(marker))
        throw Error('Native pending retirement belongs to another immutable plan');
      if (old === undefined) await storage.write('aws-native-lifecycle-retirement.json', marker, signal);
      const completed = [];
      const persist = (record) =>
        storage.write(
          `${plan.planId}-progress.json`,
          {
            schemaVersion: 1,
            planSha256: plan.planSha256,
            completed: [...completed],
            registrationRequest: record,
            observedAt: new Date().toISOString(),
          },
          signal,
        );
      for (const token of plan.retirement[0].tokens) {
        const c = await observe();
        const exact = plan.pendingInventory.resources.find((r) => r.name === token.name);
        if (!exact) throw Error('Native pending token original UID is unavailable');
        if (c.resources.some((r) => r.name === token.name))
          await runtime.deleteBootstrapTokenExact(binding, token.node, token.name, exact.uid, signal);
        if ((await observe()).resources.some((r) => r.name === token.name))
          throw Error('Native pending token retirement is pending');
        completed.push(`token:${token.name}`);
        await persist();
      }
      await observe();
      await cloudAbsent();
      completed.push('native-cloud-retired');
      await persist();
      for (const registration of plan.registrations) {
        await observe();
        const r = await runtime.deleteInitialRegistration(
          binding,
          registration,
          persist,
          signal,
          plan.retirement[0].siteUid,
        );
        if (r.status !== 'absent') return { status: 'pending-registration-retirement', cloudInventory: 'absent' };
        if ((await observe()).registrations.some((r) => r.uid === registration.uid))
          throw Error('Native pending exact registration absence is unverified');
        completed.push(`registration:${registration.name}`);
        await persist();
      }
      await observe();
      await runtime.deleteSiteExact(binding, plan.retirement[0].siteUid, signal);
      const after = await observe();
      if (
        after.sites[0].siteUid !== null ||
        after.sites[0].physicalSiteUid !== null ||
        after.resources.length ||
        after.registrations.length
      )
        return { status: 'pending-site-retirement', cloudInventory: 'absent' };
      await cloudAbsent();
      await observe();
      const credentials = await retireAwsNativeBootstrapCredentials(base, plan, storage, signal);
      completed.push('platform-drained');
      const receipt = {
        status: 'ce-retired-supporting-infrastructure-unverified',
        owner: binding.owner,
        planSha256: plan.planSha256,
        sourcePlanSha256: base.planSha256,
        cloudPlanSha256: plan.cloudPlanSha256,
        completed,
        platformDrainEvidence: 'verified-empty-native-initial-registration',
        cloudInventory: 'absent',
        credentialStaging: credentials.status,
        credentialRetirementEvidenceSha256: credentials.evidenceSha256,
        observedAt: new Date().toISOString(),
      };
      await storage.write(`${plan.planId}-receipt.json`, receipt, signal);
      await storage.write('aws-native-teardown-receipt.json', receipt, signal);
      return receipt;
    } finally {
      await release();
    }
  });
}

// plugins/aws/src/ce/terraform-teardown-plan.ts
// plugins/aws/src/ce/terraform-foundation-teardown.ts
import { readdir as readdir7, readdir as readdir8 } from 'node:fs/promises';

// plugins/aws/src/ce/terraform-absence.ts
var object3 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed absence evidence');
  return value;
};
var rows = (value) => {
  if (!Array.isArray(value)) throw new Error('Missing absence collection');
  return value.map(object3);
};
var types = {
  aws_vpc: ['describe-vpcs', 'Vpcs', 'VpcId', 'vpc-id', 'vpc'],
  aws_subnet: ['describe-subnets', 'Subnets', 'SubnetId', 'subnet-id', 'subnet'],
  aws_instance: ['describe-instances', 'Reservations', 'InstanceId', 'instance-id', 'i'],
  aws_network_interface: [
    'describe-network-interfaces',
    'NetworkInterfaces',
    'NetworkInterfaceId',
    'network-interface-id',
    'eni',
  ],
  aws_security_group: ['describe-security-groups', 'SecurityGroups', 'GroupId', 'group-id', 'sg'],
  aws_route_table: ['describe-route-tables', 'RouteTables', 'RouteTableId', 'route-table-id', 'rtb'],
  aws_internet_gateway: [
    'describe-internet-gateways',
    'InternetGateways',
    'InternetGatewayId',
    'internet-gateway-id',
    'igw',
  ],
  aws_eip: ['describe-addresses', 'Addresses', 'AllocationId', 'allocation-id', 'eipalloc'],
  aws_ebs_volume: ['describe-volumes', 'Volumes', 'VolumeId', 'volume-id', 'vol'],
  aws_ec2_transit_gateway_vpc_attachment: [
    'describe-transit-gateway-vpc-attachments',
    'TransitGatewayVpcAttachments',
    'TransitGatewayAttachmentId',
    'transit-gateway-attachment-id',
    'tgw-attach',
  ],
  aws_ec2_transit_gateway_connect: [
    'describe-transit-gateway-connects',
    'TransitGatewayConnects',
    'TransitGatewayAttachmentId',
    'transit-gateway-attachment-id',
    'tgw-attach',
  ],
  aws_ec2_transit_gateway_connect_peer: [
    'describe-transit-gateway-connect-peers',
    'TransitGatewayConnectPeers',
    'TransitGatewayConnectPeerId',
    'transit-gateway-connect-peer-id',
    'tgw-connect-peer',
  ],
  aws_ec2_transit_gateway_attachment: [
    'describe-transit-gateway-attachments',
    'TransitGatewayAttachments',
    'TransitGatewayAttachmentId',
    'transit-gateway-attachment-id',
    'tgw-attach',
  ],
  aws_ec2_transit_gateway_route_table: [
    'describe-transit-gateway-route-tables',
    'TransitGatewayRouteTables',
    'TransitGatewayRouteTableId',
    'transit-gateway-route-table-id',
    'tgw-rtb',
  ],
};
var elbTypes = {
  aws_lb: [
    'describe-load-balancers',
    'LoadBalancers',
    'LoadBalancerArns',
    /^arn:[^:]+:elasticloadbalancing:[^:]+:\d{12}:loadbalancer\/net\/[A-Za-z0-9-]+\/[a-f0-9]+$/,
  ],
  aws_lb_target_group: [
    'describe-target-groups',
    'TargetGroups',
    'TargetGroupArns',
    /^arn:[^:]+:elasticloadbalancing:[^:]+:\d{12}:targetgroup\/[A-Za-z0-9-]+\/[a-f0-9]+$/,
  ],
  aws_lb_listener: [
    'describe-listeners',
    'Listeners',
    'ListenerArns',
    /^arn:[^:]+:elasticloadbalancing:[^:]+:\d{12}:listener\/net\/[A-Za-z0-9-]+\/[a-f0-9]+\/[a-f0-9]+$/,
  ],
};
var validId = (type, id) =>
  typeof id === 'string' &&
  ((Object.hasOwn(types, type) && new RegExp(`^${types[type][4]}-[a-f0-9]{8,21}$`).test(id)) ||
    (Object.hasOwn(elbTypes, type) && elbTypes[type][3].test(id)));
var ec2ArnTypes = {
  vpc: 'aws_vpc',
  subnet: 'aws_subnet',
  instance: 'aws_instance',
  'network-interface': 'aws_network_interface',
  'security-group': 'aws_security_group',
  'route-table': 'aws_route_table',
  'internet-gateway': 'aws_internet_gateway',
  'elastic-ip': 'aws_eip',
  volume: 'aws_ebs_volume',
  'transit-gateway-attachment': 'aws_ec2_transit_gateway_attachment',
  'transit-gateway-connect-peer': 'aws_ec2_transit_gateway_connect_peer',
  'transit-gateway-route-table': 'aws_ec2_transit_gateway_route_table',
};
function verifiedEmptyState(inventory) {
  const proof = inventory.emptyState;
  return (
    proof?.schemaVersion === 1 &&
    proof.source === 'owning-empty-destroy-plan' &&
    proof.terraformPlanSha256 === inventory.terraformPlanSha256 &&
    proof.backendIdentity === `local:${inventory.deploymentId}` &&
    [proof.configurationSha256, proof.providerLockSha256].every(
      (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value),
    ) &&
    proof.resourceProjectionSha256 === canonicalSha256({ 'aws_vpc.ce': null }) &&
    Object.keys(proof).sort().join(',') ===
      'backendIdentity,configurationSha256,providerLockSha256,resourceProjectionSha256,schemaVersion,source,terraformPlanSha256' &&
    Array.isArray(inventory.tgwEdges) &&
    inventory.tgwEdges.length === 0
  );
}
async function collectAwsTerraformAbsence(source, input, raw, signal) {
  const plan = structuredClone(source),
    inventory = structuredClone(input);
  verifyAwsCePlan(plan);
  signal?.throwIfAborted();
  const { sha256, ...material } = inventory;
  if (
    inventory.schemaVersion !== 1 ||
    inventory.engine !== 'terraform' ||
    plan.engine !== 'terraform' ||
    inventory.accountId !== plan.intent.accountId ||
    inventory.region !== plan.intent.region ||
    inventory.deploymentId !== plan.intent.deploymentName ||
    inventory.sourcePlanSha256 !== plan.planSha256 ||
    !/^[a-f0-9]{64}$/.test(inventory.terraformPlanSha256) ||
    canonicalSha256(material) !== sha256 ||
    !Array.isArray(inventory.resources) ||
    (inventory.resources.length ? inventory.emptyState !== undefined : !verifiedEmptyState(inventory)) ||
    inventory.resources.length > 1000 ||
    !Array.isArray(inventory.tgwEdges) ||
    inventory.tgwEdges.length > 1000
  )
    throw new Error('Invalid AWS retirement inventory binding');
  const ids = new Set();
  for (const resource of inventory.resources) {
    if (
      !validId(resource.type, resource.id) ||
      ids.has(resource.id) ||
      (Object.hasOwn(elbTypes, resource.type) &&
        !resource.id.startsWith(
          `arn:${plan.intent.partition}:elasticloadbalancing:${inventory.region}:${inventory.accountId}:`,
        ))
    )
      throw new Error('Invalid or duplicate retired resource identity');
    ids.add(resource.id);
  }
  const edges = new Set();
  for (const edge of inventory.tgwEdges) {
    const key = `${edge.kind}:${edge.tableId}:${edge.attachmentId}`;
    if (
      !['association', 'propagation'].includes(edge.kind) ||
      !validId('aws_ec2_transit_gateway_route_table', edge.tableId) ||
      !validId('aws_ec2_transit_gateway_attachment', edge.attachmentId) ||
      !ids.has(edge.attachmentId) ||
      edges.has(key)
    )
      throw new Error('Invalid retired TGW relationship');
    edges.add(key);
  }
  const base = {
    source: 'aws-cli-live',
    engine: 'terraform',
    accountId: inventory.accountId,
    region: inventory.region,
    deploymentId: inventory.deploymentId,
    sourcePlanSha256: plan.planSha256,
    inventorySha256: sha256,
    startedAt: new Date().toISOString(),
  };
  const api = scopedAwsApi(raw, plan.intent.awsProfile, signal),
    sources = [];
  const request = async (service, operation, args = {}) => {
    const response = await api.exec('aws', [
      service,
      operation,
      '--cli-input-json',
      JSON.stringify(args),
      '--no-paginate',
      '--region',
      inventory.region,
      '--output',
      'json',
    ]);
    signal?.throwIfAborted();
    if (response.exitCode !== 0) throw detectAwsError(response.stderr, response.exitCode);
    sources.push(operation);
    return object3(JSON.parse(response.stdout));
  };
  const pages = async (operation, collection, args) => {
    const output = [],
      tokens = new Set();
    let token;
    do {
      const response = await request('ec2', operation, { ...args, ...(token ? { NextToken: token } : {}) });
      if (response.NextMarker !== undefined || response.nextToken !== undefined || response.Marker !== undefined)
        throw new Error('Unsupported absence pagination');
      output.push(...rows(response[collection]));
      if (output.length > 1e4) throw new Error('Absence collection exceeded bound');
      if (response.NextToken === undefined || response.NextToken === null) token = undefined;
      else {
        if (
          typeof response.NextToken !== 'string' ||
          !response.NextToken ||
          tokens.has(response.NextToken) ||
          tokens.size >= 1000
        )
          throw new Error('Incomplete absence pagination');
        token = response.NextToken;
        tokens.add(token);
      }
    } while (token);
    return output;
  };
  try {
    if ((await request('sts', 'get-caller-identity')).Account !== inventory.accountId)
      throw new Error('AWS absence account differs');
    const resources = structuredClone(inventory.resources);
    const tags = await pages('describe-tags', 'Tags', {
      Filters: [
        { Name: 'key', Values: ['xcsh-deployment-id'] },
        { Name: 'value', Values: [inventory.deploymentId] },
      ],
    });
    const taggedIds = new Set();
    for (const tag of tags) {
      if (
        tag.Key !== 'xcsh-deployment-id' ||
        tag.Value !== inventory.deploymentId ||
        typeof tag.ResourceId !== 'string' ||
        taggedIds.has(tag.ResourceId)
      )
        throw new Error('Substituted deployment tag evidence');
      taggedIds.add(tag.ResourceId);
      if (ids.has(tag.ResourceId)) continue;
      const type = tag.ResourceId.startsWith('tgw-attach-')
        ? 'aws_ec2_transit_gateway_attachment'
        : Object.keys(types).find((type) => validId(type, tag.ResourceId));
      if (!type || !validId(type, tag.ResourceId))
        throw new Error('Unsupported tagged resource requires absence evidence');
      resources.push({ type, id: tag.ResourceId });
      ids.add(tag.ResourceId);
    }
    const taggingTokens = new Set(),
      taggedArns = new Set();
    let taggingToken;
    do {
      const response = await request('resourcegroupstaggingapi', 'get-resources', {
        TagFilters: [{ Key: 'xcsh-deployment-id', Values: [inventory.deploymentId] }],
        ...(taggingToken ? { PaginationToken: taggingToken } : {}),
      });
      if (['NextToken', 'NextMarker', 'nextToken', 'Marker'].some((key) => response[key] !== undefined))
        throw new Error('Unsupported tagged resource pagination');
      const mappings = rows(response.ResourceTagMappingList);
      for (const mapping of mappings) {
        const arn = mapping.ResourceARN;
        if (typeof arn !== 'string' || taggedArns.has(arn) || taggedArns.size >= 1e4)
          throw new Error('Malformed, duplicate or excessive tagged resource evidence');
        taggedArns.add(arn);
        const match = /^arn:([^:]+):([^:]+):([^:]+):(\d{12}):(.+)$/.exec(arn);
        if (
          !match ||
          match[1] !== plan.intent.partition ||
          match[3] !== inventory.region ||
          match[4] !== inventory.accountId
        )
          throw new Error('Tagged resource scope differs from deployment');
        const mappingTags = rows(mapping.Tags);
        const tag = (key) => mappingTags.filter((row) => row.Key === key);
        if (
          tag('xcsh-deployment-id').length !== 1 ||
          tag('xcsh-deployment-id')[0].Value !== inventory.deploymentId ||
          tag('xcsh-managed-by').length !== 1 ||
          tag('xcsh-managed-by')[0].Value !== 'aws-ce' ||
          tag('xcsh-execution-engine').length !== 1 ||
          tag('xcsh-execution-engine')[0].Value !== 'terraform' ||
          tag('xcsh-plan-sha256').length !== 1 ||
          tag('xcsh-plan-sha256')[0].Value !== plan.planSha256
        )
          throw new Error('Foreign or ambiguous tagged resource');
        let type,
          id = arn;
        if (match[2] === 'elasticloadbalancing')
          type = Object.keys(elbTypes).find((candidate) => validId(candidate, arn));
        else if (match[2] === 'ec2') {
          const resource = /^([^/]+)\/([^/]+)$/.exec(match[5]);
          if (resource && Object.hasOwn(ec2ArnTypes, resource[1])) {
            type = ec2ArnTypes[resource[1]];
            id = resource[2];
            if (!validId(type, id)) type = undefined;
          }
        }
        if (!type) throw new Error('Unsupported tagged resource requires absence evidence');
        const existing = resources.find((row) => row.id === id);
        if (existing) {
          if (
            existing.type !== type &&
            !(
              type === 'aws_ec2_transit_gateway_attachment' &&
              ['aws_ec2_transit_gateway_vpc_attachment', 'aws_ec2_transit_gateway_connect'].includes(existing.type)
            )
          )
            throw new Error('Tagged resource type differs from captured identity');
          continue;
        }
        resources.push({ type, id });
        ids.add(id);
      }
      if (
        response.PaginationToken === undefined ||
        response.PaginationToken === null ||
        response.PaginationToken === ''
      )
        taggingToken = undefined;
      else {
        if (
          typeof response.PaginationToken !== 'string' ||
          taggingTokens.has(response.PaginationToken) ||
          taggingTokens.size >= 1000
        )
          throw new Error('Incomplete tagged resource pagination');
        taggingToken = response.PaginationToken;
        taggingTokens.add(taggingToken);
      }
    } while (taggingToken);
    const remaining = [],
      retainedTerminal = [];
    for (const [type, [operation, collection, idKey, filter]] of Object.entries(types)) {
      const selected = resources.filter((row) => row.type === type).map((row) => row.id);
      if (!selected.length) continue;
      let found = await pages(operation, collection, { Filters: [{ Name: filter, Values: selected }] });
      if (type === 'aws_instance') found = found.flatMap((row) => rows(row.Instances));
      const seen = new Set();
      for (const row of found) {
        const id = row[idKey];
        if (typeof id !== 'string' || !selected.includes(id) || seen.has(id))
          throw new Error('Substituted absence resource identity');
        seen.add(id);
        let terminal = false;
        if (type === 'aws_instance') {
          const state = object3(row.State).Name;
          if (typeof state !== 'string') throw new Error('Missing instance retirement state');
          terminal = state === 'terminated';
        } else if (type === 'aws_ebs_volume' || type.startsWith('aws_ec2_transit_gateway_')) {
          if (typeof row.State !== 'string') throw new Error('Missing cloud retirement state');
          terminal = row.State === 'deleted';
        }
        (terminal ? retainedTerminal : remaining).push(id);
      }
    }
    for (const [type, [operation, collection, argument]] of Object.entries(elbTypes)) {
      const selected = resources.filter((row) => row.type === type).map((row) => row.id);
      for (const id of selected) {
        try {
          const response = await request('elbv2', operation, { [argument]: [id] });
          const found = rows(response[collection]);
          if (found.length !== 1) throw new Error('Substituted NLB absence resource identity');
          const key =
            type === 'aws_lb' ? 'LoadBalancerArn' : type === 'aws_lb_target_group' ? 'TargetGroupArn' : 'ListenerArn';
          if (found[0][key] !== id) throw new Error('Substituted NLB absence resource identity');
          remaining.push(id);
        } catch (error) {
          if (!(error instanceof AwsNotFoundError)) throw error;
        }
      }
    }
    for (const edge of inventory.tgwEdges) {
      const tables = await pages('describe-transit-gateway-route-tables', 'TransitGatewayRouteTables', {
        Filters: [{ Name: 'transit-gateway-route-table-id', Values: [edge.tableId] }],
      });
      if (tables.length > 1 || tables.some((row) => row.TransitGatewayRouteTableId !== edge.tableId))
        throw new Error('Substituted TGW table evidence');
      if (!tables.length) continue;
      const association = edge.kind === 'association';
      const found = await pages(
        association ? 'get-transit-gateway-route-table-associations' : 'get-transit-gateway-route-table-propagations',
        association ? 'Associations' : 'TransitGatewayRouteTablePropagations',
        {
          TransitGatewayRouteTableId: edge.tableId,
          Filters: [{ Name: 'transit-gateway-attachment-id', Values: [edge.attachmentId] }],
        },
      );
      if (
        found.length > 1 ||
        found.some((row) => row.TransitGatewayAttachmentId !== edge.attachmentId || typeof row.State !== 'string')
      )
        throw new Error('Substituted TGW retirement edge');
      if (found.some((row) => row.State !== (association ? 'disassociated' : 'disabled')))
        remaining.push(`${edge.kind}:${edge.tableId}:${edge.attachmentId}`);
    }
    return {
      ...base,
      status: remaining.length ? 'pending' : 'absent-or-retired',
      remaining,
      retainedTerminal,
      resourceCount: resources.length,
      sources,
      observedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      ...base,
      status: 'unknown',
      reason: error instanceof Error ? error.name : 'invalid-evidence',
      sources,
      observedAt: new Date().toISOString(),
    };
  }
}

// plugins/aws/src/ce/terraform-cloud-teardown.ts
import { createHash as createHash4 } from 'node:crypto';

// plugins/aws/src/ce/terraform-metadata-retirement.ts
var checkpointName = 'aws-terraform-metadata-retirement.json';
var keys = new Set([
  'xcsh-managed-by',
  'xcsh-execution-engine',
  'xcsh-deployment-id',
  'xcsh-plan-sha256',
  'xcsh-node-index',
  'xcsh-interface-index',
  'ves-io-site-name',
]);
var resourceTypes = {
  aws_vpc: 'vpc',
  aws_subnet: 'subnet',
  aws_instance: 'instance',
  aws_network_interface: 'network-interface',
  aws_security_group: 'security-group',
  aws_route_table: 'route-table',
  aws_internet_gateway: 'internet-gateway',
  aws_eip: 'elastic-ip',
  aws_ebs_volume: 'volume',
  aws_ec2_transit_gateway_vpc_attachment: 'transit-gateway-attachment',
  aws_ec2_transit_gateway_connect: 'transit-gateway-attachment',
  aws_ec2_transit_gateway_connect_peer: 'transit-gateway-connect-peer',
};
var object4 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed metadata evidence');
  return value;
};
var rows2 = (value) => {
  if (!Array.isArray(value)) throw Error('Missing metadata evidence collection');
  return value.map(object4);
};
var requiredTags = (plan) => ({
  'xcsh-managed-by': 'aws-ce',
  'xcsh-execution-engine': 'terraform',
  'xcsh-deployment-id': plan.intent.deploymentName,
  'xcsh-plan-sha256': plan.planSha256,
});
function awsTerraformMetadataTags(plan, value) {
  const tags = rows2(value),
    seen = new Set();
  for (const tag of tags) {
    if (typeof tag.Key !== 'string' || typeof tag.Value !== 'string' || seen.has(tag.Key))
      throw Error('Malformed or duplicate original ownership metadata');
    seen.add(tag.Key);
  }
  for (const [key, expected] of Object.entries(requiredTags(plan)))
    if (tags.find((tag) => tag.Key === key)?.Value !== expected) throw Error('Original ownership metadata is foreign');
  for (const key of ['xcsh-node-index', 'xcsh-interface-index']) {
    const tag = tags.find((tag) => tag.Key === key);
    if (tag && (typeof tag.Value !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(tag.Value)))
      throw Error('Original node or interface metadata is malformed');
  }
  const node = tags.find((tag) => tag.Key === 'xcsh-node-index')?.Value;
  const index = tags.find((tag) => tag.Key === 'xcsh-interface-index')?.Value;
  const site = tags.find((tag) => tag.Key === 'ves-io-site-name')?.Value;
  if (
    (node !== undefined && (Number(node) < 1 || Number(node) > plan.intent.topology.nodeCount)) ||
    (index !== undefined &&
      (node === undefined || !plan.intent.interfaces.some((item) => item.index === Number(index)))) ||
    (site !== undefined &&
      site !== (node === undefined ? plan.intent.siteName : siteForNode(plan.intent, Number(node)).name))
  )
    throw Error('Original metadata node, interface or logical site differs');
  return tags
    .filter((tag) => keys.has(String(tag.Key)))
    .map((tag) => ({ Key: String(tag.Key), Value: String(tag.Value) }))
    .sort((a, b) => a.Key.localeCompare(b.Key));
}
function awsTerraformMetadataProjection(plan, address, value) {
  const tags = awsTerraformMetadataTags(plan, value);
  const nodeAddress = /\.node_([0-9]+)(?:_nic_([0-9]+))?$/.exec(address);
  if (
    nodeAddress &&
    (tags.find((tag) => tag.Key === 'xcsh-node-index')?.Value !== nodeAddress[1] ||
      (nodeAddress[2] !== undefined &&
        tags.find((tag) => tag.Key === 'xcsh-interface-index')?.Value !== nodeAddress[2]))
  )
    throw Error('Original metadata node or interface projection differs');
  return tags;
}
async function optional5(store, name) {
  try {
    return await store.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function retireAwsTerraformMetadata(input, store, raw, signal) {
  const plan = structuredClone(input);
  verifyAwsCePlan(plan);
  signal?.throwIfAborted();
  await store.verify();
  if (
    plan.engine !== 'terraform' ||
    !['aws', 'aws-us-gov', 'aws-cn'].includes(plan.intent.partition) ||
    canonicalSha256(store.owner) !== canonicalSha256(siteBindings(plan)[0].binding.owner)
  )
    throw Error('Metadata retirement owner or engine differs');
  const inventory = structuredClone(await store.read('terraform-cloud-teardown-inventory.json'));
  const { sha256, ...material } = inventory;
  if (
    canonicalSha256(material) !== sha256 ||
    inventory.sourcePlanSha256 !== plan.planSha256 ||
    inventory.accountId !== plan.intent.accountId ||
    inventory.region !== plan.intent.region ||
    inventory.deploymentId !== plan.intent.deploymentName ||
    !Array.isArray(inventory.resources) ||
    !Array.isArray(inventory.metadata) ||
    inventory.metadata.length > 1000
  )
    throw Error('Original authenticated metadata inventory unavailable');
  const metadata = inventory.metadata;
  const ids = new Set();
  for (const row of metadata) {
    if (
      !row ||
      ids.has(row.id) ||
      !inventory.resources.some((resource) => resource.id === row.id && resource.type === row.type) ||
      !Object.hasOwn(resourceTypes, row.type) ||
      !new RegExp(`^${row.type === 'aws_ebs_volume' ? 'aws_instance' : row.type}\\.[a-z][a-z0-9_]*$`).test(
        row.address,
      ) ||
      canonicalSha256(awsTerraformMetadataProjection(plan, row.address, row.tags)) !== canonicalSha256(row.tags) ||
      (row.type === 'aws_ebs_volume'
        ? !inventory.resources.some(
            (resource) => resource.type === 'aws_instance' && resource.id === row.parentInstanceId,
          )
        : row.parentInstanceId !== undefined)
    )
      throw Error('Original metadata identity or lifecycle binding differs');
    ids.add(row.id);
  }
  const ec2Resources = inventory.resources.filter((row) => !row.type.startsWith('aws_lb'));
  if (ec2Resources.length !== metadata.length || ec2Resources.some((resource) => !ids.has(resource.id)))
    throw Error('Original metadata lifecycle inventory is incomplete');
  let checkpoint = await optional5(store, checkpointName);
  const phaseValue = await optional5(store, 'terraform-cloud-teardown.json');
  if (phaseValue === undefined) {
    const terminal = object4(await store.read('aws-terraform-terminal-cleanup.json'));
    const evidence = object4(terminal.evidence);
    if (
      checkpoint?.phase !== 'retired' ||
      terminal.sourcePlanSha256 !== plan.planSha256 ||
      canonicalSha256(terminal.owner) !== canonicalSha256(store.owner) ||
      evidence.inventorySha256 !== inventory.sha256 ||
      terminal.evidenceSha256 !== canonicalSha256(evidence)
    )
      throw Error('Retired source metadata has no bound terminal custody');
  } else {
    const phase = object4(phaseValue);
    if (
      phase.schemaVersion !== 1 ||
      phase.engine !== 'terraform' ||
      phase.sourcePlanSha256 !== plan.planSha256 ||
      phase.phase !== 'retired'
    )
      throw Error('Cloud teardown has not converged before metadata retirement');
  }
  const api = scopedAwsApi(raw, plan.intent.awsProfile, signal);
  const rawExecute = async (service, operation, args = {}) => {
    await store.verify();
    signal?.throwIfAborted();
    const response = await api.exec('aws', [
      service,
      operation,
      '--cli-input-json',
      JSON.stringify(args),
      '--no-paginate',
      '--region',
      plan.intent.region,
      '--output',
      'json',
    ]);
    signal?.throwIfAborted();
    return response;
  };
  const execute = async (service, operation, args = {}) => {
    const response = await rawExecute(service, operation, args);
    if (response.exitCode !== 0) throw detectAwsError(response.stderr, response.exitCode);
    return response;
  };
  const request = async (service, operation, args = {}) =>
    object4(JSON.parse((await execute(service, operation, args)).stdout));
  const tags = async (filters) => {
    const result = [],
      tokens = new Set();
    let token;
    do {
      const page = await request('ec2', 'describe-tags', { Filters: filters, ...(token ? { NextToken: token } : {}) });
      if (['NextMarker', 'nextToken', 'Marker'].some((key) => page[key] !== undefined))
        throw Error('Unsupported metadata pagination');
      result.push(...rows2(page.Tags));
      if (result.length > 1e4) throw Error('Metadata evidence exceeds bound');
      if (page.NextToken === undefined || page.NextToken === null) token = undefined;
      else {
        if (typeof page.NextToken !== 'string' || !page.NextToken || tokens.has(page.NextToken) || tokens.size >= 1000)
          throw Error('Incomplete metadata pagination');
        token = page.NextToken;
        tokens.add(token);
      }
    } while (token);
    return result;
  };
  const prepareOrphanSubnetTags = async (tag) => {
    const id = tag.ResourceId;
    if (typeof id !== 'string' || !/^subnet-[a-f0-9]{17}$/.test(id) || tag.ResourceType !== 'subnet')
      throw Error('Deployment metadata has unknown or ambiguous lifecycle origin');
    const found = await tags([{ Name: 'resource-id', Values: [id] }]);
    const seen = new Set();
    for (const row of found) {
      if (
        row.ResourceId !== id ||
        row.ResourceType !== 'subnet' ||
        typeof row.Key !== 'string' ||
        typeof row.Value !== 'string' ||
        seen.has(row.Key)
      )
        throw Error('Orphan subnet metadata is malformed or ambiguous');
      seen.add(row.Key);
    }
    const projection = found
      .map((row) => ({ Key: String(row.Key), Value: String(row.Value) }))
      .sort((a, b) => a.Key.localeCompare(b.Key));
    const matches = metadata.filter(
      (row) => row.type === 'aws_subnet' && canonicalSha256(row.tags) === canonicalSha256(projection),
    );
    if (!projection.length || matches.length !== 1)
      throw Error('Orphan subnet metadata has no exact immutable projection');
    const absent = async () => {
      const result = await rawExecute('ec2', 'describe-subnets', { SubnetIds: [id] });
      if (
        result.exitCode === 0 ||
        result.stdout.trim() ||
        !/^An error occurred \(InvalidSubnetID\.NotFound\) when calling the DescribeSubnets operation: [^\r\n]+$/.test(
          result.stderr.trim(),
        )
      )
        throw Error('Orphan subnet object absence is unqualified');
    };
    await absent();
    return async () => {
      await absent();
      const current = await tags([{ Name: 'resource-id', Values: [id] }]);
      if (canonicalSha256(current) !== canonicalSha256(found))
        throw Error('Orphan subnet metadata changed before retirement');
      await execute('ec2', 'delete-tags', { Resources: [id], Tags: projection });
      if ((await tags([{ Name: 'resource-id', Values: [id] }])).length)
        throw Error('Orphan subnet metadata retirement was not observed');
      await absent();
      await store.write(`aws-terraform-orphan-subnet-tags-${canonicalSha256(id)}.json`, {
        schemaVersion: 1,
        owner: store.owner,
        sourcePlanSha256: plan.planSha256,
        resourceId: id,
        projectionAddress: matches[0].address,
        tagsSha256: canonicalSha256(projection),
        status: 'exact-orphan-tags-retired',
        objectAbsence: 'InvalidSubnetID.NotFound',
        creationIdentityQualified: false,
        ceResourcesTouched: false,
      });
    };
  };
  const knownDeploymentTags = async () => {
    const found = await tags([
      { Name: 'key', Values: ['xcsh-deployment-id'] },
      { Name: 'value', Values: [plan.intent.deploymentName] },
    ]);
    const seen = new Set();
    for (const tag of found) {
      const original = metadata.find((row) => row.id === tag.ResourceId);
      if (
        typeof tag.ResourceId !== 'string' ||
        seen.has(tag.ResourceId) ||
        tag.Key !== 'xcsh-deployment-id' ||
        tag.Value !== plan.intent.deploymentName ||
        (original
          ? tag.ResourceType !== resourceTypes[original.type]
          : tag.ResourceType !== 'subnet' || !/^subnet-[a-f0-9]{17}$/.test(tag.ResourceId))
      )
        throw Error('Deployment metadata has unknown or ambiguous lifecycle origin');
      seen.add(tag.ResourceId);
    }
    await allCurrentTags();
    const retirements = [];
    for (const tag of found.filter((row) => !ids.has(String(row.ResourceId))))
      retirements.push(await prepareOrphanSubnetTags(tag));
    for (const retire of retirements) await retire();
    return found.filter((tag) => ids.has(String(tag.ResourceId)));
  };
  const currentTags = async (row, observed) => {
    const found = observed
      ? observed.filter((tag) => tag.ResourceId === row.id)
      : await tags([{ Name: 'resource-id', Values: [row.id] }]);
    const seen = new Set();
    for (const tag of found) {
      if (
        tag.ResourceId !== row.id ||
        tag.ResourceType !== resourceTypes[row.type] ||
        typeof tag.Key !== 'string' ||
        typeof tag.Value !== 'string' ||
        seen.has(tag.Key)
      )
        throw Error('Substituted or duplicate metadata evidence');
      seen.add(tag.Key);
      if (keys.has(tag.Key) && !row.tags.some((expected) => expected.Key === tag.Key && expected.Value === tag.Value))
        throw Error('Current ownership metadata is foreign to original intent');
    }
    return found
      .filter((tag) => keys.has(String(tag.Key)))
      .map((tag) => ({ Key: String(tag.Key), Value: String(tag.Value) }))
      .sort((a, b) => a.Key.localeCompare(b.Key));
  };
  const allCurrentTags = async () => {
    const found = metadata.length ? await tags([{ Name: 'resource-id', Values: [...ids] }]) : [];
    if (found.some((tag) => typeof tag.ResourceId !== 'string' || !ids.has(tag.ResourceId)))
      throw Error('Substituted batch metadata identity');
    const result = new Map();
    for (const row of metadata) result.set(row.id, await currentTags(row, found));
    return result;
  };
  const regionalArn = (row) =>
    `arn:${plan.intent.partition}:ec2:${plan.intent.region}:${plan.intent.accountId}:${resourceTypes[row.type]}/${row.id}`;
  const regionalByArn = new Map(metadata.map((row) => [regionalArn(row), row]));
  const regionalPages = async (args, paginate) => {
    const result = [],
      seen = new Set();
    let token;
    do {
      const page = await request('resourcegroupstaggingapi', 'get-resources', {
        ...args,
        ...(token ? { PaginationToken: token } : {}),
      });
      if (
        ['NextToken', 'NextMarker', 'nextToken', 'Marker', 'nextLink', 'errors', 'error'].some(
          (key) => page[key] !== undefined && page[key] !== null && page[key] !== '',
        )
      )
        throw Error('Incomplete regional metadata response');
      result.push(...rows2(page.ResourceTagMappingList));
      if (result.length > 1e4) throw Error('Regional metadata evidence exceeds bound');
      const next = page.PaginationToken;
      if (next === undefined || next === null || next === '') token = undefined;
      else {
        if (!paginate || typeof next !== 'string' || seen.has(next) || seen.size >= 1000)
          throw Error('Incomplete regional metadata pagination');
        seen.add(next);
        token = next;
      }
    } while (token);
    return result;
  };
  const regionalProjection = (values, selected) => {
    const result = new Map();
    for (const value of values) {
      const original = typeof value.ResourceARN === 'string' ? regionalByArn.get(value.ResourceARN) : undefined;
      if (!original || (selected && !selected.has(value.ResourceARN)) || result.has(original.id))
        throw Error('Regional metadata has unknown, substituted or duplicate original identity');
      const seen = new Set(),
        projection = [];
      for (const tag of rows2(value.Tags)) {
        if (typeof tag.Key !== 'string' || typeof tag.Value !== 'string' || seen.has(tag.Key))
          throw Error('Malformed or duplicate regional metadata tags');
        seen.add(tag.Key);
        if (keys.has(tag.Key)) {
          if (!original.tags.some((expected) => expected.Key === tag.Key && expected.Value === tag.Value))
            throw Error('Regional ownership metadata is foreign to original intent');
          projection.push({ Key: tag.Key, Value: tag.Value });
        }
      }
      result.set(
        original.id,
        projection.sort((a, b) => a.Key.localeCompare(b.Key)),
      );
    }
    return result;
  };
  const allRegionalTags = async () => {
    const filtered = regionalProjection(
      await regionalPages(
        {
          TagFilters: [{ Key: 'xcsh-deployment-id', Values: [plan.intent.deploymentName] }],
        },
        true,
      ),
    );
    for (const tags of filtered.values())
      if (!tags.some((tag) => tag.Key === 'xcsh-deployment-id' && tag.Value === plan.intent.deploymentName))
        throw Error('Regional ownership filter returned incomplete identity');
    const result = new Map(metadata.map((row) => [row.id, []]));
    const arns = [...regionalByArn.keys()];
    for (let index = 0; index < arns.length; index += 100) {
      const selected = arns.slice(index, index + 100);
      const captured = regionalProjection(await regionalPages({ ResourceARNList: selected }, false), new Set(selected));
      for (const [id, tags] of captured) result.set(id, tags);
    }
    for (const [id, tags] of filtered)
      if (canonicalSha256(tags) !== canonicalSha256(result.get(id)))
        throw Error('Regional metadata changed or discovery was partial');
    return result;
  };
  const regionalRequest = (row, tags) => ({
    ResourceARNList: [regionalArn(row)],
    TagKeys: tags.map((tag) => tag.Key).sort(),
  });
  const absent = async () => {
    const result = await collectAwsTerraformAbsence(plan, inventory, raw, signal);
    if (result.status !== 'absent-or-retired') throw Error('Current complete cloud retirement unavailable');
  };
  const retiredIdentity = async (row) => {
    const descriptors = {
      aws_vpc: ['describe-vpcs', 'Vpcs', 'VpcId', 'vpc-id'],
      aws_subnet: ['describe-subnets', 'Subnets', 'SubnetId', 'subnet-id'],
      aws_instance: ['describe-instances', 'Reservations', 'InstanceId', 'instance-id'],
      aws_network_interface: [
        'describe-network-interfaces',
        'NetworkInterfaces',
        'NetworkInterfaceId',
        'network-interface-id',
      ],
      aws_security_group: ['describe-security-groups', 'SecurityGroups', 'GroupId', 'group-id'],
      aws_route_table: ['describe-route-tables', 'RouteTables', 'RouteTableId', 'route-table-id'],
      aws_internet_gateway: [
        'describe-internet-gateways',
        'InternetGateways',
        'InternetGatewayId',
        'internet-gateway-id',
      ],
      aws_eip: ['describe-addresses', 'Addresses', 'AllocationId', 'allocation-id'],
      aws_ebs_volume: ['describe-volumes', 'Volumes', 'VolumeId', 'volume-id'],
      aws_ec2_transit_gateway_vpc_attachment: [
        'describe-transit-gateway-vpc-attachments',
        'TransitGatewayVpcAttachments',
        'TransitGatewayAttachmentId',
        'transit-gateway-attachment-id',
      ],
      aws_ec2_transit_gateway_connect: [
        'describe-transit-gateway-connects',
        'TransitGatewayConnects',
        'TransitGatewayAttachmentId',
        'transit-gateway-attachment-id',
      ],
      aws_ec2_transit_gateway_connect_peer: [
        'describe-transit-gateway-connect-peers',
        'TransitGatewayConnectPeers',
        'TransitGatewayConnectPeerId',
        'transit-gateway-connect-peer-id',
      ],
    };
    const [operation, collection, idKey, filter] = descriptors[row.type];
    const page = await request('ec2', operation, { Filters: [{ Name: filter, Values: [row.id] }] });
    if (['NextToken', 'NextMarker', 'nextToken', 'Marker'].some((key) => page[key] !== undefined && page[key] !== null))
      throw Error('Partial metadata resource retirement evidence');
    let found = rows2(page[collection]);
    if (row.type === 'aws_instance') found = found.flatMap((reservation) => rows2(reservation.Instances));
    if (found.length > 1 || found.some((item) => item[idKey] !== row.id))
      throw Error('Substituted metadata resource identity');
    if (!found.length) return;
    const state = row.type === 'aws_instance' ? object4(found[0].State).Name : found[0].State;
    if (
      !(row.type === 'aws_instance'
        ? state === 'terminated'
        : (row.type === 'aws_ebs_volume' || row.type.startsWith('aws_ec2_transit_gateway_')) && state === 'deleted')
    )
      throw Error('Metadata resource is active or retirement state is unknown');
  };
  if ((await request('sts', 'get-caller-identity')).Account !== plan.intent.accountId)
    throw Error('Metadata account differs');
  await absent();
  await knownDeploymentTags();
  const initialTags = await allCurrentTags();
  await allRegionalTags();
  const binding = {
    schemaVersion: 1,
    engine: 'terraform',
    sourcePlanSha256: plan.planSha256,
    inventorySha256: inventory.sha256,
    metadataSha256: canonicalSha256(metadata),
  };
  if (checkpoint === undefined) {
    checkpoint = { ...binding, completed: [], pending: null, phase: 'retiring' };
    await store.write(checkpointName, checkpoint);
  }
  if (
    !checkpoint ||
    Object.entries(binding).some(([key, expected]) => Reflect.get(checkpoint, key) !== expected) ||
    !Array.isArray(checkpoint.completed) ||
    new Set(checkpoint.completed).size !== checkpoint.completed.length ||
    checkpoint.completed.some((id) => !ids.has(id)) ||
    !['retiring', 'retired'].includes(checkpoint.phase) ||
    (checkpoint.phase === 'retired' && (checkpoint.pending !== null || checkpoint.completed.length !== metadata.length))
  )
    throw Error('Original metadata retirement checkpoint differs');
  if (checkpoint.pending !== null) {
    const pending = checkpoint.pending;
    const row = metadata.find((row) => row.id === pending?.id);
    if (
      !row ||
      checkpoint.completed.includes(row.id) ||
      !Array.isArray(pending.tags) ||
      !pending.tags.length ||
      pending.tags.some((tag) => !row.tags.some((original) => canonicalSha256(tag) === canonicalSha256(original))) ||
      new Set(pending.tags.map((tag) => tag.Key)).size !== pending.tags.length ||
      pending.requestSha256 !== canonicalSha256({ Resources: [row.id], Tags: pending.tags })
    )
      throw Error('Original pending metadata request differs');
  }
  if (checkpoint.regional === undefined) {
    if (checkpoint.phase === 'retired') throw Error('Retired metadata checkpoint lacks original regional proof');
    checkpoint.regional = { completed: [], pending: null };
    await store.write(checkpointName, checkpoint);
  }
  const regional = checkpoint.regional;
  if (
    !regional ||
    Object.keys(regional).sort().join(',') !== 'completed,pending' ||
    !Array.isArray(regional.completed) ||
    new Set(regional.completed).size !== regional.completed.length ||
    regional.completed.some((id) => !ids.has(id)) ||
    (checkpoint.phase === 'retired' && (regional.pending !== null || regional.completed.length !== metadata.length))
  )
    throw Error('Original regional metadata checkpoint differs');
  if (regional.pending !== null) {
    const pending = regional.pending,
      original = metadata.find((row) => row.id === pending?.id);
    if (
      !original ||
      regional.completed.includes(pending.id) ||
      Object.keys(pending).sort().join(',') !== 'id,requestSha256,tags' ||
      !Array.isArray(pending.tags) ||
      !pending.tags.length ||
      new Set(pending.tags.map((tag) => tag.Key)).size !== pending.tags.length ||
      pending.tags.some(
        (tag) => !original.tags.some((expected) => canonicalSha256(expected) === canonicalSha256(tag)),
      ) ||
      pending.requestSha256 !== canonicalSha256(regionalRequest(original, pending.tags))
    )
      throw Error('Original pending regional metadata request differs');
  }
  const save = () => store.write(checkpointName, checkpoint);
  for (const row of metadata) {
    const remaining = initialTags.get(row.id);
    if (!remaining) throw Error('Original metadata batch identity unavailable');
    if (checkpoint.completed.includes(row.id)) {
      if (remaining.length) throw Error('Previously retired metadata has reappeared');
      continue;
    }
    if (checkpoint.pending && checkpoint.pending.id !== row.id) throw Error('Metadata replay order differs');
    if (remaining.length) {
      const args = checkpoint.pending
        ? { Resources: [row.id], Tags: checkpoint.pending.tags }
        : { Resources: [row.id], Tags: remaining };
      if (!checkpoint.pending) {
        checkpoint.pending = { id: row.id, tags: remaining, requestSha256: canonicalSha256(args) };
        await save();
      }
      await retiredIdentity(row);
      await currentTags(row);
      await execute('ec2', 'delete-tags', args);
      if ((await currentTags(row)).length) throw Error('Metadata deletion acknowledged without verified retirement');
    }
    checkpoint.completed.push(row.id);
    checkpoint.pending = null;
    await save();
  }
  let regionalCurrent = await allRegionalTags();
  for (const row of metadata) {
    const remaining = regionalCurrent.get(row.id);
    if (!remaining) throw Error('Original regional batch identity unavailable');
    if (regional.completed.includes(row.id)) {
      if (remaining.length) throw Error('Previously retired regional metadata has reappeared');
      continue;
    }
    if (regional.pending && regional.pending.id !== row.id) throw Error('Regional metadata replay order differs');
    if (remaining.length) {
      const submitted = regional.pending?.tags ?? remaining;
      const args = regionalRequest(row, submitted);
      if (!regional.pending) {
        regional.pending = { id: row.id, tags: submitted, requestSha256: canonicalSha256(args) };
        await save();
      }
      await absent();
      await retiredIdentity(row);
      regionalCurrent = await allRegionalTags();
      if (regionalCurrent.get(row.id)?.length) {
        const response = await request('resourcegroupstaggingapi', 'untag-resources', args);
        const failed = object4(response.FailedResourcesMap);
        if (Object.keys(failed).length) throw Error('Regional metadata untagging reported failed resources');
        regionalCurrent = await allRegionalTags();
        if (regionalCurrent.get(row.id)?.length)
          throw Error('Regional metadata deletion acknowledged without verified retirement');
      }
    }
    regional.completed.push(row.id);
    regional.pending = null;
    await save();
  }
  if ([...(await allRegionalTags()).values()].some((tags) => tags.length))
    throw Error('Regional ownership metadata remains');
  await absent();
  if ((await knownDeploymentTags()).length) throw Error('Ownership metadata inventory remains');
  if ([...(await allCurrentTags())].some(([, tags]) => tags.length)) throw Error('Ownership metadata remains');
  if (checkpoint.phase !== 'retired') {
    checkpoint.phase = 'retired';
    await save();
  }
  return { status: 'metadata-retired', ...binding, resourceCount: metadata.length };
}

// plugins/aws/src/ce/terraform-destroy-ownership.ts
function object5(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed AWS teardown identity');
  return value;
}
function rows3(value) {
  if (!Array.isArray(value)) throw new Error('Incomplete AWS teardown inventory');
  return value.map(object5);
}
var tagged = {
  aws_vpc: ['describe-vpcs', '--vpc-ids', 'Vpcs', 'VpcId', 'vpc'],
  aws_subnet: ['describe-subnets', '--subnet-ids', 'Subnets', 'SubnetId', 'subnet'],
  aws_instance: ['describe-instances', '--instance-ids', 'Instances', 'InstanceId', 'i'],
  aws_network_interface: [
    'describe-network-interfaces',
    '--network-interface-ids',
    'NetworkInterfaces',
    'NetworkInterfaceId',
    'eni',
  ],
  aws_security_group: ['describe-security-groups', '--group-ids', 'SecurityGroups', 'GroupId', 'sg'],
  aws_route_table: ['describe-route-tables', '--route-table-ids', 'RouteTables', 'RouteTableId', 'rtb'],
  aws_internet_gateway: [
    'describe-internet-gateways',
    '--internet-gateway-ids',
    'InternetGateways',
    'InternetGatewayId',
    'igw',
  ],
  aws_eip: ['describe-addresses', '--allocation-ids', 'Addresses', 'AllocationId', 'eipalloc'],
  aws_ec2_transit_gateway_vpc_attachment: [
    'describe-transit-gateway-vpc-attachments',
    '--transit-gateway-attachment-ids',
    'TransitGatewayVpcAttachments',
    'TransitGatewayAttachmentId',
    'tgw-attach',
  ],
  aws_ec2_transit_gateway_connect: [
    'describe-transit-gateway-connects',
    '--transit-gateway-attachment-ids',
    'TransitGatewayConnects',
    'TransitGatewayAttachmentId',
    'tgw-attach',
  ],
  aws_ec2_transit_gateway_connect_peer: [
    'describe-transit-gateway-connect-peers',
    '--transit-gateway-connect-peer-ids',
    'TransitGatewayConnectPeers',
    'TransitGatewayConnectPeerId',
    'tgw-connect-peer',
  ],
};
var elbTagged = {
  aws_lb: [
    'describe-load-balancers',
    '--load-balancer-arns',
    'LoadBalancers',
    /^arn:[^:]+:elasticloadbalancing:[^:]+:\d{12}:loadbalancer\/net\/[A-Za-z0-9-]+\/[a-f0-9]+$/,
  ],
  aws_lb_target_group: [
    'describe-target-groups',
    '--target-group-arns',
    'TargetGroups',
    /^arn:[^:]+:elasticloadbalancing:[^:]+:\d{12}:targetgroup\/[A-Za-z0-9-]+\/[a-f0-9]+$/,
  ],
  aws_lb_listener: [
    'describe-listeners',
    '--listener-arns',
    'Listeners',
    /^arn:[^:]+:elasticloadbalancing:[^:]+:\d{12}:listener\/net\/[A-Za-z0-9-]+\/[a-f0-9]+\/[a-f0-9]+$/,
  ],
};
var relationships = {
  aws_route: [
    'route_table_id',
    'destination_cidr_block',
    'destination_ipv6_cidr_block',
    'destination_prefix_list_id',
    'gateway_id',
    'transit_gateway_id',
  ],
  aws_route_table_association: ['route_table_id', 'subnet_id', 'gateway_id'],
  aws_eip_association: ['allocation_id', 'network_interface_id', 'instance_id'],
  aws_ec2_transit_gateway_route_table_association: ['transit_gateway_attachment_id', 'transit_gateway_route_table_id'],
  aws_ec2_transit_gateway_route_table_propagation: ['transit_gateway_attachment_id', 'transit_gateway_route_table_id'],
  aws_lb_target_group_attachment: ['target_group_arn', 'target_id', 'port'],
};
async function verifyAwsTerraformDestroyOwnership(plan, receipt, session, rawApi, env, signal) {
  verifyAwsCePlan(plan);
  const intent = plan.intent;
  if (
    plan.engine !== 'terraform' ||
    receipt.schemaVersion !== 1 ||
    receipt.engine !== 'terraform' ||
    receipt.operation !== 'destroy' ||
    receipt.deploymentId !== intent.deploymentName ||
    receipt.backendIdentity !== `local:${intent.deploymentName}` ||
    (receipt.actionInvocations?.length ?? 0) > 0 ||
    !Array.isArray(receipt.changes) ||
    (!receipt.changes.length &&
      (receipt.noChanges !== true ||
        [receipt.planSha256, receipt.configurationSha256, receipt.providerLockSha256].some(
          (value) => typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value),
        ))) ||
    receipt.changes.some(
      (change) =>
        change.actions.join(',') !== 'delete' ||
        !new RegExp(`^${change.type}\\.[a-z][a-z0-9_]*$`).test(change.address) ||
        (!Object.hasOwn(tagged, change.type) &&
          !Object.hasOwn(elbTagged, change.type) &&
          !Object.hasOwn(relationships, change.type)),
    ) ||
    new Set(receipt.changes.map((change) => change.address)).size !== receipt.changes.length
  )
    throw new Error('Exact owning AWS Terraform destroy plan with supported resource types required');
  const api = scopedAwsApi(rawApi, intent.awsProfile, signal);
  const run = async (service, operation, args = []) => {
    const result = await api.exec('aws', [service, operation, ...args, '--region', intent.region, '--output', 'json']);
    signal?.throwIfAborted();
    if (result.exitCode !== 0) throw new Error('AWS teardown ownership observation unavailable');
    let value;
    try {
      value = object5(JSON.parse(result.stdout));
    } catch {
      throw new Error('Malformed AWS teardown response');
    }
    if (value.NextToken || value.NextMarker || value.nextToken) throw new Error('Partial AWS teardown inventory');
    return value;
  };
  if ((await run('sts', 'get-caller-identity')).Account !== intent.accountId)
    throw new Error('AWS teardown account differs from deployment');
  const fields = await session.readPlannedResourceFields(
    receipt,
    receipt.changes.length
      ? Object.fromEntries(
          receipt.changes.map((change) => [change.address, ['id', 'region', ...(relationships[change.type] ?? [])]]),
        )
      : { 'aws_vpc.ce': ['id'] },
    env,
    signal,
  );
  if (!receipt.changes.length) {
    if (fields['aws_vpc.ce'] !== null || Object.keys(fields).length !== 1)
      throw new Error('Empty Terraform destroy plan identity differs');
    delete fields['aws_vpc.ce'];
  }
  if (Object.keys(fields).length !== receipt.changes.length)
    throw new Error('Incomplete Terraform teardown projection');
  const states = receipt.changes.map((change) => {
    const value = object5(fields[change.address]);
    if (typeof value.id !== 'string' || !value.id || value.region !== intent.region)
      throw new Error('Terraform teardown resource identity or region differs');
    return { ...change, value };
  });
  const owned = (value, key = 'Tags') => {
    const tags = rows3(value[key]);
    const expected = {
      'xcsh-managed-by': 'aws-ce',
      'xcsh-execution-engine': 'terraform',
      'xcsh-deployment-id': intent.deploymentName,
      'xcsh-plan-sha256': plan.planSha256,
    };
    if (
      Object.entries(expected).some(([key, expectedValue]) => {
        const matching = tags.filter((tag) => tag.Key === key);
        return matching.length !== 1 || matching[0].Value !== expectedValue;
      })
    )
      throw new Error('AWS teardown resource is foreign to this deployment, plan, or engine');
  };
  const metadata = new Map();
  const live = new Map();
  for (const [type, [operation, flag, collection, idKey, prefix]] of Object.entries(tagged)) {
    const selected = states.filter((state) => state.type === type);
    if (!selected.length) continue;
    const ids = selected.map((state) => String(state.value.id));
    if (new Set(ids).size !== ids.length || ids.some((id) => !new RegExp(`^${prefix}-[a-f0-9]{8,21}$`).test(id)))
      throw new Error('Malformed or duplicate Terraform teardown resource IDs');
    const response = await run('ec2', operation, [flag, ...ids]);
    const observed =
      type === 'aws_instance'
        ? rows3(response.Reservations).flatMap((reservation) => rows3(reservation.Instances))
        : rows3(response[collection]);
    if (
      observed.length !== ids.length ||
      new Set(observed.map((item) => item[idKey])).size !== ids.length ||
      observed.some((item) => !ids.includes(String(item[idKey])))
    )
      throw new Error('AWS substituted or omitted teardown resource identities');
    for (const item of observed) {
      owned(item, type === 'aws_network_interface' ? 'TagSet' : 'Tags');
      const id = String(item[idKey]);
      if (live.has(id)) throw new Error('Duplicate teardown resource identity across types');
      const original = selected.find((state) => state.value.id === id);
      if (!original) throw Error('Original metadata resource projection unavailable');
      live.set(id, { type, value: item });
      metadata.set(id, {
        type,
        id,
        address: original.address,
        tags: awsTerraformMetadataProjection(
          plan,
          original.address,
          item[type === 'aws_network_interface' ? 'TagSet' : 'Tags'],
        ),
      });
    }
  }
  for (const [type, [operation, flag, collection, pattern]] of Object.entries(elbTagged)) {
    const selected = states.filter((state) => state.type === type);
    if (!selected.length) continue;
    const ids = selected.map((state) => String(state.value.id));
    if (new Set(ids).size !== ids.length || ids.some((id) => !pattern.test(id)))
      throw new Error('Malformed or duplicate Terraform NLB resource IDs');
    const response = await run('elbv2', operation, [flag, ...ids]);
    const observed = rows3(response[collection]);
    const idKey =
      type === 'aws_lb' ? 'LoadBalancerArn' : type === 'aws_lb_target_group' ? 'TargetGroupArn' : 'ListenerArn';
    if (
      observed.length !== ids.length ||
      new Set(observed.map((item) => item[idKey])).size !== ids.length ||
      observed.some((item) => !ids.includes(String(item[idKey])))
    )
      throw new Error('AWS substituted or omitted Terraform NLB identities');
    const descriptions = rows3((await run('elbv2', 'describe-tags', ['--resource-arns', ...ids])).TagDescriptions);
    if (descriptions.length !== ids.length) throw new Error('Terraform NLB ownership tags are incomplete');
    for (const item of observed) {
      const id = String(item[idKey]);
      const description = descriptions.filter((row) => row.ResourceArn === id);
      if (description.length !== 1) throw new Error('Terraform NLB ownership tags are ambiguous');
      owned(description[0]);
      if (live.has(id)) throw new Error('Duplicate teardown resource identity across types');
      live.set(id, { type, value: item });
    }
  }
  const parent = (id, types) => {
    const result = typeof id === 'string' ? live.get(id) : undefined;
    if (!result || !types.includes(result.type)) throw new Error('Teardown relationship has an unowned parent');
    return result.value;
  };
  const volumeIds = new Set();
  const volumeParents = new Map();
  for (const { type, value } of live.values())
    if (type === 'aws_instance') {
      const nics = rows3(value.NetworkInterfaces);
      if (!nics.length) throw new Error('Instance teardown NIC inventory is unavailable');
      for (const nic of nics) parent(nic.NetworkInterfaceId, ['aws_network_interface']);
      const disks = rows3(value.BlockDeviceMappings);
      if (!disks.length) throw new Error('Instance teardown disk inventory is unavailable');
      for (const disk of disks) {
        const id = object5(disk.Ebs).VolumeId;
        if (typeof id !== 'string' || !/^vol-[a-f0-9]{8,21}$/.test(id))
          throw new Error('Instance teardown volume identity is unavailable');
        if (volumeParents.has(id)) throw Error('Ambiguous attached volume lifecycle owner');
        volumeParents.set(id, String(value.InstanceId));
        volumeIds.add(id);
      }
    }
  if (volumeIds.size) {
    const volumes = rows3((await run('ec2', 'describe-volumes', ['--volume-ids', ...volumeIds])).Volumes);
    if (
      volumes.length !== volumeIds.size ||
      new Set(volumes.map((volume) => volume.VolumeId)).size !== volumeIds.size ||
      volumes.some((volume) => !volumeIds.has(String(volume.VolumeId)))
    )
      throw new Error('Instance teardown volume inventory differs');
    for (const volume of volumes) {
      owned(volume);
      const id = String(volume.VolumeId),
        parentInstanceId = volumeParents.get(id);
      if (!parentInstanceId) throw Error('Original volume lifecycle parent unavailable');
      const parent = states.find((state) => state.type === 'aws_instance' && state.value.id === parentInstanceId);
      if (!parent) throw Error('Original volume parent projection unavailable');
      metadata.set(id, {
        type: 'aws_ebs_volume',
        id,
        address: parent.address,
        parentInstanceId,
        tags: awsTerraformMetadataProjection(plan, parent.address, volume.Tags),
      });
    }
  }
  const tables = new Map();
  const tgwTable = async (id) => {
    if (typeof id !== 'string' || !/^tgw-rtb-[a-f0-9]{8,21}$/.test(id)) throw new Error('Invalid referenced TGW table');
    const cached = tables.get(id);
    if (cached) return cached;
    const gateways = rows3(
      (await run('ec2', 'describe-transit-gateways', ['--transit-gateway-ids', intent.routing.transitGatewayId ?? '']))
        .TransitGateways,
    );
    if (
      gateways.length !== 1 ||
      gateways[0].TransitGatewayId !== intent.routing.transitGatewayId ||
      gateways[0].OwnerId !== intent.accountId
    )
      throw new Error('Referenced transit gateway ownership differs');
    const tableRows = rows3(
      (await run('ec2', 'describe-transit-gateway-route-tables', ['--transit-gateway-route-table-ids', id]))
        .TransitGatewayRouteTables,
    );
    if (
      tableRows.length !== 1 ||
      tableRows[0].TransitGatewayRouteTableId !== id ||
      tableRows[0].TransitGatewayId !== intent.routing.transitGatewayId
    )
      throw new Error('Referenced transit gateway table identity differs');
    const result = {
      associations: rows3(
        (await run('ec2', 'get-transit-gateway-route-table-associations', ['--transit-gateway-route-table-id', id]))
          .Associations,
      ),
      propagations: rows3(
        (await run('ec2', 'get-transit-gateway-route-table-propagations', ['--transit-gateway-route-table-id', id]))
          .TransitGatewayRouteTablePropagations,
      ),
    };
    tables.set(id, result);
    return result;
  };
  for (const { type, value } of states) {
    if (type === 'aws_route') {
      const table = parent(value.route_table_id, ['aws_route_table']);
      if (
        typeof value.destination_cidr_block !== 'string' ||
        !value.destination_cidr_block ||
        value.destination_ipv6_cidr_block ||
        value.destination_prefix_list_id
      )
        throw new Error('Teardown route destination requires explicit translation');
      const matches = rows3(table.Routes).filter(
        (route) => route.DestinationCidrBlock === value.destination_cidr_block,
      );
      if (matches.length !== 1 || (value.gateway_id && value.transit_gateway_id))
        throw new Error('Teardown route is ambiguous');
      if (value.gateway_id) {
        parent(value.gateway_id, ['aws_internet_gateway']);
        if (matches[0].GatewayId !== value.gateway_id) throw new Error('Teardown route gateway differs');
      } else if (
        !value.transit_gateway_id ||
        value.transit_gateway_id !== intent.routing.transitGatewayId ||
        matches[0].TransitGatewayId !== value.transit_gateway_id
      )
        throw new Error('Teardown route target differs');
    } else if (type === 'aws_route_table_association') {
      const table = parent(value.route_table_id, ['aws_route_table']);
      parent(value.subnet_id, ['aws_subnet']);
      const matches = rows3(table.Associations).filter((edge) => edge.RouteTableAssociationId === value.id);
      if (
        value.gateway_id ||
        matches.length !== 1 ||
        matches[0].SubnetId !== value.subnet_id ||
        matches[0].RouteTableId !== value.route_table_id
      )
        throw new Error('Teardown subnet association differs');
    } else if (type === 'aws_eip_association') {
      const eip = parent(value.allocation_id, ['aws_eip']);
      parent(value.network_interface_id, ['aws_network_interface']);
      if (value.instance_id) parent(value.instance_id, ['aws_instance']);
      if (
        (value.instance_id && eip.InstanceId !== value.instance_id) ||
        eip.AssociationId !== value.id ||
        eip.NetworkInterfaceId !== value.network_interface_id
      )
        throw new Error('Teardown EIP association differs');
    } else if (type === 'aws_lb_target_group_attachment') {
      const group = parent(value.target_group_arn, ['aws_lb_target_group']);
      if (
        typeof value.target_id !== 'string' ||
        ![...live.values()].some(
          (row) => row.type === 'aws_network_interface' && row.value.PrivateIpAddress === value.target_id,
        ) ||
        !Number.isInteger(value.port) ||
        value.port !== (intent.ingress?.mode === 'nlb' ? intent.ingress.port : 443)
      )
        throw new Error('Teardown NLB target attachment differs');
      const health = rows3(
        (
          await run('elbv2', 'describe-target-health', [
            '--target-group-arn',
            String(group.TargetGroupArn),
            '--targets',
            `Id=${value.target_id},Port=${value.port}`,
          ])
        ).TargetHealthDescriptions,
      );
      if (
        health.length !== 1 ||
        object5(health[0].Target).Id !== value.target_id ||
        object5(health[0].Target).Port !== value.port
      )
        throw new Error('Teardown NLB target health identity differs');
    } else if (type.startsWith('aws_ec2_transit_gateway_route_table_')) {
      parent(value.transit_gateway_attachment_id, [
        'aws_ec2_transit_gateway_connect',
        'aws_ec2_transit_gateway_vpc_attachment',
      ]);
      const association = type.endsWith('_association');
      if (
        !(association ? intent.routing.associations : intent.routing.propagations)?.includes(
          String(value.transit_gateway_route_table_id),
        )
      )
        throw new Error('Teardown TGW table is outside approved references');
      const table = await tgwTable(value.transit_gateway_route_table_id);
      const matches = rows3(table[association ? 'associations' : 'propagations']).filter(
        (edge) => edge.TransitGatewayAttachmentId === value.transit_gateway_attachment_id,
      );
      if (matches.length !== 1) throw new Error('Teardown TGW relationship is absent or ambiguous');
    }
  }
  const loadBalancers = [...live.values()].filter((row) => row.type === 'aws_lb').map((row) => row.value);
  const targetGroups = [...live.values()].filter((row) => row.type === 'aws_lb_target_group').map((row) => row.value);
  const listeners = [...live.values()].filter((row) => row.type === 'aws_lb_listener').map((row) => row.value);
  if (loadBalancers.length || targetGroups.length || listeners.length) {
    const ingress = intent.ingress?.mode === 'nlb' ? intent.ingress : undefined;
    if (
      loadBalancers.length !== 1 ||
      targetGroups.length !== 1 ||
      listeners.length !== 1 ||
      loadBalancers[0].Type !== 'network' ||
      loadBalancers[0].Scheme !== (ingress ? 'internal' : 'internet-facing') ||
      parent(loadBalancers[0].VpcId, ['aws_vpc']).VpcId !== loadBalancers[0].VpcId ||
      targetGroups[0].VpcId !== loadBalancers[0].VpcId ||
      targetGroups[0].Protocol !== 'TCP' ||
      targetGroups[0].Port !== (ingress?.port ?? 443) ||
      listeners[0].LoadBalancerArn !== loadBalancers[0].LoadBalancerArn ||
      listeners[0].Protocol !== 'TCP' ||
      listeners[0].Port !== (ingress?.port ?? 443)
    )
      throw new Error('Terraform NLB topology differs from the ingress intent');
    const actions = rows3(listeners[0].DefaultActions);
    if (
      actions.length !== 1 ||
      actions[0].Type !== 'forward' ||
      actions[0].TargetGroupArn !== targetGroups[0].TargetGroupArn
    )
      throw new Error('Terraform NLB listener target differs');
  }
  const material = {
    schemaVersion: 1,
    engine: 'terraform',
    accountId: intent.accountId,
    region: intent.region,
    deploymentId: intent.deploymentName,
    sourcePlanSha256: plan.planSha256,
    terraformPlanSha256: receipt.planSha256,
    ...(!states.length
      ? {
          emptyState: {
            schemaVersion: 1,
            source: 'owning-empty-destroy-plan',
            terraformPlanSha256: receipt.planSha256,
            configurationSha256: receipt.configurationSha256,
            providerLockSha256: receipt.providerLockSha256,
            backendIdentity: receipt.backendIdentity,
            resourceProjectionSha256: canonicalSha256({ 'aws_vpc.ce': null }),
          },
        }
      : {}),
    resources: [...live.entries()]
      .map(([id, row]) => ({ type: row.type, id }))
      .concat([...volumeIds].map((id) => ({ type: 'aws_ebs_volume', id }))),
    metadata: [...metadata.values()],
    tgwEdges: states
      .filter((row) => row.type.startsWith('aws_ec2_transit_gateway_route_table_'))
      .map((row) => ({
        kind: row.type.endsWith('_association') ? 'association' : 'propagation',
        tableId: String(row.value.transit_gateway_route_table_id),
        attachmentId: String(row.value.transit_gateway_attachment_id),
      })),
  };
  return {
    inventory: { ...material, sha256: canonicalSha256(material) },
    source: 'aws-cli-live+terraform-saved-plan',
    observedAt: new Date().toISOString(),
    engine: 'terraform',
    accountId: intent.accountId,
    region: intent.region,
    planSha256: plan.planSha256,
    terraformPlanSha256: receipt.planSha256,
    configurationSha256: receipt.configurationSha256,
    resourceCount: states.length,
    attachedVolumeCount: volumeIds.size,
  };
}

// plugins/aws/src/ce/terraform-direct-retirement.ts
import { createHash as createHash3 } from 'node:crypto';

var hash2 = (s) => createHash3('sha256').update(s).digest('hex');
var marker = 'terraform-direct-retirement.json';
var sourceFile = 'terraform-direct-retirement-source.json';
var targetFields = [
  'gateway_id',
  'nat_gateway_id',
  'network_interface_id',
  'transit_gateway_id',
  'vpc_peering_connection_id',
];
async function retireAwsTerraformDirectRoutes(plan, ownership, session, storage, api, env, signal) {
  const owner = storage.owner;
  if (
    owner.engine !== 'terraform' ||
    owner.provider !== 'aws' ||
    owner.deploymentId !== plan.deploymentName ||
    owner.account !== plan.accountId ||
    owner.region !== plan.region ||
    !session.readConfigurationSha256 ||
    !session.planRelinquishments ||
    !session.readResourceIdentities
  )
    throw Error('Direct retirement requires exact durable owner and owning runner capabilities');
  signal?.throwIfAborted();
  const readConfigurationSha256 = session.readConfigurationSha256.bind(session);
  const planRelinquishments = session.planRelinquishments.bind(session);
  const readResourceIdentities = session.readResourceIdentities.bind(session);
  await storage.verify();
  if (canonicalSha256(await storage.read('terraform-direct-ownership.json')) !== canonicalSha256(ownership))
    throw Error('Direct retirement original ownership differs from durable snapshot');
  const routeNames = ownership.routes.map((r) => r.address);
  const checkReceipt = (receipt, configurationSha256, action) => {
    if (
      receipt.engine !== 'terraform' ||
      receipt.deploymentId !== plan.deploymentName ||
      receipt.configurationSha256 !== configurationSha256 ||
      receipt.operation ||
      receipt.imports?.length ||
      receipt.actionInvocations?.length ||
      new Set(receipt.changes.map((c) => c.address)).size !== receipt.changes.length ||
      ownership.routes.some(
        (r) => receipt.changes.filter((c) => c.address === r.address && c.type === 'aws_route').length !== 1,
      ) ||
      receipt.changes.some(
        (c) =>
          c.actions.length !== 1 ||
          (routeNames.includes(c.address) ? !['no-op', action].includes(c.actions[0]) : c.actions[0] !== 'no-op'),
      )
    )
      throw Error('Direct retirement saved plan would change unexpected resources');
  };
  const fields = Object.fromEntries(
    ownership.routes.map((r) => [r.address, ['route_table_id', 'destination_cidr_block', ...targetFields]]),
  );
  const checkFields = (values, desired) => {
    if (canonicalSha256(Object.keys(values).sort()) !== canonicalSha256(routeNames.slice().sort()))
      throw Error('Direct retirement route field inventory incomplete');
    for (const route of ownership.routes) {
      const v = values[route.address];
      const target = desired === 'ce' ? 'network_interface_id' : route.originalTarget.field;
      const id = desired === 'ce' ? route.networkInterfaceId : route.originalTarget.id;
      if (
        !v ||
        v.route_table_id !== route.routeTableId ||
        v.destination_cidr_block !== route.destinationCidr ||
        targetFields.some((f) => !Object.hasOwn(v, f) || (f === target ? v[f] !== id : ![null, ''].includes(v[f])))
      )
        throw Error('Direct retirement prior/proposed route ownership differs');
    }
  };
  const checkSource = (checkpoint, source) => {
    if (
      source?.schemaVersion !== 1 ||
      !['ce', 'original'].includes(source.initialPhase) ||
      source.engine !== 'terraform' ||
      source.sourcePlanSha256 !== plan.planSha256 ||
      source.ownershipSha256 !== ownership.snapshotSha256 ||
      typeof source.initialConfiguration !== 'string' ||
      hash2(source.initialConfiguration) !== source.initialConfigurationSha256 ||
      typeof source.restoredConfiguration !== 'string' ||
      typeof source.relinquishedConfiguration !== 'string' ||
      hash2(source.restoredConfiguration) !== source.restoredConfigurationSha256 ||
      hash2(source.relinquishedConfiguration) !== source.relinquishedConfigurationSha256 ||
      checkpoint.schemaVersion !== 1 ||
      checkpoint.engine !== 'terraform' ||
      checkpoint.sourcePlanSha256 !== plan.planSha256 ||
      checkpoint.ownershipSha256 !== ownership.snapshotSha256 ||
      checkpoint.sourceSha256 !== canonicalSha256(source)
    )
      throw Error('Direct retirement source or checkpoint differs');
    const restoration = renderAwsTerraformDirectTransition(
      plan,
      ownership,
      source.initialConfiguration,
      source.initialPhase,
      'original',
    );
    if (restoration.configuration !== source.restoredConfiguration)
      throw Error('Direct retirement initial translation differs');
    const removal = renderAwsTerraformDirectTransition(
      plan,
      ownership,
      source.restoredConfiguration,
      'original',
      'relinquished',
      source.stateIds,
    );
    if (removal.configuration !== source.relinquishedConfiguration)
      throw Error('Direct retirement translation differs');
    return removal;
  };
  const checkpointFor = (source, phase, extra = {}) => ({
    schemaVersion: 1,
    engine: 'terraform',
    sourcePlanSha256: plan.planSha256,
    ownershipSha256: ownership.snapshotSha256,
    sourceSha256: canonicalSha256(source),
    phase,
    ...extra,
  });
  const readOptional = async (name) => {
    try {
      return await storage.read(name);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return;
    }
  };
  const readRouteIds = async () => {
    const identities = (await readResourceIdentities(env, signal)).filter((r) => routeNames.includes(r.address));
    if (
      identities.length !== routeNames.length ||
      new Set(identities.map((r) => r.address)).size !== routeNames.length ||
      new Set(identities.map((r) => r.id)).size !== routeNames.length ||
      identities.some((r) => r.type !== 'aws_route' || typeof r.id !== 'string' || !r.id)
    )
      throw Error('Direct retirement route state identity differs');
    return Object.fromEntries(identities.map((r) => [r.address, r.id]));
  };
  const verifyRouteIds = async (source) => {
    if (canonicalSha256(await readRouteIds()) !== canonicalSha256(source.stateIds))
      throw Error('Direct retirement route state identity changed');
  };
  const verifySubmitted = async (source, receipt, kind) => {
    if (!session.readPlanApplicationState || !session.readAppliedResourceFields || !session.reconcileApplyFromEvidence)
      throw Error('Direct retirement requires owning journal reconciliation capabilities');
    const state = await session.readPlanApplicationState(receipt);
    if (!['applying', 'applied'].includes(state))
      throw Error('Direct retirement reconciliation requires a submitted exact plan');
    const fields = Object.fromEntries(
      ownership.routes.map((route) => [
        route.address,
        ['id', 'route_table_id', 'destination_cidr_block', route.originalTarget.field],
      ]),
    );
    const first = await session.readAppliedResourceFields(receipt, fields, env, signal);
    const cloud = await observeAwsTerraformDirectPhase(plan, ownership, 'original', api, signal);
    const second = await session.readAppliedResourceFields(receipt, fields, env, signal);
    if (
      canonicalSha256(first) !== canonicalSha256(second) ||
      canonicalSha256(Object.keys(second).sort()) !== canonicalSha256(routeNames.slice().sort())
    )
      throw Error('Direct retirement applied-state inventory incomplete or changed');
    for (const route of ownership.routes) {
      const value = second[route.address];
      if (
        kind === 'relinquishment'
          ? value !== null
          : !value ||
            value.id !== source.stateIds[route.address] ||
            value.route_table_id !== route.routeTableId ||
            value.destination_cidr_block !== route.destinationCidr ||
            value[route.originalTarget.field] !== route.originalTarget.id
      )
        throw Error('Direct retirement submitted outcome differs from original route ownership');
    }
    const evidence = {
      schemaVersion: 1,
      engine: 'terraform',
      sourceSha256: canonicalSha256(source),
      receipt,
      first,
      cloud,
      second,
    };
    await storage.verify();
    await storage.write(`terraform-direct-${kind}-reconciliation.json`, evidence);
    signal?.throwIfAborted();
    if (state === 'applying') await session.reconcileApplyFromEvidence(receipt, canonicalSha256(evidence));
  };
  const finishRelinquishment = async (source, saved, preparing = false) => {
    const removal = renderAwsTerraformDirectTransition(
      plan,
      ownership,
      source.restoredConfiguration,
      'original',
      'relinquished',
      source.stateIds,
    );
    if (preparing) {
      if (saved && (await session.readPlanApplicationState(saved)) !== 'planned')
        throw Error('Relinquishment preparation cannot reconcile a submitted plan');
      await verifyRouteIds(source);
      await observeAwsTerraformDirectPhase(plan, ownership, 'original', api, signal);
    }
    let configurationSha256 = await readConfigurationSha256();
    const configuration = await session.readConfiguration(configurationSha256);
    if (configurationSha256 === source.restoredConfigurationSha256 && configuration === source.restoredConfiguration) {
      if (saved) throw Error('Relinquishment plan cannot belong to restored configuration');
      await observeAwsTerraformDirectPhase(plan, ownership, 'original', api, signal);
      configurationSha256 = await session.reviseConfiguration(configurationSha256, removal.configuration);
    } else if (
      configurationSha256 !== source.relinquishedConfigurationSha256 ||
      configuration !== removal.configuration
    )
      throw Error('Direct relinquishment configuration identity differs');
    if (configurationSha256 !== source.relinquishedConfigurationSha256)
      throw Error('Direct relinquishment revision differs');
    const forget = saved ?? (await planRelinquishments(removal.intents, env, signal));
    checkReceipt(forget, configurationSha256, 'forget');
    if (
      canonicalSha256(forget.relinquishments) !== canonicalSha256(removal.intents) ||
      forget.changes.filter((c) => routeNames.includes(c.address)).some((c) => c.actions.join(',') !== 'forget')
    )
      throw Error('Direct relinquishment saved plan identity differs');
    if (!saved) await storage.write('terraform-direct-relinquishment-plan.json', forget);
    await storage.verify();
    await storage.write(marker, checkpointFor(source, 'relinquishment-pending'));
    const application = saved ? await session.readPlanApplicationState(forget) : 'planned';
    if (application === 'planned') {
      await verifyRouteIds(source);
      await observeAwsTerraformDirectPhase(plan, ownership, 'original', api, signal);
      await session.apply(forget, env, signal);
    } else await verifySubmitted(source, forget, 'relinquishment');
    if ((await readResourceIdentities(env, signal)).some((r) => routeNames.includes(r.address)))
      throw Error('Direct routes remain in Terraform state after relinquishment');
    const preserved = await observeAwsTerraformDirectPhase(plan, ownership, 'original', api, signal);
    await storage.write(marker, checkpointFor(source, 'preserved', { configurationSha256, preserved }));
    return { status: 'direct-routes-preserved', preserved, configurationSha256 };
  };
  const finishRestoration = async (source) => {
    const currentSha = await readConfigurationSha256();
    if (
      currentSha !== source.restoredConfigurationSha256 ||
      (await session.readConfiguration(currentSha)) !== source.restoredConfiguration
    )
      throw Error('Restoration refresh configuration identity differs');
    const identities = (await readResourceIdentities(env, signal)).filter((r) => routeNames.includes(r.address));
    if (
      identities.length !== routeNames.length ||
      new Set(identities.map((r) => r.address)).size !== routeNames.length ||
      identities.some((r) => r.type !== 'aws_route' || r.id !== source.stateIds[r.address])
    )
      throw Error('Restoration refresh route state identity differs');
    const restoration = await observeAwsTerraformDirectPhase(plan, ownership, 'original', api, signal);
    await storage.verify();
    await storage.write(marker, checkpointFor(source, 'restoration-refresh-pending', { restoration }));
    const refresh = await session.plan(env, signal);
    if (
      !refresh.noChanges ||
      refresh.engine !== 'terraform' ||
      refresh.deploymentId !== plan.deploymentName ||
      refresh.configurationSha256 !== source.restoredConfigurationSha256 ||
      refresh.operation ||
      refresh.imports?.length ||
      refresh.relinquishments?.length ||
      refresh.actionInvocations?.length ||
      refresh.changes.some((c) => c.actions.join(',') !== 'no-op')
    )
      throw Error('Restored direct routes did not converge to ordinary no-change state');
    const restoredIds = await session.readPlannedResourceIds(refresh, routeNames, env, signal);
    if (canonicalSha256(source.stateIds) !== canonicalSha256(restoredIds))
      throw Error('Direct route state identity changed during restoration');
    await storage.write(marker, checkpointFor(source, 'relinquishment-preparing', { restoration, refresh }));
    return finishRelinquishment(source, undefined, true);
  };
  const prepareRestoration = async (source) => {
    await verifyRouteIds(source);
    await observeAwsTerraformDirectPhase(plan, ownership, source.initialPhase, api, signal);
    let currentSha = await readConfigurationSha256();
    const current = await session.readConfiguration(currentSha);
    const saved = await readOptional('terraform-direct-restoration-plan.json');
    if (currentSha === source.initialConfigurationSha256 && current === source.initialConfiguration) {
      if (saved && currentSha !== source.restoredConfigurationSha256)
        throw Error('Restoration plan cannot belong to initial configuration');
      if (current !== source.restoredConfiguration)
        currentSha = await session.reviseConfiguration(currentSha, source.restoredConfiguration);
    } else if (currentSha !== source.restoredConfigurationSha256 || current !== source.restoredConfiguration)
      throw Error('Direct restoration preparation configuration differs');
    if (currentSha !== source.restoredConfigurationSha256)
      throw Error('Direct restoration configuration identity differs');
    const receipt = saved ?? (await session.plan(env, signal));
    checkReceipt(receipt, currentSha, 'update');
    if (receipt.relinquishments?.length) throw Error('Restoration cannot relinquish state');
    if ((await session.readPlanApplicationState(receipt)) !== 'planned')
      throw Error('Restoration preparation cannot reconcile a submitted plan');
    checkFields(await session.readPlannedResourceFields(receipt, fields, env, signal), source.initialPhase);
    checkFields(await session.readProposedResourceFields(receipt, fields, env, signal), 'original');
    if (
      canonicalSha256(await session.readPlannedResourceIds(receipt, routeNames, env, signal)) !==
      canonicalSha256(source.stateIds)
    )
      throw Error('Direct retirement planned state identity differs');
    if (!saved) await storage.write('terraform-direct-restoration-plan.json', receipt);
    await storage.verify();
    await storage.write(marker, checkpointFor(source, 'restoration-pending'));
    await verifyRouteIds(source);
    await observeAwsTerraformDirectPhase(plan, ownership, source.initialPhase, api, signal);
    await session.apply(receipt, env, signal);
    return finishRestoration(source);
  };
  let prior;
  try {
    prior = await storage.read(marker);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (prior !== undefined) {
    const checkpoint = prior;
    if (
      !checkpoint ||
      ![
        'preserved',
        'restoration-preparing',
        'restoration-pending',
        'restoration-refresh-pending',
        'relinquishment-preparing',
        'relinquishment-pending',
      ].includes(String(checkpoint.phase))
    )
      throw Error('Existing direct retirement attempt requires evidence reconciliation before replay');
    const source = await storage.read(sourceFile);
    checkSource(checkpoint, source);
    if (checkpoint.phase === 'restoration-preparing') return prepareRestoration(source);
    if (checkpoint.phase === 'relinquishment-preparing')
      return finishRelinquishment(source, await readOptional('terraform-direct-relinquishment-plan.json'), true);
    if (checkpoint.phase === 'restoration-refresh-pending') return finishRestoration(source);
    if (checkpoint.phase === 'restoration-pending') {
      const receipt = await storage.read('terraform-direct-restoration-plan.json');
      checkReceipt(receipt, source.restoredConfigurationSha256, 'update');
      if (receipt.relinquishments?.length) throw Error('Restoration cannot relinquish state');
      const currentSha = await session.readConfigurationSha256();
      if (
        currentSha !== source.restoredConfigurationSha256 ||
        (await session.readConfiguration(currentSha)) !== source.restoredConfiguration
      )
        throw Error('Interrupted restoration configuration differs');
      if ((await session.readPlanApplicationState(receipt)) === 'planned') {
        checkFields(await session.readPlannedResourceFields(receipt, fields, env, signal), source.initialPhase);
        checkFields(await session.readProposedResourceFields(receipt, fields, env, signal), 'original');
        if (
          canonicalSha256(await session.readPlannedResourceIds(receipt, routeNames, env, signal)) !==
          canonicalSha256(source.stateIds)
        )
          throw Error('Unsubmitted restoration state identity changed');
        await verifyRouteIds(source);
        await observeAwsTerraformDirectPhase(plan, ownership, source.initialPhase, api, signal);
        await storage.verify();
        await session.apply(receipt, env, signal);
      } else await verifySubmitted(source, receipt, 'restoration');
      return finishRestoration(source);
    }
    if (checkpoint.phase === 'relinquishment-pending') {
      let saved;
      try {
        saved = await storage.read('terraform-direct-relinquishment-plan.json');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (!saved)
        throw Error('Interrupted relinquishment has no durable exact plan; preparation reconciliation required');
      return finishRelinquishment(source, saved);
    }
    if (checkpoint.configurationSha256 !== source.relinquishedConfigurationSha256)
      throw Error('Completed direct retirement checkpoint configuration differs');
    signal?.throwIfAborted();
    const configurationSha256 = await session.readConfigurationSha256();
    if (
      configurationSha256 !== source.relinquishedConfigurationSha256 ||
      (await session.readConfiguration(configurationSha256)) !== source.relinquishedConfiguration
    )
      throw Error('Completed direct retirement configuration differs');
    if ((await session.readResourceIdentities(env, signal)).some((row) => routeNames.includes(row.address)))
      throw Error('Completed direct retirement route state reappeared');
    const preserved = await observeAwsTerraformDirectPhase(plan, ownership, 'original', api, signal);
    const final = await session.plan(env, signal);
    if (
      final.engine !== 'terraform' ||
      final.deploymentId !== plan.deploymentName ||
      final.configurationSha256 !== configurationSha256 ||
      !final.noChanges ||
      final.operation ||
      final.imports?.length ||
      final.relinquishments?.length ||
      final.actionInvocations?.length ||
      final.changes.some((change) => change.actions.join(',') !== 'no-op' || routeNames.includes(change.address))
    )
      throw Error('Completed direct retirement did not converge to ordinary no-change state');
    await storage.verify();
    await storage.write('terraform-direct-retirement-resume-observation.json', { preserved, final });
    return { status: 'direct-routes-preserved', preserved, configurationSha256 };
  }
  signal?.throwIfAborted();
  const orphan = await readOptional(sourceFile);
  if (orphan !== undefined) {
    checkSource(checkpointFor(orphan, 'restoration-preparing'), orphan);
    const currentSha = await readConfigurationSha256();
    if (
      currentSha !== orphan.initialConfigurationSha256 ||
      (await session.readConfiguration(currentSha)) !== orphan.initialConfiguration ||
      (await readOptional('terraform-direct-restoration-plan.json')) !== undefined ||
      (await readOptional('terraform-direct-relinquishment-plan.json')) !== undefined
    )
      throw Error('Orphan direct retirement source differs from unmodified preparation');
    await verifyRouteIds(orphan);
    await observeAwsTerraformDirectPhase(plan, ownership, orphan.initialPhase, api, signal);
    await storage.verify();
    await storage.write(marker, checkpointFor(orphan, 'restoration-preparing'));
    return prepareRestoration(orphan);
  }
  const configurationSha256 = await readConfigurationSha256();
  const current = await session.readConfiguration(configurationSha256);
  let phase = 'ce';
  let restored;
  try {
    restored = renderAwsTerraformDirectTransition(plan, ownership, current, 'ce', 'original');
  } catch {
    phase = 'original';
    restored = renderAwsTerraformDirectTransition(plan, ownership, current, 'original', 'original');
  }
  const ids = await readRouteIds();
  const removal = renderAwsTerraformDirectTransition(
    plan,
    ownership,
    restored.configuration,
    'original',
    'relinquished',
    ids,
  );
  const source = {
    schemaVersion: 1,
    engine: 'terraform',
    sourcePlanSha256: plan.planSha256,
    ownershipSha256: ownership.snapshotSha256,
    initialConfiguration: current,
    initialConfigurationSha256: configurationSha256,
    restoredConfiguration: restored.configuration,
    restoredConfigurationSha256: hash2(restored.configuration),
    relinquishedConfiguration: removal.configuration,
    relinquishedConfigurationSha256: hash2(removal.configuration),
    stateIds: ids,
    initialPhase: phase,
  };
  await observeAwsTerraformDirectPhase(plan, ownership, phase, api, signal);
  await verifyRouteIds(source);
  await storage.verify();
  await storage.write(sourceFile, source);
  await storage.write(marker, checkpointFor(source, 'restoration-preparing'));
  return prepareRestoration(source);
}

// plugins/aws/src/ce/terraform-cloud-teardown.ts
var digest = (value) => createHash4('sha256').update(value).digest('hex');
var sourceFile2 = 'terraform-cloud-teardown-source.json';
var checkpointFile = 'terraform-cloud-teardown.json';
async function optional6(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return;
  }
}
function retiredConfiguration(plan, configuration) {
  const config = JSON.parse(configuration);
  const provider = config?.provider?.aws;
  if (
    !provider ||
    provider.region !== plan.intent.region ||
    JSON.stringify(provider.allowed_account_ids) !== JSON.stringify([plan.intent.accountId]) ||
    (provider.profile ?? undefined) !== plan.intent.awsProfile ||
    !config.terraform
  )
    throw new Error('Terraform teardown configuration scope differs');
  return JSON.stringify({ terraform: config.terraform, provider: config.provider });
}
async function runAwsTerraformCloudTeardown(plan, session, storage, api, env, signal, expectedInitialInstanceIds) {
  verifyAwsCePlan(plan);
  if (expectedInitialInstanceIds) {
    expectedInitialInstanceIds = [...expectedInitialInstanceIds];
    if (
      plan.intent.topology.nodeCount !== 1 ||
      expectedInitialInstanceIds.length !== 1 ||
      !/^i-[0-9a-f]{8,17}$/.test(expectedInitialInstanceIds[0])
    )
      throw new Error('Initial registration requires one resolved original instance ID');
  }
  const owner = storage.owner;
  if (
    plan.engine !== 'terraform' ||
    owner.engine !== 'terraform' ||
    owner.provider !== 'aws' ||
    owner.deploymentId !== plan.intent.deploymentName ||
    owner.account !== plan.intent.accountId ||
    owner.region !== plan.intent.region
  )
    throw new Error('Terraform cloud teardown ownership differs');
  signal?.throwIfAborted();
  await storage.verify();
  let source = await optional6(storage, sourceFile2);
  let checkpoint = await optional6(storage, checkpointFile);
  const direct =
    plan.intent.routing.profile === 'direct-eni' &&
    (plan.intent.vpc.mode === 'brownfield' || plan.intent.routes.length > 0);
  if (source === undefined) {
    if (checkpoint !== undefined) throw new Error('Terraform teardown source snapshot is missing');
    if (direct) {
      const original = await optional6(storage, 'terraform-direct-ownership.json');
      if (!original) throw new Error('Direct cloud teardown requires original route ownership');
      await retireAwsTerraformDirectRoutes(plan, original, session, storage, api, env, signal);
    }
    const receipt = await session.planDestroy(env, signal);
    const configuration = await session.readConfiguration(receipt.configurationSha256);
    const retired = retiredConfiguration(plan, configuration);
    source = {
      schemaVersion: 1,
      engine: 'terraform',
      sourcePlanSha256: plan.planSha256,
      configuration,
      configurationSha256: digest(configuration),
      retiredConfiguration: retired,
      retiredConfigurationSha256: digest(retired),
    };
    await storage.write(sourceFile2, source);
  }
  if (
    !source ||
    source.schemaVersion !== 1 ||
    source.engine !== 'terraform' ||
    source.sourcePlanSha256 !== plan.planSha256 ||
    typeof source.configuration !== 'string' ||
    typeof source.retiredConfiguration !== 'string' ||
    digest(source.configuration) !== source.configurationSha256 ||
    digest(source.retiredConfiguration) !== source.retiredConfigurationSha256 ||
    retiredConfiguration(plan, source.configuration) !== source.retiredConfiguration
  )
    throw new Error('Terraform teardown source snapshot is forged or differs');
  if (direct) {
    const retirement = await optional6(storage, 'terraform-direct-retirement.json');
    const original = await optional6(storage, 'terraform-direct-ownership.json');
    const directSource = await optional6(storage, 'terraform-direct-retirement-source.json');
    if (
      !retirement ||
      !original ||
      !directSource ||
      retirement.phase !== 'preserved' ||
      retirement.sourcePlanSha256 !== plan.planSha256 ||
      retirement.ownershipSha256 !== original.snapshotSha256 ||
      retirement.sourceSha256 !== canonicalSha256(directSource) ||
      directSource.sourcePlanSha256 !== plan.planSha256 ||
      directSource.ownershipSha256 !== original.snapshotSha256 ||
      directSource.relinquishedConfiguration !== source.configuration ||
      retirement.configurationSha256 !== source.configurationSha256
    )
      throw new Error('Direct cloud teardown preservation evidence differs from destruction source');
    if (
      typeof directSource.restoredConfiguration !== 'string' ||
      renderAwsTerraformDirectTransition(
        plan,
        original,
        directSource.restoredConfiguration,
        'original',
        'relinquished',
        directSource.stateIds,
      ).configuration !== source.configuration
    )
      throw new Error('Direct cloud teardown preserved configuration translation differs');
    if (
      !session.readResourceIdentities ||
      (await session.readResourceIdentities(env, signal)).some((row) =>
        original.routes.some((route) => route.address === row.address),
      )
    )
      throw new Error('Direct cloud teardown original routes remain in managed state');
  }
  if (checkpoint === undefined) {
    checkpoint = {
      schemaVersion: 1,
      engine: 'terraform',
      sourcePlanSha256: plan.planSha256,
      configurationSha256: source.configurationSha256,
      retiredConfigurationSha256: source.retiredConfigurationSha256,
      phase: 'destroy-pending',
    };
    await storage.write(checkpointFile, checkpoint);
  }
  if (
    !checkpoint ||
    checkpoint.schemaVersion !== 1 ||
    checkpoint.engine !== 'terraform' ||
    checkpoint.sourcePlanSha256 !== plan.planSha256 ||
    checkpoint.configurationSha256 !== source.configurationSha256 ||
    checkpoint.retiredConfigurationSha256 !== source.retiredConfigurationSha256 ||
    !['destroy-pending', 'retire-pending', 'verify-pending', 'retired'].includes(checkpoint.phase)
  )
    throw new Error('Terraform cloud teardown checkpoint differs');
  const save = () => storage.write(checkpointFile, checkpoint);
  if (checkpoint.phase === 'destroy-pending') {
    signal?.throwIfAborted();
    const receipt = await session.planDestroy(env, signal);
    if (receipt.configurationSha256 !== source.configurationSha256)
      throw new Error('Terraform teardown configuration changed before destruction');
    await storage.write('terraform-cloud-teardown-plan.json', receipt);
    await storage.verify();
    const ownership = await verifyAwsTerraformDestroyOwnership(plan, receipt, session, api, env, signal);
    const originalInventory = await optional6(storage, 'terraform-cloud-teardown-inventory.json');
    if (expectedInitialInstanceIds) {
      const originalInstances = (originalInventory ?? ownership.inventory).resources
        .filter((row) => row.type === 'aws_instance')
        .map((row) => row.id)
        .sort();
      if (
        expectedInitialInstanceIds.length !== 1 ||
        !/^i-[0-9a-f]{8,17}$/.test(expectedInitialInstanceIds[0]) ||
        JSON.stringify(originalInstances) !== JSON.stringify([...expectedInitialInstanceIds].sort()) ||
        ownership.inventory.resources.some(
          (row) => row.type === 'aws_instance' && !expectedInitialInstanceIds.includes(row.id),
        )
      )
        throw new Error('Initial registration destroy plan substituted its original instance');
    }
    if (originalInventory === undefined) {
      await storage.write('terraform-cloud-teardown-inventory.json', ownership.inventory);
    } else {
      if (!originalInventory) throw new Error('Original cloud retirement inventory is invalid');
      const { sha256, ...material } = originalInventory;
      if (
        canonicalSha256(material) !== sha256 ||
        originalInventory.schemaVersion !== 1 ||
        originalInventory.engine !== 'terraform' ||
        originalInventory.sourcePlanSha256 !== plan.planSha256 ||
        originalInventory.deploymentId !== owner.deploymentId ||
        originalInventory.accountId !== owner.account ||
        originalInventory.region !== owner.region ||
        !Array.isArray(originalInventory.resources) ||
        !Array.isArray(originalInventory.tgwEdges) ||
        ownership.inventory.resources.some(
          (resource) =>
            !originalInventory.resources.some((row) => row.type === resource.type && row.id === resource.id),
        ) ||
        ownership.inventory.tgwEdges.some(
          (edge) => !originalInventory.tgwEdges.some((row) => canonicalSha256(row) === canonicalSha256(edge)),
        )
      )
        throw new Error('Original cloud retirement inventory differs');
    }
    await storage.write('terraform-cloud-teardown-ownership.json', ownership);
    await storage.verify();
    await session.apply(receipt, env, signal);
    checkpoint.phase = 'retire-pending';
    await save();
  }
  if (checkpoint.phase === 'retire-pending') {
    signal?.throwIfAborted();
    await storage.verify();
    try {
      await session.reviseConfiguration(source.configurationSha256, source.retiredConfiguration);
    } catch (error) {
      try {
        await session.readConfiguration(source.retiredConfigurationSha256);
      } catch {
        throw error;
      }
    }
    checkpoint.phase = 'verify-pending';
    await save();
  }
  signal?.throwIfAborted();
  await storage.verify();
  if (expectedInitialInstanceIds) {
    const original = await storage.read('terraform-cloud-teardown-inventory.json');
    const { sha256, ...material } = original;
    if (
      canonicalSha256(material) !== sha256 ||
      original.sourcePlanSha256 !== plan.planSha256 ||
      JSON.stringify(
        original.resources
          .filter((row) => row.type === 'aws_instance')
          .map((row) => row.id)
          .sort(),
      ) !== JSON.stringify([...expectedInitialInstanceIds].sort())
    )
      throw new Error('Original initial-registration cloud retirement proof differs');
  }
  await session.readConfiguration(source.retiredConfigurationSha256);
  const final = await session.plan(env, signal);
  if (
    final.operation ||
    final.configurationSha256 !== source.retiredConfigurationSha256 ||
    !final.noChanges ||
    final.changes.length ||
    (final.actionInvocations?.length ?? 0) > 0
  )
    throw new Error('Retired Terraform configuration did not converge to an ordinary no-change plan');
  await session.apply(final, env, signal);
  await storage.write('terraform-cloud-teardown-final-refresh.json', final);
  checkpoint.phase = 'retired';
  await save();
  return {
    status: 'terraform-state-retired',
    engine: 'terraform',
    sourcePlanSha256: plan.planSha256,
    finalPlanSha256: final.planSha256,
    observedAt: new Date().toISOString(),
    cloudInventory: 'unknown',
    platform: 'unknown',
  };
}

// plugins/aws/src/ce/terraform-pending-teardown.ts
import { readdir as readdir4 } from 'node:fs/promises';

var object6 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Malformed pending admission journal');
  return value;
};
var uid = (value) => typeof value === 'string' && !!value.trim();
async function journal(base, storage, siteFingerprint, initialInstances) {
  verifyAwsCePlan(base);
  const selected = siteBindings(base);
  if (
    base.engine !== 'terraform' ||
    base.intent.topology.nodeCount !== 1 ||
    selected.length !== 1 ||
    selected[0].binding.nodes.length !== 1 ||
    base.intent.operation !== 'deploy' ||
    canonicalSha256(storage.owner) !== canonicalSha256(selected[0].binding.owner)
  )
    throw new Error('Pending retirement requires the owning Terraform deployment');
  await storage.verify();
  const auth = object6(await storage.read('terraform-authorization.json'));
  const workflow = object6(await storage.read('terraform-workflow.json'));
  let admission = null;
  try {
    admission = object6(await storage.read('terraform-admission.json'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const book = object6(await storage.read('terraform-f5-resources.json'));
    if (book.schemaVersion !== 1 || canonicalSha256(book.owner) !== canonicalSha256(storage.owner))
      throw new Error('Pending F5 reconciliation state owner differs');
    object6(book.resources);
  }
  const bootstrap = admission ? object6(admission.bootstrapByNode) : {},
    launched = admission ? object6(admission.launchedAtByNode) : {};
  const indexes = selected.flatMap(({ site }) => site.nodeIndexes.map(String));
  const admitted = admission?.admittedSites;
  const launchedSite = Array.isArray(admitted) && admitted.length === 1 && admitted[0] === selected[0].site.name;
  const completeLaunch =
    launchedSite &&
    indexes.every(
      (node) =>
        uid(bootstrap[node]) &&
        typeof launched[node] === 'string' &&
        Number.isFinite(Date.parse(launched[node])) &&
        new Date(Date.parse(launched[node])).toISOString() === launched[node] &&
        Date.parse(launched[node]) <= Date.now(),
    );
  if (
    auth.schemaVersion !== 1 ||
    auth.engine !== 'terraform' ||
    auth.planSha256 !== base.planSha256 ||
    auth.mutations !== true ||
    auth.f5StateOwner !== 'terraform' ||
    workflow.schemaVersion !== 1 ||
    workflow.engine !== 'terraform' ||
    workflow.planSha256 !== base.planSha256 ||
    !['network-pending', 'registration-pending'].includes(String(workflow.stage)) ||
    (admission !== null &&
      (admission.schemaVersion !== 1 ||
        admission.planSha256 !== base.planSha256 ||
        !/^[a-f0-9]{64}$/.test(String(admission.configurationSha256)) ||
        !Array.isArray(admission.admittedSites) ||
        (admission.admittedSites.length > 0 && !completeLaunch))) ||
    Object.entries(bootstrap).some(([node, value]) => !indexes.includes(node) || !uid(value)) ||
    Object.entries(launched).some(
      ([node, value]) => !indexes.includes(node) || typeof value !== 'string' || !Number.isFinite(Date.parse(value)),
    )
  )
    throw new Error('Pending retirement admission journal differs or registration has advanced');
  const files = await readdir4(storage.directory);
  const registrationRecords = [];
  if (
    initialInstances &&
    (Object.keys(initialInstances).join(',') !== selected[0].binding.nodes[0] ||
      !/^i-[0-9a-f]{8,17}$/.test(initialInstances[selected[0].binding.nodes[0]]))
  )
    throw new Error('Initial registration cloud identity binding differs');
  for (const file of files.filter((file) =>
    /^(terraform-(registration-|routing-|connect-|direct-|initial-)|ingress-plan-)/.test(file),
  )) {
    if (!initialInstances || file !== `terraform-registration-${selected[0].site.name}.json`)
      throw new Error('Post-admission retirement contract is required');
    const record = object6(await storage.read(file));
    if (
      record.siteName !== selected[0].site.name ||
      record.node !== selected[0].binding.nodes[0] ||
      record.instanceId !== initialInstances[selected[0].binding.nodes[0]] ||
      !/^r-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(String(record.registration)) ||
      record.action !== 'approve-registration' ||
      !['requested', 'submitted'].includes(String(record.state))
    )
      throw new Error('Initial registration request provenance differs');
    registrationRecords.push(record);
  }
  const siteRecords = [];
  for (const { binding } of selected) {
    let value;
    try {
      value = await storage.read(`terraform-site-${binding.siteName}.json`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (value !== undefined) {
      const row = object6(value);
      if (
        row.siteName !== binding.siteName ||
        !uid(row.uid) ||
        row.contractFingerprint !== siteFingerprint ||
        canonicalSha256(row.owner) !== canonicalSha256(binding.owner)
      )
        throw new Error('Pending site checkpoint differs');
      siteRecords.push(row);
    }
  }
  if (launchedSite && siteRecords.length !== selected.length)
    throw new Error('Launched pending site requires its owning logical checkpoint');
  return canonicalSha256({
    auth,
    workflow,
    admission,
    siteRecords,
    ...(initialInstances ? { initialInstances, registrationRecords } : {}),
  });
}
async function reconcilePendingF5Site(base, runtime, storage, signal) {
  let value;
  try {
    value = await storage.read('terraform-f5-resources.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (value === undefined) return;
  const book = object6(value);
  if (book.schemaVersion !== 1 || canonicalSha256(book.owner) !== canonicalSha256(storage.owner))
    throw new Error('Pending F5 reconciliation state owner differs');
  if (book.pending === undefined) return;
  const pending = object6(book.pending);
  if (pending.method === 'DELETE') return;
  if (
    ![true, false].includes(pending.submitted) ||
    (pending.submitted === true && !pending.receipt) ||
    pending.planSha256 !== base.planSha256 ||
    !['POST', 'PUT'].includes(String(pending.method))
  )
    throw new Error('Pending F5 creation or update requires separate interruption reconciliation');
  const { binding } = siteBindings(base)[0];
  const path = '/api/config/namespaces/system/securemesh_site_v2s';
  const metadata = object6(object6(pending.request).metadata),
    labels = object6(metadata.labels);
  const expectedLabels = {
    'xcsh-ce-deployment': storage.owner.deploymentId,
    'xcsh-ce-engine': 'terraform',
    'xcsh-ce-provider': 'aws',
    'xcsh-ce-account': storage.owner.account,
    'xcsh-ce-region': storage.owner.region,
  };
  if (
    ![true, false].includes(pending.submitted) ||
    (pending.submitted === true && !pending.receipt) ||
    pending.planSha256 !== base.planSha256 ||
    !['POST', 'PUT'].includes(String(pending.method)) ||
    pending.path !== (pending.method === 'POST' ? path : `${path}/${binding.siteName}`) ||
    metadata.name !== binding.siteName ||
    metadata.namespace !== 'system' ||
    Object.entries(expectedLabels).some(([key, value]) => labels[key] !== value)
  )
    throw new Error('Pending F5 creation or update requires separate interruption reconciliation');
  if (pending.submitted === true) await runtime.reconcileObservedTerraformResources(storage.owner, signal);
  else await runtime.cancelUnsubmittedTerraformResources(storage.owner, signal);
}
async function verifyF5State(base, storage, planned) {
  let value;
  try {
    value = await storage.read('terraform-f5-resources.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (value === undefined) {
    if (planned.some((site) => site.siteUid !== null))
      throw new Error('Pending logical site has no owning Terraform state');
    return;
  }
  const book = object6(value),
    resources = object6(book.resources);
  if (book.schemaVersion !== 1 || canonicalSha256(book.owner) !== canonicalSha256(storage.owner))
    throw new Error('Pending F5 Terraform state owner differs');
  for (const item of Object.values(resources)) {
    const row = object6(item),
      site = planned.find((site) => row.path === `/api/config/namespaces/system/securemesh_site_v2s/${site.siteName}`);
    if (!site || row.type !== 'xcsh_securemesh_site_v2' || !uid(row.uid) || row.uid !== site.siteUid)
      throw new Error('Pending F5 state resource differs from the selected logical UID');
  }
  if (book.pending !== undefined) {
    const pending = object6(book.pending);
    if (
      pending.method !== 'DELETE' ||
      pending.planSha256 !== base.planSha256 ||
      !planned.some((site) => pending.path === `/api/config/namespaces/system/securemesh_site_v2s/${site.siteName}`)
    )
      throw new Error('Pending F5 creation or update requires separate interruption reconciliation');
  }
}
function fresh(receipt, base, site, ingress) {
  const at = Date.parse(receipt.observedAt);
  if (
    receipt.status !== 'observed' ||
    canonicalSha256(receipt.owner) !== canonicalSha256(siteBindings(base)[0].binding.owner) ||
    receipt.siteContractFingerprint !== site ||
    receipt.ingressContractFingerprint !== ingress ||
    !Number.isFinite(at) ||
    at > Date.now() ||
    Date.now() - at > 60000
  )
    throw new Error('Fresh pending admission inventory is unavailable');
  return receipt;
}
function identities(base, receipt, initialInstances) {
  const selected = siteBindings(base),
    seen = new Set();
  if (receipt.sites.length !== selected.length) throw new Error('Pending site inventory is incomplete');
  const unique = (value) => {
    if (seen.has(value)) throw new Error('Duplicate pending identity');
    seen.add(value);
  };
  const retirement = selected.map(({ binding, site }) => {
    const matches = receipt.sites.filter((row) => row.siteName === binding.siteName);
    if (
      matches.length !== 1 ||
      !(matches[0].physicalSiteUid === null || uid(matches[0].physicalSiteUid)) ||
      !(matches[0].siteUid === null || uid(matches[0].siteUid))
    )
      throw new Error('Pending site identity differs');
    if (matches[0].siteUid !== null) unique(matches[0].siteUid);
    if (matches[0].physicalSiteUid !== null) unique(matches[0].physicalSiteUid);
    const tokens = receipt.resources
      .filter((row) => row.siteName === binding.siteName)
      .map((row) => {
        const nodeIndex = binding.nodes.indexOf(String(row.node));
        const expected = `${base.deploymentName.slice(0, 40)}-${site.nodeIndexes[nodeIndex]}-${base.planSha256.slice(0, 12)}`;
        if (
          row.kind !== 'tokens' ||
          row.namespace !== 'system' ||
          nodeIndex < 0 ||
          row.name !== expected ||
          !uid(row.uid)
        )
          throw new Error('Pending token is outside the original admission plan');
        unique(row.uid);
        unique(`token:${row.name}`);
        return { name: row.name, node: String(row.node), uid: row.uid };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    const registrations = (receipt.registrations ?? []).filter((row) => row.siteName === binding.siteName);
    for (const registration of registrations) {
      validateInitialRegistrationRetirement(binding, registration);
      if (matches[0].siteUid === null || matches[0].physicalSiteUid === null)
        throw new Error('Initial registration requires original logical and physical site identities');
      if (!initialInstances || registration.instanceId !== initialInstances[registration.node])
        throw new Error('Initial registration does not match the original cloud instance');
      unique(registration.uid);
    }
    return {
      siteName: binding.siteName,
      siteUid: matches[0].siteUid,
      physicalSiteUid: matches[0].physicalSiteUid,
      tokens,
      ...(registrations.length ? { registrations } : {}),
    };
  });
  if (retirement.reduce((n, row) => n + (row.registrations?.length ?? 0), 0) !== (receipt.registrations?.length ?? 0))
    throw new Error('Unexpected initial registration');
  if (retirement.reduce((n, row) => n + row.tokens.length, 0) !== receipt.resources.length)
    throw new Error('Unexpected pending resource');
  return retirement.sort((a, b) => a.siteName.localeCompare(b.siteName));
}
function compile(base, journalSha, site, ingress, retirement, initialInstances) {
  const draft = {
    schemaVersion: 1,
    kind: 'aws-ce-terraform-pending-teardown',
    engine: 'terraform',
    sourcePlanSha256: base.planSha256,
    sourceJournalSha256: journalSha,
    ...(initialInstances ? { initialRegistrationInstances: structuredClone(initialInstances) } : {}),
    drain: {
      schemaVersion: 1,
      owner: siteBindings(base)[0].binding.owner,
      sourcePlanSha256: base.planSha256,
      siteContractFingerprint: site,
      ingressContractFingerprint: ingress,
      sites: [],
      listeners: [],
      origins: [],
    },
    retirement,
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-pending-teardown-${planSha256.slice(0, 24)}`, planSha256 };
}
function subset(base, planned, receipt, site, ingress, initialInstances) {
  const actual = identities(base, fresh(receipt, base, site, ingress), initialInstances);
  for (const row of actual) {
    const target = planned.find((target) => target.siteName === row.siteName);
    if (
      !target ||
      (row.siteUid !== null && row.siteUid !== target.siteUid) ||
      (row.physicalSiteUid !== null && row.physicalSiteUid !== target.physicalSiteUid) ||
      (row.registrations ?? []).some(
        (registration) =>
          !(target.registrations ?? []).some((expected) => canonicalSha256(expected) === canonicalSha256(registration)),
      ) ||
      row.tokens.some(
        (token) => !target.tokens.some((expected) => canonicalSha256(token) === canonicalSha256(expected)),
      )
    )
      throw new Error('Pending identity was substituted after preparation');
  }
  return actual;
}
async function prepareAwsPendingTeardown(base, runtime, contract, storage, signal, initialInstanceReader) {
  base = structuredClone(base);
  signal?.throwIfAborted();
  if (runtime.engine !== 'terraform') throw new Error('Pending teardown runtime engine differs');
  verifyAwsCePlan(base);
  const selected = siteBindings(base);
  await storage.verify();
  if (
    base.engine !== 'terraform' ||
    base.intent.topology.nodeCount !== 1 ||
    selected.length !== 1 ||
    canonicalSha256(storage.owner) !== canonicalSha256(selected[0].binding.owner)
  )
    throw new Error('Pending retirement requires the owning Terraform deployment');
  const auth = object6(await storage.read('terraform-authorization.json'));
  const workflow = object6(await storage.read('terraform-workflow.json'));
  if (
    auth.schemaVersion !== 1 ||
    auth.engine !== 'terraform' ||
    auth.planSha256 !== base.planSha256 ||
    auth.mutations !== true ||
    auth.f5StateOwner !== 'terraform' ||
    workflow.schemaVersion !== 1 ||
    workflow.engine !== 'terraform' ||
    workflow.planSha256 !== base.planSha256 ||
    !['network-pending', 'registration-pending'].includes(String(workflow.stage))
  )
    throw new Error('Pending retirement authorization or workflow differs');
  let initialInstances;
  let initial = await (runtime.preRegistrationInventory ?? runtime.pendingAdmissionInventory).call(
    runtime,
    siteBindings(base).map((row) => row.binding),
    ['default'],
    contract,
    signal,
  );
  const registrationFiles = (await readdir4(storage.directory)).some((file) =>
    file.startsWith('terraform-registration-'),
  );
  if (
    initialInstanceReader &&
    ((initial.status === 'unknown' && initial.reason === 'initial-registration-cloud-binding-required') ||
      (initial.status === 'observed' && registrationFiles))
  ) {
    initialInstances = structuredClone(await initialInstanceReader(signal));
    initial = await runtime.preRegistrationInventory(
      siteBindings(base).map((row) => row.binding),
      ['default'],
      contract,
      signal,
      initialInstances,
    );
  }
  const before = await journal(base, storage, runtime.contract.fingerprint, initialInstances);
  await reconcilePendingF5Site(base, runtime, storage, signal);
  const receipt = fresh(
    await (runtime.preRegistrationInventory ?? runtime.pendingAdmissionInventory).call(
      runtime,
      siteBindings(base).map((row) => row.binding),
      ['default'],
      contract,
      signal,
      initialInstances,
    ),
    base,
    runtime.contract.fingerprint,
    contract.fingerprint,
  );
  const retirement = identities(base, receipt, initialInstances);
  for (const site of retirement)
    for (const registration of site.registrations ?? [])
      runtime.contract.registrationDeletionRequest(registration.name);
  if (retirement.some((site) => site.physicalSiteUid !== null && site.siteUid === null))
    throw new Error('Pre-registration physical site has no owning logical identity');
  let admissionMissing = false;
  try {
    await storage.read('terraform-admission.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    admissionMissing = true;
  }
  if (admissionMissing && receipt.resources.length)
    throw new Error('Missing admission provenance cannot authorize token retirement');
  for (const row of retirement) {
    let checkpoint;
    try {
      checkpoint = await storage.read(`terraform-site-${row.siteName}.json`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (checkpoint !== undefined && row.siteUid !== null && object6(checkpoint).uid !== row.siteUid)
      throw new Error('Pending live site UID differs from its checkpoint');
  }
  await verifyF5State(base, storage, retirement);
  if (before !== (await journal(base, storage, runtime.contract.fingerprint, initialInstances)))
    throw new Error('Pending admission journal changed during preparation');
  const plan = compile(base, before, runtime.contract.fingerprint, contract.fingerprint, retirement, initialInstances);
  await storage.write(`${plan.planId}.json`, plan);
  return plan;
}
async function coordinateAwsPendingTeardown(base, input, authorized, storage, driver, signal) {
  base = structuredClone(base);
  const plan = structuredClone(input);
  const validate = async () => {
    signal?.throwIfAborted();
    if (
      driver.engine !== 'terraform' ||
      (plan.retirement.some((site) => site.physicalSiteUid !== null) && !driver.observeSiteDeletion) ||
      (plan.retirement.some((site) => site.registrations?.length) && !driver.deleteRegistration) ||
      authorized !== plan.planSha256 ||
      (await journal(base, storage, driver.siteContractFingerprint, plan.initialRegistrationInstances)) !==
        plan.sourceJournalSha256 ||
      canonicalSha256(plan) !==
        canonicalSha256(
          compile(
            base,
            plan.sourceJournalSha256,
            driver.siteContractFingerprint,
            driver.ingressContractFingerprint,
            plan.retirement,
            plan.initialRegistrationInstances,
          ),
        )
    )
      throw new Error('Pending teardown authorization, plan or journal differs');
    await verifyF5State(base, storage, plan.retirement);
    identities(
      base,
      {
        status: 'observed',
        owner: plan.drain.owner,
        siteContractFingerprint: driver.siteContractFingerprint,
        ingressContractFingerprint: driver.ingressContractFingerprint,
        startedAt: '',
        observedAt: '',
        sources: [],
        sites: plan.retirement.map(({ siteName, siteUid, physicalSiteUid }) => ({
          siteName,
          siteUid,
          physicalSiteUid,
        })),
        ...(plan.initialRegistrationInstances
          ? { registrations: plan.retirement.flatMap((site) => site.registrations ?? []) }
          : {}),
        resources: plan.retirement.flatMap((site) =>
          site.tokens.map((token) => ({
            ...token,
            kind: 'tokens',
            namespace: 'system',
            siteName: site.siteName,
          })),
        ),
      },
      plan.initialRegistrationInstances,
    );
  };
  const observe = async () => {
    await validate();
    return subset(
      base,
      plan.retirement,
      await driver.observe(signal),
      driver.siteContractFingerprint,
      driver.ingressContractFingerprint,
      plan.initialRegistrationInstances,
    );
  };
  await observe();
  await beginAwsTerraformRetirement(base, plan, storage);
  let current = await observe();
  for (const target of plan.retirement)
    for (const token of target.tokens) {
      current = await observe();
      if (current.some((site) => site.tokens.some((row) => row.name === token.name)))
        await driver.revokeToken(target, token, signal);
    }
  current = await observe();
  if (current.some((site) => site.tokens.length)) throw new Error('Pending bootstrap revocation is still converging');
  const cloud = await driver.retireCloud(signal);
  if (
    cloud.status !== 'terraform-state-retired' ||
    cloud.sourcePlanSha256 !== base.planSha256 ||
    !/^[a-f0-9]{64}$/.test(cloud.finalPlanSha256)
  )
    throw new Error('Pending cloud retirement lacks the bound no-change receipt');
  await observe();
  for (const target of plan.retirement)
    for (const registration of target.registrations ?? []) {
      await observe();
      if (!driver.deleteRegistration) throw new Error('Initial registration retirement executor is unavailable');
      const result = await driver.deleteRegistration(target, registration, signal);
      if (result.status !== 'absent')
        return {
          status: 'pending-platform-retirement',
          sourcePlanSha256: base.planSha256,
          planSha256: plan.planSha256,
          cloudInventory: 'unknown',
        };
    }
  current = await observe();
  if (current.some((site) => site.registrations?.length))
    throw new Error('Initial registration retirement has not converged');
  await driver.reconcilePlatform(signal);
  for (const target of plan.retirement) {
    current = await observe();
    if (current.some((site) => site.siteName === target.siteName && site.siteUid !== null)) {
      const result = await driver.deleteSite(target, signal);
      if (result.status !== 'deleted')
        return {
          status: 'pending-platform-retirement',
          sourcePlanSha256: base.planSha256,
          planSha256: plan.planSha256,
          cloudInventory: 'unknown',
        };
    }
    if (target.physicalSiteUid !== null) {
      if (!target.siteUid || !driver.observeSiteDeletion)
        throw new Error('Pre-registration physical retirement observation is unavailable');
      const deletion = await driver.observeSiteDeletion(target, signal);
      if (deletion.status !== 'deleted')
        return {
          status: 'pending-platform-retirement',
          sourcePlanSha256: base.planSha256,
          planSha256: plan.planSha256,
          cloudInventory: 'unknown',
        };
    }
  }
  current = await observe();
  if (current.some((site) => site.siteUid !== null || site.physicalSiteUid !== null || site.tokens.length))
    throw new Error('Pending platform retirement has not converged');
  let finalBook;
  try {
    finalBook = await storage.read('terraform-f5-resources.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (finalBook !== undefined) {
    const book = object6(finalBook);
    if (Object.keys(object6(book.resources)).length || book.pending !== undefined)
      throw new Error('F5 Terraform state retirement remains incomplete');
  }
  const receipt = {
    status: 'resources-retired-awaiting-inventory',
    owner: storage.owner,
    sourcePlanSha256: base.planSha256,
    planSha256: plan.planSha256,
    finalPlanSha256: cloud.finalPlanSha256,
    cloudInventory: 'unknown',
    observedAt: new Date().toISOString(),
  };
  await storage.write('aws-terraform-pending-teardown-receipt.json', receipt);
  return receipt;
}
async function runAwsPendingTeardown(base, plan, authorized, runtime, contract, session, storage, api, env, signal) {
  if (runtime.engine !== 'terraform') throw new Error('Pending teardown runtime engine differs');
  for (const site of plan.retirement)
    for (const registration of site.registrations ?? [])
      runtime.contract.registrationDeletionRequest(registration.name);
  await verifyAwsTeardownCredentials(base, api, signal);
  const bindings = siteBindings(base),
    binding = (site) => {
      const found = bindings.find((row) => row.binding.siteName === site.siteName);
      if (!found) throw new Error('Pending site is outside deployment');
      return found.binding;
    };
  const retired = await coordinateAwsPendingTeardown(
    base,
    plan,
    authorized,
    storage,
    {
      engine: 'terraform',
      siteContractFingerprint: runtime.contract.fingerprint,
      ingressContractFingerprint: contract.fingerprint,
      observe: (signal) =>
        runtime.preRegistrationInventory(
          bindings.map((row) => row.binding),
          ['default'],
          contract,
          signal,
          plan.initialRegistrationInstances,
        ),
      deleteRegistration: (site, registration, signal) =>
        runtime.deleteInitialRegistration(
          binding(site),
          registration,
          (record) => storage.write(`pending-registration-delete-${registration.uid}.json`, record),
          signal,
          site.siteUid ?? undefined,
        ),
      revokeToken: (site, token, signal) =>
        runtime.deleteBootstrapTokenExact(binding(site), token.node, token.name, token.uid, signal),
      reconcilePlatform: (signal) => runtime.reconcileTerraformResources(storage.owner, signal),
      retireCloud: (signal) =>
        runAwsTerraformCloudTeardown(
          base,
          session,
          storage,
          api,
          env,
          signal,
          plan.initialRegistrationInstances ? Object.values(plan.initialRegistrationInstances) : undefined,
        ),
      deleteSite: (site, signal) => runtime.deleteSiteExact(binding(site), String(site.siteUid), signal),
      observeSiteDeletion: (site, signal) =>
        runtime.observeSiteDeletion(
          binding(site),
          { siteUid: String(site.siteUid), physicalSiteUid: String(site.physicalSiteUid) },
          signal,
        ),
    },
    signal,
  );
  if (retired.status !== 'resources-retired-awaiting-inventory') return retired;
  const inventory = await storage.read('terraform-cloud-teardown-inventory.json');
  const observation = await collectAwsTerraformAbsence(base, inventory, api, signal);
  await storage.write('aws-terraform-teardown-cloud-absence.json', observation);
  return {
    ...retired,
    status:
      observation.status === 'absent-or-retired'
        ? 'ce-retired-supporting-infrastructure-unverified'
        : 'pending-cloud-inventory',
    cloudInventory: observation.status,
  };
}

// plugins/aws/src/ce/terraform-parent-retirement.ts
// plugins/terraform/src/cleanup-verifier-worker.ts
import { createHash as createHash5, createHash as createHash6 } from 'node:crypto';
// plugins/aws/src/ce/terraform-terminal-cleanup.ts
import {
  lstat as lstat4,
  lstat as lstat5,
  readdir as readdir5,
  readdir as readdir6,
  readFile as readFile4,
  realpath as realpath3,
  realpath as realpath4,
  unlink as unlink3,
} from 'node:fs/promises';
import { join as join6, join as join8 } from 'node:path';

var hash3 = (value) => createHash5('sha256').update(value).digest('hex');
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
var sha = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
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
    !sha(expectedSha256) ||
    hash3(encode(evidence)) !== expectedSha256 ||
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
    ].every(sha) ||
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

// plugins/aws/src/ce/terraform-power-retirement.ts
var object7 = (v) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Malformed power retirement artifact');
  return v;
};
var same = (a, b) => canonicalSha256(a) === canonicalSha256(b);
var fail = () => {
  throw Error('Power retirement provenance differs');
};
var sequences = {
  stop: ['ready-to-stop', 'withdraw', 'withdrawn', 'stop', 'stopped'],
  start: ['ready-to-start', 'start', 'running', 'restore', 'restored', 'release'],
};
var effects = ['withdraw', 'stop', 'start', 'restore', 'release'];
var timestamp = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v)) && Date.parse(v) <= Date.now();
var sha2 = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
async function qualifyAwsTerraformPowerArtifacts(base, store, names, recorded) {
  const admitted = new Set();
  const powerNames = names.filter((n) => n.startsWith('aws-ce-power-'));
  if (recorded) {
    for (const name of powerNames) {
      const item = recorded.get(name);
      if (!item || item.preserve || !/^aws-ce-power-[a-f0-9]{24}(?:-[a-z-]+)?\.json$/.test(name)) fail();
      admitted.add(name);
    }
    return admitted;
  }
  const plans = new Map();
  const checkpoints = new Map();
  const read = async (name) => object7(await store.read(name));
  for (const name of powerNames.filter((n) => /^aws-ce-power-[a-f0-9]{24}\.json$/.test(n))) {
    const plan = await read(name);
    verifyAwsWholeSitePowerPlan(base, plan);
    if (plan.engine !== 'terraform' || name !== `${plan.planId}.json` || !same(plan.bindings.owner, store.owner))
      fail();
    plans.set(plan.planId, plan);
    admitted.add(name);
  }
  for (const plan of plans.values()) {
    const cpName = `${plan.planId}-checkpoint.json`;
    if (!names.includes(cpName)) {
      if (powerNames.some((n) => n.startsWith(`${plan.planId}-`))) fail();
      continue;
    }
    const cp = await read(cpName),
      steps = sequences[plan.operation];
    const attempts = object7(cp.attempts),
      evidence = object7(cp.evidence);
    if (
      cp.schemaVersion !== 1 ||
      cp.planSha256 !== plan.planSha256 ||
      cp.bindingsSha256 !== plan.bindingsSha256 ||
      !Number.isInteger(cp.step) ||
      cp.step < 0 ||
      cp.step > steps.length ||
      cp.complete !== (cp.step === steps.length)
    )
      fail();
    for (const [effect, value] of Object.entries(attempts)) {
      const attempt = object7(value),
        index = steps.indexOf(effect);
      if (
        !effects.includes(effect) ||
        index < 0 ||
        index > cp.step ||
        attempt.effect !== effect ||
        attempt.requestSha256 !== canonicalSha256({ planSha256: plan.planSha256, effect }) ||
        !timestamp(attempt.originalAttemptAt)
      )
        fail();
    }
    if (cp.pending && (!same(cp.pending, attempts[cp.pending.effect]) || cp.pending.effect !== steps[cp.step])) fail();
    if (effects.includes(steps[cp.step]) && attempts[steps[cp.step]] && !cp.pending) fail();
    for (const [gate, value] of Object.entries(evidence)) {
      const v = object7(value);
      if (
        effects.includes(gate) ||
        !steps.includes(gate) ||
        steps.indexOf(gate) >= cp.step ||
        !timestamp(v.collectedAt) ||
        !evidencePasses(plan, gate, v, Date.parse(v.collectedAt))
      )
        fail();
    }
    for (const step of steps.slice(0, cp.step)) if (!(effects.includes(step) ? attempts[step] : evidence[step])) fail();
    checkpoints.set(plan.planId, cp);
    admitted.add(cpName);
  }
  for (const plan of plans.values()) {
    if (plan.operation === 'start') {
      const stop = plans.get(`aws-ce-power-${plan.maintenance?.stopPlanSha256.slice(0, 24)}`);
      if (
        !stop ||
        stop.operation !== 'stop' ||
        stop.transitionId !== plan.transitionId ||
        stop.bindingsSha256 !== plan.bindingsSha256 ||
        !same(await store.read(`${stop.planId}-maintenance.json`), plan.maintenance)
      )
        fail();
    }
    const cp = checkpoints.get(plan.planId);
    for (const name of powerNames.filter(
      (n) => n.startsWith(`${plan.planId}-`) && n !== `${plan.planId}-checkpoint.json`,
    )) {
      if (!cp) throw Error('Power checkpoint missing');
      const v = await read(name),
        suffix = name.slice(plan.planId.length + 1, -5);
      if (suffix === 'maintenance') {
        const { receiptSha256, ...body } = v;
        if (
          plan.operation !== 'stop' ||
          !cp.complete ||
          v.schemaVersion !== 1 ||
          v.kind !== 'aws-ce-stopped' ||
          v.sourcePlanSha256 !== base.planSha256 ||
          v.transitionId !== plan.transitionId ||
          v.stopPlanSha256 !== plan.planSha256 ||
          v.bindingsSha256 !== plan.bindingsSha256 ||
          receiptSha256 !== canonicalSha256(body) ||
          v.originalAttemptAt !== cp.attempts.stop?.originalAttemptAt ||
          !timestamp(v.observedAt) ||
          Date.parse(v.observedAt) < Date.parse(v.originalAttemptAt) ||
          v.stoppedEvidenceSha256 !== canonicalSha256(await store.read(`${plan.planId}-final-stopped-evidence.json`))
        )
          fail();
      } else if (suffix.endsWith('-last-evidence') || suffix === 'final-stopped-evidence') {
        const gate = suffix === 'final-stopped-evidence' ? 'stopped' : suffix.slice(0, -14);
        if (
          !sequences[plan.operation].includes(gate) ||
          effects.includes(gate) ||
          v.source !== 'live' ||
          v.planSha256 !== plan.planSha256 ||
          v.bindingsSha256 !== plan.bindingsSha256 ||
          v.gate !== gate ||
          !timestamp(v.collectedAt)
        )
          fail();
        if (
          suffix === 'final-stopped-evidence' &&
          (!cp.complete || !evidencePasses(plan, 'stopped', v, Date.parse(v.collectedAt)))
        )
          fail();
      } else {
        const bgp =
          /^(withdraw|restore)-terraform-bgp-(preparation|policy-dispatch|policy-created|replacement-dispatch|outcome|policy-delete-dispatch|policy-retirement-outcome)$/.exec(
            suffix,
          );
        if (bgp) {
          const [, effect, kind] = bgp;
          const deleting = kind === 'policy-delete-dispatch' || kind === 'policy-retirement-outcome';
          if ((kind === 'policy-dispatch' || kind === 'policy-created') && effect !== 'withdraw') fail();
          if (deleting && effect !== 'restore') fail();
          const attempt = cp.attempts[deleting ? 'release' : effect];
          if (!attempt) fail();
          const expected = {
            schemaVersion: 1,
            engine: 'terraform',
            planSha256: plan.planSha256,
            bindingsSha256: plan.bindingsSha256,
            servicesSha256: powerServiceComponentSha256(base, plan.bindings, 'bgp'),
            attempt,
          };
          const stem = `${plan.planId}-${effect}-terraform-bgp`;
          const prep = kind === 'preparation' ? v : await read(`${stem}-preparation.json`);
          const prepMarker = { ...expected, attempt: cp.attempts[effect] };
          validateAwsBgpPowerPreparation(prep, prepMarker);
          if (kind !== 'policy-created' && !same(v.marker, expected)) fail();
          const service = prep.services.platform[0],
            snapshot = prep.snapshots[0],
            intent = prep.policies[0];
          if (
            !same(service.binding.owner, store.owner) ||
            service.binding.nodes.length !== plan.bindings.nodes.length ||
            !plan.bindings.nodes.every(
              (n) => n.siteName === service.binding.siteName && service.binding.nodes.includes(n.nodeName),
            )
          )
            fail();
          const stopId =
            effect === 'withdraw' ? plan.planId : `aws-ce-power-${plan.maintenance?.stopPlanSha256.slice(0, 24)}`;
          const createdName = `${stopId}-withdraw-terraform-bgp-policy-created.json`;
          const created = names.includes(createdName) ? await read(createdName) : undefined;
          if (
            kind === 'policy-dispatch' &&
            !same(v, {
              marker: expected,
              intent,
              record: { ...intent, kind: 'bgp_routing_policy', phase: 'power-policy-create-dispatch' },
            })
          )
            fail();
          if (kind === 'policy-created') {
            const { status, collectedAt, kind: resourceKind, uid, resourceVersion, ...actual } = v;
            if (
              status !== 'observed' ||
              resourceKind !== 'bgp_routing_policy' ||
              !uid ||
              !resourceVersion ||
              !timestamp(collectedAt) ||
              !same(actual, intent) ||
              !names.includes(`${stem}-policy-dispatch.json`)
            )
              fail();
          }
          if (kind === 'replacement-dispatch') {
            if (!created) throw Error('Created power policy missing');
            const record = {
              kind: snapshot.kind,
              name: snapshot.name,
              uid: snapshot.uid,
              siteUid: snapshot.siteUid,
              resourceVersion: snapshot.resourceVersion,
              contractFingerprint: snapshot.contractFingerprint,
              phase: 'power-routing-dispatch',
            };
            if (
              !same(v, {
                marker: expected,
                snapshot,
                desired: effect === 'withdraw' ? service.revision.bgpSpec : service.originalSpec,
                policy: created,
                record,
              })
            )
              fail();
          }
          const checkObservation = (value, status, desired) => {
            const o = object7(value);
            if (
              o.servicesSha256 !== expected.servicesSha256 ||
              !same(o.services, prep.services) ||
              o.status !== status ||
              !Array.isArray(o.snapshots) ||
              o.snapshots.length !== prep.snapshots.length
            )
              fail();
            for (let index = 0; index < prep.snapshots.length; index++) {
              const actual = object7(o.snapshots[index]),
                original = object7(prep.snapshots[index]);
              for (const key of ['binding', 'kind', 'name', 'uid', 'siteUid', 'contractFingerprint'])
                if (!same(actual[key], original[key])) fail();
              if (
                typeof actual.resourceVersion !== 'string' ||
                !actual.resourceVersion ||
                !timestamp(actual.collectedAt) ||
                !same(actual.spec, desired)
              )
                fail();
            }
          };
          if (kind === 'outcome') {
            checkObservation(
              v.observed,
              effect === 'withdraw' ? 'withdrawn' : 'active',
              effect === 'withdraw' ? service.revision.bgpSpec : service.originalSpec,
            );
            const o = object7(v.observed);
            if (
              !names.includes(`${stem}-replacement-dispatch.json`) ||
              !timestamp(v.collectedAt) ||
              Date.parse(v.collectedAt) < Date.parse(attempt.originalAttemptAt) ||
              o.servicesSha256 !== expected.servicesSha256 ||
              !same(o.services, prep.services) ||
              o.status !== (effect === 'withdraw' ? 'withdrawn' : 'active') ||
              !same(o.snapshots[0].spec, effect === 'withdraw' ? service.revision.bgpSpec : service.originalSpec)
            )
              fail();
          }
          if (deleting) {
            if (kind === 'policy-retirement-outcome') checkObservation(v.observed, 'active', service.originalSpec);
            if (!created) throw Error('Created power policy missing');
            const { status, collectedAt, kind: resourceKind, ...policySnapshot } = created;
            const record = { ...policySnapshot, kind: 'bgp_routing_policy', phase: 'power-policy-delete-dispatch' };
            if (kind === 'policy-delete-dispatch' && !same(v, { marker: expected, snapshot: policySnapshot, record }))
              fail();
            if (kind === 'policy-retirement-outcome') {
              if (
                !names.includes(`${stem}-policy-delete-dispatch.json`) ||
                !same(v.observed.services, prep.services) ||
                v.observed.status !== 'active' ||
                v.observed.servicesSha256 !== expected.servicesSha256 ||
                !['deleted', 'pending'].includes(v.result.status) ||
                !timestamp(v.result.collectedAt) ||
                Date.parse(v.result.collectedAt) < Date.parse(attempt.originalAttemptAt)
              )
                fail();
              const { status: resultStatus, collectedAt: resultTime, ...resultSnapshot } = v.result;
              if (!same(resultSnapshot, policySnapshot)) fail();
            }
          }
          admitted.add(name);
          continue;
        }
        const match =
          /^(withdraw|restore|stop|start|release)-terraform(?:-(direct|static-tgw|nlb))?-(source|preparation|dispatch|outcome|final-preparing|final-plan|complete)$/.exec(
            suffix,
          );
        if (!match) throw Error('Unknown power journal');
        const [, effect, family, kind] = match;
        if (kind === 'source' && family) fail();
        if (family ? !['withdraw', 'restore'].includes(effect) : !['stop', 'start', 'release'].includes(effect)) fail();
        if (['final-preparing', 'final-plan', 'complete'].includes(kind) && (effect !== 'release' || family)) fail();
        const attempt = cp.attempts[effect];
        if (!attempt) fail();
        const marker = object7(v.marker);
        const expected = {
          schemaVersion: 1,
          engine: 'terraform',
          planSha256: plan.planSha256,
          bindingsSha256: plan.bindingsSha256,
          ...(family
            ? { servicesSha256: powerServiceComponentSha256(base, plan.bindings, family) }
            : { instanceId: plan.bindings.nodes[0].instanceId }),
          attempt,
        };
        if (!same(marker, expected)) fail();
        const stem = `${plan.planId}-${effect}-terraform${family ? `-${family}` : ''}`;
        if (kind === 'source') {
          if (!same(Object.keys(v).sort(), ['configuration', 'marker']) || typeof v.configuration !== 'string') fail();
          reviseAwsTerraformPowerConfiguration(base, plan, v.configuration, effect);
          if (!names.includes(`${stem}-preparation.json`)) {
            if (names.some((n) => n.startsWith(`${stem}-`) && n !== name)) fail();
            admitted.add(name);
            continue;
          }
        }
        const prep = kind === 'preparation' ? v : await read(`${stem}-preparation.json`);
        if (!same(prep.marker, expected)) fail();
        const revision = object7(prep.revision);
        let reconstructed;
        let serviceIdentity;
        if (!family) {
          const source = await read(`${stem}-source.json`);
          if (!same(source.marker, expected) || typeof source.configuration !== 'string') fail();
          reconstructed = reviseAwsTerraformPowerConfiguration(base, plan, source.configuration, effect);
        } else {
          if (typeof prep.source !== 'string') fail();
          const outcomeName = `${stem}-outcome.json`;
          const services =
            plan.bindings.servicesInventory?.components.find((c) => c.kind === family)?.services ??
            (names.includes(outcomeName) ? object7((await read(outcomeName)).observed).services : undefined);
          if (!services || canonicalSha256(services) !== expected.servicesSha256) fail();
          serviceIdentity = services;
          const stopId = `aws-ce-power-${plan.maintenance?.stopPlanSha256.slice(0, 24)}`;
          const retained =
            effect === 'restore'
              ? object7((await read(`${stopId}-withdraw-terraform-${family}-preparation.json`)).revision)
              : undefined;
          const revise =
            family === 'direct'
              ? reviseAwsTerraformDirectServiceRoutes
              : family === 'static-tgw'
                ? reviseAwsTerraformStaticServiceRoutes
                : reviseAwsTerraformNlbMembership;
          reconstructed = revise(base, services, prep.source, effect, retained);
        }
        if (!same(reconstructed, revision)) fail();
        const receipt = prep.receipt;
        if (receipt) {
          const r = object7(receipt);
          if (
            r.schemaVersion !== 1 ||
            r.engine !== 'terraform' ||
            r.deploymentId !== base.deploymentName ||
            r.backendIdentity !== `local:${base.deploymentName}` ||
            r.configurationSha256 !== revision.afterSha256 ||
            r.providerLockSha256 !== AWS_CE_PROVIDER_LOCK_SHA256 ||
            !sha2(r.planSha256) ||
            r.operation ||
            r.actionInvocations?.length
          )
            fail();
          if (!family) {
            const fields = {
              [revision.address]:
                effect === 'release'
                  ? null
                  : {
                      instance_id: plan.bindings.nodes[0].instanceId,
                      state: effect === 'stop' ? 'stopped' : 'running',
                      force: false,
                    },
            };
            validateAwsTerraformPowerReceipt(base, plan, effect, revision, r, fields);
          } else {
            const services = object7(serviceIdentity);
            let owned;
            if (family === 'nlb')
              owned = {
                [revision.address]: {
                  target_group_arn: services.targetGroupArn,
                  target_id: services.target.Id,
                  port: services.target.Port,
                  availability_zone: 'all',
                },
              };
            else if (family === 'direct')
              owned = Object.fromEntries(
                Object.entries(object7(revision.routes)).map(([name, route]) => [`aws_route.${name}`, route]),
              );
            else
              owned = Object.fromEntries(
                base.intent.routing.destinationCidrs.map((cidr, index) => [
                  `aws_ec2_transit_gateway_route.static_${index}`,
                  {
                    destination_cidr_block: cidr,
                    transit_gateway_attachment_id: services.transportAttachmentId,
                    transit_gateway_route_table_id: services.routeTableId,
                    blackhole: false,
                  },
                ]),
              );
            const absent = Object.fromEntries(Object.keys(owned).map((address) => [address, null]));
            const validate =
              family === 'direct'
                ? validateAwsTerraformDirectServiceReceipt
                : family === 'static-tgw'
                  ? validateAwsTerraformStaticServiceReceipt
                  : validateAwsTerraformNlbMembershipReceipt;
            validate(
              base,
              services,
              revision,
              r,
              effect === 'withdraw' ? owned : absent,
              effect === 'withdraw' ? absent : owned,
            );
            if (kind === 'outcome') {
              const observed = object7(v.observed);
              if (
                observed.status !== (effect === 'withdraw' ? 'withdrawn' : 'active') ||
                !same(observed.services, services) ||
                observed.servicesSha256 !== expected.servicesSha256 ||
                !same(v.applied, effect === 'withdraw' ? absent : owned)
              )
                fail();
            }
          }
        }
        if (['dispatch', 'outcome', 'final-preparing', 'final-plan', 'complete'].includes(kind) && !receipt) fail();
        if (kind === 'dispatch' && !same(v, { marker: expected, receipt })) fail();
        if (kind === 'source' && !same(v, await read(`${stem}-source.json`))) fail();
        if (
          kind === 'outcome' &&
          (!same(v.receipt, receipt) ||
            !names.includes(`${stem}-dispatch.json`) ||
            !timestamp(v.collectedAt) ||
            Date.parse(v.collectedAt) < Date.parse(attempt.originalAttemptAt))
        )
          fail();
        if ((kind === 'outcome' || kind === 'complete') && !family) {
          const fields = object7(v.fields),
            node = plan.bindings.nodes[0];
          if (fields[`aws_instance.node_${node.nodeIndex}`]?.id !== node.instanceId) fail();
          for (const nic of node.interfaces) {
            const row = object7(fields[`aws_network_interface.node_${node.nodeIndex}_nic_${nic.index}`]);
            if (row.id !== nic.id || String(row.mac_address).toLowerCase() !== nic.mac.toLowerCase()) fail();
          }
          const control = fields[revision.address];
          if (
            effect === 'release'
              ? control !== null
              : !control ||
                control.id !== node.instanceId ||
                control.instance_id !== node.instanceId ||
                control.force !== false ||
                control.state !== (effect === 'stop' ? 'stopped' : 'running')
          )
            fail();
          const cloud = object7(v.cloud);
          if (
            !same(cloud.owner, plan.bindings.owner) ||
            !same(cloud.nodes, plan.bindings.nodes) ||
            cloud.cloud !== (effect === 'stop' ? 'stopped' : 'running')
          )
            fail();
        }
        if (kind === 'final-preparing' && !same(v, { marker: expected, removalReceipt: receipt })) fail();
        if (kind === 'final-plan' || kind === 'complete') {
          const r = object7(v.receipt);
          if (
            r.noChanges !== true ||
            r.engine !== 'terraform' ||
            r.deploymentId !== base.deploymentName ||
            r.backendIdentity !== `local:${base.deploymentName}` ||
            r.configurationSha256 !== revision.afterSha256 ||
            r.providerLockSha256 !== AWS_CE_PROVIDER_LOCK_SHA256 ||
            !sha2(r.planSha256) ||
            r.operation ||
            r.actionInvocations?.length ||
            !Array.isArray(r.changes) ||
            new Set(r.changes.map((c) => c.address)).size !== r.changes.length ||
            r.changes.some((c) => !same(c.actions, ['no-op']))
          )
            fail();
          if (
            kind === 'complete' &&
            (!timestamp(v.collectedAt) ||
              Date.parse(v.collectedAt) < Date.parse(attempt.originalAttemptAt) ||
              !same(v.receipt, (await read(`${stem}-final-plan.json`)).receipt))
          )
            fail();
        }
      }
      admitted.add(name);
    }
  }
  if (powerNames.some((n) => !admitted.has(n))) fail();
  return admitted;
}

// plugins/aws/src/ce/terraform-revalidation-retirement.ts
function qualifyAwsTerraformRevalidationCapture(plan, name, input) {
  const fail = () => {
    throw Error('AWS revalidation capture provenance differs');
  };
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail();
  const value = input;
  const fields = [
    'schemaVersion',
    'kind',
    'capturedAt',
    'planId',
    'planSha256',
    'owner',
    'diagnostic',
    'relevantResourceIds',
    'baseline',
    'current',
    'baselineObservationSha256',
    'currentObservationSha256',
  ];
  const reference = name.slice(0, -5);
  if (
    plan.engine !== 'terraform' ||
    !/^observation-rejection-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.json$/.test(name) ||
    canonicalSha256(Object.keys(value).sort()) !== canonicalSha256(fields.sort()) ||
    value.schemaVersion !== 1 ||
    value.kind !== 'aws-ce-revalidation-rejection' ||
    value.planId !== plan.planId ||
    value.planSha256 !== plan.planSha256 ||
    canonicalSha256(value.owner) !==
      canonicalSha256({
        deploymentId: plan.deploymentName,
        engine: plan.engine,
        provider: 'aws',
        account: plan.accountId,
        region: plan.region,
      }) ||
    typeof value.capturedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.capturedAt)) ||
    new Date(value.capturedAt).toISOString() !== value.capturedAt ||
    !Array.isArray(value.relevantResourceIds) ||
    canonicalSha256(value.relevantResourceIds) !== canonicalSha256(terraformPreflightReferences(plan))
  )
    fail();
  const baseline = value.baseline;
  const current = value.current;
  if (
    !baseline ||
    !current ||
    typeof baseline !== 'object' ||
    typeof current !== 'object' ||
    canonicalSha256(baseline) !== value.baselineObservationSha256 ||
    canonicalSha256(current) !== value.currentObservationSha256
  )
    fail();
  let expected;
  try {
    expected = awsCeRevalidationDiagnostic(
      plan,
      baseline,
      current,
      plan.observationFingerprint,
      terraformPreflightReferences(plan),
      'terraform-preflight',
    );
  } catch {
    throw Error('AWS revalidation capture provenance differs');
  }
  if (
    !expected.baselineMatchesExpected ||
    expected.expectedFingerprint !== plan.observationFingerprint ||
    canonicalSha256(value.diagnostic) !==
      canonicalSha256({ ...expected, capture: 'saved', receiptReference: reference })
  )
    fail();
}

// plugins/aws/src/ce/terraform-parent-retirement.ts
var markerName2 = 'aws-terraform-parent-artifact-retirement.json';
var hash4 = (value) => createHash6('sha256').update(value).digest('hex');
var sha3 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
var object8 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed parent retirement evidence');
  return value;
};
async function directory2(path) {
  const stat = await lstat4(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    (await realpath3(path)) !== path
  )
    throw Error('Parent retirement directory ownership differs');
}
async function file2(path) {
  const stat = await lstat4(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.uid !== process.getuid?.() || stat.mode & 63)
    throw Error('Parent retirement file ownership differs');
  const bytes = await readFile4(path);
  const after = await lstat4(path);
  if (after.ino !== stat.ino || after.dev !== stat.dev || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs)
    throw Error('Parent retirement file changed during read');
  return bytes;
}
async function inventory2(base, teardown, evidenceSha256, store, recorded) {
  await directory2(store.directory);
  const items = [];
  const add = async (path, preserve) => {
    const absolute = join6(store.directory, path),
      before = await lstat4(absolute);
    const sha256 = hash4(await file2(absolute)),
      after = await lstat4(absolute);
    if (before.ino !== after.ino || before.dev !== after.dev) throw Error('Parent retirement inode changed');
    items.push({ path, preserve, sha256, inode: after.ino, device: after.dev });
  };
  const runner = async (prefix, stage, upgrade) => {
    const path = join6(store.directory, prefix);
    await directory2(path);
    const names = (await readdir5(path)).sort();
    if (JSON.stringify(names) !== JSON.stringify(['artifact-retirement.json', 'deployment.json']))
      throw Error('Runner has unretired artifacts');
    const encoded = await file2(join6(path, 'deployment.json')),
      manifest = object8(JSON.parse(encoded.toString())),
      scope = object8(manifest.scope);
    const marker = object8(JSON.parse((await file2(join6(path, 'artifact-retirement.json'))).toString()));
    if (
      manifest.schemaVersion !== 1 ||
      manifest.engine !== 'terraform' ||
      manifest.deploymentId !== base.deploymentName ||
      manifest.stage !== stage ||
      manifest.backendIdentity !== `local:${base.deploymentName}${stage ? `:stage:${stage}` : ''}` ||
      scope.cloud !== 'aws' ||
      scope.account !== base.accountId ||
      scope.region !== base.region ||
      marker.schemaVersion !== 1 ||
      marker.status !== 'runner-artifacts-retired' ||
      marker.manifestSha256 !== canonicalSha256(manifest) ||
      marker.evidenceSha256 !== evidenceSha256 ||
      !sha3(marker.finalPlanSha256) ||
      !sha3(marker.planReceiptSha256) ||
      !Array.isArray(marker.artifacts) ||
      marker.inventorySha256 !== hash4(JSON.stringify(marker.artifacts))
    )
      throw Error('Runner retirement provenance differs');
    verifyRetainedCleanup(
      marker.independentCleanup,
      {
        manifestSha256: canonicalSha256(manifest),
        evidenceSha256,
        finalPlanSha256: String(marker.finalPlanSha256),
        planReceiptSha256: String(marker.planReceiptSha256),
      },
      marker.independentCleanupSha256,
    );
    if (upgrade) {
      const deployment = object8(upgrade.deployment),
        retirement = object8(await store.read(`${String(upgrade.planId)}-stage-retirement.json`)),
        final = object8(retirement.receipt);
      if (
        retirement.schemaVersion !== 1 ||
        retirement.status !== 'retired' ||
        canonicalSha256(retirement.owner) !== canonicalSha256(store.owner) ||
        retirement.sourcePlanSha256 !== base.planSha256 ||
        retirement.upgradePlanSha256 !== upgrade.planSha256 ||
        retirement.deploymentSha256 !== canonicalSha256(deployment) ||
        retirement.evidenceSha256 !== evidenceSha256 ||
        retirement.receiptSha256 !== canonicalSha256(final) ||
        manifest.configurationSha256 !== hash4(String(deployment.configuration)) ||
        manifest.providerLockSha256 !== hash4(String(deployment.providerLock)) ||
        marker.finalPlanSha256 !== final.planSha256 ||
        marker.planReceiptSha256 !== canonicalSha256(final) ||
        final.noChanges !== true ||
        final.backendIdentity !== manifest.backendIdentity
      )
        throw Error('Upgrade runner retirement provenance differs');
    }
    for (const name of names) await add(`${prefix}/${name}`, true);
  };
  const preserve = new Set([
    'owner.json',
    'aws-terraform-lifecycle-retirement.json',
    'terraform-brownfield-placement.json',
    'terraform-authorization.json',
    'terraform-f5-resources.json',
    'terraform-f5-stage-retirement.json',
    'terraform-cloud-teardown-inventory.json',
    'aws-terraform-teardown-cloud-absence.json',
    'aws-terraform-terminal-cleanup.json',
    'aws-terraform-metadata-retirement.json',
    `${teardown.planId}.json`,
    `${teardown.planId}-authorization.json`,
  ]);
  const otherTeardownArtifacts = new Set();
  const prefixes = {
    'aws-ce-terraform-teardown': 'aws-ce-teardown-',
    'aws-ce-terraform-foundation-teardown': 'aws-ce-foundation-teardown-',
    'aws-ce-terraform-pending-teardown': 'aws-ce-pending-teardown-',
  };
  for (const name of (await readdir5(store.directory)).filter(
    (name) =>
      /^aws-ce-(?:foundation-|pending-)?teardown-[a-f0-9]{24}\.json$/.test(name) && name !== `${teardown.planId}.json`,
  )) {
    const candidate = object8(await store.read(name));
    const { planId, planSha256, ...draft } = candidate;
    const drain = object8(candidate.drain),
      selectedDrain = object8(object8(await store.read(`${teardown.planId}.json`)).drain);
    if (
      typeof candidate.kind !== 'string' ||
      !Object.hasOwn(prefixes, candidate.kind) ||
      !sha3(planSha256) ||
      planId !== prefixes[candidate.kind] + planSha256.slice(0, 24) ||
      name !== `${planId}.json` ||
      canonicalSha256(draft) !== planSha256 ||
      candidate.schemaVersion !== 1 ||
      candidate.engine !== 'terraform' ||
      candidate.sourcePlanSha256 !== base.planSha256 ||
      drain.sourcePlanSha256 !== base.planSha256 ||
      canonicalSha256(drain.owner) !== canonicalSha256(store.owner) ||
      typeof drain.siteContractFingerprint !== 'string' ||
      !drain.siteContractFingerprint ||
      typeof drain.ingressContractFingerprint !== 'string' ||
      !drain.ingressContractFingerprint ||
      drain.siteContractFingerprint !== selectedDrain.siteContractFingerprint ||
      drain.ingressContractFingerprint !== selectedDrain.ingressContractFingerprint
    )
      throw Error('Alternative teardown artifact identity differs');
    const authName = `${planId}-authorization.json`;
    const authorization = object8(await store.read(authName));
    if (
      canonicalSha256(authorization) !==
      canonicalSha256({
        schemaVersion: 1,
        engine: 'terraform',
        sourcePlanSha256: base.planSha256,
        teardownPlanSha256: planSha256,
        mutations: true,
      })
    )
      throw Error('Alternative teardown artifact authorization differs');
    otherTeardownArtifacts.add(name);
    otherTeardownArtifacts.add(authName);
  }
  const drainJournals = new Set([
    'platform-drain-source.json',
    'platform-drain-progress.json',
    'platform-drain-receipt.json',
  ]);
  const upgrades = new Map();
  const upgradeJournals = new Set();
  for (const name of (await readdir5(store.directory)).filter((name) =>
    /^aws-ce-upgrade-[a-f0-9]{24}\.json$/.test(name),
  )) {
    const source = object8(await store.read(name)),
      deployment = object8(source.deployment);
    if (
      source.schemaVersion !== 2 ||
      source.engine !== 'terraform' ||
      source.kind !== 'aws-ce-terraform-upgrade' ||
      source.sourcePlanSha256 !== base.planSha256 ||
      name !== `${String(source.planId)}.json` ||
      !sha3(source.planSha256) ||
      typeof deployment.stage !== 'string' ||
      !/^upgrade-(?:software|os)-[a-f0-9]{24}$/.test(deployment.stage) ||
      upgrades.has(deployment.stage)
    )
      throw Error('Upgrade parent source identity differs');
    const { planId: _id, planSha256: _sha, ...draft } = source;
    if (canonicalSha256(draft) !== source.planSha256) throw Error('Upgrade parent source digest differs');
    upgrades.set(deployment.stage, source);
    for (const suffix of ['', '-authorization', '-checkpoint', '-action-plan', '-receipt', '-stage-retirement'])
      upgradeJournals.add(`${String(source.planId)}${suffix}.json`);
  }
  const replacementJournals = new Set();
  if (recorded) {
    for (const item of recorded.values())
      if (
        !item.preserve &&
        /^aws-ce-replace-[a-f0-9]{24}(?:-mtu|-terraform-(?:source|quiesce-plan|launch-plan|launch|refresh|final-refresh))?\.json$/.test(
          item.path,
        )
      )
        replacementJournals.add(item.path);
  }
  for (const { binding } of siteBindings(base)) {
    const frozenName = `terraform-initial-replacement-${binding.siteName}.json`;
    if (!(await readdir5(store.directory)).includes(frozenName)) continue;
    if (recorded?.has(frozenName)) continue;
    const frozen = object8(await store.read(frozenName)),
      plan = object8(frozen.plan),
      checkpoint = object8(await store.read(`${String(plan.planId)}.json`));
    const { planId: _id, planSha256: _digest, ...draft } = plan;
    const versions = object8(plan.versions),
      preparation = object8(plan.preparation),
      versionIdentity = object8(versions.identity),
      instances = object8(checkpoint.instances),
      bootstrap = object8(checkpoint.bootstrap),
      bootstrapSha256 = object8(checkpoint.bootstrapSha256);
    if (
      frozen.sourcePlanSha256 !== base.planSha256 ||
      !sha3(frozen.configurationSha256) ||
      plan.schemaVersion !== 2 ||
      plan.kind !== 'aws-ce-site-replacement' ||
      plan.engine !== 'terraform' ||
      plan.sourcePlanSha256 !== base.planSha256 ||
      canonicalSha256(plan.binding) !== canonicalSha256(binding) ||
      !sha3(plan.planSha256) ||
      canonicalSha256(draft) !== plan.planSha256 ||
      plan.planId !== `aws-ce-replace-${String(plan.planSha256).slice(0, 24)}` ||
      versions.schemaVersion !== 1 ||
      canonicalSha256(versionIdentity.binding) !== canonicalSha256(binding) ||
      versionIdentity.siteUid !== preparation.uid ||
      !versionIdentity.physicalSiteUid ||
      checkpoint.physicalSiteUid === versionIdentity.physicalSiteUid ||
      checkpoint.schemaVersion !== 2 ||
      checkpoint.planSha256 !== plan.planSha256 ||
      checkpoint.phase !== 'complete' ||
      typeof checkpoint.siteUid !== 'string' ||
      !checkpoint.siteUid ||
      checkpoint.siteUid === preparation.uid ||
      typeof checkpoint.physicalSiteUid !== 'string' ||
      !checkpoint.physicalSiteUid ||
      !sha3(checkpoint.quiesceConfigurationSha256) ||
      checkpoint.versionAdmissionSha256 !== canonicalSha256(versions) ||
      Object.keys(instances).length !== binding.nodes.length ||
      new Set(Object.values(instances)).size !== binding.nodes.length ||
      Object.keys(bootstrap).length !== binding.nodes.length ||
      Object.keys(bootstrapSha256).length !== binding.nodes.length ||
      binding.nodes.some(
        (node) =>
          !/^i-[a-f0-9]{8,17}$/.test(String(instances[node])) ||
          instances[node] === object8(preparation.instances)[node] ||
          typeof bootstrap[node] !== 'string' ||
          !bootstrap[node] ||
          bootstrapSha256[node] !== canonicalSha256(bootstrap[node]),
      )
    )
      throw Error('Completed replacement parent provenance differs');
    for (const suffix of [
      '',
      '-mtu',
      '-terraform-source',
      '-terraform-quiesce-plan',
      '-terraform-launch-plan',
      '-terraform-launch',
      '-terraform-refresh',
      '-terraform-final-refresh',
    ])
      replacementJournals.add(`${String(plan.planId)}${suffix}.json`);
  }
  for (const name of upgradeJournals) preserve.add(name);
  if (upgrades.size) preserve.add('terraform-ce-upgrade-serial.json');
  const powerJournals = await qualifyAwsTerraformPowerArtifacts(base, store, await readdir5(store.directory), recorded);
  let rootRunner = false;
  for (const name of (await readdir5(store.directory)).sort()) {
    if (name === markerName2 || name === '.aws-terraform-lifecycle-lock') continue;
    if (name === base.deploymentName) {
      await runner(name);
      rootRunner = true;
      continue;
    }
    if (name === 'terraform-stages') {
      await directory2(join6(store.directory, name));
      for (const stage of (await readdir5(join6(store.directory, name))).sort()) {
        if (stage !== 'f5-resources' && !upgrades.has(stage))
          throw Error('Unqualified Terraform stage blocks parent retirement');
        const stagePath = join6(store.directory, name, stage);
        await directory2(stagePath);
        if (JSON.stringify(await readdir5(stagePath)) !== JSON.stringify([base.deploymentName]))
          throw Error('Stage deployment inventory differs');
        await runner(`${name}/${stage}/${base.deploymentName}`, stage, upgrades.get(stage));
      }
      continue;
    }
    if (otherTeardownArtifacts.has(name)) {
      await add(name, false);
      continue;
    }
    if (/^bootstrap-checkout-[a-f0-9-]{36}\.json$/.test(name)) {
      const value = object8(await store.read(name)),
        checkout = object8(value.checkout);
      const match = siteBindings(base).find(
        ({ binding }) => canonicalSha256(value.binding) === canonicalSha256(binding),
      );
      if (
        value.schemaVersion !== 1 ||
        !match ||
        canonicalSha256(value.owner) !== canonicalSha256(match.binding.owner) ||
        !match.binding.nodes.includes(String(value.node)) ||
        typeof value.siteUid !== 'string' ||
        !value.siteUid ||
        typeof value.contractFingerprint !== 'string' ||
        !value.contractFingerprint ||
        typeof value.tokenName !== 'string' ||
        !/^[a-z][a-z0-9-]{0,62}$/.test(value.tokenName) ||
        name !== `bootstrap-checkout-${String(checkout.reference).split('/').at(-1)}.json`
      )
        throw Error('AWS checkout provenance differs');
      if (!recorded?.has(name)) {
        const token = object8(await store.read(`${String(value.tokenName)}.json`));
        if (
          token.tokenName !== value.tokenName ||
          token.siteName !== match.binding.siteName ||
          token.node !== value.node ||
          typeof token.jwt !== 'string' ||
          hash4(token.jwt) !== checkout.digest
        )
          throw Error('AWS checkout upstream token differs');
      }
      await add(name, true);
      continue;
    }
    if (name.startsWith('pending-registration-delete-')) {
      const value = object8(await store.read(name)),
        selected = object8(teardown);
      const { planId: _id, planSha256: _digest, ...draft } = selected;
      const identity = Object.fromEntries(
        ['siteName', 'node', 'name', 'uid', 'instanceId', 'passportSha256'].map((key) => [key, value[key]]),
      );
      const bindings = siteBindings(base);
      const binding = bindings.find(
        ({ binding }) => binding.siteName === value.siteName && binding.nodes.includes(String(value.node)),
      )?.binding;
      const retirements = Array.isArray(selected.retirement) ? selected.retirement.map(object8) : [];
      const matches = retirements
        .filter((site) => site.siteName === value.siteName)
        .flatMap((site) => (Array.isArray(site.registrations) ? site.registrations.map(object8) : []))
        .filter((record) => canonicalSha256(record) === canonicalSha256(identity));
      const instances = object8(selected.initialRegistrationInstances);
      const authorization = await store.read(`${teardown.planId}-authorization.json`);
      if (
        JSON.stringify(Object.keys(value).sort()) !==
          JSON.stringify(
            ['action', 'siteName', 'node', 'name', 'uid', 'instanceId', 'passportSha256', 'state'].sort(),
          ) ||
        selected.schemaVersion !== 1 ||
        selected.engine !== 'terraform' ||
        selected.kind !== 'aws-ce-terraform-pending-teardown' ||
        canonicalSha256(draft) !== teardown.planSha256 ||
        canonicalSha256(await store.read(`${teardown.planId}.json`)) !== canonicalSha256(selected) ||
        canonicalSha256(authorization) !==
          canonicalSha256({
            schemaVersion: 1,
            engine: 'terraform',
            sourcePlanSha256: base.planSha256,
            teardownPlanSha256: teardown.planSha256,
            mutations: true,
          }) ||
        !binding ||
        canonicalSha256(object8(selected.drain).owner) !== canonicalSha256(binding.owner) ||
        value.action !== 'delete-initial-registration' ||
        value.state !== 'submitted' ||
        typeof value.uid !== 'string' ||
        !value.uid ||
        name !== `pending-registration-delete-${value.uid}.json` ||
        typeof value.name !== 'string' ||
        !/^[a-z][a-z0-9-]{0,62}$/.test(value.name) ||
        typeof value.instanceId !== 'string' ||
        !/^i-[a-f0-9]{17}$/.test(value.instanceId) ||
        !sha3(value.passportSha256) ||
        instances[String(value.node)] !== value.instanceId ||
        matches.length !== 1
      )
        throw Error('AWS pending registration deletion provenance differs');
      await add(name, true);
      continue;
    }
    if (name.startsWith('observation-rejection-')) {
      const value = JSON.parse((await file2(join6(store.directory, name))).toString());
      qualifyAwsTerraformRevalidationCapture(base, name, value);
      await add(name, true);
      continue;
    }
    const publicSite = siteBindings(base).find(({ binding }) => name === 'public-site-' + binding.siteName + '.json');
    if (publicSite) {
      const value = object8(await store.read(name)),
        record = object8(value.record),
        retirement = object8(teardown).retirement;
      const sites = Array.isArray(retirement)
        ? retirement.map(object8).filter((site) => site.siteName === publicSite.binding.siteName)
        : [];
      if (
        JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(['planId', 'record']) ||
        JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(['phase', 'resourceVersion', 'uid']) ||
        typeof value.planId !== 'string' ||
        !/^f5xc-ce-v2-[a-f0-9]{24}$/.test(value.planId) ||
        !['replace-prepared', 'replace-observed'].includes(String(record.phase)) ||
        sites.length !== 1 ||
        typeof sites[0].siteUid !== 'string' ||
        !sites[0].siteUid ||
        record.uid !== sites[0].siteUid ||
        typeof record.resourceVersion !== 'string' ||
        !record.resourceVersion
      )
        throw Error('AWS public site replacement journal provenance differs');
      await add(name, true);
      continue;
    }
    if (
      !preserve.has(name) &&
      !drainJournals.has(name) &&
      !powerJournals.has(name) &&
      !replacementJournals.has(name) &&
      !/^(?:terraform-|aws-terraform-|ingress-plan-|ingress-checkpoint-|ingress-origin-checkpoint-)[a-zA-Z0-9._-]+\.json$/.test(
        name,
      )
    ) {
      const value = object8(JSON.parse((await file2(join6(store.directory, name))).toString()));
      const binding = siteBindings(base).find(
        ({ binding }) => value.siteName === binding.siteName && binding.nodes.includes(String(value.node)),
      );
      const site = siteBindings(base).find(({ binding }) => name === `site-binding-${binding.siteName}.json`);
      if (
        !(
          (binding && value.tokenName === name.slice(0, -5) && typeof value.jwt === 'string') ||
          (site && value.schemaVersion === 1 && canonicalSha256(value.binding) === canonicalSha256(site.binding))
        )
      )
        throw Error('Unqualified parent artifact blocks retirement');
    }
    await add(name, preserve.has(name));
  }
  if (!rootRunner) throw Error('Owning Terraform runner retirement is missing');
  return items.sort((a, b) => a.path.localeCompare(b.path));
}
async function retireAwsTerraformParentArtifacts(base, teardown, evidenceSha256, store, signal) {
  base = structuredClone(base);
  teardown = structuredClone(teardown);
  signal?.throwIfAborted();
  verifyAwsCePlan(base);
  if (
    base.engine !== 'terraform' ||
    teardown.sourcePlanSha256 !== base.planSha256 ||
    !sha3(teardown.planSha256) ||
    !sha3(evidenceSha256) ||
    !/^[a-z][a-z0-9-]{0,100}$/.test(teardown.planId) ||
    canonicalSha256(store.owner) !== canonicalSha256(siteBindings(base)[0].binding.owner)
  )
    throw Error('Parent retirement owner or teardown binding differs');
  await store.verify();
  const lifecycle = object8(await store.read('aws-terraform-lifecycle-retirement.json'));
  const authorization = object8(await store.read(`${teardown.planId}-authorization.json`));
  if (
    lifecycle.sourcePlanSha256 !== base.planSha256 ||
    lifecycle.teardownPlanSha256 !== teardown.planSha256 ||
    lifecycle.kind !== teardown.kind ||
    canonicalSha256(lifecycle.owner) !== canonicalSha256(store.owner) ||
    authorization.schemaVersion !== 1 ||
    authorization.engine !== 'terraform' ||
    authorization.sourcePlanSha256 !== base.planSha256 ||
    authorization.teardownPlanSha256 !== teardown.planSha256 ||
    authorization.mutations !== true ||
    canonicalSha256(await store.read(`${teardown.planId}.json`)) !== canonicalSha256(teardown)
  )
    throw Error('Parent retirement authorization differs');
  let saved;
  try {
    saved = await store.read(markerName2);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (saved === undefined) {
    const artifacts = await inventory2(base, teardown, evidenceSha256, store);
    saved = {
      schemaVersion: 1,
      status: 'retiring',
      owner: store.owner,
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: teardown.planSha256,
      evidenceSha256,
      artifacts,
      inventorySha256: canonicalSha256(artifacts),
    };
    signal?.throwIfAborted();
    await store.write(markerName2, saved);
  }
  const marker = object8(saved);
  if (
    marker.schemaVersion !== 1 ||
    !['retiring', 'deployment-artifacts-retired'].includes(String(marker.status)) ||
    canonicalSha256(marker.owner) !== canonicalSha256(store.owner) ||
    marker.sourcePlanSha256 !== base.planSha256 ||
    marker.teardownPlanSha256 !== teardown.planSha256 ||
    marker.evidenceSha256 !== evidenceSha256 ||
    !Array.isArray(marker.artifacts) ||
    marker.inventorySha256 !== canonicalSha256(marker.artifacts)
  )
    throw Error('Parent retirement checkpoint differs');
  const expected = new Map();
  for (const value of marker.artifacts) {
    const item = object8(value);
    if (
      typeof item.path !== 'string' ||
      item.path.split('/').some((p) => !p || p === '.' || p === '..') ||
      !sha3(item.sha256) ||
      typeof item.preserve !== 'boolean' ||
      !Number.isSafeInteger(item.inode) ||
      !Number.isSafeInteger(item.device) ||
      expected.has(item.path)
    )
      throw Error('Parent retirement inventory malformed');
    expected.set(item.path, item);
  }
  const current = await inventory2(base, teardown, evidenceSha256, store, expected);
  if (
    current.some((item) => canonicalSha256(item) !== canonicalSha256(expected.get(item.path))) ||
    [...expected.values()].some((item) => item.preserve && !current.some((row) => row.path === item.path)) ||
    (marker.status === 'deployment-artifacts-retired' && current.some((item) => !item.preserve))
  )
    throw Error('Parent retirement inventory changed');
  for (const item of current.filter((item) => item.path.startsWith('bootstrap-checkout-'))) {
    signal?.throwIfAborted();
    const value = object8(await store.read(item.path));
    await retireBootstrapToken(value.checkout, evidenceSha256, signal);
  }
  for (const item of current.filter((item) => !item.preserve)) {
    signal?.throwIfAborted();
    await directory2(store.directory);
    await store.verify();
    const absolute = join6(store.directory, item.path),
      stat = await lstat4(absolute);
    if (hash4(await file2(absolute)) !== item.sha256 || stat.ino !== item.inode || stat.dev !== item.device)
      throw Error('Parent retirement artifact changed before removal');
    signal?.throwIfAborted();
    await unlink3(join6(store.directory, item.path));
  }
  signal?.throwIfAborted();
  await store.write(markerName2, { ...marker, status: 'deployment-artifacts-retired' });
  return {
    status: 'deployment-artifacts-retired',
    owner: store.owner,
    sourcePlanSha256: base.planSha256,
    teardownPlanSha256: teardown.planSha256,
    evidenceSha256,
    inventorySha256: marker.inventorySha256,
    retiredArtifacts: [...expected.values()].filter((item) => !item.preserve).length,
  };
}

// plugins/aws/src/ce/terraform-upgrade-retirement.ts
import { join as join7 } from 'node:path';

var object9 = (v) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Malformed upgrade retirement evidence');
  return v;
};
var sha4 = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
async function optional7(store, name) {
  try {
    return await store.read(name);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}
async function retireAwsTerraformUpgradeStage(base, input, contract, terraform, store, evidenceSha256, env, signal) {
  const upgrade = structuredClone(input);
  base = structuredClone(base);
  env = { ...env };
  await verifyAwsTerraformUpgrade(base, upgrade, contract);
  if (!sha4(evidenceSha256) || canonicalSha256(store.owner) !== canonicalSha256(upgrade.expectation.binding.owner))
    throw Error('Upgrade retirement owner or external absence differs');
  const release = await acquireProcessLock(join7(store.directory, '.upgrade-lock'));
  try {
    const checkpointName = `${upgrade.planId}-stage-retirement.json`;
    const validate = async () => {
      signal?.throwIfAborted();
      await store.verify();
      if (canonicalSha256(await store.read(`${upgrade.planId}.json`)) !== canonicalSha256(upgrade))
        throw Error('Upgrade retirement source differs');
      const serial = object9(await store.read('terraform-ce-upgrade-serial.json'));
      if (
        serial.schemaVersion !== 2 ||
        serial.engine !== 'terraform' ||
        serial.status !== 'idle' ||
        serial.activePlanId !== undefined ||
        serial.activePlanSha256 !== undefined ||
        typeof serial.lastPlanId !== 'string' ||
        !sha4(serial.lastPlanSha256)
      )
        throw Error('Active or malformed serial upgrade blocks retirement');
      const auth = object9(await store.read(`${upgrade.planId}-authorization.json`)),
        checkpoint = object9(await store.read(`${upgrade.planId}-checkpoint.json`)),
        action = object9(await store.read(`${upgrade.planId}-action-plan.json`)),
        receipt = object9(await store.read(`${upgrade.planId}-receipt.json`));
      if (
        auth.schemaVersion !== 1 ||
        auth.engine !== 'terraform' ||
        auth.sourcePlanSha256 !== base.planSha256 ||
        auth.upgradePlanSha256 !== upgrade.planSha256 ||
        auth.mutations !== true ||
        checkpoint.schemaVersion !== 2 ||
        checkpoint.engine !== 'terraform' ||
        checkpoint.sourcePlanSha256 !== base.planSha256 ||
        checkpoint.upgradePlanSha256 !== upgrade.planSha256 ||
        checkpoint.phase !== 'complete' ||
        !sha4(checkpoint.actionPlanSha256)
      )
        throw Error('Upgrade retirement authorization or completion differs');
      if (
        action.schemaVersion !== 1 ||
        action.engine !== 'terraform' ||
        action.deploymentId !== upgrade.deployment.deploymentId ||
        action.backendIdentity !== upgrade.deployment.backendIdentity ||
        action.configurationSha256 !== sha256Hex(upgrade.deployment.configuration) ||
        action.providerLockSha256 !== sha256Hex(upgrade.deployment.providerLock) ||
        action.operation ||
        action.noChanges !== false ||
        !Array.isArray(action.changes) ||
        action.changes.length ||
        !Array.isArray(action.actionInvocations) ||
        action.actionInvocations.length !== 1 ||
        canonicalSha256(action.actionInvocations[0]) !== canonicalSha256(upgrade.action) ||
        action.planSha256 !== checkpoint.actionPlanSha256 ||
        action.imports ||
        action.relinquishments
      )
        throw Error('Upgrade retirement action differs');
      if (
        receipt.status !== 'upgrade-complete' ||
        receipt.engine !== 'terraform' ||
        receipt.planId !== upgrade.planId ||
        receipt.planSha256 !== upgrade.planSha256 ||
        receipt.siteName !== upgrade.expectation.binding.siteName ||
        canonicalSha256(receipt.target) !== canonicalSha256(upgrade.expectation.target) ||
        receipt.actionPlanSha256 !== action.planSha256 ||
        !Number.isFinite(Date.parse(String(receipt.observedAt))) ||
        receipt.nodeHealth !== 'unknown' ||
        receipt.routing !== 'unknown' ||
        receipt.traffic !== 'unknown'
      )
        throw Error('Upgrade retirement completion receipt differs');
      return action;
    };
    const validateFinal = (v) => {
      const r = object9(v);
      if (
        r.schemaVersion !== 1 ||
        r.engine !== 'terraform' ||
        r.deploymentId !== upgrade.deployment.deploymentId ||
        r.backendIdentity !== upgrade.deployment.backendIdentity ||
        r.configurationSha256 !== sha256Hex(upgrade.deployment.configuration) ||
        r.providerLockSha256 !== sha256Hex(upgrade.deployment.providerLock) ||
        r.noChanges !== true ||
        !Array.isArray(r.changes) ||
        r.changes.length ||
        !sha4(r.planSha256) ||
        r.operation ||
        r.actionInvocations ||
        r.imports ||
        r.relinquishments
      )
        throw Error('Upgrade retirement requires an exact ordinary no-change plan');
      return r;
    };
    const validateCheckpoint = (v) => {
      const c = object9(v);
      if (
        c.schemaVersion !== 1 ||
        !['preparing', 'retiring', 'retired'].includes(String(c.status)) ||
        canonicalSha256(c.owner) !== canonicalSha256(store.owner) ||
        c.sourcePlanSha256 !== base.planSha256 ||
        c.upgradePlanSha256 !== upgrade.planSha256 ||
        c.deploymentSha256 !== canonicalSha256(upgrade.deployment) ||
        c.evidenceSha256 !== evidenceSha256 ||
        (c.status !== 'preparing' && c.receiptSha256 !== canonicalSha256(c.receipt)) ||
        (c.status === 'preparing' && (c.receipt !== undefined || c.receiptSha256 !== undefined))
      )
        throw Error('Upgrade stage retirement checkpoint differs');
      return { bound: c, receipt: c.status === 'preparing' ? undefined : validateFinal(c.receipt) };
    };
    const action = await validate();
    let checkpoint = await optional7(store, checkpointName);
    if (checkpoint !== undefined) validateCheckpoint(checkpoint);
    const session = await terraform.open(store.owner, upgrade.deployment, 'current');
    if (!session.retireArtifacts || !session.readConfigurationSha256)
      throw Error('Owning upgrade stage retirement unavailable');
    if (checkpoint === undefined) {
      if ((await session.readConfigurationSha256()) !== sha256Hex(upgrade.deployment.configuration))
        throw Error('Upgrade stage configuration differs');
      if ((await session.readPlanApplicationState(action)) !== 'applied')
        throw Error('Upgrade owning application is unresolved');
      checkpoint = {
        schemaVersion: 1,
        status: 'preparing',
        owner: store.owner,
        sourcePlanSha256: base.planSha256,
        upgradePlanSha256: upgrade.planSha256,
        deploymentSha256: canonicalSha256(upgrade.deployment),
        evidenceSha256,
      };
      await store.write(checkpointName, checkpoint);
    }
    if (object9(checkpoint).status === 'preparing') {
      const receipt = validateFinal(await session.plan(env, signal));
      await validate();
      checkpoint = {
        schemaVersion: 1,
        status: 'retiring',
        owner: store.owner,
        sourcePlanSha256: base.planSha256,
        upgradePlanSha256: upgrade.planSha256,
        deploymentSha256: canonicalSha256(upgrade.deployment),
        evidenceSha256,
        receipt,
        receiptSha256: canonicalSha256(receipt),
      };
      await store.write(checkpointName, checkpoint);
    }
    const { bound, receipt } = validateCheckpoint(checkpoint);
    await validate();
    if (!receipt) throw Error('Upgrade retirement final receipt missing');
    const result = await session.retireArtifacts(receipt, evidenceSha256, env, signal);
    if (
      result.status !== 'runner-artifacts-retired' ||
      result.evidenceSha256 !== evidenceSha256 ||
      result.finalPlanSha256 !== receipt.planSha256
    )
      throw Error('Upgrade stage retirement result differs');
    await store.write(checkpointName, { ...bound, status: 'retired', result });
    return result;
  } finally {
    await release();
  }
}
async function qualifiedAwsTerraformUpgradeStages(base, store, stages, contract) {
  const { readdir } = await import('fs/promises');
  const sources = (await readdir(store.directory)).filter((name) => /^aws-ce-upgrade-[a-f0-9]{24}\.json$/.test(name));
  const upgrades = [];
  for (const name of sources) {
    const upgrade = await store.read(name);
    await verifyAwsTerraformUpgrade(base, upgrade, contract);
    if (name !== `${upgrade.planId}.json`) throw Error('Upgrade source file identity differs');
    if (stages.includes(String(upgrade.deployment.stage))) upgrades.push(upgrade);
  }
  if (
    new Set(upgrades.map((u) => u.deployment.stage)).size !== upgrades.length ||
    stages.some((stage) => stage !== 'f5-resources' && !upgrades.some((u) => u.deployment.stage === stage))
  )
    throw Error('Unqualified Terraform stage blocks terminal cleanup');
  return upgrades.sort((a, b) => String(a.deployment.stage).localeCompare(String(b.deployment.stage)));
}

// plugins/aws/src/ce/terraform-terminal-cleanup.ts
var checkpointName2 = 'aws-terraform-terminal-cleanup.json';
var object10 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed terminal cleanup evidence');
  return value;
};
async function optional8(store, name) {
  try {
    return await store.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function hasAwsTerraformTerminalCleanup(store) {
  return (await optional8(store, checkpointName2)) !== undefined;
}
async function stageInventory(store) {
  const path = join8(store.directory, 'terraform-stages');
  let names;
  try {
    const stat = await lstat5(path);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.uid !== process.getuid?.() ||
      (await realpath4(path)) !== path
    )
      throw Error('Terminal stage directory ownership differs');
    names = await readdir6(path);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  if (names.some((name) => name !== 'f5-resources' && !/^upgrade-(?:software|os)-[a-f0-9]{24}$/.test(name)))
    throw Error('Unqualified Terraform stage blocks terminal cleanup');
  return names.sort();
}
async function finalizeAwsTerraformCleanup(
  base,
  teardown,
  authorized,
  runtime,
  contract,
  session,
  store,
  api,
  env,
  signal,
  terraform,
) {
  base = structuredClone(base);
  teardown = structuredClone(teardown);
  env = { ...env };
  signal?.throwIfAborted();
  verifyAwsCePlan(base);
  await store.verify();
  if (
    base.engine !== 'terraform' ||
    runtime.engine !== 'terraform' ||
    authorized !== teardown.planSha256 ||
    teardown.sourcePlanSha256 !== base.planSha256 ||
    canonicalSha256(store.owner) !== canonicalSha256(siteBindings(base)[0].binding.owner) ||
    teardown.drain.siteContractFingerprint !== runtime.contract.fingerprint ||
    teardown.drain.ingressContractFingerprint !== contract.fingerprint
  )
    throw Error('Terminal cleanup authorization or contracts differ');
  const savedAuthorization = object10(await store.read(`${teardown.planId}-authorization.json`)),
    lifecycle = object10(await store.read('aws-terraform-lifecycle-retirement.json'));
  if (
    savedAuthorization.schemaVersion !== 1 ||
    savedAuthorization.engine !== 'terraform' ||
    savedAuthorization.mutations !== true ||
    savedAuthorization.sourcePlanSha256 !== base.planSha256 ||
    savedAuthorization.teardownPlanSha256 !== teardown.planSha256 ||
    lifecycle.sourcePlanSha256 !== base.planSha256 ||
    lifecycle.teardownPlanSha256 !== teardown.planSha256 ||
    lifecycle.kind !== teardown.kind ||
    canonicalSha256(lifecycle.owner) !== canonicalSha256(store.owner) ||
    canonicalSha256(await store.read(`${teardown.planId}.json`)) !== canonicalSha256(teardown)
  )
    throw Error('Terminal cleanup persisted authorization differs');
  const inventory = await store.read('terraform-cloud-teardown-inventory.json');
  const namespaces = new Set(['default']);
  const namespace = (value) => {
    if (typeof value !== 'string' || !/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value))
      throw Error('Terminal ingress namespace is unresolved');
    namespaces.add(value);
  };
  for (const item of teardown.drain.listeners ?? []) namespace(object10(item).namespace);
  for (const item of teardown.drain.origins ?? []) namespace(object10(object10(item).origin).namespace);
  const stages = await stageInventory(store);
  const book = await optional8(store, 'terraform-f5-resources.json');
  if ((book !== undefined) !== stages.includes('f5-resources'))
    throw Error('F5 bookkeeping and owning stage inventory differ');
  if (stages.includes('f5-resources') && !terraform?.retireF5Stage)
    throw Error('Owning stage retirement service unavailable');
  const upgradeStages = stages.filter((stage) => stage !== 'f5-resources');
  if (upgradeStages.length) {
    const names = (await readdir6(store.directory)).filter((name) => /^aws-ce-upgrade-[a-f0-9]{24}\.json$/.test(name));
    const sources = await Promise.all(names.map((name) => store.read(name)));
    if (upgradeStages.some((stage) => !sources.some((source) => object10(object10(source).deployment).stage === stage)))
      throw Error('Unqualified Terraform stage blocks terminal cleanup');
  }
  const upgradeContract = upgradeStages.length ? await VerifiedUpgradeContract.release(fetch, signal) : undefined;
  const upgrades = upgradeContract
    ? await qualifiedAwsTerraformUpgradeStages(base, store, stages, upgradeContract)
    : [];
  if (upgrades.length && !terraform) throw Error('Owning upgrade stage retirement service unavailable');
  const fresh = async () => {
    signal?.throwIfAborted();
    const start = Date.now();
    const [platformResult, cloudResult] = await Promise.allSettled([
      Promise.resolve().then(() =>
        runtime.unregisteredAbsence(
          siteBindings(base).map((row) => row.binding),
          [...namespaces].sort(),
          contract,
          signal,
        ),
      ),
      Promise.resolve().then(() => collectAwsTerraformAbsence(base, inventory, api, signal)),
    ]);
    const failures = [];
    if (platformResult.status === 'rejected') failures.push(platformResult.reason);
    if (cloudResult.status === 'rejected') failures.push(cloudResult.reason);
    if (failures.length > 1) throw new AggregateError(failures, 'Current cleanup absence collection failed');
    if (platformResult.status === 'rejected') throw platformResult.reason;
    if (cloudResult.status === 'rejected') throw cloudResult.reason;
    signal?.throwIfAborted();
    const platform = platformResult.value,
      cloud = cloudResult.value;
    const at = Date.parse(platform.observedAt),
      began = Date.parse(platform.startedAt);
    if (
      platform.status !== 'absent' ||
      canonicalSha256(platform.owner) !== canonicalSha256(store.owner) ||
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
      throw Error('Current complete platform absence unavailable');
    if (cloud.status !== 'absent-or-retired') throw Error('Current exact cloud absence unavailable');
    return { platform, cloud };
  };
  let checkpoint = await optional8(store, checkpointName2);
  let current = await fresh();
  await retireAwsTerraformMetadata(base, store, api, signal);
  if (checkpoint === undefined) {
    const phase = object10(await store.read('terraform-cloud-teardown.json'));
    if (
      phase.schemaVersion !== 1 ||
      phase.engine !== 'terraform' ||
      phase.sourcePlanSha256 !== base.planSha256 ||
      phase.phase !== 'retired'
    )
      throw Error('Cloud teardown has not converged');
    if (!session.retireArtifacts) throw Error('Owning runner retirement unavailable');
    const receipt = await session.plan(env, signal);
    if (
      receipt.schemaVersion !== 1 ||
      receipt.engine !== 'terraform' ||
      receipt.deploymentId !== base.deploymentName ||
      receipt.backendIdentity !== `local:${base.deploymentName}` ||
      receipt.noChanges !== true ||
      !Array.isArray(receipt.changes) ||
      receipt.changes.length ||
      !/^[a-f0-9]{64}$/.test(receipt.planSha256) ||
      receipt.operation ||
      receipt.actionInvocations ||
      receipt.imports ||
      receipt.relinquishments
    )
      throw Error('Terminal runner final plan is not an ordinary no-change plan');
    current = await fresh();
    const evidence = {
      owner: store.owner,
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: teardown.planSha256,
      contracts: { site: runtime.contract.fingerprint, ingress: contract.fingerprint },
      inventorySha256: inventory.sha256,
      stages,
      observation: current,
    };
    checkpoint = {
      schemaVersion: 1,
      owner: store.owner,
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: teardown.planSha256,
      evidence,
      evidenceSha256: canonicalSha256(evidence),
      receipt,
      receiptSha256: canonicalSha256(receipt),
    };
    await store.write(checkpointName2, checkpoint);
  }
  const bound = object10(checkpoint),
    evidence = object10(bound.evidence),
    receipt = object10(bound.receipt);
  if (
    bound.schemaVersion !== 1 ||
    canonicalSha256(bound.owner) !== canonicalSha256(store.owner) ||
    bound.sourcePlanSha256 !== base.planSha256 ||
    bound.teardownPlanSha256 !== teardown.planSha256 ||
    bound.evidenceSha256 !== canonicalSha256(evidence) ||
    bound.receiptSha256 !== canonicalSha256(receipt) ||
    evidence.inventorySha256 !== inventory.sha256 ||
    canonicalSha256(evidence.stages) !== canonicalSha256(stages) ||
    canonicalSha256(evidence.contracts) !==
      canonicalSha256({ site: runtime.contract.fingerprint, ingress: contract.fingerprint }) ||
    receipt.noChanges !== true ||
    receipt.backendIdentity !== `local:${base.deploymentName}`
  )
    throw Error('Terminal cleanup checkpoint differs');
  const parent = await optional8(store, 'aws-terraform-parent-artifact-retirement.json');
  if (parent !== undefined && object10(parent).status === 'deployment-artifacts-retired') {
    return {
      ...(await retireAwsTerraformParentArtifacts(base, teardown, String(bound.evidenceSha256), store, signal)),
      cloudInventory: 'absent-or-retired',
      platformInventory: 'absent',
    };
  }
  for (const upgrade of upgrades) {
    if (!terraform || !upgradeContract) throw Error('Owning upgrade stage retirement service unavailable');
    await retireAwsTerraformUpgradeStage(
      base,
      upgrade,
      upgradeContract,
      terraform,
      store,
      String(bound.evidenceSha256),
      env,
      signal,
    );
    await fresh();
  }
  if (stages.includes('f5-resources')) {
    if (!terraform?.retireF5Stage) throw Error('Owning stage retirement service unavailable');
    await terraform.retireF5Stage(store.owner, base.planSha256, String(bound.evidenceSha256), env, signal);
    await fresh();
  }
  if (!session.retireArtifacts) throw Error('Owning runner retirement unavailable');
  const result = await session.retireArtifacts(receipt, String(bound.evidenceSha256), env, signal);
  if (
    result.status !== 'runner-artifacts-retired' ||
    result.evidenceSha256 !== bound.evidenceSha256 ||
    result.finalPlanSha256 !== receipt.planSha256
  )
    throw Error('Terminal runner retirement result differs');
  await fresh();
  return {
    ...(await retireAwsTerraformParentArtifacts(base, teardown, String(bound.evidenceSha256), store, signal)),
    cloudInventory: 'absent-or-retired',
    platformInventory: 'absent',
  };
}

// plugins/aws/src/ce/terraform-teardown.ts
var name2 = (value) => typeof value === 'string' && /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
var uid2 = (value) => typeof value === 'string' && !!value.trim();
function compileAwsTerraformTeardown(base, drain, retirement) {
  verifyAwsCePlan(base);
  const selected = siteBindings(base);
  if (
    base.engine !== 'terraform' ||
    drain?.schemaVersion !== 1 ||
    drain.sourcePlanSha256 !== base.planSha256 ||
    canonicalSha256(drain.owner) !== canonicalSha256(selected[0].binding.owner) ||
    !Array.isArray(drain.sites) ||
    drain.sites.length !== selected.length ||
    !Array.isArray(retirement) ||
    retirement.length !== selected.length ||
    !Array.isArray(base.actions)
  )
    throw new Error('Terraform teardown source or topology differs');
  const peers = base.actions.filter((action) => action.kind === 'tgw-connect-peer-create');
  if (
    !['direct-eni', 'nlb-ingress', 'tgw-static', 'tgw-connect'].includes(base.routing?.profile) ||
    (base.routing.profile === 'tgw-connect' ? !peers.length : !!peers.length)
  )
    throw new Error('Terraform teardown routing source is incomplete');
  const exportPolicies = drain.sites.flatMap((row) => row.routing).filter((row) => row.kind === 'bgp_routing_policy');
  if (exportPolicies.length !== 0 && exportPolicies.length !== selected.length)
    throw new Error('Terraform teardown export-policy inventory is incomplete');
  const seen = new Set();
  const unique = (key) => {
    if (seen.has(key)) throw new Error('Duplicate teardown resource identity');
    seen.add(key);
  };
  for (const { site, binding } of selected) {
    const matches = drain.sites.filter((row) => row.binding?.siteName === site.name),
      retired = retirement.filter((row) => row.siteName === site.name);
    if (matches.length !== 1 || retired.length !== 1)
      throw new Error('Terraform teardown site inventory is incomplete');
    const planned = matches[0],
      target = retired[0];
    if (
      canonicalSha256(planned.binding) !== canonicalSha256(binding) ||
      !uid2(planned.siteUid) ||
      target.siteUid !== planned.siteUid ||
      !uid2(target.physicalSiteUid)
    )
      throw new Error('Terraform teardown site identity differs');
    unique(`uid:${target.siteUid}`);
    unique(`uid:${target.physicalSiteUid}`);
    const expected = peers
      .filter((action) => site.nodeIndexes.includes(action.node ?? 0))
      .map((action) => ({
        kind: 'external_connector',
        name: `${base.deploymentName.slice(0, 24)}-gre-${peers.indexOf(action) + 1}`,
      }));
    if (expected.length) {
      if (exportPolicies.length)
        expected.push({ kind: 'bgp_routing_policy', name: `${site.name.slice(0, 43)}-tgw-export-policy` });
      expected.push({ kind: 'bgp', name: `${site.name.slice(0, 55)}-tgw-bgp` });
    }
    if (
      !Array.isArray(planned.routing) ||
      planned.routing.length !== expected.length ||
      expected.some(
        (row) => planned.routing.filter((value) => value.name === row.name && value.kind === row.kind).length !== 1,
      )
    )
      throw new Error('Terraform teardown routing inventory is incomplete');
    for (const resource of planned.routing) {
      if (!uid2(resource.uid)) throw new Error('Routing UID missing');
      unique(`uid:${resource.uid}`);
    }
    if (
      !Array.isArray(target.tokens) ||
      target.tokens.length > 128 ||
      binding.nodes.some((node) => !target.tokens.some((token) => token.node === node))
    )
      throw new Error('Bootstrap token inventory is incomplete');
    for (const token of target.tokens) {
      if (!binding.nodes.includes(token.node) || !name2(token.name)) throw new Error('Bootstrap token scope differs');
      unique(`token:${token.name}`);
    }
  }
  const draft = {
    schemaVersion: 1,
    kind: 'aws-ce-terraform-teardown',
    engine: 'terraform',
    sourcePlanSha256: base.planSha256,
    drain: structuredClone(drain),
    retirement: structuredClone(retirement),
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-teardown-${planSha256.slice(0, 24)}`, planSha256 };
}
async function coordinateAwsTerraformTeardown(base, input, authorizedPlanSha256, storage, driver, signal) {
  base = structuredClone(base);
  const plan = structuredClone(input);
  const compiled = compileAwsTerraformTeardown(base, plan.drain, plan.retirement);
  const validate = async () => {
    signal?.throwIfAborted();
    await storage.verify();
    if (
      canonicalSha256(compiled) !== canonicalSha256(plan) ||
      authorizedPlanSha256 !== plan.planSha256 ||
      canonicalSha256(storage.owner) !== canonicalSha256(plan.drain.owner) ||
      driver.engine !== 'terraform' ||
      driver.siteContractFingerprint !== plan.drain.siteContractFingerprint ||
      driver.ingressContractFingerprint !== plan.drain.ingressContractFingerprint
    )
      throw new Error('Terraform teardown ownership, authorization or contract differs');
  };
  await validate();
  let saved;
  try {
    saved = await storage.read('aws-terraform-teardown-source.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (saved === undefined) await storage.write('aws-terraform-teardown-source.json', plan);
  else if (!saved || canonicalSha256(saved) !== canonicalSha256(plan))
    throw new Error('Persisted Terraform teardown source differs');
  await beginAwsTerraformRetirement(base, plan, storage);
  const completed = [];
  const checkpoint = () =>
    storage.write('aws-terraform-teardown-progress.json', {
      schemaVersion: 1,
      planSha256: plan.planSha256,
      completed: [...completed],
      observedAt: new Date().toISOString(),
    });
  const drained = await driver.drain(signal);
  if (drained.status !== 'platform-drained') return { status: 'pending-platform-drain', cloudInventory: 'unknown' };
  completed.push('platform-drained');
  await checkpoint();
  await validate();
  const cloud = await driver.retireCloud(signal);
  if (
    cloud.status !== 'terraform-state-retired' ||
    cloud.sourcePlanSha256 !== base.planSha256 ||
    !/^[a-f0-9]{64}$/.test(cloud.finalPlanSha256)
  )
    throw new Error('Cloud retirement did not produce a bound no-change receipt');
  completed.push('terraform-state-retired');
  await checkpoint();
  for (const site of plan.retirement) {
    await validate();
    if (!['pending', 'deleted'].includes((await driver.observeSite(site, signal)).status))
      throw new Error('Site retirement identity evidence is unknown');
    for (const token of site.tokens) {
      await validate();
      await driver.revokeToken(site, token, signal);
      completed.push(`token:${token.name}`);
      await checkpoint();
    }
    await validate();
    await driver.deleteSite(site, signal);
    const observation = await driver.observeSite(site, signal);
    if (observation.status !== 'deleted')
      return {
        status: 'pending-site-retirement',
        siteName: site.siteName,
        cloudInventory: 'unknown',
      };
    completed.push(`site:${site.siteName}`);
    await checkpoint();
  }
  await validate();
  const finalCloud = await driver.retireCloud(signal);
  if (
    finalCloud.status !== 'terraform-state-retired' ||
    finalCloud.sourcePlanSha256 !== base.planSha256 ||
    !/^[a-f0-9]{64}$/.test(finalCloud.finalPlanSha256)
  )
    throw new Error('Final Terraform refresh did not converge');
  const receipt = {
    status: 'resources-retired-awaiting-inventory',
    owner: storage.owner,
    planSha256: plan.planSha256,
    sourcePlanSha256: base.planSha256,
    finalPlanSha256: finalCloud.finalPlanSha256,
    completed,
    cloudInventory: 'unknown',
    observedAt: new Date().toISOString(),
  };
  await storage.write('aws-terraform-teardown-receipt.json', receipt);
  return receipt;
}
async function verifyAwsTeardownCredentials(base, rawApi, signal) {
  signal?.throwIfAborted();
  verifyAwsCePlan(base);
  if (base.engine !== 'terraform') throw new Error('Terraform engine required for teardown');
  const api = scopedAwsApi(rawApi, base.intent.awsProfile, signal);
  const identity = await execAwsJson(api, ['sts', 'get-caller-identity', '--region', base.intent.region], signal);
  signal?.throwIfAborted();
  if (
    !identity ||
    typeof identity !== 'object' ||
    Array.isArray(identity) ||
    identity.Account !== base.intent.accountId
  )
    throw new Error('AWS teardown credential account is missing or differs');
}
async function runAwsTerraformTeardown(...args) {
  return withAwsTerraformLifecycle(args[6], args[9], async () => {
    if (!(await hasAwsTerraformTerminalCleanup(args[6]))) {
      const result = await runAwsTerraformTeardownUnlocked(...args);
      if (result.status !== 'ce-retired-supporting-infrastructure-unverified') return result;
    }
    return finalizeAwsTerraformCleanup(...args);
  });
}
async function runAwsTerraformTeardownUnlocked(
  base,
  plan,
  authorizedPlanSha256,
  runtime,
  contract,
  session,
  storage,
  api,
  env,
  signal,
  _terraform,
) {
  if (plan.kind === 'aws-ce-terraform-pending-teardown')
    return runAwsPendingTeardown(
      base,
      plan,
      authorizedPlanSha256,
      runtime,
      contract,
      session,
      storage,
      api,
      env,
      signal,
    );
  if (plan.kind === 'aws-ce-terraform-foundation-teardown')
    return runAwsFoundationTeardown(
      base,
      plan,
      authorizedPlanSha256,
      runtime,
      contract,
      session,
      storage,
      api,
      env,
      signal,
    );
  base = structuredClone(base);
  plan = structuredClone(plan);
  const bindings = siteBindings(base);
  const binding = (site) => {
    const found = bindings.find((row) => row.site.name === site.siteName);
    if (!found) throw new Error('Teardown site is outside deployment');
    return found.binding;
  };
  if (runtime.engine !== 'terraform') throw new Error('Terraform engine required for teardown');
  await verifyAwsTeardownCredentials(base, api, signal);
  const retired = await coordinateAwsTerraformTeardown(
    base,
    plan,
    authorizedPlanSha256,
    storage,
    {
      engine: 'terraform',
      siteContractFingerprint: runtime.contract.fingerprint,
      ingressContractFingerprint: contract.fingerprint,
      drain: (signal) => runtime.drainPlatform(plan.drain, contract, storage, signal),
      retireCloud: (signal) => runAwsTerraformCloudTeardown(base, session, storage, api, env, signal),
      observeSite: (site, signal) =>
        runtime.observeSiteDeletion(
          binding(site),
          { siteUid: site.siteUid, physicalSiteUid: site.physicalSiteUid },
          signal,
        ),
      revokeToken: (site, token, signal) => runtime.deleteBootstrapToken(binding(site), token.node, token.name, signal),
      deleteSite: (site, signal) => runtime.deleteSiteExact(binding(site), site.siteUid, signal),
    },
    signal,
  );
  if (retired.status !== 'resources-retired-awaiting-inventory') return retired;
  const inventory = await storage.read('terraform-cloud-teardown-inventory.json');
  const observation = await collectAwsTerraformAbsence(base, inventory, api, signal);
  await storage.write('aws-terraform-teardown-cloud-absence.json', observation);
  return {
    ...retired,
    status:
      observation.status === 'absent-or-retired'
        ? 'ce-retired-supporting-infrastructure-unverified'
        : 'pending-cloud-inventory',
    cloudInventory: observation.status,
  };
}

// plugins/aws/src/ce/terraform-foundation-teardown.ts
async function verifyFoundationJournal(base, storage) {
  verifyAwsCePlan(base);
  if (
    base.engine !== 'terraform' ||
    base.intent.operation !== 'deploy' ||
    canonicalSha256(storage.owner) !== canonicalSha256(siteBindings(base)[0].binding.owner)
  )
    throw new Error('Foundation teardown engine or owner differs');
  await storage.verify();
  const auth = await storage.read('terraform-authorization.json');
  const workflow = await storage.read('terraform-workflow.json');
  if (
    auth?.schemaVersion !== 1 ||
    auth.engine !== 'terraform' ||
    auth.planSha256 !== base.planSha256 ||
    auth.mutations !== true ||
    auth.f5StateOwner !== 'terraform' ||
    !workflow ||
    workflow.schemaVersion !== 1 ||
    workflow.engine !== 'terraform' ||
    workflow.planSha256 !== base.planSha256 ||
    !['network-pending', 'registration-pending'].includes(String(workflow.stage))
  )
    throw new Error('Foundation teardown requires the exact owning pre-admission journal');
  const files = await readdir7(storage.directory);
  if (
    files.some((file) =>
      /^(terraform-(admission|site-|registration-|routing-|connect-|direct-|initial-)|ingress-plan-)/.test(file),
    )
  )
    throw new Error('Admission or routing has started; explicit platform retirement is required');
}
function compile2(base, site, ingress) {
  verifyAwsCePlan(base);
  if (base.engine !== 'terraform' || !site || !ingress) throw new Error('Foundation teardown contract differs');
  const draft = {
    schemaVersion: 1,
    kind: 'aws-ce-terraform-foundation-teardown',
    engine: 'terraform',
    sourcePlanSha256: base.planSha256,
    drain: {
      schemaVersion: 1,
      owner: siteBindings(base)[0].binding.owner,
      sourcePlanSha256: base.planSha256,
      siteContractFingerprint: site,
      ingressContractFingerprint: ingress,
      sites: [],
      listeners: [],
      origins: [],
    },
    retirement: [],
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-foundation-teardown-${planSha256.slice(0, 24)}`, planSha256 };
}
function requireAbsence(receipt, base, site, ingress) {
  const at = Date.parse(receipt.observedAt);
  if (
    receipt.status !== 'absent' ||
    canonicalSha256(receipt.owner) !== canonicalSha256(siteBindings(base)[0].binding.owner) ||
    receipt.siteContractFingerprint !== site ||
    receipt.ingressContractFingerprint !== ingress ||
    !Number.isFinite(at) ||
    at > Date.now() ||
    Date.now() - at > 60000
  )
    throw new Error('Fresh unregistered platform absence is unavailable');
}
async function prepareAwsFoundationTeardown(base, runtime, contract, storage, signal) {
  signal?.throwIfAborted();
  if (runtime.engine !== 'terraform') throw new Error('Foundation teardown runtime engine differs');
  await verifyFoundationJournal(base, storage);
  const plan = compile2(base, runtime.contract.fingerprint, contract.fingerprint);
  requireAbsence(
    await runtime.unregisteredAbsence(
      siteBindings(base).map((row) => row.binding),
      ['default'],
      contract,
      signal,
    ),
    base,
    runtime.contract.fingerprint,
    contract.fingerprint,
  );
  await verifyFoundationJournal(base, storage);
  await storage.write(`${plan.planId}.json`, plan);
  return plan;
}
async function coordinateAwsFoundationTeardown(base, input, authorized, storage, driver, signal) {
  base = structuredClone(base);
  const plan = structuredClone(input);
  const validate = async () => {
    signal?.throwIfAborted();
    await verifyFoundationJournal(base, storage);
    if (
      driver.engine !== 'terraform' ||
      authorized !== plan.planSha256 ||
      canonicalSha256(plan) !==
        canonicalSha256(compile2(base, driver.siteContractFingerprint, driver.ingressContractFingerprint))
    )
      throw new Error('Foundation teardown authorization or immutable plan differs');
  };
  await validate();
  requireAbsence(await driver.observe(signal), base, driver.siteContractFingerprint, driver.ingressContractFingerprint);
  await validate();
  await beginAwsTerraformRetirement(base, plan, storage);
  const cloud = await driver.retireCloud(signal);
  if (
    cloud.status !== 'terraform-state-retired' ||
    cloud.sourcePlanSha256 !== base.planSha256 ||
    !/^[a-f0-9]{64}$/.test(cloud.finalPlanSha256)
  )
    throw new Error('Foundation cloud retirement has no bound no-change receipt');
  await validate();
  requireAbsence(await driver.observe(signal), base, driver.siteContractFingerprint, driver.ingressContractFingerprint);
  const receipt = {
    status: 'resources-retired-awaiting-inventory',
    owner: storage.owner,
    sourcePlanSha256: base.planSha256,
    planSha256: plan.planSha256,
    finalPlanSha256: cloud.finalPlanSha256,
    cloudInventory: 'unknown',
    observedAt: new Date().toISOString(),
  };
  await storage.write('aws-terraform-foundation-teardown-receipt.json', receipt);
  return receipt;
}
async function runAwsFoundationTeardown(base, plan, authorized, runtime, contract, session, storage, api, env, signal) {
  if (runtime.engine !== 'terraform') throw new Error('Foundation teardown runtime engine differs');
  await verifyAwsTeardownCredentials(base, api, signal);
  const retired = await coordinateAwsFoundationTeardown(
    base,
    plan,
    authorized,
    storage,
    {
      engine: 'terraform',
      siteContractFingerprint: runtime.contract.fingerprint,
      ingressContractFingerprint: contract.fingerprint,
      observe: (signal) =>
        runtime.unregisteredAbsence(
          siteBindings(base).map((row) => row.binding),
          ['default'],
          contract,
          signal,
        ),
      retireCloud: (signal) => runAwsTerraformCloudTeardown(base, session, storage, api, env, signal),
    },
    signal,
  );
  const inventory = await storage.read('terraform-cloud-teardown-inventory.json');
  const observation = await collectAwsTerraformAbsence(base, inventory, api, signal);
  await storage.write('aws-terraform-teardown-cloud-absence.json', observation);
  return {
    ...retired,
    status:
      observation.status === 'absent-or-retired'
        ? 'ce-retired-supporting-infrastructure-unverified'
        : 'pending-cloud-inventory',
    cloudInventory: observation.status,
  };
}

// plugins/aws/src/ce/terraform-teardown-plan.ts
var object11 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed teardown source record');
  return value;
};
var safeName = (value) => typeof value === 'string' && /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
async function optional9(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function collectAwsTeardownMaterial(input, runtime, contract, storage, signal) {
  const base = structuredClone(input);
  verifyAwsCePlan(base);
  signal?.throwIfAborted();
  const selected = siteBindings(base),
    bindings = selected.map((row) => row.binding),
    owner = bindings[0].owner;
  if (runtime.engine !== base.engine || canonicalSha256(storage.owner) !== canonicalSha256(owner))
    throw new Error('Teardown preparation requires the owning deployment engine');
  await storage.verify();
  const patterns = selected.flatMap(({ site, binding }) =>
    site.nodeIndexes.flatMap((globalIndex, localIndex) => [
      {
        prefix: `${base.deploymentName.slice(0, 40)}-${globalIndex}-`,
        siteName: binding.siteName,
        node: binding.nodes[localIndex],
      },
      {
        prefix: `${binding.siteName.slice(0, 36)}-${localIndex + 1}-r-`,
        siteName: binding.siteName,
        node: binding.nodes[localIndex],
      },
    ]),
  );
  const tokenMatches = (file) =>
    patterns.filter((row) => file.startsWith(row.prefix) && /^[a-f0-9]{12}\.json$/.test(file.slice(row.prefix.length)));
  const ingressFile = (file) => /^ingress-plan-[a-f0-9]{24}\.json$/.test(file);
  const files = async () => {
    await storage.verify();
    const entries = await readdir8(storage.directory, { withFileTypes: true });
    return entries
      .filter((entry) => ingressFile(entry.name) || tokenMatches(entry.name).length)
      .map((entry) => {
        if (!entry.isFile()) throw new Error('Teardown artifact is not a private regular file');
        return entry.name;
      })
      .sort();
  };
  const before = await files(),
    namespaces = new Set(['default']);
  for (const file of before.filter(ingressFile)) {
    const value = object11(await storage.read(file));
    const namespace = object11(object11(value.request).metadata).namespace;
    if (!safeName(namespace)) throw new Error('Stored listener namespace is invalid');
    namespaces.add(namespace);
    const originNamespace = object11(object11(object11(value.material).intent).originPool).namespace;
    if (!safeName(originNamespace)) throw new Error('Stored origin namespace is invalid');
    namespaces.add(originNamespace);
  }
  const observe = async () => {
    let receipt = await runtime.teardownInventory(bindings, [...namespaces].sort(), contract, signal);
    if (
      receipt.status !== 'observed' &&
      base.engine === 'native' &&
      bindings.length === 1 &&
      bindings[0].nodes.length === 1
    ) {
      const pending = await runtime.preRegistrationInventory(bindings, [...namespaces].sort(), contract, signal);
      if (
        pending.status === 'observed' &&
        pending.sites.length === bindings.length &&
        pending.sites.every(
          (site) =>
            typeof site.siteUid === 'string' &&
            !!site.siteUid.trim() &&
            typeof site.physicalSiteUid === 'string' &&
            !!site.physicalSiteUid.trim(),
        ) &&
        pending.resources.every((resource) => resource.kind === 'tokens')
      ) {
        receipt = {
          ...pending,
          status: 'observed',
          sites: pending.sites.map((site) => ({
            siteName: site.siteName,
            siteUid: site.siteUid,
            physicalSiteUid: site.physicalSiteUid,
          })),
        };
      }
    }
    const observedAt = Date.parse(receipt.observedAt);
    if (
      receipt.status !== 'observed' ||
      canonicalSha256(receipt.owner) !== canonicalSha256(owner) ||
      receipt.siteContractFingerprint !== runtime.contract.fingerprint ||
      receipt.ingressContractFingerprint !== contract.fingerprint ||
      !Number.isFinite(observedAt) ||
      observedAt > Date.now() ||
      Date.now() - observedAt > 60000
    )
      throw new Error('Fresh platform teardown inventory is unavailable');
    return receipt;
  };
  const inventory = await observe(),
    ingress = runtime.ingress(contract, storage),
    originOperations = runtime.originTeardown(contract);
  const listeners = [];
  const listenerIds = new Set();
  const listenerLocators = new Set();
  for (const live of inventory.resources.filter((row) => row.kind === 'http_loadbalancers')) {
    if (!live.ingressPlanId) throw new Error('Live listener has no plan identity');
    const reference = await ingress.teardownReference(live.ingressPlanId);
    if (
      reference.phase !== 'created' ||
      reference.name !== live.name ||
      reference.namespace !== live.namespace ||
      reference.uid !== live.uid
    )
      throw new Error('Listener checkpoint differs from live resource');
    if (
      !inventory.resources.some(
        (row) =>
          row.kind === 'origin_pools' &&
          row.name === reference.originPool.name &&
          row.namespace === reference.originPool.namespace &&
          row.uid === reference.originPool.uid,
      )
    )
      throw new Error('Listener origin UID differs from live inventory');
    listeners.push({ id: reference.id, name: reference.name, namespace: reference.namespace });
    listenerIds.add(reference.id);
    listenerLocators.add(`${reference.namespace}/${reference.name}`);
  }
  for (const file of before.filter(ingressFile)) {
    const id = file.slice('ingress-plan-'.length, -'.json'.length);
    if (listenerIds.has(id)) continue;
    const reference = await ingress.teardownReference(id);
    const locator = `${reference.namespace}/${reference.name}`;
    if (reference.phase !== 'deleted')
      throw new Error('Checkpointed listener is unexpectedly absent from live inventory');
    if (listenerLocators.has(locator)) continue;
    listeners.push({ id: reference.id, name: reference.name, namespace: reference.namespace });
    listenerIds.add(reference.id);
    listenerLocators.add(locator);
  }
  const origins = [];
  for (const live of inventory.resources.filter((row) => row.kind === 'origin_pools'))
    origins.push(
      await originOperations.observe(owner, { name: live.name, namespace: live.namespace, uid: live.uid }, signal),
    );
  const routing = inventory.resources.filter(
    (row) => row.kind === 'bgps' || row.kind === 'bgp_routing_policys' || row.kind === 'external_connectors',
  );
  if (base.routing.profile === 'tgw-connect') {
    const saved = await optional9(storage, `${base.engine}-routing-checkpoint.json`);
    if (saved === undefined) {
      if (routing.length) throw new Error('Live routing exists without an owning checkpoint');
    } else {
      const checkpoint = object11(saved);
      let values;
      if (base.engine === 'terraform') {
        if (
          checkpoint.schemaVersion !== 2 ||
          checkpoint.engine !== 'terraform' ||
          checkpoint.planId !== base.planId ||
          checkpoint.planSha256 !== base.planSha256
        )
          throw new Error('Routing checkpoint source differs');
        values = object11(checkpoint.resolvedValues);
      } else {
        const native = checkpoint;
        const version = Number(checkpoint.schemaVersion);
        const legacy = version === 1;
        const checkpointedRouting = legacy ? routing.filter((row) => row.kind !== 'bgp_routing_policys') : routing;
        if (
          ![1, 2].includes(version) ||
          native.engine !== 'native' ||
          native.planId !== base.planId ||
          native.planSha256 !== base.planSha256 ||
          native.ownerSha256 !== canonicalSha256(owner) ||
          !Array.isArray(native.resources) ||
          native.resources.length !== checkpointedRouting.length
        )
          throw new Error('Routing checkpoint source differs');
        values = Object.fromEntries(native.resources.map((row) => [`__XC_ROUTING_${row.name}__`, row.uid]));
        if (legacy) {
          const policies = routing.filter((row) => row.kind === 'bgp_routing_policys');
          const expected = siteBindings(base).map(({ site }) => `${site.name.slice(0, 43)}-tgw-export-policy`);
          if (
            policies.length !== expected.length ||
            policies.some((row) => !expected.includes(row.name)) ||
            new Set(policies.map((row) => row.name)).size !== expected.length
          )
            throw new Error('Legacy routing policy inventory differs');
          for (const row of policies) values[`__XC_ROUTING_${row.name}__`] = row.uid;
        }
      }
      if (routing.some((row) => values[`__XC_ROUTING_${row.name}__`] !== row.uid))
        throw new Error('Routing checkpoint UID differs from live inventory');
    }
  }
  const tokenRows = new Map();
  for (const file of before) {
    const matches = tokenMatches(file);
    if (!matches.length) continue;
    if (matches.length !== 1) throw new Error('Ambiguous historical enrollment filename');
    const record = object11(await storage.read(file));
    const { tokenName, siteName, node } = record;
    if (
      !safeName(tokenName) ||
      file !== `${tokenName}.json` ||
      siteName !== matches[0].siteName ||
      node !== matches[0].node
    )
      throw new Error('Historical enrollment identity differs');
    tokenRows.set(tokenName, { siteName: matches[0].siteName, node: matches[0].node, name: tokenName });
  }
  for (const live of inventory.resources.filter((row) => row.kind === 'tokens')) {
    if (!live.node || !live.siteName) throw new Error('Live token correlation missing');
    const existing = tokenRows.get(live.name);
    if (existing && (existing.node !== live.node || existing.siteName !== live.siteName))
      throw new Error('Live and historical token identities conflict');
    tokenRows.set(live.name, { siteName: live.siteName, node: live.node, name: live.name });
  }
  const drain = {
    schemaVersion: 1,
    owner,
    sourcePlanSha256: base.planSha256,
    siteContractFingerprint: runtime.contract.fingerprint,
    ingressContractFingerprint: contract.fingerprint,
    listeners,
    origins,
    sites: bindings.map((binding) => {
      const site = inventory.sites.find((row) => row.siteName === binding.siteName);
      if (!site) throw new Error('Live site identity missing');
      return {
        binding,
        siteUid: site.siteUid,
        routing: routing
          .filter((row) => row.siteName === binding.siteName)
          .map((row) => ({
            kind:
              row.kind === 'bgps'
                ? 'bgp'
                : row.kind === 'bgp_routing_policys'
                  ? 'bgp_routing_policy'
                  : 'external_connector',
            name: row.name,
            uid: row.uid,
          })),
      };
    }),
  };
  const retirement = inventory.sites.map((site) => ({
    ...site,
    tokens: [...tokenRows.values()]
      .filter((row) => row.siteName === site.siteName)
      .map(({ node, name }) => ({ node, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
  const after = await observe();
  const identities = (value) => ({
    sites: [...value.sites].sort((a, b) => a.siteName.localeCompare(b.siteName)),
    resources: [...value.resources].sort((a, b) =>
      `${a.namespace}/${a.kind}/${a.name}`.localeCompare(`${b.namespace}/${b.kind}/${b.name}`),
    ),
  });
  if (
    canonicalSha256(identities(inventory)) !== canonicalSha256(identities(after)) ||
    canonicalSha256(before) !== canonicalSha256(await files())
  )
    throw new Error('Teardown source changed during preparation');
  signal?.throwIfAborted();
  await storage.verify();
  return { drain, retirement };
}
async function retiringPlan(base, runtime, contract, storage, signal) {
  await storage.verify();
  const raw = await optional9(storage, 'aws-terraform-lifecycle-retirement.json');
  if (raw === undefined) return;
  verifyAwsCePlan(base);
  const marker = object11(raw),
    owner = siteBindings(base)[0].binding.owner;
  const prefixes = {
    'aws-ce-terraform-teardown': 'aws-ce-teardown-',
    'aws-ce-terraform-foundation-teardown': 'aws-ce-foundation-teardown-',
    'aws-ce-terraform-pending-teardown': 'aws-ce-pending-teardown-',
  };
  if (
    typeof marker.kind !== 'string' ||
    !Object.hasOwn(prefixes, marker.kind) ||
    typeof marker.teardownPlanSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(marker.teardownPlanSha256) ||
    runtime.engine !== 'terraform' ||
    canonicalSha256(storage.owner) !== canonicalSha256(owner) ||
    canonicalSha256(marker) !==
      canonicalSha256({
        schemaVersion: 1,
        engine: 'terraform',
        status: 'retiring',
        owner,
        sourcePlanSha256: base.planSha256,
        teardownPlanSha256: marker.teardownPlanSha256,
        kind: marker.kind,
      })
  )
    throw new Error('Existing Terraform retirement binding differs');
  const id = prefixes[marker.kind] + marker.teardownPlanSha256.slice(0, 24);
  const stored = object11(await storage.read(`${id}.json`));
  const { planId, planSha256, ...draft } = stored;
  const drain = object11(stored.drain);
  if (
    planId !== id ||
    planSha256 !== marker.teardownPlanSha256 ||
    canonicalSha256(draft) !== planSha256 ||
    stored.schemaVersion !== 1 ||
    stored.engine !== 'terraform' ||
    stored.kind !== marker.kind ||
    stored.sourcePlanSha256 !== base.planSha256 ||
    drain.sourcePlanSha256 !== base.planSha256 ||
    canonicalSha256(drain.owner) !== canonicalSha256(owner) ||
    drain.siteContractFingerprint !== runtime.contract.fingerprint ||
    drain.ingressContractFingerprint !== contract.fingerprint ||
    canonicalSha256(await storage.read('aws-terraform-lifecycle-retirement.json')) !== canonicalSha256(marker)
  )
    throw new Error('Original immutable Terraform retirement plan differs');
  signal?.throwIfAborted();
  return stored;
}
async function prepareAwsTerraformTeardown(input, runtime, contract, storage, signal, initialInstanceReader) {
  if (input.engine !== 'terraform') throw new Error('Terraform teardown preparation requires Terraform ownership');
  const existing = await retiringPlan(input, runtime, contract, storage, signal);
  if (existing) return existing;
  const workflow = await optional9(storage, 'terraform-workflow.json');
  const admission = await optional9(storage, 'terraform-admission.json');
  const f5State = admission === undefined ? await optional9(storage, 'terraform-f5-resources.json') : undefined;
  if (
    workflow !== undefined &&
    admission === undefined &&
    f5State !== undefined &&
    ['network-pending', 'registration-pending'].includes(String(object11(workflow).stage))
  )
    return prepareAwsPendingTeardown(input, runtime, contract, storage, signal, initialInstanceReader);
  if (
    workflow !== undefined &&
    admission === undefined &&
    ['network-pending', 'registration-pending'].includes(String(object11(workflow).stage))
  )
    return prepareAwsFoundationTeardown(input, runtime, contract, storage, signal);
  const registered = async () => {
    const { drain, retirement } = await collectAwsTeardownMaterial(input, runtime, contract, storage, signal);
    const plan = compileAwsTerraformTeardown(input, drain, retirement);
    await storage.write(`${plan.planId}.json`, plan);
    return plan;
  };
  if (
    workflow !== undefined &&
    admission !== undefined &&
    ['network-pending', 'registration-pending'].includes(String(object11(workflow).stage)) &&
    Array.isArray(object11(admission).admittedSites)
  ) {
    if (object11(admission).admittedSites.length === 0)
      return prepareAwsPendingTeardown(input, runtime, contract, storage, signal, initialInstanceReader);
    if (
      initialInstanceReader ||
      !(await readdir8(storage.directory)).some((file) => file.startsWith('terraform-registration-'))
    ) {
      try {
        return await registered();
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'Fresh platform teardown inventory is unavailable')
          throw error;
        return prepareAwsPendingTeardown(input, runtime, contract, storage, signal, initialInstanceReader);
      }
    }
  }
  return registered();
}

// plugins/aws/src/ce/native-teardown.ts
var text2 = (value) => typeof value === 'string' && !!value.trim();
var name3 = (value) => typeof value === 'string' && /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
var intentScope = (plan) => {
  const intent = structuredClone(plan.intent);
  intent.operation = 'teardown';
  delete intent.replacementNode;
  return intent;
};
function validateAwsNativeCloudTeardown(base, cloud) {
  verifyAwsCePlan(base);
  verifyAwsCePlan(cloud);
  const selected = siteBindings(base);
  if (
    base.engine !== 'native' ||
    base.intent.operation === 'teardown' ||
    cloud.engine !== 'native' ||
    cloud.intent.operation !== 'teardown' ||
    canonicalSha256(intentScope(base)) !== canonicalSha256(intentScope(cloud)) ||
    canonicalSha256(siteTopology(base.intent)) !== canonicalSha256(siteTopology(cloud.intent)) ||
    canonicalSha256(base.rollback.resources) !== canonicalSha256(cloud.rollback.resources) ||
    cloud.actions.some(
      (action) =>
        action.phase !== 'teardown' ||
        (action.kind === 'brownfield-restore' &&
          !cloud.rollback.resources.some((resource) => resource.id === action.resourceId)),
    )
  )
    throw new Error('Native teardown source, cloud plan, topology, or restoration support differs');
  const cloudDeletes = cloud.ownershipInventory.filter((row) => row.owned && row.action === 'delete');
  if (
    (!cloudDeletes.length && (cloud.actions.length !== 0 || cloud.ownershipInventory.some((row) => row.owned))) ||
    cloud.actions.filter((action) => action.kind === 'resource-delete').length !== cloudDeletes.length
  )
    throw new Error('Native teardown cloud deletion inventory is incomplete');
  return selected;
}
function compileAwsNativeTeardown(base, cloud, drain, retirement) {
  const selected = validateAwsNativeCloudTeardown(base, cloud);
  if (
    drain.schemaVersion !== 1 ||
    drain.sourcePlanSha256 !== base.planSha256 ||
    canonicalSha256(drain.owner) !== canonicalSha256(selected[0].binding.owner) ||
    drain.sites.length !== selected.length ||
    retirement.length !== selected.length
  )
    throw Error('Native teardown source, cloud plan, topology, or restoration support differs');
  const peers = base.actions.filter((action) => action.kind === 'tgw-connect-peer-create');
  const routingAbsent = drain.sites.every((row) => row.routing.length === 0);
  const exportPolicies = drain.sites.flatMap((row) => row.routing).filter((row) => row.kind === 'bgp_routing_policy');
  if (exportPolicies.length !== 0 && exportPolicies.length !== selected.length)
    throw new Error('Native teardown export-policy inventory is incomplete');
  const seen = new Set();
  const unique = (value) => {
    if (seen.has(value)) throw new Error('Duplicate native teardown identity');
    seen.add(value);
  };
  for (const { site, binding } of selected) {
    const planned = drain.sites.filter((row) => row.binding.siteName === site.name);
    const retired = retirement.filter((row) => row.siteName === site.name);
    if (
      planned.length !== 1 ||
      retired.length !== 1 ||
      canonicalSha256(planned[0].binding) !== canonicalSha256(binding)
    )
      throw new Error('Native teardown site inventory is incomplete');
    if (!text2(planned[0].siteUid) || retired[0].siteUid !== planned[0].siteUid || !text2(retired[0].physicalSiteUid))
      throw new Error('Native teardown site identity differs');
    unique(`site:${retired[0].siteUid}`);
    unique(`physical:${retired[0].physicalSiteUid}`);
    const expected = routingAbsent
      ? []
      : peers
          .filter((action) => site.nodeIndexes.includes(action.node ?? 0))
          .map((action) => ({
            kind: 'external_connector',
            name: `${base.deploymentName.slice(0, 24)}-gre-${peers.indexOf(action) + 1}`,
          }));
    if (expected.length) {
      if (exportPolicies.length)
        expected.push({ kind: 'bgp_routing_policy', name: `${site.name.slice(0, 43)}-tgw-export-policy` });
      expected.push({ kind: 'bgp', name: `${site.name.slice(0, 55)}-tgw-bgp` });
    }
    if (
      planned[0].routing.length !== expected.length ||
      expected.some(
        (resource) =>
          planned[0].routing.filter((row) => row.kind === resource.kind && row.name === resource.name).length !== 1,
      )
    )
      throw new Error('Native teardown routing inventory is incomplete');
    for (const resource of planned[0].routing) {
      if (!text2(resource.uid)) throw new Error('Native teardown routing UID is missing');
      unique(`routing:${resource.uid}`);
    }
    if (
      retired[0].tokens.length > 128 ||
      binding.nodes.some((node) => !retired[0].tokens.some((token) => token.node === node))
    )
      throw new Error('Native teardown bootstrap token inventory is incomplete');
    for (const token of retired[0].tokens) {
      if (!binding.nodes.includes(token.node) || !name3(token.name))
        throw new Error('Native teardown bootstrap token scope differs');
      unique(`token:${token.name}`);
    }
  }
  const draft = {
    schemaVersion: 1,
    kind: 'aws-ce-native-teardown',
    engine: 'native',
    sourcePlanSha256: base.planSha256,
    cloudPlanId: cloud.planId,
    cloudPlanSha256: cloud.planSha256,
    drain: structuredClone(drain),
    retirement: structuredClone(retirement),
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-native-teardown-${planSha256.slice(0, 24)}`, planSha256 };
}
async function prepareAwsNativeTeardown(base, cloud, runtime, contract, storage, signal, readCreation) {
  if (base.engine !== 'native' || cloud.engine !== 'native')
    throw new Error('Native teardown preparation requires native ownership');
  const foundation = await prepareAwsNativeFoundationTeardown(base, cloud, runtime, contract, storage, signal);
  if (foundation) return foundation;
  const reservation = await prepareAwsNativeReservationTeardown(base, cloud, runtime, contract, storage, signal);
  if (reservation) return reservation;
  const pending = await prepareAwsNativePendingTeardown(base, cloud, runtime, contract, storage, signal, readCreation);
  if (pending) return pending;
  const materialName = 'aws-native-teardown-material.json';
  const persisted =
    (await optional10(storage, materialName)) ?? (await optional10(storage, 'aws-native-teardown-source.json'));
  let material;
  if (persisted === undefined) {
    const collected = await collectAwsTeardownMaterial(base, runtime, contract, storage, signal);
    material = { sourcePlanSha256: base.planSha256, ...collected };
    await storage.write(materialName, material);
  } else {
    const candidate = persisted;
    if (candidate.sourcePlanSha256 !== base.planSha256 || !candidate.drain || !Array.isArray(candidate.retirement))
      throw new Error('Persisted native teardown material differs');
    material = {
      sourcePlanSha256: candidate.sourcePlanSha256,
      drain: candidate.drain,
      retirement: candidate.retirement,
    };
    if ((await optional10(storage, materialName)) === undefined) await storage.write(materialName, material);
  }
  const { drain, retirement } = material;
  const plan = compileAwsNativeTeardown(base, cloud, drain, retirement);
  await storage.write(`${plan.planId}.json`, plan);
  return plan;
}
async function optional10(storage, key) {
  try {
    return await storage.read(key);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function coordinateAwsNativeTeardown(base, cloud, input, authorizedPlanSha256, storage, driver, signal) {
  const plan = structuredClone(input);
  const expected = compileAwsNativeTeardown(base, cloud, plan.drain, plan.retirement);
  const validate = async () => {
    signal?.throwIfAborted();
    await storage.verify();
    if (
      canonicalSha256(plan) !== canonicalSha256(expected) ||
      authorizedPlanSha256 !== plan.planSha256 ||
      canonicalSha256(storage.owner) !== canonicalSha256(plan.drain.owner) ||
      driver.engine !== 'native' ||
      driver.siteContractFingerprint !== plan.drain.siteContractFingerprint ||
      driver.ingressContractFingerprint !== plan.drain.ingressContractFingerprint
    )
      throw new Error('Native teardown ownership, authorization, or contract differs');
  };
  await validate();
  return withAwsNativeOperation(storage, { kind: 'retire', cloudPlanSha256: plan.cloudPlanSha256 }, async () => {
    const release = await acquireProcessLock(join9(storage.directory, '.aws-native-teardown-lock'));
    try {
      const retirementName = 'aws-native-lifecycle-retirement.json';
      const retirement = {
        schemaVersion: 1,
        engine: 'native',
        owner: storage.owner,
        sourcePlanSha256: base.planSha256,
        teardownPlanSha256: plan.planSha256,
      };
      const priorRetirement = await optional10(storage, retirementName);
      if (priorRetirement !== undefined && canonicalSha256(priorRetirement) !== canonicalSha256(retirement))
        throw new Error('AWS native retirement belongs to another immutable teardown');
      if (priorRetirement === undefined) await storage.write(retirementName, retirement, signal);
      const sourceName = `${plan.planId}-source.json`;
      const saved = await optional10(storage, sourceName);
      if (saved === undefined) await storage.write(sourceName, plan);
      else if (canonicalSha256(saved) !== canonicalSha256(plan))
        throw new Error('Persisted native teardown source differs');
      const completed = [];
      const checkpoint = () =>
        storage.write(`${plan.planId}-progress.json`, {
          schemaVersion: 1,
          planSha256: plan.planSha256,
          completed: [...completed],
          observedAt: new Date().toISOString(),
        });
      if (cloud.actions.length === 0) {
        const initialCloud = await driver.retireCloud(plan, signal);
        if (
          initialCloud.status !== 'native-cloud-retired' ||
          initialCloud.cloudPlanId !== plan.cloudPlanId ||
          initialCloud.cloudPlanSha256 !== plan.cloudPlanSha256 ||
          initialCloud.absence !== 'absent'
        )
          throw new Error('Initial native owner inventory absence did not converge');
        await validate();
      }
      const drained = await driver.drain(signal);
      if (drained.status !== 'platform-drained') return { status: 'pending-platform-drain', cloudInventory: 'unknown' };
      completed.push('platform-drained');
      await checkpoint();
      await validate();
      const cloudReceipt = await driver.retireCloud(plan, signal);
      if (
        cloudReceipt.status !== 'native-cloud-retired' ||
        cloudReceipt.cloudPlanId !== plan.cloudPlanId ||
        cloudReceipt.cloudPlanSha256 !== plan.cloudPlanSha256 ||
        cloudReceipt.absence !== 'absent'
      )
        throw new Error('Native cloud retirement did not produce exact absence evidence');
      completed.push('native-cloud-retired');
      await checkpoint();
      for (const site of plan.retirement) {
        await validate();
        if (!['pending', 'deleted'].includes((await driver.observeSite(site, signal)).status))
          throw new Error('Native site retirement identity evidence is unknown');
        for (const token of site.tokens) {
          await validate();
          await driver.revokeToken(site, token, signal);
          completed.push(`token:${token.name}`);
          await checkpoint();
        }
        await validate();
        await driver.deleteSite(site, signal);
        if ((await driver.observeSite(site, signal)).status !== 'deleted')
          return {
            status: 'pending-site-retirement',
            siteName: site.siteName,
            cloudInventory: 'absent',
          };
        completed.push(`site:${site.siteName}`);
        await checkpoint();
      }
      await validate();
      const finalCloud = await driver.retireCloud(plan, signal);
      if (
        finalCloud.status !== 'native-cloud-retired' ||
        finalCloud.cloudPlanId !== plan.cloudPlanId ||
        finalCloud.cloudPlanSha256 !== plan.cloudPlanSha256 ||
        finalCloud.absence !== 'absent'
      )
        throw new Error('Final native cloud absence did not converge');
      const credentials = await retireAwsNativeBootstrapCredentials(base, plan, storage, signal);
      const receipt = {
        status: 'ce-retired-supporting-infrastructure-unverified',
        owner: storage.owner,
        planSha256: plan.planSha256,
        sourcePlanSha256: base.planSha256,
        cloudPlanSha256: plan.cloudPlanSha256,
        completed,
        credentialStaging: credentials.status,
        credentialRetirementEvidenceSha256: credentials.evidenceSha256,
        cloudInventory: 'absent',
        observedAt: new Date().toISOString(),
      };
      await storage.write(`${plan.planId}-receipt.json`, receipt);
      await storage.write('aws-native-teardown-receipt.json', receipt);
      return receipt;
    } finally {
      await release();
    }
  });
}
async function runAwsNativeTeardown(
  base,
  cloud,
  plan,
  authorizedPlanSha256,
  runtime,
  contract,
  storage,
  retireCloud,
  signal,
) {
  if (plan.kind === 'aws-ce-native-pending-teardown')
    return runAwsNativePendingTeardown(
      base,
      cloud,
      plan,
      authorizedPlanSha256,
      runtime,
      contract,
      storage,
      retireCloud,
      signal,
    );
  if (plan.kind === 'aws-ce-native-foundation-teardown')
    return runAwsNativeFoundationTeardown(
      base,
      cloud,
      plan,
      authorizedPlanSha256,
      runtime,
      contract,
      storage,
      retireCloud,
      signal,
    );
  if (plan.kind === 'aws-ce-native-reservation-teardown')
    return runAwsNativeReservationTeardown(
      base,
      cloud,
      plan,
      authorizedPlanSha256,
      runtime,
      contract,
      storage,
      retireCloud,
      signal,
    );
  const bindings = siteBindings(base);
  const binding = (site) => {
    const selected = bindings.find((row) => row.site.name === site.siteName);
    if (!selected) throw new Error('Native teardown site is outside deployment');
    return selected.binding;
  };
  if (runtime.engine !== 'native') throw new Error('Native engine required for teardown');
  return coordinateAwsNativeTeardown(
    base,
    cloud,
    plan,
    authorizedPlanSha256,
    storage,
    {
      engine: 'native',
      siteContractFingerprint: runtime.contract.fingerprint,
      ingressContractFingerprint: contract.fingerprint,
      drain: (signal) => runtime.drainPlatform(plan.drain, contract, storage, signal),
      retireCloud,
      observeSite: (site, signal) =>
        runtime.observeSiteDeletion(
          binding(site),
          { siteUid: site.siteUid, physicalSiteUid: site.physicalSiteUid },
          signal,
        ),
      revokeToken: (site, token, signal) => runtime.deleteBootstrapToken(binding(site), token.node, token.name, signal),
      deleteSite: (site, signal) => runtime.deleteSiteExact(binding(site), site.siteUid, signal),
    },
    signal,
  );
}

// plugins/aws/src/ce/terraform-initial-registration-bindings.ts
var object12 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Malformed original instance retirement evidence');
  return value;
};
async function readAwsInitialRegistrationRetirementBindings(plan, session, rawApi, env, signal) {
  verifyAwsCePlan(plan);
  const sites = siteTopology(plan.intent);
  if (
    plan.engine !== 'terraform' ||
    plan.intent.topology.nodeCount !== 1 ||
    sites.length !== 1 ||
    sites[0].nodeIndexes.join(',') !== '1' ||
    plan.intent.operation !== 'deploy'
  )
    throw new Error('Initial registration retirement requires a single owned Terraform node');
  const receipt = await session.planDestroy(env, signal);
  if (
    receipt.schemaVersion !== 1 ||
    receipt.engine !== 'terraform' ||
    receipt.operation !== 'destroy' ||
    receipt.deploymentId !== plan.intent.deploymentName ||
    receipt.backendIdentity !== `local:${plan.intent.deploymentName}` ||
    (receipt.actionInvocations?.length ?? 0) ||
    (receipt.imports?.length ?? 0) ||
    (receipt.relinquishments?.length ?? 0) ||
    [receipt.planSha256, receipt.configurationSha256, receipt.providerLockSha256].some(
      (value) => !/^[a-f0-9]{64}$/.test(value),
    )
  )
    throw new Error('Original saved instance destroy plan identity differs');
  const selected = receipt.changes.filter((row) => row.type === 'aws_instance');
  if (
    selected.length !== 1 ||
    selected[0].address !== 'aws_instance.node_1' ||
    selected[0].actions.join(',') !== 'delete'
  )
    throw new Error('Original saved plan does not contain exactly the selected instance');
  const fields = await session.readPlannedResourceFields(
    receipt,
    { 'aws_instance.node_1': ['id', 'region'] },
    env,
    signal,
  );
  const instance = object12(fields['aws_instance.node_1']);
  if (
    Object.keys(fields).length !== 1 ||
    typeof instance.id !== 'string' ||
    !/^i-[0-9a-f]{8,17}$/.test(instance.id) ||
    instance.region !== plan.intent.region
  )
    throw new Error('Original saved instance ID or region is unavailable');
  const api = scopedAwsApi(rawApi, plan.intent.awsProfile, signal);
  const run = async (service, operation, arguments_ = []) => {
    const result = await api.exec('aws', [
      service,
      operation,
      ...arguments_,
      '--region',
      plan.intent.region,
      '--output',
      'json',
    ]);
    if (result.exitCode !== 0) throw new Error('Original instance cloud ownership read is unavailable');
    let value;
    try {
      value = object12(JSON.parse(result.stdout));
    } catch {
      throw new Error('Original instance cloud read returned malformed JSON');
    }
    if (value.NextToken || value.NextMarker) throw new Error('Original instance cloud inventory is incomplete');
    return value;
  };
  if ((await run('sts', 'get-caller-identity')).Account !== plan.intent.accountId)
    throw new Error('Original instance cloud account differs');
  const result = await run('ec2', 'describe-instances', ['--instance-ids', instance.id]);
  if (!Array.isArray(result.Reservations) || result.Reservations.length !== 1)
    throw new Error('Original instance reservation is ambiguous');
  const reservation = object12(result.Reservations[0]);
  if (
    reservation.OwnerId !== plan.intent.accountId ||
    !Array.isArray(reservation.Instances) ||
    reservation.Instances.length !== 1
  )
    throw new Error('Original instance reservation ownership differs');
  const live = object12(reservation.Instances[0]);
  if (live.InstanceId !== instance.id) throw new Error('Original cloud instance was substituted');
  const tags = awsTerraformMetadataProjection(plan, 'aws_instance.node_1', live.Tags);
  if (tags.find((tag) => tag.Key === 'ves-io-site-name')?.Value !== sites[0].name)
    throw new Error('Original cloud instance site ownership differs');
  return { [`${plan.intent.deploymentName}-1`]: instance.id };
}

// plugins/aws/src/tools/aws-ce-teardown.ts
var defaults = {
  platform: awsPlatformService,
  terraform: awsTerraformService,
  contract: (signal) => VerifiedIngressContract.release(fetch, signal),
  prepare: prepareAwsTerraformTeardown,
  run: runAwsTerraformTeardown,
  prepareNative: prepareAwsNativeTeardown,
  runNative: runAwsNativeTeardown,
  applyNative: executeAwsCeApply,
};
async function optional11(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
function createAwsCeTeardownTool(pi, makeApi = makeExecApi, dependencies = defaults) {
  const { Type } = pi.typebox;
  return {
    name: 'aws_ce_teardown',
    label: 'Teardown AWS Customer Edge',
    description:
      'Prepare or apply an immutable native- or Terraform-owned AWS Customer Edge teardown. Preparation collects authoritative platform and stored identities; apply drains ingress/routing, executes the exact reviewed cloud plan, retires sites, verifies absence, and resumes without manual state edits.',
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
      try {
        const allowed =
          params.operation === 'prepare'
            ? ['basePlanId', 'basePlanSha256', 'cloudPlanId', 'cloudPlanSha256', 'operation']
            : ['basePlanId', 'basePlanSha256', 'operation', 'teardownPlanId', 'teardownPlanSha256'];
        if (Object.keys(params).some((key) => !allowed.includes(key)))
          throw new Error(`AWS CE teardown ${params.operation} parameters differ`);
        const { plan } = await loadAwsPlan(ctx.sessionManager, params.basePlanId, params.basePlanSha256);
        const platform = await dependencies.platform(pi, signal);
        const owner = {
          deploymentId: plan.deploymentName,
          engine: plan.engine,
          provider: 'aws',
          account: plan.accountId,
          region: plan.region,
        };
        const storage = await platform.storage(owner);
        const runtime = await platform.runtime(plan.engine, plan.intent.platformContext);
        const contract = await dependencies.contract(signal);
        if (params.operation === 'prepare') {
          if (plan.engine === 'terraform' && plan.intent.vpc.mode === 'brownfield')
            await prepareAwsTerraformBrownfieldBinding(plan, storage, makeApi(ctx.cwd), signal);
          const cloud =
            plan.engine === 'native'
              ? !params.cloudPlanId || !params.cloudPlanSha256
                ? undefined
                : (await loadAwsPlan(ctx.sessionManager, params.cloudPlanId, params.cloudPlanSha256)).plan
              : undefined;
          if (plan.engine === 'native' && !cloud)
            throw new Error(
              'Native teardown preparation requires the exact reviewed cloud teardown plan ID and SHA-256',
            );
          if (plan.engine === 'terraform' && (params.cloudPlanId || params.cloudPlanSha256))
            throw new Error('Terraform teardown does not accept a separate native cloud plan');
          const teardown =
            plan.engine === 'terraform'
              ? await dependencies.prepare(plan, runtime, contract, storage, signal, async (readSignal) => {
                  const service = await dependencies.terraform(pi, readSignal);
                  const placement =
                    plan.intent.vpc.mode === 'brownfield'
                      ? await loadAwsTerraformBrownfieldBinding(plan, storage, makeApi(ctx.cwd), readSignal)
                      : undefined;
                  const deployment = await awsTerraformFoundationDeployment(plan, {}, placement);
                  const session = await service.open(owner, deployment, 'current');
                  return readAwsInitialRegistrationRetirementBindings(
                    plan,
                    session,
                    makeApi(ctx.cwd),
                    process.env,
                    readSignal,
                  );
                })
              : await dependencies.prepareNative(plan, cloud, runtime, contract, storage, signal, (readSignal) =>
                  readAwsNativeInitialCreation(plan, ctx.sessionManager, makeApi(ctx.cwd), readSignal),
                );
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
              routingCount: teardown.drain.sites.reduce((total, site) => total + site.routing.length, 0),
              tokenLocatorCount: teardown.retirement.reduce((total, site) => total + site.tokens.length, 0),
            }),
            'aws-ce-teardown-plan',
          );
          if (!artifactId) throw new Error('AWS CE teardown plan artifact persistence failed');
          return {
            content: [
              {
                type: 'text',
                text: `Teardown plan ID: ${teardown.planId}
SHA-256: ${teardown.planSha256}
Sites: ${teardown.retirement.length}
Listeners/origins/routing objects: ${teardown.drain.listeners.length}/${teardown.drain.origins.length}/${teardown.drain.sites.reduce((total, site) => total + site.routing.length, 0)}
Artifact: artifact://${artifactId}`,
              },
            ],
            details: {
              tool: 'aws_ce_teardown',
              operation: 'prepare',
              artifactId,
              planId: teardown.planId,
              planSha256: teardown.planSha256,
            },
          };
        }
        if (!params.teardownPlanId || !params.teardownPlanSha256)
          throw new Error('Teardown apply requires the exact teardown plan ID and SHA-256');
        const teardown = await storage.read(`${params.teardownPlanId}.json`);
        if (
          teardown.planId !== params.teardownPlanId ||
          !safeHexEqual(teardown.planSha256, params.teardownPlanSha256) ||
          teardown.sourcePlanSha256 !== plan.planSha256
        )
          throw new Error('Persisted AWS CE teardown plan identity differs');
        const authorizationName = `${teardown.planId}-authorization.json`;
        const authorization = await optional11(storage, authorizationName);
        if (authorization !== undefined) {
          if (
            !authorization ||
            typeof authorization !== 'object' ||
            authorization.schemaVersion !== 1 ||
            authorization.engine !== plan.engine ||
            authorization.sourcePlanSha256 !== plan.planSha256 ||
            authorization.teardownPlanSha256 !== teardown.planSha256 ||
            authorization.mutations !== true
          )
            throw new Error('Persisted AWS CE teardown authorization differs');
        } else {
          if (
            ctx.hasUI &&
            !(await ctx.ui.confirm(
              'Apply immutable AWS CE teardown plan',
              `${teardown.planId}
${teardown.planSha256}
${teardown.retirement.length} site(s)`,
            ))
          )
            throw new Error('AWS CE teardown was not approved');
          await storage.write(authorizationName, {
            schemaVersion: 1,
            engine: plan.engine,
            sourcePlanSha256: plan.planSha256,
            teardownPlanSha256: teardown.planSha256,
            mutations: true,
          });
        }
        const result =
          plan.engine === 'terraform'
            ? await dependencies.run(
                plan,
                teardown,
                params.teardownPlanSha256,
                runtime,
                contract,
                await (await dependencies.terraform(pi, signal)).open(
                  owner,
                  await awsTerraformFoundationDeployment(
                    plan,
                    {},
                    plan.intent.vpc.mode === 'brownfield'
                      ? await loadAwsTerraformBrownfieldBinding(plan, storage, makeApi(ctx.cwd), signal)
                      : undefined,
                  ),
                  'recover-initialization',
                  process.env,
                  signal,
                ),
                storage,
                makeApi(ctx.cwd),
                process.env,
                signal,
                await dependencies.terraform(pi, signal),
              )
            : await dependencies.runNative(
                plan,
                (await loadAwsPlan(ctx.sessionManager, teardown.cloudPlanId, teardown.cloudPlanSha256)).plan,
                teardown,
                params.teardownPlanSha256,
                runtime,
                contract,
                storage,
                async (reference, signal) => {
                  const { plan: cloud, observation } = await loadAwsPlan(
                    ctx.sessionManager,
                    reference.cloudPlanId,
                    reference.cloudPlanSha256,
                  );
                  const existing = await loadAwsCheckpoint(ctx.sessionManager, cloud.planId, cloud.planSha256);
                  if (!existing)
                    await saveAwsCheckpoint(ctx.sessionManager, {
                      schemaVersion: 2,
                      engine: 'native',
                      authorization: { planSha256: cloud.planSha256, mutations: true, destruction: true },
                      planId: cloud.planId,
                      planSha256: cloud.planSha256,
                      completedActionIds: [],
                      resolvedValues: {},
                      state: 'running',
                    });
                  const applied = await dependencies.applyNative(
                    { planId: cloud.planId, planSha256: cloud.planSha256 },
                    ctx,
                    makeApi(ctx.cwd),
                    platform,
                    fetch,
                    signal,
                  );
                  if (applied.checkpoint.state !== 'complete') throw new Error('Native cloud teardown remains partial');
                  const ownerDigests = [
                    ...new Set([
                      plan.planSha256,
                      cloud.planSha256,
                      ...observation.ownershipPlanSha256s,
                      ...observation.resources
                        .map((row) => row.tags['xcsh-plan-sha256'])
                        .filter((value) => /^[a-f0-9]{64}$/.test(value ?? '')),
                    ]),
                  ];
                  const absence = await collectAwsNativeCloudRetirement(
                    scopedAwsApi(makeApi(ctx.cwd), cloud.intent.awsProfile, signal),
                    cloud,
                    ownerDigests,
                  );
                  if (absence.status !== 'absent') throw new Error('Native cloud retirement has not converged');
                  return {
                    status: 'native-cloud-retired',
                    cloudPlanId: cloud.planId,
                    cloudPlanSha256: cloud.planSha256,
                    absence: 'absent',
                  };
                },
                signal,
              );
        const artifactId = await ctx.sessionManager.saveArtifact(JSON.stringify(result), 'aws-ce-teardown-checkpoint');
        if (!artifactId) throw new Error('AWS CE teardown checkpoint artifact persistence failed');
        return {
          content: [
            {
              type: 'text',
              text: `AWS CE teardown ${plan.deploymentName}: ${String(result.status)}; cloud inventory ${String(result.cloudInventory)}. Supporting infrastructure outside the CE plan requires separate ownership and absence evidence.`,
            },
          ],
          details: { tool: 'aws_ce_teardown', operation: 'apply', artifactId, ...result },
        };
      } catch (error) {
        signal?.throwIfAborted();
        return {
          content: [
            {
              type: 'text',
              text: `AWS CE teardown failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'aws_ce_teardown', operation: params.operation },
        };
      }
    },
  };
}

export { createAwsCeTeardownTool };
