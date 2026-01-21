# FlowBotomat - PRD (Product Requirements Document)

## מסמך אפיון מוצר מלא

**שם המערכת:** FlowBotomat
**דומיין:** flow.botomat.co.il
**מיקום בשרת:** /www/wwwroot/flow.botomat.co.il
**פורט אפליקציה:** 3748
**פורט Database:** 5451

---

# חלק א': הגדרות בסיס

## 1. סקירה כללית

FlowBotomat היא מערכת SaaS ליצירת בוטים לוואטסאפ, המיועדת לאנשי אוטומציה מתחילים ומתקדמים. המערכת מאפשרת בניית בוטים ויזואלית באמצעות React Flow, עם חיבור ל-WAHA חיצוני.

## 2. עקרונות ארכיטקטורה

### 2.1 מבנה קבצים
- **חוק 20-30 שורות:** כל קובץ לא יעלה על 30 שורות (מועדף 20)
- **Atomic Design:** atoms → molecules → organisms
- **קבצים קטנים רבים:** עדיף מאות קבצים קטנים על עשרות קבצים גדולים

### 2.2 טכנולוגיות
- **Frontend:** React, Vite, Tailwind CSS, Zustand, React Flow, Lucide Icons, Axios
- **Backend:** Node.js, Express, PostgreSQL, Socket.io, JWT, Bcrypt, Nodemailer
- **Infrastructure:** Docker Compose, Nginx

### 2.3 עיצוב
- **שפה ראשית:** עברית (RTL) עם תמיכה מלאה באנגלית
- **צבע ראשי:** תורכיז כהה (Teal/Dark Cyan)
- **מצב תצוגה:** Light Mode ברירת מחדל + Dark Mode אופציונלי

---

# חלק ב': פיצ'רים מפורטים

## פיצ'ר 1: תשתית טכנית ו-Docker

### 1.1 Docker Compose
```
1.1.1 יצירת docker-compose.yml
      - שירות db: PostgreSQL 15, פורט 5451, volume לנתונים
      - שירות backend: Node.js Alpine, פורט פנימי 4000
      - שירות frontend: Vite React, פורט 3748
      - רשת פנימית משותפת: flowbotomat_network

1.1.2 יצירת backend/Dockerfile
      - FROM node:20-alpine
      - WORKDIR /app
      - COPY package*.json
      - RUN npm install
      - COPY . .
      - CMD ["npm", "run", "dev"]

1.1.3 יצירת frontend/Dockerfile
      - FROM node:20-alpine
      - WORKDIR /app
      - COPY package*.json
      - RUN npm install
      - COPY . .
      - EXPOSE 3748
      - CMD ["npm", "run", "dev"]

1.1.4 יצירת .env.example
      משתנים נדרשים:
      - DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
      - JWT_SECRET, JWT_REFRESH_SECRET
      - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
      - APP_URL, APP_PORT
      - ENCRYPTION_KEY (להצפנת API keys)

1.1.5 יצירת .gitignore
      - node_modules/
      - .env
      - dist/
      - build/
      - *.log
      - .DS_Store
```

### 1.2 מבנה תיקיות Backend
```
backend/
├── src/
│   ├── controllers/
│   │   ├── auth/
│   │   ├── flows/
│   │   ├── triggers/
│   │   ├── contacts/
│   │   ├── messages/
│   │   ├── instances/
│   │   ├── admin/
│   │   └── webhooks/
│   ├── services/
│   │   ├── auth/
│   │   ├── flows/
│   │   ├── waha/
│   │   ├── mail/
│   │   ├── encryption/
│   │   └── variables/
│   ├── middlewares/
│   ├── routes/
│   ├── models/
│   ├── utils/
│   ├── workers/
│   └── config/
├── migrations/
├── seeds/
└── tests/
```

### 1.3 מבנה תיקיות Frontend
```
frontend/
├── src/
│   ├── components/
│   │   ├── atoms/
│   │   ├── molecules/
│   │   └── organisms/
│   ├── pages/
│   ├── store/
│   ├── services/
│   ├── hooks/
│   ├── utils/
│   ├── styles/
│   └── locales/
│       ├── he.json
│       └── en.json
├── public/
└── tests/
```

### 1.4 Git Workflow
```
1.4.1 הגדרת Repository ב-GitHub
      - שם: flowbotomat
      - branch ראשי: main (production)
      - branch פיתוח: develop
      - branch בטא: beta

1.4.2 תהליך עבודה
      - פיתוח ב-develop
      - בדיקות ב-beta
      - פרסום ל-main
      - Auto-deploy מ-main לשרת

1.4.3 יצירת deploy.sh
      - git pull origin main
      - docker-compose down
      - docker-compose up -d --build
      - הודעת הצלחה/כישלון
```

---

## פיצ'ר 2: מסד נתונים - סכימה מלאה

### 2.1 טבלת users
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    role ENUM('user', 'expert', 'admin', 'superadmin') DEFAULT 'user',
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    plan_id UUID REFERENCES plans(id),
    language VARCHAR(5) DEFAULT 'he',
    theme VARCHAR(10) DEFAULT 'light',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_login_at TIMESTAMP,
    verified_at TIMESTAMP
);
```

### 2.2 טבלת verification_tokens
```sql
CREATE TABLE verification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL,
    code VARCHAR(6), -- קוד 6 ספרות
    type ENUM('email_verify', 'password_reset') NOT NULL,
    expires_at TIMESTAMP NOT NULL, -- 5 דקות מיצירה
    attempts INT DEFAULT 0, -- מקסימום 2 שליחות חוזרות
    created_at TIMESTAMP DEFAULT NOW(),
    used_at TIMESTAMP
);
```

### 2.3 טבלת permissions (הרשאות מומחה-לקוח)
```sql
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expert_id UUID REFERENCES users(id) ON DELETE CASCADE,
    client_id UUID REFERENCES users(id) ON DELETE CASCADE,
    permission_level ENUM('view', 'edit', 'manage') DEFAULT 'edit',
    granted_at TIMESTAMP DEFAULT NOW(),
    granted_by UUID REFERENCES users(id),
    UNIQUE(expert_id, client_id)
);
```

### 2.4 טבלת plans (תוכניות מנוי)
```sql
CREATE TABLE plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    name_he VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'ILS',
    billing_period ENUM('monthly', 'yearly', 'lifetime') DEFAULT 'monthly',
    
    -- מגבלות
    max_messages INT DEFAULT 100, -- הודעות לחודש
    max_flows INT DEFAULT 3, -- כמות פלואוים
    max_instances INT DEFAULT 1, -- חיבורי וואטסאפ
    max_contacts INT DEFAULT 50, -- אנשי קשר
    max_variables INT DEFAULT 10, -- משתני CRM
    max_media_mb INT DEFAULT 100, -- נפח מדיה ב-MB
    
    -- Feature Flags
    feature_flags JSONB DEFAULT '{}',
    -- {"api_node": true, "templates": true, "community_templates": false, "export": false}
    
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 2.5 טבלת usage_counters (מעקב שימוש)
```sql
CREATE TABLE usage_counters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    month_year VARCHAR(7) NOT NULL, -- "2026-01"
    
    messages_sent INT DEFAULT 0,
    messages_received INT DEFAULT 0,
    flows_created INT DEFAULT 0,
    contacts_created INT DEFAULT 0,
    media_size_mb DECIMAL(10,2) DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, month_year)
);
```

### 2.6 טבלת whatsapp_instances
```sql
CREATE TABLE whatsapp_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    
    -- הגדרות WAHA חיצוני
    waha_base_url VARCHAR(500) NOT NULL,
    waha_api_key_encrypted VARCHAR(500) NOT NULL, -- מוצפן AES-256
    waha_session_name VARCHAR(100) NOT NULL,
    
    status ENUM('disconnected', 'connecting', 'scan_qr', 'connected', 'error') DEFAULT 'disconnected',
    phone_number VARCHAR(20),
    last_status_check TIMESTAMP,
    last_error TEXT,
    
    webhook_secret VARCHAR(100), -- לאימות webhooks נכנסים
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### 2.7 טבלת flows
```sql
CREATE TABLE flows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- גרסאות
    draft_definition JSONB DEFAULT '{"nodes":[],"edges":[]}',
    live_definition JSONB,
    
    status ENUM('draft', 'published', 'disabled') DEFAULT 'draft',
    is_locked BOOLEAN DEFAULT FALSE, -- נעילה למניעת העתקה
    
    -- מטא דאטא
    last_edited_at TIMESTAMP,
    published_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### 2.8 טבלת triggers
