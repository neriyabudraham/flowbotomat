# מערכת שליחת הודעות תפוצה - אפיון מלא

## סקירה כללית

מערכת לשליחת הודעות WhatsApp בתפוצה לקהלי יעד, עם תמיכה בתבניות, תזמון, ומעקב אחר סטטוס.

**חשוב**: המערכת חייבת להיות מסונכרנת במלואה עם:
- מערכת אנשי הקשר הקיימת (`contacts` table)
- מערכת המשתנים הקיימת (`user_variable_definitions` + `contact_variables`)
- שירות שליחת ההודעות הקיים (WAHA)

---

## שלב 1: קהלים (Audiences)

### מטרה
אפשר למשתמש להגדיר קהלי יעד לשליחת הודעות.

### סוגי קהלים

#### קהל סטטי
- בחירה ידנית של אנשי קשר מתוך רשימת `contacts` הקיימת
- אנשי הקשר נשמרים בטבלת קשר `broadcast_audience_contacts`

#### קהל דינמי
- מוגדר לפי פילטרים (תגיות, משתנים)
- אנשי הקשר נטענים דינמית בזמן השליחה
- **פילטרים אפשריים**:
  - לפי תגית (`contact_tags`)
  - לפי ערך משתנה (`contact_variables`) 
  - לפי מצב חסימה (`is_blocked`)
  - לפי מצב בוט פעיל (`is_bot_active`)

### טבלאות DB

```sql
-- קיים כבר
broadcast_audiences (
  id, user_id, name, description, 
  filter_criteria JSONB, -- לקהל דינמי
  is_static BOOLEAN,
  created_at, updated_at
)

broadcast_audience_contacts (
  audience_id, contact_id, added_at
  -- PRIMARY KEY (audience_id, contact_id)
)
```

### API
- `GET /broadcasts/audiences` - רשימת קהלים
- `POST /broadcasts/audiences` - יצירת קהל
- `GET /broadcasts/audiences/:id/contacts` - אנשי קשר בקהל (עם pagination)
- `POST /broadcasts/audiences/:id/contacts/add` - הוספת אנשי קשר (לסטטי)
- `DELETE /broadcasts/audiences/:id/contacts/:contactId` - הסרת איש קשר

### UI Tasks
- [ ] רשימת קהלים עם כמות אנשי קשר
- [ ] יצירת קהל סטטי עם בחירת אנשי קשר
- [ ] יצירת קהל דינמי עם בונה פילטרים
- [ ] צפייה באנשי קשר בקהל

---

## שלב 2: ייבוא אנשי קשר

### מטרה
ייבוא רשימת אנשי קשר מקובץ Excel/CSV, עם מיפוי למשתנים קיימים.

### חשוב - סנכרון עם המערכת
1. **אנשי קשר** נשמרים בטבלת `contacts` הקיימת (לא טבלה חדשה!)
2. **משתנים** נשמרים ב-`contact_variables` (כמו בבוטים)
3. **הגדרות משתנים** נוצרות ב-`user_variable_definitions` (אם חדשים)

### תהליך הייבוא
1. **העלאת קובץ** - Excel או CSV
2. **תצוגה מקדימה** - טבלה עם כל הנתונים (גלילה, עד 100 שורות)
3. **מיפוי שדות**:
   - כל עמודה -> משתנה
   - שדות חובה: `phone` (מספר טלפון)
   - שדות מערכת: `name` (שם איש קשר)
   - משתנים קיימים מ-`user_variable_definitions`
   - אפשרות ליצור משתנה חדש
4. **אישור וייבוא** - עם אפשרות להוסיף לקהל

### לוגיקת הייבוא (Backend)
```javascript
for each row in file:
  1. Validate phone number
  2. Find or create contact in `contacts` table
  3. For each mapped variable (except phone, name):
     - Save to `contact_variables` (key, value)
     - Create definition in `user_variable_definitions` if not exists
  4. If target_audience_id:
     - Add to `broadcast_audience_contacts`
```

### API
- `POST /broadcasts/import/upload` - העלאת קובץ
- `POST /broadcasts/import/execute` - ביצוע ייבוא

### UI Tasks
- [ ] אזור העלאת קובץ (drag & drop)
- [ ] טבלת תצוגה מקדימה עם גלילה
- [ ] Dropdown מיפוי על כל עמודה
- [ ] רשימת משתנים זמינים (מערכת + משתמש)
- [ ] מודאל יצירת משתנה חדש
- [ ] בחירת קהל יעד (אופציונלי)
- [ ] סיכום ואישור

