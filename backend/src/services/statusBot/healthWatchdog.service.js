const db = require('../../config/database');
// Lazy-load to avoid cyclic / module-load-order issues
const wahaSession = (() => {
  try { return require('../waha/session.service'); }
  catch { return null; }
})();

// ─────────────────────────────────────────────────────────────────────
// Status-Bot Health Watchdog & Self-Healing
//
// Runs every 60 seconds. Three responsibilities:
//   1. Detect — scan for problems (stuck items, partials, low success rate,
//      LID gaps, timeout floods, dead connections).
//   2. Heal — automatically take action where safe (reset stuck items,
//      schedule continuation jobs to fill in missing recipients, refresh
//      LID cache, kick scheduled-but-stalled items).
//   3. Alert — open a row in `system_alerts` for anything we can't auto-fix
//      (or that an admin should see). Dedup-keyed so we don't flood.
// ─────────────────────────────────────────────────────────────────────

const LOG = '[StatusBot Health]';
const TICK_MS = 60_000;
const STUCK_GRACE_MS = 60_000;          // beyond timeout
const PENDING_OVERDUE_MS = 5 * 60_000;  // pending past scheduled_for + 5 min
const LOW_SUCCESS_THRESHOLD = 0.80;     // <80% delivery in last 24h → alert
const LID_GAP_THRESHOLD = 0.15;         // >15% LIDs unresolved → alert
const PARTIAL_FILL_RATIO = 0.95;        // <95% sent → auto-create continuation
const MAX_AUTOFILL_RETRIES = 3;

let intervalId = null;

// ─── ALERT HELPERS (used here + can be required from anywhere) ────────

