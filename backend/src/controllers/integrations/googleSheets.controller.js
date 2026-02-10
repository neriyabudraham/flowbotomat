const googleSheets = require('../../services/googleSheets.service');

/**
 * GET /api/google-sheets/auth-url
 * Get Google OAuth authorization URL
 */
const getAuthUrl = async (req, res) => {
  try {
    const userId = req.user.userId;
    const url = googleSheets.getAuthUrl(userId);
    res.json({ url });
  } catch (error) {
    console.error('[GoogleSheets] Auth URL error:', error.message);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
};

/**
 * GET /api/google-sheets/callback
 * Handle OAuth callback from Google
 */
const handleCallback = async (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || 'https://botomat.co.il';
  
  try {
    const { code, state } = req.query;
    
    if (!code) {
      return res.redirect(`${frontendUrl}/settings?tab=integrations&error=no_code`);
    }
    
    let userId;
    if (state) {
      try {
        const stateData = JSON.parse(state);
        userId = stateData.userId;
      } catch (e) {}
    }
    
    if (!userId) {
      return res.redirect(`${frontendUrl}/settings?tab=integrations&error=invalid_state`);
    }
    
    const result = await googleSheets.handleCallback(code, userId);
    console.log(`[GoogleSheets] Connected for user ${userId}: ${result.email}`);
    
    res.redirect(`${frontendUrl}/settings?tab=integrations&google_sheets=connected`);
  } catch (error) {
    console.error('[GoogleSheets] Callback error:', error.message);
    res.redirect(`${frontendUrl}/settings?tab=integrations&error=google_sheets_failed`);
  }
};

/**
 * GET /api/google-sheets/status
 * Get connection status
 */
const getStatus = async (req, res) => {
  try {
    const userId = req.user.userId;
    const status = await googleSheets.getConnectionStatus(userId);
    res.json(status);
  } catch (error) {
    console.error('[GoogleSheets] Status error:', error.message);
    res.status(500).json({ error: 'Failed to get status' });
  }
};

/**
 * POST /api/google-sheets/disconnect
 * Disconnect Google Sheets
 */
const disconnect = async (req, res) => {
  try {
    const userId = req.user.userId;
    await googleSheets.disconnect(userId);
    console.log(`[GoogleSheets] Disconnected for user ${userId}`);
    res.json({ success: true });
  } catch (error) {
    console.error('[GoogleSheets] Disconnect error:', error.message);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
};

/**
 * GET /api/google-sheets/spreadsheets
 * List user's spreadsheets
 */
const listSpreadsheets = async (req, res) => {
  try {
    const userId = req.user.userId;
    const files = await googleSheets.listSpreadsheets(userId);
    res.json({ spreadsheets: files });
  } catch (error) {
    console.error('[GoogleSheets] List spreadsheets error:', error.message);
    if (error.message === 'Google Sheets not connected') {
      return res.status(401).json({ error: 'not_connected' });
    }
    res.status(500).json({ error: 'Failed to list spreadsheets' });
  }
};

/**
 * GET /api/google-sheets/spreadsheets/:id/sheets
 * Get sheet tabs of a spreadsheet
 */
const getSheets = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const sheetsList = await googleSheets.getSpreadsheetInfo(userId, id);
    res.json({ sheets: sheetsList });
  } catch (error) {
    console.error('[GoogleSheets] Get sheets error:', error.message);
    res.status(500).json({ error: 'Failed to get sheets' });
  }
};

/**
 * GET /api/google-sheets/spreadsheets/:id/headers
 * Get column headers of a sheet
 */
const getHeaders = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { sheet } = req.query;
    
    if (!sheet) {
      return res.status(400).json({ error: 'Sheet name required' });
    }
    
    const headers = await googleSheets.getHeaders(userId, id, sheet);
    res.json({ headers });
  } catch (error) {
    console.error('[GoogleSheets] Get headers error:', error.message);
    res.status(500).json({ error: 'Failed to get headers' });
  }
};

/**
 * POST /api/google-sheets/spreadsheets/:id/read
 * Read rows from a sheet
 */
const readRows = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { sheet, range } = req.body;
    
    const data = await googleSheets.readRows(userId, id, sheet, range);
    res.json(data);
  } catch (error) {
    console.error('[GoogleSheets] Read rows error:', error.message);
    res.status(500).json({ error: 'Failed to read rows' });
  }
};

/**
 * POST /api/google-sheets/spreadsheets/:id/search
 * Search rows in a sheet
 */
const searchRows = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { sheet, column, operator, value } = req.body;
    
    const data = await googleSheets.searchRows(userId, id, sheet, column, operator, value);
    res.json(data);
  } catch (error) {
    console.error('[GoogleSheets] Search rows error:', error.message);
    res.status(500).json({ error: 'Failed to search rows' });
  }
};

/**
 * POST /api/google-sheets/spreadsheets/:id/append
 * Append a row to a sheet
 */
const appendRow = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { sheet, values } = req.body;
    
    const result = await googleSheets.appendRow(userId, id, sheet, values);
    res.json(result);
  } catch (error) {
    console.error('[GoogleSheets] Append row error:', error.message);
    res.status(500).json({ error: 'Failed to append row' });
  }
};

/**
 * POST /api/google-sheets/spreadsheets/:id/update
 * Update a row in a sheet
 */
const updateRow = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { sheet, rowIndex, values } = req.body;
    
    const result = await googleSheets.updateRow(userId, id, sheet, rowIndex, values);
    res.json(result);
  } catch (error) {
    console.error('[GoogleSheets] Update row error:', error.message);
    res.status(500).json({ error: 'Failed to update row' });
  }
};

/**
 * POST /api/google-sheets/spreadsheets/:id/search-and-update
 * Search for a row and update it
 */
const searchAndUpdate = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { sheet, searchColumn, searchValue, updateValues } = req.body;
    
    const result = await googleSheets.searchAndUpdate(userId, id, sheet, searchColumn, searchValue, updateValues);
    res.json(result);
  } catch (error) {
    console.error('[GoogleSheets] Search and update error:', error.message);
    res.status(500).json({ error: 'Failed to search and update' });
  }
};

/**
 * POST /api/google-sheets/spreadsheets/:id/search-or-append
 * Search for a row and update or append
 */
const searchOrAppend = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { sheet, searchColumn, searchValue, values } = req.body;
    
    const result = await googleSheets.searchOrAppend(userId, id, sheet, searchColumn, searchValue, values);
    res.json(result);
  } catch (error) {
    console.error('[GoogleSheets] Search or append error:', error.message);
    res.status(500).json({ error: 'Failed to search or append' });
  }
};

module.exports = {
  getAuthUrl,
  handleCallback,
  getStatus,
  disconnect,
  listSpreadsheets,
  getSheets,
  getHeaders,
  readRows,
  searchRows,
  appendRow,
  updateRow,
  searchAndUpdate,
  searchOrAppend,
};
