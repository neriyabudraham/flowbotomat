import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  MessageCircle, ArrowLeft, Smartphone, Server, QrCode, 
  CheckCircle, XCircle, RefreshCw, Trash2, Wifi, WifiOff,
  Shield, Zap, Clock, AlertCircle, Phone, Settings,
  ChevronLeft, Loader2, ExternalLink, Copy, Check, ChevronDown, 
  Mail, HelpCircle, Hash
} from 'lucide-react';
import useWhatsappStore from '../store/whatsappStore';
import useAuthStore from '../store/authStore';
import Logo from '../components/atoms/Logo';
import NotificationsDropdown from '../components/notifications/NotificationsDropdown';
import AccountSwitcher from '../components/AccountSwitcher';
import PaymentRequiredModal from '../components/payment/PaymentRequiredModal';

export default function WhatsappSetupPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [step, setStep] = useState('loading');

  // Check if user is admin (either directly or viewing as another account)
  const isAdmin = (() => {
    if (user && ['admin', 'superadmin'].includes(user.role)) return true;
    try {
      const token = localStorage.getItem('accessToken');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.viewingAs) return true;
      }
    } catch (e) {}
    return false;
  })();
  const [isCheckingExisting, setIsCheckingExisting] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [pendingConnectionType, setPendingConnectionType] = useState(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [authMethod, setAuthMethod] = useState('qr'); // 'qr' or 'code'
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pairingCode, setPairingCode] = useState(null);
  const [codeRequesting, setCodeRequesting] = useState(false);
  const {
    connection, qrCode, isLoading, error, existingSession,
    fetchStatus, connectManaged, connectExternal, fetchQR, disconnect, deleteConnection, clearError, checkExisting,
    requestPairingCode,
  } = useWhatsappStore();

  // External form state
  const [externalForm, setExternalForm] = useState({
    baseUrl: '',
    apiKey: '',
    sessionName: ''
  });

  useEffect(() => {
    checkStatus();
  }, []);

  // Poll status when on QR step to auto-detect connection
  useEffect(() => {
    if (step !== 'qr') return;

    const pollInterval = setInterval(async () => {
      try {
        const data = await fetchStatus();
        if (data.connection?.status === 'connected') {
          clearInterval(pollInterval);
          // Navigate to dashboard when connected
          navigate('/dashboard');
        }
      } catch (e) {
        // Ignore polling errors
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  }, [step, navigate, fetchStatus]);

  const checkStatus = async () => {
    try {
      const data = await fetchStatus();
      if (data.connection?.status === 'connected') {
        setStep('connected');
      } else if (data.connection?.status === 'qr_pending') {
        setStep('qr');
        fetchQR();
      } else {
        setStep('select');
        setIsCheckingExisting(true);
        await checkExisting();
        setIsCheckingExisting(false);
      }
    } catch {
      setStep('select');
      setIsCheckingExisting(true);
      await checkExisting();
      setIsCheckingExisting(false);
    }
  };

  const handleSelectType = async (type) => {
    clearError();
    if (type === 'managed') {
      try {
        const data = await connectManaged();
        if (data.connection?.status === 'connected') {
          setStep('connected');
        } else {
          setStep('qr');
          fetchQR();
        }
      } catch (err) {
        if (err.response?.data?.code === 'PAYMENT_REQUIRED') {
          setPendingConnectionType('managed');
          setShowPaymentModal(true);
        }
      }
    } else {
      setStep('external');
    }
  };

  const handlePaymentSuccess = async () => {
    setShowPaymentModal(false);
    if (pendingConnectionType === 'managed') {
      try {
        const data = await connectManaged();
        if (data.connection?.status === 'connected') {
          setStep('connected');
        } else {
          setStep('qr');
          fetchQR();
        }
      } catch {}
    }
    setPendingConnectionType(null);
  };

  const handleExternalConnect = async (e) => {
    e.preventDefault();
    clearError();
    try {
      const data = await connectExternal(externalForm.baseUrl, externalForm.apiKey, externalForm.sessionName);
      if (data.connection?.status === 'connected') {
        setStep('connected');
      } else if (data.connection?.status === 'qr_pending') {
        setStep('qr');
        fetchQR();
      } else {
        setStep('qr');
        fetchQR();
      }
    } catch {}
  };

  const handleDisconnect = async () => {
    clearError();
    try {
      await disconnect();
      setStep('select');
      setIsCheckingExisting(true);
      await checkExisting();
      setIsCheckingExisting(false);
    } catch {}
  };

  const handleDelete = async () => {
    if (!confirm('האם אתה בטוח שברצונך למחוק את החיבור? פעולה זו לא ניתנת לביטול.')) return;
    clearError();
    try {
      await deleteConnection();
      setStep('select');
      setIsCheckingExisting(true);
      await checkExisting();
      setIsCheckingExisting(false);
    } catch {}
  };

  const handleRefreshQR = async () => {
    try {
      const data = await fetchStatus();
      if (data.connection?.status === 'connected') {
        setStep('connected');
      } else {
        await fetchQR();
      }
    } catch {}
  };

  const copyWebhook = () => {
    navigator.clipboard.writeText(`${window.location.origin}/api/webhook/waha`);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50" dir="rtl">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => navigate('/dashboard')}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="h-8 w-px bg-gray-200" />
              <Logo />
            </div>
            <div className="flex items-center gap-3">
              {isAdmin && (
                <button
                  onClick={() => navigate('/admin')}
                  className="p-2 hover:bg-red-50 rounded-xl transition-colors group"
                  title="ממשק ניהול"
                >
                  <Shield className="w-5 h-5 text-red-500 group-hover:text-red-600" />
                </button>
              )}
              <NotificationsDropdown />
              <div className="h-8 w-px bg-gray-200" />
              <AccountSwitcher />
              <button 
                onClick={() => { logout(); navigate('/login'); }}
                className="hidden md:block px-4 py-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-xl text-sm font-medium transition-colors"
              >
                התנתק
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        {/* Hero Section */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg">
            <MessageCircle className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">חיבור WhatsApp</h1>
          <p className="text-gray-500">חבר את WhatsApp שלך כדי להתחיל לקבל ולשלוח הודעות</p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
            <button onClick={clearError} className="mr-auto">
              <XCircle className="w-5 h-5 hover:text-red-900" />
            </button>
          </div>
        )}

        {/* Main Card */}
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
          
          {/* Loading State */}
          {step === 'loading' && (
            <div className="p-12 text-center">
              <Loader2 className="w-12 h-12 text-green-500 animate-spin mx-auto mb-4" />
              <p className="text-gray-500">בודק סטטוס חיבור...</p>
            </div>
          )}

          {/* Select Connection Type */}
          {step === 'select' && (
            <div className="p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">התחברות ל-WhatsApp</h2>
              <p className="text-gray-500 text-center mb-8">סרוק קוד QR וחבר את WhatsApp שלך בשניות</p>
              
              {/* Existing Session Alert - only show if exists AND connected */}
              {existingSession?.exists && existingSession?.isConnected && (
                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-2xl">
                  <div className="flex items-center gap-3 text-blue-700">
                    <Wifi className="w-5 h-5" />
                    <div>
                      <p className="font-medium">נמצא חיבור קיים!</p>
                      <p className="text-sm text-blue-600">יש לך סשן מחובר ל-WhatsApp. לחץ על "התחבר עכשיו" להתחבר אוטומטית.</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {/* Main Connect Button */}
                <button
                  onClick={() => handleSelectType('managed')}
                  disabled={isLoading}
                  className="w-full p-6 bg-gradient-to-r from-green-50 to-emerald-50 hover:from-green-100 hover:to-emerald-100 border-2 border-green-200 hover:border-green-300 rounded-2xl text-right transition-all group disabled:opacity-50"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                      <Smartphone className="w-7 h-7 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-bold text-gray-900">התחבר עכשיו</h3>
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded-full">מומלץ</span>
                      </div>
                      <p className="text-gray-500 text-sm mb-3">סרוק קוד QR והתחבר תוך שניות. אנחנו מנהלים הכל.</p>
                      <div className="flex items-center gap-4 text-xs text-gray-400">
                        <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> מהיר</span>
                        <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> מאובטח</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> ללא הגדרות</span>
                      </div>
                    </div>
                    <ChevronLeft className="w-5 h-5 text-gray-400 group-hover:text-green-500 transition-colors" />
                  </div>
                </button>

                {/* Advanced Options Toggle - External WAHA */}
                <div className="pt-4">
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center justify-center gap-2 w-full text-gray-400 hover:text-gray-600 text-sm py-2"
                  >
                    <Settings className="w-4 h-4" />
                    יש לי שרת WAHA משלי
                    <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {showAdvanced && (
                    <div className="mt-4">
                      {/* External Option */}
                      <button
                        onClick={() => handleSelectType('external')}
                        disabled={isLoading}
                        className="w-full p-6 bg-gray-50 hover:bg-gray-100 border-2 border-gray-200 hover:border-gray-300 rounded-2xl text-right transition-all group disabled:opacity-50"
                      >
                        <div className="flex items-start gap-4">
                          <div className="w-14 h-14 bg-gradient-to-br from-gray-500 to-slate-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                            <Server className="w-7 h-7 text-white" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-lg font-bold text-gray-900">שרת WAHA חיצוני</h3>
                              <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs font-bold rounded-full">מתקדם</span>
                            </div>
                            <p className="text-gray-500 text-sm mb-3">חבר את שרת ה-WAHA שלך. שליטה מלאה על התשתית.</p>
                            <div className="flex items-center gap-4 text-xs text-gray-400">
                              <span className="flex items-center gap-1"><Settings className="w-3 h-3" /> הגדרות מתקדמות</span>
                              <span className="flex items-center gap-1"><Server className="w-3 h-3" /> שרת משלך</span>
                            </div>
                          </div>
                          <ChevronLeft className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              </div>
              
              {isCheckingExisting && (
                <p className="text-center text-sm text-gray-400 mt-4 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  בודק חיבורים קיימים...
                </p>
              )}
            </div>
          )}

          {/* External Connection Form */}
          {step === 'external' && (
            <div className="p-8">
              <button
                onClick={() => setStep('select')}
                className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6"
              >
                <ArrowLeft className="w-4 h-4 rotate-180" />
                חזרה
              </button>
              
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-gray-500 to-slate-600 rounded-xl flex items-center justify-center">
                  <Server className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">חיבור שרת חיצוני</h2>
                  <p className="text-gray-500 text-sm">הזן את פרטי ה-WAHA שלך</p>
                </div>
              </div>
              
              <form onSubmit={handleExternalConnect} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">כתובת WAHA (Base URL)</label>
                  <input
                    type="url"
                    value={externalForm.baseUrl}
                    onChange={(e) => setExternalForm({ ...externalForm, baseUrl: e.target.value })}
                    placeholder="https://waha.example.com"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500/30 focus:border-green-400 transition-all"
                    dir="ltr"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">API Key (אופציונלי)</label>
                  <input
                    type="text"
                    value={externalForm.apiKey}
                    onChange={(e) => setExternalForm({ ...externalForm, apiKey: e.target.value })}
                    placeholder="your-api-key"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500/30 focus:border-green-400 transition-all"
                    dir="ltr"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">שם הסשן</label>
                  <input
                    type="text"
                    value={externalForm.sessionName}
                    onChange={(e) => setExternalForm({ ...externalForm, sessionName: e.target.value })}
                    placeholder="default"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500/30 focus:border-green-400 transition-all"
                    dir="ltr"
                    required
                  />
                </div>

                {/* Webhook Info */}
                <div className="p-4 bg-green-50 rounded-xl border border-green-200">
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle className="w-5 h-5" />
                    <p className="text-sm font-medium">Webhook יוגדר אוטומטית</p>
                  </div>
                  <p className="text-xs text-green-600 mt-1 mr-7">לאחר החיבור, המערכת תגדיר את ה-Webhook בשרת שלך אוטומטית</p>
                </div>
                
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      מתחבר...
                    </>
                  ) : (
                    <>
                      <Wifi className="w-5 h-5" />
                      התחבר
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* QR Code / Pairing Code Display */}
          {step === 'qr' && (
            <div className="p-8">
              {/* Auth Method Toggle */}
              <div className="flex gap-2 mb-6 p-1 bg-gray-100 rounded-xl">
                <button
                  onClick={() => { setAuthMethod('qr'); setPairingCode(null); }}
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
                    {qrCode ? (
                      <div className="relative">
                        <img 
                          src={qrCode} 
                          alt="QR Code" 
                          className="w-64 h-64"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-white/80 opacity-0 hover:opacity-100 transition-opacity rounded-lg">
                          <button
                            onClick={handleRefreshQR}
                            className="p-3 bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors"
                          >
                            <RefreshCw className="w-6 h-6" />
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
                  
                  {/* Tips */}
                  <div className="bg-gray-50 rounded-xl p-4 mb-6">
                    <p className="text-sm text-gray-600 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500" />
                      אם הקוד פג תוקף, לחץ על כפתור הריענון. הקוד בתוקף למשך כ-60 שניות.
                    </p>
                  </div>
                  
                  <div className="flex gap-3">
                    <button
                      onClick={handleRefreshQR}
                      disabled={isLoading}
                      className="flex-1 py-3 border-2 border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
                      רענן קוד
                    </button>
                    <button
                      onClick={handleDisconnect}
                      className="flex-1 py-3 border-2 border-red-200 text-red-600 rounded-xl font-medium hover:bg-red-50 transition-colors"
                    >
                      ביטול
                    </button>
                  </div>
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
                      
                      <button
                        onClick={async () => {
                          if (!phoneNumber.trim()) return;
                          setCodeRequesting(true);
                          try {
                            const data = await requestPairingCode(phoneNumber);
                            if (data.code) {
                              setPairingCode(data.code);
                            }
                          } catch (err) {
                            console.error(err);
                          }
                          setCodeRequesting(false);
                        }}
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
                      
                      <div className="bg-gray-50 rounded-xl p-4">
                        <h3 className="font-medium text-gray-900 mb-2">איך להזין את הקוד?</h3>
                        <ol className="text-sm text-gray-600 text-right space-y-1">
                          <li>1. פתח את WhatsApp בטלפון</li>
                          <li>2. לך להגדרות &gt; מכשירים מקושרים</li>
                          <li>3. לחץ על "קשר מכשיר"</li>
                          <li>4. לחץ על "קשר עם מספר טלפון במקום"</li>
                          <li>5. הזן את הקוד שמופיע למעלה</li>
                        </ol>
                      </div>
                      
                      <button
                        onClick={() => setPairingCode(null)}
                        className="text-blue-600 hover:text-blue-700 font-medium text-sm"
                      >
                        קבל קוד חדש
                      </button>
                    </div>
                  )}
                  
                  <div className="mt-6 pt-6 border-t border-gray-100">
                    <button
                      onClick={handleDisconnect}
                      className="w-full py-3 border-2 border-red-200 text-red-600 rounded-xl font-medium hover:bg-red-50 transition-colors"
                    >
                      ביטול
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Connected State */}
          {step === 'connected' && (
            <div className="p-8">
              {/* Success Header */}
              <div className="text-center mb-8">
                <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <CheckCircle className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">WhatsApp מחובר!</h2>
                <p className="text-gray-500">החיבור פעיל ומוכן לשימוש</p>
              </div>
              
              {/* Connection Details */}
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-6 mb-6 border border-green-200">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-white rounded-xl">
                    <Phone className="w-6 h-6 text-green-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">מספר טלפון</p>
                    <p className="font-bold text-gray-900">{connection?.phone_number || 'לא זמין'}</p>
                  </div>
                  <div className="text-center p-4 bg-white rounded-xl">
                    <Wifi className="w-6 h-6 text-green-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">סטטוס</p>
                    <p className="font-bold text-green-600 flex items-center justify-center gap-1">
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      מחובר
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Actions */}
              <div className="space-y-3">
                <Link
                  to="/dashboard"
                  className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold hover:shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  המשך לדשבורד
                  <ChevronLeft className="w-5 h-5" />
                </Link>
                
                <div className="flex gap-3">
                  <button
                    onClick={handleDisconnect}
                    disabled={isLoading}
                    className="flex-1 py-3 border-2 border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <WifiOff className="w-5 h-5" />
                    נתק
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={isLoading}
                    className="flex-1 py-3 border-2 border-red-200 text-red-600 rounded-xl font-medium hover:bg-red-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Trash2 className="w-5 h-5" />
                    מחק חיבור
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Help Section */}
        <div className="mt-8 p-6 bg-white rounded-2xl border border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <HelpCircle className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">צריכים עזרה?</p>
              <p className="text-sm text-gray-500">אנחנו כאן בשבילכם</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <a 
              href="https://wa.me/972584254229"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-500 text-white rounded-xl font-medium hover:bg-green-600 transition-colors"
            >
              <MessageCircle className="w-5 h-5" />
              וואטסאפ
            </a>
            <a 
              href="mailto:office@neriyabudraham.co.il"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
            >
              <Mail className="w-5 h-5" />
              אימייל
            </a>
          </div>
        </div>
      </main>

      {/* Payment Required Modal */}
      <PaymentRequiredModal
        isOpen={showPaymentModal}
        onClose={() => {
          setShowPaymentModal(false);
          setPendingConnectionType(null);
        }}
        onSuccess={handlePaymentSuccess}
        title="14 ימי ניסיון חינם"
        features={[
          '14 ימי ניסיון חינם',
          'לא תחויב עכשיו',
          'ביטול בכל עת',
        ]}
      />
    </div>
  );
}
