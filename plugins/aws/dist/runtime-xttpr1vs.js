// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun
import { acquireProcessLock, verifyAwsCePlan } from './runtime-2srcqb9f.js';
import {
  AWS_CE_PROVIDER_LOCK_SHA256,
  AWS_CE_TERRAFORM_PROVIDER_VERSION,
  AWS_CE_TERRAFORM_VERSION,
  siteBindings,
  siteForNode,
} from './runtime-ay1zjq29.js';
import { scopedAwsApi } from './runtime-fex55vat.js';
import { canonicalSha256 } from './runtime-wvre8ba5.js';

// plugins/aws/src/ce/whole-site-power-service-binding.ts
function requested(base) {
  const kinds = [];
  const profile = base.intent.routing.profile;
  if (profile === 'direct-eni') kinds.push('direct');
  else if (profile === 'tgw-static') kinds.push('static-tgw');
  else if (profile === 'tgw-connect') kinds.push('bgp');
  else if (profile !== 'nlb-ingress') throw Error('Whole-site service profile is unsupported');
  if (base.intent.ingress?.mode === 'nlb') kinds.push('nlb');
  if (!kinds.length) throw Error('Whole-site service components are missing');
  return kinds;
}
function validatePowerServiceInventory(base, bindings) {
  const expected = requested(base);
  const inventory = bindings.servicesInventory;
  if (!inventory) {
    if (expected.length !== 1) throw Error('Combined whole-site services require complete inventory binding');
    return;
  }
  if (
    inventory.schemaVersion !== 1 ||
    inventory.kind !== 'aws-ce-whole-site-services' ||
    inventory.sourcePlanSha256 !== base.planSha256 ||
    inventory.engine !== base.engine ||
    canonicalSha256(inventory) !== bindings.servicesSha256 ||
    !Array.isArray(inventory.components) ||
    inventory.components.length !== expected.length
  )
    throw Error('Whole-site complete service inventory differs');
  for (const [index, kind] of expected.entries()) {
    const row = inventory.components[index];
    if (
      !row ||
      row.kind !== kind ||
      !/^[a-f0-9]{64}$/.test(row.servicesSha256) ||
      canonicalSha256(row.services) !== row.servicesSha256
    )
      throw Error('Whole-site component identity differs');
  }
}
function powerServiceComponentSha256(base, bindings, kind) {
  validatePowerServiceInventory(base, bindings);
  if (!requested(base).includes(kind)) throw Error('Whole-site component is not requested');
  if (!bindings.servicesInventory) return bindings.servicesSha256;
  const row = bindings.servicesInventory.components.find((item) => item.kind === kind);
  if (!row) throw Error('Whole-site component binding missing');
  return row.servicesSha256;
}

// plugins/aws/src/ce/whole-site-power.ts
var sha = /^[a-f0-9]{64}$/;
var sequence = {
  stop: ['ready-to-stop', 'withdraw', 'withdrawn', 'stop', 'stopped'],
  start: ['ready-to-start', 'start', 'running', 'restore', 'restored', 'release'],
};
var effects = new Set(['withdraw', 'stop', 'start', 'restore', 'release']);
function validateBindings(base, bindings) {
  validatePowerServiceInventory(base, bindings);
  const owner = {
    deploymentId: base.deploymentName,
    engine: base.engine,
    provider: 'aws',
    account: base.accountId,
    region: base.region,
  };
  const expected = siteBindings(base).flatMap(({ site, binding }) =>
    site.nodeIndexes.map((nodeIndex, index) => ({ nodeIndex, nodeName: binding.nodes[index], siteName: site.name })),
  );
  if (
    bindings.sourcePlanSha256 !== base.planSha256 ||
    canonicalSha256(bindings.owner) !== canonicalSha256(owner) ||
    !sha.test(bindings.servicesSha256) ||
    bindings.nodes.length !== expected.length ||
    new Set(bindings.nodes.map((node) => node.instanceId)).size !== expected.length
  )
    throw new Error('Whole-site power deployment ownership or service binding differs');
  const allInterfaces = bindings.nodes.flatMap((node) => node.interfaces);
  if (
    new Set(allInterfaces.map((item) => item.id)).size !== allInterfaces.length ||
    new Set(allInterfaces.map((item) => item.mac.toLowerCase())).size !== allInterfaces.length
  )
    throw new Error('Whole-site power interface identities are duplicated');
  for (const expectedNode of expected) {
    const matches = bindings.nodes.filter((node) => node.nodeIndex === expectedNode.nodeIndex);
    if (matches.length !== 1) throw new Error('Whole-site power node discovery is incomplete or duplicated');
    const node = matches[0];
    if (
      node.nodeName !== expectedNode.nodeName ||
      node.siteName !== expectedNode.siteName ||
      !/^i-[a-f0-9]{8,17}$/.test(node.instanceId) ||
      node.interfaces.length !== base.interfaces.length
    )
      throw new Error('Whole-site power node or interface cardinality differs');
    for (const expectedInterface of base.interfaces) {
      const items = node.interfaces.filter((item) => item.index === expectedInterface.index);
      if (
        items.length !== 1 ||
        items[0].role !== expectedInterface.role ||
        !/^eni-[a-f0-9]{8,17}$/.test(items[0].id) ||
        !/^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/i.test(items[0].mac) ||
        !/^[a-zA-Z0-9_.:-]+$/.test(items[0].device) ||
        (expectedInterface.guestDevice !== undefined && items[0].device !== expectedInterface.guestDevice)
      )
        throw new Error('Whole-site power interface MAC/device/role binding differs or remains unresolved');
    }
  }
}
function buildAwsWholeSitePowerPlan(base, operation, bindings, transitionId, maintenance) {
  verifyAwsCePlan(base);
  if (base.intent.operation !== 'deploy' || !['stop', 'start'].includes(operation))
    throw new Error('Whole-site power requires the exact original deployment plan');
  validateBindings(base, bindings);
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(transitionId))
    throw new Error('Whole-site power requires an immutable transition UUID');
  const bindingsSha256 = canonicalSha256(bindings);
  if (operation === 'start') {
    if (!maintenance) throw new Error('Whole-site start requires the exact verified stopped maintenance receipt');
    const { receiptSha256, ...body } = maintenance;
    if (
      maintenance.schemaVersion !== 1 ||
      maintenance.kind !== 'aws-ce-stopped' ||
      maintenance.sourcePlanSha256 !== base.planSha256 ||
      maintenance.transitionId !== transitionId ||
      maintenance.bindingsSha256 !== bindingsSha256 ||
      !sha.test(maintenance.stopPlanSha256) ||
      !sha.test(maintenance.stoppedEvidenceSha256) ||
      canonicalSha256(body) !== receiptSha256 ||
      !Number.isFinite(Date.parse(maintenance.originalAttemptAt)) ||
      !Number.isFinite(Date.parse(maintenance.observedAt)) ||
      Date.parse(maintenance.observedAt) < Date.parse(maintenance.originalAttemptAt)
    )
      throw new Error('Whole-site start maintenance receipt is malformed or belongs to another deployment');
  } else if (maintenance) throw new Error('Whole-site stop cannot consume an unrelated maintenance receipt');
  const body = {
    schemaVersion: 1,
    kind: 'aws-ce-whole-site-power',
    engine: base.engine,
    operation,
    transitionId,
    sourcePlanId: base.planId,
    sourcePlanSha256: base.planSha256,
    bindings: structuredClone(bindings),
    bindingsSha256,
    ...(maintenance ? { maintenance: structuredClone(maintenance) } : {}),
  };
  const planSha256 = canonicalSha256(body);
  return { ...body, planSha256, planId: `aws-ce-power-${planSha256.slice(0, 24)}` };
}
function verifyAwsWholeSitePowerPlan(base, plan) {
  const expected = buildAwsWholeSitePowerPlan(base, plan.operation, plan.bindings, plan.transitionId, plan.maintenance);
  if (canonicalSha256(plan) !== canonicalSha256(expected)) throw new Error('Whole-site power immutable plan differs');
}
function evidencePasses(plan, gate, value, now) {
  if (
    value.source !== 'live' ||
    value.planSha256 !== plan.planSha256 ||
    value.bindingsSha256 !== plan.bindingsSha256 ||
    value.gate !== gate ||
    value.identity !== 'verified' ||
    !Number.isFinite(Date.parse(value.collectedAt)) ||
    Date.parse(value.collectedAt) > now ||
    now - Date.parse(value.collectedAt) > 30000
  )
    return false;
  if (gate === 'stopped' || gate === 'ready-to-start')
    return value.cloud === 'stopped' && value.services === 'withdrawn' && value.traffic === 'blocked';
  if (gate === 'withdrawn')
    return value.cloud === 'running' && value.services === 'withdrawn' && value.traffic === 'blocked';
  const healthy =
    value.cloud === 'running' &&
    value.registration === 'healthy' &&
    value.configuration === 'verified' &&
    value.versions === 'stable' &&
    value.interfaces === 'up' &&
    value.canSatisfyInterfaceMutationGate === true;
  if (gate === 'running') return healthy && value.services === 'withdrawn';
  return healthy && value.services === 'active' && value.traffic === 'passing';
}
async function optional(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return;
  }
}
async function runAwsWholeSitePower(base, plan, authorizedPlanSha256, storage, driver, signal, clock = Date.now) {
  verifyAwsWholeSitePowerPlan(base, plan);
  if (
    authorizedPlanSha256 !== plan.planSha256 ||
    driver.engine !== base.engine ||
    canonicalSha256(storage.owner) !== canonicalSha256(plan.bindings.owner)
  )
    throw new Error('Whole-site power authorization, owning engine or deployment store differs');
  if (base.topology.nodeCount !== 1 || plan.bindings.nodes.length !== 1)
    throw new Error('Whole-site power requires a separately qualified multi-node lifecycle contract');
  const release = await acquireProcessLock(`${storage.directory}/.whole-site-power-lock`);
  try {
    await storage.verify();
    if (plan.operation === 'start') {
      const maintenance = plan.maintenance;
      if (!maintenance) throw new Error('Whole-site start maintenance receipt is missing');
      const prior = await storage.read(`aws-ce-power-${maintenance.stopPlanSha256.slice(0, 24)}-maintenance.json`);
      if (canonicalSha256(prior) !== canonicalSha256(plan.maintenance))
        throw new Error('Whole-site start requires the privately retained owning-engine stopped receipt');
    }
    const sourceName = `${plan.planId}.json`;
    const saved = await optional(storage, sourceName);
    if (saved && canonicalSha256(saved) !== canonicalSha256(plan))
      throw new Error('Saved whole-site power plan differs');
    if (!saved) await storage.write(sourceName, plan);
    const checkpointName = `${plan.planId}-checkpoint.json`;
    const savedCheckpoint = await optional(storage, checkpointName);
    const steps = sequence[plan.operation];
    let state = savedCheckpoint ?? {
      schemaVersion: 1,
      planSha256: plan.planSha256,
      bindingsSha256: plan.bindingsSha256,
      step: 0,
      attempts: {},
      evidence: {},
      complete: false,
    };
    if (!savedCheckpoint) await storage.write(checkpointName, state);
    const now = clock();
    if (
      !Number.isFinite(now) ||
      state.schemaVersion !== 1 ||
      state.planSha256 !== plan.planSha256 ||
      state.bindingsSha256 !== plan.bindingsSha256 ||
      !Number.isInteger(state.step) ||
      state.step < 0 ||
      state.step > steps.length ||
      state.complete !== (state.step === steps.length) ||
      (state.pending && state.pending.effect !== steps[state.step])
    )
      throw new Error('Whole-site power checkpoint differs');
    for (const [effect, attempt] of Object.entries(state.attempts)) {
      if (
        !effects.has(effect) ||
        !steps.some((step) => step === effect) ||
        !attempt ||
        attempt.effect !== effect ||
        attempt.requestSha256 !== canonicalSha256({ planSha256: plan.planSha256, effect }) ||
        !Number.isFinite(Date.parse(attempt.originalAttemptAt)) ||
        Date.parse(attempt.originalAttemptAt) > now
      )
        throw new Error('Whole-site power original attempt binding differs');
    }
    for (const completed of steps.slice(0, state.step)) {
      if (effects.has(completed)) {
        if (!state.attempts[completed]) throw new Error('Completed whole-site effect lacks an original attempt');
      } else {
        const evidence = state.evidence[completed];
        if (!evidence || !evidencePasses(plan, completed, evidence, Date.parse(evidence.collectedAt)))
          throw new Error('Completed whole-site gate lacks valid bound evidence');
      }
    }
    if (state.pending && canonicalSha256(state.pending) !== canonicalSha256(state.attempts[state.pending.effect]))
      throw new Error('Whole-site power submitted attempt differs');
    const assertCurrentBindings = async () => {
      await storage.verify();
      const current = await driver.readBindings(signal);
      validateBindings(base, current);
      if (canonicalSha256(current) !== plan.bindingsSha256)
        throw new Error('Whole-site power live identities or retained services changed');
    };
    const pending = (reason) => ({
      status: 'power-pending',
      reason,
      operation: plan.operation,
      engine: plan.engine,
      planId: plan.planId,
      planSha256: plan.planSha256,
      step: state.step,
      fullCeAcceptance: false,
    });
    for (; state.step < steps.length; ) {
      signal?.throwIfAborted();
      await assertCurrentBindings();
      const step = steps[state.step];
      if (effects.has(step)) {
        const effect = step;
        if (state.pending) {
          let observed = await driver.reconcile(plan, effect, state.pending.originalAttemptAt, signal);
          if (observed === 'not-submitted') {
            const preceding = [...steps.slice(0, state.step)].reverse().find((value) => !effects.has(value));
            const evidence = await driver.observe(plan, preceding, signal);
            if (!evidencePasses(plan, preceding, evidence, clock()))
              return pending(`prerequisite-${preceding}-unknown`);
            await driver.execute(plan, effect, signal);
            observed = await driver.reconcile(plan, effect, state.pending.originalAttemptAt, signal);
          }
          if (observed !== 'completed') return pending(`submitted-${effect}-${observed}`);
          state = { ...state, pending: undefined, step: state.step + 1, complete: state.step + 1 === steps.length };
          await storage.write(checkpointName, state);
          continue;
        }
        const preceding = [...steps.slice(0, state.step)].reverse().find((value) => !effects.has(value));
        const evidence = await driver.observe(plan, preceding, signal);
        if (!evidencePasses(plan, preceding, evidence, clock())) return pending(`prerequisite-${preceding}-unknown`);
        const attempt = {
          effect,
          originalAttemptAt: new Date(clock()).toISOString(),
          requestSha256: canonicalSha256({ planSha256: plan.planSha256, effect }),
        };
        if (state.attempts[effect])
          throw new Error('Whole-site power effect cannot be resubmitted from a prior attempt');
        state = { ...state, pending: attempt, attempts: { ...state.attempts, [effect]: attempt } };
        await storage.write(checkpointName, state);
        await driver.execute(plan, effect, signal);
        const observed = await driver.reconcile(plan, effect, attempt.originalAttemptAt, signal);
        if (observed !== 'completed') return pending(`submitted-${effect}-${observed}`);
        state = { ...state, pending: undefined, step: state.step + 1 };
      } else {
        const gate = step;
        const evidence = await driver.observe(plan, gate, signal);
        await storage.write(`${plan.planId}-${gate}-last-evidence.json`, evidence);
        if (!evidencePasses(plan, gate, evidence, clock())) return pending(`${gate}-unknown`);
        state = { ...state, step: state.step + 1, evidence: { ...state.evidence, [gate]: evidence } };
      }
      state = { ...state, complete: state.step === steps.length };
      await storage.write(checkpointName, state);
    }
    await assertCurrentBindings();
    const finalGate = plan.operation === 'stop' ? 'stopped' : 'restored';
    const finalEvidence = await driver.observe(plan, finalGate, signal);
    if (!evidencePasses(plan, finalGate, finalEvidence, clock()))
      return pending(`completed-${finalGate}-evidence-unavailable`);
    if (plan.operation === 'stop') {
      const attempt = state.attempts.stop;
      if (!attempt) throw new Error('Whole-site stop original attempt is missing');
      const evidenceName = `${plan.planId}-final-stopped-evidence.json`;
      const captured = (await optional(storage, evidenceName)) ?? finalEvidence;
      if (
        !evidencePasses(plan, 'stopped', captured, Date.parse(captured.collectedAt)) ||
        Date.parse(captured.collectedAt) > clock() ||
        Date.parse(captured.collectedAt) < Date.parse(attempt.originalAttemptAt)
      )
        throw new Error('Retained stopped evidence differs from the original power attempt');
      await storage.write(evidenceName, captured);
      const maintenanceName = `${plan.planId}-maintenance.json`;
      const prior = await optional(storage, maintenanceName);
      let maintenance;
      if (prior) {
        buildAwsWholeSitePowerPlan(base, 'start', plan.bindings, plan.transitionId, prior);
        if (
          prior.stopPlanSha256 !== plan.planSha256 ||
          prior.originalAttemptAt !== attempt.originalAttemptAt ||
          prior.stoppedEvidenceSha256 !== canonicalSha256(captured) ||
          prior.observedAt !== captured.collectedAt
        )
          throw new Error('Retained stopped maintenance receipt differs');
        maintenance = prior;
      } else {
        const body = {
          schemaVersion: 1,
          kind: 'aws-ce-stopped',
          sourcePlanSha256: base.planSha256,
          transitionId: plan.transitionId,
          stopPlanSha256: plan.planSha256,
          bindingsSha256: plan.bindingsSha256,
          stoppedEvidenceSha256: canonicalSha256(captured),
          originalAttemptAt: attempt.originalAttemptAt,
          observedAt: captured.collectedAt,
        };
        maintenance = { ...body, receiptSha256: canonicalSha256(body) };
        await storage.write(maintenanceName, maintenance);
      }
      return {
        status: 'site-stopped',
        operation: plan.operation,
        engine: plan.engine,
        planId: plan.planId,
        planSha256: plan.planSha256,
        maintenance,
        evidence: finalEvidence,
        originalCeHeartbeat: 'unknown',
        fullCeAcceptance: false,
      };
    }
    const final = await driver.finish(plan, signal);
    if (final.engine !== plan.engine || final.noChanges !== true)
      throw new Error('Whole-site start final owning-engine no-change verification failed');
    return {
      status: 'site-started',
      operation: plan.operation,
      engine: plan.engine,
      planId: plan.planId,
      planSha256: plan.planSha256,
      evidence: finalEvidence,
      noChanges: true,
      originalCeHeartbeat: 'unknown',
      fullCeAcceptance: false,
    };
  } finally {
    await release();
  }
}

