-- Seed the Status Bot service
INSERT INTO additional_services (
  slug, name, name_he, description, description_he,
  price, yearly_price, billing_period,
  trial_days, allow_custom_trial,
  icon, color, external_url, features,
  is_active, is_coming_soon, sort_order
) VALUES (
  'status-bot',
  'Status Upload Bot',
  'בוט העלאת סטטוסים',
  'Upload WhatsApp statuses easily via web or WhatsApp message',
  'העלה סטטוסים לווצאפ בקלות מממשק אחד, עקוב אחרי צפיות ותגובות, והעלה סטטוסים גם דרך הודעת WhatsApp',
  250,
  2500,
  'monthly',
  0, -- no trial by default
  true, -- allow custom trial
  'sms', -- using sms icon for phone/status
  'from-green-500 to-emerald-600',
  '/status-bot/dashboard',
  '{"unlimited_uploads": true, "view_tracking": true, "reaction_tracking": true, "authorized_numbers": true}',
  true,
  false,
  1
) ON CONFLICT (slug) DO UPDATE SET
  name_he = EXCLUDED.name_he,
  description_he = EXCLUDED.description_he,
  price = EXCLUDED.price,
  yearly_price = EXCLUDED.yearly_price,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  external_url = EXCLUDED.external_url,
  features = EXCLUDED.features,
  updated_at = NOW();