```sql
CREATE TABLE triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id UUID REFERENCES flows(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- סוג טריגר
    trigger_type ENUM(
        -- מבוססי הודעות
        'any_message', 'exact_match', 'contains', 'not_contains',
        'starts_with', 'ends_with', 'regex', 'new_contact',
        -- מבוססי אירועים
        'tag_added', 'tag_removed', 'contact_deleted',
        'bot_resumed', 'agent_mode_started', 'agent_mode_ended'
    ) NOT NULL,
    
    pattern VARCHAR(500), -- הערך לבדיקה (מילה, regex וכו')
    tag_id UUID REFERENCES tags(id), -- לטריגרים של תגיות
    
    -- הגדרות
    cooldown_minutes INT DEFAULT 0, -- צינון בין הפעלות
    once_per_contact BOOLEAN DEFAULT FALSE, -- פעם אחת למשתמש
    exclude_days INT DEFAULT 0, -- לא להפעיל למי שדיבר בX ימים
    
    is_active BOOLEAN DEFAULT TRUE,
    priority INT DEFAULT 0, -- עדיפות (גבוה יותר = קודם)
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 2.9 טבלת contacts
```sql
CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    instance_id UUID REFERENCES whatsapp_instances(id),
    
    phone VARCHAR(20) NOT NULL,
    name VARCHAR(255),
    push_name VARCHAR(255), -- שם מוואטסאפ
    profile_pic_url TEXT,
    
    -- מצב שיחה
    current_state VARCHAR(100), -- מזהה הצומת הנוכחי
    state_data JSONB DEFAULT '{}', -- נתונים זמניים של הפלואו
    state_started_at TIMESTAMP,
    
    -- סטטוס בוט
    bot_status ENUM('active', 'paused', 'agent') DEFAULT 'active',
    bot_paused_until TIMESTAMP,
    
    -- מטא דאטא
    notes TEXT,
    first_seen_at TIMESTAMP DEFAULT NOW(),
    last_seen_at TIMESTAMP DEFAULT NOW(),
    last_message_at TIMESTAMP,
    
    UNIQUE(user_id, phone)
);
```

### 2.10 טבלת tags
```sql
CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(7) DEFAULT '#3B82F6', -- hex color
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, name)
);
```

### 2.11 טבלת contact_tags
```sql
CREATE TABLE contact_tags (
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
    tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
    added_at TIMESTAMP DEFAULT NOW(),
    added_by ENUM('manual', 'flow', 'import') DEFAULT 'manual',
    PRIMARY KEY(contact_id, tag_id)
);
```

### 2.12 טבלת custom_fields (משתני CRM)
```sql
CREATE TABLE custom_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    name VARCHAR(100) NOT NULL, -- שם תצוגה
    key VARCHAR(50) NOT NULL, -- מפתח API (snake_case)
    field_type ENUM('text', 'number', 'date', 'boolean', 'email', 'phone', 'url') DEFAULT 'text',
    default_value TEXT,
    
    is_system BOOLEAN DEFAULT FALSE, -- משתנה מערכת
    is_required BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, key)
);
```

### 2.13 טבלת contact_field_values
```sql
CREATE TABLE contact_field_values (
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
    field_id UUID REFERENCES custom_fields(id) ON DELETE CASCADE,
    value TEXT,
    updated_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY(contact_id, field_id)
);
```

### 2.14 טבלת messages
```sql
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
    instance_id UUID REFERENCES whatsapp_instances(id),
    
    waha_message_id VARCHAR(100), -- ID מ-WAHA
    
    direction ENUM('inbound', 'outbound') NOT NULL,
    source ENUM('user', 'bot', 'agent') NOT NULL,
    
    message_type ENUM('text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contact', 'list', 'button_response') DEFAULT 'text',
    
    body TEXT,
    media_url TEXT,
    media_mime_type VARCHAR(100),
    media_filename VARCHAR(255),
    
    -- מטא דאטא WAHA
    is_delivered BOOLEAN DEFAULT FALSE,
    is_read BOOLEAN DEFAULT FALSE,
    delivered_at TIMESTAMP,
    read_at TIMESTAMP,
    
    -- קשר לפלואו
    flow_id UUID REFERENCES flows(id),
    node_id VARCHAR(100),
    
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_messages_contact ON messages(contact_id);
CREATE INDEX idx_messages_created ON messages(created_at DESC);
```

### 2.15 טבלת contact_flow_history
```sql
CREATE TABLE contact_flow_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
    flow_id UUID REFERENCES flows(id) ON DELETE SET NULL,
    trigger_id UUID REFERENCES triggers(id),
    
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    exit_node_id VARCHAR(100),
    exit_reason ENUM('completed', 'timeout', 'error', 'manual_stop', 'new_trigger') DEFAULT 'completed',
    
    nodes_visited JSONB DEFAULT '[]', -- רשימת צמתים שעבר
    errors JSONB DEFAULT '[]'
);
```

### 2.16 טבלת templates
```sql
CREATE TABLE templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- יוצר
    created_by UUID REFERENCES users(id),
    template_type ENUM('system', 'community') NOT NULL,
    
    name VARCHAR(255) NOT NULL,
    name_he VARCHAR(255),
    description TEXT,
    description_he TEXT,
    category VARCHAR(100),
    
    thumbnail_url TEXT,
    flow_definition JSONB NOT NULL,
    required_variables JSONB DEFAULT '[]', -- משתנים נדרשים
    
    -- סטטיסטיקות
    install_count INT DEFAULT 0,
    rating DECIMAL(2,1) DEFAULT 0,
    
    is_active BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 2.17 טבלת error_logs
```sql
CREATE TABLE error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    flow_id UUID REFERENCES flows(id),
    node_id VARCHAR(100),
    contact_id UUID REFERENCES contacts(id),
    
    error_type VARCHAR(100) NOT NULL,
    error_message TEXT NOT NULL,
    error_stack TEXT,
    payload_snapshot JSONB,
    
    severity ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP,
    resolved_by UUID REFERENCES users(id),
    
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_error_logs_created ON error_logs(created_at DESC);
CREATE INDEX idx_error_logs_user ON error_logs(user_id);
```

### 2.18 טבלת system_settings
```sql
CREATE TABLE system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT NOW(),
    updated_by UUID REFERENCES users(id)
);

-- הגדרות ברירת מחדל
INSERT INTO system_settings (key, value, description) VALUES
('smtp', '{"host":"","port":587,"user":"","pass":"","from":""}', 'הגדרות SMTP'),
('app', '{"name":"FlowBotomat","logo_url":"","default_language":"he"}', 'הגדרות אפליקציה'),
('security', '{"session_timeout_hours":24,"max_login_attempts":5,"password_min_length":8}', 'הגדרות אבטחה'),
('backup', '{"enabled":true,"frequency":"daily","retention_days":7}', 'הגדרות גיבוי');
```

### 2.19 טבלת audit_logs (לאדמין)
```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    old_value JSONB,
    new_value JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
```

### 2.20 טבלת notifications (התראות למשתמשים)
```sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    title VARCHAR(255) NOT NULL,
    title_he VARCHAR(255),
    body TEXT NOT NULL,
    body_he TEXT,
    
    notification_type ENUM('info', 'success', 'warning', 'error', 'update') DEFAULT 'info',
    link_url TEXT,
    
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 2.21 טבלת app_versions (גרסאות מערכת)
```sql
CREATE TABLE app_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version VARCHAR(20) NOT NULL,
    
    release_notes TEXT,
    release_notes_he TEXT,
    
    is_beta BOOLEAN DEFAULT TRUE,
    is_published BOOLEAN DEFAULT FALSE,
    
    published_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 2.22 טבלת media_files
