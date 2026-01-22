const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
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

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
