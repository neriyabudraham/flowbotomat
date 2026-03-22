const pool = require('../../config/database');
const { getWahaCredentialsForConnection } = require('../../services/settings/system.service');
const wahaSession = require('../../services/waha/session.service');
const googleContacts = require('../../services/googleContacts.service');
const googleSheets = require('../../services/googleSheets.service');

/**
 * GET /api/onboarding/:userId/status
 * Returns WhatsApp + Google integrations status for public connect page (no auth)
 */
const getStatus = async (req, res) => {
  try {
    const { userId } = req.params;

    const userResult = await pool.query(
      'SELECT id, name, email FROM users WHERE id = $1 AND is_active = true',
      [userId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // WhatsApp status
    let whatsapp = { connected: false };
    try {
      const connResult = await pool.query(
        `SELECT id, connection_type, session_name, phone_number, display_name, status,
                external_base_url, external_api_key
         FROM whatsapp_connections WHERE user_id = $1`,
        [userId]
      );
      if (connResult.rows.length > 0) {
        const conn = connResult.rows[0];
        try {
          const { baseUrl, apiKey } = await getWahaCredentialsForConnection(conn);
          const wahaStatus = await wahaSession.getSessionStatus(baseUrl, apiKey, conn.session_name);
          const isConnected = wahaStatus.status === 'WORKING';
          whatsapp = {
            connected: isConnected,
            phone_number: conn.phone_number,
            display_name: conn.display_name,
            status: isConnected ? 'connected' : (wahaStatus.status || conn.status),
          };
        } catch (err) {
          whatsapp = {
            connected: conn.status === 'connected',
            phone_number: conn.phone_number,
            display_name: conn.display_name,
            status: conn.status,
          };
        }
      }
    } catch (err) {
      console.error('[Onboarding] WhatsApp status error:', err.message);
    }

    // Google Contacts status
    let googleContactsStatus = { connected: false };
    try {
      googleContactsStatus = await googleContacts.getConnectionStatus(userId);
    } catch (err) {}

    // Google Sheets status
    let googleSheetsStatus = { connected: false };
    try {
      googleSheetsStatus = await googleSheets.getConnectionStatus(userId);
    } catch (err) {}

    res.json({
      user: userResult.rows[0],
      whatsapp,
      googleContacts: googleContactsStatus,
      googleSheets: googleSheetsStatus,
    });
  } catch (error) {
    console.error('[Onboarding] Status error:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
};

/**
 * GET /api/onboarding/:userId/whatsapp/qr
 * Get WhatsApp QR code for public connect page (no auth)
 */
const getWhatsappQR = async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      `SELECT id, connection_type, session_name, external_base_url, external_api_key, waha_source_id, status
       FROM whatsapp_connections WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No WhatsApp connection found' });
    }

    const connection = result.rows[0];
    const { baseUrl, apiKey } = await getWahaCredentialsForConnection(connection);

    try {
      const status = await wahaSession.getSessionStatus(baseUrl, apiKey, connection.session_name);
      if (status.status === 'WORKING') {
        return res.json({ qr: null, status: 'connected' });
      }
      if (status.status === 'STOPPED' || status.status === 'FAILED') {
        await wahaSession.startSession(baseUrl, apiKey, connection.session_name);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (err) {
      console.error('[Onboarding] QR status check error:', err.message);
    }

    const qrData = await wahaSession.getQRCode(baseUrl, apiKey, connection.session_name);
    res.json({ qr: qrData.value, status: 'qr_ready' });
  } catch (error) {
    console.error('[Onboarding] QR error:', error.message);
    res.status(500).json({ error: 'Failed to get QR code' });
  }
};

/**
 * GET /api/onboarding/:userId/google-contacts/url
 * Get Google Contacts OAuth URL for public connect page (no auth)
 */
const getGoogleContactsUrl = async (req, res) => {
  try {
    const { userId } = req.params;
    const userResult = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const url = googleContacts.getAuthUrl(userId, 'onboarding');
    res.json({ url });
  } catch (error) {
    console.error('[Onboarding] Google contacts URL error:', error.message);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
};

/**
 * GET /api/onboarding/:userId/google-sheets/url
 * Get Google Sheets OAuth URL for public connect page (no auth)
 */
const getGoogleSheetsUrl = async (req, res) => {
  try {
    const { userId } = req.params;
    const userResult = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const url = googleSheets.getAuthUrl(userId, 'onboarding');
    res.json({ url });
  } catch (error) {
    console.error('[Onboarding] Google sheets URL error:', error.message);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
};

module.exports = { getStatus, getWhatsappQR, getGoogleContactsUrl, getGoogleSheetsUrl };