```sql
CREATE TABLE media_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255),
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    
    storage_path TEXT NOT NULL,
    public_url TEXT,
    
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## פיצ'ר 3: מערכת אימות (Authentication)

### 3.1 Backend Services

```
3.1.1 יצירת services/auth/hash.service.js
      - hashPassword(password): Promise<string>
      - verifyPassword(password, hash): Promise<boolean>
      - שימוש ב-bcrypt עם 12 rounds

3.1.2 יצירת services/auth/token.service.js
      - generateAccessToken(userId): string (תוקף 15 דקות)
      - generateRefreshToken(userId): string (תוקף 7 ימים)
      - verifyAccessToken(token): payload | null
      - verifyRefreshToken(token): payload | null

3.1.3 יצירת services/auth/verification.service.js
      - generateVerificationToken(): string (UUID)
      - generateVerificationCode(): string (6 ספרות)
      - createVerification(userId, type): {token, code}
      - validateVerification(token, code?): boolean
      - checkAttempts(userId): boolean (מקס 2)
      - markAsUsed(tokenId): void

3.1.4 יצירת services/mail/transport.service.js
      - initTransporter(): nodemailer.Transporter
      - sendMail(to, subject, html): Promise<void>
      - testConnection(): Promise<boolean>

3.1.5 יצירת services/mail/templates.service.js
      - getVerificationEmail(code, link, lang): string
      - getPasswordResetEmail(code, link, lang): string
      - getWelcomeEmail(name, lang): string
```

### 3.2 Backend Controllers

```
3.2.1 יצירת controllers/auth/signup.controller.js
      POST /api/auth/signup
      Body: { email, password, name }
      - ולידציית אימייל וסיסמה
      - בדיקה שהאימייל לא קיים
      - יצירת משתמש
      - יצירת verification token + code
      - שליחת מייל אימות
      Response: { success: true, message: "Verification email sent" }

3.2.2 יצירת controllers/auth/verify.controller.js
      POST /api/auth/verify
      Body: { token } או { code, email }
      - בדיקת תוקף (5 דקות)
      - עדכון is_verified = true
      Response: { success: true }

3.2.3 יצירת controllers/auth/resend-verification.controller.js
      POST /api/auth/resend-verification
      Body: { email }
      - בדיקת attempts < 2
      - יצירת token חדש
      - שליחת מייל
      Response: { success: true, attemptsLeft: 1 }

3.2.4 יצירת controllers/auth/login.controller.js
      POST /api/auth/login
      Body: { email, password }
      - בדיקת פרטים
      - בדיקת is_verified
      - בדיקת is_active
      - יצירת tokens
      - עדכון last_login_at
      Response: { accessToken, refreshToken, user }

3.2.5 יצירת controllers/auth/refresh.controller.js
      POST /api/auth/refresh
      Body: { refreshToken }
      - אימות refresh token
      - יצירת access token חדש
      Response: { accessToken }

3.2.6 יצירת controllers/auth/forgot-password.controller.js
      POST /api/auth/forgot-password
      Body: { email }
      - יצירת reset token
      - שליחת מייל
      Response: { success: true }

3.2.7 יצירת controllers/auth/reset-password.controller.js
      POST /api/auth/reset-password
      Body: { token, code?, newPassword }
      - בדיקת תוקף
      - עדכון סיסמה
      Response: { success: true }

3.2.8 יצירת controllers/auth/me.controller.js
      GET /api/auth/me
      Headers: Authorization: Bearer {token}
      Response: { user, plan, usage }
```

### 3.3 Middlewares

```
3.3.1 יצירת middlewares/auth.middleware.js
      - בדיקת Authorization header
      - אימות JWT
      - הוספת user ל-req
      - החזרת 401 אם לא תקין

3.3.2 יצירת middlewares/admin.middleware.js
      - בדיקה ש-role === 'admin' או 'superadmin'
      - החזרת 403 אם לא

3.3.3 יצירת middlewares/quota.middleware.js
      - בדיקת מכסות לפי תוכנית
      - החזרת 429 אם חרגו
```

### 3.4 Frontend Components

```
3.4.1 יצירת store/authStore.js
      State:
      - user: object | null
      - accessToken: string | null
      - refreshToken: string | null
      - isLoading: boolean
      - error: string | null
      
      Actions:
      - signup(email, password, name)
      - login(email, password)
      - logout()
      - refreshToken()
      - verify(token, code?)
      - forgotPassword(email)
      - resetPassword(token, code, password)
      - fetchMe()

3.4.2 יצירת components/organisms/SignupForm.jsx
      - שדות: name, email, password, confirmPassword
      - ולידציה בזמן אמת
      - כפתור הרשמה
      - לינק להתחברות

3.4.3 יצירת components/organisms/LoginForm.jsx
      - שדות: email, password
      - "שכחת סיסמה?" לינק
      - כפתור התחברות
      - לינק להרשמה

3.4.4 יצירת components/organisms/VerificationForm.jsx
      - אופציה 1: הזנת קוד 6 ספרות
      - אופציה 2: כפתור "אימתתי במייל"
      - כפתור "שלח שוב" (עם ספירה)

3.4.5 יצירת components/organisms/ForgotPasswordForm.jsx
      - שדה email
      - כפתור שליחה

3.4.6 יצירת components/organisms/ResetPasswordForm.jsx
      - שדות: קוד/token, סיסמה חדשה, אימות
      - כפתור איפוס

3.4.7 יצירת pages/auth/SignupPage.jsx
3.4.8 יצירת pages/auth/LoginPage.jsx
3.4.9 יצירת pages/auth/VerifyPage.jsx
3.4.10 יצירת pages/auth/ForgotPasswordPage.jsx
3.4.11 יצירת pages/auth/ResetPasswordPage.jsx
```

---

## פיצ'ר 4: חיבור WAHA חיצוני

### 4.1 Backend Services

```
4.1.1 יצירת services/encryption/aes.service.js
      - encrypt(text, key): string
      - decrypt(encrypted, key): string
      - שימוש ב-AES-256-CBC

4.1.2 יצירת services/waha/api.service.js
      - createSession(baseUrl, apiKey, sessionName): Promise
      - getSessionStatus(baseUrl, apiKey, sessionName): Promise
      - getQRCode(baseUrl, apiKey, sessionName): Promise<string>
      - restartSession(baseUrl, apiKey, sessionName): Promise
      - deleteSession(baseUrl, apiKey, sessionName): Promise
      
      - sendText(baseUrl, apiKey, sessionName, to, text): Promise
      - sendImage(baseUrl, apiKey, sessionName, to, url, caption?): Promise
      - sendVideo(baseUrl, apiKey, sessionName, to, url, caption?): Promise
      - sendDocument(baseUrl, apiKey, sessionName, to, url, filename): Promise
      - sendAudio(baseUrl, apiKey, sessionName, to, url): Promise
      - sendSticker(baseUrl, apiKey, sessionName, to, url): Promise
      - sendLocation(baseUrl, apiKey, sessionName, to, lat, lng, name?): Promise
      - sendContact(baseUrl, apiKey, sessionName, to, vcard): Promise
      - sendList(baseUrl, apiKey, sessionName, to, title, sections): Promise
      - setTyping(baseUrl, apiKey, sessionName, to, duration): Promise

4.1.3 יצירת services/waha/status.service.js
      - checkStatus(instance): Promise<StatusResult>
      - parseStatus(wahaResponse): NormalizedStatus
```

### 4.2 Backend Controllers

```
4.2.1 יצירת controllers/instances/create.controller.js
      POST /api/instances
      Body: { name, wahaBaseUrl, wahaApiKey, wahaSessionName }
      - הצפנת API key
      - יצירת רשומה
      - בדיקת חיבור ל-WAHA
      Response: { instance }

