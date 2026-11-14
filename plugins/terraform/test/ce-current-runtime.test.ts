import { expect, test } from 'bun:test';
import { AWS_CE_TERRAFORM_VERSION } from '../../aws/src/ce/execution-contract';
import { AZURE_CE_TERRAFORM_VERSION } from '../../azure/src/ce/terraform-foundation';
import { f5StageDeployment } from '../src/f5-retirement';

test('fresh CE cloud and platform stages share the current Terraform runtime', async () => {
  const current = '1.17.1';
  const stage = await f5StageDeployment({
    deploymentId: 'ce-current-runtime',
    provider: 'aws',
    engine: 'terraform',
    account: '123456789012',
    region: 'us-east-2',
  });
  expect(AWS_CE_TERRAFORM_VERSION).toBe(current);
  expect(AZURE_CE_TERRAFORM_VERSION).toBe(current);
  expect(stage.terraformVersion).toBe(current);
  expect(JSON.parse(stage.configuration).terraform.required_version).toBe(`= ${current}`);
});
