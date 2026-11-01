cell           = "us"
region         = "us-east-1"
name_prefix    = "activate-us"
vpc_cidr_block = "10.90.0.0/16"

web_host = "activate.lightci.com"
api_host = "api.activate.lightci.com"
mcp_host = "mcp.activate.lightci.com"

# lightci.com hosted zone
hosted_zone_id = "REPLACE_WITH_LIGHTCI_COM_ZONE_ID"

# Secrets created out of band in us-east-1 (see infra/README.md); the deploy workflow passes image_tag.
workos_secret_arn               = "arn:aws:secretsmanager:us-east-1:697675505408:secret:activate-us-workos-REPLACE"
anthropic_api_key_secret_arn    = "arn:aws:secretsmanager:us-east-1:697675505408:secret:activate-us-anthropic-REPLACE"
encryption_key_secret_arn       = "arn:aws:secretsmanager:us-east-1:697675505408:secret:activate-us-secrets-key-REPLACE"
registry_credentials_secret_arn = "arn:aws:secretsmanager:us-east-1:697675505408:secret:activate-ghcr-pull-REPLACE"

extra_secrets = {
  OPENAI_API_KEY = "arn:aws:secretsmanager:us-east-1:697675505408:secret:activate-us-openai-REPLACE"
}
