#!/usr/bin/env bash
# ============================================================
# EGONAIR — Group 5.1 Server Audit Script
# Run this on the VPS via SSH. READ-ONLY — no changes made.
# ============================================================
set -euo pipefail

echo ""
echo "============================================================"
echo "  EGONAIR SERVER AUDIT — $(date)"
echo "============================================================"

echo ""
echo "===== NODE.JS ====="
node -v 2>/dev/null || echo "ERROR: node not found"
which node 2>/dev/null || true
# Check nvm
[ -s "$HOME/.nvm/nvm.sh" ] && echo "nvm is installed" || echo "nvm NOT installed"

echo ""
echo "===== NPM ====="
npm -v 2>/dev/null || echo "ERROR: npm not found"

echo ""
echo "===== FFMPEG ====="
command -v ffmpeg 2>/dev/null && echo "ffmpeg FOUND at $(command -v ffmpeg)" || echo "ffmpeg NOT FOUND"
ffmpeg -version 2>/dev/null | head -3 || true

echo ""
echo "===== PM2 ====="
command -v pm2 2>/dev/null && echo "pm2 FOUND" && pm2 -v || echo "pm2 NOT installed"

echo ""
echo "===== GIT ====="
git --version 2>/dev/null || echo "git not found"

echo ""
echo "===== USER / HOME ====="
echo "User: $(whoami)"
echo "Home: $HOME"
echo "PWD:  $(pwd)"

echo ""
echo "===== DISK ====="
df -h / 2>/dev/null | tail -1

echo ""
echo "===== MEMORY ====="
free -m 2>/dev/null | head -2 || true

echo ""
echo "===== CPUs ====="
nproc 2>/dev/null || true

echo ""
echo "===== LITESPEED ====="
[ -f /usr/local/lsws/VERSION ] && echo "LiteSpeed VERSION: $(cat /usr/local/lsws/VERSION)" || echo "LiteSpeed not found"
command -v lsws 2>/dev/null || true

echo ""
echo "===== APACHE ====="
apachectl -v 2>/dev/null | head -1 || httpd -v 2>/dev/null | head -1 || echo "apache2ctl not in PATH (may still be present)"

echo ""
echo "===== CPANEL ====="
[ -f /usr/local/cpanel/version ] && cat /usr/local/cpanel/version || echo "cPanel version file not found"

echo ""
echo "===== SSL / HTTPS ====="
echo "Let's Encrypt:"
ls /etc/letsencrypt/live/ 2>/dev/null || echo "  No Let's Encrypt certs directory"
echo "cPanel SSL:"
ls /var/cpanel/ssl/installed/certs/ 2>/dev/null | grep -i egonair || echo "  No cPanel cert found for egonair"
echo "Checking port 443:"
ss -tlnp 2>/dev/null | grep ':443' || echo "  Port 443 not listed in ss output"

echo ""
echo "===== OPEN PORTS (relevant) ====="
ss -tlnp 2>/dev/null | grep -E ':(80|443|3000|4001)\b' || echo "  (no matches found)"

echo ""
echo "===== PUBLIC_HTML SAFETY SNAPSHOT ====="
echo "Listing public_html:"
ls -la "$HOME/public_html/" 2>/dev/null | head -20 || echo "public_html not found"
echo ""
echo ".htaccess (first 10 lines, safe read):"
head -10 "$HOME/public_html/.htaccess" 2>/dev/null || echo "  .htaccess not found"

echo ""
echo "===== APP FOLDER CHECK ====="
[ -d "$HOME/apps/egonair-stream" ] && echo "apps/egonair-stream EXISTS" || echo "apps/egonair-stream NOT YET CREATED"
[ -d "$HOME/recordings" ] && echo "recordings/ EXISTS" || echo "recordings/ NOT YET CREATED"

echo ""
echo "============================================================"
echo "  AUDIT COMPLETE"
echo "============================================================"
echo ""
echo "CRITICAL CHECK SUMMARY:"
echo "  Node.js version (needs 18+):  $(node -v 2>/dev/null || echo 'NOT FOUND')"
echo "  FFmpeg:                        $(command -v ffmpeg 2>/dev/null && echo FOUND || echo 'NOT FOUND')"
echo "  PM2:                           $(command -v pm2 2>/dev/null && echo FOUND || echo 'NOT FOUND')"
echo "  nvm:                           $([ -s "$HOME/.nvm/nvm.sh" ] && echo 'INSTALLED' || echo 'NOT INSTALLED')"
echo ""
