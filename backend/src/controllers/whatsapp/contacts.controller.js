const pool = require('../../config/database');
const wahaService = require('../../services/waha/session.service');
const { decrypt } = require('../../services/crypto/encrypt.service');
const { getWahaCredentials } = require('../../services/settings/system.service');

/**
 * Helper to prepare WAHA connection object from database row
 */
async function prepareConnection(dbConnection) {
  let baseUrl, apiKey;
  
  if (dbConnection.connection_type === 'external') {
    baseUrl = decrypt(dbConnection.external_base_url);
    apiKey = decrypt(dbConnection.external_api_key);
  } else {
    const systemCreds = await getWahaCredentials();
    baseUrl = systemCreds.baseUrl;
    apiKey = systemCreds.apiKey;
  }
  
  return {
    base_url: baseUrl,
    api_key: apiKey,
    session_name: dbConnection.session_name
  };
}

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
    const waContacts = await wahaService.getWhatsAppContacts(connection);
    
    if (!waContacts || waContacts.length === 0) {
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
 * Get the display name for a phone number from contacts or whatsapp_contacts
 */
async function getContactName(userId, phone) {
  try {
    // First try main contacts table
    const contactResult = await pool.query(
      `SELECT display_name FROM contacts 
       WHERE user_id = $1 AND (phone = $2 OR phone LIKE $3)`,
      [userId, phone, `%${phone}%`]
    );
    
    if (contactResult.rows.length > 0 && contactResult.rows[0].display_name) {
      return contactResult.rows[0].display_name;
    }
    
    // Then try whatsapp_contacts table
    const waResult = await pool.query(
      `SELECT display_name, pushname FROM whatsapp_contacts 
       WHERE user_id = $1 AND phone = $2`,
      [userId, phone]
    );
    
    if (waResult.rows.length > 0) {
      return waResult.rows[0].display_name || waResult.rows[0].pushname || null;
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
    
    // Get user's contact limit from feature overrides and subscription
    let maxContacts = 1000; // Default limit
    try {
      // First check user's feature_overrides (takes precedence)
      const userResult = await pool.query(
        'SELECT feature_overrides FROM users WHERE id = $1',
        [userId]
      );
      const featureOverrides = userResult.rows[0]?.feature_overrides;
      
      console.log(`[Contacts] User ${userId} feature_overrides:`, JSON.stringify(featureOverrides));
      
      if (featureOverrides?.max_contacts !== null && featureOverrides?.max_contacts !== undefined) {
        if (featureOverrides.max_contacts === -1) {
          maxContacts = Infinity;
          console.log(`[Contacts] User ${userId} has unlimited contacts via feature_overrides`);
        } else {
          maxContacts = featureOverrides.max_contacts;
        }
      } else {
        // Check subscription plan
        const subResult = await pool.query(`
          SELECT sp.max_contacts
          FROM user_subscriptions us
          JOIN subscription_plans sp ON us.plan_id = sp.id
          WHERE us.user_id = $1 
            AND (us.status IN ('active', 'trial') 
                 OR (us.status = 'cancelled' AND (us.expires_at > NOW() OR us.next_charge_date > NOW())))
          ORDER BY us.started_at DESC
          LIMIT 1
        `, [userId]);
        
        const planMaxContacts = subResult.rows[0]?.max_contacts;
        if (planMaxContacts === -1) {
          maxContacts = Infinity;
        } else if (planMaxContacts) {
          maxContacts = planMaxContacts;
        }
      }
      console.log(`[Contacts] User ${userId} contact limit: ${maxContacts === Infinity ? 'unlimited' : maxContacts}`);
    } catch (e) {
      console.log('[Contacts] Error getting contact limit:', e.message);
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
    
    const dbConnection = connResult.rows[0];
    const connection = await prepareConnection(dbConnection);
    
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
    
    const dbConnection = connResult.rows[0];
    const connection = await prepareConnection(dbConnection);
    
    // Fetch groups to get participants
    console.log(`[Contacts] Fetching participants for group ${groupId}`);
    const groups = await wahaService.getSessionGroups(connection);
    
    // Find the specific group
    const group = groups.find(g => g.JID === groupId || g.JID === `${groupId}@g.us`);
    
    if (!group) {
      return res.status(404).json({ error: 'קבוצה לא נמצאה' });
    }
    
    // Also fetch WhatsApp contacts to get names
    let waContactNames = {};
    try {
      const waContacts = await wahaService.getWhatsAppContacts(connection);
      for (const c of waContacts || []) {
        const phone = c.id?.replace(/@.*$/, '') || '';
        if (phone && (c.name || c.pushname)) {
          waContactNames[phone] = c.name || c.pushname;
        }
      }
      console.log(`[Contacts] Got ${Object.keys(waContactNames).length} contact names from WhatsApp`);
    } catch (e) {
      console.log('[Contacts] Could not fetch WhatsApp contacts for names:', e.message);
    }
    
    // Get existing contacts from database to check which already exist
    const existingResult = await pool.query(
      `SELECT id, phone, display_name FROM contacts WHERE user_id = $1`,
      [userId]
    );
    const existingContacts = {};
    for (const row of existingResult.rows) {
      const phone = row.phone?.replace(/@.*$/, '');
      if (phone) {
        existingContacts[phone] = { id: row.id, name: row.display_name };
      }
    }
    
    // Get participants with their details
    const participants = (group.Participants || []).map(p => {
      const phone = p.PhoneNumber?.replace('@s.whatsapp.net', '').replace('@c.us', '') || '';
      const lid = p.LID?.replace('@lid', '') || p.JID?.replace('@lid', '') || '';
      
      // Check if exists in DB
      const existing = existingContacts[phone];
      
      // Get name: 1) WAHA DisplayName, 2) WhatsApp contacts, 3) DB name
      let displayName = p.DisplayName || '';
      if (!displayName && phone) {
        displayName = waContactNames[phone] || existing?.name || '';
      }
      
      return {
        phone,
        lid,
        displayName,
        isAdmin: p.IsAdmin || false,
        isSuperAdmin: p.IsSuperAdmin || false,
        exists: !!existing,
        contactId: existing?.id || null
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
 * Now accepts selectedPhones array and returns contact IDs for audience
 */
async function importGroupParticipants(req, res) {
  try {
    const userId = req.user.id;
    const { groupId } = req.params;
    const { selectedPhones = [], participantNames = {} } = req.body;
    
    if (!groupId) {
      return res.status(400).json({ error: 'חסר מזהה קבוצה' });
    }
    
    if (!selectedPhones || selectedPhones.length === 0) {
      return res.status(400).json({ error: 'לא נבחרו אנשי קשר לייבוא' });
    }
    
    // Get user's contact limit from feature overrides and subscription
    let maxContacts = 1000; // Default limit
    try {
      // First check user's feature_overrides (takes precedence)
      const userResult = await pool.query(
        'SELECT feature_overrides FROM users WHERE id = $1',
        [userId]
      );
      const featureOverrides = userResult.rows[0]?.feature_overrides;
      
      console.log(`[Contacts] User ${userId} feature_overrides:`, JSON.stringify(featureOverrides));
      
      if (featureOverrides?.max_contacts !== null && featureOverrides?.max_contacts !== undefined) {
        if (featureOverrides.max_contacts === -1) {
          maxContacts = Infinity;
          console.log(`[Contacts] User ${userId} has unlimited contacts via feature_overrides`);
        } else {
          maxContacts = featureOverrides.max_contacts;
        }
      } else {
        // Check subscription plan
        const subResult = await pool.query(`
          SELECT sp.max_contacts
          FROM user_subscriptions us
          JOIN subscription_plans sp ON us.plan_id = sp.id
          WHERE us.user_id = $1 
            AND (us.status IN ('active', 'trial') 
                 OR (us.status = 'cancelled' AND (us.expires_at > NOW() OR us.next_charge_date > NOW())))
          ORDER BY us.started_at DESC
          LIMIT 1
        `, [userId]);
        
        const planMaxContacts = subResult.rows[0]?.max_contacts;
        if (planMaxContacts === -1) {
          maxContacts = Infinity;
        } else if (planMaxContacts) {
          maxContacts = planMaxContacts;
        }
      }
      console.log(`[Contacts] User ${userId} contact limit: ${maxContacts === Infinity ? 'unlimited' : maxContacts}`);
    } catch (e) {
      console.log('[Contacts] Error getting contact limit:', e.message);
    }
    
    // Get current contact count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM contacts WHERE user_id = $1`,
      [userId]
    );
    const currentCount = parseInt(countResult.rows[0].count);
    let remaining = maxContacts - currentCount;
    
    // Get existing contacts to find their IDs
    const existingResult = await pool.query(
      `SELECT id, phone FROM contacts WHERE user_id = $1`,
      [userId]
    );
    const existingContacts = {};
    for (const row of existingResult.rows) {
      const phone = row.phone?.replace(/@.*$/, '');
      if (phone) existingContacts[phone] = row.id;
    }
    
    let imported = 0;
    const contactIds = []; // IDs of all selected contacts (existing + new)
    
    for (const phone of selectedPhones) {
      if (!phone) continue;
      
      // Check if already exists
      if (existingContacts[phone]) {
        contactIds.push(existingContacts[phone]);
        continue;
      }
      
      // Check limit
      if (remaining <= 0) {
        console.log('[Contacts] Reached contact limit');
        break;
      }
      
      // Get name from participantNames map
      const displayName = participantNames[phone] || '';
      
      // Insert new contact
      try {
        const insertResult = await pool.query(
          `INSERT INTO contacts (user_id, phone, wa_id, display_name) 
           VALUES ($1, $2, $3, $4) 
           RETURNING id`,
          [userId, phone, `${phone}@c.us`, displayName]
        );
        
        if (insertResult.rows[0]) {
          contactIds.push(insertResult.rows[0].id);
          imported++;
          remaining--;
        }
      } catch (err) {
        console.error(`[Contacts] Error importing ${phone}:`, err.message);
        // If duplicate, try to get existing ID
        const existCheck = await pool.query(
          `SELECT id FROM contacts WHERE user_id = $1 AND phone = $2`,
          [userId, phone]
        );
        if (existCheck.rows[0]) {
          contactIds.push(existCheck.rows[0].id);
        }
      }
    }
    
    console.log(`[Contacts] Imported ${imported} new contacts, total ${contactIds.length} for audience`);
    
    res.json({
      imported,
      contactIds, // Return all contact IDs (existing + new) for audience selection
      message: imported > 0 ? `יובאו ${imported} אנשי קשר חדשים` : 'כל אנשי הקשר כבר קיימים'
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
