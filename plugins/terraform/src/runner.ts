import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

export interface Invocation {
  cwd: string;
  args: string[];
  env: Record<string, string | undefined>;
  signal?: AbortSignal;
}
type Executor = (request: Invocation) => Promise<{ code: number; stdout: string }>;
interface Deployment {
  schemaVersion: 1;
  deploymentId: string;
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
}
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
function changeActions(value: unknown, output = false): string[] {
  const allowed = output
    ? ['no-op', 'create', 'update', 'delete']
    : ['no-op', 'read', 'create', 'update', 'delete', 'delete,create', 'create,delete'];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || item.includes(',')) ||
    !allowed.includes(value.join(','))
  )
    throw new Error('Terraform change actions are malformed or unsupported');
  return value as string[];
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
  limits = { timeoutMs: 900_000, maxOutputBytes: 64 * 1024 * 1024, killAfterMs: 5_000 },
): Executor {
  return async ({ cwd, args, env, signal }) => {
    signal?.throwIfAborted();
    const child = Bun.spawn(['/bin/sh', '-c', 'umask 077; exec "$@"', 'ce-terraform', 'terraform', ...args], {
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
    const timer = setTimeout(() => stop('Terraform operation deadline exceeded'), limits.timeoutMs);
    const collect = async (stream: ReadableStream<Uint8Array>, retain: boolean) => {
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > limits.maxOutputBytes) stop('Terraform response exceeded size limit');
          if (retain && !failure) chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      return retain && !failure ? Buffer.concat(chunks).toString('utf8') : '';
    };
    try {
      const [stdout, , code] = await Promise.all([
        collect(child.stdout, true),
        collect(child.stderr, false),
        child.exited,
      ]);
      if (failure) throw new Error(failure);
      return { code, stdout };
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
export const executeTerraform = terraformExecutor();

/** Internal lifecycle adapter. Cloud translators must validate scope before invoking it. */
export class TerraformRunner {
  #directory?: string;
  #manifest?: Manifest;
  #busy = false;
  constructor(
    readonly root: string,
    readonly execute: Executor = executeTerraform,
  ) {
    if (!isAbsolute(root) || resolve(root) !== root) throw new Error('Terraform storage must be an absolute path');
  }
  async prepare(deployment: Deployment): Promise<void> {
    if (deployment.schemaVersion !== 1 || deployment.engine !== 'terraform' || !safeId.test(deployment.deploymentId))
      throw new Error('Terraform deployment identity or owning engine is unsupported');
    if (!/^\d+\.\d+\.\d+$/.test(deployment.terraformVersion) || !deployment.providerLock.trim())
      throw new Error('Exact Terraform version and provider lock are required');
    // Remote backend admission needs the cloud adapter's lock and identity validation.
    const configuration = decode(deployment.configuration);
    if (
      object(configuration.terraform ?? {}).backend ||
      object(configuration.terraform ?? {}).cloud ||
      deployment.backendIdentity !== `local:${deployment.deploymentId}`
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
  async resume(deploymentId: string): Promise<void> {
    if (!safeId.test(deploymentId)) throw new Error('Invalid Terraform deployment identity');
    const directory = join(this.root, deploymentId);
    await privateDirectory(directory);
    const manifest = decode((await privateRead(join(directory, 'deployment.json'))).toString()) as unknown as Manifest;
    if (manifest.schemaVersion !== 1 || manifest.engine !== 'terraform' || manifest.deploymentId !== deploymentId)
      throw new Error('Terraform deployment ownership is invalid');
    this.#directory = directory;
    this.#manifest = manifest;
    await this.#verifyInputs();
  }
  #state(): { directory: string; manifest: Manifest } {
    if (!this.#directory || !this.#manifest) throw new Error('Prepare or resume the deployment first');
    return { directory: this.#directory, manifest: this.#manifest };
  }
  async #verifyInputs(): Promise<void> {
    if (!this.#manifest || !this.#directory) throw new Error('Prepare or resume the deployment first');
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
    const result = await this.execute({ cwd: this.#state().directory, args, env: this.#environment(env), signal });
    if (result.code !== 0) throw new Error(`Terraform ${args[0]} failed; exit code ${result.code}`);
    return result.stdout;
  }
  async #exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.#busy) throw new Error('Terraform deployment operation is already running');
    if (!this.#directory) throw new Error('Prepare or resume the deployment first');
    this.#busy = true;
    const lock = join(this.#directory, '.runner-lock');
    let acquired = false;
    try {
      await mkdir(lock, { mode: 0o700 });
      acquired = true;
      return await operation();
    } finally {
      if (acquired) await rm(lock, { recursive: true });
      this.#busy = false;
    }
  }
  async plan(env: Record<string, string | undefined>, signal?: AbortSignal): Promise<PlanReceipt> {
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const version = decode(await this.#run(['version', '-json'], env, signal));
      if (version.terraform_version !== this.#state().manifest.terraformVersion)
        throw new Error('Terraform version changed');
      await this.#run(['init', '-input=false', '-lockfile=readonly'], env, signal);
      await this.#verifyInputs();
      await this.#run(['validate', '-json'], env, signal);
      await this.#run(
        ['plan', '-input=false', '-lock=true', '-lock-timeout=60s', '-refresh=true', '-out=saved.tfplan'],
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
        typeof plan.applyable !== 'boolean' || // codespell:ignore applyable
        !Array.isArray(plan.resource_changes ?? [])
      )
        throw new Error('Terraform plan JSON is malformed or unsupported');
      const changes: PlanReceipt['changes'] = [];
      for (const value of (plan.resource_changes ?? []) as unknown[]) {
        const resource = object(value);
        const actions = changeActions(object(resource.change).actions);
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
      const noChanges =
        changes.every((change) => change.actions[0] === 'no-op') && outputs.every((actions) => actions[0] === 'no-op');
      if (!noChanges && !plan.applyable) throw new Error('Terraform plan has changes but cannot be applied'); // codespell:ignore applyable
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
      };
      await persist(join(this.#state().directory, 'plan-receipt.json'), { state: 'planned', receipt });
      return receipt;
    });
  }
  async apply(receipt: PlanReceipt, env: Record<string, string | undefined>, signal?: AbortSignal): Promise<void> {
    return this.#exclusive(async () => {
      await this.#verifyInputs();
      const journal = decode((await privateRead(join(this.#state().directory, 'plan-receipt.json'))).toString());
      if (journal.state !== 'planned') throw new Error('Saved plan is consumed or requires reconciliation');
      if (
        canonical(receipt) !== canonical(journal.receipt) ||
        receipt.engine !== 'terraform' ||
        receipt.deploymentId !== this.#state().manifest.deploymentId ||
        receipt.planSha256 !== digest(await privateRead(join(this.#state().directory, 'saved.tfplan')))
      )
        throw new Error('Terraform saved-plan receipt does not match');
      const version = decode(await this.#run(['version', '-json'], env, signal));
      if (version.terraform_version !== this.#state().manifest.terraformVersion)
        throw new Error('Terraform version changed');
      await persist(join(this.#state().directory, 'plan-receipt.json'), { state: 'applying', receipt });
      await this.#run(['apply', '-input=false', '-lock=true', '-lock-timeout=60s', 'saved.tfplan'], env, signal);
      await persist(join(this.#state().directory, 'plan-receipt.json'), { state: 'applied', receipt });
    });
  }
}
