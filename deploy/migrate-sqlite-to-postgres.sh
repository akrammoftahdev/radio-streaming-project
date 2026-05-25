#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# EGONAIR — SQLite → Cloud SQL PostgreSQL Migration
# Run locally with direct access to both the VPS SQLite file and Cloud SQL.
# Prerequisites:
#   - cloud-sql-proxy running locally: cloud-sql-proxy <INSTANCE_CONNECTION_NAME>
#   - psql installed
#   - sqlite3 installed
#   - VPS SQLite file copied locally as prod.db
# Usage:
#   CLOUD_SQL_URL="postgresql://egonair:PASSWORD@127.0.0.1:5432/egonair" \
#   SQLITE_FILE="./prod.db" \
#   bash deploy/migrate-sqlite-to-postgres.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

CLOUD_SQL_URL="${CLOUD_SQL_URL:?Set CLOUD_SQL_URL}"
SQLITE_FILE="${SQLITE_FILE:-./prod.db}"

echo "[+] Source SQLite: $SQLITE_FILE"
echo "[+] Target PostgreSQL: (Cloud SQL via proxy)"

# Step 1: Apply Prisma schema to PostgreSQL
echo ""
echo "=== Step 1: Apply Prisma schema ==="
cd "$(dirname "$0")/../frontend"
DATABASE_URL="$CLOUD_SQL_URL" npx prisma migrate deploy
echo "[+] Schema applied."

# Step 2: Export SQLite data as SQL inserts
echo ""
echo "=== Step 2: Export data from SQLite ==="
TABLES=(
  "User"
  "PresenterProfile"
  "PresenterValidity"
  "BroadcastSchedule"
  "SonicPanelCredential"
  "MediaCategory"
  "MediaTrack"
  "LiveSession"
  "AccessLog"
  "AdminAuditLog"
  "AudioTransitionSettings"
  "recordings"
)

DUMP_FILE="/tmp/egonair_sqlite_dump.sql"
echo "" > "$DUMP_FILE"

for TABLE in "${TABLES[@]}"; do
  echo "  Exporting table: $TABLE"
  # sqlite3 .dump outputs CREATE TABLE + INSERT statements
  sqlite3 "$SQLITE_FILE" ".dump $TABLE" >> "$DUMP_FILE" 2>/dev/null || echo "  (table $TABLE empty or not found)"
done

echo "[+] SQLite dump written to $DUMP_FILE"

# Step 3: Convert SQLite dump to PostgreSQL-compatible SQL
echo ""
echo "=== Step 3: Convert SQLite SQL to PostgreSQL ==="
PG_DUMP_FILE="/tmp/egonair_pg_import.sql"
sed \
  -e 's/INTEGER PRIMARY KEY AUTOINCREMENT/SERIAL PRIMARY KEY/g' \
  -e 's/TEXT/VARCHAR/g' \
  -e 's/REAL/DECIMAL/g' \
  -e 's/BLOB/BYTEA/g' \
  -e '/^CREATE TABLE/d' \
  -e '/^CREATE UNIQUE INDEX/d' \
  -e '/^CREATE INDEX/d' \
  "$DUMP_FILE" > "$PG_DUMP_FILE"
echo "[+] Converted dump: $PG_DUMP_FILE"

# Step 4: Import (INSERT only — schema already applied by Prisma)
echo ""
echo "=== Step 4: Import into PostgreSQL ==="
# Only run INSERT lines from the dump
grep "^INSERT" "$PG_DUMP_FILE" | psql "$CLOUD_SQL_URL" 2>&1 | tail -10 || true
echo "[+] Import complete."

echo ""
echo "=== Step 5: Verify row counts ==="
for TABLE in "\"User\"" "recordings" "\"MediaTrack\""; do
  COUNT=$(psql "$CLOUD_SQL_URL" -t -c "SELECT COUNT(*) FROM $TABLE;" 2>/dev/null | tr -d ' ' || echo "error")
  echo "  $TABLE: $COUNT rows"
done

echo ""
echo "[+] Migration done. Run Prisma Studio to verify:"
echo "    DATABASE_URL=\"$CLOUD_SQL_URL\" npx prisma studio"
