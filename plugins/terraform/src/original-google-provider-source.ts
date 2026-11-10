import { createHash } from 'node:crypto';
import { type GoogleProviderRpcCandidate, readOriginalGoogleProviderRpcSource } from './google-provider-lifecycle';
import { type InstalledProviderWindow, readOriginalInstalledProviderWindow } from './installed-provider-reader';
import { type InstalledGcpVersionBinding, resolveInstalledGcpVersionProfile } from './installed-version-profile';

/** Original descriptor and independent window correspondence only. Complete RPC
 * temporal lifetime, original bootstrap/audit joins and full capture remain gates.
 */
export async function corroborateOriginalGoogleRpcProvider(input: {
  rpc: GoogleProviderRpcCandidate;
  windows: readonly InstalledProviderWindow[];
  binding: InstalledGcpVersionBinding;
}) {
  const rpc = input.rpc;
  const windows = Object.freeze([...input.windows]);
  const source = readOriginalGoogleProviderRpcSource(rpc);
  const profile = resolveInstalledGcpVersionProfile(input.binding);
  if (!windows.length || new Set(windows).size !== windows.length)
    throw new Error('Original distinct provider windows required');
  const witnesses = [];
  for (const window of windows) {
    const raw = await readOriginalInstalledProviderWindow(window);
    if (
      createHash('sha256').update(raw).digest('hex') !== window.evidenceSha256 ||
      (['pid', 'group', 'start', 'boot'] as const).some((key) => source.executor[key] !== window.executor[key]) ||
      ![3, 4].includes(window.schemaVersion) ||
      !window.samplingWindowComplete ||
      window.signalsSent !== false ||
      window.cloudSubmissions !== 0 ||
      window.applyPhaseQualified !== false
    )
      throw new Error('Original executor and provider window differ');
    const matched = window.observations.filter((observation) => observation.candidate.pid === rpc.providerPid);
    if (matched.length !== 1) throw new Error('Original RPC provider window absent or ambiguous');
    const witness = matched[0];
    if (
      witness.candidate.parent !== source.executor.pid ||
      witness.candidate.group !== source.executor.group ||
      witness.candidate.boot !== source.executor.boot ||
      witness.candidate.executable_sha256 !== profile.googleProviderSha256
    )
      throw new Error('Original RPC provider incarnation differs');
    witnesses.push(witness);
  }
  const original = witnesses[0];
  for (const witness of witnesses)
    if (
      JSON.stringify(witness.candidate) !== JSON.stringify(original.candidate) ||
      JSON.stringify(witness.stderr) !== JSON.stringify(original.stderr)
    )
      throw new Error('Original RPC provider or FIFO changed between windows');
  // Recheck original files and inputs after comparing all windows. A successful
  // early read cannot excuse replacement during later corroboration.
  for (const window of windows) await readOriginalInstalledProviderWindow(window);
  readOriginalGoogleProviderRpcSource(rpc);
  return Object.freeze({
    schemaVersion: 1 as const,
    kind: 'original-descriptor-provider-correspondence' as const,
    executor: source.executor,
    providerPid: original.candidate.pid,
    providerStart: original.candidate.start,
    providerBoot: original.candidate.boot,
    providerSha256: original.candidate.executable_sha256,
    rpcRequestId: rpc.rpcRequestId,
    planSha256: rpc.planSha256,
    sourceStderrSha256: source.stderrSha256,
    sourceStderrBytes: source.stderrBytes,
    windows: Object.freeze(windows.map((window) => window.evidenceSha256)),
    descriptorSourceCorroborated: true as const,
    providerWindowCorroborated: true as const,
    providerProcessQualified: false as const,
    applyRpcQualified: false as const,
    originalInsertQualified: false as const,
  });
}
