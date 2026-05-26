// jobs/handlers/orders-cleanup-handler.js
import Orders from '../../models/Orders.js';

export async function handleOrdersCleanupJob(data) {
  const startTime = Date.now();
  let processed = 0;
  let errors = 0;

  try {
    const { retentionDays = 7, batchSize = 1000, dryRun = false } = data;
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    console.log(`[OrdersCleanup] Starting: Deleting inactive orders older than ${cutoffDate.toISOString()} (dryRun=${dryRun})`);

    // Only delete inactive (completed/expired) orders
    const filter = {
      active: false,
      createdAt: { $lt: cutoffDate }
    };

    // Count orders first
    console.log(`[OrdersCleanup] Counting inactive orders...`);
    const oldCount = await Orders.countDocuments(filter);
    console.log(`[OrdersCleanup] Found ${oldCount} inactive orders to process`);

    if (oldCount === 0) {
      console.log(`[OrdersCleanup] No orders to delete, returning success`);
      return {
        success: true,
        processed: 0,
        errors: 0,
        duration: Date.now() - startTime,
        details: {
          retentionDays,
          cutoffDate: cutoffDate.toISOString(),
          totalDeleted: 0,
          dryRun,
        },
      };
    }

    let totalDeleted = 0;

    if (dryRun) {
      console.log(`[OrdersCleanup] Would delete ${oldCount} orders`);
      totalDeleted = oldCount;
    } else {
      let hasMore = true;
      while (hasMore) {
        const oldOrders = await Orders.find(filter)
          .limit(batchSize)
          .select('_id')
          .lean();

        if (oldOrders.length === 0) {
          hasMore = false;
          break;
        }

        const idsToDelete = oldOrders.map(o => o._id);
        const deleteResult = await Orders.deleteMany({ _id: { $in: idsToDelete } });
        totalDeleted += deleteResult.deletedCount;
        processed += deleteResult.deletedCount;
        console.log(`[OrdersCleanup] Deleted ${deleteResult.deletedCount} orders`);
      }
    }

    return {
      success: true,
      processed: totalDeleted,
      errors: 0,
      duration: Date.now() - startTime,
      details: {
        retentionDays,
        cutoffDate: cutoffDate.toISOString(),
        totalDeleted,
        dryRun,
      },
    };
  } catch (error) {
    errors++;
    console.error(`[OrdersCleanup] Error:`, error);
    return {
      success: false,
      processed,
      errors,
      duration: Date.now() - startTime,
      error: error.message,
    };
  }
}
