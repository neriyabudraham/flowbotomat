/**
 * Campaign window scheduler — active_days + active_hours + batch cadence.
 *
 * Responsibilities:
 *   1. Given a campaign's settings, compute the next valid send time
 *      (respecting timezone, active days-of-week, and active hours-of-day).
 *   2. Tick every minute: find campaigns that are 'running' and due
 *      (next_batch_at <= NOW), send ONE batch, persist next_batch_at.
 *   3. Refuse to over-send — only pending recipients are picked, tracking
 *      is authoritative via broadcast_campaign_recipients.status.
 *
 * Why not in-memory loop: if the backend restarts during a long
 * batch_delay (hours between batches) the in-memory setTimeout dies.
 * Persisting next_batch_at makes the system resilient to restarts and
 * cheap on resources (no busy-wait, no hot timers).
 */

const db = require('../../config/database');
const broadcastSender = require('./sender.service');

const DEFAULT_TZ = 'Asia/Jerusalem';

// Lock to prevent overlapping ticks
let _tickRunning = false;

// Per-campaign locks so the same campaign never runs two batches at once
const runningCampaigns = new Set();

/**
 * Parse "HH:MM" into { h, m } or null if invalid
 */
function parseHm(str) {
  if (!str || typeof str !== 'string') return null;
  const m = str.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return { h, m: mi };
}

/**
 * Extract {day-of-week, hour, minute} as observed in a target timezone for a given UTC date.
 * day-of-week: 0=Sunday .. 6=Saturday (matches JavaScript's getDay())
 */
function getTzParts(date, timezone) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: 'numeric', minute: 'numeric',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
    const dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
      dow: dowMap[parts.weekday] ?? 0,
      hour: parseInt(parts.hour === '24' ? '0' : parts.hour, 10),
      minute: parseInt(parts.minute, 10),
      year: parseInt(parts.year, 10),
      month: parseInt(parts.month, 10),
      day: parseInt(parts.day, 10),
    };
  } catch {
    return null;
  }
}

/**
 * Build a UTC Date that corresponds to the given Y/M/D + H:M in the target timezone.
 * Uses a search to invert the TZ conversion (no external libs).
 */
function makeDateInTz(year, month, day, hour, minute, timezone) {
  // Construct a reasonable UTC guess, then adjust by observed offset iteratively.
  const tryMake = (y, mo, d, h, mi) => {
    let utc = Date.UTC(y, mo - 1, d, h, mi, 0);
    let converged = false;
    for (let i = 0; i < 5; i++) {
      const parts = getTzParts(new Date(utc), timezone);
      if (!parts) break;
      const observedUtcMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
      const targetUtcMs = Date.UTC(y, mo - 1, d, h, mi, 0);
      const diff = targetUtcMs - observedUtcMs;
      if (Math.abs(diff) < 60 * 1000) { converged = true; break; }
      utc += diff;
    }
    return { utc, converged };
  };

  const first = tryMake(year, month, day, hour, minute);
  if (first.converged) return new Date(first.utc);

  // Non-convergence typically means we hit a DST spring-forward gap (e.g.
  // 02:30 on a day when 02:00→03:00 jump happens, so 02:30 does not exist).
  // Snap forward to the next valid minute by nudging +1h at a time until
  // the clock reflects a real instant.
  for (let bump = 1; bump <= 3; bump++) {
    const next = tryMake(year, month, day, hour + bump, minute);
    if (next.converged) return new Date(next.utc);
  }
  // Fallback: return best-effort even if still non-converged.
  return new Date(first.utc);
}

/**
 * Normalize settings into a list of {day, start:{h,m}, end:{h,m}} windows.
 *
 * Accepts either:
 *   • NEW model: settings.active_windows = [{day: 0..6, start: "HH:MM", end: "HH:MM"}, ...]
 *   • LEGACY model: settings.active_days [0..6] + settings.active_hours {start,end}
 *
 * Returns an array (possibly empty = no constraints). Empty = "send anytime".
 */
