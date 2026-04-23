const db = require('../config/database');

class ExecutionTracker {
  /**
   * Start a new execution run
   */
  async startRun(botId, contactId, triggerNodeId, triggerMessage, flowData, contactVariables = {}, triggerDetail = null) {
    try {
      const snapshot = { ...contactVariables };
      if (triggerDetail) snapshot._triggerDetail = triggerDetail;
      const result = await db.query(
        `INSERT INTO bot_execution_runs (bot_id, contact_id, trigger_node_id, trigger_message, status, flow_snapshot, variables_snapshot, started_at)
         VALUES ($1, $2, $3, $4, 'running', $5, $6, NOW())
         RETURNING id`,
        [botId, contactId, triggerNodeId, triggerMessage, JSON.stringify(flowData), JSON.stringify(snapshot)]
      );
      return result.rows[0].id;
    } catch (err) {
      console.error('[ExecutionTracker] Failed to start run:', err.message);
      return null;
    }
  }

  /**
   * Complete an execution run
   */
  async completeRun(runId, status = 'completed', errorMessage = null) {
    if (!runId) return;
    try {
      await db.query(
        `UPDATE bot_execution_runs
         SET status = $2, error_message = $3, completed_at = NOW(),
             duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
         WHERE id = $1`,
        [runId, status, errorMessage]
      );
    } catch (err) {
      console.error('[ExecutionTracker] Failed to complete run:', err.message);
    }
  }

  /**
   * Log a step execution
   */
  async logStep(runId, nodeId, nodeType, nodeLabel, stepOrder, options = {}) {
    if (!runId) return null;
    try {
      const { inputData = {}, outputData = {}, status = 'completed', errorMessage = null, nextHandle = null, durationMs = null } = options;

      const result = await db.query(
        `INSERT INTO bot_execution_steps (run_id, node_id, node_type, node_label, step_order, status, input_data, output_data, error_message, next_handle, started_at, completed_at, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW(), $11)
         RETURNING id`,
        [runId, nodeId, nodeType, nodeLabel, stepOrder, status, JSON.stringify(inputData), JSON.stringify(outputData), errorMessage, nextHandle, durationMs]
      );
      return result.rows[0].id;
    } catch (err) {
      console.error('[ExecutionTracker] Failed to log step:', err.message);
      return null;
    }
  }

  /**
   * Mark every run still in 'running' state older than `thresholdMinutes` as
   * failed. Used on startup (previous container crashed mid-run) and on
   * graceful shutdown (we're about to exit).
   *
   * @param {object} opts
   * @param {number} [opts.thresholdMinutes=5] — how old must a 'running' row
   *        be before we consider it orphaned. On shutdown we pass 0 to mark
   *        every active run.
   * @param {string} [opts.reason] — error_message to write.
   * @returns {Promise<number>} rows cleaned.
   */
  async cleanupStaleRuns({ thresholdMinutes = 5, reason } = {}) {
    try {
      const msg = reason ||
        'הבוט נעצר באמצע ריצה — הקונטיינר אותחל מחדש (deploy/restart). רישום סגור אוטומטית.';
      const result = await db.query(
        `UPDATE bot_execution_runs
         SET status = 'failed',
             error_message = $1,
             completed_at = NOW(),
             duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
         WHERE status = 'running'
           AND started_at < NOW() - ($2 * interval '1 minute')
         RETURNING id`,
        [msg, thresholdMinutes]
      );
      if (result.rowCount > 0) {
        console.log(`[ExecutionTracker] 🧹 Cleaned up ${result.rowCount} orphaned run(s) (stuck in 'running')`);
      }
      return result.rowCount;
    } catch (err) {
      console.error('[ExecutionTracker] cleanupStaleRuns failed:', err.message);
      return 0;
    }
  }

  /**
   * Get node label based on type and data
   */
  getNodeLabel(node) {
    if (!node) return 'Unknown';
    const data = node.data || {};
    switch (node.type) {
      case 'trigger':
        return 'טריגר';
      case 'message': {
        const firstAction = (data.actions || [])[0];
        if (firstAction?.type === 'text') return `הודעה: ${(firstAction.content || '').substring(0, 40)}...`;
        if (firstAction?.type) return `הודעה: ${firstAction.type}`;
        return 'הודעה';
      }
      case 'condition':
        return 'תנאי';
      case 'delay':
        return `השהייה: ${data.delayValue || ''} ${data.delayUnit || ''}`.trim();
      case 'action': {
        const firstAct = (data.actions || [])[0];
        return firstAct?.type ? `פעולה: ${firstAct.type}` : 'פעולה';
      }
      case 'list':
        return `רשימה: ${data.title || 'ללא כותרת'}`;
      case 'registration':
        return `טופס: ${data.title || 'ללא כותרת'}`;
      case 'integration':
        return 'אינטגרציה';
      case 'google_sheets':
        return 'Google Sheets';
      case 'google_contacts':
        return 'Google Contacts';
      case 'formula':
        return 'נוסחה';
      case 'send_other':
        return 'שליחה לאחר';
      case 'note':
        return 'הערה';
      default:
        return node.type;
    }
  }
}

module.exports = new ExecutionTracker();
