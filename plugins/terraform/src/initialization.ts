import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { acquireProcessLock } from '../../platform/src/ce/process-lock';

export interface WorkspaceInitialization {
  root: string;
  deploymentId: string;
  manifest: Record<string, unknown>;
  configuration: string;
  providerLock: string;
  cliConfig: string;
}
interface Options {
  recoverOnly?: boolean;
  write?: (path: string, bytes: Buffer) => Promise<void>;
}
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
async function directory(path: string) {
  const stat = await lstat(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    stat.mode & 0o077 ||
    (await realpath(path)) !== path
  )
    throw Error('Initialization directory custody differs');
  return { dev: stat.dev, ino: stat.ino, uid: stat.uid };
}
async function exists(path: string) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return false;
  }
}
async function bytes(path: string) {
  const before = await lstat(path);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.uid !== process.getuid?.() ||
    before.mode & 0o077
  )
    throw Error('Initialization input custody differs');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      opened.size !== before.size ||
      opened.uid !== before.uid ||
      opened.mode !== before.mode ||
      opened.nlink !== 1
    )
      throw Error('Initialization input changed before observation');
    const value = await handle.readFile();
    const after = await handle.stat();
    const pathAfter = await lstat(path);
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs ||
      after.nlink !== 1 ||
      after.mode !== before.mode ||
      after.uid !== before.uid ||
      pathAfter.dev !== after.dev ||
      pathAfter.ino !== after.ino ||
      pathAfter.isSymbolicLink()
    )
      throw Error('Initialization input changed during observation');
    return { value, stat: after };
  } finally {
    await handle.close();
  }
}
/** Creator-owned initialization only. A missing intent never authorizes rebuilding an old workspace. */
export async function initializeWorkspace(input: WorkspaceInitialization, options: Options = {}): Promise<void> {
  if (
    !isAbsolute(input.root) ||
    resolve(input.root) !== input.root ||
    !/^[a-z][a-z0-9-]{0,62}$/.test(input.deploymentId) ||
    input.manifest.schemaVersion !== 1 ||
    input.manifest.engine !== 'terraform' ||
    input.manifest.deploymentId !== input.deploymentId ||
    typeof input.configuration !== 'string' ||
    typeof input.providerLock !== 'string' ||
    !input.providerLock.trim() ||
    typeof input.cliConfig !== 'string'
  )
    throw Error('Initialization ownership or inputs differ');
  const scope = input.manifest.scope as Record<string, unknown> | undefined;
  if (
    !scope ||
    !['aws', 'azure'].includes(String(scope.cloud)) ||
    typeof scope.account !== 'string' ||
    !scope.account ||
    typeof scope.region !== 'string' ||
    !scope.region
  )
    throw Error('Initialization cloud scope differs');
  const custody = await directory(input.root);
  const target = join(input.root, input.deploymentId);
  const intent = join(input.root, `.initialization-${input.deploymentId}.json`);
  const inputs = new Map([
    ['main.tf.json', Buffer.from(input.configuration)],
    ['.terraform.lock.hcl', Buffer.from(input.providerLock)],
    ['deployment.tfrc', Buffer.from(input.cliConfig)],
    ['deployment.json', Buffer.from(JSON.stringify(input.manifest))],
  ]);
  const record = Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      root: input.root,
      custody,
      deploymentId: input.deploymentId,
      manifest: input.manifest,
      inputs: Object.fromEntries([...inputs].map(([name, data]) => [name, hash(data)])),
    }),
  );
  const write = options.write ?? ((path: string, data: Buffer) => writeFile(path, data, { mode: 0o600, flag: 'wx' }));
  const release = await acquireProcessLock(join(input.root, `.initialization-${input.deploymentId}-lock`));
  try {
    if (await exists(intent)) {
      const original = await bytes(intent);
      if (!original.value.equals(record)) throw Error('Original initialization intent differs');
    } else {
      if (options.recoverOnly) throw Error('Original initialization intent is unavailable');
      if (await exists(target))
        throw Object.assign(Error('Existing workspace requires qualified resume'), { code: 'EEXIST' });
      await write(intent, record);
    }
    if (JSON.stringify(await directory(input.root)) !== JSON.stringify(custody))
      throw Error('Initialization parent changed');
    if (!(await exists(target))) await mkdir(target, { mode: 0o700 });
    const targetCustody = await directory(target);
    const names = await readdir(target);
    if (names.some((name) => !inputs.has(name))) throw Error('Unqualified initialization artifact blocks recovery');
    // Validate the entire existing prefix before writing any missing suffix.
    for (const [name, data] of inputs) {
      const path = join(target, name);
      if (await exists(path)) {
        const observed = await bytes(path);
        if (observed.value.length > data.length || !data.subarray(0, observed.value.length).equals(observed.value))
          throw Error('Original initialization bytes conflict');
      }
    }
    for (const [name, data] of inputs) {
      const path = join(target, name);
      if (!(await exists(path))) await write(path, data);
      else {
        const observed = await bytes(path);
        if (observed.value.length > data.length || !data.subarray(0, observed.value.length).equals(observed.value))
          throw Error('Original initialization bytes conflict');
        if (observed.value.length !== data.length) {
          const handle = await open(path, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW);
          try {
            const stat = await handle.stat();
            if (
              stat.dev !== observed.stat.dev ||
              stat.ino !== observed.stat.ino ||
              stat.uid !== process.getuid?.() ||
              stat.nlink !== 1 ||
              stat.size !== observed.value.length ||
              stat.mode & 0o077
            )
              throw Error('Original initialization append custody differs');
            await handle.writeFile(data.subarray(observed.value.length));
          } finally {
            await handle.close();
          }
        }
      }
      if (!(await bytes(path)).value.equals(data)) throw Error('Original initialization input is incomplete');
      if (JSON.stringify(await directory(target)) !== JSON.stringify(targetCustody))
        throw Error('Initialization workspace changed');
    }
    if (!(await bytes(intent)).value.equals(record)) throw Error('Initialization intent changed before completion');
    await unlink(intent);
  } finally {
    await release();
  }
}

