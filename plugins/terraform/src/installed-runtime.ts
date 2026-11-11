import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fingerprint } from '../../gcloud/src/ce/discovery';
import { assertExecutorGroupClosed } from '../../platform/src/ce/process-lock';
import captureSources from './gcp-capture-source-pins.json';
import { authenticateGoogleAdc } from './google-adc-authentication';
import type { GoogleAdcLease } from './google-adc-session';
import { createInstalledApplyController, type OriginalApplyCallbackContext } from './installed-apply-controller';
import {
  createInstalledCaptureContext,
  freezeAdmittedCaptureInputs,
  type InstalledCaptureContext,
} from './installed-capture-context';
import {
  finalizeInstalledCapture,
  type InstalledCaptureInvocation,
  InstalledCaptureInvocations,
} from './installed-final-capture';
import { createInstalledGcpInvocationCompiler, selectInstalledGcpEnvironment } from './installed-gcp-invocation';
import pins from './installed-runtime-pins.json';
import { resolveInstalledGcpVersionProfile } from './installed-version-profile';
import { linuxMonotonicMs } from './linux-clock';
import {
  assertSameOriginalInput,
  monitorOriginalInputs,
  type OriginalInputBinding,
  type OriginalInputIdentity,
} from './original-input-monitor';
import { verifyProviderPackage } from './provider-package';
import type { FinalReaderReserve } from './reader-final-reserve';
import type { Executor } from './runner';
import type { CeTerraformRuntimeOptions, CeTerraformRuntimeRequest, GoogleAdcPolicy } from './service';
import {
  type ExecutionCaptureAdmission,
  type FinalExecutionCapture,
  signalFreeTerraformExecutor,
} from './signal-free-executor';

const hash = (raw: string | Uint8Array) => createHash('sha256').update(raw).digest('hex');
const installer = join(import.meta.dir, '../scripts/install_runtime.py');
const modeName = 'google-runtime-mode.json';
const retainedInspectionMonitors = new Map<string, Awaited<ReturnType<typeof monitorOriginalInputs>>>();
export class InstalledTerraformSetupRequired extends Error {
  constructor() {
    super('Install and set up the Terraform plugin observer runtime before selecting GCP Terraform');
  }
}
export interface InstalledGcpCapture {
  prepare?(context: InstalledCaptureContext): Promise<void>;
  start(admission: ExecutionCaptureAdmission, callback?: OriginalApplyCallbackContext): Promise<void>;
  assertOriginal(): Promise<void>;
  finalCapture(
    capture: FinalExecutionCapture,
    reserve?: FinalReaderReserve,
    callback?: OriginalApplyCallbackContext,
  ): Promise<void>;
  closeAfterExecutorExit(): Promise<void>;
}
export class InstalledCaptureSourcesUnavailable extends Error {
  constructor() {
    super('Verified Terraform plugin capture sources are missing or changed; reinstall the plugin');
  }
}
/** Admit shipped script bytes against the hashes compiled into the installed runtime. */
export async function inspectInstalledCaptureScripts(directory = join(import.meta.dir, '../scripts')) {
  try {
    const parent = await lstat(directory);
    if (
      !isAbsolute(directory) ||
      resolve(directory) !== directory ||
      (await realpath(directory)) !== directory ||
      !parent.isDirectory() ||
      parent.isSymbolicLink() ||
      parent.uid !== process.getuid?.() ||
      (parent.mode & 0o022) !== 0 ||
      captureSources.schemaVersion !== 1 ||
      captureSources.kind !== 'gcp-original-capture-sources'
    )
      throw new InstalledCaptureSourcesUnavailable();
    const inputs: Record<string, OriginalInputBinding> = {};
    for (const [name, expected] of Object.entries(captureSources.files)) {
      const actual = await owned(join(directory, name));
      if (actual.binding.sha256 !== expected) throw new InstalledCaptureSourcesUnavailable();
      inputs[`script:${name}`] = actual.binding;
    }
    return freezeAdmittedCaptureInputs(inputs);
  } catch (error) {
    if (error instanceof InstalledCaptureSourcesUnavailable) throw error;
    throw new InstalledCaptureSourcesUnavailable();
  }
}
export interface InstalledRuntimeFactoryOptions {
  /** Compiled server implementation only; never accepted as a tool argument or receipt flag. */
  capture?: (request: CeTerraformRuntimeRequest, context: InstalledCaptureContext) => InstalledGcpCapture;
}
async function owned(path: string, maximum = 256 * 1024 * 1024) {
  if (!isAbsolute(path) || resolve(path) !== path || (await realpath(path)) !== path)
    throw new Error('Canonical owned runtime input required');
  const before = await lstat(path, { bigint: true });
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.uid !== BigInt(process.getuid?.() ?? -1) ||
    before.nlink !== 1n ||
    (before.mode & 0o022n) !== 0n ||
    before.size < 1n ||
    before.size > BigInt(maximum)
  )
    throw new Error('Owned original runtime input required');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat({ bigint: true });
    const keys = ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'] as const;
    if (keys.some((key) => opened[key] !== before[key])) throw new Error('Original runtime input changed during open');
    const bytes = await handle.readFile();
    const after = await lstat(path, { bigint: true });
    if (keys.some((key) => after[key] !== before[key])) throw new Error('Original runtime input changed during read');
    const parent = await lstat(dirname(path), { bigint: true });
    return {
      bytes,
      binding: {
        path,
        sha256: hash(bytes),
        expectedIdentity: Object.fromEntries(keys.map((key) => [key, before[key].toString()])) as OriginalInputIdentity,
        expectedParentIdentity: {
          dev: parent.dev.toString(),
          ino: parent.ino.toString(),
          uid: parent.uid.toString(),
          mode: parent.mode.toString(),
        },
      } satisfies OriginalInputBinding,
    };
  } finally {
    await handle.close();
  }
}

