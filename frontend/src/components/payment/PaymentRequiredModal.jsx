import { useState, useEffect } from 'react';
import { X, CreditCard, Shield, Check, Lock, Sparkles, AlertCircle, Gift, Tag } from 'lucide-react';
import CreditCardForm from './CreditCardForm';
import api from '../../services/api';

export default function PaymentRequiredModal({ 
  isOpen, 
  onClose, 
  onSuccess,
  title = 'נדרש אמצעי תשלום',
  features = [
    'ללא חיוב מיידי',
    'ביטול בכל עת',
    'מאובטח ומוגן',
  ],
  showPriceInfo = true
}) {
  const [success, setSuccess] = useState(false);
  const [priceInfo, setPriceInfo] = useState(null);
  const [loadingPrice, setLoadingPrice] = useState(true);

  // Fetch price info when modal opens
  useEffect(() => {
    if (isOpen && showPriceInfo) {
      fetchPriceInfo();
    }
  }, [isOpen, showPriceInfo]);

  const fetchPriceInfo = async () => {
    setLoadingPrice(true);
    try {
      // First check if user has a custom discount from admin
      let customDiscount = null;
      try {
        const { data: subData } = await api.get('/subscriptions/my');
        const sub = subData?.subscription;
        if (sub && (sub.custom_discount_mode || sub.referral_discount_percent || sub.custom_fixed_price)) {
          customDiscount = {
            mode: sub.custom_discount_mode || 'percent',
            percent: sub.referral_discount_percent,
            fixedPrice: sub.custom_fixed_price,
            type: sub.referral_discount_type,
            monthsRemaining: sub.referral_months_remaining,
            planId: sub.custom_discount_plan_id || sub.plan_id,
            planName: sub.plan_name_he || sub.plan_name,
            planPrice: parseFloat(sub.plan_price || 0),
            trialDays: sub.trial_days || 14,
            skipTrial: sub.skip_trial || false
          };
        }
      } catch (e) {
        console.log('No subscription found');
      }

      // Get plans data
      const { data } = await api.get('/subscriptions/plans');
      console.log('[PaymentModal] Plans response:', data);
      const plansData = Array.isArray(data) ? data : (data.plans || []);
      
      // If user has custom discount, use that plan
      if (customDiscount && customDiscount.planId) {
        const discountPlan = plansData.find(p => p.id === customDiscount.planId);
        if (discountPlan) {
          const originalPrice = parseFloat(discountPlan.price || 0);
          const finalPrice = customDiscount.mode === 'fixed_price'
            ? parseFloat(customDiscount.fixedPrice || 0)
            : Math.round(originalPrice * (1 - (customDiscount.percent || 0) / 100));
          
          const getDiscountDuration = () => {
            switch (customDiscount.type) {
              case 'forever': return 'לתמיד';
              case 'first_year': return 'ל-12 חודשים הראשונים';
              case 'custom_months': 
                return customDiscount.monthsRemaining > 1 ? `ל-${customDiscount.monthsRemaining} חודשים הראשונים` : 'לחודש הראשון';
              default: return 'לחודש הראשון';
            }
          };
          
          setPriceInfo({
            firstMonthPrice: finalPrice,
            regularPrice: originalPrice,
            hasDiscount: finalPrice !== originalPrice,
            discountNote: customDiscount.mode === 'fixed_price'
              ? finalPrice === 0 ? 'חינם!' : `מחיר מיוחד ${getDiscountDuration()}`
              : `${customDiscount.percent}% הנחה ${getDiscountDuration()}`,
            referralDiscount: originalPrice - finalPrice,
            referralDiscountPercent: customDiscount.percent || 0,
            referralDiscountType: customDiscount.type,
            referralDiscountMonths: customDiscount.monthsRemaining,
            planName: discountPlan.name_he || discountPlan.name,
            trialDays: customDiscount.skipTrial ? 0 : (discountPlan.trial_days || 14),
            skipTrial: customDiscount.skipTrial,
            isCustomDiscount: true
          });
          setLoadingPrice(false);
          return;
        }
      }
      
      // Fall back to Basic plan
      const basicPlan = plansData.find(p => p.name === 'Basic') || plansData.filter(p => parseFloat(p.price) > 0).sort((a, b) => parseFloat(a.price) - parseFloat(b.price))[0];
      
      console.log('[PaymentModal] Basic plan:', basicPlan);
      
      if (!basicPlan) {
        console.log('No Basic plan found, using defaults');
        setPriceInfo({
          firstMonthPrice: 0,
          regularPrice: 0,
          hasDiscount: false,
          discountNote: null,
          referralDiscount: 0,
          referralDiscountPercent: 0,
          planName: 'Basic',
          trialDays: 14
        });
        return;
      }
      
      // Get active promotions
      let promo = null;
      try {
        const { data: promos } = await api.get('/payment/promotions/active');
        promo = promos?.find(p => p.plan_id === basicPlan?.id);
      } catch (e) {
        console.log('No promotions found');
      }
      
      // Check if user came via referral and get discount percentage
      const referralCode = localStorage.getItem('referral_code');
      const referralDiscountPercent = parseInt(localStorage.getItem('referral_discount_percent') || '0');
      const referralDiscountType = localStorage.getItem('referral_discount_type') || 'first_payment';
      const referralDiscountMonths = parseInt(localStorage.getItem('referral_discount_months') || '0');
      
      // Get discount duration text
      const getDiscountDuration = () => {
        switch (referralDiscountType) {
          case 'forever': return 'לתמיד';
          case 'first_year': return 'ל-12 חודשים הראשונים';
          case 'custom_months': 
            return referralDiscountMonths > 1 ? `ל-${referralDiscountMonths} חודשים הראשונים` : 'לחודש הראשון';
          default: return 'לחודש הראשון';
        }
      };
      
      let regularPrice = parseFloat(basicPlan?.price || 0);
      let firstMonthPrice = regularPrice;
      let hasDiscount = false;
      let discountNote = null;
      let referralDiscount = 0;
      
      if (promo) {
        firstMonthPrice = parseFloat(promo.promo_price);
        hasDiscount = true;
        discountNote = `מבצע: ${promo.duration_months} חודשים ב-₪${promo.promo_price}/חודש`;
      }
      
      if (referralCode && referralDiscountPercent > 0) {
        // Apply referral discount
        referralDiscount = Math.round(firstMonthPrice * referralDiscountPercent / 100);
        const discountedPrice = firstMonthPrice - referralDiscount;
        const durationText = getDiscountDuration();
        hasDiscount = true;
        discountNote = discountNote 
          ? `${discountNote} + ${referralDiscountPercent}% הנחת הפניה ${durationText}`
          : `${referralDiscountPercent}% הנחת הפניה ${durationText} (₪${discountedPrice} במקום ₪${firstMonthPrice})`;
        firstMonthPrice = discountedPrice;
      }
      
      setPriceInfo({
        firstMonthPrice,
        regularPrice,
        hasDiscount,
        discountNote,
        referralDiscount,
        referralDiscountPercent,
        referralDiscountType,
        referralDiscountMonths,
        planName: basicPlan?.name_he || basicPlan?.name || 'Basic',
        trialDays: basicPlan?.trial_days || 14
      });
    } catch (err) {
      console.error('Failed to fetch price info:', err);
      // Set default values on error
      setPriceInfo({
        firstMonthPrice: 0,
        regularPrice: 0,
        hasDiscount: false,
        discountNote: null,
        referralDiscount: 0,
        referralDiscountPercent: 0,
        planName: 'Basic',
        trialDays: 14
      });
    } finally {
      setLoadingPrice(false);
    }
  };

  if (!isOpen) return null;

  const handleSuccess = (paymentMethod) => {
    setSuccess(true);
    setTimeout(() => {
      onSuccess?.(paymentMethod);
    }, 1500);
  };

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" 
      onClick={onClose}
      dir="rtl"
    >
      <div 
        className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] overflow-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-6 text-white rounded-t-3xl">
          <button 
            onClick={onClose}
            className="absolute top-4 left-4 p-2 hover:bg-white/20 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center">
              <CreditCard className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{title}</h2>
              <p className="text-white/70 text-sm">הוסף אמצעי תשלום להמשך</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {success ? (
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <Check className="w-10 h-10 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                מעולה! אפשר להמשיך 🎉
              </h3>
              <p className="text-gray-500">
                הכרטיס נשמר ומנוי הניסיון הופעל. ממשיכים...
              </p>
            </div>
          ) : (
            <>
              {/* Info Alert */}
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-blue-800">
                    {priceInfo ? 
                      priceInfo.skipTrial 
                        ? `הזן פרטי כרטיס אשראי לתשלום מיידי. המנוי ${priceInfo.planName} יתחיל מיד.`
                        : `הזן פרטי כרטיס אשראי כדי להתחיל ${priceInfo.trialDays} ימי ניסיון בחינם. לא תחויב עכשיו - לאחר תקופת הניסיון יתחיל המנוי ${priceInfo.planName}.`
                      : 'הזן פרטי כרטיס אשראי כדי להתחיל 14 ימי ניסיון בחינם.'
                    }
                  </p>
                </div>
              </div>

              {/* Features */}
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-5 mb-6 border border-green-200">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-green-600" />
                  למה זה בטוח?
                </h3>
                <div className="space-y-3">
                  {features.map((feature, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-green-600" />
                      </div>
                      <span className="text-gray-700">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Price Info */}
              {showPriceInfo && (
                <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-2xl p-5 mb-6 border border-purple-200">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Tag className="w-5 h-5 text-purple-600" />
                    מה יקרה אחרי תקופת הניסיון?
                  </h3>
                  {loadingPrice ? (
                    <div className="animate-pulse space-y-2">
                      <div className="h-4 bg-purple-200 rounded w-3/4"></div>
                      <div className="h-4 bg-purple-200 rounded w-1/2"></div>
                    </div>
                  ) : priceInfo ? (
                    <div className="space-y-2 text-sm">
                      {!priceInfo.skipTrial && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">תקופת ניסיון:</span>
                          <span className="font-bold text-purple-700">{priceInfo.trialDays} ימים בחינם</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">תוכנית:</span>
                        <span className="font-bold text-gray-900">{priceInfo.planName}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">{priceInfo.skipTrial ? 'חיוב מיידי:' : 'חיוב לאחר הניסיון:'}</span>
                        <div className="text-left">
                          {priceInfo.referralDiscount > 0 ? (
                            <>
                              <span className="font-bold text-green-600">₪{priceInfo.firstMonthPrice}/חודש</span>
                              <span className="text-gray-400 line-through text-xs mr-2">₪{priceInfo.regularPrice}</span>
                            </>
                          ) : (
                            <span className="font-bold text-gray-900">₪{priceInfo.regularPrice}/חודש</span>
                          )}
                        </div>
                      </div>
                      {priceInfo.hasDiscount && priceInfo.discountNote && (
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-purple-200 bg-green-50 rounded-lg p-2 -mx-2">
                          <Gift className="w-4 h-4 text-green-600 flex-shrink-0" />
                          <span className="text-green-700 text-xs font-medium">{priceInfo.discountNote}</span>
                        </div>
                      )}
                      {priceInfo.referralDiscount > 0 && priceInfo.referralDiscountType !== 'forever' && (
                        <p className="text-xs text-gray-500 mt-2">
                          * {priceInfo.referralDiscountType === 'first_year' 
                              ? 'החל מהחודש ה-13' 
                              : priceInfo.referralDiscountType === 'custom_months' && priceInfo.referralDiscountMonths > 1
                                ? `החל מהחודש ה-${priceInfo.referralDiscountMonths + 1}`
                                : 'החל מהחודש השני'}: ₪{priceInfo.regularPrice}/חודש
                        </p>
                      )}
                      <div className="mt-3 pt-3 border-t border-purple-200 text-xs text-gray-500">
                        {priceInfo.skipTrial 
                          ? 'ניתן לבטל בכל עת. החיוב יתבצע מיד עם הזנת פרטי האשראי.'
                          : 'ניתן לבטל בכל עת לפני סיום תקופת הניסיון ולא תחויב כלל'
                        }
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-600">לאחר 14 ימי ניסיון יתחיל חיוב חודשי לפי תוכנית Basic</p>
                  )}
                </div>
              )}

              {/* Form */}
              <CreditCardForm 
                onSuccess={handleSuccess}
                onCancel={onClose}
                submitText="שמור והמשך"
                description=""
              />

              {/* Security Note */}
              <div className="flex items-center justify-center gap-4 text-gray-400 text-xs mt-4 pt-4 border-t border-gray-100">
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