// plugins/platform/src/ce/bgp-power-policy.ts
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed BGP maintenance policy');
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
var hash = (value) => createHash('sha256').update(canonical(value)).digest('hex');
function buildAwsBgpPowerPolicyRevision(snapshot, siteName, prefixes, effect, validate, retained) {
  if (
    !/^[a-z0-9][a-z0-9-]{0,62}$/.test(siteName) ||
    !Array.isArray(prefixes) ||
    !prefixes.length ||
    new Set(prefixes).size !== prefixes.length
  )
    throw Error('BGP maintenance identity or service prefixes differ');
  for (const cidr of prefixes) {
    const [ip, bits, extra] = cidr.split('/');
    if (isIP(ip) !== 4 || !/^\d{1,2}$/.test(bits ?? '') || Number(bits) < 1 || Number(bits) > 32 || extra !== undefined)
      throw Error('BGP maintenance service prefix unresolved or broad');
    const address = ip.split('.').reduce((v, o) => (v * 256 + Number(o)) >>> 0, 0);
    const mask = (4294967295 << (32 - Number(bits))) >>> 0;
    if ((address & mask) >>> 0 !== address) throw Error('BGP maintenance prefix is not network aligned');
  }
  const normalized = [...prefixes].sort();
  const policy = {
    name: `${siteName.slice(0, 43)}-tgw-power-policy`,
    spec: {
      rules: [
        {
          match: {
            ip_prefixes: { prefixes: normalized.map((ip_prefixes) => ({ ip_prefixes, equal_or_longer_than: {} })) },
          },
          action: { deny: {} },
        },
      ],
    },
  };
  validate('bgp_routing_policy', policy.spec);
  const original =
    effect === 'withdraw' ? structuredClone(object(snapshot)) : structuredClone(object(retained?.originalBgpSpec));
  if (
    effect === 'restore' &&
    (retained?.schemaVersion !== 1 ||
      retained.effect !== 'withdraw' ||
      retained.siteName !== siteName ||
      canonical(retained.prefixes) !== canonical(normalized) ||
      hash(original) !== retained.originalSha256 ||
      hash(snapshot) !== retained.withdrawnSha256 ||
      hash(retained.bgpSpec) !== retained.withdrawnSha256 ||
      canonical(retained.policy) !== canonical(policy))
  )
    throw Error('BGP restoration requires exact retained withdrawal');
  if (!['withdraw', 'restore'].includes(effect)) throw Error('BGP maintenance effect differs');
  const where = object(object(original.where).site);
  const refs = where.ref;
  if (
    where.network_type !== 'VIRTUAL_NETWORK_SITE_LOCAL_INSIDE' ||
    !Array.isArray(refs) ||
    refs.length !== 1 ||
    object(refs[0]).name !== siteName ||
    object(refs[0]).namespace !== 'system' ||
    !Array.isArray(original.peers) ||
    !original.peers.length
  )
    throw Error('BGP maintenance site or peer binding differs');
  const peerNames = new Set(),
    addresses = new Set();
  for (const peerValue of original.peers) {
    const peer = object(peerValue),
      external = object(peer.external),
      metadata = object(peer.metadata);
    if (
      Object.hasOwn(peer, 'routing_policies') ||
      Object.hasOwn(peer, 'disable') ||
      typeof metadata.name !== 'string' ||
      peerNames.has(metadata.name) ||
      typeof external.address !== 'string' ||
      isIP(external.address) !== 4 ||
      addresses.has(external.address)
    )
      throw Error('BGP maintenance original peers ambiguous or foreign policy');
    peerNames.add(metadata.name);
    addresses.add(external.address);
  }
  const originalSpec = original;
  validate('bgp', original);
  const withdrawn = structuredClone(originalSpec);
  for (const peer of withdrawn.peers)
    peer.routing_policies = {
      route_policy: [{ all_nodes: {}, outbound: {}, object_refs: [{ name: policy.name, namespace: 'system' }] }],
    };
  validate('bgp', withdrawn);
  if (effect === 'restore' && canonical(withdrawn) !== canonical(snapshot))
    throw Error('BGP maintenance withdrawal configuration differs');
  return {
    schemaVersion: 1,
    effect,
    siteName,
    prefixes: normalized,
    policy,
    originalBgpSpec: originalSpec,
    bgpSpec: effect === 'withdraw' ? withdrawn : structuredClone(originalSpec),
    originalSha256: hash(original),
    withdrawnSha256: hash(withdrawn),
    operationalEvidence: 'unknown',
  };
}

// plugins/aws/src/ce/whole-site-power-connect.ts
import { isIP as isIP2 } from 'node:net';

