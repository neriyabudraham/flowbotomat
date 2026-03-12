import { useState, useEffect } from 'react';
import { X, CreditCard, Shield, Check, Lock, AlertCircle, Sparkles } from 'lucide-react';
import CreditCardForm from './CreditCardForm';
import api from '../../services/api';

function PlanCard({ name, price, isSelected, onClick, isFree, trialDays }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-4 rounded-2xl border-2 text-right transition-all w-full ${
        isSelected
          ? 'border-purple-500 bg-purple-50 shadow-sm'
          : 'border-gray-200 hover:border-purple-300 bg-white'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center mt-0.5 ${
          isSelected ? 'border-purple-500 bg-purple-500' : 'border-gray-300'
        }`}>
          {isSelected && <Check className="w-3 h-3 text-white" />}
        </div>
        <div className="text-right flex-1 mr-2">
          <div className="font-bold text-gray-900 text-sm">{name}</div>
          <div className={`text-lg font-bold mt-1 ${isFree ? 'text-green-600' : 'text-gray-800'}`}>
            {isFree ? 'חינם' : `₪${price}`}
          </div>
          {!isFree && <div className="text-xs text-gray-500">לחודש</div>}
          {trialDays > 0 && !isFree && (
            <div className="text-xs text-purple-600 mt-1 font-medium">{trialDays} ימי ניסיון</div>
          )}
        </div>
      </div>
    </button>
  );
}

export default function PaymentRequiredModal({
  isOpen,
  onClose,
  onSuccess,
  title = 'נדרש אמצעי תשלום',
  showPriceInfo = true,
  features, // kept for backward compat, not displayed
}) {
  const [success, setSuccess] = useState(false);
  const [allPlans, setAllPlans] = useState([]);
  const [freePlan, setFreePlan] = useState(null);
  const [selectedPlanId, setSelectedPlanId] = useState(null); // null = free plan (default)
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [customDiscount, setCustomDiscount] = useState(null);

  useEffect(() => {
    if (isOpen) {
      fetchPlans();
    }
  }, [isOpen]);

  const fetchPlans = async () => {
    setLoadingPlans(true);
    try {
      // Check for custom discount on existing subscription
      try {
        const { data: subData } = await api.get('/subscriptions/my');
        const sub = subData?.subscription;
        if (sub && (sub.custom_discount_mode || sub.referral_discount_percent || sub.custom_fixed_price)) {
          const discount = {
            mode: sub.custom_discount_mode || 'percent',
            percent: sub.referral_discount_percent,
            fixedPrice: sub.custom_fixed_price,
            planId: sub.custom_discount_plan_id || sub.plan_id,
          };
          setCustomDiscount(discount);
          if (discount.planId) {
            setSelectedPlanId(discount.planId);
          }
        }
      } catch (e) {
        // No subscription yet
      }

      const { data } = await api.get('/subscriptions/plans');
      const plansData = Array.isArray(data) ? data : (data.plans || []);

      const free = plansData.find(p => parseFloat(p.price) === 0);
      const paid = plansData.filter(p => parseFloat(p.price) > 0);

      setFreePlan(free);
      setAllPlans(paid);
    } catch (err) {
      console.error('[PaymentModal] Failed to fetch plans:', err);
    } finally {
      setLoadingPlans(false);
    }
  };

  if (!isOpen) return null;

  const selectedPlan = selectedPlanId ? allPlans.find(p => p.id === selectedPlanId) : null;

  const getDiscountedPrice = (plan) => {
    if (!plan) return 0;
    let price = parseFloat(plan.price || 0);
    if (customDiscount?.mode === 'fixed_price' && customDiscount.fixedPrice) {
      return parseFloat(customDiscount.fixedPrice);
    }
    if (customDiscount?.mode === 'percent' && customDiscount.percent > 0) {
      return Math.floor(price * (1 - customDiscount.percent / 100));
    }
    const referralPercent = parseInt(localStorage.getItem('referral_discount_percent') || '0');
    if (referralPercent > 0) {
      return Math.floor(price * (1 - referralPercent / 100));
    }
    return price;
  };

  const handleSuccess = (paymentMethod) => {
    setSuccess(true);
    setTimeout(() => {
      onSuccess?.(paymentMethod);
    }, 1500);
  };

  const submitText = selectedPlan
    ? `שמור ועבור לתוכנית ${selectedPlan.name_he || selectedPlan.name}`
    : 'שמור כרטיס';

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="bg-white rounded-3xl w-full max-w-2xl max-h-[95vh] overflow-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-7 text-white rounded-t-3xl relative">
          <button
            onClick={onClose}
            className="absolute top-4 left-4 p-2 hover:bg-white/20 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center flex-shrink-0">
              <CreditCard className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">{title}</h2>
              <p className="text-white/80 text-sm mt-1">בחר תוכנית והוסף אמצעי תשלום להמשך</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {success ? (
            <div className="text-center py-10">
              <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <Check className="w-10 h-10 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">מעולה! אפשר להמשיך 🎉</h3>
              <p className="text-gray-500">הכרטיס נשמר בהצלחה. ממשיכים...</p>
            </div>
          ) : (
            <>
              {/* Plan Selector */}
              {showPriceInfo && (
                <div>
                  <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2 text-base">
                    <Sparkles className="w-5 h-5 text-purple-600" />
                    בחר תוכנית
                  </h3>
                  {loadingPlans ? (
                    <div className="grid grid-cols-3 gap-3">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {/* Free Plan (always first) */}
                      <PlanCard
                        name={freePlan?.name_he || 'חינם'}
                        price={0}
                        isSelected={!selectedPlanId}
                        onClick={() => setSelectedPlanId(null)}
                        isFree={true}
                      />
                      {/* Paid Plans */}
                      {allPlans.map(plan => (
                        <PlanCard
                          key={plan.id}
                          name={plan.name_he || plan.name}
                          price={getDiscountedPrice(plan)}
                          isSelected={selectedPlanId === plan.id}
                          onClick={() => setSelectedPlanId(plan.id)}
                          trialDays={plan.trial_days || 0}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Info Box */}
              <div className={`rounded-2xl p-4 border flex items-start gap-3 ${
                selectedPlan ? 'bg-purple-50 border-purple-200' : 'bg-green-50 border-green-200'
              }`}>
                <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${selectedPlan ? 'text-purple-600' : 'text-green-600'}`} />
                <p className={`text-sm ${selectedPlan ? 'text-purple-800' : 'text-green-800'}`}>
                  {selectedPlan ? (
                    selectedPlan.trial_days > 0
                      ? `הכרטיס ישמר ותתחיל תקופת ניסיון של ${selectedPlan.trial_days} ימים בחינם לתוכנית "${selectedPlan.name_he}". לא תחויב עכשיו.`
                      : `הכרטיס ישמר ותחויב מיידית ₪${getDiscountedPrice(selectedPlan)}/חודש עבור תוכנית "${selectedPlan.name_he}".`
                  ) : (
                    'הכרטיס ישמר לאימות בלבד. לא תחויב כלל. ניתן לשדרג לתוכנית בתשלום בכל עת.'
                  )}
                </p>
              </div>

              {/* Price Summary for paid plan */}
              {selectedPlan && (
                <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-2xl p-4 border border-purple-200">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">תוכנית:</span>
                      <span className="font-bold text-gray-900">{selectedPlan.name_he || selectedPlan.name}</span>
                    </div>
                    {selectedPlan.trial_days > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">ניסיון חינם:</span>
                        <span className="font-bold text-green-600">{selectedPlan.trial_days} ימים</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">{selectedPlan.trial_days > 0 ? 'חיוב לאחר הניסיון:' : 'חיוב מיידי:'}</span>
                      <span className="font-bold text-gray-900">₪{getDiscountedPrice(selectedPlan)}/חודש</span>
                    </div>
                    <div className="pt-2 border-t border-purple-200 text-xs text-gray-500">
                      ניתן לבטל בכל עת
                    </div>
                  </div>
                </div>
              )}

              {/* Card Form */}
              <div>
                <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2 text-base">
                  <CreditCard className="w-5 h-5 text-blue-600" />
                  פרטי כרטיס אשראי
                </h3>
                <CreditCardForm
                  onSuccess={handleSuccess}
                  onCancel={onClose}
                  planId={selectedPlanId}
                  submitText={submitText}
                  description=""
                />
              </div>

              {/* Security Footer */}
              <div className="flex items-center justify-center gap-6 text-gray-400 text-xs pt-2 border-t border-gray-100">
                <div className="flex items-center gap-1.5">
                  <Lock className="w-4 h-4" />
                  SSL מוצפן
                </div>
                <div className="flex items-center gap-1.5">
                  <Shield className="w-4 h-4" />
                  PCI DSS
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
