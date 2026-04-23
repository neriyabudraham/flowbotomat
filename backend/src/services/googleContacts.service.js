const db = require('../config/database');
const { encrypt, decrypt } = require('./crypto/encrypt.service');

const SCOPES = [
  'https://www.googleapis.com/auth/contacts',
  'https://www.googleapis.com/auth/contacts.other.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

// Lazy-load googleapis
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
 * Create OAuth2 client for Google Contacts
 */
function createOAuth2Client() {
  const google = getGoogle();
  const frontendUrl = process.env.FRONTEND_URL || 'https://botomat.co.il';
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${frontendUrl}/api/google-contacts/callback`
  );
}

/**
 * Get authorization URL for Google Contacts
 */
function getAuthUrl(userId, from = null, slot = 0) {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state: JSON.stringify({ userId, slot, ...(from && { from }) }),
  });
}

/**
 * Exchange authorization code for tokens and store them
 */
async function handleCallback(code, userId, slot = 0) {
  const axios = require('axios');
  const oauth2Client = createOAuth2Client();

  console.log('[GoogleContacts] Exchanging code for tokens...');
  const { tokens } = await oauth2Client.getToken(code);
  console.log('[GoogleContacts] Token exchange success.');

  // Get user email for display
  let userInfo = { email: null, name: null };
  try {
    const userInfoRes = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    userInfo = userInfoRes.data;
    console.log('[GoogleContacts] Got user info:', userInfo.email);
  } catch (infoErr) {
    console.warn('[GoogleContacts] Could not get user info (non-fatal):', infoErr.message);
  }

  // Dedupe by email: if the same account is already connected to another slot
  // for this user, refresh that slot's tokens instead of creating a duplicate.
  if (userInfo.email) {
    const existing = await db.query(
      `SELECT slot FROM user_integrations
        WHERE user_id = $1 AND integration_type = 'google_contacts' AND LOWER(account_email) = LOWER($2)
        ORDER BY slot ASC LIMIT 1`,
      [userId, userInfo.email]
    );
    if (existing.rows.length > 0) {
      slot = existing.rows[0].slot;
      console.log(`[GoogleContacts] email ${userInfo.email} already connected at slot ${slot} — refreshing tokens there instead of adding a duplicate`);
    }
  }

  // Encrypt tokens
  const encryptedAccess = encrypt(tokens.access_token);
  const encryptedRefresh = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;

  // Store in database (slot-aware)
  await db.query(`
    INSERT INTO user_integrations (user_id, integration_type, slot, access_token, refresh_token, token_expiry, account_email, account_name, status)
    VALUES ($1, 'google_contacts', $7, $2, $3, $4, $5, $6, 'connected')
    ON CONFLICT (user_id, integration_type, slot) DO UPDATE SET
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
    userInfo.name,
    slot,
  ]);

  return { email: userInfo.email, name: userInfo.name, slot };
}

/**
 * Disconnect a specific slot (remove an account).
 */
async function disconnectSlot(userId, slot) {
  try {
    const integ = await db.query(
      `SELECT access_token, refresh_token FROM user_integrations
        WHERE user_id = $1 AND integration_type = 'google_contacts' AND slot = $2`,
      [userId, slot]
    );
    if (integ.rows.length > 0) {
      try {
        const client = await getAuthenticatedClientBySlot(userId, slot);
        await client.revokeCredentials();
      } catch { /* non-fatal */ }
    }
  } catch { /* non-fatal */ }
  await db.query(
    `DELETE FROM user_integrations WHERE user_id = $1 AND integration_type = 'google_contacts' AND slot = $2`,
    [userId, slot]
  );
}

/**
 * Swap slots — promote a given slot to primary (slot 0).
 */
