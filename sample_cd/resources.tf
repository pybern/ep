locals {
  app_labels = {
    app = var.app_name
  }
}

resource "kubernetes_secret" "registry" {
  count = var.create_image_pull_secret ? 1 : 0

  metadata {
    name      = var.docker_registry_secret_name
    namespace = var.k8s_namespace
  }

  data = {
    ".dockerconfigjson" = <<DOCKER
{
  "auths": {
    "${var.docker_registry_host}": {
      "auth": "${base64encode("${var.docker_registry_usr}:${var.docker_registry_psw}")}"
    }
  }
}
DOCKER
  }

  type = "kubernetes.io/dockerconfigjson"
}

resource "kubernetes_deployment_v1" "app" {
  metadata {
    name      = var.app_name
    namespace = var.k8s_namespace
    labels    = local.app_labels
  }

  spec {
    replicas = var.replicas

    selector {
      match_labels = local.app_labels
    }

    template {
      metadata {
        labels = local.app_labels
      }

      spec {
        dynamic "image_pull_secrets" {
          for_each = var.create_image_pull_secret ? [1] : []
          content {
            name = var.docker_registry_secret_name
          }
        }

        container {
          name              = var.app_name
          image             = "${var.image_repository}:${var.image_tag}"
          image_pull_policy = "Always"

          port {
            container_port = var.container_port
            name           = "http"
          }

          liveness_probe {
            http_get {
              path = "/"
              port = var.container_port
            }
            initial_delay_seconds = 15
            period_seconds        = 20
          }

          readiness_probe {
            http_get {
              path = "/"
              port = var.container_port
            }
            initial_delay_seconds = 5
            period_seconds        = 10
          }
        }
      }
    }
  }

  depends_on = [kubernetes_secret.registry]
}

resource "kubernetes_service_v1" "app" {
  metadata {
    name      = "${var.app_name}-service"
    namespace = var.k8s_namespace
    labels    = local.app_labels
  }

  spec {
    selector = local.app_labels
    type     = var.service_type

    port {
      name        = "http"
      port        = var.service_port
      target_port = var.container_port
      node_port   = var.service_type == "NodePort" ? var.node_port : null
    }
  }
}

resource "kubernetes_ingress_v1" "app" {
  count = var.ingress_enabled ? 1 : 0

  metadata {
    name      = "${var.app_name}-ingress"
    namespace = var.k8s_namespace
    labels    = local.app_labels
  }

  spec {
    ingress_class_name = var.ingress_class_name

    rule {
      host = var.ingress_host
      http {
        path {
          path      = "/"
          path_type = "Prefix"

          backend {
            service {
              name = kubernetes_service_v1.app.metadata[0].name
              port {
                number = var.service_port
              }
            }
          }
        }
      }
    }

    dynamic "tls" {
      for_each = var.ingress_tls_secret_name != "" ? [1] : []
      content {
        hosts       = [var.ingress_host]
        secret_name = var.ingress_tls_secret_name
      }
    }
  }
}
locals {
  app_labels = {
    app = var.app_name
  }
}

resource "kubernetes_secret" "registry" {
  count = var.create_image_pull_secret ? 1 : 0

  metadata {
    name      = var.docker_registry_secret_name
    namespace = var.k8s_namespace
  }

  data = {
    ".dockerconfigjson" = <<DOCKER
{
  "auths": {
    "${var.docker_registry_host}": {
      "auth": "${base64encode("${var.docker_registry_usr}:${var.docker_registry_psw}")}"
    }
  }
}
DOCKER
  }

  type = "kubernetes.io/dockerconfigjson"
}

