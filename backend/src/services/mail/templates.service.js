const {
  wrapInLayout, ctaButton, infoCard, dataTable, alertBox,
  paragraph, greeting, COLORS, APP_URL, FRONTEND_URL,
} = require('./emailLayout.service');

/**
 * Get verification email HTML
 */
const getVerificationEmail = (code, link, lang = 'he') => {
  const isHe = lang === 'he';

  const content = `
    ${greeting(isHe ? '' : '')}
    ${paragraph(isHe ? 'תודה שנרשמת ל-Botomat! כדי להפעיל את החשבון שלך, הזן את קוד האימות:' : 'Thanks for signing up! Enter the verification code below to activate your account:')}

    <div style="background:${COLORS.bgLight};border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
      <div style="font-size:36px;font-weight:700;letter-spacing:10px;color:${COLORS.primary};font-family:monospace;">
        ${code}
      </div>
    </div>

    ${paragraph(isHe ? 'או לחץ על הכפתור:' : 'Or click the button:')}
    ${ctaButton(isHe ? 'אמת את החשבון' : 'Verify Account', link)}

    ${alertBox(isHe ? 'הקוד תקף ל-5 דקות בלבד.' : 'Code valid for 5 minutes only.', 'info')}
  `;

  return wrapInLayout({
    content,
    headerTitle: isHe ? 'אימות חשבון' : 'Account Verification',
    headerIcon: '🔐',
    headerColor: COLORS.primary,
    headerColorEnd: COLORS.primaryDark,
    preheader: isHe ? `קוד האימות שלך: ${code}` : `Your verification code: ${code}`,
    showUnsubscribe: false,
  });
};

/**
 * Get password reset email HTML
 */
const getPasswordResetEmail = (code, link, lang = 'he') => {
  const isHe = lang === 'he';

  const content = `
    ${greeting(isHe ? '' : '')}
    ${paragraph(isHe ? 'קיבלנו בקשה לאיפוס הסיסמה שלך. הנה קוד האיפוס:' : 'We received a request to reset your password. Here\'s your reset code:')}

    <div style="background:${COLORS.bgLight};border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
      <div style="font-size:36px;font-weight:700;letter-spacing:10px;color:${COLORS.primary};font-family:monospace;">
        ${code}
      </div>
    </div>

    ${paragraph(isHe ? 'או לחץ על הכפתור:' : 'Or click the button:')}
    ${ctaButton(isHe ? 'אפס סיסמה' : 'Reset Password', link)}

    ${alertBox(isHe ? 'הקוד תקף ל-5 דקות בלבד. אם לא ביקשת איפוס סיסמה, התעלם מהודעה זו.' : 'Code valid for 5 minutes only. If you did not request a password reset, ignore this email.', 'info')}
  `;

  return wrapInLayout({
    content,
    headerTitle: isHe ? 'איפוס סיסמה' : 'Password Reset',
    headerIcon: '🔑',
    headerColor: '#6366f1',
    headerColorEnd: '#4f46e5',
    preheader: isHe ? `קוד האיפוס שלך: ${code}` : `Your reset code: ${code}`,
    showUnsubscribe: false,
  });
};

/**
 * Get new subscription email HTML for user
 */
const getNewSubscriptionUserEmail = (userName, planName, amount, appUrl) => {
  const content = `
    ${greeting(userName)}
    ${paragraph('תודה שהצטרפת ל-Botomat! המנוי שלך הופעל בהצלחה ואנחנו שמחים שאתה חלק מהקהילה שלנו.')}

    ${dataTable([
      ['תוכנית:', planName, true],
      ...(amount > 0 ? [['סכום:', `₪${amount}`]] : []),
    ])}

    ${infoCard(`
      <h3 style="margin:0 0 12px;color:${COLORS.textDark};font-size:16px;">מה עכשיו?</h3>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:6px 0;color:${COLORS.textMedium};font-size:14px;">
            <span style="color:${COLORS.primary};margin-left:8px;">①</span> חבר את חשבון הוואטסאפ שלך
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:${COLORS.textMedium};font-size:14px;">
            <span style="color:${COLORS.primary};margin-left:8px;">②</span> צור את הבוט הראשון שלך
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:${COLORS.textMedium};font-size:14px;">
            <span style="color:${COLORS.primary};margin-left:8px;">③</span> התחל לאוטמט את העסק שלך!
          </td>
        </tr>
      </table>
    `)}

    ${ctaButton('התחל עכשיו', appUrl || APP_URL, COLORS.primary, COLORS.primaryDark)}

    ${paragraph('צריך עזרה? אנחנו כאן בשבילך!', { color: COLORS.textLight, size: '13' })}
  `;

  return wrapInLayout({
    content,
    headerTitle: 'ברוך הבא!',
    headerIcon: '🎉',
    headerColor: '#10b981',
    headerColorEnd: COLORS.success,
    preheader: `ברוך הבא ל-Botomat! המנוי שלך לתוכנית ${planName} הופעל`,
  });
};