---

## שלב 3: תבניות הודעות (Templates)

### מטרה
יצירת תבניות הודעות לשימוש חוזר, עם תמיכה במשתנים.

### מבנה תבנית
- **שם ותיאור**
- **רשימת הודעות** - תבנית יכולה להכיל מספר הודעות ברצף
- כל הודעה כוללת:
  - סוג (טקסט, תמונה, וידאו, אודיו, מסמך)
  - תוכן (עם תמיכה ב-`{{variable}}`)
  - מדיה (URL)
  - השהייה לפני שליחה (שניות)

### סנכרון עם משתנים
- משתנים מוחלפים בזמן שליחה על ידי `replaceAllVariables()`
- תומך בכל המשתנים מ-`user_variable_definitions`
- תומך במשתני מערכת: `{{name}}`, `{{contact_phone}}`, `{{date}}`, `{{time}}`

### טבלאות DB
```sql
-- קיים כבר
broadcast_templates (id, user_id, name, description, created_at, updated_at)

broadcast_template_messages (
  id, template_id, message_order,
  message_type, -- 'text', 'image', 'video', 'audio', 'document'
  content, media_url, media_caption,
  delay_seconds,
  created_at
)
```

### UI Tasks
- [ ] רשימת תבניות
- [ ] יצירת/עריכת תבנית
- [ ] הוספת הודעות לתבנית (drag to reorder)
- [ ] בחירת סוג הודעה
- [ ] עורך תוכן עם autocomplete למשתנים
- [ ] תצוגה מקדימה של תבנית

---

## שלב 4: קמפיינים (Campaigns)

### מטרה
יצירת וניהול קמפיינים לשליחת הודעות תפוצה.

### הגדרות קמפיין
- **שם ותיאור**
- **קהל יעד** - מתוך הקהלים שנוצרו
- **תוכן** - תבנית או הודעה ישירה
- **תזמון** - מיידי או מתוזמן
- **הגדרות שליחה**:
  - `delay_between_messages` - השהייה בין הודעות (שניות, ברירת מחדל 3)
  - `delay_between_batches` - השהייה בין קבוצות (שניות, ברירת מחדל 30)
  - `batch_size` - גודל קבוצה (ברירת מחדל 50)

### סטטוסים
- `draft` - טיוטה
- `scheduled` - מתוזמן
- `running` - בשליחה
- `paused` - מושהה
- `completed` - הושלם
- `cancelled` - בוטל
- `failed` - נכשל

### תהליך השליחה (Backend)
```javascript
async function executeCampaign(campaignId) {
  1. Load campaign with audience and template
  2. Get all contacts for audience (static or dynamic filter)
  3. Create recipients in `broadcast_campaign_recipients`
  4. For each batch of recipients:
     a. For each recipient in batch:
        - Replace variables with contact data
        - Send via WAHA (use existing sendMessage functions)
        - Update recipient status
        - Wait delay_between_messages
     b. Wait delay_between_batches
  5. Update campaign status to 'completed'
}
```

### טבלאות DB
```sql
-- קיים כבר
broadcast_campaigns (
  id, user_id, name, description,
  template_id, audience_id,
  direct_message, -- הודעה ישירה (אם לא משתמשים בתבנית)
  status,
  scheduled_at, started_at, completed_at,
  settings JSONB, -- delay settings
  total_recipients, sent_count, delivered_count, read_count, failed_count,
  created_at, updated_at
)

broadcast_campaign_recipients (
  id, campaign_id, contact_id,
  phone, contact_name, -- נשמר להיסטוריה
  status, -- 'pending', 'sending', 'sent', 'delivered', 'read', 'failed'
  error_message,
  queued_at, sent_at, delivered_at, read_at,
  waha_message_ids JSONB
)
```

### API
- `POST /broadcasts/campaigns/:id/start` - התחלת קמפיין
- `POST /broadcasts/campaigns/:id/pause` - השהייה
- `POST /broadcasts/campaigns/:id/resume` - המשך
- `POST /broadcasts/campaigns/:id/cancel` - ביטול
- `GET /broadcasts/campaigns/:id/stats` - סטטיסטיקות
- `GET /broadcasts/campaigns/:id/recipients` - רשימת נמענים

### UI Tasks
- [ ] רשימת קמפיינים עם סטטוסים
- [ ] יצירת קמפיין חדש
- [ ] בחירת קהל
- [ ] בחירת תבנית או הודעה ישירה
- [ ] הגדרות תזמון
- [ ] הגדרות שליחה (delays)
- [ ] פעולות: התחל, השהה, המשך, בטל
- [ ] תצוגת התקדמות בזמן אמת
- [ ] סטטיסטיקות קמפיין

