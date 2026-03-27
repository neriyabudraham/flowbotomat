const db = require('../../config/database');
const sumitService = require('../../services/payment/sumit.service');
const { hashPassword } = require('../../services/auth/hash.service');

/**
 * Get all users with pagination and filters
 */
async function getUsers(req, res) {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search, 
      role, 
      status,
      sort = 'created_at',
      order = 'desc',
      // New filters
      no_payment_method,
      has_payment,
      has_modules,
      whatsapp_connected
    } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = '1=1';
    const params = [];
    let paramIndex = 1;
    
    if (search) {
      whereClause += ` AND (u.email ILIKE $${paramIndex} OR u.name ILIKE $${paramIndex} OR u.phone ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    if (role) {
      whereClause += ` AND u.role = $${paramIndex}`;
      params.push(role);
      paramIndex++;
    }
    
    // User account status filters
    if (status === 'user_active') {
      whereClause += ` AND u.is_active = true`;
    } else if (status === 'user_inactive') {
      whereClause += ` AND u.is_active = false`;
    } else if (status === 'unverified') {
      whereClause += ` AND u.is_verified = false`;
    }
    // Subscription status filters
    else if (status === 'active') {
      whereClause += ` AND us.status = 'active'`;
    } else if (status === 'trial') {
      whereClause += ` AND (us.is_trial = true OR us.status = 'trial')`;
    } else if (status === 'manual') {
      whereClause += ` AND us.is_manual = true`;
    } else if (status === 'cancelled') {
      whereClause += ` AND us.status = 'cancelled'`;
    } else if (status === 'free') {
      whereClause += ` AND (us.id IS NULL OR sp.price = 0 OR sp.name = 'Free')`;
    }
    
    // Payment method filter
    if (no_payment_method === 'true') {
      whereClause += ` AND NOT EXISTS(SELECT 1 FROM user_payment_methods pm WHERE pm.user_id = u.id AND pm.is_active = true)`;
    }
    if (has_payment === 'true') {
      whereClause += ` AND EXISTS(SELECT 1 FROM user_payment_methods pm WHERE pm.user_id = u.id AND pm.is_active = true)`;
    }
    
    // Modules filter (has additional services)
    if (has_modules === 'true') {
      whereClause += ` AND (
        EXISTS(SELECT 1 FROM user_service_subscriptions uss WHERE uss.user_id = u.id AND uss.status IN ('active', 'trial'))
        OR EXISTS(SELECT 1 FROM group_forwards gf WHERE gf.user_id = u.id)
        OR EXISTS(SELECT 1 FROM broadcast_campaigns bc WHERE bc.user_id = u.id)
      )`;
    }
    
    // WhatsApp connected filter
    if (whatsapp_connected === 'true') {
      whereClause += ` AND EXISTS(SELECT 1 FROM whatsapp_connections wc2 WHERE wc2.user_id = u.id AND wc2.status = 'connected')`;
    }
    
    // Validate sort column
    const allowedSortColumns = ['name', 'email', 'created_at', 'subscription_status', 'bots_count', 'contacts_count'];
    const sortColumn = allowedSortColumns.includes(sort) ? sort : 'created_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
    
    // Build ORDER BY clause
    let orderByClause;
    if (sortColumn === 'bots_count') {
      orderByClause = `bots_count ${sortOrder}`;
    } else if (sortColumn === 'contacts_count') {
      orderByClause = `contacts_count ${sortOrder}`;
    } else if (sortColumn === 'subscription_status') {
      orderByClause = `us.status ${sortOrder}`;
    } else {
      orderByClause = `u.${sortColumn} ${sortOrder}`;
    }
    
    // Get total count with joins for filtering
    const countResult = await db.query(
      `SELECT COUNT(DISTINCT u.id) 
       FROM users u
       LEFT JOIN user_subscriptions us ON us.user_id = u.id
       LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
       LEFT JOIN whatsapp_connections wc ON wc.user_id = u.id
       WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);
    
    // Get users with subscription info, referrer, and feature usage
    const result = await db.query(
      `SELECT u.id, u.email, u.name, u.phone, u.role, u.plan, u.is_verified, u.is_active, 
              u.language, u.theme, u.created_at, u.last_login_at,
              (SELECT COUNT(*) FROM bots WHERE user_id = u.id) as bots_count,
              (SELECT COUNT(*) FROM bots WHERE user_id = u.id AND is_active = true AND locked_reason IS NULL) as active_bots_count,
              (SELECT COUNT(*) FROM contacts WHERE user_id = u.id) as contacts_count,
              us.status as subscription_status,
              us.is_manual,
              us.expires_at,
              us.started_at,
              us.trial_ends_at,
              us.is_trial,
              us.next_charge_date,
              us.billing_period,
              us.sumit_standing_order_id,
              us.sumit_customer_id,
              us.payment_method_id,
              us.admin_notes,
              us.custom_discount_mode,
              us.referral_discount_percent as custom_discount_percent,
              us.custom_fixed_price,
              us.referral_discount_type as custom_discount_type,
              us.referral_months_remaining as custom_discount_months,
              us.custom_discount_plan_id,
              us.skip_trial,
              us.invoice_name,
              us.receipt_email,
              sp.name as plan_name,
              sp.name_he as plan_name_he,
              sp.price as plan_price,
              sp.billing_period as plan_billing_period,
              ref_user.name as referred_by_name,
              ref_user.email as referred_by_email,
              ar.status as referral_status,
              aff.id as referred_by_affiliate_id,
              false as credit_card_exempt,
              EXISTS(SELECT 1 FROM user_payment_methods pm WHERE pm.user_id = u.id AND pm.is_active = true) as has_payment_method,
              (SELECT pm.card_last_digits FROM user_payment_methods pm WHERE pm.user_id = u.id AND pm.is_active = true LIMIT 1) as card_last_digits,
              wc.status as whatsapp_status,
              wc.phone_number as whatsapp_phone,
              -- Feature usage statistics
              (SELECT COUNT(*) FROM group_forwards gf WHERE gf.user_id = u.id) as group_forwards_count,
              (SELECT COUNT(*) FROM forward_jobs fj WHERE fj.user_id = u.id) as forward_jobs_count,
              (SELECT COUNT(*) FROM group_transfers gt WHERE gt.user_id = u.id) as group_transfers_count,
              (SELECT COUNT(*) FROM transfer_jobs tj WHERE tj.user_id = u.id) as transfer_jobs_count,
              (SELECT COUNT(*) FROM broadcast_campaigns bc WHERE bc.user_id = u.id) as broadcast_campaigns_count,
              (SELECT SUM(bc.total_recipients) FROM broadcast_campaigns bc WHERE bc.user_id = u.id) as broadcast_recipients_total,
              EXISTS(SELECT 1 FROM user_service_subscriptions uss WHERE uss.user_id = u.id AND uss.status IN ('active', 'trial')) as has_status_bot,
              (SELECT uss.status FROM user_service_subscriptions uss WHERE uss.user_id = u.id LIMIT 1) as status_bot_status
       FROM users u
       LEFT JOIN user_subscriptions us ON us.user_id = u.id
       LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
       LEFT JOIN affiliate_referrals ar ON ar.referred_user_id = u.id
       LEFT JOIN affiliates aff ON aff.id = ar.affiliate_id
       LEFT JOIN users ref_user ON ref_user.id = aff.user_id
       LEFT JOIN whatsapp_connections wc ON wc.user_id = u.id
       WHERE ${whereClause}
       ORDER BY ${orderByClause}
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );
    
    res.json({
      users: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[Admin] Get users error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת משתמשים' });
  }
}

/**
 * Get single user details
 */
async function getUser(req, res) {
  try {
    const { id } = req.params;
    
    const result = await db.query(
      `SELECT u.*,
              (SELECT COUNT(*) FROM bots WHERE user_id = u.id) as bots_count,
              (SELECT COUNT(*) FROM contacts WHERE user_id = u.id) as contacts_count,
              (SELECT COUNT(*) FROM messages m
               JOIN contacts c ON m.contact_id = c.id
               WHERE c.user_id = u.id) as messages_count,
              wc.status as whatsapp_status, wc.phone_number as whatsapp_phone,
              (SELECT parent_user_id FROM linked_accounts WHERE child_user_id = u.id LIMIT 1) as linked_parent_id,
              (SELECT pu.email FROM linked_accounts la JOIN users pu ON pu.id = la.parent_user_id WHERE la.child_user_id = u.id LIMIT 1) as linked_parent_email,
              (SELECT pu.name FROM linked_accounts la JOIN users pu ON pu.id = la.parent_user_id WHERE la.child_user_id = u.id LIMIT 1) as linked_parent_name
       FROM users u
       LEFT JOIN whatsapp_connections wc ON wc.user_id = u.id
       WHERE u.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }

    const { password_hash, ...user } = result.rows[0];

    // Fetch child linked accounts (accounts linked TO this user as parent)
    const childAccounts = await db.query(
      `SELECT u.id, u.email, u.name, u.phone, u.created_at, la.created_at as linked_at
       FROM linked_accounts la
       JOIN users u ON u.id = la.child_user_id
       WHERE la.parent_user_id = $1
       ORDER BY la.created_at DESC`,
      [id]
    );
    user.linked_children = childAccounts.rows;

    res.json({ user });
  } catch (error) {
    console.error('[Admin] Get user error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת משתמש' });
  }
}

