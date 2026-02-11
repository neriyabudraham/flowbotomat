const googleContacts = require('../../services/googleContacts.service');

/**
 * GET /api/google-contacts/auth-url
 * Get Google OAuth authorization URL for Contacts
 */
const getAuthUrl = async (req, res) => {
  try {
    const userId = req.user.userId;
    const url = googleContacts.getAuthUrl(userId);
    res.json({ url });
  } catch (error) {
    console.error('[GoogleContacts] Auth URL error:', error.message);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
};

/**
 * GET /api/google-contacts/callback
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
    
    const result = await googleContacts.handleCallback(code, userId);
    console.log(`[GoogleContacts] Connected for user ${userId}: ${result.email}`);
    
    res.redirect(`${frontendUrl}/settings?tab=integrations&google_contacts=connected`);
  } catch (error) {
    console.error('[GoogleContacts] Callback error:', error.message);
    res.redirect(`${frontendUrl}/settings?tab=integrations&error=google_contacts_failed`);
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
