# TOIS CD (Ansible Automation + Terraform)

This folder is the deployment package consumed by the internal Ansible Automation Platform (AAP).
AAP runs these scripts in order:

1. `bin/aap/install`
2. `bin/aap/build`
3. `bin/aap/deploy`

The flow is:

1. Initialize Terraform backend in GitLab HTTP state storage.
2. Optionally build Docker image from this repo and push to internal registry.
3. Generate and review Terraform plan.
4. Apply Terraform plan to deploy/update Kubernetes resources.

## Input expected by AAP

AAP trigger payload:

```yaml
- { application_infra_url: 'https://gitlab.intra.hkma.gov.hk/xxx/xxx.git', application_infra_tag: 'tag_name' }
```

For TOIS, use:

```yaml
- { application_infra_url: 'https://gitlab.intra.hkma.gov.hk/do/genai-app/tois/tois.git', application_infra_tag: 'vX.Y.Z' }
```

`application_infra_tag` is used as deployment image tag when provided.

## Required runtime variables in AAP

Set these as job variables/credentials in AAP.

Required:

- `ENV_NAME` (example: `dev`)
- `GIT_PROJECT_ID` (for TOIS: `2696`)
- Git credential vars:
  - username via `GIT_USERNAME` (or `GIT_USER`)
  - token/password via `GIT_PASSWORD` (or `GIT_ACCESS_TOKEN` / `GIT_TOKEN`)
- `APPLICATION_INFRA_TAG` (optional, injected by AAP trigger payload)

Optional:

- `K8S_CONFIG_PATH` (path to kubeconfig file on runner; if omitted provider uses default kube auth context)
- `ANSIBLE_VAULT_SECRET_PATH` (only needed when `terraform-secret.tfvars` is vault-encrypted)
- `DOCKER_REGISTRY_HOST`, `DOCKER_REGISTRY_USERNAME`, `DOCKER_REGISTRY_PASSWORD`, `DOCKER_IMAGE_REPOSITORY` (only needed for image build/push mode)
- Harbor aliases (equivalent to docker vars in build script):
  - `HARBOR_HOST`, `HARBOR_USERNAME`, `HARBOR_PASSWORD`
  - either `HARBOR_IMAGE_REPOSITORY` or (`HARBOR_PROJECT` + `HARBOR_REPOSITORY`)

## Terraform vars layout

- Non-secret config: `vars/<env>/terraform-config.tfvars`
- Secret config (vault-encrypted): `vars/<env>/terraform-secret.tfvars`
- Runtime generated vars: `vars/<env>/terraform-runtime.auto.tfvars`
- Runtime vars always inject `image_tag`.
- Runtime vars inject `image_repository` and registry credentials only when provided in AAP env.

Example secret template:

```hcl
docker_registry_usr = "CHANGE_ME_REGISTRY_USER"
docker_registry_psw = "CHANGE_ME_REGISTRY_PASSWORD"
```

Keep `terraform-secret.tfvars` encrypted with `ansible-vault` only if your platform requires encrypted var files.

## Deployed Kubernetes objects

- `kubernetes_secret` for image pull auth
- `kubernetes_deployment_v1` for app pods
- `kubernetes_service_v1` for internal service
- optional `kubernetes_ingress_v1` when `ingress_enabled = true`

## Manual dry-run (local or runner shell)

From `sample_cd` directory:

```bash
export ENV_NAME=dev
export GIT_PROJECT_ID="2696"
export GIT_USERNAME="asaali"
export GIT_PASSWORD="<gitlab-pat>"
export APPLICATION_INFRA_TAG="v0.0.1"

./bin/aap/install
./bin/aap/build
./bin/aap/deploy
```

Optional vars:

```bash
export K8S_CONFIG_PATH="$HOME/.kube/config"
export ANSIBLE_VAULT_SECRET_PATH="<vault-password-file>"
export DOCKER_REGISTRY_HOST="dpsauatdk01.intra.hkma.gov.hk:8443"
export DOCKER_REGISTRY_USERNAME="<registry-user>"
export DOCKER_REGISTRY_PASSWORD="<registry-password>"
export DOCKER_IMAGE_REPOSITORY="dpsauatdk01.intra.hkma.gov.hk:8443/tois/tois"
```

Harbor-first equivalent:

```bash
export HARBOR_HOST="dpsauatdk01.intra.hkma.gov.hk:8443"
export HARBOR_USERNAME="<harbor-user>"
export HARBOR_PASSWORD="<harbor-password>"
export HARBOR_PROJECT="tois"
export HARBOR_REPOSITORY="tois"
# or export HARBOR_IMAGE_REPOSITORY="dpsauatdk01.intra.hkma.gov.hk:8443/tois/tois"
```

## Why Harbor

Harbor is your internal container registry, so it replaces Docker Hub for:

- image storage
- image pull/push authentication
- internal compliance/network access requirements

In this design, Harbor replaces the old GitHub Actions `docker-build-push.yml` path that pushed to Docker Hub.
AAP now builds/pushes to Harbor (or skips build if image already exists), and Terraform deploys that Harbor image into Kubernetes.
