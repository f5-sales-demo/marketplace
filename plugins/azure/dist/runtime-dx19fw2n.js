// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun

// plugins/azure/src/ce/apply-request.ts
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { canonicalSha256 } from './runtime-6j4b2rhv.js';
import { detectAzError } from './runtime-2139fbqg.js';
import {
  AZURE_CE_TERRAFORM_VERSION,
  acquireProcessLock,
  assertActionOwnership,
  azureRelayOwnershipTags,
  azureRelayPlanForDeployment,
  azureUpgradeBinding,
  collectAzureNativeVmState,
  collectAzurePlatformHealth,
  listAzureNativeVms,
  renderAzureRelayCloudInit,
  verifyAzureCePlan,
  verifyAzureRelayPlan,
} from './runtime-ragavjaz.js';

function captureAzureCeApplyRequest(request, context) {
  if (
    !request ||
    typeof request !== 'object' ||
    Array.isArray(request) ||
    Object.keys(request).length !== 2 ||
    Object.keys(request).some((key) => !['planId', 'planSha256'].includes(key)) ||
    typeof request.planId !== 'string' ||
    !request.planId ||
    typeof request.planSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(request.planSha256)
  )
    throw Error('Azure CE apply accepts only the exact persisted plan identity');
  const input = structuredClone(request),
    requestSha256 = canonicalSha256(input),
    environment = process.env,
    environmentSha256 = canonicalSha256(environment),
    { cwd, hasUI, ui } = context,
    confirm = ui.confirm,
    session = context.sessionManager,
    callbacks = [session.getSessionId, session.getArtifactsDir, session.getArtifactPath, session.saveArtifact],
    sessionId = session.getSessionId(),
    directory = session.getArtifactsDir();
  let contextSeal = () => {};
  const assertUnchanged = () => {
    contextSeal();
    const currentSessionId = session.getSessionId(),
      currentDirectory = session.getArtifactsDir();
    if (
      canonicalSha256(request) !== requestSha256 ||
      canonicalSha256(input) !== requestSha256 ||
      process.env !== environment ||
      canonicalSha256(environment) !== environmentSha256 ||
      context.cwd !== cwd ||
      context.hasUI !== hasUI ||
      context.ui !== ui ||
      ui.confirm !== confirm ||
      context.sessionManager !== session ||
      callbacks.some(
        (callback, index) =>
          callback !==
          [session.getSessionId, session.getArtifactsDir, session.getArtifactPath, session.saveArtifact][index],
      ) ||
      currentSessionId !== sessionId ||
      currentDirectory !== directory
    )
      throw Error('Azure CE apply request or session changed during execution');
  };
  assertUnchanged();
  const capturedContext = {
    cwd,
    hasUI,
    sessionManager: guardAzureCeApplyObject(session, assertUnchanged),
    ui: {
      confirm: async (title, message) => {
        assertUnchanged();
        const accepted = await confirm.call(ui, title, message);
        assertUnchanged();
        return accepted;
      },
    },
  };
  const bindPlatformContext = (name) => {
    assertUnchanged();
    if (!name) return;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/.test(name)) throw Error('Azure CE apply named context is invalid');
    const path = join(environment.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'xcsh', 'contexts', `${name}.json`);
    const readIdentity = () => {
      const before = lstatSync(path);
      if (
        !before.isFile() ||
        before.isSymbolicLink() ||
        before.size > 1024 * 1024 ||
        realpathSync(path) !== join(realpathSync(dirname(path)), basename(path))
      )
        throw Error('invalid context file');
      const bytes = readFileSync(path, 'utf8'),
        after = lstatSync(path);
      if (
        !after.isFile() ||
        after.isSymbolicLink() ||
        before.dev !== after.dev ||
        before.ino !== after.ino ||
        before.size !== after.size ||
        before.mtimeMs !== after.mtimeMs
      )
        throw Error('context changed while reading');
      return canonicalSha256({
        bytes,
        dev: after.dev,
        ino: after.ino,
        size: after.size,
        mtimeMs: after.mtimeMs,
        path: realpathSync(path),
      });
    };
    let identity;
    try {
      identity = readIdentity();
    } catch {
      throw Error('Azure CE apply named context is unavailable or invalid');
    }
    contextSeal = () => {
      try {
        if (readIdentity() === identity) return;
      } catch {}
      throw Error('Azure CE apply named context changed during execution');
    };
    assertUnchanged();
  };
  return { input, context: capturedContext, assertUnchanged, bindPlatformContext };
}
function captureAzureCeApplyCallbacks(object, names) {
  const value = object,
    callbacks = names.map((name) => value[name]);
  return () => {
    if (names.some((name, index) => value[name] !== callbacks[index]))
      throw Error('Azure CE apply service callback changed during execution');
  };
}
function guardAzureCeApplyObject(object, seal, children = {}, fields = []) {
  const names = new Set();
  for (
    let prototype = object;
    prototype && prototype !== Object.prototype;
    prototype = Object.getPrototypeOf(prototype)
  )
    for (const name of Object.getOwnPropertyNames(prototype))
      if (name !== 'constructor' && typeof Object.getOwnPropertyDescriptor(prototype, name)?.value === 'function')
        names.add(name);
  const value = object,
    callbacks = new Map([...names].map((name) => [name, value[name]])),
    wrappers = new Map(),
    identity = () => canonicalSha256(Object.fromEntries(fields.map((name) => [name, value[name]]))),
    identitySha256 = identity();
  const assertBound = () => {
    seal();
    if ([...callbacks].some(([name, callback]) => value[name] !== callback) || identity() !== identitySha256)
      throw Error('Azure CE apply acquired collaborator changed during execution');
  };
  assertBound();
  return new Proxy(object, {
    get(target, property) {
      assertBound();
      if (typeof property !== 'string' || !callbacks.has(property)) return Reflect.get(target, property, target);
      let wrapper = wrappers.get(property);
      if (!wrapper) {
        const callback = callbacks.get(property);
        wrapper = (...args) => {
          assertBound();
          const finish = (result) => {
            assertBound();
            if (!children[property]) return result;
            if (!result || typeof result !== 'object')
              throw Error('Azure CE apply acquired service result is malformed');
            return children[property](result);
          };
          try {
            const result = callback.apply(object, args);
            if (result && typeof result.then === 'function')
              return Promise.resolve(result).then(finish, (error) => {
                assertBound();
                throw error;
              });
            return finish(result);
          } catch (error) {
            assertBound();
            throw error;
          }
        };
        wrappers.set(property, wrapper);
      }
      return wrapper;
    },
  });
}
function guardAzureCeApplyServices(seal, api, platform, terraform) {
  return {
    api: guardAzureCeApplyObject(api, seal),
    platform: guardAzureCeApplyObject(platform, seal, {
      storage: (store) => guardAzureCeApplyObject(store, seal, {}, ['owner', 'directory']),
      runtime: (runtime) => guardAzureCeApplyObject(runtime, seal),
    }),
    terraform:
      terraform &&
      guardAzureCeApplyObject(terraform, seal, {
        open: (session) => guardAzureCeApplyObject(session, seal),
      }),
  };
}

// plugins/azure/src/ce/traffic-source.ts
import { isIP } from 'node:net';

var UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
function object(value, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value;
}
async function read(api, args, signal) {
  signal?.throwIfAborted();
  const result = await api.exec('az', [...args, '--output', 'json'], signal ? { signal } : undefined);
  signal?.throwIfAborted();
  if (result.exitCode !== 0) throw detectAzError(result.stderr, result.exitCode);
  try {
    return object(JSON.parse(result.stdout), 'Malformed Azure traffic source observation');
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Malformed Azure traffic source observation');
    throw error;
  }
}
function fields(value, required, optional = []) {
  if (
    required.some((key) => !(key in value)) ||
    Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key))
  )
    throw new Error('Azure traffic source identity fields differ');
}
function validateAccount(plan, account) {
  if (
    typeof account.id !== 'string' ||
    account.id.toLowerCase() !== plan.subscription.id.toLowerCase() ||
    typeof account.tenantId !== 'string' ||
    account.tenantId.toLowerCase() !== plan.subscription.tenantId.toLowerCase() ||
    account.environmentName !== plan.subscription.cloud ||
    account.state !== 'Enabled'
  )
    throw new Error('Azure traffic source account differs from the reviewed deployment');
}
function validateVm(plan, vm) {
  if (plan.intent.ingress?.mode !== 'platform-http')
    throw new Error('Azure traffic source requires explicit platform HTTP ingress');
  const resourceId = plan.intent.ingress.probe.sourceVmResourceId;
  const profile = object(vm.networkProfile, 'Azure traffic source VM network profile is unavailable');
  const attachments = Array.isArray(profile.networkInterfaces)
    ? profile.networkInterfaces.map((value) => object(value, 'Malformed Azure traffic source VM attachment'))
    : [];
  const primaryAttachments = attachments.filter((attachment) => attachment.primary === true);
  const attachment =
    primaryAttachments.length === 1
      ? primaryAttachments[0]
      : primaryAttachments.length === 0 && attachments.length === 1
        ? attachments[0]
        : undefined;
  const nicResourceId = attachment?.id;
  const powerState = typeof vm.powerState === 'string' ? vm.powerState.toLowerCase().replace(/^vm\s+/, '') : '';
  if (
    typeof vm.id !== 'string' ||
    vm.id.toLowerCase() !== resourceId.toLowerCase() ||
    typeof vm.vmId !== 'string' ||
    !UUID.test(vm.vmId) ||
    typeof vm.location !== 'string' ||
    vm.location.toLowerCase() !== plan.region.toLowerCase() ||
    vm.provisioningState !== 'Succeeded' ||
    powerState !== 'running' ||
    typeof nicResourceId !== 'string' ||
    !nicResourceId.toLowerCase().startsWith(`/subscriptions/${plan.subscription.id}/`.toLowerCase()) ||
    !/^\/subscriptions\/[^/]+\/resourcegroups\/[^/]+\/providers\/microsoft.network\/networkinterfaces\/[^/]+$/i.test(
      nicResourceId,
    )
  )
    throw new Error('Azure traffic source VM identity or readiness differs');
  return nicResourceId;
}
function validateAzureTrafficSourceIdentity(plan, identity) {
  const snapshot = object(identity, 'Malformed Azure traffic source identity');
  fields(snapshot, ['account', 'vm', 'nic']);
  const account = object(snapshot.account, 'Malformed Azure traffic source account');
  const vm = object(snapshot.vm, 'Malformed Azure traffic source VM');
  const nic = object(snapshot.nic, 'Malformed Azure traffic source NIC');
  fields(account, ['id', 'tenantId', 'environmentName', 'state']);
  fields(vm, ['id', 'vmId', 'location', 'provisioningState', 'powerState', 'networkProfile']);
  fields(nic, ['id', 'provisioningState', 'virtualMachine', 'ipConfigurations']);
  const network = object(vm.networkProfile, 'Malformed Azure traffic source network profile');
  fields(network, ['networkInterfaces']);
  if (!Array.isArray(network.networkInterfaces)) throw new Error('Malformed Azure traffic source attachments');
  const attachedIds = new Set();
  for (const raw of network.networkInterfaces) {
    const row = object(raw, 'Malformed Azure traffic source attachment');
    fields(row, ['id'], ['primary']);
    if (
      typeof row.id !== 'string' ||
      attachedIds.has(row.id.toLowerCase()) ||
      (row.primary !== undefined && typeof row.primary !== 'boolean')
    )
      throw new Error('Azure traffic source duplicate or malformed attachment');
    attachedIds.add(row.id.toLowerCase());
  }
  fields(object(nic.virtualMachine, 'Malformed Azure traffic source back reference'), ['id']);
  if (!Array.isArray(nic.ipConfigurations)) throw new Error('Malformed Azure traffic source IP configurations');
  const addresses = new Set();
  for (const raw of nic.ipConfigurations) {
    const row = object(raw, 'Malformed Azure traffic source IP configuration');
    fields(row, ['privateIPAddressVersion', 'privateIPAddress'], ['primary']);
    if (
      typeof row.privateIPAddress !== 'string' ||
      addresses.has(row.privateIPAddress) ||
      (row.primary !== undefined && typeof row.primary !== 'boolean')
    )
      throw new Error('Azure traffic source duplicate or malformed IP configuration');
    addresses.add(row.privateIPAddress);
  }
  if (plan.intent.ingress?.mode !== 'platform-http')
    throw new Error('Azure traffic source requires explicit platform HTTP ingress');
  const resourceId = plan.intent.ingress.probe.sourceVmResourceId;
  if (
    !plan.intent.brownfield.resourceIds.some((id) => id.toLowerCase() === resourceId.toLowerCase()) ||
    !plan.ownershipInventory.some(
      (row) =>
        row.resourceId.toLowerCase() === resourceId.toLowerCase() && !row.owned && row.action === 'modify-approved',
    )
  )
    throw new Error('Azure traffic source is outside the reviewed inventory');
  validateAccount(plan, account);
  const nicResourceId = validateVm(plan, vm);
  const ipConfigurations = Array.isArray(nic.ipConfigurations)
    ? nic.ipConfigurations.map((value) => object(value, 'Malformed Azure traffic source IP configuration'))
    : [];
  const primaryConfigurations = ipConfigurations.filter((configuration) => configuration.primary === true);
  const configuration =
    primaryConfigurations.length === 1
      ? primaryConfigurations[0]
      : primaryConfigurations.length === 0 && ipConfigurations.length === 1
        ? ipConfigurations[0]
        : undefined;
  const privateAddress = configuration?.privateIPAddress;
  const attachedVm = object(nic.virtualMachine, 'Azure traffic source NIC attachment is unavailable').id;
  if (
    typeof nic.id !== 'string' ||
    nic.id.toLowerCase() !== nicResourceId.toLowerCase() ||
    nic.provisioningState !== 'Succeeded' ||
    typeof attachedVm !== 'string' ||
    attachedVm.toLowerCase() !== resourceId.toLowerCase() ||
    configuration?.privateIPAddressVersion !== 'IPv4' ||
    typeof privateAddress !== 'string' ||
    isIP(privateAddress) !== 4
  )
    throw new Error('Azure traffic source NIC identity or private address differs');
  return {
    subscriptionId: plan.subscription.id,
    tenantId: plan.subscription.tenantId,
    cloud: plan.subscription.cloud,
    resourceId,
    vmId: vm.vmId,
    nicResourceId,
    privateAddress,
  };
}
function project(value, names) {
  return Object.fromEntries(names.filter((name) => value[name] !== undefined).map((name) => [name, value[name]]));
}
async function observeAzureTrafficSource(plan, api, signal) {
  if (plan.intent.ingress?.mode !== 'platform-http')
    throw new Error('Azure traffic source requires explicit platform HTTP ingress');
  const resourceId = plan.intent.ingress.probe.sourceVmResourceId;
  if (
    !plan.intent.brownfield.resourceIds.some((id) => id.toLowerCase() === resourceId.toLowerCase()) ||
    !plan.ownershipInventory.some(
      (row) =>
        row.resourceId.toLowerCase() === resourceId.toLowerCase() && !row.owned && row.action === 'modify-approved',
    )
  )
    throw new Error('Azure traffic source is outside the reviewed inventory');
  const account = await read(api, ['account', 'show', '--subscription', plan.subscription.id], signal);
  validateAccount(plan, account);
  const vm = await read(
    api,
    ['vm', 'show', '--ids', resourceId, '--show-details', '--subscription', plan.subscription.id],
    signal,
  );
  const nicId = validateVm(plan, vm);
  const profile = object(vm.networkProfile, 'Azure traffic source VM network profile is unavailable');
  const attachments = profile.networkInterfaces.map((row) =>
    object(row, 'Malformed Azure traffic source VM attachment'),
  );
  const nic = await read(
    api,
    ['network', 'nic', 'show', '--ids', nicId, '--subscription', plan.subscription.id],
    signal,
  );
  const identity = {
    account: project(account, ['id', 'tenantId', 'environmentName', 'state']),
    vm: {
      ...project(vm, ['id', 'vmId', 'location', 'provisioningState', 'powerState']),
      networkProfile: { networkInterfaces: attachments.map((row) => project(row, ['id', 'primary'])) },
    },
    nic: {
      ...project(nic, ['id', 'provisioningState']),
      virtualMachine: project(object(nic.virtualMachine, 'Azure traffic source NIC attachment is unavailable'), ['id']),
      ipConfigurations: Array.isArray(nic.ipConfigurations)
        ? nic.ipConfigurations.map((row) =>
            project(object(row, 'Malformed Azure traffic source IP configuration'), [
              'primary',
              'privateIPAddressVersion',
              'privateIPAddress',
            ]),
          )
        : [],
    },
  };
  const source = validateAzureTrafficSourceIdentity(plan, identity);
  return { ...source, identity, source: 'azure-cli-live', observedAt: new Date().toISOString() };
}