async function openAlert({ severity = 'warning', type, userId = null, connectionId = null, queueId = null, title, message = null, payload = null, dedupKey = null }) {
  try {
    // IMPORTANT: on UPDATE, MERGE payload (preserve existing keys) instead of
    // replacing. Specifically this keeps `admin_notified_at` alive across
    // re-detections — otherwise the detector (runs every minute) would wipe
    // the notification marker and the admin would get spammed every tick.
    const row = await db.query(
      `INSERT INTO system_alerts
         (severity, alert_type, user_id, connection_id, queue_id, title, message, payload, dedup_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (dedup_key) WHERE status = 'open'
       DO UPDATE SET
         payload = COALESCE(system_alerts.payload, '{}'::jsonb) || COALESCE(EXCLUDED.payload, '{}'::jsonb),
         message = EXCLUDED.message
       RETURNING id`,
      [severity, type, userId, connectionId, queueId, title, message, payload ? JSON.stringify(payload) : null, dedupKey]
    );
    return row.rows[0]?.id || null;
  } catch (e) {
    // ON CONFLICT with WHERE clause needs PG13+; if it fails, fall back to plain insert
    try {
      const row = await db.query(
        `INSERT INTO system_alerts
           (severity, alert_type, user_id, connection_id, queue_id, title, message, payload, dedup_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [severity, type, userId, connectionId, queueId, title, message, payload ? JSON.stringify(payload) : null, dedupKey]
      );
      return row.rows[0]?.id || null;
    } catch (e2) {
      console.error(`${LOG} openAlert failed: ${e2.message}`);
      return null;
    }
  }
}

async function autoResolveAlerts(predicate /* {dedupKey} or {userId, type} */) {
  try {
    if (predicate.dedupKey) {
      await db.query(
        `UPDATE system_alerts SET status = 'resolved', resolved_at = NOW(), auto_resolved = true
         WHERE dedup_key = $1 AND status = 'open'`,
        [predicate.dedupKey]
      );
    } else if (predicate.userId && predicate.type) {
      await db.query(
        `UPDATE system_alerts SET status = 'resolved', resolved_at = NOW(), auto_resolved = true
         WHERE user_id = $1 AND alert_type = $2 AND status = 'open'`,
        [predicate.userId, predicate.type]
      );
    }
  } catch (e) {
    console.error(`${LOG} autoResolveAlerts failed: ${e.message}`);
  }
}

// ─── DETECTORS / HEALERS ──────────────────────────────────────────────

// 1. Items stuck in 'processing' beyond timeout.
//    Reset → 'pending' so the queue picks them up again on next tick.
// Cap auto-resets — if an item keeps getting stuck & reset forever, it's
// almost certainly a broken payload. Fail it loudly after N resets so the
// watchdog doesn't churn on it indefinitely.
const MAX_STUCK_RESETS = 5;

async function healStuckProcessing() {
  try {
    const setting = await db.query(
      `SELECT value FROM system_settings WHERE key = 'statusbot_upload_timeout_minutes'`
    ).catch(() => ({ rows: [] }));
    const timeoutMin = parseFloat(setting.rows[0]?.value) || 10;
    const totalGraceMs = timeoutMin * 60_000 + STUCK_GRACE_MS;

    // Reset stuck items (bounded by retry_count so we don't spin on a
    // permanently-broken item). Anything over MAX_STUCK_RESETS goes straight
    // to 'failed'.
    const r = await db.query(
      `UPDATE status_bot_queue
       SET queue_status = 'pending',
           processing_started_at = NULL,
           retry_count = COALESCE(retry_count, 0) + 1
       WHERE queue_status = 'processing'
         AND processing_started_at IS NOT NULL
         AND processing_started_at < NOW() - ($1 * interval '1 millisecond')
         AND COALESCE(retry_count, 0) < $2
       RETURNING id, connection_id`,
      [totalGraceMs, MAX_STUCK_RESETS]
    );
    if (r.rowCount > 0) {
      console.log(`${LOG} 🩹 Reset ${r.rowCount} stuck-processing items`);
      for (const row of r.rows) {
        const u = await db.query(`SELECT user_id FROM status_bot_connections WHERE id = $1`, [row.connection_id]);
        await openAlert({
          severity: 'warning',
          type: 'stuck_processing_reset',
          userId: u.rows[0]?.user_id || null,
          connectionId: row.connection_id,
          queueId: row.id,
          title: 'פריט תקוע אופס אוטומטית',
          message: `פריט בתור היה ב-processing יותר מ-${Math.round(totalGraceMs / 60000)} דקות. אופס לפנדינג והופעל מחדש.`,
          dedupKey: `stuck:${row.id}`,
        });
      }
    }

    // Permanently fail anything that crossed the reset ceiling.
    const failed = await db.query(
      `UPDATE status_bot_queue
          SET queue_status = 'failed',
              processing_started_at = NULL,
              error_message = COALESCE(error_message, 'stuck-processing reset limit reached')
        WHERE queue_status = 'processing'
          AND processing_started_at IS NOT NULL
          AND processing_started_at < NOW() - ($1 * interval '1 millisecond')
          AND COALESCE(retry_count, 0) >= $2
       RETURNING id, connection_id`,
      [totalGraceMs, MAX_STUCK_RESETS]
    );
    if (failed.rowCount > 0) {
      console.error(`${LOG} ❌ Failing ${failed.rowCount} items that exceeded ${MAX_STUCK_RESETS} stuck-resets`);
      for (const row of failed.rows) {
        const u = await db.query(`SELECT user_id FROM status_bot_connections WHERE id = $1`, [row.connection_id]);
        await openAlert({
          severity: 'error',
          type: 'stuck_processing_permafail',
          userId: u.rows[0]?.user_id || null,
          connectionId: row.connection_id,
          queueId: row.id,
          title: 'פריט נכשל סופית — עבר את מגבלת הריסטים',
          message: `פריט נתקע שוב ושוב (${MAX_STUCK_RESETS} פעמים). סומן ככושל לבירור ידני.`,
          dedupKey: `stuckperma:${row.id}`,
        });
      }
    }
  } catch (e) {
    console.error(`${LOG} healStuckProcessing error: ${e.message}`);
  }
}

// 2. Items pending past scheduled_for + 5 min — connection probably has issues.
//    If conn is connected, force-process by clearing scheduled_for.
async function healStallPendingScheduled() {
  try {
    // No error_message annotation — this is a normal healing nudge (the
    // scheduled_for had passed, session is connected, nothing went wrong).
    const r = await db.query(
      `UPDATE status_bot_queue q
       SET scheduled_for = NOW()
       FROM status_bot_connections c
       WHERE q.connection_id = c.id
         AND q.queue_status = 'pending'
         AND q.scheduled_for IS NOT NULL
         AND q.scheduled_for < NOW() - ($1 * interval '1 millisecond')
         AND c.connection_status = 'connected'
         AND (c.short_restriction_until IS NULL OR c.short_restriction_until <= NOW())
       RETURNING q.id`,
      [PENDING_OVERDUE_MS]
    );
    if (r.rowCount > 0) {
      console.log(`${LOG} ⏰ Kicked ${r.rowCount} overdue scheduled items`);
    }
  } catch (e) {
    console.error(`${LOG} healStallPendingScheduled error: ${e.message}`);
  }
}

// 3. Auto-resume partial sends — safety net for items marked 'sent' with
//    contacts_sent < contacts_total. These should normally never reach that
//    state (the in-process auto-retry in processItem keeps them 'pending'),
//    but if the stoppedEarly signal was lost, a crash bypassed it, or the
//    item was set to 'sent' by legacy code — we auto-resume without creating
//    a duplicate queue row. Re-queues the SAME queue_id with SAME
//    status_message_id so WAHA dedups the WhatsApp status.
async function healPartialSends() {
  try {
    const r = await db.query(`
      UPDATE status_bot_queue q
      SET queue_status = 'pending',
          processing_started_at = NULL,
          scheduled_for = NOW() + (LEAST(10, 2 + COALESCE(retry_count, 0)) * interval '1 minute'),
          retry_count = COALESCE(retry_count, 0) + 1,
          first_attempted_at = COALESCE(first_attempted_at, NOW() - INTERVAL '1 minute')
      FROM status_bot_connections c
      WHERE q.connection_id = c.id
        AND q.queue_status = 'sent'
        AND q.contacts_total IS NOT NULL AND q.contacts_total > 0
        AND q.contacts_sent IS NOT NULL
        AND q.contacts_sent < q.contacts_total
        AND q.status_message_id IS NOT NULL
        AND q.sent_at > NOW() - INTERVAL '2 hours'
        AND COALESCE(q.first_attempted_at, q.created_at) > NOW() - INTERVAL '2 hours'
        AND COALESCE(q.retry_cancelled, false) = false  -- respect manual cancel
        AND c.connection_status = 'connected'
        AND (c.short_restriction_until IS NULL OR c.short_restriction_until <= NOW())
        AND NOT EXISTS (
          SELECT 1 FROM status_bot_queue x
          WHERE x.continuation_of = q.id AND x.queue_status NOT IN ('cancelled','failed')
        )
      RETURNING q.id, q.contacts_sent, q.contacts_total, q.scheduled_for
    `);
    for (const row of r.rows) {
      console.log(`${LOG} 🔁 Auto-resume partial ${row.id} (${row.contacts_sent}/${row.contacts_total}) → next retry ${new Date(row.scheduled_for).toISOString()}`);
    }
    if (r.rowCount > 0) console.log(`${LOG} Resumed ${r.rowCount} partial item(s)`);
  } catch (e) {
    console.error(`${LOG} healPartialSends error: ${e.message}`);
  }
}

// 4. Detect connections with poor delivery rate in last 24h → open alert.
//    Auto-resolves when rate climbs back above threshold.
async function detectLowDeliveryRate() {
  try {
    const r = await db.query(`
      SELECT
        c.id AS connection_id,
        c.user_id,
        c.phone_number,
        SUM(q.contacts_total)::int AS total,
        SUM(q.contacts_sent)::int AS sent,
        COUNT(*) FILTER (WHERE q.queue_status = 'failed') AS failed_jobs,
        COUNT(*) AS total_jobs
      FROM status_bot_queue q
      JOIN status_bot_connections c ON c.id = q.connection_id
      WHERE q.created_at > NOW() - INTERVAL '24 hours'
        AND q.queue_status IN ('sent','failed')
        AND q.contacts_total IS NOT NULL AND q.contacts_total > 0
      GROUP BY c.id, c.user_id, c.phone_number
      HAVING SUM(q.contacts_total) > 1000
    `);

    for (const row of r.rows) {
      const ratio = row.total > 0 ? row.sent / row.total : 1;
      const dedupKey = `low_delivery:${row.connection_id}`;
      if (ratio < LOW_SUCCESS_THRESHOLD) {
        await openAlert({
          severity: 'high',
          type: 'low_delivery_rate',
          userId: row.user_id,
          connectionId: row.connection_id,
          title: 'אחוז מסירה נמוך ב-24 שעות אחרונות',
          message: `${row.phone_number || ''}: רק ${Math.round(ratio * 100)}% מהנמענים קיבלו (${row.sent.toLocaleString()}/${row.total.toLocaleString()}).`,
          payload: { ratio: Number(ratio.toFixed(3)), sent: row.sent, total: row.total, failedJobs: row.failed_jobs },
          dedupKey,
        });
      } else {
        await autoResolveAlerts({ dedupKey });
      }
    }
  } catch (e) {
    console.error(`${LOG} detectLowDeliveryRate error: ${e.message}`);
  }
}

// 5. Detect chronic LID gap (last 6h → most recent delivery summaries).
//    If ratio of unresolved LIDs > 15%, alert.
async function detectLidGap() {
  try {
    const r = await db.query(`
      SELECT c.id AS connection_id, c.user_id, c.phone_number,
             AVG((q.delivery_summary->>'lids_unresolvable')::numeric / NULLIF((q.delivery_summary->>'lids_in_waha')::numeric, 0)) AS avg_gap,
             SUM((q.delivery_summary->>'lids_unresolvable')::numeric)::int AS total_unresolved,
             SUM((q.delivery_summary->>'lids_in_waha')::numeric)::int AS total_lids,
             COUNT(*) AS samples
      FROM status_bot_queue q
      JOIN status_bot_connections c ON c.id = q.connection_id
      WHERE q.created_at > NOW() - INTERVAL '6 hours'
        AND q.delivery_summary IS NOT NULL
        AND (q.delivery_summary->>'lids_in_waha')::numeric > 50
      GROUP BY c.id, c.user_id, c.phone_number
      HAVING COUNT(*) >= 2
    `);
    for (const row of r.rows) {
      const dedupKey = `lid_gap:${row.connection_id}`;
      const gap = parseFloat(row.avg_gap) || 0;
      if (gap > LID_GAP_THRESHOLD) {
        await openAlert({
          severity: 'warning',
          type: 'lid_gap_high',
          userId: row.user_id,
          connectionId: row.connection_id,
          title: 'פער LID גדול — נמענים נשמטים',
          message: `${row.phone_number || ''}: ${row.total_unresolved.toLocaleString()} מתוך ${row.total_lids.toLocaleString()} LIDs לא ניתנים לתרגום על ידי WAHA.`,
          payload: { avg_gap: Number(gap.toFixed(3)), total_unresolved: row.total_unresolved, total_lids: row.total_lids },
          dedupKey,
        });
      } else {
        await autoResolveAlerts({ dedupKey });
      }
    }
  } catch (e) {
    console.error(`${LOG} detectLidGap error: ${e.message}`);
  }
}

// 6. Surface jobs that fully failed (queue_status='failed' and not yet alerted).
async function alertFailedJobs() {
  try {
    const r = await db.query(`
      SELECT q.id, q.connection_id, q.status_type, q.error_message, q.retry_count,
             c.user_id, c.phone_number
      FROM status_bot_queue q
      JOIN status_bot_connections c ON c.id = q.connection_id
      WHERE q.queue_status = 'failed'
        AND q.created_at > NOW() - INTERVAL '24 hours'
        AND NOT EXISTS (
          SELECT 1 FROM system_alerts a
          WHERE a.dedup_key = 'failed_job:' || q.id::text
        )
      ORDER BY q.created_at DESC LIMIT 50
    `);
    for (const row of r.rows) {
      await openAlert({
        severity: 'high',
        type: 'queue_job_failed',
        userId: row.user_id,
        connectionId: row.connection_id,
        queueId: row.id,
        title: 'סטטוס נכשל סופית בתור',
        message: `${row.phone_number || ''}: ${row.status_type} — ${(row.error_message || '').slice(0, 200)}`,
        payload: { retry_count: row.retry_count },
        dedupKey: `failed_job:${row.id}`,
      });
    }
  } catch (e) {
    console.error(`${LOG} alertFailedJobs error: ${e.message}`);
  }
}

// 7. Admin WhatsApp escalation: high-severity alerts open > 1 hour and not yet
//    notified → send a WA message to the admin's phone via the configured admin
//    WhatsApp account.
//    Defaults are overridable via system_settings:
//      - admin_alert_user_email  (default: neriy.nisim@gmail.com)
//      - admin_alert_phone       (default: 972584254229)
//      - admin_alert_threshold_min (default: 60)
async function escalateToAdminWhatsApp() {
  if (!wahaSession?.sendMessage) return;
  try {
    const settings = await db.query(
      `SELECT key, value FROM system_settings
       WHERE key IN ('admin_alert_user_email','admin_alert_phone','admin_alert_threshold_min','admin_alert_paused')`
    );
    const sm = {};
    for (const row of settings.rows) {
      try { sm[row.key] = typeof row.value === 'string' ? JSON.parse(row.value) : row.value; }
      catch { sm[row.key] = row.value; }
    }
    if (sm.admin_alert_paused === true || sm.admin_alert_paused === 'true') return;

    const adminEmail = sm.admin_alert_user_email || 'neriy.nisim@gmail.com';
    const adminPhone = String(sm.admin_alert_phone || '972584254229').replace(/[^0-9]/g, '');
    const thresholdMin = parseFloat(sm.admin_alert_threshold_min) || 60;

    // Find high-severity alerts that:
    //   - are still open
    //   - older than threshold
    //   - haven't been admin-notified yet (no admin_notified_at marker in payload)
    //   - OR were last notified more than 6 hours ago (re-notify cooldown, so
    //     long-running unresolved issues get a periodic ping — not every tick)
    const r = await db.query(`
      SELECT id, alert_type, title, message, payload, created_at
      FROM system_alerts
      WHERE status = 'open'
        AND severity = 'high'
        AND created_at < NOW() - ($1 * interval '1 minute')
        AND (
          (payload IS NULL OR (payload->>'admin_notified_at') IS NULL)
          OR (
            (payload->>'admin_notified_at') IS NOT NULL
            AND (payload->>'admin_notified_at')::timestamptz < NOW() - INTERVAL '6 hours'
          )
        )
      ORDER BY created_at ASC
      LIMIT 5
    `, [thresholdMin]);

    if (r.rows.length === 0) return;

    // Build a single consolidated message — sent via Telegram (not WhatsApp).
    // Admin explicitly requested no WA pings; Telegram only.
    const { escapeHtml, sendToAdmin } = require('../notifications/telegram.service');
    const lines = [];
    lines.push(`🚨 <b>התראה אוטומטית — Botomat</b>`);
    lines.push(`${r.rows.length} בעיות פתוחות יותר מ-${thresholdMin} דקות:`);
    lines.push('');
    for (const a of r.rows) {
      const ageMin = Math.round((Date.now() - new Date(a.created_at).getTime()) / 60000);
      lines.push(`• <b>${escapeHtml(a.title)}</b>`);
      if (a.message) lines.push(`  ${escapeHtml(a.message.slice(0, 180))}`);
      lines.push(`  <i>פתוח ${ageMin} דק׳</i>`);
      lines.push('');
    }
    lines.push('בדוק בלוח הבקרה: התראות מערכת');
    const text = lines.join('\n');

    const ok = await sendToAdmin(text);
    if (ok) {
      for (const a of r.rows) {
        await db.query(
          `UPDATE system_alerts
           SET payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object('admin_notified_at', NOW()::text)
           WHERE id = $1`,
          [a.id]
        );
      }
      console.log(`${LOG} 📬 Admin Telegram alert sent (${r.rows.length} issues)`);
    }
    // adminPhone still read above so the settings schema stays backward-compatible
    void adminPhone;
  } catch (e) {
    console.error(`${LOG} escalateToAdmin error: ${e.message}`);
  }
}

// 8. Auto-resolve alerts whose queue row has reached a terminal state.
//    Without this, alerts like partial_20min / partial_giveup / stuck_reset /
//    autofill_continuation would stay 'open' forever — the escalation job
//    resends them to Telegram every 6 hours and floods the admin.
async function autoResolveTerminatedQueueAlerts() {
  try {
    const r = await db.query(`
      UPDATE system_alerts a
      SET status = 'resolved',
          resolved_at = NOW(),
          auto_resolved = true,
          payload = COALESCE(a.payload,'{}'::jsonb) || jsonb_build_object(
            'auto_resolved_reason', 'queue_terminated',
            'final_queue_status', q.queue_status
          )
      FROM status_bot_queue q
      WHERE q.id = a.queue_id
        AND a.status = 'open'
        AND a.resolved_at IS NULL
        AND q.queue_status IN ('sent','cancelled','failed')
      RETURNING a.id, a.alert_type, q.queue_status
    `);
    if (r.rowCount > 0) {
      console.log(`${LOG} ✅ Auto-resolved ${r.rowCount} alert(s) whose queue already terminated`);
    }
  } catch (e) {
    console.error(`${LOG} autoResolveTerminatedQueueAlerts error: ${e.message}`);
  }
}

// 9. Auto-resolve alerts whose queue_id no longer exists at all (deleted).
async function autoResolveOrphanedQueueAlerts() {
  try {
    const r = await db.query(`
      UPDATE system_alerts a
      SET status = 'resolved',
          resolved_at = NOW(),
          auto_resolved = true,
          payload = COALESCE(a.payload,'{}'::jsonb) || jsonb_build_object('auto_resolved_reason','queue_row_vanished')
      WHERE a.status = 'open'
        AND a.queue_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM status_bot_queue q WHERE q.id = a.queue_id)
        AND a.created_at < NOW() - INTERVAL '15 minutes'
      RETURNING a.id
    `);
    if (r.rowCount > 0) {
      console.log(`${LOG} 🧹 Auto-resolved ${r.rowCount} alert(s) whose queue row vanished`);
    }
  } catch (e) {
    console.error(`${LOG} autoResolveOrphanedQueueAlerts error: ${e.message}`);
  }
}

// ─── ENTRY POINTS ─────────────────────────────────────────────────────

let inflightTick = false;
async function tick() {
  if (inflightTick) return;
  inflightTick = true;
  const t0 = Date.now();
  try {
    await healStuckProcessing();
    await healStallPendingScheduled();
    await healPartialSends();
    await autoResolveTerminatedQueueAlerts();
    await autoResolveOrphanedQueueAlerts();
    await detectLowDeliveryRate();
    await detectLidGap();
    await alertFailedJobs();
    await escalateToAdminWhatsApp();
  } catch (e) {
    console.error(`${LOG} tick error: ${e.message}`);
  } finally {
    inflightTick = false;
    const dur = Date.now() - t0;
    if (dur > 15_000) console.warn(`${LOG} tick slow (${dur}ms)`);
  }
}

function start() {
  if (intervalId) return;
  console.log(`${LOG} Starting watchdog (every ${TICK_MS / 1000}s)`);
  // First run after 30s to let other startup tasks settle
  setTimeout(tick, 30_000);
  intervalId = setInterval(tick, TICK_MS);
}

function stop() {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
}

module.exports = {
  start,
  stop,
  tick, // exposed for manual trigger / tests
  openAlert,
  autoResolveAlerts,
};