/**
 * Update user
 */
async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const { name, role, plan, is_active, is_verified, phone, linked_user_id } = req.body;

    // Prevent changing own role if not superadmin
    if (req.user.id === id && role && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'לא ניתן לשנות את התפקיד שלך' });
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      values.push(phone || null);
    }
    if (role !== undefined) {
      updates.push(`role = $${paramIndex++}`);
      values.push(role);
    }
    if (plan !== undefined) {
      updates.push(`plan = $${paramIndex++}`);
      values.push(plan);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(is_active);
    }
    if (is_verified !== undefined) {
      updates.push(`is_verified = $${paramIndex++}`);
      values.push(is_verified);
    }
    // Handle account linking separately via linked_accounts table
    if (linked_user_id !== undefined) {
      if (linked_user_id) {
        // Find the parent user
        const parentCheck = await db.query('SELECT id FROM users WHERE id = $1', [linked_user_id]);
        if (parentCheck.rows.length > 0) {
          // Remove existing parent links for this user
          await db.query('DELETE FROM linked_accounts WHERE child_user_id = $1', [id]);
          // Create the new link
          await db.query(
            'INSERT INTO linked_accounts (parent_user_id, child_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [linked_user_id, id]
          );
        }
      } else {
        // Remove all parent links
        await db.query('DELETE FROM linked_accounts WHERE child_user_id = $1', [id]);
      }
    }
    
    values.push(id);

    if (updates.length === 0 && linked_user_id === undefined) {
      return res.status(400).json({ error: 'אין שדות לעדכון' });
    }

    let result;
    if (updates.length > 0) {
      result = await db.query(
        `UPDATE users SET ${updates.join(', ')}, updated_at = NOW()
         WHERE id = $${paramIndex}
         RETURNING id, email, name, phone, role, is_active, is_verified`,
        values
      );
    } else {
      result = await db.query('SELECT id, email, name, phone, role, is_active, is_verified FROM users WHERE id = $1', [id]);
    }
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }
    
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('[Admin] Update user error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון משתמש' });
  }
}

/**
 * Delete user
 */
