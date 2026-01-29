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
    // Fix Hebrew filename encoding
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(originalName);
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

// System fields that always exist
const SYSTEM_FIELDS = [
  { field_key: 'phone', field_name: 'מספר טלפון', field_type: 'phone', is_required: true, is_system: true },
  { field_key: 'name', field_name: 'שם', field_type: 'text', is_required: false, is_system: true },
  { field_key: 'email', field_name: 'אימייל', field_type: 'email', is_required: false, is_system: true },
];

/**
 * Upload file and return columns
 */
async function uploadFile(req, res) {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'לא נבחר קובץ' });
    }
    
    try {
      const workbook = XLSX.readFile(req.file.path);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      if (data.length < 2) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'הקובץ ריק או מכיל רק כותרות' });
      }
      
      const headers = data[0];
      // Return up to 100 rows for preview (more rows can be shown with scrolling)
      const sampleRows = data.slice(1, 101);
      
      // Fix Hebrew filename encoding
      const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
      
      res.json({
        file_path: req.file.path,
        file_name: originalName,
        columns: headers,
        sample_data: sampleRows,
        total_rows: data.length - 1
      });
    } catch (error) {
      console.error('[Import] Upload error:', error);
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: 'שגיאה בקריאת הקובץ' });
    }
  });
}

/**
 * Preview import with mapping
 */
async function previewImport(req, res) {
  try {
    const { file_path, field_mapping } = req.body;
    
    if (!file_path || !field_mapping) {
      return res.status(400).json({ error: 'חסרים נתונים' });
    }
    
    if (!field_mapping.phone) {
      return res.status(400).json({ error: 'חובה למפות את עמודת מספר הטלפון' });
    }
    
    const workbook = XLSX.readFile(file_path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    const preview = [];
    const errors = [];
    
    for (let i = 0; i < Math.min(data.length, 10); i++) {
      const row = data[i];
      const mapped = {};
      let rowErrors = [];
      
      for (const [column, field] of Object.entries(field_mapping)) {
        if (row[column] !== undefined) {
          mapped[field] = row[column];
        }
      }
      
      // Validate phone
      if (!mapped.phone) {
        rowErrors.push('מספר טלפון חסר');
      } else {
        mapped.phone = formatPhoneNumber(String(mapped.phone));
        if (!isValidPhoneNumber(mapped.phone)) {
          rowErrors.push('מספר טלפון לא תקין');
        }
      }
      
      preview.push({
        original: row,
        mapped,
        errors: rowErrors,
        valid: rowErrors.length === 0
      });
    }
    
    res.json({
      preview,
      total_rows: data.length,
      valid_count: preview.filter(p => p.valid).length
    });
  } catch (error) {
    console.error('[Import] Preview error:', error);
    res.status(500).json({ error: 'שגיאה בתצוגה מקדימה' });
  }
}

/**
 * Execute import
 */
async function executeImport(req, res) {
  try {
    const userId = req.user.id;
    const { file_path, file_name, field_mapping, target_audience_id, create_new_fields } = req.body;
    
    if (!file_path || !field_mapping || !field_mapping.phone) {
      return res.status(400).json({ error: 'חסרים נתונים' });
    }
    
    // Create import job
    const jobResult = await pool.query(`
      INSERT INTO contact_import_jobs 
      (user_id, file_name, field_mapping, target_audience_id, status)
      VALUES ($1, $2, $3, $4, 'processing')
      RETURNING *
    `, [userId, file_name, field_mapping, target_audience_id]);
    
    const job = jobResult.rows[0];
    
    // Process in background (for now, synchronous)
    processImport(userId, job.id, file_path, field_mapping, target_audience_id, create_new_fields)
      .catch(err => console.error('[Import] Process error:', err));
    
    res.json({ job });
  } catch (error) {
    console.error('[Import] Execute error:', error);
    res.status(500).json({ error: 'שגיאה בהפעלת ייבוא' });
  }
}

async function processImport(userId, jobId, filePath, fieldMapping, targetAudienceId, createNewFields) {
  const client = await pool.connect();
  
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    await client.query(
      'UPDATE contact_import_jobs SET total_rows = $1 WHERE id = $2',
      [data.length, jobId]
    );
    
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    
    // Create custom field definitions if needed
    if (createNewFields) {
      for (const [column, fieldKey] of Object.entries(fieldMapping)) {
        if (!SYSTEM_FIELDS.some(f => f.field_key === fieldKey)) {
          await client.query(`
            INSERT INTO contact_field_definitions (user_id, field_key, field_name, field_type)
            VALUES ($1, $2, $3, 'text')
            ON CONFLICT (user_id, field_key) DO NOTHING
          `, [userId, fieldKey, column]);
        }
      }
    }
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      
      try {
        await client.query('BEGIN');
        
        const mapped = {};
        for (const [column, field] of Object.entries(fieldMapping)) {
          if (row[column] !== undefined) {
            mapped[field] = row[column];
          }
        }
        
        // Format and validate phone
        if (!mapped.phone) {
          throw new Error('מספר טלפון חסר');
        }
        
        mapped.phone = formatPhoneNumber(String(mapped.phone));
        if (!isValidPhoneNumber(mapped.phone)) {
          throw new Error('מספר טלפון לא תקין');
        }
        
        // Insert or update contact
        const contactResult = await client.query(`
          INSERT INTO contacts (user_id, phone, display_name)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id, phone) 
          DO UPDATE SET display_name = COALESCE(EXCLUDED.display_name, contacts.display_name),
                        updated_at = NOW()
          RETURNING id
        `, [userId, mapped.phone, mapped.name || null]);
        
        const contactId = contactResult.rows[0].id;
        
        // Save custom fields
        for (const [field, value] of Object.entries(mapped)) {
          if (!['phone', 'name'].includes(field) && value) {
            await client.query(`
              INSERT INTO contact_variables (contact_id, key, value)
              VALUES ($1, $2, $3)
              ON CONFLICT (contact_id, key) DO UPDATE SET value = $3, updated_at = NOW()
            `, [contactId, field, String(value)]);
          }
        }
        
        // Add to audience if specified
        if (targetAudienceId) {
          await client.query(`
            INSERT INTO broadcast_audience_contacts (audience_id, contact_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
          `, [targetAudienceId, contactId]);
        }
        
        await client.query('COMMIT');
        successCount++;
      } catch (rowError) {
        await client.query('ROLLBACK');
        errorCount++;
        errors.push({
          row: i + 2, // +2 for header and 0-index
          error: rowError.message,
          data: row
        });
      }
      
      // Update progress every 100 rows
      if ((i + 1) % 100 === 0 || i === data.length - 1) {
        await pool.query(`
          UPDATE contact_import_jobs 
          SET processed_rows = $1, success_count = $2, error_count = $3, errors = $4
          WHERE id = $5
        `, [i + 1, successCount, errorCount, JSON.stringify(errors.slice(-100)), jobId]);
      }
    }
    
    // Mark as completed
    await pool.query(`
      UPDATE contact_import_jobs 
      SET status = 'completed', completed_at = NOW(),
          processed_rows = $1, success_count = $2, error_count = $3, errors = $4
      WHERE id = $5
    `, [data.length, successCount, errorCount, JSON.stringify(errors.slice(-100)), jobId]);
    
    // Clean up file
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error('[Import] Process error:', error);
    await pool.query(
      "UPDATE contact_import_jobs SET status = 'failed' WHERE id = $1",
      [jobId]
    );
  } finally {
    client.release();
  }
}

