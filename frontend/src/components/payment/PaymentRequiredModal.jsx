import { useState } from 'react';
import { X, CreditCard, Shield, Check, Lock, Sparkles, AlertCircle } from 'lucide-react';
import CreditCardForm from './CreditCardForm';

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
  ]
}) {
  const [success, setSuccess] = useState(false);

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
        className="bg-white rounded-3xl w-full max-w-md max-h-[90vh] overflow-auto shadow-2xl"
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
