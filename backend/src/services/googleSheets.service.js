const db = require('../config/database');
const { encrypt, decrypt } = require('./crypto/encrypt.service');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.readonly'];

// Lazy-load googleapis to prevent server crash if package not yet installed
let _google = null;
function getGoogle() {
  if (!_google) {
    try {
      _google = require('googleapis').google;
    } catch (err) {
      throw new Error('googleapis package is not installed. Run: npm install googleapis');
    }
  }
  return _google;
}

/**
 * Create OAuth2 client
 */
function createOAuth2Client() {
  const google = getGoogle();
  const frontendUrl = process.env.FRONTEND_URL || 'https://flow.botomat.co.il';
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${frontendUrl}/api/google-sheets/callback`
  );
}

/**
 * Get authorization URL for Google Sheets
 */
function getAuthUrl(userId) {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state: JSON.stringify({ userId }),
  });
}

/**
 * Exchange authorization code for tokens and store them
 */
async function handleCallback(code, userId) {
  const google = getGoogle();
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  
  // Get user email for display
  oauth2Client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const { data: userInfo } = await oauth2.userinfo.get();
  
  // Encrypt tokens
  const encryptedAccess = encrypt(tokens.access_token);
  const encryptedRefresh = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;
  
  // Store in database
  await db.query(`
    INSERT INTO user_integrations (user_id, integration_type, access_token, refresh_token, token_expiry, account_email, account_name, status)
    VALUES ($1, 'google_sheets', $2, $3, $4, $5, $6, 'connected')
    ON CONFLICT (user_id, integration_type) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      refresh_token = COALESCE(EXCLUDED.refresh_token, user_integrations.refresh_token),
      token_expiry = EXCLUDED.token_expiry,
      account_email = EXCLUDED.account_email,
      account_name = EXCLUDED.account_name,
      status = 'connected',
      updated_at = NOW()
  `, [
    userId,
    encryptedAccess,
    encryptedRefresh,
    tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    userInfo.email,
    userInfo.name
  ]);
  
  return { email: userInfo.email, name: userInfo.name };
}

/**
 * Get authenticated Google Sheets client for a user
 */
async function getAuthenticatedClient(userId) {
  const result = await db.query(
    `SELECT * FROM user_integrations WHERE user_id = $1 AND integration_type = 'google_sheets' AND status = 'connected'`,
    [userId]
  );
  
  if (result.rows.length === 0) {
    throw new Error('Google Sheets not connected');
  }
  
  const integration = result.rows[0];
  const oauth2Client = createOAuth2Client();
  
  const accessToken = decrypt(integration.access_token);
  const refreshToken = integration.refresh_token ? decrypt(integration.refresh_token) : null;
  
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: integration.token_expiry ? new Date(integration.token_expiry).getTime() : null,
  });
  
  // Handle token refresh
  oauth2Client.on('tokens', async (tokens) => {
    try {
      const updates = {};
      if (tokens.access_token) updates.access_token = encrypt(tokens.access_token);
      if (tokens.refresh_token) updates.refresh_token = encrypt(tokens.refresh_token);
      if (tokens.expiry_date) updates.token_expiry = new Date(tokens.expiry_date);
      
      const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(', ');
      await db.query(
        `UPDATE user_integrations SET ${setClauses}, updated_at = NOW() WHERE user_id = $1 AND integration_type = 'google_sheets'`,
        [userId, ...Object.values(updates)]
      );
      console.log('[GoogleSheets] Tokens refreshed for user:', userId);
    } catch (err) {
      console.error('[GoogleSheets] Token refresh save error:', err.message);
    }
  });
  
  return oauth2Client;
}

/**
 * Get connection status
 */
async function getConnectionStatus(userId) {
  const result = await db.query(
    `SELECT status, account_email, account_name, updated_at FROM user_integrations 
     WHERE user_id = $1 AND integration_type = 'google_sheets'`,
    [userId]
  );
  
  if (result.rows.length === 0) {
    return { connected: false };
  }
  
  const row = result.rows[0];
  return {
    connected: row.status === 'connected',
    email: row.account_email,
    name: row.account_name,
    updatedAt: row.updated_at,
  };
}

/**
 * Disconnect Google Sheets
 */
async function disconnect(userId) {
  try {
    const client = await getAuthenticatedClient(userId);
    await client.revokeCredentials();
  } catch (err) {
    // Ignore revoke errors
  }
  
  await db.query(
    `UPDATE user_integrations SET status = 'disconnected', updated_at = NOW() 
     WHERE user_id = $1 AND integration_type = 'google_sheets'`,
    [userId]
  );
}

// ===================== SHEETS OPERATIONS =====================

/**
 * List user's spreadsheets
 */
async function listSpreadsheets(userId) {
  const google = getGoogle();
  const auth = await getAuthenticatedClient(userId);
  const drive = google.drive({ version: 'v3', auth });
  
  const response = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    fields: 'files(id, name, modifiedTime)',
    orderBy: 'modifiedTime desc',
    pageSize: 50,
  });
  
  return response.data.files || [];
}

/**
 * Get spreadsheet metadata (sheets/tabs info)
 */
async function getSpreadsheetInfo(userId, spreadsheetId) {
  const google = getGoogle();
  const auth = await getAuthenticatedClient(userId);
  const sheets = google.sheets({ version: 'v4', auth });
  
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties',
  });
  
  return (response.data.sheets || []).map(s => ({
    sheetId: s.properties.sheetId,
    title: s.properties.title,
    index: s.properties.index,
  }));
}

/**
 * Get column headers (first row) of a sheet
 */
async function getHeaders(userId, spreadsheetId, sheetName) {
  const google = getGoogle();
  const auth = await getAuthenticatedClient(userId);
  const sheets = google.sheets({ version: 'v4', auth });
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!1:1`,
  });
  
  return response.data.values?.[0] || [];
}

