provider "kubernetes" {
  config_path = var.k8s_config != "" ? var.k8s_config : null
}