/**
 * Get import jobs
 */
async function getImportJobs(req, res) {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(`
      SELECT * FROM contact_import_jobs 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT 20
    `, [userId]);
    
    res.json({ jobs: result.rows });
  } catch (error) {
    console.error('[Import] Get jobs error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת ייבואים' });
  }
}

/**
 * Get single import job
 */
async function getImportJob(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM contact_import_jobs WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'ייבוא לא נמצא' });
    }
    
    res.json({ job: result.rows[0] });
  } catch (error) {
    console.error('[Import] Get job error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת ייבוא' });
  }
}

/**
 * Get field definitions for user
 */
async function getFieldDefinitions(req, res) {
  try {
    const userId = req.user.id;
    
    // Get user's custom fields
    const result = await pool.query(`
      SELECT * FROM contact_field_definitions 
      WHERE user_id = $1 
      ORDER BY is_system DESC, display_order ASC, field_name ASC
    `, [userId]);
    
    // Combine with system fields
    const allFields = [
      ...SYSTEM_FIELDS,
      ...result.rows.filter(f => !f.is_system)
    ];
    
    res.json({ fields: allFields });
  } catch (error) {
    console.error('[Import] Get fields error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת שדות' });
  }
}

/**
 * Create field definition
 */
async function createFieldDefinition(req, res) {
  try {
    const userId = req.user.id;
    const { field_key, field_name, field_type, is_required, select_options } = req.body;
    
    if (!field_key || !field_name) {
      return res.status(400).json({ error: 'שם ומזהה השדה נדרשים' });
    }
    
    // Validate field_key format
    if (!/^[a-z0-9_]+$/.test(field_key)) {
      return res.status(400).json({ error: 'מזהה השדה יכול להכיל רק אותיות קטנות, מספרים וקו תחתון' });
    }
    
    const result = await pool.query(`
      INSERT INTO contact_field_definitions 
      (user_id, field_key, field_name, field_type, is_required, select_options)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [userId, field_key, field_name, field_type || 'text', is_required || false, select_options]);
    
    res.status(201).json({ field: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'שדה עם מזהה זה כבר קיים' });
    }
    console.error('[Import] Create field error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת שדה' });
  }
}

/**
 * Update field definition
 */
async function updateFieldDefinition(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { field_name, field_type, is_required, select_options, display_order } = req.body;
    
    const result = await pool.query(`
      UPDATE contact_field_definitions 
      SET field_name = COALESCE($1, field_name),
          field_type = COALESCE($2, field_type),
          is_required = COALESCE($3, is_required),
          select_options = COALESCE($4, select_options),
          display_order = COALESCE($5, display_order)
      WHERE id = $6 AND user_id = $7 AND is_system = false
      RETURNING *
    `, [field_name, field_type, is_required, select_options, display_order, id, userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'שדה לא נמצא או לא ניתן לעריכה' });
    }
    
    res.json({ field: result.rows[0] });
  } catch (error) {
    console.error('[Import] Update field error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון שדה' });
  }
}

/**
 * Delete field definition
 */
async function deleteFieldDefinition(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM contact_field_definitions WHERE id = $1 AND user_id = $2 AND is_system = false RETURNING id',
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'שדה לא נמצא או לא ניתן למחיקה' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Import] Delete field error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת שדה' });
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
  } else if (!clean.startsWith('972') && clean.length === 9) {
    clean = '972' + clean;
  }
  
  return clean;
}

function isValidPhoneNumber(phone) {
  // Basic validation - 10-15 digits
  return /^\d{10,15}$/.test(phone);
}

module.exports = {
  uploadFile,
  previewImport,
  executeImport,
  getImportJobs,
  getImportJob,
  getFieldDefinitions,
  createFieldDefinition,
  updateFieldDefinition,
  deleteFieldDefinition
};
