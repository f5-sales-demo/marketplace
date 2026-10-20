// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun
// plugins/platform/src/ce/process-lock.ts
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

var tokenPattern = /^[a-f0-9-]{36}$/;
var bootPattern = /^[a-f0-9-]{36}$/;
async function bootId() {
  const value = (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim();
  if (!bootPattern.test(value)) throw new Error('Process boot identity is unavailable');
  return value;
}
async function processStartTicks(pid) {
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

// plugins/platform/src/ce/site-labels.ts
var discoveryLabels = new Set(['domain', 'host-os-version', 'hw-model', 'hw-serial-number', 'hw-vendor', 'hw-version']);
function writableSiteLabels(labels) {
  return Object.fromEntries(
    Object.entries(labels).filter(
      ([key]) => !key.startsWith('ves.io/') && !key.startsWith('internal.ves.io/') && !discoveryLabels.has(key),
    ),
  );
}

// plugins/platform/src/ce/runtime.ts
var CE_API_ERROR_BRAND = Symbol.for('xcsh.ce.api-error.v1');

// plugins/platform/src/ce/verified-api-release.ts
var repository = 'f5-sales-demo/api-specs-enriched';
var tag = 'v12.0.9';
var commit = 'e04c5d45f7a4e103e2dc84bf52b767182b4de3bc';
var digest = 'sha256:8a3ea9bce1bab8aa228c10e0d646e693bcfb9c36562ad4efefef3c5b74062753';
var assetUrl = `https://github.com/${repository}/releases/download/${tag}/openapi.json`;
var CE_API_RELEASE = Object.freeze({ tag, commit, fingerprint: digest });
var verifiedSchemas = new WeakMap();

// plugins/platform/src/ce/release-contract.ts
var RELEASE_TAG = CE_API_RELEASE.tag;
var RELEASE_COMMIT = CE_API_RELEASE.commit;
var OPENAPI_SHA256 = CE_API_RELEASE.fingerprint;
var RELEASE_URL = `https://api.github.com/repos/f5-sales-demo/api-specs-enriched/releases/tags/${RELEASE_TAG}`;
var TAG_URL = `https://api.github.com/repos/f5-sales-demo/api-specs-enriched/commits/${RELEASE_TAG}`;
var REQUIRED_ASSETS = new Set([
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

// plugins/platform/src/ce/wire-schema.ts
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

// plugins/platform/src/ce/verified-contract.ts
var publishedAssets = Object.freeze({
  'smsv2-contract.json': 'sha256:2dd4d33693c9e228bfb304d7558a2f50ca9cc0146407f8fb9b5f0ca7d7c56f3c',
  'smsv2-contract-manifest.json': 'sha256:3adcfb6462a887a0f65198ed392c742fbc2ab9ba9df1cac33f36e5fe54fd6662',
  'smsv2-evidence-receipt.json': 'sha256:e9bd60f46acd2a003010cbf20d0581af364cce0486f8a7eefc9eb85562ab0bff',
});

// plugins/platform/src/ce/service.ts
var CE_TERRAFORM_RESOURCE_CHANNEL = 'xcsh:ce-terraform:v1:resource-mutation';

// plugins/terraform/extensions/integration.ts
function terraformInstallArgv(platform = process.platform) {
  if (platform === 'darwin') return ['brew', 'install', 'terraform'];
  if (platform === 'win32') return ['winget', 'install', '--exact', '--id', 'Hashicorp.Terraform'];
  return ['sudo', 'apt-get', 'install', '--yes', 'terraform'];
}
function terraformIntegration(pi) {
  pi.integrations.register({
    id: 'terraform',
    name: 'Terraform',
    plugin: 'terraform',
    kind: 'local',
    setup: {
      pluginDependencies: [],
      requiredEnvironment: [],
      profileFields: [],
      steps: [
        {
          kind: 'install',
          argv: terraformInstallArgv(),
          timeoutMs: 300000,
        },
      ],
      verification: [{ argv: ['terraform', 'version'], timeoutMs: 30000 }],
    },
    async probe() {
      return Bun.spawnSync(['terraform', 'version']).exitCode === 0
        ? { state: 'ready' }
        : { state: 'setup_required', reason: 'cli_missing' };
    },
  });
}

// plugins/terraform/src/f5-resources.ts
// plugins/terraform/src/provider-lock.ts
import { createHash, createHash as createHash2 } from 'node:crypto';
import { readFile as readFile2 } from 'node:fs/promises';
import { join as join2 } from 'node:path';

var XCSH_PROVIDER_VERSION = '15.12.1';
var XCSH_PROVIDER_LOCK_SHA256 = '6d9fd709ee430d66bfa6de99dbbbafca2801eb8471201e6c282102fb3bd1a782';
async function loadXcshProviderLock() {
  const value = await readFile2(new URL('./assets/plugins/terraform/locks/xcsh-provider.hcl', import.meta.url), 'utf8');
  if (createHash('sha256').update(value).digest('hex') !== XCSH_PROVIDER_LOCK_SHA256)
    throw new Error('Published XC provider lock changed');
  return value;
}

// plugins/terraform/src/literal.ts
var terraformLiteral = (value) => value.replaceAll('${', () => '$${').replaceAll('%{', () => '%%{');

// plugins/terraform/src/resource-renderer.ts
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Provider resource schema is malformed');
  return value;
}
function literal(value) {
  if (typeof value === 'string') return terraformLiteral(value);
  if (Array.isArray(value)) return value.map(literal);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, literal(item)]));
  return value;
}
function renderProviderResource(request, resourceSchema, resourceType) {
  const metadata = object(request.metadata),
    spec = object(request.spec);
  const convert = (values, schema) => {
    const attributes = schema.attributes === undefined ? {} : object(schema.attributes);
    const blocks = schema.block_types === undefined ? {} : object(schema.block_types);
    const result = {};
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) throw new Error(`Unresolved provider input: ${key}`);
      if (value === null) {
        if (!attributes[key] || object(attributes[key]).required === true)
          throw new Error(`Required provider input is null: ${key}`);
        result[key] = null;
        continue;
      }
      if (attributes[key]) {
        const attribute = object(attributes[key]);
        if (attribute.computed === true && attribute.optional !== true && attribute.required !== true)
          throw new Error(`Read-only provider input: ${key}`);
        const nested = attribute.nested_type === undefined ? undefined : object(attribute.nested_type);
        if (!nested) result[key] = literal(value);
        else if (nested.nesting_mode === 'single') result[key] = convert(object(value), nested);
        else if (nested.nesting_mode === 'list' || nested.nesting_mode === 'set') {
          if (!Array.isArray(value)) throw new Error(`Provider input must be a collection: ${key}`);
          result[key] = value.map((row) => convert(object(row), nested));
        } else if (nested.nesting_mode === 'map')
          result[key] = Object.fromEntries(
            Object.entries(object(value)).map(([name, row]) => [name, convert(object(row), nested)]),
          );
        else throw new Error(`Unsupported provider nesting: ${key}`);
      } else if (blocks[key]) {
        const block = object(blocks[key]);
        const child = object(block.block);
        if (block.nesting_mode === 'single') result[key] = [convert(object(value), child)];
        else if (block.nesting_mode === 'list' || block.nesting_mode === 'set') {
          if (!Array.isArray(value)) throw new Error(`Provider block must be a collection: ${key}`);
          result[key] = value.map((row) => convert(object(row), child));
        } else throw new Error(`Unsupported provider block nesting: ${key}`);
      } else if (key === 'description' && value === '') {
      } else throw new Error(`Published provider does not expose request field: ${key}`);
    }
    return result;
  };
  const siteDiscovery = ['xcsh_securemesh_site_v2', 'xcsh_voltstack_site', 'xcsh_aws_tgw_site'].includes(
    resourceType ?? '',
  );
  const labels =
    metadata.labels === undefined
      ? undefined
      : siteDiscovery
        ? writableSiteLabels(object(metadata.labels))
        : Object.fromEntries(
            Object.entries(object(metadata.labels)).filter(
              ([key]) => !key.startsWith('ves.io/') && !key.startsWith('internal.ves.io/'),
            ),
          );
  return convert(
    {
      name: metadata.name,
      namespace: metadata.namespace,
      ...(labels ? { labels } : {}),
      ...spec,
    },
    object(object(resourceSchema).block),
  );
}

