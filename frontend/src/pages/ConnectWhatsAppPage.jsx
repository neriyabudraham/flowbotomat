import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  MessageCircle, CheckCircle, RefreshCw, Loader2,
  QrCode, AlertCircle, CheckCircle2, Phone, Hash
} from 'lucide-react';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export default function ConnectWhatsAppPage() {
  const { userId } = useParams();

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qrCode, setQrCode] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState(null);
  const [refreshingQr, setRefreshingQr] = useState(false);

  // Auth method toggle
  const [authMethod, setAuthMethod] = useState('qr'); // 'qr' or 'code'
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pairingCode, setPairingCode] = useState(null);
  const [codeRequesting, setCodeRequesting] = useState(false);
  const [codeError, setCodeError] = useState(null);

  const pollRef = useRef(null);
  const qrPollRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get(`/onboarding/${userId}/status`);
      setStatus(data);
      return data;
    } catch {
      return null;
    }
  }, [userId]);

  const fetchQR = useCallback(async (quiet = false) => {
    if (!quiet) setQrLoading(true);
    setQrError(null);
    try {
      const { data } = await api.get(`/onboarding/${userId}/whatsapp/qr`);
      if (data.status === 'connected') {
        setQrCode(null);
        fetchStatus();
        return 'connected';
      }
      if (data.qr) setQrCode(data.qr);
      return data.qr ? 'qr' : 'starting';
    } catch {
      setQrError('לא ניתן לקבל QR כרגע');
      return 'error';
    } finally {
      if (!quiet) setQrLoading(false);
      setRefreshingQr(false);
    }
  }, [userId, fetchStatus]);

  const requestCode = useCallback(async () => {
    if (!phoneNumber.trim()) return;
    setCodeRequesting(true);
    setCodeError(null);
    try {
      const { data } = await api.post(`/onboarding/${userId}/whatsapp/request-code`, {
        phoneNumber,
      });
      if (data.code) {
        setPairingCode(data.code);
      } else if (data.message) {
        setCodeError(data.message);
      }
    } catch (err) {
      setCodeError(err.response?.data?.error || 'שגיאה בשליחת קוד');
    } finally {
      setCodeRequesting(false);
    }
  }, [userId, phoneNumber]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const data = await fetchStatus();
      setLoading(false);
      if (data && !data.whatsapp?.connected) fetchQR();
    };
    init();
  }, [fetchStatus, fetchQR]);

  useEffect(() => {
    if (!status) return;
    if (status.whatsapp?.connected) {
      clearInterval(pollRef.current);
      clearInterval(qrPollRef.current);
      return;
    }
    qrPollRef.current = setInterval(() => {
      if (authMethod === 'qr') fetchQR(true);
    }, 30000);
    pollRef.current = setInterval(async () => {
      const data = await fetchStatus();
      if (data?.whatsapp?.connected) {
        clearInterval(pollRef.current);
        clearInterval(qrPollRef.current);
        setQrCode(null);
      }
      // If QR not loaded yet, retry
      if (!qrCode && authMethod === 'qr' && !data?.whatsapp?.connected) {
        fetchQR(true);
      }
    }, 5000);
    return () => {
      clearInterval(pollRef.current);
      clearInterval(qrPollRef.current);
    };
  }, [status?.whatsapp?.connected, fetchStatus, fetchQR, authMethod, qrCode]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-green-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-500">בודק סטטוס חיבור...</p>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center border border-gray-100">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">לינק לא תקין</h2>
          <p className="text-gray-500 text-sm">הלינק שקיבלת אינו תקף. פנה לתמיכה.</p>
        </div>
      </div>
    );
  }

  const whatsappConnected = status.whatsapp?.connected;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50" dir="rtl">
      <div className="max-w-2xl mx-auto px-4 py-12">

        {/* Hero Section */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg">
            <MessageCircle className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">חיבור WhatsApp</h1>
          <p className="text-gray-500">חבר את WhatsApp שלך כדי להתחיל לקבל ולשלוח הודעות</p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">

          {/* Connected State */}
          {whatsappConnected ? (
            <div className="p-8">
              <div className="text-center mb-8">
                <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <CheckCircle className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">WhatsApp מחובר!</h2>
                <p className="text-gray-500">החיבור פעיל ומוכן לשימוש</p>
              </div>

              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-6 mb-6 border border-green-200">
                <div className="flex items-center gap-4 justify-center">
                  <div className="text-center p-4 bg-white rounded-xl flex-1">
                    <Phone className="w-6 h-6 text-green-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">מספר טלפון</p>
                    <p className="font-bold text-gray-900">{status.whatsapp.phone_number ? `+${status.whatsapp.phone_number}` : 'לא זמין'}</p>
                  </div>
                  <div className="text-center p-4 bg-white rounded-xl flex-1">
                    <CheckCircle2 className="w-6 h-6 text-green-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">סטטוס</p>
                    <p className="font-bold text-green-600 flex items-center justify-center gap-1">
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      מחובר
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-gray-400 text-sm text-center">ניתן לסגור את הדף</p>
            </div>
          ) : (
            <div className="p-8">
              {/* Auth Method Toggle */}
              <div className="flex gap-2 mb-6 p-1 bg-gray-100 rounded-xl">
                <button
                  onClick={() => { setAuthMethod('qr'); setPairingCode(null); setCodeError(null); }}
                  className={`flex-1 py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all ${
                    authMethod === 'qr'
                      ? 'bg-white text-green-700 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  סריקת QR
                </button>
                <button
                  onClick={() => setAuthMethod('code')}
                  className={`flex-1 py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all ${
                    authMethod === 'code'
                      ? 'bg-white text-green-700 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Hash className="w-4 h-4" />
                  קוד התאמה
                </button>
              </div>

              {authMethod === 'qr' ? (
                <>
                  <div className="text-center mb-6">
                    <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                      <QrCode className="w-6 h-6 text-white" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">סרוק את קוד ה-QR</h2>
                    <p className="text-gray-500 text-sm">פתח את WhatsApp בטלפון &gt; הגדרות &gt; מכשירים מקושרים &gt; קשר מכשיר</p>
                  </div>

                  {/* QR Code */}
                  <div className="bg-white rounded-2xl border-2 border-gray-100 p-6 flex items-center justify-center mb-6">
                    {qrLoading ? (
                      <div className="w-64 h-64 flex items-center justify-center flex-col gap-4">
                        <Loader2 className="w-12 h-12 text-green-500 animate-spin" />
                        <p className="text-gray-500 text-sm">טוען קוד QR...</p>
                      </div>
                    ) : qrError ? (
                      <div className="w-64 h-64 flex items-center justify-center flex-col gap-3">
                        <AlertCircle className="w-10 h-10 text-red-400" />
                        <p className="text-red-500 text-sm text-center">{qrError}</p>
                        <button
                          onClick={() => { setRefreshingQr(true); fetchQR(); }}
                          className="px-4 py-2 bg-green-500 text-white rounded-xl text-sm font-medium hover:bg-green-600 transition-colors flex items-center gap-2"
                        >
                          <RefreshCw className="w-4 h-4" /> נסה שוב
                        </button>
                      </div>
                    ) : qrCode ? (
                      <div className="relative">
                        <img src={qrCode} alt="QR Code" className="w-64 h-64" />
                        <div className="absolute inset-0 flex items-center justify-center bg-white/80 opacity-0 hover:opacity-100 transition-opacity rounded-lg">
                          <button
                            onClick={() => { setRefreshingQr(true); fetchQR(); }}
                            className="p-3 bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors"
                          >
                            <RefreshCw className={`w-6 h-6 ${refreshingQr ? 'animate-spin' : ''}`} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="w-64 h-64 flex items-center justify-center flex-col gap-4">
                        <Loader2 className="w-12 h-12 text-green-500 animate-spin" />
                        <p className="text-gray-500 text-sm">טוען קוד QR...</p>
                      </div>
                    )}
                  </div>

                  {/* Tip */}
                  <div className="bg-gray-50 rounded-xl p-4 mb-6">
                    <p className="text-sm text-gray-600 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500" />
                      אם הקוד פג תוקף, לחץ על כפתור הריענון. הקוד בתוקף למשך כ-60 שניות.
                    </p>
                  </div>

                  {/* Refresh Button */}
                  <button
                    onClick={() => { setRefreshingQr(true); fetchQR(); }}
                    disabled={refreshingQr}
                    className="w-full py-3 border-2 border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-5 h-5 ${refreshingQr ? 'animate-spin' : ''}`} />
                    רענן קוד
                  </button>
                </>
              ) : (
                <>
                  <div className="text-center mb-6">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                      <Phone className="w-6 h-6 text-white" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">התחברות עם קוד</h2>
                    <p className="text-gray-500 text-sm">הזן את מספר הטלפון שלך וקבל קוד התאמה</p>
                  </div>

                  {!pairingCode ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">מספר טלפון</label>
                        <input
                          type="tel"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          placeholder="050-1234567"
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500/30 focus:border-green-400 transition-all text-lg"
                          dir="ltr"
                        />
                        <p className="text-xs text-gray-500 mt-1">הזן את המספר בכל פורמט (עם או בלי קידומת)</p>
                      </div>

                      {codeError && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          {codeError}
                        </div>
                      )}

                      <button
                        onClick={requestCode}
                        disabled={codeRequesting || !phoneNumber.trim()}
                        className="w-full py-4 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-bold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {codeRequesting ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            שולח קוד...
                          </>
                        ) : (
                          <>
                            <Phone className="w-5 h-5" />
                            שלח לי קוד
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="text-center space-y-6">
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-200">
                        <p className="text-sm text-blue-700 mb-3">הקוד שלך:</p>
                        <div className="text-4xl font-mono font-bold text-blue-900 tracking-widest">
                          {pairingCode}
                        </div>
                        <p className="text-xs text-blue-600 mt-3">
                          הזן את הקוד הזה ב-WhatsApp בטלפון שלך
                        </p>
                      </div>

                      <div className="bg-gray-50 rounded-xl p-4 text-right">
                        <h3 className="font-medium text-gray-900 mb-2">איך להזין את הקוד?</h3>
                        <ol className="text-sm text-gray-600 space-y-1">
                          <li>1. פתח את WhatsApp בטלפון</li>
                          <li>2. לך להגדרות &gt; מכשירים מקושרים</li>
                          <li>3. לחץ על "קשר מכשיר"</li>
                          <li>4. לחץ על "קשר עם מספר טלפון במקום"</li>
                          <li>5. הזן את הקוד שמופיע למעלה</li>
                        </ol>
                      </div>

                      <button
                        onClick={() => { setPairingCode(null); setCodeError(null); }}
                        className="text-blue-600 hover:text-blue-700 font-medium text-sm"
                      >
                        קבל קוד חדש
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-gray-300 text-xs mt-8">Powered by Botomat</p>
      </div>
    </div>
  );
}
