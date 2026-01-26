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
    
    // Get user info including receipt_email
    const userResult = await db.query(
      'SELECT id, name, email, receipt_email FROM users WHERE id = $1',
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
      console.log(`[Payment] Creating new Sumit customer for user ${userId}, receipt email: ${receiptEmail}`);
      const customerResult = await sumitService.createCustomer({
        name: cardHolderName || user.name || user.email,
        email: receiptEmail, // Use receipt_email for receipts
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
          email: receiptEmail, // Use receipt_email for receipts
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
    
    // Auto-create trial subscription if user doesn't have one
    const TRIAL_DAYS = 14;
    const subCheck = await db.query(
      `SELECT id, status, plan_id FROM user_subscriptions WHERE user_id = $1`,
      [userId]
    );
    
    let subscriptionCreated = false;
    
    if (subCheck.rows.length === 0 || subCheck.rows[0].status === 'cancelled') {
      console.log(`[Payment] Auto-creating trial subscription for user ${userId}`);
      
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
        
        await db.query(`
          INSERT INTO user_subscriptions (
            user_id, plan_id, status, is_trial, trial_ends_at, 
            payment_method_id, next_charge_date, started_at, sumit_customer_id
          ) VALUES ($1, $2, 'trial', true, $3, $4, $3, NOW(), $5)
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
            updated_at = NOW()
        `, [userId, planId, trialEndsAt, paymentMethodId, sumitResult.customerId]);
        
        subscriptionCreated = true;
        console.log(`[Payment] ✅ Trial subscription created, ends at: ${trialEndsAt.toISOString()}`);
      }
    } else if (subCheck.rows[0].status === 'trial' || subCheck.rows[0].status === 'active') {
      // User already has a subscription, just update the payment method
      await db.query(`
        UPDATE user_subscriptions 
        SET payment_method_id = $1, sumit_customer_id = $2, updated_at = NOW()
        WHERE user_id = $3
      `, [result.rows[0].id, sumitResult.customerId, userId]);
      console.log(`[Payment] Updated payment method on existing subscription`);
    }
    
    // Get updated subscription info for response
    const updatedSub = await db.query(`
      SELECT us.*, sp.name as plan_name, sp.name_he as plan_name_he
      FROM user_subscriptions us
      LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE us.user_id = $1
    `, [userId]);
    
    res.json({ 
      success: true, 
      paymentMethod: result.rows[0],
      message: subscriptionCreated 
        ? 'כרטיס אשראי נשמר ומנוי ניסיון הופעל!' 
        : 'כרטיס אשראי נשמר בהצלחה',
      subscription: updatedSub.rows[0] || null,
      trialCreated: subscriptionCreated
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
        
        referralDiscount = Math.floor(baseForReferral * (referralDiscountPercent / 100));
        chargeAmount = Math.max(0, baseForReferral - referralDiscount);
        
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
    
    // Charge immediately with recurring billing
    let chargeResult;
    const durationMonths = billingPeriod === 'yearly' && !promotion ? 12 : 1;
    const periodLabel = billingPeriod === 'yearly' && !promotion ? 'שנתי' : 'חודשי';
    
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
    
    // For promotions, we create a recurring charge for the promo price
    // The expiry service will update the price after promo ends
    // For upgrades, charge the prorated amount now but set up recurring for full price
    chargeResult = await sumitService.chargeRecurring({
      customerId: paymentMethod.sumit_customer_id,
      amount: actualChargeAmount,
      description: description,
      durationMonths: durationMonths,
      recurrence: null, // unlimited - auto-renew
      // For upgrades, the full price will be used for future charges
      futureAmount: isUpgrade ? chargeAmount : undefined,
    });
    
    if (!chargeResult.success) {
      console.error('[Payment] Charge failed:', chargeResult.error);
      return res.status(400).json({ 
        error: chargeResult.error || 'החיוב נכשל. אנא בדוק את פרטי האשראי.',
        code: 'CHARGE_FAILED'
      });
    }
    
    console.log(`[Payment] Charge successful - Transaction: ${chargeResult.transactionId}`);
    
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
    
    // Save subscription with promotion and referral info
    const subResult = await db.query(`
      INSERT INTO user_subscriptions (
        user_id, plan_id, status, payment_method_id, 
        sumit_customer_id, sumit_standing_order_id, next_charge_date, billing_period, expires_at,
        active_promotion_id, promo_months_remaining, promo_price, regular_price_after_promo,
        referral_discount_type, referral_discount_percent, referral_months_remaining, referral_regular_price
      ) VALUES ($1, $2, 'active', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
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
        active_promotion_id = $9,
        promo_months_remaining = $10,
        promo_price = $11,
        regular_price_after_promo = $12,
        referral_discount_type = COALESCE($13, referral_discount_type),
        referral_discount_percent = COALESCE($14, referral_discount_percent),
        referral_months_remaining = CASE 
          WHEN $13 IS NOT NULL THEN $15 
          ELSE GREATEST(0, COALESCE(referral_months_remaining, 0) - 1)
        END,
        referral_regular_price = COALESCE($16, referral_regular_price),
        updated_at = NOW()
      RETURNING *
    `, [
      userId, planId, paymentMethodId, 
      paymentMethod.sumit_customer_id, 
      chargeResult.standingOrderId || null,
      nextChargeDate,
      billingPeriod,
      expiresAt,
      promotion?.id || null,
      promoMonthsRemaining > 0 ? promoMonthsRemaining - 1 : 0, // -1 because first month is charged now
      promotion ? chargeAmount : null,
      regularPriceAfterPromo,
      referralDiscountType,
      referralDiscountPercent > 0 ? referralDiscountPercent : null,
      referralMonthsRemaining > 0 ? referralMonthsRemaining - 1 : referralMonthsRemaining, // -1 because first month charged now
      referralRegularPrice
    ]);
    
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
    
    // Calculate proper amount for yearly (with discount)
    let amount = parseFloat(subscription.price);
    if (subscription.billing_period === 'yearly') {
      amount = amount * 12 * 0.8; // 20% discount for yearly
    }
    
    // User already paid until currentEndDate, so schedule first charge for that date
    // This creates a standing order WITHOUT charging now
    const firstChargeDate = new Date(currentEndDate);
    
    console.log(`[Payment] Reactivating subscription for user ${userId}, period: ${subscription.billing_period}, amount: ${amount}, first charge: ${firstChargeDate.toISOString()}`);
    
    const chargeResult = await sumitService.chargeRecurring({
      customerId: paymentMethod.sumit_customer_id,
      amount: amount,
      description: `מנוי ${periodLabel} - ${subscription.name_he}`,
      durationMonths: durationMonths,
      recurrence: null, // unlimited
      startDate: firstChargeDate, // Schedule first charge for when current period ends
    });
    
    if (!chargeResult.success) {
      return res.status(400).json({ 
        error: chargeResult.error || 'שגיאה בחידוש המנוי'
      });
    }
    
    const standingOrderId = chargeResult.standingOrderId;
    console.log(`[Payment] Created new Sumit standing order: ${standingOrderId}, first charge scheduled for: ${firstChargeDate.toISOString()}`);
    
    // Reactivate subscription - keep existing dates (user already paid until then)
    // Just update status and standing order ID
    const result = await db.query(`
      UPDATE user_subscriptions 
      SET status = 'active', 
          cancelled_at = NULL,
          sumit_standing_order_id = $2,
          payment_method_id = $3,
          updated_at = NOW()
      WHERE user_id = $1 AND status = 'cancelled'
      RETURNING *
    `, [userId, standingOrderId, paymentMethod.id]);
    
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
        const customerId = sub.payment_sumit_customer_id || sub.sumit_customer_id;
        
        if (!customerId) {
          console.error(`[Promotions] No customer ID for user ${sub.user_id}, skipping`);
          continue;
        }
        
        console.log(`[Promotions] Transitioning user ${sub.user_id} from promo to regular price: ${regularPrice} ILS`);
        
        // Cancel old standing order if exists
        if (sub.sumit_standing_order_id) {
          try {
            await sumitService.cancelRecurring(sub.sumit_standing_order_id, customerId);
            console.log(`[Promotions] Cancelled old standing order ${sub.sumit_standing_order_id}`);
          } catch (cancelErr) {
            console.error(`[Promotions] Failed to cancel old standing order:`, cancelErr.message);
          }
        }
        
        // Create new standing order with regular price
        const chargeResult = await sumitService.chargeRecurring({
          customerId: customerId,
          amount: regularPrice,
          description: `מנוי חודשי - ${sub.plan_name}`,
          durationMonths: 1,
          recurrence: null, // unlimited
        });
        
        if (!chargeResult.success) {
          console.error(`[Promotions] Failed to create new standing order for user ${sub.user_id}:`, chargeResult.error);
          
          // Notify admin about failed transition
          await db.query(`
            INSERT INTO notifications (user_id, notification_type, title, message, metadata, is_admin_notification)
            VALUES ($1, 'payment_failure', 'שגיאה במעבר ממבצע למחיר רגיל', $2, $3, true)
          `, [
            sub.user_id,
            `המשתמש ${sub.user_id} לא עבר בהצלחה למחיר רגיל לאחר סיום מבצע`,
            JSON.stringify({ error: chargeResult.error, userId: sub.user_id, planId: sub.plan_id })
          ]);
          continue;
        }
        
        // Update subscription with new standing order and clear promo fields
        await db.query(`
          UPDATE user_subscriptions 
          SET sumit_standing_order_id = $1,
              active_promotion_id = NULL,
              promo_months_remaining = 0,
              promo_price = NULL,
              regular_price_after_promo = NULL,
              updated_at = NOW()
          WHERE user_id = $2
        `, [chargeResult.standingOrderId, sub.user_id]);
        
        // Update user_promotions record
        await db.query(`
          UPDATE user_promotions 
          SET status = 'completed', updated_at = NOW()
          WHERE user_id = $1 AND promotion_id = $2 AND status = 'active'
        `, [sub.user_id, sub.active_promotion_id]);
        
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
        const customerId = sub.payment_sumit_customer_id || sub.sumit_customer_id;
        
        if (!customerId) {
          console.error(`[Referral] No customer ID for user ${sub.user_id}, skipping`);
          continue;
        }
        
        console.log(`[Referral] Transitioning user ${sub.user_id} from referral discount to regular price: ${regularPrice} ILS`);
        
        // Cancel old standing order if exists
        if (sub.sumit_standing_order_id) {
          try {
            await sumitService.cancelRecurring(sub.sumit_standing_order_id, customerId);
            console.log(`[Referral] Cancelled old standing order ${sub.sumit_standing_order_id}`);
          } catch (cancelErr) {
            console.error(`[Referral] Failed to cancel old standing order:`, cancelErr.message);
          }
        }
        
        // Create new standing order with regular price
        const chargeResult = await sumitService.chargeRecurring({
          customerId: customerId,
          amount: regularPrice,
          description: `מנוי חודשי - ${sub.plan_name}`,
          durationMonths: 1,
          recurrence: null, // unlimited
        });
        
        if (!chargeResult.success) {
          console.error(`[Referral] Failed to create new standing order for user ${sub.user_id}:`, chargeResult.error);
          
          // Notify admin about failed transition
          await db.query(`
            INSERT INTO notifications (user_id, notification_type, title, message, metadata, is_admin_notification)
            VALUES ($1, 'payment_failure', 'שגיאה במעבר מהנחת חבר למחיר רגיל', $2, $3, true)
          `, [
            sub.user_id,
            `המשתמש ${sub.user_id} לא עבר בהצלחה למחיר רגיל לאחר סיום הנחת חבר`,
            JSON.stringify({ error: chargeResult.error, userId: sub.user_id, planId: sub.plan_id })
          ]);
          continue;
        }
        
        // Update subscription with new standing order and clear referral discount fields
        await db.query(`
          UPDATE user_subscriptions 
          SET sumit_standing_order_id = $1,
              referral_discount_type = NULL,
              referral_discount_percent = NULL,
              referral_months_remaining = 0,
              referral_regular_price = NULL,
              updated_at = NOW()
          WHERE user_id = $2
        `, [chargeResult.standingOrderId, sub.user_id]);
        
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
};
