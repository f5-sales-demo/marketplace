import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import type { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import {
  assertRecordedProcessGroupAbsent,
  type RecordedProcessGroupIdentity,
} from '../../platform/src/ce/process-lock';
import type { CeOwner } from '../../platform/src/ce/runtime';
import { decodeEvidenceObject } from './evidence-json';
import { readOwnedInstalledInput } from './installed-runtime';
import { assertSameOriginalInput, monitorOriginalInputs, type OriginalInputBinding } from './original-input-monitor';
import { type FinalExecutionCapture, signalFreeBootstrapSource } from './signal-free-executor';

export interface OriginalGuestReaderOrigin {
  readonly schemaVersion: 1;
  readonly kind: 'original-installed-guest-reader-origin';
  readonly owner: CeOwner;
  readonly phase: 'before' | 'after';
  readonly nodeName: string;
  readonly instanceId: string;
  readonly observerId: string;
  readonly tokenSha256: string;
  readonly ownershipSha256: string;
  readonly request: OriginalInputBinding;
  readonly admission: OriginalInputBinding;
}

export interface OriginalXcshReaderOrigin {
  readonly schemaVersion: 1;
  readonly kind: 'original-installed-xcsh-reader-origin';
  readonly owner: CeOwner;
  readonly parent: RecordedProcessGroupIdentity;
  readonly executionDirectory: string;
  readonly planSha256: string;
  readonly providerSha256: string;
  readonly preparedScope: OriginalInputBinding;
  readonly request: OriginalInputBinding;
  readonly admission: OriginalInputBinding;
}
export interface OriginalAccessReaderOrigin {
  readonly schemaVersion: 1;
  readonly kind: 'original-installed-gcp-access-reader-origin';
  readonly owner: CeOwner;
  readonly family: 'observer' | 'ce';
  readonly role: 'wire' | 'trust' | 'peer' | 'delivery' | 'abi' | 'renewal';
  readonly phase: 'before' | 'after';
  readonly instanceId: string;
  readonly parent: RecordedProcessGroupIdentity;
  readonly executionDirectory: string;
  readonly request: OriginalInputBinding;
  readonly admissionRecorded: boolean;
  readonly admission?: OriginalInputBinding;
}
export function originalAccessReaderPrefix(
  family: OriginalAccessReaderOrigin['family'],
  role: OriginalAccessReaderOrigin['role'],
) {
  if (family === 'ce') {
    if (role === 'wire') return 'gcp-ce-keyscan-captures-';
    if (role === 'trust') return 'gcp-host-trust-readers-';
  } else if (family === 'observer') {
    const prefixes = {
      wire: 'gcp-wire-key-readers-',
      trust: 'gcp-host-trust-readers-',
      peer: 'gcp-observer-peers-',
      delivery: 'gcp-observer-client-captures-',
      abi: 'gcp-observer-abi-captures-',
      renewal: 'gcp-observer-abi-renewal-captures-',
    };
    if (Object.hasOwn(prefixes, role)) return prefixes[role];
  }
  throw new Error('Original access reader family and role required');
}
/** Bind original file bytes to the native executor's sealed copy, keeping their identities distinct. */
export function assertOriginalAccessReaderStdin(expected: unknown, snapshot: unknown) {
  if (expected === undefined && snapshot === undefined) return;
  const input = expected as OriginalInputBinding | undefined;
  const value = snapshot as Record<string, unknown> | undefined;
  if (
    !input?.expectedIdentity ||
    !value ||
    value.schemaVersion !== 1 ||
    value.kind !== 'sealed-original-file-stdin' ||
    value.sealed !== true ||
    value.path !== input.path ||
    value.sha256 !== input.sha256 ||
    !Number.isSafeInteger(value.bytes) ||
    value.bytes !== Number(input.expectedIdentity.size) ||
    !Number.isSafeInteger(value.snapshotFd) ||
    (value.snapshotFd as number) < 0 ||
    typeof value.dev !== 'string' ||
    !/^[0-9]+$/.test(value.dev) ||
    typeof value.ino !== 'string' ||
    !/^[1-9][0-9]*$/.test(value.ino)
  )
    throw new Error('Original access sealed stdin source differs');
}
export interface OriginalBootstrapPublisherOrigin {
  readonly schemaVersion: 1;
  readonly kind: 'original-bootstrap-publisher-origin';
  readonly owner: CeOwner;
  readonly executionDirectory: string;
  readonly planSha256: string;
  readonly nonce: string;
  readonly request: OriginalInputBinding;
  readonly claim: OriginalInputBinding;
  readonly admissionRecorded: boolean;
  readonly admission?: OriginalInputBinding;
}
type OriginalReaderOrigin =
  | OriginalGuestReaderOrigin
  | OriginalXcshReaderOrigin
  | OriginalAccessReaderOrigin
  | OriginalBootstrapPublisherOrigin;

export interface OriginalReaderGroupClosure {
  readonly schemaVersion: 1;
  readonly kind: 'original-reader-group-closure';
  readonly origin?: OriginalReaderOrigin;
  readonly directory: string;
  readonly identity: RecordedProcessGroupIdentity;
  readonly originalBudget: Readonly<{ start: number; deadline: number }>;
  readonly pythonSha256: string;
  readonly executableSha256: string;
  readonly gateSha256: string;
  readonly inputs: Readonly<Record<string, OriginalInputBinding>>;
  readonly physicalGroupAbsent: true;
  readonly producerReportedClosed: boolean;
  readonly captureComplete: boolean;
  readonly executionAccepted: false;
}
function sameIdentity(a: unknown, b: RecordedProcessGroupIdentity) {
  if (!a || typeof a !== 'object') return false;
  const row = a as Record<string, unknown>;
  return (
    Object.keys(row).sort().join(',') === 'boot,group,pid,start' &&
    (['pid', 'group', 'start', 'boot'] as const).every((key) => row[key] === b[key])
  );
}
async function inspectGuestOrigin(witness: OriginalReaderGroupClosure) {
  const origin = witness.origin;
  if (origin?.kind !== 'original-installed-guest-reader-origin') return;
  if (
    origin.schemaVersion !== 1 ||
    origin.kind !== 'original-installed-guest-reader-origin' ||
    origin.owner?.provider !== 'gcp' ||
    origin.owner.engine !== 'terraform' ||
    Object.keys(origin.owner).sort().join(',') !== 'account,deploymentId,engine,provider,region' ||
    ['account', 'region', 'deploymentId'].some(
      (key) => typeof origin.owner[key as keyof CeOwner] !== 'string' || !origin.owner[key as keyof CeOwner],
    ) ||
    !['before', 'after'].includes(origin.phase) ||
    !/^[a-z][a-z0-9-]{0,62}$/.test(origin.nodeName) ||
    ![origin.instanceId, origin.observerId].every((value) => /^[1-9][0-9]{0,19}$/.test(value)) ||
    ![origin.tokenSha256, origin.ownershipSha256].every((value) => /^[a-f0-9]{64}$/.test(value)) ||
    origin.request?.path !== join(witness.directory, 'request.private.json') ||
    origin.admission?.path !== join(witness.directory, 'original-execution.private.json') ||
    !witness.inputs.capture ||
    witness.inputs.capture.path !== join(witness.directory, 'final-execution.private.json') ||
    [origin.request, origin.admission].some(
      (row) =>
        !row.expectedIdentity || !row.expectedParentIdentity || (Number(row.expectedIdentity.mode) & 0o777) !== 0o400,
    )
  )
    throw new Error('Original guest reader source origin required');
  const bindings = { request: origin.request, admission: origin.admission, ...witness.inputs };
  const monitor = await monitorOriginalInputs(bindings);
  try {
    const read = async (binding: OriginalInputBinding) => {
      const current = await readOwnedInstalledInput(binding.path, 4 * 1024 * 1024);
      assertSameOriginalInput(binding, current.binding);
      return decodeEvidenceObject(current.bytes);
    };
    const request = await read(origin.request),
      admission = await read(origin.admission);
    const binding = request.binding as Record<string, unknown> | undefined;
    const inputs = request.inputs as Record<string, OriginalInputBinding> | undefined;
    const script = inputs?.['script:guest_entrypoint.py'],
      python = inputs?.python;
    const expectedArgs = [
      '-I',
      '-B',
      script?.path,
      '--request',
      origin.request.path,
      '--sha256',
      origin.request.sha256,
    ];
    const before = origin.phase === 'before';
    const deadlines = request.deadlines;
    if (
      request.schemaVersion !== (before ? 1 : 2) ||
      request.kind !== (before ? 'original-gcp-guest-worker' : 'original-gcp-final-guest-worker') ||
      request.originalStartMs !== witness.originalBudget.start ||
      !Array.isArray(deadlines) ||
      deadlines.length !== 2 ||
      (before &&
        (deadlines[0] !== witness.originalBudget.deadline ||
          deadlines[1] !== witness.originalBudget.deadline + 300000)) ||
      (!before && request.originalDeadlineMs !== witness.originalBudget.deadline) ||
      binding?.project !== origin.owner.account ||
      binding?.region !== origin.owner.region ||
      binding?.node_name !== origin.nodeName ||
      binding?.token_node !== origin.nodeName ||
      binding?.instance_id !== origin.instanceId ||
      binding?.observer_id !== origin.observerId ||
      binding?.token_sha256 !== origin.tokenSha256 ||
      binding?.ownership_sha256 !== origin.ownershipSha256 ||
      !script ||
      !python ||
      !/^[a-f0-9]{64}$/.test(script.sha256) ||
      python.sha256 !== witness.pythonSha256 ||
      admission.schemaVersion !== 1 ||
      admission.kind !== 'original-installed-guest-worker-admission' ||
      admission.phase !== origin.phase ||
      !sameOwner(admission.owner as CeOwner, origin.owner) ||
      admission.requestSha256 !== origin.request.sha256 ||
      !sameIdentity(admission.identity, witness.identity) ||
      JSON.stringify(admission.args) !== JSON.stringify(expectedArgs) ||
      JSON.stringify(admission.budget) !== JSON.stringify(witness.originalBudget)
    )
      throw new Error('Original guest request, actor or ownership source differs');
    const capture = await read(witness.inputs.capture);
    if (!before && (deadlines[0] !== capture.finalDeadlineMs || deadlines[1] !== capture.finalDeadlineMs))
      throw new Error('Original final guest request reserve differs');
    if (witness.inputs.submission) {
      const submission = await read(witness.inputs.submission);
      const executable = submission.executable as Record<string, unknown> | undefined;
      if (JSON.stringify(submission.args) !== JSON.stringify(expectedArgs) || executable?.path !== python.path)
        throw new Error('Original guest submitted command source differs');
    }
    await monitor.assertOriginal();
  } finally {
    monitor.close();
  }
}

async function inspectXcshOrigin(witness: OriginalReaderGroupClosure) {
  const origin = witness.origin;
  if (origin?.kind !== 'original-installed-xcsh-reader-origin') return;
  if (
    origin.schemaVersion !== 1 ||
    origin.owner?.provider !== 'gcp' ||
    origin.owner.engine !== 'terraform' ||
    Object.keys(origin.owner).sort().join(',') !== 'account,deploymentId,engine,provider,region' ||
    ['account', 'region', 'deploymentId'].some(
      (key) => typeof origin.owner[key as keyof CeOwner] !== 'string' || !origin.owner[key as keyof CeOwner],
    ) ||
    !Number.isSafeInteger(origin.parent?.pid) ||
    origin.parent.pid <= 0 ||
    origin.parent.group !== origin.parent.pid ||
    !/^[1-9][0-9]*$/.test(origin.parent.start) ||
    !/^[a-f0-9-]{36}$/.test(origin.parent.boot) ||
    ![origin.planSha256, origin.providerSha256].every((value) => /^[a-f0-9]{64}$/.test(value)) ||
    dirname(witness.directory) !== origin.executionDirectory ||
    !basename(witness.directory).startsWith('xcsh-creation-readers-') ||
    origin.preparedScope?.path !==
      join(origin.executionDirectory, '.xcsh-original-creation', origin.planSha256, 'scope.json') ||
    origin.request?.path !== join(witness.directory, 'request.private.json') ||
    origin.admission?.path !== join(witness.directory, 'original-execution.private.json') ||
    witness.inputs.capture?.path !== join(witness.directory, 'reader-capture.private.json') ||
    [origin.request, origin.admission, origin.preparedScope].some(
      (row) =>
        !row.expectedIdentity || !row.expectedParentIdentity || (Number(row.expectedIdentity.mode) & 0o777) !== 0o400,
    )
  )
    throw new Error('Original xcsh reader source origin required');
  const bindings = {
    request: origin.request,
    admission: origin.admission,
    scope: origin.preparedScope,
    ...witness.inputs,
  };
  const monitor = await monitorOriginalInputs(bindings);
  try {
    const read = async (binding: OriginalInputBinding) => {
      const current = await readOwnedInstalledInput(binding.path, 4 * 1024 * 1024);
      assertSameOriginalInput(binding, current.binding);
      return decodeEvidenceObject(current.bytes);
    };
    const request = await read(origin.request),
      admission = await read(origin.admission),
      prepared = await read(origin.preparedScope);
    const scope = request.scope as Record<string, unknown> | undefined;
    const inputs = request.inputs as Record<string, OriginalInputBinding> | undefined;
    if (!inputs) throw new Error('Original xcsh request inputs required');
    const executables = request.executables as Record<string, Record<string, unknown>> | undefined;
    const script = inputs?.['script:xcsh_creation_reader.py'],
      python = inputs?.python;
    const expectedArgs = [
      '-I',
      '-B',
      script?.path,
      '--request',
      origin.request.path,
      '--sha256',
      origin.request.sha256,
    ];
    if (
      request.schemaVersion !== 1 ||
      request.kind !== 'original-xcsh-creation-window' ||
      request.originalStartMs !== witness.originalBudget.start ||
      request.deadlineMs !== witness.originalBudget.deadline ||
      request.windowMs !== 45000 ||
      !sameIdentity(request.executor, origin.parent) ||
      !Number.isSafeInteger(request.startupDeadlineMs) ||
      (request.startupDeadlineMs as number) <= witness.originalBudget.start ||
      (request.startupDeadlineMs as number) > witness.originalBudget.deadline ||
      scope?.path !== origin.preparedScope.path ||
      scope?.sha256 !== origin.preparedScope.sha256 ||
      scope?.planSha256 !== origin.planSha256 ||
      !Array.isArray(scope?.targets) ||
      !scope.targets.length ||
      scope.targets.length > 128 ||
      prepared.schema_version !== 2 ||
      prepared.scope_sha256 !== origin.planSha256 ||
      prepared.directory !== dirname(origin.preparedScope.path) ||
      prepared.provider_executable_sha256 !== origin.providerSha256 ||
      JSON.stringify(prepared.resources) !== JSON.stringify(scope.targets) ||
      !script ||
      !/^[a-f0-9]{64}$/.test(script.sha256) ||
      !python ||
      python.sha256 !== witness.pythonSha256 ||
      executables?.bootstrap?.path !== python.path ||
      executables.bootstrap.sha256 !== witness.pythonSha256 ||
      executables?.xcsh?.sha256 !== origin.providerSha256 ||
      !Object.entries(inputs).some(
        ([name, row]) =>
          /^registry\.terraform\.io\/f5-sales-demo\/xcsh:terraform-provider-xcsh_v[0-9]+\.[0-9]+\.[0-9]+$/.test(name) &&
          row.path === executables?.xcsh?.path &&
          row.sha256 === origin.providerSha256,
      ) ||
      admission.schemaVersion !== 1 ||
      admission.kind !== 'original-installed-xcsh-reader-admission' ||
      !sameOwner(admission.owner as CeOwner, origin.owner) ||
      !sameIdentity(admission.parent, origin.parent) ||
      admission.requestSha256 !== origin.request.sha256 ||
      !sameIdentity(admission.identity, witness.identity) ||
      JSON.stringify(admission.args) !== JSON.stringify(expectedArgs) ||
      JSON.stringify(admission.budget) !== JSON.stringify(witness.originalBudget)
    )
      throw new Error('Original xcsh request, parent, scope or actor source differs');
    assertSameOriginalInput(origin.preparedScope, inputs['prepared:scope']);
    if (witness.inputs.submission) {
      const submission = await read(witness.inputs.submission);
      const executable = submission.executable as Record<string, unknown> | undefined;
      if (JSON.stringify(submission.args) !== JSON.stringify(expectedArgs) || executable?.path !== python.path)
        throw new Error('Original xcsh submitted command source differs');
    }
    await monitor.assertOriginal();
  } finally {
    monitor.close();
  }
}

async function inspectAccessOrigin(witness: OriginalReaderGroupClosure) {
  const origin = witness.origin;
  if (origin?.kind !== 'original-installed-gcp-access-reader-origin') return;
  const prefix = originalAccessReaderPrefix(origin.family, origin.role);
  if (
    origin.schemaVersion !== 1 ||
    origin.owner?.provider !== 'gcp' ||
    origin.owner.engine !== 'terraform' ||
    Object.keys(origin.owner).sort().join(',') !== 'account,deploymentId,engine,provider,region' ||
    ['account', 'region', 'deploymentId'].some(
      (key) => typeof origin.owner[key as keyof CeOwner] !== 'string' || !origin.owner[key as keyof CeOwner],
    ) ||
    !['before', 'after'].includes(origin.phase) ||
    !/^[1-9][0-9]{0,19}$/.test(origin.instanceId) ||
    !Number.isSafeInteger(origin.parent?.pid) ||
    origin.parent.pid <= 0 ||
    origin.parent.group !== origin.parent.pid ||
    !/^[1-9][0-9]*$/.test(origin.parent.start) ||
    origin.parent.boot !== witness.identity.boot ||
    dirname(witness.directory) !== origin.executionDirectory ||
    !basename(witness.directory).startsWith(prefix) ||
    origin.request?.path !== join(witness.directory, 'reader-source.private.json') ||
    witness.inputs.capture?.path !== join(witness.directory, 'reader-final.private.json') ||
    typeof origin.admissionRecorded !== 'boolean' ||
    origin.admissionRecorded !== !!origin.admission ||
    (origin.admission && origin.admission.path !== join(witness.directory, 'reader-admission.private.json')) ||
    [origin.request, ...(origin.admission ? [origin.admission] : [])].some(
      (row) =>
        !row.expectedIdentity || !row.expectedParentIdentity || (Number(row.expectedIdentity.mode) & 0o777) !== 0o400,
    )
  )
    throw new Error('Original access reader source origin required');
  const monitor = await monitorOriginalInputs({
    request: origin.request,
    ...(origin.admission ? { admission: origin.admission } : {}),
    ...witness.inputs,
  });
  try {
    const read = async (binding: OriginalInputBinding) => {
      const file = await readOwnedInstalledInput(binding.path, 1024 * 1024);
      assertSameOriginalInput(binding, file.binding);
      return decodeEvidenceObject(file.bytes);
    };
    const request = await read(origin.request),
      capture = await read(witness.inputs.capture);
    const python = request.python as Record<string, unknown> | undefined;
    const executable = request.executable as Record<string, unknown> | undefined;
    if (
      request.schemaVersion !== 1 ||
      request.kind !== 'original-installed-gcp-access-reader-request' ||
      !sameOwner(request.owner as CeOwner, origin.owner) ||
      !sameIdentity(request.parent, origin.parent) ||
      request.family !== origin.family ||
      request.role !== origin.role ||
      request.phase !== origin.phase ||
      request.instanceId !== origin.instanceId ||
      request.executionDirectory !== origin.executionDirectory ||
      JSON.stringify(request.budget) !== JSON.stringify(witness.originalBudget) ||
      !Array.isArray(request.args) ||
      !request.args.length ||
      request.args.some((arg) => typeof arg !== 'string' || arg.includes('\0')) ||
      !python ||
      python.sha256 !== witness.pythonSha256 ||
      typeof python.path !== 'string' ||
      !executable ||
      executable.sha256 !== witness.executableSha256 ||
      typeof executable.path !== 'string'
    )
      throw new Error('Original access request ownership, parent or command differs');
    if (origin.admission) {
      const admission = await read(origin.admission);
      if (
        admission.schemaVersion !== 1 ||
        admission.kind !== 'original-installed-gcp-access-reader-admission' ||
        admission.requestSha256 !== origin.request.sha256 ||
        !sameIdentity(admission.identity, witness.identity) ||
        JSON.stringify(admission.args) !== JSON.stringify(request.args) ||
        JSON.stringify(admission.budget) !== JSON.stringify(witness.originalBudget)
      )
        throw new Error('Original access reader admission differs');
      assertOriginalAccessReaderStdin(request.stdin, admission.stdin);
      if (JSON.stringify(capture.stdin) !== JSON.stringify(admission.stdin))
        throw new Error('Original access capture stdin snapshot differs');
    } else if (capture.submitted !== false)
      throw new Error('Unadmitted original access reader cannot have a submission');
    if (witness.inputs.submission) {
      const submission = await read(witness.inputs.submission),
        submitted = submission.executable as Record<string, unknown> | undefined;
      if (
        JSON.stringify(submission.args) !== JSON.stringify(request.args) ||
        submitted?.path !== executable.path ||
        JSON.stringify(submission.stdin) !== JSON.stringify(capture.stdin)
      )
        throw new Error('Original access submitted command or stdin differs');
      assertOriginalAccessReaderStdin(request.stdin, submission.stdin);
    }
    await monitor.assertOriginal();
  } finally {
    monitor.close();
  }
}

async function inspectBootstrapPublisherOrigin(witness: OriginalReaderGroupClosure) {
  const origin = witness.origin;
  if (origin?.kind !== 'original-bootstrap-publisher-origin') return;
  if (
    origin.schemaVersion !== 1 ||
    origin.owner?.provider !== 'gcp' ||
    origin.owner.engine !== 'terraform' ||
    !/^[a-f0-9]{64}$/.test(origin.planSha256) ||
    !/^[a-f0-9]{32}$/.test(origin.nonce) ||
    witness.directory !== join(origin.executionDirectory, '.xcsh-original-bootstrap', origin.planSha256) ||
    origin.request?.path !== join(witness.directory, `publisher-${origin.nonce}-request.json`) ||
    origin.claim?.path !== join(witness.directory, `claim-${origin.nonce}.json`) ||
    witness.inputs.capture?.path !== join(witness.directory, `publication-${origin.nonce}.json`) ||
    typeof origin.admissionRecorded !== 'boolean' ||
    origin.admissionRecorded !== !!origin.admission ||
    (origin.admission &&
      origin.admission.path !== join(witness.directory, `publisher-${origin.nonce}-admission.json`)) ||
    [origin.request, origin.claim, ...(origin.admission ? [origin.admission] : [])].some(
      (row) =>
        !row.expectedIdentity || !row.expectedParentIdentity || (Number(row.expectedIdentity.mode) & 0o777) !== 0o400,
    )
  )
    throw new Error('Original bootstrap publisher source origin required');
  const monitor = await monitorOriginalInputs({
    request: origin.request,
    claim: origin.claim,
    ...(origin.admission ? { admission: origin.admission } : {}),
    ...witness.inputs,
  });
  try {
    const read = async (binding: OriginalInputBinding) => {
      const file = await readOwnedInstalledInput(binding.path, 1024 * 1024);
      assertSameOriginalInput(binding, file.binding);
      return decodeEvidenceObject(file.bytes);
    };
    const request = await read(origin.request),
      claim = await read(origin.claim),
      capture = await read(witness.inputs.capture);
    const python = request.python as Record<string, unknown> | undefined,
      script = request.script as Record<string, unknown> | undefined;
    const args = request.args,
      actor = claim.executor as RecordedProcessGroupIdentity | undefined;
    if (
      request.schemaVersion !== 1 ||
      request.kind !== 'original-bootstrap-publisher-request' ||
      !sameOwner(request.owner as CeOwner, origin.owner) ||
      request.planSha256 !== origin.planSha256 ||
      request.nonce !== origin.nonce ||
      JSON.stringify(request.budget) !== JSON.stringify(witness.originalBudget) ||
      typeof request.grantSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(request.grantSha256) ||
      python?.sha256 !== witness.pythonSha256 ||
      typeof python?.path !== 'string' ||
      typeof script?.path !== 'string' ||
      !Array.isArray(args) ||
      args.length !== 11 ||
      args[0] !== '-I' ||
      args[1] !== '-B' ||
      args[2] !== script.path ||
      args[3] !== witness.directory ||
      typeof args[4] !== 'string' ||
      !new RegExp(`^\\.grant-${origin.nonce}-[a-f0-9]{32}\\.partial$`).test(args[4]) ||
      args[5] !== origin.nonce ||
      args[6] !== request.grantSha256 ||
      args
        .slice(7)
        .some(
          (value, index) =>
            value !== origin.request.expectedParentIdentity?.[(['dev', 'ino', 'uid', 'mode'] as const)[index]],
        ) ||
      claim.schemaVersion !== 1 ||
      claim.kind !== 'original-gcp-bootstrap-grant-claim' ||
      !sameOwner(claim.owner as CeOwner, origin.owner) ||
      claim.planSha256 !== origin.planSha256 ||
      claim.nonce !== origin.nonce ||
      claim.originalStartMs !== witness.originalBudget.start ||
      claim.originalDeadlineMs !== witness.originalBudget.deadline ||
      typeof claim.nodeName !== 'string' ||
      !/^[a-z][a-z0-9-]{0,62}$/.test(claim.nodeName) ||
      typeof claim.tokenName !== 'string' ||
      !/^[a-z][a-z0-9-]{0,62}$/.test(claim.tokenName) ||
      typeof claim.jwtSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(claim.jwtSha256) ||
      !actor ||
      !Number.isSafeInteger(actor.pid) ||
      actor.pid <= 0 ||
      actor.group !== actor.pid ||
      actor.boot !== witness.identity.boot ||
      !/^[1-9][0-9]*$/.test(actor.start)
    )
      throw new Error('Original bootstrap publisher request, claim or actor differs');
    assertSameOriginalInput(origin.claim, request.claim as OriginalInputBinding);
    if (origin.admission) {
      const admission = await read(origin.admission);
      if (
        admission.schemaVersion !== 1 ||
        admission.kind !== 'original-bootstrap-publisher-admission' ||
        admission.requestSha256 !== origin.request.sha256 ||
        !sameIdentity(admission.identity, witness.identity) ||
        JSON.stringify(admission.args) !== JSON.stringify(args) ||
        JSON.stringify(admission.budget) !== JSON.stringify(witness.originalBudget)
      )
        throw new Error('Original bootstrap publisher admission differs');
    } else if (capture.submitted !== false) throw new Error('Unadmitted bootstrap publisher cannot submit');
    if (witness.inputs.submission) {
      const submitted = await read(witness.inputs.submission),
        executable = submitted.executable as Record<string, unknown> | undefined;
      if (
        JSON.stringify(submitted.args) !== JSON.stringify(args) ||
        executable?.path !== python.path ||
        submitted.stdin !== undefined
      )
        throw new Error('Original bootstrap publisher submitted command differs');
    }
    await monitor.assertOriginal();
  } finally {
    monitor.close();
  }
}

async function inspect(witness: OriginalReaderGroupClosure) {
  const expected = [
    'bootstrap',
    'completion',
    'gate',
    ...(witness.inputs.submission ? ['submission'] : []),
    ...(witness.inputs.capture ? ['capture'] : []),
  ];
  if (
    witness.schemaVersion !== 1 ||
    witness.kind !== 'original-reader-group-closure' ||
    witness.executionAccepted !== false ||
    witness.physicalGroupAbsent !== true ||
    Object.keys(witness.inputs).sort().join(',') !== expected.sort().join(',') ||
    ![witness.pythonSha256, witness.executableSha256, witness.gateSha256].every((value) =>
      /^[a-f0-9]{64}$/.test(value),
    ) ||
    !Number.isSafeInteger(witness.originalBudget.start) ||
    !Number.isSafeInteger(witness.originalBudget.deadline) ||
    witness.originalBudget.deadline <= witness.originalBudget.start
  )
    throw new Error('Original reader group closure source required');
  if (
    witness.origin &&
    ![
      'original-installed-guest-reader-origin',
      'original-installed-xcsh-reader-origin',
      'original-installed-gcp-access-reader-origin',
      'original-bootstrap-publisher-origin',
    ].includes(witness.origin.kind)
  )
    throw new Error('Unknown original reader source origin');
  const root = dirname(witness.inputs.completion.path);
  if (
    dirname(dirname(root)) !== witness.directory ||
    basename(dirname(root)) !== 'executor-diagnostics' ||
    witness.inputs.bootstrap.path !== join(root, 'bootstrap.json') ||
    witness.inputs.gate.path !== join(root, 'gate.py') ||
    witness.inputs.completion.path !== join(root, 'completion.private.json') ||
    (witness.inputs.submission && witness.inputs.submission.path !== join(root, 'submission.private.json')) ||
    Object.values(witness.inputs).some(
      (row) =>
        !row.expectedIdentity || !row.expectedParentIdentity || (Number(row.expectedIdentity.mode) & 0o777) !== 0o400,
    )
  )
    throw new Error('Original reader evidence directory or identity differs');
  const monitor = await monitorOriginalInputs(witness.inputs);
  try {
    const read = async (name: string) => {
      const expected = witness.inputs[name];
      const current = await readOwnedInstalledInput(expected.path, 1024 * 1024);
      assertSameOriginalInput(expected, current.binding);
      return current;
    };
    const boot = decodeEvidenceObject((await read('bootstrap')).bytes);
    const complete = decodeEvidenceObject((await read('completion')).bytes);
    const gate = await read('gate');
    if (
      (['pid', 'group', 'start', 'boot'] as const).some((key) => boot[key] !== witness.identity[key]) ||
      boot.pythonSha256 !== witness.pythonSha256 ||
      !Number.isSafeInteger(boot.ppid) ||
      (boot.ppid as number) < 1 ||
      gate.binding.sha256 !== witness.gateSha256 ||
      !sameIdentity(complete.identity, witness.identity) ||
      complete.pid !== witness.identity.pid ||
      typeof complete.originalGroupClosed !== 'boolean' ||
      complete.originalGroupClosed !== witness.producerReportedClosed ||
      complete.signalsSent !== false ||
      (complete.actualExitCode !== null && !Number.isSafeInteger(complete.actualExitCode)) ||
      complete.originalDeadlineMs !== witness.originalBudget.deadline ||
      typeof complete.captureClosed !== 'boolean' ||
      complete.captureClosed !== witness.captureComplete ||
      complete.stdoutPath !== join(root, 'stdout.private') ||
      complete.stderrPath !== join(root, 'stderr.private') ||
      !Number.isSafeInteger(complete.finalStartedMs) ||
      !Number.isSafeInteger(complete.finalDeadlineMs) ||
      (complete.finalDeadlineMs as number) - (complete.finalStartedMs as number) !== 300000 ||
      !Number.isSafeInteger(complete.finishedMs) ||
      (complete.finishedMs as number) < (complete.finalStartedMs as number)
    )
      throw new Error('Original bootstrap, completion, actor or reserve differs');
    if (complete.submitted === true) {
      if (!witness.inputs.submission) throw new Error('Original submitted reader evidence missing');
      const submission = decodeEvidenceObject((await read('submission')).bytes);
      const executable = submission.executable as Record<string, unknown> | undefined;
      if (
        submission.schemaVersion !== 1 ||
        submission.pid !== witness.identity.pid ||
        submission.originalStartMs !== witness.originalBudget.start ||
        submission.originalDeadlineMs !== witness.originalBudget.deadline ||
        executable?.sha256 !== witness.executableSha256
      )
        throw new Error('Original reader submission source differs');
    } else if (complete.submitted !== false) throw new Error('Original reader submission status missing');
    if (witness.inputs.capture) {
      const capture = decodeEvidenceObject((await read('capture')).bytes);
      if (
        !sameIdentity(capture.identity, witness.identity) ||
        capture.pid !== witness.identity.pid ||
        capture.originalDeadlineMs !== witness.originalBudget.deadline ||
        capture.stdoutPath !== complete.stdoutPath ||
        capture.stderrPath !== complete.stderrPath ||
        capture.finalStartedMs !== complete.finalStartedMs ||
        capture.finalDeadlineMs !== complete.finalDeadlineMs
      )
        throw new Error('Original owning reader capture binding differs');
    }
    await inspectGuestOrigin(witness);
    await inspectXcshOrigin(witness);
    await inspectAccessOrigin(witness);
    await inspectBootstrapPublisherOrigin(witness);
    await assertRecordedProcessGroupAbsent(witness.identity);
    await monitor.assertOriginal();
  } finally {
    monitor.close();
  }
}

/** The owning reader supplies its original capture and compiled source pins.
 * Closure is independent of capture completeness and never clears failed locks. */
export async function collectOriginalReaderGroupClosure(input: {
  readonly directory: string;
  readonly capture: FinalExecutionCapture;
  readonly originalBudget: Readonly<{ start: number; deadline: number }>;
  readonly pythonSha256: string;
  readonly executableSha256: string;
  readonly gateSha256: string;
  readonly captureBinding?: OriginalInputBinding;
  readonly origin?: OriginalReaderOrigin;
}): Promise<OriginalReaderGroupClosure> {
  if (!input.capture.identity) throw new Error('Original captured reader identity required');
  const root = dirname(input.capture.stdoutPath);
  const inputs: Record<string, OriginalInputBinding> = {};
  if (input.captureBinding) inputs.capture = input.captureBinding;
  for (const [key, file] of [
    ['bootstrap', 'bootstrap.json'],
    ['completion', 'completion.private.json'],
    ['gate', 'gate.py'],
  ] as const)
    inputs[key] = (await readOwnedInstalledInput(join(root, file), 1024 * 1024)).binding;
  const complete = decodeEvidenceObject((await readOwnedInstalledInput(inputs.completion.path, 1024 * 1024)).bytes);
  if (input.capture.submitted)
    inputs.submission = (await readOwnedInstalledInput(join(root, 'submission.private.json'), 1024 * 1024)).binding;
  if (
    !sameIdentity(complete.identity, input.capture.identity) ||
    complete.pid !== input.capture.pid ||
    complete.originalDeadlineMs !== input.capture.originalDeadlineMs ||
    complete.finalStartedMs !== input.capture.finalStartedMs ||
    complete.finalDeadlineMs !== input.capture.finalDeadlineMs ||
    complete.submitted !== input.capture.submitted
  )
    throw new Error('Original captured reader and final completion differ');
  const witness: OriginalReaderGroupClosure = {
    schemaVersion: 1,
    kind: 'original-reader-group-closure',
    ...(input.origin ? { origin: Object.freeze(structuredClone(input.origin)) } : {}),
    directory: input.directory,
    identity: Object.freeze({ ...input.capture.identity }),
    originalBudget: Object.freeze({ ...input.originalBudget }),
    pythonSha256: input.pythonSha256,
    executableSha256: input.executableSha256,
    gateSha256: input.gateSha256,
    inputs: Object.freeze(inputs),
    physicalGroupAbsent: true,
    producerReportedClosed: complete.originalGroupClosed as boolean,
    captureComplete: complete.captureClosed as boolean,
    executionAccepted: false,
  };
  await inspect(witness);
  return Object.freeze(witness);
}
export async function assertOriginalReaderGroupClosure(witness: OriginalReaderGroupClosure): Promise<void> {
  await inspect(structuredClone(witness));
}

export interface OriginalReaderSourceClosure {
  readonly name: string;
  readonly attemptCount: number;
  readonly witnesses: readonly OriginalReaderGroupClosure[];
  readonly invocationCount?: number;
  readonly unspawned?: readonly Readonly<{ request: OriginalInputBinding; evidence: OriginalInputBinding }>[];
}
export async function assertOriginalUnspawnedSource(
  input: NonNullable<OriginalReaderSourceClosure['unspawned']>[number],
  owner: CeOwner,
) {
  const monitor = await monitorOriginalInputs(input);
  try {
    const read = async (binding: OriginalInputBinding) => {
      const file = await readOwnedInstalledInput(binding.path, 1024 * 1024);
      assertSameOriginalInput(binding, file.binding);
      return decodeEvidenceObject(file.bytes);
    };
    const request = await read(input.request),
      evidence = await read(input.evidence);
    const budget = request.budget as { start?: unknown; deadline?: unknown } | undefined;
    const python = request.python as { path?: unknown; sha256?: unknown } | undefined;
    const expectedExecutable = request.executable ?? request.python;
    const final = evidence.finalReserve as
      | {
          schemaVersion?: unknown;
          kind?: unknown;
          identity?: { pid?: unknown; group?: unknown; start?: unknown; boot?: unknown };
          originalStartMs?: unknown;
          originalDeadlineMs?: unknown;
          finalStartedMs?: unknown;
          finalDeadlineMs?: unknown;
        }
      | undefined;
    if (evidence.schemaVersion === 1 && (evidence.finalReserve !== undefined || request.finalReserve !== undefined))
      throw new Error('Legacy original unspawned source cannot adopt a final reserve');
    if (evidence.schemaVersion === 2) {
      if (
        evidence.executionAccepted !== false ||
        evidence.executionDeadlineMs !== (final?.finalDeadlineMs ?? budget?.deadline)
      )
        throw new Error('Original unspawned execution refusal and deadline differ');
      if (final) {
        if (
          request.kind !== 'original-installed-gcp-access-reader-request' ||
          request.phase !== 'after' ||
          JSON.stringify(request.finalReserve) !== JSON.stringify(final) ||
          JSON.stringify(request.parent) !== JSON.stringify(final.identity) ||
          final.schemaVersion !== 1 ||
          final.kind !== 'original-final-reader-reserve' ||
          final.originalStartMs !== budget?.start ||
          final.originalDeadlineMs !== budget?.deadline ||
          !Number.isSafeInteger(final.finalStartedMs) ||
          !Number.isSafeInteger(final.finalDeadlineMs) ||
          (final.finalStartedMs as number) < (budget?.start as number) ||
          (evidence.invocationStartedMs as number) < (final.finalStartedMs as number) ||
          (final.finalDeadlineMs as number) - (final.finalStartedMs as number) !== 300000 ||
          !Number.isSafeInteger(final.identity?.pid) ||
          (final.identity?.pid as number) < 1 ||
          final.identity?.group !== final.identity?.pid ||
          typeof final.identity?.start !== 'string' ||
          !/^[0-9]+$/.test(final.identity.start) ||
          typeof final.identity?.boot !== 'string' ||
          !/^[a-f0-9-]{36}$/.test(final.identity.boot)
        )
          throw new Error('Original unspawned final reserve or parent differs');
        await assertRecordedProcessGroupAbsent({
          pid: final.identity.pid as number,
          group: final.identity.group as number,
          boot: final.identity.boot as string,
          start: final.identity.start as string,
        });
      } else if (request.finalReserve !== undefined || request.phase === 'after') {
        throw new Error('Original unspawned final reserve is missing');
      }
      if (
        evidence.phase === 'deadline-validation' &&
        (evidence.invocationStartedMs as number) >= (budget?.start as number) &&
        (evidence.invocationStartedMs as number) < (evidence.executionDeadlineMs as number)
      )
        throw new Error('Original unspawned deadline refusal does not match its clock');
      if (evidence.phase === 'cancellation' && evidence.cancellationRequested !== true)
        throw new Error('Original unspawned cancellation source required');
      if (
        evidence.phase === 'loader-validation' &&
        (!Array.isArray(evidence.loaderVariables) || !evidence.loaderVariables.length)
      )
        throw new Error('Original unspawned loader source required');
    }

    if (
      request.schemaVersion !== 1 ||
      !['original-bootstrap-publisher-request', 'original-installed-gcp-access-reader-request'].includes(
        request.kind as string,
      ) ||
      !sameOwner(request.owner as CeOwner, owner) ||
      !Number.isSafeInteger(budget?.start) ||
      !Number.isSafeInteger(budget?.deadline) ||
      (budget?.deadline as number) - (budget?.start as number) !== 7200000 ||
      ![1, 2].includes(evidence.schemaVersion as number) ||
      evidence.kind !== 'original-executor-unspawned' ||
      (evidence.schemaVersion === 1
        ? evidence.phase !== 'initial-input-guard'
        : evidence.layer === 'command'
          ? evidence.phase !== 'owning-command-guard'
          : evidence.layer !== 'native' ||
            !['initial-input-guard', 'loader-validation', 'deadline-validation', 'cancellation'].includes(
              evidence.phase as string,
            )) ||
      evidence.nativeSpawnInvoked !== false ||
      evidence.commandSubmitted !== false ||
      evidence.signalsSent !== false ||
      evidence.directory !== dirname(input.request.path) ||
      dirname(dirname(dirname(input.evidence.path))) !== evidence.directory ||
      basename(dirname(dirname(input.evidence.path))) !== 'executor-unspawned' ||
      basename(input.evidence.path) !== 'source.private.json' ||
      JSON.stringify(evidence.args) !== JSON.stringify(request.args) ||
      evidence.originalStartMs !== budget?.start ||
      evidence.originalDeadlineMs !== budget?.deadline ||
      JSON.stringify(evidence.python) !== JSON.stringify({ path: python?.path, sha256: python?.sha256 }) ||
      JSON.stringify(evidence.executable) !==
        JSON.stringify({
          path: (expectedExecutable as typeof python)?.path,
          sha256: (expectedExecutable as typeof python)?.sha256,
        }) ||
      evidence.gateSha256 !== createHash('sha256').update(signalFreeBootstrapSource).digest('hex') ||
      !Number.isSafeInteger(evidence.invocationStartedMs) ||
      (evidence.invocationStartedMs as number) < (budget?.start as number) ||
      ((evidence.invocationStartedMs as number) >= ((final?.finalDeadlineMs ?? budget?.deadline) as number) &&
        !(
          evidence.schemaVersion === 2 &&
          ['loader-validation', 'deadline-validation', 'owning-command-guard'].includes(evidence.phase as string)
        )) ||
      ![input.request, input.evidence].every(
        (binding) =>
          binding.expectedIdentity &&
          binding.expectedParentIdentity &&
          (Number(binding.expectedIdentity.mode) & 0o777) === 0o400,
      )
    )
      throw new Error('Original unspawned source request, execution or owner differs');
    await monitor.assertOriginal();
  } finally {
    monitor.close();
  }
}
function sameOwner(a: CeOwner, b: CeOwner) {
  return (['provider', 'engine', 'account', 'region', 'deploymentId'] as const).every((key) => a?.[key] === b[key]);
}
async function assertSourceCoverage(
  sources: readonly OriginalReaderSourceClosure[],
  required: readonly string[],
  owner: CeOwner,
) {
  if (
    !required.length ||
    new Set(required).size !== required.length ||
    required.some((name) => !/^[a-z][a-z0-9-]{0,63}$/.test(name)) ||
    sources
      .map((row) => row.name)
      .sort()
      .join(',') !== required.slice().sort().join(',')
  )
    throw new Error('Original reader source coverage differs');
  const original = new Map<string, string>();
  const unspawnedInputs = new Set<string>();
  for (const source of sources) {
    if (source.unspawned !== undefined) {
      if (
        !Array.isArray(source.unspawned) ||
        !Number.isSafeInteger(source.invocationCount) ||
        source.invocationCount !== source.attemptCount + source.unspawned.length ||
        new Set(source.unspawned.map((row) => row.evidence.path)).size !== source.unspawned.length
      )
        throw new Error('Original unspawned invocation coverage incomplete');
      for (const input of source.unspawned) {
        if (unspawnedInputs.has(input.evidence.path))
          throw new Error('Original unspawned invocation attributed to multiple sources');
        unspawnedInputs.add(input.evidence.path);
        await assertOriginalUnspawnedSource(input, owner);
      }
    } else if (source.invocationCount !== undefined && source.invocationCount !== source.attemptCount)
      throw new Error('Original invocation coverage differs');
    if (
      !Number.isSafeInteger(source.attemptCount) ||
      source.attemptCount < 0 ||
      source.attemptCount !== source.witnesses.length
    )
      throw new Error('Original reader attempt coverage incomplete');
    for (const witness of source.witnesses) {
      if (witness.origin && !sameOwner(witness.origin.owner, owner))
        throw new Error('Original reader set owner differs');
      const id = JSON.stringify(witness.identity),
        value = JSON.stringify(witness);
      const prior = original.get(id);
      if (prior && prior !== value) throw new Error('Original shared reader group evidence differs');
      original.set(id, value);
      await assertOriginalReaderGroupClosure(witness);
    }
  }
}
/** The concrete factory declares every original source and its actual attempt
 * count. Source coverage is not guest/service acceptance or execute authority. */
export async function persistOriginalReaderGroupSet(input: {
  readonly store: CeDeploymentStore;
  readonly owner: CeOwner;
  readonly requiredSources: readonly string[];
  readonly sources: readonly OriginalReaderSourceClosure[];
}): Promise<Readonly<Record<string, OriginalInputBinding>>> {
  const owner = structuredClone(input.owner),
    sources = structuredClone(input.sources),
    required = [...input.requiredSources];
  await input.store.verify();
  if (!sameOwner(input.store.owner, owner)) throw new Error('Original reader group store owner differs');
  await assertSourceCoverage(sources, required, owner);
  const record = await input.store.writeImmutableBytes(
    `immutable-reader-groups-${randomUUID()}.json`,
    Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        kind: 'original-reader-group-set',
        owner,
        requiredSources: required,
        sources,
        executionAccepted: false,
        guestAcceptanceComplete: false,
      }),
    ),
  );
  return Object.freeze({ [`reader-group-set:${record.binding.sha256}`]: record.binding });
}
export async function assertOriginalReaderGroupInputs(input: {
  readonly inputs: Readonly<Record<string, OriginalInputBinding>>;
  readonly owner: CeOwner;
  readonly requiredSources: readonly string[];
}): Promise<void> {
  const values = Object.values(input.inputs);
  if (values.length !== 1) throw new Error('One original reader group set required');
  const binding = values[0];
  const monitor = await monitorOriginalInputs(input.inputs);
  try {
    const file = await readOwnedInstalledInput(binding.path, 16 * 1024 * 1024);
    assertSameOriginalInput(binding, file.binding);
    const record = decodeEvidenceObject(file.bytes);
    if (
      record.schemaVersion !== 1 ||
      record.kind !== 'original-reader-group-set' ||
      record.executionAccepted !== false ||
      record.guestAcceptanceComplete !== false ||
      !sameOwner(record.owner as CeOwner, input.owner) ||
      !Array.isArray(record.requiredSources) ||
      !Array.isArray(record.sources) ||
      record.requiredSources.slice().sort().join(',') !== input.requiredSources.slice().sort().join(',')
    )
      throw new Error('Original reader set owner or source coverage differs');
    await assertSourceCoverage(
      record.sources as unknown as readonly OriginalReaderSourceClosure[],
      input.requiredSources,
      input.owner,
    );
    await monitor.assertOriginal();
  } finally {
    monitor.close();
  }
}
