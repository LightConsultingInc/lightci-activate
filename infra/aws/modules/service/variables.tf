variable "name" {
  description = "Name prefix for service resources (e.g. \"lightci-activate-dev\")."
  type        = string
}

variable "region" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "public_subnet_ids" {
  type = list(string)
}

variable "task_subnet_ids" {
  description = "Subnets used by ECS tasks. Defaults to private_subnet_ids."
  type        = list(string)
  default     = null
}

variable "assign_public_ip" {
  description = "Whether ECS tasks receive public IPs."
  type        = bool
  default     = false
}

variable "container_port" {
  type    = number
  default = 3000
}

variable "cpu_architecture" {
  description = "Fargate CPU architecture. X86_64 lets CI build images without QEMU."
  type        = string
  default     = "X86_64"
}

variable "cpu" {
  type    = number
  default = 1024
}

variable "memory" {
  type    = number
  default = 2048
}

variable "desired_count" {
  type    = number
  default = 1
}

variable "image_tag" {
  description = "Image tag deployed to ECS. CI typically overrides per release."
  type        = string
  default     = "latest"
}

variable "environment" {
  description = "Plain (non-secret) env vars to inject into the container."
  type        = map(string)
  default     = {}
}

variable "db_secret_arn" {
  description = "Secrets Manager ARN holding DB credentials."
  type        = string
}

variable "extra_secrets" {
  description = "Extra secret env vars: env var name -> Secrets Manager ARN (e.g. SOME_API_KEY)."
  type        = map(string)
  default     = {}
}

variable "certificate_arn" {
  description = "Existing ACM cert ARN for HTTPS listener. When null and domain_name is set, the module creates a DNS-validated ACM certificate."
  type        = string
  default     = null
}

variable "certificate_domain_name" {
  description = "Domain name for the managed ACM certificate when certificate_arn is null. Defaults to domain_name."
  type        = string
  default     = null
}

variable "domain_name" {
  description = "Public domain to alias to the ALB. Null skips DNS."
  type        = string
  default     = null
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone for `domain_name`. Required if domain_name is set."
  type        = string
  default     = null
}

variable "health_check_path" {
  type    = string
  default = "/api/health"
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "ecr_force_delete" {
  type    = bool
  default = false
}

variable "tags" {
  type    = map(string)
  default = {}
}
