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

variable "app_name" {
  type        = string
  description = "Next.js application name"
}

variable "app_image_repository" {
  type        = string
  description = "Harbor image repository without tag"
}

variable "app_image_tag" {
  type        = string
  description = "Image tag deployed to Kubernetes"
}

variable "app_replicas" {
  type        = number
  description = "Number of app replicas"
}

variable "app_port" {
  type        = number
  description = "Container and service port for app"
}