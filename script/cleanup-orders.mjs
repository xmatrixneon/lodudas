// script/cleanup-orders.mjs
// Cleanup script to delete orders older than retention period (default: 5 days)
import { config } from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../lib/db.js';
import Orders from '../models/Orders.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config({ path: join(__dirname, '..', '.env.local') });
config({ path: join(__dirname, '..', '.env') });

// Configuration
const RETENTION_DAYS = parseInt(process.env.ORDER_RETENTION_DAYS || '5', 10);
const BATCH_SIZE = parseInt(process.env.ORDER_CLEANUP_BATCH_SIZE || '1000', 10);
const DRY_RUN = process.env.ORDER_CLEANUP_DRY_RUN === 'true';

async function cleanupOldOrders() {
  const startTime = Date.now();

  try {
    // Connect to database
    await connectDB();
    console.log('[Orders Cleanup] Connected to database');

    // Calculate cutoff date (5 days ago from now)
    const cutoffDate = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    console.log(`[Orders Cleanup] Deleting orders older than ${cutoffDate.toISOString()} (${RETENTION_DAYS} days)`);
    console.log(`[Orders Cleanup] Dry run: ${DRY_RUN}`);

    // Count old orders first
    console.log(`[Orders Cleanup] Counting old orders...`);
    const oldCount = await Orders.countDocuments({
      createdAt: { $lt: cutoffDate }
    });
    console.log(`[Orders Cleanup] Found ${oldCount} orders to delete`);

    if (oldCount === 0) {
      console.log(`[Orders Cleanup] No old orders found, exiting`);
      process.exit(0);
    }

    let totalDeleted = 0;

    if (DRY_RUN) {
      console.log(`[Orders Cleanup] Would delete ${oldCount} orders (dry run)`);
      totalDeleted = oldCount;
    } else {
      // Delete in batches to avoid memory issues
      let hasMore = true;
      while (hasMore) {
        // Find batch of old orders
        const oldOrders = await Orders.find({
          createdAt: { $lt: cutoffDate }
        }).limit(BATCH_SIZE).select('_id');

        if (oldOrders.length === 0) {
          hasMore = false;
          break;
        }

        const idsToDelete = oldOrders.map(o => o._id);
        const deleteResult = await Orders.deleteMany({
          _id: { $in: idsToDelete }
        });

        totalDeleted += deleteResult.deletedCount;
        console.log(`[Orders Cleanup] Deleted ${deleteResult.deletedCount} orders (total: ${totalDeleted})`);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[Orders Cleanup] Completed in ${duration}ms`);
    console.log(`[Orders Cleanup] Total orders deleted: ${totalDeleted}`);

    // Get remaining count
    const remainingCount = await Orders.countDocuments();
    console.log(`[Orders Cleanup] Remaining orders: ${remainingCount}`);

    process.exit(0);
  } catch (error) {
    console.error(`[Orders Cleanup] Error:`, error);
    process.exit(1);
  }
}

// Run cleanup
cleanupOldOrders();