function normalizeWindows(settings) {
  if (!settings) return [];
  // NEW model — list of explicit windows, each with its own day+time range
  if (Array.isArray(settings.active_windows) && settings.active_windows.length > 0) {
    const out = [];
    for (const w of settings.active_windows) {
      const day = parseInt(w?.day, 10);
      const s = parseHm(w?.start);
      const e = parseHm(w?.end);
      if (Number.isFinite(day) && day >= 0 && day <= 6 && s && e) {
        out.push({ day, start: s, end: e });
      }
    }
    return out;
  }
  // LEGACY model — a single time range applied across all active_days
  const activeDays = Array.isArray(settings.active_days) && settings.active_days.length > 0
    ? settings.active_days.map(d => parseInt(d, 10)).filter(n => Number.isFinite(n) && n >= 0 && n <= 6)
    : [];
  const activeHours = settings.active_hours || null;
  const start = parseHm(activeHours?.start);
  const end = parseHm(activeHours?.end);
  if (activeDays.length === 0 && (!start || !end)) return [];
  // If only days are set, treat as 00:00-24:00 on those days
  const days = activeDays.length > 0 ? activeDays : [0, 1, 2, 3, 4, 5, 6];
  const hh = { start: start || { h: 0, m: 0 }, end: end || { h: 23, m: 59 } };
  return days.map(d => ({ day: d, start: hh.start, end: hh.end }));
}

/**
 * Does window {day, start, end} contain (dow, hour, minute)?
 * Handles midnight-crossing windows (e.g. 22:00-02:00 would fire on both days).
 */
function windowContains(w, dow, hour, minute) {
  const cur = hour * 60 + minute;
  const s = w.start.h * 60 + w.start.m;
  const e = w.end.h * 60 + w.end.m;
  if (s === e) return dow === w.day;
  if (s < e) {
    return dow === w.day && cur >= s && cur < e;
  }
  // Midnight-crossing: counted on both the start day (evening) AND next day (early morning)
  if (dow === w.day && cur >= s) return true;
  if (dow === (w.day + 1) % 7 && cur < e) return true;
  return false;
}

/**
 * Check if `when` (Date) is inside ANY of the campaign's active windows.
 */
function isWithinWindow(when, settings) {
  const tz = settings.timezone || DEFAULT_TZ;
  const windows = normalizeWindows(settings);
  if (windows.length === 0) return true; // no constraints configured

  const parts = getTzParts(when, tz);
  if (!parts) return true;

  return windows.some(w => windowContains(w, parts.dow, parts.hour, parts.minute));
}

/**
 * Compute the next valid send time >= `from` that falls inside some active window.
 * If already within window → returns `from` unchanged.
 * Otherwise walks forward up to 14 days to find the earliest window-start.
 */
function computeNextValidTime(from, settings) {
  if (!settings) return from;
  const tz = settings.timezone || DEFAULT_TZ;
  const windows = normalizeWindows(settings);
  if (windows.length === 0) return from; // no constraints → now

  if (isWithinWindow(from, settings)) return from;

  // Collect all candidate window-start timestamps within the next 14 days
  // then pick the earliest one >= `from`.
  let best = null;
  for (let offset = 0; offset < 14; offset++) {
    const probeMs = from.getTime() + offset * 24 * 60 * 60 * 1000;
    const probeParts = getTzParts(new Date(probeMs), tz);
    if (!probeParts) break;
    const probeDow = probeParts.dow;

    for (const w of windows) {
      if (w.day !== probeDow) continue;
      const candidate = makeDateInTz(probeParts.year, probeParts.month, probeParts.day, w.start.h, w.start.m, tz);
      if (candidate.getTime() < from.getTime()) continue;
      if (!best || candidate.getTime() < best.getTime()) best = candidate;
    }
    // Early exit if we already found a same-day candidate — it's the earliest
    if (best && offset === 0) break;
  }
  return best || from;
}

/**
 * Pick a single batch of pending recipients and send them.
 * Returns: { sentCount, failedCount, hasMore, stopped }
 *
 * Atomic claim: UPDATE ... RETURNING with a FOR UPDATE SKIP LOCKED subquery
 * marks rows as 'sending' before we start. This prevents two parallel ticks
 * from sending to the same recipient (which was the duplicate-message bug).
 */
