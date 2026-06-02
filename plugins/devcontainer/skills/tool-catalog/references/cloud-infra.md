# Cloud & Infrastructure Tools

## Cloud Provider CLIs

## aws

- **Package**: AWS CLI v2, manual install (`curl`, `unzip`, `./aws/install`)
- **Purpose**: Command-line interface for Amazon Web Services
- **Use when**: Managing AWS resources, querying EC2/S3/IAM/Lambda, deploying infrastructure, scripting AWS operations
- **Quick start**:
  - `aws s3 ls`
  - `aws ec2 describe-instances --query 'Reservations[].Instances[].{ID:InstanceId,State:State.Name}' --output table`
  - `aws sts get-caller-identity`
- **Auth**: `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` env vars, or `aws configure`, or IAM instance profile
- **Docs**: `aws help` or <https://docs.aws.amazon.com/cli/latest/reference/>

## az

- **Package**: `azure-cli` via apt
- **Purpose**: Command-line interface for Microsoft Azure
- **Use when**: Managing Azure resources, deploying to AKS/App Service, querying subscriptions, scripting Azure operations
- **Quick start**:
  - `az account show`
  - `az group list --output table`
  - `az vm list --output table`
- **Auth**: `az login` (interactive or service principal via `--service-principal`)
- **Docs**: `az help` or <https://learn.microsoft.com/en-us/cli/azure/>

## gcloud

- **Package**: `google-cloud-cli` via apt
- **Purpose**: Command-line interface for Google Cloud Platform
- **Use when**: Managing GCP resources, deploying to GKE/Cloud Run, querying projects, scripting GCP operations
- **Quick start**:
  - `gcloud config list`
  - `gcloud compute instances list`
  - `gcloud projects list`
- **Auth**: `gcloud auth login` (interactive) or `gcloud auth activate-service-account --key-file=key.json`
- **Docs**: `gcloud help` or <https://cloud.google.com/sdk/docs/>

## ibmcloud

- **Package**: Manual download, pinned v2.41.1
- **Purpose**: Command-line interface for IBM Cloud
- **Use when**: Managing IBM Cloud resources, working with IBM Cloud services, scripting IBM Cloud operations
- **Quick start**:
  - `ibmcloud login`
  - `ibmcloud resource groups`
  - `ibmcloud ks cluster ls`
- **Auth**: `ibmcloud login` (interactive or `--apikey API_KEY`)
- **Docs**: `ibmcloud help` or <https://cloud.ibm.com/docs/cli>

---

## Infrastructure as Code

## terraform

- **Package**: `terraform` via apt, managed by `tfenv`
- **Purpose**: Declarative infrastructure provisioning across cloud providers
- **Use when**: Creating/modifying cloud infrastructure, planning changes, managing state, multi-cloud deployments
- **Quick start**:
  - `terraform init`
  - `terraform plan`
  - `terraform apply`
- **Auth**: Varies by provider (AWS credentials, Azure service principal, GCP service account, etc.)
- **Docs**: `terraform -help` or <https://developer.hashicorp.com/terraform/docs>

## tfenv

- **Package**: `tfenv` (bundled with terraform install)
- **Purpose**: Terraform version manager for switching between Terraform versions
- **Use when**: Working with projects requiring different Terraform versions, testing upgrades, pinning versions
- **Quick start**:
  - `tfenv list`
  - `tfenv install 1.7.0`
  - `tfenv use 1.7.0`
- **Auth**: None
- **Docs**: <https://github.com/tfutils/tfenv>

## terragrunt

- **Package**: Manual download
- **Purpose**: Terraform wrapper that promotes DRY configurations and manages remote state
- **Use when**: Managing multiple Terraform modules, keeping backend config DRY, orchestrating dependent modules
- **Quick start**:
  - `terragrunt init`
  - `terragrunt plan`
  - `terragrunt run-all apply`
