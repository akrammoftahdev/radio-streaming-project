#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# EGONAIR backend-audio — GCE VM Startup Script
# This runs as root on first boot (or on manual re-run).
# Attach to GCE instance as a startup-script metadata value.
# All secrets are pulled from GCP Secret Manager at startup.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT="${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
INSTANCE_USER="egonair"
APP_DIR="/home/${INSTANCE_USER}/backend-audio"
NVM_DIR="/home/${INSTANCE_USER}/.nvm"
NODE_VERSION="20"

echo "[+] EGONAIR backend-audio startup — $(date)"
echo "[+] GCP project: $PROJECT"

# ── 1. Create app user ────────────────────────────────────────────────────────
id "$INSTANCE_USER" &>/dev/null || useradd -m -s /bin/bash "$INSTANCE_USER"
echo "[+] User: $INSTANCE_USER"

# ── 2. Install system dependencies ───────────────────────────────────────────
apt-get update -qq
apt-get install -y -qq curl wget git jq

# ── 3. Install Node.js via nvm ───────────────────────────────────────────────
if [ ! -d "$NVM_DIR" ]; then
  su -s /bin/bash "$INSTANCE_USER" -c "
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    export NVM_DIR=\"$NVM_DIR\"
    source \"\$NVM_DIR/nvm.sh\"
    nvm install $NODE_VERSION
    nvm use $NODE_VERSION
    npm install -g pm2
  "
  echo "[+] Node $NODE_VERSION + PM2 installed."
else
  echo "[+] nvm already present."
fi

# ── 4. Install FFmpeg static binary ──────────────────────────────────────────
FFMPEG_BIN="/usr/local/bin/ffmpeg"
if [ ! -f "$FFMPEG_BIN" ]; then
  echo "[+] Installing FFmpeg static..."
  wget -q https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz \
    -O /tmp/ffmpeg.tar.xz
  tar -xJf /tmp/ffmpeg.tar.xz -C /tmp/
  cp /tmp/ffmpeg-*-amd64-static/ffmpeg "$FFMPEG_BIN"
  chmod +x "$FFMPEG_BIN"
  rm -rf /tmp/ffmpeg*
  echo "[+] FFmpeg installed at $FFMPEG_BIN"
fi

# ── 5. Pull secrets from Secret Manager ──────────────────────────────────────
echo "[+] Fetching secrets..."

get_secret() {
  gcloud secrets versions access latest \
    --secret="$1" \
    --project="$PROJECT" 2>/dev/null || echo ""
}

AUDIO_TOKEN_SECRET=$(get_secret "egonair-audio-token-secret")
FRONTEND_INTERNAL_URL="http://127.0.0.1:3000"   # Cloud Run internal URL set at deploy time

# ── 6. Write .env for backend-audio ──────────────────────────────────────────
mkdir -p "$APP_DIR"

cat > "$APP_DIR/.env" << EOF
NODE_ENV=production
HOST=0.0.0.0
PORT=4001
AUDIO_TOKEN_SECRET="${AUDIO_TOKEN_SECRET}"
# Updated at deploy time with Cloud Run internal URL
NEXT_VALIDATE=${FRONTEND_INTERNAL_URL}/api/internal/audio-token/validate
RECORDINGS_BASE_DIR=/tmp/recordings
FFMPEG_PATH=${FFMPEG_BIN}
ENABLE_SHOUTCAST_LIVE=false
GCS_BUCKET=egonair-recordings
GCS_PROJECT=${PROJECT}
EOF

chown "$INSTANCE_USER:$INSTANCE_USER" "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"
echo "[+] .env written."

# ── 7. Deploy backend-audio code ─────────────────────────────────────────────
# Code is pulled from Artifact Registry or GCS bucket (CI/CD handles this).
# For manual deploy: copy built backend-audio/ directory to $APP_DIR

echo "[+] Startup script complete."
echo "    Next: copy backend-audio code to $APP_DIR and start with PM2."
echo "    pm2 start $APP_DIR/dist/index.js --name egonair-audio"
