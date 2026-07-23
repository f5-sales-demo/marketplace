import { describe, expect, it } from 'bun:test';
import { GlabNotFoundError } from '../src/glab/exec';
import { withErrorType } from '../src/index';

// A minimal fake tool matching the shape withErrorType expects.
function fakeTool(execute: (...args: never[]) => Promise<unknown>) {
  return { name: 'fake', execute };
}

describe('withErrorType wrapper', () => {
  it('converts a thrown GlabNotFoundError into a structured error result', async () => {
    const tool = withErrorType(
      fakeTool(async () => {
        throw new GlabNotFoundError('missing project');
      }),
    );

    const result = (await tool.execute()) as { isError?: boolean; details?: { errorType?: string } };
    expect(result.isError).toBe(true);
    expect(result.details?.errorType).toBe('not_found');
  });

  it('re-throws a cancellation so the agent loop sees it untouched', async () => {
    const tool = withErrorType(
      fakeTool(async () => {
        throw new Error('Command was cancelled');
      }),
    );

    await expect(tool.execute()).rejects.toThrow('Command was cancelled');
  });
});