- **Auth**: Same as Terraform (inherits provider credentials)
- **Docs**: `terragrunt --help` or <https://terragrunt.gruntwork.io/docs/>

## terraform-docs

- **Package**: Manual download
- **Purpose**: Auto-generate documentation from Terraform modules
- **Use when**: Generating input/output tables for modules, keeping readme in sync with variables, CI documentation checks
- **Quick start**:
  - `terraform-docs markdown table .`
  - `terraform-docs markdown table --output-file README.md .`
  - `terraform-docs json .`
- **Auth**: None
- **Docs**: `terraform-docs --help` or <https://terraform-docs.io/>

## tflint

- **Package**: Manual download
- **Purpose**: Terraform linter for detecting errors, enforcing best practices, and checking provider-specific issues
- **Use when**: Validating Terraform code before apply, CI lint checks, catching deprecated syntax
- **Quick start**:
  - `tflint --init`
  - `tflint`
  - `tflint --format json`
- **Auth**: None
- **Docs**: `tflint --help` or <https://github.com/terraform-linters/tflint>

## Ansible

- **Package**: `ansible` via pip
- **Purpose**: Agentless IT automation for configuration management, application deployment, and orchestration
- **Use when**: Configuring remote servers, deploying applications, orchestrating multi-step workflows, managing infrastructure state
- **Quick start**:
  - `ansible all -m ping -i inventory.ini`
  - `ansible-playbook site.yml -i inventory.ini`
  - `ansible-playbook site.yml --check --diff`
- **Auth**: SSH keys for remote hosts, or `ansible-vault` for encrypted secrets
- **Docs**: `ansible --help` or <https://docs.ansible.com/>

## ansible-lint

- **Package**: `ansible-lint` via pip
- **Purpose**: Linter for Ansible playbooks to enforce best practices and detect issues
- **Use when**: Validating playbooks before execution, CI quality checks, enforcing team standards
- **Quick start**:
  - `ansible-lint site.yml`
  - `ansible-lint -p roles/`
  - `ansible-lint --write site.yml` (autofix)
- **Auth**: None
- **Docs**: `ansible-lint --help` or <https://ansible.readthedocs.io/projects/lint/>

---

## Kubernetes

## kubectl

- **Package**: Manual download
- **Purpose**: Command-line tool for managing Kubernetes clusters
- **Use when**: Deploying workloads, inspecting cluster state, debugging pods, managing resources
- **Quick start**:
  - `kubectl get pods -A`
  - `kubectl describe pod my-pod -n my-namespace`
  - `kubectl logs -f deployment/my-app`
- **Auth**: Kubeconfig file (`~/.kube/config` or `KUBECONFIG` env var)
- **Docs**: `kubectl help` or <https://kubernetes.io/docs/reference/kubectl/>

## helm

- **Package**: Manual download
- **Purpose**: Kubernetes package manager for deploying and managing Helm charts
- **Use when**: Installing applications on Kubernetes, managing releases, templating manifests, upgrading deployments
- **Quick start**:
  - `helm repo add stable https://charts.helm.sh/stable && helm repo update`
  - `helm install my-release chart-name`
  - `helm list -A`
- **Auth**: Kubeconfig (same as kubectl)
- **Docs**: `helm help` or <https://helm.sh/docs/>

## kustomize

- **Package**: Manual download
- **Purpose**: Template-free customization of Kubernetes manifests using overlays and patches
- **Use when**: Managing environment-specific configs, patching base manifests, building manifests without Helm
- **Quick start**:
  - `kustomize build overlays/production`
  - `kustomize build . | kubectl apply -f -`
  - `kustomize edit set image my-app=my-app:v2`
- **Auth**: None (output applied via kubectl)
- **Docs**: `kustomize --help` or <https://kubectl.docs.kubernetes.io/references/kustomize/>

## kubeconform

