import { describe, expect, it } from 'bun:test';
import { withErrorType } from '../src/index';
import { SfNotFoundError, SfQueryError, SfSessionExpiredError } from '../src/sf/exec';

// A minimal fake tool matching the shape withErrorType expects: a name plus an
// execute() that throws whatever we hand it.
function fakeTool(name: string, thrown: unknown) {
  return {
    name,
    async execute(): Promise<unknown> {
      throw thrown;
    },
  };
}

describe('withErrorType', () => {
  it('maps a thrown SfSessionExpiredError to a structured errorResult', async () => {
    const wrapped = withErrorType(fakeTool('sf_query', new SfSessionExpiredError()));
    const result = (await wrapped.execute()) as {
      isError?: boolean;
      details?: { tool?: string; errorType?: string };
      content: { type: string; text: string }[];
    };
    expect(result.isError).toBe(true);
    expect(result.details?.errorType).toBe('session_expired');
    expect(result.details?.tool).toBe('sf_query');
    expect(result.content[0]?.text).toContain('session expired');
  });

  it('maps a thrown SfQueryError to errorType invalid_query', async () => {
    const wrapped = withErrorType(fakeTool('sf_query', new SfQueryError('bad soql', 'SELECT x')));
    const result = (await wrapped.execute()) as { isError?: boolean; details?: { errorType?: string } };
    expect(result.isError).toBe(true);
    expect(result.details?.errorType).toBe('invalid_query');
  });

  it('maps a generic/unknown Sf error to errorType exec_error', async () => {
    const wrapped = withErrorType(fakeTool('sf_setup', new SfNotFoundError()));
    const result = (await wrapped.execute()) as { isError?: boolean; details?: { errorType?: string } };
    expect(result.isError).toBe(true);
    expect(result.details?.errorType).toBe('exec_error');
  });

  it('re-throws a web-standard AbortError untouched (does not swallow cancellation)', async () => {
    const abort = new Error('The operation was aborted');
    abort.name = 'AbortError';
    const wrapped = withErrorType(fakeTool('sf_query', abort));
    expect(wrapped.execute()).rejects.toBe(abort);
  });

  it("re-throws xcsh's ToolAbortError untouched", async () => {
    const abort = new Error('Operation aborted');
    abort.name = 'ToolAbortError';
    const wrapped = withErrorType(fakeTool('sf_org_display', abort));
    expect(wrapped.execute()).rejects.toBe(abort);
  });

  it('passes through a successful (non-throwing) result unchanged', async () => {
    const ok = { content: [{ type: 'text' as const, text: 'ok' }], details: { tool: 'sf_setup' as const } };
    const tool = {
      name: 'sf_setup',
      async execute(): Promise<unknown> {
        return ok;
      },
    };
    const wrapped = withErrorType(tool);
    expect(await wrapped.execute()).toBe(ok);
  });
});