async function runSingleBatch(campaign, connection, messages) {
  const settings = campaign.settings || {};
  const batchSize = parseInt(settings.batch_size, 10) || 50;

  // Atomically claim a batch of pending recipients by flipping them to
  // 'sending' in a single UPDATE. Any concurrent process sees them as
  // already-sending and skips them.
  const claimed = await db.query(`
    UPDATE broadcast_campaign_recipients
    SET status = 'sending'
    WHERE id IN (
      SELECT id FROM broadcast_campaign_recipients
      WHERE campaign_id = $1 AND status = 'pending'
      ORDER BY queued_at
      LIMIT $2
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `, [campaign.id, batchSize]);

  if (claimed.rows.length === 0) {
    return { sentCount: 0, failedCount: 0, hasMore: false, stopped: false };
  }

  let sentCount = 0;
  let failedCount = 0;

  for (const recipient of claimed.rows) {
    // Status interrupt check — user may have paused/stopped mid-batch
    const statusCheck = await db.query(
      `SELECT status FROM broadcast_campaigns WHERE id = $1`,
      [campaign.id]
    );
    if (statusCheck.rows[0]?.status !== 'running') {
      // Roll remaining claimed recipients back to 'pending' so they're picked
      // up on the next run (including this one if we return early).
      await db.query(
        `UPDATE broadcast_campaign_recipients SET status = 'pending' WHERE id = $1 AND status = 'sending'`,
        [recipient.id]
      );
      console.log(`[CampaignWindow] Campaign ${campaign.id} no longer running (${statusCheck.rows[0]?.status}) — interrupting batch`);
      return { sentCount, failedCount, hasMore: true, stopped: true };
    }

    // Window-boundary interrupt: even within a single running campaign, the
    // active-window may close mid-batch (long per-message delay pushes us
    // past the configured end time). Stop sending and roll remaining rows
    // back to 'pending' so the next tick picks them up after the next
    // window opens.
    if (!isWithinWindow(new Date(), settings)) {
      await db.query(
        `UPDATE broadcast_campaign_recipients SET status = 'pending' WHERE id = $1 AND status = 'sending'`,
        [recipient.id]
      );
      console.log(`[CampaignWindow] Campaign ${campaign.id} window closed mid-batch — interrupting`);
      return { sentCount, failedCount, hasMore: true, stopped: true };
    }

    let ok = false;
    let errorMessage = null;
    try {
      ok = await broadcastSender.sendToRecipient(
        campaign.user_id, connection, recipient, messages, campaign.name
      );
    } catch (err) {
      errorMessage = err.message;
      console.error(`[CampaignWindow] send to ${recipient.phone} error: ${err.message}`);
    }

    if (ok) {
      await db.query(
        `UPDATE broadcast_campaign_recipients
         SET status = 'sent', sent_at = NOW()
         WHERE id = $1`,
        [recipient.id]
      );
      await db.query(
        `UPDATE broadcast_campaigns SET sent_count = sent_count + 1 WHERE id = $1`,
        [campaign.id]
      );
      sentCount++;
    } else {
      await db.query(
        `UPDATE broadcast_campaign_recipients
         SET status = 'failed', error_message = $2
         WHERE id = $1`,
        [recipient.id, (errorMessage || '').slice(0, 500)]
      );
      await db.query(
        `UPDATE broadcast_campaigns SET failed_count = failed_count + 1 WHERE id = $1`,
        [campaign.id]
      );
      failedCount++;
    }

    // Per-message delay (if configured)
    const delayMs = (parseInt(settings.delay_between_messages, 10) || 2) * 1000;
    if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
  }

  // Are there more pending after this batch?
  const remainingRes = await db.query(
    `SELECT COUNT(*)::int AS n FROM broadcast_campaign_recipients WHERE campaign_id = $1 AND status IN ('pending','sending')`,
    [campaign.id]
  );
  const hasMore = (remainingRes.rows[0]?.n || 0) > 0;

  return { sentCount, failedCount, hasMore, stopped: false };
}

/**
 * Process one campaign: single batch + reschedule.
 */
