const db = require('../../config/database');
const { hashPassword } = require('../../services/auth/hash.service');
const { createVerification } = require('../../services/auth/verification.service');
const { sendMail } = require('../../services/mail/transport.service');
const { getVerificationEmail } = require('../../services/mail/templates.service');

/**
 * POST /api/auth/signup
 */
const signup = async (req, res) => {
  try {
    const { email, password, name, referralCode } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check if user exists
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Create user
    const passwordHash = await hashPassword(password);
    const result = await db.query(
      `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id`,
      [email.toLowerCase(), passwordHash, name || null]
    );

    const userId = result.rows[0].id;

    // Process referral if provided
    let referredByAffiliateId = null;
    if (referralCode) {
      try {
        const { registerReferral } = require('../admin/promotions.controller');
        const referralResult = await registerReferral(userId, referralCode);
        if (referralResult) {
          referredByAffiliateId = referralResult.affiliateId;
          console.log(`[Signup] User ${userId} referred by affiliate ${referredByAffiliateId}`);
        }
      } catch (refError) {
        console.error('[Signup] Referral registration failed:', refError);
        // Continue with signup even if referral fails
      }
    }

    // Create Free subscription (users start with free plan)
    try {
      const planResult = await db.query(
        `SELECT id FROM subscription_plans WHERE name = 'Free' AND is_active = true LIMIT 1`
      );
      
      if (planResult.rows.length > 0) {
        const planId = planResult.rows[0].id;
        
        await db.query(`
          INSERT INTO user_subscriptions (user_id, plan_id, status, is_trial, billing_period)
          VALUES ($1, $2, 'active', false, 'monthly')
        `, [userId, planId]);
        
        console.log(`[Signup] Created free subscription for user ${userId}`);
      } else {
        console.log('[Signup] No Free plan found');
      }
    } catch (subError) {
      console.error('[Signup] Failed to create subscription:', subError);
      // Continue with signup even if subscription creation fails
    }

    // Create verification
    const { token, code } = await createVerification(userId, 'email_verify');
    const verifyLink = `${process.env.APP_URL}/verify?token=${token}`;

    // Send email
    await sendMail(
      email,
      'אימות חשבון FlowBotomat',
      getVerificationEmail(code, verifyLink, 'he')
    );

    res.status(201).json({
      success: true,
      message: 'User created. Verification email sent.',
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { signup };
