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

    let sessionStatus;
    try {
      sessionStatus = await wahaSession.getSessionStatus(baseUrl, apiKey, connection.session_name);
    } catch (err) {
      // Session might not exist on this server — try to heal
      console.log('[Onboarding] Session not found, attempting heal for:', connection.session_name);
      try {
        const { healWahaConnectionByUserId } = require('../../services/waha/heal.service');
        const healed = await healWahaConnectionByUserId(userId);
        if (healed) {
          const freshCreds = await getWahaCredentialsForConnection({ ...connection, waha_source_id: healed.sourceId || connection.waha_source_id });
          try {
            sessionStatus = await wahaSession.getSessionStatus(freshCreds.baseUrl || baseUrl, freshCreds.apiKey || apiKey, healed.sessionName || connection.session_name);
          } catch { /* will be handled below */ }
        }
      } catch (healErr) {
        console.error('[Onboarding] Heal failed:', healErr.message);
      }
    }

    if (sessionStatus) {
      if (sessionStatus.status === 'WORKING') {
        return res.json({ qr: null, status: 'connected' });
      }
      if (sessionStatus.status === 'STARTING' || sessionStatus.status === 'SCAN_QR_CODE') {
        // Session is starting up — tell frontend to retry shortly
        try {
          const qrData = await wahaSession.getQRCode(baseUrl, apiKey, connection.session_name);
          return res.json({ qr: qrData.value, status: 'qr_ready' });
        } catch {
          return res.json({ qr: null, status: 'starting', message: 'Session is starting, please wait...' });
        }
      }
      if (sessionStatus.status === 'STOPPED' || sessionStatus.status === 'FAILED') {
        try {
          await wahaSession.startSession(baseUrl, apiKey, connection.session_name);
        } catch (startErr) {
          console.error('[Onboarding] Failed to start session:', startErr.message);
        }
        return res.json({ qr: null, status: 'starting', message: 'Restarting session, please wait...' });
      }
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

/**
 * POST /api/onboarding/:userId/whatsapp/request-code
 * Request pairing code for public connect page (no auth)
 */
const requestWhatsappCode = async (req, res) => {
  try {
    const { userId } = req.params;
    let { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'נדרש מספר טלפון' });
    }

    // Format phone number
    let clean = phoneNumber.replace(/\D/g, '');
    if (clean.startsWith('0')) {
      clean = '972' + clean.substring(1);
    } else if (!clean.startsWith('972') && clean.length === 9) {
      clean = '972' + clean;
    }
    phoneNumber = clean;

    const result = await pool.query(
      `SELECT id, connection_type, session_name, external_base_url, external_api_key, waha_source_id
       FROM whatsapp_connections WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No WhatsApp connection found' });
    }

    const connection = result.rows[0];
    const { baseUrl, apiKey } = await getWahaCredentialsForConnection(connection);

    // Check/start session if needed
    try {
      const status = await wahaSession.getSessionStatus(baseUrl, apiKey, connection.session_name);
      if (status.status === 'WORKING') {
        return res.json({ success: false, message: 'כבר מחובר' });
      }
      if (status.status === 'STOPPED' || status.status === 'FAILED') {
        await wahaSession.startSession(baseUrl, apiKey, connection.session_name);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (err) {
      console.error('[Onboarding] Code auth status check error:', err.message);
    }

    const codeData = await wahaSession.requestPairingCode(
      baseUrl, apiKey, connection.session_name, phoneNumber
    );

    console.log(`[Onboarding] Pairing code requested for ${phoneNumber}`);

    res.json({
      success: true,
      code: codeData.code,
    });
  } catch (error) {
    console.error('[Onboarding] Request code error:', error.message);
    res.status(500).json({ error: 'שגיאה בשליחת קוד - וודא שהמספר נכון' });
  }
};

module.exports = { getStatus, getWhatsappQR, getGoogleContactsUrl, getGoogleSheetsUrl, requestWhatsappCode };
