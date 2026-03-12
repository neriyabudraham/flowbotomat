const db = require('../../config/database');
const sumitService = require('../../services/payment/sumit.service');
const billingQueueService = require('../../services/payment/billingQueue.service');
const { sendNewSubscriptionEmail, sendRenewalEmail, sendCancellationEmail } = require('../../services/subscription/notification.service');

/**
 * Save payment method
 * 
 * Supports two flows:
 * 1. Frontend tokenization: singleUseToken provided from Sumit JS API
 * 2. Backend tokenization: cardNumber + cvv provided for server-side tokenization
 * 
 * Flow:
 * 1. Get token (from frontend or create via backend)
 * 2. Call setPaymentMethodForCustomer to convert to permanent storage
 * 3. Sumit stores the card and returns CustomerID + PaymentMethodID
 * 4. Save these IDs in our database for future charges
 */
async function savePaymentMethod(req, res) {
  try {
    const userId = req.user.id;
    const { 
      singleUseToken,      // Short-term token from Sumit JS API (optional if cardNumber provided)
      cardNumber,          // Card number for backend tokenization (optional if token provided)
      cvv,                 // CVV for backend tokenization
      cardHolderName,      // Card holder name
      citizenId,           // Israeli ID (ת.ז. / ח.פ.)
      companyNumber,       // Company number (optional)
      lastDigits,          // Last 4 digits for display
      expiryMonth,         // Expiry month
      expiryYear,          // Expiry year
      phone,               // Phone number for payment
    } = req.body;
    
    // Need either token or card details
    if (!singleUseToken && !cardNumber) {
      return res.status(400).json({ 
        error: 'נדרשים פרטי כרטיס אשראי',
        code: 'MISSING_CARD_DATA'
      });
    }
    
    if (!cardHolderName?.trim()) {
      return res.status(400).json({ 
        error: 'נדרש שם בעל הכרטיס',
        code: 'MISSING_CARDHOLDER'
      });
    }
    
    // Phone is optional
    
    if (!citizenId?.trim()) {
      return res.status(400).json({ 
        error: 'נדרשת תעודת זהות / ח.פ.',
        code: 'MISSING_CITIZEN_ID'
      });
    }
    
    // Get user info including receipt_email and phone
    const userResult = await db.query(
      'SELECT id, name, email, receipt_email, phone, citizen_id FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }
    const user = userResult.rows[0];
    const receiptEmail = user.receipt_email || user.email; // Use receipt_email if set, otherwise default email
    
    // Check if user already has a Sumit customer ID
    let existingSumitCustomerId = null;
    const existingMethod = await db.query(
      'SELECT sumit_customer_id FROM user_payment_methods WHERE user_id = $1 AND sumit_customer_id IS NOT NULL LIMIT 1',
      [userId]
    );
    
    if (existingMethod.rows.length > 0) {
      existingSumitCustomerId = existingMethod.rows[0].sumit_customer_id;
    }
    
    // If no existing customer, create one first
    if (!existingSumitCustomerId) {
      console.log(`[Payment] Creating new Sumit customer for user ${userId}, receipt email: ${receiptEmail}, phone: ${phone}`);
      const customerResult = await sumitService.createCustomer({
        name: cardHolderName || user.name || user.email,
        email: receiptEmail, // Use receipt_email for receipts
        phone: phone,
        citizenId: citizenId,
        companyNumber: companyNumber,
        externalId: `user_${userId}`,
      });
      
      if (customerResult.success) {
        existingSumitCustomerId = customerResult.customerId;
        console.log(`[Payment] Created Sumit customer: ${existingSumitCustomerId}`);
      } else {
        console.error('[Payment] Failed to create Sumit customer:', customerResult.error);
        // Continue anyway - setPaymentMethodForCustomer can create customer
      }
    }
    
    console.log(`[Payment] Saving payment method for user ${userId}, Sumit customer: ${existingSumitCustomerId || 'will create'}`);
    
    let sumitResult;
    
    if (singleUseToken) {
      // Use frontend token
      console.log('[Payment] Using frontend SingleUseToken');
      sumitResult = await sumitService.setPaymentMethodForCustomer({
        customerId: existingSumitCustomerId,
        singleUseToken: singleUseToken,
        customerInfo: {
          name: cardHolderName || user.name || user.email,
          email: receiptEmail, // Use receipt_email for receipts
          phone: phone,
          companyNumber: companyNumber,
          externalId: `user_${userId}`,
        }
      });
    } else {
      // Backend tokenization with card details
      console.log('[Payment] Using backend tokenization with card details');
      sumitResult = await sumitService.setPaymentMethodWithCard({
        customerId: existingSumitCustomerId,
        cardNumber: cardNumber,
        expiryMonth: expiryMonth,
        expiryYear: expiryYear,
        cvv: cvv,
        citizenId: citizenId,
        phone: phone,
        customerInfo: {
          name: cardHolderName || user.name || user.email,
          email: receiptEmail, // Use receipt_email for receipts
          phone: phone,
          companyNumber: companyNumber,
          externalId: `user_${userId}`,
        }
      });
    }
    
    if (!sumitResult.success) {
      console.error('[Payment] Sumit setPaymentMethod failed:', sumitResult.error);
      return res.status(400).json({ 
        error: sumitResult.error || 'שגיאה בשמירת כרטיס אשראי. אנא נסה שנית.',
        code: 'SUMIT_ERROR',
        technicalError: sumitResult.technicalError
      });
    }
    
    console.log(`[Payment] Sumit returned - CustomerID: ${sumitResult.customerId}, PaymentMethodID: ${sumitResult.paymentMethodId}`);
    
    // Deactivate any existing payment methods for this user
    await db.query(
      'UPDATE user_payment_methods SET is_active = false, is_default = false, updated_at = NOW() WHERE user_id = $1',
      [userId]
    );
    
    // Save the new payment method
    const result = await db.query(`
      INSERT INTO user_payment_methods (
        user_id, 
        card_token,           -- Sumit Payment Method ID
        card_last_digits, 
        card_expiry_month, 
        card_expiry_year, 
        card_holder_name, 
        citizen_id, 
        sumit_customer_id,
        is_active,
        is_default
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, true)
      RETURNING id, card_last_digits, card_expiry_month, card_expiry_year, card_holder_name, created_at
    `, [
      userId, 
      sumitResult.paymentMethodId?.toString() || 'stored',
      lastDigits || sumitResult.last4Digits || '****',
      expiryMonth || sumitResult.expiryMonth || null, 
      expiryYear || sumitResult.expiryYear || null, 
      cardHolderName,
      citizenId || null,
      sumitResult.customerId
    ]);
    
    // Update user's has_payment_method flag
    await db.query(
      'UPDATE users SET has_payment_method = true, updated_at = NOW() WHERE id = $1',
      [userId]
    );
    
    console.log(`[Payment] Successfully saved payment method for user ${userId}`);
    
    // Auto-create trial subscription if user doesn't have a paid subscription
    const TRIAL_DAYS = 14;
    const FREE_PLAN_ID = '00000000-0000-0000-0000-000000000001';
    
    const subCheck = await db.query(
      `SELECT us.id, us.status, us.plan_id, sp.price, us.sumit_standing_order_id, us.sumit_customer_id 
       FROM user_subscriptions us
       LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
       WHERE us.user_id = $1`,
      [userId]
    );
    
    let subscriptionCreated = false;
    
    // Check if admin set skip_trial for this user, or if trial was already used
    const skipTrialCheck = await db.query(
      `SELECT skip_trial, is_manual, trial_used_at FROM user_subscriptions WHERE user_id = $1`,
      [userId]
    );
    const adminSetSkipTrial = skipTrialCheck.rows[0]?.skip_trial === true;
    const isManualSubscription = skipTrialCheck.rows[0]?.is_manual === true;
    const trialAlreadyUsed = skipTrialCheck.rows[0]?.trial_used_at !== null;
    
    // Create trial if: no subscription, cancelled, or on Free plan
    // BUT NOT if admin explicitly set skip_trial, is_manual, or trial already used
    const existingSub = subCheck.rows[0];
    const shouldCreateTrial = !adminSetSkipTrial && !isManualSubscription && !trialAlreadyUsed && (
      !existingSub || 
      existingSub.status === 'cancelled' || 
      existingSub.plan_id === FREE_PLAN_ID ||
      (existingSub.price === 0 || existingSub.price === '0' || existingSub.price === null)
    );
    
    if (adminSetSkipTrial) {
      console.log(`[Payment] Skipping auto-trial for user ${userId} - admin set skip_trial`);
    } else if (isManualSubscription) {
      console.log(`[Payment] Skipping auto-trial for user ${userId} - has manual subscription`);
    } else if (trialAlreadyUsed) {
      console.log(`[Payment] Skipping auto-trial for user ${userId} - trial already used at ${skipTrialCheck.rows[0]?.trial_used_at}`);
    }
    
    if (shouldCreateTrial) {
      console.log(`[Payment] Auto-creating trial subscription for user ${userId} (current: ${existingSub?.status || 'none'}, plan: ${existingSub?.plan_id || 'none'})`);
      
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);
      
      // Check for custom discount plan first
      let planId = null;
      const customDiscountCheck = await db.query(
        `SELECT custom_discount_plan_id FROM user_subscriptions WHERE user_id = $1`,
        [userId]
      );
      
      if (customDiscountCheck.rows.length > 0 && customDiscountCheck.rows[0].custom_discount_plan_id) {
        planId = customDiscountCheck.rows[0].custom_discount_plan_id;
        console.log(`[Payment] Using custom discount plan: ${planId}`);
      }
      
      // Otherwise get the cheapest paid plan with allow_waha_creation
      if (!planId) {
        const planResult = await db.query(
          `SELECT id FROM subscription_plans 
           WHERE is_active = true AND price > 0 AND allow_waha_creation = true 
           ORDER BY price ASC LIMIT 1`
        );
        
        if (planResult.rows.length > 0) {
          planId = planResult.rows[0].id;
        }
      }
      
      if (planId) {
        const paymentMethodId = result.rows[0].id;
        
        // Get plan price for standing order
        const planPriceResult = await db.query(
          `SELECT price, name_he FROM subscription_plans WHERE id = $1`,
          [planId]
        );
        
        let standingOrderId = null;
        let chargeAmount = parseFloat(planPriceResult.rows[0]?.price || 0);
        const planNameHe = planPriceResult.rows[0]?.name_he || 'מנוי';
        
        // Check for custom discount from admin
        const existingCustomDiscount = await db.query(
          `SELECT custom_discount_mode, 
                  referral_discount_percent as custom_discount_percent, 
                  custom_fixed_price, 
                  custom_discount_plan_id, 
                  referral_discount_type as custom_discount_type
           FROM user_subscriptions WHERE user_id = $1`,
          [userId]
        );
        
        if (existingCustomDiscount.rows.length > 0) {
          const cd = existingCustomDiscount.rows[0];
          console.log(`[Payment] Custom discount check:`, cd);
          
          if (cd.custom_discount_mode === 'fixed_price' && cd.custom_fixed_price) {
            chargeAmount = parseFloat(cd.custom_fixed_price);
            console.log(`[Payment] Using fixed price: ${chargeAmount}`);
          } else if (cd.custom_discount_mode === 'percent' && cd.custom_discount_percent) {
            chargeAmount = chargeAmount * (1 - cd.custom_discount_percent / 100);
            console.log(`[Payment] Using percent discount (${cd.custom_discount_percent}%): ${chargeAmount}`);
          }
          
          // Use custom discount plan if set
          if (cd.custom_discount_plan_id) {
            planId = cd.custom_discount_plan_id;
            // Re-fetch plan name
            const customPlanResult = await db.query(
              `SELECT name_he FROM subscription_plans WHERE id = $1`,
              [planId]
            );
            if (customPlanResult.rows.length > 0) {
              planNameHe = customPlanResult.rows[0].name_he;
            }
            console.log(`[Payment] Using custom discount plan: ${planId} (${planNameHe})`);
          }
        }
        
        // Schedule charge in billing queue for trial end (self-managed billing)
        if (chargeAmount > 0) {
          try {
            console.log(`[Payment] Scheduling charge in billing queue for trial - amount: ${chargeAmount}, date: ${trialEndsAt.toISOString()}`);
            
            await billingQueueService.scheduleCharge({
              userId,
              subscriptionId: null, // Will be set after subscription created
              amount: chargeAmount,
              chargeDate: trialEndsAt.toISOString().split('T')[0],
              billingType: 'trial_conversion',
              planId: planId,
              description: `מנוי חודשי - ${planNameHe}`,
            });
            
            console.log(`[Payment] ✅ Charge scheduled in billing queue for ${trialEndsAt.toISOString().split('T')[0]}`);
          } catch (queueErr) {
            console.error(`[Payment] Error scheduling charge in queue:`, queueErr.message);
            // Continue anyway - we can manually handle this later
          }
        }
        
        await db.query(`
          INSERT INTO user_subscriptions (
            user_id, plan_id, status, is_trial, trial_ends_at, 
            payment_method_id, next_charge_date, started_at, sumit_customer_id,
            trial_used_at
          ) VALUES ($1, $2, 'trial', true, $3, $4, $3, NOW(), $5, NOW())
          ON CONFLICT (user_id) 
          DO UPDATE SET 
            plan_id = COALESCE(user_subscriptions.custom_discount_plan_id, $2), 
            status = 'trial',
            is_trial = true,
            trial_ends_at = $3,
            payment_method_id = $4,
            next_charge_date = $3,
            started_at = COALESCE(user_subscriptions.started_at, NOW()),
            sumit_customer_id = $5,
            trial_used_at = COALESCE(user_subscriptions.trial_used_at, NOW()),
            updated_at = NOW()
        `, [userId, planId, trialEndsAt, paymentMethodId, sumitResult.customerId]);
        
        subscriptionCreated = true;
        console.log(`[Payment] ✅ Trial subscription created, ends at: ${trialEndsAt.toISOString()}, charge scheduled in billing queue`);
      }
    } else {
      // User already has a subscription, just update the payment method
      await db.query(`
        UPDATE user_subscriptions 
        SET payment_method_id = $1, sumit_customer_id = $2, updated_at = NOW()
        WHERE user_id = $3
      `, [result.rows[0].id, sumitResult.customerId, userId]);
      console.log(`[Payment] Updated payment method on existing subscription (status: ${existingSub?.status})`);
      
      // If user has cancelled subscription and no standing order, charge immediately and reactivate
      // This happens when user already used their trial and wants to resubscribe
      if (existingSub?.status === 'cancelled' && !existingSub?.sumit_standing_order_id) {
        console.log(`[Payment] Cancelled subscription without standing order - charging IMMEDIATELY (trial already used)`);
        
        // Get plan price
        const planPriceResult = await db.query(
          `SELECT sp.price, sp.name_he, us.custom_discount_mode, us.custom_fixed_price, us.referral_discount_percent
           FROM user_subscriptions us
           JOIN subscription_plans sp ON us.plan_id = sp.id
           WHERE us.user_id = $1`,
          [userId]
        );
        
        if (planPriceResult.rows.length > 0) {
          const planData = planPriceResult.rows[0];
          let chargeAmount = parseFloat(planData.price || 0);
          
          // Apply custom discount - use consistent calculation: floor(price * (1 - percent/100))
          if (planData.custom_discount_mode === 'fixed_price' && planData.custom_fixed_price) {
            chargeAmount = parseFloat(planData.custom_fixed_price);
          } else if (planData.custom_discount_mode === 'percent' && planData.referral_discount_percent) {
            chargeAmount = Math.floor(chargeAmount * (1 - planData.referral_discount_percent / 100));
          }
          
          if (chargeAmount > 0 && sumitResult.customerId) {
            // Calculate next charge date (1 month from now)
            const nextChargeDate = new Date();
            nextChargeDate.setMonth(nextChargeDate.getMonth() + 1);
            
            // Charge IMMEDIATELY with one-time charge (self-managed billing)
            console.log(`[Payment] Charging immediately: ${chargeAmount} ILS`);
            const chargeResult = await sumitService.chargeOneTime({
              customerId: sumitResult.customerId,
              amount: chargeAmount,
              description: `מנוי חודשי - ${planData.name_he}`,
              sendEmail: true
            });
            
            if (chargeResult.success) {
              // Update subscription and reactivate
              try {
                // Get subscription ID first
                const subIdResult = await db.query(
                  `SELECT id FROM user_subscriptions WHERE user_id = $1`,
                  [userId]
                );
                const subscriptionId = subIdResult.rows[0]?.id;
                
                await db.query(`
                  UPDATE user_subscriptions 
                  SET status = 'active',
                      is_trial = false,
                      cancelled_at = NULL,
                      next_charge_date = $1,
                      expires_at = $1,
                      started_at = NOW(),
                      updated_at = NOW()
                  WHERE user_id = $2
                `, [nextChargeDate, userId]);
                
                // Schedule next month's charge in billing queue
                await billingQueueService.scheduleCharge({
                  userId,
                  subscriptionId,
                  amount: chargeAmount,
                  chargeDate: nextChargeDate.toISOString().split('T')[0],
                  billingType: 'monthly',
                  planId: existingSub?.plan_id,
                  description: `מנוי חודשי - ${planData.name_he}`,
                });
                
                // Log payment
                await db.query(`
                  INSERT INTO payment_history (user_id, subscription_id, amount, status, sumit_transaction_id, sumit_document_number, description)
                  VALUES ($1, $2, $3, 'success', $4, $5, $6)
                `, [userId, subscriptionId, chargeAmount, chargeResult.transactionId, chargeResult.documentNumber, `מנוי חודשי - ${planData.name_he}`]);
                
                subscriptionCreated = true;
                console.log(`[Payment] ✅ Charged immediately and scheduled next charge for ${nextChargeDate.toISOString().split('T')[0]}`);
              } catch (dbErr) {
                console.error(`[Payment] CRITICAL: Charge succeeded but DB update failed for user ${userId}:`, dbErr.message);
                
                // Notify admin
                try {
                  await db.query(`
                    INSERT INTO notifications (user_id, notification_type, title, message, metadata, is_admin_notification)
                    VALUES ($1, 'payment_error', 'שגיאת DB אחרי חיוב מוצלח', $2, $3, true)
                  `, [
                    userId,
                    `חיוב בוצע בהצלחה אך עדכון המסד נכשל. יש לעדכן ידנית.`,
                    JSON.stringify({ userId, chargeResult, amount: chargeAmount, error: dbErr.message })
                  ]);
                } catch (notifyErr) {
                  console.error('[Payment] Failed to notify admin:', notifyErr.message);
                }
                
                subscriptionCreated = true;
              }
            } else {
              console.error(`[Payment] Failed to charge for reactivation: ${chargeResult.error}`);
              return res.status(400).json({
                error: chargeResult.error || 'החיוב נכשל. אנא בדוק את פרטי האשראי.',
                code: 'CHARGE_FAILED',
                trialNotAvailable: true
              });
            }
          }
        }
      }
    }
    
    // Get updated subscription info for response
    const updatedSub = await db.query(`
      SELECT us.*, sp.name as plan_name, sp.name_he as plan_name_he
      FROM user_subscriptions us
      LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE us.user_id = $1
    `, [userId]);
    
    // Determine the appropriate message
    let responseMessage = 'הכרטיס נשמר בהצלחה!';
    let wasChargedImmediately = false;
    
    if (subscriptionCreated) {
      // Check if this was a trial or immediate charge (trial already used)
      if (trialAlreadyUsed) {
        responseMessage = 'מעולה! הכרטיס נשמר והמנוי הופעל. בוצע חיוב מיידי (תקופת הניסיון כבר נוצלה).';
        wasChargedImmediately = true;
      } else {
        responseMessage = 'מעולה! הכרטיס נשמר ומנוי הניסיון שלך הופעל. אפשר להמשיך!';
      }
    }
    
    res.json({ 
      success: true, 
      paymentMethod: result.rows[0],
      message: responseMessage,
      subscription: updatedSub.rows[0] || null,
      trialCreated: subscriptionCreated && !trialAlreadyUsed,
      chargedImmediately: wasChargedImmediately
    });
  } catch (error) {
    console.error('[Payment] Save payment method error:', error);
    res.status(500).json({ 
      error: 'שגיאה בשמירת אמצעי תשלום. אנא נסה שנית.',
      code: 'SERVER_ERROR'
    });
  }
}

