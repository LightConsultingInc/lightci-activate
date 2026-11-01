terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    github = {
      source  = "integrations/github"
      version = "~> 6.3"
    }
  }
}
