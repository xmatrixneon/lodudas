#!/bin/bash

# CattySMS - Critical Collections Backup Script
# Backs up essential configuration and authentication data

set -e

# Configuration
MONGODB_URI="${MONGODB_URI:-mongodb://localhost:27017}"
DB_NAME="${MONGODB_DATABASE:-sunmine}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S" | sed 's/:/-/g')
BACKUP_DIR="./backups/critical-collections/backup-${TIMESTAMP}"

# Collections to backup
COLLECTIONS=(
  "users:API credentials"
  "services:Service definitions"
  "countires:Country configs"
  "tokens:Auth tokens"
  "mobileusers:Mobile app users"
)

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         CattySMS - Critical Collections Backup             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"
echo "📁 Backup directory: $BACKUP_DIR"
echo ""

TOTAL_DOCS=0
TOTAL_SIZE=0

# Backup each collection
for collection_info in "${COLLECTIONS[@]}"; do
  IFS=':' read -r collection_name description <<< "$collection_info"

  printf "📦 Backing up %-15s ... " "$collection_name"

  # Use mongoexport to export to JSON
  if mongoexport --uri="$MONGODB_URI/$DB_NAME" \
    --collection="$collection_name" \
    --out="$BACKUP_DIR/${collection_name}.json" \
    --jsonArray \
    --quiet 2>/dev/null; then

    # Get document count
    DOCS=$(wc -l < "$BACKUP_DIR/${collection_name}.json" 2>/dev/null || echo "0")
    DOCS=$((DOCS - 1))  # Subtract 1 for closing bracket
    if [ "$DOCS" -lt 0 ]; then DOCS=0; fi

    # Get file size
    SIZE=$(du -b "$BACKUP_DIR/${collection_name}.json" 2>/dev/null | cut -f1 || echo "0")

    TOTAL_DOCS=$((TOTAL_DOCS + DOCS))
    TOTAL_SIZE=$((TOTAL_SIZE + SIZE))

    echo "✅ $DOCS documents ($(numfmt --to=iec-i --suffix=B $SIZE 2>/dev/null || echo "${SIZE}B"))"
  else
    echo "❌ Failed"
  fi
done

# Create metadata file
cat > "$BACKUP_DIR/metadata.json" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "database": "$DB_NAME",
  "collections": [
    {"name": "users", "description": "API credentials"},
    {"name": "services", "description": "Service definitions"},
    {"name": "countires", "description": "Country configs"},
    {"name": "tokens", "description": "Auth tokens"},
    {"name": "mobileusers", "description": "Mobile app users"}
  ],
  "totalDocuments": $TOTAL_DOCS,
  "totalSize": $TOTAL_SIZE
}
EOF

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                        Backup Summary                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo "📊 Total documents: $TOTAL_DOCS"
echo "💾 Total size: $(numfmt --to=iec-i --suffix=B $TOTAL_SIZE 2>/dev/null || echo "${TOTAL_SIZE}B")"
echo "📂 Location: $BACKUP_DIR"
echo "⏰ Time: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""
echo "✅ Backup completed successfully!"
echo ""

exit 0
