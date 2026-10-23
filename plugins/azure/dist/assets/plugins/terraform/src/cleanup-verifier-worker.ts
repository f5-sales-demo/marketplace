/** Separate process: inspect original local inputs without importing the owning runner. */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

export const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export const encode = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(encode).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${encode(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
};
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Independent cleanup JSON is malformed');
  return value as Record<string, unknown>;
};
export async function privateBytes(path: string) {
  const before = await lstat(path);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.uid !== process.getuid?.() ||
    before.mode & 0o077
  )
    throw Error('Independent cleanup file ownership differs');
  const bytes = await readFile(path),
    after = await lstat(path);
  if (
    before.ino !== after.ino ||
    before.dev !== after.dev ||
    before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs
  )
    throw Error('Independent cleanup file changed');
  return bytes;
}
export async function inputDigests(directory: string) {
  const inputs: Record<string, string | null> = {};
  for (const name of [
    'main.tf.json',
    '.terraform.lock.hcl',
    'deployment.tfrc',
    'deployment.json',
    'plan-receipt.json',
    'saved.tfplan',
    'terraform.tfstate',
  ]) {
    try {
      inputs[name] = hash(await privateBytes(join(directory, name)));
    } catch (error) {
      if (name !== 'terraform.tfstate' || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      inputs[name] = null;
    }
  }
  return inputs;
}
function emptyValues(value: unknown) {
  const values = object(value);
  if (Object.keys(object(values.outputs ?? {})).length) throw Error('Independent cleanup outputs remain');
  const walk = (value: unknown) => {
    const module = object(value);
    if (
      !Array.isArray(module.resources ?? []) ||
      !Array.isArray(module.child_modules ?? []) ||
      (module.resources as unknown[] | undefined)?.length
    )
      throw Error('Independent cleanup resources remain or module is partial');
    for (const child of (module.child_modules ?? []) as unknown[]) walk(child);
  };
  walk(values.root_module ?? {});
}
export function inspectEmptyState(value: unknown, version: string, originalStateAbsent = false) {
  if (originalStateAbsent && encode(value) === encode({ format_version: '1.0' })) return;
  const state = object(value);
  if (
    typeof state.format_version !== 'string' ||
    !/^1\.\d+$/.test(state.format_version) ||
    state.terraform_version !== version
  )
    throw Error('Independent cleanup state version differs');
  emptyValues(state.values);
}
export function inspectEmptyPlan(value: unknown, version: string) {
  const plan = object(value);
  if (
    typeof plan.format_version !== 'string' ||
    !/^1\.\d+$/.test(plan.format_version) ||
    plan.terraform_version !== version ||
    plan.errored !== false ||
    plan.complete !== true ||
    typeof plan[['apply', 'able'].join('')] !== 'boolean'
  )
    throw Error('Independent cleanup plan is incomplete');
  for (const name of ['resource_changes', 'action_invocations', 'deferred_changes', 'resource_drift']) {
    if (!Array.isArray(plan[name] ?? []) || (plan[name] as unknown[] | undefined)?.length)
      throw Error('Independent cleanup plan contains actions, changes or deferred evidence');
  }
  if (Object.keys(object(plan.output_changes ?? {})).length)
    throw Error('Independent cleanup plan output changes remain');
  emptyValues(plan.planned_values);
  if (plan.prior_state !== undefined) emptyValues(object(plan.prior_state).values);
}
export interface ExecutableIdentity {
  path: string;
  sha256: string;
}
export async function executableIdentity(path: string): Promise<ExecutableIdentity> {
  if (!isAbsolute(path)) throw Error('Independent cleanup executable is unresolved');
  const resolved = await realpath(path),
    stat = await lstat(resolved);
  if (!stat.isFile() || !(stat.mode & 0o111) || stat.mode & 0o022)
    throw Error('Independent cleanup executable is unsafe');
  return { path: resolved, sha256: hash(await readFile(resolved)) };
}
export interface CleanupRequest {
  schemaVersion: 1;
  nonce: string;
  startedAt: string;
  deadline: string;
  parentPid: number;
  directory: string;
  manifestSha256: string;
  evidenceSha256: string;
  finalPlanSha256: string;
  planReceiptSha256: string;
  inputs: Record<string, string | null>;
  terraform: ExecutableIdentity;
  interpreter: ExecutableIdentity;
  workerSha256: string;
}
export interface IndependentCleanupEvidence {
  schemaVersion: 1;
  status: 'independently-verified';
  nonce: string;
  requestSha256: string;
  startedAt: string;
  completedAt: string;
  executorPid: number;
  parentPid: number;
  manifestSha256: string;
  evidenceSha256: string;
  finalPlanSha256: string;
  planReceiptSha256: string;
  inputInventorySha256: string;
  terraformExecutableSha256: string;
  terraformExecutablePathSha256: string;
  interpreterSha256: string;
  workerSha256: string;
  terraformVersion: string;
  stateJsonSha256: string;
  originalPlanJsonSha256: string;
  refreshedPlanSha256: string;
  refreshedPlanJsonSha256: string;
  commands: string[][];
}
/** stdout is retained only in private process memory; all errors are fixed text. */
async function command(request: CleanupRequest, args: string[]) {
  if (encode(await executableIdentity(request.terraform.path)) !== encode(request.terraform))
    throw Error('Independent cleanup executable changed');
  const remaining = Date.parse(request.deadline) - Date.now();
  if (remaining <= 0) throw Error('Independent cleanup deadline exceeded');
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key, value]) => !key.startsWith('TF_') && value !== undefined),
  );
  Object.assign(env, {
    TF_CLI_CONFIG_FILE: join(request.directory, 'deployment.tfrc'),
    TF_DATA_DIR: join(request.directory, '.terraform'),
    TF_IN_AUTOMATION: '1',
    TF_INPUT: '0',
    TF_WORKSPACE: 'default',
  });
  return await new Promise<string>((accept, reject) => {
    const child = spawn(request.terraform.path, args, {
      cwd: request.directory,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = [];
    let bytes = 0,
      failed = false;
    const stop = () => {
      failed = true;
      child.kill('SIGTERM');
    };
    const timer = setTimeout(stop, remaining);
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 64 * 1024 * 1024) stop();
      if (!failed) chunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 64 * 1024 * 1024) stop();
    });
    child.on('error', () => {
      failed = true;
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (failed || code !== 0) reject(Error('Independent Terraform command failed'));
      else accept(Buffer.concat(chunks).toString('utf8'));
    });
  });
}
export async function verifyOriginalCleanup(request: CleanupRequest): Promise<IndependentCleanupEvidence> {
  const startedAt = new Date().toISOString(),
    end = Date.parse(request.deadline),
    began = Date.parse(request.startedAt);
  if (
    request.schemaVersion !== 1 ||
    !/^[a-f0-9]{64}$/.test(request.nonce) ||
    !Number.isFinite(end) ||
    !Number.isFinite(began) ||
    began > Date.now() ||
    Date.now() - began > 300000 ||
    end <= Date.now() ||
    end - began > 300000 ||
    request.parentPid !== process.ppid ||
    !isAbsolute(request.directory) ||
    resolve(request.directory) !== request.directory
  )
    throw Error('Independent cleanup request is stale, foreign or malformed');
  const stat = await lstat(request.directory);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    stat.mode & 0o077 ||
    (await realpath(request.directory)) !== request.directory
  )
    throw Error('Independent cleanup directory ownership differs');
  if (
    encode(await executableIdentity(process.execPath)) !== encode(request.interpreter) ||
    (await workerDigest()) !== request.workerSha256
  )
    throw Error('Independent cleanup worker identity differs');
  const before = await inputDigests(request.directory);
  if (encode(before) !== encode(request.inputs)) throw Error('Independent cleanup original inputs differ');
  const manifest = object(JSON.parse((await privateBytes(join(request.directory, 'deployment.json'))).toString()));
  const journal = object(JSON.parse((await privateBytes(join(request.directory, 'plan-receipt.json'))).toString())),
    receipt = object(journal.receipt),
    version = manifest.terraformVersion;
  if (
    typeof version !== 'string' ||
    receipt.schemaVersion !== 1 ||
    receipt.engine !== manifest.engine ||
    receipt.deploymentId !== manifest.deploymentId ||
    receipt.backendIdentity !== manifest.backendIdentity ||
    receipt.configurationSha256 !== manifest.configurationSha256 ||
    receipt.providerLockSha256 !== manifest.providerLockSha256 ||
    manifest.schemaVersion !== 1 ||
    manifest.engine !== 'terraform' ||
    hash(encode(manifest)) !== request.manifestSha256 ||
    manifest.backendIdentity !== `local:${manifest.deploymentId}${manifest.stage ? `:stage:${manifest.stage}` : ''}` ||
    manifest.configurationSha256 !== before['main.tf.json'] ||
    manifest.providerLockSha256 !== before['.terraform.lock.hcl'] ||
    journal.state !== 'planned' ||
    hash(encode(receipt)) !== request.planReceiptSha256 ||
    receipt.planSha256 !== request.finalPlanSha256 ||
    before['saved.tfplan'] !== request.finalPlanSha256 ||
    receipt.noChanges !== true ||
    !Array.isArray(receipt.changes) ||
    receipt.changes.length ||
    receipt.operation !== undefined ||
    receipt.actionInvocations !== undefined ||
    receipt.imports !== undefined ||
    receipt.relinquishments !== undefined
  )
    throw Error('Independent cleanup owner or ordinary final plan differs');
  const provenance = object(journal.execution);
  if (
    encode(provenance.terraform) !== encode(request.terraform) ||
    encode(provenance.planArgs) !==
      encode(['plan', '-input=false', '-lock=true', '-lock-timeout=60s', '-refresh=true', '-out=saved.tfplan'])
  )
    throw Error('Independent cleanup final plan executor or refresh provenance differs');
  const commands: string[][] = [];
  const run = async (args: string[]) => {
    commands.push(args);
    return command(request, args);
  };
  if (object(JSON.parse(await run(['version', '-json']))).terraform_version !== version)
    throw Error('Independent cleanup Terraform version differs');
  const original = await run(['show', '-json', 'saved.tfplan']);
  inspectEmptyPlan(JSON.parse(original), version);
  const state = await run(['show', '-json']);
  if (before['terraform.tfstate'] !== null) {
    const originalState = object(
      JSON.parse((await privateBytes(join(request.directory, 'terraform.tfstate'))).toString()),
    );
    if (
      originalState.version !== 4 ||
      originalState.terraform_version !== version ||
      !Number.isSafeInteger(originalState.serial) ||
      Number(originalState.serial) < 0 ||
      typeof originalState.lineage !== 'string' ||
      !originalState.lineage.length ||
      !Array.isArray(originalState.resources) ||
      originalState.resources.length ||
      Object.keys(object(originalState.outputs)).length
    )
      throw Error('Independent cleanup original state is incomplete or populated');
  }
  // Terraform omits values/version for an empty state. Original backend absence or
  // the complete raw local state above supplies the independent empty-state proof.
  inspectEmptyState(
    JSON.parse(state),
    version,
    before['terraform.tfstate'] === null || encode(JSON.parse(state)) === encode({ format_version: '1.0' }),
  );
  const filename = `independent-cleanup-${request.nonce}.tfplan`;
  await run(['plan', '-input=false', '-lock=true', '-lock-timeout=60s', '-refresh=true', `-out=${filename}`]);
  const refreshed = await run(['show', '-json', filename]);
  inspectEmptyPlan(JSON.parse(refreshed), version);
  if (encode(before) !== encode(await inputDigests(request.directory)))
    throw Error('Independent cleanup original inputs changed during execution');
  if (encode(await executableIdentity(request.terraform.path)) !== encode(request.terraform))
    throw Error('Independent cleanup executable changed');
  return {
    schemaVersion: 1,
    status: 'independently-verified',
    nonce: request.nonce,
    requestSha256: hash(encode(request)),
    startedAt,
    completedAt: new Date().toISOString(),
    executorPid: process.pid,
    parentPid: process.ppid,
    manifestSha256: request.manifestSha256,
    evidenceSha256: request.evidenceSha256,
    finalPlanSha256: request.finalPlanSha256,
    planReceiptSha256: request.planReceiptSha256,
    inputInventorySha256: hash(encode(before)),
    terraformExecutableSha256: request.terraform.sha256,
    terraformExecutablePathSha256: hash(request.terraform.path),
    interpreterSha256: request.interpreter.sha256,
    workerSha256: request.workerSha256,
    terraformVersion: version,
    stateJsonSha256: hash(state),
    originalPlanJsonSha256: hash(original),
    refreshedPlanSha256: hash(await privateBytes(join(request.directory, filename))),
    refreshedPlanJsonSha256: hash(refreshed),
    commands,
  };
}

export async function workerDigest() {
  return hash(
    Buffer.concat([
      await readFile(new URL('./cleanup-verifier-worker.ts', import.meta.url)),
      await readFile(new URL('./cleanup-verifier-entry.ts', import.meta.url)),
    ]),
  );
}
