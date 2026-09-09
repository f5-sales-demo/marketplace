import { describe, expect, it } from 'bun:test';
import { resolveSmsv2PublishedSchemaContract } from '../../src/ce/release-contract';

const parameter = (name: string, where: 'path' | 'query' = 'path') => ({ name, in: where, required: where === 'path' });
const createPath = '/api/config/namespaces/{metadata.namespace}/securemesh_site_v2s';
const replacePath = '/api/config/namespaces/{metadata.namespace}/securemesh_site_v2s/{metadata.name}';
const itemPath = '/api/config/namespaces/{namespace}/securemesh_site_v2s/{name}';
const bootstrapPath = '/api/register/namespaces/system/get-cloud-init-config';
const fixture = () => ({
  paths: {
    [createPath]: {
      post: {
        parameters: [parameter('metadata.namespace')],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/securemesh_site_v2CreateRequest' } } },
        },
      },
    },
    [replacePath]: {
      put: {
        parameters: [parameter('metadata.namespace'), parameter('metadata.name')],
        requestBody: {
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/securemesh_site_v2ReplaceRequest' } },
          },
        },
      },
    },
    [itemPath]: {
      get: { parameters: [parameter('namespace'), parameter('name')] },
      delete: { parameters: [parameter('namespace'), parameter('name')] },
    },
    [bootstrapPath]: {
      get: {
        parameters: [
          parameter('provider', 'query'),
          parameter('site_name', 'query'),
          parameter('enable_management_network', 'query'),
        ],
        responses: {
          '200': {
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/tokenGetCloudInitConfigResp' } },
            },
          },
        },
      },
    },
  },
});

describe('published SMSv2 schema resolver', () => {
  it('separates immutable v6.1.2 schema support from unavailable executable capabilities', async () => {
    await expect(resolveSmsv2PublishedSchemaContract(async () => fixture())).resolves.toEqual({
      release: 'v6.1.2',
      identity: 'f5xc-published-api-schema/v6.1.2',
      namespace: 'system',
      createPath: '/api/config/namespaces/{metadata.namespace}/securemesh_site_v2s',
      replacePath: '/api/config/namespaces/{metadata.namespace}/securemesh_site_v2s/{metadata.name}',
      readPath: '/api/config/namespaces/{namespace}/securemesh_site_v2s/{name}',
      deletePath: '/api/config/namespaces/{namespace}/securemesh_site_v2s/{name}',
      bootstrapPath: '/api/register/namespaces/system/get-cloud-init-config',
      schemaSupport: ['create', 'read', 'replace', 'delete', 'cloud-init'],
      executableCapabilities: {
        awsCreate: 'unavailable',
        azureCreate: 'unavailable',
        headlessBootstrap: 'unavailable',
        runtimeStatus: 'unavailable',
        routing: 'unavailable',
      },
    });
  });

  it.each([
    [
      'missing create operation',
      (api: ReturnType<typeof fixture>) => {
        (api.paths[createPath] as { post?: unknown }).post = undefined;
      },
    ],
    [
      'wrong create request',
      (api: ReturnType<typeof fixture>) => {
        api.paths[createPath].post.requestBody.content['application/json'].schema.$ref = '#/wrong';
      },
    ],
    [
      'wrong replace path parameters',
      (api: ReturnType<typeof fixture>) => {
        api.paths[replacePath].put.parameters.reverse();
      },
    ],
    [
      'missing bootstrap query',
      (api: ReturnType<typeof fixture>) => {
        api.paths[bootstrapPath].get.parameters.pop();
      },
    ],
    [
      'wrong bootstrap response',
      (api: ReturnType<typeof fixture>) => {
        api.paths[bootstrapPath].get.responses['200'].content['application/json'].schema.$ref = '#/wrong';
      },
    ],
  ])('rejects %s', async (_label, mutate) => {
    const api = fixture();
    mutate(api);
    await expect(resolveSmsv2PublishedSchemaContract(async () => api)).rejects.toThrow(/Published CE API/);
  });

  it('propagates cancellation before schema loading', async () => {
    const control = new AbortController();
    control.abort();
    let loads = 0;
    await expect(
      resolveSmsv2PublishedSchemaContract(async () => {
        loads++;
        return fixture();
      }, control.signal),
    ).rejects.toThrow();
    expect(loads).toBe(0);
  });
});