async function setPrimarySlot(userId, slot) {
  if (slot === 0) return;
  // Use a free temp slot to avoid unique-constraint collisions during the swap.
  const free = await db.query(
    `SELECT COALESCE(MAX(slot), 0) + 1 AS free FROM user_integrations
      WHERE user_id = $1 AND integration_type = 'google_contacts'`,
    [userId]
  );
  const tmp = free.rows[0].free + 100;
  // Step 1 — move current primary (slot 0) to a temporary slot.
  await db.query(
    `UPDATE user_integrations SET slot = $2 WHERE user_id = $1 AND integration_type = 'google_contacts' AND slot = 0`,
    [userId, tmp]
  );
  // Step 2 — promote the chosen slot to slot 0.
  await db.query(
    `UPDATE user_integrations SET slot = 0 WHERE user_id = $1 AND integration_type = 'google_contacts' AND slot = $2`,
    [userId, slot]
  );
  // Step 3 — return the previous primary into the now-vacant slot.
  await db.query(
    `UPDATE user_integrations SET slot = $2 WHERE user_id = $1 AND integration_type = 'google_contacts' AND slot = $3`,
    [userId, slot, tmp]
  );
}

/**
 * Get authenticated People API client for a user
 */
async function getAuthenticatedClient(userId) {
  const result = await db.query(
    `SELECT * FROM user_integrations WHERE user_id = $1 AND integration_type = 'google_contacts' AND status = 'connected'`,
    [userId]
  );
  
  if (result.rows.length === 0) {
    throw new Error('Google Contacts not connected');
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
        `UPDATE user_integrations SET ${setClauses}, updated_at = NOW() WHERE user_id = $1 AND integration_type = 'google_contacts'`,
        [userId, ...Object.values(updates)]
      );
      console.log('[GoogleContacts] Tokens refreshed for user:', userId);
    } catch (err) {
      console.error('[GoogleContacts] Token refresh save error:', err.message);
    }
  });
  
  return oauth2Client;
}

/**
 * Get total contacts count
 */
async function getTotalContactsCount(userId) {
  try {
    const google = getGoogle();
    const auth = await getAuthenticatedClient(userId);
    const people = google.people({ version: 'v1', auth });
    
    const response = await people.people.connections.list({
      resourceName: 'people/me',
      pageSize: 1,
      personFields: 'metadata',
    });
    
    return response.data.totalPeople || 0;
  } catch (error) {
    console.error('[GoogleContacts] Error getting contacts count:', error.message);
    return null;
  }
}

/**
 * Get connection status
 */
async function getConnectionStatus(userId) {
  const result = await db.query(
    `SELECT status, account_email, account_name, updated_at FROM user_integrations 
     WHERE user_id = $1 AND integration_type = 'google_contacts'`,
    [userId]
  );
  
  if (result.rows.length === 0) {
    return { connected: false };
  }
  
  const row = result.rows[0];
  
  if (row.status !== 'connected') {
    return {
      connected: false,
      email: row.account_email,
      name: row.account_name,
    };
  }
  
  // Get contacts count to check limit
  const totalContacts = await getTotalContactsCount(userId);
  const GOOGLE_CONTACTS_LIMIT = 25000;
  
  return {
    connected: true,
    email: row.account_email,
    name: row.account_name,
    updatedAt: row.updated_at,
    totalContacts,
    contactsLimit: GOOGLE_CONTACTS_LIMIT,
    isAtLimit: totalContacts !== null && totalContacts >= GOOGLE_CONTACTS_LIMIT,
    isNearLimit: totalContacts !== null && totalContacts >= (GOOGLE_CONTACTS_LIMIT * 0.9), // 90% = 22,500
  };
}

/**
 * Disconnect Google Contacts
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
     WHERE user_id = $1 AND integration_type = 'google_contacts'`,
    [userId]
  );
}

// ===================== CONTACTS OPERATIONS =====================

/**
 * Normalize phone number for comparison
 */
function normalizePhone(phone) {
  if (!phone) return '';
  return phone.replace(/\D/g, '').replace(/^0/, '972');
}

