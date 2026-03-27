const db = require('../config/database');

class ExecutionTracker {
  /**
   * Start a new execution run
   */
  async startRun(botId, contactId, triggerNodeId, triggerMessage, flowData, contactVariables = {}) {
    try {
      const result = await db.query(
        `INSERT INTO bot_execution_runs (bot_id, contact_id, trigger_node_id, trigger_message, status, flow_snapshot, variables_snapshot, started_at)
         VALUES ($1, $2, $3, $4, 'running', $5, $6, NOW())
         RETURNING id`,
        [botId, contactId, triggerNodeId, triggerMessage, JSON.stringify(flowData), JSON.stringify(contactVariables)]
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