4.2.2 יצירת controllers/instances/list.controller.js
      GET /api/instances
      Response: { instances: [...] }

4.2.3 יצירת controllers/instances/status.controller.js
      GET /api/instances/:id/status
      - משיכת סטטוס מ-WAHA
      Response: { status, phoneNumber?, qrCode? }

4.2.4 יצירת controllers/instances/qr.controller.js
      GET /api/instances/:id/qr
      - משיכת QR מ-WAHA
      Response: { qrCode: "base64..." }

4.2.5 יצירת controllers/instances/restart.controller.js
      POST /api/instances/:id/restart
      - איפוס סשן
      Response: { success: true }

4.2.6 יצירת controllers/instances/delete.controller.js
      DELETE /api/instances/:id
      - מחיקה מ-WAHA
      - מחיקה מ-DB
      Response: { success: true }

4.2.7 יצירת controllers/instances/update.controller.js
      PUT /api/instances/:id
      Body: { name?, wahaBaseUrl?, wahaApiKey?, wahaSessionName? }
      Response: { instance }
```

### 4.3 Webhook Handler

```
4.3.1 יצירת controllers/webhooks/waha.controller.js
      POST /api/webhooks/waha/:instanceId
      - אימות webhook secret
      - ניתוב לפי סוג אירוע
      
4.3.2 יצירת services/webhooks/router.service.js
      - routeWebhook(event, payload, instance): void
      - handleMessage(message, instance): void
      - handleStatusChange(status, instance): void
      - handleMessageStatus(status, instance): void

4.3.3 יצירת middlewares/webhook-validator.middleware.js
      - בדיקת X-Webhook-Secret header
      - החזרת 401 אם לא תואם
```

### 4.4 Frontend Components

```
4.4.1 יצירת store/wahaStore.js
      State:
      - instances: []
      - selectedInstance: object | null
      - qrCode: string | null
      - isLoading: boolean
      
      Actions:
      - fetchInstances()
      - createInstance(data)
      - checkStatus(id)
      - getQRCode(id)
      - restartInstance(id)
      - deleteInstance(id)

4.4.2 יצירת components/organisms/InstanceList.jsx
4.4.3 יצירת components/molecules/InstanceCard.jsx
4.4.4 יצירת components/organisms/QRModal.jsx
4.4.5 יצירת components/molecules/StatusBadge.jsx
4.4.6 יצירת components/organisms/CreateInstanceModal.jsx
4.4.7 יצירת pages/InstancesPage.jsx
```

---

## פיצ'ר 5: מערכת משתנים (Variables)

### 5.1 משתני מערכת מובנים

```javascript
// services/variables/system.config.js
const SYSTEM_VARIABLES = {
  // תאריך ושעה
  'current_date': () => new Date().toLocaleDateString('he-IL'),
  'current_time': () => new Date().toLocaleTimeString('he-IL'),
  'current_day': () => ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'][new Date().getDay()],
  'current_day_en': () => ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()],
  
  // פרטי איש קשר
  'contact_name': (contact) => contact.name || contact.push_name || 'אורח',
  'contact_phone': (contact) => contact.phone,
  'contact_first_name': (contact) => (contact.name || contact.push_name || '').split(' ')[0],
  
  // הודעה אחרונה
  'last_message': (contact, context) => context.lastMessage?.body || '',
  
  // מטא
  'bot_name': (contact, context) => context.settings?.app?.name || 'FlowBotomat',
};
```

### 5.2 Backend Services

```
5.2.1 יצירת services/variables/parser.service.js
      - parseText(text, contact, context): string
      - findVariables(text): string[] (מוצא {{var_name}})
      - replaceVariables(text, values): string

5.2.2 יצירת services/variables/resolver.service.js
      - resolveVariable(key, contact, context): string
      - resolveSystemVariable(key, contact, context): string
      - resolveUserVariable(key, contact): string
      - resolveFallback(field): string
```

### 5.3 Backend Controllers

```
5.3.1 יצירת controllers/fields/create.controller.js
      POST /api/fields
      Body: { name, key, fieldType, defaultValue }
      Response: { field }

5.3.2 יצירת controllers/fields/list.controller.js
      GET /api/fields
      Response: { fields: [...], systemVariables: [...] }

5.3.3 יצירת controllers/fields/update.controller.js
      PUT /api/fields/:id
      Body: { name?, defaultValue? }
      Response: { field }

5.3.4 יצירת controllers/fields/delete.controller.js
      DELETE /api/fields/:id
      Response: { success: true }

5.3.5 יצירת controllers/contacts/values.controller.js
      PUT /api/contacts/:id/values
      Body: { fieldId, value }
      Response: { success: true }
      
      GET /api/contacts/:id/values
      Response: { values: [...] }
```

### 5.4 Frontend Components

```
5.4.1 יצירת store/variablesStore.js
      State:
      - fields: [] (משתני יוזר)
      - systemVariables: []
      
      Actions:
      - fetchFields()
      - createField(data)
      - updateField(id, data)
      - deleteField(id)

5.4.2 יצירת components/atoms/VariablePill.jsx
      Props: { name, type: 'system' | 'user', onClick? }
      - צבע שונה לפי סוג
      - אייקון לפי סוג משתנה

5.4.3 יצירת components/molecules/VariableDropdown.jsx
      Props: { onSelect, filter? }
      - חיפוש
      - קטגוריות (מערכת / משתמש)
      - הזרקה ל-textarea

5.4.4 יצירת components/organisms/RichTextInput.jsx
      Props: { value, onChange, placeholder }
      - תצוגת Pills בתוך הטקסט
      - כפתור הוספת משתנה
      - אינטגרציה עם VariableDropdown

5.4.5 יצירת components/organisms/FieldManager.jsx
      - רשימת כל השדות
      - יצירה/עריכה/מחיקה

5.4.6 יצירת components/molecules/AddFieldModal.jsx
      - טופס יצירת שדה
      - בחירת סוג
      - ערך ברירת מחדל

5.4.7 יצירת pages/FieldsPage.jsx
```

---

## פיצ'ר 6: מנוע טריגרים

### 6.1 Backend Services

```
6.1.1 יצירת services/triggers/matcher.service.js
      - findMatchingTrigger(message, contact, triggers): Trigger | null
      - matchExact(message, pattern): boolean
      - matchContains(message, pattern): boolean
      - matchNotContains(message, pattern): boolean
      - matchStartsWith(message, pattern): boolean
      - matchEndsWith(message, pattern): boolean
      - matchRegex(message, pattern): boolean

6.1.2 יצירת services/triggers/cooldown.service.js
      - checkCooldown(triggerId, contactId): boolean
      - setCooldown(triggerId, contactId, minutes): void
      - clearCooldown(triggerId, contactId): void

6.1.3 יצירת services/triggers/executor.service.js
      - executeTrigger(trigger, contact, message): Promise
      - checkOncePerContact(triggerId, contactId): boolean
      - checkExcludeDays(contact, days): boolean

6.1.4 יצירת services/triggers/events.service.js
      - emitTagAdded(contact, tag): void
      - emitTagRemoved(contact, tag): void
      - emitBotResumed(contact): void
      - emitAgentModeStarted(contact): void
      - emitAgentModeEnded(contact): void
      - checkEventTriggers(event, contact): Trigger[]
```

### 6.2 Backend Controllers

```
6.2.1 יצירת controllers/triggers/create.controller.js
      POST /api/triggers
      Body: { flowId, triggerType, pattern?, tagId?, cooldownMinutes?, oncePerContact?, excludeDays? }
      Response: { trigger }

6.2.2 יצירת controllers/triggers/list.controller.js
      GET /api/triggers
      Query: { flowId? }
      Response: { triggers }

6.2.3 יצירת controllers/triggers/update.controller.js
      PUT /api/triggers/:id
      Body: { ... }
      Response: { trigger }

6.2.4 יצירת controllers/triggers/delete.controller.js
      DELETE /api/triggers/:id
      Response: { success: true }

