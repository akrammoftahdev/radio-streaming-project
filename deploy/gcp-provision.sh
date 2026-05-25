#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# EGONAIR — GCP Phase 2 Provisioning Script
# Project: egonair-stream-prod
# Run this AFTER receiving GCP project access.
# Prerequisites: gcloud CLI installed + authenticated
# Usage: bash deploy/gcp-provision.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT="egonair-stream-prod"
REGION="us-central1"   # Adjust to preferred region (e.g. europe-west1 for lower latency to Egypt)
DB_INSTANCE="egonair-pg"
DB_NAME="egonair"
DB_USER="egonair"
AR_REPO="egonair"
GCS_BUCKET="egonair-recordings"

echo "[+] Setting active project: $PROJECT"
gcloud config set project "$PROJECT"

# ── 1. Enable required APIs ───────────────────────────────────────────────────
echo ""
echo "=== Enabling APIs ==="
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  compute.googleapis.com \
  cloudresourcemanager.googleapis.com \
  iam.googleapis.com \
  --project="$PROJECT"
echo "[+] APIs enabled."

# ── 2. Artifact Registry — Docker repo ───────────────────────────────────────
echo ""
echo "=== Creating Artifact Registry repo ==="
gcloud artifacts repositories create "$AR_REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --description="EGONAIR Docker images" \
  --project="$PROJECT" \
  2>/dev/null || echo "  (already exists)"
echo "[+] Artifact Registry: $REGION-docker.pkg.dev/$PROJECT/$AR_REPO"

# ── 3. Cloud SQL — PostgreSQL 15 ──────────────────────────────────────────────
echo ""
echo "=== Creating Cloud SQL instance (this takes 3-5 minutes) ==="
gcloud sql instances create "$DB_INSTANCE" \
  --database-version=POSTGRES_15 \
  --tier=db-g1-small \
  --region="$REGION" \
  --storage-type=SSD \
  --storage-size=10GB \
  --backup-start-time=02:00 \
  --no-assign-ip \
  --project="$PROJECT" \
  2>/dev/null || echo "  (already exists)"

echo "[+] Creating database: $DB_NAME"
gcloud sql databases create "$DB_NAME" \
  --instance="$DB_INSTANCE" \
  --project="$PROJECT" \
  2>/dev/null || echo "  (already exists)"

echo "[+] Creating DB user: $DB_USER"
DB_PASS=$(openssl rand -hex 24)
gcloud sql users create "$DB_USER" \
  --instance="$DB_INSTANCE" \
  --password="$DB_PASS" \
  --project="$PROJECT" \
  2>/dev/null || echo "  (already exists — skipping password set)"

INSTANCE_CONN=$(gcloud sql instances describe "$DB_INSTANCE" \
  --project="$PROJECT" \
  --format="value(connectionName)" 2>/dev/null)

echo ""
echo "[!] Cloud SQL instance created."
echo "    Connection name: $INSTANCE_CONN"
echo "    DB user: $DB_USER"
echo "    DB pass: $DB_PASS"
echo "    >>> SAVE THIS PASSWORD — it will not be shown again <<<"
echo "    DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME?host=/cloudsql/$INSTANCE_CONN"

# ── 4. Cloud Storage — Recordings bucket ─────────────────────────────────────
echo ""
echo "=== Creating GCS bucket ==="
gcloud storage buckets create "gs://$GCS_BUCKET" \
  --location="$REGION" \
  --uniform-bucket-level-access \
  --project="$PROJECT" \
  2>/dev/null || echo "  (already exists)"

# Lifecycle: auto-delete recordings older than 90 days
cat > /tmp/gcs_lifecycle.json << 'EOF'
{
  "rule": [{
    "action": {"type": "Delete"},
    "condition": {"age": 90}
  }]
}
EOF
gcloud storage buckets update "gs://$GCS_BUCKET" \
  --lifecycle-file=/tmp/gcs_lifecycle.json \
  --project="$PROJECT" \
  2>/dev/null || true
echo "[+] GCS bucket: gs://$GCS_BUCKET (90-day lifecycle set)"

# ── 5. Service Accounts ───────────────────────────────────────────────────────
echo ""
echo "=== Creating Service Accounts ==="

# Cloud Run SA
gcloud iam service-accounts create "egonair-frontend" \
  --display-name="EGONAIR Frontend (Cloud Run)" \
  --project="$PROJECT" \
  2>/dev/null || echo "  (egonair-frontend SA already exists)"

FRONTEND_SA="egonair-frontend@${PROJECT}.iam.gserviceaccount.com"

# Grant Cloud Run SA access to Secret Manager
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:$FRONTEND_SA" \
  --role="roles/secretmanager.secretAccessor" \
  --condition=None 2>/dev/null || true

# Grant Cloud Run SA access to Cloud SQL
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:$FRONTEND_SA" \
  --role="roles/cloudsql.client" \
  --condition=None 2>/dev/null || true

echo "[+] Service account ready: $FRONTEND_SA"

echo ""
echo "============================================================"
echo "  PHASE 2 PROVISIONING COMPLETE"
echo "  Next: Run deploy/secret-manager-setup.sh to create secrets"
echo "  Then: docker build + push + deploy Cloud Run"
echo "============================================================"
