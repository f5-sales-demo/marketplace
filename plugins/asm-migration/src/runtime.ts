import { createHash, randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, parse, resolve } from 'node:path';
import { contractIdentity, validateConfigPack } from './contract';
import { convert } from './converter';
import { MAX_XML_BYTES, parseAsmXml, parseSignatureDatabase } from './parser';
import type { ConversionResult, ConvertRequest, ConvertResponse, ValidateRequest, ValidateResponse } from './types';
import { MigrationError } from './types';

export const MANAGED_OUTPUT_FILES = ['config-pack.json', 'warnings.json', 'report.json', 'manifest.json'] as const;
const sha256 = (payload: Uint8Array): string => createHash('sha256').update(payload).digest('hex');

function abort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('The operation was cancelled', 'AbortError');
}

function absolute(cwd: string, value: string): string {
  return isAbsolute(value) ? resolve(value) : resolve(cwd, value);
}
export function resolveOutputDirectory(cwd: string, value: string, platform = process.platform): string {
  if (platform === 'darwin' && !isAbsolute(value) && (cwd === '/tmp' || cwd.startsWith('/tmp/'))) {
    return resolve(`/private${cwd}`, value);
  }
  return absolute(cwd, value);
}

async function read(path: string, limit?: number): Promise<Uint8Array> {
  try {
    const file = Bun.file(path);
    if (!(await file.exists())) throw new Error('not found');
    if (limit !== undefined && file.size > limit)
      throw new MigrationError('unsafe_input', `policy exceeds ${limit} byte limit`);
    return new Uint8Array(await file.arrayBuffer());
  } catch (error) {
    if (error instanceof MigrationError) throw error;
    throw new MigrationError('io', 'input file could not be read');
  }
}

function parseJson(payload: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payload));
  } catch {
    throw new MigrationError('validation', 'input is not valid UTF-8 JSON');
  }
}

export async function validateInput(request: ValidateRequest): Promise<ValidateResponse> {
  abort(request.signal);
  const inputPath = absolute(request.cwd, request.inputPath);
  const payload = await read(inputPath, request.inputType === 'asm-policy' ? MAX_XML_BYTES : undefined);
  abort(request.signal);
  if (request.inputType === 'asm-policy') {
    const policy = parseAsmXml(payload, inputPath);
    abort(request.signal);
    return {
      valid: true,
      inputType: request.inputType,
      policy: {
        sourceName: policy.sourceName,
        enforcementMode: policy.enforcementMode,
        unsupportedEnabledFeatures: policy.unsupportedEnabledFeatures,
      },
    };
  }
  const contract = validateConfigPack(parseJson(payload));
  abort(request.signal);
  return { valid: contract.valid, inputType: request.inputType, contract };
}

function assertNoSymlinkDirectory(path: string): void {
  const root = parse(path).root;
  let cursor = root;
  for (const part of path.slice(root.length).split('/').filter(Boolean)) {
    cursor = resolve(cursor, part);
    if (!existsSync(cursor)) continue;
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink())
      throw new MigrationError('output', 'output directory must not contain symlinked path components');
    if (cursor === path && !stat.isDirectory()) throw new MigrationError('output', 'output path is not a directory');
  }
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, stable(child)]),
    );
  return value;
}

export function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(stable(value), null, 2)}\n`);
}

function syncWrite(path: string, payload: Uint8Array): void {
  writeFileSync(path, payload, { mode: 0o600 });
  const descriptor = openSync(path, 'r');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

export function renderDirectory(result: ConversionResult, output: string, overwrite: boolean): void {
  const validation = validateConfigPack(result.configPack);
  if (!validation.valid)
    throw new MigrationError('contract', 'refusing to render a config pack that violates the pinned contract');
  assertNoSymlinkDirectory(output);
  mkdirSync(output, { recursive: true, mode: 0o700 });
  const existing = MANAGED_OUTPUT_FILES.filter((name) => existsSync(resolve(output, name)));
  if (existing.length && !overwrite)
    throw new MigrationError('output', `managed output already exists: ${existing.join(', ')}`);
  const documents: Record<(typeof MANAGED_OUTPUT_FILES)[number], unknown> = {
    'config-pack.json': result.configPack,
    'warnings.json': result.warnings,
    'report.json': result.report,
    'manifest.json': {
      schema_version: 'asm-migration.config-pack/v1',
      tool: { name: 'asm-migration', version: '2.0.2' },
      inputs: Object.fromEntries(Object.entries(result.inputHashes).sort(([a], [b]) => a.localeCompare(b))),
      contract: validation.contract,
      contract_validation: { valid: validation.valid, validated_resource_count: validation.validated_resource_count },
    },
  };
  const token = randomBytes(12).toString('hex');
  const staged = MANAGED_OUTPUT_FILES.map((name) => [name, resolve(output, `.${name}.${token}.tmp`)] as const);
  try {
    for (const [name, path] of staged) syncWrite(path, jsonBytes(documents[name]));
    for (const [name, path] of staged) renameSync(path, resolve(output, name));
    const directory = openSync(output, 'r');
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
  } catch {
    for (const [, path] of staged)
      try {
        rmSync(path);
      } catch {
        /* best effort */
      }
    throw new MigrationError('output', 'managed output files could not be written');
  }
}

export async function convertInput(request: ConvertRequest): Promise<ConvertResponse> {
  abort(request.signal);
  const policyPath = absolute(request.cwd, request.policyPath);
  const signaturesPath = absolute(request.cwd, request.signaturesPath);
  const outputDirectory = resolveOutputDirectory(request.cwd, request.outputDirectory);
  const policyPayload = await read(policyPath, MAX_XML_BYTES);
  abort(request.signal);
  const signaturePayload = await read(signaturesPath);
  abort(request.signal);
  const policy = parseAsmXml(policyPayload, policyPath);
  abort(request.signal);
  const signatures = parseSignatureDatabase(signaturePayload);
  abort(request.signal);
  const result = convert(policy, {
    namespace: request.namespace,
    targetName: request.targetName,
    allowPartial: request.allowPartial ?? false,
    signatures,
  });
  result.inputHashes = { policy: sha256(policyPayload), signatures: sha256(signaturePayload) };
  abort(request.signal);
  renderDirectory(result, outputDirectory, request.overwrite ?? false);
  abort(request.signal);
  return {
    complete: result.report.complete,
    resourceCounts: result.report.resource_counts,
    warnings: result.warnings,
    contract: result.report.contract,
    outputFiles: [...MANAGED_OUTPUT_FILES],
    outputDirectory,
  };
}

export { convert, mergeConfigPacks } from './converter';
export type { DeploymentAction, DeploymentReceipt, DeployRequest } from './deployment';
export { deploy } from './deployment';
export { dnsLabel, uniqueRuleNames } from './naming';
export { parseAsmXml, parseSignatureDatabase } from './parser';
export { regexForRange } from './ranges';
export type * from './types';
export { MigrationError } from './types';
export { contractIdentity, validateConfigPack };
