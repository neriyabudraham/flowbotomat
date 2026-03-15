const db = require('../../config/database');
const googleContacts = require('../../services/googleContacts.service');

// ─────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────

async function checkSubscription(userId) {
  const result = await db.query(`
    SELECT uss.*, ads.slug
    FROM user_service_subscriptions uss
    JOIN additional_services ads ON ads.id = uss.service_id
    WHERE uss.user_id = $1 AND ads.slug = 'view-filter-bot'
    LIMIT 1
  `, [userId]);

  if (result.rows.length === 0) return { hasAccess: false, noSubscription: true };

  const sub = result.rows[0];
  const now = new Date();

  if (sub.status === 'active' || sub.status === 'trial') {
    if (sub.status === 'trial' && sub.trial_ends_at && new Date(sub.trial_ends_at) < now) {
      return { hasAccess: false, trialExpired: true };
    }
    return { hasAccess: true, subscription: sub };
  }
  if (sub.status === 'cancelled' && sub.expires_at && new Date(sub.expires_at) > now) {
    return { hasAccess: true, subscription: sub, isCancelled: true };
  }
  return { hasAccess: false, subscriptionExpired: true };
}

async function getConnectionId(userId) {
  const result = await db.query(
    `SELECT id FROM status_bot_connections WHERE user_id = $1 AND is_active = true LIMIT 1`,
    [userId]
  );
  return result.rows[0]?.id || null;
}

// ─────────────────────────────────────────────
// CAMPAIGN MANAGEMENT
// ─────────────────────────────────────────────