6.2.5 יצירת controllers/triggers/toggle.controller.js
      POST /api/triggers/:id/toggle
      Response: { isActive: boolean }
```

### 6.3 Frontend Components

```
6.3.1 יצירת store/triggersStore.js
6.3.2 יצירת components/organisms/TriggerManagerPage.jsx
6.3.3 יצירת components/molecules/TriggerCard.jsx
6.3.4 יצירת components/organisms/TriggerForm.jsx
6.3.5 יצירת components/molecules/TriggerTypeSelector.jsx
6.3.6 יצירת components/molecules/PatternInput.jsx
6.3.7 יצירת pages/TriggersPage.jsx
```

---

## פיצ'ר 7: Flow Builder

### 7.1 מבנה JSON של Flow

```javascript
// דוגמה למבנה flow_definition
{
  "nodes": [
    {
      "id": "node_1",
      "type": "start",
      "position": { "x": 100, "y": 100 },
      "data": {}
    },
    {
      "id": "node_2",
      "type": "multi_action",
      "position": { "x": 300, "y": 100 },
      "data": {
        "actions": [
          {
            "id": "action_1",
            "type": "send_text",
            "content": "שלום {{contact_name}}!",
            "typing_delay": 2
          },
          {
            "id": "action_2",
            "type": "wait",
            "seconds": 1
          },
          {
            "id": "action_3",
            "type": "send_image",
            "url": "https://...",
            "caption": "תמונה"
          }
        ]
      }
    },
    {
      "id": "node_3",
      "type": "condition",
      "position": { "x": 500, "y": 100 },
      "data": {
        "logic": {
          "operator": "AND",
          "rules": [
            {
              "variable": "user.age",
              "comparison": "greater_than",
              "value": "18"
            }
          ]
        }
      }
    },
    {
      "id": "node_4",
      "type": "wait_input",
      "position": { "x": 700, "y": 100 },
      "data": {
        "targetVariable": "user.email",
        "validation": "email",
        "timeoutMinutes": 30,
        "timeoutMessage": "פג תוקף ההמתנה"
      }
    }
  ],
  "edges": [
    { "id": "e1", "source": "node_1", "target": "node_2" },
    { "id": "e2", "source": "node_2", "target": "node_3" },
    { "id": "e3", "source": "node_3", "target": "node_4", "sourceHandle": "true" }
  ]
}
```

### 7.2 סוגי צמתים (Node Types)

```
1. start - צומת התחלה (חובה)
2. multi_action - צומת פעולות מרובות
3. condition - צומת תנאי (יציאות: true/false)
4. wait_input - המתנה לקלט מהמשתמש
5. api_call - קריאת API חיצוני (יציאות: success/error/timeout)
6. end - צומת סיום (אופציונלי)
```

### 7.3 סוגי פעולות (Action Types)

```
1. send_text - שליחת הודעת טקסט
   { content: string, typing_delay?: number }

2. send_image - שליחת תמונה
   { url: string, caption?: string }

3. send_video - שליחת וידאו
   { url: string, caption?: string }

4. send_document - שליחת מסמך
   { url: string, filename: string }

5. send_audio - שליחת הודעה קולית
   { url: string }

6. send_sticker - שליחת סטיקר
   { url: string }

7. send_location - שליחת מיקום
   { latitude: number, longitude: number, name?: string }

8. send_contact - שליחת איש קשר
   { name: string, phone: string }

9. send_list - שליחת רשימה
   { title: string, buttonText: string, sections: [...] }

10. wait - השהייה
    { seconds: number }

11. add_tag - הוספת תגית
    { tagId: string }

12. remove_tag - הסרת תגית
    { tagId: string }

13. set_variable - עדכון משתנה
    { variableKey: string, value: string }

14. webhook - שליחת Webhook
    { url: string, method: string, headers: object, body: string }
```

### 7.4 Backend Services

```
7.4.1 יצירת services/flows/executor.service.js
      - executeFlow(flow, contact, startNodeId?): Promise
      - executeNode(node, contact, context): Promise<NextNodeId>
      - executeAction(action, contact, context): Promise

7.4.2 יצירת services/flows/validator.service.js
      - validateFlow(definition): ValidationResult
      - checkDisconnectedNodes(nodes, edges): string[]
      - checkInfiniteLoops(nodes, edges): boolean
      - checkRequiredFields(nodes): string[]

7.4.3 יצירת services/flows/draft.service.js
      - saveDraft(flowId, definition): Promise
      - getDraft(flowId): Promise

7.4.4 יצירת services/flows/publish.service.js
      - publishFlow(flowId): Promise
      - validateBeforePublish(flowId): ValidationResult

7.4.5 יצירת services/actions/executor.service.js
      - executeAction(action, contact, context): Promise
      - (כל סוג פעולה בקובץ נפרד)

7.4.6 יצירת services/actions/text.action.js
7.4.7 יצירת services/actions/media.action.js
7.4.8 יצירת services/actions/tag.action.js
7.4.9 יצירת services/actions/variable.action.js
7.4.10 יצירת services/actions/wait.action.js
7.4.11 יצירת services/actions/webhook.action.js
```

### 7.5 Backend Controllers

```
7.5.1 יצירת controllers/flows/create.controller.js
      POST /api/flows
      Body: { name, description? }
      Response: { flow }

7.5.2 יצירת controllers/flows/list.controller.js
      GET /api/flows
      Response: { flows }

7.5.3 יצירת controllers/flows/get.controller.js
      GET /api/flows/:id
      Response: { flow }

7.5.4 יצירת controllers/flows/save-draft.controller.js
      PUT /api/flows/:id/draft
      Body: { definition }
      Response: { success: true }

7.5.5 יצירת controllers/flows/publish.controller.js
      POST /api/flows/:id/publish
      Response: { success: true, warnings?: [] }

7.5.6 יצירת controllers/flows/delete.controller.js
      DELETE /api/flows/:id
      Response: { success: true }

7.5.7 יצירת controllers/flows/duplicate.controller.js
      POST /api/flows/:id/duplicate
      Response: { flow }
```

### 7.6 Frontend Components

```
7.6.1 יצירת store/flowStore.js
      State:
      - currentFlow: object
      - nodes: []
      - edges: []
      - selectedNode: object | null
      - isDirty: boolean
      - isSaving: boolean
      
      Actions:
      - loadFlow(id)
      - addNode(type, position)
      - updateNode(id, data)
      - deleteNode(id)
      - addEdge(source, target, sourceHandle?)
      - deleteEdge(id)
      - saveDraft()
      - publish()

7.6.2 יצירת components/organisms/FlowCanvas.jsx
      - ReactFlow wrapper
      - Custom node types
      - Drag & drop from palette

7.6.3 יצירת components/molecules/BaseNode.jsx
      - עטיפה בסיסית לכל הצמתים
      - Header עם אייקון ושם
      - Handles לחיבורים

7.6.4 יצירת components/molecules/nodes/StartNode.jsx
7.6.5 יצירת components/molecules/nodes/MultiActionNode.jsx
7.6.6 יצירת components/molecules/nodes/ConditionNode.jsx
7.6.7 יצירת components/molecules/nodes/WaitInputNode.jsx
7.6.8 יצירת components/molecules/nodes/ApiCallNode.jsx
7.6.9 יצירת components/molecules/nodes/EndNode.jsx

7.6.10 יצירת components/organisms/SidebarPalette.jsx
       - רשימת סוגי צמתים לגרירה

7.6.11 יצירת components/organisms/NodeSidebar.jsx
       - עריכת הצומת הנבחר
       - תוכן דינמי לפי סוג

7.6.12 יצירת components/organisms/sidebars/MultiActionSidebar.jsx
7.6.13 יצירת components/organisms/sidebars/ConditionSidebar.jsx
7.6.14 יצירת components/organisms/sidebars/WaitInputSidebar.jsx
7.6.15 יצירת components/organisms/sidebars/ApiCallSidebar.jsx