/**
 * Get user's payment methods
 */
async function getPaymentMethods(req, res) {
  try {
    const userId = req.user.id;
    
    const result = await db.query(`
      SELECT id, card_last_digits, card_expiry_month, card_expiry_year, 
             card_holder_name, is_default, created_at
      FROM user_payment_methods
      WHERE user_id = $1 AND is_active = true
      ORDER BY is_default DESC, created_at DESC
    `, [userId]);
    
    res.json({ paymentMethods: result.rows });
  } catch (error) {
    console.error('[Payment] Get payment methods error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת אמצעי תשלום' });
  }
}

/**
 * Delete a payment method
 * Service continues until subscription period ends
 */
async function deletePaymentMethod(req, res) {
  try {
    const userId = req.user.id;
    const { methodId } = req.params;
    
    // Get the payment method to delete
    const methodResult = await db.query(
      'SELECT * FROM user_payment_methods WHERE id = $1 AND user_id = $2',
      [methodId, userId]
    );
    
    if (methodResult.rows.length === 0) {
      return res.status(404).json({ error: 'אמצעי תשלום לא נמצא' });
    }
    
    // Check if user has an active subscription
    const subCheck = await db.query(
      `SELECT us.id, us.status, us.expires_at, us.trial_ends_at, us.sumit_standing_order_id
       FROM user_subscriptions us
       WHERE us.user_id = $1 AND us.status IN ('active', 'trial')`,
      [userId]
    );
    
    // Soft delete the payment method
    await db.query(`
      UPDATE user_payment_methods 
      SET is_active = false, updated_at = NOW()
      WHERE id = $1 AND user_id = $2
    `, [methodId, userId]);
    
    // Check if user has any remaining payment methods
    const remaining = await db.query(
      'SELECT COUNT(*) as count FROM user_payment_methods WHERE user_id = $1 AND is_active = true',
      [userId]
    );
    
    const hasRemainingMethods = parseInt(remaining.rows[0].count) > 0;
    
    if (!hasRemainingMethods) {
      await db.query(
        'UPDATE users SET has_payment_method = false, updated_at = NOW() WHERE id = $1',
        [userId]
      );
    }
    
    let message = 'אמצעי התשלום הוסר בהצלחה';

    // If there was an active subscription and no remaining payment methods
    if (subCheck.rows.length > 0 && !hasRemainingMethods) {
      const sub = subCheck.rows[0];

      // Cancel future renewals in Sumit
      if (sub.sumit_standing_order_id) {
        try {
          await sumitService.cancelRecurring(sub.sumit_standing_order_id, sub.sumit_customer_id);
          console.log(`[Payment] Cancelled Sumit standing order ${sub.sumit_standing_order_id}`);
        } catch (err) {
          console.error('[Payment] Failed to cancel Sumit recurring:', err.message);
        }
      }

      // Mark subscription as cancelled (service continues until period ends)
      await db.query(
        `UPDATE user_subscriptions
         SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
         WHERE user_id = $1 AND status IN ('active', 'trial')`,
        [userId]
      );

      const endDate = sub.status === 'trial' ? sub.trial_ends_at : sub.expires_at;
      if (endDate) {
        const formattedDate = new Date(endDate).toLocaleDateString('he-IL');
        message = `המנוי בוטל. השירות ימשיך לפעול עד ${formattedDate}`;
      } else {
        message = 'המנוי בוטל';
      }
    }

    // If free plan is 'while_credit' mode and user has no remaining payment methods,
    // disconnect their managed WAHA sessions
    if (!hasRemainingMethods) {
      try {
        const freePlanCheck = await db.query(
          `SELECT sp.waha_credit_requirement
           FROM user_subscriptions us
           JOIN subscription_plans sp ON sp.id = us.plan_id
           WHERE us.user_id = $1 AND sp.waha_credit_requirement = 'while_credit'
           LIMIT 1`,
          [userId]
        );

        if (freePlanCheck.rows.length > 0) {
          // Disconnect all managed WAHA sessions for this user
          const sessions = await db.query(
            `SELECT id, waha_instance_name FROM whatsapp_connections
             WHERE user_id = $1 AND connection_type = 'managed' AND status = 'connected'`,
            [userId]
          );

          if (sessions.rows.length > 0) {
            const { getWahaCredentials } = require('../../services/settings/system.service');
            const wahaSession = require('../../services/waha/session.service');
            const { baseUrl, apiKey } = getWahaCredentials();

            for (const session of sessions.rows) {
              try {
                if (baseUrl && apiKey && session.waha_instance_name) {
                  await wahaSession.deleteSession(baseUrl, apiKey, session.waha_instance_name);
                }
                await db.query(
                  `UPDATE whatsapp_connections SET status = 'disconnected', updated_at = NOW() WHERE id = $1`,
                  [session.id]
                );
                console.log(`[Payment] Disconnected WAHA session ${session.waha_instance_name} (while_credit mode, no payment method)`);
              } catch (err) {
                console.error(`[Payment] Failed to disconnect WAHA session ${session.waha_instance_name}:`, err.message);
              }
            }
            message += ' | חיבורי WhatsApp נותקו (דורש אשראי פעיל)';
          }
        }
      } catch (err) {
        console.error('[Payment] Error checking while_credit WAHA disconnect:', err.message);
      }
    }

    res.json({ success: true, message });
  } catch (error) {
    console.error('[Payment] Delete payment method error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת אמצעי תשלום' });
  }
}

