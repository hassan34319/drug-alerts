resource "aws_dynamodb_table" "watchlist" {
  name         = "fda-drug-alert-watchlist"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

  attribute {
    name = "pk"
    type = "S"
  }

  deletion_protection_enabled = true
}

output "watchlist_table_name" {
  value = aws_dynamodb_table.watchlist.name
}

variable "watch_secret" {
  description = "Random key that signs the confirm and unsubscribe links in emails"
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.watch_secret) >= 32
    error_message = "watch_secret must be at least 32 characters."
  }
}
variable "site_url" {
  description = "Public website address; links in emails point here. Empty = use the Lambda's own pages."
  type        = string
  default     = ""
}