resource "kubernetes_deployment_v1" "app" {
  metadata {
    name      = var.app_name
    namespace = var.k8s_namespace
    labels    = local.app_labels
  }

  spec {
    replicas = var.replicas

    selector {
      match_labels = local.app_labels
    }

    template {
      metadata {
        labels = local.app_labels
      }

      spec {
        dynamic "image_pull_secrets" {
          for_each = var.create_image_pull_secret ? [1] : []
          content {
            name = var.docker_registry_secret_name
          }
        }

        container {
          name              = var.app_name
          image             = "${var.image_repository}:${var.image_tag}"
          image_pull_policy = "Always"

          port {
            container_port = var.container_port
            name           = "http"
          }
        }
      }
    }
  }

  depends_on = [kubernetes_secret.registry]
}

resource "kubernetes_service_v1" "app" {
  metadata {
    name      = "${var.app_name}-service"
    namespace = var.k8s_namespace
    labels    = local.app_labels
  }

  spec {
    selector = local.app_labels
    type     = var.service_type

    port {
      name        = "http"
      port        = var.service_port
      target_port = var.container_port
      node_port   = var.service_type == "NodePort" ? var.node_port : null
    }
  }
}

resource "kubernetes_ingress_v1" "app" {
  count = var.ingress_enabled ? 1 : 0

  metadata {
    name      = "${var.app_name}-ingress"
    namespace = var.k8s_namespace
    labels    = local.app_labels
  }

  spec {
    ingress_class_name = var.ingress_class_name

    rule {
      host = var.ingress_host
      http {
        path {
          path      = "/"
          path_type = "Prefix"

          backend {
            service {
              name = kubernetes_service_v1.app.metadata[0].name
              port {
                number = var.service_port
              }
            }
          }
        }
      }
    }

    dynamic "tls" {
      for_each = var.ingress_tls_secret_name != "" ? [1] : []
      content {
        hosts       = [var.ingress_host]
        secret_name = var.ingress_tls_secret_name
      }
    }
  }
}
resource "kubernetes_secret" "kong-cluster-cert" {
  metadata {
    name = "kong-cluster-cert"
    namespace = var.k8s_namespace
  }

  data = {
    "tls.crt" = file("${path.root}/vars/${var.env_name}/tls.crt")
    "tls.key" = sensitive(file("${path.root}/vars/${var.env_name}/tls.key"))
  }

  type = "kubernetes.io/tls"
}

resource "kubernetes_secret" "ingress-tls" {
  metadata {
    name = "ingress-tls"
    namespace = var.k8s_namespace
  }

  data = {
    "tls.crt" = file("${path.root}/vars/${var.env_name}/ingress.crt")
    "tls.key" = sensitive(file("${path.root}/vars/${var.env_name}/ingress.key"))
  }

  type = "kubernetes.io/tls"
}

resource "kubernetes_ingress_v1" "internal-ingress" {
  metadata {
    name = "internal-ingress"
    namespace = var.k8s_namespace
    annotations = {
      "nginx.ingress.kubernetes.io/backend-protocol" = "HTTPS"
      "nginx.ingress.kubernetes.io/rewrite-target" = "/"
      "nginx.ingress.kubernetes.io/ssl-passthrough" = "true"
      "nginx.ingress.kubernetes.io/ssl-redirect" = "true"
    }
  }
  spec {
    ingress_class_name = "nginx"
    rule {
      host = var.internal_ingress_url
      http {
        path {
          path = "/"
          backend {
            service {
              name = "kong-dp-kong-proxy" 
              port {
                number = 443
              }
            }
          }
        }
      }
    }
    tls {
      hosts = [var.internal_ingress_url]
      secret_name = "ingress-tls"
    }
  }
  depends_on = [
    kubernetes_secret.ingress-tls,
    helm_release.kong-dp
  ]
}


resource "kubernetes_secret" "postgres-db-secrets" {
  metadata {
    name = "postgres-db-secrets"
    namespace = var.k8s_namespace
  }

  data = {
    "user" = sensitive("${var.postgres_username}")
    "password" = sensitive("${var.postgres_password}")
  }
}

resource "kubernetes_secret" "kong-enterprise-superuser-password" {
  metadata {
    name = "kong-enterprise-superuser-password"
    namespace = var.k8s_namespace
  }

  data = {
    "password" = sensitive("${var.superuser_password}")
  }
}