/**
 * Read rows from a sheet
 */
async function readRows(userId, spreadsheetId, sheetName, range = null) {
  const google = getGoogle();
  const auth = await getAuthenticatedClient(userId);
  const sheets = google.sheets({ version: 'v4', auth });
  
  const fullRange = range || `'${sheetName}'`;
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: fullRange,
  });
  
  const rows = response.data.values || [];
  if (rows.length === 0) return { headers: [], rows: [] };
  
  const headers = rows[0];
  const dataRows = rows.slice(1).map((row, index) => {
    const obj = { _rowIndex: index + 2 }; // 1-indexed + 1 for header
    headers.forEach((h, i) => {
      obj[h] = row[i] || '';
    });
    return obj;
  });
  
  return { headers, rows: dataRows };
}

/**
 * Search for rows matching a condition
 */
async function searchRows(userId, spreadsheetId, sheetName, column, operator, value) {
  const { headers, rows } = await readRows(userId, spreadsheetId, sheetName);
  
  const filtered = rows.filter(row => {
    const cellValue = String(row[column] || '').toLowerCase();
    const searchValue = String(value).toLowerCase();
    
    switch (operator) {
      case 'equals': return cellValue === searchValue;
      case 'contains': return cellValue.includes(searchValue);
      case 'starts_with': return cellValue.startsWith(searchValue);
      case 'ends_with': return cellValue.endsWith(searchValue);
      case 'not_equals': return cellValue !== searchValue;
      case 'not_empty': return cellValue.trim() !== '';
      case 'is_empty': return cellValue.trim() === '';
      default: return cellValue === searchValue;
    }
  });
  
  return { headers, rows: filtered, totalMatches: filtered.length };
}

/**
 * Append a row to a sheet
 */
async function appendRow(userId, spreadsheetId, sheetName, values) {
  const google = getGoogle();
  const auth = await getAuthenticatedClient(userId);
  const sheets = google.sheets({ version: 'v4', auth });
  
  // values is an object { "Column Name": "value", ... }
  // Get headers to know column order
  const headers = await getHeaders(userId, spreadsheetId, sheetName);
  
  // Build row array in header order
  const rowData = headers.map(h => values[h] || '');
  
  const response = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${sheetName}'!A:A`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [rowData],
    },
  });
  
  return {
    updatedRange: response.data.updates?.updatedRange,
    updatedRows: response.data.updates?.updatedRows,
  };
}

