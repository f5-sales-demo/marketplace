import { fingerprint } from '../../gcloud/src/ce/discovery';
import { readOriginalGcpBootstrapVmSource } from './gcp-bootstrap-vm-binding';
import { readOriginalGcpCeCampaignKey } from './gcp-ce-campaign-key';
import { assertOriginalGcpCeSliTargetContext } from './gcp-ce-sli-target';
import { readOriginalGcpCeWireKeys } from './gcp-ce-wire-key-reader';
import { type GcpGuestBindingFields, projectGcpGuestBinding } from './gcp-guest-binding-projection';
import { assertOriginalGcpObserverCampaignKeyContext } from './gcp-observer-campaign-key';
import {
  assertOriginalGcpCeHostTrustContext,
  assertOriginalGcpObserverHostTrustContext,
} from './gcp-observer-host-trust-reader';
import { assertOriginalGcpObserverVmCaptureCallback } from './gcp-observer-insert-evidence';
import { assertOriginalQualifiedGcpObserverClientsContext } from './gcp-observer-qualified-clients';
import { readOriginalGcpObserverSshCommand } from './gcp-observer-ssh-command';
import { createOriginalGuestFailureRetention } from './guest-failure-retention';
import {
  assertOriginalApplyCallback,
  assertOriginalApplyLifetime,
  type OriginalApplyCallbackContext,
} from './installed-apply-controller';
import { freezeAdmittedCaptureInputs } from './installed-capture-context';
import { readOriginalInstalledGcpCeAccess } from './installed-ce-access';
import { readOriginalInstalledGcpObserverAccess } from './installed-observer-access';
import { assertSameOriginalInput, monitorOriginalInputs, type OriginalInputBinding } from './original-input-monitor';

export interface InstalledGcpGuestBindingSources {
  readonly ce: unknown;
  readonly observer: unknown;
  readonly callback: OriginalApplyCallbackContext;
}
const inputNames = ['observer_key', 'ce_key', 'observer_hosts', 'ce_hosts'] as const;
const core = (binding: GcpGuestBindingFields) =>
  fingerprint(
    Object.fromEntries(
      Object.entries(binding).filter(([name]) => !inputNames.includes(name as (typeof inputNames)[number])),
    ),
  );
const canonical = (value: unknown) => fingerprint(value);
/** Consistency only. Callers must establish current original issuer proofs
 * before this comparison; no plain packet can mint source or guest authority. */
export function assertOriginalGuestBindingTransfer(
  before: GcpGuestBindingFields,
  after: GcpGuestBindingFields,
  original: Readonly<Record<string, OriginalInputBinding>>,
  current: Readonly<Record<string, OriginalInputBinding>>,
) {
  if (core(before) !== core(after))
    throw new Error('Original guest source transfer changed identity/token/NIC ownership');
  for (const name of inputNames)
    if (!original[name] || !current[name] || before[name] !== original[name].path || after[name] !== current[name].path)
      throw new Error('Original guest binding and input paths differ');
  for (const name of ['observer_key', 'ce_key', 'ssh'] as const) {
    if (!original[name] || !current[name]) throw new Error('Original guest key/executable input missing');
    assertSameOriginalInput(original[name], current[name]);
  }
  for (const name of ['observer_hosts', 'ce_hosts'] as const)
    if (original[name].sha256 !== current[name].sha256)
      throw new Error('Original guest serial/wire host trust changed');
}
/** Original issuer checks precede every projection. No transport, clock,
 * source-reader or receipt override is accepted by the installed binder. */
