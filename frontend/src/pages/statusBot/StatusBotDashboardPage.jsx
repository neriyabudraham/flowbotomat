import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Smartphone, Upload, Clock, Users, ArrowLeft, RefreshCw,
  Check, Plus, Trash2, Eye, Heart, MessageCircle, Image,
  Video, Mic, Type, Palette, Send, AlertCircle, X, Loader,
  QrCode, Wifi, WifiOff, Phone, ChevronDown, List, ChevronLeft,
  Loader2, Shield, Zap, HelpCircle, Mail, Home, Settings
} from 'lucide-react';
import useAuthStore from '../../store/authStore';
import useWhatsappStore from '../../store/whatsappStore';
import Logo from '../../components/atoms/Logo';
import api from '../../services/api';

const BOT_NUMBER = '+972 53-923-2960';

export default function StatusBotDashboardPage() {
  const navigate = useNavigate();
  const { user, fetchMe } = useAuthStore();
  const { connection: mainConnection, fetchStatus: fetchMainStatus } = useWhatsappStore();
  
  // State
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState('loading'); // loading, select, qr, connected, dashboard
  const [connection, setConnection] = useState(null);
  const [existingSession, setExistingSession] = useState(null);
  const [isCheckingExisting, setIsCheckingExisting] = useState(false);
  const [authorizedNumbers, setAuthorizedNumbers] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [queue, setQueue] = useState([]);
  const [activeTab, setActiveTab] = useState('upload'); // upload, history, numbers
  const [qrCode, setQrCode] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Upload form state
  const [statusType, setStatusType] = useState('text');
  const [textContent, setTextContent] = useState('');
  const [backgroundColor, setBackgroundColor] = useState('#38b42f');
  const [mediaUrl, setMediaUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  
  // Add number modal
  const [showAddNumber, setShowAddNumber] = useState(false);
  const [newNumber, setNewNumber] = useState('');
  const [newNumberName, setNewNumberName] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/login?redirect=/status-bot/dashboard');
      return;
    }
    
    fetchMe();
    fetchMainStatus(); // Check main WhatsApp connection
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      setStep('loading');
      const { data } = await api.get('/status-bot/connection');
      
      if (data.connection?.connection_status === 'connected') {
        setConnection(data.connection);
        setStep('dashboard');
        loadDashboardData();
      } else if (data.connection?.connection_status === 'qr_pending') {
        setConnection(data.connection);
        setStep('qr');
        fetchQR();
      } else {
        // Check if main WhatsApp is already connected - if so, auto-connect
        const existingRes = await api.get('/status-bot/check-existing');
        if (existingRes.data.exists && existingRes.data.isConnected) {
          // Main WhatsApp is connected - auto connect to Status Bot
          console.log('[StatusBot] Main WhatsApp connected, auto-connecting...');
          await handleConnect();
        } else {
          setStep('select');
          setExistingSession(existingRes.data);
        }
      }
    } catch (err) {
      console.error('Check status error:', err);
      setStep('select');
      setIsCheckingExisting(true);
      await checkExisting();
      setIsCheckingExisting(false);
    } finally {
      setLoading(false);
    }
  };

  const checkExisting = async () => {
    try {
      const { data } = await api.get('/status-bot/check-existing');
      setExistingSession(data);
      return data;
    } catch (err) {
      setExistingSession({ exists: false });
      return { exists: false };
    }
  };

  const loadDashboardData = async () => {
    try {
      const [numbersRes, historyRes, queueRes] = await Promise.all([
        api.get('/status-bot/authorized-numbers'),
        api.get('/status-bot/history?limit=20'),
        api.get('/status-bot/queue'),
      ]);
      
      setAuthorizedNumbers(numbersRes.data.numbers || []);
      setStatuses(historyRes.data.statuses || []);
      setQueue(queueRes.data.queue || []);
    } catch (err) {
      console.error('Load dashboard data error:', err);
    }
  };

  const handleConnect = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const { data } = await api.post('/status-bot/connect');
      setConnection(data.connection);
      
      if (data.connection?.connection_status === 'connected') {
        setStep('dashboard');
        loadDashboardData();
      } else {
        setStep('qr');
        fetchQR();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בחיבור');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchQR = async () => {
    try {
      const { data } = await api.get('/status-bot/qr');
      
      if (data.status === 'connected') {
        // Get connection details
        const connRes = await api.get('/status-bot/connection');
        setConnection(connRes.data.connection);
        setStep('dashboard');
        loadDashboardData();
        return;
      }
      
      if (data.status === 'need_connect') {
        // Session doesn't exist - trigger connection
        console.log('[StatusBot] Session not found, triggering connection...');
        await handleConnect();
        return;
      }
      
      if (data.status === 'not_started') {
        setError(data.message);
        setStep('select');
        return;
      }
      
      if (data.qr) {
        setQrCode(data.qr);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בקבלת QR');
    }
  };

  const handleRefreshQR = async () => {
    try {
      const { data } = await api.get('/status-bot/connection');
      if (data.connection?.connection_status === 'connected') {
        setConnection(data.connection);
        setStep('dashboard');
        loadDashboardData();
      } else {
        await fetchQR();
      }
    } catch (err) {
      console.error('Refresh QR error:', err);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('האם לנתק את החיבור?')) return;
    setIsLoading(true);
    try {
      await api.post('/status-bot/disconnect');
      setConnection(null);
      setStep('select');
      setIsCheckingExisting(true);
      await checkExisting();
      setIsCheckingExisting(false);
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בניתוק');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadStatus = async () => {
    if (statusType === 'text' && !textContent.trim()) {
      alert('נא להזין טקסט');
      return;
    }
    if (statusType !== 'text' && !mediaUrl.trim()) {
      alert('נא להזין URL של קובץ');
      return;
    }

    setUploading(true);
    try {
      let endpoint;
      let body;

      switch (statusType) {
        case 'text':
          endpoint = '/status-bot/status/text';
          body = { text: textContent, backgroundColor };
          break;
        case 'image':
          endpoint = '/status-bot/status/image';
          body = { url: mediaUrl, caption };
          break;
        case 'video':
          endpoint = '/status-bot/status/video';
          body = { url: mediaUrl, caption };
          break;
        case 'voice':
          endpoint = '/status-bot/status/voice';
          body = { url: mediaUrl, backgroundColor };
          break;
      }

      await api.post(endpoint, body);
      
      // Reset form
      setTextContent('');
      setMediaUrl('');
      setCaption('');
      
      loadDashboardData();
      alert('הסטטוס נוסף לתור!');
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בהעלאת סטטוס');
    } finally {
      setUploading(false);
    }
  };

  const handleAddNumber = async () => {
    if (!newNumber.trim()) return;
    
    try {
      await api.post('/status-bot/authorized-numbers', {
        phoneNumber: newNumber,
        name: newNumberName || null
      });
      
      setNewNumber('');
      setNewNumberName('');
      setShowAddNumber(false);
      loadDashboardData();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בהוספת מספר');
    }
  };

  const handleRemoveNumber = async (numberId) => {
    if (!confirm('האם להסיר את המספר?')) return;
    try {
      await api.delete(`/status-bot/authorized-numbers/${numberId}`);
      loadDashboardData();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה במחיקת מספר');
    }
  };

  const handleDeleteStatus = async (statusId) => {
    if (!confirm('האם למחוק את הסטטוס?')) return;
    try {
      await api.delete(`/status-bot/status/${statusId}`);
      loadDashboardData();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה במחיקת סטטוס');
    }
  };

  const isConnected = connection?.connection_status === 'connected';
  const isRestricted = connection?.isRestricted;

  const clearError = () => setError(null);

  // Loading screen
  if (step === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-green-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-500">בודק סטטוס חיבור...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-green-50" dir="rtl">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Logo />
              <div className="hidden md:block h-8 w-px bg-gray-200" />
              <div className="hidden md:flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
                  <Upload className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-gray-800">בוט העלאת סטטוסים</span>
                <span className="px-2 py-0.5 bg-teal-100 text-teal-700 text-xs font-bold rounded-full">Pro</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Link 
                to="/dashboard"
                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all text-sm font-medium"
              >
                <Home className="w-4 h-4" />
                <span className="hidden sm:inline">דשבורד</span>
              </Link>
              <Link 
                to="/settings"
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
              >
                <Settings className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Connection Flow (select, qr) */}
      {(step === 'select' || step === 'qr') && (
        <main className="max-w-2xl mx-auto px-6 py-12">
          {/* Hero Section */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg">
              <Upload className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">בוט העלאת סטטוסים</h1>
            <p className="text-gray-500">חבר את WhatsApp שלך כדי להתחיל להעלות סטטוסים</p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-700">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
              <button onClick={clearError} className="mr-auto">
                <X className="w-5 h-5 hover:text-red-900" />
              </button>
            </div>
          )}

          {/* Main Card */}
          <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
            
            {/* Select Connection */}
            {step === 'select' && (
              <div className="p-8">
                <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">התחברות ל-WhatsApp</h2>
                <p className="text-gray-500 text-center mb-8">סרוק קוד QR וחבר את WhatsApp שלך בשניות</p>
                
                {/* Existing Session Alert */}
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
                    onClick={handleConnect}
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
                </div>
                
                {isCheckingExisting && (
                  <p className="text-center text-sm text-gray-400 mt-4 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    בודק חיבורים קיימים...
                  </p>
                )}
              </div>
            )}

            {/* QR Code Display */}
            {step === 'qr' && (
              <div className="p-8">
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
      )}

      {/* Dashboard (when connected) */}
      {step === 'dashboard' && (
        <main className="max-w-7xl mx-auto px-6 py-8">
          {/* Restriction Banner */}
          {isRestricted && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-amber-800">תקופת המתנה פעילה</p>
                <p className="text-sm text-amber-600">
                  יש להמתין 24 שעות מרגע החיבור הראשון לפני שניתן להעלות סטטוסים.
                  {connection?.restrictionEndsAt && (
                    <span className="font-medium mr-1">
                      סיום: {new Date(connection.restrictionEndsAt).toLocaleString('he-IL')}
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Connection Status */}
          <div className="mb-6">
            <div className="p-4 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-white">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <Wifi className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="font-bold text-lg">WhatsApp מחובר</h2>
                    {connection?.phone_number && (
                      <p className="text-white/80 flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        <span dir="ltr">+{connection.phone_number}</span>
                      </p>
                    )}
                  </div>
                </div>
                
                <button
                  onClick={handleDisconnect}
                  className="px-4 py-2 bg-white/20 text-white rounded-xl hover:bg-white/30 transition-colors"
                >
                  נתק
                </button>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard
              icon={Upload}
              label="בתור"
              value={queue.length}
              color="blue"
            />
            <StatCard
              icon={Check}
              label="נשלחו היום"
              value={statuses.filter(s => {
                const sent = new Date(s.sent_at);
                const today = new Date();
                return sent.toDateString() === today.toDateString();
              }).length}
              color="green"
            />
            <StatCard
              icon={Eye}
              label="צפיות היום"
              value={statuses.reduce((sum, s) => sum + (s.view_count || 0), 0)}
              color="purple"
            />
            <StatCard
              icon={Heart}
              label="לבבות היום"
              value={statuses.reduce((sum, s) => sum + (s.reaction_count || 0), 0)}
              color="red"
            />
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            <TabButton 
              active={activeTab === 'upload'} 
              onClick={() => setActiveTab('upload')}
              icon={Upload}
              label="העלאת סטטוס"
            />
            <TabButton 
              active={activeTab === 'history'} 
              onClick={() => setActiveTab('history')}
              icon={List}
              label="היסטוריה"
            />
            <TabButton 
              active={activeTab === 'numbers'} 
              onClick={() => setActiveTab('numbers')}
              icon={Users}
              label="מספרים מורשים"
            />
          </div>

          {/* Tab Content */}
          {activeTab === 'upload' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">העלאת סטטוס חדש</h3>
              
              {isRestricted ? (
                <div className="text-center py-8 text-gray-500">
                  <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>יש להמתין לסיום תקופת ההמתנה</p>
                </div>
              ) : (
                <>
                  {/* Status Type Selector */}
                  <div className="flex gap-2 mb-6">
                    <TypeButton 
                      active={statusType === 'text'} 
                      onClick={() => setStatusType('text')}
                      icon={Type}
                      label="טקסט"
                    />
                    <TypeButton 
                      active={statusType === 'image'} 
                      onClick={() => setStatusType('image')}
                      icon={Image}
                      label="תמונה"
                    />
                    <TypeButton 
                      active={statusType === 'video'} 
                      onClick={() => setStatusType('video')}
                      icon={Video}
                      label="וידאו"
                    />
                    <TypeButton 
                      active={statusType === 'voice'} 
                      onClick={() => setStatusType('voice')}
                      icon={Mic}
                      label="שמע"
                    />
                  </div>

                  {/* Form based on type */}
                  {statusType === 'text' ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">טקסט</label>
                        <textarea
                          value={textContent}
                          onChange={(e) => setTextContent(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          rows={4}
                          placeholder="הקלד את הטקסט לסטטוס..."
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">צבע רקע</label>
                        <div className="flex items-center gap-3">
                          <input
                            type="color"
                            value={backgroundColor}
                            onChange={(e) => setBackgroundColor(e.target.value)}
                            className="w-12 h-12 rounded-xl cursor-pointer border-2 border-gray-200"
                          />
                          <div className="flex gap-2">
                            {['#38b42f', '#0088cc', '#8e44ad', '#e74c3c', '#f39c12', '#2c3e50'].map(color => (
                              <button
                                key={color}
                                onClick={() => setBackgroundColor(color)}
                                className={`w-8 h-8 rounded-lg ${backgroundColor === color ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`}
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          URL של {statusType === 'image' ? 'תמונה' : statusType === 'video' ? 'וידאו' : 'קובץ שמע'}
                        </label>
                        <input
                          type="url"
                          value={mediaUrl}
                          onChange={(e) => setMediaUrl(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          placeholder="https://..."
                          dir="ltr"
                        />
                        <p className="text-xs text-gray-500 mt-1">גודל מקסימלי: 100MB</p>
                      </div>
                      
                      {(statusType === 'image' || statusType === 'video') && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">כיתוב (אופציונלי)</label>
                          <input
                            type="text"
                            value={caption}
                            onChange={(e) => setCaption(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                            placeholder="כיתוב לסטטוס..."
                          />
                        </div>
                      )}

                      {statusType === 'voice' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">צבע רקע</label>
                          <input
                            type="color"
                            value={backgroundColor}
                            onChange={(e) => setBackgroundColor(e.target.value)}
                            className="w-12 h-12 rounded-xl cursor-pointer border-2 border-gray-200"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    onClick={handleUploadStatus}
                    disabled={uploading}
                    className="w-full mt-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {uploading ? (
                      <>
                        <Loader className="w-5 h-5 animate-spin" />
                        שולח...
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        הוסף לתור
                      </>
                    )}
                  </button>

                  {queue.length > 0 && (
                    <div className="mt-4 p-3 bg-blue-50 rounded-xl text-blue-700 text-sm">
                      יש {queue.length} סטטוסים בתור. הסטטוס יישלח בהקדם.
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-bold text-gray-800">היסטוריית סטטוסים</h3>
              </div>
              
              {statuses.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Upload className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>עדיין לא העלית סטטוסים</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {statuses.map(status => (
                    <StatusRow 
                      key={status.id} 
                      status={status}
                      onDelete={() => handleDeleteStatus(status.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'numbers' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-800">מספרים מורשים</h3>
                <button
                  onClick={() => setShowAddNumber(true)}
                  className="px-4 py-2 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  הוסף מספר
                </button>
              </div>

              <p className="text-gray-600 mb-4">
                רק מספרים אלה יוכלו לשלוח סטטוסים דרך הבוט בווצאפ
              </p>

              {authorizedNumbers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>לא הוגדרו מספרים מורשים</p>
                  <p className="text-sm">הוסף מספרים שיוכלו להעלות סטטוסים</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {authorizedNumbers.map(num => (
                    <div 
                      key={num.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                          <Phone className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-800" dir="ltr">+{num.phone_number}</p>
                          {num.name && <p className="text-sm text-gray-500">{num.name}</p>}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveNumber(num.id)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Bot Info */}
              <div className="mt-6 p-4 bg-green-50 rounded-xl border border-green-200">
                <p className="text-sm text-green-800 mb-2">
                  <strong>מספר הבוט:</strong> <span dir="ltr">{BOT_NUMBER}</span>
                </p>
                <p className="text-sm text-green-700">
                  שלח הודעה, תמונה או סרטון לבוט כדי להעלות סטטוס
                </p>
              </div>
            </div>
          )}

          {/* Add Number Modal */}
          {showAddNumber && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddNumber(false)}>
              <div 
                className="bg-white rounded-2xl w-full max-w-md p-6"
                onClick={e => e.stopPropagation()}
              >
                <h3 className="text-lg font-bold text-gray-800 mb-4">הוספת מספר מורשה</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">מספר טלפון</label>
                    <input
                      type="tel"
                      value={newNumber}
                      onChange={(e) => setNewNumber(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl"
                      placeholder="972501234567"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">שם (אופציונלי)</label>
                    <input
                      type="text"
                      value={newNumberName}
                      onChange={(e) => setNewNumberName(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl"
                      placeholder="שם לזיהוי"
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setShowAddNumber(false)}
                    className="flex-1 py-3 border border-gray-200 rounded-xl font-medium hover:bg-gray-50"
                  >
                    ביטול
                  </button>
                  <button
                    onClick={handleAddNumber}
                    className="flex-1 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700"
                  >
                    הוסף
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      )}
    </div>
  );
}

// Sub-components
function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    blue: 'from-blue-500 to-indigo-600',
    green: 'from-green-500 to-emerald-600',
    purple: 'from-purple-500 to-pink-600',
    red: 'from-red-500 to-rose-600',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${colors[color]} flex items-center justify-center`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-sm text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-xl font-medium flex items-center gap-2 whitespace-nowrap transition-colors ${
        active 
          ? 'bg-green-600 text-white' 
          : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

function TypeButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-3 rounded-xl font-medium flex flex-col items-center gap-1 transition-colors ${
        active 
          ? 'bg-green-100 text-green-700 border-2 border-green-500' 
          : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border-2 border-transparent'
      }`}
    >
      <Icon className="w-5 h-5" />
      <span className="text-sm">{label}</span>
    </button>
  );
}

function StatusRow({ status, onDelete }) {
  const typeIcons = {
    text: Type,
    image: Image,
    video: Video,
    voice: Mic,
  };
  const Icon = typeIcons[status.status_type] || Type;

  return (
    <div className="p-4 flex items-center justify-between hover:bg-gray-50">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
          <Icon className="w-5 h-5 text-gray-600" />
        </div>
        <div>
          <p className="font-medium text-gray-800">
            {status.status_type === 'text' 
              ? (status.content?.text?.substring(0, 50) + '...' || 'סטטוס טקסט')
              : `סטטוס ${status.status_type}`
            }
          </p>
          <p className="text-sm text-gray-500">
            {new Date(status.sent_at).toLocaleString('he-IL')}
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span className="flex items-center gap-1">
            <Eye className="w-4 h-4" />
            {status.view_count || 0}
          </span>
          <span className="flex items-center gap-1">
            <Heart className="w-4 h-4" />
            {status.reaction_count || 0}
          </span>
        </div>
        <button
          onClick={onDelete}
          className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
