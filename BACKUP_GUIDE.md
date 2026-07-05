# CattySMS - Complete Backup Guide

## Overview

This guide explains how to backup and restore the critical configuration, authentication data, and system settings for CattySMS Gateway.

## Backup Types

### 1. Database Collections Backup
- **Location**: `script/backup-critical-collections.sh`
- **Size**: ~350KB
- **Contents**: MongoDB collections (users, services, countires, tokens, mobileusers)

### 2. System Configuration Backup
- **Location**: `script/backup-system-config.sh`
- **Size**: ~5MB (with SSL certificates)
- **Contents**: Nginx, PHP-FPM, SSL, sysctl, PM2, environment templates

---

## Database Collections Backup

### What Gets Backed Up

| Collection | Description | Documents | Size |
|------------|-------------|------------|------|
| `users` | API credentials (admin users) | 1 | ~500B |
| `services` | Service definitions with OTP patterns | 926 | ~350KB |
| `countires` | Country configurations | 1 | ~250B |
| `tokens` | Authentication tokens | 1 | ~400B |
| `mobileusers` | Mobile app users | 1 | ~400B |

**Total Size:** ~350KB (very small, fast backup)

### What is NOT Backed Up

| Collection | Reason | Can Rebuild? |
|------------|--------|--------------|
| `numbers` | Device inventory (22K+ documents) | Yes, from devices |
| `devices` | Device registrations (12K+ docs) | Yes, devices re-register |
| `orders` | Order history (581K+ docs) | No, but short retention |
| `locks` | Number locks (347K+ docs) | Yes, auto-generated |
| `messages` | SMS messages (12h retention) | No, but temporary |

## Backup Script

### Location
`/var/www/sunmine/script/backup-critical-collections.sh`

### Usage

```bash
cd /var/www/sunmine

# Run backup
bash script/backup-critical-collections.sh
```

### Output

Backups are saved to:
```
./backups/critical-collections/backup-YYYY-MM-DDTHH-MM-SS/
├── users.json
├── services.json
├── countires.json
├── tokens.json
├── mobileusers.json
└── metadata.json
```

### Example Output

```
╔══════════════════════════════════════════════════════════════╗
║         CattySMS - Critical Collections Backup             ║
╚══════════════════════════════════════════════════════════════╝

📁 Backup directory: ./backups/critical-collections/backup-2026-07-05T16-04-00

📦 Backing up users           ... ✅ 1 documents (491B)
📦 Backing up services        ... ✅ 926 documents (344KB)
📦 Backing up countires       ... ✅ 1 documents (248B)
📦 Backing up tokens          ... ✅ 1 documents (412B)
📦 Backing up mobileusers     ... ✅ 1 documents (383B)

╔══════════════════════════════════════════════════════════════╗
║                        Backup Summary                        ║
╚══════════════════════════════════════════════════════════════╝
📊 Total documents: 930
💾 Total size: 346KB
📂 Location: ./backups/critical-collections/backup-2026-07-05T16-04-00
⏰ Time: 2026-07-05T16:04:00Z

✅ Backup completed successfully!
```

## Restore Script

### Location
`/var/www/sunmine/script/restore-critical-collections.sh`

### Usage

```bash
cd /var/www/sunmine

# Restore from backup (specify backup directory)
bash script/restore-critical-collections.sh ./backups/critical-collections/backup-2026-07-05T16-04-00
```

### Output

```
╔══════════════════════════════════════════════════════════════╗
║         CattySMS - Critical Collections Restore            ║
╚══════════════════════════════════════════════════════════════╝

📂 Backup directory: ./backups/critical-collections/backup-2026-07-05T16-04-00
🗄️  Database: sunmine

📥 Restoring users           ... ✅ ~1 documents
📥 Restoring services        ... ✅ ~926 documents
📥 Restoring countires       ... ✅ ~1 documents
📥 Restoring tokens          ... ✅ ~1 documents
📥 Restoring mobileusers     ... ✅ ~1 documents

✅ Restore completed successfully!

⚠️  IMPORTANT: Restart PM2 workers after restore:
   pm2 restart all
```

