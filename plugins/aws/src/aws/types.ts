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
export const RESOURCE_NAME_PATTERN = /^[a-zA-Z0-9._:/-]+$/;
export const HELP_PATH_PATTERN = /^[a-z][a-z -]*$/;
