variable "cell" {
  type    = string
  default = "eu"
}

variable "region" {
  type    = string
  default = "eu-central-1"
}

variable "name_prefix" {
  type    = string
  default = "activate-eu"
}

variable "vpc_cidr_block" {
  type    = string
  default = "10.100.0.0/16"
}

variable "hosted_zone_id" {
  description = "Route 53 zone the cell's hosts live under (lciventure.com)."
  type        = string
}

variable "web_host" {
  type    = string
  default = "eu.activate.lciventure.com"
}

variable "api_host" {
  type    = string
  default = "api.eu.activate.lciventure.com"
}

variable "mcp_host" {
  type    = string
  default = "mcp.eu.activate.lciventure.com"
}

variable "image_tag" {
  description = "Release to run; the cells deploy workflow passes the tag after mirroring the signed images into ECR."
  type        = string
}

variable "image_registry" {
  description = "Registry path for the server and web images. Defaults to this account's ECR in the cell's region (infra/aws/bootstrap)."
  type        = string
  default     = null
}

variable "extra_secret_names" {
  description = "Environment variable -> Secrets Manager secret name in this region (platform fallbacks such as OPENAI_API_KEY)."
  type        = map(string)
  default     = {}
}

variable "workos_webhook_secret_name" {
  description = "Secrets Manager secret with the WorkOS webhook signing secret. Null until the webhook endpoint is registered in the WorkOS dashboard."
  type        = string
  default     = null
}

variable "extra_environment" {
  type    = map(string)
  default = {}
}

variable "db_instance_class" {
  type    = string
  default = "db.r7g.large"
}
