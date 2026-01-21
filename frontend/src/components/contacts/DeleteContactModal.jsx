import { useState } from 'react';
import { X, Trash2, AlertTriangle, UserMinus, MessageSquare, Clock } from 'lucide-react';

export default function DeleteContactModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  contactName, 
  contactCount = 1,
  isLoading = false 
}) {
  const [confirmed, setConfirmed] = useState(false);
  
  if (!isOpen) return null;
  
  const isBulk = contactCount > 1;
  const title = isBulk 
    ? `מחיקת ${contactCount} אנשי קשר` 
    : `מחיקת ${contactName || 'איש קשר'}`;

  const handleConfirm = () => {
    if (!confirmed) return;
    onConfirm();
  };

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-red-500 via-rose-500 to-pink-500 p-6 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />
          
          <button 
            onClick={onClose}
            className="absolute top-4 left-4 p-2 hover:bg-white/20 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="relative flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center">
              {isBulk ? (
                <UserMinus className="w-8 h-8" />
              ) : (
                <Trash2 className="w-8 h-8" />
              )}
            </div>
            <div>
              <h2 className="text-2xl font-bold">{title}</h2>
              <p className="text-white/70">פעולה זו לא ניתנת לביטול</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Warning */}
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-800 mb-1">שים לב!</p>
                <p className="text-red-700 text-sm">
                  {isBulk 
                    ? `אתה עומד למחוק ${contactCount} אנשי קשר. פעולה זו תמחק את כל המידע הקשור אליהם.`
                    : `אתה עומד למחוק את ${contactName || 'איש הקשר הזה'}. פעולה זו תמחק את כל המידע הקשור אליו.`
                  }
                </p>
              </div>
            </div>
          </div>

          {/* What will be deleted */}
          <div className="bg-gray-50 rounded-2xl p-4 mb-6">
            <h3 className="font-semibold text-gray-900 mb-3">מה יימחק?</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-gray-700">
                <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                  <UserMinus className="w-4 h-4 text-red-600" />
                </div>
                <span className="text-sm">פרטי איש הקשר והמשתנים</span>
              </div>
              <div className="flex items-center gap-3 text-gray-700">
                <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-red-600" />
                </div>
                <span className="text-sm">כל היסטוריית ההודעות</span>
              </div>
              <div className="flex items-center gap-3 text-gray-700">
                <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-red-600" />
                </div>
                <span className="text-sm">נתוני אינטראקציה עם בוטים</span>
              </div>
            </div>
          </div>

          {/* Confirmation Checkbox */}
          <label className={`flex items-center gap-3 cursor-pointer p-4 rounded-xl border-2 transition-all mb-6 ${
            confirmed 
              ? 'border-red-300 bg-red-50' 
              : 'border-gray-200 hover:border-gray-300'
          }`}>
            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all ${
              confirmed ? 'bg-red-500 border-red-500' : 'border-gray-300'
            }`}>
              {confirmed && (
                <svg className="w-4 h-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="hidden"
            />
            <span className="text-sm text-gray-700">
              אני מבין/ה שהפעולה לא ניתנת לביטול ורוצה למחוק
            </span>
          </label>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3.5 px-6 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-all"
            >
              ביטול
            </button>
            <button
              onClick={handleConfirm}
              disabled={!confirmed || isLoading}
              className={`flex-1 py-3.5 px-6 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                confirmed && !isLoading
                  ? 'bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white shadow-lg shadow-red-500/25'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Trash2 className="w-5 h-5" />
                  מחק
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
