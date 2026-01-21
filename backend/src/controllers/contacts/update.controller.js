const pool = require('../../config/database');

/**
 * Toggle bot status for contact
 */
async function toggleBot(req, res) {
  try {
    const userId = req.user.id;
    const { contactId } = req.params;
    const { is_bot_active } = req.body;
    
    // If enabling bot, clear takeover
    const result = await pool.query(
      `UPDATE contacts 
       SET is_bot_active = $1, 
           takeover_until = ${is_bot_active ? 'NULL' : 'takeover_until'},
           updated_at = NOW() 
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [is_bot_active, contactId, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'איש קשר לא נמצא' });
    }
    
    res.json({ contact: result.rows[0] });
  } catch (error) {
    console.error('Toggle bot error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון' });
  }
}

/**
 * Takeover conversation - disable bot for a specific duration
 */
async function takeoverConversation(req, res) {
  try {
    const userId = req.user.id;
    const { contactId } = req.params;
    const { minutes } = req.body; // 0 = unlimited
    
    let takeoverUntil = null;
    if (minutes && minutes > 0) {
      takeoverUntil = new Date(Date.now() + minutes * 60 * 1000);
    }
    
    const result = await pool.query(
      `UPDATE contacts 
       SET is_bot_active = false, 
           takeover_until = $1,
           updated_at = NOW() 
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [takeoverUntil, contactId, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'איש קשר לא נמצא' });
    }
    
    console.log(`[Takeover] User ${userId} took over contact ${contactId} for ${minutes || 'unlimited'} minutes`);
    
    res.json({ contact: result.rows[0] });
  } catch (error) {
    console.error('Takeover error:', error);
    res.status(500).json({ error: 'שגיאה בהשתלטות' });
  }
}

/**
 * Block/unblock contact
 */
async function toggleBlock(req, res) {
  try {
    const userId = req.user.id;
    const { contactId } = req.params;
    const { is_blocked } = req.body;
    
    const result = await pool.query(
      `UPDATE contacts 
       SET is_blocked = $1, updated_at = NOW() 
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [is_blocked, contactId, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'איש קשר לא נמצא' });
    }
    
    res.json({ contact: result.rows[0] });
  } catch (error) {
    console.error('Toggle block error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון' });
  }
}

/**
 * Delete contact
 */
async function deleteContact(req, res) {
  try {
    const userId = req.user.id;
    const { contactId } = req.params;
    
    const result = await pool.query(
      'DELETE FROM contacts WHERE id = $1 AND user_id = $2 RETURNING id',
      [contactId, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'איש קשר לא נמצא' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete contact error:', error);
    res.status(500).json({ error: 'שגיאה במחיקה' });
  }
}

/**
 * Bulk delete contacts
 */
async function bulkDeleteContacts(req, res) {
  try {
    const userId = req.user.id;
    const { contactIds } = req.body;
    
    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({ error: 'נדרשת רשימת אנשי קשר למחיקה' });
    }
    
    // Delete contacts that belong to this user
    const result = await pool.query(
      `DELETE FROM contacts 
       WHERE id = ANY($1) AND user_id = $2
       RETURNING id`,
      [contactIds, userId]
    );
    
    console.log(`[Contacts] Bulk deleted ${result.rows.length} contacts for user ${userId}`);
    
    res.json({ 
      success: true, 
      deletedCount: result.rows.length 
    });
  } catch (error) {
    console.error('Bulk delete contacts error:', error);
    res.status(500).json({ error: 'שגיאה במחיקה מרובה' });
  }
}

/**
 * Export contacts to CSV
 */
async function exportContacts(req, res) {
  try {
    const userId = req.user.id;
    const { format = 'csv', contactIds } = req.query;
    
    // Build query
    let query = `
      SELECT 
        c.id,
        c.phone,
        c.display_name,
        c.profile_picture_url,
        c.is_bot_active,
        c.is_blocked,
        c.created_at,
        c.last_message_at,
        (SELECT COUNT(*) FROM messages WHERE contact_id = c.id) as message_count
      FROM contacts c
      WHERE c.user_id = $1
    `;
    
    const params = [userId];
    
    // If specific contacts requested
    if (contactIds) {
      const ids = contactIds.split(',');
      query += ` AND c.id = ANY($2)`;
      params.push(ids);
    }
    
    query += ` ORDER BY c.created_at DESC`;
    
    const result = await pool.query(query, params);
    
    // Get variables for each contact
    const contactsWithVars = await Promise.all(result.rows.map(async (contact) => {
      const varsResult = await pool.query(
        'SELECT key, value FROM contact_variables WHERE contact_id = $1',
        [contact.id]
      );
      
      const variables = {};
      varsResult.rows.forEach(v => {
        variables[v.key] = v.value;
      });
      
      return {
        ...contact,
        variables
      };
    }));
    
    if (format === 'csv') {
      // Generate CSV
      const headers = ['מספר טלפון', 'שם תצוגה', 'בוט פעיל', 'חסום', 'תאריך יצירה', 'הודעה אחרונה', 'כמות הודעות', 'אימייל', 'שם מלא', 'עיר', 'חברה'];
      
      let csv = '\uFEFF'; // UTF-8 BOM for Hebrew support
      csv += headers.join(',') + '\n';
      
      contactsWithVars.forEach(contact => {
        const row = [
          contact.phone,
          `"${(contact.display_name || '').replace(/"/g, '""')}"`,
          contact.is_bot_active ? 'כן' : 'לא',
          contact.is_blocked ? 'כן' : 'לא',
          contact.created_at ? new Date(contact.created_at).toLocaleDateString('he-IL') : '',
          contact.last_message_at ? new Date(contact.last_message_at).toLocaleDateString('he-IL') : '',
          contact.message_count || 0,
          `"${(contact.variables?.email || '').replace(/"/g, '""')}"`,
          `"${(contact.variables?.full_name || contact.variables?.first_name || '').replace(/"/g, '""')}"`,
          `"${(contact.variables?.city || '').replace(/"/g, '""')}"`,
          `"${(contact.variables?.company || '').replace(/"/g, '""')}"`,
        ];
        csv += row.join(',') + '\n';
      });
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=contacts_${Date.now()}.csv`);
      res.send(csv);
      
    } else {
      // Return JSON
      res.json({ contacts: contactsWithVars });
    }
    
    console.log(`[Contacts] Exported ${contactsWithVars.length} contacts for user ${userId}`);
    
  } catch (error) {
    console.error('Export contacts error:', error);
    res.status(500).json({ error: 'שגיאה בייצוא אנשי קשר' });
  }
}

module.exports = { toggleBot, toggleBlock, deleteContact, takeoverConversation, bulkDeleteContacts, exportContacts };
