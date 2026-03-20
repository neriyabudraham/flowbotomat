import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  MessageCircle, CheckCircle, RefreshCw, Loader2,
  QrCode, Wifi, AlertCircle, CheckCircle2
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
      return 'qr';
    } catch {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100" dir="rtl">
      <div className="max-w-lg mx-auto px-4 py-10">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-white rounded-2xl shadow-md flex items-center justify-center mx-auto mb-4">
            <MessageCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-1">חיבור WhatsApp</h1>
          <p className="text-gray-500 text-sm">חבר את חשבון הווטסאפ שלך</p>
        </div>

        {/* Connected banner */}
        {whatsappConnected && (
          <div className="bg-white rounded-2xl shadow-md p-5 mb-6 text-center border border-green-100">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <p className="text-green-700 font-bold text-lg">WhatsApp מחובר!</p>
            <p className="text-gray-400 text-sm mt-1">ניתן לסגור את הדף</p>
          </div>
        )}

        {/* WhatsApp Card */}
        <div className="bg-white rounded-2xl shadow-md p-5">
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

        <p className="text-center text-gray-300 text-xs mt-8">Powered by Botomat</p>
      </div>
    </div>
  );
}
