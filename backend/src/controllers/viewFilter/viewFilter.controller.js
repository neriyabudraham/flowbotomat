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

async function getPrimaryCampaign(userId) {
  const result = await db.query(
    `SELECT * FROM status_viewer_campaigns WHERE user_id = $1 AND is_primary = true ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function getConnectionId(userId) {
  const result = await db.query(
    `SELECT id FROM status_bot_connections WHERE user_id = $1 ORDER BY is_active DESC, created_at DESC LIMIT 1`,
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
      `SELECT * FROM status_viewer_campaigns WHERE user_id = $1 AND is_primary = true ORDER BY created_at DESC LIMIT 1`,
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
    if (!access.hasAccess) return res.status(403).json({ error: 'אין גישה לשירות', ...access });

    const { trackSince } = req.body; // null | 'all_time'

    const connectionId = await getConnectionId(userId);
    if (!connectionId) {
      return res.status(400).json({ error: 'נדרש חיבור לבוט סטטוסים. אנא הגדר חיבור תחילה.' });
    }

    const now = new Date();
    let startedAt = now;

    if (trackSince === 'all_time') {
      // Use the earliest available data point
      const [earliestCampaign, earliestView] = await Promise.all([
        db.query('SELECT MIN(started_at) as earliest FROM status_viewer_campaigns WHERE user_id = $1', [userId]),
        db.query(`
          SELECT MIN(sbv.viewed_at) as earliest
          FROM status_bot_views sbv
          JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
          WHERE sbs.connection_id = $1
        `, [connectionId]),
      ]);
      const candidates = [earliestCampaign.rows[0]?.earliest, earliestView.rows[0]?.earliest]
        .filter(Boolean).map(d => new Date(d));
      if (candidates.length > 0) {
        startedAt = candidates.reduce((a, b) => a < b ? a : b);
      }
    }

    const endsAt = new Date(startedAt.getTime() + 90 * 86400000);

    // Mark all existing campaigns as non-primary
    await db.query('UPDATE status_viewer_campaigns SET is_primary = false WHERE user_id = $1', [userId]);

    // Create new primary campaign
    // track_since stores null (regular) or the computed startedAt (for all_time mode)
    const trackSinceValue = trackSince === 'all_time' ? startedAt : null;

    const result = await db.query(`
      INSERT INTO status_viewer_campaigns (user_id, connection_id, started_at, ends_at, status, is_primary, track_since)
      VALUES ($1, $2, $3, $4, 'active', true, $5)
      RETURNING *
    `, [userId, connectionId, startedAt, endsAt, trackSinceValue]);

    const campaign = result.rows[0];
    const daysRemaining = Math.max(0, Math.ceil((endsAt - now) / 86400000));
    const daysElapsed = 90 - daysRemaining;

    return res.json({
      success: true,
      campaign: {
        ...campaign,
        daysRemaining,
        daysTotal: 90,
        daysElapsed,
        progressPercent: Math.round((daysElapsed / 90) * 100),
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
      `SELECT * FROM status_viewer_campaigns WHERE user_id = $1 AND is_primary = true ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (campaignResult.rows.length === 0) {
      return res.json({ hasCampaign: false });
    }

    const campaign = campaignResult.rows[0];
    const { started_at, ends_at } = campaign;
    const now = new Date();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const daysRemaining = Math.max(0, Math.ceil((new Date(ends_at) - now) / 86400000));

    // Use all user connections for queries (not limited to campaign's connection_id)
    const [totalViewers, newToday, newThisWeek, totalStatuses, avgViews, totalGrayCheckmarks] = await Promise.all([
      // Total unique viewers (all time, all connections)
      db.query(`
        SELECT COUNT(DISTINCT sbv.viewer_phone) as count
        FROM status_bot_views sbv
        JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
        JOIN status_bot_connections conn ON sbs.connection_id = conn.id
        WHERE conn.user_id = $1
      `, [userId]),

      // New viewers today (first seen today, all connections)
      db.query(`
        SELECT COUNT(DISTINCT viewer_phone) as count FROM (
          SELECT sbv.viewer_phone, MIN(sbv.viewed_at) as first_seen
          FROM status_bot_views sbv
          JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
          JOIN status_bot_connections conn ON sbs.connection_id = conn.id
          WHERE conn.user_id = $1
          GROUP BY sbv.viewer_phone
        ) t WHERE t.first_seen >= $2
      `, [userId, todayStart]),

      // New viewers this week (first seen in last 7 days, all connections)
      db.query(`
        SELECT COUNT(DISTINCT viewer_phone) as count FROM (
          SELECT sbv.viewer_phone, MIN(sbv.viewed_at) as first_seen
          FROM status_bot_views sbv
          JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
          JOIN status_bot_connections conn ON sbs.connection_id = conn.id
          WHERE conn.user_id = $1
          GROUP BY sbv.viewer_phone
        ) t WHERE t.first_seen >= $2
      `, [userId, weekAgo]),

      // Total statuses (all connections)
      db.query(`
        SELECT COUNT(*) as count FROM status_bot_statuses sbs
        JOIN status_bot_connections conn ON sbs.connection_id = conn.id
        WHERE conn.user_id = $1 AND sbs.deleted_at IS NULL
      `, [userId]),

      // Average views per status (all connections)
      db.query(`
        SELECT COALESCE(AVG(sbs.view_count), 0)::numeric(10,1) as avg
        FROM status_bot_statuses sbs
        JOIN status_bot_connections conn ON sbs.connection_id = conn.id
        WHERE conn.user_id = $1 AND sbs.deleted_at IS NULL
      `, [userId]),

      // Gray checkmarks (reacted or replied but no view, all connections)
      db.query(`
        SELECT COUNT(DISTINCT phone) as count FROM (
          SELECT sbr.reactor_phone as phone
          FROM status_bot_reactions sbr
          JOIN status_bot_statuses sbs ON sbr.status_id = sbs.id
          JOIN status_bot_connections conn ON sbs.connection_id = conn.id
          WHERE conn.user_id = $1
            AND sbr.reactor_phone NOT IN (
              SELECT DISTINCT sbv2.viewer_phone
              FROM status_bot_views sbv2
              JOIN status_bot_statuses sbs2 ON sbv2.status_id = sbs2.id
              JOIN status_bot_connections conn2 ON sbs2.connection_id = conn2.id
              WHERE conn2.user_id = $1
            )
          UNION
          SELECT sbr2.replier_phone as phone
          FROM status_bot_replies sbr2
          JOIN status_bot_statuses sbs2 ON sbr2.status_id = sbs2.id
          JOIN status_bot_connections conn2 ON sbs2.connection_id = conn2.id
          WHERE conn2.user_id = $1
            AND sbr2.replier_phone NOT IN (
              SELECT DISTINCT sbv3.viewer_phone
              FROM status_bot_views sbv3
              JOIN status_bot_statuses sbs3 ON sbv3.status_id = sbs3.id
              JOIN status_bot_connections conn3 ON sbs3.connection_id = conn3.id
              WHERE conn3.user_id = $1
            )
        ) gc
      `, [userId]),
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
      `SELECT * FROM status_viewer_campaigns WHERE user_id = $1 AND is_primary = true ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (campaignResult.rows.length === 0) {
      return res.json({ viewers: [] });
    }

    // Pagination + filtering
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;
    const search = req.query.search?.trim() || '';
    const sortBy = ['statuses_viewed', 'view_percentage', 'first_seen', 'last_seen', 'viewer_name'].includes(req.query.sort)
      ? req.query.sort : 'statuses_viewed';
    const sortDir = req.query.dir === 'asc' ? 'ASC' : 'DESC';

    // Query across ALL user connections (not limited to campaign's connection_id)
    // This ensures historical views from previous connections are included
    const totalStatusesResult = await db.query(`
      SELECT COUNT(*) as count
      FROM status_bot_statuses sbs
      JOIN status_bot_connections conn ON sbs.connection_id = conn.id
      WHERE conn.user_id = $1 AND sbs.deleted_at IS NULL
    `, [userId]);
    const totalStatuses = parseInt(totalStatusesResult.rows[0].count) || 1;

    const params = [userId, totalStatuses];
    const havingClause = search
      ? `HAVING (sbv.viewer_phone ILIKE $3 OR MAX(sbv.viewer_name) ILIKE $3)`
      : '';
    if (search) params.push(`%${search}%`);

    const viewersResult = await db.query(`
      SELECT
        sbv.viewer_phone,
        MAX(sbv.viewer_name) as viewer_name,
        COUNT(DISTINCT sbv.status_id) as statuses_viewed,
        $2::int as total_statuses,
        ROUND(COUNT(DISTINCT sbv.status_id)::numeric / $2 * 100) as view_percentage,
        MIN(sbv.viewed_at) as first_seen,
        MAX(sbv.viewed_at) as last_seen,
        EXISTS(
          SELECT 1 FROM status_bot_reactions sbr2
          JOIN status_bot_statuses sbs2 ON sbr2.status_id = sbs2.id
          JOIN status_bot_connections conn2 ON sbs2.connection_id = conn2.id
          WHERE conn2.user_id = $1 AND sbr2.reactor_phone = sbv.viewer_phone
        ) as has_reaction,
        EXISTS(
          SELECT 1 FROM status_bot_replies sbr3
          JOIN status_bot_statuses sbs3 ON sbr3.status_id = sbs3.id
          JOIN status_bot_connections conn3 ON sbs3.connection_id = conn3.id
          WHERE conn3.user_id = $1 AND sbr3.replier_phone = sbv.viewer_phone
        ) as has_reply
      FROM status_bot_views sbv
      JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
      JOIN status_bot_connections conn ON sbs.connection_id = conn.id
      WHERE conn.user_id = $1
      GROUP BY sbv.viewer_phone
      ${havingClause}
      ORDER BY ${sortBy} ${sortDir} NULLS LAST
      LIMIT ${limit} OFFSET ${offset}
    `, params);

    // Total count for pagination
    const countResult = await db.query(`
      SELECT COUNT(DISTINCT sbv.viewer_phone) as count
      FROM status_bot_views sbv
      JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
      JOIN status_bot_connections conn ON sbs.connection_id = conn.id
      WHERE conn.user_id = $1
    `, [userId]);

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
      `SELECT * FROM status_viewer_campaigns WHERE user_id = $1 AND is_primary = true ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (campaignResult.rows.length === 0) return res.json({ grayCheckmarks: [] });

    const result = await db.query(`
      SELECT phone, name, type FROM (
        SELECT DISTINCT
          sbr.reactor_phone as phone,
          MAX(sbr.reactor_name) as name,
          'reaction' as type
        FROM status_bot_reactions sbr
        JOIN status_bot_statuses sbs ON sbr.status_id = sbs.id
        JOIN status_bot_connections conn ON sbs.connection_id = conn.id
        WHERE conn.user_id = $1
          AND sbr.reactor_phone NOT IN (
            SELECT DISTINCT sbv.viewer_phone
            FROM status_bot_views sbv
            JOIN status_bot_statuses sbs2 ON sbv.status_id = sbs2.id
            JOIN status_bot_connections conn2 ON sbs2.connection_id = conn2.id
            WHERE conn2.user_id = $1
          )
        GROUP BY sbr.reactor_phone
        UNION
        SELECT DISTINCT
          sbr2.replier_phone as phone,
          MAX(sbr2.replier_name) as name,
          'reply' as type
        FROM status_bot_replies sbr2
        JOIN status_bot_statuses sbs2 ON sbr2.status_id = sbs2.id
        JOIN status_bot_connections conn2 ON sbs2.connection_id = conn2.id
        WHERE conn2.user_id = $1
          AND sbr2.replier_phone NOT IN (
            SELECT DISTINCT sbv2.viewer_phone
            FROM status_bot_views sbv2
            JOIN status_bot_statuses sbs3 ON sbv2.status_id = sbs3.id
            JOIN status_bot_connections conn3 ON sbs3.connection_id = conn3.id
            WHERE conn3.user_id = $1
          )
        GROUP BY sbr2.replier_phone
      ) gc
      ORDER BY name ASC
    `, [userId]);

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
      `SELECT * FROM status_viewer_campaigns WHERE user_id = $1 AND is_primary = true ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (campaignResult.rows.length === 0) return res.status(404).json({ error: 'אין קמפיין' });

    // Query across ALL user connections
    const [totalStatuses, viewedStatuses, reactions, replies, nameResult] = await Promise.all([
      db.query(`
        SELECT COUNT(*) as count FROM status_bot_statuses sbs
        JOIN status_bot_connections conn ON sbs.connection_id = conn.id
        WHERE conn.user_id = $1 AND sbs.deleted_at IS NULL
      `, [userId]),

      db.query(`
        SELECT
          sbs.id, sbs.status_type, sbs.sent_at, sbs.content,
          sbv.viewed_at, sbs.view_count, sbs.reaction_count, sbs.reply_count
        FROM status_bot_views sbv
        JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
        JOIN status_bot_connections conn ON sbs.connection_id = conn.id
        WHERE conn.user_id = $1 AND sbv.viewer_phone = $2
        ORDER BY sbv.viewed_at DESC
      `, [userId, phone]),

      db.query(`
        SELECT sbr.reaction, sbr.reacted_at, sbs.id as status_id
        FROM status_bot_reactions sbr
        JOIN status_bot_statuses sbs ON sbr.status_id = sbs.id
        JOIN status_bot_connections conn ON sbs.connection_id = conn.id
        WHERE conn.user_id = $1 AND sbr.reactor_phone = $2
        ORDER BY sbr.reacted_at DESC
      `, [userId, phone]),

      db.query(`
        SELECT sbr.reply_text, sbr.replied_at, sbs.id as status_id
        FROM status_bot_replies sbr
        JOIN status_bot_statuses sbs ON sbr.status_id = sbs.id
        JOIN status_bot_connections conn ON sbs.connection_id = conn.id
        WHERE conn.user_id = $1 AND sbr.replier_phone = $2
        ORDER BY sbr.replied_at DESC
      `, [userId, phone]),

      db.query(`
        SELECT MAX(sbv.viewer_name) as name FROM status_bot_views sbv
        JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
        JOIN status_bot_connections conn ON sbs.connection_id = conn.id
        WHERE conn.user_id = $1 AND sbv.viewer_phone = $2
      `, [userId, phone]),
    ]);

    const total = parseInt(totalStatuses.rows[0].count) || 0;
    const viewed = viewedStatuses.rows.length;

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
      `SELECT * FROM status_viewer_campaigns WHERE user_id = $1 AND is_primary = true ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (campaignResult.rows.length === 0) return res.json({ days: [] });

    // Optimized: find each viewer's first appearance across ALL user connections
    const result = await db.query(`
      WITH first_views AS (
        SELECT sbv.viewer_phone, DATE(MIN(sbv.viewed_at)) AS day
        FROM status_bot_views sbv
        JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
        JOIN status_bot_connections conn ON sbs.connection_id = conn.id
        WHERE conn.user_id = $1
        GROUP BY sbv.viewer_phone
      )
      SELECT
        day,
        COUNT(*) AS new_viewers,
        SUM(COUNT(*)) OVER (ORDER BY day) AS cumulative_viewers
      FROM first_views
      GROUP BY day
      ORDER BY day ASC
    `, [userId]);

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
      `SELECT * FROM status_viewer_campaigns WHERE user_id = $1 AND is_primary = true ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (campaignResult.rows.length === 0) return res.status(404).json({ error: 'אין קמפיין' });

    const viewers = await db.query(`
      SELECT
        sbv.viewer_phone,
        MAX(sbv.viewer_name) as viewer_name,
        COUNT(DISTINCT sbv.status_id) as statuses_viewed
      FROM status_bot_views sbv
      JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
      JOIN status_bot_connections conn ON sbs.connection_id = conn.id
      WHERE conn.user_id = $1
      GROUP BY sbv.viewer_phone
      ORDER BY statuses_viewed DESC
    `, [userId]);

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
      `SELECT * FROM status_viewer_campaigns WHERE user_id = $1 AND is_primary = true ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (campaignResult.rows.length === 0) return res.status(404).json({ error: 'אין קמפיין' });

    // Query across all user connections
    const [statuses, dailyGrowth, viewers] = await Promise.all([
      db.query(`
        SELECT sbs.id, sbs.status_type, sbs.sent_at, sbs.view_count, sbs.reaction_count, sbs.reply_count, sbs.content
        FROM status_bot_statuses sbs
        JOIN status_bot_connections conn ON sbs.connection_id = conn.id
        WHERE conn.user_id = $1 AND sbs.deleted_at IS NULL
        ORDER BY sbs.sent_at ASC
      `, [userId]),

      db.query(`
        SELECT DATE(sbv.viewed_at) as day, COUNT(DISTINCT sbv.viewer_phone) as new_viewers
        FROM status_bot_views sbv
        JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
        JOIN status_bot_connections conn ON sbs.connection_id = conn.id
        WHERE conn.user_id = $1
        GROUP BY DATE(sbv.viewed_at)
        ORDER BY day ASC
      `, [userId]),

      db.query(`
        SELECT sbv.viewer_phone, MAX(sbv.viewer_name) as name,
               COUNT(DISTINCT sbv.status_id) as viewed
        FROM status_bot_views sbv
        JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
        JOIN status_bot_connections conn ON sbs.connection_id = conn.id
        WHERE conn.user_id = $1
        GROUP BY sbv.viewer_phone
        ORDER BY viewed DESC
      `, [userId]),
    ]);

    const date = new Date().toISOString().split('T')[0];

    // Build CSV with multiple sections
    const rows = [
      ['דוח סינון צפיות - בוט Botomat'],
      [`הופק: ${new Date().toLocaleDateString('he-IL')}`],
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
      `SELECT * FROM status_viewer_campaigns WHERE user_id = $1 AND is_primary = true ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (campaignResult.rows.length === 0) return res.status(404).json({ error: 'אין קמפיין' });

    // Get all viewers across ALL user connections
    const viewers = await db.query(`
      SELECT sbv.viewer_phone, MAX(sbv.viewer_name) as viewer_name,
             COUNT(DISTINCT sbv.status_id) as statuses_viewed
      FROM status_bot_views sbv
      JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
      JOIN status_bot_connections conn ON sbs.connection_id = conn.id
      WHERE conn.user_id = $1
      GROUP BY sbv.viewer_phone
    `, [userId]);

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
// GOOGLE AUTH URL (for connecting additional accounts)
// ─────────────────────────────────────────────

async function getGoogleAuthUrl(req, res) {
  try {
    const userId = req.user.id;

    // Find next available slot
    const slotResult = await db.query(
      `SELECT COALESCE(MAX(slot) + 1, 0) as next_slot FROM user_integrations WHERE user_id = $1 AND integration_type = 'google_contacts'`,
      [userId]
    );
    const nextSlot = slotResult.rows[0].next_slot;

    const googleContactsService = require('../../services/googleContacts.service');
    const url = googleContactsService.getAuthUrl(userId, 'view-filter', nextSlot);
    res.json({ url, slot: nextSlot });
  } catch (err) {
    console.error('[ViewFilter] getGoogleAuthUrl error:', err);
    res.status(500).json({ error: 'שגיאה ביצירת קישור חיבור' });
  }
}

// ─────────────────────────────────────────────
// VIEWER CERTIFICATE (HTML)
// ─────────────────────────────────────────────

async function downloadViewerCertificate(req, res) {
  try {
    const userId = req.user.id;
    const access = await checkSubscription(userId);
    if (!access.hasAccess) return res.status(403).json({ error: 'אין גישה לשירות', ...access });

    const { phone } = req.params;

    const campaignResult = await db.query(
      `SELECT * FROM status_viewer_campaigns WHERE user_id = $1 AND is_primary = true ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (campaignResult.rows.length === 0) return res.status(404).json({ error: 'אין קמפיין' });

    // Query across ALL user connections
    const [totalResult, viewedResult, nameResult] = await Promise.all([
      db.query(`
        SELECT COUNT(*) as count FROM status_bot_statuses sbs
        JOIN status_bot_connections conn ON sbs.connection_id = conn.id
        WHERE conn.user_id = $1 AND sbs.deleted_at IS NULL
      `, [userId]),

      db.query(`
        SELECT COUNT(DISTINCT sbv.status_id) as count, MIN(sbv.viewed_at) as first_seen, MAX(sbv.viewed_at) as last_seen
        FROM status_bot_views sbv
        JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
        JOIN status_bot_connections conn ON sbs.connection_id = conn.id
        WHERE conn.user_id = $1 AND sbv.viewer_phone = $2
      `, [userId, phone]),

      db.query(`
        SELECT MAX(sbv.viewer_name) as name FROM status_bot_views sbv
        JOIN status_bot_statuses sbs ON sbv.status_id = sbs.id
        JOIN status_bot_connections conn ON sbs.connection_id = conn.id
        WHERE conn.user_id = $1 AND sbv.viewer_phone = $2
      `, [userId, phone]),
    ]);

    const total = parseInt(totalResult.rows[0].count) || 0;
    const viewed = parseInt(viewedResult.rows[0].count) || 0;
    const viewPercentage = total > 0 ? Math.round((viewed / total) * 100) : 0;
    const name = nameResult.rows[0]?.name || phone;
    const firstSeen = viewedResult.rows[0]?.first_seen;
    const lastSeen = viewedResult.rows[0]?.last_seen;
    const issueDate = new Date().toLocaleDateString('he-IL');

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>תעודת צפיות - ${name}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;900&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Heebo', Arial, sans-serif; background: #f3f4f6; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px; }
  .certificate { background: white; width: 800px; padding: 50px 60px; position: relative; box-shadow: 0 20px 60px rgba(0,0,0,0.15); border-radius: 16px; overflow: hidden; }
  .top-bar { position: absolute; top: 0; left: 0; right: 0; height: 8px; background: linear-gradient(90deg, #7c3aed, #8b5cf6, #a78bfa); }
  .bg-circle1 { position: absolute; top: -80px; left: -80px; width: 250px; height: 250px; border-radius: 50%; background: rgba(139,92,246,0.05); pointer-events: none; }
  .bg-circle2 { position: absolute; bottom: -60px; right: -60px; width: 200px; height: 200px; border-radius: 50%; background: rgba(139,92,246,0.05); pointer-events: none; }
  .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 36px; }
  .logo { font-size: 22px; font-weight: 900; color: #7c3aed; letter-spacing: -0.5px; }
  .logo span { color: #a78bfa; }
  .badge { background: linear-gradient(135deg, #7c3aed, #8b5cf6); color: white; padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 600; }
  .title-section { text-align: center; margin-bottom: 28px; }
  .title-en { font-size: 12px; color: #9ca3af; font-weight: 400; letter-spacing: 4px; margin-bottom: 8px; }
  .title-main { font-size: 38px; font-weight: 900; color: #1f2937; }
  .title-sub { font-size: 14px; color: #6b7280; margin-top: 6px; }
  hr { border: none; height: 1px; background: linear-gradient(90deg, transparent, #e5e7eb, transparent); margin: 24px 0; }
  .viewer-section { text-align: center; margin-bottom: 28px; }
  .viewer-label { font-size: 11px; color: #9ca3af; font-weight: 500; letter-spacing: 3px; margin-bottom: 8px; }
  .viewer-name { font-size: 30px; font-weight: 700; color: #7c3aed; margin-bottom: 4px; }
  .viewer-phone { font-size: 14px; color: #9ca3af; direction: ltr; }
  .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 24px 0; }
  .stat-box { background: #f5f3ff; border-radius: 12px; padding: 20px; text-align: center; border: 1px solid #ede9fe; }
  .stat-value { font-size: 34px; font-weight: 900; color: #7c3aed; line-height: 1; }
  .stat-label { font-size: 11px; color: #6b7280; margin-top: 6px; font-weight: 500; }
  .dates-row { display: flex; justify-content: center; gap: 48px; margin: 20px 0; }
  .date-item { text-align: center; }
  .date-label { font-size: 11px; color: #9ca3af; margin-bottom: 4px; }
  .date-value { font-size: 14px; font-weight: 600; color: #374151; }
  .footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 32px; }
  .footer-left { display: flex; flex-direction: column; gap: 8px; }
  .verified { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 8px 14px; display: inline-flex; align-items: center; gap: 6px; }
  .verified-dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; flex-shrink: 0; }
  .verified-text { font-size: 11px; color: #15803d; font-weight: 500; }
  .issue-date { font-size: 11px; color: #9ca3af; }
  .seal { text-align: center; }
  .seal-circle { width: 72px; height: 72px; border-radius: 50%; border: 2px solid #e5e7eb; display: flex; align-items: center; justify-content: center; margin: 0 auto 6px; }
  .seal-text { font-size: 9px; color: #9ca3af; text-align: center; line-height: 1.4; }
  @media print { body { background: white; padding: 0; } .certificate { box-shadow: none; border-radius: 0; } }
</style>
</head>
<body>
<div class="certificate">
  <div class="top-bar"></div>
  <div class="bg-circle1"></div>
  <div class="bg-circle2"></div>

  <div class="header">
    <div class="logo">בוט<span>ומט</span></div>
    <div class="badge">תעודה מאומתת</div>
  </div>

  <div class="title-section">
    <div class="title-en">CERTIFICATE OF VIEWS</div>
    <div class="title-main">תעודת צפיות</div>
    <div class="title-sub">מאשר בזאת צפייה בסטטוסי WhatsApp</div>
  </div>

  <hr>

  <div class="viewer-section">
    <div class="viewer-label">הוענקה ל</div>
    <div class="viewer-name">${name}</div>
    <div class="viewer-phone">${phone}</div>
  </div>

  <div class="stats-grid">
    <div class="stat-box">
      <div class="stat-value">${viewed}</div>
      <div class="stat-label">סטטוסים שנצפו</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${viewPercentage}%</div>
      <div class="stat-label">מסך הסטטוסים</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${total}</div>
      <div class="stat-label">סה"כ סטטוסים</div>
    </div>
  </div>

  <div class="dates-row">
    <div class="date-item">
      <div class="date-label">צפייה ראשונה</div>
      <div class="date-value">${firstSeen ? new Date(firstSeen).toLocaleDateString('he-IL') : '—'}</div>
    </div>
    <div class="date-item">
      <div class="date-label">צפייה אחרונה</div>
      <div class="date-value">${lastSeen ? new Date(lastSeen).toLocaleDateString('he-IL') : '—'}</div>
    </div>
  </div>

  <hr>

  <div class="footer">
    <div class="footer-left">
      <div class="verified">
        <div class="verified-dot"></div>
        <div class="verified-text">מאומת על ידי מערכת Botomat</div>
      </div>
      <div class="issue-date">הונפקה: ${issueDate}</div>
    </div>
    <div class="seal">
      <div class="seal-circle">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <path d="m9 12 2 2 4-4"/>
        </svg>
      </div>
      <div class="seal-text">BOTOMAT<br>VERIFIED</div>
    </div>
  </div>
</div>
<script>window.onload = () => window.print();</script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err) {
    console.error('[ViewFilter] downloadViewerCertificate error:', err);
    res.status(500).json({ error: 'שגיאה ביצירת התעודה' });
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

// ─────────────────────────────────────────────
// MULTI-CAMPAIGN MANAGEMENT
// ─────────────────────────────────────────────

async function getCampaigns(req, res) {
  try {
    const userId = req.user.id;
    const access = await checkSubscription(userId);
    if (!access.hasAccess) return res.status(403).json({ error: 'אין גישה', ...access });

    const result = await db.query(
      `SELECT * FROM status_viewer_campaigns WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    return res.json({ campaigns: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'שגיאה' });
  }
}

async function setPrimary(req, res) {
  try {
    const userId = req.user.id;
    const { campaignId } = req.params;

    const check = await db.query(
      'SELECT id FROM status_viewer_campaigns WHERE id = $1 AND user_id = $2',
      [campaignId, userId]
    );
    if (!check.rows.length) return res.status(404).json({ error: 'לא נמצא' });

    await db.query('UPDATE status_viewer_campaigns SET is_primary = false WHERE user_id = $1', [userId]);
    await db.query('UPDATE status_viewer_campaigns SET is_primary = true WHERE id = $1', [campaignId]);

    return res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'שגיאה' });
  }
}

async function closeCampaign(req, res) {
  try {
    const userId = req.user.id;
    const { campaignId } = req.params;

    const check = await db.query(
      'SELECT id FROM status_viewer_campaigns WHERE id = $1 AND user_id = $2',
      [campaignId, userId]
    );
    if (!check.rows.length) return res.status(404).json({ error: 'לא נמצא' });

    await db.query(
      `UPDATE status_viewer_campaigns SET status = 'completed' WHERE id = $1`,
      [campaignId]
    );
    return res.json({ success: true });
  } catch (err) {
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
  getGoogleAuthUrl,
  syncToGoogle,
  downloadViewerCertificate,
  getRenewalInfo,
  getCampaigns,
  setPrimary,
  closeCampaign,
};
