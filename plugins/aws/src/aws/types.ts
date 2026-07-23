export interface AwsIdentity {
  Account: string;
  Arn: string;
  UserId: string;
}

export interface AwsBucket {
  name: string;
  creationDate: string;
}

export interface AwsS3Object {
  key: string;
  size: number;
  lastModified: string;
}

export interface AwsEc2Instance {
  instanceId: string;
  state: string;
  type: string;
  az: string;
  privateIp: string;
  publicIp: string;
  name: string;
}

export interface AwsRawResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface PluginInterface {
  typebox: { Type: Record<string, (...args: unknown[]) => unknown> };
  [key: string]: unknown;
}

export const INSTANCE_ID_PATTERN = /^i-[0-9a-f]{8,17}$/;
export const REGION_PATTERN = /^[a-z]{2}-[a-z]+-\d$/;
export const S3_URI_PATTERN = /^s3:\/\/[a-z0-9./-]+$/;
// Require a non-dash first character so a value like `--profile -foo` (which would
// otherwise pass the charset check) cannot be a leading dash and be mistaken for a
// flag. Subsequent characters may still include a dash.
export const RESOURCE_NAME_PATTERN = /^[A-Za-z0-9._:/][A-Za-z0-9._:/-]*$/;
// Allow digits (ec2, s3, s3api, route53, ec2-instance-connect) but never as the
// first character, keeping the pattern strict.
export const HELP_PATH_PATTERN = /^[a-z][a-z0-9 -]*$/;
