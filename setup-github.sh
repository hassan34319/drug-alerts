#!/usr/bin/env bash
# Connects GitHub Actions to AWS. Run from the project root AFTER `terraform apply`:  bash setup-github.sh
#  1. creates an access key for each CI user and pipes it straight into GitHub secrets (never printed or saved)
#  2. creates a GitHub "production" environment that only the main branch can use, holding the deploy key
#  3. sets the Terraform inputs (site URL, sender email, link-signing secret) read from infra/terraform.tfvars
set -euo pipefail
REPO=hassan34319/drug-alerts
export AWS_PROFILE=fda
command -v gh >/dev/null || { echo "Install the GitHub CLI first: brew install gh && gh auth login"; exit 1; }

tfvar() { sed -n "s/^$1[[:space:]]*=[[:space:]]*\"\(.*\)\"[[:space:]]*$/\1/p" infra/terraform.tfvars; }

# Make a new access key for an IAM user and store it as two GitHub secrets.
# $1 user, $2 secret-name prefix, $3 extra gh flags (e.g. --env production)
new_key() {
  local user=$1 prefix=$2; shift 2
  local count
  count=$(aws iam list-access-keys --user-name "$user" --query 'length(AccessKeyMetadata)' --output text)
  if [ "$count" -ge 2 ]; then
    echo "$user already has 2 access keys (the AWS maximum). Delete an old one first:"
    echo "  aws iam list-access-keys --user-name $user"
    echo "  aws iam delete-access-key --user-name $user --access-key-id <OLD_ID>"
    exit 1
  fi
  read -r key secret < <(aws iam create-access-key --user-name "$user" \
    --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)
  gh secret set "${prefix}_ACCESS_KEY_ID"     --repo "$REPO" "$@" --body "$key"
  gh secret set "${prefix}_SECRET_ACCESS_KEY" --repo "$REPO" "$@" --body "$secret"
  unset key secret
  echo "new key for $user stored in GitHub as ${prefix}_*"
}

PLAN_USER=$(terraform -chdir=infra output -raw ci_plan_user)
DEPLOY_USER=$(terraform -chdir=infra output -raw ci_deploy_user)

echo "== production environment (only main can deploy)"
gh api -X PUT "repos/$REPO/environments/production" --silent --input - <<'JSON'
{"deployment_branch_policy": {"protected_branches": false, "custom_branch_policies": true}}
JSON
gh api -X POST "repos/$REPO/environments/production/deployment-branch-policies" \
  -f name=main -f type=branch --silent 2>/dev/null || echo "(main already allowed)"

echo "== access keys"
new_key "$PLAN_USER"   AWS_PLAN
new_key "$DEPLOY_USER" AWS_DEPLOY --env production

echo "== Terraform inputs"
gh variable set SITE_URL          --repo "$REPO" --body "$(tfvar site_url)"
gh secret set TF_VAR_ALERT_EMAIL  --repo "$REPO" --body "$(tfvar alert_email)"
gh secret set TF_VAR_WATCH_SECRET --repo "$REPO" --body "$(tfvar watch_secret)"

echo; echo "Repo secrets:"; gh secret list --repo "$REPO"
echo "production secrets:"; gh secret list --repo "$REPO" --env production
echo "Variables:"; gh variable list --repo "$REPO"
