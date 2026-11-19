# ---------- 1. identity, permissions, logs ----------

resource "aws_iam_role" "daily" {
  name = "fda-drug-alert-daily"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_cloudwatch_log_group" "daily" {
  name              = "/aws/lambda/fda-drug-alert-daily"
  retention_in_days = 14
}

resource "aws_iam_role_policy" "daily" {
  name = "fda-drug-alert-daily"
  role = aws_iam_role.daily.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Watchlist: Scan to list confirmed watchers, Get/Put to update "notified".
        Effect   = "Allow"
        Action   = ["dynamodb:Scan", "dynamodb:GetItem", "dynamodb:PutItem"]
        Resource = aws_dynamodb_table.watchlist.arn
      },
      {
        # Cache: the recall window and medicine names, shared with the api Lambda.
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem"]
        Resource = aws_dynamodb_table.cache.arn
      },
      {
        Effect   = "Allow"
        Action   = "ses:SendEmail"
        Resource = "arn:aws:ses:ap-southeast-2:${data.aws_caller_identity.me.account_id}:identity/*"
        Condition = {
          StringEquals = { "ses:FromAddress" = var.alert_email }
        }
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.daily.arn}:*"
      },
    ]
  })
}

# ---------- 2. the daily Lambda ----------

resource "aws_lambda_function" "daily" {
  function_name    = "fda-drug-alert-daily"
  role             = aws_iam_role.daily.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "daily.handler"
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256
  memory_size      = 512
  timeout          = 120

  environment {
    variables = {
      CACHE_TABLE     = aws_dynamodb_table.cache.name
      WATCHLIST_TABLE = aws_dynamodb_table.watchlist.name
      FROM_EMAIL      = var.alert_email
      WATCH_SECRET    = var.watch_secret
      API_BASE_URL    = aws_lambda_function_url.api.function_url
      NODE_OPTIONS    = "--enable-source-maps"
    }
  }

  depends_on = [aws_cloudwatch_log_group.daily, aws_iam_role_policy.daily]
}

# ---------- 3. the schedule ----------

resource "aws_iam_role" "scheduler" {
  name = "fda-drug-alert-scheduler"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "scheduler" {
  name = "invoke-daily"
  role = aws_iam_role.scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = aws_lambda_function.daily.arn
    }]
  })
}

resource "aws_scheduler_schedule" "daily" {
  name                         = "fda-drug-alert-daily"
  schedule_expression          = "cron(0 8 * * ? *)"
  schedule_expression_timezone = "America/New_York"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.daily.arn
    role_arn = aws_iam_role.scheduler.arn

    retry_policy {
      maximum_retry_attempts = 2
    }
  }
}