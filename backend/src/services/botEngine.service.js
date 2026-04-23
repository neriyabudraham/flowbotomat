const db = require('../config/database');
const wahaService = require('./waha/session.service');
const { getWahaCredentialsForConnection } = require('./settings/system.service');
const validationService = require('./validation.service');
const { checkLimit, incrementBotRuns } = require('../controllers/subscriptions/subscriptions.controller');
const { getSocketManager } = require('./socket/manager.service');
const executionTracker = require('./executionTracker.service');
const { checkContactLimit } = require('./limits.service');

// Concurrency limiter: max 5 simultaneous processEvent calls to avoid DB pool exhaustion
let _activeEvents = 0;
const MAX_CONCURRENT_EVENTS = 5;
const _eventQueue = [];
function _runNext() {
  if (_eventQueue.length === 0 || _activeEvents >= MAX_CONCURRENT_EVENTS) return;
  const { fn, resolve, reject } = _eventQueue.shift();
  _activeEvents++;
  fn().then(resolve, reject).finally(() => { _activeEvents--; _runNext(); });
}
function withConcurrencyLimit(fn) {
  return new Promise((resolve, reject) => {
    _eventQueue.push({ fn, resolve, reject });
    _runNext();
  });
}

// Ensure metadata column exists
(async () => {
  try {
    await db.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata JSONB`);
    // metadata column ensured silently
  } catch (err) {
    // Column might already exist or table might not exist yet
  }
})();

class BotEngine {
  
  // Save outgoing message to database and emit via socket
  async saveOutgoingMessage(userId, contactId, content, messageType = 'text', mediaUrl = null, waMessageId = null, metadata = null) {
    try {
      // Extract lat/lng if present in metadata
      const latitude = metadata?.latitude || null;
      const longitude = metadata?.longitude || null;
      const filename = metadata?.filename || null;
      const mimetype = metadata?.mimetype || null;
      
      const result = await db.query(`
        INSERT INTO messages 
        (user_id, contact_id, wa_message_id, direction, message_type, content, media_url, media_filename, media_mime_type, latitude, longitude, metadata, status, sent_at)
        VALUES ($1, $2, $3, 'outgoing', $4, $5, $6, $7, $8, $9, $10, $11, 'sent', NOW())
        RETURNING *
      `, [userId, contactId, waMessageId, messageType, content, mediaUrl, filename, mimetype, latitude, longitude, metadata ? JSON.stringify(metadata) : null]);
      
      const savedMessage = result.rows[0];
      
      // Parse metadata back if stored as string
      if (savedMessage.metadata && typeof savedMessage.metadata === 'string') {
        try {
          savedMessage.metadata = JSON.parse(savedMessage.metadata);
        } catch (e) {}
      }
      
      // Get contact info for socket emission
      const contactResult = await db.query(
        'SELECT * FROM contacts WHERE id = $1',
        [contactId]
      );
      const contact = contactResult.rows[0];
      
      // Emit to frontend via socket
      const socketManager = getSocketManager();
      socketManager.emitToUser(userId, 'outgoing_message', {
        message: { ...savedMessage, from_bot: true },
        contact
      });
      
      return savedMessage;
    } catch (error) {
      console.error('[BotEngine] Error saving outgoing message:', error.message);
      return null;
    }
  }
  
  // Process incoming message
  async processMessage(userId, contactPhone, message, messageType = 'text', selectedRowId = null, quotedListTitle = null, isGroupMessage = false, groupId = null, extraContext = {}) {
    try {
      
      // Get all active AND unlocked bots for this user
      // Locked bots cannot run regardless of is_active status
      const botsResult = await db.query(
        'SELECT * FROM bots WHERE user_id = $1 AND is_active = true AND locked_reason IS NULL',
        [userId]
      );
      
      if (botsResult.rows.length === 0) {
        return;
      }
      
      // Get or create contact state
      const contactResult = await db.query(
        'SELECT * FROM contacts WHERE user_id = $1 AND phone = $2',
        [userId, contactPhone]
      );
      
      if (contactResult.rows.length === 0) {
        return;
      }
      
      const contact = contactResult.rows[0];
      
      // Check if bot is disabled for this contact
      if (!contact.is_bot_active) {
        // Check if takeover has expired
        if (contact.takeover_until && new Date(contact.takeover_until) < new Date()) {
          // Takeover expired, re-enable bot
          await db.query('UPDATE contacts SET is_bot_active = true, takeover_until = NULL WHERE id = $1', [contact.id]);
        } else {
          return;
        }
      }
      
      // Add group context to contact for variable replacement
      contact._isGroupMessage = isGroupMessage;
      contact._groupId = groupId;
      contact._senderPhone = contactPhone;
      
      // Add channel context to contact for variable replacement
      contact._isChannel = extraContext.isChannel || false;
      contact._channelId = extraContext.channelId || null;
      contact._channelName = extraContext.channelName || null;
      contact._botPhoneNumber = extraContext.botPhoneNumber || null;
      
      // Add Facebook campaign / ad info
      contact._entryPointSource = extraContext.entryPointSource || null;
      contact._externalAdReply = extraContext.externalAdReply || null;
      
      // Add media info
      contact._hasMedia = extraContext.hasMedia || false;
      contact._mediaUrl = extraContext.mediaUrl || null;
      contact._mediaType = extraContext.mediaType || null;
      
      // Process each active bot
      for (const bot of botsResult.rows) {
        await this.processBot(bot, contact, message, messageType, userId, selectedRowId, quotedListTitle, isGroupMessage, extraContext);
      }
      
    } catch (error) {
      console.error('[BotEngine] Error processing message:', error);
    }
  }
  
  // Process special events (status view, status reaction, group join/leave, calls, poll vote)
  async processEvent(userId, contactPhone, eventType, eventData = {}) {
    return withConcurrencyLimit(() => this._processEventImpl(userId, contactPhone, eventType, eventData));
  }

  async _processEventImpl(userId, contactPhone, eventType, eventData = {}) {
    try {
      // Status reaction dedup: at most one trigger per (user, reactor, status).
      // Removals (empty text) never fire; re-adds after a removal are ignored too.
      // Centralized here so every caller (webhook + status-bot controller) is covered.
      if (eventType === 'status_reaction') {
        const reactionText = (eventData.reaction || '').trim();
        if (!reactionText) return;
        const rawMsgId = eventData.messageId || '';
        const statusHex = this.extractStatusHexId(rawMsgId) || rawMsgId;
        if (!contactPhone || !statusHex) return;
        const dedup = await db.query(
          `INSERT INTO status_reaction_trigger_log (user_id, reactor_phone, status_hex_id)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING
           RETURNING 1`,
          [userId, contactPhone, statusHex]
        );
        if (dedup.rowCount === 0) return;
      }

      // For webhook events: only run the specific bot identified by botId
      // For other events: run all active bots
      let botsResult;
      if ((eventType === 'webhook' || eventType === 'bot_activated') && eventData.botId) {
        botsResult = await db.query(
          'SELECT * FROM bots WHERE user_id = $1 AND id = $2 AND is_active = true AND locked_reason IS NULL',
          [userId, eventData.botId]
        );
      } else {
        botsResult = await db.query(
          'SELECT * FROM bots WHERE user_id = $1 AND is_active = true AND locked_reason IS NULL',
          [userId]
        );
      }

      if (botsResult.rows.length === 0) {
        return;
      }

      // Get or create contact
      let contact;
      const contactResult = await db.query(
        'SELECT * FROM contacts WHERE user_id = $1 AND phone = $2',
        [userId, contactPhone]
      );

      if (contactResult.rows.length === 0) {
        console.log(`[BotEngine] processEvent(${eventType}): contact ${contactPhone} not found, creating...`);
        // For some events like group_join we may not have the contact yet
        // Check contact limit before creating new contact (skip for groups)
        const isGroup = contactPhone.includes('@g.us');
        if (!isGroup) {
          try {
            const limitCheck = await checkContactLimit(userId);
            if (!limitCheck.allowed) {
              console.log(`[BotEngine] processEvent(${eventType}): contact limit reached, skipping`);
              return;
            }
          } catch (limitErr) {
          }
        }

        // Try to create contact
        try {
          const insertResult = await db.query(
            `INSERT INTO contacts (user_id, phone, display_name)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, phone) DO UPDATE SET display_name = COALESCE(contacts.display_name, EXCLUDED.display_name)
             RETURNING *`,
            [userId, contactPhone, eventData.pushName || eventData.notify || contactPhone]
          );
          contact = insertResult.rows[0];
        } catch (insertErr) {
          console.error(`[BotEngine] processEvent(${eventType}): failed to create contact: ${insertErr.message}`);
          return;
        }
      } else {
        contact = contactResult.rows[0];
      }

      // Check if bot is disabled for this contact
      if (!contact.is_bot_active) {
        if (contact.takeover_until && new Date(contact.takeover_until) < new Date()) {
          await db.query('UPDATE contacts SET is_bot_active = true, takeover_until = NULL WHERE id = $1', [contact.id]);
        } else {
          console.log(`[BotEngine] processEvent(${eventType}): bot disabled for contact ${contactPhone} (is_bot_active=false)`);
          return;
        }
      }

      // Add event context to contact
      contact._eventType = eventType;
      contact._eventData = eventData;
      contact._isGroupMessage = !!eventData.groupId;
      contact._groupId = eventData.groupId || null;
      // Webhook payload — available as {{webhook.fieldName}} in messages
      if (eventType === 'webhook' && eventData.payload) {
        contact._webhookPayload = eventData.payload;
      }

      // Process each active bot
      for (const bot of botsResult.rows) {
        await this.processEventBot(bot, contact, eventType, eventData, userId);
      }
      
    } catch (error) {
      console.error('[BotEngine] Error processing event:', error);
    }
  }
  
  // Process single bot for special events
  async processEventBot(bot, contact, eventType, eventData, userId) {
    try {
      // Check if this specific bot is disabled for this contact
      try {
        const disabledCheck = await db.query(
          'SELECT id FROM contact_disabled_bots WHERE contact_id = $1 AND bot_id = $2',
          [contact.id, bot.id]
        );
        if (disabledCheck.rows.length > 0) {
          return;
        }
      } catch (disabledErr) {
        // Table may not exist yet - that's fine, no bots are disabled
      }
      
      const flowData = bot.flow_data;
      if (!flowData || !flowData.nodes || flowData.nodes.length === 0) {
        return;
      }
      
      const triggerNode = flowData.nodes.find(n => n.type === 'trigger');
      if (!triggerNode) return;
      
      // Check if trigger has matching event condition
      const triggerGroups = triggerNode.data.triggerGroups || [];
      let matched = false;
      
      for (const group of triggerGroups) {
        if (!group.conditions || group.conditions.length === 0) continue;
        
        // Check group message settings (allowDirectMessages defaults to true)
        // Event types that are inherently group-related skip this check
        const inherentlyGroupEvents = ['group_join', 'group_leave'];
        const hasInherentGroupCondition = group.conditions.some(c => inherentlyGroupEvents.includes(c.type));
        
        if (!hasInherentGroupCondition) {
          const isGroupEvent = !!eventData.groupId;
          const allowDirectMessages = group.allowDirectMessages !== false;
          const allowGroupMessages = group.allowGroupMessages || false;
          if (isGroupEvent && !allowGroupMessages) continue;
          if (!isGroupEvent && !allowDirectMessages) continue;
        }

        // Check phone filter (whitelist/blacklist)
        if (!this.checkPhoneFilter(group, contact.phone)) {
          continue;
        }

        // Check if all conditions in the group match
        let allMatch = true;
        let hasEventCondition = false;

        const eventMessage = eventData.message || '';
        for (const condition of group.conditions) {
          if (this.isEventCondition(condition.type)) {
            hasEventCondition = true;
            if (!this.checkEventCondition(condition, eventType, eventData)) {
              allMatch = false;
              break;
            }
          } else if (condition.type === 'message_content') {
            // Check message content conditions against the event's message text
            const conditionMet = await this.checkSingleCondition(condition, eventMessage, contact);
            if (!conditionMet) {
              allMatch = false;
              break;
            }
          } else if (condition.type === 'has_tag' || condition.type === 'no_tag' || condition.type === 'contact_field') {
            const conditionMet = await this.checkSingleCondition(condition, eventMessage, contact);
            if (!conditionMet) {
              allMatch = false;
              break;
            }
          } else {
            // Any other condition type - check it too
            const conditionMet = await this.checkSingleCondition(condition, eventMessage, contact);
            if (!conditionMet) {
              allMatch = false;
              break;
            }
          }
        }
        
        // Check advanced conditions for events
        if (allMatch && hasEventCondition) {
          if (group.advancedConditionGroup?.conditions?.length > 0) {
            const advResult = await this.evaluateAdvancedConditionGroup(group.advancedConditionGroup, contact, eventMessage);
            if (!advResult) allMatch = false;
          } else if (group.advancedConditions?.length > 0) {
            const advResult = await this.evaluateAdvancedConditions(group.advancedConditions, contact, eventMessage);
            if (!advResult) allMatch = false;
          }
        }

        if (allMatch && hasEventCondition) {
          // Check cooldown
          if (group.hasCooldown && group.cooldownValue && group.cooldownUnit) {
            const cooldownMinutes = group.cooldownValue * ({
              minutes: 1, hours: 60, days: 1440, weeks: 10080
            }[group.cooldownUnit] || 1440);
            
            const lastTrigger = await db.query(
              `SELECT triggered_at FROM bot_trigger_history 
               WHERE bot_id = $1 AND contact_id = $2 AND trigger_group_id = $3 
               ORDER BY triggered_at DESC LIMIT 1`,
              [bot.id, contact.id, group.id]
            );
            
            if (lastTrigger.rows.length > 0) {
              const lastTime = new Date(lastTrigger.rows[0].triggered_at);
              const cooldownEnd = new Date(lastTime.getTime() + cooldownMinutes * 60000);
              if (new Date() < cooldownEnd) {
                continue;
              }
            }
          }
          
          // Check once per user
          if (group.oncePerUser) {
            const prevTrigger = await db.query(
              `SELECT id FROM bot_trigger_history WHERE bot_id = $1 AND contact_id = $2 AND trigger_group_id = $3`,
              [bot.id, contact.id, group.id]
            );
            if (prevTrigger.rows.length > 0) {
              continue;
            }
          }
          
          matched = true;
          
          // Record trigger history
          try {
            await db.query(
              `INSERT INTO bot_trigger_history (bot_id, contact_id, trigger_group_id, triggered_at)
               VALUES ($1, $2, $3, NOW())`,
              [bot.id, contact.id, group.id]
            );
          } catch (historyErr) {
          }
          
          break;
        }
      }
      
      if (!matched) {
        return;
      }

      console.log(`[BotEngine] processEventBot(${eventType}): trigger MATCHED in bot ${bot.name || bot.id} for contact ${contact.phone}`);

      // Check subscription limit for bot runs
      const runsLimit = await checkLimit(userId, 'bot_runs');
      if (!runsLimit.allowed) {
        console.log(`[BotEngine] processEventBot(${eventType}): bot_runs limit reached`);
        return;
      }

      // Create event description for the flow
      const eventMessage = this.getEventDescription(eventType, eventData);

      // Start the flow from trigger node
      const triggerNode2 = flowData.nodes.find(n => n.type === 'trigger');
      if (!triggerNode2) return;

      const nextEdges = flowData.edges.filter(e => e.source === triggerNode2.id);
      if (nextEdges.length === 0) return;

      // Log bot run and increment usage (only when trigger actually continues to execution)
      await this.logBotRun(bot.id, contact.id, 'triggered');
      await incrementBotRuns(userId);

      // Start execution tracking for event
      let contactVars = {};
      try {
        const varsResult = await db.query('SELECT key, value FROM contact_variables WHERE contact_id = $1', [contact.id]);
        contactVars = Object.fromEntries(varsResult.rows.map(r => [r.key, r.value]));
      } catch (e) {}
      const eventRunId = await executionTracker.startRun(bot.id, contact.id, triggerNode2.id, eventMessage, flowData, contactVars);

      const sortedEdges = nextEdges.sort((a, b) => {
        const nodeA = flowData.nodes.find(n => n.id === a.target);
        const nodeB = flowData.nodes.find(n => n.id === b.target);
        return (nodeA?.position?.y || 0) - (nodeB?.position?.y || 0);
      });

      for (const edge of sortedEdges) {
        await this.executeNode(edge.target, flowData, contact, eventMessage, userId, bot.id, bot.name, undefined, eventRunId);
      }

      await executionTracker.completeRun(eventRunId, 'completed');
    } catch (error) {
      console.error('[BotEngine] Error processing event bot:', error.message);
    }
  }
  
  // Check if condition type is an event-based condition
  isEventCondition(type) {
    return ['status_viewed', 'status_reaction', 'status_reply', 'group_join', 'group_leave',
            'call_received', 'call_rejected', 'call_accepted', 'poll_vote', 'webhook', 'message_revoked',
            'bot_activated', 'message_sent'].includes(type);
  }
  
  // Check if event matches condition
  checkEventCondition(condition, eventType, eventData) {
    // Simple match: condition type must equal event type
    if (condition.type !== eventType) return false;
    
    // Additional filtering based on condition settings
    if (condition.type === 'call_received' || condition.type === 'call_rejected' || condition.type === 'call_accepted') {
      // If condition specifies video/audio filter
      if (condition.callType === 'video' && !eventData.isVideo) return false;
      if (condition.callType === 'audio' && eventData.isVideo) return false;
    }
    
    if (condition.type === 'poll_vote' && condition.value) {
      // If condition has specific option text to match
      const selectedOptions = eventData.selectedOptions || [];
      const optionsText = selectedOptions.join(', ');
      // Use matchOperator if available, otherwise default to contains
      if (condition.operator) {
        if (!this.matchOperator(optionsText, condition.operator, condition.value)) {
          return false;
        }
      } else {
        if (!selectedOptions.some(opt => opt.toLowerCase().includes(condition.value.toLowerCase()))) {
          return false;
        }
      }
    }
    
    // Specific group matching for group_join, group_leave
    if (condition.filterByGroup && condition.specificGroupId && (condition.type === 'group_join' || condition.type === 'group_leave')) {
      const eventGroupId = eventData.groupId || '';
      if (eventGroupId !== condition.specificGroupId) {
        return false;
      }
    }
    
    // message_sent — filter by message type and optional content
    if (condition.type === 'message_sent') {
      const msgType = condition.messageType || 'any';
      const sentMessageType = eventData.messageType || 'text';
      if (msgType !== 'any') {
        if (msgType === 'text' && sentMessageType !== 'text') return false;
        if (msgType === 'image' && sentMessageType !== 'image') return false;
        if (msgType === 'video' && sentMessageType !== 'video') return false;
        if (msgType === 'audio' && sentMessageType !== 'audio' && sentMessageType !== 'ptt') return false;
        if (msgType === 'file' && sentMessageType !== 'document') return false;
        if (msgType === 'sticker' && sentMessageType !== 'sticker') return false;
      }
      // Optional content filter (text/any only)
      if (condition.hasContentFilter && condition.operator && ['any', 'text'].includes(msgType)) {
        const message = eventData.message || '';
        if (!['is_empty', 'is_not_empty'].includes(condition.operator) && condition.value) {
          return this.matchOperator(message, condition.operator, condition.value);
        }
        if (condition.operator === 'is_empty') return !message || message.trim() === '';
        if (condition.operator === 'is_not_empty') return !!(message && message.trim());
        return false;
      }
      return true;
    }

    // Specific status matching for status_reaction, status_reply, status_viewed
    if (condition.filterByStatus && condition.specificStatusId && (condition.type === 'status_reaction' || condition.type === 'status_reply' || condition.type === 'status_viewed')) {
      // Extract hex ID from stored full wa_message_id (e.g. "true_status@broadcast_<HEX>_<PHONE>@c.us")
      const storedHex = this.extractStatusHexId(condition.specificStatusId);
      
      // Get the event's message ID reference
      let eventMsgId = '';
      if (condition.type === 'status_reply') {
        eventMsgId = eventData.statusMessageId || ''; // This is the stanzaID (just the hex part)
      } else if (condition.type === 'status_reaction') {
        eventMsgId = eventData.messageId || ''; // e.g. "false_status@broadcast_<HEX>"
      } else if (condition.type === 'status_viewed') {
        eventMsgId = eventData.messageId || ''; // e.g. "true_status@broadcast_<HEX>_<PHONE>@c.us"
      }
      
      const eventHex = this.extractStatusHexId(eventMsgId);
      
      
      if (!storedHex || !eventHex || storedHex !== eventHex) {
        return false;
      }
    }
    
    return true;
  }
  
  // Extract hex ID portion from a status message ID
  // Formats: "true_status@broadcast_<HEX>_<PHONE>@c.us", "false_status@broadcast_<HEX>", just "<HEX>"
  extractStatusHexId(messageId) {
    if (!messageId) return '';
    
    // If it's a full status message ID with broadcast prefix
    const broadcastMatch = messageId.match(/status@broadcast_([A-F0-9]+)/i);
    if (broadcastMatch) return broadcastMatch[1].toUpperCase();
    
    // If it's just a hex string (stanzaID)
    if (/^[A-F0-9]+$/i.test(messageId)) return messageId.toUpperCase();
    
    return messageId.toUpperCase();
  }
  
  // Get human-readable event description
  getEventDescription(eventType, eventData) {
    const descriptions = {
      'status_viewed': 'צפה בסטטוס',
      'status_reaction': `סימן לב על סטטוס: ${eventData.reaction || ''}`,
      'status_reply': 'הגיב על סטטוס',
      'group_join': 'הצטרף לקבוצה',
      'group_leave': 'יצא מהקבוצה',
      'call_received': eventData.isVideo ? 'שיחת וידאו נכנסת' : 'שיחה נכנסת',
      'call_rejected': 'שיחה שנדחתה',
      'call_accepted': 'שיחה שנענתה',
      'poll_vote': `ענה על סקר: ${(eventData.selectedOptions || []).join(', ')}`,
      'message_revoked': eventData.originalMessage || 'הודעה נמחקה',
      'message_sent': `הודעה יוצאת: ${(eventData.message || '').substring(0, 50) || eventData.messageType || 'טקסט'}`
    };
    return descriptions[eventType] || eventType;
  }
  
  // Process single bot
  async processBot(bot, contact, message, messageType, userId, selectedRowId = null, quotedListTitle = null, isGroupMessage = false, extraContext = {}) {
    let runId = null;
    try {
      // Check if this specific bot is disabled for this contact
      try {
        const disabledCheck = await db.query(
          'SELECT id FROM contact_disabled_bots WHERE contact_id = $1 AND bot_id = $2',
          [contact.id, bot.id]
        );
        if (disabledCheck.rows.length > 0) {
          return;
        }
      } catch (disabledErr) {
        // Table may not exist yet - that's fine, no bots are disabled
      }
      
      const flowData = bot.flow_data;
      if (!flowData || !flowData.nodes || flowData.nodes.length === 0) {
        return;
      }
      
      // Check for existing session (waiting for response)
      const session = await this.getSession(bot.id, contact.id);
      
      if (session && session.waiting_for) {
        
        // Check if session expired
        if (session.expires_at && new Date(session.expires_at) < new Date()) {
          await this.handleSessionTimeout(session, flowData, contact, message, userId, bot);
          return;
        }
        
        // Handle based on what we're waiting for
        if (session.waiting_for === 'list_response') {
          // Waiting for list button click
          if (messageType === 'list_response') {
            // Got a list response - continue session
            await this.continueSession(session, flowData, contact, message, userId, bot, messageType, selectedRowId, quotedListTitle);
            return;
          } else {
            // Got regular message while waiting for list - check triggers normally
            // Don't return - fall through to trigger check below
          }
        } else if (session.waiting_for === 'reply') {
          // Waiting for reply - check if text-only is required
          const waitingData = session.waiting_data ? (typeof session.waiting_data === 'string' ? JSON.parse(session.waiting_data) : session.waiting_data) : {};

          // Check that the message comes from the same source (direct chat vs group) as the session was started in.
          // sourceGroupId === null means the session was started in a direct chat; a group ID means it was started in that group.
          const sessionSourceGroupId = waitingData.sourceGroupId !== undefined ? waitingData.sourceGroupId : null;
          const currentGroupId = contact._groupId || null;
          if (sessionSourceGroupId !== currentGroupId) {
            // Message came from a different source (e.g. group message while session is in direct chat) - ignore, fall through to trigger check
          } else {
            // Check if text-only reply is required
            if (waitingData.textOnly && messageType !== 'text') {

              // Send error message
              const connection = await this.getConnection(userId);
              if (connection) {
                const errorMsg = waitingData.invalidReplyMessage || 'התגובה לא תקינה. אנא שלח הודעת טקסט בלבד.';
                try {
                  await wahaService.sendMessage(connection.session_name, contact.phone, errorMsg);
                } catch (e) {
                  console.error('[BotEngine] Failed to send invalid reply message:', e.message);
                }
              }
              // Don't continue the flow - wait for valid text reply
              return;
            }

            await this.continueSession(session, flowData, contact, message, userId, bot, messageType, selectedRowId, null);
            return;
          }
        } else if (session.waiting_for === 'registration') {
          // Waiting for registration answer - this BLOCKS new triggers
          const waitingData = session.waiting_data ? (typeof session.waiting_data === 'string' ? JSON.parse(session.waiting_data) : session.waiting_data) : {};
          const sessionSourceGroupId = waitingData.sourceGroupId !== undefined ? waitingData.sourceGroupId : null;
          const currentGroupId = contact._groupId || null;
          if (sessionSourceGroupId !== currentGroupId) {
            // Message came from a different source - ignore, fall through to trigger check
          } else if (messageType === 'list_response') {
            // List response during registration — silently stop registration and let list handler process it
            await this.clearSession(bot.id, contact.id);
            // Fall through to normal trigger/list handling below
          } else {
            await this.continueSession(session, flowData, contact, message, userId, bot, messageType, selectedRowId, null);
            return;
          }
        }
      }
      
      // If this is a list_response but no session exists, try to find the list by title
      if (messageType === 'list_response') {
        if (quotedListTitle) {
          
          // Find the list node by title
          const listNode = flowData.nodes.find(n => 
            n.type === 'list' && n.data?.title === quotedListTitle
          );
          
          if (listNode) {
            
            // Create a temporary session-like object
            const tempSession = {
              current_node_id: listNode.id,
              waiting_for: 'list_response',
              waiting_data: {
                buttons: (listNode.data.buttons || []).map((btn, i) => ({
                  id: `option_${i}`,
                  title: btn.title || '',
                  displayIndex: i,
                  originalIndex: i,
                })),
                listTitle: listNode.data.title,
              }
            };
            
            // Process this list response
            await this.continueSession(tempSession, flowData, contact, message, userId, bot, messageType, selectedRowId, quotedListTitle);
            return;
          } else {
          }
        }
        
        return;
      }
      
      // No active session - check trigger for new flow
      const triggerNode = flowData.nodes.find(n => n.type === 'trigger');
      if (!triggerNode) {
        return;
      }
      
      // Check if trigger matches (pass isGroupMessage for per-group filtering)
      const triggerMatches = await this.checkTrigger(triggerNode.data, message, messageType, contact, bot.id, isGroupMessage);
      if (!triggerMatches) {
        return;
      }
      
      
      // Record trigger history for cooldown/once-per-user tracking
      const matchedGroupId = triggerNode.data._matchedGroupId;
      if (matchedGroupId) {
        try {
          await db.query(`
            INSERT INTO bot_trigger_history (bot_id, contact_id, trigger_group_id, triggered_at)
            VALUES ($1, $2, $3, NOW())
          `, [bot.id, contact.id, matchedGroupId]);
        } catch (historyErr) {
        }
        // Clean up the temporary field
        delete triggerNode.data._matchedGroupId;
      }
      
      // Auto mark as seen if enabled in trigger
      if (triggerNode.data.autoMarkSeen) {
        try {
          const connection = await this.getConnection(userId);
          if (connection) {
            await wahaService.sendSeen(connection, contact.phone);
          }
        } catch (err) {
        }
      }
      
      // Check subscription limit for bot runs
      const runsLimit = await checkLimit(userId, 'bot_runs');
      if (!runsLimit.allowed) {
        // Optionally send a message to the contact
        // For now, just log and skip
        return;
      }

      // Find ALL next nodes after trigger (support multiple branches)
      const nextEdges = flowData.edges.filter(e => e.source === triggerNode.id);
      if (nextEdges.length === 0) {
        return;
      }

      // Log bot run and increment usage (only when trigger actually continues to execution)
      await this.logBotRun(bot.id, contact.id, 'triggered');
      await incrementBotRuns(userId);

      // Start execution tracking with trigger detail
      let contactVars = {};
      try {
        const varsResult = await db.query('SELECT key, value FROM contact_variables WHERE contact_id = $1', [contact.id]);
        contactVars = Object.fromEntries(varsResult.rows.map(r => [r.key, r.value]));
      } catch (e) {}

      // Build trigger detail for tracking
      const triggerDetail = {
        contactName: contact.display_name || contact.pushName || contact.phone,
        contactPhone: contact.phone,
        messageReceived: message,
        messageType: messageType,
        isGroup: isGroupMessage,
        matchedGroupId: matchedGroupId || null,
      };
      // Capture trigger conditions that were evaluated
      const triggerGroups = triggerNode.data.triggerGroups || [];
      const oldTriggers = triggerNode.data.triggers || [];
      if (triggerGroups.length > 0) {
        triggerDetail.conditionGroups = triggerGroups.map(g => ({
          name: g.name || g.id || null,
          conditions: (g.conditions || []).map(c => ({
            type: c.type, operator: c.operator || null, value: c.value || null,
            description: c.type === 'any_message' ? 'כל הודעה' :
              c.type === 'contains' ? `מכיל: "${c.value}"` :
              c.type === 'starts_with' ? `מתחיל ב: "${c.value}"` :
              c.type === 'exact' ? `בדיוק: "${c.value}"` :
              c.type === 'regex' ? `ביטוי רגולרי: ${c.value}` :
              c.type === 'first_message' ? 'הודעה ראשונה' :
              c.type === 'has_media' ? `מדיה: ${c.mediaType || 'כלשהי'}` :
              c.type === 'group_message' ? 'הודעת קבוצה' :
              c.type === 'channel_message' ? 'הודעת ערוץ' :
              c.type === 'has_variable' ? `משתנה ${c.variableName} ${c.operator} ${c.value || ''}` :
              `${c.type}: ${c.value || ''}`
          })),
          hasActiveHours: g.hasActiveHours || false,
          activeFrom: g.activeFrom,
          activeTo: g.activeTo,
        }));
      } else if (oldTriggers.length > 0) {
        triggerDetail.legacyTriggers = oldTriggers.map(t => ({
          type: t.type, value: t.value, not: t.not || false,
          description: t.type === 'any_message' ? 'כל הודעה' :
            t.type === 'contains' ? `מכיל: "${t.value}"` :
            t.type === 'starts_with' ? `מתחיל ב: "${t.value}"` :
            t.type === 'exact' ? `בדיוק: "${t.value}"` :
            t.type === 'regex' ? `ביטוי רגולרי: ${t.value}` :
            `${t.type}: ${t.value || ''}`
        }));
      }

      const runId = await executionTracker.startRun(bot.id, contact.id, triggerNode.id, message, flowData, contactVars, triggerDetail);

      // Sort by target node Y position (top to bottom)
      const sortedEdges = nextEdges.sort((a, b) => {
        const nodeA = flowData.nodes.find(n => n.id === a.target);
        const nodeB = flowData.nodes.find(n => n.id === b.target);
        const posA = nodeA?.position?.y || 0;
        const posB = nodeB?.position?.y || 0;
        return posA - posB;
      });


      // Execute all branches sequentially (top to bottom)
      for (const edge of sortedEdges) {
        await this.executeNode(edge.target, flowData, contact, message, userId, bot.id, bot.name, undefined, runId);
      }

      // Complete execution tracking
      await executionTracker.completeRun(runId, 'completed');

    } catch (error) {
      console.error('[BotEngine] Error processing bot:', error);
      await this.logBotRun(bot.id, contact.id, 'error', error.message);
      if (runId) await executionTracker.completeRun(runId, 'error', error.message);
    }
  }

  // Get active session for contact
  async getSession(botId, contactId) {
    const result = await db.query(
      'SELECT * FROM bot_sessions WHERE bot_id = $1 AND contact_id = $2',
      [botId, contactId]
    );
    const session = result.rows[0] || null;
    if (session) {
    }
    return session;
  }
  
  // Save session state
  async saveSession(botId, contactId, nodeId, waitingFor, waitingData = {}, timeoutSeconds = null) {
    try {
      const expiresAt = timeoutSeconds 
        ? new Date(Date.now() + timeoutSeconds * 1000) 
        : null;
      
      await db.query(
        `INSERT INTO bot_sessions (bot_id, contact_id, current_node_id, waiting_for, waiting_data, expires_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (bot_id, contact_id) 
         DO UPDATE SET current_node_id = $3, waiting_for = $4, waiting_data = $5, expires_at = $6, updated_at = NOW()`,
        [botId, contactId, nodeId, waitingFor, JSON.stringify(waitingData), expiresAt]
      );
      
    } catch (error) {
      console.error('[BotEngine] ❌ Error saving session:', error.message);
      throw error;
    }
  }
  
  // Clear session
  async clearSession(botId, contactId) {
    await db.query(
      'DELETE FROM bot_sessions WHERE bot_id = $1 AND contact_id = $2',
      [botId, contactId]
    );
  }
  
  // Continue from saved session
  async continueSession(session, flowData, contact, message, userId, bot, messageType = 'text', selectedRowId = null, quotedListTitle = null) {
    const currentNode = flowData.nodes.find(n => n.id === session.current_node_id);
    if (!currentNode) {
      await this.clearSession(bot.id, contact.id);
      return;
    }
    
    
    // Auto mark as seen if enabled in trigger (for all messages in the flow)
    const triggerNode = flowData.nodes.find(n => n.type === 'trigger');
    if (triggerNode?.data?.autoMarkSeen) {
      try {
        const connection = await this.getConnection(userId);
        if (connection) {
          await wahaService.sendSeen(connection, contact.phone);
        }
      } catch (err) {
      }
    }
    
    // Get node data
    const nodeData = currentNode.data || {};
    const singleSelect = nodeData.singleSelect === true; // Default to false (allow multiple selections)
    
    // Find next node based on response
    let nextHandleId = null;
    
    if (session.waiting_for === 'list_response') {
      // Check if this is actually a list response
      if (messageType !== 'list_response') {
        return;
      }
      
      // IMPORTANT: Verify the list_response is for THIS list, not a different one
      const sessionListTitle = session.waiting_data?.listTitle;
      if (quotedListTitle && sessionListTitle && quotedListTitle !== sessionListTitle) {
        
        // Find the correct list node by title
        const correctListNode = flowData.nodes.find(n => 
          n.type === 'list' && n.data?.title === quotedListTitle
        );
        
        if (correctListNode) {
          
          // Clear current session
          await this.clearSession(bot.id, contact.id);
          
          // Create a temporary session-like object for the correct list
          const tempSession = {
            ...session,
            current_node_id: correctListNode.id,
            waiting_data: {
              buttons: (correctListNode.data.buttons || []).map((btn, i) => ({
                id: `option_${i}`,
                title: btn.title || '',
                displayIndex: i,
                originalIndex: i,
              })),
              listTitle: correctListNode.data.title,
            }
          };
          
          // Recursively call continueSession with the correct list
          return await this.continueSession(tempSession, flowData, contact, message, userId, bot, messageType, selectedRowId, quotedListTitle);
        } else {
          await this.clearSession(bot.id, contact.id);
          return;
        }
      }
      
      // Use selectedRowId directly from WAHA
      if (selectedRowId !== null && selectedRowId !== undefined) {
        // Convert to string in case WAHA sends a number
        const rowIdStr = String(selectedRowId);
        
        // Extract display index from selectedRowId (e.g., "option_0" -> 0, or just "0")
        let displayIndex = -1;
        if (rowIdStr.startsWith('option_')) {
          displayIndex = parseInt(rowIdStr.replace('option_', ''));
        } else if (/^\d+$/.test(rowIdStr)) {
          displayIndex = parseInt(rowIdStr);
        }
        
        
        // Get session buttons to find original index (for filtered lists)
        const sessionButtons = session.waiting_data?.buttons || [];
        const selectedButton = sessionButtons.find(b => 
          b.displayIndex === displayIndex || 
          b.id === rowIdStr || 
          b.id === `option_${displayIndex}`
        );
        const originalIndex = selectedButton?.originalIndex ?? displayIndex;
        
        
        // Find edges from this node
        const nodeEdges = flowData.edges.filter(e => e.source === currentNode.id);
        
        // Try to find matching edge using ORIGINAL index (not display index)
        if (originalIndex >= 0) {
          const possibleHandles = [
            String(originalIndex),          // Original index "0", "1", etc
            `option_${originalIndex}`,      // option_X format with original
            rowIdStr,                       // Fallback: rowId from WAHA as string
          ];
          
          for (const handleId of possibleHandles) {
            const edge = nodeEdges.find(e => e.sourceHandle === handleId);
            if (edge) {
              nextHandleId = handleId;
              break;
            }
          }
        }
      }
      
      // Handle session based on singleSelect
      const keepSessionForMultiSelect = !singleSelect;
      
      if (singleSelect) {
        // Single select - clear session before executing flow
        await this.clearSession(bot.id, contact.id);
      }
      
      // Store session data BEFORE executing flow (in case flow creates new session)
      const originalSessionData = { ...session.waiting_data };
      const originalNodeId = currentNode.id;
      
      // Find ALL next edges (support multiple paths)
      let nextEdges = [];
      if (nextHandleId) {
        nextEdges = flowData.edges.filter(e => e.source === currentNode.id && e.sourceHandle === nextHandleId);
      }
      if (nextEdges.length === 0) {
        // Fallback - try default edges (no handle)
        nextEdges = flowData.edges.filter(e => e.source === currentNode.id && !e.sourceHandle);
        if (nextEdges.length > 0) {
        }
      }
      
      if (nextEdges.length > 0) {
        // Sort by target node Y position (top to bottom)
        const sortedEdges = nextEdges.sort((a, b) => {
          const nodeA = flowData.nodes.find(n => n.id === a.target);
          const nodeB = flowData.nodes.find(n => n.id === b.target);
          return (nodeA?.position?.y || 0) - (nodeB?.position?.y || 0);
        });
        
        for (const edge of sortedEdges) {
          await this.executeNode(edge.target, flowData, contact, message, userId, bot.id, bot.name);
        }
      } else {
      }
      
      // For multi-select, restore the list session ONLY if no new session was created by the flow
      if (keepSessionForMultiSelect) {
        // Check if the flow created a new session (e.g., registration, reply wait, another list)
        const currentSession = await this.getSession(bot.id, contact.id);
        
        // Only restore if:
        // 1. No session exists (flow didn't create one)
        // 2. OR current session is the same list node (shouldn't happen but just in case)
        const shouldRestore = !currentSession || 
          (currentSession.waiting_for === 'list_response' && currentSession.current_node_id === originalNodeId);
        
        if (shouldRestore) {
          // Restore for more selections
          await this.saveSession(
            bot.id,
            contact.id,
            originalNodeId,
            'list_response',
            originalSessionData,
            null // No timeout for list responses
          );
        } else {
          // Flow created a new session (registration, reply, another list, etc.) - don't override it
        }
      }
      
      return;
      
    } else if (session.waiting_for === 'reply') {
      // For regular reply wait, clear session and continue
      const waitingData = session.waiting_data ? (typeof session.waiting_data === 'string' ? JSON.parse(session.waiting_data) : session.waiting_data) : {};
      
      // Save reply to variable if configured
      if (waitingData.saveToVariable && waitingData.variableName && message) {
        await this.setContactVariable(contact.id, waitingData.variableName, message);
      }
      
      await this.clearSession(bot.id, contact.id);
      
      // For reply sessions, prefer 'reply' handle edge, then fall back to default
      nextHandleId = 'reply';
    } else if (session.waiting_for === 'registration') {
      // Continue registration flow
      return await this.continueRegistration(session, flowData, contact, message, userId, bot, messageType);
    }
    
    // Find ALL next edges (support multiple paths)
    let nextEdges = [];
    if (nextHandleId) {
      nextEdges = flowData.edges.filter(e => e.source === currentNode.id && e.sourceHandle === nextHandleId);
    }
    if (nextEdges.length === 0) {
      // Fallback - try default edges (no handle or null handle)
      nextEdges = flowData.edges.filter(e => e.source === currentNode.id && (!e.sourceHandle || e.sourceHandle === null));
      if (nextEdges.length > 0) {
      }
    }
    
    if (nextEdges.length > 0) {
      // Sort by target node Y position (top to bottom)
      const sortedEdges = nextEdges.sort((a, b) => {
        const nodeA = flowData.nodes.find(n => n.id === a.target);
        const nodeB = flowData.nodes.find(n => n.id === b.target);
        return (nodeA?.position?.y || 0) - (nodeB?.position?.y || 0);
      });
      
      for (const edge of sortedEdges) {
        await this.executeNode(edge.target, flowData, contact, message, userId, bot.id, bot.name);
      }
    } else {
    }
  }
  
  // Handle session timeout
  async handleSessionTimeout(session, flowData, contact, message, userId, bot) {
    const currentNode = flowData.nodes.find(n => n.id === session.current_node_id);
    
    // Clear session
    await this.clearSession(bot.id, contact.id);
    
    if (!currentNode) return;
    
    // Find timeout edges (support multiple paths)
    const timeoutEdges = flowData.edges.filter(e => 
      e.source === currentNode.id && e.sourceHandle === 'timeout'
    );
    
    if (timeoutEdges.length > 0) {
      for (const edge of timeoutEdges) {
        await this.executeNode(edge.target, flowData, contact, message, userId, bot.id, bot.name);
      }
    }
  }
  
  // Normalize phone number for comparison: strip all non-digits, convert Israeli format
  normalizePhone(phone) {
    if (!phone) return '';
    let clean = String(phone).replace(/\D/g, '');
    if (clean.startsWith('0')) clean = '972' + clean.substring(1);
    // Remove leading + if present in original
    return clean;
  }

  // Check if contact phone matches phone filter
  checkPhoneFilter(group, contactPhone) {
    if (!group.phoneFilter || group.phoneFilter === 'all') return true;
    const normalizedContact = this.normalizePhone(contactPhone);

    if (group.phoneFilter === 'whitelist') {
      const phoneNumbers = group.phoneNumbers || [];
      if (phoneNumbers.length === 0) return true;
      return phoneNumbers.some(num => {
        const normalized = this.normalizePhone(num);
        return normalized && normalizedContact && (normalizedContact === normalized || normalizedContact.endsWith(normalized) || normalized.endsWith(normalizedContact));
      });
    }

    if (group.phoneFilter === 'blacklist') {
      const blacklistNumbers = group.blacklistNumbers || [];
      if (blacklistNumbers.length === 0) return true;
      const matchesBlacklist = blacklistNumbers.some(num => {
        const normalized = this.normalizePhone(num);
        return normalized && normalizedContact && (normalizedContact === normalized || normalizedContact.endsWith(normalized) || normalized.endsWith(normalizedContact));
      });
      return !matchesBlacklist;
    }

    return true;
  }

  // Resolve the value of a single advanced condition variable
  async resolveAdvConditionValue(cond, contact, message) {
    const { variable, varName } = cond;
    switch (variable) {
      case 'message': return message || '';
      case 'last_message': return message || '';
      case 'contact_name': return contact.display_name || contact.name || '';
      case 'phone': return contact.phone || '';
      case 'message_type': return contact._mediaType || 'text';
      case 'is_group': return contact._isGroup ? 'true' : 'false';
      case 'is_channel': return contact._isChannel ? 'true' : 'false';
      case 'has_media': return contact._hasMedia ? 'true' : 'false';
      case 'is_first_contact': return contact._isFirstContact ? 'true' : 'false';
      case 'has_tag': {
        if (!varName) return 'false';
        try {
          const tagResult = await db.query(
            `SELECT 1 FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id
             WHERE ct.contact_id = $1 AND LOWER(t.name) = LOWER($2) LIMIT 1`,
            [contact.id, varName]
          );
          return tagResult.rows.length > 0 ? 'true' : 'false';
        } catch { return 'false'; }
      }
      case 'contact_var': {
        if (!varName) return '';
        // Strip {{ and }} if present
        const cleanVarName = varName.replace(/^\{\{|\}\}$/g, '');
        try {
          const varResult = await db.query(
            `SELECT value FROM contact_variables WHERE contact_id = $1 AND variable_name = $2`,
            [contact.id, cleanVarName]
          );
          return varResult.rows.length > 0 ? (varResult.rows[0].value || '') : '';
        } catch { return ''; }
      }
      case 'time': {
        const israelTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' });
        const now = new Date(israelTime);
        return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      }
      case 'day': {
        const israelTime2 = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' });
        return String(new Date(israelTime2).getDay());
      }
      case 'date': {
        const israelTime3 = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' });
        const d = new Date(israelTime3);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      }
      case 'random': return String(Math.floor(Math.random() * 100) + 1);
      default: return '';
    }
  }

  // Evaluate advanced conditions — supports both flat array and nested conditionGroup
  async evaluateAdvancedConditions(conditions, contact, message, userId) {
    if (!conditions || conditions.length === 0) return true;

    // Flat array (old format) — all AND
    for (const cond of conditions) {
      const checkValue = await this.resolveAdvConditionValue(cond, contact, message);
      const result = this.evalAdvancedOperator(cond.operator, checkValue, cond.value || '');
      if (!result) return false;
    }
    return true;
  }

  // Evaluate a nested conditionGroup (new format) with AND/OR logic
  async evaluateAdvancedConditionGroup(group, contact, message) {
    if (!group || !group.conditions || group.conditions.length === 0) return true;
    const logic = group.logic || 'AND';
    const results = [];

    for (const cond of group.conditions) {
      if (cond.isGroup) {
        results.push(await this.evaluateAdvancedConditionGroup(cond, contact, message));
      } else {
        const checkValue = await this.resolveAdvConditionValue(cond, contact, message);
        results.push(this.evalAdvancedOperator(cond.operator, checkValue, cond.value || ''));
      }
    }

    return logic === 'AND' ? results.every(r => r) : results.some(r => r);
  }

  // Evaluate an operator for advanced conditions
  evalAdvancedOperator(operator, checkValue, targetValue) {
    const cv = (checkValue || '').toString().toLowerCase().trim();
    const tv = (targetValue || '').toString().toLowerCase().trim();

    switch (operator) {
      case 'equals': return cv === tv;
      case 'not_equals': return cv !== tv;
      case 'contains': return cv.includes(tv);
      case 'not_contains': return !cv.includes(tv);
      case 'starts_with': return cv.startsWith(tv);
      case 'ends_with': return cv.endsWith(tv);
      case 'matches_regex': try { return new RegExp(targetValue, 'i').test(checkValue || ''); } catch { return false; }
      case 'greater_than': return parseFloat(checkValue) > parseFloat(targetValue);
      case 'less_than': return parseFloat(checkValue) < parseFloat(targetValue);
      case 'greater_or_equal': return parseFloat(checkValue) >= parseFloat(targetValue);
      case 'less_or_equal': return parseFloat(checkValue) <= parseFloat(targetValue);
      case 'is_empty': return !checkValue || checkValue.toString().trim() === '';
      case 'is_not_empty': return checkValue && checkValue.toString().trim() !== '';
      case 'is_true': return ['true', 'כן', 'yes', '1'].includes(cv);
      case 'is_false': return ['false', 'לא', 'no', '0'].includes(cv);
      case 'is_text': return isNaN(Number(checkValue));
      case 'is_number': return !isNaN(Number(checkValue)) && checkValue.toString().trim() !== '';
      case 'is_email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cv);
      case 'is_phone': return /^[\d\s+\-()]{7,}$/.test(cv);
      case 'is_image': return ['image'].includes(cv);
      case 'is_video': return ['video'].includes(cv);
      case 'is_audio': return ['audio', 'ptt'].includes(cv);
      case 'is_document': return ['document'].includes(cv);
      case 'is_pdf': return cv.endsWith('.pdf') || cv === 'application/pdf';
      default: return true;
    }
  }

  // Check if trigger matches (with advanced settings)
  async checkTrigger(triggerData, message, messageType, contact, botId, isGroupMessage = false) {
    // Support both new triggerGroups format and old triggers format
    const triggerGroups = triggerData.triggerGroups || [];
    const oldTriggers = triggerData.triggers || [];
    
    // If no triggers defined at all, don't match
    if (triggerGroups.length === 0 && oldTriggers.length === 0) {
      return false;
    }
    
    // FIRST: Check if the message content matches the trigger conditions
    let contentMatches = false;
    
    // NEW FORMAT: Check triggerGroups (groups are OR, conditions within group are AND)
    if (triggerGroups.length > 0) {
      for (const group of triggerGroups) {
        const conditions = group.conditions || [];
        if (conditions.length === 0) continue;
        
        // Auto-detect if this group has channel/group triggers
        const hasChannelTrigger = conditions.some(c => c.type === 'channel_message');
        const hasGroupTrigger = conditions.some(c => c.type === 'group_message');
        
        // Check message source settings
        // By default: direct messages allowed, group/channel messages not allowed
        // BUT: if there's a channel_message/group_message trigger, auto-enable that source
        const allowDirectMessages = group.allowDirectMessages !== false; // default true
        const allowGroupMessages = group.allowGroupMessages || hasGroupTrigger || false; // default false, but true if has group trigger
        const allowChannelMessages = group.allowChannelMessages || hasChannelTrigger || false; // default false, but true if has channel trigger
        
        // Get channel info from contact context
        const isChannelMessage = contact._isChannel || false;
        
        if (isChannelMessage && !allowChannelMessages) {
          continue; // Try next group
        }
        if (isGroupMessage && !isChannelMessage && !allowGroupMessages) {
          continue; // Try next group
        }
        if (!isGroupMessage && !isChannelMessage && !allowDirectMessages) {
          continue; // Try next group
        }

        // Check phone filter (whitelist/blacklist)
        if (!this.checkPhoneFilter(group, contact.phone)) {
          continue; // Try next group
        }

        // All conditions in this group must match (AND)
        let groupMatches = true;

        for (const condition of conditions) {
          const conditionMatches = await this.checkSingleCondition(condition, message, contact);
          if (!conditionMatches) {
            groupMatches = false;
            break;
          }
        }

        // Check advanced conditions
        if (groupMatches) {
          if (group.advancedConditionGroup?.conditions?.length > 0) {
            const advResult = await this.evaluateAdvancedConditionGroup(group.advancedConditionGroup, contact, message);
            if (!advResult) groupMatches = false;
          } else if (group.advancedConditions?.length > 0) {
            const advResult = await this.evaluateAdvancedConditions(group.advancedConditions, contact, message);
            if (!advResult) groupMatches = false;
          }
        }

        // If basic conditions match, check group-level behavior settings
        if (groupMatches) {
          // Check group-level active hours (Israel timezone)
          if (group.hasActiveHours) {
            // Use Israel timezone for accurate local time
            const israelTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' });
            const now = new Date(israelTime);
            const currentTime = now.getHours() * 60 + now.getMinutes();
            
            // Use defaults if values are missing
            const activeFrom = group.activeFrom || '09:00';
            const activeTo = group.activeTo || '18:00';
            const [fromHours, fromMins] = activeFrom.split(':').map(Number);
            const [toHours, toMins] = activeTo.split(':').map(Number);
            const fromTime = fromHours * 60 + fromMins;
            const toTime = toHours * 60 + toMins;
            
            
            let isWithinHours;
            if (fromTime <= toTime) {
              // Normal range (e.g., 09:00-18:00)
              isWithinHours = currentTime >= fromTime && currentTime <= toTime;
            } else {
              // Overnight range (e.g., 22:00-06:00)
              isWithinHours = currentTime >= fromTime || currentTime <= toTime;
            }
            
            if (!isWithinHours) {
              groupMatches = false;
            } else {
            }
          }
          
          // Check group-level cooldown (not triggered for this user in X time)
          if (groupMatches && group.hasCooldown) {
            const cooldownValue = group.cooldownValue || 1;
            const cooldownUnit = group.cooldownUnit || 'days';
            
            const multiplier = {
              'minutes': 1,
              'hours': 60,
              'days': 60 * 24,
              'weeks': 60 * 24 * 7
            };
            
            const minutesCooldown = cooldownValue * (multiplier[cooldownUnit] || multiplier.days);
            const cutoffTime = new Date(Date.now() - minutesCooldown * 60 * 1000);
            
            // Check last trigger for this bot + contact + group
            const lastTrigger = await db.query(
              `SELECT triggered_at FROM bot_trigger_history 
               WHERE bot_id = $1 AND contact_id = $2 AND trigger_group_id = $3
               ORDER BY triggered_at DESC LIMIT 1`,
              [botId, contact.id, group.id]
            );
            
            if (lastTrigger.rows.length > 0) {
              const lastTriggerTime = new Date(lastTrigger.rows[0].triggered_at);
              if (lastTriggerTime > cutoffTime) {
                groupMatches = false;
              }
            }
          }
          
          // Check group-level once per user
          if (groupMatches && group.oncePerUser) {
            const triggered = await db.query(
              `SELECT id FROM bot_trigger_history 
               WHERE bot_id = $1 AND contact_id = $2 AND trigger_group_id = $3 LIMIT 1`,
              [botId, contact.id, group.id]
            );
            
            if (triggered.rows.length > 0) {
              groupMatches = false;
            }
          }
          
          // Check not_triggered_in conditions
          for (const condition of conditions) {
            if (condition.type === 'not_triggered_in' && groupMatches) {
              const timeValue = condition.timeValue || 1;
              const timeUnit = condition.timeUnit || 'days';
              
              const multiplier = {
                'minutes': 1,
                'hours': 60,
                'days': 60 * 24,
                'weeks': 60 * 24 * 7
              };
              
              const minutesAgo = timeValue * (multiplier[timeUnit] || multiplier.days);
              const cutoffTime = new Date(Date.now() - minutesAgo * 60 * 1000);
              
              const lastTrigger = await db.query(
                `SELECT triggered_at FROM bot_trigger_history 
                 WHERE bot_id = $1 AND contact_id = $2
                 ORDER BY triggered_at DESC LIMIT 1`,
                [botId, contact.id]
              );
              
              if (lastTrigger.rows.length > 0) {
                const lastTriggerTime = new Date(lastTrigger.rows[0].triggered_at);
                if (lastTriggerTime > cutoffTime) {
                  groupMatches = false;
                }
              }
            }
          }
        }
        
        // If this group matches, content matches (OR between groups)
        if (groupMatches) {
          contentMatches = true;
          // Store the matched group for history tracking
          triggerData._matchedGroupId = group.id;
          break;
        }
      }
    }
    // OLD FORMAT: Check triggers array (backward compatibility)
    else if (oldTriggers.length > 0) {
      for (const trigger of oldTriggers) {
        let matches = false;
        
        switch (trigger.type) {
          case 'any_message':
            matches = true;
            break;
          case 'contains':
            matches = message.toLowerCase().includes((trigger.value || '').toLowerCase());
            break;
          case 'starts_with':
            matches = message.toLowerCase().startsWith((trigger.value || '').toLowerCase());
            break;
          case 'exact':
            matches = message.toLowerCase() === (trigger.value || '').toLowerCase();
            break;
          case 'regex':
            try {
              const regex = new RegExp(trigger.value, 'i');
              matches = regex.test(message);
            } catch (e) {
              matches = false;
            }
            break;
          case 'first_message':
            // Query actual message count since contact.message_count isn't loaded
            const firstMsgCount = await db.query(
              `SELECT COUNT(*) as count FROM messages WHERE contact_id = $1 AND direction = 'incoming'`,
              [contact.id]
            );
            matches = parseInt(firstMsgCount.rows[0]?.count || 0) === 1;
            break;
          default:
            matches = false;
        }
        
        if (trigger.not) matches = !matches;
        if (matches) {
          contentMatches = true;
          break;
        }
      }
    }
    
    // If content doesn't match, return false immediately
    if (!contentMatches) {
      return false;
    }
    
    // SECOND: Check advanced settings (only if content matched)
    
    // Active hours check
    if (triggerData.hasActiveHours && triggerData.activeFrom && triggerData.activeTo) {
      const now = new Date();
      const currentTime = now.getHours() * 100 + now.getMinutes();
      const fromParts = triggerData.activeFrom.split(':');
      const toParts = triggerData.activeTo.split(':');
      const fromTime = parseInt(fromParts[0]) * 100 + parseInt(fromParts[1]);
      const toTime = parseInt(toParts[0]) * 100 + parseInt(toParts[1]);
      
      if (currentTime < fromTime || currentTime > toTime) {
        return false;
      }
    }
    
    // Once per user check
    if (triggerData.oncePerUser) {
      try {
        const hasRun = await db.query(
          'SELECT id FROM bot_logs WHERE bot_id = $1 AND contact_id = $2 AND status = $3 LIMIT 1',
          [botId, contact.id, 'triggered']
        );
        if (hasRun.rows.length > 0) {
          return false;
        }
      } catch (err) {
      }
    }
    
    // Cooldown check
    if (triggerData.hasCooldown && (triggerData.cooldownValue || triggerData.cooldownHours)) {
      try {
        // Ensure created_at column exists
        await db.query(`ALTER TABLE bot_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`);
        
        let cooldownMs;
        if (triggerData.cooldownValue && triggerData.cooldownUnit) {
          const multipliers = { minutes: 60 * 1000, hours: 60 * 60 * 1000, days: 24 * 60 * 60 * 1000, weeks: 7 * 24 * 60 * 60 * 1000 };
          cooldownMs = triggerData.cooldownValue * (multipliers[triggerData.cooldownUnit] || multipliers.days);
        } else {
          cooldownMs = triggerData.cooldownHours * 60 * 60 * 1000;
        }
        const lastRun = await db.query(
          'SELECT created_at FROM bot_logs WHERE bot_id = $1 AND contact_id = $2 AND status = $3 ORDER BY created_at DESC LIMIT 1',
          [botId, contact.id, 'triggered']
        );
        if (lastRun.rows.length > 0 && lastRun.rows[0].created_at) {
          const lastRunTime = new Date(lastRun.rows[0].created_at).getTime();
          if (Date.now() - lastRunTime < cooldownMs) {
            return false;
          }
        }
      } catch (cooldownErr) {
      }
    }
    
    return true;
  }
  
  // Check a single trigger condition
  async checkSingleCondition(condition, message, contact) {
    const { type, operator, value, field } = condition;
    
    // any_message always matches
    if (type === 'any_message') {
      return true;
    }
    
    // first_message - check if this is the contact's first message
    // NOTE: The current message is already saved to DB, so we check if count is exactly 1
    if (type === 'first_message') {
      const countResult = await db.query(
        `SELECT COUNT(*) as count FROM messages WHERE contact_id = $1 AND direction = 'incoming'`,
        [contact.id]
      );
      const messageCount = parseInt(countResult.rows[0]?.count || 0);
      return messageCount === 1; // Exactly 1 means this is the first (current) message
    }
    
    // message_content - check the message content
    if (type === 'message_content') {
      return this.matchOperator(message, operator, value);
    }
    
    // contact_field - check a contact field
    if (type === 'contact_field') {
      const fieldValue = contact[field] || '';
      return this.matchOperator(fieldValue, operator, value);
    }
    
    // has_tag - check if contact has a specific tag
    if (type === 'has_tag') {
      const tags = await db.query(
        `SELECT t.name FROM tags t 
         JOIN contact_tags ct ON t.id = ct.tag_id 
         WHERE ct.contact_id = $1`,
        [contact.id]
      );
      const tagNames = tags.rows.map(t => t.name.toLowerCase());
      return tagNames.includes((value || '').toLowerCase());
    }
    
    // no_tag - check if contact does NOT have a specific tag
    if (type === 'no_tag') {
      const tags = await db.query(
        `SELECT t.name FROM tags t 
         JOIN contact_tags ct ON t.id = ct.tag_id 
         WHERE ct.contact_id = $1`,
        [contact.id]
      );
      const tagNames = tags.rows.map(t => t.name.toLowerCase());
      return !tagNames.includes((value || '').toLowerCase());
    }
    
    // contact_added - only matches when explicitly triggered
    if (type === 'contact_added') {
      return false;
    }
    
    // tag_added / tag_removed - only matches when explicitly triggered
    if (type === 'tag_added' || type === 'tag_removed') {
      return false;
    }
    
    // channel_message - check if this is a channel message
    if (type === 'channel_message') {
      const isChannel = contact._isChannel || false;
      if (!isChannel) return false;
      
      // If specific channel filter is set, check it
      if (condition.filterByChannel && condition.specificChannelId) {
        const channelId = contact._channelId || '';
        return channelId === condition.specificChannelId;
      }
      
      return true; // Any channel message matches
    }
    
    // Unified message_received trigger — filter by type and optional content
    if (type === 'message_received') {
      const msgType = condition.messageType || 'any';
      const mediaType = contact._mediaType || null;
      console.log('[Trigger] message_received check:', JSON.stringify({ msgType, mediaType, hasContentFilter: condition.hasContentFilter, operator: condition.operator, value: condition.value, message: message?.substring?.(0, 50) }));
      if (msgType === 'text' && mediaType) return false; // text only — no media
      if (msgType === 'image' && mediaType !== 'image') return false;
      if (msgType === 'video' && mediaType !== 'video') return false;
      if (msgType === 'audio' && mediaType !== 'audio' && mediaType !== 'ptt') return false;
      if (msgType === 'file' && mediaType !== 'document') return false;
      if (msgType === 'sticker' && mediaType !== 'sticker') return false;
      // Optional content filter (text/any only)
      if (condition.hasContentFilter && condition.operator && ['any', 'text'].includes(msgType)) {
        if (!['is_empty', 'is_not_empty'].includes(condition.operator) && condition.value) {
          return this.matchOperator(message, condition.operator, condition.value, condition.caseSensitive);
        }
        if (condition.operator === 'is_empty') return !message || message.trim() === '';
        if (condition.operator === 'is_not_empty') return !!(message && message.trim());
        // hasContentFilter=true but no valid filter configured (e.g. empty value) → don't match
        return false;
      }
      return true;
    }

    // media type triggers — use contact._mediaType (set from extraContext in processMessage)
    if (type === 'image_received') return contact._mediaType === 'image';
    if (type === 'video_received') return contact._mediaType === 'video';
    if (type === 'audio_received') return contact._mediaType === 'audio' || contact._mediaType === 'ptt';
    if (type === 'file_received') return contact._mediaType === 'document';

    // facebook_campaign - check if this message came from a Facebook ad/campaign
    if (type === 'facebook_campaign') {
      const entryPointSource = contact._entryPointSource || '';
      const externalAdReply = contact._externalAdReply || null;
      
      // Check for Facebook campaign indicators
      // - entryPointSource might be 'facebook_paid_ad', 'facebook_ad', etc.
      // - externalAdReply contains ad info if clicked through an ad
      const isFacebookCampaign = 
        (entryPointSource && entryPointSource.toLowerCase().includes('facebook')) ||
        (externalAdReply && (externalAdReply.title || externalAdReply.body));
      
      
      return isFacebookCampaign;
    }
    
    // no_message_in - check if contact hasn't sent a message in X time
    // NOTE: The current message is already saved to DB before bot engine processes it,
    // so we need to check the SECOND most recent message (skip the current one)
    if (type === 'no_message_in') {
      const timeValue = condition.timeValue || 1;
      const timeUnit = condition.timeUnit || 'days';
      
      const multiplier = {
        'minutes': 1,
        'hours': 60,
        'days': 60 * 24,
        'weeks': 60 * 24 * 7
      };
      
      const minutesAgo = timeValue * (multiplier[timeUnit] || multiplier.days);
      const cutoffTime = new Date(Date.now() - minutesAgo * 60 * 1000);
      
      // Get the PREVIOUS message from this contact (skip the current one which was just saved)
      // OFFSET 1 skips the most recent message (the current one being processed)
      const previousMessage = await db.query(
        `SELECT created_at FROM messages 
         WHERE contact_id = $1 AND direction = 'incoming'
         ORDER BY created_at DESC LIMIT 1 OFFSET 1`,
        [contact.id]
      );
      
      if (previousMessage.rows.length === 0) {
        // This is the first message ever from this contact - consider it as "no message in X time"
        return true;
      }
      
      const previousMessageTime = new Date(previousMessage.rows[0].created_at);
      const conditionMet = previousMessageTime < cutoffTime;
      return conditionMet;
    }
    
    // not_triggered_in - check if this bot wasn't triggered for this user in X time
    // Note: This needs botId context which we'll pass in the extra parameter
    if (type === 'not_triggered_in') {
      // This condition is checked at the group level, not here
      // Returning true here as the actual check happens in matchesTrigger
      return true;
    }
    
    // Event-based conditions - these only match via processEvent, not via regular message processing
    if (this.isEventCondition(type)) {
      return false;
    }
    
    return false;
  }
  
  // Match value against operator
  matchOperator(fieldValue, operator, compareValue) {
    const normalizedField = (fieldValue || '').toLowerCase();
    const normalizedValue = (compareValue || '').toLowerCase();
    
    switch (operator) {
      case 'contains':
        if (!normalizedValue) return false;
        return normalizedField.includes(normalizedValue);
      case 'not_contains':
        if (!normalizedValue) return false;
        return !normalizedField.includes(normalizedValue);
      case 'equals':
        return normalizedField === normalizedValue;
      case 'not_equals':
        return normalizedField !== normalizedValue;
      case 'starts_with':
        if (!normalizedValue) return false;
        return normalizedField.startsWith(normalizedValue);
      case 'ends_with':
        if (!normalizedValue) return false;
        return normalizedField.endsWith(normalizedValue);
      case 'regex':
        try {
          const regex = new RegExp(compareValue, 'i');
          return regex.test(fieldValue);
        } catch {
          return false;
        }
      case 'is_empty':
        return !fieldValue || fieldValue.trim() === '';
      case 'is_not_empty':
        return fieldValue && fieldValue.trim() !== '';
      default:
        if (!normalizedValue) return false;
        return normalizedField.includes(normalizedValue);
    }
  }
  
  // Execute a node
  async executeNode(nodeId, flowData, contact, message, userId, botId, botName = '', _visitedNodes = new Set(), runId = null) {
    // Infinite loop protection: track visited nodes in this execution chain
    const MAX_NODE_EXECUTIONS = 50;
    if (_visitedNodes.has(nodeId)) {
      console.warn(`[BotEngine] ⚠️ Loop detected! Node ${nodeId} already visited. Stopping.`);
      return;
    }
    if (_visitedNodes.size >= MAX_NODE_EXECUTIONS) {
      console.warn(`[BotEngine] ⚠️ Max node limit (${MAX_NODE_EXECUTIONS}) reached. Stopping to prevent infinite loop.`);
      return;
    }
    _visitedNodes.add(nodeId);

    const node = flowData.nodes.find(n => n.id === nodeId);
    if (!node) {
      return;
    }

    const stepStart = Date.now();
    const stepOrder = _visitedNodes.size;
    const nodeLabel = executionTracker.getNodeLabel(node);
    let stepStatus = 'completed';
    let stepError = null;
    let stepOutput = {};
    let nextHandleId = null;

    // Capture contact variables before execution for detailed logging
    let varsBefore = {};
    try {
      const vr = await db.query('SELECT key, value FROM contact_variables WHERE contact_id = $1', [contact.id]);
      varsBefore = Object.fromEntries(vr.rows.map(r => [r.key, r.value]));
    } catch (e) {}

    let stepInput = {};

    try {
      switch (node.type) {
        case 'message': {
          // Capture detailed message data
          const actions = node.data.actions || [];
          const resolvedActions = [];
          for (const action of actions) {
            const resolved = { type: action.type };
            if (action.type === 'text' && action.content) {
              resolved.resolvedText = await this.replaceAllVariables(action.content, contact, message, botName, userId);
              resolved.originalTemplate = action.content;
            } else if (['image', 'video', 'audio', 'file'].includes(action.type)) {
              resolved.mediaUrl = action.fileData || action.url;
              resolved.caption = action.caption ? await this.replaceAllVariables(action.caption, contact, message, botName, userId) : '';
            } else if (action.type === 'location') {
              resolved.latitude = action.latitude;
              resolved.longitude = action.longitude;
              resolved.title = action.title;
            } else if (action.type === 'reaction') {
              resolved.emoji = action.emoji;
            } else if (action.type === 'poll') {
              resolved.pollName = action.pollName;
              resolved.pollOptions = action.pollOptions;
            }
            resolvedActions.push(resolved);
          }
          stepInput = { actions: resolvedActions, waitForReply: node.data.waitForReply, timeout: node.data.timeout };

          const shouldWait = await this.executeMessageNode(node, contact, message, userId, botName, botId);
          if (shouldWait) {
            stepStatus = 'waiting';
            stepOutput = { waitingForReply: true, timeout: node.data.timeout, actionsSent: resolvedActions };
            await executionTracker.logStep(runId, nodeId, node.type, nodeLabel, stepOrder, {
              inputData: stepInput, outputData: stepOutput, status: stepStatus, durationMs: Date.now() - stepStart
            });
            return;
          }
          stepOutput = { actionsSent: resolvedActions };
          break;
        }

        case 'condition': {
          // Capture condition evaluation details
          const condGroup = node.data.conditionGroup || {};
          stepInput = { conditionGroup: condGroup, conditions: node.data.conditions, logic: node.data.logic };
          nextHandleId = await this.executeConditionNode(node, contact, message, userId);
          // Get current variable values for context
          let varsNow = {};
          try {
            const vr2 = await db.query('SELECT key, value FROM contact_variables WHERE contact_id = $1', [contact.id]);
            varsNow = Object.fromEntries(vr2.rows.map(r => [r.key, r.value]));
          } catch (e) {}
          stepOutput = {
            result: nextHandleId === 'yes' ? 'כן (true)' : 'לא (false)',
            handle: nextHandleId,
            evaluatedMessage: message,
            contactName: contact.display_name || contact.phone,
            variables: varsNow,
          };
          break;
        }

        case 'delay': {
          const delayActions = node.data.actions || [];
          const delayValue = node.data.delayValue || node.data.delay;
          const delayUnit = node.data.delayUnit || node.data.unit || 'seconds';
          stepInput = { delayValue, delayUnit, actions: delayActions };
          await this.executeDelayNode(node, contact, userId);
          const multipliers = { seconds: 1000, minutes: 60000, hours: 3600000 };
          stepOutput = { delayMs: (delayValue || 0) * (multipliers[delayUnit] || 1000), delayFormatted: `${delayValue} ${delayUnit}` };
          break;
        }

        case 'action': {
          const actionDetails = (node.data.actions || []).map(a => {
            const detail = { type: a.type };
            if (a.type === 'set_variable') { detail.varName = a.variableName; detail.varValue = a.variableValue; }
            if (a.type === 'add_tag' || a.type === 'remove_tag') { detail.tagName = a.tagName; }
            if (a.type === 'webhook') { detail.url = a.webhookUrl; }
            if (a.type === 'run_bot') { detail.botId = a.botId; }
            return detail;
          });
          stepInput = { actions: actionDetails };
          await this.executeActionNode(node, contact, userId);
          // Capture vars after to show what changed
          let varsAfter = {};
          try {
            const vr3 = await db.query('SELECT key, value FROM contact_variables WHERE contact_id = $1', [contact.id]);
            varsAfter = Object.fromEntries(vr3.rows.map(r => [r.key, r.value]));
          } catch (e) {}
          const changedVars = {};
          for (const [k, v] of Object.entries(varsAfter)) { if (varsBefore[k] !== v) changedVars[k] = { before: varsBefore[k] || null, after: v }; }
          for (const k of Object.keys(varsBefore)) { if (!(k in varsAfter)) changedVars[k] = { before: varsBefore[k], after: null }; }
          stepOutput = { actionsExecuted: actionDetails, variableChanges: changedVars };
          break;
        }

        case 'list': {
          const buttons = (node.data.buttons || []).map((b, i) => ({ index: i, title: b.title, description: b.description }));
          stepInput = { title: node.data.title, body: node.data.body, buttonText: node.data.buttonText, buttons, timeout: node.data.timeout };
          await this.executeListNode(node, contact, userId, botName, botId);
          stepStatus = 'waiting';
          stepOutput = { title: node.data.title, body: node.data.body, buttonsSent: buttons, timeout: node.data.timeout };
          await executionTracker.logStep(runId, nodeId, node.type, nodeLabel, stepOrder, {
            inputData: stepInput, outputData: stepOutput, status: stepStatus, durationMs: Date.now() - stepStart
          });
          return;
        }

        case 'registration': {
          const questions = (node.data.questions || []).map((q, i) => ({ index: i, question: q.question, varName: q.varName, type: q.type }));
          stepInput = { title: node.data.title, welcomeMessage: node.data.welcomeMessage, questions, cancelKeyword: node.data.cancelKeyword };
          await this.executeRegistrationNode(node, contact, message, userId, botName, botId);
          stepStatus = 'waiting';
          stepOutput = { questionsSent: questions, welcomeMessage: node.data.welcomeMessage, totalQuestions: questions.length };
          await executionTracker.logStep(runId, nodeId, node.type, nodeLabel, stepOrder, {
            inputData: stepInput, outputData: stepOutput, status: stepStatus, durationMs: Date.now() - stepStart
          });
          return;
        }

        case 'integration': {
          // Resolve all variables for tracking the actual API call
          const intActionsResolved = [];
          for (const a of (node.data.actions || [])) {
            const resolved = {
              type: a.type || 'http_request',
              method: a.method || 'GET',
              originalUrl: a.apiUrl,
              resolvedUrl: a.apiUrl ? await this.replaceAllVariables(a.apiUrl, contact, message, botName, userId) : '',
              headers: [],
              mappings: (a.mappings || []).map(m => ({ jsonPath: m.jsonPath || m.path, varName: m.variableName || m.varName })),
            };
            // Resolve headers
            if (a.headers && Array.isArray(a.headers)) {
              for (const h of a.headers) {
                if (h.key) {
                  resolved.headers.push({ key: h.key, value: await this.replaceAllVariables(h.value || '', contact, message, botName, userId) });
                }
              }
            }
            // Resolve body
            if (['POST', 'PUT', 'PATCH'].includes(a.method)) {
              resolved.bodyMode = a.bodyMode || 'raw';
              if (a.bodyMode === 'keyvalue' && a.bodyParams) {
                resolved.body = {};
                for (const p of a.bodyParams) {
                  if (p.key) resolved.body[p.key] = await this.replaceAllVariables(p.value || '', contact, message, botName, userId);
                }
              } else if (a.bodyMode === 'formdata' && a.bodyParams) {
                resolved.body = {};
                for (const p of a.bodyParams) {
                  if (p.key) resolved.body[p.key] = p.isFile ? (p.value || '[file]') : await this.replaceAllVariables(p.value || '', contact, message, botName, userId);
                }
              } else if (a.body) {
                try {
                  const parsed = JSON.parse(a.body);
                  resolved.body = await this.replaceAllVariablesInObject(parsed, contact, message, '');
                } catch {
                  resolved.body = await this.replaceAllVariables(a.body, contact, message, botName, userId);
                }
              }
            }
            intActionsResolved.push(resolved);
          }
          stepInput = { actions: intActionsResolved };
          // Execute and capture response data
          node._trackingData = {};
          await this.executeIntegrationNode(node, contact, userId, message);
          let varsAfterInt = {};
          try {
            const vr4 = await db.query('SELECT key, value FROM contact_variables WHERE contact_id = $1', [contact.id]);
            varsAfterInt = Object.fromEntries(vr4.rows.map(r => [r.key, r.value]));
          } catch (e) {}
          const intChanges = {};
          for (const [k, v] of Object.entries(varsAfterInt)) { if (varsBefore[k] !== v) intChanges[k] = { before: varsBefore[k] || null, after: v }; }
          // Collect response data from executed actions
          const apiResponses = [];
          for (const a of (node.data.actions || [])) {
            if (a._lastResponse) { apiResponses.push(a._lastResponse); delete a._lastResponse; }
          }
          stepOutput = { actions: intActionsResolved, variableChanges: intChanges, apiResponses };
          break;
        }

        case 'google_sheets': {
          const gsActions = (node.data.actions || []).map(a => ({
            operation: a.operation, spreadsheetId: a.spreadsheetId, sheetName: a.sheetName
          }));
          stepInput = { actions: gsActions };
          await this.executeGoogleSheetsNode(node, contact, userId);
          let varsAfterGs = {};
          try {
            const vr5 = await db.query('SELECT key, value FROM contact_variables WHERE contact_id = $1', [contact.id]);
            varsAfterGs = Object.fromEntries(vr5.rows.map(r => [r.key, r.value]));
          } catch (e) {}
          const gsChanges = {};
          for (const [k, v] of Object.entries(varsAfterGs)) { if (varsBefore[k] !== v) gsChanges[k] = { before: varsBefore[k] || null, after: v }; }
          stepOutput = { operations: gsActions, variableChanges: gsChanges };
          break;
        }

        case 'google_contacts': {
          const gcActions = (node.data.actions || []).map(a => ({
            operation: a.operation, searchBy: a.searchBy, searchValue: a.searchValue
          }));
          stepInput = { actions: gcActions };
          await this.executeGoogleContactsNode(node, contact, userId);
          let varsAfterGc = {};
          try {
            const vr6 = await db.query('SELECT key, value FROM contact_variables WHERE contact_id = $1', [contact.id]);
            varsAfterGc = Object.fromEntries(vr6.rows.map(r => [r.key, r.value]));
          } catch (e) {}
          const gcChanges = {};
          for (const [k, v] of Object.entries(varsAfterGc)) { if (varsBefore[k] !== v) gcChanges[k] = { before: varsBefore[k] || null, after: v }; }
          stepOutput = { operations: gcActions, variableChanges: gcChanges };
          break;
        }

        case 'note':
          stepStatus = 'skipped';
          stepOutput = { note: (node.data.note || '').substring(0, 200) };
          break;

        case 'send_other': {
          const recipient = node.data.recipient || {};
          // Resolve all variables in actions for tracking
          const soActions = [];
          for (const a of (node.data.actions || [])) {
            const r = { type: a.type };
            if (a.type === 'text' && a.content) {
              r.resolvedText = await this.replaceAllVariables(a.content, contact, message, botName, userId);
              r.originalTemplate = a.content;
            }
            if (['image', 'video', 'audio', 'file'].includes(a.type)) {
              r.mediaUrl = a.fileData || a.url;
              r.caption = a.caption ? await this.replaceAllVariables(a.caption, contact, message, botName, userId) : '';
            }
            if (a.type === 'location') { r.latitude = a.latitude; r.longitude = a.longitude; }
            if (a.type === 'contact') { r.contactName = a.contactName; r.contactPhone = a.contactPhone; }
            soActions.push(r);
          }
          // Resolve recipient ID
          let resolvedRecipientId = recipient.phone || recipient.groupId || recipient.channelId || '';
          if (recipient.useVariable && recipient.variableName) {
            resolvedRecipientId = await this.replaceAllVariables(`{{${recipient.variableName.replace(/^\{\{/, '').replace(/\}\}$/, '')}}}`, contact, message, botName, userId);
          } else if (resolvedRecipientId) {
            resolvedRecipientId = await this.replaceAllVariables(resolvedRecipientId, contact, message, botName, userId);
          }
          stepInput = { recipient: { type: recipient.type, phone: recipient.phone, groupId: recipient.groupId, resolvedId: resolvedRecipientId }, actions: soActions };
          await this.executeSendOtherNode(node, contact, userId, message);
          stepOutput = { recipientType: recipient.type, recipientId: resolvedRecipientId, actionsSent: soActions };
          break;
        }

        case 'formula': {
          const steps = (node.data.steps || []).map(s => ({ expression: s.expression, outputVar: s.outputVar }));
          stepInput = { steps };
          await this.executeFormulaNode(node, contact, userId, message);
          let varsAfterF = {};
          try {
            const vr7 = await db.query('SELECT key, value FROM contact_variables WHERE contact_id = $1', [contact.id]);
            varsAfterF = Object.fromEntries(vr7.rows.map(r => [r.key, r.value]));
          } catch (e) {}
          const fResults = steps.map(s => ({ expression: s.expression, outputVar: s.outputVar, result: varsAfterF[s.outputVar] || null }));
          stepOutput = { formulaResults: fResults };
          break;
        }
      }
    } catch (nodeError) {
      stepStatus = 'error';
      stepError = nodeError.message;
      await executionTracker.logStep(runId, nodeId, node.type, nodeLabel, stepOrder, {
        inputData: stepInput, outputData: {}, status: 'error', errorMessage: nodeError.message, durationMs: Date.now() - stepStart
      });
      throw nodeError;
    }

    // Log successful step with detailed data
    await executionTracker.logStep(runId, nodeId, node.type, nodeLabel, stepOrder, {
      inputData: stepInput,
      outputData: stepOutput,
      status: stepStatus,
      nextHandle: nextHandleId,
      durationMs: Date.now() - stepStart
    });

    // Find all next edges (support multiple outputs)
    let nextEdges;
    if (nextHandleId) {
      nextEdges = flowData.edges.filter(e => e.source === nodeId && e.sourceHandle === nextHandleId);
    } else {
      // Get all edges without specific handle
      nextEdges = flowData.edges.filter(e => e.source === nodeId && !e.sourceHandle);
    }

    if (nextEdges.length === 0 && !nextHandleId) {
      // Fallback - get any edge from this node
      nextEdges = flowData.edges.filter(e => e.source === nodeId);
    }

    if (nextEdges.length > 0) {
      // Sort by target node Y position (higher first)
      const sortedEdges = nextEdges.sort((a, b) => {
        const nodeA = flowData.nodes.find(n => n.id === a.target);
        const nodeB = flowData.nodes.find(n => n.id === b.target);
        const posA = nodeA?.position?.y || 0;
        const posB = nodeB?.position?.y || 0;
        return posA - posB; // Lower Y first (top to bottom)
      });


      // Execute all branches sequentially (top to bottom)
      for (const edge of sortedEdges) {
        await this.executeNode(edge.target, flowData, contact, message, userId, botId, botName, _visitedNodes, runId);
      }
    }
  }
  
  // Execute message node - returns true if waiting for reply
  async executeMessageNode(node, contact, originalMessage, userId, botName = '', botId = null) {
    const actions = node.data.actions || [];
    const waitForReply = node.data.waitForReply || false;
    const timeout = node.data.timeout || null;
    
    
    // Get WAHA connection
    const connection = await this.getConnection(userId);
    if (!connection) {
      return false;
    }
    
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      
      try {
        switch (action.type) {
          case 'text':
            if (action.content) {
              const text = await this.replaceAllVariables(action.content, contact, originalMessage, botName, userId);

              // Skip empty messages - don't send but continue flow
              if (!text || !text.trim()) {
                break;
              }


              // Build mentions list — triggered by @כולם in text or explicit mentionAll flag
              let mentions = null;
              const hasMentionAll = action.mentionAll || /@כולם/.test(text);
              if (hasMentionAll && contact.phone.includes('@g.us')) {
                try {
                  const participants = await wahaService.getGroupParticipants(connection, contact.phone);
                  mentions = (participants || []).map(p => p.PhoneNumber || p.id || p).filter(Boolean);
                } catch (e) {
                  console.warn('[BotEngine] mentionAll: failed to get participants:', e.message);
                }
              }

              let result;
              // Check if custom link preview is configured
              if (action.customLinkPreview && action.linkPreviewUrl) {
                const previewImage = action.linkPreviewImage
                  ? await this.replaceAllVariables(action.linkPreviewImage, contact, originalMessage, botName, userId)
                  : null;
                const preview = {
                  url: await this.replaceAllVariables(action.linkPreviewUrl, contact, originalMessage, botName, userId),
                  title: action.linkPreviewTitle ? await this.replaceAllVariables(action.linkPreviewTitle, contact, originalMessage, botName, userId) : undefined,
                  description: action.linkPreviewDescription ? await this.replaceAllVariables(action.linkPreviewDescription, contact, originalMessage, botName, userId) : undefined,
                };
                if (previewImage) {
                  preview.image = { url: previewImage };
                }
                result = await wahaService.sendLinkPreview(connection, contact.phone, text, preview, mentions);
              } else {
                result = await wahaService.sendMessage(connection, contact.phone, text, mentions);
              }
              // Save outgoing message to DB
              await this.saveOutgoingMessage(userId, contact.id, text, 'text', null, result?.id?.id);
            }
            break;

          case 'poll':
            if (action.pollName && action.pollOptions?.length >= 2) {
              const pollName = await this.replaceAllVariables(action.pollName, contact, originalMessage, botName, userId);
              const pollOptions = await Promise.all(
                action.pollOptions.map(opt => this.replaceAllVariables(opt, contact, originalMessage, botName, userId))
              );
              const pollResult = await wahaService.sendPoll(connection, contact.phone, pollName, pollOptions, action.pollMultipleAnswers || false);
              await this.saveOutgoingMessage(userId, contact.id, `📊 ${pollName}`, 'text', null, pollResult?.id?.id);
            } else {
            }
            break;

          case 'image':
            if (action.url || action.fileData) {
              const imageUrl = action.fileData || await this.replaceAllVariables(action.url, contact, originalMessage, botName, userId);
              const caption = await this.replaceAllVariables(action.caption || '', contact, originalMessage, botName, userId);
              const result = await wahaService.sendImage(connection, contact.phone, imageUrl, caption);
              // Save outgoing message to DB
              await this.saveOutgoingMessage(userId, contact.id, caption || '', 'image', imageUrl, result?.id?.id);
            } else {
            }
            break;
            
          case 'video':
            if (action.url || action.fileData) {
              const videoUrl = action.fileData || await this.replaceAllVariables(action.url, contact, originalMessage, botName, userId);
              const caption = await this.replaceAllVariables(action.caption || '', contact, originalMessage, botName, userId);
              const result = await wahaService.sendVideo(connection, contact.phone, videoUrl, caption);
              // Save outgoing message to DB
              await this.saveOutgoingMessage(userId, contact.id, caption || '', 'video', videoUrl, result?.id?.id);
            } else {
            }
            break;
            
          case 'audio':
            if (action.url || action.fileData) {
              const audioUrl = action.fileData || await this.replaceAllVariables(action.url, contact, originalMessage, botName, userId);
              const result = await wahaService.sendVoice(connection, contact.phone, audioUrl);
              // Save outgoing message to DB
              await this.saveOutgoingMessage(userId, contact.id, '', 'audio', audioUrl, result?.id?.id);
            } else {
            }
            break;
            
          case 'file':
            if (action.url || action.fileData) {
              const fileUrl = action.fileData || await this.replaceAllVariables(action.url, contact, originalMessage, botName, userId);
              // Ensure we have a filename - use custom if provided, or extract from URL
              let filename = action.customFilename || action.fileName || action.filename || 'file';
              
              // If custom filename provided, preserve original extension
              if (action.customFilename && action.fileName) {
                const originalExt = action.fileName.split('.').pop();
                if (!action.customFilename.includes('.')) {
                  filename = `${action.customFilename}.${originalExt}`;
                }
              }
              
              if (!filename || filename === 'file') {
                // Try to extract from URL
                try {
                  const urlPath = new URL(fileUrl.startsWith('data:') ? '' : fileUrl).pathname;
                  filename = urlPath.split('/').pop() || 'file';
                } catch {
                  filename = 'file';
                }
              }
              // Detect mimetype from filename or action
              let mimetype = action.mimetype;
              if (!mimetype && filename) {
                const ext = filename.toLowerCase().split('.').pop();
                const mimetypes = {
                  'pdf': 'application/pdf',
                  'doc': 'application/msword',
                  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                  'xls': 'application/vnd.ms-excel',
                  'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                  'ppt': 'application/vnd.ms-powerpoint',
                  'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                  'txt': 'text/plain',
                  'zip': 'application/zip',
                  'rar': 'application/x-rar-compressed',
                  'csv': 'text/csv',
                };
                mimetype = mimetypes[ext] || 'application/octet-stream';
              }
              const fileResult = await wahaService.sendFile(connection, contact.phone, fileUrl, filename, mimetype);
              await this.saveOutgoingMessage(userId, contact.id, filename, 'document', fileUrl, fileResult?.id?.id, { filename, mimetype });
            } else {
            }
            break;
            
          case 'delay':
            const ms = (action.delay || 1) * (action.unit === 'minutes' ? 60000 : 1000);
            await this.sleep(ms);
            break;
            
          case 'contact':
            if (action.contactPhone) {
              const contactName = this.replaceVariables(action.contactName || '', contact, originalMessage, botName);
              const contactPhoneNum = this.replaceVariables(action.contactPhone || '', contact, originalMessage, botName);
              const contactOrg = action.contactOrg || '';
              await wahaService.sendContactVcard(connection, contact.phone, contactName, contactPhoneNum, contactOrg);
              // Save vCard content for display
              const vcardContent = `BEGIN:VCARD\nVERSION:3.0\nFN:${contactName}\nTEL:${contactPhoneNum}\n${contactOrg ? `ORG:${contactOrg};\n` : ''}END:VCARD`;
              await this.saveOutgoingMessage(userId, contact.id, vcardContent, 'vcard', null, null);
            } else {
            }
            break;
          
          case 'location':
            if (action.latitude && action.longitude) {
              const title = this.replaceVariables(action.locationTitle || '', contact, originalMessage, botName);
              await wahaService.sendLocation(connection, contact.phone, action.latitude, action.longitude, title);
              await this.saveOutgoingMessage(userId, contact.id, title || 'מיקום', 'location', null, null, { latitude: action.latitude, longitude: action.longitude });
            } else {
            }
            break;
          
          case 'typing':
            {
              const duration = Math.min(30, Math.max(1, action.typingDuration || 3));
              await wahaService.startTyping(connection, contact.phone);
              await this.sleep(duration * 1000);
              await wahaService.stopTyping(connection, contact.phone);
            }
            break;
          
          case 'mark_seen':
            {
              // Get the last incoming message ID from database
              const lastSeenMsg = await db.query(
                `SELECT wa_message_id FROM messages 
                 WHERE contact_id = $1 AND direction = $2 AND wa_message_id IS NOT NULL
                 ORDER BY created_at DESC LIMIT 1`,
                [contact.id, 'incoming']
              );
              if (lastSeenMsg.rows.length > 0 && lastSeenMsg.rows[0].wa_message_id) {
                await wahaService.sendSeen(connection, contact.phone, [lastSeenMsg.rows[0].wa_message_id]);
              } else {
                // Fallback to just chat seen
                await wahaService.sendSeen(connection, contact.phone, []);
              }
            }
            break;
          
          case 'reaction':
            if (action.reaction) {
              // Get the last incoming message ID from database
              const lastReactMsg = await db.query(
                `SELECT id, wa_message_id FROM messages
                 WHERE contact_id = $1 AND direction = $2 AND wa_message_id IS NOT NULL
                 ORDER BY created_at DESC LIMIT 1`,
                [contact.id, 'incoming']
              );
              if (lastReactMsg.rows.length > 0 && lastReactMsg.rows[0].wa_message_id) {
                const rawMsgId = lastReactMsg.rows[0].wa_message_id;
                const msgId = await this.resolveMsgIdLid(connection, rawMsgId);
                const dbMsgId = lastReactMsg.rows[0].id;
                try {
                  await wahaService.sendReaction(connection, msgId, action.reaction);

                  // Update the original message with the reaction (don't create new message)
                  await db.query(
                    `UPDATE messages SET metadata = COALESCE(metadata, '{}'::jsonb) || $1 WHERE id = $2`,
                    [JSON.stringify({ reaction: action.reaction }), dbMsgId]
                  );

                  // Emit reaction update via socket
                  const socketManager = getSocketManager();
                  socketManager.emitToUser(userId, 'message_reaction', {
                    messageId: dbMsgId,
                    reaction: action.reaction
                  });

                } catch (reactionErr) {
                  console.warn('[BotEngine] ⚠️ Reaction failed (continuing flow):', reactionErr.response?.data || reactionErr.message);
                }
              } else {
              }
            }
            break;
            
          case 'wait_reply': {
            // Wait for reply action - save session and stop processing
            if (botId) {
              let waitTimeout = null;
              if (action.timeout) {
                const unit = action.timeoutUnit || 'seconds';
                const multiplier = unit === 'hours' ? 3600 : unit === 'minutes' ? 60 : 1;
                waitTimeout = action.timeout * multiplier;
              }
              const waitData = {
                saveToVariable: action.saveToVariable || false,
                variableName: action.variableName || '',
                textOnly: action.textOnly !== false, // Default true - only accept text replies
                invalidReplyMessage: action.invalidReplyMessage || 'התגובה לא תקינה. אנא שלח הודעת טקסט בלבד.',
                sourceGroupId: contact._groupId || null, // Track message source so only same-source replies continue the session
              };
              await this.saveSession(botId, contact.id, node.id, 'reply', waitData, waitTimeout);
              return true;
            }
            break;
          }
            
          default:
        }
      } catch (actionError) {
        console.error(`[BotEngine] ❌ Action ${action.type} failed:`, actionError.message);
      }
      
      // Small delay between actions to avoid rate limiting
      if (i < actions.length - 1) {
        await this.sleep(500);
      }
    }
    
    // If waitForReply is enabled (old mechanism), save session and return true
    if (waitForReply && botId) {
      const waitData = {
        textOnly: node.data.textOnly !== false, // Default true
        invalidReplyMessage: node.data.invalidReplyMessage || 'התגובה לא תקינה. אנא שלח הודעת טקסט בלבד.',
        sourceGroupId: contact._groupId || null, // Track message source so only same-source replies continue the session
      };
      await this.saveSession(botId, contact.id, node.id, 'reply', waitData, timeout);
      return true;
    }
    
    return false;
  }
  
  // Execute condition node
  async executeConditionNode(node, contact, message, userId = null) {
    const data = node.data;
    
    // Support new conditionGroup format or old single condition format
    let result;
    if (data.conditionGroup) {
      result = await this.evaluateConditionGroup(data.conditionGroup, contact, message, userId);
    } else {
      // Old format - single condition
      result = await this.evaluateSingleCondition(data, contact, message, userId);
    }
    
    return result ? 'yes' : 'no';
  }
  
  // Evaluate a group of conditions with AND/OR logic
  async evaluateConditionGroup(group, contact, message, userId = null) {
    const conditions = group.conditions || [];
    const logic = group.logic || 'AND';
    
    if (conditions.length === 0) return true;
    
    const results = [];
    for (const cond of conditions) {
      if (cond.isGroup) {
        results.push(await this.evaluateConditionGroup(cond, contact, message, userId));
      } else {
        results.push(await this.evaluateSingleCondition(cond, contact, message, userId));
      }
    }
    
    if (logic === 'AND') {
      return results.every(r => r === true);
    } else {
      return results.some(r => r === true);
    }
  }
  
  // Evaluate a single condition
  async evaluateSingleCondition(condition, contact, message, userId = null) {
    const { variable, operator, value, varName } = condition;
    let checkValue = '';
    
    
    // Resolve value if it contains variables like {{varName}}
    let resolvedValue = value || '';
    if (resolvedValue.includes('{{')) {
      resolvedValue = await this.replaceAllVariables(resolvedValue, contact, message, '', userId);
    }
    
    // Resolve varName if it contains variables (for has_tag)
    let resolvedVarName = varName || '';
    if (resolvedVarName.includes('{{')) {
      // Extract just the variable name from {{varName}} for tag checks
      resolvedVarName = resolvedVarName.replace(/\{\{|\}\}/g, '').trim();
    }
    
    // Israel timezone for time checks
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
    
    // Get value to check
    switch (variable) {
      case 'message':
      case 'last_message':
        checkValue = message || '';
        break;
      case 'contact_name':
        checkValue = contact.display_name || '';
        break;
      case 'phone':
        checkValue = contact.phone || '';
        break;
      case 'is_first_contact':
        // Use message_count if available, otherwise assume not first contact
        // Note: Proper check is done in trigger conditions where we can use async
        checkValue = (contact.message_count === 1) ? 'true' : 'false';
        break;
      case 'message_type':
        checkValue = 'text'; // TODO: get actual message type
        break;
      case 'time':
        checkValue = now.toTimeString().slice(0, 5); // HH:MM
        break;
      case 'day':
        checkValue = String(now.getDay());
        break;
      case 'date':
        checkValue = now.toISOString().slice(0, 10);
        break;
      case 'random':
        checkValue = String(Math.floor(Math.random() * 100) + 1);
        break;
      case 'has_tag':
        // Check if contact has tag
        if (resolvedVarName) {
          try {
            const tagResult = await db.query(
              `SELECT 1 FROM contact_tags ct 
               JOIN tags t ON ct.tag_id = t.id 
               WHERE ct.contact_id = $1 AND LOWER(t.name) = LOWER($2)`,
              [contact.id, resolvedVarName]
            );
            checkValue = tagResult.rows.length > 0 ? 'true' : 'false';
          } catch (err) {
            console.error('[BotEngine] Error checking tag:', err.message);
            checkValue = 'false';
          }
        }
        break;
      case 'contact_var':
        // Get variable value - support both {{varName}} syntax and plain variable names
        if (varName) {
          // If it contains {{...}}, resolve it using replaceAllVariables
          if (varName.includes('{{')) {
            checkValue = await this.replaceAllVariables(varName, contact, message, '', userId);
          } else {
            // Plain variable name - query from contact_variables table
            try {
              const varResult = await db.query(
                'SELECT value FROM contact_variables WHERE contact_id = $1 AND key = $2',
                [contact.id, varName]
              );
              checkValue = varResult.rows[0]?.value || '';
            } catch (err) {
              console.error('[BotEngine] Error getting variable:', err.message);
              checkValue = '';
            }
          }
        }
        break;
      default:
        checkValue = '';
    }
    
    // Check condition
    const lowerCheck = (checkValue || '').toLowerCase();
    const lowerValue = (resolvedValue || '').toLowerCase();
    
    // Helper to normalize boolean-like values to canonical form
    const normalizeBooleanValue = (val) => {
      const lower = String(val).toLowerCase().trim();
      if (['true', 'כן', 'yes', '1'].includes(lower) || val === true) return 'true';
      if (['false', 'לא', 'no', '0'].includes(lower) || val === false) return 'false';
      return lower;
    };
    
    
    switch (operator) {
      case 'equals':
        // First try normalized boolean comparison, then regular comparison
        if (normalizeBooleanValue(checkValue) === normalizeBooleanValue(resolvedValue)) return true;
        return lowerCheck === lowerValue;
      case 'not_equals':
        // First try normalized boolean comparison
        if (normalizeBooleanValue(checkValue) === normalizeBooleanValue(resolvedValue)) return false;
        return lowerCheck !== lowerValue;
      case 'contains':
        return lowerCheck.includes(lowerValue);
      case 'not_contains':
        return !lowerCheck.includes(lowerValue);
      case 'starts_with':
        return lowerCheck.startsWith(lowerValue);
      case 'ends_with':
        return lowerCheck.endsWith(lowerValue);
      case 'greater_than':
        return parseFloat(checkValue) > parseFloat(resolvedValue);
      case 'less_than':
        return parseFloat(checkValue) < parseFloat(resolvedValue);
      case 'greater_or_equal':
        return parseFloat(checkValue) >= parseFloat(resolvedValue);
      case 'less_or_equal':
        return parseFloat(checkValue) <= parseFloat(resolvedValue);
      case 'is_empty':
        return (checkValue || '').trim() === '';
      case 'is_not_empty':
        return (checkValue || '').trim() !== '';
      case 'is_true':
        // Accept: true, 'true', 'כן', 'yes', '1'
        return checkValue === true || 
               ['true', 'כן', 'yes', '1'].includes(String(checkValue).toLowerCase().trim());
      case 'is_false':
        // Accept: false, 'false', 'לא', 'no', '0', ''
        return checkValue === false || 
               checkValue === '' || 
               ['false', 'לא', 'no', '0'].includes(String(checkValue).toLowerCase().trim());
      case 'matches_regex':
        try {
          return new RegExp(resolvedValue, 'i').test(checkValue);
        } catch {
          return false;
        }
      case 'is_text':
        // Check if it's plain text (not a number, not special)
        return typeof checkValue === 'string' && checkValue.trim() !== '' && isNaN(parseFloat(checkValue));
      case 'is_number':
        return !isNaN(parseFloat(checkValue)) && isFinite(checkValue);
      case 'is_email':
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(checkValue);
      case 'is_phone':
        // Support formats: 0500000000, 972500000000, 050-0000000, 050-000-0000, +972-50-000-0000
        const phoneClean = (checkValue || '').replace(/[-\s+]/g, '');
        return /^(0[0-9]{9}|972[0-9]{9}|[0-9]{10,12})$/.test(phoneClean);
      case 'is_image':
        return condition.messageType === 'image';
      case 'is_video':
        return condition.messageType === 'video';
      case 'is_audio':
        return condition.messageType === 'audio';
      case 'is_document':
        return condition.messageType === 'document';
      case 'is_pdf':
        return condition.messageType === 'document' && (condition.fileName || '').toLowerCase().endsWith('.pdf');
      default:
        return false;
    }
  }
  
  // Execute delay node
  async executeDelayNode(node, contact, userId) {
    // Support both old format (delay, unit) and new format (actions array)
    if (node.data.actions && Array.isArray(node.data.actions)) {
      // Skip if no actions
      if (node.data.actions.length === 0) {
        return;
      }
      
      const connection = await this.getConnection(userId);
      
      for (const action of node.data.actions) {
        if (action.type === 'delay') {
          const ms = (action.delay || 1) * (action.unit === 'minutes' ? 60000 : 1000);
          await this.sleep(ms);
        } else if (action.type === 'typing') {
          if (connection) {
            const duration = Math.min(30, Math.max(1, action.typingDuration || 3));
            await wahaService.startTyping(connection, contact.phone);
            await this.sleep(duration * 1000);
            await wahaService.stopTyping(connection, contact.phone);
          }
        }
      }
    } else if (node.data.delay || node.data.unit) {
      // Old format fallback - only if delay or unit exists
      const { delay, unit } = node.data;
      const ms = (delay || 1) * (unit === 'minutes' ? 60000 : unit === 'hours' ? 3600000 : 1000);
      await this.sleep(ms);
    } else {
    }
  }
  
  // Execute action node
  async executeActionNode(node, contact, userId) {
    const actions = node.data.actions || [];
    
    for (const action of actions) {
      switch (action.type) {
        case 'add_tag':
          if (action.tagName) {
            await this.addTagToContact(contact.id, action.tagName, userId);
          }
          break;
          
        case 'remove_tag':
          if (action.tagName) {
            await this.removeTagFromContact(contact.id, action.tagName, userId);
          }
          break;
          
        case 'set_variable':
          if (action.varKey) {
            await this.setContactVariable(contact.id, action.varKey, action.varValue || '');
          }
          break;
          
        case 'delete_variable':
          if (action.varName) {
            await this.deleteContactVariable(contact.id, action.varName);
          }
          break;
          
        case 'delay':
          {
            let delayMs = (action.delay || 1) * 1000; // default to seconds
            if (action.unit === 'minutes') {
              delayMs = (action.delay || 1) * 60 * 1000;
            }
            delayMs = Math.min(delayMs, 5 * 60 * 1000); // max 5 minutes
            await this.sleep(delayMs);
          }
          break;
          
        case 'stop_bot':
          await db.query('UPDATE contacts SET is_bot_active = false WHERE id = $1', [contact.id]);
          break;

        case 'run_bot':
          if (action.botId) {
            // Verify the target bot belongs to this user
            const targetBotCheck = await db.query(
              'SELECT id FROM bots WHERE id = $1 AND user_id = $2 AND is_active = true AND locked_reason IS NULL',
              [action.botId, userId]
            );
            if (targetBotCheck.rows.length > 0) {
              // Fire bot_activated event for the target bot
              setImmediate(() => {
                this.processEvent(userId, contact.phone, 'bot_activated', { botId: action.botId }).catch(err => {
                  console.error('[BotEngine] run_bot processEvent error:', err.message);
                });
              });
            }
          }
          break;

        case 'disable_bot':
          if (action.botId) {
            try {
              await db.query(
                `INSERT INTO contact_disabled_bots (contact_id, bot_id, created_at)
                 VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING`,
                [contact.id, action.botId]
              );
            } catch (e) {
              // Table may not exist
              console.warn('[BotEngine] contact_disabled_bots table missing:', e.message);
            }
          }
          break;

        case 'pause_all_bots':
          await db.query('UPDATE contacts SET is_bot_active = false WHERE id = $1', [contact.id]);
          break;

        case 'enable_all_bots':
          await db.query('UPDATE contacts SET is_bot_active = true WHERE id = $1', [contact.id]);
          break;

        case 'delete_contact':
          await db.query('DELETE FROM contacts WHERE id = $1', [contact.id]);
          break;
          
        case 'webhook':
          if (action.webhookUrl) {
            await this.sendWebhook(action.webhookUrl, contact);
          }
          break;
          
        case 'http_request':
          await this.executeHttpRequest(action, contact);
          break;

        case 'download_file':
          if (action.fileUrl && action.variableName) {
            await this.executeDownloadFile(action, contact, userId);
          }
          break;

        // ========== NEW WHATSAPP ACTIONS ==========
        case 'send_voice':
          if (action.audioUrl) {
            const connection = await this.getConnection(userId);
            if (connection) {
              await wahaService.sendVoice(connection, contact.phone, action.audioUrl);
            }
          }
          break;
          
        case 'send_file':
          if (action.fileUrl) {
            const connection = await this.getConnection(userId);
            if (connection) {
              await wahaService.sendFileAdvanced(connection, contact.phone, {
                url: action.fileUrl,
                filename: action.filename || 'file',
                mimetype: action.mimetype || 'application/pdf'
              });
            }
          }
          break;
          
        case 'send_location':
          if (action.latitude && action.longitude) {
            const connection = await this.getConnection(userId);
            if (connection) {
              await wahaService.sendLocation(connection, contact.phone, action.latitude, action.longitude, action.locationTitle || '');
            }
          }
          break;
          
        case 'send_contact':
          if (action.contactPhone) {
            const connection = await this.getConnection(userId);
            if (connection) {
              const contactName = this.replaceVariables(action.contactName || '', contact, originalMessage, botName);
              const contactPhone = this.replaceVariables(action.contactPhone || '', contact, originalMessage, botName);
              const contactOrg = action.contactOrg || '';
              await wahaService.sendContactVcard(connection, contact.phone, contactName, contactPhone, contactOrg);
            }
          }
          break;
          
        case 'send_link_preview':
          if (action.linkText && action.linkUrl) {
            const connection = await this.getConnection(userId);
            if (connection) {
              await wahaService.sendLinkPreview(connection, contact.phone, action.linkText, {
                url: action.linkUrl,
                title: action.linkTitle || '',
                description: action.linkDescription || '',
                image: action.linkImage ? { url: action.linkImage } : undefined
              });
            }
          }
          break;
          
        case 'mark_seen':
          {
            const connection = await this.getConnection(userId);
            if (connection) {
              await wahaService.sendSeen(connection, contact.phone);
            }
          }
          break;
          
        case 'typing':
          {
            const connection = await this.getConnection(userId);
            if (connection) {
              const duration = Math.min(30, Math.max(1, action.typingDuration || 3));
              await wahaService.startTyping(connection, contact.phone);
              await this.sleep(duration * 1000);
              await wahaService.stopTyping(connection, contact.phone);
            }
          }
          break;
          
        // Keep old actions for backward compatibility
        case 'start_typing':
          {
            const connection = await this.getConnection(userId);
            if (connection) {
              await wahaService.startTyping(connection, contact.phone);
            }
          }
          break;
          
        case 'stop_typing':
          {
            const connection = await this.getConnection(userId);
            if (connection) {
              await wahaService.stopTyping(connection, contact.phone);
            }
          }
          break;
          
        case 'send_reaction':
          if (action.reaction) {
            const connection = await this.getConnection(userId);
            if (connection) {
              // Get last message ID from contact
              const lastMsg = await db.query(
                'SELECT wa_message_id FROM messages WHERE contact_id = $1 AND direction = $2 ORDER BY sent_at DESC LIMIT 1',
                [contact.id, 'incoming']
              );
              if (lastMsg.rows.length > 0 && lastMsg.rows[0].wa_message_id) {
                const rawId = lastMsg.rows[0].wa_message_id;
                const resolvedId = await this.resolveMsgIdLid(connection, rawId);
                await wahaService.sendReaction(connection, resolvedId, action.reaction);
              }
            }
          }
          break;
          
        // ========== GROUP ACTIONS ==========
        case 'add_to_group':
          if (action.groupId) {
            const connection = await this.getConnection(userId);
            if (connection) {
              await wahaService.addGroupParticipants(connection, action.groupId, [contact.phone]);
            }
          }
          break;
          
        case 'remove_from_group':
          if (action.groupId) {
            const connection = await this.getConnection(userId);
            if (connection) {
              await wahaService.removeGroupParticipants(connection, action.groupId, [contact.phone]);
            }
          }
          break;
          
        case 'check_group_member':
          if (action.groupId) {
            const connection = await this.getConnection(userId);
            if (connection) {
              try {
                const participants = await wahaService.getGroupParticipants(connection, action.groupId);
                const isMember = participants.some(p => p.id?.includes(contact.phone) || p.phone === contact.phone);
                const varName = action.resultVar || 'is_member';
                await this.setContactVariable(contact.id, varName, isMember ? 'true' : 'false');
              } catch (err) {
                console.error('[BotEngine] Group check error:', err.message);
                await this.setContactVariable(contact.id, action.resultVar || 'is_member', 'false');
              }
            }
          }
          break;
          
        case 'set_group_admin_only':
          if (action.groupId) {
            const connection = await this.getConnection(userId);
            if (connection) {
              await wahaService.setGroupAdminOnly(connection, action.groupId, action.adminsOnly);
            }
          }
          break;
          
        case 'update_group_subject':
          if (action.groupId && action.groupSubject) {
            const connection = await this.getConnection(userId);
            if (connection) {
              const subject = this.replaceVariables(action.groupSubject, contact, '', '');
              await wahaService.updateGroupSubject(connection, action.groupId, subject);
            }
          }
          break;
          
        case 'update_group_description':
          if (action.groupId && action.groupDescription) {
            const connection = await this.getConnection(userId);
            if (connection) {
              const desc = this.replaceVariables(action.groupDescription, contact, '', '');
              await wahaService.updateGroupDescription(connection, action.groupId, desc);
            }
          }
          break;
          
        // ========== BUSINESS LABELS ==========
        case 'set_label':
          if (action.labelId) {
            const connection = await this.getConnection(userId);
            if (connection) {
              const chatId = `${contact.phone}@c.us`;
              await wahaService.setChatLabels(connection, chatId, [action.labelId]);
            }
          }
          break;
      }
    }
  }
  
  // Execute Google Sheets node
  async executeGoogleSheetsNode(node, contact, userId) {
    const googleSheets = require('./googleSheets.service');
    const actions = node.data?.actions || [];
    
    // Default Hebrew labels for variables
    const DEFAULT_LABELS = {
      sheets_found: 'גיליון - נמצא',
      sheets_row_index: 'גיליון - מספר שורה',
      sheets_total_rows: 'גיליון - סה״כ שורות',
      sheets_total_matches: 'גיליון - סה״כ תוצאות',
      sheets_action: 'גיליון - פעולה שבוצעה',
      sheets_success: 'גיליון - פעולה הצליחה',
      sheets_error: 'גיליון - שגיאה',
    };
    
    // Helper to save result variables using varNames mapping with Hebrew labels
    const saveVar = async (varNames, key, value) => {
      const config = varNames?.[key];
      let varName = key;
      let label = DEFAULT_LABELS[key] || key;
      
      if (typeof config === 'object' && config !== null) {
        varName = config.name || key;
        label = config.label || DEFAULT_LABELS[key] || key;
      } else if (typeof config === 'string') {
        varName = config;
      }
      
      if (varName && value !== undefined && value !== null) {
        await this.setContactVariable(contact.id, varName, String(value), label);
      }
    };
    
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const { operation, spreadsheetId, sheetName } = action;
      const varNames = action.varNames || {};
      
      if (!spreadsheetId || !sheetName) {
        continue;
      }
      
      
      try {
        switch (operation) {
          case 'append_row': {
            const values = {};
            for (const mapping of (action.columnMappings || [])) {
              if (mapping.column) {
                values[mapping.column] = await this.replaceAllVariables(mapping.value || '', contact, '', '', userId);
              }
            }
            const result = await googleSheets.appendRow(userId, spreadsheetId, sheetName, values);
            
            // Extract row index from updated range (e.g., "Sheet1!A5:C5" -> 5)
            let rowIndex = '';
            if (result.updatedRange) {
              const match = result.updatedRange.match(/!.*?(\d+)/);
              if (match) rowIndex = match[1];
            }
            
            await saveVar(varNames, 'sheets_row_index', rowIndex);
            await saveVar(varNames, 'sheets_action', 'appended');
            await saveVar(varNames, 'sheets_success', 'true');
            break;
          }
          
          case 'update_row': {
            const resolvedRowIndex = await this.replaceAllVariables(action.rowIndex || '', contact, '', '', userId);
            const rowIndex = parseInt(resolvedRowIndex);
            if (!rowIndex || isNaN(rowIndex)) {
              await saveVar(varNames, 'sheets_success', 'false');
              await saveVar(varNames, 'sheets_error', 'מספר שורה לא תקין');
              break;
            }
            const values = {};
            for (const mapping of (action.columnMappings || [])) {
              if (mapping.column) {
                values[mapping.column] = await this.replaceAllVariables(mapping.value || '', contact, '', '', userId);
              }
            }
            const result = await googleSheets.updateCells(userId, spreadsheetId, sheetName, rowIndex, values);
            
            await saveVar(varNames, 'sheets_action', 'updated');
            await saveVar(varNames, 'sheets_success', 'true');
            break;
          }
          
          case 'search_rows': {
            const searchValue = await this.replaceAllVariables(action.searchValue || '', contact, '', '', userId);
            const result = await googleSheets.searchRows(
              userId, spreadsheetId, sheetName,
              action.searchColumn, action.searchOperator || 'equals', searchValue
            );
            
            await saveVar(varNames, 'sheets_found', result.totalMatches > 0 ? 'true' : 'false');
            await saveVar(varNames, 'sheets_total_matches', String(result.totalMatches));
            
            if (result.rows.length > 0) {
              const firstRow = result.rows[0];
              await saveVar(varNames, 'sheets_row_index', String(firstRow._rowIndex));
              
              // Apply column result mappings (user-defined column -> variable)
              for (const mapping of (action.resultMappings || [])) {
                if (mapping.column && mapping.variable) {
                  const val = String(firstRow[mapping.column] || '');
                  await this.setContactVariable(contact.id, mapping.variable, val);
                }
              }
            }
            break;
          }
          
          case 'read_rows': {
            const result = await googleSheets.readRows(userId, spreadsheetId, sheetName);
            
            await saveVar(varNames, 'sheets_total_rows', String(result.rows.length));
            
            if (result.rows.length > 0) {
              const firstRow = result.rows[0];
              
              for (const mapping of (action.resultMappings || [])) {
                if (mapping.column && mapping.variable) {
                  const val = String(firstRow[mapping.column] || '');
                  await this.setContactVariable(contact.id, mapping.variable, val);
                }
              }
            }
            break;
          }
          
          case 'search_and_update': {
            const searchValue = await this.replaceAllVariables(action.searchValue || '', contact, '', '', userId);
            const updateValues = {};
            for (const mapping of (action.columnMappings || [])) {
              if (mapping.column) {
                updateValues[mapping.column] = await this.replaceAllVariables(mapping.value || '', contact, '', '', userId);
              }
            }
            const result = await googleSheets.searchAndUpdate(
              userId, spreadsheetId, sheetName,
              action.searchColumn, searchValue, updateValues
            );
            
            await saveVar(varNames, 'sheets_found', result.found ? 'true' : 'false');
            await saveVar(varNames, 'sheets_action', result.found ? 'updated' : 'not_found');
            
            if (result.rowIndex) {
              await saveVar(varNames, 'sheets_row_index', String(result.rowIndex));
            }
            
            // Apply result mappings if found
            if (result.found && (action.resultMappings || []).length > 0) {
              const searchResult = await googleSheets.searchRows(
                userId, spreadsheetId, sheetName,
                action.searchColumn, 'equals', searchValue
              );
              if (searchResult.rows.length > 0) {
                for (const mapping of (action.resultMappings || [])) {
                  if (mapping.column && mapping.variable) {
                    const val = String(searchResult.rows[0][mapping.column] || '');
                    await this.setContactVariable(contact.id, mapping.variable, val);
                  }
                }
              }
            }
            break;
          }
          
          case 'search_or_append': {
            const searchValue = await this.replaceAllVariables(action.searchValue || '', contact, '', '', userId);
            const values = {};
            for (const mapping of (action.columnMappings || [])) {
              if (mapping.column) {
                values[mapping.column] = await this.replaceAllVariables(mapping.value || '', contact, '', '', userId);
              }
            }
            const result = await googleSheets.searchOrAppend(
              userId, spreadsheetId, sheetName,
              action.searchColumn, searchValue, values
            );
            
            await saveVar(varNames, 'sheets_found', result.action === 'updated' ? 'true' : 'false');
            await saveVar(varNames, 'sheets_action', result.action); // 'updated' or 'appended'
            
            if (result.rowIndex) {
              await saveVar(varNames, 'sheets_row_index', String(result.rowIndex));
            }
            break;
          }
          
          default:
        }
      } catch (error) {
        console.error(`[BotEngine] ❌ Google Sheets error (${operation}):`, error.message);
        
        // Translate common Google Sheets errors to Hebrew
        let errorMessage = error.message;
        if (error.message.includes('PERMISSION_DENIED')) {
          errorMessage = 'אין הרשאות לגשת לגיליון. וודא שהחשבון מחובר ויש גישה לגיליון.';
        } else if (error.message.includes('UNAUTHENTICATED')) {
          errorMessage = 'החיבור לגוגל פג תוקף. יש להתחבר מחדש בהגדרות.';
        } else if (error.message.includes('NOT_FOUND') || error.message.includes('Requested entity was not found')) {
          errorMessage = 'הגיליון לא נמצא. בדוק את מזהה הגיליון.';
        } else if (error.message.includes('Invalid row index')) {
          errorMessage = 'מספר השורה לא תקין. בדוק שהמשתנה מכיל מספר נכון.';
        } else if (error.message.includes('QUOTA_EXCEEDED')) {
          errorMessage = 'חרגת ממכסת הבקשות של גוגל. נסה שוב מאוחר יותר.';
        } else if (error.message.includes('Unable to parse range')) {
          errorMessage = 'שם הגיליון או הטווח לא תקינים.';
        }
        
        // Save error to variable
        await saveVar(varNames, 'sheets_error', errorMessage);
        await saveVar(varNames, 'sheets_success', 'false');
      }
    }
  }
  
  // Execute Google Contacts node
  async executeGoogleContactsNode(node, contact, userId) {
    const googleContacts = require('./googleContacts.service');
    const actions = node.data?.actions || [];
    
    // Default Hebrew labels for variables
    const DEFAULT_LABELS = {
      contact_exists: 'גוגל - איש קשר קיים',
      contact_id: 'גוגל - מזהה איש קשר',
      contact_name: 'גוגל - שם איש קשר',
      contact_phone: 'גוגל - טלפון איש קשר',
      contact_email: 'גוגל - אימייל איש קשר',
      contact_action: 'גוגל - פעולה שבוצעה',
      contact_success: 'גוגל - פעולה הצליחה',
      contact_error: 'גוגל - שגיאה',
    };
    
    // Helper to save result variables using varNames mapping with Hebrew labels
    const saveVar = async (varNames, key, value) => {
      const config = varNames?.[key];
      let varName = key;
      let label = DEFAULT_LABELS[key] || key;
      
      if (typeof config === 'object' && config !== null) {
        varName = config.name || key;
        label = config.label || DEFAULT_LABELS[key] || key;
      } else if (typeof config === 'string') {
        varName = config;
      }
      
      if (varName && value !== undefined && value !== null) {
        await this.setContactVariable(contact.id, varName, String(value), label);
      }
    };
    
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const { operation } = action;
      const varNames = action.varNames || {};
      
      
      try {
        switch (operation) {
          case 'check_exists': {
            const searchValue = await this.replaceAllVariables(action.searchValue || '', contact, '', '', userId);
            const searchBy = action.searchBy || 'phone';
            
            const result = await googleContacts.exists(userId, searchValue, searchBy);
            
            // Save all relevant variables
            await saveVar(varNames, 'contact_exists', result.exists ? 'true' : 'false');
            await saveVar(varNames, 'contact_id', result.contact?.resourceName || '');
            break;
          }
          
          case 'search_contact': {
            const searchValue = await this.replaceAllVariables(action.searchValue || '', contact, '', '', userId);
            const searchBy = action.searchBy || 'phone';
            
            let foundContact = null;
            if (searchBy === 'phone') {
              foundContact = await googleContacts.findByPhone(userId, searchValue);
            } else if (searchBy === 'email') {
              foundContact = await googleContacts.findByEmail(userId, searchValue);
            }
            
            
            await saveVar(varNames, 'contact_exists', foundContact ? 'true' : 'false');
            await saveVar(varNames, 'contact_id', foundContact?.resourceName || '');
            await saveVar(varNames, 'contact_name', foundContact?.name || '');
            await saveVar(varNames, 'contact_phone', foundContact?.primaryPhone || '');
            await saveVar(varNames, 'contact_email', foundContact?.primaryEmail || '');
            break;
          }
          
          case 'create_contact': {
            const contactData = {
              name: await this.replaceAllVariables(action.name || '', contact, '', '', userId),
              firstName: await this.replaceAllVariables(action.firstName || '', contact, '', '', userId),
              lastName: await this.replaceAllVariables(action.lastName || '', contact, '', '', userId),
              phone: await this.replaceAllVariables(action.phone || '', contact, '', '', userId),
              email: await this.replaceAllVariables(action.email || '', contact, '', '', userId),
              labelId: action.labelId || null,
            };
            
            const newContact = await googleContacts.createContact(userId, contactData);
            
            await saveVar(varNames, 'contact_id', newContact.resourceName);
            await saveVar(varNames, 'contact_action', 'created');
            break;
          }
          
          case 'update_contact': {
            const searchValue = await this.replaceAllVariables(action.searchValue || '', contact, '', '', userId);
            const searchBy = action.searchBy || 'phone';
            
            let foundContact = null;
            if (searchBy === 'phone') {
              foundContact = await googleContacts.findByPhone(userId, searchValue);
            } else if (searchBy === 'email') {
              foundContact = await googleContacts.findByEmail(userId, searchValue);
            }
            
            if (!foundContact) {
              await saveVar(varNames, 'contact_exists', 'false');
              break;
            }
            
            const updateData = {};
            if (action.name) updateData.name = await this.replaceAllVariables(action.name, contact, '', '', userId);
            if (action.firstName) updateData.firstName = await this.replaceAllVariables(action.firstName, contact, '', '', userId);
            if (action.lastName) updateData.lastName = await this.replaceAllVariables(action.lastName, contact, '', '', userId);
            if (action.phone) updateData.phone = await this.replaceAllVariables(action.phone, contact, '', '', userId);
            if (action.email) updateData.email = await this.replaceAllVariables(action.email, contact, '', '', userId);
            
            const updatedContact = await googleContacts.updateContact(userId, foundContact.resourceName, updateData);
            
            await saveVar(varNames, 'contact_id', updatedContact.resourceName);
            await saveVar(varNames, 'contact_action', 'updated');
            break;
          }
          
          case 'find_or_create': {
            const phone = await this.replaceAllVariables(action.phone || action.searchValue || '', contact, '', '', userId);
            const contactData = {
              name: await this.replaceAllVariables(action.name || '', contact, '', '', userId),
              firstName: await this.replaceAllVariables(action.firstName || '', contact, '', '', userId),
              lastName: await this.replaceAllVariables(action.lastName || '', contact, '', '', userId),
              email: await this.replaceAllVariables(action.email || '', contact, '', '', userId),
              labelId: action.labelId || null,
            };
            
            const result = await googleContacts.findOrCreate(userId, phone, contactData);
            
            await saveVar(varNames, 'contact_exists', result.action === 'found' ? 'true' : 'false');
            await saveVar(varNames, 'contact_id', result.contact.resourceName);
            await saveVar(varNames, 'contact_action', result.action);
            await saveVar(varNames, 'contact_name', result.contact.name || '');
            await saveVar(varNames, 'contact_phone', result.contact.primaryPhone || '');
            await saveVar(varNames, 'contact_email', result.contact.primaryEmail || '');
            break;
          }
          
          case 'add_to_label': {
            const searchValue = await this.replaceAllVariables(action.searchValue || '', contact, '', '', userId);
            const searchBy = action.searchBy || 'phone';
            const labelId = action.labelId;
            
            if (!labelId) {
              await saveVar(varNames, 'contact_success', 'false');
              break;
            }
            
            let foundContact = null;
            if (searchBy === 'phone') {
              foundContact = await googleContacts.findByPhone(userId, searchValue);
            } else if (searchBy === 'email') {
              foundContact = await googleContacts.findByEmail(userId, searchValue);
            }
            
            if (!foundContact) {
              await saveVar(varNames, 'contact_success', 'false');
              break;
            }
            
            await googleContacts.addToLabel(userId, foundContact.resourceName, labelId);
            
            await saveVar(varNames, 'contact_success', 'true');
            break;
          }
          
          case 'remove_from_label': {
            const searchValue = await this.replaceAllVariables(action.searchValue || '', contact, '', '', userId);
            const searchBy = action.searchBy || 'phone';
            const labelId = action.labelId;
            
            if (!labelId) {
              await saveVar(varNames, 'contact_success', 'false');
              break;
            }
            
            let foundContact = null;
            if (searchBy === 'phone') {
              foundContact = await googleContacts.findByPhone(userId, searchValue);
            } else if (searchBy === 'email') {
              foundContact = await googleContacts.findByEmail(userId, searchValue);
            }
            
            if (!foundContact) {
              await saveVar(varNames, 'contact_success', 'false');
              break;
            }
            
            await googleContacts.removeFromLabel(userId, foundContact.resourceName, labelId);
            
            await saveVar(varNames, 'contact_success', 'true');
            break;
          }
          
          default:
        }
      } catch (error) {
        console.error(`[BotEngine] ❌ Google Contacts error (${operation}):`, error.message);
        
        // Translate common Google errors to Hebrew
        let errorMessage = error.message;
        if (error.message.includes('MY_CONTACTS_OVERFLOW_COUNT')) {
          errorMessage = 'חשבון Google הגיע למגבלת אנשי הקשר (25,000). יש למחוק אנשי קשר ישנים.';
        } else if (error.message.includes('PERMISSION_DENIED')) {
          errorMessage = 'אין הרשאות לגשת לאנשי קשר. נסה להתחבר מחדש לחשבון Google.';
        } else if (error.message.includes('UNAUTHENTICATED')) {
          errorMessage = 'החיבור לגוגל פג תוקף. יש להתחבר מחדש בהגדרות.';
        } else if (error.message.includes('INVALID_ARGUMENT')) {
          errorMessage = 'נתונים לא תקינים נשלחו לגוגל. בדוק את הפרטים ונסה שוב.';
        } else if (error.message.includes('NOT_FOUND')) {
          errorMessage = 'איש הקשר לא נמצא בגוגל.';
        } else if (error.message.includes('QUOTA_EXCEEDED')) {
          errorMessage = 'חרגת ממכסת הבקשות של גוגל. נסה שוב מאוחר יותר.';
        }
        
        // Save error to variable
        await saveVar(varNames, 'contact_error', errorMessage);
      }
    }
  }
  
  // Execute integration node (API requests)
  async executeIntegrationNode(node, contact, userId, message = '') {
    const actions = node.data?.actions || [];
    
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const actionType = action.type || 'http_request';
      
      if (actionType === 'http_request') {
        await this.executeHttpRequest(action, contact, message);
      } else if (actionType === 'google_sheets') {
        // Create a virtual node with the nested actions
        const virtualNode = { data: { actions: action.actions || [] } };
        await this.executeGoogleSheetsNode(virtualNode, contact, userId);
      } else if (actionType === 'google_contacts') {
        // Create a virtual node with the nested actions
        const virtualNode = { data: { actions: action.actions || [] } };
        await this.executeGoogleContactsNode(virtualNode, contact, userId);
      }
    }
  }
  
  // Download file from URL and save to variable as a local physical file
  async executeDownloadFile(action, contact, userId) {
    const axios = require('axios');
    const fs = require('fs');
    const path = require('path');
    const crypto = require('crypto');

    try {
      // Resolve variables in the URL
      const resolvedUrl = await this.replaceAllVariables(action.fileUrl, contact, '', '', userId);
      if (!resolvedUrl) {
        console.warn('[BotEngine] download_file: empty URL after variable resolution');
        return;
      }

      console.log(`[BotEngine] download_file: downloading from ${resolvedUrl}`);

      // Download the file as a stream
      const response = await axios({
        method: 'GET',
        url: resolvedUrl,
        responseType: 'arraybuffer',
        timeout: 60000, // 60s timeout
        maxContentLength: 50 * 1024 * 1024, // 50MB max
      });

      // Determine filename and extension
      const contentType = response.headers['content-type'] || 'application/octet-stream';
      const contentDisposition = response.headers['content-disposition'] || '';

      // Try to extract filename from content-disposition or URL
      let originalFilename = '';
      const cdMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i);
      if (cdMatch) {
        originalFilename = cdMatch[1].replace(/['"]/g, '').trim();
      }
      if (!originalFilename) {
        try {
          const urlPath = new URL(resolvedUrl).pathname;
          originalFilename = path.basename(urlPath);
        } catch { /* ignore */ }
      }
      if (!originalFilename || originalFilename === '/' || !originalFilename.includes('.')) {
        // Guess extension from content type
        const extMap = {
          'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
          'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
          'audio/mpeg': '.mp3', 'audio/ogg': '.ogg', 'audio/wav': '.wav',
          'application/pdf': '.pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
          'application/msword': '.doc',
        };
        const ext = extMap[contentType] || '.bin';
        originalFilename = `downloaded${ext}`;
      }

      // Use custom filename if provided
      if (action.customFilename) {
        const resolvedFilename = await this.replaceAllVariables(action.customFilename, contact, '', '', userId);
        if (resolvedFilename) {
          // Keep original extension if custom filename doesn't have one
          const customExt = path.extname(resolvedFilename);
          const origExt = path.extname(originalFilename);
          originalFilename = customExt ? resolvedFilename : `${resolvedFilename}${origExt}`;
        }
      }

      // Determine storage type directory
      let typeDir = 'misc';
      if (contentType.startsWith('image/')) typeDir = 'image';
      else if (contentType.startsWith('video/')) typeDir = 'video';
      else if (contentType.startsWith('audio/')) typeDir = 'audio';

      // Ensure uploads directory exists
      const uploadsDir = path.join(__dirname, '../../uploads', typeDir);
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      // Generate unique filename
      const uniqueId = crypto.randomBytes(8).toString('hex');
      const ext = path.extname(originalFilename);
      const safeName = `${Date.now()}-${uniqueId}${ext}`;
      const filePath = path.join(uploadsDir, safeName);

      // Write file to disk
      fs.writeFileSync(filePath, Buffer.from(response.data));

      let finalPath = filePath;
      let finalName = safeName;
      let finalTypeDir = typeDir;

      // Convert format if requested
      if (action.convertFormat) {
        const targetExt = action.convertFormat.startsWith('.') ? action.convertFormat : `.${action.convertFormat}`;
        const convertedName = `${Date.now()}-${uniqueId}${targetExt}`;

        // Determine target type directory
        const audioExts = ['.mp3', '.ogg', '.wav', '.m4a'];
        const imageExts = ['.jpg', '.png', '.webp'];
        const videoExts = ['.mp4'];
        if (audioExts.includes(targetExt)) finalTypeDir = 'audio';
        else if (imageExts.includes(targetExt)) finalTypeDir = 'image';
        else if (videoExts.includes(targetExt)) finalTypeDir = 'video';

        const convertedDir = path.join(__dirname, '../../uploads', finalTypeDir);
        if (!fs.existsSync(convertedDir)) fs.mkdirSync(convertedDir, { recursive: true });
        const convertedPath = path.join(convertedDir, convertedName);

        try {
          const ffmpeg = require('fluent-ffmpeg');
          await new Promise((resolve, reject) => {
            let cmd = ffmpeg(filePath);
            // Set codec/options for specific formats
            if (targetExt === '.mp3') cmd = cmd.audioCodec('libmp3lame').audioFrequency(44100);
            else if (targetExt === '.ogg') cmd = cmd.audioCodec('libvorbis');
            else if (targetExt === '.wav') cmd = cmd.audioCodec('pcm_s16le');
            else if (targetExt === '.m4a') cmd = cmd.audioCodec('aac');
            else if (targetExt === '.jpg') cmd = cmd.frames(1);
            else if (targetExt === '.png') cmd = cmd.frames(1);
            else if (targetExt === '.webp') cmd = cmd.frames(1);
            else if (targetExt === '.mp4') cmd = cmd.videoCodec('libx264').audioCodec('aac');

            cmd.output(convertedPath)
              .on('end', resolve)
              .on('error', reject)
              .run();
          });
          // Remove original file after successful conversion
          fs.unlinkSync(filePath);
          finalPath = convertedPath;
          finalName = convertedName;
          console.log(`[BotEngine] download_file: converted to ${targetExt} -> ${convertedPath}`);
        } catch (convertErr) {
          console.error(`[BotEngine] download_file: conversion to ${targetExt} failed: ${convertErr.message}, using original`);
          // Keep original file on conversion failure
        }
      }

      // Build the public URL
      const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3000}/api`;
      const fileUrl = `${baseUrl}/uploads/${finalTypeDir}/${finalName}`;

      console.log(`[BotEngine] download_file: saved to ${finalPath} (${response.data.byteLength} bytes) -> ${fileUrl}`);

      // Save the local URL to the contact variable
      await this.setContactVariable(contact.id, action.variableName, fileUrl);

      // Also set in-memory for immediate use in the same flow
      if (!contact.variables) contact.variables = {};
      contact.variables[action.variableName] = fileUrl;

    } catch (err) {
      console.error(`[BotEngine] download_file error: ${err.message}`);
      // Optionally save error to a variable
      if (action.errorVariable) {
        await this.setContactVariable(contact.id, action.errorVariable, err.message);
        if (!contact.variables) contact.variables = {};
        contact.variables[action.errorVariable] = err.message;
      }
    }
  }

  // Execute HTTP request action
  async executeHttpRequest(action, contact, message = '') {
    if (!action.apiUrl) return;
    
    const axios = require('axios');
    
    try {
      // Build headers
      const headers = {};
      if (action.headers && Array.isArray(action.headers)) {
        for (const h of action.headers) {
          if (h.key) {
            headers[h.key] = await this.replaceAllVariables(h.value || '', contact, message, '');
          }
        }
      }
      // Build body with variable replacement
      let body = undefined;
      let isFormData = false;
      if (['POST', 'PUT', 'PATCH'].includes(action.method)) {
        if (action.bodyMode === 'formdata' && action.bodyParams) {
          // Build multipart/form-data
          const FormData = require('form-data');
          const form = new FormData();
          for (const param of action.bodyParams) {
            if (!param.key) continue;
            const val = await this.replaceAllVariables(param.value || '', contact, message, '');
            if (param.isFile && val) {
              // val is a URL — try local disk first, then download via HTTP
              const pathModule = require('path');
              const fs = require('fs');
              try {
                // Check if file is hosted on our own server → read from local disk
                const uploadsMatch = val.match(/\/uploads\/(.+)$/);
                const localPath = uploadsMatch ? pathModule.join(__dirname, '../../uploads', uploadsMatch[1]) : null;

                if (localPath && fs.existsSync(localPath)) {
                  const filename = pathModule.basename(localPath);
                  const ext = pathModule.extname(filename).toLowerCase().replace('.', '');
                  const mimeMap = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', m4a: 'audio/mp4', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', mp4: 'video/mp4', pdf: 'application/pdf' };
                  const contentType = mimeMap[ext] || 'application/octet-stream';
                  console.log(`[BotEngine] Reading local file for form field "${param.key}": ${localPath} (${contentType})`);
                  form.append(param.key, fs.createReadStream(localPath), { filename, contentType });
                } else {
                  // Download from remote URL
                  console.log(`[BotEngine] Downloading remote file for form field "${param.key}": ${val}`);
                  const fileResponse = await axios({ method: 'GET', url: val, responseType: 'stream', timeout: 30000 });
                  const contentType = fileResponse.headers['content-type'] || 'application/octet-stream';
                  let filename = pathModule.basename(new URL(val).pathname) || 'file';
                  form.append(param.key, fileResponse.data, { filename, contentType });
                }
              } catch (dlErr) {
                console.error(`[BotEngine] Failed to load file for form field "${param.key}": ${dlErr.message}`);
                form.append(param.key, val);
              }
            } else {
              form.append(param.key, val);
            }
          }
          body = form;
          isFormData = true;
          // Merge form headers (boundary etc.) into request headers
          Object.assign(headers, form.getHeaders());
        } else if (action.bodyMode === 'keyvalue' && action.bodyParams) {
          body = {};
          for (const param of action.bodyParams) {
            if (param.key) {
              body[param.key] = await this.replaceAllVariables(param.value || '', contact, message, '');
            }
          }
        } else if (action.body) {
          // Best approach: parse JSON first, then replace variables in each string value
          // This avoids issues where variable values contain quotes/newlines that break JSON
          try {
            const originalBody = JSON.parse(action.body);
            body = await this.replaceAllVariablesInObject(originalBody, contact, message, '');
          } catch {
            // Fallback: replace variables in raw string then parse
            const bodyStr = await this.replaceAllVariables(action.body, contact, message, '');
            try {
              body = JSON.parse(bodyStr);
            } catch {
              body = bodyStr;
            }
          }
        }
      }

      const url = await this.replaceAllVariables(action.apiUrl, contact, message, '');

      // Auto-set Content-Type for non-formdata POST/PUT/PATCH
      if (!isFormData && !headers['Content-Type'] && ['POST', 'PUT', 'PATCH'].includes(action.method)) {
        headers['Content-Type'] = 'application/json';
      }

      // Check if response should be saved as binary file
      if (action.responseAsFile && action.fileVariable) {
        const response = await axios({
          method: action.method || 'GET',
          url,
          headers,
          data: body,
          responseType: 'arraybuffer',
          timeout: 60000,
          maxContentLength: 50 * 1024 * 1024,
        });

        const fs = require('fs');
        const pathModule = require('path');
        const crypto = require('crypto');

        const contentType = response.headers['content-type'] || 'application/octet-stream';
        const contentDisposition = response.headers['content-disposition'] || '';

        // Determine filename
        let originalFilename = '';
        const cdMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i);
        if (cdMatch) originalFilename = cdMatch[1].replace(/['"]/g, '').trim();
        if (!originalFilename) {
          try { originalFilename = pathModule.basename(new URL(url).pathname); } catch { /* ignore */ }
        }
        if (!originalFilename || originalFilename === '/' || !originalFilename.includes('.')) {
          const extMap = {
            'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
            'video/mp4': '.mp4', 'audio/mpeg': '.mp3', 'application/pdf': '.pdf',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
          };
          originalFilename = `downloaded${extMap[contentType] || '.bin'}`;
        }

        // Determine storage directory
        let typeDir = 'misc';
        if (contentType.startsWith('image/')) typeDir = 'image';
        else if (contentType.startsWith('video/')) typeDir = 'video';
        else if (contentType.startsWith('audio/')) typeDir = 'audio';

        const uploadsDir = pathModule.join(__dirname, '../../uploads', typeDir);
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

        const uniqueId = crypto.randomBytes(8).toString('hex');
        const ext = pathModule.extname(originalFilename);
        const safeName = `${Date.now()}-${uniqueId}${ext}`;
        const filePath = pathModule.join(uploadsDir, safeName);
        fs.writeFileSync(filePath, Buffer.from(response.data));

        const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3000}/api`;
        const fileUrl = `${baseUrl}/uploads/${typeDir}/${safeName}`;

        console.log(`[BotEngine] HTTP Request file download: saved ${response.data.byteLength} bytes -> ${fileUrl}`);

        await this.setContactVariable(contact.id, action.fileVariable, fileUrl);
        if (!contact.variables) contact.variables = {};
        contact.variables[action.fileVariable] = fileUrl;

        return;
      }

      // HTTP request log removed (too noisy)
      const response = await axios({
        method: action.method || 'GET',
        url,
        headers,
        data: body,
        timeout: 30000
      });

      // Store response data for execution tracking
      action._lastResponse = {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(Object.entries(response.headers || {}).filter(([k]) => !['set-cookie'].includes(k.toLowerCase()))),
        data: typeof response.data === 'object' ? JSON.stringify(response.data).substring(0, 5000) : String(response.data || '').substring(0, 5000),
      };

      // HTTP response log removed (too noisy)

      // Apply response mappings

      if (action.mappings && Array.isArray(action.mappings)) {
        // Mapping count log removed (too noisy)
        for (const mapping of action.mappings) {
          if (mapping.path && mapping.varName) {
            let value;

            // Special case: _full_response returns entire response as JSON string
            if (mapping.path === '_full_response') {
              value = JSON.stringify(response.data);
            } else {
              value = this.getValueFromPath(response.data, mapping.path);
            }

            if (value !== undefined && value !== null) {
              const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
              await this.setContactVariable(contact.id, mapping.varName, stringValue);
            } else {
              // no value found at path — silent
            }
          }
        }
      } else {
        // No response mappings configured — silent
      }
    } catch (error) {
      console.error('[BotEngine] ❌ HTTP Request failed:', error.message);
      if (error.response) {
        console.error(`[BotEngine] ❌ Response status: ${error.response.status}, data:`, JSON.stringify(error.response.data).substring(0, 500));
      }
    }
  }
  
  // Get value from nested path (e.g., "data.user.name")
  getValueFromPath(obj, path) {
    if (!path || !obj) return undefined;
    
    const parts = path.split('.');
    let current = obj;
    
    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }
    
    return current;
  }
  
  // Execute send_other node - send to a different phone number or group
  async executeSendOtherNode(node, contact, userId, originalMessage = '') {
    const recipient = node.data?.recipient || {};
    const actions = node.data?.actions || [];
    
    
    // Get WAHA connection
    const connection = await this.getConnection(userId);
    if (!connection) {
      return;
    }
    
    // Determine the target chat ID
    let targetChatId;
    
    if (recipient.type === 'group') {
      // Group recipient
      let groupId;
      if (recipient.useVariable && recipient.variableName) {
        // Get group ID from variable - handle both "group_id" and "{{group_id}}" formats
        let varName = recipient.variableName;
        // Strip curly braces if user included them
        varName = varName.replace(/^\{\{/, '').replace(/\}\}$/, '');
        groupId = this.replaceVariables(`{{${varName}}}`, contact, '', '');
      } else {
        groupId = recipient.groupId || '';
        // Also replace variables in case user entered {{group_id}} directly
        groupId = this.replaceVariables(groupId, contact, '', '');
      }

      // Normalize group ID - add @g.us if not present
      if (groupId && !groupId.includes('@')) {
        targetChatId = `${groupId}@g.us`;
      } else {
        targetChatId = groupId;
      }

    } else if (recipient.type === 'channel') {
      // WhatsApp channel recipient
      let channelId;
      if (recipient.useVariable && recipient.variableName) {
        let varName = recipient.variableName;
        varName = varName.replace(/^\{\{/, '').replace(/\}\}$/, '');
        channelId = this.replaceVariables(`{{${varName}}}`, contact, '', '');
      } else {
        channelId = recipient.channelId || '';
        channelId = this.replaceVariables(channelId, contact, '', '');
      }

      // Normalize channel ID - add @newsletter if not present
      if (channelId && !channelId.includes('@')) {
        targetChatId = `${channelId}@newsletter`;
      } else {
        targetChatId = channelId;
      }

    } else {
      // Phone recipient
      let phone;
      if (recipient.useVariable && recipient.variableName) {
        // Get phone from variable - handle both "sender_phone" and "{{sender_phone}}" formats
        let varName = recipient.variableName;
        // Strip curly braces if user included them
        varName = varName.replace(/^\{\{/, '').replace(/\}\}$/, '');
        phone = this.replaceVariables(`{{${varName}}}`, contact, '', '');
      } else {
        phone = recipient.phone || '';
        // Also replace variables in case user entered {{sender_phone}} directly
        phone = this.replaceVariables(phone, contact, '', '');
      }
      
      // Normalize phone number
      phone = this.normalizePhoneNumber(phone);
      targetChatId = phone;
      
    }
    
    if (!targetChatId) {
      return;
    }
    
    // Execute each action
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      
      try {
        switch (action.type) {
          case 'text':
            if (action.content) {
              const text = await this.replaceAllVariables(action.content, contact, originalMessage, '', userId);
              
              // Skip empty messages - don't send but continue flow
              if (!text || !text.trim()) {
                break;
              }
              
              
              // Check if custom link preview is configured
              if (action.customLinkPreview && action.linkPreviewUrl) {
                const previewImage = action.linkPreviewImage 
                  ? await this.replaceAllVariables(action.linkPreviewImage, contact, originalMessage, '', userId)
                  : null;
                const preview = {
                  url: await this.replaceAllVariables(action.linkPreviewUrl, contact, originalMessage, '', userId),
                  title: action.linkPreviewTitle ? await this.replaceAllVariables(action.linkPreviewTitle, contact, originalMessage, '', userId) : undefined,
                  description: action.linkPreviewDescription ? await this.replaceAllVariables(action.linkPreviewDescription, contact, originalMessage, '', userId) : undefined,
                };
                if (previewImage) {
                  preview.image = { url: previewImage };
                }
                await wahaService.sendLinkPreview(connection, targetChatId, text, preview);
              } else {
                await wahaService.sendMessage(connection, targetChatId, text);
              }
            }
            break;
            
          case 'image':
            if (action.url || action.fileData) {
              const imageUrl = action.fileData || await this.replaceAllVariables(action.url, contact, originalMessage, '', userId);
              const caption = await this.replaceAllVariables(action.caption || '', contact, originalMessage, '', userId);
              await wahaService.sendImage(connection, targetChatId, imageUrl, caption);
            }
            break;
            
          case 'video':
            if (action.url || action.fileData) {
              const videoUrl = action.fileData || await this.replaceAllVariables(action.url, contact, originalMessage, '', userId);
              const caption = await this.replaceAllVariables(action.caption || '', contact, originalMessage, '', userId);
              await wahaService.sendVideo(connection, targetChatId, videoUrl, caption);
            }
            break;
            
          case 'audio':
            if (action.url || action.fileData) {
              const audioUrl = action.fileData || await this.replaceAllVariables(action.url, contact, originalMessage, '', userId);
              await wahaService.sendVoice(connection, targetChatId, audioUrl);
            }
            break;
            
          case 'file':
            if (action.url || action.fileData) {
              const fileUrl = action.fileData || await this.replaceAllVariables(action.url, contact, originalMessage, '', userId);
              let filename = action.customFilename || action.fileName || action.filename || 'file';
              
              // Detect mimetype
              let mimetype = action.mimetype;
              if (!mimetype && filename) {
                const ext = filename.toLowerCase().split('.').pop();
                const mimetypes = {
                  'pdf': 'application/pdf',
                  'doc': 'application/msword',
                  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                  'xls': 'application/vnd.ms-excel',
                  'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                  'txt': 'text/plain',
                  'zip': 'application/zip',
                };
                mimetype = mimetypes[ext] || 'application/octet-stream';
              }
              
              await wahaService.sendFile(connection, targetChatId, fileUrl, filename, mimetype);
            }
            break;
            
          case 'contact':
            if (action.contactPhone) {
              const contactName = this.replaceVariables(action.contactName || '', contact, originalMessage, '');
              const contactPhoneNum = this.replaceVariables(action.contactPhone || '', contact, originalMessage, '');
              const contactOrg = action.contactOrg || '';
              await wahaService.sendContactVcard(connection, targetChatId, contactName, contactPhoneNum, contactOrg);
            }
            break;
          
          case 'location':
            if (action.latitude && action.longitude) {
              const lat = parseFloat(this.replaceVariables(String(action.latitude), contact, originalMessage, ''));
              const lng = parseFloat(this.replaceVariables(String(action.longitude), contact, originalMessage, ''));
              const title = this.replaceVariables(action.locationTitle || '', contact, originalMessage, '');
              await wahaService.sendLocation(connection, targetChatId, lat, lng, title);
            }
            break;
            
          default:
        }
      } catch (error) {
        console.error(`[BotEngine] ❌ Send other action ${action.type} failed:`, error.message);
      }
    }
    
  }
  
  // Normalize phone number to consistent format
  normalizePhoneNumber(phone) {
    if (!phone) return '';
    
    // Remove all non-digit characters except +
    let cleaned = phone.replace(/[^\d+]/g, '');
    
    // Remove leading +
    if (cleaned.startsWith('+')) {
      cleaned = cleaned.substring(1);
    }
    
    // Handle Israeli numbers
    if (cleaned.startsWith('0')) {
      cleaned = '972' + cleaned.substring(1);
    }
    
    // Ensure it ends with @s.whatsapp.net for direct chat
    if (!cleaned.includes('@')) {
      cleaned = `${cleaned}@s.whatsapp.net`;
    }
    
    return cleaned;
  }
  
  // Execute list node
  async executeListNode(node, contact, userId, botName = '', botId = null) {
    const connection = await this.getConnection(userId);
    if (!connection) return;
    
    const { title, body, buttonText, buttons, footer, timeout } = node.data;
    
    // Get contact variables for validation
    const contactVars = await this.getContactVariables(contact.id);
    
    // Add original index to buttons for edge matching after filtering
    let allButtons = (buttons || []).map((btn, i) => ({ ...btn, originalIndex: i }));
    
    // Filter buttons based on validations
    let filteredButtons = allButtons;
    if (allButtons.some(btn => btn.validation || btn.validationId)) {
      filteredButtons = await validationService.filterListButtons(allButtons, contact, contactVars);
    }
    
    // Prepare list data with variable replacement
    // IMPORTANT: Use displayIndex (i) for WhatsApp ID so it matches what we save in session
    const listData = {
      title: this.replaceVariables(title || '', contact, '', botName),
      body: this.replaceVariables(body || '', contact, '', botName),
      footer: this.replaceVariables(footer || '', contact, '', botName),
      buttonText: this.replaceVariables(buttonText || 'בחר', contact, '', botName),
      buttons: filteredButtons.map((btn, displayIndex) => ({
        id: `option_${displayIndex}`, // Use displayIndex for WhatsApp - matches session storage
        title: this.replaceVariables(btn.title || '', contact, '', botName),
        description: btn.description ? this.replaceVariables(btn.description, contact, '', botName) : null,
        originalIndex: btn.originalIndex ?? displayIndex, // Track original position for edge matching
      })),
    };
    
    
    try {
      await wahaService.sendList(connection, contact.phone, listData);
      // Save list message with metadata for display
      await this.saveOutgoingMessage(userId, contact.id, listData.body, 'list', null, null, {
        title: listData.title,
        buttons: listData.buttons.map(b => ({ title: b.title, description: b.description })),
        buttonText: listData.buttonText,
        footer: listData.footer
      });
    } catch (listError) {
      console.error('[BotEngine] ❌ List send failed:', listError.message);
      console.error('[BotEngine] Error details:', listError.response?.data || 'No details');
      // Fallback to text message
      let text = `*${listData.title}*\n\n${listData.body}`;
      if (listData.buttons.length > 0) {
        text += '\n\n';
        listData.buttons.forEach((btn, i) => {
          text += `${i + 1}. ${btn.title}${btn.description ? ' - ' + btn.description : ''}\n`;
        });
      }
      if (listData.footer) {
        text += `\n_${listData.footer}_`;
      }
      await wahaService.sendMessage(connection, contact.phone, text);
      await this.saveOutgoingMessage(userId, contact.id, text, 'text', null, null);
    }
    
    // Save session to wait for response
    if (botId) {
      // Save buttons with their original indices for edge matching
      const buttonsForSession = filteredButtons.map((btn, displayIndex) => ({
        id: `option_${displayIndex}`, // ID sent to WhatsApp
        title: btn.title || '',
        displayIndex: displayIndex, // Position in displayed list
        originalIndex: btn.originalIndex, // Original position for edge matching
      }));
      
      await this.saveSession(
        botId, 
        contact.id, 
        node.id, 
        'list_response',
        { 
          buttons: buttonsForSession,
          listTitle: listData.title, // Save list title to verify list_response matches this list
        },
        timeout || null // timeout in seconds, null = no timeout
      );
    }
  }
  
  // Execute registration node
  async executeRegistrationNode(node, contact, triggerMessage, userId, botName = '', botId = null) {
    const connection = await this.getConnection(userId);
    if (!connection) {
      return;
    }
    
    const { 
      welcomeMessage, 
      questions = [], 
      timeout = 2, 
      timeoutUnit = 'hours',
      cancelKeyword = 'ביטול',
      welcomeDelay = 2 // Default 2 seconds delay between welcome and first question
    } = node.data;
    
    
    // Get contact variables for validation
    const contactVars = await this.getContactVariables(contact.id);
    
    // Filter questions based on validations
    let filteredQuestions = questions;
    if (questions.some(q => q.validation || q.validationId)) {
      filteredQuestions = await validationService.filterQuestions(questions, contact, contactVars);
    }
    
    if (filteredQuestions.length === 0) {
      return;
    }
    
    // Send welcome message if defined
    if (welcomeMessage && welcomeMessage.trim()) {
      const welcomeText = this.replaceVariables(welcomeMessage, contact, triggerMessage, botName);
      const welcomeResult = await wahaService.sendMessage(connection, contact.phone, welcomeText);
      await this.saveOutgoingMessage(userId, contact.id, welcomeText, 'text', null, welcomeResult?.id?.id);
      // Wait for configured delay before sending first question
      await this.sleep((welcomeDelay || 2) * 1000);
    }
    
    // Send first question
    const firstQuestion = filteredQuestions[0];
    const questionText = this.replaceVariables(firstQuestion.question, contact, triggerMessage, botName);
    const questionResult = await wahaService.sendMessage(connection, contact.phone, questionText);
    await this.saveOutgoingMessage(userId, contact.id, questionText, 'text', null, questionResult?.id?.id);
    
    // Calculate timeout in seconds
    const timeoutSeconds = timeout * (timeoutUnit === 'hours' ? 3600 : 60);
    
    // Save session to wait for response (including trigger message for variable replacement)
    if (botId) {
      await this.saveSession(
        botId,
        contact.id,
        node.id,
        'registration',
        {
          currentQuestion: 0,
          questions: filteredQuestions, // Use filtered questions
          answers: {},
          cancelKeyword: cancelKeyword.toLowerCase(),
          triggerMessage: triggerMessage, // Save original message for variable replacement
          sourceGroupId: contact._groupId || null, // Track message source so only same-source replies continue the session
        },
        timeoutSeconds
      );
    } else {
    }
  }
  
  // Continue registration flow (called from continueSession)
  async continueRegistration(session, flowData, contact, message, userId, bot, messageType = 'text') {
    const connection = await this.getConnection(userId);
    if (!connection) return false;
    
    const nodeId = session.current_node_id;
    const node = flowData.nodes.find(n => n.id === nodeId);
    if (!node) return false;
    
    const waitingData = session.waiting_data || {};
    const questions = waitingData.questions || [];
    const currentQuestionIndex = waitingData.currentQuestion || 0;
    const answers = waitingData.answers || {};
    const cancelKeyword = waitingData.cancelKeyword || 'ביטול';
    const triggerMessage = waitingData.triggerMessage || ''; // Original trigger message
    
    
    // Check if text-only is expected but received non-text message type
    const currentQuestion = questions[currentQuestionIndex];
    const textOnlyTypes = ['text', 'number', 'phone', 'email', 'date', 'choice'];
    const requiresTextInput = textOnlyTypes.includes(currentQuestion?.type);
    
    if (requiresTextInput && messageType !== 'text') {
      const errorMessage = 'התגובה לא תקינה. אנא שלח הודעת טקסט בלבד.';
      const errorResult = await wahaService.sendMessage(connection, contact.phone, errorMessage);
      await this.saveOutgoingMessage(userId, contact.id, errorMessage, 'text', null, errorResult?.id?.id);
      
      // Re-save session (same state) - keep waiting for valid text
      await this.saveSession(
        bot.id,
        contact.id,
        nodeId,
        'registration',
        waitingData,
        (node.data.timeout || 2) * ((node.data.timeoutUnit || 'hours') === 'hours' ? 3600 : 60)
      );
      return true;
    }
    
    // Check for cancel keyword
    if (message.toLowerCase().trim() === cancelKeyword) {
      await this.clearSession(bot.id, contact.id);
      
      // Send cancel message
      const cancelMessage = node.data.cancelMessage || 'הרישום בוטל.';
      const cancelText = this.replaceVariables(cancelMessage, contact, triggerMessage, bot.name);
      const cancelResult = await wahaService.sendMessage(connection, contact.phone, cancelText);
      await this.saveOutgoingMessage(userId, contact.id, cancelText, 'text', null, cancelResult?.id?.id);
      
      // Execute cancel path (support multiple paths)
      const cancelEdges = flowData.edges.filter(e => e.source === nodeId && e.sourceHandle === 'cancel');
      for (const edge of cancelEdges) {
        await this.executeNode(edge.target, flowData, contact, message, userId, bot.id, bot.name);
      }
      return true;
    }
    
    // Validate current answer
    const isValid = this.validateRegistrationAnswer(message, currentQuestion.type);
    
    if (!isValid) {
      // Send error message
      const errorMessage = currentQuestion.errorMessage || 'התשובה לא תקינה, נסה שוב';
      const errorResult = await wahaService.sendMessage(connection, contact.phone, errorMessage);
      await this.saveOutgoingMessage(userId, contact.id, errorMessage, 'text', null, errorResult?.id?.id);
      
      // Re-save session (same state)
      await this.saveSession(
        bot.id,
        contact.id,
        nodeId,
        'registration',
        waitingData,
        (node.data.timeout || 2) * ((node.data.timeoutUnit || 'hours') === 'hours' ? 3600 : 60)
      );
      return true;
    }
    
    // Save answer
    answers[currentQuestion.varName || `q${currentQuestionIndex}`] = message;
    
    // Save to contact variables
    if (currentQuestion.varName) {
      await this.setContactVariable(contact.id, currentQuestion.varName, message);
    }
    
    const nextQuestionIndex = currentQuestionIndex + 1;
    
    if (nextQuestionIndex < questions.length) {
      // More questions - send next one
      const nextQuestion = questions[nextQuestionIndex];
      const questionText = this.replaceVariables(nextQuestion.question, contact, triggerMessage, bot.name);
      const nextResult = await wahaService.sendMessage(connection, contact.phone, questionText);
      await this.saveOutgoingMessage(userId, contact.id, questionText, 'text', null, nextResult?.id?.id);
      
      // Update session
      await this.saveSession(
        bot.id,
        contact.id,
        nodeId,
        'registration',
        { ...waitingData, currentQuestion: nextQuestionIndex, answers },
        (node.data.timeout || 2) * ((node.data.timeoutUnit || 'hours') === 'hours' ? 3600 : 60)
      );
      return true;
    }
    
    // All questions answered - complete registration
    await this.clearSession(bot.id, contact.id);
    
    // Send completion message (optional — sendCompletionMessage defaults to true)
    if (node.data.sendCompletionMessage !== false) {
      const completionMessage = node.data.completionMessage || 'תודה! הרישום הושלם בהצלחה.';
      const completionText = this.replaceVariables(completionMessage, contact, triggerMessage, bot.name);
      const completionResult = await wahaService.sendMessage(connection, contact.phone, completionText);
      await this.saveOutgoingMessage(userId, contact.id, completionText, 'text', null, completionResult?.id?.id);
    }
    
    // Send summary if enabled
    if (node.data.sendSummary) {
      await this.sendRegistrationSummary(node.data, contact, answers, connection, bot.name, triggerMessage);
    }
    
    // Send webhook if enabled
    if (node.data.sendWebhook && node.data.webhookUrl) {
      await this.sendRegistrationWebhook(node.data, contact, answers, bot.name, triggerMessage);
    }
    
    // Execute complete path (support multiple paths)
    const completeEdges = flowData.edges.filter(e => e.source === nodeId && e.sourceHandle === 'complete');
    for (const edge of completeEdges) {
      await this.executeNode(edge.target, flowData, contact, message, userId, bot.id, bot.name);
    }
    
    return true;
  }
  
  // Validate registration answer based on type
  validateRegistrationAnswer(answer, type) {
    if (!answer || !answer.trim()) return false;
    
    switch (type) {
      case 'text':
        return answer.trim().length > 0;
      case 'number':
        return !isNaN(parseFloat(answer)) && isFinite(answer);
      case 'phone':
        const phoneClean = answer.replace(/[-\s+]/g, '');
        return /^(0[0-9]{9}|972[0-9]{9}|[0-9]{10,12})$/.test(phoneClean);
      case 'email':
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answer);
      case 'date':
        // Accept various date formats
        return answer.trim().length > 0;
      case 'image':
      case 'file':
        // For now, accept any response (would need media handling)
        return true;
      case 'choice':
        return answer.trim().length > 0;
      default:
        return true;
    }
  }
  
  // Send registration summary
  async sendRegistrationSummary(nodeData, contact, answers, connection, botName, triggerMessage = '') {
    try {
      const { summaryTarget, summaryPhone, summaryGroupId, summaryTemplate, title, questions } = nodeData;
      // Replace variables in title (including {{last_message}} and {{message}})
      let registrationTitle = title || 'רישום חדש';
      registrationTitle = this.replaceVariables(registrationTitle, contact, triggerMessage, botName);
      
      // Label mapping for common variables
      const labelMap = {
        full_name: 'שם מלא',
        first_name: 'שם פרטי',
        last_name: 'שם משפחה',
        phone: 'טלפון',
        email: 'אימייל',
        id_number: 'תעודת זהות',
        city: 'עיר',
        address: 'כתובת',
        birthday: 'תאריך לידה',
        company: 'חברה',
      };
      
      // Build label map from questions if available
      if (questions && Array.isArray(questions)) {
        questions.forEach(q => {
          if (q.varName) {
            // Use question text (without ?) as label, or existing label map
            const questionLabel = q.question?.replace(/\?$/, '').trim();
            if (questionLabel && !labelMap[q.varName]) {
              labelMap[q.varName] = questionLabel;
            }
          }
        });
      }
      
      // Build summary text - use default template if none provided
      let summaryText = summaryTemplate;
      if (!summaryText || !summaryText.trim()) {
        summaryText = `📋 *רישום חדש*\n\n🔹 תהליך: ${registrationTitle}\n🔹 מטלפון: ${contact.phone}\n\n`;
        for (const [key, value] of Object.entries(answers)) {
          const label = labelMap[key] || key;
          summaryText += `*${label}:* ${value}\n`;
        }
      }
      
      // Replace registration_title variable
      summaryText = summaryText.replace(/\{\{registration_title\}\}/gi, registrationTitle);
      
      // Replace variables in template (including custom system variables)
      summaryText = await this.replaceAllVariables(summaryText, contact, '', botName, contact.user_id);
      
      // Replace answer variables
      for (const [key, value] of Object.entries(answers)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
        summaryText = summaryText.replace(regex, value);
      }
      
      // Determine target
      let targetPhone;
      if (summaryTarget === 'group' && summaryGroupId) {
        targetPhone = summaryGroupId;
      } else if (summaryPhone) {
        targetPhone = summaryPhone;
      } else {
        return;
      }
      
      await wahaService.sendMessage(connection, targetPhone, summaryText);
    } catch (error) {
      console.error('[BotEngine] Error sending registration summary:', error.message);
    }
  }
  
  // Send registration webhook
  async sendRegistrationWebhook(nodeData, contact, answers, botName, triggerMessage = '') {
    try {
      const { webhookUrl, webhookBody, title } = nodeData;
      // Replace variables in title (including {{last_message}} and {{message}})
      let registrationTitle = title || 'רישום חדש';
      registrationTitle = this.replaceVariables(registrationTitle, contact, triggerMessage, botName);
      
      if (!webhookUrl) {
        return;
      }
      
      // Prepare body - use custom or auto-generate
      let bodyData;
      if (webhookBody && webhookBody.trim()) {
        // Replace registration_title variable
        let processedBody = webhookBody.replace(/\{\{registration_title\}\}/gi, registrationTitle);
        
        // Replace variables in body (including custom system variables)
        processedBody = await this.replaceAllVariables(processedBody, contact, '', botName, contact.user_id);
        
        // Replace answer variables
        for (const [key, value] of Object.entries(answers)) {
          const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
          processedBody = processedBody.replace(regex, value);
        }
        
        try {
          bodyData = JSON.parse(processedBody);
        } catch (e) {
          console.error('[BotEngine] Invalid webhook body JSON:', e.message);
          bodyData = { raw: processedBody };
        }
      } else {
        // Auto-generate body from answers
        bodyData = {
          registration_title: registrationTitle,
          timestamp: new Date().toISOString(),
          contact: {
            phone: contact.phone,
            name: contact.display_name || ''
          },
          answers
        };
      }
      
      // Send webhook
      const axios = require('axios');
      await axios.post(webhookUrl, bodyData, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
      
    } catch (error) {
      console.error('[BotEngine] Error sending registration webhook:', error.message);
    }
  }
  
  // Helper: Replace variables in text
  replaceVariables(text, contact, message, botName = '', userId = null) {
    if (!text) return '';
    
    // Israel timezone
    const israelTime = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
    
    const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    
    // Group context variables (if available from _groupId property)
    const groupId = contact._groupId || '';
    const senderPhone = contact._senderPhone || contact.phone || '';
    const isGroup = contact._isGroupMessage ? 'true' : 'false';
    
    // Channel context variables (if available from _channelId property)
    const channelId = contact._channelId || '';
    const channelName = contact._channelName || '';
    const isChannel = contact._isChannel ? 'true' : 'false';
    
    // Bot phone number
    const botPhoneNumber = contact._botPhoneNumber || '';
    
    // Media context variables
    const hasMedia = contact._hasMedia ? 'true' : 'false';
    const mediaUrl = contact._mediaUrl || '';
    const mediaType = contact._mediaType || '';
    
    // Webhook payload variables: {{webhook.fieldName}} and {{webhook_fieldName}} (both work)
    const webhookPayload = contact._webhookPayload || {};
    let result = text.replace(/\{\{webhook\.([^}]+)\}\}/gi, (_, key) => {
      const val = webhookPayload[key];
      return val !== undefined ? String(val) : '';
    });
    // Also support underscore syntax: {{webhook_fieldName}} → payload[fieldName]
    result = result.replace(/\{\{webhook_([^}]+)\}\}/gi, (_, key) => {
      const val = webhookPayload[key];
      return val !== undefined ? String(val) : '';
    });

    // Basic replacements (system variables)
    result = result
      .replace(/\{\{name\}\}/gi, contact.display_name || '')
      .replace(/\{\{contact_phone\}\}/gi, contact.phone || '')
      .replace(/\{\{sender_phone\}\}/gi, senderPhone)
      .replace(/\{\{phone_bot\}\}/gi, botPhoneNumber)
      .replace(/\{\{group_id\}\}/gi, groupId)
      .replace(/\{\{is_group\}\}/gi, isGroup)
      .replace(/\{\{channel_id\}\}/gi, channelId)
      .replace(/\{\{channel_name\}\}/gi, channelName)
      .replace(/\{\{is_channel\}\}/gi, isChannel)
      .replace(/\{\{has_media\}\}/gi, hasMedia)
      .replace(/\{\{media_url\}\}/gi, mediaUrl)
      .replace(/\{\{media_type\}\}/gi, mediaType)
      .replace(/\{\{last_message\}\}/gi, message || '')
      .replace(/\{\{bot_name\}\}/gi, botName || '')
      .replace(/\{\{date\}\}/gi, now.toLocaleDateString('he-IL'))
      .replace(/\{\{time\}\}/gi, now.toLocaleTimeString('he-IL'))
      .replace(/\{\{day\}\}/gi, days[now.getDay()]);
    
    // Date/time formulas: {{date+1d}}, {{time+2h}}, {{day+1}}
    result = result.replace(/\{\{date([+-]\d+)d?\}\}/gi, (_, offset) => {
      const d = new Date(now);
      d.setDate(d.getDate() + parseInt(offset));
      return d.toLocaleDateString('he-IL');
    });
    
    result = result.replace(/\{\{time([+-]\d+)h?\}\}/gi, (_, offset) => {
      const d = new Date(now);
      d.setHours(d.getHours() + parseInt(offset));
      return d.toLocaleTimeString('he-IL');
    });
    
    result = result.replace(/\{\{day([+-]\d+)\}\}/gi, (_, offset) => {
      const d = new Date(now);
      d.setDate(d.getDate() + parseInt(offset));
      return days[d.getDay()];
    });

    // Apply in-memory contact variables (set by formula/set_variable nodes in this flow run)
    // This ensures user-defined variables work everywhere, not just in replaceAllVariables
    if (contact.variables && typeof contact.variables === 'object') {
      for (const [key, value] of Object.entries(contact.variables)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
        result = result.replace(regex, value ?? '');
      }
    }

    return result;
  }
  
  // Helper: Replace variables in an object (recursively)
  replaceVariablesInObject(obj, contact, message, botName = '') {
    if (obj === null || obj === undefined) return obj;
    
    if (typeof obj === 'string') {
      return this.replaceVariables(obj, contact, message, botName);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.replaceVariablesInObject(item, contact, message, botName));
    }
    
    if (typeof obj === 'object') {
      const result = {};
      for (const key of Object.keys(obj)) {
        result[key] = this.replaceVariablesInObject(obj[key], contact, message, botName);
      }
      return result;
    }
    
    return obj;
  }
  
  // Async version of replaceVariablesInObject — replaces variables in all string values
  async replaceAllVariablesInObject(obj, contact, message, botName = '', userId = null) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') return this.replaceAllVariables(obj, contact, message, botName, userId);
    if (Array.isArray(obj)) return Promise.all(obj.map(item => this.replaceAllVariablesInObject(item, contact, message, botName, userId)));
    if (typeof obj === 'object') {
      const result = {};
      for (const key of Object.keys(obj)) {
        result[key] = await this.replaceAllVariablesInObject(obj[key], contact, message, botName, userId);
      }
      return result;
    }
    return obj;
  }

  // Replace variables including user-defined and custom system variables
  async replaceAllVariables(text, contact, message, botName = '', userId = null) {
    if (!text) return '';
    
    // First do basic replacements
    let result = this.replaceVariables(text, contact, message, botName, userId);
    
    // Apply in-memory contact variables first (set by formula/set_variable nodes in this run)
    if (contact.variables && typeof contact.variables === 'object') {
      for (const [key, value] of Object.entries(contact.variables)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
        result = result.replace(regex, value ?? '');
      }
    }

    // Get contact variables from DB (covers variables set in previous runs)
    if (contact.id) {
      try {
        const contactVarsRes = await db.query(
          'SELECT key, value FROM contact_variables WHERE contact_id = $1',
          [contact.id]
        );
        for (const row of contactVarsRes.rows) {
          const regex = new RegExp(`\\{\\{${row.key}\\}\\}`, 'gi');
          result = result.replace(regex, row.value || '');
        }
      } catch (e) {
      }
    }
    
    // Get custom system variables (constants)
    if (userId) {
      try {
        const sysVarsRes = await db.query(
          'SELECT name, default_value FROM user_variable_definitions WHERE user_id = $1 AND is_system = true',
          [userId]
        );
        for (const row of sysVarsRes.rows) {
          const regex = new RegExp(`\\{\\{${row.name}\\}\\}`, 'gi');
          result = result.replace(regex, row.default_value || '');
        }
      } catch (e) {
      }
    }
    
    // Remove any remaining unreplaced {{...}} patterns
    const unreplacedMatches = result.match(/\{\{[^}]+\}\}/g);
    if (unreplacedMatches) {
      result = result.replace(/\{\{[^}]+\}\}/g, '');
    }
    
    return result;
  }
  
  // Helper: Get WAHA connection with decrypted credentials
  async getConnection(userId) {
    const result = await db.query(
      "SELECT * FROM whatsapp_connections WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1",
      [userId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const connection = result.rows[0];
    
    // Get decrypted credentials
    let base_url, api_key;
    
    const { baseUrl: base_url_resolved, apiKey: api_key_resolved } = await getWahaCredentialsForConnection(connection);
    base_url = base_url_resolved;
    api_key = api_key_resolved;
    
    
    // Return connection object with decrypted values
    return {
      ...connection,
      base_url,
      api_key,
    };
  }
  
  // Helper: resolve @lid inside a WhatsApp message ID string.
  // Format: "[true|false]_CHATID@lid_MSGID" → "[true|false]_PHONE@c.us_MSGID"
  async resolveMsgIdLid(connection, msgId) {
    if (!msgId || !msgId.includes('@lid')) return msgId;
    const m = msgId.match(/^((?:true|false)_)(\d+@lid)(_[A-Za-z0-9]+(?:_[^_]+)*)$/);
    if (!m) return msgId;
    try {
      const phone = await wahaService.resolveLid(connection, m[2]);
      if (phone) {
        const resolved = `${m[1]}${phone}@c.us${m[3]}`;
        return resolved;
      }
    } catch (e) {
      console.warn('[BotEngine] LID resolution in msgId failed:', e.message);
    }
    return msgId;
  }

  // Helper: Sleep
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Helper: Log bot run
  async logBotRun(botId, contactId, status, errorMessage = null) {
    try {
      // Ensure created_at column exists
      await db.query(`ALTER TABLE bot_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`);
      
      await db.query(
        `INSERT INTO bot_logs (bot_id, contact_id, trigger_type, status, error_message, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [botId, contactId, 'message', status, errorMessage]
      );
    } catch (err) {
      console.error('[BotEngine] Failed to log bot run:', err.message);
    }
  }
  
  // Helper: Add tag to contact
  async addTagToContact(contactId, tagName, userId) {
    // Get or create tag
    let tagResult = await db.query(
      'SELECT id FROM tags WHERE user_id = $1 AND name = $2',
      [userId, tagName]
    );
    
    let tagId;
    if (tagResult.rows.length === 0) {
      const insertResult = await db.query(
        'INSERT INTO tags (user_id, name) VALUES ($1, $2) RETURNING id',
        [userId, tagName]
      );
      tagId = insertResult.rows[0].id;
    } else {
      tagId = tagResult.rows[0].id;
    }
    
    // Add to contact
    await db.query(
      `INSERT INTO contact_tags (contact_id, tag_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [contactId, tagId]
    );
  }
  
  // Helper: Remove tag from contact
  async removeTagFromContact(contactId, tagName, userId) {
    await db.query(
      `DELETE FROM contact_tags WHERE contact_id = $1 AND tag_id IN 
       (SELECT id FROM tags WHERE user_id = $2 AND name = $3)`,
      [contactId, userId, tagName]
    );
  }
  
  // Helper: Get all contact variables
  async getContactVariables(contactId) {
    try {
      const result = await db.query(
        'SELECT key, value FROM contact_variables WHERE contact_id = $1',
        [contactId]
      );
      const vars = {};
      for (const row of result.rows) {
        vars[row.key] = row.value;
      }
      return vars;
    } catch (e) {
      return {};
    }
  }
  
  // Execute formula/calculate node
  async executeFormulaNode(node, contact, userId, message = '') {
    const steps = node.data?.steps || [];
    if (steps.length === 0) return;

    // Pre-load all persisted contact variables so formulas can reference
    // user-defined variables stored in prior runs (not just system vars).
    const dbVars = await this.getContactVariables(contact.id);

    for (const step of steps) {
      const { expression, outputVar } = step;
      if (!expression || !outputVar) continue;

      try {
        // Resolve each {{var}} to a safe literal:
        //   1. in-memory contact.variables (set earlier in this run)
        //   2. persisted DB contact_variables
        //   3. system/basic replacements (name, phone, date, ...)
        //   4. unresolved → 0 (so unset counters behave like numbers)
        const resolvedExpr = expression.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
          const key = varName.trim();
          let raw;

          if (contact.variables && Object.prototype.hasOwnProperty.call(contact.variables, key)) {
            raw = contact.variables[key];
          } else if (Object.prototype.hasOwnProperty.call(dbVars, key)) {
            raw = dbVars[key];
          } else {
            const sys = this.replaceVariables(match, contact, message, '', userId);
            raw = sys === match ? undefined : sys;
          }

          if (raw === undefined || raw === null || String(raw).trim() === '') {
            return '0';
          }
          const num = Number(raw);
          if (!Number.isNaN(num) && String(raw).trim() !== '') {
            return String(num);
          }
          return JSON.stringify(String(raw));
        });

        // Evaluate the expression safely
        const result = this._evalFormula(resolvedExpr);
        const resultStr = result === null || result === undefined ? '' : String(result);

        await this.setContactVariable(contact.id, outputVar, resultStr);
        // Update in-memory contact variables for subsequent steps
        if (!contact.variables) contact.variables = {};
        contact.variables[outputVar] = resultStr;
        dbVars[outputVar] = resultStr;
      } catch (err) {
        console.error(`[BotEngine] Formula step error for {{${outputVar}}}: ${err.message}`);
      }
    }
  }

  // Safe formula evaluator supporting basic math and string functions
  _evalFormula(expr) {
    // String helper functions
    const UPPER = (s) => String(s).toUpperCase();
    const LOWER = (s) => String(s).toLowerCase();
    const TRIM = (s) => String(s).trim();
    const LENGTH = (s) => String(s).length;
    const REPLACE = (s, from, to) => String(s).split(String(from)).join(String(to));
    const SUBSTRING = (s, start, len) => String(s).substring(Number(start), Number(start) + Number(len));
    const CONCAT = (...args) => args.map(a => String(a)).join('');
    const ROUND = (n, d = 0) => Number(Number(n).toFixed(Number(d)));
    const ABS = (n) => Math.abs(Number(n));
    const MIN = (a, b) => Math.min(Number(a), Number(b));
    const MAX = (a, b) => Math.max(Number(a), Number(b));
    const IF = (cond, yes, no) => (cond ? yes : no);
    const NOW = () => new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
    const DATE_FORMAT = (d, fmt) => {
      try {
        const date = d ? new Date(d) : new Date();
        return date.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });
      } catch { return String(d); }
    };

    // Allowed globals only — no access to require, process, etc.
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      'UPPER','LOWER','TRIM','LENGTH','REPLACE','SUBSTRING','CONCAT',
      'ROUND','ABS','MIN','MAX','IF','NOW','DATE_FORMAT',
      `"use strict"; return (${expr});`
    );
    return fn(UPPER, LOWER, TRIM, LENGTH, REPLACE, SUBSTRING, CONCAT,
      ROUND, ABS, MIN, MAX, IF, NOW, DATE_FORMAT);
  }

  // Helper: Set contact variable
  async setContactVariable(contactId, key, value, label = null) {
    // Reserved system variable names - never add these to user_variable_definitions
    const RESERVED_VARIABLES = [
      'name', 'contact_phone', 'last_message', 'bot_name', 
      'date', 'time', 'day', 'phone', 'email'
    ];
    
    
    // Save the value to contact
    await db.query(
      `INSERT INTO contact_variables (contact_id, key, value)
       VALUES ($1, $2, $3)
       ON CONFLICT (contact_id, key) DO UPDATE SET value = $3, updated_at = NOW()`,
      [contactId, key, value]
    );
    
    // Don't add reserved system variable names to user definitions
    if (RESERVED_VARIABLES.includes(key.toLowerCase())) {
      return;
    }
    
    // Auto-add variable to user's variable definitions (if not exists)
    try {
      // Get user_id from contact
      const contactRes = await db.query('SELECT user_id FROM contacts WHERE id = $1', [contactId]);
      if (contactRes.rows[0]) {
        const userId = contactRes.rows[0].user_id;
        const displayLabel = label || key; // Use provided label or default to key
        const result = await db.query(
          `INSERT INTO user_variable_definitions (user_id, name, label, var_type)
           VALUES ($1, $2, $3, 'text')
           ON CONFLICT (user_id, name) DO NOTHING
           RETURNING id`,
          [userId, key, displayLabel]
        );
        if (result.rows.length > 0) {
        } else {
        }
      } else {
      }
    } catch (err) {
      // Ignore errors - table might not exist yet
    }
  }
  
  // Helper: Delete contact variable
  async deleteContactVariable(contactId, key) {
    await db.query(
      'DELETE FROM contact_variables WHERE contact_id = $1 AND key = $2',
      [contactId, key]
    );
  }
  
  // Helper: Send webhook
  async sendWebhook(url, contact) {
    try {
      const axios = require('axios');
      await axios.post(url, {
        contact_id: contact.id,
        phone: contact.phone,
        name: contact.display_name,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[BotEngine] Webhook error:', error.message);
    }
  }
}

module.exports = new BotEngine();
