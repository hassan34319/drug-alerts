# Which Terraform and which plugin versions this project expects.
terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws" # the official AWS plugin
      version = "~> 6.0"        # any 6.x version, never 7 (major versions can break things)
    }
     archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }
}

# How to connect to AWS: same profile and region you set up with `aws configure`.
provider "aws" {
  region  = "ap-southeast-2"
  profile = "fda"

  # Every resource gets these labels, so in the console you can see what belongs to this project.
  default_tags {
    tags = {
      Project   = "fda-drug-alert"
      ManagedBy = "terraform"
    }
  }
}

# The cache table. "aws_dynamodb_table" is the resource type, "cache" is our name for it inside Terraform.
resource "aws_dynamodb_table" "cache" {
  name         = "fda-drug-alert-cache" # the real name in AWS
  billing_mode = "PAY_PER_REQUEST"      # on-demand: no fixed cost, pay per read/write
  hash_key     = "pk"                   # the primary key field, e.g. "shortage#hydromorphone"

  attribute {
    name = "pk"
    type = "S" # S = string
  }

  # DynamoDB deletes items automatically once the time in "expiresAt" has passed.
  # That's how cache entries expire: no cleanup code needed.
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
}

# Printed after apply, so you can see the result without opening the console.
output "cache_table_name" {
  value = aws_dynamodb_table.cache.name
}