// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun
// plugins/aws/src/aws/types.ts
var INSTANCE_ID_PATTERN = /^i-[0-9a-f]{8,17}$/;
var REGION_PATTERN = /^[a-z]{2}-[a-z]+-\d$/;
var S3_URI_PATTERN = /^s3:\/\/[a-z0-9./-]+$/;
var RESOURCE_NAME_PATTERN = /^[A-Za-z0-9._:/][A-Za-z0-9._:/-]*$/;
var HELP_PATH_PATTERN = /^[a-z][a-z0-9 -]*$/;

export { HELP_PATH_PATTERN, INSTANCE_ID_PATTERN, REGION_PATTERN, RESOURCE_NAME_PATTERN, S3_URI_PATTERN };