/**
 * Subscribe to a plan
 * Supports promotions/coupons with introductory pricing
 */
async function subscribe(req, res) {
  try {
    const userId = req.user.id;
    const { planId, paymentMethodId, billingPeriod = 'monthly', couponCode, promotionId, referralCode, isUpgrade, proratedAmount } = req.body;
    
    // Check existing subscription status
    const existingSubCheck = await db.query(
      `SELECT us.*, sp.name as plan_name, sp.price as plan_price
       FROM user_subscriptions us
       LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
       WHERE us.user_id = $1`,
      [userId]
    );
    
    const existingSub = existingSubCheck.rows[0];
    
    // PREVENT DOUBLE CHARGE - Check if user already has an active paid subscription on same plan
    if (existingSub && existingSub.status === 'active' && existingSub.plan_id === planId && !isUpgrade) {
      console.log(`[Payment] User ${userId} already has active subscription to plan ${planId}`);
      return res.status(400).json({ 
        error: 'כבר יש לך מנוי פעיל לתכנית זו',
        code: 'ALREADY_SUBSCRIBED',
        subscription: existingSub
      });
    }
    
    // If user has a trial on the SAME plan, just return success without charging
    // They'll be charged when trial ends
    if (existingSub && existingSub.status === 'trial' && existingSub.plan_id === planId && !isUpgrade) {
      console.log(`[Payment] User ${userId} already has trial to plan ${planId} - no need to subscribe again`);
      return res.json({ 
        success: true, 
        subscription: existingSub,
        message: 'יש לך כבר מנוי ניסיון פעיל',
        trial: true,
        trialEndsAt: existingSub.trial_ends_at
      });
    }
    
    // Get plan info
    const planResult = await db.query(
      'SELECT * FROM subscription_plans WHERE id = $1 AND is_active = true',
      [planId]
    );
    
    if (planResult.rows.length === 0) {
      return res.status(404).json({ error: 'תכנית לא נמצאה' });
    }
    const plan = planResult.rows[0];
    
    // Check if plan is free
    const isFree = parseFloat(plan.price) === 0;
    
    let paymentMethod = null;
    
    if (!isFree) {
      // Get payment method
      const paymentResult = await db.query(
        'SELECT * FROM user_payment_methods WHERE id = $1 AND user_id = $2 AND is_active = true',
        [paymentMethodId, userId]
      );
      
      if (paymentResult.rows.length === 0) {
        return res.status(400).json({ 
          error: 'אמצעי תשלום לא נמצא. אנא הוסף כרטיס אשראי.',
          code: 'NO_PAYMENT_METHOD'
        });
      }
      paymentMethod = paymentResult.rows[0];
      
      if (!paymentMethod.sumit_customer_id) {
        return res.status(400).json({ 
          error: 'אמצעי תשלום לא תקין. אנא הוסף כרטיס אשראי חדש.',
          code: 'INVALID_PAYMENT_METHOD'
        });
      }
    }
    
    // Check for promotion/coupon
    let promotion = null;
    let coupon = null;
    let isNewUser = false;
    
    // Check if user is new (never paid before)
    const userCheck = await db.query(
      'SELECT has_ever_paid FROM users WHERE id = $1',
      [userId]
    );
    isNewUser = !userCheck.rows[0]?.has_ever_paid;
    
    // Check for coupon code (from coupons table)
    if (couponCode) {
      const couponResult = await db.query(`
        SELECT * FROM coupons 
        WHERE UPPER(code) = UPPER($1) 
        AND is_active = true
        AND (start_date IS NULL OR start_date <= NOW())
        AND (end_date IS NULL OR end_date > NOW())
        AND (max_uses IS NULL OR current_uses < max_uses)
      `, [couponCode]);
      
      if (couponResult.rows.length > 0) {
        const c = couponResult.rows[0];
        
        // Validate coupon
        const validPlan = !c.plan_id || c.plan_id === planId;
        const validUser = !c.is_new_users_only || isNewUser;
        
        if (!validPlan) {
          return res.status(400).json({ error: 'הקופון לא תקף לתכנית זו', code: 'COUPON_WRONG_PLAN' });
        }
        if (!validUser) {
          return res.status(400).json({ error: 'הקופון מיועד למשתמשים חדשים בלבד', code: 'COUPON_NEW_USERS_ONLY' });
        }
        
        // Check usage per user
        const userUsage = await db.query(
          'SELECT COUNT(*) as count FROM coupon_usage WHERE coupon_id = $1 AND user_id = $2',
          [c.id, userId]
        );
        if (parseInt(userUsage.rows[0].count) >= c.max_uses_per_user) {
          return res.status(400).json({ error: 'כבר השתמשת בקופון זה', code: 'COUPON_ALREADY_USED' });
        }
        
        coupon = c;
        console.log(`[Payment] Valid coupon found: ${c.code} - ${c.discount_type} ${c.discount_value}`);
      } else {
        return res.status(400).json({ error: 'קוד קופון לא תקף', code: 'INVALID_COUPON' });
      }
    }
    
    // Check for promotion (auto-applied promotions from promotions table)
    if (promotionId) {
      const promoResult = await db.query(
        'SELECT * FROM promotions WHERE id = $1 AND is_active = true',
        [promotionId]
      );
      
      if (promoResult.rows.length > 0) {
        const promo = promoResult.rows[0];
        const now = new Date();
        const validTime = (!promo.start_date || new Date(promo.start_date) <= now) &&
                         (!promo.end_date || new Date(promo.end_date) > now);
        const validPlan = !promo.plan_id || promo.plan_id === planId;
        const validUser = !promo.is_new_users_only || isNewUser;
        
        if (validTime && validPlan && validUser) {
          promotion = promo;
        }
      }
    }
    
    // Check for admin-set custom discount for this user
    let adminCustomDiscount = null;
    const customDiscountCheck = await db.query(`
      SELECT custom_discount_mode, referral_discount_percent as custom_discount_percent, 
             custom_fixed_price, referral_discount_type as custom_discount_type,
             referral_months_remaining as custom_discount_months, custom_discount_plan_id, skip_trial
      FROM user_subscriptions 
      WHERE user_id = $1 
      AND (custom_discount_mode IS NOT NULL OR custom_fixed_price IS NOT NULL OR referral_discount_percent IS NOT NULL)
    `, [userId]);
    
    if (customDiscountCheck.rows.length > 0) {
      adminCustomDiscount = customDiscountCheck.rows[0];
      console.log(`[Payment] Found admin custom discount for user ${userId}:`, adminCustomDiscount);
    }

    const now = new Date();
    // Check if trial should be skipped (admin setting)
    const skipTrial = adminCustomDiscount?.skip_trial || false;
    const hasTrial = !skipTrial && plan.trial_days > 0;
    const originalPrice = parseFloat(plan.price);
    
    // Calculate price (with coupon or promotion)
    let chargeAmount = originalPrice;
    let regularPriceAfterPromo = null;
    let promoMonthsRemaining = 0;
    let discountAmount = 0;
    
    // Apply coupon discount
    if (coupon) {
      if (coupon.discount_type === 'percentage') {
        discountAmount = (originalPrice * parseFloat(coupon.discount_value)) / 100;
      } else {
        discountAmount = parseFloat(coupon.discount_value);
      }
      chargeAmount = Math.max(0, originalPrice - discountAmount);
      
      // Set duration
      if (coupon.duration_type === 'forever') {
        regularPriceAfterPromo = null; // Forever discount
        promoMonthsRemaining = -1; // -1 means forever
      } else if (coupon.duration_type === 'months' && coupon.duration_months) {
        regularPriceAfterPromo = originalPrice;
        promoMonthsRemaining = coupon.duration_months;
      } else {
        // 'once' - only first payment
        regularPriceAfterPromo = originalPrice;
        promoMonthsRemaining = 1;
      }
      
      console.log(`[Payment] Applying coupon ${coupon.code}: ${chargeAmount} ILS (${coupon.duration_type})`);
    }
    // Apply promotion discount (only if no coupon)
    else if (promotion) {
      if (promotion.discount_type === 'percentage') {
        discountAmount = (originalPrice * parseFloat(promotion.discount_value)) / 100;
      } else {
        discountAmount = parseFloat(promotion.discount_value);
      }
      chargeAmount = Math.max(0, originalPrice - discountAmount);
      regularPriceAfterPromo = originalPrice;
      promoMonthsRemaining = promotion.promo_months || 1;
      
      console.log(`[Payment] Applying promotion ${promotion.id}: ${chargeAmount} ILS for ${promoMonthsRemaining} months`);
    }
    
    // Apply admin custom discount (takes priority over referral, but not over coupon/promotion)
    if (adminCustomDiscount && !coupon && !promotion) {
      const mode = adminCustomDiscount.custom_discount_mode;
      const customPercent = parseFloat(adminCustomDiscount.custom_discount_percent) || 0;
      const fixedPrice = parseFloat(adminCustomDiscount.custom_fixed_price);
      
      if (mode === 'fixed_price' && !isNaN(fixedPrice)) {
        // Fixed price from admin
        const basePrice = billingPeriod === 'yearly' ? originalPrice * 12 * 0.8 : originalPrice;
        chargeAmount = fixedPrice;
        if (billingPeriod === 'yearly') {
          chargeAmount = fixedPrice * 12; // Annual payment
        }
        console.log(`[Payment] Applying admin fixed price: ${chargeAmount} ILS (original: ${basePrice})`);
      } else if (mode === 'percent' && customPercent > 0) {
        // Percentage discount from admin
        const basePrice = billingPeriod === 'yearly' ? originalPrice * 12 * 0.8 : originalPrice;
        discountAmount = Math.floor(basePrice * (customPercent / 100));
        chargeAmount = Math.max(0, basePrice - discountAmount);
        console.log(`[Payment] Applying admin discount ${customPercent}%: ${chargeAmount} ILS (original: ${basePrice})`);
      }
      
      // Set duration from admin settings
      const discountType = adminCustomDiscount.custom_discount_type;
      if (discountType === 'forever') {
        regularPriceAfterPromo = null;
        promoMonthsRemaining = -1;
      } else if (discountType === 'first_year') {
        regularPriceAfterPromo = billingPeriod === 'yearly' ? originalPrice * 12 * 0.8 : originalPrice;
        promoMonthsRemaining = adminCustomDiscount.custom_discount_months || 12;
      } else if (discountType === 'custom_months') {
        regularPriceAfterPromo = billingPeriod === 'yearly' ? originalPrice * 12 * 0.8 : originalPrice;
        promoMonthsRemaining = adminCustomDiscount.custom_discount_months || 1;
      } else {
        // first_payment
        regularPriceAfterPromo = billingPeriod === 'yearly' ? originalPrice * 12 * 0.8 : originalPrice;
        promoMonthsRemaining = 1;
      }
    }
    
    // Apply referral discount for new users only (only if no admin discount, coupon, or promotion)
    let referralDiscount = 0;
    let referralClickId = null;
    let referralDiscountType = null;
    let referralDiscountPercent = 0;
    let referralMonthsRemaining = 0;
    let referralRegularPrice = null;
    
    if (referralCode && isNewUser && !coupon && !promotion && !adminCustomDiscount) {
      // First, get the affiliate to check for custom settings
      const affiliateResult = await db.query(
        `SELECT a.custom_discount_percent, a.custom_discount_type, a.custom_discount_months 
         FROM affiliates a WHERE a.ref_code = $1`,
        [referralCode.toUpperCase()]
      );
      
      // Get global discount settings
      const settingsResult = await db.query(`
        SELECT referral_discount_percent, referral_discount_type, referral_discount_months FROM affiliate_settings LIMIT 1
      `);
      
      if (settingsResult.rows.length > 0) {
        const settings = settingsResult.rows[0];
        const aff = affiliateResult.rows[0] || {};
        
        // Use affiliate custom settings if available, otherwise use global
        referralDiscountPercent = aff.custom_discount_percent ?? settings.referral_discount_percent ?? 10;
        referralDiscountType = aff.custom_discount_type || settings.referral_discount_type || 'first_payment';
        const discountMonths = aff.custom_discount_months ?? settings.referral_discount_months;
        
        // Calculate base amount first (with yearly discount if applicable)
        let baseForReferral = originalPrice;
        if (billingPeriod === 'yearly') {
          baseForReferral = originalPrice * 12 * 0.8;
        }
        
        // Use consistent calculation: floor(price * (1 - percent/100))
        chargeAmount = Math.floor(baseForReferral * (1 - referralDiscountPercent / 100));
        referralDiscount = baseForReferral - chargeAmount;
        
        // Set referral duration tracking based on type
        if (referralDiscountType === 'custom_months' && discountMonths) {
          referralMonthsRemaining = discountMonths;
          referralRegularPrice = baseForReferral;
        } else if (referralDiscountType === 'first_year') {
          referralMonthsRemaining = 12;
          referralRegularPrice = baseForReferral;
        } else if (referralDiscountType === 'forever') {
          referralMonthsRemaining = -1; // -1 means forever
        } else {
          // first_payment - no ongoing tracking needed
          referralMonthsRemaining = 0;
        }
        
        console.log(`[Payment] Applying referral discount ${referralDiscountPercent}% (type: ${referralDiscountType}, months: ${referralMonthsRemaining}): -${referralDiscount} ILS, final: ${chargeAmount} ILS`);
        
        // Get click ID for attribution
        const clickResult = await db.query(
          `SELECT id FROM affiliate_clicks WHERE user_id = $1 ORDER BY clicked_at DESC LIMIT 1`,
          [userId]
        );
        if (clickResult.rows.length > 0) {
          referralClickId = clickResult.rows[0].id;
        }
      }
    }
    
    let nextChargeDate = new Date(now);
    let expiresAt = null;
    
    if (billingPeriod === 'yearly' && !promotion && !referralDiscount) {
      chargeAmount = parseFloat(plan.price) * 12 * 0.8; // 20% discount
      nextChargeDate.setFullYear(nextChargeDate.getFullYear() + 1);
      expiresAt = new Date(nextChargeDate);
    } else if (billingPeriod === 'yearly') {
      nextChargeDate.setFullYear(nextChargeDate.getFullYear() + 1);
      expiresAt = new Date(nextChargeDate);
    } else {
      nextChargeDate.setMonth(nextChargeDate.getMonth() + 1);
      expiresAt = new Date(nextChargeDate);
    }
    
    // Handle free plan
    if (isFree) {
      const subResult = await db.query(`
        INSERT INTO user_subscriptions (
          user_id, plan_id, status, is_trial, billing_period
        ) VALUES ($1, $2, 'active', false, 'monthly')
        ON CONFLICT (user_id) 
        DO UPDATE SET 
          plan_id = $2, 
          status = 'active',
          is_trial = false,
          cancelled_at = NULL,
          payment_method_id = NULL,
          sumit_customer_id = NULL,
          sumit_standing_order_id = NULL,
          next_charge_date = NULL,
          expires_at = NULL,
          billing_period = 'monthly',
          active_promotion_id = NULL,
          promo_months_remaining = 0,
          updated_at = NOW()
        RETURNING *
      `, [userId, planId]);
      
      return res.json({ 
        success: true, 
        subscription: subResult.rows[0],
        message: 'המנוי החינמי הופעל בהצלחה',
        trial: false
      });
    }
    
    // Handle trial period
    if (hasTrial) {
      const trialEnds = new Date(now);
      trialEnds.setDate(trialEnds.getDate() + plan.trial_days);
      
      // Determine promo price from admin discount, coupon, or promotion
      const effectivePromoPrice = adminCustomDiscount ? chargeAmount : (promotion ? chargeAmount : null);
      
      const subResult = await db.query(`
        INSERT INTO user_subscriptions (
          user_id, plan_id, status, is_trial, trial_ends_at, 
          payment_method_id, next_charge_date, sumit_customer_id, billing_period, expires_at,
          active_promotion_id, promo_months_remaining, promo_price, regular_price_after_promo
        ) VALUES ($1, $2, 'trial', true, $3, $4, $3, $5, $6, $3, $7, $8, $9, $10)
        ON CONFLICT (user_id) 
        DO UPDATE SET 
          plan_id = $2, 
          status = 'trial',
          is_trial = true,
          cancelled_at = NULL,
          trial_ends_at = $3,
          payment_method_id = $4,
          next_charge_date = $3,
          sumit_customer_id = $5,
          billing_period = $6,
          expires_at = $3,
          active_promotion_id = COALESCE($7, user_subscriptions.active_promotion_id),
          promo_months_remaining = CASE WHEN $8 > 0 THEN $8 ELSE user_subscriptions.promo_months_remaining END,
          promo_price = COALESCE($9, user_subscriptions.promo_price),
          regular_price_after_promo = COALESCE($10, user_subscriptions.regular_price_after_promo),
          -- Preserve admin custom discount settings
          custom_discount_mode = COALESCE(user_subscriptions.custom_discount_mode, custom_discount_mode),
          custom_fixed_price = COALESCE(user_subscriptions.custom_fixed_price, custom_fixed_price),
          custom_discount_plan_id = COALESCE(user_subscriptions.custom_discount_plan_id, custom_discount_plan_id),
          skip_trial = COALESCE(user_subscriptions.skip_trial, skip_trial),
          updated_at = NOW()
        RETURNING *
      `, [
        userId, planId, trialEnds, paymentMethodId, paymentMethod.sumit_customer_id, billingPeriod,
        promotion?.id || null, promoMonthsRemaining, effectivePromoPrice, regularPriceAfterPromo
      ]);
      
      // Record promotion or coupon use if applicable
      if (promotion) {
        await recordPromotionUse(userId, promotion.id, subResult.rows[0].id, chargeAmount, regularPriceAfterPromo, promoMonthsRemaining);
      }
      if (coupon) {
        await db.query(`
          INSERT INTO coupon_usage (coupon_id, user_id, subscription_id, discount_applied)
          VALUES ($1, $2, $3, $4)
        `, [coupon.id, userId, subResult.rows[0].id, discountAmount]);
        await db.query('UPDATE coupons SET current_uses = current_uses + 1 WHERE id = $1', [coupon.id]);
      }
      
      return res.json({ 
        success: true, 
        subscription: subResult.rows[0],
        message: `תקופת ניסיון של ${plan.trial_days} ימים התחילה`,
        trial: true,
        trialEndsAt: trialEnds,
        promotion: promotion ? {
          promoPrice: chargeAmount,
          promoMonths: promoMonthsRemaining,
          regularPrice: regularPriceAfterPromo
        } : null,
        coupon: coupon ? {
          code: coupon.code,
          discount: discountAmount,
          duration: coupon.duration_type
        } : null
      });
    }
    
    // Charge immediately with one-time charge (self-managed billing)
    let chargeResult;
    const periodLabel = billingPeriod === 'yearly' ? 'שנתי' : 'חודשי';
    
    let description = `מנוי ${periodLabel} - ${plan.name_he}`;
    if (promotion) {
      description = `${plan.name_he} - מבצע ${promotion.promo_months} חודשים`;
    }
    if (isUpgrade) {
      description = `שדרוג ל-${plan.name_he} (${periodLabel})`;
    }
    if (referralDiscount > 0) {
      description += ' + הנחת חבר';
    }
    
    // For upgrades, use the prorated amount instead of full price
    let actualChargeAmount = chargeAmount;
    if (isUpgrade && proratedAmount !== undefined && proratedAmount >= 0) {
      actualChargeAmount = proratedAmount;
      console.log(`[Payment] Upgrade - using prorated amount: ${actualChargeAmount} ILS (original: ${chargeAmount} ILS)`);
    }
    
    console.log(`[Payment] Charging user ${userId} - Amount: ${actualChargeAmount} ILS, Period: ${billingPeriod}, Promo: ${promotion?.id || 'none'}, Upgrade: ${isUpgrade || false}`);
    
    // Charge immediately with one-time charge
    chargeResult = await sumitService.chargeOneTime({
      customerId: paymentMethod.sumit_customer_id,
      amount: actualChargeAmount,
      description: description,
      sendEmail: true
    });
    
    if (!chargeResult.success) {
      console.error('[Payment] Charge failed:', chargeResult.error);
      
      // Log failed payment attempt
      try {
        await db.query(`
          INSERT INTO payment_history (
            user_id, amount, status, error_message, description
          ) VALUES ($1, $2, 'failed', $3, $4)
        `, [userId, actualChargeAmount, chargeResult.error, `ניסיון חיוב נכשל - ${description}`]);
      } catch (logErr) {
        console.error('[Payment] Failed to log payment failure:', logErr);
      }
      
      // Notify admin about payment failure
      try {
        await db.query(`
          INSERT INTO notifications (
            user_id, notification_type, title, message, metadata, is_admin_notification
          ) VALUES ($1, 'payment_failure', 'חיוב נכשל', $2, $3, true)
        `, [
          userId, 
          `חיוב של ₪${actualChargeAmount} נכשל עבור ${plan.name_he}: ${chargeResult.error}`,
          JSON.stringify({ userId, amount: actualChargeAmount, planId, error: chargeResult.error })
        ]);
        console.log('[Payment] Admin notified about payment failure');
      } catch (notifyErr) {
        console.error('[Payment] Failed to notify admin:', notifyErr);
      }
      
      return res.status(400).json({ 
        error: chargeResult.error || 'החיוב נכשל. אנא בדוק את פרטי האשראי.',
        code: 'CHARGE_FAILED'
      });
    }
    
    console.log(`[Payment] Charge successful - Transaction: ${chargeResult.transactionId}`);
    
    // Log successful payment
    try {
      await db.query(`
        INSERT INTO payment_history (
          user_id, amount, status, sumit_transaction_id, sumit_document_number, description
        ) VALUES ($1, $2, 'success', $3, $4, $5)
      `, [userId, actualChargeAmount, chargeResult.transactionId, chargeResult.documentNumber, description]);
    } catch (logErr) {
      console.error('[Payment] Failed to log successful payment:', logErr);
    }
    
    // Ensure referral discount columns exist
    await db.query(`
      DO $$ BEGIN
        ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS referral_discount_type VARCHAR(50);
        ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS referral_discount_percent INTEGER;
        ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS referral_months_remaining INTEGER DEFAULT 0;
        ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS referral_regular_price DECIMAL(10,2);
      EXCEPTION WHEN others THEN NULL;
      END $$;
    `);
    
    // Save subscription with promotion and referral info (no standing order - self-managed billing)
    const subResult = await db.query(`
      INSERT INTO user_subscriptions (
        user_id, plan_id, status, payment_method_id, 
        sumit_customer_id, next_charge_date, billing_period, expires_at,
        active_promotion_id, promo_months_remaining, promo_price, regular_price_after_promo,
        referral_discount_type, referral_discount_percent, referral_months_remaining, referral_regular_price
      ) VALUES ($1, $2, 'active', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        plan_id = $2, 
        status = 'active',
        is_trial = false,
        cancelled_at = NULL,
        payment_method_id = $3,
        sumit_customer_id = $4,
        next_charge_date = $5,
        billing_period = $6,
        expires_at = $7,
        active_promotion_id = $8,
        promo_months_remaining = $9,
        promo_price = $10,
        regular_price_after_promo = $11,
        referral_discount_type = COALESCE($12, user_subscriptions.referral_discount_type),
        referral_discount_percent = COALESCE($13, user_subscriptions.referral_discount_percent),
        referral_months_remaining = CASE 
          WHEN $12 IS NOT NULL THEN $14 
          ELSE GREATEST(0, COALESCE(user_subscriptions.referral_months_remaining, 0) - 1)
        END,
        referral_regular_price = COALESCE($15, user_subscriptions.referral_regular_price),
        updated_at = NOW()
      RETURNING *
    `, [
      userId, planId, paymentMethodId, 
      paymentMethod.sumit_customer_id, 
      nextChargeDate,
      billingPeriod,
      expiresAt,
      promotion?.id || null,
      promoMonthsRemaining > 0 ? promoMonthsRemaining - 1 : 0,
      promotion ? chargeAmount : null,
      regularPriceAfterPromo,
      referralDiscountType,
      referralDiscountPercent > 0 ? referralDiscountPercent : null,
      referralMonthsRemaining > 0 ? referralMonthsRemaining - 1 : referralMonthsRemaining,
      referralRegularPrice
    ]);
    
    // Schedule next charge in billing queue
    const billingType = billingPeriod === 'yearly' ? 'yearly' : 'monthly';
    const nextAmount = promotion ? chargeAmount : (referralDiscount > 0 ? chargeAmount : originalPrice);
    
    await billingQueueService.scheduleCharge({
      userId,
      subscriptionId: subResult.rows[0].id,
      amount: nextAmount,
      chargeDate: nextChargeDate.toISOString().split('T')[0],
      billingType,
      planId,
      description: `מנוי ${periodLabel} - ${plan.name_he}`,
    });
    
    console.log(`[Payment] Scheduled next ${billingType} charge for ${nextChargeDate.toISOString().split('T')[0]}`);
    
    // Mark user as having paid
    await db.query(
      'UPDATE users SET has_ever_paid = true, updated_at = NOW() WHERE id = $1',
      [userId]
    );
    
    // Record referral conversion if applicable
    if (referralClickId && referralDiscount > 0) {
      try {
        // Update the click with conversion
        await db.query(`
          UPDATE affiliate_clicks 
          SET converted_at = NOW(), converted_amount = $1 
          WHERE id = $2
        `, [actualChargeAmount, referralClickId]);
        
        console.log(`[Payment] Recorded referral conversion: click ${referralClickId}, amount ${actualChargeAmount}`);
      } catch (refErr) {
        console.error('[Payment] Failed to record referral conversion:', refErr);
      }
    }
    
    // Record promotion or coupon use
    if (promotion) {
      await recordPromotionUse(userId, promotion.id, subResult.rows[0].id, chargeAmount, regularPriceAfterPromo, promoMonthsRemaining);
      
      // Increment promotion usage counter
      await db.query(
        'UPDATE promotions SET current_uses = current_uses + 1 WHERE id = $1',
        [promotion.id]
      );
    }
    
    if (coupon) {
      // Record coupon usage
      await db.query(`
        INSERT INTO coupon_usage (coupon_id, user_id, subscription_id, discount_applied)
        VALUES ($1, $2, $3, $4)
      `, [coupon.id, userId, subResult.rows[0].id, discountAmount]);
      
      // Increment coupon usage counter
      await db.query(
        'UPDATE coupons SET current_uses = current_uses + 1 WHERE id = $1',
        [coupon.id]
      );
    }
    
    // Log payment history
    await db.query(`
      INSERT INTO payment_history (
        user_id, subscription_id, payment_method_id, 
        amount, status, sumit_transaction_id, sumit_document_number, description
      ) VALUES ($1, $2, $3, $4, 'success', $5, $6, $7)
    `, [
      userId, subResult.rows[0].id, paymentMethodId, 
      actualChargeAmount, chargeResult.transactionId, chargeResult.documentNumber,
      description
    ]);
    
    let message = 'המנוי הופעל בהצלחה';
    if (isUpgrade) {
      message = `השדרוג בוצע בהצלחה! התוכנית ${plan.name_he} פעילה כעת.`;
    } else if (promotion) {
      message = `המנוי הופעל! ${promotion.promo_months} חודשים ראשונים ב-₪${chargeAmount}/חודש`;
    } else if (referralDiscount > 0) {
      message = `המנוי הופעל בהצלחה עם הנחת חבר!`;
    }
    
    res.json({ 
      success: true, 
      subscription: subResult.rows[0],
      message,
      trial: false,
      promotion: promotion ? {
        promoPrice: chargeAmount,
        promoMonths: promotion.promo_months,
        monthsRemaining: promoMonthsRemaining - 1,
        regularPrice: regularPriceAfterPromo
      } : null
    });
  } catch (error) {
    console.error('[Payment] Subscribe error:', error);
    res.status(500).json({ error: 'שגיאה בהרשמה למנוי' });
  }
}

