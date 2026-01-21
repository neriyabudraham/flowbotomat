const db = require('../config/database');
const wahaService = require('./waha/session.service');
const { decrypt } = require('./crypto/encrypt.service');
const { getWahaCredentials } = require('./settings/system.service');
const validationService = require('./validation.service');
const { checkLimit, incrementBotRuns } = require('../controllers/subscriptions/subscriptions.controller');

class BotEngine {
  
  // Save outgoing message to database
  async saveOutgoingMessage(userId, contactId, content, messageType = 'text', mediaUrl = null, waMessageId = null) {
    try {
      await db.query(`
        INSERT INTO messages 
        (user_id, contact_id, wa_message_id, direction, message_type, content, media_url, status, sent_at)
        VALUES ($1, $2, $3, 'outgoing', $4, $5, $6, 'sent', NOW())
      `, [userId, contactId, waMessageId, messageType, content, mediaUrl]);
    } catch (error) {
      console.error('[BotEngine] Error saving outgoing message:', error.message);
    }
  }
  
  // Process incoming message
  async processMessage(userId, contactPhone, message, messageType = 'text', selectedRowId = null, quotedListTitle = null) {
    console.log('[BotEngine] ========================================');
    console.log('[BotEngine] Processing message from:', contactPhone);
    console.log('[BotEngine] Message:', message);
    console.log('[BotEngine] Message type:', messageType);
    console.log('[BotEngine] Selected row ID:', selectedRowId);
    console.log('[BotEngine] Quoted list title:', quotedListTitle);
    console.log('[BotEngine] User ID:', userId);
    
    try {
      // Get all active bots for this user
      const botsResult = await db.query(
        'SELECT * FROM bots WHERE user_id = $1 AND is_active = true',
        [userId]
      );
      
      console.log('[BotEngine] Active bots found:', botsResult.rows.length);
      
      if (botsResult.rows.length === 0) {
        console.log('[BotEngine] No active bots for user:', userId);
        return;
      }
      
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
      
      // Process each active bot
      for (const bot of botsResult.rows) {
        await this.processBot(bot, contact, message, messageType, userId, selectedRowId, quotedListTitle);
      }
      
    } catch (error) {
      console.error('[BotEngine] Error processing message:', error);
    }
  }
  
