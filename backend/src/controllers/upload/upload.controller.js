const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Get type from mimetype
const getTypeFromMime = (mimetype) => {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  return 'misc';
};

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = getTypeFromMime(file.mimetype);
    const typeDir = path.join(uploadsDir, type);
    if (!fs.existsSync(typeDir)) {
      fs.mkdirSync(typeDir, { recursive: true });
    }
    // Store type for later use
    req.uploadType = type;
    cb(null, typeDir);
  },
  filename: (req, file, cb) => {
    const uniqueId = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${uniqueId}${ext}`);
  }
});

// File filter - allow all common media types
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    // Images
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    // Videos
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska',
    // Audio
    'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/mp4', 'audio/aac',
    // Documents
    'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    console.log(`[Upload] Rejected file type: ${file.mimetype}`);
    cb(new Error(`סוג קובץ לא נתמך: ${file.mimetype}`), false);
  }
};

// Create multer upload middleware - generous limits
const uploader = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max
}).single('file');

// Upload handler
const uploadFile = async (req, res) => {
  uploader(req, res, (err) => {
    if (err) {
      console.error('[Upload] Error:', err);
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'הקובץ גדול מדי (מקסימום 50MB)' });
        }
      }
      return res.status(400).json({ error: err.message || 'שגיאה בהעלאת הקובץ' });
    }
    
    if (!req.file) {
      console.error('[Upload] No file received');
      return res.status(400).json({ error: 'לא נבחר קובץ' });
    }
    
    // Build URL using the type determined during upload
    const type = req.uploadType || 'misc';
    const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3000}`;
    const fileUrl = `${baseUrl}/uploads/${type}/${req.file.filename}`;
    
    console.log(`[Upload] File uploaded: ${req.file.filename} (${req.file.size} bytes) type: ${type}`);
    
    res.json({
      success: true,
      url: fileUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
  });
};

module.exports = {
  uploadFile
};
