import { afterEach } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fingerprint } from '../../gcloud/src/ce/discovery';
import { GCP_PUBLIC_TERRAFORM_ARTIFACTS } from '../../gcloud/src/ce/terraform-public-artifacts';
import {
  publicTerraformCloudScope,
  publicTerraformPlatformScope,
} from '../../gcloud/src/ce/terraform-public-ownership';
import type { GcpCeIntent } from '../../gcloud/src/ce/types';
import { intent as baseIntent } from '../../gcloud/test/ce/fixtures';
import { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import { createInstalledCaptureContext, type InstalledCaptureContext } from '../src/installed-capture-context';
import { createInstalledCaptureInputChecks } from '../src/installed-capture-input-checks';
import { inspectInstalledCaptureScripts, readOwnedInstalledInput } from '../src/installed-runtime';
import { resolveInstalledGcpVersionProfile } from '../src/installed-version-profile';
import { linuxMonotonicMs } from '../src/linux-clock';
import { monitorOriginalInputs } from '../src/original-input-monitor';
import { type Deployment, type Invocation, readOriginalTerraformPlanSource, TerraformRunner } from '../src/runner';

export const credential = {
  type: 'authorized_user',
  client_id: 'synthetic-client',
  client_secret: 'synthetic-secret',
  refresh_token: 'synthetic-refresh',
  quota_project_id: 'example-project',
};
export const authInfo = {
  email: 'principal@example.com',
  verified_email: true,
  audience: credential.client_id,
  issued_to: credential.client_id,
  expires_in: 3599,
  scope: 'https://www.googleapis.com/auth/cloud-platform',
};
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
function key(byte: number) {
  return `ssh-ed25519 ${Buffer.concat([Buffer.from('0000000b7373682d6564323535313900000020', 'hex'), Buffer.alloc(32, byte)]).toString('base64')}`;
}
function declaredIntent(ha: boolean): GcpCeIntent {
  const i = baseIntent();
  i.project = 'example-project';
  i.engine = 'terraform';
  i.routing.destinationCidrs = [];
  i.initialAccess = { schemaVersion: 1, profile: 'site-ssh-sli', publicKey: key(1) };
  if (ha) {
    i.sites[0].nodes = ['a', 'b', 'c'].map((suffix) => ({
      ...structuredClone(i.sites[0].nodes[0]),
      name: `node-${suffix}`,
      zone: `northamerica-northeast1-${suffix}`,
    }));
    i.schemaVersion = 2;
    i.observer = {
      schemaVersion: 1,
      profile: 'original-ha-observer',
      publicKey: key(2),
      sshSourceCidr: '192.0.2.4/32',
    };
  }
  return i;
}
type Row = {
  address: string;
  type: string;
  mode: string;
  change: { actions: string[]; after: Record<string, unknown>; after_unknown: Record<string, unknown> };
};
export async function fixture(
  run: (context: InstalledCaptureContext, store: CeDeploymentStore, invocation: Invocation) => Promise<void>,
  mutation = '',
  ha = true,
  expired: () => boolean = () => false,
  configuration?: (intent: GcpCeIntent) => string,
  prepareIntent?: (intent: GcpCeIntent, store: CeDeploymentStore) => Promise<void>,
  providerLock = GCP_PUBLIC_TERRAFORM_ARTIFACTS.providerLock,
  sourceCaptureInputs = false,
  operationRemainingMs = 7200000,
) {
  const root = await mkdtemp(join(tmpdir(), 'original-inventory-scope-'));
  roots.push(root);
  const intent = declaredIntent(ha);
  const owner = {
    provider: 'gcp' as const,
    engine: 'terraform' as const,
    account: intent.project,
    region: intent.region,
    deploymentId: intent.deploymentName,
  };
  const store = await CeDeploymentStore.open(root, owner);
  await prepareIntent?.(intent, store);
  const configurationText = configuration?.(intent) ?? '{"terraform":{"required_version":"= 1.17.2"}}';
  const requestReason = JSON.parse(configurationText)?.provider?.google?.[0]?.request_reason;
  await store.write('gcp-terraform-input-identity.json', {
    intent,
    intentFingerprint: fingerprint(intent),
    platformContext: intent.platformContext,
    ...(typeof requestReason === 'string'
      ? {
          requestReasonFingerprint: fingerprint({
            schemaVersion: 1,
            scope: 'gcp-terraform-deployment',
            intentFingerprint: fingerprint(intent),
            reason: requestReason,
          }),
        }
      : {}),
  });
  const cloud = publicTerraformCloudScope(intent);
  const platform = publicTerraformPlatformScope(intent);
  const rows: Row[] = cloud.map((resource) => {
    const name = resource.selfLink.split('/').at(-1);
    if (!name) throw new Error('Original fixture resource name required');
    return {
      address: `google_compute_${resource.kind}.${name.replaceAll('-', '_')}`,
      type: `google_compute_${resource.kind}`,
      mode: 'managed',
      change: {
        actions: ['create'],
        after: {
          name,
          project: intent.project,
          ...(['instance', 'disk'].includes(resource.kind)
            ? { zone: resource.selfLink.split('/zones/')[1].split('/')[0] }
            : {}),
          ...(resource.kind === 'subnetwork' ? { region: intent.region } : {}),
        },
        after_unknown: { id: true },
      },
    };
  });
  rows.push(
    ...platform.map((resource) => ({
      address: resource.address,
      type: 'tokenName' in resource ? 'xcsh_token' : 'xcsh_securemesh_site_v2',
      mode: 'managed',
      change: {
        actions: ['create'],
        after: {
          name: 'tokenName' in resource ? resource.tokenName : resource.siteName,
          namespace: 'system',
          ...('tokenName' in resource ? { site_name: resource.siteName } : {}),
        },
        after_unknown: { id: true },
      },
    })),
  );
  if (mutation === 'extra')
    rows.push({ ...rows[0], address: 'google_compute_router.foreign', type: 'google_compute_router' });
  if (mutation === 'missing') rows.pop();
  if (mutation === 'project') rows[0].change.after.project = 'foreign-project';
  if (mutation === 'unknown') rows[0].change.after_unknown.name = true;
  if (mutation === 'replacement') rows[0].change.actions = ['delete', 'create'];
  const last = rows.at(-1);
  if (!last) throw new Error('Original fixture row required');
  if (mutation === 'namespace') last.change.after.namespace = 'example-foreign-namespace';
  if (mutation === 'platform-name') last.change.after.name = 'foreign-token';
  const deployment: Deployment = {
    schemaVersion: 1,
    deploymentId: owner.deploymentId,
    engine: 'terraform',
    scope: { cloud: 'gcp', account: intent.project, region: intent.region },
    terraformVersion: '1.17.2',
    configuration: configurationText,
    providerLock,
    backendIdentity: `local:${owner.deploymentId}`,
  };
  const runner = new TerraformRunner(
    store.directory,
    async (request: Invocation) => {
      if (request.args[0] === 'plan')
        await writeFile(join(request.cwd, 'saved.tfplan'), 'original-owned-inventory-plan', { mode: 0o600 });
      if (request.args[0] === 'apply') {
        const adc = join(request.cwd, 'adc.private'),
          platformInput = join(request.cwd, 'platform.private');
        await writeFile(adc, JSON.stringify(credential), { mode: 0o400 });
        await writeFile(platformInput, 'original-platform', { mode: 0o400 });
        const files = {
          'script:gcp_host_trust.py': await realpath(join(import.meta.dir, '../scripts/gcp_host_trust.py')),
          python: await realpath(process.env.CE_TEST_PYTHON ?? Bun.which('python3') ?? ''),
          adc,
          platform: platformInput,
          'workspace:main.tf.json': join(request.cwd, 'main.tf.json'),
          'workspace:.terraform.lock.hcl': join(request.cwd, '.terraform.lock.hcl'),
          'workspace:gcp-terraform-input-identity.json': join(store.directory, 'gcp-terraform-input-identity.json'),
        };
        const inputs = Object.fromEntries(
          await Promise.all(
            Object.entries(files).map(
              async ([name, path]) => [name, (await readOwnedInstalledInput(path)).binding] as const,
            ),
          ),
        );
        // Explicit offline source profile: real files and identities are checked,
        // while provider/executable labels simulate the qualified binaries. The
        // native gated child still runs only the real qualified fixture Python.
        let symbolicTerraform: (typeof inputs)[string] | undefined;
        const sourceProfile = sourceCaptureInputs
          ? resolveInstalledGcpVersionProfile({ terraformVersion: '1.17.2', providerLockSha256: hash(providerLock) })
          : undefined;
        if (sourceCaptureInputs) {
          if (!sourceProfile) throw new Error('Original source fixture profile required');
          Object.assign(inputs, await inspectInstalledCaptureScripts());
          const path = join(request.cwd, 'symbolic-terraform.private');
          await writeFile(path, 'offline-qualified-terraform-label', { mode: 0o500 });
          symbolicTerraform = (await readOwnedInstalledInput(path)).binding;
          inputs.terraform = { ...symbolicTerraform, sha256: sourceProfile.terraformSha256 };
        }
        const providers: Record<string, (typeof inputs)[string]> = {};
        const interpreter = await monitorOriginalInputs({ python: inputs.python });
        for (let i = 0; i < 6; i++) {
          const path = join(request.cwd, `synthetic-provider-${i}.private`);
          await writeFile(path, `original-provider-${i}`, { mode: 0o400 });
          providers[`offline:${i}`] = (await readOwnedInstalledInput(path)).binding;
        }
        if (sourceCaptureInputs) {
          if (!sourceProfile) throw new Error('Original source fixture profile required');
          for (const name of Object.keys(providers)) delete providers[name];
          for (const [address, version, names] of [
            [
              'hashicorp/google',
              sourceProfile.googleVersion,
              ['LICENSE.txt', `terraform-provider-google_v${sourceProfile.googleVersion}_x5`],
            ],
            [
              'f5-sales-demo/xcsh',
              sourceProfile.xcshVersion,
              ['CHANGELOG.md', 'LICENSE', 'README.md', `terraform-provider-xcsh_v${sourceProfile.xcshVersion}`],
            ],
          ] as const) {
            const folder = join(
              request.cwd,
              '.terraform/providers/registry.terraform.io',
              address,
              version,
              'linux_amd64',
            );
            await mkdir(folder, { recursive: true, mode: 0o700 });
            for (const name of names) {
              const path = join(folder, name);
              await writeFile(path, `offline-qualified-provider-label:${name}`, {
                mode: name.startsWith('terraform-provider-') ? 0o500 : 0o400,
              });
              const actual = (await readOwnedInstalledInput(path)).binding;
              const digest = name.startsWith('terraform-provider-google')
                ? sourceProfile.googleProviderSha256
                : name.startsWith('terraform-provider-xcsh')
                  ? sourceProfile.xcProviderSha256
                  : actual.sha256;
              providers[`registry.terraform.io/${address}:${name}`] = { ...actual, sha256: digest };
            }
          }
        }
        if (!Number.isSafeInteger(operationRemainingMs) || operationRemainingMs <= 0 || operationRemainingMs > 7200000)
          throw new Error('Bounded offline original operation remainder required');
        // A late-arriving original operation still has the immutable two-hour duration.
        const start = linuxMonotonicMs() - 7200000 + operationRemainingMs;
        const actualInputs = { ...inputs, ...(symbolicTerraform ? { terraform: symbolicTerraform } : {}) };
        const captureMonitor = await monitorOriginalInputs(actualInputs);
        await captureMonitor.assertOriginal();
        const inputChecks = createInstalledCaptureInputChecks({
          verifyStore: async () => {},
          monitors: () => [captureMonitor],
          budget: { start, deadline: start + 7200000 },
          clock: linuxMonotonicMs,
        });
        const context = createInstalledCaptureContext({
          owner,
          executionDirectory: request.cwd,
          budget: { start, deadline: start + 7200000 },
          authentication: {
            accountSha256: hash(authInfo.email),
            audienceSha256: hash(credential.client_id),
            snapshotSha256: inputs.adc.sha256,
          },
          environment: {
            GOOGLE_APPLICATION_CREDENTIALS: adc,
            XCSH_API_URL: 'https://tenant.example.test',
            XCSH_API_TOKEN: 'synthetic',
          },
          inputs,
          assertInputs: inputChecks.assertCaptureInputs,
          assertWithinDeadline: async () => {
            if (expired() || linuxMonotonicMs() >= start + 7200000) throw new Error('original operation expired');
            await inputChecks.assertCaptureWithinDeadline();
          },
          readProviderInputs: async () => providers,
          readOriginalPlanSource: () =>
            readOriginalTerraformPlanSource(request.originalPlanSource, {
              directory: request.cwd,
              engine: 'terraform',
              deploymentId: owner.deploymentId,
              scope: deployment.scope,
              terraformVersion: deployment.terraformVersion,
              backendIdentity: deployment.backendIdentity,
            }),
        });
        try {
          await run(context, store, request);
        } finally {
          try {
            await inputChecks.assertInputs();
          } finally {
            captureMonitor.close();
            interpreter.close();
          }
        }
      }
      return {
        code: 0,
        stdout:
          request.args[0] === 'version'
            ? JSON.stringify({ terraform_version: '1.17.2' })
            : request.args[0] === 'show'
              ? JSON.stringify({
                  format_version: '1.2',
                  terraform_version: '1.17.2',
                  complete: true,
                  errored: false,
                  applyable: true, // codespell:ignore applyable -- exact Terraform JSON field
                  resource_changes: rows,
                  output_changes: {},
                })
              : '',
      }; // codespell:ignore applyable
    },
    undefined,
    'gcp-resource-plan-v1',
  );
  await runner.prepare(deployment);
  const plan = await runner.plan({});
  await runner.apply(plan, {});
}