/**
 * Helper to record promotion usage
 */
async function recordPromotionUse(userId, promotionId, subscriptionId, promoPrice, regularPrice, promoMonths) {
  const promoEndDate = new Date();
  promoEndDate.setMonth(promoEndDate.getMonth() + promoMonths);
  
  await db.query(`
    INSERT INTO user_promotions (
      user_id, promotion_id, subscription_id, 
      promo_start_date, promo_end_date, months_remaining,
      promo_price_used, regular_price_after, status
    ) VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, 'active')
    ON CONFLICT (user_id, promotion_id) DO NOTHING
  `, [userId, promotionId, subscriptionId, promoEndDate, promoMonths, promoPrice, regularPrice]);
}

/**
 * Cancel subscription
 * CRITICAL: Only marks as cancelled if Sumit cancellation succeeds (when standing order exists)
 */
async function cancelSubscription(req, res) {
  try {
    const userId = req.user.id;
    
    // Get current subscription with plan name
    const subResult = await db.query(
      `SELECT us.*, sp.name_he as plan_name 
       FROM user_subscriptions us 
       JOIN subscription_plans sp ON us.plan_id = sp.id 
       WHERE us.user_id = $1 AND us.status IN ('active', 'trial')`,
      [userId]
    );
    
    if (subResult.rows.length === 0) {
      return res.status(404).json({ error: 'לא נמצא מנוי פעיל' });
    }
    
    const subscription = subResult.rows[0];
    
    // Cancel any pending charges in the billing queue
    await billingQueueService.cancelUserCharges(userId);
    console.log(`[Payment] Cancelled pending charges in billing queue for user ${userId}`);
    
    // Also cancel Sumit standing order if exists (for legacy subscriptions)
    let sumitCancelled = true;
    
    if (subscription.sumit_standing_order_id) {
      let customerId = subscription.sumit_customer_id;
      
      if (!customerId && subscription.payment_method_id) {
        const pmResult = await db.query(
          'SELECT sumit_customer_id FROM user_payment_methods WHERE id = $1',
          [subscription.payment_method_id]
        );
        if (pmResult.rows.length > 0) {
          customerId = pmResult.rows[0].sumit_customer_id;
        }
      }
      
      if (customerId) {
        const cancelResult = await sumitService.cancelRecurring(
          subscription.sumit_standing_order_id, 
          customerId
        );
        if (!cancelResult.success) {
          console.error('[Payment] Failed to cancel Sumit recurring (legacy):', cancelResult.error);
          // Continue anyway - we've cancelled in billing queue
        } else {
          console.log(`[Payment] Successfully cancelled Sumit recurring ${subscription.sumit_standing_order_id}`);
        }
      }
    }
    
    // Update subscription status - ALSO clear standing order ID since it's cancelled
    // IMPORTANT: Set expires_at if not set - use next_charge_date or NOW() + 30 days
    const result = await db.query(`
      UPDATE user_subscriptions 
      SET status = 'cancelled', 
          cancelled_at = NOW(), 
          expires_at = COALESCE(expires_at, next_charge_date, NOW() + INTERVAL '30 days'),
          sumit_standing_order_id = CASE WHEN $2 = true THEN NULL ELSE sumit_standing_order_id END,
          updated_at = NOW()
      WHERE user_id = $1 AND status IN ('active', 'trial')
      RETURNING *
    `, [userId, sumitCancelled]);
    
    let message = 'המנוי בוטל';
    
    // Determine if this is a TRIAL (unpaid) or PAID subscription
    // Trial = status is 'trial' OR is_trial is true OR no real payment was made
    const isTrial = subscription.status === 'trial' || subscription.is_trial === true;
    
    // Check if user has actually paid (has a real expires_at from payment, not just trial_ends_at)
    const hasPaidTime = subscription.expires_at && !subscription.is_trial && subscription.status !== 'trial';
    
    console.log(`[Payment] Cancel check - status: ${subscription.status}, is_trial: ${subscription.is_trial}, expires_at: ${subscription.expires_at}, trial_ends_at: ${subscription.trial_ends_at}`);
    
    // TRIAL subscriptions: disconnect immediately (no payment was made)
    // PAID subscriptions: continue until expires_at
    if (isTrial && !hasPaidTime) {
      // Trial = no grace period, disconnect immediately
      await db.query(
        `UPDATE whatsapp_connections 
         SET status = 'disconnected', updated_at = NOW()
         WHERE user_id = $1 AND status = 'connected'`,
        [userId]
      );
      
      await db.query(
        `UPDATE bots 
         SET is_active = false, updated_at = NOW()
         WHERE user_id = $1`,
        [userId]
      );
      
      message = 'המנוי בוטל. מכיוון שהיית בתקופת ניסיון, השירות הופסק מיידית.';
      console.log(`[Payment] Trial subscription cancelled - disconnected immediately for user ${userId}`);
    } else if (hasPaidTime) {
      // Paid subscription - continue until end of paid period
      const endDate = subscription.expires_at;
      if (endDate) {
        const formattedDate = new Date(endDate).toLocaleDateString('he-IL');
        message = `המנוי בוטל. השירות ימשיך לפעול עד ${formattedDate}`;
      }
      console.log(`[Payment] Paid subscription cancelled - service continues until ${subscription.expires_at} for user ${userId}`);
    } else {
      // Edge case: unknown state - downgrade to free tier (keep one bot unlocked)
      await db.query(
        `UPDATE whatsapp_connections 
         SET status = 'disconnected', updated_at = NOW()
         WHERE user_id = $1 AND connection_type = 'managed' AND status = 'connected'`,
        [userId]
      );
      
      // Get free plan limit
      const freePlanResult = await db.query(
        `SELECT max_bots FROM subscription_plans WHERE price = 0 AND is_active = true LIMIT 1`
      );
      const freeBotLimit = freePlanResult.rows[0]?.max_bots || 1;
      
      // Get the most recently updated bots up to limit
      const botsToKeep = await db.query(`
        SELECT id FROM bots 
        WHERE user_id = $1 AND pending_deletion = false
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
        LIMIT $2
      `, [userId, freeBotLimit === -1 ? 1000 : freeBotLimit]);
      
      const keepBotIds = botsToKeep.rows.map(b => b.id);
      
      if (keepBotIds.length > 0) {
        // LOCK all bots EXCEPT the ones we're keeping
        await db.query(`
          UPDATE bots 
          SET is_active = false,
              locked_reason = 'subscription_limit',
              locked_at = NOW(),
              updated_at = NOW()
          WHERE user_id = $1 AND id != ALL($2::uuid[])
        `, [userId, keepBotIds]);
        
        // Make sure kept bots are unlocked, first one active
        await db.query(`
          UPDATE bots 
          SET locked_reason = NULL,
              locked_at = NULL,
              is_active = CASE WHEN id = $2 THEN true ELSE false END,
              updated_at = NOW()
          WHERE id = ANY($1::uuid[])
        `, [keepBotIds, keepBotIds[0]]);
      } else {
        // No bots - lock all
        await db.query(`
          UPDATE bots 
          SET is_active = false,
              locked_reason = 'subscription_limit',
              locked_at = NOW(),
              updated_at = NOW()
          WHERE user_id = $1
        `, [userId]);
      }
      
      message = 'המנוי בוטל והורדת לתוכנית חינמית.';
      console.log(`[Payment] Unknown subscription state cancelled - downgraded to free for user ${userId}`);
    }
    
    // Send cancellation emails to user and admin
    sendCancellationEmail(userId, subscription.plan_name, subscription.expires_at).catch(err => {
      console.error('[Payment] Failed to send cancellation emails:', err);
    });
    
    res.json({ 
      success: true, 
      subscription: result.rows[0],
      message
    });
  } catch (error) {
    console.error('[Payment] Cancel subscription error:', error);
    res.status(500).json({ error: 'שגיאה בביטול מנוי' });
  }
}

