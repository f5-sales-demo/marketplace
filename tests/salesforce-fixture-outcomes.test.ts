import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('empty pipeline faults preserve identity, schema and fiscal prerequisites', async () => {
  const root = await mkdtemp(join(tmpdir(), 'salesforce-outcome-'));
  try {
    const control = join(root, 'control.json');
    const executable = join(root, 'fixture.ts');
    const fragment = await readFile(new URL('../scripts/salesforce-fixture-outcomes.ts', import.meta.url), 'utf8');
    await writeFile(control, JSON.stringify({ tool: 'sf_pipeline_report', outcome: 'empty' }));
    await writeFile(executable, `const args = process.argv.slice(2);\n${fragment}\nconsole.log('BASELINE');`);
    const execute = (args: string[]) => {
      const child = Bun.spawnSync([process.execPath, executable, ...args], {
        env: { ...process.env, PRESENTATION_FIXTURE_CONTROL: control },
      });
      expect(child.exitCode).toBe(0);
      return new TextDecoder().decode(child.stdout).trim();
    };
    for (const args of [
      ['org', 'display', '--json'],
      ['sobject', 'describe', '--json'],
      ['data', 'query', '--query', 'SELECT Id FROM User'],
      ['data', 'query', '--query', 'SELECT Type FROM Period'],
    ])
      expect(execute(args)).toBe('BASELINE');
    expect(JSON.parse(execute(['data', 'query', '--query', 'SELECT Name FROM Opportunity']))).toEqual({
      status: 0,
      result: { records: [], totalSize: 0, done: true },
      warnings: [],
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
