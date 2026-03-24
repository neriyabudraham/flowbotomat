/**
 * Status Bot Queue Processor Worker
 * Runs as a separate process/container to handle status uploads
 * This ensures queue processing continues even when main backend restarts
 */

require('dotenv').config();

const db = require('../config/database');
const { startQueueProcessor, stopQueueProcessor, setGracefulShutdown, isProcessing, getCurrentProcessingPromise } = require('../services/statusBot/queue.service');

let isShuttingDown = false;

/**
 * Initialize the worker
 */
async function init() {
  console.log('🚀 Status Bot Queue Worker starting...');
  
  // Test database connection
  try {
    await db.query('SELECT 1');
    console.log('✅ Database connected');
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  }
  
  // On fresh start, reset any items left in 'processing' state from a previous instance.
  // This ensures statuses interrupted by deployment (including pending viewer sends)
  // get re-queued and processed after the worker restarts.
  try {
    const resetResult = await db.query(`
      UPDATE status_bot_queue
      SET queue_status = 'pending', processing_started_at = NULL
      WHERE queue_status = 'processing'
      RETURNING id, connection_id, viewers_done
    `);
    if (resetResult.rowCount > 0) {
      const ids = resetResult.rows.map(r => r.id).join(', ');
      console.log(`🔄 Reset ${resetResult.rowCount} orphaned processing item(s) to pending: [${ids}]`);
    }
  } catch (err) {
    console.error('⚠️ Could not reset orphaned items:', err.message);
  }

  // Also release any stale queue lock from a previous instance
  try {
    await db.query(`
      UPDATE status_bot_queue_lock
      SET is_processing = false, processing_started_at = NULL
      WHERE id = 1
    `);
  } catch { /* non-fatal */ }

  // Start the queue processor
  startQueueProcessor();
  console.log('✅ Queue processor started');
}

/**
 * Graceful shutdown handler
 */
async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log(`\n📛 Received ${signal}, shutting down gracefully...`);
  
  // Stop accepting new work
  stopQueueProcessor();
  setGracefulShutdown(true);

  // Wait for any active status send to finish completely (up to 12 minutes).
  // 12min covers: default-format 10min WAHA timeout + buffer, and contacts-format batches.
  // Pending queue items are NOT affected — they simply wait for the worker to restart.
  if (isProcessing()) {
    const MAX_WAIT_MS = 12 * 60 * 1000;
    console.log('⏳ Active send in progress — waiting for it to finish (max 12min)...');
    const processingPromise = getCurrentProcessingPromise();
    if (processingPromise) {
      const timeoutPromise = new Promise(resolve => setTimeout(resolve, MAX_WAIT_MS));
      await Promise.race([processingPromise, timeoutPromise]);
      if (isProcessing()) {
        console.log('⚠️ Timed out waiting for processing to finish — forcing shutdown');
      } else {
        console.log('✅ Active send completed cleanly');
      }
    }
  } else {
    console.log('✅ No active sends — shutting down immediately');
  }
  
  // Release any locks
  try {
    await db.query(`
      UPDATE status_bot_queue_lock 
      SET is_processing = false, processing_started_at = NULL 
      WHERE id = 1
    `);
    console.log('✅ Queue lock released');
  } catch (err) {
    console.error('⚠️ Could not release lock:', err.message);
  }
  
  // Close database connection
  try {
    await db.end();
    console.log('✅ Database connection closed');
  } catch (err) {
    console.error('⚠️ Error closing database:', err.message);
  }
  
  console.log('👋 Queue worker shutdown complete');
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the worker
init().catch(err => {
  console.error('❌ Worker initialization failed:', err);
  process.exit(1);
});