/**
 * Get subscription renewal email HTML for user
 */
const getRenewalUserEmail = (userName, planName, amount, nextChargeDate) => {
  const rows = [
    ['תוכנית:', planName, true],
  ];
  if (amount > 0) rows.push(['סכום:', `₪${amount}`]);
  if (nextChargeDate) rows.push(['חיוב הבא:', new Date(nextChargeDate).toLocaleDateString('he-IL')]);

  const content = `
    ${greeting(userName)}
    ${paragraph(`המנוי שלך לתוכנית <strong style="color:${COLORS.info};">${planName}</strong> חודש בהצלחה. תודה על האמון!`)}

    ${dataTable(rows)}

    ${paragraph('תודה שאתה חלק מהקהילה שלנו! 💜', { marginTop: '16px' })}
  `;

  return wrapInLayout({
    content,
    headerTitle: 'המנוי חודש בהצלחה',
    headerIcon: '✅',
    headerColor: '#3b82f6',
    headerColorEnd: '#2563eb',
    preheader: `המנוי שלך חודש - תוכנית ${planName}`,
  });
};

/**
 * Get subscription cancellation email HTML for user
 */
const getCancellationUserEmail = (userName, planName, expiresAt, renewUrl) => {
  const content = `
    ${greeting(userName)}
    ${paragraph(`המנוי שלך לתוכנית <strong>${planName}</strong> בוטל.`)}

    ${expiresAt ? alertBox(`תוכל להמשיך להשתמש בשירות עד: <strong>${new Date(expiresAt).toLocaleDateString('he-IL')}</strong>`, 'warning') : ''}

    ${paragraph('נצטער לראותך עוזב 😢<br>אם שינית את דעתך, תמיד אפשר לחזור!')}

    ${ctaButton('חדש את המנוי', renewUrl || `${FRONTEND_URL}/pricing`, '#10b981', COLORS.success)}
  `;

  return wrapInLayout({
    content,
    headerTitle: 'המנוי בוטל',
    headerColor: '#f59e0b',
    headerColorEnd: '#d97706',
    preheader: `המנוי שלך לתוכנית ${planName} בוטל`,
  });
};

/**
 * Get subscription event email HTML for admin
 */
const getSubscriptionAdminEmail = (eventType, userData) => {
  const { userName, userEmail, userPhone, planName, amount, referredBy, eventDetails } = userData;

  const eventConfig = {
    new: { title: '🆕 מנוי חדש!', color: '#10b981', colorEnd: COLORS.success },
    renewal: { title: '🔄 חידוש מנוי', color: '#3b82f6', colorEnd: '#2563eb' },
    cancellation: { title: '❌ ביטול מנוי', color: '#ef4444', colorEnd: '#dc2626' },
  };

  const config = eventConfig[eventType] || eventConfig.new;

  const rows = [
    ['שם:', userName || '-'],
    ['אימייל:', userEmail],
  ];
  if (userPhone) rows.push(['טלפון:', userPhone]);
  rows.push(['תוכנית:', planName, true]);
  if (amount !== undefined) rows.push(['סכום:', `₪${amount}`]);
  if (referredBy) rows.push(['הגיע דרך:', referredBy]);
  if (eventDetails) rows.push(['פרטים:', eventDetails]);

  const content = `
    ${dataTable(rows)}
    <p style="color:${COLORS.textMuted};font-size:12px;text-align:center;margin-top:20px;">
      ${new Date().toLocaleString('he-IL')}
    </p>
  `;

  return wrapInLayout({
    content,
    headerTitle: config.title,
    headerColor: config.color,
    headerColorEnd: config.colorEnd,
    showUnsubscribe: false,
  });
};

module.exports = {
  getVerificationEmail,
  getPasswordResetEmail,
  getNewSubscriptionUserEmail,
  getRenewalUserEmail,
  getCancellationUserEmail,
  getSubscriptionAdminEmail,
};