// plugins/azure/src/ce/relay-native.ts
function publicKey(value) {
  if (typeof value !== 'string' || value.length > 8192 || /[\r\n]/.test(value))
    throw Error('Azure relay native: one SSH public key required');
  const match = /^(ssh-ed25519|ssh-rsa) ([A-Za-z0-9+/]+={0,2})(?: [^\r\n]+)?$/.exec(value);
  if (!match) throw Error('Azure relay native: unsupported or malformed SSH public key');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.toString('base64').replace(/=+$/, '') !== match[2].replace(/=+$/, ''))
    throw Error('Azure relay native: malformed SSH key encoding');
  let offset = 0;
  const field = () => {
    if (offset + 4 > bytes.length) throw Error('Azure relay native: truncated SSH key');
    const size = bytes.readUInt32BE(offset);
    offset += 4;
    if (size > bytes.length - offset) throw Error('Azure relay native: truncated SSH key');
    const result = bytes.subarray(offset, offset + size);
    offset += size;
    return result;
  };
  if (field().toString() !== match[1]) throw Error('Azure relay native: SSH key type differs');
  if (match[1] === 'ssh-ed25519') {
    if (field().length !== 32) throw Error('Azure relay native: invalid Ed25519 key length');
  } else {
    const exponent = field();
    const modulus = field();
    if (exponent.length < 1 || exponent.length > 8 || modulus.length < 256 || modulus.length > 1025)
      throw Error('Azure relay native: invalid RSA key size');
  }
  if (offset !== bytes.length) throw Error('Azure relay native: trailing SSH key data');
  return `${match[1]} ${match[2]}`;
}
function compileAzureRelayNativeRequests(source, plan, sshPublicKey) {
  verifyAzureRelayPlan(source, plan);
  if (plan.engine !== 'native' || source.subscription.cloud !== 'AzureCloud')
    throw Error('Azure relay native: native AzureCloud owner required');
  const key = publicKey(sshPublicKey);
  const tags = azureRelayOwnershipTags(source, plan);
  const actions = [];
  const add = (kind, resourceId, apiVersion, body, dependsOn) => {
    actions.push({
      kind,
      resourceId,
      apiVersion,
      body,
      dependsOn,
      args: [
        'rest',
        '--method',
        'put',
        '--url',
        `https://management.azure.com${resourceId}?api-version=${apiVersion}`,
        '--subscription',
        plan.subscriptionId,
        '--body',
        JSON.stringify(body),
        '--output',
        'json',
      ],
    });
  };
  for (const relay of plan.relays) {
    if (relay.publicIpId)
      add(
        'relay-public-ip-create',
        relay.publicIpId,
        '2024-05-01',
        {
          location: plan.region,
          tags,
          sku: { name: 'Standard' },
          properties: { publicIPAllocationMethod: 'Static', publicIPAddressVersion: 'IPv4' },
        },
        [],
      );
    add(
      'relay-nic-create',
      relay.nicId,
      '2024-05-01',
      {
        location: plan.region,
        tags,
        properties: {
          enableIPForwarding: true,
          enableAcceleratedNetworking: false,
          ipConfigurations: [
            {
              name: 'ipconfig1',
              properties: {
                primary: true,
                privateIPAddressVersion: 'IPv4',
                privateIPAllocationMethod: 'Static',
                privateIPAddress: relay.privateAddress,
                subnet: { id: relay.subnetId },
                ...(relay.publicIpId ? { publicIPAddress: { id: relay.publicIpId } } : {}),
              },
            },
          ],
        },
      },
      [relay.subnetId, ...(relay.publicIpId ? [relay.publicIpId] : [])],
    );
    const customData = renderAzureRelayCloudInit(source, plan, relay.name);
    if (Buffer.byteLength(customData) > 65535)
      throw Error('Azure relay native: cloud-init exceeds ARM customData limit');
    add(
      'relay-vm-create',
      relay.vmId,
      '2024-07-01',
      {
        location: plan.region,
        tags,
        properties: {
          hardwareProfile: { vmSize: plan.vmSize },
          storageProfile: {
            imageReference: {
              publisher: plan.hostImage.publisher,
              offer: plan.hostImage.offer,
              sku: plan.hostImage.sku,
              version: plan.hostImage.version,
            },
            osDisk: {
              name: relay.osDiskName,
              createOption: 'FromImage',
              caching: 'ReadWrite',
              managedDisk: { storageAccountType: 'StandardSSD_LRS' },
              deleteOption: 'Delete',
            },
          },
          osProfile: {
            computerName: relay.name,
            adminUsername: 'xcsh',
            customData: Buffer.from(customData).toString('base64'),
            linuxConfiguration: {
              disablePasswordAuthentication: true,
              provisionVMAgent: true,
              ssh: { publicKeys: [{ path: '/home/xcsh/.ssh/authorized_keys', keyData: key }] },
            },
          },
          networkProfile: {
            networkInterfaces: [{ id: relay.nicId, properties: { primary: true, deleteOption: 'Detach' } }],
          },
        },
      },
      [relay.nicId],
    );
    add(
      'relay-peer-create',
      `${plan.routeServerId}/bgpConnections/${relay.name}`,
      '2024-05-01',
      { properties: { peerAsn: relay.asn, peerIp: relay.privateAddress } },
      [plan.routeServerId, relay.nicId, relay.vmId],
    );
  }
  return actions;
}

// plugins/azure/src/ce/relay-ssh-key.ts
import { createPrivateKey, createPublicKey } from 'node:crypto';
// plugins/azure/src/ce/relay-retirement.ts
import { join as join2 } from 'node:path';

var require2 = (condition, message) => {
  if (!condition) throw Error(`Azure relay SSH identity: ${message}`);
};
function azureRelaySshPublicKey(privateKey) {
  const key = createPublicKey(createPrivateKey(privateKey));
  require2(key.asymmetricKeyType === 'ed25519', 'SSH key type differs');
  const jwk = key.export({ format: 'jwk' });
  const field = (bytes) => {
    const prefix = Buffer.alloc(4);
    prefix.writeUInt32BE(bytes.length);
    return Buffer.concat([prefix, bytes]);
  };
  require2(typeof jwk.x === 'string', 'SSH key unavailable');
  return `ssh-ed25519 ${Buffer.concat([field(Buffer.from('ssh-ed25519')), field(Buffer.from(jwk.x, 'base64url'))]).toString('base64')}`;
}

