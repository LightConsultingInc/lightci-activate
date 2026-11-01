# LightCI's EU cell: the same module customers run, with the cloud edition and WorkOS.
# Everything in this root lives in one region; nothing here talks to the US cell.

module "network" {
  source                  = "../../modules/network"
  name                    = var.name_prefix
  vpc_cidr_block          = var.vpc_cidr_block
  availability_zone_count = 3
  enable_nat_gateway      = true
  tags                    = local.tags
}

locals {
  tags = {
    product = "activate"
    cell    = var.cell
    region  = var.region
  }
}

# Certificates in region, validated through the shared lightci.com zone.
resource "aws_acm_certificate" "people" {
  domain_name               = var.web_host
  subject_alternative_names = [var.api_host]
  validation_method         = "DNS"
  tags                      = local.tags

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate" "mcp" {
  domain_name       = var.mcp_host
  validation_method = "DNS"
  tags              = local.tags

  lifecycle {
    create_before_destroy = true
  }
}

locals {
  validation_records = merge(
    { for o in aws_acm_certificate.people.domain_validation_options : o.domain_name => o },
    { for o in aws_acm_certificate.mcp.domain_validation_options : o.domain_name => o },
  )
}

resource "aws_route53_record" "validation" {
  for_each        = local.validation_records
  allow_overwrite = true
  zone_id         = var.hosted_zone_id
  name            = each.value.resource_record_name
  type            = each.value.resource_record_type
  records         = [each.value.resource_record_value]
  ttl             = 60
}

resource "aws_acm_certificate_validation" "people" {
  certificate_arn         = aws_acm_certificate.people.arn
  validation_record_fqdns = [for k, r in aws_route53_record.validation : r.fqdn if contains([var.web_host, var.api_host], k)]
}

resource "aws_acm_certificate_validation" "mcp" {
  certificate_arn         = aws_acm_certificate.mcp.arn
  validation_record_fqdns = [for k, r in aws_route53_record.validation : r.fqdn if k == var.mcp_host]
}

module "activate" {
  source = "../../../../deploy/terraform/aws"

  name   = var.name_prefix
  region = var.region
  tags   = local.tags

  vpc_id                     = module.network.vpc_id
  private_subnet_ids         = module.network.private_subnet_ids
  public_subnet_ids          = module.network.public_subnet_ids
  people_alb_internet_facing = true
  internal_alb_ingress_cidrs = ["0.0.0.0/0"]

  image_registry                  = var.image_registry
  image_tag                       = var.image_tag
  registry_credentials_secret_arn = var.registry_credentials_secret_arn
  cpu_architecture                = "ARM64"

  web_host                 = var.web_host
  api_host                 = var.api_host
  mcp_host                 = var.mcp_host
  internal_certificate_arn = aws_acm_certificate_validation.people.certificate_arn
  mcp_certificate_arn      = aws_acm_certificate_validation.mcp.certificate_arn
  hosted_zone_id           = var.hosted_zone_id

  edition            = "cloud"
  lead_email_domains = ["lightci.com"]
  auth_provider      = "workos"
  workos_secret_arn  = var.workos_secret_arn

  anthropic_api_key_secret_arn = var.anthropic_api_key_secret_arn
  encryption_key_secret_arn    = var.encryption_key_secret_arn
  extra_secrets                = var.extra_secrets
  extra_environment            = var.extra_environment

  api_desired_count = 2
  web_desired_count = 2
  api_cpu           = 2048
  api_memory        = 4096

  db_instance_class        = var.db_instance_class
  db_multi_az              = true
  db_backup_retention_days = 35
  db_deletion_protection   = true
  log_retention_days       = 365
}
