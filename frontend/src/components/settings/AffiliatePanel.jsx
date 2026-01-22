import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Share2, Copy, Check, Users, DollarSign, TrendingUp, 
  Clock, Gift, ExternalLink, CreditCard, Eye, MousePointer,
  FileText, Coins
} from 'lucide-react';
import api from '../../services/api';

export default function AffiliatePanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const res = await api.get('/payment/affiliate/my');
      setData(res.data);
    } catch (err) {
      console.error('Failed to load affiliate data:', err);
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(data.shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRedeem = async () => {
    if (!confirm('לממש את הנקודות שצברת? הסכום יופחת מהתשלום הבא שלך.')) return;
    
    setRedeeming(true);
    try {
      const res = await api.post('/payment/affiliate/redeem');
      alert(res.data.message);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה במימוש');
    } finally {
      setRedeeming(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3" />
          <div className="h-20 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (!data?.settings?.is_active) {
    return null; // Don't show if program is disabled
  }

  const affiliate = data.affiliate;
  const settings = data.settings;
  const canRedeem = parseFloat(affiliate?.available_balance || 0) >= parseFloat(settings?.min_payout_amount || 100);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-6 text-white">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-xl">
              <Share2 className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold">תוכנית שותפים</h2>
          </div>
          <Link 
            to="/affiliate-terms" 
            className="flex items-center gap-1 text-white/80 hover:text-white text-sm transition-colors"
          >
            <FileText className="w-4 h-4" />
            תנאי התוכנית
          </Link>
        </div>
        <p className="text-green-100 text-sm">
          שתף את הלינק שלך וקבל {Math.floor(settings?.commission_amount || 20)} נקודות למימוש על כל {settings?.conversion_type === 'email_verify' ? 'הרשמה' : 'מנוי'} שמגיע דרכך!
        </p>
      </div>

      {/* Share Link */}
      <div className="p-6 border-b border-gray-100">
        <label className="block text-sm font-medium text-gray-700 mb-2">הלינק שלך</label>
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
            <ExternalLink className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="text-sm text-gray-600 truncate" dir="ltr">{data.shareLink}</span>
          </div>
          <button
            onClick={copyLink}
            className={`px-4 py-3 rounded-xl font-medium transition-all flex items-center gap-2 ${
              copied 
                ? 'bg-green-100 text-green-700' 
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'הועתק!' : 'העתק'}
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm text-gray-500">
          <span>קוד ההפניה שלך:</span>
          <code className="bg-gray-100 px-2 py-0.5 rounded font-mono">{affiliate?.ref_code}</code>
        </div>
      </div>

      {/* Stats */}
      <div className={`grid grid-cols-2 ${settings?.conversion_type === 'email_verify' ? 'md:grid-cols-3' : 'md:grid-cols-4'} gap-4 p-6`}>
        <StatCard 
          icon={MousePointer}
          label="קליקים"
          value={affiliate?.total_clicks || 0}
          color="blue"
        />
        <StatCard 
          icon={Users}
          label="הרשמות"
          value={affiliate?.total_signups || 0}
          color="purple"
        />
        {settings?.conversion_type !== 'email_verify' && (
          <StatCard 
            icon={TrendingUp}
            label="המרות (שילמו)"
            value={affiliate?.total_conversions || 0}
            color="green"
          />
        )}
        <StatCard 
          icon={DollarSign}
          label="סה״כ הרווחת"
          value={`₪${Math.floor(affiliate?.total_earned || 0)}`}
          color="amber"
        />
      </div>

      {/* Balance & Redeem */}
      <div className="p-6 bg-gradient-to-r from-amber-50 to-orange-50 border-t border-amber-100">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-amber-700 mb-1 flex items-center gap-1">
              <Coins className="w-4 h-4" />
              נקודות למימוש
            </div>
            <div className="text-3xl font-bold text-amber-800">{Math.floor(affiliate?.available_balance || 0)}</div>
            <div className="text-xs text-amber-600 mt-1">
              מינימום למימוש: {Math.floor(settings?.min_payout_amount || 100)} נקודות (= ₪{Math.floor(settings?.min_payout_amount || 100)})
            </div>
          </div>
          <button
            onClick={handleRedeem}
            disabled={!canRedeem || redeeming}
            className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all ${
              canRedeem 
                ? 'bg-amber-600 text-white hover:bg-amber-700 shadow-lg' 
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            <Gift className="w-5 h-5" />
            {redeeming ? 'מממש...' : 'ממש נקודות'}
          </button>
        </div>
        <p className="text-xs text-amber-700 mt-3">
          * המימוש יקוזז מהתשלום הבא שלך במערכת
        </p>
      </div>

      {/* How it works */}
      <div className="p-6 bg-gray-50 border-t border-gray-100">
        <h3 className="font-bold text-gray-800 mb-3">איך זה עובד?</h3>
        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
            <span>שתף את הלינק שלך עם חברים ועמיתים</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
            <span>
              {settings?.conversion_type === 'email_verify' 
                ? `כשמישהו נרשם ומאמת את המייל דרך הלינק - אתה מקבל ${Math.floor(settings?.commission_amount || 20)} נקודות למימוש`
                : `כשמישהו נרשם ומשלם על מנוי דרך הלינק - אתה מקבל ${Math.floor(settings?.commission_amount || 20)} נקודות למימוש`
              }
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
            <span>כשתגיע ל-{Math.floor(settings?.min_payout_amount || 100)} נקודות - תוכל לממש במערכת כהנחה!</span>
          </div>
        </div>
        <Link 
          to="/affiliate-terms"
          className="inline-flex items-center gap-1 text-green-600 hover:text-green-700 text-sm mt-4 font-medium"
        >
          <FileText className="w-4 h-4" />
          קרא את תנאי התוכנית המלאים
        </Link>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
  };
  
  return (
    <div className="text-center p-3">
      <div className={`w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-xl font-bold text-gray-800">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
