import type { CePlatformService } from '../../../platform/src/ce/service';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { GcloudExecApi } from '../gcloud/exec';
import { fingerprint } from './discovery';
import { publicTerraformContextHash } from './terraform-context';
import { GCP_PUBLIC_TERRAFORM_ARTIFACTS } from './terraform-public-artifacts';
import { openGcpTerraformSession, resumeGcpTerraformSession } from './terraform-session';
import type { GcpCeIntent } from './types';

/** Credentials, configuration and locks are server-owned implementation details. */
export async function openPublicTerraformRuntime(
  platform: CePlatformService,
  api: GcloudExecApi,
  intent: GcpCeIntent,
  signal?: AbortSignal,
  installedService?: CeTerraformService,
) {
  if (
    intent.engine !== 'terraform' ||
    !GCP_PUBLIC_TERRAFORM_ARTIFACTS ||
    GCP_PUBLIC_TERRAFORM_ARTIFACTS.configurationVersion !== 2
  )
    throw new Error('Published creation identity provider qualification unavailable');
  const owner = {
    deploymentId: intent.deploymentName,
    provider: 'gcp' as const,
    engine: 'terraform' as const,
    account: intent.project,
    region: intent.region,
  };
  const store = await platform.storage(owner);
  let inputs: unknown;
  try {
    inputs = await store.read('gcp-terraform-session-inputs.json');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const expected = { schemaVersion: 1, inputs: { ...GCP_PUBLIC_TERRAFORM_ARTIFACTS, intent } };
  if (inputs && fingerprint(inputs) !== fingerprint(expected))
    throw new Error('Public Terraform original packaged inputs differ');
  const session = inputs
    ? await resumeGcpTerraformSession(platform, intent, installedService)
    : await openGcpTerraformSession(platform, expected.inputs, false, installedService);
  if (!platform.gcpObservations) throw new Error('Scoped Terraform observations unavailable');
  const observations = await platform.gcpObservations(owner, intent.platformContext, signal);
  if (!observations.teardown || !observations.terraformEnvironment)
    throw new Error('Qualified Terraform runtime channels unavailable');
  const credentials = await observations.terraformEnvironment();
  const context = { schemaVersion: 1, contextHash: publicTerraformContextHash(intent, credentials.XCSH_API_URL) };
  let originalContext: unknown;
  try {
    originalContext = await store.read('gcp-tf-public-platform-context.json');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    // A crash before the initial context receipt can resume only before authorization.
    try {
      await store.read('gcp-tf-deploy-original-authorization.json');
      throw new Error('Original authorized public Terraform context receipt unavailable');
    } catch (authorizationError) {
      if ((authorizationError as NodeJS.ErrnoException).code !== 'ENOENT') throw authorizationError;
    }
    await store.write('gcp-tf-public-platform-context.json', context);
    originalContext = context;
  }
  if (fingerprint(originalContext) !== fingerprint(context))
    throw new Error('Original public Terraform context endpoint changed');
  const access = await api.exec('gcloud', ['auth', 'print-access-token', `--project=${intent.project}`, '--quiet'], {
    signal,
  });
  if (access.exitCode !== 0 || !access.stdout.trim() || /\s/.test(access.stdout.trim()))
    throw new Error('Scoped Terraform Google authentication unavailable');
  return {
    store,
    session,
    api,
    observePlatform: observations.teardown,
    environment: { ...process.env, ...credentials, GOOGLE_OAUTH_ACCESS_TOKEN: access.stdout.trim() },
  };
}
