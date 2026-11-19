variable "alert_email" {
  description = "Sender for alert emails (and, in the SES sandbox, the test recipient)"
  type        = string
}

resource "aws_sesv2_email_identity" "sender" {
  email_identity = var.alert_email
}