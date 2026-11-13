/** Bounded public diagnosis of synthetic Python regressions; raw traces stay private. */
const exceptions = new Set([
  'AssertionError',
  'AttributeError',
  'FileNotFoundError',
  'ImportError',
  'IndexError',
  'KeyError',
  'ModuleNotFoundError',
  'OSError',
  'PermissionError',
  'ProcessLookupError',
  'TimeoutExpired',
  'TypeError',
  'ValueError',
]);
const files = new Set([
  'test_xcsh_creation_observer.py',
  'test_xcsh_creation_terminal.py',
  'test_xcsh_creation_reader.py',
  'xcsh_creation_fixtures.py',
  'xcsh_creation_observer.py',
  'gcp_provider_process.py',
  'guest_pty.py',
]);
const reasons = new Set([
  'Original executor group required',
  'Original executor identity changed',
  'Original executor image changed',
  'Original owned provider evidence directory required',
  'Original provider executable input changed',
  'Original provider executable identity differs',
  'Original provider executor ownership differs',
  'Original provider identity changed during capture',
  'Original provider capture is retired',
  'Original xcsh creation evidence differs',
  'Original xcsh claims belong to another process',
  'Original xcsh observer is retired',
  'Original witnessed xcsh claims unavailable',
  'Original xcsh witness freshness exhausted',
  'Original xcsh target coverage is incomplete',
]);
export function safePythonRegressionDiagnostics(raw: string) {
  const maximum = 256 * 1024;
  const bounded = raw.slice(-maximum);
  const types = new Set<string>(),
    locations = new Set<string>(),
    knownReasons = new Set<string>();
  for (const row of bounded.split(/\r?\n/)) {
    const error = /^E\s+([A-Za-z]+):(?:\s+(.*))?$/.exec(row);
    if (error && exceptions.has(error[1])) {
      types.add(error[1]);
      if (reasons.has(error[2])) knownReasons.add(error[2]);
    }
    const location = /(?:^|[/\\\s])([a-z_]+\.py):([1-9][0-9]{0,5}):/.exec(row);
    if (location && files.has(location[1]) && locations.size < 32) locations.add(`${location[1]}:${location[2]}`);
  }
  return {
    exceptionTypes: [...types].sort(),
    locations: [...locations].sort(),
    knownReasons: [...knownReasons].sort(),
    truncated: raw.length > maximum,
  };
}