// plugins/azure/src/ce/relay-retirement.ts
var markerName = 'azure-native-relay-key-retirement.json';
var journalName = 'relay-native-execution.json';
var object2 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Malformed Azure relay retirement evidence');
  return value;
};
var optional = async (store, name) => {
  try {
    return await store.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
};
async function assertAzureNativeActive(store) {
  await store.verify();
  if (
    (await optional(store, markerName)) !== undefined ||
    (await optional(store, 'azure-native-lifecycle-retirement.json')) !== undefined ||
    (await optional(store, 'azure-native-bootstrap-retirement.json')) !== undefined
  )
    throw Error(
      'Azure native deployment is retiring or retired; execution cannot recreate enrollment, keys or resources',
    );
}
var assertAzureNativeRelayActive = assertAzureNativeActive;
async function observeAzureRelayRetirementAbsence(source, api, signal) {
  const relay = azureRelayPlanForDeployment(source);
  return { ...(await observeAzureCeRetirementAbsence(source, api, signal)), relayPlanSha256: relay.planSha256 };
}
async function observeAzureCeRetirementAbsence(source, api, signal) {
  verifyAzureCePlan(source);
  const deadline = AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]);
  const reads = [];
  const read = async (args) => {
    deadline.throwIfAborted();
    const selected = [...args, '--subscription', source.subscription.id, '--output', 'json'];
    const aborted = Promise.withResolvers();
    const abort = () => aborted.reject(deadline.reason);
    deadline.addEventListener('abort', abort, { once: true });
    try {
      const result = await Promise.race([api.exec('az', selected, { signal: deadline }), aborted.promise]);
      deadline.throwIfAborted();
      if (result.exitCode !== 0) throw Error('Azure CE retirement cloud evidence is unavailable');
      let value;
      try {
        value = JSON.parse(result.stdout);
      } catch {
        throw Error('Malformed Azure CE retirement cloud evidence');
      }
      reads.push({ args: selected, responseSha256: canonicalSha256(value) });
      return value;
    } finally {
      deadline.removeEventListener('abort', abort);
    }
  };
  const account = object2(await read(['account', 'show']));
  if (
    String(account.id).toLowerCase() !== source.subscription.id.toLowerCase() ||
    String(account.tenantId).toLowerCase() !== source.subscription.tenantId.toLowerCase() ||
    account.environmentName !== source.subscription.cloud ||
    account.state !== 'Enabled'
  )
    throw Error('Azure CE retirement account identity differs');
  if ((await read(['group', 'exists', '--name', source.intent.resourceGroup])) !== false)
    throw Error('Azure CE retirement resource group absence is unverified');
  const inventory = await read(['resource', 'list']);
  if (!Array.isArray(inventory)) throw Error('Complete unfiltered Azure CE retirement inventory is unavailable');
  const ids = new Set();
  const planned = new Set(
    source.ownershipInventory.filter((row) => row.action === 'create').map((row) => row.resourceId.toLowerCase()),
  );
  for (const row of inventory) {
    const resource = object2(row);
    const id = typeof resource.id === 'string' ? resource.id.toLowerCase() : '';
    if (
      !id.startsWith(`/subscriptions/${source.subscription.id.toLowerCase()}/`) ||
      ids.has(id) ||
      ['error', 'errors', 'nextLink', 'nextPageToken'].some((key) => resource[key])
    )
      throw Error('Malformed, foreign or duplicate Azure CE retirement inventory');
    ids.add(id);
    const tags = resource.tags === undefined || resource.tags === null ? {} : object2(resource.tags);
    if (Object.values(tags).some((value) => typeof value !== 'string'))
      throw Error('Malformed Azure CE retirement ownership tags');
    if (
      planned.has(id) ||
      id.startsWith(
        `/subscriptions/${source.subscription.id}/resourceGroups/${source.intent.resourceGroup}/`.toLowerCase(),
      ) ||
      tags['xcsh-deployment-id'] === source.deploymentName
    )
      throw Error('Azure CE retirement inventory retains exact resources or deployment ownership');
  }
  deadline.throwIfAborted();
  return {
    status: 'absent',
    engine: source.engine,
    sourcePlanSha256: source.planSha256,
    resourceIds: [...planned].sort(),
    inventoryCount: inventory.length,
    reads,
    observedAt: new Date().toISOString(),
  };
}
async function runAzureNativeRelayKeyRetirement(source, teardown, runtime, contract, store, api, signal) {
  signal = AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]);
  signal.throwIfAborted();
  const relay = azureRelayPlanForDeployment(source);
  const binding = azureUpgradeBinding(source);
  await store.verify();
  if (
    source.engine !== 'native' ||
    runtime.engine !== 'native' ||
    teardown.sourcePlanSha256 !== source.planSha256 ||
    canonicalSha256(store.owner) !== canonicalSha256(binding.owner) ||
    teardown.drain.siteContractFingerprint !== runtime.contract.fingerprint ||
    teardown.drain.ingressContractFingerprint !== contract.fingerprint ||
    canonicalSha256(await store.read(`${teardown.planId}.json`)) !== canonicalSha256(teardown)
  )
    throw Error('Azure native relay key retirement owner, teardown or contract differs');
  const { planId, planSha256, ...teardownDraft } = teardown;
  if (canonicalSha256(teardownDraft) !== planSha256 || planId !== `azure-ce-teardown-${planSha256.slice(0, 24)}`)
    throw Error('Azure native relay teardown integrity differs');
  const receipt = object2(await store.read('azure-native-teardown-receipt.json'));
  if (
    receipt.status !== 'retired' ||
    receipt.sourcePlanSha256 !== source.planSha256 ||
    receipt.teardownPlanSha256 !== teardown.planSha256 ||
    receipt.cloudPlanSha256 !== teardown.cloudPlanSha256 ||
    receipt.cloud !== 'absent' ||
    receipt.sites !== 'deleted'
  )
    throw Error('Azure native relay key retirement lacks the exact completed teardown receipt');
  const fresh = () => observeAzureNativeRelayRetirementAbsence(source, teardown, runtime, contract, api, signal);
  const absenceSha256 = await fresh();
  let marker = await optional(store, markerName);
  const journal = await optional(store, journalName);
  if (journal !== undefined) {
    const value = object2(journal);
    if (
      Object.keys(value).sort().join(',') !==
        [
          'schemaVersion',
          'engine',
          'sourcePlanSha256',
          'relayPlanSha256',
          'privateKey',
          'publicKey',
          'requestsSha256',
          'completed',
          ...(value.pending !== undefined ? ['pending'] : []),
        ]
          .sort()
          .join(',') ||
      value.schemaVersion !== 1 ||
      value.engine !== 'native' ||
      value.sourcePlanSha256 !== source.planSha256 ||
      value.relayPlanSha256 !== relay.planSha256 ||
      typeof value.privateKey !== 'string' ||
      typeof value.publicKey !== 'string' ||
      !/^[a-f0-9]{64}$/.test(String(value.requestsSha256))
    )
      throw Error('Azure relay key journal belongs to a different source or owner');
    if (azureRelaySshPublicKey(String(value.privateKey)) !== value.publicKey)
      throw Error('Azure relay key journal private/public identity differs');
    const requests = compileAzureRelayNativeRequests(source, relay, String(value.publicKey));
    if (
      canonicalSha256(requests) !== value.requestsSha256 ||
      !Array.isArray(value.completed) ||
      value.completed.length > requests.length ||
      value.completed.some((id, index) => id !== requests[index].resourceId)
    )
      throw Error('Azure relay key journal request binding differs');
    if (value.pending !== undefined) {
      const pending = object2(value.pending);
      const next = requests[value.completed.length];
      if (
        !next ||
        Object.keys(pending).sort().join(',') !== 'requestSha256,resourceId,submitted' ||
        pending.submitted !== true ||
        pending.resourceId !== next.resourceId ||
        pending.requestSha256 !== canonicalSha256(next)
      )
        throw Error('Azure relay key journal submitted request differs');
    }
  }
  if (marker === undefined) {
    const draft = {
      schemaVersion: 1,
      engine: 'native',
      owner: binding.owner,
      sourcePlanSha256: source.planSha256,
      relayPlanSha256: relay.planSha256,
      teardownPlanSha256: teardown.planSha256,
      journalSha256: journal === undefined ? null : canonicalSha256(journal),
      absenceSha256,
    };
    marker = { ...draft, checkpointSha256: canonicalSha256(draft), phase: 'retiring' };
    signal.throwIfAborted();
    await store.write(markerName, marker);
  }
  const value = object2(marker);
  const { phase, checkpointSha256, ...draft } = value;
  if (
    Object.keys(value).sort().join(',') !==
      'absenceSha256,checkpointSha256,engine,journalSha256,owner,phase,relayPlanSha256,schemaVersion,sourcePlanSha256,teardownPlanSha256' ||
    value.schemaVersion !== 1 ||
    value.engine !== 'native' ||
    value.sourcePlanSha256 !== source.planSha256 ||
    value.relayPlanSha256 !== relay.planSha256 ||
    value.teardownPlanSha256 !== teardown.planSha256 ||
    canonicalSha256(value.owner) !== canonicalSha256(binding.owner) ||
    checkpointSha256 !== canonicalSha256(draft) ||
    !['retiring', 'retired'].includes(String(phase)) ||
    !/^[a-f0-9]{64}$/.test(String(value.absenceSha256)) ||
    (value.journalSha256 !== null && !/^[a-f0-9]{64}$/.test(String(value.journalSha256))) ||
    (journal !== undefined && canonicalSha256(journal) !== value.journalSha256) ||
    (phase === 'retired' && journal !== undefined)
  )
    throw Error('Azure native relay key retirement marker or journal changed');
  if (phase === 'retiring') {
    await fresh();
    signal.throwIfAborted();
    if (journal !== undefined) await store.remove(journalName);
    if ((await optional(store, journalName)) !== undefined)
      throw Error('Azure native relay key retirement is incomplete');
    signal.throwIfAborted();
    await store.write(markerName, { ...value, phase: 'retired' });
  }
  await fresh();
  return {
    status: 'relay-key-retired',
    sourcePlanSha256: source.planSha256,
    relayPlanSha256: relay.planSha256,
    teardownPlanSha256: teardown.planSha256,
    checkpointSha256,
    completeCleanup: false,
  };
}
async function retireAzureNativeRelayKey(source, teardown, runtime, contract, store, api, signal) {
  signal?.throwIfAborted();
  await store.verify();
  const release = await acquireProcessLock(join2(store.directory, '.azure-relay-native-mutation-lock'));
  try {
    return await runAzureNativeRelayKeyRetirement(source, teardown, runtime, contract, store, api, signal);
  } finally {
    await release();
  }
}
async function observeAzureNativeRelayRetirementAbsence(source, teardown, runtime, contract, api, signal) {
  azureRelayPlanForDeployment(source);
  return observeAzureNativeRetirementAbsence(source, teardown, runtime, contract, api, signal);
}
async function observeAzureNativeRetirementAbsence(source, teardown, runtime, contract, api, signal) {
  const binding = azureUpgradeBinding(source);
  if (
    source.engine !== 'native' ||
    runtime.engine !== 'native' ||
    teardown.sourcePlanSha256 !== source.planSha256 ||
    teardown.drain.siteContractFingerprint !== runtime.contract.fingerprint ||
    teardown.drain.ingressContractFingerprint !== contract.fingerprint
  )
    throw Error('Azure native absence context differs');
  const namespaces = [
    ...new Set([
      'default',
      ...teardown.drain.listeners.map((row) => row.namespace),
      ...teardown.drain.origins.map((row) => row.origin.namespace),
    ]),
  ].sort();
  if (namespaces.some((namespace) => !/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(namespace)))
    throw Error('Azure native relay retirement namespace differs');
  const collect = async () => {
    signal?.throwIfAborted();
    const started = Date.now();
    const aborted = Promise.withResolvers();
    const abort = () => aborted.reject(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true });
    let platform;
    try {
      signal?.throwIfAborted();
      platform = await Promise.race([
        runtime.unregisteredAbsence([binding], namespaces, contract, signal),
        aborted.promise,
      ]);
      signal?.throwIfAborted();
    } finally {
      signal?.removeEventListener('abort', abort);
    }
    const at = Date.parse(platform.observedAt),
      began = Date.parse(platform.startedAt);
    if (
      platform.status !== 'absent' ||
      canonicalSha256(platform.owner) !== canonicalSha256(binding.owner) ||
      platform.siteContractFingerprint !== runtime.contract.fingerprint ||
      platform.ingressContractFingerprint !== contract.fingerprint ||
      !Number.isFinite(at) ||
      !Number.isFinite(began) ||
      began < started ||
      at < began ||
      at > Date.now() ||
      Date.now() - at > 60000 ||
      !Array.isArray(platform.sources) ||
      !platform.sources.length
    )
      throw Error('Fresh complete Azure native platform absence is unavailable');
    const cloud = source.relayProfile
      ? await observeAzureRelayRetirementAbsence(source, api, signal)
      : await observeAzureCeRetirementAbsence(source, api, signal);
    return canonicalSha256({ platform, cloud });
  };
  return collect();
}

