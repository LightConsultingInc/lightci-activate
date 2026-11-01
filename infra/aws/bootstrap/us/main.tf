# Bootstrap for the US cell. State is local on purpose: this root creates the bucket the cell's
# own state lives in. It is small, keeps no secret values in state, and can be re-imported if lost.
#
#   export GITHUB_TOKEN=$(gh auth token)
#   terraform init && terraform apply
#   then write each secret value once, for example:
#   aws secretsmanager put-secret-value --secret-id activate-us-workos --secret-string '{"api-key":"…","client-id":"…"}'

terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.60" }
    github = { source = "integrations/github", version = "~> 6.3" }
  }
}

provider "aws" {
  region = "us-east-1"
}

provider "github" {
  owner = "LightConsultingInc"
}

module "bootstrap" {
  source = "../../modules/cell-bootstrap"

  cell                = "us"
  region              = "us-east-1"
  github_repository   = "LightConsultingInc/lightci-activate"
  github_reviewer_ids = [] # required reviewers need GitHub Enterprise on a private repo; the deploy workflow is run by hand instead

  secret_names = {
    workos      = "Activate US cell: WorkOS environment, JSON {\"api-key\",\"client-id\"}"
    anthropic   = "Activate US cell: platform Anthropic key"
    secrets-key = "Activate US cell: AES-GCM key for stored credentials and the web session. Back up with the database."
    openai      = "Activate US cell: OpenAI key for spoken interviews (voice stays off in the EU cell)"
  }

  shared_secret_names = {
    activate-license-signing-key = "Ed25519 private JWK that signs Activate licences (kid lightci-license-2026). The only durable copy."
  }
}
