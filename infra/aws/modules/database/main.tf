# RDS for PostgreSQL with Secrets Manager-managed credentials.

data "aws_vpc" "this" {
  id = var.vpc_id
}

resource "aws_security_group" "db" {
  name        = "${var.name}-db-sg"
  description = "PostgreSQL access for ${var.name}"
  vpc_id      = var.vpc_id

  ingress {
    description     = "PostgreSQL from app SG"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = var.allowed_security_group_ids
  }

  ingress {
    description = "PostgreSQL from anywhere in the VPC (bastion, peered services)"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.this.cidr_block]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = var.tags
}

resource "aws_db_subnet_group" "this" {
  name       = "${var.name}-db-subnets"
  subnet_ids = var.subnet_ids
  tags       = var.tags
}

resource "random_password" "db" {
  length      = 30
  special     = false
  min_lower   = 2
  min_upper   = 2
  min_numeric = 2
}

resource "aws_secretsmanager_secret" "db" {
  name = "${var.name}-db-secret"
  tags = var.tags
}

# Require TLS on every client connection. The API verifies the RDS CA (DB_SSL_MODE=verify-full)
# with the bundle it ships; force_ssl makes sure nothing else connects in the clear.
resource "aws_db_parameter_group" "this" {
  name   = "${var.name}-pg"
  family = "${var.engine}${split(".", var.engine_version)[0]}"

  parameter {
    name         = "rds.force_ssl"
    value        = var.force_ssl ? "1" : "0"
    apply_method = "immediate"
  }

  tags = var.tags

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_db_instance" "this" {
  identifier                   = "${var.name}-db"
  engine                       = var.engine
  engine_version               = var.engine_version
  instance_class               = var.instance_class
  parameter_group_name         = aws_db_parameter_group.this.name
  allocated_storage            = var.allocated_storage
  max_allocated_storage        = var.max_allocated_storage
  storage_type                 = var.storage_type
  storage_encrypted            = true
  username                     = var.db_username
  password                     = random_password.db.result
  db_name                      = var.database_name
  port                         = 5432
  db_subnet_group_name         = aws_db_subnet_group.this.name
  vpc_security_group_ids       = [aws_security_group.db.id]
  publicly_accessible          = false
  backup_retention_period      = var.backup_retention_days
  copy_tags_to_snapshot        = true
  skip_final_snapshot          = var.skip_final_snapshot
  final_snapshot_identifier    = var.skip_final_snapshot ? null : "${var.name}-final"
  deletion_protection          = var.deletion_protection
  auto_minor_version_upgrade   = true
  apply_immediately            = true
  performance_insights_enabled = var.performance_insights_enabled

  tags = var.tags

  lifecycle {
    ignore_changes = [password]
  }
}

# Secret payload matches what the API expects in the `DB` env var:
# typeorm.config.ts parses {host, port, username, password, dbname}.
resource "aws_secretsmanager_secret_version" "db" {
  secret_id = aws_secretsmanager_secret.db.id
  secret_string = jsonencode({
    username = var.db_username
    password = random_password.db.result
    host     = aws_db_instance.this.address
    port     = aws_db_instance.this.port
    dbname   = var.database_name
  })
}
