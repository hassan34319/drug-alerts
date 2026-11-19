#!/usr/bin/env bash
# Phase 7 one-time setup, run from the project root on your Mac:  bash setup-phase7.sh
# 1. creates the S3 bucket for Terraform state   2. points Terraform at it (moves your local state there)
# 3. lets the provider work without the "fda" profile in CI   4. hides your email in public CI logs
# 5. runs fmt + validate + plan. It never applies: you run `terraform apply` yourself after reading the plan.
set -euo pipefail
export AWS_PROFILE=fda AWS_REGION=ap-southeast-2
BUCKET=drug-alert-tfstate-974187939513

echo "== 1. State bucket: $BUCKET"
if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "exists, skipping"
else
  aws s3api create-bucket --bucket "$BUCKET" --create-bucket-configuration LocationConstraint=ap-southeast-2 >/dev/null
  echo "created"
fi
aws s3api put-bucket-versioning --bucket "$BUCKET" --versioning-configuration Status=Enabled
aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
echo "versioning on, public access blocked (S3 encrypts new objects by default)"

cd infra

echo "== 2. Backend block in main.tf"
if grep -q 'backend "s3"' main.tf; then echo "already there"; else
  perl -0pi -e 's/^terraform \{\n/terraform {\n  backend "s3" {\n    bucket       = "drug-alert-tfstate-974187939513"\n    key          = "infra\/terraform.tfstate"\n    region       = "ap-southeast-2"\n    encrypt      = true\n    use_lockfile = true\n  }\n\n/m' main.tf
  grep -q 'backend "s3"' main.tf || { echo "Could not find the 'terraform {' line in main.tf. Send it to Claude."; exit 1; }
  echo "added"
fi

echo "== 3. Provider profile: local uses 'fda', CI uses OIDC"
if grep -q 'var.aws_profile' main.tf; then echo "already done"; else
  perl -pi -e 's/^(\s*)profile\s*=\s*"fda".*$/$1profile = var.aws_profile != "" ? var.aws_profile : null/' main.tf
  grep -q 'var.aws_profile' main.tf || { echo "Could not find 'profile = \"fda\"' in main.tf. Send it to Claude."; exit 1; }
  cat >> main.tf <<'TF'

variable "aws_profile" {
  description = "Local AWS CLI profile. CI sets it to an empty string and logs in with OIDC instead."
  type        = string
  default     = "fda"
}
TF
  echo "done"
fi

echo "== 4. Mark alert_email sensitive (the repo is public, so CI logs and plan comments are public)"
if perl -0ne 'exit(/variable "alert_email" \{[^}]*sensitive/s ? 0 : 1)' ses.tf; then echo "already sensitive"; else
  perl -0pi -e 's/(variable "alert_email" \{[^}]*?)(\n\})/$1\n  sensitive = true$2/s' ses.tf
  perl -0ne 'exit(/variable "alert_email" \{[^}]*sensitive/s ? 0 : 1)' ses.tf && echo "done" || echo "WARNING: add 'sensitive = true' inside variable \"alert_email\" in ses.tf by hand"
fi

echo "== 5. Move state to S3 (answer 'yes' when Terraform asks to copy existing state)"
terraform init -migrate-state -backend-config="profile=fda"

terraform fmt -recursive
terraform validate
echo "== Plan (expect new: OIDC provider, 2 GitHub roles + their policies, SNS topic + subscription, 3 alarms; changed: daily Lambda code)"
terraform plan -lock-timeout=2m
echo
echo "Read the plan. If it matches, run:  terraform apply   (from infra/)"
