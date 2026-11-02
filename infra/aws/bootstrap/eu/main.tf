# Bootstrap for the EU cell. State is local on purpose: this root creates the bucket the cell's
# own state lives in. It is small, keeps no secret values in state, and can be re-imported if lost.
#
#   export GITHUB_TOKEN=$(gh auth token)
#   terraform init && terraform apply
#   then write each secret value once, for example:
#   aws secretsmanager put-secret-value --secret-id activate-eu-workos --secret-string '{"api-key":"…","client-id":"…"}'

terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.60" }
    github = { source = "integrations/github", version = "~> 6.3" }
  }
}

provider "aws" {
  region = "eu-central-1"
}

provider "github" {
  owner = "LightConsultingInc"
}

module "bootstrap" {
  source = "../../modules/cell-bootstrap"

  cell                = "eu"
  region              = "eu-central-1"
  github_repository   = "LightConsultingInc/lightci-activate"
  github_owner_id     = 103854823 # gh api /repos/LightConsultingInc/lightci-activate/actions/oidc/customization/sub
  github_reviewer_ids = []        # required reviewers need GitHub Enterprise on a private repo; the deploy workflow is run by hand instead

  secret_names = {
    workos         = "Activate EU cell: WorkOS environment, JSON {\"api-key\",\"client-id\"}"
    anthropic      = "Activate EU cell: platform Anthropic key"
    secrets-key    = "Activate EU cell: AES-GCM key for stored credentials and the web session. Back up with the database."
    workos-webhook = "Activate EU cell: signing secret of the WorkOS webhook endpoint (plain string)"
  }
}
