import { useState, useEffect } from 'react';
import { X, CreditCard, Shield, Check, Lock, Sparkles, AlertCircle, Gift, Tag } from 'lucide-react';
import CreditCardForm from './CreditCardForm';
import api from '../../services/api';

export default function PaymentRequiredModal({ 
  isOpen, 
  onClose, 
  onSuccess,
  title = 'נדרש אמצעי תשלום',
  description = 'על מנת להמשיך, נדרש להזין פרטי כרטיס אשראי. לא תחויב כעת.',
  features = [
    'ללא חיוב מיידי',
    'ביטול בכל עת',
    'מאובטח ומוגן',
  ],
  showPriceInfo = true
}) {
  const [success, setSuccess] = useState(false);
  const [priceInfo, setPriceInfo] = useState(null);

  // Fetch price info when modal opens
  useEffect(() => {
    if (isOpen && showPriceInfo) {
      fetchPriceInfo();
    }
  }, [isOpen, showPriceInfo]);

  const fetchPriceInfo = async () => {
    try {
      // Get basic plan price
      const { data: plansData } = await api.get('/subscriptions/plans');
      const basicPlan = plansData.find(p => p.name === 'Basic') || plansData[0];
      
      // Get active promotions
      const { data: promos } = await api.get('/payment/promotions/active');
      const promo = promos.find(p => p.plan_id === basicPlan?.id);
      
      // Check if user came via referral
      const referralCode = localStorage.getItem('referral_code');
      
      let firstMonthPrice = parseFloat(basicPlan?.price || 79);
      let regularPrice = firstMonthPrice;
      let hasDiscount = false;
      let discountNote = null;
      
      if (promo) {
        firstMonthPrice = parseFloat(promo.promo_price);
        hasDiscount = true;
        discountNote = `מבצע: ${promo.duration_months} חודשים ב-₪${promo.promo_price}/חודש`;
      }
      
      if (referralCode) {
        // Show referral discount note
        discountNote = discountNote 
          ? `${discountNote} + בונוס הפניה`
          : 'בונוס הפניה פעיל';
        hasDiscount = true;
      }
      
      setPriceInfo({
        firstMonthPrice,
        regularPrice,
        hasDiscount,
        discountNote,
        planName: basicPlan?.name_he || 'תוכנית בסיסית',
        trialDays: basicPlan?.trial_days || 14
      });
    } catch (err) {
      console.error('Failed to fetch price info:', err);
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
                הכרטיס נשמר בהצלחה!
              </h3>
              <p className="text-gray-500">
                ממשיכים...
              </p>
            </div>
          ) : (
            <>
              {/* Info Alert */}
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-blue-800">
                    {description}
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
              {showPriceInfo && priceInfo && (
                <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-2xl p-5 mb-6 border border-purple-200">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Tag className="w-5 h-5 text-purple-600" />
                    מה יקרה אחרי תקופת הניסיון?
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">תקופת ניסיון:</span>
                      <span className="font-bold text-purple-700">{priceInfo.trialDays} ימים בחינם</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">לאחר תקופת הניסיון:</span>
                      <span className="font-bold text-gray-900">₪{priceInfo.firstMonthPrice}/חודש</span>
                    </div>
                    {priceInfo.hasDiscount && priceInfo.discountNote && (
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-purple-200">
                        <Gift className="w-4 h-4 text-green-600" />
                        <span className="text-green-700 text-xs">{priceInfo.discountNote}</span>
                      </div>
                    )}
                    {priceInfo.firstMonthPrice !== priceInfo.regularPrice && (
                      <p className="text-xs text-gray-500 mt-2">
                        * לאחר תקופת המבצע: ₪{priceInfo.regularPrice}/חודש
                      </p>
                    )}
                  </div>
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