/**
 * Reactivate a cancelled subscription
 */
async function reactivateSubscription(req, res) {
  try {
    const userId = req.user.id;
    
    // Get cancelled subscription with custom discount info
    const subResult = await db.query(
      `SELECT us.*, sp.name_he, sp.price,
              us.custom_discount_mode, us.custom_fixed_price, 
              us.referral_discount_percent as custom_discount_percent
       FROM user_subscriptions us
       JOIN subscription_plans sp ON sp.id = us.plan_id
       WHERE us.user_id = $1 AND us.status = 'cancelled'`,
      [userId]
    );
    
    if (subResult.rows.length === 0) {
      return res.status(404).json({ error: 'לא נמצא מנוי לחידוש' });
    }
    
    const subscription = subResult.rows[0];
    
    // Check if subscription hasn't expired yet
    const currentEndDate = subscription.expires_at || subscription.trial_ends_at;
    const now = new Date();
    const hasTimeRemaining = currentEndDate && new Date(currentEndDate) > now;
    
    if (!hasTimeRemaining) {
      return res.status(400).json({ 
        error: 'תקופת המנוי הסתיימה. יש להירשם מחדש.',
        needsNewSubscription: true
      });
    }
    
    // Get payment method (try saved one first, then default)
    let paymentResult = await db.query(
      'SELECT * FROM user_payment_methods WHERE id = $1 AND user_id = $2 AND is_active = true',
      [subscription.payment_method_id, userId]
    );
    
    // If not found, get any active payment method
    if (paymentResult.rows.length === 0) {
      paymentResult = await db.query(
        'SELECT * FROM user_payment_methods WHERE user_id = $1 AND is_active = true AND is_default = true LIMIT 1',
        [userId]
      );
    }
    
    if (paymentResult.rows.length === 0) {
      return res.status(400).json({ 
        error: 'אמצעי התשלום לא נמצא. יש להוסיף כרטיס אשראי חדש.',
        needsPaymentMethod: true
      });
    }
    
    const paymentMethod = paymentResult.rows[0];
    const durationMonths = subscription.billing_period === 'yearly' ? 12 : 1;
    const periodLabel = subscription.billing_period === 'yearly' ? 'שנתי' : 'חודשי';
    
    // Calculate proper amount - check for custom discount first
    let amount = parseFloat(subscription.price);
    
    // Check for custom discount from admin
    if (subscription.custom_discount_mode === 'fixed_price' && subscription.custom_fixed_price) {
      amount = parseFloat(subscription.custom_fixed_price);
      console.log(`[Payment] Reactivate - using custom fixed price: ${amount}`);
    } else if (subscription.custom_discount_mode === 'percent' && subscription.custom_discount_percent) {
      amount = amount * (1 - subscription.custom_discount_percent / 100);
      console.log(`[Payment] Reactivate - using custom percent discount (${subscription.custom_discount_percent}%): ${amount}`);
    } else if (subscription.billing_period === 'yearly') {
      // Apply yearly discount only if no custom discount
      amount = amount * 12 * 0.8; // 20% discount for yearly
    }
    
    // For yearly without custom discount, multiply by 12
    if (subscription.billing_period === 'yearly' && !subscription.custom_discount_mode) {
      // Already handled above
    } else if (subscription.billing_period === 'yearly' && subscription.custom_discount_mode) {
      // Custom discount is monthly, multiply by 12 for yearly
      amount = amount * 12;
    }
    
    // User already paid until currentEndDate, so schedule first charge for that date
    const firstChargeDate = new Date(currentEndDate);
    
    console.log(`[Payment] Reactivating subscription for user ${userId}, period: ${subscription.billing_period}, amount: ${amount}, first charge: ${firstChargeDate.toISOString()}`);
    
    // Get subscription ID for billing queue
    const subIdResult = await db.query(
      `SELECT id FROM user_subscriptions WHERE user_id = $1`,
      [userId]
    );
    const subscriptionId = subIdResult.rows[0]?.id;
    
    // Schedule charge in billing queue for when current period ends (self-managed billing)
    const billingType = subscription.billing_period === 'yearly' ? 'yearly' : 'monthly';
    
    await billingQueueService.scheduleCharge({
      userId,
      subscriptionId,
      amount,
      chargeDate: firstChargeDate.toISOString().split('T')[0],
      billingType,
      planId: subscription.plan_id,
      description: `מנוי ${periodLabel} - ${subscription.name_he}`,
    });
    
    console.log(`[Payment] Scheduled charge in billing queue for: ${firstChargeDate.toISOString().split('T')[0]}`);
    
    // Reactivate subscription - keep existing dates (user already paid until then)
    const result = await db.query(`
      UPDATE user_subscriptions 
      SET status = 'active', 
          cancelled_at = NULL,
          payment_method_id = $2,
          updated_at = NOW()
      WHERE user_id = $1 AND status = 'cancelled'
      RETURNING *
    `, [userId, paymentMethod.id]);
    
    // IMPORTANT: Unlock bots after reactivation
    // Get the plan's bot limit
    const planResult = await db.query(
      `SELECT sp.max_bots FROM subscription_plans sp 
       JOIN user_subscriptions us ON us.plan_id = sp.id 
       WHERE us.user_id = $1`,
      [userId]
    );
    const maxBots = planResult.rows[0]?.max_bots || 1;
    
    if (maxBots !== 0) {
      const botLimit = maxBots === -1 ? 1000 : maxBots;
      
      // Unlock bots up to the limit
      const lockedBotsResult = await db.query(`
        SELECT id FROM bots 
        WHERE user_id = $1 AND locked_reason IS NOT NULL
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
        LIMIT $2
      `, [userId, botLimit]);
      
      if (lockedBotsResult.rows.length > 0) {
        const botsToUnlock = lockedBotsResult.rows.map(b => b.id);
        await db.query(`
          UPDATE bots 
          SET locked_reason = NULL, locked_at = NULL, updated_at = NOW()
          WHERE id = ANY($1::uuid[])
        `, [botsToUnlock]);
        
        console.log(`[Payment] Unlocked ${botsToUnlock.length} bots for user ${userId} after reactivation`);
      }
    }
    
    res.json({ 
      success: true, 
      subscription: result.rows[0],
      message: 'המנוי חודש בהצלחה! החיוב הבא יהיה בתאריך סיום התקופה הנוכחית.'
    });
  } catch (error) {
    console.error('[Payment] Reactivate subscription error:', error);
    res.status(500).json({ error: 'שגיאה בחידוש מנוי' });
  }
}

