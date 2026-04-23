-- Admin auto-tag rules: automatically tag an admin's contacts based on the
-- subscription status of the matching platform user (matched by WhatsApp phone).
--
-- Rule types:
--   'service_active'    → tag applied while the user has an active subscription
--                         to the additional service with the given slug.
--   'paying_customer'   → tag applied while the user has any active main
--                         subscription (user_subscriptions.status='active').

BEGIN;

-- 1. Rules table
CREATE TABLE IF NOT EXISTS auto_tag_rules (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag_name        VARCHAR(50) NOT NULL,
  tag_color       VARCHAR(7) DEFAULT '#3B82F6',
  rule_type       VARCHAR(30) NOT NULL CHECK (rule_type IN ('service_active','paying_customer')),
  service_slug    VARCHAR(50),
  enabled         BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (admin_user_id, tag_name)
);

CREATE INDEX IF NOT EXISTS idx_auto_tag_rules_admin ON auto_tag_rules(admin_user_id) WHERE enabled;

-- 2. Phone normalization — used to match admin contacts against platform users.
--    Accepts "0XXXXXXXXX" or "972XXXXXXXXX" or "+972..." and returns "972XXXXXXXXX".
CREATE OR REPLACE FUNCTION normalize_phone(p TEXT) RETURNS TEXT AS $$
DECLARE
  digits TEXT;
BEGIN
  IF p IS NULL THEN RETURN NULL; END IF;
  digits := regexp_replace(p, '[^0-9]', '', 'g');
  IF digits = '' THEN RETURN NULL; END IF;
  IF digits ~ '^0' THEN digits := '972' || substring(digits FROM 2); END IF;
  RETURN digits;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Helpful index so the sync function can filter by normalized phone quickly.
CREATE INDEX IF NOT EXISTS idx_contacts_user_normphone
  ON contacts (user_id, (normalize_phone(phone)));

-- 3. Sync function — reconciles assignments for every enabled rule.
CREATE OR REPLACE FUNCTION sync_admin_auto_tags() RETURNS void AS $$
DECLARE
  r       RECORD;
  v_tag   UUID;
BEGIN
  FOR r IN SELECT * FROM auto_tag_rules WHERE enabled LOOP
    -- Ensure the tag exists on the admin account.
    INSERT INTO contact_tags (user_id, name, color)
    VALUES (r.admin_user_id, r.tag_name, r.tag_color)
    ON CONFLICT (user_id, name) DO NOTHING;

    SELECT id INTO v_tag
    FROM contact_tags
    WHERE user_id = r.admin_user_id AND name = r.tag_name;

    -- Build the set of phones that should currently have this tag.
    CREATE TEMP TABLE IF NOT EXISTS _ata_target_phones (phone TEXT) ON COMMIT DROP;
    TRUNCATE _ata_target_phones;

    IF r.rule_type = 'service_active' THEN
      INSERT INTO _ata_target_phones(phone)
      SELECT DISTINCT normalize_phone(wc.phone_number)
        FROM user_service_subscriptions uss
        JOIN additional_services s ON s.id = uss.service_id
        JOIN whatsapp_connections wc ON wc.user_id = uss.user_id
       WHERE uss.status = 'active'
         AND s.slug = r.service_slug
         AND wc.phone_number IS NOT NULL AND wc.phone_number <> ''
         AND (uss.expires_at IS NULL OR uss.expires_at > NOW());
    ELSIF r.rule_type = 'paying_customer' THEN
      INSERT INTO _ata_target_phones(phone)
      SELECT DISTINCT normalize_phone(wc.phone_number)
        FROM user_subscriptions us
        JOIN whatsapp_connections wc ON wc.user_id = us.user_id
       WHERE us.status = 'active'
         AND wc.phone_number IS NOT NULL AND wc.phone_number <> ''
         AND (us.expires_at IS NULL OR us.expires_at > NOW());
    END IF;

    DELETE FROM _ata_target_phones WHERE phone IS NULL;

    -- Add missing assignments.
    INSERT INTO contact_tag_assignments (contact_id, tag_id)
    SELECT c.id, v_tag
      FROM contacts c
     WHERE c.user_id = r.admin_user_id
       AND normalize_phone(c.phone) IN (SELECT phone FROM _ata_target_phones)
    ON CONFLICT DO NOTHING;

    -- Remove stale assignments for this tag.
    DELETE FROM contact_tag_assignments cta
     USING contacts c
     WHERE cta.tag_id = v_tag
       AND cta.contact_id = c.id
       AND c.user_id = r.admin_user_id
       AND (c.phone IS NULL OR c.phone = ''
            OR normalize_phone(c.phone) NOT IN (SELECT phone FROM _ata_target_phones));
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 4. Trigger function + triggers that keep tags in sync with subscription changes.
CREATE OR REPLACE FUNCTION trg_sync_admin_auto_tags() RETURNS TRIGGER AS $$
BEGIN
  PERFORM sync_admin_auto_tags();
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS uss_sync_admin_auto_tags ON user_service_subscriptions;
CREATE TRIGGER uss_sync_admin_auto_tags
  AFTER INSERT OR UPDATE OR DELETE ON user_service_subscriptions
  FOR EACH STATEMENT EXECUTE FUNCTION trg_sync_admin_auto_tags();

DROP TRIGGER IF EXISTS us_sync_admin_auto_tags ON user_subscriptions;
CREATE TRIGGER us_sync_admin_auto_tags
  AFTER INSERT OR UPDATE OR DELETE ON user_subscriptions
  FOR EACH STATEMENT EXECUTE FUNCTION trg_sync_admin_auto_tags();

DROP TRIGGER IF EXISTS wc_sync_admin_auto_tags ON whatsapp_connections;
CREATE TRIGGER wc_sync_admin_auto_tags
  AFTER INSERT OR UPDATE OF phone_number OR DELETE ON whatsapp_connections
  FOR EACH STATEMENT EXECUTE FUNCTION trg_sync_admin_auto_tags();

-- 5. Seed rules for Neriya (office@neriyabudraham.co.il).
INSERT INTO auto_tag_rules (admin_user_id, tag_name, tag_color, rule_type, service_slug)
SELECT u.id, v.tag_name, v.tag_color, v.rule_type, v.service_slug
  FROM users u
  CROSS JOIN (VALUES
    ('בוט העלאת סטטוסים',   '#3B82F6', 'service_active',  'status-bot'),
    ('בוט שמירת אנשי קשר',  '#10B981', 'service_active',  'save-contact-bot'),
    ('בוט סינון',           '#8B5CF6', 'service_active',  'view-filter-bot'),
    ('לקוח פעיל',           '#F59E0B', 'paying_customer', NULL)
  ) AS v(tag_name, tag_color, rule_type, service_slug)
 WHERE u.email = 'office@neriyabudraham.co.il'
ON CONFLICT (admin_user_id, tag_name) DO UPDATE
  SET rule_type   = EXCLUDED.rule_type,
      service_slug= EXCLUDED.service_slug,
      tag_color   = EXCLUDED.tag_color,
      enabled     = true,
      updated_at  = NOW();

-- 6. Initial full sync.
SELECT sync_admin_auto_tags();

COMMIT;
