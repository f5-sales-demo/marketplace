import { describe, expect, it } from 'bun:test';
import { Type } from '@sinclair/typebox';
import { createGlabExecTool } from '../../src/tools/glab-exec';
import { effectiveApiMethod, findMutation } from '../../src/tools/glab-exec-guard';
import { hasControlChars } from '../../src/tools/shared';

const NUL = String.fromCharCode(0);
const TAB = String.fromCharCode(9);

const mockPi = { typebox: { Type } };

function makeTool() {
  return createGlabExecTool(mockPi);
}

describe('hasControlChars', () => {
  it('rejects NUL/control bytes but allows tab and normal args', () => {
    expect(hasControlChars(`a${NUL}b`)).toBe(true);
    expect(hasControlChars(`a${TAB}b`)).toBe(false);
    expect(hasControlChars('issue list --output json')).toBe(false);
  });
});

describe('effectiveApiMethod', () => {
  it('defaults to GET with no method or body flags', () => {
    expect(effectiveApiMethod(['api', 'projects/1'])).toBe('GET');
  });

  it('honors explicit --method / -X in every form (incl attached/equals/lowercase)', () => {
    expect(effectiveApiMethod(['api', 'x', '--method', 'POST'])).toBe('POST');
    expect(effectiveApiMethod(['api', 'x', '--method=DELETE'])).toBe('DELETE');
    expect(effectiveApiMethod(['api', 'x', '-X', 'PUT'])).toBe('PUT');
    expect(effectiveApiMethod(['api', 'x', '-XPATCH'])).toBe('PATCH');
    expect(effectiveApiMethod(['api', 'x', '-X=POST'])).toBe('POST');
    expect(effectiveApiMethod(['api', 'x', '-X=patch'])).toBe('PATCH');
    expect(effectiveApiMethod(['api', 'x', '--method', 'get'])).toBe('GET');
  });

  it('infers POST when a body flag is present (attached, equals, or separate)', () => {
    expect(effectiveApiMethod(['api', 'x', '-F', 'k=v'])).toBe('POST');
    expect(effectiveApiMethod(['api', 'x', '--field', 'k=v'])).toBe('POST');
    expect(effectiveApiMethod(['api', 'x', '-f', 'k=v'])).toBe('POST');
    expect(effectiveApiMethod(['api', 'x', '--raw-field', 'k=v'])).toBe('POST');
    expect(effectiveApiMethod(['api', 'x', '--input', 'body.json'])).toBe('POST');
    expect(effectiveApiMethod(['api', 'x', '-Fkey=val'])).toBe('POST');
    expect(effectiveApiMethod(['api', 'x', '-fbody=spam'])).toBe('POST');
    expect(effectiveApiMethod(['api', 'x', '--field=k=v'])).toBe('POST');
    expect(effectiveApiMethod(['api', 'x', '--input=body.json'])).toBe('POST');
    expect(effectiveApiMethod(['api', '--form', 'title=x', 'projects/1/issues'])).toBe('POST');
    expect(effectiveApiMethod(['api', '--form=title=x', 'x'])).toBe('POST');
  });

  it('lets an explicit method win over an inferred body POST', () => {
    expect(effectiveApiMethod(['api', 'x', '--method', 'GET', '-F', 'k=v'])).toBe('GET');
    expect(effectiveApiMethod(['api', '--method', 'GET', 'x', '--form', 'a=b'])).toBe('GET');
  });
});

describe('findMutation allowlist', () => {
  it('allows recognized read-only commands', () => {
    expect(findMutation(['issue', 'list']).blocked).toBe(false);
    expect(findMutation(['mr', 'view', '5']).blocked).toBe(false);
    expect(findMutation(['mr', 'diff', '5']).blocked).toBe(false);
    expect(findMutation(['ci', 'status']).blocked).toBe(false);
    expect(findMutation(['api', 'projects/1']).blocked).toBe(false);
    expect(findMutation(['search', 'issues', 'x']).blocked).toBe(false);
    expect(findMutation(['version']).blocked).toBe(false);
  });

  it('blocks writes and unrecognized commands (fail-safe)', () => {
    expect(findMutation(['mr', 'merge', '5']).blocked).toBe(true);
    expect(findMutation(['issue', 'create', '--title', 'x']).blocked).toBe(true);
    expect(findMutation(['repo', 'delete', 'o/r']).blocked).toBe(true);
    expect(findMutation(['issue', 'close', '5']).blocked).toBe(true);
    expect(findMutation(['auth', 'login']).blocked).toBe(true);
  });

  it('blocks glab api mutating requests in every flag form', () => {
    expect(findMutation(['api', '-XPOST', 'projects/1/issues']).blocked).toBe(true);
    expect(findMutation(['api', '-X=POST', 'x']).blocked).toBe(true);
    expect(findMutation(['api', '--method=PUT', 'x']).blocked).toBe(true);
    expect(findMutation(['api', 'x', '--input', 'f']).blocked).toBe(true);
    expect(findMutation(['api', 'x', '-F', 'k=v']).blocked).toBe(true);
    expect(findMutation(['api', 'x', '-fbody=spam']).blocked).toBe(true);
    expect(findMutation(['api', '--form', 'title=x', 'projects/1/issues']).blocked).toBe(true);
    expect(findMutation(['api', '--form=title=x', 'x']).blocked).toBe(true);
    expect(findMutation(['api', 'projects/1/uploads', '--form', 'file=@-']).blocked).toBe(true);
  });

  it('allows glab api GET requests', () => {
    expect(findMutation(['api', '-XGET', 'projects/1']).blocked).toBe(false);
    expect(findMutation(['api', '-X=GET', 'user']).blocked).toBe(false);
    expect(findMutation(['api', 'projects/1']).blocked).toBe(false);
    expect(findMutation(['api', '--method', 'GET', 'x', '--form', 'a=b']).blocked).toBe(false);
  });

  it('allows the ci trace streaming read', () => {
    expect(findMutation(['ci', 'trace', '123']).blocked).toBe(false);
  });

  it('does not false-positive on read args that contain a verb word', () => {
    expect(findMutation(['mr', 'view', 'merge']).blocked).toBe(false);
  });
});

describe('glab_exec execute', () => {
  it('returns correct name and label', () => {
    const tool = makeTool();
    expect(tool.name).toBe('glab_exec');
    expect(tool.label).toBe('GitLab CLI Execute');
    expect(typeof tool.description).toBe('string');
    expect(tool.description.length).toBeGreaterThan(20);
  });

  it('rejects empty args', async () => {
    const tool = makeTool();
    const r = await tool.execute('id', { args: [] }, undefined, undefined, { cwd: '/tmp' });
    expect(r.isError).toBe(true);
  });

  it('rejects control chars', async () => {
    const tool = makeTool();
    const r = await tool.execute('id', { args: [`issue${NUL}list`] }, undefined, undefined, { cwd: '/tmp' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text.toLowerCase()).toContain('control character');
  });

  it('blocks a mutating verb before spawning', async () => {
    const tool = makeTool();
    const r = await tool.execute('id', { args: ['mr', 'merge', '5'] }, undefined, undefined, { cwd: '/tmp' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text.toLowerCase()).toContain('read-only');
  });

  it('blocks a mutating glab api request before spawning', async () => {
    const tool = makeTool();
    const r = await tool.execute('id', { args: ['api', '-X=POST', 'x'] }, undefined, undefined, { cwd: '/tmp' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text.toLowerCase()).toContain('read-only');
  });
});
