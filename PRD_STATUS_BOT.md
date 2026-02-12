# PRD - בוט העלאת סטטוסים

## סקירה כללית

שירות נוסף במערכת Botomat המאפשר למשתמשים להעלות סטטוסים לווצאפ שלהם באמצעות:
1. ממשק ווב
2. שליחת הודעה לבוט הרשמי בווצאפ

---

## 1. דף נחיתה (Landing Page)

### 1.1 מבנה הדף
- [ ] Hero section עם הסבר על השירות
- [ ] רשימת פיצ'רים
- [ ] תמחור (250 ₪/חודש - ניתן לעדכון דרך Admin)
- [ ] כפתור הרשמה/התחברות
- [ ] FAQ בסיסי

### 1.2 Flow הרשמה
- [ ] אם המשתמש מחובר למערכת Botomat → בדיקת מנוי לשירות
- [ ] אם לא מחובר → העברה לדף התחברות/הרשמה (אותו חשבון כמו Botomat)
- [ ] אחרי התחברות → דף תשלום לשירות
- [ ] אחרי תשלום → דף הגדרות השירות

---

## 2. מודל נתונים

### 2.1 טבלה: `status_bot_connections`
```sql
CREATE TABLE status_bot_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- WhatsApp connection
  phone_number VARCHAR(20),
  session_name VARCHAR(100), -- שם הסשן ב-WAHA
  waha_instance_url VARCHAR(255), -- URL של ה-WAHA instance
  waha_api_key VARCHAR(255),
  connection_status VARCHAR(20) DEFAULT 'disconnected', -- connected, disconnected, pending
  
  -- 24-hour restriction
  connected_at TIMESTAMP, -- מתי התחבר (לחישוב 24 שעות)
  restriction_lifted BOOLEAN DEFAULT false, -- האם אדמין שחרר את החסימה
  restriction_lifted_at TIMESTAMP,
  restriction_lifted_by UUID REFERENCES users(id),
  
  -- Settings
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 2.2 טבלה: `status_bot_authorized_numbers`
```sql
CREATE TABLE status_bot_authorized_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES status_bot_connections(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL, -- מספר מורשה להעלאת סטטוסים
  name VARCHAR(100), -- שם לזיהוי
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(connection_id, phone_number)
);
```

### 2.3 טבלה: `status_bot_queue`
```sql
CREATE TABLE status_bot_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES status_bot_connections(id) ON DELETE CASCADE,
  
  -- Content
  status_type VARCHAR(20) NOT NULL, -- text, image, voice, video
  content JSONB NOT NULL, -- תוכן הסטטוס (טקסט/URL/וכו')
  
  -- Status
  queue_status VARCHAR(20) DEFAULT 'pending', -- pending, processing, sent, failed
  error_message TEXT,
  
  -- Timing
  created_at TIMESTAMP DEFAULT NOW(),
  processing_started_at TIMESTAMP,
  sent_at TIMESTAMP,
  
  -- Source
  source VARCHAR(20) DEFAULT 'web', -- web, whatsapp
  source_message_id VARCHAR(100) -- ID ההודעה המקורית מווצאפ (אם רלוונטי)
);
```

### 2.4 טבלה: `status_bot_history`
```sql
CREATE TABLE status_bot_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES status_bot_connections(id) ON DELETE CASCADE,
  
  status_type VARCHAR(20) NOT NULL,
  content JSONB NOT NULL,
  waha_status_id VARCHAR(100), -- ID של הסטטוס ב-WAHA (אם קיים)
  
  sent_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP, -- אם נמחק
  
  source VARCHAR(20), -- web, whatsapp
  source_phone VARCHAR(20) -- מי שלח (אם מווצאפ)
);
```

---

## 3. Backend API Endpoints

### 3.1 Connection Management
```
GET  /api/status-bot/connection          - מצב החיבור הנוכחי
POST /api/status-bot/connect             - התחל תהליך חיבור
POST /api/status-bot/disconnect          - נתק
GET  /api/status-bot/qr                  - קבל QR לסריקה
```

### 3.2 Authorized Numbers
```
GET    /api/status-bot/authorized-numbers     - רשימת מספרים מורשים
POST   /api/status-bot/authorized-numbers     - הוסף מספר
DELETE /api/status-bot/authorized-numbers/:id - מחק מספר
```

### 3.3 Status Upload (Web)
```
POST /api/status-bot/status/text   - העלאת סטטוס טקסט
POST /api/status-bot/status/image  - העלאת סטטוס תמונה
POST /api/status-bot/status/voice  - העלאת סטטוס שמע
POST /api/status-bot/status/video  - העלאת סטטוס וידאו
POST /api/status-bot/status/delete - מחיקת סטטוס
GET  /api/status-bot/status/history - היסטוריית סטטוסים
```

### 3.4 Queue Management
```
GET /api/status-bot/queue           - מצב התור
```

### 3.5 Admin Endpoints
```
GET  /api/admin/status-bot/users                    - כל המשתמשים בשירות
POST /api/admin/status-bot/users/:userId/lift-restriction - שחרור חסימת 24 שעות
GET  /api/admin/status-bot/stats                    - סטטיסטיקות
```

---

## 4. Frontend Pages

### 4.1 דף נחיתה
**Route:** `/status-bot`
- Hero section
- Features
- Pricing
- CTA → Sign up / Login

### 4.2 דף דשבורד השירות
**Route:** `/status-bot/dashboard`
- מצב חיבור WhatsApp
- הגדרת מספרים מורשים
- טופס העלאת סטטוס
- היסטוריית סטטוסים
- מצב תור

### 4.3 דף חיבור WhatsApp
**Route:** `/status-bot/connect`
- QR Code לסריקה
- הוראות
- סטטוס חיבור

---

## 5. לוגיקת שליחת סטטוסים

### 5.1 Flow מהאתר
1. משתמש ממלא טופס (טקסט/מעלה קובץ)
2. בדיקות:
   - [ ] האם מחובר?
   - [ ] האם עברו 24 שעות / הוסרה חסימה?
   - [ ] האם יש מנוי פעיל?
3. הוספה לתור (`status_bot_queue`)
4. Worker מעבד את התור (אחד אחד)
5. שליחה ל-WAHA API
6. עדכון סטטוס + שמירה בהיסטוריה

### 5.2 Flow מווצאפ (?)
```
❓ איך מגיעות הקריאות מווצאפ הרשמי?
❓ מה הפורמט של ההודעות?
❓ איך מזהים שזו הודעה לבוט הסטטוסים?
❓ איך עונים למשתמש?
```

**מספר הבוט:** +972 53-923-2960
**שם הבוט:** בוט העלאת סטטוסים בוטומט

---

## 6. שליחה בפועל ל-WAHA

### 6.1 API Endpoints של WAHA
```
Base URL: https://bot.botomat.co.il/api/{session}

