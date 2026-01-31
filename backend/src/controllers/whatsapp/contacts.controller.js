const pool = require('../../config/database');
const wahaService = require('../../services/waha/session.service');

// Ensure the whatsapp_contacts table exists
async function ensureTable() {
  try {
    await pool.query(`
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
    await pool.query(`
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
 * Sync WhatsApp contacts from device to database (internal function)
 */
async function syncContactsForUser(userId) {
  try {
    // Get user's WhatsApp connection
    const connResult = await pool.query(
      `SELECT * FROM whatsapp_connections 
       WHERE user_id = $1 AND status = 'connected' 
       LIMIT 1`,
      [userId]
    );

    if (connResult.rows.length === 0) {
      console.log('[Contacts] No connected WhatsApp session for user:', userId);
      return { synced: 0, total: 0 };
    }

    const connection = connResult.rows[0];
    
    // Fetch contacts from WhatsApp
    console.log('[Contacts] Fetching WhatsApp contacts for user:', userId);
    const waContacts = await wahaService.getWhatsAppContacts(connection);
    
    if (!waContacts || waContacts.length === 0) {
      console.log('[Contacts] No contacts found for user:', userId);
      return { synced: 0, total: 0 };
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
        await pool.query(
          `INSERT INTO whatsapp_contacts (user_id, phone, wa_id, display_name, pushname, synced_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (user_id, phone) 
           DO UPDATE SET display_name = $4, pushname = $5, synced_at = NOW()`,
          [userId, phone, waContact.id, waContact.name || '', waContact.pushname || '']
        );
        
        // Also update the contacts table if this contact exists
        await pool.query(
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
    await pool.query(
      `UPDATE users SET wa_contacts_synced_at = NOW() WHERE id = $1`,
      [userId]
    );

    console.log(`[Contacts] Synced ${synced} contacts for user ${userId}`);
    return { synced, total: waContacts.length };

  } catch (error) {
    console.error('[Contacts] Sync error:', error);
    return { synced: 0, total: 0, error: error.message };
  }
}

/**
 * Check if contacts need to be synced (never synced or older than 30 days)
 */
async function needsSync(userId) {
  try {
    const result = await pool.query(
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
    return false; // Don't sync on error
  }
}

/**
 * Check and sync if needed - called when user loads the app
 */
async function checkAndSync(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if sync is needed
    const shouldSync = await needsSync(userId);
    
    if (!shouldSync) {
      return res.json({ 
        synced: false, 
        message: 'Sync not needed yet' 
      });
    }

    // Run sync in background (don't wait for response)
    syncContactsForUser(userId).then(result => {
      console.log(`[Contacts] Background sync completed for user ${userId}:`, result);
    });

    return res.json({ 
      synced: true, 
      message: 'Sync started in background' 
    });

  } catch (error) {
    console.error('[Contacts] Check and sync error:', error);
    return res.status(500).json({ error: 'Failed to check sync status' });
  }
}

/**
 * Get the display name for a phone number from synced WhatsApp contacts
 */
async function getContactName(userId, phone) {
  try {
    const result = await pool.query(
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
 * Pull WhatsApp contacts and import them to the contacts table
 * Respects the user's contact limit from their subscription
 */
async function pullWhatsAppContacts(req, res) {
  try {
    const userId = req.user.id;
    
    // Get user's contact limit from subscription (with fallback if table doesn't exist)
    let maxContacts = 1000; // Default limit
    try {
      const limitResult = await pool.query(`
        SELECT sp.max_contacts
        FROM users u
        LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'active'
        LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
        WHERE u.id = $1
      `, [userId]);
      maxContacts = limitResult.rows[0]?.max_contacts || 1000;
    } catch (e) {
      console.log('[Contacts] Subscriptions table not found, using default limit');
    }
    
    // Get current contact count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM contacts WHERE user_id = $1`,
      [userId]
    );
    const currentCount = parseInt(countResult.rows[0].count);
    const remaining = maxContacts - currentCount;
    
    if (remaining <= 0) {
      return res.status(400).json({ 
        error: 'הגעת למגבלת אנשי הקשר. שדרג את החבילה שלך להוספת אנשי קשר נוספים.',
        currentCount,
        maxContacts
      });
    }
    
    // Get user's WhatsApp connection
    const connResult = await pool.query(
      `SELECT * FROM whatsapp_connections WHERE user_id = $1 AND status = 'connected' LIMIT 1`,
      [userId]
    );
    
    if (connResult.rows.length === 0) {
      return res.status(400).json({ error: 'אין חיבור וואטסאפ פעיל' });
    }
    
    const connection = connResult.rows[0];
    
    // Fetch contacts from WhatsApp
    console.log(`[Contacts] Pulling WhatsApp contacts for user ${userId}`);
    const waContacts = await wahaService.getWhatsAppContacts(connection);
    
    if (!waContacts || waContacts.length === 0) {
      return res.json({ imported: 0, message: 'לא נמצאו אנשי קשר לייבוא' });
    }
    
    // Filter and import contacts
    let imported = 0;
    const skipped = [];
    
    for (const waContact of waContacts) {
      if (imported >= remaining) {
        break; // Reached limit
      }
      
      // Extract phone and name
      const waId = waContact.id || '';
      const phone = waId.replace(/@.*$/, '');
      const displayName = waContact.name || waContact.pushname || '';
      
      // Skip groups, LIDs, and contacts without valid phone
      if (!phone || waId.includes('lid') || waId.includes('@g.us')) {
        continue;
      }
      
      // Skip if no name
      if (!displayName) {
        continue;
      }
      
      // Check if contact already exists
      const existsResult = await pool.query(
        `SELECT id FROM contacts WHERE user_id = $1 AND phone = $2`,
        [userId, phone]
      );
      
      if (existsResult.rows.length > 0) {
        skipped.push(phone);
        continue;
      }
      
      // Insert new contact
      try {
        await pool.query(
          `INSERT INTO contacts (user_id, phone, wa_id, display_name) VALUES ($1, $2, $3, $4)`,
          [userId, phone, waId, displayName]
        );
        imported++;
      } catch (err) {
        console.error(`[Contacts] Error importing ${phone}:`, err.message);
      }
    }
    
    console.log(`[Contacts] Imported ${imported} contacts for user ${userId}`);
    
    res.json({
      imported,
      skipped: skipped.length,
      remaining: remaining - imported,
      maxContacts,
      message: imported > 0 ? `יובאו ${imported} אנשי קשר` : 'כל אנשי הקשר כבר קיימים במערכת'
    });
    
  } catch (error) {
    console.error('[Contacts] Pull error:', error);
    res.status(500).json({ error: 'שגיאה במשיכת אנשי קשר' });
  }
}

/**
 * Get participants of a WhatsApp group
 */
async function getGroupParticipants(req, res) {
  try {
    const userId = req.user.id;
    const { groupId } = req.params;
    
    if (!groupId) {
      return res.status(400).json({ error: 'חסר מזהה קבוצה' });
    }
    
    // Get user's WhatsApp connection
    const connResult = await pool.query(
      `SELECT * FROM whatsapp_connections WHERE user_id = $1 AND status = 'connected' LIMIT 1`,
      [userId]
    );
    
    if (connResult.rows.length === 0) {
      return res.status(400).json({ error: 'אין חיבור וואטסאפ פעיל' });
    }
    
    const connection = connResult.rows[0];
    
    // Fetch groups to get participants
    console.log(`[Contacts] Fetching participants for group ${groupId}`);
    const groups = await wahaService.getSessionGroups(connection);
    
    // Find the specific group
    const group = groups.find(g => g.JID === groupId || g.JID === `${groupId}@g.us`);
    
    if (!group) {
      return res.status(404).json({ error: 'קבוצה לא נמצאה' });
    }
    
    // Get participants with their details
    const participants = (group.Participants || []).map(p => {
      const phone = p.PhoneNumber?.replace('@s.whatsapp.net', '').replace('@c.us', '') || '';
      const lid = p.LID?.replace('@lid', '') || p.JID?.replace('@lid', '') || '';
      
      return {
        phone,
        lid,
        displayName: p.DisplayName || '',
        isAdmin: p.IsAdmin || false,
        isSuperAdmin: p.IsSuperAdmin || false
      };
    });
    
    // Sort: admins first, then by phone
    participants.sort((a, b) => {
      if (a.isSuperAdmin && !b.isSuperAdmin) return -1;
      if (!a.isSuperAdmin && b.isSuperAdmin) return 1;
      if (a.isAdmin && !b.isAdmin) return -1;
      if (!a.isAdmin && b.isAdmin) return 1;
      return a.phone.localeCompare(b.phone);
    });
    
    // Try to enrich with names from contacts/whatsapp_contacts
    for (const p of participants) {
      if (p.phone && !p.displayName) {
        const name = await getContactName(userId, p.phone);
        if (name) p.displayName = name;
      }
    }
    
    res.json({
      groupId: group.JID,
      groupName: group.Name,
      participantCount: participants.length,
      participants
    });
    
  } catch (error) {
    console.error('[Contacts] Get group participants error:', error);
    res.status(500).json({ error: 'שגיאה במשיכת משתתפי הקבוצה' });
  }
}

/**
 * Import group participants to contacts
 */
async function importGroupParticipants(req, res) {
  try {
    const userId = req.user.id;
    const { groupId } = req.params;
    const { excludeAdmins = false } = req.body;
    
    if (!groupId) {
      return res.status(400).json({ error: 'חסר מזהה קבוצה' });
    }
    
    // Get user's contact limit (with fallback if table doesn't exist)
    let maxContacts = 1000; // Default limit
    try {
      const limitResult = await pool.query(`
        SELECT sp.max_contacts
        FROM users u
        LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'active'
        LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
        WHERE u.id = $1
      `, [userId]);
      maxContacts = limitResult.rows[0]?.max_contacts || 1000;
    } catch (e) {
      console.log('[Contacts] Subscriptions table not found, using default limit');
    }
    
    // Get current contact count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM contacts WHERE user_id = $1`,
      [userId]
    );
    const currentCount = parseInt(countResult.rows[0].count);
    let remaining = maxContacts - currentCount;
    
    if (remaining <= 0) {
      return res.status(400).json({ 
        error: 'הגעת למגבלת אנשי הקשר',
        currentCount,
        maxContacts
      });
    }
    
    // Get group participants
    const connResult = await pool.query(
      `SELECT * FROM whatsapp_connections WHERE user_id = $1 AND status = 'connected' LIMIT 1`,
      [userId]
    );
    
    if (connResult.rows.length === 0) {
      return res.status(400).json({ error: 'אין חיבור וואטסאפ פעיל' });
    }
    
    const connection = connResult.rows[0];
    const groups = await wahaService.getSessionGroups(connection);
    const group = groups.find(g => g.JID === groupId || g.JID === `${groupId}@g.us`);
    
    if (!group) {
      return res.status(404).json({ error: 'קבוצה לא נמצאה' });
    }
    
    let imported = 0;
    const participants = group.Participants || [];
    
    for (const p of participants) {
      if (imported >= remaining) break;
      
      // Skip admins if requested
      if (excludeAdmins && (p.IsAdmin || p.IsSuperAdmin)) {
        continue;
      }
      
      const phone = p.PhoneNumber?.replace('@s.whatsapp.net', '').replace('@c.us', '') || '';
      if (!phone) continue;
      
      // Check if exists
      const exists = await pool.query(
        `SELECT id FROM contacts WHERE user_id = $1 AND phone = $2`,
        [userId, phone]
      );
      
      if (exists.rows.length > 0) continue;
      
      // Get name from LID mapping or contacts
      let displayName = p.DisplayName || '';
      if (!displayName) {
        displayName = await getContactName(userId, phone) || '';
      }
      
      try {
        await pool.query(
          `INSERT INTO contacts (user_id, phone, wa_id, display_name) VALUES ($1, $2, $3, $4)`,
          [userId, phone, `${phone}@c.us`, displayName]
        );
        imported++;
      } catch (err) {
        console.error(`[Contacts] Error importing participant ${phone}:`, err.message);
      }
    }
    
    res.json({
      imported,
      groupName: group.Name,
      message: `יובאו ${imported} אנשי קשר מהקבוצה`
    });
    
  } catch (error) {
    console.error('[Contacts] Import group participants error:', error);
    res.status(500).json({ error: 'שגיאה בייבוא משתתפי הקבוצה' });
  }
}

module.exports = {
  checkAndSync,
  syncContactsForUser,
  getContactName,
  needsSync,
  pullWhatsAppContacts,
  getGroupParticipants,
  importGroupParticipants
};
