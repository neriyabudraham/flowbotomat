const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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
 * Create a new backup
 */
async function createBackup(req, res) {
  try {
    // Only superadmin can create backups
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'אין הרשאה' });
    }
    
    console.log('[Backups] Creating manual backup...');
    
    // Execute backup script
    execSync('/backup.sh', { 
      stdio: 'inherit',
      env: {
        ...process.env,
        POSTGRES_HOST: process.env.DB_HOST || 'db',
        POSTGRES_USER: process.env.DB_USER,
        POSTGRES_PASSWORD: process.env.DB_PASSWORD,
        POSTGRES_DB: process.env.DB_NAME,
      }
    });
    
    res.json({ success: true, message: 'גיבוי נוצר בהצלחה' });
  } catch (error) {
    console.error('[Backups] Create error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת גיבוי' });
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
