output "state_bucket" {
  value = aws_s3_bucket.state.bucket
}

output "lock_table" {
  value = aws_dynamodb_table.locks.name
}

output "secret_arns" {
  description = "Cell secret shells by purpose."
  value       = { for k, s in aws_secretsmanager_secret.cell : k => s.arn }
}

output "shared_secret_arns" {
  value = { for k, s in aws_secretsmanager_secret.shared : k => s.arn }
}

output "image_registry" {
  description = "Registry path the cell root pulls from: <account>.dkr.ecr.<region>.amazonaws.com/activate"
  value       = "${data.aws_caller_identity.this.account_id}.dkr.ecr.${var.region}.amazonaws.com/activate"
}

output "deploy_role_arn" {
  value = aws_iam_role.deploy.arn
}

output "github_environment" {
  value = github_repository_environment.cell.environment
}
