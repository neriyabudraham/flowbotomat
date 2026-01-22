import { useState } from 'react';
import { Bell, Send, Megaphone, Info, AlertTriangle, Gift, Sparkles, Loader2, Mail, CreditCard } from 'lucide-react';
import api from '../../services/api';
import Button from '../atoms/Button';

const NOTIFICATION_TYPES = [
  { id: 'broadcast', label: 'הודעה כללית', icon: Megaphone, color: 'indigo', description: 'הודעה כללית לכל המשתמשים' },
  { id: 'subscription', label: 'רכישה ומנוי', icon: CreditCard, color: 'green', description: 'עדכון לגבי תשלומים ומנויים' },
  { id: 'promo', label: 'מבצע/הנחה', icon: Gift, color: 'pink', description: 'הצעות מיוחדות והנחות' },
  { id: 'update', label: 'עדכון מערכת', icon: Sparkles, color: 'cyan', description: 'פיצ\'רים חדשים ושיפורים' },
  { id: 'critical', label: 'עדכון קריטי', icon: AlertTriangle, color: 'red', description: 'נשלח לכולם ללא קשר להעדפות' },
];

export default function AdminNotifications() {
  const [form, setForm] = useState({
    title: '',
    message: '',
    type: 'broadcast',
    sendEmail: false,
    emailSubject: ''
  });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const handleSend = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      setResult({ type: 'error', message: 'נדרש כותרת והודעה' });
      return;
    }
    
    setSending(true);
    setResult(null);
    
    try {
      const { data } = await api.post('/admin/notifications/broadcast', {
        title: form.title,
        message: form.message,
        type: form.type,
        sendEmail: form.sendEmail,
        emailSubject: form.emailSubject || form.title
      });
      
      let successMsg = `ההתראה נשלחה בהצלחה ל-${data.sentTo} משתמשים`;
      if (data.emailsSent > 0) {
        successMsg += ` (${data.emailsSent} מיילים נשלחו)`;
      }
      
      setResult({ type: 'success', message: successMsg });
      setForm({ title: '', message: '', type: 'broadcast', sendEmail: false, emailSubject: '' });
    } catch (err) {
      setResult({ 
        type: 'error', 
        message: err.response?.data?.error || 'שגיאה בשליחה' 
      });
    } finally {
      setSending(false);
    }
  };
  
  const selectedType = NOTIFICATION_TYPES.find(t => t.id === form.type);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Bell className="w-6 h-6 text-blue-600" />
        <h2 className="text-xl font-bold text-gray-800">שליחת התראות</h2>
      </div>

      {/* Broadcast Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <Megaphone className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-gray-800">שלח התראה לכל המשתמשים</h3>
            <p className="text-sm text-gray-500">ההתראה תישלח לכל המשתמשים הפעילים במערכת</p>
          </div>
        </div>

        <div className="space-y-5">
          {/* Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">סוג התראה</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {NOTIFICATION_TYPES.map(type => {
                const Icon = type.icon;
                const isSelected = form.type === type.id;
                const colorClasses = {
                  indigo: isSelected ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : '',
                  green: isSelected ? 'border-green-500 bg-green-50 text-green-700' : '',
                  pink: isSelected ? 'border-pink-500 bg-pink-50 text-pink-700' : '',
                  cyan: isSelected ? 'border-cyan-500 bg-cyan-50 text-cyan-700' : '',
                  red: isSelected ? 'border-red-500 bg-red-50 text-red-700' : '',
                };
                return (
                  <button
                    key={type.id}
                    onClick={() => setForm({ ...form, type: type.id })}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 transition-all text-right ${
                      isSelected 
                        ? colorClasses[type.color]
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span className="text-sm font-medium">{type.label}</span>
                  </button>
                );
              })}
            </div>
            {selectedType && (
              <p className="mt-2 text-sm text-gray-500">{selectedType.description}</p>
            )}
            {form.type === 'critical' && (
              <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  עדכון קריטי יישלח לכל המשתמשים ללא קשר להעדפות ההתראות שלהם
                </p>
              </div>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">כותרת התראה</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="לדוגמא: עדכון מערכת חדש!"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">תוכן ההודעה</label>
            <textarea
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="כתוב את תוכן ההתראה כאן..."
              rows={4}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none"
            />
          </div>
          
          {/* Send Options */}
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
            <h4 className="font-medium text-gray-800 mb-3">אפשרויות שליחה</h4>
            
            <div className="space-y-3">
              {/* In-App Notification - Always on */}
              <label className="flex items-center gap-3">
                <div className="w-5 h-5 rounded bg-blue-500 flex items-center justify-center">
                  <Bell className="w-3 h-3 text-white" />
                </div>
                <span className="text-sm text-gray-700">התראה במערכת (תמיד)</span>
              </label>
              
              {/* Email Option */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.sendEmail}
                  onChange={(e) => setForm({ ...form, sendEmail: e.target.checked })}
                  className="w-5 h-5 rounded text-blue-600 border-gray-300"
                />
                <Mail className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-700">שלח גם במייל</span>
              </label>
              
              {/* Email Subject (if email enabled) */}
              {form.sendEmail && (
                <div className="mr-8">
                  <input
                    type="text"
                    value={form.emailSubject}
                    onChange={(e) => setForm({ ...form, emailSubject: e.target.value })}
                    placeholder="נושא המייל (ברירת מחדל: כותרת ההתראה)"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  />
                </div>
              )}
            </div>
            
            <p className="mt-3 text-xs text-gray-500">
              * המייל יישלח רק למשתמשים שאישרו קבלת מיילים מסוג זה בהגדרות שלהם
              {form.type === 'critical' && ' (למעט עדכונים קריטיים שנשלחים לכולם)'}
            </p>
          </div>

          {/* Result Message */}
          {result && (
            <div className={`p-4 rounded-xl ${
              result.type === 'success' 
                ? 'bg-green-50 text-green-700 border border-green-200' 
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {result.message}
            </div>
          )}

          {/* Submit Button */}
          <Button 
            onClick={handleSend} 
            disabled={sending || !form.title.trim() || !form.message.trim()}
            className="w-full"
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin inline ml-2" />
                שולח...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 inline ml-2" />
                שלח התראה {form.sendEmail ? 'במערכת ובמייל' : 'במערכת'}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 max-w-2xl">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">מידע חשוב:</p>
            <ul className="list-disc list-inside space-y-1 text-blue-700">
              <li>ההתראה תישלח לכל המשתמשים הפעילים במערכת</li>
              <li>המשתמשים יראו את ההתראה בפעמון בחלק העליון של המערכת</li>
              <li>לא ניתן לבטל שליחת התראה לאחר שנשלחה</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
