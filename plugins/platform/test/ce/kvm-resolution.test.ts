import { describe, expect, it } from 'bun:test';
import { parseKvmImageResolution } from '../../src/ce/release-contract';

const operation = {
  operationId: 'ves.io.schema.virtual_appliance.SoftwareVersionOsImageCustomApi.GetImage',
  requestBody: {
    required: true,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/virtual_applianceGetImageRequest' } } },
  },
  responses: {
    '200': {
      content: { 'application/json': { schema: { $ref: '#/components/schemas/virtual_applianceGetImageResponse' } } },
    },
  },
};
const request = {
  properties: {
    uids: {
      type: 'array',
      uniqueItems: true,
      minItems: 1,
      items: { type: 'string' },
      description:
        'Observed Site object UIDs from the system Site collection. For SMSv2 select owner_view.kind equal to securemesh_site_v2 and join owner_view.uid to the exact Secure Mesh Site v2 configuration UID.',
    },
  },
};
const response = {
  properties: {
    images: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          download_image_link: { type: 'string', format: 'uri' },
          image_md5_sum: { type: 'string', pattern: '^[0-9a-fA-F]{32}$' },
          error_description: { type: 'string' },
        },
      },
    },
  },
};
const document = {
  paths: {
    '/api/maurice/software_os_version': { post: operation },
    '/api/register/namespaces/system/get-image-download-url': {
      post: { operationId: 'ves.io.schema.registration.CustomAPI.GetImageDownloadUrl' },
    },
  },
  components: { schemas: { virtual_applianceGetImageRequest: request, virtual_applianceGetImageResponse: response } },
};

describe('published KVM image resolution contract', () => {
  it('selects the Site UID endpoint and ignores the retained legacy endpoint', () => {
    const result = parseKvmImageResolution(document);
    expect(result.endpoint).toBe('/api/maurice/software_os_version');
    expect(result.ownerJoin).toEqual({
      namespace: 'system',
      namedConfiguration: 'exactly_one',
      ownerKind: 'securemesh_site_v2',
      cardinality: 'exactly_one',
      uidSource: 'site_object',
    });
    expect(result.validation).toEqual([
      'exact_site_uid_mapping',
      'empty_error_description',
      'https_image_url',
      'md5_checksum',
      'ownership_recheck',
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /get-image-download-url|maurice_config_cardinality_exactly_one|external_tenant_prerequisite/,
    );
  });

  it.each([
    [
      'missing owner join',
      { ...request, properties: { uids: { ...request.properties.uids, description: 'Some IDs' } } },
      response,
    ],
    [
      'nonunique UID request',
      { ...request, properties: { uids: { ...request.properties.uids, uniqueItems: false } } },
      response,
    ],
    [
      'missing MD5',
      request,
      {
        properties: {
          images: {
            ...response.properties.images,
            additionalProperties: {
              type: 'object',
              properties: {
                download_image_link: { type: 'string', format: 'uri' },
                error_description: { type: 'string' },
              },
            },
          },
        },
      },
    ],
    [
      'non-URI image',
      request,
      {
        properties: {
          images: {
            ...response.properties.images,
            additionalProperties: {
              type: 'object',
              properties: {
                ...response.properties.images.additionalProperties.properties,
                download_image_link: { type: 'string' },
              },
            },
          },
        },
      },
    ],
  ])('rejects %s', (_label, requestSchema, responseSchema) => {
    expect(() =>
      parseKvmImageResolution({
        ...document,
        components: {
          schemas: {
            virtual_applianceGetImageRequest: requestSchema,
            virtual_applianceGetImageResponse: responseSchema,
          },
        },
      }),
    ).toThrow(/KVM image resolution/);
  });
});
