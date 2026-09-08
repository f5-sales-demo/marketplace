import { expect, test } from 'bun:test';
import { correlateRegistrationDevices } from '../../src/ce/registration-devices';

const expected = [
  { node: 'ce-one', role: 'slo' as const, mac: '02:00:00:00:00:01' },
  { node: 'ce-one', role: 'sli' as const, mac: '02:00:00:00:00:02' },
];
const instances = { 'ce-one': 'i-1234567890abcdef0' };
function fixture() {
  return {
    items: [
      {
        get_spec: {
          passport: { cluster_name: 'site-one', cluster_size: 1 },
          infra: {
            hostname: 'ce-one',
            instance_id: instances['ce-one'],
            hw_info: {
              network: [
                { name: 'observed-inside', mac_address: expected[1].mac },
                { name: 'observed-outside', mac_address: expected[0].mac },
              ],
            },
          },
        },
        object: { status: { current_state: 'ADMITTED' } },
      },
    ],
    errors: [],
  };
}
test('joins registration hardware by instance, hostname and MAC without assuming device order', () => {
  const result = correlateRegistrationDevices(fixture(), 'site-one', instances, expected);
  expect(result.map((item) => item.device)).toEqual(['observed-outside', 'observed-inside']);
  expect(result[0]).not.toHaveProperty('linkUp');
});
test('rejects partial, foreign, retired, ambiguous and malformed registration inventory', () => {
  for (const mutate of [
    (value: ReturnType<typeof fixture> & { next_page_token?: string }) => {
      value.next_page_token = 'more';
    },
    (value: ReturnType<typeof fixture> & { next_page_token?: string }) => {
      Object.assign(value, { errors: ['unavailable'] });
    },
    (value: ReturnType<typeof fixture> & { next_page_token?: string }) => {
      value.items[0].get_spec.infra.instance_id = 'i-00000000000000000';
    },
    (value: ReturnType<typeof fixture> & { next_page_token?: string }) => {
      value.items[0].get_spec.passport.cluster_name = 'foreign';
    },
    (value: ReturnType<typeof fixture> & { next_page_token?: string }) => {
      value.items[0].object.status.current_state = 'RETIRED';
    },
    (value: ReturnType<typeof fixture> & { next_page_token?: string }) => {
      value.items.push(structuredClone(value.items[0]));
    },
    (value: ReturnType<typeof fixture> & { next_page_token?: string }) => {
      value.items[0].get_spec.infra.hw_info.network.pop();
    },
    (value: ReturnType<typeof fixture> & { next_page_token?: string }) => {
      value.items[0].get_spec.infra.hw_info.network[0].name = '';
    },
    (value: ReturnType<typeof fixture> & { next_page_token?: string }) => {
      value.items[0].get_spec.infra.hw_info.network[0].name = 'observed-outside';
    },
  ]) {
    const value = fixture();
    mutate(value);
    expect(() => correlateRegistrationDevices(value, 'site-one', instances, expected)).toThrow();
  }
  expect(() => correlateRegistrationDevices(fixture(), 'site-one', instances, [expected[0], expected[0]])).toThrow();
});
