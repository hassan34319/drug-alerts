#!/usr/bin/env bash
# Points email links at the website: adds the site_url variable and SITE_URL to both Lambdas.
# Run from the project root:  bash set-site-url.sh
# Safe to run twice: it skips anything already there. It does NOT apply: you run plan/apply yourself.
set -euo pipefail
SITE="https://drug-alert-seven.vercel.app"
cd infra

grep -q 'variable "site_url"' watchlist.tf || cat >> watchlist.tf <<'TF'

variable "site_url" {
  description = "Public website address; links in emails point here. Empty = use the Lambda's own pages."
  type        = string
  default     = ""
}
TF

for f in lambda.tf daily.tf; do
  grep -q 'SITE_URL' "$f" || perl -0pi -e 's/^(\s*)(WATCH_SECRET\s*=\s*var\.watch_secret\s*\n)/$1$2$1SITE_URL = var.site_url\n/m' "$f"
  grep -q 'SITE_URL' "$f" || { echo "Could not add SITE_URL to $f: add 'SITE_URL = var.site_url' under WATCH_SECRET by hand"; exit 1; }
done

grep -q '^site_url' terraform.tfvars || printf '\nsite_url = "%s"\n' "$SITE" >> terraform.tfvars

terraform fmt
echo "Done. Changes:"
git diff --stat -- . || true
echo "Next: terraform plan   (expect 2 to change: SITE_URL on both Lambdas), then terraform apply"