async function getCampaign(req, res) {
  try {
    const userId = req.user.id;
    const access = await checkSubscription(userId);
    if (!access.hasAccess) {
      return res.status(403).json({ error: 'אין גישה לשירות', ...access });
    }

    const result = await db.query(
      `SELECT * FROM status_viewer_campaigns WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({ hasCampaign: false });
    }

    const campaign = result.rows[0];
    const now = new Date();
    const daysRemaining = Math.max(0, Math.ceil((new Date(campaign.ends_at) - now) / 86400000));

    // Auto-complete if past end date
    if (daysRemaining === 0 && campaign.status === 'active') {
      await db.query(
        `UPDATE status_viewer_campaigns SET status = 'completed' WHERE id = $1`,
        [campaign.id]
      );
      campaign.status = 'completed';
    }

    return res.json({
      hasCampaign: true,
      campaign: {
        ...campaign,
        daysRemaining,
        daysTotal: 90,
        daysElapsed: 90 - daysRemaining,
        progressPercent: Math.round(((90 - daysRemaining) / 90) * 100),
      }
    });
  } catch (err) {
    console.error('[ViewFilter] getCampaign error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת הקמפיין' });
  }
}

async function startCampaign(req, res) {
  try {
    const userId = req.user.id;
    const access = await checkSubscription(userId);
    if (!access.hasAccess) {
      return res.status(403).json({ error: 'אין גישה לשירות', ...access });
    }

    // Check for existing active campaign
    const existing = await db.query(
      `SELECT * FROM status_viewer_campaigns WHERE user_id = $1`,
      [userId]
    );
    if (existing.rows.length > 0 && existing.rows[0].status === 'active') {
      return res.status(400).json({ error: 'כבר יש קמפיין פעיל. המתן לסיומו לפני התחלת חדש.' });
    }

    const connectionId = await getConnectionId(userId);
    if (!connectionId) {
      return res.status(400).json({ error: 'נדרש חיבור לבוט סטטוסים פעיל' });
    }

    const now = new Date();
    const endsAt = new Date(now.getTime() + 90 * 86400000);

    const result = await db.query(`
      INSERT INTO status_viewer_campaigns (user_id, connection_id, started_at, ends_at, status)
      VALUES ($1, $2, $3, $4, 'active')
      ON CONFLICT (user_id) DO UPDATE SET
        connection_id = EXCLUDED.connection_id,
        started_at = EXCLUDED.started_at,
        ends_at = EXCLUDED.ends_at,
        status = 'active'
      RETURNING *
    `, [userId, connectionId, now, endsAt]);

    const campaign = result.rows[0];
    return res.json({
      success: true,
      campaign: {
        ...campaign,
        daysRemaining: 90,
        daysTotal: 90,
        daysElapsed: 0,
        progressPercent: 0,
      }
    });
  } catch (err) {
    console.error('[ViewFilter] startCampaign error:', err);
    res.status(500).json({ error: 'שגיאה בהתחלת הקמפיין' });
  }
}

// ─────────────────────────────────────────────
// DASHBOARD STATS
// ─────────────────────────────────────────────

async function getDashboardStats(req, res) {
  try {
    const userId = req.user.id;
    const access = await checkSubscription(userId);
    if (!access.hasAccess) {
      return res.status(403).json({ error: 'אין גישה לשירות', ...access });
    }

    const campaignResult = await db.query(
      `SELECT * FROM status_viewer_campaigns WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (campaignResult.rows.length === 0) {
      return res.json({ hasCampaign: false });
    }

    const campaign = campaignResult.rows[0];
    const { connection_id, started_at, ends_at } = campaign;
    const now = new Date();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const daysRemaining = Math.max(0, Math.ceil((new Date(ends_at) - now) / 86400000));

    const [totalViewers, newToday, newThisWeek, totalStatuses, avgViews, totalGrayCheckmarks] = await Promise.all([
      // Total unique viewers in period
      db.query(`
        SELECT COUNT(DISTINCT sbv.viewer_phone) as count
        FROM status_bot_views sbv
        JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
        WHERE sbs.connection_id = $1
          AND sbv.viewed_at >= $2 AND sbv.viewed_at <= $3
      `, [connection_id, started_at, ends_at]),

      // New viewers today (first seen today)
      db.query(`
        SELECT COUNT(DISTINCT viewer_phone) as count FROM (
          SELECT sbv.viewer_phone,
                 MIN(sbv.viewed_at) as first_seen
          FROM status_bot_views sbv
          JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
          WHERE sbs.connection_id = $1
            AND sbv.viewed_at >= $2 AND sbv.viewed_at <= $3
          GROUP BY sbv.viewer_phone
        ) t WHERE t.first_seen >= $4
      `, [connection_id, started_at, ends_at, todayStart]),

      // New viewers this week (first seen in last 7 days)
      db.query(`
        SELECT COUNT(DISTINCT viewer_phone) as count FROM (
          SELECT sbv.viewer_phone,
                 MIN(sbv.viewed_at) as first_seen
          FROM status_bot_views sbv
          JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
          WHERE sbs.connection_id = $1
            AND sbv.viewed_at >= $2 AND sbv.viewed_at <= $3
          GROUP BY sbv.viewer_phone
        ) t WHERE t.first_seen >= $4
      `, [connection_id, started_at, ends_at, weekAgo]),

      // Total statuses uploaded during period
      db.query(`
        SELECT COUNT(*) as count FROM status_bot_statuses
        WHERE connection_id = $1 AND sent_at >= $2 AND sent_at <= $3
          AND deleted_at IS NULL
      `, [connection_id, started_at, ends_at]),

      // Average views per status
      db.query(`
        SELECT COALESCE(AVG(view_count), 0)::numeric(10,1) as avg
        FROM status_bot_statuses
        WHERE connection_id = $1 AND sent_at >= $2 AND sent_at <= $3
          AND deleted_at IS NULL
      `, [connection_id, started_at, ends_at]),

      // Gray checkmarks (reacted or replied but no view)
      db.query(`
        SELECT COUNT(DISTINCT phone) as count FROM (
          SELECT sbr.reactor_phone as phone
          FROM status_bot_reactions sbr
          JOIN status_bot_statuses sbs ON sbr.status_id = sbs.id
          WHERE sbs.connection_id = $1 AND sbr.reacted_at >= $2 AND sbr.reacted_at <= $3
            AND sbr.reactor_phone NOT IN (
              SELECT DISTINCT sbv2.viewer_phone
              FROM status_bot_views sbv2
              JOIN status_bot_statuses sbs2 ON sbv2.status_id = sbs2.id
              WHERE sbs2.connection_id = $1
            )
          UNION
          SELECT sbr2.replier_phone as phone
          FROM status_bot_replies sbr2
          JOIN status_bot_statuses sbs2 ON sbr2.status_id = sbs2.id
          WHERE sbs2.connection_id = $1 AND sbr2.replied_at >= $2 AND sbr2.replied_at <= $3
            AND sbr2.replier_phone NOT IN (
              SELECT DISTINCT sbv3.viewer_phone
              FROM status_bot_views sbv3
              JOIN status_bot_statuses sbs3 ON sbv3.status_id = sbs3.id
              WHERE sbs3.connection_id = $1
            )
        ) gc
      `, [connection_id, started_at, ends_at]),
    ]);

    return res.json({
      hasCampaign: true,
      campaign: {
        ...campaign,
        daysRemaining,
        daysTotal: 90,
        daysElapsed: 90 - daysRemaining,
        progressPercent: Math.round(((90 - daysRemaining) / 90) * 100),
      },
      stats: {
        totalViewers: parseInt(totalViewers.rows[0].count),
        newToday: parseInt(newToday.rows[0].count),
        newThisWeek: parseInt(newThisWeek.rows[0].count),
        totalStatuses: parseInt(totalStatuses.rows[0].count),
        avgViewsPerStatus: parseFloat(avgViews.rows[0].avg),
        grayCheckmarks: parseInt(totalGrayCheckmarks.rows[0].count),
      }
    });
  } catch (err) {
    console.error('[ViewFilter] getDashboardStats error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת הנתונים' });
  }
}

