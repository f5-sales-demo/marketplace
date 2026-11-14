import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { bindAwsCloudInit } from '../../../platform/src/ce/bootstrap';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import { type BootstrapCheckoutBinding, retireBootstrapToken } from '../../../platform/src/ce/token-store';
import type { AzExecApi } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { azureNativeNetworkScope, verifyAzureNativeNetworkProfile } from './native-network-plan';
import { verifyAzureNativeNetworkReplacementRetirementSource } from './native-network-replacement-retirement';
import { persistAzureNativeReplacementHistory } from './native-replacement-history';
import { verifyAzureNativeReplacementOriginalSource } from './native-replacement-source';
import { type AzureNativeTeardownPlan, compileAzureNativeTeardown } from './native-teardown';
import { type NativeWorkflowCheckpoint, validateAzureNativeAdmissionCheckpoint } from './native-workflow';
import { azureRelayResourceSource } from './relay-replacement-plan';
import { observeAzureNativeRetirementAbsence } from './relay-retirement';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

type Json = Record<string, unknown>;
interface Item {
  name: string;
  sha256: string;
  preserve: boolean;
}
const markerName = 'azure-native-bootstrap-retirement.json';
const sha = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Malformed native bootstrap retirement evidence');
  return value as Json;
};
const optional = async (store: CeDeploymentStore, name: string) => {
  try {
    return await store.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
};

/** Retire exact enrollment secrets. Remaining non-enrollment staging is reported and remains a separate terminal gate. */
export async function retireAzureNativeBootstrapArtifacts(
  base: AzureCePlan,
  cloud: AzureCePlan,
  teardown: AzureNativeTeardownPlan,
  runtime: Pick<CeRuntime, 'engine' | 'contract' | 'unregisteredAbsence'>,
  contract: VerifiedIngressContract,
  store: CeDeploymentStore,
  api: AzExecApi,
  signal?: AbortSignal,
) {
  const deadline = AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]);
  deadline.throwIfAborted();
  await store.verify();
  const release = await acquireProcessLock(join(store.directory, '.azure-relay-native-mutation-lock'));
  try {
    const binding = azureUpgradeBinding(base);
    if (
      canonicalSha256(compileAzureNativeTeardown(base, cloud, teardown.drain, teardown.retirement)) !==
        canonicalSha256(teardown) ||
      canonicalSha256(store.owner) !== canonicalSha256(binding.owner) ||
      canonicalSha256(await store.read(`${teardown.planId}.json`)) !== canonicalSha256(teardown)
    )
      throw Error('Native bootstrap retirement source or teardown differs');
    const authorization = object(await store.read(`${teardown.planId}-authorization.json`));
    if (
      authorization.schemaVersion !== 1 ||
      authorization.engine !== 'native' ||
      authorization.mutations !== true ||
      authorization.sourcePlanSha256 !== base.planSha256 ||
      authorization.teardownPlanSha256 !== teardown.planSha256
    )
      throw Error('Native bootstrap retirement mutation authorization differs');
    if (base.relayProfile) {
      const key = object(await store.read('azure-native-relay-key-retirement.json'));
      const { phase, checkpointSha256, ...keyDraft } = key;
      if (
        phase !== 'retired' ||
        checkpointSha256 !== canonicalSha256(keyDraft) ||
        key.sourcePlanSha256 !== base.planSha256 ||
        key.teardownPlanSha256 !== teardown.planSha256 ||
        canonicalSha256(key.owner) !== canonicalSha256(binding.owner)
      )
        throw Error('Native bootstrap retirement requires completed exact relay key retirement');
    } else if ((await optional(store, 'azure-native-relay-key-retirement.json')) !== undefined) {
      throw Error('Standard native retirement has an orphan relay key marker');
    }
    const receipt = object(await store.read('azure-native-teardown-receipt.json'));
    if (
      (await optional(store, 'relay-native-execution.json')) !== undefined ||
      receipt.status !== 'retired' ||
      receipt.sourcePlanSha256 !== base.planSha256 ||
      receipt.teardownPlanSha256 !== teardown.planSha256 ||
      receipt.cloudPlanSha256 !== cloud.planSha256 ||
      receipt.cloud !== 'absent' ||
      receipt.sites !== 'deleted'
    )
      throw Error('Native bootstrap retirement requires completed exact cloud/site/key retirement');
    const fresh = () => observeAzureNativeRetirementAbsence(base, teardown, runtime, contract, api, deadline);
    const absenceSha256 = await fresh();
    const directory = async () => {
      const stat = await lstat(store.directory);
      if (
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        stat.uid !== process.getuid?.() ||
        (await realpath(store.directory)) !== store.directory
      )
        throw Error('Native bootstrap retirement directory differs');
    };
    const bytes = async (name: string) => {
      const path = join(store.directory, name),
        stat = await lstat(path);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.nlink !== 1 ||
        stat.uid !== process.getuid?.() ||
        stat.mode & 0o077
      )
        throw Error('Native bootstrap retirement file differs');
      return readFile(path);
    };
    let marker = await optional(store, markerName);
    if (marker === undefined) {
      await directory();
      const names = (await readdir(store.directory)).sort(),
        sources = new Map([
          [base.planSha256, base],
          [cloud.planSha256, cloud],
        ]);
      for (const name of names.filter((name) => /^native-source-[a-f0-9]{64}\.json$/.test(name))) {
        const source = object(await store.read(name)) as unknown as AzureCePlan;
        verifyAzureCePlan(source);
        if (
          source.engine !== 'native' ||
          canonicalSha256(azureUpgradeBinding(source).owner) !== canonicalSha256(binding.owner) ||
          source.siteName !== base.siteName ||
          name !== `native-source-${source.planSha256}.json`
        )
          throw Error('Native source registry ownership differs');
        sources.set(source.planSha256, source);
      }
      const tokens = new Map<string, { node: string; name: string; siteName: string }>();
      for (const site of teardown.retirement)
        for (const token of site.tokens) {
          if (
            !binding.nodes.includes(token.node) ||
            site.siteName !== binding.siteName ||
            !/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(token.name) ||
            tokens.has(`${token.name}.json`)
          )
            throw Error('Native retirement token inventory differs');
          tokens.set(`${token.name}.json`, { ...token, siteName: site.siteName });
        }
      const selected = names.filter(
        (name) =>
          name.startsWith('native-admission-') ||
          tokens.has(name) ||
          /^bootstrap-checkout-[a-f0-9-]{36}\.json$/.test(name),
      );
      const items: Item[] = [],
        parsed = new Map<string, Json>();
      for (const name of selected) {
        deadline.throwIfAborted();
        const raw = await bytes(name);
        let value: Json;
        try {
          value = object(JSON.parse(raw.toString()));
        } catch {
          throw Error('Malformed native enrollment staging');
        }
        parsed.set(name, value);
        items.push({ name, sha256: hash(raw), preserve: name.startsWith('bootstrap-checkout-') });
      }
      for (const [name, value] of parsed) {
        if (tokens.has(name)) {
          const token = tokens.get(name);
          if (
            Object.keys(value).sort().join(',') !== 'jwt,node,siteName,tokenName' ||
            value.tokenName !== token?.name ||
            value.node !== token?.node ||
            value.siteName !== token?.siteName ||
            typeof value.jwt !== 'string' ||
            !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.jwt)
          )
            throw Error('Native enrollment token binding differs');
        } else if (name.startsWith('native-admission-')) {
          const source = sources.get(String(value.planSha256));
          if (
            !source ||
            name !== `native-admission-${source.planSha256}.json` ||
            !names.includes(`native-source-${source.planSha256}.json`)
          )
            throw Error('Native admission source is unresolved');
          if (
            base.relayProfile
              ? !source.relayProfile ||
                canonicalSha256(azureRelayResourceSource(source)) !== canonicalSha256(azureRelayResourceSource(base))
              : source.relayProfile !== undefined ||
                (source.intent.operation === 'replace-node'
                  ? !object(value.replacement).originalSourcePlan ||
                    canonicalSha256(object(value.replacement).originalSourcePlan) !== canonicalSha256(base)
                  : source.intent.operation === 'update-network'
                    ? verifyAzureNativeNetworkProfile(source).originalPlanSha256 !== base.planSha256 ||
                      canonicalSha256(azureNativeNetworkScope(source, true)) !==
                        canonicalSha256(azureNativeNetworkScope(base, true)) ||
                      value.siteReserved !== false ||
                      Object.keys(object(value.bootstrapByNode)).length !== 0 ||
                      Object.keys(object(value.launchedAtByNode)).length !== 0 ||
                      value.replacement !== undefined
                    : source.planSha256 !== base.planSha256)
          )
            throw Error('Native admission original resource owner differs');
          if (!source.relayProfile && source.intent.operation === 'replace-node') {
            if (source.networkReplacementProfile)
              await verifyAzureNativeNetworkReplacementRetirementSource(
                source,
                object(value.replacement) as unknown as NonNullable<NativeWorkflowCheckpoint['replacement']>,
                store,
              );
            else verifyAzureNativeReplacementOriginalSource(source, base);
          }
          validateAzureNativeAdmissionCheckpoint(source, value as unknown as NativeWorkflowCheckpoint);
          if (
            Object.keys(value).sort().join(',') !==
            [
              'schemaVersion',
              'engine',
              'planSha256',
              'siteReserved',
              'bootstrapByNode',
              'launchedAtByNode',
              ...('replacement' in value ? ['replacement'] : []),
            ]
              .sort()
              .join(',')
          )
            throw Error('Native admission staging fields differ');
          for (const [node, material] of Object.entries(object(value.bootstrapByNode))) {
            const tokenName = `${source.deploymentName.slice(0, 40)}-${node}-${source.planSha256.slice(0, 12)}`;
            const token = parsed.get(`${tokenName}.json`);
            if (
              !token ||
              token.node !== `${source.deploymentName}-${node}` ||
              typeof token.jwt !== 'string' ||
              typeof material !== 'string'
            )
              throw Error('Native admission upstream token provenance is missing');
            bindAwsCloudInit({ cloud_init_config: material }, token.jwt);
          }
        } else {
          if (
            Object.keys(value).sort().join(',') !==
            'binding,checkout,contractFingerprint,node,owner,schemaVersion,siteUid,tokenName'
          )
            throw Error('Native opaque bootstrap checkout fields differ');
          const checkout = object(value.checkout),
            token = parsed.get(`${String(value.tokenName)}.json`);
          if (
            value.schemaVersion !== 1 ||
            canonicalSha256(value.owner) !== canonicalSha256(binding.owner) ||
            canonicalSha256(value.binding) !== canonicalSha256(binding) ||
            value.siteUid !== teardown.retirement[0].siteUid ||
            value.contractFingerprint !== teardown.drain.siteContractFingerprint ||
            !tokens.has(`${String(value.tokenName)}.json`) ||
            token?.node !== value.node ||
            typeof token?.jwt !== 'string' ||
            hash(token.jwt) !== checkout.digest ||
            name !== `bootstrap-checkout-${String(checkout.reference).split('/').at(-1)}.json`
          )
            throw Error('Native opaque bootstrap checkout binding differs');
        }
      }
      for (const [name, value] of parsed)
        if (name.startsWith('native-admission-')) {
          const source = sources.get(String(value.planSha256));
          if (source && !source.relayProfile && source.intent.operation === 'replace-node')
            await persistAzureNativeReplacementHistory(source, value as unknown as NativeWorkflowCheckpoint, store);
        }
      const draft = {
        schemaVersion: 1,
        engine: 'native',
        owner: binding.owner,
        sourcePlanSha256: base.planSha256,
        teardownPlanSha256: teardown.planSha256,
        absenceSha256,
        artifacts: items,
        inventorySha256: canonicalSha256(items),
      };
      marker = { ...draft, checkpointSha256: canonicalSha256(draft), phase: 'retiring' };
      deadline.throwIfAborted();
      await store.write(markerName, marker);
    }
    const value = object(marker),
      { phase: markerPhase, checkpointSha256: markerSha256, ...draft } = value;
    if (
      value.schemaVersion !== 1 ||
      value.engine !== 'native' ||
      canonicalSha256(value.owner) !== canonicalSha256(binding.owner) ||
      value.sourcePlanSha256 !== base.planSha256 ||
      value.teardownPlanSha256 !== teardown.planSha256 ||
      !['retiring', 'retired'].includes(String(markerPhase)) ||
      markerSha256 !== canonicalSha256(draft) ||
      !sha(value.absenceSha256) ||
      !Array.isArray(value.artifacts) ||
      value.inventorySha256 !== canonicalSha256(value.artifacts)
    )
      throw Error('Native bootstrap retirement checkpoint differs');
    const recorded = new Map<string, Item>();
    const allowedTokens = new Set(
      teardown.retirement.flatMap((site) => site.tokens.map((token) => `${token.name}.json`)),
    );
    for (const row of value.artifacts) {
      const item = object(row);
      if (
        typeof item.name !== 'string' ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(item.name) ||
        !sha(item.sha256) ||
        typeof item.preserve !== 'boolean' ||
        recorded.has(item.name) ||
        (!/^native-admission-[a-f0-9]{64}\.json$/.test(item.name) &&
          !allowedTokens.has(item.name) &&
          !/^bootstrap-checkout-[a-f0-9-]{36}\.json$/.test(item.name)) ||
        item.preserve !== item.name.startsWith('bootstrap-checkout-')
      )
        throw Error('Native bootstrap retirement inventory malformed');
      recorded.set(item.name, item as unknown as Item);
    }
    await directory();
    for (const [name, item] of recorded) {
      let raw: Buffer;
      try {
        raw = await bytes(name);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT' && !item.preserve) continue;
        throw error;
      }
      if (hash(raw) !== item.sha256 || (markerPhase === 'retired' && !item.preserve))
        throw Error('Native enrollment staging changed after retirement preflight');
    }
    // Unknown/new enrollment files cannot appear after the atomic checkpoint.
    const currentNames = await readdir(store.directory);
    const tokenNames = new Set(teardown.retirement.flatMap((site) => site.tokens.map((token) => `${token.name}.json`)));
    if (
      currentNames.some(
        (name) =>
          (name.startsWith('native-admission-') || name.startsWith('bootstrap-checkout-') || tokenNames.has(name)) &&
          !recorded.has(name),
      )
    )
      throw Error('Native enrollment staging appeared after retirement preflight');
    if (markerPhase === 'retiring') {
      for (const item of recorded.values())
        if (item.preserve) {
          await fresh();
          deadline.throwIfAborted();
          const checkout = object(await store.read(item.name)).checkout as BootstrapCheckoutBinding;
          await retireBootstrapToken(checkout, String(value.absenceSha256), deadline);
        }
      for (const item of recorded.values())
        if (!item.preserve && (await optional(store, item.name)) !== undefined) {
          await fresh();
          deadline.throwIfAborted();
          await directory();
          await store.verify();
          if (hash(await bytes(item.name)) !== item.sha256)
            throw Error('Native enrollment staging changed before deletion');
          deadline.throwIfAborted();
          await unlink(join(store.directory, item.name));
        }
      deadline.throwIfAborted();
      await store.write(markerName, { ...value, phase: 'retired' });
    }
    await fresh();
    return {
      status: 'native-bootstrap-retired' as const,
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: teardown.planSha256,
      checkpointSha256: markerSha256,
      retiredArtifacts: [...recorded.values()].filter((item) => !item.preserve).length,
      remainingStaging: (await readdir(store.directory)).filter(
        (name) => name !== markerName && name !== 'owner.json' && name !== '.azure-relay-native-mutation-lock',
      ).length,
      completeCleanup: false as const,
    };
  } finally {
    await release();
  }
}
