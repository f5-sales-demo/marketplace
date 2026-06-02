# site

Physical or cloud deployment location for edge services

Domain: `sites`. Tier: Standard. Logs: yes. Metrics: yes.

## Endpoints

| Op | Method | Path |
| ---- | -------- | ------ |
| Read | GET | /api/config/namespaces/{ns}/sites/{name} |
| Update | PUT | /api/config/namespaces/{ns}/sites/{name} |
| List | GET | /api/config/namespaces/{ns}/sites |

## Dependencies

Optional: virtual_site

## Relationship Hints

- virtual_site: Logical grouping of physical sites

## Additional Endpoints

| Method | Path | Summary |
| -------- | ------ | --------- |
| POST | /api/config/namespaces/{ns}/sites/{name}/local-kubeconfig | Create K8s Cluster Local Kube Config. |
| GET | /api/config/namespaces/{ns}/sites/{name}/local-kubeconfigs | List Local Kube Configs. |
| POST | /api/config/namespaces/{ns}/sites/{name}/upgrade_os | Upgrade OS. |
| POST | /api/config/namespaces/{ns}/sites/{name}/upgrade_sw | Upgrade SW. |
| GET | /api/config/namespaces/{ns}/sites/{site}/global_networks | Global Network List. |
| GET | /api/config/namespaces/{ns}/sites/{site}/segments | Segment List. |
| GET | /api/config/namespaces/{ns}/sites/{site}/interface | Interface List. |