// ─────────────────────────────────────────────
// VIEWERS LIST
// ─────────────────────────────────────────────

async function getViewers(req, res) {
  try {
    const userId = req.user.id;
    const access = await checkSubscription(userId);
    if (!access.hasAccess) {
      return res.status(403).json({ error: 'אין גישה לשירות', ...access });
    }

    const campaignResult = await db.query(
      `SELECT * FROM status_viewer_campaigns WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (campaignResult.rows.length === 0) {
      return res.json({ viewers: [] });
    }

    const { connection_id, started_at, ends_at } = campaignResult.rows[0];

    // Pagination + filtering
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;
    const search = req.query.search?.trim() || '';
    const sortBy = ['statuses_viewed', 'view_percentage', 'first_seen', 'last_seen'].includes(req.query.sort)
      ? req.query.sort : 'statuses_viewed';
    const sortDir = req.query.dir === 'asc' ? 'ASC' : 'DESC';
    const minPercent = parseInt(req.query.min_percent) || 0;
    const maxPercent = parseInt(req.query.max_percent) || 100;

    const searchClause = search
      ? `AND (sbv.viewer_phone ILIKE $5 OR MAX(sbv.viewer_name) ILIKE $5)`
      : '';

    const totalStatusesResult = await db.query(`
      SELECT COUNT(*) as count FROM status_bot_statuses
      WHERE connection_id = $1 AND sent_at >= $2 AND sent_at <= $3 AND deleted_at IS NULL
    `, [connection_id, started_at, ends_at]);
    const totalStatuses = parseInt(totalStatusesResult.rows[0].count) || 1;

    const params = [connection_id, started_at, ends_at, totalStatuses];
    if (search) params.push(`%${search}%`);
    const searchIdx = search ? 5 : null;

    const viewersResult = await db.query(`
      SELECT
        sbv.viewer_phone,
        MAX(sbv.viewer_name) as viewer_name,
        COUNT(DISTINCT sbv.status_id) as statuses_viewed,
        $4::int as total_statuses,
        ROUND(COUNT(DISTINCT sbv.status_id)::numeric / $4 * 100) as view_percentage,
        MIN(sbv.viewed_at) as first_seen,
        MAX(sbv.viewed_at) as last_seen,
        EXISTS(
          SELECT 1 FROM status_bot_reactions sbr2
          JOIN status_bot_statuses sbs2 ON sbr2.status_id = sbs2.id
          WHERE sbs2.connection_id = $1 AND sbr2.reactor_phone = sbv.viewer_phone
        ) as has_reaction,
        EXISTS(
          SELECT 1 FROM status_bot_replies sbr3
          JOIN status_bot_statuses sbs3 ON sbr3.status_id = sbs3.id
          WHERE sbs3.connection_id = $1 AND sbr3.replier_phone = sbv.viewer_phone
        ) as has_reply
      FROM status_bot_views sbv
      JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
      WHERE sbs.connection_id = $1
        AND sbv.viewed_at >= $2 AND sbv.viewed_at <= $3
        ${searchClause}
      GROUP BY sbv.viewer_phone
      HAVING ROUND(COUNT(DISTINCT sbv.status_id)::numeric / $4 * 100) BETWEEN ${minPercent} AND ${maxPercent}
      ORDER BY ${sortBy} ${sortDir}
      LIMIT ${limit} OFFSET ${offset}
    `, params);

    // Total count for pagination
    const countResult = await db.query(`
      SELECT COUNT(DISTINCT sbv.viewer_phone) as count
      FROM status_bot_views sbv
      JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
      WHERE sbs.connection_id = $1 AND sbv.viewed_at >= $2 AND sbv.viewed_at <= $3
    `, [connection_id, started_at, ends_at]);

    return res.json({
      viewers: viewersResult.rows,
      total: parseInt(countResult.rows[0].count),
      totalStatuses,
      page,
      limit,
    });
  } catch (err) {
    console.error('[ViewFilter] getViewers error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת הצופים' });
  }
}

// ─────────────────────────────────────────────
// GRAY CHECKMARKS
// ─────────────────────────────────────────────

async function getGrayCheckmarks(req, res) {
  try {
    const userId = req.user.id;
    const access = await checkSubscription(userId);
    if (!access.hasAccess) return res.status(403).json({ error: 'אין גישה לשירות', ...access });

    const campaignResult = await db.query(
      `SELECT * FROM status_viewer_campaigns WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (campaignResult.rows.length === 0) return res.json({ grayCheckmarks: [] });

    const { connection_id, started_at, ends_at } = campaignResult.rows[0];

    const result = await db.query(`
      SELECT phone, name, type FROM (
        SELECT DISTINCT
          sbr.reactor_phone as phone,
          MAX(sbr.reactor_name) as name,
          'reaction' as type
        FROM status_bot_reactions sbr
        JOIN status_bot_statuses sbs ON sbr.status_id = sbs.id
        WHERE sbs.connection_id = $1 AND sbr.reacted_at >= $2 AND sbr.reacted_at <= $3
          AND sbr.reactor_phone NOT IN (
            SELECT DISTINCT sbv.viewer_phone
            FROM status_bot_views sbv
            JOIN status_bot_statuses sbs2 ON sbv.status_id = sbs2.id
            WHERE sbs2.connection_id = $1
          )
        GROUP BY sbr.reactor_phone
        UNION
        SELECT DISTINCT
          sbr2.replier_phone as phone,
          MAX(sbr2.replier_name) as name,
          'reply' as type
        FROM status_bot_replies sbr2
        JOIN status_bot_statuses sbs2 ON sbr2.status_id = sbs2.id
        WHERE sbs2.connection_id = $1 AND sbr2.replied_at >= $2 AND sbr2.replied_at <= $3
          AND sbr2.replier_phone NOT IN (
            SELECT DISTINCT sbv2.viewer_phone
            FROM status_bot_views sbv2
            JOIN status_bot_statuses sbs3 ON sbv2.status_id = sbs3.id
            WHERE sbs3.connection_id = $1
          )
        GROUP BY sbr2.replier_phone
      ) gc
      ORDER BY name ASC
    `, [connection_id, started_at, ends_at]);

    return res.json({ grayCheckmarks: result.rows });
  } catch (err) {
    console.error('[ViewFilter] getGrayCheckmarks error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת וי אפור' });
  }
}

