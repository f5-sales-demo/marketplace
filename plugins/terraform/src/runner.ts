import { createHash, randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, readdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { acquireProcessLock } from '../../platform/src/ce/process-lock';
import { hasArtifactRetirement, readPrivateArtifactRetirement, retirePrivateArtifacts } from './artifact-retirement';
import {
  type ExecutableIdentity,
  encode,
  executableIdentity,
  type IndependentCleanupEvidence,
  inputDigests,
} from './cleanup-verifier-worker';
import { TerraformCommandError, type TerraformFailureCategory, terraformFailureCategories } from './failure';
import { parseTerraformFieldPath, projectTerraformFieldPath } from './field-paths';
import {
  type CleanupVerifier,
  cleanupRequest,
  executeIndependentCleanup,
  validateIndependentCleanup,
} from './independent-cleanup';

export interface Invocation {
  cwd: string;
  args: string[];
  env: Record<string, string | undefined>;
  signal?: AbortSignal;
  expectedExecutable?: ExecutableIdentity;
}
type Executor = (request: Invocation) => Promise<{
  code: number;
  stdout: string;
  failureCategory?: TerraformFailureCategory;
  executable?: ExecutableIdentity;
}>;
export interface Deployment {
  schemaVersion: 1;
  deploymentId: string;
  stage?: string;
  engine: 'terraform';
  scope: { cloud: 'aws' | 'azure'; account: string; region: string };
  terraformVersion: string;
  configuration: string;
  providerLock: string;
  backendIdentity: string;
}
interface Manifest extends Omit<Deployment, 'configuration' | 'providerLock'> {
  configurationSha256: string;
  providerLockSha256: string;
}
export interface TerraformActionIntent {
  address: string;
  type: string;
  providerName: string;
  configValuesSha256: string;
}
/** Internal import-only stage; cloud adapters must independently establish ownership first. */
export interface TerraformImportIntent {
  address: string;
  type: string;
  providerName: string;
  idSha256: string;
}
/** State-only withdrawal after a cloud adapter independently verifies restoration and ownership. */
export interface TerraformRelinquishmentIntent extends TerraformImportIntent {}
export interface PlanReceipt {
  schemaVersion: 1;
  deploymentId: string;
  engine: 'terraform';
  backendIdentity: string;
  configurationSha256: string;
  providerLockSha256: string;
  planSha256: string;
  changes: Array<{ address: string; type: string; actions: string[] }>;
  noChanges: boolean;
  actionInvocations?: TerraformActionIntent[];
  imports?: TerraformImportIntent[];
  relinquishments?: TerraformRelinquishmentIntent[];
  operation?: 'destroy';
  /** Owning refresh intent, persisted with native saved bytes before returning a reply. */
  refreshOriginSha256?: string;
}
// Terraform's plan JSON uses a legacy spelling for this flag.
const planApplicationFlag = ['apply', 'able'].join('');
const cliConfig = 'provider_installation {\n  direct {}\n}\ndisable_checkpoint = true\n';
const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
type Json = Record<string, unknown>;
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Terraform JSON object is malformed');
  return value as Json;
}
function decode(value: string): Json {
  try {
    return object(JSON.parse(value));
  } catch {
    throw new Error('Terraform returned malformed JSON');
  }
}
const safeId = /^[a-z][a-z0-9-]{0,62}$/;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function changeActions(value: unknown, output = false, relinquishment = false): string[] {
  const allowed = output
    ? ['no-op', 'create', 'update', 'delete']
    : [
        'no-op',
        'read',
        'create',
        'update',
        'delete',
        'delete,create',
        'create,delete',
        ...(relinquishment ? ['forget'] : []),
      ];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || item.includes(',')) ||
    !allowed.includes(value.join(','))
  )
    throw new Error('Terraform change actions are malformed or unsupported');
  return value as string[];
}

/** Exact private saved journal schema; byte/owner joins belong to the reading runner. */
function decodeSavedPlanJournal(journalBytes: Buffer) {
  const journal = decode(journalBytes.toString());
  const journalKeys = [
    'receipt',
    'state',
    ...(Object.hasOwn(journal, 'reconciledEvidenceSha256') ? ['reconciledEvidenceSha256'] : []),
    ...(Object.hasOwn(journal, 'execution') ? ['execution'] : []),
  ];
  if (
    canonical(Object.keys(journal).sort()) !== canonical(journalKeys.sort()) ||
    !['planned', 'applying', 'applied'].includes(String(journal.state)) ||
    (Object.hasOwn(journal, 'reconciledEvidenceSha256') &&
      (journal.state !== 'applied' ||
        typeof journal.reconciledEvidenceSha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(journal.reconciledEvidenceSha256)))
  )
    throw Error('Current saved-plan journal schema differs');
  const value = object(journal.receipt),
    required = [
      'schemaVersion',
      'deploymentId',
      'engine',
      'backendIdentity',
      'configurationSha256',
      'providerLockSha256',
      'planSha256',
      'changes',
      'noChanges',
    ],
    optional = ['actionInvocations', 'imports', 'relinquishments', 'operation', 'refreshOriginSha256'].filter((key) =>
      Object.hasOwn(value, key),
    );
  if (
    canonical(Object.keys(value).sort()) !== canonical([...required, ...optional].sort()) ||
    value.schemaVersion !== 1 ||
    typeof value.noChanges !== 'boolean' ||
    !Array.isArray(value.changes)
  )
    throw Error('Current saved-plan receipt schema differs');
  for (const change of value.changes) {
    const row = object(change);
    if (
      canonical(Object.keys(row).sort()) !== canonical(['actions', 'address', 'type']) ||
      typeof row.address !== 'string' ||
      !row.address ||
      /[\r\n]/.test(row.address) ||
      typeof row.type !== 'string' ||
      !/^[a-z][a-z0-9_]*$/.test(row.type)
    )
      throw Error('Current saved-plan changes are malformed');
    changeActions(row.actions, false, Object.hasOwn(value, 'relinquishments'));
  }
  if (new Set(value.changes.map((row) => object(row).address)).size !== value.changes.length)
    throw Error('Current saved-plan changes contain duplicate addresses');
  if (
    Object.hasOwn(value, 'refreshOriginSha256') &&
    (typeof value.refreshOriginSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(value.refreshOriginSha256) ||
      value.noChanges !== true ||
      value.changes.some((change) => (object(change).actions as string[]).join(',') !== 'no-op') ||
      ['operation', 'actionInvocations', 'imports', 'relinquishments'].some((key) => Object.hasOwn(value, key)))
  )
    throw Error('Current saved-plan refresh origin is malformed');
  if (Object.hasOwn(value, 'operation') && value.operation !== 'destroy')
    throw Error('Current saved-plan operation differs');
  if (Object.hasOwn(value, 'actionInvocations')) {
    if (!Array.isArray(value.actionInvocations) || !value.actionInvocations.length)
      throw Error('Current action intents are malformed');
    for (const intent of value.actionInvocations) validateActionIntent(intent as TerraformActionIntent);
    if (
      new Set(value.actionInvocations.map((intent) => object(intent).address)).size !== value.actionInvocations.length
    )
      throw Error('Current action intents contain duplicate addresses');
  }
  if (Object.hasOwn(value, 'imports')) validateImportIntents(value.imports as TerraformImportIntent[]);
  if (Object.hasOwn(value, 'relinquishments'))
    validateImportIntents(value.relinquishments as TerraformRelinquishmentIntent[]);
  if (Object.hasOwn(journal, 'execution')) {
    const execution = object(journal.execution),
      executable = object(execution.terraform);
    const intents = (value.actionInvocations ?? []) as TerraformActionIntent[];
    if (
      canonical(Object.keys(execution).sort()) !== canonical(['planArgs', 'terraform']) ||
      canonical(Object.keys(executable).sort()) !== canonical(['path', 'sha256']) ||
      typeof executable.path !== 'string' ||
      !isAbsolute(executable.path) ||
      /[\r\n\0]/.test(executable.path) ||
      typeof executable.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(executable.sha256) ||
      intents.length > 1 ||
      canonical(execution.planArgs) !==
        canonical([
          'plan',
          '-input=false',
          '-lock=true',
          '-lock-timeout=60s',
          '-refresh=true',
          '-out=saved.tfplan',
          ...(intents.length ? [`-invoke=${intents[0].address}`] : []),
          ...(value.operation === 'destroy' ? ['-destroy'] : []),
        ])
    )
      throw Error('Current saved-plan execution provenance is malformed');
  }
  return {
    receipt: structuredClone(value as unknown as PlanReceipt),
    state: journal.state as 'planned' | 'applying' | 'applied',
    ...(Object.hasOwn(journal, 'execution')
      ? {
          executionSha256: digest(canonical(journal.execution)),
          ordinaryRefreshEnabled:
            !Object.hasOwn(value, 'operation') &&
            !Object.hasOwn(value, 'actionInvocations') &&
            !Object.hasOwn(value, 'imports') &&
            !Object.hasOwn(value, 'relinquishments'),
        }
      : {}),
  };
}

/** Carry original validated plan execution through lifecycle state changes without recreating it. */
function transitionSavedPlanJournal(
  journal: Json,
  state: 'applying' | 'applied',
  receipt: PlanReceipt,
  reconciledEvidenceSha256?: string,
): Json {
  const original = decodeSavedPlanJournal(Buffer.from(JSON.stringify(journal)));
  if (canonical(original.receipt) !== canonical(receipt)) throw Error('Saved-plan journal transition receipt differs');
  const next = {
    state,
    receipt: structuredClone(receipt),
    ...(Object.hasOwn(journal, 'execution') ? { execution: structuredClone(journal.execution) } : {}),
    ...(reconciledEvidenceSha256 === undefined ? {} : { reconciledEvidenceSha256 }),
  };
  decodeSavedPlanJournal(Buffer.from(JSON.stringify(next)));
  return next;
}

