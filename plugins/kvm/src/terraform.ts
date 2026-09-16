import { createHash } from 'node:crypto';
import { chmod, readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type { KvmSavedPlan } from './lifecycle';
import { type KvmCommandRunner, runKvmCommand } from './runtime';

export interface KvmPlanFileOps {
  chmod(path: string, mode: number): Promise<void>;
  sha256(path: string): Promise<string>;
}

const defaultFileOps: KvmPlanFileOps = {
  chmod,
  async sha256(path) {
    return createHash('sha256')
      .update(await readFile(path))
      .digest('hex');
  },
};

interface TerraformResourceChange {
  address?: unknown;
  provider_name?: unknown;
  change?: { actions?: unknown };
}

function planChanges(stdout: string): TerraformResourceChange[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error('Terraform returned invalid saved-plan JSON');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('Terraform returned invalid saved-plan JSON');
  const resourceChanges = (parsed as { resource_changes?: unknown }).resource_changes;
  if (resourceChanges === undefined) return [];
  if (!Array.isArray(resourceChanges)) throw new Error('Terraform returned invalid resource changes');
  return resourceChanges as TerraformResourceChange[];
}

function actions(change: TerraformResourceChange): string[] {
  const value = change.change?.actions;
  if (!Array.isArray(value) || value.some((action) => typeof action !== 'string'))
    throw new Error('Terraform returned invalid resource action data');
  return value;
}

function isAzure(change: TerraformResourceChange): boolean {
  const address = typeof change.address === 'string' ? change.address : '';
  const provider = typeof change.provider_name === 'string' ? change.provider_name : '';
  return (
    /(?:^|\.)module\.azure(?:[_.]|$)/.test(address) ||
    /(?:^|\.)(?:azurerm|azapi)_/.test(address) ||
    /(?:hashicorp\/azurerm|azure\/azapi)$/.test(provider)
  );
}

export async function createTerraformSavedPlan(
  workspace: string,
  mode: KvmSavedPlan['mode'],
  outputPath: string,
  run: KvmCommandRunner = runKvmCommand,
  fileOps: KvmPlanFileOps = defaultFileOps,
): Promise<KvmSavedPlan> {
  if (!isAbsolute(workspace) || !isAbsolute(outputPath))
    throw new Error('KVM workspace and saved-plan path must be absolute');

  const args = [
    `-chdir=${workspace}`,
    'plan',
    '-input=false',
    '-lock=true',
    '-detailed-exitcode',
    `-out=${outputPath}`,
    '-var=enable_azure=false',
    '-var=enable_aws=false',
    '-var=enable_kvm=true',
  ];
  if (mode === 'destroy') args.push('-destroy');
  const planned = await run('terraform', args, workspace);
  if (planned.exitCode !== 0 && planned.exitCode !== 2)
    throw new Error('Terraform KVM plan failed; output was withheld because it may contain sensitive values');

  await fileOps.chmod(outputPath, 0o600);
  const shown = await run('terraform', [`-chdir=${workspace}`, 'show', '-json', outputPath], workspace);
  if (shown.exitCode !== 0) throw new Error('Terraform KVM saved-plan inspection failed; output was withheld');
  const changes = planChanges(shown.stdout);
  let add = 0;
  let changeCount = 0;
  let destroy = 0;
  let azureActions = 0;
  for (const resource of changes) {
    const resourceActions = actions(resource);
    if (resourceActions.includes('create')) add += 1;
    if (resourceActions.includes('update')) changeCount += 1;
    if (resourceActions.includes('delete')) destroy += 1;
    if (!resourceActions.includes('no-op') && isAzure(resource)) azureActions += 1;
  }

  return {
    path: outputPath,
    sha256: await fileOps.sha256(outputPath),
    mode,
    add,
    change: changeCount,
    destroy,
    azureActions,
  };
}

export async function applyTerraformSavedPlan(
  workspace: string,
  planPath: string,
  run: KvmCommandRunner = runKvmCommand,
): Promise<{ exitCode: 0; outputBytes: number; outputSha256: string }> {
  if (!isAbsolute(workspace) || !isAbsolute(planPath))
    throw new Error('KVM workspace and saved-plan path must be absolute');
  const result = await run(
    'terraform',
    [`-chdir=${workspace}`, 'apply', '-input=false', '-auto-approve', planPath],
    workspace,
  );
  if (result.exitCode !== 0)
    throw new Error(
      'Terraform KVM saved-plan apply failed; output was withheld because it may contain sensitive values',
    );
  const output = `${result.stdout}${result.stderr}`;
  return {
    exitCode: 0,
    outputBytes: Buffer.byteLength(output),
    outputSha256: createHash('sha256').update(output).digest('hex'),
  };
}