function object2(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Malformed Connect service evidence');
  return v;
}
function rows(v) {
  if (!Array.isArray(v)) throw Error('Incomplete Connect service evidence');
  return v.map(object2);
}
function exactly(v) {
  const all = rows(v);
  if (all.length !== 1) throw Error('Connect service cardinality differs');
  return all[0];
}
function network(cidr) {
  const [ip, prefix, extra] = cidr.split('/'),
    bits = Number(prefix);
  if (isIP2(ip) !== 4 || !/^\d{1,2}$/.test(prefix ?? '') || bits < 1 || bits > 32 || extra !== undefined)
    throw Error('Connect service prefix unresolved or broad');
  const address = ip.split('.').reduce((n, o) => (n * 256 + Number(o)) >>> 0, 0),
    mask = (4294967295 << (32 - bits)) >>> 0;
  if ((address & mask) >>> 0 !== address) throw Error('Connect service prefix not network aligned');
  return { address, bits };
}
function overlaps(a, b) {
  const x = network(a),
    y = network(b),
    mask = (4294967295 << (32 - Math.min(x.bits, y.bits))) >>> 0;
  return (x.address & mask) >>> 0 === (y.address & mask) >>> 0;
}
async function collectAwsPowerConnectRoutes(base, values, raw, signal) {
  verifyAwsCePlan(base);
  const routing = base.intent.routing,
    gateway = routing.transitGatewayId ?? '',
    vpc = values.__VPC_ID__ ?? base.intent.vpc.vpcId ?? '';
  const transport = routing.transportAttachmentId ?? values.__TGW_TRANSPORT_ATTACHMENT__;
  const tables = [...new Set([...routing.associations, ...routing.propagations])].sort();
  if (
    routing.profile !== 'tgw-connect' ||
    !Number.isInteger(routing.customerAsn) ||
    !Number.isInteger(routing.transitGatewayAsn) ||
    (routing.customerAsn ?? 0) < 1 ||
    (routing.transitGatewayAsn ?? 0) < 1 ||
    !/^tgw-[a-f0-9]{8,17}$/.test(gateway) ||
    !/^vpc-[a-f0-9]{8,17}$/.test(vpc) ||
    !/^tgw-attach-[a-f0-9]{8,17}$/.test(transport ?? '') ||
    !base.intent.brownfield.resourceIds.includes(gateway) ||
    routing.associations.length !== 1 ||
    !routing.propagations.length ||
    new Set(routing.propagations).size !== routing.propagations.length ||
    tables.some(
      (t) => !/^tgw-rtb-[a-f0-9]{8,17}$/.test(t) || !base.intent.brownfield.transitGatewayRouteTableIds.includes(t),
    ) ||
    !routing.destinationCidrs.length ||
    new Set(routing.destinationCidrs).size !== routing.destinationCidrs.length
  )
    throw Error('Connect service scope unresolved or ambiguous');
  const prefixes = [...routing.destinationCidrs].sort();
  for (const p of prefixes) network(p);
  const resolve = (v) => (v?.startsWith('__') ? values[v] : v);
  const arg = (args, flag) => {
    const index = args?.indexOf(flag) ?? -1;
    return index < 0 ? undefined : resolve(args?.[index + 1]);
  };
  const attachmentActions = base.actions.filter((a) => a.kind === 'tgw-connect-attachment-create');
  const attachmentIds = attachmentActions.map((a) => values[a.capture?.placeholder ?? '']);
  const peerActions = base.actions.filter((a) => a.kind === 'tgw-connect-peer-create');
  const expected = peerActions.map((a) => {
    const ref = a.args?.[(a.args?.indexOf('--peer-address') ?? -1) + 1],
      role = ref?.match(/^__NODE_(\d+)_(SLO|SLI)_IP__$/);
    const index = role?.[2] === 'SLO' ? 0 : 1,
      node = a.node ?? 0;
    if (
      !role ||
      Number(role[1]) !== node ||
      !base.intent.interfaces.some((i) => i.index === index && i.role === role[2].toLowerCase())
    )
      throw Error('Connect peer interface role unresolved');
    return {
      node,
      siteName: siteForNode(base.intent, node).name,
      interfaceIndex: index,
      peerId: values[a.capture?.placeholder ?? ''],
      attachmentId: arg(a.args, '--transit-gateway-attachment-id'),
      peerAddress: arg(a.args, '--peer-address'),
      insideCidr: arg(a.args, '--inside-cidr-blocks'),
      gatewayAddress: arg(a.args, '--transit-gateway-address'),
      eni: values[`__ENI_${node}_${index}__`],
      mac: values[`__ENI_${node}_${index}_MAC__`],
      instance: values[`__INSTANCE_${node}__`],
    };
  });
  if (
    !attachmentIds.length ||
    new Set(attachmentIds).size !== attachmentIds.length ||
    attachmentIds.some((a) => !/^tgw-attach-[a-f0-9]{8,17}$/.test(a ?? '')) ||
    attachmentActions.some(
      (a) =>
        arg(a.args, '--transport-transit-gateway-attachment-id') !== transport ||
        arg(a.args, '--options') !== 'Protocol=gre',
    ) ||
    !expected.length ||
    new Set(expected.map((p) => p.peerId)).size !== expected.length ||
    (routing.connectPeers !== undefined &&
      (routing.connectPeers.length !== expected.length ||
        routing.connectPeers.some(
          (p, i) =>
            p.node !== expected[i].node ||
            p.transportInterfaceIndex !== expected[i].interfaceIndex ||
            p.insideCidr !== expected[i].insideCidr ||
            p.transitGatewayAddress !== expected[i].gatewayAddress,
        ))) ||
    Array.from({ length: base.intent.topology.nodeCount }, (_, i) => i + 1).some(
      (node) => !expected.some((p) => p.node === node),
    ) ||
    attachmentIds.some(
      (id) =>
        expected.filter((p) => p.attachmentId === id).length < 1 ||
        expected.filter((p) => p.attachmentId === id).length > 4,
    ) ||
    expected.some(
      (p) =>
        !/^tgw-connect-peer-[a-f0-9]{8,21}$/.test(p.peerId ?? '') ||
        !attachmentIds.includes(p.attachmentId ?? '') ||
        isIP2(p.peerAddress ?? '') !== 4 ||
        !/^eni-[a-f0-9]{8,17}$/.test(p.eni ?? '') ||
        !/^i-[a-f0-9]{8,17}$/.test(p.instance ?? '') ||
        !/^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/i.test(p.mac ?? ''),
    )
  )
    throw Error('Connect runtime bindings incomplete or duplicated');
  const api = scopedAwsApi(raw, base.intent.awsProfile ?? 'default', signal);
  const read = async (args) => {
    signal?.throwIfAborted();
    const r = await api.exec('aws', [...args, '--region', base.region, '--output', 'json']);
    if (r.exitCode) throw Error('Connect service observation unavailable');
    const result = object2(JSON.parse(r.stdout));
    if (['NextToken', 'nextToken', 'NextMarker', 'Marker'].some((k) => Object.hasOwn(result, k)))
      throw Error('Partial Connect service evidence');
    return result;
  };
  const owned = (resource, node, interfaceIndex) => {
    const tags = rows(resource.Tags ?? resource.TagSet);
    const labels = {
      'xcsh-managed-by': 'aws-ce',
      'xcsh-deployment-id': base.deploymentName,
      'xcsh-execution-engine': base.engine,
      'xcsh-plan-sha256': base.planSha256,
      ...(node ? { 'xcsh-node-index': String(node) } : {}),
      ...(interfaceIndex !== undefined ? { 'xcsh-interface-index': String(interfaceIndex) } : {}),
    };
    if (
      new Set(tags.map((t) => t.Key)).size !== tags.length ||
      tags.some((t) => typeof t.Key !== 'string' || typeof t.Value !== 'string') ||
      Object.entries(labels).some(([k, v]) => !tags.some((t) => t.Key === k && t.Value === v))
    )
      throw Error('Foreign Connect service ownership');
  };
  if ((await read(['sts', 'get-caller-identity'])).Account !== base.accountId)
    throw Error('Connect service account differs');
  const transportObject = exactly(
    (await read(['ec2', 'describe-transit-gateway-vpc-attachments', '--transit-gateway-attachment-ids', transport]))
      .TransitGatewayVpcAttachments,
  );
  if (routing.transportAttachmentId) {
    if (!base.intent.brownfield.resourceIds.includes(transport))
      throw Error('Connect brownfield transport not allowlisted');
  } else owned(transportObject);
  const transportSubnets = transportObject.SubnetIds;
  if (
    transportObject.TransitGatewayAttachmentId !== transport ||
    transportObject.TransitGatewayId !== gateway ||
    transportObject.VpcId !== vpc ||
    transportObject.VpcOwnerId !== base.accountId ||
    transportObject.State !== 'available' ||
    !Array.isArray(transportSubnets) ||
    !transportSubnets.length ||
    new Set(transportSubnets).size !== transportSubnets.length ||
    transportSubnets.some((s) => typeof s !== 'string' || !/^subnet-[a-f0-9]{8,17}$/.test(s)) ||
    !['enable', 'disable'].includes(String(object2(transportObject.Options).ApplianceModeSupport))
  )
    throw Error('Connect retained transport differs');
  const attachmentBindings = [];
  for (const id of [...attachmentIds].sort()) {
    const connect = exactly(
      (await read(['ec2', 'describe-transit-gateway-connects', '--transit-gateway-attachment-ids', id]))
        .TransitGatewayConnects,
    );
    const generic = exactly(
      (await read(['ec2', 'describe-transit-gateway-attachments', '--transit-gateway-attachment-ids', id]))
        .TransitGatewayAttachments,
    );
    owned(connect);
    owned(generic);
    if (
      connect.TransitGatewayAttachmentId !== id ||
      connect.TransitGatewayId !== gateway ||
      connect.TransportTransitGatewayAttachmentId !== transport ||
      connect.State !== 'available' ||
      object2(connect.Options).Protocol !== 'gre' ||
      generic.TransitGatewayAttachmentId !== id ||
      generic.TransitGatewayId !== gateway ||
      generic.ResourceOwnerId !== base.accountId ||
      generic.ResourceType !== 'connect' ||
      generic.State !== 'available'
    )
      throw Error('Connect attachment owner or transport differs');
    attachmentBindings.push({ id, transportAttachmentId: transport, protocol: 'gre' });
  }
  const peerResponse = rows(
    (
      await read([
        'ec2',
        'describe-transit-gateway-connect-peers',
        '--transit-gateway-connect-peer-ids',
        ...expected.map((p) => p.peerId),
      ])
    ).TransitGatewayConnectPeers,
  );
  if (
    peerResponse.length !== expected.length ||
    new Set(peerResponse.map((p) => p.TransitGatewayConnectPeerId)).size !== peerResponse.length
  )
    throw Error('Connect peer discovery incomplete or duplicated');
  const peerBindings = [],
    sessions = [];
  for (const selected of expected) {
    const peer = exactly(peerResponse.filter((p) => p.TransitGatewayConnectPeerId === selected.peerId));
    owned(peer, selected.node);
    const nic = exactly(
      (await read(['ec2', 'describe-network-interfaces', '--network-interface-ids', selected.eni])).NetworkInterfaces,
    );
    owned(nic, selected.node, selected.interfaceIndex);
    if (
      peer.TransitGatewayAttachmentId !== selected.attachmentId ||
      peer.State !== 'available' ||
      nic.NetworkInterfaceId !== selected.eni ||
      nic.OwnerId !== base.accountId ||
      nic.VpcId !== vpc ||
      nic.PrivateIpAddress !== selected.peerAddress ||
      nic.MacAddress !== selected.mac ||
      nic.Status !== 'in-use' ||
      object2(nic.Attachment).InstanceId !== selected.instance ||
      object2(nic.Attachment).DeviceIndex !== selected.interfaceIndex ||
      !/^subnet-[a-f0-9]{8,17}$/.test(String(nic.SubnetId))
    )
      throw Error('Connect peer and physical interface binding differs');
    const config = object2(peer.ConnectPeerConfiguration),
      cidrs = config.InsideCidrBlocks;
    if (
      config.Protocol !== 'gre' ||
      config.PeerAddress !== selected.peerAddress ||
      isIP2(String(config.TransitGatewayAddress)) !== 4 ||
      (selected.gatewayAddress !== undefined && config.TransitGatewayAddress !== selected.gatewayAddress) ||
      !Array.isArray(cidrs) ||
      cidrs.length !== 1 ||
      cidrs[0] !== selected.insideCidr
    )
      throw Error('Connect GRE configuration differs');
    const inside = network(String(cidrs[0]));
    if (inside.bits !== 29) throw Error('Connect inside network differs');
    const bgp = rows(config.BgpConfigurations);
    if (bgp.length !== 2) throw Error('Connect BGP session discovery incomplete');
    const endpoints = new Set();
    let local;
    for (const session of bgp) {
      const endpoint = String(session.TransitGatewayAddress),
        ceEndpoint = String(session.PeerAddress),
        status = String(session.BgpStatus);
      const ip = (s) => s.split('.').reduce((n, o) => n * 256 + Number(o), 0);
      if (
        isIP2(endpoint) !== 4 ||
        isIP2(ceEndpoint) !== 4 ||
        endpoints.has(endpoint) ||
        endpoint === ceEndpoint ||
        session.TransitGatewayAsn !== routing.transitGatewayAsn ||
        session.PeerAsn !== routing.customerAsn ||
        !['up', 'down'].includes(status) ||
        (local !== undefined && local !== ceEndpoint) ||
        [endpoint, ceEndpoint].some((s) => ip(s) <= inside.address || ip(s) >= inside.address + 7)
      )
        throw Error('Connect BGP endpoints, ASNs or states differ');
      endpoints.add(endpoint);
      local = ceEndpoint;
      sessions.push({ peerId: selected.peerId, awsEndpoint: endpoint, ceEndpoint, status });
    }
    peerBindings.push({
      ...selected,
      mac: selected.mac.toLowerCase(),
      subnetId: nic.SubnetId,
      awsGreAddress: config.TransitGatewayAddress,
      ceEndpoint: local,
      awsEndpoints: [...endpoints].sort(),
    });
  }
  const memberships = [];
  for (const tableId of tables) {
    const table = exactly(
      (await read(['ec2', 'describe-transit-gateway-route-tables', '--transit-gateway-route-table-ids', tableId]))
        .TransitGatewayRouteTables,
    );
    if (
      table.TransitGatewayRouteTableId !== tableId ||
      table.TransitGatewayId !== gateway ||
      table.State !== 'available'
    )
      throw Error('Connect table identity differs');
    for (const [operation, key, required, state] of [
      [
        'get-transit-gateway-route-table-associations',
        'Associations',
        routing.associations.includes(tableId),
        'associated',
      ],
      [
        'get-transit-gateway-route-table-propagations',
        'TransitGatewayRouteTablePropagations',
        routing.propagations.includes(tableId),
        'enabled',
      ],
    ]) {
      const found = rows((await read(['ec2', operation, '--transit-gateway-route-table-id', tableId]))[key]);
      for (const id of attachmentIds) {
        const matched = found.filter((r) => r.TransitGatewayAttachmentId === id);
        if (required && (matched.length !== 1 || matched[0].State !== state))
          throw Error('Connect retained association or propagation differs');
        if (!required && matched.some((r) => r.State === state))
          throw Error('Connect unplanned association or propagation');
      }
    }
    if (!routing.propagations.includes(tableId)) continue;
    for (const prefix of prefixes) {
      const merged = new Map();
      for (const filter of ['exact-match', 'subnet-of-match', 'supernet-of-match']) {
        const result = await read([
          'ec2',
          'search-transit-gateway-routes',
          '--transit-gateway-route-table-id',
          tableId,
          '--filters',
          `Name=route-search.${filter},Values=${prefix}`,
        ]);
        if (result.AdditionalRoutesAvailable !== false) throw Error('Partial Connect route search');
        const routes = rows(result.Routes),
          seen = new Set();
        for (const route of routes) {
          const destination = route.DestinationCidrBlock;
          if (
            typeof destination !== 'string' ||
            !overlaps(destination, prefix) ||
            seen.has(destination) ||
            route.Type !== 'propagated' ||
            !['active', 'blackhole'].includes(String(route.State)) ||
            Object.hasOwn(route, 'PrefixListId')
          )
            throw Error('Connect route identity or inventory differs');
          seen.add(destination);
          const targets = rows(route.TransitGatewayAttachments);
          if (
            !targets.length ||
            new Set(targets.map((t) => t.TransitGatewayAttachmentId)).size !== targets.length ||
            targets.some(
              (t) => !attachmentIds.includes(String(t.TransitGatewayAttachmentId)) || t.ResourceType !== 'connect',
            )
          )
            throw Error('Foreign Connect service route');
          const normalized = {
            destination,
            type: route.Type,
            state: route.State,
            attachments: targets.map((t) => String(t.TransitGatewayAttachmentId)).sort(),
          };
          const prior = merged.get(destination);
          if (prior && canonicalSha256(prior) !== canonicalSha256(normalized))
            throw Error('Connect route changed during collection');
          merged.set(destination, normalized);
        }
      }
      const routes = [...merged.values()].sort((a, b) => String(a.destination).localeCompare(String(b.destination)));
      memberships.push({
        tableId,
        prefix,
        routes,
        status:
          routes.length === 0
            ? 'withdrawn'
            : routes.length === 1 && routes[0].destination === prefix && routes[0].state === 'active'
              ? 'active'
              : 'pending',
      });
    }
  }
  const services = {
    schemaVersion: 1,
    kind: 'aws-ce-connect-power-services',
    sourcePlanSha256: base.planSha256,
    engine: base.engine,
    accountId: base.accountId,
    region: base.region,
    transitGatewayId: gateway,
    vpcId: vpc,
    transportAttachmentId: transport,
    transportSubnets: [...transportSubnets].sort(),
    applianceMode: object2(transportObject.Options).ApplianceModeSupport,
    attachments: attachmentBindings,
    peers: peerBindings,
    tables,
    associations: [...routing.associations].sort(),
    propagations: [...routing.propagations].sort(),
    prefixes,
  };
  return {
    services,
    servicesSha256: canonicalSha256(services),
    sessions,
    memberships,
    status: sessions.some((s) => s.status !== 'up')
      ? 'pending'
      : memberships.every((m) => m.status === 'active')
        ? 'active'
        : memberships.every((m) => m.status === 'withdrawn')
          ? 'withdrawn'
          : 'pending',
    traffic: 'unknown',
    freshness: 'unqualified',
    collectedAt: new Date().toISOString(),
  };
}

