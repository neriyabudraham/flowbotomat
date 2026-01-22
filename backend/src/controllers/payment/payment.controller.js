const db = require('../../config/database');
const sumitService = require('../../services/payment/sumit.service');

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
      citizenId,           // Israeli ID
      companyNumber,       // Company number (optional)
      lastDigits,          // Last 4 digits for display
      expiryMonth,         // Expiry month
      expiryYear,          // Expiry year
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
    
    // Get user info
    const userResult = await db.query(
      'SELECT id, name, email FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }
    const user = userResult.rows[0];
    
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
      console.log(`[Payment] Creating new Sumit customer for user ${userId}`);
      const customerResult = await sumitService.createCustomer({
        name: cardHolderName || user.name || user.email,
        email: user.email,
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
          email: user.email,
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
        customerInfo: {
          name: cardHolderName || user.name || user.email,
          email: user.email,
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
    
    res.json({ 
      success: true, 
      paymentMethod: result.rows[0],
      message: 'כרטיס אשראי נשמר בהצלחה'
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
    
    res.json({ success: true, message });
  } catch (error) {
    console.error('[Payment] Delete payment method error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת אמצעי תשלום' });
  }
}

/**
 * Subscribe to a plan
 */
async function subscribe(req, res) {
  try {
    const userId = req.user.id;
    const { planId, paymentMethodId, billingPeriod = 'monthly' } = req.body;
    
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
    
    const now = new Date();
    const hasTrial = plan.trial_days > 0;
    
    // Calculate price
    let chargeAmount = parseFloat(plan.price);
    let nextChargeDate = new Date(now);
    let expiresAt = null;
    
    if (billingPeriod === 'yearly') {
      chargeAmount = parseFloat(plan.price) * 12 * 0.8; // 20% discount
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
          payment_method_id = NULL,
          sumit_customer_id = NULL,
          sumit_standing_order_id = NULL,
          next_charge_date = NULL,
          expires_at = NULL,
          billing_period = 'monthly',
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
      
      const subResult = await db.query(`
        INSERT INTO user_subscriptions (
          user_id, plan_id, status, is_trial, trial_ends_at, 
          payment_method_id, next_charge_date, sumit_customer_id, billing_period, expires_at
        ) VALUES ($1, $2, 'trial', true, $3, $4, $3, $5, $6, $3)
        ON CONFLICT (user_id) 
        DO UPDATE SET 
          plan_id = $2, 
          status = 'trial',
          is_trial = true,
          trial_ends_at = $3,
          payment_method_id = $4,
          next_charge_date = $3,
          sumit_customer_id = $5,
          billing_period = $6,
          expires_at = $3,
          updated_at = NOW()
        RETURNING *
      `, [userId, planId, trialEnds, paymentMethodId, paymentMethod.sumit_customer_id, billingPeriod]);
      
      return res.json({ 
        success: true, 
        subscription: subResult.rows[0],
        message: `תקופת ניסיון של ${plan.trial_days} ימים התחילה`,
        trial: true,
        trialEndsAt: trialEnds
      });
    }
    
    // Charge immediately with recurring billing
    let chargeResult;
    const durationMonths = billingPeriod === 'yearly' ? 12 : 1;
    const periodLabel = billingPeriod === 'yearly' ? 'שנתי' : 'חודשי';
    
    console.log(`[Payment] Charging user ${userId} - Amount: ${chargeAmount} ILS, Period: ${billingPeriod}`);
    
    // Both monthly and yearly use recurring charge - just with different duration
    chargeResult = await sumitService.chargeRecurring({
      customerId: paymentMethod.sumit_customer_id,
      amount: chargeAmount,
      description: `מנוי ${periodLabel} - ${plan.name_he}`,
      durationMonths: durationMonths,
      recurrence: null, // unlimited - auto-renew
    });
    
    if (!chargeResult.success) {
      console.error('[Payment] Charge failed:', chargeResult.error);
      return res.status(400).json({ 
        error: chargeResult.error || 'החיוב נכשל. אנא בדוק את פרטי האשראי.',
        code: 'CHARGE_FAILED'
      });
    }
    
    console.log(`[Payment] Charge successful - Transaction: ${chargeResult.transactionId}`);
    
    // Save subscription
    const subResult = await db.query(`
      INSERT INTO user_subscriptions (
        user_id, plan_id, status, payment_method_id, 
        sumit_customer_id, sumit_standing_order_id, next_charge_date, billing_period, expires_at
      ) VALUES ($1, $2, 'active', $3, $4, $5, $6, $7, $8)
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        plan_id = $2, 
        status = 'active',
        is_trial = false,
        payment_method_id = $3,
        sumit_customer_id = $4,
        sumit_standing_order_id = $5,
        next_charge_date = $6,
        billing_period = $7,
        expires_at = $8,
        updated_at = NOW()
      RETURNING *
    `, [
      userId, planId, paymentMethodId, 
      paymentMethod.sumit_customer_id, 
      chargeResult.standingOrderId || null,
      nextChargeDate,
      billingPeriod,
      expiresAt
    ]);
    
    // Log payment history
    await db.query(`
      INSERT INTO payment_history (
        user_id, subscription_id, payment_method_id, 
        amount, status, sumit_transaction_id, sumit_document_number, description
      ) VALUES ($1, $2, $3, $4, 'success', $5, $6, $7)
    `, [
      userId, subResult.rows[0].id, paymentMethodId, 
      chargeAmount, chargeResult.transactionId, chargeResult.documentNumber,
      `מנוי ${plan.name_he} (${billingPeriod === 'yearly' ? 'שנתי' : 'חודשי'})`
    ]);
    
    res.json({ 
      success: true, 
      subscription: subResult.rows[0],
      message: 'המנוי הופעל בהצלחה',
      trial: false
    });
  } catch (error) {
    console.error('[Payment] Subscribe error:', error);
    res.status(500).json({ error: 'שגיאה בהרשמה למנוי' });
  }
}

/**
 * Cancel subscription
 */
async function cancelSubscription(req, res) {
  try {
    const userId = req.user.id;
    
    // Get current subscription
    const subResult = await db.query(
      `SELECT * FROM user_subscriptions WHERE user_id = $1 AND status IN ('active', 'trial')`,
      [userId]
    );
    
    if (subResult.rows.length === 0) {
      return res.status(404).json({ error: 'לא נמצא מנוי פעיל' });
    }
    
    const subscription = subResult.rows[0];
    
    // Cancel recurring in Sumit
    if (subscription.sumit_standing_order_id) {
      const cancelResult = await sumitService.cancelRecurring(
        subscription.sumit_standing_order_id, 
        subscription.sumit_customer_id
      );
      if (!cancelResult.success) {
        console.error('[Payment] Failed to cancel Sumit recurring:', cancelResult.error);
      } else {
        console.log(`[Payment] Successfully cancelled Sumit recurring ${subscription.sumit_standing_order_id}`);
      }
    }
    
    // Update subscription status
    const result = await db.query(`
      UPDATE user_subscriptions 
      SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
      WHERE user_id = $1 AND status IN ('active', 'trial')
      RETURNING *
    `, [userId]);
    
    const endDate = subscription.expires_at || subscription.trial_ends_at;
    const formattedDate = endDate ? new Date(endDate).toLocaleDateString('he-IL') : null;
    
    res.json({ 
      success: true, 
      subscription: result.rows[0],
      message: formattedDate 
        ? `המנוי בוטל. השירות ימשיך לפעול עד ${formattedDate}`
        : 'המנוי בוטל'
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
    
    // Get cancelled subscription
    const subResult = await db.query(
      `SELECT us.*, sp.name_he, sp.price
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
    const endDate = subscription.expires_at || subscription.trial_ends_at;
    if (endDate && new Date(endDate) < new Date()) {
      return res.status(400).json({ 
        error: 'תקופת המנוי הסתיימה. יש להירשם מחדש.',
        needsNewSubscription: true
      });
    }
    
    // Get payment method
    const paymentResult = await db.query(
      'SELECT * FROM user_payment_methods WHERE id = $1 AND user_id = $2 AND is_active = true',
      [subscription.payment_method_id, userId]
    );
    
    if (paymentResult.rows.length === 0) {
      return res.status(400).json({ 
        error: 'אמצעי התשלום לא נמצא. יש להוסיף כרטיס אשראי חדש.',
        needsPaymentMethod: true
      });
    }
    
    const paymentMethod = paymentResult.rows[0];
    
    // Recreate the standing order in Sumit (was cancelled when subscription was cancelled)
    let standingOrderId = null;
    const durationMonths = subscription.billing_period === 'yearly' ? 12 : 1;
    const periodLabel = subscription.billing_period === 'yearly' ? 'שנתי' : 'חודשי';
    
    // Calculate proper amount for yearly (with discount)
    let amount = parseFloat(subscription.price);
    if (subscription.billing_period === 'yearly') {
      amount = amount * 12 * 0.8; // 20% discount for yearly
    }
    
    console.log(`[Payment] Reactivating subscription for user ${userId}, period: ${subscription.billing_period}, amount: ${amount}`);
    
    const chargeResult = await sumitService.chargeRecurring({
      customerId: paymentMethod.sumit_customer_id,
      amount: amount,
      description: `חידוש מנוי ${periodLabel} - ${subscription.name_he}`,
      durationMonths: durationMonths,
      recurrence: null, // unlimited
    });
    
    if (!chargeResult.success) {
      return res.status(400).json({ 
        error: chargeResult.error || 'שגיאה בחידוש המנוי'
      });
    }
    
    standingOrderId = chargeResult.standingOrderId;
    console.log(`[Payment] Created new Sumit standing order: ${standingOrderId}`);
    
    // Calculate new expiry date
    const newExpiresAt = new Date();
    if (subscription.billing_period === 'yearly') {
      newExpiresAt.setFullYear(newExpiresAt.getFullYear() + 1);
    } else {
      newExpiresAt.setMonth(newExpiresAt.getMonth() + 1);
    }
    
    // Reactivate subscription with new standing order and dates
    const result = await db.query(`
      UPDATE user_subscriptions 
      SET status = 'active', 
          cancelled_at = NULL,
          sumit_standing_order_id = $2,
          expires_at = $3,
          next_charge_date = $3,
          updated_at = NOW()
      WHERE user_id = $1 AND status = 'cancelled'
      RETURNING *
    `, [userId, standingOrderId, newExpiresAt.toISOString()]);
    
    // Log the reactivation payment
    await db.query(`
      INSERT INTO payment_history (user_id, subscription_id, payment_method_id, amount, status, description)
      VALUES ($1, $2, $3, $4, 'success', $5)
    `, [userId, result.rows[0].id, paymentMethod.id, amount, `חידוש מנוי ${periodLabel} - ${subscription.name_he}`]);
    
    res.json({ 
      success: true, 
      subscription: result.rows[0],
      message: 'המנוי חודש בהצלחה!'
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
      
      // Cancel in Sumit
      if (subscription.sumit_standing_order_id) {
        try {
          await sumitService.cancelRecurring(subscription.sumit_standing_order_id, subscription.sumit_customer_id);
          console.log(`[Payment] Cancelled Sumit recurring ${subscription.sumit_standing_order_id}`);
        } catch (err) {
          console.error('[Payment] Failed to cancel Sumit recurring:', err.message);
        }
      }
      
      // Mark subscription as cancelled
      await db.query(
        `UPDATE user_subscriptions 
         SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
         WHERE user_id = $1 AND status IN ('active', 'trial')`,
        [userId]
      );
      
      // Determine end date
      const endDate = subscription.status === 'trial' 
        ? subscription.trial_ends_at 
        : subscription.expires_at;
        
      if (endDate) {
        const formattedDate = new Date(endDate).toLocaleDateString('he-IL');
        message = subscription.status === 'trial'
          ? `המנוי בוטל. השירות ימשיך לפעול עד סוף תקופת הניסיון (${formattedDate})`
          : `המנוי בוטל. השירות ימשיך לפעול עד סוף תקופת החיוב (${formattedDate})`;
      }
      
    } else if (connectionResult.rows.length > 0) {
      // User has WhatsApp connection but NO subscription - disconnect immediately
      disconnectImmediately = true;
      message = 'פרטי האשראי הוסרו והשירות נותק';
    }
    
    // Disconnect immediately if needed
    if (disconnectImmediately) {
      await db.query(
        `UPDATE whatsapp_connections 
         SET status = 'disconnected', disconnected_at = NOW(), updated_at = NOW()
         WHERE user_id = $1 AND status = 'connected'`,
        [userId]
      );
      
      await db.query(
        `UPDATE bots 
         SET is_active = false, updated_at = NOW()
         WHERE user_id = $1`,
        [userId]
      );
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
          expires_at = $3,
          updated_at = NOW()
      WHERE user_id = $4 AND status IN ('active', 'cancelled')
    `, [targetPlanId, billingPeriod, newExpiresAt, userId]);
    
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
};
