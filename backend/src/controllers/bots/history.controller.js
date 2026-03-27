const db = require('../../config/database');
const { checkBotAccess } = require('./list.controller');

/**
 * Get execution history for a bot (list of runs)
 * Supports: text search, date range, status filter, contact filter
 */
async function getExecutionHistory(req, res) {
  try {
    const { botId } = req.params;
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;
    const statusFilter = req.query.status || null;
    const contactFilter = req.query.contact_id || null;
    const search = req.query.search || null;
    const dateFrom = req.query.date_from || null;
    const dateTo = req.query.date_to || null;

    const access = await checkBotAccess(userId, botId);
    if (!access.hasAccess) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    let whereClause = 'WHERE r.bot_id = $1';
    const params = [botId];
    let paramIdx = 2;

    if (statusFilter) {
      whereClause += ` AND r.status = $${paramIdx}`;
      params.push(statusFilter);
      paramIdx++;
    }
    if (contactFilter) {
      whereClause += ` AND r.contact_id = $${paramIdx}`;
      params.push(contactFilter);
      paramIdx++;
    }
    if (dateFrom) {
      whereClause += ` AND r.started_at >= $${paramIdx}`;
      params.push(dateFrom);
      paramIdx++;
    }
    if (dateTo) {
      whereClause += ` AND r.started_at <= $${paramIdx}`;
      params.push(dateTo);
      paramIdx++;
    }
    if (search) {
      // Search in trigger_message, error_message, contact name/phone, and step data
      whereClause += ` AND (
        r.trigger_message::text ILIKE $${paramIdx}
        OR r.error_message ILIKE $${paramIdx}
        OR c.phone ILIKE $${paramIdx}
        OR c.display_name ILIKE $${paramIdx}
        OR EXISTS (
          SELECT 1 FROM bot_execution_steps s
          WHERE s.run_id = r.id AND (
            s.output_data::text ILIKE $${paramIdx}
            OR s.input_data::text ILIKE $${paramIdx}
            OR s.error_message ILIKE $${paramIdx}
            OR s.node_label ILIKE $${paramIdx}
          )
        )
      )`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    const result = await db.query(
      `SELECT r.id, r.bot_id, r.contact_id, r.trigger_node_id, r.trigger_message,
              r.status, r.error_message, r.started_at, r.completed_at, r.duration_ms,
              c.phone as contact_phone, c.display_name as contact_name,
              (SELECT COUNT(*) FROM bot_execution_steps s WHERE s.run_id = r.id) as step_count,
              (SELECT COUNT(*) FROM bot_execution_steps s WHERE s.run_id = r.id AND s.status = 'error') as error_step_count
       FROM bot_execution_runs r
       LEFT JOIN contacts c ON r.contact_id = c.id
       ${whereClause}
       ORDER BY r.started_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM bot_execution_runs r LEFT JOIN contacts c ON r.contact_id = c.id ${whereClause}`,
      params
    );

    // Get status counts for filters
    const statusCounts = await db.query(
      `SELECT status, COUNT(*) as count FROM bot_execution_runs WHERE bot_id = $1 GROUP BY status`,
      [botId]
    );

    res.json({
      runs: result.rows,
      total: parseInt(countResult.rows[0].total),
      page,
      totalPages: Math.ceil(countResult.rows[0].total / limit),
      statusCounts: Object.fromEntries(statusCounts.rows.map(r => [r.status, parseInt(r.count)])),
    });
  } catch (error) {
    console.error('Get execution history error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

/**
 * Get single execution run with all steps
 */
async function getExecutionRun(req, res) {
  try {
    const { botId, runId } = req.params;
    const userId = req.user.id;

    const access = await checkBotAccess(userId, botId);
    if (!access.hasAccess) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    // Get run
    const runResult = await db.query(
      `SELECT r.*, c.phone as contact_phone, c.display_name as contact_name
       FROM bot_execution_runs r
       LEFT JOIN contacts c ON r.contact_id = c.id
       WHERE r.id = $1 AND r.bot_id = $2`,
      [runId, botId]
    );

    if (runResult.rows.length === 0) {
      return res.status(404).json({ error: 'Run not found' });
    }

    const run = runResult.rows[0];

    // Get steps
    const stepsResult = await db.query(
      `SELECT * FROM bot_execution_steps WHERE run_id = $1 ORDER BY step_order ASC`,
      [runId]
    );

    res.json({
      run: {
        ...run,
        steps: stepsResult.rows,
      },
    });
  } catch (error) {
    console.error('Get execution run error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

/**
 * Re-run a bot execution for a specific contact
 */
async function rerunExecution(req, res) {
  try {
    const { botId, runId } = req.params;
    const userId = req.user.id;

    const access = await checkBotAccess(userId, botId);
    const canEdit = access.hasAccess && (access.isOwner || access.permission === 'edit' || access.permission === 'admin');
    if (!canEdit) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get original run
    const runResult = await db.query(
      `SELECT r.*, c.phone as contact_phone FROM bot_execution_runs r
       LEFT JOIN contacts c ON r.contact_id = c.id
       WHERE r.id = $1 AND r.bot_id = $2`,
      [runId, botId]
    );

    if (runResult.rows.length === 0) {
      return res.status(404).json({ error: 'Run not found' });
    }

    const originalRun = runResult.rows[0];

    if (!originalRun.contact_id) {
      return res.status(400).json({ error: 'לא ניתן להריץ מחדש - איש קשר לא נמצא' });
    }

    // Get current bot flow data
    const botResult = await db.query('SELECT * FROM bots WHERE id = $1', [botId]);
    if (botResult.rows.length === 0) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    const bot = botResult.rows[0];

    // Get contact
    const contactResult = await db.query('SELECT * FROM contacts WHERE id = $1', [originalRun.contact_id]);
    if (contactResult.rows.length === 0) {
      return res.status(400).json({ error: 'איש הקשר לא נמצא יותר במערכת' });
    }
    const contact = contactResult.rows[0];

    // Get the BotEngine and execute
    const BotEngine = require('../../services/botEngine.service');
    const triggerMessage = typeof originalRun.trigger_message === 'string' ? originalRun.trigger_message : '';

    // Process the bot directly (skip trigger matching)
    const flowData = bot.flow_data;
    if (!flowData?.nodes?.length) {
      return res.status(400).json({ error: 'הבוט ריק - אין רכיבים להפעלה' });
    }

    const triggerNode = flowData.nodes.find(n => n.type === 'trigger');
    if (!triggerNode) {
      return res.status(400).json({ error: 'לא נמצא טריגר בבוט' });
    }

    const nextEdges = flowData.edges.filter(e => e.source === triggerNode.id);
    if (nextEdges.length === 0) {
      return res.status(400).json({ error: 'אין רכיבים מחוברים לטריגר' });
    }

    // Start execution tracking
    const executionTracker = require('../../services/executionTracker.service');
    let contactVars = {};
    try {
      const varsResult = await db.query('SELECT key, value FROM contact_variables WHERE contact_id = $1', [contact.id]);
      contactVars = Object.fromEntries(varsResult.rows.map(r => [r.key, r.value]));
    } catch (e) {}

    const newRunId = await executionTracker.startRun(botId, contact.id, triggerNode.id, `[הרצה מחדש] ${triggerMessage}`, flowData, contactVars);

    // Execute asynchronously
    (async () => {
      try {
        const sortedEdges = nextEdges.sort((a, b) => {
          const nodeA = flowData.nodes.find(n => n.id === a.target);
          const nodeB = flowData.nodes.find(n => n.id === b.target);
          return (nodeA?.position?.y || 0) - (nodeB?.position?.y || 0);
        });

        for (const edge of sortedEdges) {
          await BotEngine.executeNode(edge.target, flowData, contact, triggerMessage, userId, botId, bot.name, undefined, newRunId);
        }
        await executionTracker.completeRun(newRunId, 'completed');
      } catch (err) {
        console.error('[ReRun] Error:', err);
        await executionTracker.completeRun(newRunId, 'error', err.message);
      }
    })();

    res.json({
      success: true,
      runId: newRunId,
      message: 'הבוט הורץ מחדש בהצלחה',
    });
  } catch (error) {
    console.error('Re-run execution error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

/**
 * Delete old execution history (cleanup)
 */
async function deleteExecutionHistory(req, res) {
  try {
    const { botId } = req.params;
    const userId = req.user.id;
    const { days = 30 } = req.query;

    const access = await checkBotAccess(userId, botId);
    const canEdit = access.hasAccess && (access.isOwner || access.permission === 'edit' || access.permission === 'admin');
    if (!canEdit) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await db.query(
      `DELETE FROM bot_execution_runs
       WHERE bot_id = $1 AND started_at < NOW() - INTERVAL '${parseInt(days)} days'
       RETURNING id`,
      [botId]
    );

    res.json({
      deleted: result.rows.length,
      message: `נמחקו ${result.rows.length} ריצות ישנות`,
    });
  } catch (error) {
    console.error('Delete execution history error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { getExecutionHistory, getExecutionRun, rerunExecution, deleteExecutionHistory };
