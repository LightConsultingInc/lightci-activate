variable "name" {
  description = "Name prefix for DB resources (e.g. \"lightci-activate-dev\")."
  type        = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  description = "Private subnet IDs for the DB subnet group."
  type        = list(string)
}

variable "allowed_security_group_ids" {
  description = "Security groups allowed to reach PostgreSQL on 5432."
  type        = list(string)
}

variable "database_name" {
  type    = string
  default = "lightci_activate"
}

variable "db_username" {
  type    = string
  default = "postgres"
}

variable "engine" {
  type    = string
  default = "postgres"
}

variable "engine_version" {
  type    = string
  default = "16"
}

variable "instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "force_ssl" {
  description = "Set rds.force_ssl so every client connection must use TLS."
  type        = bool
  default     = true
}

variable "allocated_storage" {
  type    = number
  default = 20
}

variable "max_allocated_storage" {
  type    = number
  default = 100
}

variable "storage_type" {
  type    = string
  default = "gp3"
}

variable "backup_retention_days" {
  type    = number
  default = 14
}

variable "skip_final_snapshot" {
  type    = bool
  default = true
}

variable "deletion_protection" {
  type    = bool
  default = false
}

variable "performance_insights_enabled" {
  type    = bool
  default = false
}

variable "tags" {
  type    = map(string)
  default = {}
}
