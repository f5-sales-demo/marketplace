# GCP reader structure and startup qualification

The shipped Python readers now group original executable pins, guards,
immutable options, actor handles and partial captures explicitly. Guest
bindings keep their flat immutable identity fields. Original operation and
closure deadlines remain fixed; options cannot be replaced on an existing
actor. Terminal parsing retains bounded CSI/title handling and rejects
clipboard controls, injected commands and bytes subclasses.

The frozen source reproduced two leaked descriptors after a failed process
spawn. The current failure path releases owned local descriptors while
preserving failed capture and unavailable actor identity. It does not claim
original group closure. A failing-first persistence regression now preserves
the original spawn error, persistence error and retained session together.
Unresolved actor records remain retained. No process signals are used.

The Python process suite still runs with isolated Python. Pytest receives the
explicit source package path, so typed imports work without ambient Python
path settings. The standalone hermetic check initially lacked ASM Migration's
frozen dependencies; installing its existing lock repaired that prerequisite.
The subsequent complete hermetic check passes for every plugin.

Validation passes: 49 process, PTY and guest regressions, 968 top-level shared
tests and 4,251 assertions, all configured Pylint checks, Mypy for seven affected
files, Ruff, runtime builds, Terraform typechecking and changed-scope privacy.
No lint limit or check was weakened. Five compiled capture-source hashes were
rebuilt. Fresh authenticated source composition completed two default SDK reads
and two real Compute absence reads against the same original Terraform
invocation, including its fixed final reserve. Its reviewed empty plan and
final no-change plan have zero managed resources. All sixteen original process
groups were independently absent. These new captures qualify source composition;
historical component receipts are not promoted to these bytes. Ordinary
installed-tool, cloud apply and live guest acceptance remain open.

The full installed capture controller, original cloud apply/insert attribution,
live guest capture, all native/Terraform networking and lifecycle profiles,
content traffic and recovery timing, ordinary installed runtime, passing CI,
review, publication and published installation remain required. See the
[full acceptance matrix](gcp-issue-1559-acceptance.md).
