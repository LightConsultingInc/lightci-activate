region             = "us-east-1"
name_prefix        = "lightci-activate-dev"
vpc_cidr_block     = "10.80.0.0/16"
enable_nat_gateway = false

# Creates/validates an ACM cert for *.lciventure.com and aliases this host to the ALB.
domain_name             = "lightci-activate-api.lciventure.com"
certificate_domain_name = "*.lciventure.com"
hosted_zone_id          = "Z02709411RIL5VJ45VIDP"

# Override per-deploy from CI: terraform apply -var image_tag=$GIT_SHA
image_tag = "latest"

# Plain (non-secret) env vars for the API container.
extra_environment = {}

# Secret env vars come from Secrets Manager. Create the secret once, e.g.:
#   aws secretsmanager create-secret --name lightci-activate-dev-some-api-key --secret-string '...'
# then map it here:
# extra_secrets = {
#   SOME_API_KEY = "arn:aws:secretsmanager:us-east-1:<account>:secret:lightci-activate-dev-some-api-key-XXXXXX"
# }
