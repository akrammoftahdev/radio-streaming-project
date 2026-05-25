#!/usr/bin/env bash
# ============================================================
# EGONAIR — Group 5.2 Transfer + VPS Setup
#
# Run this from your LOCAL Mac in the project root:
#   ./deploy/03-transfer-and-setup.sh egyona YOUR_VPS_IP_OR_HOST
#
# What it does:
#   1. Creates a timestamped release folder on the VPS
#   2. Transfers frontend/ and backend-audio/ via rsync
#   3. Transfers deploy scripts and env templates
#   4. Prints exact VPS commands to run after transfer
#
# Does NOT:
#   - Touch public_html
#   - Configure /stream proxy
#   - Start any services
#   - Run npm install or build (that's done on VPS)
# ============================================================
set -euo pipefail

VPS_USER="${1:-egyona}"
VPS_HOST="${2:-}"

if [ -z "$VPS_HOST" ]; then
  echo "❌  Usage: $0 <vps-user> <vps-host>"
  echo "    Example: $0 egyona 1.2.3.4"
  echo "    Example: $0 egyona egonair.com"
  exit 1
fi

REMOTE="$VPS_USER@$VPS_HOST"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
RELEASE_DIR="/home/$VPS_USER/apps/egonair-stream/releases/$TIMESTAMP"
SHARED_DIR="/home/$VPS_USER/apps/egonair-stream/shared"
CURRENT_LINK="/home/$VPS_USER/apps/egonair-stream/current"

# Get the project root (parent of deploy/)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "============================================================"
echo "  EGONAIR Transfer → $REMOTE"
echo "  Release: $RELEASE_DIR"
echo "  Started: $(date)"
echo "============================================================"

# ── STEP 1: Create release directory on VPS ──────────────────
echo ""
echo "[1/5] Creating release directory on VPS..."
ssh "$REMOTE" "mkdir -p $RELEASE_DIR/frontend $RELEASE_DIR/backend-audio"
echo "  ✅ $RELEASE_DIR created."

# ── STEP 2: Transfer frontend/ ───────────────────────────────
echo ""
echo "[2/5] Transferring frontend/ ..."
rsync -avz --progress \
  --exclude='node_modules/' \
  --exclude='.next/' \
  --exclude='*.db' \
  --exclude='.env' \
  --exclude='.env.local' \
  --exclude='.env.production' \
  --exclude='dev.db' \
  --exclude='*.webm' \
  --exclude='.DS_Store' \
  --exclude='tsconfig.tsbuildinfo' \
  --exclude='*.log' \
  --exclude='seed_error.log' \
  --exclude='src/generated/' \
  "$PROJECT_ROOT/frontend/" \
  "$REMOTE:$RELEASE_DIR/frontend/"
echo "  ✅ frontend/ transferred."

# ── STEP 3: Transfer backend-audio/ ──────────────────────────
echo ""
echo "[3/5] Transferring backend-audio/ ..."
rsync -avz --progress \
  --exclude='node_modules/' \
  --exclude='debug-recordings/' \
  --exclude='.env' \
  --exclude='*.webm' \
  --exclude='.DS_Store' \
  --exclude='*.log' \
  "$PROJECT_ROOT/backend-audio/" \
  "$REMOTE:$RELEASE_DIR/backend-audio/"
echo "  ✅ backend-audio/ transferred."

# ── STEP 4: Transfer deploy scripts and env templates ─────────
echo ""
echo "[4/5] Transferring deploy scripts..."
rsync -avz --progress \
  "$SCRIPT_DIR/" \
  "$REMOTE:/home/$VPS_USER/deploy/"
echo "  ✅ deploy/ scripts transferred."

# ── STEP 5: Transfer PM2 ecosystem config ────────────────────
echo ""
echo "[5/5] Transferring ecosystem.config.js..."
# Generate a server-specific ecosystem config inline
ssh "$REMOTE" "cat > /home/$VPS_USER/apps/egonair-stream/ecosystem.config.js" << ECOSYSTEM
module.exports = {
  apps: [
    {
      name: 'egonair-frontend',
      script: 'node_modules/.bin/next',
      args: 'start --port 3000 --hostname 127.0.0.1',
      cwd: '$CURRENT_LINK/frontend',
      instances: 1,
      exec_mode: 'fork',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      out_file: '$SHARED_DIR/logs/frontend-out.log',
      error_file: '$SHARED_DIR/logs/frontend-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      min_uptime: '10s',
      max_memory_restart: '1G',
      watch: false,
    },
    {
      name: 'egonair-audio',
      script: 'src/index.ts',
      interpreter: 'node',
      interpreter_args: '--require ts-node/register',
      cwd: '$CURRENT_LINK/backend-audio',
      instances: 1,
      exec_mode: 'fork',
      env_production: {
        NODE_ENV: 'production',
        TS_NODE_PROJECT: 'tsconfig.json',
      },
      out_file: '$SHARED_DIR/logs/audio-out.log',
      error_file: '$SHARED_DIR/logs/audio-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      min_uptime: '10s',
      max_memory_restart: '512M',
      watch: false,
    },
  ],
};
ECOSYSTEM
echo "  ✅ ecosystem.config.js created on VPS."

echo ""
echo "============================================================"
echo "  TRANSFER COMPLETE — $(date)"
echo "  Release folder: $RELEASE_DIR"
echo "============================================================"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  NEXT: SSH into the VPS and run these commands IN ORDER:"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "  # Load nvm + Node 20"
echo "  export NVM_DIR=\"\$HOME/.nvm\""
echo "  source \"\$NVM_DIR/nvm.sh\""
echo "  nvm use 20"
echo "  node -v   # should say v20.x.x"
echo ""
echo "  # Navigate to release"
echo "  cd $RELEASE_DIR"
echo ""
echo "  # ── FRONTEND SETUP ──────────────────────────────────────"
echo "  cd $RELEASE_DIR/frontend"
echo ""
echo "  # Create .env from template (fill in TODO values first!)"
echo "  cp ~/deploy/frontend.env.production .env"
echo "  nano .env   # fill in AUTH_SECRET, ENCRYPTION_KEY, AUDIO_TOKEN_SECRET"
echo ""
echo "  # Install dependencies"
echo "  npm ci --omit=dev"
echo ""
echo "  # Generate Prisma client"
echo "  npx prisma generate"
echo ""
echo "  # Create/migrate production database"
echo "  npx prisma db push"
echo ""
echo "  # Build Next.js for production"
echo "  npm run build"
echo ""
echo "  # ── BACKEND-AUDIO SETUP ─────────────────────────────────"
echo "  cd $RELEASE_DIR/backend-audio"
echo ""
echo "  # Create .env from template"
echo "  cp ~/deploy/backend-audio.env.production .env"
echo ""
echo "  # Install dependencies"
echo "  npm ci"
echo ""
echo "  # ── SYMLINK: Activate this release ──────────────────────"
echo "  ln -sfn $RELEASE_DIR $CURRENT_LINK"
echo "  echo 'current → $RELEASE_DIR'"
echo ""
echo "  # ── VERIFY (do not start services yet) ──────────────────"
echo "  ls -la $CURRENT_LINK"
echo "  $HOME/bin/ffmpeg -version | head -1"
echo "  node -v && npm -v && pm2 -v"
echo ""
echo "  After verifying, run Group 5.4 (PM2 start) when ready."
echo ""
echo "════════════════════════════════════════════════════════════"
