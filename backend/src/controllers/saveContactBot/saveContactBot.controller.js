/**
 * REST endpoints for managing the Save Contact Bot profile + sequence + link.
 */

const svc = require('../../services/saveContactBot/saveContactBot.service');
const googleContacts = require('../../services/googleContacts.service');
const usage = require('../../services/saveContactBot/usage.service');
const { getServiceAccess } = require('../services/services.controller');

const SERVICE_SLUG = 'save-contact-bot';

async function requireServiceAccess(req, res, next) {
  try {
    const access = await getServiceAccess(req.user.id, SERVICE_SLUG);
    if (!access.hasAccess) {
      return res.status(403).json({
        error: 'NO_ACCESS',
        message: 'אין לך גישה למודול "שמירת איש קשר". אפשר להירשם בעמוד השירותים.',
        reason: access.reason,
        trialExpired: access.reason === 'trial_expired',
      });
    }
    req.serviceAccess = access;
    next();
  } catch (e) {
    console.error('[SaveContactBot] requireServiceAccess error:', e);
    res.status(500).json({ error: 'שגיאה בבדיקת גישה' });
  }
}

// Backward-compat alias — kept so the old route file doesn't break if cached.
const requireAllowedEmail = requireServiceAccess;

async function getProfile(req, res) {
  try {
    const profile = await svc.getProfileByUserId(req.user.id);
    if (!profile) return res.json({ profile: null, steps: [] });
    const steps = await svc.listSequenceSteps(profile.id);
    res.json({ profile, steps });
  } catch (e) {
    console.error('[SaveContactBot] getProfile error:', e);
    res.status(500).json({ error: e.message });
  }
}

async function saveProfile(req, res) {
  try {
    const {
      contact_name,
      contact_phone,
      prefilled_message,
      welcome_message,
      is_active,
      google_contacts_sync_enabled,
      google_contacts_label_id,
    } = req.body || {};
    if (!contact_name || !contact_phone || !prefilled_message) {
      return res.status(400).json({ error: 'contact_name, contact_phone and prefilled_message are required' });
    }
    let profile = await svc.upsertProfile(req.user.id, {
      contact_name,
      contact_phone,
      prefilled_message,
      welcome_message,
      is_active,
      google_contacts_sync_enabled,
      google_contacts_label_id,
    });

    // Auto-generate a wa.me/message link on first profile save so the user
    // never lands on the dashboard without a ready-to-share link.
    if (!profile.qrdl_code) {
      try {
        profile = await svc.generateOrRefreshLink(req.user.id);
      } catch (linkErr) {
        // Non-fatal: profile is saved, link can be retried via the dedicated button.
        console.warn(`[SaveContactBot] auto-generate link failed for user ${req.user.id}:`, linkErr.response?.data || linkErr.message);
      }
    }

    res.json({ profile });
  } catch (e) {
    console.error('[SaveContactBot] saveProfile error:', e);
    const status = e.code === 'DUPLICATE_PREFILLED' ? 409 : 500;
    res.status(status).json({ error: e.message, code: e.code, field: e.field });
  }
}

async function deleteProfile(req, res) {
  try {
    const result = await svc.deleteProfile(req.user.id);
    res.json(result);
  } catch (e) {
    console.error('[SaveContactBot] deleteProfile error:', e);
    res.status(500).json({ error: e.message });
  }
}

async function generateLink(req, res) {
  try {
    const profile = await svc.generateOrRefreshLink(req.user.id);
    res.json({ profile });
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message;
    console.error('[SaveContactBot] generateLink error:', msg);
    res.status(500).json({ error: msg });
  }
}

async function addStep(req, res) {
  try {
    const profile = await svc.getProfileByUserId(req.user.id);
    if (!profile) return res.status(400).json({ error: 'Create a profile first' });
    const step = await svc.addSequenceStep(profile.id, req.body || {});
    res.json({ step });
  } catch (e) {
    console.error('[SaveContactBot] addStep error:', e);
    res.status(500).json({ error: e.message });
  }
}

async function updateStep(req, res) {
  try {
    const profile = await svc.getProfileByUserId(req.user.id);
    if (!profile) return res.status(400).json({ error: 'No profile' });
    const step = await svc.updateSequenceStep(req.params.stepId, req.body || {});
    res.json({ step });
  } catch (e) {
    console.error('[SaveContactBot] updateStep error:', e);
    res.status(500).json({ error: e.message });
  }
}

async function deleteStep(req, res) {
  try {
    const result = await svc.deleteSequenceStep(req.params.stepId);
    res.json(result);
  } catch (e) {
    console.error('[SaveContactBot] deleteStep error:', e);
    res.status(500).json({ error: e.message });
  }
}

async function listReceivedRequests(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;
    const data = await svc.listReceivedRequests(req.user.id, { limit, offset });
    res.json(data);
  } catch (e) {
    console.error('[SaveContactBot] listReceivedRequests error:', e);
    res.status(500).json({ error: e.message });
  }
}

async function reorderSteps(req, res) {
  try {
    const profile = await svc.getProfileByUserId(req.user.id);
    if (!profile) return res.status(400).json({ error: 'No profile' });
    const { orderedIds } = req.body || {};
    if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds must be an array' });
    const result = await svc.reorderSequenceSteps(profile.id, orderedIds);
    res.json(result);
  } catch (e) {
    console.error('[SaveContactBot] reorderSteps error:', e);
    res.status(500).json({ error: e.message });
  }
}