async function processCampaign(campaign) {
  if (runningCampaigns.has(campaign.id)) return; // already running
  runningCampaigns.add(campaign.id);

  try {
    const settings = campaign.settings || {};
    const now = new Date();

    // Window check — are we currently allowed to send?
    if (!isWithinWindow(now, settings)) {
      const next = computeNextValidTime(now, settings);
      console.log(`[CampaignWindow] Campaign ${campaign.id} outside window — rescheduling to ${next.toISOString()}`);
      await db.query(
        `UPDATE broadcast_campaigns SET next_batch_at = $2, updated_at = NOW() WHERE id = $1`,
        [campaign.id, next]
      );
      return;
    }

    // Fetch WAHA connection (reuse existing helper)
    const connection = await broadcastSender.getWahaConnection(campaign.user_id);
    if (!connection) {
      console.error(`[CampaignWindow] No WAHA connection for user ${campaign.user_id} — campaign ${campaign.id}`);
      // Retry in 5 minutes
      await db.query(
        `UPDATE broadcast_campaigns SET next_batch_at = NOW() + INTERVAL '5 minutes', updated_at = NOW() WHERE id = $1`,
        [campaign.id]
      );
      return;
    }

    // Build messages (template or direct)
    let messages = [];
    if (campaign.template_id) {
      const mRes = await db.query(
        `SELECT * FROM broadcast_template_messages WHERE template_id = $1 ORDER BY message_order`,
        [campaign.template_id]
      );
      messages = mRes.rows;
    } else if (campaign.direct_message) {
      messages = [{
        message_type: campaign.direct_media_url ? 'image' : 'text',
        content: campaign.direct_message,
        media_url: campaign.direct_media_url,
        delay_seconds: 0,
      }];
    }

    if (messages.length === 0) {
      console.error(`[CampaignWindow] Campaign ${campaign.id} has no messages — failing`);
      await db.query(
        `UPDATE broadcast_campaigns SET status = 'failed', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [campaign.id]
      );
      return;
    }

    const result = await runSingleBatch(campaign, connection, messages);

    // If no more recipients → mark completed + RECONCILE counters from the
    // recipients table (defensive — if anything drifted, the truth is there).
    if (!result.hasMore) {
      await db.query(`
        UPDATE broadcast_campaigns
        SET status = 'completed',
            completed_at = NOW(),
            next_batch_at = NULL,
            sent_count   = (SELECT COUNT(*) FROM broadcast_campaign_recipients r WHERE r.campaign_id = broadcast_campaigns.id AND r.status = 'sent'),
            failed_count = (SELECT COUNT(*) FROM broadcast_campaign_recipients r WHERE r.campaign_id = broadcast_campaigns.id AND r.status = 'failed'),
            last_batch_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `, [campaign.id]);
      console.log(`[CampaignWindow] ✅ Campaign ${campaign.id} completed`);
      return;
    }

    // runSingleBatch already updated sent_count/failed_count per successful
    // send (atomic increments). The queries below only update scheduling
    // fields — we do NOT double-increment the counters anymore (prior bug
    // showed "2 נשלחו" for 1 actual send).

    // If user stopped/paused mid-batch → don't reschedule, respect their state
    if (result.stopped) {
      await db.query(`
        UPDATE broadcast_campaigns
        SET last_batch_at = NOW(), updated_at = NOW()
        WHERE id = $1
      `, [campaign.id]);
      return;
    }

    // Compute next_batch_at: now + batch_delay_minutes, adjusted to next active window
    const delayMinutes = parseInt(settings.batch_delay_minutes, 10) || 30;
    const proposed = new Date(Date.now() + delayMinutes * 60 * 1000);
    const nextValid = computeNextValidTime(proposed, settings);

    await db.query(`
      UPDATE broadcast_campaigns
      SET next_batch_at = $2, last_batch_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `, [campaign.id, nextValid]);

    console.log(`[CampaignWindow] Campaign ${campaign.id} batch done (sent=${result.sentCount} failed=${result.failedCount}) — next at ${nextValid.toISOString()}`);
  } catch (err) {
    console.error(`[CampaignWindow] processCampaign error for ${campaign.id}:`, err);
    // Don't fail the campaign on transient errors — try again in 5 minutes
    await db.query(
      `UPDATE broadcast_campaigns SET next_batch_at = NOW() + INTERVAL '5 minutes', updated_at = NOW() WHERE id = $1`,
      [campaign.id]
    ).catch(() => {});
  } finally {
    runningCampaigns.delete(campaign.id);
  }
}

/**
 * The tick — find all due campaigns and process them.
 */
async function tick() {
  if (_tickRunning) return;
  _tickRunning = true;
  try {
    const due = await db.query(`
      SELECT c.*, t.id as template_id
      FROM broadcast_campaigns c
      LEFT JOIN broadcast_templates t ON t.id = c.template_id
      WHERE c.status = 'running'
        AND (c.next_batch_at IS NULL OR c.next_batch_at <= NOW())
      ORDER BY COALESCE(c.next_batch_at, c.started_at, c.created_at) ASC
      LIMIT 20
    `);

    if (due.rows.length === 0) return;

    // Process in parallel but cap concurrency via runningCampaigns guard
    await Promise.all(due.rows.map(c => processCampaign(c)));
  } catch (err) {
    console.error('[CampaignWindow] tick error:', err);
  } finally {
    _tickRunning = false;
  }
}

let _interval = null;

function startWindowTick(intervalMs = 60000) {
  if (_interval) return;
  console.log(`[CampaignWindow] Starting window tick every ${intervalMs}ms`);
  // Kick off after a short delay so DB is definitely ready
  setTimeout(tick, 5000);
  _interval = setInterval(tick, intervalMs);
}

function stopWindowTick() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
}

module.exports = {
  startWindowTick,
  stopWindowTick,
  tick,
  processCampaign,
  computeNextValidTime,
  isWithinWindow,
};
