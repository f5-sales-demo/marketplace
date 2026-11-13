import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import type { InstalledCaptureContext } from './installed-capture-context';
import { linuxMonotonicMs } from './linux-clock';
import { assertSameOriginalInput, monitorOriginalInputs, type OriginalInputBinding } from './original-input-monitor';
import {
  assertOriginalTerraformPlanProjection,
  assertOriginalTerraformPlanSourceProjection,
  type Invocation,
  type OriginalTerraformPlanProjection,
} from './runner';

export interface PreparedOriginalCreationScope {
  readonly schemaVersion: 1;
  readonly kind: 'prepared-original-creation-scope';
}
type Target = Readonly<{ type_name: string; name: string; namespace: string }>;
interface Lease {
  context: InstalledCaptureContext;
  projection: OriginalTerraformPlanProjection;
  resources: readonly Target[];
  provider?: OriginalInputBinding;
  scopeFile?: string;
  directory?: string;
  binding?: OriginalInputBinding;
  monitor?: Awaited<ReturnType<typeof monitorOriginalInputs>>;
  refused: boolean;
  closed: boolean;
  consumed: boolean;
  authorized: boolean;
}
const preparations = new WeakMap<object, Promise<PreparedOriginalCreationScope>>();
const leases = new WeakMap<object, Lease>();
const hash = (raw: Uint8Array) => createHash('sha256').update(raw).digest('hex');
const failure = () => new Error('Trusted original prepared creation scope required');
function lease(value: unknown): Lease {
  const current = value && typeof value === 'object' ? leases.get(value) : undefined;
  if (!current || current.refused || current.closed) throw failure();
  return current;
}
async function privateDirectory(path: string) {
  if (!isAbsolute(path) || resolve(path) !== path) throw failure();
  let current = '/';
  for (const part of path.split('/').filter(Boolean)) {
    current = join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw failure();
  }
  const st = await lstat(path, { bigint: true });
  if (
    !st.isDirectory() ||
    st.uid !== BigInt(process.getuid?.() ?? -1) ||
    (st.mode & 0o777n) !== 0o700n ||
    (await realpath(path)) !== path
  )
    throw failure();
  return st;
}
async function fileBinding(path: string): Promise<OriginalInputBinding> {
  const st = await lstat(path, { bigint: true }),
    parent = await privateDirectory(dirname(path));
  if (
    !st.isFile() ||
    st.isSymbolicLink() ||
    st.uid !== BigInt(process.getuid?.() ?? -1) ||
    st.nlink !== 1n ||
    (st.mode & 0o777n) !== 0o400n ||
    st.size < 1n ||
    st.size > 65536n ||
    (await realpath(path)) !== path
  )
    throw failure();
  const keys = ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'] as const;
  return Object.freeze({
    path,
    sha256: hash(await readFile(path)),
    expectedIdentity: Object.freeze(
      Object.fromEntries(keys.map((k) => [k, st[k].toString()])) as NonNullable<
        OriginalInputBinding['expectedIdentity']
      >,
    ),
    expectedParentIdentity: Object.freeze({
      dev: parent.dev.toString(),
      ino: parent.ino.toString(),
      uid: parent.uid.toString(),
      mode: parent.mode.toString(),
    }),
  });
}
function targets(projection: OriginalTerraformPlanProjection): readonly Target[] {
  const values: Target[] = [];
  const seen = new Set<string>();
  for (const row of projection.resources) {
    if (
      row.mode !== 'managed' ||
      !['xcsh_token', 'xcsh_securemesh_site_v2'].includes(row.type) ||
      !row.actions.includes('create')
    )
      continue;
    const name = row.fields.name,
      namespace = row.fields.namespace;
    if (
      name?.status !== 'known' ||
      namespace?.status !== 'known' ||
      typeof name.value !== 'string' ||
      typeof namespace.value !== 'string' ||
      !/^[a-z0-9.-]{1,253}$/.test(name.value) ||
      !/^[a-z0-9.-]{1,253}$/.test(namespace.value)
    )
      throw failure();
    const target = Object.freeze({ type_name: row.type, name: name.value, namespace: namespace.value });
    const key = JSON.stringify(target);
    if (seen.has(key)) throw failure();
    seen.add(key);
    values.push(target);
  }
  if (values.length > 128) throw failure();
  return Object.freeze(values.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
}
/** Only a live owning runner projection and its admitted package can prepare a scope.
 * Failures and partial files remain retained; a second actor cannot recreate a plan sink.
 */
export function prepareOriginalCreationScope(context: InstalledCaptureContext): Promise<PreparedOriginalCreationScope> {
  if (!context || typeof context !== 'object') return Promise.reject(failure());
  const pending = preparations.get(context);
  if (pending)
    return pending.then(async (packet) => {
      if (lease(packet).consumed) throw failure();
      await assertPreparedCreationScope(packet);
      if (lease(packet).consumed) throw failure();
      return packet;
    });
  const preparation = (async () => {
    await context.assertWithinDeadline();
    await context.assertInputs();
    if (!context.readOriginalPlanSource) throw failure();
    const projection = await context.readOriginalPlanSource();
    await assertOriginalTerraformPlanProjection(projection);
    if (
      projection.directory !== context.executionDirectory ||
      projection.scope.cloud !== 'gcp' ||
      projection.scope.account !== context.owner.account ||
      projection.scope.region !== context.owner.region ||
      projection.receipt.engine !== 'terraform' ||
      projection.receipt.deploymentId !== context.owner.deploymentId ||
      context.owner.provider !== 'gcp' ||
      context.owner.engine !== 'terraform' ||
      projection.executionAuthorized !== false ||
      !/^[a-f0-9]{64}$/.test(projection.receipt.planSha256) ||
      context.inputs['workspace:main.tf.json']?.sha256 !== projection.receipt.configurationSha256 ||
      context.inputs['workspace:.terraform.lock.hcl']?.sha256 !== projection.receipt.providerLockSha256
    )
      throw failure();
    const resources = targets(projection);
    const record: Lease = {
      context,
      projection,
      resources,
      refused: false,
      closed: false,
      consumed: false,
      authorized: false,
    };
    if (resources.length) {
      if (process.platform !== 'linux') throw failure();
      const providers = await context.readProviderInputs();
      const choices = Object.entries(providers).filter(([key]) =>
        /^registry\.terraform\.io\/f5-sales-demo\/xcsh:terraform-provider-xcsh_v[0-9]+\.[0-9]+\.[0-9]+$/.test(key),
      );
      if (choices.length !== 1) throw failure();
      const [key, provider] = choices[0];
      const name = key.split(':')[1],
        version = name.slice('terraform-provider-xcsh_v'.length);
      if (
        provider.path !==
          join(
            context.executionDirectory,
            '.terraform/providers/registry.terraform.io/f5-sales-demo/xcsh',
            version,
            'linux_amd64',
            name,
          ) ||
        !provider.expectedIdentity ||
        !provider.expectedParentIdentity ||
        !/^[a-f0-9]{64}$/.test(provider.sha256) ||
        (BigInt(provider.expectedIdentity.mode) & 0o111n) === 0n
      )
        throw failure();
      record.provider = provider;
      await privateDirectory(context.executionDirectory);
      const base = join(context.executionDirectory, '.xcsh-original-creation');
      try {
        await mkdir(base, { mode: 0o700 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
      await privateDirectory(base);
      const directory = join(base, projection.receipt.planSha256);
      await mkdir(directory, { mode: 0o700 });
      await privateDirectory(directory);
      const scopeFile = join(directory, 'scope.json');
      const raw = Buffer.from(
        JSON.stringify({
          schema_version: 1,
          scope_sha256: projection.receipt.planSha256,
          directory,
          provider_executable_sha256: provider.sha256,
          resources,
        }),
      );
      if (raw.length > 65536) throw failure();
      const file = await open(
        scopeFile,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o400,
      );
      try {
        await file.writeFile(raw);
        await file.sync();
      } finally {
        await file.close();
      }
      for (const path of [directory, base]) {
        const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
        try {
          await handle.sync();
        } finally {
          await handle.close();
        }
      }
      record.directory = directory;
      record.scopeFile = scopeFile;
      record.binding = await fileBinding(scopeFile);
      record.monitor = await monitorOriginalInputs({ scope: record.binding });
    }
    const packet = Object.freeze({ schemaVersion: 1 as const, kind: 'prepared-original-creation-scope' as const });
    leases.set(packet, record);
    try {
      await assertPreparedCreationScope(packet);
    } catch (error) {
      record.refused = true;
      record.monitor?.close();
      throw error;
    }
    return packet;
  })();
  preparations.set(context, preparation);
  return preparation;
}
/** Read-only final-capture corroboration; this cannot authorize execution or renew its budget. */
export async function assertPreparedCreationScopeInputs(packet: unknown): Promise<void> {
  const current = lease(packet);
  try {
    await current.context.assertInputs();
    await assertOriginalTerraformPlanProjection(current.projection);
    if (current.provider) {
      const providers = await current.context.readProviderInputs();
      const matches = Object.values(providers).filter((p) => p.path === current.provider?.path);
      if (matches.length !== 1) throw failure();
      assertSameOriginalInput(current.provider, matches[0]);
    }
    await current.monitor?.assertOriginal();
    if (current.scopeFile) {
      if (!current.binding) throw failure();
      assertSameOriginalInput(current.binding, await fileBinding(current.scopeFile));
      await current.monitor?.assertOriginal();
    }
    await current.context.assertInputs();
  } catch {
    current.refused = true;
    current.authorized = false;
    throw failure();
  }
}
export async function assertPreparedCreationScope(packet: unknown): Promise<void> {
  const current = lease(packet);
  current.authorized = false;
  await current.context.assertWithinDeadline();
  await assertPreparedCreationScopeInputs(packet);
  current.authorized = true;
}
/** Bind an internal capture consumer to this exact original source context. */
export function assertPreparedCreationScopeContext(packet: unknown, context: InstalledCaptureContext): void {
  if (lease(packet).context !== context) throw failure();
}
export async function inspectPreparedCreationScope(packet: unknown) {
  await assertPreparedCreationScopeInputs(packet);
  const current = lease(packet);
  return Object.freeze({
    resources: current.resources,
    scopeFile: current.scopeFile,
    directory: current.directory,
    scope: current.binding,
    provider: current.provider,
    planSha256: current.projection.receipt.planSha256,
  });
}
/** Consume only inside the exact compiler after async original-input checks. */
export function consumePreparedCreationScope(
  packet: unknown,
  request: Invocation,
  environment: Readonly<Record<string, string | undefined>>,
): string | undefined {
  const current = lease(packet),
    now = linuxMonotonicMs();
  if (
    !current.authorized ||
    current.consumed ||
    now < current.context.budget.start ||
    now >= current.context.budget.deadline ||
    request.cwd !== current.context.executionDirectory
  )
    throw failure();
  assertOriginalTerraformPlanSourceProjection(request.originalPlanSource, current.projection);
  for (const key of ['GOOGLE_APPLICATION_CREDENTIALS', 'XCSH_API_URL', 'XCSH_API_TOKEN'] as const)
    if (environment[key] !== current.context.environment[key]) throw failure();
  current.consumed = true;
  current.authorized = false;
  return current.scopeFile;
}
export function closePreparedCreationScope(packet: unknown): void {
  const current = packet && typeof packet === 'object' ? leases.get(packet) : undefined;
  if (!current || current.closed) return;
  current.closed = true;
  current.authorized = false;
  current.monitor?.close();
}
