-- Billing Enhancements Migration
-- Run with: docker exec -i flowbotomat_db psql -U flowbotomat_user -d flowbotomat < backend/migrations/billing_enhancements.sql

-- 1. Fix cancelled subscriptions without expires_at
UPDATE user_subscriptions 
SET expires_at = COALESCE(next_charge_date, cancelled_at + INTERVAL '30 days')
WHERE status = 'cancelled' AND expires_at IS NULL AND cancelled_at IS NOT NULL;

-- 2. Add receipt_url column to payment_history
ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS receipt_url TEXT;

-- 3. Add invoice_name and receipt_email to user_subscriptions
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS invoice_name VARCHAR(255);
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS receipt_email VARCHAR(255);

-- Verify changes
SELECT 'Cancelled subscriptions fixed:' as info, COUNT(*) as count 
FROM user_subscriptions WHERE status = 'cancelled' AND expires_at IS NOT NULL;

SELECT 'New columns added to payment_history:' as info, 
       column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'payment_history' AND column_name = 'receipt_url';

SELECT 'New columns added to user_subscriptions:' as info, 
       column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'user_subscriptions' AND column_name IN ('invoice_name', 'receipt_email');