## Automated Backups

### Setup Daily Backup via Cron

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * cd /var/www/sunmine && bash script/backup-critical-collections.sh >> logs/backup.log 2>&1

# Add backup cleanup (keep last 7 days)
0 3 * * * find /var/www/sunmine/backups/critical-collections/ -type d -mtime +7 -exec rm -rf {} \;
```

## Verification

### Check Backup Contents

```bash
# List backup files
ls -la ./backups/critical-collections/backup-2026-07-05T16-04-00/

# Verify JSON is valid
jq '.' ./backups/critical-collections/backup-2026-07-05T16-04-00/services.json | head -20

# Check document count
jq 'length' ./backups/critical-collections/backup-2026-07-05T16-04-00/users.json
```

### Test Restore (without overwriting)

```bash
# Restore to test database
export MONGODB_URI="mongodb://localhost:27017"
export MONGODB_DATABASE="sunmine_test"
bash script/restore-critical-collections.sh ./backups/critical-collections/backup-2026-07-05T16-04-00
```

## Migration to New Server

### Step 1: Backup Current Server

```bash
cd /var/www/sunmine
bash script/backup-critical-collections.sh
tar -czf critical-backup.tar.gz backups/critical-collections/
```

### Step 2: Transfer to New Server

```bash
scp critical-backup.tar.gz user@new-server:/tmp/
```

### Step 3: Restore on New Server

```bash
# On new server
cd /var/www/sunmine
mkdir -p backups/critical-collections/
tar -xzf /tmp/critical-backup.tar.gz -C backups/
bash script/restore-critical-collections.sh backups/critical-collections/backup-YYYY-MM-DDTHH-MM-SS/
```

## Security Notes

⚠️ **CRITICAL SECURITY INFORMATION:**

The backup contains sensitive data:
- API keys (`users.apikey`, `users.api_key`)
- Encrypted passwords (`users.password`)
- Authentication tokens (`tokens`)

**Recommendations:**
1. Store backups in secure location with restricted permissions
2. Encrypt backups if storing off-site
3. Never commit backups to public repositories
4. Set appropriate file permissions: `chmod 600 backups/critical-collections/*`

### Set Secure Permissions

```bash
# Secure backup directory
chmod 700 backups/critical-collections/
chmod 600 backups/critical-collections/backup-*/{*.json,metadata.json}
```

## Troubleshooting

### Permission Denied

```bash
# Ensure script is executable
chmod +x script/backup-critical-collections.sh
chmod +x script/restore-critical-collections.sh
```

### MongoDB Connection Error

```bash
# Check MongoDB is running
sudo systemctl status mongodb

# Check connection string
echo $MONGODB_URI
```

### mongoexport/mongoimport Not Found

```bash
# Install MongoDB tools
sudo apt install -y mongodb-org-tools

# Or download from MongoDB
wget https://downloads.mongodb.com/compass/mongodb-database-tools-ubuntu2204-100.6.1.deb
sudo dpkg -i mongodb-database-tools-ubuntu2204-100.6.1.deb
```

## Related Scripts

- `script/backup.mjs` - Full system backup
- `deployment/README.md` - Complete deployment guide

## Quick Reference

```bash
# Database collections backup
bash script/backup-critical-collections.sh
bash script/restore-critical-collections.sh <backup-dir>

# System configuration backup
bash script/backup-system-config.sh
bash script/restore-system-config.sh <backup-dir>

# List backups
ls -la backups/critical-collections/
ls -la backups/system-config/

