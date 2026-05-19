variable "env_name" {
  type = string
}

variable "k8s_config" {
  type    = string
  default = ""
}

variable "k8s_namespace" {
  type = string
}

variable "app_name" {
  type = string
}

variable "image_repository" {
  type = string
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
  type = string
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
  type = string
}
variable "env_name" {
  type = string
}

variable "k8s_config" {
  type    = string
  default = ""
}

variable "k8s_namespace" {
  type = string
}

variable "app_name" {
  type = string
}

variable "image_repository" {
  type = string
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
  type = string
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
  type = string
}
variable "env_name" {
  type        = string
}

variable "k8s_config" {
  type        = string
}

variable "k8s_namespace" {
  type        = string
  description = "namespace"
}

variable "internal_ingress_url" {
  type        = string
}

variable "docker_registry_host" {
  type        = string
}

variable "docker_registry_usr" {
  type        = string
  sensitive   = true
}

variable "docker_registry_psw" {
  type        = string
  sensitive   = true
}

variable "docker_registry_secret_name" {
  type        = string
}

variable "chart_repo_kong" {
  type        = string
  description = "helm chart repo"
}

variable "kong_license_key_file_name" {
  type        = string
}

variable "kong_license_key_name" {
  type        = string
}

variable "superuser_password" {
  type        = string
}

variable "postgres_username" {
  type        = string
}

variable "postgres_password" {
  type        = string
}

variable "kong_helm_chart_version" {
  type        = string
}
variable "env_name" {
  type = string
}

variable "k8s_config" {
  type        = string
  description = "Optional kubeconfig path; empty uses provider defaults"
  default     = ""
}

variable "k8s_namespace" {
  type = string
}

variable "internal_ingress_url" {
  type = string
}

variable "postgres_username" {
  type      = string
  sensitive = true
}

variable "postgres_password" {
  type      = string
  sensitive = true
}

variable "superuser_password" {
  type      = string
  sensitive = true
}

variable "docker_registry_secret_name" {
  type = string
}

variable "docker_registry_host" {
  type = string
}

variable "docker_registry_usr" {
  type      = string
  sensitive = true
}

variable "docker_registry_psw" {
  type      = string
  sensitive = true
}

variable "chart_repo_kong" {
  type = string
}

variable "kong_helm_chart_version" {
  type = string
}
variable "env_name" {
  type = string
}

variable "k8s_config" {
  type        = string
  description = "Optional kubeconfig path; empty uses provider defaults"
  default     = ""
}

variable "k8s_namespace" {
  type        = string
  description = "Kubernetes namespace for TOIS"
}

variable "app_name" {
  type        = string
  description = "Kubernetes app/deployment/service name"
}

variable "image_repository" {
  type        = string
  description = "Registry repository path (without tag)"
}

variable "image_tag" {
  type        = string
  description = "Image tag to deploy"
}

variable "container_port" {
  type        = number
  description = "Container exposed port"
  default     = 3000
}

variable "replicas" {
  type        = number
  description = "Deployment replica count"
  default     = 1
}

variable "service_port" {
  type        = number
  description = "Kubernetes service port"
  default     = 80
}

variable "service_type" {
  type        = string
  description = "Kubernetes service type"
  default     = "ClusterIP"
}

variable "node_port" {
  type        = number
  description = "NodePort value when service_type is NodePort"
  default     = null
}

variable "ingress_enabled" {
  type        = bool
  description = "Create ingress resource for the app"
  default     = false
}

variable "ingress_host" {
  type        = string
  description = "Ingress host name"
  default     = ""
}

variable "ingress_class_name" {
  type        = string
  description = "Ingress class name"
  default     = "nginx"
}

variable "ingress_tls_secret_name" {
  type        = string
  description = "Ingress TLS secret name; empty to disable TLS block"
  default     = ""
}

variable "create_image_pull_secret" {
  type        = bool
  description = "Create docker config pull secret"
  default     = false
}

variable "docker_registry_host" {
  type        = string
  description = "Registry host for imagePullSecret auth"
  default     = ""
}

variable "docker_registry_usr" {
  type      = string
  sensitive = true
  default   = ""
}

variable "docker_registry_psw" {
  type      = string
  sensitive = true
  default   = ""
}

variable "docker_registry_secret_name" {
  type = string
}