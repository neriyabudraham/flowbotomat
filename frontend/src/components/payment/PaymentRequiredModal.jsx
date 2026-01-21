import { useState } from 'react';
import { X, CreditCard, Shield, Check } from 'lucide-react';
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md max-h-[90vh] overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <CreditCard className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {success ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                הכרטיס נשמר בהצלחה!
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                ממשיכים...
              </p>
            </div>
          ) : (
            <>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {description}
              </p>

              {/* Features */}
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 mb-6 space-y-2">
                {features.map((feature, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Shield className="w-4 h-4 text-green-500" />
                    <span className="text-gray-700 dark:text-gray-300">{feature}</span>
                  </div>
                ))}
              </div>

              {/* Form */}
              <CreditCardForm 
                onSuccess={handleSuccess}
                onCancel={onClose}
                submitText="שמור והמשך"
                description="הפרטים מאובטחים ולא ישמרו אצלנו. לא תחויב כעת."
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
