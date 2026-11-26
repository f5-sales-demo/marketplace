import { createHash } from 'node:crypto';
import { type OriginalGoogleHttpRpcBodies, readOriginalGoogleHttpRpcSource } from './gcp-http-rpc-trace';
import {
  type OriginalGcpObserverInsertIdentity,
  readOriginalGcpObserverAuditSource,
} from './gcp-observer-insert-evidence';
import { type GoogleProviderRpcCandidate, readOriginalGoogleProviderRpcSource } from './google-provider-lifecycle';
import { assertOriginalApplyCallback, type OriginalApplyCallbackContext } from './installed-apply-controller';
import type { OriginalApplyGcpInventory } from './installed-initial-inventory';
import type { InstalledProviderWindow } from './installed-provider-reader';
import type { InstalledGcpVersionBinding } from './installed-version-profile';
import { corroborateOriginalGoogleRpcProvider } from './original-google-provider-source';
import { assertOriginalTerraformPlanProjection, type OriginalTerraformPlanProjection } from './runner';
import { readOriginalTerraformApplyHookSource, type TerraformApplyHookCandidate } from './terraform-apply-hooks';

export async function collectInstalledObserverInsertWitnesses(input: {
  identity: OriginalGcpObserverInsertIdentity;
  callback: OriginalApplyCallbackContext;
  baseline: OriginalApplyGcpInventory;
  originalPlan: OriginalTerraformPlanProjection;
  configuration: string;
  binding: InstalledGcpVersionBinding;
  providerPath: string;
  body: OriginalGoogleHttpRpcBodies;
  started: TerraformApplyHookCandidate;
  completed: TerraformApplyHookCandidate;
  rpc: GoogleProviderRpcCandidate;
  windows: readonly InstalledProviderWindow[];
}) {
  const { callback, originalPlan: plan, body, started, completed, rpc } = input;
  await assertOriginalApplyCallback(callback);
  if (callback.phase !== 'after' || !callback.reserve)
    throw new Error('Original final observer witness callback required');
  await assertOriginalTerraformPlanProjection(plan);
  const original = await readOriginalGcpObserverAuditSource(input.identity, callback, input.baseline);
  const hash = (text: string) => createHash('sha256').update(text).digest('hex');
  const expected = original.value;
  if (
    plan.directory !== callback.original.executionDirectory ||
    plan.scope.cloud !== 'gcp' ||
    plan.scope.account !== expected.project ||
    plan.terraformVersion !== input.binding.terraformVersion ||
    plan.receipt.providerLockSha256 !== input.binding.providerLockSha256 ||
    plan.receipt.planSha256 !== expected.planSha256 ||
    hash(input.configuration) !== plan.receipt.configurationSha256
  )
    throw new Error('Original observer witness plan and configuration differ');
  const uiStart = await readOriginalTerraformApplyHookSource(started);
  const uiEnd = await readOriginalTerraformApplyHookSource(completed);
  const http = await readOriginalGoogleHttpRpcSource(body);
  const lifecycle = readOriginalGoogleProviderRpcSource(rpc);
  const executor = callback.execution.identity;
  for (const value of [uiStart, uiEnd, http, lifecycle]) {
    if (
      value.directory !== plan.directory ||
      value.planSha256 !== plan.receipt.planSha256 ||
      (['pid', 'group', 'start', 'boot'] as const).some((key) => value.executor[key] !== executor[key]) ||
      value.stderrSha256 !== uiStart.stderrSha256 ||
      value.stderrBytes !== uiStart.stderrBytes
    )
      throw new Error('Original observer witness descriptor or executor differs');
  }
  if (
    uiEnd.stdoutSha256 !== uiStart.stdoutSha256 ||
    uiEnd.stdoutBytes !== uiStart.stdoutBytes ||
    http.stdoutSha256 !== uiStart.stdoutSha256 ||
    http.stdoutBytes !== uiStart.stdoutBytes ||
    started.address !== expected.address ||
    completed.address !== expected.address ||
    started.phase !== 'apply_start' ||
    completed.phase !== 'apply_complete' ||
    started.action !== 'create' ||
    completed.action !== 'create' ||
    started.resourceType !== 'google_compute_instance' ||
    completed.resourceType !== started.resourceType ||
    started.actionIndex !== completed.actionIndex ||
    completed.idKey !== 'id' ||
    completed.idValue !== `projects/${expected.project}/zones/${expected.zone}/instances/${expected.name}` ||
    body.requestBodySha256 !== expected.requestBodySha256 ||
    body.responseBodySha256 !== expected.responseBodySha256 ||
    body.requestReasonSha256 !== original.requestReasonSha256 ||
    body.planSha256 !== expected.planSha256 ||
    body.rpcRequestId !== rpc.rpcRequestId ||
    rpc.rpc !== 'ApplyResourceChange' ||
    rpc.resourceType !== 'google_compute_instance' ||
    rpc.providerPathSha256 !== hash(input.providerPath) ||
    body.receivedRecordSha256 !== rpc.receivedRecordSha256 ||
    body.servedRecordSha256 !== rpc.servedRecordSha256 ||
    uiStart.eventEpochMs > lifecycle.receivedEpochMs ||
    uiEnd.eventEpochMs < lifecycle.servedEpochMs
  )
    throw new Error('Original observer UI HTTP and RPC witness mapping differs');
  const correspondence = await corroborateOriginalGoogleRpcProvider({
    rpc,
    windows: input.windows,
    binding: input.binding,
  });
  await readOriginalGcpObserverAuditSource(input.identity, callback, input.baseline);
  await readOriginalTerraformApplyHookSource(started);
  await readOriginalTerraformApplyHookSource(completed);
  await readOriginalGoogleHttpRpcSource(body);
  readOriginalGoogleProviderRpcSource(rpc);
  await assertOriginalApplyCallback(callback);
  return Object.freeze({
    schemaVersion: 1 as const,
    kind: 'original-installed-observer-insert-witnesses' as const,
    role: 'observer' as const,
    resourceAddress: expected.address,
    planSha256: expected.planSha256,
    executor,
    uiSourceCorroborated: true as const,
    httpSourceCorroborated: true as const,
    rpcWindowTimeCorroborated: true as const,
    requestBodySha256: body.requestBodySha256,
    responseBodySha256: body.responseBodySha256,
    rpcRequestId: rpc.rpcRequestId,
    correspondence,
    originalInsertQualified: false as const,
    executionAuthorized: false as const,
  });
}
