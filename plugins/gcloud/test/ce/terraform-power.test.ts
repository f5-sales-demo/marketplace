import { expect, it } from 'bun:test';
import { translateGcpTerraformSiteCompute } from '../../src/ce/compute-plan';
import { reviseGcpTerraformPower } from '../../src/ce/terraform-power';
import { intent } from './fixtures';

function fixture() {
  const i = intent();
  i.engine = 'terraform';
  i.routing.destinationCidrs = [];
  const configuration = JSON.stringify(
    translateGcpTerraformSiteCompute(i, { terraform: '1.16.6', google: '8.7.0', xcsh: '15.10.5' }).configuration,
  );
  return {
    configuration,
    node: { address: 'google_compute_instance.node_a', name: 'node-a', zone: i.sites[0].nodes[0].zone },
    project: i.project,
  };
}
it('Terraform stop/start revise only the named VM status and preserve provider/bootstrap configuration', () => {
  const f = fixture();
  const stop = reviseGcpTerraformPower(f.configuration, f.project, 'stop', [f.node]);
  const before = JSON.parse(f.configuration),
    after = JSON.parse(stop.configuration);
  expect(after.resource.google_compute_instance.node_a.desired_status).toBe('TERMINATED');
  delete after.resource.google_compute_instance.node_a.desired_status;
  expect(after).toEqual(before);
  const start = reviseGcpTerraformPower(stop.configuration, f.project, 'start', [f.node]);
  expect(JSON.parse(start.configuration).resource.google_compute_instance.node_a.desired_status).toBe('RUNNING');
});
it('resize requires stopped configuration and observed minimum sizing while preserving original power state', () => {
  const f = fixture(),
    target = { machineType: 'n2-standard-16', guestCpus: 16, memoryMiB: 65536, maxNics: 8 };
  expect(() => reviseGcpTerraformPower(f.configuration, f.project, 'resize', [f.node], target)).toThrow('stopped');
  const stopped = reviseGcpTerraformPower(f.configuration, f.project, 'stop', [f.node]);
  const resized = JSON.parse(
    reviseGcpTerraformPower(stopped.configuration, f.project, 'resize', [f.node], target).configuration,
  );
  expect(resized.resource.google_compute_instance.node_a).toMatchObject({
    machine_type: 'n2-standard-16',
    desired_status: 'TERMINATED',
  });
  expect(() => reviseGcpTerraformPower(stopped.configuration, 'foreign', 'resize', [f.node], target)).toThrow('scope');
  expect(() =>
    reviseGcpTerraformPower(stopped.configuration, f.project, 'resize', [f.node], { ...target, guestCpus: 4 }),
  ).toThrow('sizing');
});
