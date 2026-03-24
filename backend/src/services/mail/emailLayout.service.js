/**
 * Shared email layout for all Botomat emails
 * Professional design with branded header, consistent styling, and RTL support
 */

const APP_URL = process.env.APP_URL || 'https://botomat.co.il';
const FRONTEND_URL = process.env.FRONTEND_URL || APP_URL;

// Brand colors matching the frontend design system
const COLORS = {
  primary: '#0d9488',       // Teal - main brand
  primaryDark: '#0f766e',
  primaryLight: '#ccfbf1',
  success: '#059669',
  successLight: '#ecfdf5',
  warning: '#d97706',
  warningLight: '#fef3c7',
  error: '#dc2626',
  errorLight: '#fef2f2',
  info: '#2563eb',
  infoLight: '#eff6ff',
  purple: '#7c3aed',
  purpleLight: '#f5f3ff',
  textDark: '#111827',
  textMedium: '#374151',
  textLight: '#6b7280',
  textMuted: '#9ca3af',
  border: '#e5e7eb',
  bgLight: '#f9fafb',
  bgWhite: '#ffffff',
};

/**
 * Wrap email content in the standard Botomat layout
 * @param {object} options
 * @param {string} options.content - Main email content HTML
 * @param {string} [options.headerTitle] - Header title text (shown on banner)
 * @param {string} [options.headerSubtitle] - Header subtitle text
 * @param {string} [options.headerColor] - Header gradient start color
 * @param {string} [options.headerColorEnd] - Header gradient end color
 * @param {string} [options.headerIcon] - Emoji icon for header
 * @param {string} [options.preheader] - Preheader text (preview in inbox)
 * @param {string} [options.footerExtra] - Extra footer content
 * @param {boolean} [options.showUnsubscribe] - Show notification preferences link
 */
function wrapInLayout(options) {
  const {
    content,
    headerTitle = '',
    headerSubtitle = '',
    headerColor = COLORS.primary,
    headerColorEnd = COLORS.primaryDark,
    headerIcon = '',
    preheader = '',
    footerExtra = '',
    showUnsubscribe = true,
  } = options;

  return `
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${headerTitle || 'Botomat'}</title>
  <!--[if mso]>
  <style>table,td,div,p{font-family:Arial,sans-serif!important}</style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Rubik',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;color:#f3f4f6;font-size:1px;">${preheader}</div>` : ''}

  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:24px 16px;">

        <!-- Main container -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:${COLORS.bgWhite};border-radius:16px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1),0 2px 4px -2px rgba(0,0,0,0.1);">

          <!-- Header Banner -->
          <tr>
            <td style="background:linear-gradient(135deg, ${headerColor} 0%, ${headerColorEnd} 100%);padding:32px 40px;text-align:center;">
              <!-- Logo -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom:${headerTitle ? '16' : '0'}px;">
                    <span style="font-size:28px;font-weight:700;color:white;letter-spacing:1px;">Botomat</span>
                  </td>
                </tr>
                ${headerTitle ? `
                <tr>
                  <td align="center">
                    <div style="width:40px;height:2px;background:rgba(255,255,255,0.4);margin:0 auto 16px;border-radius:1px;"></div>
                    ${headerIcon ? `<div style="font-size:36px;margin-bottom:8px;">${headerIcon}</div>` : ''}
                    <h1 style="color:white;margin:0;font-size:22px;font-weight:600;line-height:1.4;">${headerTitle}</h1>
                    ${headerSubtitle ? `<p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">${headerSubtitle}</p>` : ''}
                  </td>
                </tr>
                ` : ''}
              </table>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:32px 40px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:0 40px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-top:1px solid ${COLORS.border};padding-top:24px;text-align:center;">
                    ${footerExtra ? `<div style="margin-bottom:16px;">${footerExtra}</div>` : ''}
                    <p style="color:${COLORS.textMuted};font-size:12px;margin:0 0 8px;">
                      © ${new Date().getFullYear()} Botomat. כל הזכויות שמורות.
                    </p>
                    ${showUnsubscribe ? `
                    <p style="margin:0;">
                      <a href="${FRONTEND_URL}/settings?tab=notifications" style="color:${COLORS.textLight};font-size:12px;text-decoration:underline;">
                        ניהול העדפות התראות
                      </a>
                    </p>
                    ` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Create a CTA button
 */
function ctaButton(text, url, color = COLORS.primary, colorEnd = null) {
  const bg = colorEnd
    ? `background:linear-gradient(135deg, ${color} 0%, ${colorEnd} 100%);`
    : `background-color:${color};`;
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;">
      <tr>
        <td align="center" style="${bg}border-radius:10px;">
          <a href="${url}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;letter-spacing:0.3px;">
            ${text}
          </a>
        </td>
      </tr>
    </table>`;
}

