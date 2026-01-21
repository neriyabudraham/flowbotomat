const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = req.body.type || 'misc';
    const typeDir = path.join(uploadsDir, type);
    if (!fs.existsSync(typeDir)) {
      fs.mkdirSync(typeDir, { recursive: true });
    }
    cb(null, typeDir);
  },
  filename: (req, file, cb) => {
    const uniqueId = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${uniqueId}${ext}`);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = {
    'video': ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'],
    'image': ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    'audio': ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm'],
    'document': ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  };
  
  const type = req.body.type || 'misc';
  const allowed = allowedTypes[type] || [];
  
  if (type === 'misc' || allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`סוג קובץ לא נתמך: ${file.mimetype}`), false);
  }
};

// Size limits per type
const getLimits = (type) => {
  const limits = {
    'video': 16 * 1024 * 1024,  // 16MB
    'image': 5 * 1024 * 1024,   // 5MB
    'audio': 10 * 1024 * 1024,  // 10MB
    'document': 25 * 1024 * 1024 // 25MB
  };
  return { fileSize: limits[type] || 25 * 1024 * 1024 };
};

// Create multer upload middleware
const createUploader = (type) => {
  return multer({
    storage,
    fileFilter,
    limits: getLimits(type)
  }).single('file');
};

// Upload handler
const uploadFile = async (req, res) => {
  const type = req.body.type || 'misc';
  const uploader = createUploader(type);
  
  uploader(req, res, (err) => {
    if (err) {
      console.error('[Upload] Error:', err);
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'הקובץ גדול מדי' });
        }
      }
      return res.status(400).json({ error: err.message || 'שגיאה בהעלאת הקובץ' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'לא נבחר קובץ' });
    }
    
    // Build URL
    const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3000}`;
    const fileUrl = `${baseUrl}/uploads/${type}/${req.file.filename}`;
    
    console.log(`[Upload] File uploaded: ${req.file.filename} (${req.file.size} bytes)`);
    
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
