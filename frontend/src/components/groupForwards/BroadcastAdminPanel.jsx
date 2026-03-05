import { useState, useEffect } from 'react';
import { Shield, Phone, User, Save, Trash2, CheckCircle, AlertCircle, Loader2, Info, Clock } from 'lucide-react';
import Button from '../atoms/Button';
import api from '../../services/api';

/**
 * BroadcastAdminPanel
 *
 * Allows account owners to configure a single "broadcast admin":
 * - One admin phone number only
 * - When an authorized sender triggers a group broadcast, the admin gets
 *   a WhatsApp approval request (list message with Yes/No)
 * - If admin approves: the sender continues the normal confirmation flow
 * - If admin rejects: the job is silently cancelled (sender not notified)
 * - The admin can also cascade-delete broadcast messages by deleting from one group
 */
export default function BroadcastAdminPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [config, setConfig] = useState(null);

  const [adminPhone, setAdminPhone] = useState('');
  const [adminName, setAdminName] = useState('');
  const [requireApproval, setRequireApproval] = useState(true);
  const [deleteDelay, setDeleteDelay] = useState(2);

  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/broadcast-admin/config');
      if (data.config) {
        setConfig(data.config);
        setAdminPhone(data.config.admin_phone || '');
        setAdminName(data.config.admin_name || '');
        setRequireApproval(data.config.require_approval !== false);
        setDeleteDelay(data.config.delete_delay_seconds || 2);
      }
    } catch (err) {
      console.error('Error loading broadcast admin config:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setErrorMsg('');
    setSuccessMsg('');

    const cleanPhone = adminPhone.replace(/\D/g, '').replace(/^0+/, '');
    if (!cleanPhone || cleanPhone.length < 9) {
      setErrorMsg('יש להזין מספר טלפון תקין');
      return;
    }

    try {
      setSaving(true);
      const { data } = await api.post('/broadcast-admin/config', {
        admin_phone: cleanPhone,
        admin_name: adminName.trim() || null,
        require_approval: requireApproval,
        delete_delay_seconds: parseInt(deleteDelay) || 2
      });
      setConfig(data.config);
      setSuccessMsg('הגדרות המנהל נשמרו בהצלחה');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'שגיאה בשמירת ההגדרות');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('האם למחוק את הגדרות המנהל? השליחות יחזרו לאישור ישיר מהמשתמש.')) return;
    try {
      setDeleting(true);
      await api.delete('/broadcast-admin/config');
      setConfig(null);
      setAdminPhone('');
      setAdminName('');
      setRequireApproval(true);
      setDeleteDelay(2);
      setSuccessMsg('הגדרות המנהל נמחקו');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'שגיאה במחיקת ההגדרות');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
          <Shield className="w-5 h-5 text-orange-600 dark:text-orange-400" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">מנהל שליחות</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            הגדר מנהל שיאשר שליחות הודעות לקבוצות לפני ביצוע. ניתן להגדיר מנהל אחד בלבד.
          </p>
        </div>
      </div>

      {/* Info box */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex gap-3">
        <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <p><strong>כיצד זה עובד:</strong></p>
          <ul className="list-disc list-inside space-y-0.5 mr-2">
            <li>כאשר מורשה שליחה מפעיל שליחת הודעה לקבוצות, המנהל מקבל הודעת ווצאפ עם פרטי הבקשה</li>
            <li>המנהל יכול לאשר או לדחות את השליחה</li>
            <li>אם נדחה — המשתמש אינו מקבל כל עדכון</li>
            <li>אם אושר — המשתמש ממשיך בתהליך הרגיל</li>
            <li>כאשר המנהל מוחק הודעה שהופצה מקבוצה — היא נמחקת מכלל הקבוצות</li>
          </ul>
          <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">
            המנהל אינו מקבל גישה לממשק הניהול של האתר.
          </p>
        </div>
      </div>

      {/* Current admin badge */}
      {config && (
        <div className="flex items-center gap-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-3">
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-green-800 dark:text-green-300">מנהל פעיל מוגדר</p>
            <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
              {config.admin_name ? `${config.admin_name} · ` : ''}{config.admin_phone}
            </p>
          </div>
        </div>
      )}

      {/* Form */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
        {/* Phone number */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            <Phone className="w-4 h-4 inline ml-1.5" />
            מספר טלפון של המנהל *
          </label>
          <input
            type="tel"
            value={adminPhone}
            onChange={e => setAdminPhone(e.target.value)}
            placeholder="972501234567"
            dir="ltr"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            מספר הטלפון של הווצאפ של המנהל (עם קידומת מדינה, ללא +)
          </p>
        </div>

        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            <User className="w-4 h-4 inline ml-1.5" />
            שם המנהל (אופציונלי)
          </label>
          <input
            type="text"
            value={adminName}
            onChange={e => setAdminName(e.target.value)}
            placeholder="שם המנהל"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Require approval toggle */}
        <div className="flex items-center justify-between py-1">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              דרוש אישור לפני שליחה
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              כאשר כבוי, המנהל יקבל עדכון בלבד ולא יצטרך לאשר
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRequireApproval(!requireApproval)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              requireApproval ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                requireApproval ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Delete delay */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            <Clock className="w-4 h-4 inline ml-1.5" />
            השהיה בין מחיקות (שניות)
          </label>
          <input
            type="number"
            value={deleteDelay}
            onChange={e => setDeleteDelay(e.target.value)}
            min={1}
            max={30}
            className="w-24 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            ההשהיה בין מחיקת הודעה מכל קבוצה (בשניות) — למניעת חסימה
          </p>
        </div>
      </div>

      {/* Messages */}
      {successMsg && (
        <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-3 text-sm text-green-700 dark:text-green-300">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {errorMsg}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {config ? 'עדכן מנהל' : 'שמור מנהל'}
        </Button>

        {config && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            הסר מנהל
          </button>
        )}
      </div>
    </div>
  );
}