// plugins/azure/src/ce/terraform-lifecycle.ts
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// plugins/terraform/src/configuration-json.ts
function renderTerraformConfigurationJson(configuration) {
  const result = { ...configuration };
  const resources = result.resource;
  if (resources && typeof resources === 'object' && !Array.isArray(resources) && Object.keys(resources).length === 0)
    delete result.resource;
  return JSON.stringify(result);
}

// plugins/azure/src/ce/terraform-lifecycle.ts
var AZURE_CE_AZAPI_PROVIDER_VERSION = '2.12.0';
var AZURE_COMPUTE_API_VERSION = '2024-07-01';
var digest = (value) => createHash('sha256').update(value).digest('hex');
var interruptedApplyMessage = 'Reconcile interrupted Terraform apply before revising configuration';
function lifecycleOperation(plan) {
  if (plan.intent.operation === 'reconcile' || plan.intent.operation === 'repair') return 'start';
  if (!['start', 'stop', 'resize'].includes(plan.intent.operation))
    throw new Error('Azure Terraform lifecycle supports start, stop, resize, reconcile, or repair plans');
  return plan.intent.operation;
}
function mutationFor(plan, node) {
  const operation = lifecycleOperation(plan);
  const action = plan.actions.find(
    (candidate) =>
      candidate.node === node &&
      candidate.kind === (operation === 'start' ? 'vm-start' : operation === 'stop' ? 'vm-stop' : 'vm-resize'),
  );
  const gate = plan.actions.find((candidate) => candidate.node === node && candidate.kind === 'vm-state-gate');
  if (!action?.resourceId || !gate?.expectedOwnerPlanSha256 || !gate.expectedPowerState)
    throw new Error('Azure Terraform lifecycle node identity is incomplete');
  return { action, gate };
}
function configuration(plan, node, includeMutation) {
  const { action } = mutationFor(plan, node);
  const operation = lifecycleOperation(plan);
  const type = operation === 'resize' ? 'azapi_update_resource' : 'azapi_resource_action';
  const value =
    operation === 'resize'
      ? {
          type: `Microsoft.Compute/virtualMachines@${AZURE_COMPUTE_API_VERSION}`,
          resource_id: action.resourceId,
          body: { properties: { hardwareProfile: { vmSize: plan.vm.size } } },
          locks: [action.resourceId],
        }
      : {
          type: `Microsoft.Compute/virtualMachines@${AZURE_COMPUTE_API_VERSION}`,
          resource_id: action.resourceId,
          action: operation === 'stop' ? 'deallocate' : 'start',
          method: 'POST',
          when: 'apply',
          locks: [action.resourceId],
        };
  return renderTerraformConfigurationJson({
    terraform: {
      required_version: `= ${AZURE_CE_TERRAFORM_VERSION}`,
      required_providers: {
        azapi: { source: 'Azure/azapi', version: `= ${AZURE_CE_AZAPI_PROVIDER_VERSION}` },
      },
    },
    provider: { azapi: { subscription_id: plan.subscription.id, tenant_id: plan.subscription.tenantId } },
    resource: includeMutation ? { [type]: { ce: value } } : {},
  });
}
async function azureTerraformLifecycleDeployment(plan, node, includeMutation = true) {
  verifyAzureCePlan(plan);
  if (plan.engine !== 'terraform') throw new Error('Azure Terraform lifecycle requires Terraform ownership');
  mutationFor(plan, node);
  const stage = `lifecycle-${plan.planSha256.slice(0, 16)}-node-${node}`;
  return {
    schemaVersion: 1,
    deploymentId: plan.deploymentName,
    stage,
    engine: 'terraform',
    scope: { cloud: 'azure', account: plan.subscription.id, region: plan.region },
    terraformVersion: AZURE_CE_TERRAFORM_VERSION,
    configuration: configuration(plan, node, includeMutation),
    providerLock: await readFile(
      new URL('./assets/plugins/azure/terraform/azapi-provider-lock.hcl', import.meta.url),
      'utf8',
    ),
    backendIdentity: `local:${plan.deploymentName}:stage:${stage}`,
  };
}
function validateReceipt(deployment, receipt, phase, operation) {
  const type = operation === 'resize' ? 'azapi_update_resource' : 'azapi_resource_action';
  const address = `${type}.ce`;
  const allowed = phase === 'mutation' ? ['create', 'update', 'no-op'] : phase === 'release' ? ['delete', 'no-op'] : [];
  if (
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== deployment.deploymentId ||
    receipt.backendIdentity !== deployment.backendIdentity ||
    receipt.configurationSha256 !== digest(deployment.configuration) ||
    receipt.providerLockSha256 !== digest(deployment.providerLock) ||
    receipt.operation !== undefined ||
    receipt.actionInvocations?.length ||
    (phase === 'final'
      ? !receipt.noChanges || receipt.changes.length !== 0
      : phase === 'release' && receipt.noChanges && receipt.changes.length === 0
        ? false
        : receipt.changes.length !== 1 ||
          receipt.changes[0].address !== address ||
          receipt.changes[0].type !== type ||
          receipt.changes[0].actions.length !== 1 ||
          !allowed.includes(receipt.changes[0].actions[0]))
  )
    throw new Error(`Azure Terraform lifecycle ${phase} plan differs from the exact isolated action`);
}
async function openStage(terraform, plan, node, env, signal) {
  const deployment = await azureTerraformLifecycleDeployment(plan, node);
  const owner = azureUpgradeBinding(plan).owner;
  try {
    return { session: await terraform.open(owner, deployment, false, env, signal), deployment };
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    return { session: await terraform.open(owner, deployment, 'current', env, signal), deployment };
  }
}
async function pollVm(plan, gate, api, storage, signal, polling) {
  for (let attempt = 0; attempt < polling.attempts; attempt++) {
    signal?.throwIfAborted();
    const evidence = await collectAzureNativeVmState(plan, gate, api, signal);
    await storage.write(`${plan.planId}-node-${gate.node}-vm-state.json`, evidence);
    if (evidence.status === 'healthy') return evidence;
    if (attempt + 1 < polling.attempts) await polling.wait(polling.intervalMs);
  }
  throw new Error('Observed Azure VM lifecycle state has not converged');
}
async function reconcileInterruptedApply(session, receipt, evidence) {
  if (typeof session.reconcileApplyFromEvidence !== 'function')
    throw new Error('Terraform interrupted apply reconciliation is unavailable');
  await session.reconcileApplyFromEvidence(receipt, canonicalSha256(evidence));
}
async function runAzureTerraformLifecycle(
  plan,
  terraform,
  runtime,
  storage,
  api,
  env,
  signal,
  polling = {
    attempts: 90,
    intervalMs: 1e4,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  },
) {
  verifyAzureCePlan(plan);
  const operation = lifecycleOperation(plan);
  if (plan.engine !== 'terraform' || runtime.engine !== 'terraform' || storage.owner.engine !== 'terraform')
    throw new Error('Only the owning Terraform engine may run Azure lifecycle operations');
  if (!Number.isInteger(polling.attempts) || polling.attempts < 1 || polling.intervalMs < 0)
    throw new Error('Azure Terraform lifecycle convergence bounds are invalid');
  const expectedOwner = azureUpgradeBinding(plan).owner;
  if (canonicalSha256(storage.owner) !== canonicalSha256(expectedOwner))
    throw new Error('Azure Terraform lifecycle storage ownership differs');
  const releaseLock = await acquireProcessLock(`${storage.directory}/.terraform-lifecycle-lock`);
  try {
    await storage.verify();
    const checkpointName = `${plan.planId}-terraform-lifecycle.json`;
    let checkpoint;
    try {
      checkpoint = await storage.read(checkpointName);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      checkpoint = {
        schemaVersion: 1,
        engine: 'terraform',
        planSha256: plan.planSha256,
        completedNodes: [],
        state: 'running',
      };
      await storage.write(checkpointName, checkpoint);
    }
    if (
      checkpoint.schemaVersion !== 1 ||
      checkpoint.engine !== 'terraform' ||
      checkpoint.planSha256 !== plan.planSha256 ||
      !Array.isArray(checkpoint.completedNodes) ||
      checkpoint.completedNodes.some((node, index) => node !== index + 1 || node > plan.topology.nodeCount) ||
      !['running', 'complete'].includes(checkpoint.state)
    )
      throw new Error('Azure Terraform lifecycle checkpoint differs');
    for (let node = 1; node <= plan.topology.nodeCount; node++) {
      const { action, gate } = mutationFor(plan, node);
      await assertActionOwnership(plan, action, api);
      let observed = await collectAzureNativeVmState(plan, gate, api, signal);
      const opened = await openStage(terraform, plan, node, env, signal);
      const empty = await azureTerraformLifecycleDeployment(plan, node, false);
      let currentSha256 = await opened.session.readConfigurationSha256?.();
      if (!currentSha256) throw new Error('Terraform lifecycle configuration identity is unavailable');
      if (observed.status !== 'healthy') {
        let resumeReceipt;
        if (currentSha256 === digest(empty.configuration)) {
          await opened.session.reviseConfiguration(currentSha256, opened.deployment.configuration);
          currentSha256 = digest(opened.deployment.configuration);
        } else if (currentSha256 !== digest(opened.deployment.configuration)) {
          throw new Error('Terraform lifecycle configuration differs from the isolated action');
        } else {
          try {
            resumeReceipt = await storage.read(`${plan.planId}-node-${node}-mutation-plan.json`);
            validateReceipt(opened.deployment, resumeReceipt, 'mutation', operation);
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
          }
        }
        const receipt = resumeReceipt ?? (await opened.session.plan(env, signal));
        validateReceipt(opened.deployment, receipt, 'mutation', operation);
        if (!resumeReceipt) await storage.write(`${plan.planId}-node-${node}-mutation-plan.json`, receipt);
        if (!receipt.noChanges)
          try {
            await opened.session.apply(receipt, env, signal);
          } catch (error) {
            try {
              observed = await pollVm(plan, gate, api, storage, signal, polling);
            } catch {
              throw error;
            }
            await reconcileInterruptedApply(opened.session, receipt, observed);
          }
        if (observed.status !== 'healthy') observed = await pollVm(plan, gate, api, storage, signal, polling);
      }
      currentSha256 = await opened.session.readConfigurationSha256?.();
      if (!currentSha256) throw new Error('Terraform lifecycle configuration identity is unavailable');
      if (currentSha256 === digest(opened.deployment.configuration)) {
        try {
          await opened.session.reviseConfiguration(currentSha256, empty.configuration);
        } catch (error) {
          if (!(error instanceof Error) || error.message !== interruptedApplyMessage) throw error;
          const receipt = await storage.read(`${plan.planId}-node-${node}-mutation-plan.json`);
          validateReceipt(opened.deployment, receipt, 'mutation', operation);
          await storage.write(`${plan.planId}-node-${node}-vm-state.json`, observed);
          await reconcileInterruptedApply(opened.session, receipt, observed);
          await opened.session.reviseConfiguration(currentSha256, empty.configuration);
        }
        const release = await opened.session.plan(env, signal);
        validateReceipt(empty, release, 'release', operation);
        await storage.write(`${plan.planId}-node-${node}-release-plan.json`, release);
        if (!release.noChanges) await opened.session.apply(release, env, signal);
      } else if (currentSha256 !== digest(empty.configuration)) {
        throw new Error('Terraform lifecycle release configuration differs');
      }
      const final = await opened.session.plan(env, signal);
      validateReceipt(empty, final, 'final', operation);
      await storage.write(`${plan.planId}-node-${node}-final-plan.json`, final);
      if (operation !== 'stop') {
        const vms = await listAzureNativeVms(plan, api);
        const health = await collectAzurePlatformHealth(plan, vms, runtime, signal, node);
        await storage.write(`${plan.planId}-node-${node}-platform-health.json`, health);
        if (health.status !== 'healthy') throw new Error('Observed Azure platform health has not converged');
      }
      if (!checkpoint.completedNodes.includes(node)) {
        checkpoint.completedNodes.push(node);
        await storage.write(checkpointName, checkpoint);
      }
    }
    checkpoint.state = 'complete';
    await storage.write(checkpointName, checkpoint);
    return {
      planId: plan.planId,
      planSha256: plan.planSha256,
      engine: 'terraform',
      status: 'complete',
    };
  } finally {
    await releaseLock();
  }
}