/**
 * Search contacts by query (name, email, phone)
 */
async function searchContacts(userId, query, pageSize = 30) {
  const google = getGoogle();
  const auth = await getAuthenticatedClient(userId);
  const people = google.people({ version: 'v1', auth });
  
  const response = await people.people.searchContacts({
    query,
    pageSize,
    readMask: 'names,emailAddresses,phoneNumbers,memberships,metadata',
  });
  
  const contacts = (response.data.results || []).map(result => {
    const person = result.person;
    return formatContact(person);
  });
  
  return contacts;
}

/**
 * Get all contacts (with pagination)
 */
async function listContacts(userId, pageSize = 100, pageToken = null) {
  const google = getGoogle();
  const auth = await getAuthenticatedClient(userId);
  const people = google.people({ version: 'v1', auth });

  const params = {
    resourceName: 'people/me',
    pageSize,
    personFields: 'names,emailAddresses,phoneNumbers,memberships,metadata',
  };

  if (pageToken) {
    params.pageToken = pageToken;
  }

  const response = await people.people.connections.list(params);

  const contacts = (response.data.connections || []).map(formatContact);

  return {
    contacts,
    nextPageToken: response.data.nextPageToken,
    totalPeople: response.data.totalPeople,
  };
}

/**
 * List contacts from a specific slot (Google account). Same shape as
 * listContacts but scoped to one connected account.
 */
async function listContactsBySlot(userId, slot = 0, pageSize = 100, pageToken = null) {
  const google = getGoogle();
  const auth = await getAuthenticatedClientBySlot(userId, slot);
  const people = google.people({ version: 'v1', auth });

  const params = {
    resourceName: 'people/me',
    pageSize,
    personFields: 'names,emailAddresses,phoneNumbers,memberships,metadata',
  };
  if (pageToken) params.pageToken = pageToken;

  const response = await people.people.connections.list(params);
  const contacts = (response.data.connections || []).map(formatContact);

  return {
    contacts,
    nextPageToken: response.data.nextPageToken,
    totalPeople: response.data.totalPeople,
  };
}

/**
 * Find contact by phone number
 */
async function findByPhone(userId, phone) {
  const normalizedPhone = normalizePhone(phone);
  
  // Search using the phone number
  const contacts = await searchContacts(userId, phone);
  
  // Filter by exact phone match (normalized)
  const found = contacts.find(c => {
    return c.phones.some(p => normalizePhone(p) === normalizedPhone);
  });
  
  return found || null;
}

/**
 * Find contact by email
 */
async function findByEmail(userId, email) {
  const emailLower = (email || '').toLowerCase();
  
  const contacts = await searchContacts(userId, email);
  
  const found = contacts.find(c => {
    return c.emails.some(e => e.toLowerCase() === emailLower);
  });
  
  return found || null;
}

/**
 * Get a single contact by resource name
 */
async function getContact(userId, resourceName) {
  const google = getGoogle();
  const auth = await getAuthenticatedClient(userId);
  const people = google.people({ version: 'v1', auth });
  
  const response = await people.people.get({
    resourceName,
    personFields: 'names,emailAddresses,phoneNumbers,memberships,metadata',
  });
  
  return formatContact(response.data);
}

/**
 * Create a new contact
 */
