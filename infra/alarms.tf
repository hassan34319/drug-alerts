# Emails you when something breaks, through an SNS topic.
# After the first apply, AWS sends a "Subscription Confirmation" email to alert_email:
# click the link in it, or no alarm email will ever arrive.

resource "aws_sns_topic" "ops" {
  name = "fda-drug-alert-ops"
}

resource "aws_sns_topic_subscription" "ops_email" {
  topic_arn = aws_sns_topic.ops.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# The one that matters most: the daily check failed (it throws when any watcher's email failed,
# or when the FDA call fails). Without this, watchers would silently miss recalls.
resource "aws_cloudwatch_metric_alarm" "daily_errors" {
  alarm_name          = "fda-drug-alert-daily-failed"
  alarm_description   = "The daily recall check failed. Check the logs: aws logs tail /aws/lambda/fda-drug-alert-daily --since 1d"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.daily.function_name }
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.ops.arn]
}

# The daily check didn't run at all in the last 26 hours (schedule disabled, permissions broken...).
# Missing data counts as "didn't run".
resource "aws_cloudwatch_metric_alarm" "daily_missed" {
  alarm_name          = "fda-drug-alert-daily-missed"
  alarm_description   = "The daily recall check has not run in over a day."
  namespace           = "AWS/Lambda"
  metric_name         = "Invocations"
  dimensions          = { FunctionName = aws_lambda_function.daily.function_name }
  statistic           = "Sum"
  period              = 93600 # 26 hours: a little slack around the 8:00 New York run
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.ops.arn]
}

# The API is erroring: 5 or more failed requests within 5 minutes (FDA down, a bad deploy...).
resource "aws_cloudwatch_metric_alarm" "api_errors" {
  alarm_name          = "fda-drug-alert-api-errors"
  alarm_description   = "The API Lambda returned 5+ errors in 5 minutes."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.api.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.ops.arn]
}