function validateActionIntent(intent: TerraformActionIntent): void {
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
function validateImportIntents(intents: TerraformImportIntent[]): void {
  if (
    !Array.isArray(intents) ||
    !intents.length ||
    new Set(intents.map((i) => i?.address)).size !== intents.length ||
    intents.some(
      (i) =>
        !i ||
        Object.keys(i).sort().join(',') !== 'address,idSha256,providerName,type' ||
        typeof i.type !== 'string' ||
        !/^[a-z][a-z0-9_]*$/.test(i.type) ||
        typeof i.address !== 'string' ||
        !new RegExp(`^${i.type}\\.[a-z][a-z0-9_]*$`).test(i.address) ||
        typeof i.providerName !== 'string' ||
        !/^registry\.terraform\.io\/[a-z0-9_-]+\/[a-z0-9_-]+$/.test(i.providerName) ||
        typeof i.idSha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(i.idSha256),
    )
  )
    throw new Error('Explicit unique import address, provider and ID digest required');
}
function inspectImports(plan: Json, expected?: TerraformImportIntent[]): TerraformImportIntent[] {
  if (expected) validateImportIntents(expected);
  const rows = plan.resource_changes ?? [];
  if (!Array.isArray(rows)) throw new Error('Terraform import resource inventory is malformed');
  const found: TerraformImportIntent[] = [];
  for (const value of rows) {
    const row = object(value);
    const change = object(row.change);
    if (change.importing === undefined || change.importing === null) continue;
    if (!expected) throw new Error('Terraform state import requires a separately qualified ownership contract');
    const intent = expected.find((i) => i.address === row.address);
    const importing = object(change.importing);
    if (
      !intent ||
      found.some((i) => i.address === row.address) ||
      row.mode !== 'managed' ||
      row.type !== intent.type ||
      row.provider_name !== intent.providerName ||
      row.previous_address !== undefined ||
      row.deposed !== undefined ||
      Object.keys(importing).some((k) => !['id', 'unknown'].includes(k)) ||
      (importing.unknown !== undefined && importing.unknown !== false) ||
      typeof importing.id !== 'string' ||
      !importing.id.length ||
      digest(importing.id) !== intent.idSha256 ||
      changeActions(change.actions).join(',') !== 'no-op'
    )
      throw new Error('Terraform import identity is unresolved, duplicated, foreign or mutating');
    found.push({ ...intent });
  }
  if (
    expected &&
    (found.length !== expected.length ||
      rows.some((v) => changeActions(object(object(v).change).actions).join(',') !== 'no-op') ||
      Object.values(object(plan.output_changes ?? {})).some(
        (v) => changeActions(object(v).actions, true).join(',') !== 'no-op',
      ))
  )
    throw new Error('Terraform import-only plan contains missing imports or unrelated changes');
  return found.sort((a, b) => a.address.localeCompare(b.address));
}
function validateRelinquishmentIntents(intents: TerraformRelinquishmentIntent[]): void {
  try {
    validateImportIntents(intents);
  } catch {
    throw Error('Explicit unique relinquishment address, provider and ID digest required');
  }
}
function inspectRelinquishments(
  plan: Json,
  expected?: TerraformRelinquishmentIntent[],
): TerraformRelinquishmentIntent[] {
  if (expected) validateRelinquishmentIntents(expected);
  const rows = plan.resource_changes ?? [];
  if (!Array.isArray(rows)) throw Error('Terraform relinquishment inventory is malformed');
  const found: TerraformRelinquishmentIntent[] = [];
  for (const value of rows) {
    const row = object(value),
      change = object(row.change);
    if (Array.isArray(change.actions) && change.actions.join(',') === 'forget') {
      if (!expected) throw Error('Terraform state relinquishment requires a separately qualified ownership contract');
      const intent = expected.find((i) => i.address === row.address);
      const before = object(change.before);
      const sensitivity = change.before_sensitive;
      if (
        !intent ||
        found.some((i) => i.address === row.address) ||
        row.mode !== 'managed' ||
        row.type !== intent.type ||
        row.provider_name !== intent.providerName ||
        row.previous_address !== undefined ||
        row.deposed !== undefined ||
        (change.importing !== undefined && change.importing !== null) ||
        typeof before.id !== 'string' ||
        !before.id.length ||
        digest(before.id) !== intent.idSha256 ||
        sensitivity === true ||
        (sensitivity !== undefined &&
          sensitivity !== false &&
          object(sensitivity).id !== undefined &&
          object(sensitivity).id !== false) ||
        change.after !== null ||
        !allFalse(change.after_unknown)
      )
        throw Error('Terraform relinquishment identity is unresolved, sensitive, duplicated, foreign or mutating');
      found.push({ ...intent });
    } else if (expected && changeActions(change.actions).join(',') !== 'no-op') {
      throw Error('Terraform relinquishment-only plan contains unrelated resource changes');
    }
  }
  if (
    expected &&
    (found.length !== expected.length ||
      Object.values(object(plan.output_changes ?? {})).some(
        (v) => changeActions(object(v).actions, true).join(',') !== 'no-op',
      ) ||
      !Array.isArray(plan.deferred_changes ?? []) ||
      (plan.deferred_changes as unknown[] | undefined)?.length)
  )
    throw Error('Terraform relinquishment-only plan contains missing withdrawals, output changes or deferred evidence');
  return found.sort((a, b) => a.address.localeCompare(b.address));
}
function allFalse(value: unknown): boolean {
  return value === false || (value !== null && typeof value === 'object' && Object.values(value).every(allFalse));
}
/** Terraform 1.16 JSON action invocations; never export config_values or sensitivity maps. */
function inspectActionInvocations(plan: Json, expected?: TerraformActionIntent): TerraformActionIntent[] {
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
  const action = object(invocations[0]);
  if (
    action.address !== expected.address ||
    action.type !== expected.type ||
    action.provider_name !== expected.providerName ||
    action.lifecycle_action_trigger !== undefined ||
    Object.keys(object(action.invoke_action_trigger)).length ||
    !allFalse(action.config_unknown) ||
    !allFalse(action.config_sensitive) ||
    digest(canonical(object(action.config_values))) !== expected.configValuesSha256
  )
    throw new Error('Terraform action identity, trigger or configuration differs');
  return [{ ...expected }];
}

async function privateDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    (await realpath(path)) !== path
  )
    throw new Error('Terraform storage ownership is invalid');
  await chmod(path, 0o700);
}
async function privateRead(path: string): Promise<Buffer> {
  const stat = await lstat(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 0o077) !== 0
  )
    throw new Error('Terraform artifact ownership is invalid');
  return readFile(path);
}
async function persist(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.new`;
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
  await rename(temporary, path);
}

export function terraformExecutor(
  limits = {
    timeoutMs: 900_000,
    applyTimeoutMs: 3_600_000,
    maxOutputBytes: 64 * 1024 * 1024,
    killAfterMs: 5_000,
  },
  retainFailure = false,
): Executor {
  return async ({ cwd, args, env, signal, expectedExecutable }) => {
    signal?.throwIfAborted();
    const selected = Bun.which('terraform', { PATH: env.PATH ?? process.env.PATH ?? '/usr/bin:/bin' });
    if (!selected) throw Error('Terraform executable is unavailable');
    const executable = await executableIdentity(selected);
    if (expectedExecutable && encode(executable) !== encode(expectedExecutable))
      throw Error('Terraform executable differs before execution');
    const child = Bun.spawn(['/bin/sh', '-c', 'umask 077; exec "$@"', 'ce-terraform', executable.path, ...args], {
      cwd,
      env,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });
    let failure: string | undefined;
    let escalation: ReturnType<typeof setTimeout> | undefined;
    const stop = (reason: string) => {
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
    const categories = new Set<TerraformFailureCategory>();
    const collect = async (stream: ReadableStream<Uint8Array>, retain: boolean, classify = false) => {
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
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
            // Keep only enough context to recognize an error code split across stream chunks.
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
          if (Array.isArray(diagnostics))
            for (const item of diagnostics)
              if (item?.severity === 'error' && typeof item.summary === 'string')
                for (const category of terraformFailureCategories(`Error: ${item.summary}`)) categories.add(category);
        } catch {
          // Malformed validation output remains unknown; never fall back to exporting it.
        }
      }
      const failureCategory = categories.size === 1 ? [...categories][0] : 'unknown';
      if (code !== 0 && retainFailure) {
        // Both streams can contain bootstrap or provider credentials. Never return this record.
        await privateDirectory(cwd);
        const directory = join(cwd, 'failure-diagnostics');
        await privateDirectory(directory);
        await persist(join(directory, `${randomUUID()}.json`), {
          schemaVersion: 1,
          observedAt: new Date().toISOString(),
          operation: args[0],
          exitCode: code,
          category: failureCategory,
          stdout,
          stderr,
        });
      }
      if (encode(await executableIdentity(executable.path)) !== encode(executable))
        throw Error('Terraform executable changed during execution');
      return code === 0 ? { code, stdout, executable } : { code, stdout: '', failureCategory };
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

/** Fixed argv wrapper sets child permissions without changing the host's umask. */
export const executeTerraform = terraformExecutor(undefined, true);

/** Internal lifecycle adapter. Cloud translators must validate scope before invoking it. */
export class TerraformRunner {
  #directory?: string;
  #manifest?: Manifest;
  #busy = false;
  #executorIdentity?: ExecutableIdentity;
  constructor(
    readonly root: string,
    readonly execute: Executor = executeTerraform,
    readonly independentVerifier: CleanupVerifier = executeIndependentCleanup,
  ) {
    if (!isAbsolute(root) || resolve(root) !== root) throw new Error('Terraform storage must be an absolute path');
  }
  async prepare(deployment: Deployment): Promise<void> {
    if (deployment.schemaVersion !== 1 || deployment.engine !== 'terraform' || !safeId.test(deployment.deploymentId))
      throw new Error('Terraform deployment identity or owning engine is unsupported');
    if (deployment.stage !== undefined && !safeId.test(deployment.stage))
      throw new Error('Invalid Terraform stage identity');
    if (!/^\d+\.\d+\.\d+$/.test(deployment.terraformVersion) || !deployment.providerLock.trim())
      throw new Error('Exact Terraform version and provider lock are required');
    // Remote backend admission needs the cloud adapter's lock and identity validation.
    const configuration = decode(deployment.configuration);
    if (
      object(configuration.terraform ?? {}).backend ||
      object(configuration.terraform ?? {}).cloud ||
      deployment.backendIdentity !==
        `local:${deployment.deploymentId}${deployment.stage ? `:stage:${deployment.stage}` : ''}`
    )
      throw new Error('This runner currently admits isolated local backends only');
    if (!deployment.scope.account || !deployment.scope.region || !['aws', 'azure'].includes(deployment.scope.cloud))
      throw new Error('Explicit deployment scope is required');
    await privateDirectory(this.root);
    const directory = join(this.root, deployment.deploymentId);
    await mkdir(directory, { mode: 0o700 }); // An existing deployment must be resumed, never overwritten.
    const { configuration: source, providerLock, ...identity } = deployment;
    const manifest = { ...identity, configurationSha256: digest(source), providerLockSha256: digest(providerLock) };
    await writeFile(join(directory, 'main.tf.json'), source, { mode: 0o600, flag: 'wx' });
    await writeFile(join(directory, '.terraform.lock.hcl'), providerLock, { mode: 0o600, flag: 'wx' });
    await writeFile(join(directory, 'deployment.tfrc'), cliConfig, { mode: 0o600, flag: 'wx' });
    await persist(join(directory, 'deployment.json'), manifest);
    this.#directory = directory;
    this.#manifest = manifest;
  }
  /** Internal lifecycle input. May contain bootstrap secrets; never export as a tool summary. */
  async readConfigurationSha256(): Promise<string> {
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      return this.#state().manifest.configurationSha256;
    });
  }
  /** Internal lifecycle input. May contain bootstrap secrets; never export as a tool summary. */
  async readConfiguration(expectedSha256: string): Promise<string> {
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const { directory, manifest } = this.#state();
      if (manifest.configurationSha256 !== expectedSha256) throw new Error('Terraform configuration snapshot is stale');
      const configuration = await privateRead(join(directory, 'main.tf.json'));
      if (digest(configuration) !== expectedSha256) throw new Error('Terraform configuration snapshot changed');
      return configuration.toString();
    });
  }
  /** The cloud adapter has independently proved the exact isolated action outcome. */
  async reconcileApplyFromEvidence(receipt: PlanReceipt, evidenceSha256: string): Promise<void> {
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const { directory, manifest } = this.#state();
      const journal = decode((await privateRead(join(directory, 'plan-receipt.json'))).toString());
      if (
        !['applying', 'applied'].includes(String(journal.state)) ||
        canonical(receipt) !== canonical(journal.receipt) ||
        receipt.engine !== 'terraform' ||
        receipt.deploymentId !== manifest.deploymentId ||
        receipt.backendIdentity !== manifest.backendIdentity ||
        receipt.configurationSha256 !== manifest.configurationSha256 ||
        receipt.providerLockSha256 !== manifest.providerLockSha256 ||
        receipt.planSha256 !== digest(await privateRead(join(directory, 'saved.tfplan'))) ||
        !/^[a-f0-9]{64}$/.test(evidenceSha256)
      )
        throw new Error('Terraform interrupted apply evidence differs from the exact saved plan');
      await this.#transitionSavedPlanJournal(journal, 'applied', receipt, evidenceSha256);
    });
  }
  async #transitionSavedPlanJournal(
    journal: Json,
    state: 'applying' | 'applied',
    receipt: PlanReceipt,
    evidenceSha256?: string,
  ): Promise<Json> {
    const next = transitionSavedPlanJournal(journal, state, receipt, evidenceSha256);
    const path = join(this.#state().directory, 'plan-receipt.json');
    const current = decode((await privateRead(path)).toString());
    if (canonical(current) !== canonical(journal))
      throw Error('Saved-plan journal changed before lifecycle publication');
    await this.#replacePrivate(path, JSON.stringify(next));
    return next;
  }

  /** Advance desired configuration without changing cloud ownership, providers or backend. */
  async reviseConfiguration(expectedSha256: string, configuration: string): Promise<string> {
    return this.#exclusive(() => this.#reviseConfiguration(expectedSha256, configuration));
  }
  async #reviseConfiguration(expectedSha256: string, configuration: string): Promise<string> {
    await this.#verifyInputs();
    const { directory, manifest } = this.#state();
    if (manifest.configurationSha256 !== expectedSha256) throw new Error('Terraform configuration revision is stale');
    this.#validateRevision(configuration, (await privateRead(join(directory, 'main.tf.json'))).toString());
    const nextSha256 = digest(configuration);
    if (nextSha256 === expectedSha256) return nextSha256;
    let receipt: Json | undefined;
    try {
      receipt = decode((await privateRead(join(directory, 'plan-receipt.json'))).toString());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (receipt?.state === 'applying')
      throw new Error('Reconcile interrupted Terraform apply before revising configuration');
    const transition = {
      previous: manifest,
      next: { ...manifest, configurationSha256: nextSha256 },
      configuration,
      archiveId: randomUUID(),
    };
    await this.#replacePrivate(join(directory, 'configuration-transition.json'), JSON.stringify(transition));
    await this.#recoverRevision();
    return nextSha256;
  }
  /** Private local cancellation provenance only. Never runs Terraform or repairs pending files. */
  async readUnsubmittedPlanCancellation(
    receipt: PlanReceipt | undefined,
    expectedSha256: string,
    nextSha256: string,
    evidenceSha256: string,
    signal?: AbortSignal,
  ) {
    return this.#readCancellationProvenance(receipt, expectedSha256, nextSha256, evidenceSha256, signal);
  }

  /** Authenticate an exact current continuation after original unsubmitted cancellation.
   * This reads byte/journal custody only; the cloud adapter must validate proposed effects,
   * selected original outcome, applied state and retirement independently. No CLI or repair.
   */
  async readCancelledPlanContinuation(
    receipt: PlanReceipt,
    expectedSha256: string,
    nextSha256: string,
    evidenceSha256: string,
    continuationReceipt: PlanReceipt,
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    continuationReceipt = decodeSavedPlanJournal(
      Buffer.from(JSON.stringify({ state: 'planned', receipt: continuationReceipt })),
    ).receipt;
    const observed = await this.#readCancellationProvenance(
      receipt,
      expectedSha256,
      nextSha256,
      evidenceSha256,
      signal,
      continuationReceipt,
    );
    if (
      !observed.continuation ||
      observed.status !== 'cancelled' ||
      typeof observed.cancellationRecordSha256 !== 'string' ||
      typeof observed.originalReceiptSha256 !== 'string'
    )
      throw Error('Cancelled continuation lacks exact completed original cancellation');
    return {
      schemaVersion: 1 as const,
      scope: 'exact-cancelled-plan-current-continuation-provenance' as const,
      manifestSha256: observed.manifestSha256,
      currentConfigurationSha256: observed.currentConfigurationSha256,
      cancellationRecordSha256: observed.cancellationRecordSha256,
      originalReceiptSha256: observed.originalReceiptSha256,
      originalArchiveSha256s: observed.originalArchiveSha256s,
      continuation: observed.continuation,
      cancellationQualified: true as const,
      planSemanticsQualified: false as const,
      applicationOutcomeQualified: false as const,
      runnerRetirementQualified: false as const,
      retirementQualified: false as const,
    };
  }

  /** Private local cancellation provenance only. Never runs Terraform or repairs pending files. */
  async #readCancellationProvenance(
    receipt: PlanReceipt | undefined,
    expectedSha256: string,
    nextSha256: string,
    evidenceSha256: string,
    signal?: AbortSignal,
    continuationReceipt?: PlanReceipt,
  ) {
    signal?.throwIfAborted();
    receipt =
      receipt === undefined
        ? undefined
        : decodeSavedPlanJournal(Buffer.from(JSON.stringify({ state: 'planned', receipt }))).receipt;
    if (![expectedSha256, nextSha256, evidenceSha256].every((value) => /^[a-f0-9]{64}$/.test(value)))
      throw Error('Cancellation provenance digests are malformed');
    return this.#exclusive(async () => {
      signal?.throwIfAborted();
      await this.#verifyInputs();
      const { directory, manifest } = this.#state(),
        manifestSha256 = digest(canonical(manifest));
      if (
        receipt &&
        (receipt.configurationSha256 !== expectedSha256 ||
          receipt.deploymentId !== manifest.deploymentId ||
          receipt.backendIdentity !== manifest.backendIdentity ||
          receipt.providerLockSha256 !== manifest.providerLockSha256)
      )
        throw Error('Cancellation provenance original receipt ownership differs');
      const bound = {
        schemaVersion: 1,
        deploymentId: manifest.deploymentId,
        backendIdentity: manifest.backendIdentity,
        providerLockSha256: manifest.providerLockSha256,
        expectedSha256,
        nextSha256,
        receipt: receipt ?? null,
        evidenceSha256,
      };
      const path = join(
        directory,
        `configuration-cancellation-${digest(canonical({ receipt: receipt ?? null, expectedSha256, nextSha256 }))}.json`,
      );
      const reads = new Map<string, string | null>();
      const read = async (selected: string) => {
        signal?.throwIfAborted();
        let bytes: Buffer | undefined;
        try {
          bytes = await privateRead(selected);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
        const sha256 = bytes ? digest(bytes) : null;
        if (reads.has(selected) && reads.get(selected) !== sha256)
          throw Error('Cancellation provenance bytes changed during collection');
        reads.set(selected, sha256);
        return bytes;
      };
      let continuation:
        | {
            receiptSha256: string;
            state: 'planned' | 'applying' | 'applied';
            journalSha256: string;
            savedPlanSha256: string;
            executionSha256: string;
            ordinaryRefreshEnabled: true;
          }
        | undefined;
      let originalHistorySha256: string | undefined;
      const record = await read(path);
      let status: 'absent' | 'pending' | 'cancelled' = 'absent';
      let originalArchiveSha256s: string[] = [];
      if (record) {
        if (canonical(decode(record.toString())) !== canonical(bound))
          throw Error('Cancellation provenance source evidence differs');
        if (![expectedSha256, nextSha256].includes(manifest.configurationSha256))
          throw Error('Cancellation provenance current configuration differs');
        const journalBytes = await read(join(directory, 'plan-receipt.json')),
          savedBytes = await read(join(directory, 'saved.tfplan'));
        const journal = journalBytes ? decodeSavedPlanJournal(journalBytes) : undefined;
        const originalJournal = journal && receipt && canonical(journal.receipt) === canonical(receipt);
        if (originalJournal && journal.state !== 'planned')
          throw Error('Cancellation provenance original plan was submitted');
        if (originalJournal && savedBytes && digest(savedBytes) !== receipt?.planSha256)
          throw Error('Cancellation provenance original saved bytes differ');
        if (!journal && savedBytes && (!receipt || digest(savedBytes) !== receipt.planSha256))
          throw Error('Cancellation provenance has foreign orphan plan bytes');
        if (
          journal &&
          !originalJournal &&
          !continuationReceipt &&
          (!savedBytes ||
            journal.state !== 'planned' ||
            journal.receipt.noChanges !== true ||
            journal.receipt.configurationSha256 !== manifest.configurationSha256 ||
            journal.receipt.deploymentId !== manifest.deploymentId ||
            journal.receipt.backendIdentity !== manifest.backendIdentity ||
            journal.receipt.providerLockSha256 !== manifest.providerLockSha256 ||
            journal.receipt.planSha256 !== digest(savedBytes))
        )
          throw Error('Cancellation provenance has another submitted or changing plan');
        if (continuationReceipt) {
          if (
            !receipt ||
            !journalBytes ||
            !savedBytes ||
            !journal ||
            originalJournal ||
            manifest.configurationSha256 !== nextSha256 ||
            canonical(journal.receipt) !== canonical(continuationReceipt) ||
            journal.receipt.configurationSha256 !== nextSha256 ||
            journal.receipt.deploymentId !== manifest.deploymentId ||
            journal.receipt.backendIdentity !== manifest.backendIdentity ||
            journal.receipt.providerLockSha256 !== manifest.providerLockSha256 ||
            journal.receipt.planSha256 !== digest(savedBytes) ||
            journal.ordinaryRefreshEnabled !== true ||
            !journal.executionSha256
          )
            throw Error('Cancelled continuation lacks exact current ordinary-refresh journal/receipt/bytes');
          continuation = {
            receiptSha256: digest(canonical(continuationReceipt)),
            state: journal.state,
            journalSha256: digest(journalBytes),
            savedPlanSha256: digest(savedBytes),
            executionSha256: journal.executionSha256,
            ordinaryRefreshEnabled: true,
          };
        }
        const history = receipt ? await this.#readPlanApplicationHistory(receipt, signal, false) : undefined;
        if (history?.incompleteArchives || history?.matches.some((entry) => entry.state !== 'planned'))
          throw Error('Cancellation provenance original archive is unresolved');
        originalHistorySha256 = history ? digest(canonical(history)) : undefined;
        originalArchiveSha256s = history?.matches.map((entry) => entry.archiveSha256).toSorted() ?? [];
        const activeOriginal = originalJournal && savedBytes && manifest.configurationSha256 === expectedSha256;
        if (receipt && !originalArchiveSha256s.length && !activeOriginal)
          throw Error('Cancellation provenance lacks exact unsubmitted original archive');
        const originalRemnants = originalJournal || (!journal && Boolean(savedBytes));
        status = manifest.configurationSha256 === nextSha256 && !originalRemnants ? 'cancelled' : 'pending';
      }
      await this.#verifyInputs();
      if (digest(canonical(this.#state().manifest)) !== manifestSha256)
        throw Error('Cancellation provenance manifest changed during collection');
      for (const selected of reads.keys()) await read(selected);
      if (continuationReceipt) {
        if (!receipt || status !== 'cancelled' || !continuation || !originalHistorySha256)
          throw Error('Cancelled continuation lacks exact completed original cancellation');
        const rechecked = await this.#readPlanApplicationHistory(receipt, signal, false);
        if (digest(canonical(rechecked)) !== originalHistorySha256)
          throw Error('Cancelled continuation original archive changed during collection');
        for (const selected of reads.keys()) await read(selected);
      }
      signal?.throwIfAborted();
      return {
        schemaVersion: 1 as const,
        scope: 'exact-unsubmitted-plan-cancellation-provenance' as const,
        ...(continuation ? { continuation } : {}),
        status,
        manifestSha256,
        cancellationRecordSha256: record ? digest(record) : null,
        originalReceiptSha256: receipt ? digest(canonical(receipt)) : null,
        originalArchiveSha256s,
        currentConfigurationSha256: manifest.configurationSha256,
        cancellationQualified: status === 'cancelled',
        applicationOutcomeQualified: false as const,
        runnerRetirementQualified: false as const,
        retirementQualified: false as const,
      };
    });
  }

  /** Cancel only an independently proven unsubmitted attempt. This operation never invokes apply. */
  async cancelUnsubmittedPlan(
    receipt: PlanReceipt | undefined,
    expectedSha256: string,
    configuration: string,
    evidenceSha256: string,
  ): Promise<string> {
    receipt = receipt === undefined ? undefined : structuredClone(object(receipt) as unknown as PlanReceipt);
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const { directory, manifest } = this.#state();
      const nextSha256 = digest(configuration);
      if (!/^[a-f0-9]{64}$/.test(expectedSha256) || !/^[a-f0-9]{64}$/.test(evidenceSha256))
        throw new Error('Unsubmitted cancellation evidence is malformed');
      const cancellation = {
        schemaVersion: 1,
        deploymentId: manifest.deploymentId,
        backendIdentity: manifest.backendIdentity,
        providerLockSha256: manifest.providerLockSha256,
        expectedSha256,
        nextSha256,
        receipt: receipt ?? null,
        evidenceSha256,
      };
      const recordPath = join(
        directory,
        `configuration-cancellation-${digest(canonical({ receipt: receipt ?? null, expectedSha256, nextSha256 }))}.json`,
      );
      const readOptional = async (path: string): Promise<Buffer | undefined> => {
        try {
          return await privateRead(path);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      };
      const recorded = await readOptional(recordPath);
      if (recorded && canonical(decode(recorded.toString())) !== canonical(cancellation))
        throw new Error('Unsubmitted cancellation source evidence changed');
      const retireOriginalPlan = async () => {
        const currentJournal = await readOptional(join(directory, 'plan-receipt.json'));
        const savedPlan = await readOptional(join(directory, 'saved.tfplan'));
        if (currentJournal) {
          const journal = decodeSavedPlanJournal(currentJournal);
          const currentReceipt = journal.receipt;
          if (receipt && journal.state === 'planned' && canonical(currentReceipt) === canonical(receipt)) {
            if (savedPlan && digest(savedPlan) !== receipt.planSha256)
              throw new Error('Cancelled saved plan bytes changed');
            // The original plan and journal are retained in the verified private archive.
            await rm(join(directory, 'saved.tfplan'), { force: true });
            await rm(join(directory, 'plan-receipt.json'));
          } else if (
            journal.state !== 'planned' ||
            currentReceipt.noChanges !== true ||
            (await this.#applicationState(currentReceipt)) !== 'planned'
          )
            throw new Error('Unsubmitted cancellation recovery found another submitted or changing plan');
        } else if (savedPlan) {
          if (!receipt || digest(savedPlan) !== receipt.planSha256)
            throw new Error('Unsubmitted cancellation recovery has an unbound saved plan');
          await rm(join(directory, 'saved.tfplan'));
        }
      };
      if (recorded && manifest.configurationSha256 === nextSha256) {
        if (receipt) {
          // A same-configuration cancellation can stop after provenance but before archival.
          // Archive only the still-active exact unsubmitted receipt; a remnant cannot create proof.
          const activeJournal = await readOptional(join(directory, 'plan-receipt.json'));
          const activePlan = await readOptional(join(directory, 'saved.tfplan'));
          if (expectedSha256 === nextSha256 && activeJournal && activePlan) {
            const active = decodeSavedPlanJournal(activeJournal);
            if (canonical(active.receipt) === canonical(receipt)) {
              if ((await this.#applicationState(receipt)) !== 'planned')
                throw Error('Unsubmitted cancellation cannot recover a submitted plan');
              await this.#archivePlanAttempt();
            }
          }
          // Authenticate original archived bytes before accepting an absent journal or deleting
          // remnants. A private provenance record alone does not prove an unsubmitted attempt.
          const original = await this.#readPlanApplicationHistory(receipt, undefined, false);
          if (
            !original.matches.length ||
            original.incompleteArchives ||
            original.matches.some((entry) => entry.state !== 'planned')
          )
            throw Error('Unsubmitted cancellation recovery lacks exact unsubmitted archived plan');
        }
        await retireOriginalPlan();
        return nextSha256;
      }
      if (manifest.configurationSha256 !== expectedSha256)
        throw new Error('Unsubmitted cancellation configuration is stale');
      if (receipt) {
        if ((await this.#applicationState(receipt)) !== 'planned')
          throw new Error('Unsubmitted cancellation cannot revise an applying or applied plan');
      } else if (
        (await readOptional(join(directory, 'plan-receipt.json'))) ||
        (await readOptional(join(directory, 'saved.tfplan')))
      )
        throw new Error('Unsubmitted cancellation requires the original saved-plan receipt');
      this.#validateRevision(configuration, (await privateRead(join(directory, 'main.tf.json'))).toString());
      // Persist provenance before the existing recoverable configuration transition.
      if (!recorded) await this.#replacePrivate(recordPath, JSON.stringify(cancellation));
      await this.#archivePlanAttempt();
      const result = await this.#reviseConfiguration(expectedSha256, configuration);
      await retireOriginalPlan();
      return result;
    });
  }
  #validateRevision(configuration: string, previousConfiguration?: string): void {
    const next = decode(configuration);
    const terraform = object(next.terraform ?? {});
    if (terraform.backend || terraform.cloud) throw new Error('Terraform configuration revision cannot change backend');
    if (previousConfiguration !== undefined) {
      const previous = decode(previousConfiguration);
      for (const key of ['terraform', 'provider'])
        if (canonical(previous[key] ?? {}) !== canonical(next[key] ?? {}))
          throw new Error('Terraform configuration revision cannot change provider or execution identity');
    }
  }
  async #replacePrivate(path: string, content: string | Uint8Array): Promise<void> {
    const temporary = `${path}.${randomUUID()}.new`;
    await writeFile(temporary, content, { mode: 0o600, flag: 'wx' });
    await rename(temporary, path);
  }
  async #recoverRevision(): Promise<void> {
    const { directory } = this.#state();
    let transition: Json;
    try {
      transition = decode((await privateRead(join(directory, 'configuration-transition.json'))).toString());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    const previous = object(transition.previous) as unknown as Manifest;
    const next = object(transition.next) as unknown as Manifest;
    if (
      typeof transition.configuration !== 'string' ||
      typeof transition.archiveId !== 'string' ||
      !/^[0-9a-f-]{36}$/.test(transition.archiveId) ||
      !/^[0-9a-f]{64}$/.test(previous.configurationSha256) ||
      canonical({ ...previous, configurationSha256: next.configurationSha256 }) !== canonical(next) ||
      next.configurationSha256 !== digest(transition.configuration)
    )
      throw new Error('Terraform configuration transition is malformed');
    this.#validateRevision(transition.configuration);
    const owner = decode((await privateRead(join(directory, 'deployment.json'))).toString());
    const current = await privateRead(join(directory, 'main.tf.json'));
    if (
      ![canonical(previous), canonical(next)].includes(canonical(owner)) ||
      ![previous.configurationSha256, next.configurationSha256].includes(digest(current)) ||
      digest(await privateRead(join(directory, '.terraform.lock.hcl'))) !== previous.providerLockSha256 ||
      digest(await privateRead(join(directory, 'deployment.tfrc'))) !== digest(cliConfig)
    )
      throw new Error('Terraform configuration transition ownership or inputs changed');
    const archive = join(directory, 'revisions', transition.archiveId);
    await privateDirectory(archive);
    const archiveFile = async (name: string, content: Uint8Array) => {
      try {
        await writeFile(join(archive, name), content, { mode: 0o600, flag: 'wx' });
      } catch (error) {
        if (
          (error as NodeJS.ErrnoException).code !== 'EEXIST' ||
          digest(await privateRead(join(archive, name))) !== digest(content)
        )
          throw error;
      }
    };
    // Archive before replacing inputs; the journal makes every later step repeatable.
    if (digest(current) === previous.configurationSha256) await archiveFile('main.tf.json', current);
    if (digest(await privateRead(join(archive, 'main.tf.json'))) !== previous.configurationSha256)
      throw new Error('Previous Terraform configuration archive is missing');
    this.#validateRevision(transition.configuration, (await privateRead(join(archive, 'main.tf.json'))).toString());
    await archiveFile('deployment.json', Buffer.from(JSON.stringify(previous)));
    for (const name of ['saved.tfplan', 'plan-receipt.json']) {
      try {
        await archiveFile(name, await privateRead(join(directory, name)));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    await this.#replacePrivate(join(directory, 'main.tf.json'), transition.configuration);
    await this.#replacePrivate(join(directory, 'deployment.json'), JSON.stringify(next));
    this.#manifest = next;
    // These bytes belong to the previous configuration. The durable revision retains
    // them exactly; the active directory must not present a stale journal as current.
    // Keep the transition barrier until both removals finish so resume can recover a
    // lost response or interruption between the removals without losing provenance.
    for (const name of ['saved.tfplan', 'plan-receipt.json']) {
      let bytes: Buffer;
      try {
        bytes = await privateRead(join(directory, name));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        continue;
      }
      if (digest(bytes) !== digest(await privateRead(join(archive, name))))
        throw Error('Previous Terraform saved journal changed before archival handoff');
      await rm(join(directory, name));
    }
    await rm(join(directory, 'configuration-transition.json'));
  }
  async resume(
    deploymentId: string,
    expected?: Deployment,
    configurationMode: 'exact' | 'current' = 'exact',
  ): Promise<void> {
    if (configurationMode === 'current' && !expected) throw new Error('Current configuration resume requires identity');
    if (!safeId.test(deploymentId)) throw new Error('Invalid Terraform deployment identity');
    const directory = join(this.root, deploymentId);
    await privateDirectory(directory);
    const manifest = decode((await privateRead(join(directory, 'deployment.json'))).toString()) as unknown as Manifest;
    if (manifest.schemaVersion !== 1 || manifest.engine !== 'terraform' || manifest.deploymentId !== deploymentId)
      throw new Error('Terraform deployment ownership is invalid');
    this.#directory = directory;
    this.#manifest = manifest;
    if (await hasArtifactRetirement(directory)) {
      if (!expected) throw Error('Retired Terraform resume requires exact ownership identity');
      const { configuration, providerLock, ...identity } = expected;
      if (
        canonical(manifest) !==
        canonical({
          ...identity,
          configurationSha256: configurationMode === 'current' ? manifest.configurationSha256 : digest(configuration),
          providerLockSha256: digest(providerLock),
        })
      )
        throw Error('Retired Terraform deployment identity differs');
      return; // Only digest-bound retirement may run; all execution paths retain the permanent barrier.
    }
    await this.#exclusive(() => this.#recoverRevision());
    const recoveredManifest = this.#state().manifest;
    if (expected) {
      const { configuration, providerLock, ...identity } = expected;
      const expectedManifest = {
        ...identity,
        configurationSha256:
          configurationMode === 'current' ? recoveredManifest.configurationSha256 : digest(configuration),
        providerLockSha256: digest(providerLock),
      };
      if (canonical(recoveredManifest) !== canonical(expectedManifest))
        throw new Error('Terraform deployment differs from the requested identity or configuration');
      if (configurationMode === 'current')
        this.#validateRevision((await privateRead(join(directory, 'main.tf.json'))).toString(), configuration);
    }
    this.#directory = directory;
    this.#manifest = recoveredManifest;
    await this.#verifyInputs();
    try {
      const journal = decode((await privateRead(join(directory, 'plan-receipt.json'))).toString());
      if (journal.execution !== undefined) {
        const executable = object(object(journal.execution).terraform);
        if (
          typeof executable.path !== 'string' ||
          !isAbsolute(executable.path) ||
          typeof executable.sha256 !== 'string' ||
          !/^[a-f0-9]{64}$/.test(executable.sha256)
        )
          throw Error('Terraform saved executor identity is malformed');
        this.#executorIdentity = { path: executable.path, sha256: executable.sha256 };
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  #state(): { directory: string; manifest: Manifest } {
    if (!this.#directory || !this.#manifest) throw new Error('Prepare or resume the deployment first');
    return { directory: this.#directory, manifest: this.#manifest };
  }
  async #verifyInputs(): Promise<void> {
    if (!this.#manifest || !this.#directory) throw new Error('Prepare or resume the deployment first');
    try {
      await lstat(join(this.#directory, 'configuration-transition.json'));
      throw new Error('Resume the interrupted Terraform configuration transition before execution');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const owner = decode((await privateRead(join(this.#directory, 'deployment.json'))).toString());
    if (canonical(owner) !== canonical(this.#manifest) || owner.engine !== 'terraform')
      throw new Error('Terraform deployment ownership changed');
    for (const [file, expected] of [
      ['main.tf.json', this.#manifest.configurationSha256],
      ['.terraform.lock.hcl', this.#manifest.providerLockSha256],
      ['deployment.tfrc', digest(cliConfig)],
    ]) {
      if (digest(await privateRead(join(this.#directory, file))) !== expected)
        throw new Error('Terraform configuration or provider lock changed');
    }
  }
  #environment(ambient: Record<string, string | undefined>): Record<string, string | undefined> {
    const env = Object.fromEntries(Object.entries(ambient).filter(([key]) => !key.startsWith('TF_')));
    return {
      ...env,
      TF_CLI_CONFIG_FILE: join(this.#state().directory, 'deployment.tfrc'),
      TF_DATA_DIR: join(this.#state().directory, '.terraform'),
      TF_IN_AUTOMATION: '1',
      TF_INPUT: '0',
      TF_WORKSPACE: 'default',
    };
  }
  async #run(args: string[], env: Record<string, string | undefined>, signal?: AbortSignal): Promise<string> {
    signal?.throwIfAborted();
    const result = await this.execute({
      cwd: this.#state().directory,
      args,
      env: this.#environment(env),
      signal,
      expectedExecutable: this.#executorIdentity,
    });
    if (result.code !== 0) throw new TerraformCommandError(args[0], result.code, result.failureCategory);
    if (result.executable) {
      if (this.#executorIdentity && encode(this.#executorIdentity) !== encode(result.executable))
        throw Error('Terraform executable changed during the owning session');
      this.#executorIdentity = result.executable;
    }
    return result.stdout;
  }
  async #exclusive<T>(operation: () => Promise<T>, retirement = false): Promise<T> {
    if (this.#busy) throw new Error('Terraform deployment operation is already running');
    if (!this.#directory) throw new Error('Prepare or resume the deployment first');
    this.#busy = true;
    const lock = join(this.#directory, '.runner-lock');
    let release: (() => Promise<void>) | undefined;
    try {
      release = await acquireProcessLock(lock);
      if (!retirement && (await hasArtifactRetirement(this.#directory)))
        throw Error('Terraform artifacts are retired; execution is permanently disabled');
      return await operation();
    } finally {
      if (release) await release();
      this.#busy = false;
    }
  }
  /** Internal read-only custody of the permanent barrier; no execution or cleanup repair. */
  async readArtifactRetirement(receipt: PlanReceipt, evidenceSha256: string, signal?: AbortSignal) {
    receipt = structuredClone(receipt);
    await privateDirectory(this.#state().directory);
    return this.#exclusive(async () => {
      signal?.throwIfAborted();
      const { directory, manifest } = this.#state();
      await privateDirectory(directory);
      const persisted = decode((await privateRead(join(directory, 'deployment.json'))).toString());
      if (canonical(persisted) !== canonical(manifest) || !/^[a-f0-9]{64}$/.test(evidenceSha256))
        throw Error('Terraform artifact retirement owner or external evidence differs');
      const observed = await readPrivateArtifactRetirement(
        directory,
        digest(canonical(manifest)),
        evidenceSha256,
        receipt.planSha256,
        digest(canonical(receipt)),
        signal,
      );
      if (
        canonical(decode((await privateRead(join(directory, 'deployment.json'))).toString())) !== canonical(persisted)
      )
        throw Error('Terraform artifact retirement owner changed during observation');
      await privateDirectory(directory);
      signal?.throwIfAborted();
      return observed;
    }, true);
  }
  /** Internal terminal cleanup. The cloud adapter must bind independently verified cloud/F5 absence.
   * Runner proof covers the current empty local state and the exact refreshed no-change plan only.
   */
  async retireArtifacts(
    receipt: PlanReceipt,
    evidenceSha256: string,
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
  ) {
    receipt = structuredClone(receipt);
    env = { ...env };
    await privateDirectory(this.#state().directory);
    return this.#exclusive(async () => {
      signal?.throwIfAborted();
      const { directory, manifest } = this.#state();
      await privateDirectory(directory);
      const persisted = decode((await privateRead(join(directory, 'deployment.json'))).toString());
      if (canonical(persisted) !== canonical(manifest) || !/^[a-f0-9]{64}$/.test(evidenceSha256))
        throw Error('Terraform artifact retirement owner or external evidence differs');
      let independentCleanup: IndependentCleanupEvidence | undefined;
      if (!(await hasArtifactRetirement(directory))) {
        await this.#verifyInputs();
        const journalBytes = await privateRead(join(directory, 'plan-receipt.json')),
          verifiedJournal = decodeSavedPlanJournal(journalBytes),
          journal = decode(journalBytes.toString());
        if (verifiedJournal.ordinaryRefreshEnabled !== true)
          throw Error('Terraform artifact retirement requires original ordinary refresh-enabled execution provenance');
        if (
          journal.state !== 'planned' ||
          canonical(journal.receipt) !== canonical(receipt) ||
          receipt.schemaVersion !== 1 ||
          receipt.engine !== 'terraform' ||
          !receipt.noChanges ||
          receipt.deploymentId !== manifest.deploymentId ||
          receipt.backendIdentity !== manifest.backendIdentity ||
          receipt.configurationSha256 !== manifest.configurationSha256 ||
          receipt.providerLockSha256 !== manifest.providerLockSha256 ||
          receipt.changes.length ||
          receipt.operation ||
          receipt.actionInvocations ||
          receipt.imports ||
          receipt.relinquishments ||
          receipt.planSha256 !== digest(await privateRead(join(directory, 'saved.tfplan')))
        )
          throw Error('Terraform artifact retirement requires the exact final empty no-change plan');
        const emptyValues = (values: Json) => {
          if (Object.keys(object(values.outputs ?? {})).length) throw Error('Terraform retirement outputs remain');
          const walk = (module: Json) => {
            if (
              !Array.isArray(module.resources ?? []) ||
              !Array.isArray(module.child_modules ?? []) ||
              (module.resources as unknown[] | undefined)?.length
            )
              throw Error('Terraform retirement state is incomplete or resources remain');
            for (const child of (module.child_modules ?? []) as unknown[]) walk(object(child));
          };
          walk(object(values.root_module ?? {}));
        };
        const version = decode(await this.#run(['version', '-json'], env, signal));
        if (version.terraform_version !== manifest.terraformVersion) throw Error('Terraform version changed');
        const plan = decode(await this.#run(['show', '-json', 'saved.tfplan'], env, signal));
        if (
          typeof plan.format_version !== 'string' ||
          !/^1\.\d+$/.test(plan.format_version) ||
          plan.terraform_version !== manifest.terraformVersion ||
          plan.errored !== false ||
          plan.complete !== true ||
          typeof plan[planApplicationFlag] !== 'boolean' ||
          !Array.isArray(plan.resource_changes ?? []) ||
          (plan.resource_changes as unknown[] | undefined)?.length ||
          Object.keys(object(plan.output_changes ?? {})).length ||
          inspectActionInvocations(plan).length ||
          inspectImports(plan).length ||
          inspectRelinquishments(plan).length
        )
          throw Error('Terraform final retirement plan is incomplete or contains changes');
        emptyValues(object(plan.planned_values));
        const state = decode(await this.#run(['show', '-json'], env, signal));
        if (
          typeof state.format_version !== 'string' ||
          !/^1\.\d+$/.test(state.format_version) ||
          (state.terraform_version !== undefined && state.terraform_version !== manifest.terraformVersion)
        )
          throw Error('Terraform retirement state is malformed');
        emptyValues(object(state.values ?? {}));
        await this.#verifyInputs();
        if (
          receipt.planSha256 !== digest(await privateRead(join(directory, 'saved.tfplan'))) ||
          canonical(journal) !== canonical(decode((await privateRead(join(directory, 'plan-receipt.json'))).toString()))
        )
          throw Error('Terraform retirement saved evidence changed');
        const execution = object(journal.execution);
        if (
          !execution.terraform ||
          !this.#executorIdentity ||
          encode(execution.terraform) !== encode(this.#executorIdentity)
        )
          throw Error('Independent cleanup owning executor provenance unavailable');
        const request = await cleanupRequest(directory, {
          manifestSha256: digest(canonical(manifest)),
          evidenceSha256,
          finalPlanSha256: receipt.planSha256,
          planReceiptSha256: digest(canonical(receipt)),
          terraform: this.#executorIdentity,
        });
        independentCleanup = validateIndependentCleanup(
          await this.independentVerifier(request, this.#environment(env), signal),
          request,
        );
        if (independentCleanup.terraformVersion !== manifest.terraformVersion)
          throw Error('Independent cleanup version differs');
        await this.#verifyInputs();
        if (encode(await inputDigests(directory)) !== encode(request.inputs))
          throw Error('Independent cleanup original inputs changed before retirement');
        signal?.throwIfAborted();
      }
      return retirePrivateArtifacts(
        directory,
        digest(canonical(manifest)),
        evidenceSha256,
        receipt.planSha256,
        digest(canonical(receipt)),
        signal,
        independentCleanup,
      );
    }, true);
  }
  /** Preserve even an interrupted attempt before Terraform can overwrite its binary plan. */
  async #archivePlanAttempt(): Promise<void> {
    const { directory } = this.#state();
    const files = new Map<string, Buffer>();
    for (const name of ['saved.tfplan', 'plan-receipt.json']) {
      try {
        files.set(name, await privateRead(join(directory, name)));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    if (!files.size) return;
    for (const name of ['main.tf.json', 'deployment.json', '.terraform.lock.hcl', 'deployment.tfrc'])
      files.set(name, await privateRead(join(directory, name)));
    const inventory = JSON.stringify(Object.fromEntries([...files].map(([name, bytes]) => [name, digest(bytes)])));
    const archive = join(directory, 'plan-history', digest(inventory));
    await privateDirectory(archive);
    files.set('inventory.json', Buffer.from(inventory));
    for (const [name, bytes] of files) {
      try {
        await writeFile(join(archive, name), bytes, { mode: 0o600, flag: 'wx' });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if (digest(await privateRead(join(archive, name))) !== digest(bytes))
          throw new Error('Terraform plan history differs');
      }
    }
  }
  async readProviderSchemas(
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const version = decode(await this.#run(['version', '-json'], env, signal));
      if (version.terraform_version !== this.#state().manifest.terraformVersion)
        throw new Error('Terraform version changed');
      await this.#run(['init', '-input=false', '-lockfile=readonly'], env, signal);
      const schema = decode(await this.#run(['providers', 'schema', '-json'], env, signal));
      return object(schema.provider_schemas);
    });
  }
  async readResourceIdentities(env: Record<string, string | undefined>, signal?: AbortSignal) {
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const version = decode(await this.#run(['version', '-json'], env, signal));
      if (version.terraform_version !== this.#state().manifest.terraformVersion)
        throw new Error('Terraform version changed');
      const state = decode(await this.#run(['show', '-json'], env, signal));
      const rows: Array<{
        address: string;
        type: string;
        id: string;
        name?: string;
        namespace?: string;
        labels?: unknown;
      }> = [];
      const walk = (module: Json) => {
        for (const value of (module.resources ?? []) as unknown[]) {
          const resource = object(value);
          if (resource.mode !== 'managed') continue;
          const values = object(resource.values);
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
        for (const child of (module.child_modules ?? []) as unknown[]) walk(object(child));
      };
      if (state.values) walk(object(object(state.values).root_module));
      return rows;
    });
  }
  async plan(
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
    refreshOriginSha256?: string,
  ): Promise<PlanReceipt> {
    if (refreshOriginSha256 !== undefined && !/^[a-f0-9]{64}$/.test(refreshOriginSha256))
      throw Error('Exact owning refresh origin digest required');
    return this.#plan(env, signal, undefined, false, undefined, undefined, refreshOriginSha256);
  }
  /** Cloud adapters must establish ownership of every state resource before teardown. */
  async planDestroy(env: Record<string, string | undefined>, signal?: AbortSignal): Promise<PlanReceipt> {
    return this.#plan(env, signal, undefined, true);
  }
  /** One explicitly selected action; cloud lifecycle adapters supply ownership and convergence gates. */
  async planAction(
    intent: TerraformActionIntent,
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<PlanReceipt> {
    intent = structuredClone(intent);
    validateActionIntent(intent);
    return this.#plan(env, signal, intent);
  }
  /** Import-only saved plan, never an implicit import alongside infrastructure changes. */
  async planImports(
    intents: TerraformImportIntent[],
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<PlanReceipt> {
    intents = structuredClone(intents);
    validateImportIntents(intents);
    return this.#plan(env, signal, undefined, false, intents);
  }
  /** Explicit state-only saved plan; restoration and physical preservation belong to the owning cloud adapter. */
  async planRelinquishments(
    intents: TerraformRelinquishmentIntent[],
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<PlanReceipt> {
    intents = structuredClone(intents);
    validateRelinquishmentIntents(intents);
    return this.#plan(env, signal, undefined, false, undefined, intents);
  }
  async #plan(
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
    action?: TerraformActionIntent,
    destroy = false,
    imports?: TerraformImportIntent[],
    relinquishments?: TerraformRelinquishmentIntent[],
    refreshOriginSha256?: string,
  ): Promise<PlanReceipt> {
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
      const imported = inspectImports(plan, imports);
      const relinquished = inspectRelinquishments(plan, relinquishments);
      const changes: PlanReceipt['changes'] = [];
      for (const value of (plan.resource_changes ?? []) as unknown[]) {
        const resource = object(value);
        const change = object(resource.change);
        const actions = changeActions(change.actions, false, !!relinquishments);
        if (
          typeof resource.address !== 'string' ||
          typeof resource.type !== 'string' ||
          changes.some((change) => change.address === resource.address)
        )
          throw new Error('Terraform resource change is malformed');
        changes.push({ address: resource.address, type: resource.type, actions });
      }
      const outputs = Object.values(object(plan.output_changes ?? {})).map((output) =>
        changeActions(object(output).actions, true),
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
      const noChanges =
        resourcesUnchanged && actionInvocations.length === 0 && imported.length === 0 && relinquished.length === 0;
      if (!noChanges && !plan[planApplicationFlag]) throw new Error('Terraform plan has changes but cannot be applied');
      if (refreshOriginSha256 !== undefined && !noChanges) throw Error('Owning final refresh contains changes');
      const manifest = this.#state().manifest;
      const receipt: PlanReceipt = {
        schemaVersion: 1,
        deploymentId: manifest.deploymentId,
        engine: 'terraform',
        backendIdentity: manifest.backendIdentity,
        configurationSha256: manifest.configurationSha256,
        providerLockSha256: manifest.providerLockSha256,
        planSha256: digest(await privateRead(join(this.#state().directory, 'saved.tfplan'))),
        changes,
        noChanges,
        ...(actionInvocations.length ? { actionInvocations } : {}),
        ...(imported.length ? { imports: imported } : {}),
        ...(relinquished.length ? { relinquishments: relinquished } : {}),
        ...(destroy ? { operation: 'destroy' as const } : {}),
        ...(refreshOriginSha256 === undefined ? {} : { refreshOriginSha256 }),
      };
      await persist(join(this.#state().directory, 'plan-receipt.json'), {
        state: 'planned',
        receipt,
        ...(this.#executorIdentity
          ? {
              execution: {
                terraform: this.#executorIdentity,
                planArgs: [
                  'plan',
                  '-input=false',
                  '-lock=true',
                  '-lock-timeout=60s',
                  '-refresh=true',
                  '-out=saved.tfplan',
                  ...(action ? [`-invoke=${action.address}`] : []),
                  ...(destroy ? ['-destroy'] : []),
                ],
              },
            }
          : {}),
      });
      return receipt;
    });
  }
  async #assertActionUnsubmitted(): Promise<void> {
    try {
      await privateRead(join(this.#state().directory, 'action-attempt.json'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    throw new Error('This stage already recorded an action submission; observe its outcome instead of replaying it');
  }
  async #preserveActionSubmission(): Promise<void> {
    const directory = this.#state().directory;
    let journal: Json;
    try {
      journal = decode((await privateRead(join(directory, 'plan-receipt.json'))).toString());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    if (!['applying', 'applied'].includes(String(journal.state))) return;
    const actions = object(journal.receipt).actionInvocations;
    if (!Array.isArray(actions) || actions.length === 0) return;
    try {
      await privateRead(join(directory, 'action-attempt.json'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      // Older workspaces recorded submission only in the journal that a refresh replaces.
      await persist(join(directory, 'action-attempt.json'), {
        schemaVersion: 1,
        legacyJournalState: journal.state,
        receipt: journal.receipt,
      });
    }
  }
  /** Internal adapter input only: select declared, non-sensitive outputs after convergence. */
  async readOutputs(
    names: string[],
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
    allowMissing = false,
  ): Promise<Record<string, unknown>> {
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
      let journal: Json;
      try {
        journal = decode((await privateRead(join(directory, 'plan-receipt.json'))).toString());
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        throw Error('Terraform outputs require an applied or converged current configuration');
      }
      const receipt = object(journal.receipt);
      if (
        !(journal.state === 'applied' || (journal.state === 'planned' && receipt.noChanges === true)) ||
        receipt.configurationSha256 !== manifest.configurationSha256 ||
        receipt.providerLockSha256 !== manifest.providerLockSha256
      )
        throw new Error('Terraform outputs require an applied or converged current configuration');
      const version = decode(await this.#run(['version', '-json'], env, signal));
      if (version.terraform_version !== manifest.terraformVersion) throw new Error('Terraform version changed');
      const outputs = decode(await this.#run(['output', '-json'], env, signal));
      const selected: Record<string, unknown> = {};
      for (const name of names) {
        if (allowMissing && !Object.hasOwn(outputs, name)) continue;
        const output = object(outputs[name]);
        if (output.sensitive !== false || !Object.hasOwn(output, 'value') || !Object.hasOwn(output, 'type'))
          throw new Error('Requested Terraform output is unavailable, malformed or sensitive');
        selected[name] = output.value;
      }
      return selected;
    });
  }
  /** Private lifecycle identity projection from the exact saved plan; never a conversational summary. */
  async readPlannedResourceIds(
    receipt: PlanReceipt,
    addresses: string[],
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<Record<string, string | null>> {
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
  /** Private field projection for cloud ownership checks. Never export this as a plan summary. */
  async readPlannedResourceFields(
    receipt: PlanReceipt,
    selections: Record<string, string[]>,
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<Record<string, Record<string, unknown> | null>> {
    return this.#projectResourceFields(receipt, selections, 'before', env, signal);
  }
  /** Resolved proposed values from the exact saved plan, never prior-state or unknown values. */
  async readProposedResourceFields(
    receipt: PlanReceipt,
    selections: Record<string, string[]>,
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<Record<string, Record<string, unknown> | null>> {
    return this.#projectResourceFields(receipt, selections, 'after', env, signal);
  }
  /** Private resolved leaf projection from the exact unsubmitted saved plan. */
  async readPlannedResourcePaths(
    receipt: PlanReceipt,
    selections: Record<string, string[]>,
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<Record<string, Record<string, unknown> | null>> {
    return this.#projectResourceFields(receipt, selections, 'before', env, signal, true);
  }
  /** Selected proposed leaves remain subject to unknown/sensitive ancestor and saved-plan checks. */
  async readProposedResourcePaths(
    receipt: PlanReceipt,
    selections: Record<string, string[]>,
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<Record<string, Record<string, unknown> | null>> {
    return this.#projectResourceFields(receipt, selections, 'after', env, signal, true);
  }
  async #projectResourceFields(
    receipt: PlanReceipt,
    selections: Record<string, string[]>,
    side: 'before' | 'after',
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
    paths = false,
  ): Promise<Record<string, Record<string, unknown> | null>> {
    const validPath = (field: string) => {
      try {
        parseTerraformFieldPath(field);
        return true;
      } catch {
        return false;
      }
    };
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
          fields.some(
            (field) => typeof field !== 'string' || !(paths ? validPath(field) : /^[a-z][a-z0-9_]*$/.test(field)),
          ),
      )
    )
      throw new Error(
        paths
          ? 'Explicit root resource addresses and unique valid field paths are required'
          : 'Explicit root resource addresses and unique top-level fields are required',
      );
    selections = structuredClone(selections);
    receipt = structuredClone(receipt);
    const nonsensitive = (value: unknown): boolean =>
      value === undefined ||
      value === false ||
      (value !== null && typeof value === 'object' && Object.values(value).every(nonsensitive));
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const { directory, manifest } = this.#state();
      const journal = decode((await privateRead(join(directory, 'plan-receipt.json'))).toString());
      if (
        journal.state !== 'planned' ||
        canonical(journal.receipt) !== canonical(receipt) ||
        receipt.configurationSha256 !== manifest.configurationSha256 ||
        receipt.planSha256 !== digest(await privateRead(join(directory, 'saved.tfplan')))
      )
        throw new Error('Terraform identity inspection saved plan differs');
      const version = decode(await this.#run(['version', '-json'], env, signal));
      if (version.terraform_version !== manifest.terraformVersion) throw new Error('Terraform version changed');
      const plan = decode(await this.#run(['show', '-json', 'saved.tfplan'], env, signal));
      const changes = plan.resource_changes === undefined ? [] : plan.resource_changes;
      if (!Array.isArray(changes)) throw new Error('Terraform plan resource identities unavailable');
      const result: Record<string, Record<string, unknown> | null> = {};
      for (const [address, fields] of Object.entries(selections)) {
        const matches = changes.map(object).filter((resource) => resource.address === address);
        if (matches.length > 1) throw new Error('Terraform resource identity is ambiguous');
        if (!matches.length) {
          result[address] = null;
          continue;
        }
        const change = object(matches[0].change);
        if (
          paths &&
          (!Object.hasOwn(change, side) ||
            change[side] === undefined ||
            (change[side] === null &&
              (!nonsensitive(change[`${side}_sensitive`]) ||
                (side === 'after' && !nonsensitive(change.after_unknown)))))
        )
          throw new Error('Terraform resource path is unavailable, sensitive or unresolved');
        if (change[side] === null || change[side] === undefined) {
          result[address] = null;
          continue;
        }
        const values = object(change[side]);
        const sensitive = change[`${side}_sensitive`];
        const sensitivity =
          sensitive === undefined || sensitive === false ? {} : sensitive === true ? true : object(sensitive);
        const unknown = side === 'after' ? change.after_unknown : undefined;
        const unknownFields =
          unknown === undefined || unknown === false ? {} : unknown === true ? true : object(unknown);
        const selected: Record<string, unknown> = {};
        for (const field of fields) {
          if (paths) {
            selected[field] = projectTerraformFieldPath(values, sensitive, unknown, field);
            continue;
          }
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
      if (receipt.planSha256 !== digest(await privateRead(join(directory, 'saved.tfplan'))))
        throw new Error('Terraform identity inspection saved plan changed');
      return result;
    });
  }
  async #applicationState(receipt: PlanReceipt): Promise<'planned' | 'applying' | 'applied'> {
    await this.#verifyInputs();
    const { directory, manifest } = this.#state();
    const journal = decode((await privateRead(join(directory, 'plan-receipt.json'))).toString());
    if (
      !['planned', 'applying', 'applied'].includes(String(journal.state)) ||
      canonical(journal.receipt) !== canonical(receipt) ||
      receipt.engine !== 'terraform' ||
      receipt.deploymentId !== manifest.deploymentId ||
      receipt.backendIdentity !== manifest.backendIdentity ||
      receipt.configurationSha256 !== manifest.configurationSha256 ||
      receipt.providerLockSha256 !== manifest.providerLockSha256 ||
      receipt.planSha256 !== digest(await privateRead(join(directory, 'saved.tfplan')))
    )
      throw Error('Terraform application journal differs from exact saved plan');
    return journal.state as 'planned' | 'applying' | 'applied';
  }
  /** Exact journal state distinguishes an interrupted call before submission from ambiguous application. */
  async readPlanApplicationState(receipt: PlanReceipt): Promise<'planned' | 'applying' | 'applied'> {
    receipt = structuredClone(receipt);
    return this.#exclusive(() => this.#applicationState(receipt));
  }
  /** Private current journal/byte identity, including a plan whose adapter publication was lost.
   * This never plans or applies, and does not qualify plan semantics or cloud outcome. Callers
   * separately authenticate stage provenance/projections before reconciliation or retirement.
   */
  async readCurrentPlanJournal(expectedConfigurationSha256: string, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (!/^[a-f0-9]{64}$/.test(expectedConfigurationSha256)) throw Error('Exact current configuration digest required');
    return this.#exclusive(async () => {
      signal?.throwIfAborted();
      await this.#verifyInputs();
      const { directory, manifest } = this.#state(),
        manifestSha256 = digest(canonical(manifest));
      if (manifest.configurationSha256 !== expectedConfigurationSha256)
        throw Error('Current journal configuration is stale');
      const readOptional = async (name: string) => {
        signal?.throwIfAborted();
        try {
          return await privateRead(join(directory, name));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      };
      const journalBytes = await readOptional('plan-receipt.json'),
        savedPlan = await readOptional('saved.tfplan');
      if (!!journalBytes !== !!savedPlan) throw Error('Current saved plan and journal are incomplete');
      let receipt: PlanReceipt | undefined,
        state: 'absent' | 'planned' | 'applying' | 'applied' = 'absent';
      let executionBinding: { executionSha256: string; ordinaryRefreshEnabled: boolean } | undefined;
      if (journalBytes && savedPlan) {
        const parsed = decodeSavedPlanJournal(journalBytes);
        receipt = parsed.receipt;
        if (parsed.executionSha256)
          executionBinding = {
            executionSha256: parsed.executionSha256,
            ordinaryRefreshEnabled: parsed.ordinaryRefreshEnabled === true,
          };
        state = await this.#applicationState(receipt);
      }
      await this.#verifyInputs();
      if (digest(canonical(this.#state().manifest)) !== manifestSha256) throw Error('Current journal manifest changed');
      const finalJournal = await readOptional('plan-receipt.json'),
        finalPlan = await readOptional('saved.tfplan');
      if (
        (journalBytes === undefined) !== (finalJournal === undefined) ||
        (savedPlan === undefined) !== (finalPlan === undefined) ||
        (journalBytes && finalJournal && digest(journalBytes) !== digest(finalJournal)) ||
        (savedPlan && finalPlan && digest(savedPlan) !== digest(finalPlan))
      )
        throw Error('Current saved-plan bytes or journal changed');
      signal?.throwIfAborted();
      return {
        schemaVersion: 1 as const,
        scope: 'current-saved-plan-byte-and-journal-binding' as const,
        state,
        receipt,
        manifestSha256,
        journalSha256: journalBytes ? digest(journalBytes) : null,
        savedPlanSha256: savedPlan ? digest(savedPlan) : null,
        planSemanticsQualified: false as const,
        ...executionBinding,
      };
    });
  }

  /** Read-only exact receipt occurrences in current and durable revision/plan archives.
   * Journal state is local submission evidence only; cloud outcome, chronology and retirement
   * are deliberately separate. Private source bytes are hashed and never returned.
   */
  async readPlanApplicationHistory(receipt: PlanReceipt, signal?: AbortSignal) {
    return this.#exclusive(() => this.#readPlanApplicationHistory(receipt, signal));
  }
  async #readPlanApplicationHistory(receipt: PlanReceipt, signal?: AbortSignal, includeCurrent = true) {
    signal?.throwIfAborted();
    receipt = decodeSavedPlanJournal(Buffer.from(JSON.stringify({ state: 'planned', receipt }))).receipt;
    await this.#verifyInputs();
    const { manifest } = this.#state();
    if (
      receipt.schemaVersion !== 1 ||
      receipt.engine !== 'terraform' ||
      receipt.deploymentId !== manifest.deploymentId ||
      receipt.backendIdentity !== manifest.backendIdentity ||
      receipt.providerLockSha256 !== manifest.providerLockSha256 ||
      !/^[a-f0-9]{64}$/.test(receipt.configurationSha256) ||
      !/^[a-f0-9]{64}$/.test(receipt.planSha256)
    )
      throw Error('Historical saved-plan receipt ownership or digest differs');
    const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
    const inventory = await this.#readPlanJournalInventory(signal, deadline, includeCurrent);
    if (inventory.manifestSha256 !== digest(canonical(manifest)))
      throw Error('Historical journal current manifest changed');
    const receiptSha256 = digest(canonical(receipt));
    const matches = inventory.entries.flatMap((entry) => {
      if (entry.state === 'absent' || entry.state === 'unknown' || entry.receiptSha256 !== receiptSha256) return [];
      if (!entry.journalSha256 || !entry.savedPlanSha256) throw Error('Historical complete journal lacks saved bytes');
      return [
        {
          location: entry.location,
          archiveSha256: entry.archiveSha256,
          state: entry.state,
          journalSha256: entry.journalSha256,
          savedPlanSha256: entry.savedPlanSha256,
          configurationSha256: entry.configurationSha256,
          manifestSha256: entry.manifestSha256,
        },
      ];
    });
    return {
      schemaVersion: 1 as const,
      scope: 'exact-saved-plan-journal-history' as const,
      receiptSha256,
      manifestSha256: inventory.manifestSha256,
      matches,
      incompleteArchives: inventory.incompleteArchives,
      applicationOutcomeQualified: false as const,
      retirementQualified: false as const,
    };
  }

  /** Exhaustive native plan-journal metadata. Completeness is byte/namespace
   * evidence only; accepted request provenance, plan semantics, cloud outcome
   * and retirement are separately qualified. Source/plan/enrollment bytes never
   * leave this reader. Partial or unrecognized artifacts cannot admit execution.
   */
  async readPlanJournalInventory(signal?: AbortSignal) {
    const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
    deadline.throwIfAborted();
    const task = this.#exclusive(() => this.#readPlanJournalInventory(signal, deadline));
    let interrupted = () => {};
    const cancelled = new Promise<never>((_, reject) => {
      interrupted = () => reject(deadline.reason);
      deadline.addEventListener('abort', interrupted, { once: true });
    });
    return Promise.race([task, cancelled]).finally(() => deadline.removeEventListener('abort', interrupted));
  }
  async #readPlanJournalInventory(signal: AbortSignal | undefined, deadline: AbortSignal, includeCurrent = true) {
    const check = () => {
      deadline.throwIfAborted();
      signal?.throwIfAborted();
    };
    check();
    check();
    await this.#verifyInputs();
    const { directory, manifest } = this.#state(),
      manifestSha256 = digest(canonical(manifest));
    const bytesByPath = new Map<string, string | null>(),
      dirs = new Map<string, string[] | null>();
    const read = async (path: string) => {
      check();
      let bytes: Buffer | undefined;
      try {
        bytes = await privateRead(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      const sha256 = bytes ? digest(bytes) : null;
      if (bytesByPath.has(path) && bytesByPath.get(path) !== sha256)
        throw Error('Historical journal bytes changed during collection');
      bytesByPath.set(path, sha256);
      return bytes;
    };
    const list = async (path: string) => {
      check();
      let names: string[] | null = null;
      try {
        const stat = await lstat(path);
        if (
          !stat.isDirectory() ||
          stat.isSymbolicLink() ||
          stat.uid !== process.getuid?.() ||
          (stat.mode & 0o077) !== 0 ||
          (await realpath(path)) !== path
        )
          throw Error('Historical journal directory ownership differs');
        names = (await readdir(path)).sort();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      if (dirs.has(path) && canonical(dirs.get(path)) !== canonical(names))
        throw Error('Historical journal directory changed');
      dirs.set(path, names);
      return names;
    };
    const entries: Array<{
      location: 'current' | 'revision' | 'plan-history';
      archiveRef: string | null;
      archiveSha256: string;
      state: 'absent' | 'unknown' | 'planned' | 'applying' | 'applied';
      receiptSha256: string | null;
      journalSha256: string | null;
      savedPlanSha256: string | null;
      configurationSha256: string;
      manifestSha256: string;
      executionSha256?: string;
      ordinaryRefreshEnabled?: boolean;
    }> = [];
    let incompleteArchives = 0;
    const inspect = async (path: string, location: 'current' | 'revision' | 'plan-history', ref?: string) => {
      const names = location === 'current' ? null : await list(path);
      if (location !== 'current' && !names) throw Error('Historical journal archive disappeared');
      const allowed = [
        'main.tf.json',
        'deployment.json',
        'saved.tfplan',
        'plan-receipt.json',
        ...(location === 'plan-history' ? ['.terraform.lock.hcl', 'deployment.tfrc', 'inventory.json'] : []),
      ];
      if (names?.some((name) => !allowed.includes(name))) throw Error('Historical journal archive has unknown files');
      const files = new Map<string, Buffer>();
      for (const name of allowed) {
        const bytes = await read(join(path, name));
        if (bytes) files.set(name, bytes);
      }
      const source = files.get('main.tf.json'),
        owner = files.get('deployment.json');
      if (!source || !owner) throw Error('Historical journal archive lacks original configuration/manifest');
      const archiveManifest = decode(owner.toString());
      if (canonical(archiveManifest) !== canonical({ ...manifest, configurationSha256: digest(source) }))
        throw Error('Historical journal archive manifest ownership differs');
      if (location === 'plan-history') {
        const inventoryBytes = files.get('inventory.json'),
          lock = files.get('.terraform.lock.hcl'),
          config = files.get('deployment.tfrc');
        if (
          !inventoryBytes ||
          !lock ||
          !config ||
          digest(lock) !== manifest.providerLockSha256 ||
          digest(config) !== digest(cliConfig) ||
          digest(inventoryBytes) !== ref
        )
          throw Error('Historical plan archive inventory/provider identity differs');
        const expected = Object.fromEntries(
          [...files].filter(([name]) => name !== 'inventory.json').map(([name, value]) => [name, digest(value)]),
        );
        if (canonical(decode(inventoryBytes.toString())) !== canonical(expected))
          throw Error('Historical plan archive inventory bytes differ');
      }
      const journal = files.get('plan-receipt.json'),
        plan = files.get('saved.tfplan');
      const identity = {
        location,
        archiveRef: ref ?? null,
        archiveSha256: digest(canonical(Object.fromEntries([...files].map(([name, value]) => [name, digest(value)])))),
        journalSha256: journal ? digest(journal) : null,
        savedPlanSha256: plan ? digest(plan) : null,
        configurationSha256: digest(source),
        manifestSha256: digest(canonical(archiveManifest)),
      };
      if (!journal || !plan) {
        if (journal || plan) incompleteArchives++;
        entries.push({ ...identity, state: journal || plan ? 'unknown' : 'absent', receiptSha256: null });
        return;
      }
      const parsed = decodeSavedPlanJournal(journal);
      if (
        parsed.receipt.schemaVersion !== 1 ||
        parsed.receipt.engine !== 'terraform' ||
        parsed.receipt.deploymentId !== manifest.deploymentId ||
        parsed.receipt.backendIdentity !== manifest.backendIdentity ||
        parsed.receipt.providerLockSha256 !== manifest.providerLockSha256 ||
        parsed.receipt.configurationSha256 !== archiveManifest.configurationSha256 ||
        parsed.receipt.planSha256 !== digest(plan)
      )
        throw Error('Historical saved journal differs from archived manifest/plan bytes');
      entries.push({
        ...identity,
        state: parsed.state,
        receiptSha256: digest(canonical(parsed.receipt)),
        ...(parsed.executionSha256
          ? {
              executionSha256: parsed.executionSha256,
              ordinaryRefreshEnabled: parsed.ordinaryRefreshEnabled === true,
            }
          : {}),
      });
    };
    const rootNames = await list(directory);
    const known = new Set([
      'main.tf.json',
      'deployment.json',
      '.terraform.lock.hcl',
      'deployment.tfrc',
      'saved.tfplan',
      'plan-receipt.json',
      '.runner-lock',
      '.terraform',
      'terraform.tfstate',
      'terraform.tfstate.backup',
      'terraform.tfstate.lock.info',
      'revisions',
      'plan-history',
    ]);
    // Unrecognized native root artifacts remain explicit partial evidence. Other
    // lifecycle records require their own qualified readers before admission.
    const unrecognizedRootEntrySha256s = (rootNames ?? [])
      .filter((name) => !known.has(name))
      .map((name) => digest(name));
    if (includeCurrent) await inspect(directory, 'current');
    for (const root of ['revisions', 'plan-history'] as const) {
      const path = join(directory, root),
        names = await list(path);
      for (const name of names ?? []) {
        if (!(root === 'revisions' ? /^[a-f0-9-]{36}$/ : /^[a-f0-9]{64}$/).test(name))
          throw Error('Historical journal archive reference is malformed');
        await inspect(join(path, name), root === 'revisions' ? 'revision' : 'plan-history', name);
      }
    }
    await this.#verifyInputs();
    if (digest(canonical(this.#state().manifest)) !== manifestSha256)
      throw Error('Historical journal current manifest changed');
    for (const path of dirs.keys()) await list(path);
    for (const path of bytesByPath.keys()) await read(path);
    check();
    return {
      schemaVersion: 1 as const,
      scope: 'all-native-saved-plan-journal-inventory' as const,
      status: incompleteArchives || unrecognizedRootEntrySha256s.length ? ('partial' as const) : ('complete' as const),
      manifestSha256,
      entries,
      entriesSha256: digest(canonical(entries)),
      namespaceSha256: digest(
        canonical(
          Object.fromEntries(
            [...dirs].map(([path, names]) => [
              path === directory ? 'current' : path.slice(directory.length + 1),
              names,
            ]),
          ),
        ),
      ),
      unrecognizedRootEntrySha256s,
      incompleteArchives,
      applicationOutcomeQualified: false as const,
      retirementQualified: false as const,
    };
  }

  /** Restricted applied-state observation. Desired plan values never substitute for applied state. */
  async readAppliedResourceFields(
    receipt: PlanReceipt,
    selections: Record<string, string[]>,
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<Record<string, Record<string, unknown> | null>> {
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
    const resolved = (v: unknown): boolean =>
      v !== null && v !== undefined && (typeof v !== 'object' || Object.values(v).every(resolved));
    const nonsensitive = (v: unknown): boolean =>
      v === undefined || v === false || (v !== null && typeof v === 'object' && Object.values(v).every(nonsensitive));
    return this.#exclusive(async () => {
      if ((await this.#applicationState(receipt)) === 'planned' && !receipt.noChanges)
        throw Error('Terraform applied-state observation requires submitted plan');
      const version = decode(await this.#run(['version', '-json'], env, signal));
      if (version.terraform_version !== this.#state().manifest.terraformVersion)
        throw Error('Terraform version changed');
      const state = decode(await this.#run(['show', '-json'], env, signal));
      const resources: Json[] = [];
      if (state.format_version !== '1.0' || state.terraform_version !== this.#state().manifest.terraformVersion)
        throw Error('Applied-state format or Terraform version differs');
      const walk = (module: Json) => {
        if (!Array.isArray(module.resources ?? []) || !Array.isArray(module.child_modules ?? []))
          throw Error('Malformed applied-state inventory');
        for (const value of (module.resources ?? []) as unknown[]) resources.push(object(value));
        for (const child of (module.child_modules ?? []) as unknown[]) walk(object(child));
      };
      walk(object(object(state.values).root_module));
      if (new Set(resources.map((r) => r.address)).size !== resources.length)
        throw Error('Duplicate applied-state resources');
      const result: Record<string, Record<string, unknown> | null> = {};
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
        const values = object(row.values);
        const sensitive =
          row.sensitive_values === true
            ? true
            : row.sensitive_values === undefined || row.sensitive_values === false
              ? {}
              : object(row.sensitive_values);
        const selected: Record<string, unknown> = {};
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
  async apply(receipt: PlanReceipt, env: Record<string, string | undefined>, signal?: AbortSignal): Promise<void> {
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      let journal: Json;
      try {
        journal = decode((await privateRead(join(this.#state().directory, 'plan-receipt.json'))).toString());
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        throw Error('Terraform saved-plan receipt does not match current configuration');
      }
      decodeSavedPlanJournal(Buffer.from(JSON.stringify(journal)));
      if (journal.state !== 'planned') throw new Error('Saved plan is consumed or requires reconciliation');
      if (
        canonical(receipt) !== canonical(journal.receipt) ||
        receipt.engine !== 'terraform' ||
        receipt.deploymentId !== this.#state().manifest.deploymentId ||
        receipt.configurationSha256 !== this.#state().manifest.configurationSha256 ||
        receipt.providerLockSha256 !== this.#state().manifest.providerLockSha256 ||
        receipt.planSha256 !== digest(await privateRead(join(this.#state().directory, 'saved.tfplan')))
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
      if (receipt.imports && (expectedActions.length || receipt.operation || receipt.relinquishments))
        throw new Error('Saved import stage cannot contain actions or destruction');
      if (canonical(inspectImports(plan, receipt.imports)) !== canonical(receipt.imports ?? []))
        throw new Error('Saved import receipt differs from exact plan');
      if (receipt.relinquishments && (expectedActions.length || receipt.operation || receipt.imports))
        throw Error('Saved relinquishment stage cannot contain imports, actions or destruction');
      if (canonical(inspectRelinquishments(plan, receipt.relinquishments)) !== canonical(receipt.relinquishments ?? []))
        throw Error('Saved relinquishment receipt differs from exact plan');
      if (receipt.planSha256 !== digest(await privateRead(join(this.#state().directory, 'saved.tfplan'))))
        throw new Error('Terraform saved plan changed during action inspection');
      if (expectedActions.length) {
        await this.#assertActionUnsubmitted();
        await persist(join(this.#state().directory, 'action-attempt.json'), {
          schemaVersion: 1,
          submittedAt: new Date().toISOString(),
          receipt,
        });
      }
      const applyingJournal = await this.#transitionSavedPlanJournal(journal, 'applying', receipt);
      await this.#run(['apply', '-input=false', '-lock=true', '-lock-timeout=60s', 'saved.tfplan'], env, signal);
      await this.#transitionSavedPlanJournal(applyingJournal, 'applied', receipt);
    });
  }
}
