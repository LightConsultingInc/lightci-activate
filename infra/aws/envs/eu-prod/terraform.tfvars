cell           = "eu"
region         = "eu-central-1"
name_prefix    = "activate-eu"
vpc_cidr_block = "10.100.0.0/16"

web_host = "eu.activate.lciventure.com"
api_host = "api.eu.activate.lciventure.com"
mcp_host = "mcp.eu.activate.lciventure.com"

# lciventure.com hosted zone (shared with other LightCI products; records are per host)
hosted_zone_id = "Z02709411RIL5VJ45VIDP"

# Secrets are looked up by name (activate-eu-workos, -anthropic, -secrets-key); see infra/aws/bootstrap/eu.
# Voice (OpenAI Realtime) stays off in the EU cell: no OPENAI_API_KEY.
extra_secret_names = {}

# Set once the webhook endpoint https://api.eu.activate.lciventure.com/api/webhooks/workos is registered in the WorkOS dashboard
# and its signing secret written to a secret of this name.
workos_webhook_secret_name = "activate-eu-workos-webhook"
