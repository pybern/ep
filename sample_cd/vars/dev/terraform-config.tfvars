k8s_config    = ""
k8s_namespace = "toi-compute"

app_name         = "ep-app"
image_repository = "dpsauatdk01.intra.hkma.gov.hk:8443/tois/tois"
image_tag        = "CHANGE_ME_FROM_APPLICATION_INFRA_TAG"

replicas       = 1
container_port = 3000
service_port   = 80
service_type   = "ClusterIP"
node_port      = null

ingress_enabled         = false
ingress_host            = ""
ingress_class_name      = "nginx"
ingress_tls_secret_name = ""

create_image_pull_secret    = true
docker_registry_secret_name = "tois-uat-harbor-pull-secret"
docker_registry_host        = "dpsauatdk01.intra.hkma.gov.hk:8443"
k8s_config    = ""
k8s_namespace = "toi-compute"

app_name         = "ep-app"
image_repository = "dpsauatdk01.intra.hkma.gov.hk:8443/tois/tois"
image_tag        = "CHANGE_ME_FROM_APPLICATION_INFRA_TAG"

replicas       = 1
container_port = 3000
service_port   = 80
service_type   = "ClusterIP"
node_port      = null

ingress_enabled         = false
ingress_host            = ""
ingress_class_name      = "nginx"
ingress_tls_secret_name = ""

create_image_pull_secret    = true
docker_registry_secret_name = "tois-uat-harbor-pull-secret"
docker_registry_host        = "dpsauatdk01.intra.hkma.gov.hk:8443"
k8s_namespace = "toi-compute"
app_name      = "ep-app"
replicas      = 1

container_port = 3000
service_port   = 80
service_type   = "ClusterIP"
node_port      = null

ingress_enabled         = false
ingress_host            = ""
ingress_class_name      = "nginx"
ingress_tls_secret_name = ""

create_image_pull_secret   = true
docker_registry_secret_name = "tois-uat-harbor-pull-secret"
docker_registry_host        = "dpsauatdk01.intra.hkma.gov.hk:8443"
image_repository            = "dpsauatdk01.intra.hkma.gov.hk:8443/tois/tois"
k8s_namespace = "cags"
docker_registry_secret_name = "harbor-access"
docker_registry_host = "https://dpsauatdk01.intra.hkma.gov.hk:8443"
chart_repo_kong = "https://dpsauatdk01.intra.hkma.gov.hk:8180/repository/helm-proxy-kong"

kong_license_key_name = "kong-enterprise-license"
kong_license_key_file_name = "license-key.json"

kong_helm_chart_version = "2.49.0"

internal_ingress_url = "cags.devdpsak8s.intra.hkma.gov.hk"
k8s_namespace = "toi-compute"
internal_ingress_url = "CHANGE_ME_INTERNAL_INGRESS_URL"

chart_repo_kong = "https://charts.konghq.com"
kong_helm_chart_version = "CHANGE_ME_KONG_HELM_CHART_VERSION"

docker_registry_secret_name = "tois-uat-harbor-pull-secret"
docker_registry_host = "dpsauatdk01.intra.hkma.gov.hk:8443"