async function deleteUser(req, res) {
  try {
    const { id } = req.params;

    // Prevent deleting yourself
    if (req.user.id === id) {
      return res.status(400).json({ error: 'לא ניתן למחוק את עצמך' });
    }

    // Check if user exists
    const check = await db.query('SELECT role, email, name FROM users WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }

    // Prevent deleting superadmin
    if (check.rows[0].role === 'superadmin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'לא ניתן למחוק סופר-אדמין' });
    }

    // Collect all user IDs to delete (including sub-accounts)
    const subAccounts = await db.query(
      'SELECT child_user_id FROM linked_accounts WHERE parent_user_id = $1', [id]
    );
    const allUserIds = [id, ...subAccounts.rows.map(r => r.child_user_id)];

    // Stop and delete WAHA sessions for all accounts
    try {
      const wahaService = require('../../services/waha/session.service');
      for (const uid of allUserIds) {
        const connections = await db.query(
          `SELECT wc.session_name, ws.base_url, ws.api_key
           FROM whatsapp_connections wc
           LEFT JOIN waha_sources ws ON wc.waha_source_id = ws.id
           WHERE wc.user_id = $1 AND wc.session_name IS NOT NULL`,
          [uid]
        );
        for (const conn of connections.rows) {
          if (conn.base_url && conn.api_key && conn.session_name) {
            try {
              await wahaService.stopSession(conn.base_url, conn.api_key, conn.session_name);
              await wahaService.deleteSession(conn.base_url, conn.api_key, conn.session_name);
            } catch (e) {
              console.error(`[Admin] Failed to delete WAHA session ${conn.session_name}:`, e.message);
            }
          }
        }
      }
    } catch (e) {
      console.error('[Admin] WAHA cleanup error:', e.message);
    }

    // Delete sub-accounts first (CASCADE handles their related data)
    for (const sub of subAccounts.rows) {
      await db.query('DELETE FROM users WHERE id = $1', [sub.child_user_id]);
    }

    // Delete the user (CASCADE handles all related data)
    await db.query('DELETE FROM users WHERE id = $1', [id]);

    console.log(`[Admin] User deleted: ${check.rows[0].email} (${check.rows[0].name}) + ${subAccounts.rows.length} sub-accounts`);

    res.json({ success: true, deletedSubAccounts: subAccounts.rows.length });
  } catch (error) {
    console.error('[Admin] Delete user error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת משתמש' });
  }
}

/**
 * Get dashboard statistics
 */
