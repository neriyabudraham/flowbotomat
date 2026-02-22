/**
 * Status Bot Queue Processor Worker
 * Runs as a separate process/container to handle status uploads
 * This ensures queue processing continues even when main backend restarts
 */

require('dotenv').config();

const db = require('../config/database');
const { startQueueProcessor, stopQueueProcessor, setGracefulShutdown } = require('../services/statusBot/queue.service');

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
  
  // Tell the queue service to finish current work
  setGracefulShutdown(true);
  
  // Stop accepting new work
  stopQueueProcessor();
  
  // Wait a bit for current status to finish
  console.log('⏳ Waiting for current status upload to complete...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
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
