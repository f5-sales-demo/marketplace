import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CePlatformService } from '../../../platform/src/ce/service';
import { type CeTerraformService, createCeTerraformService } from '../../src/service';

/** A private test executable admits the readiness query and rejects every provider operation. */
export async function versionOnlyEnvironment(version: string, directories: string[]) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('Invalid test version');
  const directory = await mkdtemp(join(tmpdir(), 'ce-version-only-'));
  directories.push(directory);
  const program = [
    '#!/bin/sh',
    'if [ "$#" -ne 2 ] || [ "$1" != version ] || [ "$2" != -json ]; then exit 91; fi',
    `printf '%s\\n' '${JSON.stringify({ terraform_version: version })}'`,
    '',
  ].join('\n');
  await writeFile(join(directory, 'terraform'), program, { mode: 0o700 });
  return { PATH: directory };
}
export async function metadataService(
  platform: CePlatformService,
  version: string,
  directories: string[],
): Promise<CeTerraformService> {
  const environment = await versionOnlyEnvironment(version, directories);
  const service = createCeTerraformService(async () => platform);
  return {
    ...service,
    open: (owner, deployment, resume, env = environment, signal) =>
      service.open(owner, deployment, resume, env, signal),
  };
}