// ─────────────────────────────────────────────
// VIEWER PROFILE
// ─────────────────────────────────────────────

async function getViewerProfile(req, res) {
  try {
    const userId = req.user.id;
    const access = await checkSubscription(userId);
    if (!access.hasAccess) return res.status(403).json({ error: 'אין גישה לשירות', ...access });

    const { phone } = req.params;

    const campaignResult = await db.query(
      `SELECT * FROM status_viewer_campaigns WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (campaignResult.rows.length === 0) return res.status(404).json({ error: 'אין קמפיין' });

    const { connection_id, started_at, ends_at } = campaignResult.rows[0];

    const [totalStatuses, viewedStatuses, reactions, replies] = await Promise.all([
      db.query(`
        SELECT COUNT(*) as count FROM status_bot_statuses
        WHERE connection_id = $1 AND sent_at >= $2 AND sent_at <= $3 AND deleted_at IS NULL
      `, [connection_id, started_at, ends_at]),

      db.query(`
        SELECT
          sbs.id, sbs.status_type, sbs.sent_at, sbs.content,
          sbv.viewed_at,
          sbs.view_count, sbs.reaction_count, sbs.reply_count
        FROM status_bot_views sbv
        JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
        WHERE sbs.connection_id = $1
          AND sbv.viewer_phone = $2
          AND sbv.viewed_at >= $3 AND sbv.viewed_at <= $4
        ORDER BY sbv.viewed_at DESC
      `, [connection_id, phone, started_at, ends_at]),

      db.query(`
        SELECT sbr.reaction, sbr.reacted_at, sbs.id as status_id
        FROM status_bot_reactions sbr
        JOIN status_bot_statuses sbs ON sbr.status_id = sbs.id
        WHERE sbs.connection_id = $1 AND sbr.reactor_phone = $2
        ORDER BY sbr.reacted_at DESC
      `, [connection_id, phone]),

      db.query(`
        SELECT sbr.reply_text, sbr.replied_at, sbs.id as status_id
        FROM status_bot_replies sbr
        JOIN status_bot_statuses sbs ON sbr.status_id = sbs.id
        WHERE sbs.connection_id = $1 AND sbr.replier_phone = $2
        ORDER BY sbr.replied_at DESC
      `, [connection_id, phone]),
    ]);

    const total = parseInt(totalStatuses.rows[0].count) || 0;
    const viewed = viewedStatuses.rows.length;
    const viewerName = viewedStatuses.rows[0] ? null : null; // fetched below

    // Get viewer name from most recent view
    const nameResult = await db.query(`
      SELECT MAX(sbv.viewer_name) as name FROM status_bot_views sbv
      JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
      WHERE sbs.connection_id = $1 AND sbv.viewer_phone = $2
    `, [connection_id, phone]);

    return res.json({
      phone,
      name: nameResult.rows[0]?.name || phone,
      viewedStatuses: viewed,
      totalStatuses: total,
      viewPercentage: total > 0 ? Math.round((viewed / total) * 100) : 0,
      statuses: viewedStatuses.rows,
      reactions: reactions.rows,
      replies: replies.rows,
    });
  } catch (err) {
    console.error('[ViewFilter] getViewerProfile error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת פרופיל הצופה' });
  }
}

// ─────────────────────────────────────────────
// DAILY GROWTH (for chart)
// ─────────────────────────────────────────────

async function getDailyGrowth(req, res) {
  try {
    const userId = req.user.id;
    const access = await checkSubscription(userId);
    if (!access.hasAccess) return res.status(403).json({ error: 'אין גישה לשירות', ...access });

    const campaignResult = await db.query(
      `SELECT * FROM status_viewer_campaigns WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (campaignResult.rows.length === 0) return res.json({ days: [] });

    const { connection_id, started_at, ends_at } = campaignResult.rows[0];
    // Optional: custom start date from query
    const customStart = req.query.from ? new Date(req.query.from) : new Date(started_at);
    const effectiveStart = customStart > new Date(started_at) ? customStart : new Date(started_at);

    const result = await db.query(`
      WITH daily AS (
        SELECT
          DATE(sbv.viewed_at) as day,
          COUNT(DISTINCT sbv.viewer_phone) FILTER (
            WHERE sbv.viewer_phone NOT IN (
              SELECT DISTINCT sbv2.viewer_phone
              FROM status_bot_views sbv2
              JOIN status_bot_statuses sbs2 ON sbv2.status_id = sbs2.id
              WHERE sbs2.connection_id = $1
                AND sbv2.viewed_at < sbv.viewed_at::date
                AND sbv2.viewed_at >= $2
            )
          ) as new_viewers
        FROM status_bot_views sbv
        JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
        WHERE sbs.connection_id = $1
          AND sbv.viewed_at >= $2 AND sbv.viewed_at <= $3
        GROUP BY DATE(sbv.viewed_at)
      )
      SELECT day, new_viewers,
             SUM(new_viewers) OVER (ORDER BY day) as cumulative_viewers
      FROM daily
      ORDER BY day ASC
    `, [connection_id, effectiveStart, ends_at]);

    return res.json({ days: result.rows });
  } catch (err) {
    console.error('[ViewFilter] getDailyGrowth error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת נתוני צמיחה' });
  }
}

