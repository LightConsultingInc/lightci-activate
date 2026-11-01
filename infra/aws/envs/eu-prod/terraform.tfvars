cell           = "eu"
region         = "eu-central-1"
name_prefix    = "activate-eu"
vpc_cidr_block = "10.100.0.0/16"

web_host = "eu.activate.lightci.com"
api_host = "api.eu.activate.lightci.com"
mcp_host = "mcp.eu.activate.lightci.com"

# lightci.com hosted zone (Route 53 is global; the records point at EU load balancers)
hosted_zone_id = "REPLACE_WITH_LIGHTCI_COM_ZONE_ID"

# Secrets created out of band in eu-central-1; the EU cell has its own WorkOS environment.
workos_secret_arn               = "arn:aws:secretsmanager:eu-central-1:697675505408:secret:activate-eu-workos-REPLACE"
anthropic_api_key_secret_arn    = "arn:aws:secretsmanager:eu-central-1:697675505408:secret:activate-eu-anthropic-REPLACE"
encryption_key_secret_arn       = "arn:aws:secretsmanager:eu-central-1:697675505408:secret:activate-eu-secrets-key-REPLACE"
registry_credentials_secret_arn = "arn:aws:secretsmanager:eu-central-1:697675505408:secret:activate-ghcr-pull-REPLACE"

# Voice (OpenAI Realtime) stays off in the EU cell: no OPENAI_API_KEY.
extra_secrets = {}