- **Package**: Manual download
- **Purpose**: Fast Kubernetes manifest validator against JSON schemas
- **Use when**: Validating manifests in CI pipelines, checking resource definitions before apply, schema compliance
- **Quick start**:
  - `kubeconform deployment.yaml`
  - `kubeconform -summary -output json manifests/`
  - `kustomize build . | kubeconform -strict`
- **Auth**: None
- **Docs**: `kubeconform -h` or <https://github.com/yannh/kubeconform>

## oc

- **Package**: Manual download
- **Purpose**: OpenShift CLI, a superset of kubectl with OpenShift-specific commands
- **Use when**: Managing OpenShift clusters, creating projects/routes, deploying to OpenShift, using OpenShift-specific features
- **Quick start**:
  - `oc login https://api.cluster.example.com:6443`
  - `oc get routes -A`
  - `oc new-project my-project`
- **Auth**: `oc login` with username/password or token
- **Docs**: `oc help` or <https://docs.openshift.com/container-platform/latest/cli_reference/openshift_cli/getting-started-cli.html>

---

## Container & CI/CD

## act

- **Package**: Manual download
- **Purpose**: Run GitHub Actions workflows locally for testing before pushing
- **Use when**: Testing workflow changes locally, debugging CI failures, iterating on Actions without pushing
- **Quick start**:
  - `act`
  - `act -j build`
  - `act -l` (list available jobs)
- **Auth**: None (may need `GITHUB_TOKEN` for API-dependent actions)
- **Docs**: `act --help` or <https://github.com/nektos/act>

## actionlint

- **Package**: Manual download
- **Purpose**: Static analysis tool for GitHub Actions workflow files
- **Use when**: Validating workflow YAML syntax, catching expression errors, CI linting of workflow files
- **Quick start**:
  - `actionlint`
  - `actionlint .github/workflows/ci.yml`
  - `actionlint -format '{{json .}}'`
- **Auth**: None
- **Docs**: `actionlint -h` or <https://github.com/rhysd/actionlint>

## goreleaser

- **Package**: Manual download
- **Purpose**: Release automation tool for Go projects (build, package, publish)
- **Use when**: Building Go binaries for multiple platforms, creating GitHub releases, publishing artifacts
- **Quick start**:
  - `goreleaser check`
  - `goreleaser release --snapshot --clean`
  - `goreleaser build --single-target`
- **Auth**: `GITHUB_TOKEN` env var for publishing releases
- **Docs**: `goreleaser --help` or <https://goreleaser.com/>

## gh

- **Package**: `gh` via apt
- **Purpose**: GitHub CLI for managing repositories, issues, pull requests, and workflows
- **Use when**: Creating PRs/issues, checking CI status, managing releases, interacting with GitHub API
- **Quick start**:
  - `gh pr list`
  - `gh issue create --title "Bug" --body "Description"`
  - `gh run list --workflow ci.yml`
- **Auth**: `GITHUB_TOKEN` env var or `gh auth login`
- **Docs**: `gh help` or <https://cli.github.com/manual/>

## renovate

- **Package**: `renovate` via npm
- **Purpose**: Automated dependency update tool that creates PRs for outdated packages
- **Use when**: Setting up automated dependency management, running one-off dependency scans, managing update policies
- **Quick start**:
  - `LOG_LEVEL=debug renovate --platform=local`
  - `renovate --dry-run username/repo`
  - `renovate --print-config`
- **Auth**: `GITHUB_TOKEN` or `RENOVATE_TOKEN` env var for GitHub integration
- **Docs**: <https://docs.renovatebot.com/>

## @devcontainers/cli

- **Package**: `@devcontainers/cli` via npm
- **Purpose**: CLI for building, running, and managing dev containers
- **Use when**: Building devcontainer images, testing devcontainer configurations, CI-based container builds
- **Quick start**:
  - `devcontainer build --workspace-folder .`
  - `devcontainer up --workspace-folder .`
  - `devcontainer features test -f my-feature .`
- **Auth**: None (may need registry credentials for private base images)
- **Docs**: `devcontainer --help` or <https://containers.dev/>
