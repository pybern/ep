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

resource "kubernetes_deployment_v1" "nextjs_app" {
  metadata {
    name      = "${var.app_name}-app"
    namespace = var.k8s_namespace
    labels = {
      app = var.app_name
    }
  }

  spec {
    replicas = var.app_replicas

    selector {
      match_labels = {
        app = var.app_name
      }
    }

    template {
      metadata {
        labels = {
          app = var.app_name
        }
      }

      spec {
        image_pull_secrets {
          name = var.docker_registry_secret_name
        }

        container {
          name              = var.app_name
          image             = "${var.app_image_repository}:${var.app_image_tag}"
          image_pull_policy = "Always"

          port {
            container_port = var.app_port
            name           = "http"
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

          liveness_probe {
            http_get {
              path = "/"
              port = "http"
            }
            initial_delay_seconds = 15
            period_seconds        = 20
          }

          readiness_probe {
            http_get {
              path = "/"
              port = "http"
            }
            initial_delay_seconds = 5
            period_seconds        = 10
          }
        }
      }
    }
  }

  depends_on = [
    kubernetes_secret.harbor-access
  ]
}

resource "kubernetes_service_v1" "nextjs_service" {
  metadata {
    name      = "${var.app_name}-service"
    namespace = var.k8s_namespace
    labels = {
      app = var.app_name
    }
  }

  spec {
    selector = {
      app = var.app_name
    }

    port {
      name        = "http"
      port        = 80
      target_port = var.app_port
      protocol    = "TCP"
    }

    type = "ClusterIP"
  }
}
