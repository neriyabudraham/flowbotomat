const db = require('../../config/database');
const { checkBotAccess } = require('./list.controller');

/**
 * Get execution history for a bot (list of runs)
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

    const result = await db.query(
      `SELECT r.id, r.bot_id, r.contact_id, r.trigger_node_id, r.trigger_message,
              r.status, r.error_message, r.started_at, r.completed_at, r.duration_ms,
              c.phone as contact_phone, c.display_name as contact_name,
              (SELECT COUNT(*) FROM bot_execution_steps s WHERE s.run_id = r.id) as step_count
       FROM bot_execution_runs r
       LEFT JOIN contacts c ON r.contact_id = c.id
       ${whereClause}
       ORDER BY r.started_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM bot_execution_runs r ${whereClause}`,
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
 * Delete old execution history (cleanup)
 */
async function deleteExecutionHistory(req, res) {
  try {
    const { botId } = req.params;
    const userId = req.user.id;
    const { days = 30 } = req.query;

    const access = await checkBotAccess(userId, botId);
    if (!access.hasAccess || !access.canEdit) {
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

module.exports = { getExecutionHistory, getExecutionRun, deleteExecutionHistory };