/**
 * Remove all payment methods
 */
async function removeAllPaymentMethods(req, res) {
  try {
    const userId = req.user.id;
    
    console.log(`[Payment] User ${userId} requested removal of all payment methods`);
    
    // 1. Mark all payment methods as inactive
    await db.query(
      `UPDATE user_payment_methods 
       SET is_active = false, updated_at = NOW() 
       WHERE user_id = $1`,
      [userId]
    );
    
    // 2. Update user flags
    await db.query(
      `UPDATE users 
       SET has_payment_method = false, updated_at = NOW()
       WHERE id = $1`,
      [userId]
    );
    
    // 3. Check subscription status
    const subResult = await db.query(
      `SELECT us.*, wc.connection_type
       FROM user_subscriptions us
       LEFT JOIN whatsapp_connections wc ON wc.user_id = us.user_id
       WHERE us.user_id = $1 AND us.status IN ('active', 'trial')`,
      [userId]
    );
    
    // Check for WhatsApp connection without subscription
    const connectionResult = await db.query(
      `SELECT * FROM whatsapp_connections WHERE user_id = $1 AND status = 'connected'`,
      [userId]
    );
    
    let message = 'פרטי האשראי הוסרו בהצלחה';
    let disconnectImmediately = false;
    
    if (subResult.rows.length > 0) {
      const subscription = subResult.rows[0];
      
      // Cancel pending charges in billing queue
      await billingQueueService.cancelUserCharges(userId);
      console.log(`[Payment] Cancelled pending charges in billing queue for user ${userId}`);
      
      // Also cancel Sumit standing order if exists (legacy)
      if (subscription.sumit_standing_order_id) {
        try {
          await sumitService.cancelRecurring(subscription.sumit_standing_order_id, subscription.sumit_customer_id);
          console.log(`[Payment] Cancelled Sumit recurring ${subscription.sumit_standing_order_id} (legacy)`);
        } catch (err) {
          console.error('[Payment] Failed to cancel Sumit recurring (legacy):', err.message);
        }
      }
      
      // Mark subscription as cancelled
      await db.query(
        `UPDATE user_subscriptions 
         SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
         WHERE user_id = $1 AND status IN ('active', 'trial')`,
        [userId]
      );
      
      // Determine if this is a TRIAL (unpaid) or PAID subscription
      const isTrial = subscription.status === 'trial' || subscription.is_trial === true;
      const hasPaidTime = subscription.expires_at && !subscription.is_trial && subscription.status !== 'trial';
      
      console.log(`[Payment] Remove payment check - status: ${subscription.status}, is_trial: ${subscription.is_trial}, expires_at: ${subscription.expires_at}`);
      
      // TRIAL subscriptions: removing payment method = immediate disconnect
      // Trial is only valid WITH a payment method on file
      if (isTrial && !hasPaidTime) {
        disconnectImmediately = true;
        message = 'פרטי האשראי הוסרו. מכיוון שאתה בתקופת ניסיון, השירות נותק מיידית.';
        console.log(`[Payment] Trial subscription - disconnecting immediately after payment removal`);
      } else if (hasPaidTime) {
        // PAID subscriptions: service continues until end of paid period
        const endDate = subscription.expires_at;
        if (endDate) {
          const formattedDate = new Date(endDate).toLocaleDateString('he-IL');
          message = `המנוי בוטל. השירות ימשיך לפעול עד סוף תקופת החיוב (${formattedDate})`;
        }
      } else {
        // Edge case: unknown state - disconnect to be safe
        disconnectImmediately = true;
        message = 'פרטי האשראי הוסרו והשירות הופסק.';
        console.log(`[Payment] Unknown subscription state - disconnecting for safety`);
      }
      
    } else if (connectionResult.rows.length > 0) {
      // User has WhatsApp connection but NO subscription - disconnect immediately
      disconnectImmediately = true;
      message = 'פרטי האשראי הוסרו והשירות נותק';
    }
    
    // Check if credit card is required for WhatsApp - if so, disconnect when removed
    if (!disconnectImmediately) {
      const ccRequiredResult = await db.query(
        `SELECT value FROM system_settings WHERE key = 'require_credit_card_for_whatsapp'`
      );
      const creditCardRequired = ccRequiredResult.rows[0]?.value === true || ccRequiredResult.rows[0]?.value === 'true';
      
      // Check if user is exempt
      const userResult = await db.query(
        `SELECT credit_card_exempt FROM users WHERE id = $1`,
        [userId]
      );
      const isExempt = userResult.rows[0]?.credit_card_exempt === true;
      
      // Check if manual subscription
      const manualSubResult = await db.query(
        `SELECT id FROM user_subscriptions WHERE user_id = $1 AND is_manual = true AND status = 'active'`,
        [userId]
      );
      const hasManualSub = manualSubResult.rows.length > 0;
      
      // If credit card required and user is not exempt and not manual - disconnect
      if (creditCardRequired && !isExempt && !hasManualSub && connectionResult.rows.length > 0) {
        disconnectImmediately = true;
        message = 'פרטי האשראי הוסרו. חיבור WhatsApp מחייב אשראי פעיל - השירות נותק.';
        console.log(`[Payment] Credit card required - disconnecting WhatsApp for user ${userId}`);
      }
    }
    
    // Disconnect immediately if needed (trial or no subscription)
    // NOTE: We only mark as disconnected in DB, we do NOT delete the WAHA session
    if (disconnectImmediately) {
      // Mark connection as disconnected in DB
      await db.query(
        `UPDATE whatsapp_connections 
         SET status = 'disconnected', updated_at = NOW()
         WHERE user_id = $1 AND status = 'connected'`,
        [userId]
      );
      
      // Disable all bots
      await db.query(
        `UPDATE bots 
         SET is_active = false, updated_at = NOW()
         WHERE user_id = $1`,
        [userId]
      );
      
      console.log(`[Payment] Marked WhatsApp as disconnected and disabled bots for user ${userId}`);
    }
    
    console.log(`[Payment] Removed payment methods for user ${userId}. Immediate disconnect: ${disconnectImmediately}`);
    
    res.json({ success: true, message });
  } catch (error) {
    console.error('[Payment] Remove all payment methods error:', error);
    res.status(500).json({ error: 'שגיאה בהסרת פרטי התשלום' });
  }
}

/**
 * Get payment history
 */
async function getPaymentHistory(req, res) {
  try {
    const userId = req.user.id;
    
    const result = await db.query(`
      SELECT ph.*, sp.name_he as plan_name
      FROM payment_history ph
      LEFT JOIN user_subscriptions us ON ph.subscription_id = us.id
      LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE ph.user_id = $1
      ORDER BY ph.created_at DESC
      LIMIT 50
    `, [userId]);
    
    res.json({ history: result.rows });
  } catch (error) {
    console.error('[Payment] Get payment history error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת היסטוריית תשלומים' });
  }
}

/**
 * Check if user has valid payment method
 */
