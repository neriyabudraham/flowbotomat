const db = require('../../config/database');
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
        rows: rows, // ALL rows
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
 * Execute the import
 */
async function executeImport(req, res) {
  try {
    const userId = req.user.id;
    const { file_path, mapping, audience_id, default_country_code = '972' } = req.body;
    
    // Find the phone column from mapping values
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
    
    console.log(`[Import] Starting import: ${rows.length} rows, country code: ${default_country_code}, mapping:`, mapping);
    
    let imported = 0;
    let updated = 0;
    let errors = [];
    
    // Process each row independently (no single transaction for all)
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      try {
        // Get phone from mapped column
        const phoneColIndex = headers.indexOf(phoneColumn);
        let rawPhone = String(row[phoneColIndex] || '').trim();
        
        if (!rawPhone) {
          errors.push({ row: i + 2, error: 'מספר טלפון חסר' });
          continue;
        }
        
        // Format phone number with country code
        const phone = formatPhoneNumber(rawPhone, default_country_code);
        if (!isValidPhoneNumber(phone)) {
          errors.push({ row: i + 2, error: 'מספר טלפון לא תקין', phone: rawPhone });
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
        const contactResult = await db.query(`
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
            await db.query(`
              INSERT INTO contact_variables (contact_id, key, value)
              VALUES ($1, $2, $3)
              ON CONFLICT (contact_id, key) 
              DO UPDATE SET value = $3, updated_at = NOW()
            `, [contactId, variableKey, value]);
          }
        }
        
        // Add to audience if specified
        if (audience_id) {
          await db.query(`
            INSERT INTO broadcast_audience_contacts (audience_id, contact_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
          `, [audience_id, contactId]);
        }
        
      } catch (rowError) {
        console.error(`[Import] Row ${i + 2} error:`, rowError.message);
        errors.push({ row: i + 2, error: rowError.message });
      }
      
      // Log progress every 1000 rows
      if ((i + 1) % 1000 === 0) {
        console.log(`[Import] Progress: ${i + 1}/${rows.length} rows processed`);
      }
    }
    
    // Update audience contacts count if added to audience
    if (audience_id) {
      await db.query(`
        UPDATE broadcast_audiences 
        SET contacts_count = (
          SELECT COUNT(*) FROM broadcast_audience_contacts WHERE audience_id = $1
        )
        WHERE id = $1
      `, [audience_id]);
    }
    
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
    console.error('[Import] Execute error:', error);
    res.status(500).json({ error: 'שגיאה בייבוא: ' + error.message });
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

function formatPhoneNumber(phone, countryCode = '972') {
  if (!phone) return null;
  
  // Convert to string and remove all non-digits (except + at start)
  let clean = String(phone).replace(/[^\d+]/g, '');
  
  // Remove + prefix if exists
  if (clean.startsWith('+')) {
    clean = clean.substring(1);
  }
  
  // If starts with 0, replace with country code
  if (clean.startsWith('0')) {
    clean = countryCode + clean.substring(1);
  }
  // If doesn't start with any common country code and is 9-10 digits, add country code
  else if (clean.length >= 9 && clean.length <= 10) {
    const startsWithCode = ['972', '1', '44', '49', '33', '7', '86', '91'].some(code => clean.startsWith(code));
    if (!startsWithCode) {
      clean = countryCode + clean;
    }
  }
  
  return clean;
}

function isValidPhoneNumber(phone) {
  if (!phone) return false;
  // 10-15 digits
  return /^\d{10,15}$/.test(phone);
}

module.exports = {
  uploadFile,
  executeImport,
  cancelImport
};