async function readSources(sources: InstalledGcpGuestBindingSources) {
  const { callback } = sources;
  if (callback.phase === 'after') await assertOriginalApplyCallback(callback);
  else await assertOriginalApplyLifetime(callback);
  const context = callback.original;
  const ce = await readOriginalInstalledGcpCeAccess(sources.ce, callback);
  const observer = await readOriginalInstalledGcpObserverAccess(sources.observer, callback);
  const vm = await readOriginalGcpBootstrapVmSource(ce.bootstrapVm, ce.bootstrap, callback, ce.vm);
  const target = await assertOriginalGcpCeSliTargetContext(ce.target, callback);
  const observed = await assertOriginalGcpObserverVmCaptureCallback(observer.vm, callback);
  const ceKey = await readOriginalGcpCeCampaignKey(ce.key, callback);
  const observerKey = await assertOriginalGcpObserverCampaignKeyContext(observer.key, callback);
  const ceHost = await assertOriginalGcpCeHostTrustContext(ce.trust, callback);
  const observerHost = await assertOriginalGcpObserverHostTrustContext(observer.trust, callback);
  const wire = await readOriginalGcpCeWireKeys(ce.wire);
  const clients = await assertOriginalQualifiedGcpObserverClientsContext(observer.clients, callback);
  const command = await readOriginalGcpObserverSshCommand(observer.command);
  await observer.localInputs.assertOriginal();
  if (
    ce.clients !== observer.clients ||
    clients.peer !== observer.peer ||
    ce.callback !== callback ||
    observer.callback !== callback ||
    command.callback !== callback ||
    command.instanceId !== observed.instanceId ||
    ceKey.instanceId !== vm.instanceId ||
    observerKey.instanceId !== observed.instanceId ||
    ceHost.instanceId !== vm.instanceId ||
    ceHost.address !== target.address ||
    observerHost.instanceId !== observed.instanceId ||
    observerHost.address !== observed.externalAddress ||
    wire.instanceId !== vm.instanceId ||
    wire.observerInstanceId !== observed.instanceId ||
    wire.algorithm !== 'ssh-rsa'
  )
    throw new Error('Original guest CE/observer/key/trust/client identities differ');
  const inputs = freezeAdmittedCaptureInputs({
    ...context.inputs,
    ssh: observer.localInputs.bindings.ssh,
    observer_key: observerKey.key,
    ce_key: ceKey.key,
    observer_hosts: observerHost.knownHosts,
    ce_hosts: ceHost.knownHosts,
  });
  assertSameOriginalInput(observerKey.key, observer.localInputs.bindings.key);
  assertSameOriginalInput(observerHost.knownHosts, observer.localInputs.bindings.hosts);
  if (inputs.ssh.path !== command.executable.path || inputs.ssh.sha256 !== command.executable.sha256)
    throw new Error('Original guest SSH executable and observer command differ');
  const projected = projectGcpGuestBinding(
    {
      owner: context.owner,
      vm: { ...vm, interfaces: vm.interfaces.map((nic) => nic.address) },
      observer: observed,
      target,
      paths: Object.fromEntries(inputNames.map((name) => [name, inputs[name].path])) as Pick<
        GcpGuestBindingFields,
        (typeof inputNames)[number]
      >,
    },
    Date.now(),
  );
  await context.assertInputs();
  if (callback.phase === 'after') await assertOriginalApplyCallback(callback);
  else await assertOriginalApplyLifetime(callback);
  return Object.freeze({ ...projected, inputs, context });
}

/** Immutable worker binding and capture-only input leases. Final transfer
 * checks fresh original after sources while preserving the original private
 * files and binding; no retired before capability is used to authorize work. */