7.6.16 יצירת components/molecules/ActionList.jsx
       - רשימת פעולות בצומת
       - Drag & drop לסידור

7.6.17 יצירת components/molecules/ActionItem.jsx
7.6.18 יצירת components/molecules/ActionEditor.jsx

7.6.19 יצירת components/organisms/FlowHeader.jsx
       - שם הפלואו
       - סטטוס שמירה
       - כפתור פרסום
       - כפתור חזרה

7.6.20 יצירת components/molecules/PublishModal.jsx
7.6.21 יצירת components/molecules/UnsavedChangesModal.jsx

7.6.22 יצירת pages/FlowBuilderPage.jsx
7.6.23 יצירת pages/FlowsListPage.jsx
```

---

## פיצ'ר 8: מנוע תנאים

### 8.1 מבנה לוגיקה

```javascript
// מבנה JSON לתנאי
{
  "operator": "AND", // או "OR"
  "rules": [
    {
      "type": "rule",
      "variable": "user.age", // או "system.current_day"
      "comparison": "greater_than",
      "value": "18"
    },
    {
      "type": "group",
      "operator": "OR",
      "rules": [
        {
          "type": "rule",
          "variable": "contact.tags",
          "comparison": "contains",
          "value": "vip"
        },
        {
          "type": "rule",
          "variable": "user.purchases",
          "comparison": "greater_than",
          "value": "5"
        }
      ]
    }
  ]
}
```

### 8.2 סוגי השוואות

```
// טקסט
equals - שווה בדיוק
not_equals - לא שווה
contains - מכיל
not_contains - לא מכיל
starts_with - מתחיל ב
ends_with - נגמר ב
is_empty - ריק
is_not_empty - לא ריק
matches_regex - תואם regex

// מספרים
equals - שווה
not_equals - לא שווה
greater_than - גדול מ
less_than - קטן מ
greater_or_equal - גדול או שווה
less_or_equal - קטן או שווה
between - בין

// תאריכים
date_equals - שווה
date_before - לפני
date_after - אחרי
date_between - בין

// תגיות
has_tag - יש תגית
not_has_tag - אין תגית

// בוליאני
is_true - אמת
is_false - שקר
```

### 8.3 Backend Services

```
8.3.1 יצירת services/logic/evaluator.service.js
      - evaluate(logic, contact, context): boolean
      - evaluateGroup(group, contact, context): boolean
      - evaluateRule(rule, contact, context): boolean

8.3.2 יצירת services/logic/comparisons.service.js
      - compare(value1, comparison, value2, type): boolean
      - (פונקציה לכל סוג השוואה)

8.3.3 יצירת services/logic/resolver.service.js
      - resolveValue(variable, contact, context): any
```

### 8.4 Frontend Components

```
8.4.1 יצירת store/logicStore.js
      - ניהול עריכת לוגיקה ב-sidebar

8.4.2 יצירת components/organisms/ConditionBuilder.jsx
8.4.3 יצירת components/molecules/ConditionGroup.jsx
8.4.4 יצירת components/molecules/ConditionRule.jsx
8.4.5 יצירת components/atoms/OperatorSelector.jsx
8.4.6 יצירת components/atoms/ComparisonSelector.jsx
8.4.7 יצירת components/atoms/LogicToggle.jsx (AND/OR)
```

---

## פיצ'ר 9: ניהול State והמתנה לקלט

### 9.1 Backend Services

```
9.1.1 יצירת services/state/manager.service.js
      - setState(contactId, nodeId, data): void
      - getState(contactId): { nodeId, data } | null
      - clearState(contactId): void

9.1.2 יצירת services/state/timeout.worker.js
      - Cron job כל דקה
      - בדיקת contacts עם state שפג תוקפו
      - ביצוע פעולת timeout

9.1.3 יצירת services/validation/input.service.js
      - validate(input, type): { valid: boolean, error?: string }
      - validateEmail(input): boolean
      - validatePhone(input): boolean
      - validateNumber(input): boolean
      - validateDate(input): boolean
```

### 9.2 Backend Controllers

```
9.2.1 יצירת controllers/state/reset.controller.js
      POST /api/contacts/:id/reset-state
      Response: { success: true }
```

---

## פיצ'ר 10: לייב צ'אט

### 10.1 Backend - Socket.io

```
10.1.1 יצירת services/socket/manager.service.js
       - initSocket(server): void
       - joinRoom(userId, socketId): void
       - emitToUser(userId, event, data): void
       - emitNewMessage(userId, message): void
       - emitTyping(userId, contactId, isTyping): void

10.1.2 יצירת services/socket/events.service.js
       - handleConnection(socket): void
       - handleJoinRoom(socket, userId): void
       - handleSendMessage(socket, data): void
       - handleTyping(socket, data): void
```

### 10.2 Backend Controllers

```
10.2.1 יצירת controllers/chat/history.controller.js
       GET /api/chat/:contactId/messages
       Query: { page, limit }
       Response: { messages, hasMore }

10.2.2 יצירת controllers/chat/send.controller.js
       POST /api/chat/:contactId/send
       Body: { type, content, mediaUrl? }
       - עדכון bot_paused_until (+30 דקות)
       Response: { message }

10.2.3 יצירת controllers/chat/contacts.controller.js
       GET /api/chat/contacts
       Query: { search?, page, limit }
       Response: { contacts }

10.2.4 יצירת controllers/chat/pause.controller.js
       POST /api/contacts/:id/pause
       Body: { minutes? }
       Response: { botPausedUntil }

10.2.5 יצירת controllers/chat/resume.controller.js
       POST /api/contacts/:id/resume
       Response: { success: true }
```

### 10.3 Frontend Components

```
10.3.1 יצירת store/chatStore.js
10.3.2 יצירת services/socket.service.js
10.3.3 יצירת components/organisms/ChatLayout.jsx
10.3.4 יצירת components/organisms/ChatContactList.jsx
10.3.5 יצירת components/molecules/ChatContactItem.jsx
10.3.6 יצירת components/organisms/ChatWindow.jsx
10.3.7 יצירת components/molecules/MessageBubble.jsx
10.3.8 יצירת components/molecules/ChatInput.jsx
10.3.9 יצירת components/atoms/TypingIndicator.jsx
10.3.10 יצירת components/atoms/PauseStatusBadge.jsx
10.3.11 יצירת components/molecules/ChatHeader.jsx
10.3.12 יצירת pages/ChatPage.jsx
```

---

## פיצ'ר 11: ניהול אנשי קשר

(כבר מפורט בפיצ'ר 18 שנוסף קודם - יש לו 70+ משימות)

---

## פיצ'ר 12: ניהול תגיות

### 12.1 Backend Controllers

```
12.1.1 יצירת controllers/tags/create.controller.js
       POST /api/tags
       Body: { name, color, description? }
       Response: { tag }

12.1.2 יצירת controllers/tags/list.controller.js
       GET /api/tags
       Response: { tags }

12.1.3 יצירת controllers/tags/update.controller.js
       PUT /api/tags/:id
       Response: { tag }

12.1.4 יצירת controllers/tags/delete.controller.js
       DELETE /api/tags/:id
       Response: { success: true }

12.1.5 יצירת controllers/tags/contacts.controller.js
       GET /api/tags/:id/contacts
       Response: { contacts }
```

### 12.2 Frontend Components

```
12.2.1 יצירת store/tagsStore.js
12.2.2 יצירת pages/TagsPage.jsx
12.2.3 יצירת components/organisms/TagsGrid.jsx
12.2.4 יצירת components/molecules/TagCard.jsx
12.2.5 יצירת components/molecules/CreateTagModal.jsx
12.2.6 יצירת components/atoms/ColorPicker.jsx
12.2.7 יצירת components/molecules/TagSelector.jsx
```

---

## פיצ'ר 13: תבניות (Templates)

### 13.1 Backend Controllers

```
13.1.1 יצירת controllers/templates/list.controller.js
       GET /api/templates
       Query: { type?: 'system' | 'community', category? }
       Response: { templates }

