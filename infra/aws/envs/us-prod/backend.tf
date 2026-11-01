# State stays in the cell's region. Create the bucket and lock table once, then `terraform init`.
terraform {
  backend "s3" {
    bucket         = "lightci-activate-tfstate-us"
    key            = "cells/us-prod/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "lightci-activate-tfstate-locks-us"
    encrypt        = true
  }
}
