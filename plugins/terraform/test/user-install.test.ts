import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { terraformInstallArgv, terraformRuntimeInstallArgv } from '../extensions/integration';

describe('Terraform user-scope setup', () => {
  test('Linux runtime setup uses the bundled isolated Python prerequisite without sudo or global pip', () => {
    const args = terraformRuntimeInstallArgv('linux');
    expect(args.slice(0, 3)).toEqual(['python3', '-I', '-B']);
    expect(args[3].endsWith('/plugins/terraform/scripts/install_runtime.py')).toBe(true);
    expect(args).not.toContain('sudo');
    expect(args).not.toContain('pip');
  });

  test('bundled runtime installer refuses unsafe and incomplete installations', async () => {
    const python = process.env.CE_TEST_PYTHON ?? Bun.which('python3');
    if (!python) throw new Error('Python fixture prerequisite is missing');
    const child = Bun.spawn([python, '-B', join(import.meta.dir, '../../../tests/test_terraform_runtime_install.py')], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0) throw new Error(`Runtime installer safety failed: ${stdout}${stderr}`);
    expect(code).toBe(0);
  });

  test('Linux setup runs the bundled pinned installer without privilege escalation', () => {
    const args = terraformInstallArgv('linux');
    expect(args[0]).toBe('python3');
    expect(args[1].endsWith('/plugins/terraform/scripts/install_terraform.py')).toBe(true);
    expect(args).not.toContain('sudo');
    expect(args).not.toContain('apt-get');
  });

  test('bundled installer safety suite runs through the same plugin bytes', async () => {
    const python = process.env.CE_TEST_PYTHON ?? Bun.which('python3');
    if (!python) throw new Error('Python fixture prerequisite is missing');
    const child = Bun.spawn([python, '-B', join(import.meta.dir, '../../../tests/test_terraform_user_install.py')], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0) throw new Error(`User installer safety failed: ${stdout}${stderr}`);
    expect(code).toBe(0);
  });
});
