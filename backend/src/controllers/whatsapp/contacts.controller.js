const db = require('../../db');
const wahaService = require('../../services/waha/session.service');

// Ensure the whatsapp_contacts table exists
async function ensureTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_contacts (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        phone VARCHAR(50) NOT NULL,
        wa_id VARCHAR(100),
        display_name VARCHAR(255),
        pushname VARCHAR(255),
        synced_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, phone)
      )
    `);
    
    // Add wa_contacts_synced_at column to users if it doesn't exist
    await db.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS wa_contacts_synced_at TIMESTAMP
    `);
  } catch (err) {
    // Table might already exist, ignore errors
    console.log('[Contacts] Table check:', err.message);
  }
}

// Run once on startup
ensureTable();

/**
 * Sync WhatsApp contacts from device to database
 * This fetches contacts from WhatsApp and stores them for name lookups
 */
async function syncContacts(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get user's WhatsApp connection
    const connResult = await db.query(
      `SELECT * FROM whatsapp_connections 
       WHERE user_id = $1 AND status = 'connected' 
       LIMIT 1`,
      [userId]
    );

    if (connResult.rows.length === 0) {
      return res.status(400).json({ error: 'No connected WhatsApp session' });
    }

    const connection = connResult.rows[0];
    
    // Fetch contacts from WhatsApp
    console.log('[Contacts] Fetching WhatsApp contacts for user:', userId);
    const waContacts = await wahaService.getWhatsAppContacts(connection);
    
    if (!waContacts || waContacts.length === 0) {
      return res.json({ 
        success: true, 
        message: 'No contacts found',
        synced: 0 
      });
    }

    console.log(`[Contacts] Received ${waContacts.length} contacts from WhatsApp`);

    // Upsert contacts to database
    let synced = 0;
    for (const waContact of waContacts) {
      try {
        // Extract phone number from id (e.g., "972584254229@c.us" -> "972584254229")
        const phone = waContact.id?.replace(/@.*$/, '');
        if (!phone || phone.includes('lid')) continue; // Skip LID contacts for now
        
        // Get the name (prefer saved name, then pushname)
        const displayName = waContact.name || waContact.pushname || '';
        
        if (!displayName) continue; // Skip contacts without names

        // Upsert to whatsapp_contacts table
        await db.query(
          `INSERT INTO whatsapp_contacts (user_id, phone, wa_id, display_name, pushname, synced_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (user_id, phone) 
           DO UPDATE SET display_name = $4, pushname = $5, synced_at = NOW()`,
          [userId, phone, waContact.id, waContact.name || '', waContact.pushname || '']
        );
        
        // Also update the contacts table if this contact exists
        await db.query(
          `UPDATE contacts 
           SET display_name = COALESCE(NULLIF($2, ''), display_name)
           WHERE user_id = $1 AND phone = $3 AND (display_name IS NULL OR display_name = phone)`,
          [userId, displayName, phone]
        );
        
        synced++;
      } catch (err) {
        console.error('[Contacts] Error syncing contact:', err.message);
      }
    }

    // Update last sync timestamp for user
    await db.query(
      `UPDATE users SET wa_contacts_synced_at = NOW() WHERE id = $1`,
      [userId]
    );

    console.log(`[Contacts] Synced ${synced} contacts for user ${userId}`);

    return res.json({
      success: true,
      message: `סונכרנו ${synced} אנשי קשר`,
      synced,
      total: waContacts.length
    });

  } catch (error) {
    console.error('[Contacts] Sync error:', error);
    return res.status(500).json({ 
      error: 'Failed to sync contacts',
      details: error.message 
    });
  }
}

/**
 * Get the display name for a phone number from synced WhatsApp contacts
 */
async function getContactName(userId, phone) {
  try {
    const result = await db.query(
      `SELECT display_name, pushname FROM whatsapp_contacts 
       WHERE user_id = $1 AND phone = $2`,
      [userId, phone]
    );
    
    if (result.rows.length > 0) {
      return result.rows[0].display_name || result.rows[0].pushname || null;
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Check if contacts need to be synced (older than 30 days)
 */
async function needsSync(userId) {
  try {
    const result = await db.query(
      `SELECT wa_contacts_synced_at FROM users WHERE id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0 || !result.rows[0].wa_contacts_synced_at) {
      return true; // Never synced
    }
    
    const lastSync = new Date(result.rows[0].wa_contacts_synced_at);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    return lastSync < thirtyDaysAgo;
  } catch (error) {
    return true;
  }
}

/**
 * Get sync status
 */
async function getSyncStatus(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await db.query(
      `SELECT wa_contacts_synced_at FROM users WHERE id = $1`,
      [userId]
    );

    const countResult = await db.query(
      `SELECT COUNT(*) as count FROM whatsapp_contacts WHERE user_id = $1`,
      [userId]
    );

    return res.json({
      lastSynced: result.rows[0]?.wa_contacts_synced_at || null,
      contactCount: parseInt(countResult.rows[0]?.count || 0),
      needsSync: await needsSync(userId)
    });

  } catch (error) {
    console.error('[Contacts] Status error:', error);
    return res.status(500).json({ error: 'Failed to get sync status' });
  }
}

module.exports = {
  syncContacts,
  getSyncStatus,
  getContactName,
  needsSync
};
