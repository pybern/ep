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