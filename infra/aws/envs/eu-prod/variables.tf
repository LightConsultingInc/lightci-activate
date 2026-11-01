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
  description = "Route 53 zone for lightci.com."
  type        = string
}

variable "web_host" {
  type    = string
  default = "eu.activate.lightci.com"
}

variable "api_host" {
  type    = string
  default = "api.eu.activate.lightci.com"
}

variable "mcp_host" {
  type    = string
  default = "mcp.eu.activate.lightci.com"
}

variable "image_registry" {
  type    = string
  default = "ghcr.io/lightci/activate"
}

variable "image_tag" {
  description = "Release to run; the cells deploy workflow passes the tag."
  type        = string
}

variable "registry_credentials_secret_arn" {
  type    = string
  default = null
}

variable "workos_secret_arn" {
  description = "Secrets Manager JSON {api-key, client-id} for this cell's WorkOS environment."
  type        = string
}

variable "anthropic_api_key_secret_arn" {
  type = string
}

variable "encryption_key_secret_arn" {
  type = string
}

variable "extra_secrets" {
  description = "Platform fallbacks: OPENAI_API_KEY, CLAUDE_* keys."
  type        = map(string)
  default     = {}
}

variable "extra_environment" {
  type    = map(string)
  default = {}
}

variable "db_instance_class" {
  type    = string
  default = "db.r7g.large"
}
