const db = require('../../config/database');

// Ensure legal_pages table exists
async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS legal_pages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug VARCHAR(100) UNIQUE NOT NULL,
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      updated_by UUID REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

// Public: Get a legal page by slug
async function getLegalPage(req, res) {
  try {
    await ensureTable();
    const { slug } = req.params;
    const result = await db.query(
      'SELECT slug, title, content, updated_at FROM legal_pages WHERE slug = $1',
      [slug]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'דף לא נמצא' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('[Legal] Get page error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת הדף' });
  }
}

// Admin: Get all legal pages
async function getAllLegalPages(req, res) {
  try {
    await ensureTable();
    const result = await db.query(
      'SELECT slug, title, content, updated_at FROM legal_pages ORDER BY created_at ASC'
    );
    res.json({ pages: result.rows });
  } catch (error) {
    console.error('[Legal] Get all pages error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת דפים' });
  }
}

// Admin: Update or create a legal page
async function updateLegalPage(req, res) {
  try {
    await ensureTable();
    const { slug } = req.params;
    const { title, content } = req.body;
    const userId = req.user.id;

    if (!content && content !== '') {
      return res.status(400).json({ error: 'נדרש תוכן' });
    }

    const existing = await db.query('SELECT id FROM legal_pages WHERE slug = $1', [slug]);

    if (existing.rows.length > 0) {
      await db.query(`
        UPDATE legal_pages SET content = $1, title = COALESCE($2, title), updated_by = $3, updated_at = NOW()
        WHERE slug = $4
      `, [content, title, userId, slug]);
    } else {
      await db.query(`
        INSERT INTO legal_pages (slug, title, content, updated_by)
        VALUES ($1, $2, $3, $4)
      `, [slug, title || slug, content, userId]);
    }

    res.json({ success: true, message: 'הדף עודכן בהצלחה' });
  } catch (error) {
    console.error('[Legal] Update page error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון הדף' });
  }
}

module.exports = {
  getLegalPage,
  getAllLegalPages,
  updateLegalPage,
};
