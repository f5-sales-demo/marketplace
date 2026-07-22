import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';

const engineDir = import.meta.dir;
const example = path.join(engineDir, '..', 'schema', 'example-deal.json');

async function run(args: string[]): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn(['bun', path.join(engineDir, 'cli.ts'), ...args], { stdout: 'pipe', stderr: 'pipe' });
  const out = await new Response(proc.stdout).text();
  const code = await proc.exited;
  return { code, out };
}

describe('cli', () => {
  test('score', async () => {
    const { code, out } = await run(['score', example]);
    expect(code).toBe(0);
    const r = JSON.parse(out);
    expect(r.sum).toBe(21);
    expect(r.overallScore).toBe(65.6);
    expect(r.overallRating).toBe('Yellow');
  });
  test('next', async () => {
    const { out } = await run(['next', example]);
    expect(JSON.parse(out).nextIncompleteSection).toBe('decisionProcess');
  });
  test('validate', async () => {
    const { code, out } = await run(['validate', example]);
    expect(code).toBe(0);
    expect(JSON.parse(out).valid).toBe(true);
  });
  test('check-mappings', async () => {
    const { code, out } = await run(['check-mappings']);
    expect(code).toBe(0);
    expect(JSON.parse(out).ok).toBe(true);
  });
  test('unknown command exits non-zero', async () => {
    const { code } = await run(['bogus', example]);
    expect(code).toBe(1);
  });
  test('hint (overview) lists 8 elements', async () => {
    const { code, out } = await run(['hint']);
    expect(code).toBe(0);
    expect(JSON.parse(out).elements.length).toBe(8);
  });
  test('hint <element> returns questions + rubric', async () => {
    const { code, out } = await run(['hint', 'metrics']);
    expect(code).toBe(0);
    const h = JSON.parse(out);
    expect(h.questions.length).toBe(2);
    expect(Object.keys(h.scoreDefinition)).toEqual(['0', '1', '2', '3', '4']);
  });
  test('hint bogus exits non-zero', async () => {
    const { code } = await run(['hint', 'bogus']);
    expect(code).toBe(1);
  });
  test('next embeds the current-section hint', async () => {
    const { out } = await run(['next', example]);
    const r = JSON.parse(out);
    expect(r.nextIncompleteSection).toBe('decisionProcess');
    expect(r.hint?.element).toBe('decisionProcess');
    expect(r.hint?.questions.length).toBeGreaterThan(0);
  });
});