export async function openInstalledGcpGuestBinding(initial: InstalledGcpGuestBindingSources) {
  let sources = Object.freeze({ ...initial });
  const original = await readSources(sources);
  const binding = Object.freeze({ ...original.binding });
  const anchor = canonical(binding),
    identity = core(binding);
  const context = original.context;
  const monitor = await monitorOriginalInputs(original.inputs);
  const failures = createOriginalGuestFailureRetention();
  let closed = false,
    busy = false,
    transferred = false,
    transferClaimed = false;
  const lease = async (full = true, finalTransfer = false) => {
    if (closed) throw new Error('Original guest binding lease closed');
    if (transferred || finalTransfer) failures.assertUsableForTransfer();
    else failures.assertUsable();
    try {
      await context.assertInputs();
      if (full) await monitor.assertOriginal();
      else await monitor.assertOriginalIdentity();
    } catch (error) {
      failures.record(error, sources.callback);
      throw error;
    }
  };
  const sameInputs = (current: Awaited<ReturnType<typeof readSources>>) => {
    if (current.context !== context || core(current.binding) !== identity)
      throw new Error('Original guest source transfer changed identity/token/NIC ownership');
    assertOriginalGuestBindingTransfer(binding, current.binding, original.inputs, current.inputs);
  };
  const verify = async (value?: Readonly<Record<string, unknown>>, full = true) => {
    if (busy) throw new Error('Original guest binding operation already active');
    busy = true;
    try {
      await lease(full);
      if (value && canonical(value) !== anchor) throw new Error('Original immutable guest binding differs');
      const current = await readSources(sources);
      sameInputs(current);
      await lease(full);
    } catch (error) {
      failures.record(error, sources.callback);
      throw error;
    } finally {
      busy = false;
    }
  };
  return Object.freeze({
    context,
    binding,
    inputs: original.inputs,
    guards: Object.freeze({
      // The worker hashes these exact merged inputs before/after each command.
      // Ongoing IPC keeps the original descriptors and sticky mutation watches.
      inputs: () => lease(false),
      original: (value: Readonly<Record<string, unknown>>) => verify(value, false),
      async trust(value: Readonly<Record<string, unknown>>, role: 'observer' | 'ce') {
        if (busy) throw new Error('Original guest binding operation already active');
        busy = true;
        try {
          if (role !== 'observer' && role !== 'ce') throw new Error('Original guest trust role required');
          if (canonical(value) !== anchor) throw new Error('Original immutable guest trust binding differs');
          await lease(false);
          const callback = sources.callback;
          const view =
            role === 'observer'
              ? await readOriginalInstalledGcpObserverAccess(sources.observer, callback)
              : await readOriginalInstalledGcpCeAccess(sources.ce, callback);
          const host =
            role === 'observer'
              ? await assertOriginalGcpObserverHostTrustContext(view.trust, callback)
              : await assertOriginalGcpCeHostTrustContext(view.trust, callback);
          const name = role === 'observer' ? 'observer_hosts' : 'ce_hosts';
          if (host.knownHosts.sha256 !== original.inputs[name].sha256)
            throw new Error('Original guest host trust changed');
          await lease(false);
        } catch (error) {
          failures.record(error, sources.callback);
          throw error;
        } finally {
          busy = false;
        }
      },
    }),
    assertOriginal: () => verify(),
    async handoff(next: InstalledGcpGuestBindingSources) {
      if (transferred || transferClaimed || busy || closed || failures.evidence().permanentFailure)
        throw new Error('Original guest binding transfer already claimed, busy or refused');
      const after = next.callback,
        before = initial.callback;
      if (
        after.phase !== 'after' ||
        !after.reserve ||
        after.original !== context ||
        after.nonce !== before.nonce ||
        after.execution.output !== before.execution.output ||
        (['pid', 'group', 'start', 'boot'] as const).some(
          (name) => after.execution.identity[name] !== before.execution.identity[name],
        )
      )
        throw new Error('Original guest binding actual final callback and same actor required');
      await assertOriginalApplyCallback(after);
      if (transferred || transferClaimed || busy || closed || failures.evidence().permanentFailure)
        throw new Error('Original guest binding transfer already claimed, busy or refused');
      transferClaimed = true;
      busy = true;
      try {
        // Old file leases remain valid independently of retired before commands.
        await lease(true, true);
        const replacement = Object.freeze({ ...next });
        sameInputs(await readSources(replacement));
        await assertOriginalApplyCallback(after);
        sources = replacement;
        transferred = true;
        await lease();
      } catch (error) {
        // Failed replacement validation is permanent, even if a prior before
        // round ended at the original lifetime boundary.
        failures.record(error, after);
        throw error;
      } finally {
        busy = false;
      }
    },
    close() {
      closed = true;
      monitor.close();
    },
    evidence: () =>
      Object.freeze({
        transferred,
        transferClaimed,
        closed,
        ...failures.evidence(),
        originalBindingSha256: anchor.slice(7),
        guestAcceptanceComplete: false,
        executionAuthorized: false,
      }),
  });
}