---

## שלב 5: שירות שליחה (Broadcast Service)

### מטרה
שירות Backend שמבצע את השליחה בפועל.

### חשוב - שימוש בקוד קיים
- שימוש ב-`wahaSession.sendMessage()` הקיים
- שימוש ב-`replaceAllVariables()` להחלפת משתנים
- שימוש ב-`getConnection()` לקבלת חיבור WhatsApp

### מבנה השירות
```javascript
// broadcasts.service.js

async function executeCampaign(campaignId, userId) {
  const campaign = await getCampaign(campaignId);
  const connection = await getConnection(userId);
  const contacts = await getAudienceContacts(campaign.audience_id);
  
  // Create recipients
  await createRecipients(campaignId, contacts);
  
  // Send in batches
  const batchSize = campaign.settings.batch_size || 50;
  const batches = chunk(contacts, batchSize);
  
  for (const batch of batches) {
    for (const contact of batch) {
      await sendToRecipient(campaign, contact, connection);
      await sleep(campaign.settings.delay_between_messages * 1000);
    }
    await sleep(campaign.settings.delay_between_batches * 1000);
  }
}

async function sendToRecipient(campaign, contact, connection) {
  // Get messages (from template or direct)
  const messages = campaign.template_id 
    ? await getTemplateMessages(campaign.template_id)
    : [{ content: campaign.direct_message, message_type: 'text' }];
  
  for (const msg of messages) {
    // Replace variables
    const content = await replaceAllVariables(
      msg.content, contact, null, null, campaign.user_id
    );
    
    // Send based on type
    switch (msg.message_type) {
      case 'text':
        await wahaSession.sendMessage(connection, contact.phone, content);
        break;
      case 'image':
        await wahaSession.sendImage(connection, contact.phone, msg.media_url, content);
        break;
      // ... other types
    }
    
    // Delay between messages in template
    if (msg.delay_seconds > 0) {
      await sleep(msg.delay_seconds * 1000);
    }
  }
  
  // Update recipient status
  await updateRecipientStatus(campaign.id, contact.id, 'sent');
}
```

### Backend Tasks
- [ ] יצירת `broadcasts.service.js`
- [ ] פונקציית `executeCampaign`
- [ ] פונקציית `sendToRecipient` (משתמש ב-WAHA קיים)
- [ ] עדכון סטטוסים בזמן אמת
- [ ] טיפול בשגיאות (ללא עצירה)
- [ ] תמיכה ב-pause/resume
- [ ] תזמון עם cron job

---

## שלב 6: תזמון (Scheduler)

### מטרה
הפעלת קמפיינים מתוזמנים אוטומטית.

### מימוש
```javascript
// scheduler.js (cron job)
const cron = require('node-cron');

// Run every minute
cron.schedule('* * * * *', async () => {
  const scheduledCampaigns = await pool.query(`
    SELECT * FROM broadcast_campaigns 
    WHERE status = 'scheduled' 
    AND scheduled_at <= NOW()
  `);
  
  for (const campaign of scheduledCampaigns.rows) {
    executeCampaign(campaign.id, campaign.user_id);
  }
});
```

---

## סיכום משימות

### Backend
- [x] טבלאות DB
- [ ] תיקון API לקהלים - חיבור לאנשי קשר קיימים
- [ ] תיקון API לייבוא - שמירה ב-`contacts` + `contact_variables`
- [ ] שירות שליחה - שימוש ב-WAHA קיים
- [ ] תזמון - cron job

### Frontend
- [ ] UI קהלים - בחירת אנשי קשר מהמערכת
- [ ] UI ייבוא - מיפוי עם משתנים קיימים
- [ ] UI תבניות - autocomplete משתנים
- [ ] UI קמפיינים - פעולות ומעקב
- [ ] התקדמות בזמן אמת (Socket.io)

---

## הערות חשובות

1. **לא ליצור טבלאות חדשות לאנשי קשר** - להשתמש ב-`contacts` הקיים
2. **לא ליצור מערכת משתנים נפרדת** - להשתמש ב-`user_variable_definitions` + `contact_variables`
3. **לא לכתוב קוד שליחה חדש** - להשתמש ב-WAHA service קיים
4. **להשתמש ב-`replaceAllVariables`** - פונקציה קיימת שיודעת להחליף הכל
