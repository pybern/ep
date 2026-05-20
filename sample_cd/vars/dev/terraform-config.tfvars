k8s_namespace = "tois"
docker_registry_secret_name = "harbor-access"
docker_registry_host = "dpsauatdk01.intra.hkma.gov.hk:8443"
chart_repo_kong = "https://dpsauatdk01.intra.hkma.gov.hk:8180/repository/helm-proxy-kong"

app_name = "ep"
app_image_repository = "dpsauatdk01.intra.hkma.gov.hk:8443/tois/ep"
app_image_tag = "latest"
app_replicas = 1
app_port = 3000

kong_license_key_name = "kong-enterprise-license"
kong_license_key_file_name = "license-key.json"

kong_helm_chart_version = "2.49.0"

internal_ingress_url = "cags.devdpsak8s.intra.hkma.gov.hk"