resource "kubernetes_secret" "kong-enterprise-license" {
  metadata {
    name = "kong-enterprise-license"
    namespace = var.k8s_namespace
  }

  data = {
    "license" = sensitive(file("${path.root}/vars/${var.env_name}/license.json"))
  }
}

resource "kubernetes_secret" "kong-session-config" {
  metadata {
    name = "kong-session-config"
    namespace = var.k8s_namespace
  }

  data = {
    "admin_gui_session_conf" = sensitive(file("${path.root}/vars/${var.env_name}/admin_gui_session_conf"))
    "portal_session_conf" = sensitive(file("${path.root}/vars/${var.env_name}/portal_session_conf"))
  }
}

resource "kubernetes_secret" "admin-gui-auth-conf" {
  metadata {
    name = "admin-gui-auth-conf"
    namespace = var.k8s_namespace
  }

  data = {
    "admin_gui_auth_conf" = sensitive(file("${path.root}/vars/${var.env_name}/admin_gui_auth_conf"))
  }
}

resource "kubernetes_service" "monitoring_service" {
  metadata {
    name = "kong-dp-kong-monitoring"
    namespace = var.k8s_namespace
  }
  spec {
    selector = {
      "app.kubernetes.io/instance"="kong-dp"
    }

    port {
      port        = 8100
      target_port = 8100
      name        = "metrics"
    }

    type = "ClusterIP"
  }
}


resource "kubernetes_secret" "harbor-access" {
  metadata {
    name = var.docker_registry_secret_name
    namespace = var.k8s_namespace
  }

  data = {
    ".dockerconfigjson" = <<DOCKER
{
  "auths": {
    "${var.docker_registry_host}": {
      "auth": "${base64encode("${var.docker_registry_usr}:${var.docker_registry_psw}")}"
    }
  }
}
DOCKER
  }

  type = "kubernetes.io/dockerconfigjson"
}


resource "helm_release" "kong-cp" {
  name = "kong-cp"
  namespace = var.k8s_namespace

  repository = "${var.chart_repo_kong}"
  chart      = "kong"
  version    = "${var.kong_helm_chart_version}"

  values = [
    "${file("${path.root}/vars/${var.env_name}/control-plane-values.yaml")}"
  ]

  depends_on = [
    kubernetes_secret.kong-cluster-cert,
    kubernetes_secret.kong-session-config,
    kubernetes_secret.kong-enterprise-superuser-password,
    kubernetes_secret.postgres-db-secrets,
    kubernetes_secret.kong-enterprise-license,
    kubernetes_secret.harbor-access,
    kubernetes_secret.ingress-tls
  ]
}

resource "helm_release" "kong-dp" {
  name = "kong-dp"
  namespace = var.k8s_namespace

  repository = "${var.chart_repo_kong}"
  chart      = "kong"
  version    = "${var.kong_helm_chart_version}"

  values = [
    "${file("${path.root}/vars/${var.env_name}/data-plane-values.yaml")}"
  ]

  depends_on = [
    kubernetes_secret.kong-cluster-cert,
    helm_release.kong-cp,
    kubernetes_secret.harbor-access,
    kubernetes_secret.ingress-tls
  ]
}
resource "kubernetes_secret" "kong-cluster-cert" {
  metadata {
    name = "kong-cluster-cert"
    namespace = var.k8s_namespace
  }

  data = {
    "tls.crt" = file("${path.root}/vars/${var.env_name}/tls.crt")
    "tls.key" = sensitive(file("${path.root}/vars/${var.env_name}/tls.key"))
  }

  type = "kubernetes.io/tls"
}

resource "kubernetes_secret" "ingress-tls" {
  metadata {
    name = "ingress-tls"
    namespace = var.k8s_namespace
  }

  data = {
    "tls.crt" = file("${path.root}/vars/${var.env_name}/ingress.crt")
    "tls.key" = sensitive(file("${path.root}/vars/${var.env_name}/ingress.key"))
  }

  type = "kubernetes.io/tls"
}

