const db = require('../../config/database');
const sumitService = require('../../services/payment/sumit.service');

/**
 * Save payment method (tokenize and store)
 */
async function savePaymentMethod(req, res) {
  try {
    const userId = req.user.id;
    const { 
      cardNumber, 
      expiryMonth, 
      expiryYear, 
      cardHolderName,
      citizenId 
    } = req.body;
    
    if (!cardNumber || !expiryMonth || !expiryYear) {
      return res.status(400).json({ error: 'נדרשים פרטי כרטיס אשראי' });
    }
    
    // Tokenize the card
    const tokenResult = await sumitService.tokenizeCard(cardNumber);
    
    if (!tokenResult.success) {
      return res.status(400).json({ error: tokenResult.error });
    }
    
    // Get last 4 digits
    const lastDigits = cardNumber.slice(-4);
    
    // Deactivate any existing payment methods
    await db.query(
      'UPDATE user_payment_methods SET is_default = false WHERE user_id = $1',
      [userId]
    );
    
    // Save the new payment method
    const result = await db.query(`
      INSERT INTO user_payment_methods (
        user_id, card_token, card_last_digits, 
        card_expiry_month, card_expiry_year, card_holder_name, citizen_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, card_last_digits, card_expiry_month, card_expiry_year, card_holder_name, created_at
    `, [
      userId, 
      tokenResult.token, 
      lastDigits,
      expiryMonth, 
      expiryYear, 
      cardHolderName,
      citizenId
    ]);
    
    // Update user's has_payment_method flag if needed
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
 * Subscribe to a plan (start subscription with trial or charge)
 */
async function subscribe(req, res) {
  try {
    const userId = req.user.id;
    const { planId, paymentMethodId } = req.body;
    
    // Get user info
    const userResult = await db.query(
      'SELECT id, name, email, phone FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }
    const user = userResult.rows[0];
    
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
    
    // Check if this is a trial plan
    const hasTrial = plan.trial_days > 0;
    const now = new Date();
    
    let subscription;
    
    if (hasTrial) {
      // Start trial - no charge yet
      const trialEnds = new Date(now);
      trialEnds.setDate(trialEnds.getDate() + plan.trial_days);
      
      const subResult = await db.query(`
        INSERT INTO user_subscriptions (
          user_id, plan_id, status, is_trial, trial_ends_at, 
          payment_method_id, next_charge_date
        ) VALUES ($1, $2, 'trial', true, $3, $4, $3)
        ON CONFLICT (user_id) 
        DO UPDATE SET 
          plan_id = $2, 
          status = 'trial',
          is_trial = true,
          trial_ends_at = $3,
          payment_method_id = $4,
          next_charge_date = $3,
          updated_at = NOW()
        RETURNING *
      `, [userId, planId, trialEnds, paymentMethodId]);
      
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
      const chargeResult = await sumitService.chargeCustomer({
        customer: {
          name: user.name,
          phone: user.phone,
          email: user.email,
          citizenId: paymentMethod.citizen_id,
        },
        paymentMethod: {
          token: paymentMethod.card_token,
          expiryMonth: paymentMethod.card_expiry_month,
          expiryYear: paymentMethod.card_expiry_year,
          citizenId: paymentMethod.citizen_id,
        },
        items: [{
          name: `מנוי ${plan.name_he}`,
          description: plan.description_he,
          price: parseFloat(plan.price),
          durationMonths: plan.billing_period === 'yearly' ? 12 : 1,
          recurrence: null, // Recurring until cancelled
        }],
      });
      
      if (!chargeResult.success) {
        return res.status(400).json({ error: chargeResult.error });
      }
      
      // Calculate next charge date
      const nextCharge = new Date(now);
      if (plan.billing_period === 'yearly') {
        nextCharge.setFullYear(nextCharge.getFullYear() + 1);
      } else {
        nextCharge.setMonth(nextCharge.getMonth() + 1);
      }
      
      // Save subscription
      const subResult = await db.query(`
        INSERT INTO user_subscriptions (
          user_id, plan_id, status, payment_method_id, 
          sumit_customer_id, next_charge_date
        ) VALUES ($1, $2, 'active', $3, $4, $5)
        ON CONFLICT (user_id) 
        DO UPDATE SET 
          plan_id = $2, 
          status = 'active',
          is_trial = false,
          payment_method_id = $3,
          sumit_customer_id = $4,
          next_charge_date = $5,
          updated_at = NOW()
        RETURNING *
      `, [userId, planId, paymentMethodId, chargeResult.customerId, nextCharge]);
      
      subscription = subResult.rows[0];
      
      // Log payment
      await db.query(`
        INSERT INTO payment_history (
          user_id, subscription_id, payment_method_id, 
          amount, status, sumit_transaction_id, sumit_document_number, description
        ) VALUES ($1, $2, $3, $4, 'success', $5, $6, $7)
      `, [
        userId, subscription.id, paymentMethodId, 
        plan.price, chargeResult.transactionId, chargeResult.documentNumber,
        `מנוי ${plan.name_he}`
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
    
    const result = await db.query(`
      UPDATE user_subscriptions 
      SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
      WHERE user_id = $1 AND status IN ('active', 'trial')
      RETURNING *
    `, [userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'לא נמצא מנוי פעיל' });
    }
    
    res.json({ 
      success: true, 
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

module.exports = {
  savePaymentMethod,
  getPaymentMethods,
  deletePaymentMethod,
  subscribe,
  cancelSubscription,
  getPaymentHistory,
  checkPaymentMethod,
};
