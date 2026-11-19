# GitHub Actions logs into AWS as one of two dedicated IAM users.
# (OIDC, which needs no stored keys, is blocked on this account by the AWS Free plan's
#  organization policy, so CI uses access keys with the smallest permissions that work.)
#
#   fda-drug-alert-ci-plan    pull requests: read-only, plus the Terraform lock file
#   fda-drug-alert-ci-deploy  merges to main: manage this project's resources
#
# Their access keys are NOT created here (that would put the secret in Terraform state).
# setup-github.sh creates them with the AWS CLI and pipes them straight into GitHub secrets;
# the deploy key goes into a GitHub "production" environment that only the main branch can use.

variable "state_bucket" {
  description = "S3 bucket holding the Terraform state"
  type        = string
  default     = "drug-alert-tfstate-974187939513"
}

# ---------- plan user ----------

resource "aws_iam_user" "ci_plan" {
  name = "fda-drug-alert-ci-plan"
}

resource "aws_iam_user_policy_attachment" "ci_plan_readonly" {
  user       = aws_iam_user.ci_plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

# Read-only can't take the state lock, so allow writing ONLY the lock file.
resource "aws_iam_user_policy" "ci_plan_lock" {
  name = "state-lock"
  user = aws_iam_user.ci_plan.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:PutObject", "s3:DeleteObject"]
      Resource = "arn:aws:s3:::${var.state_bucket}/*.tflock"
    }]
  })
}

# ---------- deploy user ----------

resource "aws_iam_user" "ci_deploy" {
  name = "fda-drug-alert-ci-deploy"
}

# Every AWS service except IAM (Lambda, DynamoDB, SES, Scheduler, logs, S3, SNS, CloudWatch)...
resource "aws_iam_user_policy_attachment" "ci_deploy_poweruser" {
  user       = aws_iam_user.ci_deploy.name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}

# ...and IAM only for this project's own roles and CI users, nothing else in the account.
resource "aws_iam_user_policy" "ci_deploy_iam" {
  name = "project-iam-only"
  user = aws_iam_user.ci_deploy.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = "iam:*"
        Resource = [
          "arn:aws:iam::${data.aws_caller_identity.me.account_id}:role/fda-drug-alert-*",
          "arn:aws:iam::${data.aws_caller_identity.me.account_id}:user/fda-drug-alert-ci-*",
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["iam:Get*", "iam:List*"]
        Resource = "*"
      },
    ]
  })
}

output "ci_plan_user" {
  value = aws_iam_user.ci_plan.name
}

output "ci_deploy_user" {
  value = aws_iam_user.ci_deploy.name
}
