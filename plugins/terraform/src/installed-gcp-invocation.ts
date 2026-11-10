import { isAbsolute, join, resolve } from 'node:path';
import { googleCredentialAlternatives } from './google-adc-session';
import type { Invocation } from './runner';

export const originalLoaderAlternatives = Object.freeze([
  'PYTHONPATH',
  'PYTHONHOME',
  'PYTHONSTARTUP',
  'PYTHONINSPECT',
  'PYTHONUSERBASE',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'DYLD_INSERT_LIBRARIES',
]);
const hostKeys = Object.freeze([
  'PATH',
  'HOME',
  'LANG',
  'LC_ALL',
  'TMPDIR',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
]);
const identityKeys = ['GOOGLE_APPLICATION_CREDENTIALS', 'XCSH_API_URL', 'XCSH_API_TOKEN'] as const;
type Environment = Record<string, string | undefined> & Record<(typeof identityKeys)[number], string>;
const canonicalPath = (value: unknown): value is string =>
  typeof value === 'string' && isAbsolute(value) && resolve(value) === value && !/[\0\r\n]/.test(value);

/** Select once from the server's host and admitted ADC/Platform identity.
 * Unknown ambient provider/CLI settings cannot become an execution capability.
 * Selection preserves the original host's proxy and certificate environment.
 */
export function selectInstalledGcpEnvironment(environment: Record<string, string | undefined>): Readonly<Environment> {
  if (
    originalLoaderAlternatives.some((key) => environment[key] !== undefined) ||
    googleCredentialAlternatives.some((key) => environment[key] !== undefined)
  )
    throw new Error('Original installed GCP loader or credential substitution refused');
  const selected = Object.fromEntries(
    [...hostKeys, ...identityKeys]
      .filter((key) => environment[key] !== undefined)
      .map((key) => [key, environment[key]]),
  ) as Environment;
  if (
    identityKeys.some((key) => typeof selected[key] !== 'string' || !selected[key]) ||
    !canonicalPath(selected.GOOGLE_APPLICATION_CREDENTIALS) ||
    !canonicalPath(selected.HOME) ||
    typeof selected.PATH !== 'string' ||
    !selected.PATH ||
    Object.values(selected).some((value) => typeof value !== 'string' || value.includes('\0'))
  )
    throw new Error('Original installed GCP host and identity environment required');
  let platform: URL;
  try {
    platform = new URL(selected.XCSH_API_URL);
  } catch {
    throw new Error('Original installed Platform environment required');
  }
  if (
    platform.protocol !== 'https:' ||
    platform.origin !== selected.XCSH_API_URL ||
    /[\r\n]/.test(selected.XCSH_API_TOKEN)
  )
    throw new Error('Original installed Platform environment required');
  return Object.freeze(selected);
}

const applyArgs = ['apply', '-input=false', '-lock=true', '-lock-timeout=60s', 'saved.tfplan'];
const planArgs = ['plan', '-input=false', '-lock=true', '-lock-timeout=60s', '-refresh=true', '-out=saved.tfplan'];
const ordinaryArgs = [
  ['version', '-json'],
  ['init', '-input=false', '-lockfile=readonly'],
  ['validate', '-json'],
  ['show', '-json', 'saved.tfplan'],
  ['show', '-json', 'terraform.tfstate'],
  ['output', '-json'],
];
const equal = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((v, i) => v === b[i]);
const actionAddress = /^-invoke=action\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*(?:\["[a-z][a-z0-9_-]*"\])?$/;
function owningArgs(args: readonly string[]) {
  if (equal(args, applyArgs) || ordinaryArgs.some((expected) => equal(args, expected)) || equal(args, planArgs)) return;
  if (
    args.length === planArgs.length + 1 &&
    equal(args.slice(0, -1), planArgs) &&
    (args.at(-1) === '-destroy' || actionAddress.test(args.at(-1) ?? ''))
  )
    return;
  throw new Error('Exact owning Terraform runner command required');
}

/** This compiled adapter receives the runner's already isolated internal controls.
 * It adds fixed tracing only to an exact original saved-plan apply. Tool arguments
 * and ambient TF variables cannot request tracing, another plan or more concurrency.
 * It does not qualify a provider, cloud insert, original controller or publication.
 */
export function createInstalledGcpInvocationCompiler(input: {
  directory: string;
  environment: Record<string, string | undefined>;
}): (request: Invocation) => Invocation {
  const directory = input.directory;
  if (!canonicalPath(directory)) throw new Error('Original installed execution directory required');
  const selected = selectInstalledGcpEnvironment({ ...input.environment });
  const internal = Object.freeze({
    TF_CLI_CONFIG_FILE: join(directory, 'deployment.tfrc'),
    TF_DATA_DIR: join(directory, '.terraform'),
    TF_IN_AUTOMATION: '1',
    TF_INPUT: '0',
    TF_WORKSPACE: 'default',
  });
  return (request) => {
    const args = [...request.args];
    const incoming = { ...request.env };
    if (request.cwd !== directory) throw new Error('Original installed execution directory changed');
    owningArgs(args);
    if (
      originalLoaderAlternatives.some((key) => incoming[key] !== undefined) ||
      googleCredentialAlternatives.some((key) => incoming[key] !== undefined)
    )
      throw new Error('Original installed GCP loader or credential substitution refused');
    if (
      identityKeys.some((key) => incoming[key] !== selected[key]) ||
      hostKeys.some((key) => incoming[key] !== undefined && incoming[key] !== selected[key])
    )
      throw new Error('Original selected installed execution environment changed');
    if (
      Object.entries(internal).some(([key, value]) => incoming[key] !== value) ||
      Object.keys(incoming).some((key) => key.startsWith('TF_') && !Object.hasOwn(internal, key))
    )
      throw new Error('Original owning runner internal environment required');
    const tracing = args[0] === 'apply';
    return {
      cwd: directory,
      args: tracing ? ['apply', '-json', '-parallelism=1', ...args.slice(1)] : args,
      env: { ...selected, ...internal, ...(tracing ? { TF_LOG: 'JSON' } : {}) },
      ...(request.signal ? { signal: request.signal } : {}),
    };
  };
}
