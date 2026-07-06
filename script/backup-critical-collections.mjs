#!/usr/bin/env node

/**
 * Critical Collections Backup Script
 *
 * Backs up essential configuration and authentication data:
 * - users (API credentials)
 * - services (Service definitions with OTP patterns)
 * - countires (Country configurations)
 * - tokens (Authentication tokens)
 * - mobileusers (Mobile app users)
 */

import { MongoClient } from 'mongodb';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DATABASE || 'sunmine';
const BACKUP_DIR = join(process.cwd(), 'backups', 'critical-collections');

// Collections to backup
const COLLECTIONS = [
  { name: 'users', description: 'API credentials' },
  { name: 'services', description: 'Service definitions' },
  { name: 'countires', description: 'Country configs' },
  { name: 'tokens', description: 'Auth tokens' },
  { name: 'mobileusers', description: 'Mobile app users' },
];

async function backupCollections() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         CattySMS - Critical Collections Backup             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const client = new MongoClient(MONGODB_URI);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const backupPath = join(BACKUP_DIR, `backup-${timestamp}`);

  try {
    // Create backup directory
    mkdirSync(backupPath, { recursive: true });
    console.log(`📁 Backup directory: ${backupPath}\n`);

    await client.connect();
    const db = client.db(DB_NAME);

    const results = [];

    for (const collection of COLLECTIONS) {
      process.stdout.write(`📦 Backing up ${collection.name}... `);

      const count = await db.collection(collection.name).countDocuments();
      const documents = await db.collection(collection.name).find().toArray();

      // Write to JSON file
      const filePath = join(backupPath, `${collection.name}.json`);
      writeFileSync(filePath, JSON.stringify(documents, null, 2));

      results.push({
        collection: collection.name,
        description: collection.description,
        count,
        size: Buffer.byteLength(JSON.stringify(documents))
      });

      console.log(`✅ ${count} documents (${formatBytes(results[results.length - 1].size)})`);
    }

    // Write metadata
    const metadata = {
      timestamp: new Date().toISOString(),
      database: DB_NAME,
      collections: results,
      totalDocuments: results.reduce((sum, r) => sum + r.count, 0),
      totalSize: results.reduce((sum, r) => sum + r.size, 0)
    };

    writeFileSync(join(backupPath, 'metadata.json'), JSON.stringify(metadata, null, 2));

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                        Backup Summary                        ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log(`📊 Total documents: ${metadata.totalDocuments}`);
    console.log(`💾 Total size: ${formatBytes(metadata.totalSize)}`);
    console.log(`📂 Location: ${backupPath}`);
    console.log(`⏰ Time: ${metadata.timestamp}\n`);

    console.log('✅ Backup completed successfully!\n');

    return { success: true, backupPath, metadata };

  } catch (error) {
    console.error(`\n❌ Backup failed: ${error.message}`);
    throw error;
  } finally {
    await client.close();
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// Run backup
backupCollections()
  .then(result => {
    process.exit(0);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