async function createContact(userId, contactData) {
  const google = getGoogle();
  const auth = await getAuthenticatedClient(userId);
  const people = google.people({ version: 'v1', auth });
  
  const requestBody = {
    names: [],
    phoneNumbers: [],
    emailAddresses: [],
  };
  
  // Add name
  if (contactData.firstName || contactData.lastName || contactData.name) {
    if (contactData.name && !contactData.firstName) {
      // Split full name
      const parts = contactData.name.split(' ');
      requestBody.names.push({
        givenName: parts[0] || '',
        familyName: parts.slice(1).join(' ') || '',
      });
    } else {
      requestBody.names.push({
        givenName: contactData.firstName || '',
        familyName: contactData.lastName || '',
      });
    }
  }
  
  // Add phone
  if (contactData.phone) {
    requestBody.phoneNumbers.push({
      value: contactData.phone,
      type: contactData.phoneType || 'mobile',
    });
  }
  
  // Add email
  if (contactData.email) {
    requestBody.emailAddresses.push({
      value: contactData.email,
      type: contactData.emailType || 'work',
    });
  }
  
  const response = await people.people.createContact({
    requestBody,
    personFields: 'names,emailAddresses,phoneNumbers,memberships,metadata',
  });
  
  const newContact = formatContact(response.data);
  
  // Add to label if specified
  if (contactData.labelId) {
    await addToLabel(userId, newContact.resourceName, contactData.labelId);
    newContact.labels.push(contactData.labelId);
  }
  
  return newContact;
}

/**
 * Update an existing contact
 */
async function updateContact(userId, resourceName, contactData) {
  const google = getGoogle();
  const auth = await getAuthenticatedClient(userId);
  const people = google.people({ version: 'v1', auth });
  
  // Get current contact to get etag
  const currentResponse = await people.people.get({
    resourceName,
    personFields: 'names,emailAddresses,phoneNumbers,memberships,metadata',
  });
  
  const requestBody = {
    etag: currentResponse.data.etag,
    names: currentResponse.data.names || [],
    phoneNumbers: currentResponse.data.phoneNumbers || [],
    emailAddresses: currentResponse.data.emailAddresses || [],
  };
  
  // Update name if provided
  if (contactData.firstName !== undefined || contactData.lastName !== undefined || contactData.name !== undefined) {
    if (contactData.name && !contactData.firstName) {
      const parts = contactData.name.split(' ');
      requestBody.names = [{
        givenName: parts[0] || '',
        familyName: parts.slice(1).join(' ') || '',
      }];
    } else {
      if (requestBody.names.length === 0) {
        requestBody.names.push({});
      }
      if (contactData.firstName !== undefined) requestBody.names[0].givenName = contactData.firstName;
      if (contactData.lastName !== undefined) requestBody.names[0].familyName = contactData.lastName;
    }
  }
  
  // Update phone if provided
  if (contactData.phone !== undefined) {
    if (contactData.phone) {
      requestBody.phoneNumbers = [{
        value: contactData.phone,
        type: contactData.phoneType || 'mobile',
      }];
    } else {
      requestBody.phoneNumbers = [];
    }
  }
  
  // Update email if provided
  if (contactData.email !== undefined) {
    if (contactData.email) {
      requestBody.emailAddresses = [{
        value: contactData.email,
        type: contactData.emailType || 'work',
      }];
    } else {
      requestBody.emailAddresses = [];
    }
  }
  
  const response = await people.people.updateContact({
    resourceName,
    updatePersonFields: 'names,emailAddresses,phoneNumbers',
    requestBody,
    personFields: 'names,emailAddresses,phoneNumbers,memberships,metadata',
  });
  
  return formatContact(response.data);
}

/**
 * Delete a contact
 */
async function deleteContact(userId, resourceName) {
  const google = getGoogle();
  const auth = await getAuthenticatedClient(userId);
  const people = google.people({ version: 'v1', auth });
  
  await people.people.deleteContact({ resourceName });
  return { deleted: true };
}

// ===================== LABELS/GROUPS OPERATIONS =====================

/**
 * List all contact groups (labels)
 */
async function listLabels(userId) {
  const google = getGoogle();
  const auth = await getAuthenticatedClient(userId);
  const people = google.people({ version: 'v1', auth });
  
  const response = await people.contactGroups.list({
    pageSize: 100,
  });
  
  const labels = (response.data.contactGroups || [])
    .filter(g => g.groupType === 'USER_CONTACT_GROUP') // Filter out system groups
    .map(g => ({
      resourceName: g.resourceName,
      name: g.name,
      memberCount: g.memberCount || 0,
    }));
  
  return labels;
}