// plugins/azure/src/ce/traffic-probe.ts
import { randomUUID } from 'node:crypto';

// plugins/azure/src/ce/traffic-artifact-provenance.ts
function require3(condition) {
  if (!condition) throw new Error('Persisted Azure traffic evidence checkpoint differs from the owning plan');
}
function object3(value) {
  require3(value && typeof value === 'object' && !Array.isArray(value));
  return value;
}
function keys(value, required, optional = []) {
  require3(
    required.every((key) => key in value) &&
      Object.keys(value).every((key) => required.includes(key) || optional.includes(key)),
  );
}
function time(value) {
  require3(typeof value === 'string' && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now());
  return Date.parse(String(value));
}
var digest2 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
var status = (value) => Number.isInteger(value) && Number(value) >= 100 && Number(value) <= 599;
function validateAzureTrafficCheckpoint(plan, input) {
  verifyAzureCePlan(plan);
  require3(plan.intent.ingress?.mode === 'platform-http');
  const probe = plan.intent.ingress?.mode === 'platform-http' ? plan.intent.ingress.probe : undefined;
  const state = object3(input);
  keys(
    state,
    [
      'schemaVersion',
      'engine',
      'planSha256',
      'sourceVmResourceId',
      'sourceVmId',
      'sourceNicResourceId',
      'sourcePrivateAddress',
      'sourceIdentity',
      'sourceObservedAt',
      'phase',
    ],
    ['attempts', 'evidence'],
  );
  require3(
    state.schemaVersion === 2 &&
      state.engine === plan.engine &&
      state.planSha256 === plan.planSha256 &&
      ['ready', 'complete'].includes(String(state.phase)),
  );
  const source = validateAzureTrafficSourceIdentity(plan, state.sourceIdentity);
  require3(
    state.sourceVmResourceId === source.resourceId &&
      state.sourceVmId === source.vmId &&
      state.sourceNicResourceId === source.nicResourceId &&
      state.sourcePrivateAddress === source.privateAddress,
  );
  let previous = time(state.sourceObservedAt);
  if (state.attempts !== undefined) {
    require3(Array.isArray(state.attempts) && state.attempts.length > 0 && state.attempts.length <= 40);
    for (const raw of state.attempts) {
      const attempt = object3(raw);
      keys(attempt, ['stderrPresent', 'observedAt'], ['httpStatus', 'bodySha256']);
      require3(
        typeof attempt.stderrPresent === 'boolean' &&
          ((attempt.httpStatus === undefined && attempt.bodySha256 === undefined) ||
            ((attempt.httpStatus === 0 || status(attempt.httpStatus)) && digest2(attempt.bodySha256))),
      );
      require3(
        attempt.stderrPresent ||
          attempt.httpStatus !== probe?.expectedStatus ||
          attempt.bodySha256 !== probe?.expectedBodySha256,
      );
      const collected = time(attempt.observedAt);
      require3(collected >= previous);
      previous = collected;
    }
  }
  if (state.phase === 'ready') {
    require3(state.evidence === undefined);
    return;
  }
  const evidence = object3(state.evidence);
  keys(evidence, [
    'status',
    'source',
    'sourceVmResourceId',
    'sourceVmId',
    'sourcePrivateAddress',
    'httpStatus',
    'bodySha256',
    'expectedStatus',
    'expectedBodySha256',
    'observedAt',
  ]);
  require3(
    probe &&
      evidence.status === 'healthy' &&
      evidence.source === 'azure:vm-run-command' &&
      evidence.sourceVmResourceId === source.resourceId &&
      evidence.sourceVmId === source.vmId &&
      evidence.sourcePrivateAddress === source.privateAddress &&
      evidence.httpStatus === probe.expectedStatus &&
      evidence.bodySha256 === probe.expectedBodySha256 &&
      evidence.expectedStatus === probe.expectedStatus &&
      evidence.expectedBodySha256 === probe.expectedBodySha256 &&
      time(evidence.observedAt) >= previous,
  );
  return evidence;
}
var currentName =
  /^traffic-([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})(-current-sample)?\.json$/;
