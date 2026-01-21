const db = require('../../config/database');
const sumitService = require('../../services/payment/sumit.service');

/**
 * Save payment method (tokenize card + create customer in Sumit)
 */
async function savePaymentMethod(req, res) {
  try {
    const userId = req.user.id;
    const { 
      cardNumber, 
      expiryMonth, 
      expiryYear, 
      cvv,
      cardHolderName,
      citizenId,
      companyNumber
    } = req.body;
    
    if (!cardNumber || !expiryMonth || !expiryYear) {
      return res.status(400).json({ error: 'נדרשים פרטי כרטיס אשראי' });
    }
    
    // Get user info
    const userResult = await db.query(
      'SELECT id, name, email, phone FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }
    const user = userResult.rows[0];
    
    // 1. Tokenize the card (permanent token)
    const tokenResult = await sumitService.tokenizeCard({ cardNumber });
    
    if (!tokenResult.success) {
      return res.status(400).json({ error: tokenResult.error });
    }
    
    // 2. Create customer in Sumit
    const customerResult = await sumitService.createCustomer({
      name: cardHolderName || user.name,
      phone: user.phone,
      email: user.email,
      citizenId: citizenId,
      companyNumber: companyNumber,
    });
    
    if (!customerResult.success) {
      return res.status(400).json({ error: customerResult.error || 'שגיאה ביצירת לקוח במערכת התשלומים' });
    }
    
    // Get last 4 digits
    const lastDigits = cardNumber.slice(-4);
    
    // Deactivate any existing payment methods
    await db.query(
      'UPDATE user_payment_methods SET is_default = false WHERE user_id = $1',
      [userId]
    );
    
    // Save the new payment method with Sumit customer ID
    const result = await db.query(`
      INSERT INTO user_payment_methods (
        user_id, card_token, card_last_digits, 
        card_expiry_month, card_expiry_year, card_holder_name, 
        citizen_id, sumit_customer_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, card_last_digits, card_expiry_month, card_expiry_year, card_holder_name, created_at
    `, [
      userId, 
      tokenResult.token, 
      lastDigits,
      expiryMonth, 
      expiryYear, 
      cardHolderName,
      citizenId,
      customerResult.customerId
    ]);
    
    // Update user's has_payment_method flag
    await db.query(
      'UPDATE users SET has_payment_method = true WHERE id = $1',
      [userId]
    );
    
    res.json({ 
      success: true, 
      paymentMethod: result.rows[0],
      message: 'כרטיס אשראי נשמר בהצלחה'
    });
  } catch (error) {
    console.error('[Payment] Save payment method error:', error);
    res.status(500).json({ error: 'שגיאה בשמירת אמצעי תשלום' });
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
 */
async function deletePaymentMethod(req, res) {
  try {
    const userId = req.user.id;
    const { methodId } = req.params;
    
    // Check if user has an active subscription using this payment method
    const subCheck = await db.query(
      `SELECT id FROM user_subscriptions 
       WHERE user_id = $1 AND payment_method_id = $2 AND status IN ('active', 'trial')`,
      [userId, methodId]
    );
    
    if (subCheck.rows.length > 0) {
      return res.status(400).json({ 
        error: 'לא ניתן למחוק אמצעי תשלום המשויך למנוי פעיל. בטל את המנוי תחילה.'
      });
    }
    
    // Soft delete
    const result = await db.query(`
      UPDATE user_payment_methods 
      SET is_active = false, updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `, [methodId, userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'אמצעי תשלום לא נמצא' });
    }
    
    // Check if user has any remaining payment methods
    const remaining = await db.query(
      'SELECT COUNT(*) as count FROM user_payment_methods WHERE user_id = $1 AND is_active = true',
      [userId]
    );
    
    if (parseInt(remaining.rows[0].count) === 0) {
      await db.query(
        'UPDATE users SET has_payment_method = false WHERE id = $1',
        [userId]
      );
    }
    
    res.json({ success: true });
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
    
    // Get user info
    const userResult = await db.query(
      'SELECT id, name, email, phone FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
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
    
    // Get payment method
    const paymentResult = await db.query(
      'SELECT * FROM user_payment_methods WHERE id = $1 AND user_id = $2 AND is_active = true',
      [paymentMethodId, userId]
    );
    
    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'אמצעי תשלום לא נמצא' });
    }
    const paymentMethod = paymentResult.rows[0];
    
    const now = new Date();
    const hasTrial = plan.trial_days > 0;
    
    // Calculate price based on billing period
    let chargeAmount = parseFloat(plan.price);
    let nextChargeDate = new Date(now);
    
    if (billingPeriod === 'yearly') {
      // 20% discount for yearly
      chargeAmount = parseFloat(plan.price) * 12 * 0.8;
      nextChargeDate.setFullYear(nextChargeDate.getFullYear() + 1);
    } else {
      nextChargeDate.setMonth(nextChargeDate.getMonth() + 1);
    }
    
    let subscription;
    let chargeResult = null;
    
    if (hasTrial) {
      // Start trial - no charge yet
      const trialEnds = new Date(now);
      trialEnds.setDate(trialEnds.getDate() + plan.trial_days);
      
      const subResult = await db.query(`
        INSERT INTO user_subscriptions (
          user_id, plan_id, status, is_trial, trial_ends_at, 
          payment_method_id, next_charge_date, sumit_customer_id, billing_period
        ) VALUES ($1, $2, 'trial', true, $3, $4, $3, $5, $6)
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
          updated_at = NOW()
        RETURNING *
      `, [userId, planId, trialEnds, paymentMethodId, paymentMethod.sumit_customer_id, billingPeriod]);
      
      subscription = subResult.rows[0];
      
      res.json({ 
        success: true, 
        subscription,
        message: `תקופת ניסיון של ${plan.trial_days} ימים התחילה`,
        trial: true,
        trialEndsAt: trialEnds
      });
    } else {
      // Charge immediately
      if (billingPeriod === 'yearly') {
        // One-time charge for yearly
        chargeResult = await sumitService.chargeOneTime({
          customerId: paymentMethod.sumit_customer_id,
          cardToken: paymentMethod.card_token,
          expiryMonth: paymentMethod.card_expiry_month,
          expiryYear: paymentMethod.card_expiry_year,
          citizenId: paymentMethod.citizen_id,
          amount: chargeAmount,
          description: `מנוי שנתי - ${plan.name_he}`,
        });
      } else {
        // Recurring charge for monthly
        chargeResult = await sumitService.chargeRecurring({
          customerId: paymentMethod.sumit_customer_id,
          cardToken: paymentMethod.card_token,
          expiryMonth: paymentMethod.card_expiry_month,
          expiryYear: paymentMethod.card_expiry_year,
          citizenId: paymentMethod.citizen_id,
          amount: chargeAmount,
          description: `מנוי חודשי - ${plan.name_he}`,
          durationMonths: 1,
        });
      }
      
      if (!chargeResult.success) {
        return res.status(400).json({ error: chargeResult.error });
      }
      
      // Save subscription
      const subResult = await db.query(`
        INSERT INTO user_subscriptions (
          user_id, plan_id, status, payment_method_id, 
          sumit_customer_id, sumit_standing_order_id, next_charge_date, billing_period
        ) VALUES ($1, $2, 'active', $3, $4, $5, $6, $7)
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
          updated_at = NOW()
        RETURNING *
      `, [
        userId, planId, paymentMethodId, 
        paymentMethod.sumit_customer_id, 
        chargeResult.standingOrderId || null,
        nextChargeDate,
        billingPeriod
      ]);
      
      subscription = subResult.rows[0];
      
      // Log payment
      await db.query(`
        INSERT INTO payment_history (
          user_id, subscription_id, payment_method_id, 
          amount, status, sumit_transaction_id, sumit_document_number, description
        ) VALUES ($1, $2, $3, $4, 'success', $5, $6, $7)
      `, [
        userId, subscription.id, paymentMethodId, 
        chargeAmount, chargeResult.transactionId, chargeResult.documentNumber,
        `מנוי ${plan.name_he} (${billingPeriod === 'yearly' ? 'שנתי' : 'חודשי'})`
      ]);
      
      res.json({ 
        success: true, 
        subscription,
        message: 'המנוי הופעל בהצלחה',
        trial: false
      });
    }
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
    
    // Cancel recurring in Sumit if exists
    if (subscription.sumit_standing_order_id) {
      const cancelResult = await sumitService.cancelRecurring(subscription.sumit_standing_order_id);
      if (!cancelResult.success) {
        console.error('[Payment] Failed to cancel Sumit recurring:', cancelResult.error);
        // Continue anyway - mark as cancelled in our system
      }
    }
    
    // Update subscription status
    const result = await db.query(`
      UPDATE user_subscriptions 
      SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
      WHERE user_id = $1 AND status IN ('active', 'trial')
      RETURNING *
    `, [userId]);
    
    res.json({ 
      success: true, 
      subscription: result.rows[0],
      message: 'המנוי בוטל. תוכל להמשיך להשתמש בשירות עד סוף תקופת החיוב הנוכחית.'
    });
  } catch (error) {
    console.error('[Payment] Cancel subscription error:', error);
    res.status(500).json({ error: 'שגיאה בביטול מנוי' });
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
    if (subscription.next_charge_date && new Date(subscription.next_charge_date) < new Date()) {
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
    
    // For monthly subscriptions, we need to recreate the standing order
    let standingOrderId = subscription.sumit_standing_order_id;
    
    if (subscription.billing_period === 'monthly' && !standingOrderId) {
      // Create new recurring charge
      const chargeResult = await sumitService.chargeRecurring({
        customerId: paymentMethod.sumit_customer_id,
        cardToken: paymentMethod.card_token,
        expiryMonth: paymentMethod.card_expiry_month,
        expiryYear: paymentMethod.card_expiry_year,
        citizenId: paymentMethod.citizen_id,
        amount: parseFloat(subscription.price),
        description: `חידוש מנוי חודשי - ${subscription.name_he}`,
        durationMonths: 1,
      });
      
      if (!chargeResult.success) {
        return res.status(400).json({ error: chargeResult.error || 'שגיאה ביצירת הוראת קבע' });
      }
      
      standingOrderId = chargeResult.standingOrderId;
    }
    
    // Reactivate subscription
    const result = await db.query(`
      UPDATE user_subscriptions 
      SET status = 'active', 
          cancelled_at = NULL,
          sumit_standing_order_id = COALESCE($2, sumit_standing_order_id),
          updated_at = NOW()
      WHERE user_id = $1 AND status = 'cancelled'
      RETURNING *
    `, [userId, standingOrderId]);
    
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

module.exports = {
  savePaymentMethod,
  getPaymentMethods,
  deletePaymentMethod,
  subscribe,
  cancelSubscription,
  reactivateSubscription,
  getPaymentHistory,
  checkPaymentMethod,
};
