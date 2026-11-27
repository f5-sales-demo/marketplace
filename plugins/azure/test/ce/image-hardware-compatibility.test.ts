import { expect, test } from 'bun:test';
import {
  classifyAzureImageHardwareCompatibility,
  readAzureImageHardware,
  readAzureSkuHardware,
} from '../../src/ce/image-hardware-compatibility';
import { compileAzureCePlan } from '../../src/ce/planner';
import { intent, observation, subscriptionId } from './fixtures';

const expected = { subscriptionId, region: 'eastus', urn: 'f5-networks:f5xc_customer_edge:ce:1.0.0' };
const image = {
  id: `/Subscriptions/${subscriptionId}/Providers/Microsoft.Compute/Locations/eastus/Publishers/f5-networks/ArtifactTypes/VMImage/Offers/f5xc_customer_edge/Skus/ce/Versions/1.0.0`,
  name: '1.0.0',
  location: 'eastus',
  architecture: 'x64',
  hyperVGeneration: 'V1',
};
const capabilities = [
  { name: 'CpuArchitectureType', value: 'x64' },
  { name: 'HyperVGenerations', value: 'V1,V2' },
];
test('exact image identity and reported SKU capabilities qualify hardware configuration only', () => {
  const hardware = readAzureImageHardware(image, expected),
    sku = readAzureSkuHardware({ capabilities });
  expect(hardware).toEqual({ architecture: 'x64', hyperVGeneration: 'V1' });
  expect(sku).toEqual({ architecture: 'x64', hyperVGenerations: ['V1', 'V2'] });
  expect(classifyAzureImageHardwareCompatibility(hardware, sku)).toBe('compatible');
});
for (const field of ['id', 'name', 'location'])
  test(`foreign image ${field} cannot supply hardware identity`, () => {
    const result = readAzureImageHardware({ ...image, [field]: 'foreign' }, expected);
    expect(classifyAzureImageHardwareCompatibility(result, readAzureSkuHardware({ capabilities }))).toBe('unknown');
  });
for (const field of ['architecture', 'hyperVGeneration'])
  test(`missing image ${field} remains unknown`, () => {
    const result = readAzureImageHardware({ ...image, [field]: undefined }, expected);
    expect(classifyAzureImageHardwareCompatibility(result, readAzureSkuHardware({ capabilities }))).toBe('unknown');
  });
test('Arm or V2-only SKUs cannot host the exact x64 V1 F5 image', () => {
  const hardware = readAzureImageHardware(image, expected);
  expect(
    classifyAzureImageHardwareCompatibility(hardware, { architecture: 'arm64', hyperVGenerations: ['V1', 'V2'] }),
  ).toBe('incompatible');
  expect(classifyAzureImageHardwareCompatibility(hardware, { architecture: 'x64', hyperVGenerations: ['V2'] })).toBe(
    'incompatible',
  );
});
for (const fault of ['missing', 'duplicate', 'malformed', 'generation'])
  test(`SKU ${fault} evidence remains unknown instead of inferring from a size name`, () => {
    const rows = structuredClone(capabilities);
    if (fault === 'missing') rows.shift();
    if (fault === 'duplicate') rows.push({ name: 'cpuarchitecturetype', value: 'Arm64' });
    if (fault === 'malformed') rows[0].value = 'anything';
    if (fault === 'generation') rows[1].value = 'V1,V1';
    expect(
      classifyAzureImageHardwareCompatibility(
        readAzureImageHardware(image, expected),
        readAzureSkuHardware({ name: 'Standard_D8_v3', capabilities: rows }),
      ),
    ).toBe('unknown');
  });
for (const fault of ['arm', 'v2', 'missing-image', 'missing-sku'])
  test(`planner rejects ${fault} hardware despite claimed eligible region`, () => {
    const value = structuredClone(observation);
    Object.assign(value.image, { architecture: 'x64', hyperVGeneration: 'V1' });
    Object.assign(value.regions[0].vmSizes[0], {
      architecture: fault === 'arm' ? 'arm64' : 'x64',
      hyperVGenerations: fault === 'v2' ? ['V2'] : ['V1', 'V2'],
    });
    if (fault === 'missing-image') delete value.image.architecture;
    if (fault === 'missing-sku') delete value.regions[0].vmSizes[0].architecture;
    expect(() => compileAzureCePlan(intent, value)).toThrow(/hardware compatibility/i);
  });
