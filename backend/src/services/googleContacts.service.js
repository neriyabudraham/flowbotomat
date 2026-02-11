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
  
  // Encrypt tokens
  const encryptedAccess = encrypt(tokens.access_token);
  const encryptedRefresh = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;
  
  // Store in database
  await db.query(`
    INSERT INTO user_integrations (user_id, integration_type, access_token, refresh_token, token_expiry, account_email, account_name, status)
    VALUES ($1, 'google_contacts', $2, $3, $4, $5, $6, 'connected')
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
  return {
    connected: row.status === 'connected',
    email: row.account_email,
    name: row.account_name,
    updatedAt: row.updated_at,
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

module.exports = {
  // Auth
  getAuthUrl,
  handleCallback,
  getConnectionStatus,
  disconnect,
  getAuthenticatedClient,
  
  // Contacts
  searchContacts,
  listContacts,
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
};