// plugins/aws/src/ce/whole-site-power-bgp-services.ts
function object3(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Malformed BGP service binding');
  return v;
}
function rows2(v) {
  if (!Array.isArray(v)) throw Error('Incomplete BGP service binding');
  return v.map(object3);
}
async function collectAwsPowerBgpServices(base, values, api, runtime, signal, retained) {
  const cloud = await collectAwsPowerConnectRoutes(base, values, api, signal);
  const sites = siteBindings(base),
    platform = [],
    snapshots = [],
    observations = [];
  if (
    retained &&
    (retained.length !== sites.length || new Set(retained.map((s) => s.binding.siteName)).size !== sites.length)
  )
    throw Error('Retained BGP site inventory differs');
  const actions = base.actions.filter((a) => a.kind === 'tgw-connect-peer-create');
  for (const { site, binding } of sites) {
    const name = `${site.name.slice(0, 55)}-tgw-bgp`,
      snapshot = await runtime.observePowerRouting(binding, 'bgp', name, signal);
    if (
      snapshot.uid !== values[`__XC_ROUTING_${name}__`] ||
      snapshot.kind !== 'bgp' ||
      canonicalSha256(snapshot.binding) !== canonicalSha256(binding) ||
      snapshot.contractFingerprint !== runtime.contract.fingerprint
    )
      throw Error('BGP generated object differs from trusted deployment binding');
    const prior = retained?.find((s) => s.binding.siteName === site.name);
    if (
      prior &&
      (canonicalSha256(prior.binding) !== canonicalSha256(binding) ||
        prior.siteUid !== snapshot.siteUid ||
        prior.bgpName !== name ||
        prior.bgpUid !== snapshot.uid ||
        prior.contractFingerprint !== snapshot.contractFingerprint)
    )
      throw Error('Retained BGP object or site identity differs');
    const original = prior?.originalSpec ?? snapshot.spec;
    if (object3(original.bgp_parameters).asn !== base.intent.routing.customerAsn)
      throw Error('BGP local ASN differs from owning plan');
    const revision = buildAwsBgpPowerPolicyRevision(
      original,
      site.name,
      cloud.services.prefixes,
      'withdraw',
      (kind, spec) => runtime.contract.validateRouting(kind, spec),
    );
    if (
      prior &&
      (canonicalSha256(prior.revision) !== canonicalSha256(revision) ||
        ![canonicalSha256(original), canonicalSha256(revision.bgpSpec)].includes(canonicalSha256(snapshot.spec)))
    )
      throw Error('Retained BGP revision or current spec differs');
    const selected = cloud.services.peers.filter((p) => site.nodeIndexes.includes(Number(p.node)));
    const expectedHardware = site.nodeIndexes.flatMap((node) =>
      base.intent.interfaces.map((i) => ({
        node: `${base.deploymentName}-${node}`,
        role: i.role === 'slo' || i.role === 'sli' ? i.role : 'data',
        mac: values[`__ENI_${node}_${i.index}_MAC__`],
      })),
    );
    const instances = Object.fromEntries(
      site.nodeIndexes.map((node) => [`${base.deploymentName}-${node}`, values[`__INSTANCE_${node}__`]]),
    );
    const hardware = await runtime.observeRegisteredDevices(binding, instances, expectedHardware, signal);
    if (hardware.status !== 'observed' || hardware.interfaces.length !== expectedHardware.length)
      throw Error('BGP registration hardware identity unavailable');
    const sessions = [],
      connectors = [];
    for (const peer of selected) {
      const actionIndex = actions.findIndex((a) => values[a.capture?.placeholder ?? ''] === peer.peerId),
        connectorName = `${base.deploymentName.slice(0, 24)}-gre-${actionIndex + 1}`;
      const connector = await runtime.observePowerRouting(binding, 'external_connector', connectorName, signal);
      if (
        actionIndex < 0 ||
        connector.siteUid !== snapshot.siteUid ||
        connector.uid !== values[`__XC_ROUTING_${connectorName}__`] ||
        connector.kind !== 'external_connector' ||
        canonicalSha256(connector.binding) !== canonicalSha256(binding) ||
        connector.contractFingerprint !== snapshot.contractFingerprint
      )
        throw Error('BGP connector generated identity differs');
      const ref = object3(connector.spec.ce_site_reference),
        gre = object3(object3(connector.spec.gre).gre_parameters),
        endpoints = rows2(gre.tunnel_eps);
      const node = `${base.deploymentName}-${peer.node}`,
        devices = hardware.interfaces.filter(
          (i) =>
            i.node === node && i.mac === peer.mac && i.role === (Number(peer.interfaceIndex) === 0 ? 'slo' : 'sli'),
        );
      if (
        ref.name !== site.name ||
        ref.namespace !== 'system' ||
        endpoints.length !== 1 ||
        devices.length !== 1 ||
        endpoints[0].node !== node ||
        endpoints[0].interface !== devices[0].device ||
        endpoints[0].local_tunnel_ip !== `${peer.ceEndpoint}/29` ||
        !peer.awsEndpoints.some((ip) => endpoints[0].remote_tunnel_ip === `${ip}/29`) ||
        object3(gre.peer_ip_address).addr !== peer.awsGreAddress ||
        !Object.hasOwn(gre, 'site_local_inside_network')
      )
        throw Error('BGP connector physical node/device/MAC/tunnel join differs');
      connectors.push({ name: connectorName, uid: connector.uid, spec: connector.spec });
      for (const address of peer.awsEndpoints)
        sessions.push({ node, interfaceName: `ves-io-external-connector-${connectorName}`, peerAddress: address });
    }
    const peers = rows2(original.peers);
    if (
      peers.length !== sessions.length ||
      sessions.some(
        (s) =>
          peers.filter((p) => {
            const e = object3(p.external),
              ref = object3(e.interface);
            return (
              e.address === s.peerAddress &&
              e.asn === base.intent.routing.transitGatewayAsn &&
              ref.name === s.interfaceName &&
              ref.namespace === 'system'
            );
          }).length !== 1,
      )
    )
      throw Error('BGP peer spec and cloud endpoint inventory differ');
    let tables = prior?.tables;
    if (!tables) {
      const observed = await runtime.observeBgpRoutes(binding, signal);
      if (
        observed.status !== 'observed' ||
        canonicalSha256(observed.owner) !== canonicalSha256(binding.owner) ||
        observed.siteName !== binding.siteName ||
        observed.contractFingerprint !== snapshot.contractFingerprint
      )
        throw Error('BGP route discovery binding differs');
      tables = binding.nodes.map((node) => {
        const matches = observed.nodes
          .filter((n) => n.node === node)
          .flatMap((n) =>
            n.routingInstances.flatMap((ri) =>
              ri.tables
                .filter((t) => cloud.services.prefixes.every((p) => t.exported.includes(p)))
                .map((t) => ({ node, routingInstance: ri.name, table: t.name })),
            ),
          );
        if (matches.length !== 1) throw Error('BGP service routing instance/table discovery missing or ambiguous');
        return matches[0];
      });
    }
    const current = {
      binding,
      siteUid: snapshot.siteUid,
      bgpName: name,
      bgpUid: snapshot.uid,
      contractFingerprint: snapshot.contractFingerprint,
      originalSpec: original,
      connectors,
      sessions,
      tables,
      revision,
    };
    if (prior && canonicalSha256(current) !== canonicalSha256(prior))
      throw Error('BGP retained service inventory changed');
    const observation = await runtime.observeBgpServiceMembership(
      binding,
      snapshot.siteUid,
      sessions,
      tables,
      cloud.services.prefixes,
      signal,
    );
    if (
      canonicalSha256(observation.owner) !== canonicalSha256(binding.owner) ||
      observation.siteName !== binding.siteName ||
      observation.siteUid !== snapshot.siteUid ||
      observation.contractFingerprint !== snapshot.contractFingerprint
    )
      throw Error('BGP service observation binding differs');
    const final = await runtime.observePowerRouting(binding, 'bgp', name, signal);
    if (
      final.uid !== snapshot.uid ||
      final.siteUid !== snapshot.siteUid ||
      final.resourceVersion !== snapshot.resourceVersion ||
      canonicalSha256(final.spec) !== canonicalSha256(snapshot.spec)
    )
      throw Error('BGP object changed during service collection');
    platform.push(current);
    snapshots.push(snapshot);
    observations.push(observation);
  }
  if (new Set(platform.map((s) => s.revision.policy.name)).size !== platform.length)
    throw Error('BGP maintenance policy names collide');
  const services = { schemaVersion: 1, kind: 'aws-ce-bgp-power-services', cloud: cloud.services, platform };
  const statuses = [cloud.status, ...observations.map((o) => o.status)];
  return {
    services,
    servicesSha256: canonicalSha256(services),
    snapshots,
    cloud,
    observations,
    status: statuses.every((s) => s === 'active')
      ? 'active'
      : statuses.every((s) => s === 'withdrawn')
        ? 'withdrawn'
        : 'pending',
    freshness: 'unqualified',
    traffic: 'unknown',
    collectedAt: new Date().toISOString(),
  };
}