# Clean old backups (>7 days)
find backups/critical-collections/ -type d -mtime +7 -exec rm -rf {} \;
find backups/system-config/ -type d -mtime +7 -exec rm -rf {} \;
```

---

## System Configuration Backup

### What Gets Backed Up

| Component | Files | Size | Description |
|-----------|-------|------|-------------|
| **Nginx** | nginx.conf, sites-available/* | ~50KB | Web server configuration |
| **PHP-FPM** | www.conf, php-fpm.conf | ~20KB | FastCGI process manager config |
| **SSL** | /etc/letsencrypt/live/ | ~3MB | SSL certificates (Let's Encrypt) |
| **System** | sysctl, systemd overrides | ~5KB | Kernel parameters, service limits |
| **PM2** | dump.pm2, ecosystem.config.cjs | ~10KB | Process manager configuration |
| **Environment** | .env.example | ~2KB | Environment variables template |

**Total Size:** ~3-5MB (mostly SSL certificates)

### Script Location
`/var/www/sunmine/script/backup-system-config.sh`

### Usage

```bash
cd /var/www/sunmine

# Run system configuration backup
bash script/backup-system-config.sh
```

### Output

Backups are saved to:
```
./backups/system-config/backup-YYYY-MM-DDTHH-MM-SS/
├── nginx-config.tar.gz
├── php-fpm-config.tar.gz
├── ssl-certificates.tar.gz
├── system-config.tar.gz
├── pm2-config.tar.gz
├── env-template.tar.gz
└── metadata.json
```

### Example Output

```
╔══════════════════════════════════════════════════════════════╗
║         CattySMS - System Configuration Backup             ║
╚══════════════════════════════════════════════════════════════╝

📁 Backup directory: ./backups/system-config/backup-2026-07-05T16-04-00

📦 Backing up Nginx configuration...
✅ Nginx configuration backed up
📦 Backing up PHP-FPM configuration...
✅ PHP-FPM configuration backed up
📦 Backing up SSL certificates...
✅ SSL certificates backed up
📦 Backing up system configuration...
✅ System configuration backed up
📦 Backing up PM2 configuration...
✅ PM2 configuration backed up
📦 Backing up environment variables (template)...
✅ Environment template backed up
📦 Creating metadata...

╔══════════════════════════════════════════════════════════════╗
║                        Backup Summary                        ║
╚══════════════════════════════════════════════════════════════╝
💾 Total size: 3.2MB
📂 Location: ./backups/system-config/backup-2026-07-05T16-04-00
⏰ Time: 2026-07-05T16:04:00Z

