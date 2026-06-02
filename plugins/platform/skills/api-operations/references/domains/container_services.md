# Container Services

Containerized workloads and virtual Kubernetes clusters.

Category: Infrastructure. Complexity: moderate. Paths: 13. Schemas: 166.

## Use Cases

- Deploy XCCS (Container Services) namespaces for multi-tenant workloads
- Manage container workloads with simplified orchestration
- Configure distributed edge container deployments
- Run containerized applications without full K8s complexity

## Resources

| Resource | Description | Tier | CRUD | Profile |
| ---------- | ------------- | ------ | ------ | --------- |
| virtual_k8s | Virtual K8s | Advanced | C/R/U/D/L | resources/container_services/virtual_k8s.md |
| workload | Workload | Advanced | C/R/U/D/L | resources/container_services/workload.md |
| pod_security_policy | Pod security policy | Advanced | - | resources/container_services/pod_security_policy.md |

## Dependency Graph

- workload requires: virtual_k8s

## Creation Order

1. pod_security_policy (no dependencies)
2. virtual_k8s (no dependencies)
3. workload (depends: virtual_k8s)

## Related Domains

`managed_kubernetes`, `sites`, `service_mesh`