// ─────────────────────────────────────────────
// DOWNLOAD: CONTACTS FILE (VCF / CSV)
// ─────────────────────────────────────────────

async function downloadContacts(req, res) {
  try {
    const userId = req.user.id;
    const access = await checkSubscription(userId);
    if (!access.hasAccess) return res.status(403).json({ error: 'אין גישה לשירות', ...access });

    const format = (req.query.format || 'vcf').toLowerCase();
    if (!['vcf', 'csv'].includes(format)) {
      return res.status(400).json({ error: 'פורמט לא נתמך. השתמש ב-vcf או csv' });
    }

    const campaignResult = await db.query(
      `SELECT * FROM status_viewer_campaigns WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (campaignResult.rows.length === 0) return res.status(404).json({ error: 'אין קמפיין' });

    const { connection_id, started_at, ends_at } = campaignResult.rows[0];

    const viewers = await db.query(`
      SELECT
        sbv.viewer_phone,
        MAX(sbv.viewer_name) as viewer_name,
        COUNT(DISTINCT sbv.status_id) as statuses_viewed
      FROM status_bot_views sbv
      JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
      WHERE sbs.connection_id = $1 AND sbv.viewed_at >= $2 AND sbv.viewed_at <= $3
      GROUP BY sbv.viewer_phone
      ORDER BY statuses_viewed DESC
    `, [connection_id, started_at, ends_at]);

    const date = new Date().toISOString().split('T')[0];

    if (format === 'vcf') {
      const vcf = viewers.rows.map(v => {
        const name = v.viewer_name || v.viewer_phone;
        const phone = v.viewer_phone.replace(/\D/g, '');
        return [
          'BEGIN:VCARD',
          'VERSION:3.0',
          `FN:${name}`,
          `N:${name};;;;`,
          `TEL;TYPE=CELL:+${phone}`,
          `NOTE:צפה ב-${v.statuses_viewed} סטטוסים - בוט סינון צפיות`,
          'END:VCARD',
        ].join('\r\n');
      }).join('\r\n');

      res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="viewers_${date}.vcf"`);
      return res.send(vcf);
    }

    // CSV
    const csv = [
      'שם,טלפון,סטטוסים שנצפו',
      ...viewers.rows.map(v =>
        `"${v.viewer_name || ''}","${v.viewer_phone}","${v.statuses_viewed}"`
      )
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="viewers_${date}.csv"`);
    res.send('\uFEFF' + csv); // BOM for Excel Hebrew support
  } catch (err) {
    console.error('[ViewFilter] downloadContacts error:', err);
    res.status(500).json({ error: 'שגיאה בהורדת אנשי הקשר' });
  }
}

// ─────────────────────────────────────────────
// DOWNLOAD: REPORT (CSV summary)
// ─────────────────────────────────────────────

async function downloadReport(req, res) {
  try {
    const userId = req.user.id;
    const access = await checkSubscription(userId);
    if (!access.hasAccess) return res.status(403).json({ error: 'אין גישה לשירות', ...access });

    const campaignResult = await db.query(
      `SELECT * FROM status_viewer_campaigns WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (campaignResult.rows.length === 0) return res.status(404).json({ error: 'אין קמפיין' });

    const { connection_id, started_at, ends_at } = campaignResult.rows[0];
    const customFrom = req.query.from ? new Date(req.query.from) : new Date(started_at);
    const effectiveStart = customFrom > new Date(started_at) ? customFrom : new Date(started_at);

    const [statuses, dailyGrowth, viewers] = await Promise.all([
      db.query(`
        SELECT id, status_type, sent_at, view_count, reaction_count, reply_count, content
        FROM status_bot_statuses
        WHERE connection_id = $1 AND sent_at >= $2 AND sent_at <= $3 AND deleted_at IS NULL
        ORDER BY sent_at ASC
      `, [connection_id, effectiveStart, ends_at]),

      db.query(`
        SELECT DATE(sbv.viewed_at) as day, COUNT(DISTINCT sbv.viewer_phone) as new_viewers
        FROM status_bot_views sbv
        JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
        WHERE sbs.connection_id = $1 AND sbv.viewed_at >= $2 AND sbv.viewed_at <= $3
        GROUP BY DATE(sbv.viewed_at)
        ORDER BY day ASC
      `, [connection_id, effectiveStart, ends_at]),

      db.query(`
        SELECT sbv.viewer_phone, MAX(sbv.viewer_name) as name,
               COUNT(DISTINCT sbv.status_id) as viewed
        FROM status_bot_views sbv
        JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
        WHERE sbs.connection_id = $1 AND sbv.viewed_at >= $2 AND sbv.viewed_at <= $3
        GROUP BY sbv.viewer_phone
        ORDER BY viewed DESC
      `, [connection_id, effectiveStart, ends_at]),
    ]);

    const date = new Date().toISOString().split('T')[0];

    // Build CSV with multiple sections
    const rows = [
      ['דוח סינון צפיות - בוט Botomat'],
      [`תקופה: ${effectiveStart.toLocaleDateString('he-IL')} עד ${new Date(ends_at).toLocaleDateString('he-IL')}`],
      [],
      ['=== סיכום כללי ==='],
      ['סה"כ סטטוסים', statuses.rows.length],
      ['סה"כ צופים ייחודיים', viewers.rows.length],
      [],
      ['=== צמיחת צופים יומית ==='],
      ['תאריך', 'צופים חדשים'],
      ...dailyGrowth.rows.map(r => [r.day, r.new_viewers]),
      [],
      ['=== צפיות לכל סטטוס ==='],
      ['תאריך', 'סוג', 'צפיות', 'תגובות', 'לבבות'],
      ...statuses.rows.map(s => [
        new Date(s.sent_at).toLocaleString('he-IL'),
        s.status_type,
        s.view_count,
        s.reply_count,
        s.reaction_count,
      ]),
      [],
      ['=== רשימת צופים ==='],
      ['שם', 'טלפון', 'סטטוסים שנצפו'],
      ...viewers.rows.map(v => [v.name || v.viewer_phone, v.viewer_phone, v.viewed]),
    ];

    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="view_filter_report_${date}.csv"`);
    res.send('\uFEFF' + csv);
  } catch (err) {
    console.error('[ViewFilter] downloadReport error:', err);
    res.status(500).json({ error: 'שגיאה ביצירת הדוח' });
  }
}

// ─────────────────────────────────────────────
// GOOGLE CONTACTS SYNC
// ─────────────────────────────────────────────

async function getGoogleAccounts(req, res) {
  try {
    const userId = req.user.id;
    const result = await db.query(`
      SELECT id, slot, account_email, account_name, status, updated_at
      FROM user_integrations
      WHERE user_id = $1 AND integration_type = 'google_contacts'
      ORDER BY slot ASC
    `, [userId]);
    res.json({ accounts: result.rows });
  } catch (err) {
    console.error('[ViewFilter] getGoogleAccounts error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת חשבונות Google' });
  }
}

async function syncToGoogle(req, res) {
  try {
    const userId = req.user.id;
    const access = await checkSubscription(userId);
    if (!access.hasAccess) return res.status(403).json({ error: 'אין גישה לשירות', ...access });

    const { keepExtraContacts = true, extraPhones = [] } = req.body;

    const campaignResult = await db.query(
      `SELECT * FROM status_viewer_campaigns WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (campaignResult.rows.length === 0) return res.status(404).json({ error: 'אין קמפיין' });

    const { connection_id, started_at, ends_at } = campaignResult.rows[0];

    // Get all viewers
    const viewers = await db.query(`
      SELECT sbv.viewer_phone, MAX(sbv.viewer_name) as viewer_name,
             COUNT(DISTINCT sbv.status_id) as statuses_viewed
      FROM status_bot_views sbv
      JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
      WHERE sbs.connection_id = $1 AND sbv.viewed_at >= $2 AND sbv.viewed_at <= $3
      GROUP BY sbv.viewer_phone
    `, [connection_id, started_at, ends_at]);

    if (viewers.rows.length === 0) {
      return res.json({ success: true, synced: 0, message: 'אין צופים לסנכרן' });
    }

    // Get Google accounts ordered by slot (slot 0 is primary)
    const accounts = await db.query(`
      SELECT * FROM user_integrations
      WHERE user_id = $1 AND integration_type = 'google_contacts' AND status = 'connected'
      ORDER BY slot ASC
    `, [userId]);

    if (accounts.rows.length === 0) {
      return res.status(400).json({ error: 'לא מחובר ל-Google Contacts' });
    }

    let synced = 0;
    let failed = 0;
    let accountIdx = 0;

    for (const viewer of viewers.rows) {
      if (accountIdx >= accounts.rows.length) break;

      try {
        const account = accounts.rows[accountIdx];
        const name = viewer.viewer_name || viewer.viewer_phone;
        const phone = '+' + viewer.viewer_phone.replace(/\D/g, '');

        await googleContacts.findOrCreateBySlot(userId, account.slot, {
          name,
          phone,
          notes: `צפה ב-${viewer.statuses_viewed} סטטוסים - בוט סינון צפיות`,
        });
        synced++;
      } catch (err) {
        if (err.code === 429 || err.message?.includes('quota')) {
          // Overflow to next account
          accountIdx++;
          if (accountIdx < accounts.rows.length) {
            try {
              const account = accounts.rows[accountIdx];
              await googleContacts.findOrCreateBySlot(userId, account.slot, {
                name: viewer.viewer_name || viewer.viewer_phone,
                phone: '+' + viewer.viewer_phone.replace(/\D/g, ''),
              });
              synced++;
            } catch {
              failed++;
            }
          } else {
            failed++;
          }
        } else {
          failed++;
        }
      }
    }

    // Also sync extra phones user wants to keep
    for (const phone of (extraPhones || [])) {
      try {
        await googleContacts.findOrCreateBySlot(userId, 0, { phone, name: phone });
        synced++;
      } catch {}
    }

    return res.json({
      success: true,
      synced,
      failed,
      message: `סונכרנו ${synced} אנשי קשר בהצלחה${failed > 0 ? `, ${failed} נכשלו` : ''}`,
    });
  } catch (err) {
    console.error('[ViewFilter] syncToGoogle error:', err);
    res.status(500).json({ error: 'שגיאה בסנכרון ל-Google Contacts' });
  }
}

