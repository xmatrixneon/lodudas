// script/seed-queues.mjs - Seed initial jobs for BullMQ workers
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { addStatusJob } from '../lib/queues/device-status.js';
import { addFetchJob } from '../lib/queues/sms-fetch.js';
import { addKeepaliveJob } from '../lib/queues/device-keepalive.js';
import { addSuspendJob } from '../lib/queues/quality-suspend.js';
import { addCleanupJob } from '../lib/queues/maintenance-cleanup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config({ path: join(__dirname, '..', '.env.local') });
config({ path: join(__dirname, '..', '.env') });

async function seedQueues() {
  console.log('Seeding BullMQ queues...');

  const results = [];

  // Seed status worker job
  if (process.env.BULLMQ_STATUS_ENABLED === 'true') {
    try {
      const statusJob = await addStatusJob({ type: 'scheduled', delay: 1000 });
      console.log(`✓ Status job seeded: ${statusJob.id}`);
      results.push({ queue: 'device-status', jobId: statusJob.id, status: 'success' });
    } catch (error) {
      console.error(`✗ Failed to seed status job:`, error.message);
      results.push({ queue: 'device-status', error: error.message, status: 'error' });
    }
  }

  // Seed fetch worker job
  if (process.env.BULLMQ_FETCH_ENABLED === 'true') {
    try {
      const fetchJob = await addFetchJob({ type: 'scheduled', delay: 1000 });
      console.log(`✓ Fetch job seeded: ${fetchJob.id}`);
      results.push({ queue: 'sms-fetch', jobId: fetchJob.id, status: 'success' });
    } catch (error) {
      console.error(`✗ Failed to seed fetch job:`, error.message);
      results.push({ queue: 'sms-fetch', error: error.message, status: 'error' });
    }
  }

  // Seed keepalive worker job
  if (process.env.BULLMQ_KEEPALIVE_ENABLED === 'true') {
    try {
      const keepaliveJob = await addKeepaliveJob({ type: 'scheduled', delay: 2000 });
      console.log(`✓ Keepalive job seeded: ${keepaliveJob.id}`);
      results.push({ queue: 'device-keepalive', jobId: keepaliveJob.id, status: 'success' });
    } catch (error) {
      console.error(`✗ Failed to seed keepalive job:`, error.message);
      results.push({ queue: 'device-keepalive', error: error.message, status: 'error' });
    }
  }

  // Seed suspend worker job (check and recover jobs)
  if (process.env.BULLMQ_SUSPEND_ENABLED === 'true') {
    try {
      const suspendJob = await addSuspendJob({ type: 'suspend-check', delay: 3000 });
      console.log(`✓ Suspend check job seeded: ${suspendJob.id}`);
      results.push({ queue: 'quality-suspend', jobId: suspendJob.id, status: 'success' });
    } catch (error) {
      console.error(`✗ Failed to seed suspend job:`, error.message);
      results.push({ queue: 'quality-suspend', error: error.message, status: 'error' });
    }
    try {
      const recoverJob = await addSuspendJob({ type: 'suspend-recover', delay: 4000 });
      console.log(`✓ Suspend recover job seeded: ${recoverJob.id}`);
      results.push({ queue: 'quality-suspend', jobId: recoverJob.id, status: 'success' });
    } catch (error) {
      console.error(`✗ Failed to seed suspend recover job:`, error.message);
      results.push({ queue: 'quality-suspend', error: error.message, status: 'error' });
    }
  }

  // Seed cleanup worker job
  if (process.env.BULLMQ_CLEANUP_ENABLED === 'true') {
    try {
      const cleanupJob = await addCleanupJob({ type: 'scheduled', delay: 5000 });
      console.log(`✓ Cleanup job seeded: ${cleanupJob.id}`);
      results.push({ queue: 'maintenance-cleanup', jobId: cleanupJob.id, status: 'success' });
    } catch (error) {
      console.error(`✗ Failed to seed cleanup job:`, error.message);
      results.push({ queue: 'maintenance-cleanup', error: error.message, status: 'error' });
    }
  }

  console.log('\nSeeding completed!');
  return results;
}

seedQueues()
  .then((results) => {
    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    console.log(`\nSummary: ${successCount} succeeded, ${errorCount} failed`);
    process.exit(errorCount > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
