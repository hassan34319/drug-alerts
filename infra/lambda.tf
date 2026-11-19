# NEW: reads your AWS account ID, used in the SES permission below
data "aws_caller_identity" "me" {}

data "archive_file" "api" {
  type        = "zip"
  source_dir  = "${path.module}/../dist"
  output_path = "${path.module}/build/api.zip"
}

resource "aws_iam_role" "api" {
  name = "fda-drug-alert-api"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/fda-drug-alert-api"
  retention_in_days = 14
}

resource "aws_iam_role_policy" "api" {
  name = "fda-drug-alert-api"
  role = aws_iam_role.api.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem"]
        Resource = aws_dynamodb_table.cache.arn
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.api.arn}:*"
      },
      # NEW: read/write one person's watchlist record (no Scan here)
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem"]
        Resource = aws_dynamodb_table.watchlist.arn
      },
      # NEW: send email, but only FROM the verified address
      {
        Effect   = "Allow"
        Action   = "ses:SendEmail"
        Resource = "arn:aws:ses:ap-southeast-2:${data.aws_caller_identity.me.account_id}:identity/*"
        Condition = {
          StringEquals = { "ses:FromAddress" = var.alert_email }
        }
      },
    ]
  })
}

resource "aws_lambda_function" "api" {
  function_name    = "fda-drug-alert-api"
  role             = aws_iam_role.api.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "lambda.handler" # CHANGED: was index.handler (build now outputs lambda.mjs)
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256
  memory_size      = 512
  timeout          = 30

  environment {
    variables = {
      CACHE_TABLE     = aws_dynamodb_table.cache.name
      NODE_OPTIONS    = "--enable-source-maps"
      WATCHLIST_TABLE = aws_dynamodb_table.watchlist.name # NEW
      FROM_EMAIL      = var.alert_email                   # NEW
      WATCH_SECRET    = var.watch_secret                  # NEW
    }
  }

  depends_on = [aws_cloudwatch_log_group.api, aws_iam_role_policy.api]
}

resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "NONE"
}

resource "aws_lambda_permission" "url_invoke" {
  statement_id           = "PublicUrlInvoke"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.api.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "url_function_invoke" {
  statement_id             = "PublicFunctionInvokeViaUrl"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.api.function_name
  principal                = "*"
  invoked_via_function_url = true
}

output "api_url" {
  value = aws_lambda_function_url.api.function_url
}