import { assertOriginalApplyLifetime, type OriginalApplyCallbackContext } from './installed-apply-controller';
import { assertOriginalInstalledGuestRoundWorker, collectInstalledOriginalGuestRound } from './installed-guest-worker';
import { linuxMonotonicMs } from './linux-clock';

export interface InstalledBeforeGuestRoundSlot {
  nodeName: string;
  worker?: unknown;
  round?: Promise<unknown>;
  roundActive?: boolean;
  nextRoundAtMs?: number;
  failure?: unknown;
}

/** Compiled factory scheduling only. Worker provenance, original lifetime and
 * round framing remain checked by their actual issuers. This does not establish
 * guest/bootstrap acceptance or substitute another worker after a failure. */
export async function scheduleInstalledBeforeGuestRound(
  slot: InstalledBeforeGuestRoundSlot,
  callback: OriginalApplyCallbackContext,
  persist: (event: Record<string, unknown>) => Promise<void>,
): Promise<boolean> {
  await assertOriginalApplyLifetime(callback);
  if (
    slot.failure ||
    slot.roundActive ||
    !slot.worker ||
    (slot.nextRoundAtMs !== undefined && linuxMonotonicMs() < slot.nextRoundAtMs)
  )
    return false;
  const worker = slot.worker,
    nodeName = slot.nodeName;
  await assertOriginalInstalledGuestRoundWorker(worker, callback.original, nodeName);
  if (slot.worker !== worker || slot.nodeName !== nodeName)
    throw new Error('Original before guest dispatch worker changed');
  // Competing source checks may settle while the original probe is awaited.
  if (slot.failure || slot.roundActive || (slot.nextRoundAtMs !== undefined && linuxMonotonicMs() < slot.nextRoundAtMs))
    return false;
  slot.roundActive = true;
  slot.round = collectInstalledOriginalGuestRound(worker)
    .then(async (report) => {
      if (slot.worker !== worker || slot.nodeName !== nodeName)
        throw new Error('Original before guest dispatch worker changed during capture');
      slot.nextRoundAtMs = report.finishedMonotonicMs + 45000;
      await persist({ phase: 'before-guest-round', nodeName, report });
      return report;
    })
    .catch(async (error) => {
      slot.failure ??= error;
      await persist({
        phase: 'before-guest-round-refused',
        nodeName,
        errorType: error instanceof Error ? error.name : typeof error,
      });
    })
    .finally(() => {
      slot.roundActive = false;
    });
  // A persistence failure remains observable through slot.round without becoming
  // an unhandled background promise rejection or an unchanged collection retry.
  slot.round.catch((error) => {
    slot.failure ??= error;
  });
  return true;
}
