import { expect, it } from 'bun:test';
import { translateGcpPublicTerraformSiteCompute } from '../../src/ce/compute-plan';
import { intent } from './fixtures';

it('manages the boot disk independently and preserves legacy translation', () => {
  const i = intent();
  i.engine = 'terraform';
  i.routing.destinationCidrs = [];
  const translated = translateGcpPublicTerraformSiteCompute(i, {
    google: '8.7.0',
    xcsh: '15.13.0',
    terraform: '1.16.6',
  });
  const disk = translated.configuration.resource.google_compute_disk.node_a;
  expect(disk.name).toBe('node-a');
  expect(disk.size).toBe(80);
  const instance = translated.configuration.resource.google_compute_instance.node_a;
  expect(instance.boot_disk).toEqual([{ auto_delete: false, source: `\${google_compute_disk.node_a.self_link}` }]);
  expect(JSON.stringify(translated.configuration)).not.toContain('initialize_params');
  expect(translated.schemaVersion).toBe(2);
});
