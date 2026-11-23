import { expect, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { canonicalSha256 } from '../../src/ce/canonical';
import { persistAzureNativeSource } from '../../src/ce/native-action-evidence';
import {
  observeAzureNativeVmAuthentication,
  prepareAzureNativeVmAuthentication,
  verifyAzureNativeVmAuthenticationArtifacts,
} from '../../src/ce/native-vm-auth';
import { compileAzureCePlan } from '../../src/ce/planner';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { intent, observation } from './fixtures';

test('three-node keys remain distinct and replacement retains other node credentials', async () => {
  const root = await mkdtemp(join(tmpdir(), 'native-key-generations-'));
  try {
    const discovery = structuredClone(observation);
    discovery.regions[0].quotaAvailable = 24;
    discovery.regions[0].zones = ['1', '2', '3'];
    discovery.regions[0].vmSizes[0].zones = ['1', '2', '3'];
    const source = compileAzureCePlan(
      {
        ...intent,
        engine: 'native',
        topology: { ha: true },
        nics: [
          intent.nics[0],
          { name: 'sli', role: 'sli', subnet: { mode: 'greenfield', cidr: '10.21.0.0/24', name: 'sli' } },
        ],
      },
      discovery,
    );
    expect(source.topology.nodeCount).toBe(3);
    const store = await CeDeploymentStore.open(join(root, 'state'), azureUpgradeBinding(source).owner);
    await persistAzureNativeSource(source, store);
    const uid = '00000000-0000-4000-8000-000000000099';
    const fingerprint = 'sha256:' + 'a'.repeat(64);
    await store.write('native-site.json', {
      siteName: source.siteName,
      uid,
      owner: store.owner,
      contractFingerprint: fingerprint,
    });
    const initial = [];
    for (const action of source.actions.filter((row) => row.kind === 'vm-create')) {
      const auth = await prepareAzureNativeVmAuthentication(source, action, store);
      initial.push({ node: action.node, auth, digest: canonicalSha256(await store.read(auth.recordName)) });
    }
    expect(initial.length).toBe(3);
    expect(new Set(initial.map((row) => row.auth.publicKey)).size).toBe(3);
    expect(new Set(initial.map((row) => row.auth.profileId)).size).toBe(3);
    discovery.resources = initial.map((row) => ({
      id: `/subscriptions/${source.subscription.id}/resourceGroups/${source.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${source.deploymentName}-${row.node}`,
      location: source.region,
      exists: true,
      owned: true,
      state: {},
      tags: {
        'xcsh-managed-by': 'azure-ce',
        'xcsh-execution-engine': 'native',
        'xcsh-deployment-id': source.deploymentName,
        'xcsh-plan-sha256': source.planSha256,
      },
    }));
    const replacement = compileAzureCePlan(
      { ...source.intent, operation: 'replace-node', replacementNode: 2 },
      discovery,
    );
    await persistAzureNativeSource(replacement, store);
    const action = replacement.actions.find((row) => row.kind === 'vm-create');
    if (!action) throw Error('Replacement fixture requires a real VM-create action');
    const auth = await prepareAzureNativeVmAuthentication(replacement, action, store);
    expect(action.node).toBe(2);
    expect(auth.publicKey).not.toBe(initial.find((row) => row.node === 2)!.auth.publicKey);
    expect(auth.profileId).not.toBe(initial.find((row) => row.node === 2)!.auth.profileId);
    for (const row of initial) expect(canonicalSha256(await store.read(row.auth.recordName))).toBe(row.digest);
    const vmId = '00000000-0000-4000-8000-000000000102';
    const installed = await observeAzureNativeVmAuthentication(replacement, action, store, {
      exec: async (_command, args) => {
        expect(args).toContain(action.resourceId!);
        expect(args).toContain(source.subscription.id);
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            id: action.resourceId,
            name: `${source.deploymentName}-2`,
            location: source.region,
            vmId,
            tags: {
              'xcsh-managed-by': 'azure-ce',
              'xcsh-execution-engine': 'native',
              'xcsh-deployment-id': source.deploymentName,
              'xcsh-plan-sha256': replacement.planSha256,
            },
            osProfile: {
              adminUsername: 'azureuser',
              linuxConfiguration: {
                disablePasswordAuthentication: true,
                ssh: {
                  publicKeys: [
                    { path: posix.join('/home', 'azureuser', '.ssh', 'authorized_keys'), keyData: auth.publicKey },
                  ],
                },
              },
            },
          }),
        };
      },
    });
    expect(installed.vmId).toBe(vmId);
    const records = new Map();
    for (const name of await readdir(store.directory))
      if (name.endsWith('.json')) records.set(name, await store.read(name));
    verifyAzureNativeVmAuthenticationArtifacts(
      source,
      new Map([
        [source.planSha256, source],
        [replacement.planSha256, replacement],
      ]),
      uid,
      fingerprint,
      records,
    );
    expect((await prepareAzureNativeVmAuthentication(replacement, action, store)).profileId).toBe(auth.profileId);
    for (const row of initial) expect(canonicalSha256(await store.read(row.auth.recordName))).toBe(row.digest);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
