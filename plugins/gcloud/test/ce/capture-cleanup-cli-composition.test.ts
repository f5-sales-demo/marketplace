/** Source qualification: real native transports and domain storage over synthetic GCP/XC responses. */
import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInstalledCleanupExecutor } from '../../../terraform/src/installed-cleanup-executor';
import { readOwnedInstalledInput } from '../../../terraform/src/installed-runtime';
import { monitorOriginalInputs, type OriginalInputBinding } from '../../../terraform/src/original-input-monitor';
import { createGcpCaptureCleanupCli, gcpCaptureCleanupReadCommands } from '../../src/ce/capture-cleanup-cli';
import { persistGcpCaptureCleanupOrigin, resumeGcpCaptureCleanupOrigin } from '../../src/ce/capture-cleanup-durable';
import { gcpCleanupAdmissionFixture } from './capture-cleanup-admission.test';

const python = process.env.CE_TEST_PYTHON ?? Bun.which('python3') ?? '';
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
test('native cleanup transports compose with original twenty-one-resource admission, durable origin and two non-submitting resumes', async () => {
  const f = await gcpCleanupAdmissionFixture();
  Object.assign(f.inspection.environment, { XCSH_API_URL: 'https://tenant.example.test' });
  const root = await mkdtemp(join(tmpdir(), 'gcp-cleanup-composed-'));
  const cliDiagnostics = join(root, 'cli'),
    terraformDiagnostics = join(root, 'terraform');
  await mkdir(cliDiagnostics, { mode: 0o700 });
  await mkdir(terraformDiagnostics, { mode: 0o700 });
  const executable = async (name: string, body: string) => {
    const path = join(root, name);
    await writeFile(path, `#!${python}\nimport json,os,sys\nfrom pathlib import Path\n${body}\n`, { mode: 0o700 });
    return { path, sha256: hash(await readFile(path)) };
  };
  const responses: Record<string, unknown> = {};
  for (const args of gcpCaptureCleanupReadCommands(f.i))
    responses[JSON.stringify(args)] = await f.runtime.api.exec('gcloud', [...args]);
  const responseFile = join(root, 'responses.private.json');
  await writeFile(responseFile, JSON.stringify(responses), { mode: 0o400 });
  const gcloud = await executable(
    'fixture-gcloud',
    `assert sys.argv[-2:] == ['--account=EXAMPLE_ACCOUNT','--configuration=source-fixture']
key=json.dumps(sys.argv[1:-2],separators=(',',':'))
response=json.loads(Path(${JSON.stringify(responseFile)}).read_text())[key]
print(response['stdout'],end='')
print(response['stderr'],end='',file=sys.stderr)
sys.exit(response['exitCode'])`,
  );
  const terraformResponses: Record<string, unknown> = {};
  for (const args of [
    ['version', '-json'],
    ['show', '-json', 'terraform.tfstate'],
  ])
    terraformResponses[JSON.stringify(args)] = await f.inspection.execute({ args });
  const terraformFile = join(root, 'terraform-responses.private.json');
  await writeFile(terraformFile, JSON.stringify(terraformResponses), { mode: 0o400 });
  const terraform = await executable(
    'fixture-terraform',
    `assert sys.argv[1] == ${JSON.stringify(`-chdir=${f.directory}`)}
key=json.dumps(sys.argv[2:],separators=(',',':'))
response=json.loads(Path(${JSON.stringify(terraformFile)}).read_text())[key]
print(response['stdout'],end='')
sys.exit(response['code'])`,
  );
  const interpreter = { path: python, sha256: hash(await readFile(python)) };
  const monitor = await monitorOriginalInputs(f.inspection.inputs);
  const failed = await readFile(join(f.lock, 'capture-unresolved.json'));
  try {
    const guard = () => monitor.assertOriginal();
    const closure = f.inspection.assertIndependentClosure;
    const api = createGcpCaptureCleanupCli({
      intent: f.i,
      directory: f.directory,
      diagnosticsDirectory: cliDiagnostics,
      python: interpreter,
      gcloud,
      account: 'EXAMPLE_ACCOUNT',
      configuration: 'source-fixture',
      environment: { PATH: process.env.PATH, CLOUDSDK_CONFIG: root },
      assertInputs: guard,
      assertIndependentClosure: closure,
    });
    const execute = createInstalledCleanupExecutor({
      directory: f.directory,
      diagnosticsDirectory: terraformDiagnostics,
      python: interpreter,
      terraform,
      assertInputs: guard,
      assertIndependentClosure: closure,
    });
    const readerInputs: Record<string, OriginalInputBinding> = {};
    for (const name of ['claim.json', 'lifetime.json', 'capture-unresolved.json'])
      readerInputs[`lock:${name}`] = (await readOwnedInstalledInput(join(f.lock, name))).binding;
    const common = {
      intent: f.i,
      executionDirectory: f.directory,
      environment: f.inspection.environment,
      api,
      observePlatform: f.runtime.observePlatform,
      assertIndependentClosure: async (inputs: typeof readerInputs) => {
        expect(inputs).toEqual(readerInputs);
        await closure();
      },
    };
    const origin = await persistGcpCaptureCleanupOrigin({
      ...common,
      readerInputs,
      inspection: { ...f.inspection, execute },
    });
    expect(origin.ownership.addresses).toHaveLength(21);
    expect(origin.executionAuthorized).toBe(false);
    const before = await Array.fromAsync(
      new Bun.Glob('**/submission.private.json').scan({ cwd: terraformDiagnostics }),
    );
    expect(before).toHaveLength(2);
    for (let round = 0; round < 2; round++) {
      const resumed = await resumeGcpCaptureCleanupOrigin({ ...common, reference: origin.reference });
      try {
        expect(resumed.mode).toBe('original');
        expect(resumed.executionAuthorized).toBe(false);
      } finally {
        resumed.close();
      }
    }
    expect(
      await Array.fromAsync(new Bun.Glob('**/submission.private.json').scan({ cwd: terraformDiagnostics })),
    ).toEqual(before);
    expect(await readFile(join(f.lock, 'capture-unresolved.json'))).toEqual(failed);
    expect(
      await Array.fromAsync(new Bun.Glob('**/cleanup-observation-final.private.json').scan({ cwd: cliDiagnostics })),
    ).not.toHaveLength(0);
  } finally {
    monitor.close();
  }
}, 120000);