/** Read original creator intent only; this never repairs files or supplies a missing historical intent. */
export async function readInitializationManifest(
  root: string,
  deploymentId: string,
  owner: { deploymentId: string; engine: string; provider: string; account: string; region: string },
): Promise<Record<string, unknown>> {
  if (
    !isAbsolute(root) ||
    resolve(root) !== root ||
    !/^[a-z][a-z0-9-]{0,62}$/.test(deploymentId) ||
    owner.engine !== 'terraform' ||
    owner.deploymentId !== deploymentId
  )
    throw Error('Initialization read owner differs');
  const custody = await directory(root);
  const raw = await bytes(join(root, `.initialization-${deploymentId}.json`));
  if (raw.value.length > 65536) throw Error('Initialization intent size is invalid');
  const record = JSON.parse(raw.value.toString()) as Record<string, unknown>;
  const manifest = record.manifest as Record<string, unknown> | undefined;
  const scope = manifest?.scope as Record<string, unknown> | undefined;
  const inputs = record.inputs as Record<string, unknown> | undefined;
  if (
    Object.keys(record).sort().join(',') !== 'custody,deploymentId,inputs,manifest,root,schemaVersion' ||
    record.schemaVersion !== 1 ||
    record.root !== root ||
    record.deploymentId !== deploymentId ||
    JSON.stringify(record.custody) !== JSON.stringify(custody) ||
    !manifest ||
    !scope ||
    !inputs ||
    manifest.schemaVersion !== 1 ||
    manifest.engine !== owner.engine ||
    manifest.deploymentId !== deploymentId ||
    scope.cloud !== owner.provider ||
    scope.account !== owner.account ||
    scope.region !== owner.region ||
    Object.keys(inputs).sort().join(',') !== '.terraform.lock.hcl,deployment.json,deployment.tfrc,main.tf.json' ||
    Object.values(inputs).some((value) => typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) ||
    inputs['deployment.json'] !== hash(Buffer.from(JSON.stringify(manifest))) ||
    inputs['main.tf.json'] !== manifest.configurationSha256 ||
    inputs['.terraform.lock.hcl'] !== manifest.providerLockSha256
  )
    throw Error('Original initialization manifest is unqualified');
  if (await exists(join(root, deploymentId))) {
    await directory(join(root, deploymentId));
    const names = await readdir(join(root, deploymentId));
    if (names.some((name) => !Object.hasOwn(inputs, name)))
      throw Error('Unqualified initialization artifacts block manifest observation');
    for (const name of names) await bytes(join(root, deploymentId, name));
  }
  if (JSON.stringify(await directory(root)) !== JSON.stringify(custody))
    throw Error('Initialization read parent changed');
  return structuredClone(manifest);
}
