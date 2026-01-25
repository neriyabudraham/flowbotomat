const db = require('../../config/database');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.FRONTEND_URL || 'https://flow.botomat.co.il'}/api/auth/google/callback`
);

/**
 * GET /api/auth/google/callback
 * OAuth2 callback from Google - redirects back to frontend with tokens
 */
const googleCallback = async (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || 'https://flow.botomat.co.il';
  const redirectUri = `${frontendUrl}/api/auth/google/callback`;
  
  console.log('[Google Auth] Callback received');
  console.log('[Google Auth] Frontend URL:', frontendUrl);
  console.log('[Google Auth] Redirect URI being used:', redirectUri);
  console.log('[Google Auth] Query params:', req.query);
  
  try {
    const { code, state } = req.query;
    
    if (!code) {
      console.log('[Google Auth] No code received');
      return res.redirect(`${frontendUrl}/login?error=no_code`);
    }
    
    // Parse state to get referral code
    let referralCode = null;
    if (state) {
      try {
        const stateData = JSON.parse(decodeURIComponent(state));
        referralCode = stateData.referral;
      } catch (e) {
        // Ignore invalid state
      }
    }
    
    // Create a fresh client with the exact redirect URI
    const callbackClient = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );
    
    console.log('[Google Auth] Exchanging code for tokens...');
    // Exchange code for tokens
    const { tokens } = await callbackClient.getToken(code);
    console.log('[Google Auth] Token exchange successful');
    
    // Get user info from Google
    const userInfoRes = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    
    const { email, name, picture, id: googleId } = userInfoRes.data;
    
    if (!email) {
      return res.redirect(`${frontendUrl}/login?error=no_email`);
    }
    
    // Process user with referral code
    const result = await processGoogleUser(email, name, picture, googleId, referralCode);
    
    if (result.error) {
      return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(result.error)}`);
    }
    
    // Redirect to frontend with tokens in URL (will be stored and cleared)
    res.redirect(`${frontendUrl}/auth/callback?accessToken=${result.accessToken}&refreshToken=${result.refreshToken}&isNewUser=${result.isNewUser}`);
  } catch (error) {
    console.error('Google callback error:', error.message);
    console.error('Google callback full error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    
    // More specific error messages
    let errorType = 'google_error';
    if (error.message?.includes('invalid_grant')) {
      errorType = 'invalid_grant';
    } else if (error.message?.includes('redirect_uri_mismatch')) {
      errorType = 'redirect_mismatch';
    } else if (error.message?.includes('access_denied')) {
      errorType = 'access_denied';
    }
    
    res.redirect(`${frontendUrl}/login?error=${errorType}`);
  }
};

/**
 * POST /api/auth/google
 * Login/Signup with Google (ID Token method)
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
    
    const result = await processGoogleUser(email, name, picture, googleId, referralCode);
    
    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    
    res.json(result);
  } catch (error) {
    console.error('Google auth error:', error);
    
    if (error.message?.includes('Invalid token')) {
      return res.status(401).json({ error: 'Invalid Google token' });
    }
    
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Process Google user - shared logic
 */
async function processGoogleUser(email, name, picture, googleId, referralCode) {
  try {
    if (!email) {
      return { error: 'Email not provided by Google', status: 400 };
    }

    // Check if user exists
    let user = await db.query(
      'SELECT id, email, name, is_verified, is_active, role, google_id, avatar_url FROM users WHERE email = $1',
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
            if (settings.rows[0]?.is_active && settings.rows[0]?.conversion_type === 'email_verified') {
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

      // Update Google ID and avatar if not set
      if (!user.rows[0].google_id || !user.rows[0].avatar_url) {
        await db.query(
          `UPDATE users SET 
            google_id = COALESCE(google_id, $1), 
            avatar_url = COALESCE(avatar_url, $2),
            is_verified = true, 
            verified_at = COALESCE(verified_at, NOW()) 
          WHERE id = $3`,
          [googleId, picture, userId]
        );
      }

      // Check if user is active
      if (!user.rows[0].is_active) {
        return { error: 'Account is deactivated', status: 403 };
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

    return {
      success: true,
      isNewUser,
      accessToken,
      refreshToken,
    };
  } catch (error) {
    console.error('Google process user error:', error);
    return { error: 'Server error', status: 500 };
  }
}

module.exports = { googleAuth, googleCallback };