async function getStats(req, res) {
  try {
    const stats = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM users WHERE is_active = true) as active_users,
        (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '7 days') as new_users_week,
        (SELECT COUNT(*) FROM bots) as total_bots,
        (SELECT COUNT(*) FROM bots WHERE is_active = true AND locked_reason IS NULL) as active_bots,
        (SELECT COUNT(*) FROM contacts) as total_contacts,
        (SELECT COUNT(*) FROM messages) as total_messages,
        (SELECT COUNT(*) FROM messages WHERE created_at > NOW() - INTERVAL '24 hours') as messages_today,
        (SELECT COUNT(*) FROM whatsapp_connections WHERE status = 'connected') as connected_whatsapp,
        -- Subscription stats
        (SELECT COUNT(*) FROM user_subscriptions WHERE status = 'active' AND is_manual = false) as active_subscriptions,
        (SELECT COUNT(*) FROM user_subscriptions WHERE status = 'trial' OR is_trial = true) as trial_users,
        (SELECT COUNT(*) FROM user_subscriptions WHERE status = 'cancelled') as cancelled_users,
        -- Payment stats
        (SELECT COUNT(DISTINCT u.id) FROM users u WHERE NOT EXISTS(SELECT 1 FROM user_payment_methods pm WHERE pm.user_id = u.id AND pm.is_active = true)) as users_without_payment,
        -- Module stats
        (SELECT COUNT(DISTINCT user_id) FROM user_service_subscriptions WHERE status IN ('active', 'trial')) as users_with_modules
    `);
    
    res.json({ stats: stats.rows[0] });
  } catch (error) {
    console.error('[Admin] Get stats error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת סטטיסטיקות' });
  }
}

/**
 * Update user subscription (admin)
 */
async function updateUserSubscription(req, res) {
  try {
    const { id } = req.params;
    const { 
      planId, status, expiresAt, isManual, adminNotes,
      // Payment settings
      nextChargeDate, trialEndsAt,
      // Discount settings
      customDiscountMode, customDiscountPercent, customFixedPrice, customDiscountType, customDiscountMonths, customDiscountPlanId, skipTrial,
      // Referral settings
      affiliateId,
      // Invoice settings
      invoiceName, receiptEmail
    } = req.body;
    
    // Verify user exists
    const userCheck = await db.query('SELECT id FROM users WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }
    
    // Check if user has subscription
    const subCheck = await db.query(
      'SELECT id FROM user_subscriptions WHERE user_id = $1',
      [id]
    );
    
    if (subCheck.rows.length === 0) {
      // Create new subscription
      const result = await db.query(`
        INSERT INTO user_subscriptions (
          user_id, plan_id, status, expires_at, is_manual, admin_notes,
          custom_discount_mode, referral_discount_percent, custom_fixed_price, 
          referral_discount_type, referral_months_remaining, custom_discount_plan_id, skip_trial,
          invoice_name, receipt_email
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *
      `, [
        id, planId, status || 'active', expiresAt || null, isManual !== false, adminNotes || null,
        customDiscountMode || null,
        customDiscountMode === 'percent' ? customDiscountPercent : null,
        customDiscountMode === 'fixed_price' ? customFixedPrice : null,
        customDiscountType || null,
        customDiscountType === 'custom_months' ? customDiscountMonths : 
          customDiscountType === 'first_year' ? 12 :
          customDiscountType === 'forever' ? -1 : 0,
        customDiscountPlanId || null,
        skipTrial || false,
        invoiceName || null,
        receiptEmail || null
      ]);
      
      // Handle affiliate assignment
      if (affiliateId) {
        await assignUserToAffiliate(id, affiliateId);
      }
      
      return res.json({ subscription: result.rows[0] });
    }
    
    // Update existing subscription
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (planId !== undefined) {
      // Check if plan actually changed before clearing overrides
      const currentPlanResult = await db.query(
        'SELECT plan_id FROM user_subscriptions WHERE user_id = $1',
        [id]
      );
      const currentPlanId = currentPlanResult.rows[0]?.plan_id;
      
      updates.push(`plan_id = $${paramIndex++}`);
      values.push(planId);
      
      // Only clear feature overrides if plan actually changed
      if (currentPlanId && currentPlanId !== planId) {
        console.log(`[Admin] Plan changed from ${currentPlanId} to ${planId} - clearing feature overrides`);
        await clearUserFeatureOverrides(id);
      }
    }
    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }
    if (expiresAt !== undefined) {
      updates.push(`expires_at = $${paramIndex++}`);
      values.push(expiresAt);
      // Note: expires_at and next_charge_date are now independent
      // expires_at = when subscription ends (for cancelled/manual)
      // next_charge_date = when next payment occurs (for active recurring)
    }
    if (isManual !== undefined) {
      updates.push(`is_manual = $${paramIndex++}`);
      values.push(isManual);
    }
    if (adminNotes !== undefined) {
      updates.push(`admin_notes = $${paramIndex++}`);
      values.push(adminNotes);
    }
    
    // Handle manual subscription - clear payment-related fields
    // This must come BEFORE other trial/payment settings to avoid duplicate assignments
    if (isManual === true) {
      updates.push(`is_trial = false`);
      updates.push(`trial_ends_at = NULL`);
      updates.push(`next_charge_date = NULL`);
    } else {
      // Payment date settings (only if not manual)
      if (nextChargeDate !== undefined) {
        updates.push(`next_charge_date = $${paramIndex++}`);
        values.push(nextChargeDate || null);
      }
      if (trialEndsAt !== undefined) {
        updates.push(`trial_ends_at = $${paramIndex++}`);
        values.push(trialEndsAt || null);
        // If setting trial end date, mark as trial and set status to 'trial'
        if (trialEndsAt) {
          updates.push(`is_trial = true`);
          updates.push(`status = 'trial'`);
        }
      }
    }
    
    // Discount settings
    if (customDiscountMode !== undefined) {
      updates.push(`custom_discount_mode = $${paramIndex++}`);
      values.push(customDiscountMode);
      
      // Set the appropriate value based on mode
      if (customDiscountMode === 'percent') {
        updates.push(`referral_discount_percent = $${paramIndex++}`);
        values.push(customDiscountPercent || 0);
        updates.push(`custom_fixed_price = $${paramIndex++}`);
        values.push(null);
      } else if (customDiscountMode === 'fixed_price') {
        updates.push(`custom_fixed_price = $${paramIndex++}`);
        values.push(customFixedPrice || 0);
        updates.push(`referral_discount_percent = $${paramIndex++}`);
        values.push(null);
      } else {
        // Clear both if mode is null
        updates.push(`referral_discount_percent = $${paramIndex++}`);
        values.push(null);
        updates.push(`custom_fixed_price = $${paramIndex++}`);
        values.push(null);
      }
    }
    if (customDiscountType !== undefined) {
      updates.push(`referral_discount_type = $${paramIndex++}`);
      values.push(customDiscountType);
      
      // Calculate months remaining
      let monthsRemaining = 0;
      if (customDiscountType === 'custom_months') {
        monthsRemaining = customDiscountMonths || 1;
      } else if (customDiscountType === 'first_year') {
        monthsRemaining = 12;
      } else if (customDiscountType === 'forever') {
        monthsRemaining = -1; // -1 means forever
      }
      updates.push(`referral_months_remaining = $${paramIndex++}`);
      values.push(monthsRemaining);
    }
    if (customDiscountPlanId !== undefined) {
      updates.push(`custom_discount_plan_id = $${paramIndex++}`);
      values.push(customDiscountPlanId || null);
    }
    if (skipTrial !== undefined) {
      updates.push(`skip_trial = $${paramIndex++}`);
      values.push(skipTrial || false);
    }
    
    // Invoice settings
    if (invoiceName !== undefined) {
      updates.push(`invoice_name = $${paramIndex++}`);
      values.push(invoiceName || null);
    }
    if (receiptEmail !== undefined) {
      updates.push(`receipt_email = $${paramIndex++}`);
      values.push(receiptEmail || null);
    }
    
    if (updates.length === 0 && !affiliateId) {
      return res.status(400).json({ error: 'אין שדות לעדכון' });
    }
    
    let result;
    if (updates.length > 0) {
      values.push(id);
      result = await db.query(`
        UPDATE user_subscriptions 
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE user_id = $${paramIndex}
        RETURNING *
      `, values);
    } else {
      result = await db.query('SELECT * FROM user_subscriptions WHERE user_id = $1', [id]);
    }
    
    // Handle affiliate assignment
    if (affiliateId) {
      await assignUserToAffiliate(id, affiliateId);
    }
    
    // IMPORTANT: Update pending billing queue entries if discount settings changed
    // This ensures the scheduled charges reflect the new discount
    const discountChanged = customDiscountMode !== undefined || customDiscountPercent !== undefined || 
                           customFixedPrice !== undefined || customDiscountType !== undefined;
    const planChanged = planId !== undefined;
    
    if (discountChanged || planChanged) {
      const sub = result.rows[0];
      if (sub) {
        // Get the plan price for calculation
        const planResult = await db.query(
          'SELECT price, name_he FROM subscription_plans WHERE id = $1',
          [sub.plan_id]
        );
        const plan = planResult.rows[0];
        
        if (plan && plan.price > 0) {
          let newAmount = parseFloat(plan.price);
          let newDescription = `מנוי חודשי - ${plan.name_he}`;
          
          // Apply custom discount from admin
          if (sub.custom_discount_mode === 'fixed_price' && sub.custom_fixed_price) {
            newAmount = parseFloat(sub.custom_fixed_price);
            newDescription += ' (מחיר מותאם)';
          } else if (sub.custom_discount_mode === 'percent' && sub.referral_discount_percent) {
            newAmount = Math.floor(newAmount * (1 - sub.referral_discount_percent / 100));
            newDescription += ` (${sub.referral_discount_percent}% הנחה)`;
          }
          // Apply referral discount if active
          else if (sub.referral_discount_percent && sub.referral_months_remaining !== 0) {
            newAmount = Math.floor(newAmount * (1 - sub.referral_discount_percent / 100));
            newDescription += ` (${sub.referral_discount_percent}% הנחת הפניה)`;
          }
          
          // Update pending billing queue entries with new amount
          const updateResult = await db.query(`
            UPDATE billing_queue 
            SET amount = $1, 
                description = $2,
                plan_id = $3,
                updated_at = NOW()
            WHERE user_id = $4 
              AND status = 'pending'
              AND billing_type IN ('monthly', 'renewal', 'trial_conversion', 'first_payment')
            RETURNING id
          `, [newAmount, newDescription, sub.plan_id, id]);
          
          if (updateResult.rows.length > 0) {
            console.log(`[Admin] Updated ${updateResult.rows.length} pending charges for user ${id} to ₪${newAmount}`);
          }
        }
      }
    }
    
    // IMPORTANT: Handle bot locking/unlocking when plan changes
    if (planChanged || status === 'active') {
      const sub = result.rows[0];
      if (sub) {
        // Get the new plan's bot limit
        const planLimitResult = await db.query(
          'SELECT max_bots FROM subscription_plans WHERE id = $1',
          [sub.plan_id]
        );
        const maxBots = planLimitResult.rows[0]?.max_bots;
        
        if (maxBots !== undefined && maxBots !== 0) {
          const botLimit = maxBots === -1 ? 1000 : maxBots;
          
          // Count current unlocked bots
          const unlockedBotsResult = await db.query(
            `SELECT COUNT(*) as count FROM bots WHERE user_id = $1 AND locked_reason IS NULL`,
            [id]
          );
          const unlockedBots = parseInt(unlockedBotsResult.rows[0]?.count || 0);
          
          if (unlockedBots < botLimit) {
            // Unlock more bots up to the limit
            const botsToUnlockCount = botLimit - unlockedBots;
            const botsToUnlockResult = await db.query(`
              SELECT id FROM bots 
              WHERE user_id = $1 AND locked_reason IS NOT NULL
              ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
              LIMIT $2
            `, [id, botsToUnlockCount]);
            
            if (botsToUnlockResult.rows.length > 0) {
              const botsToUnlock = botsToUnlockResult.rows.map(b => b.id);
              await db.query(`
                UPDATE bots 
                SET locked_reason = NULL, locked_at = NULL, updated_at = NOW()
                WHERE id = ANY($1::uuid[])
              `, [botsToUnlock]);
              
              console.log(`[Admin] Unlocked ${botsToUnlock.length} bots for user ${id} due to plan change`);
            }
          } else if (unlockedBots > botLimit) {
            // Lock excess bots (keep the most recently updated ones unlocked)
            const excessCount = unlockedBots - botLimit;
            const botsToLockResult = await db.query(`
              SELECT id FROM bots 
              WHERE user_id = $1 AND locked_reason IS NULL
              ORDER BY updated_at ASC NULLS FIRST, created_at ASC NULLS FIRST
              LIMIT $2
            `, [id, excessCount]);
            
            if (botsToLockResult.rows.length > 0) {
              const botsToLock = botsToLockResult.rows.map(b => b.id);
              await db.query(`
                UPDATE bots 
                SET locked_reason = 'subscription_limit', 
                    locked_at = NOW(), 
                    is_active = false,
                    updated_at = NOW()
                WHERE id = ANY($1::uuid[])
              `, [botsToLock]);
              
              console.log(`[Admin] Locked ${botsToLock.length} bots for user ${id} due to plan downgrade`);
            }
          }
        }
      }
    }
    
    res.json({ subscription: result.rows[0] });
  } catch (error) {
    console.error('[Admin] Update user subscription error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון מנוי' });
  }
}

/**
 * Helper to assign a user to an affiliate
 */
async function assignUserToAffiliate(userId, affiliateId) {
  try {
    // Check if referral already exists
    const existingRef = await db.query(
      'SELECT id FROM affiliate_referrals WHERE referred_user_id = $1',
      [userId]
    );
    
    if (existingRef.rows.length > 0) {
      // Update existing referral
      await db.query(`
        UPDATE affiliate_referrals 
        SET affiliate_id = $1, updated_at = NOW()
        WHERE referred_user_id = $2
      `, [affiliateId, userId]);
    } else {
      // Create new referral
      await db.query(`
        INSERT INTO affiliate_referrals (affiliate_id, referred_user_id, status)
        VALUES ($1, $2, 'registered')
      `, [affiliateId, userId]);
      
      // Increment affiliate signup count
      await db.query(`
        UPDATE affiliates SET total_signups = total_signups + 1 WHERE id = $1
      `, [affiliateId]);
    }
  } catch (error) {
    console.error('[Admin] Assign user to affiliate error:', error);
  }
}

/**
 * Get all subscription plans
 */
async function getPlans(req, res) {
  try {
    const result = await db.query(
      'SELECT * FROM subscription_plans WHERE is_active = true ORDER BY price ASC'
    );
    res.json({ plans: result.rows });
  } catch (error) {
    console.error('[Admin] Get plans error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת תוכניות' });
  }
}

/**
 * Get user's feature overrides
 */
async function getUserFeatureOverrides(req, res) {
  try {
    const { id } = req.params;
    
    const result = await db.query(
      'SELECT feature_overrides FROM users WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }
    
    res.json({ feature_overrides: result.rows[0].feature_overrides || null });
  } catch (error) {
    console.error('[Admin] Get feature overrides error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת הגדרות' });
  }
}

/**
 * Update user's feature overrides
 * Pass null to clear overrides and use plan defaults
 */
async function updateUserFeatureOverrides(req, res) {
  try {
    const { id } = req.params;
    const { feature_overrides } = req.body;
    
    // Validate feature_overrides structure if provided
    if (feature_overrides !== null && typeof feature_overrides !== 'object') {
      return res.status(400).json({ error: 'feature_overrides חייב להיות אובייקט או null' });
    }
    
    // Update user's feature overrides
    const result = await db.query(
      `UPDATE users SET feature_overrides = $1, updated_at = NOW() WHERE id = $2 RETURNING id, feature_overrides`,
      [feature_overrides, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }
    
    console.log(`[Admin] Updated feature overrides for user ${id}:`, feature_overrides);
    
    res.json({ 
      success: true, 
      feature_overrides: result.rows[0].feature_overrides,
      message: feature_overrides ? 'הגדרות מותאמות עודכנו' : 'הגדרות מותאמות נמחקו - המשתמש ישתמש בברירות המחדל של התוכנית'
    });
  } catch (error) {
    console.error('[Admin] Update feature overrides error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון הגדרות' });
  }
}

/**
 * Clear user's feature overrides (when plan changes)
 */
async function clearUserFeatureOverrides(userId) {
  try {
    await db.query(
      'UPDATE users SET feature_overrides = NULL, updated_at = NOW() WHERE id = $1',
      [userId]
    );
    console.log(`[Admin] Cleared feature overrides for user ${userId}`);
  } catch (error) {
    console.error('[Admin] Clear feature overrides error:', error);
  }
}

/**
 * Get user's service subscriptions (additional services like Status Bot)
 */
async function getUserServices(req, res) {
  try {
    const { id } = req.params;
    
    const result = await db.query(`
      SELECT 
        uss.*,
        s.slug, s.name, s.name_he, s.description_he,
        s.price, s.yearly_price, s.icon, s.color
      FROM user_service_subscriptions uss
      JOIN additional_services s ON s.id = uss.service_id
      WHERE uss.user_id = $1
      ORDER BY uss.started_at DESC
    `, [id]);
    
    res.json({ subscriptions: result.rows });
  } catch (error) {
    console.error('[Admin] Get user services error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת שירותי המשתמש' });
  }
}

/**
 * Lock or unlock a bot manually (admin only)
 * locked_reason = 'admin' for admin-locked bots
 */
async function toggleBotLock(req, res) {
  try {
    const { botId } = req.params;
    const { lock, reason } = req.body;
    
    // Verify bot exists
    const botCheck = await db.query('SELECT id, user_id, name, locked_reason FROM bots WHERE id = $1', [botId]);
    if (botCheck.rows.length === 0) {
      return res.status(404).json({ error: 'בוט לא נמצא' });
    }
    
    const bot = botCheck.rows[0];
    
    if (lock) {
      // Lock the bot
      await db.query(`
        UPDATE bots 
        SET locked_reason = $1, 
            locked_at = NOW(), 
            is_active = false,
            updated_at = NOW()
        WHERE id = $2
      `, [reason || 'admin', botId]);
      
      console.log(`[Admin] Locked bot "${bot.name}" (${botId}) for user ${bot.user_id}`);
      res.json({ success: true, message: 'הבוט ננעל בהצלחה' });
    } else {
      // Unlock the bot
      await db.query(`
        UPDATE bots 
        SET locked_reason = NULL, 
            locked_at = NULL,
            updated_at = NOW()
        WHERE id = $1
      `, [botId]);
      
      console.log(`[Admin] Unlocked bot "${bot.name}" (${botId}) for user ${bot.user_id}`);
      res.json({ success: true, message: 'הבוט שוחרר בהצלחה' });
    }
  } catch (error) {
    console.error('[Admin] Toggle bot lock error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון נעילת הבוט' });
  }
}

/**
 * Get all bots for a user (admin view)
 */
async function getUserBots(req, res) {
  try {
    const { id } = req.params;
    
    const result = await db.query(`
      SELECT id, name, description, is_active, locked_reason, locked_at, 
             pending_deletion, created_at, updated_at
      FROM bots 
      WHERE user_id = $1
      ORDER BY locked_reason IS NOT NULL ASC, updated_at DESC
    `, [id]);
    
    res.json({ bots: result.rows });
  } catch (error) {
    console.error('[Admin] Get user bots error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת בוטים' });
  }
}

/**
 * Generate a direct payment link for a user
 * This link allows the user to add their credit card without logging in
 */
async function generatePaymentLink(req, res) {
  try {
    const { id: userId } = req.params;
    const adminId = req.user.id;
    
    // Verify user exists
    const userResult = await db.query('SELECT id, email, name FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }
    
    // Generate a secure token
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    
    // Create the link record (expires in 7 days)
    await db.query(`
      INSERT INTO direct_payment_links (user_id, token, created_by)
      VALUES ($1, $2, $3)
    `, [userId, token, adminId]);
    
    // Build the URL
    const appUrl = process.env.APP_URL || 'https://botomat.co.il';
    const link = `${appUrl}/add-payment/${token}`;
    
    console.log(`[Admin] Generated payment link for user ${userId} by admin ${adminId}`);
    
    res.json({ 
      success: true, 
      link,
      expiresIn: '7 days',
      userName: userResult.rows[0].name,
      userEmail: userResult.rows[0].email
    });
  } catch (error) {
    console.error('[Admin] Generate payment link error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת לינק תשלום' });
  }
}

/**
 * Toggle credit card exempt status for a user
 */
async function toggleCreditCardExempt(req, res) {
  try {
    const { id: userId } = req.params;
    const { exempt } = req.body;
    
    await db.query(
      `UPDATE users SET credit_card_exempt = $1, updated_at = NOW() WHERE id = $2`,
      [exempt === true, userId]
    );
    
    console.log(`[Admin] Set credit_card_exempt=${exempt} for user ${userId}`);
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Admin] Toggle credit card exempt error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון פטור אשראי' });
  }
}

/**
 * Get user's billing history - billing_queue + payment_history + payment method details
 */
async function getUserBillingHistory(req, res) {
  try {
    const { id } = req.params;

    // billing_queue items (scheduled/pending/failed/completed charges)
    const queueResult = await db.query(`
      SELECT
        bq.id,
        bq.billing_type as charge_type,
        bq.amount,
        bq.status,
        bq.charge_date,
        bq.processed_at,
        bq.created_at,
        bq.last_error,
        bq.last_error_code,
        bq.retry_count,
        bq.max_retries,
        bq.next_retry_at,
        bq.last_attempt_at,
        bq.description,
        sp.name as plan_name,
        sp.name_he as plan_name_he
      FROM billing_queue bq
      LEFT JOIN subscription_plans sp ON sp.id = bq.plan_id
      WHERE bq.user_id = $1
      ORDER BY bq.created_at DESC
      LIMIT 50
    `, [id]);

    // payment_history items (actual Sumit transaction records)
    const historyResult = await db.query(`
      SELECT
        ph.id,
        ph.billing_type as charge_type,
        ph.amount,
        ph.currency,
        ph.status,
        ph.created_at,
        ph.description,
        ph.error_message,
        ph.failure_code,
        ph.sumit_transaction_id,
        ph.sumit_document_number,
        ph.receipt_url,
        ph.billing_queue_id
      FROM payment_history ph
      WHERE ph.user_id = $1
      ORDER BY ph.created_at DESC
      LIMIT 50
    `, [id]);

    // Active payment method details
    const paymentMethodResult = await db.query(`
      SELECT
        pm.id,
        pm.card_last_digits,
        pm.card_expiry_month,
        pm.card_expiry_year,
        pm.card_holder_name,
        pm.sumit_customer_id,
        pm.is_active,
        pm.created_at
      FROM user_payment_methods pm
      WHERE pm.user_id = $1 AND pm.is_active = true
      LIMIT 1
    `, [id]);

    // Also check if there's a sumit_customer_id in user_subscriptions (legacy)
    const legacySumitResult = await db.query(`
      SELECT sumit_customer_id, sumit_standing_order_id
      FROM user_subscriptions
      WHERE user_id = $1
    `, [id]);

    res.json({
      history: queueResult.rows,
      transactions: historyResult.rows,
      paymentMethod: paymentMethodResult.rows[0] || null,
      legacySumit: legacySumitResult.rows[0] || null
    });
  } catch (error) {
    console.error('[Admin] Get user billing history error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת היסטוריית חיובים' });
  }
}

/**
 * Sync payment method from Sumit - pull card details automatically using sumit_customer_id
 * Works when user has a Sumit customer ID but it's not linked in user_payment_methods
 */
async function syncPaymentMethodFromSumit(req, res) {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    // Find a sumit_customer_id - check both user_payment_methods and user_subscriptions
    let sumitCustomerId = null;

    const existingMethodResult = await db.query(
      `SELECT sumit_customer_id FROM user_payment_methods WHERE user_id = $1 AND sumit_customer_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
      [id]
    );
    if (existingMethodResult.rows[0]?.sumit_customer_id) {
      sumitCustomerId = existingMethodResult.rows[0].sumit_customer_id;
    }

    if (!sumitCustomerId) {
      const subResult = await db.query(
        `SELECT sumit_customer_id FROM user_subscriptions WHERE user_id = $1 AND sumit_customer_id IS NOT NULL LIMIT 1`,
        [id]
      );
      sumitCustomerId = subResult.rows[0]?.sumit_customer_id;
    }

    if (!sumitCustomerId) {
      return res.status(400).json({ error: 'לא נמצא Sumit Customer ID עבור משתמש זה' });
    }

    // Pull payment methods from Sumit
    const sumitResult = await sumitService.getCustomerPaymentMethods(sumitCustomerId);

    if (!sumitResult.success) {
      return res.status(400).json({ error: sumitResult.error || 'שגיאה בשליפת אמצעי תשלום מסאמיט' });
    }

    const methods = sumitResult.paymentMethods;
    if (!methods || methods.length === 0) {
      return res.status(404).json({ error: 'לא נמצאו אמצעי תשלום בסאמיט עבור לקוח זה' });
    }

    // Use the first (default) payment method
    const pm = methods[0];
    const paymentMethodId = pm.PaymentMethodID || pm.ID;
    const last4 = pm.Last4Digits || pm.CreditCard_LastDigits || pm.CardLastDigits || '****';
    const expiryMonth = pm.CreditCard_ExpirationMonth || pm.ExpirationMonth || null;
    const expiryYear = pm.CreditCard_ExpirationYear || pm.ExpirationYear || null;
    const holderName = pm.CardHolderName || pm.Name || null;

    // Deactivate existing payment methods
    await db.query(
      'UPDATE user_payment_methods SET is_active = false, is_default = false, updated_at = NOW() WHERE user_id = $1',
      [id]
    );

    // Insert synced payment method
    const result = await db.query(`
      INSERT INTO user_payment_methods (
        user_id, card_token, card_last_digits, card_expiry_month, card_expiry_year,
        card_holder_name, sumit_customer_id, is_active, is_default
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, true)
      RETURNING id, card_last_digits, card_expiry_month, card_expiry_year, sumit_customer_id, created_at
    `, [
      id,
      paymentMethodId?.toString() || 'synced',
      last4,
      expiryMonth,
      expiryYear,
      holderName,
      sumitCustomerId
    ]);

    // Update user has_payment_method flag
    await db.query(
      'UPDATE users SET has_payment_method = true, updated_at = NOW() WHERE id = $1',
      [id]
    );

    // Log admin action
    await db.query(`
      INSERT INTO admin_audit_log (admin_id, action, entity_type, entity_id, details)
      VALUES ($1, 'sync_payment_from_sumit', 'user', $2, $3)
    `, [adminId, id, JSON.stringify({ sumitCustomerId, last4, paymentMethodId })]);

    res.json({
      success: true,
      paymentMethod: result.rows[0],
      sumitData: { paymentMethodId, last4, expiryMonth, expiryYear, holderName, methodsFound: methods.length }
    });
  } catch (error) {
    console.error('[Admin] Sync payment from Sumit error:', error);
    res.status(500).json({ error: 'שגיאה בסנכרון מסאמיט' });
  }
}

