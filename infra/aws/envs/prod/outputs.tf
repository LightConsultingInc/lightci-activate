output "url" {
  value = module.service.url
}

output "vpc_id" {
  value = module.network.vpc_id
}

output "private_subnet_ids" {
  value = module.network.private_subnet_ids
}

output "public_subnet_ids" {
  value = module.network.public_subnet_ids
}

output "alb_dns_name" {
  value = module.service.alb_dns_name
}

output "ecr_repository_url" {
  value = module.service.ecr_repository_url
}

output "db_secret_arn" {
  value     = module.database.secret_arn
  sensitive = true
}

output "db_endpoint" {
  value = module.database.cluster_endpoint
}