Headers:
- X-Api-Key: {api_key}
- Content-Type: application/json
```

### 6.2 סוגי סטטוסים

#### טקסט
```json
POST /status/text
{
  "id": null,              // או ID מ-new-message-id
  "contacts": null,        // תמיד null - לכל אנשי הקשר
  "text": "הטקסט",
  "backgroundColor": "#38b42f",  // צבע רקע מותאם
  "font": 0,
  "linkPreview": true,
  "linkPreviewHighQuality": false
}
```

#### תמונה
```json
POST /status/image
{
  "id": null,
  "contacts": null,
  "file": {
    "mimetype": "image/jpeg",
    "filename": "filename.jpg",
    "url": "https://..."
  },
  "caption": "כיתוב"
}
```

#### שמע
```json
POST /status/voice
{
  "id": null,
  "contacts": null,
  "file": {
    "mimetype": "audio/ogg; codecs=opus",
    "url": "https://..."
  },
  "convert": true,
  "backgroundColor": "#38b42f"
}
```

#### וידאו
```json
POST /status/video
{
  "id": null,
  "contacts": null,
  "file": {
    "mimetype": "video/mp4",
    "filename": "video.mp4",
    "url": "https://..."
  },
  "convert": true,
  "caption": "כיתוב"
}
```

#### מחיקה
```json
POST /status/delete
{
  "id": null,    // ❓ איך מקבלים את ה-ID של הסטטוס למחיקה?
  "contacts": null
}
```

#### יצירת Message ID
```
GET /status/new-message-id
Response: { "id": "..." }
```

---

## 7. מערכת תור (Queue System)

### 7.1 Worker Process
- [ ] Worker שרץ ברקע
- [ ] מעבד פריט אחד בכל פעם
- [ ] Timeout של 3 דקות לכל שליחה
- [ ] Retry logic (כמה פעמים?)
- [ ] לוגים

### 7.2 הגבלות
- [ ] מקסימום סטטוסים בתור למשתמש?
- [ ] מקסימום סטטוסים ביום למשתמש?
- [ ] השהיה בין סטטוסים? (כמה שניות/דקות?)

```
❓ מה צריך להיות ההשהיה בין שליחת סטטוסים?
❓ האם יש הגבלה על כמות סטטוסים ביום?
```

---

## 8. חסימת 24 שעות

### 8.1 לוגיקה
- אחרי התחברות ראשונית → 24 שעות חסימה
- בזמן החסימה:
  - [ ] לא ניתן להעלות סטטוסים מהאתר
  - [ ] לא ניתן להעלות סטטוסים מווצאפ
  - [ ] מוצגת הודעה למשתמש עם countdown
- אדמין יכול לשחרר חסימה ידנית

### 8.2 UI
- [ ] Banner עם countdown בדשבורד
- [ ] הסבר למה יש חסימה
- [ ] כפתור "צור קשר" אם צריך שחרור מוקדם

---

## 9. אינטגרציה עם WhatsApp הרשמי (?)

```
❓ איך מגיעות ההודעות מהווצאפ הרשמי?
❓ באיזה Webhook/API?
❓ מה הפורמט?
❓ איך עונים?
❓ האם צריך להגדיר משהו ב-Meta?
```

### 9.1 זיהוי הודעות לבוט
- מספר הבוט: +972 53-923-2960
- צריך לסנן רק הודעות שנשלחו למספר הזה

### 9.2 תגובות אוטומטיות
```
❓ מה הבוט צריך לענות?
❓ איך מזהים מספר מורשה?
❓ מה קורה אם שולחים ממספר לא מורשה?
❓ איך הבוט מאשר שהסטטוס עלה?
```

---

## 10. ממשק Admin

### 10.1 Tab חדש בדף Admin
- [ ] רשימת משתמשים בשירות
- [ ] יכולת שחרור חסימת 24 שעות
- [ ] סטטיסטיקות שימוש
- [ ] לוגים

### 10.2 עדכון מחיר
- [ ] דרך ממשק "שירותים נוספים" הקיים
- [ ] מחיר ברירת מחדל: 250 ₪/חודש

---

## 11. פיצ'רים נוספים

### 11.1 שמירת איש קשר
- [ ] כפתור "שמור את הבוט לאנשי קשר"
- [ ] יוצר vCard או link ל-wa.me

### 11.2 צבעי רקע מותאמים
- [ ] בחירת צבע לסטטוסי טקסט
- [ ] Color picker או פלטת צבעים מוגדרת מראש
- [ ] שמירת צבע ברירת מחדל למשתמש?

### 11.3 היסטוריה
- [ ] רשימת סטטוסים שנשלחו
- [ ] תאריך ושעה
- [ ] סוג (טקסט/תמונה/וכו')
- [ ] סטטוס (נשלח/נכשל)

---

## 12. משימות פיתוח

### Phase 1: תשתית
- [ ] יצירת טבלאות DB
- [ ] Backend API endpoints בסיסיים
- [ ] דף נחיתה בסיסי
- [ ] אינטגרציה עם מערכת התשלומים הקיימת

### Phase 2: חיבור WhatsApp
- [ ] לוגיקת חיבור WAHA
- [ ] QR Code flow
- [ ] ניהול סשנים

### Phase 3: שליחת סטטוסים מהאתר
- [ ] טופס העלאה
- [ ] Upload קבצים
- [ ] מערכת תור
- [ ] Worker לשליחה

### Phase 4: אינטגרציה עם WhatsApp Bot (?)
- [ ] קבלת הודעות
- [ ] עיבוד הודעות
- [ ] שליחת תגובות
- [ ] סינון מספרים מורשים

### Phase 5: Admin & Polish
- [ ] ממשק Admin
- [ ] שחרור חסימות
- [ ] סטטיסטיקות
- [ ] שיפורי UI/UX

---

## 13. תשובות לשאלות

### ✅ WAHA Instance
- כמו היום באתר - סשן נפרד לכל משתמש
- Session name: `status_{randomHex}`
- API key משותף מ-env vars (WAHA_BASE_URL, WAHA_API_KEY)
- Metadata כולל user.email לזיהוי

### ✅ הגבלות
- **השהיה בין סטטוסים:** 30 שניות בין כל סטטוס בכלל המערכת
- **מקסימום סטטוסים:** אין הגבלה
- **גודל קובץ מקסימלי:** 100MB

### ✅ Status ID
- נוצר לפני השליחה עם `GET /status/new-message-id`
- Response: `{"id": "BBBBBBBBBBBBBBBBB"}`
- נשמר לכל סטטוס למחיקה עתידית ומעקב

### ✅ מעקב צפיות/תגובות
- צפיות: `message.ack` events כש-`from === 'status@broadcast'` ו-`ackLevel >= 3`
- תגובות (לבבות): `message.reaction` events כש-`from === 'status@broadcast'`
- לשמור רשימת צופים/מגיבים לכל סטטוס

---

## 14. שאלות שעדיין פתוחות

1. **Webhook ווצאפ רשמי (לבוט):**
   - איך מגיעות הקריאות מהמספר +972 53-923-2960?
   - איזה endpoint מקבל את ההודעות?
   - איך עונים למשתמש?

2. **Flow ההתכתבות עם הבוט:**
   - מה הבוט אמור לענות?
   - איך מזהים מספר מורשה?
   - מה קורה אם מספר לא מורשה שולח?

---

## 14. הערות נוספות

- הבוט עובד עם WAHA (WhatsApp HTTP API)
- צריך לוודא שיש מספיק resources בשרת ל-instances נוספים
- צריך לטפל ב-edge cases (ניתוק באמצע שליחה, timeout, וכו')
