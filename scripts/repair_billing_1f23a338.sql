-- Repair script for subscription 1f23a338-dadf-4d26-ac9c-b5ccc045b545
-- Customer: 7ea90ece-c27f-4cbb-aba1-e863a182311b
-- Service: בוט העלאת סטטוסים, Price: 250 ILS, Monthly
-- Sumit Payment ID: 1741105269
-- Sumit Document Number: 40222
-- Sumit Customer ID: 1740443166
-- Invoice: https://pay.sumit.co.il/8cdvf2/a/history/ss7qji-953260e764/?download=1741105289&downloadkey=sslxft&original=true
-- Next charge: 2026-04-16

BEGIN;

-- 1. Insert payment history for initial subscription payment
INSERT INTO service_payment_history (
  user_id,
  service_id,
  subscription_id,
  amount,
  status,
  payment_type,
  description,
  sumit_transaction_id,
  sumit_document_number,
  created_at
)
SELECT
  '7ea90ece-c27f-4cbb-aba1-e863a182311b',
  uss.service_id,
  '1f23a338-dadf-4d26-ac9c-b5ccc045b545',
  250.00,
  'success',
  'recurring',
  'הרשמה ל' || s.name_he || ' - תשלום ראשון',
  '1741105269',
  '40222',
  '2026-03-04 00:00:00'::timestamp
FROM user_service_subscriptions uss
JOIN additional_services s ON s.id = uss.service_id
WHERE uss.id = '1f23a338-dadf-4d26-ac9c-b5ccc045b545';

-- 2. Insert billing_queue for next recurring charge
INSERT INTO billing_queue (
  user_id,
  subscription_id,
  subscription_type,
  amount,
  scheduled_date,
  status,
  created_at
)
VALUES (
  '7ea90ece-c27f-4cbb-aba1-e863a182311b',
  '1f23a338-dadf-4d26-ac9c-b5ccc045b545',
  'service',
  250.00,
  '2026-04-16',
  'pending',
  NOW()
);

-- Verify
SELECT 'payment_history' as tbl, count(*) FROM service_payment_history WHERE subscription_id = '1f23a338-dadf-4d26-ac9c-b5ccc045b545'
UNION ALL
SELECT 'billing_queue' as tbl, count(*) FROM billing_queue WHERE subscription_id = '1f23a338-dadf-4d26-ac9c-b5ccc045b545';

COMMIT;
