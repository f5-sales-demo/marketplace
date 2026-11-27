import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { validateAwsBgpPowerPreparation } from './bgp-power-controller';
import { canonicalSha256 } from './canonical';
import { AWS_CE_PROVIDER_LOCK_SHA256 } from './execution-contract';
import {
  reviseAwsTerraformDirectServiceRoutes,
  validateAwsTerraformDirectServiceReceipt,
} from './terraform-direct-power';
import {
  reviseAwsTerraformStaticServiceRoutes,
  validateAwsTerraformStaticServiceReceipt,
} from './terraform-static-power';
import { reviseAwsTerraformPowerConfiguration, validateAwsTerraformPowerReceipt } from './terraform-whole-site-power';
import type { AwsCePlan } from './types';
import {
  type AwsPowerEvidence,
  type AwsPowerGate,
  type AwsWholeSitePowerPlan,
  evidencePasses,
  verifyAwsWholeSitePowerPlan,
} from './whole-site-power';
import { type AwsPowerServiceKind, powerServiceComponentSha256 } from './whole-site-power-service-binding';
import { reviseAwsTerraformNlbMembership, validateAwsTerraformNlbMembershipReceipt } from './whole-site-power-services';

type Json = Record<string, any>;
const object = (v: unknown): Json => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Malformed power retirement artifact');
  return v as Json;
};
const same = (a: unknown, b: unknown) => canonicalSha256(a) === canonicalSha256(b);
const fail = (): never => {
  throw Error('Power retirement provenance differs');
};
const sequences = {
  stop: ['ready-to-stop', 'withdraw', 'withdrawn', 'stop', 'stopped'],
  start: ['ready-to-start', 'start', 'running', 'restore', 'restored', 'release'],
};
const effects = ['withdraw', 'stop', 'start', 'restore', 'release'];
const timestamp = (v: unknown) =>
  typeof v === 'string' && Number.isFinite(Date.parse(v)) && Date.parse(v) <= Date.now();
const sha = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);

