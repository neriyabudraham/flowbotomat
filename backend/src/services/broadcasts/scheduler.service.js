const db = require('../../config/database');
const { startCampaignSending } = require('./sender.service');

/**
 * Check for scheduled campaigns that should be started
 * This function is called by a cron job every minute
 */
async function processScheduledCampaigns() {
  try {
    // Find all scheduled campaigns where scheduled_at has passed
    const result = await db.query(`
      SELECT c.*, u.id as user_id 
      FROM broadcast_campaigns c
      JOIN users u ON u.id = c.user_id
      WHERE c.status = 'scheduled' 
      AND c.scheduled_at <= NOW()
    `);
    
    if (result.rows.length === 0) {
      return;
    }
    
    console.log(`[Campaign Scheduler] Found ${result.rows.length} campaigns to start`);
    
    for (const campaign of result.rows) {
      try {
        console.log(`[Campaign Scheduler] Starting scheduled campaign: ${campaign.name} (${campaign.id})`);
        
        // Get audience contacts
        const audienceResult = await db.query(
          'SELECT * FROM broadcast_audiences WHERE id = $1',
          [campaign.audience_id]
        );
        
        if (audienceResult.rows.length === 0) {
          console.error(`[Campaign Scheduler] Audience not found for campaign ${campaign.id}`);
          await db.query(`
            UPDATE broadcast_campaigns 
            SET status = 'failed', updated_at = NOW()
            WHERE id = $1
          `, [campaign.id]);
          continue;
        }
        
        const audience = audienceResult.rows[0];
        
        // Build recipients list
        let contacts;
        if (audience.is_static) {
          const contactsResult = await db.query(`
            SELECT c.id, c.phone, c.display_name FROM contacts c
            JOIN broadcast_audience_contacts bac ON bac.contact_id = c.id
            WHERE bac.audience_id = $1 AND c.is_blocked = false
          `, [audience.id]);
          contacts = contactsResult.rows;
        } else {
          // Dynamic audience - get all user's non-blocked contacts
          // (in production, apply filter_criteria)
          const contactsResult = await db.query(`
            SELECT c.id, c.phone, c.display_name FROM contacts c
            WHERE c.user_id = $1 AND c.is_blocked = false
          `, [campaign.user_id]);
          contacts = contactsResult.rows;
        }
        
        if (contacts.length === 0) {
          console.log(`[Campaign Scheduler] No contacts in audience for campaign ${campaign.id}`);
          await db.query(`
            UPDATE broadcast_campaigns 
            SET status = 'failed', updated_at = NOW()
            WHERE id = $1
          `, [campaign.id]);
          continue;
        }
        
        // Start transaction to insert recipients and update status
        const client = await db.pool.connect();
        try {
          await client.query('BEGIN');
          
          // Clear existing pending recipients
          await client.query(
            "DELETE FROM broadcast_campaign_recipients WHERE campaign_id = $1 AND status = 'pending'",
            [campaign.id]
          );
          
          // Insert new recipients
          for (const contact of contacts) {
            await client.query(`
              INSERT INTO broadcast_campaign_recipients 
              (campaign_id, contact_id, phone, contact_name, status)
              VALUES ($1, $2, $3, $4, 'pending')
              ON CONFLICT DO NOTHING
            `, [campaign.id, contact.id, contact.phone, contact.display_name]);
          }
          
          // Update campaign status to running
          await client.query(`
            UPDATE broadcast_campaigns 
            SET status = 'running', 
                started_at = NOW(),
                total_recipients = $1,
                updated_at = NOW()
            WHERE id = $2
          `, [contacts.length, campaign.id]);
          
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
        
        // Start sending in background
        startCampaignSending(campaign.id, campaign.user_id).catch(err => {
          console.error(`[Campaign Scheduler] Error starting campaign ${campaign.id}:`, err);
        });
        
        console.log(`[Campaign Scheduler] Successfully started campaign: ${campaign.name}`);
        
      } catch (err) {
        console.error(`[Campaign Scheduler] Error processing campaign ${campaign.id}:`, err);
        // Mark campaign as failed
        await db.query(`
          UPDATE broadcast_campaigns 
          SET status = 'failed', updated_at = NOW()
          WHERE id = $1
        `, [campaign.id]);
      }
    }
  } catch (error) {
    console.error('[Campaign Scheduler] Error:', error);
  }
}

module.exports = {
  processScheduledCampaigns
};