resource "kubernetes_ingress_v1" "internal-ingress" {
  metadata {
    name = "internal-ingress"
    namespace = var.k8s_namespace
    annotations = {
      "nginx.ingress.kubernetes.io/backend-protocol" = "HTTPS"
      "nginx.ingress.kubernetes.io/rewrite-target" = "/"
      "nginx.ingress.kubernetes.io/ssl-passthrough" = "true"
      "nginx.ingress.kubernetes.io/ssl-redirect" = "true"
    }
  }
  spec {
    ingress_class_name = "nginx"
    rule {
      host = var.internal_ingress_url
      http {
        path {
          path = "/"
          backend {
            service {
              name = "kong-dp-kong-proxy" 
              port {
                number = 443
              }
            }
          }
        }
      }
    }
    tls {
      hosts = [var.internal_ingress_url]
      secret_name = "ingress-tls"
    }
  }
  depends_on = [
    kubernetes_secret.ingress-tls,
    helm_release.kong-dp
  ]
}


resource "kubernetes_secret" "postgres-db-secrets" {
  metadata {
    name = "postgres-db-secrets"
    namespace = var.k8s_namespace
  }

  data = {
    "user" = sensitive("${var.postgres_username}")
    "password" = sensitive("${var.postgres_password}")
  }
}

resource "kubernetes_secret" "kong-enterprise-superuser-password" {
  metadata {
    name = "kong-enterprise-superuser-password"
    namespace = var.k8s_namespace
  }

  data = {
    "password" = sensitive("${var.superuser_password}")
  }
}

resource "kubernetes_secret" "kong-enterprise-license" {
  metadata {
    name = "kong-enterprise-license"
    namespace = var.k8s_namespace
  }

  data = {
    "license" = sensitive(file("${path.root}/vars/${var.env_name}/license.json"))
  }
}

resource "kubernetes_secret" "kong-session-config" {
  metadata {
    name = "kong-session-config"
    namespace = var.k8s_namespace
  }

  data = {
    "admin_gui_session_conf" = sensitive(file("${path.root}/vars/${var.env_name}/admin_gui_session_conf"))
    "portal_session_conf" = sensitive(file("${path.root}/vars/${var.env_name}/portal_session_conf"))
  }
}

resource "kubernetes_secret" "admin-gui-auth-conf" {
  metadata {
    name = "admin-gui-auth-conf"
    namespace = var.k8s_namespace
  }

  data = {
    "admin_gui_auth_conf" = sensitive(file("${path.root}/vars/${var.env_name}/admin_gui_auth_conf"))
  }
}

resource "kubernetes_service" "monitoring_service" {
  metadata {
    name = "kong-dp-kong-monitoring"
    namespace = var.k8s_namespace
  }
  spec {
    selector = {
      "app.kubernetes.io/instance"="kong-dp"
    }

    port {
      port        = 8100
      target_port = 8100
      name        = "metrics"
    }

    type = "ClusterIP"
  }
}


resource "kubernetes_secret" "harbor-access" {
  metadata {
    name = var.docker_registry_secret_name
    namespace = var.k8s_namespace
  }

  data = {
    ".dockerconfigjson" = <<DOCKER
{
  "auths": {
    "${var.docker_registry_host}": {
      "auth": "${base64encode("${var.docker_registry_usr}:${var.docker_registry_psw}")}"
    }
  }
}
DOCKER
  }

  type = "kubernetes.io/dockerconfigjson"
}


resource "helm_release" "kong-cp" {
  name = "kong-cp"
  namespace = var.k8s_namespace

  repository = "${var.chart_repo_kong}"
  chart      = "kong"
  version    = "${var.kong_helm_chart_version}"

  values = [
    "${file("${path.root}/vars/${var.env_name}/control-plane-values.yaml")}"
  ]

  depends_on = [
    kubernetes_secret.kong-cluster-cert,
    kubernetes_secret.kong-session-config,
    kubernetes_secret.kong-enterprise-superuser-password,
    kubernetes_secret.postgres-db-secrets,
    kubernetes_secret.kong-enterprise-license,
    kubernetes_secret.harbor-access,
    kubernetes_secret.ingress-tls
  ]
}

