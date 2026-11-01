variable "cell" {
  description = "Short cell id (us, eu). Names everything: activate-<cell>-*."
  type        = string
}

variable "region" {
  type = string
}

variable "github_repository" {
  description = "owner/name of the repository whose deploy workflow may assume the cell's role."
  type        = string
}

variable "github_reviewer_ids" {
  description = "GitHub user ids who must approve a deployment to this cell's environment. Private repositories need GitHub Enterprise for this; empty on other plans."
  type        = list(number)
  default     = []
}

variable "secret_names" {
  description = <<-EOT
    Secrets Manager shells to create for this cell, keyed by purpose. Only the shell is managed here;
    the value is written once by hand (aws secretsmanager put-secret-value) and never enters state.
  EOT
  type        = map(string)
}

variable "shared_secret_names" {
  description = "Product-wide secret shells that live in this cell's region (the US cell holds the licence signing key)."
  type        = map(string)
  default     = {}
}

variable "deploy_policy_arn" {
  description = "Policy attached to the deploy role. Terraform manages the whole cell, so this is broad by necessity."
  type        = string
  default     = "arn:aws:iam::aws:policy/AdministratorAccess"
}

variable "tags" {
  type    = map(string)
  default = {}
}
