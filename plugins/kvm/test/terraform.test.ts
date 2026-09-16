import { describe, expect, it } from 'bun:test';
import type { KvmCommandRunner } from '../src/runtime';
import { applyTerraformSavedPlan, createTerraformSavedPlan, type KvmPlanFileOps } from '../src/terraform';

describe('KVM Terraform saved plans', () => {
  it('creates, protects, inspects, and hashes an apply plan with AWS and Azure disabled', async () => {
    const calls: string[][] = [];
    const planJson = {
      format_version: '1.2',
      resource_changes: [
        {
          address: 'libvirt_domain.ce_node["01"]',
          provider_name: 'registry.terraform.io/dmacvicar/libvirt',
          change: { actions: ['create'] },
        },
        {
          address: 'docker_container.kvm_frr[0]',
          provider_name: 'registry.terraform.io/kreuzwerker/docker',
          change: { actions: ['update'] },
        },
        {
          address: 'xcsh_securemesh_site_v2.kvm[0]',
          provider_name: 'registry.terraform.io/f5-sales-demo/xcsh',
          change: { actions: ['no-op'] },
        },
      ],
    };
    const run: KvmCommandRunner = async (command, args) => {
      calls.push([command, ...args]);
      if (args[1] === 'show') return { stdout: JSON.stringify(planJson), stderr: '', exitCode: 0 };
      return { stdout: '', stderr: '', exitCode: 2 };
    };
    const fileOps: KvmPlanFileOps = {
      chmod: async () => {},
      sha256: async () => 'd'.repeat(64),
    };

    const result = await createTerraformSavedPlan(
      '/workspace/mcn/terraform',
      'apply',
      '/secure/evidence/kvm.tfplan',
      run,
      fileOps,
    );

    expect(calls[0]).toEqual([
      'terraform',
      '-chdir=/workspace/mcn/terraform',
      'plan',
      '-input=false',
      '-lock=true',
      '-detailed-exitcode',
      '-out=/secure/evidence/kvm.tfplan',
      '-var=enable_azure=false',
      '-var=enable_aws=false',
      '-var=enable_kvm=true',
    ]);
    expect(calls[1]).toEqual([
      'terraform',
      '-chdir=/workspace/mcn/terraform',
      'show',
      '-json',
      '/secure/evidence/kvm.tfplan',
    ]);
    expect(result).toEqual({
      path: '/secure/evidence/kvm.tfplan',
      sha256: 'd'.repeat(64),
      mode: 'apply',
      add: 1,
      change: 1,
      destroy: 0,
      azureActions: 0,
    });
  });

  it('uses Terraform destroy planning rather than direct libvirt deletion', async () => {
    const calls: string[][] = [];
    const run: KvmCommandRunner = async (command, args) => {
      calls.push([command, ...args]);
      if (args[1] === 'show')
        return {
          stdout: JSON.stringify({
            format_version: '1.2',
            resource_changes: [
              {
                address: 'libvirt_domain.ce_node["01"]',
                provider_name: 'registry.terraform.io/dmacvicar/libvirt',
                change: { actions: ['delete'] },
              },
            ],
          }),
          stderr: '',
          exitCode: 0,
        };
      return { stdout: '', stderr: '', exitCode: 2 };
    };
    const result = await createTerraformSavedPlan(
      '/workspace/mcn/terraform',
      'destroy',
      '/secure/evidence/kvm-destroy.tfplan',
      run,
      { chmod: async () => {}, sha256: async () => 'e'.repeat(64) },
    );
    expect(calls[0]).toContain('-destroy');
    expect(calls.flat()).not.toContain('virsh');
    expect(result.destroy).toBe(1);
  });

  it('does not echo Terraform output when planning fails', async () => {
    const run: KvmCommandRunner = async () => ({
      stdout: 'signed_url=https://signed.example.test/secret',
      stderr: 'token=do-not-return',
      exitCode: 1,
    });
    await expect(
      createTerraformSavedPlan('/workspace/mcn/terraform', 'apply', '/secure/evidence/kvm.tfplan', run, {
        chmod: async () => {},
        sha256: async () => 'f'.repeat(64),
      }),
    ).rejects.toThrow('Terraform KVM plan failed');
  });
});

describe('KVM Terraform saved-plan apply', () => {
  it('applies only the supplied saved-plan path without replanning', async () => {
    const calls: string[][] = [];
    const result = await applyTerraformSavedPlan(
      '/workspace/mcn/terraform',
      '/secure/evidence/kvm.tfplan',
      async (command, args) => {
        calls.push([command, ...args]);
        return { stdout: 'Apply complete! Resources: 12 added, 0 changed, 0 destroyed.', stderr: '', exitCode: 0 };
      },
    );
    expect(calls).toEqual([
      [
        'terraform',
        '-chdir=/workspace/mcn/terraform',
        'apply',
        '-input=false',
        '-auto-approve',
        '/secure/evidence/kvm.tfplan',
      ],
    ]);
    expect(result).toMatchObject({ exitCode: 0, outputBytes: 60 });
    expect(JSON.stringify(result)).not.toContain('Apply complete');
  });

  it('withholds Terraform output when apply fails', async () => {
    await expect(
      applyTerraformSavedPlan('/workspace/mcn/terraform', '/secure/evidence/kvm.tfplan', async () => ({
        stdout: 'signed_url=https://signed.example.test/secret',
        stderr: 'token=do-not-return',
        exitCode: 1,
      })),
    ).rejects.toThrow('Terraform KVM saved-plan apply failed');
  });
});