Components backed up:
  ✅ Nginx configuration (main + sites)
  ✅ PHP-FPM configuration
  ✅ SSL certificates (Let's Encrypt)
  ✅ System configuration (sysctl, systemd)
  ✅ PM2 configuration
  ✅ Environment template (.env.example)

⚠️  SECURITY WARNING:
   This backup contains SSL private keys and sensitive configs.
   Store securely and never commit to public repositories.

✅ System configuration backup completed successfully!
```

### Restore Script

#### Location
`/var/www/sunmine/script/restore-system-config.sh`

#### Usage

```bash
cd /var/www/sunmine

# Restore system configuration (requires sudo)
sudo bash script/restore-system-config.sh ./backups/system-config/backup-2026-07-05T16-04-00
```

#### What Gets Restored

1. **Nginx** - Main config + site configurations
2. **PHP-FPM** - Pool configuration
3. **SSL** - Let's Encrypt certificates and params
4. **System** - sysctl optimizations, systemd overrides
5. **PM2** - Process manager configuration
6. **Environment** - .env.example template

#### Example Output

```
╔══════════════════════════════════════════════════════════════╗
║         CattySMS - System Configuration Restore            ║
╚══════════════════════════════════════════════════════════════╝

📂 Backup directory: ./backups/system-config/backup-2026-07-05T16-04-00
⏰ Backup timestamp: 2026-07-05T16:04:00Z

📥 Restoring Nginx configuration...
✅ Nginx configuration restored
📥 Restoring PHP-FPM configuration...
✅ PHP-FPM configuration restored
📥 Restoring SSL certificates...
✅ SSL certificates restored
📥 Restoring system configuration...
✅ System configuration restored
📥 Restoring PM2 configuration...
✅ PM2 configuration restored

╔══════════════════════════════════════════════════════════════╗
║                    Restarting Services                       ║
╚══════════════════════════════════════════════════════════════╝

Do you want to restart services now? (y/N): y
🔄 Restarting services...
✅ PHP-FPM restarted
✅ Nginx restarted
✅ PM2 processes restarted

╔══════════════════════════════════════════════════════════════╗
║                    Restore Complete                         ║
╚══════════════════════════════════════════════════════════════╝

✅ System configuration restore completed!

⚠️  IMPORTANT:
   1. Verify nginx config: sudo nginx -t
   2. Check SSL certificates: sudo certbot certificates
   3. Test website accessibility
   4. Check PM2 processes: pm2 list
```

### Nginx Configuration Details

The backup includes:

**Main Configuration** (`/etc/nginx/nginx.conf`)
- Optimized for 12-core / 62GB VPS
- 32,768 worker connections
- WebSocket support
- SSL/TLS configuration

**Site Configurations** (`/etc/nginx/sites-available/`)
- `api.cryptix-syncnode.shop.conf` - API subdomain
- `cryptix-syncnode.shop.conf` - Main site

### SSL Certificates

**Location**: `/etc/letsencrypt/live/cryptix-syncnode.shop/`

**Files Included**:
- `fullchain.pem` - Full certificate chain
- `privkey.pem` - Private key
- `chain.pem` - Certificate chain
- `options-ssl-nginx.conf` - SSL options
- `ssl-dhparams.pem` - Diffie-Hellman parameters

⚠️ **SECURITY WARNING**: SSL private keys are included. Handle with extreme care!

### System Optimizations

**Sysctl Configuration** (`/etc/sysctl.d/99-cattysms-optimize.conf`)
```
net.core.somaxconn = 4096
net.ipv4.tcp_max_syn_backlog = 8192
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_keepalive_time = 600
fs.file-max = 2097152
```

**Systemd Override** (`/etc/systemd/system/nginx.service.d/override.conf`)
```
[Service]
LimitNOFILE=524288
```

### PHP-FPM Configuration

**Pool Configuration** (`/etc/php/8.1/fpm/pool.d/www.conf`)
```
pm = dynamic
pm.max_children = 2
pm.start_servers = 2
pm.min_spare_servers = 1
pm.max_spare_servers = 2
```

### Complete Backup Strategy

For a complete system backup, run both scripts:

```bash
# 1. Backup database collections
bash script/backup-critical-collections.sh

# 2. Backup system configuration
bash script/backup-system-config.sh

# 3. Create combined archive
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
tar -czf cattysms-complete-backup-${TIMESTAMP}.tar.gz \
  backups/critical-collections/backup-*/ \
  backups/system-config/backup-*/
```

### Automated Complete Backup

```bash
# Add to crontab
crontab -e

# Daily complete backup at 2 AM
0 2 * * * cd /var/www/sunmine && bash script/backup-critical-collections.sh && bash script/backup-system-config.sh && tar -czf backups/complete-$(date +\%Y\%m\%d).tar.gz backups/*/backup-*/ && find backups/ -name "complete-*.tar.gz" -mtime +7 -delete >> logs/backup.log 2>&1
```

### Migration to New Server (Complete)

```bash
# Step 1: Backup current server
cd /var/www/sunmine
bash script/backup-critical-collections.sh
bash script/backup-system-config.sh
tar -czf cattysms-migration.tar.gz backups/ .env ecosystem.config.cjs

# Step 2: Transfer to new server
scp cattysms-migration.tar.gz user@new-server:/tmp/

# Step 3: On new server
cd /var/www/sunmine
tar -xzf /tmp/cattysms-migration.tar.gz
bash script/restore-critical-collections.sh backups/critical-collections/backup-*/
sudo bash script/restore-system-config.sh backups/system-config/backup-*/
```

## Quick Reference

```bash
# Backup
bash script/backup-critical-collections.sh

# Restore
bash script/restore-critical-collections.sh <backup-dir>

# List backups
ls -la backups/critical-collections/

# Clean old backups (>7 days)
find backups/critical-collections/ -type d -mtime +7 -exec rm -rf {} \;
```
