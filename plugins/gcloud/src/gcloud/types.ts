export interface GcloudConfig {
  project: string;
  account: string;
  region: string;
  zone: string;
}

export interface GcloudProject {
  projectId: string;
  name: string;
  projectNumber: string;
  lifecycleState: string;
}

export interface GcloudInstance {
  name: string;
  zone: string;
  machineType: string;
  status: string;
  internalIp: string;
  externalIp: string;
}

export interface GcloudBucket {
  name: string;
  location: string;
  storageClass: string;
  created: string;
}

export interface GcloudRawResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface PluginInterface {
  typebox: { Type: Record<string, (...args: unknown[]) => unknown> };
  [key: string]: unknown;
}

export const PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
export const ZONE_PATTERN = /^[a-z]+-[a-z]+\d-[a-z]$/;
// Allow lowercase command-path segments with spaces and dashes (e.g.
// `compute instances`, `get-iam-policy`) but never a leading dash so a value
// like `-foo` cannot be mistaken for a flag.
export const HELP_PATH_PATTERN = /^[a-z][a-z0-9 -]*$/;
// Require a non-dash first character so a value like `--project -foo` (which would
// otherwise pass the charset check) cannot be a leading dash and be mistaken for a
// flag. Subsequent characters may still include a dash.
export const RESOURCE_NAME_PATTERN = /^[A-Za-z0-9._:/][A-Za-z0-9._:/-]*$/;
