const { Client } = require('pg');

// ─────────────────────────────────────────────────────────────────────
// Settings Bus — instant cross-container propagation of admin settings
// changes via PostgreSQL LISTEN/NOTIFY.
//
// Flow:
//   1. Admin updates a setting → settings.controller calls notifyChanged().
//   2. That issues `NOTIFY flowbotomat_settings_changed, '<key>'`.
//   3. Every backend / queue-processor process holds a dedicated pg client
//      subscribed to that channel via LISTEN. On receipt → invalidates
//      their local cache.
//   4. Next read of the setting hits the DB and picks up the new value.
// ─────────────────────────────────────────────────────────────────────

const CHANNEL = 'flowbotomat_settings_changed';
let listenerClient = null;
let listenerReady = false;
const onChangeHandlers = [];

function registerOnChange(handler) {
  onChangeHandlers.push(handler);
}

async function startListener() {
  if (listenerClient) return;
  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  client.on('error', (err) => {
    console.error('[SettingsBus] listener error:', err.message);
    listenerReady = false;
    // Reconnect after delay
    setTimeout(() => {
      listenerClient = null;
      startListener().catch(() => {});
    }, 5000);
  });

  client.on('notification', (msg) => {
    if (msg.channel !== CHANNEL) return;
    const key = msg.payload || '*';
    for (const h of onChangeHandlers) {
      try { h(key); } catch (e) { console.error('[SettingsBus] handler error:', e.message); }
    }
  });

  try {
    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    listenerClient = client;
    listenerReady = true;
    console.log(`[SettingsBus] Listening on channel "${CHANNEL}"`);
  } catch (err) {
    console.error('[SettingsBus] Failed to start listener:', err.message);
    try { await client.end(); } catch {}
    // Retry in 5s
    setTimeout(() => startListener().catch(() => {}), 5000);
  }
}

async function stopListener() {
  if (!listenerClient) return;
  try { await listenerClient.query(`UNLISTEN ${CHANNEL}`); } catch {}
  try { await listenerClient.end(); } catch {}
  listenerClient = null;
  listenerReady = false;
}

// Broadcast a setting change to all listeners (including self).
// Called from the admin settings controller after a successful save.
async function notifyChanged(key, db) {
  try {
    // Use provided db (main pool) — NOTIFY is a cheap SQL command, no need for a dedicated client
    await db.query(`SELECT pg_notify($1, $2)`, [CHANNEL, String(key || '*')]);
  } catch (err) {
    console.error('[SettingsBus] notifyChanged error:', err.message);
  }
}

module.exports = {
  startListener,
  stopListener,
  notifyChanged,
  registerOnChange,
  get ready() { return listenerReady; },
};
