import { useState, useEffect } from 'react';
import { 
  Share2, Users, DollarSign, TrendingUp, Settings, Check, X,
  Clock, CreditCard, RefreshCw, Eye, ChevronDown, FileText, Save, Loader2
} from 'lucide-react';
import api from '../../services/api';
import Button from '../atoms/Button';

export default function AdminAffiliate() {
  const [activeTab, setActiveTab] = useState('stats');
  const [settings, setSettings] = useState(null);
  const [stats, setStats] = useState(null);
  const [topAffiliates, setTopAffiliates] = useState([]);
  const [pendingPayouts, setPendingPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingSettings, setEditingSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({});
  const [termsContent, setTermsContent] = useState('');
  const [termsSaving, setTermsSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [settingsRes, statsRes, termsRes] = await Promise.all([
        api.get('/admin/affiliate/settings'),
        api.get('/admin/affiliate/stats'),
        api.get('/admin/affiliate/terms').catch(() => ({ data: { content: '' } }))
      ]);
      setSettings(settingsRes.data.settings);
      setSettingsForm(settingsRes.data.settings || {});
      setStats(statsRes.data.stats);
      setTopAffiliates(statsRes.data.topAffiliates || []);
      setPendingPayouts(statsRes.data.pendingPayouts || []);
      setTermsContent(termsRes.data.content || '');
    } catch (err) {
      console.error('Failed to load affiliate data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTerms = async () => {
    setTermsSaving(true);
    try {
      await api.put('/admin/affiliate/terms', { content: termsContent });
      alert('תנאי התוכנית נשמרו בהצלחה');
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בשמירה');
    } finally {
      setTermsSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      await api.put('/admin/affiliate/settings', settingsForm);
      setSettings(settingsForm);
      setEditingSettings(false);
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בשמירה');
    }
  };

  const handleProcessPayout = async (payoutId, action) => {
    try {
      await api.post(`/admin/affiliate/payouts/${payoutId}/process`, { action });
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בעיבוד');
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">טוען...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Share2 className="w-6 h-6 text-green-600" />
          <h2 className="text-xl font-bold text-gray-800">תוכנית שותפים</h2>
        </div>
        <Button variant="ghost" onClick={loadData} className="!p-2">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('stats')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'stats' ? 'text-green-600 border-b-2 border-green-600' : 'text-gray-500'
          }`}
        >
          <TrendingUp className="w-4 h-4 inline ml-2" />
          סטטיסטיקות
        </button>
        <button
          onClick={() => setActiveTab('payouts')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'payouts' ? 'text-green-600 border-b-2 border-green-600' : 'text-gray-500'
          }`}
        >
          <CreditCard className="w-4 h-4 inline ml-2" />
          בקשות משיכה
          {pendingPayouts.length > 0 && (
            <span className="mr-2 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">
              {pendingPayouts.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'settings' ? 'text-green-600 border-b-2 border-green-600' : 'text-gray-500'
          }`}
        >
          <Settings className="w-4 h-4 inline ml-2" />
          הגדרות
        </button>
        <button
          onClick={() => setActiveTab('terms')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'terms' ? 'text-green-600 border-b-2 border-green-600' : 'text-gray-500'
          }`}
        >
          <FileText className="w-4 h-4 inline ml-2" />
          תנאי תוכנית
        </button>
      </div>

      {/* Stats Tab */}
      {activeTab === 'stats' && (
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard 
              icon={Users} 
              label="שותפים פעילים" 
              value={stats?.total_affiliates || 0}
              color="blue"
            />
            <StatCard 
              icon={Eye} 
              label="סה״כ קליקים" 
              value={stats?.total_clicks || 0}
              color="purple"
            />
            <StatCard 
              icon={TrendingUp} 
              label="המרות" 
              value={stats?.total_conversions || 0}
              color="green"
            />
            <StatCard 
              icon={DollarSign} 
              label="עמלות שולמו" 
              value={`₪${stats?.total_commissions || 0}`}
              color="amber"
            />
            <StatCard 
              icon={Clock} 
              label="ממתינים למשיכה" 
              value={`₪${stats?.pending_payouts || 0}`}
              color="red"
            />
          </div>

          {/* Top Affiliates */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-bold text-gray-800 mb-4">שותפים מובילים</h3>
            {topAffiliates.length === 0 ? (
              <p className="text-gray-500 text-center py-4">אין נתונים עדיין</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 text-sm text-gray-600">
                    <tr>
                      <th className="px-3 py-2 text-right">שותף</th>
                      <th className="px-3 py-2 text-right">קוד</th>
                      <th className="px-3 py-2 text-right">קליקים</th>
                      <th className="px-3 py-2 text-right">הרשמות</th>
                      <th className="px-3 py-2 text-right">המרות</th>
                      <th className="px-3 py-2 text-right">הרוויח</th>
                      <th className="px-3 py-2 text-right">זמין למשיכה</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {topAffiliates.map(aff => (
                      <tr key={aff.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-800">{aff.name}</div>
                          <div className="text-xs text-gray-500">{aff.email}</div>
                        </td>
                        <td className="px-3 py-2">
                          <code className="bg-gray-100 px-2 py-0.5 rounded text-sm">{aff.ref_code}</code>
                        </td>
                        <td className="px-3 py-2 text-gray-600">{aff.total_clicks}</td>
                        <td className="px-3 py-2 text-gray-600">{aff.total_signups}</td>
                        <td className="px-3 py-2 font-medium text-green-600">{aff.total_conversions}</td>
                        <td className="px-3 py-2 font-medium">₪{aff.total_earned}</td>
                        <td className="px-3 py-2 text-amber-600">₪{aff.available_balance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payouts Tab */}
      {activeTab === 'payouts' && (
        <div className="bg-white rounded-xl border border-gray-200">
          {pendingPayouts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>אין בקשות משיכה ממתינות</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {pendingPayouts.map(payout => (
                <div key={payout.id} className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-800">{payout.name}</div>
                    <div className="text-sm text-gray-500">{payout.email}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {new Date(payout.created_at).toLocaleDateString('he-IL')}
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="text-xl font-bold text-green-600">₪{payout.amount}</div>
                    <div className="text-xs text-gray-500">{payout.payout_method || 'לא צוין'}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleProcessPayout(payout.id, 'mark_paid')}
                      className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm hover:bg-green-200"
                    >
                      <Check className="w-4 h-4 inline ml-1" />
                      שולם
                    </button>
                    <button
                      onClick={() => handleProcessPayout(payout.id, 'reject')}
                      className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200"
                    >
                      <X className="w-4 h-4 inline ml-1" />
                      דחה
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-xl">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-gray-800">הגדרות תוכנית</h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settingsForm.is_active}
                onChange={e => setSettingsForm({...settingsForm, is_active: e.target.checked})}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm text-gray-600">תוכנית פעילה</span>
            </label>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">עמלה להמרה</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={settingsForm.commission_amount || ''}
                    onChange={e => setSettingsForm({...settingsForm, commission_amount: parseFloat(e.target.value)})}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg"
                    placeholder="20"
                  />
                  <select
                    value={settingsForm.commission_type || 'fixed'}
                    onChange={e => setSettingsForm({...settingsForm, commission_type: e.target.value})}
                    className="px-3 py-2 border border-gray-200 rounded-lg"
                  >
                    <option value="fixed">₪</option>
                    <option value="percentage">%</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">מינימום למשיכה (₪)</label>
                <input
                  type="number"
                  value={settingsForm.min_payout_amount || ''}
                  onChange={e => setSettingsForm({...settingsForm, min_payout_amount: parseFloat(e.target.value)})}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                  placeholder="100"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">מתי לזכות בעמלה</label>
              <select
                value={settingsForm.conversion_type || 'paid_subscription'}
                onChange={e => setSettingsForm({...settingsForm, conversion_type: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg"
              >
                <option value="signup">הרשמה למערכת</option>
                <option value="email_verified">אימות אימייל</option>
                <option value="paid_subscription">תשלום למנוי</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">תוקף עוגיה (ימים)</label>
              <input
                type="number"
                value={settingsForm.cookie_days || ''}
                onChange={e => setSettingsForm({...settingsForm, cookie_days: parseInt(e.target.value)})}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                placeholder="30"
              />
              <p className="text-xs text-gray-500 mt-1">כמה ימים אחרי קליק על הלינק ההמרה עדיין נזקפת לשותף</p>
            </div>

            <Button onClick={handleSaveSettings} className="w-full">
              שמור הגדרות
            </Button>
          </div>
        </div>
      )}

      {/* Terms Tab */}
      {activeTab === 'terms' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-bold text-gray-800">תנאי תוכנית השותפים</h3>
              <p className="text-sm text-gray-500 mt-1">
                ערוך את תנאי השימוש בתוכנית השותפים (בפורמט Markdown)
              </p>
            </div>
            <a 
              href="/affiliate-terms" 
              target="_blank" 
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <Eye className="w-4 h-4" />
              תצוגה מקדימה
            </a>
          </div>

          <textarea
            value={termsContent}
            onChange={(e) => setTermsContent(e.target.value)}
            className="w-full h-96 px-4 py-3 border border-gray-200 rounded-xl font-mono text-sm resize-y"
            placeholder="# תנאי תוכנית השותפים&#10;&#10;כתוב כאן את תנאי התוכנית בפורמט Markdown..."
            dir="rtl"
          />

          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              תומך בפורמט Markdown: כותרות (#), רשימות (*), הדגשה (**טקסט**)
            </p>
            <Button onClick={handleSaveTerms} disabled={termsSaving}>
              {termsSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin inline ml-2" />
                  שומר...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 inline ml-2" />
                  שמור תנאים
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
  };
  
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-2xl font-bold text-gray-800">{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
    </div>
  );
}