/**
 * Manually register a payment method for a user (when Sumit customer exists but not in our DB)
 */
async function adminRegisterPaymentMethod(req, res) {
  try {
    const { id } = req.params;
    const { sumitCustomerId, paymentMethodId, cardLastDigits, cardHolderName, expiryMonth, expiryYear } = req.body;
    const adminId = req.user.id;

    if (!sumitCustomerId) {
      return res.status(400).json({ error: 'נדרש Sumit Customer ID' });
    }

    // Deactivate existing payment methods
    await db.query(
      'UPDATE user_payment_methods SET is_active = false, is_default = false, updated_at = NOW() WHERE user_id = $1',
      [id]
    );

    // Insert new payment method record
    const result = await db.query(`
      INSERT INTO user_payment_methods (
        user_id, card_token, card_last_digits, card_expiry_month, card_expiry_year,
        card_holder_name, sumit_customer_id, is_active, is_default
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, true)
      RETURNING id, card_last_digits, sumit_customer_id, created_at
    `, [
      id,
      paymentMethodId || 'manual',
      cardLastDigits || '****',
      expiryMonth || null,
      expiryYear || null,
      cardHolderName || null,
      sumitCustomerId
    ]);

    // Update user has_payment_method flag
    await db.query(
      'UPDATE users SET has_payment_method = true, updated_at = NOW() WHERE id = $1',
      [id]
    );

    // Log admin action
    await db.query(`
      INSERT INTO admin_audit_log (admin_id, action, entity_type, entity_id, details)
      VALUES ($1, 'manual_register_payment_method', 'user', $2, $3)
    `, [adminId, id, JSON.stringify({ sumitCustomerId, cardLastDigits })]);

    res.json({ success: true, paymentMethod: result.rows[0] });
  } catch (error) {
    console.error('[Admin] Register payment method error:', error);
    res.status(500).json({ error: 'שגיאה ברישום אמצעי תשלום' });
  }
}

