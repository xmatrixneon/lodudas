// lib/queues/orders-cleanup.js
import { Queue } from 'bullmq';
import { getQueueOptions, getJobOptions, getJobInterval } from '../../jobs/utils/job-options.js';

export const ordersCleanupQueue = new Queue('orders-cleanup', {
  ...getQueueOptions(),
  defaultJobOptions: getJobOptions('orders-cleanup'),
});

// Schedule interval from env or default 86400000ms (24 hours)
export const ORDERS_CLEANUP_INTERVAL = getJobInterval('orders-cleanup', 86400000);

export async function addOrdersCleanupJob(options = {}) {
  const { type = 'scheduled', delay = 0 } = options;

  return await ordersCleanupQueue.add(
    'orders-cleanup',
    {
      type,
      runId: crypto.randomUUID(),
      retentionDays: parseInt(process.env.ORDERS_RETENTION_DAYS || '7'),
      batchSize: parseInt(process.env.ORDERS_CLEANUP_BATCH_SIZE || '1000'),
      dryRun: process.env.ORDERS_CLEANUP_DRY_RUN === 'false' ? false : true,
      startedAt: Date.now(),
    },
    {
      delay,
    }
  );
}

export async function getOrdersCleanupStats() {
  return {
    waiting: await ordersCleanupQueue.getWaitingCount(),
    active: await ordersCleanupQueue.getActiveCount(),
    completed: await ordersCleanupQueue.getCompletedCount(),
    failed: await ordersCleanupQueue.getFailedCount(),
    delayed: await ordersCleanupQueue.getDelayedCount(),
    workers: await ordersCleanupQueue.getWorkersCount(),
  };
}
