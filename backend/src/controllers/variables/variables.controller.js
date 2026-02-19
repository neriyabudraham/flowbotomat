const db = require('../../config/database');

// System variables that are always available
const SYSTEM_VARIABLES = [
  { name: 'name', label: 'שם איש קשר (מ-WhatsApp)', description: 'שם איש הקשר כפי שנשמר ב-WhatsApp', var_type: 'text', is_system: true },
  { name: 'contact_phone', label: 'טלפון איש קשר', description: 'מספר הטלפון של איש הקשר שאיתו מתנהלת השיחה', var_type: 'text', is_system: true },
  { name: 'sender_phone', label: 'טלפון השולח (בקבוצה)', description: 'מספר הטלפון של מי ששלח את ההודעה בקבוצה', var_type: 'text', is_system: true },
  { name: 'phone_bot', label: 'מספר טלפון בוט', description: 'מספר הטלפון של הבוט המחובר שעליו רצה האוטומציה', var_type: 'text', is_system: true },
  { name: 'group_id', label: 'מזהה קבוצה', description: 'מזהה הקבוצה (רק אם ההודעה נשלחה בקבוצה)', var_type: 'text', is_system: true },
  { name: 'is_group', label: 'האם קבוצה', description: 'true/false - האם ההודעה נשלחה בקבוצה', var_type: 'text', is_system: true },
  { name: 'channel_id', label: 'מזהה ערוץ', description: 'מזהה הערוץ (רק אם ההודעה הגיעה מערוץ)', var_type: 'text', is_system: true },
  { name: 'channel_name', label: 'שם ערוץ', description: 'שם הערוץ (רק אם ההודעה הגיעה מערוץ)', var_type: 'text', is_system: true },
  { name: 'is_channel', label: 'האם ערוץ', description: 'true/false - האם ההודעה הגיעה מערוץ (newsletter)', var_type: 'text', is_system: true },
  { name: 'last_message', label: 'ההודעה האחרונה', description: 'ההודעה האחרונה / כיתוב מדיה שהתקבל מאיש הקשר', var_type: 'text', is_system: true },
  { name: 'media_url', label: 'לינק למדיה', description: 'לינק להורדת המדיה שנשלחה (תמונה/סרטון/קובץ/שמע) - זמין עד 24 שעות', var_type: 'text', is_system: true },
  { name: 'has_media', label: 'האם יש מדיה', description: 'true/false - האם יש מדיה מצורפת להודעה', var_type: 'text', is_system: true },
  { name: 'media_type', label: 'סוג מדיה', description: 'סוג המדיה: image/video/audio/document/sticker (או ריק אם אין מדיה)', var_type: 'text', is_system: true },
  { name: 'date', label: 'תאריך', description: 'תאריך נוכחי בפורמט DD.MM.YYYY', var_type: 'text', is_system: true },
  { name: 'time', label: 'שעה', description: 'שעה נוכחית בפורמט HH:MM', var_type: 'text', is_system: true },
  { name: 'day', label: 'יום בשבוע', description: 'יום בשבוע (ראשון, שני...)', var_type: 'text', is_system: true },
  { name: 'bot_name', label: 'שם הבוט', description: 'שם הבוט הפעיל', var_type: 'text', is_system: true },
];

// Get all variables for user
async function getVariables(req, res) {
  try {
    const userId = req.user.id;
    
    // Get user-defined variables
    const result = await db.query(
      `SELECT id, name, label, description, default_value, var_type, is_system, created_at 
       FROM user_variable_definitions 
       WHERE user_id = $1 
       ORDER BY is_system DESC, name ASC`,
      [userId]
    );
    
    // Separate user variables from custom system variables (constants)
    const userVariables = result.rows.filter(v => !v.is_system);
    const customSystemVariables = result.rows.filter(v => v.is_system);
    
    res.json({
      systemVariables: SYSTEM_VARIABLES,
      userVariables,
      customSystemVariables
    });
  } catch (error) {
    console.error('[Variables] Error fetching:', error);
    res.status(500).json({ error: 'שגיאה בטעינת משתנים' });
  }
}

// Create a new variable
async function createVariable(req, res) {
  try {
    const userId = req.user.id;
    const { name, label, description, default_value, var_type, is_system } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'שם המשתנה הוא שדה חובה' });
    }
    
    // Validate name format (letters, numbers, underscore only)
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      return res.status(400).json({ error: 'שם משתנה יכול להכיל רק אותיות אנגליות, מספרים וקו תחתון' });
    }
    
    // Check if trying to override built-in system variable
    const builtInNames = SYSTEM_VARIABLES.map(v => v.name);
    if (builtInNames.includes(name.toLowerCase())) {
      return res.status(400).json({ error: 'לא ניתן ליצור משתנה בשם זה - זהו משתנה מערכת מובנה' });
    }
    
    const result = await db.query(
      `INSERT INTO user_variable_definitions (user_id, name, label, description, default_value, var_type, is_system)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, name.toLowerCase(), label || name, description || '', default_value || '', var_type || 'text', is_system || false]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'משתנה בשם זה כבר קיים' });
    }
    console.error('[Variables] Error creating:', error);
    res.status(500).json({ error: 'שגיאה ביצירת משתנה' });
  }
}

// Update a variable
async function updateVariable(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { label, description, default_value, var_type } = req.body;
    
    // Allow updating both user variables and custom system variables (but not built-in)
    const result = await db.query(
      `UPDATE user_variable_definitions 
       SET label = COALESCE($1, label),
           description = COALESCE($2, description),
           default_value = COALESCE($3, default_value),
           var_type = COALESCE($4, var_type)
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [label, description, default_value, var_type, id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'משתנה לא נמצא' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('[Variables] Error updating:', error);
    res.status(500).json({ error: 'שגיאה בעדכון משתנה' });
  }
}

// Delete a variable
async function deleteVariable(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const result = await db.query(
      `DELETE FROM user_variable_definitions 
       WHERE id = $1 AND user_id = $2 AND is_system = false
       RETURNING id`,
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'משתנה לא נמצא או שאי אפשר למחוק אותו' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Variables] Error deleting:', error);
    res.status(500).json({ error: 'שגיאה במחיקת משתנה' });
  }
}

module.exports = {
  getVariables,
  createVariable,
  updateVariable,
  deleteVariable
};