async function getGoogleContactsStatus(req, res) {
  try {
    const slots = await googleContacts.listConnectedSlots(req.user.id);
    // Back-compat: also include a flat boolean for older UI.
    res.json({
      connected: slots.length > 0,
      slots,
      slotCount: slots.length,
    });
  } catch (e) {
    console.error('[SaveContactBot] getGoogleContactsStatus error:', e);
    res.status(500).json({ error: e.message, connected: false, slots: [] });
  }
}

async function getGoogleContactsAuthUrl(req, res) {
  try {
    const requestedSlot = Number(req.query.slot);
    let slot = Number.isFinite(requestedSlot) && requestedSlot >= 0 ? requestedSlot : null;
    if (slot === null) {
      // Pick the next free slot.
      const slots = await googleContacts.listConnectedSlots(req.user.id);
      const used = new Set(slots.map((s) => s.slot));
      slot = 0;
      while (used.has(slot)) slot += 1;
    }
    const url = googleContacts.getAuthUrl(req.user.id, 'save-contact-bot', slot);
    res.json({ url, slot });
  } catch (e) {
    console.error('[SaveContactBot] getGoogleContactsAuthUrl error:', e);
    res.status(500).json({ error: e.message });
  }
}

async function getContactHistory(req, res) {
  try {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ error: 'phone is required' });
    const data = await svc.listRequestsByPhone(req.user.id, phone);
    res.json(data);
  } catch (e) {
    console.error('[SaveContactBot] getContactHistory error:', e);
    res.status(500).json({ error: e.message });
  }
}

async function disconnectGoogleSlot(req, res) {
  try {
    const slot = Number(req.params.slot);
    if (!Number.isFinite(slot)) return res.status(400).json({ error: 'invalid slot' });
    await googleContacts.disconnectSlot(req.user.id, slot);
    res.json({ ok: true });
  } catch (e) {
    console.error('[SaveContactBot] disconnectGoogleSlot error:', e);
    res.status(500).json({ error: e.message });
  }
}

async function setPrimaryGoogleSlot(req, res) {
  try {
    const slot = Number(req.params.slot);
    if (!Number.isFinite(slot)) return res.status(400).json({ error: 'invalid slot' });
    await googleContacts.setPrimarySlot(req.user.id, slot);
    res.json({ ok: true });
  } catch (e) {
    console.error('[SaveContactBot] setPrimaryGoogleSlot error:', e);
    res.status(500).json({ error: e.message });
  }
}

async function syncPending(req, res) {
  try {
    const result = await svc.syncPendingToGoogle(req.user.id);
    res.json(result);
  } catch (e) {
    console.error('[SaveContactBot] syncPending error:', e);
    res.status(500).json({ error: e.message });
  }
}

async function exportVcf(req, res) {
  try {
    const vcf = await svc.buildVcfExport(req.user.id);
    const filename = `save-contact-bot-${new Date().toISOString().slice(0, 10)}.vcf`;
    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(vcf);
  } catch (e) {
    console.error('[SaveContactBot] exportVcf error:', e);
    res.status(500).json({ error: e.message });
  }
}

async function getSequence(req, res) {
  try {
    const profile = await svc.getProfileByUserId(req.user.id);
    if (!profile) return res.json({ items: [] });
    const items = await svc.assembleSequence(profile);
    res.json({ items, maxCustom: svc.MAX_CUSTOM_STEPS });
  } catch (e) {
    console.error('[SaveContactBot] getSequence error:', e);
    res.status(500).json({ error: e.message });
  }
}

async function reorderUnified(req, res) {
  try {
    const profile = await svc.getProfileByUserId(req.user.id);
    if (!profile) return res.status(400).json({ error: 'No profile' });
    const { orderedIds } = req.body || {};
    if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds must be an array' });
    await svc.reorderUnified(profile.id, orderedIds);
    res.json({ ok: true });
  } catch (e) {
    console.error('[SaveContactBot] reorderUnified error:', e);
    const status = e.code === 'MAX_STEPS_REACHED' ? 409 : 500;
    res.status(status).json({ error: e.message });
  }
}

async function deleteWelcome(req, res) {
  try {
    await svc.deleteWelcome(req.user.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('[SaveContactBot] deleteWelcome error:', e);
    res.status(500).json({ error: e.message });
  }
}

async function getUsage(req, res) {
  try {
    const summary = await usage.getCurrentUsageSummary(req.user.id);
    res.json(summary);
  } catch (e) {
    console.error('[SaveContactBot] getUsage error:', e);
    res.status(500).json({ error: e.message });
  }
}

async function restoreDefaultWelcome(req, res) {
  try {
    const profile = await svc.restoreDefaultWelcome(req.user.id);
    res.json({ profile });
  } catch (e) {
    console.error('[SaveContactBot] restoreDefaultWelcome error:', e);
    res.status(500).json({ error: e.message });
  }
}

module.exports = {
  requireAllowedEmail,
  requireServiceAccess,
  getProfile,
  saveProfile,
  deleteProfile,
  generateLink,
  addStep,
  updateStep,
  deleteStep,
  reorderSteps,
  listReceivedRequests,
  getGoogleContactsStatus,
  getGoogleContactsAuthUrl,
  getContactHistory,
  disconnectGoogleSlot,
  setPrimaryGoogleSlot,
  syncPending,
  exportVcf,
  getSequence,
  reorderUnified,
  deleteWelcome,
  restoreDefaultWelcome,
  getUsage,
};
