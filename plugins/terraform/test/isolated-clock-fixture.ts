import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export async function runIsolatedClockFixture(name: string) {
  const sourceRoot = resolve(import.meta.dir, '../src');
  const source = (await readFile(join(import.meta.dir, 'fixtures', name), 'utf8')).replaceAll(
    "'../../src/",
    `'${sourceRoot}/`,
  );
  const root = await mkdtemp(join(tmpdir(), 'ce-isolated-clock-'));
  const path = join(root, 'clock.test.ts');
  await writeFile(path, source, { flag: 'wx', mode: 0o400 });
  const child = Bun.spawn([process.execPath, 'test', path], { stdout: 'pipe', stderr: 'pipe' });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  await writeFile(join(root, 'result.private.json'), JSON.stringify({ exitCode, stdout, stderr }), {
    flag: 'wx',
    mode: 0o400,
  });
  if (exitCode !== 0) throw new Error(`Isolated original-clock fixture failed: ${stderr}`);
  return { exitCode, stdout, stderr };
}