async function checkPaymentMethod(req, res) {
  try {
    const userId = req.user.id;
    
    const result = await db.query(
      'SELECT id FROM user_payment_methods WHERE user_id = $1 AND is_active = true LIMIT 1',
      [userId]
    );
    
    res.json({ hasPaymentMethod: result.rows.length > 0 });
  } catch (error) {
    console.error('[Payment] Check payment method error:', error);
    res.status(500).json({ error: 'שגיאה בבדיקת אמצעי תשלום' });
  }
}

/**
 * Calculate pro-rata pricing for plan change (upgrade or downgrade)
 * Returns the amount to charge/credit and the new subscription details
 */
async function calculatePlanChange(req, res) {
  try {
    const userId = req.user.id;
    const { targetPlanId, billingPeriod = 'monthly' } = req.body;
    
    if (!targetPlanId) {
      return res.status(400).json({ error: 'נדרש מזהה תכנית יעד' });
    }
    
    // Get current subscription
    const currentSubResult = await db.query(`
      SELECT us.*, sp.price as current_price, sp.name_he as current_plan_name,
             sp.billing_period as current_billing_period
      FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE us.user_id = $1 AND us.status IN ('active', 'cancelled')
      AND (
        us.expires_at IS NOT NULL AND us.expires_at > NOW()
        OR us.trial_ends_at IS NOT NULL AND us.trial_ends_at > NOW()
      )
    `, [userId]);
    
    // Get target plan
    const targetPlanResult = await db.query(
      'SELECT * FROM subscription_plans WHERE id = $1',
      [targetPlanId]
    );
    
    if (targetPlanResult.rows.length === 0) {
      return res.status(404).json({ error: 'תכנית יעד לא נמצאה' });
    }
    
    const targetPlan = targetPlanResult.rows[0];
    const targetPrice = billingPeriod === 'yearly' 
      ? (targetPlan.yearly_price || targetPlan.price * 10) 
      : targetPlan.price;
    
    // If no active subscription, just return the full price
    if (currentSubResult.rows.length === 0) {
      return res.json({
        type: 'new',
        currentPlan: null,
        targetPlan: {
          id: targetPlan.id,
          name: targetPlan.name_he,
          price: targetPrice,
          billingPeriod
        },
        calculation: {
          daysRemaining: 0,
          creditAmount: 0,
          chargeAmount: targetPrice,
          totalToPay: targetPrice
        },
        message: `עלות התכנית: ${targetPrice}₪`
      });
    }
    
    const currentSub = currentSubResult.rows[0];
    const currentPrice = currentSub.current_price;
    const isUpgrade = targetPrice > currentPrice;
    
    // Calculate remaining days and value
    const now = new Date();
    const endDate = currentSub.expires_at ? new Date(currentSub.expires_at) : null;
    
    if (!endDate || endDate <= now) {
      // Subscription already expired
      return res.json({
        type: 'new',
        currentPlan: {
          id: currentSub.plan_id,
          name: currentSub.current_plan_name,
          price: currentPrice
        },
        targetPlan: {
          id: targetPlan.id,
          name: targetPlan.name_he,
          price: targetPrice,
          billingPeriod
        },
        calculation: {
          daysRemaining: 0,
          creditAmount: 0,
          chargeAmount: targetPrice,
          totalToPay: targetPrice
        },
        message: `עלות התכנית: ${targetPrice}₪`
      });
    }
    
    // Calculate days remaining in current subscription
    const daysRemaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
    const totalDays = currentSub.current_billing_period === 'yearly' ? 365 : 30;
    const dailyRate = currentPrice / totalDays;
    const creditAmount = Math.round(dailyRate * daysRemaining);
    
    // Calculate target plan cost
    const targetDailyRate = targetPrice / (billingPeriod === 'yearly' ? 365 : 30);
    
    let chargeAmount, totalToPay, message, freeDays;
    
    if (isUpgrade) {
      // Upgrade: charge the difference for remaining days + new period
      const upgradeCostForRemaining = Math.round(targetDailyRate * daysRemaining) - creditAmount;
      chargeAmount = Math.max(0, upgradeCostForRemaining);
      totalToPay = chargeAmount;
      message = chargeAmount > 0 
        ? `הפרש שדרוג: ${chargeAmount}₪ (${creditAmount}₪ זיכוי מהתכנית הנוכחית)`
        : `שדרוג ללא עלות נוספת! (${creditAmount}₪ זיכוי מכסה את ההפרש)`;
    } else {
      // Downgrade: convert credit to free days on new plan
      freeDays = Math.floor(creditAmount / targetDailyRate);
      chargeAmount = 0;
      totalToPay = 0;
      message = `יתרת הזיכוי שלך (${creditAmount}₪) תעניק לך ${freeDays} ימים חינם בתכנית החדשה`;
    }
    
    res.json({
      type: isUpgrade ? 'upgrade' : 'downgrade',
      currentPlan: {
        id: currentSub.plan_id,
        name: currentSub.current_plan_name,
        price: currentPrice,
        expiresAt: endDate
      },
      targetPlan: {
        id: targetPlan.id,
        name: targetPlan.name_he,
        price: targetPrice,
        billingPeriod
      },
      calculation: {
        daysRemaining,
        dailyRate: Math.round(dailyRate * 100) / 100,
        creditAmount,
        chargeAmount,
        totalToPay,
        freeDays: freeDays || 0
      },
      message
    });
    
  } catch (error) {
    console.error('[Payment] Calculate plan change error:', error);
    res.status(500).json({ error: 'שגיאה בחישוב שינוי תכנית' });
  }
}

/**
 * Execute plan change (upgrade or downgrade)
 */
async function changePlan(req, res) {
  try {
    const userId = req.user.id;
    const { targetPlanId, billingPeriod = 'monthly' } = req.body;
    
    if (!targetPlanId) {
      return res.status(400).json({ error: 'נדרש מזהה תכנית יעד' });
    }
    
    // Get calculation first
    const calcResult = await db.query(`
      SELECT us.*, sp.price as current_price, sp.name_he as current_plan_name
      FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE us.user_id = $1 AND us.status IN ('active', 'cancelled')
      AND (us.expires_at IS NOT NULL AND us.expires_at > NOW())
    `, [userId]);
    
    const targetPlanResult = await db.query(
      'SELECT * FROM subscription_plans WHERE id = $1',
      [targetPlanId]
    );
    
    if (targetPlanResult.rows.length === 0) {
      return res.status(404).json({ error: 'תכנית יעד לא נמצאה' });
    }
    
    const targetPlan = targetPlanResult.rows[0];
    const targetPrice = billingPeriod === 'yearly' 
      ? (targetPlan.yearly_price || targetPlan.price * 10) 
      : targetPlan.price;
    
    // Check payment method
    const paymentResult = await db.query(
      `SELECT upm.*, us.sumit_customer_id
       FROM user_payment_methods upm
       LEFT JOIN user_subscriptions us ON us.user_id = upm.user_id
       WHERE upm.user_id = $1 AND upm.is_active = true AND upm.is_default = true
       LIMIT 1`,
      [userId]
    );
    
    if (paymentResult.rows.length === 0 && targetPrice > 0) {
      return res.status(400).json({ error: 'נדרש אמצעי תשלום' });
    }
    
    const payment = paymentResult.rows[0];
    const sumitCustomerId = payment?.sumit_customer_id;
    
    let amountToCharge = targetPrice;
    let freeDays = 0;
    let newExpiresAt = new Date();
    
    // If has current subscription, calculate pro-rata
    if (calcResult.rows.length > 0) {
      const currentSub = calcResult.rows[0];
      const currentPrice = currentSub.current_price;
      const isUpgrade = targetPrice > currentPrice;
      
      const now = new Date();
      const endDate = new Date(currentSub.expires_at);
      const daysRemaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
      const totalDays = 30; // Assume monthly for now
      const dailyRate = currentPrice / totalDays;
      const creditAmount = Math.round(dailyRate * daysRemaining);
      
      if (isUpgrade) {
        const targetDailyRate = targetPrice / (billingPeriod === 'yearly' ? 365 : 30);
        const upgradeCost = Math.round(targetDailyRate * daysRemaining);
        amountToCharge = Math.max(0, upgradeCost - creditAmount);
      } else {
        // Downgrade - give free days
        const targetDailyRate = targetPrice / (billingPeriod === 'yearly' ? 365 : 30);
        freeDays = Math.floor(creditAmount / targetDailyRate);
        amountToCharge = 0;
      }
    }
    
    // Calculate new expiry date
    if (billingPeriod === 'yearly') {
      newExpiresAt.setFullYear(newExpiresAt.getFullYear() + 1);
    } else {
      newExpiresAt.setMonth(newExpiresAt.getMonth() + 1);
    }
    
    // Add free days for downgrade
    if (freeDays > 0) {
      newExpiresAt.setDate(newExpiresAt.getDate() + freeDays);
    }
    
    // Charge if needed
    if (amountToCharge > 0 && sumitCustomerId) {
      const chargeResult = await sumitService.chargeOneTime({
        customerId: sumitCustomerId,
        amount: amountToCharge,
        description: `שינוי תכנית ל-${targetPlan.name_he}`,
        itemName: `שדרוג ל-${targetPlan.name_he}`,
      });
      
      if (!chargeResult.success) {
        return res.status(400).json({ 
          error: chargeResult.error || 'שגיאה בחיוב',
          code: 'CHARGE_FAILED'
        });
      }
    }
    
    // Update subscription
    await db.query(`
      UPDATE user_subscriptions 
      SET plan_id = $1, 
          billing_period = $2,
          status = 'active',
          cancelled_at = NULL,
          expires_at = $3,
          updated_at = NOW()
      WHERE user_id = $4 AND status IN ('active', 'cancelled')
    `, [targetPlanId, billingPeriod, newExpiresAt, userId]);
    
    // IMPORTANT: Unlock bots up to the new plan's limit
    if (targetPlan.max_bots && targetPlan.max_bots !== 0) {
      const newBotLimit = targetPlan.max_bots === -1 ? 1000 : targetPlan.max_bots;
      
      // Get locked bots ordered by most recently updated
      const lockedBotsResult = await db.query(`
        SELECT id FROM bots 
        WHERE user_id = $1 AND locked_reason IS NOT NULL
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
        LIMIT $2
      `, [userId, newBotLimit]);
      
      if (lockedBotsResult.rows.length > 0) {
        const botsToUnlock = lockedBotsResult.rows.map(b => b.id);
        
        // Unlock these bots
        await db.query(`
          UPDATE bots 
          SET locked_reason = NULL, locked_at = NULL, updated_at = NOW()
          WHERE id = ANY($1::uuid[])
        `, [botsToUnlock]);
        
        console.log(`[Payment] Unlocked ${botsToUnlock.length} bots for user ${userId} after plan upgrade`);
      }
    }
    
    // Log the transaction
    await db.query(`
      INSERT INTO payment_history (user_id, subscription_id, amount, status, description, payment_type)
      SELECT $1, us.id, $2, 'success', $3, 'plan_change'
      FROM user_subscriptions us WHERE us.user_id = $1
    `, [userId, amountToCharge, `שינוי תכנית ל-${targetPlan.name_he}`]);
    
    res.json({ 
      success: true, 
      message: amountToCharge > 0 
        ? `שודרגת בהצלחה ל-${targetPlan.name_he}! חויבת ב-${amountToCharge}₪`
        : freeDays > 0
          ? `עברת ל-${targetPlan.name_he}! קיבלת ${freeDays} ימים חינם`
          : `עברת בהצלחה ל-${targetPlan.name_he}!`,
      newPlan: targetPlan.name_he,
      amountCharged: amountToCharge,
      freeDays,
      expiresAt: newExpiresAt
    });
    
  } catch (error) {
    console.error('[Payment] Change plan error:', error);
    res.status(500).json({ error: 'שגיאה בשינוי תכנית' });
  }
}

/**
 * Process promotions ending today
 * Called by scheduled job to update prices when promo period ends
 * 
 * Logic:
 * 1. Find subscriptions with promo_months_remaining = 0 and active promotion
 * 2. Cancel old standing order in Sumit
 * 3. Create new standing order with regular price
 * 4. Update subscription with new price and clear promo fields
 */
