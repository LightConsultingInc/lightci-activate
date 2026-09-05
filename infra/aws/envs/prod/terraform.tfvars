region             = "us-east-1"
name_prefix        = "lightci-activate-prod"
vpc_cidr_block     = "10.90.0.0/16"
enable_nat_gateway = true

# Set the production hostname before applying DNS. The certificate domain should
# remain *.lciventure.com for the lciventure.com hosted zone below.
# domain_name             = "lightci-activate-api.lciventure.com"
# certificate_domain_name = "*.lciventure.com"
hosted_zone_id = "Z02709411RIL5VJ45VIDP"

image_tag = "latest"

# extra_secrets = {
#   SOME_API_KEY = "arn:aws:secretsmanager:us-east-1:<account>:secret:lightci-activate-prod-some-api-key-XXXXXX"
# }