13.1.2 יצירת controllers/templates/get.controller.js
       GET /api/templates/:id
       Response: { template }

13.1.3 יצירת controllers/templates/create.controller.js (community)
       POST /api/templates
       Body: { name, description, flowId, category }
       Response: { template }

13.1.4 יצירת controllers/templates/install.controller.js
       POST /api/templates/:id/install
       Response: { flow }

13.1.5 יצירת controllers/admin/templates/create.controller.js (system)
       POST /api/admin/templates
       Response: { template }

13.1.6 יצירת controllers/admin/templates/update.controller.js
13.1.7 יצירת controllers/admin/templates/delete.controller.js
```

### 13.2 Frontend Components

```
13.2.1 יצירת store/templatesStore.js
13.2.2 יצירת pages/TemplatesPage.jsx
13.2.3 יצירת components/organisms/TemplateGallery.jsx
13.2.4 יצירת components/molecules/TemplateCard.jsx
13.2.5 יצירת components/organisms/TemplatePreviewModal.jsx
13.2.6 יצירת components/molecules/CategoryFilter.jsx
13.2.7 יצירת components/organisms/CreateTemplateModal.jsx
```

---

## פיצ'ר 14: צומת API

### 14.1 מבנה הצומת

```javascript
{
  "id": "api_node_1",
  "type": "api_call",
  "data": {
    "name": "בדיקת מלאי",
    "url": "https://api.example.com/stock",
    "method": "POST",
    "headers": [
      { "key": "Content-Type", "value": "application/json" },
      { "key": "Authorization", "value": "Bearer {{user.api_key}}" }
    ],
    "body": "{\"product_id\": \"{{user.product_id}}\"}",
    "timeout_seconds": 30,
    "retry_count": 2,
    "mapping": [
      { "path": "data.stock", "variable": "user.stock_count" },
      { "path": "data.price", "variable": "user.price" }
    ]
  }
}
```

### 14.2 Backend Services

```
14.2.1 יצירת services/api/executor.service.js
       - executeApiCall(config, contact, context): Promise<ApiResult>
       - buildUrl(url, variables): string
       - buildHeaders(headers, variables): object
       - buildBody(body, variables): string

14.2.2 יצירת services/api/mapping.service.js
       - extractValues(response, mappings): object
       - getValueByPath(obj, path): any (JSONPath)

14.2.3 יצירת services/api/retry.service.js
       - executeWithRetry(fn, retries, delay): Promise
```

### 14.3 Frontend Components

```
14.3.1 יצירת components/organisms/sidebars/ApiCallSidebar.jsx
14.3.2 יצירת components/molecules/HeadersEditor.jsx
14.3.3 יצירת components/molecules/BodyEditor.jsx
14.3.4 יצירת components/molecules/MappingTable.jsx
14.3.5 יצירת components/organisms/ApiTestModal.jsx
14.3.6 יצירת components/atoms/JsonViewer.jsx
```

---

## פיצ'ר 15: מערכת מנויים ומכסות

### 15.1 Backend Services

```
15.1.1 יצירת services/usage/counter.service.js
       - increment(userId, type, amount?): void
       - getUsage(userId, month?): UsageData
       - checkQuota(userId, type): { allowed: boolean, remaining: number }

15.1.2 יצירת services/usage/reset.worker.js
       - Cron job ב-1 לחודש
       - איפוס מונים

15.1.3 יצירת middlewares/quota.middleware.js
       - בדיקת מכסה לפני פעולות
```

### 15.2 Backend Controllers

```
15.2.1 יצירת controllers/usage/status.controller.js
       GET /api/usage
       Response: { plan, usage, limits }

15.2.2 יצירת controllers/usage/history.controller.js
       GET /api/usage/history
       Query: { months? }
       Response: { history: [...] }
```

### 15.3 Frontend Components

```
15.3.1 יצירת store/usageStore.js
15.3.2 יצירת components/atoms/UsageProgressBar.jsx
15.3.3 יצירת components/molecules/UsageCard.jsx
15.3.4 יצירת components/organisms/UsageDashboard.jsx
15.3.5 יצירת components/molecules/LimitReachedModal.jsx
15.3.6 יצירת components/atoms/FeatureGuard.jsx
```

---

## פיצ'ר 16: ניטור ולוגים

### 16.1 Backend Services

```
16.1.1 יצירת services/logging/error.service.js
       - logError(error, context): void
       - getErrors(filters): Error[]

16.1.2 יצירת services/health/check.service.js
       - checkDatabase(): boolean
       - checkWaha(instances): object[]
       - checkSmtp(): boolean
```

### 16.2 Backend Controllers

```
16.2.1 יצירת controllers/logs/list.controller.js
       GET /api/logs
       Query: { type?, severity?, from?, to?, page }
       Response: { logs, total }

16.2.2 יצירת controllers/logs/detail.controller.js
       GET /api/logs/:id
       Response: { log }

16.2.3 יצירת controllers/health/status.controller.js
       GET /api/health
       Response: { db: boolean, waha: [...], smtp: boolean }
```

### 16.3 Frontend Components

```
16.3.1 יצירת store/logsStore.js
16.3.2 יצירת pages/LogsPage.jsx
16.3.3 יצירת components/organisms/LogsTable.jsx
16.3.4 יצירת components/molecules/LogRow.jsx
16.3.5 יצירת components/organisms/LogDetailModal.jsx
16.3.6 יצירת components/molecules/HealthStatusWidget.jsx
```

---

## פיצ'ר 17: ממשק אדמין

(כבר מפורט בפיצ'ר 17 שנוסף קודם - יש לו 45+ משימות)

---

## פיצ'ר 18: ניהול אנשי קשר

(כבר מפורט - יש לו 70+ משימות)

---

## פיצ'ר 19: דשבורד משתמש

### 19.1 Backend Controllers

```
19.1.1 יצירת controllers/dashboard/stats.controller.js
       GET /api/dashboard/stats
       Response: {
         totalContacts,
         newContactsToday,
         messagesToday,
         activeFlows,
         instanceStatus
       }

19.1.2 יצירת controllers/dashboard/activity.controller.js
       GET /api/dashboard/activity
       Query: { days? }
       Response: { activity: [...] }
```

### 19.2 Frontend Components

```
19.2.1 יצירת store/dashboardStore.js
19.2.2 יצירת pages/DashboardPage.jsx
19.2.3 יצירת components/organisms/DashboardHeader.jsx
19.2.4 יצירת components/molecules/StatCard.jsx
19.2.5 יצירת components/molecules/InstanceStatusCard.jsx
19.2.6 יצירת components/molecules/RecentActivityList.jsx
19.2.7 יצירת components/molecules/QuickActions.jsx
19.2.8 יצירת components/organisms/ActivityChart.jsx
```

---

## פיצ'ר 20: הגדרות משתמש

### 20.1 Backend Controllers

```
20.1.1 יצירת controllers/settings/profile.controller.js
       GET /api/settings/profile
       PUT /api/settings/profile
       Body: { name?, language?, theme? }

20.1.2 יצירת controllers/settings/password.controller.js
       PUT /api/settings/password
       Body: { currentPassword, newPassword }

20.1.3 יצירת controllers/settings/notifications.controller.js
       GET /api/settings/notifications
       PUT /api/settings/notifications
       Body: { emailNotifications?, ... }
```

### 20.2 Frontend Components

```
20.2.1 יצירת pages/SettingsPage.jsx
20.2.2 יצירת components/organisms/ProfileSettings.jsx
20.2.3 יצירת components/organisms/SecuritySettings.jsx
20.2.4 יצירת components/organisms/NotificationSettings.jsx
20.2.5 יצירת components/molecules/LanguageSelector.jsx
20.2.6 יצירת components/molecules/ThemeSelector.jsx
```

---

## פיצ'ר 21: מערכת גרסאות ועדכונים

### 21.1 Backend Controllers (Admin)

```
21.1.1 יצירת controllers/admin/versions/create.controller.js
       POST /api/admin/versions
       Body: { version, releaseNotes, releaseNotesHe }
       Response: { version }