function azureCurrentTrafficArtifactIdentity(name) {
  const match = currentName.exec(name);
  return match ? { sampleId: match[1], checkpointKey: `traffic-${match[1]}`, receipt: !!match[2] } : undefined;
}
function validateAzureCurrentTrafficHistory(plan, checkpointKey, checkpoint, input) {
  const name = azureCurrentTrafficArtifactIdentity(`${checkpointKey}-current-sample.json`);
  require3(name?.receipt);
  const evidence = validateAzureTrafficCheckpoint(plan, checkpoint),
    state = object3(checkpoint),
    receipt = object3(input);
  keys(receipt, [
    'schemaVersion',
    'status',
    'scope',
    'sampleId',
    'planSha256',
    'owner',
    'checkpointKey',
    'checkpointSha256',
    'sourceIdentitySha256',
    'startedAt',
    'completedAt',
    'evidence',
  ]);
  require3(
    evidence &&
      receipt.schemaVersion === 1 &&
      receipt.status === 'healthy' &&
      receipt.scope === 'reviewed-vm-http-content-probe' &&
      receipt.sampleId === name?.sampleId &&
      receipt.checkpointKey === checkpointKey &&
      receipt.planSha256 === plan.planSha256 &&
      canonicalSha256(receipt.owner) ===
        canonicalSha256({
          deploymentId: plan.deploymentName,
          engine: plan.engine,
          provider: 'azure',
          account: plan.subscription.id,
          region: plan.region,
        }) &&
      receipt.checkpointSha256 === canonicalSha256(checkpoint) &&
      receipt.sourceIdentitySha256 === canonicalSha256(state.sourceIdentity) &&
      canonicalSha256(receipt.evidence) === canonicalSha256(evidence),
  );
  const started = time(receipt.startedAt),
    completed = time(receipt.completedAt),
    source = time(state.sourceObservedAt),
    observed = time(evidence?.observedAt);
  require3(
    new Date(started).toISOString() === receipt.startedAt &&
      new Date(completed).toISOString() === receipt.completedAt &&
      completed >= started &&
      completed - started <= 180000 &&
      source >= started &&
      source <= observed &&
      observed <= completed,
  );
  return receipt;
}

