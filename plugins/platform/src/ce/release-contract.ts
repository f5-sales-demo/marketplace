import { loadPublishedCeApi } from './verified-api-release';

type Json = Record<string, unknown>;
export interface Smsv2PublishedSchemaContract {
  release: 'v7.0.1';
  identity: 'f5xc-published-api-schema/v7.0.1';
  namespace: 'system';
  createPath: '/api/config/namespaces/{metadata.namespace}/securemesh_site_v2s';
  replacePath: '/api/config/namespaces/{metadata.namespace}/securemesh_site_v2s/{metadata.name}';
  readPath: '/api/config/namespaces/{namespace}/securemesh_site_v2s/{name}';
  deletePath: '/api/config/namespaces/{namespace}/securemesh_site_v2s/{name}';
  bootstrapPath: '/api/register/namespaces/system/get-cloud-init-config';
  schemaSupport: ReadonlyArray<'create' | 'read' | 'replace' | 'delete' | 'cloud-init'>;
  executableCapabilities: {
    awsCreate: 'unavailable';
    azureCreate: 'unavailable';
    headlessBootstrap: 'unavailable';
    runtimeStatus: 'unavailable';
    routing: 'unavailable';
  };
}

export type PublishedApiLoader = (signal?: AbortSignal) => Promise<Json>;
const object = (value: unknown, label: string): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`Published CE API schema ${label} is malformed`);
  return value as Json;
};
const operation = (paths: Json, path: string, method: string): Json =>
  object(object(paths[path], path)[method], `${method.toUpperCase()} ${path}`);

function requestRef(operationValue: Json): string {
  const body = object(operationValue.requestBody, 'request body');
  const content = object(body.content, 'request content');
  const request = object(content['application/json'], 'JSON request');
  return String(object(request.schema, 'request schema').$ref);
}

function pathParameters(operationValue: Json): string[] {
  if (!Array.isArray(operationValue.parameters)) throw new Error('Published CE API schema parameters are unavailable');
  const parameters = operationValue.parameters.map((value) => {
    const parameter = object(value, 'parameter');
    if (!['path', 'query'].includes(String(parameter.in)) || typeof parameter.name !== 'string')
      throw new Error('Published CE API operation parameter is unsupported');
    if (parameter.in === 'path' && parameter.required !== true)
      throw new Error('Published CE API path parameter is unsupported');
    return parameter;
  });
  return parameters.filter((parameter) => parameter.in === 'path').map((parameter) => String(parameter.name));
}

/** Verify schema support from the immutable enriched API release. Runtime capability remains a separate contract. */
export async function resolveSmsv2PublishedSchemaContract(
  loadApi: PublishedApiLoader = (signal) => loadPublishedCeApi(fetch, signal),
  signal?: AbortSignal,
): Promise<Smsv2PublishedSchemaContract> {
  signal?.throwIfAborted();
  const api = await loadApi(signal);
  signal?.throwIfAborted();
  const paths = object(api.paths, 'paths');
  const createPath = '/api/config/namespaces/{metadata.namespace}/securemesh_site_v2s' as const;
  const replacePath = '/api/config/namespaces/{metadata.namespace}/securemesh_site_v2s/{metadata.name}' as const;
  const readPath = '/api/config/namespaces/{namespace}/securemesh_site_v2s/{name}' as const;
  const bootstrapPath = '/api/register/namespaces/system/get-cloud-init-config' as const;
  const create = operation(paths, createPath, 'post');
  const replace = operation(paths, replacePath, 'put');
  const read = operation(paths, readPath, 'get');
  const remove = operation(paths, readPath, 'delete');
  const bootstrap = operation(paths, bootstrapPath, 'get');
  const bootstrapParameters = Array.isArray(bootstrap.parameters)
    ? bootstrap.parameters.map((value) => object(value, 'bootstrap parameter'))
    : [];
  const responses = object(bootstrap.responses, 'bootstrap responses');
  const response = object(object(responses['200'], 'bootstrap response').content, 'bootstrap content');
  const jsonResponse = object(response['application/json'], 'bootstrap JSON');
  const responseRef = object(jsonResponse.schema, 'bootstrap response schema').$ref;
  if (
    requestRef(create) !== '#/components/schemas/securemesh_site_v2CreateRequest' ||
    requestRef(replace) !== '#/components/schemas/securemesh_site_v2ReplaceRequest' ||
    pathParameters(create).join(',') !== 'metadata.namespace' ||
    pathParameters(replace).join(',') !== 'metadata.namespace,metadata.name' ||
    pathParameters(read).join(',') !== 'namespace,name' ||
    pathParameters(remove).join(',') !== 'namespace,name' ||
    !['provider', 'site_name', 'enable_management_network'].every((name) =>
      bootstrapParameters.some((parameter) => parameter.name === name && parameter.in === 'query'),
    ) ||
    responseRef !== '#/components/schemas/tokenGetCloudInitConfigResp'
  )
    throw new Error('Published CE API schema request/response mapping is unsupported');
  return {
    release: 'v7.0.1',
    identity: 'f5xc-published-api-schema/v7.0.1',
    namespace: 'system',
    createPath,
    replacePath,
    readPath,
    deletePath: readPath,
    bootstrapPath,
    schemaSupport: ['create', 'read', 'replace', 'delete', 'cloud-init'],
    executableCapabilities: {
      awsCreate: 'unavailable',
      azureCreate: 'unavailable',
      headlessBootstrap: 'unavailable',
      runtimeStatus: 'unavailable',
      routing: 'unavailable',
    },
  };
}
