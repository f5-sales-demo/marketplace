import { readdir } from 'node:fs/promises';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import type { AwsNativeRoutingCheckpoint } from './native-routing-checkpoint';
import { compileAwsTerraformTeardown } from './terraform-teardown';
import { siteBindings } from './topology';
import type { AwsCePlan } from './types';

type Json = Record<string, unknown>;
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed teardown source record');
  return value as Json;
};
const safeName = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
/** Assemble a registered deployment's manifest from verified live identity and restricted artifact projections.
 * No health booleans or caller-built object lists are accepted; bootstrap contents never leave storage reads.
 */
export async function collectAwsTeardownMaterial(
  input: AwsCePlan,
  runtime: CeRuntime,
  contract: VerifiedIngressContract,
  storage: CeDeploymentStore,
  signal?: AbortSignal,
) {
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
  const tokenMatches = (file: string) =>
    patterns.filter((row) => file.startsWith(row.prefix) && /^[a-f0-9]{12}\.json$/.test(file.slice(row.prefix.length)));
  const ingressFile = (file: string) => /^ingress-plan-[a-f0-9]{24}\.json$/.test(file);
  const files = async () => {
    await storage.verify();
    const entries = await readdir(storage.directory, { withFileTypes: true });
    return entries
      .filter((entry) => ingressFile(entry.name) || tokenMatches(entry.name).length)
      .map((entry) => {
        if (!entry.isFile()) throw new Error('Teardown artifact is not a private regular file');
        return entry.name;
      })
      .sort();
  };
  const before = await files(),
    namespaces = new Set<string>(['default']);
  // Namespaces are read selectors only; every live listener later requires the integrity-checked projection.
  for (const file of before.filter(ingressFile)) {
    const value = object(await storage.read(file));
    const namespace = object(object(value.request).metadata).namespace;
    if (!safeName(namespace)) throw new Error('Stored listener namespace is invalid');
    namespaces.add(namespace);
    const originNamespace = object(object(object(value.material).intent).originPool).namespace;
    if (!safeName(originNamespace)) throw new Error('Stored origin namespace is invalid');
    namespaces.add(originNamespace);
  }
  const observe = async () => {
    const receipt = await runtime.teardownInventory(bindings, [...namespaces].sort(), contract, signal);
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
    const checkpoint = object(await storage.read(`${base.engine}-routing-checkpoint.json`));
    let values: Record<string, unknown>;
    if (base.engine === 'terraform') {
      if (
        checkpoint.schemaVersion !== 2 ||
        checkpoint.engine !== 'terraform' ||
        checkpoint.planId !== base.planId ||
        checkpoint.planSha256 !== base.planSha256
      )
        throw new Error('Routing checkpoint source differs');
      values = object(checkpoint.resolvedValues);
    } else {
      const native = checkpoint as unknown as AwsNativeRoutingCheckpoint;
      if (
        native.schemaVersion !== 1 ||
        native.engine !== 'native' ||
        native.planId !== base.planId ||
        native.planSha256 !== base.planSha256 ||
        native.ownerSha256 !== canonicalSha256(owner) ||
        !Array.isArray(native.resources) ||
        native.resources.length !== routing.length
      )
        throw new Error('Routing checkpoint source differs');
      values = Object.fromEntries(native.resources.map((row) => [`__XC_ROUTING_${row.name}__`, row.uid]));
    }
    if (routing.some((row) => values[`__XC_ROUTING_${row.name}__`] !== row.uid))
      throw new Error('Routing checkpoint UID differs from live inventory');
  }
  const tokenRows = new Map<string, { siteName: string; node: string; name: string }>();
  for (const file of before) {
    const matches = tokenMatches(file);
    if (!matches.length) continue;
    if (matches.length !== 1) throw new Error('Ambiguous historical enrollment filename');
    // The file also contains jwt. Explicitly project only these three nonsecret identity fields.
    const record = object(await storage.read(file));
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
    schemaVersion: 1 as const,
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
                ? ('bgp' as const)
                : row.kind === 'bgp_routing_policys'
                  ? ('bgp_routing_policy' as const)
                  : ('external_connector' as const),
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
  const identities = (value: typeof inventory) => ({
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

export async function prepareAwsTerraformTeardown(
  input: AwsCePlan,
  runtime: CeRuntime,
  contract: VerifiedIngressContract,
  storage: CeDeploymentStore,
  signal?: AbortSignal,
) {
  if (input.engine !== 'terraform') throw new Error('Terraform teardown preparation requires Terraform ownership');
  const { drain, retirement } = await collectAwsTeardownMaterial(input, runtime, contract, storage, signal);
  const plan = compileAwsTerraformTeardown(input, drain, retirement);
  await storage.write(`${plan.planId}.json`, plan);
  return plan;
}
