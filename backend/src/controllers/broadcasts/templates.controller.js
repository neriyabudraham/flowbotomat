const pool = require('../../config/database');

/**
 * Get all templates for user
 */
async function getTemplates(req, res) {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(`
      SELECT 
        t.*,
        (SELECT COUNT(*) FROM broadcast_template_messages WHERE template_id = t.id) as messages_count
      FROM broadcast_templates t
      WHERE t.user_id = $1
      ORDER BY t.created_at DESC
    `, [userId]);
    
    res.json({ templates: result.rows });
  } catch (error) {
    console.error('[Broadcasts] Get templates error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת תבניות' });
  }
}

/**
 * Get single template with messages
 */
async function getTemplate(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const templateResult = await pool.query(
      'SELECT * FROM broadcast_templates WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'תבנית לא נמצאה' });
    }
    
    const template = templateResult.rows[0];
    
    // Get messages
    const messagesResult = await pool.query(`
      SELECT * FROM broadcast_template_messages 
      WHERE template_id = $1 
      ORDER BY message_order ASC
    `, [id]);
    
    template.messages = messagesResult.rows;
    
    res.json({ template });
  } catch (error) {
    console.error('[Broadcasts] Get template error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת תבנית' });
  }
}

/**
 * Create new template
 */
async function createTemplate(req, res) {
  try {
    const userId = req.user.id;
    const { name, description, messages } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'שם התבנית נדרש' });
    }
    
    // Start transaction
    const client = await pool.pool.connect();
    try {
      await client.query('BEGIN');
      
      // Create template
      const templateResult = await client.query(`
        INSERT INTO broadcast_templates (user_id, name, description)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [userId, name, description]);
      
      const template = templateResult.rows[0];
      
      // Add messages if provided
      if (messages && messages.length > 0) {
        for (let i = 0; i < messages.length; i++) {
          const msg = messages[i];
          await client.query(`
            INSERT INTO broadcast_template_messages 
            (template_id, message_order, message_type, content, media_url, media_caption, buttons, delay_seconds)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `, [
            template.id,
            i + 1,
            msg.message_type || 'text',
            msg.content,
            msg.media_url,
            msg.media_caption,
            msg.buttons ? JSON.stringify(msg.buttons) : null,
            msg.delay_seconds || 0
          ]);
        }
      }
      
      await client.query('COMMIT');
      
      // Get template with messages
      const messagesResult = await pool.query(
        'SELECT * FROM broadcast_template_messages WHERE template_id = $1 ORDER BY message_order',
        [template.id]
      );
      template.messages = messagesResult.rows;
      
      res.status(201).json({ template });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[Broadcasts] Create template error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת תבנית' });
  }
}

/**
 * Update template
 */
async function updateTemplate(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, description, messages } = req.body;
    
    // Verify template belongs to user
    const checkResult = await pool.query(
      'SELECT * FROM broadcast_templates WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'תבנית לא נמצאה' });
    }
    
    // Start transaction
    const client = await pool.pool.connect();
    try {
      await client.query('BEGIN');
      
      // Update template
      const result = await client.query(`
        UPDATE broadcast_templates 
        SET name = COALESCE($1, name),
            description = COALESCE($2, description),
            updated_at = NOW()
        WHERE id = $3 AND user_id = $4
        RETURNING *
      `, [name, description, id, userId]);
      
      const template = result.rows[0];
      
      // If messages are provided, replace all messages
      if (messages && Array.isArray(messages)) {
        // Delete existing messages
        await client.query('DELETE FROM broadcast_template_messages WHERE template_id = $1', [id]);
        
        // Add new messages
        for (let i = 0; i < messages.length; i++) {
          const msg = messages[i];
          await client.query(`
            INSERT INTO broadcast_template_messages 
            (template_id, message_order, message_type, content, media_url, media_caption, buttons, delay_seconds)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `, [
            id,
            i + 1,
            msg.message_type || 'text',
            msg.content || '',
            msg.media_url || null,
            msg.media_caption || null,
            msg.buttons ? JSON.stringify(msg.buttons) : null,
            msg.delay_seconds || 0
          ]);
        }
      }
      
      await client.query('COMMIT');
      
      // Get template with messages
      const messagesResult = await pool.query(
        'SELECT * FROM broadcast_template_messages WHERE template_id = $1 ORDER BY message_order',
        [id]
      );
      template.messages = messagesResult.rows;
      
      res.json({ template });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[Broadcasts] Update template error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון תבנית' });
  }
}

/**
 * Delete template
 */
async function deleteTemplate(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM broadcast_templates WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'תבנית לא נמצאה' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Broadcasts] Delete template error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת תבנית' });
  }
}

/**
 * Add message to template
 */
async function addMessage(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { message_type, content, media_url, media_caption, buttons, delay_seconds } = req.body;
    
    // Verify template belongs to user
    const templateResult = await pool.query(
      'SELECT * FROM broadcast_templates WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'תבנית לא נמצאה' });
    }
    
    // Get next order number
    const orderResult = await pool.query(
      'SELECT COALESCE(MAX(message_order), 0) + 1 as next_order FROM broadcast_template_messages WHERE template_id = $1',
      [id]
    );
    const nextOrder = orderResult.rows[0].next_order;
    
    const result = await pool.query(`
      INSERT INTO broadcast_template_messages 
      (template_id, message_order, message_type, content, media_url, media_caption, buttons, delay_seconds)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [id, nextOrder, message_type || 'text', content, media_url, media_caption, buttons, delay_seconds || 0]);
    
    res.status(201).json({ message: result.rows[0] });
  } catch (error) {
    console.error('[Broadcasts] Add message error:', error);
    res.status(500).json({ error: 'שגיאה בהוספת הודעה' });
  }
}

