const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY = process.env.ENCRYPTION_KEY || 'default-key-change-in-production!';

// Ensure key is 32 bytes
const getKey = () => {
  return crypto.createHash('sha256').update(KEY).digest();
};

/**
 * Encrypt a string
 */
function encrypt(text) {
  if (!text) return null;
  
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a string
 */
function decrypt(encryptedText) {
  if (!encryptedText) return null;

  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error(`שגיאת פענוח: פורמט לא תקין (${parts.length} חלקים במקום 3) — ייתכן שהנתונים הוצפנו עם מפתח אחר`);
  }

  const [ivHex, authTagHex, encrypted] = parts;

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);

  decipher.setAuthTag(authTag);

  try {
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    throw new Error(`שגיאת פענוח AES-GCM: ${err.message} — ייתכן שה-ENCRYPTION_KEY שונה מזה שבו הוצפנו הנתונים`);
  }
}

module.exports = { encrypt, decrypt };