/**
 * Create an info card/box
 */
function infoCard(content, bgColor = COLORS.bgLight, borderColor = COLORS.border) {
  return `
    <div style="background:${bgColor};border-radius:12px;padding:20px;margin:20px 0;border:1px solid ${borderColor};">
      ${content}
    </div>`;
}

/**
 * Create a data table with label-value pairs
 */
function dataTable(rows) {
  const rowsHtml = rows.map(([label, value, highlight]) => `
    <tr>
      <td style="padding:10px 12px;color:${COLORS.textLight};font-size:14px;white-space:nowrap;">${label}</td>
      <td style="padding:10px 12px;color:${highlight ? COLORS.primary : COLORS.textDark};font-size:14px;font-weight:${highlight ? '600' : '400'};">${value}</td>
    </tr>
  `).join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.bgLight};border-radius:12px;overflow:hidden;margin:20px 0;">
      ${rowsHtml}
    </table>`;
}

/**
 * Create an alert box
 */
function alertBox(message, type = 'warning') {
  const styles = {
    warning: { bg: COLORS.warningLight, color: COLORS.warning, icon: '⚠️' },
    error: { bg: COLORS.errorLight, color: COLORS.error, icon: '🚨' },
    success: { bg: COLORS.successLight, color: COLORS.success, icon: '✅' },
    info: { bg: COLORS.infoLight, color: COLORS.info, icon: 'ℹ️' },
  };
  const s = styles[type] || styles.warning;
  return `
    <div style="background:${s.bg};border-radius:10px;padding:16px 20px;margin:20px 0;border-right:4px solid ${s.color};">
      <p style="color:${s.color};margin:0;font-size:14px;line-height:1.6;">
        ${s.icon} ${message}
      </p>
    </div>`;
}

/**
 * Paragraph helper
 */
function paragraph(text, options = {}) {
  const { bold, color, size, marginTop } = options;
  return `<p style="color:${color || COLORS.textMedium};font-size:${size || '15'}px;line-height:1.7;margin:${marginTop || '0'} 0 12px;${bold ? 'font-weight:600;' : ''}">${text}</p>`;
}

/**
 * Greeting helper
 */
function greeting(name) {
  return paragraph(`שלום ${name || 'משתמש יקר'},`, { size: '17', bold: true, color: COLORS.textDark });
}

/**
 * Progress bar
 */
function progressBar(percentage, color = null) {
  const barColor = color || (percentage >= 100 ? COLORS.error : percentage >= 80 ? COLORS.warning : COLORS.success);
  return `
    <div style="margin:16px 0;">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
        <span style="color:${COLORS.textLight};font-size:13px;">${Math.min(percentage, 100)}%</span>
      </div>
      <div style="background:${COLORS.border};border-radius:999px;height:10px;overflow:hidden;">
        <div style="background:${barColor};height:100%;width:${Math.min(percentage, 100)}%;border-radius:999px;"></div>
      </div>
    </div>`;
}

module.exports = {
  wrapInLayout,
  ctaButton,
  infoCard,
  dataTable,
  alertBox,
  paragraph,
  greeting,
  progressBar,
  COLORS,
  APP_URL,
  FRONTEND_URL,
};
