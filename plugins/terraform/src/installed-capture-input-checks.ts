import type { monitorOriginalInputs } from './original-input-monitor';

type OriginalMonitor = Pick<
  Awaited<ReturnType<typeof monitorOriginalInputs>>,
  'assertOriginal' | 'assertOriginalIdentity'
>;
export interface InstalledCaptureInputAdmission {
  /** Compiled source callbacks over already-admitted original storage and monitors. */
  verifyStore(): Promise<void>;
  monitors(): readonly OriginalMonitor[];
  readonly budget: Readonly<{ start: number; deadline: number }>;
  clock(): number;
}

/** Separate polling identity checks from full executable verification.
 * Admission and executor release/final capture keep full hashes; these methods
 * cannot admit files, change a budget, or grant execution/capture authority.
 */
export function createInstalledCaptureInputChecks(admission: InstalledCaptureInputAdmission) {
  if (
    typeof admission?.verifyStore !== 'function' ||
    typeof admission.monitors !== 'function' ||
    typeof admission.clock !== 'function' ||
    !Number.isSafeInteger(admission.budget?.start) ||
    admission.budget.start < 0 ||
    !Number.isSafeInteger(admission.budget.deadline) ||
    admission.budget.deadline - admission.budget.start !== 7_200_000
  )
    throw new Error('Original admitted capture input checks and budget required');
  const verifyStore = admission.verifyStore,
    readMonitors = admission.monitors,
    clock = admission.clock;
  const budget = Object.freeze({ ...admission.budget });
  const within = () => {
    const now = clock();
    if (!Number.isSafeInteger(now) || now < budget.start || now >= budget.deadline)
      throw new Error('Original installed operation budget exhausted');
  };
  const inspect = async (full: boolean) => {
    await verifyStore();
    const monitors = [...readMonitors()];
    if (
      !monitors.length ||
      new Set(monitors).size !== monitors.length ||
      monitors.some(
        (monitor) =>
          typeof monitor?.assertOriginal !== 'function' || typeof monitor.assertOriginalIdentity !== 'function',
      )
    )
      throw new Error('Original admitted input monitors required');
    for (const monitor of monitors) {
      if (full) await monitor.assertOriginal();
      else await monitor.assertOriginalIdentity();
    }
  };
  return Object.freeze({
    assertInputs: () => inspect(true),
    assertCaptureInputs: () => inspect(false),
    async assertWithinDeadline() {
      within();
      await inspect(true);
      within();
    },
    async assertCaptureWithinDeadline() {
      within();
      await inspect(false);
      within();
    },
  });
}
