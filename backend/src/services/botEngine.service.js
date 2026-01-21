const db = require('../config/database');
const wahaService = require('./waha/session.service');

class BotEngine {
  
  // Process incoming message
  async processMessage(userId, contactPhone, message, messageType = 'text') {
    try {
      // Get all active bots for this user
      const botsResult = await db.query(
        'SELECT * FROM bots WHERE user_id = $1 AND is_active = true',
        [userId]
      );
      
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
      if (!contact.bot_enabled) {
        console.log('[BotEngine] Bot disabled for contact:', contactPhone);
        return;
      }
      
      // Process each active bot
      for (const bot of botsResult.rows) {
        await this.processBot(bot, contact, message, messageType, userId);
      }
      
    } catch (error) {
      console.error('[BotEngine] Error processing message:', error);
    }
  }
  
  // Process single bot
  async processBot(bot, contact, message, messageType, userId) {
    try {
      const flowData = bot.flow_data;
      if (!flowData || !flowData.nodes || flowData.nodes.length === 0) {
        console.log('[BotEngine] Bot has no flow data:', bot.id);
        return;
      }
      
      // Find trigger node
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
      
      console.log('[BotEngine] Trigger matched! Starting flow for bot:', bot.name);
      
      // Log bot run
      await this.logBotRun(bot.id, contact.id, 'triggered');
      
      // Find next node after trigger
      const nextEdge = flowData.edges.find(e => e.source === triggerNode.id);
      if (!nextEdge) {
        console.log('[BotEngine] No edge from trigger');
        return;
      }
      
      // Execute flow starting from next node
      await this.executeNode(nextEdge.target, flowData, contact, message, userId, bot.id);
      
    } catch (error) {
      console.error('[BotEngine] Error processing bot:', error);
      await this.logBotRun(bot.id, contact.id, 'error', error.message);
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
    if (triggerData.hasCooldown && triggerData.cooldownHours) {
      const cooldownMs = triggerData.cooldownHours * 60 * 60 * 1000;
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
  async executeNode(nodeId, flowData, contact, message, userId, botId) {
    const node = flowData.nodes.find(n => n.id === nodeId);
    if (!node) {
      console.log('[BotEngine] Node not found:', nodeId);
      return;
    }
    
    console.log('[BotEngine] Executing node:', node.type, nodeId);
    
    let nextHandleId = null;
    
    switch (node.type) {
      case 'message':
        await this.executeMessageNode(node, contact, message, userId);
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
        await this.executeListNode(node, contact, userId);
        // List nodes wait for response, so we don't continue automatically
        return;
    }
    
    // Find next node
    let nextEdge;
    if (nextHandleId) {
      nextEdge = flowData.edges.find(e => e.source === nodeId && e.sourceHandle === nextHandleId);
    } else {
      nextEdge = flowData.edges.find(e => e.source === nodeId);
    }
    
    if (nextEdge) {
      await this.executeNode(nextEdge.target, flowData, contact, message, userId, botId);
    }
  }
  
  // Execute message node
  async executeMessageNode(node, contact, originalMessage, userId) {
    const actions = node.data.actions || [];
    
    // Get WAHA connection
    const connection = await this.getConnection(userId);
    if (!connection) {
      console.log('[BotEngine] No WAHA connection for user:', userId);
      return;
    }
    
    for (const action of actions) {
      switch (action.type) {
        case 'text':
          const text = this.replaceVariables(action.content, contact, originalMessage);
          await wahaService.sendMessage(connection, contact.phone, text);
          break;
          
        case 'image':
          if (action.url) {
            const caption = this.replaceVariables(action.caption || '', contact, originalMessage);
            await wahaService.sendImage(connection, contact.phone, action.url, caption);
          }
          break;
          
        case 'file':
          if (action.url) {
            await wahaService.sendFile(connection, contact.phone, action.url);
          }
          break;
          
        case 'delay':
          const ms = (action.delay || 1) * (action.unit === 'minutes' ? 60000 : 1000);
          await this.sleep(ms);
          break;
      }
    }
  }
  
  // Execute condition node
  async executeConditionNode(node, contact, message) {
    const { variable, operator, value } = node.data;
    let checkValue = '';
    
    // Get value to check
    switch (variable) {
      case 'message':
      case 'last_message':
        checkValue = message;
        break;
      case 'contact_name':
        checkValue = contact.display_name || '';
        break;
      case 'phone':
        checkValue = contact.phone;
        break;
      case 'is_first_contact':
        checkValue = contact.message_count <= 1 ? 'true' : 'false';
        break;
      default:
        checkValue = '';
    }
    
    // Check condition
    let result = false;
    const lowerCheck = checkValue.toLowerCase();
    const lowerValue = (value || '').toLowerCase();
    
    switch (operator) {
      case 'equals':
        result = lowerCheck === lowerValue;
        break;
      case 'not_equals':
        result = lowerCheck !== lowerValue;
        break;
      case 'contains':
        result = lowerCheck.includes(lowerValue);
        break;
      case 'not_contains':
        result = !lowerCheck.includes(lowerValue);
        break;
      case 'starts_with':
        result = lowerCheck.startsWith(lowerValue);
        break;
      case 'ends_with':
        result = lowerCheck.endsWith(lowerValue);
        break;
      case 'is_empty':
        result = checkValue.trim() === '';
        break;
      case 'is_not_empty':
        result = checkValue.trim() !== '';
        break;
      case 'is_true':
        result = checkValue === 'true';
        break;
      case 'is_false':
        result = checkValue === 'false';
        break;
      default:
        result = false;
    }
    
    console.log('[BotEngine] Condition result:', result, '| variable:', variable, '| value:', checkValue);
    return result ? 'yes' : 'no';
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
          await db.query('UPDATE contacts SET bot_enabled = false WHERE id = $1', [contact.id]);
          break;
          
        case 'enable_bot':
          await db.query('UPDATE contacts SET bot_enabled = true WHERE id = $1', [contact.id]);
          break;
          
        case 'webhook':
          if (action.webhookUrl) {
            await this.sendWebhook(action.webhookUrl, contact);
          }
          break;
      }
    }
  }
  
  // Execute list node
  async executeListNode(node, contact, userId) {
    const connection = await this.getConnection(userId);
    if (!connection) return;
    
    const { title, body, buttonText, buttons, footer } = node.data;
    
    // For now, send as regular message with options
    let text = `*${title}*\n\n${body}`;
    if (buttons && buttons.length > 0) {
      text += '\n\n';
      buttons.forEach((btn, i) => {
        text += `${i + 1}. ${btn.title}${btn.description ? ' - ' + btn.description : ''}\n`;
      });
    }
    if (footer) {
      text += `\n_${footer}_`;
    }
    
    await wahaService.sendMessage(connection, contact.phone, text);
  }
  
  // Helper: Replace variables in text
  replaceVariables(text, contact, message) {
    if (!text) return '';
    
    return text
      .replace(/\{\{name\}\}/gi, contact.display_name || '')
      .replace(/\{\{phone\}\}/gi, contact.phone || '')
      .replace(/\{\{message\}\}/gi, message || '')
      .replace(/\{\{date\}\}/gi, new Date().toLocaleDateString('he-IL'))
      .replace(/\{\{time\}\}/gi, new Date().toLocaleTimeString('he-IL'));
  }
  
  // Helper: Get WAHA connection
  async getConnection(userId) {
    const result = await db.query(
      "SELECT * FROM whatsapp_connections WHERE user_id = $1 AND status = 'connected'",
      [userId]
    );
    return result.rows[0];
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
  
  // Helper: Set contact variable
  async setContactVariable(contactId, key, value) {
    await db.query(
      `INSERT INTO contact_variables (contact_id, key, value)
       VALUES ($1, $2, $3)
       ON CONFLICT (contact_id, key) DO UPDATE SET value = $3, updated_at = NOW()`,
      [contactId, key, value]
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
