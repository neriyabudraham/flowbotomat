const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: parseInt(process.env.DB_POOL_MAX || '50'),
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 60000,
});

// Connection events - only log once at startup, not per connection
let dbConnected = false;
pool.on('connect', () => {
  if (!dbConnected) {
    console.log('📦 Database connected');
    dbConnected = true;
  }
});

pool.on('error', (err) => {
  console.error('❌ Database error:', err);
});

// Pool health monitoring - log every 5 minutes if pool is stressed
setInterval(() => {
  const { totalCount, idleCount, waitingCount } = pool;
  if (waitingCount > 0 || totalCount >= pool.options.max * 0.8) {
    console.warn(`[DB Pool] total=${totalCount}/${pool.options.max}, idle=${idleCount}, waiting=${waitingCount}`);
  }
}, 300000);

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
