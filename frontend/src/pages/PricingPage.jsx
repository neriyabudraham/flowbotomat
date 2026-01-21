import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X, Star, Zap, Crown, Building, ArrowRight } from 'lucide-react';
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
  const { user, isAuthenticated } = useAuthStore();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [billingPeriod, setBillingPeriod] = useState('monthly');

  useEffect(() => {
    loadPlans();
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

  const handleSelectPlan = (plan) => {
    if (!isAuthenticated) {
      navigate('/register', { state: { selectedPlan: plan.id } });
    } else {
      navigate('/settings', { state: { tab: 'subscription', selectedPlan: plan.id } });
    }
  };

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
      <header className="py-6 px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div 
            className="text-2xl font-bold text-blue-600 cursor-pointer"
            onClick={() => navigate('/')}
          >
            FlowBotomat
          </div>
          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <button
                onClick={() => navigate('/dashboard')}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-800"
              >
                <span>לדשבורד</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <>
                <button
                  onClick={() => navigate('/login')}
                  className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-800"
                >
                  התחברות
                </button>
                <button
                  onClick={() => navigate('/register')}
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