// plugins/aws/src/ce/bgp-power-controller.ts
async function optional2(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function context(base, plan, effect, storage) {
  verifyAwsWholeSitePowerPlan(base, plan);
  await storage.verify();
  if (
    !['native', 'terraform'].includes(base.engine) ||
    base.topology.nodeCount !== 1 ||
    plan.bindings.nodes.length !== 1 ||
    plan.operation !== (effect === 'withdraw' ? 'stop' : 'start') ||
    canonicalSha256(storage.owner) !== canonicalSha256(plan.bindings.owner) ||
    canonicalSha256(await storage.read(`${plan.planId}.json`)) !== canonicalSha256(plan)
  )
    throw Error('Native BGP owner or immutable plan differs');
  const cp = await storage.read(`${plan.planId}-checkpoint.json`);
  const attempt = cp.pending;
  if (
    cp.schemaVersion !== 1 ||
    cp.planSha256 !== plan.planSha256 ||
    cp.bindingsSha256 !== plan.bindingsSha256 ||
    cp.step !== (effect === 'withdraw' ? 1 : effect === 'restore' ? 3 : 5) ||
    cp.complete !== false ||
    !attempt ||
    attempt.effect !== effect ||
    attempt.requestSha256 !== canonicalSha256({ planSha256: plan.planSha256, effect }) ||
    canonicalSha256(cp.attempts?.[effect]) !== canonicalSha256(attempt) ||
    !Number.isFinite(Date.parse(attempt.originalAttemptAt)) ||
    Date.parse(attempt.originalAttemptAt) > Date.now()
  )
    throw Error('Native BGP original attempt differs');
  return {
    schemaVersion: 1,
    engine: base.engine,
    planSha256: plan.planSha256,
    bindingsSha256: plan.bindingsSha256,
    servicesSha256: powerServiceComponentSha256(base, plan.bindings, 'bgp'),
    attempt,
  };
}
function filename(plan, effect, suffix) {
  return `${plan.planId}-${effect}-${plan.engine}-bgp-${suffix}.json`;
}
function validateAwsBgpPowerPreparation(prep, marker) {
  if (
    canonicalSha256(prep.marker) !== canonicalSha256(marker) ||
    prep.servicesSha256 !== marker.servicesSha256 ||
    canonicalSha256(prep.services) !== marker.servicesSha256 ||
    prep.services.platform.length !== 1 ||
    prep.snapshots.length !== 1 ||
    prep.policies.length !== 1
  )
    throw Error('Native BGP retained preparation differs');
  const s = prep.services.platform[0],
    snapshot = prep.snapshots[0],
    policy = prep.policies[0];
  if (
    snapshot.kind !== 'bgp' ||
    canonicalSha256(snapshot.binding) !== canonicalSha256(s.binding) ||
    snapshot.name !== s.bgpName ||
    snapshot.uid !== s.bgpUid ||
    snapshot.siteUid !== s.siteUid ||
    snapshot.contractFingerprint !== s.contractFingerprint ||
    !snapshot.resourceVersion ||
    (marker.attempt.effect === 'withdraw' &&
      policy.attemptId !== canonicalSha256({ marker, siteUid: s.siteUid, policy: s.revision.policy })) ||
    canonicalSha256(snapshot.spec) !==
      canonicalSha256(marker.attempt.effect === 'withdraw' ? s.originalSpec : s.revision.bgpSpec) ||
    canonicalSha256(policy.binding) !== canonicalSha256(s.binding) ||
    policy.siteUid !== s.siteUid ||
    policy.name !== s.revision.policy.name ||
    canonicalSha256(policy.spec) !== canonicalSha256(s.revision.policy.spec) ||
    policy.contractFingerprint !== s.contractFingerprint ||
    !/^[a-f0-9]{64}$/.test(policy.attemptId)
  )
    throw Error('Native BGP prepared snapshot or policy differs');
}
async function observe(base, plan, values, api, runtime, prep, signal) {
  const observed = await collectAwsPowerBgpServices(base, values, api, runtime, signal, prep?.services.platform);
  if (observed.servicesSha256 !== powerServiceComponentSha256(base, plan.bindings, 'bgp'))
    throw Error('Native BGP service identity differs');
  return observed;
}
function policyDispatch(intent) {
  return { ...intent, kind: 'bgp_routing_policy', phase: 'power-policy-create-dispatch' };
}
function replacementDispatch(snapshot) {
  return {
    kind: snapshot.kind,
    name: snapshot.name,
    uid: snapshot.uid,
    siteUid: snapshot.siteUid,
    resourceVersion: snapshot.resourceVersion,
    contractFingerprint: snapshot.contractFingerprint,
    phase: 'power-routing-dispatch',
  };
}
async function policy(storage, plan, prep, runtime, submit, signal) {
  const intent = prep.policies[0],
    name = filename(plan, 'withdraw', 'policy-dispatch'),
    expected = { marker: prep.marker, intent, record: policyDispatch(intent) },
    saved = await optional2(storage, name);
  if (saved !== undefined && canonicalSha256(saved) !== canonicalSha256(expected))
    throw Error('Native BGP policy dispatch differs');
  const createPolicy = (
    plan.engine === 'native' ? runtime.createPowerRoutingPolicy : runtime.createTerraformPowerRoutingPolicy
  ).bind(runtime);
  const result = await createPolicy(
    intent,
    saved !== undefined || !submit ? 'submitted' : 'not-submitted',
    async (record) => {
      if (canonicalSha256(record) !== canonicalSha256(expected.record))
        throw Error('Native BGP policy callback differs');
      await storage.write(name, expected);
    },
    signal,
  );
  if (result.status !== 'observed') return;
  const { status: _status, collectedAt: _time, kind: _kind, uid: _uid, resourceVersion: _rv, ...actualIntent } = result;
  if (canonicalSha256(actualIntent) !== canonicalSha256(intent) || !result.uid || !result.resourceVersion)
    throw Error('Native BGP policy readback differs');
  const receiptName = filename(plan, 'withdraw', 'policy-created'),
    retained = await optional2(storage, receiptName);
  if (
    retained &&
    (retained.uid !== result.uid ||
      retained.resourceVersion !== result.resourceVersion ||
      canonicalSha256({ ...retained, collectedAt: '' }) !== canonicalSha256({ ...result, collectedAt: '' }))
  )
    throw Error('Native BGP policy created identity changed');
  if (!retained) await storage.write(receiptName, result);
  return retained ?? result;
}
async function retainedStop(base, plan, storage) {
  if (!plan.maintenance) throw Error('Native BGP restoration maintenance missing');
  const id = `aws-ce-power-${plan.maintenance.stopPlanSha256.slice(0, 24)}`;
  const stop = await storage.read(`${id}.json`);
  verifyAwsWholeSitePowerPlan(base, stop);
  const prep = await storage.read(filename(stop, 'withdraw', 'preparation'));
  const outcome = await storage.read(filename(stop, 'withdraw', 'outcome'));
  validateAwsBgpPowerPreparation(prep, outcome.marker);
  const checkpoint = await storage.read(`${stop.planId}-checkpoint.json`);
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.planSha256 !== stop.planSha256 ||
    checkpoint.bindingsSha256 !== stop.bindingsSha256 ||
    canonicalSha256(checkpoint.attempts?.withdraw) !== canonicalSha256(prep.marker.attempt)
  )
    throw Error('Native BGP retained original withdrawal attempt differs');
  if (
    stop.operation !== 'stop' ||
    stop.planSha256 !== plan.maintenance.stopPlanSha256 ||
    stop.transitionId !== plan.transitionId ||
    stop.bindingsSha256 !== plan.bindingsSha256 ||
    outcome.marker.planSha256 !== stop.planSha256 ||
    outcome.marker.bindingsSha256 !== stop.bindingsSha256 ||
    outcome.marker.attempt.effect !== 'withdraw' ||
    outcome.observed.status !== 'withdrawn' ||
    outcome.observed.servicesSha256 !== powerServiceComponentSha256(base, plan.bindings, 'bgp') ||
    canonicalSha256(outcome.observed.services) !== powerServiceComponentSha256(base, plan.bindings, 'bgp') ||
    canonicalSha256(outcome.observed.snapshots[0].spec) !== canonicalSha256(prep.services.platform[0].revision.bgpSpec)
  )
    throw Error('Native BGP completed withdrawal differs');
  const created = await storage.read(filename(stop, 'withdraw', 'policy-created'));
  const { status, collectedAt: _time, kind, uid, resourceVersion, ...intent } = created;
  if (
    status !== 'observed' ||
    kind !== 'bgp_routing_policy' ||
    !uid ||
    !resourceVersion ||
    canonicalSha256(intent) !== canonicalSha256(prep.policies[0])
  )
    throw Error('Native BGP retained created policy differs');
  const creation = await storage.read(filename(stop, 'withdraw', 'policy-dispatch'));
  if (
    canonicalSha256(creation) !==
    canonicalSha256({ marker: prep.marker, intent: prep.policies[0], record: policyDispatch(prep.policies[0]) })
  )
    throw Error('Native BGP retained creation dispatch differs');
  const dispatch = await storage.read(filename(stop, 'withdraw', 'replacement-dispatch'));
  if (
    canonicalSha256(dispatch) !==
    canonicalSha256({
      marker: prep.marker,
      snapshot: prep.snapshots[0],
      desired: prep.services.platform[0].revision.bgpSpec,
      policy: created,
      record: replacementDispatch(prep.snapshots[0]),
    })
  )
    throw Error('Native BGP retained replacement differs');
  return { stop, prep };
}
async function assertNoDispatchWithoutPreparation(storage, plan, effect) {
  for (const suffix of [
    'replacement-dispatch',
    'outcome',
    ...(effect === 'withdraw' ? ['policy-dispatch', 'policy-created'] : []),
  ])
    if ((await optional2(storage, filename(plan, effect, suffix))) !== undefined)
      throw Error('Native BGP submitted attempt preparation missing');
}
async function prepare(base, plan, effect, marker, storage, values, api, runtime, signal) {
  const saved = await optional2(storage, filename(plan, effect, 'preparation'));
  if (!saved) await assertNoDispatchWithoutPreparation(storage, plan, effect);
  const prior = effect === 'restore' ? await retainedStop(base, plan, storage) : undefined;
  if (saved) {
    validateAwsBgpPowerPreparation(saved, marker);
    return { prep: saved, prior };
  }
  const observed = await observe(base, plan, values, api, runtime, prior?.prep, signal);
  if (observed.status !== (effect === 'withdraw' ? 'active' : 'withdrawn'))
    throw Error('Native BGP prerequisite pending');
  const policies =
    prior?.prep.policies ??
    observed.services.platform.map((s) => ({
      binding: s.binding,
      siteUid: s.siteUid,
      name: s.revision.policy.name,
      spec: s.revision.policy.spec,
      contractFingerprint: s.contractFingerprint,
      attemptId: canonicalSha256({ marker, siteUid: s.siteUid, policy: s.revision.policy }),
    }));
  const prep = {
    marker,
    services: observed.services,
    servicesSha256: observed.servicesSha256,
    snapshots: observed.snapshots,
    policies,
  };
  validateAwsBgpPowerPreparation(prep, marker);
  signal?.throwIfAborted();
  await storage.write(filename(plan, effect, 'preparation'), prep);
  return { prep, prior };
}
async function dispatchAwsNativeBgpPower(base, plan, authorization, effect, storage, values, api, runtime, signal) {
  if (base.engine !== 'native') throw Error('BGP owning engine differs');
  return dispatchAwsOwnedBgpPower(base, plan, authorization, effect, storage, values, api, runtime, signal);
}
async function dispatchAwsTerraformBgpPower(base, plan, authorization, effect, storage, values, api, runtime, signal) {
  if (base.engine !== 'terraform') throw Error('BGP owning engine differs');
  return dispatchAwsOwnedBgpPower(base, plan, authorization, effect, storage, values, api, runtime, signal);
}
async function dispatchAwsOwnedBgpPower(base, plan, authorization, effect, storage, values, api, runtime, signal) {
  if (authorization !== plan.planSha256) throw Error('Native BGP authorization differs');
  const release = await acquireProcessLock(`${storage.directory}/.native-bgp-power-lock`);
  try {
    const marker = await context(base, plan, effect, storage),
      { prep, prior } = await prepare(base, plan, effect, marker, storage, values, api, runtime, signal);
    const created = await policy(
      storage,
      prior?.stop ?? plan,
      prior?.prep ?? prep,
      runtime,
      effect === 'withdraw',
      signal,
    );
    if (!created) throw Error('Native BGP policy creation pending; reconcile original attempt');
    const current = await observe(base, plan, values, api, runtime, prep, signal),
      snapshot = prep.snapshots[0],
      desired =
        effect === 'withdraw' ? prep.services.platform[0].revision.bgpSpec : prep.services.platform[0].originalSpec,
      expected = { marker, snapshot, desired, policy: created, record: replacementDispatch(snapshot) },
      name = filename(plan, effect, 'replacement-dispatch'),
      saved = await optional2(storage, name);
    if (saved) expected.policy = saved.policy;
    if (
      saved &&
      canonicalSha256({ ...saved, policy: { ...saved.policy, collectedAt: '' } }) !==
        canonicalSha256({ ...expected, policy: { ...created, collectedAt: '' } })
    )
      throw Error('Native BGP replacement dispatch differs');
    if (saved) {
      if (canonicalSha256(current.snapshots[0].spec) !== canonicalSha256(desired))
        throw Error('Native BGP submitted replacement pending; reconcile original attempt');
      return;
    }
    if (
      canonicalSha256(current.snapshots[0].spec) !== canonicalSha256(snapshot.spec) ||
      current.snapshots[0].resourceVersion !== snapshot.resourceVersion
    )
      throw Error('Native BGP original revision changed');
    await runtime.replacePowerRouting(
      { ...snapshot, kind: 'bgp' },
      desired,
      async (record) => {
        if (canonicalSha256(record) !== canonicalSha256(expected.record))
          throw Error('Native BGP replacement callback differs');
        await storage.write(name, expected);
      },
      signal,
    );
  } finally {
    await release();
  }
}
async function reconcileAwsNativeBgpPower(
  base,
  plan,
  effect,
  originalAttemptAt,
  storage,
  values,
  api,
  runtime,
  signal,
) {
  if (base.engine !== 'native') throw Error('BGP owning engine differs');
  return reconcileAwsOwnedBgpPower(base, plan, effect, originalAttemptAt, storage, values, api, runtime, signal);
}
async function reconcileAwsTerraformBgpPower(
  base,
  plan,
  effect,
  originalAttemptAt,
  storage,
  values,
  api,
  runtime,
  signal,
) {
  if (base.engine !== 'terraform') throw Error('BGP owning engine differs');
  return reconcileAwsOwnedBgpPower(base, plan, effect, originalAttemptAt, storage, values, api, runtime, signal);
}
async function reconcileAwsOwnedBgpPower(base, plan, effect, originalAttemptAt, storage, values, api, runtime, signal) {
  const release = await acquireProcessLock(`${storage.directory}/.native-bgp-power-lock`);
  try {
    const marker = await context(base, plan, effect, storage);
    if (marker.attempt.originalAttemptAt !== originalAttemptAt) throw Error('Native BGP original attempt differs');
    const prep = await optional2(storage, filename(plan, effect, 'preparation'));
    if (!prep) {
      await assertNoDispatchWithoutPreparation(storage, plan, effect);
      return 'not-submitted';
    }
    validateAwsBgpPowerPreparation(prep, marker);
    const prior = effect === 'restore' ? await retainedStop(base, plan, storage) : undefined;
    const created = await policy(storage, prior?.stop ?? plan, prior?.prep ?? prep, runtime, false, signal);
    const dispatch = await optional2(storage, filename(plan, effect, 'replacement-dispatch'));
    if (!dispatch) {
      const submitted = await optional2(storage, filename(prior?.stop ?? plan, 'withdraw', 'policy-dispatch'));
      return submitted && !created ? 'pending' : 'not-submitted';
    }
    if (!created) throw Error('Native BGP retained policy missing');
    const desired =
      effect === 'withdraw' ? prep.services.platform[0].revision.bgpSpec : prep.services.platform[0].originalSpec;
    if (
      canonicalSha256({ ...dispatch, policy: { ...dispatch.policy, collectedAt: '' } }) !==
      canonicalSha256({
        marker,
        snapshot: prep.snapshots[0],
        desired,
        policy: { ...created, collectedAt: '' },
        record: replacementDispatch(prep.snapshots[0]),
      })
    )
      throw Error('Native BGP replacement dispatch differs');
    const observed = await observe(base, plan, values, api, runtime, prep, signal);
    if (
      canonicalSha256(observed.snapshots[0].spec) !== canonicalSha256(desired) ||
      observed.status !== (effect === 'withdraw' ? 'withdrawn' : 'active')
    )
      return 'pending';
    await storage.write(filename(plan, effect, 'outcome'), { marker, observed, collectedAt: new Date().toISOString() });
    return 'completed';
  } finally {
    await release();
  }
}
async function retireAwsNativeBgpPowerPolicy(base, plan, authorization, storage, values, api, runtime, signal) {
  if (base.engine !== 'native') throw Error('BGP owning engine differs');
  return retireAwsOwnedBgpPowerPolicy(base, plan, authorization, storage, values, api, runtime, signal);
}
async function retireAwsTerraformBgpPowerPolicy(base, plan, authorization, storage, values, api, runtime, signal) {
  if (base.engine !== 'terraform') throw Error('BGP owning engine differs');
  return retireAwsOwnedBgpPowerPolicy(base, plan, authorization, storage, values, api, runtime, signal);
}
async function retireAwsOwnedBgpPowerPolicy(base, plan, authorization, storage, values, api, runtime, signal) {
  if (authorization !== plan.planSha256) throw Error('Native BGP retirement authorization differs');
  const release = await acquireProcessLock(`${storage.directory}/.native-bgp-power-lock`);
  try {
    const marker = await context(base, plan, 'release', storage),
      prior = await retainedStop(base, plan, storage);
    if (
      canonicalSha256(await storage.read(`${prior.stop.planId}-maintenance.json`)) !== canonicalSha256(plan.maintenance)
    )
      throw Error('Native BGP retained maintenance differs');
    const cp = await storage.read(`${plan.planId}-checkpoint.json`);
    const currentGate = await storage.read(`${plan.planId}-restored-last-evidence.json`);
    if (
      !cp.evidence?.restored ||
      !evidencePasses(plan, 'restored', cp.evidence.restored, Date.now()) ||
      !evidencePasses(plan, 'restored', currentGate, Date.now())
    )
      throw Error('Native BGP restored gate unavailable');
    const prep = await storage.read(filename(plan, 'restore', 'preparation'));
    const outcome = await storage.read(filename(plan, 'restore', 'outcome'));
    validateAwsBgpPowerPreparation(prep, outcome.marker);
    if (
      outcome.marker.planSha256 !== plan.planSha256 ||
      outcome.marker.bindingsSha256 !== plan.bindingsSha256 ||
      outcome.marker.attempt.effect !== 'restore' ||
      outcome.observed.status !== 'active' ||
      outcome.observed.servicesSha256 !== powerServiceComponentSha256(base, plan.bindings, 'bgp') ||
      canonicalSha256(outcome.observed.services) !== powerServiceComponentSha256(base, plan.bindings, 'bgp')
    )
      throw Error('Native BGP retained restored outcome differs');
    const created = await storage.read(filename(prior.stop, 'withdraw', 'policy-created'));
    const restoredDispatch = await storage.read(filename(plan, 'restore', 'replacement-dispatch'));
    if (
      canonicalSha256(restoredDispatch) !==
      canonicalSha256({
        marker: prep.marker,
        snapshot: prep.snapshots[0],
        desired: prep.services.platform[0].originalSpec,
        policy: created,
        record: replacementDispatch(prep.snapshots[0]),
      })
    )
      throw Error('Native BGP retained restoration dispatch differs');
    const observed = await observe(base, plan, values, api, runtime, prep, signal);
    if (
      observed.status !== 'active' ||
      canonicalSha256(observed.snapshots[0].spec) !== canonicalSha256(prep.services.platform[0].originalSpec)
    )
      return 'pending';
    const { status: _status, collectedAt: _time, kind: _kind, ...snapshot } = created;
    const record = { ...snapshot, kind: 'bgp_routing_policy', phase: 'power-policy-delete-dispatch' },
      expected = { marker, snapshot, record },
      name = filename(plan, 'restore', 'policy-delete-dispatch'),
      saved = await optional2(storage, name);
    if (saved !== undefined && canonicalSha256(saved) !== canonicalSha256(expected))
      throw Error('Native BGP retirement dispatch differs');
    const deletePolicy = (
      plan.engine === 'native' ? runtime.deletePowerRoutingPolicy : runtime.deleteTerraformPowerRoutingPolicy
    ).bind(runtime);
    const result = await deletePolicy(
      snapshot,
      saved === undefined ? 'not-submitted' : 'submitted',
      async (actual) => {
        if (canonicalSha256(actual) !== canonicalSha256(record)) throw Error('Native BGP retirement callback differs');
        await storage.write(name, expected);
      },
      signal,
    );
    if (
      canonicalSha256({ ...result, status: undefined, collectedAt: undefined }) !==
      canonicalSha256({ ...snapshot, status: undefined, collectedAt: undefined })
    )
      throw Error('Native BGP retirement readback differs');
    await storage.write(filename(plan, 'restore', 'policy-retirement-outcome'), { marker, result, observed });
    return result.status === 'deleted' ? 'completed' : 'pending';
  } finally {
    await release();
  }
}