// plugins/terraform/src/f5-resources.ts
var object2 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Malformed F5 Terraform resource evidence');
  return value;
};
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
var hash = (value) => createHash2('sha256').update(JSON.stringify(value)).digest('hex');
var kinds = {
  securemesh_site_v2s: 'xcsh_securemesh_site_v2',
  bgps: 'xcsh_bgp',
  bgp_routing_policys: 'xcsh_bgp_routing_policy',
  external_connectors: 'xcsh_external_connector',
  http_loadbalancers: 'xcsh_http_loadbalancer',
  origin_pools: 'xcsh_origin_pool',
};
async function executeF5TerraformResource(platform, terraform, owner, path, init, contextName, signal, tenantOrigin) {
  if (init.method === 'RECONCILE') {
    const storage = await platform.storage(owner);
    let book;
    try {
      book = await storage.read('terraform-f5-resources.json');
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      throw error;
    }
    if (!book.pending) return {};
    return executeF5TerraformResource(
      platform,
      terraform,
      owner,
      book.pending.path,
      { method: book.pending.method, ...(book.pending.request ? { body: JSON.stringify(book.pending.request) } : {}) },
      contextName,
      signal,
      tenantOrigin,
    );
  }
  if (owner.engine !== 'terraform' || !platform.providerEnvironment)
    throw new Error('F5 provider ownership or scoped credentials unavailable');
  const parts = /^\/api\/config\/namespaces\/([a-z][a-z0-9-]{0,62})\/([a-z_0-9]+)(?:\/([a-z][a-z0-9-]{0,62}))?$/.exec(
    path,
  );
  if (!parts || !kinds[parts[2]] || !['POST', 'PUT', 'DELETE'].includes(init.method ?? ''))
    throw new Error('Unsupported F5 Terraform resource operation');
  const method = init.method;
  const request = method === 'DELETE' ? undefined : object2(JSON.parse(String(init.body)));
  const metadata = request ? object2(request.metadata) : undefined;
  const name = parts[3] ?? metadata?.name;
  if (
    typeof name !== 'string' ||
    !/^[a-z][a-z0-9-]{0,62}$/.test(name) ||
    (metadata && (metadata.name !== name || metadata.namespace !== parts[1]))
  )
    throw new Error('F5 resource coordinates differ');
  const labels = {
    'xcsh-ce-deployment': owner.deploymentId,
    'xcsh-ce-engine': 'terraform',
    'xcsh-ce-provider': owner.provider,
    'xcsh-ce-account': owner.account,
    'xcsh-ce-region': owner.region,
  };
  if (metadata && Object.entries(labels).some(([key, value]) => object2(metadata.labels)[key] !== value))
    throw new Error('F5 resource labels differ from the owning Terraform deployment');
  const storage = await platform.storage(owner);
  const release = await acquireProcessLock(join2(storage.directory, '.f5-resource-lock'));
  try {
    const auth = object2(await storage.read('terraform-authorization.json'));
    if (
      auth.engine !== 'terraform' ||
      auth.mutations !== true ||
      typeof auth.planSha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(auth.planSha256)
    )
      throw new Error('Original Terraform deployment authorization is unavailable');
    const empty = {
      terraform: {
        required_version: '= 1.16.5',
        required_providers: { xcsh: { source: 'f5-sales-demo/xcsh', version: `= ${XCSH_PROVIDER_VERSION}` } },
      },
      provider: { xcsh: {} },
    };
    let book;
    let existed = true;
    try {
      book = await storage.read('terraform-f5-resources.json');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      existed = false;
      book = { schemaVersion: 1, owner: structuredClone(owner), resources: {}, configurationSha256: hash(empty) };
    }
    if (
      book.schemaVersion !== 1 ||
      ['deploymentId', 'engine', 'provider', 'account', 'region'].some((key) => book.owner[key] !== owner[key])
    )
      throw new Error('F5 Terraform state owner differs');
    const addressName = `view_${hash([parts[2], parts[1], name]).slice(0, 24)}`;
    const type = kinds[parts[2]],
      address = `${type}.${addressName}`,
      itemPath = `/api/config/namespaces/${parts[1]}/${parts[2]}/${name}`;
    if (method !== 'POST' && !book.resources[addressName])
      throw new Error('F5 view is not owned by Terraform state; adoption is prohibited');
    const env = { ...process.env, ...(await platform.providerEnvironment(contextName)) };
    if (!env.XCSH_API_URL || !env.XCSH_API_TOKEN) throw Error('F5 provider credentials unavailable');
    const base = new URL(env.XCSH_API_URL);
    if (base.protocol !== 'https:' || (tenantOrigin !== undefined && base.origin !== tenantOrigin))
      throw new Error('F5 provider tenant must use HTTPS');
    const read = async () => {
      const response = await fetch(new URL(itemPath, base), {
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000),
        redirect: 'error',
        headers: { Authorization: `APIToken ${env.XCSH_API_TOKEN}`, Accept: 'application/json' },
      });
      if (response.status === 404) return;
      if (!response.ok) throw new Error('F5 state ownership observation unavailable');
      const value = object2(await response.json()),
        meta = object2(value.metadata);
      if (
        meta.name !== name ||
        meta.namespace !== parts[1] ||
        Object.entries(labels).some(([key, v]) => object2(meta.labels)[key] !== v)
      )
        throw new Error('F5 resource ownership changed');
      if (typeof object2(value.system_metadata).uid !== 'string') throw new Error('F5 resource UID unavailable');
      return value;
    };
    const before = await read();
    if (method === 'POST' && before && !book.resources[addressName] && !book.pending)
      throw new Error('Existing F5 view cannot be adopted');
    if (
      before &&
      book.resources[addressName]?.uid &&
      object2(before.system_metadata).uid !== book.resources[addressName].uid
    )
      throw new Error('F5 view was replaced outside its owning state');
    const deployment = {
      schemaVersion: 1,
      deploymentId: owner.deploymentId,
      stage: 'f5-resources',
      engine: 'terraform',
      scope: { cloud: owner.provider, account: owner.account, region: owner.region },
      terraformVersion: '1.16.5',
      configuration: JSON.stringify(empty),
      providerLock: await loadXcshProviderLock(),
      backendIdentity: `local:${owner.deploymentId}:stage:f5-resources`,
    };
    const session = await terraform.open(owner, deployment, existed ? 'current' : false);
    if (!session.readProviderSchemas || !session.readConfigurationSha256 || !session.readResourceIdentities)
      throw new Error('Provider schema verification is unavailable');
    if (!existed) await storage.write('terraform-f5-resources.json', book);
    if (book.pending && !book.pending.submitted && !book.pending.receipt) {
      const priorResources = {};
      for (const [key, view] of Object.entries(book.resources)) {
        priorResources[view.type] ??= {};
        priorResources[view.type][key] = view.values;
      }
      const prior = JSON.stringify({
        ...empty,
        ...(Object.keys(priorResources).length ? { resource: priorResources } : {}),
      });
      const current = await session.readConfigurationSha256();
      if (current !== book.configurationSha256) {
        if (createHash2('sha256').update(prior).digest('hex') !== book.configurationSha256)
          throw new Error('Previous F5 configuration integrity failed');
        await session.reviseConfiguration(current, prior);
      }
    }
    const schemas = await session.readProviderSchemas(env, signal);
    const provider = object2(schemas['registry.terraform.io/f5-sales-demo/xcsh']);
    const resourceSchema = object2(provider.resource_schemas)[type];
    if (!resourceSchema) throw new Error('Published provider does not implement the requested F5 view');
    const next = structuredClone(book.resources);
    if (method === 'DELETE') delete next[addressName];
    else
      next[addressName] = {
        type,
        values: renderProviderResource(object2(request), resourceSchema, type),
        path: itemPath,
        uid: book.resources[addressName]?.uid,
      };
    const resource = {};
    for (const [key, view] of Object.entries(next)) {
      resource[view.type] ??= {};
      resource[view.type][key] = view.values;
    }
    const configuration = JSON.stringify({ ...empty, ...(Object.keys(resource).length ? { resource } : {}) });
    const specMatches = (value) =>
      canonical(
        renderProviderResource(
          { metadata: object2(request).metadata, spec: object2(value.spec) },
          resourceSchema,
          type,
        ),
      ) === canonical(next[addressName].values);
    const requestSha256 = hash({ owner, path, method, request });
    if (book.pending && book.pending.planSha256 !== auth.planSha256)
      throw new Error('Pending F5 operation belongs to another authorization');
    if (book.pending && book.pending.requestSha256 !== requestSha256)
      throw new Error('Another F5 Terraform request needs reconciliation');
    if (book.pending && book.pending.configuration !== configuration) {
      if (book.pending.submitted || book.pending.receipt) throw new Error('Reviewed pending F5 configuration changed');
      await storage.write('terraform-f5-failed-configuration.json', book.pending);
      delete book.pending;
    }
    let reconciled = false;
    if (book.pending?.submitted) {
      const identities = await session.readResourceIdentities(env, signal);
      const identity = identities.filter((row) => row.address === address);
      const stateMatches =
        method === 'DELETE'
          ? identity.length === 0
          : identity.length === 1 &&
            identity[0].type === type &&
            identity[0].name === name &&
            identity[0].namespace === parts[1] &&
            Object.entries(labels).every(([key, v]) => object2(identity[0].labels)[key] === v);
      const apiMatches = method === 'DELETE' ? !before : before && specMatches(before);
      if (!stateMatches || !apiMatches || !book.pending.receipt)
        throw new Error('F5 saved apply outcome remains unknown; no mutation was replayed');
      const evidence = { requestSha256, identities, uid: before ? object2(before.system_metadata).uid : null };
      await storage.write('terraform-f5-reconciliation.json', evidence);
      await session.reconcileApplyFromEvidence(book.pending.receipt, hash(evidence));
      reconciled = true;
    }
    if (!book.pending) {
      await session.reviseConfiguration(await session.readConfigurationSha256(), configuration);
      book.pending = {
        requestSha256,
        configuration,
        address,
        method,
        submitted: false,
        path,
        request,
        planSha256: String(auth.planSha256),
      };
      await storage.write('terraform-f5-resources.json', book);
    }
    const receipt = book.pending.receipt ?? (await session.plan(env, signal));
    if (
      receipt.changes.some(
        (change) =>
          change.actions.some((action) => action !== 'no-op' && action !== 'read') &&
          (change.address !== address ||
            change.actions.some(
              (action) =>
                ![method === 'DELETE' ? 'delete' : method === 'POST' ? 'create' : 'update', 'no-op', 'read'].includes(
                  action,
                ),
            )),
      )
    )
      throw new Error('F5 Terraform plan changes an unexpected resource or requires replacement');
    await storage.write('terraform-f5-saved-plan.json', receipt);
    book.pending.receipt = receipt;
    await storage.write('terraform-f5-resources.json', book);
    const latest = await read();
    if (
      (before && (!latest || object2(latest.system_metadata).uid !== object2(before.system_metadata).uid)) ||
      (!before && latest)
    )
      throw new Error('F5 resource changed after saved-plan review');
    if (!reconciled) {
      book.pending.submitted = true;
      await storage.write('terraform-f5-resources.json', book);
      await session.apply(receipt, env, signal);
    }
    const after = await read();
    if ((method === 'DELETE' && after) || (method !== 'DELETE' && !after))
      throw new Error('F5 provider readback did not converge');
    if (after && before && object2(after.system_metadata).uid !== object2(before.system_metadata).uid)
      throw new Error('F5 provider readback identity changed during apply');
    if (after && !specMatches(after)) throw new Error('F5 provider requested spec readback did not converge');
    if (after) next[addressName].uid = String(object2(after.system_metadata).uid);
    book.resources = next;
    book.configurationSha256 = await session.readConfigurationSha256();
    delete book.pending;
    await storage.write('terraform-f5-resources.json', book);
    const followup = await session.plan(env, signal);
    if (!followup.noChanges) throw new Error('F5 Terraform state did not converge to a zero-action plan');
    return after ?? {};
  } finally {
    await release();
  }
}

