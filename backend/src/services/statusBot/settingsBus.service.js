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

// Exponential backoff for reconnect attempts — prevents a tight 5s loop when
// the DB is down, which would spam logs and churn connections.
let reconnectAttempts = 0;
const BASE_BACKOFF_MS = 5000;
const MAX_BACKOFF_MS = 60_000;
function nextBackoffMs() {
  const exp = Math.min(Math.pow(2, reconnectAttempts), MAX_BACKOFF_MS / BASE_BACKOFF_MS);
  const jitter = Math.random() * 1000;
  return Math.min(BASE_BACKOFF_MS * exp + jitter, MAX_BACKOFF_MS);
}

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
    const delay = nextBackoffMs();
    reconnectAttempts++;
    console.error(`[SettingsBus] listener error: ${err.message} — reconnect in ${Math.round(delay / 1000)}s (attempt #${reconnectAttempts})`);
    listenerReady = false;
    setTimeout(() => {
      listenerClient = null;
      startListener().catch(() => {});
    }, delay);
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
    reconnectAttempts = 0; // reset backoff on successful connection
    console.log(`[SettingsBus] Listening on channel "${CHANNEL}"`);
  } catch (err) {
    const delay = nextBackoffMs();
    reconnectAttempts++;
    console.error(`[SettingsBus] Failed to start listener: ${err.message} — retrying in ${Math.round(delay / 1000)}s`);
    try { await client.end(); } catch {}
    setTimeout(() => startListener().catch(() => {}), delay);
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
