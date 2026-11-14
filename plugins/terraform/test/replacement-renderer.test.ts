import { expect, test } from 'bun:test';
import { renderVerifiedReplacementResource, verifiedReplacementProjection } from '../src/replacement-renderer';
import { renderProviderResource } from '../src/resource-renderer';
import fixture from './fixtures/securemesh-replacement.json';
import schema from './fixtures/securemesh-replacement-provider-schema.json';

type Interface = {
  name: string;
  ethernet_interface: { device: string; mac: string };
  network_option: Record<string, unknown>;
  is_primary?: unknown;
  is_management?: unknown;
  mtu?: unknown;
};
type Site = Record<string, unknown> & {
  metadata: { name: string; namespace: string; labels?: Record<string, string> };
  system_metadata?: { uid?: string };
  resource_version?: string;
  spec: Record<string, unknown> & {
    aws: { not_managed: { node_list: Array<{ hostname: string; interface_list: Interface[] }> } };
  };
};
type RenderedInterface = { is_primary?: boolean; is_management?: boolean; ethernet_interface: unknown; mtu?: number };
type RenderedResource = {
  aws: Array<{ not_managed: Array<{ node_list: Array<{ interface_list: RenderedInterface[] }> }> }>;
};
const renderedInterfaces = (value: unknown) =>
  (value as RenderedResource).aws[0].not_managed[0].node_list[0].interface_list;

const values = () => structuredClone(fixture) as unknown as { request: Site; observed: Site };
const nodes = (value: Site) => value.spec.aws.not_managed.node_list;
const iface = (value: Site) => nodes(value)[0].interface_list[0];
const render = (request: Site, observed: Site, resourceSchema: unknown = schema) =>
  renderVerifiedReplacementResource(request, observed, resourceSchema, 'xcsh_securemesh_site_v2');

test('exact installed schema accepts verified replacement while original renderer rejects it', () => {
  const { request, observed } = values();
  const input = structuredClone(request);
  expect(() => renderProviderResource(request, schema, 'xcsh_securemesh_site_v2')).toThrow(
    'Read-only provider input: is_primary',
  );
  const result = render(request, observed);
  const interfaces = renderedInterfaces(result);
  expect(interfaces).toHaveLength(2);
  expect(interfaces[0].is_primary).toBeUndefined();
  expect(interfaces[0].is_management).toBeUndefined();
  expect(interfaces[0].ethernet_interface).toEqual([iface(request).ethernet_interface]);
  expect(request).toEqual(input);
});

test('writable interface changes remain in the saved configuration', () => {
  const { request, observed } = values();
  iface(request).mtu = 1600;
  const result = render(request, observed);
  expect(renderedInterfaces(result)[0].mtu).toBe(1600);
});

test('foreign site identity cannot authorize computed flag projection', () => {
  for (const change of [
    (v: Site) => {
      v.metadata.name = 'foreign';
    },
    (v: Site) => {
      v.metadata.namespace = 'example-namespace';
    },
    (v: Site) => {
      if (v.system_metadata) delete v.system_metadata.uid;
    },
  ]) {
    const { request, observed } = values();
    change(observed);
    expect(() => render(request, observed)).toThrow('identity');
  }
});

test('state drift, missing state and malformed state fail before rendering', () => {
  for (const value of ['opposite', undefined, null, 'true']) {
    const { request, observed } = values();
    iface(observed).is_primary = value === 'opposite' ? !iface(request).is_primary : value;
    expect(() => render(request, observed)).toThrow('state differs');
  }
  const { request, observed } = values();
  iface(request).is_management = null;
  expect(() => render(request, observed)).toThrow('state differs');
});

test('node, device, MAC, name and role substitutions are rejected', () => {
  for (const change of [
    (v: Site) => {
      nodes(v)[0].hostname = 'foreign';
    },
    (v: Site) => {
      iface(v).ethernet_interface.device = 'foreign';
    },
    (v: Site) => {
      iface(v).ethernet_interface.mac = '02:00:00:00:99:99';
    },
    (v: Site) => {
      iface(v).name = 'foreign';
    },
    (v: Site) => {
      iface(v).network_option = { site_local_inside_network: {} };
    },
  ]) {
    const { request, observed } = values();
    change(observed);
    expect(() => render(request, observed)).toThrow();
  }
});

test('partial and duplicate observations cannot satisfy the identity join', () => {
  for (const change of [
    (v: Site) => {
      nodes(v)[0].interface_list.pop();
    },
    (v: Site) => {
      nodes(v)[0].interface_list[1] = structuredClone(iface(v));
    },
    (v: Site) => {
      nodes(v).push(structuredClone(nodes(v)[0]));
    },
  ]) {
    const { request, observed } = values();
    change(observed);
    expect(() => render(request, observed)).toThrow();
  }
});

test('duplicate requested MAC, device and node identities remain rejected', () => {
  for (const change of [
    (v: Site) => {
      nodes(v)[0].interface_list[1].ethernet_interface.mac = iface(v).ethernet_interface.mac;
    },
    (v: Site) => {
      nodes(v)[0].interface_list[1].ethernet_interface.device = iface(v).ethernet_interface.device;
    },
    (v: Site) => {
      nodes(v).push(structuredClone(nodes(v)[0]));
    },
  ]) {
    const { request, observed } = values();
    change(request);
    expect(() => render(request, observed)).toThrow();
  }
});

test('unrelated computed and unresolved inputs remain rejected', () => {
  const { request, observed } = values();
  request.spec.site_state = 'ONLINE';
  expect(() => render(request, observed)).toThrow();
  delete request.spec.site_state;
  iface(request).mtu = undefined;
  expect(() => render(request, observed)).toThrow('Unresolved');
  expect(() => renderVerifiedReplacementResource(request, observed, schema, 'xcsh_bgp')).toThrow();
});

test('optional writable flags are retained according to the installed schema', () => {
  const { request, observed } = values(),
    writable = structuredClone(schema) as unknown as { block: SchemaBlock };
  type SchemaBlock = {
    attributes?: Record<string, { nested_type?: SchemaBlock; optional?: boolean }>;
    block_types?: Record<string, { block: SchemaBlock }>;
  };
  const child = (value: SchemaBlock, key: string): SchemaBlock => {
    const result = value.attributes?.[key]?.nested_type ?? value.block_types?.[key]?.block;
    if (!result) throw Error('Missing fixture schema block');
    return result;
  };
  const attributes = child(
    child(child(child(writable.block, 'aws'), 'not_managed'), 'node_list'),
    'interface_list',
  ).attributes;
  if (!attributes?.is_primary) throw Error('Missing fixture interface attribute');
  attributes.is_primary.optional = true;
  const result = render(request, observed, writable);
  const primary = iface(request).is_primary;
  if (typeof primary !== 'boolean') throw Error('Malformed fixture interface flag');
  expect(renderedInterfaces(result)[0].is_primary).toBe(primary);
});

test('projection detects state drift independently for post-apply and pre-apply checks', () => {
  const { request, observed } = values();
  verifiedReplacementProjection(request, observed, schema, 'xcsh_securemesh_site_v2');
  iface(observed).is_management = !iface(observed).is_management;
  expect(() => verifiedReplacementProjection(request, observed, schema, 'xcsh_securemesh_site_v2')).toThrow(
    'state differs',
  );
});