// plugins/terraform/src/runner.ts
import { createHash as createHash3, randomUUID as randomUUID2 } from 'node:crypto';
import {
  chmod,
  lstat as lstat2,
  mkdir as mkdir2,
  readFile as readFile3,
  realpath,
  rename as rename2,
  rm as rm2,
  writeFile as writeFile2,
} from 'node:fs/promises';
// plugins/terraform/src/service.ts
import { isAbsolute, join as join3, join as join4, resolve } from 'node:path';

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

// plugins/terraform/src/runner.ts
var planApplicationFlag = ['apply', 'able'].join('');
var cliConfig = `provider_installation {
  direct {}
}
disable_checkpoint = true
`;
var digest2 = (value) => createHash3('sha256').update(value).digest('hex');
function object3(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Terraform JSON object is malformed');
  return value;
}
function decode(value) {
  try {
    return object3(JSON.parse(value));
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
  const action = object3(invocations[0]);
  if (
    action.address !== expected.address ||
    action.type !== expected.type ||
    action.provider_name !== expected.providerName ||
    action.lifecycle_action_trigger !== undefined ||
    Object.keys(object3(action.invoke_action_trigger)).length ||
    !allFalse(action.config_unknown) ||
    !allFalse(action.config_sensitive) ||
    digest2(canonical2(object3(action.config_values))) !== expected.configValuesSha256
  )
    throw new Error('Terraform action identity, trigger or configuration differs');
  return [{ ...expected }];
}
async function privateDirectory(path) {
  await mkdir2(path, { recursive: true, mode: 448 });
  const stat = await lstat2(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    (await realpath(path)) !== path
  )
    throw new Error('Terraform storage ownership is invalid');
  await chmod(path, 448);
}
async function privateRead(path) {
  const stat = await lstat2(path);
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
function terraformExecutor(
  limits = {
    timeoutMs: 900000,
    applyTimeoutMs: 3600000,
    maxOutputBytes: 64 * 1024 * 1024,
    killAfterMs: 5000,
  },
  retainFailure = false,
) {
  return async ({ cwd, args, env, signal }) => {
    signal?.throwIfAborted();
    const child = Bun.spawn(['/bin/sh', '-c', 'umask 077; exec "$@"', 'ce-terraform', 'terraform', ...args], {
      cwd,
      env,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });
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
    }
  };
}
var executeTerraform = terraformExecutor(undefined, true);

class TerraformRunner {
  root;
  execute;
  #directory;
  #manifest;
  #busy = false;
  constructor(root, execute = executeTerraform) {
    this.root = root;
    this.execute = execute;
    if (!isAbsolute(root) || resolve(root) !== root) throw new Error('Terraform storage must be an absolute path');
  }
  async prepare(deployment) {
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
    if (!deployment.scope.account || !deployment.scope.region || !['aws', 'azure'].includes(deployment.scope.cloud))
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
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const { directory, manifest } = this.#state();
      const journal = decode((await privateRead(join3(directory, 'plan-receipt.json'))).toString());
      if (
        !['applying', 'applied'].includes(String(journal.state)) ||
        canonical2(receipt) !== canonical2(journal.receipt) ||
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
        if (canonical2(previous[key] ?? {}) !== canonical2(next[key] ?? {}))
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
      canonical2({ ...previous, configurationSha256: next.configurationSha256 }) !== canonical2(next) ||
      next.configurationSha256 !== digest2(transition.configuration)
    )
      throw new Error('Terraform configuration transition is malformed');
    this.#validateRevision(transition.configuration);
    const owner = decode((await privateRead(join3(directory, 'deployment.json'))).toString());
    const current = await privateRead(join3(directory, 'main.tf.json'));
    if (
      ![canonical2(previous), canonical2(next)].includes(canonical2(owner)) ||
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
      if (canonical2(recoveredManifest) !== canonical2(expectedManifest))
        throw new Error('Terraform deployment differs from the requested identity or configuration');
      if (configurationMode === 'current')
        this.#validateRevision((await privateRead(join3(directory, 'main.tf.json'))).toString(), configuration);
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
      await lstat2(join3(this.#directory, 'configuration-transition.json'));
      throw new Error('Resume the interrupted Terraform configuration transition before execution');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const owner = decode((await privateRead(join3(this.#directory, 'deployment.json'))).toString());
    if (canonical2(owner) !== canonical2(this.#manifest) || owner.engine !== 'terraform')
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
    const lock = join3(this.#directory, '.runner-lock');
    let release;
    try {
      release = await acquireProcessLock(lock);
      return await operation();
    } finally {
      if (release) await release();
      this.#busy = false;
    }
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
  async readProviderSchemas(env, signal) {
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const version = decode(await this.#run(['version', '-json'], env, signal));
      if (version.terraform_version !== this.#state().manifest.terraformVersion)
        throw new Error('Terraform version changed');
      await this.#run(['init', '-input=false', '-lockfile=readonly'], env, signal);
      const schema = decode(await this.#run(['providers', 'schema', '-json'], env, signal));
      return object3(schema.provider_schemas);
    });
  }
  async readResourceIdentities(env, signal) {
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const version = decode(await this.#run(['version', '-json'], env, signal));
      if (version.terraform_version !== this.#state().manifest.terraformVersion)
        throw new Error('Terraform version changed');
      const state = decode(await this.#run(['show', '-json'], env, signal));
      const rows = [];
      const walk = (module) => {
        for (const value of module.resources ?? []) {
          const resource = object3(value);
          if (resource.mode !== 'managed') continue;
          const values = object3(resource.values);
          if (
            typeof resource.address !== 'string' ||
            typeof resource.type !== 'string' ||
            typeof values.id !== 'string'
          )
            throw new Error('Terraform resource identity is incomplete');
          rows.push({
            address: resource.address,
            type: resource.type,
            id: values.id,
            ...(typeof values.name === 'string' ? { name: values.name } : {}),
            ...(typeof values.namespace === 'string' ? { namespace: values.namespace } : {}),
            labels: values.labels,
          });
        }
        for (const child of module.child_modules ?? []) walk(object3(child));
      };
      if (state.values) walk(object3(object3(state.values).root_module));
      return rows;
    });
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
  async #plan(env, signal, action, destroy = false) {
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
      const plan = decode(raw);
      if (
        !plan ||
        typeof plan.format_version !== 'string' ||
        !/^1\.\d+$/.test(plan.format_version) ||
        plan.terraform_version !== this.#state().manifest.terraformVersion ||
        plan.errored !== false ||
        plan.complete !== true ||
        typeof plan[planApplicationFlag] !== 'boolean' ||
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
      if (!noChanges && !plan[planApplicationFlag]) throw new Error('Terraform plan has changes but cannot be applied');
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
    return this.#projectResourceFields(receipt, selections, 'before', env, signal);
  }
  async readProposedResourceFields(receipt, selections, env, signal) {
    return this.#projectResourceFields(receipt, selections, 'after', env, signal);
  }
  async #projectResourceFields(receipt, selections, side, env, signal) {
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
          fields.some((field) => typeof field !== 'string' || !/^[a-z][a-z0-9_]*$/.test(field)),
      )
    )
      throw new Error('Explicit root resource addresses and unique top-level fields are required');
    selections = structuredClone(selections);
    receipt = structuredClone(receipt);
    const nonsensitive = (value) =>
      value === undefined ||
      value === false ||
      (value !== null && typeof value === 'object' && Object.values(value).every(nonsensitive));
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const { directory, manifest } = this.#state();
      const journal = decode((await privateRead(join3(directory, 'plan-receipt.json'))).toString());
      if (
        journal.state !== 'planned' ||
        canonical2(journal.receipt) !== canonical2(receipt) ||
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
        if (change[side] === null || change[side] === undefined) {
          result[address] = null;
          continue;
        }
        const values = object3(change[side]);
        const sensitive = change[`${side}_sensitive`];
        const sensitivity =
          sensitive === undefined || sensitive === false ? {} : sensitive === true ? true : object3(sensitive);
        const unknown = side === 'after' ? change.after_unknown : undefined;
        const unknownFields =
          unknown === undefined || unknown === false ? {} : unknown === true ? true : object3(unknown);
        const selected = {};
        for (const field of fields) {
          if (
            !Object.hasOwn(values, field) ||
            sensitivity === true ||
            !nonsensitive(sensitivity[field]) ||
            unknownFields === true ||
            !nonsensitive(unknownFields[field])
          )
            throw new Error('Terraform resource field is unavailable or sensitive; proposed fields must be resolved');
          selected[field] = values[field];
        }
        result[address] = selected;
      }
      if (receipt.planSha256 !== digest2(await privateRead(join3(directory, 'saved.tfplan'))))
        throw new Error('Terraform identity inspection saved plan changed');
      return result;
    });
  }
  async #applicationState(receipt) {
    await this.#verifyInputs();
    const { directory, manifest } = this.#state();
    const journal = decode((await privateRead(join3(directory, 'plan-receipt.json'))).toString());
    if (
      !['planned', 'applying', 'applied'].includes(String(journal.state)) ||
      canonical2(journal.receipt) !== canonical2(receipt) ||
      receipt.engine !== 'terraform' ||
      receipt.deploymentId !== manifest.deploymentId ||
      receipt.backendIdentity !== manifest.backendIdentity ||
      receipt.configurationSha256 !== manifest.configurationSha256 ||
      receipt.providerLockSha256 !== manifest.providerLockSha256 ||
      receipt.planSha256 !== digest2(await privateRead(join3(directory, 'saved.tfplan')))
    )
      throw Error('Terraform application journal differs from exact saved plan');
    return journal.state;
  }
  async readPlanApplicationState(receipt) {
    receipt = structuredClone(receipt);
    return this.#exclusive(() => this.#applicationState(receipt));
  }
  async readAppliedResourceFields(receipt, selections, env, signal) {
    receipt = structuredClone(receipt);
    selections = structuredClone(selections);
    if (
      !selections ||
      !Object.keys(selections).length ||
      Object.entries(selections).some(
        ([address, fields]) =>
          !/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(address) ||
          !Array.isArray(fields) ||
          !fields.length ||
          new Set(fields).size !== fields.length ||
          fields.some((f) => !/^[a-z][a-z0-9_]*$/.test(f)),
      )
    )
      throw Error('Explicit applied-state root addresses and unique fields required');
    const resolved = (v) =>
      v !== null && v !== undefined && (typeof v !== 'object' || Object.values(v).every(resolved));
    const nonsensitive = (v) =>
      v === undefined || v === false || (v !== null && typeof v === 'object' && Object.values(v).every(nonsensitive));
    return this.#exclusive(async () => {
      if ((await this.#applicationState(receipt)) === 'planned' && !receipt.noChanges)
        throw Error('Terraform applied-state observation requires submitted plan');
      const version = decode(await this.#run(['version', '-json'], env, signal));
      if (version.terraform_version !== this.#state().manifest.terraformVersion)
        throw Error('Terraform version changed');
      const state = decode(await this.#run(['show', '-json'], env, signal));
      const resources = [];
      if (state.format_version !== '1.0' || state.terraform_version !== this.#state().manifest.terraformVersion)
        throw Error('Applied-state format or Terraform version differs');
      const walk = (module) => {
        if (!Array.isArray(module.resources ?? []) || !Array.isArray(module.child_modules ?? []))
          throw Error('Malformed applied-state inventory');
        for (const value of module.resources ?? []) resources.push(object3(value));
        for (const child of module.child_modules ?? []) walk(object3(child));
      };
      walk(object3(object3(state.values).root_module));
      if (new Set(resources.map((r) => r.address)).size !== resources.length)
        throw Error('Duplicate applied-state resources');
      const result = {};
      for (const [address, fields] of Object.entries(selections)) {
        const matches = resources.filter((r) => r.address === address);
        if (!matches.length) {
          result[address] = null;
          continue;
        }
        const row = matches[0];
        const [type, name] = address.split('.');
        if (
          row.mode !== 'managed' ||
          row.type !== type ||
          row.name !== name ||
          typeof row.provider_name !== 'string' ||
          !/^registry\.terraform\.io\/[a-z0-9_-]+\/[a-z0-9_-]+$/.test(row.provider_name)
        )
          throw Error('Applied resource identity differs');
        const values = object3(row.values);
        const sensitive =
          row.sensitive_values === true
            ? true
            : row.sensitive_values === undefined || row.sensitive_values === false
              ? {}
              : object3(row.sensitive_values);
        const selected = {};
        for (const field of fields) {
          if (
            !Object.hasOwn(values, field) ||
            !resolved(values[field]) ||
            sensitive === true ||
            !nonsensitive(sensitive[field])
          )
            throw Error('Applied resource field unavailable or sensitive');
          selected[field] = values[field];
        }
        result[address] = selected;
      }
      await this.#applicationState(receipt);
      return result;
    });
  }
  async apply(receipt, env, signal) {
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const journal = decode((await privateRead(join3(this.#state().directory, 'plan-receipt.json'))).toString());
      if (journal.state !== 'planned') throw new Error('Saved plan is consumed or requires reconciliation');
      if (
        canonical2(receipt) !== canonical2(journal.receipt) ||
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
      await persist(join3(this.#state().directory, 'plan-receipt.json'), { state: 'applying', receipt });
      await this.#run(['apply', '-input=false', '-lock=true', '-lock-timeout=60s', 'saved.tfplan'], env, signal);
      await persist(join3(this.#state().directory, 'plan-receipt.json'), { state: 'applied', receipt });
    });
  }
}

// plugins/terraform/src/service.ts
var TERRAFORM_SERVICE_CHANNEL = 'xcsh:ce-terraform:v1:service';
function createCeTerraformService(platform) {
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
      const runner = new TerraformRunner(
        deployment.stage ? join4(store.directory, 'terraform-stages', deployment.stage) : store.directory,
      );
      if (resume) await runner.resume(deployment.deploymentId, deployment, resume === 'current' ? 'current' : 'exact');
      else await runner.prepare(deployment);
      const checkOwner = async () => {
        await shared.storage(owner);
      };
      return {
        async readProviderSchemas(env, signal) {
          await checkOwner();
          return runner.readProviderSchemas(env, signal);
        },
        async readResourceIdentities(env, signal) {
          await checkOwner();
          return runner.readResourceIdentities(env, signal);
        },
        async readConfigurationSha256() {
          await checkOwner();
          return runner.readConfigurationSha256();
        },
        async readPlannedResourceFields(receipt, selections, env, signal) {
          await checkOwner();
          return runner.readPlannedResourceFields(receipt, selections, env, signal);
        },
        async readProposedResourceFields(receipt, selections, env, signal) {
          await checkOwner();
          return runner.readProposedResourceFields(receipt, selections, env, signal);
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
        async readPlanApplicationState(receipt) {
          await checkOwner();
          return runner.readPlanApplicationState(receipt);
        },
        async readAppliedResourceFields(receipt, selections, env, signal) {
          await checkOwner();
          return runner.readAppliedResourceFields(receipt, selections, env, signal);
        },
        async apply(receipt, env, signal) {
          await checkOwner();
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
  terraformIntegration(pi);
  pi.setLabel('Terraform CE lifecycle execution');
  const service = createCeTerraformService(() => requestPlatform(pi.events));
  registerCeTerraformService(pi.events, service);
  pi.events.on(CE_TERRAFORM_RESOURCE_CHANNEL, (value) => {
    if (!value || typeof value !== 'object') return;
    const request = value;
    if (typeof request.resolve !== 'function' || typeof request.reject !== 'function') return;
    requestPlatform(pi.events)
      .then((platform) =>
        executeF5TerraformResource(
          platform,
          service,
          request.owner,
          request.path,
          request.init,
          request.contextName,
          request.signal,
          request.tenantOrigin,
        ),
      )
      .then(request.resolve, (error) =>
        request.reject(error instanceof Error ? error : new Error('F5 Terraform operation failed')),
      );
  });
}

export { factory as default };
