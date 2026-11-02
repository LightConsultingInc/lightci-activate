# Everything a cell needs before its own Terraform root can run: the state backend, the secret
# shells its tfvars refer to by name, the image mirror, and the role GitHub Actions assumes to
# deploy it. A customer's platform team does the equivalent in their account; this is ours.

locals {
  prefix = "activate-${var.cell}"
  tags   = merge({ product = "activate", cell = var.cell, layer = "bootstrap" }, var.tags)
}

data "aws_caller_identity" "this" {}

# --- Terraform state for the cell root -------------------------------------------------------

resource "aws_s3_bucket" "state" {
  bucket = "lightci-activate-tfstate-${var.cell}"
  tags   = local.tags

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_dynamodb_table" "locks" {
  name         = "lightci-activate-tfstate-locks-${var.cell}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"
  tags         = local.tags

  attribute {
    name = "LockID"
    type = "S"
  }

  lifecycle {
    prevent_destroy = true
  }
}

# --- Secret shells (values are written out of band) -------------------------------------------

resource "aws_secretsmanager_secret" "cell" {
  for_each = var.secret_names

  name                    = "${local.prefix}-${each.key}"
  description             = each.value
  recovery_window_in_days = 30
  tags                    = local.tags

  # Values are written by hand and exist nowhere else; a plan from a stale branch must not remove them.
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_secretsmanager_secret" "shared" {
  for_each = var.shared_secret_names

  name                    = each.key
  description             = each.value
  recovery_window_in_days = 30
  tags                    = merge(local.tags, { cell = "shared" })

  # Values are written by hand and exist nowhere else; a plan from a stale branch must not remove them.
  lifecycle {
    prevent_destroy = true
  }
}

# --- Image mirror: the deploy workflow copies each signed release from GHCR into the cell -----

resource "aws_ecr_repository" "image" {
  for_each = toset(["server", "web"])

  name                 = "activate/${each.key}"
  image_tag_mutability = "IMMUTABLE"
  tags                 = local.tags

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

resource "aws_ecr_lifecycle_policy" "image" {
  for_each   = toset(["server", "web"])
  repository = aws_ecr_repository.image[each.key].name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last 20 releases"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 20 }
      action       = { type = "expire" }
    }]
  })
}

# --- Deploy role for GitHub Actions (OIDC, scoped to this cell's environment) -------------------

data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

data "aws_iam_policy_document" "deploy_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # GitHub can issue the subject in the plain form or the immutable form that embeds the
    # organisation and repository ids (this repository uses the latter). Accept exactly these two.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_repository}:environment:${var.cell}-prod",
        "repo:${local.github_owner}@${var.github_owner_id}/${local.github_repo}@${data.github_repository.this.repo_id}:environment:${var.cell}-prod",
      ]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name                 = "${local.prefix}-deploy"
  description          = "Assumed by the ${var.cell}-prod GitHub environment to apply the cell and roll releases."
  assume_role_policy   = data.aws_iam_policy_document.deploy_trust.json
  max_session_duration = 2 * 3600
  tags                 = local.tags
}

resource "aws_iam_role_policy_attachment" "deploy" {
  role       = aws_iam_role.deploy.name
  policy_arn = var.deploy_policy_arn
}

# --- GitHub: the environment with reviewers, and the role ARN the workflow reads -----------------

locals {
  github_owner = split("/", var.github_repository)[0]
  github_repo  = split("/", var.github_repository)[1]
}

data "github_repository" "this" {
  full_name = var.github_repository
}


resource "github_repository_environment" "cell" {
  repository          = data.github_repository.this.name
  environment         = "${var.cell}-prod"
  prevent_self_review = false

  # Required reviewers on a private repository need GitHub Enterprise; on other plans the gate is that
  # the deploy workflow only runs by hand (workflow_dispatch), never on a tag push.
  dynamic "reviewers" {
    for_each = length(var.github_reviewer_ids) > 0 ? [1] : []
    content {
      users = var.github_reviewer_ids
    }
  }

  deployment_branch_policy {
    protected_branches     = false
    custom_branch_policies = true
  }
}

# Release tags are what deploy; the workflow runs from the tag, not a branch.
resource "github_repository_environment_deployment_policy" "tags" {
  repository  = data.github_repository.this.name
  environment = github_repository_environment.cell.environment
  tag_pattern = "v*"
}

resource "github_repository_environment_deployment_policy" "main" {
  repository     = data.github_repository.this.name
  environment    = github_repository_environment.cell.environment
  branch_pattern = "main"
}

resource "github_actions_secret" "deploy_role" {
  repository      = data.github_repository.this.name
  secret_name     = "AWS_DEPLOY_ROLE_${upper(var.cell)}"
  plaintext_value = aws_iam_role.deploy.arn
}
