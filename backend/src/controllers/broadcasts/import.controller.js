const pool = require('../../config/database');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../../uploads/imports');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.xlsx', '.xls', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('סוג קובץ לא נתמך. נא להעלות קובץ Excel או CSV'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
}).single('file');

// System fields for contacts (always available)
const CONTACT_SYSTEM_FIELDS = [
  { key: 'phone', label: 'מספר טלפון', type: 'phone', required: true, isSystem: true },
  { key: 'name', label: 'שם איש קשר', type: 'text', required: false, isSystem: true },
];

/**
 * Upload file and return parsed data
 */
async function uploadFile(req, res) {
  upload(req, res, async (err) => {
    if (err) {
      console.error('[Import] Upload error:', err);
      return res.status(400).json({ error: err.message });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'לא נבחר קובץ' });
    }
    
    try {
      // Fix Hebrew filename encoding
      let originalName;
      try {
        originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
      } catch {
        originalName = req.file.originalname;
      }
      
      const workbook = XLSX.readFile(req.file.path);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Parse with headers
      const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      
      if (rawData.length < 2) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'הקובץ ריק או מכיל רק כותרות' });
      }
      
      const headers = rawData[0].map(h => String(h || '').trim());
      const rows = rawData.slice(1).filter(row => row.some(cell => cell !== ''));
      
      console.log(`[Import] File uploaded: ${originalName}, ${headers.length} columns, ${rows.length} rows`);
      
      res.json({
        file_id: path.basename(req.file.path),
        file_path: req.file.path,
        file_name: originalName,
        columns: headers,
        rows: rows.slice(0, 100), // First 100 rows for preview
        total_rows: rows.length
      });
    } catch (error) {
      console.error('[Import] Parse error:', error);
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: 'שגיאה בקריאת הקובץ' });
    }
  });
}

/**
 * Get available variables for mapping
 * Uses existing user_variable_definitions table (same as bots)
 */
async function getVariables(req, res) {
  try {
    const userId = req.user.id;
    
    // Get user-defined variables from the existing system
    const result = await pool.query(`
      SELECT name as key, label, var_type as type, is_system
      FROM user_variable_definitions 
      WHERE user_id = $1 
      ORDER BY is_system DESC, label ASC
    `, [userId]);
    
    res.json({
      systemFields: CONTACT_SYSTEM_FIELDS,
      userVariables: result.rows.map(v => ({
        key: v.key,
        label: v.label,
        type: v.type,
        isSystem: v.is_system
      }))
    });
  } catch (error) {
    console.error('[Import] Get variables error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת משתנים' });
  }
}

/**
 * Create a new variable (uses existing variables system)
 */
async function createVariable(req, res) {
  try {
    const userId = req.user.id;
    const { key, label } = req.body;
    
    if (!key || !label) {
      return res.status(400).json({ error: 'שם ותווית נדרשים' });
    }
    
    // Validate key format
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
      return res.status(400).json({ error: 'שם המשתנה יכול להכיל רק אותיות אנגליות, מספרים וקו תחתון' });
    }
    
    // Reserved names
    const reserved = ['name', 'phone', 'contact_phone', 'last_message', 'bot_name', 'date', 'time', 'day', 'email'];
    if (reserved.includes(key.toLowerCase())) {
      return res.status(400).json({ error: 'שם משתנה שמור - בחר שם אחר' });
    }
    
    const result = await pool.query(`
      INSERT INTO user_variable_definitions (user_id, name, label, var_type, description)
      VALUES ($1, $2, $3, 'text', $4)
      ON CONFLICT (user_id, name) DO UPDATE SET label = $3
      RETURNING name as key, label, var_type as type
    `, [userId, key.toLowerCase(), label, `נוצר מייבוא אנשי קשר`]);
    
    res.status(201).json({ variable: result.rows[0] });
  } catch (error) {
    console.error('[Import] Create variable error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת משתנה' });
  }
}

/**
 * Execute the import
 */
