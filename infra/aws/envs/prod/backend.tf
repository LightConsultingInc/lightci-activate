# Fill in once you've created the state bucket + lock table, then `terraform init`.
# terraform {
#   backend "s3" {
#     bucket         = "lightci-activate-tfstate"
#     key            = "aws/prod/terraform.tfstate"
#     region         = "us-east-1"
#     dynamodb_table = "lightci-activate-tfstate-locks"
#     encrypt        = true
#   }
# }
