# The customer side of LightCI's QA tenant in the EU cell: a real email domain with a real inbox, so
# the production walkthrough (docs/qa/eu-production-walkthrough.md) receives WorkOS invitations and
# codes exactly as a customer would. Mail to *@activate-qa.lciventure.com lands in an S3 bucket.
# Local state; nothing here is part of a cell. `terraform destroy` removes all of it.

terraform {
  required_version = ">= 1.9.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" {
  region = "eu-west-1" # SES receives mail in eu-west-1, not eu-central-1
}

variable "domain" {
  type    = string
  default = "activate-qa.lciventure.com"
}

variable "zone_id" {
  type    = string
  default = "Z02709411RIL5VJ45VIDP" # lciventure.com
}

variable "workos_verification_token" {
  description = "Token WorkOS shows on its domain verification page (the customer adds it as a TXT record). Empty until then."
  type        = string
  default     = ""
}

data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "inbox" {
  bucket        = "lightci-activate-qa-inbox"
  force_destroy = true
  tags          = { purpose = "activate-qa-tenant" }
}

resource "aws_s3_bucket_public_access_block" "inbox" {
  bucket                  = aws_s3_bucket.inbox.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "inbox" {
  bucket = aws_s3_bucket.inbox.id
  rule {
    id     = "expire-mail"
    status = "Enabled"
    filter {}
    expiration { days = 30 }
  }
}

resource "aws_s3_bucket_policy" "inbox" {
  bucket = aws_s3_bucket.inbox.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "SESWrites"
      Effect    = "Allow"
      Principal = { Service = "ses.amazonaws.com" }
      Action    = "s3:PutObject"
      Resource  = "${aws_s3_bucket.inbox.arn}/mail/*"
      Condition = {
        StringEquals = { "AWS:SourceAccount" = data.aws_caller_identity.current.account_id }
      }
    }]
  })
}

resource "aws_ses_domain_identity" "qa" {
  domain = var.domain
}

resource "aws_route53_record" "ses_verification" {
  zone_id = var.zone_id
  name    = "_amazonses.${var.domain}"
  type    = "TXT"
  ttl     = 300
  records = [aws_ses_domain_identity.qa.verification_token]
}

resource "aws_ses_domain_identity_verification" "qa" {
  domain     = aws_ses_domain_identity.qa.id
  depends_on = [aws_route53_record.ses_verification]
}

resource "aws_route53_record" "mx" {
  zone_id = var.zone_id
  name    = var.domain
  type    = "MX"
  ttl     = 300
  records = ["10 inbound-smtp.eu-west-1.amazonaws.com"]
}

# The customer's proof of domain ownership for WorkOS, added once the verification page shows it.
resource "aws_route53_record" "workos_verification" {
  count   = var.workos_verification_token == "" ? 0 : 1
  zone_id = var.zone_id
  name    = var.domain
  type    = "TXT"
  ttl     = 300
  records = ["verification_token=${var.workos_verification_token}"]
}

resource "aws_ses_receipt_rule_set" "qa" {
  rule_set_name = "activate-qa"
}

resource "aws_ses_receipt_rule" "inbox" {
  name          = "activate-qa-inbox"
  rule_set_name = aws_ses_receipt_rule_set.qa.rule_set_name
  recipients    = [var.domain]
  enabled       = true
  scan_enabled  = true

  s3_action {
    bucket_name       = aws_s3_bucket.inbox.id
    object_key_prefix = "mail/"
    position          = 1
  }
  depends_on = [aws_s3_bucket_policy.inbox, aws_ses_domain_identity_verification.qa]
}

resource "aws_ses_active_receipt_rule_set" "qa" {
  rule_set_name = aws_ses_receipt_rule_set.qa.rule_set_name
}

output "inbox" {
  value = "s3://${aws_s3_bucket.inbox.id}/mail/ (anything@${var.domain})"
}