async function executeImport(req, res) {
  const client = await pool.connect();
  
  try {
    const userId = req.user.id;
    const { file_path, mapping, audience_id } = req.body;
    
    if (!file_path || !mapping || !mapping.phone) {
      return res.status(400).json({ error: 'חסרים נתונים - נדרש מיפוי לעמודת טלפון' });
    }
    
    // Find the phone column
    const phoneColumn = Object.keys(mapping).find(col => mapping[col] === 'phone');
    if (!phoneColumn) {
      return res.status(400).json({ error: 'לא נבחרה עמודת טלפון' });
    }
    
    // Read file
    if (!fs.existsSync(file_path)) {
      return res.status(400).json({ error: 'הקובץ לא נמצא - יש להעלות מחדש' });
    }
    
    const workbook = XLSX.readFile(file_path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    
    const headers = rawData[0];
    const rows = rawData.slice(1).filter(row => row.some(cell => cell !== ''));
    
    console.log(`[Import] Starting import: ${rows.length} rows, mapping:`, mapping);
    
    let imported = 0;
    let updated = 0;
    let errors = [];
    
    await client.query('BEGIN');
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      try {
        // Get phone from mapped column
        const phoneColIndex = headers.indexOf(phoneColumn);
        let phone = String(row[phoneColIndex] || '').trim();
        
        if (!phone) {
          errors.push({ row: i + 2, error: 'מספר טלפון חסר' });
          continue;
        }
        
        // Format phone number
        phone = formatPhoneNumber(phone);
        if (!isValidPhoneNumber(phone)) {
          errors.push({ row: i + 2, error: 'מספר טלפון לא תקין', phone });
          continue;
        }
        
        // Get name if mapped
        let displayName = null;
        const nameColumn = Object.keys(mapping).find(col => mapping[col] === 'name');
        if (nameColumn) {
          const nameColIndex = headers.indexOf(nameColumn);
          displayName = String(row[nameColIndex] || '').trim() || null;
        }
        
        // Insert or update contact in existing contacts table
        const contactResult = await client.query(`
          INSERT INTO contacts (user_id, phone, display_name)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id, phone) 
          DO UPDATE SET 
            display_name = COALESCE(NULLIF($3, ''), contacts.display_name),
            updated_at = NOW()
          RETURNING id, (xmax = 0) as is_new
        `, [userId, phone, displayName]);
        
        const contactId = contactResult.rows[0].id;
        const isNew = contactResult.rows[0].is_new;
        
        if (isNew) {
          imported++;
        } else {
          updated++;
        }
        
        // Save custom variables to contact_variables table
        for (const [column, variableKey] of Object.entries(mapping)) {
          // Skip system fields
          if (variableKey === 'phone' || variableKey === 'name') continue;
          
          const colIndex = headers.indexOf(column);
          const value = String(row[colIndex] || '').trim();
          
          if (value) {
            await client.query(`
              INSERT INTO contact_variables (contact_id, key, value)
              VALUES ($1, $2, $3)
              ON CONFLICT (contact_id, key) 
              DO UPDATE SET value = $3, updated_at = NOW()
            `, [contactId, variableKey, value]);
          }
        }
        
        // Add to audience if specified
        if (audience_id) {
          await client.query(`
            INSERT INTO broadcast_audience_contacts (audience_id, contact_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
          `, [audience_id, contactId]);
        }
        
      } catch (rowError) {
        console.error(`[Import] Row ${i + 2} error:`, rowError.message);
        errors.push({ row: i + 2, error: rowError.message });
      }
    }
    
    await client.query('COMMIT');
    
    // Clean up file
    try {
      fs.unlinkSync(file_path);
    } catch {}
    
    console.log(`[Import] Completed: ${imported} new, ${updated} updated, ${errors.length} errors`);
    
    res.json({
      success: true,
      stats: {
        total: rows.length,
        imported,
        updated,
        errors: errors.length
      },
      errors: errors.slice(0, 50) // First 50 errors
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Import] Execute error:', error);
    res.status(500).json({ error: 'שגיאה בייבוא: ' + error.message });
  } finally {
    client.release();
  }
}

/**
 * Cancel/cleanup uploaded file
 */
async function cancelImport(req, res) {
  try {
    const { file_path } = req.body;
    
    if (file_path && fs.existsSync(file_path)) {
      fs.unlinkSync(file_path);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Import] Cancel error:', error);
    res.status(500).json({ error: 'שגיאה בביטול' });
  }
}

// ============================================
// Helper Functions
// ============================================

function formatPhoneNumber(phone) {
  // Remove all non-digits
  let clean = phone.replace(/\D/g, '');
  
  // Handle Israeli numbers
  if (clean.startsWith('0')) {
    clean = '972' + clean.substring(1);
  } else if (clean.length === 9 && !clean.startsWith('972')) {
    clean = '972' + clean;
  }
  
  return clean;
}

function isValidPhoneNumber(phone) {
  // 10-15 digits, starts with valid country code
  return /^\d{10,15}$/.test(phone);
}

module.exports = {
  uploadFile,
  getVariables,
  createVariable,
  executeImport,
  cancelImport
};