/**
 * Create a new contact label
 */
async function createLabel(userId, labelName) {
  const google = getGoogle();
  const auth = await getAuthenticatedClient(userId);
  const people = google.people({ version: 'v1', auth });
  
  const response = await people.contactGroups.create({
    requestBody: {
      contactGroup: {
        name: labelName,
      },
    },
  });
  
  return {
    resourceName: response.data.resourceName,
    name: response.data.name,
    memberCount: 0,
  };
}

/**
 * Add a contact to a label
 */
async function addToLabel(userId, contactResourceName, labelResourceName) {
  const google = getGoogle();
  const auth = await getAuthenticatedClient(userId);
  const people = google.people({ version: 'v1', auth });
  
  await people.contactGroups.members.modify({
    resourceName: labelResourceName,
    requestBody: {
      resourceNamesToAdd: [contactResourceName],
    },
  });
  
  return { success: true };
}

/**
 * Remove a contact from a label
 */
async function removeFromLabel(userId, contactResourceName, labelResourceName) {
  const google = getGoogle();
  const auth = await getAuthenticatedClient(userId);
  const people = google.people({ version: 'v1', auth });
  
  await people.contactGroups.members.modify({
    resourceName: labelResourceName,
    requestBody: {
      resourceNamesToRemove: [contactResourceName],
    },
  });
  
  return { success: true };
}

/**
 * Get contacts in a specific label
 */
async function getContactsInLabel(userId, labelResourceName) {
  const google = getGoogle();
  const auth = await getAuthenticatedClient(userId);
  const people = google.people({ version: 'v1', auth });
  
  // First get the group to get member resource names
  const groupResponse = await people.contactGroups.get({
    resourceName: labelResourceName,
    maxMembers: 1000,
  });
  
  const memberResourceNames = groupResponse.data.memberResourceNames || [];
  
  if (memberResourceNames.length === 0) {
    return [];
  }
  
  // Batch get the contacts
  const response = await people.people.getBatchGet({
    resourceNames: memberResourceNames,
    personFields: 'names,emailAddresses,phoneNumbers,memberships,metadata',
  });
  
  const contacts = (response.data.responses || [])
    .filter(r => r.person)
    .map(r => formatContact(r.person));
  
  return contacts;
}

// ===================== HELPER FUNCTIONS =====================

/**
 * Format a contact person object
 */
function formatContact(person) {
  if (!person) return null;
  
  const names = person.names || [];
  const phones = person.phoneNumbers || [];
  const emails = person.emailAddresses || [];
  const memberships = person.memberships || [];
  
  const primaryName = names[0] || {};
  
  return {
    resourceName: person.resourceName,
    name: primaryName.displayName || `${primaryName.givenName || ''} ${primaryName.familyName || ''}`.trim(),
    firstName: primaryName.givenName || '',
    lastName: primaryName.familyName || '',
    phones: phones.map(p => p.value),
    primaryPhone: phones[0]?.value || '',
    emails: emails.map(e => e.value),
    primaryEmail: emails[0]?.value || '',
    labels: memberships
      .filter(m => m.contactGroupMembership?.contactGroupResourceName)
      .map(m => m.contactGroupMembership.contactGroupResourceName),
  };
}

/**
 * Find or create contact by phone
 */
async function findOrCreate(userId, phone, contactData = {}) {
  const existing = await findByPhone(userId, phone);
  
  if (existing) {
    return { action: 'found', contact: existing };
  }
  
  const newContact = await createContact(userId, {
    phone,
    ...contactData,
  });
  
  return { action: 'created', contact: newContact };
}

/**
 * Check if contact exists (by phone or email)
 */
async function exists(userId, identifier, type = 'phone') {
  let contact = null;
  
  if (type === 'phone') {
    contact = await findByPhone(userId, identifier);
  } else if (type === 'email') {
    contact = await findByEmail(userId, identifier);
  }
  
  return { exists: !!contact, contact };
}

