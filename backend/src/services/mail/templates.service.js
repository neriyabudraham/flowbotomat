/**
 * Get verification email HTML
 */
const getVerificationEmail = (code, link, lang = 'he') => {
  const isHe = lang === 'he';

  return `
    <div dir="${isHe ? 'rtl' : 'ltr'}" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #0d9488;">${isHe ? 'ברוך הבא ל-FlowBotomat!' : 'Welcome to FlowBotomat!'}</h1>
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

module.exports = {
  getVerificationEmail,
  getPasswordResetEmail,
};
