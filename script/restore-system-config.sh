#!/bin/bash

# CattySMS - System Configuration Restore Script
# Restores nginx, PHP-FPM, SSL certificates, and system configs

set -e

# Check arguments
if [ -z "$1" ]; then
  echo "❌ Error: Backup directory required"
  echo "Usage: $0 <backup-directory>"
  echo "Example: $0 ./backups/system-config/backup-2026-07-05T16-04-00"
  exit 1
fi

BACKUP_DIR="$1"

# Check if backup directory exists
if [ ! -d "$BACKUP_DIR" ]; then
  echo "❌ Error: Backup directory not found: $BACKUP_DIR"
  exit 1
fi

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         CattySMS - System Configuration Restore            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "📂 Backup directory: $BACKUP_DIR"
echo ""

# Check for metadata
if [ -f "$BACKUP_DIR/metadata.json" ]; then
  TIMESTAMP=$(grep -o '"timestamp": "[^"]*' "$BACKUP_DIR/metadata.json" | cut -d'"' -f4)
  echo "⏰ Backup timestamp: $TIMESTAMP"
  echo ""
fi

# Temporary extraction directory
TEMP_DIR="/tmp/system-restore-$$"
mkdir -p "$TEMP_DIR"

# ==========================================
# 1. Restore Nginx Configuration
# ==========================================
if [ -f "$BACKUP_DIR/nginx-config.tar.gz" ]; then
  echo "📥 Restoring Nginx configuration..."

  tar -xzf "$BACKUP_DIR/nginx-config.tar.gz" -C "$TEMP_DIR"

  # Backup current nginx config
  if [ -d /etc/nginx ]; then
    sudo cp -r /etc/nginx "/etc/nginx.backup.$(date +%s)" 2>/dev/null || true
  fi

  # Copy new config
  sudo cp -r "$TEMP_DIR/nginx/"* /etc/nginx/
  sudo nginx -t 2>/dev/null && echo "✅ Nginx configuration restored" || echo "⚠️  Nginx config test failed"
else
  echo "⚠️  nginx-config.tar.gz not found, skipping"
fi

# ==========================================
# 2. Restore PHP-FPM Configuration
# ==========================================
if [ -f "$BACKUP_DIR/php-fpm-config.tar.gz" ]; then
  echo "📥 Restoring PHP-FPM configuration..."

  tar -xzf "$BACKUP_DIR/php-fpm-config.tar.gz" -C "$TEMP_DIR"

  # Backup current PHP-FPM config
  if [ -d /etc/php/8.1/fpm ]; then
    sudo cp -r /etc/php/8.1/fpm "/etc/php/8.1/fpm.backup.$(date +%s)" 2>/dev/null || true
  fi

  # Copy new config
  sudo cp -r "$TEMP_DIR/php-fpm/"* /etc/php/8.1/fpm/
  echo "✅ PHP-FPM configuration restored"
else
  echo "⚠️  php-fpm-config.tar.gz not found, skipping"
fi

# ==========================================
# 3. Restore SSL Certificates
# ==========================================
if [ -f "$BACKUP_DIR/ssl-certificates.tar.gz" ]; then
  echo "📥 Restoring SSL certificates..."

  tar -xzf "$BACKUP_DIR/ssl-certificates.tar.gz" -C "$TEMP_DIR"

  # Backup current SSL
  if [ -d /etc/letsencrypt ]; then
    sudo cp -r /etc/letsencrypt "/etc/letsencrypt.backup.$(date +%s)" 2>/dev/null || true
  fi

  # Copy SSL certificates
  sudo mkdir -p /etc/letsencrypt
  sudo cp -r "$TEMP_DIR/ssl/live" /etc/letsencrypt/ 2>/dev/null || true
  sudo cp "$TEMP_DIR/ssl/options-ssl-nginx.conf" /etc/letsencrypt/ 2>/dev/null || true
  sudo cp "$TEMP_DIR/ssl/ssl-dhparams.pem" /etc/letsencrypt/ 2>/dev/null || true
  echo "✅ SSL certificates restored"
else
  echo "⚠️  ssl-certificates.tar.gz not found, skipping"
fi

# ==========================================
# 4. Restore System Configuration
# ==========================================
if [ -f "$BACKUP_DIR/system-config.tar.gz" ]; then
  echo "📥 Restoring system configuration..."

  tar -xzf "$BACKUP_DIR/system-config.tar.gz" -C "$TEMP_DIR"

  # Restore systemd override
  if [ -f "$TEMP_DIR/system/nginx-override.conf" ]; then
    sudo mkdir -p /etc/systemd/system/nginx.service.d
    sudo cp "$TEMP_DIR/system/nginx-override.conf" /etc/systemd/system/nginx.service.d/override.conf
    sudo systemctl daemon-reload
  fi

  # Restore sysctl config
  if [ -f "$TEMP_DIR/system/sysctl-optimize.conf" ]; then
    sudo cp "$TEMP_DIR/system/sysctl-optimize.conf" /etc/sysctl.d/99-cattysms-optimize.conf
    sudo sysctl -p /etc/sysctl.d/99-cattysms-optimize.conf > /dev/null
  fi

  echo "✅ System configuration restored"
else
  echo "⚠️  system-config.tar.gz not found, skipping"
fi

# ==========================================
# 5. Restore PM2 Configuration
# ==========================================
if [ -f "$BACKUP_DIR/pm2-config.tar.gz" ]; then
  echo "📥 Restoring PM2 configuration..."

  tar -xzf "$BACKUP_DIR/pm2-config.tar.gz" -C "$TEMP_DIR"

  if [ -f "$TEMP_DIR/ecosystem.config.cjs" ]; then
    cp "$TEMP_DIR/ecosystem.config.cjs" ./ecosystem.config.cjs
    echo "✅ PM2 ecosystem configuration restored"
  fi

  if [ -f "$TEMP_DIR/dump.pm2" ]; then
    mkdir -p ~/.pm2
    cp "$TEMP_DIR/dump.pm2" ~/.pm2/
    echo "✅ PM2 dump restored"
  fi
else
  echo "⚠️  pm2-config.tar.gz not found, skipping"
fi

# Cleanup temp directory
rm -rf "$TEMP_DIR"

# ==========================================
# Restart Services
# ==========================================
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    Restarting Services                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Ask for confirmation
read -p "Do you want to restart services now? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "🔄 Restarting services..."
  sudo systemctl restart php8.1-fpm 2>/dev/null && echo "✅ PHP-FPM restarted" || echo "⚠️  PHP-FPM restart failed"
  sudo systemctl restart nginx 2>/dev/null && echo "✅ Nginx restarted" || echo "⚠️  Nginx restart failed"

  if command -v pm2 &> /dev/null; then
    pm2 resurrect 2>/dev/null || pm2 restart all
    echo "✅ PM2 processes restarted"
  fi
else
  echo "⏭️  Services not restarted. Restart manually when ready:"
  echo "   sudo systemctl restart php8.1-fpm nginx"
  echo "   pm2 restart all"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    Restore Complete                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "✅ System configuration restore completed!"
echo ""
echo "⚠️  IMPORTANT:"
echo "   1. Verify nginx config: sudo nginx -t"
echo "   2. Check SSL certificates: sudo certbot certificates"
echo "   3. Test website accessibility"
echo "   4. Check PM2 processes: pm2 list"
echo ""

exit 0