/**
 * Get authenticated client for a specific slot (for multi-account support)
 */
async function getAuthenticatedClientBySlot(userId, slot = 0) {
  const result = await db.query(
    `SELECT * FROM user_integrations
     WHERE user_id = $1 AND integration_type = 'google_contacts' AND slot = $2 AND status = 'connected'`,
    [userId, slot]
  );
  if (result.rows.length === 0) throw new Error(`Google Contacts slot ${slot} not connected`);

  const integration = result.rows[0];
  const oauth2Client = createOAuth2Client();
  const accessToken = decrypt(integration.access_token);
  const refreshToken = integration.refresh_token ? decrypt(integration.refresh_token) : null;

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: integration.token_expiry ? new Date(integration.token_expiry).getTime() : null,
  });

  oauth2Client.on('tokens', async (tokens) => {
    try {
      const updates = {};
      if (tokens.access_token) updates.access_token = encrypt(tokens.access_token);
      if (tokens.refresh_token) updates.refresh_token = encrypt(tokens.refresh_token);
      if (tokens.expiry_date) updates.token_expiry = new Date(tokens.expiry_date);
      const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 3}`).join(', ');
      await db.query(
        `UPDATE user_integrations SET ${setClauses}, updated_at = NOW()
         WHERE user_id = $1 AND integration_type = 'google_contacts' AND slot = $2`,
        [userId, slot, ...Object.values(updates)]
      );
    } catch (err) {
      console.error('[GoogleContacts] Token refresh error (slot):', err.message);
    }
  });

  return oauth2Client;
}

/**
 * Find or create a contact in a specific Google account slot
 */
async function findOrCreateBySlot(userId, slot = 0, { name, phone, notes }) {
  const google = getGoogle();
  const auth = await getAuthenticatedClientBySlot(userId, slot);
  const people = google.people({ version: 'v1', auth });

  const normalizedPhone = '+' + phone.replace(/\D/g, '');

  // Search for existing contact by phone
  try {
    const search = await people.people.searchContacts({
      query: normalizedPhone,
      readMask: 'names,phoneNumbers',
      pageSize: 5,
    });
    const results = search.data.results || [];
    for (const r of results) {
      const phones = r.person?.phoneNumbers || [];
      if (phones.some(p => p.value?.replace(/\D/g, '') === normalizedPhone.replace(/\D/g, ''))) {
        return { created: false, resourceName: r.person.resourceName };
      }
    }
  } catch {}

  // Create new contact
  const contact = await people.people.createContact({
    requestBody: {
      names: [{ displayName: name, givenName: name }],
      phoneNumbers: [{ value: normalizedPhone, type: 'mobile' }],
      biographies: notes ? [{ value: notes }] : [],
    },
  });

  return { created: true, resourceName: contact.data.resourceName };
}

/**
 * List all Google Contacts slots (multi-account) connected for this user.
 */
async function listConnectedSlots(userId) {
  const result = await db.query(
    `SELECT slot, account_email, account_name, status, updated_at
       FROM user_integrations
      WHERE user_id = $1 AND integration_type = 'google_contacts'
      ORDER BY slot ASC`,
    [userId]
  );
  const connected = result.rows.filter((r) => r.status === 'connected');
  // Deduplicate by email (keep lowest slot). Defensive — the callback code
  // already merges new connections into an existing slot, but older rows
  // might still be duplicated.
  const seen = new Set();
  const deduped = [];
  for (const r of connected) {
    const key = (r.account_email || '').toLowerCase();
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    deduped.push(r);
  }
  return deduped.map((r) => ({
    slot: r.slot,
    email: r.account_email,
    name: r.account_name,
    updatedAt: r.updated_at,
  }));
}

/**
 * Search for a contact by phone in a specific slot. Returns resourceName if found, else null.
 */
async function findContactInSlot(userId, slot, phone) {
  const normalizedPhone = String(phone).replace(/\D/g, '');
  if (!normalizedPhone) return null;
  try {
    const google = getGoogle();
    const auth = await getAuthenticatedClientBySlot(userId, slot);
    const people = google.people({ version: 'v1', auth });
    const search = await people.people.searchContacts({
      query: normalizedPhone,
      readMask: 'names,phoneNumbers',
      pageSize: 10,
    });
    const results = search.data.results || [];
    for (const r of results) {
      const phones = r.person?.phoneNumbers || [];
      for (const p of phones) {
        const pDigits = String(p.value || '').replace(/\D/g, '');
        if (pDigits && (pDigits === normalizedPhone || pDigits.endsWith(normalizedPhone) || normalizedPhone.endsWith(pDigits))) {
          return { resourceName: r.person.resourceName, displayName: r.person.names?.[0]?.displayName || null };
        }
      }
    }
  } catch (e) {
    console.warn(`[GoogleContacts] findContactInSlot failed (slot ${slot}): ${e.message}`);
  }
  return null;
}

/**
 * Ensure the given label exists in a slot — return its resourceName.
 * Creates the label if missing.
 */
async function ensureLabelInSlot(userId, slot, labelName) {
  const google = getGoogle();
  const auth = await getAuthenticatedClientBySlot(userId, slot);
  const people = google.people({ version: 'v1', auth });

  const { data } = await people.contactGroups.list({ pageSize: 200 });
  const existing = (data.contactGroups || []).find(
    (g) => g.groupType === 'USER_CONTACT_GROUP' && g.name === labelName
  );
  if (existing) return existing.resourceName;

  const created = await people.contactGroups.create({
    requestBody: { contactGroup: { name: labelName } },
  });
  return created.data.resourceName;
}

/**
 * Create a contact in a specific slot with an optional label tag.
 */
async function createContactInSlot(userId, slot, { name, phone, labelResourceName, notes }) {
  const google = getGoogle();
  const auth = await getAuthenticatedClientBySlot(userId, slot);
  const people = google.people({ version: 'v1', auth });

  const normalizedPhone = '+' + String(phone).replace(/\D/g, '');

  const created = await people.people.createContact({
    requestBody: {
      names: [{ displayName: name, givenName: name }],
      phoneNumbers: [{ value: normalizedPhone, type: 'mobile' }],
      biographies: notes ? [{ value: notes }] : [],
      ...(labelResourceName
        ? { memberships: [{ contactGroupMembership: { contactGroupResourceName: labelResourceName } }] }
        : {}),
    },
  });
  return { resourceName: created.data.resourceName };
}

/**
 * Get total contact count for a specific Google account slot
 */
async function getContactCountBySlot(userId, slot = 0) {
  const google = getGoogle();
  const auth = await getAuthenticatedClientBySlot(userId, slot);
  const people = google.people({ version: 'v1', auth });
  const response = await people.people.connections.list({
    resourceName: 'people/me',
    pageSize: 1,
    personFields: 'names',
  });
  return response.data.totalPeople || 0;
}

module.exports = {
  // Auth
  getAuthUrl,
  handleCallback,
  getConnectionStatus,
  disconnect,
  listConnectedSlots,
  findContactInSlot,
  ensureLabelInSlot,
  createContactInSlot,
  disconnectSlot,
  setPrimarySlot,
  getAuthenticatedClient,
  
  // Contacts
  searchContacts,
  listContacts,
  listContactsBySlot,
  findByPhone,
  findByEmail,
  getContact,
  createContact,
  updateContact,
  deleteContact,
  findOrCreate,
  exists,
  
  // Labels
  listLabels,
  createLabel,
  addToLabel,
  removeFromLabel,
  getContactsInLabel,

  // Multi-account (slot-based) for View Filter Bot
  getAuthenticatedClientBySlot,
  findOrCreateBySlot,
  getContactCountBySlot,
};
