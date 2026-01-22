import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Check, X, Star, Zap, Crown, Building, ArrowLeft, CreditCard, Lock, Loader2, 
  Shield, AlertCircle, Sparkles, Users, Bot, MessageSquare, BarChart3,
  Rocket, Gift, Timer, ChevronDown, ArrowRight, CheckCircle, Phone, Code,
  RotateCcw, Clock, Info
} from 'lucide-react';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import Logo from '../components/atoms/Logo';

const PLAN_ICONS = {
  'Free': Star,
  'Basic': Zap,
  'Pro': Crown,
  'Enterprise': Building,
};

const PLAN_GRADIENTS = {
  'Free': 'from-gray-500 to-slate-600',
  'Basic': 'from-blue-500 to-cyan-500',
  'Pro': 'from-purple-500 to-pink-500',
  'Enterprise': 'from-amber-500 to-orange-500',
};

const PLAN_BG = {
  'Free': 'from-gray-50 to-slate-50',
  'Basic': 'from-blue-50 to-cyan-50',
  'Pro': 'from-purple-50 to-pink-50',
  'Enterprise': 'from-amber-50 to-orange-50',
};

export default function PricingPage() {
  const navigate = useNavigate();
  const { user, fetchMe } = useAuthStore();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [billingPeriod, setBillingPeriod] = useState('monthly');
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showReactivateModal, setShowReactivateModal] = useState(false);
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState(null);
  
  const isAuthenticated = !!user;

  useEffect(() => {
    const init = async () => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        await fetchMe();
        await loadCurrentSubscription();
      }
      await loadPlans();
    };
    init();
  }, []);

  const loadCurrentSubscription = async () => {
    try {
      const { data } = await api.get('/subscriptions/my');
      setCurrentSubscription(data.subscription);
      
      // Also load payment method
      const paymentData = await api.get('/payment/methods');
      if (paymentData.data.paymentMethods?.length > 0) {
        setPaymentMethod(paymentData.data.paymentMethods[0]);
      }
    } catch (err) {
      console.error('Failed to load subscription:', err);
    }
  };

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
    
    // If selecting free plan while having a paid subscription - show cancel modal
    if (parseFloat(plan.price) === 0 && currentSubscription) {
      setShowCancelModal(true);
      return;
    }
    
    // Check if this is the same plan as cancelled subscription (reactivate)
    if (currentSubscription?.status === 'cancelled' && 
        currentSubscription?.plan_id === plan.id &&
        hasTimeRemaining) {
      setShowReactivateModal(true);
      return;
    }
    
    setSelectedPlan(plan);
    setShowCheckoutModal(true);
  };
  
  // Check if cancelled subscription has time remaining
  const endDateRaw = currentSubscription?.is_trial 
    ? currentSubscription?.trial_ends_at 
    : (currentSubscription?.expires_at || currentSubscription?.next_charge_date);
  const endDate = endDateRaw ? new Date(endDateRaw) : null;
  const now = new Date();
  const daysLeft = endDate ? Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)) : 0;
  const hasTimeRemaining = endDate && daysLeft > 0;
  const isCancelledWithTime = currentSubscription?.status === 'cancelled' && hasTimeRemaining;

  const handleCancelSubscription = async () => {
    try {
      await api.post('/payment/cancel');
      setShowCancelModal(false);
      navigate('/dashboard', { state: { message: 'המנוי בוטל בהצלחה', type: 'success' } });
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בביטול המנוי');
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const openPlanId = params.get('openPlan');
    if (openPlanId && isAuthenticated && plans.length > 0) {
      const plan = plans.find(p => p.id === openPlanId);
      if (plan) {
        setSelectedPlan(plan);
        setShowCheckoutModal(true);
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-500">טוען תכניות...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50" dir="rtl">
      {/* Premium Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => navigate(isAuthenticated ? '/dashboard' : '/')}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="h-8 w-px bg-gray-200" />
              <Logo />
            </div>
            
            <div className="flex items-center gap-3">
              {isAuthenticated ? (
                <>
                  <span className="text-gray-600 hidden sm:block">שלום, {user?.name || 'משתמש'}</span>
                  <button
                    onClick={() => navigate('/dashboard')}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-xl font-medium hover:shadow-lg transition-all"
                  >
                    <ArrowRight className="w-4 h-4" />
                    לדשבורד
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => navigate('/login')}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
                  >
                    התחברות
                  </button>
                  <button
                    onClick={() => navigate('/signup')}
                    className="px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-xl font-medium hover:shadow-lg transition-all"
                  >
                    הרשמה חינם
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 px-6">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-600/5 via-transparent to-blue-600/5" />
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-purple-300/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-blue-300/20 rounded-full blur-3xl" />
        
        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-full text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" />
            בחר את התכנית המושלמת לעסק שלך
          </div>
          
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6">
            תמחור פשוט ושקוף
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-blue-600">
              בלי הפתעות
            </span>
          </h1>
          
          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-10">
            התחל בחינם ושדרג בכל עת. כל התכניות כוללות גישה מלאה לכל הפיצ'רים הבסיסיים, תמיכה וקהילה.
          </p>

          {/* Billing Toggle */}
          <div className="inline-flex items-center gap-4 p-1.5 bg-white rounded-2xl shadow-lg border border-gray-100">
            <button
              onClick={() => setBillingPeriod('monthly')}
              className={`px-6 py-2.5 rounded-xl font-medium transition-all ${
                billingPeriod === 'monthly' 
                  ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-md'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              חודשי
            </button>
            <button
              onClick={() => setBillingPeriod('yearly')}
              className={`px-6 py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 ${
                billingPeriod === 'yearly' 
                  ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-md'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              שנתי
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                billingPeriod === 'yearly' ? 'bg-white/20 text-white' : 'bg-green-100 text-green-700'
              }`}>
                חסוך 20%
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Plans Grid */}
      <section className="pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          {plans.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">אין תכניות זמינות כרגע</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {plans.map((plan, index) => {
                const Icon = PLAN_ICONS[plan.name] || Star;
                const gradient = PLAN_GRADIENTS[plan.name] || 'from-gray-500 to-slate-600';
                const bgGradient = PLAN_BG[plan.name] || 'from-gray-50 to-slate-50';
                const isPopular = plan.name === 'Pro';
                const isCurrentPlan = currentSubscription?.plan_id === plan.id;
                const currentPlanPrice = plans.find(p => p.id === currentSubscription?.plan_id)?.price || 0;
                const isDowngrade = parseFloat(plan.price) < parseFloat(currentPlanPrice);
                const isFree = parseFloat(plan.price) === 0;
                
                const yearlyMonthly = Math.floor(plan.price * 0.8);
                const yearlyTotal = Math.floor(plan.price * 12 * 0.8);
                const monthlyPrice = Math.floor(parseFloat(plan.price));
                const displayPrice = billingPeriod === 'yearly' ? yearlyMonthly : monthlyPrice;

                return (
                  <div
                    key={plan.id}
                    className={`relative bg-white rounded-3xl overflow-hidden transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 ${
                      isPopular ? 'ring-2 ring-purple-500 shadow-xl scale-[1.02]' : 'shadow-lg'
                    }`}
                  >
                    {isPopular && (
                      <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm py-2 text-center font-medium">
                        ⭐ הכי פופולרי
                      </div>
                    )}
                    
                    <div className={`p-6 ${isPopular ? 'pt-12' : ''}`}>
                      {/* Plan Header */}
                      <div className="flex items-center gap-3 mb-6">
                        <div className={`p-3 bg-gradient-to-br ${gradient} rounded-2xl shadow-lg`}>
                          <Icon className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900 text-lg">{plan.name_he}</h3>
                          <p className="text-sm text-gray-500">{plan.name}</p>
                        </div>
                      </div>

                      {/* Price */}
                      <div className="mb-6">
                        <div className="flex items-baseline gap-1">
                          <span className="text-5xl font-bold text-gray-900">
                            ₪{displayPrice}
                          </span>
                          <span className="text-gray-500 text-lg">/חודש</span>
                        </div>
                        {billingPeriod === 'yearly' && !isFree && (
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-gray-400 line-through text-sm">₪{monthlyPrice * 12}/שנה</span>
                            <span className="text-green-600 text-sm font-medium">₪{yearlyTotal}/שנה</span>
                          </div>
                        )}
                        {plan.trial_days > 0 && (
                          <div className="mt-3 flex items-center gap-2 text-purple-600">
                            <Gift className="w-4 h-4" />
                            <span className="text-sm font-medium">{plan.trial_days} ימי ניסיון חינם</span>
                          </div>
                        )}
                      </div>

                      {/* Description */}
                      <p className="text-gray-600 text-sm mb-6 min-h-[40px]">
                        {plan.description_he}
                      </p>

                      {/* CTA Button */}
                      {(() => {
                        const isCurrentPlanCancelled = isCurrentPlan && currentSubscription?.status === 'cancelled' && hasTimeRemaining;
                        
                        // Current plan that is CANCELLED but still has time - show reactivate option
                        if (isCurrentPlanCancelled) {
                          return (
                            <button
                              onClick={() => handleSelectPlan(plan)}
                              className="w-full py-3.5 rounded-xl font-medium transition-all bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:shadow-lg hover:scale-[1.02] flex items-center justify-center gap-2"
                            >
                              <RotateCcw className="w-5 h-5" />
                              חדש מנוי
                            </button>
                          );
                        }
                        
                        // Current plan (active) - not clickable
                        if (isCurrentPlan && currentSubscription?.status !== 'cancelled') {
                          return (
                            <div className="w-full py-3.5 rounded-xl font-medium text-center bg-green-100 text-green-700 flex items-center justify-center gap-2 cursor-default">
                              <CheckCircle className="w-5 h-5" />
                              התוכנית הנוכחית
                            </div>
                          );
                        }
                        
                        // Free plan for users without paid subscription - show as current (not clickable)
                        if (isFree && isAuthenticated && !currentSubscription) {
                          return (
                            <div className="w-full py-3.5 rounded-xl font-medium text-center bg-green-100 text-green-700 flex items-center justify-center gap-2 cursor-default">
                              <CheckCircle className="w-5 h-5" />
                              התוכנית הנוכחית
                            </div>
                          );
                        }
                        
                        // Free plan for users WITH paid subscription - downgrade/cancel
                        if (isFree && isAuthenticated && currentSubscription) {
                          return (
                            <button
                              onClick={() => handleSelectPlan(plan)}
                              className="w-full py-3.5 rounded-xl font-medium transition-all bg-amber-100 text-amber-700 hover:bg-amber-200"
                            >
                              שנמך
                            </button>
                          );
                        }
                        
                        // Regular plans
                        return (
                          <button
                            onClick={() => handleSelectPlan(plan)}
                            className={`w-full py-3.5 rounded-xl font-medium transition-all ${
                              isPopular
                                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:shadow-lg hover:scale-[1.02]'
                                : `bg-gradient-to-r ${gradient} text-white hover:shadow-lg hover:scale-[1.02]`
                            }`}
                          >
                            {!isAuthenticated ? 'התחל עכשיו' : isDowngrade ? 'שנמך' : 'בחר תכנית'}
                          </button>
                        );
                      })()}

                      {/* Features */}
                      <div className="mt-8 pt-6 border-t border-gray-100 space-y-4">
                        <Feature 
                          icon={Bot}
                          label={`${getFeatureValue(plan, 'bots')} בוטים`}
                          included={true}
                          highlight={plan.max_bots === -1}
                        />
                        <Feature 
                          icon={Zap}
                          label={`${getFeatureValue(plan, 'runs')} הרצות פלואו/חודש`}
                          included={true}
                          highlight={plan.max_bot_runs_per_month === -1}
                        />
                        <Feature 
                          icon={Users}
                          label={`${getFeatureValue(plan, 'contacts')} אנשי קשר`}
                          included={true}
                          highlight={plan.max_contacts === -1}
                        />
                        <Feature 
                          icon={BarChart3}
                          label="סטטיסטיקות מתקדמות"
                          included={plan.allow_statistics}
                        />
                        <Feature 
                          icon={Phone}
                          label="WhatsApp מנוהל"
                          included={plan.allow_waha_creation}
                        />
                        <Feature 
                          icon={Rocket}
                          label="ייצוא ושכפול בוטים"
                          included={plan.allow_export}
                        />
                        <Feature 
                          icon={Code}
                          label="גישת API"
                          included={plan.allow_api_access}
                        />
                        <Feature 
                          icon={Shield}
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

      {/* Trust Badges */}
      <section className="py-12 px-6 bg-white border-y border-gray-100">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-wrap items-center justify-center gap-8 text-gray-500">
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5" />
              <span>תשלום מאובטח SSL</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              <span>תקן PCI DSS</span>
            </div>
            <div className="flex items-center gap-2">
              <Timer className="w-5 h-5" />
              <span>ביטול בכל עת</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              <span>ללא התחייבות</span>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              שאלות נפוצות
            </h2>
            <p className="text-gray-600">
              לא מצאת תשובה? צור איתנו קשר
            </p>
          </div>
          
          <div className="space-y-4">
            <FAQ 
              question="האם אני יכול לבטל בכל עת?"
              answer="כן, תוכל לבטל את המנוי בכל עת מדף ההגדרות. תמשיך ליהנות מהשירות עד סוף תקופת החיוב הנוכחית."
            />
            <FAQ 
              question="מה קורה אחרי תקופת הניסיון?"
              answer="אחרי תקופת הניסיון, תחויב אוטומטית לפי התכנית שבחרת. תקבל תזכורת במייל יום לפני סיום הניסיון."
            />
            <FAQ 
              question="האם אפשר לשדרג או לשנמך תכנית?"
              answer="בהחלט! תוכל לשנות תכנית בכל עת מדף ההגדרות. השינוי ייכנס לתוקף מיידית והחיוב יתעדכן בהתאם."
            />
            <FAQ 
              question="מה אם אגיע למגבלת הריצות?"
              answer="תקבל התראה כשתתקרב למגבלה. תוכל לשדרג את התכנית או לחכות לחודש הבא כשהמכסה מתאפסת. כל פעם שהפלואו שלך מופעל, זה נחשב כריצה אחת."
            />
            <FAQ 
              question="האם יש תמיכה טכנית?"
              answer="כן! כל התכניות כוללות תמיכה בסיסית. תכניות Pro ו-Enterprise כוללות תמיכה מועדפת עם זמני תגובה מהירים יותר."
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6 bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            מוכן להתחיל?
          </h2>
          <p className="text-xl text-white/80 mb-8">
            הצטרף לאלפי עסקים שכבר משתמשים ב-FlowBotomat
          </p>
          <button
            onClick={() => isAuthenticated ? navigate('/dashboard') : navigate('/signup')}
            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-purple-600 rounded-xl font-bold text-lg hover:shadow-xl transition-all hover:scale-105"
          >
            <Rocket className="w-5 h-5" />
            {isAuthenticated ? 'לדשבורד' : 'התחל בחינם עכשיו'}
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 bg-white border-t border-gray-100">
        <div className="max-w-7xl mx-auto text-center text-gray-500">
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

      {/* Cancel Subscription Modal */}
      {showCancelModal && (
        <CancelSubscriptionModal
          subscription={currentSubscription}
          onClose={() => setShowCancelModal(false)}
          onConfirm={handleCancelSubscription}
        />
      )}

      {/* Reactivate Subscription Modal */}
      {showReactivateModal && (
        <ReactivateSubscriptionModal
          subscription={currentSubscription}
          paymentMethod={paymentMethod}
          daysLeft={daysLeft}
          onClose={() => setShowReactivateModal(false)}
          onSuccess={() => {
            setShowReactivateModal(false);
            navigate('/dashboard', { 
              state: { 
                message: 'המנוי חודש בהצלחה!',
                type: 'success'
              }
            });
          }}
          onNeedPayment={() => {
            setShowReactivateModal(false);
            // Find current plan and open checkout
            const plan = plans.find(p => p.id === currentSubscription?.plan_id);
            if (plan) {
              setSelectedPlan(plan);
              setShowCheckoutModal(true);
            }
          }}
        />
      )}
    </div>
  );
}

function Feature({ icon: Icon, label, included, highlight }) {
  return (
    <div className="flex items-center gap-3">
      {included ? (
        <div className={`p-1 rounded-lg ${highlight ? 'bg-green-100' : 'bg-gray-100'}`}>
          <Check className={`w-4 h-4 ${highlight ? 'text-green-600' : 'text-green-500'}`} />
        </div>
      ) : (
        <div className="p-1 rounded-lg bg-gray-50">
          <X className="w-4 h-4 text-gray-300" />
        </div>
      )}
      <span className={`text-sm ${included ? (highlight ? 'text-gray-900 font-medium' : 'text-gray-700') : 'text-gray-400'}`}>
        {label}
      </span>
    </div>
  );
}

function CancelSubscriptionModal({ subscription, onClose, onConfirm }) {
  const [confirmed, setConfirmed] = useState(false);
  const [processing, setProcessing] = useState(false);

  const handleCancel = async () => {
    setProcessing(true);
    await onConfirm();
    setProcessing(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 p-8 text-center text-white">
          <div className="w-20 h-20 bg-white/20 backdrop-blur rounded-full flex items-center justify-center mx-auto mb-4">
            <Crown className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold mb-2">אנחנו מצטערים שאתם הולכים 😢</h2>
          <p className="text-white/80">האם אתה בטוח שברצונך לבטל את המנוי?</p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* What happens after cancellation */}
          <div className="bg-gray-50 rounded-2xl p-5">
            <h3 className="font-bold text-gray-900 mb-4 text-center">מה קורה אחרי הביטול?</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-1 bg-green-100 rounded-full">
                  <Check className="w-4 h-4 text-green-600" />
                </div>
                <span className="text-gray-700">המנוי שלך יישאר פעיל עד <span className="font-semibold text-blue-600">סוף תקופת החיוב</span></span>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-1 bg-green-100 rounded-full">
                  <Check className="w-4 h-4 text-green-600" />
                </div>
                <span className="text-gray-700">לא תחויב יותר באופן אוטומטי</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-1 bg-amber-100 rounded-full">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                </div>
                <span className="text-gray-700">לאחר התאריך, תאבד גישה לפיצ'רים מתקדמים</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-1 bg-green-100 rounded-full">
                  <Check className="w-4 h-4 text-green-600" />
                </div>
                <span className="text-gray-700">תוכל לחדש את המנוי בכל עת</span>
              </div>
            </div>
          </div>

          {/* Confirmation checkbox */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
            />
            <span className="text-gray-700">אני מבין/ה ורוצה לבטל את המנוי</span>
          </label>

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleCancel}
              disabled={!confirmed || processing}
              className="flex-1 py-3.5 border-2 border-gray-200 rounded-xl font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {processing ? 'מבטל...' : 'בטל מנוי'}
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-3.5 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-xl font-bold hover:shadow-lg transition-all flex items-center justify-center gap-2"
            >
              להישאר במנוי! 🎉
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FAQ({ question, answer }) {
  const [open, setOpen] = useState(false);
  
  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-6 py-5 text-right flex items-center justify-between"
      >
        <span className="font-semibold text-gray-900">{question}</span>
        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-6 pb-5 text-gray-600 -mt-2">
          {answer}
        </div>
      )}
    </div>
  );
}

function ReactivateSubscriptionModal({ subscription, paymentMethod, daysLeft, onClose, onSuccess, onNeedPayment }) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);

  const handleReactivate = async () => {
    // Check if we have a payment method
    if (!paymentMethod) {
      onNeedPayment();
      return;
    }

    setProcessing(true);
    setError(null);
    
    try {
      await api.post('/payment/reactivate');
      onSuccess();
    } catch (err) {
      const errorData = err.response?.data;
      if (errorData?.needsPaymentMethod) {
        onNeedPayment();
      } else if (errorData?.needsNewSubscription) {
        setError('תקופת המנוי הסתיימה. יש להירשם מחדש.');
      } else {
        setError(errorData?.error || 'שגיאה בחידוש המנוי');
      }
    } finally {
      setProcessing(false);
    }
  };

  const planName = subscription?.plan_name_he || subscription?.plan_name || 'המנוי';
  const endDate = subscription?.expires_at || subscription?.trial_ends_at || subscription?.next_charge_date;
  const formattedEndDate = endDate 
    ? new Date(endDate).toLocaleDateString('he-IL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-8 text-center text-white">
          <div className="w-20 h-20 bg-white/20 backdrop-blur rounded-full flex items-center justify-center mx-auto mb-4">
            <RotateCcw className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold mb-2">חידוש מנוי</h2>
          <p className="text-white/90">{planName}</p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Current status */}
          <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200">
            <div className="flex items-center gap-3 mb-3">
              <Clock className="w-5 h-5 text-amber-600" />
              <span className="font-semibold text-amber-800">מצב נוכחי: מבוטל</span>
            </div>
            <p className="text-amber-700 text-sm">
              {daysLeft === 0 
                ? 'המנוי מסתיים היום!'
                : daysLeft === 1 
                  ? 'המנוי מסתיים מחר!'
                  : `נותרו ${daysLeft} ימים עד סיום השירות`
              }
              {formattedEndDate && <span className="block mt-1 text-amber-600">({formattedEndDate})</span>}
            </p>
          </div>

          {/* What happens when you reactivate */}
          <div className="bg-green-50 rounded-2xl p-5 border border-green-200">
            <h3 className="font-bold text-green-800 mb-3 flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              מה קורה כשמחדשים?
            </h3>
            <div className="space-y-2 text-sm text-green-700">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600" />
                <span>החיוב האוטומטי יופעל מחדש</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600" />
                <span>המנוי ימשיך ללא הפסקה</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600" />
                <span>כל הבוטים שלך ימשיכו לפעול</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600" />
                <span>תחויב בתאריך החיוב הבא</span>
              </div>
            </div>
          </div>

          {/* Payment method info */}
          {paymentMethod ? (
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-14 h-10 bg-gradient-to-r from-blue-600 to-blue-800 rounded-lg flex items-center justify-center text-white text-xs font-bold">
                  CARD
                </div>
                <div>
                  <div className="font-medium text-gray-900">
                    **** **** **** {paymentMethod.card_last_digits}
                  </div>
                  <div className="text-sm text-gray-500">{paymentMethod.card_holder_name}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-yellow-50 rounded-2xl border border-yellow-200">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600" />
                <div>
                  <div className="font-medium text-yellow-800">לא נמצא אמצעי תשלום</div>
                  <div className="text-sm text-yellow-600">יש להוסיף כרטיס אשראי לחידוש המנוי</div>
                </div>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3.5 border-2 border-gray-200 rounded-xl font-medium text-gray-600 hover:bg-gray-50 transition-all"
            >
              ביטול
            </button>
            <button
              onClick={handleReactivate}
              disabled={processing}
              className="flex-1 py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {processing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  מחדש...
                </>
              ) : paymentMethod ? (
                <>
                  <RotateCcw className="w-5 h-5" />
                  חדש מנוי
                </>
              ) : (
                <>
                  <CreditCard className="w-5 h-5" />
                  הוסף אשראי
                </>
              )}
            </button>
          </div>
        </div>
      </div>
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
  const gradient = PLAN_GRADIENTS[plan.name] || 'from-gray-500 to-slate-600';
  const isTrial = plan.trial_days > 0;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className={`bg-gradient-to-r ${gradient} p-6 text-white`}>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/20 backdrop-blur rounded-2xl">
              <Icon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{plan.name_he}</h2>
              <p className="text-white/80 text-sm">
                {billingPeriod === 'yearly' ? 'חיוב שנתי' : 'חיוב חודשי'}
              </p>
            </div>
            <div className="mr-auto text-left">
              <div className="text-3xl font-bold">₪{prices.monthly}</div>
              <div className="text-white/80 text-sm">/חודש</div>
            </div>
          </div>
          {isTrial && (
            <div className="mt-4 p-3 bg-white/20 backdrop-blur rounded-xl text-center flex items-center justify-center gap-2">
              <Gift className="w-5 h-5" />
              <span>{plan.trial_days} ימי ניסיון חינם - לא תחויב היום</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
            </div>
          ) : showCardForm ? (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-purple-600" />
                פרטי כרטיס אשראי
              </h3>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">מספר כרטיס</label>
                <input
                  type="text"
                  value={cardForm.cardNumber}
                  onChange={(e) => setCardForm({ ...cardForm, cardNumber: formatCardNumber(e.target.value) })}
                  placeholder="1234 5678 9012 3456"
                  maxLength={19}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition-all"
                  dir="ltr"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">שם בעל הכרטיס</label>
                <input
                  type="text"
                  value={cardForm.cardHolder}
                  onChange={(e) => setCardForm({ ...cardForm, cardHolder: e.target.value })}
                  placeholder="ישראל ישראלי"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition-all"
                />
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">חודש</label>
                  <select
                    value={cardForm.expiryMonth}
                    onChange={(e) => setCardForm({ ...cardForm, expiryMonth: e.target.value })}
                    className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition-all"
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
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">שנה</label>
                  <select
                    value={cardForm.expiryYear}
                    onChange={(e) => setCardForm({ ...cardForm, expiryYear: e.target.value })}
                    className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition-all"
                  >
                    <option value="">YY</option>
                    {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i).map(y => (
                      <option key={y} value={y.toString().slice(-2)}>{y}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">CVV</label>
                  <input
                    type="text"
                    value={cardForm.cvv}
                    onChange={(e) => setCardForm({ ...cardForm, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                    placeholder="123"
                    maxLength={4}
                    className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition-all"
                    dir="ltr"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">תעודת זהות</label>
                <input
                  type="text"
                  value={cardForm.citizenId}
                  onChange={(e) => setCardForm({ ...cardForm, citizenId: e.target.value.replace(/\D/g, '').slice(0, 9) })}
                  placeholder="123456789"
                  maxLength={9}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition-all"
                  dir="ltr"
                />
              </div>

              <button
                onClick={handleSaveCard}
                disabled={processing}
                className={`w-full py-3.5 bg-gradient-to-r ${gradient} text-white rounded-xl hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 font-medium transition-all`}
              >
                {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shield className="w-5 h-5" />}
                {processing ? 'שומר...' : 'שמור והמשך'}
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-10 bg-gradient-to-r from-blue-600 to-blue-800 rounded-lg flex items-center justify-center text-white text-xs font-bold">
                      CARD
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">
                        **** **** **** {paymentMethod?.card_last_digits}
                      </div>
                      <div className="text-sm text-gray-500">{paymentMethod?.card_holder_name}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowCardForm(true)}
                    className="text-purple-600 hover:text-purple-700 text-sm font-medium"
                  >
                    שנה
                  </button>
                </div>
              </div>

              <button
                onClick={handleSubscribe}
                disabled={processing}
                className={`w-full py-4 bg-gradient-to-r ${gradient} text-white rounded-xl hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 font-bold text-lg transition-all`}
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
          <div className="flex items-center justify-center gap-6 text-gray-400 text-xs pt-2">
            <div className="flex items-center gap-1.5">
              <Lock className="w-4 h-4" />
              SSL מוצפן
            </div>
            <div className="flex items-center gap-1.5">
              <Shield className="w-4 h-4" />
              PCI DSS
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full py-3 text-gray-500 hover:text-gray-700 font-medium"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