  // Process single bot
  async processBot(bot, contact, message, messageType, userId, selectedRowId = null, quotedListTitle = null) {
    try {
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
      
      // Check if trigger matches
      const triggerMatches = await this.checkTrigger(triggerNode.data, message, messageType, contact, bot.id);
      if (!triggerMatches) {
        console.log('[BotEngine] Trigger does not match for bot:', bot.id);
        return;
      }
      
      console.log('[BotEngine] ✅ Trigger matched! Starting flow for bot:', bot.name);
      console.log('[BotEngine] Flow data has', flowData.nodes.length, 'nodes and', flowData.edges.length, 'edges');
      
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
      await this.clearSession(bot.id, contact.id);
      console.log('[BotEngine] Got reply, continuing flow');
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
  async checkTrigger(triggerData, message, messageType, contact, botId) {
    const triggers = triggerData.triggers || [{ type: 'any_message' }];
    
    // Check advanced settings first
    
    // Once per user check
    if (triggerData.oncePerUser) {
      const hasRun = await db.query(
        'SELECT id FROM bot_logs WHERE bot_id = $1 AND contact_id = $2 AND status = $3 LIMIT 1',
        [botId, contact.id, 'triggered']
      );
      if (hasRun.rows.length > 0) {
        console.log('[BotEngine] Already ran for this user (oncePerUser)');
        return false;
      }
    }
    
    // Cooldown check
    if (triggerData.hasCooldown && (triggerData.cooldownValue || triggerData.cooldownHours)) {
      // Support both old (cooldownHours) and new (cooldownValue + cooldownUnit) format
      let cooldownMs;
      if (triggerData.cooldownValue && triggerData.cooldownUnit) {
        const multipliers = { minutes: 60 * 1000, hours: 60 * 60 * 1000, days: 24 * 60 * 60 * 1000, weeks: 7 * 24 * 60 * 60 * 1000 };
        cooldownMs = triggerData.cooldownValue * (multipliers[triggerData.cooldownUnit] || multipliers.days);
      } else {
        cooldownMs = triggerData.cooldownHours * 60 * 60 * 1000; // Backward compatibility
      }
      const lastRun = await db.query(
        'SELECT created_at FROM bot_logs WHERE bot_id = $1 AND contact_id = $2 AND status = $3 ORDER BY created_at DESC LIMIT 1',
        [botId, contact.id, 'triggered']
      );
      if (lastRun.rows.length > 0) {
        const lastRunTime = new Date(lastRun.rows[0].created_at).getTime();
        if (Date.now() - lastRunTime < cooldownMs) {
          console.log('[BotEngine] In cooldown period');
          return false;
        }
      }
    }
    
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
    
    // Excluded tags check
    if (triggerData.hasExcludedTags && triggerData.excludedTags) {
      const excludedList = triggerData.excludedTags.split(',').map(t => t.trim().toLowerCase());
      const contactTags = await db.query(
        `SELECT t.name FROM tags t 
         JOIN contact_tags ct ON t.id = ct.tag_id 
         WHERE ct.contact_id = $1`,
        [contact.id]
      );
      for (const tag of contactTags.rows) {
        if (excludedList.includes(tag.name.toLowerCase())) {
          console.log('[BotEngine] Contact has excluded tag:', tag.name);
          return false;
        }
      }
    }
    
    // Check triggers (OR logic)
    for (const trigger of triggers) {
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
          matches = contact.message_count <= 1;
          break;
        case 'contact_added':
          matches = false; // Triggered separately
          break;
        default:
          matches = false;
      }
      
      // Handle NOT modifier
      if (trigger.not) {
        matches = !matches;
      }
      
      if (matches) return true;
    }
    
    return false;
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
        nextHandleId = await this.executeConditionNode(node, contact, message);
        break;
        
      case 'delay':
        await this.executeDelayNode(node);
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
              const text = this.replaceVariables(action.content, contact, originalMessage, botName);
              console.log('[BotEngine] Sending text:', text.substring(0, 50) + '...');
              const result = await wahaService.sendMessage(connection, contact.phone, text);
              // Save outgoing message to DB
              await this.saveOutgoingMessage(userId, contact.id, text, 'text', null, result?.id?.id);
              console.log('[BotEngine] ✅ Text sent and saved');
            }
            break;
            
          case 'image':
            if (action.url || action.fileData) {
              const imageUrl = action.fileData || action.url;
              const caption = this.replaceVariables(action.caption || '', contact, originalMessage, botName);
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
              const caption = this.replaceVariables(action.caption || '', contact, originalMessage, botName);
              console.log('[BotEngine] Sending video:', videoUrl.substring(0, 50) + '...');
              const result = await wahaService.sendVideo(connection, contact.phone, videoUrl, caption);
              // Save outgoing message to DB
              await this.saveOutgoingMessage(userId, contact.id, caption || '', 'video', videoUrl, result?.id?.id);
              console.log('[BotEngine] ✅ Video sent');
            } else {
              console.log('[BotEngine] ⚠️ Video action has no URL');
            }
            break;
            
          case 'file':
            if (action.url || action.fileData) {
              const fileUrl = action.fileData || action.url;
              console.log('[BotEngine] Sending file:', fileUrl.substring(0, 50) + '...');
              await wahaService.sendFile(connection, contact.phone, fileUrl, action.fileName);
              console.log('[BotEngine] ✅ File sent');
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
    
    // If waitForReply is enabled, save session and return true
    if (waitForReply && botId) {
      await this.saveSession(botId, contact.id, node.id, 'reply', {}, timeout);
      console.log('[BotEngine] ⏳ Waiting for reply...');
      return true;
    }
    
    return false;
  }
  
  // Execute condition node
  async executeConditionNode(node, contact, message) {
    const data = node.data;
    
    // Support new conditionGroup format or old single condition format
    let result;
    if (data.conditionGroup) {
      result = this.evaluateConditionGroup(data.conditionGroup, contact, message);
    } else {
      // Old format - single condition
      result = this.evaluateSingleCondition(data, contact, message);
    }
    
    console.log('[BotEngine] Condition result:', result);
    return result ? 'yes' : 'no';
  }
  
  // Evaluate a group of conditions with AND/OR logic
  evaluateConditionGroup(group, contact, message) {
    const conditions = group.conditions || [];
    const logic = group.logic || 'AND';
    
    if (conditions.length === 0) return true;
    
    const results = conditions.map(cond => {
      if (cond.isGroup) {
        return this.evaluateConditionGroup(cond, contact, message);
      } else {
        return this.evaluateSingleCondition(cond, contact, message);
      }
    });
    
    if (logic === 'AND') {
      return results.every(r => r === true);
    } else {
      return results.some(r => r === true);
    }
  }
  
  // Evaluate a single condition
  evaluateSingleCondition(condition, contact, message) {
    const { variable, operator, value, varName } = condition;
    let checkValue = '';
    
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
        checkValue = (contact.message_count || 0) <= 1 ? 'true' : 'false';
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
        // TODO: check if contact has tag
        checkValue = 'false';
        break;
      case 'contact_var':
        // TODO: get contact variable
        checkValue = '';
        break;
      default:
        checkValue = '';
    }
    
    // Check condition
    const lowerCheck = (checkValue || '').toLowerCase();
    const lowerValue = (value || '').toLowerCase();
    
    switch (operator) {
      case 'equals':
        return lowerCheck === lowerValue;
      case 'not_equals':
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
        return parseFloat(checkValue) > parseFloat(value);
      case 'less_than':
        return parseFloat(checkValue) < parseFloat(value);
      case 'is_empty':
        return (checkValue || '').trim() === '';
      case 'is_not_empty':
        return (checkValue || '').trim() !== '';
      case 'is_true':
        return checkValue === 'true' || checkValue === true;
      case 'is_false':
        return checkValue === 'false' || checkValue === false || checkValue === '';
      case 'matches_regex':
        try {
          return new RegExp(value, 'i').test(checkValue);
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
  async executeDelayNode(node) {
    const { delay, unit } = node.data;
    const ms = (delay || 1) * (unit === 'minutes' ? 60000 : unit === 'hours' ? 3600000 : 1000);
    console.log('[BotEngine] Delay:', ms, 'ms');
    await this.sleep(ms);
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
          
        case 'stop_bot':
          await db.query('UPDATE contacts SET is_bot_active = false WHERE id = $1', [contact.id]);
          break;
          
        case 'enable_bot':
          await db.query('UPDATE contacts SET is_bot_active = true, takeover_until = NULL WHERE id = $1', [contact.id]);
          break;
          
        case 'webhook':
          if (action.webhookUrl) {
            await this.sendWebhook(action.webhookUrl, contact);
          }
          break;
          
        case 'http_request':
          await this.executeHttpRequest(action, contact);
          break;
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
      if (action.mappings && Array.isArray(action.mappings)) {
        for (const mapping of action.mappings) {
          if (mapping.path && mapping.varName) {
            const value = this.getValueFromPath(response.data, mapping.path);
            if (value !== undefined) {
              await this.setContactVariable(contact.id, mapping.varName, String(value));
              console.log('[BotEngine] Mapped', mapping.path, '→', mapping.varName, '=', value);
            }
          }
        }
      }
    } catch (error) {
      console.error('[BotEngine] ❌ HTTP Request failed:', error.message);
    }
  }
  
  // Get value from nested path (e.g., "data.user.name")
  getValueFromPath(obj, path) {
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = current[part];
    }
    return current;
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
      console.log('[BotEngine] ✅ List sent');
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
      console.log('[BotEngine] ✅ List sent as text fallback');
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
      await wahaService.sendMessage(connection, contact.phone, welcomeText);
      console.log('[BotEngine] ✅ Welcome message sent');
      // Wait for configured delay before sending first question
      await this.sleep((welcomeDelay || 2) * 1000);
    }
    
    // Send first question
    const firstQuestion = filteredQuestions[0];
    const questionText = this.replaceVariables(firstQuestion.question, contact, triggerMessage, botName);
    await wahaService.sendMessage(connection, contact.phone, questionText);
    console.log('[BotEngine] ✅ First question sent:', questionText.substring(0, 50));
    
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
      await wahaService.sendMessage(connection, contact.phone, 
        this.replaceVariables(cancelMessage, contact, triggerMessage, bot.name)
      );
      
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
      await wahaService.sendMessage(connection, contact.phone, errorMessage);
      
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
      await wahaService.sendMessage(connection, contact.phone, questionText);
      console.log('[BotEngine] ✅ Next question sent:', questionText.substring(0, 50));
      
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
    await wahaService.sendMessage(connection, contact.phone, 
      this.replaceVariables(completionMessage, contact, triggerMessage, bot.name)
    );
    
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
    
    // Basic replacements
    let result = text
      .replace(/\{\{name\}\}/gi, contact.display_name || '')
      .replace(/\{\{contact_phone\}\}/gi, contact.phone || '')
      .replace(/\{\{message\}\}/gi, message || '')
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
    await db.query(
      `INSERT INTO bot_logs (bot_id, contact_id, trigger_type, status, error_message)
       VALUES ($1, $2, $3, $4, $5)`,
      [botId, contactId, 'message', status, errorMessage]
    );
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
  async setContactVariable(contactId, key, value) {
    // Save the value to contact
    await db.query(
      `INSERT INTO contact_variables (contact_id, key, value)
       VALUES ($1, $2, $3)
       ON CONFLICT (contact_id, key) DO UPDATE SET value = $3, updated_at = NOW()`,
      [contactId, key, value]
    );
    
    // Auto-add variable to user's variable definitions (if not exists)
    try {
      // Get user_id from contact
      const contactRes = await db.query('SELECT user_id FROM contacts WHERE id = $1', [contactId]);
      if (contactRes.rows[0]) {
        const userId = contactRes.rows[0].user_id;
        await db.query(
          `INSERT INTO user_variable_definitions (user_id, name, label, var_type)
           VALUES ($1, $2, $2, 'text')
           ON CONFLICT (user_id, name) DO NOTHING`,
          [userId, key]
        );
      }
    } catch (err) {
      // Ignore errors - table might not exist yet
      console.log('[BotEngine] Could not auto-add variable definition:', err.message);
    }
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
