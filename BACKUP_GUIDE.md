# CattySMS - Critical Collections Backup Guide

## Overview

This guide explains how to backup and restore the critical configuration and authentication data for CattySMS Gateway.

## What Gets Backed Up

### Tier 1 - CRITICAL Collections

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
# Backup
bash script/backup-critical-collections.sh

# Restore
bash script/restore-critical-collections.sh <backup-dir>

# List backups
ls -la backups/critical-collections/

# Clean old backups (>7 days)
find backups/critical-collections/ -type d -mtime +7 -exec rm -rf {} \;
```
