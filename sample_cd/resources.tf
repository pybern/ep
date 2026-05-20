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
