k8s_config    = ""
k8s_namespace = "toi-compute"

app_name         = "ep-app"
image_repository = "dpsauatdk01.intra.hkma.gov.hk:8443/dockerhub-proxy/syedayanali28/tois"
image_tag        = "latest"

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