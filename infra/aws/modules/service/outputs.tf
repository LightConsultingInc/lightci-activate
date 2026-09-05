output "ecr_repository_url" {
  value = aws_ecr_repository.this.repository_url
}

output "alb_dns_name" {
  value = aws_lb.this.dns_name
}

output "url" {
  value = var.domain_name == null ? "http://${aws_lb.this.dns_name}" : "${local.enable_https ? "https" : "http"}://${var.domain_name}"
}

output "alb_zone_id" {
  value = aws_lb.this.zone_id
}

output "service_security_group_id" {
  value = aws_security_group.service.id
}

output "cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "service_name" {
  value = aws_ecs_service.this.name
}