/**
 * Approve (verify) an unverified user, optionally setting a password
 */
async function approveUser(req, res) {
  try {
    const { id } = req.params;
    const { password } = req.body;

    const check = await db.query('SELECT id, is_verified, email FROM users WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }

    const updates = ['is_verified = true'];
    const values = [];
    let paramIndex = 1;

    if (password) {
      const passwordHash = await hashPassword(password);
      updates.push(`password_hash = $${paramIndex++}`);
      values.push(passwordHash);
    }

    values.push(id);

    await db.query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex}`,
      values
    );

    console.log(`[Admin] User ${check.rows[0].email} approved by admin ${req.user.id}`);

    res.json({ success: true, message: 'המשתמש אומת בהצלחה' });
  } catch (error) {
    console.error('[Admin] Approve user error:', error);
    res.status(500).json({ error: 'שגיאה באימות משתמש' });
  }
}

/**
 * Create a new verified user with a default password
 */
async function createUser(req, res) {
  try {
    const { email, name, password = '12345678', phone } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'נדרש אימייל' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'סיסמה חייבת להיות לפחות 8 תווים' });
    }

    // Check if user exists
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'אימייל כבר קיים במערכת' });
    }

    // Create user (verified by default)
    const passwordHash = await hashPassword(password);
    const result = await db.query(
      `INSERT INTO users (email, password_hash, name, phone, is_verified, is_active)
       VALUES ($1, $2, $3, $4, true, true) RETURNING id, email, name`,
      [email.toLowerCase(), passwordHash, name || null, phone || null]
    );

    const userId = result.rows[0].id;

    // Create Free subscription
    try {
      const planResult = await db.query(
        `SELECT id FROM subscription_plans WHERE name = 'Free' AND is_active = true LIMIT 1`
      );
      if (planResult.rows.length > 0) {
        await db.query(`
          INSERT INTO user_subscriptions (user_id, plan_id, status, is_trial, billing_period)
          VALUES ($1, $2, 'active', false, 'monthly')
        `, [userId, planResult.rows[0].id]);
      }
    } catch (subError) {
      console.error('[Admin] Failed to create subscription for new user:', subError);
    }

    console.log(`[Admin] User ${email} created by admin ${req.user.id}`);

    res.status(201).json({
      success: true,
      user: result.rows[0],
      message: 'המשתמש נוצר בהצלחה'
    });
  } catch (error) {
    console.error('[Admin] Create user error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת משתמש' });
  }
}

/**
 * Admin: Remove (deactivate) a user's payment method
 */
async function removePaymentMethod(req, res) {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    // Deactivate all payment methods for this user
    const result = await db.query(
      'UPDATE user_payment_methods SET is_active = false, is_default = false, updated_at = NOW() WHERE user_id = $1 AND is_active = true RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'לא נמצא אמצעי תשלום פעיל' });
    }

    // Update user flag
    await db.query('UPDATE users SET has_payment_method = false, updated_at = NOW() WHERE id = $1', [id]);

    // Audit log
    await db.query(
      `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details) VALUES ($1, 'remove_payment_method', 'user', $2, $3)`,
      [adminId, id, JSON.stringify({ deactivated_count: result.rows.length })]
    ).catch(() => {});

    console.log(`[Admin] Payment method removed for user ${id} by admin ${adminId}`);
    res.json({ success: true, message: 'אמצעי התשלום הוסר בהצלחה' });
  } catch (error) {
    console.error('[Admin] Remove payment method error:', error);
    res.status(500).json({ error: 'שגיאה בהסרת אמצעי תשלום' });
  }
}

module.exports = {
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  getStats,
  updateUserSubscription,
  getPlans,
  getUserFeatureOverrides,
  updateUserFeatureOverrides,
  clearUserFeatureOverrides,
  getUserServices,
  toggleBotLock,
  getUserBots,
  generatePaymentLink,
  toggleCreditCardExempt,
  getUserBillingHistory,
  syncPaymentMethodFromSumit,
  adminRegisterPaymentMethod,
  approveUser,
  createUser,
  removePaymentMethod
};