resource "helm_release" "kong-dp" {
  name = "kong-dp"
  namespace = var.k8s_namespace

  repository = "${var.chart_repo_kong}"
  chart      = "kong"
  version    = "${var.kong_helm_chart_version}"

  values = [
    "${file("${path.root}/vars/${var.env_name}/data-plane-values.yaml")}"
  ]

  depends_on = [
    kubernetes_secret.kong-cluster-cert,
    helm_release.kong-cp,
    kubernetes_secret.harbor-access,
    kubernetes_secret.ingress-tls
  ]
}
locals {
  app_labels = {
    app = var.app_name
  }
}

resource "kubernetes_secret" "registry" {
  count = var.create_image_pull_secret && var.docker_registry_host != "" && var.docker_registry_usr != "" && var.docker_registry_psw != "" ? 1 : 0

  metadata {
    name      = var.docker_registry_secret_name
    namespace = var.k8s_namespace
  }

  data = {
    ".dockerconfigjson" = <<DOCKER
{
  "auths": {
    "${var.docker_registry_host}": {
      "auth": "${base64encode("${var.docker_registry_usr}:${var.docker_registry_psw}")}"
    }
  }
}
DOCKER
  }

  type = "kubernetes.io/dockerconfigjson"
}

resource "kubernetes_deployment_v1" "app" {
  metadata {
    name      = var.app_name
    namespace = var.k8s_namespace
    labels    = local.app_labels
  }

  spec {
    replicas = var.replicas

    selector {
      match_labels = local.app_labels
    }

    template {
      metadata {
        labels = local.app_labels
      }

      spec {
        dynamic "image_pull_secrets" {
          for_each = length(kubernetes_secret.registry) > 0 ? [1] : []
          content {
            name = var.docker_registry_secret_name
          }
        }

        container {
          name              = var.app_name
          image             = "${var.image_repository}:${var.image_tag}"
          image_pull_policy = "Always"

          port {
            container_port = var.container_port
            name           = "http"
          }

          liveness_probe {
            http_get {
              path = "/"
              port = var.container_port
            }
            initial_delay_seconds = 15
            period_seconds        = 20
          }

          readiness_probe {
            http_get {
              path = "/"
              port = var.container_port
            }
            initial_delay_seconds = 5
            period_seconds        = 10
          }

          resources {
            requests = {
              cpu    = "100m"
              memory = "128Mi"
            }
            limits = {
              cpu    = "500m"
              memory = "512Mi"
            }
          }
        }
      }
    }
  }

  depends_on = [kubernetes_secret.registry]
}

resource "kubernetes_service_v1" "app" {
  metadata {
    name      = "${var.app_name}-service"
    namespace = var.k8s_namespace
    labels    = local.app_labels
  }

  spec {
    selector = local.app_labels
    type     = var.service_type

    port {
      name        = "http"
      port        = var.service_port
      target_port = var.container_port
      node_port   = var.service_type == "NodePort" ? var.node_port : null
    }
  }
}

resource "kubernetes_ingress_v1" "app" {
  count = var.ingress_enabled ? 1 : 0

  metadata {
    name      = "${var.app_name}-ingress"
    namespace = var.k8s_namespace
    labels    = local.app_labels
  }

  spec {
    ingress_class_name = var.ingress_class_name

    rule {
      host = var.ingress_host
      http {
        path {
          path      = "/"
          path_type = "Prefix"

          backend {
            service {
              name = kubernetes_service_v1.app.metadata[0].name
              port {
                number = var.service_port
              }
            }
          }
        }
      }
    }

    dynamic "tls" {
      for_each = var.ingress_tls_secret_name != "" ? [1] : []
      content {
        hosts       = [var.ingress_host]
        secret_name = var.ingress_tls_secret_name
      }
    }
  }
}