// ─────────────────────────────────────────────
// RENEWAL PRICING
// ─────────────────────────────────────────────

async function getRenewalInfo(req, res) {
  try {
    const userId = req.user.id;
    const serviceResult = await db.query(
      `SELECT id, price, yearly_price, renewal_price, name_he FROM additional_services WHERE slug = 'view-filter-bot'`
    );
    if (serviceResult.rows.length === 0) return res.status(404).json({ error: 'שירות לא נמצא' });

    const service = serviceResult.rows[0];

    // Check if user had a previous subscription (expired or completed)
    const prevSub = await db.query(`
      SELECT * FROM user_service_subscriptions
      WHERE user_id = $1 AND service_id = $2
        AND status IN ('expired', 'cancelled', 'completed')
      ORDER BY updated_at DESC LIMIT 1
    `, [userId, service.id]);

    const prevCampaign = await db.query(
      `SELECT * FROM status_viewer_campaigns WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    const isRenewal = prevSub.rows.length > 0 || prevCampaign.rows.length > 0;
    const renewalPrice = service.renewal_price ?? service.price;

    return res.json({
      isRenewal,
      regularPrice: service.price,
      renewalPrice,
      yearlyPrice: service.yearly_price,
      serviceId: service.id,
    });
  } catch (err) {
    console.error('[ViewFilter] getRenewalInfo error:', err);
    res.status(500).json({ error: 'שגיאה' });
  }
}

module.exports = {
  getCampaign,
  startCampaign,
  getDashboardStats,
  getViewers,
  getGrayCheckmarks,
  getViewerProfile,
  getDailyGrowth,
  downloadContacts,
  downloadReport,
  getGoogleAccounts,
  syncToGoogle,
  getRenewalInfo,
};
