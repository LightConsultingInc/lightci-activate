output "image_registry" {
  value = module.bootstrap.image_registry
}

output "deploy_role_arn" {
  value = module.bootstrap.deploy_role_arn
}

output "secret_arns" {
  value = module.bootstrap.secret_arns
}
