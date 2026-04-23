import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  CheckCircle, Loader2, Users, Table2, AlertCircle, CheckCircle2,
  Plus, Trash2,
} from 'lucide-react';
import axios from 'axios';
import { toast } from '../store/toastStore';

const api = axios.create({ baseURL: '/api' });

export default function ConnectIntegrationsPage() {
  const { userId } = useParams();
  const [searchParams] = useSearchParams();

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [contactAccounts, setContactAccounts] = useState([]);

  const fetchStatus = useCallback(async () => {
    try {
      const [{ data }, accountsRes] = await Promise.all([
        api.get(`/onboarding/${userId}/status`),
        api.get(`/onboarding/${userId}/google-contacts/accounts`).catch(() => ({ data: { accounts: [] } })),
      ]);
      setStatus(data);
      setContactAccounts(accountsRes.data.accounts || []);
      return data;
    } catch {
      return null;
    }
  }, [userId]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchStatus();
      setLoading(false);
    };
    init();
  }, [fetchStatus]);

  useEffect(() => {
    const gc = searchParams.get('google_contacts');
    const gs = searchParams.get('google_sheets');
    if (gc === 'connected' || gs === 'connected') fetchStatus();
  }, [searchParams, fetchStatus]);

  const handleGoogleContactsConnect = async () => {
    try {
      const { data } = await api.get(`/onboarding/${userId}/google-contacts/url`);
      window.location.href = data.url;
    } catch { toast.error('שגיאה בהתחברות לגוגל'); }
  };

  const handleSetPrimary = async (slot) => {
    try {
      await api.post(`/onboarding/${userId}/google-contacts/accounts/${slot}/primary`);
      await fetchStatus();
      toast.success('החשבון הוגדר כראשי');
    } catch (e) {
      toast.error(e.response?.data?.error || 'שגיאה בקביעת חשבון ראשי');
    }
  };

  const handleDisconnectAccount = async (slot, email) => {
    if (!await toast.confirm(`להסיר את החשבון ${email}?`, { type: 'warning', confirmText: 'הסר', cancelText: 'ביטול' })) return;
    try {
      await api.delete(`/onboarding/${userId}/google-contacts/accounts/${slot}`);
      await fetchStatus();
      toast.success('החשבון הוסר');
    } catch (e) {
      toast.error(e.response?.data?.error || 'שגיאה בהסרה');
    }
  };

  const handleGoogleSheetsConnect = async () => {
    try {
      const { data } = await api.get(`/onboarding/${userId}/google-sheets/url`);
      window.location.href = data.url;
    } catch { toast.error('שגיאה בהתחברות לגוגל'); }
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

  const contactsConnected = status.googleContacts?.connected;
  const sheetsConnected = status.googleSheets?.connected;
  const allConnected = contactsConnected && sheetsConnected;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100" dir="rtl">
      <div className="max-w-lg mx-auto px-4 py-10">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-white rounded-2xl shadow-md flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-1">חיבור אינטגרציות גוגל</h1>
          <p className="text-gray-500 text-sm">חבר את חשבונות הגוגל שלך</p>
        </div>

        {/* All connected banner */}
        {allConnected && (
          <div className="bg-white rounded-2xl shadow-md p-5 mb-6 text-center border border-green-100">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <p className="text-green-700 font-bold text-lg">כל האינטגרציות מחוברות!</p>
            <p className="text-gray-400 text-sm mt-1">ניתן לסגור את הדף</p>
          </div>
        )}

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

          {contactAccounts.length > 0 ? (
            <div className="space-y-2">
              {contactAccounts.map((acc) => (
                <div key={acc.slot} className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-blue-700 text-sm font-bold shrink-0 shadow-sm">
                    {(acc.email || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-blue-900 truncate" dir="ltr">{acc.email}</p>
                    {acc.name && <p className="text-xs text-blue-600 truncate">{acc.name}</p>}
                  </div>
                  {acc.slot === 0 ? (
                    <span className="text-[10px] font-bold text-blue-700 bg-white border border-blue-200 px-2 py-0.5 rounded-full">ראשי</span>
                  ) : (
                    <button onClick={() => handleSetPrimary(acc.slot)}
                      className="text-[10px] font-bold text-gray-600 hover:text-blue-700 border border-gray-200 hover:border-blue-200 hover:bg-white px-2 py-0.5 rounded-full transition">
                      קבע כראשי
                    </button>
                  )}
                  <button onClick={() => handleDisconnectAccount(acc.slot, acc.email)}
                    className="text-red-400 hover:text-red-600 hover:bg-white p-1 rounded-lg" title="הסר חשבון זה">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button
                onClick={handleGoogleContactsConnect}
                className="w-full py-2.5 bg-white hover:bg-blue-50 border border-blue-200 text-blue-700 rounded-xl font-medium text-sm transition flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                הוסף חשבון Google נוסף
              </button>
              {contactAccounts.length > 1 && (
                <p className="text-[11px] text-gray-500 leading-relaxed text-center px-1">
                  סנכרון אנשי קשר חדשים מתבצע בחשבון הראשי. כשהוא מגיע ל-25,000 אנשי קשר, המערכת עוברת אוטומטית לחשבון הבא.
                </p>
              )}
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
