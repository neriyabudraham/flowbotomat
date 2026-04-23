const googleContacts = require('../../services/googleContacts.service');
const db = require('../../config/database');

// Fire-and-forget audit write. Never throws — never breaks the OAuth flow.
async function auditGoogleOAuth({ userId, eventType, fromPath, errorCode, errorDescription, accountEmail, metadata }) {
  try {
    await db.query(
      `INSERT INTO google_oauth_audit
        (user_id, event_type, from_path, error_code, error_description, account_email, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId || null,
        eventType,
        fromPath || null,
        errorCode ? String(errorCode).slice(0, 100) : null,
        errorDescription || null,
        accountEmail || null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
  } catch (e) {
    console.warn('[GoogleContacts] Audit write failed (non-fatal):', e.message);
  }
}

/**
 * GET /api/google-contacts/auth-url
 * Get Google OAuth authorization URL for Contacts
 */
const getAuthUrl = async (req, res) => {
  try {
    const userId = req.user.userId;
    const url = googleContacts.getAuthUrl(userId);
    console.log(`[GoogleContacts] Auth URL requested by user ${userId} (email: ${req.user.email || 'n/a'})`);
    auditGoogleOAuth({ userId, eventType: 'auth_url_requested' });
    res.json({ url });
  } catch (error) {
    console.error('[GoogleContacts] Auth URL error for user', req.user?.userId, ':', error.message);
    auditGoogleOAuth({ userId: req.user?.userId, eventType: 'auth_url_error', errorDescription: error.message });
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
};

/**
 * GET /api/google-contacts/callback
 * Handle OAuth callback from Google
 */
const handleCallback = async (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || 'https://botomat.co.il';

  // Log EVERY callback hit with the full query context so we can diagnose
  // user-reported errors even when they never complete the flow.
  const { code, state, error: googleError, error_description } = req.query;
  console.log(`[GoogleContacts] Callback hit — code=${code ? code.slice(0,20) + '...' : 'MISSING'} state_len=${state?.length || 0} error=${googleError || 'none'} desc=${error_description || ''}`);

  // Google returned an explicit error (access_denied, redirect_uri_mismatch, etc.)
  if (googleError) {
    console.error(`[GoogleContacts] Google OAuth error: ${googleError} - ${error_description || 'no description'}`);
    let userIdFromState = null;
    try { userIdFromState = state ? JSON.parse(state).userId : null; } catch {}
    auditGoogleOAuth({
      userId: userIdFromState,
      eventType: 'callback_google_error',
      errorCode: googleError,
      errorDescription: error_description,
      metadata: { state_present: !!state },
    });
    return res.redirect(`${frontendUrl}/settings?tab=integrations&error=${encodeURIComponent(googleError)}&error_description=${encodeURIComponent(error_description || '')}`);
  }

  try {
    if (!code) {
      console.error(`[GoogleContacts] Callback missing code`);
      return res.redirect(`${frontendUrl}/settings?tab=integrations&error=no_code`);
    }

    let userId, from, slot = 0;
    if (state) {
      try {
        const stateData = JSON.parse(state);
        userId = stateData.userId;
        from = stateData.from;
        slot = stateData.slot ?? 0;
      } catch (e) {
        console.error(`[GoogleContacts] Invalid state JSON:`, e.message, 'raw state:', state);
      }
    }

    if (!userId) {
      console.error(`[GoogleContacts] Callback without userId in state`);
      return res.redirect(`${frontendUrl}/settings?tab=integrations&error=invalid_state`);
    }

    console.log(`[GoogleContacts] Exchanging code for user ${userId} slot ${slot} from=${from}`);
    const result = await googleContacts.handleCallback(code, userId, slot);
    console.log(`[GoogleContacts] ✅ Connected for user ${userId} slot ${slot}: ${result.email}`);
    auditGoogleOAuth({ userId, eventType: 'callback_success', fromPath: from, accountEmail: result.email });

    if (from === 'view-filter') {
      return res.redirect(`${frontendUrl}/view-filter/cleanup/google?google=connected`);
    }
    if (from === 'onboarding' || from === 'status-bot') {
      return res.redirect(`${frontendUrl}/connect/${userId}/integrations?google_contacts=connected`);
    }
    if (from === 'save-contact-bot' || from === '/save-contact-bot') {
      return res.redirect(`${frontendUrl}/save-contact-bot/dashboard?google_contacts=connected`);
    }
    res.redirect(`${frontendUrl}/settings?tab=integrations&google_contacts=connected`);
  } catch (error) {
    console.error('[GoogleContacts] Callback error:', error.message);
    if (error.response) {
      console.error('[GoogleContacts] OAuth response status:', error.response.status);
      console.error('[GoogleContacts] OAuth response data:', JSON.stringify(error.response.data));
    }
    console.error('[GoogleContacts] Callback error stack:', error.stack);
    let userIdFromState = null;
    try { userIdFromState = state ? JSON.parse(state).userId : null; } catch {}
    auditGoogleOAuth({
      userId: userIdFromState,
      eventType: 'callback_exchange_error',
      errorDescription: error.message?.slice(0, 500),
      metadata: {
        response_status: error.response?.status,
        response_data: error.response?.data,
      },
    });
    res.redirect(`${frontendUrl}/settings?tab=integrations&error=google_contacts_failed&reason=${encodeURIComponent(error.message?.slice(0, 120) || 'unknown')}`);
  }
};

/**
 * GET /api/google-contacts/status
 * Get connection status
 */
const getStatus = async (req, res) => {
  try {
    const userId = req.user.userId;
    const status = await googleContacts.getConnectionStatus(userId);
    res.json(status);
  } catch (error) {
    console.error('[GoogleContacts] Status error:', error.message);
    res.status(500).json({ error: 'Failed to get status' });
  }
};

/**
 * POST /api/google-contacts/disconnect
 * Disconnect Google Contacts
 */
const disconnect = async (req, res) => {
  try {
    const userId = req.user.userId;
    await googleContacts.disconnect(userId);
    console.log(`[GoogleContacts] Disconnected for user ${userId}`);
    res.json({ success: true });
  } catch (error) {
    console.error('[GoogleContacts] Disconnect error:', error.message);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
};

/**
 * GET /api/google-contacts/search
 * Search contacts by query
 */
const searchContacts = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { q, pageSize } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query required' });
    }
    
    const contacts = await googleContacts.searchContacts(userId, q, parseInt(pageSize) || 30);
    res.json({ contacts });
  } catch (error) {
    console.error('[GoogleContacts] Search error:', error.message);
    if (error.message === 'Google Contacts not connected') {
      return res.status(401).json({ error: 'not_connected' });
    }
    res.status(500).json({ error: 'Failed to search contacts' });
  }
};

/**
 * GET /api/google-contacts/list
 * List all contacts with pagination
 */
const listContacts = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { pageSize, pageToken } = req.query;
    
    const result = await googleContacts.listContacts(userId, parseInt(pageSize) || 100, pageToken);
    res.json(result);
  } catch (error) {
    console.error('[GoogleContacts] List error:', error.message);
    if (error.message === 'Google Contacts not connected') {
      return res.status(401).json({ error: 'not_connected' });
    }
    res.status(500).json({ error: 'Failed to list contacts' });
  }
};

/**
 * GET /api/google-contacts/find/phone/:phone
 * Find contact by phone number
 */
const findByPhone = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { phone } = req.params;
    
    const contact = await googleContacts.findByPhone(userId, phone);
    res.json({ found: !!contact, contact });
  } catch (error) {
    console.error('[GoogleContacts] Find by phone error:', error.message);
    res.status(500).json({ error: 'Failed to find contact' });
  }
};

/**
 * GET /api/google-contacts/find/email/:email
 * Find contact by email
 */
const findByEmail = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { email } = req.params;
    
    const contact = await googleContacts.findByEmail(userId, email);
    res.json({ found: !!contact, contact });
  } catch (error) {
    console.error('[GoogleContacts] Find by email error:', error.message);
    res.status(500).json({ error: 'Failed to find contact' });
  }
};

/**
 * POST /api/google-contacts/exists
 * Check if contact exists by phone or email
 */
const checkExists = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { identifier, type } = req.body;
    
    if (!identifier) {
      return res.status(400).json({ error: 'Identifier required' });
    }
    
    const result = await googleContacts.exists(userId, identifier, type || 'phone');
    res.json(result);
  } catch (error) {
    console.error('[GoogleContacts] Exists check error:', error.message);
    res.status(500).json({ error: 'Failed to check if contact exists' });
  }
};

/**
 * POST /api/google-contacts/create
 * Create a new contact
 */
const createContact = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, firstName, lastName, phone, email, labelId } = req.body;
    
    if (!phone && !email && !name) {
      return res.status(400).json({ error: 'At least name, phone or email required' });
    }
    
    const contact = await googleContacts.createContact(userId, {
      name, firstName, lastName, phone, email, labelId
    });
    
    res.json({ success: true, contact });
  } catch (error) {
    console.error('[GoogleContacts] Create error:', error.message);
    res.status(500).json({ error: 'Failed to create contact' });
  }
};

/**
 * PUT /api/google-contacts/:resourceName
 * Update an existing contact
 */
const updateContact = async (req, res) => {
  try {
    const userId = req.user.userId;
    const resourceName = req.params[0]; // Capture full path like people/c123
    const { name, firstName, lastName, phone, email } = req.body;
    
    const contact = await googleContacts.updateContact(userId, resourceName, {
      name, firstName, lastName, phone, email
    });
    
    res.json({ success: true, contact });
  } catch (error) {
    console.error('[GoogleContacts] Update error:', error.message);
    res.status(500).json({ error: 'Failed to update contact' });
  }
};

/**
 * DELETE /api/google-contacts/:resourceName
 * Delete a contact
 */
const deleteContact = async (req, res) => {
  try {
    const userId = req.user.userId;
    const resourceName = req.params[0];
    
    await googleContacts.deleteContact(userId, resourceName);
    res.json({ success: true });
  } catch (error) {
    console.error('[GoogleContacts] Delete error:', error.message);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
};

/**
 * POST /api/google-contacts/find-or-create
 * Find contact by phone or create if not exists
 */
const findOrCreate = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { phone, name, firstName, lastName, email, labelId } = req.body;
    
    if (!phone) {
      return res.status(400).json({ error: 'Phone required' });
    }
    
    const result = await googleContacts.findOrCreate(userId, phone, {
      name, firstName, lastName, email, labelId
    });
    
    res.json(result);
  } catch (error) {
    console.error('[GoogleContacts] Find or create error:', error.message);
    res.status(500).json({ error: 'Failed to find or create contact' });
  }
};

// ===================== LABELS ENDPOINTS =====================

/**
 * GET /api/google-contacts/labels
 * List all contact labels/groups
 */
const listLabels = async (req, res) => {
  try {
    const userId = req.user.userId;
    const labels = await googleContacts.listLabels(userId);
    res.json({ labels });
  } catch (error) {
    console.error('[GoogleContacts] List labels error:', error.message);
    if (error.message === 'Google Contacts not connected') {
      return res.status(401).json({ error: 'not_connected' });
    }
    res.status(500).json({ error: 'Failed to list labels' });
  }
};

/**
 * POST /api/google-contacts/labels
 * Create a new label
 */
const createLabel = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Label name required' });
    }
    
    const label = await googleContacts.createLabel(userId, name);
    res.json({ success: true, label });
  } catch (error) {
    console.error('[GoogleContacts] Create label error:', error.message);
    res.status(500).json({ error: 'Failed to create label' });
  }
};

/**
 * POST /api/google-contacts/labels/:labelId/add
 * Add contact to a label
 */
const addToLabel = async (req, res) => {
  try {
    const userId = req.user.userId;
    const labelResourceName = req.params[0]; // e.g., contactGroups/abc
    const { contactResourceName } = req.body;
    
    if (!contactResourceName) {
      return res.status(400).json({ error: 'Contact resource name required' });
    }
    
    await googleContacts.addToLabel(userId, contactResourceName, labelResourceName);
    res.json({ success: true });
  } catch (error) {
    console.error('[GoogleContacts] Add to label error:', error.message);
    res.status(500).json({ error: 'Failed to add contact to label' });
  }
};

/**
 * POST /api/google-contacts/labels/:labelId/remove
 * Remove contact from a label
 */
const removeFromLabel = async (req, res) => {
  try {
    const userId = req.user.userId;
    const labelResourceName = req.params[0];
    const { contactResourceName } = req.body;
    
    if (!contactResourceName) {
      return res.status(400).json({ error: 'Contact resource name required' });
    }
    
    await googleContacts.removeFromLabel(userId, contactResourceName, labelResourceName);
    res.json({ success: true });
  } catch (error) {
    console.error('[GoogleContacts] Remove from label error:', error.message);
    res.status(500).json({ error: 'Failed to remove contact from label' });
  }
};

/**
 * GET /api/google-contacts/labels/:labelId/contacts
 * Get all contacts in a label
 */
const getContactsInLabel = async (req, res) => {
  try {
    const userId = req.user.userId;
    const labelResourceName = req.params[0];
    
    const contacts = await googleContacts.getContactsInLabel(userId, labelResourceName);
    res.json({ contacts });
  } catch (error) {
    console.error('[GoogleContacts] Get contacts in label error:', error.message);
    res.status(500).json({ error: 'Failed to get contacts in label' });
  }
};

module.exports = {
  getAuthUrl,
  handleCallback,
  listAccounts: async (req, res) => {
    try {
      const slots = await googleContacts.listConnectedSlots(req.user.id);
      res.json({ accounts: slots, count: slots.length });
    } catch (e) {
      console.error('[GoogleContacts] listAccounts error:', e);
      res.status(500).json({ error: 'שגיאה בטעינת חשבונות' });
    }
  },
  setPrimary: async (req, res) => {
    try {
      const slot = Number(req.params.slot);
      if (!Number.isFinite(slot)) return res.status(400).json({ error: 'slot לא תקין' });
      await googleContacts.setPrimarySlot(req.user.id, slot);
      res.json({ ok: true });
    } catch (e) {
      console.error('[GoogleContacts] setPrimary error:', e);
      res.status(500).json({ error: e.message });
    }
  },
  disconnectSlot: async (req, res) => {
    try {
      const slot = Number(req.params.slot);
      if (!Number.isFinite(slot)) return res.status(400).json({ error: 'slot לא תקין' });
      await googleContacts.disconnectSlot(req.user.id, slot);
      res.json({ ok: true });
    } catch (e) {
      console.error('[GoogleContacts] disconnectSlot error:', e);
      res.status(500).json({ error: e.message });
    }
  },
  getNextAuthUrl: async (req, res) => {
    try {
      const requested = Number(req.query.slot);
      let slot;
      if (Number.isFinite(requested) && requested >= 0) {
        slot = requested;
      } else {
        const slots = await googleContacts.listConnectedSlots(req.user.id);
        const used = new Set(slots.map((s) => s.slot));
        slot = 0;
        while (used.has(slot)) slot += 1;
      }
      const url = googleContacts.getAuthUrl(req.user.id, req.query.from || null, slot);
      res.json({ url, slot });
    } catch (e) {
      console.error('[GoogleContacts] getNextAuthUrl error:', e);
      res.status(500).json({ error: e.message });
    }
  },
  getStatus,
  disconnect,
  searchContacts,
  listContacts,
  findByPhone,
  findByEmail,
  checkExists,
  createContact,
  updateContact,
  deleteContact,
  findOrCreate,
  listLabels,
  createLabel,
  addToLabel,
  removeFromLabel,
  getContactsInLabel,
};
