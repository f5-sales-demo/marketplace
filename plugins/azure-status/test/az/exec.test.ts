import { describe, expect, it } from 'bun:test';
import {
  AzAuthError,
  AzExecError,
  AzNotFoundError,
  AzSessionExpiredError,
  detectAzError,
  parseAzJsonOutput,
} from '../../src/az/exec';

describe('parseAzJsonOutput', () => {
  it('parses valid JSON array', () => {
    const result = parseAzJsonOutput<Array<{ name: string }>>('[{"name":"test"}]');
    expect(result).toEqual([{ name: 'test' }]);
  });

  it('parses valid JSON object', () => {
    const result = parseAzJsonOutput<{ id: string }>('{"id":"123"}');
    expect(result).toEqual({ id: '123' });
  });

  it('throws AzExecError on malformed JSON', () => {
    expect(() => parseAzJsonOutput('not json {')).toThrow(AzExecError);
  });

  it('throws AzExecError on empty string', () => {
    expect(() => parseAzJsonOutput('')).toThrow(AzExecError);
  });
});

describe('detectAzError', () => {
  it('maps "Please run az login" to AzAuthError', () => {
    const err = detectAzError("Please run 'az login' to setup account.", 1);
    expect(err).toBeInstanceOf(AzAuthError);
  });

  it('maps "az login" mention to AzAuthError', () => {
    const err = detectAzError('ERROR: No subscription found. Run az login.', 1);
    expect(err).toBeInstanceOf(AzAuthError);
  });

  it('maps AADSTS token error to AzSessionExpiredError', () => {
    const err = detectAzError('AADSTS700082: The refresh token has expired.', 1);
    expect(err).toBeInstanceOf(AzSessionExpiredError);
  });

  it('maps "token has expired" to AzSessionExpiredError', () => {
    const err = detectAzError('The access token has expired or is not yet valid.', 1);
    expect(err).toBeInstanceOf(AzSessionExpiredError);
  });

  it('maps unknown stderr with exit code 1 to AzExecError', () => {
    const err = detectAzError('Something went wrong', 1);
    expect(err).toBeInstanceOf(AzExecError);
  });

  it('includes stderr in error message', () => {
    const err = detectAzError('Some detailed error message', 1);
    expect(err.message).toContain('Some detailed error message');
  });
});

describe('error class hierarchy', () => {
  it('AzAuthError is an instance of Error', () => {
    expect(new AzAuthError('test')).toBeInstanceOf(Error);
  });

  it('AzSessionExpiredError is an instance of Error', () => {
    expect(new AzSessionExpiredError('test')).toBeInstanceOf(Error);
  });

  it('AzNotFoundError is an instance of Error', () => {
    expect(new AzNotFoundError('test')).toBeInstanceOf(Error);
  });

  it('AzExecError is an instance of Error', () => {
    expect(new AzExecError('test')).toBeInstanceOf(Error);
  });
});
