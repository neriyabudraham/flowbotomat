const db = require('../../config/database');

/**
 * Export bot flow as JSON
 */
async function exportBot(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    // Get bot with ownership check
    const bot = await db.query(
      `SELECT b.*, 
        (SELECT allow_export FROM bot_shares WHERE bot_id = b.id AND shared_with_id = $2) as share_allow_export
       FROM bots b 
       WHERE b.id = $1 AND (b.user_id = $2 OR EXISTS (
         SELECT 1 FROM bot_shares WHERE bot_id = b.id AND shared_with_id = $2
       ))`,
      [id, userId]
    );
    
    if (bot.rows.length === 0) {
      return res.status(404).json({ error: 'בוט לא נמצא' });
    }
    
    const botData = bot.rows[0];
    
    // If user is not owner, check if export is allowed
    if (botData.user_id !== userId && botData.share_allow_export !== true) {
      return res.status(403).json({ error: 'אין לך הרשאה לייצא בוט זה' });
    }
    
    // Create export object
    const exportData = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      bot: {
        name: botData.name,
        description: botData.description,
        flow_data: botData.flow_data,
      },
    };
    
    // Set headers for download
    const filename = `${botData.name.replace(/[^a-zA-Z0-9א-ת]/g, '_')}_${Date.now()}.json`;
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.json(exportData);
    
  } catch (error) {
    console.error('[Export] Error:', error);
    res.status(500).json({ error: 'שגיאה בייצוא' });
  }
}

/**
 * Import bot flow from JSON
 */
async function importBot(req, res) {
  try {
    const userId = req.user.id;
    const { data, name } = req.body;
    
    if (!data || !data.bot) {
      return res.status(400).json({ error: 'קובץ לא תקין' });
    }
    
    // Validate version
    if (data.version !== '1.0') {
      return res.status(400).json({ error: 'גרסת קובץ לא נתמכת' });
    }
    
    const importedBot = data.bot;
    const botName = name || `${importedBot.name} (יובא)`;
    
    // Create new bot
    const result = await db.query(
      `INSERT INTO bots (user_id, name, description, flow_data, is_active)
       VALUES ($1, $2, $3, $4, false)
       RETURNING *`,
      [userId, botName, importedBot.description, JSON.stringify(importedBot.flow_data)]
    );
    
    console.log(`[Import] Bot imported: ${result.rows[0].id} by user ${userId}`);
    
    res.json({
      success: true,
      bot: result.rows[0],
      message: 'הבוט יובא בהצלחה',
    });
    
  } catch (error) {
    console.error('[Import] Error:', error);
    res.status(500).json({ error: 'שגיאה בייבוא' });
  }
}

/**
 * Duplicate a bot
 */
async function duplicateBot(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { name } = req.body;
    
    // Get original bot with share info
    const original = await db.query(
      `SELECT b.*, 
        (SELECT allow_export FROM bot_shares WHERE bot_id = b.id AND shared_with_id = $2) as share_allow_export
       FROM bots b 
       WHERE b.id = $1 AND (b.user_id = $2 OR EXISTS (
         SELECT 1 FROM bot_shares WHERE bot_id = $1 AND shared_with_id = $2
       ))`,
      [id, userId]
    );
    
    if (original.rows.length === 0) {
      return res.status(404).json({ error: 'בוט לא נמצא' });
    }
    
    const bot = original.rows[0];
    
    // If user is not owner, check if export/duplicate is allowed
    if (bot.user_id !== userId && bot.share_allow_export !== true) {
      return res.status(403).json({ error: 'אין לך הרשאה לשכפל בוט זה' });
    }
    
    const newName = name || `${bot.name} (עותק)`;
    
    // Create duplicate
    const result = await db.query(
      `INSERT INTO bots (user_id, name, description, flow_data, is_active)
       VALUES ($1, $2, $3, $4, false)
       RETURNING *`,
      [userId, newName, bot.description, JSON.stringify(bot.flow_data)]
    );
    
    console.log(`[Duplicate] Bot duplicated: ${bot.id} -> ${result.rows[0].id}`);
    
    res.json({
      success: true,
      bot: result.rows[0],
    });
    
  } catch (error) {
    console.error('[Duplicate] Error:', error);
    res.status(500).json({ error: 'שגיאה בשכפול' });
  }
}

module.exports = {
  exportBot,
  importBot,
  duplicateBot,
};