/**
 * Update message in template
 */
async function updateMessage(req, res) {
  try {
    const userId = req.user.id;
    const { templateId, messageId } = req.params;
    const { message_type, content, media_url, media_caption, buttons, delay_seconds } = req.body;
    
    // Verify template belongs to user
    const templateResult = await pool.query(
      'SELECT * FROM broadcast_templates WHERE id = $1 AND user_id = $2',
      [templateId, userId]
    );
    
    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'תבנית לא נמצאה' });
    }
    
    const result = await pool.query(`
      UPDATE broadcast_template_messages 
      SET message_type = COALESCE($1, message_type),
          content = COALESCE($2, content),
          media_url = $3,
          media_caption = $4,
          buttons = $5,
          delay_seconds = COALESCE($6, delay_seconds)
      WHERE id = $7 AND template_id = $8
      RETURNING *
    `, [message_type, content, media_url, media_caption, buttons, delay_seconds, messageId, templateId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'הודעה לא נמצאה' });
    }
    
    res.json({ message: result.rows[0] });
  } catch (error) {
    console.error('[Broadcasts] Update message error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון הודעה' });
  }
}

/**
 * Delete message from template
 */
async function deleteMessage(req, res) {
  try {
    const userId = req.user.id;
    const { templateId, messageId } = req.params;
    
    // Verify template belongs to user
    const templateResult = await pool.query(
      'SELECT * FROM broadcast_templates WHERE id = $1 AND user_id = $2',
      [templateId, userId]
    );
    
    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'תבנית לא נמצאה' });
    }
    
    const result = await pool.query(
      'DELETE FROM broadcast_template_messages WHERE id = $1 AND template_id = $2 RETURNING message_order',
      [messageId, templateId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'הודעה לא נמצאה' });
    }
    
    // Reorder remaining messages
    await pool.query(`
      UPDATE broadcast_template_messages 
      SET message_order = message_order - 1 
      WHERE template_id = $1 AND message_order > $2
    `, [templateId, result.rows[0].message_order]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Broadcasts] Delete message error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת הודעה' });
  }
}

/**
 * Reorder messages in template
 */
async function reorderMessages(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { message_ids } = req.body; // Array of message IDs in new order
    
    if (!message_ids || !Array.isArray(message_ids)) {
      return res.status(400).json({ error: 'נדרשת רשימת מזהי הודעות' });
    }
    
    // Verify template belongs to user
    const templateResult = await pool.query(
      'SELECT * FROM broadcast_templates WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'תבנית לא נמצאה' });
    }
    
    // Update order for each message
    const client = await pool.pool.connect();
    try {
      await client.query('BEGIN');
      
      for (let i = 0; i < message_ids.length; i++) {
        await client.query(
          'UPDATE broadcast_template_messages SET message_order = $1 WHERE id = $2 AND template_id = $3',
          [i + 1, message_ids[i], id]
        );
      }
      
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Broadcasts] Reorder messages error:', error);
    res.status(500).json({ error: 'שגיאה בסידור הודעות' });
  }
}

module.exports = {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  addMessage,
  updateMessage,
  deleteMessage,
  reorderMessages
};
