variable "region" {
  type    = string
  default = "us-east-1"
}

variable "name_prefix" {
  type    = string
  default = "lightci-activate-prod"
}

variable "vpc_cidr_block" {
  description = "CIDR block for the prod VPC."
  type        = string
  default     = "10.90.0.0/16"
}

variable "availability_zone_count" {
  description = "Number of availability zones to span with public and private subnets."
  type        = number
  default     = 2
}

variable "public_subnet_cidrs" {
  description = "Optional public subnet CIDR blocks. When empty, /24s are derived from vpc_cidr_block."
  type        = list(string)
  default     = []
}

variable "private_subnet_cidrs" {
  description = "Optional private subnet CIDR blocks. When empty, /24s are derived from vpc_cidr_block."
  type        = list(string)
  default     = []
}

variable "enable_nat_gateway" {
  description = "Whether private subnets should route outbound traffic through a NAT gateway."
  type        = bool
  default     = false
}

variable "certificate_arn" {
  description = "Existing ACM cert for the ALB. Null creates and validates one when domain_name is set."
  type        = string
  default     = null
}

variable "certificate_domain_name" {
  description = "Domain name for the managed ACM certificate when certificate_arn is null."
  type        = string
  default     = null
}

variable "domain_name" {
  type    = string
  default = null
}

variable "hosted_zone_id" {
  type    = string
  default = null
}

variable "image_tag" {
  type    = string
  default = "latest"
}

variable "extra_environment" {
  description = "Additional non-secret env vars to inject into the API container."
  type        = map(string)
  default     = {}
}

variable "extra_secrets" {
  description = "Secret env vars: env var name -> Secrets Manager ARN (e.g. SOME_API_KEY)."
  type        = map(string)
  default     = {}
}
