const db = require('../config/database');
const wahaService = require('./waha/session.service');
const { decrypt } = require('./crypto/encrypt.service');
const { getWahaCredentials } = require('./settings/system.service');
const validationService = require('./validation.service');
const { checkLimit, incrementBotRuns } = require('../controllers/subscriptions/subscriptions.controller');
const { getSocketManager } = require('./socket/manager.service');

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
      console.log('[BotEngine] 📡 Emitting outgoing_message via socket for user:', userId);
      console.log('[BotEngine] 📡 Message data:', { id: savedMessage.id, contact_id: savedMessage.contact_id, type: savedMessage.message_type });
      const socketManager = getSocketManager();
      socketManager.emitToUser(userId, 'outgoing_message', {
        message: { ...savedMessage, from_bot: true },
        contact
      });
      console.log('[BotEngine] 📡 Socket emit complete');
      
      return savedMessage;
    } catch (error) {
      console.error('[BotEngine] Error saving outgoing message:', error.message);
      return null;
    }
  }
  
  // Process incoming message
  async processMessage(userId, contactPhone, message, messageType = 'text', selectedRowId = null, quotedListTitle = null, isGroupMessage = false, groupId = null, extraContext = {}) {
    try {
      // Log channel/group context
      if (extraContext.isChannel) {
        console.log(`[BotEngine] 📢 CHANNEL MESSAGE from ${extraContext.channelName || extraContext.channelId}`);
        console.log(`[BotEngine] 📢 Channel context:`, JSON.stringify(extraContext, null, 2));
      }
      
      // Get all active bots for this user
      const botsResult = await db.query(
        'SELECT * FROM bots WHERE user_id = $1 AND is_active = true',
        [userId]
      );
      
      if (botsResult.rows.length === 0) {
        console.log('[BotEngine] No active bots for user:', userId);
        return;
      }
      
      console.log(`[BotEngine] Found ${botsResult.rows.length} active bot(s) for user ${userId}`);
      
      // Get or create contact state
      const contactResult = await db.query(
        'SELECT * FROM contacts WHERE user_id = $1 AND phone = $2',
        [userId, contactPhone]
      );
      
      if (contactResult.rows.length === 0) {
        console.log('[BotEngine] Contact not found:', contactPhone);
        return;
      }
      
      const contact = contactResult.rows[0];
      
      // Check if bot is disabled for this contact
      if (!contact.is_bot_active) {
        // Check if takeover has expired
        if (contact.takeover_until && new Date(contact.takeover_until) < new Date()) {
          // Takeover expired, re-enable bot
          await db.query('UPDATE contacts SET is_bot_active = true, takeover_until = NULL WHERE id = $1', [contact.id]);
          console.log('[BotEngine] Takeover expired, re-enabling bot for:', contactPhone);
        } else {
          console.log('[BotEngine] Bot disabled for contact:', contactPhone);
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
    try {
      // Get all active bots for this user
      const botsResult = await db.query(
        'SELECT * FROM bots WHERE user_id = $1 AND is_active = true',
        [userId]
      );
      
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
        // For some events like group_join we may not have the contact yet
        // Try to create one
        console.log('[BotEngine] Contact not found for event, creating:', contactPhone);
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
          console.log('[BotEngine] Could not create contact for event:', insertErr.message);
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
          console.log('[BotEngine] Bot disabled for contact:', contactPhone);
          return;
        }
      }
      
      // Add event context to contact
      contact._eventType = eventType;
      contact._eventData = eventData;
      contact._isGroupMessage = !!eventData.groupId;
      contact._groupId = eventData.groupId || null;
      
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
          console.log('[BotEngine] Bot', bot.name, 'is disabled for contact:', contact.phone);
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
        
        // Check if all conditions in the group match
        let allMatch = true;
        let hasEventCondition = false;
        
        for (const condition of group.conditions) {
          if (this.isEventCondition(condition.type)) {
            hasEventCondition = true;
            console.log(`[BotEngine] Checking event condition: type=${condition.type}, filterByStatus=${condition.filterByStatus}, specificStatusId=${condition.specificStatusId || 'none'}`);
            if (!this.checkEventCondition(condition, eventType, eventData)) {
              console.log(`[BotEngine] Event condition did NOT match`);
              allMatch = false;
              break;
            }
            console.log(`[BotEngine] Event condition matched!`);
          } else if (condition.type === 'has_tag' || condition.type === 'no_tag' || condition.type === 'contact_field') {
            // Also check contact-based conditions
            const conditionMet = await this.checkSingleCondition(condition, '', contact);
            if (!conditionMet) {
              allMatch = false;
              break;
            }
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
                console.log('[BotEngine] Event cooldown active for group:', group.id);
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
              console.log('[BotEngine] Event already triggered once for this user in group:', group.id);
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
            console.log('[BotEngine] Failed to record event trigger history:', historyErr.message);
          }
          
          break;
        }
      }
      
      if (!matched) return;
      
      console.log(`[BotEngine] ✅ Event trigger matched! Starting flow for bot: ${bot.name}, event: ${eventType}`);
      
      // Check subscription limit for bot runs
      const runsLimit = await checkLimit(userId, 'bot_runs');
      if (!runsLimit.allowed) {
        console.log('[BotEngine] User has reached monthly bot runs limit');
        return;
      }
      
      // Log bot run and increment usage
      await this.logBotRun(bot.id, contact.id, 'triggered');
      await incrementBotRuns(userId);
      
      // Create event description for the flow
      const eventMessage = this.getEventDescription(eventType, eventData);
      
      // Start the flow from trigger node
      const triggerNode2 = flowData.nodes.find(n => n.type === 'trigger');
      if (!triggerNode2) return;
      
      const nextEdges = flowData.edges.filter(e => e.source === triggerNode2.id);
      if (nextEdges.length === 0) return;
      
      const sortedEdges = nextEdges.sort((a, b) => {
        const nodeA = flowData.nodes.find(n => n.id === a.target);
        const nodeB = flowData.nodes.find(n => n.id === b.target);
        return (nodeA?.position?.y || 0) - (nodeB?.position?.y || 0);
      });
      
      for (const edge of sortedEdges) {
        await this.executeNode(edge.target, flowData, contact, eventMessage, userId, bot.id, bot.name);
      }
    } catch (error) {
      console.error('[BotEngine] Error processing event bot:', error.message);
    }
  }
  
  // Check if condition type is an event-based condition
  isEventCondition(type) {
    return ['status_viewed', 'status_reaction', 'status_reply', 'group_join', 'group_leave', 
            'call_received', 'call_rejected', 'call_accepted', 'poll_vote'].includes(type);
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
      console.log(`[BotEngine] Specific group check: condition=${condition.specificGroupId}, event=${eventGroupId}`);
      if (eventGroupId !== condition.specificGroupId) {
        console.log(`[BotEngine] Specific group mismatch`);
        return false;
      }
      console.log(`[BotEngine] Specific group matched!`);
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
      
      console.log(`[BotEngine] Specific status check: condition.specificStatusId=${condition.specificStatusId}`);
      console.log(`[BotEngine] Specific status check: eventMsgId=${eventMsgId}`);
      console.log(`[BotEngine] Specific status check: storedHex=${storedHex}, eventHex=${eventHex}`);
      
      if (!storedHex || !eventHex || storedHex !== eventHex) {
        console.log(`[BotEngine] Specific status mismatch`);
        return false;
      }
      console.log(`[BotEngine] Specific status matched!`);
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
      'poll_vote': `ענה על סקר: ${(eventData.selectedOptions || []).join(', ')}`
    };
    return descriptions[eventType] || eventType;
  }
  
  // Process single bot
  async processBot(bot, contact, message, messageType, userId, selectedRowId = null, quotedListTitle = null, isGroupMessage = false, extraContext = {}) {
    try {
      // Check if this specific bot is disabled for this contact
      try {
        const disabledCheck = await db.query(
          'SELECT id FROM contact_disabled_bots WHERE contact_id = $1 AND bot_id = $2',
          [contact.id, bot.id]
        );
        if (disabledCheck.rows.length > 0) {
          console.log('[BotEngine] Bot', bot.name, 'is disabled for contact:', contact.phone);
          return;
        }
      } catch (disabledErr) {
        // Table may not exist yet - that's fine, no bots are disabled
      }
      
      const flowData = bot.flow_data;
      if (!flowData || !flowData.nodes || flowData.nodes.length === 0) {
        console.log('[BotEngine] Bot has no flow data:', bot.id);
        return;
      }
      
      // Check for existing session (waiting for response)
      const session = await this.getSession(bot.id, contact.id);
      
      if (session && session.waiting_for) {
        console.log('[BotEngine] 📍 Found active session, waiting for:', session.waiting_for);
        console.log('[BotEngine] Current node:', session.current_node_id);
        
        // Check if session expired
        if (session.expires_at && new Date(session.expires_at) < new Date()) {
          console.log('[BotEngine] Session expired, handling timeout');
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
            console.log('[BotEngine] 📝 Received text while waiting for list - checking triggers');
            // Don't return - fall through to trigger check below
          }
        } else if (session.waiting_for === 'reply') {
          // Waiting for any reply (text/media) - this BLOCKS new triggers
          console.log('[BotEngine] ⏳ Waiting for reply - continuing session');
          await this.continueSession(session, flowData, contact, message, userId, bot, messageType, selectedRowId, null);
          return;
        } else if (session.waiting_for === 'registration') {
          // Waiting for registration answer - this BLOCKS new triggers
          console.log('[BotEngine] 📝 Waiting for registration answer - continuing session');
          await this.continueSession(session, flowData, contact, message, userId, bot, messageType, selectedRowId, null);
          return;
        }
      }
      
      // If this is a list_response but no session exists, try to find the list by title
      if (messageType === 'list_response') {
        if (quotedListTitle) {
          console.log('[BotEngine] List response without session - searching for list by title:', quotedListTitle);
          
          // Find the list node by title
          const listNode = flowData.nodes.find(n => 
            n.type === 'list' && n.data?.title === quotedListTitle
          );
          
          if (listNode) {
            console.log('[BotEngine] Found list node:', listNode.id);
            
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
            console.log('[BotEngine] Could not find list node with title:', quotedListTitle);
          }
        }
        
        console.log('[BotEngine] List response received but no active session and no matching list - ignoring');
        return;
      }
      
      // No active session - check trigger for new flow
      const triggerNode = flowData.nodes.find(n => n.type === 'trigger');
      if (!triggerNode) {
        console.log('[BotEngine] No trigger node in bot:', bot.id);
        return;
      }
      
      // Check if trigger matches (pass isGroupMessage for per-group filtering)
      const triggerMatches = await this.checkTrigger(triggerNode.data, message, messageType, contact, bot.id, isGroupMessage);
      if (!triggerMatches) {
        console.log('[BotEngine] Trigger does not match for bot:', bot.id);
        return;
      }
      
      console.log('[BotEngine] ✅ Trigger matched! Starting flow for bot:', bot.name);
      console.log('[BotEngine] Flow data has', flowData.nodes.length, 'nodes and', flowData.edges.length, 'edges');
      console.log('[BotEngine] Trigger settings:', JSON.stringify({
        autoMarkSeen: triggerNode.data.autoMarkSeen,
        oncePerUser: triggerNode.data.oncePerUser,
        hasCooldown: triggerNode.data.hasCooldown
      }));
      
      // Record trigger history for cooldown/once-per-user tracking
      const matchedGroupId = triggerNode.data._matchedGroupId;
      if (matchedGroupId) {
        try {
          await db.query(`
            INSERT INTO bot_trigger_history (bot_id, contact_id, trigger_group_id, triggered_at)
            VALUES ($1, $2, $3, NOW())
          `, [bot.id, contact.id, matchedGroupId]);
          console.log('[BotEngine] Recorded trigger history for group:', matchedGroupId);
        } catch (historyErr) {
          console.log('[BotEngine] Failed to record trigger history:', historyErr.message);
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
            console.log('[BotEngine] ✅ Auto marked as seen (trigger setting)');
          }
        } catch (err) {
          console.log('[BotEngine] ⚠️ Failed to auto mark as seen:', err.message);
        }
      }
      
      // Check subscription limit for bot runs
      const runsLimit = await checkLimit(userId, 'bot_runs');
      if (!runsLimit.allowed) {
        console.log('[BotEngine] ⚠️ User has reached monthly bot runs limit:', runsLimit.limit);
        // Optionally send a message to the contact
        // For now, just log and skip
        return;
      }
      
      // Log bot run and increment usage
      await this.logBotRun(bot.id, contact.id, 'triggered');
      await incrementBotRuns(userId);
      
      // Find ALL next nodes after trigger (support multiple branches)
      const nextEdges = flowData.edges.filter(e => e.source === triggerNode.id);
      if (nextEdges.length === 0) {
        console.log('[BotEngine] No edge from trigger');
        return;
      }
      
      // Sort by target node Y position (top to bottom)
      const sortedEdges = nextEdges.sort((a, b) => {
        const nodeA = flowData.nodes.find(n => n.id === a.target);
        const nodeB = flowData.nodes.find(n => n.id === b.target);
        const posA = nodeA?.position?.y || 0;
        const posB = nodeB?.position?.y || 0;
        return posA - posB;
      });
      
      console.log('[BotEngine] Executing', sortedEdges.length, 'branches from trigger');
      
      // Execute all branches sequentially (top to bottom)
      for (const edge of sortedEdges) {
        await this.executeNode(edge.target, flowData, contact, message, userId, bot.id, bot.name);
      }
      
    } catch (error) {
      console.error('[BotEngine] Error processing bot:', error);
      await this.logBotRun(bot.id, contact.id, 'error', error.message);
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
      console.log('[BotEngine] 📋 Found session:', { botId, contactId, waitingFor: session.waiting_for, nodeId: session.current_node_id });
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
      
      console.log('[BotEngine] 💾 Session saved:', { botId, contactId, nodeId, waitingFor, timeout: timeoutSeconds });
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
    console.log('[BotEngine] 🗑️ Session cleared');
  }
  
  // Continue from saved session
  async continueSession(session, flowData, contact, message, userId, bot, messageType = 'text', selectedRowId = null, quotedListTitle = null) {
    const currentNode = flowData.nodes.find(n => n.id === session.current_node_id);
    if (!currentNode) {
      console.log('[BotEngine] Session node not found, clearing session');
      await this.clearSession(bot.id, contact.id);
      return;
    }
    
    console.log('[BotEngine] ▶️ Continuing from node:', currentNode.type, currentNode.id);
    console.log('[BotEngine] Message type:', messageType, '| Selected row ID:', selectedRowId);
    
    // Auto mark as seen if enabled in trigger (for all messages in the flow)
    const triggerNode = flowData.nodes.find(n => n.type === 'trigger');
    if (triggerNode?.data?.autoMarkSeen) {
      try {
        const connection = await this.getConnection(userId);
        if (connection) {
          await wahaService.sendSeen(connection, contact.phone);
          console.log('[BotEngine] ✅ Auto marked as seen (during flow)');
        }
      } catch (err) {
        console.log('[BotEngine] ⚠️ Failed to auto mark as seen:', err.message);
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
        console.log('[BotEngine] ⚠️ Waiting for list_response but received:', messageType);
        console.log('[BotEngine] Ignoring non-list response');
        return;
      }
      
      // IMPORTANT: Verify the list_response is for THIS list, not a different one
      const sessionListTitle = session.waiting_data?.listTitle;
      if (quotedListTitle && sessionListTitle && quotedListTitle !== sessionListTitle) {
        console.log('[BotEngine] ⚠️ List response is for a DIFFERENT list!');
        console.log('[BotEngine] Session list:', sessionListTitle);
        console.log('[BotEngine] Clicked list:', quotedListTitle);
        
        // Find the correct list node by title
        const correctListNode = flowData.nodes.find(n => 
          n.type === 'list' && n.data?.title === quotedListTitle
        );
        
        if (correctListNode) {
          console.log('[BotEngine] Found correct list node:', correctListNode.id);
          
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
          console.log('[BotEngine] Could not find list node with title:', quotedListTitle);
          console.log('[BotEngine] Clearing session - user needs to start again');
          await this.clearSession(bot.id, contact.id);
          return;
        }
      }
      
      // Use selectedRowId directly from WAHA
      if (selectedRowId !== null && selectedRowId !== undefined) {
        // Convert to string in case WAHA sends a number
        const rowIdStr = String(selectedRowId);
        console.log('[BotEngine] Using selectedRowId from WAHA:', rowIdStr, '(original type:', typeof selectedRowId, ')');
        
        // Extract display index from selectedRowId (e.g., "option_0" -> 0, or just "0")
        let displayIndex = -1;
        if (rowIdStr.startsWith('option_')) {
          displayIndex = parseInt(rowIdStr.replace('option_', ''));
        } else if (/^\d+$/.test(rowIdStr)) {
          displayIndex = parseInt(rowIdStr);
        }
        
        console.log('[BotEngine] Display index:', displayIndex);
        
        // Get session buttons to find original index (for filtered lists)
        const sessionButtons = session.waiting_data?.buttons || [];
        const selectedButton = sessionButtons.find(b => 
          b.displayIndex === displayIndex || 
          b.id === rowIdStr || 
          b.id === `option_${displayIndex}`
        );
        const originalIndex = selectedButton?.originalIndex ?? displayIndex;
        
        console.log('[BotEngine] Original index:', originalIndex);
        
        // Find edges from this node
        const nodeEdges = flowData.edges.filter(e => e.source === currentNode.id);
        console.log('[BotEngine] Available edges:', nodeEdges.map(e => ({ target: e.target, handle: e.sourceHandle })));
        
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
              console.log('[BotEngine] ✅ Found matching handle:', handleId);
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
        console.log('[BotEngine] Single select mode - session cleared');
      }
      
      // Store session data BEFORE executing flow (in case flow creates new session)
      const originalSessionData = { ...session.waiting_data };
      const originalNodeId = currentNode.id;
      
      // Find next edge
      let nextEdge;
      if (nextHandleId) {
        nextEdge = flowData.edges.find(e => e.source === currentNode.id && e.sourceHandle === nextHandleId);
      }
      if (!nextEdge) {
        // Fallback - try default edge (no handle)
        nextEdge = flowData.edges.find(e => e.source === currentNode.id && !e.sourceHandle);
        if (nextEdge) {
          console.log('[BotEngine] Using default edge (no specific handle)');
        }
      }
      
      if (nextEdge) {
        console.log('[BotEngine] ➡️ Following edge to:', nextEdge.target);
        await this.executeNode(nextEdge.target, flowData, contact, message, userId, bot.id, bot.name);
      } else {
        console.log('[BotEngine] No next edge found from session node');
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
          console.log('[BotEngine] ✅ Multi-select session restored for more selections');
        } else {
          // Flow created a new session (registration, reply, another list, etc.) - don't override it
          console.log('[BotEngine] ℹ️ New session exists (' + (currentSession?.waiting_for || 'unknown') + ' on ' + (currentSession?.current_node_id || 'unknown') + '), not restoring list session');
        }
      }
      
      return;
      
    } else if (session.waiting_for === 'reply') {
      // For regular reply wait, clear session and continue
      const waitingData = session.waiting_data ? (typeof session.waiting_data === 'string' ? JSON.parse(session.waiting_data) : session.waiting_data) : {};
      
      // Save reply to variable if configured
      if (waitingData.saveToVariable && waitingData.variableName && message) {
        await this.setContactVariable(contact.id, waitingData.variableName, message);
        console.log(`[BotEngine] 💾 Saved reply to variable "${waitingData.variableName}": ${message.substring(0, 50)}`);
      }
      
      await this.clearSession(bot.id, contact.id);
      console.log('[BotEngine] Got reply, continuing flow');
      
      // For reply sessions, prefer 'reply' handle edge, then fall back to default
      nextHandleId = 'reply';
    } else if (session.waiting_for === 'registration') {
      // Continue registration flow
      console.log('[BotEngine] Continuing registration flow');
      return await this.continueRegistration(session, flowData, contact, message, userId, bot);
    }
    
    // Find next edge
    let nextEdge;
    if (nextHandleId) {
      nextEdge = flowData.edges.find(e => e.source === currentNode.id && e.sourceHandle === nextHandleId);
    }
    if (!nextEdge) {
      // Fallback - try default edge (no handle or null handle)
      nextEdge = flowData.edges.find(e => e.source === currentNode.id && (!e.sourceHandle || e.sourceHandle === null));
      if (nextEdge) {
        console.log('[BotEngine] Using default edge (no specific handle)');
      }
    }
    
    if (nextEdge) {
      console.log('[BotEngine] ➡️ Following edge to:', nextEdge.target);
      await this.executeNode(nextEdge.target, flowData, contact, message, userId, bot.id, bot.name);
    } else {
      console.log('[BotEngine] No next edge found from session node');
    }
  }
  
  // Handle session timeout
  async handleSessionTimeout(session, flowData, contact, message, userId, bot) {
    const currentNode = flowData.nodes.find(n => n.id === session.current_node_id);
    
    // Clear session
    await this.clearSession(bot.id, contact.id);
    
    if (!currentNode) return;
    
    // Find timeout edge
    const timeoutEdge = flowData.edges.find(e => 
      e.source === currentNode.id && e.sourceHandle === 'timeout'
    );
    
    if (timeoutEdge) {
      console.log('[BotEngine] ⏰ Executing timeout path');
      await this.executeNode(timeoutEdge.target, flowData, contact, message, userId, bot.id, bot.name);
    }
  }
  
  // Check if trigger matches (with advanced settings)
  async checkTrigger(triggerData, message, messageType, contact, botId, isGroupMessage = false) {
    console.log('[BotEngine] checkTrigger called with:');
    console.log('[BotEngine] - Message:', message);
    console.log('[BotEngine] - MessageType:', messageType);
    console.log('[BotEngine] - Is group message:', isGroupMessage);
    
    // Support both new triggerGroups format and old triggers format
    const triggerGroups = triggerData.triggerGroups || [];
    const oldTriggers = triggerData.triggers || [];
    
    console.log('[BotEngine] - triggerGroups count:', triggerGroups.length);
    console.log('[BotEngine] - oldTriggers count:', oldTriggers.length);
    
    // If no triggers defined at all, don't match
    if (triggerGroups.length === 0 && oldTriggers.length === 0) {
      console.log('[BotEngine] No triggers defined - not matching');
      return false;
    }
    
    // FIRST: Check if the message content matches the trigger conditions
    let contentMatches = false;
    
    // NEW FORMAT: Check triggerGroups (groups are OR, conditions within group are AND)
    if (triggerGroups.length > 0) {
      console.log('[BotEngine] Checking', triggerGroups.length, 'trigger groups');
      
      for (const group of triggerGroups) {
        const conditions = group.conditions || [];
        console.log('[BotEngine] Group:', group.id, '- conditions:', conditions.length, '- allowGroupMessages:', group.allowGroupMessages);
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
          console.log('[BotEngine] Skipping trigger group - channel messages not allowed');
          continue; // Try next group
        }
        if (isGroupMessage && !isChannelMessage && !allowGroupMessages) {
          console.log('[BotEngine] Skipping trigger group - group messages not allowed');
          continue; // Try next group
        }
        if (!isGroupMessage && !isChannelMessage && !allowDirectMessages) {
          console.log('[BotEngine] Skipping trigger group - direct messages not allowed');
          continue; // Try next group
        }
        console.log('[BotEngine] Message source check passed - isGroup:', isGroupMessage, 'isChannel:', isChannelMessage, 'allowDirect:', allowDirectMessages, 'allowGroup:', allowGroupMessages, 'allowChannel:', allowChannelMessages, '(auto-detected: channel=', hasChannelTrigger, 'group=', hasGroupTrigger, ')');
        
        // All conditions in this group must match (AND)
        let groupMatches = true;
        
        for (const condition of conditions) {
          const conditionMatches = await this.checkSingleCondition(condition, message, contact);
          console.log('[BotEngine] Condition', condition.type, condition.operator || '', ':', conditionMatches);
          
          if (!conditionMatches) {
            groupMatches = false;
            break;
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
            
            console.log(`[BotEngine] Active hours check: current=${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')} (Israel), range=${activeFrom}-${activeTo}`);
            
            let isWithinHours;
            if (fromTime <= toTime) {
              // Normal range (e.g., 09:00-18:00)
              isWithinHours = currentTime >= fromTime && currentTime <= toTime;
            } else {
              // Overnight range (e.g., 22:00-06:00)
              isWithinHours = currentTime >= fromTime || currentTime <= toTime;
            }
            
            if (!isWithinHours) {
              console.log('[BotEngine] Group outside active hours, skipping');
              groupMatches = false;
            } else {
              console.log('[BotEngine] Group within active hours, continuing');
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
                console.log('[BotEngine] Group in cooldown period, skipping');
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
              console.log('[BotEngine] Group already triggered for this user, skipping');
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
                  console.log('[BotEngine] Bot triggered within time window, condition not met');
                  groupMatches = false;
                }
              }
            }
          }
        }
        
        // If this group matches, content matches (OR between groups)
        if (groupMatches) {
          console.log('[BotEngine] Trigger group matched!');
          contentMatches = true;
          // Store the matched group for history tracking
          triggerData._matchedGroupId = group.id;
          break;
        }
      }
    }
    // OLD FORMAT: Check triggers array (backward compatibility)
    else if (oldTriggers.length > 0) {
      console.log('[BotEngine] Using old triggers format');
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
              console.log('[BotEngine] Invalid regex:', trigger.value);
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
      console.log('[BotEngine] Content does not match trigger conditions');
      return false;
    }
    
    console.log('[BotEngine] Content matches! Now checking advanced settings...');
    
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
        console.log('[BotEngine] Outside active hours');
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
          console.log('[BotEngine] Already ran for this user (oncePerUser)');
          return false;
        }
      } catch (err) {
        console.log('[BotEngine] oncePerUser check failed, skipping:', err.message);
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
            console.log('[BotEngine] In cooldown period (', Math.round((cooldownMs - (Date.now() - lastRunTime)) / 1000), 'seconds left)');
            return false;
          }
        }
      } catch (cooldownErr) {
        console.log('[BotEngine] Cooldown check failed, skipping:', cooldownErr.message);
      }
    }
    
    console.log('[BotEngine] ✅ All checks passed - trigger matches!');
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
      console.log(`[BotEngine] first_message check: contact has ${messageCount} incoming messages`);
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
      
      console.log(`[BotEngine] facebook_campaign check: entryPoint=${entryPointSource}, hasExternalAdReply=${!!externalAdReply}, result=${isFacebookCampaign}`);
      
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
        console.log('[BotEngine] no_message_in: First message from contact, condition met');
        return true;
      }
      
      const previousMessageTime = new Date(previousMessage.rows[0].created_at);
      const conditionMet = previousMessageTime < cutoffTime;
      console.log(`[BotEngine] no_message_in: Previous message at ${previousMessageTime.toISOString()}, cutoff: ${cutoffTime.toISOString()}, met: ${conditionMet}`);
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
        return normalizedField.includes(normalizedValue);
      case 'not_contains':
        return !normalizedField.includes(normalizedValue);
      case 'equals':
        return normalizedField === normalizedValue;
      case 'not_equals':
        return normalizedField !== normalizedValue;
      case 'starts_with':
        return normalizedField.startsWith(normalizedValue);
      case 'ends_with':
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
        return normalizedField.includes(normalizedValue);
    }
  }
  
  // Execute a node
  async executeNode(nodeId, flowData, contact, message, userId, botId, botName = '') {
    const node = flowData.nodes.find(n => n.id === nodeId);
    if (!node) {
      console.log('[BotEngine] Node not found:', nodeId);
      return;
    }
    
    console.log('[BotEngine] Executing node:', node.type, nodeId);
    
    let nextHandleId = null;
    
    switch (node.type) {
      case 'message':
        const shouldWait = await this.executeMessageNode(node, contact, message, userId, botName, botId);
        if (shouldWait) return; // Wait for response, don't continue
        break;
        
      case 'condition':
        nextHandleId = await this.executeConditionNode(node, contact, message, userId);
        break;
        
      case 'delay':
        await this.executeDelayNode(node, contact, userId);
        break;
        
      case 'action':
        await this.executeActionNode(node, contact, userId);
        break;
        
      case 'list':
        await this.executeListNode(node, contact, userId, botName, botId);
        // List nodes wait for response, session saved
        return;
        
      case 'registration':
        await this.executeRegistrationNode(node, contact, message, userId, botName, botId);
        // Registration nodes wait for responses, session saved
        return;
        
      case 'integration':
        await this.executeIntegrationNode(node, contact, userId);
        break;
        
      case 'google_sheets':
        await this.executeGoogleSheetsNode(node, contact, userId);
        break;
        
      case 'google_contacts':
        await this.executeGoogleContactsNode(node, contact, userId);
        break;
        
      case 'note':
        // Note nodes are just for documentation, skip them
        console.log('[BotEngine] 📝 Note node (skipped):', node.data?.text?.substring(0, 50) || '');
        break;
        
      case 'send_other':
        await this.executeSendOtherNode(node, contact, userId);
        break;
    }
    
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
      
      console.log('[BotEngine] Executing', sortedEdges.length, 'branches sequentially');
      
      // Execute all branches sequentially (top to bottom)
      for (const edge of sortedEdges) {
        await this.executeNode(edge.target, flowData, contact, message, userId, botId, botName);
      }
    }
  }
  
  // Execute message node - returns true if waiting for reply
  async executeMessageNode(node, contact, originalMessage, userId, botName = '', botId = null) {
    const actions = node.data.actions || [];
    const waitForReply = node.data.waitForReply || false;
    const timeout = node.data.timeout || null;
    
    console.log('[BotEngine] Message node has', actions.length, 'actions, waitForReply:', waitForReply);
    
    // Get WAHA connection
    const connection = await this.getConnection(userId);
    if (!connection) {
      console.log('[BotEngine] No WAHA connection for user:', userId);
      return false;
    }
    
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      console.log(`[BotEngine] Executing action ${i + 1}/${actions.length}:`, action.type);
      
      try {
        switch (action.type) {
          case 'text':
            if (action.content) {
              const text = await this.replaceAllVariables(action.content, contact, originalMessage, botName, userId);
              console.log('[BotEngine] Sending text:', text.substring(0, 50) + '...');
              
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
                result = await wahaService.sendLinkPreview(connection, contact.phone, text, preview);
                console.log('[BotEngine] ✅ Text with custom link preview sent');
              } else {
                result = await wahaService.sendMessage(connection, contact.phone, text);
              }
              // Save outgoing message to DB
              await this.saveOutgoingMessage(userId, contact.id, text, 'text', null, result?.id?.id);
              console.log('[BotEngine] ✅ Text sent and saved');
            }
            break;
            
          case 'image':
            if (action.url || action.fileData) {
              const imageUrl = action.fileData || action.url;
              const caption = await this.replaceAllVariables(action.caption || '', contact, originalMessage, botName, userId);
              console.log('[BotEngine] Sending image:', imageUrl.substring(0, 50) + '...');
              const result = await wahaService.sendImage(connection, contact.phone, imageUrl, caption);
              // Save outgoing message to DB
              await this.saveOutgoingMessage(userId, contact.id, caption || '', 'image', imageUrl, result?.id?.id);
              console.log('[BotEngine] ✅ Image sent and saved');
            } else {
              console.log('[BotEngine] ⚠️ Image action has no URL');
            }
            break;
            
          case 'video':
            if (action.url || action.fileData) {
              const videoUrl = action.fileData || action.url;
              const caption = await this.replaceAllVariables(action.caption || '', contact, originalMessage, botName, userId);
              console.log('[BotEngine] Sending video:', videoUrl.substring(0, 50) + '...');
              const result = await wahaService.sendVideo(connection, contact.phone, videoUrl, caption);
              // Save outgoing message to DB
              await this.saveOutgoingMessage(userId, contact.id, caption || '', 'video', videoUrl, result?.id?.id);
              console.log('[BotEngine] ✅ Video sent');
            } else {
              console.log('[BotEngine] ⚠️ Video action has no URL');
            }
            break;
            
          case 'audio':
            if (action.url || action.fileData) {
              const audioUrl = action.fileData || action.url;
              console.log('[BotEngine] Sending voice message:', audioUrl.substring(0, 50) + '...');
              const result = await wahaService.sendVoice(connection, contact.phone, audioUrl);
              // Save outgoing message to DB
              await this.saveOutgoingMessage(userId, contact.id, '', 'audio', audioUrl, result?.id?.id);
              console.log('[BotEngine] ✅ Voice message sent');
            } else {
              console.log('[BotEngine] ⚠️ Audio action has no URL');
            }
            break;
            
          case 'file':
            if (action.url || action.fileData) {
              const fileUrl = action.fileData || action.url;
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
              console.log('[BotEngine] Sending file:', filename, '- mimetype:', mimetype, '-', fileUrl.substring(0, 50) + '...');
              const fileResult = await wahaService.sendFile(connection, contact.phone, fileUrl, filename, mimetype);
              await this.saveOutgoingMessage(userId, contact.id, filename, 'document', fileUrl, fileResult?.id?.id, { filename, mimetype });
              console.log('[BotEngine] ✅ File sent and saved:', filename);
            } else {
              console.log('[BotEngine] ⚠️ File action has no URL');
            }
            break;
            
          case 'delay':
            const ms = (action.delay || 1) * (action.unit === 'minutes' ? 60000 : 1000);
            console.log('[BotEngine] Waiting', ms, 'ms...');
            await this.sleep(ms);
            console.log('[BotEngine] ✅ Delay completed');
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
              console.log('[BotEngine] ✅ Contact vCard sent and saved');
            } else {
              console.log('[BotEngine] ⚠️ Contact action has no phone number');
            }
            break;
          
          case 'location':
            if (action.latitude && action.longitude) {
              const title = this.replaceVariables(action.locationTitle || '', contact, originalMessage, botName);
              await wahaService.sendLocation(connection, contact.phone, action.latitude, action.longitude, title);
              await this.saveOutgoingMessage(userId, contact.id, title || 'מיקום', 'location', null, null, { latitude: action.latitude, longitude: action.longitude });
              console.log('[BotEngine] ✅ Location sent and saved');
            } else {
              console.log('[BotEngine] ⚠️ Location action missing coordinates');
            }
            break;
          
          case 'typing':
            {
              const duration = Math.min(30, Math.max(1, action.typingDuration || 3));
              await wahaService.startTyping(connection, contact.phone);
              await this.sleep(duration * 1000);
              await wahaService.stopTyping(connection, contact.phone);
              console.log('[BotEngine] ✅ Typing indicator completed');
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
                console.log('[BotEngine] ✅ Marked as seen:', lastSeenMsg.rows[0].wa_message_id);
              } else {
                // Fallback to just chat seen
                await wahaService.sendSeen(connection, contact.phone, []);
                console.log('[BotEngine] ✅ Marked chat as seen');
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
                const msgId = lastReactMsg.rows[0].wa_message_id;
                const dbMsgId = lastReactMsg.rows[0].id;
                console.log('[BotEngine] Sending reaction to message:', msgId);
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
                
                console.log('[BotEngine] ✅ Reaction sent:', action.reaction);
              } else {
                console.log('[BotEngine] ⚠️ Cannot send reaction - no message ID found');
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
              };
              await this.saveSession(botId, contact.id, node.id, 'reply', waitData, waitTimeout);
              console.log('[BotEngine] ⏳ Wait reply action - waiting for reply (timeout:', waitTimeout, 'seconds)');
              return true;
            }
            break;
          }
            
          default:
            console.log('[BotEngine] Unknown action type:', action.type);
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
      await this.saveSession(botId, contact.id, node.id, 'reply', {}, timeout);
      console.log('[BotEngine] ⏳ Waiting for reply (legacy)...');
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
    
    console.log('[BotEngine] Condition result:', result);
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
    
    console.log(`[BotEngine] Evaluating condition: variable=${variable}, varName="${varName}", value="${value}"`);
    
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
            console.log(`[BotEngine] Variable ${varName} = "${checkValue}"`);
          } else {
            // Plain variable name - query from contact_variables table
            try {
              const varResult = await db.query(
                'SELECT value FROM contact_variables WHERE contact_id = $1 AND key = $2',
                [contact.id, varName]
              );
              checkValue = varResult.rows[0]?.value || '';
              console.log(`[BotEngine] Variable ${varName} = "${checkValue}"`);
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
    
    console.log(`[BotEngine] Condition: "${checkValue}" ${operator} "${resolvedValue}"`);
    
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
        console.log('[BotEngine] Delay node has no actions, skipping');
        return;
      }
      
      const connection = await this.getConnection(userId);
      
      for (const action of node.data.actions) {
        if (action.type === 'delay') {
          const ms = (action.delay || 1) * (action.unit === 'minutes' ? 60000 : 1000);
          console.log('[BotEngine] Delay:', ms, 'ms');
          await this.sleep(ms);
        } else if (action.type === 'typing') {
          if (connection) {
            const duration = Math.min(30, Math.max(1, action.typingDuration || 3));
            await wahaService.startTyping(connection, contact.phone);
            await this.sleep(duration * 1000);
            await wahaService.stopTyping(connection, contact.phone);
            console.log('[BotEngine] ✅ Typing indicator shown for', duration, 'seconds');
          }
        }
      }
    } else if (node.data.delay || node.data.unit) {
      // Old format fallback - only if delay or unit exists
      const { delay, unit } = node.data;
      const ms = (delay || 1) * (unit === 'minutes' ? 60000 : unit === 'hours' ? 3600000 : 1000);
      console.log('[BotEngine] Delay:', ms, 'ms');
      await this.sleep(ms);
    } else {
      console.log('[BotEngine] Delay node has no configuration, skipping');
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
            console.log(`[BotEngine] ✅ Deleted variable: ${action.varName}`);
          }
          break;
          
        case 'delay':
          {
            let delayMs = (action.delay || 1) * 1000; // default to seconds
            if (action.unit === 'minutes') {
              delayMs = (action.delay || 1) * 60 * 1000;
            }
            delayMs = Math.min(delayMs, 5 * 60 * 1000); // max 5 minutes
            console.log(`[BotEngine] ⏱️ Waiting ${delayMs / 1000} seconds...`);
            await this.sleep(delayMs);
            console.log('[BotEngine] ✅ Delay finished');
          }
          break;
          
        case 'stop_bot':
          await db.query('UPDATE contacts SET is_bot_active = false WHERE id = $1', [contact.id]);
          break;
          
        case 'webhook':
          if (action.webhookUrl) {
            await this.sendWebhook(action.webhookUrl, contact);
          }
          break;
          
        case 'http_request':
          await this.executeHttpRequest(action, contact);
          break;
        
        // ========== NEW WHATSAPP ACTIONS ==========
        case 'send_voice':
          if (action.audioUrl) {
            const connection = await this.getConnection(userId);
            if (connection) {
              await wahaService.sendVoice(connection, contact.phone, action.audioUrl);
              console.log('[BotEngine] ✅ Voice message sent');
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
              console.log('[BotEngine] ✅ File sent');
            }
          }
          break;
          
        case 'send_location':
          if (action.latitude && action.longitude) {
            const connection = await this.getConnection(userId);
            if (connection) {
              await wahaService.sendLocation(connection, contact.phone, action.latitude, action.longitude, action.locationTitle || '');
              console.log('[BotEngine] ✅ Location sent');
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
              console.log('[BotEngine] ✅ Contact vCard sent');
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
              console.log('[BotEngine] ✅ Link preview sent');
            }
          }
          break;
          
        case 'mark_seen':
          {
            const connection = await this.getConnection(userId);
            if (connection) {
              await wahaService.sendSeen(connection, contact.phone);
              console.log('[BotEngine] ✅ Marked as seen');
            }
          }
          break;
          
        case 'typing':
          {
            const connection = await this.getConnection(userId);
            if (connection) {
              const duration = Math.min(30, Math.max(1, action.typingDuration || 3));
              await wahaService.startTyping(connection, contact.phone);
              console.log(`[BotEngine] ⌨️ Typing for ${duration} seconds...`);
              await this.sleep(duration * 1000);
              await wahaService.stopTyping(connection, contact.phone);
              console.log('[BotEngine] ✅ Typing finished');
            }
          }
          break;
          
        // Keep old actions for backward compatibility
        case 'start_typing':
          {
            const connection = await this.getConnection(userId);
            if (connection) {
              await wahaService.startTyping(connection, contact.phone);
              console.log('[BotEngine] ✅ Typing started');
            }
          }
          break;
          
        case 'stop_typing':
          {
            const connection = await this.getConnection(userId);
            if (connection) {
              await wahaService.stopTyping(connection, contact.phone);
              console.log('[BotEngine] ✅ Typing stopped');
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
                await wahaService.sendReaction(connection, lastMsg.rows[0].wa_message_id, action.reaction);
                console.log('[BotEngine] ✅ Reaction sent:', action.reaction);
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
              console.log('[BotEngine] ✅ Added to group:', action.groupId);
            }
          }
          break;
          
        case 'remove_from_group':
          if (action.groupId) {
            const connection = await this.getConnection(userId);
            if (connection) {
              await wahaService.removeGroupParticipants(connection, action.groupId, [contact.phone]);
              console.log('[BotEngine] ✅ Removed from group:', action.groupId);
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
                console.log('[BotEngine] ✅ Group membership check:', varName, '=', isMember);
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
              console.log('[BotEngine] ✅ Group admin-only set:', action.adminsOnly);
            }
          }
          break;
          
        case 'update_group_subject':
          if (action.groupId && action.groupSubject) {
            const connection = await this.getConnection(userId);
            if (connection) {
              const subject = this.replaceVariables(action.groupSubject, contact, '', '');
              await wahaService.updateGroupSubject(connection, action.groupId, subject);
              console.log('[BotEngine] ✅ Group subject updated');
            }
          }
          break;
          
        case 'update_group_description':
          if (action.groupId && action.groupDescription) {
            const connection = await this.getConnection(userId);
            if (connection) {
              const desc = this.replaceVariables(action.groupDescription, contact, '', '');
              await wahaService.updateGroupDescription(connection, action.groupId, desc);
              console.log('[BotEngine] ✅ Group description updated');
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
              console.log('[BotEngine] ✅ Label set:', action.labelId);
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
    console.log(`[BotEngine] Google Sheets node has ${actions.length} action(s)`);
    
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
        console.log(`[BotEngine] Setting ${varName} (${label}) = ${String(value).substring(0, 50)}`);
      }
    };
    
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const { operation, spreadsheetId, sheetName } = action;
      const varNames = action.varNames || {};
      
      if (!spreadsheetId || !sheetName) {
        console.log('[BotEngine] ⚠️ Google Sheets action missing spreadsheet or sheet name');
        continue;
      }
      
      console.log(`[BotEngine] Executing Google Sheets: ${operation} on "${action.spreadsheetName}/${sheetName}"`);
      
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
            console.log('[BotEngine] ✅ Google Sheets row appended:', result.updatedRange);
            
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
              console.log(`[BotEngine] ⚠️ Invalid row index for update: "${action.rowIndex}" resolved to "${resolvedRowIndex}"`);
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
            console.log('[BotEngine] ✅ Google Sheets row updated:', result.updated, 'cells');
            
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
            console.log(`[BotEngine] 🔍 Google Sheets search: ${result.totalMatches} matches`);
            
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
                  console.log(`[BotEngine] ✅ Mapped "${mapping.column}" → ${mapping.variable} = "${val.substring(0, 100)}"`);
                }
              }
            }
            break;
          }
          
          case 'read_rows': {
            const result = await googleSheets.readRows(userId, spreadsheetId, sheetName);
            console.log(`[BotEngine] 📖 Google Sheets read: ${result.rows.length} rows`);
            
            await saveVar(varNames, 'sheets_total_rows', String(result.rows.length));
            
            if (result.rows.length > 0) {
              const firstRow = result.rows[0];
              
              for (const mapping of (action.resultMappings || [])) {
                if (mapping.column && mapping.variable) {
                  const val = String(firstRow[mapping.column] || '');
                  await this.setContactVariable(contact.id, mapping.variable, val);
                  console.log(`[BotEngine] ✅ Mapped "${mapping.column}" → ${mapping.variable} = "${val.substring(0, 100)}"`);
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
            console.log(`[BotEngine] 🔄 Google Sheets search & update: found=${result.found}, row=${result.rowIndex}`);
            
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
            console.log(`[BotEngine] 🔎 Google Sheets search or append: action=${result.action}`);
            
            await saveVar(varNames, 'sheets_found', result.action === 'updated' ? 'true' : 'false');
            await saveVar(varNames, 'sheets_action', result.action); // 'updated' or 'appended'
            
            if (result.rowIndex) {
              await saveVar(varNames, 'sheets_row_index', String(result.rowIndex));
            }
            break;
          }
          
          default:
            console.log(`[BotEngine] ⚠️ Unknown Google Sheets operation: ${operation}`);
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
    console.log(`[BotEngine] Google Contacts node has ${actions.length} action(s)`);
    
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
        console.log(`[BotEngine] Setting ${varName} (${label}) = ${String(value).substring(0, 50)}`);
      }
    };
    
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const { operation } = action;
      const varNames = action.varNames || {};
      
      console.log(`[BotEngine] Executing Google Contacts: ${operation}`);
      
      try {
        switch (operation) {
          case 'check_exists': {
            const searchValue = await this.replaceAllVariables(action.searchValue || '', contact, '', '', userId);
            const searchBy = action.searchBy || 'phone';
            
            const result = await googleContacts.exists(userId, searchValue, searchBy);
            console.log(`[BotEngine] 🔍 Google Contacts exists check: ${result.exists}`);
            
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
            
            console.log(`[BotEngine] 🔍 Google Contacts search: ${foundContact ? 'found' : 'not found'}`);
            
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
            console.log(`[BotEngine] ➕ Google Contact created: ${newContact.resourceName}`);
            
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
              console.log('[BotEngine] ⚠️ Google Contact not found for update');
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
            console.log(`[BotEngine] ✏️ Google Contact updated: ${updatedContact.resourceName}`);
            
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
            console.log(`[BotEngine] 🔎 Google Contact find or create: ${result.action}`);
            
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
              console.log('[BotEngine] ⚠️ No label specified for add_to_label');
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
              console.log('[BotEngine] ⚠️ Google Contact not found for label operation');
              await saveVar(varNames, 'contact_success', 'false');
              break;
            }
            
            await googleContacts.addToLabel(userId, foundContact.resourceName, labelId);
            console.log(`[BotEngine] 🏷️ Google Contact added to label`);
            
            await saveVar(varNames, 'contact_success', 'true');
            break;
          }
          
          case 'remove_from_label': {
            const searchValue = await this.replaceAllVariables(action.searchValue || '', contact, '', '', userId);
            const searchBy = action.searchBy || 'phone';
            const labelId = action.labelId;
            
            if (!labelId) {
              console.log('[BotEngine] ⚠️ No label specified for remove_from_label');
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
              console.log('[BotEngine] ⚠️ Google Contact not found for label operation');
              await saveVar(varNames, 'contact_success', 'false');
              break;
            }
            
            await googleContacts.removeFromLabel(userId, foundContact.resourceName, labelId);
            console.log(`[BotEngine] 🗑️ Google Contact removed from label`);
            
            await saveVar(varNames, 'contact_success', 'true');
            break;
          }
          
          default:
            console.log(`[BotEngine] ⚠️ Unknown Google Contacts operation: ${operation}`);
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
  async executeIntegrationNode(node, contact, userId) {
    const actions = node.data?.actions || [];
    console.log(`[BotEngine] Integration node has ${actions.length} action(s)`);
    
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const actionType = action.type || 'http_request';
      
      if (actionType === 'http_request') {
        console.log(`[BotEngine] Executing API request ${i + 1}/${actions.length}: ${action.method || 'GET'} ${action.apiUrl}`);
        await this.executeHttpRequest(action, contact);
      } else if (actionType === 'google_sheets') {
        console.log(`[BotEngine] Executing Google Sheets action ${i + 1}/${actions.length}`);
        // Create a virtual node with the nested actions
        const virtualNode = { data: { actions: action.actions || [] } };
        await this.executeGoogleSheetsNode(virtualNode, contact, userId);
      } else if (actionType === 'google_contacts') {
        console.log(`[BotEngine] Executing Google Contacts action ${i + 1}/${actions.length}`);
        // Create a virtual node with the nested actions
        const virtualNode = { data: { actions: action.actions || [] } };
        await this.executeGoogleContactsNode(virtualNode, contact, userId);
      }
    }
  }
  
  // Execute HTTP request action
  async executeHttpRequest(action, contact) {
    if (!action.apiUrl) return;
    
    const axios = require('axios');
    
    try {
      // Build headers
      const headers = {};
      if (action.headers && Array.isArray(action.headers)) {
        for (const h of action.headers) {
          if (h.key) {
            headers[h.key] = this.replaceVariables(h.value || '', contact, '', '');
          }
        }
      }
      if (!headers['Content-Type'] && ['POST', 'PUT', 'PATCH'].includes(action.method)) {
        headers['Content-Type'] = 'application/json';
      }
      
      // Build body with variable replacement
      let body = undefined;
      if (['POST', 'PUT', 'PATCH'].includes(action.method)) {
        // Support both JSON mode and key-value mode
        if (action.bodyMode === 'keyvalue' && action.bodyParams) {
          body = {};
          for (const param of action.bodyParams) {
            if (param.key) {
              body[param.key] = this.replaceVariables(param.value || '', contact, '', '');
            }
          }
        } else if (action.body) {
          try {
            const bodyStr = this.replaceVariables(action.body, contact, '', '');
            body = JSON.parse(bodyStr);
          } catch {
            body = action.body;
          }
        }
      }
      
      const url = this.replaceVariables(action.apiUrl, contact, '', '');
      console.log('[BotEngine] HTTP Request:', action.method, url);
      
      const response = await axios({
        method: action.method || 'GET',
        url,
        headers,
        data: body,
        timeout: 30000
      });
      
      console.log('[BotEngine] ✅ HTTP Response status:', response.status);
      
      // Apply response mappings
      console.log('[BotEngine] Response data:', JSON.stringify(response.data).substring(0, 500));
      console.log('[BotEngine] Mappings to apply:', JSON.stringify(action.mappings));
      
      if (action.mappings && Array.isArray(action.mappings)) {
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
              console.log('[BotEngine] ✅ Mapped', mapping.path, '→', mapping.varName, '=', stringValue.substring(0, 100));
            } else {
              console.log('[BotEngine] ⚠️ No value found for path:', mapping.path);
            }
          }
        }
      } else {
        console.log('[BotEngine] No mappings defined for this API request');
      }
    } catch (error) {
      console.error('[BotEngine] ❌ HTTP Request failed:', error.message);
    }
  }
  
  // Get value from nested path (e.g., "data.user.name")
  getValueFromPath(obj, path) {
    if (!path || !obj) return undefined;
    
    const parts = path.split('.');
    let current = obj;
    
    for (const part of parts) {
      if (current === null || current === undefined) {
        console.log('[BotEngine] Path traversal failed at:', part);
        return undefined;
      }
      current = current[part];
    }
    
    return current;
  }
  
  // Execute send_other node - send to a different phone number or group
  async executeSendOtherNode(node, contact, userId) {
    const recipient = node.data?.recipient || {};
    const actions = node.data?.actions || [];
    
    console.log('[BotEngine] Send Other node - recipient type:', recipient.type, 'actions:', actions.length);
    
    // Get WAHA connection
    const connection = await this.getConnection(userId);
    if (!connection) {
      console.log('[BotEngine] No WAHA connection for user:', userId);
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
      
      console.log('[BotEngine] Target group:', targetChatId);
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
      
      console.log('[BotEngine] Target phone:', targetChatId);
    }
    
    if (!targetChatId) {
      console.log('[BotEngine] ⚠️ No target chat ID specified');
      return;
    }
    
    // Execute each action
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      console.log(`[BotEngine] Executing send_other action ${i + 1}/${actions.length}:`, action.type);
      
      try {
        switch (action.type) {
          case 'text':
            if (action.content) {
              const text = await this.replaceAllVariables(action.content, contact, '', '', userId);
              console.log('[BotEngine] Sending text to', targetChatId.substring(0, 20) + '...');
              
              // Check if custom link preview is configured
              if (action.customLinkPreview && action.linkPreviewUrl) {
                const previewImage = action.linkPreviewImage 
                  ? await this.replaceAllVariables(action.linkPreviewImage, contact, '', '', userId)
                  : null;
                const preview = {
                  url: await this.replaceAllVariables(action.linkPreviewUrl, contact, '', '', userId),
                  title: action.linkPreviewTitle ? await this.replaceAllVariables(action.linkPreviewTitle, contact, '', '', userId) : undefined,
                  description: action.linkPreviewDescription ? await this.replaceAllVariables(action.linkPreviewDescription, contact, '', '', userId) : undefined,
                };
                if (previewImage) {
                  preview.image = { url: previewImage };
                }
                await wahaService.sendLinkPreview(connection, targetChatId, text, preview);
                console.log('[BotEngine] ✅ Text with custom link preview sent to other recipient');
              } else {
                await wahaService.sendMessage(connection, targetChatId, text);
              }
              console.log('[BotEngine] ✅ Text sent to other recipient');
            }
            break;
            
          case 'image':
            if (action.url || action.fileData) {
              const imageUrl = action.fileData || action.url;
              const caption = await this.replaceAllVariables(action.caption || '', contact, '', '', userId);
              await wahaService.sendImage(connection, targetChatId, imageUrl, caption);
              console.log('[BotEngine] ✅ Image sent to other recipient');
            }
            break;
            
          case 'video':
            if (action.url || action.fileData) {
              const videoUrl = action.fileData || action.url;
              const caption = await this.replaceAllVariables(action.caption || '', contact, '', '', userId);
              await wahaService.sendVideo(connection, targetChatId, videoUrl, caption);
              console.log('[BotEngine] ✅ Video sent to other recipient');
            }
            break;
            
          case 'audio':
            if (action.url || action.fileData) {
              const audioUrl = action.fileData || action.url;
              await wahaService.sendVoice(connection, targetChatId, audioUrl);
              console.log('[BotEngine] ✅ Audio sent to other recipient');
            }
            break;
            
          case 'file':
            if (action.url || action.fileData) {
              const fileUrl = action.fileData || action.url;
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
              console.log('[BotEngine] ✅ File sent to other recipient:', filename);
            }
            break;
            
          case 'contact':
            if (action.contactPhone) {
              const contactName = this.replaceVariables(action.contactName || '', contact, '', '');
              const contactPhoneNum = this.replaceVariables(action.contactPhone || '', contact, '', '');
              const contactOrg = action.contactOrg || '';
              await wahaService.sendContactVcard(connection, targetChatId, contactName, contactPhoneNum, contactOrg);
              console.log('[BotEngine] ✅ Contact vCard sent to other recipient');
            }
            break;
          
          case 'location':
            if (action.latitude && action.longitude) {
              const lat = parseFloat(this.replaceVariables(String(action.latitude), contact, '', ''));
              const lng = parseFloat(this.replaceVariables(String(action.longitude), contact, '', ''));
              const title = this.replaceVariables(action.locationTitle || '', contact, '', '');
              await wahaService.sendLocation(connection, targetChatId, lat, lng, title);
              console.log('[BotEngine] ✅ Location sent to other recipient');
            }
            break;
            
          default:
            console.log('[BotEngine] ⚠️ Unknown action type in send_other:', action.type);
        }
      } catch (error) {
        console.error(`[BotEngine] ❌ Send other action ${action.type} failed:`, error.message);
      }
    }
    
    console.log('[BotEngine] ✅ Send Other node completed');
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
      console.log('[BotEngine] Running validations for list buttons...');
      filteredButtons = await validationService.filterListButtons(allButtons, contact, contactVars);
      console.log('[BotEngine] Buttons after validation:', filteredButtons.length, 'of', allButtons.length);
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
    
    console.log('[BotEngine] Sending list message with', listData.buttons.length, 'options');
    
    try {
      await wahaService.sendList(connection, contact.phone, listData);
      // Save list message with metadata for display
      await this.saveOutgoingMessage(userId, contact.id, listData.body, 'list', null, null, {
        title: listData.title,
        buttons: listData.buttons.map(b => ({ title: b.title, description: b.description })),
        buttonText: listData.buttonText,
        footer: listData.footer
      });
      console.log('[BotEngine] ✅ List sent and saved');
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
      console.log('[BotEngine] ✅ List sent as text fallback and saved');
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
      console.log('[BotEngine] No connection for registration');
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
    
    console.log('[BotEngine] Starting registration with', questions.length, 'questions');
    
    // Get contact variables for validation
    const contactVars = await this.getContactVariables(contact.id);
    
    // Filter questions based on validations
    let filteredQuestions = questions;
    if (questions.some(q => q.validation || q.validationId)) {
      console.log('[BotEngine] Running validations for registration questions...');
      filteredQuestions = await validationService.filterQuestions(questions, contact, contactVars);
      console.log('[BotEngine] Questions after validation:', filteredQuestions.length, 'of', questions.length);
    }
    
    if (filteredQuestions.length === 0) {
      console.log('[BotEngine] No questions after validation, skipping registration');
      return;
    }
    
    // Send welcome message if defined
    if (welcomeMessage && welcomeMessage.trim()) {
      const welcomeText = this.replaceVariables(welcomeMessage, contact, triggerMessage, botName);
      const welcomeResult = await wahaService.sendMessage(connection, contact.phone, welcomeText);
      await this.saveOutgoingMessage(userId, contact.id, welcomeText, 'text', null, welcomeResult?.id?.id);
      console.log('[BotEngine] ✅ Welcome message sent and saved');
      // Wait for configured delay before sending first question
      await this.sleep((welcomeDelay || 2) * 1000);
    }
    
    // Send first question
    const firstQuestion = filteredQuestions[0];
    const questionText = this.replaceVariables(firstQuestion.question, contact, triggerMessage, botName);
    const questionResult = await wahaService.sendMessage(connection, contact.phone, questionText);
    await this.saveOutgoingMessage(userId, contact.id, questionText, 'text', null, questionResult?.id?.id);
    console.log('[BotEngine] ✅ First question sent and saved:', questionText.substring(0, 50));
    
    // Calculate timeout in seconds
    const timeoutSeconds = timeout * (timeoutUnit === 'hours' ? 3600 : 60);
    
    // Save session to wait for response (including trigger message for variable replacement)
    if (botId) {
      console.log('[BotEngine] 💾 Saving registration session:', { botId, contactId: contact.id, nodeId: node.id });
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
          triggerMessage: triggerMessage // Save original message for variable replacement
        },
        timeoutSeconds
      );
      console.log('[BotEngine] ✅ Registration session saved successfully!');
    } else {
      console.log('[BotEngine] ⚠️ No botId provided, session NOT saved!');
    }
  }
  
  // Continue registration flow (called from continueSession)
  async continueRegistration(session, flowData, contact, message, userId, bot) {
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
    
    console.log('[BotEngine] Registration continue - question', currentQuestionIndex + 1, 'of', questions.length);
    
    // Check for cancel keyword
    if (message.toLowerCase().trim() === cancelKeyword) {
      console.log('[BotEngine] Registration cancelled by user');
      await this.clearSession(bot.id, contact.id);
      
      // Send cancel message
      const cancelMessage = node.data.cancelMessage || 'הרישום בוטל.';
      const cancelText = this.replaceVariables(cancelMessage, contact, triggerMessage, bot.name);
      const cancelResult = await wahaService.sendMessage(connection, contact.phone, cancelText);
      await this.saveOutgoingMessage(userId, contact.id, cancelText, 'text', null, cancelResult?.id?.id);
      
      // Execute cancel path
      const cancelEdge = flowData.edges.find(e => e.source === nodeId && e.sourceHandle === 'cancel');
      if (cancelEdge) {
        await this.executeNode(cancelEdge.target, flowData, contact, message, userId, bot.id, bot.name);
      }
      return true;
    }
    
    // Validate current answer
    const currentQuestion = questions[currentQuestionIndex];
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
      console.log('[BotEngine] ✅ Next question sent and saved:', questionText.substring(0, 50));
      
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
    console.log('[BotEngine] ✅ Registration completed');
    await this.clearSession(bot.id, contact.id);
    
    // Send completion message
    const completionMessage = node.data.completionMessage || 'תודה! הרישום הושלם בהצלחה.';
    const completionText = this.replaceVariables(completionMessage, contact, triggerMessage, bot.name);
    const completionResult = await wahaService.sendMessage(connection, contact.phone, completionText);
    await this.saveOutgoingMessage(userId, contact.id, completionText, 'text', null, completionResult?.id?.id);
    
    // Send summary if enabled
    if (node.data.sendSummary) {
      await this.sendRegistrationSummary(node.data, contact, answers, connection, bot.name, triggerMessage);
    }
    
    // Send webhook if enabled
    if (node.data.sendWebhook && node.data.webhookUrl) {
      await this.sendRegistrationWebhook(node.data, contact, answers, bot.name, triggerMessage);
    }
    
    // Execute complete path
    const completeEdge = flowData.edges.find(e => e.source === nodeId && e.sourceHandle === 'complete');
    if (completeEdge) {
      await this.executeNode(completeEdge.target, flowData, contact, message, userId, bot.id, bot.name);
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
        console.log('[BotEngine] No summary target configured');
        return;
      }
      
      await wahaService.sendMessage(connection, targetPhone, summaryText);
      console.log('[BotEngine] ✅ Registration summary sent to:', targetPhone);
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
        console.log('[BotEngine] No webhook URL configured');
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
      
      console.log('[BotEngine] ✅ Registration webhook sent to:', webhookUrl);
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
    
    // Basic replacements (system variables)
    let result = text
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
    
    return result;
  }
  
  // Replace variables including user-defined and custom system variables
  async replaceAllVariables(text, contact, message, botName = '', userId = null) {
    if (!text) return '';
    
    // First do basic replacements
    let result = this.replaceVariables(text, contact, message, botName, userId);
    
    // Get contact variables
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
        console.log('[BotEngine] Error fetching contact variables:', e.message);
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
        console.log('[BotEngine] Error fetching system variables:', e.message);
      }
    }
    
    // Remove any remaining unreplaced {{...}} patterns
    const unreplacedMatches = result.match(/\{\{[^}]+\}\}/g);
    if (unreplacedMatches) {
      console.log('[BotEngine] ⚠️ Removing unreplaced variables:', unreplacedMatches);
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
      console.log('[BotEngine] No WhatsApp connection found for user:', userId);
      return null;
    }
    
    const connection = result.rows[0];
    
    // Get decrypted credentials
    let base_url, api_key;
    
    if (connection.connection_type === 'managed') {
      // Use system WAHA credentials
      const creds = getWahaCredentials();
      base_url = creds.baseUrl;
      api_key = creds.apiKey;
    } else {
      // Decrypt external credentials
      base_url = decrypt(connection.external_base_url);
      api_key = decrypt(connection.external_api_key);
    }
    
    console.log('[BotEngine] Found connection:', {
      id: connection.id,
      status: connection.status,
      type: connection.connection_type,
      base_url: base_url ? base_url.substring(0, 30) + '...' : 'N/A',
    });
    
    // Return connection object with decrypted values
    return {
      ...connection,
      base_url,
      api_key,
    };
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
      console.log('[BotEngine] 📝 Logged bot run:', { botId, contactId, status });
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
      console.log('[BotEngine] Error fetching contact variables:', e.message);
      return {};
    }
  }
  
  // Helper: Set contact variable
  async setContactVariable(contactId, key, value, label = null) {
    // Reserved system variable names - never add these to user_variable_definitions
    const RESERVED_VARIABLES = [
      'name', 'contact_phone', 'last_message', 'bot_name', 
      'date', 'time', 'day', 'phone', 'email'
    ];
    
    console.log(`[BotEngine] Setting variable for contact ${contactId}: ${key} = ${String(value).substring(0, 100)}`);
    
    // Save the value to contact
    await db.query(
      `INSERT INTO contact_variables (contact_id, key, value)
       VALUES ($1, $2, $3)
       ON CONFLICT (contact_id, key) DO UPDATE SET value = $3, updated_at = NOW()`,
      [contactId, key, value]
    );
    console.log(`[BotEngine] ✅ Variable saved to contact_variables table`);
    
    // Don't add reserved system variable names to user definitions
    if (RESERVED_VARIABLES.includes(key.toLowerCase())) {
      console.log(`[BotEngine] ⚠️ Skipping user definition for reserved variable: ${key}`);
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
          console.log(`[BotEngine] ✅ New variable definition added for user ${userId}: ${key} (${displayLabel})`);
        } else {
          console.log(`[BotEngine] Variable definition already exists: ${key}`);
        }
      } else {
        console.log(`[BotEngine] ⚠️ Contact ${contactId} not found - cannot add variable definition`);
      }
    } catch (err) {
      // Ignore errors - table might not exist yet
      console.log('[BotEngine] Could not auto-add variable definition:', err.message);
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
