/**
 * ONE-TIME SCRIPT: Send to last 5 pending groups for job 859795e8
 * Run with: docker exec flowbotomat_backend node send-5-groups.js
 */
const { Pool } = require('pg');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const JOB_ID = '859795e8-d974-49be-858d-9fc332fda53d';
const WAHA_IMAGE_URL = 'https://files.neriyabudraham.co.il/files/ACDB677F73A9440BD26099E0FA62FEC4_20260209_s5793.jpeg';
const WAHA_BASE_URL = process.env.WAHA_BASE_URL;
const WAHA_API_KEY = process.env.WAHA_API_KEY;
const SESSION_NAME = 'session_01keptmqb60fhc15240vbgpss3';
const DELAY_MS = 3000;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function downloadImage() {
  // Try to download the image from WAHA and save locally
  const urlsToTry = [];
  
  // Internal WAHA URL
  if (WAHA_BASE_URL) {
    const urlObj = new URL(WAHA_IMAGE_URL);
    urlsToTry.push(`${WAHA_BASE_URL.replace(/\/$/, '')}${urlObj.pathname}`);
  }
  // Original URL
  urlsToTry.push(WAHA_IMAGE_URL);
  
  for (const url of urlsToTry) {
    try {
      console.log(`Trying to download from: ${url.substring(0, 80)}...`);
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 15000,
        headers: WAHA_API_KEY ? { 'X-Api-Key': WAHA_API_KEY } : {}
      });
      
      // Save locally
      const uploadsDir = path.join(__dirname, 'uploads/image');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      
      const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.jpeg`;
      const savePath = path.join(uploadsDir, filename);
      fs.writeFileSync(savePath, response.data);
      
      // Build URL
      let baseApiUrl = process.env.API_URL || '';
      if (baseApiUrl.startsWith('/') || !baseApiUrl.startsWith('http')) {
        const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:4000').replace(/\/$/, '');
        baseApiUrl = `${frontendUrl}${baseApiUrl.startsWith('/') ? baseApiUrl : '/api'}`;
      }
      const localUrl = `${baseApiUrl}/uploads/image/${filename}`;
      
      console.log(`Downloaded! Saved as: ${localUrl} (${response.data.length} bytes)`);
      return localUrl;
    } catch (err) {
      console.log(`Failed: ${err.message}`);
    }
  }
  
  return null;
}

async function main() {
  try {
    // 1. Get the job
    const jobRes = await pool.query(`SELECT * FROM forward_jobs WHERE id = $1`, [JOB_ID]);
    if (jobRes.rows.length === 0) {
      console.error('Job not found!');
      process.exit(1);
    }
    const job = jobRes.rows[0];
    console.log(`Job found: ${job.id}, type: ${job.message_type}`);
    console.log(`Caption: ${job.message_text?.substring(0, 50)}...`);
    
    // 2. Get pending/failed messages - last 5 by sort order
    const msgsRes = await pool.query(`
      SELECT fjm.id, fjm.status, gft.group_id, gft.group_name, gft.sort_order
      FROM forward_job_messages fjm
      JOIN group_forward_targets gft ON fjm.target_id = gft.id
      WHERE fjm.job_id = $1 AND fjm.status IN ('pending', 'failed')
      ORDER BY gft.sort_order DESC
      LIMIT 7
    `, [JOB_ID]);
    
    if (msgsRes.rows.length === 0) {
      console.log('No pending/failed messages found!');
      process.exit(0);
    }
    
    console.log(`\nFound ${msgsRes.rows.length} groups to send to:`);
    msgsRes.rows.forEach((m, i) => {
      console.log(`  ${i+1}. ${m.group_name || m.group_id} (sort: ${m.sort_order}, status: ${m.status})`);
    });
    
    // 3. Use the provided image URL directly
    let imageUrl = WAHA_IMAGE_URL;
    console.log(`\nUsing image URL: ${imageUrl}`);
    
    // 4. Send to each group with delay
    const wahaClient = axios.create({
      baseURL: WAHA_BASE_URL,
      headers: WAHA_API_KEY ? { 'X-Api-Key': WAHA_API_KEY } : {}
    });
    
    let successCount = 0;
    let failCount = 0;
    
    // Reverse to send in ascending sort order
    const groups = msgsRes.rows.reverse();
    
    for (let i = 0; i < groups.length; i++) {
      const msg = groups[i];
      console.log(`\n[${i+1}/${groups.length}] Sending to: ${msg.group_name || msg.group_id}`);
      
      try {
        const response = await wahaClient.post('/api/sendImage', {
          session: SESSION_NAME,
          chatId: msg.group_id,
          file: {
            mimetype: 'image/jpeg',
            filename: 'image.jpeg',
            url: imageUrl
          },
          caption: job.message_text || ''
        });
        
        console.log(`  OK! Response: ${JSON.stringify(response.data).substring(0, 100)}`);
        
        // Update DB
        await pool.query(`
          UPDATE forward_job_messages SET status = 'sent', sent_at = NOW(), error_message = NULL 
          WHERE id = $1
        `, [msg.id]);
        
        successCount++;
      } catch (err) {
        const errMsg = err.response?.data ? JSON.stringify(err.response.data).substring(0, 200) : err.message;
        console.error(`  FAILED: ${errMsg}`);
        
        await pool.query(`
          UPDATE forward_job_messages SET status = 'failed', error_message = $2 WHERE id = $1
        `, [msg.id, errMsg.substring(0, 500)]);
        
        failCount++;
      }
      
      // Wait between sends
      if (i < groups.length - 1) {
        console.log(`  Waiting ${DELAY_MS/1000}s...`);
        await sleep(DELAY_MS);
      }
    }
    
    // 5. Update job counts
    const countsRes = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'sent') as sent,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'pending') as pending
      FROM forward_job_messages WHERE job_id = $1
    `, [JOB_ID]);
    
    const counts = countsRes.rows[0];
    const finalStatus = parseInt(counts.pending) === 0 
      ? (parseInt(counts.failed) === 0 ? 'completed' : 'partial') 
      : 'sending';
    
    await pool.query(`
      UPDATE forward_jobs 
      SET sent_count = $2, failed_count = $3, status = $4::text, 
          updated_at = NOW(), completed_at = CASE WHEN $4::text IN ('completed', 'partial') THEN NOW() ELSE completed_at END
      WHERE id = $1
    `, [JOB_ID, parseInt(counts.sent), parseInt(counts.failed), finalStatus]);
    
    // Update media_url if we downloaded locally
    if (imageUrl !== WAHA_IMAGE_URL) {
      await pool.query(`UPDATE forward_jobs SET media_url = $2 WHERE id = $1`, [JOB_ID, imageUrl]);
    }
    
    console.log(`\n========================================`);
    console.log(`Done! Success: ${successCount}, Failed: ${failCount}`);
    console.log(`Job status: ${finalStatus} (sent: ${counts.sent}, failed: ${counts.failed}, pending: ${counts.pending})`);
    console.log(`========================================`);
    
  } catch (error) {
    console.error('Script error:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

main();
