import { lstat, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GcloudExecApi } from '../gcloud/exec';
import type { GcpBootstrapStore } from './bootstrap-checkout';
import { type GcpNativeAction, translateGcpNativeCompute } from './compute-plan';
import { fingerprint } from './discovery';
import type { GcpNativeCreateDriver } from './native-create';
import { type GcpOperationBinding, reconcileGcpOperation, recordGcpOperation } from './native-operation';
import { type GcpResourceIdentity, recordGcpResource, validateGcpResourceIdentity } from './ownership';
import type { GcpCeIntent } from './types';

interface SynchronousCompletion {
  schemaVersion?: 2;
  actionFingerprint: string;
  completed: true;
  resource?: GcpResourceIdentity;
}

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
  const plannedLink = (action: GcpNativeAction) => {
    const { name } = admit(action);
    if (action.kind === 'instance') throw new Error('Synchronous identity requires a network or subnetwork');
    const scope = action.kind === 'subnetwork' ? `regions/${intent.region}/subnetworks` : 'global/networks';
    return `https://www.googleapis.com/compute/v1/projects/${intent.project}/${scope}/${name}`;
  };
  const completion = async (action: GcpNativeAction, executionId: string) => {
    const value = (await store.read(`gcp-create-completed-${executionId}.json`)) as SynchronousCompletion;
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      value.actionFingerprint !== fingerprint(action) ||
      value.completed !== true
    )
      throw new Error('Ambiguous creation requires a completed command receipt');
    if (value.schemaVersion !== undefined && value.schemaVersion !== 2)
      throw new Error('Unsupported creation completion receipt version');
    if (value.schemaVersion === 2) {
      const resource = value.resource;
      if (!resource || typeof resource.id !== 'string' || typeof resource.selfLink !== 'string')
        throw new Error('Original create identity is unavailable');
      validateGcpResourceIdentity(resource);
      if (
        resource.project !== intent.project ||
        resource.deploymentName !== intent.deploymentName ||
        resource.engine !== 'native' ||
        resource.kind !== action.kind ||
        resource.selfLink !== plannedLink(action)
      )
        throw new Error('Original create identity differs from planned resource');
    }
    return value;
  };
  const assertCreatedIdentity = async (action: GcpNativeAction, executionId: string, observed: GcpResourceIdentity) => {
    if (action.kind === 'instance') return;
    const original = await completion(action, executionId);
    if (
      original.schemaVersion === 2 &&
      (original.resource?.id !== observed.id || original.resource?.selfLink !== observed.selfLink)
    )
      throw new Error('Original create identity was replaced');
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
    assertCreatedIdentity,
    async submit(action, executionId, signal) {
      const { node, site } = admit(action);
      if (!/^create-[a-f0-9]{40}$/.test(executionId)) throw new Error('Exact creation execution ID required');
      let metadataPath: string | undefined;
      const args = [...action.argv];
      try {
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
        }
        signal?.throwIfAborted();
        const result = await api.exec('gcloud', args, { signal });
        if (result.exitCode !== 0) throw new Error('Cloud creation outcome requires reconciliation');
        let response: unknown;
        try {
          response = JSON.parse(result.stdout);
        } catch {
          throw new Error('Creation operation receipt unavailable');
        }
        if (Array.isArray(response) && response.length !== 1)
          throw new Error('Cloud creation returned an ambiguous result count');
        const row = Array.isArray(response) ? response[0] : response;
        if (!row || typeof row !== 'object' || Array.isArray(row))
          throw new Error('Cloud creation returned a malformed result');
        if (action.kind !== 'instance') {
          const created = row as { id?: unknown; name?: unknown; selfLink?: unknown };
          const { name } = admit(action);
          if (typeof created.id !== 'string' || created.name !== name || created.selfLink !== plannedLink(action))
            throw new Error('Synchronous create result lacks exact planned identity');
          const resource: GcpResourceIdentity = {
            id: created.id,
            selfLink: String(created.selfLink),
            project: intent.project,
            deploymentName: intent.deploymentName,
            engine: 'native',
            kind: action.kind,
          };
          validateGcpResourceIdentity(resource);
          await store.write(`gcp-create-completed-${executionId}.json`, {
            schemaVersion: 2,
            actionFingerprint: fingerprint(action),
            completed: true,
            resource,
          });
          return { completedCommand: true };
        }
        await recordGcpOperation(store, binding(action, executionId), row);
        return { operationRecorded: true };
      } finally {
        if (metadataPath) await rm(metadataPath, { force: true });
      }
    },
    async reconcile(action, executionId, _receipt, signal) {
      if (action.kind !== 'instance') {
        await completion(action, executionId);
        const observed = await observe(action, signal);
        if (!observed) return 'pending';
        await assertCreatedIdentity(action, executionId, observed);
        return 'done';
      }
      let recorded: unknown;
      try {
        recorded = await store.read(`gcp-operation-${executionId}.json`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      if (!recorded) throw new Error('Ambiguous creation needs exact operation receipt reconciliation');
      const outcome = await reconcileGcpOperation(store, api, binding(action, executionId), signal);
      if (outcome.state === 'done' && action.kind === 'instance') {
        const { node, site } = admit(action);
        if (!node || !site) throw new Error('Exact node binding required');
        const prefix = `https://www.googleapis.com/compute/v1/projects/${intent.project}/zones/${node.zone}`;
        const vmResult = await api.exec(
          'gcloud',
          [
            'compute',
            'instances',
            'describe',
            node.name,
            `--project=${intent.project}`,
            `--zone=${node.zone}`,
            '--format=json(id,selfLink,disks)',
          ],
          { signal },
        );
        if (vmResult.exitCode !== 0) throw new Error('Boot disk ownership observation unavailable');
        const vm = JSON.parse(vmResult.stdout) as {
          selfLink: string;
          disks?: Array<{ boot?: boolean; source?: string }>;
        };
        const boots = vm.disks?.filter((d) => d.boot === true) ?? [];
        if (
          vm.selfLink !== `${prefix}/instances/${node.name}` ||
          boots.length !== 1 ||
          !boots[0].source?.startsWith(`${prefix}/disks/`)
        )
          throw new Error('Exact owned boot disk link required');
        const diskName = boots[0].source.split('/').at(-1) as string;
        if (!/^[a-z][a-z0-9-]{0,62}$/.test(diskName)) throw new Error('Invalid boot disk name');
        const diskResult = await api.exec(
          'gcloud',
          [
            'compute',
            'disks',
            'describe',
            diskName,
            `--project=${intent.project}`,
            `--zone=${node.zone}`,
            '--format=json(id,selfLink,users)',
          ],
          { signal },
        );
        if (diskResult.exitCode !== 0) throw new Error('Boot disk identity observation unavailable');
        const disk = JSON.parse(diskResult.stdout) as { id: string; selfLink: string; users?: string[] };
        if (disk.selfLink !== boots[0].source || disk.users?.length !== 1 || disk.users[0] !== vm.selfLink)
          throw new Error('Boot disk attachment ownership differs');
        await recordGcpResource(store, {
          id: disk.id,
          selfLink: disk.selfLink,
          kind: 'disk',
          project: intent.project,
          deploymentName: intent.deploymentName,
          siteName: site.name,
          nodeName: node.name,
          engine: 'native',
        });
      }
      return outcome.state;
    },
  };
}
