// workers/orders-cleanup-worker.js
import { config } from 'dotenv';
import { Worker } from 'bullmq';
import mongoose from 'mongoose';
import connectDB from '../lib/db.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getRedis } from '../lib/queues/redis.js';
import { ordersCleanupQueue, ORDERS_CLEANUP_INTERVAL } from '../lib/queues/orders-cleanup.js';
import { handleOrdersCleanupJob } from '../jobs/handlers/orders-cleanup-handler.js';
import { withJobLogging } from '../jobs/utils/job-logger.js';
import { getWorkerConcurrency } from '../jobs/utils/job-options.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Delay to use when scheduling next job after a failure (to prevent rapid retry loops)
const ERROR_RETRY_DELAY = parseInt(process.env.BULLMQ_ERROR_RETRY_DELAY || '60000', 10);

// Global error handlers to prevent worker crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('[OrdersCleanup] Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - let PM2 restart if needed
});

process.on('uncaughtException', (error) => {
  console.error('[OrdersCleanup] Uncaught Exception:', error);
  // Exit to let PM2 restart with clean state
  process.exit(1);
});

// Load environment variables
config({ path: join(__dirname, '..', '.env.local') });
config({ path: join(__dirname, '..', '.env') });

// Check if worker is enabled
if (process.env.BULLMQ_ORDERS_CLEANUP_ENABLED !== 'true') {
  console.log('[OrdersCleanup Worker] Disabled (BULLMQ_ORDERS_CLEANUP_ENABLED != true)');
  process.exit(0);
}

// Connect to MongoDB before starting worker
await connectDB();

// Schedule initial job if queue is empty
const delayedCount = await ordersCleanupQueue.getDelayedCount();
if (delayedCount === 0) {
  await ordersCleanupQueue.add(
    'orders-cleanup',
    {
      type: 'scheduled',
      runId: crypto.randomUUID(),
      startedAt: Date.now(),
    },
    { delay: ORDERS_CLEANUP_INTERVAL }
  );
  console.log('[OrdersCleanup] Initial job scheduled');
}

const worker = new Worker('orders-cleanup', async (job) => {
  return withJobLogging(job, async () => {
    const result = await handleOrdersCleanupJob(job.data);

    // Schedule next run for scheduled jobs (regardless of success/failure)
    if (job.data.type === 'scheduled') {
      // Use longer delay on failure to prevent rapid retry loops
      const delay = result.success ? ORDERS_CLEANUP_INTERVAL : ERROR_RETRY_DELAY;
      await ordersCleanupQueue.add(
        'orders-cleanup',
        {
          type: 'scheduled',
          runId: crypto.randomUUID(),
          startedAt: Date.now(),
          ...job.data,
        },
        { delay }
      );
    }

    return result;
  });
}, {
  connection: getRedis(),
  concurrency: getWorkerConcurrency('orders-cleanup', 1),
  // Auto-remove old jobs to prevent Redis memory issues
  removeOnComplete: {
    age: 3600, // Keep completed jobs for 1 hour
    count: 100, // Keep max 100 completed jobs
    limit: 50, // Remove max 50 jobs per cleanup
  },
  removeOnFail: {
    age: 7200, // Keep failed jobs for 2 hours
    count: 50, // Keep max 50 failed jobs
  },
});

worker.on('completed', (job) => {
  console.log(`[OrdersCleanup] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[OrdersCleanup] Job ${job?.id} failed:`, err.message);
});

worker.on('error', (error) => {
  console.error('[OrdersCleanup] Worker error:', error.message);
  // Continue processing other jobs
});

// Graceful shutdown
const shutdown = async () => {
  console.log('[OrdersCleanup] Shutting down worker...');
  await worker.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('[OrdersCleanup] Worker started');
