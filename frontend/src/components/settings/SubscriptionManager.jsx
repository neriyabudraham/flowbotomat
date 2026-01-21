import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Calendar, AlertCircle, Crown, CheckCircle, XCircle, RotateCcw } from 'lucide-react';
import api from '../../services/api';
import Button from '../atoms/Button';

export default function SubscriptionManager() {
  const navigate = useNavigate();
  const [subscription, setSubscription] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reactivating, setReactivating] = useState(false);

  useEffect(() => {
    loadSubscription();
    loadPaymentMethod();
  }, []);

  const loadSubscription = async () => {
    try {
      const { data } = await api.get('/user/subscription');
      setSubscription(data.subscription);
    } catch (err) {
      console.error('Failed to load subscription:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadPaymentMethod = async () => {
    try {
      const { data } = await api.get('/payment/methods');
      if (data.paymentMethods?.length > 0) {
        setPaymentMethod(data.paymentMethods[0]);
      }
    } catch (err) {
      console.error('Failed to load payment method:', err);
    }
  };

  const handleCancelSubscription = async () => {
    setCancelling(true);
    try {
      await api.post('/payment/cancel');
      await loadSubscription();
      setShowCancelModal(false);
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בביטול המנוי');
    } finally {
      setCancelling(false);
    }
  };

  const handleReactivate = async () => {
    setReactivating(true);
    try {
      await api.post('/payment/reactivate');
      await loadSubscription();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בהפעלת המנוי מחדש');
    } finally {
      setReactivating(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  const isActive = subscription?.status === 'active';
  const isTrial = subscription?.is_trial;
  const isCancelled = subscription?.status === 'cancelled';
  const hasSubscription = subscription && subscription.status !== 'expired';

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 dark:text-white">
          <Crown className="w-5 h-5 text-yellow-500" />
          המנוי שלי
        </h2>

        {!hasSubscription ? (
          // No subscription
          <div className="text-center py-6">
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
              <CreditCard className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              אין לך מנוי פעיל
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              שדרג את החשבון שלך כדי ליהנות מיכולות מתקדמות
            </p>
            <Button onClick={() => navigate('/pricing')}>
              צפה בתוכניות
            </Button>
          </div>
        ) : (
          // Has subscription
          <div className="space-y-4">
            {/* Subscription Status Card */}
            <div className={`p-4 rounded-xl border-2 ${
              isCancelled 
                ? 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20' 
                : isTrial 
                  ? 'border-blue-300 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-green-300 bg-green-50 dark:bg-green-900/20'
            }`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {isCancelled ? (
                      <XCircle className="w-5 h-5 text-yellow-600" />
                    ) : (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    )}
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {subscription.plan_name_he || subscription.plan_name || 'מנוי'}
                    </span>
                    {isTrial && (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                        תקופת ניסיון
                      </span>
                    )}
                    {isCancelled && (
                      <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full">
                        בוטל
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {subscription.billing_period === 'yearly' ? 'חיוב שנתי' : 'חיוב חודשי'}
                    {subscription.plan_price && ` • ₪${subscription.plan_price}`}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {isCancelled ? 'פעיל עד' : isTrial ? 'ניסיון מסתיים' : 'חיוב הבא'}
                  </div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {subscription.next_charge_date || subscription.trial_ends_at
                      ? new Date(subscription.next_charge_date || subscription.trial_ends_at).toLocaleDateString('he-IL')
                      : '-'
                    }
                  </div>
                </div>
              </div>
            </div>

            {/* Cancelled Notice */}
            {isCancelled && (
              <div className="flex items-start gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    המנוי שלך בוטל אך עדיין פעיל עד לתאריך הסיום. 
                    לאחר מכן לא תוכל להשתמש ביכולות המתקדמות.
                  </p>
                  <button
                    onClick={handleReactivate}
                    disabled={reactivating}
                    className="mt-2 text-sm font-medium text-yellow-700 hover:text-yellow-800 flex items-center gap-1"
                  >
                    <RotateCcw className="w-4 h-4" />
                    {reactivating ? 'מחדש...' : 'חדש את המנוי'}
                  </button>
                </div>
              </div>
            )}

            {/* Payment Method */}
            {paymentMethod && (
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white dark:bg-gray-600 rounded-lg flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      **** **** **** {paymentMethod.card_last_digits}
                    </div>
                    <div className="text-sm text-gray-500">
                      {paymentMethod.card_holder_name} • 
                      {paymentMethod.card_expiry_month}/{paymentMethod.card_expiry_year}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button variant="secondary" onClick={() => navigate('/pricing')}>
                שנה תוכנית
              </Button>
              {isActive && !isCancelled && (
                <Button 
                  variant="ghost" 
                  onClick={() => setShowCancelModal(true)}
                  className="text-red-600 hover:bg-red-50"
                >
                  בטל מנוי
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Cancel Subscription Modal */}
      {showCancelModal && (
        <CancelSubscriptionModal
          subscription={subscription}
          onClose={() => setShowCancelModal(false)}
          onConfirm={handleCancelSubscription}
          loading={cancelling}
        />
      )}
    </>
  );
}

function CancelSubscriptionModal({ subscription, onClose, onConfirm, loading }) {
  const [confirmed, setConfirmed] = useState(false);
  
  const endDate = subscription?.next_charge_date 
    ? new Date(subscription.next_charge_date).toLocaleDateString('he-IL')
    : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-6 text-white text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-white/20 rounded-full flex items-center justify-center">
            <Crown className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold mb-2">אנחנו מצטערים שאתם הולכים 😢</h2>
          <p className="text-white/80">
            האם אתה בטוח שברצונך לבטל את המנוי?
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
            <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
              מה קורה אחרי הביטול?
            </h3>
            <ul className="space-y-2 text-sm text-blue-700 dark:text-blue-300">
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 text-green-500" />
                <span>
                  המנוי שלך יישאר פעיל עד{' '}
                  <strong>{endDate || 'סוף תקופת החיוב'}</strong>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 text-green-500" />
                <span>לא תחויב יותר באופן אוטומטי</span>
              </li>
              <li className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 text-yellow-500" />
                <span>לאחר התאריך, תאבד גישה לפיצ'רים מתקדמים</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 text-green-500" />
                <span>תוכל לחדש את המנוי בכל עת</span>
              </li>
            </ul>
          </div>

          {/* Confirmation checkbox */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-600 dark:text-gray-300">
              אני מבין/ה ורוצה לבטל את המנוי
            </span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex gap-3 p-6 pt-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium"
          >
            להישאר במנוי! 🎉
          </button>
          <button
            onClick={onConfirm}
            disabled={!confirmed || loading}
            className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'מבטל...' : 'בטל מנוי'}
          </button>
        </div>
      </div>
    </div>
  );
}