// plugins/aws/src/ce/terraform-direct-power.ts
import { createHash as createHash2 } from 'node:crypto';

var hash2 = (value) => createHash2('sha256').update(value).digest('hex');
function object4(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Malformed Terraform direct service configuration');
  return value;
}
function expectedRoutes(base, services) {
  verifyAwsCePlan(base);
  const requested = [...base.intent.routes].sort(
    (a, b) => a.routeTableId.localeCompare(b.routeTableId) || a.destinationCidr.localeCompare(b.destinationCidr),
  );
  if (
    base.engine !== 'terraform' ||
    base.topology.nodeCount !== 1 ||
    base.intent.routing.profile !== 'direct-eni' ||
    services.schemaVersion !== 1 ||
    services.kind !== 'aws-ce-direct-route-power-services' ||
    services.engine !== base.engine ||
    services.sourcePlanSha256 !== base.planSha256 ||
    services.accountId !== base.accountId ||
    services.region !== base.region ||
    !/^i-[a-f0-9]{8,17}$/.test(services.instanceId) ||
    !/^eni-[a-f0-9]{8,17}$/.test(services.sloNetworkInterfaceId) ||
    !/^subnet-[a-f0-9]{8,17}$/.test(String(services.sloSubnetId)) ||
    !requested.length ||
    canonicalSha256(
      services.routes.map((r) => ({ routeTableId: r.routeTableId, destinationCidr: r.destinationCidr, node: 1 })),
    ) !== canonicalSha256(requested) ||
    services.routes.some(
      (r) =>
        !/^eni-[a-f0-9]{8,17}$/.test(r.networkInterfaceId) ||
        r.networkInterfaceId === services.sloNetworkInterfaceId ||
        !/^rtb-[a-f0-9]{8,17}$/.test(r.routeTableId) ||
        !base.intent.brownfield.routeTableIds.includes(r.routeTableId),
    ) ||
    new Set(services.routes.map((r) => r.networkInterfaceId)).size !== 1 ||
    new Set(services.routes.map((r) => `${r.routeTableId}/${r.destinationCidr}`)).size !== requested.length
  )
    throw Error('Terraform direct service scope differs');
  return Object.fromEntries(
    services.routes.map((route, index) => [
      `direct_${index}`,
      {
        route_table_id: route.routeTableId,
        destination_cidr_block: route.destinationCidr,
        network_interface_id: route.networkInterfaceId,
      },
    ]),
  );
}
function reviseAwsTerraformDirectServiceRoutes(base, services, configuration, effect, retained) {
  const routes = expectedRoutes(base, services);
  const next = object4(JSON.parse(configuration));
  const terraform = object4(next.terraform),
    aws = object4(object4(terraform.required_providers).aws),
    provider = object4(object4(next.provider).aws);
  if (
    terraform.required_version !== `= ${AWS_CE_TERRAFORM_VERSION}` ||
    aws.source !== 'hashicorp/aws' ||
    aws.version !== `= ${AWS_CE_TERRAFORM_PROVIDER_VERSION}` ||
    provider.region !== base.region ||
    canonicalSha256(provider.allowed_account_ids) !== canonicalSha256([base.accountId]) ||
    terraform.backend ||
    terraform.cloud ||
    next.import ||
    next.removed
  )
    throw Error('Terraform direct service provider or lifecycle differs');
  const resources = object4(next.resource);
  const configured = resources.aws_route === undefined ? {} : object4(resources.aws_route);
  if (Object.keys(configured).some((name) => name.startsWith('direct_') && !Object.hasOwn(routes, name)))
    throw Error('Terraform direct service route cardinality differs');
  if (
    effect === 'restore' &&
    (retained?.effect !== 'withdraw' ||
      retained.servicesSha256 !== canonicalSha256(services) ||
      hash2(retained.configuration) !== retained.afterSha256 ||
      canonicalSha256(retained.routes) !== canonicalSha256(routes))
  )
    throw Error('Terraform direct restoration requires retained withdrawal');
  if (!['withdraw', 'restore'].includes(effect)) throw Error('Terraform direct effect differs');
  for (const [name, route] of Object.entries(routes)) {
    if (effect === 'withdraw') {
      if (canonicalSha256(configured[name]) !== canonicalSha256(route))
        throw Error('Terraform direct service route identity differs');
      delete configured[name];
    } else {
      if (Object.hasOwn(configured, name)) throw Error('Terraform direct restored resource already exists');
      configured[name] = structuredClone(route);
    }
  }
  if (Object.keys(configured).length) resources.aws_route = configured;
  else delete resources.aws_route;
  const result = JSON.stringify(next);
  return {
    configuration: result,
    beforeSha256: hash2(configuration),
    afterSha256: hash2(result),
    servicesSha256: canonicalSha256(services),
    effect,
    routes,
  };
}
function validateAwsTerraformDirectServiceReceipt(base, services, revision, receipt, before, after) {
  const routes = expectedRoutes(base, services);
  if (
    canonicalSha256(revision.routes) !== canonicalSha256(routes) ||
    revision.servicesSha256 !== canonicalSha256(services) ||
    hash2(revision.configuration) !== revision.afterSha256 ||
    !['withdraw', 'restore'].includes(revision.effect) ||
    receipt.schemaVersion !== 1 ||
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== base.deploymentName ||
    receipt.backendIdentity !== `local:${base.deploymentName}` ||
    receipt.configurationSha256 !== revision.afterSha256 ||
    receipt.providerLockSha256 !== AWS_CE_PROVIDER_LOCK_SHA256 ||
    !/^[a-f0-9]{64}$/.test(receipt.planSha256) ||
    receipt.operation ||
    receipt.actionInvocations?.length ||
    receipt.noChanges ||
    new Set(receipt.changes.map((c) => c.address)).size !== receipt.changes.length
  )
    throw Error('Terraform direct service saved-plan scope differs');
  const addresses = Object.keys(routes)
    .map((n) => `aws_route.${n}`)
    .sort();
  const mutations = receipt.changes.filter((c) => canonicalSha256(c.actions) !== canonicalSha256(['no-op']));
  if (
    canonicalSha256(mutations.map((c) => c.address).sort()) !== canonicalSha256(addresses) ||
    mutations.some(
      (c) =>
        c.type !== 'aws_route' ||
        canonicalSha256(c.actions) !== canonicalSha256([revision.effect === 'withdraw' ? 'delete' : 'create']),
    )
  )
    throw Error('Terraform direct service unrelated or replacement mutation');
  if (
    canonicalSha256(Object.keys(before).sort()) !== canonicalSha256(addresses) ||
    canonicalSha256(Object.keys(after).sort()) !== canonicalSha256(addresses)
  )
    throw Error('Terraform direct service projection incomplete');
  for (const address of addresses) {
    if (
      canonicalSha256(revision.effect === 'withdraw' ? before[address] : after[address]) !==
        canonicalSha256(routes[address.slice('aws_route.'.length)]) ||
      (revision.effect === 'withdraw' ? after[address] : before[address]) !== null
    )
      throw Error('Terraform direct service resolved identity differs');
  }
}

