export type ErrorCategory = 'validation' | 'unsafe_input' | 'signature' | 'conversion' | 'contract' | 'output' | 'io';

export class MigrationError extends Error {
  constructor(
    public readonly category: ErrorCategory,
    message: string,
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}

export interface Violation {
  identifier: string;
  alarm: boolean;
  block: boolean;
}
export interface UrlDefinition {
  name: string;
  allowed: boolean;
  checkSignatures: boolean;
  methods: string[];
}
export interface ParameterDefinition {
  name: string;
  location: string;
  url?: string;
  minimumValue?: number;
  maximumValue?: number;
  maximumLength?: number;
  checkSignatures: boolean;
}
export interface NamedControl {
  name: string;
  mandatory: boolean;
  checkSignatures: boolean;
}
export interface SignatureOverride {
  contextType: 'global' | 'url' | 'parameter' | 'header' | 'cookie';
  contextName: string;
  disabledAsmIds: number[];
  disableAll: boolean;
  scopeUrl?: string;
}
export interface AsmPolicy {
  sourceName: string;
  enforcementMode: 'blocking' | 'transparent';
  violations: Violation[];
  urls: UrlDefinition[];
  methods: string[];
  headers: NamedControl[];
  modifiedCookies: NamedControl[];
  parameters: ParameterDefinition[];
  disallowedFileTypes: string[];
  allowedResponseCodes: number[];
  trustedClients: string[];
  blockedClients: string[];
  signatureOverrides: SignatureOverride[];
  customResponse?: { body: string; status: number };
  unsupportedEnabledFeatures: string[];
}
export interface SignatureDatabase {
  schema_version: 'asm-migration.signatures/v1';
  signatures: Array<{ asm_id: number; xc_id: number; name?: string }>;
}
export interface ContractIdentity {
  repository: string;
  commit: string;
  source_spec_sha256: string;
  catalog_sha256: string;
  bundle_sha256: string;
}
export interface ContractIssue {
  resource_index?: number;
  kind?: string;
  path: string;
  message: string;
}
export interface ContractReport {
  valid: boolean;
  contract: ContractIdentity;
  resource_count: number;
  validated_resource_count: number;
  issues: ContractIssue[];
}
export interface Resource {
  kind: 'app_firewall' | 'service_policy' | 'service_policy_rule' | 'ip_prefix_set';
  metadata: {
    name: string;
    namespace: string;
    labels?: Record<string, string>;
    description?: string;
    disable?: boolean;
  };
  spec: Record<string, unknown>;
}
export interface ConfigPack {
  schema_version: 'asm-migration.config-pack/v1';
  resources: Resource[];
}
export interface ConversionWarning {
  code: string;
  message: string;
  source_path?: string;
  blocking?: boolean;
}
export interface ConversionResult {
  configPack: ConfigPack;
  warnings: ConversionWarning[];
  report: {
    complete: boolean;
    resource_counts: Record<string, number>;
    warning_count: number;
    contract: ContractIdentity;
    contract_valid: boolean;
  };
  inputHashes: Record<string, string>;
}
export interface ValidateRequest {
  inputPath: string;
  inputType: 'asm-policy' | 'config-pack';
  cwd: string;
  signal?: AbortSignal;
}
export interface ConvertRequest {
  policyPath: string;
  signaturesPath: string;
  namespace: string;
  outputDirectory: string;
  targetName?: string;
  allowPartial?: boolean;
  overwrite?: boolean;
  cwd: string;
  signal?: AbortSignal;
}
export interface ValidateResponse {
  valid: boolean;
  inputType: 'asm-policy' | 'config-pack';
  policy?: { sourceName: string; enforcementMode: 'blocking' | 'transparent'; unsupportedEnabledFeatures: string[] };
  contract?: ContractReport;
}
export interface ConvertResponse {
  complete: boolean;
  resourceCounts: Record<string, number>;
  warnings: ConversionWarning[];
  contract: ContractIdentity;
  outputFiles: string[];
  outputDirectory: string;
}
