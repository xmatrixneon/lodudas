#!/bin/bash

# CattySMS - System Configuration Backup Script
# Backs up nginx, PHP-FPM, SSL certificates, and system configs

set -e

# Configuration
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S" | sed 's/:/-/g')
BACKUP_DIR="./backups/system-config/backup-${TIMESTAMP}"
TEMP_DIR="${BACKUP_DIR}/temp"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         CattySMS - System Configuration Backup             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"
mkdir -p "$TEMP_DIR"
echo "📁 Backup directory: $BACKUP_DIR"
echo ""

# ==========================================
# 1. Nginx Configuration
# ==========================================
echo "📦 Backing up Nginx configuration..."

mkdir -p "$TEMP_DIR/nginx"
cp -r /etc/nginx/* "$TEMP_DIR/nginx/" 2>/dev/null || echo "⚠️  Nginx config not found"

# Create tarball
tar -czf "$BACKUP_DIR/nginx-config.tar.gz" -C "$TEMP_DIR" nginx
echo "✅ Nginx configuration backed up"

# ==========================================
# 2. PHP-FPM Configuration
# ==========================================
echo "📦 Backing up PHP-FPM configuration..."

mkdir -p "$TEMP_DIR/php-fpm"
cp -r /etc/php/8.1/fpm/* "$TEMP_DIR/php-fpm/" 2>/dev/null || echo "⚠️  PHP-FPM config not found"

tar -czf "$BACKUP_DIR/php-fpm-config.tar.gz" -C "$TEMP_DIR" php-fpm
echo "✅ PHP-FPM configuration backed up"

# ==========================================
# 3. SSL Certificates (Let's Encrypt)
# ==========================================
echo "📦 Backing up SSL certificates..."

# Copy only the essential SSL files (not the entire letsencrypt directory with archives)
mkdir -p "$TEMP_DIR/ssl"
cp -r /etc/letsencrypt/live "$TEMP_DIR/ssl/" 2>/dev/null || echo "⚠️  SSL certificates not found"
cp /etc/letsencrypt/options-ssl-nginx.conf "$TEMP_DIR/ssl/" 2>/dev/null || true
cp /etc/letsencrypt/ssl-dhparams.pem "$TEMP_DIR/ssl/" 2>/dev/null || true

tar -czf "$BACKUP_DIR/ssl-certificates.tar.gz" -C "$TEMP_DIR" ssl
echo "✅ SSL certificates backed up"

# ==========================================
# 4. System Configuration
# ==========================================
echo "📦 Backing up system configuration..."

mkdir -p "$TEMP_DIR/system"

# Systemd override for nginx
if [ -f /etc/systemd/system/nginx.service.d/override.conf ]; then
  cp /etc/systemd/system/nginx.service.d/override.conf "$TEMP_DIR/system/nginx-override.conf"
fi

# Sysctl optimizations
if [ -f /etc/sysctl.d/99-cattysms-optimize.conf ]; then
  cp /etc/sysctl.d/99-cattysms-optimize.conf "$TEMP_DIR/system/sysctl-optimize.conf"
fi

# Redis configuration
if [ -f /etc/redis/redis.conf ]; then
  cp /etc/redis/redis.conf "$TEMP_DIR/system/redis.conf" 2>/dev/null || true
fi

tar -czf "$BACKUP_DIR/system-config.tar.gz" -C "$TEMP_DIR" system
echo "✅ System configuration backed up"

# ==========================================
# 5. PM2 Configuration
# ==========================================
echo "📦 Backing up PM2 configuration..."

if command -v pm2 &> /dev/null; then
  pm2 save --force 2>/dev/null || true
  cp ~/.pm2/dump.pm2 "$TEMP_DIR/" 2>/dev/null || echo "⚠️  PM2 dump not found"
  cp ecosystem.config.cjs "$TEMP_DIR/" 2>/dev/null || true

  tar -czf "$BACKUP_DIR/pm2-config.tar.gz" -C "$TEMP_DIR" dump.pm2 ecosystem.config.cjs 2>/dev/null || echo "⚠️  PM2 config backup failed"
  echo "✅ PM2 configuration backed up"
else
  echo "⚠️  PM2 not found"
fi

# ==========================================
# 6. Environment Variables
# ==========================================
echo "📦 Backing up environment variables (template)..."

if [ -f .env.example ]; then
  cp .env.example "$TEMP_DIR/"
  tar -czf "$BACKUP_DIR/env-template.tar.gz" -C "$TEMP_DIR" .env.example
  echo "✅ Environment template backed up"
else
  echo "⚠️  .env.example not found"
fi

# ==========================================
# 7. Metadata
# ==========================================
echo "📦 Creating metadata..."

cat > "$TEMP_DIR/metadata.json" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "hostname": "$(hostname)",
  "domain": "cryptix-syncnode.shop",
  "components": {
    "nginx": "nginx-config.tar.gz",
    "php-fpm": "php-fpm-config.tar.gz",
    "ssl": "ssl-certificates.tar.gz",
    "system": "system-config.tar.gz",
    "pm2": "pm2-config.tar.gz",
    "env": "env-template.tar.gz"
  },
  "ssl": {
    "domain": "cryptix-syncnode.shop",
    "path": "/etc/letsencrypt/live/cryptix-syncnode.shop/"
  },
  "nginx_sites": [
    "api.cryptix-syncnode.shop.conf",
    "cryptix-syncnode.shop.conf"
  ]
}
EOF

cp "$TEMP_DIR/metadata.json" "$BACKUP_DIR/metadata.json"

# Cleanup temp directory
rm -rf "$TEMP_DIR"

# ==========================================
# Summary
# ==========================================
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                        Backup Summary                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"

BACKUP_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
echo "💾 Total size: $BACKUP_SIZE"
echo "📂 Location: $BACKUP_DIR"
echo "⏰ Time: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""
echo "Components backed up:"
echo "  ✅ Nginx configuration (main + sites)"
echo "  ✅ PHP-FPM configuration"
echo "  ✅ SSL certificates (Let's Encrypt)"
echo "  ✅ System configuration (sysctl, systemd)"
echo "  ✅ PM2 configuration"
echo "  ✅ Environment template (.env.example)"
echo ""
echo "⚠️  SECURITY WARNING:"
echo "   This backup contains SSL private keys and sensitive configs."
echo "   Store securely and never commit to public repositories."
echo ""
echo "✅ System configuration backup completed successfully!"
echo ""

exit 0