/**
 * Update a specific row
 */
async function updateRow(userId, spreadsheetId, sheetName, rowIndex, values) {
  const google = getGoogle();
  const auth = await getAuthenticatedClient(userId);
  const sheets = google.sheets({ version: 'v4', auth });
  
  // Get headers
  const headers = await getHeaders(userId, spreadsheetId, sheetName);
  
  // Build row array in header order
  const rowData = headers.map(h => values[h] !== undefined ? values[h] : '');
  
  const response = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetName}'!A${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [rowData],
    },
  });
  
  return {
    updatedRange: response.data.updatedRange,
    updatedRows: response.data.updatedRows,
  };
}

/**
 * Update specific cells in a row (partial update)
 */
async function updateCells(userId, spreadsheetId, sheetName, rowIndex, columnValues) {
  const google = getGoogle();
  const auth = await getAuthenticatedClient(userId);
  const sheets = google.sheets({ version: 'v4', auth });
  
  // Get headers to find column letters
  const headers = await getHeaders(userId, spreadsheetId, sheetName);
  
  const data = [];
  for (const [colName, value] of Object.entries(columnValues)) {
    const colIndex = headers.indexOf(colName);
    if (colIndex >= 0) {
      const colLetter = String.fromCharCode(65 + colIndex); // A=0, B=1, ...
      data.push({
        range: `'${sheetName}'!${colLetter}${rowIndex}`,
        values: [[value]],
      });
    }
  }
  
  if (data.length === 0) return { updated: 0 };
  
  const response = await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data,
    },
  });
  
  return {
    updated: response.data.totalUpdatedCells,
  };
}

/**
 * Search and update: find first matching row and update it
 */
async function searchAndUpdate(userId, spreadsheetId, sheetName, searchColumn, searchValue, updateValues) {
  const { rows } = await searchRows(userId, spreadsheetId, sheetName, searchColumn, 'equals', searchValue);
  
  if (rows.length === 0) {
    return { found: false, updated: 0 };
  }
  
  const rowIndex = rows[0]._rowIndex;
  const result = await updateCells(userId, spreadsheetId, sheetName, rowIndex, updateValues);
  
  return { found: true, rowIndex, ...result };
}

/**
 * Search or append: find a matching row and update it, or append if not found
 */
async function searchOrAppend(userId, spreadsheetId, sheetName, searchColumn, searchValue, values) {
  const { rows } = await searchRows(userId, spreadsheetId, sheetName, searchColumn, 'equals', searchValue);
  
  if (rows.length > 0) {
    const rowIndex = rows[0]._rowIndex;
    const result = await updateCells(userId, spreadsheetId, sheetName, rowIndex, values);
    return { action: 'updated', rowIndex, ...result };
  }
  
  const result = await appendRow(userId, spreadsheetId, sheetName, values);
  return { action: 'appended', ...result };
}

// ===================== DB MIGRATION =====================

/**
 * Ensure user_integrations table exists
 */
async function ensureTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_integrations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        integration_type VARCHAR(50) NOT NULL,
        access_token TEXT,
        refresh_token TEXT,
        token_expiry TIMESTAMP WITH TIME ZONE,
        account_email VARCHAR(255),
        account_name VARCHAR(255),
        status VARCHAR(20) DEFAULT 'disconnected',
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(user_id, integration_type)
      )
    `);
  } catch (err) {
    // Table likely already exists
  }
}

// Run migration on import
ensureTable();

module.exports = {
  getAuthUrl,
  handleCallback,
  getConnectionStatus,
  disconnect,
  listSpreadsheets,
  getSpreadsheetInfo,
  getHeaders,
  readRows,
  searchRows,
  appendRow,
  updateRow,
  updateCells,
  searchAndUpdate,
  searchOrAppend,
  getAuthenticatedClient,
};
