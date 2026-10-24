import { encode, hash, type IndependentCleanupEvidence } from '../../src/cleanup-verifier-worker';
/** Synthetic retained process receipt for unit tests; never live execution evidence. */
export function independentRetirementFixture(
  bindings: Pick<
    IndependentCleanupEvidence,
    'manifestSha256' | 'evidenceSha256' | 'finalPlanSha256' | 'planReceiptSha256'
  >,
) {
  const nonce = 'e'.repeat(64);
  const independentCleanup: IndependentCleanupEvidence = {
    schemaVersion: 1,
    status: 'independently-verified',
    nonce,
    ...bindings,
    requestSha256: 'f'.repeat(64),
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:00:01.000Z',
    executorPid: 2,
    parentPid: 1,
    inputInventorySha256: 'a'.repeat(64),
    terraformExecutableSha256: 'a'.repeat(64),
    terraformExecutablePathSha256: 'a'.repeat(64),
    interpreterSha256: 'a'.repeat(64),
    workerSha256: 'a'.repeat(64),
    terraformVersion: '1.16.5',
    stateJsonSha256: 'a'.repeat(64),
    originalPlanJsonSha256: 'a'.repeat(64),
    refreshedPlanSha256: 'a'.repeat(64),
    refreshedPlanJsonSha256: 'a'.repeat(64),
    commands: [
      ['version', '-json'],
      ['show', '-json', 'saved.tfplan'],
      ['show', '-json'],
      [
        'plan',
        '-input=false',
        '-lock=true',
        '-lock-timeout=60s',
        '-refresh=true',
        `-out=independent-cleanup-${nonce}.tfplan`,
      ],
      ['show', '-json', `independent-cleanup-${nonce}.tfplan`],
    ],
  };
  return { independentCleanup, independentCleanupSha256: hash(encode(independentCleanup)) };
}
