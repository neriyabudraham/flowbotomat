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

          {/* All Affiliates with Referrals */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800">כל השותפים והמשתמשים שהביאו</h3>
              <button
                onClick={async () => {
                  if (confirm('ליצור חשבון שותף לכל המשתמשים שעדיין אין להם?')) {
                    try {
                      const { data } = await api.post('/admin/affiliate/create-all');
                      alert(data.message);
                      loadData();
                    } catch (err) {
                      alert(err.response?.data?.error || 'שגיאה');
                    }
                  }
                }}
                className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-sm hover:bg-purple-200 flex items-center gap-1"
              >
                <Users className="w-4 h-4" />
                צור לכל המשתמשים
              </button>
            </div>
            {topAffiliates.length === 0 ? (
              <p className="text-gray-500 text-center py-4">אין שותפים עדיין</p>
            ) : (
              <div className="space-y-4">
                {topAffiliates.map(aff => (
                  <AffiliateCard key={aff.id} affiliate={aff} onUpdate={loadData} />
                ))}
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
            
            {/* Referral Discount Section */}
            <div className="pt-4 border-t border-gray-200">
              <h4 className="font-medium text-gray-800 mb-3">הנחה למשתמש שהגיע דרך שותף</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">אחוז הנחה למנוי ראשון</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={settingsForm.referral_discount_percent || ''}
                      onChange={e => setSettingsForm({...settingsForm, referral_discount_percent: parseInt(e.target.value) || 0})}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg"
                      placeholder="10"
                    />
                    <span className="text-gray-500">%</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">הנחה שמקבל המשתמש שהגיע דרך קישור שותף</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">תקופת הנחה</label>
                  <select
                    value={settingsForm.referral_discount_type || 'first_payment'}
                    onChange={e => setSettingsForm({...settingsForm, referral_discount_type: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                  >
                    <option value="first_payment">תשלום ראשון בלבד</option>
                    <option value="custom_months">מספר חודשים מותאם</option>
                    <option value="first_year">שנה ראשונה (12 חודשים)</option>
                    <option value="forever">לתמיד</option>
                  </select>
                </div>
                {settingsForm.referral_discount_type === 'custom_months' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">מספר חודשים</label>
                    <input
                      type="number"
                      min="1"
                      max="36"
                      value={settingsForm.referral_discount_months || ''}
                      onChange={e => setSettingsForm({...settingsForm, referral_discount_months: parseInt(e.target.value) || 1})}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                      placeholder="3"
                    />
                  </div>
                )}
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">זמן תפוגה להנחה (דקות)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="10080"
                    value={settingsForm.referral_expiry_minutes || ''}
                    onChange={e => setSettingsForm({...settingsForm, referral_expiry_minutes: parseInt(e.target.value) || 60})}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg"
                    placeholder="60"
                  />
                  <span className="text-gray-500">דקות</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  כמה זמן (בדקות) יש למשתמש לממש את ההנחה מרגע הכניסה ללינק. ברירת מחדל: 60 דקות (שעה)
                </p>
              </div>
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

function AffiliateCard({ affiliate, onUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    custom_commission: affiliate.custom_commission ?? '',
    custom_discount_percent: affiliate.custom_discount_percent ?? '',
    custom_discount_type: affiliate.custom_discount_type || '',
    custom_discount_months: affiliate.custom_discount_months ?? '',
    track_stats: affiliate.track_stats !== false,
    is_active: affiliate.is_active !== false,
    notes: affiliate.notes || ''
  });
  const referrals = affiliate.referrals || [];
  
  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/admin/affiliate/${affiliate.id}`, {
        custom_commission: editForm.custom_commission === '' ? null : parseInt(editForm.custom_commission),
        custom_discount_percent: editForm.custom_discount_percent === '' ? null : parseInt(editForm.custom_discount_percent),
        custom_discount_type: editForm.custom_discount_type || null,
        custom_discount_months: editForm.custom_discount_months === '' ? null : parseInt(editForm.custom_discount_months),
        track_stats: editForm.track_stats,
        is_active: editForm.is_active,
        notes: editForm.notes
      });
      setEditing(false);
      onUpdate?.();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };
  
  return (
    <div className={`border rounded-xl overflow-hidden ${affiliate.is_active === false ? 'border-red-200 bg-red-50/30' : 'border-gray-200'}`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div>
            <div className="font-medium text-gray-800 text-right flex items-center gap-2">
              {affiliate.name}
              {affiliate.is_active === false && (
                <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-xs rounded">מושבת</span>
              )}
            </div>
            <div className="text-xs text-gray-500">{affiliate.email}</div>
          </div>
          <code className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-sm">{affiliate.ref_code}</code>
          {(affiliate.custom_commission !== null || affiliate.custom_discount_percent !== null) && (
            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-600 text-xs rounded">מותאם</span>
          )}
        </div>
        <div className="flex items-center gap-6 text-sm">
          <div className="text-center">
            <div className="font-bold text-purple-600">{affiliate.total_clicks}</div>
            <div className="text-xs text-gray-500">קליקים</div>
          </div>
          <div className="text-center">
            <div className="font-bold text-blue-600">{affiliate.total_signups}</div>
            <div className="text-xs text-gray-500">הרשמות</div>
          </div>
          <div className="text-center">
            <div className="font-bold text-green-600">{affiliate.total_conversions}</div>
            <div className="text-xs text-gray-500">המרות</div>
          </div>
          <div className="text-center">
            <div className="font-bold text-amber-600">₪{affiliate.total_earned}</div>
            <div className="text-xs text-gray-500">הרוויח</div>
          </div>
          <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>
      
      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-gray-200">
          {/* Custom Settings */}
          <div className="p-4 bg-purple-50/50 border-b border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-gray-800 flex items-center gap-2">
                <Settings className="w-4 h-4 text-purple-600" />
                הגדרות מותאמות אישית
              </h4>
              {!editing ? (
                <button
                  onClick={() => setEditing(true)}
                  className="text-sm text-purple-600 hover:text-purple-700"
                >
                  ערוך
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditing(false)}
                    className="text-sm text-gray-500 hover:text-gray-700"
                    disabled={saving}
                  >
                    ביטול
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="text-sm text-green-600 hover:text-green-700 font-medium"
                  >
                    {saving ? 'שומר...' : 'שמור'}
                  </button>
                </div>
              )}
            </div>
            
            {editing ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">עמלה מותאמת (נקודות)</label>
                  <input
                    type="number"
                    value={editForm.custom_commission}
                    onChange={(e) => setEditForm({ ...editForm, custom_commission: e.target.value })}
                    placeholder="ברירת מחדל"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                  <p className="text-xs text-gray-400 mt-1">0 = ללא עמלה</p>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">% הנחה למגיעים</label>
                  <input
                    type="number"
                    value={editForm.custom_discount_percent}
                    onChange={(e) => setEditForm({ ...editForm, custom_discount_percent: e.target.value })}
                    placeholder="ברירת מחדל"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                  <p className="text-xs text-gray-400 mt-1">0 = ללא הנחה</p>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">תקופת הנחה</label>
                  <select
                    value={editForm.custom_discount_type}
                    onChange={(e) => setEditForm({ ...editForm, custom_discount_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  >
                    <option value="">ברירת מחדל</option>
                    <option value="first_payment">תשלום ראשון</option>
                    <option value="custom_months">חודשים מותאם</option>
                    <option value="first_year">שנה ראשונה</option>
                    <option value="forever">לתמיד</option>
                  </select>
                </div>
                {editForm.custom_discount_type === 'custom_months' && (
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">מספר חודשים</label>
                    <input
                      type="number"
                      min="1"
                      max="36"
                      value={editForm.custom_discount_months}
                      onChange={(e) => setEditForm({ ...editForm, custom_discount_months: e.target.value })}
                      placeholder="3"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">סטטוס</label>
                  <div className="space-y-2 mt-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={editForm.is_active}
                        onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                        className="rounded"
                      />
                      פעיל
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={editForm.track_stats}
                        onChange={(e) => setEditForm({ ...editForm, track_stats: e.target.checked })}
                        className="rounded"
                      />
                      ספור סטטיסטיקות
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">הערות</label>
                  <textarea
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    placeholder="הערות פנימיות..."
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm h-20 resize-none"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">עמלה:</span>
                  <span className="font-medium mr-2">
                    {affiliate.custom_commission !== null ? `${affiliate.custom_commission} נקודות` : 'ברירת מחדל'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">הנחה:</span>
                  <span className="font-medium mr-2">
                    {affiliate.custom_discount_percent !== null ? `${affiliate.custom_discount_percent}%` : 'ברירת מחדל'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">תקופת הנחה:</span>
                  <span className="font-medium mr-2">
                    {affiliate.custom_discount_type === 'first_payment' ? 'תשלום ראשון' 
                      : affiliate.custom_discount_type === 'custom_months' ? `${affiliate.custom_discount_months || 1} חודשים`
                      : affiliate.custom_discount_type === 'first_year' ? 'שנה ראשונה'
                      : affiliate.custom_discount_type === 'forever' ? 'לתמיד'
                      : 'ברירת מחדל'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">סטטיסטיקות:</span>
                  <span className={`font-medium mr-2 ${affiliate.track_stats !== false ? 'text-green-600' : 'text-red-600'}`}>
                    {affiliate.track_stats !== false ? 'נספרות' : 'לא נספרות'}
                  </span>
                </div>
                {affiliate.notes && (
                  <div className="col-span-2 md:col-span-1">
                    <span className="text-gray-500">הערות:</span>
                    <span className="font-medium mr-2 text-gray-700">{affiliate.notes}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Referrals List */}
          {referrals.length === 0 ? (
            <div className="px-4 py-6 text-center text-gray-500 text-sm">
              אין הפניות עדיין
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-2 text-right">משתמש</th>
                  <th className="px-4 py-2 text-right">תאריך הרשמה</th>
                  <th className="px-4 py-2 text-right">סטטוס</th>
                  <th className="px-4 py-2 text-right">עמלה</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {referrals.map(ref => (
                  <tr key={ref.referred_user_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-800">{ref.referred_name || 'ללא שם'}</div>
                      <div className="text-xs text-gray-500">{ref.referred_email}</div>
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {new Date(ref.created_at).toLocaleDateString('he-IL')}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        ref.status === 'converted' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {ref.status === 'converted' ? 'הומר' : 'ממתין'}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-medium text-green-600">
                      {ref.commission_amount ? `₪${ref.commission_amount}` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
