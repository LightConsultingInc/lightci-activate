module "network" {
  source                  = "../../modules/network"
  name                    = var.name_prefix
  vpc_cidr_block          = var.vpc_cidr_block
  availability_zone_count = var.availability_zone_count
  public_subnet_cidrs     = var.public_subnet_cidrs
  private_subnet_cidrs    = var.private_subnet_cidrs
  enable_nat_gateway      = var.enable_nat_gateway
}

module "database" {
  source = "../../modules/database"

  name                       = var.name_prefix
  vpc_id                     = module.network.vpc_id
  subnet_ids                 = module.network.private_subnet_ids
  allowed_security_group_ids = [module.service.service_security_group_id]
  database_name              = "lightci_activate"
  instance_class             = "db.t4g.micro"
  skip_final_snapshot        = true
}

module "service" {
  source = "../../modules/service"

  name               = var.name_prefix
  region             = var.region
  vpc_id             = module.network.vpc_id
  private_subnet_ids = module.network.private_subnet_ids
  public_subnet_ids  = module.network.public_subnet_ids
  task_subnet_ids    = module.network.public_subnet_ids
  assign_public_ip   = true

  image_tag               = var.image_tag
  certificate_arn         = var.certificate_arn
  certificate_domain_name = var.certificate_domain_name
  domain_name             = var.domain_name
  hosted_zone_id          = var.hosted_zone_id
  db_secret_arn           = module.database.secret_arn
  extra_secrets           = var.extra_secrets

  environment = merge(
    {
      NODE_ENV = "development"
    },
    var.extra_environment,
  )
}
