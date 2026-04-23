/**
 * Monthly usage metering for the Save-Contact-Bot service.
 *
 * Rules (mirrored from the spec):
 * - Every inbound that matches a profile counts ONE unique contact per month (dedup by phone).
 * - Soft limit = 500 unique contacts/month. Above that, each block of 100 = 8 NIS.
 * - If the user has no valid card on file AND count > 500 → HARD STOP (reject).
 * - Warning emails: at 300 (approaching), 400 (one batch left) for users without a card;
 *   at 500+ if processing gets blocked.
 * - Overage NIS accumulates in service_usage.usage_data.overage_nis_pending; the
 *   existing billing job will pick it up on the next cycle (to be wired in Wave 4d).
 */

const db = require('../../config/database');
const mail = require('../mail/transport.service');

const SERVICE_SLUG = 'save-contact-bot';
const MONTHLY_LIMIT = 500;
const OVERAGE_BLOCK = 100;
const OVERAGE_NIS_PER_BLOCK = 8;

const WARNING_THRESHOLDS = [300, 400, 500]; // emailed when no card on file

function monthPeriod(date = new Date()) {
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

async function getServiceIdBySlug(slug) {
  const { rows } = await db.query(`SELECT id FROM additional_services WHERE slug = $1 LIMIT 1`, [slug]);
  return rows[0]?.id || null;
}

/**
 * Count unique matched contacts for this user in the current (Israel) month.
 * Only matched inbound requests count toward the limit.
 */
async function countMonthlyUniqueContacts(userId) {
  const { rows } = await db.query(
    `SELECT COUNT(DISTINCT rcv.from_phone)::int AS unique_count
       FROM save_contact_bot_received_requests rcv
       JOIN save_contact_bot_profiles p ON p.id = rcv.profile_id
      WHERE p.user_id = $1
        AND rcv.matched = true
        AND rcv.processed_at >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Jerusalem')`,
    [userId]
  );
  return rows[0]?.unique_count || 0;
}

/**
 * Has this user got a valid payment method on file?
 */
async function hasValidPaymentMethod(userId) {
  const { rows } = await db.query(
    `SELECT 1 FROM user_payment_methods
      WHERE user_id = $1
        AND sumit_customer_id IS NOT NULL
        AND COALESCE(is_active, true) = true
      LIMIT 1`,
    [userId]
  );
  return rows.length > 0;
}

async function getOrCreateUsageRow(userId) {
  const serviceId = await getServiceIdBySlug(SERVICE_SLUG);
  if (!serviceId) return null;
  const { year, month } = monthPeriod();

  const { rows } = await db.query(
    `INSERT INTO service_usage (user_id, service_id, period_year, period_month, usage_data)
     VALUES ($1, $2, $3, $4, '{}')
     ON CONFLICT (user_id, service_id, period_year, period_month) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [userId, serviceId, year, month]
  );
  return rows[0];
}

async function updateUsageData(userId, patch) {
  const serviceId = await getServiceIdBySlug(SERVICE_SLUG);
  if (!serviceId) return;
  const { year, month } = monthPeriod();
  await db.query(
    `UPDATE service_usage
        SET usage_data = COALESCE(usage_data, '{}'::jsonb) || $5::jsonb,
            updated_at = NOW()
      WHERE user_id = $1 AND service_id = $2 AND period_year = $3 AND period_month = $4`,
    [userId, serviceId, year, month, JSON.stringify(patch)]
  );
}

/**
 * Compute overage from a raw unique count:
 *   blocks_owed = ceil((uniqueCount - 500) / 100) (min 0)
 *   nis_owed    = blocks_owed * 8
 */
function computeOverage(uniqueCount) {
  const excess = Math.max(0, uniqueCount - MONTHLY_LIMIT);
  const blocks = Math.ceil(excess / OVERAGE_BLOCK);
  return { blocks, nis: blocks * OVERAGE_NIS_PER_BLOCK };
}

/**
 * Core gate called by the inbound handler BEFORE running the sequence.
 * Returns { allow: bool, reason, uniqueCount, overage, hasCard, limit }.
 *
 * If `allow` is false, the caller must refuse processing (no sequence, no Google sync).
 * The function also records the month's counters/warnings as a side effect.
 */
async function checkAndRecordInbound(userId, phone) {
  // Serialize concurrent usage gates for the same user so the count→gate
  // decision can't be raced by a parallel inbound (which would let the user
  // sneak past the 500-limit under load). Transaction-scoped advisory lock
  // so it's released automatically on COMMIT even if the caller forgets.
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [`save_contact_bot_usage:${userId}`]
    );
    const result = await _checkAndRecordInboundLocked(userId, phone);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

async function _checkAndRecordInboundLocked(userId, phone) {
  const usageRow = await getOrCreateUsageRow(userId);
  const data = usageRow?.usage_data || {};
  const warningsSent = new Set(data.warnings_sent || []);

  // 1) Will this phone increase the unique count?
  const beforeCount = await countMonthlyUniqueContacts(userId);
  const alreadyCountedRes = await db.query(
    `SELECT 1 FROM save_contact_bot_received_requests rcv
      JOIN save_contact_bot_profiles p ON p.id = rcv.profile_id
     WHERE p.user_id = $1
       AND rcv.from_phone = $2
       AND rcv.matched = true
       AND rcv.processed_at >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Jerusalem')
     LIMIT 1`,
    [userId, phone]
  );
  const isNewUnique = alreadyCountedRes.rows.length === 0;
  const projectedCount = isNewUnique ? beforeCount + 1 : beforeCount;

  const hasCard = await hasValidPaymentMethod(userId);

  // 2) Hard stop: no card AND would cross the 500 line
  if (!hasCard && projectedCount > MONTHLY_LIMIT) {
    await maybeSendWarning(userId, projectedCount, warningsSent, 'blocked');
    return {
      allow: false,
      reason: 'limit_reached_no_card',
      uniqueCount: beforeCount,
      hasCard,
      limit: MONTHLY_LIMIT,
      overage: computeOverage(beforeCount),
    };
  }

  // 3) Overage accounting (accumulates NIS for next billing cycle)
  const overage = computeOverage(projectedCount);
  const patch = {};
  if (projectedCount !== (data.unique_contacts_snapshot || 0)) {
    patch.unique_contacts_snapshot = projectedCount;
  }
  if (overage.blocks !== (data.overage_blocks_pending || 0)) {
    patch.overage_blocks_pending = overage.blocks;
    patch.overage_nis_pending = overage.nis;
  }
  if (Object.keys(patch).length > 0) {
    await updateUsageData(userId, patch);
  }

  // 4) Threshold warnings — only when the user has no card on file.
  if (!hasCard && isNewUnique) {
    await maybeSendWarning(userId, projectedCount, warningsSent, 'approaching');
  }

  return {
    allow: true,
    uniqueCount: projectedCount,
    isNewUnique,
    hasCard,
    limit: MONTHLY_LIMIT,
    overage,
  };
}

async function maybeSendWarning(userId, currentCount, alreadySent, kind) {
  // Pick the highest threshold we've crossed that we haven't emailed about yet.
  const crossed = WARNING_THRESHOLDS.filter((t) => currentCount >= t && !alreadySent.has(String(t)));
  if (crossed.length === 0) return;
  const level = Math.max(...crossed);

  const userRes = await db.query(`SELECT email, name FROM users WHERE id = $1`, [userId]);
  const user = userRes.rows[0];
  if (!user?.email) return;

  const subject = kind === 'blocked'
    ? 'המודול "שמירת איש קשר" נעצר — הגעת למגבלת 500 אנשים'
    : level === 400
      ? 'אזהרה — עוד 100 איש עד עצירת מודול "שמירת איש קשר"'
      : 'קרוב למגבלת 500 אנשים במודול "שמירת איש קשר"';

  const bodyIntro = kind === 'blocked'
    ? `המערכת הגיעה ל-${currentCount} אנשים חדשים החודש ובלי אמצעי תשלום בתוקף — המודול עצר זמנית.`
    : `כרגע נרשמו ${currentCount} אנשים חדשים החודש. המגבלה החודשית היא ${MONTHLY_LIMIT}.`;

  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 560px; margin: auto; padding: 24px; background: #f6fbfa; border-radius: 12px; color: #1f2937;">
      <h2 style="color: #0f766e; margin: 0 0 12px;">בוטומט · בוט שמירת איש קשר</h2>
      <p style="font-size: 15px; line-height: 1.6;">שלום${user.name ? ` ${user.name}` : ''},</p>
      <p style="font-size: 15px; line-height: 1.6;">${bodyIntro}</p>
      <p style="font-size: 15px; line-height: 1.6;">
        כדי להמשיך לקבל אנשי קשר חדשים החודש — יש להוסיף אמצעי תשלום בתוקף בהגדרות.
        מעבר ל-${MONTHLY_LIMIT} ייגבה תוספת של <b>${OVERAGE_NIS_PER_BLOCK} ₪ לכל ${OVERAGE_BLOCK} אנשים</b>, בחיוב הקרוב.
      </p>
      <p style="margin-top: 24px;">
        <a href="https://botomat.co.il/settings?tab=payment"
           style="display: inline-block; background: linear-gradient(90deg,#0d9488,#059669); color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: 600;">
          הוספת אמצעי תשלום
        </a>
      </p>
      <p style="font-size: 12px; color: #6b7280; margin-top: 24px;">
        המייל נשלח אוטומטית ממערכת הבוטומט. בשאלות ותמיכה — השב למייל זה.
      </p>
    </div>
  `;

  try {
    await mail.sendMail(user.email, subject, html);
    console.log(`[SaveContactBot Usage] Warning email sent to ${user.email} (threshold ${level}, kind ${kind})`);
    alreadySent.add(String(level));
    await updateUsageData(userId, { warnings_sent: Array.from(alreadySent) });
  } catch (e) {
    console.error('[SaveContactBot Usage] Failed to send warning email:', e.message);
  }
}

async function getCurrentUsageSummary(userId) {
  const uniqueCount = await countMonthlyUniqueContacts(userId);
  const hasCard = await hasValidPaymentMethod(userId);
  const overage = computeOverage(uniqueCount);
  return {
    uniqueCount,
    limit: MONTHLY_LIMIT,
    overageBlocks: overage.blocks,
    overageNis: overage.nis,
    hasCard,
    blocked: !hasCard && uniqueCount >= MONTHLY_LIMIT,
  };
}

/**
 * Returns outstanding NIS that must be paid before the user can remove their card.
 * Sums overage_nis_pending from the current month's service_usage row.
 */
async function getOutstandingOverage(userId) {
  const serviceId = await getServiceIdBySlug(SERVICE_SLUG);
  if (!serviceId) return 0;
  const { rows } = await db.query(
    `SELECT COALESCE((usage_data->>'overage_nis_pending')::numeric, 0) AS nis
       FROM service_usage
      WHERE user_id = $1 AND service_id = $2
      ORDER BY period_year DESC, period_month DESC
      LIMIT 1`,
    [userId, serviceId]
  );
  return Number(rows[0]?.nis || 0);
}

async function clearOutstandingOverage(userId) {
  const serviceId = await getServiceIdBySlug(SERVICE_SLUG);
  if (!serviceId) return;
  await db.query(
    `UPDATE service_usage
        SET usage_data = (COALESCE(usage_data, '{}'::jsonb)
                         - 'overage_nis_pending'
                         - 'overage_blocks_pending'),
            updated_at = NOW()
      WHERE user_id = $1 AND service_id = $2`,
    [userId, serviceId]
  );
}

module.exports = {
  SERVICE_SLUG,
  MONTHLY_LIMIT,
  OVERAGE_BLOCK,
  OVERAGE_NIS_PER_BLOCK,
  countMonthlyUniqueContacts,
  hasValidPaymentMethod,
  checkAndRecordInbound,
  getCurrentUsageSummary,
  getOutstandingOverage,
  clearOutstandingOverage,
  computeOverage,
};