// plugins/aws/src/ce/terraform-static-power.ts
import { createHash as createHash3 } from 'node:crypto';

var hash3 = (value) => createHash3('sha256').update(value).digest('hex');
function object5(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Malformed Terraform static service configuration');
  return value;
}
function scope(base, services) {
  verifyAwsCePlan(base);
  if (
    base.engine !== 'terraform' ||
    services.engine !== base.engine ||
    services.sourcePlanSha256 !== base.planSha256 ||
    services.accountId !== base.accountId ||
    services.region !== base.region ||
    services.transitGatewayId !== base.intent.routing.transitGatewayId ||
    services.routeTableId !== base.intent.routing.transitGatewayRouteTableId ||
    canonicalSha256(services.destinationCidrs) !== canonicalSha256([...base.intent.routing.destinationCidrs].sort()) ||
    !/^tgw-attach-[a-f0-9]{8,17}$/.test(services.transportAttachmentId) ||
    base.intent.routing.profile !== 'tgw-static'
  )
    throw Error('Terraform static service scope differs');
}
function expectedRoutes2(base, services, routes) {
  if (Object.keys(routes).length !== base.intent.routing.destinationCidrs.length)
    throw Error('Terraform static service route cardinality differs');
  for (const [index, destination] of base.intent.routing.destinationCidrs.entries()) {
    const route = object5(routes[`static_${index}`]);
    if (
      canonicalSha256(route) !==
      canonicalSha256({
        destination_cidr_block: destination,
        transit_gateway_attachment_id: `\${aws_ec2_transit_gateway_vpc_attachment.transport.id}`,
        transit_gateway_route_table_id: services.routeTableId,
      })
    )
      throw Error('Terraform static service route identity differs');
  }
}
function reviseAwsTerraformStaticServiceRoutes(base, services, configuration, effect, retained) {
  scope(base, services);
  const after = object5(JSON.parse(configuration));
  const terraform = object5(after.terraform),
    aws = object5(object5(terraform.required_providers).aws),
    provider = object5(object5(after.provider).aws);
  if (
    terraform.required_version !== `= ${AWS_CE_TERRAFORM_VERSION}` ||
    aws.source !== 'hashicorp/aws' ||
    aws.version !== `= ${AWS_CE_TERRAFORM_PROVIDER_VERSION}` ||
    provider.region !== base.region ||
    canonicalSha256(provider.allowed_account_ids) !== canonicalSha256([base.accountId]) ||
    terraform.backend ||
    terraform.cloud
  )
    throw Error('Terraform static service provider differs');
  const resources = object5(after.resource);
  let routes;
  if (effect === 'withdraw') {
    routes = object5(resources.aws_ec2_transit_gateway_route);
    expectedRoutes2(base, services, routes);
    delete resources.aws_ec2_transit_gateway_route;
  } else if (effect === 'restore') {
    if (
      retained?.effect !== 'withdraw' ||
      retained.servicesSha256 !== canonicalSha256(services) ||
      hash3(retained.configuration) !== retained.afterSha256 ||
      resources.aws_ec2_transit_gateway_route !== undefined
    )
      throw Error('Terraform static restoration requires retained withdrawal');
    routes = object5(retained.routes);
    expectedRoutes2(base, services, routes);
    resources.aws_ec2_transit_gateway_route = structuredClone(routes);
  } else throw Error('Terraform static service effect differs');
  const next = JSON.stringify(after);
  return {
    configuration: next,
    beforeSha256: hash3(configuration),
    afterSha256: hash3(next),
    servicesSha256: canonicalSha256(services),
    effect,
    routes: structuredClone(routes),
  };
}
function validateAwsTerraformStaticServiceReceipt(base, services, revision, receipt, before, after) {
  scope(base, services);
  expectedRoutes2(base, services, revision.routes);
  if (
    revision.servicesSha256 !== canonicalSha256(services) ||
    revision.afterSha256 !== hash3(revision.configuration) ||
    !['withdraw', 'restore'].includes(revision.effect) ||
    receipt.schemaVersion !== 1 ||
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== base.deploymentName ||
    receipt.backendIdentity !== `local:${base.deploymentName}` ||
    receipt.configurationSha256 !== revision.afterSha256 ||
    receipt.providerLockSha256 !== AWS_CE_PROVIDER_LOCK_SHA256 ||
    !/^[a-f0-9]{64}$/.test(receipt.planSha256) ||
    receipt.operation ||
    receipt.actionInvocations?.length ||
    receipt.noChanges ||
    new Set(receipt.changes.map((c) => c.address)).size !== receipt.changes.length
  )
    throw Error('Terraform static service saved-plan scope differs');
  const addresses = Object.keys(revision.routes)
    .map((name) => `aws_ec2_transit_gateway_route.${name}`)
    .sort();
  const mutations = receipt.changes.filter((c) => canonicalSha256(c.actions) !== canonicalSha256(['no-op']));
  if (
    canonicalSha256(mutations.map((c) => c.address).sort()) !== canonicalSha256(addresses) ||
    mutations.some(
      (c) =>
        c.type !== 'aws_ec2_transit_gateway_route' ||
        canonicalSha256(c.actions) !== canonicalSha256([revision.effect === 'withdraw' ? 'delete' : 'create']),
    )
  )
    throw Error('Terraform static service unrelated or replacement mutation');
  if (
    canonicalSha256(Object.keys(before).sort()) !== canonicalSha256(addresses) ||
    canonicalSha256(Object.keys(after).sort()) !== canonicalSha256(addresses)
  )
    throw Error('Terraform static service projection incomplete');
  for (const address of addresses) {
    const name = address.split('.')[1];
    const route = revision.routes[name];
    const owned = {
      destination_cidr_block: route.destination_cidr_block,
      transit_gateway_attachment_id: services.transportAttachmentId,
      transit_gateway_route_table_id: services.routeTableId,
      blackhole: false,
    };
    if (
      canonicalSha256(revision.effect === 'withdraw' ? before[address] : after[address]) !== canonicalSha256(owned) ||
      (revision.effect === 'withdraw' ? after[address] : before[address]) !== null
    )
      throw Error('Terraform static service resolved identity differs');
  }
}

// plugins/aws/src/ce/terraform-whole-site-power.ts
import { createHash as createHash4 } from 'node:crypto';

var object6 = (v) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Malformed Terraform power configuration');
  return v;
};
var digest = (s) => createHash4('sha256').update(s).digest('hex');
function scope2(base, plan, effect) {
  verifyAwsWholeSitePowerPlan(base, plan);
  if (
    base.engine !== 'terraform' ||
    !['stop', 'start', 'release'].includes(effect) ||
    plan.operation !== (effect === 'stop' ? 'stop' : 'start')
  )
    throw Error('Terraform power owning operation differs');
  if (base.topology.nodeCount !== 1 || plan.bindings.nodes.length !== 1 || siteBindings(base).length !== 1)
    throw Error('Terraform power requires separately qualified multi-node lifecycle');
}
function reviseAwsTerraformPowerConfiguration(base, plan, configuration, effect) {
  scope2(base, plan, effect);
  const before = object6(JSON.parse(configuration));
  const after = structuredClone(before);
  const terraform = object6(after.terraform);
  const providers = object6(terraform.required_providers);
  const awsRequired = object6(providers.aws);
  const provider = object6(object6(after.provider).aws);
  if (
    terraform.required_version !== `= ${AWS_CE_TERRAFORM_VERSION}` ||
    awsRequired.source !== 'hashicorp/aws' ||
    awsRequired.version !== `= ${AWS_CE_TERRAFORM_PROVIDER_VERSION}` ||
    provider.region !== base.region ||
    canonicalSha256(provider.allowed_account_ids) !== canonicalSha256([base.accountId]) ||
    terraform.backend ||
    terraform.cloud
  )
    throw Error('Terraform power provider, account, region or backend differs');
  const resources = object6(after.resource);
  const node = plan.bindings.nodes[0];
  const vms = object6(resources.aws_instance);
  if (Object.keys(vms).length !== 1 || !vms[`node_${node.nodeIndex}`])
    throw Error('Terraform power selected VM cardinality differs');
  const vm = object6(vms[`node_${node.nodeIndex}`]);
  const tags = object6(vm.tags);
  const expected = {
    'xcsh-deployment-id': base.deploymentName,
    'xcsh-execution-engine': 'terraform',
    'xcsh-plan-sha256': base.planSha256,
    'xcsh-node-index': String(node.nodeIndex),
    'ves-io-site-name': node.siteName,
  };
  if (Object.entries(expected).some(([k, v]) => tags[k] !== v)) throw Error('Terraform power VM ownership differs');
  const key = `ce_power_${node.nodeIndex}`;
  const address = `aws_ec2_instance_state.${key}`;
  const controls =
    resources.aws_ec2_instance_state === undefined ? undefined : object6(resources.aws_ec2_instance_state);
  let prior;
  if (controls) {
    if (Object.keys(controls).length !== 1 || !controls[key]) throw Error('Foreign Terraform power control');
    prior = object6(controls[key]);
    if (
      prior.instance_id !== node.instanceId ||
      prior.force !== false ||
      !['running', 'stopped'].includes(String(prior.state)) ||
      Object.keys(prior).sort().join(',') !== 'force,instance_id,state'
    )
      throw Error('Terraform power retained control differs');
  }
  if (effect !== 'stop' && !prior) throw Error('Terraform start/release requires a retained power control');
  if (effect === 'release' && prior?.state !== 'running')
    throw Error('Terraform release requires restored running control');
  if (effect === 'release') delete resources.aws_ec2_instance_state;
  else
    resources.aws_ec2_instance_state = {
      [key]: { instance_id: node.instanceId, state: effect === 'stop' ? 'stopped' : 'running', force: false },
    };
  const next = JSON.stringify(after);
  return {
    configuration: next,
    beforeSha256: digest(configuration),
    afterSha256: digest(next),
    address,
    instanceId: node.instanceId,
    effect,
    expectedActions: [effect === 'release' ? 'delete' : prior ? 'update' : 'create'],
  };
}
function validateAwsTerraformPowerReceipt(base, plan, effect, revision, receipt, fields) {
  scope2(base, plan, effect);
  if (
    revision.effect !== effect ||
    revision.instanceId !== plan.bindings.nodes[0].instanceId ||
    revision.address !== `aws_ec2_instance_state.ce_power_${plan.bindings.nodes[0].nodeIndex}` ||
    revision.afterSha256 !== digest(revision.configuration) ||
    receipt.schemaVersion !== 1 ||
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== base.deploymentName ||
    receipt.backendIdentity !== `local:${base.deploymentName}` ||
    receipt.configurationSha256 !== revision.afterSha256 ||
    receipt.providerLockSha256 !== AWS_CE_PROVIDER_LOCK_SHA256 ||
    !/^[a-f0-9]{64}$/.test(receipt.planSha256) ||
    receipt.operation ||
    receipt.actionInvocations?.length ||
    receipt.noChanges ||
    new Set(receipt.changes.map((row) => row.address)).size !== receipt.changes.length
  )
    throw Error('Terraform power saved plan scope or revision differs');
  const mutations = receipt.changes.filter((row) => canonicalSha256(row.actions) !== canonicalSha256(['no-op']));
  if (mutations.length !== 1) throw Error('Terraform power saved plan must contain only one control mutation');
  const change = mutations[0];
  if (
    change.address !== revision.address ||
    change.type !== 'aws_ec2_instance_state' ||
    canonicalSha256(change.actions) !== canonicalSha256(revision.expectedActions)
  )
    throw Error('Terraform power saved plan has unrelated or replacement changes');
  if (effect === 'release') {
    if (Object.keys(fields).length !== 1 || fields[revision.address] !== null)
      throw Error('Terraform power removal projection differs');
  } else {
    const value = object6(fields[revision.address]);
    if (
      Object.keys(fields).length !== 1 ||
      value.instance_id !== revision.instanceId ||
      value.force !== false ||
      value.state !== (effect === 'stop' ? 'stopped' : 'running')
    )
      throw Error('Terraform power planned identity/state unresolved or differs');
  }
}

// plugins/aws/src/ce/whole-site-power-services.ts
import { createHash as createHash5 } from 'node:crypto';
import { isIP as isIP3 } from 'node:net';

