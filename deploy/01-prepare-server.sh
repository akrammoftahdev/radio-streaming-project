#!/usr/bin/env bash
# ============================================================
# EGONAIR — Group 5.1 Server Preparation Script
# Run this on the VPS via SSH AFTER the audit confirms
# the environment is ready.
#
# ⚠️  SAFE — This script only CREATES new directories and
#     installs tools. It does NOT touch public_html or any
#     existing website files.
# ============================================================
set -euo pipefail

echo "============================================================"
echo "  EGONAIR — Group 5.1 Server Preparation"
echo "  Started: $(date)"
echo "============================================================"

# ── STEP 1: Backup public_html/.htaccess (read-only safety snapshot) ─────────
echo ""
echo "[1/7] Creating .htaccess safety backup..."
HTACCESS="$HOME/public_html/.htaccess"
if [ -f "$HTACCESS" ]; then
  BAK="$HOME/public_html/.htaccess.pre-egonair-$(date +%Y%m%d-%H%M%S).bak"
  cp "$HTACCESS" "$BAK"
  echo "  ✅ .htaccess backed up to: $BAK"
else
  echo "  ℹ️  No .htaccess found — nothing to back up."
fi

# ── STEP 2: Create app directory outside public_html ─────────────────────────
echo ""
echo "[2/7] Creating app directory at ~/apps/egonair-stream ..."
mkdir -p "$HOME/apps/egonair-stream"
echo "  ✅ Directory created: $HOME/apps/egonair-stream"

# ── STEP 3: Create recordings directory outside public_html ──────────────────
echo ""
echo "[3/7] Creating recordings directory at ~/recordings ..."
mkdir -p "$HOME/recordings"
chmod 750 "$HOME/recordings"
echo "  ✅ Directory created: $HOME/recordings (chmod 750)"

# ── STEP 4: Create logs directory ────────────────────────────────────────────
echo ""
echo "[4/7] Creating logs directory at ~/logs/egonair ..."
mkdir -p "$HOME/logs/egonair"
echo "  ✅ Directory created: $HOME/logs/egonair"

# ── STEP 5: Install nvm + Node.js 20 (if not already at v18+) ────────────────
echo ""
echo "[5/7] Checking Node.js version..."
CURRENT_NODE=$(node -v 2>/dev/null || echo "none")
echo "  Current: $CURRENT_NODE"

NODE_MAJOR=$(node -e "process.exit(parseInt(process.version.slice(1)))" 2>/dev/null; echo $?)
# Re-read cleanly
NODE_VER_NUM=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1 || echo "0")

if [ "$NODE_VER_NUM" -ge 18 ] 2>/dev/null; then
  echo "  ✅ Node.js $CURRENT_NODE is sufficient (≥18). Skipping nvm install."
else
  echo "  ⚠️  Node.js $CURRENT_NODE is TOO OLD. Installing nvm + Node.js 20 LTS..."
  # Install nvm
  if [ ! -s "$HOME/.nvm/nvm.sh" ]; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    echo "  ✅ nvm installed."
  else
    echo "  ℹ️  nvm already present."
  fi
  # Load nvm in this shell
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  # Install Node.js 20 LTS
  nvm install 20
  nvm use 20
  nvm alias default 20
  echo "  ✅ Node.js $(node -v) installed and set as default."
  # Add nvm to .bashrc if not already there
  if ! grep -q 'NVM_DIR' "$HOME/.bashrc" 2>/dev/null; then
    {
      echo ''
      echo '# nvm — Node Version Manager'
      echo 'export NVM_DIR="$HOME/.nvm"'
      echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"'
      echo '[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"'
    } >> "$HOME/.bashrc"
    echo "  ✅ nvm added to .bashrc"
  fi
fi

# ── STEP 6: Install PM2 globally ─────────────────────────────────────────────
echo ""
echo "[6/7] Installing PM2..."
if command -v pm2 &>/dev/null; then
  echo "  ℹ️  PM2 already installed: $(pm2 -v)"
else
  npm install -g pm2
  echo "  ✅ PM2 installed: $(pm2 -v)"
fi

# ── STEP 7: Check FFmpeg ──────────────────────────────────────────────────────
echo ""
echo "[7/7] Checking FFmpeg..."
if command -v ffmpeg &>/dev/null; then
  echo "  ✅ FFmpeg found: $(ffmpeg -version 2>&1 | head -1)"
else
  echo "  ⚠️  FFmpeg NOT FOUND."
  echo ""
  echo "  --- FFmpeg Installation Options ---"
  echo "  Option A (Ubuntu/Debian):  sudo apt-get install -y ffmpeg"
  echo "  Option B (CentOS/AlmaLinux): sudo yum install -y epel-release && sudo yum install -y ffmpeg"
  echo "  Option C (cPanel/no sudo): Contact hosting provider to install FFmpeg,"
  echo "            or download a static build:"
  echo "    mkdir -p ~/bin"
  echo "    curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o /tmp/ffmpeg.tar.xz"
  echo "    tar xf /tmp/ffmpeg.tar.xz -C /tmp/"
  echo "    cp /tmp/ffmpeg-*-amd64-static/ffmpeg ~/bin/"
  echo "    cp /tmp/ffmpeg-*-amd64-static/ffprobe ~/bin/"
  echo "    export PATH=\"\$HOME/bin:\$PATH\""
  echo "    echo 'export PATH=\"\$HOME/bin:\$PATH\"' >> ~/.bashrc"
  echo "    ffmpeg -version"
  echo "  ------------------------------------"
fi

echo ""
echo "============================================================"
echo "  PREPARATION COMPLETE — $(date)"
echo "============================================================"
echo ""
echo "Summary:"
echo "  App directory:        $HOME/apps/egonair-stream"
echo "  Recordings directory: $HOME/recordings"
echo "  Logs directory:       $HOME/logs/egonair"
echo "  Node.js:              $(node -v 2>/dev/null || echo 'check manually')"
echo "  PM2:                  $(pm2 -v 2>/dev/null || echo 'check manually')"
echo "  FFmpeg:               $(command -v ffmpeg 2>/dev/null && echo FOUND || echo 'NOT FOUND — manual install required')"
echo ""
echo "NEXT STEPS:"
echo "  1. Install FFmpeg if not found (see options above)"
echo "  2. Transfer project files to: $HOME/apps/egonair-stream/"
echo "     Command from your local machine:"
echo "     rsync -avz --exclude='node_modules' --exclude='.next' --exclude='*.db' \\"
echo "       ./frontend/ USER@egonair.com:~/apps/egonair-stream/frontend/"
echo "     rsync -avz --exclude='node_modules' --exclude='debug-recordings' \\"
echo "       ./backend-audio/ USER@egonair.com:~/apps/egonair-stream/backend-audio/"
echo "  3. Create .env files (see deploy/env.production.template)"
echo "  4. Run: npm install && npx prisma generate && npm run build"
echo ""
