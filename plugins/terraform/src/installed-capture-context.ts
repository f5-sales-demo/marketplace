import { isAbsolute, resolve } from 'node:path';
import type { CeOwner } from '../../platform/src/ce/runtime';
import type { OriginalInputBinding } from './original-input-monitor';

type Inputs = Readonly<Record<string, OriginalInputBinding>>;
export interface InstalledCaptureAdmission {
  readonly owner: CeOwner;
  readonly executionDirectory: string;
  readonly budget: Readonly<{ start: number; deadline: number }>;
  readonly environment: Readonly<{
    GOOGLE_APPLICATION_CREDENTIALS: string;
    XCSH_API_URL: string;
    XCSH_API_TOKEN: string;
  }>;
  readonly inputs: Inputs;
  assertInputs(): Promise<void>;
  assertWithinDeadline(): Promise<void>;
  readProviderInputs(): Promise<Inputs>;
}
export interface InstalledCaptureContext extends InstalledCaptureAdmission {
  readonly schemaVersion: 1;
  readonly kind: 'original-installed-gcp-capture-context';
}
const fileKeys = ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'] as const;
const parentKeys = ['dev', 'ino', 'uid', 'mode'] as const;
const controls = (value: string) =>
  Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
function canonical(path: string) {
  return typeof path === 'string' && isAbsolute(path) && resolve(path) === path && !controls(path);
}
/** Copy admitted identities only. Filesystem admission and lifetime verification belong to the original monitors. */
export function freezeAdmittedCaptureInputs(input: Inputs): Inputs {
  if (!input || typeof input !== 'object' || !Object.keys(input).length)
    throw new Error('Original admitted capture inputs required');
  const paths = new Set<string>();
  const output: Record<string, OriginalInputBinding> = {};
  for (const name of Object.keys(input).sort()) {
    const binding = input[name];
    if (
      !binding ||
      !canonical(binding.path) ||
      !/^[a-f0-9]{64}$/.test(binding.sha256) ||
      paths.has(binding.path) ||
      !binding.expectedIdentity ||
      !binding.expectedParentIdentity ||
      fileKeys.some(
        (key) =>
          typeof binding.expectedIdentity?.[key] !== 'string' ||
          !/^(?:0|[1-9][0-9]*)$/.test(binding.expectedIdentity[key]),
      ) ||
      parentKeys.some(
        (key) =>
          typeof binding.expectedParentIdentity?.[key] !== 'string' ||
          !/^(?:0|[1-9][0-9]*)$/.test(binding.expectedParentIdentity[key]),
      )
    )
      throw new Error('Exact admitted capture file and parent identities required');
    paths.add(binding.path);
    output[name] = Object.freeze({
      path: binding.path,
      sha256: binding.sha256,
      expectedIdentity: Object.freeze({ ...binding.expectedIdentity }),
      expectedParentIdentity: Object.freeze({ ...binding.expectedParentIdentity }),
    });
  }
  return Object.freeze(output);
}
/** Source-owned callback context; serializing it cannot grant capture or execution authority. */
export function createInstalledCaptureContext(admission: InstalledCaptureAdmission): InstalledCaptureContext {
  if (
    admission?.owner?.provider !== 'gcp' ||
    admission.owner.engine !== 'terraform' ||
    !canonical(admission.executionDirectory) ||
    !Number.isSafeInteger(admission.budget?.start) ||
    admission.budget.start < 0 ||
    !Number.isSafeInteger(admission.budget.deadline) ||
    admission.budget.deadline - admission.budget.start !== 7200000 ||
    typeof admission.assertInputs !== 'function' ||
    typeof admission.assertWithinDeadline !== 'function' ||
    typeof admission.readProviderInputs !== 'function'
  )
    throw new Error('Trusted original GCP capture admission required');
  const inputs = freezeAdmittedCaptureInputs(admission.inputs);
  const environment = Object.freeze({ ...admission.environment });
  if (
    !inputs.adc ||
    !inputs.platform ||
    environment.GOOGLE_APPLICATION_CREDENTIALS !== inputs.adc.path ||
    typeof environment.XCSH_API_TOKEN !== 'string' ||
    !environment.XCSH_API_TOKEN ||
    controls(environment.XCSH_API_TOKEN)
  )
    throw new Error('Original capture credential bindings required');
  const url = new URL(environment.XCSH_API_URL);
  if (url.protocol !== 'https:' || url.origin !== environment.XCSH_API_URL)
    throw new Error('Original capture Platform origin required');
  const assertInputs = admission.assertInputs,
    assertWithinDeadline = admission.assertWithinDeadline,
    readProviders = admission.readProviderInputs;
  let originalProviders: Inputs | undefined;
  return Object.freeze({
    schemaVersion: 1,
    kind: 'original-installed-gcp-capture-context',
    owner: Object.freeze(structuredClone(admission.owner)),
    executionDirectory: admission.executionDirectory,
    budget: Object.freeze({ ...admission.budget }),
    environment,
    inputs,
    assertInputs,
    assertWithinDeadline,
    async readProviderInputs() {
      await assertInputs();
      const current = freezeAdmittedCaptureInputs(await readProviders());
      await assertInputs();
      if (originalProviders && JSON.stringify(current) !== JSON.stringify(originalProviders))
        throw new Error('Original capture provider admission changed');
      originalProviders ??= current;
      return originalProviders;
    },
  });
}
