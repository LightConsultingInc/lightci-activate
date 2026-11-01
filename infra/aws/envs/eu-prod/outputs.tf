output "cluster_name" {
  value = module.activate.cluster_name
}

output "people_alb_dns_name" {
  value = module.activate.internal_alb_dns_name
}

output "mcp_alb_dns_name" {
  value = module.activate.mcp_alb_dns_name
}

output "migrate_command" {
  value = module.activate.migrate_command
}

output "db_endpoint" {
  value = module.activate.db_endpoint
}
