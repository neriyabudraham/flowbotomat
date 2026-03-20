import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  MessageCircle, CheckCircle, RefreshCw, Loader2,
  QrCode, Users, Table2, Wifi, AlertCircle, CheckCircle2
} from 'lucide-react';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export default function ConnectPage() {
  const { userId } = useParams();
  const [searchParams] = useSearchParams();

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qrCode, setQrCode] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState(null);
  const [refreshingQr, setRefreshingQr] = useState(false);

  const pollRef = useRef(null);
  const qrPollRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get(`/onboarding/${userId}/status`);
      setStatus(data);
      return data;
    } catch (err) {
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
      return 'qr';
    } catch (err) {
      setQrError('לא ניתן לקבל QR כרגע');
      return 'error';
    } finally {
      if (!quiet) setQrLoading(false);
      setRefreshingQr(false);
    }
  }, [userId, fetchStatus]);

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
    qrPollRef.current = setInterval(() => fetchQR(true), 30000);
    pollRef.current = setInterval(async () => {
      const data = await fetchStatus();
      if (data?.whatsapp?.connected) {
        clearInterval(pollRef.current);
        clearInterval(qrPollRef.current);
        setQrCode(null);
      }
    }, 4000);
    return () => {
      clearInterval(pollRef.current);
      clearInterval(qrPollRef.current);
    };
  }, [status?.whatsapp?.connected, fetchStatus, fetchQR]);

  useEffect(() => {
    const gc = searchParams.get('google_contacts');
    const gs = searchParams.get('google_sheets');
    if (gc === 'connected' || gs === 'connected') fetchStatus();
  }, [searchParams, fetchStatus]);

  const handleGoogleContactsConnect = async () => {
    try {
      const { data } = await api.get(`/onboarding/${userId}/google-contacts/url`);
      window.location.href = data.url;
    } catch { alert('שגיאה בהתחברות לגוגל'); }
  };

  const handleGoogleSheetsConnect = async () => {
    try {
      const { data } = await api.get(`/onboarding/${userId}/google-sheets/url`);
      window.location.href = data.url;
    } catch { alert('שגיאה בהתחברות לגוגל'); }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
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
  const contactsConnected = status.googleContacts?.connected;
  const sheetsConnected = status.googleSheets?.connected;
  const allConnected = whatsappConnected && contactsConnected && sheetsConnected;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100" dir="rtl">
      <div className="max-w-lg mx-auto px-4 py-10">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-white rounded-2xl shadow-md flex items-center justify-center mx-auto mb-4">
            <Wifi className="w-8 h-8 text-purple-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-1">חיבור חשבונות</h1>
          <p className="text-gray-500 text-sm">חבר את החשבונות שלך להתחלת השימוש</p>
        </div>

        {/* All connected banner */}
        {allConnected && (
          <div className="bg-white rounded-2xl shadow-md p-5 mb-6 text-center border border-green-100">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <p className="text-green-700 font-bold text-lg">כל החשבונות מחוברים!</p>
            <p className="text-gray-400 text-sm mt-1">ניתן לסגור את הדף</p>
          </div>
        )}

        {/* WhatsApp Card */}
        <div className="bg-white rounded-2xl shadow-md p-5 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 bg-green-100 rounded-xl flex items-center justify-center">
              <MessageCircle className="w-6 h-6 text-green-600" />
            </div>
            <div className="flex-1">
              <h2 className="font-bold text-gray-800">WhatsApp</h2>
              <p className="text-gray-400 text-xs">חיבור חשבון ווטסאפ</p>
            </div>
            {whatsappConnected ? (
              <span className="flex items-center gap-1.5 bg-green-50 text-green-700 text-xs font-medium px-3 py-1.5 rounded-lg border border-green-200">
                <CheckCircle2 className="w-3.5 h-3.5" />
                מחובר
              </span>
            ) : (
              <span className="flex items-center gap-1.5 bg-gray-50 text-gray-400 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200">
                לא מחובר
              </span>
            )}
          </div>

          {whatsappConnected ? (
            <div className="bg-green-50 border border-green-100 rounded-xl p-3 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
              <div>
                <p className="text-green-700 text-sm font-medium">{status.whatsapp.display_name || 'מחובר'}</p>
                {status.whatsapp.phone_number && (
                  <p className="text-green-500 text-xs">+{status.whatsapp.phone_number}</p>
                )}
              </div>
            </div>
          ) : (
            <div>
              <p className="text-gray-500 text-sm mb-4 text-center">סרוק את הקוד עם ווטסאפ שלך</p>

              {qrLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
                </div>
              ) : qrError ? (
                <div className="text-center py-8">
                  <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                  <p className="text-red-500 text-sm mb-3">{qrError}</p>
                  <button
                    onClick={() => { setRefreshingQr(true); fetchQR(); }}
                    className="text-purple-600 text-sm flex items-center gap-1 mx-auto hover:text-purple-700"
                  >
                    <RefreshCw className="w-4 h-4" /> נסה שוב
                  </button>
                </div>
              ) : qrCode ? (
                <div className="text-center">
                  <div className="inline-block bg-white border-2 border-gray-100 rounded-2xl p-3 shadow-sm mb-3">
                    <img src={qrCode} alt="QR Code" className="w-52 h-52" />
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    <p className="text-gray-400 text-xs">ממתין לסריקה...</p>
                    <button
                      onClick={() => { setRefreshingQr(true); fetchQR(); }}
                      disabled={refreshingQr}
                      className="text-gray-400 hover:text-gray-600 transition-colors mr-1"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${refreshingQr ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center py-10">
                  <div className="text-center">
                    <QrCode className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">טוען קוד QR...</p>
                  </div>
                </div>
              )}

              <div className="mt-4 bg-amber-50 border border-amber-100 rounded-xl p-3">
                <p className="text-amber-700 text-xs text-center leading-relaxed">
                  פתח WhatsApp ← תפריט ← מכשירים מקושרים ← קשר מכשיר
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Google Contacts Card */}
        <div className="bg-white rounded-2xl shadow-md p-5 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-500" />
            </div>
            <div className="flex-1">
              <h2 className="font-bold text-gray-800">Google Contacts</h2>
              <p className="text-gray-400 text-xs">אנשי קשר מגוגל</p>
            </div>
            {contactsConnected && (
              <span className="flex items-center gap-1.5 bg-green-50 text-green-700 text-xs font-medium px-3 py-1.5 rounded-lg border border-green-200">
                <CheckCircle2 className="w-3.5 h-3.5" />
                מחובר
              </span>
            )}
          </div>

          {contactsConnected ? (
            <div className="bg-green-50 border border-green-100 rounded-xl p-3 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
              <div>
                <p className="text-green-700 text-sm font-medium">מחובר לגוגל קונטקטס</p>
                {status.googleContacts?.email && (
                  <p className="text-green-500 text-xs">{status.googleContacts.email}</p>
                )}
              </div>
            </div>
          ) : (
            <button
              onClick={handleGoogleContactsConnect}
              className="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white rounded-xl font-medium text-sm transition-all shadow-sm flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              חבר Google Contacts
            </button>
          )}
        </div>

        {/* Google Sheets Card */}
        <div className="bg-white rounded-2xl shadow-md p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 bg-green-50 rounded-xl flex items-center justify-center">
              <Table2 className="w-6 h-6 text-green-600" />
            </div>
            <div className="flex-1">
              <h2 className="font-bold text-gray-800">Google Sheets</h2>
              <p className="text-gray-400 text-xs">גיליונות אלקטרוניים</p>
            </div>
            {sheetsConnected && (
              <span className="flex items-center gap-1.5 bg-green-50 text-green-700 text-xs font-medium px-3 py-1.5 rounded-lg border border-green-200">
                <CheckCircle2 className="w-3.5 h-3.5" />
                מחובר
              </span>
            )}
          </div>

          {sheetsConnected ? (
            <div className="bg-green-50 border border-green-100 rounded-xl p-3 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
              <div>
                <p className="text-green-700 text-sm font-medium">מחובר לגוגל שיטס</p>
                {status.googleSheets?.email && (
                  <p className="text-green-500 text-xs">{status.googleSheets.email}</p>
                )}
              </div>
            </div>
          ) : (
            <button
              onClick={handleGoogleSheetsConnect}
              className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-xl font-medium text-sm transition-all shadow-sm flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              חבר Google Sheets
            </button>
          )}
        </div>

        <p className="text-center text-gray-300 text-xs mt-8">Powered by Botomat</p>
      </div>
    </div>
  );
}
