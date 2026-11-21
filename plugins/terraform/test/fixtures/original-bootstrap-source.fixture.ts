/** Actual original context/plan/HTTP-body/reader issuers; SDK receipts are explicitly offline. */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { originalGcpBootstrapSource } from '../../../platform/src/ce/gcp-bootstrap-evidence';
import { openOriginalGcpBootstrapObservation } from '../../../platform/src/ce/gcp-bootstrap-observation';
import { collectOriginalGcpPreapplyBootstrap } from '../../src/gcp-preapply-bootstrap';
import type { OriginalApplyCallbackContext } from '../../src/installed-apply-controller';
import type { InstalledCaptureContext } from '../../src/installed-capture-context';
import { openInstalledXcshCreationReader } from '../../src/installed-xcsh-creation-reader';
import { linuxMonotonicMs } from '../../src/linux-clock';
import { closePreparedCreationScope, prepareOriginalCreationScope } from '../../src/prepared-creation-scope';
import type { Invocation } from '../../src/runner';
import type { ExecutionCaptureAdmission, SignalFreeExecutionPolicy } from '../../src/signal-free-executor';
import { joinOriginalXcshCreationBody } from '../../src/xcsh-creation-body';
import { retainOwnedTestCapture } from '../retained-test-capture';

const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export async function openOriginalBootstrapFixture(
  context: InstalledCaptureContext,
  admission: ExecutionCaptureAdmission,
  store: CeDeploymentStore,
  siteName: string,
  nodeName: string,
  jwt: string,
  siteSpec: Readonly<Record<string, unknown>> = {},
) {
  const packet = await prepareOriginalCreationScope(context);
  const tokenName = `${nodeName}-token`;
  const uid = (name: string) => `original-source-uid-${name}`;
  const factory = (policy: SignalFreeExecutionPolicy) => async (invocation: Invocation) => {
    await policy.assertOriginal();
    const raw = await readFile(invocation.args[invocation.args.indexOf('--request') + 1]);
    const request = JSON.parse(raw.toString());
    const reader = { pid: 2234, group: 2234, start: '101', boot: request.executor.boot };
    await policy.beforeRelease?.({ identity: reader } as ExecutionCaptureAdmission);
    const began = linuxMonotonicMs();
    const base = {
      schemaVersion: 1,
      requestSha256: sha(raw),
      executor: request.executor,
      reader,
      scopeSha256: request.scope.planSha256,
      scopeFileSha256: request.scope.sha256,
      windowStartedMs: began,
      windowDeadlineMs: Math.min(began + 45000, request.deadlineMs),
      executionAuthorized: false,
      signalsSent: false,
      cloudSubmissions: 0,
    };
    await writeFile(
      join(invocation.cwd, 'xcsh-ready.private.json'),
      JSON.stringify({ ...base, kind: 'original-xcsh-creation-ready' }),
      { mode: 0o400, flag: 'wx' },
    );
    await Bun.sleep(50);
    const receipts = request.scope.targets.map((target: { name: string }, index: number) => ({
      schema_version: 1,
      scope_sha256: request.scope.planSha256,
      scope_file_sha256: request.scope.sha256,
      target,
      nonce: String(index + 1).padStart(32, '0'),
      creation_identity_sha256: sha(uid(target.name)),
      process: {
        pid: 3334,
        parent_pid: request.executor.pid,
        start_ticks: '102',
        boot_id_sha256: sha(`${request.executor.boot}\n`),
        executable_sha256: request.executables.xcsh.sha256,
        executable_device: 1,
        executable_inode: 2,
      },
    }));
    await writeFile(
      join(invocation.cwd, 'xcsh-result.private.json'),
      JSON.stringify({
        ...base,
        kind: 'original-xcsh-creation-result',
        finishedMs: linuxMonotonicMs(),
        complete: true,
        targetCount: receipts.length,
        witnessCount: 1,
        incompletePids: [],
        receipts,
      }),
      { mode: 0o400, flag: 'wx' },
    );
    const now = linuxMonotonicMs();
    await policy.finalCapture({
      identity: reader,
      pid: reader.pid,
      submitted: true,
      actualExitCode: 0,
      originalGroupClosed: true,
      signalsSent: false,
      originalDeadlineMs: policy.originalDeadlineMs,
      invocationStartedMs: began,
      finalStartedMs: now,
      finalDeadlineMs: now + 300000,
      finishedMs: now,
      stdoutPath: join(invocation.cwd, 'out'),
      stderrPath: join(invocation.cwd, 'err'),
    });
    return { code: 0, stdout: '' };
  };
  const reader = await openInstalledXcshCreationReader(context, admission, packet, { executorFactory: factory });
  try {
    await reader.ready;
    const result = await reader.completed;
    const targets = result.targetCount;
    const labels = { 'xcsh-deployment': context.owner.deploymentId, 'xcsh-engine': 'terraform' };
    const site = {
      metadata: { name: siteName, namespace: 'system', labels: { ...labels, 'ves.io/provider': 'ves-io-GOOGLE' } },
      system_metadata: { uid: uid(siteName) },
      spec: { gcp: { not_managed: { node_list: [] } }, ...siteSpec },
    };
    const token = {
      metadata: { name: tokenName, namespace: 'system', labels: { ...labels, 'xcsh-node': nodeName } },
      system_metadata: { uid: uid(tokenName) },
      spec: { site_name: siteName, type: 1, content: jwt },
    };
    let reads = 0;
    const observation = await openOriginalGcpBootstrapObservation(
      {
        store,
        origin: context.environment.XCSH_API_URL,
        credential: context.environment.XCSH_API_TOKEN,
        targets: [
          { type_name: 'xcsh_securemesh_site_v2', namespace: 'system', name: siteName },
          { type_name: 'xcsh_token', namespace: 'system', name: tokenName },
        ],
        assertOriginal: context.assertInputs,
      },
      {
        fetcher: async (url) => {
          reads++;
          return Response.json(String(url).includes('/tokens/') ? token : site);
        },
      },
    );
    const readBody = async (type: 'xcsh_securemesh_site_v2' | 'xcsh_token', name: string) => {
      const body = await observation.read({ type_name: type, namespace: 'system', name });
      if (!body) throw new Error('Original source body unavailable');
      return joinOriginalXcshCreationBody({
        context,
        packet,
        result,
        platform: originalGcpBootstrapSource,
        body,
        target: { type_name: type, namespace: 'system', name },
      });
    };
    const value = await collectOriginalGcpPreapplyBootstrap({
      site: await readBody('xcsh_securemesh_site_v2', siteName),
      token: await readBody('xcsh_token', tokenName),
      platform: originalGcpBootstrapSource,
      binding: { owner: context.owner, deploymentName: context.owner.deploymentId, siteName, nodeName, tokenName },
    });
    return {
      value,
      targets,
      retain(label: string, outcome: 'success' | 'failure') {
        return retainOwnedTestCapture(store.directory, label, outcome);
      },
      site,
      token,
      readCount: () => reads,
      finalSiteInput(callback: OriginalApplyCallbackContext) {
        return {
          context,
          packet,
          result,
          callback,
          observation,
          platform: originalGcpBootstrapSource,
          target: { type_name: 'xcsh_securemesh_site_v2' as const, namespace: 'system' as const, name: siteName },
        };
      },
      async refreshFinal(callback: OriginalApplyCallbackContext) {
        const { joinOriginalFinalXcshCreationBody } = await import('../../src/xcsh-creation-body');
        const read = (type_name: 'xcsh_securemesh_site_v2' | 'xcsh_token', name: string) =>
          joinOriginalFinalXcshCreationBody({
            context,
            packet,
            result,
            callback,
            platform: originalGcpBootstrapSource,
            observation,
            target: { type_name, namespace: 'system', name },
          });
        return collectOriginalGcpPreapplyBootstrap({
          site: await read('xcsh_securemesh_site_v2', siteName),
          token: await read('xcsh_token', tokenName),
          platform: originalGcpBootstrapSource,
          binding: { owner: context.owner, deploymentName: context.owner.deploymentId, siteName, nodeName, tokenName },
        });
      },
      async close() {
        await observation.close();
        await reader.closeAfterExecutorExit();
        closePreparedCreationScope(packet);
      },
    };
  } catch (error) {
    await reader.closeAfterExecutorExit();
    closePreparedCreationScope(packet);
    throw error;
  }
}
