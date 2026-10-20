# Catalog-driven installed qualification tooling

Parent campaign: [#1579](https://github.com/f5-sales-demo/marketplace/issues/1579).
Foundation: [#1581](https://github.com/f5-sales-demo/marketplace/issues/1581).
Tooling delivery: [#1669](https://github.com/f5-sales-demo/marketplace/issues/1669).

## Scope and provenance

Starting source: `9670b541` (completed Salesforce 2.3.15 browser acceptance).
The new tooling derives all 23 plugins, installed entrypoint conventions and
current surface IDs from the catalog and canonical tracker. Registration discovery
remains pinned to runtime 23.8.0; its fingerprint was not upgraded.

Installed capture: AWS 2.3.0 through the published xcsh 23.9.3 binary on macOS.
The installed registry, manifest and selected path agree. The private journal
records resolved binary path, runtime/plugin versions, scenario digest and
synthetic-fixture evidence tier. Failed baseline captures are retained privately.

## Observed baseline

Two synthetic cases produced 96 individually checked native buffer frames:
40/76/120/153 columns, collapsed/expanded, dark/light, Unicode/ASCII/Nerd.
The identity case passed all 48 combinations. The thirteen-record EC2 case
passed all 24 expanded combinations and failed all 24 collapsed combinations:
the collapsed adapter exposes three records, so the expected twelfth record is
missing. All frames stayed within their requested widths. Fixture identities,
instance names and addresses are synthetic. No AWS service command was executed.

The hardened runner reproduced the original failure in a fresh capture root.
Its controller validates every appearance field and installed provenance, uses
atomic acknowledgements, and refuses to overwrite existing inspection journals.

## Tooling checks and limits

Behavioral tests cover exact target/flag admission, unrestricted-tool denial,
shipped-path traversal and symlink rejection, ambiguous installed selection,
private root permissions, complete frame identity, lost literals and overflow.
Observer tests prove fixture execution denial and normal service-handler return
preservation, reviewed command dispatch, hidden message dispatch and lifecycle UI
observation. Service tests use a synthetic entrypoint and executor.

Fixture mode suppresses plugin lifecycle and guards registered tools, plugin
commands and the host API executor. Direct process/network operations inside an
entrypoint require inspection before loading. Fixture admission is not a general
sandbox for arbitrary plugin initialization.

These outcomes qualify reusable tooling and expose the AWS preview defect. They
do not qualify AWS service results, executed guidance, viewport pages, copied
shell commands, timer cleanup, every plugin surface or shared tracker gates.
Latest development and minimum-runtime lanes remain separate foundation work.
Salesforce's completed qualification and historical receipts are preserved.

## Repository verification

The focused foundation group passed 31 tests with 164 assertions on macOS.
TypeScript lint, Markdown lint, terminology lint, shell syntax and ShellCheck
passed. The changed-scope PII audit and isolated changed-file secret scan passed.

The complete plugin runner on macOS exposed existing GitLab user-configuration
sensitivity, a missing PyYAML test dependency and Linux-specific Xorg/Zoom tests.
The Ubuntu runner passed all suites except KVM, whose copied-artifact test also
needed PyYAML. These initial failures are retained; supported-host validation
continues with PyYAML in an isolated test environment. They are not hidden by
rewriting successful qualification claims.

The Ubuntu KVM rerun passed all seven shell tests after installing PyYAML in
an isolated Python environment. Combined with the original complete Ubuntu run,
every plugin suite passed on its supported test host.
