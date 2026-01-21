import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X, Star, Zap, Crown, Building, ArrowRight, CreditCard, Lock, Loader2, Shield, AlertCircle } from 'lucide-react';
import api from '../services/api';
import useAuthStore from '../store/authStore';

const PLAN_ICONS = {
  'Free': Star,
  'Basic': Zap,
  'Pro': Crown,
  'Enterprise': Building,
};

const PLAN_COLORS = {
  'Free': 'gray',
  'Basic': 'blue',
  'Pro': 'purple',
  'Enterprise': 'amber',
};

export default function PricingPage() {
  const navigate = useNavigate();
  const { user, fetchMe } = useAuthStore();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [billingPeriod, setBillingPeriod] = useState('monthly');
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  
  // Check if user is authenticated
  const isAuthenticated = !!user;

  useEffect(() => {
    const init = async () => {
      // Try to load user if token exists
      const token = localStorage.getItem('accessToken');
      if (token) {
        await fetchMe();
      }
      await loadPlans();
    };
    init();
  }, []);

  const loadPlans = async () => {
    try {
      const { data } = await api.get('/subscriptions/plans');
      setPlans(data.plans || []);
    } catch (err) {
      console.error('Failed to load plans:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPlan = async (plan) => {
    if (!isAuthenticated) {
      navigate('/login', { state: { returnTo: `/pricing?openPlan=${plan.id}` } });
      return;
    }
    
    // If plan is free (0 price), activate it directly without checkout
    if (parseFloat(plan.price) === 0) {
      try {
        await api.post('/payment/subscribe', { planId: plan.id, billingPeriod: 'monthly' });
        navigate('/dashboard', { state: { message: 'המנוי החינמי הופעל בהצלחה!', type: 'success' } });
      } catch (err) {
        alert(err.response?.data?.error || 'שגיאה בהפעלת המנוי');
      }
      return;
    }
    
    setSelectedPlan(plan);
    setShowCheckoutModal(true);
  };

  // Check if we should open a plan modal from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const openPlanId = params.get('openPlan');
    if (openPlanId && isAuthenticated && plans.length > 0) {
      const plan = plans.find(p => p.id === openPlanId);
      if (plan) {
        setSelectedPlan(plan);
        setShowCheckoutModal(true);
        // Clean URL
        window.history.replaceState({}, '', '/pricing');
      }
    }
  }, [isAuthenticated, plans]);

  const getFeatureValue = (plan, feature) => {
    switch (feature) {
      case 'bots':
        return plan.max_bots === -1 ? 'ללא הגבלה' : plan.max_bots;
      case 'runs':
        return plan.max_bot_runs_per_month === -1 ? 'ללא הגבלה' : plan.max_bot_runs_per_month.toLocaleString();
      case 'contacts':
        return plan.max_contacts === -1 ? 'ללא הגבלה' : plan.max_contacts.toLocaleString();
      default:
        return plan[feature];
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800" dir="rtl">
      {/* Header */}
      <header className="py-6 px-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm sticky top-0 z-10 border-b border-gray-100 dark:border-gray-700">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div 
            className="text-2xl font-bold text-blue-600 cursor-pointer"
            onClick={() => navigate(isAuthenticated ? '/dashboard' : '/')}
          >
            FlowBotomat
          </div>
          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <div className="flex items-center gap-4">
                <span className="text-gray-600 dark:text-gray-300 hidden sm:block">
                  שלום, {user?.name || 'משתמש'}
                </span>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>לדשבורד</span>
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => navigate('/login')}
                  className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-800"
                >
                  התחברות
                </button>
                <button
                  onClick={() => navigate('/signup')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700"
                >
                  הרשמה חינם
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-16 px-4 text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
          בחר את התכנית המתאימה לך
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
          התחל בחינם ושדרג בכל עת. כל התכניות כוללות גישה לכל הפיצ'רים הבסיסיים.
        </p>

        {/* Billing Toggle */}
        <div className="flex items-center justify-center gap-4 mt-8">
          <span className={`text-sm ${billingPeriod === 'monthly' ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-500'}`}>
            חודשי
          </span>
          <button
            onClick={() => setBillingPeriod(billingPeriod === 'monthly' ? 'yearly' : 'monthly')}
            className={`relative w-14 h-7 rounded-full transition-colors ${
              billingPeriod === 'yearly' ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              billingPeriod === 'yearly' ? 'right-1' : 'left-1'
            }`} />
          </button>
          <span className={`text-sm flex items-center gap-1 ${billingPeriod === 'yearly' ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-500'}`}>
            שנתי
            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
              חסוך 20%
            </span>
          </span>
        </div>
      </section>

      {/* Plans Grid */}
      <section className="pb-20 px-4">
        <div className="max-w-7xl mx-auto">
          {plans.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">אין תכניות זמינות כרגע</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {plans.map((plan, index) => {
                const Icon = PLAN_ICONS[plan.name] || Star;
                const color = PLAN_COLORS[plan.name] || 'gray';
                const isPopular = plan.name === 'Pro';
                // Calculate prices - floor to avoid cents
                const yearlyTotal = Math.floor(plan.price * 12 * 0.8);
                const yearlyMonthly = Math.floor(plan.price * 0.8);
                const monthlyTotal = Math.floor(plan.price * 12);
                const monthlyMonthly = Math.floor(parseFloat(plan.price));
                
                const displayMonthlyPrice = billingPeriod === 'yearly' ? yearlyMonthly : monthlyMonthly;
                const displayTotalPrice = billingPeriod === 'yearly' ? yearlyTotal : monthlyTotal;

                return (
                  <div
                    key={plan.id}
                    className={`relative bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden ${
                      isPopular ? 'ring-2 ring-purple-500 scale-105' : ''
                    }`}
                  >
                    {isPopular && (
                      <div className="absolute top-0 left-0 right-0 bg-purple-500 text-white text-sm py-1 text-center">
                        הכי פופולרי
                      </div>
                    )}
                    
                    <div className={`p-6 ${isPopular ? 'pt-10' : ''}`}>
                      {/* Plan Header */}
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`p-2 bg-${color}-100 dark:bg-${color}-900/30 rounded-xl`}>
                          <Icon className={`w-6 h-6 text-${color}-600`} />
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900 dark:text-white">{plan.name_he}</h3>
                          <p className="text-sm text-gray-500">{plan.name}</p>
                        </div>
                      </div>

                      {/* Price */}
                      <div className="mb-6">
                        <div className="flex items-baseline gap-1">
                          <span className="text-4xl font-bold text-gray-900 dark:text-white">
                            ₪{displayMonthlyPrice}
                          </span>
                          <span className="text-gray-500">/חודש</span>
                        </div>
                        {billingPeriod === 'yearly' && (
                          <p className="text-sm text-gray-500 mt-1">
                            ₪{displayTotalPrice} לשנה
                          </p>
                        )}
                        {plan.trial_days > 0 && (
                          <p className="text-sm text-green-600 mt-1">
                            {plan.trial_days} ימי ניסיון חינם
                          </p>
                        )}
                      </div>

                      {/* Description */}
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                        {plan.description_he}
                      </p>

                      {/* CTA Button */}
                      <button
                        onClick={() => handleSelectPlan(plan)}
                        className={`w-full py-3 rounded-xl font-medium transition-colors ${
                          isPopular
                            ? 'bg-purple-600 text-white hover:bg-purple-700'
                            : plan.price === 0
                            ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        {plan.price === 0 ? 'התחל בחינם' : 'בחר תכנית'}
                      </button>

                      {/* Features */}
                      <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700 space-y-3">
                        <Feature 
                          label={`${getFeatureValue(plan, 'bots')} בוטים`}
                          included={true}
                        />
                        <Feature 
                          label={`${getFeatureValue(plan, 'runs')} ריצות/חודש`}
                          included={true}
                        />
                        <Feature 
                          label={`${getFeatureValue(plan, 'contacts')} אנשי קשר`}
                          included={true}
                        />
                        <Feature 
                          label="סטטיסטיקות מתקדמות"
                          included={plan.allow_statistics}
                        />
                        <Feature 
                          label="WhatsApp מנוהל"
                          included={plan.allow_waha_creation}
                        />
                        <Feature 
                          label="ייצוא ושכפול בוטים"
                          included={plan.allow_export}
                        />
                        <Feature 
                          label="תמיכה מועדפת"
                          included={plan.priority_support}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-4 bg-white dark:bg-gray-800">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-12">
            שאלות נפוצות
          </h2>
          
          <div className="space-y-6">
            <FAQ 
              question="האם אני יכול לבטל בכל עת?"
              answer="כן, תוכל לבטל את המנוי בכל עת. תמשיך ליהנות מהשירות עד סוף תקופת החיוב הנוכחית."
            />
            <FAQ 
              question="מה קורה אחרי תקופת הניסיון?"
              answer="אחרי תקופת הניסיון, תחויב אוטומטית לפי התכנית שבחרת. תקבל תזכורת יום לפני."
            />
            <FAQ 
              question="האם אפשר לשדרג או לשנמך תכנית?"
              answer="בהחלט! תוכל לשנות תכנית בכל עת. השינוי ייכנס לתוקף מיידית."
            />
            <FAQ 
              question="מה אם אגיע למגבלת השימוש?"
              answer="תקבל התראה כשתתקרב למגבלה. תוכל לשדרג או לחכות לחודש הבא."
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto text-center text-gray-600 dark:text-gray-400">
          <p>© 2026 FlowBotomat. כל הזכויות שמורות.</p>
        </div>
      </footer>

      {/* Checkout Modal */}
      {showCheckoutModal && selectedPlan && (
        <CheckoutModal 
          plan={selectedPlan}
          billingPeriod={billingPeriod}
          onClose={() => {
            setShowCheckoutModal(false);
            setSelectedPlan(null);
          }}
          onSuccess={() => {
            setShowCheckoutModal(false);
            navigate('/dashboard', { 
              state: { 
                message: 'המנוי הופעל בהצלחה!',
                type: 'success'
              }
            });
          }}
        />
      )}
    </div>
  );
}

function Feature({ label, included }) {
  return (
    <div className="flex items-center gap-2">
      {included ? (
        <Check className="w-4 h-4 text-green-500" />
      ) : (
        <X className="w-4 h-4 text-gray-300" />
      )}
      <span className={included ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400'}>
        {label}
      </span>
    </div>
  );
}

function FAQ({ question, answer }) {
  const [open, setOpen] = useState(false);
  
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-6 py-4 text-right flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50"
      >
        <span className="font-medium text-gray-900 dark:text-white">{question}</span>
        <span className={`transform transition-transform ${open ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>
      {open && (
        <div className="px-6 pb-4 text-gray-600 dark:text-gray-400">
          {answer}
        </div>
      )}
    </div>
  );
}

function CheckoutModal({ plan, billingPeriod, onClose, onSuccess }) {
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [showCardForm, setShowCardForm] = useState(false);
  const [cardForm, setCardForm] = useState({
    cardNumber: '',
    cardHolder: '',
    expiryMonth: '',
    expiryYear: '',
    cvv: '',
    citizenId: '',
  });

  useEffect(() => {
    loadPaymentMethod();
  }, []);

  const loadPaymentMethod = async () => {
    try {
      const { data } = await api.get('/payment/methods');
      if (data.paymentMethods?.length > 0) {
        setPaymentMethod(data.paymentMethods[0]);
      } else {
        setShowCardForm(true);
      }
    } catch (err) {
      console.error('Failed to load payment method:', err);
      setShowCardForm(true);
    } finally {
      setLoading(false);
    }
  };

  const calculatePrice = () => {
    if (billingPeriod === 'yearly') {
      const yearlyTotal = Math.floor(plan.price * 12 * 0.8);
      const yearlyMonthly = Math.floor(plan.price * 0.8);
      return { monthly: yearlyMonthly, total: yearlyTotal };
    }
    return { monthly: Math.floor(plan.price), total: Math.floor(plan.price) };
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

  const handleSaveCard = async () => {
    try {
      setProcessing(true);
      setError(null);
      
      if (!cardForm.cardNumber || !cardForm.cardHolder || !cardForm.expiryMonth || 
          !cardForm.expiryYear || !cardForm.cvv || !cardForm.citizenId) {
        setError('נא למלא את כל השדות');
        setProcessing(false);
        return;
      }
      
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
      setError(err.response?.data?.error || 'שגיאה בשמירת פרטי האשראי');
    } finally {
      setProcessing(false);
    }
  };

  const handleSubscribe = async () => {
    try {
      setProcessing(true);
      setError(null);
      
      await api.post('/payment/subscribe', {
        planId: plan.id,
        billingPeriod,
        paymentMethodId: paymentMethod?.id,
      });
      
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בהפעלת המנוי');
    } finally {
      setProcessing(false);
    }
  };

  const prices = calculatePrice();
  const Icon = PLAN_ICONS[plan.name] || Star;
  const isTrial = plan.trial_days > 0;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white dark:bg-gray-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/20 rounded-xl">
              <Icon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{plan.name_he}</h2>
              <p className="text-white/80 text-sm">
                {billingPeriod === 'yearly' ? 'חיוב שנתי' : 'חיוב חודשי'}
              </p>
            </div>
            <div className="mr-auto text-left">
              <div className="text-2xl font-bold">₪{prices.monthly}</div>
              <div className="text-white/80 text-sm">/חודש</div>
            </div>
          </div>
          {isTrial && (
            <div className="mt-4 p-2 bg-white/20 rounded-lg text-center text-sm">
              ✨ {plan.trial_days} ימי ניסיון חינם - לא תחויב היום
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-2 text-red-700 dark:text-red-300">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : showCardForm ? (
            /* Card Form */
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                פרטי כרטיס אשראי
              </h3>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">מספר כרטיס</label>
                <input
                  type="text"
                  value={cardForm.cardNumber}
                  onChange={(e) => setCardForm({ ...cardForm, cardNumber: formatCardNumber(e.target.value) })}
                  placeholder="1234 5678 9012 3456"
                  maxLength={19}
                  className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  dir="ltr"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">שם בעל הכרטיס</label>
                <input
                  type="text"
                  value={cardForm.cardHolder}
                  onChange={(e) => setCardForm({ ...cardForm, cardHolder: e.target.value })}
                  placeholder="ישראל ישראלי"
                  className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                />
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">חודש</label>
                  <select
                    value={cardForm.expiryMonth}
                    onChange={(e) => setCardForm({ ...cardForm, expiryMonth: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">שנה</label>
                  <select
                    value={cardForm.expiryYear}
                    onChange={(e) => setCardForm({ ...cardForm, expiryYear: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="">YY</option>
                    {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i).map(y => (
                      <option key={y} value={y.toString().slice(-2)}>{y}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">CVV</label>
                  <input
                    type="text"
                    value={cardForm.cvv}
                    onChange={(e) => setCardForm({ ...cardForm, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                    placeholder="123"
                    maxLength={4}
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    dir="ltr"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">תעודת זהות</label>
                <input
                  type="text"
                  value={cardForm.citizenId}
                  onChange={(e) => setCardForm({ ...cardForm, citizenId: e.target.value.replace(/\D/g, '').slice(0, 9) })}
                  placeholder="123456789"
                  maxLength={9}
                  className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  dir="ltr"
                />
              </div>

              <button
                onClick={handleSaveCard}
                disabled={processing}
                className="w-full py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium"
              >
                {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shield className="w-5 h-5" />}
                {processing ? 'שומר...' : 'שמור והמשך'}
              </button>
            </div>
          ) : (
            /* Payment Method Display */
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-8 bg-gradient-to-r from-blue-600 to-blue-800 rounded flex items-center justify-center text-white text-xs font-bold">
                      VISA
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">
                        **** **** **** {paymentMethod?.card_last_digits}
                      </div>
                      <div className="text-sm text-gray-500">{paymentMethod?.card_holder_name}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowCardForm(true)}
                    className="text-blue-600 hover:text-blue-700 text-sm"
                  >
                    שנה
                  </button>
                </div>
              </div>

              <button
                onClick={handleSubscribe}
                disabled={processing}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 font-bold text-lg"
              >
                {processing ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Lock className="w-5 h-5" />
                )}
                {processing ? 'מעבד...' : isTrial ? `התחל ${plan.trial_days} ימי ניסיון חינם` : `שלם ₪${prices.total}`}
              </button>
            </div>
          )}

          {/* Security Note */}
          <div className="flex items-center justify-center gap-4 text-gray-400 text-xs pt-2">
            <div className="flex items-center gap-1">
              <Lock className="w-3 h-3" />
              SSL מוצפן
            </div>
            <div className="flex items-center gap-1">
              <Shield className="w-3 h-3" />
              PCI DSS
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full py-2 text-gray-500 hover:text-gray-700 text-sm"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
