#!/usr/bin/env bash
# ============================================================
# EGONAIR — Transfer Project Files to VPS
# Run this from your LOCAL Mac in the project root directory.
#
# Usage:
#   ./deploy/02-transfer-files.sh YOUR_SSH_USER egonair.com
#
# Example:
#   ./deploy/02-transfer-files.sh akram egonair.com
# ============================================================
set -euo pipefail

SSH_USER="${1:-}"
SSH_HOST="${2:-egonair.com}"

if [ -z "$SSH_USER" ]; then
  echo "❌  Usage: $0 <ssh-user> [host]"
  echo "    Example: $0 akram egonair.com"
  exit 1
fi

REMOTE="$SSH_USER@$SSH_HOST"
REMOTE_BASE="~/apps/egonair-stream"

echo "============================================================"
echo "  EGONAIR File Transfer → $REMOTE:$REMOTE_BASE"
echo "  Started: $(date)"
echo "============================================================"

# ── Confirm remote directories exist ─────────────────────────
echo ""
echo "[Pre-flight] Checking remote directories..."
ssh "$REMOTE" "mkdir -p $REMOTE_BASE/frontend $REMOTE_BASE/backend-audio ~/recordings ~/logs/egonair"
echo "  ✅ Remote directories confirmed."

# ── Transfer frontend ─────────────────────────────────────────
echo ""
echo "[1/4] Transferring frontend/ ..."
rsync -avz --progress \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='*.db' \
  --exclude='.env' \
  --exclude='*.webm' \
  "$(dirname "$0")/../frontend/" \
  "$REMOTE:$REMOTE_BASE/frontend/"
echo "  ✅ frontend/ transferred."

# ── Transfer backend-audio ────────────────────────────────────
echo ""
echo "[2/4] Transferring backend-audio/ ..."
rsync -avz --progress \
  --exclude='node_modules' \
  --exclude='debug-recordings' \
  --exclude='.env' \
  --exclude='*.webm' \
  "$(dirname "$0")/../backend-audio/" \
  "$REMOTE:$REMOTE_BASE/backend-audio/"
echo "  ✅ backend-audio/ transferred."

# ── Transfer deploy scripts ───────────────────────────────────
echo ""
echo "[3/4] Transferring deploy scripts ..."
rsync -avz --progress \
  "$(dirname "$0")/" \
  "$REMOTE:~/deploy/"
echo "  ✅ deploy/ scripts transferred."

# ── Transfer PM2 ecosystem config ────────────────────────────
echo ""
echo "[4/4] Transferring ecosystem.config.js ..."
rsync -avz --progress \
  "$(dirname "$0")/ecosystem.config.js" \
  "$REMOTE:$REMOTE_BASE/ecosystem.config.js"
echo "  ✅ ecosystem.config.js transferred."

echo ""
echo "============================================================"
echo "  TRANSFER COMPLETE — $(date)"
echo "============================================================"
echo ""
echo "NEXT STEPS on the server (SSH in):"
echo ""
echo "  1. Create .env files:"
echo "     nano $REMOTE_BASE/frontend/.env"
echo "     nano $REMOTE_BASE/backend-audio/.env"
echo "     (Use deploy/env.frontend.production.template and"
echo "      deploy/env.backend-audio.production.template as reference)"
echo ""
echo "  2. Install frontend dependencies:"
echo "     cd $REMOTE_BASE/frontend"
echo "     npm install"
echo "     npx prisma generate"
echo "     npx prisma db push"
echo ""
echo "  3. Install backend-audio dependencies:"
echo "     cd $REMOTE_BASE/backend-audio"
echo "     npm install"
echo ""
echo "  4. (Group 5.3) Build Next.js:"
echo "     cd $REMOTE_BASE/frontend"
echo "     npm run build"
echo ""
echo "  5. (Group 5.4) Start with PM2:"
echo "     cd $REMOTE_BASE"
echo "     pm2 start ecosystem.config.js --env production"
echo "     pm2 save"
echo ""
