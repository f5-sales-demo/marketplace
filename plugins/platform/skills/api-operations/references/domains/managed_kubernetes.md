# Managed Kubernetes

Cluster RBAC, pod security, and container registries.

Category: Infrastructure. Complexity: moderate. Paths: 20. Schemas: 104.

## Use Cases

- Manage XCKS (Managed Kubernetes) cluster RBAC and security
- Configure pod security policies and admission controllers
- Manage container registries for enterprise deployments
- Integrate with external Kubernetes clusters (EKS, AKS, GKE)

## Resources

| Resource | Description | Tier | CRUD | Profile |
| ---------- | ------------- | ------ | ------ | --------- |
| mk8s_cluster | MK8s cluster | Advanced | - | resources/managed_kubernetes/mk8s_cluster.md |
| k8s_cluster_role | K8s cluster role | Advanced | C/R/U/D/L | resources/managed_kubernetes/k8s_cluster_role.md |
| container_registry | Container registry | Advanced | C/R/U/D/L | resources/managed_kubernetes/container_registry.md |

## Related Domains

`container_services`, `sites`, `service_mesh`
