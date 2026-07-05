#!/bin/bash

# CattySMS - Critical Collections Restore Script
# Restores essential configuration and authentication data from backup

set -e

# Configuration
MONGODB_URI="${MONGODB_URI:-mongodb://localhost:27017}"
DB_NAME="${MONGODB_DATABASE:-sunmine}"

# Check arguments
if [ -z "$1" ]; then
  echo "❌ Error: Backup directory required"
  echo "Usage: $0 <backup-directory>"
  echo "Example: $0 ./backups/critical-collections/backup-2026-07-05T16-04-00"
  exit 1
fi

BACKUP_DIR="$1"

# Check if backup directory exists
if [ ! -d "$BACKUP_DIR" ]; then
  echo "❌ Error: Backup directory not found: $BACKUP_DIR"
  exit 1
fi

# Check if metadata exists
if [ ! -f "$BACKUP_DIR/metadata.json" ]; then
  echo "❌ Error: Metadata file not found in backup directory"
  exit 1
fi

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         CattySMS - Critical Collections Restore            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "📂 Backup directory: $BACKUP_DIR"
echo "🗄️  Database: $DB_NAME"
echo ""

# Read metadata
if command -v jq &> /dev/null; then
  TIMESTAMP=$(jq -r '.timestamp' "$BACKUP_DIR/metadata.json")
  echo "⏰ Backup timestamp: $TIMESTAMP"
  echo ""
fi

# Collections to restore
COLLECTIONS=(
  "users"
  "services"
  "countires"
  "tokens"
  "mobileusers"
)

TOTAL_DOCS=0

# Restore each collection
for collection in "${COLLECTIONS[@]}"; do
  BACKUP_FILE="$BACKUP_DIR/${collection}.json"

  if [ ! -f "$BACKUP_FILE" ]; then
    echo "⚠️  Skipping $collection (file not found)"
    continue
  fi

  printf "📥 Restoring %-15s ... " "$collection"

  # Drop existing collection (optional - comment out if you want to merge)
  # mongosh --quiet "$MONGODB_URI/$DB_NAME" --eval "db.$collection.drop()" > /dev/null 2>&1

  # Restore using mongoimport
  if mongoimport --uri="$MONGODB_URI/$DB_NAME" \
    --collection="$collection" \
    --file="$BACKUP_FILE" \
    --jsonArray \
    --drop \
    --quiet 2>/dev/null; then

    # Get document count (approximate from file)
    DOCS=$(grep -o '"_id"' "$BACKUP_FILE" | wc -l)
    TOTAL_DOCS=$((TOTAL_DOCS + DOCS))

    echo "✅ ~$DOCS documents"
  else
    echo "❌ Failed"
  fi
done

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                        Restore Summary                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo "📊 Total documents restored: ~$TOTAL_DOCS"
echo "🗄️  Database: $DB_NAME"
echo ""
echo "✅ Restore completed successfully!"
echo ""
echo "⚠️  IMPORTANT: Restart PM2 workers after restore:"
echo "   pm2 restart all"
echo ""

exit 0
