const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const BACKUP_DIR = '/backups';

/**
 * List available backups
 */
async function listBackups(req, res) {
  try {
    // Only superadmin can access backups
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'אין הרשאה' });
    }
    
    // Check if backup directory exists
    if (!fs.existsSync(BACKUP_DIR)) {
      return res.json({ backups: [], message: 'תיקיית גיבויים לא נמצאה' });
    }
    
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.sql.gz'))
      .map(filename => {
        const filepath = path.join(BACKUP_DIR, filename);
        const stats = fs.statSync(filepath);
        return {
          filename,
          size: stats.size,
          sizeFormatted: formatBytes(stats.size),
          created_at: stats.mtime,
        };
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    res.json({ backups: files });
  } catch (error) {
    console.error('[Backups] List error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת רשימת גיבויים' });
  }
}

/**
 * Create a new backup using pg_dump via Docker exec
 */
async function createBackup(req, res) {
  try {
    // Only superadmin can create backups
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'אין הרשאה' });
    }
    
    console.log('[Backups] Creating manual backup...');
    
    // Ensure backup directory exists
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `backup_${timestamp}.sql.gz`;
    const filepath = path.join(BACKUP_DIR, filename);
    
    // Get DB connection details
    const dbHost = process.env.DB_HOST || 'db';
    const dbUser = process.env.DB_USER;
    const dbPass = process.env.DB_PASSWORD;
    const dbName = process.env.DB_NAME;
    
    // Create backup using pg_dump through docker exec to db container
    // Since we're running inside Docker, we can use the db hostname directly
    const dumpCommand = `PGPASSWORD="${dbPass}" pg_dump -h ${dbHost} -U ${dbUser} ${dbName} | gzip > ${filepath}`;
    
    try {
      await execAsync(dumpCommand, { shell: '/bin/sh' });
      console.log('[Backups] Backup created:', filename);
      
      // Verify the file was created
      if (fs.existsSync(filepath)) {
        const stats = fs.statSync(filepath);
        console.log('[Backups] Backup size:', formatBytes(stats.size));
        res.json({ success: true, message: 'גיבוי נוצר בהצלחה', filename });
      } else {
        throw new Error('Backup file was not created');
      }
    } catch (cmdError) {
      console.error('[Backups] pg_dump error:', cmdError);
      // Try alternative: direct node-pg export
      await createBackupWithNodePg(filepath, dbHost, dbUser, dbPass, dbName);
      res.json({ success: true, message: 'גיבוי נוצר בהצלחה', filename });
    }
  } catch (error) {
    console.error('[Backups] Create error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת גיבוי: ' + error.message });
  }
}

/**
 * Fallback: Create backup using node-pg (exports table data as JSON)
 */
async function createBackupWithNodePg(filepath, host, user, password, database) {
  const pool = new Pool({ host, user, password, database });
  
  try {
    // Get all tables
    const tablesResult = await pool.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public'
    `);
    
    const backup = {
      created_at: new Date().toISOString(),
      tables: {}
    };
    
    for (const row of tablesResult.rows) {
      const tableName = row.tablename;
      const dataResult = await pool.query(`SELECT * FROM "${tableName}"`);
      backup.tables[tableName] = {
        rows: dataResult.rows,
        count: dataResult.rowCount
      };
    }
    
    // Save as compressed JSON
    const zlib = require('zlib');
    const jsonData = JSON.stringify(backup, null, 2);
    const compressed = zlib.gzipSync(jsonData);
    fs.writeFileSync(filepath.replace('.sql.gz', '.json.gz'), compressed);
    
    console.log('[Backups] Node-pg backup created successfully');
  } finally {
    await pool.end();
  }
}

/**
 * Download a backup file
 */
async function downloadBackup(req, res) {
  try {
    // Only superadmin can download backups
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'אין הרשאה' });
    }
    
    const { filename } = req.params;
    
    // Sanitize filename to prevent path traversal
    const sanitizedFilename = path.basename(filename);
    const filepath = path.join(BACKUP_DIR, sanitizedFilename);
    
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'גיבוי לא נמצא' });
    }
    
    res.download(filepath, sanitizedFilename);
  } catch (error) {
    console.error('[Backups] Download error:', error);
    res.status(500).json({ error: 'שגיאה בהורדת גיבוי' });
  }
}

/**
 * Delete a backup
 */
async function deleteBackup(req, res) {
  try {
    // Only superadmin can delete backups
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'אין הרשאה' });
    }
    
    const { filename } = req.params;
    
    // Sanitize filename
    const sanitizedFilename = path.basename(filename);
    const filepath = path.join(BACKUP_DIR, sanitizedFilename);
    
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'גיבוי לא נמצא' });
    }
    
    fs.unlinkSync(filepath);
    
    res.json({ success: true, message: 'גיבוי נמחק' });
  } catch (error) {
    console.error('[Backups] Delete error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת גיבוי' });
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = { listBackups, createBackup, downloadBackup, deleteBackup };