/** Read-only terminal inventory qualification. Never opens a runner or replays an effect. */
export async function qualifyAwsTerraformPowerArtifacts(
  base: AwsCePlan,
  store: CeDeploymentStore,
  names: string[],
  recorded?: Map<string, { path: string; preserve: boolean; sha256: string }>,
): Promise<Set<string>> {
  const admitted = new Set<string>();
  const powerNames = names.filter((n) => n.startsWith('aws-ce-power-'));
  // The initial inventory has already qualified source and journal joins before any removal.
  // Only recorded surviving names may be admitted on resume; parent digest checks remain mandatory.
  if (recorded) {
    for (const name of powerNames) {
      const item = recorded.get(name);
      if (!item || item.preserve || !/^aws-ce-power-[a-f0-9]{24}(?:-[a-z-]+)?\.json$/.test(name)) fail();
      admitted.add(name);
    }
    return admitted;
  }
  const plans = new Map<string, AwsWholeSitePowerPlan>();
  const checkpoints = new Map<string, Json>();
  const read = async (name: string) => object(await store.read(name));
  for (const name of powerNames.filter((n) => /^aws-ce-power-[a-f0-9]{24}\.json$/.test(n))) {
    const plan = (await read(name)) as AwsWholeSitePowerPlan;
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
      continue; // An immutable prepared plan may not yet have entered execution.
    }
    const cp = await read(cpName),
      steps = sequences[plan.operation];
    const attempts = object(cp.attempts),
      evidence = object(cp.evidence);
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
      const attempt = object(value),
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
      const v = object(value) as AwsPowerEvidence;
      if (
        effects.includes(gate) ||
        !steps.includes(gate) ||
        steps.indexOf(gate) >= cp.step ||
        !timestamp(v.collectedAt) ||
        !evidencePasses(plan, gate as AwsPowerGate, v, Date.parse(v.collectedAt))
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
          (!cp.complete || !evidencePasses(plan, 'stopped', v as AwsPowerEvidence, Date.parse(v.collectedAt)))
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
          validateAwsBgpPowerPreparation(prep as never, prepMarker as never);
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
          const checkObservation = (value: unknown, status: string, desired: unknown) => {
            const o = object(value);
            if (
              o.servicesSha256 !== expected.servicesSha256 ||
              !same(o.services, prep.services) ||
              o.status !== status ||
              !Array.isArray(o.snapshots) ||
              o.snapshots.length !== prep.snapshots.length
            )
              fail();
            for (let index = 0; index < prep.snapshots.length; index++) {
              const actual = object(o.snapshots[index]),
                original = object(prep.snapshots[index]);
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
            const o = object(v.observed);
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
        const marker = object(v.marker);
        const expected: Json = {
          schemaVersion: 1,
          engine: 'terraform',
          planSha256: plan.planSha256,
          bindingsSha256: plan.bindingsSha256,
          ...(family
            ? { servicesSha256: powerServiceComponentSha256(base, plan.bindings, family as AwsPowerServiceKind) }
            : { instanceId: plan.bindings.nodes[0].instanceId }),
          attempt,
        };
        if (!same(marker, expected)) fail();
        const stem = `${plan.planId}-${effect}-terraform${family ? `-${family}` : ''}`;
        if (kind === 'source') {
          if (!same(Object.keys(v).sort(), ['configuration', 'marker']) || typeof v.configuration !== 'string') fail();
          reviseAwsTerraformPowerConfiguration(base, plan, v.configuration, effect as 'stop' | 'start' | 'release');
          if (!names.includes(`${stem}-preparation.json`)) {
            if (names.some((n) => n.startsWith(`${stem}-`) && n !== name)) fail();
            admitted.add(name);
            continue;
          }
        }
        const prep = kind === 'preparation' ? v : await read(`${stem}-preparation.json`);
        if (!same(prep.marker, expected)) fail();
        const revision = object(prep.revision);
        let reconstructed: unknown;
        let serviceIdentity: unknown;
        if (!family) {
          const source = await read(`${stem}-source.json`);
          if (!same(source.marker, expected) || typeof source.configuration !== 'string') fail();
          reconstructed = reviseAwsTerraformPowerConfiguration(
            base,
            plan,
            source.configuration,
            effect as 'stop' | 'start' | 'release',
          );
        } else {
          if (typeof prep.source !== 'string') fail();
          const outcomeName = `${stem}-outcome.json`;
          const services =
            plan.bindings.servicesInventory?.components.find((c) => c.kind === family)?.services ??
            (names.includes(outcomeName) ? object((await read(outcomeName)).observed).services : undefined);
          if (!services || canonicalSha256(services) !== expected.servicesSha256) fail();
          serviceIdentity = services;
          const stopId = `aws-ce-power-${plan.maintenance?.stopPlanSha256.slice(0, 24)}`;
          const retained =
            effect === 'restore'
              ? object((await read(`${stopId}-withdraw-terraform-${family}-preparation.json`)).revision)
              : undefined;
          const revise =
            family === 'direct'
              ? reviseAwsTerraformDirectServiceRoutes
              : family === 'static-tgw'
                ? reviseAwsTerraformStaticServiceRoutes
                : reviseAwsTerraformNlbMembership;
          reconstructed = revise(
            base,
            services as never,
            prep.source,
            effect as 'withdraw' | 'restore',
            retained as never,
          );
        }
        if (!same(reconstructed, revision)) fail();
        const receipt = prep.receipt;
        if (receipt) {
          const r = object(receipt);
          if (
            r.schemaVersion !== 1 ||
            r.engine !== 'terraform' ||
            r.deploymentId !== base.deploymentName ||
            r.backendIdentity !== `local:${base.deploymentName}` ||
            r.configurationSha256 !== revision.afterSha256 ||
            r.providerLockSha256 !== AWS_CE_PROVIDER_LOCK_SHA256 ||
            !sha(r.planSha256) ||
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
            validateAwsTerraformPowerReceipt(
              base,
              plan,
              effect as 'stop' | 'start' | 'release',
              revision as never,
              r as never,
              fields,
            );
          } else {
            const services = object(serviceIdentity);
            let owned: Json;
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
                Object.entries(object(revision.routes)).map(([name, route]) => [`aws_route.${name}`, route]),
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
              services as never,
              revision as never,
              r as never,
              effect === 'withdraw' ? owned : absent,
              effect === 'withdraw' ? absent : owned,
            );
            if (kind === 'outcome') {
              const observed = object(v.observed);
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
          const fields = object(v.fields),
            node = plan.bindings.nodes[0];
          if (fields[`aws_instance.node_${node.nodeIndex}`]?.id !== node.instanceId) fail();
          for (const nic of node.interfaces) {
            const row = object(fields[`aws_network_interface.node_${node.nodeIndex}_nic_${nic.index}`]);
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
          const cloud = object(v.cloud);
          if (
            !same(cloud.owner, plan.bindings.owner) ||
            !same(cloud.nodes, plan.bindings.nodes) ||
            cloud.cloud !== (effect === 'stop' ? 'stopped' : 'running')
          )
            fail();
        }
        if (kind === 'final-preparing' && !same(v, { marker: expected, removalReceipt: receipt })) fail();
        if (kind === 'final-plan' || kind === 'complete') {
          const r = object(v.receipt);
          if (
            r.noChanges !== true ||
            r.engine !== 'terraform' ||
            r.deploymentId !== base.deploymentName ||
            r.backendIdentity !== `local:${base.deploymentName}` ||
            r.configurationSha256 !== revision.afterSha256 ||
            r.providerLockSha256 !== AWS_CE_PROVIDER_LOCK_SHA256 ||
            !sha(r.planSha256) ||
            r.operation ||
            r.actionInvocations?.length ||
            !Array.isArray(r.changes) ||
            new Set(r.changes.map((c: Json) => c.address)).size !== r.changes.length ||
            r.changes.some((c: Json) => !same(c.actions, ['no-op']))
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
