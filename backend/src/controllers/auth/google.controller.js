const db = require('../../config/database');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * POST /api/auth/google
 * Login/Signup with Google
 */
const googleAuth = async (req, res) => {
  try {
    const { credential, referralCode } = req.body;

    if (!credential) {
      return res.status(400).json({ error: 'Google credential required' });
    }

    // Verify the Google token
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;

    if (!email) {
      return res.status(400).json({ error: 'Email not provided by Google' });
    }

    // Check if user exists
    let user = await db.query(
      'SELECT id, email, name, is_verified, is_active, role, google_id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    let userId;
    let isNewUser = false;

    if (user.rows.length === 0) {
      // Create new user
      isNewUser = true;
      const result = await db.query(
        `INSERT INTO users (email, name, google_id, is_verified, verified_at, avatar_url) 
         VALUES ($1, $2, $3, true, NOW(), $4) 
         RETURNING id`,
        [email.toLowerCase(), name, googleId, picture]
      );
      userId = result.rows[0].id;

      // Process referral if provided
      if (referralCode) {
        try {
          const { registerReferral, completeConversion } = require('../admin/promotions.controller');
          const referralResult = await registerReferral(userId, referralCode);
          if (referralResult) {
            console.log(`[Google Auth] User ${userId} referred by affiliate ${referralResult.affiliateId}`);
            
            // Check if conversion should happen on email verification (which is automatic with Google)
            const settings = await db.query('SELECT * FROM affiliate_settings LIMIT 1');
            if (settings.rows[0]?.is_active && settings.rows[0]?.conversion_type === 'email_verify') {
              await completeConversion(userId);
            }
          }
        } catch (refError) {
          console.error('[Google Auth] Referral registration failed:', refError);
        }
      }

      // Create trial subscription
      try {
        const planResult = await db.query(
          `SELECT id FROM subscription_plans WHERE name = 'Basic' AND is_active = true LIMIT 1`
        );
        
        if (planResult.rows.length > 0) {
          const planId = planResult.rows[0].id;
          const trialEndDate = new Date();
          trialEndDate.setDate(trialEndDate.getDate() + 14);
          
          await db.query(`
            INSERT INTO user_subscriptions (user_id, plan_id, status, is_trial, trial_ends_at, billing_period)
            VALUES ($1, $2, 'trial', true, $3, 'monthly')
          `, [userId, planId, trialEndDate]);
        }
      } catch (subError) {
        console.error('[Google Auth] Failed to create trial subscription:', subError);
      }

      console.log(`[Google Auth] New user created: ${email}`);
    } else {
      // Existing user
      userId = user.rows[0].id;

      // Update Google ID if not set
      if (!user.rows[0].google_id) {
        await db.query(
          'UPDATE users SET google_id = $1, is_verified = true, verified_at = COALESCE(verified_at, NOW()) WHERE id = $2',
          [googleId, userId]
        );
      }

      // Check if user is active
      if (!user.rows[0].is_active) {
        return res.status(403).json({ error: 'Account is deactivated' });
      }

      console.log(`[Google Auth] Existing user logged in: ${email}`);
    }

    // Generate tokens
    const accessToken = jwt.sign(
      { userId },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const refreshToken = jwt.sign(
      { userId, type: 'refresh' },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Store refresh token
    await db.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
      [userId, refreshToken]
    );

    res.json({
      success: true,
      isNewUser,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Google auth error:', error);
    
    if (error.message?.includes('Invalid token')) {
      return res.status(401).json({ error: 'Invalid Google token' });
    }
    
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { googleAuth };
