variable "name" {
  description = "Name prefix for network resources."
  type        = string
}

variable "vpc_cidr_block" {
  description = "CIDR block for the VPC."
  type        = string
}

variable "availability_zone_count" {
  description = "Number of availability zones to span with public and private subnets."
  type        = number
  default     = 2

  validation {
    condition     = var.availability_zone_count >= 2
    error_message = "availability_zone_count must be at least 2 for ALB and RDS subnet requirements."
  }
}

variable "public_subnet_cidrs" {
  description = "Optional public subnet CIDR blocks. When empty, /24s are derived from vpc_cidr_block."
  type        = list(string)
  default     = []
}

variable "private_subnet_cidrs" {
  description = "Optional private subnet CIDR blocks. When empty, /24s are derived from vpc_cidr_block."
  type        = list(string)
  default     = []
}

variable "enable_nat_gateway" {
  description = "Whether private subnets should route outbound traffic through a NAT gateway."
  type        = bool
  default     = true
}

variable "tags" {
  type    = map(string)
  default = {}
}
