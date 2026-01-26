import { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { 
  CreditCard, Lock, Check, AlertCircle, ArrowRight, 
  Crown, Zap, Star, Building, Loader2, Shield
} from 'lucide-react';
import api from '../services/api';
import useAuthStore from '../store/authStore';

const PLAN_ICONS = {
  'Free': Star,
  'Basic': Zap,
  'Pro': Crown,
  'Enterprise': Building,
};

export default function CheckoutPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, isAuthenticated } = useAuthStore();
  
  const planId = searchParams.get('plan') || location.state?.planId;
  const billingPeriod = searchParams.get('period') || location.state?.billingPeriod || 'monthly';
  
  const [plan, setPlan] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  
  // Payment form state
  const [showCardForm, setShowCardForm] = useState(false);
  const [cardForm, setCardForm] = useState({
    cardNumber: '',
    cardHolder: '',
    expiryMonth: '',
    expiryYear: '',
    cvv: '',
    citizenId: '',
  });
  
  // Referral timer
  const [referralTimeLeft, setReferralTimeLeft] = useState(0);
  
  const formatTimeLeft = (seconds) => {
    if (seconds <= 0) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { state: { returnTo: `/checkout?plan=${planId}&period=${billingPeriod}` } });
      return;
    }
    
    if (!planId) {
      navigate('/pricing');
      return;
    }
    
    loadData();
    
    // Initialize referral timer
    const referralExpiry = localStorage.getItem('referral_expiry');
    if (referralExpiry) {
      const remaining = Math.floor((parseInt(referralExpiry) - Date.now()) / 1000);
      if (remaining > 0) {
        setReferralTimeLeft(remaining);
      }
    }
  }, [planId, isAuthenticated]);
  
  // Referral countdown
  useEffect(() => {
    if (referralTimeLeft <= 0) return;
    
    const timer = setInterval(() => {
      setReferralTimeLeft(prev => {
        if (prev <= 1) {
          localStorage.removeItem('referral_code');
          localStorage.removeItem('referral_discount_percent');
          localStorage.removeItem('referral_expiry');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [referralTimeLeft]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Load plan details, payment method, and current subscription in parallel
      const [planRes, paymentRes, subRes] = await Promise.all([
        api.get(`/subscriptions/plans/${planId}`),
        api.get('/payment/methods'),
        api.get('/subscriptions/my').catch(() => ({ data: { subscription: null } })),
      ]);
      
      setPlan(planRes.data.plan);
      setCurrentSubscription(subRes.data.subscription);
      
      if (paymentRes.data.paymentMethods?.length > 0) {
        setPaymentMethod(paymentRes.data.paymentMethods[0]);
      } else {
        setShowCardForm(true);
      }
    } catch (err) {
      console.error('Failed to load checkout data:', err);
      setError('שגיאה בטעינת פרטי התשלום');
    } finally {
      setLoading(false);
    }
  };

  const calculatePrice = () => {
    if (!plan) return { monthly: 0, total: 0, referralDiscount: 0, hasReferral: false, isUpgrade: false };
    
    // Check for referral discount (only on first subscription) and check expiry
    const referralCode = localStorage.getItem('referral_code');
    const referralExpiry = localStorage.getItem('referral_expiry');
    const isReferralExpired = referralExpiry && Date.now() >= parseInt(referralExpiry);
    
    // Clear expired referral
    if (isReferralExpired) {
      localStorage.removeItem('referral_code');
      localStorage.removeItem('referral_discount_percent');
      localStorage.removeItem('referral_expiry');
    }
    
    const referralDiscountPercent = (referralCode && !isReferralExpired) ? (parseInt(localStorage.getItem('referral_discount_percent')) || 10) : 0;
    const hasReferral = !!referralCode && !isReferralExpired && referralDiscountPercent > 0 && !currentSubscription;
    
    let basePrice = plan.price;
    let total = 0;
    
    if (billingPeriod === 'yearly') {
      // 20% off for yearly
      const yearlyDiscount = 0.8;
      total = Math.floor(basePrice * 12 * yearlyDiscount);
    } else {
      total = Math.floor(basePrice);
    }
    
    // Apply referral discount on top of other discounts (only for new subscriptions)
    // Use consistent calculation: floor(price * (1 - percent/100))
    let referralDiscount = 0;
    if (hasReferral) {
      const discountedTotal = Math.floor(total * (1 - referralDiscountPercent / 100));
      referralDiscount = total - discountedTotal;
      total = discountedTotal;
    }
    
    // Calculate proration for upgrades
    let isUpgrade = false;
    let proratedCredit = 0;
    let proratedTotal = total;
    let daysRemaining = 0;
    let currentPlanPrice = 0;
    
    if (currentSubscription && currentSubscription.status === 'active' && currentSubscription.plan_id !== plan.id) {
      isUpgrade = true;
      
      // Calculate remaining value from current subscription
      const nextCharge = currentSubscription.next_charge_date 
        ? new Date(currentSubscription.next_charge_date) 
        : new Date();
      const now = new Date();
      
      // Calculate days remaining in current period
      const currentBillingPeriod = currentSubscription.billing_period || 'monthly';
      const periodDays = currentBillingPeriod === 'yearly' ? 365 : 30;
      
      // Calculate what user paid for current period
      currentPlanPrice = parseFloat(currentSubscription.plan_price || 0);
      if (currentBillingPeriod === 'yearly') {
        currentPlanPrice = currentPlanPrice * 12 * 0.8; // Yearly price with discount
      }
      
      // Calculate days since last charge
      const lastCharge = currentSubscription.last_charge_date 
        ? new Date(currentSubscription.last_charge_date) 
        : new Date(currentSubscription.started_at);
      
      daysRemaining = Math.max(0, Math.ceil((nextCharge - now) / (1000 * 60 * 60 * 24)));
      const daysUsed = periodDays - daysRemaining;
      
      // Calculate unused credit
      const dailyRate = currentPlanPrice / periodDays;
      proratedCredit = Math.floor(dailyRate * daysRemaining);
      
      // Final price to pay = new plan price - unused credit
      proratedTotal = Math.max(0, total - proratedCredit);
    }
    
    const monthly = billingPeriod === 'yearly' ? Math.floor(total / 12) : total;
    
    return { 
      monthly, 
      total, 
      referralDiscount, 
      hasReferral, 
      referralDiscountPercent,
      originalTotal: hasReferral ? total + referralDiscount : total,
      isUpgrade,
      proratedCredit,
      proratedTotal,
      daysRemaining,
      currentPlanPrice
    };
  };

  const handleSaveCard = async () => {
    try {
      setProcessing(true);
      setError(null);
      
      // Validate form
      if (!cardForm.cardNumber || !cardForm.cardHolder || !cardForm.expiryMonth || 
          !cardForm.expiryYear || !cardForm.cvv || !cardForm.citizenId) {
        setError('נא למלא את כל השדות');
        setProcessing(false);
        return;
      }
      
      // Save payment method
      const { data } = await api.post('/payment/methods', {
        cardNumber: cardForm.cardNumber.replace(/\s/g, ''),
        cardHolderName: cardForm.cardHolder,
        expiryMonth: cardForm.expiryMonth,
        expiryYear: cardForm.expiryYear,
        cvv: cardForm.cvv,
        citizenId: cardForm.citizenId,
      });
      
      setPaymentMethod(data.paymentMethod);
      setShowCardForm(false);
      
    } catch (err) {
      console.error('Failed to save card:', err);
      setError(err.response?.data?.error || 'שגיאה בשמירת פרטי האשראי');
    } finally {
      setProcessing(false);
    }
  };

  const handleSubscribe = async () => {
    try {
      setProcessing(true);
      setError(null);
      
      if (!paymentMethod) {
        setError('נא להוסיף אמצעי תשלום');
        setProcessing(false);
        return;
      }
      
      const prices = calculatePrice();
      
      // Subscribe to plan
      const referralCode = localStorage.getItem('referral_code');
      await api.post('/payment/subscribe', {
        planId: plan.id,
        billingPeriod,
        paymentMethodId: paymentMethod.id,
        referralCode: (!currentSubscription && referralCode) ? referralCode : undefined,
        isUpgrade: prices.isUpgrade,
        proratedAmount: prices.isUpgrade ? prices.proratedTotal : undefined,
      });
      
      // Clear referral data after successful subscription (only for new users)
      if (!currentSubscription && referralCode) {
        localStorage.removeItem('referral_code');
        localStorage.removeItem('referral_banner_dismissed');
        localStorage.removeItem('referral_discount_percent');
      }
      
      setSuccess(true);
      
      // Redirect after success
      setTimeout(() => {
        navigate('/dashboard', { 
          state: { 
            message: prices.isUpgrade 
              ? 'השדרוג בוצע בהצלחה! התוכנית החדשה פעילה כעת.'
              : 'המנוי הופעל בהצלחה! ניתן כעת לחבר WhatsApp.',
            type: 'success'
          }
        });
      }, 2000);
      
    } catch (err) {
      console.error('Failed to subscribe:', err);
      setError(err.response?.data?.error || 'שגיאה בהפעלת המנוי');
    } finally {
      setProcessing(false);
    }
  };

  const formatCardNumber = (value) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    return parts.length ? parts.join(' ') : value;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center" dir="rtl">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center" dir="rtl">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 max-w-md w-full mx-4 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            התשלום בוצע בהצלחה! 🎉
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            מעביר אותך לדשבורד...
          </p>
        </div>
      </div>
    );
  }

  const prices = calculatePrice();
  const Icon = plan ? (PLAN_ICONS[plan.name] || Star) : Star;
  const isTrial = plan?.trial_days > 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900" dir="rtl">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 py-4 px-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate('/pricing')}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-gray-900"
          >
            <ArrowRight className="w-5 h-5" />
            <span>חזרה לתמחור</span>
          </button>
          <div className="flex items-center gap-2 text-gray-500">
            <Lock className="w-4 h-4" />
            <span className="text-sm">תשלום מאובטח</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid md:grid-cols-5 gap-8">
          {/* Payment Form - 3 columns */}
          <div className="md:col-span-3 space-y-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              השלמת הרכישה
            </h1>

            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            {/* Saved Card */}
            {paymentMethod && !showCardForm && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <CreditCard className="w-5 h-5" />
                  אמצעי תשלום
                </h2>
                
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-8 bg-gradient-to-r from-blue-600 to-blue-800 rounded flex items-center justify-center text-white text-xs font-bold">
                      VISA
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">
                        **** **** **** {paymentMethod.card_last_digits}
                      </div>
                      <div className="text-sm text-gray-500">
                        {paymentMethod.card_holder_name}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowCardForm(true)}
                    className="text-blue-600 hover:text-blue-700 text-sm"
                  >
                    שנה כרטיס
                  </button>
                </div>
              </div>
            )}

            {/* Card Form */}
            {showCardForm && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <CreditCard className="w-5 h-5" />
                  פרטי כרטיס אשראי
                </h2>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      מספר כרטיס
                    </label>
                    <input
                      type="text"
                      value={cardForm.cardNumber}
                      onChange={(e) => setCardForm({ ...cardForm, cardNumber: formatCardNumber(e.target.value) })}
                      placeholder="1234 5678 9012 3456"
                      maxLength={19}
                      className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      dir="ltr"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      שם בעל הכרטיס
                    </label>
                    <input
                      type="text"
                      value={cardForm.cardHolder}
                      onChange={(e) => setCardForm({ ...cardForm, cardHolder: e.target.value })}
                      placeholder="ישראל ישראלי"
                      className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        חודש
                      </label>
                      <select
                        value={cardForm.expiryMonth}
                        onChange={(e) => setCardForm({ ...cardForm, expiryMonth: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      >
                        <option value="">MM</option>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                          <option key={m} value={m.toString().padStart(2, '0')}>
                            {m.toString().padStart(2, '0')}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        שנה
                      </label>
                      <select
                        value={cardForm.expiryYear}
                        onChange={(e) => setCardForm({ ...cardForm, expiryYear: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      >
                        <option value="">YY</option>
                        {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i).map(y => (
                          <option key={y} value={y.toString().slice(-2)}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        CVV
                      </label>
                      <input
                        type="text"
                        value={cardForm.cvv}
                        onChange={(e) => setCardForm({ ...cardForm, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                        placeholder="123"
                        maxLength={4}
                        className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                        dir="ltr"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      תעודת זהות
                    </label>
                    <input
                      type="text"
                      value={cardForm.citizenId}
                      onChange={(e) => setCardForm({ ...cardForm, citizenId: e.target.value.replace(/\D/g, '').slice(0, 9) })}
                      placeholder="123456789"
                      maxLength={9}
                      className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      dir="ltr"
                    />
                  </div>
                  
                  <button
                    onClick={handleSaveCard}
                    disabled={processing}
                    className="w-full py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {processing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        שומר...
                      </>
                    ) : (
                      <>
                        <Shield className="w-5 h-5" />
                        שמור כרטיס
                      </>
                    )}
                  </button>
                  
                  {paymentMethod && (
                    <button
                      onClick={() => setShowCardForm(false)}
                      className="w-full py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800"
                    >
                      ביטול
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Subscribe Button */}
            {paymentMethod && !showCardForm && (
              <button
                onClick={handleSubscribe}
                disabled={processing}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-lg font-semibold rounded-xl hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
              >
                {processing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    מעבד תשלום...
                  </>
                ) : (
                  <>
                    <Lock className="w-5 h-5" />
                    {isTrial 
                      ? `התחל ${plan.trial_days} ימי ניסיון חינם`
                      : prices.isUpgrade
                        ? `שדרג עכשיו - ₪${prices.proratedTotal}`
                        : `שלם ₪${prices.total}`
                    }
                  </>
                )}
              </button>
            )}

            {/* Security Badges */}
            <div className="flex items-center justify-center gap-6 text-gray-400 text-sm">
              <div className="flex items-center gap-1">
                <Lock className="w-4 h-4" />
                SSL מוצפן
              </div>
              <div className="flex items-center gap-1">
                <Shield className="w-4 h-4" />
                PCI DSS
              </div>
            </div>
          </div>

          {/* Order Summary - 2 columns */}
          <div className="md:col-span-2">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 sticky top-4">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-4">
                סיכום הזמנה
              </h2>
              
              {plan && (
                <>
                  {/* Plan Card */}
                  <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700 rounded-xl mb-4">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                      <Icon className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-white">
                        {plan.name_he}
                      </div>
                      <div className="text-sm text-gray-500">
                        {billingPeriod === 'yearly' ? 'חיוב שנתי' : 'חיוב חודשי'}
                      </div>
                    </div>
                  </div>

                  {/* Price Breakdown */}
                  <div className="space-y-3 mb-4">
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>מחיר בסיס לחודש</span>
                      <span>₪{plan.price}</span>
                    </div>
                    {billingPeriod === 'yearly' && (
                      <>
                        <div className="flex justify-between text-gray-600 dark:text-gray-400">
                          <span>12 חודשים</span>
                          <span>₪{Math.floor(plan.price * 12)}</span>
                        </div>
                        <div className="flex justify-between text-green-600">
                          <span>הנחה 20% (שנתי)</span>
                          <span>-₪{Math.floor(plan.price * 12 * 0.2)}</span>
                        </div>
                      </>
                    )}
                    {prices.hasReferral && (
                      <div className="flex justify-between text-purple-600 font-medium">
                        <span className="flex items-center gap-1">
                          🎁 הנחת חבר ({prices.referralDiscountPercent}%)
                          {referralTimeLeft > 0 && (
                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-mono mr-1">
                              ⏱️ {formatTimeLeft(referralTimeLeft)}
                            </span>
                          )}
                        </span>
                        <span>-₪{prices.referralDiscount}</span>
                      </div>
                    )}
                    {prices.isUpgrade && prices.proratedCredit > 0 && (
                      <>
                        <div className="flex justify-between text-gray-600 dark:text-gray-400 border-t border-gray-100 dark:border-gray-600 pt-2 mt-2">
                          <span>מחיר תוכנית חדשה</span>
                          <span>₪{prices.total}</span>
                        </div>
                        <div className="flex justify-between text-green-600 font-medium">
                          <span className="flex items-center gap-1">
                            ✨ זיכוי מתוכנית נוכחית ({prices.daysRemaining} ימים)
                          </span>
                          <span>-₪{prices.proratedCredit}</span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Trial Notice */}
                  {isTrial && (
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl mb-4">
                      <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                        <Check className="w-4 h-4" />
                        <span className="font-medium">{plan.trial_days} ימי ניסיון חינם</span>
                      </div>
                      <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                        לא תחויב עד לתום תקופת הניסיון
                      </p>
                    </div>
                  )}

                  {/* Total */}
                  <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {isTrial ? 'לאחר הניסיון' : prices.isUpgrade ? 'לתשלום כעת' : 'סה״כ לתשלום'}
                      </span>
                      <span className="text-2xl font-bold text-gray-900 dark:text-white">
                        ₪{prices.isUpgrade ? prices.proratedTotal : prices.total}
                        {!prices.isUpgrade && (
                          <span className="text-sm font-normal text-gray-500">
                            /{billingPeriod === 'yearly' ? 'שנה' : 'חודש'}
                          </span>
                        )}
                      </span>
                    </div>
                    {isTrial && (
                      <p className="text-sm text-gray-500 mt-1">
                        היום: ₪0
                      </p>
                    )}
                    {prices.isUpgrade && (
                      <p className="text-sm text-gray-500 mt-2">
                        החל מהחידוש הבא: ₪{prices.total}/{billingPeriod === 'yearly' ? 'שנה' : 'חודש'}
                      </p>
                    )}
                  </div>

                  {/* Features */}
                  <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                      כלול בתוכנית:
                    </h3>
                    <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-green-500" />
                        {plan.max_bots === -1 ? 'בוטים ללא הגבלה' : `עד ${plan.max_bots} בוטים`}
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-green-500" />
                        {plan.max_contacts === -1 ? 'אנשי קשר ללא הגבלה' : `עד ${plan.max_contacts.toLocaleString()} אנשי קשר`}
                      </li>
                      {plan.allow_waha_creation && (
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-green-500" />
                          WhatsApp מנוהל
                        </li>
                      )}
                    </ul>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
