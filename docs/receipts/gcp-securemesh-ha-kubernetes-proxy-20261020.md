# Secure Mesh v2 site Kubernetes proxy qualification

This campaign checks whether documented Kubernetes proxy reads supply the missing internal CE service evidence. It does not enable public HA admission.

The original three-node Terraform creation was verified against eighteen exact owned objects. The follow-up saved plan had no changes, repeated creation resume submitted nothing, and all three original nodes became ONLINE with both original NIC joins.

The immutable API release documents site-scoped GETs for nodes, namespaces, pods and daemonsets.
After registration, all four completed live snapshots returned HTTP 200 for every endpoint, but each body contained zero items and an empty resource version.
These responses cannot prove the original Kubernetes node set, list completeness, service ownership or readiness.
A successful HTTP response is therefore insufficient health evidence.

Virtual Kubernetes configuration selects customer workload execution sites.
Kubernetes customer workload conditions do not establish the internal Secure Mesh CE service inventory.
Existing kubeconfig listing returns credential metadata; downloading kubeconfig is a separate credential creation operation.
This campaign used platform API credentials for fixed read-only proxy paths and did not create virtual Kubernetes objects, customer pods or kubeconfig credentials.

Upstream candidate checks validate exact operations, parameters, list/item references and identity fields.
They grant no lifecycle admission, inventory completeness or health mapping.
Thirty-five new rejection/contract tests and fifty-four prior focused contract tests pass.
The full upstream suite passed 2,991 tests with four skipped and one expected failure; all exact-head CI checks passed for `12334be67bd00294da52d24cb2c8bb3d026068f8`.
Validation succeeds against the pinned immutable OpenAPI; the current downloaded discovery document omits the proxy operations.

The health convergence window was interrupted when a read subprocess timed out after 600 seconds. Its shell child was in the operating system’s stopped state, and macOS denied resuming it; the original failure and executable attribution are retained. This attempt did not complete the required thirty-minute health window and cannot qualify HA.

Separately reviewed typed cleanup completed with eighteen independent absences, an empty destroy plan, stable state and repeated cleanup resume with no submission. Raw captures and Terraform artifacts remain private. Both PRs remain draft; upstream release and public installed acceptance depend on qualifying the owning required-service contract.

Read-only documentation confirms the virtual Kubernetes workload prerequisites: [create a vK8s object and download its kubeconfig](https://docs.cloud.f5.com/docs-v2/distributed-apps/how-to/app-mgnt/create-vk8s-obj) and [deploy workloads using that kubeconfig](https://docs.cloud.f5.com/docs-v2/distributed-apps/how-to/app-mgnt/vk8s-resources).
These customer workload instructions do not declare complete internal Secure Mesh service coverage.