function object7(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Malformed NLB service evidence');
  return v;
}
function list(v) {
  if (!Array.isArray(v)) throw Error('Incomplete NLB service evidence');
  return v.map(object7);
}
function exactly2(v) {
  const rows = list(v);
  if (rows.length !== 1) throw Error('NLB service cardinality differs');
  return rows[0];
}
async function collectAwsPowerNlbServices(base, values, raw, signal) {
  verifyAwsCePlan(base);
  const ingress = base.intent.ingress;
  if (ingress?.mode !== 'nlb' || base.topology.nodeCount !== 1 || ingress.listener.privateAddresses?.length !== 1)
    throw Error('Exact single-site NLB service configuration required');
  const prefix = `arn:${base.intent.partition ?? 'aws'}:elasticloadbalancing:${base.region}:${base.accountId}:`;
  const lb = values.__NLB_ARN__;
  const tg = values.__NLB_TARGET_GROUP_ARN__;
  const listener = values.__NLB_LISTENER_ARN__;
  for (const [arn, kind] of [
    [lb, 'loadbalancer/net/'],
    [tg, 'targetgroup/'],
    [listener, 'listener/net/'],
  ])
    if (typeof arn !== 'string' || !arn.startsWith(prefix + kind) || !/^[a-zA-Z0-9:/_.-]+$/.test(arn))
      throw Error('NLB runtime identity unresolved or foreign');
  const target = { Id: ingress.listener.privateAddresses[0], Port: ingress.port, AvailabilityZone: 'all' };
  if (isIP3(target.Id) !== 4 || !Number.isInteger(target.Port) || target.Port < 1 || target.Port > 65535)
    throw Error('NLB target identity unresolved');
  const api = scopedAwsApi(raw, base.intent.awsProfile ?? 'default', signal);
  const read = async (args) => {
    const r = await api.exec('aws', [...args, '--region', base.region, '--output', 'json']);
    if (r.exitCode) throw Error('NLB service unavailable');
    const v = object7(JSON.parse(r.stdout));
    if (['NextToken', 'nextToken', 'NextMarker', 'Marker'].some((k) => Object.hasOwn(v, k)))
      throw Error('Partial NLB service evidence');
    return v;
  };
  if ((await read(['sts', 'get-caller-identity'])).Account !== base.accountId) throw Error('NLB account differs');
  const tags = list((await read(['elbv2', 'describe-tags', '--resource-arns', lb, tg, listener])).TagDescriptions);
  if (tags.length !== 3 || new Set(tags.map((v) => v.ResourceArn)).size !== 3)
    throw Error('NLB ownership cardinality differs');
  const expected = {
    'xcsh-managed-by': 'aws-ce',
    'xcsh-deployment-id': base.deploymentName,
    'xcsh-execution-engine': base.engine,
    'xcsh-plan-sha256': base.planSha256,
  };
  for (const arn of [lb, tg, listener]) {
    const rows = tags.filter((v) => v.ResourceArn === arn);
    if (rows.length !== 1) throw Error('NLB ownership missing');
    const entries = list(rows[0].Tags);
    if (
      new Set(entries.map((v) => v.Key)).size !== entries.length ||
      entries.some((v) => typeof v.Key !== 'string' || typeof v.Value !== 'string') ||
      Object.entries(expected).some(([k, v]) => !entries.some((t) => t.Key === k && t.Value === v))
    )
      throw Error('Foreign NLB ownership');
  }
  const loadBalancer = exactly2(
    (await read(['elbv2', 'describe-load-balancers', '--load-balancer-arns', lb])).LoadBalancers,
  );
  if (
    loadBalancer.LoadBalancerArn !== lb ||
    loadBalancer.Type !== 'network' ||
    loadBalancer.Scheme !== 'internal' ||
    loadBalancer.VpcId !== ingress.loadBalancer.vpcId ||
    object7(loadBalancer.State).Code !== 'active'
  )
    throw Error('NLB retained load balancer differs');
  const zones = list(loadBalancer.AvailabilityZones);
  const actual = zones
    .map((z) => ({
      subnetId: z.SubnetId,
      addresses: list(z.LoadBalancerAddresses)
        .map((a) => a.PrivateIPv4Address)
        .sort(),
    }))
    .sort((a, b) => String(a.subnetId).localeCompare(String(b.subnetId)));
  const expectedZones = ingress.loadBalancer.subnetIds
    .map((subnetId, i) => ({ subnetId, addresses: [ingress.loadBalancer.privateAddresses[i]] }))
    .sort((a, b) => a.subnetId.localeCompare(b.subnetId));
  if (canonicalSha256(actual) !== canonicalSha256(expectedZones)) throw Error('NLB subnet/address identity differs');
  const group = exactly2((await read(['elbv2', 'describe-target-groups', '--target-group-arns', tg])).TargetGroups);
  if (
    group.TargetGroupArn !== tg ||
    group.TargetType !== 'ip' ||
    group.Protocol !== 'TCP' ||
    group.Port !== target.Port ||
    group.VpcId !== ingress.loadBalancer.vpcId ||
    canonicalSha256(group.LoadBalancerArns) !== canonicalSha256([lb])
  )
    throw Error('NLB retained target group differs');
  const retainedListener = exactly2(
    (await read(['elbv2', 'describe-listeners', '--listener-arns', listener])).Listeners,
  );
  const action = exactly2(retainedListener.DefaultActions);
  if (
    retainedListener.ListenerArn !== listener ||
    retainedListener.LoadBalancerArn !== lb ||
    retainedListener.Port !== target.Port ||
    retainedListener.Protocol !== 'TCP' ||
    action.Type !== 'forward' ||
    action.TargetGroupArn !== tg
  )
    throw Error('NLB retained listener differs');
  const membership = list(
    (await read(['elbv2', 'describe-target-health', '--target-group-arn', tg])).TargetHealthDescriptions,
  );
  if (membership.length > 1) throw Error('Duplicate NLB membership');
  let status = 'withdrawn';
  if (membership.length) {
    const row = membership[0];
    if (canonicalSha256(object7(row.Target)) !== canonicalSha256(target)) throw Error('Foreign NLB target membership');
    const health = object7(row.TargetHealth);
    if (
      !['healthy', 'initial', 'unhealthy', 'unused', 'draining', 'unavailable', 'unhealthy.draining'].includes(
        String(health.State),
      )
    )
      throw Error('NLB membership health unavailable');
    status = health.State === 'healthy' ? 'active' : 'pending';
  }
  const services = {
    schemaVersion: 1,
    kind: 'aws-ce-nlb-power-services',
    sourcePlanSha256: base.planSha256,
    engine: base.engine,
    accountId: base.accountId,
    region: base.region,
    loadBalancerArn: lb,
    targetGroupArn: tg,
    listenerArn: listener,
    vpcId: ingress.loadBalancer.vpcId,
    zones: expectedZones,
    target,
  };
  return {
    services,
    servicesSha256: canonicalSha256(services),
    status,
    traffic: 'unknown',
    collectedAt: new Date().toISOString(),
  };
}
var hash4 = (v) => createHash5('sha256').update(v).digest('hex');
function reviseAwsTerraformNlbMembership(base, services, configuration, effect, retained) {
  verifyAwsCePlan(base);
  if (
    base.engine !== 'terraform' ||
    services.engine !== base.engine ||
    services.sourcePlanSha256 !== base.planSha256 ||
    services.accountId !== base.accountId ||
    services.region !== base.region ||
    base.topology.nodeCount !== 1 ||
    !['withdraw', 'restore'].includes(effect)
  )
    throw Error('Terraform NLB membership ownership differs');
  const before = object7(JSON.parse(configuration));
  const after = structuredClone(before);
  const terraform = object7(after.terraform);
  const aws = object7(object7(terraform.required_providers).aws);
  const provider = object7(object7(after.provider).aws);
  if (
    terraform.required_version !== `= ${AWS_CE_TERRAFORM_VERSION}` ||
    aws.source !== 'hashicorp/aws' ||
    aws.version !== `= ${AWS_CE_TERRAFORM_PROVIDER_VERSION}` ||
    provider.region !== base.region ||
    canonicalSha256(provider.allowed_account_ids) !== canonicalSha256([base.accountId]) ||
    terraform.backend ||
    terraform.cloud
  )
    throw Error('Terraform NLB provider scope differs');
  const resources = object7(after.resource);
  let attachment;
  if (effect === 'withdraw') {
    const attachments = object7(resources.aws_lb_target_group_attachment);
    if (Object.keys(attachments).join(',') !== 'node_1') throw Error('Terraform NLB attachment cardinality differs');
    attachment = object7(attachments.node_1);
    if (
      attachment.target_group_arn !== `\${aws_lb_target_group.ce.arn}` ||
      attachment.target_id !== services.target.Id ||
      attachment.port !== services.target.Port ||
      attachment.availability_zone !== 'all' ||
      canonicalSha256(attachment.depends_on) !== canonicalSha256(['aws_instance.node_1']) ||
      Object.keys(attachment).sort().join(',') !== 'availability_zone,depends_on,port,target_group_arn,target_id'
    )
      throw Error('Terraform NLB attachment identity differs');
    delete resources.aws_lb_target_group_attachment;
  } else {
    if (
      retained?.effect !== 'withdraw' ||
      retained.servicesSha256 !== canonicalSha256(services) ||
      retained.address !== 'aws_lb_target_group_attachment.node_1' ||
      hash4(retained.configuration) !== retained.afterSha256 ||
      resources.aws_lb_target_group_attachment !== undefined
    )
      throw Error('Terraform NLB restoration requires exact retained withdrawal');
    attachment = object7(retained.attachment);
    if (
      attachment.target_group_arn !== `\${aws_lb_target_group.ce.arn}` ||
      attachment.target_id !== services.target.Id ||
      attachment.port !== services.target.Port ||
      attachment.availability_zone !== 'all' ||
      canonicalSha256(attachment.depends_on) !== canonicalSha256(['aws_instance.node_1']) ||
      Object.keys(attachment).sort().join(',') !== 'availability_zone,depends_on,port,target_group_arn,target_id'
    )
      throw Error('Terraform NLB retained attachment differs');
    resources.aws_lb_target_group_attachment = { node_1: structuredClone(attachment) };
  }
  const next = JSON.stringify(after);
  return {
    configuration: next,
    beforeSha256: hash4(configuration),
    afterSha256: hash4(next),
    servicesSha256: canonicalSha256(services),
    address: 'aws_lb_target_group_attachment.node_1',
    effect,
    expectedActions: [effect === 'withdraw' ? 'delete' : 'create'],
    attachment: structuredClone(attachment),
  };
}
function validateAwsTerraformNlbMembershipReceipt(base, services, revision, receipt, before, after) {
  verifyAwsCePlan(base);
  if (
    base.engine !== 'terraform' ||
    services.engine !== base.engine ||
    services.sourcePlanSha256 !== base.planSha256 ||
    revision.servicesSha256 !== canonicalSha256(services) ||
    revision.address !== 'aws_lb_target_group_attachment.node_1' ||
    !['withdraw', 'restore'].includes(revision.effect) ||
    revision.afterSha256 !== hash4(revision.configuration) ||
    receipt.schemaVersion !== 1 ||
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== base.deploymentName ||
    receipt.backendIdentity !== `local:${base.deploymentName}` ||
    receipt.configurationSha256 !== revision.afterSha256 ||
    receipt.providerLockSha256 !== AWS_CE_PROVIDER_LOCK_SHA256 ||
    !/^[a-f0-9]{64}$/.test(receipt.planSha256) ||
    receipt.operation ||
    receipt.actionInvocations?.length ||
    receipt.noChanges ||
    new Set(receipt.changes.map((r) => r.address)).size !== receipt.changes.length
  )
    throw Error('Terraform NLB membership saved-plan scope differs');
  const mutations = receipt.changes.filter((r) => canonicalSha256(r.actions) !== canonicalSha256(['no-op']));
  const expected = revision.effect === 'withdraw' ? ['delete'] : ['create'];
  if (
    mutations.length !== 1 ||
    mutations[0].address !== revision.address ||
    mutations[0].type !== 'aws_lb_target_group_attachment' ||
    canonicalSha256(mutations[0].actions) !== canonicalSha256(expected) ||
    canonicalSha256(revision.expectedActions) !== canonicalSha256(expected)
  )
    throw Error('Terraform NLB membership unrelated or replacement mutation');
  if (
    Object.keys(before).length !== 1 ||
    Object.keys(after).length !== 1 ||
    !Object.hasOwn(before, revision.address) ||
    !Object.hasOwn(after, revision.address)
  )
    throw Error('Terraform NLB membership projection incomplete');
  const owned = {
    target_group_arn: services.targetGroupArn,
    target_id: services.target.Id,
    port: services.target.Port,
    availability_zone: 'all',
  };
  const absent = revision.effect === 'withdraw' ? after[revision.address] : before[revision.address];
  const present = revision.effect === 'withdraw' ? before[revision.address] : after[revision.address];
  if (absent !== null || canonicalSha256(present) !== canonicalSha256(owned))
    throw Error('Terraform NLB membership resolved identity differs');
}

export {
  buildAwsWholeSitePowerPlan,
  collectAwsPowerBgpServices,
  collectAwsPowerNlbServices,
  dispatchAwsNativeBgpPower,
  dispatchAwsTerraformBgpPower,
  evidencePasses,
  powerServiceComponentSha256,
  reconcileAwsNativeBgpPower,
  reconcileAwsTerraformBgpPower,
  retireAwsNativeBgpPowerPolicy,
  retireAwsTerraformBgpPowerPolicy,
  reviseAwsTerraformDirectServiceRoutes,
  reviseAwsTerraformNlbMembership,
  reviseAwsTerraformPowerConfiguration,
  reviseAwsTerraformStaticServiceRoutes,
  runAwsWholeSitePower,
  validateAwsBgpPowerPreparation,
  validateAwsTerraformDirectServiceReceipt,
  validateAwsTerraformNlbMembershipReceipt,
  validateAwsTerraformPowerReceipt,
  validateAwsTerraformStaticServiceReceipt,
  validatePowerServiceInventory,
  verifyAwsWholeSitePowerPlan,
};
