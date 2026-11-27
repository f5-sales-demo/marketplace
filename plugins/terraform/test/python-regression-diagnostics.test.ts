import { expect, test } from 'bun:test';
import { safePythonRegressionDiagnostics } from './python-regression-diagnostics';

test('Python diagnostics retain known failure checks and source locations without private trace data', () => {
  const result = safePythonRegressionDiagnostics(
    [
      '/private/person/project/plugins/terraform/scripts/gcp_provider_process.py:42: ValueError',
      'E   ValueError: Original owned provider evidence directory required',
      'E   PermissionError: private-token=secret-token /private/customer-name',
      'E   CustomerSecretError: another-secret',
      '/private/person/secret_filename.py:33: PermissionError',
      'captured_stdout = private-credential',
    ].join('\n'),
  );
  expect(result).toEqual({
    exceptionTypes: ['PermissionError', 'ValueError'],
    locations: ['gcp_provider_process.py:42'],
    knownReasons: ['Original owned provider evidence directory required'],
    truncated: false,
  });
  expect(JSON.stringify(result)).not.toMatch(/private|secret|customer|credential|person/);
});

test('Python diagnostics bound input and locations without accepting malicious paths or exception names', () => {
  const raw =
    'ignored-secret'.repeat(25_000) +
    '\n' +
    Array.from({ length: 40 }, (_, i) => `xcsh_creation_observer.py:${i + 1}: ValueError`).join('\n') +
    '\nE   ValueError: Original xcsh creation evidence differs';
  const result = safePythonRegressionDiagnostics(raw);
  expect(result.truncated).toBe(true);
  expect(result.locations).toHaveLength(32);
  expect(result.knownReasons).toEqual(['Original xcsh creation evidence differs']);
  expect(result.exceptionTypes).toEqual(['ValueError']);
});
