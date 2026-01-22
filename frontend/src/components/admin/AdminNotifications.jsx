import { useState } from 'react';
import { Bell, Send, Megaphone, Info, AlertTriangle, Gift, Sparkles, Loader2 } from 'lucide-react';
import api from '../../services/api';
import Button from '../atoms/Button';

const NOTIFICATION_TYPES = [
  { id: 'system', label: 'מערכת', icon: Info, color: 'blue' },
  { id: 'broadcast', label: 'הודעה כללית', icon: Megaphone, color: 'indigo' },
  { id: 'promo', label: 'מבצע/הנחה', icon: Gift, color: 'pink' },
  { id: 'update', label: 'עדכון מערכת', icon: Sparkles, color: 'cyan' },
  { id: 'quota_warning', label: 'אזהרה', icon: AlertTriangle, color: 'amber' },
];

export default function AdminNotifications() {
  const [form, setForm] = useState({
    title: '',
    message: '',
    type: 'broadcast'
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
      const { data } = await api.post('/admin/notifications/broadcast', form);
      setResult({ 
        type: 'success', 
        message: `ההתראה נשלחה בהצלחה ל-${data.sentTo} משתמשים` 
      });
      setForm({ title: '', message: '', type: 'broadcast' });
    } catch (err) {
      setResult({ 
        type: 'error', 
        message: err.response?.data?.error || 'שגיאה בשליחה' 
      });
    } finally {
      setSending(false);
    }
  };

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

        <div className="space-y-4">
          {/* Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">סוג התראה</label>
            <div className="flex flex-wrap gap-2">
              {NOTIFICATION_TYPES.map(type => {
                const Icon = type.icon;
                const isSelected = form.type === type.id;
                return (
                  <button
                    key={type.id}
                    onClick={() => setForm({ ...form, type: type.id })}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all ${
                      isSelected 
                        ? `border-${type.color}-500 bg-${type.color}-50 text-${type.color}-700` 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {type.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">כותרת</label>
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
                שלח התראה לכל המשתמשים
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