21.1.2 יצירת controllers/admin/versions/publish.controller.js
       POST /api/admin/versions/:id/publish
       - שינוי is_published = true
       - שליחת התראות למשתמשים
       Response: { success: true }

21.1.3 יצירת controllers/admin/versions/list.controller.js
       GET /api/admin/versions
       Response: { versions }
```

### 21.2 Frontend Components (Admin)

```
21.2.1 יצירת pages/admin/VersionsPage.jsx
21.2.2 יצירת components/organisms/VersionsList.jsx
21.2.3 יצירת components/molecules/VersionCard.jsx
21.2.4 יצירת components/organisms/CreateVersionModal.jsx
21.2.5 יצירת components/organisms/PublishVersionModal.jsx
```

---

## פיצ'ר 22: גיבויים אוטומטיים

### 22.1 Backend Services

```
22.1.1 יצירת services/backup/database.service.js
       - createBackup(): Promise<string> (filepath)
       - restoreBackup(filepath): Promise<void>
       - listBackups(): string[]
       - deleteOldBackups(retentionDays): void

22.1.2 יצירת workers/backup.worker.js
       - Cron job יומי
       - יצירת גיבוי
       - מחיקת גיבויים ישנים
```

### 22.2 Backend Controllers (Admin)

```
22.2.1 יצירת controllers/admin/backups/list.controller.js
       GET /api/admin/backups
       Response: { backups: [...] }

22.2.2 יצירת controllers/admin/backups/create.controller.js
       POST /api/admin/backups
       Response: { backup }

22.2.3 יצירת controllers/admin/backups/restore.controller.js
       POST /api/admin/backups/:id/restore
       Response: { success: true }

22.2.4 יצירת controllers/admin/backups/download.controller.js
       GET /api/admin/backups/:id/download
       Response: File
```

### 22.3 Frontend Components (Admin)

```
22.3.1 יצירת pages/admin/BackupsPage.jsx
22.3.2 יצירת components/organisms/BackupsList.jsx
22.3.3 יצירת components/molecules/BackupRow.jsx
22.3.4 יצירת components/molecules/RestoreConfirmModal.jsx
```

---

# חלק ג': רשימת API Endpoints

## Authentication
```
POST   /api/auth/signup
POST   /api/auth/verify
POST   /api/auth/resend-verification
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/forgot-password
POST   /api/auth/reset-password
GET    /api/auth/me
```

## Instances (WAHA)
```
GET    /api/instances
POST   /api/instances
GET    /api/instances/:id
PUT    /api/instances/:id
DELETE /api/instances/:id
GET    /api/instances/:id/status
GET    /api/instances/:id/qr
POST   /api/instances/:id/restart
```

## Flows
```
GET    /api/flows
POST   /api/flows
GET    /api/flows/:id
PUT    /api/flows/:id/draft
POST   /api/flows/:id/publish
DELETE /api/flows/:id
POST   /api/flows/:id/duplicate
```

## Triggers
```
GET    /api/triggers
POST   /api/triggers
GET    /api/triggers/:id
PUT    /api/triggers/:id
DELETE /api/triggers/:id
POST   /api/triggers/:id/toggle
```

## Contacts
```
GET    /api/contacts
POST   /api/contacts
GET    /api/contacts/:id
PUT    /api/contacts/:id
DELETE /api/contacts/:id
GET    /api/contacts/:id/values
PUT    /api/contacts/:id/values
GET    /api/contacts/:id/messages
GET    /api/contacts/:id/flow-history
POST   /api/contacts/:id/reset-state
POST   /api/contacts/:id/pause
POST   /api/contacts/:id/resume
POST   /api/contacts/import
POST   /api/contacts/export
POST   /api/contacts/bulk
```

## Tags
```
GET    /api/tags
POST   /api/tags
GET    /api/tags/:id
PUT    /api/tags/:id
DELETE /api/tags/:id
GET    /api/tags/:id/contacts
```

## Custom Fields
```
GET    /api/fields
POST   /api/fields
PUT    /api/fields/:id
DELETE /api/fields/:id
```

## Chat
```
GET    /api/chat/contacts
GET    /api/chat/:contactId/messages
POST   /api/chat/:contactId/send
```

## Templates
```
GET    /api/templates
GET    /api/templates/:id
POST   /api/templates
POST   /api/templates/:id/install
```

## Dashboard & Usage
```
GET    /api/dashboard/stats
GET    /api/dashboard/activity
GET    /api/usage
GET    /api/usage/history
```

## Settings
```
GET    /api/settings/profile
PUT    /api/settings/profile
PUT    /api/settings/password
GET    /api/settings/notifications
PUT    /api/settings/notifications
```

## Logs
```
GET    /api/logs
GET    /api/logs/:id
GET    /api/health
```

## Webhooks
```
POST   /api/webhooks/waha/:instanceId
```

## Admin
```
GET    /api/admin/users
GET    /api/admin/users/:id
PUT    /api/admin/users/:id
DELETE /api/admin/users/:id
POST   /api/admin/users/:id/impersonate

GET    /api/admin/plans
POST   /api/admin/plans
PUT    /api/admin/plans/:id
DELETE /api/admin/plans/:id

GET    /api/admin/settings
PUT    /api/admin/settings

GET    /api/admin/stats/overview
GET    /api/admin/stats/growth
GET    /api/admin/stats/usage

GET    /api/admin/logs/system
GET    /api/admin/logs/audit
GET    /api/admin/logs/webhooks

GET    /api/admin/templates
POST   /api/admin/templates
PUT    /api/admin/templates/:id
DELETE /api/admin/templates/:id

GET    /api/admin/versions
POST   /api/admin/versions
POST   /api/admin/versions/:id/publish

GET    /api/admin/backups
POST   /api/admin/backups
POST   /api/admin/backups/:id/restore
GET    /api/admin/backups/:id/download
```

---

# חלק ד': סיכום משימות

## סה"כ משימות לפי קטגוריה:

| קטגוריה | משימות |
|---------|--------|
| תשתית ו-Docker | ~25 |
| מסד נתונים | ~22 טבלאות |
| אימות (Auth) | ~30 |
| WAHA | ~25 |
| משתנים | ~20 |
| טריגרים | ~20 |
| Flow Builder | ~40 |
| תנאים | ~15 |
| State | ~10 |
| לייב צ'אט | ~20 |
| אנשי קשר | ~70 |
| תגיות | ~15 |
| תבניות | ~20 |
| API Node | ~15 |
| מנויים | ~15 |
| לוגים | ~15 |
| אדמין | ~45 |
| דשבורד | ~15 |
| הגדרות | ~15 |
| גרסאות | ~10 |
| גיבויים | ~10 |
| **סה"כ** | **~450+** |

---

# חלק ה': סדר ביצוע מומלץ

## שלב 1: תשתית (1-2 שבועות)
1. Docker Compose + מבנה תיקיות
2. מסד נתונים - כל הטבלאות
3. Git workflow

## שלב 2: אימות ומשתמשים (1 שבוע)
1. Backend auth services
2. Frontend auth pages
3. Middleware

## שלב 3: WAHA וחיבור (1 שבוע)
1. WAHA API service
2. Instance management
3. Webhook handler

## שלב 4: Core Features (2-3 שבועות)
1. משתנים
2. טריגרים
3. Flow Builder בסיסי

## שלב 5: Flow Builder מתקדם (2 שבועות)
1. כל סוגי הצמתים
2. מנוע תנאים
3. State management

## שלב 6: לייב צ'אט ואנשי קשר (1-2 שבועות)
1. Socket.io
2. Chat interface
3. Contacts management

## שלב 7: Admin Panel (1 שבוע)
1. Users management
2. Plans management
3. Settings

## שלב 8: Finishing (1 שבוע)
1. Templates
2. Dashboard
3. Logs & Monitoring
4. Backups

---

**סה"כ זמן משוער: 10-14 שבועות עבודה**