async function processEndingPromotions() {
  try {
    console.log('[Promotions] Checking for ending promotions...');
    
    // Find subscriptions that need to transition to regular price
    const endingPromos = await db.query(`
      SELECT us.*, sp.name_he as plan_name, sp.price as plan_price,
             upm.sumit_customer_id as payment_sumit_customer_id
      FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      LEFT JOIN user_payment_methods upm ON us.payment_method_id = upm.id
      WHERE us.active_promotion_id IS NOT NULL
        AND us.promo_months_remaining = 0
        AND us.status = 'active'
    `);
    
    console.log(`[Promotions] Found ${endingPromos.rows.length} subscriptions ending promo period`);
    
    for (const sub of endingPromos.rows) {
      try {
        const regularPrice = sub.regular_price_after_promo || parseFloat(sub.plan_price);
        
        console.log(`[Promotions] Transitioning user ${sub.user_id} from promo to regular price: ${regularPrice} ILS`);
        
        // Update subscription to clear promo fields - future charges from billing queue will use regular price
        await db.query(`
          UPDATE user_subscriptions 
          SET active_promotion_id = NULL,
              promo_months_remaining = 0,
              promo_price = NULL,
              regular_price_after_promo = NULL,
              updated_at = NOW()
          WHERE user_id = $1
        `, [sub.user_id]);
        
        // Update user_promotions record
        await db.query(`
          UPDATE user_promotions 
          SET status = 'completed', updated_at = NOW()
          WHERE user_id = $1 AND promotion_id = $2 AND status = 'active'
        `, [sub.user_id, sub.active_promotion_id]);
        
        // Update any pending charges in billing queue to use regular price
        await db.query(`
          UPDATE billing_queue 
          SET amount = $1, updated_at = NOW()
          WHERE user_id = $2 AND status = 'pending'
        `, [regularPrice, sub.user_id]);
        
        // Notify user about the transition
        await db.query(`
          INSERT INTO notifications (user_id, notification_type, title, message)
          VALUES ($1, 'subscription', 'תקופת המבצע הסתיימה', $2)
        `, [
          sub.user_id,
          `תקופת המבצע שלך הסתיימה. המחיר החדש הוא ₪${regularPrice}/חודש.`
        ]);
        
        console.log(`[Promotions] Successfully transitioned user ${sub.user_id} to regular price`);
        
      } catch (subError) {
        console.error(`[Promotions] Error processing subscription ${sub.id}:`, subError);
      }
    }
    
    console.log('[Promotions] Finished processing ending promotions');
    return { processed: endingPromos.rows.length };
    
  } catch (error) {
    console.error('[Promotions] Error processing ending promotions:', error);
    throw error;
  }
}

/**
 * Decrement promo months remaining for all active promotions
 * Called monthly by scheduled job after billing cycle
 */
async function decrementPromoMonths() {
  try {
    const result = await db.query(`
      UPDATE user_subscriptions 
      SET promo_months_remaining = GREATEST(0, promo_months_remaining - 1),
          updated_at = NOW()
      WHERE active_promotion_id IS NOT NULL 
        AND promo_months_remaining > 0
        AND status = 'active'
      RETURNING user_id, promo_months_remaining
    `);
    
    console.log(`[Promotions] Decremented promo months for ${result.rows.length} subscriptions`);
    return result.rows;
  } catch (error) {
    console.error('[Promotions] Error decrementing promo months:', error);
    throw error;
  }
}

/**
 * Process referral discounts that are ending
 * Called by scheduled job to update prices when referral discount period ends
 * 
 * Logic:
 * 1. Find subscriptions with referral_months_remaining = 0 and referral_discount_type = 'first_year'
 * 2. Cancel old standing order in Sumit
 * 3. Create new standing order with regular price
 * 4. Update subscription with new price and clear referral discount fields
 */
async function processEndingReferralDiscounts() {
  try {
    console.log('[Referral] Checking for ending referral discounts...');
    
    // Ensure columns exist
    await db.query(`
      DO $$ BEGIN
        ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS referral_discount_type VARCHAR(50);
        ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS referral_discount_percent INTEGER;
        ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS referral_months_remaining INTEGER DEFAULT 0;
        ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS referral_regular_price DECIMAL(10,2);
      EXCEPTION WHEN others THEN NULL;
      END $$;
    `);
    
    // Find subscriptions that need to transition to regular price
    // For 'first_year' and 'custom_months' types (first_payment already charged once, forever never ends)
    const endingDiscounts = await db.query(`
      SELECT us.*, sp.name_he as plan_name, sp.price as plan_price,
             upm.sumit_customer_id as payment_sumit_customer_id
      FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      LEFT JOIN user_payment_methods upm ON us.payment_method_id = upm.id
      WHERE us.referral_discount_type IN ('first_year', 'custom_months')
        AND us.referral_months_remaining = 0
        AND us.referral_discount_percent IS NOT NULL
        AND us.status = 'active'
    `);
    
    console.log(`[Referral] Found ${endingDiscounts.rows.length} subscriptions ending referral discount period`);
    
    for (const sub of endingDiscounts.rows) {
      try {
        const regularPrice = sub.referral_regular_price || parseFloat(sub.plan_price);
        
        console.log(`[Referral] Transitioning user ${sub.user_id} from referral discount to regular price: ${regularPrice} ILS`);
        
        // Update subscription to clear referral discount fields - future charges from billing queue will use regular price
        await db.query(`
          UPDATE user_subscriptions 
          SET referral_discount_type = NULL,
              referral_discount_percent = NULL,
              referral_months_remaining = 0,
              referral_regular_price = NULL,
              updated_at = NOW()
          WHERE user_id = $1
        `, [sub.user_id]);
        
        // Update any pending charges in billing queue to use regular price
        await db.query(`
          UPDATE billing_queue 
          SET amount = $1, updated_at = NOW()
          WHERE user_id = $2 AND status = 'pending'
        `, [regularPrice, sub.user_id]);
        
        // Notify user about the transition
        await db.query(`
          INSERT INTO notifications (user_id, notification_type, title, message)
          VALUES ($1, 'subscription', 'תקופת הנחת החבר הסתיימה', $2)
        `, [
          sub.user_id,
          `תקופת הנחת החבר שלך הסתיימה. המחיר החדש הוא ₪${regularPrice}/חודש.`
        ]);
        
        console.log(`[Referral] Successfully transitioned user ${sub.user_id} to regular price`);
        
      } catch (subError) {
        console.error(`[Referral] Error processing subscription ${sub.id}:`, subError);
      }
    }
    
    console.log('[Referral] Finished processing ending referral discounts');
    return { processed: endingDiscounts.rows.length };
    
  } catch (error) {
    console.error('[Referral] Error processing ending referral discounts:', error);
    throw error;
  }
}

/**
 * Decrement referral months remaining for all active referral discounts
 * Called monthly by scheduled job after billing cycle
 */
async function decrementReferralMonths() {
  try {
    // Only decrement for first_year and custom_months types (not forever which is -1)
    const result = await db.query(`
      UPDATE user_subscriptions 
      SET referral_months_remaining = GREATEST(0, referral_months_remaining - 1),
          updated_at = NOW()
      WHERE referral_discount_type IN ('first_year', 'custom_months')
        AND referral_months_remaining > 0
        AND status = 'active'
      RETURNING user_id, referral_months_remaining
    `);
    
    console.log(`[Referral] Decremented referral months for ${result.rows.length} subscriptions`);
    return result.rows;
  } catch (error) {
    console.error('[Referral] Error decrementing referral months:', error);
    throw error;
  }
}

/**
 * Get user defaults for payment form (phone, citizenId)
 */
async function getPaymentDefaults(req, res) {
  try {
    const userId = req.user.id;
    
    // Ensure columns exist
    try {
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)`);
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS citizen_id VARCHAR(20)`);
    } catch (alterErr) {
      // Ignore if columns already exist
    }
    
    const result = await db.query(
      `SELECT name, COALESCE(phone, '') as phone, COALESCE(citizen_id, '') as citizen_id FROM users WHERE id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }
    
    const user = result.rows[0];
    
    res.json({
      name: user.name || '',
      phone: user.phone || '',
      citizenId: user.citizen_id || '',
    });
  } catch (error) {
    console.error('[Payment] Get payment defaults error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת ברירות מחדל' });
  }
}

/**
 * Validate direct payment link token (public - no auth)
 */
async function validatePaymentLink(req, res) {
  try {
    const { token } = req.params;
    
    const result = await db.query(`
      SELECT dpl.*, u.name, u.email 
      FROM direct_payment_links dpl
      JOIN users u ON u.id = dpl.user_id
      WHERE dpl.token = $1 AND dpl.used_at IS NULL AND dpl.expires_at > NOW()
    `, [token]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'הלינק אינו תקף או שפג תוקפו',
        code: 'INVALID_LINK'
      });
    }
    
    const link = result.rows[0];
    
    res.json({
      valid: true,
      userName: link.name,
      userEmail: link.email,
      expiresAt: link.expires_at
    });
  } catch (error) {
    console.error('[Payment] Validate payment link error:', error);
    res.status(500).json({ error: 'שגיאה בבדיקת הלינק' });
  }
}

/**
 * Submit payment method via direct link (public - no auth)
 */
async function submitPaymentViaLink(req, res) {
  try {
    const { token } = req.params;
    const { cardNumber, expiryMonth, expiryYear, cvv, citizenId, name, phone } = req.body;
    
    // Validate the token
    const linkResult = await db.query(`
      SELECT * FROM direct_payment_links 
      WHERE token = $1 AND used_at IS NULL AND expires_at > NOW()
    `, [token]);
    
    if (linkResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'הלינק אינו תקף או שפג תוקפו',
        code: 'INVALID_LINK'
      });
    }
    
    const link = linkResult.rows[0];
    const userId = link.user_id;
    
    // Get user data
    const userResult = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }
    
    const user = userResult.rows[0];
    
    // Use Sumit to create customer and save card
    const sumitService = require('../../services/payment/sumit.service');
    
    // Create customer in Sumit
    const customerResult = await sumitService.createCustomer({
      email: user.email,
      name: name || user.name,
      phone: phone || user.phone
    });
    
    if (!customerResult.success) {
      return res.status(400).json({ error: customerResult.error || 'שגיאה ביצירת לקוח' });
    }
    
    const customerId = customerResult.customerId;
    
    // Add payment method
    const paymentMethodResult = await sumitService.createPaymentMethod({
      customerId,
      cardNumber,
      expiryMonth,
      expiryYear,
      cvv,
      citizenId
    });
    
    if (!paymentMethodResult.success) {
      return res.status(400).json({ error: paymentMethodResult.error || 'שגיאה בשמירת כרטיס' });
    }
    
    // Deactivate existing payment methods
    await db.query(
      'UPDATE user_payment_methods SET is_active = false, is_default = false, updated_at = NOW() WHERE user_id = $1',
      [userId]
    );
    
    // Save to database
    await db.query(`
      INSERT INTO user_payment_methods (
        user_id, sumit_customer_id, card_token, 
        card_last_digits, card_expiry_month, card_expiry_year, 
        is_active, is_default
      )
      VALUES ($1, $2, $3, $4, $5, $6, true, true)
    `, [
      userId, 
      customerId, 
      paymentMethodResult.paymentMethodId,
      cardNumber.slice(-4),
      expiryMonth,
      expiryYear
    ]);
    
    // Update user
    await db.query(`
      UPDATE users 
      SET has_payment_method = true, 
          phone = COALESCE($2, phone),
          citizen_id = COALESCE($3, citizen_id),
          updated_at = NOW()
      WHERE id = $1
    `, [userId, phone, citizenId]);
    
    // Update user_subscriptions with sumit_customer_id
    await db.query(`
      UPDATE user_subscriptions 
      SET sumit_customer_id = $1, updated_at = NOW()
      WHERE user_id = $2
    `, [customerId, userId]);
    
    // Mark the link as used
    await db.query(`
      UPDATE direct_payment_links SET used_at = NOW() WHERE id = $1
    `, [link.id]);
    
    console.log(`[Payment] User ${userId} added payment method via direct link ${token}`);
    
    res.json({ 
      success: true, 
      message: 'פרטי האשראי נשמרו בהצלחה!',
      userName: name || user.name
    });
  } catch (error) {
    console.error('[Payment] Submit payment via link error:', error);
    res.status(500).json({ error: 'שגיאה בשמירת פרטי התשלום' });
  }
}

module.exports = {
  savePaymentMethod,
  getPaymentMethods,
  deletePaymentMethod,
  removeAllPaymentMethods,
  subscribe,
  cancelSubscription,
  reactivateSubscription,
  getPaymentHistory,
  checkPaymentMethod,
  calculatePlanChange,
  changePlan,
  processEndingPromotions,
  decrementPromoMonths,
  processEndingReferralDiscounts,
  decrementReferralMonths,
  getPaymentDefaults,
  validatePaymentLink,
  submitPaymentViaLink,
};
