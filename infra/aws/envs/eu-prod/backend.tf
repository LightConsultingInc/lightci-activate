# State stays in the cell's region. Create the bucket and lock table once, then `terraform init`.
terraform {
  backend "s3" {
    bucket         = "lightci-activate-tfstate-eu"
    key            = "cells/eu-prod/terraform.tfstate"
    region         = "eu-central-1"
    dynamodb_table = "lightci-activate-tfstate-locks-eu"
    encrypt        = true
  }
}
