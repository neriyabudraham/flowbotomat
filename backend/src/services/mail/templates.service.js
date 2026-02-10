/**
 * Get verification email HTML
 */
const getVerificationEmail = (code, link, lang = 'he') => {
  const isHe = lang === 'he';

  return `
    <div dir="${isHe ? 'rtl' : 'ltr'}" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #0d9488;">${isHe ? 'ברוך הבא ל-Botomat!' : 'Welcome to Botomat!'}</h1>
      <p>${isHe ? 'קוד האימות שלך:' : 'Your verification code:'}</p>
      <div style="background: #f3f4f6; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 20px 0;">
        ${code}
      </div>
      <p>${isHe ? 'או לחץ על הקישור:' : 'Or click the link:'}</p>
      <a href="${link}" style="display: inline-block; background: #0d9488; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
        ${isHe ? 'אמת את החשבון' : 'Verify Account'}
      </a>
      <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
        ${isHe ? 'הקוד תקף ל-5 דקות בלבד.' : 'Code valid for 5 minutes only.'}
      </p>
    </div>
  `;
};

/**
 * Get password reset email HTML
 */
const getPasswordResetEmail = (code, link, lang = 'he') => {
  const isHe = lang === 'he';

  return `
    <div dir="${isHe ? 'rtl' : 'ltr'}" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #0d9488;">${isHe ? 'איפוס סיסמה' : 'Password Reset'}</h1>
      <p>${isHe ? 'קוד האיפוס שלך:' : 'Your reset code:'}</p>
      <div style="background: #f3f4f6; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 20px 0;">
        ${code}
      </div>
      <a href="${link}" style="display: inline-block; background: #0d9488; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
        ${isHe ? 'אפס סיסמה' : 'Reset Password'}
      </a>
      <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
        ${isHe ? 'הקוד תקף ל-5 דקות בלבד.' : 'Code valid for 5 minutes only.'}
      </p>
    </div>
  `;
};

/**
 * Get new subscription email HTML for user
 */
const getNewSubscriptionUserEmail = (userName, planName, amount, appUrl) => {
  return `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0;">🎉 ברוך הבא!</h1>
      </div>
      <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px;">
        <p style="font-size: 18px; color: #111827;">שלום ${userName},</p>
        <p style="color: #374151;">תודה שהצטרפת ל-Botomat!</p>
        <p style="color: #374151;">המנוי שלך לתוכנית <strong style="color: #059669;">${planName}</strong> הופעל בהצלחה.</p>
        ${amount > 0 ? `<p style="color: #6b7280;">סכום: <strong>₪${amount}</strong></p>` : ''}
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb;">
          <h3 style="margin-top: 0; color: #111827;">מה עכשיו?</h3>
          <ul style="color: #374151; padding-right: 20px;">
            <li>חבר את חשבון הוואטסאפ שלך</li>
            <li>צור את הבוט הראשון שלך</li>
            <li>התחל לאוטמט את העסק שלך!</li>
          </ul>
        </div>
        <a href="${appUrl}" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold;">
          התחל עכשיו
        </a>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">צריך עזרה? אנחנו כאן בשבילך!</p>
      </div>
    </div>
  `;
};

/**
 * Get subscription renewal email HTML for user
 */
const getRenewalUserEmail = (userName, planName, amount, nextChargeDate) => {
  return `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0;">✅ המנוי חודש</h1>
      </div>
      <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px;">
        <p style="font-size: 18px; color: #111827;">שלום ${userName},</p>
        <p style="color: #374151;">תודה על האמון! המנוי שלך לתוכנית <strong style="color: #2563eb;">${planName}</strong> חודש בהצלחה.</p>
        ${amount > 0 ? `<p style="color: #6b7280;">סכום: <strong>₪${amount}</strong></p>` : ''}
        ${nextChargeDate ? `<p style="color: #6b7280;">תאריך חיוב הבא: ${new Date(nextChargeDate).toLocaleDateString('he-IL')}</p>` : ''}
        <p style="color: #374151; margin-top: 20px;">תודה שאתה חלק מהקהילה שלנו! 💜</p>
      </div>
    </div>
  `;
};

/**
 * Get subscription cancellation email HTML for user
 */
const getCancellationUserEmail = (userName, planName, expiresAt, renewUrl) => {
  return `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0;">המנוי בוטל</h1>
      </div>
      <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px;">
        <p style="font-size: 18px; color: #111827;">שלום ${userName},</p>
        <p style="color: #374151;">המנוי שלך לתוכנית <strong>${planName}</strong> בוטל.</p>
        ${expiresAt ? `<p style="color: #6b7280;">תוכל להמשיך להשתמש בשירות עד: <strong>${new Date(expiresAt).toLocaleDateString('he-IL')}</strong></p>` : ''}
        <p style="color: #374151; margin-top: 20px;">נצטער לראותך עוזב 😢</p>
        <p style="color: #374151;">אם שינית את דעתך, תמיד אפשר לחזור!</p>
        <a href="${renewUrl}" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 20px;">
          חדש את המנוי
        </a>
      </div>
    </div>
  `;
};

/**
 * Get subscription event email HTML for admin
 */
const getSubscriptionAdminEmail = (eventType, userData) => {
  const { userName, userEmail, userPhone, planName, amount, referredBy, eventDetails } = userData;
  
  const eventTitles = {
    new: '🆕 מנוי חדש!',
    renewal: '🔄 חידוש מנוי',
    cancellation: '❌ ביטול מנוי'
  };
  
  const eventColors = {
    new: '#10b981',
    renewal: '#3b82f6',
    cancellation: '#ef4444'
  };

  return `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: ${eventColors[eventType]}; padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 20px;">${eventTitles[eventType]}</h1>
      </div>
      <div style="background: #f9fafb; padding: 20px; border-radius: 0 0 12px 12px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #374151;">שם:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #111827;">${userName || '-'}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #374151;">אימייל:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #111827;">${userEmail}</td>
          </tr>
          ${userPhone ? `
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #374151;">טלפון:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #111827;">${userPhone}</td>
          </tr>
          ` : ''}
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #374151;">תוכנית:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #111827;">${planName}</td>
          </tr>
          ${amount !== undefined ? `
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #374151;">סכום:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #111827; font-weight: bold;">₪${amount}</td>
          </tr>
          ` : ''}
          ${referredBy ? `
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #374151;">הגיע דרך:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #111827;">${referredBy}</td>
          </tr>
          ` : ''}
          ${eventDetails ? `
          <tr>
            <td style="padding: 10px; font-weight: bold; color: #374151;">פרטים נוספים:</td>
            <td style="padding: 10px; color: #111827;">${eventDetails}</td>
          </tr>
          ` : ''}
        </table>
        <p style="color: #6b7280; font-size: 12px; margin-top: 20px; text-align: center;">
          ${new Date().toLocaleString('he-IL')}
        </p>
      </div>
    </div>
  `;
};

module.exports = {
  getVerificationEmail,
  getPasswordResetEmail,
  getNewSubscriptionUserEmail,
  getRenewalUserEmail,
  getCancellationUserEmail,
  getSubscriptionAdminEmail
};
