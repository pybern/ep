variable "env_name" {
  type = string
}

variable "k8s_config" {
  type    = string
  default = ""
}

variable "k8s_namespace" {
  type    = string
  default = "toi-compute"
}

variable "app_name" {
  type    = string
  default = "ep-app"
}

variable "image_repository" {
  type    = string
  default = "dpsauatdk01.intra.hkma.gov.hk:8443/tois/tois"
}

variable "image_tag" {
  type = string
}

variable "container_port" {
  type    = number
  default = 3000
}

variable "replicas" {
  type    = number
  default = 1
}

variable "service_port" {
  type    = number
  default = 80
}

variable "service_type" {
  type    = string
  default = "ClusterIP"
}

variable "node_port" {
  type    = number
  default = null
}

variable "ingress_enabled" {
  type    = bool
  default = false
}

variable "ingress_host" {
  type    = string
  default = ""
}

variable "ingress_class_name" {
  type    = string
  default = "nginx"
}

variable "ingress_tls_secret_name" {
  type    = string
  default = ""
}

variable "create_image_pull_secret" {
  type    = bool
  default = true
}

variable "docker_registry_host" {
  type    = string
  default = "dpsauatdk01.intra.hkma.gov.hk:8443"
}

variable "docker_registry_usr" {
  type      = string
  sensitive = true
}

variable "docker_registry_psw" {
  type      = string
  sensitive = true
}

variable "docker_registry_secret_name" {
  type    = string
  default = "tois-uat-harbor-pull-secret"
}
