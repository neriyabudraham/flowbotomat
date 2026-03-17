-- בדיקה
SELECT '=== SUBSCRIPTION ===' as info;
SELECT id, status, plan_id, billing_period, next_charge_date FROM user_subscriptions WHERE user_id = '89f5f5c1-2c53-4823-9914-de70ea1337a6';

SELECT '=== PAYMENT HISTORY ===' as info;
SELECT id, amount, status, sumit_transaction_id, created_at FROM payment_history WHERE user_id = '89f5f5c1-2c53-4823-9914-de70ea1337a6' ORDER BY created_at DESC LIMIT 5;

SELECT '=== BILLING QUEUE ===' as info;
SELECT id, status, amount, charge_date FROM billing_queue WHERE user_id = '89f5f5c1-2c53-4823-9914-de70ea1337a6' ORDER BY created_at DESC LIMIT 3;

-- תיקון: הוסף payment_history רק אם לא קיים
INSERT INTO payment_history (user_id, subscription_id, amount, status, sumit_transaction_id, sumit_document_number, description, receipt_url, billing_type)
SELECT '89f5f5c1-2c53-4823-9914-de70ea1337a6', us.id, 25, 'success', '1742391417', 40224, 'מנוי חודשי - בסיסי (קופון 50%)', 'https://pay.sumit.co.il/8cdvf2/a/history/skc6qm-abaf3f4749/?download=1742391421&downloadkey=stdhtp&original=true', 'monthly'
FROM user_subscriptions us WHERE us.user_id = '89f5f5c1-2c53-4823-9914-de70ea1337a6'
AND NOT EXISTS (SELECT 1 FROM payment_history ph WHERE ph.sumit_transaction_id = '1742391417');

-- תיקון: coupon_usage
INSERT INTO coupon_usage (coupon_id, user_id, subscription_id, discount_applied)
SELECT '1352c5a2-fa53-47a4-a736-4de88bf3e9b9', '89f5f5c1-2c53-4823-9914-de70ea1337a6', us.id, 25
FROM user_subscriptions us WHERE us.user_id = '89f5f5c1-2c53-4823-9914-de70ea1337a6'
ON CONFLICT (coupon_id, user_id) DO UPDATE SET discount_applied = EXCLUDED.discount_applied;

-- אישור
SELECT '=== RESULT ===' as info;
SELECT id, amount, status, sumit_transaction_id, created_at FROM payment_history WHERE user_id = '89f5f5c1-2c53-4823-9914-de70ea1337a6' ORDER BY created_at DESC LIMIT 3;
