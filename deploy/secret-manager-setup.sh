#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# EGONAIR — Secret Manager Setup
# Run this ONCE after GCP project access is confirmed.
# Prerequisites: gcloud CLI authenticated, project ID set.
# Usage: GCP_PROJECT=your-project-id bash deploy/secret-manager-setup.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT="${GCP_PROJECT:?Set GCP_PROJECT env var}"
echo "[+] Creating secrets in project: $PROJECT"

# Helper — creates secret and stores a placeholder value.
# You will update the actual values interactively or via CI.
create_secret() {
  local NAME="$1"
  local DESC="$2"
  echo "--- $NAME ---"
  gcloud secrets create "$NAME" \
    --project="$PROJECT" \
    --replication-policy="automatic" \
    --labels="app=egonair" \
    2>/dev/null || echo "  (already exists — skipping create)"
  echo "  Created: $NAME ($DESC)"
  echo "  ⚠️  Set the actual value with:"
  echo "     echo -n 'YOUR_VALUE' | gcloud secrets versions add $NAME --data-file=- --project=$PROJECT"
  echo ""
}

create_secret "egonair-auth-secret"      "NextAuth AUTH_SECRET (64-char hex)"
create_secret "egonair-encryption-key"   "AES-256 key for SonicPanel credentials (32 chars)"
create_secret "egonair-audio-token-secret" "Short-lived WebSocket auth token secret"
create_secret "egonair-db-url"           "Cloud SQL PostgreSQL connection string"
create_secret "egonair-sonicpanel-host"  "SonicPanel host (optional — can stay in DB encrypted)"

echo "[+] Granting Cloud Run SA access to secrets..."
# Replace SERVICE_ACCOUNT with the actual Cloud Run SA email after deployment
# Format: <PROJECT_NUMBER>-compute@developer.gserviceaccount.com
# gcloud secrets add-iam-policy-binding egonair-auth-secret \
#   --project="$PROJECT" \
#   --member="serviceAccount:${SA_EMAIL}" \
#   --role="roles/secretmanager.secretAccessor"

echo "[+] Done. Update secret values before deploying Cloud Run."
echo ""
