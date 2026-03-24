import { useState } from 'react';
import { Mail, Send, CheckCircle, AlertCircle, Eye } from 'lucide-react';
import api from '../../services/api';

const EMAIL_TEMPLATES = [
  { category: 'אימות וסיסמה', templates: [
    { id: 'verification', label: 'אימות חשבון', desc: 'מייל עם קוד אימות בהרשמה' },
    { id: 'password_reset', label: 'איפוס סיסמה', desc: 'מייל עם קוד איפוס סיסמה' },
  ]},
  { category: 'מנויים - למשתמש', templates: [
    { id: 'new_subscription', label: 'מנוי חדש', desc: 'ברוך הבא - מנוי הופעל' },
    { id: 'renewal', label: 'חידוש מנוי', desc: 'המנוי חודש בהצלחה' },
    { id: 'cancellation', label: 'ביטול מנוי', desc: 'המנוי בוטל' },
  ]},
  { category: 'מנויים - לאדמין', templates: [
    { id: 'admin_new_sub', label: 'התראת מנוי חדש', desc: 'התראה לאדמין על מנוי חדש' },
    { id: 'admin_renewal', label: 'התראת חידוש', desc: 'התראה לאדמין על חידוש מנוי' },
    { id: 'admin_cancellation', label: 'התראת ביטול', desc: 'התראה לאדמין על ביטול מנוי' },
  ]},
  { category: 'התראות שימוש', templates: [
    { id: 'usage_warning', label: 'התראת 80%', desc: 'ניצלת 80% מהמכסה' },
    { id: 'usage_limit', label: 'הגעת למגבלה (100%)', desc: 'הגעת למגבלת השימוש' },
    { id: 'auto_upgrade', label: 'שדרוג אוטומטי', desc: 'המנוי שודרג אוטומטית' },
  ]},
  { category: 'תפוגת ניסיון ומנוי', templates: [
    { id: 'trial_expiry_1day', label: 'ניסיון - יום אחרון', desc: 'תקופת ניסיון מסתיימת מחר (עם תשלום)' },
    { id: 'trial_expiry_3days', label: 'ניסיון - 3 ימים', desc: 'תקופת ניסיון מסתיימת בעוד 3 ימים (ללא תשלום)' },
  ]},
  { category: 'חיובים ותשלומים', templates: [
    { id: 'payment_success', label: 'תשלום הצליח', desc: 'חיוב בוצע בהצלחה' },
    { id: 'payment_failed', label: 'תשלום נכשל', desc: 'בעיה בחיוב - נדרשת פעולה' },
    { id: 'downgrade', label: 'הורדה לחינמי', desc: 'המנוי הועבר לתוכנית חינמית' },
  ]},
  { category: 'שונות', templates: [
    { id: 'broadcast', label: 'הודעה כללית', desc: 'הודעת שידור לכל המשתמשים' },
    { id: 'service_expired', label: 'שירות נוסף פג', desc: 'מנוי לשירות נוסף הסתיים' },
    { id: 'access_request', label: 'בקשת גישה', desc: 'יועץ מבקש גישה לחשבון' },
  ]},
];

export default function AdminEmailPreview() {
  const [recipientEmail, setRecipientEmail] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const handleSend = async () => {
    if (!selectedTemplate || !recipientEmail) return;

    setSending(true);
    setResult(null);

    try {
      const { data } = await api.post('/admin/email-preview', {
        templateId: selectedTemplate,
        recipientEmail,
      });
      setResult({ type: 'success', message: data.message });
    } catch (err) {
      setResult({ type: 'error', message: err.response?.data?.error || 'שגיאה בשליחה' });
    } finally {
      setSending(false);
    }
  };

  const selectedInfo = EMAIL_TEMPLATES
    .flatMap(c => c.templates)
    .find(t => t.id === selectedTemplate);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-purple-100 rounded-xl">
          <Mail className="w-6 h-6 text-purple-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-800">תצוגה מקדימה של מיילים</h2>
          <p className="text-sm text-gray-500">בחר תבנית ושלח מייל לדוגמא לכל כתובת</p>
        </div>
      </div>

      {/* Email input */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">כתובת אימייל לשליחה</label>
        <input
          type="email"
          value={recipientEmail}
          onChange={(e) => setRecipientEmail(e.target.value)}
          placeholder="your@email.com"
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-left"
          dir="ltr"
        />
      </div>

      {/* Template selection */}
      <div className="space-y-4">
        {EMAIL_TEMPLATES.map((category) => (
          <div key={category.category} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-3 bg-gray-50 border-b border-gray-100">
              <h3 className="font-semibold text-gray-700 text-sm">{category.category}</h3>
            </div>
            <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {category.templates.map((template) => {
                const isSelected = selectedTemplate === template.id;
                return (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplate(template.id)}
                    className={`text-right p-3 rounded-xl border-2 transition-all ${
                      isSelected
                        ? 'border-purple-500 bg-purple-50 shadow-sm'
                        : 'border-transparent hover:border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className={`text-sm font-medium ${isSelected ? 'text-purple-700' : 'text-gray-800'}`}>
                      {template.label}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{template.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Send button + result */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        {selectedInfo && (
          <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-purple-50 rounded-lg">
            <Eye className="w-4 h-4 text-purple-600" />
            <span className="text-sm text-purple-700">
              נבחר: <strong>{selectedInfo.label}</strong> — {selectedInfo.desc}
            </span>
          </div>
        )}

        <button
          onClick={handleSend}
          disabled={!selectedTemplate || !recipientEmail || sending}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {sending ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              שולח...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              שלח מייל לדוגמא
            </>
          )}
        </button>

        {result && (
          <div className={`mt-4 flex items-center gap-2 px-4 py-3 rounded-xl ${
            result.type === 'success'
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          }`}>
            {result.type === 'success'
              ? <CheckCircle className="w-5 h-5" />
              : <AlertCircle className="w-5 h-5" />
            }
            <span className="text-sm font-medium">{result.message}</span>
          </div>
        )}
      </div>
    </div>
  );
}
