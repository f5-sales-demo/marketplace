import { lstat, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GcloudExecApi } from '../gcloud/exec';
import type { GcpBootstrapStore } from './bootstrap-checkout';
import { type GcpNativeAction, translateGcpNativeCompute } from './compute-plan';
import { fingerprint } from './discovery';
import type { GcpNativeCreateDriver } from './native-create';
import { type GcpOperationBinding, reconcileGcpOperation, recordGcpOperation } from './native-operation';
import type { GcpCeIntent } from './types';

/** Scoped cloud driver; outer lifecycle must have admitted policy, plan, bootstrap and ownership. */
export function createGcpNativeCreationDriver(
  api: GcloudExecApi,
  store: GcpBootstrapStore,
  privateDirectory: string,
  intent: GcpCeIntent,
): GcpNativeCreateDriver {
  const plan = translateGcpNativeCompute(intent);
  const admit = (action: GcpNativeAction) => {
    if (!plan.actions.some((expected) => fingerprint(expected) === fingerprint(action)))
      throw new Error('Cloud creation action differs from translated plan');
    const node = intent.sites.flatMap((site) => site.nodes).find((node) => action.id === `instance-${node.name}`);
    const site = intent.sites.find((site) => site.nodes.some((n) => n.name === node?.name));
    const name = action.argv[action.kind === 'subnetwork' ? 4 : 3];
    return { node, site, name };
  };
  const binding = (action: GcpNativeAction, executionId: string): GcpOperationBinding => {
    const { node } = admit(action);
    return {
      project: intent.project,
      deploymentName: intent.deploymentName,
      engine: 'native',
      actionId: executionId,
      ...(action.kind === 'instance'
        ? { zone: node?.zone }
        : action.kind === 'subnetwork'
          ? { region: intent.region }
          : { global: true as const }),
    };
  };
  const observe: GcpNativeCreateDriver['observe'] = async (action, signal) => {
    const { node, site, name } = admit(action);
    const args =
      action.kind === 'subnetwork'
        ? ['compute', 'networks', 'subnets', 'describe', name, `--region=${intent.region}`]
        : [
            'compute',
            action.kind === 'instance' ? 'instances' : 'networks',
            'describe',
            name,
            ...(node ? [`--zone=${node.zone}`] : []),
          ];
    const result = await api.exec(
      'gcloud',
      [...args, `--project=${intent.project}`, '--format=json(id,selfLink,name,labels)'],
      { signal },
    );
    if (result.exitCode !== 0) {
      if (/\b404\b|was not found|not found/i.test(result.stderr)) return null;
      throw new Error('Scoped cloud creation observation failed');
    }
    let row: { id?: string; selfLink?: string; name?: string; labels?: Record<string, string> };
    try {
      row = JSON.parse(result.stdout);
    } catch {
      throw new Error('Malformed creation observation');
    }
    if (row.name !== name || typeof row.id !== 'string' || typeof row.selfLink !== 'string')
      throw new Error('Creation observation identity differs');
    if (
      node &&
      (row.labels?.['xcsh-deployment'] !== intent.deploymentName ||
        row.labels['xcsh-engine'] !== 'native' ||
        row.labels['xcsh-node'] !== node.name ||
        row.labels['xcsh-site'] !== site?.name)
    )
      throw new Error('Created VM ownership labels differ');
    return {
      id: row.id,
      selfLink: row.selfLink,
      kind: action.kind,
      project: intent.project,
      deploymentName: intent.deploymentName,
      engine: 'native',
      ...(node ? { nodeName: node.name, siteName: site?.name } : {}),
    };
  };
  return {
    observe,
    async submit(action, executionId, signal) {
      const { node, site } = admit(action);
      if (!/^create-[a-f0-9]{40}$/.test(executionId)) throw new Error('Exact creation execution ID required');
      let metadataPath: string | undefined;
      const args = [...action.argv];
      if (node) {
        if ((await realpath(privateDirectory)) !== privateDirectory)
          throw new Error('Private bootstrap directory differs');
        const stat = await lstat(privateDirectory);
        if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || stat.mode & 0o077)
          throw new Error('Private bootstrap directory ownership differs');
        // Bootstrap checkout is already consumed and staged by the owning lifecycle.
        const material = (await store.read(`gcp-bootstrap-material-${node.name}.json`)) as {
          nodeName: string;
          project: string;
          deploymentName: string;
          siteName: string;
          engine: string;
          expiresAt: string;
          userData: string;
          consumed: boolean;
        };
        if (
          material.nodeName !== node.name ||
          material.project !== intent.project ||
          material.deploymentName !== intent.deploymentName ||
          material.siteName !== site?.name ||
          material.engine !== 'native' ||
          !Number.isFinite(Date.parse(material.expiresAt)) ||
          Date.parse(material.expiresAt) <= Date.now() ||
          material.consumed ||
          typeof material.userData !== 'string' ||
          !material.userData.startsWith('#cloud-config\n')
        )
          throw new Error('Bound staged bootstrap unavailable');
        metadataPath = join(privateDirectory, `bootstrap-${executionId}.private`);
        await writeFile(metadataPath, material.userData, { flag: 'wx', mode: 0o600 });
        await store.write(`gcp-bootstrap-material-${node.name}.json`, {
          nodeName: node.name,
          project: material.project,
          deploymentName: material.deploymentName,
          siteName: material.siteName,
          engine: material.engine,
          expiresAt: material.expiresAt,
          userData: '',
          consumed: true,
        });
        args.push(`--metadata-from-file=user-data=${metadataPath}`);
      } else args.push('--async');
      try {
        signal?.throwIfAborted();
        const result = await api.exec('gcloud', args, { signal });
        if (result.exitCode !== 0) throw new Error('Cloud creation outcome requires reconciliation');
        let response: unknown;
        try {
          response = JSON.parse(result.stdout);
        } catch {
          throw new Error('Creation operation receipt unavailable');
        }
        const row = Array.isArray(response) ? response[0] : response;
        await recordGcpOperation(store, binding(action, executionId), row);
        return { operationRecorded: true };
      } finally {
        if (metadataPath) await rm(metadataPath, { force: true });
      }
    },
    async reconcile(action, executionId, _receipt, signal) {
      let recorded: unknown;
      try {
        recorded = await store.read(`gcp-operation-${executionId}.json`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      if (!recorded) throw new Error('Ambiguous creation needs exact operation receipt reconciliation');
      return (await reconcileGcpOperation(store, api, binding(action, executionId), signal)).state;
    },
  };
}
