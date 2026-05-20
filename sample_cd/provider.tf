provider "kubernetes" {
  config_path = var.k8s_config
}

provider "helm" {
  kubernetes {
    config_path = var.k8s_config
  }
}