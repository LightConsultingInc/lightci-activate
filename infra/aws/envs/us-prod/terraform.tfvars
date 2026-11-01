cell           = "us"
region         = "us-east-1"
name_prefix    = "activate-us"
vpc_cidr_block = "10.90.0.0/16"

web_host = "activate.lciventure.com"
api_host = "api.activate.lciventure.com"
mcp_host = "mcp.activate.lciventure.com"

# lciventure.com hosted zone (shared with other LightCI products; records are per host)
hosted_zone_id = "Z02709411RIL5VJ45VIDP"

# Secrets are looked up by name (activate-us-workos, -anthropic, -secrets-key); see infra/aws/bootstrap/us.
extra_secret_names = {
  OPENAI_API_KEY = "activate-us-openai" # spoken interviews
}

# Set once the webhook endpoint https://api.activate.lciventure.com/api/webhooks/workos is registered in the WorkOS dashboard
# and its signing secret written to a secret of this name.
# workos_webhook_secret_name = "activate-us-workos-webhook"
