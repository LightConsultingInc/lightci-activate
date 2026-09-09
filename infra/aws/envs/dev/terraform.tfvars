region             = "us-east-1"
name_prefix        = "lightci-activate-dev"
vpc_cidr_block     = "10.80.0.0/16"
enable_nat_gateway = false

# ACM cert for *.lciventure.com; API and web hostnames alias to their ALBs.
domain_name     = "lightci-activate-api.lciventure.com"
web_domain_name = "lightci-activate.lciventure.com"
# The frontend people actually use lives on Vercel; the ECS web host stays reachable too.
public_web_url          = "https://activate.lightci.com"
certificate_domain_name = "*.lciventure.com"
hosted_zone_id          = "Z02709411RIL5VJ45VIDP"

# Override per-deploy from CI: terraform apply -var image_tag=$GIT_SHA
image_tag = "latest"

extra_environment = {}

# API secrets (Secrets Manager). Per-client Claude/Anthropic keys are uploaded in-app; these are LightCI's platform fallbacks.
extra_secrets = {
  WORKOS_API_KEY            = "arn:aws:secretsmanager:us-east-1:697675505408:secret:lightci-activate-dev-workos-api-key-AJB2L1"
  WORKOS_CLIENT_ID          = "arn:aws:secretsmanager:us-east-1:697675505408:secret:lightci-activate-dev-workos-client-id-Hbh96d"
  ANTHROPIC_API_KEY         = "arn:aws:secretsmanager:us-east-1:697675505408:secret:lightci-activate-dev-anthropic-api-key-13CVsO"
  OPENAI_API_KEY            = "arn:aws:secretsmanager:us-east-1:697675505408:secret:lightci-activate-dev-openai-api-key-gc61rQ"
  CLAUDE_COMPLIANCE_API_KEY = "arn:aws:secretsmanager:us-east-1:697675505408:secret:lightci-activate-dev-claude-compliance-api-key-KqY9LB"
  ACTIVATE_SECRETS_KEY      = "arn:aws:secretsmanager:us-east-1:697675505408:secret:lightci-activate-dev-activate-secrets-key-SEOSuF"
}

web_secrets = {
  WORKOS_API_KEY         = "arn:aws:secretsmanager:us-east-1:697675505408:secret:lightci-activate-dev-workos-api-key-AJB2L1"
  WORKOS_CLIENT_ID       = "arn:aws:secretsmanager:us-east-1:697675505408:secret:lightci-activate-dev-workos-client-id-Hbh96d"
  WORKOS_COOKIE_PASSWORD = "arn:aws:secretsmanager:us-east-1:697675505408:secret:lightci-activate-dev-workos-cookie-password-b0GI67"
}