// plugins/azure/src/ce/traffic-probe.ts
function object4(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed Azure traffic evidence');
  return value;
}
async function optional2(storage, name) {
  try {
    return object4(await storage.read(name));
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
}
async function collectAzureTrafficProbe(plan, storage, api, signal, checkpointKey = 'azure-traffic-probe') {
  verifyAzureCePlan(plan);
  if (plan.intent.ingress?.mode !== 'platform-http')
    throw new Error('Azure traffic probe requires explicit platform HTTP ingress');
  await storage.verify();
  const source = await observeAzureTrafficSource(plan, api, signal);
  const probe = plan.intent.ingress.probe;
  const listener = plan.intent.ingress.listener;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(checkpointKey))
    throw new Error('Invalid Azure traffic probe checkpoint identity');
  const file = `${checkpointKey}.json`;
  let state = await optional2(storage, file);
  if (state) {
    const evidence = validateAzureTrafficCheckpoint(plan, state);
    if (canonicalSha256(state.sourceIdentity) !== canonicalSha256(source.identity))
      throw new Error('Azure traffic probe checkpoint source attachment differs from current identity');
    if (evidence) return evidence;
  } else {
    state = {
      schemaVersion: 2,
      engine: plan.engine,
      planSha256: plan.planSha256,
      sourceVmResourceId: source.resourceId,
      sourceVmId: source.vmId,
      sourceNicResourceId: source.nicResourceId,
      sourcePrivateAddress: source.privateAddress,
      sourceIdentity: source.identity,
      sourceObservedAt: source.observedAt,
      phase: 'ready',
    };
    await storage.write(file, state);
  }
  const expectedDigest = probe.expectedBodySha256;
  const command =
    `body=$(mktemp); trap 'rm -f "$body"' EXIT; ` +
    `code=$(curl --silent --show-error --max-time 15 --output "$body" --write-out '%{http_code}' ` +
    `--header 'Host: ${listener.domain}' ` +
    `'http://${listener.privateAddress}:${plan.intent.ingress.port}${probe.path}'); ` +
    `digest=$(sha256sum "$body" | awk '{print $1}'); printf '%s %s
' "$code" "$digest"; ` +
    `[ "$code" = "${probe.expectedStatus}" ] && [ "$digest" = "${expectedDigest}" ]`;
  const result = await api.exec(
    'az',
    [
      'vm',
      'run-command',
      'invoke',
      '--ids',
      source.resourceId,
      '--command-id',
      'RunShellScript',
      '--scripts',
      command,
      '--subscription',
      plan.subscription.id,
      '--output',
      'json',
    ],
    signal ? { signal } : undefined,
  );
  signal?.throwIfAborted();
  if (result.exitCode !== 0) throw detectAzError(result.stderr, result.exitCode);
  let response;
  try {
    response = object4(JSON.parse(result.stdout));
  } catch {
    throw new Error('Malformed Azure traffic probe response');
  }
  const rows = Array.isArray(response.value)
    ? response.value.map((value) => object4(value))
    : (() => {
        throw new Error('Malformed Azure traffic probe response');
      })();
  const stdoutRows = rows.filter((row) => row.code === 'ComponentStatus/StdOut/succeeded');
  const stderrRows = rows.filter((row) => row.code === 'ComponentStatus/StdErr/succeeded');
  if (
    stdoutRows.length !== 1 ||
    stderrRows.length !== 1 ||
    typeof stdoutRows[0].message !== 'string' ||
    typeof stderrRows[0].message !== 'string'
  )
    throw new Error('Malformed Azure traffic probe response');
  const match = /^(\d{3}) ([a-f0-9]{64})\n?$/.exec(stdoutRows[0].message);
  const evidence = {
    status: stderrRows[0].message === '' && match ? 'healthy' : 'degraded',
    source: 'azure:vm-run-command',
    sourceVmResourceId: source.resourceId,
    sourceVmId: source.vmId,
    sourcePrivateAddress: source.privateAddress,
    httpStatus: match ? Number(match[1]) : undefined,
    bodySha256: match?.[2],
    expectedStatus: probe.expectedStatus,
    expectedBodySha256: probe.expectedBodySha256,
    observedAt: new Date().toISOString(),
  };
  if (
    evidence.status !== 'healthy' ||
    evidence.httpStatus !== probe.expectedStatus ||
    evidence.bodySha256 !== probe.expectedBodySha256
  ) {
    const attempts = Array.isArray(state.attempts) ? state.attempts.map(object4) : [];
    attempts.push({
      httpStatus: evidence.httpStatus,
      bodySha256: evidence.bodySha256,
      stderrPresent: stderrRows[0].message.length > 0,
      observedAt: evidence.observedAt,
    });
    const pending = { ...state, phase: 'ready', attempts: attempts.slice(-40) };
    validateAzureTrafficCheckpoint(plan, pending);
    await storage.write(file, pending);
    throw new Error('Azure traffic probe has not converged; retry the saved checkpoint');
  }
  const complete = { ...state, phase: 'complete', evidence };
  validateAzureTrafficCheckpoint(plan, complete);
  await storage.write(file, complete);
  return evidence;
}
async function collectAzureCurrentTrafficProbe(request, storage, transport, signal) {
  verifyAzureCePlan(request);
  const plan = structuredClone(request),
    requestSha256 = canonicalSha256(request),
    ownerSha256 = canonicalSha256(storage.owner),
    environmentSha256 = canonicalSha256(process.env),
    directory = storage.directory,
    deadline = signal ? AbortSignal.any([signal, AbortSignal.timeout(180000)]) : AbortSignal.timeout(180000),
    startedAt = new Date().toISOString(),
    sampleId = randomUUID(),
    marker = `xcsh-current-traffic:${sampleId}`,
    key = `traffic-${sampleId}`;
  const seal = () => {
    deadline.throwIfAborted();
    if (
      canonicalSha256(request) !== requestSha256 ||
      canonicalSha256(plan) !== requestSha256 ||
      canonicalSha256(storage.owner) !== ownerSha256 ||
      storage.directory !== directory ||
      canonicalSha256(process.env) !== environmentSha256
    )
      throw Error('Azure current traffic request or owner changed during collection');
  };
  if (
    ownerSha256 !==
    canonicalSha256({
      deploymentId: plan.deploymentName,
      engine: plan.engine,
      provider: 'azure',
      account: plan.subscription.id,
      region: plan.region,
    })
  )
    throw Error('Azure current traffic requires the exact deployment owner');
  const store = guardAzureCeApplyObject(storage, seal, {}, ['owner', 'directory']),
    api = guardAzureCeApplyObject(transport, seal);
  const bounded = async (task) => {
    seal();
    const aborted = Promise.withResolvers(),
      onAbort = () => aborted.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([task(), aborted.promise]);
      seal();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const boundedApi = { exec: (command, args, options) => bounded(() => api.exec(command, args, options)) };
  let invocations = 0;
  const challengedApi = {
    exec: async (command, args, options) => {
      seal();
      if (command !== 'az' || args[0] !== 'vm' || args[1] !== 'run-command')
        return boundedApi.exec(command, args, options);
      if (++invocations !== 1) throw Error('Azure current traffic sample must execute exactly one reviewed probe');
      const index = args.indexOf('--scripts') + 1;
      if (index === 0 || typeof args[index] !== 'string') throw Error('Azure current traffic probe command is missing');
      const challenged = [...args];
      challenged[index] += `; probe_status=$?; printf '
%s
' '${marker}'; exit "$probe_status"`;
      const raw = await boundedApi.exec(command, challenged, options);
      seal();
      if (raw.exitCode !== 0) return raw;
      let response;
      try {
        response = object4(JSON.parse(raw.stdout));
      } catch {
        throw Error('Malformed Azure current traffic response');
      }
      if (!Array.isArray(response.value)) throw Error('Malformed Azure current traffic response');
      const rows = response.value.map(object4),
        stdout = rows.filter((row) => row.code === 'ComponentStatus/StdOut/succeeded');
      const match =
        stdout.length === 1 && typeof stdout[0].message === 'string'
          ? new RegExp(`^(\\d{3}) ([a-f0-9]{64})\\n?\\n${marker}\\n?$`).exec(stdout[0].message)
          : null;
      if (!match) throw Error('Azure current traffic response does not match this guest challenge');
      stdout[0].message = `${match[1]} ${match[2]}
`;
      return { ...raw, stdout: JSON.stringify(response) };
    },
  };
  const evidence = await collectAzureTrafficProbe(plan, store, challengedApi, deadline, key);
  seal();
  if (invocations !== 1) throw Error('Azure current traffic cannot use a completed historical checkpoint');
  const checkpoint = object4(await store.read(`${key}.json`));
  if (canonicalSha256(validateAzureTrafficCheckpoint(plan, checkpoint)) !== canonicalSha256(evidence))
    throw Error('Azure current traffic checkpoint differs from collected evidence');
  const currentSource = await observeAzureTrafficSource(plan, boundedApi, deadline);
  if (canonicalSha256(checkpoint.sourceIdentity) !== canonicalSha256(currentSource.identity))
    throw Error('Azure current traffic source changed during collection');
  seal();
  const completedAt = new Date().toISOString();
  if (
    !Number.isFinite(Date.parse(startedAt)) ||
    !Number.isFinite(Date.parse(completedAt)) ||
    Date.parse(completedAt) < Date.parse(startedAt) ||
    Date.parse(completedAt) - Date.parse(startedAt) > 180000
  )
    throw Error('Azure current traffic collection interval is invalid');
  const receipt = {
    schemaVersion: 1,
    status: 'healthy',
    scope: 'reviewed-vm-http-content-probe',
    sampleId,
    planSha256: plan.planSha256,
    owner: structuredClone(store.owner),
    checkpointKey: key,
    checkpointSha256: canonicalSha256(checkpoint),
    sourceIdentitySha256: canonicalSha256(currentSource.identity),
    startedAt,
    completedAt,
    evidence,
  };
  const name = `${key}-current-sample.json`;
  await store.write(name, receipt);
  seal();
  if (
    canonicalSha256(await store.read(name)) !== canonicalSha256(receipt) ||
    canonicalSha256(await store.read(`${key}.json`)) !== receipt.checkpointSha256
  )
    throw Error('Azure current traffic sample changed during publication');
  seal();
  return receipt;
}

export {
  AZURE_CE_AZAPI_PROVIDER_VERSION,
  assertAzureNativeActive,
  assertAzureNativeRelayActive,
  azureCurrentTrafficArtifactIdentity,
  azureRelaySshPublicKey,
  azureTerraformLifecycleDeployment,
  captureAzureCeApplyCallbacks,
  captureAzureCeApplyRequest,
  collectAzureCurrentTrafficProbe,
  collectAzureTrafficProbe,
  compileAzureRelayNativeRequests,
  guardAzureCeApplyObject,
  guardAzureCeApplyServices,
  observeAzureCeRetirementAbsence,
  observeAzureNativeRetirementAbsence,
  observeAzureRelayRetirementAbsence,
  observeAzureTrafficSource,
  renderTerraformConfigurationJson,
  retireAzureNativeRelayKey,
  runAzureTerraformLifecycle,
  validateAzureCurrentTrafficHistory,
  validateAzureTrafficCheckpoint,
  validateAzureTrafficSourceIdentity,
};