export { owned as readOwnedInstalledInput };

async function privateDirectory(path: string) {
  if (!isAbsolute(path) || resolve(path) !== path) throw new Error('Canonical private runtime directory required');
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 0o777) !== 0o700 ||
    (await realpath(path)) !== path
  )
    throw new Error('Original private runtime directory required');
}
function runtimeRoot(env: Record<string, string | undefined>) {
  return env.XCSH_TERRAFORM_RUNTIME_DIR ?? join(homedir(), '.local/share/xcsh/terraform/runtime/python315-psutil722');
}
/** Reverify actual installed bytes before executing the interpreter or trusting its inspection output. */
export async function assertInstalledRuntime(env: Record<string, string | undefined> = process.env) {
  const root = runtimeRoot(env);
  try {
    if (process.platform !== 'linux' || process.arch !== 'x64') throw new InstalledTerraformSetupRequired();
    const rootInfo = await lstat(root);
    if (
      !rootInfo.isDirectory() ||
      rootInfo.isSymbolicLink() ||
      rootInfo.uid !== process.getuid?.() ||
      (rootInfo.mode & 0o777) !== 0o700 ||
      (await realpath(root)) !== root
    )
      throw new InstalledTerraformSetupRequired();
    const python = join(root, 'environment/bin/python3');
    const site = join(root, 'environment/lib/python3.15/site-packages');
    const bindings: Record<string, OriginalInputBinding> = {};
    for (const [role, path, expected] of [
      ['python', python, pins.pythonSha256],
      ['archive', join(root, 'archive.whl'), pins.wheelSha256],
      ['installer', installer, pins.installerSha256],
    ]) {
      const actual = await owned(path);
      if (actual.binding.sha256 !== expected) throw new InstalledTerraformSetupRequired();
      bindings[role] = actual.binding;
    }
    const config = await owned(join(root, 'environment/pyvenv.cfg'), 8192);
    const pairs = config.bytes
      .toString()
      .trim()
      .split('\n')
      .map((line) => line.split(' = ', 2));
    if (pairs.some((pair) => pair.length !== 2)) throw new InstalledTerraformSetupRequired();
    const cfg = Object.fromEntries(pairs);
    if (
      cfg['include-system-site-packages'] !== 'false' ||
      cfg.version !== '3.15.0' ||
      cfg.home !== dirname(cfg.executable)
    )
      throw new InstalledTerraformSetupRequired();
    const base = await owned(cfg.executable);
    if (base.binding.sha256 !== pins.pythonSha256) throw new InstalledTerraformSetupRequired();
    bindings.config = config.binding;
    bindings.base = base.binding;
    const names: string[] = [];
    const walk = async (directory: string) => {
      for (const name of await readdir(directory)) {
        const path = join(directory, name),
          stat = await lstat(path);
        if (stat.isSymbolicLink() || stat.uid !== process.getuid?.()) throw new InstalledTerraformSetupRequired();
        if (stat.isDirectory()) await walk(path);
        else names.push(path.slice(site.length + 1));
      }
    };
    await walk(site);
    if (JSON.stringify(names.sort()) !== JSON.stringify(Object.keys(pins.sdkFilesSha256).sort()))
      throw new InstalledTerraformSetupRequired();
    for (const [name, expected] of Object.entries(pins.sdkFilesSha256)) {
      const actual = await owned(join(site, name));
      if (actual.binding.sha256 !== expected) throw new InstalledTerraformSetupRequired();
      bindings[`sdk:${name}`] = actual.binding;
    }
    bindings.review = (await owned(join(root, 'review.json'), 65536)).binding;
    Object.assign(bindings, await inspectInstalledCaptureScripts());
    const monitor = await monitorOriginalInputs(bindings);
    let inspectionDirectory: string | undefined;
    let inspectionClosed = false;
    try {
      const inspection = join(
        env.XDG_STATE_HOME ?? join(homedir(), '.local/state'),
        'xcsh/terraform/runtime-inspections',
        randomUUID(),
      );
      await privateDirectory(inspection);
      inspectionDirectory = inspection;
      const start = linuxMonotonicMs();
      const execute = signalFreeTerraformExecutor({
        python: { path: python, sha256: pins.pythonSha256 },
        executable: { path: python, sha256: pins.pythonSha256 },
        originalStartMs: start,
        originalDeadlineMs: start + 7200000,
        timeoutMs: 60000,
        assertOriginal: monitor.assertOriginal,
        finalCapture: async (capture) => {
          await writeFile(join(inspection, 'inspection-capture.private.json'), JSON.stringify(capture), {
            flag: 'wx',
            mode: 0o400,
          });
          if (!capture.originalGroupClosed || capture.actualExitCode === null)
            throw new Error('Runtime inspection closure unresolved');
          await monitor.assertOriginal();
          inspectionClosed = true;
        },
      });
      const result = await execute({
        cwd: inspection,
        args: ['-I', '-B', installer, '--runtime-dir', root, '--check', '--binding'],
        env: { PATH: '/usr/bin:/bin' },
      });
      if (result.code !== 0) throw new InstalledTerraformSetupRequired();
      const reported = JSON.parse(result.stdout);
      if (
        reported.pythonPath !== python ||
        reported.pythonSha256 !== pins.pythonSha256 ||
        reported.sdkRoot !== site ||
        reported.sdkVersion !== '7.2.2' ||
        reported.wheelSha256 !== pins.wheelSha256
      )
        throw new InstalledTerraformSetupRequired();
      await monitor.assertOriginal();
      return Object.freeze({ root, python, bindings: Object.freeze(bindings) });
    } finally {
      if (!inspectionDirectory || inspectionClosed) monitor.close();
      else retainedInspectionMonitors.set(inspectionDirectory, monitor);
    }
  } catch (error) {
    if (error instanceof InstalledTerraformSetupRequired) throw error;
    throw new InstalledTerraformSetupRequired();
  }
}
export function selectedGoogleAccountSha256(environment: Record<string, string | undefined> = process.env) {
  const command = Bun.spawnSync(['gcloud', 'config', 'get-value', 'account', '--quiet'], {
    env: { ...environment },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const account = command.stdout.toString().trim();
  if (command.exitCode !== 0 || !account || account === '(unset)')
    throw new Error('Selected Google account unavailable');
  return hash(account);
}
/** Concrete installed server resolver. Mutations remain gated on the actual capture implementation. */
export function createInstalledRuntimeResolver(
  environment: Record<string, string | undefined> = process.env,
  options: InstalledRuntimeFactoryOptions = {},
) {
  const env = { ...environment },
    captureFactory = options.capture;
  return async (request: CeTerraformRuntimeRequest): Promise<CeTerraformRuntimeOptions> => {
    const { owner, deployment, directory, platform, resume } = request;
    if (owner.provider !== 'gcp') return {};
    if (!/^[a-z][a-z0-9-]{0,62}$/.test(deployment.deploymentId))
      throw new Error('Original Terraform deployment identity required');
    const executionDirectory = join(directory, deployment.deploymentId);
    const store = await platform.storage(owner);
    let mode: unknown;
    try {
      mode = JSON.parse((await owned(join(directory, modeName), 65536)).bytes.toString());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const existingDeployment = await Bun.file(join(executionDirectory, 'deployment.json')).exists();
    if (!resume && existingDeployment) throw new Error('Existing deployment must resume its original runtime');
    if (resume && !mode && existingDeployment) return {};
    const runtime = await assertInstalledRuntime(env);
    const versionProfile = resolveInstalledGcpVersionProfile({
      terraformVersion: deployment.terraformVersion,
      providerLockSha256: hash(deployment.providerLock),
    });
    const terraform = Bun.which('terraform', { PATH: env.PATH ?? process.env.PATH });
    if (!terraform) throw new InstalledTerraformSetupRequired();
    const terraformPath = await realpath(terraform),
      terraformFile = await owned(terraformPath);
    if (terraformFile.binding.sha256 !== versionProfile.terraformSha256)
      throw new Error('Qualified installed Terraform executable required');
    const accountSha256 = selectedGoogleAccountSha256(env);
    const sourcePath =
      env.GOOGLE_APPLICATION_CREDENTIALS ??
      join(env.CLOUDSDK_CONFIG ?? join(homedir(), '.config/gcloud'), 'application_default_credentials.json');
    const source = await owned(sourcePath, 65536);
    const credential = JSON.parse(source.bytes.toString());
    if (credential.type !== 'authorized_user' || typeof credential.client_id !== 'string')
      throw new Error('Qualified authorized-user ADC mapping required');
    const audienceSha256 = hash(credential.client_id);
    const expectedMode = {
      schemaVersion: 1,
      kind: 'installed-google-adc-runtime',
      owner,
      providerLockSha256: hash(deployment.providerLock),
      qualificationSha256: pins.refreshQualificationSha256,
    };
    if (mode && fingerprint(mode) !== fingerprint(expectedMode))
      throw new Error('Original installed runtime mode changed');
    await privateDirectory(directory);
    if (!mode) await writeFile(join(directory, modeName), JSON.stringify(expectedMode), { flag: 'wx', mode: 0o400 });
    let monitor: Awaited<ReturnType<typeof monitorOriginalInputs>> | undefined;
    let providers: Awaited<ReturnType<typeof monitorOriginalInputs>> | undefined;
    let providerInputs: Readonly<Record<string, OriginalInputBinding>> | undefined;
    let executor: Executor | undefined;
    let compileInvocation: ReturnType<typeof createInstalledGcpInvocationCompiler> | undefined;
    let capture: InstalledGcpCapture | undefined;
    let prepareCapture: (() => Promise<void>) | undefined;
    let active = 0;
    const groups: string[] = [];
    let originalEnvironment: { XCSH_API_URL: string; XCSH_API_TOKEN: string } | undefined;
    const close = async () => {
      if (active) throw new Error('Original installed executor remains in flight');
      for (const group of groups) await assertExecutorGroupClosed(group);
      if (await Bun.file(join(executionDirectory, '.terraform-executor-lock/capture-unresolved.json')).exists())
        throw new Error('Original installed capture remains unresolved');
      await capture?.closeAfterExecutorExit();
      providers?.close();
      monitor?.close();
    };
    const googleAdc: GoogleAdcPolicy = {
      closeFailedAcquisition: close,
      accountSha256,
      audienceSha256,
      qualificationSha256: pins.refreshQualificationSha256,
      acquire: async () => {
        await store.verify();
        const currentSource = await owned(sourcePath, 65536);
        assertSameOriginalInput(source.binding, currentSource.binding);
        const snapshotPath = join(directory, `google-adc-${randomUUID()}.private.json`);
        await writeFile(snapshotPath, currentSource.bytes, { flag: 'wx', mode: 0o400 });
        const saved = (await store.read('gcp-terraform-input-identity.json')) as {
          intent: { project: string; region: string; deploymentName: string; engine: string; platformContext: string };
          intentFingerprint: string;
          platformContext: string;
        };
        if (
          !saved.intent ||
          saved.intent.project !== owner.account ||
          saved.intent.region !== owner.region ||
          saved.intent.deploymentName !== owner.deploymentId ||
          saved.intent.engine !== owner.engine ||
          saved.intentFingerprint !== fingerprint(saved.intent) ||
          saved.intent.platformContext !== saved.platformContext ||
          !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/.test(saved.platformContext)
        )
          throw new Error('Original GCP platform context and ownership differ');
        const configPath = join(
          env.XDG_CONFIG_HOME ?? join(homedir(), '.config'),
          'xcsh/contexts',
          `${saved.platformContext}.json`,
        );
        const context = JSON.parse((await owned(configPath, 65536)).bytes.toString());
        const url = new URL(context.apiUrl);
        if (
          url.protocol !== 'https:' ||
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          typeof context.apiToken !== 'string' ||
          !context.apiToken
        )
          throw new Error('Original selected Platform credential unavailable');
        originalEnvironment = { XCSH_API_URL: url.origin, XCSH_API_TOKEN: context.apiToken };
        const environmentPath = join(directory, `platform-environment-${randomUUID()}.private.json`);
        await writeFile(environmentPath, JSON.stringify(originalEnvironment), { flag: 'wx', mode: 0o400 });
        const bindings: Record<string, OriginalInputBinding> = {
          ...runtime.bindings,
          terraform: terraformFile.binding,
        };
        for (const name of [
          'main.tf.json',
          '.terraform.lock.hcl',
          'deployment.json',
          'deployment.tfrc',
          modeName,
          'gcp-terraform-input-identity.json',
        ]) {
          const path =
            name === 'gcp-terraform-input-identity.json'
              ? join(store.directory, name)
              : name === modeName
                ? join(directory, name)
                : join(executionDirectory, name);
          bindings[`workspace:${name}`] = (await owned(path)).binding;
        }
        const invocationEnvironment = selectInstalledGcpEnvironment({
          ...env,
          HOME: env.HOME ?? homedir(),
          PATH: env.PATH ?? process.env.PATH,
          GOOGLE_APPLICATION_CREDENTIALS: snapshotPath,
          ...originalEnvironment,
        });
        const invocationEnvironmentPath = join(directory, `runtime-environment-${randomUUID()}.private.json`);
        await writeFile(invocationEnvironmentPath, JSON.stringify(invocationEnvironment), { flag: 'wx', mode: 0o400 });
        bindings.runtimeEnvironment = (await owned(invocationEnvironmentPath)).binding;
        compileInvocation = createInstalledGcpInvocationCompiler({
          directory: executionDirectory,
          environment: invocationEnvironment,
        });
        bindings.adc = (await owned(snapshotPath)).binding;
        bindings.platform = (await owned(environmentPath)).binding;
        monitor = await monitorOriginalInputs(bindings);
        const start = linuxMonotonicMs(),
          deadline = start + 7200000;
        const assertInputs = async () => {
          await store.verify();
          await monitor?.assertOriginal();
          await providers?.assertOriginal();
        };
        const assertWithinDeadline = async () => {
          if (linuxMonotonicMs() >= deadline) throw new Error('Original installed operation deadline exhausted');
          await assertInputs();
        };
        const assertOriginal = async () => {
          await assertWithinDeadline();
          await capture?.assertOriginal();
        };
        try {
          const authenticated = await authenticateGoogleAdc({
            credentialBytes: currentSource.bytes,
            project: owner.account,
            accountSha256,
            audienceSha256,
            assertOriginal,
          });
          await writeFile(
            join(directory, `google-authentication-${randomUUID()}.private.json`),
            JSON.stringify(authenticated),
            { flag: 'wx', mode: 0o400 },
          );
          const captureContext = createInstalledCaptureContext({
            authentication: {
              accountSha256: authenticated.accountSha256,
              audienceSha256: authenticated.audienceSha256,
              snapshotSha256: authenticated.snapshotSha256,
            },
            owner,
            executionDirectory,
            budget: { start, deadline },
            environment: { GOOGLE_APPLICATION_CREDENTIALS: snapshotPath, ...originalEnvironment },
            inputs: bindings,
            assertInputs,
            assertWithinDeadline,
            readProviderInputs: async () => {
              if (!providers || !providerInputs) throw new Error('Original capture provider packages are not admitted');
              await providers.assertOriginal();
              return providerInputs;
            },
          });
          const worker = captureFactory?.(request, captureContext);
          capture = worker
            ? createInstalledApplyController(captureContext, worker, {
                persist: async (event) => {
                  const handle = await open(
                    join(directory, `google-original-apply-${randomUUID()}.private.json`),
                    'wx',
                    0o400,
                  );
                  try {
                    await handle.writeFile(JSON.stringify(event));
                    await handle.sync();
                  } finally {
                    await handle.close();
                  }
                },
              })
            : undefined;
          const captureInvocations = new InstalledCaptureInvocations();
          const verifyCaptureGroup = async (record: InstalledCaptureInvocation) => {
            const rows: Record<string, Record<string, unknown>> = {};
            for (const [name, input] of Object.entries(record.groupInputs)) {
              const current = await owned(input.path);
              assertSameOriginalInput(input, current.binding);
              rows[name] = JSON.parse(current.bytes.toString());
            }
            for (const row of Object.values(rows)) {
              if (
                row.schemaVersion !== 2 ||
                row.pid !== record.identity.pid ||
                row.group !== record.identity.group ||
                row.bootId !== record.identity.boot ||
                row.processStartTicks !== record.identity.start
              )
                throw new Error('Original installed executor group identity differs');
            }
            if (rows.claim.token !== rows.lifetime.token)
              throw new Error('Original installed executor group token differs');
          };
          const bindProviders = async () => {
            if (providers) return;
            const providerBindings: Record<string, OriginalInputBinding> = {};
            for (const [sourceName, version, executableName, expectedSha] of [
              [
                'registry.terraform.io/hashicorp/google',
                versionProfile.googleVersion,
                `terraform-provider-google_v${versionProfile.googleVersion}_x5`,
                versionProfile.googleProviderSha256,
              ],
              [
                'registry.terraform.io/f5-sales-demo/xcsh',
                versionProfile.xcshVersion,
                `terraform-provider-xcsh_v${versionProfile.xcshVersion}`,
                versionProfile.xcProviderSha256,
              ],
            ]) {
              const path = join(executionDirectory, '.terraform/providers', sourceName, version, 'linux_amd64');
              const verified = await verifyProviderPackage({
                directory: path,
                source: sourceName,
                version,
                executable: executableName,
                platform: 'linux_amd64',
                lock: deployment.providerLock,
                lockSha256: hash(deployment.providerLock),
              });
              if (verified.executableSha256 !== expectedSha)
                throw new Error('Original qualified provider executable changed');
              for (const [name, expected] of Object.entries(verified.filesSha256)) {
                const file = await owned(join(path, name));
                if (file.binding.sha256 !== expected) throw new Error('Original provider package changed');
                providerBindings[`${sourceName}:${name}`] = file.binding;
              }
            }
            providers = await monitorOriginalInputs(providerBindings);
            providerInputs = freezeAdmittedCaptureInputs(providerBindings);
          };
          prepareCapture = async () => {
            if (!capture) throw new Error('Original GCP guest capture controller is not qualified');
            await bindProviders();
            await capture.prepare?.(captureContext);
          };
          executor = signalFreeTerraformExecutor({
            python: { path: runtime.python, sha256: pins.pythonSha256 },
            executable: { path: terraformPath, sha256: versionProfile.terraformSha256 },
            originalStartMs: start,
            originalDeadlineMs: deadline,
            assertOriginal,
            beforeRelease: async (admission) => {
              const currentGroup = join(directory, 'google-runtime-groups', randomUUID());
              await privateDirectory(currentGroup);
              for (const name of ['claim.json', 'lifetime.json'])
                await writeFile(
                  join(currentGroup, name),
                  await readFile(join(executionDirectory, '.terraform-executor-lock', name)),
                  { flag: 'wx', mode: 0o400 },
                );
              groups.push(currentGroup);
              const groupInputs: Record<string, OriginalInputBinding> = {};
              for (const name of ['claim', 'lifetime'])
                groupInputs[name] = (await owned(join(currentGroup, `${name}.json`))).binding;
              const originalCapture = captureInvocations.admit({
                identity: admission.identity,
                budget: { start: admission.originalStartMs, deadline: admission.originalDeadlineMs },
                groupDirectory: currentGroup,
                groupInputs,
                capture: admission.args[0] === 'apply' ? capture : undefined,
              });
              await verifyCaptureGroup(originalCapture);
              if (!['version', 'init'].includes(admission.args[0])) await bindProviders();
              if (admission.args[0] === 'apply') {
                if (!capture) throw new Error('Original GCP guest capture controller is not qualified');
                await capture.start(admission);
              }
            },
            finalCapture: async (finished) =>
              finalizeInstalledCapture(captureInvocations, finished, {
                persist: async (value) => {
                  const resultPath = join(directory, `google-runtime-final-${randomUUID()}.private.json`);
                  await writeFile(resultPath, JSON.stringify(value), { flag: 'wx', mode: 0o400 });
                },
                verify: verifyCaptureGroup,
                assertInputs,
              }),
          });
          return {
            schemaVersion: 1,
            kind: 'google-adc-snapshot',
            owner,
            snapshotPath,
            snapshotSha256: hash(currentSource.bytes),
            accountSha256,
            audienceSha256,
            authenticationReceiptSha256: authenticated.authenticationReceiptSha256,
            qualificationSha256: pins.refreshQualificationSha256,
            verifiedAt: authenticated.verifiedAt,
            expiresNoEarlierThan: authenticated.expiresNoEarlierThan,
            assertOriginal,
            closeAfterExecutorExit: close,
          } satisfies GoogleAdcLease;
        } catch (error) {
          await close();
          throw error;
        }
      },
    };
    const execute: Executor = async (invocation) => {
      if (invocation.cwd !== executionDirectory) throw new Error('Original Terraform execution directory changed');
      if (!executor || !originalEnvironment || !compileInvocation)
        throw new Error('Original installed ADC lease has not been acquired');
      if (
        invocation.env.XCSH_API_URL !== originalEnvironment.XCSH_API_URL ||
        invocation.env.XCSH_API_TOKEN !== originalEnvironment.XCSH_API_TOKEN
      )
        throw new Error('Original selected Platform environment changed');
      if (!['version', 'init', 'validate', 'plan', 'show', 'output', 'apply'].includes(invocation.args[0]))
        throw new Error('Installed Terraform invocation is outside the owning runner');
      active++;
      try {
        if (invocation.args[0] === 'apply') {
          if (!prepareCapture) throw new Error('Original installed capture preparation unavailable');
          await prepareCapture();
        }
        return await executor(compileInvocation(invocation));
      } finally {
        active--;
      }
    };
    return {
      googleAdc,
      execute,
      assertApplyReady: async () => {
        if (!captureFactory) throw new Error('Original GCP guest capture controller is not qualified');
        await store.verify();
      },
    };
  };
}
