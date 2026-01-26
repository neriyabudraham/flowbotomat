import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Calendar, AlertCircle, Crown, CheckCircle, XCircle, RotateCcw, Trash2, ShieldAlert, Clock, Info, HelpCircle, ArrowRight } from 'lucide-react';
import api from '../../services/api';
import Button from '../atoms/Button';

export default function SubscriptionManager() {
  const navigate = useNavigate();
  const [subscription, setSubscription] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showRemoveCardModal, setShowRemoveCardModal] = useState(false);
  const [showWhatHappensModal, setShowWhatHappensModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [removingCard, setRemovingCard] = useState(false);

  useEffect(() => {
    loadSubscription();
    loadPaymentMethod();
  }, []);

  const loadSubscription = async () => {
    try {
      const { data } = await api.get('/subscriptions/my');
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
      const { data } = await api.post('/payment/reactivate');
      await loadSubscription();
      // Show success message
      if (data.message) {
        navigate('/dashboard', { 
          state: { 
            message: data.message,
            type: 'success'
          }
        });
      }
    } catch (err) {
      const errorData = err.response?.data;
      if (errorData?.needsNewSubscription) {
        // Subscription expired, need to resubscribe
        navigate('/pricing', { 
          state: { 
            message: 'תקופת המנוי הסתיימה. בחר תכנית להמשיך.',
            type: 'warning'
          }
        });
      } else if (errorData?.needsPaymentMethod) {
        // No payment method, redirect to add one
        navigate('/pricing', { 
          state: { 
            message: 'יש להוסיף כרטיס אשראי לחידוש המנוי.',
            type: 'warning'
          }
        });
      } else {
        alert(errorData?.error || 'שגיאה בהפעלת המנוי מחדש');
      }
    } finally {
      setReactivating(false);
    }
  };

  const handleRemoveCard = async () => {
    setRemovingCard(true);
    try {
      const { data } = await api.delete('/payment/methods/remove-all');
      setPaymentMethod(null);
      setShowRemoveCardModal(false);
      await loadSubscription();
      navigate('/dashboard', { 
        state: { 
          message: data.message || 'פרטי האשראי הוסרו בהצלחה',
          type: 'warning'
        }
      });
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בהסרת כרטיס האשראי');
    } finally {
      setRemovingCard(false);
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

  // Calculate subscription status
  const status = subscription?.status;
  const isTrial = subscription?.is_trial || status === 'trial';
  const isActive = status === 'active';
  const isCancelled = status === 'cancelled';
  
  // Get end date
  const endDateRaw = isTrial 
    ? subscription?.trial_ends_at 
    : (subscription?.expires_at || subscription?.next_charge_date);
  
  const endDate = endDateRaw ? new Date(endDateRaw) : null;
  const now = new Date();
  const daysLeft = endDate ? Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)) : null;
  
  // Determine if subscription is effectively active (has time remaining)
  const hasTimeRemaining = endDate && daysLeft > 0;
  const hasValidSubscription = (isActive || isTrial || (isCancelled && hasTimeRemaining)) && subscription?.plan_name_he;
  
  // Should show expiry warning? (show for cancelled, or within 30 days for others)
  const shouldShowExpiry = hasTimeRemaining && (isCancelled || daysLeft <= 30);

  const formattedEndDate = endDate?.toLocaleDateString('he-IL', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 dark:text-white">
          <Crown className="w-5 h-5 text-yellow-500" />
          המנוי שלי
        </h2>

        {!hasValidSubscription ? (
          // No subscription or expired
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
          // Has valid subscription
          <div className="space-y-4">
            {/* Subscription Status Card */}
            <div className={`p-4 rounded-xl border-2 ${
              isCancelled 
                ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/20' 
                : isTrial 
                  ? 'border-blue-300 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-green-300 bg-green-50 dark:bg-green-900/20'
            }`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {isCancelled ? (
                      <Clock className="w-5 h-5 text-amber-600" />
                    ) : (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    )}
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {subscription.plan_name_he || subscription.plan_name || 'מנוי'}
                    </span>
                    {isTrial && subscription.plan_price > 0 && (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                        תקופת ניסיון
                      </span>
                    )}
                    {isCancelled && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">
                        מבוטל
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {subscription.billing_period === 'yearly' ? 'חיוב שנתי' : 'חיוב חודשי'}
                    {subscription.price && ` • ₪${subscription.price}`}
                  </p>
                </div>
              </div>
            </div>

            {/* Trial with payment method - Show upcoming charge info (only if NOT cancelled and paid plan) */}
            {isTrial && paymentMethod && hasTimeRemaining && !isCancelled && subscription.plan_price > 0 && (
              <div className="p-4 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center flex-shrink-0">
                    <CreditCard className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 text-white">
                    <h3 className="font-bold text-lg">
                      תקופת ניסיון פעילה
                    </h3>
                    <p className="text-white/90 mt-1">
                      {daysLeft === 0 
                        ? `החיוב הראשון יבוצע היום (${formattedEndDate})`
                        : daysLeft === 1 
                          ? `החיוב הראשון יבוצע מחר (${formattedEndDate})`
                          : `החיוב הראשון יבוצע בעוד ${daysLeft} ימים (${formattedEndDate})`
                      }
                    </p>
                    <p className="text-white/70 text-sm mt-1">
                      הכרטיס שמור במערכת והחיוב יתבצע אוטומטית
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Expiry Warning - Show for cancelled OR trial without payment (only for paid plans) */}
            {shouldShowExpiry && subscription.plan_price > 0 && (isCancelled || !(isTrial && paymentMethod)) && (
              <div className={`p-4 rounded-xl ${
                isCancelled 
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500' 
                  : daysLeft <= 7 
                    ? 'bg-gradient-to-r from-red-500 to-rose-500'
                    : 'bg-gradient-to-r from-blue-500 to-indigo-500'
              }`}>
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center flex-shrink-0">
                    <Clock className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 text-white">
                    <h3 className="font-bold text-lg">
                      {isCancelled ? 'המנוי מבוטל' : isTrial ? 'תקופת הניסיון מסתיימת' : 'המנוי עומד להסתיים'}
                    </h3>
                    <p className="text-white/90 mt-1">
                      {daysLeft === 0 
                        ? (isTrial ? 'הניסיון מסתיים היום!' : 'המנוי מסתיים היום!')
                        : daysLeft === 1 
                          ? (isTrial ? 'הניסיון מסתיים מחר!' : 'המנוי מסתיים מחר!')
                          : `עוד ${daysLeft} ימים (${formattedEndDate})`
                      }
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <button
                        onClick={() => setShowWhatHappensModal(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
                      >
                        <HelpCircle className="w-4 h-4" />
                        מה יקרה אחרי?
                      </button>
                      {paymentMethod ? (
                        <button
                          onClick={handleReactivate}
                          disabled={reactivating}
                          className="flex items-center gap-1.5 px-4 py-1.5 bg-white text-amber-600 hover:bg-white/90 rounded-lg text-sm font-bold transition-colors disabled:opacity-70"
                        >
                          {reactivating ? (
                            <>
                              <RotateCcw className="w-4 h-4 animate-spin" />
                              מחדש...
                            </>
                          ) : (
                            <>
                              חדש מנוי
                              <ArrowRight className="w-4 h-4" />
                            </>
                          )}
                        </button>
                      ) : (
                        <button
                          onClick={() => navigate('/pricing')}
                          className="flex items-center gap-1.5 px-4 py-1.5 bg-white text-amber-600 hover:bg-white/90 rounded-lg text-sm font-bold transition-colors"
                        >
                          הוסף אשראי וחדש
                          <CreditCard className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Cancelled Notice - Only if not showing expiry warning */}
            {isCancelled && !shouldShowExpiry && (
              <div className="flex items-start gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    המנוי שלך בוטל אך עדיין פעיל עד לתאריך הסיום.
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

            {/* Next charge info - Only for active (not cancelled) */}
            {!isCancelled && !shouldShowExpiry && endDate && (
              <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <Calendar className="w-5 h-5 text-gray-400" />
                <div className="text-sm">
                  <span className="text-gray-500 dark:text-gray-400">
                    {isTrial ? 'הניסיון מסתיים: ' : 'חיוב הבא: '}
                  </span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formattedEndDate}
                  </span>
                </div>
              </div>
            )}

            {/* Payment Method */}
            {paymentMethod ? (
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <div className="flex items-center justify-between">
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
                  <button
                    onClick={() => setShowRemoveCardModal(true)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="הסר כרטיס אשראי"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600" />
                  <div>
                    <div className="font-medium text-yellow-800 dark:text-yellow-200">
                      לא הוגדר אמצעי תשלום
                    </div>
                    <div className="text-sm text-yellow-600 dark:text-yellow-300">
                      יש להוסיף כרטיס אשראי להמשך השירות
                    </div>
                  </div>
                </div>
                <Button 
                  onClick={() => navigate('/pricing')} 
                  className="mt-3 w-full"
                  size="sm"
                >
                  <CreditCard className="w-4 h-4 ml-2" />
                  הוסף כרטיס אשראי
                </Button>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button variant="secondary" onClick={() => navigate('/pricing')}>
                שנה תוכנית
              </Button>
              {(isActive || isTrial) && !isCancelled && (
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

      {/* Remove Card Modal */}
      {showRemoveCardModal && (
        <RemoveCardModal
          subscription={subscription}
          onClose={() => setShowRemoveCardModal(false)}
          onConfirm={handleRemoveCard}
          loading={removingCard}
        />
      )}

      {/* What Happens Modal */}
      {showWhatHappensModal && (
        <WhatHappensModal
          onClose={() => setShowWhatHappensModal(false)}
          onRenew={() => {
            setShowWhatHappensModal(false);
            navigate('/pricing');
          }}
        />
      )}
    </>
  );
}

function WhatHappensModal({ onClose, onRenew }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-6 text-white text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-white/20 rounded-full flex items-center justify-center">
            <Info className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold">מה יקרה כשהמנוי יסתיים?</h2>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl">
              <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-red-800 dark:text-red-200">הבוטים יושבתו</div>
                <div className="text-sm text-red-600 dark:text-red-300">כל הבוטים שלך יכבו אוטומטית</div>
              </div>
            </div>
            
            <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
              <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-amber-800 dark:text-amber-200">בחירת בוט אחד</div>
                <div className="text-sm text-amber-600 dark:text-amber-300">תצטרך לבחור בוט אחד לשמור. השאר יימחקו.</div>
              </div>
            </div>
            
            <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <Clock className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-blue-800 dark:text-blue-200">WhatsApp ינותק</div>
                <div className="text-sm text-blue-600 dark:text-blue-300">חיבור ה-WhatsApp שלך יפסיק לפעול</div>
              </div>
            </div>
            
            <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-green-800 dark:text-green-200">הנתונים נשמרים</div>
                <div className="text-sm text-green-600 dark:text-green-300">אנשי הקשר וההיסטוריה שלך יישארו</div>
              </div>
            </div>
          </div>

          <div className="pt-2 text-center text-sm text-gray-500 dark:text-gray-400">
            💡 חדש את המנוי כדי להמשיך ליהנות מכל היכולות
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 p-6 pt-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            סגור
          </button>
          <button
            onClick={onRenew}
            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:from-amber-600 hover:to-orange-600 font-bold"
          >
            חדש מנוי
          </button>
        </div>
      </div>
    </div>
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

function RemoveCardModal({ subscription, onClose, onConfirm, loading }) {
  const [confirmed, setConfirmed] = useState(false);
  const [typedConfirm, setTypedConfirm] = useState('');
  
  const isTrial = subscription?.is_trial || subscription?.status === 'trial';
  const isActive = subscription?.status === 'active';
  const isCancelled = subscription?.status === 'cancelled';
  const hasSubscription = isTrial || isActive || isCancelled;
  
  // Determine end date
  const rawEndDate = isTrial 
    ? subscription?.trial_ends_at 
    : (subscription?.expires_at || subscription?.next_charge_date);
  const endDate = rawEndDate ? new Date(rawEndDate).toLocaleDateString('he-IL') : null;
  const hasTimeRemaining = rawEndDate && new Date(rawEndDate) > new Date();

  const canConfirm = confirmed && typedConfirm === 'הסר';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`p-6 text-white text-center ${hasSubscription && hasTimeRemaining ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-gradient-to-r from-red-500 to-red-600'}`}>
          <div className="w-16 h-16 mx-auto mb-4 bg-white/20 rounded-full flex items-center justify-center">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold mb-2">הסרת פרטי אשראי</h2>
          <p className="text-white/80">
            {hasSubscription && hasTimeRemaining
              ? 'השירות ימשיך לפעול עד סוף תקופת המנוי'
              : 'פעולה זו תגרום לניתוק השירות'
            }
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {hasSubscription && hasTimeRemaining ? (
            <>
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4">
                <h3 className="font-semibold text-amber-800 dark:text-amber-200 mb-2">
                  ⏱️ מה יקרה:
                </h3>
                <ul className="space-y-2 text-sm text-amber-700 dark:text-amber-300">
                  <li className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 text-amber-500 flex-shrink-0" />
                    <span>פרטי האשראי שלך יוסרו</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 text-amber-500 flex-shrink-0" />
                    <span>המנוי לא יתחדש אוטומטית</span>
                  </li>
                  {endDate && (
                    <li className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 mt-0.5 text-amber-500 flex-shrink-0" />
                      <span>
                        השירות יפסיק ב-<strong>{endDate}</strong>
                      </span>
                    </li>
                  )}
                </ul>
              </div>

              <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4">
                <h3 className="font-semibold text-green-800 dark:text-green-200 mb-2">
                  ✅ עד אז תוכל להמשיך:
                </h3>
                <ul className="space-y-2 text-sm text-green-700 dark:text-green-300">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 mt-0.5 text-green-500 flex-shrink-0" />
                    <span>להשתמש בכל הבוטים שלך</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 mt-0.5 text-green-500 flex-shrink-0" />
                    <span>לקבל ולשלוח הודעות ב-WhatsApp</span>
                  </li>
                </ul>
              </div>
            </>
          ) : (
            <>
              <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4">
                <h3 className="font-semibold text-red-800 dark:text-red-200 mb-2">
                  ⚠️ שים לב - מה יקרה:
                </h3>
                <ul className="space-y-2 text-sm text-red-700 dark:text-red-300">
                  <li className="flex items-start gap-2">
                    <XCircle className="w-4 h-4 mt-0.5 text-red-500 flex-shrink-0" />
                    <span>פרטי האשראי שלך יוסרו לצמיתות</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <XCircle className="w-4 h-4 mt-0.5 text-red-500 flex-shrink-0" />
                    <span>חיבור ה-WhatsApp שלך ינותק <strong>מיידית</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <XCircle className="w-4 h-4 mt-0.5 text-red-500 flex-shrink-0" />
                    <span>הבוטים שלך יפסיקו לפעול</span>
                  </li>
                </ul>
              </div>
            </>
          )}

          {/* Confirmation */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            <span className="text-sm text-gray-600 dark:text-gray-300">
              אני מבין/ה
            </span>
          </label>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              הקלד "הסר" לאישור:
            </label>
            <input
              type="text"
              value={typedConfirm}
              onChange={(e) => setTypedConfirm(e.target.value)}
              placeholder="הסר"
              className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500"
              dir="rtl"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 p-6 pt-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium"
          >
            ביטול
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm || loading}
            className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {loading ? 'מסיר...' : 'הסר כרטיס'}
          </button>
        </div>
      </div>
    </div>
  );
}
